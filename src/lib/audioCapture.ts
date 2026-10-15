export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const output = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(output);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return output;
}

export async function audioBlobTo16kWav(blob: Blob): Promise<ArrayBuffer> {
  const AudioContextClass = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error('当前浏览器不支持音频解码');

  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const sampleRate = 16000;
    const frameCount = Math.max(1, Math.ceil(decoded.duration * sampleRate));
    const offline = new OfflineAudioContext(1, frameCount, sampleRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeWav(rendered.getChannelData(0), sampleRate);
  } finally {
    await context.close();
  }
}

function preferredMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
}

export async function requestWebMicrophoneStream(
  timeoutMs = 15_000,
  signal?: AbortSignal,
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('当前浏览器不支持麦克风录音');
  }
  if (signal?.aborted) throw new Error('已取消麦克风录音');

  const request = navigator.mediaDevices.getUserMedia({ audio: true });
  return await new Promise<MediaStream>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('已取消麦克风录音'));
    };
    const timer = setTimeout(() => {
      settled = true;
      cleanup();
      reject(new Error('等待麦克风授权超时，请在浏览器权限中允许麦克风后重试'));
    }, timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });

    void request.then((stream) => {
      if (settled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      settled = true;
      cleanup();
      resolve(stream);
    }).catch((error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        reject(new Error('麦克风权限未开启，请在浏览器权限中选择允许'));
        return;
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        reject(new Error('未检测到可用麦克风，请连接设备后重试'));
        return;
      }
      reject(error);
    });
  });
}

export async function startWebAudioRecording(
  onStopped: (blob: Blob) => Promise<void>,
  onFailure: (error: unknown) => void,
  signal?: AbortSignal,
): Promise<MediaRecorder> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('当前浏览器不支持麦克风录音');
  }

  const stream = await requestWebMicrophoneStream(15_000, signal);
  try {
    const mimeType = preferredMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = (event) => onFailure(event);
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      void onStopped(blob).catch(onFailure);
    };
    recorder.start(250);
    return recorder;
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
}

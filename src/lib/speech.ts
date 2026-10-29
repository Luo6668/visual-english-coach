import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { isLocalServiceMode } from '@/lib/serviceConfig';

let webUtterance: SpeechSynthesisUtterance | null = null;
let webAudio: HTMLAudioElement | null = null;
let activeNativePlayer: AudioPlayer | null = null;
let activeNativeSubscription: { remove: () => void } | null = null;
let playbackGeneration = 0;
let playbackPaused = false;

type AudioPlayer = {
  replace: (source: { uri: string }) => void | Promise<void>;
  play: () => void;
  pause?: () => void;
  setPlaybackRate?: (rate: number, pitchCorrectionQuality?: 'low' | 'medium' | 'high') => void;
  addListener?: (
    event: 'playbackStatusUpdate',
    listener: (status: { didJustFinish?: boolean }) => void,
  ) => { remove: () => void };
};

type TtsInvoker = (name: string, body: unknown) => Promise<any>;

type SpeechOptions = {
  rate?: number;
  onStart?: () => void;
};

function normalizeSpeechRate(rate?: number): number {
  return Math.min(1.25, Math.max(0.7, rate ?? 1));
}

function speechLanguage(text: string): string {
  const chinese = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const letters = (text.match(/[a-z]/gi) || []).length;
  return letters > 0 && letters >= chinese * 2 ? 'en-US' : 'zh-CN';
}

export function stopLocalSpeech(): void {
  playbackGeneration += 1;
  playbackPaused = false;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.speechSynthesis?.cancel();
    webUtterance = null;
    if (webAudio) {
      webAudio.pause();
      webAudio.removeAttribute('src');
      webAudio.remove();
      webAudio = null;
    }
  }
  activeNativePlayer?.pause?.();
  activeNativePlayer = null;
  activeNativeSubscription?.remove();
  activeNativeSubscription = null;
  void Speech.stop().catch(() => {});
}

export function pauseLocalSpeech(): void {
  playbackPaused = true;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.speechSynthesis?.pause();
    webAudio?.pause();
  }
  activeNativePlayer?.pause?.();
  void Speech.pause().catch(() => {});
}

export function resumeLocalSpeech(): void {
  playbackPaused = false;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.speechSynthesis?.resume();
    if (webAudio) void webAudio.play().catch(() => {});
  }
  activeNativePlayer?.play();
  void Speech.resume().catch(() => {});
}

export function cleanSpeechText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*#>`_•]/g, ' ')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickWebVoice(language: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const prefix = language.slice(0, 2).toLowerCase();
  const preferredNames = prefix === 'en'
    ? ['Samantha', 'Ava', 'Google US English', 'Microsoft Aria', 'Daniel', 'Karen']
    : ['Tingting', 'Meijia', 'Google 普通话', 'Microsoft Xiaoxiao'];
  const languageVoices = prefix === 'zh'
    ? voices.filter((voice) => /^(zh-cn|zh-sg|zh-hans)/i.test(voice.lang))
    : voices.filter((voice) => voice.lang.toLowerCase().startsWith(prefix));
  return preferredNames
    .map((name) => languageVoices.find((voice) => voice.name.includes(name)))
    .find(Boolean)
    || languageVoices.find((voice) => voice.lang.toLowerCase() === language.toLowerCase() && voice.localService)
    || languageVoices.find((voice) => voice.localService)
    || languageVoices[0]
    || null;
}

function speakInBrowser(text: string, finish: () => void, generation: number, rate: number): void {
  const language = speechLanguage(text);
  let started = false;
  const start = () => {
    if (started || generation !== playbackGeneration) return;
    started = true;
    const utterance = new SpeechSynthesisUtterance(text);
    webUtterance = utterance;
    utterance.lang = language;
    utterance.voice = pickWebVoice(language);
    console.log('[TTS] local voice:', utterance.voice?.name || 'system default', utterance.voice?.lang || language);
    utterance.rate = rate;
    utterance.pitch = language.startsWith('en') ? 0.98 : 1;
    utterance.volume = 1;
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
    if (playbackPaused) window.speechSynthesis.pause();
  };

  if (window.speechSynthesis.getVoices().length) {
    start();
    return;
  }
  window.speechSynthesis.addEventListener('voiceschanged', start, { once: true });
  setTimeout(start, 500);
}

export function speakLocally(
  text: string,
  onDone: () => void = () => {},
  options: SpeechOptions = {},
): void {
  stopLocalSpeech();
  const generation = playbackGeneration;
  let finished = false;
  const finish = () => {
    if (finished || generation !== playbackGeneration) return;
    finished = true;
    onDone();
  };

  const cleanText = cleanSpeechText(text);
  if (!cleanText) return finish();
  const rate = normalizeSpeechRate(options.rate);

  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    speakInBrowser(cleanText, finish, generation, rate);
    return;
  }

  Speech.speak(cleanText, {
    language: speechLanguage(cleanText),
    rate,
    onDone: finish,
    onStopped: finish,
    onError: finish,
  });
  if (playbackPaused) void Speech.pause().catch(() => {});
}

export async function speakWithTTS(
  text: string,
  player: AudioPlayer,
  invoke: TtsInvoker,
  onDone: () => void = () => {},
  options: SpeechOptions = {},
): Promise<void> {
  const cleanText = cleanSpeechText(text);
  if (!cleanText) {
    onDone();
    return;
  }

  stopLocalSpeech();
  const rate = normalizeSpeechRate(options.rate);
  const generation = playbackGeneration;
  let finished = false;
  const finish = () => {
    if (finished || generation !== playbackGeneration) return;
    finished = true;
    if (webAudio) {
      webAudio.remove();
      webAudio = null;
    }
    activeNativePlayer = null;
    activeNativeSubscription?.remove();
    activeNativeSubscription = null;
    playbackPaused = false;
    onDone();
  };

  try {
    const result = await invoke(isLocalServiceMode ? 'local-tts' : 'tts-minimax', isLocalServiceMode
      ? { text: cleanText }
      : { text: cleanText, voice_id: 'Wise_Woman', speed: 0.9 });
    if (generation !== playbackGeneration) return;
    const audioUri = result?.audioUrl || result?.audioData;
    if (!audioUri) throw new Error('TTS 服务未返回音频');

    console.log('[TTS] voice:', result?.voice || (isLocalServiceMode ? 'Kokoro' : 'MiniMax'));
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const audio = document.createElement('audio');
      webAudio = audio;
      audio.src = audioUri;
      audio.preload = 'auto';
      audio.playbackRate = rate;
      audio.volume = 1;
      audio.muted = false;
      audio.onended = finish;
      audio.onerror = finish;
      document.body.appendChild(audio);
      if (!playbackPaused) {
        try {
          await audio.play();
          options.onStart?.();
        } catch (playError) {
          audio.remove();
          webAudio = null;
          throw playError;
        }
      }
      return;
    }

    await player.replace({ uri: audioUri });
    if (generation !== playbackGeneration) return;
    player.setPlaybackRate?.(rate, 'high');
    activeNativePlayer = player;
    activeNativeSubscription = player.addListener?.('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) finish();
    }) ?? null;
    if (!playbackPaused) player.play();
    options.onStart?.();
    if (!activeNativeSubscription) {
      setTimeout(finish, (result?.audioLength ?? cleanText.length * 85) + 500);
    }
  } catch (error) {
    if (generation !== playbackGeneration) return;
    console.warn('[TTS] preferred voice unavailable, using system voice:', error);
    const startPaused = playbackPaused;
    options.onStart?.();
    speakLocally(cleanText, onDone, { rate });
    if (startPaused) pauseLocalSpeech();
  }
}

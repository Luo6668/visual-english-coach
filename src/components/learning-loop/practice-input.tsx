import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Text, TextInput, View } from 'react-native';
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { Mic, Square } from 'lucide-react-native';
import { MotionPressable } from '@/components/motion-pressable';
import { arrayBufferToBase64, audioBlobTo16kWav, startWebAudioRecording } from '@/lib/audioCapture';
import { invokeEdgeFunction } from '@/lib/api';
import { stopLocalSpeech } from '@/lib/speech';

/** Separate recording lifecycle for retry/review; never sends a main chat message. */
export function PracticeInput({ value, onChange, disabled = false, onBusyChange }: {
  value: string; onChange: (text: string, method: 'typed' | 'voice') => void; disabled?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
  const [state, setState] = useState<'idle' | 'requesting' | 'recording' | 'recognizing'>('idle');
  const [error, setError] = useState('');
  const operation = useRef(0);
  const lock = useRef(false);
  const stopping = useRef(false);
  const busyChange = useRef(onBusyChange); busyChange.current = onBusyChange;
  useEffect(() => { busyChange.current?.(state !== 'idle'); }, [state]);
  const webRecorder = useRef<MediaRecorder | null>(null);
  const permission = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorder = useAudioRecorder({ extension: '.m4a', sampleRate: 16000, numberOfChannels: 1, bitRate: 64000,
    android: { outputFormat: 'aac_adts', audioEncoder: 'aac', sampleRate: 16000 },
    ios: { extension: '.m4a', outputFormat: 'aac', audioQuality: 96, sampleRate: 16000 },
    web: { mimeType: 'audio/webm', bitsPerSecond: 64000 } });
  const change = useRef(onChange); change.current = onChange;
  useEffect(() => () => {
    operation.current++; permission.current?.abort(); busyChange.current?.(false);
    if (timer.current) clearTimeout(timer.current);
    if (webRecorder.current?.state === 'recording') webRecorder.current.stop();
    if (Platform.OS !== 'web') void recorder.stop().catch(() => {});
  }, []);
  const recognize = async (id: number, blob?: Blob) => {
    if (id !== operation.current) return;
    if (timer.current) clearTimeout(timer.current);
    setState('recognizing');
    try {
      let speech: string; let len: number;
      if (blob) {
        if (blob.size < 200) throw new Error('录音太短，请再试一次');
        const wav = await audioBlobTo16kWav(blob); speech = arrayBufferToBase64(wav); len = wav.byteLength;
      } else {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (!recorder.uri) throw new Error('没有生成录音文件');
        const { File } = await import('expo-file-system');
        speech = await new File(recorder.uri).base64(); len = Math.floor(speech.length * 0.75);
      }
      if (id !== operation.current) return;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let result;
      try {
        result = await Promise.race([
          invokeEdgeFunction('short-speech-recognition', { speech, len, format: blob ? 'wav' : 'm4a', rate: 16000, language: 'en', cuid: 'learning-loop' }),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('语音识别超时，可以重录或改用文字')), 30000); }),
        ]);
      } finally { if (timeout) clearTimeout(timeout); }
      if (id !== operation.current) return;
      const text = String(result?.result?.[0] || '').replace(/\[(?:blank_audio|silence|music|noise)\]/gi, '').trim();
      if (!/[a-z]/i.test(text)) throw new Error('没有识别到英语，请重录或改用文字');
      change.current(text, 'voice');
    } catch (e) { if (id === operation.current) setError(e instanceof Error ? e.message : '识别失败，请重录'); }
    finally { if (id === operation.current) { lock.current = false; stopping.current = false; setState('idle'); } }
  };
  const finish = (id: number) => {
    if (id !== operation.current || stopping.current) return;
    stopping.current = true;
    setState('recognizing');
    if (webRecorder.current?.state === 'recording') webRecorder.current.stop();
    else if (Platform.OS !== 'web') void recognize(id);
  };
  const mic = async () => {
    if (state === 'recording') { finish(operation.current); return; }
    if (lock.current || disabled) return;
    lock.current = true;
    stopping.current = false;
    const id = ++operation.current;
    setError(''); setState('requesting'); stopLocalSpeech();
    try {
      if (Platform.OS === 'web') {
        const controller = new AbortController(); permission.current = controller;
        const recording = await startWebAudioRecording(blob => recognize(id, blob), () => {
          if (id === operation.current) { setError('录音失败，请重试'); setState('idle'); lock.current = false; }
        }, controller.signal);
        if (id !== operation.current) { recording.stop(); return; }
        webRecorder.current = recording;
      } else {
        const grant = await requestRecordingPermissionsAsync();
        if (id !== operation.current) return;
        if (!grant.granted) throw new Error('请允许麦克风权限，或使用文字练习');
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        if (id !== operation.current) return;
        recorder.record();
      }
      setState('recording'); timer.current = setTimeout(() => finish(id), 60000);
    } catch (e) { if (id === operation.current) { setError(e instanceof Error ? e.message : '麦克风暂不可用'); setState('idle'); lock.current = false; } }
  };
  const cancel = () => {
    operation.current++; permission.current?.abort(); if (timer.current) clearTimeout(timer.current);
    if (webRecorder.current?.state === 'recording') webRecorder.current.stop();
    if (Platform.OS !== 'web') void recorder.stop().then(() => setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })).catch(() => {});
    lock.current = false; stopping.current = false; setState('idle'); setError('');
  };
  return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <TextInput accessibilityLabel="本次练习表达" placeholder="先自己说一遍，也可以输入英语" value={value} editable={!disabled && state === 'idle'} onChangeText={text => onChange(text, 'typed')} multiline style={{ flex: 1, minHeight: 48, maxHeight: 120, borderRadius: 14, padding: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D5E6FC', color: '#16365B', fontSize: 15 }} />
      <MotionPressable accessibilityRole="button" accessibilityLabel={state === 'recording' ? '停止练习录音' : '录音练这句'} disabled={disabled || state === 'requesting' || state === 'recognizing'} onPress={() => void mic()} style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: state === 'recording' ? '#FEE2E2' : '#DDEEFF' }}>
        {state === 'requesting' || state === 'recognizing' ? <ActivityIndicator color="#1478EF" /> : state === 'recording' ? <Square size={18} color="#DC2626" /> : <Mic size={20} color="#1478EF" />}
      </MotionPressable>
    </View>
    {state !== 'idle' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text accessibilityLiveRegion="polite" style={{ flex: 1, color: '#64748B', fontSize: 12 }}>{state === 'requesting' ? '等待麦克风授权' : state === 'recording' ? '录音中，点击停止；最长 60 秒' : '正在识别，完成后可修改文字'}</Text><MotionPressable accessibilityRole="button" accessibilityLabel="取消练习录音" onPress={cancel}><Text style={{ color: '#1478EF', padding: 8 }}>取消</Text></MotionPressable></View> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: '#B45309', fontSize: 12 }}>{error}</Text> : null}
  </View>;
}

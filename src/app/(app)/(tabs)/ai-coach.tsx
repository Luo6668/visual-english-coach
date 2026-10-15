import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer, useAudioRecorder,
} from 'expo-audio';
import { Image } from 'expo-image';
import { Tabs, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Check, ChevronLeft, Mic, Pause, Play, RotateCcw,
  Settings, Volume2, X,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable, Text, View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { supabase } from '@/client/supabase';
import { addXp, recordActivity } from '@/lib/api';
import { requestWebMicrophoneStream } from '@/lib/audioCapture';
import { functionsBaseUrl, functionUrl, publicServiceKey } from '@/lib/serviceConfig';
import {
  pauseLocalSpeech,
  resumeLocalSpeech,
  speakWithTTS,
  stopLocalSpeech,
} from '@/lib/speech';

// ── 颜色 ────────────────────────────────────────────────
const BLUE       = '#2563EB';
const WHITE      = '#FFFFFF';
const GRAY_TEXT  = '#64748B';
const PRACTICE_SENTENCE = 'The dog is cute.';

/** 直接 fetch 调 Edge Function */
async function callEdgeFn(name: string, body: unknown, token?: string): Promise<any> {
  console.log('[callEdgeFn] calling', name);
  const authKey = token ? `Bearer ${token}` : `Bearer ${publicServiceKey}`;
  const res = await fetch(functionUrl(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authKey,
      apikey: publicServiceKey,
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : `${name} HTTP ${res.status}`);
  }
  return payload;
}

/** ArrayBuffer → base64 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Web: webm Blob → 16kHz 单声道 WAV ArrayBuffer */
async function convertWebmToWav(webmBlob: Blob): Promise<ArrayBuffer> {
  const arrayBuf = await webmBlob.arrayBuffer();
  const audioCtx = new AudioContext({ sampleRate: 16000 });
  const decoded  = await audioCtx.decodeAudioData(arrayBuf);
  const pcm      = decoded.getChannelData(0);
  await audioCtx.close();
  const wav = new ArrayBuffer(44 + pcm.length * 2);
  const v   = new DataView(wav);
  const str = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return wav;
}

// ── 消息类型 ─────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

function cleanMessageMarkup(content: string) {
  return content
    .replace(/\*\*/g, '')
    .replace(/^#{1,3}\s*/gm, '')
    .trim();
}

// ── 打字动画（三个圆点）────────────────────────────────
function TypingDots() {
  const d0 = useSharedValue(0);
  const d1 = useSharedValue(0);
  const d2 = useSharedValue(0);
  useEffect(() => {
    setTimeout(() => {
      d0.value = withRepeat(withSequence(withTiming(1, { duration: 300 }), withTiming(0, { duration: 300 })), -1, false);
    }, 0);
    setTimeout(() => {
      d1.value = withRepeat(withSequence(withTiming(1, { duration: 300 }), withTiming(0, { duration: 300 })), -1, false);
    }, 200);
    setTimeout(() => {
      d2.value = withRepeat(withSequence(withTiming(1, { duration: 300 }), withTiming(0, { duration: 300 })), -1, false);
    }, 400);
  }, []);
  const s0 = useAnimatedStyle(() => ({ opacity: 0.3 + d0.value * 0.7, transform: [{ translateY: -d0.value * 4 }] }));
  const s1 = useAnimatedStyle(() => ({ opacity: 0.3 + d1.value * 0.7, transform: [{ translateY: -d1.value * 4 }] }));
  const s2 = useAnimatedStyle(() => ({ opacity: 0.3 + d2.value * 0.7, transform: [{ translateY: -d2.value * 4 }] }));
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 4 }}>
      {[s0, s1, s2].map((style, i) => (
        <Animated.View key={i} style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: GRAY_TEXT }, style]} />
      ))}
    </View>
  );
}

// ── 消息气泡（含朗读按钮）────────────────────────────────
function MessageBubble({
  msg, pausedId, speakingId, onSpeak,
}: {
  msg: Message;
  pausedId: string | null;
  speakingId: string | null;
  onSpeak: (id: string, text: string, rate?: number, restart?: boolean) => void;
}) {
  const isUser = msg.role === 'user';
  const isSpeaking = speakingId === msg.id;
  const isPaused = pausedId === msg.id;
  const displayContent = isUser ? msg.content : cleanMessageMarkup(msg.content);
  return (
    <View style={{
      flexDirection: 'row', justifyContent: isUser ? 'flex-end' : 'flex-start',
      paddingHorizontal: 18, paddingVertical: 6,
    }}>
      {!isUser && (
        <Image
          source={require('../../../../assets/coach-avatar.png')}
          style={{ width: 42, height: 42, borderRadius: 21, marginRight: 9, marginTop: 2, backgroundColor: '#DDEBFF', flexShrink: 0 }}
          contentFit="cover"
        />
      )}
      <View style={{ maxWidth: isUser ? '76%' : '82%' }}>
        {isUser ? (
          <View style={{ borderRadius: 17, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: '#DFEAFC' }}>
            <Text style={{ fontSize: 15, color: '#1D58AE', lineHeight: 22, fontWeight: '600' }}>{displayContent}</Text>
          </View>
        ) : (
          <View style={{
            backgroundColor: '#F0F4FC', borderRadius: 18, borderTopLeftRadius: 7,
            paddingHorizontal: 16, paddingVertical: 12,
          }}>
            {msg.streaming && msg.content === '' ? (
              <TypingDots />
            ) : (
              <Text style={{ fontSize: 15, color: '#1E293B', lineHeight: 24 }}>
                {displayContent}
                {msg.streaming && <Text style={{ color: BLUE }}>▌</Text>}
              </Text>
            )}
            {!msg.streaming && msg.content !== '' && (
              <Pressable
                onPress={() => onSpeak(msg.id, msg.content)}
                className="active:opacity-60"
                style={{
                  marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 5,
                  alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6,
                  borderRadius: 16, backgroundColor: isSpeaking ? '#D4E5FF' : '#FFFFFF',
                }}
              >
                {isSpeaking
                  ? isPaused
                    ? <Play size={13} color={BLUE} />
                    : <Pause size={13} color={BLUE} />
                  : <Volume2 size={13} color={GRAY_TEXT} />}
                <Text style={{ fontSize: 11, color: isSpeaking ? BLUE : GRAY_TEXT, fontWeight: '600' }}>
                  {isPaused ? '继续' : isSpeaking ? '暂停' : '朗读'}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
      {isUser && (
        <View style={{
          width: 34, height: 34, borderRadius: 17, backgroundColor: '#DBEAFE',
          alignItems: 'center', justifyContent: 'center',
          marginLeft: 8, marginTop: 2, flexShrink: 0,
        }}>
          <Text style={{ fontSize: 12, color: BLUE, fontWeight: '900' }}>我</Text>
        </View>
      )}
    </View>
  );
}

function CoachAction({ label, active = false, icon: Icon, onPress }: {
  label: string;
  active?: boolean;
  icon: typeof Volume2;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 46,
        borderRadius: 23,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        backgroundColor: active ? '#D4E5FF' : '#E7F0FF',
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Icon size={18} color="#0868F2" fill={Icon === Play ? '#0868F2' : 'transparent'} />
      <Text style={{ fontSize: 13, fontWeight: '800', color: '#0868F2' }}>{label}</Text>
    </Pressable>
  );
}

function GuidedPractice({
  speakingId,
  pausedId,
  speakingRate,
  onSpeak,
}: {
  speakingId: string | null;
  pausedId: string | null;
  speakingRate: number;
  onSpeak: (id: string, text: string, rate?: number, restart?: boolean) => void;
}) {
  const speaking = speakingId === 'guided';
  const paused = pausedId === 'guided';
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <Image
          source={require('../../../../assets/coach-avatar.png')}
          style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: '#DDEBFF' }}
          contentFit="cover"
        />
        <View style={{ flex: 1, borderRadius: 20, borderTopLeftRadius: 8, backgroundColor: '#F0F4FC', paddingHorizontal: 18, paddingVertical: 13 }}>
          <Text style={{ color: '#203153', fontSize: 17, lineHeight: 25, fontWeight: '500' }}>Great! Let&apos;s describe this picture together.</Text>
          <Text style={{ color: '#203153', fontSize: 17, lineHeight: 25, marginTop: 2 }}>You can say: <Text style={{ color: '#0868F2', fontWeight: '800' }}>“The dog is cute.”</Text></Text>
          <Text style={{ color: '#68758C', fontSize: 14, lineHeight: 21, marginTop: 3 }}>试着跟读这句话吧！</Text>
        </View>
      </View>

      <Image
        source={require('../../../../assets/coach-dog-scene.png')}
        style={{ width: 244, height: 132, borderRadius: 12, alignSelf: 'center', marginTop: 14, backgroundColor: '#E5E7EB' }}
        contentFit="cover"
      />

      <View style={{ alignItems: 'flex-end', marginTop: 16 }}>
        <View style={{ borderRadius: 18, borderBottomRightRadius: 7, backgroundColor: '#DFEAFC', paddingHorizontal: 20, paddingVertical: 12 }}>
          <Text style={{ color: '#1D58AE', fontSize: 17, fontWeight: '600' }}>{PRACTICE_SENTENCE}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12 }}>
        <Image
          source={require('../../../../assets/coach-avatar.png')}
          style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#DDEBFF' }}
          contentFit="cover"
        />
        <View style={{ flex: 1, borderRadius: 20, borderTopLeftRadius: 8, backgroundColor: '#F0F4FC', paddingHorizontal: 18, paddingVertical: 12 }}>
          <Text style={{ color: '#34405A', fontSize: 14, lineHeight: 20 }}>Nice try! A small correction:</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Text style={{ flex: 1, color: '#142241', fontSize: 19, lineHeight: 27, fontWeight: '800' }}>The dog <Text style={{ color: '#0B9B68', textDecorationLine: 'underline' }}>is</Text> cute.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="朗读纠正句子" onPress={() => onSpeak('guided', PRACTICE_SENTENCE)} style={({ pressed }) => ({ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.55 : 1 })}>
              {speaking && !paused ? <Pause size={23} color="#0868F2" fill="#0868F2" /> : <Volume2 size={24} color="#0868F2" fill="#0868F2" />}
            </Pressable>
          </View>
          <Text style={{ color: '#68758C', fontSize: 13, lineHeight: 19, marginTop: 2 }}>发音很清晰！注意 is 的发音更轻一些。</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <CoachAction label={speaking && speakingRate === 1 ? (paused ? '继续' : '暂停') : '朗读'} active={speaking && speakingRate === 1} icon={speaking && speakingRate === 1 ? (paused ? Play : Pause) : Volume2} onPress={() => onSpeak('guided', PRACTICE_SENTENCE)} />
        <CoachAction label="慢速" active={speaking && speakingRate === 0.8} icon={Play} onPress={() => onSpeak('guided', PRACTICE_SENTENCE, 0.8, true)} />
        <CoachAction label="再说一次" icon={RotateCcw} onPress={() => onSpeak('guided', PRACTICE_SENTENCE, 1, true)} />
      </View>
    </View>
  );
}

function RecordingPanel({ seconds, state, streaming, onCancel, onPrimary, onFinish }: {
  seconds: number;
  state: 'idle' | 'requesting' | 'recording' | 'recognizing';
  streaming: boolean;
  onCancel: () => void;
  onPrimary: () => void;
  onFinish: () => void;
}) {
  const formatted = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const listening = state === 'recording';
  const busy = state === 'requesting' || state === 'recognizing' || streaming;
  const status = streaming
    ? 'AI 正在回复'
    : state === 'recognizing'
      ? '正在识别'
      : state === 'requesting'
        ? '等待麦克风授权'
        : listening
          ? '正在聆听'
          : '点击麦克风开始';
  return (
    <View style={{ marginHorizontal: 16, marginTop: 14, marginBottom: 16, minHeight: 218, borderRadius: 20, borderWidth: 1, borderColor: '#DFE5EE', backgroundColor: '#FFFFFF', paddingHorizontal: 22, paddingTop: 15, paddingBottom: 14 }}>
      <Text style={{ textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#64748B' }}>{formatted}</Text>
      <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        {[4, 7, 10, 13, 9, 15, 18, 22, 16, 12, 20, 30, 17, 13, 10, 18, 14, 11, 8, 5, 7, 4].map((height, index) => (
          <View key={`${height}-${index}`} style={{ width: 2, height: listening ? height : Math.max(3, height * 0.32), borderRadius: 2, backgroundColor: '#1473F7' }} />
        ))}
      </View>
      <Text style={{ textAlign: 'center', fontSize: 14, color: '#69758A', marginBottom: 13 }}>{status}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="取消录音" onPress={onCancel} disabled={!listening} style={({ pressed }) => ({ width: 78, alignItems: 'center', gap: 7, opacity: !listening ? 0.58 : pressed ? 0.55 : 1 })}>
          <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF1F5' }}>
            <X size={24} color="#344055" />
          </View>
          <Text style={{ fontSize: 13, color: '#526077', fontWeight: '600' }}>取消</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={listening ? '正在录音' : '开始录音'} onPress={onPrimary} disabled={busy} style={({ pressed }) => ({ width: 84, alignItems: 'center', opacity: busy ? 0.55 : pressed ? 0.72 : 1 })}>
          <View style={{ width: 78, height: 78, borderRadius: 39, borderWidth: 9, borderColor: '#BFD8FF', backgroundColor: '#126EF5', alignItems: 'center', justifyContent: 'center' }}>
            <Mic size={32} color="#FFFFFF" strokeWidth={2.4} />
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="松开发送" onPress={onFinish} disabled={!listening} style={({ pressed }) => ({ width: 78, alignItems: 'center', gap: 7, opacity: !listening ? 0.58 : pressed ? 0.55 : 1 })}>
          <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF1F5' }}>
            <Check size={24} color="#526077" />
          </View>
          <Text style={{ fontSize: 13, color: '#526077', fontWeight: '600' }}>松开发送</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── 主屏 ─────────────────────────────────────────────────
export default function AiCoachScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ prompt?: string | string[] }>();
  const [messages, setMessages]   = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [pausedId, setPausedId]   = useState<string | null>(null);
  const [speakingRate, setSpeakingRate] = useState(1);
  const [micState, setMicState]   = useState<'idle' | 'requesting' | 'recording' | 'recognizing'>('idle');
  const [micError, setMicError]   = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const conversationRecordedRef = useRef(false);
  const handledPromptRef = useRef<string | null>(null);
  const player      = useAudioPlayer();
  const recorder    = useAudioRecorder({
    extension: '.m4a', sampleRate: 16000, numberOfChannels: 1, bitRate: 64000,
    android: { outputFormat: 'aac_adts', audioEncoder: 'aac', sampleRate: 16000 },
    ios: { extension: '.m4a', outputFormat: 'aac', audioQuality: 96, sampleRate: 16000 },
    web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
  });
  const mrRef     = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingCancelledRef = useRef(false);

  // supabase url/key 从 useFocusEffect 里读取（保留原有模式）
  const [supabaseUrl, setSupabaseUrl] = useState(functionsBaseUrl);
  const [supabaseKey, setSupabaseKey] = useState(publicServiceKey);

  useFocusEffect(useCallback(() => {
    setSupabaseUrl(functionsBaseUrl);
    setSupabaseKey(publicServiceKey);
    return () => {
      stopLocalSpeech();
      setSpeakingId(null);
      setPausedId(null);
    };
  }, []));

  useEffect(() => {
    if (micState !== 'recording') {
      if (micState === 'idle') setRecordingSeconds(0);
      return;
    }
    const timer = setInterval(() => setRecordingSeconds((previous) => previous + 1), 1000);
    return () => clearInterval(timer);
  }, [micState]);

  const scrollToBottom = () =>
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);

  // ── 朗读 ──
  const handleSpeak = (id: string, text: string, rate = 1, restart = false) => {
    if (speakingId === id && speakingRate === rate && !restart) {
      if (pausedId === id) {
        resumeLocalSpeech();
        setPausedId(null);
      } else {
        pauseLocalSpeech();
        setPausedId(id);
      }
      return;
    }
    if (speakingId !== null) stopLocalSpeech();
    setPausedId(null);
    setSpeakingId(id);
    setSpeakingRate(rate);
    speakWithTTS(text, player, callEdgeFn, () => {
      setSpeakingId(null);
      setPausedId(null);
    }, { rate });
  };

  // ── STT 识别并填入输入框（webm→wav转换后发送）──
  const recognizeAndFill = async (webmBlob: Blob | null, m4aBase64?: string, m4aLen?: number) => {
    setMicState('recognizing');
    setMicError('');
    try {
      let speech: string; let len: number; let fmt: string;
      if (process.env.EXPO_OS === 'web' && webmBlob) {
        console.log('[STT] converting webm→wav, blob size=', webmBlob.size);
        const wavBuf = await convertWebmToWav(webmBlob);
        speech = arrayBufferToBase64(wavBuf);
        len    = wavBuf.byteLength;
        fmt    = 'wav';
      } else {
        speech = m4aBase64 ?? ''; len = m4aLen ?? 0; fmt = 'm4a';
      }
      if (!speech || len <= 0) {
        setMicError('没有录到有效声音，请重新录制。');
        return;
      }
      console.log('[STT] sending fmt=', fmt, 'len=', len);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await callEdgeFn('short-speech-recognition', {
        speech, len, format: fmt, rate: 16000, cuid: 'ai-coach',
      }, session?.access_token);
      console.log('[STT] result:', JSON.stringify(res).slice(0, 120));
      const text: string = res?.result?.[0] ?? '';
      if (text) {
        void sendMessage(text);
      } else {
        setMicError('未识别到语音内容，请靠近麦克风后重试。');
      }
    } catch (e) {
      console.warn('[STT] 识别失败:', e);
      setMicError(e instanceof Error ? e.message : '语音识别失败，请稍后重试。');
    }
    finally { setMicState('idle'); }
  };

  // ── 麦克风 ──
  const handleMicPress = async () => {
    console.log('[MIC] pressed, micState=', micState, 'EXPO_OS=', process.env.EXPO_OS);
    setMicError('');
    if (process.env.EXPO_OS === 'web') {
      if (micState === 'recording') {
        mrRef.current?.stop();
      } else if (micState === 'idle') {
        setMicState('requesting');
        try {
          const stream = await requestWebMicrophoneStream();
          const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus' : 'audio/webm';
          const mr = new MediaRecorder(stream, { mimeType: mime });
          chunksRef.current = [];
          mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
          mr.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            if (recordingCancelledRef.current) {
              recordingCancelledRef.current = false;
              chunksRef.current = [];
              setMicState('idle');
              return;
            }
            const blob = new Blob(chunksRef.current, { type: mime });
            console.log('[MIC] onstop blob size=', blob.size);
            if (blob.size < 200) {
              setMicError('录音时间太短，请重新录制。');
              setMicState('idle');
              return;
            }
            await recognizeAndFill(blob);
          };
          recordingCancelledRef.current = false;
          mr.start(250);
          mrRef.current = mr;
          setMicState('recording');
          console.log('[MIC] MediaRecorder started');
        } catch (e) {
          console.warn('[MIC] getUserMedia 失败:', e);
          setMicError(e instanceof Error ? e.message : '无法使用麦克风，请允许浏览器访问麦克风后重试。');
          setMicState('idle');
        }
      }
    } else {
      if (micState === 'recording') {
        await recorder.stop();
        const uri = recorder.uri ?? '';
        if (!uri) {
          setMicError('没有生成录音文件，请重新录制。');
          setMicState('idle');
          return;
        }
        const FileSystem = await import('expo-file-system');
        const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        await recognizeAndFill(null, b64, Math.round(b64.length * 0.75));
      } else if (micState === 'idle') {
        setMicState('requesting');
        try {
          const perm = await requestRecordingPermissionsAsync();
          if (!perm.granted) {
            setMicError('麦克风权限未开启，请在系统设置中允许访问。');
            setMicState('idle');
            return;
          }
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
          await recorder.prepareToRecordAsync();
          recorder.record();
          setMicState('recording');
        } catch (e) {
          console.warn('[MIC] native 录音失败:', e);
          setMicError('无法启动麦克风，请检查权限后重试。');
          setMicState('idle');
        }
      }
    }
  };

  const handleCancelRecording = async () => {
    setMicError('');
    recordingCancelledRef.current = true;
    if (process.env.EXPO_OS === 'web') {
      if (mrRef.current?.state === 'recording') mrRef.current.stop();
      else setMicState('idle');
      return;
    }
    try {
      await recorder.stop();
    } catch {
      // The recorder may already be stopping.
    }
    setMicState('idle');
  };

  // ── 发送消息（流式）──
  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: trimmed };
    const aiId = (Date.now() + 1).toString();
    const aiMsg: Message = { id: aiId, role: 'assistant', content: '', streaming: true };
    setMessages(prev => [...prev, userMsg, aiMsg]);
    setStreaming(true);
    scrollToBottom();
    try {
      const history = [...messages.filter(m => m.id !== 'welcome'), userMsg].map(m => ({
        role: m.role, content: m.content,
      }));
      abortRef.current = new AbortController();
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session?.access_token
        ? `Bearer ${session.access_token}`
        : `Bearer ${supabaseKey}`;
      const res = await fetch(`${supabaseUrl}/ai-coach-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader, apikey: supabaseKey },
        body: JSON.stringify({ messages: history }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(typeof payload?.error === 'string' ? payload.error : `AI 服务异常 (${res.status})`);
      }
      if (!res.body) throw new Error('No response body');
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', accumulated = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              accumulated += delta;
              const snap = accumulated;
              setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: snap } : m));
            }
          } catch { /* ignore */ }
        }
      }
      if (!accumulated.trim()) throw new Error('AI 未返回有效内容');
      setMessages(prev => prev.map(m => m.id === aiId ? { ...m, streaming: false } : m));
      if (accumulated && !conversationRecordedRef.current) {
        conversationRecordedRef.current = true;
        Promise.allSettled([
          addXp(`dialogue_ai_coach_${Date.now()}`),
          recordActivity('dialogue'),
        ]).catch(() => {});
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setMessages(prev => prev.filter(m => m.id !== aiId));
        return;
      }
      const detail = e instanceof Error ? e.message : '';
      const errorText = detail.includes('Failed to fetch')
        ? '无法连接本地 AI 服务，请确认项目服务已启动后重试。'
        : `AI 教练暂时无法回复：${detail || '请稍后重试。'}`;
      setMessages(prev => prev.map(m =>
        m.id === aiId ? { ...m, content: errorText, streaming: false } : m
      ));
    } finally {
      abortRef.current = null;
      setStreaming(false);
      scrollToBottom();
    }
  };

  useEffect(() => {
    const prompt = Array.isArray(params.prompt) ? params.prompt[0] : params.prompt;
    if (!prompt || handledPromptRef.current === prompt) return;
    handledPromptRef.current = prompt;
    void sendMessage(prompt);
  }, [params.prompt]);

  return (
    <View style={{ flex: 1, backgroundColor: '#F2F5F9', alignItems: 'center' }}>
      <Tabs.Screen options={{ tabBarStyle: { display: 'none' } }} />
      <StatusBar style="dark" backgroundColor={WHITE} />
      <View style={{ width: '100%', maxWidth: 480, flex: 1, backgroundColor: WHITE }}>
        <View style={{
          backgroundColor: WHITE, paddingTop: 48, paddingBottom: 9,
          paddingHorizontal: 14, minHeight: 96, flexDirection: 'row', alignItems: 'center',
        }}>
          <View style={{ width: 72, flexDirection: 'row', alignItems: 'center' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={({ pressed }) => ({ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
              <ChevronLeft size={27} color="#0B1834" strokeWidth={2.4} />
            </Pressable>
          </View>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 19, fontWeight: '900', color: '#0B1834' }}>AI Coach</Text>
          <View style={{ width: 72, alignItems: 'flex-end', justifyContent: 'center' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="打开设置" onPress={() => router.push('/(app)/settings' as any)} style={({ pressed }) => ({ width: 34, height: 42, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
              <Settings size={21} color="#0B1834" strokeWidth={2.3} />
            </Pressable>
          </View>
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => (
            <MessageBubble msg={item} pausedId={pausedId} speakingId={speakingId} onSpeak={handleSpeak} />
          )}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 4 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            if (messages.length > 0) scrollToBottom();
          }}
          ListHeaderComponent={messages.length === 0 ? (
            <GuidedPractice
              speakingId={speakingId}
              pausedId={pausedId}
              speakingRate={speakingRate}
              onSpeak={handleSpeak}
            />
          ) : null}
          ListFooterComponent={
            <View>
              {micError ? (
                <View style={{ marginHorizontal: 16, marginTop: 10, borderRadius: 12, backgroundColor: '#FEF2F2', paddingHorizontal: 14, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 12, lineHeight: 18, color: '#B91C1C' }}>{micError}</Text>
                </View>
              ) : null}
              <RecordingPanel
                seconds={recordingSeconds}
                state={micState}
                streaming={streaming}
                onCancel={handleCancelRecording}
                onPrimary={handleMicPress}
                onFinish={handleMicPress}
              />
              <Text style={{ fontSize: 10, color: '#CBD5E1', textAlign: 'center', marginTop: -8, marginBottom: 12 }}>
                AI 生成内容仅用于英语练习
              </Text>
              {streaming ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="停止 AI 回复"
                  onPress={() => abortRef.current?.abort()}
                  style={({ pressed }) => ({
                    alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6,
                    marginBottom: 14, paddingHorizontal: 14, paddingVertical: 8,
                    borderRadius: 18, backgroundColor: '#FEE2E2', opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <RotateCcw size={14} color="#B91C1C" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#B91C1C' }}>停止回复</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      </View>
    </View>
  );
}

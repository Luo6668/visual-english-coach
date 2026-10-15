import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer, useAudioRecorder,
} from 'expo-audio';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Check, ChevronDown, ChevronLeft, Mic, Pause, Play, Plus,
  RotateCcw, Send, Settings, Volume2, X,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable,
  Text, TextInput, View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { supabase } from '@/client/supabase';
import { addXp, recordActivity } from '@/lib/api';
import {
  arrayBufferToBase64,
  audioBlobTo16kWav,
  startWebAudioRecording,
} from '@/lib/audioCapture';
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
const MAX_RECORDING_SECONDS = 60;

/** 直接 fetch 调 Edge Function */
async function callEdgeFn(
  name: string,
  body: unknown,
  token?: string,
  signal?: AbortSignal,
): Promise<any> {
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
    signal,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : `${name} HTTP ${res.status}`);
  }
  return payload;
}

// ── 消息类型 ─────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

const STARTERS = [
  { emoji: '☕', text: '咖啡馆点单怎么说？' },
  { emoji: '💼', text: '帮我练习英语自我介绍' },
  { emoji: '✈️', text: '机场登机英语对话' },
  { emoji: '🗣️', text: '纠正我的英语表达' },
];

function cleanMessageMarkup(content: string) {
  return content
    .replace(/\*\*/g, '')
    .replace(/^#{1,3}\s*/gm, '')
    .trim();
}

function cleanRecognizedText(value: unknown) {
  return String(value || '')
    .replace(/[([](?:speaking in foreign language|blank audio|music|noise|silence|applause)[)\]]/gi, ' ')
    .replace(/^\s*[-–—:]+\s*/, '')
    .replace(/\s+/g, ' ')
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
  msg, pausedId, speakingId, speakingRate, showControls, onSpeak,
}: {
  msg: Message;
  pausedId: string | null;
  speakingId: string | null;
  speakingRate: number;
  showControls: boolean;
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
          </View>
        )}
        {!isUser && showControls && !msg.streaming && msg.content !== '' ? (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            <CoachAction
              label={isSpeaking && speakingRate === 1 ? (isPaused ? '继续' : '暂停') : '朗读'}
              active={isSpeaking && speakingRate === 1}
              icon={isSpeaking && speakingRate === 1 ? (isPaused ? Play : Pause) : Volume2}
              onPress={() => onSpeak(msg.id, msg.content)}
            />
            <CoachAction
              label="慢速"
              active={isSpeaking && speakingRate === 0.8}
              icon={Play}
              onPress={() => onSpeak(msg.id, msg.content, 0.8, true)}
            />
            <CoachAction
              label="再说一次"
              icon={RotateCcw}
              onPress={() => onSpeak(msg.id, msg.content, 1, true)}
            />
          </View>
        ) : null}
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
        minHeight: 40,
        borderRadius: 20,
        paddingHorizontal: 6,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        backgroundColor: active ? '#D4E5FF' : '#E7F0FF',
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Icon size={15} color="#0868F2" fill={Icon === Play ? '#0868F2' : 'transparent'} />
      <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '800', color: '#0868F2' }}>{label}</Text>
    </Pressable>
  );
}

function RecordingPanel({ seconds, state, onCancel, onPrimary, onFinish }: {
  seconds: number;
  state: 'idle' | 'requesting' | 'recording' | 'recognizing';
  onCancel: () => void;
  onPrimary: () => void;
  onFinish: () => void;
}) {
  const formatted = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const listening = state === 'recording';
  const busy = state === 'requesting' || state === 'recognizing';
  const cancellable = state !== 'idle';
  const status = state === 'recognizing'
    ? '正在识别语音'
    : state === 'requesting'
      ? '等待麦克风授权'
      : listening
        ? `正在聆听，最长 ${MAX_RECORDING_SECONDS} 秒`
        : '点击麦克风开始';
  return (
    <View style={{ marginHorizontal: 16, marginTop: 14, marginBottom: 16, minHeight: 218, borderRadius: 20, borderWidth: 1, borderColor: '#DFE5EE', backgroundColor: '#FFFFFF', paddingHorizontal: 22, paddingTop: 15, paddingBottom: 14 }}>
      <Text style={{ textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#64748B' }}>{formatted}</Text>
      <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        {[4, 7, 10, 13, 9, 15, 18, 22, 16, 12, 20, 30, 17, 13, 10, 18, 14, 11, 8, 5, 7, 4].map((height, index) => (
          <View key={`${height}-${index}`} style={{ width: 2, height: listening ? Math.max(5, height * (0.72 + ((seconds + index) % 3) * 0.14)) : Math.max(3, height * 0.32), borderRadius: 2, backgroundColor: '#1473F7' }} />
        ))}
      </View>
      <Text style={{ textAlign: 'center', fontSize: 14, color: '#69758A', marginBottom: 13 }}>{status}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="取消录音" onPress={onCancel} disabled={!cancellable} style={({ pressed }) => ({ width: 78, alignItems: 'center', gap: 7, opacity: !cancellable ? 0.58 : pressed ? 0.55 : 1 })}>
          <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF1F5' }}>
            <X size={24} color="#344055" />
          </View>
          <Text style={{ fontSize: 13, color: '#526077', fontWeight: '600' }}>取消</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={listening ? '停止并识别' : busy ? status : '开始录音'} onPress={onPrimary} disabled={busy} style={({ pressed }) => ({ width: 84, alignItems: 'center', opacity: busy ? 0.55 : pressed ? 0.72 : 1 })}>
          <View style={{ width: 78, height: 78, borderRadius: 39, borderWidth: 9, borderColor: '#BFD8FF', backgroundColor: '#126EF5', alignItems: 'center', justifyContent: 'center' }}>
            <Mic size={32} color="#FFFFFF" strokeWidth={2.4} />
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="完成并识别" onPress={onFinish} disabled={!listening} style={({ pressed }) => ({ width: 78, alignItems: 'center', gap: 7, opacity: !listening ? 0.58 : pressed ? 0.55 : 1 })}>
          <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF1F5' }}>
            <Check size={24} color="#526077" />
          </View>
          <Text style={{ fontSize: 13, color: '#526077', fontWeight: '600' }}>完成识别</Text>
        </Pressable>
      </View>
    </View>
  );
}

const WELCOME_MSG: Message = {
  id: 'welcome',
  role: 'assistant',
  content: '你好，我是你的 AI 英语教练。可以陪你练表达、纠正语法，也可以直接开始场景对话。',
};

// ── 主屏 ─────────────────────────────────────────────────
export default function AiCoachScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ prompt?: string | string[] }>();
  const [messages, setMessages]   = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput]         = useState('');
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
  const recordingCancelledRef = useRef(false);
  const micRequestAbortRef = useRef<AbortController | null>(null);
  const recognitionAbortRef = useRef<AbortController | null>(null);
  const micOperationRef = useRef(0);

  // supabase url/key 从 useFocusEffect 里读取（保留原有模式）
  const [supabaseUrl, setSupabaseUrl] = useState(functionsBaseUrl);
  const [supabaseKey, setSupabaseKey] = useState(publicServiceKey);

  useFocusEffect(useCallback(() => {
    setSupabaseUrl(functionsBaseUrl);
    setSupabaseKey(publicServiceKey);
    return () => {
      micOperationRef.current += 1;
      micRequestAbortRef.current?.abort();
      micRequestAbortRef.current = null;
      recognitionAbortRef.current?.abort();
      recognitionAbortRef.current = null;
      recordingCancelledRef.current = true;
      if (mrRef.current?.state === 'recording') mrRef.current.stop();
      mrRef.current = null;
      if (process.env.EXPO_OS !== 'web') void recorder.stop().catch(() => {});
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
    const operation = micOperationRef.current;
    const recognitionController = new AbortController();
    recognitionAbortRef.current = recognitionController;
    setMicState('recognizing');
    setMicError('');
    try {
      let speech: string; let len: number; let fmt: string;
      if (process.env.EXPO_OS === 'web' && webmBlob) {
        console.log('[STT] converting webm→wav, blob size=', webmBlob.size);
        const wavBuf = await audioBlobTo16kWav(webmBlob);
        if (operation !== micOperationRef.current) return;
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
        speech, len, format: fmt, rate: 16000, language: 'en', cuid: 'ai-coach',
      }, session?.access_token, recognitionController.signal);
      if (operation !== micOperationRef.current) return;
      console.log('[STT] result:', JSON.stringify(res).slice(0, 120));
      const text = cleanRecognizedText(res?.result?.[0]);
      if (text) {
        setInput(prev => (prev ? `${prev} ${text}` : text));
      } else {
        setMicError('未识别到语音内容，请靠近麦克风后重试。');
      }
    } catch (e) {
      if (recognitionController.signal.aborted) return;
      console.warn('[STT] 识别失败:', e);
      setMicError(e instanceof Error ? e.message : '语音识别失败，请稍后重试。');
    }
    finally {
      if (recognitionAbortRef.current === recognitionController) recognitionAbortRef.current = null;
      if (operation === micOperationRef.current) setMicState('idle');
    }
  };

  // ── 麦克风 ──
  const handleMicPress = async () => {
    console.log('[MIC] pressed, micState=', micState, 'EXPO_OS=', process.env.EXPO_OS);
    setMicError('');
    if (micState === 'requesting' || micState === 'recognizing') return;
    if (micState === 'idle') {
      stopLocalSpeech();
      setSpeakingId(null);
      setPausedId(null);
      setRecordingSeconds(0);
    }

    if (process.env.EXPO_OS === 'web') {
      if (micState === 'recording') {
        if (mrRef.current?.state === 'recording') mrRef.current.stop();
      } else if (micState === 'idle') {
        const operation = micOperationRef.current + 1;
        micOperationRef.current = operation;
        const requestController = new AbortController();
        micRequestAbortRef.current = requestController;
        recordingCancelledRef.current = false;
        setMicState('requesting');
        try {
          const mediaRecorder = await startWebAudioRecording(async (blob) => {
            mrRef.current = null;
            if (recordingCancelledRef.current || operation !== micOperationRef.current) return;
            console.log('[MIC] onstop blob size=', blob.size);
            if (blob.size < 200) {
              setMicError('录音时间太短，请重新录制。');
              setMicState('idle');
              return;
            }
            await recognizeAndFill(blob);
          }, (error) => {
            if (operation !== micOperationRef.current) return;
            micOperationRef.current += 1;
            recordingCancelledRef.current = true;
            mrRef.current = null;
            console.warn('[MIC] MediaRecorder 失败:', error);
            setMicError(error instanceof Error ? error.message : '录音设备出现异常，请重新尝试。');
            setMicState('idle');
          }, requestController.signal);

          if (operation !== micOperationRef.current) {
            recordingCancelledRef.current = true;
            if (mediaRecorder.state === 'recording') mediaRecorder.stop();
            return;
          }
          mrRef.current = mediaRecorder;
          setMicState('recording');
          console.log('[MIC] MediaRecorder started');
        } catch (e) {
          if (operation !== micOperationRef.current || requestController.signal.aborted) return;
          console.warn('[MIC] getUserMedia 失败:', e);
          setMicError(e instanceof Error ? e.message : '无法使用麦克风，请允许浏览器访问麦克风后重试。');
          setMicState('idle');
        } finally {
          if (micRequestAbortRef.current === requestController) micRequestAbortRef.current = null;
        }
      }
    } else {
      if (micState === 'recording') {
        const operation = micOperationRef.current;
        setMicState('recognizing');
        try {
          await recorder.stop();
          await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
          if (operation !== micOperationRef.current) return;
          const uri = recorder.uri ?? '';
          if (!uri) {
            setMicError('没有生成录音文件，请重新录制。');
            setMicState('idle');
            return;
          }
          const FileSystem = await import('expo-file-system');
          const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
          if (operation !== micOperationRef.current) return;
          await recognizeAndFill(null, b64, Math.round(b64.length * 0.75));
        } catch (e) {
          if (operation !== micOperationRef.current) return;
          console.warn('[MIC] native 结束录音失败:', e);
          setMicError('无法读取录音，请重新录制。');
          setMicState('idle');
        }
      } else if (micState === 'idle') {
        const operation = micOperationRef.current + 1;
        micOperationRef.current = operation;
        setMicState('requesting');
        try {
          const perm = await requestRecordingPermissionsAsync();
          if (operation !== micOperationRef.current) return;
          if (!perm.granted) {
            setMicError('麦克风权限未开启，请在系统设置中允许访问。');
            setMicState('idle');
            return;
          }
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
          await recorder.prepareToRecordAsync();
          if (operation !== micOperationRef.current) {
            await recorder.stop().catch(() => {});
            return;
          }
          recorder.record();
          setMicState('recording');
        } catch (e) {
          if (operation !== micOperationRef.current) return;
          console.warn('[MIC] native 录音失败:', e);
          setMicError('无法启动麦克风，请检查权限后重试。');
          setMicState('idle');
        }
      }
    }
  };

  const handleCancelRecording = async () => {
    micOperationRef.current += 1;
    setMicError('');
    recordingCancelledRef.current = true;
    micRequestAbortRef.current?.abort();
    micRequestAbortRef.current = null;
    recognitionAbortRef.current?.abort();
    recognitionAbortRef.current = null;
    if (process.env.EXPO_OS === 'web') {
      if (mrRef.current?.state === 'recording') mrRef.current.stop();
      mrRef.current = null;
      setMicState('idle');
      return;
    }
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      // The recorder may already be stopping.
    }
    setMicState('idle');
  };

  useEffect(() => {
    if (micState === 'recording' && recordingSeconds >= MAX_RECORDING_SECONDS) {
      void handleMicPress();
    }
  }, [micState, recordingSeconds]);

  // ── 发送消息（流式）──
  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setInput('');
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

  const handleNewChat = () => {
    abortRef.current?.abort();
    if (micState !== 'idle') void handleCancelRecording();
    stopLocalSpeech();
    setSpeakingId(null);
    setPausedId(null);
    setStreaming(false);
    setMessages([WELCOME_MSG]);
    setInput('');
    setMicError('');
    setRecordingSeconds(0);
    conversationRecordedRef.current = false;
  };

  const lastAssistantId = [...messages].reverse().find(message => message.role === 'assistant')?.id;

  return (
    <View style={{ flex: 1, backgroundColor: '#F2F5F9', alignItems: 'center' }}>
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
          <View style={{ width: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="新对话" onPress={handleNewChat} style={({ pressed }) => ({ width: 34, height: 42, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
              <Plus size={21} color="#526077" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="打开设置" onPress={() => router.push('/(app)/settings' as any)} style={({ pressed }) => ({ width: 34, height: 42, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
              <Settings size={21} color="#0B1834" strokeWidth={2.3} />
            </Pressable>
          </View>
        </View>

        <KeyboardAvoidingView
          behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={message => message.id}
            renderItem={({ item }) => (
              <MessageBubble
                msg={item}
                pausedId={pausedId}
                speakingId={speakingId}
                speakingRate={speakingRate}
                showControls={item.id === lastAssistantId}
                onSpeak={handleSpeak}
              />
            )}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={scrollToBottom}
            ListFooterComponent={messages.length === 1 ? (
              <View style={{ paddingHorizontal: 18, paddingTop: 8 }}>
                <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 8, fontWeight: '600' }}>快速开始</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {STARTERS.map(starter => (
                    <Pressable
                      key={starter.text}
                      accessibilityRole="button"
                      accessibilityLabel={starter.text}
                      onPress={() => sendMessage(starter.text)}
                      style={({ pressed }) => ({
                        width: '48.8%', minHeight: 50, backgroundColor: '#F7F9FC', borderRadius: 12,
                        paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8,
                        borderWidth: 1, borderColor: '#E5EAF1', opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 17 }}>{starter.emoji}</Text>
                      <Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 17, fontWeight: '700', color: '#34405A', flex: 1 }}>{starter.text}</Text>
                      <ChevronDown size={12} color="#94A3B8" style={{ transform: [{ rotate: '-90deg' }] }} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          />

          {micState === 'idle' ? (
            <View style={{
              backgroundColor: WHITE, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8,
              borderTopWidth: 1, borderTopColor: '#E9EDF3',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <View style={{
                  flex: 1, backgroundColor: '#F3F6FA', borderRadius: 14,
                  borderWidth: 1, borderColor: input.trim() ? '#9CC3FF' : '#E0E6EE',
                  paddingHorizontal: 14, paddingVertical: 10, minHeight: 48, maxHeight: 120, justifyContent: 'center',
                }}>
                  <TextInput
                    value={input}
                    onChangeText={setInput}
                    placeholder="发送消息…"
                    placeholderTextColor="#94A3B8"
                    multiline
                    style={{ fontSize: 15, color: '#1E293B', lineHeight: 22, padding: 0 }}
                    onSubmitEditing={() => sendMessage(input)}
                    editable={!streaming}
                  />
                </View>

                {!streaming ? (
                  <Pressable
                    onPress={handleMicPress}
                    accessibilityRole="button"
                    accessibilityLabel="开始语音输入"
                    style={({ pressed }) => ({
                      width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: '#E7F0FF', borderWidth: 1, borderColor: '#C9DCFA',
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Mic size={19} color={BLUE} />
                  </Pressable>
                ) : null}

                {streaming ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="停止 AI 回复"
                    onPress={() => abortRef.current?.abort()}
                    style={({ pressed }) => ({
                      width: 48, height: 48, borderRadius: 24, backgroundColor: '#FEE2E2',
                      alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <RotateCcw size={18} color="#B91C1C" />
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="发送消息"
                    onPress={() => sendMessage(input)}
                    disabled={!input.trim()}
                    style={({ pressed }) => ({
                      width: 48, height: 48, borderRadius: 24, backgroundColor: input.trim() ? '#0868F2' : '#E2E8F0',
                      alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <Send size={20} color={input.trim() ? WHITE : '#94A3B8'} />
                  </Pressable>
                )}
              </View>
            </View>
          ) : (
            <View style={{ borderTopWidth: 1, borderTopColor: '#E9EDF3', paddingTop: 2 }}>
              <RecordingPanel
                seconds={recordingSeconds}
                state={micState}
                onCancel={handleCancelRecording}
                onPrimary={handleMicPress}
                onFinish={handleMicPress}
              />
            </View>
          )}

          {micError ? (
            <View style={{ marginHorizontal: 18, marginBottom: 6, borderRadius: 10, backgroundColor: '#FEF2F2', paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontSize: 12, lineHeight: 17, color: '#B91C1C' }}>{micError}</Text>
            </View>
          ) : null}

          <Text style={{ fontSize: 10, color: '#CBD5E1', textAlign: 'center', paddingBottom: 8 }}>
            AI 生成内容仅用于英语练习
          </Text>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

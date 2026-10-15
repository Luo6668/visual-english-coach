import {requestRecordingPermissionsAsync,
  setAudioModeAsync, 
  useAudioPlayer, useAudioRecorder,
} from 'expo-audio';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {ChevronDown, ChevronLeft, Mic, MicOff, Pause, Play, Plus, RotateCcw,
  Send, Settings, Volume2,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {ActivityIndicator,FlatList,
  KeyboardAvoidingView, Pressable, Text, TextInput, 
  View, 
} from 'react-native';
import Animated, {useAnimatedStyle, 
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

// ── 推荐开场话题 ─────────────────────────────────────────
const STARTERS = [
  { emoji: '☕', text: '咖啡馆点单怎么说？' },
  { emoji: '💼', text: '帮我练习英语自我介绍' },
  { emoji: '✈️', text: '机场登机英语对话' },
  { emoji: '🗣️', text: '纠正我的英语表达' },
];

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
  onSpeak: (id: string, text: string) => void;
}) {
  const isUser = msg.role === 'user';
  const isSpeaking = speakingId === msg.id;
  const isPaused = pausedId === msg.id;
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
            <Text style={{ fontSize: 15, color: '#1D58AE', lineHeight: 22, fontWeight: '600' }}>{msg.content}</Text>
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
                {msg.content}
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

// ── WELCOME 消息 ─────────────────────────────────────────
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
  const [micState, setMicState]   = useState<'idle' | 'requesting' | 'recording' | 'recognizing'>('idle');
  const [micError, setMicError]   = useState('');
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

  const scrollToBottom = () =>
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);

  // ── 朗读 ──
  const handleSpeak = (id: string, text: string) => {
    if (speakingId === id) {
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
    speakWithTTS(text, player, callEdgeFn, () => {
      setSpeakingId(null);
      setPausedId(null);
    });
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
        setInput(prev => (prev ? prev + ' ' + text : text));
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
            const blob = new Blob(chunksRef.current, { type: mime });
            console.log('[MIC] onstop blob size=', blob.size);
            if (blob.size < 200) {
              setMicError('录音时间太短，请重新录制。');
              setMicState('idle');
              return;
            }
            await recognizeAndFill(blob);
          };
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
    stopLocalSpeech();
    setSpeakingId(null);
    setPausedId(null);
    setStreaming(false);
    setMessages([WELCOME_MSG]);
    setInput('');
    conversationRecordedRef.current = false;
  };

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
        {/* ── 消息列表 ── */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => (
            <MessageBubble msg={item} pausedId={pausedId} speakingId={speakingId} onSpeak={handleSpeak} />
          )}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
          ListFooterComponent={
            messages.length === 1 ? (
              <View style={{ paddingHorizontal: 18, paddingTop: 8 }}>
                <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 8, fontWeight: '600' }}>快速开始</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {STARTERS.map(s => (
                  <Pressable key={s.text} onPress={() => sendMessage(s.text)} className="active:opacity-75"
                    style={{
                      width: '48.8%', minHeight: 50, backgroundColor: '#F7F9FC', borderRadius: 12,
                      paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8,
                      borderWidth: 1, borderColor: '#E5EAF1',
                    }}>
                    <Text style={{ fontSize: 17 }}>{s.emoji}</Text>
                    <Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 17, fontWeight: '700', color: '#34405A', flex: 1 }}>{s.text}</Text>
                    <ChevronDown size={12} color="#94A3B8" style={{ transform: [{ rotate: '-90deg' }] }} />
                  </Pressable>
                ))}
                </View>
              </View>
            ) : null
          }
        />

        {/* ── 输入区 ── */}
        <View style={{
          backgroundColor: WHITE, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8,
          borderTopWidth: 1, borderTopColor: '#E9EDF3',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            {/* 输入框 */}
            <View style={{
              flex: 1, backgroundColor: '#F3F6FA', borderRadius: 14,
              borderWidth: 1, borderColor: micState === 'recording' ? '#FCA5A5' : input.trim() ? '#9CC3FF' : '#E0E6EE',
              paddingHorizontal: 14, paddingVertical: 10, minHeight: 48, maxHeight: 120, justifyContent: 'center',
            }}>
              {micState === 'requesting' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color={BLUE} />
                  <Text style={{ fontSize: 14, color: GRAY_TEXT }}>等待麦克风授权…</Text>
                </View>
              ) : micState === 'recognizing' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color={BLUE} />
                  <Text style={{ fontSize: 14, color: GRAY_TEXT }}>识别中…</Text>
                </View>
              ) : micState === 'recording' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
                  <Text style={{ fontSize: 14, color: '#EF4444' }}>录音中，再次点击停止…</Text>
                </View>
              ) : (
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
              )}
            </View>

            {/* 麦克风按钮 */}
            {!streaming && (
              <Pressable
                onPress={handleMicPress}
                disabled={micState === 'requesting' || micState === 'recognizing'}
                accessibilityRole="button"
                accessibilityLabel={micState === 'recording'
                  ? '停止录音'
                  : micState === 'requesting'
                    ? '正在请求麦克风权限'
                    : micState === 'recognizing'
                      ? '正在识别语音'
                      : '开始语音输入'}
                className="active:opacity-75"
                style={{
                  width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: micState === 'recording' ? '#FEE2E2' : micState === 'recognizing' ? '#F1F5F9' : '#E7F0FF',
                  borderWidth: 1,
                  borderColor: micState === 'recording' ? '#FCA5A5' : micState === 'recognizing' ? '#E2E8F0' : '#C9DCFA',
                }}
              >
                {micState === 'requesting' || micState === 'recognizing'
                  ? <ActivityIndicator size="small" color={BLUE} />
                  : micState === 'recording'
                    ? <MicOff size={18} color="#EF4444" />
                    : <Mic size={18} color={BLUE} />
                }
              </Pressable>
            )}

            {/* 发送 / 停止 */}
            {streaming ? (
              <Pressable onPress={() => abortRef.current?.abort()} className="active:opacity-75"
                  style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
                <RotateCcw size={18} color="#EF4444" />
              </Pressable>
            ) : (
              <Pressable onPress={() => sendMessage(input)} className="active:opacity-80"
                disabled={!input.trim() || micState !== 'idle'}
                style={{ width: 48, height: 48, borderRadius: 24, overflow: 'hidden' }}>
                {input.trim() ? (
                  <View style={{ flex: 1, backgroundColor: '#0868F2', alignItems: 'center', justifyContent: 'center' }}>
                    <Send size={20} color={WHITE} />
                  </View>
                ) : (
                  <View style={{ flex: 1, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}>
                    <Send size={20} color="#94A3B8" />
                  </View>
                )}
              </Pressable>
            )}
          </View>

          {micError ? (
            <Text style={{ fontSize: 12, lineHeight: 17, color: '#DC2626', marginTop: 6, paddingHorizontal: 2 }}>
              {micError}
            </Text>
          ) : null}

          <Text style={{ fontSize: 10, color: '#CBD5E1', textAlign: 'center', marginTop: 8 }}>
            AI 生成内容仅用于英语练习
          </Text>
        </View>
      </KeyboardAvoidingView>
      </View>
    </View>
  );
}

import {requestRecordingPermissionsAsync,
  setAudioModeAsync, 
  useAudioPlayer, useAudioRecorder,
} from 'expo-audio';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, MessageCircle, Mic, MicOff, Send, Sparkles, Volume2 } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView,Pressable, ScrollView, Text, TextInput,
  View, 
} from 'react-native';
import { supabase } from '@/client/supabase';
import { addXp, recordActivity } from '@/lib/api';
import { requestWebMicrophoneStream } from '@/lib/audioCapture';
import { functionUrl, publicServiceKey } from '@/lib/serviceConfig';
import { speakWithTTS, stopLocalSpeech } from '@/lib/speech';

const BLUE      = '#4A90E2';
const BLUE_DARK = '#2E5C8A';
const BLUE_LIGHT = '#EEF5FF';
const WHITE     = '#FFFFFF';
const BG        = '#F5F8FF';
const GRAY      = '#94A3B8';

/** 直接 fetch 调 Edge Function，不走 supabase client（避免 web 端静默失败） */
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

/** ArrayBuffer → base64 字符串 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Web 端：将 webm/opus Blob 转换为 16kHz 单声道 PCM WAV ArrayBuffer
 * 百度 STT API 只接受 wav 或 m4a，webm 直接发会报 3300/3301
 */
async function convertWebmToWav(webmBlob: Blob): Promise<ArrayBuffer> {
  const arrayBuf = await webmBlob.arrayBuffer();
  const audioCtx = new AudioContext({ sampleRate: 16000 });
  const decoded  = await audioCtx.decodeAudioData(arrayBuf);
  const pcm      = decoded.getChannelData(0); // 取第一声道
  await audioCtx.close();

  // 写 WAV 文件头 + PCM 数据
  const wav = new ArrayBuffer(44 + pcm.length * 2);
  const v   = new DataView(wav);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);       // 单声道
  v.setUint32(24, 16000, true);   // 采样率
  v.setUint32(28, 32000, true);   // 字节率 = 16000 * 2
  v.setUint16(32, 2, true);       // 块对齐
  v.setUint16(34, 16, true);      // 位深
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return wav;
}

interface Message {
  role: 'ai' | 'user';
  content: string;
  suggestion?: string;
}

export default function DialogueScreen() {
  const router = useRouter();
  const { scene, recordId: _recordId } = useLocalSearchParams();
  const sceneName = (scene as string) || 'Coffee Shop';

  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  // 'idle' | 'recording' | 'recognizing'
  const [micState, setMicState] = useState<'idle' | 'requesting' | 'recording' | 'recognizing'>('idle');
  const [micError, setMicError] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const player = useAudioPlayer();
  // native 录音器（hook 必须在顶层调用，web 端是空 stub 无害）
  const recorder = useAudioRecorder({
    extension: '.m4a', sampleRate: 16000, numberOfChannels: 1, bitRate: 64000,
    android: { outputFormat: 'aac_adts', audioEncoder: 'aac', sampleRate: 16000 },
    ios: { extension: '.m4a', outputFormat: 'aac', audioQuality: 96, sampleRate: 16000 },
    web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
  });
  // Web MediaRecorder refs
  const mrRef     = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // ── 朗读 ──
  const handleSpeak = (text: string, idx: number) => {
    if (speakingIdx === idx) {
      stopLocalSpeech();
      setSpeakingIdx(null);
      return;
    }
    if (speakingIdx !== null) stopLocalSpeech();
    setSpeakingIdx(idx);
    speakWithTTS(text, player, callEdgeFn, () => setSpeakingIdx(null));
  };

  // ── STT 识别并填入输入框 ──
  const recognizeAndFill = async (webmBlob: Blob | null, m4aBase64?: string, m4aLen?: number) => {
    setMicState('recognizing');
    setMicError('');
    try {
      let speech: string;
      let len: number;
      let fmt: string;

      if (process.env.EXPO_OS === 'web' && webmBlob) {
        // Web: webm → 16 kHz mono wav → base64
        console.log('[STT] converting webm→wav, blob size=', webmBlob.size);
        const wavBuf = await convertWebmToWav(webmBlob);
        speech = arrayBufferToBase64(wavBuf);
        len    = wavBuf.byteLength;
        fmt    = 'wav';
      } else {
        // Native: m4a base64 直接发
        speech = m4aBase64 ?? '';
        len    = m4aLen ?? 0;
        fmt    = 'm4a';
      }

      if (!speech || len <= 0) {
        setMicError('没有录到有效声音，请重新录制。');
        return;
      }
      console.log('[STT] sending fmt=', fmt, 'len=', len);

      const { data: { session } } = await supabase.auth.getSession();
      const res = await callEdgeFn('short-speech-recognition', {
        speech, len, format: fmt, rate: 16000, cuid: 'dialogue',
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

  // ── 麦克风按钮 ──
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
        console.log('[STT] native uri=', uri);
        if (!uri) {
          setMicError('没有生成录音文件，请重新录制。');
          setMicState('idle');
          return;
        }
        const FileSystem = await import('expo-file-system');
        const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        const len = Math.round(b64.length * 0.75);
        await recognizeAndFill(null, b64, len);
      } else if (micState === 'idle') {
        setMicState('requesting');
        try {
          const perm = await requestRecordingPermissionsAsync();
          if (!perm.granted) {
            console.warn('[MIC] 权限被拒');
            setMicError('麦克风权限未开启，请在系统设置中允许访问。');
            setMicState('idle');
            return;
          }
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
          await recorder.prepareToRecordAsync();
          recorder.record();
          setMicState('recording');
        } catch (e) {
          console.warn('[MIC] native 录音启动失败:', e);
          setMicError('无法启动麦克风，请检查权限后重试。');
          setMicState('idle');
        }
      }
    }
  };

  // 每次进入页面只记录一次完整对话练习。
  const xpAddedRef = useRef(false);

  // ── 发送消息 ──
  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    setInput('');
    setSuggestion('');
    const next: Message[] = [...messages, { role: 'user', content: text.trim() }];
    setMessages(next);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const result = await callEdgeFn('dialogue', { scene: sceneName, messages: next }, session?.access_token);
      const content = typeof result?.content === 'string' ? result.content.trim() : '';
      if (!content) throw new Error('AI 未返回有效回复，请重试');
      const suggestion = typeof result?.suggestion === 'string' ? result.suggestion.trim() : '';
      const aiMsg: Message = { role: 'ai', content, suggestion };
      setMessages(prev => [...prev, aiMsg]);
      if (suggestion) setSuggestion(suggestion);

      if (!xpAddedRef.current) {
        xpAddedRef.current = true;
        const source = `dialogue_${sceneName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
        Promise.allSettled([addXp(source), recordActivity('dialogue')]).catch(() => {});
      }
    } catch (e) { console.error('[dialogue] send error:', e); }
    finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  // ── 初始化开场白 ──
  useFocusEffect(useCallback(() => {
    if (messages.length > 0) return;
    setLoading(true);
    (async () => {
      try {
        const result = await callEdgeFn('dialogue', { scene: sceneName, messages: [] });
        const content = typeof result?.content === 'string' ? result.content.trim() : '';
        if (!content) throw new Error('AI 未返回有效开场白');
        setMessages([{ role: 'ai', content }]);
      } catch (e) { console.error('[dialogue] init error:', e); }
      finally { setLoading(false); }
    })();
  }, [sceneName]));

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: BG }}
    >
      <StatusBar style="dark" />

      {/* ── 顶部 Hero ── */}
      <View style={{
        backgroundColor: BLUE_LIGHT, paddingTop: 56, paddingBottom: 16,
        paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#D6E8FF',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.back()} className="active:opacity-70"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={20} color={BLUE} />
          </Pressable>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MessageCircle size={16} color={BLUE} />
              <Text style={{ color: '#1E293B', fontSize: 17, fontWeight: '800' }}>AI 场景对话</Text>
            </View>
            <Text style={{ color: '#64748B', fontSize: 12 }}>场景：{sceneName}</Text>
          </View>
          <View style={{ backgroundColor: BLUE + '18', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Sparkles size={12} color={BLUE} />
            <Text style={{ color: BLUE_DARK, fontSize: 11, fontWeight: '700' }}>AI 对话</Text>
          </View>
        </View>
      </View>

      {/* ── 消息列表 ── */}
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 12 }}
        contentInsetAdjustmentBehavior="automatic"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((msg, i) => (
          <View key={i} style={{ alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: GRAY, marginHorizontal: 4 }}>
              {msg.role === 'ai' ? '🤖 AI Coach' : '👤 你'}
            </Text>
            <View style={{
              maxWidth: '82%', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12,
              backgroundColor: msg.role === 'user' ? BLUE : WHITE,
              borderBottomRightRadius: msg.role === 'user' ? 4 : 18,
              borderBottomLeftRadius: msg.role === 'user' ? 18 : 4,
            }}>
              <Text style={{ fontSize: 15, lineHeight: 24, color: msg.role === 'user' ? WHITE : '#1E293B' }}>
                {msg.content}
              </Text>
              {/* AI 消息朗读按钮 */}
              {msg.role === 'ai' && (
                <Pressable
                  onPress={() => handleSpeak(msg.content, i)}
                  className="active:opacity-60"
                  style={{
                    marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
                    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                    backgroundColor: speakingIdx === i ? BLUE + '20' : '#F1F5F9',
                    borderWidth: 1, borderColor: speakingIdx === i ? BLUE + '40' : '#E2E8F0',
                  }}
                >
                  <Volume2 size={13} color={speakingIdx === i ? BLUE : GRAY} />
                  <Text style={{ fontSize: 11, color: speakingIdx === i ? BLUE : GRAY, fontWeight: '600' }}>
                    {speakingIdx === i ? '朗读中…' : '朗读'}
                  </Text>
                </Pressable>
              )}
            </View>
            {/* 纠错建议 */}
            {msg.suggestion && (
              <Pressable onPress={() => setInput(msg.suggestion!)} className="active:opacity-75"
                style={{ maxWidth: '82%', backgroundColor: '#FFFBEB', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#FDE68A', marginHorizontal: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#92400E', marginBottom: 2 }}>💡 更自然的说法</Text>
                <Text style={{ fontSize: 13, color: '#B45309', fontWeight: '600' }}>{msg.suggestion}</Text>
              </Pressable>
            )}
          </View>
        ))}

        {loading && (
          <View style={{ alignItems: 'flex-start' }}>
            <View style={{ backgroundColor: WHITE, borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {[0, 1, 2].map(i => (
                <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: BLUE, opacity: 0.4 + i * 0.2 }} />
              ))}
              <Text style={{ fontSize: 12, color: GRAY, marginLeft: 4 }}>AI 正在思考...</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── 底部输入栏 ── */}
      <View style={{ backgroundColor: WHITE, borderTopWidth: 1, borderTopColor: '#E8EDF2', padding: 12, gap: 8 }}>
        {suggestion !== '' && (
          <Pressable onPress={() => sendMessage(suggestion)} className="active:opacity-70"
            style={{ backgroundColor: BLUE + '12', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Sparkles size={12} color={BLUE} />
            <Text style={{ fontSize: 12, color: BLUE, fontWeight: '700', flex: 1 }} numberOfLines={1}>💡 {suggestion}</Text>
            <Text style={{ fontSize: 11, color: BLUE }}>点击发送</Text>
          </Pressable>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          {/* 输入框 */}
          <View style={{
            flex: 1, backgroundColor: '#F0F4F8', borderRadius: 22,
            borderWidth: 1.5, borderColor: micState === 'recording' ? '#EF4444' : '#E2E8F0',
            paddingHorizontal: 16, paddingVertical: 10, minHeight: 46, maxHeight: 100, justifyContent: 'center',
          }}>
            {micState === 'requesting' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color={BLUE} />
                <Text style={{ fontSize: 14, color: GRAY }}>等待麦克风授权…</Text>
              </View>
            ) : micState === 'recognizing' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color={BLUE} />
                <Text style={{ fontSize: 14, color: GRAY }}>识别中…</Text>
              </View>
            ) : micState === 'recording' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
                <Text style={{ fontSize: 14, color: '#EF4444' }}>录音中，再次点击停止…</Text>
              </View>
            ) : (
              <TextInput
                style={{ fontSize: 15, color: '#1E293B', padding: 0, lineHeight: 22 }}
                placeholder="用英语回复…"
                placeholderTextColor={GRAY}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => sendMessage(input)}
                returnKeyType="send"
                multiline
                editable={!loading}
              />
            )}
          </View>

          {/* 麦克风按钮 */}
          {!loading && (
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
                width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                backgroundColor: micState === 'recording' ? '#FEE2E2' : micState === 'recognizing' ? '#F1F5F9' : BLUE_LIGHT,
                borderWidth: 1.5,
                borderColor: micState === 'recording' ? '#FCA5A5' : micState === 'recognizing' ? '#E2E8F0' : '#BFDBFE',
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

          {/* 发送按钮 */}
          <Pressable
            onPress={() => sendMessage(input)}
            disabled={loading || !input.trim() || micState !== 'idle'}
            className="active:opacity-75"
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: input.trim() ? BLUE : '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}
          >
            {loading
              ? <ActivityIndicator size="small" color={WHITE} />
              : <Send size={18} color={input.trim() ? WHITE : GRAY} />
            }
          </Pressable>
        </View>
        {micError ? (
          <Text style={{ fontSize: 12, lineHeight: 17, color: '#DC2626', paddingHorizontal: 2 }}>
            {micError}
          </Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

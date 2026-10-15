import {requestRecordingPermissionsAsync,
  setAudioModeAsync, 
  useAudioPlayer, useAudioRecorder,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {CheckCircle2, 
  ChevronLeft, Mic, MicOff,RotateCcw, Send, Star, Volume2, Zap, 
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {ActivityIndicator,FlatList,
  KeyboardAvoidingView, Pressable, Text, TextInput, 
  View, 
} from 'react-native';
import Animated, {useAnimatedStyle, 
  useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { supabase } from '@/client/supabase';
import { addXp, fetchSceneMapProgress, recordActivity, upsertSceneMapProgress } from '@/lib/api';
import { requestWebMicrophoneStream } from '@/lib/audioCapture';
import { getSceneById } from '@/lib/sceneMapData';
import { functionUrl, isLocalServiceMode, publicServiceKey } from '@/lib/serviceConfig';
import { speakWithTTS, stopLocalSpeech } from '@/lib/speech';

/** 直接 fetch 调 Edge Function，不走 supabase client（避免 web 端 invoke 静默失败） */
async function callEdgeFn(name: string, body: unknown): Promise<any> {
  const res = await fetch(functionUrl(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${publicServiceKey}`,
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function convertWebmToWav(webmBlob: Blob): Promise<ArrayBuffer> {
  const source = await webmBlob.arrayBuffer();
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const decoded = await audioContext.decodeAudioData(source);
  const pcm = decoded.getChannelData(0);
  await audioContext.close();
  const wav = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(wav);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const sample = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return wav;
}

// ── 颜色 ─────────────────────────────────────────────────
const BLUE    = '#2563EB';
const GREEN   = '#22C55E';
const GRAY    = '#94A3B8';
const BG      = '#F8FAFF';
const WHITE   = '#FFFFFF';

// ── 消息类型 ─────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

type RewardStatus = 'idle' | 'pending' | 'awarded' | 'duplicate' | 'failed';

// ── 打字动画 ─────────────────────────────────────────────
function TypingDots() {
  const dots = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  useEffect(() => {
    dots.forEach((sv, i) => {
      setTimeout(() => {
        sv.value = withRepeat(
          withSequence(withTiming(1, { duration: 280 }), withTiming(0, { duration: 280 })),
          -1, false
        );
      }, i * 180);
    });
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 4 }}>
      {dots.map((sv, i) => {
        const style = useAnimatedStyle(() => ({
          opacity: 0.3 + sv.value * 0.7,
          transform: [{ translateY: -sv.value * 4 }],
        }));
        return <Animated.View key={i} style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: GRAY }, style]} />;
      })}
    </View>
  );
}

// ── 消息气泡 ─────────────────────────────────────────────
function Bubble({ msg, sceneEmoji, onSpeak, isSpeaking }: {
  msg: Message; sceneEmoji: string;
  onSpeak?: () => void; isSpeaking?: boolean;
}) {
  const isUser = msg.role === 'user';
  return (
    <View style={{
      flexDirection: 'row', justifyContent: isUser ? 'flex-end' : 'flex-start',
      paddingHorizontal: 14, paddingVertical: 5,
    }}>
      {!isUser && (
        <View style={{
          width: 36, height: 36, borderRadius: 12,
          backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
          marginRight: 8, marginTop: 2, borderWidth: 1.5, borderColor: '#BFDBFE', flexShrink: 0,
        }}>
          <Text style={{ fontSize: 18 }}>{sceneEmoji}</Text>
        </View>
      )}
      <View style={{ maxWidth: '78%', gap: 4 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: isUser ? BLUE : GRAY, marginBottom: 0, textAlign: isUser ? 'right' : 'left' }}>
          {isUser ? '我' : 'AI 角色'}
        </Text>
        {isUser ? (
          <LinearGradient
            colors={['#1E40AF', '#2563EB']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 12 }}
          >
            <Text style={{ fontSize: 15, color: WHITE, lineHeight: 22 }}>{msg.content}</Text>
          </LinearGradient>
        ) : (
          <View style={{
            backgroundColor: WHITE, borderRadius: 20, borderBottomLeftRadius: 6,
            paddingHorizontal: 16, paddingVertical: 12,
            borderWidth: 1, borderColor: '#E2E8F0',
          }}>
            {msg.streaming && msg.content === '' ? (
              <TypingDots />
            ) : (
              <Text style={{ fontSize: 15, color: '#1E293B', lineHeight: 24 }}>
                {msg.content}
                {msg.streaming && <Text style={{ color: BLUE }}>▌</Text>}
              </Text>
            )}
          </View>
        )}
        {/* AI 消息朗读按钮 */}
        {!isUser && !msg.streaming && msg.content !== '' && onSpeak && (
          <Pressable
            onPress={onSpeak}
            className="active:opacity-60"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
              paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
              backgroundColor: isSpeaking ? BLUE + '15' : '#F1F5F9',
              borderWidth: 1, borderColor: isSpeaking ? BLUE + '35' : '#E2E8F0',
            }}
          >
            <Volume2 size={13} color={isSpeaking ? BLUE : GRAY} />
            <Text style={{ fontSize: 11, color: isSpeaking ? BLUE : GRAY, fontWeight: '600' }}>
              {isSpeaking ? '朗读中…' : '朗读'}
            </Text>
          </Pressable>
        )}
      </View>
      {isUser && (
        <View style={{
          width: 36, height: 36, borderRadius: 12, backgroundColor: '#DBEAFE',
          alignItems: 'center', justifyContent: 'center', marginLeft: 8, marginTop: 2, flexShrink: 0,
        }}>
          <Text style={{ fontSize: 18 }}>👤</Text>
        </View>
      )}
    </View>
  );
}

// ── 完成横幅 ─────────────────────────────────────────────
function CompletionBanner({ sceneName, requiredRounds, rewardStatus, rewardAmount, onRetryReward, onContinue, onBack }: {
  sceneName: string;
  requiredRounds: number;
  rewardStatus: RewardStatus;
  rewardAmount: number;
  onRetryReward: () => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const rewardText = rewardStatus === 'awarded'
    ? `本次获得 +${rewardAmount} XP，已计入成长经验`
    : rewardStatus === 'duplicate'
      ? '本轮经验已经领取，无需重复操作'
      : rewardStatus === 'failed'
        ? '经验暂未到账，请点击补领'
        : rewardStatus === 'pending'
          ? '正在发放完成奖励…'
          : '';

  return (
    <View style={{
      margin: 16, backgroundColor: '#DCFCE7', borderRadius: 20,
      padding: 20, gap: 12, alignItems: 'center',
      borderWidth: 1.5, borderColor: '#86EFAC',
    }}>
      <Text style={{ fontSize: 36 }}>🎉</Text>
      <Text style={{ fontSize: 16, fontWeight: '900', color: '#166534', textAlign: 'center' }}>
        场景对话完成！
      </Text>
      <Text style={{ fontSize: 13, color: '#15803D', textAlign: 'center', lineHeight: 20 }}>
        你已完成「{sceneName}」场景的 {requiredRounds} 轮对话，本轮练习已结束。
      </Text>
      {rewardText ? (
        <View style={{
          width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: rewardStatus === 'failed' ? '#FEF2F2' : '#FFFBEB',
          borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
          borderWidth: 1, borderColor: rewardStatus === 'failed' ? '#FECACA' : '#FDE68A',
        }}>
          <Zap size={16} color={rewardStatus === 'failed' ? '#DC2626' : '#D97706'} fill={rewardStatus === 'awarded' ? '#FBBF24' : 'transparent'} />
          <Text style={{
            flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '700',
            color: rewardStatus === 'failed' ? '#B91C1C' : '#92400E',
          }}>
            {rewardText}
          </Text>
          {rewardStatus === 'failed' ? (
            <Pressable
              onPress={onRetryReward}
              accessibilityRole="button"
              accessibilityLabel="补领场景完成经验"
              className="active:opacity-70"
              style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: '#DC2626' }}
            >
              <Text style={{ color: WHITE, fontSize: 11, fontWeight: '800' }}>补领经验</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
        <Pressable
          onPress={onContinue}
          accessibilityRole="button"
          accessibilityLabel={`重新练习${sceneName}场景`}
          className="active:opacity-75"
          style={{ flex: 1, backgroundColor: WHITE, borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: GREEN }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: GREEN }}>重新练习</Text>
        </Pressable>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="返回场景地图"
          className="active:opacity-75"
          style={{ flex: 1, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: WHITE }}>返回地图</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── 主屏 ─────────────────────────────────────────────────
export default function SceneDialogueScreen() {
  const router = useRouter();
  const { sceneId } = useLocalSearchParams<{ sceneId: string }>();
  const scene = getSceneById(sceneId ?? '');

  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);
  const [userRounds, setUserRounds] = useState(0);
  const [bestRounds, setBestRounds] = useState(0);
  const [hasCompletedScene, setHasCompletedScene] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [rewardStatus, setRewardStatus] = useState<RewardStatus>('idle');
  const [rewardAmount, setRewardAmount] = useState(0);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [recording, setRecording]   = useState(false);
  const [requestingMic, setRequestingMic] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [micError, setMicError] = useState('');
  const player = useAudioPlayer();
  const recorder = useAudioRecorder({
    extension: '.m4a', sampleRate: 16000, numberOfChannels: 1, bitRate: 64000,
    android: { outputFormat: 'aac_adts', audioEncoder: 'aac', sampleRate: 16000 },
    ios: { extension: '.m4a', outputFormat: 'aac', audioQuality: 96, sampleRate: 16000 },
    web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
  });
  const flatListRef = useRef<FlatList>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const sendLockRef = useRef(false);
  const userRoundsRef = useRef(0);
  const completedRef = useRef(false);
  const practiceSessionRef = useRef(Date.now().toString());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleSpeak = (msg: Message) => {
    if (speakingId === msg.id) {
      stopLocalSpeech();
      setSpeakingId(null);
      return;
    }
    if (speakingId) stopLocalSpeech();
    setSpeakingId(msg.id);
    speakWithTTS(msg.content, player, callEdgeFn, () => setSpeakingId(null));
  };

  // ── base64 读取（web/native 双路径）──
  const readRecordingBase64 = async (uri: string): Promise<string> => {
    if (process.env.EXPO_OS === 'web') {
      try {
        const resp = await fetch(uri);
        const blob = await resp.blob();
        return await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        });
      } catch { return ''; }
    }
    try {
      return await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    } catch { return ''; }
  };

  // ── 语音输入：按下开始录音 ──
  const handleMicPress = async () => {
    setMicError('');
    if (process.env.EXPO_OS === 'web') {
      if (recording) {
        mediaRecorderRef.current?.stop();
        return;
      }
      try {
        setRequestingMic(true);
        const stream = await requestWebMicrophoneStream();
        setRequestingMic(false);
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        audioChunksRef.current = [];
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };
        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop());
          setRecording(false);
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          console.log('[MIC] scene recording stopped, bytes=', blob.size);
          if (blob.size < 200) {
            setMicError('录音时间太短，请重新录制。');
            return;
          }
          setRecognizing(true);
          try {
            const wav = await convertWebmToWav(blob);
            const response = await callEdgeFn('short-speech-recognition', {
              speech: arrayBufferToBase64(wav),
              len: wav.byteLength,
              format: 'wav',
              rate: 16000,
              language: 'en',
              cuid: 'scene-dialogue',
            });
            const text = String(response?.result?.[0] || '').trim();
            if (text) {
              setInput((previous) => (previous ? `${previous} ${text}` : text));
            } else {
              setMicError('未识别到语音内容，请靠近麦克风后重试。');
            }
          } catch (error) {
            console.warn('[STT] 场景语音识别失败:', error);
            setMicError(error instanceof Error ? error.message : '语音识别失败，请稍后重试。');
          } finally {
            setRecognizing(false);
          }
        };
        mediaRecorder.start(250);
        mediaRecorderRef.current = mediaRecorder;
        setRecording(true);
        console.log('[MIC] scene MediaRecorder started');
      } catch (error) {
        console.warn('[MIC] 场景麦克风启动失败:', error);
        setMicError(error instanceof Error ? error.message : '无法使用麦克风，请允许浏览器访问麦克风后重试。');
        setRequestingMic(false);
        setRecording(false);
      }
      return;
    }
    if (recording) {
      setRecording(false);
      setRecognizing(true);
      try {
        await recorder.stop();
        const uri = recorder.uri ?? '';
        if (!uri) {
          setMicError('没有生成录音文件，请重新录制。');
          setRecognizing(false);
          return;
        }
        const speech = await readRecordingBase64(uri);
        if (!speech) {
          setMicError('无法读取录音文件，请重新录制。');
          setRecognizing(false);
          return;
        }
        const len = Math.round(speech.length * 0.75);
        const res = await callEdgeFn('short-speech-recognition', {
          speech, len, format: 'm4a', rate: 16000, language: 'en', cuid: 'scene-dialogue',
        });
        console.log('[STT] result:', res);
        const text = String(res?.result?.[0] || '').trim();
        if (text) {
          setInput(prev => prev ? prev + ' ' + text : text);
        } else {
          setMicError('未识别到语音内容，请靠近麦克风后重试。');
        }
      } catch (e) {
        console.warn('[STT] 语音识别失败:', e);
        setMicError(e instanceof Error ? e.message : '语音识别失败，请稍后重试。');
      }
      finally { setRecognizing(false); }
    } else {
      try {
        setRequestingMic(true);
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          setMicError('麦克风权限未开启，请在系统设置中允许访问。');
          setRequestingMic(false);
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setRequestingMic(false);
        setRecording(true);
      } catch (e) {
        console.warn('[STT] 录音启动失败:', e);
        setMicError('无法启动麦克风，请检查权限后重试。');
        setRequestingMic(false);
      }
    }
  };

  // 初始化：加载已有进度，加入 AI 开场白
  useEffect(() => {
    if (!scene) return;
    (async () => {
      const data = (await fetchSceneMapProgress(scene.id))[0];
      const existingRounds = Math.min(Number(data?.dialogue_rounds ?? 0), scene.requiredRounds);
      const sceneIsCompleted = data?.status === 'completed' || existingRounds >= scene.requiredRounds;
      setUserRounds(existingRounds);
      userRoundsRef.current = existingRounds;
      setBestRounds(existingRounds);
      setHasCompletedScene(sceneIsCompleted);
      setCompleted(sceneIsCompleted);
      completedRef.current = sceneIsCompleted;
      sendLockRef.current = false;
      setRewardStatus('idle');
      setRewardAmount(0);
      practiceSessionRef.current = Date.now().toString();

      // AI 开场白
      setMessages([{
        id: 'opener',
        role: 'assistant',
        content: scene.aiOpener,
      }]);
    })();
  }, [sceneId]);

  const scrollToBottom = () => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const awardCompletionXp = async () => {
    if (!scene) return;
    setRewardStatus('pending');
    try {
      const reward = await addXp(`dialogue_scene_${scene.id}_${practiceSessionRef.current}`);
      const amount = Number(reward?.xp_gained ?? reward?.awarded ?? 0);
      if (reward?.duplicate || amount <= 0) {
        setRewardAmount(0);
        setRewardStatus('duplicate');
      } else {
        setRewardAmount(amount);
        setRewardStatus('awarded');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('已领取') || message.includes('duplicate')) {
        setRewardAmount(0);
        setRewardStatus('duplicate');
      } else {
        console.warn('[Scene dialogue] XP reward failed:', error);
        setRewardStatus('failed');
      }
    }
  };

  // 保存进度到数据库
  const saveProgress = async (newRounds: number) => {
    if (!scene) return;
    const isNowCompleted = newRounds >= scene.requiredRounds;
    const nextBestRounds = Math.min(scene.requiredRounds, Math.max(bestRounds, newRounds));
    await upsertSceneMapProgress({
      scene_id: scene.id,
      scene_name_zh: scene.nameZh,
      scene_name_en: scene.nameEn,
      category: scene.category,
      status: hasCompletedScene || isNowCompleted ? 'completed' : 'in_progress',
      dialogue_rounds: nextBestRounds,
      last_practiced: new Date().toISOString(),
    });
    setBestRounds(nextBestRounds);
    if (isNowCompleted) {
      completedRef.current = true;
      if (!completed) {
        await awardCompletionXp();
        try {
          await recordActivity('dialogue');
        } catch (activityError) {
          console.warn('[Scene dialogue] activity record failed:', activityError);
        }
      }
      setHasCompletedScene(true);
      setCompleted(true);
    }
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!scene || !trimmed || streaming || sendLockRef.current) return;

    const currentRounds = Math.min(userRoundsRef.current, scene.requiredRounds);
    if (completedRef.current || currentRounds >= scene.requiredRounds) {
      userRoundsRef.current = scene.requiredRounds;
      completedRef.current = true;
      setUserRounds(scene.requiredRounds);
      setCompleted(true);
      return;
    }

    sendLockRef.current = true;
    setInput('');

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: trimmed };
    const aiId = (Date.now() + 1).toString();
    const aiMsg: Message = { id: aiId, role: 'assistant', content: '', streaming: true };

    setMessages(prev => [...prev, userMsg, aiMsg]);
    setStreaming(true);
    scrollToBottom();

    const newRounds = Math.min(scene.requiredRounds, currentRounds + 1);
    const isFinalRound = newRounds >= scene.requiredRounds;

    try {
      const history = [...messages.filter(m => m.id !== 'opener'), userMsg].map(m => ({
        role: m.role, content: m.content,
      }));

      abortRef.current = new AbortController();
      let authHeader = `Bearer ${publicServiceKey}`;
      if (!isLocalServiceMode) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) authHeader = `Bearer ${session.access_token}`;
      }

      const res = await fetch(
        functionUrl('scene-dialogue-chat'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
            apikey: publicServiceKey,
          },
          body: JSON.stringify({
            messages: history,
            sceneId: scene?.id,
            sceneNameZh: scene?.nameZh,
            sceneNameEn: scene?.nameEn,
            dialogueGoal: scene?.dialogueGoal,
            currentRound: newRounds,
            requiredRounds: scene?.requiredRounds,
            isFinalRound,
          }),
          signal: abortRef.current.signal,
        }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('No body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

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
      userRoundsRef.current = newRounds;
      setUserRounds(newRounds);
      if (isFinalRound) {
        completedRef.current = true;
        setHasCompletedScene(true);
        setCompleted(true);
      }
      try {
        await saveProgress(newRounds);
      } catch (progressError) {
        console.warn('[Scene dialogue] progress save failed:', progressError);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setMessages(prev => prev.filter(m => m.id !== aiId));
        return;
      }
      console.warn('[Scene dialogue] request failed:', e);
      setMessages(prev => prev.map(m =>
        m.id === aiId ? { ...m, content: '对话连接失败，请重新发送。', streaming: false } : m
      ));
    } finally {
      abortRef.current = null;
      sendLockRef.current = false;
      setStreaming(false);
      scrollToBottom();
    }
  };

  const handleRestart = () => {
    abortRef.current?.abort();
    stopLocalSpeech();
    setStreaming(false);
    sendLockRef.current = false;
    setSpeakingId(null);
    setUserRounds(0);
    userRoundsRef.current = 0;
    setCompleted(false);
    completedRef.current = false;
    setMessages(scene ? [{ id: 'opener', role: 'assistant', content: scene.aiOpener }] : []);
    setInput('');
    setMicError('');
    setRewardStatus('idle');
    setRewardAmount(0);
    practiceSessionRef.current = Date.now().toString();
  };

  const handleReturnToMap = () => {
    abortRef.current?.abort();
    stopLocalSpeech();
    router.replace('/(app)/scene-map' as any);
  };

  if (!scene) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG }}>
        <Text style={{ color: GRAY }}>场景不存在</Text>
      </View>
    );
  }

  const progressPct = Math.min(100, Math.round((userRounds / scene.requiredRounds) * 100));
  const gradColors: [string, string] = scene.category === 'daily'
    ? ['#1E40AF', '#2563EB']
    : ['#EA580C', '#F97316'];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="light" backgroundColor="transparent" translucent />

      {/* ── 顶部导航 ── */}
      <LinearGradient
        colors={gradColors}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable
            onPress={handleReturnToMap}
            accessibilityRole="button"
            accessibilityLabel="返回场景地图"
            className="active:opacity-70"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={20} color={WHITE} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 18 }}>{scene.emoji}</Text>
              <Text style={{ color: WHITE, fontSize: 16, fontWeight: '900' }}>{scene.nameZh}</Text>
              {completed && <CheckCircle2 size={16} color="#86EFAC" />}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: streaming ? '#FCD34D' : '#86EFAC' }} />
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>
                {streaming ? 'AI 回复中…' : `${Math.min(userRounds, scene.requiredRounds)} / ${scene.requiredRounds} 轮`}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={handleRestart}
            accessibilityRole="button"
            accessibilityLabel="重新开始本轮对话"
            className="active:opacity-70"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <RotateCcw size={16} color={WHITE} />
          </Pressable>
        </View>

        {/* 进度条 */}
        <View style={{ marginTop: 12, gap: 4 }}>
          <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 999, overflow: 'hidden' }}>
            <View style={{
              height: '100%', width: `${progressPct}%`,
              backgroundColor: completed ? '#86EFAC' : WHITE, borderRadius: 999,
            }} />
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* ── 消息列表 ── */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => (
            <Bubble
              msg={item}
              sceneEmoji={scene.emoji}
              onSpeak={item.role === 'assistant' ? () => handleSpeak(item) : undefined}
              isSpeaking={speakingId === item.id}
            />
          )}
          contentContainerStyle={{ paddingTop: 14, paddingBottom: 12 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
          ListFooterComponent={
            completed ? (
              <CompletionBanner
                sceneName={scene.nameZh}
                requiredRounds={scene.requiredRounds}
                rewardStatus={rewardStatus}
                rewardAmount={rewardAmount}
                onRetryReward={awardCompletionXp}
                onContinue={handleRestart}
                onBack={handleReturnToMap}
              />
            ) : null
          }
        />

        {/* ── 输入区 ── */}
        {!completed && (
          <View style={{
            backgroundColor: WHITE, paddingHorizontal: 14, paddingVertical: 12,
            borderTopWidth: 1, borderTopColor: '#F1F5F9',
            shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.04, shadowRadius: 12,
          }}>
            {/* 提示 */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8,
              backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
            }}>
              <Star size={11} color={BLUE} fill={BLUE} />
              <Text style={{ fontSize: 11, color: BLUE, flex: 1 }}>
                你是{scene.userRole}，用英语回复{scene.aiRole}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              {/* 输入框 */}
              <View style={{
                flex: 1, backgroundColor: '#F8FAFF', borderRadius: 22,
                borderWidth: 1.5, borderColor: recording ? '#EF4444' : input.trim() ? '#BFDBFE' : '#E2E8F0',
                paddingHorizontal: 16, paddingVertical: 10, minHeight: 46, maxHeight: 120, justifyContent: 'center',
              }}>
                {requestingMic ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color={BLUE} />
                    <Text style={{ fontSize: 14, color: GRAY }}>等待麦克风授权…</Text>
                  </View>
                ) : recognizing ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color={BLUE} />
                    <Text style={{ fontSize: 14, color: GRAY }}>识别中…</Text>
                  </View>
                ) : recording ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
                    <Text style={{ fontSize: 14, color: '#EF4444' }}>录音中，再次点击麦克风停止…</Text>
                  </View>
                ) : (
                  <TextInput
                    value={input}
                    onChangeText={setInput}
                    placeholder="用英语回复…"
                    placeholderTextColor="#94A3B8"
                    multiline
                    style={{ fontSize: 15, color: '#1E293B', lineHeight: 22, padding: 0 }}
                    editable={!streaming}
                  />
                )}
              </View>

              {/* 麦克风按钮 */}
              {!streaming && (
                <Pressable
                  onPress={handleMicPress}
                  disabled={requestingMic || recognizing}
                  accessibilityRole="button"
                  accessibilityLabel={recording
                    ? '停止录音'
                    : requestingMic
                      ? '正在请求麦克风权限'
                      : recognizing
                        ? '正在识别语音'
                        : '开始语音输入'}
                  className="active:opacity-75"
                  style={{
                    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: recording ? '#FEE2E2' : recognizing ? '#F1F5F9' : '#EFF6FF',
                    borderWidth: 1.5,
                    borderColor: recording ? '#FCA5A5' : recognizing ? '#E2E8F0' : '#BFDBFE',
                  }}
                >
                  {requestingMic || recognizing
                    ? <ActivityIndicator size="small" color={BLUE} />
                    : recording
                      ? <MicOff size={20} color="#EF4444" />
                      : <Mic size={20} color={BLUE} />
                  }
                </Pressable>
              )}

              {/* 发送 / 停止流 按钮 */}
              {streaming ? (
                <Pressable
                  onPress={() => abortRef.current?.abort()}
                  accessibilityRole="button"
                  accessibilityLabel="停止生成回复"
                  className="active:opacity-75"
                  style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
                  <RotateCcw size={18} color="#EF4444" />
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => sendMessage(input)}
                  disabled={!input.trim() || requestingMic || recording || recognizing}
                  accessibilityRole="button"
                  accessibilityLabel="发送场景对话"
                  className="active:opacity-80"
                  style={{ width: 46, height: 46, borderRadius: 23, overflow: 'hidden' }}>
                  {input.trim() ? (
                    <LinearGradient colors={gradColors} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Send size={20} color={WHITE} />
                    </LinearGradient>
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
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

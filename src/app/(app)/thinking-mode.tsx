import { useAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, Bookmark, BookOpen, Camera, ChevronLeft, Eye, Languages, MessageCircle, MessageSquare, Mic, RefreshCw, Volume2 } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { createHighFreqWord, createLearningRecord, createSentence, invokeEdgeFunction, updateLearningRecord, upsertScene } from '@/lib/api';
import { consumePendingUri } from '@/lib/imageStore';
import { speakWithTTS, stopLocalSpeech } from '@/lib/speech';

type Difficulty = 'simple' | 'natural' | 'advanced';
type SentenceKey = 'i_see' | 'i_think' | 'i_say';
type SpeechRate = 0.8 | 1;

interface ThinkingResult {
  scene_name: string;
  i_see: string;
  i_think: string;
  i_say: string;
  words: string[];
  vision_used?: boolean;
  web_fallback?: boolean;
}

const FALLBACK_IMAGE = 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_a781594c-4d9a-42be-8a26-4e12780b9593.jpg';

/** 可靠的 base64 读取：web 用 FileReader，native 用 FileSystem */
async function readImageBase64(uri: string): Promise<string> {
  try {
    const compressed = await manipulateAsync(
      uri,
      [{ resize: { width: 1600 } }],
      { base64: true, compress: 0.72, format: SaveFormat.JPEG },
    );
    if (compressed.base64) return compressed.base64;
  } catch (error) {
    console.warn('image compression failed, using original image:', error);
  }

  if (process.env.EXPO_OS === 'web') {
    try {
      // data URI（expo-image-picker web 返回 data:image/...;base64,...）
      if (uri.startsWith('data:')) {
        const b64 = uri.split(',')[1];
        return b64 || '';
      }
      // blob URL — 用 fetch + FileReader 转 base64
      const resp = await fetch(uri);
      const blob = await resp.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1] || '');
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('readImageBase64 web failed:', e);
      return '';
    }
  }
  // Native：FileSystem.readAsStringAsync
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    return base64 || '';
  } catch (e) {
    console.warn('readImageBase64 native failed:', e);
    return '';
  }
}

function normalizeThinkingResult(value: unknown): ThinkingResult {
  if (!value || typeof value !== 'object') throw new Error('AI 返回格式异常，请重试');
  const data = value as Record<string, unknown>;
  const required = ['scene_name', 'i_see', 'i_think', 'i_say'] as const;
  const normalized = Object.fromEntries(required.map((key) => [key, typeof data[key] === 'string' ? data[key].trim() : ''])) as Record<typeof required[number], string>;
  if (required.some((key) => !normalized[key])) throw new Error('AI 返回内容不完整，请重试');

  const words = Array.isArray(data.words)
    ? [...new Set(data.words.filter((word): word is string => typeof word === 'string').map((word) => word.trim()).filter(Boolean))].slice(0, 20)
    : [];
  return {
    ...normalized,
    words,
    vision_used: data.vision_used === true,
    web_fallback: data.web_fallback === true,
  };
}

const BLUE = '#4A90E2';
const BLUE_DARK = '#2E5C8A';
const YELLOW = '#FFD60A';
const DEFAULT_SPEECH_RATES: Record<SentenceKey, SpeechRate> = {
  i_see: 1,
  i_think: 1,
  i_say: 1,
};

const CARD_CONFIG = [
  {
    key: 'i_see' as const, label: '看场景', en: 'See', Icon: Eye,
    headerBg: YELLOW, headerText: '#1C1C1E', bodyBg: '#FFFDF0',
    dotColor: YELLOW,
  },
  {
    key: 'i_think' as const, label: '学表达', en: 'Learn', Icon: BookOpen,
    headerBg: BLUE_DARK, headerText: '#FFFFFF', bodyBg: '#F0F5FB',
    dotColor: BLUE,
  },
  {
    key: 'i_say' as const, label: '开口说', en: 'Speak', Icon: MessageSquare,
    headerBg: '#FF6B35', headerText: '#FFFFFF', bodyBg: '#FFF5F0',
    dotColor: '#FF6B35',
  },
];

const DIFFICULTY_CONFIG = [
  { value: 'simple' as Difficulty, label: '🌱 简单', sub: 'A1-A2' },
  { value: 'natural' as Difficulty, label: '✨ 自然', sub: 'B1-B2' },
  { value: 'advanced' as Difficulty, label: '🔥 高级', sub: 'C1-C2' },
];

export default function ThinkingModeScreen() {
  const router = useRouter();
  const { inputType, text } = useLocalSearchParams();
  const [difficulty, setDifficulty] = useState<Difficulty>('natural');
  const [result, setResult] = useState<ThinkingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [speechRates, setSpeechRates] = useState<Record<SentenceKey, SpeechRate>>(DEFAULT_SPEECH_RATES);
  const [regeneratingKey, setRegeneratingKey] = useState<SentenceKey | null>(null);
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // 翻译状态：每个 card key 对应一条中文译文
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingKey, setTranslatingKey] = useState<string | null>(null);
  const imageUri = useRef(consumePendingUri()).current;
  // 防止切换 Tab 回来时重复分析
  const hasGenerated = useRef(false);
  const player = useAudioPlayer();

  /** 一键翻译三张卡片全部英文 */
  const handleTranslateAll = async () => {
    if (!result) return;
    const keys = CARD_CONFIG.map(c => c.key);
    // 已全部翻译 → 切换显示/隐藏
    const allTranslated = keys.every(k => translations[k] && translations[k] !== '__hidden__');
    const anyHidden    = keys.some(k => translations[k] === '__hidden__');
    if (allTranslated || anyHidden) {
      const allVisible = keys.every(k => translations[k] && translations[k] !== '__hidden__');
      setTranslations(prev => {
        const next = { ...prev };
        keys.forEach(k => {
          if (allVisible) {
            next[`${k}_cached`] = next[k];
            next[k] = '__hidden__';
          } else {
            next[k] = next[`${k}_cached`] || next[k];
          }
        });
        return next;
      });
      return;
    }
    // 并发翻译尚未翻译的卡片
    setTranslatingKey('__all__');
    const tasks = keys
      .filter(k => !translations[k] || translations[k] === '__hidden__')
      .map(async k => {
        try {
          const res = await invokeEdgeFunction('translate', { text: result[k], targetLang: 'zh' });
          setTranslations(prev => ({ ...prev, [k]: res.translation || res.result || '' }));
        } catch {
          setTranslations(prev => ({ ...prev, [k]: '翻译失败，请重试' }));
        }
      });
    await Promise.all(tasks);
    setTranslatingKey(null);
  };

  /** 翻译单条英文句子为中文 */
  const handleTranslate = async (key: string, text: string) => {
    if (translations[key]) {
      // 已有译文则切换显示/隐藏
      setTranslations(prev => {
        const next = { ...prev };
        if (next[key] === '__hidden__') {
          next[key] = next[`${key}_cached`] || next[key];
        } else {
          next[`${key}_cached`] = next[key];
          next[key] = '__hidden__';
        }
        return next;
      });
      return;
    }
    setTranslatingKey(key);
    try {
      const res = await invokeEdgeFunction('translate', { text, targetLang: 'zh' });
      setTranslations(prev => ({ ...prev, [key]: res.translation || res.result || '' }));
    } catch (e) {
      console.error('translate error', e);
      setTranslations(prev => ({ ...prev, [key]: '翻译失败，请重试' }));
    } finally {
      setTranslatingKey(null);
    }
  };

  const generate = useCallback(async (diff: Difficulty) => {
    setLoading(true);
    setResult(null);
    setError(null);
    setActionError(null);
    setTranslations({});
    try {
      const rawText = Array.isArray(text) ? text[0] || '' : text || '';
      const type = (Array.isArray(inputType) ? inputType[0] : inputType) || 'manual';

      // 可靠读取图片 base64
      const imageBase64 = (type === 'photo' && imageUri)
        ? await readImageBase64(imageUri)
        : '';
      if (type === 'photo' && !imageUri) throw new Error('图片已失效，请返回首页重新选择图片');
      if (type === 'photo' && !imageBase64) throw new Error('无法读取图片，请重新选择 JPG 或 PNG 图片');
      if (imageBase64.length > 10_000_000) throw new Error('图片仍然过大，请选择较小的图片后重试');
      const persistedSceneImage = type === 'photo' && imageBase64
        ? `data:image/jpeg;base64,${imageBase64}`
        : null;

      const response = await invokeEdgeFunction('thinking-mode', {
        scene: rawText,
        imageBase64,
        difficulty: diff,
        inputType: type,
      });

      if (response?.error) throw new Error(response.error);
      const data = normalizeThinkingResult(response);
      setResult(data);

      const recordValues = {
        input_type: type,
        scene_image: persistedSceneImage,
        input_text: rawText,
        scene_name: data.scene_name,
        i_see: data.i_see,
        i_think: data.i_think,
        i_say: data.i_say,
        difficulty: diff,
        words: data.words,
      };
      const rec = recordId
        ? await updateLearningRecord(recordId, recordValues).then(() => ({ id: recordId }))
        : await createLearningRecord(recordValues);

      if (rec && !recordId) {
        setRecordId(rec.id);
        await Promise.allSettled([
          upsertScene({ scene_name: data.scene_name, scene_image: persistedSceneImage }),
          ...data.words.map((word) => createHighFreqWord(word)),
          ...([data.i_see, data.i_think, data.i_say].map((sentence) => createSentence({ sentence, record_id: rec.id }))),
        ]);
      }
    } catch (e: any) {
      setError(e?.message || '生成失败，请检查网络或 API Key 配置');
    } finally {
      setLoading(false);
    }
  }, [inputType, text, imageUri, recordId]);

  useFocusEffect(useCallback(() => {
    if (hasGenerated.current) return;
    hasGenerated.current = true;
    (async () => { await generate(difficulty); })();
  }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDifficulty = (v: Difficulty) => {
    setDifficulty(v);
    (async () => { await generate(v); })();
  };

  const persistRegeneratedResult = async (next: ThinkingResult, changedSentences: string[]) => {
    if (!recordId) return;
    await updateLearningRecord(recordId, {
      scene_name: next.scene_name,
      i_see: next.i_see,
      i_think: next.i_think,
      i_say: next.i_say,
      words: next.words,
    });
    await Promise.allSettled([
      ...next.words.map((word) => createHighFreqWord(word)),
      ...changedSentences.map((sentence) => createSentence({ sentence, record_id: recordId })),
    ]);
  };

  const handleRegenerateSentence = async (key: SentenceKey) => {
    if (!result || regeneratingKey || regeneratingAll) return;
    stopLocalSpeech();
    setSpeakingKey(null);
    setRegeneratingKey(key);
    setActionError(null);
    try {
      const response = await invokeEdgeFunction('thinking-mode', {
        scene: result.scene_name,
        difficulty,
        inputType: 'manual',
        regenerateKey: key,
        currentResult: result,
      });
      if (response?.error) throw new Error(response.error);
      const data = normalizeThinkingResult(response);
      const next: ThinkingResult = {
        ...result,
        [key]: data[key],
        words: data.words.length > 0 ? data.words : result.words,
      };
      setResult(next);
      setTranslations((previous) => {
        const updated = { ...previous };
        delete updated[key];
        delete updated[`${key}_cached`];
        return updated;
      });
      await persistRegeneratedResult(next, [next[key]]);
    } catch (e: any) {
      setActionError(e?.message || '换句失败，请稍后重试');
    } finally {
      setRegeneratingKey(null);
    }
  };

  const handleRegenerateAll = async () => {
    if (!result || regeneratingKey || regeneratingAll) return;
    stopLocalSpeech();
    setSpeakingKey(null);
    setRegeneratingAll(true);
    setActionError(null);
    try {
      const response = await invokeEdgeFunction('thinking-mode', {
        scene: result.scene_name,
        difficulty,
        inputType: 'manual',
        regenerateAll: true,
        currentResult: result,
      });
      if (response?.error) throw new Error(response.error);
      const data = normalizeThinkingResult(response);
      const next: ThinkingResult = {
        ...data,
        scene_name: result.scene_name,
        vision_used: result.vision_used,
        web_fallback: result.web_fallback,
      };
      setResult(next);
      setTranslations({});
      await persistRegeneratedResult(next, [next.i_see, next.i_think, next.i_say]);
    } catch (e: any) {
      setActionError(e?.message || '换一组失败，请稍后重试');
    } finally {
      setRegeneratingAll(false);
    }
  };

  const handleSpeechRate = (key: SentenceKey, rate: SpeechRate) => {
    if (speakingKey === key) {
      stopLocalSpeech();
      setSpeakingKey(null);
    }
    setSpeechRates((previous) => ({ ...previous, [key]: rate }));
  };

  const handleSpeak = (sentence: string, key: SentenceKey) => {
    if (process.env.EXPO_OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (speakingKey === key) {
      // 停止播放
      stopLocalSpeech();
      if (process.env.EXPO_OS !== 'web') { try { player.pause(); } catch { /* ignore */ } }
      setSpeakingKey(null);
      return;
    }
    setSpeakingKey(key);
    void speakWithTTS(
      sentence,
      player,
      invokeEdgeFunction,
      () => setSpeakingKey(null),
      { rate: speechRates[key] },
    );
  };

  const handleSave = async () => {
    if (recordId && !saved) {
      await updateLearningRecord(recordId, { is_favorited: true });
      setSaved(true);
      if (process.env.EXPO_OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleWordPress = (word: string) => {
    const clean = word.replace(/[^a-zA-Z]/g, '');
    if (clean) router.push({ pathname: '/(app)/word-detail', params: { word: clean, scene: result?.scene_name } } as any);
  };

  const renderSentence = (sentence: string, _isDark: boolean) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
      {sentence.split(' ').map((word, i) => (
        <Pressable key={i} onPress={() => handleWordPress(word)} className="active:opacity-50">
          <Text style={{ fontSize: 15, lineHeight: 26, color: '#1E293B', fontWeight: '500' }}>
            {word}{' '}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const displayImage = imageUri || FALLBACK_IMAGE;

  return (
    <View style={{ flex: 1, backgroundColor: '#F0F4F8' }}>
      {/* 顶部导航栏 */}
      <View style={{ backgroundColor: BLUE_DARK, paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => router.back()} className="active:opacity-70"
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={20} color="#FFFFFF" />
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>场景英语</Text>
        <Pressable onPress={handleSave} className="active:opacity-70"
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <Bookmark size={18} color={saved ? YELLOW : '#FFFFFF'} fill={saved ? YELLOW : 'transparent'} />
        </Pressable>
      </View>

      <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} bounces>
        {/* 场景图片 */}
        <View style={{ marginHorizontal: 16, marginTop: 14, borderRadius: 24, overflow: 'hidden', height: 210,
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16 }}>
          <Image source={{ uri: displayImage }} style={{ width: '100%', height: 210 }} contentFit="cover" transition={400} />
          {/* 渐变遮罩 */}
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 90, backgroundColor: 'rgba(0,0,0,0.42)' }} />
          <View style={{ position: 'absolute', bottom: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {result ? (
              <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Camera size={12} color={YELLOW} />
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>{result.scene_name}</Text>
              </View>
            ) : <View />}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {result?.vision_used && (
                <View style={{ backgroundColor: YELLOW, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
                  <Text style={{ color: '#1C1C1E', fontSize: 10, fontWeight: '800' }}>👁 AI视觉</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Web/视觉降级提示 */}
        {result?.web_fallback && (
          <View style={{ marginHorizontal: 16, marginTop: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF8E7', borderWidth: 1, borderColor: YELLOW + '50' }}>
            <AlertCircle size={14} color="#F59E0B" />
            <Text style={{ fontSize: 11, color: '#92400E', flex: 1 }}>Web预览不支持图片识别，请在手机App中使用拍照功能</Text>
          </View>
        )}

        {/* 难度选择 */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginTop: 12, gap: 8 }}>
          {DIFFICULTY_CONFIG.map(({ value, label, sub }) => {
            const active = difficulty === value;
            return (
              <Pressable key={value} onPress={() => handleDifficulty(value)}
                className="active:opacity-80"
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center',
                  backgroundColor: active ? BLUE : '#FFFFFF',
                  shadowColor: active ? BLUE : '#000',
                  shadowOffset: { width: 0, height: active ? 4 : 1 },
                  shadowOpacity: active ? 0.25 : 0.06, shadowRadius: active ? 10 : 4,
                  borderWidth: active ? 0 : 1, borderColor: '#E2E8F0',
                }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: active ? '#FFFFFF' : '#64748B' }}>{label}</Text>
                <Text style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.75)' : '#94A3B8', marginTop: 2 }}>{sub}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* 内容区 */}
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 56, gap: 16 }}>
            {/* 脉冲加载动画容器 */}
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" color={BLUE} />
            </View>
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 15, color: '#1E293B', fontWeight: '700' }}>AI 正在分析场景...</Text>
              <Text style={{ fontSize: 12, color: '#94A3B8' }}>
                {(inputType as string) === 'photo' ? '🔍 通义千问视觉识别中' : '🧠 生成英语思维表达中'}
              </Text>
            </View>
            {/* 步骤提示 */}
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, gap: 6 }}>
              {['识别场景内容', '生成三步场景表达', '提取重点词汇'].map((step, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: BLUE + '30', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: BLUE }}>{i + 1}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>{step}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : error ? (
          <View style={{ margin: 16, borderRadius: 20, backgroundColor: '#FFF5F5', padding: 24, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#FCA5A5' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
              <AlertCircle size={28} color="#EF4444" />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E293B' }}>识别失败</Text>
            <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20 }}>{error}</Text>
            <Pressable onPress={() => generate(difficulty)} className="active:opacity-80"
              style={{ backgroundColor: BLUE, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 12 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>重新识别</Text>
            </Pressable>
          </View>
        ) : result ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 12, gap: 12 }}>
            {/* 一键翻译全部 */}
            {(() => {
              const keys = CARD_CONFIG.map(c => c.key);
              const allVisible = keys.every(k => translations[k] && translations[k] !== '__hidden__');
              const isTranslatingAll = translatingKey === '__all__';
              return (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={handleTranslateAll}
                    disabled={regeneratingAll || regeneratingKey !== null}
                    className="active:opacity-70"
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                      backgroundColor: allVisible ? BLUE + '15' : '#FFFFFF',
                      borderRadius: 14, paddingVertical: 11,
                      borderWidth: 1.5,
                      borderColor: allVisible ? BLUE + '60' : '#E2E8F0',
                      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4,
                    }}>
                    {isTranslatingAll
                      ? <ActivityIndicator size={15} color={BLUE} />
                      : <Languages size={15} color={allVisible ? BLUE : '#64748B'} />
                    }
                    <Text style={{ fontSize: 13, fontWeight: '800', color: allVisible ? BLUE : '#475569' }}>
                      {isTranslatingAll ? '翻译中…' : allVisible ? '隐藏全部译文' : '一键翻译全部'}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="换一组场景英语句子"
                    onPress={handleRegenerateAll}
                    disabled={regeneratingAll || regeneratingKey !== null}
                    className="active:opacity-70"
                    style={{
                      minWidth: 106, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      backgroundColor: BLUE_DARK, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
                      opacity: regeneratingKey ? 0.55 : 1,
                    }}>
                    {regeneratingAll
                      ? <ActivityIndicator size={15} color="#FFFFFF" />
                      : <RefreshCw size={15} color="#FFFFFF" />
                    }
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>
                      {regeneratingAll ? '生成中…' : '换一组'}
                    </Text>
                  </Pressable>
                </View>
              );
            })()}

            {actionError && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FCA5A5' }}>
                <AlertCircle size={14} color="#DC2626" />
                <Text style={{ flex: 1, fontSize: 12, lineHeight: 18, color: '#991B1B' }}>{actionError}</Text>
              </View>
            )}

            {/* 看场景、学表达、开口说 */}
            {CARD_CONFIG.map((cfg) => {
              const isSpeaking = speakingKey === cfg.key;
              return (
                <View key={cfg.key} style={{
                  borderRadius: 20, overflow: 'hidden',
                  shadowColor: cfg.dotColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 14,
                }}>
                  {/* 彩色标题栏 */}
                  <View style={{ backgroundColor: cfg.headerBg, paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <cfg.Icon size={17} color={cfg.headerText} />
                      <Text style={{ color: cfg.headerText, fontSize: 16, fontWeight: '800' }}>{cfg.label}</Text>
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
                        <Text style={{ color: cfg.headerText, fontSize: 10, fontWeight: '700' }}>{cfg.en}</Text>
                      </View>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${isSpeaking ? '停止' : '朗读'}${cfg.label}英文句子`}
                      onPress={() => handleSpeak(result[cfg.key], cfg.key)}
                      className="active:opacity-70"
                      style={{
                        width: 36, height: 36, borderRadius: 18,
                        backgroundColor: isSpeaking ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.2)',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                      <Volume2 size={16} color={isSpeaking ? YELLOW : cfg.headerText} />
                    </Pressable>
                  </View>
                  {/* 浅色内容区 */}
                  <View style={{ backgroundColor: cfg.bodyBg, paddingHorizontal: 16, paddingVertical: 14 }}>
                    {renderSentence(result[cfg.key], false)}
                    {isSpeaking && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                        {[0,1,2].map(i => (
                          <View key={i} style={{ width: 4, height: 4 + i * 3, borderRadius: 2, backgroundColor: cfg.dotColor, opacity: 0.8 }} />
                        ))}
                        <Text style={{ fontSize: 11, color: '#94A3B8', marginLeft: 2 }}>朗读中，点击停止</Text>
                      </View>
                    )}

                    {/* 单句操作 */}
                    <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <Pressable
                        onPress={() => handleTranslate(cfg.key, result[cfg.key])}
                        disabled={regeneratingKey === cfg.key || regeneratingAll}
                        className="active:opacity-70"
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 5,
                          backgroundColor: translations[cfg.key] && translations[cfg.key] !== '__hidden__'
                            ? cfg.dotColor + '22' : '#F1F5F9',
                          borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
                          borderWidth: 1,
                          borderColor: translations[cfg.key] && translations[cfg.key] !== '__hidden__'
                            ? cfg.dotColor + '50' : '#E2E8F0',
                        }}>
                        {translatingKey === cfg.key
                          ? <ActivityIndicator size={12} color={cfg.dotColor} />
                          : <Languages size={13} color={
                              translations[cfg.key] && translations[cfg.key] !== '__hidden__'
                                ? cfg.dotColor : '#64748B'
                            } />
                        }
                        <Text style={{
                          fontSize: 12, fontWeight: '700',
                          color: translations[cfg.key] && translations[cfg.key] !== '__hidden__'
                            ? cfg.dotColor : '#64748B',
                        }}>
                          {translatingKey === cfg.key ? '翻译中…'
                            : translations[cfg.key] && translations[cfg.key] !== '__hidden__' ? '隐藏译文'
                            : '查看中文'}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`替换${cfg.label}句子`}
                        onPress={() => handleRegenerateSentence(cfg.key)}
                        disabled={regeneratingKey !== null || regeneratingAll}
                        className="active:opacity-70"
                        style={{
                          minWidth: 86, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                          backgroundColor: '#F1F5F9', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
                          borderWidth: 1, borderColor: '#E2E8F0',
                          opacity: regeneratingAll || (regeneratingKey && regeneratingKey !== cfg.key) ? 0.5 : 1,
                        }}>
                        {regeneratingKey === cfg.key
                          ? <ActivityIndicator size={12} color={cfg.dotColor} />
                          : <RefreshCw size={13} color="#64748B" />
                        }
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>
                          {regeneratingKey === cfg.key ? '生成中…' : '换一句'}
                        </Text>
                      </Pressable>
                      <View
                        accessibilityLabel={`${cfg.label}朗读语速`}
                        style={{
                          marginLeft: 'auto', height: 32, flexDirection: 'row', alignItems: 'center',
                          backgroundColor: '#E2E8F0', borderRadius: 999, padding: 3, gap: 2,
                        }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', paddingHorizontal: 5 }}>语速</Text>
                        {([0.8, 1] as const).map((rate) => {
                          const active = speechRates[cfg.key] === rate;
                          return (
                            <Pressable
                              key={rate}
                              accessibilityRole="button"
                              accessibilityLabel={`${rate}倍语速`}
                              accessibilityState={{ selected: active }}
                              onPress={() => handleSpeechRate(cfg.key, rate)}
                              style={{
                                minWidth: 42, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                                backgroundColor: active ? '#FFFFFF' : 'transparent',
                              }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: active ? BLUE_DARK : '#64748B' }}>{rate.toFixed(1)}×</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    {/* 译文展示 */}
                    {translations[cfg.key] && translations[cfg.key] !== '__hidden__' && (
                      <View style={{
                        marginTop: 10, backgroundColor: '#FFFFFF',
                        borderRadius: 12, padding: 12,
                        borderLeftWidth: 3, borderLeftColor: cfg.dotColor,
                      }}>
                        <Text style={{ fontSize: 12, color: '#94A3B8', fontWeight: '600', marginBottom: 4 }}>中文译文</Text>
                        <Text style={{ fontSize: 14, color: '#1E293B', lineHeight: 22 }}>
                          {translations[cfg.key]}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

            {/* 重点词汇 */}
            {result.words.length > 0 && (
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: BLUE }} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B' }}>重点词汇</Text>
                  <Text style={{ fontSize: 11, color: '#94A3B8' }}>· 点击查详情</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {result.words.map((w, i) => (
                    <Pressable key={i} onPress={() => handleWordPress(w)}
                      className="active:opacity-60"
                      style={{
                        backgroundColor: '#F0F4F8',
                        borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7,
                        borderWidth: 1, borderColor: BLUE + '30',
                      }}>
                      <Text style={{ fontSize: 13, color: BLUE, fontWeight: '700' }}>{w}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* 操作按钮 */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable className="active:opacity-80"
                onPress={() => router.push({ pathname: '/(app)/dialogue', params: { scene: result.scene_name, recordId } } as any)}
                style={{
                  flex: 1, backgroundColor: BLUE_DARK, borderRadius: 18, paddingVertical: 15,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  shadowColor: BLUE_DARK, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12,
                }}>
                <MessageCircle size={17} color={YELLOW} />
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>AI 场景对话</Text>
              </Pressable>
              <Pressable className="active:opacity-80"
                onPress={() => router.push({ pathname: '/(app)/shadowing', params: { sentence: result.i_say, recordId } } as any)}
                style={{
                  flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 15,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  borderWidth: 1.5, borderColor: '#E2E8F0',
                }}>
                <Mic size={17} color={BLUE} />
                <Text style={{ color: '#1E293B', fontWeight: '800', fontSize: 14 }}>Shadowing</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

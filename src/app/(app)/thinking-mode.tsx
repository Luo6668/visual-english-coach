import { useAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, Bookmark, Camera, Check, ChevronLeft, Languages, MessageCircle, Mic, PencilLine, RefreshCw, ScanLine, Volume2, WifiOff } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { createHighFreqWord, createLearningRecord, createSentence, invokeEdgeFunction, updateLearningRecord, upsertScene } from '@/lib/api';
import { consumePendingUri } from '@/lib/imageStore';
import { isLocalServiceMode } from '@/lib/serviceConfig';
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

interface FavoriteFeedback {
  message: string;
  type: 'success' | 'error';
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
    key: 'i_see' as const, step: '01', label: '看见场景', en: 'SEE',
    accentColor: '#F6C945', numberBg: '#FFF2BE', numberText: '#9A6A00',
  },
  {
    key: 'i_think' as const, step: '02', label: '学会表达', en: 'LEARN',
    accentColor: '#2F80ED', numberBg: '#DCEBFF', numberText: '#1268EE',
  },
  {
    key: 'i_say' as const, step: '03', label: '现在开口', en: 'SPEAK',
    accentColor: '#FF6B2C', numberBg: '#FFE2D3', numberText: '#D94C0F',
  },
];

export default function ThinkingModeScreen() {
  const router = useRouter();
  const { inputType, text } = useLocalSearchParams();
  const [difficulty] = useState<Difficulty>('natural');
  const [result, setResult] = useState<ThinkingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [recognitionProgress, setRecognitionProgress] = useState(12);
  const [saved, setSaved] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [favoriteFeedback, setFavoriteFeedback] = useState<FavoriteFeedback | null>(null);
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
  const favoriteFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 防止切换 Tab 回来时重复分析
  const hasGenerated = useRef(false);
  const player = useAudioPlayer();
  const normalizedInputType = Array.isArray(inputType) ? inputType[0] : inputType;
  const isPhotoRecognition = normalizedInputType === 'photo';

  useEffect(() => {
    if (!loading || !isPhotoRecognition) return;

    const timer = setInterval(() => {
      setRecognitionProgress((current) => {
        if (current >= 88) return current;
        return Math.min(88, current + (current < 52 ? 7 : 3));
      });
    }, 420);

    return () => clearInterval(timer);
  }, [isPhotoRecognition, loading]);

  useEffect(() => () => {
    if (favoriteFeedbackTimer.current) clearTimeout(favoriteFeedbackTimer.current);
  }, []);

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
    setImageReady(false);
    setRecognitionProgress(12);
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
      if (type === 'photo') {
        setImageReady(true);
        setRecognitionProgress((current) => Math.max(current, 36));
      }
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
      if (type === 'photo') setRecognitionProgress(100);

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

  const showFavoriteFeedback = (feedback: FavoriteFeedback) => {
    if (favoriteFeedbackTimer.current) clearTimeout(favoriteFeedbackTimer.current);
    setFavoriteFeedback(feedback);
    favoriteFeedbackTimer.current = setTimeout(() => {
      setFavoriteFeedback(null);
      favoriteFeedbackTimer.current = null;
    }, 2400);
  };

  const handleSave = async () => {
    if (savingFavorite) return;
    if (!recordId) {
      showFavoriteFeedback({ message: '学习记录尚未保存，请稍后重试', type: 'error' });
      return;
    }

    const nextSaved = !saved;
    setSavingFavorite(true);
    setFavoriteFeedback(null);
    try {
      await updateLearningRecord(recordId, { is_favorited: nextSaved });
      setSaved(nextSaved);
      showFavoriteFeedback({
        message: nextSaved ? '已收藏到我的学习记录' : '已取消收藏',
        type: 'success',
      });
      if (process.env.EXPO_OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('update favorite failed:', error);
      showFavoriteFeedback({ message: '收藏状态保存失败，请重试', type: 'error' });
      if (process.env.EXPO_OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setSavingFavorite(false);
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
          <Text style={{ fontSize: 17, lineHeight: 28, color: '#10213D', fontWeight: '700' }}>
            {word}{' '}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const displayImage = imageUri || FALLBACK_IMAGE;

  if (isPhotoRecognition && (loading || error)) {
    const completed = Boolean(result);
    const statusTitle = error
      ? '识别未完成'
      : completed
        ? '识别成功！'
        : imageReady
          ? '图片读取成功'
          : '正在读取图片';
    const statusText = error
      ? error
      : completed
        ? `识别到“${result?.scene_name || '当前场景'}”，正在整理学习内容。`
        : imageReady
          ? '图片已经准备好，AI 正在分析场景内容。'
          : '正在读取你选择的图片，请稍候。';

    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <View style={{ paddingTop: 52, paddingBottom: 17, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#EEF1F5' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            onPress={() => router.back()}
            className="active:opacity-60"
            style={{ width: 38, height: 38, alignItems: 'flex-start', justifyContent: 'center' }}>
            <ChevronLeft size={28} color="#0F1E3A" strokeWidth={2.1} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 19, fontWeight: '800', color: '#101828' }}>正在识别</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32, gap: 18 }}>
          <View style={{ borderWidth: 1, borderColor: '#DDE3EC', borderRadius: 16, backgroundColor: '#FFFFFF', padding: 16, flexDirection: 'row', gap: 16 }}>
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={{ width: 116, height: 116, borderRadius: 14, backgroundColor: '#EEF3F8' }}
                contentFit="cover"
                transition={250}
              />
            ) : (
              <View style={{ width: 116, height: 116, borderRadius: 14, backgroundColor: '#F3F6FA', alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={32} color="#8B98AA" />
              </View>
            )}

            <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ScanLine size={27} color={error ? '#E5484D' : '#1268EE'} strokeWidth={2.2} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#101828' }}>{error ? '识别失败' : completed ? '整理学习内容' : '正在识别'}</Text>
                  <Text style={{ marginTop: 4, fontSize: 12, lineHeight: 18, color: '#7A8799' }}>
                    {error ? '请检查图片后重新尝试' : completed ? '马上为你展示结果' : 'AI 正在分析图片内容…'}
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 17, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, height: 9, borderRadius: 999, overflow: 'hidden', backgroundColor: '#E8EDF4' }}>
                  <View style={{ width: `${error ? recognitionProgress : completed ? 100 : recognitionProgress}%`, height: '100%', borderRadius: 999, backgroundColor: error ? '#E5484D' : '#1268EE' }} />
                </View>
                <Text style={{ width: 34, fontSize: 13, fontWeight: '700', color: '#667085', textAlign: 'right' }}>
                  {completed ? 100 : recognitionProgress}%
                </Text>
              </View>
            </View>
          </View>

          <View style={{ borderRadius: 16, backgroundColor: error ? '#FFF1F2' : '#ECF9F3', paddingHorizontal: 18, paddingVertical: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: error ? '#E5484D' : '#20AA72', alignItems: 'center', justifyContent: 'center' }}>
              {error ? <AlertCircle size={23} color="#FFFFFF" /> : imageReady || completed ? <Check size={24} color="#FFFFFF" strokeWidth={2.6} /> : <ActivityIndicator size="small" color="#FFFFFF" />}
            </View>
            <View style={{ flex: 1, paddingTop: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#152235' }}>{statusTitle}</Text>
              <Text style={{ marginTop: 5, fontSize: 13, lineHeight: 20, color: error ? '#A33A43' : '#637083' }}>{statusText}</Text>
            </View>
          </View>

          {isLocalServiceMode && (
            <View style={{ borderRadius: 16, backgroundColor: '#FFF7E6', paddingHorizontal: 18, paddingVertical: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFC857', alignItems: 'center', justifyContent: 'center' }}>
                <WifiOff size={21} color="#162033" strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, paddingTop: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#152235' }}>已切换到本地服务模式</Text>
                <Text style={{ marginTop: 5, fontSize: 13, lineHeight: 20, color: '#6F7887' }}>
                  当前由本机服务处理识别请求，学习记录会保存在本地。
                </Text>
              </View>
            </View>
          )}

          <View style={{ borderWidth: 1, borderColor: '#DDE3EC', borderRadius: 16, backgroundColor: '#FFFFFF', padding: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#7A8799' }}>当前图片：</Text>
            <View style={{ marginTop: 10, minHeight: 58, borderRadius: 12, backgroundColor: '#F4F6F9', paddingLeft: 16, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text numberOfLines={2} style={{ flex: 1, fontSize: 15, lineHeight: 21, fontWeight: '600', color: '#1A2940' }}>
                {completed ? result?.scene_name : error ? '请返回重新选择，或直接再次识别' : '正在提取图片中的场景信息…'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="返回重新选择图片"
                onPress={() => router.replace('/(app)/(tabs)/home' as any)}
                className="active:opacity-60"
                style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
                <PencilLine size={20} color="#617087" />
              </Pressable>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={error ? '重新尝试识别' : '正在识别图片'}
            accessibilityState={{ disabled: !error }}
            disabled={!error}
            onPress={() => generate(difficulty)}
            className="active:opacity-80"
            style={{ height: 58, borderRadius: 14, backgroundColor: '#1268EE', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: error ? 1 : 0.72 }}>
            {error ? <RefreshCw size={21} color="#FFFFFF" /> : <ActivityIndicator size="small" color="#FFFFFF" />}
            <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800' }}>{error ? '重新尝试' : '正在识别…'}</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* 顶部导航栏 */}
      <View style={{ backgroundColor: '#FFFFFF', paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#EEF2F6' }}>
        <Pressable onPress={() => router.back()} className="active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel="返回"
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={25} color="#1268EE" strokeWidth={2.2} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '900', color: '#1268EE' }}>场景英语</Text>
        <Pressable onPress={handleSave} disabled={savingFavorite} className="active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={saved ? '取消收藏这个场景' : '收藏这个场景'}
          accessibilityState={{ disabled: savingFavorite, selected: saved }}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: savingFavorite ? 0.65 : 1 }}>
          {savingFavorite
            ? <ActivityIndicator size={20} color="#1268EE" />
            : <Bookmark size={23} color="#1268EE" fill={saved ? '#1268EE' : 'transparent'} />
          }
        </Pressable>
      </View>

      {favoriteFeedback && (
        <View
          accessibilityRole="alert"
          style={{
            position: 'absolute', top: 108, left: 0, right: 0, zIndex: 20,
            alignItems: 'center', paddingHorizontal: 24,
          }}>
          <View style={{
            width: '100%', maxWidth: 360, minHeight: 42,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
            backgroundColor: favoriteFeedback.type === 'success' ? '#ECFDF5' : '#FFF1F2',
            borderWidth: 1,
            borderColor: favoriteFeedback.type === 'success' ? '#A7F3D0' : '#FECDD3',
            shadowColor: '#10213D', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10,
          }}>
            {favoriteFeedback.type === 'success'
              ? <Check size={17} color="#059669" strokeWidth={2.6} />
              : <AlertCircle size={17} color="#E11D48" strokeWidth={2.4} />
            }
            <Text style={{ color: favoriteFeedback.type === 'success' ? '#047857' : '#BE123C', fontSize: 13, fontWeight: '800' }}>
              {favoriteFeedback.message}
            </Text>
          </View>
        </View>
      )}

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        bounces
        contentContainerStyle={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        {/* 场景图片 */}
        <View style={{ marginHorizontal: 16, marginTop: 14, borderRadius: 18, overflow: 'hidden', height: 270,
          shadowColor: '#253B5B', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.14, shadowRadius: 15 }}>
          <Image source={{ uri: displayImage }} style={{ width: '100%', height: 270 }} contentFit="cover" transition={400} />
          {/* 渐变遮罩 */}
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 116, backgroundColor: 'rgba(7,18,35,0.55)' }} />
          <View style={{ position: 'absolute', bottom: 15, left: 16, right: 14, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            {result ? (
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 22, lineHeight: 28, fontWeight: '900' }}>{result.scene_name}</Text>
                <Text style={{ marginTop: 4, color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600' }}>先学会一句现在就能用的英语</Text>
              </View>
            ) : <View />}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {result?.vision_used && (
                <View style={{ backgroundColor: 'rgba(9,21,42,0.76)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' }}>
                  <Camera size={13} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>AI视觉</Text>
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
                      minHeight: 52, backgroundColor: allVisible ? '#EFF6FF' : '#FFFFFF',
                      borderRadius: 12, paddingVertical: 12,
                      borderWidth: 1.5, borderColor: '#1268EE',
                    }}>
                    {isTranslatingAll ? <ActivityIndicator size={17} color="#1268EE" /> : <Languages size={18} color="#1268EE" />}
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#1268EE' }}>
                      {isTranslatingAll ? '翻译中…' : allVisible ? '隐藏全部译文' : '翻译全部'}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="换一组场景英语句子"
                    onPress={handleRegenerateAll}
                    disabled={regeneratingAll || regeneratingKey !== null}
                    className="active:opacity-70"
                    style={{
                      flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                      backgroundColor: '#1268EE', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                      opacity: regeneratingKey ? 0.55 : 1,
                    }}>
                    {regeneratingAll
                      ? <ActivityIndicator size={17} color="#FFFFFF" />
                      : <RefreshCw size={18} color="#FFFFFF" />
                    }
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>
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
                  position: 'relative', borderRadius: 14, overflow: 'hidden',
                  backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
                  shadowColor: '#29496E', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.09, shadowRadius: 12,
                }}>
                  <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 5, backgroundColor: cfg.accentColor }} />
                  <View style={{ paddingLeft: 19, paddingRight: 16, paddingTop: 16, paddingBottom: 15 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: cfg.numberBg, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: cfg.numberText, fontSize: 15, fontWeight: '900' }}>{cfg.step}</Text>
                      </View>
                      <Text style={{ marginLeft: 10, color: '#10213D', fontSize: 17, fontWeight: '900' }}>{cfg.label}</Text>
                      <Text style={{ marginLeft: 10, color: '#8B98AA', fontSize: 12, fontWeight: '800' }}>{cfg.en}</Text>
                      <View style={{ flex: 1 }} />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${isSpeaking ? '停止' : '朗读'}${cfg.label}英文句子`}
                        onPress={() => handleSpeak(result[cfg.key], cfg.key)}
                        className="active:opacity-70"
                        style={{
                          width: 40, height: 40, borderRadius: 20,
                          backgroundColor: isSpeaking ? cfg.numberBg : '#F2F5F9',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                        <Volume2 size={19} color={isSpeaking ? cfg.numberText : '#11284A'} />
                      </Pressable>
                    </View>

                    <View style={{ marginTop: 15 }}>
                      {renderSentence(result[cfg.key], false)}
                    </View>
                    {isSpeaking && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                        {[0,1,2].map(i => (
                          <View key={i} style={{ width: 4, height: 4 + i * 3, borderRadius: 2, backgroundColor: cfg.accentColor, opacity: 0.85 }} />
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
                            ? cfg.numberBg : '#F3F5F8',
                          minWidth: 72, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8,
                          borderWidth: 1,
                          borderColor: translations[cfg.key] && translations[cfg.key] !== '__hidden__'
                            ? cfg.accentColor : '#EDF0F4',
                        }}>
                        {translatingKey === cfg.key
                          ? <ActivityIndicator size={13} color={cfg.numberText} />
                          : <Languages size={13} color={
                              translations[cfg.key] && translations[cfg.key] !== '__hidden__'
                                ? cfg.numberText : '#526176'
                            } />
                        }
                        <Text style={{
                          fontSize: 12, fontWeight: '700',
                          color: translations[cfg.key] && translations[cfg.key] !== '__hidden__'
                            ? cfg.numberText : '#526176',
                        }}>
                          {translatingKey === cfg.key ? '翻译中…'
                            : translations[cfg.key] && translations[cfg.key] !== '__hidden__' ? '隐藏中文'
                            : '中文'}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`替换${cfg.label}句子`}
                        onPress={() => handleRegenerateSentence(cfg.key)}
                        disabled={regeneratingKey !== null || regeneratingAll}
                        className="active:opacity-70"
                        style={{
                          minWidth: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                          backgroundColor: '#F3F5F8', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8,
                          borderWidth: 1, borderColor: '#EDF0F4',
                          opacity: regeneratingAll || (regeneratingKey && regeneratingKey !== cfg.key) ? 0.5 : 1,
                        }}>
                        {regeneratingKey === cfg.key
                          ? <ActivityIndicator size={13} color={cfg.numberText} />
                          : <RefreshCw size={13} color="#526176" />
                        }
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#526176' }}>
                          {regeneratingKey === cfg.key ? '生成中…' : '换一句'}
                        </Text>
                      </Pressable>
                      <View
                        accessibilityLabel={`${cfg.label}朗读语速`}
                        style={{
                          marginLeft: 'auto', height: 36, flexDirection: 'row', alignItems: 'center',
                          backgroundColor: '#F3F5F8', borderRadius: 10, padding: 3, gap: 2,
                        }}>
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
                                minWidth: 48, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                                backgroundColor: active ? '#DCEBFF' : 'transparent',
                              }}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: active ? '#1268EE' : '#667085' }}>{rate.toFixed(1)}×</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    {/* 译文展示 */}
                    {translations[cfg.key] && translations[cfg.key] !== '__hidden__' && (
                      <View style={{
                        marginTop: 11, backgroundColor: '#F8FAFC',
                        borderRadius: 10, padding: 12,
                        borderLeftWidth: 3, borderLeftColor: cfg.accentColor,
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

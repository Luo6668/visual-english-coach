import { useAudioPlayer } from 'expo-audio';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, Bookmark, CheckCircle2, ChevronLeft, Languages, MessageCircle, Mic, RefreshCw, Save, Volume2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { createHighFreqWord, createSentence, fetchLearningRecord, invokeEdgeFunction, updateLearningRecord } from '@/lib/api';
import { speakWithTTS, stopLocalSpeech } from '@/lib/speech';

const BLUE       = '#4A90E2';
const BLUE_DARK  = '#2E5C8A';
const YELLOW     = '#FFD60A';
const GREEN      = '#34C759';
const WHITE      = '#FFFFFF';
const BG         = '#F5F8FF';

type SentenceKey = 'i_see' | 'i_think' | 'i_say';
type SpeechRate = 0.8 | 1;
type NoteSaveState = 'idle' | 'saved' | 'error';

const DEFAULT_SPEECH_RATES: Record<SentenceKey, SpeechRate> = {
  i_see: 1,
  i_think: 1,
  i_say: 1,
};

function normalizeGeneratedResult(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('AI 返回格式异常，请重试');
  const data = value as Record<string, unknown>;
  const required: SentenceKey[] = ['i_see', 'i_think', 'i_say'];
  const sentences = Object.fromEntries(
    required.map((key) => [key, typeof data[key] === 'string' ? data[key].trim() : '']),
  ) as Record<SentenceKey, string>;
  if (required.some((key) => !sentences[key])) throw new Error('AI 返回内容不完整，请重试');
  return {
    scene_name: typeof data.scene_name === 'string' ? data.scene_name.trim() : '',
    ...sentences,
    words: Array.isArray(data.words)
      ? [...new Set(data.words.filter((word): word is string => typeof word === 'string').map((word) => word.trim()).filter(Boolean))].slice(0, 20)
      : [],
  };
}

const LAYER_CONFIG = [
  {
    key: 'i_see', step: '01', label: '看见场景', en: 'SEE',
    accentColor: '#F6C945', numberBg: '#FFF2BE', numberText: '#9A6A00',
  },
  {
    key: 'i_think', step: '02', label: '学会表达', en: 'LEARN',
    accentColor: '#2F80ED', numberBg: '#DCEBFF', numberText: '#1268EE',
  },
  {
    key: 'i_say', step: '03', label: '现在开口', en: 'SPEAK',
    accentColor: '#FF6B2C', numberBg: '#FFE2D3', numberText: '#D94C0F',
  },
] as const;

export default function RecordDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [note, setNote]         = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [saving, setSaving]     = useState(false);
  const [noteSaveState, setNoteSaveState] = useState<NoteSaveState>('idle');
  const [noteSaveError, setNoteSaveError] = useState<string | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [speakingKey, setSpeakingKey] = useState<SentenceKey | null>(null);
  const [speechRates, setSpeechRates] = useState<Record<SentenceKey, SpeechRate>>(DEFAULT_SPEECH_RATES);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingKey, setTranslatingKey] = useState<SentenceKey | null>(null);
  const [regeneratingKey, setRegeneratingKey] = useState<SentenceKey | null>(null);
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const player = useAudioPlayer();

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      setTranslations({});
      setActionError(null);
      setImageFailed(false);
      setNoteSaveState('idle');
      setNoteSaveError(null);
      try {
        const data = await fetchLearningRecord(String(id));
        if (data) {
          const loadedNote = data.user_note || '';
          setRecord(data);
          setNote(loadedNote);
          setSavedNote(loadedNote);
          setFavorited(!!data.is_favorited);
        }
      } finally { setLoading(false); }
    })();
    return () => stopLocalSpeech();
  }, [id]));

  const handlePlay = (text: string, key: SentenceKey) => {
    if (speakingKey === key) {
      stopLocalSpeech();
      setSpeakingKey(null);
      return;
    }
    setSpeakingKey(key);
    void speakWithTTS(
      text,
      player,
      invokeEdgeFunction,
      () => setSpeakingKey(null),
      { rate: speechRates[key] },
    );
  };

  const handleSpeechRate = (key: SentenceKey, rate: SpeechRate) => {
    if (speakingKey === key) {
      stopLocalSpeech();
      setSpeakingKey(null);
    }
    setSpeechRates((previous) => ({ ...previous, [key]: rate }));
  };

  const handleTranslate = async (key: SentenceKey, text: string) => {
    if (translations[key]) {
      setTranslations((previous) => {
        const next = { ...previous };
        if (next[key] === '__hidden__') {
          next[key] = next[`${key}_cached`] || '';
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
      const response = await invokeEdgeFunction('translate', { text, targetLang: 'zh' });
      setTranslations((previous) => ({
        ...previous,
        [key]: response.translation || response.result || '翻译失败，请重试',
      }));
    } catch {
      setTranslations((previous) => ({ ...previous, [key]: '翻译失败，请重试' }));
    } finally {
      setTranslatingKey(null);
    }
  };

  const persistRegeneratedResult = async (next: any, changedSentences: string[]) => {
    await updateLearningRecord(String(id), {
      scene_name: next.scene_name,
      i_see: next.i_see,
      i_think: next.i_think,
      i_say: next.i_say,
      words: next.words || [],
    });
    await Promise.allSettled([
      ...(next.words || []).map((word: string) => createHighFreqWord(word)),
      ...changedSentences.map((sentence) => createSentence({ sentence, record_id: String(id) })),
    ]);
  };

  const handleRegenerateSentence = async (key: SentenceKey) => {
    if (!record || regeneratingKey || regeneratingAll) return;
    stopLocalSpeech();
    setSpeakingKey(null);
    setRegeneratingKey(key);
    setActionError(null);
    try {
      const response = await invokeEdgeFunction('thinking-mode', {
        scene: record.scene_name,
        difficulty: record.difficulty || 'natural',
        inputType: 'manual',
        regenerateKey: key,
        currentResult: record,
      });
      if (response?.error) throw new Error(response.error);
      const data = normalizeGeneratedResult(response);
      const next = {
        ...record,
        [key]: data[key],
        words: data.words.length > 0 ? data.words : record.words || [],
      };
      setRecord(next);
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
    if (!record || regeneratingKey || regeneratingAll) return;
    stopLocalSpeech();
    setSpeakingKey(null);
    setRegeneratingAll(true);
    setActionError(null);
    try {
      const response = await invokeEdgeFunction('thinking-mode', {
        scene: record.scene_name,
        difficulty: record.difficulty || 'natural',
        inputType: 'manual',
        regenerateAll: true,
        currentResult: record,
      });
      if (response?.error) throw new Error(response.error);
      const data = normalizeGeneratedResult(response);
      const next = {
        ...record,
        ...data,
        scene_name: record.scene_name,
      };
      setRecord(next);
      setTranslations({});
      await persistRegeneratedResult(next, [next.i_see, next.i_think, next.i_say]);
    } catch (e: any) {
      setActionError(e?.message || '换一组失败，请稍后重试');
    } finally {
      setRegeneratingAll(false);
    }
  };

  const handleSaveNote = async () => {
    if (saving) return;
    if (note === savedNote) {
      setNoteSaveState('saved');
      setNoteSaveError(null);
      return;
    }
    setSaving(true);
    setNoteSaveState('idle');
    setNoteSaveError(null);
    try {
      await updateLearningRecord(String(id), { user_note: note });
      setSavedNote(note);
      setRecord((previous: any) => previous ? { ...previous, user_note: note } : previous);
      setNoteSaveState('saved');
    } catch (error: any) {
      setNoteSaveState('error');
      setNoteSaveError(error?.message || '备注保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFav = async () => {
    const next = !favorited;
    setFavorited(next);
    await updateLearningRecord(String(id), { is_favorited: next });
  };

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={BLUE} />
    </View>
  );
  if (!record) return (
    <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#94A3B8', fontSize: 14 }}>记录不存在</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── 场景图 + 返回导航叠层 ── */}
      <View style={{ position: 'relative' }}>
        <Image
          source={record.scene_image && !record.scene_image.startsWith('blob:') && !imageFailed
            ? { uri: record.scene_image }
            : require('../../../../assets/home-cafe-hero.png')}
          style={{ width: '100%', height: 240 }}
          contentFit="cover"
          transition={300}
          onError={() => setImageFailed(true)}
        />
        {/* 渐变遮罩 */}
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, backgroundColor: 'rgba(0,0,0,0.45)' }} />

        {/* 导航栏 */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 54, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => router.back()} className="active:opacity-70"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={20} color={WHITE} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={handleToggleFav} className="active:opacity-70"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
            <Bookmark size={18} color={favorited ? YELLOW : WHITE} fill={favorited ? YELLOW : 'transparent'} />
          </Pressable>
        </View>

        {/* 场景名 + 时间 */}
        <View style={{ position: 'absolute', bottom: 12, left: 16, right: 16 }}>
          <Text style={{ color: WHITE, fontSize: 20, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>{record.scene_name}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 }}>
            {new Date(record.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
        <View style={{ padding: 16, gap: 14, paddingBottom: 40 }}>

          {/* ── 看场景、学表达、开口说 ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#1E293B' }}>三步场景表达</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="换一组场景英语句子"
              onPress={handleRegenerateAll}
              disabled={regeneratingAll || regeneratingKey !== null}
              className="active:opacity-70"
              style={{
                minWidth: 106, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                backgroundColor: BLUE_DARK, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
                opacity: regeneratingKey ? 0.55 : 1,
              }}>
              {regeneratingAll
                ? <ActivityIndicator size={15} color={WHITE} />
                : <RefreshCw size={15} color={WHITE} />
              }
              <Text style={{ fontSize: 13, fontWeight: '800', color: WHITE }}>
                {regeneratingAll ? '生成中…' : '换一组'}
              </Text>
            </Pressable>
          </View>

          {actionError && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FCA5A5' }}>
              <AlertCircle size={14} color="#DC2626" />
              <Text style={{ flex: 1, fontSize: 12, lineHeight: 18, color: '#991B1B' }}>{actionError}</Text>
            </View>
          )}

          {LAYER_CONFIG.map(cfg => {
            const text = record[cfg.key];
            const isSpeaking = speakingKey === cfg.key;
            if (!text) return null;
            return (
              <View key={cfg.key} style={{
                position: 'relative', borderRadius: 14, overflow: 'hidden',
                backgroundColor: WHITE, borderWidth: 1, borderColor: '#E2E8F0',
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
                      onPress={() => handlePlay(text, cfg.key)}
                      className="active:opacity-70"
                      style={{
                        width: 40, height: 40, borderRadius: 20,
                        backgroundColor: isSpeaking ? cfg.numberBg : '#F2F5F9',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                      <Volume2 size={19} color={isSpeaking ? cfg.numberText : '#11284A'} />
                    </Pressable>
                  </View>

                  <Text style={{ marginTop: 15, fontSize: 17, lineHeight: 28, color: '#10213D', fontWeight: '700' }}>{text}</Text>
                  {isSpeaking && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                      {[0, 1, 2].map(index => (
                        <View key={index} style={{ width: 4, height: 4 + index * 3, borderRadius: 2, backgroundColor: cfg.accentColor, opacity: 0.85 }} />
                      ))}
                      <Text style={{ fontSize: 11, color: '#94A3B8', marginLeft: 2 }}>朗读中，点击停止</Text>
                    </View>
                  )}

                  <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <Pressable
                      onPress={() => handleTranslate(cfg.key, text)}
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
                    <View style={{
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

                  {translations[cfg.key] && translations[cfg.key] !== '__hidden__' && (
                    <View style={{ marginTop: 11, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: cfg.accentColor }}>
                      <Text style={{ fontSize: 12, color: '#94A3B8', fontWeight: '600', marginBottom: 4 }}>中文译文</Text>
                      <Text style={{ fontSize: 14, color: '#1E293B', lineHeight: 22 }}>{translations[cfg.key]}</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}

          {/* ── Shadowing 评分 ── */}
          {record.shadowing_score != null && (
            <View style={{ backgroundColor: WHITE, borderRadius: 20, padding: 18, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E293B' }}>Shadowing 评分</Text>
                <View style={{ backgroundColor: record.shadowing_score >= 80 ? GREEN + '20' : YELLOW + '30', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: record.shadowing_score >= 80 ? GREEN : '#B45309' }}>{record.shadowing_score}分</Text>
                </View>
              </View>
              {record.shadowing_feedback && (
                <Text style={{ fontSize: 13, color: '#64748B', lineHeight: 20 }}>{record.shadowing_feedback}</Text>
              )}
            </View>
          )}

          {/* ── 我的备注 ── */}
          <View style={{ backgroundColor: WHITE, borderRadius: 20, padding: 18, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E293B' }}>📝 我的备注</Text>
            <TextInput
              style={{ backgroundColor: '#F8FAFF', borderRadius: 14, padding: 14, fontSize: 14, color: '#1E293B', minHeight: 72, lineHeight: 22 }}
              value={note}
              onChangeText={(value) => {
                setNote(value);
                setNoteSaveState('idle');
                setNoteSaveError(null);
              }}
              placeholder="添加中文备注、心得…"
              placeholderTextColor="#94A3B8"
              editable={!saving}
              multiline
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={noteSaveState === 'saved' ? '备注已保存' : '保存备注'}
              onPress={handleSaveNote}
              disabled={saving}
              className="active:opacity-80"
              style={{
                backgroundColor: noteSaveState === 'saved' ? GREEN : noteSaveState === 'error' ? '#DC2626' : BLUE,
                borderRadius: 14, paddingVertical: 12, alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: 6,
                opacity: saving ? 0.75 : 1,
              }}>
              {saving ? (
                <>
                  <ActivityIndicator color={WHITE} size="small" />
                  <Text style={{ color: WHITE, fontWeight: '800', fontSize: 14 }}>保存中…</Text>
                </>
              ) : noteSaveState === 'saved' ? (
                <>
                  <CheckCircle2 size={16} color={WHITE} />
                  <Text style={{ color: WHITE, fontWeight: '800', fontSize: 14 }}>已保存</Text>
                </>
              ) : (
                <>
                  {noteSaveState === 'error' ? <AlertCircle size={16} color={WHITE} /> : <Save size={16} color={WHITE} />}
                  <Text style={{ color: WHITE, fontWeight: '800', fontSize: 14 }}>
                    {noteSaveState === 'error' ? '重试保存' : '保存备注'}
                  </Text>
                </>
              )}
            </Pressable>
            {noteSaveError && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={13} color="#DC2626" />
                <Text style={{ flex: 1, fontSize: 12, lineHeight: 18, color: '#B91C1C' }}>{noteSaveError}</Text>
              </View>
            )}
          </View>

          {/* ── 继续练习 ── */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable className="active:opacity-80"
              onPress={() => router.push({ pathname: '/(app)/dialogue', params: { scene: record.scene_name, recordId: record.id } } as any)}
              style={{ flex: 1, backgroundColor: BLUE_DARK, borderRadius: 18, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: BLUE_DARK, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 }}>
              <MessageCircle size={17} color={YELLOW} />
              <Text style={{ color: WHITE, fontWeight: '800', fontSize: 14 }}>AI 场景对话</Text>
            </Pressable>
            <Pressable className="active:opacity-80"
              onPress={() => router.push({ pathname: '/(app)/shadowing', params: { sentence: record.i_say, recordId: record.id } } as any)}
              style={{ flex: 1, backgroundColor: WHITE, borderRadius: 18, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#E2E8F0' }}>
              <Mic size={17} color={BLUE} />
              <Text style={{ color: '#1E293B', fontWeight: '800', fontSize: 14 }}>Shadowing</Text>
            </Pressable>
          </View>

        </View>
      </ScrollView>
    </View>
  );
}

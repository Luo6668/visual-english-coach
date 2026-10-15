import { useAudioPlayer } from 'expo-audio';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, Bookmark, BookOpen, CheckCircle2, ChevronLeft, Eye, Languages, MessageCircle, MessageSquare, Mic, RefreshCw, Save, Volume2 } from 'lucide-react-native';
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
  { key: 'i_see',   label: '看场景', en: 'See',   Icon: Eye,           headerBg: YELLOW,    headerText: '#1C1C1E', bodyBg: '#FFFDF0' },
  { key: 'i_think', label: '学表达', en: 'Learn', Icon: BookOpen,      headerBg: BLUE_DARK, headerText: WHITE,     bodyBg: '#F0F5FB' },
  { key: 'i_say',   label: '开口说', en: 'Speak', Icon: MessageSquare, headerBg: '#FF6B35', headerText: WHITE,     bodyBg: '#FFF5F0' },
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
            if (!text) return null;
            return (
              <View key={cfg.key} style={{ borderRadius: 20, overflow: 'hidden', shadowColor: cfg.headerBg, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 14 }}>
                <View style={{ backgroundColor: cfg.headerBg, paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <cfg.Icon size={16} color={cfg.headerText} />
                    <Text style={{ color: cfg.headerText, fontSize: 15, fontWeight: '800' }}>{cfg.label}</Text>
                    <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
                      <Text style={{ color: cfg.headerText, fontSize: 10, fontWeight: '700' }}>{cfg.en}</Text>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${speakingKey === cfg.key ? '停止' : '朗读'}${cfg.label}英文句子`}
                    onPress={() => handlePlay(text, cfg.key)}
                    className="active:opacity-70"
                    style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                    <Volume2 size={15} color={cfg.headerText} />
                  </Pressable>
                </View>
                <View style={{ backgroundColor: cfg.bodyBg, paddingHorizontal: 16, paddingVertical: 14 }}>
                  <Text style={{ fontSize: 15, color: '#1E293B', lineHeight: 24, fontWeight: '500' }}>{text}</Text>
                  {speakingKey === cfg.key && (
                    <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>朗读中，点击扬声器停止</Text>
                  )}
                  <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <Pressable
                      onPress={() => handleTranslate(cfg.key, text)}
                      disabled={regeneratingKey === cfg.key || regeneratingAll}
                      className="active:opacity-70"
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        backgroundColor: translations[cfg.key] && translations[cfg.key] !== '__hidden__' ? cfg.headerBg + '22' : '#F1F5F9',
                        borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
                        borderWidth: 1, borderColor: '#E2E8F0',
                      }}>
                      {translatingKey === cfg.key
                        ? <ActivityIndicator size={12} color={BLUE} />
                        : <Languages size={13} color="#64748B" />
                      }
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>
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
                        ? <ActivityIndicator size={12} color={BLUE} />
                        : <RefreshCw size={13} color="#64748B" />
                      }
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>
                        {regeneratingKey === cfg.key ? '生成中…' : '换一句'}
                      </Text>
                    </Pressable>
                    <View style={{ marginLeft: 'auto', height: 32, flexDirection: 'row', alignItems: 'center', backgroundColor: '#E2E8F0', borderRadius: 999, padding: 3, gap: 2 }}>
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
                            style={{ minWidth: 42, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? WHITE : 'transparent' }}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: active ? BLUE_DARK : '#64748B' }}>{rate.toFixed(1)}×</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {translations[cfg.key] && translations[cfg.key] !== '__hidden__' && (
                    <View style={{ marginTop: 10, backgroundColor: WHITE, borderRadius: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: cfg.headerBg }}>
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

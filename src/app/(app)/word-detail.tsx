import { useAudioPlayer } from 'expo-audio';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Bookmark, ChevronLeft, Mic, Volume2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { createWord, invokeEdgeFunction } from '@/lib/api';
import { speakWithTTS, stopLocalSpeech } from '@/lib/speech';

const BLUE      = '#4A90E2';
const BLUE_DARK = '#2E5C8A';
const BLUE_LIGHT = '#EEF5FF';
const YELLOW    = '#FFD60A';
const WHITE     = '#FFFFFF';
const BG        = '#F5F8FF';

interface WordDetail {
  word: string;
  phonetic: string;
  meaning: string;
  partOfSpeech: string;
  collocations: string[];
  examples: string[];
  memoryTip?: string;
}

function normalizeWordDetail(value: unknown, fallbackWord: string): WordDetail {
  if (!value || typeof value !== 'object') throw new Error('AI 返回格式异常，请重试');
  const data = value as Record<string, unknown>;
  const word = typeof data.word === 'string' && data.word.trim() ? data.word.trim() : fallbackWord;
  const meaning = typeof data.meaning === 'string' ? data.meaning.trim() : '';
  if (!meaning) throw new Error('AI 未返回有效词义，请重试');
  const stringList = (item: unknown) => Array.isArray(item)
    ? item.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
    : [];
  return {
    word,
    meaning,
    phonetic: typeof data.phonetic === 'string' ? data.phonetic.trim() : '',
    partOfSpeech: typeof data.partOfSpeech === 'string' ? data.partOfSpeech.trim() : '',
    collocations: stringList(data.collocations),
    examples: stringList(data.examples),
    memoryTip: typeof data.memoryTip === 'string' ? data.memoryTip.trim() : undefined,
  };
}

export default function WordDetailScreen() {
  const router = useRouter();
  const { word, scene } = useLocalSearchParams();
  const targetWord = (Array.isArray(word) ? word[0] : word) || 'coffee';

  const [detail, setDetail]   = useState<WordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved]     = useState(false);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const player = useAudioPlayer();

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      try {
        const data = normalizeWordDetail(await invokeEdgeFunction('word-detail', { word: targetWord }), targetWord);
        setDetail(data);
        await createWord({
          word: data.word, phonetic: data.phonetic, meaning: data.meaning,
          part_of_speech: data.partOfSpeech, collocations: data.collocations, example_sentences: data.examples,
        });
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
    return () => stopLocalSpeech();
  }, [targetWord]));

  const handlePlay = (text: string, key: string) => {
    if (speakingKey === key) {
      stopLocalSpeech();
      setSpeakingKey(null);
      return;
    }
    setSpeakingKey(key);
    void speakWithTTS(text, player, invokeEdgeFunction, () => setSpeakingKey(null));
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* ── 顶部 Hero ── */}
      <View style={{ backgroundColor: BLUE_LIGHT, paddingTop: 56, paddingBottom: 24, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#D6E8FF' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Pressable onPress={() => router.back()} className="active:opacity-70"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={20} color={BLUE} />
          </Pressable>
          <Text style={{ color: '#64748B', fontSize: 13, flex: 1 }}>
            {scene ? `来自场景：${scene}` : '单词详情'}
          </Text>
          <Pressable onPress={() => setSaved(!saved)} className="active:opacity-70"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Bookmark size={18} color={saved ? YELLOW : BLUE} fill={saved ? YELLOW : 'transparent'} />
          </Pressable>
        </View>

        {/* 大字单词展示 */}
        <View style={{ gap: 8 }}>
          <Text style={{ color: '#1E293B', fontSize: 40, fontWeight: '900', letterSpacing: 1 }}>{targetWord}</Text>
          {detail && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ color: '#64748B', fontSize: 15 }}>{detail.phonetic}</Text>
              <View style={{ backgroundColor: BLUE + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ color: BLUE_DARK, fontSize: 11, fontWeight: '700' }}>{detail.partOfSpeech}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${speakingKey === 'word' ? '停止' : '朗读'}单词 ${targetWord}`}
                onPress={() => handlePlay(targetWord, 'word')}
                className="active:opacity-70"
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center' }}>
                <Volume2 size={15} color={BLUE} />
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
            <ActivityIndicator size="large" color={BLUE} />
            <Text style={{ color: '#94A3B8', fontSize: 13 }}>AI 正在查找词汇信息...</Text>
          </View>
        ) : detail ? (
          <View style={{ padding: 16, gap: 14, paddingBottom: 40 }}>

            {/* ── 中文释义 ── */}
            <View style={{ backgroundColor: WHITE, borderRadius: 20, padding: 18, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: YELLOW }} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#64748B' }}>中文释义</Text>
              </View>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#1E293B', lineHeight: 28 }}>{detail.meaning}</Text>
            </View>

            {/* ── 常见搭配 ── */}
            <View style={{ backgroundColor: WHITE, borderRadius: 20, padding: 18, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: BLUE }} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#64748B' }}>常见搭配</Text>
              </View>
              <View style={{ gap: 8 }}>
                {detail.collocations.map((c, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F8FAFF', borderRadius: 12, padding: 12 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: BLUE + '20', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: BLUE }}>{i + 1}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${speakingKey === `collocation-${i}` ? '停止' : '朗读'}搭配 ${c}`}
                      onPress={() => handlePlay(c, `collocation-${i}`)}
                      style={{ flex: 1 }} className="active:opacity-70">
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#1E293B', lineHeight: 20 }}>{c}</Text>
                    </Pressable>
                    <Volume2 size={13} color="#CBD5E1" />
                  </View>
                ))}
              </View>
            </View>

            {/* ── 场景例句 ── */}
            <View style={{ backgroundColor: WHITE, borderRadius: 20, padding: 18, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: '#8B5CF6' }} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#64748B' }}>场景例句</Text>
              </View>
              <View style={{ gap: 10 }}>
                {detail.examples.map((e, i) => (
                  <View key={i} style={{ borderLeftWidth: 3, borderLeftColor: '#8B5CF6', paddingLeft: 14, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 14, color: '#1E293B', lineHeight: 22, fontWeight: '500' }}>{e}</Text>
                    <Pressable onPress={() => router.push({ pathname: '/(app)/shadowing', params: { sentence: e } } as any)}
                      className="active:opacity-70" style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
                      <Mic size={11} color="#8B5CF6" />
                      <Text style={{ fontSize: 11, color: '#8B5CF6', fontWeight: '700' }}>跟读这句</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>

            {/* ── 记忆口诀 ── */}
            {detail.memoryTip && (
              <View style={{ backgroundColor: '#FFF8E7', borderRadius: 20, padding: 18, gap: 8, borderWidth: 1, borderColor: '#FDE68A', shadowColor: YELLOW, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: '#F59E0B' }} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#64748B' }}>💡 记忆口诀</Text>
                </View>
                <Text style={{ fontSize: 15, color: '#92400E', lineHeight: 24, fontWeight: '600' }}>{detail.memoryTip}</Text>
              </View>
            )}

          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ color: '#94A3B8', fontSize: 14 }}>词汇信息获取失败，请重试</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

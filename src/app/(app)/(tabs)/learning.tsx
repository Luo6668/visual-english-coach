import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertCircle, AlignLeft, BookMarked, Bookmark, ChevronRight, MapPin, RefreshCw, Star } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { fetchDiaries, fetchLearningRecords, fetchScenes, fetchSentences, fetchWords, updateLearningRecord } from '@/lib/api';

const BLUE       = '#4A90E2';
const BLUE_DARK  = '#2E5C8A';
const BLUE_LIGHT = '#EEF5FF';
const WHITE      = '#FFFFFF';
const BG         = '#F5F8FF';

const TABS = [
  { key: 'favorites', label: '收藏', icon: Bookmark },
  { key: 'scenes',    label: '场景', icon: MapPin },
  { key: 'sentences', label: '句子', icon: AlignLeft },
  { key: 'words',     label: '单词', icon: Star },
  { key: 'diary',     label: '日记', icon: BookMarked },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function LearningScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('favorites');
  const [scenes, setScenes]       = useState<any[]>([]);
  const [words, setWords]         = useState<any[]>([]);
  const [sentences, setSentences] = useState<any[]>([]);
  const [diaries, setDiaries]     = useState<any[]>([]);
  const [records, setRecords]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [favoriteActionError, setFavoriteActionError] = useState('');
  const [updatingFavoriteId, setUpdatingFavoriteId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, w, se, d, r] = await Promise.all([
        fetchScenes(), fetchWords(), fetchSentences(), fetchDiaries(), fetchLearningRecords(),
      ]);
      setScenes(s); setWords(w); setSentences(se); setDiaries(d); setRecords(r);
    } catch (loadError) {
      console.error('[learning] load failed:', loadError);
      setError('学习记录加载失败，请检查本地服务后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadData();
  }, [loadData]));

  const favorites = records.filter(record => Boolean(record.is_favorited));
  const data = activeTab === 'favorites' ? favorites : activeTab === 'scenes' ? scenes : activeTab === 'sentences' ? sentences : activeTab === 'words' ? words : diaries;

  const handleRemoveFavorite = async (id: string) => {
    if (updatingFavoriteId) return;
    setUpdatingFavoriteId(id);
    setFavoriteActionError('');
    try {
      await updateLearningRecord(id, { is_favorited: false });
      setRecords(previous => previous.map(record => record.id === id ? { ...record, is_favorited: false } : record));
    } catch (updateError) {
      console.error('[learning] remove favorite failed:', updateError);
      setFavoriteActionError('取消收藏失败，请稍后重试。');
    } finally {
      setUpdatingFavoriteId(null);
    }
  };

  const SCENE_ICONS: Record<string, string> = {
    '咖啡店': '☕', '图书馆': '📚', '地铁': '🚇', '机场': '✈️',
    '超市': '🛒', '餐厅': '🍽️', '办公室': '💻', '学校': '🏫',
  };
  const getSceneIcon = (name: string) => {
    for (const [k, v] of Object.entries(SCENE_ICONS)) { if (name.includes(k)) return v; }
    return '📍';
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* 顶部标题 */}
      <View style={{ backgroundColor: BLUE_LIGHT, paddingTop: 58, paddingBottom: 20, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#D6E8FF' }}>
        <Text style={{ color: '#1E293B', fontSize: 24, fontWeight: '800' }}>我的表达本</Text>
        <Text style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
          {favorites.length} 收藏 · {scenes.length} 场景 · {sentences.length} 句子 · {words.length} 单词
        </Text>
      </View>

      {/* Tab 横向切换 */}
      <View style={{ backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: '#E8EDF2' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexDirection: 'row' }}>
          {TABS.map(t => {
            const active = activeTab === t.key;
            return (
              <Pressable key={t.key} onPress={() => setActiveTab(t.key)} className="active:opacity-75"
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: active ? BLUE : '#F0F4F8',
                }}>
                <t.icon size={14} color={active ? WHITE : '#64748B'} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: active ? WHITE : '#64748B' }}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 内容区 */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 28 }}>
          <AlertCircle size={36} color="#EF4444" />
          <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 }}>{error}</Text>
          <Pressable onPress={() => void loadData()} className="active:opacity-75"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: BLUE, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
            <RefreshCw size={15} color={WHITE} />
            <Text style={{ color: WHITE, fontWeight: '700', fontSize: 13 }}>重新加载</Text>
          </Pressable>
        </View>
      ) : data.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          {activeTab === 'favorites'
            ? <Bookmark size={42} color="#94A3B8" strokeWidth={1.7} />
            : <Text style={{ fontSize: 48 }}>📖</Text>
          }
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#1E293B' }}>
            {activeTab === 'favorites' ? '还没有收藏场景' : '暂无内容'}
          </Text>
          <Text style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center' }}>
            {activeTab === 'favorites' ? '在场景英语页面点击右上角书签即可收藏' : '快去拍照识别场景吧！'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item: any) => String(item.id)}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          ListHeaderComponent={activeTab === 'favorites' && favoriteActionError ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FCA5A5' }}>
              <AlertCircle size={15} color="#DC2626" />
              <Text style={{ flex: 1, color: '#991B1B', fontSize: 12 }}>{favoriteActionError}</Text>
            </View>
          ) : null}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
          renderItem={({ item }) => {
            /* ── 收藏的学习记录 ── */
            if (activeTab === 'favorites') return (
              <View style={{
                minHeight: 96, backgroundColor: WHITE, borderRadius: 14,
                flexDirection: 'row', alignItems: 'center',
                borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden',
                shadowColor: '#23456B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8,
              }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`查看收藏场景 ${item.scene_name}`}
                  onPress={() => router.push(`/(app)/record/${item.id}` as any)}
                  className="active:opacity-75"
                  style={{ flex: 1, minWidth: 0, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Image
                    source={item.scene_image && !item.scene_image.startsWith('blob:')
                      ? { uri: item.scene_image }
                      : require('../../../../assets/home-cafe-hero.png')}
                    style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: BLUE_LIGHT }}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: '#1E293B', fontSize: 15, fontWeight: '800' }}>{item.scene_name || '场景英语'}</Text>
                    <Text numberOfLines={2} style={{ marginTop: 5, color: '#64748B', fontSize: 12, lineHeight: 18 }}>{item.i_say || item.i_think || item.i_see}</Text>
                    <Text style={{ marginTop: 5, color: '#94A3B8', fontSize: 10 }}>
                      {String(item.created_at || '').slice(0, 10).replace(/-/g, '.') || '最近收藏'}
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#94A3B8" />
                </Pressable>
                <View style={{ width: 1, height: 52, backgroundColor: '#E8EDF2' }} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`取消收藏 ${item.scene_name}`}
                  onPress={() => void handleRemoveFavorite(String(item.id))}
                  disabled={updatingFavoriteId !== null}
                  className="active:opacity-65"
                  style={{ width: 52, minHeight: 94, alignItems: 'center', justifyContent: 'center', opacity: updatingFavoriteId && updatingFavoriteId !== item.id ? 0.45 : 1 }}>
                  {updatingFavoriteId === item.id
                    ? <ActivityIndicator size={18} color={BLUE} />
                    : <Bookmark size={20} color={BLUE} fill={BLUE} />
                  }
                </Pressable>
              </View>
            );

            /* ── 场景卡片 ── */
            if (activeTab === 'scenes') return (
              <Pressable
                onPress={() => {
                  router.push({ pathname: '/(app)/dialogue', params: { scene: item.scene_name } } as any);
                }}
                className="active:opacity-85"
                style={{ backgroundColor: WHITE, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10 }}>
                <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: BLUE + '15', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 24 }}>{getSceneIcon(item.scene_name)}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#1E293B' }}>{item.scene_name}</Text>
                  <Text style={{ fontSize: 12, color: '#94A3B8' }}>练习了 {item.practice_count ?? 1} 次</Text>
                  <View style={{ flexDirection: 'row', marginTop: 2 }}>
                    <View style={{ backgroundColor: BLUE + '15', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: BLUE }}>已学习</Text>
                    </View>
                  </View>
                </View>
                <ChevronRight size={16} color="#94A3B8" />
              </Pressable>
            );

            /* ── 句子卡片 ── */
            if (activeTab === 'sentences') return (
              <Pressable onPress={() => router.push({ pathname: '/(app)/shadowing', params: { sentence: item.sentence } } as any)}
                className="active:opacity-85"
                style={{ backgroundColor: WHITE, borderRadius: 18, padding: 16, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1E293B', lineHeight: 22 }}>{item.sentence}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: '#F0F4F8' }} />
                  <Text style={{ fontSize: 11, color: '#94A3B8' }}>点击跟读练习</Text>
                </View>
              </Pressable>
            );

            /* ── 单词卡片 ── */
            if (activeTab === 'words') return (
              <Pressable onPress={() => router.push({ pathname: '/(app)/word-detail', params: { word: item.word } } as any)}
                className="active:opacity-85"
                style={{ backgroundColor: WHITE, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10 }}>
                <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#FFD60A20', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#B45309' }}>{item.word?.[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E293B' }}>{item.word}</Text>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>{item.phonetic && `${item.phonetic}  `}{item.meaning}</Text>
                </View>
                <ChevronRight size={16} color="#94A3B8" />
              </Pressable>
            );

            /* ── 日记卡片 ── */
            return (
              <Pressable onPress={() => router.push('/(app)/diary' as any)}
                className="active:opacity-85"
                style={{ backgroundColor: WHITE, borderRadius: 18, padding: 16, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10 }}>
                <View style={{ gap: 5 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ backgroundColor: item.diary_type === 'weekly' ? '#FFF7D6' : BLUE_LIGHT, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: item.diary_type === 'weekly' ? '#9A6700' : BLUE_DARK }}>
                        {item.diary_type === 'weekly' ? 'Weekly Story' : '每日日记'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: '#94A3B8' }}>
                      {new Date(item.study_date || item.week_start || item.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: '#475569', lineHeight: 20 }} numberOfLines={4}>{item.content}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                  <ChevronRight size={16} color="#94A3B8" />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

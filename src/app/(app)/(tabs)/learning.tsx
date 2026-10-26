import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useAudioPlayer } from 'expo-audio';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertCircle, AlignLeft, ArrowRight, BookMarked, Bookmark, CalendarDays, ChevronRight, MapPin, Mic2, RefreshCw, Search, Sparkles, Star, Volume2, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, RefreshControl, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotionPressable } from '@/components/motion-pressable';
import { fetchDiaries, fetchLearningRecords, fetchScenes, fetchSentences, fetchWords, invokeEdgeFunction, updateLearningRecord } from '@/lib/api';
import { speakWithTTS, stopLocalSpeech } from '@/lib/speech';

const BLUE = '#1677F0';
const BLUE_DARK = '#0B4FAD';
const BLUE_SOFT = '#EAF4FF';
const INK = '#101828';
const MUTED = '#66758C';
const WHITE = '#FFFFFF';
const BG = '#F4F8FD';

const TABS = [
  { key: 'favorites', label: '收藏', icon: Bookmark },
  { key: 'scenes', label: '场景', icon: MapPin },
  { key: 'sentences', label: '句子', icon: AlignLeft },
  { key: 'words', label: '单词', icon: Star },
  { key: 'diary', label: '日记', icon: BookMarked },
] as const;

type TabKey = typeof TABS[number]['key'];
type ContentRow = Record<string, any> & { id: string };

const TAB_META: Record<TabKey, { title: string; subtitle: string; empty: string; emptyHint: string }> = {
  favorites: { title: '稍后再练', subtitle: '你亲手保存的高价值表达', empty: '还没有收藏内容', emptyHint: '在场景学习页点亮书签，重要表达就会出现在这里。' },
  scenes: { title: '真实场景', subtitle: '按练习频率持续更新', empty: '还没有练习场景', emptyHint: '完成第一次拍照或文字识别后，场景会自动沉淀在这里。' },
  sentences: { title: '表达句库', subtitle: '点击朗读，进入跟读练习', empty: '还没有收藏句子', emptyHint: '在学习过程中收藏句子，之后可以集中跟读。' },
  words: { title: '词汇卡组', subtitle: '带着真实语境复习单词', empty: '还没有收藏单词', emptyHint: '学习场景中的生词后，它会自动进入你的词汇卡组。' },
  diary: { title: '学习日记', subtitle: '把零散练习串成完整故事', empty: '还没有学习日记', emptyHint: '完成场景学习后，可以让 AI 生成你的专属英语日记。' },
};

function validImageSource(uri?: string | null) {
  if (uri && !uri.startsWith('blob:')) return { uri };
  return require('../../../../assets/home-cafe-hero.png');
}

function formatDate(value?: string | null) {
  if (!value) return '最近学习';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10).replace(/-/g, '.');
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function getSearchText(tab: TabKey, item: ContentRow) {
  if (tab === 'favorites') return [item.scene_name, item.i_see, item.i_think, item.i_say].join(' ');
  if (tab === 'scenes') return String(item.scene_name || '');
  if (tab === 'sentences') return [item.sentence, item.translation].join(' ');
  if (tab === 'words') return [item.word, item.phonetic, item.meaning, item.part_of_speech].join(' ');
  return [item.content, item.diary_type, item.study_date, item.week_start].join(' ');
}

export default function LearningScreen() {
  const router = useRouter();
  const player = useAudioPlayer();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 850);
  const compact = contentWidth < 430;
  const [activeTab, setActiveTab] = useState<TabKey>('favorites');
  const [scenes, setScenes] = useState<ContentRow[]>([]);
  const [words, setWords] = useState<ContentRow[]>([]);
  const [sentences, setSentences] = useState<ContentRow[]>([]);
  const [diaries, setDiaries] = useState<ContentRow[]>([]);
  const [records, setRecords] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [favoriteActionError, setFavoriteActionError] = useState('');
  const [updatingFavoriteId, setUpdatingFavoriteId] = useState<string | null>(null);

  const loadData = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const [sceneRows, wordRows, sentenceRows, diaryRows, recordRows] = await Promise.all([
        fetchScenes(), fetchWords(), fetchSentences(), fetchDiaries(), fetchLearningRecords(),
      ]);
      setScenes(sceneRows);
      setWords(wordRows);
      setSentences(sentenceRows);
      setDiaries(diaryRows);
      setRecords(recordRows);
    } catch (loadError) {
      console.error('[learning] load failed:', loadError);
      setError('表达本暂时没有同步成功，请检查本地服务后重试。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadData();
    return () => stopLocalSpeech();
  }, [loadData]));

  const favorites = useMemo(() => records.filter(record => Boolean(record.is_favorited)), [records]);
  const allData = activeTab === 'favorites' ? favorites : activeTab === 'scenes' ? scenes : activeTab === 'sentences' ? sentences : activeTab === 'words' ? words : diaries;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const data = useMemo(() => normalizedQuery ? allData.filter(item => getSearchText(activeTab, item).toLocaleLowerCase().includes(normalizedQuery)) : allData, [activeTab, allData, normalizedQuery]);
  const counts: Record<TabKey, number> = { favorites: favorites.length, scenes: scenes.length, sentences: sentences.length, words: words.length, diary: diaries.length };
  const recent = records[0];
  const meta = TAB_META[activeTab];

  const handleRemoveFavorite = async (id: string) => {
    if (updatingFavoriteId) return;
    setUpdatingFavoriteId(id);
    setFavoriteActionError('');
    try {
      await updateLearningRecord(id, { is_favorited: false });
      setRecords(previous => previous.map(record => record.id === id ? { ...record, is_favorited: false } : record));
    } catch (updateError) {
      console.error('[learning] remove favorite failed:', updateError);
      setFavoriteActionError('取消收藏失败，内容仍然保留，请稍后再试。');
    } finally {
      setUpdatingFavoriteId(null);
    }
  };

  const speak = (key: string, text?: string) => {
    if (!text) return;
    if (speakingKey === key) {
      stopLocalSpeech();
      setSpeakingKey(null);
      return;
    }
    stopLocalSpeech();
    setSpeakingKey(key);
    void speakWithTTS(text, player, invokeEdgeFunction, () => setSpeakingKey(null));
  };

  const renderCard = ({ item, index }: { item: ContentRow; index: number }) => {
    if (activeTab === 'favorites') {
      const phrase = item.i_say || item.i_think || item.i_see;
      return (
        <View style={styles.favoriteCard}>
          <MotionPressable accessibilityRole="button" accessibilityLabel={`继续学习 ${item.scene_name}`} onPress={() => router.push(`/(app)/record/${item.id}` as any)} hoverTilt={1.5} style={styles.favoriteMain}>
            <View style={styles.favoriteImageWrap}>
              <Image source={validImageSource(item.scene_image)} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={220} />
              <LinearGradient colors={['transparent', 'rgba(4,19,39,0.62)']} style={StyleSheet.absoluteFillObject} />
              <Text style={styles.imageDate}>{formatDate(item.created_at)}</Text>
            </View>
            <View style={styles.favoriteCopy}>
              <View style={styles.eyebrowRow}><MapPin size={13} color={BLUE} strokeWidth={2.4} /><Text numberOfLines={1} style={styles.eyebrowText}>{item.scene_name || '场景表达'}</Text></View>
              <Text numberOfLines={compact ? 3 : 2} style={styles.favoritePhrase}>{phrase}</Text>
              <View style={styles.cardActionLine}><Text style={styles.cardActionText}>继续练习</Text><ArrowRight size={14} color={BLUE} strokeWidth={2.4} /></View>
            </View>
          </MotionPressable>
          <MotionPressable accessibilityRole="button" accessibilityLabel={`取消收藏 ${item.scene_name}`} onPress={() => void handleRemoveFavorite(String(item.id))} disabled={updatingFavoriteId !== null} pressedScale={0.9} style={styles.favoriteButton}>
            {updatingFavoriteId === item.id ? <ActivityIndicator size={17} color={BLUE} /> : <Bookmark size={18} color={BLUE} fill={BLUE} />}
          </MotionPressable>
        </View>
      );
    }

    if (activeTab === 'scenes') {
      const count = Number(item.practice_count || 1);
      return (
        <MotionPressable accessibilityRole="button" accessibilityLabel={`进入${item.scene_name}场景对话`} onPress={() => router.push({ pathname: '/(app)/dialogue', params: { scene: item.scene_name } } as any)} hoverTilt={1.5} style={styles.sceneCard}>
          <View style={styles.sceneImageWrap}>
            <Image source={validImageSource(item.scene_image)} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={220} />
            <LinearGradient colors={['rgba(7,24,49,0.05)', 'rgba(7,24,49,0.72)']} style={StyleSheet.absoluteFillObject} />
            <View style={styles.practiceBadge}><Text style={styles.practiceBadgeText}>练习 {count} 次</Text></View>
          </View>
          <View style={styles.sceneCopy}><Text numberOfLines={1} style={styles.sceneTitle}>{item.scene_name}</Text><Text numberOfLines={1} style={styles.sceneMeta}>{formatDate(item.last_practiced_at)}更新</Text></View>
          <View style={styles.roundArrow}><ChevronRight size={17} color={BLUE_DARK} strokeWidth={2.4} /></View>
        </MotionPressable>
      );
    }

    if (activeTab === 'sentences') {
      const speechKey = `sentence-${item.id}`;
      return (
        <View style={styles.sentenceCard}>
          <View style={styles.sentenceIndex}><Text style={styles.sentenceIndexText}>{String(index + 1).padStart(2, '0')}</Text></View>
          <Text style={styles.sentenceText}>{item.sentence}</Text>
          {item.translation ? <Text style={styles.translationText}>{item.translation}</Text> : null}
          <View style={styles.sentenceActions}>
            <MotionPressable accessibilityRole="button" accessibilityLabel={speakingKey === speechKey ? '停止朗读' : '朗读句子'} onPress={() => speak(speechKey, item.sentence)} pressedScale={0.92} style={[styles.iconAction, speakingKey === speechKey && styles.iconActionActive]}>
              <Volume2 size={18} color={speakingKey === speechKey ? WHITE : BLUE} fill={speakingKey === speechKey ? WHITE : 'transparent'} />
            </MotionPressable>
            <MotionPressable accessibilityRole="button" accessibilityLabel="进入跟读练习" onPress={() => router.push({ pathname: '/(app)/shadowing', params: { sentence: item.sentence } } as any)} style={styles.primaryAction}>
              <Mic2 size={16} color={WHITE} /><Text style={styles.primaryActionText}>跟读这一句</Text>
            </MotionPressable>
          </View>
        </View>
      );
    }

    if (activeTab === 'words') {
      const speechKey = `word-${item.id}`;
      const example = Array.isArray(item.example_sentences) ? item.example_sentences[0] : '';
      return (
        <MotionPressable accessibilityRole="button" accessibilityLabel={`查看单词 ${item.word}`} onPress={() => router.push({ pathname: '/(app)/word-detail', params: { word: item.word } } as any)} hoverTilt={1.2} style={styles.wordCard}>
          <LinearGradient colors={index % 2 ? ['rgba(239,249,255,0.94)', 'rgba(255,255,255,0.88)'] : ['rgba(255,249,231,0.92)', 'rgba(255,255,255,0.9)']} style={StyleSheet.absoluteFillObject} />
          <View style={styles.wordTopRow}>
            <View style={styles.wordLetter}><Text style={styles.wordLetterText}>{item.word?.[0]?.toUpperCase()}</Text></View>
            <MotionPressable accessibilityRole="button" accessibilityLabel={speakingKey === speechKey ? '停止朗读' : `朗读 ${item.word}`} onPress={(event) => { event.stopPropagation(); speak(speechKey, item.word); }} pressedScale={0.9} style={[styles.wordSound, speakingKey === speechKey && styles.iconActionActive]}>
              <Volume2 size={17} color={speakingKey === speechKey ? WHITE : BLUE} />
            </MotionPressable>
          </View>
          <Text numberOfLines={1} style={styles.wordText}>{item.word}</Text>
          <Text numberOfLines={1} style={styles.phoneticText}>{item.phonetic || item.part_of_speech || '已收藏词汇'}</Text>
          <View style={styles.wordDivider} />
          <Text numberOfLines={2} style={styles.meaningText}>{item.meaning || '点击查看词义与例句'}</Text>
          {example ? <Text numberOfLines={1} style={styles.exampleText}>{example}</Text> : null}
        </MotionPressable>
      );
    }

    const diaryDate = item.study_date || item.week_start || item.created_at;
    return (
      <MotionPressable accessibilityRole="button" accessibilityLabel="打开英语日记" onPress={() => router.push('/(app)/diary' as any)} hoverTilt={1.2} style={styles.diaryCard}>
        <LinearGradient colors={item.diary_type === 'weekly' ? ['#FFF7D8', '#FFFDF5'] : ['#E9F5FF', '#FCFEFF']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.diaryRail} />
        <View style={styles.diaryHeader}>
          <View style={styles.diaryBadge}><CalendarDays size={13} color={item.diary_type === 'weekly' ? '#9A6500' : BLUE_DARK} /><Text style={[styles.diaryBadgeText, item.diary_type === 'weekly' && { color: '#9A6500' }]}>{item.diary_type === 'weekly' ? 'WEEKLY STORY' : 'DAILY NOTE'}</Text></View>
          <Text style={styles.diaryDate}>{formatDate(diaryDate)}</Text>
        </View>
        <Text numberOfLines={4} style={styles.diaryContent}>{item.content}</Text>
        <View style={styles.diaryFooter}><Text style={styles.cardActionText}>打开日记</Text><ArrowRight size={14} color={BLUE} /></View>
      </MotionPressable>
    );
  };

  const pageHeader = (
    <View>
      <View style={[styles.hero, { paddingTop: Math.max(insets.top, 20) + 18 }]}>
        <LinearGradient colors={['#FDFEFF', '#EAF4FF', '#F7FBFF']} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.heroGlow} />
        <View style={styles.heroTitleRow}>
          <View><Text style={styles.kicker}>MY LANGUAGE LIBRARY</Text><Text style={styles.pageTitle}>我的表达本</Text><Text style={styles.pageSubtitle}>每一次真实练习，都在这里长成你的表达。</Text></View>
          <MotionPressable accessibilityRole="button" accessibilityLabel="刷新表达本" onPress={() => void loadData('refresh')} pressedScale={0.9} style={styles.refreshButton}><RefreshCw size={19} color={BLUE_DARK} /></MotionPressable>
        </View>

        <View style={styles.statsPanel}>
          <View style={styles.statCell}><Text style={styles.statValue}>{scenes.length}</Text><Text style={styles.statLabel}>场景</Text></View><View style={styles.statDivider} />
          <View style={styles.statCell}><Text style={styles.statValue}>{sentences.length}</Text><Text style={styles.statLabel}>表达</Text></View><View style={styles.statDivider} />
          <View style={styles.statCell}><Text style={styles.statValue}>{words.length}</Text><Text style={styles.statLabel}>词汇</Text></View><View style={styles.statDivider} />
          <View style={styles.statCell}><Text style={styles.statValue}>{diaries.length}</Text><Text style={styles.statLabel}>日记</Text></View>
        </View>

        {recent ? (
          <MotionPressable accessibilityRole="button" accessibilityLabel={`继续最近场景 ${recent.scene_name}`} onPress={() => router.push(`/(app)/record/${recent.id}` as any)} hoverTilt={1.2} style={styles.recentCard}>
            <Image source={validImageSource(recent.scene_image)} style={styles.recentImage} contentFit="cover" transition={220} />
            <View style={styles.recentCopy}><View style={styles.liveRow}><View style={styles.liveDot} /><Text style={styles.liveText}>最近更新</Text></View><Text numberOfLines={1} style={styles.recentTitle}>{recent.scene_name}</Text><Text numberOfLines={1} style={styles.recentPhrase}>{recent.i_say || recent.i_see}</Text></View>
            <View style={styles.roundArrow}><ChevronRight size={17} color={BLUE_DARK} /></View>
          </MotionPressable>
        ) : null}
      </View>

      <View style={styles.tabShell}><View style={styles.tabsRow}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <MotionPressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={`${tab.label} ${counts[tab.key]} 项`} onPress={() => { setActiveTab(tab.key); setQuery(''); }} pressedScale={0.94} style={[styles.tabButton, active && styles.tabButtonActive]}>
              <tab.icon size={17} color={active ? WHITE : MUTED} strokeWidth={active ? 2.5 : 2} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              <View style={[styles.tabCount, active && styles.tabCountActive]}><Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>{counts[tab.key]}</Text></View>
            </MotionPressable>
          );
        })}
      </View></View>

      <View style={styles.contentIntro}>
        <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>{meta.title}</Text><Text style={styles.sectionSubtitle}>{meta.subtitle}</Text></View>
        {activeTab === 'diary' ? <MotionPressable accessibilityRole="button" accessibilityLabel="创建学习日记" onPress={() => router.push('/(app)/diary' as any)} style={styles.createButton}><Sparkles size={14} color={WHITE} /><Text style={styles.createButtonText}>生成日记</Text></MotionPressable> : null}
      </View>

      <View style={styles.searchBox}><Search size={18} color="#8291A6" /><TextInput value={query} onChangeText={setQuery} placeholder={`搜索${TABS.find(tab => tab.key === activeTab)?.label ?? '内容'}`} placeholderTextColor="#97A4B5" style={styles.searchInput} returnKeyType="search" />{query ? <MotionPressable accessibilityRole="button" accessibilityLabel="清空搜索" onPress={() => setQuery('')} pressedScale={0.9} style={styles.clearButton}><X size={15} color={MUTED} /></MotionPressable> : null}</View>
      {favoriteActionError && activeTab === 'favorites' ? <View style={styles.inlineError}><AlertCircle size={15} color="#C93C3C" /><Text style={styles.inlineErrorText}>{favoriteActionError}</Text></View> : null}
    </View>
  );

  if (loading) {
    return <View style={styles.screen}><View style={[styles.loadingHero, { paddingTop: Math.max(insets.top, 20) + 28 }]}><View style={styles.skeletonTitle} /><View style={styles.skeletonSubtitle} /><View style={styles.skeletonStats} /></View><View style={styles.loadingBody}>{[0, 1, 2].map(key => <View key={key} style={styles.skeletonCard} />)}</View></View>;
  }

  if (error && !records.length && !scenes.length && !sentences.length && !words.length && !diaries.length) {
    return <View style={[styles.screen, styles.centerState]}><View style={styles.stateIcon}><AlertCircle size={30} color="#D34B4B" /></View><Text style={styles.stateTitle}>表达本没有同步成功</Text><Text style={styles.stateHint}>{error}</Text><MotionPressable onPress={() => void loadData()} style={styles.retryButton}><RefreshCw size={16} color={WHITE} /><Text style={styles.retryText}>重新加载</Text></MotionPressable></View>;
  }

  return (
    <View style={styles.screen}>
      <FlatList data={data} key={`${activeTab}-${compact ? 'compact' : 'wide'}`} keyExtractor={(item) => String(item.id)} renderItem={renderCard} ListHeaderComponent={pageHeader} ListEmptyComponent={<View style={styles.emptyState}><View style={styles.stateIcon}>{normalizedQuery ? <Search size={28} color={BLUE} /> : <BookMarked size={28} color={BLUE} />}</View><Text style={styles.stateTitle}>{normalizedQuery ? '没有找到相关内容' : meta.empty}</Text><Text style={styles.stateHint}>{normalizedQuery ? '换一个关键词，或切换其他分类看看。' : meta.emptyHint}</Text></View>} ItemSeparatorComponent={() => <View style={{ height: 12 }} />} contentContainerStyle={[styles.listContent, { width: contentWidth, paddingBottom: Math.max(insets.bottom, 18) + 28 }]} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadData('refresh')} tintColor={BLUE} colors={[BLUE]} />} />
    </View>
  );
}

const glassWeb = Platform.OS === 'web' ? ({ backdropFilter: 'blur(22px) saturate(1.35)', WebkitBackdropFilter: 'blur(22px) saturate(1.35)' } as any) : null;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, alignItems: 'center' },
  listContent: { alignSelf: 'center', paddingHorizontal: 16 },
  hero: { marginHorizontal: -16, paddingHorizontal: 20, paddingBottom: 22, overflow: 'hidden', borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  heroGlow: { position: 'absolute', right: -70, top: 18, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(79,181,255,0.16)' },
  heroTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  kicker: { color: BLUE, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1.3 },
  pageTitle: { color: INK, fontSize: 31, lineHeight: 38, fontWeight: '900', marginTop: 5, letterSpacing: 0 },
  pageSubtitle: { color: MUTED, fontSize: 13, lineHeight: 19, marginTop: 4 },
  refreshButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.74)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.94)', shadowColor: '#2B6DAE', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.12, shadowRadius: 18, ...glassWeb },
  statsPanel: { marginTop: 22, height: 77, paddingHorizontal: 8, borderRadius: 24, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.66)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.96)', shadowColor: '#2D6FA7', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.12, shadowRadius: 28, ...glassWeb },
  statCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statValue: { color: INK, fontSize: 21, lineHeight: 25, fontWeight: '900' },
  statLabel: { color: MUTED, fontSize: 11, marginTop: 3, fontWeight: '700' },
  statDivider: { width: 1, height: 29, backgroundColor: 'rgba(134,164,198,0.24)' },
  recentCard: { marginTop: 12, minHeight: 76, padding: 8, paddingRight: 12, flexDirection: 'row', alignItems: 'center', borderRadius: 22, gap: 12, backgroundColor: 'rgba(255,255,255,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', ...glassWeb },
  recentImage: { width: 60, height: 60, borderRadius: 16, backgroundColor: BLUE_SOFT },
  recentCopy: { flex: 1, minWidth: 0 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#28B463' },
  liveText: { color: '#278452', fontSize: 10, fontWeight: '800' },
  recentTitle: { color: INK, fontSize: 14, fontWeight: '900', marginTop: 3 },
  recentPhrase: { color: MUTED, fontSize: 11, marginTop: 3 },
  roundArrow: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.86)', borderWidth: 1, borderColor: 'rgba(122,174,230,0.24)', shadowColor: '#2A69A8', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 10 },
  tabShell: { marginHorizontal: -16, paddingHorizontal: 16, backgroundColor: BG },
  tabsRow: { flexDirection: 'row', gap: 7, paddingTop: 15, paddingBottom: 7 },
  tabButton: { flex: 1, minWidth: 0, height: 47, borderRadius: 17, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.68)', borderWidth: 1, borderColor: 'rgba(148,174,204,0.18)' },
  tabButtonActive: { backgroundColor: BLUE, borderColor: '#5AA5FF', shadowColor: BLUE, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.24, shadowRadius: 14 },
  tabText: { color: MUTED, fontSize: 11, fontWeight: '800' },
  tabTextActive: { color: WHITE },
  tabCount: { position: 'absolute', top: 4, right: 5, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7EEF6' },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  tabCountText: { color: '#6C7C91', fontSize: 8, fontWeight: '900' },
  tabCountTextActive: { color: WHITE },
  contentIntro: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 21, marginBottom: 12 },
  sectionTitle: { color: INK, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  sectionSubtitle: { color: MUTED, fontSize: 12, marginTop: 3 },
  createButton: { height: 38, borderRadius: 19, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BLUE },
  createButtonText: { color: WHITE, fontSize: 12, fontWeight: '800' },
  searchBox: { height: 48, borderRadius: 17, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(255,255,255,0.82)', borderWidth: 1, borderColor: 'rgba(157,185,216,0.24)', marginBottom: 14, shadowColor: '#274E78', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.06, shadowRadius: 15, ...glassWeb },
  searchInput: { flex: 1, height: 46, color: INK, fontSize: 14, outlineStyle: 'none' } as any,
  clearButton: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDF2F7' },
  inlineError: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, marginBottom: 12, borderRadius: 14, backgroundColor: '#FFF0F0', borderWidth: 1, borderColor: '#F4B5B5' },
  inlineErrorText: { flex: 1, color: '#A23232', fontSize: 12 },
  favoriteCard: { minHeight: 130, flexDirection: 'row', overflow: 'hidden', borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.98)', shadowColor: '#244F7A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 22, ...glassWeb },
  favoriteMain: { flex: 1, minWidth: 0, padding: 10, paddingRight: 2, flexDirection: 'row', alignItems: 'stretch', gap: 13 },
  favoriteImageWrap: { width: 104, minHeight: 108, borderRadius: 18, overflow: 'hidden', backgroundColor: BLUE_SOFT },
  imageDate: { position: 'absolute', left: 9, bottom: 8, color: WHITE, fontSize: 10, fontWeight: '700' },
  favoriteCopy: { flex: 1, minWidth: 0, paddingVertical: 8 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eyebrowText: { flex: 1, color: BLUE_DARK, fontSize: 11, fontWeight: '800' },
  favoritePhrase: { color: INK, fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 8 },
  cardActionLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 'auto', paddingTop: 8 },
  cardActionText: { color: BLUE, fontSize: 12, fontWeight: '900' },
  favoriteButton: { width: 46, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: 'rgba(136,166,198,0.18)' },
  sceneCard: { minHeight: 96, padding: 8, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.98)', shadowColor: '#244F7A', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.09, shadowRadius: 19, ...glassWeb },
  sceneImageWrap: { width: 112, height: 80, borderRadius: 18, overflow: 'hidden', backgroundColor: BLUE_SOFT },
  practiceBadge: { position: 'absolute', left: 8, bottom: 7, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: 'rgba(8,31,60,0.68)' },
  practiceBadgeText: { color: WHITE, fontSize: 9, fontWeight: '800' },
  sceneCopy: { flex: 1, minWidth: 0 },
  sceneTitle: { color: INK, fontSize: 16, fontWeight: '900' },
  sceneMeta: { color: MUTED, fontSize: 11, marginTop: 5 },
  sentenceCard: { borderRadius: 24, padding: 18, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.86)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.98)', shadowColor: '#244F7A', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.09, shadowRadius: 19, ...glassWeb },
  sentenceIndex: { position: 'absolute', right: 15, top: 13 },
  sentenceIndexText: { color: '#D9E7F7', fontSize: 25, fontWeight: '900' },
  sentenceText: { color: INK, fontSize: 16, lineHeight: 24, fontWeight: '800', paddingRight: 34 },
  translationText: { color: MUTED, fontSize: 12, lineHeight: 18, marginTop: 7 },
  sentenceActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 9, marginTop: 16 },
  iconAction: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE_SOFT, borderWidth: 1, borderColor: '#D5E8FF' },
  iconActionActive: { backgroundColor: BLUE, borderColor: BLUE },
  primaryAction: { height: 40, borderRadius: 20, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: BLUE },
  primaryActionText: { color: WHITE, fontSize: 12, fontWeight: '900' },
  wordCard: { minHeight: 181, padding: 17, overflow: 'hidden', borderRadius: 25, backgroundColor: WHITE, borderWidth: 1, borderColor: 'rgba(255,255,255,0.98)', shadowColor: '#244F7A', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.09, shadowRadius: 20 },
  wordTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordLetter: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(22,119,240,0.1)' },
  wordLetterText: { color: BLUE, fontSize: 17, fontWeight: '900' },
  wordSound: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.82)', borderWidth: 1, borderColor: 'rgba(121,168,219,0.22)' },
  wordText: { color: INK, fontSize: 25, lineHeight: 31, fontWeight: '900', marginTop: 12 },
  phoneticText: { color: BLUE_DARK, fontSize: 12, marginTop: 2 },
  wordDivider: { height: 1, backgroundColor: 'rgba(132,164,199,0.2)', marginVertical: 11 },
  meaningText: { color: '#44546A', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  exampleText: { color: '#8A97A8', fontSize: 10, marginTop: 8, fontStyle: 'italic' },
  diaryCard: { minHeight: 168, padding: 19, paddingLeft: 24, overflow: 'hidden', borderRadius: 24, backgroundColor: WHITE, borderWidth: 1, borderColor: 'rgba(255,255,255,0.98)', shadowColor: '#244F7A', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.09, shadowRadius: 20 },
  diaryRail: { position: 'absolute', left: 0, top: 18, bottom: 18, width: 4, borderRadius: 2, backgroundColor: BLUE },
  diaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  diaryBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  diaryBadgeText: { color: BLUE_DARK, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  diaryDate: { color: MUTED, fontSize: 10, fontWeight: '700' },
  diaryContent: { color: '#37465A', fontSize: 13, lineHeight: 21, marginTop: 15 },
  diaryFooter: { marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  emptyState: { alignItems: 'center', paddingHorizontal: 30, paddingVertical: 58 },
  stateIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE_SOFT, borderWidth: 1, borderColor: '#D4E8FF' },
  stateTitle: { color: INK, fontSize: 17, fontWeight: '900', marginTop: 17, textAlign: 'center' },
  stateHint: { color: MUTED, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 7, maxWidth: 280 },
  centerState: { justifyContent: 'center', padding: 28 },
  retryButton: { marginTop: 18, height: 42, borderRadius: 21, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: BLUE },
  retryText: { color: WHITE, fontSize: 13, fontWeight: '800' },
  loadingHero: { width: '100%', paddingHorizontal: 20, height: 286, backgroundColor: '#EAF4FF' },
  loadingBody: { width: '100%', padding: 16, gap: 12 },
  skeletonTitle: { width: 170, height: 32, borderRadius: 10, backgroundColor: '#D6E7FA' },
  skeletonSubtitle: { width: 250, height: 14, borderRadius: 7, marginTop: 12, backgroundColor: '#DDEAF7' },
  skeletonStats: { height: 77, borderRadius: 24, marginTop: 28, backgroundColor: 'rgba(255,255,255,0.66)' },
  skeletonCard: { height: 126, borderRadius: 24, backgroundColor: WHITE },
});

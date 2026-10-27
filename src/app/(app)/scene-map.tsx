import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronLeft,
  Coffee,
  HandCoins,
  Hospital,
  Library,
  LockKeyhole,
  Mail,
  Map as MapIcon,
  MessageCircleMore,
  Plane,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Target,
  TrainFront,
  TrendingUp,
  Utensils,
  Users,
  UserRound,
  Volume2,
} from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotionPressable } from '@/components/motion-pressable';
import { fetchSceneMapProgress } from '@/lib/api';
import { ALL_SCENES, DAILY_SCENES, type SceneNode, WORKPLACE_SCENES } from '@/lib/sceneMapData';

declare const require: (assetPath: string) => number;

const GLASS_WEB = Platform.OS === 'web'
  ? ({ backdropFilter: 'blur(24px) saturate(1.5)', WebkitBackdropFilter: 'blur(24px) saturate(1.5)', isolation: 'isolate' } as any)
  : null;

const COLORS = {
  background: '#F3F8FF',
  text: '#0A1424',
  muted: '#5D718E',
  subtle: '#90A1B8',
  blue: '#147CF5',
  blueDark: '#075DD8',
  cyan: '#30C9FF',
  green: '#19A96A',
  amber: '#FF9F0A',
  coral: '#F06461',
  border: 'rgba(176,211,239,0.72)',
};

type SceneStatus = 'locked' | 'in_progress' | 'completed';
type Category = 'daily' | 'workplace';

interface SceneProgress {
  scene_id: string;
  status: SceneStatus;
  dialogue_rounds: number;
}

const SCENE_ICONS: Record<string, any> = {
  'coffee-shop': Coffee,
  airport: Plane,
  hotel: Building2,
  restaurant: Utensils,
  supermarket: ShoppingCart,
  hospital: Hospital,
  subway: TrainFront,
  library: Library,
  meeting: Users,
  interview: BriefcaseBusiness,
  negotiation: HandCoins,
  email: Mail,
};

const SCENE_IMAGES: Record<string, any> = {
  'coffee-shop': require('../../../assets/home-cafe-hero.png'),
  airport: require('../../../assets/home-premium/lesson-airport.png'),
  hotel: require('../../../assets/growth-hotel-scene.png'),
  restaurant: { uri: 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_157d6c03-4833-4540-8013-efe631da980e.jpg' },
  supermarket: { uri: 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_786fd9c5-ee8d-4f3e-9abf-2f648de066e3.jpg' },
  hospital: { uri: 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_e1c389d1-40c1-4c63-ad3a-87b734c0181c.jpg' },
  subway: { uri: 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_ec179956-2989-4b6a-b22e-ac2751144890.jpg' },
  library: { uri: 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_379064ef-c703-4476-9801-6b5cc609e85e.jpg' },
  meeting: { uri: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=900&q=82' },
  interview: { uri: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=900&q=82' },
  negotiation: { uri: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=82' },
  email: { uri: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=900&q=82' },
};

const FALLBACK_SCENE_IMAGE = require('../../../assets/home-premium/hero-photo.png');

function sceneImage(sceneId: string) {
  return SCENE_IMAGES[sceneId] ?? FALLBACK_SCENE_IMAGE;
}

function sceneStatus(progress?: SceneProgress): SceneStatus {
  return progress?.status ?? 'locked';
}

function statusLabel(status: SceneStatus) {
  if (status === 'completed') return '已完成';
  if (status === 'in_progress') return '进行中';
  return '待探索';
}

function statusColor(status: SceneStatus) {
  if (status === 'completed') return COLORS.green;
  if (status === 'in_progress') return COLORS.blue;
  return COLORS.subtle;
}

const DECK_CARD_WIDTH = 158;
const DECK_CARD_GAP = 10;

function SceneDeckCard({
  scene,
  progress,
  index,
  selected,
  onPress,
}: {
  scene: SceneNode;
  progress?: SceneProgress;
  index: number;
  selected: boolean;
  onPress: () => void;
}) {
  const status = sceneStatus(progress);
  const rounds = progress?.dialogue_rounds ?? 0;
  const progressValue = Math.min(rounds / Math.max(scene.requiredRounds, 1), 1);
  const Icon = SCENE_ICONS[scene.id] ?? MapIcon;

  return (
    <MotionPressable
      onPress={onPress}
      pressedScale={0.965}
      hoverScale={1.018}
      hoverLift={5}
      hoverTilt={2.2}
      accessibilityRole="button"
      accessibilityLabel={`${scene.nameZh}，${statusLabel(status)}，${rounds}/${scene.requiredRounds} 轮`}
      style={[styles.deckCard, selected && styles.deckCardSelected]}
    >
      <Image source={sceneImage(scene.id)} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={220} cachePolicy="memory-disk" recyclingKey={`deck-${scene.id}`} />
      <LinearGradient colors={['rgba(4,16,32,0.02)', 'rgba(4,16,32,0.24)', 'rgba(4,16,32,0.88)']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFillObject} />
      <View pointerEvents="none" style={styles.deckCardShine} />
      <View style={styles.deckCardTop}>
        <View style={styles.deckIndexPill}><Text style={styles.deckIndexText}>{String(index + 1).padStart(2, '0')}</Text></View>
        <View style={[styles.deckStatusIcon, { backgroundColor: status === 'completed' ? COLORS.green : selected ? COLORS.blue : 'rgba(7,22,39,0.38)' }]}>
          {status === 'completed' ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : status === 'locked' ? <LockKeyhole size={12} color="#FFFFFF" /> : <Icon size={13} color="#FFFFFF" />}
        </View>
      </View>
      <View style={styles.deckCardCopy}>
        <View style={styles.deckIcon}><Icon size={17} color="#FFFFFF" strokeWidth={2.2} /></View>
        <Text style={styles.deckTitle}>{scene.nameZh}</Text>
        <Text style={styles.deckEnglish}>{scene.nameEn}</Text>
        <View style={styles.deckProgressRow}><View style={styles.deckProgressTrack}><View style={[styles.deckProgressFill, { width: `${Math.max(progressValue * 100, status === 'locked' ? 0 : 7)}%`, backgroundColor: statusColor(status) }]} /></View><Text style={styles.deckProgressText}>{rounds}/{scene.requiredRounds}</Text></View>
      </View>
    </MotionPressable>
  );
}

export default function SceneMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const initialized = useRef(false);
  const [progressMap, setProgressMap] = useState<Record<string, SceneProgress>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category>('daily');
  const [selectedSceneId, setSelectedSceneId] = useState(DAILY_SCENES[0].id);

  const loadProgress = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setLoadError('');
    try {
      const data = await fetchSceneMapProgress();
      const map: Record<string, SceneProgress> = {};
      (data ?? []).forEach((row: any) => { map[row.scene_id] = row; });
      setProgressMap(map);
      if (!initialized.current) {
        const recommended = ALL_SCENES.find((scene) => map[scene.id]?.status === 'in_progress')
          ?? ALL_SCENES.find((scene) => map[scene.id]?.status !== 'completed')
          ?? ALL_SCENES[0];
        setSelectedSceneId(recommended.id);
        setActiveCategory(recommended.category);
        initialized.current = true;
      }
    } catch {
      setLoadError('场景进度暂时没有同步成功，请稍后重试。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadProgress(false); }, [loadProgress]));

  const categoryScenes = activeCategory === 'daily' ? DAILY_SCENES : WORKPLACE_SCENES;
  const selectedScene = ALL_SCENES.find((scene) => scene.id === selectedSceneId) ?? categoryScenes[0];
  const selectedProgress = progressMap[selectedScene.id];
  const selectedStatus = sceneStatus(selectedProgress);
  const selectedRounds = selectedProgress?.dialogue_rounds ?? 0;
  const selectedPercent = Math.min(Math.round((selectedRounds / Math.max(selectedScene.requiredRounds, 1)) * 100), 100);
  const SelectedIcon = SCENE_ICONS[selectedScene.id] ?? MapIcon;
  const selectedCategoryIndex = Math.max(categoryScenes.findIndex((scene) => scene.id === selectedScene.id), 0);

  const completedCount = ALL_SCENES.filter((scene) => progressMap[scene.id]?.status === 'completed').length;
  const inProgressCount = ALL_SCENES.filter((scene) => progressMap[scene.id]?.status === 'in_progress').length;
  const exploredCount = completedCount + inProgressCount;
  const overallProgress = completedCount / Math.max(ALL_SCENES.length, 1);

  const selectCategory = (category: Category) => {
    setActiveCategory(category);
    const scenes = category === 'daily' ? DAILY_SCENES : WORKPLACE_SCENES;
    const next = scenes.find((scene) => progressMap[scene.id]?.status === 'in_progress')
      ?? scenes.find((scene) => progressMap[scene.id]?.status !== 'completed')
      ?? scenes[0];
    setSelectedSceneId(next.id);
  };

  const handleDeckMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.max(0, Math.min(Math.round(event.nativeEvent.contentOffset.x / (DECK_CARD_WIDTH + DECK_CARD_GAP)), categoryScenes.length - 1));
    const nextScene = categoryScenes[nextIndex];
    if (nextScene && nextScene.id !== selectedSceneId) setSelectedSceneId(nextScene.id);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor={COLORS.background} />
      <LinearGradient pointerEvents="none" colors={['#EEF7FF', '#F7FBFF', '#F4FAF8']} locations={[0, 0.46, 1]} style={StyleSheet.absoluteFillObject} />
      <View pointerEvents="none" style={styles.ambientBlue} />
      <View pointerEvents="none" style={styles.ambientGreen} />
      <View pointerEvents="none" style={styles.backgroundGrid}>
        {[0, 1, 2, 3, 4].map((index) => <View key={`v-${index}`} style={[styles.backgroundGridLineVertical, { left: `${12 + index * 22}%` }]} />)}
        {[0, 1, 2, 3, 4, 5, 6].map((index) => <View key={`h-${index}`} style={[styles.backgroundGridLineHorizontal, { top: 220 + index * 180 }]} />)}
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadProgress(true)} tintColor={COLORS.blue} colors={[COLORS.blue]} />}
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 12) + 8 }]}
      >
        <View style={styles.pageContent}>
          <View style={styles.header}>
            <MotionPressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} pressedScale={0.9} style={styles.headerButton}>
              <ChevronLeft size={22} color={COLORS.text} />
            </MotionPressable>
            <View style={styles.headerCopy}>
              <Text style={styles.headerEyebrow}>SCENE JOURNEY</Text>
              <Text style={styles.pageTitle}>场景地图</Text>
              <Text style={styles.pageSubtitle}>沿真实生活路径，把英语说出来</Text>
            </View>
            <MotionPressable accessibilityRole="button" accessibilityLabel="刷新场景进度" onPress={() => void loadProgress(true)} haptic={false} pressedScale={0.9} style={styles.headerButton}>
              {refreshing ? <ActivityIndicator size="small" color={COLORS.blue} /> : <RefreshCw size={20} color={COLORS.blue} />}
            </MotionPressable>
          </View>

          {loading && Object.keys(progressMap).length === 0 ? (
            <View style={styles.loadingState}><ActivityIndicator size="large" color={COLORS.blue} /><Text style={styles.loadingText}>正在同步场景旅程</Text></View>
          ) : (
            <>
              <View style={styles.overviewCard}>
                <LinearGradient colors={['rgba(255,255,255,0.96)', 'rgba(220,242,255,0.84)', 'rgba(246,252,255,0.92)']} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                <View pointerEvents="none" style={styles.cardShine} />
                <View style={styles.overviewTopRow}>
                  <View style={styles.mapOrb}><LinearGradient colors={['#5FE2FF', '#168BFA', '#0756D7']} style={StyleSheet.absoluteFillObject} /><MapIcon size={24} color="#FFFFFF" /></View>
                  <View style={styles.overviewCopy}><Text style={styles.overviewLabel}>你的探索版图</Text><Text style={styles.overviewValue}>{exploredCount} / {ALL_SCENES.length} <Text style={styles.overviewUnit}>已探索</Text></Text></View>
                  <View style={styles.overviewPercent}><Text style={styles.overviewPercentValue}>{Math.round(overallProgress * 100)}%</Text><Text style={styles.overviewPercentLabel}>已完成</Text></View>
                </View>
                <View style={styles.overallTrack}><LinearGradient colors={[COLORS.cyan, COLORS.blue, COLORS.green]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.overallFill, { width: `${Math.max(overallProgress * 100, completedCount ? 5 : 0)}%` }]} /></View>
                <View style={styles.overviewStats}>
                  <View style={styles.overviewStat}><Check size={15} color={COLORS.green} strokeWidth={3} /><Text style={styles.overviewStatValue}>{completedCount}</Text><Text style={styles.overviewStatLabel}>已完成</Text></View>
                  <View style={styles.statDivider} />
                  <View style={styles.overviewStat}><TrendingUp size={15} color={COLORS.blue} /><Text style={styles.overviewStatValue}>{inProgressCount}</Text><Text style={styles.overviewStatLabel}>进行中</Text></View>
                  <View style={styles.statDivider} />
                  <View style={styles.overviewStat}><Sparkles size={15} color={COLORS.amber} /><Text style={styles.overviewStatValue}>{ALL_SCENES.length - exploredCount}</Text><Text style={styles.overviewStatLabel}>待探索</Text></View>
                </View>
              </View>

              {loadError ? <View style={styles.errorCard}><Text style={styles.errorText}>{loadError}</Text><MotionPressable onPress={() => void loadProgress(true)} style={styles.retryButton}><Text style={styles.retryText}>重试</Text></MotionPressable></View> : null}

              <View style={styles.categoryTabs} accessibilityRole="tablist">
                {([
                  { key: 'daily' as const, label: '日常生活', meta: `${DAILY_SCENES.length} 个场景`, icon: Coffee },
                  { key: 'workplace' as const, label: '职场英语', meta: `${WORKPLACE_SCENES.length} 个场景`, icon: BriefcaseBusiness },
                ]).map((item) => {
                  const active = activeCategory === item.key;
                  const Icon = item.icon;
                  return (
                    <MotionPressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={item.label} onPress={() => selectCategory(item.key)} pressedScale={0.96} style={[styles.categoryTab, active && styles.categoryTabActive]}>
                      {active ? <LinearGradient colors={['#30CFFF', '#147CF5', '#0759D8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} /> : null}
                      <Icon size={19} color={active ? '#FFFFFF' : COLORS.muted} />
                      <View style={styles.categoryTabCopy}><Text style={[styles.categoryTabTitle, active && styles.categoryTabTitleActive]}>{item.label}</Text><Text style={[styles.categoryTabMeta, active && styles.categoryTabMetaActive]}>{item.meta}</Text></View>
                    </MotionPressable>
                  );
                })}
              </View>

              <View style={styles.galleryCard}>
                <View pointerEvents="none" style={styles.galleryGlow} />
                <View style={styles.galleryHeader}>
                  <View><Text style={styles.galleryEyebrow}>{activeCategory === 'daily' ? 'LIFE SCENES' : 'CAREER SCENES'}</Text><Text style={styles.galleryTitle}>场景画廊</Text><Text style={styles.gallerySubtitle}>左右滑动，选择下一段真实对话</Text></View>
                  <View style={styles.galleryCounter}><Text style={styles.galleryCounterCurrent}>{String(selectedCategoryIndex + 1).padStart(2, '0')}</Text><Text style={styles.galleryCounterTotal}> / {String(categoryScenes.length).padStart(2, '0')}</Text></View>
                </View>
                <ScrollView
                  key={activeCategory}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={DECK_CARD_WIDTH + DECK_CARD_GAP}
                  snapToAlignment="start"
                  onMomentumScrollEnd={handleDeckMomentumEnd}
                  contentContainerStyle={styles.deckContent}
                >
                  {categoryScenes.map((scene, index) => <SceneDeckCard key={scene.id} scene={scene} progress={progressMap[scene.id]} index={index} selected={scene.id === selectedScene.id} onPress={() => setSelectedSceneId(scene.id)} />)}
                </ScrollView>
                <View style={styles.deckDots}>{categoryScenes.map((scene) => <View key={`dot-${scene.id}`} style={[styles.deckDot, scene.id === selectedScene.id && styles.deckDotActive]} />)}</View>
              </View>

              <Animated.View key={selectedScene.id} entering={FadeInDown.duration(280)} style={styles.selectedCard}>
                <View style={styles.selectedMedia}>
                  <Image source={sceneImage(selectedScene.id)} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={240} cachePolicy="memory-disk" recyclingKey={`feature-${selectedScene.id}`} />
                  <LinearGradient colors={['rgba(5,15,30,0.05)', 'rgba(4,20,42,0.26)', 'rgba(4,17,35,0.88)']} locations={[0, 0.46, 1]} style={StyleSheet.absoluteFillObject} />
                  <View pointerEvents="none" style={styles.mediaTopShine} />
                  <View style={styles.mediaTopRow}>
                    <View style={styles.mediaStatusPill}><View style={[styles.statusDot, { backgroundColor: statusColor(selectedStatus) }]} /><Text style={styles.mediaStatusText}>{statusLabel(selectedStatus)}</Text></View>
                    <Text style={styles.mediaIndex}>{String(categoryScenes.findIndex((scene) => scene.id === selectedScene.id) + 1).padStart(2, '0')}</Text>
                  </View>
                  <View style={styles.mediaTitleRow}>
                    <View style={styles.mediaIcon}><SelectedIcon size={24} color="#FFFFFF" /></View>
                    <View style={styles.mediaTitleCopy}><Text style={styles.mediaTitle}>{selectedScene.nameZh}</Text><Text style={styles.mediaEnglish}>{selectedScene.nameEn.toUpperCase()}</Text></View>
                  </View>
                </View>
                <View style={styles.selectedBody}>
                  <Text style={styles.selectedDescription} numberOfLines={2}>{selectedScene.description}</Text>
                  <View style={styles.challengeCard}><View style={styles.challengeIcon}><Target size={16} color={COLORS.blue} /></View><View style={styles.challengeCopy}><Text style={styles.challengeLabel}>本场目标</Text><Text style={styles.challengeText} numberOfLines={1}>{selectedScene.dialogueGoal}</Text></View></View>
                  <View style={styles.roleRow}><View style={styles.rolePill}><Bot size={13} color={COLORS.blue} /><Text style={styles.roleLabel}>AI · {selectedScene.aiRole}</Text></View><View style={styles.rolePill}><UserRound size={13} color={COLORS.green} /><Text style={styles.roleLabel}>你 · {selectedScene.userRole}</Text></View></View>
                  <View style={styles.vocabRow}>
                    {selectedScene.vocab.slice(0, 2).map((item, index) => <View key={item.word} style={styles.vocabChip}>{index === 0 ? <Volume2 size={12} color={COLORS.blue} /> : null}<Text style={styles.vocabChipText} numberOfLines={1}>{item.word}</Text></View>)}
                  </View>
                  <View style={styles.selectedProgressRow}><Text style={styles.selectedProgressLabel}>对话进度</Text><Text style={[styles.selectedProgressValue, { color: statusColor(selectedStatus) }]}>{selectedRounds} / {selectedScene.requiredRounds} 轮</Text></View>
                  <View style={styles.selectedProgressTrack}><View style={[styles.selectedProgressFill, { width: `${selectedPercent}%`, backgroundColor: statusColor(selectedStatus) }]} /></View>
                  <MotionPressable onPress={() => router.push(`/(app)/scene-detail?sceneId=${selectedScene.id}` as any)} pressedScale={0.975} hoverLift={2} accessibilityRole="button" accessibilityLabel={`${selectedStatus === 'locked' ? '开始探索' : selectedStatus === 'completed' ? '再次练习' : '继续练习'}${selectedScene.nameZh}`} style={styles.primaryButton}>
                    <LinearGradient colors={['#31D1FF', COLORS.blue, COLORS.blueDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                    {selectedStatus === 'locked' ? <Sparkles size={18} color="#FFFFFF" /> : <MessageCircleMore size={18} color="#FFFFFF" />}
                    <Text style={styles.primaryButtonText}>{selectedStatus === 'locked' ? '开始探索' : selectedStatus === 'completed' ? '再次练习' : '继续练习'}</Text>
                    <ArrowRight size={18} color="#FFFFFF" />
                  </MotionPressable>
                </View>
              </Animated.View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  ambientBlue: { position: 'absolute', width: 340, height: 340, borderRadius: 170, top: -160, right: -140, backgroundColor: 'rgba(74,184,255,0.14)' },
  ambientGreen: { position: 'absolute', width: 300, height: 300, borderRadius: 150, top: 760, left: -190, backgroundColor: 'rgba(46,202,147,0.1)' },
  backgroundGrid: { ...StyleSheet.absoluteFillObject, opacity: 0.32 },
  backgroundGridLineVertical: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(93,151,198,0.1)', transform: [{ rotate: '9deg' }] },
  backgroundGridLineHorizontal: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(93,151,198,0.09)', transform: [{ rotate: '-3deg' }] },
  scrollContent: { paddingBottom: 42 },
  pageContent: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 16, gap: 14 },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerButton: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.76)', borderWidth: 1, borderColor: COLORS.border, shadowColor: '#3C77A9', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 13, elevation: 3, ...GLASS_WEB },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: { color: COLORS.blue, fontSize: 9, lineHeight: 13, fontWeight: '900', letterSpacing: 1.35 },
  pageTitle: { color: COLORS.text, fontSize: 26, lineHeight: 31, fontWeight: '900', letterSpacing: 0 },
  pageSubtitle: { color: COLORS.muted, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  loadingState: { minHeight: 520, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  overviewCard: { overflow: 'hidden', borderRadius: 26, borderWidth: 1.2, borderColor: 'rgba(170,214,245,0.82)', padding: 16, shadowColor: '#2D6EAA', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 26, elevation: 6, ...GLASS_WEB },
  cardShine: { position: 'absolute', left: 24, right: 24, top: 2, height: 2, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.95)' },
  overviewTopRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  mapOrb: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: COLORS.blue, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 4 },
  overviewCopy: { flex: 1 },
  overviewLabel: { color: COLORS.muted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  overviewValue: { marginTop: 2, color: COLORS.text, fontSize: 22, lineHeight: 27, fontWeight: '900', fontVariant: ['tabular-nums'] },
  overviewUnit: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  overviewPercent: { alignItems: 'flex-end' },
  overviewPercentValue: { color: COLORS.blue, fontSize: 22, lineHeight: 26, fontWeight: '900', fontVariant: ['tabular-nums'] },
  overviewPercentLabel: { color: COLORS.muted, fontSize: 9, lineHeight: 13, fontWeight: '700' },
  overallTrack: { height: 8, marginTop: 14, overflow: 'hidden', borderRadius: 99, backgroundColor: 'rgba(145,183,216,0.2)' },
  overallFill: { height: '100%', borderRadius: 99 },
  overviewStats: { marginTop: 14, flexDirection: 'row', alignItems: 'center' },
  overviewStat: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  overviewStatValue: { color: COLORS.text, fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  overviewStatLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '700' },
  statDivider: { width: 1, height: 21, backgroundColor: 'rgba(164,199,226,0.38)' },
  errorCard: { minHeight: 48, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, backgroundColor: '#FFF2F1', borderWidth: 1, borderColor: '#F2B8B3' },
  errorText: { flex: 1, color: '#9F2D28', fontSize: 11, lineHeight: 16, fontWeight: '700' },
  retryButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: '#FFFFFF' },
  retryText: { color: '#C2413B', fontSize: 10, fontWeight: '900' },
  categoryTabs: { minHeight: 70, flexDirection: 'row', gap: 8, padding: 6, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: COLORS.border, ...GLASS_WEB },
  categoryTab: { flex: 1, minWidth: 0, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 18 },
  categoryTabActive: { shadowColor: COLORS.blue, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.25, shadowRadius: 11, elevation: 4 },
  categoryTabCopy: { minWidth: 0 },
  categoryTabTitle: { color: COLORS.muted, fontSize: 12, lineHeight: 16, fontWeight: '900' },
  categoryTabTitleActive: { color: '#FFFFFF' },
  categoryTabMeta: { color: COLORS.subtle, fontSize: 8.5, lineHeight: 12, fontWeight: '700' },
  categoryTabMetaActive: { color: 'rgba(255,255,255,0.72)' },
  galleryCard: { overflow: 'hidden', paddingTop: 15, paddingBottom: 12, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: COLORS.border, shadowColor: '#326B9E', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 22, elevation: 4, ...GLASS_WEB },
  galleryGlow: { position: 'absolute', width: 210, height: 210, borderRadius: 105, top: -138, right: -55, backgroundColor: 'rgba(40,163,255,0.13)' },
  galleryHeader: { paddingHorizontal: 15, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  galleryEyebrow: { color: COLORS.blue, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 1.15 },
  galleryTitle: { marginTop: 2, color: COLORS.text, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  gallerySubtitle: { marginTop: 2, color: COLORS.muted, fontSize: 9.5, lineHeight: 14, fontWeight: '600' },
  galleryCounter: { flexDirection: 'row', alignItems: 'baseline', paddingBottom: 2 },
  galleryCounterCurrent: { color: COLORS.blue, fontSize: 21, lineHeight: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  galleryCounterTotal: { color: COLORS.subtle, fontSize: 10, lineHeight: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  deckContent: { gap: DECK_CARD_GAP, paddingHorizontal: 15, paddingTop: 13, paddingBottom: 11 },
  deckCard: { width: DECK_CARD_WIDTH, height: 192, overflow: 'hidden', borderRadius: 22, backgroundColor: '#DCEAF5', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)', shadowColor: '#24577E', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.19, shadowRadius: 15, elevation: 4 },
  deckCardSelected: { borderWidth: 2, borderColor: 'rgba(88,201,255,0.96)', shadowColor: COLORS.blue, shadowOpacity: 0.42, shadowRadius: 18, elevation: 7 },
  deckCardShine: { position: 'absolute', left: 17, right: 17, top: 3, height: 2, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.76)' },
  deckCardTop: { position: 'absolute', left: 10, right: 10, top: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deckIndexPill: { minWidth: 30, height: 24, paddingHorizontal: 7, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(247,251,255,0.82)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.86)', ...GLASS_WEB },
  deckIndexText: { color: COLORS.text, fontSize: 8.5, fontWeight: '900', fontVariant: ['tabular-nums'] },
  deckStatusIcon: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.68)', ...GLASS_WEB },
  deckCardCopy: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  deckIcon: { width: 30, height: 30, marginBottom: 7, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.17)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.48)', ...GLASS_WEB },
  deckTitle: { color: '#FFFFFF', fontSize: 17, lineHeight: 21, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  deckEnglish: { color: 'rgba(255,255,255,0.72)', fontSize: 8.5, lineHeight: 12, fontWeight: '700' },
  deckProgressRow: { marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 7 },
  deckProgressTrack: { flex: 1, height: 4, overflow: 'hidden', borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.26)' },
  deckProgressFill: { height: '100%', borderRadius: 2 },
  deckProgressText: { color: 'rgba(255,255,255,0.8)', fontSize: 8, fontWeight: '800', fontVariant: ['tabular-nums'] },
  deckDots: { minHeight: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  deckDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(117,149,180,0.3)' },
  deckDotActive: { width: 18, backgroundColor: COLORS.blue },
  selectedCard: { overflow: 'hidden', borderRadius: 25, borderWidth: 1.2, borderColor: COLORS.border, backgroundColor: 'rgba(255,255,255,0.76)', shadowColor: '#2D6EAA', shadowOffset: { width: 0, height: 11 }, shadowOpacity: 0.18, shadowRadius: 26, elevation: 6, ...GLASS_WEB },
  selectedMedia: { height: 176, overflow: 'hidden', backgroundColor: '#DCEBFA' },
  mediaTopShine: { position: 'absolute', left: 30, right: 30, top: 3, height: 2, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.72)' },
  mediaTopRow: { position: 'absolute', left: 14, right: 14, top: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mediaStatusPill: { minHeight: 27, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, backgroundColor: 'rgba(248,252,255,0.86)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)', ...GLASS_WEB },
  mediaStatusText: { color: COLORS.text, fontSize: 9, lineHeight: 12, fontWeight: '900' },
  mediaIndex: { color: 'rgba(255,255,255,0.88)', fontSize: 28, lineHeight: 32, fontWeight: '900', fontVariant: ['tabular-nums'], textShadowColor: 'rgba(0,0,0,0.28)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  mediaTitleRow: { position: 'absolute', left: 15, right: 15, bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  mediaIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.17)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.58)', ...GLASS_WEB },
  mediaTitleCopy: { flex: 1, minWidth: 0 },
  mediaTitle: { color: '#FFFFFF', fontSize: 24, lineHeight: 28, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.28)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  mediaEnglish: { marginTop: 1, color: 'rgba(255,255,255,0.8)', fontSize: 9, lineHeight: 13, fontWeight: '800', letterSpacing: 1.2 },
  selectedBody: { padding: 15 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  selectedDescription: { color: COLORS.muted, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  challengeCard: { minHeight: 48, marginTop: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 16, backgroundColor: 'rgba(235,246,255,0.78)', borderWidth: 1, borderColor: 'rgba(167,210,242,0.62)' },
  challengeIcon: { width: 29, height: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', shadowColor: COLORS.blue, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 2 },
  challengeCopy: { flex: 1, minWidth: 0 },
  challengeLabel: { color: COLORS.blue, fontSize: 8, lineHeight: 11, fontWeight: '900' },
  challengeText: { marginTop: 1, color: COLORS.text, fontSize: 9.5, lineHeight: 13, fontWeight: '800' },
  roleRow: { marginTop: 8, flexDirection: 'row', gap: 7 },
  rolePill: { flex: 1, minWidth: 0, height: 31, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: 'rgba(177,210,236,0.64)' },
  roleLabel: { flex: 1, color: COLORS.muted, fontSize: 8.5, lineHeight: 11, fontWeight: '700' },
  vocabRow: { marginTop: 11, flexDirection: 'row', gap: 7 },
  vocabChip: { minWidth: 0, maxWidth: '55%', minHeight: 29, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, backgroundColor: 'rgba(231,244,255,0.86)', borderWidth: 1, borderColor: 'rgba(165,210,244,0.62)' },
  vocabChipText: { flexShrink: 1, color: COLORS.blueDark, fontSize: 9, lineHeight: 12, fontWeight: '800' },
  selectedProgressRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between' },
  selectedProgressLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '700' },
  selectedProgressValue: { fontSize: 10, fontWeight: '900', fontVariant: ['tabular-nums'] },
  selectedProgressTrack: { height: 6, marginTop: 5, overflow: 'hidden', borderRadius: 99, backgroundColor: 'rgba(135,169,202,0.2)' },
  selectedProgressFill: { height: '100%', borderRadius: 99 },
  primaryButton: { height: 48, marginTop: 14, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 24, shadowColor: COLORS.blue, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 13, elevation: 5 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});

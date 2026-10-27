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
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
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
type OverviewMetric = 'completed' | 'in_progress' | 'available';

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
  return '可练习';
}

function statusColor(status: SceneStatus) {
  if (status === 'completed') return COLORS.green;
  if (status === 'in_progress') return COLORS.blue;
  return '#22A7E7';
}

function ProgressRing({ progress }: { progress: number }) {
  const size = 78;
  const radius = 31;
  const circumference = 2 * Math.PI * radius;
  const normalizedProgress = Math.max(0, Math.min(progress, 1));

  return (
    <View style={styles.progressRing}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <SvgLinearGradient id="overview-ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#55E6FF" />
            <Stop offset="0.55" stopColor="#168BFA" />
            <Stop offset="1" stopColor="#6558F5" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx="39" cy="39" r={radius} fill="rgba(255,255,255,0.18)" stroke="rgba(126,179,220,0.20)" strokeWidth="8" />
        <Circle
          cx="39"
          cy="39"
          r={radius}
          fill="none"
          stroke="url(#overview-ring)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - normalizedProgress)}
          rotation="-90"
          origin="39, 39"
        />
      </Svg>
      <View style={styles.progressRingCopy}>
        <Text style={styles.progressRingValue}>{Math.round(normalizedProgress * 100)}%</Text>
        <Text style={styles.progressRingLabel}>完成度</Text>
      </View>
    </View>
  );
}

const DECK_CARD_WIDTH = 158;
const DECK_CARD_GAP = 10;

function SceneDeckCard({
  scene,
  progress,
  index,
  selected,
  scrollX,
  onPress,
}: {
  scene: SceneNode;
  progress?: SceneProgress;
  index: number;
  selected: boolean;
  scrollX: SharedValue<number>;
  onPress: () => void;
}) {
  const status = sceneStatus(progress);
  const rounds = progress?.dialogue_rounds ?? 0;
  const progressValue = Math.min(rounds / Math.max(scene.requiredRounds, 1), 1);
  const Icon = SCENE_ICONS[scene.id] ?? MapIcon;
  const cardPosition = index * (DECK_CARD_WIDTH + DECK_CARD_GAP);
  const motionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, [cardPosition - DECK_CARD_WIDTH, cardPosition, cardPosition + DECK_CARD_WIDTH], [0.76, 1, 0.76], Extrapolation.CLAMP),
    transform: [
      { perspective: 900 },
      { translateY: interpolate(scrollX.value, [cardPosition - DECK_CARD_WIDTH, cardPosition, cardPosition + DECK_CARD_WIDTH], [9, 0, 9], Extrapolation.CLAMP) },
      { rotateY: `${interpolate(scrollX.value, [cardPosition - DECK_CARD_WIDTH, cardPosition, cardPosition + DECK_CARD_WIDTH], [5.5, 0, -5.5], Extrapolation.CLAMP)}deg` },
      { scale: interpolate(scrollX.value, [cardPosition - DECK_CARD_WIDTH, cardPosition, cardPosition + DECK_CARD_WIDTH], [0.94, 1, 0.94], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <Animated.View style={[styles.deckCardMotion, motionStyle]}>
      <MotionPressable
        onPress={onPress}
        pressedScale={0.955}
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
            {status === 'completed' ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : <Icon size={13} color="#FFFFFF" />}
          </View>
        </View>
        <View style={styles.deckCardCopy}>
          <View style={styles.deckIcon}><Icon size={17} color="#FFFFFF" strokeWidth={2.2} /></View>
          <Text style={styles.deckTitle}>{scene.nameZh}</Text>
          <Text style={styles.deckEnglish}>{scene.nameEn}</Text>
          <View style={styles.deckProgressRow}><View style={styles.deckProgressTrack}><View style={[styles.deckProgressFill, { width: `${Math.max(progressValue * 100, status === 'locked' ? 0 : 7)}%`, backgroundColor: statusColor(status) }]} /></View><Text style={styles.deckProgressText}>{rounds}/{scene.requiredRounds}</Text></View>
        </View>
      </MotionPressable>
    </Animated.View>
  );
}

export default function SceneMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const initialized = useRef(false);
  const deckRef = useRef<any>(null);
  const deckScrollX = useSharedValue(0);
  const [progressMap, setProgressMap] = useState<Record<string, SceneProgress>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category>('daily');
  const [selectedSceneId, setSelectedSceneId] = useState(DAILY_SCENES[0].id);
  const [activeOverviewMetric, setActiveOverviewMetric] = useState<OverviewMetric>('in_progress');

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
  const availableCount = ALL_SCENES.length - exploredCount;
  const totalDialogueRounds = ALL_SCENES.reduce((sum, scene) => sum + Math.min(progressMap[scene.id]?.dialogue_rounds ?? 0, scene.requiredRounds), 0);
  const requiredDialogueRounds = ALL_SCENES.reduce((sum, scene) => sum + scene.requiredRounds, 0);
  const resumeScene = ALL_SCENES.find((scene) => progressMap[scene.id]?.status === 'in_progress')
    ?? ALL_SCENES.find((scene) => progressMap[scene.id]?.status !== 'completed')
    ?? selectedScene;
  const resumeStatus = sceneStatus(progressMap[resumeScene.id]);
  const resumeRounds = progressMap[resumeScene.id]?.dialogue_rounds ?? 0;
  const overviewMetrics: { key: OverviewMetric; label: string; value: number; color: string; icon: any }[] = [
    { key: 'completed', label: '已完成', value: completedCount, color: COLORS.green, icon: Check },
    { key: 'in_progress', label: '进行中', value: inProgressCount, color: COLORS.blue, icon: TrendingUp },
    { key: 'available', label: '可练习', value: availableCount, color: COLORS.amber, icon: Sparkles },
  ];
  const activeMetric = overviewMetrics.find((metric) => metric.key === activeOverviewMetric) ?? overviewMetrics[1];

  const selectCategory = (category: Category) => {
    setActiveCategory(category);
    const scenes = category === 'daily' ? DAILY_SCENES : WORKPLACE_SCENES;
    const next = scenes.find((scene) => progressMap[scene.id]?.status === 'in_progress')
      ?? scenes.find((scene) => progressMap[scene.id]?.status !== 'completed')
      ?? scenes[0];
    const nextIndex = Math.max(scenes.findIndex((scene) => scene.id === next.id), 0);
    deckScrollX.value = nextIndex * (DECK_CARD_WIDTH + DECK_CARD_GAP);
    setSelectedSceneId(next.id);
  };

  const deckScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => { deckScrollX.value = event.contentOffset.x; },
  });

  const selectDeckScene = (scene: SceneNode, index: number) => {
    setSelectedSceneId(scene.id);
    deckRef.current?.scrollTo?.({ x: index * (DECK_CARD_WIDTH + DECK_CARD_GAP), y: 0, animated: true });
  };

  const focusScene = (scene: SceneNode) => {
    const nextCategory = scene.category;
    const scenes = nextCategory === 'daily' ? DAILY_SCENES : WORKPLACE_SCENES;
    const nextIndex = Math.max(scenes.findIndex((item) => item.id === scene.id), 0);
    setActiveCategory(nextCategory);
    setSelectedSceneId(scene.id);
    deckScrollX.value = nextIndex * (DECK_CARD_WIDTH + DECK_CARD_GAP);
  };

  const handleDeckMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.max(0, Math.min(Math.round(event.nativeEvent.contentOffset.x / (DECK_CARD_WIDTH + DECK_CARD_GAP)), categoryScenes.length - 1));
    const nextScene = categoryScenes[nextIndex];
    if (nextScene && nextScene.id !== selectedSceneId) setSelectedSceneId(nextScene.id);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor={COLORS.background} />
      <LinearGradient pointerEvents="none" colors={['#E8F3FF', '#F8FBFF', '#EFF9F7', '#F6F7FE']} locations={[0, 0.36, 0.72, 1]} style={StyleSheet.absoluteFillObject} />
      <LinearGradient pointerEvents="none" colors={['rgba(72,175,255,0.20)', 'rgba(87,222,209,0.06)', 'rgba(255,255,255,0)']} start={{ x: 0.08, y: 0 }} end={{ x: 0.92, y: 1 }} style={styles.backgroundHaze} />
      <View pointerEvents="none" style={styles.backgroundPrism} />
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
              <Text style={styles.pageSubtitle}>自由选择真实场景，把英语说出来</Text>
            </View>
            <MotionPressable accessibilityRole="button" accessibilityLabel="刷新场景进度" onPress={() => void loadProgress(true)} haptic={false} pressedScale={0.9} style={styles.headerButton}>
              {refreshing ? <ActivityIndicator size="small" color={COLORS.blue} /> : <RefreshCw size={20} color={COLORS.blue} />}
            </MotionPressable>
          </View>

          {loading && Object.keys(progressMap).length === 0 ? (
            <View style={styles.loadingState}><ActivityIndicator size="large" color={COLORS.blue} /><Text style={styles.loadingText}>正在同步场景旅程</Text></View>
          ) : (
            <>
              <Animated.View entering={FadeInDown.springify().damping(19).stiffness(180)} style={styles.overviewCard}>
                <LinearGradient colors={['rgba(253,255,255,0.94)', 'rgba(220,241,255,0.76)', 'rgba(237,249,247,0.86)']} locations={[0, 0.56, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                <View pointerEvents="none" style={styles.overviewAurora} />
                <View pointerEvents="none" style={styles.overviewContourOne} />
                <View pointerEvents="none" style={styles.overviewContourTwo} />
                <View pointerEvents="none" style={styles.cardShine} />

                <View style={styles.overviewTopRow}>
                  <View style={styles.overviewIdentity}>
                    <View style={styles.mapOrb}>
                      <LinearGradient colors={['#64E6FF', '#1A8CF8', '#2557DF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                      <MapIcon size={23} color="#FFFFFF" style={styles.mapOrbIcon} />
                    </View>
                    <View style={styles.overviewCopy}>
                      <Text style={styles.overviewEyebrow}>LIVE LEARNING MAP</Text>
                      <Text style={styles.overviewTitle}>你的场景宇宙</Text>
                      <Text style={styles.overviewLabel}>{ALL_SCENES.length} 个场景全部开放 · 随时切换练习</Text>
                    </View>
                  </View>
                  <ProgressRing progress={overallProgress} />
                </View>

                <View style={styles.roundProgressHeader}>
                  <Text style={styles.roundProgressLabel}>累计对话进度</Text>
                  <Text style={styles.roundProgressValue}>{totalDialogueRounds} / {requiredDialogueRounds} 轮</Text>
                </View>
                <View style={styles.overallTrack}>
                  <LinearGradient colors={['#54DFFF', COLORS.blue, '#6658F3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.overallFill, { width: `${Math.max((totalDialogueRounds / Math.max(requiredDialogueRounds, 1)) * 100, totalDialogueRounds ? 4 : 0)}%` }]} />
                </View>

                <View style={styles.overviewStats}>
                  {overviewMetrics.map((metric) => {
                    const MetricIcon = metric.icon;
                    const active = metric.key === activeOverviewMetric;
                    return (
                      <MotionPressable
                        key={metric.key}
                        onPress={() => setActiveOverviewMetric(metric.key)}
                        pressedScale={0.95}
                        hoverLift={2}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${metric.label} ${metric.value} 个`}
                        style={[styles.overviewStat, active && styles.overviewStatActive, active && { borderColor: `${metric.color}52` }]}
                      >
                        <View style={[styles.overviewStatIcon, { backgroundColor: `${metric.color}16` }]}><MetricIcon size={14} color={metric.color} strokeWidth={2.6} /></View>
                        <View><Text style={styles.overviewStatValue}>{metric.value}</Text><Text style={styles.overviewStatLabel}>{metric.label}</Text></View>
                      </MotionPressable>
                    );
                  })}
                </View>

                <View style={styles.scenePulseCard}>
                  <View style={styles.scenePulseHeader}>
                    <View><Text style={styles.scenePulseEyebrow}>SCENE PULSE</Text><Text style={styles.scenePulseTitle}>{activeMetric.label} · {activeMetric.value} 个场景</Text></View>
                    <Text style={styles.scenePulseHint}>点按柱形定位</Text>
                  </View>
                  <View style={styles.scenePulseBars}>
                    {ALL_SCENES.map((scene) => {
                      const progress = progressMap[scene.id];
                      const status = sceneStatus(progress);
                      const ratio = Math.min((progress?.dialogue_rounds ?? 0) / Math.max(scene.requiredRounds, 1), 1);
                      const matchesMetric = activeOverviewMetric === 'available' ? status === 'locked' : status === activeOverviewMetric;
                      const selected = scene.id === selectedScene.id;
                      return (
                        <MotionPressable
                          key={`pulse-${scene.id}`}
                          onPress={() => focusScene(scene)}
                          haptic={false}
                          pressedScale={0.9}
                          hoverScale={1.08}
                          hoverLift={2}
                          accessibilityRole="button"
                          accessibilityLabel={`${scene.nameZh}，${statusLabel(status)}，${progress?.dialogue_rounds ?? 0}/${scene.requiredRounds} 轮`}
                          style={[styles.scenePulseButton, selected && styles.scenePulseButtonSelected]}
                        >
                          <LinearGradient
                            colors={matchesMetric ? [statusColor(status), status === 'completed' ? '#6EDCB0' : '#58DDFC'] : ['#B8C8D8', '#D8E3EC']}
                            start={{ x: 0, y: 1 }}
                            end={{ x: 0, y: 0 }}
                            style={[styles.scenePulseBar, { height: 9 + ratio * 27, opacity: matchesMetric ? 1 : 0.45 }]}
                          />
                        </MotionPressable>
                      );
                    })}
                  </View>
                </View>

                <MotionPressable
                  onPress={() => router.push(`/(app)/scene-detail?sceneId=${resumeScene.id}` as any)}
                  pressedScale={0.975}
                  hoverLift={3}
                  hoverTilt={1.2}
                  accessibilityRole="button"
                  accessibilityLabel={`${resumeStatus === 'in_progress' ? '继续' : '开始'}${resumeScene.nameZh}场景`}
                  style={styles.overviewContinue}
                >
                  <Image source={sceneImage(resumeScene.id)} style={styles.overviewContinueImage} contentFit="cover" cachePolicy="memory-disk" />
                  <View style={styles.overviewContinueCopy}>
                    <Text style={styles.overviewContinueEyebrow}>{resumeStatus === 'in_progress' ? 'CONTINUE JOURNEY' : 'START ANYWHERE'}</Text>
                    <Text style={styles.overviewContinueTitle}>{resumeStatus === 'in_progress' ? `继续 ${resumeScene.nameZh}` : `从 ${resumeScene.nameZh} 开始`}</Text>
                    <Text style={styles.overviewContinueMeta}>{resumeRounds} / {resumeScene.requiredRounds} 轮 · {resumeScene.nameEn}</Text>
                  </View>
                  <View style={styles.overviewContinueButton}><ArrowRight size={17} color="#FFFFFF" /></View>
                </MotionPressable>
              </Animated.View>

              {loadError ? <View style={styles.errorCard}><Text style={styles.errorText}>{loadError}</Text><MotionPressable onPress={() => void loadProgress(true)} style={styles.retryButton}><Text style={styles.retryText}>重试</Text></MotionPressable></View> : null}

              <Animated.View entering={FadeInDown.delay(70).springify().damping(19).stiffness(180)} style={styles.categoryTabs} accessibilityRole="tablist">
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
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(120).springify().damping(19).stiffness(180)} style={styles.galleryCard}>
                <View pointerEvents="none" style={styles.galleryGlow} />
                <View style={styles.galleryHeader}>
                  <View><Text style={styles.galleryEyebrow}>{activeCategory === 'daily' ? 'LIFE SCENES' : 'CAREER SCENES'}</Text><Text style={styles.galleryTitle}>场景画廊</Text><Text style={styles.gallerySubtitle}>拖动卡片，松手自动吸附到场景</Text></View>
                  <View style={styles.galleryCounter}><Text style={styles.galleryCounterCurrent}>{String(selectedCategoryIndex + 1).padStart(2, '0')}</Text><Text style={styles.galleryCounterTotal}> / {String(categoryScenes.length).padStart(2, '0')}</Text></View>
                </View>
                <Animated.ScrollView
                  ref={deckRef}
                  key={activeCategory}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={DECK_CARD_WIDTH + DECK_CARD_GAP}
                  snapToAlignment="start"
                  contentOffset={{ x: selectedCategoryIndex * (DECK_CARD_WIDTH + DECK_CARD_GAP), y: 0 }}
                  onScroll={deckScrollHandler}
                  scrollEventThrottle={16}
                  onMomentumScrollEnd={handleDeckMomentumEnd}
                  contentContainerStyle={styles.deckContent}
                >
                  {categoryScenes.map((scene, index) => <SceneDeckCard key={scene.id} scene={scene} progress={progressMap[scene.id]} index={index} selected={scene.id === selectedScene.id} scrollX={deckScrollX} onPress={() => selectDeckScene(scene, index)} />)}
                </Animated.ScrollView>
                <View style={styles.deckDots}>{categoryScenes.map((scene) => <View key={`dot-${scene.id}`} style={[styles.deckDot, scene.id === selectedScene.id && styles.deckDotActive]} />)}</View>
              </Animated.View>

              <Animated.View key={selectedScene.id} entering={FadeInDown.duration(280)} style={styles.selectedCard}>
                <MotionPressable onPress={() => router.push(`/(app)/scene-detail?sceneId=${selectedScene.id}` as any)} pressedScale={0.985} hoverScale={1.005} hoverLift={2} hoverTilt={1.5} accessibilityRole="button" accessibilityLabel={`打开${selectedScene.nameZh}场景预览`} style={styles.selectedMedia}>
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
                </MotionPressable>
                <View style={styles.selectedBody}>
                  <Text style={styles.selectedDescription} numberOfLines={2}>{selectedScene.description}</Text>
                  <View style={styles.challengeCard}><View style={styles.challengeIcon}><Target size={16} color={COLORS.blue} /></View><View style={styles.challengeCopy}><Text style={styles.challengeLabel}>本场目标</Text><Text style={styles.challengeText} numberOfLines={1}>{selectedScene.dialogueGoal}</Text></View></View>
                  <View style={styles.roleRow}><View style={styles.rolePill}><Bot size={13} color={COLORS.blue} /><Text style={styles.roleLabel}>AI · {selectedScene.aiRole}</Text></View><View style={styles.rolePill}><UserRound size={13} color={COLORS.green} /><Text style={styles.roleLabel}>你 · {selectedScene.userRole}</Text></View></View>
                  <View style={styles.vocabRow}>
                    {selectedScene.vocab.slice(0, 2).map((item, index) => <View key={item.word} style={styles.vocabChip}>{index === 0 ? <Volume2 size={12} color={COLORS.blue} /> : null}<Text style={styles.vocabChipText} numberOfLines={1}>{item.word}</Text></View>)}
                  </View>
                  <View style={styles.selectedProgressRow}><Text style={styles.selectedProgressLabel}>对话进度</Text><Text style={[styles.selectedProgressValue, { color: statusColor(selectedStatus) }]}>{selectedRounds} / {selectedScene.requiredRounds} 轮</Text></View>
                  <View style={styles.selectedProgressTrack}><View style={[styles.selectedProgressFill, { width: `${selectedPercent}%`, backgroundColor: statusColor(selectedStatus) }]} /></View>
                  <MotionPressable onPress={() => router.push(`/(app)/scene-detail?sceneId=${selectedScene.id}` as any)} pressedScale={0.975} hoverLift={2} accessibilityRole="button" accessibilityLabel={`${selectedStatus === 'locked' ? '开始练习' : selectedStatus === 'completed' ? '再次练习' : '继续练习'}${selectedScene.nameZh}`} style={styles.primaryButton}>
                    <LinearGradient colors={['#31D1FF', COLORS.blue, COLORS.blueDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                    {selectedStatus === 'locked' ? <Sparkles size={18} color="#FFFFFF" /> : <MessageCircleMore size={18} color="#FFFFFF" />}
                    <Text style={styles.primaryButtonText}>{selectedStatus === 'locked' ? '开始练习' : selectedStatus === 'completed' ? '再次练习' : '继续练习'}</Text>
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
  backgroundHaze: { position: 'absolute', left: -80, right: -80, top: -100, height: 540, transform: [{ rotate: '-8deg' }] },
  backgroundPrism: { position: 'absolute', width: 720, height: 320, top: 92, left: '18%', borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.24)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', transform: [{ rotate: '-13deg' }] },
  backgroundGrid: { ...StyleSheet.absoluteFillObject, opacity: 0.2 },
  backgroundGridLineVertical: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(70,137,190,0.09)', transform: [{ rotate: '9deg' }] },
  backgroundGridLineHorizontal: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(70,137,190,0.08)', transform: [{ rotate: '-3deg' }] },
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
  overviewCard: { overflow: 'hidden', borderRadius: 28, borderWidth: 1.2, borderColor: 'rgba(155,207,242,0.78)', padding: 15, shadowColor: '#245E98', shadowOffset: { width: 0, height: 17 }, shadowOpacity: 0.18, shadowRadius: 30, elevation: 7, ...GLASS_WEB },
  overviewAurora: { position: 'absolute', width: 250, height: 160, top: -82, right: -54, borderRadius: 70, backgroundColor: 'rgba(84,187,255,0.16)', transform: [{ rotate: '-18deg' }] },
  overviewContourOne: { position: 'absolute', width: 210, height: 210, borderRadius: 105, right: -90, top: -76, borderWidth: 1, borderColor: 'rgba(90,174,236,0.20)' },
  overviewContourTwo: { position: 'absolute', width: 164, height: 164, borderRadius: 82, right: -62, top: -53, borderWidth: 1, borderColor: 'rgba(255,255,255,0.72)' },
  cardShine: { position: 'absolute', left: 25, right: 25, top: 2, height: 2, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.94)' },
  overviewTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  overviewIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11 },
  mapOrb: { width: 49, height: 49, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.86)', shadowColor: COLORS.blue, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.32, shadowRadius: 14, elevation: 4 },
  mapOrbIcon: { zIndex: 2 },
  overviewCopy: { flex: 1, minWidth: 0 },
  overviewEyebrow: { color: COLORS.blue, fontSize: 7.5, lineHeight: 11, fontWeight: '900', letterSpacing: 1.15 },
  overviewTitle: { marginTop: 1, color: COLORS.text, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  overviewLabel: { marginTop: 2, color: COLORS.muted, fontSize: 8.5, lineHeight: 12, fontWeight: '700' },
  progressRing: { width: 78, height: 78, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.blue, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.14, shadowRadius: 14 },
  progressRingCopy: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  progressRingValue: { color: COLORS.text, fontSize: 16, lineHeight: 19, fontWeight: '900', fontVariant: ['tabular-nums'] },
  progressRingLabel: { color: COLORS.muted, fontSize: 7, lineHeight: 10, fontWeight: '800' },
  overviewValue: { marginTop: 2, color: COLORS.text, fontSize: 22, lineHeight: 27, fontWeight: '900', fontVariant: ['tabular-nums'] },
  overviewUnit: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  overviewPercent: { alignItems: 'flex-end' },
  overviewPercentValue: { color: COLORS.blue, fontSize: 22, lineHeight: 26, fontWeight: '900', fontVariant: ['tabular-nums'] },
  overviewPercentLabel: { color: COLORS.muted, fontSize: 9, lineHeight: 13, fontWeight: '700' },
  roundProgressHeader: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundProgressLabel: { color: COLORS.muted, fontSize: 8.5, lineHeight: 12, fontWeight: '800' },
  roundProgressValue: { color: COLORS.blueDark, fontSize: 8.5, lineHeight: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  overallTrack: { height: 7, marginTop: 6, overflow: 'hidden', borderRadius: 99, backgroundColor: 'rgba(111,163,205,0.17)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.58)' },
  overallFill: { height: '100%', borderRadius: 99 },
  overviewStats: { marginTop: 11, flexDirection: 'row', gap: 7 },
  overviewStat: { flex: 1, minWidth: 0, height: 51, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.46)', borderWidth: 1, borderColor: 'rgba(172,207,234,0.34)' },
  overviewStatActive: { backgroundColor: 'rgba(255,255,255,0.82)', shadowColor: '#387BB4', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 2 },
  overviewStatIcon: { width: 27, height: 27, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  overviewStatValue: { color: COLORS.text, fontSize: 14, lineHeight: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  overviewStatLabel: { color: COLORS.muted, fontSize: 7.5, lineHeight: 10, fontWeight: '800' },
  scenePulseCard: { marginTop: 10, paddingHorizontal: 11, paddingTop: 9, paddingBottom: 8, borderRadius: 18, backgroundColor: 'rgba(245,251,255,0.58)', borderWidth: 1, borderColor: 'rgba(166,207,236,0.48)' },
  scenePulseHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  scenePulseEyebrow: { color: COLORS.blue, fontSize: 6.5, lineHeight: 9, fontWeight: '900', letterSpacing: 1 },
  scenePulseTitle: { marginTop: 1, color: COLORS.text, fontSize: 9, lineHeight: 12, fontWeight: '900' },
  scenePulseHint: { color: COLORS.subtle, fontSize: 7.5, lineHeight: 10, fontWeight: '700' },
  scenePulseBars: { height: 45, marginTop: 5, flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  scenePulseButton: { flex: 1, minWidth: 0, height: 43, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'flex-end', borderRadius: 6 },
  scenePulseButtonSelected: { backgroundColor: 'rgba(20,124,245,0.08)' },
  scenePulseBar: { width: '100%', minWidth: 4, maxWidth: 14, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.68)' },
  overviewContinue: { minHeight: 61, marginTop: 10, padding: 7, paddingRight: 9, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 19, backgroundColor: 'rgba(9,36,67,0.92)', borderWidth: 1, borderColor: 'rgba(112,204,255,0.58)', shadowColor: '#075CC8', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 3 },
  overviewContinueImage: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#D9E9F5', borderWidth: 1, borderColor: 'rgba(255,255,255,0.62)' },
  overviewContinueCopy: { flex: 1, minWidth: 0 },
  overviewContinueEyebrow: { color: '#64DFFF', fontSize: 6.5, lineHeight: 9, fontWeight: '900', letterSpacing: 1 },
  overviewContinueTitle: { marginTop: 1, color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '900' },
  overviewContinueMeta: { marginTop: 1, color: 'rgba(224,240,252,0.66)', fontSize: 7.5, lineHeight: 10, fontWeight: '700' },
  overviewContinueButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.blue, borderWidth: 1, borderColor: 'rgba(255,255,255,0.58)', shadowColor: COLORS.cyan, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8 },
  statDivider: { width: 1, height: 21, backgroundColor: 'rgba(164,199,226,0.38)' },
  accessNote: { minHeight: 38, marginTop: 13, paddingLeft: 10, paddingRight: 7, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(167,210,242,0.58)' },
  accessNoteText: { flex: 1, color: COLORS.blueDark, fontSize: 9, lineHeight: 12, fontWeight: '800' },
  accessThumbs: { flexDirection: 'row', alignItems: 'center', paddingLeft: 4 },
  accessThumb: { width: 25, height: 25, borderRadius: 13, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#DFECF7' },
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
  deckCardMotion: { width: DECK_CARD_WIDTH, height: 202, paddingVertical: 5 },
  deckCard: { flex: 1, overflow: 'hidden', borderRadius: 22, backgroundColor: '#DCEAF5', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)', shadowColor: '#24577E', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.19, shadowRadius: 15, elevation: 4 },
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

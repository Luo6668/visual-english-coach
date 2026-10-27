import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowRight,
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
  TrainFront,
  TrendingUp,
  Utensils,
  Users,
} from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

function MapNode({
  scene,
  progress,
  index,
  selected,
  isLast,
  onPress,
}: {
  scene: SceneNode;
  progress?: SceneProgress;
  index: number;
  selected: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const status = sceneStatus(progress);
  const color = statusColor(status);
  const rounds = progress?.dialogue_rounds ?? 0;
  const progressValue = Math.min(rounds / Math.max(scene.requiredRounds, 1), 1);
  const Icon = SCENE_ICONS[scene.id] ?? MapIcon;
  const isLeft = index % 2 === 0;

  return (
    <View style={styles.mapNodeRow}>
      {!isLast ? (
        <View
          pointerEvents="none"
          style={[
            styles.pathConnector,
            isLeft ? styles.pathConnectorRight : styles.pathConnectorLeft,
            status !== 'locked' && { backgroundColor: `${color}80` },
          ]}
        />
      ) : null}
      <View style={[styles.nodeAnchor, isLeft ? styles.nodeAnchorLeft : styles.nodeAnchorRight]}>
        <MotionPressable
          onPress={onPress}
          pressedScale={0.92}
          hoverScale={1.025}
          hoverLift={4}
          hoverTilt={2.2}
          accessibilityRole="button"
          accessibilityLabel={`${scene.nameZh}，${statusLabel(status)}，${rounds}/${scene.requiredRounds} 轮`}
          style={[styles.nodeButton, selected && styles.nodeButtonSelected, status === 'completed' && styles.nodeButtonCompleted]}
        >
          <LinearGradient
            colors={selected
              ? ['#B8F3FF', '#2AB8FF', '#0877F3', '#0755D7']
              : status === 'completed'
                ? ['#F3FFF9', '#D8F9E7']
                : ['rgba(255,255,255,0.96)', 'rgba(229,241,251,0.86)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View pointerEvents="none" style={styles.nodeShine} />
          <Icon size={29} color={selected ? '#FFFFFF' : color} strokeWidth={2.1} />
          {status === 'completed' ? <View style={styles.nodeCheck}><Check size={12} color="#FFFFFF" strokeWidth={3} /></View> : null}
          {status === 'locked' ? <View style={styles.nodeLock}><LockKeyhole size={11} color={COLORS.subtle} /></View> : null}
        </MotionPressable>
        <View style={[styles.nodeLabelWrap, isLeft ? styles.nodeLabelLeft : styles.nodeLabelRight]}>
          <Text style={[styles.nodeIndex, selected && styles.nodeIndexSelected]}>{String(index + 1).padStart(2, '0')}</Text>
          <Text style={[styles.nodeTitle, selected && styles.nodeTitleSelected]}>{scene.nameZh}</Text>
          <Text style={styles.nodeEnglish}>{scene.nameEn}</Text>
          <View style={styles.nodeMiniProgress}>
            <View style={[styles.nodeMiniProgressFill, { width: `${Math.max(progressValue * 100, status === 'locked' ? 0 : 8)}%`, backgroundColor: color }]} />
          </View>
        </View>
      </View>
    </View>
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

  const completedCount = ALL_SCENES.filter((scene) => progressMap[scene.id]?.status === 'completed').length;
  const inProgressCount = ALL_SCENES.filter((scene) => progressMap[scene.id]?.status === 'in_progress').length;
  const exploredCount = completedCount + inProgressCount;
  const categoryCompleted = categoryScenes.filter((scene) => progressMap[scene.id]?.status === 'completed').length;
  const overallProgress = completedCount / Math.max(ALL_SCENES.length, 1);

  const selectCategory = (category: Category) => {
    setActiveCategory(category);
    const scenes = category === 'daily' ? DAILY_SCENES : WORKPLACE_SCENES;
    const next = scenes.find((scene) => progressMap[scene.id]?.status === 'in_progress')
      ?? scenes.find((scene) => progressMap[scene.id]?.status !== 'completed')
      ?? scenes[0];
    setSelectedSceneId(next.id);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor={COLORS.background} />
      <View pointerEvents="none" style={styles.ambientBlue} />
      <View pointerEvents="none" style={styles.ambientGreen} />
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

              <Animated.View key={selectedScene.id} entering={FadeInDown.duration(260)} style={styles.selectedCard}>
                <LinearGradient colors={selectedStatus === 'completed' ? ['#ECFFF5', '#E6F5FF'] : selectedStatus === 'in_progress' ? ['#E2F6FF', '#EDF3FF'] : ['#F8FBFF', '#ECF3F9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                <View pointerEvents="none" style={styles.cardShine} />
                <View style={styles.selectedHeader}>
                  <View style={[styles.selectedIcon, { backgroundColor: `${statusColor(selectedStatus)}16` }]}><SelectedIcon size={28} color={statusColor(selectedStatus)} /></View>
                  <View style={styles.selectedTitleCopy}><View style={styles.selectedStatusRow}><View style={[styles.statusDot, { backgroundColor: statusColor(selectedStatus) }]} /><Text style={[styles.selectedStatus, { color: statusColor(selectedStatus) }]}>{statusLabel(selectedStatus)}</Text></View><Text style={styles.selectedTitle}>{selectedScene.nameZh}</Text><Text style={styles.selectedEnglish}>{selectedScene.nameEn}</Text></View>
                  <Text style={styles.selectedIndex}>{String(categoryScenes.findIndex((scene) => scene.id === selectedScene.id) + 1).padStart(2, '0')}</Text>
                </View>
                <Text style={styles.selectedDescription} numberOfLines={2}>{selectedScene.description}</Text>
                <View style={styles.selectedProgressRow}><Text style={styles.selectedProgressLabel}>对话进度</Text><Text style={[styles.selectedProgressValue, { color: statusColor(selectedStatus) }]}>{selectedRounds} / {selectedScene.requiredRounds} 轮</Text></View>
                <View style={styles.selectedProgressTrack}><View style={[styles.selectedProgressFill, { width: `${selectedPercent}%`, backgroundColor: statusColor(selectedStatus) }]} /></View>
                <MotionPressable onPress={() => router.push(`/(app)/scene-detail?sceneId=${selectedScene.id}` as any)} pressedScale={0.975} hoverLift={2} accessibilityRole="button" accessibilityLabel={`${selectedStatus === 'locked' ? '开始探索' : selectedStatus === 'completed' ? '再次练习' : '继续练习'}${selectedScene.nameZh}`} style={styles.primaryButton}>
                  <LinearGradient colors={['#31D1FF', COLORS.blue, COLORS.blueDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                  {selectedStatus === 'locked' ? <Sparkles size={18} color="#FFFFFF" /> : <MessageCircleMore size={18} color="#FFFFFF" />}
                  <Text style={styles.primaryButtonText}>{selectedStatus === 'locked' ? '开始探索' : selectedStatus === 'completed' ? '再次练习' : '继续练习'}</Text>
                  <ArrowRight size={18} color="#FFFFFF" />
                </MotionPressable>
              </Animated.View>

              <View style={styles.routeCard}>
                <View style={styles.routeHeader}>
                  <View><Text style={styles.routeEyebrow}>{activeCategory === 'daily' ? 'DAILY ROUTE' : 'CAREER ROUTE'}</Text><Text style={styles.routeTitle}>{activeCategory === 'daily' ? '生活表达路线' : '职场沟通路线'}</Text><Text style={styles.routeSubtitle}>点击节点查看任务，再进入场景练习</Text></View>
                  <View style={styles.routeProgressBadge}><Text style={styles.routeProgressValue}>{categoryCompleted}/{categoryScenes.length}</Text><Text style={styles.routeProgressLabel}>完成</Text></View>
                </View>
                <View style={styles.routeLegend}><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLORS.green }]} /><Text style={styles.legendText}>已完成</Text></View><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLORS.blue }]} /><Text style={styles.legendText}>进行中</Text></View><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLORS.subtle }]} /><Text style={styles.legendText}>待探索</Text></View></View>
                <View style={styles.mapRoute}>
                  {categoryScenes.map((scene, index) => <MapNode key={scene.id} scene={scene} progress={progressMap[scene.id]} index={index} selected={scene.id === selectedScene.id} isLast={index === categoryScenes.length - 1} onPress={() => setSelectedSceneId(scene.id)} />)}
                </View>
                <View style={styles.routeFinish}><View style={styles.finishLine} /><View style={styles.finishOrb}><Check size={19} color="#FFFFFF" strokeWidth={3} /></View><Text style={styles.finishTitle}>完成整条路线</Text><Text style={styles.finishSubtitle}>把场景词汇真正变成你的表达</Text></View>
              </View>
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
  selectedCard: { overflow: 'hidden', borderRadius: 25, borderWidth: 1.2, borderColor: COLORS.border, padding: 15, shadowColor: '#2D6EAA', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.14, shadowRadius: 22, elevation: 5, ...GLASS_WEB },
  selectedHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  selectedIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.86)' },
  selectedTitleCopy: { flex: 1, minWidth: 0 },
  selectedStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  selectedStatus: { fontSize: 9, lineHeight: 12, fontWeight: '900' },
  selectedTitle: { marginTop: 1, color: COLORS.text, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  selectedEnglish: { color: COLORS.muted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  selectedIndex: { color: 'rgba(82,112,145,0.22)', fontSize: 35, lineHeight: 38, fontWeight: '900', fontVariant: ['tabular-nums'] },
  selectedDescription: { marginTop: 11, color: COLORS.muted, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  selectedProgressRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between' },
  selectedProgressLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '700' },
  selectedProgressValue: { fontSize: 10, fontWeight: '900', fontVariant: ['tabular-nums'] },
  selectedProgressTrack: { height: 6, marginTop: 5, overflow: 'hidden', borderRadius: 99, backgroundColor: 'rgba(135,169,202,0.2)' },
  selectedProgressFill: { height: '100%', borderRadius: 99 },
  primaryButton: { height: 48, marginTop: 14, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 24, shadowColor: COLORS.blue, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 13, elevation: 5 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  routeCard: { overflow: 'hidden', borderRadius: 26, padding: 16, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: COLORS.border, shadowColor: '#326B9E', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 22, elevation: 4, ...GLASS_WEB },
  routeHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  routeEyebrow: { color: COLORS.blue, fontSize: 8.5, lineHeight: 12, fontWeight: '900', letterSpacing: 1.2 },
  routeTitle: { marginTop: 2, color: COLORS.text, fontSize: 19, lineHeight: 24, fontWeight: '900' },
  routeSubtitle: { marginTop: 2, color: COLORS.muted, fontSize: 9.5, lineHeight: 14, fontWeight: '600' },
  routeProgressBadge: { minWidth: 54, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, backgroundColor: '#E9F5FF' },
  routeProgressValue: { color: COLORS.blue, fontSize: 14, lineHeight: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  routeProgressLabel: { color: COLORS.muted, fontSize: 8.5, lineHeight: 11, fontWeight: '700' },
  routeLegend: { marginTop: 14, flexDirection: 'row', gap: 13 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { color: COLORS.muted, fontSize: 8.5, fontWeight: '700' },
  mapRoute: { marginTop: 8, paddingBottom: 6 },
  mapNodeRow: { position: 'relative', height: 126 },
  pathConnector: { position: 'absolute', top: 91, width: '54%', height: 4, borderRadius: 2, backgroundColor: 'rgba(150,181,208,0.3)' },
  pathConnectorRight: { left: '23%', transform: [{ rotate: '19deg' }] },
  pathConnectorLeft: { right: '23%', transform: [{ rotate: '-19deg' }] },
  nodeAnchor: { position: 'absolute', top: 17, flexDirection: 'row', alignItems: 'center', gap: 10 },
  nodeAnchorLeft: { left: 4 },
  nodeAnchorRight: { right: 4, flexDirection: 'row-reverse' },
  nodeButton: { width: 72, height: 72, overflow: 'hidden', borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1.2, borderColor: 'rgba(180,211,236,0.82)', shadowColor: '#457AA8', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.13, shadowRadius: 16, elevation: 4 },
  nodeButtonSelected: { width: 78, height: 78, borderRadius: 28, borderColor: 'rgba(224,253,255,0.95)', shadowColor: '#087CF5', shadowOpacity: 0.42, shadowRadius: 18, elevation: 7 },
  nodeButtonCompleted: { borderColor: 'rgba(87,207,147,0.6)' },
  nodeShine: { position: 'absolute', left: 12, right: 12, top: 3, height: 2, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.9)' },
  nodeCheck: { position: 'absolute', right: 6, bottom: 6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.green, borderWidth: 2, borderColor: '#FFFFFF' },
  nodeLock: { position: 'absolute', right: 7, bottom: 7, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: 'rgba(173,194,213,0.65)' },
  nodeLabelWrap: { width: 110 },
  nodeLabelLeft: { alignItems: 'flex-start' },
  nodeLabelRight: { alignItems: 'flex-end' },
  nodeIndex: { color: COLORS.subtle, fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 0.8 },
  nodeIndexSelected: { color: COLORS.blue },
  nodeTitle: { marginTop: 1, color: COLORS.text, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  nodeTitleSelected: { color: COLORS.blueDark },
  nodeEnglish: { color: COLORS.muted, fontSize: 8.5, lineHeight: 12, fontWeight: '600' },
  nodeMiniProgress: { width: 72, height: 4, marginTop: 6, overflow: 'hidden', borderRadius: 2, backgroundColor: 'rgba(137,168,198,0.18)' },
  nodeMiniProgressFill: { height: '100%', borderRadius: 2 },
  routeFinish: { alignItems: 'center', paddingTop: 2, paddingBottom: 4 },
  finishLine: { width: 1, height: 20, backgroundColor: 'rgba(92,183,150,0.45)' },
  finishOrb: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.green, borderWidth: 4, borderColor: '#E9FFF4', shadowColor: COLORS.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 },
  finishTitle: { marginTop: 7, color: COLORS.text, fontSize: 12, lineHeight: 16, fontWeight: '900' },
  finishSubtitle: { marginTop: 1, color: COLORS.muted, fontSize: 9, lineHeight: 13, fontWeight: '600' },
});

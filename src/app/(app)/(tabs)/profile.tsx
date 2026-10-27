import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Award,
  BookOpen,
  Camera,
  ChevronRight,
  Flame,
  LockKeyhole,
  LogOut,
  Map,
  Medal,
  RefreshCw,
  Settings,
  Sparkles,
  Star,
  Target,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
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
import { useSession } from '@/ctx';
import { fetchLearningRecords, fetchUserStats, fetchXpData } from '@/lib/api';

const COLORS = {
  background: '#F1F7FD', text: '#091525', muted: '#62758F', subtle: '#94A5BA',
  blue: '#147CF5', blueDark: '#075DD8', cyan: '#39CCFF', green: '#16A76A',
  gold: '#E3A319', coral: '#F06461', line: 'rgba(169,204,231,0.64)', white: '#FFFFFF',
};

const GLASS_WEB = Platform.OS === 'web'
  ? ({ backdropFilter: 'blur(24px) saturate(1.45)', WebkitBackdropFilter: 'blur(24px) saturate(1.45)', isolation: 'isolate' } as any)
  : null;

// 等级与称号规则保持和成长页一致。
const LEVELS = [
  { level: 1, name: '英语新手', minXp: 0, reward: '获得「起步」专属徽章' },
  { level: 2, name: '初级学员', minXp: 100, reward: '解锁称号「English Rookie」' },
  { level: 3, name: '进阶学员', minXp: 300, reward: '获得蓝色专属头像框' },
  { level: 4, name: '表达能手', minXp: 600, reward: '解锁称号「Scene Talker」' },
  { level: 5, name: '场景达人', minXp: 1000, reward: '获得「场景探索者」限定徽章' },
  { level: 6, name: '流利学者', minXp: 1500, reward: '获得金色专属头像框' },
  { level: 7, name: '英语能手', minXp: 2100, reward: '解锁称号「Fluent Speaker」' },
  { level: 8, name: '思维大师', minXp: 2800, reward: '获得「思维大师」稀有徽章' },
  { level: 9, name: '语言达人', minXp: 3600, reward: '解锁称号「Language Pro」+ 彩虹框' },
  { level: 10, name: '英语领袖', minXp: 5000, reward: '传奇称号「English Master」+ 王冠框' },
];

const TITLES = [
  { level: 2, name: 'English Rookie', color: '#438CF4' },
  { level: 4, name: 'Scene Talker', color: '#F08A42' },
  { level: 7, name: 'Fluent Speaker', color: '#23A7CF' },
  { level: 9, name: 'Language Pro', color: '#805DF4' },
  { level: 10, name: 'English Master', color: '#D69B17' },
];

function calcLevel(totalXp: number) {
  for (let i = LEVELS.length - 1; i >= 0; i--) if (totalXp >= LEVELS[i].minXp) return LEVELS[i];
  return LEVELS[0];
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useSession();
  const [stats, setStats] = useState<any>(null);
  const [xpData, setXpData] = useState<{ stats: any; logs: any[] }>({ stats: null, logs: [] });
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadProfile = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setLoadError('');
    try {
      const [userStats, xp, records] = await Promise.all([fetchUserStats(), fetchXpData(), fetchLearningRecords()]);
      setStats(userStats);
      setXpData(xp);
      setTotalRecords(records.length);
    } catch {
      setLoadError('学习资料暂时没有同步成功，请稍后重试。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadProfile(false); }, [loadProfile]));

  const streak = stats?.streak_days ?? xpData.stats?.streak_days ?? 0;
  const totalWords = stats?.total_words ?? 0;
  const totalXp = xpData.stats?.total_xp ?? 0;
  const curLevel = calcLevel(totalXp);
  const nextLevel = LEVELS.find((level) => level.level === curLevel.level + 1);
  const progress = nextLevel ? (totalXp - curLevel.minXp) / (nextLevel.minXp - curLevel.minXp) : 1;
  const progressPercent = Math.min(Math.max(progress, 0) * 100, 100);
  const xpToNext = nextLevel ? Math.max(nextLevel.minXp - totalXp, 0) : 0;
  const email = session?.user?.email ?? '用户';
  const displayName = email.includes('@') ? email.split('@')[0] : email;
  const displayInitial = displayName.trim().slice(0, 1).toUpperCase() || 'U';
  const unlockedTitles = TITLES.filter((title) => curLevel.level >= title.level);
  const activeTitle = [...unlockedTitles].reverse()[0];
  const upcomingTitles = TITLES.filter((title) => curLevel.level < title.level).slice(0, 2);

  const metrics = [
    { icon: Camera, value: totalRecords, unit: '场景', label: '学习记录', color: COLORS.blue, route: '/(app)/(tabs)/learning' as any },
    { icon: BookOpen, value: totalWords, unit: '单词', label: '已学词汇', color: '#6C5CE7', route: '/(app)/(tabs)/learning' as any },
    { icon: Flame, value: streak, unit: '天', label: '连续学习', color: COLORS.green, route: '/(app)/(tabs)/growth' as any },
  ];

  const menuItems = [
    { icon: Camera, label: '场景记录', sub: `${totalRecords} 条真实学习记录`, color: COLORS.blue, tint: 'rgba(20,124,245,0.11)', route: '/(app)/(tabs)/learning' as any },
    { icon: BookOpen, label: '英语日记', sub: 'Weekly Story · AI 生成', color: '#7959E8', tint: 'rgba(121,89,232,0.11)', route: '/(app)/diary' as any },
    { icon: Map, label: 'AI 英语地图', sub: '场景覆盖与学习建议', color: COLORS.green, tint: 'rgba(22,167,106,0.11)', route: '/(app)/map' as any },
    { icon: Settings, label: '设置', sub: 'API 配置 · 通知 · 关于', color: '#526A86', tint: 'rgba(82,106,134,0.10)', route: '/(app)/settings' as any },
  ];

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor={COLORS.background} />
      <LinearGradient pointerEvents="none" colors={['#E9F4FF', '#FAFCFF', '#EEF9F6', '#F5F5FD']} locations={[0, 0.38, 0.72, 1]} style={StyleSheet.absoluteFillObject} />
      <LinearGradient pointerEvents="none" colors={['rgba(65,170,255,0.18)', 'rgba(84,224,200,0.04)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.backgroundHaze} />
      <View pointerEvents="none" style={styles.backgroundPrism} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadProfile(true)} tintColor={COLORS.blue} colors={[COLORS.blue]} />}
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 12) + 10 }]}
      >
        <View style={styles.pageContent}>
          <View style={styles.header}>
            <View style={styles.headerCopy}><Text style={styles.headerEyebrow}>PERSONAL SPACE</Text><Text style={styles.pageTitle}>我的</Text><Text style={styles.pageSubtitle}>记录每一次开口，也看见每一步成长</Text></View>
            <MotionPressable accessibilityRole="button" accessibilityLabel="打开设置" onPress={() => router.push('/(app)/settings' as any)} pressedScale={0.9} hoverLift={2} style={styles.headerButton}><Settings size={20} color={COLORS.text} /></MotionPressable>
          </View>

          <Animated.View entering={FadeInDown.springify().damping(19).stiffness(180)} style={styles.identityCard}>
            <LinearGradient colors={['rgba(253,255,255,0.95)', 'rgba(220,241,255,0.80)', 'rgba(239,249,247,0.90)']} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
            <View pointerEvents="none" style={styles.identityAurora} /><View pointerEvents="none" style={styles.identityContourLarge} /><View pointerEvents="none" style={styles.identityContourSmall} /><View pointerEvents="none" style={styles.cardShine} />
            <View style={styles.identityTopRow}>
              <View style={styles.avatarShell}><LinearGradient colors={['#64E8FF', '#188AFA', '#4C58E9']} style={StyleSheet.absoluteFillObject} /><View style={styles.avatarInner}><Text style={styles.avatarInitial}>{displayInitial}</Text></View><View style={styles.avatarStatus} /></View>
              <View style={styles.identityCopy}><Text numberOfLines={1} style={styles.displayName}>{displayName}</Text><Text style={styles.levelName}>{curLevel.name} · LV.{curLevel.level}</Text>{activeTitle ? <View style={styles.activeTitlePill}><Star size={11} color={COLORS.blue} fill={COLORS.blue} /><Text style={styles.activeTitleText}>{activeTitle.name}</Text></View> : null}</View>
              <View style={styles.streakPill}><Flame size={15} color={COLORS.green} fill={COLORS.green} /><View><Text style={styles.streakValue}>{streak}</Text><Text style={styles.streakLabel}>连续天数</Text></View></View>
            </View>
            <View style={styles.levelPanel}>
              <View style={styles.levelPanelHeader}><View><Text style={styles.levelPanelEyebrow}>LEVEL PROGRESS</Text><Text style={styles.levelPanelTitle}>{nextLevel ? `距离 LV.${nextLevel.level} 还差 ${xpToNext} XP` : '已达到最高等级'}</Text></View><Text style={styles.levelXp}>{totalXp} <Text style={styles.levelXpUnit}>XP</Text></Text></View>
              <View style={styles.progressTrack}><LinearGradient colors={[COLORS.cyan, COLORS.blue, '#6958F3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.progressFill, { width: `${progressPercent}%` }]} /></View>
              <View style={styles.progressLabels}><Text style={styles.progressLabel}>LV.{curLevel.level}</Text><Text style={styles.progressLabel}>{nextLevel ? `LV.${nextLevel.level} · ${nextLevel.name}` : 'MAX'}</Text></View>
            </View>
            <View style={styles.metricGrid}>
              {metrics.map((item) => {
                const MetricIcon = item.icon;
                return <MotionPressable key={item.label} onPress={() => router.push(item.route)} pressedScale={0.95} hoverLift={2} accessibilityRole="button" accessibilityLabel={`${item.label} ${item.value} ${item.unit}`} style={styles.metricCard}><View style={[styles.metricIcon, { backgroundColor: `${item.color}14` }]}><MetricIcon size={15} color={item.color} strokeWidth={2.5} /></View><Text style={styles.metricValue}>{item.value}<Text style={styles.metricUnit}> {item.unit}</Text></Text><Text style={styles.metricLabel}>{item.label}</Text></MotionPressable>;
              })}
            </View>
            {nextLevel ? <MotionPressable onPress={() => router.push('/(app)/(tabs)/learning' as any)} pressedScale={0.975} hoverLift={3} hoverTilt={1.1} accessibilityRole="button" accessibilityLabel="继续学习" style={styles.continueCard}><View style={styles.continueIcon}><Target size={18} color="#FFFFFF" /></View><View style={styles.continueCopy}><Text style={styles.continueEyebrow}>NEXT MILESTONE</Text><Text style={styles.continueTitle}>再得 {xpToNext} XP，解锁 {nextLevel.name}</Text><Text numberOfLines={1} style={styles.continueMeta}>{nextLevel.reward}</Text></View><View style={styles.continueArrow}><ChevronRight size={17} color="#FFFFFF" /></View></MotionPressable> : null}
          </Animated.View>

          {loading && !stats && !xpData.stats ? <View style={styles.loadingState}><ActivityIndicator color={COLORS.blue} /><Text style={styles.loadingText}>正在同步学习档案</Text></View> : null}
          {loadError ? <View style={styles.errorCard}><Text style={styles.errorText}>{loadError}</Text><MotionPressable onPress={() => void loadProfile(true)} pressedScale={0.94} style={styles.retryButton}><RefreshCw size={14} color="#A23832" /><Text style={styles.retryText}>重试</Text></MotionPressable></View> : null}

          <Animated.View entering={FadeInDown.delay(80).springify().damping(19).stiffness(180)} style={styles.section}>
            <View style={styles.sectionHeader}><View><Text style={styles.sectionEyebrow}>ACHIEVEMENTS</Text><Text style={styles.sectionTitle}>成长收藏</Text></View><MotionPressable onPress={() => router.push('/(app)/achievements?tab=achievements' as any)} pressedScale={0.92} accessibilityRole="button" accessibilityLabel="查看全部成就" style={styles.sectionAction}><Text style={styles.sectionActionText}>查看全部</Text><ChevronRight size={14} color={COLORS.muted} /></MotionPressable></View>
            <View style={styles.achievementGrid}>
              <MotionPressable onPress={() => router.push('/(app)/achievements?tab=achievements' as any)} pressedScale={0.975} hoverLift={4} hoverTilt={1.4} accessibilityRole="button" accessibilityLabel={`查看当前称号 ${activeTitle?.name ?? ''}`} style={styles.featuredAchievement}>
                <LinearGradient colors={['rgba(255,252,238,0.95)', 'rgba(255,243,202,0.82)', 'rgba(255,255,255,0.92)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                <View style={styles.featuredBadge}><Sparkles size={11} color="#996E06" /><Text style={styles.featuredBadgeText}>当前称号</Text></View><View style={styles.medalOrb}><Medal size={39} color={COLORS.gold} strokeWidth={1.8} /></View><Text numberOfLines={2} style={styles.featuredTitle}>{activeTitle?.name ?? '等待解锁'}</Text><Text style={styles.featuredMeta}>{activeTitle ? '完成阶段学习目标' : '继续学习获得首个称号'}</Text><View style={styles.featuredLink}><Text style={styles.featuredLinkText}>查看成长轨迹</Text><ChevronRight size={13} color="#8E680E" /></View>
              </MotionPressable>
              <View style={styles.upcomingList}>
                {upcomingTitles.length > 0 ? upcomingTitles.map((title, index) => <MotionPressable key={title.name} onPress={() => router.push('/(app)/achievements?tab=achievements' as any)} pressedScale={0.965} hoverLift={3} accessibilityRole="button" accessibilityLabel={`查看称号 ${title.name}，LV.${title.level} 解锁`} style={styles.upcomingCard}><View style={[styles.upcomingIcon, { backgroundColor: `${title.color}12` }]}><Award size={23} color={title.color} strokeWidth={1.8} /><View style={styles.lockDot}><LockKeyhole size={8} color="#FFFFFF" /></View></View><View style={styles.upcomingCopy}><Text numberOfLines={1} style={styles.upcomingTitle}>{title.name}</Text><Text style={styles.upcomingMeta}>LV.{title.level} 解锁</Text><View style={styles.upcomingTrack}><View style={[styles.upcomingFill, { width: `${Math.min((curLevel.level / title.level) * 100, 100)}%`, backgroundColor: title.color }]} /></View></View><Text style={styles.upcomingIndex}>0{index + 1}</Text></MotionPressable>) : <MotionPressable onPress={() => router.push('/(app)/achievements?tab=achievements' as any)} pressedScale={0.97} hoverLift={3} style={styles.allUnlockedCard}><Medal size={32} color={COLORS.green} /><Text style={styles.allUnlockedTitle}>称号已全部解锁</Text><Text style={styles.allUnlockedMeta}>查看完整收藏</Text></MotionPressable>}
              </View>
            </View>
            <View style={styles.titleCollectionHeader}><Text style={styles.titleCollectionTitle}>称号收藏</Text><Text style={styles.titleCollectionCount}>{unlockedTitles.length} / {TITLES.length}</Text></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.titleCollection}>
              {TITLES.map((title) => {
                const unlocked = curLevel.level >= title.level;
                const active = activeTitle?.name === title.name;
                return <MotionPressable key={title.name} onPress={() => router.push('/(app)/achievements?tab=titles' as any)} pressedScale={0.94} hoverLift={3} accessibilityRole="button" accessibilityLabel={`${title.name}，${unlocked ? '已获得' : `LV.${title.level} 解锁`}`} style={[styles.titleChip, active && styles.titleChipActive]}><View style={[styles.titleChipIcon, unlocked && { borderColor: `${title.color}66`, backgroundColor: `${title.color}11` }]}>{unlocked ? <Medal size={17} color={title.color} /> : <LockKeyhole size={14} color={COLORS.subtle} />}</View><View><Text style={[styles.titleChipName, active && { color: title.color }]}>{title.name}</Text><Text style={styles.titleChipStatus}>{unlocked ? '已获得' : `LV.${title.level} 解锁`}</Text></View></MotionPressable>;
              })}
            </ScrollView>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(140).springify().damping(19).stiffness(180)} style={styles.section}>
            <View style={styles.sectionHeader}><View><Text style={styles.sectionEyebrow}>PERSONAL TOOLS</Text><Text style={styles.sectionTitle}>学习工具</Text></View></View>
            <View style={styles.menuGrid}>{menuItems.map((item) => { const MenuIcon = item.icon; return <MotionPressable key={item.label} onPress={() => router.push(item.route)} pressedScale={0.965} hoverLift={4} hoverTilt={1.2} accessibilityRole="button" accessibilityLabel={`${item.label}，${item.sub}`} style={styles.menuCard}><View style={[styles.menuIcon, { backgroundColor: item.tint }]}><MenuIcon size={21} color={item.color} strokeWidth={2} /></View><View style={styles.menuCardTop}><Text style={styles.menuTitle}>{item.label}</Text><View style={styles.menuArrow}><ChevronRight size={15} color={COLORS.muted} /></View></View><Text numberOfLines={2} style={styles.menuSub}>{item.sub}</Text></MotionPressable>; })}</View>
          </Animated.View>
          <MotionPressable accessibilityRole="button" accessibilityLabel="退出登录" onPress={signOut} pressedScale={0.97} style={styles.logoutButton}><LogOut size={16} color={COLORS.coral} /><Text style={styles.logoutText}>退出登录</Text></MotionPressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  backgroundHaze: { position: 'absolute', left: -90, right: -90, top: -110, height: 560, transform: [{ rotate: '-8deg' }] },
  backgroundPrism: { position: 'absolute', width: 700, height: 320, top: 90, left: '20%', borderRadius: 112, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.54)', transform: [{ rotate: '-13deg' }] },
  scrollContent: { paddingBottom: 132 },
  pageContent: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 16, gap: 15 },
  header: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: { color: COLORS.blue, fontSize: 8.5, lineHeight: 12, fontWeight: '900', letterSpacing: 1.35 },
  pageTitle: { marginTop: 1, color: COLORS.text, fontSize: 27, lineHeight: 32, fontWeight: '900' },
  pageSubtitle: { color: COLORS.muted, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  headerButton: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.74)', borderWidth: 1, borderColor: COLORS.line, shadowColor: '#3C77A9', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 13, elevation: 3, ...GLASS_WEB },
  identityCard: { overflow: 'hidden', borderRadius: 29, borderWidth: 1.2, borderColor: 'rgba(156,207,242,0.78)', padding: 15, shadowColor: '#245F98', shadowOffset: { width: 0, height: 17 }, shadowOpacity: 0.18, shadowRadius: 30, elevation: 7, ...GLASS_WEB },
  identityAurora: { position: 'absolute', width: 260, height: 160, top: -82, right: -65, borderRadius: 72, backgroundColor: 'rgba(83,188,255,0.16)', transform: [{ rotate: '-18deg' }] },
  identityContourLarge: { position: 'absolute', width: 230, height: 230, borderRadius: 115, right: -100, top: -90, borderWidth: 1, borderColor: 'rgba(91,178,238,0.20)' },
  identityContourSmall: { position: 'absolute', width: 174, height: 174, borderRadius: 87, right: -70, top: -61, borderWidth: 1, borderColor: 'rgba(255,255,255,0.72)' },
  cardShine: { position: 'absolute', left: 26, right: 26, top: 2, height: 2, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.95)' },
  identityTopRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatarShell: { width: 66, height: 66, padding: 3, borderRadius: 23, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.86)', shadowColor: COLORS.blue, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.26, shadowRadius: 14, elevation: 4 },
  avatarInner: { width: '100%', height: '100%', borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(250,253,255,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.86)' },
  avatarInitial: { color: COLORS.blueDark, fontSize: 27, lineHeight: 31, fontWeight: '900' },
  avatarStatus: { position: 'absolute', right: 4, bottom: 4, width: 13, height: 13, borderRadius: 7, backgroundColor: COLORS.green, borderWidth: 2, borderColor: '#FFFFFF' },
  identityCopy: { flex: 1, minWidth: 0 },
  displayName: { color: COLORS.text, fontSize: 19, lineHeight: 23, fontWeight: '900' },
  levelName: { marginTop: 2, color: COLORS.muted, fontSize: 9.5, lineHeight: 13, fontWeight: '700' },
  activeTitlePill: { minHeight: 23, marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.68)', borderWidth: 1, borderColor: 'rgba(157,204,240,0.55)' },
  activeTitleText: { color: COLORS.blueDark, fontSize: 8, lineHeight: 11, fontWeight: '900' },
  streakPill: { minWidth: 61, minHeight: 46, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, backgroundColor: 'rgba(242,255,249,0.76)', borderWidth: 1, borderColor: 'rgba(125,220,179,0.52)' },
  streakValue: { color: COLORS.green, fontSize: 14, lineHeight: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  streakLabel: { color: '#4E7D69', fontSize: 6.5, lineHeight: 9, fontWeight: '800' },
  levelPanel: { marginTop: 14, padding: 12, borderRadius: 19, backgroundColor: 'rgba(247,251,255,0.58)', borderWidth: 1, borderColor: 'rgba(166,207,236,0.46)' },
  levelPanelHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  levelPanelEyebrow: { color: COLORS.blue, fontSize: 6.5, lineHeight: 9, fontWeight: '900', letterSpacing: 1.05 },
  levelPanelTitle: { marginTop: 2, color: COLORS.text, fontSize: 10, lineHeight: 14, fontWeight: '900' },
  levelXp: { color: COLORS.text, fontSize: 17, lineHeight: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
  levelXpUnit: { color: COLORS.muted, fontSize: 8, fontWeight: '800' },
  progressTrack: { height: 8, marginTop: 10, overflow: 'hidden', borderRadius: 99, backgroundColor: 'rgba(110,160,202,0.17)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.62)' },
  progressFill: { height: '100%', borderRadius: 99 },
  progressLabels: { marginTop: 5, flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { color: COLORS.subtle, fontSize: 7, lineHeight: 10, fontWeight: '800' },
  metricGrid: { marginTop: 10, flexDirection: 'row', gap: 7 },
  metricCard: { flex: 1, minWidth: 0, minHeight: 71, padding: 9, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.66)', borderWidth: 1, borderColor: 'rgba(170,207,235,0.48)' },
  metricIcon: { width: 27, height: 27, marginBottom: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metricValue: { color: COLORS.text, fontSize: 15, lineHeight: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  metricUnit: { color: COLORS.muted, fontSize: 7.5, fontWeight: '700' },
  metricLabel: { marginTop: 1, color: COLORS.muted, fontSize: 7.5, lineHeight: 10, fontWeight: '700' },
  continueCard: { minHeight: 65, marginTop: 10, padding: 8, paddingRight: 9, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 20, backgroundColor: 'rgba(9,36,67,0.93)', borderWidth: 1, borderColor: 'rgba(107,203,255,0.56)', shadowColor: '#075CC8', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 3 },
  continueIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.blue, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
  continueCopy: { flex: 1, minWidth: 0 },
  continueEyebrow: { color: '#65DFFF', fontSize: 6.5, lineHeight: 9, fontWeight: '900', letterSpacing: 1 },
  continueTitle: { marginTop: 1, color: '#FFFFFF', fontSize: 10.5, lineHeight: 14, fontWeight: '900' },
  continueMeta: { marginTop: 2, color: 'rgba(224,240,252,0.65)', fontSize: 7, lineHeight: 10, fontWeight: '700' },
  continueArrow: { width: 33, height: 33, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  loadingState: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  errorCard: { minHeight: 50, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 17, backgroundColor: '#FFF2F1', borderWidth: 1, borderColor: '#F2B8B3' },
  errorText: { flex: 1, color: '#9F2D28', fontSize: 10, lineHeight: 14, fontWeight: '700' },
  retryButton: { paddingHorizontal: 9, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, backgroundColor: '#FFFFFF' },
  retryText: { color: '#A23832', fontSize: 9, fontWeight: '900' },
  section: { padding: 14, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.64)', borderWidth: 1, borderColor: COLORS.line, shadowColor: '#326B9E', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.11, shadowRadius: 22, elevation: 4, ...GLASS_WEB },
  sectionHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionEyebrow: { color: COLORS.blue, fontSize: 7, lineHeight: 10, fontWeight: '900', letterSpacing: 1.15 },
  sectionTitle: { marginTop: 1, color: COLORS.text, fontSize: 19, lineHeight: 23, fontWeight: '900' },
  sectionAction: { minHeight: 31, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.65)', borderWidth: 1, borderColor: 'rgba(172,207,234,0.50)' },
  sectionActionText: { color: COLORS.muted, fontSize: 8.5, fontWeight: '800' },
  achievementGrid: { marginTop: 10, minHeight: 193, flexDirection: 'row', gap: 9 },
  featuredAchievement: { flex: 1.06, minWidth: 0, overflow: 'hidden', padding: 12, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(226,179,56,0.50)', shadowColor: '#B78718', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 16, elevation: 3 },
  featuredBadge: { alignSelf: 'flex-start', minHeight: 23, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.68)', borderWidth: 1, borderColor: 'rgba(223,177,57,0.36)' },
  featuredBadgeText: { color: '#8E680E', fontSize: 7, lineHeight: 10, fontWeight: '900' },
  medalOrb: { width: 66, height: 66, marginTop: 10, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(229,186,75,0.52)', shadowColor: '#B78718', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.14, shadowRadius: 12 },
  featuredTitle: { marginTop: 9, color: COLORS.text, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  featuredMeta: { marginTop: 2, color: '#796A43', fontSize: 7.5, lineHeight: 10, fontWeight: '700' },
  featuredLink: { marginTop: 'auto', paddingTop: 7, flexDirection: 'row', alignItems: 'center', gap: 2 },
  featuredLinkText: { color: '#8E680E', fontSize: 7.5, fontWeight: '900' },
  upcomingList: { flex: 1, gap: 9 },
  upcomingCard: { flex: 1, minHeight: 92, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.74)', borderWidth: 1, borderColor: 'rgba(172,207,234,0.54)' },
  upcomingIcon: { width: 41, height: 41, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  lockDot: { position: 'absolute', right: -3, top: -3, width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#607089', borderWidth: 1, borderColor: '#FFFFFF' },
  upcomingCopy: { flex: 1, minWidth: 0 },
  upcomingTitle: { color: COLORS.text, fontSize: 9.5, lineHeight: 13, fontWeight: '900' },
  upcomingMeta: { marginTop: 2, color: COLORS.muted, fontSize: 7, lineHeight: 10, fontWeight: '700' },
  upcomingTrack: { height: 4, marginTop: 6, overflow: 'hidden', borderRadius: 2, backgroundColor: 'rgba(143,171,199,0.18)' },
  upcomingFill: { height: '100%', borderRadius: 2 },
  upcomingIndex: { alignSelf: 'flex-start', color: 'rgba(113,138,164,0.36)', fontSize: 8, fontWeight: '900' },
  allUnlockedCard: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: 'rgba(239,255,247,0.76)', borderWidth: 1, borderColor: 'rgba(116,216,173,0.48)' },
  allUnlockedTitle: { marginTop: 7, color: COLORS.green, fontSize: 10, fontWeight: '900' },
  allUnlockedMeta: { marginTop: 2, color: COLORS.muted, fontSize: 7.5, fontWeight: '700' },
  titleCollectionHeader: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleCollectionTitle: { color: COLORS.text, fontSize: 11, fontWeight: '900' },
  titleCollectionCount: { color: COLORS.blue, fontSize: 8.5, fontWeight: '900', fontVariant: ['tabular-nums'] },
  titleCollection: { gap: 7, paddingTop: 9, paddingBottom: 2, paddingRight: 4 },
  titleChip: { minWidth: 139, minHeight: 56, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.66)', borderWidth: 1, borderColor: 'rgba(172,207,234,0.46)' },
  titleChipActive: { backgroundColor: 'rgba(247,252,255,0.94)', borderColor: 'rgba(64,146,238,0.46)', shadowColor: COLORS.blue, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.11, shadowRadius: 9 },
  titleChipIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(236,242,248,0.7)', borderWidth: 1, borderColor: 'rgba(180,201,220,0.48)' },
  titleChipName: { color: COLORS.text, fontSize: 8.5, lineHeight: 12, fontWeight: '900' },
  titleChipStatus: { marginTop: 2, color: COLORS.muted, fontSize: 7, lineHeight: 10, fontWeight: '700' },
  menuGrid: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  menuCard: { width: '48.7%', minHeight: 119, padding: 11, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(172,207,234,0.52)' },
  menuIcon: { width: 39, height: 39, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  menuCardTop: { marginTop: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },
  menuTitle: { flex: 1, color: COLORS.text, fontSize: 11, lineHeight: 15, fontWeight: '900' },
  menuArrow: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(238,245,251,0.8)' },
  menuSub: { marginTop: 4, color: COLORS.muted, fontSize: 7.5, lineHeight: 11, fontWeight: '700' },
  logoutButton: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.48)', borderWidth: 1, borderColor: 'rgba(226,176,176,0.38)' },
  logoutText: { color: COLORS.coral, fontSize: 10, fontWeight: '800' },
});

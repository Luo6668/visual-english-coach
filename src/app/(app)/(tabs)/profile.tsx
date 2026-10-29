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
  PenLine,
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
  background: '#F4F8FC',
  text: '#0A1728',
  muted: '#62738A',
  subtle: '#93A2B5',
  blue: '#147CF5',
  blueDark: '#075DD8',
  cyan: '#39CCFF',
  green: '#16A76A',
  coral: '#E95D5A',
};

const GLASS_WEB =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(22px) saturate(1.35)',
        WebkitBackdropFilter: 'blur(22px) saturate(1.35)',
        isolation: 'isolate',
      } as any)
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
  for (let index = LEVELS.length - 1; index >= 0; index--) {
    if (totalXp >= LEVELS[index].minXp) return LEVELS[index];
  }
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
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setLoadError('');
    try {
      const [userStats, xp, records] = await Promise.all([
        fetchUserStats(),
        fetchXpData(),
        fetchLearningRecords(),
      ]);
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

  useFocusEffect(
    useCallback(() => {
      void loadProfile(false);
    }, [loadProfile]),
  );

  const streak = stats?.streak_days ?? xpData.stats?.streak_days ?? 0;
  const totalWords = stats?.total_words ?? 0;
  const totalXp = xpData.stats?.total_xp ?? 0;
  const curLevel = calcLevel(totalXp);
  const nextLevel = LEVELS.find((level) => level.level === curLevel.level + 1);
  const progress = nextLevel
    ? (totalXp - curLevel.minXp) / (nextLevel.minXp - curLevel.minXp)
    : 1;
  const progressPercent = Math.min(Math.max(progress, 0) * 100, 100);
  const xpToNext = nextLevel ? Math.max(nextLevel.minXp - totalXp, 0) : 0;
  const email = session?.user?.email ?? '用户';
  const displayName = email.includes('@') ? email.split('@')[0] : email;
  const displayInitial = displayName.trim().slice(0, 1).toUpperCase() || 'U';
  const unlockedTitles = TITLES.filter((title) => curLevel.level >= title.level);
  const activeTitle = [...unlockedTitles].reverse()[0];
  const nextTitle = TITLES.find((title) => curLevel.level < title.level);

  const metrics = [
    {
      icon: Camera,
      value: totalRecords,
      unit: '条',
      label: '场景记录',
      color: COLORS.blue,
      route: '/(app)/(tabs)/learning' as any,
    },
    {
      icon: BookOpen,
      value: totalWords,
      unit: '词',
      label: '已学词汇',
      color: '#7657E8',
      route: '/(app)/(tabs)/learning' as any,
    },
    {
      icon: Flame,
      value: streak,
      unit: '天',
      label: '连续学习',
      color: COLORS.green,
      route: '/(app)/(tabs)/growth' as any,
    },
  ];

  const tools = [
    {
      icon: Camera,
      label: '场景记录',
      sub: `${totalRecords} 条真实学习记录`,
      color: COLORS.blue,
      route: '/(app)/(tabs)/learning' as any,
    },
    {
      icon: Map,
      label: 'AI 英语地图',
      sub: '查看场景覆盖与学习建议',
      color: COLORS.green,
      route: '/(app)/map' as any,
    },
    {
      icon: Settings,
      label: '设置',
      sub: 'API 配置、通知与关于',
      color: '#536A84',
      route: '/(app)/settings' as any,
    },
  ];

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor={COLORS.background} />
      <LinearGradient
        pointerEvents="none"
        colors={['#F8FBFF', '#EEF6FC', '#F8FBFA', '#F4F7FB']}
        locations={[0, 0.38, 0.72, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(60,160,235,0.12)', 'rgba(255,255,255,0)', 'rgba(65,205,176,0.07)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backgroundWash}
      />
      <View pointerEvents="none" style={styles.backgroundGrid}>
        {Array.from({ length: 8 }).map((_, index) => (
          <View key={index} style={[styles.gridLine, { top: index * 72 }]} />
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadProfile(true)}
            tintColor={COLORS.blue}
            colors={[COLORS.blue]}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 12) + 8 },
        ]}
      >
        <View style={styles.pageContent}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.headerEyebrow}>PERSONAL SPACE</Text>
              <Text style={styles.pageTitle}>我的</Text>
              <Text style={styles.pageSubtitle}>你的学习状态，都在这里持续生长</Text>
            </View>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="打开设置"
              onPress={() => router.push('/(app)/settings' as any)}
              pressedScale={0.9}
              hoverLift={2}
              style={styles.headerButton}
            >
              <Settings size={20} color={COLORS.text} />
            </MotionPressable>
          </View>

          <Animated.View
            entering={FadeInDown.springify().damping(19).stiffness(180)}
            style={styles.profileHero}
          >
            <LinearGradient
              colors={[
                'rgba(255,255,255,0.95)',
                'rgba(229,245,255,0.90)',
                'rgba(239,250,247,0.88)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <LinearGradient
              pointerEvents="none"
              colors={[
                'rgba(255,255,255,0)',
                'rgba(255,255,255,0.78)',
                'rgba(52,158,233,0.08)',
                'rgba(255,255,255,0)',
              ]}
              locations={[0, 0.38, 0.68, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroRefraction}
            />
            <View pointerEvents="none" style={styles.heroContourOne} />
            <View pointerEvents="none" style={styles.heroContourTwo} />

            <View style={styles.identityRow}>
              <View style={styles.avatarShell}>
                <LinearGradient
                  colors={['#68E5FF', '#1685F7', '#6257ED']}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.avatarInner}>
                  <Text style={styles.avatarInitial}>{displayInitial}</Text>
                </View>
                <View style={styles.avatarStatus} />
              </View>
              <View style={styles.identityCopy}>
                <Text numberOfLines={1} style={styles.displayName}>
                  {displayName}
                </Text>
                <Text style={styles.levelName}>{curLevel.name}</Text>
                <View style={styles.titleLine}>
                  <Star size={12} color={COLORS.blue} fill={COLORS.blue} />
                  <Text style={styles.activeTitleText}>
                    {activeTitle?.name ?? '继续学习解锁称号'}
                  </Text>
                </View>
              </View>
              <View style={styles.levelBadge}>
                <Text style={styles.levelBadgeSmall}>LEVEL</Text>
                <Text style={styles.levelBadgeValue}>{curLevel.level}</Text>
              </View>
            </View>

            <View style={styles.journeyHeader}>
              <View>
                <Text style={styles.journeyEyebrow}>成长进度</Text>
                <Text style={styles.journeyTitle}>
                  {nextLevel ? `再获得 ${xpToNext} XP 升级` : '已达到最高等级'}
                </Text>
              </View>
              <MotionPressable
                onPress={() => router.push('/(app)/(tabs)/growth' as any)}
                pressedScale={0.94}
                hoverLift={2}
                style={styles.streakPill}
              >
                <Flame size={15} color={COLORS.green} fill={COLORS.green} />
                <Text style={styles.streakPillText}>{streak} 天</Text>
              </MotionPressable>
            </View>
            <View style={styles.progressTrack}>
              <LinearGradient
                colors={[COLORS.cyan, COLORS.blue, '#6958F3']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${progressPercent}%` }]}
              />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabel}>{totalXp} XP</Text>
              <Text style={styles.progressLabel}>
                {nextLevel ? `${nextLevel.minXp} XP · LV.${nextLevel.level}` : 'MAX'}
              </Text>
            </View>

            <View style={styles.metricStrip}>
              {metrics.map((item, index) => {
                const MetricIcon = item.icon;
                return (
                  <MotionPressable
                    key={item.label}
                    onPress={() => router.push(item.route)}
                    pressedScale={0.94}
                    hoverLift={2}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.label} ${item.value} ${item.unit}`}
                    style={[styles.metricItem, index > 0 && styles.metricItemBorder]}
                  >
                    <MetricIcon size={16} color={item.color} strokeWidth={2.5} />
                    <Text style={styles.metricValue}>
                      {item.value}
                      <Text style={styles.metricUnit}> {item.unit}</Text>
                    </Text>
                    <Text style={styles.metricLabel}>{item.label}</Text>
                  </MotionPressable>
                );
              })}
            </View>

            <MotionPressable
              onPress={() => router.push('/(app)/(tabs)/learning' as any)}
              pressedScale={0.975}
              hoverLift={3}
              hoverTilt={1}
              accessibilityRole="button"
              accessibilityLabel="继续学习"
              style={styles.primaryAction}
            >
              <LinearGradient
                colors={['#2196FF', '#1267E8', '#5E58E8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.primaryActionIcon}>
                <Target size={19} color="#FFFFFF" />
              </View>
              <View style={styles.primaryActionCopy}>
                <Text style={styles.primaryActionTitle}>继续今天的学习</Text>
                <Text numberOfLines={1} style={styles.primaryActionMeta}>
                  {nextLevel?.reward ?? '回顾你的学习记录'}
                </Text>
              </View>
              <ChevronRight size={19} color="#FFFFFF" />
            </MotionPressable>
          </Animated.View>

          {loading && !stats && !xpData.stats ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={COLORS.blue} />
              <Text style={styles.loadingText}>正在同步学习档案</Text>
            </View>
          ) : null}

          {loadError ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{loadError}</Text>
              <MotionPressable
                onPress={() => void loadProfile(true)}
                pressedScale={0.94}
                style={styles.retryButton}
              >
                <RefreshCw size={14} color="#A23832" />
                <Text style={styles.retryText}>重试</Text>
              </MotionPressable>
            </View>
          ) : null}

          <Animated.View
            entering={FadeInDown.delay(80).springify().damping(19).stiffness(180)}
            style={styles.contentSection}
          >
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>ACHIEVEMENTS</Text>
                <Text style={styles.sectionTitle}>成长收藏</Text>
              </View>
              <MotionPressable
                onPress={() => router.push('/(app)/achievements?tab=achievements' as any)}
                pressedScale={0.92}
                style={styles.sectionAction}
              >
                <Text style={styles.sectionActionText}>查看全部</Text>
                <ChevronRight size={15} color={COLORS.muted} />
              </MotionPressable>
            </View>

            <MotionPressable
              onPress={() => router.push('/(app)/achievements?tab=achievements' as any)}
              pressedScale={0.975}
              hoverLift={4}
              hoverTilt={1.2}
              accessibilityRole="button"
              accessibilityLabel={`查看当前称号 ${activeTitle?.name ?? ''}`}
              style={styles.achievementFeature}
            >
              <LinearGradient
                colors={['#FFF8D9', '#F0D787', '#FFFDF2', '#E9C665']}
                locations={[0, 0.36, 0.7, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.82)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.achievementSheen}
              />
              <View style={styles.medalStage}>
                <View pointerEvents="none" style={styles.medalRing} />
                <Medal size={45} color="#A96F00" strokeWidth={1.8} />
              </View>
              <View style={styles.achievementCopy}>
                <View style={styles.featuredBadge}>
                  <Sparkles size={12} color="#765000" />
                  <Text style={styles.featuredBadgeText}>当前称号</Text>
                </View>
                <Text numberOfLines={1} style={styles.achievementTitle}>
                  {activeTitle?.name ?? '等待解锁'}
                </Text>
                <Text style={styles.achievementMeta}>
                  {nextTitle ? `下一个称号将在 LV.${nextTitle.level} 解锁` : '全部称号已经解锁'}
                </Text>
              </View>
              <View style={styles.achievementArrow}>
                <ChevronRight size={17} color="#765000" />
              </View>
            </MotionPressable>

            <View style={styles.collectionHeader}>
              <Text style={styles.collectionTitle}>称号轨迹</Text>
              <Text style={styles.collectionCount}>
                {unlockedTitles.length} / {TITLES.length}
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.titleCollection}
            >
              {TITLES.map((title) => {
                const unlocked = curLevel.level >= title.level;
                const active = activeTitle?.name === title.name;
                return (
                  <MotionPressable
                    key={title.name}
                    onPress={() => router.push('/(app)/achievements?tab=titles' as any)}
                    pressedScale={0.94}
                    hoverLift={3}
                    accessibilityRole="button"
                    accessibilityLabel={`${title.name}，${unlocked ? '已获得' : `LV.${title.level} 解锁`}`}
                    style={[styles.titleChip, active && styles.titleChipActive]}
                  >
                    <View
                      style={[
                        styles.titleChipIcon,
                        unlocked && {
                          borderColor: `${title.color}66`,
                          backgroundColor: `${title.color}13`,
                        },
                      ]}
                    >
                      {unlocked ? (
                        <Award size={18} color={title.color} />
                      ) : (
                        <LockKeyhole size={15} color={COLORS.subtle} />
                      )}
                    </View>
                    <View style={styles.titleChipCopy}>
                      <Text style={[styles.titleChipName, active && { color: title.color }]}>
                        {title.name}
                      </Text>
                      <Text style={styles.titleChipStatus}>
                        {unlocked ? '已获得' : `LV.${title.level} 解锁`}
                      </Text>
                    </View>
                  </MotionPressable>
                );
              })}
            </ScrollView>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(140).springify().damping(19).stiffness(180)}
            style={styles.contentSection}
          >
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>PERSONAL TOOLS</Text>
                <Text style={styles.sectionTitle}>学习工具</Text>
              </View>
            </View>

            <MotionPressable
              onPress={() => router.push('/(app)/diary' as any)}
              pressedScale={0.975}
              hoverLift={4}
              hoverTilt={1.1}
              accessibilityRole="button"
              accessibilityLabel="打开英语日记"
              style={styles.diaryFeature}
            >
              <LinearGradient
                colors={['#EEE9FF', '#FBFAFF', '#E8F3FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View pointerEvents="none" style={styles.diaryPattern} />
              <View style={styles.diaryIcon}>
                <PenLine size={24} color="#6D50DE" />
              </View>
              <View style={styles.diaryCopy}>
                <Text style={styles.diaryEyebrow}>DAILY STORY</Text>
                <Text style={styles.diaryTitle}>英语日记</Text>
                <Text style={styles.diaryMeta}>把今天发生的事，变成可以表达的英语</Text>
              </View>
              <View style={styles.diaryAction}>
                <ChevronRight size={18} color="#6D50DE" />
              </View>
            </MotionPressable>

            <View style={styles.toolSheet}>
              {tools.map((item, index) => {
                const ToolIcon = item.icon;
                return (
                  <MotionPressable
                    key={item.label}
                    onPress={() => router.push(item.route)}
                    pressedScale={0.985}
                    hoverLift={1.5}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.label}，${item.sub}`}
                    style={[styles.toolRow, index > 0 && styles.toolRowBorder]}
                  >
                    <View style={[styles.toolIcon, { backgroundColor: `${item.color}12` }]}>
                      <ToolIcon size={20} color={item.color} strokeWidth={2.2} />
                    </View>
                    <View style={styles.toolCopy}>
                      <Text style={styles.toolTitle}>{item.label}</Text>
                      <Text numberOfLines={1} style={styles.toolMeta}>
                        {item.sub}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={COLORS.subtle} />
                  </MotionPressable>
                );
              })}
            </View>
          </Animated.View>

          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel="退出登录"
            onPress={signOut}
            pressedScale={0.97}
            style={styles.logoutButton}
          >
            <LogOut size={17} color={COLORS.coral} />
            <Text style={styles.logoutText}>退出登录</Text>
          </MotionPressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  backgroundWash: {
    position: 'absolute', left: -70, right: -70, top: -100, height: 720,
    transform: [{ rotate: '-7deg' }],
  },
  backgroundGrid: {
    position: 'absolute', left: -80, right: -80, top: 245, height: 620,
    opacity: 0.45, transform: [{ rotate: '-8deg' }],
  },
  gridLine: {
    position: 'absolute', left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(112,164,201,0.08)',
  },
  scrollContent: { paddingBottom: 132 },
  pageContent: {
    width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 17, gap: 24,
  },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: {
    color: COLORS.blue, fontSize: 9, lineHeight: 13, fontWeight: '900', letterSpacing: 1.45,
  },
  pageTitle: {
    marginTop: 1, color: COLORS.text, fontSize: 30, lineHeight: 35, fontWeight: '900',
  },
  pageSubtitle: {
    marginTop: 1, color: COLORS.muted, fontSize: 12, lineHeight: 17, fontWeight: '600',
  },
  headerButton: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.74)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)', shadowColor: '#3C77A9',
    shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.13, shadowRadius: 16,
    elevation: 3, ...GLASS_WEB,
  },
  profileHero: {
    overflow: 'hidden', borderRadius: 30, borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.95)', padding: 18, shadowColor: '#3978A6',
    shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.18, shadowRadius: 36,
    elevation: 8, ...GLASS_WEB,
  },
  heroRefraction: {
    position: 'absolute', width: '165%', height: 250, top: -90, left: '-30%',
    transform: [{ rotate: '-11deg' }],
  },
  heroContourOne: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130, right: -126,
    top: -118, borderWidth: 1, borderColor: 'rgba(40,146,221,0.15)',
  },
  heroContourTwo: {
    position: 'absolute', width: 190, height: 190, borderRadius: 95, right: -78,
    top: -76, borderWidth: 1, borderColor: 'rgba(255,255,255,0.88)',
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  avatarShell: {
    width: 68, height: 68, padding: 3, borderRadius: 24, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)', shadowColor: '#32BDF7',
    shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.34, shadowRadius: 17,
    elevation: 5,
  },
  avatarInner: {
    width: '100%', height: '100%', borderRadius: 21, alignItems: 'center',
    justifyContent: 'center', backgroundColor: 'rgba(250,253,255,0.90)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  avatarInitial: { color: COLORS.blueDark, fontSize: 28, lineHeight: 32, fontWeight: '900' },
  avatarStatus: {
    position: 'absolute', right: 4, bottom: 4, width: 14, height: 14, borderRadius: 7,
    backgroundColor: COLORS.green, borderWidth: 2, borderColor: '#FFFFFF',
  },
  identityCopy: { flex: 1, minWidth: 0 },
  displayName: { color: COLORS.text, fontSize: 21, lineHeight: 25, fontWeight: '900' },
  levelName: {
    marginTop: 2, color: COLORS.muted, fontSize: 11, lineHeight: 15, fontWeight: '700',
  },
  titleLine: { marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  activeTitleText: {
    color: COLORS.blueDark, fontSize: 9, lineHeight: 12, fontWeight: '900',
  },
  levelBadge: {
    width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.56)', borderWidth: 1,
    borderColor: 'rgba(121,183,227,0.30)',
  },
  levelBadgeSmall: {
    color: COLORS.muted, fontSize: 7, lineHeight: 9, fontWeight: '900', letterSpacing: 1,
  },
  levelBadgeValue: {
    marginTop: 1, color: COLORS.text, fontSize: 24, lineHeight: 27, fontWeight: '900',
  },
  journeyHeader: {
    marginTop: 22, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 12,
  },
  journeyEyebrow: {
    color: COLORS.muted, fontSize: 9, lineHeight: 12, fontWeight: '800',
  },
  journeyTitle: {
    marginTop: 2, color: COLORS.text, fontSize: 15, lineHeight: 20, fontWeight: '900',
  },
  streakPill: {
    minHeight: 36, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center',
    gap: 6, borderRadius: 18, backgroundColor: 'rgba(232,250,242,0.82)', borderWidth: 1,
    borderColor: 'rgba(86,190,146,0.30)',
  },
  streakPillText: {
    color: COLORS.green, fontSize: 10, lineHeight: 14, fontWeight: '900',
  },
  progressTrack: {
    height: 9, marginTop: 12, overflow: 'hidden', borderRadius: 99,
    backgroundColor: 'rgba(103,146,181,0.14)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
  },
  progressFill: { height: '100%', borderRadius: 99 },
  progressLabels: { marginTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: {
    color: COLORS.subtle, fontSize: 8, lineHeight: 11, fontWeight: '800',
  },
  metricStrip: {
    marginTop: 18, paddingVertical: 2, flexDirection: 'row', borderTopWidth: 1,
    borderBottomWidth: 1, borderColor: 'rgba(133,177,209,0.24)',
  },
  metricItem: { flex: 1, minWidth: 0, paddingVertical: 12, paddingHorizontal: 8 },
  metricItemBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(133,177,209,0.24)' },
  metricValue: {
    marginTop: 7, color: COLORS.text, fontSize: 18, lineHeight: 21, fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  metricUnit: { color: COLORS.muted, fontSize: 9, fontWeight: '700' },
  metricLabel: {
    marginTop: 2, color: COLORS.muted, fontSize: 8, lineHeight: 11, fontWeight: '700',
  },
  primaryAction: {
    minHeight: 64, marginTop: 18, paddingHorizontal: 11, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 21, borderWidth: 1,
    borderColor: 'rgba(166,225,255,0.62)', shadowColor: '#0875F7',
    shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.28, shadowRadius: 18,
    elevation: 4,
  },
  primaryActionIcon: {
    width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
  },
  primaryActionCopy: { flex: 1, minWidth: 0 },
  primaryActionTitle: {
    color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '900',
  },
  primaryActionMeta: {
    marginTop: 2, color: 'rgba(226,240,255,0.76)', fontSize: 8, lineHeight: 11,
    fontWeight: '700',
  },
  loadingState: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  loadingText: { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  errorCard: {
    minHeight: 50, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center',
    gap: 10, borderRadius: 17, backgroundColor: '#FFF2F1', borderWidth: 1,
    borderColor: '#F2B8B3',
  },
  errorText: {
    flex: 1, color: '#9F2D28', fontSize: 10, lineHeight: 14, fontWeight: '700',
  },
  retryButton: {
    paddingHorizontal: 9, paddingVertical: 7, flexDirection: 'row', alignItems: 'center',
    gap: 4, borderRadius: 12, backgroundColor: '#FFFFFF',
  },
  retryText: { color: '#A23832', fontSize: 9, fontWeight: '900' },
  contentSection: { gap: 14 },
  sectionHeader: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 12,
  },
  sectionEyebrow: {
    color: COLORS.blue, fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 1.2,
  },
  sectionTitle: {
    marginTop: 2, color: COLORS.text, fontSize: 21, lineHeight: 25, fontWeight: '900',
  },
  sectionAction: {
    minHeight: 34, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.64)', borderWidth: 1,
    borderColor: 'rgba(172,207,234,0.48)',
  },
  sectionActionText: { color: COLORS.muted, fontSize: 9, fontWeight: '800' },
  achievementFeature: {
    minHeight: 128, overflow: 'hidden', padding: 15, flexDirection: 'row',
    alignItems: 'center', gap: 14, borderRadius: 24, borderWidth: 1,
    borderColor: 'rgba(221,169,38,0.56)', shadowColor: '#9A710D',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.17, shadowRadius: 20,
    elevation: 4,
  },
  achievementSheen: {
    position: 'absolute', width: 76, height: 280, top: -70, left: '54%',
    transform: [{ rotate: '18deg' }],
  },
  medalStage: {
    width: 86, height: 86, borderRadius: 29, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.52)', borderWidth: 1,
    borderColor: 'rgba(255,250,218,0.9)', shadowColor: '#8F5A00',
    shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.18, shadowRadius: 14,
  },
  medalRing: {
    position: 'absolute', width: 67, height: 67, borderRadius: 34, borderWidth: 1,
    borderColor: 'rgba(183,117,0,0.25)',
  },
  achievementCopy: { flex: 1, minWidth: 0 },
  featuredBadge: {
    alignSelf: 'flex-start', minHeight: 24, paddingHorizontal: 8, flexDirection: 'row',
    alignItems: 'center', gap: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: 1, borderColor: 'rgba(223,177,57,0.34)',
  },
  featuredBadgeText: {
    color: '#8E680E', fontSize: 8, lineHeight: 11, fontWeight: '900',
  },
  achievementTitle: {
    marginTop: 8, color: COLORS.text, fontSize: 17, lineHeight: 21, fontWeight: '900',
  },
  achievementMeta: {
    marginTop: 3, color: '#76643C', fontSize: 9, lineHeight: 13, fontWeight: '700',
  },
  achievementArrow: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.74)',
  },
  collectionHeader: {
    marginTop: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  collectionTitle: { color: COLORS.text, fontSize: 12, lineHeight: 16, fontWeight: '900' },
  collectionCount: {
    color: COLORS.blue, fontSize: 9, lineHeight: 12, fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  titleCollection: { gap: 8, paddingBottom: 4, paddingRight: 4 },
  titleChip: {
    minWidth: 156, minHeight: 60, paddingHorizontal: 9, flexDirection: 'row',
    alignItems: 'center', gap: 9, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.58)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.84)', shadowColor: '#477294',
    shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 11,
    ...GLASS_WEB,
  },
  titleChipActive: {
    backgroundColor: 'rgba(231,246,255,0.92)', borderColor: 'rgba(64,146,238,0.52)',
    shadowColor: COLORS.blue, shadowOpacity: 0.16,
  },
  titleChipIcon: {
    width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(236,242,248,0.74)', borderWidth: 1,
    borderColor: 'rgba(180,201,220,0.48)',
  },
  titleChipCopy: { flex: 1, minWidth: 0 },
  titleChipName: {
    color: COLORS.text, fontSize: 9, lineHeight: 12, fontWeight: '900',
  },
  titleChipStatus: {
    marginTop: 2, color: COLORS.muted, fontSize: 7.5, lineHeight: 10, fontWeight: '700',
  },
  diaryFeature: {
    minHeight: 112, overflow: 'hidden', padding: 15, flexDirection: 'row',
    alignItems: 'center', gap: 13, borderRadius: 24, borderWidth: 1,
    borderColor: 'rgba(153,128,232,0.28)', shadowColor: '#6D50DE',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 20,
    elevation: 3,
  },
  diaryPattern: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90, right: -75, top: -83,
    borderWidth: 22, borderColor: 'rgba(106,81,222,0.06)',
  },
  diaryIcon: {
    width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)', shadowColor: '#6D50DE',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.13, shadowRadius: 12,
  },
  diaryCopy: { flex: 1, minWidth: 0 },
  diaryEyebrow: {
    color: '#6D50DE', fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 1.05,
  },
  diaryTitle: {
    marginTop: 2, color: COLORS.text, fontSize: 17, lineHeight: 21, fontWeight: '900',
  },
  diaryMeta: {
    marginTop: 4, color: COLORS.muted, fontSize: 9, lineHeight: 13, fontWeight: '700',
  },
  diaryAction: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.88)',
  },
  toolSheet: {
    overflow: 'hidden', borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.88)', shadowColor: '#315E80',
    shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.11, shadowRadius: 23,
    elevation: 3, ...GLASS_WEB,
  },
  toolRow: {
    minHeight: 76, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  toolRowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(148,181,207,0.22)' },
  toolIcon: {
    width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
  },
  toolCopy: { flex: 1, minWidth: 0 },
  toolTitle: { color: COLORS.text, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  toolMeta: {
    marginTop: 3, color: COLORS.muted, fontSize: 9, lineHeight: 12, fontWeight: '700',
  },
  logoutButton: {
    height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.42)', borderWidth: 1,
    borderColor: 'rgba(226,176,176,0.34)',
  },
  logoutText: { color: COLORS.coral, fontSize: 11, fontWeight: '800' },
});

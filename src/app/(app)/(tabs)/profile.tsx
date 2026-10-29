import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Bookmark,
  BookOpen,
  ChevronRight,
  Compass,
  Crown,
  Flame,
  LogOut,
  Map,
  MessageCircle,
  Mic2,
  PenLine,
  RefreshCw,
  Settings,
  Sparkles,
  Star,
  Target,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotionPressable } from '@/components/motion-pressable';
import { useSession } from '@/ctx';
import { fetchLearningRecords, fetchUserStats, fetchXpData } from '@/lib/api';

const COLORS = {
  background: '#F5F8FC',
  text: '#0A1728',
  muted: '#62738A',
  subtle: '#92A1B4',
  blue: '#167CF3',
  blueDark: '#075BCB',
  purple: '#7658E8',
  green: '#14A873',
  orange: '#F28B35',
  coral: '#EE625E',
};

const GLASS_WEB =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(24px) saturate(1.45)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.45)',
        isolation: 'isolate',
      } as any)
    : null;

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

const BADGES = [
  {
    level: 2,
    name: '初次开口',
    english: 'English Rookie',
    description: '从第一次真实表达开始，让英语进入日常生活。',
    color: '#2386F4',
    colors: ['#A8E0FF', '#307FF1', '#7658E8'] as const,
    tint: ['rgba(218,241,255,0.92)', 'rgba(244,240,255,0.84)'] as const,
    icon: Sparkles,
  },
  {
    level: 4,
    name: '场景表达家',
    english: 'Scene Talker',
    description: '能够在真实生活场景中完成清晰、自然的基础对话。',
    color: '#EF754C',
    colors: ['#FFD07C', '#F27854', '#E95580'] as const,
    tint: ['rgba(255,235,213,0.94)', 'rgba(255,239,245,0.84)'] as const,
    icon: MessageCircle,
  },
  {
    level: 7,
    name: '流利节奏',
    english: 'Fluent Speaker',
    description: '形成稳定的开口习惯，让语音、语调和节奏自然衔接。',
    color: '#12A985',
    colors: ['#8FE8CD', '#17B08E', '#2589E7'] as const,
    tint: ['rgba(218,251,239,0.94)', 'rgba(226,242,255,0.86)'] as const,
    icon: Mic2,
  },
  {
    level: 9,
    name: '语言探索者',
    english: 'Language Pro',
    description: '跨越更多真实场景，建立属于自己的表达地图。',
    color: '#7053DD',
    colors: ['#CBB7FF', '#7658E8', '#377DE9'] as const,
    tint: ['rgba(238,231,255,0.95)', 'rgba(230,241,255,0.86)'] as const,
    icon: Compass,
  },
  {
    level: 10,
    name: '英语领航者',
    english: 'English Master',
    description: '完成全部成长阶段，拥有持续表达和主动探索的能力。',
    color: '#C88B11',
    colors: ['#FFE79D', '#E9AD2F', '#EC704E'] as const,
    tint: ['rgba(255,246,207,0.95)', 'rgba(255,231,218,0.86)'] as const,
    icon: Crown,
  },
];

function calcLevel(totalXp: number) {
  for (let index = LEVELS.length - 1; index >= 0; index -= 1) {
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
  const [recordCount, setRecordCount] = useState(0);
  const [selectedBadgeIndex, setSelectedBadgeIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadProfile = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setLoadError('');
    try {
      const [userStats, xp, learningRecords] = await Promise.all([
        fetchUserStats(),
        fetchXpData(),
        fetchLearningRecords(),
      ]);
      setStats(userStats);
      setXpData(xp);
      setRecordCount(learningRecords.length);
    } catch {
      setLoadError('成长资料暂时没有同步成功，请稍后重试。');
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
  const unlockedBadges = BADGES.filter((badge) => curLevel.level >= badge.level);
  const activeBadge = [...unlockedBadges].reverse()[0];
  const selectedBadge = BADGES[selectedBadgeIndex];
  const selectedUnlocked = curLevel.level >= selectedBadge.level;
  const selectedRequiredXp = LEVELS.find((level) => level.level === selectedBadge.level)?.minXp ?? 0;
  const selectedProgress = Math.min(totalXp / Math.max(selectedRequiredXp, 1), 1);

  const growthSignals = useMemo(
    () => [
      {
        icon: Target,
        value: recordCount,
        unit: '条',
        label: '真实场景',
        color: COLORS.blue,
        route: '/(app)/(tabs)/learning' as any,
      },
      {
        icon: BookOpen,
        value: totalWords,
        unit: '词',
        label: '表达积累',
        color: COLORS.purple,
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
    ],
    [recordCount, streak, totalWords],
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor={COLORS.background} />
      <LinearGradient
        pointerEvents="none"
        colors={['#FBFDFF', '#EEF6FC', '#F8F5FF', '#F3FAF7']}
        locations={[0, 0.38, 0.72, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={styles.backgroundGrid}>
        {Array.from({ length: 9 }).map((_, index) => (
          <View key={index} style={[styles.backgroundLine, { top: index * 92 }]} />
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
              <Text style={styles.headerEyebrow}>MY GROWTH SPACE</Text>
              <Text style={styles.pageTitle}>我的成长空间</Text>
              <Text style={styles.pageSubtitle}>看见每一次开口，如何变成你的能力</Text>
            </View>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="打开设置"
              onPress={() => router.push('/(app)/settings' as any)}
              pressedScale={0.9}
              hoverLift={3}
              style={styles.headerButton}
            >
              <Settings size={20} color={COLORS.text} />
            </MotionPressable>
          </View>

          <Animated.View
            entering={FadeInDown.springify().damping(18).stiffness(175)}
            style={styles.identityPanel}
          >
            <LinearGradient
              colors={['#DDF1FF', '#ECE8FF', '#FFF1E6', '#E4F8EF']}
              locations={[0, 0.38, 0.72, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View pointerEvents="none" style={styles.identityFineLineOne} />
            <View pointerEvents="none" style={styles.identityFineLineTwo} />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.82)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.identitySheen}
            />

            <View style={styles.identityTop}>
              <View style={styles.avatarShell}>
                <LinearGradient
                  colors={['#48D8FF', '#287FF4', '#7B58E7']}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.avatarInner}>
                  <Text style={styles.avatarInitial}>{displayInitial}</Text>
                </View>
                <View style={styles.avatarStatus} />
              </View>
              <View style={styles.identityCopy}>
                <Text numberOfLines={1} style={styles.displayName}>{displayName}</Text>
                <Text style={styles.levelName}>{curLevel.name} · LV.{curLevel.level}</Text>
                <View style={styles.activeTitleRow}>
                  <Star size={12} color={activeBadge?.color ?? COLORS.purple} fill={activeBadge?.color ?? COLORS.purple} />
                  <Text style={[styles.activeTitleText, { color: activeBadge?.color ?? COLORS.purple }]}>
                    {activeBadge?.name ?? '继续学习解锁成长称号'}
                  </Text>
                </View>
              </View>
              <View style={styles.levelMonogram}>
                <Text style={styles.levelMonogramLabel}>LEVEL</Text>
                <Text style={styles.levelMonogramValue}>{curLevel.level}</Text>
                <Text style={styles.levelMonogramMax}>/ 10</Text>
              </View>
            </View>

            <View style={styles.progressBlock}>
              <View style={styles.progressCopyRow}>
                <View style={styles.progressCopy}>
                  <Text style={styles.progressEyebrow}>NEXT MILESTONE</Text>
                  <Text style={styles.progressTitle}>
                    {nextLevel ? `还差 ${xpToNext} XP 到达「${nextLevel.name}」` : '已完成全部成长阶段'}
                  </Text>
                </View>
                <Text style={styles.totalXp}>{totalXp} XP</Text>
              </View>
              <View style={styles.progressTrack}>
                <LinearGradient
                  colors={['#27C8FF', '#147CF5', '#7658E8', '#EF7B63']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.progressFill, { width: `${progressPercent}%` }]}
                />
              </View>
              <View style={styles.progressTicks}>
                {Array.from({ length: 8 }).map((_, index) => (
                  <View key={index} style={styles.progressTick} />
                ))}
              </View>
            </View>

            <View style={styles.identityActions}>
              <MotionPressable
                onPress={() => router.push('/(app)/(tabs)/learning' as any)}
                accessibilityRole="button"
                accessibilityLabel="继续今天的学习"
                pressedScale={0.96}
                hoverLift={3}
                hoverTilt={1}
                style={styles.continueButton}
              >
                <LinearGradient
                  colors={['#168CF7', '#6358E8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <Target size={18} color="#FFFFFF" />
                <View style={styles.continueButtonCopy}>
                  <Text style={styles.continueButtonTitle}>继续今天的学习</Text>
                  <Text numberOfLines={1} style={styles.continueButtonMeta}>
                    {nextLevel?.reward ?? '回顾已经掌握的内容'}
                  </Text>
                </View>
                <ChevronRight size={18} color="#FFFFFF" />
              </MotionPressable>
              <MotionPressable
                onPress={() => router.push('/(app)/(tabs)/growth' as any)}
                accessibilityRole="button"
                accessibilityLabel={`查看连续学习 ${streak} 天`}
                pressedScale={0.92}
                hoverLift={3}
                style={styles.streakButton}
              >
                <Flame size={17} color={COLORS.green} fill={COLORS.green} />
                <Text style={styles.streakValue}>{streak}</Text>
                <Text style={styles.streakLabel}>天</Text>
              </MotionPressable>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(60).springify().damping(18).stiffness(175)}
            style={styles.signalSection}
          >
            <View style={styles.signalHeadingRow}>
              <View>
                <Text style={styles.sectionEyebrow}>GROWTH SIGNAL</Text>
                <Text style={styles.signalTitle}>成长信号</Text>
              </View>
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>实时同步</Text>
              </View>
            </View>
            <View style={styles.signalRail}>
              {growthSignals.map((item, index) => {
                const SignalIcon = item.icon;
                return (
                  <MotionPressable
                    key={item.label}
                    onPress={() => router.push(item.route)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.label} ${item.value} ${item.unit}`}
                    pressedScale={0.95}
                    hoverLift={4}
                    style={[styles.signalItem, index < growthSignals.length - 1 && styles.signalItemDivider]}
                  >
                    <View style={styles.signalIconRow}>
                      <SignalIcon size={17} color={item.color} strokeWidth={2.4} />
                      <View style={[styles.signalPulse, { backgroundColor: item.color }]} />
                    </View>
                    <Text style={styles.signalValue}>
                      {item.value}<Text style={styles.signalUnit}> {item.unit}</Text>
                    </Text>
                    <Text style={styles.signalLabel}>{item.label}</Text>
                    <View style={styles.signalMiniBars}>
                      {[0.42, 0.75, 0.54, 1, 0.7].map((height, barIndex) => (
                        <View
                          key={barIndex}
                          style={[styles.signalMiniBar, { height: 3 + height * 8, backgroundColor: item.color, opacity: 0.24 + barIndex * 0.12 }]}
                        />
                      ))}
                    </View>
                  </MotionPressable>
                );
              })}
            </View>
          </Animated.View>

          {loading && !stats && !xpData.stats ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={COLORS.blue} />
              <Text style={styles.loadingText}>正在同步成长空间</Text>
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
            entering={FadeInDown.delay(120).springify().damping(18).stiffness(175)}
            style={styles.section}
          >
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderCopy}>
                <Text style={styles.sectionEyebrow}>MILESTONE ARCHIVE</Text>
                <Text style={styles.sectionTitle}>成长勋章馆</Text>
                <Text style={styles.sectionSubtitle}>每一次开口，都留下一个成长印记</Text>
              </View>
              <MotionPressable
                onPress={() => router.push('/(app)/achievements?tab=titles' as any)}
                pressedScale={0.92}
                style={styles.sectionAction}
              >
                <Text style={styles.sectionActionText}>{unlockedBadges.length}/{BADGES.length}</Text>
                <ChevronRight size={15} color={COLORS.muted} />
              </MotionPressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              contentContainerStyle={styles.badgeRail}
            >
              {BADGES.map((badge, index) => {
                const unlocked = curLevel.level >= badge.level;
                const selected = selectedBadgeIndex === index;
                const BadgeIcon = badge.icon;
                return (
                  <MotionPressable
                    key={badge.english}
                    onPress={() => setSelectedBadgeIndex(index)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${badge.name}，${unlocked ? '已获得' : `等级 ${badge.level} 解锁`}`}
                    pressedScale={0.94}
                    hoverLift={selected ? 8 : 5}
                    hoverTilt={3}
                    style={[styles.badgeShelfItem, selected && styles.badgeShelfItemSelected]}
                  >
                    <View style={[styles.badgeHalo, selected && { shadowColor: badge.color, shadowOpacity: 0.34 }]}>
                      <LinearGradient
                        colors={unlocked ? badge.colors : ['#DDE4EA', '#AAB6C2', '#EEF2F5']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.badgeOuter}
                      >
                        <View style={styles.badgeRim}>
                          <LinearGradient
                            colors={unlocked ? ['rgba(255,255,255,0.92)', `${badge.color}68`, 'rgba(255,255,255,0.46)'] : ['#F7F9FA', '#CBD3DB', '#EEF1F4']}
                            style={styles.badgeInner}
                          >
                            <BadgeIcon
                              size={27}
                              color={unlocked ? badge.color : '#8795A4'}
                              strokeWidth={2.1}
                            />
                            <View style={styles.badgeGlint} />
                          </LinearGradient>
                        </View>
                      </LinearGradient>
                    </View>
                    <Text numberOfLines={1} style={[styles.badgeName, selected && { color: badge.color }]}>
                      {badge.name}
                    </Text>
                    <Text style={styles.badgeState}>
                      {activeBadge?.english === badge.english ? '当前称号' : unlocked ? '已获得' : `LV.${badge.level}`}
                    </Text>
                    <View style={[styles.badgeSelectionLine, selected && { backgroundColor: badge.color, opacity: 1 }]} />
                  </MotionPressable>
                );
              })}
            </ScrollView>

            <Animated.View key={selectedBadge.english} entering={FadeIn.duration(220)} style={styles.badgeDetail}>
              <LinearGradient
                colors={selectedBadge.tint}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View pointerEvents="none" style={[styles.badgeDetailLine, { borderColor: `${selectedBadge.color}22` }]} />
              <View style={styles.badgeDetailTop}>
                <View style={[styles.badgeDetailIcon, { borderColor: `${selectedBadge.color}45` }]}>
                  <selectedBadge.icon size={24} color={selectedBadge.color} />
                </View>
                <View style={styles.badgeDetailCopy}>
                  <Text style={[styles.badgeDetailEyebrow, { color: selectedBadge.color }]}>
                    {selectedBadge.english.toUpperCase()}
                  </Text>
                  <Text style={styles.badgeDetailTitle}>{selectedBadge.name}</Text>
                </View>
                <View style={[styles.badgeStatusPill, { backgroundColor: `${selectedBadge.color}12` }]}>
                  <Text style={[styles.badgeStatusText, { color: selectedBadge.color }]}>
                    {selectedUnlocked ? '已获得' : `LV.${selectedBadge.level} 解锁`}
                  </Text>
                </View>
              </View>
              <Text style={styles.badgeDescription}>{selectedBadge.description}</Text>
              <View style={styles.badgeProgressRow}>
                <View style={styles.badgeProgressTrack}>
                  <View
                    style={[
                      styles.badgeProgressFill,
                      { width: `${selectedProgress * 100}%`, backgroundColor: selectedBadge.color },
                    ]}
                  />
                </View>
                <Text style={styles.badgeProgressText}>
                  {selectedUnlocked ? '完成' : `${totalXp}/${selectedRequiredXp} XP`}
                </Text>
              </View>
              <MotionPressable
                onPress={() => router.push('/(app)/achievements?tab=titles' as any)}
                pressedScale={0.96}
                hoverLift={2}
                style={styles.badgeDetailAction}
              >
                <Text style={[styles.badgeDetailActionText, { color: selectedBadge.color }]}>查看成长档案</Text>
                <ChevronRight size={15} color={selectedBadge.color} />
              </MotionPressable>
            </Animated.View>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(190).springify().damping(18).stiffness(175)}
            style={styles.section}
          >
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderCopy}>
                <Text style={styles.sectionEyebrow}>PERSONAL TOOLKIT</Text>
                <Text style={styles.sectionTitle}>我的学习工具</Text>
                <Text style={styles.sectionSubtitle}>记录、整理、探索，建立自己的表达系统</Text>
              </View>
            </View>

            <MotionPressable
              onPress={() => router.push('/(app)/diary' as any)}
              accessibilityRole="button"
              accessibilityLabel="打开英语日记"
              pressedScale={0.975}
              hoverLift={6}
              hoverTilt={1.6}
              style={styles.diaryCard}
            >
              <LinearGradient
                colors={['#8265ED', '#5F67DD', '#3F82E4']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View pointerEvents="none" style={styles.diaryNotebook}>
                {Array.from({ length: 5 }).map((_, index) => (
                  <View key={index} style={[styles.diaryRule, { top: 18 + index * 14 }]} />
                ))}
              </View>
              <View style={styles.diaryIcon}>
                <PenLine size={25} color="#FFFFFF" />
              </View>
              <View style={styles.diaryCopy}>
                <Text style={styles.diaryEyebrow}>DAILY STORY</Text>
                <Text style={styles.diaryTitle}>英语日记</Text>
                <Text style={styles.diarySubtitle}>把今天写成一段可以开口讲的英语故事</Text>
              </View>
              <View style={styles.diaryAction}>
                <Text style={styles.diaryActionText}>开始记录</Text>
                <ChevronRight size={17} color="#FFFFFF" />
              </View>
            </MotionPressable>

            <View style={styles.toolPair}>
              <MotionPressable
                onPress={() => router.push('/(app)/(tabs)/learning' as any)}
                accessibilityRole="button"
                accessibilityLabel="打开表达本"
                pressedScale={0.96}
                hoverLift={6}
                hoverTilt={2.2}
                style={styles.expressionCard}
              >
                <LinearGradient
                  colors={['#FFF0E2', '#FFE1D8', '#FFF8F2']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.expressionTop}>
                  <View style={styles.expressionIcon}>
                    <Bookmark size={20} color={COLORS.coral} fill={`${COLORS.coral}24`} />
                  </View>
                  <ChevronRight size={17} color={COLORS.coral} />
                </View>
                <Text style={styles.toolEyebrowOrange}>PHRASE BOOK</Text>
                <Text style={styles.toolTitle}>表达本</Text>
                <Text style={styles.toolDescription}>{recordCount} 条真实场景表达持续沉淀</Text>
                <View style={styles.phrasePreview}>
                  <Text numberOfLines={1} style={styles.phrasePreviewText}>Could I have…</Text>
                  <View style={styles.phraseDot} />
                </View>
              </MotionPressable>

              <MotionPressable
                onPress={() => router.push('/(app)/map' as any)}
                accessibilityRole="button"
                accessibilityLabel="打开场景地图"
                pressedScale={0.96}
                hoverLift={6}
                hoverTilt={2.2}
                style={styles.mapCard}
              >
                <LinearGradient
                  colors={['#DDF9EC', '#DDF2F7', '#F7FFFB']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <View pointerEvents="none" style={styles.mapPathOne} />
                <View pointerEvents="none" style={styles.mapPathTwo} />
                <View style={styles.mapTop}>
                  <View style={styles.mapIcon}>
                    <Map size={20} color={COLORS.green} />
                  </View>
                  <ChevronRight size={17} color={COLORS.green} />
                </View>
                <Text style={styles.toolEyebrowGreen}>SCENE WORLD</Text>
                <Text style={styles.toolTitle}>场景地图</Text>
                <Text style={styles.toolDescription}>全部开放，随时进入生活场景练习</Text>
                <View style={styles.mapNodes}>
                  {[0, 1, 2].map((node) => (
                    <View key={node} style={[styles.mapNode, node === 1 && styles.mapNodeActive]} />
                  ))}
                </View>
              </MotionPressable>
            </View>

            <MotionPressable
              onPress={() => router.push('/(app)/settings' as any)}
              accessibilityRole="button"
              accessibilityLabel="打开设置"
              pressedScale={0.975}
              hoverLift={3}
              style={styles.settingsStrip}
            >
              <View style={styles.settingsIcon}>
                <Settings size={19} color="#536A82" />
              </View>
              <View style={styles.settingsCopy}>
                <Text style={styles.settingsTitle}>学习设置</Text>
                <Text style={styles.settingsSubtitle}>语音、通知与个人偏好</Text>
              </View>
              <ChevronRight size={18} color={COLORS.muted} />
            </MotionPressable>
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
  backgroundGrid: {
    position: 'absolute', left: -72, right: -72, top: 218, height: 840,
    opacity: 0.6, transform: [{ rotate: '-6deg' }],
  },
  backgroundLine: {
    position: 'absolute', left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(80,125,165,0.075)',
  },
  scrollContent: { paddingBottom: 132 },
  pageContent: {
    width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 17, gap: 24,
  },
  header: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: {
    color: COLORS.purple, fontSize: 9, lineHeight: 13, fontWeight: '900', letterSpacing: 1.35,
  },
  pageTitle: { marginTop: 2, color: COLORS.text, fontSize: 30, lineHeight: 35, fontWeight: '900' },
  pageSubtitle: { marginTop: 2, color: COLORS.muted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  headerButton: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.94)', shadowColor: '#594BAE',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.13, shadowRadius: 17,
    elevation: 3, ...GLASS_WEB,
  },
  identityPanel: {
    minHeight: 280, overflow: 'hidden', borderRadius: 30, borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.92)', padding: 18, shadowColor: '#426E98',
    shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.18, shadowRadius: 36,
    elevation: 8, ...GLASS_WEB,
  },
  identityFineLineOne: {
    position: 'absolute', width: 310, height: 118, right: -118, top: 12,
    borderWidth: 1, borderColor: 'rgba(82,104,219,0.14)', borderRadius: 18,
    transform: [{ rotate: '-14deg' }],
  },
  identityFineLineTwo: {
    position: 'absolute', width: 290, height: 96, right: -90, top: 38,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.82)', borderRadius: 18,
    transform: [{ rotate: '-14deg' }],
  },
  identitySheen: {
    position: 'absolute', width: 92, height: 430, top: -130, left: '54%',
    transform: [{ rotate: '18deg' }],
  },
  identityTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  avatarShell: {
    width: 70, height: 70, padding: 3, borderRadius: 24, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)', shadowColor: '#4876DD',
    shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.3, shadowRadius: 18,
    elevation: 5,
  },
  avatarInner: {
    width: '100%', height: '100%', borderRadius: 21, alignItems: 'center',
    justifyContent: 'center', backgroundColor: 'rgba(250,253,255,0.9)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  avatarInitial: { color: COLORS.blueDark, fontSize: 28, lineHeight: 32, fontWeight: '900' },
  avatarStatus: {
    position: 'absolute', right: 4, bottom: 4, width: 14, height: 14, borderRadius: 7,
    backgroundColor: COLORS.green, borderWidth: 2, borderColor: '#FFFFFF',
  },
  identityCopy: { flex: 1, minWidth: 0 },
  displayName: { color: COLORS.text, fontSize: 22, lineHeight: 26, fontWeight: '900' },
  levelName: { marginTop: 2, color: COLORS.muted, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  activeTitleRow: { marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  activeTitleText: { fontSize: 9, lineHeight: 12, fontWeight: '900' },
  levelMonogram: {
    width: 66, minHeight: 74, paddingVertical: 8, borderLeftWidth: 1,
    borderLeftColor: 'rgba(93,105,184,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  levelMonogramLabel: { color: COLORS.muted, fontSize: 6.5, lineHeight: 8, fontWeight: '900', letterSpacing: 1 },
  levelMonogramValue: { color: COLORS.text, fontSize: 28, lineHeight: 31, fontWeight: '900' },
  levelMonogramMax: { color: COLORS.subtle, fontSize: 8, lineHeight: 10, fontWeight: '800' },
  progressBlock: { marginTop: 22 },
  progressCopyRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  progressCopy: { flex: 1, minWidth: 0 },
  progressEyebrow: { color: COLORS.blue, fontSize: 7, lineHeight: 10, fontWeight: '900', letterSpacing: 1.1 },
  progressTitle: { marginTop: 3, color: COLORS.text, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  totalXp: { color: COLORS.purple, fontSize: 15, lineHeight: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  progressTrack: {
    height: 10, marginTop: 12, overflow: 'hidden', borderRadius: 99,
    backgroundColor: 'rgba(92,110,148,0.14)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
  },
  progressFill: { height: '100%', borderRadius: 99 },
  progressTicks: { marginTop: 5, flexDirection: 'row', justifyContent: 'space-between' },
  progressTick: { width: 1, height: 3, backgroundColor: 'rgba(80,103,137,0.22)' },
  identityActions: { marginTop: 16, flexDirection: 'row', gap: 9 },
  continueButton: {
    flex: 1, minHeight: 60, overflow: 'hidden', paddingHorizontal: 11,
    flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 21,
    borderWidth: 1, borderColor: 'rgba(168,223,255,0.65)', shadowColor: '#0875F7',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 18,
    elevation: 4,
  },
  continueButtonCopy: { flex: 1, minWidth: 0 },
  continueButtonTitle: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '900' },
  continueButtonMeta: { marginTop: 2, color: 'rgba(230,242,255,0.76)', fontSize: 7.5, lineHeight: 10, fontWeight: '700' },
  streakButton: {
    width: 70, minHeight: 60, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 3, borderRadius: 21, backgroundColor: 'rgba(242,255,249,0.72)',
    borderWidth: 1, borderColor: 'rgba(70,183,132,0.26)',
  },
  streakValue: { color: COLORS.green, fontSize: 17, lineHeight: 20, fontWeight: '900' },
  streakLabel: { color: COLORS.green, fontSize: 8, lineHeight: 11, fontWeight: '800' },
  signalSection: { gap: 10 },
  signalHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  signalTitle: { marginTop: 1, color: COLORS.text, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.green },
  liveText: { color: COLORS.muted, fontSize: 8, lineHeight: 11, fontWeight: '800' },
  signalRail: {
    minHeight: 132, flexDirection: 'row', overflow: 'hidden', borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.64)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)', shadowColor: '#3D698E',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 22,
    elevation: 3, ...GLASS_WEB,
  },
  signalItem: { flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 15 },
  signalItemDivider: { borderRightWidth: 1, borderRightColor: 'rgba(100,130,156,0.13)' },
  signalIconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  signalPulse: { width: 4, height: 4, borderRadius: 2, opacity: 0.75 },
  signalValue: { marginTop: 12, color: COLORS.text, fontSize: 21, lineHeight: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  signalUnit: { color: COLORS.muted, fontSize: 8, fontWeight: '700' },
  signalLabel: { marginTop: 2, color: COLORS.muted, fontSize: 8, lineHeight: 11, fontWeight: '800' },
  signalMiniBars: { height: 14, marginTop: 9, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  signalMiniBar: { width: 3, borderRadius: 2 },
  loadingState: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  errorCard: {
    minHeight: 50, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center',
    gap: 10, borderRadius: 17, backgroundColor: '#FFF2F1', borderWidth: 1,
    borderColor: '#F2B8B3',
  },
  errorText: { flex: 1, color: '#9F2D28', fontSize: 10, lineHeight: 14, fontWeight: '700' },
  retryButton: { paddingHorizontal: 9, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, backgroundColor: '#FFFFFF' },
  retryText: { color: '#A23832', fontSize: 9, fontWeight: '900' },
  section: { gap: 14 },
  sectionHeader: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionHeaderCopy: { flex: 1, minWidth: 0 },
  sectionEyebrow: { color: COLORS.blue, fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 1.2 },
  sectionTitle: { marginTop: 1, color: COLORS.text, fontSize: 22, lineHeight: 26, fontWeight: '900' },
  sectionSubtitle: { marginTop: 2, color: COLORS.muted, fontSize: 9, lineHeight: 13, fontWeight: '600' },
  sectionAction: {
    minHeight: 35, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.68)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)', shadowColor: '#42657F',
    shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 11,
  },
  sectionActionText: { color: COLORS.muted, fontSize: 9, fontWeight: '900' },
  badgeRail: { gap: 8, paddingTop: 6, paddingBottom: 8, paddingRight: 5 },
  badgeShelfItem: {
    width: 112, minHeight: 144, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 12,
    alignItems: 'center', borderRadius: 22, borderWidth: 1, borderColor: 'transparent',
  },
  badgeShelfItemSelected: {
    backgroundColor: 'rgba(255,255,255,0.62)', borderColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#446987', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12,
    shadowRadius: 18, elevation: 3, ...GLASS_WEB,
  },
  badgeHalo: {
    width: 78, height: 78, borderRadius: 39, shadowColor: '#49627C',
    shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.18, shadowRadius: 13,
    elevation: 4,
  },
  badgeOuter: { flex: 1, borderRadius: 39, padding: 5, alignItems: 'center', justifyContent: 'center' },
  badgeRim: {
    flex: 1, width: '100%', borderRadius: 34, padding: 3, backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.88)',
  },
  badgeInner: { flex: 1, borderRadius: 30, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badgeGlint: {
    position: 'absolute', width: 38, height: 8, top: 7, left: 8, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.72)', transform: [{ rotate: '-18deg' }],
  },
  badgeName: { marginTop: 11, color: COLORS.text, fontSize: 11, lineHeight: 14, fontWeight: '900' },
  badgeState: { marginTop: 3, color: COLORS.muted, fontSize: 7.5, lineHeight: 10, fontWeight: '700' },
  badgeSelectionLine: { width: 28, height: 3, marginTop: 8, borderRadius: 2, backgroundColor: COLORS.subtle, opacity: 0.2 },
  badgeDetail: {
    minHeight: 194, overflow: 'hidden', padding: 15, borderRadius: 26, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)', shadowColor: '#3E6585',
    shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.13, shadowRadius: 24,
    elevation: 4, ...GLASS_WEB,
  },
  badgeDetailLine: {
    position: 'absolute', width: 260, height: 110, right: -92, top: -34,
    borderWidth: 18, borderRadius: 28, transform: [{ rotate: '-18deg' }],
  },
  badgeDetailTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badgeDetailIcon: {
    width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.66)', borderWidth: 1,
  },
  badgeDetailCopy: { flex: 1, minWidth: 0 },
  badgeDetailEyebrow: { fontSize: 7, lineHeight: 10, fontWeight: '900', letterSpacing: 0.85 },
  badgeDetailTitle: { marginTop: 2, color: COLORS.text, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  badgeStatusPill: { minHeight: 28, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  badgeStatusText: { fontSize: 8, lineHeight: 11, fontWeight: '900' },
  badgeDescription: { marginTop: 13, color: COLORS.muted, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  badgeProgressRow: { marginTop: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  badgeProgressTrack: { flex: 1, height: 6, overflow: 'hidden', borderRadius: 3, backgroundColor: 'rgba(88,108,135,0.14)' },
  badgeProgressFill: { height: '100%', borderRadius: 3 },
  badgeProgressText: { width: 72, textAlign: 'right', color: COLORS.muted, fontSize: 8, lineHeight: 11, fontWeight: '800' },
  badgeDetailAction: { marginTop: 13, flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  badgeDetailActionText: { fontSize: 9, lineHeight: 12, fontWeight: '900' },
  diaryCard: {
    minHeight: 164, overflow: 'hidden', padding: 16, borderRadius: 27, flexDirection: 'row',
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(205,221,255,0.54)',
    shadowColor: '#4B4FB3', shadowOffset: { width: 0, height: 13 }, shadowOpacity: 0.25,
    shadowRadius: 24, elevation: 6,
  },
  diaryNotebook: {
    position: 'absolute', width: 132, height: 102, right: -10, top: 18,
    borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.21)', transform: [{ rotate: '-7deg' }],
  },
  diaryRule: { position: 'absolute', left: 15, right: 15, height: 1, backgroundColor: 'rgba(255,255,255,0.17)' },
  diaryIcon: {
    width: 56, height: 56, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.34)',
  },
  diaryCopy: { flex: 1, minWidth: 0, marginLeft: 13, paddingRight: 3 },
  diaryEyebrow: { color: 'rgba(236,242,255,0.75)', fontSize: 7, lineHeight: 10, fontWeight: '900', letterSpacing: 1 },
  diaryTitle: { marginTop: 2, color: '#FFFFFF', fontSize: 22, lineHeight: 26, fontWeight: '900' },
  diarySubtitle: { marginTop: 5, maxWidth: 210, color: 'rgba(244,247,255,0.78)', fontSize: 9, lineHeight: 13, fontWeight: '600' },
  diaryAction: {
    position: 'absolute', left: 85, bottom: 16, minHeight: 32, paddingHorizontal: 10,
    flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
  },
  diaryActionText: { color: '#FFFFFF', fontSize: 9, lineHeight: 12, fontWeight: '900' },
  toolPair: { flexDirection: 'row', gap: 10 },
  expressionCard: {
    flex: 1, minWidth: 0, minHeight: 188, overflow: 'hidden', padding: 14, borderRadius: 25,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)', shadowColor: '#A05D47',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 20,
    elevation: 3,
  },
  mapCard: {
    flex: 1, minWidth: 0, minHeight: 188, overflow: 'hidden', padding: 14, borderRadius: 25,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)', shadowColor: '#39795F',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 20,
    elevation: 3,
  },
  expressionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  expressionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.58)' },
  mapTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.58)' },
  toolEyebrowOrange: { marginTop: 15, color: COLORS.coral, fontSize: 7, lineHeight: 10, fontWeight: '900', letterSpacing: 0.9 },
  toolEyebrowGreen: { marginTop: 15, color: COLORS.green, fontSize: 7, lineHeight: 10, fontWeight: '900', letterSpacing: 0.9 },
  toolTitle: { marginTop: 2, color: COLORS.text, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  toolDescription: { marginTop: 4, color: COLORS.muted, fontSize: 8.5, lineHeight: 12, fontWeight: '600' },
  phrasePreview: {
    height: 34, marginTop: 13, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.88)',
  },
  phrasePreviewText: { flex: 1, color: '#974D3E', fontSize: 8.5, lineHeight: 11, fontWeight: '800' },
  phraseDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.coral },
  mapPathOne: {
    position: 'absolute', width: 170, height: 62, left: 16, bottom: 2, borderTopWidth: 2,
    borderTopColor: 'rgba(20,168,115,0.20)', borderRadius: 50, transform: [{ rotate: '-14deg' }],
  },
  mapPathTwo: {
    position: 'absolute', width: 130, height: 72, left: 45, bottom: -12, borderTopWidth: 1,
    borderTopColor: 'rgba(22,124,243,0.18)', borderRadius: 50, transform: [{ rotate: '11deg' }],
  },
  mapNodes: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  mapNode: { width: 9, height: 9, borderRadius: 5, backgroundColor: 'rgba(20,168,115,0.3)', borderWidth: 2, borderColor: '#FFFFFF' },
  mapNodeActive: { width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.green, shadowColor: COLORS.green, shadowOpacity: 0.35, shadowRadius: 8 },
  settingsStrip: {
    minHeight: 70, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 11,
    borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.58)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)', shadowColor: '#50667D',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 18,
    ...GLASS_WEB,
  },
  settingsIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(226,235,243,0.78)' },
  settingsCopy: { flex: 1, minWidth: 0 },
  settingsTitle: { color: COLORS.text, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  settingsSubtitle: { marginTop: 2, color: COLORS.muted, fontSize: 8.5, lineHeight: 12, fontWeight: '600' },
  logoutButton: {
    height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.42)', borderWidth: 1,
    borderColor: 'rgba(226,176,176,0.34)',
  },
  logoutText: { color: COLORS.coral, fontSize: 11, fontWeight: '800' },
});

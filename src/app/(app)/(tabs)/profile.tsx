import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Award,
  Bookmark,
  BookOpen,
  Camera,
  ChevronRight,
  Flame,
  Image as ImageIcon,
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
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotionPressable } from '@/components/motion-pressable';
import { useSession } from '@/ctx';
import { fetchLearningRecords, fetchUserStats, fetchXpData } from '@/lib/api';

declare const require: (assetPath: string) => number;

const FALLBACK_IMAGE = require('../../../../assets/home-premium/hero-photo.png');

const COLORS = {
  background: '#F5F8FC',
  text: '#0A1728',
  muted: '#62738A',
  subtle: '#91A2B7',
  blue: '#147CF5',
  blueDark: '#075DD8',
  purple: '#7658E8',
  green: '#17A86C',
  orange: '#F08B35',
  coral: '#EE625E',
};

const GLASS_WEB =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(22px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
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

const TITLES = [
  { level: 2, name: 'English Rookie', color: '#318AF5', gradient: ['#DFF1FF', '#F7FBFF'] as const },
  { level: 4, name: 'Scene Talker', color: '#F27A45', gradient: ['#FFE6D9', '#FFF9F4'] as const },
  { level: 7, name: 'Fluent Speaker', color: '#18A98A', gradient: ['#DDF9EF', '#F8FFFC'] as const },
  { level: 9, name: 'Language Pro', color: '#7658E8', gradient: ['#EAE3FF', '#FAF8FF'] as const },
  { level: 10, name: 'English Master', color: '#D49312', gradient: ['#FFF0BF', '#FFFDF3'] as const },
];

type LearningRecord = Record<string, any> & { id: string | number };

function calcLevel(totalXp: number) {
  for (let index = LEVELS.length - 1; index >= 0; index--) {
    if (totalXp >= LEVELS[index].minXp) return LEVELS[index];
  }
  return LEVELS[0];
}

function imageSource(uri?: string | null) {
  if (uri && !uri.startsWith('blob:')) return { uri };
  return FALLBACK_IMAGE;
}

function formatDate(value?: string | null) {
  if (!value) return '最近学习';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10).replace(/-/g, '.');
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useSession();
  const [stats, setStats] = useState<any>(null);
  const [xpData, setXpData] = useState<{ stats: any; logs: any[] }>({ stats: null, logs: [] });
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
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
      setRecords(learningRecords);
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

  const galleryRecords = useMemo(() => {
    const favorites = records.filter((record) => record.is_favorited);
    const favoriteIds = new Set(favorites.map((record) => String(record.id)));
    const source = [
      ...favorites,
      ...records.filter((record) => !favoriteIds.has(String(record.id))),
    ];
    const seenScenes = new Set<string>();
    const uniqueScenes = source.filter((record) => {
      const key = String(record.scene_name || record.id);
      if (seenScenes.has(key)) return false;
      seenScenes.add(key);
      return true;
    });
    const uniqueIds = new Set(uniqueScenes.map((record) => String(record.id)));
    return [
      ...uniqueScenes,
      ...source.filter((record) => !uniqueIds.has(String(record.id))),
    ].slice(0, 6);
  }, [records]);
  const safeGalleryIndex = galleryRecords.length ? galleryIndex % galleryRecords.length : 0;
  const activeRecord = galleryRecords[safeGalleryIndex];
  const sideRecords = galleryRecords
    .map((record, index) => ({ record, index }))
    .filter(({ index }) => index !== safeGalleryIndex)
    .slice(0, 2);

  const metricCards = [
    {
      icon: Camera,
      value: records.length,
      unit: '条',
      label: '场景记录',
      gradient: ['#DCEFFF', '#F5FAFF'] as const,
      accent: COLORS.blue,
      route: '/(app)/(tabs)/learning' as any,
    },
    {
      icon: BookOpen,
      value: totalWords,
      unit: '词',
      label: '词汇收藏',
      gradient: ['#ECE5FF', '#FAF8FF'] as const,
      accent: COLORS.purple,
      route: '/(app)/(tabs)/learning' as any,
    },
    {
      icon: Flame,
      value: streak,
      unit: '天',
      label: '连续学习',
      gradient: ['#DDF8EB', '#F8FFFB'] as const,
      accent: COLORS.green,
      route: '/(app)/(tabs)/growth' as any,
    },
  ];

  const toolCards = [
    {
      icon: PenLine,
      label: '英语日记',
      sub: '把今天写成英语故事',
      meta: 'DAILY STORY',
      gradient: ['#ECE5FF', '#F9F7FF'] as const,
      accent: COLORS.purple,
      route: '/(app)/diary' as any,
    },
    {
      icon: Map,
      label: '英语地图',
      sub: '探索更多生活场景',
      meta: 'SCENE MAP',
      gradient: ['#DDF8ED', '#F7FFFB'] as const,
      accent: COLORS.green,
      route: '/(app)/map' as any,
    },
    {
      icon: Bookmark,
      label: '表达本',
      sub: `${records.length} 条场景持续沉淀`,
      meta: 'COLLECTION',
      gradient: ['#FFE5D9', '#FFF8F4'] as const,
      accent: COLORS.orange,
      route: '/(app)/(tabs)/learning' as any,
    },
    {
      icon: Settings,
      label: '设置',
      sub: '服务、通知与偏好',
      meta: 'PREFERENCES',
      gradient: ['#E5EDF5', '#FAFCFE'] as const,
      accent: '#5D7188',
      route: '/(app)/settings' as any,
    },
  ];

  const openRecord = (record?: LearningRecord) => {
    if (record?.id) router.push(`/(app)/record/${record.id}` as any);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor={COLORS.background} />
      <LinearGradient
        pointerEvents="none"
        colors={['#FAFCFF', '#EEF6FC', '#F9F7FF', '#F4FBF8']}
        locations={[0, 0.38, 0.72, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(34,145,244,0.15)', 'rgba(122,88,232,0.08)', 'rgba(244,141,77,0.07)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.spectrumWash}
      />
      <View pointerEvents="none" style={styles.backgroundLines}>
        {Array.from({ length: 8 }).map((_, index) => (
          <View key={index} style={[styles.backgroundLine, { top: index * 88 }]} />
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
              <Text style={styles.headerEyebrow}>MY LEARNING STUDIO</Text>
              <Text style={styles.pageTitle}>我的空间</Text>
              <Text style={styles.pageSubtitle}>收藏场景、表达和每一次成长</Text>
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
            style={styles.passportCard}
          >
            <LinearGradient
              colors={['#DFF2FF', '#E9E4FF', '#FFF0E5', '#E3F7EF']}
              locations={[0, 0.38, 0.72, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.88)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.passportSheen}
            />
            <View pointerEvents="none" style={styles.passportArcOne} />
            <View pointerEvents="none" style={styles.passportArcTwo} />

            <View style={styles.identityRow}>
              <View style={styles.avatarShell}>
                <LinearGradient
                  colors={['#45D7FF', '#287EF4', '#8058E9']}
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
                  <Star size={12} color={COLORS.purple} fill={COLORS.purple} />
                  <Text style={styles.activeTitleText}>
                    {activeTitle?.name ?? '继续学习解锁称号'}
                  </Text>
                </View>
              </View>
              <View style={styles.levelDial}>
                <View style={styles.levelDialInner}>
                  <Text style={styles.levelDialLabel}>LEVEL</Text>
                  <Text style={styles.levelDialValue}>{curLevel.level}</Text>
                </View>
              </View>
            </View>

            <View style={styles.progressCopyRow}>
              <View>
                <Text style={styles.progressEyebrow}>NEXT CHAPTER</Text>
                <Text style={styles.progressTitle}>
                  {nextLevel ? `距离 ${nextLevel.name} 还差 ${xpToNext} XP` : '已达到最高等级'}
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

            <View style={styles.passportActions}>
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
                    {nextLevel?.reward ?? '回顾学习内容'}
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
                <Flame size={18} color={COLORS.green} fill={COLORS.green} />
                <Text style={styles.streakValue}>{streak}</Text>
                <Text style={styles.streakLabel}>天</Text>
              </MotionPressable>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(60).springify().damping(18).stiffness(175)}
            style={styles.metricRow}
          >
            {metricCards.map((item) => {
              const MetricIcon = item.icon;
              return (
                <MotionPressable
                  key={item.label}
                  onPress={() => router.push(item.route)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label} ${item.value} ${item.unit}`}
                  pressedScale={0.94}
                  hoverLift={5}
                  hoverTilt={2}
                  style={styles.metricCard}
                >
                  <LinearGradient
                    colors={item.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <View style={[styles.metricIcon, { backgroundColor: `${item.accent}14` }]}>
                    <MetricIcon size={18} color={item.accent} strokeWidth={2.5} />
                  </View>
                  <Text style={styles.metricValue}>
                    {item.value}<Text style={styles.metricUnit}> {item.unit}</Text>
                  </Text>
                  <Text style={styles.metricLabel}>{item.label}</Text>
                  <View style={[styles.metricAccent, { backgroundColor: item.accent }]} />
                </MotionPressable>
              );
            })}
          </Animated.View>

          {loading && !stats && !xpData.stats ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={COLORS.blue} />
              <Text style={styles.loadingText}>正在同步学习空间</Text>
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
            entering={FadeInDown.delay(110).springify().damping(18).stiffness(175)}
            style={styles.section}
          >
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>VISUAL MEMORIES</Text>
                <Text style={styles.sectionTitle}>学习相册</Text>
                <Text style={styles.sectionSubtitle}>把练过的真实场景，收进你的表达世界</Text>
              </View>
              <MotionPressable
                onPress={() => router.push('/(app)/(tabs)/learning' as any)}
                pressedScale={0.92}
                style={styles.sectionAction}
              >
                <Text style={styles.sectionActionText}>{records.length} 条</Text>
                <ChevronRight size={15} color={COLORS.muted} />
              </MotionPressable>
            </View>

            <View style={styles.galleryShell}>
              <MotionPressable
                onPress={() => openRecord(activeRecord)}
                disabled={!activeRecord}
                accessibilityRole="button"
                accessibilityLabel={`打开${activeRecord?.scene_name ?? '场景'}学习记录`}
                pressedScale={0.98}
                hoverLift={5}
                hoverTilt={1.8}
                style={styles.galleryMain}
              >
                <Image
                  source={imageSource(activeRecord?.scene_image)}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  transition={260}
                />
                <LinearGradient
                  colors={['rgba(6,20,38,0.02)', 'rgba(6,20,38,0.16)', 'rgba(6,18,36,0.90)']}
                  locations={[0, 0.45, 1]}
                  style={StyleSheet.absoluteFillObject}
                />
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(255,255,255,0.42)', 'rgba(255,255,255,0)']}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.85, y: 0.65 }}
                  style={styles.galleryRefraction}
                />
                <View style={styles.galleryTopRow}>
                  <View style={styles.galleryBadge}>
                    <ImageIcon size={13} color="#FFFFFF" />
                    <Text style={styles.galleryBadgeText}>SCENE MEMORY</Text>
                  </View>
                  <Text style={styles.galleryDate}>{formatDate(activeRecord?.created_at)}</Text>
                </View>
                <View style={styles.galleryMainCopy}>
                  <Text numberOfLines={1} style={styles.galleryTitle}>
                    {activeRecord?.scene_name ?? '还没有场景记录'}
                  </Text>
                  <Text numberOfLines={2} style={styles.galleryPhrase}>
                    {activeRecord?.i_say || activeRecord?.i_see || '完成一次真实场景学习后，图片会出现在这里。'}
                  </Text>
                  <View style={styles.galleryOpenRow}>
                    <Text style={styles.galleryOpenText}>打开学习记录</Text>
                    <ChevronRight size={15} color="#FFFFFF" />
                  </View>
                </View>
              </MotionPressable>

              <View style={styles.gallerySide}>
                {sideRecords.map(({ record, index }) => (
                  <MotionPressable
                    key={record.id}
                    onPress={() => setGalleryIndex(index)}
                    pressedScale={0.93}
                    hoverLift={4}
                    hoverTilt={2.2}
                    accessibilityRole="button"
                    accessibilityLabel={`切换到${record.scene_name || '场景'}图片`}
                    style={styles.galleryThumb}
                  >
                    <Image
                      source={imageSource(record.scene_image)}
                      style={StyleSheet.absoluteFillObject}
                      contentFit="cover"
                      transition={220}
                    />
                    <LinearGradient
                      colors={['rgba(5,18,34,0.02)', 'rgba(5,18,34,0.72)']}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <Text numberOfLines={2} style={styles.galleryThumbTitle}>
                      {record.scene_name || '场景记录'}
                    </Text>
                  </MotionPressable>
                ))}
                {sideRecords.length < 2 ? (
                  <MotionPressable
                    onPress={() => router.push('/(app)/(tabs)/home' as any)}
                    pressedScale={0.94}
                    style={styles.galleryAdd}
                  >
                    <Camera size={22} color={COLORS.blue} />
                    <Text style={styles.galleryAddText}>添加场景</Text>
                  </MotionPressable>
                ) : null}
              </View>
            </View>
            <View style={styles.galleryDots}>
              {galleryRecords.map((record, index) => (
                <MotionPressable
                  key={record.id}
                  onPress={() => setGalleryIndex(index)}
                  pressedScale={0.8}
                  style={[styles.galleryDot, index === safeGalleryIndex && styles.galleryDotActive]}
                ><View /></MotionPressable>
              ))}
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(170).springify().damping(18).stiffness(175)}
            style={styles.section}
          >
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>ACHIEVEMENT CABINET</Text>
                <Text style={styles.sectionTitle}>成就陈列</Text>
                <Text style={styles.sectionSubtitle}>每个称号，都记录一段真实进步</Text>
              </View>
              <MotionPressable
                onPress={() => router.push('/(app)/achievements?tab=achievements' as any)}
                pressedScale={0.92}
                style={styles.sectionAction}
              >
                <Text style={styles.sectionActionText}>{unlockedTitles.length}/{TITLES.length}</Text>
                <ChevronRight size={15} color={COLORS.muted} />
              </MotionPressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.achievementRail}
            >
              {TITLES.map((title) => {
                const unlocked = curLevel.level >= title.level;
                const active = activeTitle?.name === title.name;
                return (
                  <MotionPressable
                    key={title.name}
                    onPress={() => router.push('/(app)/achievements?tab=titles' as any)}
                    accessibilityRole="button"
                    accessibilityLabel={`${title.name}，${active ? '当前佩戴' : unlocked ? '已收藏' : `LV.${title.level} 解锁`}`}
                    pressedScale={0.95}
                    hoverLift={5}
                    hoverTilt={2.4}
                    style={[styles.achievementCard, active && styles.achievementCardActive]}
                  >
                    <LinearGradient
                      colors={unlocked ? title.gradient : ['#EDF1F5', '#FAFCFE']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <View style={[styles.achievementIcon, { backgroundColor: unlocked ? `${title.color}17` : '#E7ECF1' }]}>
                      {unlocked ? (
                        <Medal size={25} color={title.color} />
                      ) : (
                        <LockKeyhole size={20} color={COLORS.subtle} />
                      )}
                    </View>
                    <Text numberOfLines={2} style={[styles.achievementName, active && { color: title.color }]}>
                      {title.name}
                    </Text>
                    <Text style={styles.achievementStatus}>
                      {active ? '当前佩戴' : unlocked ? '已收藏' : `LV.${title.level} 解锁`}
                    </Text>
                    <View style={[styles.achievementAccent, { backgroundColor: unlocked ? title.color : '#C7D0DA' }]} />
                  </MotionPressable>
                );
              })}
            </ScrollView>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(230).springify().damping(18).stiffness(175)}
            style={styles.section}
          >
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>MY TOOLKIT</Text>
                <Text style={styles.sectionTitle}>常用功能</Text>
                <Text style={styles.sectionSubtitle}>从记录到复习，继续你的学习路径</Text>
              </View>
            </View>
            <View style={styles.toolGrid}>
              {toolCards.map((item) => {
                const ToolIcon = item.icon;
                return (
                  <MotionPressable
                    key={item.label}
                    onPress={() => router.push(item.route)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.label}，${item.sub}`}
                    pressedScale={0.96}
                    hoverLift={6}
                    hoverTilt={2.4}
                    style={styles.toolCard}
                  >
                    <LinearGradient
                      colors={item.gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <View pointerEvents="none" style={[styles.toolPattern, { borderColor: `${item.accent}13` }]} />
                    <View style={styles.toolTopRow}>
                      <View style={[styles.toolIcon, { backgroundColor: `${item.accent}14` }]}>
                        <ToolIcon size={21} color={item.accent} />
                      </View>
                      <ChevronRight size={17} color={item.accent} />
                    </View>
                    <Text style={[styles.toolMeta, { color: item.accent }]}>{item.meta}</Text>
                    <Text style={styles.toolTitle}>{item.label}</Text>
                    <Text numberOfLines={2} style={styles.toolSub}>{item.sub}</Text>
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
  spectrumWash: {
    position: 'absolute', left: -90, right: -90, top: -120, height: 920,
    transform: [{ rotate: '-7deg' }],
  },
  backgroundLines: {
    position: 'absolute', left: -90, right: -90, top: 260, height: 760,
    opacity: 0.5, transform: [{ rotate: '-8deg' }],
  },
  backgroundLine: {
    position: 'absolute', left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(99,143,180,0.08)',
  },
  scrollContent: { paddingBottom: 132 },
  pageContent: {
    width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 17, gap: 22,
  },
  header: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: {
    color: COLORS.purple, fontSize: 9, lineHeight: 13, fontWeight: '900', letterSpacing: 1.45,
  },
  pageTitle: {
    marginTop: 1, color: COLORS.text, fontSize: 30, lineHeight: 35, fontWeight: '900',
  },
  pageSubtitle: {
    marginTop: 1, color: COLORS.muted, fontSize: 12, lineHeight: 17, fontWeight: '600',
  },
  headerButton: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.94)', shadowColor: '#594BAE',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.13, shadowRadius: 17,
    elevation: 3, ...GLASS_WEB,
  },
  passportCard: {
    overflow: 'hidden', borderRadius: 30, borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.92)', padding: 18, shadowColor: '#426E98',
    shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.18, shadowRadius: 36,
    elevation: 8, ...GLASS_WEB,
  },
  passportSheen: {
    position: 'absolute', width: 100, height: 420, top: -130, left: '52%',
    transform: [{ rotate: '18deg' }],
  },
  passportArcOne: {
    position: 'absolute', width: 230, height: 230, borderRadius: 115, right: -105,
    top: -98, borderWidth: 1, borderColor: 'rgba(82,104,219,0.15)',
  },
  passportArcTwo: {
    position: 'absolute', width: 164, height: 164, borderRadius: 82, right: -64,
    top: -58, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)',
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
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
  levelName: {
    marginTop: 2, color: COLORS.muted, fontSize: 11, lineHeight: 15, fontWeight: '700',
  },
  activeTitleRow: { marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  activeTitleText: {
    color: '#5C47C8', fontSize: 9, lineHeight: 12, fontWeight: '900',
  },
  levelDial: {
    width: 64, height: 64, borderRadius: 32, padding: 5, backgroundColor: 'rgba(255,255,255,0.38)',
    borderWidth: 1, borderColor: 'rgba(100,111,221,0.20)', shadowColor: '#5F58D8',
    shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.13, shadowRadius: 14,
  },
  levelDialInner: {
    flex: 1, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  levelDialLabel: {
    color: COLORS.muted, fontSize: 6.5, lineHeight: 8, fontWeight: '900', letterSpacing: 0.8,
  },
  levelDialValue: {
    marginTop: 1, color: COLORS.text, fontSize: 23, lineHeight: 26, fontWeight: '900',
  },
  progressCopyRow: {
    marginTop: 22, flexDirection: 'row', alignItems: 'flex-end',
    justifyContent: 'space-between', gap: 12,
  },
  progressEyebrow: {
    color: COLORS.blue, fontSize: 7, lineHeight: 10, fontWeight: '900', letterSpacing: 1.1,
  },
  progressTitle: {
    marginTop: 3, color: COLORS.text, fontSize: 14, lineHeight: 18, fontWeight: '900',
  },
  totalXp: {
    color: COLORS.purple, fontSize: 15, lineHeight: 18, fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 10, marginTop: 12, overflow: 'hidden', borderRadius: 99,
    backgroundColor: 'rgba(92,110,148,0.14)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
  },
  progressFill: { height: '100%', borderRadius: 99 },
  passportActions: { marginTop: 18, flexDirection: 'row', gap: 9 },
  continueButton: {
    flex: 1, minHeight: 62, overflow: 'hidden', paddingHorizontal: 11,
    flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 21,
    borderWidth: 1, borderColor: 'rgba(168,223,255,0.65)', shadowColor: '#0875F7',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 18,
    elevation: 4,
  },
  continueButtonCopy: { flex: 1, minWidth: 0 },
  continueButtonTitle: {
    color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '900',
  },
  continueButtonMeta: {
    marginTop: 2, color: 'rgba(230,242,255,0.76)', fontSize: 7.5, lineHeight: 10,
    fontWeight: '700',
  },
  streakButton: {
    width: 70, minHeight: 62, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 3, borderRadius: 21, backgroundColor: 'rgba(242,255,249,0.72)',
    borderWidth: 1, borderColor: 'rgba(70,183,132,0.26)',
  },
  streakValue: { color: COLORS.green, fontSize: 17, lineHeight: 20, fontWeight: '900' },
  streakLabel: { color: COLORS.green, fontSize: 8, lineHeight: 11, fontWeight: '800' },
  metricRow: { flexDirection: 'row', gap: 9 },
  metricCard: {
    flex: 1, minWidth: 0, minHeight: 118, overflow: 'hidden', padding: 11,
    borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#3A688C', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.12,
    shadowRadius: 18, elevation: 3,
  },
  metricIcon: {
    width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
  },
  metricValue: {
    marginTop: 10, color: COLORS.text, fontSize: 20, lineHeight: 23, fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  metricUnit: { color: COLORS.muted, fontSize: 8.5, fontWeight: '700' },
  metricLabel: {
    marginTop: 2, color: COLORS.muted, fontSize: 8, lineHeight: 11, fontWeight: '800',
  },
  metricAccent: {
    position: 'absolute', left: 11, right: 11, bottom: 8, height: 3, borderRadius: 2,
    opacity: 0.7,
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
  section: { gap: 13 },
  sectionHeader: {
    minHeight: 58, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 12,
  },
  sectionEyebrow: {
    color: COLORS.blue, fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 1.2,
  },
  sectionTitle: {
    marginTop: 1, color: COLORS.text, fontSize: 22, lineHeight: 26, fontWeight: '900',
  },
  sectionSubtitle: {
    marginTop: 2, color: COLORS.muted, fontSize: 9, lineHeight: 13, fontWeight: '600',
  },
  sectionAction: {
    minHeight: 35, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.68)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)', shadowColor: '#42657F',
    shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 11,
  },
  sectionActionText: { color: COLORS.muted, fontSize: 9, fontWeight: '900' },
  galleryShell: { height: 224, flexDirection: 'row', gap: 9 },
  galleryMain: {
    flex: 1, minWidth: 0, overflow: 'hidden', borderRadius: 26, borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.88)', shadowColor: '#1D4D75',
    shadowOffset: { width: 0, height: 13 }, shadowOpacity: 0.24, shadowRadius: 24,
    elevation: 6,
  },
  galleryRefraction: {
    position: 'absolute', width: '120%', height: 120, top: -35, left: -22,
    transform: [{ rotate: '-8deg' }],
  },
  galleryTopRow: {
    padding: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  galleryBadge: {
    minHeight: 27, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 14, backgroundColor: 'rgba(10,22,39,0.26)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)', ...GLASS_WEB,
  },
  galleryBadgeText: {
    color: '#FFFFFF', fontSize: 7, lineHeight: 10, fontWeight: '900', letterSpacing: 0.8,
  },
  galleryDate: {
    color: '#FFFFFF', fontSize: 8.5, lineHeight: 12, fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  galleryMainCopy: { position: 'absolute', left: 15, right: 15, bottom: 15 },
  galleryTitle: {
    color: '#FFFFFF', fontSize: 20, lineHeight: 24, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  galleryPhrase: {
    marginTop: 4, color: 'rgba(245,249,255,0.82)', fontSize: 9, lineHeight: 13,
    fontWeight: '600',
  },
  galleryOpenRow: { marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 2 },
  galleryOpenText: { color: '#FFFFFF', fontSize: 9, lineHeight: 12, fontWeight: '900' },
  gallerySide: { width: 111, gap: 9 },
  galleryThumb: {
    flex: 1, overflow: 'hidden', borderRadius: 22, borderWidth: 1.4,
    borderColor: 'rgba(255,255,255,0.9)', shadowColor: '#234F72',
    shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.18, shadowRadius: 15,
    elevation: 4,
  },
  galleryThumbTitle: {
    position: 'absolute', left: 9, right: 9, bottom: 9, color: '#FFFFFF',
    fontSize: 9, lineHeight: 12, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  galleryAdd: {
    flex: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(232,244,255,0.72)', borderWidth: 1,
    borderColor: 'rgba(110,182,237,0.32)',
  },
  galleryAddText: { color: COLORS.blue, fontSize: 8.5, lineHeight: 11, fontWeight: '900' },
  galleryDots: { minHeight: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  galleryDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(106,133,160,0.24)' },
  galleryDotActive: { width: 22, backgroundColor: COLORS.blue },
  achievementRail: { gap: 10, paddingBottom: 5, paddingRight: 4 },
  achievementCard: {
    width: 146, minHeight: 146, overflow: 'hidden', padding: 12, borderRadius: 23,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)', shadowColor: '#3A617E',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 17,
    elevation: 3,
  },
  achievementCardActive: { borderColor: 'rgba(49,138,245,0.48)', shadowOpacity: 0.22 },
  achievementIcon: {
    width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
  },
  achievementName: {
    marginTop: 13, color: COLORS.text, fontSize: 12, lineHeight: 16, fontWeight: '900',
  },
  achievementStatus: {
    marginTop: 4, color: COLORS.muted, fontSize: 8, lineHeight: 11, fontWeight: '700',
  },
  achievementAccent: {
    position: 'absolute', left: 12, right: 12, bottom: 9, height: 3, borderRadius: 2,
    opacity: 0.7,
  },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  toolCard: {
    width: '47%', flexGrow: 1, minHeight: 146, overflow: 'hidden', padding: 13,
    borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#3A617E', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.12,
    shadowRadius: 18, elevation: 3,
  },
  toolPattern: {
    position: 'absolute', width: 122, height: 122, borderRadius: 61, right: -50, top: -50,
    borderWidth: 22,
  },
  toolTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toolIcon: {
    width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
  },
  toolMeta: {
    marginTop: 14, fontSize: 7, lineHeight: 10, fontWeight: '900', letterSpacing: 0.9,
  },
  toolTitle: {
    marginTop: 3, color: COLORS.text, fontSize: 14, lineHeight: 18, fontWeight: '900',
  },
  toolSub: {
    marginTop: 4, color: COLORS.muted, fontSize: 8.5, lineHeight: 12, fontWeight: '700',
  },
  logoutButton: {
    height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.44)', borderWidth: 1,
    borderColor: 'rgba(226,176,176,0.34)',
  },
  logoutText: { color: COLORS.coral, fontSize: 11, fontWeight: '800' },
});

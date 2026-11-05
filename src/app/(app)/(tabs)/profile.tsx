import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import {
  Bookmark,
  BookOpen,
  Camera,
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
  Target,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Svg, {
  Circle,
  Defs,
  Path,
  Stop,
  LinearGradient as SvgLinearGradient,
} from 'react-native-svg';
import { MotionPressable } from '@/components/motion-pressable';
import { ProfileWorkspaceSheet, type ProfileWorkspaceData, type ProfileWorkspaceMode } from '@/components/profile-workspace-sheet';
import { useSession } from '@/ctx';
import { fetchDiaries, fetchLearningRecords, fetchProfileActivityLogs, fetchSentences, fetchUserStats, fetchWords, fetchXpData } from '@/lib/api';
import { useProfilePreferences } from '@/lib/profile-preferences';
import { invalidateQueries, QUERY_KEYS, subscribeToQueryInvalidation } from '@/lib/query-cache';
import defaultAvatar from '../../../../assets/coach-avatar.png';

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

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function logDateKey(log: any) {
  const value = String(log?.reward_date ?? log?.created_at ?? '').slice(0, 10);
  return value.length === 10 ? value : '';
}

export default function ProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ panel?: string }>();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useSession();
  const preferences = useProfilePreferences(session?.user.id);
  const [workspaceMode, setWorkspaceMode] = useState<ProfileWorkspaceMode | null>(null);
  const [workspaceData, setWorkspaceData] = useState<ProfileWorkspaceData>({ records: [], words: [], sentences: [], diaries: [], logs: [] });
  useEffect(() => {
    if (params.panel === 'preferences') {
      setWorkspaceMode('preferences');
      router.setParams({ panel: undefined });
    }
  }, [params.panel, router]);
  const [stats, setStats] = useState<any>(null);
  const [xpData, setXpData] = useState<{ stats: any; logs: any[] }>({ stats: null, logs: [] });
  const [recordCount, setRecordCount] = useState(0);
  const [selectedBadgeIndex, setSelectedBadgeIndex] = useState(0);
  const [selectedDayKey, setSelectedDayKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarNotice, setAvatarNotice] = useState('');
  const loadGeneration = useRef(0);

  const loadProfile = useCallback(async (refresh = false) => {
    const generation = ++loadGeneration.current;
    if (refresh) {
      setRefreshing(true);
      invalidateQueries([QUERY_KEYS.userStats, QUERY_KEYS.xpData, QUERY_KEYS.learningRecords, QUERY_KEYS.words, QUERY_KEYS.sentences, QUERY_KEYS.diaries]);
    }
    else setLoading(true);
    setLoadError('');
    try {
      const [userStats, xp, learningRecords, words, sentences, diaries, logs] = await Promise.all([
        fetchUserStats(),
        fetchXpData(),
        fetchLearningRecords(),
        fetchWords(), fetchSentences(), fetchDiaries(), fetchProfileActivityLogs(),
      ]);
      if (generation !== loadGeneration.current) return;
      setStats(userStats);
      setXpData({ ...xp, logs });
      setRecordCount(learningRecords.length);
      setWorkspaceData({ records: learningRecords, words, sentences, diaries, logs });
    } catch {
      if (generation === loadGeneration.current) setLoadError('个人资料暂时没有同步成功，请稍后重试。');
    } finally {
      if (generation === loadGeneration.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile(false);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const unsubscribe = subscribeToQueryInvalidation(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void loadProfile(false), 150);
      });
      return () => {
        unsubscribe();
        if (timer) clearTimeout(timer);
        loadGeneration.current += 1;
      };
    }, [loadProfile]),
  );

  const streak = xpData.stats?.streak_days ?? stats?.streak_days ?? 0;
  const totalWords = workspaceData.words.length;
  const totalXp = xpData.stats?.total_xp ?? 0;
  const curLevel = calcLevel(totalXp);
  const nextLevel = LEVELS.find((level) => level.level === curLevel.level + 1);
  const progress = nextLevel
    ? (totalXp - curLevel.minXp) / (nextLevel.minXp - curLevel.minXp)
    : 1;
  const progressPercent = Math.min(Math.max(progress, 0) * 100, 100);
  const xpToNext = nextLevel ? Math.max(nextLevel.minXp - totalXp, 0) : 0;
  const email = session?.user?.email ?? '用户';
  const accountName = email.includes('@') ? email.split('@')[0] : email;
  const displayName = preferences.nickname || accountName;
  const avatarOwner = (session?.user?.id === 'local-demo-user' ? email : session?.user?.id ?? email)
    .replace(/[^a-z0-9._-]/gi, '_');
  const avatarStorageKey = `vec.profile.avatar.${avatarOwner}`;
  const unlockedBadges = BADGES.filter((badge) => curLevel.level >= badge.level);
  const wornBadge = unlockedBadges.find(badge => badge.english === preferences.title);
  const selectedBadge = BADGES[selectedBadgeIndex];
  const selectedUnlocked = curLevel.level >= selectedBadge.level;
  const selectedRequiredXp = LEVELS.find((level) => level.level === selectedBadge.level)?.minXp ?? 0;
  const selectedProgress = Math.min(totalXp / Math.max(selectedRequiredXp, 1), 1);
  const ringRadius = 29;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const abilityMetrics = [
    { label: '场景记录', value: recordCount, unit: '条', mode: 'scenes' as const, color: '#167CF3' },
    { label: '收藏词汇', value: totalWords, unit: '词', mode: 'expressions' as const, color: '#22B7C7' },
    { label: '连续学习', value: streak, unit: '天', mode: 'calendar' as const, color: '#16A873' },
    { label: '当前等级', value: curLevel.level, unit: '级', mode: 'level' as const, color: '#F17768' },
  ];

  useEffect(() => {
    let active = true;
    const restoreAvatar = async () => {
      try {
        const savedUri = Platform.OS === 'web'
          ? localStorage.getItem(avatarStorageKey)
          : await SecureStore.getItemAsync(avatarStorageKey);
        if (active && savedUri) setAvatarUri(savedUri);
      } catch {
        if (active) setAvatarUri(null);
      }
    };
    void restoreAvatar();
    return () => {
      active = false;
    };
  }, [avatarStorageKey]);

  const clearStoredAvatar = useCallback(async () => {
    setAvatarUri(null);
    try {
      if (Platform.OS === 'web') localStorage.removeItem(avatarStorageKey);
      else await SecureStore.deleteItemAsync(avatarStorageKey);
    } catch {
      // The bundled default avatar remains available if local storage cannot be cleared.
    }
  }, [avatarStorageKey]);

  const handleAvatarPick = useCallback(async () => {
    if (avatarBusy) return;
    setAvatarBusy(true);
    setAvatarNotice('');
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
          setAvatarNotice('请允许访问相册后再试');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images' as any,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      const selectedUri = result.canceled ? '' : result.assets[0]?.uri;
      if (!selectedUri) return;

      const optimized = await manipulateAsync(
        selectedUri,
        [{ resize: { width: 720, height: 720 } }],
        { base64: Platform.OS === 'web', compress: 0.84, format: SaveFormat.JPEG },
      );

      let persistedUri = optimized.uri;
      if (Platform.OS === 'web') {
        persistedUri = optimized.base64
          ? `data:image/jpeg;base64,${optimized.base64}`
          : optimized.uri;
        localStorage.setItem(avatarStorageKey, persistedUri);
      } else {
        if (!FileSystem.documentDirectory) throw new Error('当前设备无法保存头像文件。');
        const targetUri = `${FileSystem.documentDirectory}profile-avatar-${avatarOwner}.jpg`;
        await FileSystem.deleteAsync(targetUri, { idempotent: true });
        await FileSystem.copyAsync({ from: optimized.uri, to: targetUri });
        persistedUri = targetUri;
        await SecureStore.setItemAsync(avatarStorageKey, persistedUri);
      }
      setAvatarUri(persistedUri);
      setAvatarNotice('头像已更新');
    } catch (error) {
      setAvatarNotice(error instanceof Error ? error.message : '头像更新失败，请稍后重试');
    } finally {
      setAvatarBusy(false);
    }
  }, [avatarBusy, avatarOwner, avatarStorageKey]);

  const weekData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - 6 + index);
      const key = toDateKey(date);
      const value = xpData.logs
        .filter((log) => logDateKey(log) === key)
        .reduce((sum, log) => sum + Number(log.xp_amount ?? 0), 0);
      return {
        key,
        label: '日一二三四五六'[date.getDay()],
        value,
        active: value > 0 || workspaceData.records.some(record => toDateKey(new Date(String(record.created_at).replace(' ', 'T'))) === key),
        today: index === 6,
      };
    });
  }, [workspaceData.records, xpData.logs]);
  const selectedDay = weekData.find((day) => day.key === selectedDayKey) ?? weekData[6];
  const weekTotal = weekData.reduce((sum, day) => sum + day.value, 0);
  const weekMax = Math.max(...weekData.map((day) => day.value), 20);
  const chartPoints = weekData.map((day, index) => ({
    x: 16 + index * 38,
    y: 14 + (1 - day.value / weekMax) * 58,
  }));
  const chartLinePath = chartPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const chartAreaPath = `${chartLinePath} L ${chartPoints.at(-1)?.x ?? 244} 82 L 16 82 Z`;
  const selectedChartIndex = Math.max(
    weekData.findIndex((day) => day.key === selectedDay.key),
    0,
  );

  const growthSignals = useMemo(
    () => [
      {
        icon: Target,
        value: recordCount,
        unit: '条',
        label: '场景记录',
        color: COLORS.blue,
        mode: 'scenes' as const,
      },
      {
        icon: BookOpen,
        value: totalWords,
        unit: '词',
        label: '收藏词汇',
        color: COLORS.purple,
        mode: 'expressions' as const,
      },
      {
        icon: Flame,
        value: streak,
        unit: '天',
        label: '连续学习',
        color: COLORS.green,
        mode: 'calendar' as const,
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
              <Text style={styles.headerEyebrow}>MY PERSONAL SPACE</Text>
              <Text style={styles.pageTitle}>我的学习空间</Text>
              <Text style={styles.pageSubtitle}>管理你的名片、收藏和每一次学习记录</Text>
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
              colors={['#FFFFFF', '#DCEBFA', '#FFFFFF']}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.holoSurface}>
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.99)', 'rgba(255,255,255,0.96)', 'rgba(248,251,255,0.98)']}
                locations={[0, 0.58, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(65,176,255,0.12)', 'rgba(255,255,255,0)', 'rgba(98,124,238,0.08)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0.7 }}
                style={styles.passFoilTop}
              />
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0)', 'rgba(255,184,148,0.08)', 'rgba(77,202,172,0.08)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.passFoilBottom}
              />
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.94)', 'rgba(255,255,255,0)']}
                style={styles.passSpecular}
              />
              <View pointerEvents="none" style={styles.passContourOne} />
              <View pointerEvents="none" style={styles.passContourTwo} />

              <View style={styles.passHeader}>
                <MotionPressable
                  onPress={() => void handleAvatarPick()}
                  accessibilityRole="button"
                  accessibilityLabel="从相册选择头像"
                  pressedScale={0.94}
                  hoverLift={4}
                  hoverTilt={2}
                  disabled={avatarBusy}
                  style={styles.avatarMedallion}
                >
                  <View style={styles.avatarFace}>
                    <Image
                      source={avatarUri ? { uri: avatarUri } : defaultAvatar}
                      placeholder={defaultAvatar}
                      placeholderContentFit="cover"
                      contentFit="cover"
                      transition={180}
                      onError={() => void clearStoredAvatar()}
                      style={styles.avatarImage}
                    />
                  </View>
                  <View style={styles.avatarEditButton}>
                    {avatarBusy
                      ? <ActivityIndicator size="small" color="#FFFFFF" />
                      : <Camera size={12} color="#FFFFFF" strokeWidth={2.5} />}
                  </View>
                </MotionPressable>

                <MotionPressable accessibilityRole="button" accessibilityLabel="编辑个人名片" onPress={() => setWorkspaceMode('identity')} style={styles.passIdentityCopy}>
                  <Text style={styles.passEyebrow}>成长身份卡 · ACTIVE</Text>
                  <Text numberOfLines={1} style={styles.displayName}>{displayName}</Text>
                  <Text style={styles.passRole}>{wornBadge?.name || curLevel.name} · LV.{curLevel.level}</Text>
                  <View style={styles.onlinePill}>
                    <View style={styles.onlineDot} />
                    <Text style={styles.onlineText}>编辑昵称与称号</Text>
                    <ChevronRight size={11} color={COLORS.muted} />
                  </View>
                  {avatarNotice ? (
                    <Text numberOfLines={1} style={styles.avatarNotice}>{avatarNotice}</Text>
                  ) : null}
                </MotionPressable>

                <MotionPressable
                  onPress={() => setWorkspaceMode('level')}
                  accessibilityRole="button"
                  accessibilityLabel={`查看等级 ${curLevel.level} 的成长详情`}
                  pressedScale={0.94}
                  hoverLift={4}
                  hoverTilt={2.4}
                  style={styles.levelLens}
                >
                  <LinearGradient
                    colors={['rgba(209,248,255,0.92)', 'rgba(116,196,255,0.86)', 'rgba(126,104,235,0.9)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(255,255,255,0.78)', 'rgba(255,255,255,0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.8, y: 0.8 }}
                    style={styles.levelLensShine}
                  />
                  <Svg width="72" height="72" viewBox="0 0 76 76">
                    <Circle cx="38" cy="38" r={ringRadius} fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.54)" strokeWidth="4.5" />
                    <Circle
                      cx="38"
                      cy="38"
                      r={ringRadius}
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="4.5"
                      strokeLinecap="round"
                      strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                      strokeDashoffset={ringCircumference * (1 - progressPercent / 100)}
                      transform="rotate(-90 38 38)"
                    />
                  </Svg>
                  <View style={styles.levelLensCopy}>
                    <Text style={styles.levelLensLabel}>LEVEL</Text>
                    <Text style={styles.levelLensValue}>{curLevel.level}</Text>
                  </View>
                </MotionPressable>
              </View>

              <View style={styles.abilitySpectrum}>
                <View style={styles.spectrumHeading}>
                  <View>
                    <Text style={styles.spectrumEyebrow}>LEARNING FOOTPRINT</Text>
                    <Text style={styles.spectrumTitle}>学习足迹</Text>
                    <Text style={styles.spectrumSubtitle}>点选指标，展开属于你的真实内容</Text>
                  </View>
                  <MotionPressable
                    onPress={() => setWorkspaceMode('calendar')}
                    accessibilityRole="button"
                    accessibilityLabel="查看学习日历"
                    pressedScale={0.9}
                    style={styles.spectrumMore}
                  >
                    <ChevronRight size={15} color={COLORS.blueDark} />
                  </MotionPressable>
                </View>
                <View style={styles.spectrumBody}>
                  <MotionPressable
                    onPress={() => setWorkspaceMode('calendar')}
                    accessibilityRole="button"
                    accessibilityLabel={`近7天学习 ${weekData.filter(day => day.active).length} 天，查看日历`}
                    pressedScale={0.95}
                    hoverLift={3}
                    hoverTilt={2}
                    style={styles.spectrumDial}
                  >
                    <Svg pointerEvents="none" width="120" height="120" viewBox="0 0 120 120">
                      <Circle cx="60" cy="60" r="48" fill="rgba(243,249,255,0.8)" stroke="#E5EDF8" strokeWidth="11" />
                      {weekData.map((day, index) => <Circle key={day.key} cx="60" cy="60" r="48" fill="none" stroke={day.active ? ['#13BEEA','#2485F1','#645AE3'][index % 3] : '#DCE6F0'} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 48 / 7 - 10} ${2 * Math.PI * 48}`} transform={`rotate(${-90 + index * 360 / 7} 60 60)`} />)}
                    </Svg>
                    <View style={styles.spectrumDialCore}>
                      <Text style={styles.spectrumScore}>{weekData.filter(day => day.active).length}<Text style={{fontSize:14}}> / 7</Text></Text>
                      <Text style={styles.spectrumScoreLabel}>近7天学习</Text>
                    </View>
                  </MotionPressable>

                  <View style={styles.metricGrid}>
                    {abilityMetrics.map((metric) => (
                      <MotionPressable
                        key={metric.label}
                        onPress={() => setWorkspaceMode(metric.mode)}
                        accessibilityRole="button"
                        accessibilityLabel={`${metric.label} ${metric.value} ${metric.unit}`}
                        pressedScale={0.95}
                        hoverLift={2}
                        style={styles.metricCell}
                      >
                        <View style={[styles.metricSignal, { backgroundColor: metric.color }]} />
                        <View style={styles.metricCopy}>
                          <Text style={styles.metricLabel}>{metric.label}</Text>
                          <View style={styles.metricValueRow}>
                            <Text style={styles.metricValue}>{metric.value}</Text>
                            <Text style={styles.metricUnit}>{metric.unit}</Text>
                          </View>
                        </View>
                      </MotionPressable>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.xpSummaryRow}>
                <View style={styles.xpReading}>
                  <Text style={styles.xpValue}>{totalXp}</Text>
                  <Text style={styles.xpUnit}>XP</Text>
                </View>
                <View style={styles.xpProgressCopy}>
                  <View style={styles.xpProgressTrack}>
                    <LinearGradient
                      colors={['#2FCBF3', '#2A82F3', '#7658E8']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.xpProgressFill, { width: `${Math.max(progressPercent, 3)}%` }]}
                    />
                  </View>
                  <Text style={styles.xpProgressText}>
                    {nextLevel ? `距离下一等级 ${xpToNext} XP` : '已达到最高等级'}
                  </Text>
                </View>
              </View>

              <View style={styles.passActionDock}>
                <MotionPressable
                  onPress={() => router.push({pathname:'/(app)/scene-detail',params:{sceneId:preferences.preferredScene,returnTo:'profile'}} as any)}
                  accessibilityRole="button"
                  accessibilityLabel="继续今天的学习"
                  pressedScale={0.96}
                  hoverLift={3}
                  hoverTilt={1.4}
                  style={styles.passPrimaryButton}
                >
                  <LinearGradient
                    colors={['rgba(36,146,250,0.96)', 'rgba(67,117,238,0.94)', 'rgba(106,83,226,0.92)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.passButtonHighlight}
                  />
                  <View style={styles.passPlayOrb}>
                    <Target size={16} color="#FFFFFF" />
                  </View>
                  <Text style={styles.passPrimaryText}>继续今天的学习</Text>
                  <ChevronRight size={17} color="#FFFFFF" />
                </MotionPressable>
                <MotionPressable
                  onPress={() => setWorkspaceMode('calendar')}
                  accessibilityRole="button"
                  accessibilityLabel={`查看连续学习 ${streak} 天`}
                  pressedScale={0.92}
                  hoverLift={3}
                  style={styles.passStreakButton}
                >
                  <View style={styles.passStreakIcon}>
                    <Flame size={15} color={COLORS.green} fill={COLORS.green} />
                  </View>
                  <Text style={styles.passStreakLabel}>连续</Text>
                  <Text style={styles.passStreakValue}>{streak}</Text>
                  <Text style={styles.passStreakUnit}>天</Text>
                  <ChevronRight size={14} color={COLORS.muted} />
                </MotionPressable>
              </View>
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
                <Text style={styles.liveText}>真实记录</Text>
              </View>
            </View>
            <View style={styles.signalConsole}>
              <LinearGradient
                colors={['rgba(233,246,255,0.94)', 'rgba(240,235,255,0.90)', 'rgba(255,246,239,0.90)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View pointerEvents="none" style={styles.signalConsoleRail} />
              <View style={styles.signalConsoleHeader}>
                <View>
                  <Text style={styles.signalConsoleEyebrow}>7 DAY LEARNING PULSE</Text>
                  <Text style={styles.signalConsoleTitle}>最近 7 天学习脉冲</Text>
                </View>
                <View style={styles.signalReading}>
                  <Text style={styles.signalReadingValue}>{selectedDay.value}</Text>
                  <Text style={styles.signalReadingUnit}>XP</Text>
                  <Text style={styles.signalReadingLabel}>{selectedDay.today ? '今天' : `周${selectedDay.label}`}</Text>
                </View>
              </View>

              <View style={styles.chartWrap}>
                <Svg width="100%" height="94" viewBox="0 0 260 94">
                  <Defs>
                    <SvgLinearGradient id="growthArea" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="#2D89F4" stopOpacity="0.38" />
                      <Stop offset="0.58" stopColor="#7658E8" stopOpacity="0.13" />
                      <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                    </SvgLinearGradient>
                    <SvgLinearGradient id="growthLine" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor="#23C5F7" />
                      <Stop offset="0.52" stopColor="#287EF4" />
                      <Stop offset="1" stopColor="#7658E8" />
                    </SvgLinearGradient>
                  </Defs>
                  <Path d="M 16 30 L 244 30" stroke="rgba(74,105,142,0.10)" strokeWidth="1" strokeDasharray="3 5" />
                  <Path d="M 16 56 L 244 56" stroke="rgba(74,105,142,0.10)" strokeWidth="1" strokeDasharray="3 5" />
                  <Path d={chartAreaPath} fill="url(#growthArea)" />
                  <Path d={chartLinePath} fill="none" stroke="url(#growthLine)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                  {chartPoints.map((point, index) => (
                    <Circle
                      key={weekData[index].key}
                      cx={point.x}
                      cy={point.y}
                      r={selectedChartIndex === index ? 5.5 : 3.1}
                      fill={selectedChartIndex === index ? '#FFFFFF' : '#4B75EE'}
                      stroke={selectedChartIndex === index ? '#287EF4' : '#FFFFFF'}
                      strokeWidth={selectedChartIndex === index ? 3 : 1.5}
                    />
                  ))}
                </Svg>
                <View style={styles.chartDayRow}>
                  {weekData.map((day) => {
                    const selected = day.key === selectedDay.key;
                    return (
                      <MotionPressable
                        key={day.key}
                        onPress={() => { setSelectedDayKey(day.key); setWorkspaceMode('calendar'); }}
                        haptic={false}
                        pressedScale={0.88}
                        style={[styles.chartDay, selected && styles.chartDaySelected]}
                        accessibilityRole="button"
                        accessibilityLabel={`周${day.label} ${day.value} XP`}
                      >
                        <Text style={[styles.chartDayText, selected && styles.chartDayTextSelected]}>
                          {day.today ? '今' : day.label}
                        </Text>
                      </MotionPressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.weekSummary}>
                <View style={styles.weekSummaryPrimary}>
                  <Text style={styles.weekSummaryLabel}>近7天累计</Text>
                  <Text style={styles.weekSummaryValue}>{weekTotal}<Text style={styles.weekSummaryUnit}> XP</Text></Text>
                </View>
                <View style={styles.weekSummaryDivider} />
                <Text style={styles.weekSummaryNote}>
                  {weekTotal > 0 ? '每一次练习都被记录' : '开始练习后，这里会出现你的真实成长曲线'}
                </Text>
              </View>

              <View style={styles.signalDock}>
                {growthSignals.map((item) => {
                  const SignalIcon = item.icon;
                  return (
                    <MotionPressable
                      key={item.label}
                      onPress={() => setWorkspaceMode(item.mode)}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.label} ${item.value} ${item.unit}`}
                      pressedScale={0.94}
                      hoverLift={4}
                      style={styles.signalChip}
                    >
                      <View style={[styles.signalChipIcon, { backgroundColor: `${item.color}14` }]}>
                        <SignalIcon size={16} color={item.color} strokeWidth={2.4} />
                      </View>
                      <View style={styles.signalChipCopy}>
                        <Text style={styles.signalChipValue}>{item.value}<Text style={styles.signalChipUnit}> {item.unit}</Text></Text>
                        <Text style={styles.signalChipLabel}>{item.label}</Text>
                      </View>
                    </MotionPressable>
                  );
                })}
              </View>
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
                onPress={() => setWorkspaceMode('badges')}
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
                      {wornBadge?.english === badge.english ? '当前称号' : unlocked ? '已获得' : `LV.${badge.level}`}
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
                onPress={() => setWorkspaceMode('badges')}
                pressedScale={0.96}
                hoverLift={2}
                style={styles.badgeDetailAction}
              >
                <Text style={[styles.badgeDetailActionText, { color: selectedBadge.color }]}>查看条件与佩戴称号</Text>
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
              onPress={() => setWorkspaceMode('diary')}
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
                <Text numberOfLines={2} style={styles.diarySubtitle}>{workspaceData.diaries[0]?.content || '还没有日记，从第一次场景学习写起'}</Text>
              </View>
              <View style={styles.diaryAction}>
                <Text style={styles.diaryActionText}>{workspaceData.diaries.length ? '阅读与编辑' : '创建故事'}</Text>
                <ChevronRight size={17} color="#FFFFFF" />
              </View>
            </MotionPressable>

            <View style={styles.toolPair}>
              <MotionPressable
                onPress={() => setWorkspaceMode('collections')}
                accessibilityRole="button"
                accessibilityLabel="打开我的收藏精选"
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
                <Text style={styles.toolTitle}>收藏精选</Text>
                <Text style={styles.toolDescription}>{workspaceData.records.filter(record => Boolean(record.is_favorited)).length} 条场景收藏 · {workspaceData.sentences.length} 条句子</Text>
                <View style={styles.phrasePreview}>
                  <Text numberOfLines={1} style={styles.phrasePreviewText}>{workspaceData.records.find(record => Boolean(record.is_favorited))?.i_say || workspaceData.sentences[0]?.sentence || '保存喜欢的内容，随时再练'}</Text>
                  <View style={styles.phraseDot} />
                </View>
              </MotionPressable>

              <MotionPressable
                onPress={() => router.push('/(app)/scene-map?returnTo=profile' as any)}
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
              onPress={() => setWorkspaceMode('preferences')}
              accessibilityRole="button"
              accessibilityLabel="打开学习偏好"
              pressedScale={0.975}
              hoverLift={3}
              style={styles.settingsStrip}
            >
              <View style={styles.settingsIcon}>
                <Settings size={19} color="#536A82" />
              </View>
              <View style={styles.settingsCopy}>
                <Text style={styles.settingsTitle}>学习设置</Text>
                <Text style={styles.settingsSubtitle}>{preferences.speechRate}× 默认语速 · 每日 {preferences.dailyScenes} 个场景</Text>
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
      <ProfileWorkspaceSheet mode={workspaceMode} owner={session?.user.id || ''} accountName={accountName} avatarUri={avatarUri} avatarBusy={avatarBusy} avatarNotice={avatarNotice} defaultAvatar={defaultAvatar} level={curLevel.level} totalXp={totalXp} levels={LEVELS} badges={BADGES} data={workspaceData} initialDate={selectedDayKey || toDateKey(new Date())} loading={loading || refreshing} dataError={loadError} onClose={() => setWorkspaceMode(null)} onReload={() => void loadProfile(true)} onAvatarPick={() => void handleAvatarPick()} />
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
    minHeight: 423, overflow: 'hidden', borderRadius: 32, padding: 1.5,
    shadowColor: '#476A8F', shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.16, shadowRadius: 34, elevation: 8,
  },
  holoSurface: {
    flex: 1, minHeight: 420, overflow: 'hidden', padding: 15, borderRadius: 30.5,
    backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.98)', ...GLASS_WEB,
  },
  passFoilTop: {
    position: 'absolute', width: 340, height: 154, left: -126, top: -62,
    borderRadius: 80, transform: [{ rotate: '-11deg' }],
  },
  passFoilBottom: {
    position: 'absolute', width: 380, height: 160, right: -145, bottom: -70,
    borderRadius: 82, transform: [{ rotate: '8deg' }],
  },
  passSpecular: {
    position: 'absolute', width: 58, height: 560, left: '44%', top: -126,
    transform: [{ rotate: '17deg' }], opacity: 0.72,
  },
  passContourOne: {
    position: 'absolute', width: 332, height: 124, right: -176, top: 18,
    borderWidth: 1, borderColor: 'rgba(84,135,196,0.08)', borderRadius: 30,
    transform: [{ rotate: '-14deg' }],
  },
  passContourTwo: {
    position: 'absolute', width: 292, height: 98, right: -134, top: 48,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.78)', borderRadius: 29,
    transform: [{ rotate: '-14deg' }],
  },
  passHeader: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatarMedallion: {
    width: 76, height: 76, overflow: 'visible', borderRadius: 38,
    alignItems: 'center', justifyContent: 'center', shadowColor: '#54769A',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 14,
    elevation: 4,
  },
  avatarFace: {
    width: 72, height: 72, overflow: 'hidden', borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#DFF1FF',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarEditButton: {
    position: 'absolute', right: -1, bottom: -1, width: 25, height: 25, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#167CF3',
    borderWidth: 2, borderColor: '#FFFFFF', shadowColor: '#116EE8',
    shadowOpacity: 0.24, shadowRadius: 6,
  },
  passIdentityCopy: { flex: 1, minWidth: 0 },
  passEyebrow: { color: COLORS.blueDark, fontSize: 7, lineHeight: 10, fontWeight: '900', letterSpacing: 1.1 },
  displayName: { marginTop: 2, color: COLORS.text, fontSize: 21, lineHeight: 24, fontWeight: '900' },
  passRole: { marginTop: 1, color: COLORS.muted, fontSize: 9, lineHeight: 12, fontWeight: '800' },
  onlinePill: {
    minHeight: 21, marginTop: 5, alignSelf: 'flex-start', paddingHorizontal: 8,
    flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.52)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
  },
  onlineDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.green },
  onlineText: { color: COLORS.muted, fontSize: 7, lineHeight: 9, fontWeight: '800' },
  avatarNotice: { marginTop: 3, color: COLORS.blueDark, fontSize: 6.5, lineHeight: 8, fontWeight: '800' },
  levelLens: {
    width: 76, height: 76, overflow: 'hidden', borderRadius: 38,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.72)', shadowColor: '#4259D8',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.28, shadowRadius: 18,
    elevation: 6,
  },
  levelLensShine: {
    position: 'absolute', width: 70, height: 34, left: 3, top: 1,
    borderRadius: 22, transform: [{ rotate: '-9deg' }],
  },
  levelLensCopy: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  levelLensLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 6, lineHeight: 8, fontWeight: '900', letterSpacing: 1 },
  levelLensValue: { marginTop: -1, color: '#FFFFFF', fontSize: 25, lineHeight: 28, fontWeight: '900' },
  abilitySpectrum: {
    minHeight: 156, marginTop: 12, padding: 11, borderRadius: 21,
    backgroundColor: 'rgba(246,250,255,0.8)', borderWidth: 1,
    borderColor: 'rgba(218,230,244,0.82)', shadowColor: '#7090B2',
    shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.08, shadowRadius: 16,
  },
  spectrumHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  spectrumEyebrow: { color: COLORS.blue, fontSize: 6.2, lineHeight: 8, fontWeight: '900', letterSpacing: 1.05 },
  spectrumTitle: { marginTop: 1, color: COLORS.text, fontSize: 14, lineHeight: 17, fontWeight: '900' },
  spectrumSubtitle: { marginTop: 1, color: COLORS.muted, fontSize: 7.2, lineHeight: 9, fontWeight: '700' },
  spectrumMore: {
    width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(213,226,241,0.92)',
    shadowColor: '#6684A6', shadowOpacity: 0.1, shadowRadius: 8,
  },
  spectrumBody: { minHeight: 104, marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 10 },
  spectrumDial: {
    width: 120, height: 120, alignItems: 'center', justifyContent: 'center',
  },
  spectrumDialCore: {
    position: 'absolute', width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
    shadowColor: '#5B7DA0', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.13, shadowRadius: 10,
  },
  spectrumScore: { color: COLORS.text, fontSize: 18, lineHeight: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
  spectrumScoreLabel: { color: COLORS.muted, fontSize: 5.5, lineHeight: 7, fontWeight: '800' },
  metricGrid: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  metricCell: {
    width: '47%', minHeight: 43, paddingHorizontal: 8, flexDirection: 'row',
    alignItems: 'center', gap: 7, borderRadius: 13, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: 'rgba(218,230,244,0.84)', shadowColor: '#6784A3',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8,
  },
  metricSignal: { width: 5, height: 24, borderRadius: 3 },
  metricCopy: { flex: 1, minWidth: 0 },
  metricLabel: { color: COLORS.muted, fontSize: 6.5, lineHeight: 8, fontWeight: '800' },
  metricValueRow: { marginTop: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  metricValue: { color: COLORS.text, fontSize: 14, lineHeight: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  metricUnit: { marginBottom: 1, color: COLORS.subtle, fontSize: 6, lineHeight: 8, fontWeight: '800' },
  xpSummaryRow: { minHeight: 40, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 11 },
  xpReading: { width: 78, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  xpValue: { color: COLORS.text, fontSize: 22, lineHeight: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  xpUnit: { marginBottom: 2, color: COLORS.purple, fontSize: 8, lineHeight: 11, fontWeight: '900' },
  xpProgressCopy: { flex: 1, minWidth: 0 },
  xpProgressTrack: {
    height: 7, overflow: 'hidden', borderRadius: 4, backgroundColor: 'rgba(104,126,150,0.14)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.66)',
  },
  xpProgressFill: { height: '100%', borderRadius: 4 },
  xpProgressText: { marginTop: 3, color: COLORS.muted, fontSize: 7, lineHeight: 9, fontWeight: '800' },
  passActionDock: { marginTop: 9, flexDirection: 'row', gap: 8 },
  passPrimaryButton: {
    flex: 1, minHeight: 53, overflow: 'hidden', paddingHorizontal: 11,
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 19,
    borderWidth: 1.2, borderColor: 'rgba(224,247,255,0.9)', shadowColor: '#0875F7',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.27, shadowRadius: 18, elevation: 4,
  },
  passButtonHighlight: { position: 'absolute', left: 9, right: 9, top: 2, height: 18, borderRadius: 14 },
  passPlayOrb: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.17)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.48)',
  },
  passPrimaryText: { flex: 1, color: '#FFFFFF', fontSize: 10.5, lineHeight: 14, fontWeight: '900' },
  passStreakButton: {
    width: 126, minHeight: 53, paddingHorizontal: 8, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 19,
    backgroundColor: 'rgba(238,255,248,0.5)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.88)', shadowColor: '#20A878',
    shadowOpacity: 0.14, shadowRadius: 14, ...GLASS_WEB,
  },
  passStreakIcon: {
    width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.66)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  passStreakLabel: { color: COLORS.muted, fontSize: 7, lineHeight: 9, fontWeight: '800' },
  passStreakValue: { color: COLORS.green, fontSize: 17, lineHeight: 20, fontWeight: '900' },
  passStreakUnit: { color: COLORS.green, fontSize: 7, lineHeight: 9, fontWeight: '900' },
  signalSection: { gap: 10 },
  signalHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  signalTitle: { marginTop: 1, color: COLORS.text, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.green },
  liveText: { color: COLORS.muted, fontSize: 8, lineHeight: 11, fontWeight: '800' },
  signalConsole: {
    minHeight: 344, overflow: 'hidden', padding: 15, borderRadius: 28,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.94)', shadowColor: '#406C94',
    shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.15, shadowRadius: 28,
    elevation: 5, ...GLASS_WEB,
  },
  signalConsoleRail: {
    position: 'absolute', width: 250, height: 120, right: -86, top: -35,
    borderWidth: 20, borderColor: 'rgba(72,102,223,0.07)', borderRadius: 28,
    transform: [{ rotate: '-15deg' }],
  },
  signalConsoleHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  signalConsoleEyebrow: { color: COLORS.blue, fontSize: 7, lineHeight: 10, fontWeight: '900', letterSpacing: 1 },
  signalConsoleTitle: { marginTop: 2, color: COLORS.text, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  signalReading: { alignItems: 'flex-end' },
  signalReadingValue: { color: COLORS.blue, fontSize: 26, lineHeight: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  signalReadingUnit: { marginTop: -3, color: COLORS.purple, fontSize: 7, lineHeight: 10, fontWeight: '900', letterSpacing: 0.8 },
  signalReadingLabel: { marginTop: 2, color: COLORS.muted, fontSize: 7.5, lineHeight: 10, fontWeight: '700' },
  chartWrap: { marginTop: 5 },
  chartDayRow: { height: 30, marginTop: -8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chartDay: { width: 29, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chartDaySelected: { backgroundColor: '#1D7FF1', shadowColor: '#167CF3', shadowOpacity: 0.28, shadowRadius: 8 },
  chartDayText: { color: COLORS.muted, fontSize: 8, lineHeight: 11, fontWeight: '800' },
  chartDayTextSelected: { color: '#FFFFFF' },
  weekSummary: {
    minHeight: 46, marginTop: 4, paddingHorizontal: 11, flexDirection: 'row',
    alignItems: 'center', borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.46)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)',
  },
  weekSummaryPrimary: { width: 78 },
  weekSummaryLabel: { color: COLORS.muted, fontSize: 6.5, lineHeight: 9, fontWeight: '800' },
  weekSummaryValue: { marginTop: 1, color: COLORS.text, fontSize: 15, lineHeight: 18, fontWeight: '900' },
  weekSummaryUnit: { color: COLORS.blue, fontSize: 7.5, fontWeight: '900' },
  weekSummaryDivider: { width: 1, height: 25, marginHorizontal: 10, backgroundColor: 'rgba(91,116,145,0.14)' },
  weekSummaryNote: { flex: 1, color: COLORS.muted, fontSize: 7.5, lineHeight: 11, fontWeight: '600' },
  signalDock: { marginTop: 10, flexDirection: 'row', gap: 6 },
  signalChip: {
    flex: 1, minWidth: 0, minHeight: 62, paddingHorizontal: 8, flexDirection: 'row',
    alignItems: 'center', gap: 6, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.58)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.88)',
  },
  signalChipIcon: { width: 29, height: 29, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  signalChipCopy: { flex: 1, minWidth: 0 },
  signalChipValue: { color: COLORS.text, fontSize: 13, lineHeight: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  signalChipUnit: { color: COLORS.muted, fontSize: 6.5, fontWeight: '700' },
  signalChipLabel: { marginTop: 1, color: COLORS.muted, fontSize: 6.5, lineHeight: 9, fontWeight: '700' },
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

import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  AlertCircle,
  BookOpenCheck,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Crown,
  Flame,
  Image as ImageIcon,
  MapPinned,
  MessageCircle,
  Mic2,
  Play,
  Settings,
  Star,
  X,
  Zap,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { fetchSceneMapProgress, fetchSceneProgress, fetchXpData } from '@/lib/api';
import { setPendingUri } from '@/lib/imageStore';
import { ALL_SCENES, type SceneNode } from '@/lib/sceneMapData';

declare const require: (assetPath: string) => number;

const HOTEL_SCENE_IMAGE = require('../../../../assets/growth-hotel-scene.png');

const COLORS = {
  background: '#F5F7FB',
  surface: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  subtle: '#94A3B8',
  border: '#E2E8F0',
  blue: '#2878F0',
  blueSoft: '#EAF3FF',
  green: '#16A369',
  greenSoft: '#EAF9F1',
  amber: '#F59E0B',
  amberDark: '#B86905',
  amberSoft: '#FFF7DF',
};

const LEVELS = [
  { level: 1, nameCN: '英语新手', minXp: 0 },
  { level: 2, nameCN: '初级学员', minXp: 100 },
  { level: 3, nameCN: '进阶学员', minXp: 300 },
  { level: 4, nameCN: '表达能手', minXp: 600 },
  { level: 5, nameCN: '场景达人', minXp: 1000 },
  { level: 6, nameCN: '流利学者', minXp: 1500 },
  { level: 7, nameCN: '英语能手', minXp: 2100 },
  { level: 8, nameCN: '思维大师', minXp: 2800 },
  { level: 9, nameCN: '语言达人', minXp: 3600 },
  { level: 10, nameCN: '英语领袖', minXp: 5000 },
];

const SCENE_IMAGES: Record<string, string> = {
  'coffee-shop': 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_49002e3d-eac9-4560-b349-a394406db2c1.jpg',
  airport: 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_d84cc569-cf32-43ec-8936-bc6db048b303.jpg',
  restaurant: 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_157d6c03-4833-4540-8013-efe631da980e.jpg',
  supermarket: 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_786fd9c5-ee8d-4f3e-9abf-2f648de066e3.jpg',
  subway: 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_ec179956-2989-4b6a-b22e-ac2751144890.jpg',
  hospital: 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_e1c389d1-40c1-4c63-ad3a-87b734c0181c.jpg',
  library: 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_379064ef-c703-4476-9801-6b5cc609e85e.jpg',
};

const XP_TASKS = [
  { key: 'dialogue', label: '完成 1 个场景对话', actionLabel: '去对话', reward: 30, prefix: 'dialogue_scene_', icon: MessageCircle },
  { key: 'analysis', label: '完成 1 次场景分析', actionLabel: '去拍照', reward: 20, prefix: 'scene_analysis_', icon: Camera },
  { key: 'shadowing', label: '完成 1 次跟读练习', actionLabel: '去跟读', reward: 25, prefix: 'shadowing_', icon: Mic2 },
] as const;

function calcLevel(totalXp: number) {
  for (let i = LEVELS.length - 1; i >= 0; i -= 1) {
    if (totalXp >= LEVELS[i].minXp) return LEVELS[i];
  }
  return LEVELS[0];
}

function rewardLabel(source: string): string {
  if (source.startsWith('dialogue_scene_')) return '完成场景对话';
  if (source.startsWith('dialogue_')) return '完成 AI 对话练习';
  if (source.startsWith('scene_analysis_')) return '完成场景分析';
  if (source.startsWith('shadowing_')) return '完成跟读练习';
  if (source.startsWith('translation_')) return '完成翻译练习';
  if (source.startsWith('learning_scene_')) return '完成场景学习';
  if (source === 'daily_checkin') return '每日学习打卡';
  return '获得学习奖励';
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function logDateKey(log: any) {
  const value = log?.reward_date ?? log?.created_at;
  return value ? String(value).slice(0, 10) : '';
}

function rewardDateLabel(log: any) {
  const key = logDateKey(log);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (key === toDateKey(today)) return '今天';
  if (key === toDateKey(yesterday)) return '昨天';
  return key ? key.slice(5).replace('-', '.') : '';
}

function sceneKeyToId(sceneKey: string) {
  return sceneKey.replace(/_/g, '-');
}

function getVisibleLevels(currentLevel: number) {
  if (currentLevel <= 1) return LEVELS.slice(0, 3);
  if (currentLevel >= LEVELS.length) return LEVELS.slice(-3);
  return LEVELS.slice(currentLevel - 2, currentLevel + 1);
}

function LevelGauge({
  size,
  progress,
  level,
  levelName,
  totalXp,
  targetXp,
  xpToNext,
  nextLevel,
}: {
  size: number;
  progress: number;
  level: number;
  levelName: string;
  totalXp: number;
  targetXp: number;
  xpToNext: number;
  nextLevel?: number;
}) {
  const strokeWidth = 15;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeProgress = Math.min(Math.max(progress, 0), 1);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={styles.gaugeSvg}>
        <SvgCircle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E7ECF2" strokeWidth={strokeWidth} />
        <SvgCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={COLORS.blue}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - safeProgress)}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.gaugeContent}>
        <Crown size={23} color={COLORS.amber} fill="#FFD057" />
        <Text style={styles.levelValue}>LV.{level}</Text>
        <Text style={styles.levelName}>{levelName}</Text>
        <Text style={styles.levelXp}>{totalXp} / {targetXp} XP</Text>
        <View style={styles.distanceBadge}>
          <Zap size={14} color={COLORS.amberDark} />
          <Text style={styles.distanceText}>
            {nextLevel ? `距离 LV.${nextLevel} 还差 ${xpToNext} XP` : '已达到最高等级'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function LevelPath({ currentLevel }: { currentLevel: number }) {
  const visibleLevels = getVisibleLevels(currentLevel);
  const currentIndex = visibleLevels.findIndex((item) => item.level === currentLevel);
  const activeTrackWidth = `${Math.max(currentIndex, 0) * 33.34}%` as `${number}%`;

  return (
    <View style={styles.levelPath}>
      <View style={styles.levelTrack} />
      <View style={[styles.levelTrackActive, { width: activeTrackWidth }]} />
      <View style={styles.levelSteps}>
        {visibleLevels.map((item) => {
          const completed = item.level < currentLevel;
          const current = item.level === currentLevel;
          return (
            <View key={item.level} style={styles.levelStep}>
              <View style={[styles.levelDot, completed && styles.levelDotCompleted, current && styles.levelDotCurrent]}>
                {completed ? (
                  <Check size={21} color="#FFFFFF" strokeWidth={3} />
                ) : (
                  <Text style={[styles.levelDotText, current && styles.levelDotTextCurrent]}>{item.level}</Text>
                )}
              </View>
              <Text style={[styles.levelStepTitle, current && styles.levelStepTitleCurrent]}>LV.{item.level}</Text>
              <Text style={[styles.levelStepStatus, current && styles.levelStepStatusCurrent]}>
                {completed ? '已完成' : current ? '当前等级' : '下一级'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Metric({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <View style={styles.metric}>
      <Icon size={22} color={color} />
      <View>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={[styles.metricValue, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

function RecommendedScene({ scene, onPress }: { scene: SceneNode; onPress: () => void }) {
  const remoteImage = SCENE_IMAGES[scene.id];
  const imageSource = scene.id === 'hotel' ? HOTEL_SCENE_IMAGE : remoteImage ? { uri: remoteImage } : null;

  return (
    <View style={styles.recommendedCard}>
      <Text style={styles.sectionTitle}>下一步升级任务</Text>
      <View style={styles.recommendedBody}>
        {imageSource ? (
          <Image source={imageSource} style={styles.recommendedImage} contentFit="cover" transition={180} />
        ) : (
          <View style={styles.recommendedImageFallback}>
            <MapPinned size={32} color={COLORS.blue} />
          </View>
        )}
        <View style={styles.recommendedCopy}>
          <Text style={styles.recommendedTitle} numberOfLines={2}>完成{scene.nameZh}场景练习</Text>
          <Text style={styles.recommendedMeta}>
            约 5 分钟 · 完成获得 <Text style={styles.rewardAmount}>30 XP</Text>
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`开始${scene.nameZh}场景练习`}
            onPress={onPress}
            style={styles.primaryButton}
            className="active:opacity-70"
          >
            <Play size={17} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.primaryButtonText}>继续学习</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function GrowthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [xpData, setXpData] = useState<{ stats: any; logs: any[] }>({ stats: null, logs: [] });
  const [sceneProgress, setSceneProgress] = useState<any[]>([]);
  const [dialogueProgress, setDialogueProgress] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [captureMenuOpen, setCaptureMenuOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const [showAllRewards, setShowAllRewards] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        try {
          const [xp, sceneRows, dialogueRows] = await Promise.all([
            fetchXpData(),
            fetchSceneProgress(),
            fetchSceneMapProgress(),
          ]);
          if (!active) return;
          const dialogueMap: Record<string, string> = {};
          (dialogueRows ?? []).forEach((row: any) => {
            dialogueMap[row.scene_id] = row.status;
          });
          setXpData(xp);
          setSceneProgress(sceneRows ?? []);
          setDialogueProgress(dialogueMap);
        } catch {
          // Keep the last successful snapshot visible when a refresh fails.
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const stats = xpData.stats;
  const totalXp = Number(stats?.total_xp ?? 0);
  const streakDays = Number(stats?.streak_days ?? 0);
  const curLevel = calcLevel(totalXp);
  const nextLevel = LEVELS.find((level) => level.level === curLevel.level + 1);
  const targetXp = nextLevel?.minXp ?? curLevel.minXp;
  const xpToNext = nextLevel ? Math.max(nextLevel.minXp - totalXp, 0) : 0;
  const targetProgress = nextLevel ? totalXp / nextLevel.minXp : 1;

  const completedSceneIds = useMemo(
    () => new Set(
      Object.entries(dialogueProgress)
        .filter(([, status]) => status === 'completed')
        .map(([sceneId]) => sceneId),
    ),
    [dialogueProgress],
  );

  const startedSceneIds = useMemo(() => {
    const started = new Set<string>();
    sceneProgress.forEach((row) => {
      if ((row.visit_count ?? 0) > 0 || row.is_unlocked) started.add(sceneKeyToId(String(row.scene_key ?? '')));
    });
    Object.entries(dialogueProgress).forEach(([sceneId, status]) => {
      if (status === 'in_progress' || status === 'completed') started.add(sceneId);
    });
    return started;
  }, [dialogueProgress, sceneProgress]);

  const completedCount = ALL_SCENES.filter((scene) => completedSceneIds.has(scene.id)).length;
  const recommendedScene =
    ALL_SCENES.find((scene) => !completedSceneIds.has(scene.id) && !startedSceneIds.has(scene.id)) ??
    ALL_SCENES.find((scene) => !completedSceneIds.has(scene.id)) ??
    ALL_SCENES[0];

  const todayKey = toDateKey(new Date());
  const todayLogs = xpData.logs.filter((log) => logDateKey(log) === todayKey);
  const todayXp = todayLogs.reduce((sum, log) => sum + Number(log.xp_amount ?? 0), 0);

  const weekData = useMemo(() => {
    const today = new Date();
    const mondayOffset = (today.getDay() + 6) % 7;
    const monday = new Date(today);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(today.getDate() - mondayOffset);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      const key = toDateKey(date);
      const value = xpData.logs
        .filter((log) => logDateKey(log) === key)
        .reduce((sum, log) => sum + Number(log.xp_amount ?? 0), 0);
      return { key, label: `周${'一二三四五六日'[index]}`, value, today: key === todayKey };
    });
  }, [todayKey, xpData.logs]);

  const weekTotal = weekData.reduce((sum, day) => sum + day.value, 0);
  const weekMax = Math.max(...weekData.map((day) => day.value), 30);
  const visibleRewards = showAllRewards ? xpData.logs : xpData.logs.slice(0, 2);
  const latestReward = xpData.logs[0];
  const gaugeSize = Math.min(Math.max(width - 112, 224), 258);

  const openImageSource = async (source: 'camera' | 'library') => {
    setCaptureMenuOpen(false);
    setActionError('');
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        setActionError(source === 'camera'
          ? '未获得相机权限，请在浏览器或系统设置中允许后重试。'
          : '未获得相册权限，请在浏览器或系统设置中允许后重试。');
        return;
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images' as any, quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images' as any, quality: 0.8 });
      const uri = result.canceled ? '' : result.assets[0]?.uri;
      if (!uri) return;
      setPendingUri(uri);
      router.push('/(app)/thinking-mode?inputType=photo' as any);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '无法打开图片，请稍后重试。');
    }
  };

  const openXpTask = (taskKey: typeof XP_TASKS[number]['key']) => {
    setActionError('');
    if (taskKey === 'dialogue') {
      router.push(`/(app)/scene-detail?sceneId=${recommendedScene.id}` as any);
      return;
    }
    if (taskKey === 'analysis') {
      setCaptureMenuOpen(true);
      return;
    }
    router.push(`/(app)/shadowing?sentence=${encodeURIComponent(recommendedScene.aiOpener)}` as any);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor={COLORS.background} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 12) + 8 }]}
      >
        <View style={styles.pageContent}>
          <View style={styles.header}>
            <Text style={styles.pageTitle}>成长</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="打开设置"
              hitSlop={8}
              onPress={() => router.push('/(app)/settings' as any)}
              style={styles.iconButton}
              className="active:opacity-70"
            >
              <Settings size={23} color={COLORS.muted} />
            </Pressable>
          </View>

          {loading && !stats ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={COLORS.blue} />
              <Text style={styles.loadingText}>正在同步成长记录</Text>
            </View>
          ) : (
            <>
              <View style={styles.levelSection}>
                <View style={styles.gaugeWrap}>
                  <LevelGauge
                    size={gaugeSize}
                    progress={targetProgress}
                    level={curLevel.level}
                    levelName={curLevel.nameCN}
                    totalXp={totalXp}
                    targetXp={targetXp}
                    xpToNext={xpToNext}
                    nextLevel={nextLevel?.level}
                  />
                </View>
                <LevelPath currentLevel={curLevel.level} />
              </View>

              <View style={styles.metricsBand}>
                <Metric icon={Flame} label="连续" value={`${streakDays} 天`} color={COLORS.green} />
                <View style={styles.metricDivider} />
                <Metric icon={BookOpenCheck} label="已完成" value={`${completedCount} / ${ALL_SCENES.length}`} color={COLORS.blue} />
                <View style={styles.metricDivider} />
                <Metric icon={Star} label="今日" value={`+${todayXp} XP`} color={COLORS.amber} />
              </View>

              <RecommendedScene
                scene={recommendedScene}
                onPress={() => router.push(`/(app)/scene-detail?sceneId=${recommendedScene.id}` as any)}
              />

              {actionError ? (
                <View style={styles.actionError} accessibilityRole="alert">
                  <AlertCircle size={18} color="#C2413B" />
                  <Text style={styles.actionErrorText}>{actionError}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="关闭错误提示"
                    hitSlop={8}
                    onPress={() => setActionError('')}
                    style={styles.actionErrorClose}
                  >
                    <X size={17} color="#C2413B" />
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.panel}>
                <View style={styles.sectionHeadingRow}>
                  <View>
                    <Text style={styles.sectionTitle}>升级任务</Text>
                    <Text style={styles.sectionSubtitle}>完成练习即可获得对应经验</Text>
                  </View>
                  {loading ? <ActivityIndicator size="small" color={COLORS.blue} /> : null}
                </View>
                <View style={styles.taskList}>
                  {XP_TASKS.map((task) => {
                    const completedToday = todayLogs.some((log) => String(log.source ?? '').startsWith(task.prefix));
                    const Icon = task.icon;
                    return (
                      <Pressable
                        key={task.key}
                        accessibilityRole="button"
                        accessibilityLabel={`${task.label}，${completedToday ? '今天已完成' : task.actionLabel}`}
                        onPress={() => openXpTask(task.key)}
                        style={({ pressed }) => [styles.taskRow, pressed && styles.taskRowPressed]}
                      >
                        <View style={[styles.taskIcon, { backgroundColor: completedToday ? COLORS.greenSoft : COLORS.blueSoft }]}>
                          {completedToday ? (
                            <Check size={19} color={COLORS.green} strokeWidth={3} />
                          ) : (
                            <Icon size={19} color={COLORS.blue} />
                          )}
                        </View>
                        <View style={styles.taskCopy}>
                          <Text style={styles.taskLabel}>{task.label}</Text>
                          <Text style={[styles.taskActionLabel, completedToday && styles.taskActionLabelDone]}>
                            {completedToday ? '今天已完成，可继续练习' : task.actionLabel}
                          </Text>
                        </View>
                        <Text style={styles.taskReward}>+{task.reward} XP</Text>
                        <ChevronRight size={18} color={COLORS.subtle} />
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.panel}>
                <View style={styles.weekHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>本周经验</Text>
                    <Text style={styles.weekTotal}>{weekTotal} XP</Text>
                  </View>
                  <View style={styles.weekChart}>
                    {weekData.map((day) => {
                      const barHeight = day.value > 0 ? Math.max(8, Math.round((day.value / weekMax) * 52)) : 4;
                      return (
                        <View key={day.key} style={styles.dayColumn}>
                          <Text style={[styles.dayValue, day.today && styles.dayValueToday]}>{day.value}</Text>
                          <View style={styles.barTrack}>
                            <View style={[styles.bar, { height: barHeight }, day.today && styles.barToday]} />
                          </View>
                          <Text style={[styles.dayLabel, day.today && styles.dayLabelToday]}>{day.label}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="查看全部场景"
                  onPress={() => router.push('/(app)/scene-map' as any)}
                  style={styles.sceneProgressRow}
                  className="active:opacity-70"
                >
                  <View>
                    <Text style={styles.sceneProgressTitle}>场景进度</Text>
                    <Text style={styles.sceneProgressCount}>{completedCount} / {ALL_SCENES.length}</Text>
                  </View>
                  <View style={styles.sceneDots}>
                    {ALL_SCENES.map((scene) => {
                      const completed = completedSceneIds.has(scene.id);
                      const started = startedSceneIds.has(scene.id);
                      const recommended = scene.id === recommendedScene.id;
                      return (
                        <View
                          key={scene.id}
                          style={[
                            styles.sceneDot,
                            started && styles.sceneDotStarted,
                            completed && styles.sceneDotCompleted,
                            recommended && !completed && styles.sceneDotRecommended,
                          ]}
                        />
                      );
                    })}
                  </View>
                  <ChevronRight size={19} color={COLORS.subtle} />
                </Pressable>
              </View>

              <View style={styles.panel}>
                <View style={styles.sectionHeadingRow}>
                  <Text style={styles.sectionTitle}>最近奖励</Text>
                  <View style={styles.rewardHeadingActions}>
                    {latestReward ? (
                      <View style={styles.totalXpBadge}>
                        <Zap size={13} color={COLORS.amberDark} />
                        <Text style={styles.totalXpBadgeText}>{totalXp} XP</Text>
                      </View>
                    ) : null}
                    {xpData.logs.length > 2 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={showAllRewards ? '收起奖励记录' : '查看全部奖励记录'}
                        onPress={() => setShowAllRewards((value) => !value)}
                        style={({ pressed }) => [styles.rewardToggle, pressed && styles.taskRowPressed]}
                      >
                        <Text style={styles.rewardToggleText}>{showAllRewards ? '收起' : '全部记录'}</Text>
                        {showAllRewards
                          ? <ChevronUp size={15} color={COLORS.blue} />
                          : <ChevronDown size={15} color={COLORS.blue} />}
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                {visibleRewards.length > 0 ? (
                  <View style={styles.rewardList}>
                    {visibleRewards.map((reward, index) => (
                      <View key={reward.id ?? `${reward.source}-${index}`} style={[styles.rewardRow, index > 0 && styles.rewardRowBorder]}>
                        <View style={styles.rewardIcon}>
                          <Zap size={17} color={COLORS.blue} />
                        </View>
                        <Text style={styles.rewardXp}>+{reward.xp_amount} XP</Text>
                        <Text style={styles.rewardName} numberOfLines={1}>{rewardLabel(String(reward.source ?? ''))}</Text>
                        <Text style={styles.rewardDate}>{rewardDateLabel(reward)}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyRewards}>
                    <Star size={20} color={COLORS.subtle} />
                    <Text style={styles.emptyRewardsText}>完成一次学习任务后，奖励会显示在这里</Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={captureMenuOpen}
        onRequestClose={() => setCaptureMenuOpen(false)}
      >
        <View style={styles.captureModal}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭图片来源选择"
            onPress={() => setCaptureMenuOpen(false)}
            style={styles.captureBackdrop}
          />
          <View style={[styles.captureSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.captureHeader}>
              <View>
                <Text style={styles.captureTitle}>开始场景分析</Text>
                <Text style={styles.captureSubtitle}>选择一张清晰的场景图片</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭"
                hitSlop={8}
                onPress={() => setCaptureMenuOpen(false)}
                style={styles.captureClose}
              >
                <X size={20} color={COLORS.muted} />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="拍照分析"
              onPress={() => void openImageSource('camera')}
              style={({ pressed }) => [styles.captureOption, styles.captureOptionPrimary, pressed && styles.captureOptionPressed]}
            >
              <Camera size={21} color="#FFFFFF" />
              <Text style={styles.captureOptionPrimaryText}>拍照分析</Text>
              <ChevronRight size={18} color="#FFFFFF" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="从相册选择图片"
              onPress={() => void openImageSource('library')}
              style={({ pressed }) => [styles.captureOption, styles.captureOptionSecondary, pressed && styles.captureOptionPressed]}
            >
              <ImageIcon size={21} color={COLORS.blue} />
              <Text style={styles.captureOptionSecondaryText}>从相册选择</Text>
              <ChevronRight size={18} color={COLORS.subtle} />
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 28 },
  pageContent: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 16, gap: 14 },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pageTitle: { color: COLORS.text, fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: 0 },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  loadingState: { minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: COLORS.muted, fontSize: 14, fontWeight: '600' },
  levelSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  gaugeWrap: { alignItems: 'center' },
  gaugeSvg: { position: 'absolute' },
  gaugeContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, gap: 2 },
  levelValue: {
    color: COLORS.blue,
    fontSize: 49,
    lineHeight: 56,
    fontWeight: '900',
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
  levelName: { color: COLORS.text, fontSize: 17, lineHeight: 23, fontWeight: '800' },
  levelXp: { color: '#334155', fontSize: 15, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'] },
  distanceBadge: {
    marginTop: 7,
    minHeight: 31,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: COLORS.amberSoft,
  },
  distanceText: {
    color: COLORS.amberDark,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  levelPath: { marginTop: 17, minHeight: 86, position: 'relative' },
  levelTrack: {
    position: 'absolute',
    top: 18,
    left: '16.66%',
    right: '16.66%',
    height: 3,
    borderRadius: 2,
    backgroundColor: '#DCE3EC',
  },
  levelTrackActive: {
    position: 'absolute',
    top: 18,
    left: '16.66%',
    maxWidth: '66.68%',
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.blue,
  },
  levelSteps: { flexDirection: 'row' },
  levelStep: { flex: 1, alignItems: 'center', zIndex: 1 },
  levelDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF1F6',
    borderWidth: 3,
    borderColor: COLORS.surface,
  },
  levelDotCompleted: { backgroundColor: COLORS.green },
  levelDotCurrent: {
    backgroundColor: COLORS.blue,
    shadowColor: COLORS.blue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 7,
    elevation: 3,
  },
  levelDotText: { color: '#475569', fontSize: 16, fontWeight: '900' },
  levelDotTextCurrent: { color: '#FFFFFF' },
  levelStepTitle: { marginTop: 6, color: '#334155', fontSize: 14, lineHeight: 18, fontWeight: '900' },
  levelStepTitleCurrent: { color: COLORS.blue },
  levelStepStatus: { marginTop: 1, color: COLORS.subtle, fontSize: 11, lineHeight: 15, fontWeight: '600' },
  levelStepStatusCurrent: { color: COLORS.blue },
  metricsBand: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
  },
  metric: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 6,
  },
  metricDivider: { width: 1, height: 42, backgroundColor: COLORS.border },
  metricLabel: { color: COLORS.muted, fontSize: 11, lineHeight: 15, fontWeight: '600' },
  metricValue: { marginTop: 1, fontSize: 16, lineHeight: 21, fontWeight: '900', fontVariant: ['tabular-nums'] },
  recommendedCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },
  sectionTitle: { color: COLORS.text, fontSize: 18, lineHeight: 24, fontWeight: '900', letterSpacing: 0 },
  sectionSubtitle: { marginTop: 2, color: COLORS.muted, fontSize: 12, lineHeight: 17 },
  recommendedBody: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  recommendedImage: { width: 108, minHeight: 132, borderRadius: 8, backgroundColor: COLORS.blueSoft },
  recommendedImageFallback: {
    width: 108,
    minHeight: 132,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.blueSoft,
  },
  recommendedCopy: { flex: 1, minWidth: 0, justifyContent: 'center' },
  recommendedTitle: { color: COLORS.text, fontSize: 18, lineHeight: 24, fontWeight: '900' },
  recommendedMeta: { marginTop: 5, color: COLORS.muted, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  rewardAmount: { color: COLORS.amberDark, fontWeight: '900' },
  primaryButton: {
    minHeight: 42,
    marginTop: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 8,
    backgroundColor: COLORS.blue,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  actionError: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F2B8B3',
    backgroundColor: '#FFF3F2',
  },
  actionErrorText: { flex: 1, color: '#9F2D28', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  actionErrorClose: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  panel: { backgroundColor: COLORS.surface, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, padding: 16 },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  taskList: { marginTop: 11 },
  taskRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#EDF1F5',
  },
  taskRowPressed: { opacity: 0.62 },
  taskIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  taskCopy: { flex: 1, minWidth: 0 },
  taskLabel: { color: '#1E293B', fontSize: 14, lineHeight: 19, fontWeight: '700' },
  taskActionLabel: { marginTop: 1, color: COLORS.blue, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  taskActionLabelDone: { color: COLORS.green },
  taskReward: {
    minWidth: 50,
    textAlign: 'right',
    color: COLORS.amberDark,
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  weekHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  weekTotal: { marginTop: 6, color: COLORS.blue, fontSize: 27, lineHeight: 32, fontWeight: '900', fontVariant: ['tabular-nums'] },
  weekChart: {
    flex: 1,
    minWidth: 0,
    height: 96,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 3,
  },
  dayColumn: { flex: 1, minWidth: 0, alignItems: 'center' },
  dayValue: { height: 16, color: COLORS.muted, fontSize: 9, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dayValueToday: { color: COLORS.blue },
  barTrack: {
    width: '66%',
    height: 54,
    minWidth: 8,
    maxWidth: 20,
    justifyContent: 'flex-end',
    backgroundColor: '#F0F4F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  bar: { width: '100%', backgroundColor: '#A8CBF8', borderRadius: 3 },
  barToday: { backgroundColor: COLORS.blue },
  dayLabel: { marginTop: 4, color: COLORS.subtle, fontSize: 9, lineHeight: 12, fontWeight: '600' },
  dayLabelToday: { color: COLORS.blue, fontWeight: '900' },
  sceneProgressRow: {
    minHeight: 66,
    marginTop: 14,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sceneProgressTitle: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  sceneProgressCount: { marginTop: 2, color: COLORS.muted, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sceneDots: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 5 },
  sceneDot: { width: 13, height: 13, borderRadius: 3, backgroundColor: '#DDE3EA' },
  sceneDotStarted: { backgroundColor: '#9AC4F9' },
  sceneDotCompleted: { backgroundColor: '#34C987' },
  sceneDotRecommended: { backgroundColor: COLORS.amber },
  rewardHeadingActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  totalXpBadge: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: COLORS.amberSoft,
  },
  totalXpBadgeText: { color: COLORS.amberDark, fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  rewardToggle: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: COLORS.blueSoft,
  },
  rewardToggleText: { color: COLORS.blue, fontSize: 11, fontWeight: '800' },
  rewardList: { marginTop: 10 },
  rewardRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 9 },
  rewardRowBorder: { borderTopWidth: 1, borderTopColor: '#EDF1F5' },
  rewardIcon: {
    width: 31,
    height: 31,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.blueSoft,
  },
  rewardXp: { minWidth: 58, color: COLORS.amberDark, fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  rewardName: { flex: 1, minWidth: 0, color: '#334155', fontSize: 13, fontWeight: '600' },
  rewardDate: { color: COLORS.subtle, fontSize: 11, fontWeight: '600' },
  emptyRewards: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyRewardsText: { color: COLORS.muted, fontSize: 12 },
  captureModal: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  captureBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  captureSheet: {
    width: '100%',
    maxWidth: 560,
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 10,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: COLORS.surface,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
  },
  captureHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  captureTitle: { color: COLORS.text, fontSize: 18, lineHeight: 24, fontWeight: '900' },
  captureSubtitle: { marginTop: 2, color: COLORS.muted, fontSize: 12, lineHeight: 17 },
  captureClose: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  captureOption: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  captureOptionPrimary: { backgroundColor: COLORS.blue },
  captureOptionSecondary: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  captureOptionPressed: { opacity: 0.68 },
  captureOptionPrimaryText: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  captureOptionSecondaryText: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '800' },
});

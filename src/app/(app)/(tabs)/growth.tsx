import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  AlertCircle, BookOpenCheck, Camera, Check, ChevronDown, ChevronRight, ChevronUp,
  Crown, Flame, Image as ImageIcon, MapPinned, MessageCircle, Mic2, Play,
  RefreshCw, Settings, Sparkles, Star, Target, TrendingUp, X, Zap,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Modal, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { MotionPressable } from '@/components/motion-pressable';
import { fetchSceneMapProgress, fetchSceneProgress, fetchXpData } from '@/lib/api';
import { setPendingUri } from '@/lib/imageStore';
import { ALL_SCENES, type SceneNode } from '@/lib/sceneMapData';

declare const require: (assetPath: string) => number;

const HOTEL_SCENE_IMAGE = require('../../../../assets/growth-hotel-scene.png');
const GLASS_WEB = Platform.OS === 'web'
  ? ({ backdropFilter: 'blur(22px) saturate(1.45)', WebkitBackdropFilter: 'blur(22px) saturate(1.45)', isolation: 'isolate' } as any)
  : null;

const COLORS = {
  background: '#F4F9FF', surface: 'rgba(255,255,255,0.82)', text: '#0B1525',
  muted: '#60738F', subtle: '#91A1B7', border: 'rgba(183,214,241,0.72)',
  blue: '#137CF4', blueDark: '#075ED8', blueSoft: '#E8F4FF', cyan: '#2CCBFF',
  green: '#18A867', greenSoft: '#E8F9F0', amber: '#FF9F0A',
  amberDark: '#B96400', amberSoft: '#FFF5D9',
};

const LEVELS = [
  { level: 1, nameCN: '英语新手', minXp: 0 }, { level: 2, nameCN: '初级学员', minXp: 100 },
  { level: 3, nameCN: '进阶学员', minXp: 300 }, { level: 4, nameCN: '表达能手', minXp: 600 },
  { level: 5, nameCN: '场景达人', minXp: 1000 }, { level: 6, nameCN: '流利学者', minXp: 1500 },
  { level: 7, nameCN: '英语能手', minXp: 2100 }, { level: 8, nameCN: '思维大师', minXp: 2800 },
  { level: 9, nameCN: '语言达人', minXp: 3600 }, { level: 10, nameCN: '英语领袖', minXp: 5000 },
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
  { key: 'dialogue', label: '场景对话', description: '完成一轮真实情境交流', actionLabel: '去对话', reward: 30, prefix: 'dialogue_scene_', icon: MessageCircle, tint: '#E9F4FF' },
  { key: 'analysis', label: '场景分析', description: '拍下生活场景学习表达', actionLabel: '去拍照', reward: 20, prefix: 'scene_analysis_', icon: Camera, tint: '#ECFAF5' },
  { key: 'shadowing', label: '跟读练习', description: '用一句话练节奏和发音', actionLabel: '去跟读', reward: 25, prefix: 'shadowing_', icon: Mic2, tint: '#FFF5E8' },
] as const;

function calcLevel(totalXp: number) {
  for (let i = LEVELS.length - 1; i >= 0; i -= 1) if (totalXp >= LEVELS[i].minXp) return LEVELS[i];
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

function sceneKeyToId(sceneKey: string) { return sceneKey.replace(/_/g, '-'); }

function getVisibleLevels(currentLevel: number) {
  if (currentLevel <= 1) return LEVELS.slice(0, 3);
  if (currentLevel >= LEVELS.length) return LEVELS.slice(-3);
  return LEVELS.slice(currentLevel - 2, currentLevel + 1);
}

function ProgressRing({ size, progress, level }: { size: number; progress: number; level: number }) {
  const strokeWidth = 11;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeProgress = Math.min(Math.max(progress, 0), 1);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFillObject}>
        <SvgCircle cx={size / 2} cy={size / 2} r={radius} fill="rgba(255,255,255,0.48)" stroke="rgba(157,202,239,0.34)" strokeWidth={strokeWidth} />
        <SvgCircle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={COLORS.blue} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - safeProgress)} rotation={-90} origin={`${size / 2}, ${size / 2}`} />
      </Svg>
      <View style={styles.ringContent}>
        <Crown size={18} color={COLORS.amber} fill="#FFD262" />
        <Text style={styles.ringLevel}>LV.{level}</Text>
        <Text style={styles.ringPercent}>{Math.round(safeProgress * 100)}%</Text>
      </View>
    </View>
  );
}

function LevelPath({ currentLevel }: { currentLevel: number }) {
  return (
    <View style={styles.levelPath}>
      <View style={styles.levelTrack} />
      <View style={styles.levelSteps}>
        {getVisibleLevels(currentLevel).map((item) => {
          const completed = item.level < currentLevel;
          const current = item.level === currentLevel;
          return (
            <View key={item.level} style={styles.levelStep}>
              <View style={[styles.levelDot, completed && styles.levelDotCompleted, current && styles.levelDotCurrent]}>
                {completed ? <Check size={17} color="#FFFFFF" strokeWidth={3} /> : <Text style={[styles.levelDotText, current && styles.levelDotTextCurrent]}>{item.level}</Text>}
              </View>
              <Text style={[styles.levelStepTitle, current && styles.levelStepTitleCurrent]}>LV.{item.level}</Text>
              <Text style={styles.levelStepStatus}>{completed ? '已完成' : current ? '当前' : item.nameCN}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Metric({ icon: Icon, label, value, color, onPress }: { icon: any; label: string; value: string; color: string; onPress: () => void }) {
  return (
    <MotionPressable onPress={onPress} pressedScale={0.96} hoverLift={2} style={styles.metric} accessibilityRole="button" accessibilityLabel={`${label}，${value}`}>
      <View style={[styles.metricIcon, { backgroundColor: `${color}14` }]}><Icon size={18} color={color} strokeWidth={2.4} /></View>
      <Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text>
    </MotionPressable>
  );
}

function RecommendedScene({ scene, onPress }: { scene: SceneNode; onPress: () => void }) {
  const remoteImage = SCENE_IMAGES[scene.id];
  const imageSource = scene.id === 'hotel' ? HOTEL_SCENE_IMAGE : remoteImage ? { uri: remoteImage } : null;
  return (
    <MotionPressable onPress={onPress} hoverTilt={1.3} hoverLift={3} pressedScale={0.985} style={styles.recommendedCard} accessibilityRole="button" accessibilityLabel={`继续${scene.nameZh}场景练习`}>
      {imageSource ? <Image source={imageSource} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={180} /> : <View style={styles.recommendedImageFallback}><MapPinned size={44} color={COLORS.blue} /></View>}
      <LinearGradient colors={['rgba(8,18,33,0.08)', 'rgba(8,18,33,0.42)', 'rgba(6,16,30,0.9)']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFillObject} />
      <View style={styles.recommendedShine} />
      <View style={styles.recommendedTopRow}>
        <View style={styles.nextBadge}><Sparkles size={13} color="#FFFFFF" /><Text style={styles.nextBadgeText}>今日推荐</Text></View>
        <View style={styles.rewardGlass}><Zap size={14} color="#FFE27A" fill="#FFE27A" /><Text style={styles.rewardGlassText}>+30 XP</Text></View>
      </View>
      <View style={styles.recommendedCopy}>
        <Text style={styles.recommendedEyebrow}>{scene.nameEn.toUpperCase()} · 约 5 分钟</Text>
        <Text style={styles.recommendedTitle}>完成{scene.nameZh}场景练习</Text>
        <Text style={styles.recommendedDescription} numberOfLines={2}>{scene.description}</Text>
        <View style={styles.recommendedActionRow}><View style={styles.playOrb}><Play size={18} color="#FFFFFF" fill="#FFFFFF" /></View><Text style={styles.recommendedActionText}>继续学习</Text><ChevronRight size={18} color="#FFFFFF" /></View>
      </View>
    </MotionPressable>
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
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [captureMenuOpen, setCaptureMenuOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const [showAllRewards, setShowAllRewards] = useState(false);
  const [showLevelPath, setShowLevelPath] = useState(false);
  const [selectedWeekKey, setSelectedWeekKey] = useState('');

  const loadData = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setLoadError('');
    try {
      const [xp, sceneRows, dialogueRows] = await Promise.all([fetchXpData(), fetchSceneProgress(), fetchSceneMapProgress()]);
      const dialogueMap: Record<string, string> = {};
      (dialogueRows ?? []).forEach((row: any) => { dialogueMap[row.scene_id] = row.status; });
      setXpData(xp); setSceneProgress(sceneRows ?? []); setDialogueProgress(dialogueMap);
    } catch { setLoadError('成长记录暂时没有同步成功，请稍后重试。'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { void loadData(false); }, [loadData]));

  const stats = xpData.stats;
  const totalXp = Number(stats?.total_xp ?? 0);
  const streakDays = Number(stats?.streak_days ?? 0);
  const curLevel = calcLevel(totalXp);
  const nextLevel = LEVELS.find((level) => level.level === curLevel.level + 1);
  const targetXp = nextLevel?.minXp ?? curLevel.minXp;
  const xpToNext = nextLevel ? Math.max(nextLevel.minXp - totalXp, 0) : 0;
  const levelSpan = nextLevel ? Math.max(nextLevel.minXp - curLevel.minXp, 1) : 1;
  const levelProgress = nextLevel ? (totalXp - curLevel.minXp) / levelSpan : 1;

  const completedSceneIds = useMemo(() => new Set(Object.entries(dialogueProgress).filter(([, status]) => status === 'completed').map(([sceneId]) => sceneId)), [dialogueProgress]);
  const startedSceneIds = useMemo(() => {
    const started = new Set<string>();
    sceneProgress.forEach((row) => { if ((row.visit_count ?? 0) > 0 || row.is_unlocked) started.add(sceneKeyToId(String(row.scene_key ?? ''))); });
    Object.entries(dialogueProgress).forEach(([sceneId, status]) => { if (status === 'in_progress' || status === 'completed') started.add(sceneId); });
    return started;
  }, [dialogueProgress, sceneProgress]);
  const completedCount = ALL_SCENES.filter((scene) => completedSceneIds.has(scene.id)).length;
  const recommendedScene = ALL_SCENES.find((scene) => !completedSceneIds.has(scene.id) && !startedSceneIds.has(scene.id)) ?? ALL_SCENES.find((scene) => !completedSceneIds.has(scene.id)) ?? ALL_SCENES[0];
  const todayKey = toDateKey(new Date());
  const todayLogs = xpData.logs.filter((log) => logDateKey(log) === todayKey);
  const todayXp = todayLogs.reduce((sum, log) => sum + Number(log.xp_amount ?? 0), 0);
  const completedTasks = XP_TASKS.filter((task) => todayLogs.some((log) => String(log.source ?? '').startsWith(task.prefix))).length;
  const weekData = useMemo(() => {
    const today = new Date(); const mondayOffset = (today.getDay() + 6) % 7; const monday = new Date(today);
    monday.setHours(0, 0, 0, 0); monday.setDate(today.getDate() - mondayOffset);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday); date.setDate(monday.getDate() + index); const key = toDateKey(date);
      const value = xpData.logs.filter((log) => logDateKey(log) === key).reduce((sum, log) => sum + Number(log.xp_amount ?? 0), 0);
      return { key, label: `周${'一二三四五六日'[index]}`, value, today: key === todayKey };
    });
  }, [todayKey, xpData.logs]);
  const weekTotal = weekData.reduce((sum, day) => sum + day.value, 0);
  const weekMax = Math.max(...weekData.map((day) => day.value), 30);
  const selectedDay = weekData.find((day) => day.key === selectedWeekKey) ?? weekData.find((day) => day.today) ?? weekData[0];
  const visibleRewards = showAllRewards ? xpData.logs : xpData.logs.slice(0, 3);
  const ringSize = width < 390 ? 122 : 136;

  const openImageSource = async (source: 'camera' | 'library') => {
    setCaptureMenuOpen(false); setActionError('');
    try {
      const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') { setActionError(source === 'camera' ? '未获得相机权限，请在浏览器或系统设置中允许后重试。' : '未获得相册权限，请在浏览器或系统设置中允许后重试。'); return; }
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images' as any, quality: 0.8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images' as any, quality: 0.8 });
      const uri = result.canceled ? '' : result.assets[0]?.uri; if (!uri) return;
      setPendingUri(uri); router.push('/(app)/thinking-mode?inputType=photo' as any);
    } catch (error) { setActionError(error instanceof Error ? error.message : '无法打开图片，请稍后重试。'); }
  };

  const openXpTask = (taskKey: typeof XP_TASKS[number]['key']) => {
    setActionError('');
    if (taskKey === 'dialogue') return router.push(`/(app)/scene-detail?sceneId=${recommendedScene.id}` as any);
    if (taskKey === 'analysis') return setCaptureMenuOpen(true);
    router.push(`/(app)/shadowing?sentence=${encodeURIComponent(recommendedScene.aiOpener)}` as any);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor={COLORS.background} />
      <View pointerEvents="none" style={styles.ambientOne} /><View pointerEvents="none" style={styles.ambientTwo} />
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadData(true)} tintColor={COLORS.blue} colors={[COLORS.blue]} />} contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <View style={styles.pageContent}>
          <View style={styles.header}>
            <View><Text style={styles.headerEyebrow}>YOUR PROGRESS</Text><Text style={styles.pageTitle}>成长</Text></View>
            <View style={styles.headerActions}>
              <MotionPressable accessibilityRole="button" accessibilityLabel="刷新成长记录" onPress={() => void loadData(true)} haptic={false} style={styles.iconButton} pressedScale={0.92}>{refreshing ? <ActivityIndicator size="small" color={COLORS.blue} /> : <RefreshCw size={20} color={COLORS.blue} />}</MotionPressable>
              <MotionPressable accessibilityRole="button" accessibilityLabel="打开设置" onPress={() => router.push('/(app)/settings' as any)} style={styles.iconButton} pressedScale={0.92}><Settings size={21} color={COLORS.text} /></MotionPressable>
            </View>
          </View>

          {loading && !stats ? <View style={styles.loadingState}><ActivityIndicator size="large" color={COLORS.blue} /><Text style={styles.loadingText}>正在同步成长记录</Text></View> : <>
            <MotionPressable onPress={() => setShowLevelPath((value) => !value)} hoverTilt={0.8} hoverLift={2} pressedScale={0.99} style={styles.levelCard} accessibilityRole="button" accessibilityLabel={showLevelPath ? '收起等级路径' : '查看等级路径'}>
              <LinearGradient colors={['rgba(255,255,255,0.94)', 'rgba(224,243,255,0.8)', 'rgba(247,251,255,0.9)']} locations={[0, 0.58, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} /><View pointerEvents="none" style={styles.cardShine} />
              <View style={styles.levelCardMain}><ProgressRing size={ringSize} progress={levelProgress} level={curLevel.level} /><View style={styles.levelSummary}>
                <View style={styles.levelTitleRow}><Text style={styles.levelName}>{curLevel.nameCN}</Text><View style={styles.liveBadge}><Text style={styles.liveBadgeText}>成长中</Text></View></View>
                <Text style={styles.levelHeadline}>{nextLevel ? `再获得 ${xpToNext} XP` : '已达最高等级'}</Text><Text style={styles.levelCaption}>{nextLevel ? `即可升级为 LV.${nextLevel.level} ${nextLevel.nameCN}` : '继续保持你的学习节奏'}</Text>
                <View style={styles.levelProgressTrack}><LinearGradient colors={[COLORS.cyan, COLORS.blue, COLORS.blueDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.levelProgressFill, { width: `${Math.min(Math.max(levelProgress, 0), 1) * 100}%` }]} /></View>
                <View style={styles.levelXpRow}><Text style={styles.levelXp}>{totalXp} XP</Text><Text style={styles.levelXpTarget}>{targetXp} XP</Text></View>
              </View></View>
              <View style={styles.levelExpandRow}><TrendingUp size={15} color={COLORS.blue} /><Text style={styles.levelExpandText}>{showLevelPath ? '收起等级路径' : '查看等级路径'}</Text>{showLevelPath ? <ChevronUp size={16} color={COLORS.blue} /> : <ChevronDown size={16} color={COLORS.blue} />}</View>
              {showLevelPath ? <LevelPath currentLevel={curLevel.level} /> : null}
            </MotionPressable>

            <View style={styles.metricsBand}>
              <Metric icon={Flame} label="连续学习" value={`${streakDays} 天`} color={COLORS.green} onPress={() => setShowAllRewards(true)} />
              <Metric icon={BookOpenCheck} label="完成场景" value={`${completedCount}/${ALL_SCENES.length}`} color={COLORS.blue} onPress={() => router.push('/(app)/scene-map' as any)} />
              <Metric icon={Star} label="今日获得" value={`+${todayXp} XP`} color={COLORS.amber} onPress={() => setShowAllRewards(true)} />
            </View>

            <RecommendedScene scene={recommendedScene} onPress={() => router.push(`/(app)/scene-detail?sceneId=${recommendedScene.id}` as any)} />

            {(actionError || loadError) ? <View style={styles.actionError} accessibilityRole="alert"><AlertCircle size={18} color="#C2413B" /><Text style={styles.actionErrorText}>{actionError || loadError}</Text><Pressable onPress={() => { setActionError(''); setLoadError(''); }} style={styles.actionErrorClose}><X size={17} color="#C2413B" /></Pressable></View> : null}

            <View style={styles.panel}>
              <View style={styles.sectionHeadingRow}><View><Text style={styles.sectionTitle}>今日升级任务</Text><Text style={styles.sectionSubtitle}>完成 {completedTasks}/3 · 每项奖励都计入真实经验</Text></View><View style={styles.completionBadge}><Target size={14} color={COLORS.green} /><Text style={styles.completionBadgeText}>{Math.round((completedTasks / XP_TASKS.length) * 100)}%</Text></View></View>
              <View style={styles.taskList}>{XP_TASKS.map((task) => {
                const completedToday = todayLogs.some((log) => String(log.source ?? '').startsWith(task.prefix)); const Icon = task.icon;
                return <MotionPressable key={task.key} onPress={() => openXpTask(task.key)} hoverLift={2} pressedScale={0.975} style={[styles.taskRow, { backgroundColor: task.tint }]} accessibilityRole="button" accessibilityLabel={`${task.label}，${completedToday ? '今天已完成' : task.actionLabel}`}>
                  <View style={[styles.taskIcon, completedToday && styles.taskIconDone]}>{completedToday ? <Check size={20} color="#FFFFFF" strokeWidth={3} /> : <Icon size={20} color={COLORS.blue} />}</View>
                  <View style={styles.taskCopy}><Text style={styles.taskLabel}>{task.label}</Text><Text style={styles.taskDescription}>{completedToday ? '今天已完成，还可以继续练习' : task.description}</Text></View>
                  <View style={styles.taskReward}><Zap size={12} color={COLORS.amberDark} fill="#FFC54D" /><Text style={styles.taskRewardText}>+{task.reward}</Text></View><ChevronRight size={18} color={COLORS.muted} />
                </MotionPressable>;
              })}</View>
            </View>

            <View style={styles.panel}>
              <View style={styles.weekTitleRow}><View><Text style={styles.sectionTitle}>本周节奏</Text><Text style={styles.sectionSubtitle}>点选日期查看当天经验</Text></View><View style={styles.weekTotalBlock}><Text style={styles.weekTotal}>{weekTotal}</Text><Text style={styles.weekTotalUnit}>XP 本周</Text></View></View>
              <View style={styles.selectedDayReadout}><Text style={styles.selectedDayLabel}>{selectedDay?.today ? '今天' : selectedDay?.label}</Text><Text style={styles.selectedDayValue}>{selectedDay?.value ?? 0} XP</Text></View>
              <View style={styles.weekChart}>{weekData.map((day) => {
                const selected = day.key === selectedDay?.key; const barHeight = day.value > 0 ? Math.max(12, Math.round((day.value / weekMax) * 70)) : 6;
                return <MotionPressable key={day.key} onPress={() => setSelectedWeekKey(day.key)} haptic={false} pressedScale={0.9} style={styles.dayColumn} accessibilityRole="button" accessibilityLabel={`${day.label}，${day.value}经验`}>
                  <View style={[styles.barTrack, selected && styles.barTrackSelected]}><LinearGradient colors={selected ? [COLORS.cyan, COLORS.blueDark] : ['#B9D9F8', '#78AEEA']} style={[styles.bar, { height: barHeight }]} /></View><Text style={[styles.dayLabel, (day.today || selected) && styles.dayLabelToday]}>{day.label.replace('周', '')}</Text>{day.today ? <View style={styles.todayDot} /> : <View style={styles.todayDotPlaceholder} />}
                </MotionPressable>;
              })}</View>
            </View>

            <MotionPressable onPress={() => router.push('/(app)/scene-map' as any)} hoverLift={2} pressedScale={0.985} style={styles.sceneProgressCard} accessibilityRole="button" accessibilityLabel="查看场景成长地图">
              <LinearGradient colors={['rgba(232,250,242,0.92)', 'rgba(235,246,255,0.9)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
              <View style={styles.sceneProgressHeader}><View style={styles.sceneMapIcon}><MapPinned size={22} color={COLORS.green} /></View><View style={styles.sceneProgressCopy}><Text style={styles.sectionTitle}>场景成长地图</Text><Text style={styles.sectionSubtitle}>已探索 {startedSceneIds.size} 个，完成 {completedCount} 个</Text></View><ChevronRight size={20} color={COLORS.muted} /></View>
              <View style={styles.sceneProgressTrack}><View style={[styles.sceneProgressFill, { width: `${(completedCount / Math.max(ALL_SCENES.length, 1)) * 100}%` }]} /></View>
              <View style={styles.sceneDots}>{ALL_SCENES.map((scene) => { const completed = completedSceneIds.has(scene.id); const started = startedSceneIds.has(scene.id); const recommended = scene.id === recommendedScene.id; return <View key={scene.id} style={[styles.sceneDot, started && styles.sceneDotStarted, completed && styles.sceneDotCompleted, recommended && !completed && styles.sceneDotRecommended]} />; })}</View>
            </MotionPressable>

            <View style={styles.panel}>
              <View style={styles.sectionHeadingRow}><View><Text style={styles.sectionTitle}>经验记录</Text><Text style={styles.sectionSubtitle}>每一次练习都算数</Text></View><View style={styles.rewardHeadingActions}><View style={styles.totalXpBadge}><Zap size={13} color={COLORS.amberDark} /><Text style={styles.totalXpBadgeText}>{totalXp} XP</Text></View>{xpData.logs.length > 3 ? <MotionPressable onPress={() => setShowAllRewards((value) => !value)} haptic={false} style={styles.rewardToggle} pressedScale={0.94}><Text style={styles.rewardToggleText}>{showAllRewards ? '收起' : '全部'}</Text>{showAllRewards ? <ChevronUp size={15} color={COLORS.blue} /> : <ChevronDown size={15} color={COLORS.blue} />}</MotionPressable> : null}</View></View>
              {visibleRewards.length > 0 ? <View style={styles.rewardList}>{visibleRewards.map((reward, index) => <View key={reward.id ?? `${reward.source}-${index}`} style={[styles.rewardRow, index > 0 && styles.rewardRowBorder]}><View style={styles.rewardIcon}><Zap size={16} color={COLORS.blue} fill="#8CC8FF" /></View><View style={styles.rewardCopy}><Text style={styles.rewardName} numberOfLines={1}>{rewardLabel(String(reward.source ?? ''))}</Text><Text style={styles.rewardDate}>{rewardDateLabel(reward)}</Text></View><Text style={styles.rewardXp}>+{reward.xp_amount} XP</Text></View>)}</View> : <View style={styles.emptyRewards}><Star size={20} color={COLORS.subtle} /><Text style={styles.emptyRewardsText}>完成一次学习任务后，奖励会显示在这里</Text></View>}
            </View>
          </>}
        </View>
      </ScrollView>

      <Modal animationType="fade" transparent visible={captureMenuOpen} onRequestClose={() => setCaptureMenuOpen(false)}>
        <View style={styles.captureModal}><Pressable accessibilityRole="button" accessibilityLabel="关闭图片来源选择" onPress={() => setCaptureMenuOpen(false)} style={styles.captureBackdrop} /><View style={[styles.captureSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.captureHandle} /><View style={styles.captureHeader}><View><Text style={styles.captureTitle}>开始场景分析</Text><Text style={styles.captureSubtitle}>选择一张清晰的场景图片</Text></View><MotionPressable accessibilityRole="button" accessibilityLabel="关闭场景分析" onPress={() => setCaptureMenuOpen(false)} style={styles.captureClose} pressedScale={0.9}><X size={20} color={COLORS.muted} /></MotionPressable></View>
          <MotionPressable accessibilityRole="button" accessibilityLabel="拍照分析" onPress={() => void openImageSource('camera')} style={[styles.captureOption, styles.captureOptionPrimary]} pressedScale={0.98}><Camera size={21} color="#FFFFFF" /><Text style={styles.captureOptionPrimaryText}>拍照分析</Text><ChevronRight size={18} color="#FFFFFF" /></MotionPressable>
          <MotionPressable accessibilityRole="button" accessibilityLabel="从相册选择" onPress={() => void openImageSource('library')} style={[styles.captureOption, styles.captureOptionSecondary]} pressedScale={0.98}><ImageIcon size={21} color={COLORS.blue} /><Text style={styles.captureOptionSecondaryText}>从相册选择</Text><ChevronRight size={18} color={COLORS.subtle} /></MotionPressable>
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  ambientOne: { position: 'absolute', width: 300, height: 300, borderRadius: 150, top: -120, right: -100, backgroundColor: 'rgba(94,193,255,0.14)' },
  ambientTwo: { position: 'absolute', width: 260, height: 260, borderRadius: 130, top: 520, left: -150, backgroundColor: 'rgba(64,205,158,0.1)' },
  scrollContent: { paddingBottom: 34 },
  pageContent: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 16, gap: 14 },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerEyebrow: { color: COLORS.blue, fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1.4 },
  pageTitle: { color: COLORS.text, fontSize: 31, lineHeight: 36, fontWeight: '900', letterSpacing: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(190,217,239,0.78)', shadowColor: '#4B83B7', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 13, elevation: 3, ...GLASS_WEB },
  loadingState: { minHeight: 460, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: COLORS.muted, fontSize: 14, fontWeight: '700' },
  levelCard: { overflow: 'hidden', borderRadius: 26, borderWidth: 1.2, borderColor: 'rgba(173,215,245,0.84)', padding: 16, shadowColor: '#2D6EAA', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 26, elevation: 6, ...GLASS_WEB },
  cardShine: { position: 'absolute', left: 24, right: 24, top: 2, height: 2, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.95)' },
  levelCardMain: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ringContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1 },
  ringLevel: { color: COLORS.text, fontSize: 27, lineHeight: 31, fontWeight: '900', fontVariant: ['tabular-nums'] },
  ringPercent: { color: COLORS.blue, fontSize: 11, lineHeight: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  levelSummary: { flex: 1, minWidth: 0 },
  levelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  levelName: { color: COLORS.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  liveBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: COLORS.greenSoft },
  liveBadgeText: { color: COLORS.green, fontSize: 9, lineHeight: 12, fontWeight: '900' },
  levelHeadline: { marginTop: 7, color: COLORS.blueDark, fontSize: 23, lineHeight: 29, fontWeight: '900', fontVariant: ['tabular-nums'] },
  levelCaption: { marginTop: 2, color: COLORS.muted, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  levelProgressTrack: { height: 8, marginTop: 13, borderRadius: 99, overflow: 'hidden', backgroundColor: 'rgba(157,190,221,0.24)' },
  levelProgressFill: { height: '100%', borderRadius: 99 },
  levelXpRow: { marginTop: 5, flexDirection: 'row', justifyContent: 'space-between' },
  levelXp: { color: COLORS.blueDark, fontSize: 10, fontWeight: '900', fontVariant: ['tabular-nums'] },
  levelXpTarget: { color: COLORS.subtle, fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] },
  levelExpandRow: { marginTop: 12, paddingTop: 11, borderTopWidth: 1, borderTopColor: 'rgba(160,198,229,0.35)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  levelExpandText: { color: COLORS.blue, fontSize: 11, fontWeight: '900' },
  levelPath: { marginTop: 13, minHeight: 73, position: 'relative' },
  levelTrack: { position: 'absolute', top: 16, left: '16.66%', right: '16.66%', height: 3, borderRadius: 2, backgroundColor: '#D5E5F3' },
  levelSteps: { flexDirection: 'row' },
  levelStep: { flex: 1, alignItems: 'center', zIndex: 1 },
  levelDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5EEF6', borderWidth: 3, borderColor: 'rgba(255,255,255,0.96)' },
  levelDotCompleted: { backgroundColor: COLORS.green },
  levelDotCurrent: { backgroundColor: COLORS.blue, shadowColor: COLORS.blue, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 3 },
  levelDotText: { color: COLORS.muted, fontSize: 14, fontWeight: '900' },
  levelDotTextCurrent: { color: '#FFFFFF' },
  levelStepTitle: { marginTop: 5, color: COLORS.muted, fontSize: 11, lineHeight: 15, fontWeight: '900' },
  levelStepTitleCurrent: { color: COLORS.blue },
  levelStepStatus: { color: COLORS.subtle, fontSize: 9, lineHeight: 12, fontWeight: '600' },
  metricsBand: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, minWidth: 0, minHeight: 88, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: COLORS.border, shadowColor: '#326B9E', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 2, ...GLASS_WEB },
  metricIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  metricValue: { marginTop: 4, fontSize: 15, lineHeight: 19, fontWeight: '900', fontVariant: ['tabular-nums'] },
  metricLabel: { marginTop: 1, color: COLORS.muted, fontSize: 9, lineHeight: 12, fontWeight: '700' },
  recommendedCard: { height: 238, overflow: 'hidden', borderRadius: 26, borderWidth: 1.2, borderColor: 'rgba(255,255,255,0.88)', backgroundColor: COLORS.blueSoft, shadowColor: '#244C78', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.24, shadowRadius: 25, elevation: 7 },
  recommendedImageFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.blueSoft },
  recommendedShine: { position: 'absolute', left: 22, right: 22, top: 3, height: 2, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.86)' },
  recommendedTopRow: { position: 'absolute', left: 15, right: 15, top: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nextBadge: { height: 30, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, borderRadius: 15, backgroundColor: 'rgba(9,29,52,0.52)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', ...GLASS_WEB },
  nextBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  rewardGlass: { height: 30, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRadius: 15, backgroundColor: 'rgba(9,29,52,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', ...GLASS_WEB },
  rewardGlassText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  recommendedCopy: { position: 'absolute', left: 18, right: 18, bottom: 17 },
  recommendedEyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 9, lineHeight: 13, fontWeight: '900', letterSpacing: 1.1 },
  recommendedTitle: { marginTop: 3, color: '#FFFFFF', fontSize: 24, lineHeight: 30, fontWeight: '900' },
  recommendedDescription: { marginTop: 3, maxWidth: '82%', color: 'rgba(255,255,255,0.8)', fontSize: 11, lineHeight: 16, fontWeight: '600' },
  recommendedActionRow: { alignSelf: 'flex-start', marginTop: 12, height: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingRight: 13, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.54)', ...GLASS_WEB },
  playOrb: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.blue },
  recommendedActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  actionError: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: '#F2B8B3', backgroundColor: '#FFF3F2' },
  actionErrorText: { flex: 1, color: '#9F2D28', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  actionErrorClose: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  panel: { overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.76)', borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, padding: 15, shadowColor: '#326B9E', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 3, ...GLASS_WEB },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: COLORS.text, fontSize: 17, lineHeight: 22, fontWeight: '900', letterSpacing: 0 },
  sectionSubtitle: { marginTop: 2, color: COLORS.muted, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  completionBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 99, backgroundColor: COLORS.greenSoft },
  completionBadgeText: { color: COLORS.green, fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  taskList: { marginTop: 12, gap: 8 },
  taskRow: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  taskIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.76)', borderWidth: 1, borderColor: 'rgba(172,209,238,0.56)' },
  taskIconDone: { backgroundColor: COLORS.green, borderColor: '#62D5A1' },
  taskCopy: { flex: 1, minWidth: 0 },
  taskLabel: { color: COLORS.text, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  taskDescription: { marginTop: 1, color: COLORS.muted, fontSize: 9.5, lineHeight: 14, fontWeight: '600' },
  taskReward: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  taskRewardText: { color: COLORS.amberDark, fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  weekTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  weekTotalBlock: { alignItems: 'flex-end' },
  weekTotal: { color: COLORS.blue, fontSize: 26, lineHeight: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  weekTotalUnit: { color: COLORS.muted, fontSize: 9, lineHeight: 13, fontWeight: '700' },
  selectedDayReadout: { marginTop: 13, marginBottom: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectedDayLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  selectedDayValue: { color: COLORS.blueDark, fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  weekChart: { height: 103, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 5 },
  dayColumn: { flex: 1, minWidth: 0, alignItems: 'center' },
  barTrack: { width: '58%', minWidth: 14, maxWidth: 24, height: 74, justifyContent: 'flex-end', borderRadius: 9, overflow: 'hidden', backgroundColor: 'rgba(191,216,239,0.3)', borderWidth: 1, borderColor: 'rgba(187,214,237,0.42)' },
  barTrackSelected: { borderColor: 'rgba(25,126,244,0.58)', backgroundColor: 'rgba(210,234,255,0.58)' },
  bar: { width: '100%', borderRadius: 8 },
  dayLabel: { marginTop: 5, color: COLORS.subtle, fontSize: 9, lineHeight: 12, fontWeight: '800' },
  dayLabelToday: { color: COLORS.blue, fontWeight: '900' },
  todayDot: { width: 4, height: 4, marginTop: 2, borderRadius: 2, backgroundColor: COLORS.blue },
  todayDotPlaceholder: { width: 4, height: 4, marginTop: 2 },
  sceneProgressCard: { overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(159,220,196,0.72)', padding: 15, shadowColor: '#267455', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 3, ...GLASS_WEB },
  sceneProgressHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sceneMapIcon: { width: 41, height: 41, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.72)' },
  sceneProgressCopy: { flex: 1, minWidth: 0 },
  sceneProgressTrack: { height: 7, marginTop: 15, overflow: 'hidden', borderRadius: 99, backgroundColor: 'rgba(92,160,135,0.16)' },
  sceneProgressFill: { height: '100%', borderRadius: 99, backgroundColor: COLORS.green },
  sceneDots: { marginTop: 11, flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  sceneDot: { flex: 1, height: 8, maxWidth: 30, borderRadius: 4, backgroundColor: 'rgba(143,166,184,0.28)' },
  sceneDotStarted: { backgroundColor: '#9BC9F4' },
  sceneDotCompleted: { backgroundColor: '#35C884' },
  sceneDotRecommended: { backgroundColor: COLORS.amber },
  rewardHeadingActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  totalXpBadge: { minHeight: 29, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, borderRadius: 99, backgroundColor: COLORS.amberSoft },
  totalXpBadgeText: { color: COLORS.amberDark, fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  rewardToggle: { minHeight: 29, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 9, borderRadius: 99, backgroundColor: COLORS.blueSoft },
  rewardToggleText: { color: COLORS.blue, fontSize: 10, fontWeight: '900' },
  rewardList: { marginTop: 10 },
  rewardRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rewardRowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(184,207,228,0.38)' },
  rewardIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.blueSoft },
  rewardCopy: { flex: 1, minWidth: 0 },
  rewardName: { color: COLORS.text, fontSize: 12, fontWeight: '800' },
  rewardDate: { marginTop: 2, color: COLORS.subtle, fontSize: 9, fontWeight: '700' },
  rewardXp: { color: COLORS.blueDark, fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  emptyRewards: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyRewardsText: { color: COLORS.muted, fontSize: 11 },
  captureModal: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  captureBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,18,33,0.48)' },
  captureSheet: { width: '100%', maxWidth: 620, paddingHorizontal: 18, paddingTop: 9, gap: 10, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: 'rgba(248,252,255,0.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.86)', shadowColor: '#0F355F', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.18, shadowRadius: 30, elevation: 14, ...GLASS_WEB },
  captureHandle: { alignSelf: 'center', width: 42, height: 5, marginBottom: 4, borderRadius: 3, backgroundColor: '#C9D8E6' },
  captureHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 2 },
  captureTitle: { color: COLORS.text, fontSize: 19, lineHeight: 24, fontWeight: '900' },
  captureSubtitle: { marginTop: 2, color: COLORS.muted, fontSize: 11, lineHeight: 16 },
  captureClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#EAF2F8' },
  captureOption: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderRadius: 18, overflow: 'hidden' },
  captureOptionPrimary: { backgroundColor: COLORS.blue },
  captureOptionSecondary: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: 'rgba(255,255,255,0.78)' },
  captureOptionPrimaryText: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  captureOptionSecondaryText: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '800' },
});

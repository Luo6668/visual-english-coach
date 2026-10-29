import { useAudioPlayer } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock3,
  Coffee,
  Dumbbell,
  FileText,
  GraduationCap,
  MapPin,
  Plane,
  RefreshCw,
  ShoppingBasket,
  Sparkles,
  TrainFront,
  Trash2,
  Trees,
  Utensils,
  Volume2,
  X,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotionPressable } from '@/components/motion-pressable';
import { deleteDiary, fetchDiaries, fetchLearningRecords, invokeEdgeFunction, saveDiary } from '@/lib/api';
import { speakWithTTS, stopLocalSpeech } from '@/lib/speech';
import { formatLocalDate } from '@/lib/utils';

const COLORS = {
  background: '#F2F8FC',
  text: '#0C1B2A',
  muted: '#61758A',
  subtle: '#8EA0B2',
  blue: '#1684F8',
  blueDark: '#0754C7',
  cyan: '#42D7F4',
  mint: '#35B987',
  gold: '#E9A51A',
  coral: '#E45E59',
  white: '#FFFFFF',
  line: 'rgba(122,177,219,0.27)',
};

const GLASS_WEB = Platform.OS === 'web'
  ? ({ backdropFilter: 'blur(22px) saturate(145%)', WebkitBackdropFilter: 'blur(22px) saturate(145%)' } as any)
  : {};

interface DiaryEntry {
  id: string;
  diary_type: 'daily' | 'weekly';
  content: string;
  study_date?: string;
  week_start?: string;
  created_at: string;
}

interface LearningRecord {
  id: string;
  scene_name: string;
  i_see?: string;
  i_think?: string;
  i_say?: string;
  created_at: string;
}

function parseDate(value: string): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T12:00:00` : value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatDate(value: string) {
  return parseDate(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getWeekStart(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

function weekRange(value: string) {
  const start = parseDate(value);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const label = (date: Date) => date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  return `${label(start)} - ${label(end)}`;
}

function sceneVisual(name: string) {
  if (name.includes('咖啡')) return { icon: Coffee, color: '#9E641C', tint: '#FFF3DB' };
  if (name.includes('图书')) return { icon: BookOpen, color: '#7357DB', tint: '#F0ECFF' };
  if (name.includes('地铁')) return { icon: TrainFront, color: '#1684F8', tint: '#E8F4FF' };
  if (name.includes('机场')) return { icon: Plane, color: '#1478D4', tint: '#E5F4FF' };
  if (name.includes('超市')) return { icon: ShoppingBasket, color: '#D98212', tint: '#FFF2DD' };
  if (name.includes('餐厅')) return { icon: Utensils, color: '#E05D50', tint: '#FFF0ED' };
  if (name.includes('办公室')) return { icon: BriefcaseBusiness, color: '#66758C', tint: '#EEF2F7' };
  if (name.includes('学校')) return { icon: GraduationCap, color: '#7157D9', tint: '#F1EDFF' };
  if (name.includes('公园')) return { icon: Trees, color: '#2CA471', tint: '#E7F8F0' };
  if (name.includes('健身')) return { icon: Dumbbell, color: '#E05D50', tint: '#FFF0ED' };
  return { icon: MapPin, color: COLORS.blue, tint: '#EAF5FF' };
}

function diaryPreview(content: string) {
  const sentences = content.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 2) return { preview: sentences.slice(0, 2).join(' '), hasMore: true };
  if (content.length > 260) return { preview: `${content.slice(0, 260).trim()}...`, hasMore: true };
  return { preview: content, hasMore: false };
}

export default function DiaryScreen() {
  const router = useRouter();
  const player = useAudioPlayer();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>('daily');
  const [todayRecords, setTodayRecords] = useState<LearningRecord[]>([]);
  const [weekRecords, setWeekRecords] = useState<LearningRecord[]>([]);
  const [diaries, setDiaries] = useState<DiaryEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DiaryEntry | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const [records, savedDiaries] = await Promise.all([fetchLearningRecords(), fetchDiaries()]);
      const today = formatLocalDate();
      const weekStart = getWeekStart();
      const nextWeek = new Date(weekStart);
      nextWeek.setDate(weekStart.getDate() + 7);
      const currentTodayRecords = records.filter((record: LearningRecord) => formatLocalDate(parseDate(record.created_at)) === today);
      const currentWeekRecords = records.filter((record: LearningRecord) => {
        const createdAt = parseDate(record.created_at);
        return createdAt >= weekStart && createdAt < nextWeek;
      });
      setTodayRecords(currentTodayRecords);
      setWeekRecords(currentWeekRecords);
      setDiaries(savedDiaries);
      setSelectedIds(previous => new Set([...previous].filter(id => currentTodayRecords.some((record: LearningRecord) => record.id === id))));
    } catch (loadError) {
      console.error('[diary] load failed:', loadError);
      setError('日记数据暂时没有同步成功，请检查本地服务后重试。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadData();
    return () => stopLocalSpeech();
  }, [loadData]));

  const filteredDiaries = useMemo(
    () => diaries.filter(diary => diary.diary_type === activeTab),
    [activeTab, diaries],
  );
  const currentMonthCount = useMemo(() => {
    const now = new Date();
    return diaries.filter(diary => {
      const date = parseDate(diary.created_at);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }).length;
  }, [diaries]);

  const toggleSelect = (id: string) => {
    setSuccess('');
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    const weekly = activeTab === 'weekly';
    const records = weekly ? weekRecords : todayRecords.filter(record => selectedIds.has(record.id));
    if (!records.length) {
      setError(weekly ? '本周还没有可用的学习记录。' : '请先选择至少一条今日学习记录。');
      return;
    }
    setGenerating(true);
    setError('');
    setSuccess('');
    try {
      const result = await invokeEdgeFunction('diary', { records, diaryType: weekly ? 'weekly' : 'daily' });
      const content = typeof result?.content === 'string' ? result.content.trim() : '';
      if (!content) throw new Error('AI 没有返回有效内容');
      if (weekly) {
        await saveDiary({ diary_type: 'weekly', content, week_start: formatLocalDate(getWeekStart()) });
      } else {
        await saveDiary({ diary_type: 'daily', content, study_date: formatLocalDate() });
      }
      const savedDiaries = await fetchDiaries();
      setDiaries(savedDiaries);
      setSelectedIds(new Set());
      setSuccess(weekly ? '本周 Story 已生成并保存。' : '今日日记已生成并保存。');
    } catch (generationError: any) {
      console.error('[diary] generation failed:', generationError);
      setError(`生成失败：${generationError?.message || 'AI 服务暂时不可用，请稍后重试。'}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || deletingId) return;
    const id = pendingDelete.id;
    setDeletingId(id);
    setError('');
    try {
      await deleteDiary(id);
      setDiaries(previous => previous.filter(diary => diary.id !== id));
      setPendingDelete(null);
      setSuccess('日记已删除。');
      if (speakingId === id) {
        stopLocalSpeech();
        setSpeakingId(null);
      }
    } catch (deleteError) {
      console.error('[diary] delete failed:', deleteError);
      setPendingDelete(null);
      setError('删除失败，日记仍然保留，请稍后再试。');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSpeak = (diary: DiaryEntry) => {
    if (speakingId === diary.id) {
      stopLocalSpeech();
      setSpeakingId(null);
      return;
    }
    stopLocalSpeech();
    setSpeakingId(diary.id);
    void speakWithTTS(diary.content, player, invokeEdgeFunction, () => setSpeakingId(null), { rate: 0.92 });
  };

  const allSelected = todayRecords.length > 0 && selectedIds.size === todayRecords.length;
  const canGenerate = activeTab === 'weekly' ? weekRecords.length > 0 : selectedIds.size > 0;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <LinearGradient pointerEvents="none" colors={['#E8F5FD', '#F9FCFF', '#EEF9F5', '#F5F4FC']} locations={[0, 0.36, 0.72, 1]} style={StyleSheet.absoluteFillObject} />
      <LinearGradient pointerEvents="none" colors={['rgba(65,182,241,0.19)', 'rgba(96,223,205,0.06)', 'rgba(255,255,255,0)']} start={{ x: 0.04, y: 0 }} end={{ x: 0.95, y: 1 }} style={styles.backgroundHaze} />
      <View pointerEvents="none" style={styles.backgroundPrism} />
      <View pointerEvents="none" style={styles.backgroundLineOne} />
      <View pointerEvents="none" style={styles.backgroundLineTwo} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 18) + 4 }]}>
        <View style={styles.pageContent}>
          <View style={styles.header}>
            <MotionPressable onPress={() => router.back()} pressedScale={0.9} accessibilityRole="button" accessibilityLabel="返回" style={styles.headerButton}>
              <ChevronLeft size={20} color={COLORS.blueDark} strokeWidth={2.2} />
            </MotionPressable>
            <View style={styles.headerCopy}>
              <Text style={styles.headerEyebrow}>AI JOURNAL</Text>
              <Text style={styles.pageTitle}>英语日记</Text>
              <Text style={styles.pageSubtitle}>把真实练习写成你的英文故事</Text>
            </View>
            <MotionPressable onPress={() => void loadData('refresh')} disabled={refreshing} pressedScale={0.9} accessibilityRole="button" accessibilityLabel="刷新日记数据" style={styles.headerButton}>
              {refreshing ? <ActivityIndicator size="small" color={COLORS.blue} /> : <RefreshCw size={18} color={COLORS.blue} strokeWidth={2.2} />}
            </MotionPressable>
          </View>

          <Animated.View entering={FadeInDown.springify().damping(19).stiffness(180)} style={styles.heroCard}>
            <LinearGradient colors={['rgba(255,255,255,0.95)', 'rgba(223,243,255,0.78)', 'rgba(239,251,247,0.86)']} locations={[0, 0.56, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
            <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.88)', 'rgba(70,167,232,0.08)', 'rgba(255,255,255,0)']} locations={[0, 0.4, 0.68, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroRefraction} />
            <View pointerEvents="none" style={styles.heroContourLarge} />
            <View pointerEvents="none" style={styles.heroContourSmall} />
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <LinearGradient colors={['#5FE6FF', '#1684F8', '#4C55E8']} style={StyleSheet.absoluteFillObject} />
                <FileText size={25} color={COLORS.white} strokeWidth={1.9} />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>YOUR LEARNING, IN WORDS</Text>
                <Text style={styles.heroTitle}>今天学到的，值得被写下来</Text>
                <Text style={styles.heroSubtitle}>选择真实场景记录，由 AI 整理成自然的第一人称英文日记。</Text>
              </View>
            </View>
            <View style={styles.metricGrid}>
              <MetricCard icon={MapPin} value={todayRecords.length} label="今日场景" tint="#E8F5FF" color={COLORS.blue} />
              <MetricCard icon={CalendarDays} value={weekRecords.length} label="本周记录" tint="#E9FAF3" color={COLORS.mint} />
              <MetricCard icon={BookOpen} value={currentMonthCount} label="本月日记" tint="#FFF5DD" color={COLORS.gold} />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(70).springify().damping(19).stiffness(180)} style={styles.workspaceCard}>
            <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.82)', 'rgba(255,255,255,0.14)', 'rgba(62,151,218,0.04)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
            <View pointerEvents="none" style={styles.cardShine} />
            <View style={styles.segmentedControl}>
              {([
                { key: 'daily', label: '每日日记', icon: CalendarDays },
                { key: 'weekly', label: 'Weekly Story', icon: Sparkles },
              ] as const).map(item => {
                const Icon = item.icon;
                const active = activeTab === item.key;
                return (
                  <MotionPressable key={item.key} onPress={() => { setActiveTab(item.key); setError(''); setSuccess(''); }} pressedScale={0.97} accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.segment, active && styles.segmentActive]}>
                    {active ? <LinearGradient colors={['#29B5FF', '#1678EE', '#2459D7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} /> : null}
                    <Icon size={15} color={active ? COLORS.white : COLORS.muted} strokeWidth={2.2} />
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{item.label}</Text>
                  </MotionPressable>
                );
              })}
            </View>

            <View style={styles.workspaceHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>{activeTab === 'daily' ? 'TODAY\'S MATERIAL' : 'THIS WEEK'}</Text>
                <Text style={styles.sectionTitle}>{activeTab === 'daily' ? '选择今天的学习记录' : '本周学习素材'}</Text>
              </View>
              {activeTab === 'daily' && todayRecords.length > 0 ? (
                <MotionPressable onPress={() => setSelectedIds(allSelected ? new Set() : new Set(todayRecords.map(record => record.id)))} pressedScale={0.94} accessibilityRole="button" accessibilityLabel={allSelected ? '取消全选' : '全选今日记录'} style={styles.selectAllButton}>
                  <View style={[styles.selectBox, allSelected && styles.selectBoxActive]}>{allSelected ? <Check size={11} color={COLORS.white} /> : null}</View>
                  <Text style={styles.selectAllText}>{allSelected ? '已全选' : '全选'}</Text>
                </MotionPressable>
              ) : null}
            </View>

            {loading ? (
              <View style={styles.loadingState}><ActivityIndicator color={COLORS.blue} /><Text style={styles.loadingText}>正在读取学习记录...</Text></View>
            ) : activeTab === 'daily' ? (
              todayRecords.length ? (
                <View style={styles.recordList}>
                  {todayRecords.map(record => <LearningRecordCard key={record.id} record={record} selected={selectedIds.has(record.id)} onPress={() => toggleSelect(record.id)} />)}
                </View>
              ) : (
                <EmptyMaterial title="今天还没有学习记录" description="完成一次场景识别或对话后，就能把真实练习写进日记。" onAction={() => router.push('/(app)/(tabs)/home' as any)} action="去记录场景" />
              )
            ) : weekRecords.length ? (
              <View style={styles.weekSummary}>
                <View style={styles.weekSummaryIcon}><BookOpen size={21} color={COLORS.blueDark} /></View>
                <View style={styles.weekSummaryCopy}>
                  <Text style={styles.weekSummaryTitle}>已收集 {weekRecords.length} 条场景练习</Text>
                  <Text style={styles.weekSummaryText}>AI 会整理本周发生过的场景、表达和进步，生成一篇完整 Weekly Story。</Text>
                  <View style={styles.scenePills}>
                    {[...new Set(weekRecords.map(record => record.scene_name))].slice(0, 5).map(name => <ScenePill key={name} name={name} />)}
                  </View>
                </View>
              </View>
            ) : (
              <EmptyMaterial title="本周还没有学习记录" description="先完成一个场景练习，本周故事会随着真实进度自动更新。" onAction={() => router.push('/(app)/(tabs)/home' as any)} action="开始练习" />
            )}

            <MotionPressable onPress={() => void handleGenerate()} disabled={generating || !canGenerate || loading} pressedScale={0.97} hoverLift={2} accessibilityRole="button" accessibilityLabel={activeTab === 'daily' ? '生成今日日记' : '生成本周 Story'} style={styles.generateButton}>
              <LinearGradient colors={canGenerate ? ['#26B9FF', '#1677F0', '#1954D1'] : ['#B8C8D7', '#9DADBD', '#8C9BAB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
              <View pointerEvents="none" style={styles.generateHighlight} />
              {generating ? <ActivityIndicator size="small" color={COLORS.white} /> : <Sparkles size={17} color={COLORS.white} strokeWidth={2.2} />}
              <Text style={styles.generateButtonText}>{generating ? 'AI 正在整理你的故事...' : activeTab === 'daily' ? `生成今日日记${selectedIds.size ? ` · ${selectedIds.size} 条` : ''}` : '生成本周 Story'}</Text>
              {!generating ? <ArrowRight size={16} color={COLORS.white} strokeWidth={2.4} /> : null}
            </MotionPressable>
          </Animated.View>

          {error ? <FeedbackBanner type="error" text={error} onClose={() => setError('')} onRetry={() => void loadData('refresh')} /> : null}
          {success ? <FeedbackBanner type="success" text={success} onClose={() => setSuccess('')} /> : null}

          <Animated.View entering={FadeInDown.delay(140).springify().damping(19).stiffness(180)} style={styles.historySection}>
            <View style={styles.historyHeader}>
              <View><Text style={styles.sectionEyebrow}>JOURNAL ARCHIVE</Text><Text style={styles.sectionTitle}>{activeTab === 'daily' ? '我的每日日记' : '我的 Weekly Story'}</Text></View>
              <View style={styles.countBadge}><Text style={styles.countBadgeText}>{filteredDiaries.length} 篇</Text></View>
            </View>

            {loading ? (
              <View style={styles.loadingState}><ActivityIndicator color={COLORS.blue} /></View>
            ) : filteredDiaries.length ? (
              <Animated.View layout={LinearTransition.springify().damping(20).stiffness(180)} style={styles.diaryList}>
                {filteredDiaries.map((diary, index) => (
                  <DiaryCard key={diary.id} diary={diary} index={index} speaking={speakingId === diary.id} onSpeak={() => handleSpeak(diary)} onDelete={() => setPendingDelete(diary)} />
                ))}
              </Animated.View>
            ) : (
              <View style={styles.emptyArchive}>
                <View style={styles.emptyArchiveIcon}>{activeTab === 'daily' ? <FileText size={25} color={COLORS.blue} /> : <BookOpen size={25} color={COLORS.gold} />}</View>
                <Text style={styles.emptyArchiveTitle}>{activeTab === 'daily' ? '第一篇日记正在等你' : '第一篇 Weekly Story 正在等你'}</Text>
                <Text style={styles.emptyArchiveText}>{activeTab === 'daily' ? '选择上面的真实学习记录，AI 会写出一篇只属于你的英文日记。' : '完成本周练习后，用一篇英文故事回顾自己的进步。'}</Text>
              </View>
            )}
          </Animated.View>
        </View>
      </ScrollView>

      <DeleteDialog diary={pendingDelete} deleting={Boolean(deletingId)} onCancel={() => setPendingDelete(null)} onConfirm={() => void handleConfirmDelete()} />
    </View>
  );
}

function MetricCard({ icon: Icon, value, label, tint, color }: { icon: typeof MapPin; value: number; label: string; tint: string; color: string }) {
  return <View style={styles.metricCard}><View style={[styles.metricIcon, { backgroundColor: tint }]}><Icon size={15} color={color} strokeWidth={2.2} /></View><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function LearningRecordCard({ record, selected, onPress }: { record: LearningRecord; selected: boolean; onPress: () => void }) {
  const visual = sceneVisual(record.scene_name);
  const Icon = visual.icon;
  const expression = record.i_say || record.i_think || record.i_see || '已完成一条场景学习记录';
  return (
    <MotionPressable onPress={onPress} pressedScale={0.98} hoverLift={2} hoverTilt={1} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`选择${record.scene_name}学习记录`} style={[styles.recordCard, selected && styles.recordCardSelected]}>
      {selected ? <LinearGradient pointerEvents="none" colors={['rgba(225,244,255,0.92)', 'rgba(246,253,255,0.88)', 'rgba(231,247,242,0.82)']} style={StyleSheet.absoluteFillObject} /> : null}
      <View style={[styles.recordIcon, { backgroundColor: visual.tint }]}><Icon size={20} color={visual.color} strokeWidth={2} /></View>
      <View style={styles.recordCopy}><Text numberOfLines={1} style={styles.recordTitle}>{record.scene_name || '场景学习'}</Text><Text numberOfLines={2} style={styles.recordExpression}>{expression}</Text></View>
      <View style={[styles.recordCheck, selected && styles.recordCheckActive]}>{selected ? <Check size={13} color={COLORS.white} strokeWidth={2.6} /> : null}</View>
    </MotionPressable>
  );
}

function ScenePill({ name }: { name: string }) {
  const visual = sceneVisual(name);
  const Icon = visual.icon;
  return <View style={[styles.scenePill, { backgroundColor: visual.tint }]}><Icon size={12} color={visual.color} /><Text numberOfLines={1} style={[styles.scenePillText, { color: visual.color }]}>{name}</Text></View>;
}

function EmptyMaterial({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  return (
    <View style={styles.emptyMaterial}>
      <View style={styles.emptyMaterialIcon}><Clock3 size={22} color={COLORS.blue} /></View>
      <View style={styles.emptyMaterialCopy}><Text style={styles.emptyMaterialTitle}>{title}</Text><Text style={styles.emptyMaterialText}>{description}</Text></View>
      <MotionPressable onPress={onAction} pressedScale={0.95} accessibilityRole="button" accessibilityLabel={action} style={styles.emptyMaterialAction}><Text style={styles.emptyMaterialActionText}>{action}</Text><ArrowRight size={14} color={COLORS.blue} /></MotionPressable>
    </View>
  );
}

function FeedbackBanner({ type, text, onClose, onRetry }: { type: 'error' | 'success'; text: string; onClose: () => void; onRetry?: () => void }) {
  const error = type === 'error';
  return (
    <Animated.View entering={FadeInDown.springify().damping(20).stiffness(190)} style={[styles.feedbackBanner, error ? styles.feedbackError : styles.feedbackSuccess]}>
      {error ? <AlertCircle size={18} color="#B33B35" /> : <Check size={18} color="#23815B" strokeWidth={2.5} />}
      <Text style={[styles.feedbackText, { color: error ? '#93352F' : '#276B50' }]}>{text}</Text>
      {onRetry ? <MotionPressable onPress={onRetry} pressedScale={0.92} style={styles.feedbackRetry}><RefreshCw size={13} color="#A13B34" /><Text style={styles.feedbackRetryText}>重试</Text></MotionPressable> : null}
      <MotionPressable onPress={onClose} pressedScale={0.9} accessibilityRole="button" accessibilityLabel="关闭提示" style={styles.feedbackClose}><X size={14} color={error ? '#93352F' : '#276B50'} /></MotionPressable>
    </Animated.View>
  );
}

function DiaryCard({ diary, index, speaking, onSpeak, onDelete }: { diary: DiaryEntry; index: number; speaking: boolean; onSpeak: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(index === 0);
  const weekly = diary.diary_type === 'weekly';
  const accent = weekly ? COLORS.gold : COLORS.blue;
  const dateLabel = weekly ? (diary.week_start ? weekRange(diary.week_start) : formatDate(diary.created_at)) : formatDate(diary.study_date || diary.created_at);
  const { preview, hasMore } = diaryPreview(diary.content);
  return (
    <Animated.View layout={LinearTransition.springify().damping(20).stiffness(180)} style={styles.diaryCard}>
      <LinearGradient colors={weekly ? ['rgba(255,249,226,0.94)', 'rgba(255,255,255,0.86)', 'rgba(246,250,255,0.82)'] : ['rgba(232,247,255,0.94)', 'rgba(255,255,255,0.88)', 'rgba(239,249,247,0.84)']} locations={[0, 0.56, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
      <View pointerEvents="none" style={[styles.diaryRail, { backgroundColor: accent }]} />
      <View pointerEvents="none" style={styles.diaryGlow} />
      <View style={styles.diaryHeader}>
        <View style={[styles.diaryTypeIcon, { backgroundColor: weekly ? '#FFF2C8' : '#E4F3FF' }]}>{weekly ? <Sparkles size={18} color={accent} /> : <CalendarDays size={18} color={accent} />}</View>
        <View style={styles.diaryHeaderCopy}><Text style={[styles.diaryType, { color: accent }]}>{weekly ? 'WEEKLY STORY' : 'DAILY JOURNAL'}</Text><Text style={styles.diaryDate}>{dateLabel}</Text></View>
        <MotionPressable onPress={onDelete} pressedScale={0.9} accessibilityRole="button" accessibilityLabel={`删除${dateLabel}的日记`} style={styles.deleteButton}><Trash2 size={15} color={COLORS.coral} strokeWidth={2} /></MotionPressable>
      </View>
      <Text style={styles.diaryContent}>{expanded ? diary.content : preview}</Text>
      <View style={styles.diaryFooter}>
        <MotionPressable onPress={onSpeak} pressedScale={0.94} accessibilityRole="button" accessibilityLabel={speaking ? '停止朗读日记' : '朗读日记'} style={[styles.readButton, speaking && styles.readButtonActive]}>
          {speaking ? <ActivityIndicator size={13} color={COLORS.white} /> : <Volume2 size={14} color={COLORS.blue} strokeWidth={2.2} />}
          <Text style={[styles.readButtonText, speaking && styles.readButtonTextActive]}>{speaking ? '正在朗读' : '朗读日记'}</Text>
        </MotionPressable>
        {hasMore ? <MotionPressable onPress={() => setExpanded(previous => !previous)} pressedScale={0.94} accessibilityRole="button" accessibilityLabel={expanded ? '收起日记' : '展开完整日记'} style={styles.expandButton}><Text style={styles.expandButtonText}>{expanded ? '收起' : '阅读全文'}</Text>{expanded ? <ChevronUp size={14} color={COLORS.muted} /> : <ChevronDown size={14} color={COLORS.muted} />}</MotionPressable> : null}
      </View>
    </Animated.View>
  );
}

function DeleteDialog({ diary, deleting, onCancel, onConfirm }: { diary: DiaryEntry | null; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal visible={Boolean(diary)} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.deleteDialog}>
          <LinearGradient colors={['rgba(255,255,255,0.98)', 'rgba(246,250,253,0.96)']} style={StyleSheet.absoluteFillObject} />
          <View style={styles.deleteDialogIcon}><Trash2 size={22} color={COLORS.coral} /></View>
          <Text style={styles.deleteDialogTitle}>删除这篇日记？</Text>
          <Text style={styles.deleteDialogText}>删除后无法恢复。你的学习记录不会受影响。</Text>
          <View style={styles.deleteDialogActions}>
            <MotionPressable onPress={onCancel} disabled={deleting} pressedScale={0.96} accessibilityRole="button" accessibilityLabel="取消删除" style={styles.cancelButton}><Text style={styles.cancelButtonText}>取消</Text></MotionPressable>
            <MotionPressable onPress={onConfirm} disabled={deleting} pressedScale={0.96} accessibilityRole="button" accessibilityLabel="确认删除日记" style={styles.confirmDeleteButton}>{deleting ? <ActivityIndicator size="small" color={COLORS.white} /> : <Trash2 size={15} color={COLORS.white} />}<Text style={styles.confirmDeleteText}>确认删除</Text></MotionPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  backgroundHaze: { position: 'absolute', left: -100, right: -100, top: -140, height: 650, transform: [{ rotate: '-9deg' }] },
  backgroundPrism: { position: 'absolute', width: 720, height: 310, top: 110, left: '17%', borderRadius: 96, backgroundColor: 'rgba(255,255,255,0.26)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.70)', transform: [{ rotate: '-12deg' }], shadowColor: '#5A99C1', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.06, shadowRadius: 32 },
  backgroundLineOne: { position: 'absolute', width: 900, height: 1, top: 620, left: -190, backgroundColor: 'rgba(65,146,203,0.10)', transform: [{ rotate: '-13deg' }] },
  backgroundLineTwo: { position: 'absolute', width: 900, height: 1, top: 1180, left: -150, backgroundColor: 'rgba(73,185,154,0.10)', transform: [{ rotate: '10deg' }] },
  scrollContent: { paddingBottom: 68 },
  pageContent: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16, gap: 14 },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerButton: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)', shadowColor: '#3579AB', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 3, ...GLASS_WEB },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: { color: COLORS.blue, fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 1.35 },
  pageTitle: { marginTop: 1, color: COLORS.text, fontSize: 27, lineHeight: 32, fontWeight: '900' },
  pageSubtitle: { color: COLORS.muted, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  heroCard: { overflow: 'hidden', padding: 15, borderRadius: 29, borderWidth: 1.2, borderColor: 'rgba(255,255,255,0.90)', shadowColor: '#347BA9', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.16, shadowRadius: 32, elevation: 7, ...GLASS_WEB },
  heroRefraction: { position: 'absolute', width: '160%', height: 260, top: -100, left: '-28%', transform: [{ rotate: '-10deg' }] },
  heroContourLarge: { position: 'absolute', width: 250, height: 250, borderRadius: 125, right: -102, top: -108, borderWidth: 1, borderColor: 'rgba(40,151,221,0.17)' },
  heroContourSmall: { position: 'absolute', width: 176, height: 176, borderRadius: 88, right: -55, top: -60, borderWidth: 1, borderColor: 'rgba(255,255,255,0.84)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 58, height: 58, borderRadius: 21, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.74)', shadowColor: COLORS.blue, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.30, shadowRadius: 16, elevation: 4 },
  heroCopy: { flex: 1, minWidth: 0 },
  heroEyebrow: { color: COLORS.blue, fontSize: 7, lineHeight: 10, fontWeight: '900', letterSpacing: 1.05 },
  heroTitle: { marginTop: 3, color: COLORS.text, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  heroSubtitle: { marginTop: 3, maxWidth: 500, color: COLORS.muted, fontSize: 9.5, lineHeight: 14, fontWeight: '600' },
  metricGrid: { marginTop: 13, flexDirection: 'row', gap: 8 },
  metricCard: { flex: 1, minWidth: 0, minHeight: 68, padding: 9, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.60)', borderWidth: 1, borderColor: 'rgba(151,199,231,0.35)' },
  metricIcon: { width: 27, height: 27, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metricValue: { marginTop: 4, color: COLORS.text, fontSize: 15, lineHeight: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  metricLabel: { marginTop: 1, color: COLORS.muted, fontSize: 7.5, lineHeight: 10, fontWeight: '700' },
  workspaceCard: { overflow: 'hidden', padding: 14, borderRadius: 27, backgroundColor: 'rgba(244,250,254,0.58)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.82)', shadowColor: '#2F6B95', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.14, shadowRadius: 26, elevation: 5, ...GLASS_WEB },
  cardShine: { position: 'absolute', left: 26, right: 26, top: 2, height: 2, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.96)' },
  segmentedControl: { height: 46, padding: 4, flexDirection: 'row', gap: 4, borderRadius: 18, backgroundColor: 'rgba(107,156,194,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.70)' },
  segment: { flex: 1, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14 },
  segmentActive: { shadowColor: COLORS.blue, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 9, elevation: 2 },
  segmentText: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  segmentTextActive: { color: COLORS.white },
  workspaceHeader: { marginTop: 16, minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionEyebrow: { color: COLORS.blue, fontSize: 7, lineHeight: 10, fontWeight: '900', letterSpacing: 1.15 },
  sectionTitle: { marginTop: 1, color: COLORS.text, fontSize: 18, lineHeight: 23, fontWeight: '900' },
  selectAllButton: { minHeight: 32, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.64)', borderWidth: 1, borderColor: COLORS.line },
  selectBox: { width: 17, height: 17, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.3, borderColor: '#A5B6C6', backgroundColor: 'rgba(255,255,255,0.68)' },
  selectBoxActive: { borderColor: COLORS.blue, backgroundColor: COLORS.blue },
  selectAllText: { color: COLORS.muted, fontSize: 9, fontWeight: '800' },
  loadingState: { minHeight: 105, alignItems: 'center', justifyContent: 'center', gap: 9 },
  loadingText: { color: COLORS.muted, fontSize: 9.5, fontWeight: '700' },
  recordList: { marginTop: 10, gap: 8 },
  recordCard: { minHeight: 70, overflow: 'hidden', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.58)', borderWidth: 1.2, borderColor: 'rgba(160,197,225,0.35)' },
  recordCardSelected: { borderColor: 'rgba(22,132,248,0.64)', shadowColor: COLORS.blue, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.13, shadowRadius: 12, elevation: 2 },
  recordIcon: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  recordCopy: { flex: 1, minWidth: 0 },
  recordTitle: { color: COLORS.text, fontSize: 11, lineHeight: 15, fontWeight: '900' },
  recordExpression: { marginTop: 3, color: COLORS.muted, fontSize: 8.5, lineHeight: 12, fontWeight: '600' },
  recordCheck: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.2, borderColor: '#B4C3D0', backgroundColor: 'rgba(255,255,255,0.68)' },
  recordCheckActive: { borderColor: COLORS.blue, backgroundColor: COLORS.blue },
  weekSummary: { marginTop: 10, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.58)', borderWidth: 1, borderColor: COLORS.line },
  weekSummaryIcon: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F4FF' },
  weekSummaryCopy: { flex: 1, minWidth: 0 },
  weekSummaryTitle: { color: COLORS.text, fontSize: 11, lineHeight: 15, fontWeight: '900' },
  weekSummaryText: { marginTop: 3, color: COLORS.muted, fontSize: 8.5, lineHeight: 13, fontWeight: '600' },
  scenePills: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  scenePill: { maxWidth: 126, paddingHorizontal: 7, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10 },
  scenePillText: { flexShrink: 1, fontSize: 7.5, lineHeight: 10, fontWeight: '800' },
  emptyMaterial: { marginTop: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.56)', borderWidth: 1, borderColor: COLORS.line },
  emptyMaterialIcon: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F4FF' },
  emptyMaterialCopy: { flex: 1, minWidth: 0 },
  emptyMaterialTitle: { color: COLORS.text, fontSize: 10.5, lineHeight: 14, fontWeight: '900' },
  emptyMaterialText: { marginTop: 2, color: COLORS.muted, fontSize: 8, lineHeight: 12, fontWeight: '600' },
  emptyMaterialAction: { minHeight: 34, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 15, backgroundColor: 'rgba(230,244,255,0.88)', borderWidth: 1, borderColor: 'rgba(92,170,228,0.30)' },
  emptyMaterialActionText: { color: COLORS.blue, fontSize: 8.5, fontWeight: '900' },
  generateButton: { minHeight: 51, marginTop: 12, overflow: 'hidden', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.56)', shadowColor: COLORS.blue, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.24, shadowRadius: 16, elevation: 4 },
  generateHighlight: { position: 'absolute', left: 35, right: 35, top: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.78)' },
  generateButtonText: { color: COLORS.white, fontSize: 10.5, fontWeight: '900' },
  feedbackBanner: { minHeight: 52, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 18, borderWidth: 1, ...GLASS_WEB },
  feedbackError: { backgroundColor: 'rgba(255,239,237,0.90)', borderColor: 'rgba(221,111,101,0.36)' },
  feedbackSuccess: { backgroundColor: 'rgba(232,251,242,0.92)', borderColor: 'rgba(73,179,132,0.34)' },
  feedbackText: { flex: 1, fontSize: 9, lineHeight: 13, fontWeight: '700' },
  feedbackRetry: { minHeight: 29, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.68)' },
  feedbackRetryText: { color: '#A13B34', fontSize: 8, fontWeight: '900' },
  feedbackClose: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  historySection: { overflow: 'hidden', padding: 14, borderRadius: 27, backgroundColor: 'rgba(244,250,254,0.50)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.82)', shadowColor: '#2F6B95', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.12, shadowRadius: 25, elevation: 4, ...GLASS_WEB },
  historyHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  countBadge: { minHeight: 27, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: 'rgba(230,244,255,0.78)', borderWidth: 1, borderColor: 'rgba(111,177,225,0.32)' },
  countBadgeText: { color: COLORS.blue, fontSize: 8.5, fontWeight: '900', fontVariant: ['tabular-nums'] },
  diaryList: { marginTop: 11, gap: 10 },
  diaryCard: { overflow: 'hidden', padding: 13, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)', shadowColor: '#315F82', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 17, elevation: 3 },
  diaryRail: { position: 'absolute', left: 0, top: 18, bottom: 18, width: 3, borderRadius: 2 },
  diaryGlow: { position: 'absolute', width: 180, height: 80, right: -45, top: -40, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.44)', transform: [{ rotate: '-12deg' }] },
  diaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  diaryTypeIcon: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  diaryHeaderCopy: { flex: 1, minWidth: 0 },
  diaryType: { fontSize: 7, lineHeight: 10, fontWeight: '900', letterSpacing: 0.9 },
  diaryDate: { marginTop: 2, color: COLORS.text, fontSize: 10.5, lineHeight: 14, fontWeight: '900' },
  deleteButton: { width: 34, height: 34, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,240,238,0.72)', borderWidth: 1, borderColor: 'rgba(224,112,103,0.18)' },
  diaryContent: { marginTop: 12, color: '#33465A', fontSize: 11, lineHeight: 19, fontWeight: '500' },
  diaryFooter: { marginTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  readButton: { minHeight: 34, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 15, backgroundColor: 'rgba(232,245,255,0.86)', borderWidth: 1, borderColor: 'rgba(87,163,221,0.27)' },
  readButtonActive: { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
  readButtonText: { color: COLORS.blue, fontSize: 8.5, fontWeight: '900' },
  readButtonTextActive: { color: COLORS.white },
  expandButton: { minHeight: 34, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 15 },
  expandButtonText: { color: COLORS.muted, fontSize: 8.5, fontWeight: '800' },
  emptyArchive: { minHeight: 180, padding: 24, alignItems: 'center', justifyContent: 'center' },
  emptyArchiveIcon: { width: 52, height: 52, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(231,245,255,0.86)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)' },
  emptyArchiveTitle: { marginTop: 11, color: COLORS.text, fontSize: 11.5, lineHeight: 15, fontWeight: '900', textAlign: 'center' },
  emptyArchiveText: { marginTop: 4, maxWidth: 330, color: COLORS.muted, fontSize: 8.5, lineHeight: 13, fontWeight: '600', textAlign: 'center' },
  modalBackdrop: { flex: 1, padding: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,22,38,0.36)' },
  deleteDialog: { width: '100%', maxWidth: 370, overflow: 'hidden', padding: 20, alignItems: 'center', borderRadius: 27, borderWidth: 1, borderColor: 'rgba(255,255,255,0.94)', shadowColor: '#102B42', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.24, shadowRadius: 40, elevation: 10, ...GLASS_WEB },
  deleteDialogIcon: { width: 52, height: 52, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0EE', borderWidth: 1, borderColor: 'rgba(229,94,89,0.22)' },
  deleteDialogTitle: { marginTop: 12, color: COLORS.text, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  deleteDialogText: { marginTop: 5, color: COLORS.muted, fontSize: 9.5, lineHeight: 14, fontWeight: '600', textAlign: 'center' },
  deleteDialogActions: { width: '100%', marginTop: 18, flexDirection: 'row', gap: 9 },
  cancelButton: { flex: 1, minHeight: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#EDF3F8' },
  cancelButtonText: { color: COLORS.muted, fontSize: 10, fontWeight: '900' },
  confirmDeleteButton: { flex: 1, minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 17, backgroundColor: COLORS.coral, shadowColor: COLORS.coral, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.23, shadowRadius: 13 },
  confirmDeleteText: { color: COLORS.white, fontSize: 10, fontWeight: '900' },
});

import { useAudioPlayer } from 'expo-audio';
import { useFocusEffect, useRouter } from 'expo-router';
import { BookOpen, Calendar, Check, ChevronLeft, RefreshCw, Sparkles, Trash2, Volume2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { deleteDiary, fetchDiaries, fetchLearningRecords, invokeEdgeFunction, saveDiary } from '@/lib/api';
import { speakWithTTS, stopLocalSpeech } from '@/lib/speech';
import { formatLocalDate } from '@/lib/utils';

// ── 颜色常量 ────────────────────────────────────────────
const BLUE      = '#4A90E2';
const BLUE_DARK = '#2E5C8A';
const BLUE_LIGHT = '#EEF5FF';
const YELLOW    = '#FFD60A';
const GREEN     = '#34C759';
const WHITE     = '#FFFFFF';
const BG        = '#F5F8FF';

// ── 类型 ────────────────────────────────────────────────
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

// ── 辅助函数 ────────────────────────────────────────────
function parseDate(value: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T12:00:00` : value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatDate(iso: string) {
  return parseDate(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function weekRange(isoStart: string) {
  const s = parseDate(isoStart);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  return `${fmt(s)} — ${fmt(e)}`;
}

function getWeekStart(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

const SCENE_EMOJI_MAP: Record<string, string> = {
  '咖啡店': '☕', '图书馆': '📚', '地铁': '🚇', '机场': '✈️',
  '超市': '🛒', '餐厅': '🍽️', '办公室': '💻', '学校': '🏫',
  '公园': '🌳', '健身房': '🏋️',
};
const sceneEmoji = (name: string) => {
  for (const [k, v] of Object.entries(SCENE_EMOJI_MAP)) { if (name.includes(k)) return v; }
  return '📍';
};

// ── 主组件 ──────────────────────────────────────────────
export default function DiaryScreen() {
  const router = useRouter();
  const player = useAudioPlayer();
  const [activeTab, setActiveTab]     = useState<'daily' | 'weekly'>('daily');
  const [todayRecs, setTodayRecs]     = useState<LearningRecord[]>([]);
  const [weekRecs, setWeekRecs]       = useState<LearningRecord[]>([]);
  const [diaries, setDiaries]         = useState<DiaryEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DiaryEntry | null>(null);
  const [speakingId, setSpeakingId]   = useState<string | null>(null);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');

  // ── 数据加载 ──
  const loadData = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [allRecs, allDiaries] = await Promise.all([fetchLearningRecords(), fetchDiaries()]);
      const today = formatLocalDate();
      const weekStart = getWeekStart();
      const nextWeek = new Date(weekStart);
      nextWeek.setDate(weekStart.getDate() + 7);
      const currentToday = allRecs.filter((r: LearningRecord) => formatLocalDate(parseDate(r.created_at)) === today);
      const currentWeek = allRecs.filter((r: LearningRecord) => {
        const createdAt = parseDate(r.created_at);
        return createdAt >= weekStart && createdAt < nextWeek;
      });
      setTodayRecs(currentToday);
      setWeekRecs(currentWeek);
      setDiaries(allDiaries);
      setSelectedIds(previous => new Set([...previous].filter(id => currentToday.some((record: LearningRecord) => record.id === id))));
    } catch (loadError) {
      console.error('[diary] load failed:', loadError);
      setError('加载失败，请检查本地服务后重试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadData();
    return () => stopLocalSpeech();
  }, [loadData]));

  // ── 生成每日日记 ──
  const handleGenerateDaily = async () => {
    if (selectedIds.size === 0) return;
    setGenerating(true); setError(''); setSuccess('');
    try {
      const selected = todayRecs.filter(r => selectedIds.has(r.id));
      const result   = await invokeEdgeFunction('diary', { records: selected, diaryType: 'daily' });
      const content  = typeof result?.content === 'string' ? result.content.trim() : '';
      if (!content) throw new Error('AI 未返回有效日记内容');
      const today    = formatLocalDate();
      await saveDiary({ diary_type: 'daily', content, study_date: today });
      const updated  = await fetchDiaries();
      setDiaries(updated);
      setSelectedIds(new Set());
      setSuccess('今日日记已生成并保存');
    } catch (e: any) {
      setError('生成失败：' + (e.message || '请检查 API 配置'));
    } finally {
      setGenerating(false);
    }
  };

  // ── 生成 Weekly Story ──
  const handleGenerateWeekly = async () => {
    if (weekRecs.length === 0) { setError('本周暂无学习记录'); return; }
    setGenerating(true); setError(''); setSuccess('');
    try {
      const result      = await invokeEdgeFunction('diary', { records: weekRecs, diaryType: 'weekly' });
      const content     = typeof result?.content === 'string' ? result.content.trim() : '';
      if (!content) throw new Error('AI 未返回有效周记内容');
      const weekStart   = getWeekStart();
      await saveDiary({ diary_type: 'weekly', content, week_start: formatLocalDate(weekStart) });
      const updated = await fetchDiaries();
      setDiaries(updated);
      setSuccess('本周 Story 已生成并保存');
    } catch (e: any) {
      setError('生成失败：' + (e.message || '请检查 API 配置'));
    } finally {
      setGenerating(false);
    }
  };

  // ── 删除日记 ──
  const handleConfirmDelete = async () => {
    if (!pendingDelete || deletingId) return;
    const id = pendingDelete.id;
    setDeletingId(id);
    setError('');
    try {
      await deleteDiary(id);
      setDiaries(prev => prev.filter(d => d.id !== id));
      setPendingDelete(null);
      setSuccess('日记已删除');
      if (speakingId === id) {
        stopLocalSpeech();
        setSpeakingId(null);
      }
    } catch (deleteError) {
      console.error('[diary] delete failed:', deleteError);
      setPendingDelete(null);
      setError('删除失败，日记仍然保留，请稍后再试');
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

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filteredDiaries = diaries.filter(d => d.diary_type === activeTab);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* ── 顶部 Hero ── */}
      <View style={{ backgroundColor: BLUE_LIGHT, paddingTop: 56, paddingBottom: 24, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#D6E8FF' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <Pressable onPress={() => router.back()} className="active:opacity-70"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <ChevronLeft size={20} color={BLUE} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#1E293B', fontSize: 22, fontWeight: '800' }}>📖 英语日记</Text>
            <Text style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>AI 为你记录每天的英语故事</Text>
          </View>
          <Pressable onPress={() => void loadData(true)} disabled={refreshing} accessibilityRole="button" accessibilityLabel="刷新日记数据" className="active:opacity-70"
            style={{ width: 34, height: 28, backgroundColor: YELLOW, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
            {refreshing ? <ActivityIndicator size="small" color={BLUE_DARK} /> : <Sparkles size={14} color={BLUE_DARK} />}
          </Pressable>
        </View>

        {/* Tab 切换 */}
        <View style={{ flexDirection: 'row', backgroundColor: BLUE + '18', borderRadius: 14, padding: 3 }}>
          {([
            { key: 'daily',  label: '📅 每日日记' },
            { key: 'weekly', label: '🌟 Weekly Story' },
          ] as const).map(t => (
            <Pressable key={t.key} onPress={() => setActiveTab(t.key)} className="active:opacity-80"
              style={{ flex: 1, paddingVertical: 9, borderRadius: 11, backgroundColor: activeTab === t.key ? WHITE : 'transparent', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: activeTab === t.key ? BLUE_DARK : '#64748B' }}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
        <View style={{ padding: 16, gap: 16, paddingBottom: 40 }}>

          {/* 错误提示 */}
          {error !== '' && (
            <View style={{ backgroundColor: '#FEE2E2', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#991B1B', fontSize: 13, flex: 1 }}>⚠️ {error}</Text>
              <Pressable onPress={() => void loadData(true)} className="active:opacity-70">
                <Text style={{ color: '#991B1B', fontSize: 12, fontWeight: '800' }}>重试</Text>
              </Pressable>
            </View>
          )}

          {success !== '' && (
            <View style={{ backgroundColor: '#DCFCE7', borderRadius: 12, padding: 12 }}>
              <Text style={{ color: '#166534', fontSize: 13 }}>✓ {success}</Text>
            </View>
          )}

          {loading ? (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <ActivityIndicator color={BLUE} size="large" />
              <Text style={{ color: '#94A3B8', fontSize: 13, marginTop: 12 }}>加载中...</Text>
            </View>
          ) : (
            <>
              {/* ── 每日日记：选择记录区 ── */}
              {activeTab === 'daily' && (
                <View style={{ gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Calendar size={16} color={BLUE} />
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#1E293B' }}>今日学习记录</Text>
                    <Text style={{ fontSize: 12, color: '#94A3B8' }}>（选择后生成日记）</Text>
                  </View>

                  {todayRecs.length === 0 ? (
                    <View style={{ backgroundColor: WHITE, borderRadius: 18, padding: 24, alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 36 }}>📭</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }}>今天还没有学习记录</Text>
                      <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>先去拍照识别场景，再来生成日记吧！</Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {/* 全选 */}
                      <Pressable onPress={() => setSelectedIds(prev => prev.size === todayRecs.length ? new Set() : new Set(todayRecs.map(r => r.id)))}
                        className="active:opacity-70"
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: selectedIds.size === todayRecs.length ? BLUE : '#CBD5E1', backgroundColor: selectedIds.size === todayRecs.length ? BLUE : WHITE, alignItems: 'center', justifyContent: 'center' }}>
                          {selectedIds.size === todayRecs.length && <Check size={11} color={WHITE} />}
                        </View>
                        <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>全选 ({todayRecs.length}条)</Text>
                      </Pressable>

                      {todayRecs.map(r => {
                        const sel = selectedIds.has(r.id);
                        return (
                          <Pressable key={r.id} onPress={() => toggleSelect(r.id)} className="active:opacity-85"
                            style={{ backgroundColor: WHITE, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: sel ? BLUE : '#E8EDF2' }}>
                            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: sel ? BLUE + '18' : '#F0F4F8', alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 20 }}>{sceneEmoji(r.scene_name)}</Text>
                            </View>
                            <View style={{ flex: 1, gap: 2 }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }}>{r.scene_name}</Text>
                              {r.i_see && <Text style={{ fontSize: 11, color: '#94A3B8' }} numberOfLines={1}>{r.i_see}</Text>}
                            </View>
                            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: sel ? BLUE : '#CBD5E1', backgroundColor: sel ? BLUE : WHITE, alignItems: 'center', justifyContent: 'center' }}>
                              {sel && <Check size={12} color={WHITE} />}
                            </View>
                          </Pressable>
                        );
                      })}

                      {/* 生成按钮 */}
                      <Pressable onPress={handleGenerateDaily} disabled={generating || selectedIds.size === 0}
                        className="active:opacity-85"
                        style={{ backgroundColor: selectedIds.size > 0 ? BLUE : '#CBD5E1', borderRadius: 18, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 4 }}>
                        {generating
                          ? <><ActivityIndicator color={WHITE} size="small" /><Text style={{ color: WHITE, fontWeight: '800', fontSize: 14 }}>AI 正在创作...</Text></>
                          : <><Sparkles size={18} color={WHITE} /><Text style={{ color: WHITE, fontWeight: '800', fontSize: 14 }}>AI 生成今日日记</Text></>
                        }
                      </Pressable>
                    </View>
                  )}
                </View>
              )}

              {/* ── Weekly Story：生成按钮 ── */}
              {activeTab === 'weekly' && (
                <View style={{ gap: 12 }}>
                  <View style={{ backgroundColor: WHITE, borderRadius: 18, padding: 16, gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: BLUE + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <BookOpen size={20} color={BLUE} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E293B' }}>本周学习概览</Text>
                        <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>本周一至今天 · {weekRecs.length} 条场景记录</Text>
                      </View>
                    </View>
                    {/* 场景标签展示 */}
                    {weekRecs.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {Array.from(new Set(weekRecs.map(r => r.scene_name))).slice(0, 6).map(name => (
                          <View key={name} style={{ backgroundColor: BLUE + '12', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={{ fontSize: 12 }}>{sceneEmoji(name)}</Text>
                            <Text style={{ fontSize: 11, color: BLUE, fontWeight: '600' }}>{name}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  <Pressable onPress={handleGenerateWeekly} disabled={generating || weekRecs.length === 0}
                    className="active:opacity-85"
                    style={{ backgroundColor: weekRecs.length > 0 ? BLUE_DARK : '#CBD5E1', borderRadius: 18, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                    {generating
                      ? <><ActivityIndicator color={WHITE} size="small" /><Text style={{ color: WHITE, fontWeight: '800', fontSize: 14 }}>AI 正在创作...</Text></>
                      : <><RefreshCw size={18} color={weekRecs.length > 0 ? YELLOW : WHITE} /><Text style={{ color: WHITE, fontWeight: '800', fontSize: 14 }}>生成本周 Story</Text></>
                    }
                  </Pressable>
                </View>
              )}

              {/* ── 日记列表 ── */}
              {filteredDiaries.length > 0 && (
                <View style={{ gap: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#1E293B' }}>
                      {activeTab === 'daily' ? '往期日记' : '往期 Story'}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#94A3B8' }}>{filteredDiaries.length} 篇</Text>
                  </View>

                  {filteredDiaries.map((d, idx) => (
                    <DiaryCard key={d.id} diary={d} index={idx} onDelete={setPendingDelete} onSpeak={handleSpeak} deletingId={deletingId} speakingId={speakingId} />
                  ))}
                </View>
              )}

              {/* 空状态 */}
              {filteredDiaries.length === 0 && !generating && (
                <View style={{ backgroundColor: WHITE, borderRadius: 20, padding: 32, alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 44 }}>{activeTab === 'daily' ? '✏️' : '📚'}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#1E293B' }}>
                    {activeTab === 'daily' ? '还没有日记' : '还没有 Weekly Story'}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', lineHeight: 18 }}>
                    {activeTab === 'daily' ? '选择今日学习记录，让 AI 为你生成专属日记' : '每周学习结束后，生成你的英语成长故事'}
                  </Text>
                </View>
              )}

            </>
          )}
        </View>
      </ScrollView>

      <Modal visible={pendingDelete !== null} transparent animationType="fade" onRequestClose={() => setPendingDelete(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.36)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 340, backgroundColor: WHITE, borderRadius: 22, padding: 22, gap: 14 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#1E293B' }}>删除这篇日记？</Text>
            <Text style={{ fontSize: 13, lineHeight: 20, color: '#64748B' }}>删除后无法恢复。你的学习记录不会受到影响。</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable onPress={() => setPendingDelete(null)} disabled={deletingId !== null} className="active:opacity-70"
                style={{ flex: 1, borderRadius: 14, paddingVertical: 12, backgroundColor: '#F1F5F9', alignItems: 'center' }}>
                <Text style={{ color: '#475569', fontWeight: '700' }}>取消</Text>
              </Pressable>
              <Pressable onPress={() => void handleConfirmDelete()} disabled={deletingId !== null} className="active:opacity-70"
                style={{ flex: 1, borderRadius: 14, paddingVertical: 12, backgroundColor: '#EF4444', alignItems: 'center' }}>
                {deletingId ? <ActivityIndicator size="small" color={WHITE} /> : <Text style={{ color: WHITE, fontWeight: '800' }}>确认删除</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── 日记卡片组件 ─────────────────────────────────────────
const CARD_ACCENTS = [BLUE, BLUE_DARK, '#6366F1', '#0891B2', '#059669'];

function DiaryCard({ diary, index, onDelete, onSpeak, deletingId, speakingId }: {
  diary: DiaryEntry;
  index: number;
  onDelete: (diary: DiaryEntry) => void;
  onSpeak: (diary: DiaryEntry) => void;
  deletingId: string | null;
  speakingId: string | null;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const accent   = CARD_ACCENTS[index % CARD_ACCENTS.length];
  const dateLabel = diary.diary_type === 'daily'
    ? (diary.study_date ? formatDate(diary.study_date) : formatDate(diary.created_at))
    : (diary.week_start ? weekRange(diary.week_start) : formatDate(diary.created_at));

  // 截取预览文字（首2句）
  const sentences  = diary.content.split(/(?<=[.!?])\s+/);
  const preview    = sentences.slice(0, 2).join(' ');
  const hasMore    = sentences.length > 2;

  return (
    <View style={{ backgroundColor: WHITE, borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 12 }}>
      {/* 彩色顶部条 */}
      <View style={{ height: 4, backgroundColor: accent }} />

      <View style={{ padding: 18, gap: 12 }}>
        {/* 头部：日期 + 类型标签 + 删除 */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontSize: 12, color: '#94A3B8', fontWeight: '600' }}>{dateLabel}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ backgroundColor: accent + '18', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: accent }}>
                  {diary.diary_type === 'daily' ? '📅 每日日记' : '🌟 Weekly Story'}
                </Text>
              </View>
              <View style={{ backgroundColor: '#F0FDF4', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Sparkles size={9} color={GREEN} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: GREEN }}>AI 生成</Text>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 7 }}>
            <Pressable onPress={() => onSpeak(diary)} className="active:opacity-70" accessibilityRole="button" accessibilityLabel={speakingId === diary.id ? '停止朗读' : '朗读日记'}
              style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: speakingId === diary.id ? BLUE : BLUE_LIGHT, alignItems: 'center', justifyContent: 'center' }}>
              <Volume2 size={15} color={speakingId === diary.id ? WHITE : BLUE} />
            </Pressable>
            <Pressable onPress={() => onDelete(diary)} className="active:opacity-70" disabled={deletingId === diary.id}
              accessibilityRole="button" accessibilityLabel={`删除${dateLabel}的日记`}
              style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}>
              {deletingId === diary.id
                ? <ActivityIndicator size="small" color="#EF4444" />
                : <Trash2 size={15} color="#EF4444" />}
            </Pressable>
          </View>
        </View>

        {/* 正文内容 */}
        <View style={{ backgroundColor: '#F8FAFF', borderRadius: 14, padding: 14, borderLeftWidth: 3, borderLeftColor: accent }}>
          <Text style={{ fontSize: 14, color: '#1E293B', lineHeight: 24, letterSpacing: 0.2 }}>
            {expanded ? diary.content : preview}
          </Text>
          {hasMore && !expanded && (
            <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 4 }}>...</Text>
          )}
        </View>

        {/* 展开/收起 */}
        {hasMore && (
          <Pressable onPress={() => setExpanded(!expanded)} className="active:opacity-70"
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, color: BLUE, fontWeight: '700' }}>{expanded ? '收起' : '阅读全文'}</Text>
            <Text style={{ fontSize: 12, color: BLUE }}>{expanded ? '↑' : '↓'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

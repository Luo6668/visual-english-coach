import { useFocusEffect, useRouter } from 'expo-router';
import { BookOpen, Calendar, Check, ChevronLeft, RefreshCw, Sparkles, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { deleteDiary, fetchDiaries, fetchLearningRecords, invokeEdgeFunction, saveDiary } from '@/lib/api';
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
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function weekRange(isoStart: string) {
  const s = new Date(isoStart);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  return `${fmt(s)} — ${fmt(e)}`;
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
  const [activeTab, setActiveTab]     = useState<'daily' | 'weekly'>('daily');
  const [todayRecs, setTodayRecs]     = useState<LearningRecord[]>([]);
  const [weekRecs, setWeekRecs]       = useState<LearningRecord[]>([]);
  const [diaries, setDiaries]         = useState<DiaryEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading]         = useState(true);
  const [generating, setGenerating]   = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [error, setError]             = useState('');

  // ── 数据加载 ──
  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [allRecs, allDiaries] = await Promise.all([
          fetchLearningRecords(),
          fetchDiaries(),
        ]);
        const todayStr  = new Date().toDateString();
        const weekAgo   = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
        setTodayRecs(allRecs.filter((r: LearningRecord) => new Date(r.created_at).toDateString() === todayStr));
        setWeekRecs(allRecs.filter((r: LearningRecord) => new Date(r.created_at) >= weekAgo));
        setDiaries(allDiaries);
      } catch (e: any) {
        setError('加载失败，请重试');
      } finally {
        setLoading(false);
      }
    })();
  }, []));

  // ── 生成每日日记 ──
  const handleGenerateDaily = async () => {
    if (selectedIds.size === 0) return;
    setGenerating(true); setError('');
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
    } catch (e: any) {
      setError('生成失败：' + (e.message || '请检查 API 配置'));
    } finally {
      setGenerating(false);
    }
  };

  // ── 生成 Weekly Story ──
  const handleGenerateWeekly = async () => {
    if (weekRecs.length === 0) { setError('本周暂无学习记录'); return; }
    setGenerating(true); setError('');
    try {
      const result      = await invokeEdgeFunction('diary', { records: weekRecs, diaryType: 'weekly' });
      const content     = typeof result?.content === 'string' ? result.content.trim() : '';
      if (!content) throw new Error('AI 未返回有效周记内容');
      const weekStart   = new Date(); weekStart.setDate(weekStart.getDate() - 7);
      await saveDiary({ diary_type: 'weekly', content, week_start: formatLocalDate(weekStart) });
      const updated = await fetchDiaries();
      setDiaries(updated);
    } catch (e: any) {
      setError('生成失败：' + (e.message || '请检查 API 配置'));
    } finally {
      setGenerating(false);
    }
  };

  // ── 删除日记 ──
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteDiary(id);
      setDiaries(prev => prev.filter(d => d.id !== id));
    } finally {
      setDeletingId(null);
    }
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
          <View style={{ backgroundColor: YELLOW, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Sparkles size={14} color={BLUE_DARK} />
          </View>
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
            <View style={{ backgroundColor: '#FEE2E2', borderRadius: 12, padding: 12 }}>
              <Text style={{ color: '#991B1B', fontSize: 13 }}>⚠️ {error}</Text>
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
                        <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>过去7天 · {weekRecs.length} 条场景记录</Text>
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
                    <DiaryCard key={d.id} diary={d} index={idx} onDelete={handleDelete} deletingId={deletingId} />
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
    </View>
  );
}

// ── 日记卡片组件 ─────────────────────────────────────────
const CARD_ACCENTS = [BLUE, BLUE_DARK, '#6366F1', '#0891B2', '#059669'];

function DiaryCard({ diary, index, onDelete, deletingId }: {
  diary: DiaryEntry;
  index: number;
  onDelete: (id: string) => void;
  deletingId: string | null;
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
          <Pressable onPress={() => onDelete(diary.id)} className="active:opacity-70" disabled={deletingId === diary.id}
            style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}>
            {deletingId === diary.id
              ? <ActivityIndicator size="small" color="#EF4444" />
              : <Trash2 size={15} color="#EF4444" />}
          </Pressable>
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

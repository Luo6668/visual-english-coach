import { supabase, supabaseConfigError } from '@/client/supabase';
import { mysqlData } from '@/lib/data';
import { getDemoDataOwner } from '@/lib/demoSession';
import { cachedQuery, invalidateQueries, QUERY_KEYS, queryKey } from '@/lib/query-cache';
import { functionUrl, localFunctionsBaseUrl } from '@/lib/serviceConfig';
import { formatLocalDate } from '@/lib/utils';

async function getFunctionError(error: any): Promise<string> {
  const context = error?.context;
  if (typeof context?.text === 'function') {
    try {
      const text = await context.text();
      if (text) return text;
    } catch {}
  }
  return error?.message || 'AI 服务请求失败';
}

export async function invokeEdgeFunction(name: string, body: any) {
  if (supabaseConfigError) {
    const response = await fetch(functionUrl(name), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Local-User-Id': getDemoDataOwner(),
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `本地 AI 服务异常 (${response.status})`);
    return payload;
  }
  const { data, error } = await supabase.functions.invoke(name, { body, method: 'POST' });
  if (error) {
    const errorMsg = await getFunctionError(error);
    console.error(`Edge function ${name} error:`, errorMsg || error.message);
    throw new Error(errorMsg || error.message);
  }
  return data;
}

export async function fetchLearningRecords() {
  return cachedQuery(QUERY_KEYS.learningRecords, () => mysqlData<any[]>('learning_records', { orderBy: 'created_at' }));
}

export async function fetchScenes() {
  return cachedQuery(QUERY_KEYS.scenes, () => mysqlData<any[]>('scenes', { orderBy: 'practice_count' }));
}

export async function fetchWords() {
  return cachedQuery(QUERY_KEYS.words, () => mysqlData<any[]>('words', { orderBy: 'learned_at' }));
}

export async function fetchSentences() {
  return cachedQuery(QUERY_KEYS.sentences, () => mysqlData<any[]>('sentences', { orderBy: 'created_at' }));
}

export async function fetchUserStats() {
  return cachedQuery(QUERY_KEYS.userStats, () => mysqlData('user_stats', { single: true }));
}

export async function fetchDailyStats(date?: string) {
  const targetDate = date || formatLocalDate();
  return cachedQuery(queryKey(QUERY_KEYS.dailyStats, targetDate), () => mysqlData('daily_stats', { filters: { study_date: targetDate }, single: true }));
}

export async function fetchHighFreqWords() {
  const today = formatLocalDate();
  return cachedQuery(queryKey(QUERY_KEYS.highFreqWords, today), () => mysqlData<any[]>('high_freq_words', { filters: { study_date: today }, orderBy: 'count', limit: 20 }));
}

export async function createLearningRecord(record: any) {
  const created = await mysqlData<any>('learning_records', { action: 'insert', values: record });
  await Promise.allSettled([
    recordActivity('scene'),
    addXp(`scene_analysis_${created.id}`),
  ]);
  invalidateQueries([QUERY_KEYS.learningRecords, QUERY_KEYS.dailyStats, QUERY_KEYS.userStats, QUERY_KEYS.xpData]);
  return created;
}

export async function updateLearningRecord(id: string, updates: any) {
  const result = await mysqlData('learning_records', { action: 'update', filters: { id }, values: updates });
  invalidateQueries([QUERY_KEYS.learningRecords]);
  return result;
}

export async function createWord(word: any) {
  const existing = await mysqlData<any>('words', { filters: { word: word.word }, single: true });
  const saved = await mysqlData('words', { action: 'upsert', values: word });
  if (!existing) await recordActivity('word').catch(() => {});
  invalidateQueries([QUERY_KEYS.words, QUERY_KEYS.userStats, QUERY_KEYS.dailyStats, QUERY_KEYS.xpData]);
  return saved;
}

export async function createSentence(sentence: any) {
  const result = await mysqlData('sentences', { action: 'insert', values: sentence });
  invalidateQueries([QUERY_KEYS.sentences]);
  return result;
}

export async function upsertScene(scene: any) {
  const existing = await mysqlData<any>('scenes', { filters: { scene_name: scene.scene_name }, single: true });
  if (existing) {
    await mysqlData('scenes', { action: 'update', filters: { id: existing.id }, values: { practice_count: existing.practice_count + 1, last_practiced_at: new Date().toISOString().slice(0, 19).replace('T', ' ') } });
  } else {
    await mysqlData('scenes', { action: 'insert', values: scene });
  }
  invalidateQueries([QUERY_KEYS.scenes, QUERY_KEYS.sceneProgress]);
}

// ── 场景解锁进度 ──────────────────────────────────────
export async function fetchSceneProgress() {
  return cachedQuery(QUERY_KEYS.sceneProgress, () => mysqlData<any[]>('scene_progress'));
}

export async function unlockScene(sceneKey: string) {
  await mysqlData('scene_progress', { action: 'upsert', values: {
    scene_key: sceneKey,
    is_unlocked: true,
    last_visited_at: new Date().toISOString(),
    visit_count: 1,
  } });
  invalidateQueries([QUERY_KEYS.sceneProgress]);
}

export async function incrementSceneProgress(sceneKey: string) {
  const existing = await mysqlData<any>('scene_progress', { filters: { scene_key: sceneKey }, single: true });
  const visitCount = (existing?.visit_count ?? 0) + 1;
  const expressionsCount = (existing?.expressions_count ?? 0) + 3;
  const mastery = Math.min(100, (visitCount / 10) * 100);
  await mysqlData('scene_progress', { action: 'upsert', values: {
    scene_key: sceneKey,
    is_unlocked: true,
    visit_count: visitCount,
    expressions_count: expressionsCount,
    mastery: parseFloat(mastery.toFixed(2)),
    last_visited_at: new Date().toISOString(),
  } });
  invalidateQueries([QUERY_KEYS.sceneProgress]);
}

export async function incrementUserStats(field: string) {
  const stats = await mysqlData<any>('user_stats', { single: true });
  if (stats) {
    const updates: any = {};
    updates[field] = (stats[field] || 0) + 1;
    await mysqlData('user_stats', { action: 'update', values: updates });
    invalidateQueries([QUERY_KEYS.userStats, QUERY_KEYS.xpData]);
  }
}

export async function incrementDailyStats(field: string) {
  const today = formatLocalDate();
  const stats = await mysqlData<any>('daily_stats', { filters: { study_date: today }, single: true });
  if (stats) {
    const updates: any = {};
    updates[field] = (stats[field] || 0) + 1;
    await mysqlData('daily_stats', { action: 'update', filters: { id: stats.id }, values: updates });
  } else {
    const insert: any = { study_date: today };
    insert[field] = 1;
    await mysqlData('daily_stats', { action: 'insert', values: insert });
  }
  invalidateQueries([QUERY_KEYS.dailyStats]);
}

export async function createHighFreqWord(word: string) {
  const today = formatLocalDate();
  const existing = await mysqlData<any>('high_freq_words', { filters: { word, study_date: today }, single: true });
  if (existing) {
    await mysqlData('high_freq_words', { action: 'update', filters: { id: existing.id }, values: { count: existing.count + 1 } });
  } else {
    await mysqlData('high_freq_words', { action: 'insert', values: { word, study_date: today, count: 1 } });
  }
  invalidateQueries([QUERY_KEYS.highFreqWords]);
}

// ── 日记相关 ──────────────────────────────────────────────

export async function fetchDiaries(type?: 'daily' | 'weekly') {
  return cachedQuery(queryKey(QUERY_KEYS.diaries, type ?? 'all'), () => mysqlData<any[]>('diaries', { filters: type ? { diary_type: type } : {}, orderBy: 'created_at' }));
}

export async function saveDiary(payload: { diary_type: 'daily' | 'weekly'; content: string; study_date?: string; week_start?: string }) {
  const result = await mysqlData('diaries', { action: 'insert', values: payload });
  invalidateQueries([QUERY_KEYS.diaries]);
  return result;
}

export async function updateDiary(id: string, payload: { content: string }) {
  const result = await mysqlData('diaries', { action: 'update', filters: { id }, values: payload });
  invalidateQueries([QUERY_KEYS.diaries]);
  return result;
}

export async function deleteDiary(id: string) {
  const result = await mysqlData('diaries', { action: 'delete', filters: { id } });
  invalidateQueries([QUERY_KEYS.diaries]);
  return result;
}

// ── XP / 成长系统 ─────────────────────────────────────────

export async function fetchXpData() {
  return cachedQuery(QUERY_KEYS.xpData, async () => {
    const [stats, logs] = await Promise.all([
      mysqlData<any>('user_stats', { single: true }),
      mysqlData<any[]>('xp_logs', { orderBy: 'created_at', limit: 20 }),
    ]);
    return { stats: stats ?? { total_xp: 0, current_level: 1, streak_days: 0, last_checkin_date: null }, logs };
  });
}

export async function addXp(source: string) {
  const result = await invokeEdgeFunction('add-xp', { source });
  invalidateQueries([QUERY_KEYS.xpData, QUERY_KEYS.userStats, QUERY_KEYS.dailyStats]);
  return result;
}

export async function recordActivity(kind: 'scene' | 'word' | 'shadowing' | 'dialogue') {
  const result = await invokeEdgeFunction('record-activity', { kind });
  invalidateQueries([QUERY_KEYS.xpData, QUERY_KEYS.userStats, QUERY_KEYS.dailyStats]);
  return result;
}

export async function clearLocalLearningData() {
  const result = await invokeEdgeFunction('clear-local-data', {});
  invalidateQueries();
  return result;
}

export async function fetchLocalServiceStatus() {
  const healthUrl = localFunctionsBaseUrl.replace(/\/functions\/v1\/?$/, '/health');
  const response = await fetch(healthUrl);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `本地服务异常 (${response.status})`);
  return payload as {
    ok: boolean;
    deepseek: boolean;
    dashscope: boolean;
    localAsr: boolean;
    localTts: boolean;
  };
}

export async function fetchLearningRecord(id: string) {
  return cachedQuery(queryKey(QUERY_KEYS.learningRecords, id), () => mysqlData<any>('learning_records', { filters: { id }, single: true }));
}

export async function fetchSceneMapProgress(sceneId?: string) {
  return cachedQuery(queryKey(QUERY_KEYS.sceneMapProgress, sceneId ?? 'all'), () => mysqlData<any[]>('scene_map_progress', { filters: sceneId ? { scene_id: sceneId } : {} }));
}

export async function upsertSceneMapProgress(values: Record<string, unknown>) {
  const result = await mysqlData('scene_map_progress', { action: 'upsert', values });
  invalidateQueries([QUERY_KEYS.sceneMapProgress, QUERY_KEYS.xpData]);
  return result;
}

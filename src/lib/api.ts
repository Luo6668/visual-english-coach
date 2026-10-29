import { supabase, supabaseConfigError } from '@/client/supabase';
import { mysqlData } from '@/lib/data';
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
      headers: { 'Content-Type': 'application/json' },
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
  return mysqlData<any[]>('learning_records', { orderBy: 'created_at' });
}

export async function fetchScenes() {
  return mysqlData<any[]>('scenes', { orderBy: 'practice_count' });
}

export async function fetchWords() {
  return mysqlData<any[]>('words', { orderBy: 'learned_at' });
}

export async function fetchSentences() {
  return mysqlData<any[]>('sentences', { orderBy: 'created_at' });
}

export async function fetchUserStats() {
  return mysqlData('user_stats', { single: true });
}

export async function fetchDailyStats(date?: string) {
  const targetDate = date || formatLocalDate();
  return mysqlData('daily_stats', { filters: { study_date: targetDate }, single: true });
}

export async function fetchHighFreqWords() {
  const today = formatLocalDate();
  return mysqlData<any[]>('high_freq_words', { filters: { study_date: today }, orderBy: 'count', limit: 20 });
}

export async function createLearningRecord(record: any) {
  const created = await mysqlData<any>('learning_records', { action: 'insert', values: record });
  await Promise.allSettled([
    recordActivity('scene'),
    addXp(`scene_analysis_${created.id}`),
  ]);
  return created;
}

export async function updateLearningRecord(id: string, updates: any) {
  return mysqlData('learning_records', { action: 'update', filters: { id }, values: updates });
}

export async function createWord(word: any) {
  const existing = await mysqlData<any>('words', { filters: { word: word.word }, single: true });
  const saved = await mysqlData('words', { action: 'upsert', values: word });
  if (!existing) await recordActivity('word').catch(() => {});
  return saved;
}

export async function createSentence(sentence: any) {
  return mysqlData('sentences', { action: 'insert', values: sentence });
}

export async function upsertScene(scene: any) {
  const existing = await mysqlData<any>('scenes', { filters: { scene_name: scene.scene_name }, single: true });
  if (existing) {
    await mysqlData('scenes', { action: 'update', filters: { id: existing.id }, values: { practice_count: existing.practice_count + 1, last_practiced_at: new Date().toISOString().slice(0, 19).replace('T', ' ') } });
  } else {
    await mysqlData('scenes', { action: 'insert', values: scene });
  }
}

// ── 场景解锁进度 ──────────────────────────────────────
export async function fetchSceneProgress() {
  return mysqlData<any[]>('scene_progress');
}

export async function unlockScene(sceneKey: string) {
  await mysqlData('scene_progress', { action: 'upsert', values: {
    scene_key: sceneKey,
    is_unlocked: true,
    last_visited_at: new Date().toISOString(),
    visit_count: 1,
  } });
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
}

export async function incrementUserStats(field: string) {
  const stats = await mysqlData<any>('user_stats', { single: true });
  if (stats) {
    const updates: any = {};
    updates[field] = (stats[field] || 0) + 1;
    await mysqlData('user_stats', { action: 'update', values: updates });
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
}

export async function createHighFreqWord(word: string) {
  const today = formatLocalDate();
  const existing = await mysqlData<any>('high_freq_words', { filters: { word, study_date: today }, single: true });
  if (existing) {
    await mysqlData('high_freq_words', { action: 'update', filters: { id: existing.id }, values: { count: existing.count + 1 } });
  } else {
    await mysqlData('high_freq_words', { action: 'insert', values: { word, study_date: today, count: 1 } });
  }
}

// ── 日记相关 ──────────────────────────────────────────────

export async function fetchDiaries(type?: 'daily' | 'weekly') {
  return mysqlData<any[]>('diaries', { filters: type ? { diary_type: type } : {}, orderBy: 'created_at' });
}

export async function saveDiary(payload: { diary_type: 'daily' | 'weekly'; content: string; study_date?: string; week_start?: string }) {
  return mysqlData('diaries', { action: 'insert', values: payload });
}

export async function updateDiary(id: string, payload: { content: string }) {
  return mysqlData('diaries', { action: 'update', filters: { id }, values: payload });
}

export async function deleteDiary(id: string) {
  return mysqlData('diaries', { action: 'delete', filters: { id } });
}

// ── XP / 成长系统 ─────────────────────────────────────────

export async function fetchXpData() {
  const [stats, logs] = await Promise.all([
    mysqlData<any>('user_stats', { single: true }),
    mysqlData<any[]>('xp_logs', { orderBy: 'created_at', limit: 20 }),
  ]);
  return {
    stats: stats ?? { total_xp: 0, current_level: 1, streak_days: 0, last_checkin_date: null },
    logs,
  };
}

export async function addXp(source: string) {
  return invokeEdgeFunction('add-xp', { source });
}

export async function recordActivity(kind: 'scene' | 'word' | 'shadowing' | 'dialogue') {
  return invokeEdgeFunction('record-activity', { kind });
}

export async function clearLocalLearningData() {
  return invokeEdgeFunction('clear-local-data', {});
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
  return mysqlData<any>('learning_records', { filters: { id }, single: true });
}

export async function fetchSceneMapProgress(sceneId?: string) {
  return mysqlData<any[]>('scene_map_progress', { filters: sceneId ? { scene_id: sceneId } : {} });
}

export async function upsertSceneMapProgress(values: Record<string, unknown>) {
  return mysqlData('scene_map_progress', { action: 'upsert', values });
}

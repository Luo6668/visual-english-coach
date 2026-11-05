/** Pure domain rules: no React, storage, network or invented pronunciation scores. */
export type TaskGoal = { id: string; label: string; criterion: string };
export type TaskEvidence = { id: string; evidence: string };
export type ExpressionFeedback = { kind: 'correction' | 'natural' | 'none'; original: string; suggestion: string; explanation: string; translation?: string };
export type AssistResult = { hint: string; feedback: ExpressionFeedback | null; completedTasks: TaskEvidence[] };
export type ReviewAttempt = {
  id: string; at: string; text: string; method: 'typed' | 'voice' | 'none';
  mode: 'task' | 'familiarize'; task: string;
  keywordsViewed: boolean; referenceViewed: boolean; referenceAfterAttempt?: boolean;
  outcome: 'unassisted' | 'assisted' | 'familiarized' | 'skipped';
  effort?: 'easy' | 'effortful' | 'again';
};
export type ReviewItem = {
  id: string; target: string; original: string; explanation: string; scene: string; cue?: string;
  source: 'feedback' | 'saved'; createdAt: string; dueAt: string; attempts: number;
  history?: ReviewAttempt[];
  independentCount: number; lastOutcome?: 'hinted' | 'independent'; lastMethod?: 'typed' | 'voice' | 'self';
};
export type ReviewSeed = Pick<ReviewItem, 'target' | 'original' | 'explanation' | 'scene' | 'source'> & { cue?: string };
export const normalizeExpression = (text: string) => text.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim();
export const matchesPractice = (target: string, attempt: string) => Boolean(normalizeExpression(target)) && normalizeExpression(target) === normalizeExpression(attempt);

export function mergeTaskEvidence(previous: TaskEvidence[], incoming: TaskEvidence[]) {
  return Array.from(new Map([...previous, ...incoming].map(item => [item.id, item])).values());
}

export function reviewKey(owner: string) {
  if (!owner.trim()) throw new Error('请登录后使用复习');
  return `vec.learning-loop.v1.${encodeURIComponent(owner)}`;
}

export function addReviewItem(items: ReviewItem[], input: ReviewSeed, now = Date.now()): ReviewItem[] {
  const target = input.target.trim().slice(0, 600);
  if (!normalizeExpression(target)) throw new Error('请先选择有效的英语表达');
  const existing = items.find(item => normalizeExpression(item.target) === normalizeExpression(target));
  if (existing) {
    if (!existing.cue && input.cue?.trim()) return items.map(item => item.id === existing.id ? { ...item, cue: input.cue!.trim().slice(0, 600) } : item);
    return items;
  }
  if (items.length >= 300) throw new Error('复习夹已有 300 条，请先移除不再需要的表达');
  const item: ReviewItem = {
    ...input, cue: typeof input.cue === 'string' ? input.cue.trim().slice(0, 600) : '', target, original: input.original.slice(0, 600), explanation: input.explanation.slice(0, 600), scene: input.scene.slice(0, 100),
    id: `review-${now}-${Math.random().toString(36).slice(2, 9)}`, createdAt: new Date(now).toISOString(),
    dueAt: new Date(now).toISOString(), attempts: 0, independentCount: 0,
  };
  return [item, ...items];
}

export function dueReviews(items: ReviewItem[], now = Date.now()) {
  return items.filter(item => Date.parse(item.dueAt) <= now).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}

export function parseReviewStorage(raw: string | null): ReviewItem[] {
  if (raw === null) return [];
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !Array.isArray(value.items) || value.items.length > 300) throw new Error('复习数据格式异常，原数据已保留');
  for (const item of value.items) {
    if (!item || !['id', 'target', 'original', 'explanation', 'scene', 'createdAt', 'dueAt'].every(key => typeof item[key] === 'string') ||
      !normalizeExpression(item.target) || !Number.isFinite(Date.parse(item.dueAt)) || !Number.isFinite(Date.parse(item.createdAt)) ||
      !['saved', 'feedback'].includes(item.source) || !Number.isInteger(item.attempts) || item.attempts < 0 ||
      !Number.isInteger(item.independentCount) || item.independentCount < 0 || item.independentCount > item.attempts ||
      (item.cue !== undefined && typeof item.cue !== 'string') ||
      (item.history !== undefined && (!Array.isArray(item.history) || item.history.length > 20 || !item.history.every(validReviewAttempt) || new Set(item.history.map((entry: ReviewAttempt) => entry.id)).size !== item.history.length))) throw new Error('复习数据格式异常，原数据已保留');
  }
  if (new Set(value.items.map((item: ReviewItem) => item.id)).size !== value.items.length) throw new Error('复习数据出现重复记录，原数据已保留');
  return value.items;
}

/** Optional v2 records: old v1 queues are read without rewriting or inventing history. */
export function validReviewAttempt(entry: ReviewAttempt): boolean {
  return Boolean(entry && typeof entry.id === 'string' && entry.id && typeof entry.at === 'string' && Number.isFinite(Date.parse(entry.at)) &&
    typeof entry.text === 'string' && entry.text.length <= 1200 && typeof entry.task === 'string' && entry.task.length <= 600 &&
    ['typed', 'voice', 'none'].includes(entry.method) && ['task', 'familiarize'].includes(entry.mode) &&
    typeof entry.keywordsViewed === 'boolean' && typeof entry.referenceViewed === 'boolean' &&
    (entry.referenceAfterAttempt === undefined || typeof entry.referenceAfterAttempt === 'boolean') &&
    (entry.mode !== 'task' || Boolean(entry.task.trim())) &&
    ['unassisted', 'assisted', 'familiarized', 'skipped'].includes(entry.outcome) &&
    (entry.effort === undefined || ['easy', 'effortful', 'again'].includes(entry.effort)) &&
    (entry.outcome === 'skipped' || (entry.method !== 'none' && /[a-z]/i.test(entry.text))) &&
    (entry.outcome !== 'unassisted' || (entry.mode === 'task' && !entry.keywordsViewed && !entry.referenceViewed)) &&
    (entry.outcome !== 'familiarized' || (entry.mode === 'familiarize' && entry.referenceViewed)) &&
    (entry.outcome !== 'assisted' || (entry.mode === 'task' && (entry.keywordsViewed || entry.referenceViewed))));
}

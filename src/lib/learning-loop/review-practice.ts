import { normalizeExpression, validReviewAttempt, type ReviewAttempt, type ReviewItem } from './model';

export function reviewPrompt(item: ReviewItem): { mode: ReviewAttempt['mode']; label: string; task: string } {
  const cue = item.cue?.trim();
  if (cue && normalizeExpression(cue) !== normalizeExpression(item.target)) return { mode: 'task', label: '这次想表达的意思', task: cue };
  if (item.original.trim() && normalizeExpression(item.original) !== normalizeExpression(item.target)) return { mode: 'task', label: '试着改善原来的说法', task: item.original.trim() };
  return { mode: 'familiarize', label: '先熟悉这句收藏', task: '' };
}
export function reviewKeywords(target: string): string[] {
  const stop = new Set(['i', 'a', 'an', 'the', 'could', 'would', 'can', 'may', 'you', 'your', 'my', 'we', 'it', 'is', 'are', 'have', 'like', 'please', 'to', 'of', 'and', 'for', 'do', 'does', 'that', 'this', 'me']);
  const words = target.match(/[a-z]+(?:['’][a-z]+)?/gi) || [];
  return [...new Set(words.filter(word => !stop.has(word.toLowerCase())).map(word => word.toLowerCase()))].slice(0, 3);
}
export function reviewOutcome(attempt: Pick<ReviewAttempt, 'mode' | 'keywordsViewed' | 'referenceViewed'>): Exclude<ReviewAttempt['outcome'], 'skipped'> {
  if (attempt.mode === 'familiarize') return 'familiarized';
  return attempt.keywordsViewed || attempt.referenceViewed ? 'assisted' : 'unassisted';
}
export const reviewOutcomeLabel: Record<ReviewAttempt['outcome'], string> = {
  unassisted: '提交前未用提示', assisted: '借助提示完成尝试', familiarized: '跟读 / 输入熟悉', skipped: '暂时跳过',
};
/** User effort can adjust a plan, but is never treated as a correctness or speech score. */
export function reviewDelay(item: ReviewItem, attempt: Pick<ReviewAttempt, 'outcome' | 'effort'>): number {
  if (attempt.outcome === 'skipped') return 0;
  if (attempt.effort === 'again') return 30 * 60_000;
  if (attempt.effort !== 'easy' || attempt.outcome !== 'unassisted') return 86_400_000;
  let consecutive = 0;
  for (const entry of item.history || []) {
    if (entry.outcome === 'skipped') continue;
    if (entry.outcome !== 'unassisted' || entry.effort !== 'easy') break;
    consecutive++;
  }
  return [1, 3, 7, 14][Math.min(consecutive, 3)] * 86_400_000;
}
export function applyReviewAttempt(item: ReviewItem, attempt: ReviewAttempt): ReviewItem {
  if (!validReviewAttempt(attempt)) throw new Error('请先完成有效的英语尝试；练习记录未保存');
  if (item.history?.some(entry => entry.id === attempt.id)) return item;
  if (attempt.outcome !== 'skipped' && attempt.outcome !== reviewOutcome(attempt)) throw new Error('练习记录与提示使用情况不一致');
  const skipped = attempt.outcome === 'skipped';
  return { ...item, attempts: item.attempts + (skipped ? 0 : 1),
    dueAt: skipped ? item.dueAt : new Date(Date.parse(attempt.at) + reviewDelay(item, attempt)).toISOString(),
    history: [attempt, ...(item.history || [])].slice(0, 20),
    // Preserve v1 counters as history, rather than pretending new attempts are proven mastery.
    lastMethod: skipped || attempt.method === 'none' ? item.lastMethod : attempt.method };
}
export function updateReviewCue(item: ReviewItem, cue: string): ReviewItem {
  const task = cue.trim();
  if (!task || task.length > 600 || normalizeExpression(task) === normalizeExpression(item.target)) throw new Error('请填写与英文参考不同的中文意思或使用情境（最多 600 字）');
  return { ...item, cue: task };
}

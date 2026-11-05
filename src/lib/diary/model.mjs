export const MODE_LABELS = { natural: '自然表达', simple: '简单英语', polished: '润色表达' };
export function dateKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function validDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false; const d = new Date(`${value}T12:00:00`); return !Number.isNaN(+d) && dateKey(d) === value; }
export function weekStart(value) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() - (date.getDay() + 6) % 7); return dateKey(date); }
export function inWeek(value, start) { const end = new Date(`${start}T12:00:00`); end.setDate(end.getDate() + 7); return value >= start && value < dateKey(end); }
export function monthCells(value) { const [year, month] = value.split('-').map(Number); const first = new Date(year, month - 1, 1, 12); const count = new Date(year, month, 0, 12).getDate(); return [...Array((first.getDay() + 6) % 7).fill(null), ...Array.from({ length: count }, (_, i) => dateKey(new Date(year, month - 1, i + 1, 12)))]; }
/** @returns {{ source: string, mode: 'natural' | 'simple' | 'polished', candidates: Record<string, any>, savedId: string, savedSignature: string, sourceKind?: string }} */
export function emptyDraft() { return { source: '', mode: 'natural', candidates: {}, savedId: '', savedSignature: '' }; }
export function candidateCurrent(draft) { const candidate = draft.candidates[draft.mode]; return Boolean(candidate?.content?.trim() && candidate.source === draft.source); }
export function draftSignature(draft) { const item = draft.candidates[draft.mode]; return JSON.stringify([draft.source, draft.mode, item?.content || '']); }
export function draftFromEntry(entry) { const draft = emptyDraft(); draft.source = entry.source_text || ''; draft.mode = Object.hasOwn(MODE_LABELS, entry.writing_mode) ? entry.writing_mode : 'natural'; draft.savedId = entry.id; draft.sourceKind = entry.source_kind || 'legacy'; draft.candidates[draft.mode] = { source: draft.source, content: entry.content, expressions: Array.isArray(entry.learning_expressions) ? entry.learning_expressions : [] }; draft.savedSignature = draftSignature(draft); return draft; }
export function decodeDraft(raw) {
  if (!raw) return null;
  const value = JSON.parse(raw); const draft = value.draft;
  if (value.version !== 1 || typeof draft?.source !== 'string' || draft.source.length > 4000 || !Object.hasOwn(MODE_LABELS, draft.mode) || !draft.candidates || typeof draft.candidates !== 'object' || Array.isArray(draft.candidates)) throw new Error('草稿格式异常，未自动覆盖，请保留当前内容后重试');
  for (const [mode, item] of Object.entries(draft.candidates)) {
    if (!Object.hasOwn(MODE_LABELS, mode) || typeof item?.source !== 'string' || typeof item?.content !== 'string' || !Array.isArray(item.expressions)) throw new Error('草稿版本内容异常，未自动覆盖');
    item.expressions = item.expressions.filter(pair => typeof pair?.english === 'string' && typeof pair.chinese === 'string' && typeof pair.note === 'string' && item.content.includes(pair.english)).slice(0, 3);
  }
  return { ...draft, savedId: typeof draft.savedId === 'string' ? draft.savedId : '', savedSignature: typeof draft.savedSignature === 'string' ? draft.savedSignature : '' };
}
export function restoreDraft(stored, entry) {
  if (!stored) return entry ? draftFromEntry(entry) : emptyDraft();
  const empty = !stored.source && !Object.values(stored.candidates).some(item => item.content);
  const clean = draftSignature(stored) === stored.savedSignature;
  if (entry && (empty || clean)) return draftFromEntry(entry);
  if (stored.savedId && !entry) return { ...stored, savedId: '', savedSignature: '' };
  return stored;
}
export function recordDate(value) { const date = new Date(String(value || '').replace(' ', 'T')); return Number.isNaN(+date) ? '' : dateKey(date); }

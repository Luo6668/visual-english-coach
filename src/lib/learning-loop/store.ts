import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { createReviewRepository } from './repository';
import { applyReviewAttempt, updateReviewCue } from './review-practice';
import { addReviewItem, type ReviewAttempt, type ReviewSeed } from './model';

const repository = createReviewRepository({
  read: async key => Platform.OS === 'web' ? localStorage.getItem(key) : (await import('expo-sqlite/kv-store')).default.getItemAsync(key),
  write: async (key, value) => {
    if (Platform.OS === 'web') localStorage.setItem(key, value);
    else await (await import('expo-sqlite/kv-store')).default.setItemAsync(key, value);
  },
});
export const saveReviewExpression = (owner: string, input: ReviewSeed) => repository.mutate(owner, items => addReviewItem(items, input));
export const removeReviewExpression = (owner: string, id: string) => repository.mutate(owner, items => items.filter(item => item.id !== id));
export function useReviewQueue(owner?: string | null) {
  const items = useSyncExternalStore(repository.subscribe, () => repository.snapshot(owner), () => repository.snapshot(null));
  const [state, setState] = useState({ owner, error: '', loading: true });
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    if (!owner) { setState({ owner, error: '', loading: false }); return; }
    setState({ owner, error: '', loading: true });
    try { await repository.load(owner); if (request === generation.current) setState({ owner, error: '', loading: false }); }
    catch (e) { if (request === generation.current) setState({ owner, error: e instanceof Error ? e.message : '复习夹读取失败，请重试', loading: false }); }
  }, [owner]);
  useEffect(() => { void reload(); return () => { generation.current++; }; }, [reload]);
  return { items, error: state.owner === owner ? state.error : '', loading: state.owner !== owner || state.loading, reload };
}

export const recordReviewAttempt = (owner: string, id: string, attempt: ReviewAttempt) => repository.mutate(owner, items => {
  if (!items.some(item => item.id === id)) throw new Error('这条表达已移除，请刷新后再试');
  const next = items.map(item => item.id === id ? applyReviewAttempt(item, attempt) : item);
  return next.every((item, index) => item === items[index]) ? items : next;
});
export const saveReviewCue = (owner: string, id: string, cue: string) => repository.mutate(owner, items => {
  if (!items.some(item => item.id === id)) throw new Error('这条表达已移除，请刷新后再试');
  return items.map(item => item.id === id ? updateReviewCue(item, cue) : item);
});

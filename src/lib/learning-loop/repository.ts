import { parseReviewStorage, reviewKey, type ReviewItem } from './model';
export type ReviewStorage = { read: (key: string) => Promise<string | null>; write: (key: string, value: string) => Promise<void> };
/** Account-scoped serial mutations: failed writes never replace the visible snapshot. */
export function createReviewRepository(storage: ReviewStorage) {
  const cache = new Map<string, ReviewItem[]>();
  const queues = new Map<string, Promise<unknown>>();
  const pending = new Map<string, Promise<ReviewItem[]>>();
  const listeners = new Set<() => void>();
  const empty: ReviewItem[] = [];
  const publish = () => listeners.forEach(fn => fn());
  async function load(owner: string) {
    const key = reviewKey(owner);
    if (cache.has(owner)) return cache.get(owner)!;
    if (pending.has(owner)) return pending.get(owner)!;
    const request = storage.read(key).then(raw => { const items = parseReviewStorage(raw); cache.set(owner, items); publish(); return items; }).finally(() => pending.delete(owner));
    pending.set(owner, request);
    return request;
  }
  return {
    load,
    snapshot: (owner?: string | null) => owner ? (cache.get(owner) ?? empty) : empty,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    async mutate(owner: string, change: (items: ReviewItem[]) => ReviewItem[]) {
      reviewKey(owner);
      const operation = (queues.get(owner) ?? Promise.resolve()).catch(() => {}).then(async () => {
        const current = await load(owner);
        const next = change(current);
        if (next !== current) {
          await storage.write(reviewKey(owner), JSON.stringify({ version: 1, items: next }));
          cache.set(owner, next); publish();
        }
        return next;
      });
      queues.set(owner, operation);
      try { return await operation; } finally { if (queues.get(owner) === operation) queues.delete(owner); }
    },
  };
}

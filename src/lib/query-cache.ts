type CacheEntry = {
  data?: unknown;
  updatedAt: number;
  promise?: Promise<unknown>;
};

type InvalidationListener = (keys: readonly string[]) => void;

const cache = new Map<string, CacheEntry>();
const listeners = new Set<InvalidationListener>();
let cacheEpoch = 0;

export const QUERY_KEYS = {
  learningRecords: 'learning-records',
  scenes: 'scenes',
  words: 'words',
  sentences: 'sentences',
  userStats: 'user-stats',
  dailyStats: 'daily-stats',
  highFreqWords: 'high-freq-words',
  diaries: 'diaries',
  xpData: 'xp-data',
  sceneProgress: 'scene-progress',
  sceneMapProgress: 'scene-map-progress',
} as const;

export function queryKey(base: string, suffix?: string) {
  return suffix ? `${base}:${suffix}` : base;
}

export async function cachedQuery<T>(key: string, loader: () => Promise<T>, staleMs = 15_000): Promise<T> {
  const scopedKey = `${getDemoDataOwner()}::${key}`;
  const current = cache.get(scopedKey);
  const now = Date.now();
  if (current?.data !== undefined && now - current.updatedAt < staleMs) return current.data as T;
  if (current?.promise) return current.promise as Promise<T>;

  const startedAtEpoch = cacheEpoch;
  let promise: Promise<T>;
  promise = loader()
    .then((data) => {
      const activeEntry = cache.get(scopedKey);
      if (startedAtEpoch === cacheEpoch && activeEntry?.promise === promise) {
        cache.set(scopedKey, { data, updatedAt: Date.now() });
      } else if (activeEntry?.promise === promise) {
        cache.delete(scopedKey);
      }
      return data;
    })
    .catch((error) => {
      if (current?.data !== undefined) cache.set(scopedKey, current);
      else cache.delete(scopedKey);
      throw error;
    });

  cache.set(scopedKey, { data: current?.data, updatedAt: current?.updatedAt ?? 0, promise });
  return promise;
}

export function invalidateQueries(keys?: readonly string[]) {
  cacheEpoch += 1;
  const invalidated = keys?.length ? [...keys] : [...cache.keys()];
  if (keys?.length) {
    for (const key of cache.keys()) {
      if (keys.some((candidate) => key.endsWith(`::${candidate}`) || key.includes(`::${candidate}:`))) cache.delete(key);
    }
  } else {
    cache.clear();
  }
  for (const listener of listeners) listener(invalidated);
}

export function subscribeToQueryInvalidation(listener: InvalidationListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

import { getDemoDataOwner } from '@/lib/demoSession';


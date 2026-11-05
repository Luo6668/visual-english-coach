import * as SecureStore from 'expo-secure-store';
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { ALL_SCENES } from '@/lib/sceneMapData';

export type ProfilePreferences = {
  nickname: string;
  title: string;
  speechRate: number;
  dailyScenes: number;
  preferredScene: string;
};

export const DEFAULT_PROFILE_PREFERENCES: ProfilePreferences = Object.freeze({
  nickname: '',
  title: '',
  speechRate: 1,
  dailyScenes: 1,
  preferredScene: 'coffee-shop',
});

const cache = new Map<string, ProfilePreferences>();
const pending = new Map<string, Promise<ProfilePreferences>>();
const listeners = new Set<() => void>();
let activeOwner: string | null = null;
const keyFor = (owner: string) => `vec.profile.preferences.${encodeURIComponent(owner).replace(/%/g, '_')}`;

function normalize(input: Partial<ProfilePreferences>): ProfilePreferences {
  return {
    nickname: typeof input.nickname === 'string' ? input.nickname.trim().slice(0, 24) : '',
    title: typeof input.title === 'string' ? input.title : '',
    speechRate: [0.8, 1, 1.2].includes(Number(input.speechRate)) ? Number(input.speechRate) : 1,
    dailyScenes: [1, 3, 5].includes(Number(input.dailyScenes)) ? Number(input.dailyScenes) : 1,
    preferredScene: ALL_SCENES.some(scene => scene.id === input.preferredScene) ? input.preferredScene! : 'coffee-shop',
  };
}

export function getProfilePreferences(owner?: string | null) {
  return owner ? (cache.get(owner) ?? DEFAULT_PROFILE_PREFERENCES) : DEFAULT_PROFILE_PREFERENCES;
}

export async function loadProfilePreferences(owner: string): Promise<ProfilePreferences> {
  if (cache.has(owner)) return cache.get(owner)!;
  if (pending.has(owner)) return pending.get(owner)!;
  const request = (async () => {
    const raw =
      Platform.OS === 'web'
        ? localStorage.getItem(keyFor(owner))
        : await SecureStore.getItemAsync(keyFor(owner));
    let parsed: Partial<ProfilePreferences> = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {}
    const value = normalize(parsed && typeof parsed === 'object' ? parsed : {});
    cache.set(owner, value);
    listeners.forEach((listener) => listener());
    return value;
  })().finally(() => pending.delete(owner));
  pending.set(owner, request);
  return request;
}

export async function saveProfilePreferences(owner: string, changes: Partial<ProfilePreferences>) {
  if (!owner) throw new Error('请登录后保存个人偏好');
  const current = await loadProfilePreferences(owner);
  const next = normalize({ ...current, ...changes });
  const raw = JSON.stringify(next);
  if (Platform.OS === 'web') localStorage.setItem(keyFor(owner), raw);
  else await SecureStore.setItemAsync(keyFor(owner), raw);
  cache.set(owner, next);
  listeners.forEach((listener) => listener());
  return next;
}

export function activateProfilePreferences(owner: string | null) {
  activeOwner = owner;
  if (owner) void loadProfilePreferences(owner).catch(() => {});
}

export function getDefaultSpeechRate() {
  return getProfilePreferences(activeOwner).speechRate;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useProfilePreferences(owner?: string | null) {
  const preferences = useSyncExternalStore(
    subscribe,
    () => getProfilePreferences(owner),
    () => DEFAULT_PROFILE_PREFERENCES,
  );
  useEffect(() => {
    if (owner) void loadProfilePreferences(owner).catch(() => {});
  }, [owner]);
  return preferences;
}

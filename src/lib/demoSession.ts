export const DEMO_SESSION_KEY = 'visual-english-coach-demo-session';
export const DEMO_DATA_OWNER_KEY = 'visual-english-coach-demo-data-owner';
export const LEGACY_DEMO_OWNER = 'local-demo-user';

function storage() {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function hashEmail(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function accountDemoOwner(email: string) {
  return `local-account-${hashEmail(email.trim().toLowerCase())}`;
}

export function quickDemoOwner() {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `quick-demo-${random}`;
}

export function readDemoIdentity() {
  const currentStorage = storage();
  if (!currentStorage) return null;
  const email = currentStorage.getItem(DEMO_SESSION_KEY);
  if (!email) return null;
  return {
    email,
    ownerId: currentStorage.getItem(DEMO_DATA_OWNER_KEY) || LEGACY_DEMO_OWNER,
  };
}

export function saveDemoIdentity(email: string, ownerId: string) {
  const currentStorage = storage();
  if (!currentStorage) return;
  currentStorage.setItem(DEMO_SESSION_KEY, email);
  currentStorage.setItem(DEMO_DATA_OWNER_KEY, ownerId);
}

export function clearDemoIdentity() {
  const currentStorage = storage();
  if (!currentStorage) return;
  currentStorage.removeItem(DEMO_SESSION_KEY);
  currentStorage.removeItem(DEMO_DATA_OWNER_KEY);
}

export function getDemoDataOwner() {
  return storage()?.getItem(DEMO_DATA_OWNER_KEY) || LEGACY_DEMO_OWNER;
}

export function isQuickDemoOwner(ownerId: string) {
  return ownerId.startsWith('quick-demo-');
}

import { Platform } from 'react-native';

export const APP_COLORS = {
  ink: '#07162E',
  inkSoft: '#263B59',
  muted: '#687B99',
  blue: '#1478F5',
  blueStrong: '#075BEA',
  cyan: '#35C8FF',
  success: '#16A36A',
  warning: '#F47A18',
  danger: '#C83D4B',
  page: '#F5FAFF',
  surface: 'rgba(248,252,255,0.86)',
  surfaceStrong: 'rgba(255,255,255,0.94)',
  border: 'rgba(122,159,207,0.28)',
  glassBorder: 'rgba(255,255,255,0.94)',
} as const;

export const APP_RADIUS = {
  control: 18,
  card: 24,
  panel: 30,
  pill: 999,
} as const;

export const APP_SHADOW = {
  card: {
    shadowColor: '#365F89',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 7,
  },
  floating: {
    shadowColor: '#116FF2',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
  },
} as const;

export const APP_GLASS_WEB = Platform.OS === 'web'
  ? ({ backdropFilter: 'blur(20px) saturate(1.28)', WebkitBackdropFilter: 'blur(20px) saturate(1.28)' } as any)
  : null;

export const APP_GLASS_WEB_LIGHT = Platform.OS === 'web'
  ? ({ backdropFilter: 'blur(10px) saturate(1.12)', WebkitBackdropFilter: 'blur(10px) saturate(1.12)' } as any)
  : null;

import { supabaseConfigError } from '@/client/supabase';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '') || '';
const localUrl = (process.env.EXPO_PUBLIC_LOCAL_AI_URL || 'http://127.0.0.1:8787/functions/v1')
  .trim()
  .replace(/\/$/, '');

export const isLocalServiceMode = Boolean(supabaseConfigError);
export const localFunctionsBaseUrl = localUrl;
export const functionsBaseUrl = isLocalServiceMode ? localUrl : `${supabaseUrl}/functions/v1`;
export const publicServiceKey = isLocalServiceMode
  ? 'local-demo'
  : process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

export function functionUrl(name: string): string {
  return `${functionsBaseUrl}/${name}`;
}

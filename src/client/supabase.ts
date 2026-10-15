import { createClient } from '@supabase/supabase-js'
import 'expo-sqlite/localStorage/install';

const supabaseUrl: string = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co'
const supabaseAnonKey: string = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || 'placeholder'

export const supabaseConfigError =
  !process.env.EXPO_PUBLIC_SUPABASE_URL ||
  !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  supabaseUrl.includes('placeholder.supabase.co') ||
  supabaseAnonKey === 'placeholder' ||
  supabaseAnonKey === 'your-anon-key'
    ? 'Supabase 尚未配置。请在 .env 中填写 EXPO_PUBLIC_SUPABASE_URL 和 EXPO_PUBLIC_SUPABASE_ANON_KEY，然后重启应用。'
    : null

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

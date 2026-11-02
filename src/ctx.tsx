import { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase, supabaseConfigError } from '@/client/supabase';
import {
  accountDemoOwner,
  clearDemoIdentity,
  isQuickDemoOwner,
  quickDemoOwner,
  readDemoIdentity,
  saveDemoIdentity,
} from '@/lib/demoSession';

function createDemoSession(email: string, ownerId: string): Session {
  return {
    access_token: '', refresh_token: '', expires_in: 0, token_type: 'bearer',
    user: {
      id: ownerId, aud: 'authenticated', role: 'authenticated', email,
      app_metadata: {}, user_metadata: { demo: true, quickExperience: isQuickDemoOwner(ownerId) }, identities: [],
      created_at: new Date().toISOString(),
    },
  } as Session;
}

type SessionContextType = {
  session: Session | null;
  isLoading: boolean;
  isDemoMode: boolean;
  isQuickExperience: boolean;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<AuthActionResult>;
  startQuickExperience: () => Promise<AuthActionResult>;
  requestPasswordReset: (email: string) => Promise<AuthActionResult>;
  updatePassword: (password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
};

export type AuthActionResult = {
  error: string | null;
  message?: string;
  needsEmailConfirmation?: boolean;
};

const SessionContext = createContext<SessionContextType>({
  session: null,
  isLoading: true,
  isDemoMode: Boolean(supabaseConfigError),
  isQuickExperience: false,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  startQuickExperience: async () => ({ error: null }),
  requestPasswordReset: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (supabaseConfigError) {
      const identity = readDemoIdentity();
      setSession(identity ? createDemoSession(identity.email, identity.ownerId) : null);
      setIsLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setSession(session);
    });

    // iOS/Android 后台时 JS 线程挂起，autoRefreshToken 定时器停止，回前台需手动续期
    // Web 端定时器不受影响，autoRefreshToken 自动处理，无需额外触发
    const appStateSubscription = AppState.addEventListener('change', async (nextState) => {
      if (Platform.OS !== 'web' && appState.current.match(/inactive|background/) && nextState === 'active') {
        const { error } = await supabase.auth.refreshSession();
        if (error) {
          await supabase.auth.signOut();
        }
      }
      appState.current = nextState;
    });

    return () => {
      subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, []);

  const setDemoSession = (email: string, ownerId = accountDemoOwner(email)) => {
    const normalizedEmail = email.trim().toLowerCase();
    saveDemoIdentity(normalizedEmail, ownerId);
    setSession(createDemoSession(normalizedEmail, ownerId));
  };

  const signIn = async (email: string, password: string) => {
    if (supabaseConfigError) {
      setDemoSession(email);
      return { error: null };
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string) => {
    if (supabaseConfigError) {
      setDemoSession(email);
      return { error: null };
    }
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    return {
      error: error?.message ?? null,
      needsEmailConfirmation: !error && !data.session,
    };
  };

  const startQuickExperience = async () => {
    if (!supabaseConfigError) return { error: '快速体验仅在本地演示模式可用' };
    setDemoSession('guest@visualcoach.local', quickDemoOwner());
    return { error: null };
  };

  const requestPasswordReset = async (email: string) => {
    if (supabaseConfigError) {
      return {
        error: null,
        message: '当前是本地演示模式，不会发送邮件。返回登录页后输入这个邮箱即可继续。',
      };
    }

    const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}/reset-password`
      : Linking.createURL('reset-password');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    return {
      error: error?.message ?? null,
      message: error ? undefined : '重置链接已发送，请查看邮箱并在链接有效期内设置新密码。',
    };
  };

  const updatePassword = async (password: string) => {
    if (supabaseConfigError) {
      return { error: null, message: '本地演示账号无需重置密码。' };
    }
    const { error } = await supabase.auth.updateUser({ password });
    return {
      error: error?.message ?? null,
      message: error ? undefined : '密码已更新，你可以继续使用 Visual English Coach。',
    };
  };

  const signOut = async () => {
    if (supabaseConfigError) {
      clearDemoIdentity();
      setSession(null);
      return;
    }
    await supabase.auth.signOut();
  };

  return (
    <SessionContext.Provider value={{
      session,
      isLoading,
      isDemoMode: Boolean(supabaseConfigError),
      isQuickExperience: Boolean(session?.user.user_metadata?.quickExperience),
      signIn,
      signUp,
      startQuickExperience,
      requestPasswordReset,
      updatePassword,
      signOut,
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);

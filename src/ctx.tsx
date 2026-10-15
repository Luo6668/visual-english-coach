import { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase, supabaseConfigError } from '@/client/supabase';

const DEMO_SESSION_KEY = 'visual-english-coach-demo-session';

function createDemoSession(email: string): Session {
  return {
    access_token: '', refresh_token: '', expires_in: 0, token_type: 'bearer',
    user: {
      id: 'local-demo-user', aud: 'authenticated', role: 'authenticated', email,
      app_metadata: {}, user_metadata: { demo: true }, identities: [],
      created_at: new Date().toISOString(),
    },
  } as Session;
}

type SessionContextType = {
  session: Session | null;
  isLoading: boolean;
  isDemoMode: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextType>({
  session: null,
  isLoading: true,
  isDemoMode: Boolean(supabaseConfigError),
  signIn: async () => null,
  signUp: async () => null,
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (supabaseConfigError) {
      const email = localStorage.getItem(DEMO_SESSION_KEY);
      setSession(email ? createDemoSession(email) : null);
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

  const setDemoSession = (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    localStorage.setItem(DEMO_SESSION_KEY, normalizedEmail);
    setSession(createDemoSession(normalizedEmail));
  };

  const signIn = async (email: string, password: string) => {
    if (supabaseConfigError) {
      setDemoSession(email);
      return null;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error?.message ?? null;
  };

  const signUp = async (email: string, password: string) => {
    if (supabaseConfigError) {
      setDemoSession(email);
      return null;
    }
    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
    return error?.message ?? null;
  };

  const signOut = async () => {
    if (supabaseConfigError) {
      localStorage.removeItem(DEMO_SESSION_KEY);
      setSession(null);
      return;
    }
    await supabase.auth.signOut();
  };

  return (
    <SessionContext.Provider value={{ session, isLoading, isDemoMode: Boolean(supabaseConfigError), signIn, signUp, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);

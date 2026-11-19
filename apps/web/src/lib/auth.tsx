import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { api, onUnauthorized, type Profile } from './api';

interface AuthState {
  user: Profile | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  setUser(user: Profile): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const { setLocale } = useI18n();

  const setUser = useCallback(
    (next: Profile | null) => {
      setUserState(next);
      if (next?.locale) setLocale(next.locale);
    },
    [setLocale],
  );

  const refresh = useCallback(async () => {
    try {
      const { user: current } = await api.get<{ user: Profile | null }>('/auth/session');
      setUser(current);
    } catch {
      setUserState(null);
    } finally {
      setLoading(false);
    }
  }, [setUser]);

  useEffect(() => {
    void refresh();
    return onUnauthorized(() => setUserState(null));
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { user: next } = await api.post<{ user: Profile }>('/auth/login', { email, password });
      setUser(next);
    },
    [setUser],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUserState(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, setUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}

/** The signed-in user; only for pages behind the login. */
export function useUser(): Profile {
  const { user } = useAuth();
  if (!user) throw new Error('No user');
  return user;
}

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { api, tokenStore, ApiError } from './api';
import { clearApiCache } from './use-cached-api';
import type { Language, Role } from '@classconnect/shared';

export interface SessionUser {
  id: string;
  fullName: string;
  roles: Role[];
  preferredLanguage: Language;
  phoneVerified: boolean;
  emailVerified: boolean;
  mfaEnabled: boolean;
}

interface AuthValue {
  user: SessionUser | null;
  loading: boolean;
  /**
   * Returns the signed-in user, so the caller can route on their roles.
   *
   * Reading `user` from context immediately after would be a race: the state
   * update has not been applied yet on the tick the caller resumes, so it would
   * see the previous value — null — and send a signed-in administrator to the
   * public landing page.
   */
  signIn: (tokens: { accessToken: string; refreshToken: string }) => Promise<SessionUser | null>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const load = useCallback(async (): Promise<SessionUser | null> => {
    if (!tokenStore.access) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const me = await api<SessionUser>('/auth/me', { language });
      setUser(me);
      return me;
    } catch (error) {
      // A 401 here means the refresh token is gone or revoked (FR-AUT-006).
      if (error instanceof ApiError && error.status === 401) tokenStore.clear();
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  const signIn = useCallback(
    async (tokens: { accessToken: string; refreshToken: string }) => {
      tokenStore.set(tokens);
      setLoading(true);
      return load();
    },
    [load],
  );

  const signOut = useCallback(async () => {
    try {
      // FR-AUT-006: end the session server-side, not merely in this browser.
      await api<void>('/auth/sessions/revoke-all', { method: 'POST', language });
    } catch {
      // Signing out must succeed locally even when the network does not.
    }
    tokenStore.clear();
    // The next person at this keyboard must not inherit the last one's data.
    clearApiCache();
    setUser(null);
    router.push(`/${language}/sign-in`);
  }, [language, router]);

  const value = useMemo(
    () => ({
      user,
      loading,
      signIn,
      signOut,
      refresh: async () => {
        await load();
      },
    }),
    [user, loading, signIn, signOut, load],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside an AuthProvider');
  return value;
}

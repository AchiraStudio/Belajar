import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ErrorState, Skeleton } from '../../components/ui';
import { apiFetch, ApiError, UNAUTHORIZED_EVENT } from '../../services/api/client';
import { dropCache } from '../../services/api/rpc';
import { LoginView } from './LoginView';
import styles from './Auth.module.css';

type AuthState = 'checking' | 'anonymous' | 'authenticated' | 'unreachable';

interface AuthContextValue {
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({ logout: async () => {} });

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

interface SessionResponse {
  authenticated?: boolean;
}

/**
 * Gates the app behind the server session (`GET /api/session`, `POST /api/login`). The cookie is
 * HttpOnly, so the client never sees or stores the credential — only whether a session exists.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>('checking');
  const [failure, setFailure] = useState('');

  const check = useCallback(async (signal?: AbortSignal) => {
    setState('checking');
    try {
      const res = await apiFetch<SessionResponse>('/api/session', { signal, timeoutMs: 10_000 });
      if (signal?.aborted) return;
      setState(res.authenticated ? 'authenticated' : 'anonymous');
    } catch (err) {
      if (signal?.aborted) return;
      setFailure(err instanceof ApiError ? err.message : 'Server tidak terjangkau.');
      setState('unreachable');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void check(controller.signal);
    return () => controller.abort();
  }, [check]);

  useEffect(() => {
    const onUnauthorized = () => {
      dropCache();
      setState((prev) => (prev === 'authenticated' ? 'anonymous' : prev));
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/logout', { method: 'POST', body: {} });
    } finally {
      dropCache();
      setState('anonymous');
    }
  }, []);

  const value = useMemo(() => ({ logout }), [logout]);

  if (state === 'checking') {
    return (
      <div className={styles.screen} aria-busy="true" aria-label="Memeriksa sesi">
        <div className={styles.skeletonCard}>
          <Skeleton width="48px" height="48px" circle />
          <Skeleton width="60%" height="24px" />
          <Skeleton height="44px" borderRadius="12px" />
        </div>
      </div>
    );
  }

  if (state === 'unreachable') {
    return (
      <div className={styles.screen}>
        <ErrorState
          title="Server tidak terjangkau"
          message={failure || 'Periksa koneksi internet atau alamat server, lalu coba lagi.'}
          isOffline
          onRetry={() => void check()}
        />
      </div>
    );
  }

  if (state === 'anonymous') {
    return <LoginView onSuccess={() => setState('authenticated')} />;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

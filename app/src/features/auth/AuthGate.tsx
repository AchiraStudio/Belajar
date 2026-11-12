import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, ApiError, UNAUTHORIZED_EVENT } from '../../services/api/client';
import { tr } from '../../services/i18n';
import { dropCache } from '../../services/api/rpc';
import { INITIAL_STEPS, runBoot, startupTiming, type StartupStep, type StepId, type StepState } from '../startup/boot';
import { StartupScreen } from '../startup/StartupScreen';
import { LoginView } from './LoginView';

type AuthState = 'checking' | 'anonymous' | 'authenticated' | 'unreachable';

interface AuthContextValue {
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({ logout: async () => {} });

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

/**
 * Gates the app behind the server session. It runs the startup sequence (see features/startup) behind
 * the animated startup screen: reach the server, check for a session, preload the first screens. The
 * cookie is HttpOnly, so the client never sees or stores the credential, only whether a session exists.
 *
 * The startup screen is an overlay: the app (or the login form) mounts underneath as soon as the answer
 * is known, and the overlay lifts away, so nothing flashes in between.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>('checking');
  const [overlay, setOverlay] = useState<'on' | 'leaving' | 'off'>('on');
  const [steps, setSteps] = useState<StartupStep[]>(INITIAL_STEPS);
  const [retry, setRetry] = useState<{ n: number; total: number } | null>(null);
  const [failure, setFailure] = useState('');
  const leaveTimer = useRef(0);

  const setStep = useCallback((id: StepId, next: StepState) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, state: next } : s)));
  }, []);

  const check = useCallback(
    async (signal?: AbortSignal) => {
      const began = Date.now();
      window.clearTimeout(leaveTimer.current);
      setState('checking');
      setOverlay('on');
      setFailure('');
      setSteps(INITIAL_STEPS);
      try {
        const { authenticated } = await runBoot({ setStep, setRetry, signal });
        if (signal?.aborted) return;
        // Let the panda finish its intro even when everything answered instantly.
        const { minMs, leaveMs } = startupTiming();
        const wait = Math.max(0, minMs - (Date.now() - began));
        if (wait > 0) await new Promise((r) => window.setTimeout(r, wait));
        if (signal?.aborted) return;
        setState(authenticated ? 'authenticated' : 'anonymous');
        setOverlay('leaving');
        leaveTimer.current = window.setTimeout(() => setOverlay('off'), leaveMs);
      } catch (err) {
        if (signal?.aborted) return;
        setFailure(err instanceof ApiError || err instanceof Error ? err.message : '');
        setState('unreachable');
      }
    },
    [setStep],
  );

  useEffect(() => {
    const controller = new AbortController();
    void check(controller.signal);
    return () => {
      controller.abort();
      window.clearTimeout(leaveTimer.current);
    };
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

  const error = state === 'unreachable' ? { title: tr('Server tidak terjangkau'), message: failure || tr('Periksa koneksi internet atau alamat server, lalu coba lagi.') } : null;

  return (
    <>
      {state === 'anonymous' && <LoginView onSuccess={() => setState('authenticated')} />}
      {state === 'authenticated' && <AuthContext.Provider value={value}>{children}</AuthContext.Provider>}
      {overlay !== 'off' && <StartupScreen steps={steps} retry={retry} error={error} leaving={overlay === 'leaving'} onRetry={() => void check()} />}
    </>
  );
}

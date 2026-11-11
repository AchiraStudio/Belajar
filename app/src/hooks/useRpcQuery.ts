import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/api/client';
import { rpcCall } from '../services/api/rpc';

export interface RpcQueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** The server answered, but this capability is not available (e.g. the AI layer is not configured). */
  unavailable: boolean;
  reload: () => void;
}

/**
 * The server answers "Layanan AI belum dikonfigurasi di server ini." for actions that need the AI
 * layer, which is not ported to the Rust server yet. Screens show an honest unavailable state.
 */
export function isUnavailableMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return /layanan ai|ai (belum|tidak)|belum dikonfigurasi|belum tersedia/i.test(message);
}

export function errorMessage(err: unknown, fallback = 'Terjadi kesalahan.'): string {
  if (err instanceof ApiError || err instanceof Error) return err.message || fallback;
  return fallback;
}

/**
 * Loads one RPC read action. Re-runs when `action` or the serialised payload changes, ignores
 * stale responses, and never reports results after unmount.
 */
export function useRpcQuery<T>(action: string, payload?: unknown, enabled = true): RpcQueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(payload ?? {});
  const latest = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const run = ++latest.current;
    setLoading(true);
    rpcCall<T>(action, payload, { bypassCache: tick > 0 })
      .then((res) => {
        if (run !== latest.current) return;
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (run !== latest.current) return;
        setError(errorMessage(err));
      })
      .finally(() => {
        if (run === latest.current) setLoading(false);
      });
    return () => {
      latest.current++;
    };
    // `payload` is tracked through its serialised `key`.
  }, [action, key, enabled, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, unavailable: isUnavailableMessage(error), reload };
}

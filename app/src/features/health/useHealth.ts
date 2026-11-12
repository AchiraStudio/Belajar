import { useEffect, useState } from 'react';
import { tr } from '../../services/i18n';
import { apiFetch } from '../../services/api/client';

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

export type HealthState =
  | { kind: 'loading' }
  | { kind: 'ok'; version: string }
  | { kind: 'down'; message: string };

/**
 * Polls `GET /api/v1/health`. Replaces the legacy "PC lokal offline" probe: the question is now
 * simply "can this client reach the server". Polling pauses while the page is hidden so a
 * backgrounded phone does not wake the radio for nothing.
 */
export function useHealth(intervalMs = 15_000): HealthState {
  const [state, setState] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(() => void check(), intervalMs);
        return;
      }
      try {
        const health = await apiFetch<HealthResponse>('/health', {
          signal: controller.signal,
          timeoutMs: 8_000,
        });
        if (controller.signal.aborted) return;
        setState({ kind: 'ok', version: health.version });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          kind: 'down',
          message: error instanceof Error ? error.message : tr('Server tidak terjangkau.'),
        });
      }
      timer = setTimeout(() => void check(), intervalMs);
    };

    void check();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [intervalMs]);

  return state;
}

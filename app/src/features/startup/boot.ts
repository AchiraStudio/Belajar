import { apiFetch, ApiError } from '../../services/api/client';
import { rpcCall } from '../../services/api/rpc';

export type StepId = 'server' | 'session' | 'data';
export type StepState = 'pending' | 'active' | 'done' | 'skipped' | 'error';
export interface StartupStep {
  id: StepId;
  state: StepState;
}

export const INITIAL_STEPS: StartupStep[] = [
  { id: 'server', state: 'pending' },
  { id: 'session', state: 'pending' },
  { id: 'data', state: 'pending' },
];

/**
 * How long the startup screen stays up. The minimum lets the panda finish its intro even when
 * everything is instant; reduced motion gets a short one, and tests none.
 */
export function startupTiming(): { minMs: number; leaveMs: number; retryGapMs: number } {
  if (import.meta.env.MODE === 'test') return { minMs: 0, leaveMs: 0, retryGapMs: 0 };
  const calm = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return calm ? { minMs: 700, leaveMs: 160, retryGapMs: 1200 } : { minMs: 2400, leaveMs: 520, retryGapMs: 1200 };
}

export class BootError extends Error {
  constructor(
    message: string,
    readonly step: StepId,
  ) {
    super(message);
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const id = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(id);
      resolve();
    });
  });

/** Retries a flaky call a few times (a phone waking its radio, a server a second behind the window). */
async function withRetry<T>(
  step: StepId,
  fn: () => Promise<T>,
  { attempts, gapMs, onRetry, signal }: { attempts: number; gapMs: number; onRetry: (n: number, total: number) => void; signal?: AbortSignal },
): Promise<T> {
  let last: unknown;
  for (let n = 1; n <= attempts; n += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (signal?.aborted) break;
      // A real answer from the server (even an error) means it is reachable; only network trouble retries.
      if (err instanceof ApiError && err.status > 0 && step !== 'server') break;
      if (n < attempts) {
        onRetry(n + 1, attempts);
        await sleep(gapMs, signal);
      }
    }
  }
  throw last;
}

interface SessionResponse {
  authenticated?: boolean;
}

/**
 * The startup sequence. Each step is real work, and the screen reports exactly what is happening:
 *  1. reach the server (`/api/v1/health`);
 *  2. ask whether a session exists (`/api/session`);
 *  3. if signed in, load the first screens' data into the RPC cache, so they open instantly.
 * Step 3 never blocks startup on failure: a page simply loads its own data when opened.
 */
export async function runBoot({
  setStep,
  setRetry,
  signal,
}: {
  setStep: (id: StepId, state: StepState) => void;
  setRetry: (info: { n: number; total: number } | null) => void;
  signal?: AbortSignal;
}): Promise<{ authenticated: boolean }> {
  const retry = (n: number, total: number) => setRetry({ n, total });

  setStep('server', 'active');
  try {
    await withRetry('server', () => apiFetch('/api/v1/health', { signal, timeoutMs: 6000 }), { attempts: 3, gapMs: startupTiming().retryGapMs, onRetry: retry, signal });
  } catch (err) {
    setStep('server', 'error');
    throw new BootError(err instanceof Error ? err.message : '', 'server');
  }
  setRetry(null);
  setStep('server', 'done');

  setStep('session', 'active');
  let authenticated = false;
  try {
    const res = await withRetry('session', () => apiFetch<SessionResponse>('/api/session', { signal, timeoutMs: 10_000 }), { attempts: 2, gapMs: Math.round(startupTiming().retryGapMs * 0.66), onRetry: retry, signal });
    authenticated = Boolean(res.authenticated);
  } catch (err) {
    setStep('session', 'error');
    throw new BootError(err instanceof Error ? err.message : '', 'session');
  }
  setRetry(null);
  setStep('session', 'done');

  if (!authenticated) {
    setStep('data', 'skipped');
    return { authenticated };
  }

  setStep('data', 'active');
  await Promise.allSettled([
    rpcCall('dashboard', undefined, { signal }),
    rpcCall('list_documents', {}, { signal }),
    rpcCall('list_subjects', undefined, { signal }),
    rpcCall('get_settings', undefined, { signal }),
  ]);
  setStep('data', 'done');
  return { authenticated };
}

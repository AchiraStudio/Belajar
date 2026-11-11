// Typed fetch wrapper for /api/v1 and /api. Understands the server error model (ADR-7):
//   { "error": { "code": "...", "message": "<Indonesian>", "retryable": false } }
import { config } from '../../config';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type TokenProvider = () => Promise<string | null> | string | null;
let tokenProvider: TokenProvider | null = null;

/** Auth plugs in here in Stage 3 (Supabase access token). The client never stores credentials. */
export function setTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Milliseconds before giving up; default 25 s like the legacy RPC. */
  timeoutMs?: number;
}

/** Fired when the server answers 401 so the app can return to the login screen. */
export const UNAUTHORIZED_EVENT = 'belajar:unauthorized';

const NETWORK_MESSAGE = 'Tidak dapat terhubung ke server. Periksa koneksi internet.';

export function apiUrl(path: string, base: string = config.apiBaseUrl): string {
  if (!path.startsWith('/')) throw new Error(`API path must start with "/": ${path}`);
  if (path.startsWith('/api/')) return `${base}${path}`;
  return `${base}/api/v1${path}`;
}

interface ErrorPayload {
  error?: { code?: string; message?: string; retryable?: boolean } | string;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';
  const token = tokenProvider ? await tokenProvider() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const timeout = AbortSignal.timeout(options.timeoutMs ?? 25_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers,
      body: options.body === undefined ? undefined : isFormData ? (options.body as BodyInit) : JSON.stringify(options.body),
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error; // the caller cancelled: not an API failure
    throw new ApiError(NETWORK_MESSAGE, 'network', 0, true);
  }

  if (response.ok) return (await response.json()) as T;

  // Only the session-protected RPC routes mean "you are logged out". A 401 from an optional /api/v1
  // call (profile, saved opportunities) is that feature's own problem and must not end the session.
  if (response.status === 401 && typeof window !== 'undefined' && path.startsWith('/api/rpc/')) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  let payload: ErrorPayload | null = null;
  try {
    payload = (await response.json()) as ErrorPayload;
  } catch {
    // not JSON (proxy error page, etc.)
  }

  const detail = payload?.error;
  if (typeof detail === 'string') {
    throw new ApiError(detail, 'rpc_error', response.status, response.status >= 500);
  }

  throw new ApiError(
    detail?.message ?? `Terjadi kesalahan (${response.status})`,
    detail?.code ?? 'http_error',
    response.status,
    detail?.retryable ?? response.status >= 500,
  );
}

export interface SseEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * POSTs to a streaming route (`text/event-stream`, lines of `data: {json}`) and calls `onEvent`
 * for every event. Resolves `'streamed'` once the stream ends, or `'not-stream'` when the server
 * did not answer with an event stream (route missing / different content type) so the caller can
 * fall back to the plain RPC action. Throws {@link ApiError} for HTTP errors and network failures.
 */
export async function apiStream(
  path: string,
  body: unknown,
  opts: { signal?: AbortSignal; onEvent: (event: SseEvent) => void },
): Promise<'streamed' | 'not-stream'> {
  const token = tokenProvider ? await tokenProvider() : null;
  const headers: Record<string, string> = { Accept: 'text/event-stream', 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(apiUrl(path), { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal });
  } catch (error) {
    if (opts.signal?.aborted) throw error;
    throw new ApiError(NETWORK_MESSAGE, 'network', 0, true);
  }

  if (response.status === 401 && typeof window !== 'undefined' && path.startsWith('/api/chat/')) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  const isStream = (response.headers.get('content-type') ?? '').includes('text/event-stream');
  if (!response.ok && !isStream) {
    if (response.status === 404 || response.status === 405 || response.status === 501) return 'not-stream';
    let message = `Terjadi kesalahan (${response.status})`;
    try {
      const payload = (await response.json()) as ErrorPayload;
      const detail = payload?.error;
      message = typeof detail === 'string' ? detail : (detail?.message ?? message);
    } catch {
      /* not JSON */
    }
    throw new ApiError(message, 'http_error', response.status, response.status >= 500);
  }
  if (!isStream || !response.body) return 'not-stream';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (opts.signal?.aborted) throw error;
        throw new ApiError(NETWORK_MESSAGE, 'network', 0, true);
      }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue; // comments (": ping") and blanks
        let event: SseEvent;
        try {
          event = JSON.parse(trimmed.slice(6)) as SseEvent;
        } catch {
          continue; // ignore a malformed frame, keep reading
        }
        opts.onEvent(event); // errors thrown by the caller propagate unchanged
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
  }
  return 'streamed';
}

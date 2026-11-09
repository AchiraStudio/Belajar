// Typed fetch wrapper for /api/v1. Understands the server error model (ADR-7):
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

const NETWORK_MESSAGE = 'Tidak dapat terhubung ke server. Periksa koneksi internet.';

export function apiUrl(path: string, base: string = config.apiBaseUrl): string {
  if (!path.startsWith('/')) throw new Error(`API path must start with "/": ${path}`);
  return `${base}/api/v1${path}`;
}

interface ErrorPayload {
  error?: { code?: string; message?: string; retryable?: boolean };
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = tokenProvider ? await tokenProvider() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const timeout = AbortSignal.timeout(options.timeoutMs ?? 25_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error; // the caller cancelled: not an API failure
    throw new ApiError(NETWORK_MESSAGE, 'network', 0, true);
  }

  if (response.ok) return (await response.json()) as T;

  let payload: ErrorPayload | null = null;
  try {
    payload = (await response.json()) as ErrorPayload;
  } catch {
    // not JSON (proxy error page, etc.)
  }
  const detail = payload?.error;
  throw new ApiError(
    detail?.message ?? `Terjadi kesalahan (${response.status})`,
    detail?.code ?? 'http_error',
    response.status,
    detail?.retryable ?? response.status >= 500,
  );
}

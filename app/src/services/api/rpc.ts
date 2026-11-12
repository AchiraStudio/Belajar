import { apiFetch, ApiError, type RequestOptions } from './client';
import { tr } from '../i18n';

export interface RpcOptions extends RequestOptions {
  bypassCache?: boolean;
}

export interface Adr7ErrorDetail {
  code?: string;
  message?: string;
  retryable?: boolean;
}

interface RpcResponse<T> {
  ok?: boolean;
  data?: T;
  error?: string | Adr7ErrorDetail;
}

interface CacheEntry {
  data: unknown;
  timestamp: number;
  gen: number;
}

export const READ_ACTIONS = new Set<string>([
  'list_subjects',
  'list_documents',
  'get_document',
  'list_quizzes',
  'dashboard',
  'progress',
  'cards_stats',
  'cards_due',
  'concepts_list',
  'get_settings',
  'play_hub',
  'play_map',
  'mindmap_get',
  'get_attempt',
  'chat_get',
  'ping',
]);

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<any>>();
let rpcGen = 0;

export function dropCache(): void {
  cache.clear();
  rpcGen++;
}

export function getCacheGeneration(): number {
  return rpcGen;
}

function cloneData<T>(data: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data));
}

/**
 * Executes a typed RPC call to POST /api/rpc/:action.
 * Automatically handles 30s read caching for idempotent actions, in-flight request deduplication,
 * AbortSignal isolation, ADR-7 structured error parsing, and reference isolation.
 */
export async function rpcCall<TResult = unknown>(
  action: string,
  payload?: unknown,
  options: RpcOptions = {},
): Promise<TResult> {
  const isRead = READ_ACTIONS.has(action);
  const cacheKey = `${action}:${JSON.stringify(payload ?? {})}`;
  const now = Date.now();

  // 1. Check read cache
  if (isRead && !options.bypassCache) {
    const cached = cache.get(cacheKey);
    if (cached && cached.gen === rpcGen && now - cached.timestamp < CACHE_TTL_MS) {
      return cloneData(cached.data as TResult);
    }
  }

  // 2. Mutating action: evict cache immediately
  if (!isRead) {
    dropCache();
  }

  // 3. Request deduplication for read actions without caller-specific AbortSignal
  // Finding B fix: requests with an AbortSignal bypass inFlight to prevent cross-contamination
  const canDedupe = isRead && !options.bypassCache && !options.signal;
  if (canDedupe && inFlight.has(cacheKey)) {
    // Finding C fix: clone deduplicated in-flight data for complete reference isolation
    const sharedResult = await inFlight.get(cacheKey)!;
    return cloneData(sharedResult as TResult);
  }

  const currentGen = rpcGen;
  const executeCall = async (): Promise<TResult> => {
    try {
      const response = await apiFetch<RpcResponse<TResult>>(`/api/rpc/${action}`, {
        method: 'POST',
        body: payload ?? {},
        signal: options.signal,
        timeoutMs: options.timeoutMs,
      });

      // Finding A fix: parse ADR-7 structured error object or string
      if (response) {
        if (response.error) {
          if (typeof response.error === 'string') {
            throw new ApiError(response.error, 'rpc_error', 400, false);
          }
          const errDetail = response.error;
          throw new ApiError(
            errDetail.message ?? tr('Terjadi kesalahan pada server.'),
            errDetail.code ?? 'rpc_error',
            400,
            Boolean(errDetail.retryable),
          );
        }
        if (response.ok === false) {
          throw new ApiError(tr('Operasi gagal.'), 'rpc_error', 400, false);
        }
      }

      const result = (response && response.data !== undefined ? response.data : (response as unknown as TResult));

      // Cache read responses if cache generation hasn't invalidated during flight
      if (isRead && currentGen === rpcGen) {
        cache.set(cacheKey, {
          data: cloneData(result),
          timestamp: Date.now(),
          gen: currentGen,
        });
      }

      return result;
    } finally {
      if (canDedupe) {
        inFlight.delete(cacheKey);
      }
    }
  };

  const promise = executeCall();
  if (canDedupe) {
    inFlight.set(cacheKey, promise);
  }

  // Finding C fix: clone result for the primary caller as well
  const resolvedResult = await promise;
  return cloneData(resolvedResult);
}

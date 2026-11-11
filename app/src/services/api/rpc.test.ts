import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { dropCache, rpcCall } from './rpc';

function mockFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn((url: string, init: RequestInit) => Promise.resolve(impl(url, init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('rpcCall', () => {
  beforeEach(() => {
    dropCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    dropCache();
  });

  it('sends POST /api/rpc/:action and unwraps { ok: true, data } response', async () => {
    const fetchMock = mockFetch((url, init) => {
      expect(url).toBe('/api/rpc/dashboard');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ streak_only: true });
      return Response.json({ ok: true, data: { streak: 5 } });
    });

    const result = await rpcCall<{ streak: number }>('dashboard', { streak_only: true });
    expect(result).toEqual({ streak: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches read actions and avoids duplicate network calls within TTL', async () => {
    let callCount = 0;
    const fetchMock = mockFetch(() => {
      callCount++;
      return Response.json({ ok: true, data: { count: callCount } });
    });

    const first = await rpcCall<{ count: number }>('list_documents');
    const second = await rpcCall<{ count: number }>('list_documents');

    expect(first).toEqual({ count: 1 });
    expect(second).toEqual({ count: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bypasses cache when bypassCache option is specified', async () => {
    let callCount = 0;
    mockFetch(() => {
      callCount++;
      return Response.json({ ok: true, data: { count: callCount } });
    });

    const first = await rpcCall<{ count: number }>('list_documents');
    const second = await rpcCall<{ count: number }>('list_documents', {}, { bypassCache: true });

    expect(first).toEqual({ count: 1 });
    expect(second).toEqual({ count: 2 });
  });

  it('evicts cache when a mutating action is executed', async () => {
    let readCallCount = 0;
    mockFetch((url) => {
      if (url.includes('list_documents')) {
        readCallCount++;
        return Response.json({ ok: true, data: { count: readCallCount } });
      }
      return Response.json({ ok: true, data: { status: 'created' } });
    });

    const first = await rpcCall<{ count: number }>('list_documents');
    expect(first).toEqual({ count: 1 });

    // Mutating action (not in READ_ACTIONS)
    await rpcCall('update_document', { id: 1, title: 'Updated' });

    // Next read should fetch fresh data
    const second = await rpcCall<{ count: number }>('list_documents');
    expect(second).toEqual({ count: 2 });
  });

  it('deduplicates concurrent in-flight requests for identical read calls', async () => {
    let fetchCalls = 0;
    mockFetch(async () => {
      fetchCalls++;
      await new Promise((res) => setTimeout(res, 20));
      return Response.json({ ok: true, data: { status: 'ok' } });
    });

    const [res1, res2] = await Promise.all([
      rpcCall('dashboard'),
      rpcCall('dashboard'),
    ]);

    expect(res1).toEqual({ status: 'ok' });
    expect(res2).toEqual({ status: 'ok' });
    expect(fetchCalls).toBe(1);
  });

  it('provides reference isolation between in-flight callers', async () => {
    mockFetch(async () => {
      await new Promise((res) => setTimeout(res, 20));
      return Response.json({ ok: true, data: { user: { name: 'Budi', score: 100 } } });
    });

    const [res1, res2] = await Promise.all([
      rpcCall<{ user: { name: string; score: number } }>('dashboard'),
      rpcCall<{ user: { name: string; score: number } }>('dashboard'),
    ]);

    expect(res1).not.toBe(res2);
    res1.user.score = 999;
    expect(res2.user.score).toBe(100);
  });

  it('isolates AbortSignal so caller A aborting does not abort caller B', async () => {
    const controllerA = new AbortController();
    let abortedSignalReceived = false;

    mockFetch(async (_url, init) => {
      const signal = init.signal;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 50);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          abortedSignalReceived = true;
          reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      });
      return Response.json({ ok: true, data: { result: 'success' } });
    });

    const promiseA = rpcCall('dashboard', {}, { signal: controllerA.signal });
    const promiseB = rpcCall('dashboard', {});

    setTimeout(() => {
      controllerA.abort();
    }, 10);

    await expect(promiseA).rejects.toThrow();
    expect(abortedSignalReceived).toBe(true);

    const resultB = await promiseB;
    expect(resultB).toEqual({ result: 'success' });
  });

  it('throws ApiError when response contains an error message', async () => {
    mockFetch(() =>
      Response.json(
        { error: 'Dokumen tidak ditemukan.' },
        { status: 400 },
      ),
    );

    await expect(rpcCall('get_document', { id: 999 })).rejects.toThrow(ApiError);
  });

  it('parses ADR-7 structured error object in HTTP 200 response', async () => {
    mockFetch(() =>
      Response.json({
        ok: false,
        error: {
          code: 'quiz_expired',
          message: 'Waktu ujian telah habis.',
          retryable: true,
        },
      }),
    );

    let caught: any = null;
    try {
      await rpcCall('check_answer');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught.message).toBe('Waktu ujian telah habis.');
    expect(caught.code).toBe('quiz_expired');
    expect(caught.status).toBe(400);
    expect(caught.retryable).toBe(true);
  });
});

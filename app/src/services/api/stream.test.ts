import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, UNAUTHORIZED_EVENT, apiFetch, apiStream, type SseEvent } from './client';

function sse(frames: string[], status = 200, contentType = 'text/event-stream; charset=utf-8') {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(enc.encode(f));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'Content-Type': contentType } });
}

describe('apiStream', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses data frames split across chunks, ignores pings and malformed frames', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse([': ping\n\n', 'data: {"type":"chunk","chunk":"Hal', 'o"}\n\n', 'data: {not json}\n\n', 'data: {"type":"done","data":{"response":"Halo"}}\n\n']),
      ),
    );
    const events: SseEvent[] = [];
    const outcome = await apiStream('/api/chat/send', { m: 1 }, { onEvent: (e) => events.push(e) });
    expect(outcome).toBe('streamed');
    expect(events.map((e) => e.type)).toEqual(['chunk', 'done']);
    expect(events[0]?.chunk).toBe('Halo');
  });

  it('tells the caller to fall back when the route is missing or not an event stream', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } })));
    expect(await apiStream('/api/chat/send', {}, { onEvent: () => {} })).toBe('not-stream');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
    expect(await apiStream('/api/chat/send', {}, { onEvent: () => {} })).toBe('not-stream');
  });

  it('raises a typed error for real HTTP failures and network failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Sesi chat tidak ditemukan' }), { status: 400, headers: { 'Content-Type': 'application/json' } })),
    );
    await expect(apiStream('/api/chat/send', {}, { onEvent: () => {} })).rejects.toMatchObject({ message: 'Sesi chat tidak ditemukan', status: 400 });

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(apiStream('/api/chat/send', {}, { onEvent: () => {} })).rejects.toBeInstanceOf(ApiError);
  });

  it('lets errors thrown by the caller propagate unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse(['data: {"type":"error","error":"boom"}\n\n'])));
    await expect(
      apiStream('/api/chat/send', {}, {
        onEvent: (e) => {
          if (e.type === 'error') throw new Error(String(e.error));
        },
      }),
    ).rejects.toThrow('boom');
  });

  it('rethrows the abort error when the caller cancels', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: unknown, init?: RequestInit) => {
        controller.abort();
        if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
        return sse([]);
      }),
    );
    await expect(apiStream('/api/chat/send', {}, { signal: controller.signal, onEvent: () => {} })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('unauthorized signal', () => {
  afterEach(() => vi.unstubAllGlobals());

  const listen = () => {
    const fn = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, fn);
    return { fn, off: () => window.removeEventListener(UNAUTHORIZED_EVENT, fn) };
  };
  const respond401 = () => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Belum login' }), { status: 401 })));

  it('fires for 401 on session-protected RPC routes', async () => {
    respond401();
    const { fn, off } = listen();
    await expect(apiFetch('/api/rpc/dashboard', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError);
    off();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not fire for a 401 from an optional /api/v1 call or from the login request', async () => {
    respond401();
    const { fn, off } = listen();
    await expect(apiFetch('/profiles/me')).rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch('/api/login', { method: 'POST', body: { password: 'x' } })).rejects.toBeInstanceOf(ApiError);
    off();
    expect(fn).not.toHaveBeenCalled();
  });
});

import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../services/theme/ThemeContext';
import { dropCache, getCacheGeneration, READ_ACTIONS, rpcCall } from '../services/api/rpc';
import { ApiError } from '../services/api/client';

function mockFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn((url: string, init: RequestInit) => Promise.resolve(impl(url, init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('Milestone 1 Empirical Stress Tests — Challenger 1', () => {
  beforeEach(() => {
    vi.useRealTimers();
    dropCache();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.style.colorScheme = '';
      document.documentElement.classList.remove('theme-anim');
    }
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    dropCache();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.style.colorScheme = '';
      document.documentElement.classList.remove('theme-anim');
    }
  });

  // =========================================================================
  // SECTION 1: THEME CONTEXT EMPIRICAL STRESS TESTS
  // =========================================================================
  describe('1. ThemeContext Stress & Boundary Resistance', () => {
    it('1.1 State Corruption: LocalStorage corrupted with adversarial inputs', () => {
      const adversarialValues = [
        'null',
        'undefined',
        'false',
        'true',
        '0',
        '1',
        'NaN',
        '{}',
        '[]',
        'DARK',
        'LIGHT',
        'SYSTEM',
        '  dark  ',
        'auto ',
        '{"theme":"dark"}',
        '<script>alert(1)</script>',
        '__proto__',
        'a'.repeat(1000),
      ];

      for (const val of adversarialValues) {
        window.localStorage.setItem('belajar-theme', val);
        const { result, unmount } = renderHook(() => useTheme(), {
          wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
        });

        // Corrupted value MUST be rejected and fall back safely to 'system'
        expect(result.current.theme).toBe('system');
        expect(result.current.resolvedTheme).toMatch(/^(light|dark)$/);
        expect(document.documentElement.getAttribute('data-theme')).toMatch(/^(light|dark)$/);
        unmount();
        cleanup();
      }
    });

    it('1.2 State Corruption: LocalStorage throws SecurityError on read and write', () => {
      const storageMock = {
        getItem: vi.fn(() => {
          throw new DOMException('Access denied', 'SecurityError');
        }),
        setItem: vi.fn(() => {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
      };
      Object.defineProperty(window, 'localStorage', {
        value: storageMock,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="light">{children}</ThemeProvider>,
      });

      expect(result.current.theme).toBe('light');

      // Setting theme should not throw even if setItem fails
      expect(() => {
        act(() => {
          result.current.setTheme('dark');
        });
      }).not.toThrow();

      expect(result.current.theme).toBe('dark');
      expect(result.current.resolvedTheme).toBe('dark');
    });

    it('1.3 Adversarial setTheme: passing invalid runtime values', () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="light">{children}</ThemeProvider>,
      });

      act(() => {
        result.current.setTheme('malformed_mode' as any);
      });

      // EMPIRICAL CHECK: Does ThemeContext accept invalid strings into state?
      // When setThemeState('malformed_mode') is executed:
      // resolvedTheme becomes 'malformed_mode' because resolvedTheme = theme (when theme !== 'system')
      expect(result.current.theme).toBe('malformed_mode');
      expect(result.current.resolvedTheme).toBe('malformed_mode');
      expect(document.documentElement.getAttribute('data-theme')).toBe('malformed_mode');
    });

    const originalMatchMedia = window.matchMedia;
    it('1.4 Missing and Throwing matchMedia Environments', () => {
      // Test when matchMedia throws
      window.matchMedia = vi.fn().mockImplementation(() => {
        throw new Error('matchMedia not supported');
      });

      // EMPIRICAL CHECK: Does ThemeContext crash on mount when matchMedia throws in useEffect?
      let mountError: any = null;
      try {
        const { unmount } = renderHook(() => useTheme(), {
          wrapper: ({ children }) => <ThemeProvider defaultTheme="system">{children}</ThemeProvider>,
        });
        unmount();
      } catch (err) {
        mountError = err;
      }

      // VERIFICATION: ThemeContext safely catches matchMedia errors on mount
      expect(mountError).toBeNull();

      // Test legacy matchMedia with addListener instead of addEventListener
      let legacyListener: ((e: any) => void) | null = null;
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addListener: vi.fn((handler: any) => {
          legacyListener = handler;
        }),
        removeListener: vi.fn(),
      }));

      const { result: r2, unmount: u2 } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="system">{children}</ThemeProvider>,
      });

      expect(r2.current.resolvedTheme).toBe('light');
      act(() => {
        if (legacyListener) legacyListener({ matches: true });
      });
      expect(r2.current.resolvedTheme).toBe('dark');
      u2();

      // Restore matchMedia
      window.matchMedia = originalMatchMedia;
    });

    it('1.5 Rapid Toggling in a Single Synchronous Event Loop (Closure Test)', () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="light">{children}</ThemeProvider>,
      });

      expect(result.current.theme).toBe('light');

      // Rapidly call toggleTheme 10 times in ONE synchronous act block
      act(() => {
        for (let i = 0; i < 10; i++) {
          result.current.toggleTheme();
        }
      });

      // FINDING: In React, state updates inside a single render pass read from closure:
      // toggleTheme checks: if (theme === 'light') setTheme('dark');
      // All 10 calls in the same tick see theme === 'light' and call setTheme('dark')!
      // Therefore, 10 synchronous toggles result in 'dark' instead of 'light' (even number of toggles)!
      expect(result.current.theme).toBe('dark');
    });

    it('1.6 Rapid Asynchronous Toggling Across Microtasks', async () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="light">{children}</ThemeProvider>,
      });

      // Toggling with microtask awaits
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          result.current.toggleTheme();
        });
      }

      // 10 sequential asynchronous toggles starting from light:
      // light -> dark -> light -> dark -> light -> dark -> light -> dark -> light -> dark -> light
      // 10 toggles should return to 'light'!
      expect(result.current.theme).toBe('light');
      expect(result.current.resolvedTheme).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('1.7 theme-anim Class Cleanup on Component Unmount During Transition', () => {
      vi.useFakeTimers();

      const { result, unmount } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="light">{children}</ThemeProvider>,
      });

      // Trigger a theme switch to start the 250ms transition
      act(() => {
        result.current.setTheme('dark');
      });

      expect(document.documentElement.classList.contains('theme-anim')).toBe(true);

      // EMPIRICAL CHECK: What happens if ThemeProvider unmounts at T = 50ms (before 250ms timer)?
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(document.documentElement.classList.contains('theme-anim')).toBe(true);

      unmount();

      // At unmount, the effect cleanup runs: clearTimeout(timer) and removes 'theme-anim'.
      const classAfterUnmount = document.documentElement.classList.contains('theme-anim');
      expect(classAfterUnmount).toBe(false);

      vi.useRealTimers();
    });

    it('1.8 CustomEvent belajar:theme Dispatches on Every Mode and Resolved Theme Change', () => {
      const events: any[] = [];
      const handler = (e: Event) => {
        events.push((e as CustomEvent).detail);
      };
      document.addEventListener('belajar:theme', handler);

      const { result } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="light">{children}</ThemeProvider>,
      });

      act(() => {
        result.current.setTheme('dark');
      });
      act(() => {
        result.current.setTheme('system');
      });
      act(() => {
        result.current.setTheme('light');
      });

      document.removeEventListener('belajar:theme', handler);

      // Should have recorded mount and 3 theme changes
      expect(events.length).toBeGreaterThanOrEqual(3);
      const lastEvent = events[events.length - 1];
      expect(lastEvent).toEqual({
        theme: 'light',
        resolvedTheme: 'light',
        dark: false,
      });
    });

    it('1.9 Tauri Window Theme Sync Failure Resilience', () => {
      (window as any).__TAURI__ = {
        window: {
          getCurrentWindow: () => ({
            setTheme: vi.fn().mockRejectedValue(new Error('Tauri IPC disconnected')),
          }),
        },
      };

      const { result } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="light">{children}</ThemeProvider>,
      });

      // Should not throw or crash on rejection
      expect(() => {
        act(() => {
          result.current.setTheme('dark');
        });
      }).not.toThrow();

      expect(result.current.theme).toBe('dark');
      delete (window as any).__TAURI__;
    });
  });

  // =========================================================================
  // SECTION 2: RPC CLIENT EMPIRICAL STRESS TESTS
  // =========================================================================
  describe('2. rpc.ts Concurrency, Caching & Deduplication Stress', () => {
    it('2.1 Massive Concurrency: 50 concurrent identical read requests deduplicated to 1 network fetch', async () => {
      let networkCalls = 0;
      mockFetch(async (url) => {
        networkCalls++;
        await new Promise((res) => setTimeout(res, 30));
        return Response.json({ ok: true, data: { items: [1, 2, 3] } });
      });

      const promises = Array.from({ length: 50 }, () =>
        rpcCall<{ items: number[] }>('list_documents', { subject_id: 42 }),
      );

      const results = await Promise.all(promises);

      expect(networkCalls).toBe(1);
      for (const res of results) {
        expect(res).toEqual({ items: [1, 2, 3] });
      }
    });

    it('2.2 Mutating Actions MUST NOT Be Deduplicated or Cached', async () => {
      let networkCalls = 0;
      mockFetch(async () => {
        networkCalls++;
        const currentCall = networkCalls;
        await new Promise((res) => setTimeout(res, 10));
        return Response.json({ ok: true, data: { saved: true, callId: currentCall } });
      });

      // Non-read mutating actions
      const mutatingActions = ['update_document', 'save_note', 'delete_document', 'play_turn'];

      for (const action of mutatingActions) {
        expect(READ_ACTIONS.has(action)).toBe(false);
      }

      const promises = Array.from({ length: 5 }, () =>
        rpcCall('save_note', { id: 10, content: 'Catatan' }),
      );

      const results = await Promise.all(promises);

      // All 5 mutating requests MUST reach the network
      expect(networkCalls).toBe(5);
      const callIds = results.map((r: any) => r.callId);
      expect(new Set(callIds).size).toBe(5);
    });

    it('2.3 Object Reference Mutation Isolation Between In-Flight Callers', async () => {
      mockFetch(async () => {
        await new Promise((res) => setTimeout(res, 20));
        return Response.json({ ok: true, data: { user: { name: 'Budi', score: 100 } } });
      });

      const [res1, res2] = await Promise.all([
        rpcCall<{ user: { name: string; score: number } }>('dashboard'),
        rpcCall<{ user: { name: string; score: number } }>('dashboard'),
      ]);

      // Res1 and res2 must be distinct object references
      expect(res1).not.toBe(res2);
      res1.user.score = 999;
      // Res2 must remain unmutated (isolated clone)
      expect(res2.user.score).toBe(100);
    });

    it('2.4 CRITICAL HAZARD: AbortSignal Cross-Contamination in Deduplicated Requests', async () => {
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

      // Caller A passes abort controller
      const promiseA = rpcCall('dashboard', {}, { signal: controllerA.signal });
      // Caller B passes NO abort signal and expects normal completion
      const promiseB = rpcCall('dashboard', {});

      // Caller A cancels their request at T = 10ms
      setTimeout(() => {
        controllerA.abort();
      }, 10);

      // Caller A rejects with AbortError
      await expect(promiseA).rejects.toThrow();
      expect(abortedSignalReceived).toBe(true);

      // Caller B must succeed without error because AbortSignals are isolated from inFlight deduplication
      const resultB = await promiseB;
      expect(resultB).toEqual({ result: 'success' });
    });

    it('2.5 In-Flight Failure Cleanup: inFlight map is cleaned up after rejection', async () => {
      let callCount = 0;
      mockFetch(async () => {
        callCount++;
        if (callCount === 1) {
          throw new TypeError('Failed to fetch');
        }
        return Response.json({ ok: true, data: { count: callCount } });
      });

      // First batch fails
      const p1 = rpcCall('list_documents');
      const p2 = rpcCall('list_documents');
      await expect(p1).rejects.toThrow(ApiError);
      await expect(p2).rejects.toThrow(ApiError);

      // Second call after failure should make a fresh network call (not stuck on old error)
      const p3 = await rpcCall<{ count: number }>('list_documents');
      expect(p3.count).toBe(2);
      expect(callCount).toBe(2);
    });

    it('2.6 30-Second Cache Hit and Expiration Exact Timing', async () => {
      let now = 1000000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);

      let fetchCount = 0;
      mockFetch(() => {
        fetchCount++;
        return Response.json({ ok: true, data: { fetchCount } });
      });

      // T = 0s: initial fetch
      const r1 = await rpcCall<{ fetchCount: number }>('list_documents');
      expect(r1.fetchCount).toBe(1);
      expect(fetchCount).toBe(1);

      // T = 29.999s: cache hit
      now += 29_999;
      const r2 = await rpcCall<{ fetchCount: number }>('list_documents');
      expect(r2.fetchCount).toBe(1);
      expect(fetchCount).toBe(1);

      // T = 30.001s: cache expired!
      now += 2; // total 30_001ms
      const r3 = await rpcCall<{ fetchCount: number }>('list_documents');
      expect(r3.fetchCount).toBe(2);
      expect(fetchCount).toBe(2);

      vi.restoreAllMocks();
    });

    it('2.7 Cache Isolation on Payload Differences', async () => {
      let fetchCount = 0;
      mockFetch((_url, init) => {
        fetchCount++;
        const body = JSON.parse(init.body as string);
        return Response.json({ ok: true, data: { id: body.id, fetchCount } });
      });

      const call1 = await rpcCall('get_document', { id: 1 });
      const call2 = await rpcCall('get_document', { id: 2 });
      const call3 = await rpcCall('get_document', { id: 1 }); // cache hit

      expect(call1).toEqual({ id: 1, fetchCount: 1 });
      expect(call2).toEqual({ id: 2, fetchCount: 2 });
      expect(call3).toEqual({ id: 1, fetchCount: 1 });
      expect(fetchCount).toBe(2);
    });

    it('2.8 Mutation Invalidates All Read Caches and Increments Generation', async () => {
      let fetchCount = 0;
      mockFetch(() => {
        fetchCount++;
        return Response.json({ ok: true, data: { fetchCount } });
      });

      const gen0 = getCacheGeneration();
      await rpcCall('list_documents');
      await rpcCall('dashboard');
      expect(fetchCount).toBe(2);

      // Mutating action
      await rpcCall('delete_document', { id: 42 });
      expect(getCacheGeneration()).toBe(gen0 + 1);

      // Both reads must be re-fetched
      await rpcCall('list_documents');
      await rpcCall('dashboard');
      expect(fetchCount).toBe(5); // 2 initial + 1 delete + 2 re-fetch
    });

    it('2.9 Race Condition: Read in flight while Mutation drops cache (Cache Generation Guard)', async () => {
      let finishRead: () => void;
      mockFetch((url) => {
        if (url.includes('list_documents')) {
          return new Promise((resolve) => {
            finishRead = () => resolve(Response.json({ ok: true, data: { list: ['doc1'] } }));
          });
        }
        return Response.json({ ok: true, data: { deleted: true } });
      });

      // T = 0: Read request starts
      const readPromise = rpcCall('list_documents');

      // T = 10ms: Mutation occurs while read is in flight
      await rpcCall('delete_document', { id: 1 });

      // T = 20ms: Read request finishes
      finishRead!();
      const readResult = await readPromise;
      expect(readResult).toEqual({ list: ['doc1'] });

      // EMPIRICAL CHECK: Was the stale read response stored in the new cache generation?
      // When we call list_documents again, does it hit cache or make a new request?
      let secondFetchCalled = false;
      mockFetch(() => {
        secondFetchCalled = true;
        return Response.json({ ok: true, data: { list: [] } });
      });

      const secondResult = await rpcCall('list_documents');
      // Because currentGen !== rpcGen, the in-flight read was NOT cached!
      expect(secondFetchCalled).toBe(true);
      expect(secondResult).toEqual({ list: [] });
    });
  });

  // =========================================================================
  // SECTION 3: ADR-7 ERROR HANDLING EMPIRICAL STRESS TESTS
  // =========================================================================
  describe('3. ADR-7 Error Model & Error Shapes Stress', () => {
    it('3.1 HTTP 400 with ADR-7 Structured Error Object', async () => {
      mockFetch(() =>
        Response.json(
          {
            error: {
              code: 'validation_error',
              message: 'Judul materi wajib diisi.',
              retryable: false,
            },
          },
          { status: 400 },
        ),
      );

      let caught: any = null;
      try {
        await rpcCall('update_document', {});
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ApiError);
      expect(caught.status).toBe(400);
      expect(caught.code).toBe('validation_error');
      expect(caught.message).toBe('Judul materi wajib diisi.');
      expect(caught.retryable).toBe(false);
    });

    it('3.2 HTTP 503 Service Unavailable with retryable: true', async () => {
      mockFetch(() =>
        Response.json(
          {
            error: {
              code: 'service_overloaded',
              message: 'Server sedang sibuk. Silakan coba lagi.',
              retryable: true,
            },
          },
          { status: 503 },
        ),
      );

      let caught: any = null;
      try {
        await rpcCall('dashboard');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ApiError);
      expect(caught.status).toBe(503);
      expect(caught.code).toBe('service_overloaded');
      expect(caught.message).toBe('Server sedang sibuk. Silakan coba lagi.');
      expect(caught.retryable).toBe(true);
    });

    it('3.3 HTTP 200 with JSON-RPC error string', async () => {
      mockFetch(() =>
        Response.json({
          ok: false,
          error: 'Sesi kuis telah berakhir.',
        }),
      );

      let caught: any = null;
      try {
        await rpcCall('finish_attempt');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ApiError);
      expect(caught.status).toBe(400);
      expect(caught.code).toBe('rpc_error');
      expect(caught.message).toBe('Sesi kuis telah berakhir.');
      expect(caught.retryable).toBe(false);
    });

    it('3.4 CRITICAL FINDING: HTTP 200 with JSON-RPC error OBJECT (ADR-7 payload in 200 response)', async () => {
      mockFetch(() =>
        Response.json({
          ok: false,
          error: {
            code: 'quiz_expired',
            message: 'Waktu ujian telah habis.',
            retryable: false,
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
      expect(caught.retryable).toBe(false);
    });

    it('3.5 Network Disconnection (Fetch Throws TypeError)', async () => {
      mockFetch(() => {
        throw new TypeError('Failed to fetch');
      });

      let caught: any = null;
      try {
        await rpcCall('dashboard');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ApiError);
      expect(caught.status).toBe(0);
      expect(caught.code).toBe('network');
      expect(caught.message).toBe('Tidak dapat terhubung ke server. Periksa koneksi internet.');
      expect(caught.retryable).toBe(true);
    });

    it('3.6 HTTP 500 HTML Proxy Error (Non-JSON payload)', async () => {
      mockFetch(() =>
        new Response('<html><body>502 Bad Gateway</body></html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      );

      let caught: any = null;
      try {
        await rpcCall('dashboard');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ApiError);
      expect(caught.status).toBe(502);
      expect(caught.code).toBe('http_error');
      expect(caught.message).toBe('Terjadi kesalahan (502)');
      expect(caught.retryable).toBe(true);
    });

    it('3.7 Caller Cancellation with AbortSignal is preserved', async () => {
      mockFetch((_url, init) => {
        if (init.signal?.aborted) {
          throw new DOMException('The operation was aborted', 'AbortError');
        }
        return Response.json({ ok: true, data: {} });
      });

      const controller = new AbortController();
      controller.abort();

      let caught: any = null;
      try {
        await rpcCall('dashboard', {}, { signal: controller.signal });
      } catch (err) {
        caught = err;
      }

      // Should throw Abort error directly without wrapping in generic network ApiError
      expect(caught.name).toBe('AbortError');
    });

    it('3.8 Unwrapping response formats: { ok: true, data } vs direct payload', async () => {
      // Envelope with ok and data
      mockFetch(() => Response.json({ ok: true, data: { value: 123 } }));
      const r1 = await rpcCall<{ value: number }>('ping');
      expect(r1).toEqual({ value: 123 });

      // Direct payload without data wrapper
      dropCache();
      mockFetch(() => Response.json({ custom_field: 'hello' }));
      const r2 = await rpcCall<{ custom_field: string }>('ping');
      expect(r2).toEqual({ custom_field: 'hello' });
    });
  });
});

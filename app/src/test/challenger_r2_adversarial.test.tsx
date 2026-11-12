// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api/client';
import { dropCache, rpcCall } from '../services/api/rpc';
import { ThemeProvider, useTheme } from '../services/theme/ThemeContext';

function mockFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn((url: string, init: RequestInit) => Promise.resolve(impl(url, init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('Challenger R2 Adversarial Verification Suite', () => {
  let mmCtrl: { restore: () => void } | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    dropCache();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.className = '';
      document.documentElement.style.colorScheme = '';
      // Install clean default matchMedia stub where prefers-reduced-motion is false
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
    }
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (typeof window !== 'undefined') {
      document.documentElement.className = '';
    }
    dropCache();
  });

  describe('Focus Area 1: ADR-7 Structured Error Parsing & Boundary Resistance', () => {
    it('unwraps complete ADR-7 error structure from HTTP 200 payload', async () => {
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

      let thrown: any = null;
      try {
        await rpcCall('submit_quiz');
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ApiError);
      expect(thrown.message).toBe('Waktu ujian telah habis.');
      expect(thrown.code).toBe('quiz_expired');
      expect(thrown.status).toBe(400);
      expect(thrown.retryable).toBe(false);
      expect(thrown.name).toBe('ApiError');
    });

    it('preserves retryable: true flag from server payload', async () => {
      mockFetch(() =>
        Response.json({
          ok: false,
          error: {
            code: 'service_unavailable',
            message: 'Layanan sedang sibuk. Silakan coba lagi.',
            retryable: true,
          },
        }),
      );

      let thrown: any = null;
      try {
        await rpcCall('generate_notes');
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ApiError);
      expect(thrown.message).toBe('Layanan sedang sibuk. Silakan coba lagi.');
      expect(thrown.code).toBe('service_unavailable');
      expect(thrown.retryable).toBe(true);
    });

    it('falls back to default Indonesian message when ADR-7 error has no message field', async () => {
      mockFetch(() =>
        Response.json({
          ok: false,
          error: {
            code: 'custom_code_only',
          },
        }),
      );

      let thrown: any = null;
      try {
        await rpcCall('custom_action');
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ApiError);
      expect(thrown.code).toBe('custom_code_only');
      expect(thrown.message).toBe('Terjadi kesalahan pada server.');
      expect(thrown.retryable).toBe(false);
    });

    it('falls back to default rpc_error code when ADR-7 error has message but no code', async () => {
      mockFetch(() =>
        Response.json({
          ok: false,
          error: {
            message: 'Terjadi kegagalan spesifik.',
          },
        }),
      );

      let thrown: any = null;
      try {
        await rpcCall('custom_action');
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ApiError);
      expect(thrown.code).toBe('rpc_error');
      expect(thrown.message).toBe('Terjadi kegagalan spesifik.');
      expect(thrown.retryable).toBe(false);
    });

    it('handles empty error object {} gracefully with full defaults', async () => {
      mockFetch(() =>
        Response.json({
          ok: false,
          error: {},
        }),
      );

      let thrown: any = null;
      try {
        await rpcCall('custom_action');
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ApiError);
      expect(thrown.code).toBe('rpc_error');
      expect(thrown.message).toBe('Terjadi kesalahan pada server.');
      expect(thrown.retryable).toBe(false);
    });

    it('handles legacy plain string error field correctly', async () => {
      mockFetch(() =>
        Response.json({
          ok: false,
          error: 'String error message dari backend.',
        }),
      );

      let thrown: any = null;
      try {
        await rpcCall('legacy_action');
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ApiError);
      expect(thrown.message).toBe('String error message dari backend.');
      expect(thrown.code).toBe('rpc_error');
      expect(thrown.retryable).toBe(false);
    });

    it('handles ok: false with no error field gracefully', async () => {
      mockFetch(() =>
        Response.json({
          ok: false,
        }),
      );

      let thrown: any = null;
      try {
        await rpcCall('empty_fail');
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ApiError);
      expect(thrown.message).toBe('Operasi gagal.');
      expect(thrown.code).toBe('rpc_error');
    });

    it('unwraps ADR-7 error structure from HTTP 400 response through apiFetch', async () => {
      mockFetch(() =>
        Response.json(
          {
            error: {
              code: 'invalid_argument',
              message: 'ID dokumen tidak sah.',
              retryable: false,
            },
          },
          { status: 400 },
        ),
      );

      let thrown: any = null;
      try {
        await rpcCall('get_document', { id: 'invalid' });
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ApiError);
      expect(thrown.message).toBe('ID dokumen tidak sah.');
      expect(thrown.code).toBe('invalid_argument');
      expect(thrown.status).toBe(400);
      expect(thrown.retryable).toBe(false);
    });
  });

  describe('Focus Area 2: AbortSignal Concurrency & Deduplication Isolation', () => {
    it('deduplicates multiple callers without signals into 1 network call', async () => {
      let networkCalls = 0;
      mockFetch(async () => {
        networkCalls++;
        await new Promise((res) => setTimeout(res, 25));
        return Response.json({ ok: true, data: { counter: 42 } });
      });

      const promises = Array.from({ length: 8 }, () => rpcCall<{ counter: number }>('dashboard'));
      const results = await Promise.all(promises);

      expect(networkCalls).toBe(1);
      results.forEach((res) => {
        expect(res).toEqual({ counter: 42 });
      });
    });

    it('caller A aborting does NOT abort caller B (Caller A with signal, Caller B without signal)', async () => {
      const controllerA = new AbortController();
      let fetchCount = 0;

      mockFetch(async (_url, init) => {
        fetchCount++;
        const signal = init.signal;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 50);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        });
        return Response.json({ ok: true, data: { status: 'success' } });
      });

      const promiseA = rpcCall('dashboard', {}, { signal: controllerA.signal });
      const promiseB = rpcCall('dashboard', {});

      setTimeout(() => {
        controllerA.abort();
      }, 10);

      await expect(promiseA).rejects.toThrow();
      const resultB = await promiseB;
      expect(resultB).toEqual({ status: 'success' });
      expect(fetchCount).toBe(2); // Isolated: Caller A bypassed inFlight deduplication
    });

    it('caller B aborting does NOT abort caller A (Caller A without signal started first)', async () => {
      const controllerB = new AbortController();
      let fetchCount = 0;

      mockFetch(async (_url, init) => {
        fetchCount++;
        const signal = init.signal;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 60);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        });
        return Response.json({ ok: true, data: { val: 'shared_data' } });
      });

      const promiseA = rpcCall('dashboard', {});
      await new Promise((res) => setTimeout(res, 10));
      const promiseB = rpcCall('dashboard', {}, { signal: controllerB.signal });

      setTimeout(() => {
        controllerB.abort();
      }, 20);

      await expect(promiseB).rejects.toThrow();
      const resultA = await promiseA;
      expect(resultA).toEqual({ val: 'shared_data' });
    });

    it('multiple callers with independent AbortSignals are completely isolated', async () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();
      let fetchCount = 0;

      mockFetch(async (_url, init) => {
        fetchCount++;
        const signal = init.signal;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 40);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        });
        return Response.json({ ok: true, data: { caller: fetchCount } });
      });

      const promise1 = rpcCall('dashboard', {}, { signal: controller1.signal });
      const promise2 = rpcCall('dashboard', {}, { signal: controller2.signal });

      controller1.abort();

      await expect(promise1).rejects.toThrow();
      const result2 = await promise2;
      expect(result2).toBeDefined();
    });

    it('cleans up inFlight map after network rejection so subsequent retries succeed', async () => {
      let callCount = 0;
      mockFetch(async () => {
        callCount++;
        if (callCount === 1) {
          throw new TypeError('Network offline');
        }
        return Response.json({ ok: true, data: { recovered: true } });
      });

      await expect(rpcCall('dashboard')).rejects.toThrow();

      const retryResult = await rpcCall<{ recovered: boolean }>('dashboard');
      expect(retryResult).toEqual({ recovered: true });
      expect(callCount).toBe(2);
    });

    it('cache generation invalidation drops in-flight caching if mutating action runs concurrently', async () => {
      mockFetch(async (url) => {
        if (url.includes('list_documents')) {
          await new Promise((res) => setTimeout(res, 40));
          return Response.json({ ok: true, data: { docs: ['doc1'] } });
        }
        return Response.json({ ok: true, data: { ok: true } });
      });

      // Start read call
      const readPromise = rpcCall<{ docs: string[] }>('list_documents');

      // Mid-flight, execute mutating call which bumps rpcGen and drops cache
      await new Promise((res) => setTimeout(res, 10));
      await rpcCall('create_document', { title: 'Doc 2' });

      const readResult = await readPromise;
      expect(readResult).toEqual({ docs: ['doc1'] });

      // Next read call must NOT use stale cache because rpcGen invalidated
      let freshCallMade = false;
      mockFetch((url) => {
        if (url.includes('list_documents')) {
          freshCallMade = true;
          return Response.json({ ok: true, data: { docs: ['doc1', 'doc2'] } });
        }
        return Response.json({ ok: true, data: {} });
      });

      const nextRead = await rpcCall<{ docs: string[] }>('list_documents');
      expect(freshCallMade).toBe(true);
      expect(nextRead).toEqual({ docs: ['doc1', 'doc2'] });
    });
  });

  describe('Focus Area 3: Deep Reference Isolation in rpc.ts', () => {
    it('in-flight deduplicated callers receive distinct object references', async () => {
      mockFetch(async () => {
        await new Promise((res) => setTimeout(res, 20));
        return Response.json({
          ok: true,
          data: {
            user: { profile: { name: 'Ahmad', points: 150 }, tags: ['math', 'science'] },
          },
        });
      });

      const [res1, res2, res3] = await Promise.all([
        rpcCall<any>('dashboard'),
        rpcCall<any>('dashboard'),
        rpcCall<any>('dashboard'),
      ]);

      expect(res1).not.toBe(res2);
      expect(res2).not.toBe(res3);
      expect(res1).not.toBe(res3);
      expect(res1.user).not.toBe(res2.user);
      expect(res1.user.profile).not.toBe(res2.user.profile);
      expect(res1.user.tags).not.toBe(res2.user.tags);

      // Mutate res1 deeply
      res1.user.profile.points = 9999;
      res1.user.tags.push('cheater');

      expect(res2.user.profile.points).toBe(150);
      expect(res2.user.tags).toEqual(['math', 'science']);
      expect(res3.user.profile.points).toBe(150);
      expect(res3.user.tags).toEqual(['math', 'science']);
    });

    it('subsequent cached reads receive fresh isolated clones from cache', async () => {
      mockFetch(() =>
        Response.json({
          ok: true,
          data: {
            subjects: [{ id: 1, title: 'Fisika' }, { id: 2, title: 'Biologi' }],
          },
        }),
      );

      const firstRead = await rpcCall<any>('list_subjects');
      firstRead.subjects[0].title = 'Hacked Subject';
      firstRead.subjects.push({ id: 99, title: 'Extra' });

      const secondRead = await rpcCall<any>('list_subjects');
      expect(secondRead).not.toBe(firstRead);
      expect(secondRead.subjects).not.toBe(firstRead.subjects);
      expect(secondRead.subjects).toHaveLength(2);
      expect(secondRead.subjects[0].title).toBe('Fisika');
    });

    it('handles primitive results (boolean, number, string, null) cleanly without errors', async () => {
      mockFetch(() => Response.json({ ok: true, data: true }));
      const boolRes = await rpcCall<boolean>('ping');
      expect(boolRes).toBe(true);

      dropCache();
      mockFetch(() => Response.json({ ok: true, data: 12345 }));
      const numRes = await rpcCall<number>('ping');
      expect(numRes).toBe(12345);

      dropCache();
      mockFetch(() => Response.json({ ok: true, data: 'plain_string' }));
      const strRes = await rpcCall<string>('ping');
      expect(strRes).toBe('plain_string');

      dropCache();
      mockFetch(() => Response.json({ ok: true, data: null }));
      const nullRes = await rpcCall<null>('ping');
      expect(nullRes).toBeNull();
    });
  });

  describe('Focus Area 4: ThemeContext matchMedia & theme-anim Resilience', () => {
    it('gracefully handles missing window.matchMedia without throwing', () => {
      const originalMM = window.matchMedia;
      (window as any).matchMedia = undefined;

      let caught: any = null;
      try {
        const { result, unmount } = renderHook(() => useTheme(), {
          wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
        });
        expect(result.current.theme).toBe('system');
        expect(result.current.resolvedTheme).toBe('light');
        unmount();
      } catch (err) {
        caught = err;
      } finally {
        window.matchMedia = originalMM;
      }

      expect(caught).toBeNull();
    });

    it('gracefully survives SecurityError / DOMException thrown by matchMedia on mount', () => {
      const originalMM = window.matchMedia;
      window.matchMedia = vi.fn().mockImplementation(() => {
        throw new DOMException('Access denied in restricted sandbox', 'SecurityError');
      });

      let caught: any = null;
      try {
        const { result, unmount } = renderHook(() => useTheme(), {
          wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
        });
        expect(result.current.resolvedTheme).toBe('light');
        unmount();
      } catch (err) {
        caught = err;
      } finally {
        window.matchMedia = originalMM;
      }

      expect(caught).toBeNull();
    });

    it('supports legacy addListener and removeListener media query APIs', () => {
      let listener: ((e: any) => void) | null = null;
      const removeMock = vi.fn();

      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addListener: vi.fn((cb) => {
          listener = cb;
        }),
        removeListener: removeMock,
      }));

      const { result, unmount } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="system">{children}</ThemeProvider>,
      });

      expect(result.current.resolvedTheme).toBe('light');

      // Trigger legacy event
      act(() => {
        if (listener) {
          listener({ matches: true });
        }
      });
      expect(result.current.resolvedTheme).toBe('dark');

      unmount();
      expect(removeMock).toHaveBeenCalled();
    });

    it('rapid theme toggling manages theme-anim class cleanly without orphan state', () => {
      vi.useFakeTimers();

      const { result, unmount } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="light">{children}</ThemeProvider>,
      });

      // Rapidly toggle 4 times
      act(() => {
        result.current.setTheme('dark');
      });
      act(() => {
        result.current.setTheme('light');
      });
      act(() => {
        result.current.setTheme('dark');
      });
      act(() => {
        result.current.setTheme('light');
      });

      expect(document.documentElement.classList.contains('theme-anim')).toBe(true);

      // Fast-forward past 250ms animation duration
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(document.documentElement.classList.contains('theme-anim')).toBe(false);

      unmount();
      vi.useRealTimers();
    });

    it('unmounting during active transition cleans up theme-anim immediately', () => {
      vi.useFakeTimers();

      const { result, unmount } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="light">{children}</ThemeProvider>,
      });

      act(() => {
        result.current.setTheme('dark');
      });
      expect(document.documentElement.classList.contains('theme-anim')).toBe(true);

      // Advance only 30ms (well before 250ms timer)
      act(() => {
        vi.advanceTimersByTime(30);
      });
      expect(document.documentElement.classList.contains('theme-anim')).toBe(true);

      // Unmount abruptly
      unmount();

      // Class must be immediately removed by effect cleanup
      expect(document.documentElement.classList.contains('theme-anim')).toBe(false);

      vi.useRealTimers();
    });

    it('does not attach theme-anim class when prefers-reduced-motion is active', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      const { result, unmount } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="light">{children}</ThemeProvider>,
      });

      act(() => {
        result.current.setTheme('dark');
      });

      // Should NEVER add theme-anim when user prefers reduced motion
      expect(document.documentElement.classList.contains('theme-anim')).toBe(false);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      unmount();
    });

    it('survives corrupted JSON or malformed theme values in localStorage gracefully', () => {
      window.localStorage.setItem('stuby-theme', '{"not": "valid theme"}');

      const { result, unmount } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="system">{children}</ThemeProvider>,
      });

      expect(result.current.theme).toBe('system');
      expect(result.current.resolvedTheme).toBe('light');

      unmount();
    });

    it('preserves existing classes on documentElement when adding and removing theme-anim', () => {
      vi.useFakeTimers();
      document.documentElement.classList.add('custom-user-class', 'frost-shell');

      const { result, unmount } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="light">{children}</ThemeProvider>,
      });

      act(() => {
        result.current.setTheme('dark');
      });

      expect(document.documentElement.classList.contains('theme-anim')).toBe(true);
      expect(document.documentElement.classList.contains('custom-user-class')).toBe(true);
      expect(document.documentElement.classList.contains('frost-shell')).toBe(true);

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(document.documentElement.classList.contains('theme-anim')).toBe(false);
      expect(document.documentElement.classList.contains('custom-user-class')).toBe(true);
      expect(document.documentElement.classList.contains('frost-shell')).toBe(true);

      unmount();
      vi.useRealTimers();
    });

    it('gracefully survives Tauri native window setTheme synchronous throw or promise rejection', () => {
      (window as any).__TAURI__ = {
        window: {
          getCurrentWindow: () => ({
            setTheme: vi.fn().mockRejectedValue(new Error('IPC channel closed')),
          }),
        },
      };

      const { result, unmount } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="light">{children}</ThemeProvider>,
      });

      expect(() => {
        act(() => {
          result.current.setTheme('dark');
        });
      }).not.toThrow();

      unmount();
      delete (window as any).__TAURI__;
    });

    it('rejects immediately when AbortSignal is already aborted prior to call', async () => {
      const controller = new AbortController();
      controller.abort();

      mockFetch(async (_url, init) => {
        if (init.signal?.aborted) {
          throw new DOMException('The operation was aborted', 'AbortError');
        }
        return Response.json({ ok: true, data: { val: 1 } });
      });

      await expect(
        rpcCall('dashboard', {}, { signal: controller.signal }),
      ).rejects.toThrow();
    });
  });
});

import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeContext';

describe('ThemeContext', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('throws an error when useTheme is called outside ThemeProvider', () => {
    expect(() => renderHook(() => useTheme())).toThrow(
      'useTheme must be used within a ThemeProvider',
    );
  });

  it('initializes with default system theme when localStorage is empty', () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('light'); // default matchMedia is false
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('reads stored theme from localStorage', () => {
    window.localStorage.setItem('belajar-theme', 'dark');

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('normalizes legacy "auto" theme setting to "system"', () => {
    window.localStorage.setItem('belajar-theme', 'auto');

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    expect(result.current.theme).toBe('system');
  });

  it('updates theme, localStorage, and document attributes on setTheme', () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(window.localStorage.getItem('belajar-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    act(() => {
      result.current.setTheme('light');
    });

    expect(result.current.theme).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
    expect(window.localStorage.getItem('belajar-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('toggles theme correctly using toggleTheme', () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider defaultTheme="light">{children}</ThemeProvider>,
    });

    expect(result.current.theme).toBe('light');

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('dispatches belajar:theme CustomEvent on theme change', () => {
    const listener = vi.fn();
    document.addEventListener('belajar:theme', listener);

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    act(() => {
      result.current.setTheme('dark');
    });

    expect(listener).toHaveBeenCalled();
    const lastCall = listener.mock.calls[listener.mock.calls.length - 1]?.[0] as CustomEvent;
    expect(lastCall.detail.theme).toBe('dark');
    expect(lastCall.detail.resolvedTheme).toBe('dark');
    expect(lastCall.detail.dark).toBe(true);

    document.removeEventListener('belajar:theme', listener);
  });

  it('calls Tauri window setTheme when Tauri environment is detected', () => {
    const setTauriTheme = vi.fn().mockResolvedValue(undefined);
    (window as any).__TAURI__ = {
      window: {
        getCurrentWindow: () => ({
          setTheme: setTauriTheme,
        }),
      },
    };

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    act(() => {
      result.current.setTheme('dark');
    });

    expect(setTauriTheme).toHaveBeenCalledWith('dark');
    delete (window as any).__TAURI__;
  });

  it('reacts to system color scheme changes when theme is system', () => {
    let changeHandler: ((e: any) => void) | null = null;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn((event: string, handler: any) => {
        if (event === 'change') changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider defaultTheme="system">{children}</ThemeProvider>,
    });

    expect(result.current.resolvedTheme).toBe('light');

    act(() => {
      if (changeHandler) {
        changeHandler({ matches: true } as MediaQueryListEvent);
      }
    });

    expect(result.current.resolvedTheme).toBe('dark');
  });

  it('does not crash when window.matchMedia throws in useEffect on mount', () => {
    window.matchMedia = vi.fn().mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError');
    });

    expect(() => {
      renderHook(() => useTheme(), {
        wrapper: ({ children }) => <ThemeProvider defaultTheme="system">{children}</ThemeProvider>,
      });
    }).not.toThrow();
  });

  it('cleans up theme-anim class from documentElement when unmounted during active transition', () => {
    vi.useFakeTimers();

    const { result, unmount } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider defaultTheme="light">{children}</ThemeProvider>,
    });

    act(() => {
      result.current.setTheme('dark');
    });

    expect(document.documentElement.classList.contains('theme-anim')).toBe(true);

    // Advance 50ms into the 250ms transition
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(document.documentElement.classList.contains('theme-anim')).toBe(true);

    // Unmount while transition is active
    unmount();

    // Verify theme-anim class is cleanly removed
    expect(document.documentElement.classList.contains('theme-anim')).toBe(false);

    vi.useRealTimers();
  });
});

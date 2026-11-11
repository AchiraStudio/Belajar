import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  resolvedTheme: ResolvedTheme;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'belajar-theme';
const LEGACY_STORAGE_KEY = 'belajar_theme';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function getPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function normalizeStoredTheme(val: string | null): ThemeMode | null {
  if (!val) return null;
  if (val === 'light' || val === 'dark' || val === 'system') return val;
  if (val === 'auto') return 'system';
  return null;
}

function readInitialTheme(storageKey: string = STORAGE_KEY, defaultTheme: ThemeMode = 'system'): ThemeMode {
  if (typeof window === 'undefined') return defaultTheme;
  try {
    const stored = normalizeStoredTheme(window.localStorage.getItem(storageKey)) ??
                   normalizeStoredTheme(window.localStorage.getItem(LEGACY_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // LocalStorage inaccessible (e.g., privacy mode)
  }
  return defaultTheme;
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemeMode;
  storageKey?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = STORAGE_KEY,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>(() => readInitialTheme(storageKey, defaultTheme));
  const [systemDark, setSystemDark] = useState<boolean>(() => getSystemDark());
  const [mounted, setMounted] = useState(false);

  // Listen to system dark mode changes
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    try {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        setSystemDark(e.matches);
      };

      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handler);
        return () => {
          try {
            mediaQuery.removeEventListener('change', handler);
          } catch {
            // Ignore teardown errors
          }
        };
      } else if (typeof (mediaQuery as any).addListener === 'function') {
        (mediaQuery as any).addListener(handler);
        return () => {
          try {
            (mediaQuery as any).removeListener(handler);
          } catch {
            // Ignore teardown errors
          }
        };
      }
    } catch {
      // In restricted iframes or sandboxed WebViews, matchMedia can throw SecurityError
      return;
    }
  }, []);

  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (theme === 'system') {
      return systemDark ? 'dark' : 'light';
    }
    return theme;
  }, [theme, systemDark]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      window.localStorage.setItem(storageKey, newTheme);
    } catch {
      // Ignore storage errors
    }
  };

  const toggleTheme = () => {
    if (theme === 'system') {
      setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    } else if (theme === 'light') {
      setTheme('dark');
    } else {
      setTheme('light');
    }
  };

  // Sync with DOM, Meta Theme Color, Tauri Window, and Events
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;

    root.setAttribute('data-theme', resolvedTheme);
    root.style.colorScheme = resolvedTheme;

    // Update meta theme-color for mobile webview
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', resolvedTheme === 'dark' ? '#0C1222' : '#F3F6FC');
    }

    // Sync with Tauri native window if available
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI__?.window?.getCurrentWindow) {
        const win = (window as any).__TAURI__.window.getCurrentWindow();
        if (typeof win.setTheme === 'function') {
          win.setTheme(resolvedTheme).catch(() => {});
        }
      }
    } catch {
      // Ignore Tauri IPC error
    }

    // Dispatch custom event for non-React listeners
    try {
      document.dispatchEvent(
        new CustomEvent('belajar:theme', {
          detail: { theme, resolvedTheme, dark: resolvedTheme === 'dark' },
        }),
      );
    } catch {
      // Ignore in older environments
    }

    // Apply brief animation class only after initial mount
    if (mounted) {
      const prefersReducedMotion = getPrefersReducedMotion();

      if (!prefersReducedMotion) {
        root.classList.add('theme-anim');
        const timer = setTimeout(() => {
          root.classList.remove('theme-anim');
        }, 250);
        return () => {
          clearTimeout(timer);
          root.classList.remove('theme-anim');
        };
      }
    } else {
      setMounted(true);
    }
  }, [theme, resolvedTheme, mounted]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      toggleTheme,
    }),
    [theme, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

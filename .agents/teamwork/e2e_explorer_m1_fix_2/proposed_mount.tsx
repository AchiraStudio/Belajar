import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, HashRouter } from 'react-router';
import {
  stubTauri,
  unstubTauri,
  stubLocalStorage,
  type LocalStorageMockController,
} from './browserStubs';
import {
  ThemeProvider,
  useTheme,
  type ThemeMode,
  type ResolvedTheme,
  type ThemeContextValue,
} from '../../../services/theme/ThemeContext';
import { ToastProvider, useToast } from '../../../components/ui/Toast';

export type { ThemeMode, ResolvedTheme, ThemeContextValue };
export { ThemeProvider, useTheme };
export { ToastProvider, useToast };

export const TestThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  resolvedTheme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});

export function useTestTheme(): ThemeContextValue {
  return useContext(TestThemeContext);
}

export interface MountOptions {
  /** Initial route path, e.g. '#/', '#/materi', '/materi/101', etc. Default: '#/' */
  route?: string;
  /** Active theme mode. Default: 'light' */
  theme?: ThemeMode;
  /** Whether to simulate desktop Tauri runtime environment. Default: false */
  isTauri?: boolean;
  /** Use HashRouter instead of MemoryRouter. Default: false */
  useHashRouter?: boolean;
  /** Whether to clear window.localStorage before mounting. Default: false */
  clearStorage?: boolean;
  /**
   * Whether to isolate localStorage using an in-memory Storage mock for this mount.
   * Restored automatically when unmounted. Default: false
   */
  isolateStorage?: boolean;
  /** Initial key-value pairs to populate in localStorage before mounting. */
  initialStorage?: Record<string, string>;
  /** Custom localStorage key for theme persistence if needed. */
  themeStorageKey?: string;
}

export interface MountResult extends RenderResult {
  currentTheme: ResolvedTheme;
  setThemeMode: (mode: ThemeMode) => void;
}

/**
 * Normalizes route strings so both '#/path' and '/path' are converted to valid MemoryRouter paths.
 */
function normalizeRoutePath(route?: string): string {
  if (!route) return '/';
  let path = route.trim();
  if (path.startsWith('#')) {
    path = path.slice(1);
  }
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  return path || '/';
}

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

let mountSessionCounter = 0;

/**
 * Internal bridge component that:
 * 1. Synchronizes ThemeProvider context with TestThemeContext.
 * 2. Listens for dynamic matchMedia change events and forces synchronous DOM and React tree updates.
 * 3. Keeps document.documentElement data-theme attribute synchronized.
 */
function TestThemeBridge({
  children,
  onThemeSync,
}: {
  children: React.ReactNode;
  onThemeSync?: (context: ThemeContextValue) => void;
}) {
  const themeContext = useTheme();
  const themeRef = useRef(themeContext.theme);
  themeRef.current = themeContext.theme;

  // Immediately notify parent of current theme context
  onThemeSync?.(themeContext);

  useEffect(() => {
    onThemeSync?.(themeContext);
  }, [themeContext, onThemeSync]);

  // Dynamic matchMedia listener for prefers-color-scheme
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      // Synchronously set data-theme attribute on <html> if current mode is 'system'
      if (themeRef.current === 'system' && typeof document !== 'undefined') {
        const nextTheme: ResolvedTheme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', nextTheme);
        document.documentElement.style.colorScheme = nextTheme;
      }

      // Synchronously flush queued React state updates (e.g. from ThemeProvider's listener)
      try {
        flushSync(() => {
          // Flush any pending React updates across the active root
        });
      } catch {
        // Fallback if called within an existing flush phase
      }
    };

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    } else if (typeof (mql as any).addListener === 'function') {
      (mql as any).addListener(handler);
      return () => (mql as any).removeListener(handler);
    }
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', themeContext.resolvedTheme);
      document.documentElement.style.colorScheme = themeContext.resolvedTheme;
    }
  }, [themeContext.resolvedTheme]);

  return (
    <TestThemeContext.Provider value={themeContext}>
      <div
        data-theme={themeContext.resolvedTheme}
        data-testid="mount-theme-root"
        style={{ minHeight: '100vh' }}
      >
        {children}
      </div>
    </TestThemeContext.Provider>
  );
}

/**
 * Top-level test provider component wrapping children in Router, ThemeProvider, ToastProvider, and TestThemeBridge.
 */
function TestProviders({
  children,
  initialRoute,
  initialTheme,
  useHash,
  storageKey,
  onThemeSync,
}: {
  children: React.ReactNode;
  initialRoute: string;
  initialTheme: ThemeMode;
  useHash: boolean;
  storageKey: string;
  onThemeSync?: (context: ThemeContextValue) => void;
}) {
  const content = (
    <ThemeProvider defaultTheme={initialTheme} storageKey={storageKey}>
      <ToastProvider>
        <TestThemeBridge onThemeSync={onThemeSync}>
          {children}
        </TestThemeBridge>
      </ToastProvider>
    </ThemeProvider>
  );

  if (useHash) {
    return <HashRouter>{content}</HashRouter>;
  }

  return (
    <MemoryRouter initialEntries={[normalizeRoutePath(initialRoute)]}>
      {content}
    </MemoryRouter>
  );
}

/**
 * Custom opaque-box renderer for Belajar components and full routes.
 * Automatically wraps components in:
 * - Router (MemoryRouter or HashRouter)
 * - ThemeProvider + ToastProvider + TestThemeContext
 * - Reactive matchMedia listener with DOM attribute synchronization
 * - Lifecycle cleanup for Tauri stubs and LocalStorage mocks
 */
export function mount(
  ui: React.ReactElement,
  options: MountOptions = {}
): MountResult {
  const {
    route = '#/',
    theme = 'light',
    isTauri = false,
    useHashRouter = false,
    clearStorage = false,
    isolateStorage = false,
    initialStorage,
    themeStorageKey,
  } = options;

  let storageCtrl: LocalStorageMockController | null = null;
  if (isolateStorage && typeof window !== 'undefined') {
    storageCtrl = stubLocalStorage();
  }

  if (clearStorage && typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }

  if (initialStorage && typeof window !== 'undefined' && window.localStorage) {
    for (const [key, val] of Object.entries(initialStorage)) {
      window.localStorage.setItem(key, String(val));
    }
  }

  if (isTauri) {
    stubTauri();
  } else {
    unstubTauri();
  }

  if (useHashRouter && typeof window !== 'undefined') {
    window.location.hash = route.startsWith('#') ? route : `#${route}`;
  }

  const activeStorageKey =
    themeStorageKey ?? `__belajar_test_theme_${++mountSessionCounter}`;

  // Ensure requested initial theme is seeded in storageKey so ThemeProvider initializes with it
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(activeStorageKey, theme);
  }

  let capturedContext: ThemeContextValue | null = null;
  let isUnmounted = false;

  const performCleanup = () => {
    if (!isUnmounted) {
      isUnmounted = true;
      if (isTauri) {
        unstubTauri();
      }
      if (storageCtrl) {
        storageCtrl.restore();
      }
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.removeItem(activeStorageKey);
        } catch {
          // ignore
        }
      }
    }
  };

  function HarnessWrapper({ children }: { children: React.ReactNode }) {
    useEffect(() => {
      return () => {
        performCleanup();
      };
    }, []);

    return (
      <TestProviders
        initialRoute={route}
        initialTheme={theme}
        useHash={useHashRouter}
        storageKey={activeStorageKey}
        onThemeSync={(ctx) => {
          capturedContext = ctx;
        }}
      >
        {children}
      </TestProviders>
    );
  }

  const result = render(ui, { wrapper: HarnessWrapper });

  const originalUnmount = result.unmount;
  const wrappedUnmount = () => {
    performCleanup();
    originalUnmount();
  };

  return {
    ...result,
    unmount: wrappedUnmount,
    get currentTheme(): ResolvedTheme {
      if (capturedContext) {
        return capturedContext.resolvedTheme;
      }
      if (theme === 'system') {
        return typeof window !== 'undefined' &&
          window.matchMedia?.('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
      }
      return theme as ResolvedTheme;
    },
    setThemeMode: (mode: ThemeMode) => {
      if (capturedContext) {
        capturedContext.setTheme(mode);
      }
    },
  };
}

/** Alias for mount matching specification in TEST_INFRA.md */
export const renderWithProviders = mount;

// Re-export common testing library utilities for clean single-import test authoring
export { screen, waitFor, within, act, fireEvent, cleanup } from '@testing-library/react';

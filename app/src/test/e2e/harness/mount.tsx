import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  act,
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

/**
 * Backwards-compatible TestThemeContext for existing test harness utilities.
 * When mounted via mount(), this context is populated with the active ThemeProvider value.
 */
export const TestThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  resolvedTheme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});

/**
 * Hook providing access to theme state in tests.
 * Returns the active theme context value.
 */
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
 * Internal bridge component running inside ThemeProvider.
 * Bridges ThemeProvider's value into TestThemeContext, handles dynamic matchMedia changes,
 * and exposes theme state to mount().
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

  const [systemDark, setSystemDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
      } catch {
        return false;
      }
    }
    return false;
  });

  const resolvedTheme: ResolvedTheme =
    themeContext.theme === 'system'
      ? (systemDark ? 'dark' : 'light')
      : themeContext.resolvedTheme;

  const bridgedContext: ThemeContextValue = {
    ...themeContext,
    resolvedTheme,
  };

  onThemeSync?.(bridgedContext);

  useEffect(() => {
    onThemeSync?.(bridgedContext);
  }, [bridgedContext, onThemeSync]);

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

      // Synchronously flush queued React state updates across the root
      try {
        flushSync(() => {
          setSystemDark(e.matches);
        });
      } catch {
        setSystemDark(e.matches);
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
      document.documentElement.setAttribute('data-theme', resolvedTheme);
      document.documentElement.style.colorScheme = resolvedTheme;
    }
  }, [resolvedTheme]);

  return (
    <TestThemeContext.Provider value={bridgedContext}>
      <div
        data-theme={resolvedTheme}
        data-testid="mount-theme-root"
        style={{ minHeight: '100vh' }}
      >
        {children}
      </div>
    </TestThemeContext.Provider>
  );
}

/**
 * Provider hierarchy wrapping the test component:
 * ThemeProvider -> ToastProvider -> (MemoryRouter | HashRouter) -> TestThemeBridge -> children
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
  const bridgeContent = (
    <TestThemeBridge onThemeSync={onThemeSync}>
      {children}
    </TestThemeBridge>
  );

  const routerContent = useHash ? (
    <HashRouter>{bridgeContent}</HashRouter>
  ) : (
    <MemoryRouter initialEntries={[normalizeRoutePath(initialRoute)]}>
      {bridgeContent}
    </MemoryRouter>
  );

  return (
    <ThemeProvider defaultTheme={initialTheme} storageKey={storageKey}>
      <ToastProvider>
        {routerContent}
      </ToastProvider>
    </ThemeProvider>
  );
}

/**
 * Custom opaque-box renderer for Stuby components and full routes.
 * Automatically wraps components in ThemeProvider, ToastProvider, Router (MemoryRouter or HashRouter),
 * and TestThemeContext (with data-theme DOM synchronization and matchMedia reactive listening).
 */
export function mount(
  ui: React.ReactElement,
  options: MountOptions = {}
): MountResult {
  const {
    route = '#/',
    theme: explicitTheme,
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
    themeStorageKey ?? `__stuby_test_theme_${++mountSessionCounter}`;

  let initialTheme: ThemeMode = explicitTheme ?? 'light';
  if (!explicitTheme && typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored =
        window.localStorage.getItem('stuby-theme') ||
        window.localStorage.getItem('stuby_theme');
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        initialTheme = stored;
      }
    } catch {
      // Storage access error in restricted environment
    }
  }

  // Seed storageKey so ThemeProvider initializes with the requested theme
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(activeStorageKey, initialTheme);
    } catch {
      // Storage access error in restricted environment
    }
  }

  let capturedContext: ThemeContextValue | null = null;
  let isCleanedUp = false;

  const performCleanup = () => {
    if (!isCleanedUp) {
      isCleanedUp = true;
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
        initialTheme={initialTheme}
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
    return originalUnmount();
  };

  return {
    ...result,
    unmount: wrappedUnmount,
    get currentTheme(): ResolvedTheme {
      if (capturedContext) {
        return capturedContext.resolvedTheme;
      }
      if (initialTheme === 'system') {
        return typeof window !== 'undefined' &&
          window.matchMedia?.('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
      }
      return initialTheme as ResolvedTheme;
    },
    setThemeMode: (mode: ThemeMode) => {
      act(() => {
        if (capturedContext) {
          capturedContext.setTheme(mode);
        }
      });
    },
  };
}

/** Alias for mount matching specification in TEST_INFRA.md */
export const renderWithProviders = mount;

// Re-export common testing library utilities for clean single-import test authoring
export { screen, waitFor, within, act, fireEvent, cleanup } from '@testing-library/react';

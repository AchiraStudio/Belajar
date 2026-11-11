import { vi } from 'vitest';

export interface MatchMediaController {
  setMatches: (matches: boolean) => void;
  restore: () => void;
}

export interface TauriStubController {
  mockWindow: {
    minimize: ReturnType<typeof vi.fn>;
    toggleMaximize: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    startDragging: ReturnType<typeof vi.fn>;
    setTheme: ReturnType<typeof vi.fn>;
    isMaximized: ReturnType<typeof vi.fn>;
  };
  unstub: () => void;
}

export interface LocalStorageMockController {
  storage: Storage;
  restore: () => void;
}

/**
 * Creates an in-memory Storage implementation compliant with the Web Storage API.
 */
export function createLocalStorageMock(): Storage {
  let store: Record<string, string> = {};

  return {
    getItem(key: string): string | null {
      return Object.prototype.hasOwnProperty.call(store, key) ? (store[key] ?? null) : null;
    },
    setItem(key: string, value: string): void {
      store[key] = String(value);
    },
    removeItem(key: string): void {
      delete store[key];
    },
    clear(): void {
      store = {};
    },
    key(index: number): string | null {
      const keys = Object.keys(store);
      return keys[index] !== undefined ? (keys[index] ?? null) : null;
    },
    get length(): number {
      return Object.keys(store).length;
    },
  };
}

/**
 * Stubs window.localStorage with an isolated in-memory mock.
 */
export function stubLocalStorage(): LocalStorageMockController {
  if (typeof window === 'undefined') {
    return {
      storage: createLocalStorageMock(),
      restore: () => {},
    };
  }

  const original = window.localStorage;
  const mockStorage = createLocalStorageMock();

  Object.defineProperty(window, 'localStorage', {
    value: mockStorage,
    writable: true,
    configurable: true,
  });

  return {
    storage: mockStorage,
    restore() {
      if (typeof window !== 'undefined') {
        Object.defineProperty(window, 'localStorage', {
          value: original,
          writable: true,
          configurable: true,
        });
      }
    },
  };
}

/**
 * Stubs window.matchMedia defensively for JSDOM environments.
 * Returns a controller allowing reactive triggering of media query change events.
 */
export function stubMatchMedia(
  initialMatches: boolean = false,
  mediaQuery: string = '(prefers-color-scheme: dark)'
): MatchMediaController {
  if (typeof window === 'undefined') {
    return {
      setMatches: () => {},
      restore: () => {},
    };
  }

  const original = window.matchMedia;
  let currentMatches = initialMatches;
  const listeners = new Set<(e: MediaQueryListEvent) => void>();

  const matchMediaMock = vi.fn().mockImplementation((query: string) => {
    return {
      get matches() {
        return currentMatches;
      },
      media: query || mediaQuery,
      onchange: null,
      addListener: vi.fn((fn) => listeners.add(fn)),
      removeListener: vi.fn((fn) => listeners.delete(fn)),
      addEventListener: vi.fn((type: string, fn: any) => {
        if (type === 'change') listeners.add(fn);
      }),
      removeEventListener: vi.fn((type: string, fn: any) => {
        if (type === 'change') listeners.delete(fn);
      }),
      dispatchEvent: vi.fn((event: Event) => {
        listeners.forEach((fn) => fn(event as MediaQueryListEvent));
        return true;
      }),
    };
  });

  window.matchMedia = matchMediaMock;

  return {
    setMatches(matches: boolean) {
      currentMatches = matches;
      const event = {
        matches,
        media: mediaQuery,
      } as MediaQueryListEvent;
      listeners.forEach((fn) => {
        try {
          fn(event);
        } catch {
          // ignore callback exceptions
        }
      });
    },
    restore() {
      listeners.clear();
      if (typeof window !== 'undefined') {
        if (original) {
          window.matchMedia = original;
        } else {
          delete (window as any).matchMedia;
        }
      }
    },
  };
}

/**
 * Stubs window.__TAURI__ window control APIs (minimize, toggleMaximize, close, startDragging, setTheme).
 */
export function stubTauri(options?: {
  isMaximized?: boolean;
  rejectActions?: boolean;
}): TauriStubController {
  const mockWindow = {
    minimize: options?.rejectActions
      ? vi.fn().mockRejectedValue(new Error('Tauri minimize failed'))
      : vi.fn().mockResolvedValue(undefined),
    toggleMaximize: options?.rejectActions
      ? vi.fn().mockRejectedValue(new Error('Tauri toggleMaximize failed'))
      : vi.fn().mockResolvedValue(undefined),
    close: options?.rejectActions
      ? vi.fn().mockRejectedValue(new Error('Tauri close failed'))
      : vi.fn().mockResolvedValue(undefined),
    startDragging: options?.rejectActions
      ? vi.fn().mockRejectedValue(new Error('Tauri startDragging failed'))
      : vi.fn().mockResolvedValue(undefined),
    setTheme: options?.rejectActions
      ? vi.fn().mockRejectedValue(new Error('Tauri setTheme failed'))
      : vi.fn().mockResolvedValue(undefined),
    isMaximized: vi.fn().mockResolvedValue(options?.isMaximized ?? false),
  };

  if (typeof window !== 'undefined') {
    (window as any).__TAURI__ = {
      window: {
        getCurrentWindow: () => mockWindow,
      },
    };
  }

  return {
    mockWindow,
    unstub() {
      unstubTauri();
    },
  };
}

/**
 * Removes window.__TAURI__ if present with defensive global guard.
 */
export function unstubTauri(): void {
  if (typeof window !== 'undefined') {
    delete (window as any).__TAURI__;
  }
}

/**
 * Comprehensive setup helper: installs matchMedia stub and clean localStorage.
 */
export function installBrowserStubs(options?: { darkScheme?: boolean }) {
  const matchMediaCtrl = stubMatchMedia(options?.darkScheme ?? false);
  const localStorageCtrl = stubLocalStorage();

  return {
    matchMediaCtrl,
    localStorageCtrl,
    restore() {
      matchMediaCtrl.restore();
      localStorageCtrl.restore();
      unstubTauri();
    },
  };
}

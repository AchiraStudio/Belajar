import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useLocation, useParams, useSearchParams, Routes, Route } from 'react-router';
import {
  mount,
  stubMatchMedia,
  stubTauri,
  unstubTauri,
  stubLocalStorage,
  createLocalStorageMock,
  screen,
  cleanup,
  useTestTheme,
} from './index';
import { useTheme } from '../../../services/theme/ThemeContext';
import { useToast } from '../../../components/ui/Toast';

describe('Challenger M1 Adversarial Suite: Mounting Harness & Browser Stubs', () => {
  beforeEach(() => {
    unstubTauri();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
      document.documentElement.removeAttribute('data-theme');
    }
  });

  afterEach(() => {
    cleanup();
    unstubTauri();
  });

  // ==========================================================================
  // CHALLENGE AREA 1: Deep-Link Route Navigation under MemoryRouter
  // ==========================================================================
  describe('Area 1: Deep-Link Route Navigation under MemoryRouter', () => {
    function DeepLinkConsumer() {
      const location = useLocation();
      const params = useParams();
      const [searchParams] = useSearchParams();

      return (
        <div>
          <div data-testid="pathname">{location.pathname}</div>
          <div data-testid="search">{location.search}</div>
          <div data-testid="hash">{location.hash}</div>
          <div data-testid="param-id">{params.id ?? ''}</div>
          <div data-testid="query-tab">{searchParams.get('tab') ?? ''}</div>
          <div data-testid="query-focus">{searchParams.get('focus') ?? ''}</div>
        </div>
      );
    }

    it('preserves route path and query parameters for deep-link #/materi/101?tab=mindmap', () => {
      mount(
        <Routes>
          <Route path="/materi/:id" element={<DeepLinkConsumer />} />
        </Routes>,
        { route: '#/materi/101?tab=mindmap' }
      );

      expect(screen.getByTestId('pathname').textContent).toBe('/materi/101');
      expect(screen.getByTestId('search').textContent).toBe('?tab=mindmap');
      expect(screen.getByTestId('param-id').textContent).toBe('101');
      expect(screen.getByTestId('query-tab').textContent).toBe('mindmap');
    });

    it('handles multiple query parameters and preserves search params structure', () => {
      mount(
        <Routes>
          <Route path="/materi/:id" element={<DeepLinkConsumer />} />
        </Routes>,
        { route: '#/materi/202?tab=mindmap&focus=concept-5' }
      );

      expect(screen.getByTestId('pathname').textContent).toBe('/materi/202');
      expect(screen.getByTestId('query-tab').textContent).toBe('mindmap');
      expect(screen.getByTestId('query-focus').textContent).toBe('concept-5');
    });

    it('normalizes paths without leading slash after hash (#materi/101?tab=mindmap)', () => {
      mount(
        <Routes>
          <Route path="/materi/:id" element={<DeepLinkConsumer />} />
        </Routes>,
        { route: '#materi/101?tab=mindmap' }
      );

      expect(screen.getByTestId('pathname').textContent).toBe('/materi/101');
      expect(screen.getByTestId('query-tab').textContent).toBe('mindmap');
    });

    it('handles empty route or standalone hash (#) cleanly', () => {
      mount(
        <Routes>
          <Route path="/" element={<DeepLinkConsumer />} />
        </Routes>,
        { route: '#' }
      );

      expect(screen.getByTestId('pathname').textContent).toBe('/');
      expect(screen.getByTestId('search').textContent).toBe('');
    });
  });

  // ==========================================================================
  // CHALLENGE AREA 2: matchMedia, dynamic setMatches(true), and data-theme
  // ==========================================================================
  describe('Area 2: matchMedia dynamic setMatches(true) and data-theme update', () => {
    it('directly triggers subscribed change listeners on window.matchMedia', () => {
      const ctrl = stubMatchMedia(false);
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = vi.fn();

      mql.addEventListener('change', listener);
      ctrl.setMatches(true);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ matches: true }));

      ctrl.restore();
    });

    it('verifies dynamic setMatches(true) reactively updates data-theme in mount({ theme: "system" })', () => {
      const ctrl = stubMatchMedia(false);

      function SystemThemeViewer() {
        const { theme, resolvedTheme } = useTestTheme();
        return (
          <div>
            <span data-testid="mode">{theme}</span>
            <span data-testid="resolved">{resolvedTheme}</span>
          </div>
        );
      }

      mount(<SystemThemeViewer />, { theme: 'system' });

      // Initial state: light
      expect(screen.getByTestId('resolved').textContent).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');

      // Now dynamically simulate OS dark mode switch
      ctrl.setMatches(true);

      // Verify mount's TestProviders reacts to matchMedia change
      const docThemeAfter = document.documentElement.getAttribute('data-theme');
      const resolvedAfter = screen.getByTestId('resolved').textContent;

      ctrl.restore();

      // Confirms dynamic matchMedia update propagates synchronously to DOM and theme state
      expect(docThemeAfter).toBe('dark');
      expect(resolvedAfter).toBe('dark');
    });

    it('verifies mount() supports components consuming useTheme() from ThemeContext without crashing', () => {
      function ProductionThemeConsumer() {
        const { theme, resolvedTheme } = useTheme();
        return <div data-testid="prod-theme">{theme}:{resolvedTheme}</div>;
      }

      let errorThrown: any = null;
      try {
        mount(<ProductionThemeConsumer />);
      } catch (err) {
        errorThrown = err;
      }

      expect(errorThrown).toBeNull();
      expect(screen.getByTestId('prod-theme').textContent).toBe('light:light');
    });

    it('verifies mount() supports components consuming useToast() from Toast without crashing', () => {
      function ToastConsumer() {
        const toast = useToast();
        return <button onClick={() => toast.success('hi')}>Toast</button>;
      }

      let errorThrown: any = null;
      try {
        mount(<ToastConsumer />);
      } catch (err) {
        errorThrown = err;
      }

      expect(errorThrown).toBeNull();
      expect(screen.getByRole('button', { name: 'Toast' })).toBeDefined();
    });
  });

  // ==========================================================================
  // CHALLENGE AREA 3: window.__TAURI__ stubbing and leak isolation
  // ==========================================================================
  describe('Area 3: window.__TAURI__ stubbing and global leak isolation', () => {
    it('verifies all window control methods exist and return promises', async () => {
      const { unstub } = stubTauri();
      const win = (window as any).__TAURI__.window.getCurrentWindow();

      expect(typeof win.minimize).toBe('function');
      expect(typeof win.toggleMaximize).toBe('function');
      expect(typeof win.close).toBe('function');
      expect(typeof win.startDragging).toBe('function');
      expect(typeof win.setTheme).toBe('function');
      expect(typeof win.isMaximized).toBe('function');

      await expect(win.minimize()).resolves.toBeUndefined();
      await expect(win.toggleMaximize()).resolves.toBeUndefined();
      await expect(win.close()).resolves.toBeUndefined();
      await expect(win.startDragging()).resolves.toBeUndefined();
      await expect(win.setTheme('dark')).resolves.toBeUndefined();
      await expect(win.isMaximized()).resolves.toBe(false);

      unstub();
    });

    it('ADVERSARIAL: Does unstubTauri() leave global leaks on window?', () => {
      stubTauri();
      expect((window as any).__TAURI__).toBeDefined();
      expect('__TAURI__' in window).toBe(true);

      unstubTauri();
      expect((window as any).__TAURI__).toBeUndefined();
      expect('__TAURI__' in window).toBe(false);
    });

    it('verifies mount({ isTauri: true }) automatically cleans up window.__TAURI__ on unmount', () => {
      const { unmount } = mount(<div>Tauri Test</div>, { isTauri: true });
      expect((window as any).__TAURI__).toBeDefined();

      // Test unmounts component
      unmount();

      // Does mount clean up __TAURI__ on unmount?
      const isLeaking = (window as any).__TAURI__ !== undefined;

      // Confirms mount automatically cleans up __TAURI__ on unmount
      expect(isLeaking).toBe(false);
    });

    it('rejectActions option properly causes all action promises to reject', async () => {
      const { unstub } = stubTauri({ rejectActions: true });
      const win = (window as any).__TAURI__.window.getCurrentWindow();

      await expect(win.minimize()).rejects.toThrow('Tauri minimize failed');
      await expect(win.toggleMaximize()).rejects.toThrow('Tauri toggleMaximize failed');
      await expect(win.close()).rejects.toThrow('Tauri close failed');
      await expect(win.startDragging()).rejects.toThrow('Tauri startDragging failed');
      await expect(win.setTheme('dark')).rejects.toThrow('Tauri setTheme failed');

      unstub();
    });
  });

  // ==========================================================================
  // CHALLENGE AREA 4: localStorage stubbing and cross-test leakage
  // ==========================================================================
  describe('Area 4: localStorage stubbing and cross-test leakage', () => {
    it('isolates state across independent stubLocalStorage() instances', () => {
      // Test Instance 1
      const inst1 = stubLocalStorage();
      window.localStorage.setItem('user_session', 'abc-123');
      expect(window.localStorage.getItem('user_session')).toBe('abc-123');
      inst1.restore();

      // Test Instance 2
      const inst2 = stubLocalStorage();
      expect(window.localStorage.getItem('user_session')).toBeNull();
      inst2.restore();
    });

    it('createLocalStorageMock() complies with Web Storage API contracts', () => {
      const storage = createLocalStorageMock();

      // 1. Storage length and keys
      storage.setItem('alpha', '1');
      storage.setItem('beta', '2');
      storage.setItem('gamma', '3');
      expect(storage.length).toBe(3);
      expect(storage.key(0)).toBe('alpha');
      expect(storage.key(1)).toBe('beta');
      expect(storage.key(2)).toBe('gamma');
      expect(storage.key(99)).toBeNull();

      // 2. Overwrite value
      storage.setItem('alpha', 'updated');
      expect(storage.getItem('alpha')).toBe('updated');
      expect(storage.length).toBe(3);

      // 3. Remove item
      storage.removeItem('beta');
      expect(storage.getItem('beta')).toBeNull();
      expect(storage.length).toBe(2);

      // 4. Non-existent item
      expect(storage.getItem('missing')).toBeNull();

      // 5. Coercion to string
      storage.setItem('num' as any, 12345 as any);
      expect(storage.getItem('num')).toBe('12345');

      // 6. Clear
      storage.clear();
      expect(storage.length).toBe(0);
      expect(storage.getItem('alpha')).toBeNull();
    });

    it('ADVERSARIAL: Does mount() isolate or clear localStorage between mounts?', () => {
      // First mount writes to localStorage
      mount(
        <button
          onClick={() => {
            window.localStorage.setItem('leaked_key', 'leaked_value');
          }}
        >
          Write
        </button>
      );
      screen.getByRole('button', { name: 'Write' }).click();

      cleanup();

      // Second mount without explicit localStorage stubbing
      mount(<div>Second Mount</div>);

      // Check if localStorage retained the value from first mount
      const leakedValue = window.localStorage.getItem('leaked_key');
      expect(leakedValue).toBe('leaked_value'); // Proves mount() does not isolate localStorage by default

      // Clean up for other tests
      window.localStorage.clear();
    });

    it('verifies mount({ clearStorage: true }) clears prior localStorage entries', () => {
      window.localStorage.setItem('prior_key', 'prior_value');
      expect(window.localStorage.getItem('prior_key')).toBe('prior_value');

      mount(<div>Cleared Storage Mount</div>, { clearStorage: true });

      expect(window.localStorage.getItem('prior_key')).toBeNull();
    });

    it('verifies mount({ isolateStorage: true }) isolates storage and restores original on unmount', () => {
      window.localStorage.setItem('outer_key', 'outer_value');

      const { unmount } = mount(
        <button
          onClick={() => {
            window.localStorage.setItem('isolated_key', 'isolated_value');
          }}
        >
          Isolate Write
        </button>,
        { isolateStorage: true }
      );

      screen.getByRole('button', { name: 'Isolate Write' }).click();
      expect(window.localStorage.getItem('isolated_key')).toBe('isolated_value');

      unmount();

      // Original localStorage restored
      expect(window.localStorage.getItem('outer_key')).toBe('outer_value');
      expect(window.localStorage.getItem('isolated_key')).toBeNull();

      window.localStorage.clear();
    });
  });
});

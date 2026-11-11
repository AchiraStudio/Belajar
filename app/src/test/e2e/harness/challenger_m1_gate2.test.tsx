import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { useState } from 'react';
import {
  mount,
  stubMatchMedia,
  stubTauri,
  unstubTauri,
  stubLocalStorage,
  screen,
  cleanup,
  act,
  fireEvent,
  waitFor,
  useTestTheme,
  mockRpc,
} from './index';
import { useTheme } from '../../../services/theme/ThemeContext';
import { useToast } from '../../../components/ui/Toast';

describe('Challenger M1 Gate 2: Empirical Verification & Adversarial Stress Suite', () => {
  beforeEach(() => {
    unstubTauri();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
      document.documentElement.removeAttribute('data-theme');
    }
    mockRpc.install();
    mockRpc.reset();
  });

  afterEach(() => {
    cleanup();
    unstubTauri();
    mockRpc.uninstall();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
      document.documentElement.removeAttribute('data-theme');
    }
  });

  // ==========================================================================
  // DEFECT 1 VERIFICATION: Provider Bridging (useTheme + useToast)
  // ==========================================================================
  describe('Defect 1: Provider Bridging (Theme & Toast)', () => {
    function ThemeAndToastConsumer() {
      const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
      const toast = useToast();

      return (
        <div>
          <span data-testid="active-theme">{theme}</span>
          <span data-testid="resolved-theme">{resolvedTheme}</span>
          <button data-testid="set-dark-btn" onClick={() => setTheme('dark')}>
            Make Dark
          </button>
          <button data-testid="set-light-btn" onClick={() => setTheme('light')}>
            Make Light
          </button>
          <button data-testid="toggle-btn" onClick={() => toggleTheme()}>
            Toggle
          </button>
          <button
            data-testid="toast-success-btn"
            onClick={() => {
              toast.success('Operasi Berhasil!');
            }}
          >
            Show Success Toast
          </button>
          <button
            data-testid="toast-error-btn"
            onClick={() => {
              toast.error('Terjadi Kegagalan!');
            }}
          >
            Show Error Toast
          </button>
        </div>
      );
    }

    it('empirically verifies mounting component consuming useTheme and useToast succeeds without error', () => {
      let renderError: Error | null = null;
      try {
        mount(<ThemeAndToastConsumer />);
      } catch (err: any) {
        renderError = err;
      }

      expect(renderError).toBeNull();
      expect(screen.getByTestId('active-theme').textContent).toBe('light');
      expect(screen.getByTestId('resolved-theme').textContent).toBe('light');
    });

    it('empirically verifies theme state changes via useTheme update document and DOM attributes', () => {
      mount(<ThemeAndToastConsumer />);

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');

      fireEvent.click(screen.getByTestId('set-dark-btn'));
      expect(screen.getByTestId('active-theme').textContent).toBe('dark');
      expect(screen.getByTestId('resolved-theme').textContent).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      fireEvent.click(screen.getByTestId('toggle-btn'));
      expect(screen.getByTestId('active-theme').textContent).toBe('light');
      expect(screen.getByTestId('resolved-theme').textContent).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('empirically verifies useToast triggers visible toast notification in the DOM', () => {
      mount(<ThemeAndToastConsumer />);

      fireEvent.click(screen.getByTestId('toast-success-btn'));
      expect(screen.getByText('Operasi Berhasil!')).toBeDefined();

      fireEvent.click(screen.getByTestId('toast-error-btn'));
      expect(screen.getByText('Terjadi Kegagalan!')).toBeDefined();
    });

    it('empirically verifies result.setThemeMode helper updates theme reactively', () => {
      const result = mount(<ThemeAndToastConsumer />);

      expect(result.currentTheme).toBe('light');

      result.setThemeMode('dark');
      expect(result.currentTheme).toBe('dark');
      expect(screen.getByTestId('resolved-theme').textContent).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      result.setThemeMode('light');
      expect(result.currentTheme).toBe('light');
      expect(screen.getByTestId('resolved-theme').textContent).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
  });

  // ==========================================================================
  // DEFECT 2 VERIFICATION: Dynamic matchMedia setMatches(true/false)
  // ==========================================================================
  describe('Defect 2: Dynamic matchMedia and System Theme Reactivity', () => {
    function SystemWatcher() {
      const testTheme = useTestTheme();
      const prodTheme = useTheme();

      return (
        <div>
          <span data-testid="test-mode">{testTheme.theme}</span>
          <span data-testid="test-resolved">{testTheme.resolvedTheme}</span>
          <span data-testid="prod-mode">{prodTheme.theme}</span>
          <span data-testid="prod-resolved">{prodTheme.resolvedTheme}</span>
        </div>
      );
    }

    it('empirically verifies dynamic setMatches(true) updates DOM attribute and component state', () => {
      const ctrl = stubMatchMedia(false); // starts in light

      const result = mount(<SystemWatcher />, { theme: 'system' });

      expect(screen.getByTestId('test-resolved').textContent).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(result.currentTheme).toBe('light');

      // Trigger OS dark switch
      ctrl.setMatches(true);

      expect(screen.getByTestId('test-resolved').textContent).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(result.currentTheme).toBe('dark');

      ctrl.restore();
    });

    it('empirically verifies bidirectional system theme changes under act()', async () => {
      const ctrl = stubMatchMedia(false); // starts in light

      const result = mount(<SystemWatcher />, { theme: 'system' });

      expect(screen.getByTestId('test-resolved').textContent).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(result.currentTheme).toBe('light');

      // Switch OS to dark
      act(() => {
        ctrl.setMatches(true);
      });
      expect(screen.getByTestId('test-resolved').textContent).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(result.currentTheme).toBe('dark');

      // Switch OS back to light
      act(() => {
        ctrl.setMatches(false);
      });
      expect(screen.getByTestId('test-resolved').textContent).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(result.currentTheme).toBe('light');

      ctrl.restore();
    });

    it('empirically verifies explicit theme overrides OS system preference', () => {
      const ctrl = stubMatchMedia(false); // OS is light

      mount(<SystemWatcher />, { theme: 'dark' });

      expect(screen.getByTestId('test-resolved').textContent).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      // OS flips to dark, but explicit was already dark
      ctrl.setMatches(true);
      expect(screen.getByTestId('test-resolved').textContent).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      // OS flips to light, explicit remains dark
      ctrl.setMatches(false);
      expect(screen.getByTestId('test-resolved').textContent).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      ctrl.restore();
    });

    it('empirically verifies unmounting cleans up matchMedia listener without leaks', () => {
      const ctrl = stubMatchMedia(false);

      const result = mount(<SystemWatcher />, { theme: 'system' });
      result.unmount();

      // Triggering matches after unmount must not throw
      expect(() => {
        ctrl.setMatches(true);
      }).not.toThrow();

      ctrl.restore();
    });
  });

  // ==========================================================================
  // DEFECT 3 VERIFICATION: Tauri Mock Lifecycle & Defensive Guard
  // ==========================================================================
  describe('Defect 3: Tauri Lifecycle Teardown & Defensive Guards', () => {
    it('empirically verifies mount({ isTauri: true }) cleans up window.__TAURI__ on unmount()', () => {
      expect((window as any).__TAURI__).toBeUndefined();

      const result = mount(<div>Tauri Test Instance</div>, { isTauri: true });
      expect((window as any).__TAURI__).toBeDefined();
      expect(typeof (window as any).__TAURI__.window.getCurrentWindow).toBe('function');

      result.unmount();

      expect((window as any).__TAURI__).toBeUndefined();
      expect('__TAURI__' in window).toBe(false);
    });

    it('empirically verifies cleanup() also triggers Tauri cleanup if unmount was omitted', () => {
      expect((window as any).__TAURI__).toBeUndefined();

      mount(<div>Tauri Instance 2</div>, { isTauri: true });
      expect((window as any).__TAURI__).toBeDefined();

      // Call RTL cleanup
      cleanup();

      expect((window as any).__TAURI__).toBeUndefined();
      expect('__TAURI__' in window).toBe(false);
    });

    it('empirically verifies unstubTauri() is idempotent and safe against repeated calls', () => {
      expect(() => {
        unstubTauri();
        unstubTauri();
        unstubTauri();
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // STORAGE ISOLATION & INITIALIZATION VERIFICATION
  // ==========================================================================
  describe('Storage Isolation and Options Verification', () => {
    it('empirically verifies initialStorage populates keys before component renders', () => {
      function StorageReader() {
        const value = window.localStorage.getItem('initial_key');
        return <div data-testid="storage-val">{value}</div>;
      }

      mount(<StorageReader />, {
        initialStorage: { initial_key: 'custom_secret' },
      });

      expect(screen.getByTestId('storage-val').textContent).toBe('custom_secret');
    });

    it('empirically verifies isolateStorage prevents writes from polluting global storage', () => {
      window.localStorage.setItem('keep_me', 'safe_data');

      const result = mount(
        <button
          onClick={() => {
            window.localStorage.setItem('temp_data', '12345');
          }}
        >
          Write Temp
        </button>,
        { isolateStorage: true }
      );

      fireEvent.click(screen.getByRole('button', { name: 'Write Temp' }));
      expect(window.localStorage.getItem('temp_data')).toBe('12345');

      result.unmount();

      expect(window.localStorage.getItem('keep_me')).toBe('safe_data');
      expect(window.localStorage.getItem('temp_data')).toBeNull();
    });
  });
});

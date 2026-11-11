import { cleanup, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from '../../../services/theme/ThemeContext';
import { mockRpc, renderWithProviders, stubMatchMedia, unstubTauri } from '../harness';

function ThemeConsumer() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  return (
    <main aria-label="Pengontrol Tema">
      <span aria-label="Tema Aktif">{theme}</span>
      <span aria-label="Tema Terdefinisi">{resolvedTheme}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        Pilih Gelap
      </button>
      <button type="button" onClick={() => setTheme('light')}>
        Pilih Terang
      </button>
      <button type="button" onClick={() => toggleTheme()}>
        Ganti Tema
      </button>
    </main>
  );
}

describe('Feature 4: Theme Mode Controller', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.style.colorScheme = '';
    }
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.style.colorScheme = '';
    }
  });

  it('04.1 - Explicit Light Theme Mounting', () => {
    renderWithProviders(<ThemeConsumer />, { theme: 'light' });

    expect(screen.getByRole('main', { name: 'Pengontrol Tema' })).toBeTruthy();
    expect(screen.getByLabelText('Tema Aktif').textContent).toBe('light');
    expect(screen.getByLabelText('Tema Terdefinisi').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('04.2 - Explicit Dark Theme Mounting', () => {
    renderWithProviders(<ThemeConsumer />, { theme: 'dark' });

    expect(screen.getByRole('main', { name: 'Pengontrol Tema' })).toBeTruthy();
    expect(screen.getByLabelText('Tema Aktif').textContent).toBe('dark');
    expect(screen.getByLabelText('Tema Terdefinisi').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('04.3 - System Preference Auto-Detection', () => {
    stubMatchMedia(true);

    renderWithProviders(<ThemeConsumer />, { theme: 'system' });

    expect(screen.getByRole('main', { name: 'Pengontrol Tema' })).toBeTruthy();
    expect(screen.getByLabelText('Tema Aktif').textContent).toBe('system');
    expect(screen.getByLabelText('Tema Terdefinisi').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('04.4 - Toggle Theme Cycle Execution', () => {
    renderWithProviders(<ThemeConsumer />, { theme: 'light' });

    const toggleBtn = screen.getByRole('button', { name: 'Ganti Tema' });

    // Initial is light
    expect(screen.getByLabelText('Tema Terdefinisi').textContent).toBe('light');

    // Light -> Dark
    fireEvent.click(toggleBtn);
    expect(screen.getByLabelText('Tema Terdefinisi').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // Dark -> Light
    fireEvent.click(toggleBtn);
    expect(screen.getByLabelText('Tema Terdefinisi').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('04.5 - LocalStorage Persistence & Restoration', () => {
    // First mount with light theme
    const { unmount } = renderWithProviders(<ThemeConsumer />, { theme: 'light', themeStorageKey: 'belajar-theme' });

    // Switch to dark updates storage
    fireEvent.click(screen.getByRole('button', { name: 'Pilih Gelap' }));
    expect(window.localStorage.getItem('belajar-theme')).toBe('dark');
    unmount();

    // Second mount with persisted storage restores dark preference
    renderWithProviders(<ThemeConsumer />, {
      initialStorage: { 'belajar-theme': 'dark' },
      themeStorageKey: 'belajar-theme',
    });
    expect(screen.getByLabelText('Tema Terdefinisi').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

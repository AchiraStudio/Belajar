import { cleanup, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from '../../../components/layout/TopBar';
import { mockRpc, renderWithProviders, unstubTauri } from '../harness';

describe('Feature 7: Top Application Bar', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('07.1 - Dynamic Route Title Propagation', () => {
    // On /materi
    const { unmount } = renderWithProviders(<TopBar />, { route: '/materi' });
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Perpustakaan Materi');
    unmount();

    // On /
    renderWithProviders(<TopBar />, { route: '/' });
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Beranda');
  });

  it('07.2 - Search Trigger Accessibility & Keyboard Hint', () => {
    renderWithProviders(<TopBar />);

    const searchBtn = screen.getByRole('button', { name: 'Cari materi atau topik' });
    expect(searchBtn).toBeTruthy();
    expect(screen.getByText('Ctrl K')).toBeTruthy();
  });

  it('07.3 - Search Click Callback Execution', () => {
    const onSearchClick = vi.fn();
    renderWithProviders(<TopBar onSearchClick={onSearchClick} />);

    const searchBtn = screen.getByRole('button', { name: 'Cari materi atau topik' });
    fireEvent.click(searchBtn);

    expect(onSearchClick).toHaveBeenCalledTimes(1);
  });

  it('07.4 - Inline Theme Mode Switcher', () => {
    renderWithProviders(<TopBar />, { theme: 'light' });

    const themeBtn = screen.getByRole('button', { name: /tema:/i });
    expect(themeBtn).toBeTruthy();
    expect(themeBtn.getAttribute('aria-label')).toMatch(/tema:\s*terang/i);

    fireEvent.click(themeBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('07.5 - No server-connection pill (the app works offline)', () => {
    renderWithProviders(<TopBar />);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/server terhubung/i)).toBeNull();
  });
});

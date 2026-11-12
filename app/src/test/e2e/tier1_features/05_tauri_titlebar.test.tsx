import { cleanup, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from '../../../components/layout/TopBar';
import { mockRpc, renderWithProviders, unstubTauri } from '../harness';

describe('Feature 5: Tauri title bar (merged into the top bar)', () => {
  beforeEach(() => {
    unstubTauri();
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

  it('05.1 - Browser has the top bar but no window buttons', () => {
    renderWithProviders(<TopBar />, { isTauri: false });

    expect(screen.queryByRole('banner', { name: 'Bilah judul aplikasi' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tutup' })).toBeNull();
  });

  it('05.1b - No window chrome on Android (the system provides it)', () => {
    const ua = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile');
    renderWithProviders(<TopBar />, { isTauri: true });

    expect(screen.queryByRole('button', { name: 'Tutup' })).toBeNull();
    ua.mockRestore();
  });

  it('05.2 - Tauri Desktop Frame Rendering', () => {
    // Under Tauri desktop simulation
    renderWithProviders(<TopBar />, { isTauri: true });

    const banner = screen.getByRole('banner', { name: 'Bilah judul aplikasi' });
    expect(banner).toBeTruthy();
    expect(banner.textContent).toMatch(/stuby/i);
  });

  it('05.3 - Minimize Control Dispatch', () => {
    renderWithProviders(<TopBar />, { isTauri: true });

    const minBtn = screen.getByRole('button', { name: 'Perkecil' });
    expect(minBtn).toBeTruthy();

    const win = (window as any).__TAURI__.window.getCurrentWindow();
    fireEvent.click(minBtn);
    expect(win.minimize).toHaveBeenCalledTimes(1);
  });

  it('05.4 - Maximize and Restore Toggle', () => {
    renderWithProviders(<TopBar />, { isTauri: true });

    const maxBtn = screen.getByRole('button', { name: /perbesar|pulihkan/i });
    expect(maxBtn).toBeTruthy();

    const win = (window as any).__TAURI__.window.getCurrentWindow();
    fireEvent.click(maxBtn);
    expect(win.toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it('05.5 - Close Window Control Dispatch', () => {
    renderWithProviders(<TopBar />, { isTauri: true });

    const closeBtn = screen.getByRole('button', { name: 'Tutup' });
    expect(closeBtn).toBeTruthy();

    const win = (window as any).__TAURI__.window.getCurrentWindow();
    fireEvent.click(closeBtn);
    expect(win.close).toHaveBeenCalledTimes(1);
  });
});

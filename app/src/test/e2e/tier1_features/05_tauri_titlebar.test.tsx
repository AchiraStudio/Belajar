import { cleanup, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TitleBar } from '../../../components/layout/TitleBar';
import { mockRpc, renderWithProviders, unstubTauri } from '../harness';

describe('Feature 5: Tauri Custom Titlebar', () => {
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

  it('05.1 - Browser Zero DOM Null Rendering', () => {
    // In browser mode (isTauri: false)
    renderWithProviders(<TitleBar />, { isTauri: false });

    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByText('Belajar')).toBeNull();
  });

  it('05.2 - Tauri Desktop Frame Rendering', () => {
    // Under Tauri desktop simulation
    renderWithProviders(<TitleBar />, { isTauri: true });

    const banner = screen.getByRole('banner', { name: 'Bilah judul aplikasi' });
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('Belajar');
  });

  it('05.3 - Minimize Control Dispatch', () => {
    renderWithProviders(<TitleBar />, { isTauri: true });

    const minBtn = screen.getByRole('button', { name: 'Perkecil' });
    expect(minBtn).toBeTruthy();

    const win = (window as any).__TAURI__.window.getCurrentWindow();
    fireEvent.click(minBtn);
    expect(win.minimize).toHaveBeenCalledTimes(1);
  });

  it('05.4 - Maximize and Restore Toggle', () => {
    renderWithProviders(<TitleBar />, { isTauri: true });

    const maxBtn = screen.getByRole('button', { name: /perbesar|pulihkan/i });
    expect(maxBtn).toBeTruthy();

    const win = (window as any).__TAURI__.window.getCurrentWindow();
    fireEvent.click(maxBtn);
    expect(win.toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it('05.5 - Close Window Control Dispatch', () => {
    renderWithProviders(<TitleBar />, { isTauri: true });

    const closeBtn = screen.getByRole('button', { name: 'Tutup' });
    expect(closeBtn).toBeTruthy();

    const win = (window as any).__TAURI__.window.getCurrentWindow();
    fireEvent.click(closeBtn);
    expect(win.close).toHaveBeenCalledTimes(1);
  });
});

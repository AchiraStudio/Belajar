import { cleanup, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrostPanel } from '../../../components/ui/FrostPanel';
import { SurfaceCard } from '../../../components/ui/SurfaceCard';
import { mockRpc, renderWithProviders, unstubTauri } from '../harness';

describe('Feature 2: Elevation & Blur Scale', () => {
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

  it('02.1 - Default Panel Elevation', () => {
    renderWithProviders(
      <FrostPanel role="region" aria-label="Panel Frost Utama">
        <p>Konten Panel Belajar</p>
      </FrostPanel>
    );

    const panel = screen.getByRole('region', { name: 'Panel Frost Utama' });
    expect(panel).toBeTruthy();
    expect(panel.className).toMatch(/frostPanel/);
    expect(panel.className).toMatch(/panel/);
  });

  it('02.2 - Raised Popover Elevation', () => {
    renderWithProviders(
      <FrostPanel elevation="raised" role="region" aria-label="Menu Mengambang">
        <p>Menu Aksi Popover</p>
      </FrostPanel>
    );

    const raisedPanel = screen.getByRole('region', { name: 'Menu Mengambang' });
    expect(raisedPanel).toBeTruthy();
    expect(raisedPanel.className).toMatch(/frostPanel/);
    expect(raisedPanel.className).toMatch(/raised/);
  });

  it('02.3 - Modal Dialog Overlay Depth', () => {
    renderWithProviders(
      <FrostPanel elevation="overlay" role="dialog" aria-label="Jendela Modal">
        <h2>Konfirmasi Tindakan</h2>
        <button type="button">Tutup</button>
      </FrostPanel>
    );

    const modal = screen.getByRole('dialog', { name: 'Jendela Modal' });
    expect(modal).toBeTruthy();
    expect(modal.className).toMatch(/frostPanel/);
    expect(modal.className).toMatch(/overlay/);
    expect(screen.getByRole('heading', { level: 2, name: 'Konfirmasi Tindakan' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tutup' })).toBeTruthy();
  });

  it('02.4 - Unbordered Surface Option', () => {
    renderWithProviders(
      <FrostPanel bordered={false} role="region" aria-label="Permukaan Mulus">
        <p>Permukaan Tanpa Garis Tepi</p>
      </FrostPanel>
    );

    const unbordered = screen.getByRole('region', { name: 'Permukaan Mulus' });
    expect(unbordered).toBeTruthy();
    expect(unbordered.className).toMatch(/unbordered/);
  });

  it('02.5 - Solid Fallback Resilience', () => {
    renderWithProviders(
      <SurfaceCard role="region" aria-label="Kartu Konten Solid">
        <p>Konten Opaque untuk Keterbacaan Tinggi</p>
      </SurfaceCard>
    );

    const card = screen.getByRole('region', { name: 'Kartu Konten Solid' });
    expect(card).toBeTruthy();
    expect(card.className).toMatch(/surfaceCard/);
    expect(card.textContent).toContain('Konten Opaque untuk Keterbacaan Tinggi');
  });
});

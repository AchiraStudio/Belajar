import { cleanup, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dock } from '../../../components/layout/Dock';
import { TopBar } from '../../../components/layout/TopBar';
import { mockRpc, renderWithProviders, unstubTauri } from '../harness';

describe('Feature 6: Floating Navigation Dock', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockRpc.install();
    mockRpc.reset();
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('06.1 - The dock carries every product destination (desktop, nothing hidden)', () => {
    renderWithProviders(<Dock onSearch={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Navigasi Utama' });
    expect(nav).toBeTruthy();
    for (const name of [/beranda/i, /materi/i, /kuis/i, /soal lemah/i, /kartu belajar/i, /progres/i, /beasiswa & peluang/i, /game/i, /pengaturan/i, /profil/i, /bantuan/i]) {
      expect(within(nav).getByRole('link', { name })).toBeTruthy();
    }
  });

  it('06.2 - Active Link State Highlighting', () => {
    renderWithProviders(<Dock onSearch={() => {}} />, { route: '/materi' });
    expect(screen.getByRole('link', { name: /materi/i }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: /beranda/i }).getAttribute('aria-current')).toBeNull();
  });

  it('06.3 - Destinations without a service are marked, never hidden or faked', () => {
    renderWithProviders(<Dock onSearch={() => {}} />);
    const community = screen.getByRole('link', { name: /komunitas/i });
    expect(community.textContent).toMatch(/segera/i);
  });

  it('06.4 - Brand link lives in the top bar and goes home', () => {
    renderWithProviders(<TopBar />);
    const brandLink = screen.getByTitle('Beranda Stuby');
    expect(brandLink.getAttribute('href')).toBe('/');
    expect(brandLink.textContent).toContain('stuby');
  });
});

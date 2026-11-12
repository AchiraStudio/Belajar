import { cleanup, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockRpc, renderWithProviders, unstubTauri } from '../harness';

describe('Feature 1: Frost Token System', () => {
  let tokensCss: string;

  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    const cssPath = path.resolve(__dirname, '../../../../src/styles/tokens.css');
    tokensCss = fs.readFileSync(cssPath, 'utf-8');
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('01.1 - Light theme: cream page, white cards, ink and bamboo from the logo', () => {
    renderWithProviders(
      <main aria-label="Area Pengujian Token">
        <div data-testid="token-probe">Stuby Light Theme</div>
      </main>,
      { theme: 'light' }
    );

    expect(screen.getByRole('main', { name: 'Area Pengujian Token' })).toBeTruthy();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    // Palette: ink (outline), bamboo (green), cream page, white cards, one sun accent.
    expect(tokensCss).toMatch(/--ink:\s*#141816/);
    expect(tokensCss).toMatch(/--bamboo:\s*#8DC63F/);
    expect(tokensCss).toMatch(/--canvas:\s*#F6F4EC/);
    expect(tokensCss).toMatch(/--card:\s*#FFFFFF/);
    expect(tokensCss).toMatch(/--sun:\s*#F2B705/);
    expect(tokensCss).toMatch(/--fill:\s*#8DC63F/);
    expect(tokensCss).toMatch(/--on-fill:\s*#141816/);
    expect(tokensCss).toMatch(/--tint-leaf:\s*#E4F2CC/);
    // One material: the page has no wallpaper behind it.
    expect(tokensCss).toMatch(/--wallpaper:\s*none/);
    // Content that must never be see-through keeps a truly opaque token.
    expect(tokensCss).toMatch(/--surface-opaque:\s*#FFFFFF/);
  });

  it('01.2 - Glass is the dock only: every other blur token is flat', () => {
    renderWithProviders(
      <main aria-label="Area Pengujian Kaca">
        <div>Hanya dock yang kaca</div>
      </main>
    );
    expect(tokensCss).toMatch(/--dock-blur:\s*blur\(14px\)/);
    for (const name of ['--blur-panel', '--blur-overlay', '--blur-subtle', '--blur-nav']) {
      expect(tokensCss).toMatch(new RegExp(`${name}:\\s*none`));
    }
    // No component should hard-code a blur outside the dock (grep the stylesheets that shipped one).
    const styles = [
      'components/ui/ui.module.css',
      'components/layout/TopBar.module.css',
      'features/banners/Banner.module.css',
      'features/materials/Materials.module.css',
      'features/workspace/Workspace.module.css',
    ];
    for (const rel of styles) {
      const css = fs.readFileSync(path.resolve(__dirname, '../../../', rel), 'utf-8');
      expect(css).not.toMatch(/^\s*backdrop-filter:\s*blur\(/m); // a property, not an @supports condition
    }
  });

  it('01.3 - Dark theme tokens', () => {
    renderWithProviders(
      <main aria-label="Area Pengujian Token Gelap">
        <div data-testid="token-probe-dark">Stuby Dark Theme</div>
      </main>,
      { theme: 'dark' }
    );

    expect(screen.getByRole('main', { name: 'Area Pengujian Token Gelap' })).toBeTruthy();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    const darkSection = tokensCss.split(/data-theme=['"]dark['"]/)[1] || '';
    expect(darkSection).toMatch(/--canvas:\s*#0E1210/);
    expect(darkSection).toMatch(/--card:\s*#171C19/);
    expect(darkSection).toMatch(/--surface-opaque:\s*#171C19/);
    expect(darkSection).toMatch(/--bamboo:\s*#9AD44B/);
    expect(darkSection).toMatch(/--tint-leaf:\s*#22301A/);
  });

  it('01.4 - Contrast-compliant text colours (WCAG AA) in both themes', () => {
    renderWithProviders(
      <main aria-label="Area Pengujian Kontras Teks">
        <p>Teks Utama Stuby</p>
      </main>,
      { theme: 'light' }
    );

    expect(screen.getByRole('main', { name: 'Area Pengujian Kontras Teks' })).toBeTruthy();

    // Bamboo (#8DC63F) is only 1.9:1 on white, so TEXT and links use bamboo-deep.
    expect(tokensCss).toMatch(/--text-primary:\s*#141816/);
    expect(tokensCss).toMatch(/--text-secondary:\s*#3A443D/);
    expect(tokensCss).toMatch(/--text-muted:\s*#55605A/);
    expect(tokensCss).toMatch(/--accent:\s*#2F7A1F/);
    expect(tokensCss).toMatch(/--bamboo-deep:\s*#2F7A1F/);
    expect(tokensCss).toMatch(/--success:\s*#1F6B2A/);
    expect(tokensCss).toMatch(/--warning:\s*#8A5A00/);
    expect(tokensCss).toMatch(/--danger:\s*#B0281F/);

    const darkSection = tokensCss.split(/data-theme=['"]dark['"]/)[1] || '';
    expect(darkSection).toMatch(/--text-primary:\s*#F1F4EC/);
    expect(darkSection).toMatch(/--text-secondary:\s*#BFC8BA/);
    expect(darkSection).toMatch(/--text-muted:\s*#98A494/);
    expect(darkSection).toMatch(/--accent:\s*#9AD44B/);
  });

  it('01.5 - Backward compatibility token aliases', () => {
    renderWithProviders(
      <main aria-label="Area Pengujian Alias Token">
        <div>Alias Kompatibilitas</div>
      </main>
    );

    expect(screen.getByRole('main', { name: 'Area Pengujian Alias Token' })).toBeTruthy();
    expect(tokensCss).toMatch(/--bg:\s*var\(--canvas\)/);
    expect(tokensCss).toMatch(/--line:\s*var\(--border\)/);
    expect(tokensCss).toMatch(/--brand:\s*var\(--accent\)/);
    expect(tokensCss).toMatch(/--shadow:\s*var\(--shadow-md\)/);
  });
});

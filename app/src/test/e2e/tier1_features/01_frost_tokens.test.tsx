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

  it('01.1 - Light Theme Canvas & Surface Tokens', () => {
    renderWithProviders(
      <main aria-label="Area Pengujian Token">
        <div data-testid="token-probe">Frost UI Light Theme</div>
      </main>,
      { theme: 'light' }
    );

    expect(screen.getByRole('main', { name: 'Area Pengujian Token' })).toBeTruthy();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    // Verify token values defined in :root
    expect(tokensCss).toMatch(/--canvas:\s*#F3F6FC/);
    expect(tokensCss).toMatch(/--canvas-tint:\s*#EAF0FC/);
    expect(tokensCss).toMatch(/--surface:\s*rgba\(255,\s*255,\s*255,\s*0?\.78\)/);
    expect(tokensCss).toMatch(/--surface-solid:\s*#FFFFFF/);
    expect(tokensCss).toMatch(/--surface-raised:\s*rgba\(255,\s*255,\s*255,\s*0?\.92\)/);
  });

  it('01.2 - Dark Theme Slate Foundation Tokens', () => {
    renderWithProviders(
      <main aria-label="Area Pengujian Token Gelap">
        <div data-testid="token-probe-dark">Frost UI Dark Theme</div>
      </main>,
      { theme: 'dark' }
    );

    expect(screen.getByRole('main', { name: 'Area Pengujian Token Gelap' })).toBeTruthy();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // Verify dark mode tokens defined in [data-theme='dark']
    const darkSection = tokensCss.split(/data-theme=['"]dark['"]/)[1] || '';
    expect(darkSection).toMatch(/--canvas:\s*#0C1222/);
    expect(darkSection).toMatch(/--canvas-tint:\s*#111B31/);
    expect(darkSection).toMatch(/--surface-solid:\s*#151F34/);
    expect(darkSection).toMatch(/--surface-raised:\s*#1B2942/);
  });

  it('01.3 - Contrast-Compliant Semantic Text Colors', () => {
    renderWithProviders(
      <main aria-label="Area Pengujian Kontras Teks">
        <p>Teks Utama Belajar</p>
      </main>,
      { theme: 'light' }
    );

    expect(screen.getByRole('main', { name: 'Area Pengujian Kontras Teks' })).toBeTruthy();

    // Verify WCAG AA compliant text colors in light theme
    expect(tokensCss).toMatch(/--text-primary:\s*#17213B/);
    expect(tokensCss).toMatch(/--text-secondary:\s*#64718C/);
    expect(tokensCss).toMatch(/--text-muted:\s*#8C98AE/);

    // Verify high-contrast text tokens in dark theme section
    const darkSection = tokensCss.split(/data-theme=['"]dark['"]/)[1] || '';
    expect(darkSection).toMatch(/--text-primary:\s*#EDF3FF/);
    expect(darkSection).toMatch(/--text-secondary:\s*#A7B5CC/);
  });

  it('01.4 - Brand Accent and Status Color Variables', () => {
    renderWithProviders(
      <main aria-label="Area Pengujian Warna Aksen">
        <span role="status">Status Aktif</span>
      </main>
    );

    expect(screen.getByRole('main', { name: 'Area Pengujian Warna Aksen' })).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();

    // Brand accent colors
    expect(tokensCss).toMatch(/--accent:\s*#6558E8/);
    expect(tokensCss).toMatch(/--ice:\s*#78BFEF/);

    // Status colors
    expect(tokensCss).toMatch(/--success:\s*#218B68/);
    expect(tokensCss).toMatch(/--warning:\s*#B7792E/);
    expect(tokensCss).toMatch(/--danger:\s*#C94F62/);
  });

  it('01.5 - Backward Compatibility Token Aliases', () => {
    renderWithProviders(
      <main aria-label="Area Pengujian Alias Token">
        <div>Alias Kompatibilitas</div>
      </main>
    );

    expect(screen.getByRole('main', { name: 'Area Pengujian Alias Token' })).toBeTruthy();

    // Verify legacy alias mappings in tokens.css
    expect(tokensCss).toMatch(/--bg:\s*var\(--canvas\)/);
    expect(tokensCss).toMatch(/--ink:\s*var\(--text-primary\)/);
    expect(tokensCss).toMatch(/--line:\s*var\(--border\)/);
    expect(tokensCss).toMatch(/--brand:\s*var\(--accent\)/);
    expect(tokensCss).toMatch(/--shadow:\s*var\(--shadow-md\)/);
  });
});

import { cleanup, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockRpc, renderWithProviders, unstubTauri } from '../harness';

describe('Feature 3: Typography & Font Stacks', () => {
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

  it('03.1 - Bricolage Primary Sans Font Stack', () => {
    renderWithProviders(
      <main aria-label="Area Pengujian Tipografi Sans">
        <h1>Judul Utama Menggunakan Bricolage</h1>
      </main>
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Judul Utama Menggunakan Bricolage' })).toBeTruthy();
    expect(tokensCss).toMatch(/--font-sans:\s*['"]?Bricolage['"]?,\s*system-ui/);
  });

  it('03.2 - Literata Editorial Serif Font Stack', () => {
    renderWithProviders(
      <article aria-label="Artikel Catatan Editorial">
        <p>Paragraf membaca dengan tipografi editorial Literata.</p>
      </article>
    );

    expect(screen.getByRole('article', { name: 'Artikel Catatan Editorial' })).toBeTruthy();
    expect(tokensCss).toMatch(/--font-serif:\s*['"]?Literata['"]?,\s*Georgia/);
  });

  it('03.3 - Monospace Code & Formula Font Stack', () => {
    renderWithProviders(
      <section aria-label="Blok Kode">
        <pre>
          <code>const x = 42;</code>
        </pre>
      </section>
    );

    expect(screen.getByRole('region', { name: 'Blok Kode' })).toBeTruthy();
    expect(tokensCss).toMatch(/--font-mono:\s*ui-monospace,\s*['"]?SFMono-Regular['"]?/);
  });

  it('03.4 - Modular Font Scale Hierarchy', () => {
    renderWithProviders(
      <main aria-label="Hierarki Skala Font">
        <p>Skala Ukuran Teks Modular</p>
      </main>
    );

    expect(screen.getByRole('main', { name: 'Hierarki Skala Font' })).toBeTruthy();

    expect(tokensCss).toMatch(/--text-xs:\s*0?\.75rem/);
    expect(tokensCss).toMatch(/--text-sm:\s*0?\.8125rem/);
    expect(tokensCss).toMatch(/--text-base:\s*0?\.9375rem/);
    expect(tokensCss).toMatch(/--text-lg:\s*1?\.125rem/);
    expect(tokensCss).toMatch(/--text-4xl:\s*2?\.25rem/);
  });

  it('03.5 - Editorial Line Height & Tracking Tokens', () => {
    renderWithProviders(
      <main aria-label="Spasi Baris dan Tracking">
        <p>Keterbacaan Paragraf Panjang</p>
      </main>
    );

    expect(screen.getByRole('main', { name: 'Spasi Baris dan Tracking' })).toBeTruthy();

    expect(tokensCss).toMatch(/--leading-none:\s*1;/);
    expect(tokensCss).toMatch(/--leading-tight:\s*1\.2;/);
    expect(tokensCss).toMatch(/--leading-normal:\s*1\.55;/);
    expect(tokensCss).toMatch(/--tracking-tight:\s*-0\.03em;/);
  });
});

import { cleanup, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../../components/layout/AppShell';
import { Icon } from '../../../components/ui/Icon';
import { mockRpc, renderWithProviders, unstubTauri } from '../harness';

describe('Feature 28: Self-Contained Asset Security & CSP', () => {
  let globalCss: string;

  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    const cssPath = path.resolve(__dirname, '../../../../src/styles/global.css');
    globalCss = fs.readFileSync(cssPath, 'utf-8');
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('28.1 - Local Bundled Web Fonts Verification', () => {
    // Verify @font-face rules reference local fonts only
    expect(globalCss).toMatch(/url\(['"]?\/fonts\/bricolage\.woff2['"]?\)/);
    expect(globalCss).toMatch(/url\(['"]?\/fonts\/literata\.woff2['"]?\)/);
    expect(globalCss).toMatch(/url\(['"]?\/fonts\/literata-italic\.woff2['"]?\)/);

    // Verify ZERO remote font CDNs (Google Fonts, unpkg, etc.)
    expect(globalCss).not.toMatch(/https?:\/\/fonts\.googleapis\.com/);
    expect(globalCss).not.toMatch(/https?:\/\/fonts\.gstatic\.com/);
    expect(globalCss).not.toMatch(/https?:\/\/cdnjs\.cloudflare\.com/);
  });

  it('28.2 - Pure Inline SVG Iconography', () => {
    const { container } = renderWithProviders(
      <main aria-label="Ikon Uji">
        <Icon name="book" size={24} />
        <Icon name="settings" size={24} />
      </main>
    );

    const main = screen.getByRole('main', { name: 'Ikon Uji' });
    expect(main).toBeTruthy();

    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(2);

    // Every SVG must be purely inline without external src attributes
    for (const svg of svgs) {
      expect(svg.getAttribute('src')).toBeNull();
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('28.3 - Zero Third-Party Script/Style Injections', () => {
    renderWithProviders(<AppShell />);

    // Audit document head for external script/link tags
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const script of scripts) {
      const src = script.getAttribute('src');
      if (src) {
        expect(src).not.toMatch(/^https?:\/\//);
      }
    }

    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href) {
        expect(href).not.toMatch(/^https?:\/\//);
      }
    }
  });

  it('28.4 - Strict Content Security Policy Compliance', () => {
    // Simulate mounting inside an environment governed by Tauri strict CSP
    const metaCsp = document.createElement('meta');
    metaCsp.httpEquiv = 'Content-Security-Policy';
    metaCsp.content = "default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:;";
    document.head.appendChild(metaCsp);

    expect(() => {
      renderWithProviders(<AppShell />);
    }).not.toThrow();

    expect(screen.getByLabelText('Navigasi Utama')).toBeTruthy();
    metaCsp.remove();
  });

  it('28.5 - Safe Math & Code Presentation Without Execution', () => {
    const alertMock = vi.fn();
    (window as any).alert = alertMock;

    const untrustedSnippet = '<script>alert("hacked")</script>';

    renderWithProviders(
      <article aria-label="Artikel Kode Aman">
        <pre>
          <code>{untrustedSnippet}</code>
        </pre>
      </article>
    );

    const article = screen.getByRole('article', { name: 'Artikel Kode Aman' });
    expect(article).toBeTruthy();
    expect(article.textContent).toContain('<script>alert("hacked")</script>');
    expect(alertMock).not.toHaveBeenCalled();
  });
});

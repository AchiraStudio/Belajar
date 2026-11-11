import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui/Toast';
import { ThemeProvider } from '../../services/theme/ThemeContext';
import { AppShell } from './AppShell';
import { MobileNav } from './MobileNav';
import { PageContainer } from './PageContainer';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { TopBar } from './TopBar';

function renderWithShell(ui: React.ReactElement, initialPath: string = '/') {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
      </ToastProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  delete (window as any).__TAURI__;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as any).__TAURI__;
});

describe('Shell & Layout Components', () => {
  describe('TitleBar', () => {
    it('renders null in a standard web browser without Tauri', () => {
      const { container } = render(<TitleBar />);
      expect(container.firstChild).toBeNull();
    });

    it('renders Tauri titlebar and handles window controls when __TAURI__ is present', () => {
      const minimize = vi.fn().mockResolvedValue(undefined);
      const toggleMaximize = vi.fn().mockResolvedValue(undefined);
      const close = vi.fn().mockResolvedValue(undefined);
      const isMaximized = vi.fn().mockResolvedValue(false);
      const startDragging = vi.fn().mockResolvedValue(undefined);

      (window as any).__TAURI__ = {
        window: {
          getCurrentWindow: () => ({
            minimize,
            toggleMaximize,
            close,
            isMaximized,
            startDragging,
            listen: vi.fn(),
          }),
        },
      };

      render(<TitleBar />);
      expect(screen.getByRole('banner', { name: 'Bilah judul aplikasi' })).toBeTruthy();
      expect(screen.getByText('Belajar')).toBeTruthy();

      const minBtn = screen.getByRole('button', { name: 'Perkecil' });
      const maxBtn = screen.getByRole('button', { name: 'Perbesar' });
      const closeBtn = screen.getByRole('button', { name: 'Tutup' });

      fireEvent.click(minBtn);
      expect(minimize).toHaveBeenCalledTimes(1);

      fireEvent.click(maxBtn);
      expect(toggleMaximize).toHaveBeenCalledTimes(1);

      fireEvent.click(closeBtn);
      expect(close).toHaveBeenCalledTimes(1);

      // Verify drag region starts dragging on mousedown
      const banner = screen.getByRole('banner', { name: 'Bilah judul aplikasi' });
      fireEvent.mouseDown(banner, { button: 0 });
      expect(startDragging).toHaveBeenCalledTimes(1);
    });
  });

  describe('Sidebar', () => {
    it('renders Indonesian grouped navigation items and active state', () => {
      renderWithShell(<Sidebar />, '/materi');

      expect(screen.getByText('Belajar')).toBeTruthy();
      expect(screen.getByText('Jelajahi')).toBeTruthy();
      // Destinations without a working service are marked, never hidden or faked.
      expect(screen.getByText('Segera')).toBeTruthy();

      const berandaLink = screen.getByRole('link', { name: /beranda/i });
      const materiLink = screen.getByRole('link', { name: /materi/i });

      expect(berandaLink.getAttribute('aria-current')).toBeNull();
      expect(materiLink.getAttribute('aria-current')).toBe('page');
    });

    it('toggles collapse mode and stores preference in localStorage', () => {
      renderWithShell(<Sidebar />, '/');

      const toggleBtn = screen.getByRole('button', { name: /ciutkan bilah navigasi/i });
      fireEvent.click(toggleBtn);

      expect(window.localStorage.getItem('belajar-sidebar-collapsed')).toBe('true');
      expect(screen.getByRole('button', { name: /perluas bilah navigasi/i })).toBeTruthy();
    });
  });

  describe('TopBar', () => {
    it('displays page title derived from current route', () => {
      renderWithShell(<TopBar />, '/materi');
      expect(screen.getByText('Perpustakaan Materi')).toBeTruthy();
      expect(screen.getByRole('button', { name: /cari materi atau topik/i })).toBeTruthy();
    });

    it('cycles theme when theme button is clicked', () => {
      renderWithShell(<TopBar />, '/');
      const themeBtn = screen.getByRole('button', { name: /tema:/i });

      fireEvent.click(themeBtn);
      expect(document.documentElement.getAttribute('data-theme')).toBeTruthy();
    });
  });

  describe('MobileNav', () => {
    it('renders bottom navigation items', () => {
      renderWithShell(<MobileNav />, '/');
      const nav = screen.getByRole('navigation', { name: 'Navigasi Bawah Seluler' });
      expect(nav).toBeTruthy();

      expect(screen.getByRole('link', { name: /beranda/i })).toBeTruthy();
      expect(screen.getByRole('link', { name: /kuis/i })).toBeTruthy();
      expect(screen.getByRole('link', { name: /game/i })).toBeTruthy();
    });
  });

  describe('PageContainer', () => {
    it('renders children with designated width options', () => {
      const { container } = render(
        <PageContainer width="wide">
          <div>Konten Utama</div>
        </PageContainer>,
      );
      expect(screen.getByText('Konten Utama')).toBeTruthy();
      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('AppShell', () => {
    it('renders responsive shell container with skip link, sidebar, topbar, and mobile nav', () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(Response.json({ status: 'ok', service: 'belajar', version: '0.1.0' }))),
      );

      renderWithShell(<AppShell />, '/');

      expect(screen.getByRole('link', { name: 'Langsung ke isi halaman' })).toBeTruthy();
      expect(screen.getByRole('complementary', { name: 'Navigasi Utama' })).toBeTruthy();
      expect(screen.getByRole('main').getAttribute('tabindex')).toBe('-1');
      expect(screen.getByRole('navigation', { name: 'Navigasi Bawah Seluler' })).toBeTruthy();
    });
  });
});

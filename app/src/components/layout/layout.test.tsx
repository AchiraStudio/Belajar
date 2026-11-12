import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui/Toast';
import { ThemeProvider } from '../../services/theme/ThemeContext';
import { AppShell } from './AppShell';
import { PageContainer } from './PageContainer';
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
  describe('TopBar as the window title bar', () => {
    const tauriWindow = () => {
      const win = {
        minimize: vi.fn().mockResolvedValue(undefined),
        toggleMaximize: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        isMaximized: vi.fn().mockResolvedValue(false),
        startDragging: vi.fn().mockResolvedValue(undefined),
        listen: vi.fn(),
      };
      (window as any).__TAURI__ = { window: { getCurrentWindow: () => win } };
      return win;
    };

    it('has no window buttons in a standard web browser', () => {
      renderWithShell(<TopBar />);
      expect(screen.queryByRole('button', { name: 'Perkecil' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Tutup' })).toBeNull();
    });

    it('carries the window controls and drags from empty space when running in Tauri', () => {
      const win = tauriWindow();
      renderWithShell(<TopBar />);

      const bar = screen.getByRole('banner', { name: 'Bilah judul aplikasi' });
      fireEvent.click(screen.getByRole('button', { name: 'Perkecil' }));
      expect(win.minimize).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: 'Perbesar' }));
      expect(win.toggleMaximize).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: 'Tutup' }));
      expect(win.close).toHaveBeenCalledTimes(1);

      fireEvent.mouseDown(bar, { button: 0 });
      expect(win.startDragging).toHaveBeenCalledTimes(1);
      // A double click on the bar maximises, like any title bar.
      fireEvent.mouseDown(bar, { button: 0, detail: 2 });
      expect(win.toggleMaximize).toHaveBeenCalledTimes(2);
    });

    it('never drags from a button, and ignores right and middle clicks', () => {
      const win = tauriWindow();
      renderWithShell(<TopBar />);
      fireEvent.mouseDown(screen.getByRole('button', { name: /cari materi atau topik/i }), { button: 0 });
      fireEvent.mouseDown(screen.getByRole('banner', { name: 'Bilah judul aplikasi' }), { button: 2 });
      fireEvent.mouseDown(screen.getByRole('banner', { name: 'Bilah judul aplikasi' }), { button: 1 });
      expect(win.startDragging).not.toHaveBeenCalled();
    });

    it('keeps a slim bar with the window buttons when the desktop window is narrow', () => {
      tauriWindow();
      renderWithShell(<TopBar compact />);
      expect(screen.getByRole('button', { name: 'Tutup' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /cari materi atau topik/i })).toBeNull();
    });

    it('shows no window chrome on Android even though Tauri is present', () => {
      tauriWindow();
      const ua = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile');
      renderWithShell(<TopBar />);
      expect(screen.queryByRole('button', { name: 'Tutup' })).toBeNull();
      ua.mockRestore();
    });

    it('does not show a server-connection pill', () => {
      renderWithShell(<TopBar />);
      expect(screen.queryByRole('status')).toBeNull();
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
    it('renders the shell: skip link, top bar, page area and the floating dock', () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(Response.json({ status: 'ok', service: 'stuby', version: '0.1.0' }))),
      );

      renderWithShell(<AppShell />, '/');

      expect(screen.getByRole('link', { name: 'Langsung ke isi halaman' })).toBeTruthy();
      expect(screen.getByRole('main').getAttribute('tabindex')).toBe('-1');
      expect(screen.getByRole('navigation', { name: 'Navigasi Utama' })).toBeTruthy();
      expect(screen.getByRole('banner')).toBeTruthy();
    });
  });
});

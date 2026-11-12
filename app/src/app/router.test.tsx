import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { ThemeProvider } from '../services/theme/ThemeContext';
import { AppRoutes } from './router';
import { dropCache } from '../services/api/rpc';
import {
  mockRpc,
  defaultDashboardFixture,
  defaultDocumentsFixture,
  defaultSubjectsFixture,
  defaultDocumentDetailFixture,
} from '../test/e2e/harness';

function renderAt(path: string) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe('AppRoutes', () => {
  beforeEach(() => {
    cleanup();
    dropCache();
    mockRpc.install();
    mockRpc.reset();
  });

  afterEach(() => {
    cleanup();
    dropCache();
    mockRpc.uninstall();
    vi.restoreAllMocks();
  });

  it('shows the dashboard on the index route', async () => {
    mockRpc.setResponse('dashboard', defaultDashboardFixture);
    renderAt('/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /^Selamat (pagi|siang|sore|malam)\.$/ })).toBeTruthy();
    });
  });

  it('renders materials library on /materi route', async () => {
    mockRpc.setResponse('list_documents', defaultDocumentsFixture);
    mockRpc.setResponse('list_subjects', defaultSubjectsFixture);

    renderAt('/materi');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Materi Belajar' })).toBeTruthy();
    });
  });

  it('renders document workspace on /materi/:id route', async () => {
    mockRpc.setResponse('get_document', defaultDocumentDetailFixture);

    renderAt('/materi/101');

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Pengantar Jaringan Komputer & OSI Layer',
        })
      ).toBeTruthy();
    }, { timeout: 5000 }); // the workspace is a lazy chunk; a cold module cache can take over 1s
  });

  it('shows the legacy not-found copy for unknown routes', () => {
    renderAt('/tidak-ada');
    expect(screen.getByRole('heading', { name: 'Halaman tidak ditemukan' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Kembali ke beranda' }).getAttribute('href')).toBe('/');
  });

  it('still renders the shell instead of crashing when the server is unreachable', async () => {
    mockRpc.setHealthDown('Server tidak terjangkau');
    renderAt('/');

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Langsung ke isi halaman' })).toBeTruthy();
    });
    expect(screen.queryByTitle(/Server tidak terjangkau/i)).toBeNull();
  });

  it('has a skip link and a focusable main landmark', () => {
    mockRpc.setDelay('health', 10000);
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Langsung ke isi halaman' }).getAttribute('href')).toBe('#view');
    expect(screen.getByRole('main').getAttribute('tabindex')).toBe('-1');
  });
});

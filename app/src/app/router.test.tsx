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

  it('shows the dashboard on index route with connected server badge', async () => {
    mockRpc.setResponse('dashboard', defaultDashboardFixture);
    renderAt('/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Beranda Belajar' })).toBeTruthy();
      expect(screen.getByTitle(/Server terhubung/i)).toBeTruthy();
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
    });
  });

  it('shows the legacy not-found copy for unknown routes', () => {
    renderAt('/tidak-ada');
    expect(screen.getByRole('heading', { name: 'Halaman tidak ditemukan' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Kembali ke beranda' }).getAttribute('href')).toBe('/');
  });

  it('reports an unreachable server instead of crashing', async () => {
    mockRpc.setHealthDown('Server tidak terjangkau');
    renderAt('/');

    await waitFor(() => {
      expect(screen.getByTitle(/Server tidak terjangkau/i)).toBeTruthy();
    });
  });

  it('has a skip link and a focusable main landmark', () => {
    mockRpc.setDelay('health', 10000);
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Langsung ke isi halaman' }).getAttribute('href')).toBe('#view');
    expect(screen.getByRole('main').getAttribute('tabindex')).toBe('-1');
  });
});

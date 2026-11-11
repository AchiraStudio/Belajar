import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { DashboardView } from './DashboardView';
import { dropCache } from '../../services/api/rpc';
import {
  renderWithProviders,
  mockRpc,
  defaultDashboardFixture,
  emptyDashboardFixture,
} from '../../test/e2e/harness';

describe('DashboardView Component', () => {
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

  it('renders loading skeleton while fetching dashboard data', () => {
    mockRpc.setDelay('dashboard', 500);
    renderWithProviders(<DashboardView />);

    expect(screen.getByLabelText('Memuat beranda')).toBeTruthy();
  });

  it('renders error state and retries on failure', async () => {
    mockRpc.setError('dashboard', {
      status: 500,
      code: 'server_error',
      message: 'Koneksi gagal ke server.',
    });

    renderWithProviders(<DashboardView />);

    await waitFor(() => {
      expect(screen.getByText('Gagal Memuat Beranda')).toBeTruthy();
      expect(screen.getByText('Koneksi gagal ke server.')).toBeTruthy();
    });

    // Clear error and click retry
    dropCache();
    mockRpc.clearError('dashboard');
    mockRpc.setResponse('dashboard', defaultDashboardFixture);

    const retryBtn = screen.getByRole('button', { name: /coba lagi/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Beranda Belajar' })).toBeTruthy();
    });
  });

  it('renders honest empty state when no documents exist', async () => {
    mockRpc.setResponse('dashboard', emptyDashboardFixture);

    renderWithProviders(<DashboardView />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Beranda Belajar' })).toBeTruthy();
      expect(screen.getByText('Belum ada materi belajar')).toBeTruthy();
    });

    const uploadBtn = screen.getByRole('button', { name: 'Unggah Materi Pertama' });
    expect(uploadBtn).toBeTruthy();
  });

  it('renders complete Bento grid with real dashboard data', async () => {
    mockRpc.setResponse('dashboard', defaultDashboardFixture);

    renderWithProviders(<DashboardView />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Beranda Belajar' })).toBeTruthy();
      // Streak count
      expect(screen.getByText('7 hari')).toBeTruthy();
      // Metric tiles
      expect(screen.getByText('85%')).toBeTruthy(); // Math.round(84.5)
      expect(screen.getByText('8')).toBeTruthy();   // 8 quizzes completed
      expect(screen.getByText('3')).toBeTruthy();   // 3 docs in fixture
      // Recent materials
      expect(screen.getByText('Pengantar Jaringan Komputer & OSI Layer')).toBeTruthy();
      // Weak topics
      expect(screen.getByText('Transport Layer Protocols')).toBeTruthy();
      // Milestones
      expect(screen.getByText('7 Hari')).toBeTruthy();
      expect(screen.getByText('14 Hari')).toBeTruthy();
    });
  });

  it('renders continue button for last recent document', async () => {
    mockRpc.setResponse('dashboard', defaultDashboardFixture);

    renderWithProviders(<DashboardView />);

    await waitFor(() => {
      expect(screen.getByText('Pengantar Jaringan Komputer & OSI Layer')).toBeTruthy();
    });

    const continueBtn = screen.getByRole('button', {
      name: /Lanjutkan: Pengantar Jaringan Komputer/i,
    });
    expect(continueBtn).toBeTruthy();
  });

  it('renders weak questions action button when weak count is greater than zero', async () => {
    mockRpc.setResponse('dashboard', defaultDashboardFixture);

    renderWithProviders(<DashboardView />);

    await waitFor(() => {
      expect(screen.getByText(/Ulangi 5 soal lemah/i)).toBeTruthy();
    });

    const weakBtn = screen.getByRole('button', { name: /Ulangi 5 soal lemah/i });
    expect(weakBtn).toBeTruthy();
  });
});

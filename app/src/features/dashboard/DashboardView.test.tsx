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

/** The h1 is the time-of-day greeting ("Selamat sore."), so tests match the pattern, not a fixed word. */
const GREETING = /^Selamat (pagi|siang|sore|malam)\.$/;

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
      expect(screen.getByRole('heading', { level: 1, name: GREETING })).toBeTruthy();
    });
  });

  it('renders honest empty state when no documents exist', async () => {
    mockRpc.setResponse('dashboard', emptyDashboardFixture);

    renderWithProviders(<DashboardView />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: GREETING })).toBeTruthy();
      expect(screen.getByText('Belum ada materi belajar')).toBeTruthy();
    });

    const uploadBtn = screen.getByRole('button', { name: 'Unggah Materi Pertama' });
    expect(uploadBtn).toBeTruthy();
  });

  it('renders complete Bento grid with real dashboard data', async () => {
    mockRpc.setResponse('dashboard', defaultDashboardFixture);

    renderWithProviders(<DashboardView />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: GREETING })).toBeTruthy();
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

  it('never shows lifetime study time as "today" when the server sent no today block', async () => {
    // The fixture has 290 minutes of lifetime study and no streak.today. The old view showed that
    // as today's progress; the honest answer is a dash.
    mockRpc.setResponse('dashboard', defaultDashboardFixture);
    renderWithProviders(<DashboardView />);

    const tile = await screen.findByRole('group', { name: 'Belajar hari ini' });
    expect(tile.textContent).toContain('–');
    expect(tile.textContent).not.toMatch(/jam/);
    expect(tile.textContent).toContain('Target harian belum tersedia');
  });

  it('shows real today progress and the goal from streak.today', async () => {
    mockRpc.setResponse('dashboard', {
      ...defaultDashboardFixture,
      streak: {
        current: 7,
        today: { day: '2026-11-10', seconds: 1500, goal_seconds: 1800, quizzes: 1, done: false },
      },
    });
    renderWithProviders(<DashboardView />);

    const tile = await screen.findByRole('group', { name: 'Belajar hari ini' });
    expect(tile.textContent).toContain('25 mnt');
    expect(tile.textContent).toContain('Target harian 30 mnt');
    // The donut states the same fact in words, not just as an arc.
    expect(screen.getByRole('img', { name: 'Belajar 25 mnt dari target 30 mnt hari ini' })).toBeTruthy();
  });

  it('renders the quiz table with links to the result page', async () => {
    mockRpc.setResponse('dashboard', defaultDashboardFixture);
    renderWithProviders(<DashboardView />);

    const link = await screen.findByRole('link', { name: 'Kuis Diagnostik Jaringan' });
    expect(link.getAttribute('href')).toMatch(/\/hasil\/501$/);
    expect(screen.getByRole('columnheader', { name: 'Persen' })).toBeTruthy();
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

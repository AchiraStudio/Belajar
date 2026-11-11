import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { mockRpc, renderWithProviders } from '../../test/e2e/harness';
import { dropCache } from '../../services/api/rpc';
import { SettingsView } from '../settings';
import { ProgressView, formatStudy } from './ProgressView';

const emptyProgress = {
  overall: { attempts: 0, answers: 0, accuracy: null, study_seconds: 0, documents: 0, quizzes: 0, questions: 0 },
  streak: { current: 0, longest: 0, freezes: 0, at_risk: false, today: { day: '2026-11-11', seconds: 0, quizzes: 0, goal_seconds: 1800, done: false } },
  weekly: { start: '2026-11-09', seconds: 0, quizzes: 0, goal_min: 150 },
  trend: [],
  topics: [],
  documents: [],
  study_days: [],
  weak_count: 0,
  settings: {},
};

describe('ProgressView', () => {
  beforeEach(() => {
    cleanup();
    dropCache();
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setError('play_hub', { status: 400, code: 'rpc_error', message: 'Layanan AI belum dikonfigurasi di server ini.' });
  });
  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
  });

  it('distinguishes "no data" from zero: empty state and dashes, never a fake 0%', async () => {
    mockRpc.setResponse('progress', emptyProgress);
    renderWithProviders(<ProgressView />, { route: '/progres' });

    expect(await screen.findByRole('heading', { name: 'Belum ada aktivitas belajar' })).toBeTruthy();
    // Accuracy and study time are "no data" (dash with an accessible label), not 0.
    
    // Study time, accuracy and quizzes are "no data"; only the streak is a true 0 (zero days).
    expect(screen.getAllByLabelText('Belum ada data')).toHaveLength(3);
    expect(screen.getByText('Belum ada skor. Selesaikan satu kuis dan grafiknya muncul di sini.')).toBeTruthy();
  });

  it('renders measured values with accessible chart alternatives', async () => {
    mockRpc.setResponse('progress', {
      ...emptyProgress,
      overall: { attempts: 3, answers: 30, accuracy: 73.4, study_seconds: 5400, documents: 2, quizzes: 2, questions: 40 },
      streak: { ...emptyProgress.streak, current: 4, longest: 9 },
      trend: [
        { id: 1, ts: 1_700_000_000, score: 6, total: 10, mode: 'practice', title: 'A' },
        { id: 2, ts: 1_700_100_000, score: 8, total: 10, mode: 'practice', title: 'B' },
      ],
      topics: [{ topic: 'OSI', n: 10, ok: 4, acc: 40, level: 'weak' }],
      study_days: [{ day: '2026-11-10', seconds: 1200, quizzes: 1 }],
      weak_count: 6,
    });
    renderWithProviders(<ProgressView />, { route: '/progres' });

    expect(await screen.findByText('73')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Grafik skor 2 kuis terakhir/ })).toBeTruthy();
    expect(screen.getAllByText('Lihat sebagai daftar').length).toBe(2);
    expect(screen.getByText('4/10 · 40%')).toBeTruthy();
    expect(screen.getByText('6 soal lemah')).toBeTruthy();
  });

  it('formats study time in minutes under an hour and hours above', () => {
    expect(formatStudy(600)).toEqual({ value: '10', unit: 'menit' });
    expect(formatStudy(5400)).toEqual({ value: '1,5', unit: 'jam' });
  });
});

describe('SettingsView', () => {
  beforeEach(() => {
    cleanup();
    dropCache();
    mockRpc.install();
    mockRpc.reset();
    window.localStorage.clear();
    mockRpc.setResponse('get_settings', {
      settings: { daily_goal_min: '30', weekly_goal_min: '150', notes_style: 'ringkas', language: 'auto' },
      timezone: 'Asia/Jakarta',
    });
    mockRpc.setResponse('save_settings', { settings: {} });
  });
  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    vi.restoreAllMocks();
  });

  it('validates goals with the server limits and saves valid values', async () => {
    renderWithProviders(<SettingsView />, { route: '/pengaturan' });
    const daily = (await screen.findByLabelText('Target harian (menit)')) as HTMLInputElement;
    expect(daily.value).toBe('30');

    fireEvent.change(daily, { target: { value: '9999' } });
    expect(screen.getByText('Isi antara 1 dan 600 menit.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Simpan pengaturan' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(daily, { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan pengaturan' }));
    await waitFor(() => expect(mockRpc.getCalls('save_settings')).toHaveLength(1));
    expect(mockRpc.getLastCall('save_settings')?.payload).toMatchObject({
      settings: { daily_goal_min: '45', weekly_goal_min: '150', notes_style: 'ringkas', language: 'auto' },
    });
  });

  it('switches theme immediately and explains what the connection status means', async () => {
    renderWithProviders(<SettingsView />, { route: '/pengaturan' });
    await screen.findByLabelText('Target harian (menit)');
    fireEvent.click(screen.getByRole('radio', { name: 'Gelap' }));
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'));
    expect(screen.getByText(/Ini bukan status layanan AI/)).toBeTruthy();
    expect(await screen.findByText('Server terhubung')).toBeTruthy();
  });
});

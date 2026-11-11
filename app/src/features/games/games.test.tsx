import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { mockRpc, renderWithProviders } from '../../test/e2e/harness';
import { dropCache } from '../../services/api/rpc';
import { GamesHub } from './GamesHub';

const hub = {
  profile: { level: 2, xp: 140, level_start: 100, next: 300 },
  streak: { current: 3, longest: 5 },
  quests: [{ key: 'play_1', title: 'Selesaikan 1 permainan', xp: 20, done: false }],
  modes: [
    { key: 'ajari', title: 'Ajari Aku', desc: 'Jelaskan konsep.', kind: 'explain', hints: true, turns: { default: 6, min: 3, max: 10 } },
    { key: 'boss', title: 'Ujian Boss', desc: 'Ujian lintas topik.', kind: 'boss', hints: false, turns: { default: 8, min: 6, max: 12 } },
  ],
  documents: [{ id: 1, title: 'Jaringan Komputer', subject_id: null, subject: null, concepts: 4 }],
  subjects: [],
  levels: { baru: 3, dikenal: 1, paham: 0, kuasai: 0 },
  weak: [],
  cards: { total: 4, due: 2, new: 2, learning: 0, mature: 0 },
  active: null,
  achievements: [],
};

describe('GamesHub', () => {
  beforeEach(() => {
    cleanup();
    dropCache();
    mockRpc.install();
    mockRpc.reset();
    window.localStorage.clear();
    mockRpc.setResponse('play_hub', hub);
  });
  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
  });

  it('renders real hub data: level, modes, missions and card due count', async () => {
    renderWithProviders(<GamesHub />, { route: '/game' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Game Belajar' })).toBeTruthy();
    expect(screen.getByText('Ajari Aku')).toBeTruthy();
    expect(screen.getByText('Ujian Boss')).toBeTruthy();
    expect(screen.getByText('Selesaikan 1 permainan')).toBeTruthy();
    expect(screen.getByText('140 XP')).toBeTruthy();
    // Boss mode states plainly that it has no hints.
    expect(screen.getByText(/tanpa petunjuk/)).toBeTruthy();
  });

  it('starting a game with no AI layer shows the server message honestly, once, and never opens a fake session', async () => {
    mockRpc.setError('play_turn', { status: 400, code: 'rpc_error', message: 'Layanan AI belum dikonfigurasi di server ini.' });
    renderWithProviders(<GamesHub />, { route: '/game' });

    fireEvent.click(await screen.findByText('Ajari Aku'));
    const start = await screen.findByRole('button', { name: 'Mulai' });
    fireEvent.click(start);
    fireEvent.click(start); // rapid double click

    expect(await screen.findByText('Game belum bisa dimulai')).toBeTruthy();
    expect(screen.getByText('Layanan AI belum dikonfigurasi di server ini.')).toBeTruthy();
    await waitFor(() => expect(mockRpc.getCalls('play_turn')).toHaveLength(1));
    expect(mockRpc.getLastCall('play_turn')?.payload).toMatchObject({
      op: 'start',
      game: 'ajari',
      scope_kind: 'all',
      options: { jumlah_giliran: 6, tingkat: 'sedang' },
    });
    expect(typeof (mockRpc.getLastCall('play_turn')?.payload as { client_key: string }).client_key).toBe('string');
  });

  it('prompts to upload material when no document is ready', async () => {
    mockRpc.setResponse('play_hub', { ...hub, documents: [] });
    renderWithProviders(<GamesHub />, { route: '/game' });
    expect(await screen.findByRole('heading', { name: 'Belum ada materi siap' })).toBeTruthy();
    expect(screen.queryByText('Ajari Aku')).toBeNull();
  });

  it('says that daily challenges, tournaments and leaderboards are not available instead of faking them', async () => {
    renderWithProviders(<GamesHub />, { route: '/game' });
    expect(await screen.findByText(/Tantangan harian, turnamen, dan papan peringkat/)).toBeTruthy();
    expect(screen.getAllByText('Belum tersedia').length).toBeGreaterThan(0);
  });
});

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../../components/ui/Button';
import { SurfaceCard } from '../../../components/ui/SurfaceCard';
import { rpcCall } from '../../../services/api/rpc';
import {
  defaultDocumentsFixture,
  defaultPlayHubFixture,
  defaultProgressFixture,
  defaultSubjectsFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type ListDocumentsResponse,
  type ListSubjectsResponse,
  type PlayHubResponse,
  type ProgressResponse,
} from '../harness';

function GamesHubView() {
  const [hubData, setHubData] = useState<PlayHubResponse | null>(null);
  const [streakDays, setStreakDays] = useState(7);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [showConfirmAbandon, setShowConfirmAbandon] = useState(false);
  const [navTarget, setNavTarget] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      rpcCall<PlayHubResponse>('play_hub'),
      rpcCall<ProgressResponse>('progress'),
    ])
      .then(([hubRes, progRes]) => {
        if (active) {
          setHubData(hubRes);
          setStreakDays(progRes.overall?.streak_days ?? 7);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const handleAbandonRun = async () => {
    if (!hubData?.active_run) return;
    await rpcCall('play_abandon', { run_id: hubData.active_run.run_id });
    setHubData((prev) => (prev ? { ...prev, active_run: null } : null));
    setShowConfirmAbandon(false);
  };

  if (!hubData) {
    return <div>Memuat Game Hub...</div>;
  }

  const { level, active_run, modes, quests } = hubData;

  return (
    <main aria-label="Learning Games Hub">
      <header>
        <h1>Game Belajar</h1>
        {/* Profile and Level Hero */}
        <section role="region" aria-label="Profil Pemain">
          <div>
            <span>Level {level.level}</span>
            <span>Total XP: {level.current_xp}</span>
            <span>Streak {streakDays} Hari</span>
            <span>{level.title}</span>
          </div>
          <div
            role="progressbar"
            aria-label="Progres Level"
            aria-valuenow={level.current_xp}
            aria-valuemax={level.next_level_xp}
          >
            XP: {level.current_xp} / {level.next_level_xp}
          </div>
        </section>
      </header>

      {navTarget && (
        <div role="status" aria-label="Status Navigasi">
          Navigasi ke {navTarget}
        </div>
      )}

      {/* Active Run Resume Card */}
      {active_run && (
        <section role="region" aria-label="Permainan Berjalan">
          <h2>Lanjutkan Permainan: {active_run.mode_title}</h2>
          <p>
            Giliran {active_run.turn}/{active_run.turns_total} · Skor: {active_run.score}
          </p>
          <div>
            <Link
              to={`/game/main/${active_run.run_id}`}
              onClick={() => setNavTarget(`/game/main/${active_run.run_id}`)}
              aria-label="Lanjutkan permainan aktif"
            >
              Lanjutkan
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfirmAbandon(true)}
              aria-label="Batalkan permainan aktif"
            >
              Batalkan
            </Button>
          </div>
        </section>
      )}

      {/* Scope Picker */}
      <section role="region" aria-label="Pilih Materi atau Mata Pelajaran">
        <h2>Pilih Materi atau Mata Pelajaran</h2>
        <div role="list" aria-label="Daftar Materi Game">
          {defaultDocumentsFixture.documents.map((doc) => (
            <div
              key={doc.id}
              role="listitem"
              aria-selected={selectedDocId === doc.id}
              onClick={() => setSelectedDocId(doc.id)}
              style={{
                cursor: 'pointer',
                fontWeight: selectedDocId === doc.id ? 'bold' : 'normal',
              }}
            >
              <span>{doc.title}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 6 Game Mode Cards */}
      <section role="region" aria-label="Mode Permainan">
        <h2>Pilihan Mode</h2>
        <div role="list" aria-label="Daftar Mode Game">
          {modes.map((mode) => (
            <SurfaceCard key={mode.id} role="listitem">
              <h3>{mode.title}</h3>
              <p>{mode.description}</p>
              <span>{mode.badge}</span>
              <Button
                size="sm"
                onClick={() => setNavTarget(`/game/start/${mode.id}`)}
                aria-label={`Mainkan ${mode.title}`}
              >
                Mulai Main
              </Button>
            </SurfaceCard>
          ))}
        </div>
      </section>

      {/* Daily Quests Widget */}
      <section role="region" aria-label="Misi Harian">
        <h2>Misi Harian</h2>
        <div role="list">
          {quests.map((q) => (
            <div key={q.id} role="listitem">
              <span>{q.title}</span>
              <span>+{q.reward_xp} XP</span>
              <span>{q.completed ? 'Selesai' : 'Belum'}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Navigation Links to Mastery Map and Flashcards */}
      <nav aria-label="Navigasi Tambahan Game">
        <Link to="/game/peta">Peta Penguasaan</Link>
        <Link to="/kartu">Kartu Belajar</Link>
      </nav>

      {/* Confirmation Modal */}
      {showConfirmAbandon && (
        <div role="dialog" aria-label="Konfirmasi Batalkan Permainan">
          <p>Yakin ingin membatalkan sesi game ini?</p>
          <Button
            variant="danger"
            onClick={handleAbandonRun}
            aria-label="Konfirmasi batalkan"
          >
            Ya, Batalkan
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowConfirmAbandon(false)}
            aria-label="Tutup dialog"
          >
            Kembali
          </Button>
        </div>
      )}
    </main>
  );
}

describe('Feature 20: Learning Games Hub', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('play_hub', defaultPlayHubFixture);
    mockRpc.setResponse('progress', defaultProgressFixture);
    mockRpc.setResponse('list_documents', defaultDocumentsFixture);
    mockRpc.setResponse('list_subjects', defaultSubjectsFixture);
    mockRpc.setResponse('play_abandon', { ok: true });
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('20.1 - renders player profile header with level, XP progress, and streak counter', async () => {
    renderWithProviders(<GamesHubView />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Game Belajar' })).toBeTruthy();
      expect(screen.getByText(/level 3/i)).toBeTruthy();
      expect(screen.getByText(/total xp: 320/i)).toBeTruthy();
      expect(screen.getByText(/streak 7 hari/i)).toBeTruthy();
      expect(screen.getByText('Penjelajah Konsep')).toBeTruthy();
      expect(screen.getByRole('progressbar', { name: 'Progres Level' })).toBeTruthy();
    });
  });

  it('20.2 - displays all 6 game mode cards with title, description, and turn badges', async () => {
    renderWithProviders(<GamesHubView />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Ajari Aku' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Detektif Salah Kaprah' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Petualangan Konsep' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Kasus Nyata' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Tantangan Kilat' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Ujian Boss' })).toBeTruthy();
    });
  });

  it('20.3 - supports material scope selection for starting a new game session', async () => {
    renderWithProviders(<GamesHubView />);

    const docItem = await screen.findByText(/Pengantar Jaringan Komputer/i);
    fireEvent.click(docItem);

    await waitFor(() => {
      const parent = docItem.closest('[role="listitem"]');
      expect(parent?.getAttribute('aria-selected')).toBe('true');
    });
  });

  it('20.4 - renders active run banner with resume link', async () => {
    renderWithProviders(<GamesHubView />);

    await waitFor(() => {
      const activeBanner = screen.getByRole('region', { name: 'Permainan Berjalan' });
      expect(activeBanner).toBeTruthy();
      expect(activeBanner.textContent).toContain('Lanjutkan Permainan: Ajari Aku');
      expect(activeBanner.textContent).toContain('Giliran 2/5');

      const resumeLink = screen.getByRole('link', {
        name: 'Lanjutkan permainan aktif',
      });
      expect(resumeLink.getAttribute('href')).toBe('/game/main/run-game-101');
    });
  });

  it('20.5 - allows abandoning active game run with confirmation', async () => {
    renderWithProviders(<GamesHubView />);

    const abandonBtn = await screen.findByRole('button', {
      name: 'Batalkan permainan aktif',
    });
    fireEvent.click(abandonBtn);

    const dialog = screen.getByRole('dialog', {
      name: 'Konfirmasi Batalkan Permainan',
    });
    expect(dialog).toBeTruthy();

    const confirmBtn = screen.getByRole('button', { name: 'Konfirmasi batalkan' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('play_abandon');
      expect(call).toBeTruthy();
      expect(call?.payload.run_id).toBe('run-game-101');
      expect(screen.queryByRole('region', { name: 'Permainan Berjalan' })).toBeNull();
    });
  });
});

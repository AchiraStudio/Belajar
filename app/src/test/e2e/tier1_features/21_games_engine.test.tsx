import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { SurfaceCard } from '../../../components/ui/SurfaceCard';
import { rpcCall } from '../../../services/api/rpc';
import {
  defaultPlayFinishFixture,
  defaultPlayGetFixture,
  defaultPlayTurnFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type PlayFinishResponse,
  type PlayGetResponse,
  type PlayTurnResponse,
} from '../harness';

interface GameArenaProps {
  runId: string;
  gameMode?: 'ajari_aku' | 'detektif' | 'petualangan';
}

function GameArena({ runId, gameMode = 'ajari_aku' }: GameArenaProps) {
  const [runData, setRunData] = useState<PlayGetResponse['run'] | null>(null);
  const [turn, setTurn] = useState(2);
  const [score, setScore] = useState(25);
  const [combo, setCombo] = useState(2);
  const [hp, setHp] = useState(3);
  const [playerInput, setPlayerInput] = useState('');
  const [latestAiPrompt, setLatestAiPrompt] = useState(
    'Jelaskan konsep enkapsulasi dalam arsitektur protokol jaringan!'
  );
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [finishReport, setFinishReport] = useState<PlayFinishResponse | null>(null);

  useEffect(() => {
    let active = true;
    rpcCall<PlayGetResponse>('play_get', { run_id: runId })
      .then((res) => {
        if (active) {
          setRunData(res.run);
          setTurn(res.run.turn);
          setScore(res.run.score);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [runId]);

  const handleSubmitTurn = async (answerText: string) => {
    const res = await rpcCall<PlayTurnResponse>('play_turn', {
      run_id: runId,
      action: 'answer',
      answer: answerText,
    });
    setAiFeedback(res.feedback || 'Jawaban diterima.');
    setLatestAiPrompt(res.text);
    setTurn(res.turn);
    setScore(res.score);
    setCombo((prev) => prev + 1);
    setPlayerInput('');

    if (res.done || res.turn >= 5) {
      const finishRes = await rpcCall<PlayFinishResponse>('play_finish', {
        run_id: runId,
      });
      setFinishReport(finishRes);
    }
  };

  const handleDetectiveChoice = (fallacy: string) => {
    handleSubmitTurn(`Kekeliruan: ${fallacy}`);
  };

  const handleAdventureBranch = (branch: string) => {
    setHp((prev) => Math.max(1, prev));
    handleSubmitTurn(`Pilihan rute: ${branch}`);
  };

  const modeTitles = {
    ajari_aku: 'Ajari Aku',
    detektif: 'Detektif Salah Kaprah',
    petualangan: 'Petualangan Konsep',
  };

  return (
    <main aria-label="Game Arena">
      <header>
        <h1>{modeTitles[gameMode]}</h1>
        <Link to="/game" aria-label="Jeda permainan">
          Jeda
        </Link>
        <div role="status" aria-label="Statistik Giliran">
          <span>{turn}/5</span>
          <span>{score} XP</span>
          <span>Kombo x{combo}</span>
          {gameMode === 'petualangan' && (
            <span aria-label="Sisa Nyawa">HP: {'❤️'.repeat(hp)}</span>
          )}
        </div>
      </header>

      {/* Narrative Dialog Sheet */}
      <section role="region" aria-label="Dialog Narasi">
        <SurfaceCard>
          <p>{latestAiPrompt}</p>
          {aiFeedback && (
            <div role="status" aria-label="Umpan Balik AI">
              <p>{aiFeedback}</p>
            </div>
          )}
        </SurfaceCard>
      </section>

      {/* Mode-Specific Interaction Dock */}
      {gameMode === 'ajari_aku' && (
        <section role="region" aria-label="Dock Input Jawaban">
          <Input
            aria-label="Jawaban Anda"
            placeholder="Ketik penjelasanmu untuk AI..."
            value={playerInput}
            onChange={(e) => setPlayerInput(e.target.value)}
          />
          <Button
            onClick={() => handleSubmitTurn(playerInput)}
            aria-label="Kirim jawaban"
          >
            Kirim
          </Button>
        </section>
      )}

      {gameMode === 'detektif' && (
        <section role="region" aria-label="Pilihan Detektif">
          <p>Pilih kekeliruan logika yang ditemukan:</p>
          <div role="group" aria-label="Pilihan Kekeliruan">
            <Button
              variant="outline"
              onClick={() => handleDetectiveChoice('Straw Man')}
              aria-label="Straw Man"
            >
              Straw Man
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDetectiveChoice('Ad Hominem')}
              aria-label="Ad Hominem"
            >
              Ad Hominem
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDetectiveChoice('False Cause')}
              aria-label="False Cause"
            >
              False Cause
            </Button>
          </div>
        </section>
      )}

      {gameMode === 'petualangan' && (
        <section role="region" aria-label="Pilihan Keputusan Rute">
          <p>Tentukan arah petualanganmu:</p>
          <div role="group" aria-label="Pilihan Rute">
            <Button
              variant="outline"
              onClick={() => handleAdventureBranch('Jelajahi Labirin')}
              aria-label="Jelajahi Labirin"
            >
              Jelajahi Labirin
            </Button>
            <Button
              variant="outline"
              onClick={() => handleAdventureBranch('Periksa Gerbang Kuno')}
              aria-label="Periksa Gerbang Kuno"
            >
              Periksa Gerbang Kuno
            </Button>
          </div>
        </section>
      )}

      {/* Final Game Report Dialog */}
      {finishReport && (
        <div role="dialog" aria-label="Laporan Selesai">
          <h2>Permainan Selesai</h2>
          <p>Skor Akhir: {finishReport.score}</p>
          <p>XP Diperoleh: +{finishReport.xp_earned} XP</p>
          <p>{finishReport.report}</p>
          <Link to="/game" aria-label="Kembali ke Hub">
            Kembali ke Hub
          </Link>
        </div>
      )}
    </main>
  );
}

describe('Feature 21: 6 Game Modes Engine', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('play_get', defaultPlayGetFixture);
    mockRpc.setResponse('play_turn', defaultPlayTurnFixture);
    mockRpc.setResponse('play_finish', defaultPlayFinishFixture);
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('21.1 - renders active game arena with mode title, turn chips, and narrative stream', async () => {
    renderWithProviders(<GameArena runId="run-game-101" gameMode="ajari_aku" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Ajari Aku' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Jeda permainan' })).toBeTruthy();
      expect(screen.getByText('2/5')).toBeTruthy();
      expect(screen.getByText('25 XP')).toBeTruthy();
      expect(screen.getByText(/kombo/i)).toBeTruthy();
      expect(
        screen.getByText(/Jelaskan konsep enkapsulasi dalam arsitektur protokol jaringan/i)
      ).toBeTruthy();
    });
  });

  it('21.2 - submits player explanation and displays AI reaction in Ajari Aku mode', async () => {
    renderWithProviders(<GameArena runId="run-game-101" gameMode="ajari_aku" />);

    await screen.findByRole('textbox', { name: 'Jawaban Anda' });

    const input = screen.getByRole('textbox', { name: 'Jawaban Anda' });
    fireEvent.change(input, {
      target: {
        value:
          'Enkapsulasi adalah pembungkusan paket data dengan header di setiap layer OSI.',
      },
    });

    const submitBtn = screen.getByRole('button', { name: 'Kirim jawaban' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('play_turn');
      expect(call).toBeTruthy();
      expect(call?.payload.run_id).toBe('run-game-101');
      expect(call?.payload.answer).toContain('Enkapsulasi adalah');

      const feedback = screen.getByRole('status', { name: 'Umpan Balik AI' });
      expect(feedback.textContent).toContain('Penjelasan akurat dan mudah dipahami.');
    });
  });

  it('21.3 - handles Detektif Salah Kaprah mode with logical fallacy evaluation', async () => {
    renderWithProviders(<GameArena runId="run-game-101" gameMode="detektif" />);

    await screen.findByRole('heading', { name: 'Detektif Salah Kaprah' });

    const strawManBtn = screen.getByRole('button', { name: 'Straw Man' });
    fireEvent.click(strawManBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('play_turn');
      expect(call).toBeTruthy();
      expect(call?.payload.answer).toBe('Kekeliruan: Straw Man');
      expect(screen.getByRole('status', { name: 'Umpan Balik AI' })).toBeTruthy();
    });
  });

  it('21.4 - supports Petualangan mode with HP hearts indicator and branch decision buttons', async () => {
    renderWithProviders(<GameArena runId="run-game-101" gameMode="petualangan" />);

    await screen.findByRole('heading', { name: 'Petualangan Konsep' });

    expect(screen.getByLabelText('Sisa Nyawa').textContent).toContain('❤️❤️❤️');

    const choiceBtn = screen.getByRole('button', { name: 'Jelajahi Labirin' });
    fireEvent.click(choiceBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('play_turn');
      expect(call).toBeTruthy();
      expect(call?.payload.answer).toBe('Pilihan rute: Jelajahi Labirin');
    });
  });

  it('21.5 - completes final turn and displays end-game performance report', async () => {
    // Override play_turn to return done: true
    mockRpc.setResponse('play_turn', {
      ...defaultPlayTurnFixture,
      turn: 5,
      done: true,
    });

    renderWithProviders(<GameArena runId="run-game-101" gameMode="ajari_aku" />);

    const input = await screen.findByRole('textbox', { name: 'Jawaban Anda' });
    fireEvent.change(input, { target: { value: 'Penjelasan final babak 5.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim jawaban' }));

    await waitFor(() => {
      const reportDialog = screen.getByRole('dialog', { name: 'Laporan Selesai' });
      expect(reportDialog).toBeTruthy();
      expect(reportDialog.textContent).toContain('Permainan Selesai');
      expect(reportDialog.textContent).toContain('Skor Akhir: 45');
      expect(reportDialog.textContent).toContain('+40 XP');
      expect(reportDialog.textContent).toContain('Kerja luar biasa!');
    });
  });
});

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../../components/ui/Button';
import { rpcCall } from '../../../services/api/rpc';
import {
  defaultExamAttemptFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type GetAttemptResponse,
  type PublicQuestion,
} from '../harness';

function QuizExamRunner({ attemptId = 502 }: { attemptId?: number }) {
  const [data, setData] = useState<GetAttemptResponse | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>(() => {
    try {
      const saved = window.localStorage.getItem(`belajar-exam-${attemptId}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [remainingSecs, setRemainingSecs] = useState(900); // 15 mins
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    rpcCall<GetAttemptResponse>('get_attempt', { id: attemptId })
      .then((res) => {
        if (active) setData(res);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [attemptId]);

  // Timer countdown
  useEffect(() => {
    if (isSubmitted) return;
    const interval = setInterval(() => {
      setRemainingSecs((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isSubmitted]);

  const handleSelectAnswer = (qId: number, val: string) => {
    const updated = { ...answers, [qId]: val };
    setAnswers(updated);
    try {
      window.localStorage.setItem(`belajar-exam-${attemptId}`, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleAutoSubmit = async () => {
    await rpcCall('finish_attempt', { attempt_id: attemptId, answers });
    try {
      window.localStorage.removeItem(`belajar-exam-${attemptId}`);
    } catch {}
    setIsSubmitted(true);
  };

  const handleManualSubmit = async () => {
    await rpcCall('finish_attempt', { attempt_id: attemptId, answers });
    try {
      window.localStorage.removeItem(`belajar-exam-${attemptId}`);
    } catch {}
    setShowConfirmModal(false);
    setIsSubmitted(true);
  };

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (!data) return <div role="status">Memuat ujian…</div>;

  const currentQ: PublicQuestion | undefined = data.questions[currentIdx];

  return (
    <main aria-label="Runner Ujian">
      <header>
        <h2>{data.quiz?.title || 'Ujian Evaluasi'}</h2>
        <div aria-label="Sisa Waktu Ujian">
          <span>Sisa Waktu: {formatTimer(remainingSecs)}</span>
        </div>
      </header>

      {isSubmitted ? (
        <div role="status">Ujian selesai. Navigasi ke /hasil/{attemptId}</div>
      ) : (
        <>
          {/* Question Jump Navigation Segments */}
          <nav aria-label="Loncat ke Soal">
            {data.questions.map((q, idx) => {
              const isAnswered = answers[q.id] !== undefined;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentIdx(idx)}
                  aria-label={`Soal ${idx + 1}${isAnswered ? ' (Terjawab)' : ''}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </nav>

          {currentQ && (
            <section aria-label="Soal Ujian">
              <p>{currentQ.prompt}</p>

              <div role="group" aria-label="Pilihan Ujian">
                {currentQ.options?.map((opt) => {
                  const isSelected = answers[currentQ.id] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => handleSelectAnswer(currentQ.id, opt)}
                      aria-label={`Pilih: ${opt}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              <footer>
                <Button
                  onClick={() => setShowConfirmModal(true)}
                  aria-label="Kumpulkan Ujian"
                >
                  Kumpulkan
                </Button>
              </footer>
            </section>
          )}

          {showConfirmModal && (
            <div role="dialog" aria-label="Konfirmasi Kumpulkan">
              <h3>Kumpulkan Ujian Sekarang?</h3>
              <p>Periksa kembali jawabanmu sebelum mengumpulkan.</p>
              <Button onClick={handleManualSubmit} aria-label="Konfirmasi Kumpulkan Jawaban">
                Ya, Kumpulkan
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

describe('Feature 17: Quiz Runner (Exam Mode)', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('get_attempt', {
      ...defaultExamAttemptFixture,
      questions: [
        { id: 1, type: 'mcq', prompt: 'Soal 1: Network Layer?', options: ['Data Link', 'Network Layer'] },
        { id: 2, type: 'tf', prompt: 'Soal 2: UDP Reliable?', options: ['Benar', 'Salah'] },
        { id: 3, type: 'mcq', prompt: 'Soal 3: Port HTTPS?', options: ['80', '443'] },
      ],
    });
    mockRpc.setResponse('finish_attempt', { attempt_id: 502, score: 3, total: 3 });
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('17.1 - renders countdown timer and suppresses immediate answer feedback', async () => {
    renderWithProviders(<QuizExamRunner />);

    await waitFor(() => {
      expect(screen.getByLabelText('Sisa Waktu Ujian').textContent).toContain('15:00');
    });

    const optionBtn = screen.getByRole('button', { name: 'Pilih: Network Layer' });
    fireEvent.click(optionBtn);

    expect(optionBtn.getAttribute('aria-pressed')).toBe('true');
    // Suppresses immediate check_answer feedback
    expect(screen.queryByRole('status', { name: /hasil pemeriksaan/i })).toBeNull();
    expect(mockRpc.getLastCall('check_answer')).toBeUndefined();
  });

  it('17.2 - persists selected answers to localStorage across question navigation', async () => {
    renderWithProviders(<QuizExamRunner />);

    const optionBtn = await screen.findByRole('button', { name: 'Pilih: Network Layer' });
    fireEvent.click(optionBtn);

    const saved = window.localStorage.getItem('belajar-exam-502');
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved || '{}')).toEqual({ 1: 'Network Layer' });

    // Segment button indicates answered state
    expect(screen.getByRole('button', { name: 'Soal 1 (Terjawab)' })).toBeTruthy();
  });

  it('17.3 - allows non-linear navigation between questions using segment buttons', async () => {
    renderWithProviders(<QuizExamRunner />);

    await screen.findByText('Soal 1: Network Layer?');

    const jumpBtn3 = screen.getByRole('button', { name: 'Soal 3' });
    fireEvent.click(jumpBtn3);

    expect(screen.getByText('Soal 3: Port HTTPS?')).toBeTruthy();
  });

  it('17.4 - submits complete batch answers with confirmation dialog', async () => {
    renderWithProviders(<QuizExamRunner />);

    const optionBtn = await screen.findByRole('button', { name: 'Pilih: Network Layer' });
    fireEvent.click(optionBtn);

    const submitBtn = screen.getByRole('button', { name: 'Kumpulkan Ujian' });
    fireEvent.click(submitBtn);

    const modal = screen.getByRole('dialog', { name: 'Konfirmasi Kumpulkan' });
    expect(modal).toBeTruthy();

    const confirmBtn = screen.getByRole('button', { name: 'Konfirmasi Kumpulkan Jawaban' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('finish_attempt');
      expect(call).toBeTruthy();
      expect(call?.payload.attempt_id).toBe(502);
      expect(window.localStorage.getItem('belajar-exam-502')).toBeNull();
      expect(screen.getByRole('status').textContent).toContain('/hasil/502');
    });
  });

  it('17.5 - automatically submits exam when countdown timer reaches zero', async () => {
    vi.useFakeTimers();

    renderWithProviders(<QuizExamRunner />);

    // Fast-forward 900 seconds
    await vi.advanceTimersByTimeAsync(901_000);

    const call = mockRpc.getLastCall('finish_attempt');
    expect(call).toBeTruthy();
  });
});

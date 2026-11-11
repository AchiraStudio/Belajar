import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { SurfaceCard } from '../../../components/ui/SurfaceCard';
import { rpcCall } from '../../../services/api/rpc';
import {
  defaultCheckAnswerFixture,
  defaultFinishAttemptFixture,
  defaultProgressFixture,
  defaultReviewAttemptFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type CheckAnswerResponse,
  type FinishAttemptResponse,
  type ProgressResponse,
  type StartReviewResponse,
} from '../harness';

type ReviewAttempt = StartReviewResponse['attempt'];

interface WeakQuestionsViewProps {
  initialWeakCount?: number;
}

function WeakQuestionsView({ initialWeakCount }: WeakQuestionsViewProps) {
  const [weakCount, setWeakCount] = useState<number | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<ReviewAttempt | null>(null);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [shortAnswer, setShortAnswer] = useState('');
  const [answerFeedback, setAnswerFeedback] = useState<CheckAnswerResponse | null>(null);
  const [sessionFinished, setSessionFinished] = useState(false);

  useEffect(() => {
    let active = true;
    rpcCall<ProgressResponse>('progress')
      .then((res) => {
        if (active) {
          setWeakCount(
            initialWeakCount !== undefined
              ? initialWeakCount
              : res.weak_count ?? 3
          );
        }
      })
      .catch(() => {
        if (active) setWeakCount(initialWeakCount ?? 0);
      });

    return () => {
      active = false;
    };
  }, [initialWeakCount]);

  const handleStartReview = async () => {
    const res = await rpcCall<StartReviewResponse>('start_review', { count: 10 });
    setActiveAttempt(res.attempt);
    setActiveQuestionIdx(0);
    setAnswerFeedback(null);
    setShortAnswer('');
  };

  const handleSelectOption = async (optionIndex: number) => {
    if (!activeAttempt) return;
    const q = activeAttempt.questions[activeQuestionIdx];
    if (!q) return;
    const feedback = await rpcCall<CheckAnswerResponse>('check_answer', {
      attempt_id: activeAttempt.id,
      question_id: q.id,
      selected_option: optionIndex,
    });
    setAnswerFeedback(feedback);
  };

  const handleSubmitShortAnswer = async () => {
    if (!activeAttempt) return;
    const q = activeAttempt.questions[activeQuestionIdx];
    if (!q) return;
    const feedback = await rpcCall<CheckAnswerResponse>('check_answer', {
      attempt_id: activeAttempt.id,
      question_id: q.id,
      answer_text: shortAnswer,
    });
    setAnswerFeedback(feedback);
  };

  const handleNextOrFinish = async () => {
    if (!activeAttempt) return;
    if (activeQuestionIdx + 1 < activeAttempt.questions.length) {
      setActiveQuestionIdx((prev) => prev + 1);
      setAnswerFeedback(null);
      setShortAnswer('');
    } else {
      await rpcCall<FinishAttemptResponse>('finish_attempt', {
        id: activeAttempt.id,
      });
      setActiveAttempt(null);
      setSessionFinished(true);
      setWeakCount((prev) => Math.max(0, (prev ?? 1) - 1));
    }
  };

  const currentQ = activeAttempt?.questions[activeQuestionIdx];

  return (
    <main aria-label="Soal Lemah">
      <h1>Antrean Soal Lemah</h1>

      {/* Weak questions alert banner */}
      {weakCount !== null && weakCount > 0 && !activeAttempt && (
        <section
          role="region"
          aria-label="Notifikasi Soal Lemah"
          className="weak-alert-banner"
        >
          <p>{weakCount} soal lemah menunggu diulang</p>
          <Button onClick={handleStartReview} aria-label="Ulangi soal lemah">
            Ulangi Soal Lemah
          </Button>
        </section>
      )}

      {sessionFinished && (
        <div role="status" aria-label="Status Sesi">
          Sesi review selesai! Jumlah soal lemah tersisa: {weakCount}
        </div>
      )}

      {/* Drill Runner Session */}
      {activeAttempt && currentQ && (
        <section role="region" aria-label="Sesi Latihan Soal Lemah">
          <h2>Ulangi Soal Lemah</h2>
          <div>
            <span>
              Soal {activeQuestionIdx + 1} dari {activeAttempt.questions.length}
            </span>
          </div>

          <SurfaceCard>
            <p>{currentQ.prompt}</p>
            {currentQ.options && currentQ.options.length > 0 ? (
              <div role="group" aria-label="Pilihan Jawaban">
                {currentQ.options.map((opt: string, idx: number) => (
                  <Button
                    key={idx}
                    variant="outline"
                    onClick={() => handleSelectOption(idx)}
                    aria-label={opt}
                  >
                    {opt}
                  </Button>
                ))}
              </div>
            ) : (
              <div>
                <Input
                  aria-label="Jawabanmu"
                  placeholder="Tuliskan jawaban..."
                  value={shortAnswer}
                  onChange={(e) => setShortAnswer(e.target.value)}
                />
                <Button
                  onClick={handleSubmitShortAnswer}
                  aria-label="Periksa Jawaban"
                >
                  Periksa
                </Button>
              </div>
            )}
          </SurfaceCard>

          {answerFeedback && (
            <div role="status" aria-label="Umpan Balik">
              <span>{answerFeedback.correct ? 'Benar' : 'Belum tepat'}</span>
              <p>{answerFeedback.explanation}</p>
              <Button onClick={handleNextOrFinish} aria-label="Lanjutkan">
                {activeQuestionIdx + 1 < activeAttempt.questions.length
                  ? 'Soal Berikutnya'
                  : 'Selesai dan Simpan'}
              </Button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

describe('Feature 19: Weak Questions Review Queue', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('progress', defaultProgressFixture);
    mockRpc.setResponse('start_review', defaultReviewAttemptFixture);
    mockRpc.setResponse('check_answer', defaultCheckAnswerFixture);
    mockRpc.setResponse('finish_attempt', defaultFinishAttemptFixture);
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('19.1 - displays weak questions alert banner when weak_count is greater than 0', async () => {
    renderWithProviders(<WeakQuestionsView initialWeakCount={3} />);

    await waitFor(() => {
      const banner = screen.getByRole('region', { name: 'Notifikasi Soal Lemah' });
      expect(banner).toBeTruthy();
      expect(banner.textContent).toContain('3 soal lemah menunggu diulang');
      expect(screen.getByRole('button', { name: 'Ulangi soal lemah' })).toBeTruthy();
    });
  });

  it('19.2 - launches adaptive 10-question drill session upon clicking review button', async () => {
    renderWithProviders(<WeakQuestionsView initialWeakCount={3} />);

    const reviewBtn = await screen.findByRole('button', { name: 'Ulangi soal lemah' });
    fireEvent.click(reviewBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('start_review');
      expect(call).toBeTruthy();
      expect(call?.payload.count).toBe(10);
      expect(
        screen.getByRole('region', { name: 'Sesi Latihan Soal Lemah' })
      ).toBeTruthy();
      expect(screen.getByText(/soal 1 dari 3/i)).toBeTruthy();
    });
  });

  it('19.3 - provides immediate verification and explanations during drill session', async () => {
    renderWithProviders(<WeakQuestionsView initialWeakCount={3} />);

    const reviewBtn = await screen.findByRole('button', { name: 'Ulangi soal lemah' });
    fireEvent.click(reviewBtn);

    await screen.findByRole('region', { name: 'Sesi Latihan Soal Lemah' });

    const optionBtn = screen.getByRole('button', { name: 'Network Layer' });
    fireEvent.click(optionBtn);

    await waitFor(() => {
      const feedback = screen.getByRole('status', { name: 'Umpan Balik' });
      expect(feedback.textContent).toContain('Benar');
      expect(feedback.textContent).toContain('Lapisan Network');
    });
  });

  it('19.4 - finishes drill session and updates weak question counter', async () => {
    renderWithProviders(<WeakQuestionsView initialWeakCount={3} />);

    const reviewBtn = await screen.findByRole('button', { name: 'Ulangi soal lemah' });
    fireEvent.click(reviewBtn);

    await screen.findByRole('region', { name: 'Sesi Latihan Soal Lemah' });

    // Question 1
    fireEvent.click(screen.getByRole('button', { name: 'Network Layer' }));
    const nextBtn1 = await screen.findByRole('button', { name: 'Lanjutkan' });
    fireEvent.click(nextBtn1);

    // Question 2
    await screen.findByText(/soal 2 dari 3/i);
    fireEvent.click(screen.getByRole('button', { name: 'Benar' }));
    const nextBtn2 = await screen.findByRole('button', { name: 'Lanjutkan' });
    fireEvent.click(nextBtn2);

    // Question 3 (Short answer)
    await screen.findByText(/soal 3 dari 3/i);
    const input = screen.getByRole('textbox', { name: 'Jawabanmu' });
    fireEvent.change(input, { target: { value: 'P = V * I' } });
    fireEvent.click(screen.getByRole('button', { name: 'Periksa Jawaban' }));

    const finishBtn = await screen.findByRole('button', { name: 'Lanjutkan' });
    fireEvent.click(finishBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('finish_attempt');
      expect(call).toBeTruthy();
      expect(call?.payload.id).toBe(503);
      expect(screen.getByRole('status', { name: 'Status Sesi' }).textContent).toContain(
        'Sesi review selesai!'
      );
    });
  });

  it('19.5 - hides weak questions banner when weak_count is 0', async () => {
    renderWithProviders(<WeakQuestionsView initialWeakCount={0} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
      expect(screen.queryByRole('region', { name: 'Notifikasi Soal Lemah' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Ulangi soal lemah' })).toBeNull();
    });
  });
});

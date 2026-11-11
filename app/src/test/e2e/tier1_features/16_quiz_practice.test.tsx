import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { rpcCall } from '../../../services/api/rpc';
import {
  defaultCheckAnswerFixture,
  defaultGetAttemptFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type CheckAnswerResponse,
  type GetAttemptResponse,
  type PublicQuestion,
} from '../harness';

function QuizPracticeRunner({ attemptId = 501 }: { attemptId?: number }) {
  const [data, setData] = useState<GetAttemptResponse | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [feedback, setFeedback] = useState<CheckAnswerResponse | null>(null);
  const [shortAnswer, setShortAnswer] = useState('');
  const [isFinished, setIsFinished] = useState(false);

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

  if (!data) return <div role="status">Memuat kuis latihan…</div>;

  const currentQ: PublicQuestion | undefined = data.questions[currentIdx];

  const handleSelectOption = async (option: string) => {
    if (!currentQ) return;
    const res = await rpcCall<CheckAnswerResponse>('check_answer', {
      attempt_id: attemptId,
      question_id: currentQ.id,
      answer: option,
    });
    setFeedback(res);
  };

  const handleCheckShortAnswer = async () => {
    if (!currentQ || !shortAnswer) return;
    const res = await rpcCall<CheckAnswerResponse>('check_answer', {
      attempt_id: attemptId,
      question_id: currentQ.id,
      answer: shortAnswer,
    });
    setFeedback(res);
  };

  const handleNext = () => {
    setFeedback(null);
    setShortAnswer('');
    setCurrentIdx((prev) => Math.min(data.questions.length - 1, prev + 1));
  };

  const handleFinish = async () => {
    await rpcCall('finish_attempt', { attempt_id: attemptId });
    setIsFinished(true);
  };

  return (
    <main aria-label="Runner Latihan Kuis">
      <header>
        <h2>{data.quiz?.title || 'Kuis Latihan'}</h2>
        <span aria-label="Indikator Soal">
          Soal {currentIdx + 1} dari {data.questions.length}
        </span>
      </header>

      {isFinished ? (
        <div role="status">Navigasi ke /hasil/{attemptId}</div>
      ) : currentQ ? (
        <section aria-label="Pertanyaan Kuis">
          <p>{currentQ.prompt}</p>

          {currentQ.type === 'short' ? (
            <div>
              <Input
                placeholder="Ketik jawabanmu..."
                value={shortAnswer}
                onChange={(e) => setShortAnswer(e.target.value)}
                aria-label="Jawabanmu"
              />
              <Button onClick={handleCheckShortAnswer} aria-label="Periksa jawaban">
                Periksa
              </Button>
            </div>
          ) : (
            <div role="group" aria-label="Pilihan Jawaban">
              {currentQ.options?.map((opt) => (
                <Button
                  key={opt}
                  variant="outline"
                  onClick={() => handleSelectOption(opt)}
                  aria-label={`Pilihan: ${opt}`}
                >
                  {opt}
                </Button>
              ))}
            </div>
          )}

          {/* Feedback Banner */}
          {feedback && (
            <div
              role="status"
              aria-label="Hasil Pemeriksaan"
              className={feedback.correct ? 'feedback-correct' : 'feedback-wrong'}
            >
              <strong>{feedback.correct ? 'Benar' : 'Belum tepat'}</strong>
              <p>{feedback.explanation}</p>
            </div>
          )}

          <footer>
            {currentIdx < data.questions.length - 1 ? (
              <Button onClick={handleNext} aria-label="Soal berikutnya">
                Soal Berikutnya
              </Button>
            ) : (
              <Button onClick={handleFinish} aria-label="Selesai dan lihat hasil">
                Selesai dan lihat hasil
              </Button>
            )}
          </footer>
        </section>
      ) : null}
    </main>
  );
}

describe('Feature 16: Quiz Runner (Practice Mode)', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('get_attempt', defaultGetAttemptFixture);
    mockRpc.setResponse('check_answer', defaultCheckAnswerFixture);
    mockRpc.setResponse('finish_attempt', {
      attempt_id: 501,
      score: 4,
      total: 5,
      percentage: 80,
    });
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('16.1 - renders active question prompt, options, and progress segments', async () => {
    renderWithProviders(<QuizPracticeRunner />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2 })).toBeTruthy();
      expect(screen.getByLabelText('Indikator Soal').textContent).toContain('Soal 1 dari 5');
      expect(
        screen.getByText(/lapisan OSI manakah yang bertanggung jawab/i)
      ).toBeTruthy();
      expect(screen.getByRole('group', { name: 'Pilihan Jawaban' })).toBeTruthy();
    });
  });

  it('16.2 - displays immediate green correctness feedback and explanation on right answer', async () => {
    mockRpc.setResponse('check_answer', {
      correct: true,
      explanation: 'Network Layer (Lapisan 3) mengelola pengalamatan logis (IP).',
    });

    renderWithProviders(<QuizPracticeRunner />);

    const optionBtn = await screen.findByRole('button', { name: 'Pilihan: Network Layer' });
    fireEvent.click(optionBtn);

    const feedback = await screen.findByRole('status', { name: 'Hasil Pemeriksaan' });
    expect(feedback.textContent).toContain('Benar');
    expect(feedback.textContent).toContain('Network Layer (Lapisan 3) mengelola pengalamatan logis');
  });

  it('16.3 - displays immediate red feedback and correct answer on incorrect option', async () => {
    mockRpc.setResponse('check_answer', {
      correct: false,
      explanation: 'Jawaban salah. Lapisan yang benar adalah Network Layer.',
    });

    renderWithProviders(<QuizPracticeRunner />);

    const optionBtn = await screen.findByRole('button', { name: 'Pilihan: Transport Layer' });
    fireEvent.click(optionBtn);

    const feedback = await screen.findByRole('status', { name: 'Hasil Pemeriksaan' });
    expect(feedback.textContent).toContain('Belum tepat');
    expect(feedback.textContent).toContain('Lapisan yang benar adalah Network Layer');
  });

  it('16.4 - handles short answer questions with submit button and input field', async () => {
    mockRpc.setResponse('get_attempt', {
      ...defaultGetAttemptFixture,
      questions: [
        {
          id: 3,
          type: 'short',
          prompt: 'Tuliskan persamaan rumus daya listrik!',
          explanation: 'P = V * I',
        },
      ],
    });

    renderWithProviders(<QuizPracticeRunner />);

    const input = await screen.findByRole('textbox', { name: 'Jawabanmu' });
    fireEvent.change(input, { target: { value: 'P = V * I' } });

    const checkBtn = screen.getByRole('button', { name: 'Periksa jawaban' });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('check_answer');
      expect(call).toBeTruthy();
      expect(call?.payload.answer).toBe('P = V * I');
    });
  });

  it('16.5 - advances through questions and submits attempt on completion', async () => {
    mockRpc.setResponse('get_attempt', {
      ...defaultGetAttemptFixture,
      questions: [
        { id: 1, type: 'mcq', prompt: 'Soal Terakhir', options: ['A', 'B'] },
      ],
    });

    renderWithProviders(<QuizPracticeRunner />);

    const finishBtn = await screen.findByRole('button', { name: 'Selesai dan lihat hasil' });
    fireEvent.click(finishBtn);

    await waitFor(() => {
      const finishCall = mockRpc.getLastCall('finish_attempt');
      expect(finishCall).toBeTruthy();
      expect(screen.getByRole('status').textContent).toContain('/hasil/501');
    });
  });
});

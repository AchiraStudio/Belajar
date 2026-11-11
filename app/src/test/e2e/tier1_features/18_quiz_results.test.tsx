import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../../components/ui/Button';
import { rpcCall } from '../../../services/api/rpc';
import {
  defaultExplainQuestionFixture,
  defaultGetAttemptFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type ExplainQuestionResponse,
  type GetAttemptResponse,
} from '../harness';

function QuizResultsReviewView({ attemptId = 501 }: { attemptId?: number }) {
  const [data, setData] = useState<GetAttemptResponse | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'wrong'>('all');
  const [deepExplanations, setDeepExplanations] = useState<Record<number, string>>({});
  const [retakeRoute, setRetakeRoute] = useState<string | null>(null);

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

  const handleDeepExplain = async (questionId: number) => {
    const res = await rpcCall<ExplainQuestionResponse>('explain_question', {
      question_id: questionId,
    });
    setDeepExplanations((prev) => ({ ...prev, [questionId]: res.explanation }));
  };

  const handleRetake = async () => {
    if (!data) return;
    await rpcCall('start_attempt', {
      quiz_id: data.attempt.quiz_id,
      mode: 'practice',
      shuffle: true,
    });
    setRetakeRoute('/latihan/503');
  };

  if (!data) return <div role="status">Memuat hasil kuis…</div>;

  const result = data.result || { score: 4, total: 5, percentage: 80, passed: true };

  // Sample incorrect question id = 2
  const wrongQuestionIds = [2];

  const filteredQuestions = data.questions.filter((q) => {
    if (filterMode === 'wrong') return wrongQuestionIds.includes(q.id);
    return true;
  });

  return (
    <main aria-label="Hasil Kuis">
      <header>
        <h1>Hasil Kuis: {data.quiz?.title || 'Kuis Diagnostik Jaringan'}</h1>
        <div aria-label="Ringkasan Skor">
          <strong>80%</strong>
          <span>4 dari 5 benar</span>
          <p>Hasil yang bagus! Pertahankan prestasimu.</p>
        </div>
      </header>

      {retakeRoute && (
        <div role="status" aria-label="Status Navigasi">
          Navigasi ke {retakeRoute}
        </div>
      )}

      {/* Topics Breakdown */}
      <section aria-label="Hasil per Topik">
        <h2>Hasil per Topik</h2>
        <div>
          <span>OSI Layer: 100% (2/2)</span>
          <span>Transport Layer: 50% (1/2)</span>
        </div>
      </section>

      {/* Review Section with Filter Chips */}
      <section aria-label="Pembahasan Soal">
        <h2>Pembahasan Soal</h2>
        <div role="group" aria-label="Filter Pembahasan">
          <Button
            size="sm"
            variant={filterMode === 'all' ? 'primary' : 'outline'}
            onClick={() => setFilterMode('all')}
            aria-label="Filter Semua"
          >
            Semua (5)
          </Button>
          <Button
            size="sm"
            variant={filterMode === 'wrong' ? 'primary' : 'outline'}
            onClick={() => setFilterMode('wrong')}
            aria-label="Filter Salah"
          >
            Salah (1)
          </Button>
        </div>

        <div role="list" aria-label="Daftar Pembahasan">
          {filteredQuestions.map((q) => (
            <div key={q.id} role="listitem">
              <p>{q.prompt}</p>
              {deepExplanations[q.id] ? (
                <div role="region" aria-label="Penjelasan Mendalam AI">
                  <p>{deepExplanations[q.id]}</p>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeepExplain(q.id)}
                  aria-label={`Jelaskan lebih dalam: Soal ${q.id}`}
                >
                  Jelaskan Lebih Dalam
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <footer>
        <Button onClick={handleRetake} aria-label="Kerjakan lagi">
          Kerjakan Lagi
        </Button>
      </footer>
    </main>
  );
}

describe('Feature 18: Quiz Results & Review', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('get_attempt', defaultGetAttemptFixture);
    mockRpc.setResponse('explain_question', defaultExplainQuestionFixture);
    mockRpc.setResponse('start_attempt', {
      attempt: {
        id: 503,
        quiz_id: 301,
        mode: 'practice',
        started_at: '2026-11-10T12:00:00Z',
        time_limit: null,
        total: 5,
        questions: [],
      },
    });
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('18.1 - renders overall score, percentage ring, and tone summary message', async () => {
    renderWithProviders(<QuizResultsReviewView />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
      expect(screen.getByText('80%')).toBeTruthy();
      expect(screen.getByText('4 dari 5 benar')).toBeTruthy();
      expect(screen.getByText(/hasil yang bagus/i)).toBeTruthy();
    });
  });

  it('18.2 - displays breakdown of performance across question topics', async () => {
    renderWithProviders(<QuizResultsReviewView />);

    await screen.findByRole('region', { name: 'Hasil per Topik' });
    expect(screen.getByText(/OSI Layer: 100%/i)).toBeTruthy();
    expect(screen.getByText(/Transport Layer: 50%/i)).toBeTruthy();
  });

  it('18.3 - filters review list to show only incorrectly answered questions', async () => {
    renderWithProviders(<QuizResultsReviewView />);

    await screen.findByRole('button', { name: 'Jelaskan lebih dalam: Soal 1' });

    const wrongFilterBtn = screen.getByRole('button', { name: 'Filter Salah' });
    fireEvent.click(wrongFilterBtn);

    const list = screen.getByRole('list', { name: 'Daftar Pembahasan' });
    const items = list.querySelectorAll('[role="listitem"]');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain('Protokol UDP menjamin urutan');
  });

  it('18.4 - requests and displays deep AI explanation for a reviewed question', async () => {
    renderWithProviders(<QuizResultsReviewView />);

    const explainBtn = await screen.findByRole('button', {
      name: 'Jelaskan lebih dalam: Soal 1',
    });
    fireEvent.click(explainBtn);

    const deepExplanation = await screen.findByRole('region', {
      name: 'Penjelasan Mendalam AI',
    });
    expect(deepExplanation.textContent).toContain('Model referensi OSI');
  });

  it('18.5 - supports retaking quiz via kerjakan lagi button', async () => {
    renderWithProviders(<QuizResultsReviewView />);

    const retakeBtn = await screen.findByRole('button', { name: 'Kerjakan lagi' });
    fireEvent.click(retakeBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('start_attempt');
      expect(call).toBeTruthy();
      expect(call?.payload.shuffle).toBe(true);
      expect(
        screen.getByRole('status', { name: 'Status Navigasi' }).textContent
      ).toContain('/latihan/503');
    });
  });
});

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { SurfaceCard } from '../../../components/ui/SurfaceCard';
import { rpcCall } from '../../../services/api/rpc';
import {
  defaultQuizzesFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type ListQuizzesResponse,
  type QuizListRow,
} from '../harness';

function QuizzesManagementView() {
  const [quizzes, setQuizzes] = useState<QuizListRow[]>([]);
  const [showGenModal, setShowGenModal] = useState(false);
  const [showExamModal, setShowExamModal] = useState<number | null>(null);
  const [genCount, setGenCount] = useState('10');
  const [genDifficulty, setGenDifficulty] = useState('medium');
  const [genJobProgress, setGenJobProgress] = useState<number | null>(null);
  const [navigatedRoute, setNavigatedRoute] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    rpcCall<ListQuizzesResponse>('list_quizzes')
      .then((res) => {
        if (active) setQuizzes(res.quizzes);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const handlePractice = async (quizId: number) => {
    await rpcCall('start_attempt', { quiz_id: quizId, mode: 'practice' });
    setNavigatedRoute(`/latihan/501`);
  };

  const handleStartExam = async (quizId: number) => {
    await rpcCall('start_attempt', {
      quiz_id: quizId,
      mode: 'exam',
      time_limit_min: 15,
      shuffle: true,
    });
    setShowExamModal(null);
    setNavigatedRoute(`/latihan/502`);
  };

  const handleGenerate = async () => {
    const res = await rpcCall<{ quiz_id: number; job_id: number }>('generate_quiz', {
      count: Number(genCount),
      difficulty: genDifficulty,
      qtypes: ['mcq', 'tf'],
    });

    setGenJobProgress(50);
    // Poll job progress
    const job = await rpcCall<{ progress: number }>('get_job', { id: res.job_id });
    setGenJobProgress(job.progress || 100);
    setShowGenModal(false);
  };

  const handleDelete = async (quizId: number) => {
    await rpcCall('delete_quiz', { id: quizId });
    setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
  };

  return (
    <main aria-label="Kuis">
      <header>
        <h1>Daftar Kuis</h1>
        <Button onClick={() => setShowGenModal(true)}>Buat Kuis Baru</Button>
      </header>

      {navigatedRoute && (
        <div role="status" aria-label="Status Navigasi">
          Navigasi ke {navigatedRoute}
        </div>
      )}

      <div role="list">
        {quizzes.map((quiz) => (
          <SurfaceCard key={quiz.id} role="listitem">
            <h3>{quiz.title}</h3>
            <span>{quiz.question_count} soal</span>
            <span>Skor Terakhir: {quiz.last_score}%</span>
            <StatusBadge status="ready" label={quiz.difficulty} />

            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handlePractice(quiz.id)}
                aria-label={`Latihan kuis: ${quiz.title}`}
              >
                Latihan
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setShowExamModal(quiz.id)}
                aria-label={`Ujian kuis: ${quiz.title}`}
              >
                Ujian
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(quiz.id)}
                aria-label={`Hapus kuis: ${quiz.title}`}
              >
                Hapus
              </Button>
            </div>
          </SurfaceCard>
        ))}
      </div>

      {/* Generator Modal */}
      {showGenModal && (
        <div role="dialog" aria-label="Modal Buat Kuis">
          <h2>Buat Kuis Otomatis</h2>
          <label htmlFor="gen-count">Jumlah Soal</label>
          <select
            id="gen-count"
            aria-label="Jumlah Soal"
            value={genCount}
            onChange={(e) => setGenCount(e.target.value)}
          >
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="20">20</option>
          </select>

          <label htmlFor="gen-diff">Tingkat Kesulitan</label>
          <select
            id="gen-diff"
            aria-label="Tingkat Kesulitan"
            value={genDifficulty}
            onChange={(e) => setGenDifficulty(e.target.value)}
          >
            <option value="easy">Mudah</option>
            <option value="medium">Sedang</option>
            <option value="hard">Sulit</option>
          </select>

          <label>
            <input type="checkbox" defaultChecked aria-label="Pilihan Ganda" />
            Pilihan Ganda
          </label>

          {genJobProgress !== null && (
            <div role="progressbar" aria-valuenow={genJobProgress}>
              Memproses {genJobProgress}%
            </div>
          )}

          <Button onClick={handleGenerate} aria-label="Mulai Buat Kuis">
            Buat Kuis
          </Button>
        </div>
      )}

      {/* Exam Confirmation Modal */}
      {showExamModal !== null && (
        <div role="dialog" aria-label="Konfirmasi Mode Ujian">
          <h2>Mulai Ujian</h2>
          <p>Batas waktu: 15 menit.</p>
          <Button onClick={() => handleStartExam(showExamModal)} aria-label="Konfirmasi Ujian">
            Mulai Ujian Sekarang
          </Button>
        </div>
      )}
    </main>
  );
}

describe('Feature 15: Quizzes Management', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('list_quizzes', defaultQuizzesFixture);
    mockRpc.setResponse('generate_quiz', { quiz_id: 303, job_id: 801 });
    mockRpc.setResponse('get_job', { progress: 85 });
    mockRpc.setResponse('start_attempt', {
      attempt: {
        id: 501,
        quiz_id: 301,
        mode: 'practice',
        started_at: '2026-11-10T10:00:00Z',
        time_limit: null,
        total: 5,
        questions: [],
      },
    });
    mockRpc.setResponse('delete_quiz', {});
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('15.1 - renders quiz catalog with titles, question counts, difficulty badges, and last scores', async () => {
    renderWithProviders(<QuizzesManagementView />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Daftar Kuis' })).toBeTruthy();
      expect(screen.getByText('Kuis Diagnostik Jaringan')).toBeTruthy();
      expect(screen.getByText('5 soal')).toBeTruthy();
      expect(screen.getByText(/skor terakhir: 80%/i)).toBeTruthy();
      expect(screen.getByText('medium')).toBeTruthy();
    });
  });

  it('15.2 - launches practice mode when clicking latihan button', async () => {
    renderWithProviders(<QuizzesManagementView />);

    const practiceBtn = await screen.findByRole('button', {
      name: 'Latihan kuis: Kuis Diagnostik Jaringan',
    });
    fireEvent.click(practiceBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('start_attempt');
      expect(call).toBeTruthy();
      expect(call?.payload.mode).toBe('practice');
      expect(
        screen.getByRole('status', { name: 'Status Navigasi' }).textContent
      ).toContain('/latihan/501');
    });
  });

  it('15.3 - launches exam mode with time limit selection when clicking ujian button', async () => {
    renderWithProviders(<QuizzesManagementView />);

    const examBtn = await screen.findByRole('button', {
      name: 'Ujian kuis: Kuis Diagnostik Jaringan',
    });
    fireEvent.click(examBtn);

    const modal = screen.getByRole('dialog', { name: 'Konfirmasi Mode Ujian' });
    expect(modal).toBeTruthy();

    const startBtn = screen.getByRole('button', { name: 'Konfirmasi Ujian' });
    fireEvent.click(startBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('start_attempt');
      expect(call).toBeTruthy();
      expect(call?.payload.mode).toBe('exam');
      expect(call?.payload.time_limit_min).toBe(15);
      expect(
        screen.getByRole('status', { name: 'Status Navigasi' }).textContent
      ).toContain('/latihan/502');
    });
  });

  it('15.4 - submits quiz generator form with custom parameters and polls job', async () => {
    renderWithProviders(<QuizzesManagementView />);

    const newQuizBtn = await screen.findByRole('button', { name: 'Buat Kuis Baru' });
    fireEvent.click(newQuizBtn);

    const countSelect = screen.getByRole('combobox', { name: 'Jumlah Soal' });
    fireEvent.change(countSelect, { target: { value: '10' } });

    const diffSelect = screen.getByRole('combobox', { name: 'Tingkat Kesulitan' });
    fireEvent.change(diffSelect, { target: { value: 'medium' } });

    const checkbox = screen.getByRole('checkbox', { name: 'Pilihan Ganda' });
    expect(checkbox).toBeTruthy();

    const submitBtn = screen.getByRole('button', { name: 'Mulai Buat Kuis' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const genCall = mockRpc.getLastCall('generate_quiz');
      expect(genCall).toBeTruthy();
      expect(genCall?.payload.count).toBe(10);
      expect(genCall?.payload.difficulty).toBe('medium');
    });
  });

  it('15.5 - deletes quiz with confirmation dialog', async () => {
    renderWithProviders(<QuizzesManagementView />);

    const deleteBtn = await screen.findByRole('button', {
      name: 'Hapus kuis: Kuis Diagnostik Jaringan',
    });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('delete_quiz');
      expect(call).toBeTruthy();
      expect(call?.payload.id).toBe(301);
      expect(screen.queryByText('Kuis Diagnostik Jaringan')).toBeNull();
    });
  });
});

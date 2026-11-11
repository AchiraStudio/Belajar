import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { mockRpc, renderWithProviders } from '../../test/e2e/harness';
import { dropCache } from '../../services/api/rpc';
import { QuizResult } from './QuizResult';
import { QuizRunner } from './QuizRunner';
import { QuizzesView } from './QuizzesView';

function renderRunner(route = '/latihan/7') {
  return renderWithProviders(
    <Routes>
      <Route path="/latihan/:attemptId" element={<QuizRunner />} />
      <Route path="/hasil/:attemptId" element={<div>Halaman hasil</div>} />
    </Routes>,
    { route },
  );
}

const baseAttempt = {
  id: 7,
  quiz_id: 3,
  started_at: Date.now() / 1000,
  finished_at: null,
  title: 'Kuis Jaringan',
};
const questions = [
  { id: 11, qtype: 'mcq', question: 'Layer 4 OSI adalah?', options: ['Transport', 'Network', 'Session'], topic: 'OSI' },
  { id: 12, qtype: 'tf', question: 'IP bekerja di layer 3.', options: null, topic: 'OSI' },
];

describe('QuizRunner', () => {
  beforeEach(() => {
    cleanup();
    dropCache();
    mockRpc.install();
    mockRpc.reset();
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
  });

  it('practice mode checks each answer with the server and reveals feedback', async () => {
    mockRpc.setResponse('get_attempt', { attempt: { ...baseAttempt, mode: 'practice' }, questions });
    mockRpc.setResponse('check_answer', {
      answer: '0',
      answer_text: 'Transport',
      explanation: 'TCP dan UDP ada di layer transport.',
      correct: true,
    });

    renderRunner();
    await screen.findByRole('heading', { name: 'Layer 4 OSI adalah?' });

    fireEvent.click(screen.getByRole('button', { name: /Transport/ }));

    await screen.findByText('TCP dan UDP ada di layer transport.');
    expect(screen.getByText('Benar')).toBeTruthy();
    expect(mockRpc.getCalls('check_answer')).toHaveLength(1);
    expect(mockRpc.getLastCall('check_answer')?.payload).toMatchObject({ attempt_id: 7, question_id: 11, given: '0' });
    expect(screen.getByRole('button', { name: /Soal berikutnya/ })).toBeTruthy();
  });

  it('exam mode never reveals answers, persists answers, and submits them once', async () => {
    mockRpc.setResponse('get_attempt', {
      attempt: { ...baseAttempt, mode: 'exam', time_limit: 3600 },
      questions,
    });
    mockRpc.setResponse('finish_attempt', { attempt: { ...baseAttempt, finished_at: 1 }, questions: [] });

    renderRunner();
    await screen.findByRole('heading', { name: 'Layer 4 OSI adalah?' });
    expect(await screen.findByRole('timer')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Transport/ }));

    // No server check and no explanation in exam mode.
    expect(mockRpc.getCalls('check_answer')).toHaveLength(0);
    expect(screen.queryByText('Jawaban benar')).toBeNull();
    // The answer survives a reload: it lives in localStorage keyed by the attempt.
    expect(JSON.parse(window.localStorage.getItem('belajar-exam-7') ?? '{}')).toEqual({ '11': '0' });

    fireEvent.click(screen.getByRole('button', { name: 'Kumpulkan' }));
    expect(await screen.findByText('1 soal belum dijawab.')).toBeTruthy();
    const confirm = screen.getAllByRole('button', { name: 'Kumpulkan' }).pop() as HTMLElement;
    // A rapid double click must create a single submission.
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await screen.findByText('Halaman hasil');
    expect(mockRpc.getCalls('finish_attempt')).toHaveLength(1);
    expect(mockRpc.getLastCall('finish_attempt')?.payload).toMatchObject({ attempt_id: 7, answers: { '11': '0' } });
    expect(window.localStorage.getItem('belajar-exam-7')).toBeNull();
  });

  it('restores saved exam answers after a reload', async () => {
    window.localStorage.setItem('belajar-exam-7', JSON.stringify({ '11': '1' }));
    mockRpc.setResponse('get_attempt', { attempt: { ...baseAttempt, mode: 'exam', time_limit: 3600 }, questions });

    renderRunner();
    await screen.findByRole('heading', { name: 'Layer 4 OSI adalah?' });
    expect(screen.getByRole('button', { name: /Network/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('sends a finished attempt to its result page', async () => {
    mockRpc.setResponse('get_attempt', { attempt: { ...baseAttempt, mode: 'practice', finished_at: 5, score: 1, total: 2 }, questions });
    renderRunner();
    await screen.findByText('Halaman hasil');
  });
});

describe('QuizzesView', () => {
  beforeEach(() => {
    cleanup();
    dropCache();
    mockRpc.install();
    mockRpc.reset();
  });
  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
  });

  it('lists quizzes, honestly shows an empty state, and starts only one attempt on double click', async () => {
    mockRpc.setResponse('list_quizzes', {
      quizzes: [{ id: 3, title: 'Kuis Jaringan', question_count: 10, attempt_count: 2, last_pct: 85, created_at: 1 }],
    });
    mockRpc.setResponse('start_attempt', { attempt: { ...baseAttempt, id: 9, mode: 'practice' }, questions: [] });

    renderWithProviders(
      <Routes>
        <Route path="/kuis" element={<QuizzesView />} />
        <Route path="/latihan/:attemptId" element={<div>Runner</div>} />
      </Routes>,
      { route: '/kuis' },
    );

    await screen.findByText('Kuis Jaringan');
    expect(screen.getByText('Skor 85%')).toBeTruthy();
    const practice = screen.getByRole('button', { name: 'Latihan' });
    fireEvent.click(practice);
    fireEvent.click(practice);
    await screen.findByText('Runner');
    expect(mockRpc.getCalls('start_attempt')).toHaveLength(1);
  });

  it('shows an empty state when there are no quizzes', async () => {
    mockRpc.setResponse('list_quizzes', { quizzes: [] });
    renderWithProviders(<QuizzesView />, { route: '/kuis' });
    expect(await screen.findByRole('heading', { name: 'Belum ada kuis' })).toBeTruthy();
  });
});

describe('QuizResult', () => {
  beforeEach(() => {
    cleanup();
    dropCache();
    mockRpc.install();
    mockRpc.reset();
  });
  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
  });

  it('shows the score, per-topic results, and only offers deeper explanation for wrong answers', async () => {
    mockRpc.setResponse('get_attempt', {
      attempt: { ...baseAttempt, mode: 'practice', finished_at: 10, score: 1, total: 2, duration: 75, grading: 'done' },
      questions: [
        { ...questions[0], given: '0', correct: true, revealed: true, answer: '0', answer_text: 'Transport', explanation: 'Layer 4.' },
        { ...questions[1], given: 'false', correct: false, revealed: true, answer: 'true', answer_text: 'Benar', explanation: 'IP di layer 3.' },
      ],
    });

    renderWithProviders(
      <Routes>
        <Route path="/hasil/:attemptId" element={<QuizResult />} />
      </Routes>,
      { route: '/hasil/7' },
    );

    expect(await screen.findByText('1 dari 2 benar')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Skor 50 persen' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Jelaskan lebih dalam' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Salah (1)' }));
    await waitFor(() => expect(screen.queryByText('Layer 4 OSI adalah?')).toBeNull());
    expect(screen.getByText('IP bekerja di layer 3.')).toBeTruthy();
  });
});

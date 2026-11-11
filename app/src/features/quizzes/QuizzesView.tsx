import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  PageHeader,
  Skeleton,
  SurfaceCard,
  useToast,
} from '../../components/ui';
import { errorMessage, useRpcQuery } from '../../hooks/useRpcQuery';
import { dropCache, rpcCall } from '../../services/api/rpc';
import type { AttemptResponse, QuizSummary } from './types';
import styles from './Quizzes.module.css';

export function scoreTone(pct: number): 'good' | 'mid' | 'bad' {
  return pct >= 80 ? 'good' : pct >= 60 ? 'mid' : 'bad';
}

function relativeDay(ts?: number | null): string {
  if (!ts) return '';
  const days = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (days <= 0) return 'hari ini';
  if (days === 1) return 'kemarin';
  if (days < 30) return `${days} hari lalu`;
  return new Date(ts * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function QuizzesView() {
  const { data, loading, error, reload } = useRpcQuery<{ quizzes: QuizSummary[] }>('list_quizzes');
  const navigate = useNavigate();
  const toast = useToast();
  const [examFor, setExamFor] = useState<QuizSummary | null>(null);
  const [minutes, setMinutes] = useState('');
  const [deleteFor, setDeleteFor] = useState<QuizSummary | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const start = async (quiz: QuizSummary, mode: 'practice' | 'exam', limit?: number) => {
    if (busy !== null) return; // guards against double-clicks creating two attempts
    setBusy(quiz.id);
    try {
      const res = await rpcCall<AttemptResponse>('start_attempt', {
        quiz_id: quiz.id,
        mode,
        time_limit_min: limit,
        shuffle: mode === 'exam',
      });
      navigate(`/latihan/${res.attempt.id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal memulai kuis.'));
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteFor) return;
    try {
      await rpcCall('delete_quiz', { id: deleteFor.id });
      dropCache();
      toast.success('Kuis dihapus');
      setDeleteFor(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menghapus kuis.'));
    }
  };

  const quizzes = data?.quizzes ?? [];

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Belajar"
        title="Kuis"
        description="Uji pemahamanmu. Mode latihan memberi umpan balik langsung; mode ujian memakai timer dan baru menilai setelah dikumpulkan."
        actions={
          <Link to="/soal-lemah" className={styles.linkButton}>
            <Icon name="target" size={16} />
            Soal lemah
          </Link>
        }
      />

      {loading && !data && (
        <div className={styles.list} aria-busy="true" aria-label="Memuat daftar kuis">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height="76px" borderRadius="16px" />
          ))}
        </div>
      )}

      {error && !data && <ErrorState message={error} onRetry={reload} />}

      {data && quizzes.length === 0 && (
        <EmptyState
          icon="quiz"
          title="Belum ada kuis"
          description="Buka salah satu materi lalu buat kuis dari tab Kuis. Kuis gabungan per mata pelajaran juga akan muncul di sini."
          actionLabel="Pilih materi"
          onAction={() => navigate('/materi')}
        />
      )}

      {quizzes.length > 0 && (
        <ul className={styles.list}>
          {quizzes.map((quiz) => {
            const showSource = quiz.source_title && !quiz.title.includes(quiz.source_title);
            const meta = [
              `${quiz.question_count} soal`,
              quiz.attempt_count ? `${quiz.attempt_count}× dikerjakan` : 'belum dikerjakan',
              showSource ? quiz.source_title : null,
              relativeDay(quiz.created_at),
            ].filter(Boolean);
            return (
              <li key={quiz.id}>
                <SurfaceCard className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{quiz.title}</div>
                    <div className={styles.rowMeta}>{meta.join(' · ')}</div>
                  </div>
                  {quiz.last_pct != null && (
                    <span
                      className={`${styles.pill} ${styles[`pill_${scoreTone(quiz.last_pct)}`]}`}
                      title="Skor terakhir"
                    >
                      Skor {Math.round(quiz.last_pct)}%
                    </span>
                  )}
                  <div className={styles.rowActions}>
                    <Button size="sm" loading={busy === quiz.id} onClick={() => start(quiz, 'practice')}>
                      Latihan
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => {
                        setMinutes(String(Math.max(1, quiz.question_count)));
                        setExamFor(quiz);
                      }}
                    >
                      Ujian
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      aria-label={`Hapus ${quiz.title}`}
                      title="Hapus kuis"
                      onClick={() => setDeleteFor(quiz)}
                    />
                  </div>
                </SurfaceCard>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={examFor !== null}
        onClose={() => setExamFor(null)}
        title="Mulai ujian"
        description="Jawaban tidak diperiksa sampai dikumpulkan. Kuis otomatis dikumpulkan saat waktu habis."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExamFor(null)}>
              Batal
            </Button>
            <Button
              onClick={() => {
                if (!examFor) return;
                const limit = Math.max(1, Math.min(240, parseInt(minutes, 10) || examFor.question_count));
                const quiz = examFor;
                setExamFor(null);
                void start(quiz, 'exam', limit);
              }}
            >
              Mulai
            </Button>
          </>
        }
      >
        <Input
          label="Batas waktu (menit)"
          type="number"
          min={1}
          max={240}
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          hint="Antara 1 dan 240 menit."
          data-autofocus
        />
      </Dialog>

      <Dialog
        open={deleteFor !== null}
        onClose={() => setDeleteFor(null)}
        title="Hapus kuis ini?"
        description="Soal dan riwayat pengerjaannya ikut terhapus. Tindakan ini tidak bisa dibatalkan."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteFor(null)}>
              Batal
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              Hapus
            </Button>
          </>
        }
      >
        <p className={styles.deleteName}>{deleteFor?.title}</p>
      </Dialog>
    </div>
  );
}

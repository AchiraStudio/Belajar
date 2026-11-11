import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  EmptyState,
  Icon,
  Input,
  ProgressBar,
  Select,
  SurfaceCard,
  useToast,
} from '../../components/ui';
import { errorMessage, isUnavailableMessage } from '../../hooks/useRpcQuery';
import { pollJob } from '../../services/api/jobs';
import { dropCache, rpcCall } from '../../services/api/rpc';
import { scoreTone } from './QuizzesView';
import { useStartAttempt } from './useStartAttempt';
import styles from './Quizzes.module.css';

export interface MaterialQuiz {
  id: number;
  title: string;
  question_count: number;
  best_pct?: number | null;
  difficulty?: string;
}

interface Props {
  documentId: number;
  quizzes: MaterialQuiz[];
  /** Quizzes can only be generated once the notes are ready. */
  canGenerate: boolean;
  onChanged: () => void;
}

const TYPES = [
  { value: 'mcq', label: 'Pilihan ganda', on: true },
  { value: 'tf', label: 'Benar atau salah', on: true },
  { value: 'short', label: 'Isian singkat', on: false },
];

export function MaterialQuizzes({ documentId, quizzes, canGenerate, onChanged }: Props) {
  const toast = useToast();
  const { start, busy } = useStartAttempt();
  const [genOpen, setGenOpen] = useState(false);
  const [examFor, setExamFor] = useState<MaterialQuiz | null>(null);
  const [minutes, setMinutes] = useState('');

  return (
    <div className={styles.materialTab}>
      <div className={styles.materialHead}>
        <h2 className={styles.sectionTitle}>Kuis materi ({quizzes.length})</h2>
        <Button icon="sparkles" disabled={!canGenerate} onClick={() => setGenOpen(true)}>
          Buat kuis
        </Button>
      </div>
      {!canGenerate && <p className={styles.dialogText}>Tunggu pemrosesan materi selesai sebelum membuat kuis.</p>}

      {quizzes.length === 0 ? (
        <EmptyState
          icon="quiz"
          title="Belum ada kuis untuk materi ini"
          description="AI menyusun soal merata dari seluruh isi materi, lengkap dengan sumber dan penjelasan."
        />
      ) : (
        <ul className={styles.list}>
          {quizzes.map((q) => (
            <li key={q.id}>
              <SurfaceCard className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>{q.title}</div>
                  <div className={styles.rowMeta}>
                    {q.question_count} soal{q.difficulty ? ` · ${q.difficulty}` : ''}
                  </div>
                </div>
                {q.best_pct != null && (
                  <span className={`${styles.pill} ${styles[`pill_${scoreTone(q.best_pct)}`]}`} title="Skor terbaik">
                    Terbaik {Math.round(q.best_pct)}%
                  </span>
                )}
                <div className={styles.rowActions}>
                  <Button size="sm" loading={busy === q.id} onClick={() => void start(q.id, 'practice')}>
                    Latihan
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => {
                      setMinutes(String(Math.max(1, q.question_count)));
                      setExamFor(q);
                    }}
                  >
                    Ujian
                  </Button>
                </div>
              </SurfaceCard>
            </li>
          ))}
        </ul>
      )}

      <GenerateDialog
        open={genOpen}
        documentId={documentId}
        onClose={() => setGenOpen(false)}
        onDone={(n, requested) => {
          setGenOpen(false);
          dropCache();
          onChanged();
          if (n < requested) toast.info(`Terbentuk ${n} dari ${requested} soal (sisanya duplikat atau tidak valid).`);
          else toast.success('Kuis siap dikerjakan');
        }}
      />

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
                void start(quiz.id, 'exam', limit);
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
          data-autofocus
        />
      </Dialog>
    </div>
  );
}

function GenerateDialog({
  open,
  documentId,
  onClose,
  onDone,
}: {
  open: boolean;
  documentId: number;
  onClose: () => void;
  onDone: (count: number, requested: number) => void;
}) {
  const [count, setCount] = useState('10');
  const [difficulty, setDifficulty] = useState('mixed');
  const [quality, setQuality] = useState('normal');
  const [types, setTypes] = useState<string[]>(TYPES.filter((t) => t.on).map((t) => t.value));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; message: string } | null>(null);
  const [failure, setFailure] = useState<{ text: string; unavailable: boolean } | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const submit = async () => {
    if (busy) return;
    if (types.length === 0) {
      setFailure({ text: 'Pilih minimal satu jenis soal.', unavailable: false });
      return;
    }
    setBusy(true);
    setFailure(null);
    abort.current = new AbortController();
    try {
      const { job_id } = await rpcCall<{ job_id: number }>('generate_quiz', {
        document_id: documentId,
        count: Number(count),
        difficulty,
        quality,
        types,
      });
      setProgress({ pct: 3, message: 'Menyusun soal…' });
      const job = await pollJob<{ count: number; requested: number }>(job_id, {
        signal: abort.current.signal,
        onUpdate: (j) => setProgress({ pct: Math.max(3, j.progress ?? 3), message: j.message || 'Menyusun soal…' }),
      });
      if (!job) return;
      if (job.status === 'failed') throw new Error(job.error || 'Gagal membuat kuis.');
      onDone(job.result?.count ?? Number(count), job.result?.requested ?? Number(count));
    } catch (err) {
      const text = errorMessage(err, 'Gagal membuat kuis.');
      setFailure({ text, unavailable: isUnavailableMessage(text) });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        abort.current?.abort();
        onClose();
      }}
      title="Buat kuis dari materi"
      description="AI menyusun soal dari isi catatan. Proses berjalan di server, jadi dialog ini boleh ditutup."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {busy ? 'Tutup' : 'Batal'}
          </Button>
          <Button icon="sparkles" loading={busy} onClick={submit}>
            Buat kuis
          </Button>
        </>
      }
    >
      <div className={styles.genForm}>
        <div className={styles.genTwo}>
          <Select
            label="Jumlah soal"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            options={[5, 10, 15, 20, 30].map((n) => ({ value: n, label: `${n} soal` }))}
          />
          <Select
            label="Tingkat kesulitan"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            options={[
              { value: 'mixed', label: 'Campuran' },
              { value: 'easy', label: 'Mudah' },
              { value: 'medium', label: 'Sedang' },
              { value: 'hard', label: 'Sulit' },
            ]}
          />
        </div>
        <fieldset className={styles.genTypes}>
          <legend>Jenis soal</legend>
          {TYPES.map((t) => (
            <label key={t.value} className={styles.genCheck}>
              <input
                type="checkbox"
                checked={types.includes(t.value)}
                onChange={(e) => setTypes((prev) => (e.target.checked ? [...prev, t.value] : prev.filter((x) => x !== t.value)))}
              />
              {t.label}
            </label>
          ))}
        </fieldset>
        <Select
          label="Kualitas"
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
          hint="Mode teliti membuat AI berpikir lebih lama: lebih lambat, soalnya biasanya lebih tajam."
          options={[
            { value: 'normal', label: 'Cepat' },
            { value: 'high', label: 'Teliti (lebih lama)' },
          ]}
        />
        {progress && (
          <div role="status" className={styles.genProgress}>
            <span>{progress.message}</span>
            <ProgressBar value={progress.pct} label="Kemajuan pembuatan kuis" showValue />
          </div>
        )}
        {failure && (
          <div className={failure.unavailable ? styles.alertInfo : styles.alertError} role="alert">
            <Icon name={failure.unavailable ? 'info' : 'alert-circle'} size={18} />
            <div>
              <strong>{failure.unavailable ? 'Pembuatan kuis belum tersedia' : 'Gagal membuat kuis'}</strong>
              <p>{failure.text}</p>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Button,
  Dialog,
  ErrorState,
  Icon,
  Skeleton,
  useToast,
} from '../../components/ui';
import { errorMessage, useRpcQuery } from '../../hooks/useRpcQuery';
import { dropCache, rpcCall } from '../../services/api/rpc';
import type { AttemptQuestion, AttemptResponse } from './types';
import { formatClock, useActiveClock } from './useActiveClock';
import styles from './Quizzes.module.css';
import { tr } from '../../services/i18n';

const examKey = (id: number) => `stuby-exam-${id}`;

function loadExamAnswers(id: number): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(examKey(id));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveExamAnswers(id: number, answers: Record<string, string>) {
  try {
    window.localStorage.setItem(examKey(id), JSON.stringify(answers));
  } catch {
    /* storage unavailable: answers stay in memory for this session */
  }
}

function clearExamAnswers(id: number) {
  try {
    window.localStorage.removeItem(examKey(id));
  } catch {
    /* ignore */
  }
}

export function QuizRunner() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const id = Number(attemptId);
  const { data, loading, error, reload } = useRpcQuery<AttemptResponse>('get_attempt', { attempt_id: id }, Number.isFinite(id));
  const navigate = useNavigate();

  useEffect(() => {
    if (data?.attempt.finished_at) navigate(`/hasil/${id}`, { replace: true });
  }, [data, id, navigate]);

  if (!Number.isFinite(id)) {
    return <ErrorState title={tr('Kuis tidak ditemukan')} message={tr('Alamat kuis tidak valid.')} onRetry={() => navigate('/kuis')} retryLabel={tr('Ke daftar kuis')} />;
  }
  if (loading && !data) {
    return (
      <div className={styles.runner} aria-busy="true" aria-label={tr('Memuat soal')}>
        <Skeleton height="14px" borderRadius="8px" />
        <Skeleton height="120px" borderRadius="16px" />
        <Skeleton height="220px" borderRadius="16px" />
      </div>
    );
  }
  if (error || !data) {
    return <ErrorState message={error ?? tr('Kuis tidak ditemukan.')} onRetry={reload} />;
  }
  if (data.attempt.finished_at) return null;

  return <RunnerBody key={id} attemptId={id} initial={data} />;
}

function RunnerBody({ attemptId, initial }: { attemptId: number; initial: AttemptResponse }) {
  const navigate = useNavigate();
  const toast = useToast();
  const getActiveSeconds = useActiveClock();
  const { attempt } = initial;
  const exam = attempt.mode === 'exam';

  const [questions, setQuestions] = useState<AttemptQuestion[]>(initial.questions);
  const [answers, setAnswers] = useState<Record<string, string>>(() => (exam ? loadExamAnswers(attemptId) : {}));
  const [index, setIndex] = useState(() => {
    if (exam) return 0;
    const firstOpen = initial.questions.findIndex((q) => !q.revealed);
    return Math.max(0, firstOpen);
  });
  const [checking, setChecking] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [shortValue, setShortValue] = useState('');
  const finishRef = useRef(false);

  const total = questions.length;
  const question = questions[index] as AttemptQuestion;
  const isLast = index === total - 1;

  const isAnswered = useCallback(
    (q: AttemptQuestion) => (exam ? (answers[q.id] ?? '') !== '' : Boolean(q.revealed)),
    [exam, answers],
  );
  const answeredCount = useMemo(() => questions.filter(isAnswered).length, [questions, isAnswered]);

  // Short-answer draft follows the current question.
  useEffect(() => {
    setShortValue(exam ? (answers[question.id] ?? '') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, exam]);

  const finish = useCallback(
    async (auto = false) => {
      if (finishRef.current) return; // idempotent: timer expiry and a click may race
      finishRef.current = true;
      setFinishing(true);
      try {
        await rpcCall('finish_attempt', {
          attempt_id: attemptId,
          answers: exam ? answers : {},
          duration: getActiveSeconds(),
        });
        clearExamAnswers(attemptId);
        dropCache();
        if (auto) toast.info(tr('Waktu habis. Jawaban dikumpulkan otomatis.'));
        navigate(`/hasil/${attemptId}`, { replace: true });
      } catch (err) {
        finishRef.current = false;
        setFinishing(false);
        toast.error(errorMessage(err, tr('Gagal mengumpulkan jawaban.')));
      }
    },
    [attemptId, exam, answers, getActiveSeconds, navigate, toast],
  );

  // ----- exam timer (derived from server timestamps, so a reload never resets it)
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!exam || !attempt.time_limit || !attempt.started_at) return;
    const tick = () => {
      const remaining = Math.max(0, Math.round(attempt.time_limit! - (Date.now() / 1000 - attempt.started_at!)));
      setLeft(remaining);
      if (remaining === 0) void finish(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [exam, attempt.time_limit, attempt.started_at, finish]);

  const choose = async (value: string) => {
    if (exam) {
      const next = { ...answers, [question.id]: value };
      setAnswers(next);
      saveExamAnswers(attemptId, next);
      return;
    }
    if (checking || question.revealed) return;
    setChecking(true);
    try {
      const res = await rpcCall<Partial<AttemptQuestion>>('check_answer', {
        attempt_id: attemptId,
        question_id: question.id,
        given: value,
      });
      setQuestions((prev) => prev.map((q) => (q.id === question.id ? { ...q, ...res, given: value, revealed: true } : q)));
    } catch (err) {
      toast.error(errorMessage(err, tr('Gagal memeriksa jawaban.')));
    } finally {
      setChecking(false);
    }
  };

  // keyboard: A-D / 1-4 to choose, Enter to advance after feedback
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, textarea, select, [role="dialog"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'enter' && !exam && question.revealed) {
        e.preventDefault();
        if (isLast) void finish();
        else setIndex((i) => i + 1);
        return;
      }
      if (question.qtype === 'short' || (!exam && question.revealed)) return;
      const n = 'abcd'.indexOf(key) >= 0 ? 'abcd'.indexOf(key) : '1234'.indexOf(key);
      if (n < 0) return;
      const count = question.qtype === 'mcq' ? (question.options?.length ?? 0) : 2;
      if (n >= count) return;
      e.preventDefault();
      void choose(question.qtype === 'mcq' ? String(n) : n === 0 ? 'true' : 'false');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const options: { value: string; label: string }[] =
    question.qtype === 'mcq'
      ? (question.options ?? []).map((label, i) => ({ value: String(i), label }))
      : question.qtype === 'tf'
        ? [
            { value: 'true', label: 'Benar' },
            { value: 'false', label: 'Salah' },
          ]
        : [];

  const current = exam ? answers[question.id] : question.given;
  const revealed = !exam && Boolean(question.revealed);
  const blank = total - answeredCount;

  const leave = () => {
    if (answeredCount > 0) setConfirmLeave(true);
    else navigate('/kuis');
  };

  return (
    <div className={styles.runner}>
      <div className={styles.runnerTop}>
        <Button size="sm" variant="ghost" icon="x" onClick={leave}>
          {tr('Keluar')}
        </Button>
        <span className={styles.runnerTitle}>{attempt.title}</span>
        {exam && left !== null ? (
          <span className={`${styles.clock} ${left <= 60 ? styles.clockLow : ''}`} role="timer" aria-label={tr('Sisa waktu {a}', { a: formatClock(left) })}>
            <Icon name="clock" size={16} />
            {formatClock(left)}
          </span>
        ) : (
          <span className={styles.modeTag}>{attempt.mode === 'review' ? tr('Ulangi soal lemah') : exam ? tr('Ujian') : tr('Latihan')}</span>
        )}
      </div>

      <div className={styles.segs} role={exam ? 'group' : 'img'} aria-label={exam ? tr('Loncat ke soal') : tr('Soal {a} dari {b}', { a: index + 1, b: total })}>
        {questions.map((q, i) => {
          const state =
            i === index
              ? styles.segCur
              : !exam && q.revealed
                ? q.correct === true
                  ? styles.segOk
                  : q.correct === false
                    ? styles.segNo
                    : styles.segAns
                : exam && isAnswered(q)
                  ? styles.segAns
                  : '';
          return exam ? (
            <button
              key={q.id}
              type="button"
              className={`${styles.seg} ${state}`}
              aria-label={tr('Soal {a}{b}', { a: i + 1, b: isAnswered(q) ? tr(', sudah dijawab') : '' })}
              aria-current={i === index}
              onClick={() => setIndex(i)}
            />
          ) : (
            <span key={q.id} className={`${styles.seg} ${state}`} />
          );
        })}
      </div>

      <section className={styles.questionCard} aria-labelledby="q-text">
        <div className={styles.qMeta}>
          <span>
            {tr('Soal {a} dari {b}', { a: index + 1, b: total })}
          </span>
          {question.topic && <span className={styles.topicTag}>{question.topic}</span>}
        </div>
        <h1 id="q-text" className={styles.qText}>
          {question.question}
        </h1>

        {options.length > 0 ? (
          <div className={styles.options} role="group" aria-label={tr('Pilihan jawaban')}>
            {options.map((opt, i) => {
              const isChosen = current === opt.value;
              const ok = revealed && question.answer === opt.value;
              const no = revealed && isChosen && question.answer !== opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={revealed || checking}
                  aria-pressed={isChosen}
                  className={`${styles.option} ${isChosen ? styles.optionChosen : ''} ${ok ? styles.optionOk : ''} ${no ? styles.optionNo : ''}`}
                  onClick={() => void choose(opt.value)}
                >
                  <span className={styles.optionKey} aria-hidden="true">
                    {ok ? <Icon name="check" size={16} /> : no ? <Icon name="x" size={16} /> : String.fromCharCode(65 + i)}
                  </span>
                  <span className={styles.optionLabel}>{opt.label}</span>
                  {ok && <span className={`${styles.optionNote} ${styles.noteOk}`}>{tr('Jawaban benar')}</span>}
                  {no && <span className={`${styles.optionNote} ${styles.noteNo}`}>{tr('Jawabanmu')}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <form
            className={styles.shortForm}
            onSubmit={(e) => {
              e.preventDefault();
              const value = shortValue.trim();
              if (!value) return;
              if (!exam && !revealed) void choose(value);
            }}
          >
            <input
              className={styles.shortInput}
              type="text"
              aria-label={tr('Jawabanmu')}
              placeholder={tr('Ketik jawabanmu')}
              autoComplete="off"
              maxLength={300}
              disabled={revealed}
              value={shortValue}
              autoFocus={!exam && !revealed}
              onChange={(e) => {
                setShortValue(e.target.value);
                if (exam) {
                  const next = { ...answers, [question.id]: e.target.value };
                  setAnswers(next);
                  saveExamAnswers(attemptId, next);
                }
              }}
            />
            {!exam && !revealed && (
              <Button type="submit" loading={checking} disabled={!shortValue.trim()}>
                {tr('Periksa')}
              </Button>
            )}
          </form>
        )}

        {revealed && (
          <div
            className={`${styles.feedback} ${question.correct === true ? styles.feedbackOk : question.correct === false ? styles.feedbackNo : ''}`}
            role="status"
          >
            <div className={styles.verdict}>
              {question.correct === true && <Icon name="check-circle" size={20} />}
              {question.correct === false && <Icon name="alert-circle" size={20} />}
              {question.correct === true ? tr('Benar') : question.correct === false ? tr('Belum tepat') : tr('Jawabanmu akan dinilai di akhir')}
            </div>
            {question.qtype === 'short' && (
              <p>
                {tr('Kunci jawaban:')}{' '}<strong>{question.answer_text}</strong>
              </p>
            )}
            {question.explanation && <p className={styles.why}>{question.explanation}</p>}
            {question.source && <p className={styles.source}>{tr('Sumber:')}{' '}{question.source}</p>}
          </div>
        )}
      </section>

      <div className={styles.runnerFoot}>
        {exam && index > 0 && (
          <Button variant="outline" icon="arrow-left" onClick={() => setIndex((i) => i - 1)}>
            {tr('Sebelumnya')}
          </Button>
        )}
        {exam && !isLast && (
          <Button variant="secondary" icon="arrow-right" iconPosition="right" onClick={() => setIndex((i) => i + 1)}>
            {tr('Berikutnya')}
          </Button>
        )}
        <span className={styles.spacer} />
        {exam && (
          <Button variant={isLast ? 'primary' : 'outline'} loading={finishing} onClick={() => setConfirmFinish(true)}>
            {tr('Kumpulkan')}
          </Button>
        )}
        {!exam && revealed && !isLast && (
          <Button size="lg" icon="arrow-right" iconPosition="right" onClick={() => setIndex((i) => i + 1)} autoFocus>
            {tr('Soal berikutnya')}
          </Button>
        )}
        {!exam && revealed && isLast && (
          <Button size="lg" loading={finishing} onClick={() => void finish()} autoFocus>
            {tr('Selesai dan lihat hasil')}
          </Button>
        )}
        {!exam && !revealed && options.length > 0 && (
          <span className={styles.keyHint}>
            {tr('Tekan')}{' '}<kbd>A</kbd>–<kbd>{question.qtype === 'mcq' ? 'D' : 'B'}</kbd>{' '}{tr('untuk memilih')}
          </span>
        )}
      </div>

      <Dialog
        open={confirmFinish}
        onClose={() => setConfirmFinish(false)}
        title={tr('Kumpulkan jawaban?')}
        description={blank ? tr('{a} soal belum dijawab.', { a: blank }) : tr('Semua soal sudah dijawab.')}
        size="sm"
        dismissible={!finishing}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmFinish(false)} disabled={finishing}>
              {tr('Lanjut mengerjakan')}
            </Button>
            <Button
              loading={finishing}
              onClick={() => {
                setConfirmFinish(false);
                void finish();
              }}
            >
              {tr('Kumpulkan')}
            </Button>
          </>
        }
      >
        <p className={styles.dialogText}>{tr('Setelah dikumpulkan, jawaban dinilai dan tidak bisa diubah.')}</p>
      </Dialog>

      <Dialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title={tr('Keluar dari kuis?')}
        description={
          exam
            ? tr('Jawabanmu tersimpan di perangkat ini dan waktu tetap berjalan.')
            : tr('Jawaban yang sudah diperiksa tersimpan. Kamu bisa melanjutkan nanti.')
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmLeave(false)}>
              {tr('Tetap di sini')}
            </Button>
            <Button variant="danger" onClick={() => navigate('/kuis')}>
              {tr('Keluar')}
            </Button>
          </>
        }
      >
        <p className={styles.dialogText}>{tr('Kamu bisa kembali kapan saja lewat daftar kuis.')}</p>
      </Dialog>
    </div>
  );
}

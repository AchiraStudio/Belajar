import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, ErrorState, Icon, Skeleton, StatusBadge, SurfaceCard, useToast } from '../../components/ui';
import { errorMessage, useRpcQuery } from '../../hooks/useRpcQuery';
import { pollJob } from '../../services/api/jobs';
import { dropCache, rpcCall } from '../../services/api/rpc';
import type { AttemptQuestion, AttemptResponse } from './types';
import { formatDuration } from './useActiveClock';
import { scoreTone } from './QuizzesView';
import styles from './Quizzes.module.css';
import { tr } from '../../services/i18n';

function givenLabel(q: AttemptQuestion): string {
  if (q.given == null || q.given === '') return tr('(tidak dijawab)');
  if (q.qtype === 'mcq') return q.given_text || q.given;
  if (q.qtype === 'tf') return q.given === 'true' ? 'Benar' : 'Salah';
  return q.given;
}

function ScoreRing({ pct }: { pct: number }) {
  const r = 62;
  const c = 2 * Math.PI * r;
  return (
    <div className={styles.ring} role="img" aria-label={`Skor ${pct} persen`}>
      <svg width="156" height="156" viewBox="0 0 156 156">
        <circle cx="78" cy="78" r={r} className={styles.ringTrack} />
        <circle
          cx="78"
          cy="78"
          r={r}
          className={`${styles.ringFill} ${styles[`ring_${scoreTone(pct)}`]}`}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          transform="rotate(-90 78 78)"
        />
      </svg>
      <span className={styles.ringText}>{pct}%</span>
    </div>
  );
}

export function QuizResult() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const id = Number(attemptId);
  const { data, loading, error, reload } = useRpcQuery<AttemptResponse>('get_attempt', { attempt_id: id }, Number.isFinite(id));
  const navigate = useNavigate();
  const toast = useToast();
  const [wrongOnly, setWrongOnly] = useState(false);
  const [starting, setStarting] = useState(false);
  const [deep, setDeep] = useState<Record<number, string>>({});
  const [deepBusy, setDeepBusy] = useState<number | null>(null);
  const aborter = useRef<AbortController | null>(null);

  useEffect(() => () => aborter.current?.abort(), []);

  // AI grading of short answers runs in a server job: refresh until it is no longer pending.
  const pending = data?.attempt.grading === 'pending';
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => reload(), 3000);
    return () => clearInterval(t);
  }, [pending, reload]);

  useEffect(() => {
    if (data && !data.attempt.finished_at) navigate(`/latihan/${id}`, { replace: true });
  }, [data, id, navigate]);

  const topics = useMemo(() => {
    const map = new Map<string, { topic: string; n: number; ok: number }>();
    for (const q of data?.questions ?? []) {
      if (q.correct == null) continue;
      const topic = q.topic || 'Umum';
      const e = map.get(topic) ?? { topic, n: 0, ok: 0 };
      e.n += 1;
      if (q.correct) e.ok += 1;
      map.set(topic, e);
    }
    return [...map.values()].map((t) => ({ ...t, acc: Math.round((100 * t.ok) / t.n) })).sort((a, b) => a.acc - b.acc);
  }, [data]);

  if (!Number.isFinite(id)) return <ErrorState message={tr('Alamat hasil tidak valid.')} onRetry={() => navigate('/kuis')} retryLabel={tr('Ke daftar kuis')} />;
  if (loading && !data) {
    return (
      <div className={styles.page} aria-busy="true" aria-label={tr('Memuat hasil')}>
        <Skeleton height="180px" borderRadius="20px" />
        <Skeleton height="260px" borderRadius="20px" />
      </div>
    );
  }
  if (error || !data) return <ErrorState message={error ?? tr('Hasil tidak ditemukan.')} onRetry={reload} />;

  const { attempt, questions } = data;
  const total = attempt.total ?? questions.length;
  const score = attempt.score ?? 0;
  const pct = total ? Math.round((100 * score) / total) : 0;
  const wrong = questions.filter((q) => q.correct === false).length;
  const shown = questions.map((q, i) => ({ q, i })).filter(({ q }) => !wrongOnly || q.correct === false);
  const message =
    pct >= 80 ? tr('Hasil yang bagus.') : pct >= 60 ? tr('Sudah cukup baik, masih bisa lebih kuat.') : tr('Perlu diulang. Mulai dari soal yang salah di bawah.');

  const retry = async () => {
    if (!attempt.quiz_id || starting) return;
    setStarting(true);
    try {
      const res = await rpcCall<AttemptResponse>('start_attempt', {
        quiz_id: attempt.quiz_id,
        mode: attempt.mode === 'exam' ? 'exam' : 'practice',
        shuffle: true,
      });
      dropCache();
      navigate(`/latihan/${res.attempt.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setStarting(false);
    }
  };

  const reviewWeak = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const res = await rpcCall<AttemptResponse>('start_review', { count: 10 });
      navigate(`/latihan/${res.attempt.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setStarting(false);
    }
  };

  const explainDeeper = async (q: AttemptQuestion) => {
    setDeepBusy(q.id);
    aborter.current = new AbortController();
    try {
      const res = await rpcCall<{ text?: string; cached?: boolean; job_id?: number }>('explain_question', {
        question_id: q.id,
        attempt_id: id,
      });
      let text = res.text ?? '';
      if (!res.cached && res.job_id != null) {
        const job = await pollJob<{ text?: string }>(res.job_id, { signal: aborter.current.signal });
        if (!job) return;
        if (job.status === 'failed') throw new Error(job.error || tr('Gagal membuat penjelasan.'));
        text = job.result?.text ?? text;
      }
      setDeep((prev) => ({ ...prev, [q.id]: text }));
    } catch (err) {
      toast.error(errorMessage(err, tr('Gagal membuat penjelasan.')));
    } finally {
      setDeepBusy(null);
    }
  };

  const modeLabel = attempt.mode === 'exam' ? 'Ujian' : attempt.mode === 'review' ? tr('Ulangi soal lemah') : 'Latihan';

  return (
    <div className={styles.page}>
      <Link to="/kuis" className={styles.back}>
        <Icon name="arrow-left" size={16} />
        {tr('Semua kuis')}
      </Link>
      <p className={styles.resultTitle}>{attempt.title}</p>

      <SurfaceCard className={styles.resultCard}>
        <ScoreRing pct={pct} />
        <div className={styles.resultBody}>
          <h1 className={styles.resultScore}>
            {tr('{a} dari {b} benar', { a: score, b: total })}
          </h1>
          <p className={styles.resultLead}>{pending ? tr('Jawaban isianmu sedang dinilai AI. Skor ini sementara.') : message}</p>
          <div className={styles.tagRow}>
            <StatusBadge status="success" label={tr('{a} benar', { a: score })} />
            <StatusBadge status="error" label={tr('{a} salah', { a: total - score })} />
            <span className={styles.modeTag}>
              <Icon name="clock" size={13} /> {formatDuration(attempt.duration)}
            </span>
            <span className={styles.modeTag}>{modeLabel}</span>
          </div>
          {pending && (
            <p className={styles.pendingNote} role="status">
              <Icon name="refresh" size={14} className="spin" />{' '}{tr('Menilai jawaban isian…')}
            </p>
          )}
          <div className={styles.resultActions}>
            {attempt.quiz_id != null && (
              <Button icon="refresh" loading={starting} onClick={retry}>
                {tr('Kerjakan lagi')}
              </Button>
            )}
            {wrong > 0 && (
              <Button variant="outline" onClick={reviewWeak} disabled={starting}>
                {tr('Ulangi soal lemah')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => navigate('/progres')}>
              {tr('Lihat progres')}
            </Button>
          </div>
        </div>
      </SurfaceCard>

      {topics.length > 1 && (
        <section aria-labelledby="by-topic">
          <h2 id="by-topic" className={styles.sectionTitle}>
            {tr('Hasil per topik')}
          </h2>
          <ul className={styles.topicList}>
            {topics.map((t) => (
              <li key={t.topic} className={styles.topicRow}>
                <span className={styles.topicName}>{t.topic}</span>
                <span className={styles.topicBar} aria-hidden="true">
                  <i className={styles[`bar_${scoreTone(t.acc)}`]} style={{ width: `${t.acc}%` }} />
                </span>
                <span className={styles.topicVal}>
                  {t.ok}/{t.n} · {t.acc}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="review">
        <div className={styles.sectionHead}>
          <h2 id="review" className={styles.sectionTitle}>
            {tr('Pembahasan')}
          </h2>
          {wrong > 0 && (
            <div className={styles.chips} role="group" aria-label={tr('Filter pembahasan')}>
              <button type="button" className={styles.chip} aria-pressed={!wrongOnly} onClick={() => setWrongOnly(false)}>
                {tr('Semua')}
              </button>
              <button type="button" className={styles.chip} aria-pressed={wrongOnly} onClick={() => setWrongOnly(true)}>
                {tr('Salah ({n})', { n: wrong })}
              </button>
            </div>
          )}
        </div>
        <ol className={styles.reviewList}>
          {shown.map(({ q, i }) => {
            const kind = q.correct === true ? 'ok' : q.correct === false ? 'no' : 'pending';
            const deepText = deep[q.id] ?? q.deep_explanation ?? '';
            return (
              <li key={q.id} className={`${styles.reviewItem} ${styles[`review_${kind}`]}`}>
                <div className={styles.reviewHead}>
                  <span className={styles.reviewNum}>{i + 1}</span>
                  <StatusBadge
                    status={kind === 'ok' ? 'success' : kind === 'no' ? 'error' : 'neutral'}
                    label={kind === 'ok' ? tr('Benar') : kind === 'no' ? tr('Salah') : tr('Dinilai…')}
                  />
                  {q.topic && <span className={styles.topicTag}>{q.topic}</span>}
                </div>
                <p className={styles.reviewQ}>{q.question}</p>
                <p className={styles.reviewA}>
                  {tr('Jawabanmu:')}{' '}<strong>{givenLabel(q)}</strong>
                </p>
                {q.correct === false && (
                  <p className={styles.reviewA}>
                    {tr('Jawaban benar:')}{' '}<strong>{q.answer_text}</strong>
                  </p>
                )}
                {q.feedback && <p className={styles.reviewNote}>{q.feedback}</p>}
                {q.explanation && <p className={styles.reviewNote}>{q.explanation}</p>}
                {q.source && <p className={styles.source}>{tr('Sumber:')}{' '}{q.source}</p>}
                {deepText && <div className={styles.deep}>{deepText}</div>}
                {!deepText && q.correct === false && (
                  <Button size="sm" variant="outline" icon="sparkles" loading={deepBusy === q.id} onClick={() => void explainDeeper(q)}>
                    {tr('Jelaskan lebih dalam')}
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

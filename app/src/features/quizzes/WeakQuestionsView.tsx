import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, EmptyState, ErrorState, Icon, PageHeader, Select, Skeleton, SurfaceCard, useToast } from '../../components/ui';
import { errorMessage, useRpcQuery } from '../../hooks/useRpcQuery';
import { rpcCall } from '../../services/api/rpc';
import type { AttemptResponse } from './types';
import styles from './Quizzes.module.css';

interface DashboardWeak {
  weak_count: number;
  weak_topics: { topic: string; acc?: number; n?: number }[];
}

/**
 * Review queue for questions whose latest answer was wrong. The count and topics come from the
 * existing `dashboard` action; starting uses `start_review` (the server picks and shuffles).
 */
export function WeakQuestionsView() {
  const { data, loading, error, reload } = useRpcQuery<DashboardWeak>('dashboard');
  const navigate = useNavigate();
  const toast = useToast();
  const [count, setCount] = useState('10');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await rpcCall<AttemptResponse>('start_review', { count: Number(count) });
      navigate(`/latihan/${res.attempt.id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal memulai ulangan.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Belajar"
        title="Soal Lemah"
        description="Soal yang jawaban terakhirnya salah masuk antrean ini. Ulangi sampai benar agar penguasaanmu naik."
        actions={
          <Link to="/kuis" className={styles.linkButton}>
            <Icon name="quiz" size={16} />
            Semua kuis
          </Link>
        }
      />

      {loading && !data && <Skeleton height="200px" borderRadius="20px" aria-label="Memuat soal lemah" />}
      {error && !data && <ErrorState message={error} onRetry={reload} />}

      {data && data.weak_count === 0 && (
        <EmptyState
          icon="check-circle"
          title="Belum ada soal lemah"
          description="Kerjakan kuis dulu. Soal yang salah akan masuk ke sini supaya bisa kamu ulangi."
          actionLabel="Ke daftar kuis"
          onAction={() => navigate('/kuis')}
        />
      )}

      {data && data.weak_count > 0 && (
        <SurfaceCard className={styles.weakCard}>
          <div className={styles.weakCount}>
            <span className={styles.weakNumber}>{data.weak_count}</span>
            <span className={styles.weakLabel}>soal perlu diulang</span>
          </div>
          {data.weak_topics.length > 0 && (
            <div>
              <h2 className={styles.sectionTitle}>Topik yang paling lemah</h2>
              <ul className={styles.topicList}>
                {data.weak_topics.map((t) => (
                  <li key={t.topic} className={styles.topicRow}>
                    <span className={styles.topicName}>{t.topic}</span>
                    {t.acc != null && (
                      <>
                        <span className={styles.topicBar} aria-hidden="true">
                          <i className={styles.bar_bad} style={{ width: `${t.acc}%` }} />
                        </span>
                        <span className={styles.topicVal}>{Math.round(t.acc)}% benar</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={styles.weakStart}>
            <Select
              label="Jumlah soal per ulangan"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              options={[5, 10, 20, 40].map((n) => ({ value: n, label: `${n} soal` }))}
            />
            <Button size="lg" icon="play" loading={busy} onClick={start}>
              Mulai ulangi soal lemah
            </Button>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}

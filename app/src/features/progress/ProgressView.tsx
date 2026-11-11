import React from 'react';
import { Link, useNavigate } from 'react-router';
import {
  EmptyState,
  ErrorState,
  Icon,
  MetricTile,
  PageHeader,
  ProgressBar,
  Skeleton,
  StatusBadge,
  SurfaceCard,
} from '../../components/ui';
import { useRpcQuery } from '../../hooks/useRpcQuery';
import { MinutesChart, TrendChart } from './charts';
import type { HubSummary, ProgressResponse } from './types';
import styles from './Progress.module.css';

const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};
const tsLabel = (ts: number) => new Date(ts * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

export function formatStudy(seconds: number): { value: string; unit: string } {
  if (seconds < 3600) return { value: String(Math.round(seconds / 60)), unit: 'menit' };
  return { value: (seconds / 3600).toFixed(1).replace('.', ','), unit: 'jam' };
}

export function ProgressView() {
  const { data, loading, error, reload } = useRpcQuery<ProgressResponse>('progress');
  // XP / level / badges are optional context: the page must still render if the hub is slow or fails.
  const hub = useRpcQuery<HubSummary>('play_hub');
  const navigate = useNavigate();

  if (loading && !data) {
    return (
      <div className={styles.page} aria-busy="true" aria-label="Memuat progres">
        <Skeleton height="40px" width="240px" />
        <div className={styles.metrics}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height="96px" borderRadius="16px" />
          ))}
        </div>
        <Skeleton height="240px" borderRadius="20px" />
      </div>
    );
  }
  if (error || !data) return <ErrorState message={error ?? 'Data progres tidak tersedia.'} onRetry={reload} />;

  const { overall, streak, weekly, trend, topics, documents, study_days, weak_count } = data;
  const hasActivity = overall.attempts > 0 || overall.study_seconds > 0;
  const study = formatStudy(overall.study_seconds);
  const weeklyGoalSec = weekly.goal_min * 60;
  const weeklyPct = weeklyGoalSec > 0 ? (weekly.seconds / weeklyGoalSec) * 100 : null;
  const weakTopics = topics.filter((t) => t.level === 'weak');
  const strongTopics = topics.filter((t) => t.level === 'strong');
  const profile = hub.data?.profile;
  const badges = hub.data?.achievements ?? [];
  const unlocked = badges.filter((b) => b.unlocked);

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Wawasan"
        title="Progres Pembelajaran"
        description="Ringkasan nyata dari kuis, waktu belajar, dan penguasaan topikmu. Angka kosong berarti belum ada data, bukan nol."
      />

      {!hasActivity && (
        <EmptyState
          icon="chart"
          title="Belum ada aktivitas belajar"
          description="Selesaikan satu kuis atau belajar beberapa menit, dan grafik progresmu muncul di sini."
          actionLabel="Ke halaman kuis"
          onAction={() => navigate('/kuis')}
        />
      )}

      <section aria-label="Ringkasan" className={styles.metrics}>
        <MetricTile
          label="Streak"
          icon="flame"
          tone={streak.today.done ? 'success' : streak.at_risk ? 'warning' : 'accent'}
          value={streak.current}
          unit="hari"
          hint={`Terpanjang ${streak.longest} hari${streak.freezes ? ` · ${streak.freezes} pembeku` : ''}`}
        />
        <MetricTile label="Waktu belajar" icon="clock" value={overall.study_seconds > 0 ? study.value : null} unit={study.unit} hint="Total semua waktu" />
        <MetricTile
          label="Akurasi"
          icon="target"
          value={overall.accuracy == null ? null : Math.round(overall.accuracy)}
          unit={overall.accuracy == null ? undefined : '%'}
          hint={overall.answers ? `${overall.answers} jawaban` : 'Belum ada jawaban'}
        />
        <MetricTile label="Kuis dikerjakan" icon="quiz" value={overall.attempts || null} hint={`${overall.documents} materi · ${overall.questions} soal`} />
      </section>

      <SurfaceCard className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Target minggu ini</h2>
          <span className={styles.cardMeta}>
            {Math.round(weekly.seconds / 60)} dari {weekly.goal_min} menit
          </span>
        </div>
        <ProgressBar value={weeklyPct} label="Kemajuan target mingguan" tone={weeklyPct != null && weeklyPct >= 100 ? 'success' : 'accent'} showValue />
        <p className={styles.cardNote}>
          {weekly.quizzes} kuis diselesaikan minggu ini. Ubah target di <Link to="/pengaturan">Pengaturan</Link>.
        </p>
      </SurfaceCard>

      <div className={styles.twoCol}>
        <SurfaceCard className={styles.card}>
          <h2 className={styles.cardTitle}>Skor kuis terakhir</h2>
          {trend.length > 0 ? (
            <TrendChart
              title={`Grafik skor ${trend.length} kuis terakhir, dari ${Math.round((trend[0]!.score / Math.max(1, trend[0]!.total)) * 100)} persen sampai ${Math.round((trend[trend.length - 1]!.score / Math.max(1, trend[trend.length - 1]!.total)) * 100)} persen`}
              points={trend.map((t) => ({ label: tsLabel(t.ts), value: (t.score / Math.max(1, t.total)) * 100 }))}
            />
          ) : (
            <p className={styles.noData}>Belum ada skor. Selesaikan satu kuis dan grafiknya muncul di sini.</p>
          )}
        </SurfaceCard>

        <SurfaceCard className={styles.card}>
          <h2 className={styles.cardTitle}>Waktu belajar 14 hari</h2>
          {study_days.some((d) => d.seconds > 0) ? (
            <MinutesChart
              title="Menit belajar per hari selama 14 hari terakhir"
              days={study_days.map((d) => ({ label: dayLabel(d.day), minutes: d.seconds / 60 }))}
            />
          ) : (
            <p className={styles.noData}>Belum ada waktu belajar tercatat dalam 14 hari terakhir.</p>
          )}
        </SurfaceCard>
      </div>

      <div className={styles.twoCol}>
        <SurfaceCard className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Perlu diperkuat</h2>
            <StatusBadge status="warning" label={`${weak_count} soal lemah`} />
          </div>
          {weakTopics.length > 0 ? (
            <ul className={styles.topicList}>
              {weakTopics.map((t) => (
                <TopicRow key={t.topic} t={t} tone="danger" />
              ))}
            </ul>
          ) : (
            <p className={styles.noData}>{topics.length ? 'Tidak ada topik lemah saat ini.' : 'Topik muncul setelah kamu mengerjakan kuis.'}</p>
          )}
          {weak_count > 0 && (
            <Link to="/soal-lemah" className={styles.inlineLink}>
              <Icon name="target" size={14} /> Ulangi soal lemah
            </Link>
          )}
        </SurfaceCard>

        <SurfaceCard className={styles.card}>
          <h2 className={styles.cardTitle}>Sudah kuat</h2>
          {strongTopics.length > 0 ? (
            <ul className={styles.topicList}>
              {strongTopics.map((t) => (
                <TopicRow key={t.topic} t={t} tone="success" />
              ))}
            </ul>
          ) : (
            <p className={styles.noData}>Topik dengan akurasi 80% ke atas muncul di sini.</p>
          )}
        </SurfaceCard>
      </div>

      {documents.length > 0 && (
        <SurfaceCard className={styles.card}>
          <h2 className={styles.cardTitle}>Per materi</h2>
          <ul className={styles.topicList}>
            {documents.map((d) => (
              <li key={d.id} className={styles.topicRow}>
                <Link to={`/materi/${d.id}`} className={styles.topicName}>
                  {d.title}
                </Link>
                <span className={styles.topicCount}>{d.n} jawaban</span>
                <span className={styles.topicPct}>{d.acc == null ? '—' : `${Math.round(d.acc)}%`}</span>
              </li>
            ))}
          </ul>
        </SurfaceCard>
      )}

      {(profile || hub.data?.levels) && (
        <SurfaceCard className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Level & penguasaan konsep</h2>
            <Link to="/game" className={styles.inlineLink}>
              Buka game <Icon name="arrow-right" size={14} />
            </Link>
          </div>
          {profile && (
            <div className={styles.xpRow}>
              <span className={styles.levelBadge}>Level {profile.level}</span>
              <div className={styles.xpBar}>
                <ProgressBar
                  value={profile.next > profile.level_start ? ((profile.xp - profile.level_start) / (profile.next - profile.level_start)) * 100 : null}
                  label="Kemajuan menuju level berikutnya"
                />
              </div>
              <span className={styles.cardMeta}>
                {profile.xp} / {profile.next} XP
              </span>
            </div>
          )}
          {hub.data?.levels && (
            <dl className={styles.levels}>
              {(
                [
                  ['baru', 'Baru'],
                  ['dikenal', 'Dikenal'],
                  ['paham', 'Paham'],
                  ['kuasai', 'Kuasai'],
                ] as const
              ).map(([k, label]) => (
                <div key={k}>
                  <dt>{label}</dt>
                  <dd>{hub.data!.levels![k]}</dd>
                </div>
              ))}
            </dl>
          )}
          {badges.length > 0 && (
            <>
              <h3 className={styles.subTitle}>
                Lencana ({unlocked.length}/{badges.length})
              </h3>
              <ul className={styles.badges}>
                {badges.map((b) => (
                  <li key={b.key} className={b.unlocked ? styles.badgeOn : styles.badgeOff} title={b.desc}>
                    <Icon name={b.unlocked ? 'award' : 'lock'} size={16} />
                    <span>{b.title}</span>
                    <span className={styles.srOnly}>{b.unlocked ? ', sudah didapat' : ', belum didapat'}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SurfaceCard>
      )}
    </div>
  );
}

function TopicRow({ t, tone }: { t: ProgressResponse['topics'][number]; tone: 'danger' | 'success' }) {
  return (
    <li className={styles.topicRow}>
      <span className={styles.topicName}>{t.topic || 'Umum'}</span>
      <span className={styles.topicBar} aria-hidden="true">
        <i className={tone === 'danger' ? styles.barDanger : styles.barSuccess} style={{ width: `${t.acc}%` }} />
      </span>
      <span className={styles.topicPct}>
        {t.ok}/{t.n} · {Math.round(t.acc)}%
      </span>
    </li>
  );
}

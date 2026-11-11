import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  FrostPanel,
  SurfaceCard,
  Button,
  Icon,
  StatusBadge,
  Skeleton,
  EmptyState,
  ErrorState,
} from '../../components/ui';
import { rpcCall } from '../../services/api/rpc';
import { useEnvironment } from '../../services/environment/EnvironmentContext';
import { DashboardBento } from './DashboardBento';
import type { DashboardResponse, RecentDoc } from './types';
import { fmtDur, relDay, fileKind, greeting, tone } from './utils';
import styles from './Dashboard.module.css';

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

export function DashboardView() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { info: environmentInfo } = useEnvironment();

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await rpcCall<DashboardResponse>('dashboard');
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat ringkasan belajar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className={styles.skeletonContainer} aria-label="Memuat beranda">
        <header className={styles.header}>
          <Skeleton width="240px" height="36px" />
          <Skeleton width="380px" height="20px" />
        </header>
        <div className={styles.heroGrid}>
          <Skeleton height="220px" borderRadius="16px" />
          <Skeleton height="220px" borderRadius="16px" />
        </div>
        <div className={styles.metricsGrid}>
          <Skeleton height="96px" borderRadius="12px" />
          <Skeleton height="96px" borderRadius="12px" />
          <Skeleton height="96px" borderRadius="12px" />
          <Skeleton height="96px" borderRadius="12px" />
        </div>
        <div className={styles.activitySplit}>
          <Skeleton height="280px" borderRadius="16px" />
          <Skeleton height="280px" borderRadius="16px" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.dashboard} aria-label="Error beranda">
        <ErrorState
          title="Gagal Memuat Beranda"
          message={error || 'Terjadi kesalahan saat memuat data dasbor.'}
          onRetry={loadDashboard}
        />
      </div>
    );
  }

  const streak = data.streak || {};
  const streakCount = streak.count ?? streak.current ?? streak.current_streak ?? 0;
  const freezes = streak.freezes ?? streak.freezes_available ?? 0;
  const todayDone = Boolean(streak.today_done || streak.today?.done);
  const todaySeconds = streak.today?.seconds ?? (data.overall?.total_study_minutes ? data.overall.total_study_minutes * 60 : 0);
  const goalSeconds = streak.today?.goal_seconds ?? 1800; // default 30 min

  // Weekly calculations
  const weeklyData = data.weekly;
  let weeklySecs = 0;
  let weeklyGoalSecs = 7 * 1800;
  if (Array.isArray(weeklyData)) {
    weeklySecs = weeklyData.reduce((acc, curr) => acc + (curr.seconds ?? (curr.minutes ? curr.minutes * 60 : 0)), 0);
    const targetMins = weeklyData.reduce((acc, curr) => acc + (curr.target_minutes ?? 30), 0);
    weeklyGoalSecs = targetMins * 60;
  } else if (weeklyData && typeof weeklyData === 'object') {
    weeklySecs = weeklyData.seconds ?? (weeklyData.minutes ? weeklyData.minutes * 60 : 0);
    weeklyGoalSecs = (weeklyData.goal_min ?? 150) * 60;
  }

  // 4 Metrics
  const overall = data.overall || {};
  const accuracyVal = overall.accuracy ?? overall.average_accuracy ?? null;
  const attemptsVal = overall.attempts ?? overall.total_quizzes_taken ?? 0;
  const docsVal = overall.documents ?? (data.recent_docs?.length ?? 0);
  const studySecsVal = overall.study_seconds ?? (overall.total_study_minutes ? overall.total_study_minutes * 60 : 0);

  // Recent docs & weak questions
  const recentDocs = data.recent_docs || [];
  const weakTopics = data.weak_topics || [];
  const recentAttempts = data.recent_attempts || [];
  const weakCount = data.weak_count || 0;
  const lastDoc: RecentDoc | undefined = recentDocs[0];

  // SVG Progress Ring calculations
  const ringRadius = 28;
  const circumference = 2 * Math.PI * ringRadius;
  const progressRatio = goalSeconds > 0 ? Math.min(1, Math.max(0, todaySeconds / goalSeconds)) : 0;
  const strokeDashoffset = circumference - progressRatio * circumference;

  // 7-day mini row from heatmap
  const heatmap = data.heatmap || [];
  const last7Days = heatmap.length >= 7 ? heatmap.slice(-7) : heatmap;

  // Condition-based motivational message
  let motivationalMsg = 'Selesaikan target harian untuk mempertahankan streak belajarmu!';
  if (todayDone) {
    motivationalMsg = 'Target harian tercapai! Kamu luar biasa hari ini.';
  } else if (streak.at_risk) {
    motivationalMsg = 'Streak kamu terancam terputus! Belajar sekarang untuk melindunginya.';
  } else if (streakCount > 0) {
    motivationalMsg = `Pertahankan ritme belajarmu, sudah ${streakCount} hari konsisten!`;
  }

  return (
    <div className={styles.dashboard} aria-label="Beranda">
      {/* Header Greeting */}
      <header className={styles.header}>
        <h1 className={styles.title}>Beranda Belajar</h1>
        <p className={styles.subtitle}>
          {greeting()}! Selamat datang kembali, lanjutkan belajarmu hari ini.
        </p>
        <p className={styles.envLine}>
          {environmentInfo ? (
            <>
              <Icon name="graduation" size={14} /> Lingkungan belajar: <strong>{environmentInfo.label}</strong> ·{' '}
              <Link to="/profil">Ubah</Link>
            </>
          ) : (
            <>
              <Icon name="info" size={14} /> Belum memilih lingkungan belajar. <Link to="/profil">Pilih jenjangmu</Link> agar Belajar tahu konteksmu.
            </>
          )}
        </p>
      </header>

      {/* Hero Grid: Streak Hero & Today's Goal */}
      <section className={styles.heroGrid} aria-label="Statistik Harian">
        {/* Streak Hero Card */}
        <FrostPanel elevation="panel" className={styles.streakHero}>
          <div className={styles.streakTop}>
            <div className={styles.flameBadge}>
              <Icon name="flame" size={16} />
              <span>Streak Belajar</span>
            </div>
            {freezes > 0 && (
              <div className={styles.freezesBadge} title="Token pelindung streak">
                <Icon name="star" size={14} />
                <span>{freezes} Freeze</span>
              </div>
            )}
          </div>

          <div className={styles.streakMain}>
            <div className={styles.streakCount}>{streakCount} hari</div>
            <div className={styles.streakMessage}>{motivationalMsg}</div>
          </div>

          {/* 7-Day Mini Row */}
          <div className={styles.streakRow} aria-label="7 Hari Terakhir">
            {last7Days.map((pt, idx) => {
              const isDone = (pt.level ?? pt.intensity ?? 0) > 0 || (pt.seconds ?? (pt.minutes ? pt.minutes * 60 : 0)) > 0;
              const isToday = idx === last7Days.length - 1;
              return (
                <div
                  key={pt.day || pt.date || idx}
                  className={`${styles.dayDot} ${isDone ? styles.dayDotDone : ''} ${isToday ? styles.dayDotToday : ''}`}
                  title={`${pt.day || pt.date || 'Hari'}: ${fmtDur(pt.seconds ?? (pt.minutes ? pt.minutes * 60 : 0))}`}
                />
              );
            })}
          </div>
        </FrostPanel>

        {/* Today's Goal Card */}
        <SurfaceCard className={styles.goalCard}>
          <div className={styles.goalHeader}>
            <h2 className={styles.goalTitle}>Target Hari Ini</h2>
            {todayDone && <StatusBadge status="ready" label="Tercapai" />}
          </div>

          <div className={styles.goalRingWrapper}>
            <svg className={styles.ringSvg} viewBox="0 0 72 72">
              <circle className={styles.ringBg} cx="36" cy="36" r={ringRadius} />
              <circle
                className={styles.ringProgress}
                cx="36"
                cy="36"
                r={ringRadius}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <div className={styles.goalStats}>
              <div className={styles.goalTime}>{fmtDur(todaySeconds)}</div>
              <div className={styles.goalTarget}>
                Target: {fmtDur(goalSeconds)} ({Math.round(progressRatio * 100)}%)
              </div>
            </div>
          </div>

          {/* Weekly Progress Bar */}
          <div className={styles.weeklyProgress}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Target Mingguan</span>
              <span style={{ fontWeight: 600 }}>{fmtDur(weeklySecs)}</span>
            </div>
            <div className={styles.weeklyBarTrack}>
              <div
                className={styles.weeklyBarFill}
                style={{
                  width: `${weeklyGoalSecs > 0 ? Math.min(100, Math.round((weeklySecs / weeklyGoalSecs) * 100)) : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Call to Actions */}
          <div className={styles.goalActions}>
            {lastDoc ? (
              <Button
                variant="primary"
                size="sm"
                icon="book"
                onClick={() => navigate(`/materi/${lastDoc.id}`)}
              >
                Lanjutkan: {lastDoc.title}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                icon="upload"
                onClick={() => navigate('/materi')}
              >
                Unggah materi
              </Button>
            )}

            {weakCount > 0 && (
              <Button
                variant="secondary"
                size="sm"
                icon="refresh"
                onClick={() => navigate('/soal-lemah')}
              >
                Ulangi {weakCount} soal lemah
              </Button>
            )}
          </div>
        </SurfaceCard>
      </section>

      {/* Bento: scholarship spotlight, saved deadlines, shortcuts, games */}
      <DashboardBento lastDocId={lastDoc?.id} />

      {/* 4 Metric Tiles */}
      <section className={styles.metricsGrid} aria-label="Metrik Belajar">
        <SurfaceCard className={styles.metricCard}>
          <div className={styles.metricTop}>
            <span className={styles.metricLabel}>Akurasi</span>
            <Icon name="check-circle" size={18} />
          </div>
          <div className={styles.metricValue}>
            {accuracyVal != null && accuracyVal > 0 ? `${Math.round(accuracyVal)}%` : '–'}
          </div>
        </SurfaceCard>

        <SurfaceCard className={styles.metricCard}>
          <div className={styles.metricTop}>
            <span className={styles.metricLabel}>Kuis selesai</span>
            <Icon name="quiz" size={18} />
          </div>
          <div className={styles.metricValue}>{attemptsVal}</div>
        </SurfaceCard>

        <SurfaceCard className={styles.metricCard}>
          <div className={styles.metricTop}>
            <span className={styles.metricLabel}>Materi</span>
            <Icon name="folder" size={18} />
          </div>
          <div className={styles.metricValue}>{docsVal}</div>
        </SurfaceCard>

        <SurfaceCard className={styles.metricCard}>
          <div className={styles.metricTop}>
            <span className={styles.metricLabel}>Waktu belajar</span>
            <Icon name="timer" size={18} />
          </div>
          <div className={styles.metricValue}>{fmtDur(studySecsVal)}</div>
        </SurfaceCard>
      </section>

      {/* When 0 documents exist overall */}
      {docsVal === 0 ? (
        <section aria-label="Mulai Belajar">
          <EmptyState
            icon="folder"
            title="Belum ada materi belajar"
            description="Unggah materi pertamamu dalam format PDF, presentasi, atau catatan teks untuk memulai proses belajar berbasis AI."
            actionLabel="Unggah Materi Pertama"
            onAction={() => navigate('/materi')}
          />
        </section>
      ) : (
        /* Activity Split: Recent Documents vs Weak Topics */
        <section className={styles.activitySplit} aria-label="Aktivitas Belajar">
          {/* Left: Recent Materials */}
          <div className={styles.recentSection}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Materi Terbaru</h2>
              <Link to="/materi" style={{ fontSize: '0.85rem', color: 'var(--accent)', textDecoration: 'none' }}>
                Lihat semua →
              </Link>
            </div>

            <div className={styles.recentList} role="list">
              {recentDocs.slice(0, 4).map((doc) => (
                <SurfaceCard
                  key={doc.id}
                  interactive
                  className={styles.docItem}
                  onClick={() => navigate(`/materi/${doc.id}`)}
                  role="listitem"
                >
                  <div className={styles.docInfo}>
                    <span className={styles.kindBadge}>{fileKind(doc.filename)}</span>
                    <div className={styles.docMeta}>
                      <span className={styles.docTitle}>{doc.title}</span>
                      <div className={styles.docDetails}>
                        {doc.subject_name && (
                          <span className={styles.subjectBadge}>{doc.subject_name}</span>
                        )}
                        {doc.page_count ? <span>{doc.page_count} hal</span> : null}
                        <span>{relDay(doc.updated_at || doc.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={doc.status} />
                </SurfaceCard>
              ))}
            </div>
          </div>

          {/* Right: Weak Topics & Recent Attempts */}
          <div className={styles.sideList}>
            {/* Weak Topics */}
            <div>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Topik Lemah</h2>
              </div>
              {weakTopics.length === 0 ? (
                <SurfaceCard style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Kerjakan satu kuis dulu untuk mendeteksi topik yang perlu dipelajari ulang.
                </SurfaceCard>
              ) : (
                <div className={styles.weakList}>
                  {weakTopics.slice(0, 4).map((wt, i) => {
                    const acc = wt.accuracy ?? wt.acc ?? 0;
                    return (
                      <SurfaceCard key={i} className={styles.weakItem}>
                        <div className={styles.weakTop}>
                          <span>{wt.topic}</span>
                          <span style={{ color: acc < 60 ? 'var(--danger)' : 'var(--warning)' }}>
                            {Math.round(acc)}%
                          </span>
                        </div>
                        <div className={styles.weakBar}>
                          <div
                            className={styles.weakBarFill}
                            style={{
                              width: `${acc}%`,
                              background: acc < 60 ? 'var(--danger)' : 'var(--warning)',
                            }}
                          />
                        </div>
                      </SurfaceCard>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Attempts */}
            {recentAttempts.length > 0 && (
              <div>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Kuis Terakhir</h2>
                </div>
                <div className={styles.attemptList}>
                  {recentAttempts.slice(0, 3).map((att, i) => {
                    const pct = att.percentage ?? att.pct ?? Math.round((att.score / (att.total || 1)) * 100);
                    const pillTone = tone(pct);
                    const pillClass =
                      pillTone === 'good'
                        ? styles.scoreGood
                        : pillTone === 'mid'
                        ? styles.scoreMid
                        : styles.scoreBad;

                    return (
                      <SurfaceCard key={att.id || att.attempt_id || i} className={styles.attemptItem}>
                        <span className={styles.attemptTitle}>
                          {att.title || att.quiz_title || `Kuis #${att.quiz_id || i + 1}`}
                        </span>
                        <span className={`${styles.attemptScorePill} ${pillClass}`}>
                          {att.score}/{att.total} ({pct}%)
                        </span>
                      </SurfaceCard>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Consistency Section: 20-week Heatmap + Milestones */}
      <section className={styles.consistencySplit} aria-label="Konsistensi Belajar">
        <FrostPanel elevation="panel" className={styles.heatmapPanel}>
          <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
            <h2 className={styles.sectionTitle}>Konsistensi Belajar (20 Minggu)</h2>
          </div>
          <div className={styles.heatmapGrid} aria-label="Grafik heatmap belajar">
            {heatmap.slice(-140).map((pt, idx) => {
              const lvl = pt.level ?? pt.intensity ?? 0;
              const heatClass =
                lvl === 4
                  ? styles.heat4
                  : lvl === 3
                  ? styles.heat3
                  : lvl === 2
                  ? styles.heat2
                  : lvl === 1
                  ? styles.heat1
                  : styles.heat0;

              return (
                <div
                  key={pt.day || pt.date || idx}
                  className={`${styles.heatTile} ${heatClass}`}
                  title={`${pt.day || pt.date || 'Hari'}: ${fmtDur(pt.seconds ?? (pt.minutes ? pt.minutes * 60 : 0))}`}
                />
              );
            })}
          </div>
          <div className={styles.heatLegend}>
            <span>Jarang</span>
            <div className={`${styles.heatTile} ${styles.heat0}`} />
            <div className={`${styles.heatTile} ${styles.heat1}`} />
            <div className={`${styles.heatTile} ${styles.heat2}`} />
            <div className={`${styles.heatTile} ${styles.heat3}`} />
            <div className={`${styles.heatTile} ${styles.heat4}`} />
            <span>Sering</span>
          </div>
        </FrostPanel>

        {/* Streak Milestones Card */}
        <SurfaceCard className={styles.milestonesCard}>
          <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
            <h2 className={styles.goalTitle}>Pencapaian Streak</h2>
          </div>
          <div className={styles.milestonesList}>
            {STREAK_MILESTONES.map((target) => {
              const achieved = streakCount >= target;
              return (
                <div
                  key={target}
                  className={`${styles.milestonePill} ${achieved ? styles.milestoneAchieved : ''}`}
                >
                  <Icon name={achieved ? 'check' : 'flame'} size={14} />
                  <span>{target} Hari</span>
                </div>
              );
            })}
          </div>
        </SurfaceCard>
      </section>
    </div>
  );
}

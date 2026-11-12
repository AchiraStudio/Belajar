import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, EmptyState, Icon, StatusBadge, SurfaceCard, type IconName } from '../../components/ui';
import { ratio, type DashboardModel } from './normalize';
import type { HeatmapPoint, RecentAttempt, RecentDoc, WeakTopic } from './types';
import { useI18n } from '../../services/i18n';
import { fileKind, fmtDur, relDay, tone } from './utils';
import styles from './Dashboard.module.css';

/* ------------------------------------------------------------------------------------------
   Stat tile: one number, one honest hint
   ------------------------------------------------------------------------------------------ */

export type StatTone = 'apricot' | 'accent' | 'ice' | 'plain';

export function StatTile({
  tone: statTone,
  icon,
  label,
  value,
  chip,
  hint,
}: {
  tone: StatTone;
  icon: IconName;
  label: string;
  value: React.ReactNode;
  /** A small secondary figure beside the value, e.g. the average accuracy next to the quiz count. */
  chip?: { text: string; label: string };
  hint: string;
}) {
  return (
    <SurfaceCard className={`${styles.stat} ${styles[`tone_${statTone}`]}`} role="group" aria-label={label}>
      <div className={styles.statTop}>
        <span className={styles.statLabel}>{label}</span>
        <span className={styles.statIcon} aria-hidden="true">
          <Icon name={icon} size={20} />
        </span>
      </div>
      <div className={styles.statMain}>
        <strong className={styles.statValue}>{value}</strong>
        {chip && (
          <span className={styles.statChip} title={chip.label}>
            <span className="sr-only">{chip.label}: </span>
            {chip.text}
          </span>
        )}
      </div>
      <span className={styles.statHint}>{hint}</span>
    </SurfaceCard>
  );
}

/* ------------------------------------------------------------------------------------------
   Today's goal: a donut with the time in the middle
   ------------------------------------------------------------------------------------------ */

const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

export function GoalTile({ model }: { model: DashboardModel }) {
  const { t } = useI18n();
  const progress = ratio(model.todaySeconds, model.goalSeconds);
  const known = model.todaySeconds != null && model.goalSeconds != null;
  const remaining = known ? Math.max(0, model.goalSeconds! - model.todaySeconds!) : null;

  // The ring fills in once on arrival. That is the one moment it tells you something: where you are.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const weekRatio = ratio(model.weekSeconds, model.weekGoalSeconds);

  return (
    <SurfaceCard className={styles.tile} aria-labelledby="goal-h">
      <div className={styles.tileHead}>
        <h2 id="goal-h" className={styles.tileTitle}>
          <Icon name="target" size={18} /> {t('Target hari ini')}
        </h2>
        {model.todayDone && <StatusBadge status="ready" label={t('Tercapai')} />}
      </div>

      <div className={styles.goalBody}>
        <div className={styles.ring}>
          <svg viewBox="0 0 140 140" role="img" aria-label={known ? t('Belajar {time} dari target {goal} hari ini', { time: fmtDur(model.todaySeconds!), goal: fmtDur(model.goalSeconds!) }) : t('Waktu belajar hari ini belum tersedia')}>
            <circle className={styles.ringTrack} cx="70" cy="70" r={RING_R} />
            <circle
              className={styles.ringFill}
              cx="70"
              cy="70"
              r={RING_R}
              strokeDasharray={RING_C}
              strokeDashoffset={drawn ? RING_C * (1 - progress) : RING_C}
              transform="rotate(-90 70 70)"
            />
          </svg>
          <div className={styles.ringCenter}>
            <strong>{model.todaySeconds != null ? fmtDur(model.todaySeconds) : '–'}</strong>
            <span>{t('hari ini')}</span>
          </div>
        </div>

        <dl className={styles.legend}>
          <div>
            <dt>
              <i className={`${styles.swatch} ${styles.swatchOn}`} aria-hidden="true" /> {t('Sudah belajar')}
            </dt>
            <dd>{model.todaySeconds != null ? fmtDur(model.todaySeconds) : '–'}</dd>
          </div>
          <div>
            <dt>
              <i className={`${styles.swatch} ${styles.swatchOff}`} aria-hidden="true" /> {t('Sisa target')}
            </dt>
            <dd>{remaining != null ? fmtDur(remaining) : '–'}</dd>
          </div>
          <div>
            <dt>
              <Icon name="flag" size={12} aria-hidden="true" /> {t('Target harian')}
            </dt>
            <dd>{model.goalSeconds != null ? fmtDur(model.goalSeconds) : '–'}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.weekBar}>
        <div className={styles.weekBarHead}>
          <span>{t('Target mingguan')}</span>
          <strong>
            {fmtDur(model.weekSeconds)}
            {model.weekGoalSeconds != null ? ` ${t('dari {goal}', { goal: fmtDur(model.weekGoalSeconds) })}` : ''}
          </strong>
        </div>
        <div
          className={styles.track}
          role="progressbar"
          aria-label={t('Target mingguan')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(weekRatio * 100)}
        >
          <div className={styles.trackFill} style={{ width: `${Math.round(weekRatio * 100)}%` }} />
        </div>
      </div>
    </SurfaceCard>
  );
}

/* ------------------------------------------------------------------------------------------
   Continue learning: the recent materials, newest first
   ------------------------------------------------------------------------------------------ */

export function ContinueTile({ docs, onUpload }: { docs: RecentDoc[]; onUpload: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const shown = docs.slice(0, 3);
  const first = shown[0];

  return (
    <SurfaceCard className={styles.tile} aria-labelledby="cont-h">
      <div className={styles.tileHead}>
        <h2 id="cont-h" className={styles.tileTitle}>
          <Icon name="book" size={18} /> {t('Lanjutkan belajar')}
        </h2>
        <Link to="/materi" className={styles.more}>
          {t('Semua materi')}
        </Link>
      </div>

      {!first ? (
        <EmptyState
          icon="folder"
          title={t('Belum ada materi belajar')}
          description={t('Unggah materi pertamamu dalam format PDF, presentasi, atau catatan teks untuk memulai proses belajar berbasis AI.')}
          actionLabel={t('Unggah Materi Pertama')}
          onAction={onUpload}
        />
      ) : (
        <>
          <ul className={styles.docList}>
            {shown.map((doc) => (
              <li key={doc.id} className={styles.docRow}>
                <span className={styles.kind} aria-hidden="true">
                  {fileKind(doc.filename)}
                </span>
                <div className={styles.docMeta}>
                  <Link to={`/materi/${doc.id}`} className={styles.docTitle}>
                    {doc.title}
                  </Link>
                  <span className={styles.docSub}>
                    {doc.subject_name && <span className={styles.subject}>{doc.subject_name}</span>}
                    {doc.page_count ? <span>{t('{n} hal', { n: doc.page_count })}</span> : null}
                    <span>{relDay(doc.updated_at || doc.created_at)}</span>
                  </span>
                </div>
                <StatusBadge status={doc.status} />
              </li>
            ))}
          </ul>
          <div className={styles.tileFoot}>
            <Button variant="primary" size="sm" icon="book" onClick={() => navigate(`/materi/${first.id}`)}>
              {t('Lanjutkan')}: {first.title}
            </Button>
          </div>
        </>
      )}
    </SurfaceCard>
  );
}

/* ------------------------------------------------------------------------------------------
   Latest quizzes: a real table, so it reads the same with a screen reader
   ------------------------------------------------------------------------------------------ */

export function AttemptsTile({ attempts }: { attempts: RecentAttempt[] }) {
  const { t } = useI18n();
  const rows = attempts.slice(0, 5);
  return (
    <SurfaceCard className={styles.tile} aria-labelledby="att-h">
      <div className={styles.tileHead}>
        <h2 id="att-h" className={styles.tileTitle}>
          <Icon name="quiz" size={18} /> {t('Kuis terakhir')}
        </h2>
        <Link to="/progres" className={styles.more}>
          {t('Lihat progres')}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className={styles.muted}>
          {t('Belum ada kuis yang selesai. Kerjakan satu kuis di')} <Link to="/kuis">{t('halaman Kuis')}</Link> {t('dan nilainya muncul di sini.')}
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('Kuis')}</th>
                <th scope="col">{t('Skor')}</th>
                <th scope="col">{t('Persen')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((att, i) => {
                const pct = att.percentage ?? att.pct ?? Math.round((att.score / (att.total || 1)) * 100);
                const id = att.attempt_id ?? att.id;
                const title = att.title || att.quiz_title || `${t('Kuis')} #${att.quiz_id ?? i + 1}`;
                return (
                  <tr key={id ?? i}>
                    <td className={styles.cellTitle}>{id != null ? <Link to={`/hasil/${id}`}>{title}</Link> : title}</td>
                    <td className={styles.cellNum}>
                      {att.score}/{att.total}
                    </td>
                    <td>
                      <span className={`${styles.pct} ${styles[`pct_${tone(pct)}`]}`}>
                        <span className={styles.pctBar} aria-hidden="true">
                          <i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                        </span>
                        <span className={styles.pctText}>{pct}%</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SurfaceCard>
  );
}

/* ------------------------------------------------------------------------------------------
   This week: one horizontal capsule per day
   ------------------------------------------------------------------------------------------ */

export function WeekTile({ model }: { model: DashboardModel }) {
  const { t } = useI18n();
  const days = model.days;
  // Scale to the longest day (or the goal, if that is longer) so bars stay comparable even when every
  // day beats the goal; the goal itself is drawn as a tick on each track.
  const longest = Math.max(...days.map((d) => d.seconds), 1);
  const reference = Math.max(longest, model.goalSeconds ?? 0);
  const goalAt = model.goalSeconds != null ? ratio(model.goalSeconds, reference) * 100 : null;
  return (
    <SurfaceCard className={styles.tile} aria-labelledby="week-h">
      <div className={styles.tileHead}>
        <h2 id="week-h" className={styles.tileTitle}>
          <Icon name="activity" size={18} /> {t('Tujuh hari terakhir')}
        </h2>
        <span className={styles.metaNote}>
          {model.goalSeconds != null ? t('Garis tegak = target {goal}', { goal: fmtDur(model.goalSeconds) }) : t('Skala mengikuti hari terpanjang')}
        </span>
      </div>

      {days.length === 0 ? (
        <p className={styles.muted}>{t('Belum ada catatan waktu belajar. Buka sebuah materi dan waktunya mulai tercatat.')}</p>
      ) : (
        <ol className={styles.dayList}>
          {days.map((d) => {
            const filled = ratio(d.seconds, reference);
            const reached = model.goalSeconds != null && d.seconds >= model.goalSeconds;
            return (
              <li key={d.key} className={`${styles.dayRow} ${d.isToday ? styles.dayToday : ''}`}>
                <span className={styles.dayName}>
                  {d.label}
                  {d.isToday && <span className="sr-only"> ({t('hari ini')})</span>}
                </span>
                <span className={styles.dayTrack} aria-hidden="true">
                  <i className={reached ? styles.dayReached : ''} style={{ width: `${Math.max(d.seconds > 0 ? 6 : 0, filled * 100)}%` }} />
                  {goalAt != null && <b className={styles.goalTick} style={{ left: `${goalAt}%` }} />}
                </span>
                <span className={styles.dayValue}>
                  {reached && (
                    <>
                      <Icon name="check" size={13} />
                      <span className="sr-only">{t('Target tercapai')}: </span>
                    </>
                  )}
                  {d.seconds > 0 ? fmtDur(d.seconds) : '–'}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </SurfaceCard>
  );
}

/* ------------------------------------------------------------------------------------------
   Weak topics
   ------------------------------------------------------------------------------------------ */

export function WeakTile({ topics, weakCount }: { topics: WeakTopic[]; weakCount: number }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <SurfaceCard className={styles.tile} aria-labelledby="weak-h">
      <div className={styles.tileHead}>
        <h2 id="weak-h" className={styles.tileTitle}>
          <Icon name="target" size={18} /> {t('Topik lemah')}
        </h2>
      </div>

      {topics.length === 0 ? (
        <p className={styles.muted}>{t('Kerjakan satu kuis dulu untuk mendeteksi topik yang perlu dipelajari ulang.')}</p>
      ) : (
        <ul className={styles.weakList}>
          {topics.slice(0, 4).map((wt, i) => {
            const acc = Math.round(wt.accuracy ?? wt.acc ?? 0);
            return (
              <li key={`${wt.topic}-${i}`}>
                <div className={styles.weakTop}>
                  <span className={styles.weakName}>{wt.topic}</span>
                  <span className={`${styles.weakPct} ${acc < 60 ? styles.weakBad : styles.weakMid}`}>
                    {acc < 60 ? <Icon name="alert-triangle" size={13} aria-hidden="true" /> : null}
                    {acc}%
                  </span>
                </div>
                <span className={styles.weakBar} aria-hidden="true">
                  <i className={acc < 60 ? styles.weakBadFill : styles.weakMidFill} style={{ width: `${Math.min(100, Math.max(0, acc))}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {weakCount > 0 && (
        <div className={styles.tileFoot}>
          <Button variant="secondary" size="sm" icon="refresh" onClick={() => navigate('/soal-lemah')}>
            {t('Ulangi {n} soal lemah', { n: weakCount })}
          </Button>
        </div>
      )}
    </SurfaceCard>
  );
}

/* ------------------------------------------------------------------------------------------
   Consistency: 20 weeks of study, plus the streak milestones reached so far
   ------------------------------------------------------------------------------------------ */

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];
const HEAT_CLASSES = ['heat0', 'heat1', 'heat2', 'heat3', 'heat4'] as const;

export function HeatmapTile({ heatmap, streakCount }: { heatmap: HeatmapPoint[]; streakCount: number }) {
  const { t } = useI18n();
  const cells = heatmap.slice(-140);
  return (
    <SurfaceCard className={styles.tile} aria-labelledby="heat-h">
      <div className={styles.tileHead}>
        <h2 id="heat-h" className={styles.tileTitle}>
          <Icon name="calendar" size={18} /> {t('Konsistensi Belajar (20 Minggu)')}
        </h2>
      </div>

      <div className={styles.heatGrid} role="img" aria-label={t('Peta waktu belajar {n} hari terakhir', { n: cells.length })}>
        {cells.map((pt, idx) => {
          const lvl = Math.min(4, Math.max(0, pt.level ?? pt.intensity ?? 0));
          const secs = pt.seconds ?? (pt.minutes ? pt.minutes * 60 : 0);
          return (
            <i
              key={pt.day || pt.date || idx}
              className={`${styles.heatCell} ${styles[HEAT_CLASSES[lvl] ?? 'heat0']}`}
              title={`${pt.day || pt.date || t('Hari')}: ${fmtDur(secs)}`}
            />
          );
        })}
      </div>

      <div className={styles.heatFoot}>
        <div className={styles.heatLegend} aria-hidden="true">
          <span>{t('Jarang')}</span>
          {HEAT_CLASSES.map((c) => (
            <i key={c} className={`${styles.heatCell} ${styles[c]}`} />
          ))}
          <span>{t('Sering')}</span>
        </div>

        <ul className={styles.milestones} aria-label={t('Pencapaian streak')}>
          {STREAK_MILESTONES.map((target) => {
            const achieved = streakCount >= target;
            return (
              <li key={target} className={`${styles.milestone} ${achieved ? styles.milestoneOn : ''}`}>
                <Icon name={achieved ? 'check' : 'flame'} size={13} aria-hidden="true" />
                <span>{t('{n} Hari', { n: target })}</span>
                {achieved && <span className="sr-only"> {t('tercapai')}</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </SurfaceCard>
  );
}

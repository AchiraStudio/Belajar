import React, { useMemo } from 'react';
import { Icon, SurfaceCard } from '../../components/ui';
import { useI18n } from '../../services/i18n';
import { pointSeconds } from '../dashboard/normalize';
import type { HeatmapPoint } from '../dashboard/types';
import { fmtDur } from '../dashboard/utils';
import styles from './ActivityHeatmap.module.css';

const MILESTONES = [3, 7, 14, 30, 60, 100];
const WEEKS = 20;

/** The server gives each day a level 0..4; when it does not, derive one from the minutes studied. */
function levelOf(pt: HeatmapPoint): number {
  const given = pt.level ?? pt.intensity;
  if (typeof given === 'number') return Math.min(4, Math.max(0, Math.round(given)));
  const mins = pointSeconds(pt) / 60;
  return mins <= 0 ? 0 : mins < 10 ? 1 : mins < 25 ? 2 : mins < 45 ? 3 : 4;
}

/** Blank cells needed before the first day so each row is one weekday (Monday first). */
function leadingBlanks(first: HeatmapPoint | undefined): number {
  const day = first?.day ?? first?.date;
  if (!day) return 0;
  const d = new Date(`${day.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? 0 : (d.getDay() + 6) % 7;
}

/**
 * The last 20 weeks as a grid, one column per week. Unlike the home page's tile this one sizes its own
 * cells, so it holds its shape in a wide column and on a phone. The text line under it says the same
 * thing in words, for people who cannot read colour.
 */
export function ActivityHeatmap({ heatmap, streakCount }: { heatmap: HeatmapPoint[]; streakCount: number }) {
  const { t } = useI18n();
  const cells = useMemo(() => heatmap.slice(-WEEKS * 7), [heatmap]);
  const blanks = useMemo(() => leadingBlanks(cells[0]), [cells]);
  const active = cells.filter((c) => pointSeconds(c) > 0 || (c.quizzes ?? 0) > 0).length;
  // Always lay out the full 20 weeks. A new account has little history, and a grid with one or two
  // columns would stretch each cell across the whole card; the earlier weeks show as quiet cells.
  const padCols = Math.max(0, WEEKS - Math.ceil((cells.length + blanks) / 7));
  const columns = padCols + Math.ceil((cells.length + blanks) / 7);

  return (
    <SurfaceCard className={styles.card} aria-labelledby="heat-h">
      <h2 id="heat-h" className={styles.title}>
        <Icon name="calendar" size={18} /> {t('Konsistensi Belajar (20 Minggu)')}
      </h2>

      {cells.length === 0 ? (
        <p className={styles.empty}>{t('Belum ada riwayat belajar. Selesaikan satu kuis atau belajar beberapa menit untuk memulai.')}</p>
      ) : (
        <>
          <div
            className={styles.grid}
            style={{ '--cols': columns } as React.CSSProperties}
            role="img"
            aria-label={t('Peta waktu belajar {n} hari terakhir', { n: cells.length })}
          >
            {Array.from({ length: padCols * 7 }, (_, i) => (
              <i key={`p${i}`} className={styles.cell} data-l={0} />
            ))}
            {Array.from({ length: blanks }, (_, i) => (
              <i key={`b${i}`} className={styles.blank} />
            ))}
            {cells.map((pt, i) => (
              <i key={pt.day ?? pt.date ?? i} className={styles.cell} data-l={levelOf(pt)} title={`${pt.day ?? pt.date ?? t('Hari')}: ${fmtDur(pointSeconds(pt))}`} />
            ))}
          </div>
          <div className={styles.foot}>
            <p className={styles.summary}>{t('Aktif {a} dari {b} hari terakhir', { a: active, b: cells.length })}</p>
            <div className={styles.legend} aria-hidden="true">
              <span>{t('Jarang')}</span>
              {[0, 1, 2, 3, 4].map((l) => (
                <i key={l} className={styles.cell} data-l={l} />
              ))}
              <span>{t('Sering')}</span>
            </div>
          </div>
        </>
      )}

      <ul className={styles.milestones} aria-label={t('Pencapaian streak')}>
        {MILESTONES.map((n) => {
          const on = streakCount >= n;
          return (
            <li key={n} data-on={on || undefined}>
              <Icon name={on ? 'check' : 'flame'} size={13} aria-hidden="true" /> {t('{n} Hari', { n })}
            </li>
          );
        })}
      </ul>
    </SurfaceCard>
  );
}

import React from 'react';
import styles from './Progress.module.css';

export interface ChartPoint {
  label: string;
  value: number;
}

const W = 560;
const H = 190;
const PAD = { top: 12, right: 12, bottom: 26, left: 34 };

/** Score trend (0–100). Line + dots, with an equivalent text list for screen readers. */
export function TrendChart({ points, title }: { points: ChartPoint[]; title: string }) {
  if (points.length === 0) return null;
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => PAD.top + ih - (Math.max(0, Math.min(100, v)) / 100) * ih;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const grid = [0, 50, 100];
  return (
    <figure className={styles.figure}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className={styles.chart}>
        {grid.map((g) => (
          <g key={g}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} className={styles.gridLine} />
            <text x={PAD.left - 8} y={y(g) + 4} textAnchor="end" className={styles.axis}>
              {g}
            </text>
          </g>
        ))}
        {points.length > 1 && <path d={path} className={styles.line} />}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={4.5} className={styles.dot}>
              <title>{`${p.label}: ${Math.round(p.value)}%`}</title>
            </circle>
          </g>
        ))}
        <text x={PAD.left} y={H - 6} className={styles.axis}>
          {points[0]?.label}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className={styles.axis}>
          {points[points.length - 1]?.label}
        </text>
      </svg>
      <details className={styles.textAlt}>
        <summary>Lihat sebagai daftar</summary>
        <ol>
          {points.map((p, i) => (
            <li key={i}>
              {p.label}: {Math.round(p.value)}%
            </li>
          ))}
        </ol>
      </details>
    </figure>
  );
}

/** Minutes studied per day. Zero-height days are drawn as a baseline tick, not hidden. */
export function MinutesChart({ days, title }: { days: { label: string; minutes: number }[]; title: string }) {
  if (days.length === 0) return null;
  const max = Math.max(10, ...days.map((d) => d.minutes));
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const slot = iw / days.length;
  const bw = Math.min(26, slot * 0.62);
  return (
    <figure className={styles.figure}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className={styles.chart}>
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + ih} y2={PAD.top + ih} className={styles.gridLine} />
        <text x={PAD.left - 8} y={PAD.top + 10} textAnchor="end" className={styles.axis}>
          {Math.round(max)}
        </text>
        <text x={PAD.left - 8} y={PAD.top + ih + 4} textAnchor="end" className={styles.axis}>
          0
        </text>
        {days.map((d, i) => {
          const h = Math.max(d.minutes > 0 ? 3 : 1.5, (d.minutes / max) * ih);
          const cx = PAD.left + slot * i + slot / 2;
          return (
            <g key={i}>
              <rect x={cx - bw / 2} y={PAD.top + ih - h} width={bw} height={h} rx={4} className={d.minutes > 0 ? styles.bar : styles.barEmpty}>
                <title>{`${d.label}: ${Math.round(d.minutes)} menit`}</title>
              </rect>
              {(i === 0 || i === days.length - 1 || i % 3 === 0) && (
                <text x={cx} y={H - 6} textAnchor="middle" className={styles.axis}>
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <details className={styles.textAlt}>
        <summary>Lihat sebagai daftar</summary>
        <ol>
          {days.map((d, i) => (
            <li key={i}>
              {d.label}: {Math.round(d.minutes)} menit
            </li>
          ))}
        </ol>
      </details>
    </figure>
  );
}

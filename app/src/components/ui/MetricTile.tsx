import React from 'react';
import { Icon, type IconName } from './Icon';
import styles from './ui.module.css';

export interface MetricTileProps {
  label: string;
  /** `null`/`undefined` shows "—": "no data" is never rendered as a zero. */
  value: string | number | null | undefined;
  unit?: string;
  hint?: string;
  icon?: IconName;
  tone?: 'default' | 'accent' | 'success' | 'warning';
}

export function MetricTile({ label, value, unit, hint, icon, tone = 'default' }: MetricTileProps) {
  const empty = value == null || value === '';
  return (
    <div className={`${styles.metric} ${styles[`metric_${tone}`]}`}>
      <div className={styles.metricHead}>
        {icon && <Icon name={icon} size={16} />}
        <span>{label}</span>
      </div>
      <div className={styles.metricValue}>
        {empty ? <span aria-label="Belum ada data">—</span> : value}
        {!empty && unit && <span className={styles.metricUnit}>{unit}</span>}
      </div>
      {hint && <div className={styles.metricHint}>{hint}</div>}
    </div>
  );
}

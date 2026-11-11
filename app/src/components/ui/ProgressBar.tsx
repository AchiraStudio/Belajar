import React from 'react';
import styles from './ui.module.css';

export interface ProgressBarProps {
  /** 0..100. `null` renders an indeterminate bar (unknown progress is never faked). */
  value: number | null;
  label: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
  showValue?: boolean;
  className?: string;
}

export function ProgressBar({ value, label, tone = 'accent', showValue = false, className = '' }: ProgressBarProps) {
  const clamped = value == null ? null : Math.max(0, Math.min(100, value));
  return (
    <div className={`${styles.progress} ${className}`.trim()}>
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped == null ? undefined : Math.round(clamped)}
      >
        <div
          className={`${styles.progressFill} ${styles[`progress_${tone}`]} ${clamped == null ? styles.progressIndeterminate : ''}`}
          style={clamped == null ? undefined : { width: `${clamped}%` }}
        />
      </div>
      {showValue && clamped != null && <span className={styles.progressValue}>{Math.round(clamped)}%</span>}
    </div>
  );
}

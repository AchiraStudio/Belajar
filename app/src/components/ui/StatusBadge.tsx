import React from 'react';
import styles from './ui.module.css';

export type StatusType =
  | 'ready'
  | 'processing'
  | 'queued'
  | 'error'
  | 'neutral'
  | 'warning'
  | 'success';

export interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  pulse?: boolean;
  className?: string;
}

const DEFAULT_LABELS: Record<StatusType, string> = {
  ready: 'Siap',
  processing: 'Memproses',
  queued: 'Antre',
  error: 'Gagal',
  neutral: 'Netral',
  warning: 'Peringatan',
  success: 'Selesai',
};

export function StatusBadge({
  status,
  label,
  pulse,
  className = '',
}: StatusBadgeProps) {
  const displayLabel = label ?? DEFAULT_LABELS[status];

  return (
    <span
      role="status"
      className={`
        ${styles.statusBadge}
        ${styles[status]}
        ${pulse ? styles.pulse : ''}
        ${className}
      `.trim()}
    >
      <i className={styles.dot} aria-hidden="true" />
      <span>{displayLabel}</span>
    </span>
  );
}

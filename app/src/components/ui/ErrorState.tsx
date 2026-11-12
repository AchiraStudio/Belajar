import React from 'react';
import { tr } from '../../services/i18n';
import { Button } from './Button';
import { Icon } from './Icon';
import styles from './ui.module.css';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  isOffline?: boolean;
  className?: string;
}

export function ErrorState({
  title = tr('Terjadi Kesalahan'),
  message,
  onRetry,
  retryLabel = tr('Coba Lagi'),
  isOffline = false,
  className = '',
}: ErrorStateProps) {
  return (
    <div role="alert" className={`${styles.errorState} ${className}`.trim()}>
      {isOffline && (
        <div className={styles.offlineBanner}>
          <Icon name="wifi-off" size={16} />
          <span>{tr('Koneksi terputus. Bekerja secara luring.')}</span>
        </div>
      )}
      <div className={styles.errorIcon}>
        <Icon name="alert-triangle" size={28} />
      </div>
      <h3 className={styles.errorTitle}>{title}</h3>
      <p className={styles.errorMessage}>{message}</p>
      {onRetry && (
        <div className={styles.errorAction}>
          <Button variant="danger" icon="refresh" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

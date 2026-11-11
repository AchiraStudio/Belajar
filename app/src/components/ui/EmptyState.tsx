import React from 'react';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import styles from './ui.module.css';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon = 'folder',
  title,
  description,
  actionLabel,
  onAction,
  children,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`${styles.emptyState} ${className}`.trim()}>
      <div className={styles.emptyIcon}>
        <Icon name={icon} size={28} />
      </div>
      <h3 className={styles.emptyTitle}>{title}</h3>
      {description && <p className={styles.emptyDescription}>{description}</p>}
      {(actionLabel && onAction) && (
        <div className={styles.emptyAction}>
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
      {children}
    </div>
  );
}

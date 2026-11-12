import React from 'react';
import { SurfaceCard, StatusBadge, Icon } from '../../components/ui';
import { fileKind, relDay } from '../dashboard/utils';
import type { MaterialDoc } from './types';
import styles from './Materials.module.css';
import { tr } from '../../services/i18n';

interface DocumentRowProps {
  document: MaterialDoc;
  onClick: () => void;
}

export function DocumentRow({ document: doc, onClick }: DocumentRowProps) {
  const isProcessing = doc.status === 'processing' || doc.status === 'queued';
  const progressPct = Math.round(doc.job_progress ?? 15);

  return (
    <SurfaceCard
      interactive
      padded
      className={styles.docRow}
      onClick={onClick}
      role="listitem"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className={styles.docRowLeft}>
        <span className={styles.kindBadge}>{fileKind(doc.filename)}</span>
        <div className={styles.docRowInfo}>
          <div className={styles.docRowTitle}>{doc.title}</div>
          <div className={styles.docRowMeta}>
            {doc.subject_name && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: doc.subject_color || 'var(--accent)',
                    display: 'inline-block',
                  }}
                />
                {doc.subject_name}
              </span>
            )}
            {doc.page_count ? <span>{doc.page_count}{' '}{tr('hal')}</span> : null}
            <span>{relDay(doc.updated_at || doc.created_at)}</span>
            {doc.quiz_count ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Icon name="quiz" size={14} />
                <span>{doc.quiz_count}{' '}{tr('kuis')}</span>
              </span>
            ) : null}
          </div>

          {isProcessing && (
            <div className={styles.jobProgressBox} style={{ maxWidth: '300px' }}>
              <div className={styles.jobMessage}>
                <Icon name="refresh" size={12} className="spin" />
                <span>{doc.job_message || tr('Sedang memproses…')} ({progressPct}%)</span>
              </div>
              <div
                className={styles.jobProgressBar}
                role="progressbar"
                aria-valuenow={progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={styles.jobProgressFill}
                  style={{ width: `${Math.max(5, progressPct)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <StatusBadge status={doc.status} />
    </SurfaceCard>
  );
}

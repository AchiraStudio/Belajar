import React from 'react';
import { Link } from 'react-router';
import { Icon } from '../../components/ui';
import { relDay } from '../dashboard/utils';
import type { WorkspaceDocument, DocumentSubject, DocumentNote, DocumentQuizSummary } from './types';
import styles from './Workspace.module.css';
import { tr } from '../../services/i18n';

interface WorkspaceHeaderProps {
  document: WorkspaceDocument;
  subject?: DocumentSubject | null;
  note?: DocumentNote | null;
  quizzes?: DocumentQuizSummary[];
}

export function WorkspaceHeader({
  document: doc,
  subject,
  note,
  quizzes = [],
}: WorkspaceHeaderProps) {
  // Best score calculation
  const bestScore = quizzes.reduce<number | null>((acc, q) => {
    if (q.best_pct != null) {
      return acc == null ? q.best_pct : Math.max(acc, q.best_pct);
    }
    return acc;
  }, null);

  // Reading time estimate
  const words = (note?.content_md || '').split(/\s+/).filter(Boolean).length;
  const readingTimeMin = Math.max(1, Math.round(words / 200));

  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <Link to="/materi" className={styles.backLink} aria-label={tr('Kembali ke semua materi')}>
          <Icon name="chevron-left" size={16} />
          <span>{tr('Semua materi')}</span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {subject && (
            <span className={styles.subjectPill}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: subject.color || 'var(--accent)',
                }}
              />
              <span>{subject.name}</span>
            </span>
          )}

          {note?.edited === 1 && (
            <span className={styles.editedBadge}>
              <Icon name="edit" size={12} />
              <span>{tr('Sudah kamu edit')}</span>
            </span>
          )}
        </div>
      </div>

      <h1 className={styles.docTitle}>{doc.title}</h1>

      <div className={styles.headerMeta}>
        {doc.filename && <span>{doc.filename}</span>}
        {doc.page_count ? <span>{doc.page_count}{' '}{tr('halaman/slide')}</span> : null}
        <span>{tr('Diperbarui')}{' '}{relDay(doc.updated_at || doc.created_at)}</span>
      </div>

      {/* Stats Bar */}
      <div className={styles.statsBar}>
        <div className={styles.statPill}>
          <Icon name="quiz" size={14} />
          <span><b>{quizzes.length}</b>{' '}{tr('kuis')}</span>
        </div>

        {bestScore != null && (
          <div className={styles.statPill}>
            <Icon name="trophy" size={14} />
            <span>{tr('Skor terbaik')}{' '}<b>{Math.round(bestScore)}%</b></span>
          </div>
        )}

        <div className={styles.statPill}>
          <Icon name="book" size={14} />
          <span><b>{readingTimeMin}</b>{' '}{tr('mnt baca')}</span>
        </div>

        <Link to={`/chat/${doc.id}`} className={styles.chatLink} aria-label={tr('Buka Chat AI untuk materi ini')}>
          <Icon name="sparkles" size={14} />
          <span>{tr('Chat AI')}</span>
        </Link>
      </div>
    </header>
  );
}

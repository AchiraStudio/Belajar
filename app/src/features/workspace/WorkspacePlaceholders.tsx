import React from 'react';
import { SurfaceCard, FrostPanel, Icon, StatusBadge } from '../../components/ui';
import type { DocumentQuizSummary, WorkspaceDocument } from './types';
import styles from './Workspace.module.css';

interface MindmapPlaceholderProps {
  document: WorkspaceDocument;
}

export function MindmapPlaceholder({ document: doc }: MindmapPlaceholderProps) {
  const concepts = doc.key_concepts || [];

  return (
    <div className={styles.placeholderContainer} aria-label="Tab Mind Map">
      <SurfaceCard padded className={styles.placeholderCard}>
        <div className={styles.placeholderHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icon name="cards" size={24} />
            <h2 className={styles.placeholderTitle}>Mind Map Interaktif</h2>
          </div>
          <span className={styles.badgeM3}>Milestone 3 — Segera Hadir</span>
        </div>

        <p className={styles.placeholderDesc}>
          Visualisasi pohon konsep dua arah, fitur lipat/buka cabang, sorotan lompat ke catatan, serta ekspor format SVG & PNG akan hadir lengkap pada Milestone 3.
        </p>

        {concepts.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>
              Konsep Utama Terdeteksi:
            </div>
            <div className={styles.conceptChips}>
              {concepts.map((c, i) => (
                <span key={i} className={styles.conceptChip}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}

interface QuizzesPlaceholderProps {
  quizzes: DocumentQuizSummary[];
}

export function QuizzesPlaceholder({ quizzes }: QuizzesPlaceholderProps) {
  return (
    <div className={styles.placeholderContainer} aria-label="Tab Kuis">
      <SurfaceCard padded className={styles.placeholderCard}>
        <div className={styles.placeholderHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icon name="quiz" size={24} />
            <h2 className={styles.placeholderTitle}>Kuis Materi ({quizzes.length})</h2>
          </div>
          <span className={styles.badgeM3}>Milestone 3 — Segera Hadir</span>
        </div>

        <p className={styles.placeholderDesc}>
          Generator paket soal AI baru, mode latihan dengan umpan balik instan, serta ujian berbatas waktu dengan persistensi jawaban akan hadir lengkap pada Milestone 3.
        </p>

        {quizzes.length > 0 ? (
          <div className={styles.quizzesList} role="list">
            {quizzes.map((q) => (
              <FrostPanel key={q.id} elevation="panel" className={styles.quizItem} role="listitem">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{q.title}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {q.question_count} butir soal · Kesulitan: {q.difficulty || 'Sedang'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {q.best_pct != null && (
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--success)' }}>
                      Terbaik: {Math.round(q.best_pct)}%
                    </span>
                  )}
                  <StatusBadge status="ready" label="Siap dikerjakan" />
                </div>
              </FrostPanel>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '12px' }}>
            Belum ada paket kuis untuk materi ini.
          </p>
        )}
      </SurfaceCard>
    </div>
  );
}

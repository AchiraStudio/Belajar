import React, { useState } from 'react';
import { Button, Icon, Select } from '../../components/ui';
import type { TocItem, NoteStyle } from './types';
import styles from './Workspace.module.css';

interface ActionRailProps {
  tocItems: TocItem[];
  activeHeadingId: string | null;
  isEditing: boolean;
  onToggleEdit: () => void;
  onDownloadMd: () => void;
  onPrint: () => void;
  onOpenRename: () => void;
  onOpenDelete: () => void;
  onRegenerate: (style: NoteStyle) => void;
  fontSize: number;
  fontFamily: 'soft' | 'serif';
  onIncreaseFont: () => void;
  onDecreaseFont: () => void;
  onSetFontFamily: (family: 'soft' | 'serif') => void;
  formattedStudyTime: string;
}

export function ActionRail({
  tocItems,
  activeHeadingId,
  isEditing,
  onToggleEdit,
  onDownloadMd,
  onPrint,
  onOpenRename,
  onOpenDelete,
  onRegenerate,
  fontSize,
  fontFamily,
  onIncreaseFont,
  onDecreaseFont,
  onSetFontFamily,
  formattedStudyTime,
}: ActionRailProps) {
  const [regenStyle, setRegenStyle] = useState<NoteStyle>('ringkas');

  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <aside className={styles.actionRail} aria-label="Alat dan navigasi catatan">
      {/* 1. TOC (Isi Catatan) - only in reading mode */}
      {!isEditing && tocItems.length > 0 && (
        <div className={styles.railSection}>
          <div className={styles.railSectionTitle}>Isi Catatan</div>
          <nav className={styles.tocList} aria-label="Daftar isi catatan">
            {tocItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.tocBtn} ${activeHeadingId === item.id ? styles.tocBtnActive : ''}`}
                onClick={() => scrollToHeading(item.id)}
                aria-current={activeHeadingId === item.id ? 'true' : undefined}
              >
                {item.text}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* 2. Tools (Alat) */}
      <div className={styles.railSection}>
        <div className={styles.railSectionTitle}>Alat</div>
        <div className={styles.railActions}>
          <Button
            variant={isEditing ? 'ghost' : 'outline'}
            size="sm"
            icon="edit"
            onClick={onToggleEdit}
            fullWidth
          >
            {isEditing ? 'Tutup editor' : 'Edit catatan'}
          </Button>

          {!isEditing && (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon="download"
                onClick={onDownloadMd}
                fullWidth
              >
                Unduh .md
              </Button>

              <Button
                variant="ghost"
                size="sm"
                icon="book"
                onClick={onPrint}
                fullWidth
              >
                Cetak catatan
              </Button>

              <Button
                variant="ghost"
                size="sm"
                icon="edit"
                onClick={onOpenRename}
                fullWidth
              >
                Ganti judul
              </Button>

              <Button
                variant="danger"
                size="sm"
                icon="trash"
                onClick={onOpenDelete}
                fullWidth
              >
                Hapus materi
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 3. Appearance Controls (Tampilan Baca) */}
      <div className={styles.railSection}>
        <div className={styles.railSectionTitle}>Tampilan Baca</div>

        {/* Font Size */}
        <div className={styles.fontControls}>
          <button
            type="button"
            className={styles.fontBtn}
            onClick={onDecreaseFont}
            disabled={fontSize <= 15}
            aria-label="Kecilkan ukuran teks"
          >
            A-
          </button>
          <span className={styles.fontSizeLabel}>{fontSize}px</span>
          <button
            type="button"
            className={styles.fontBtn}
            onClick={onIncreaseFont}
            disabled={fontSize >= 23}
            aria-label="Besarkan ukuran teks"
          >
            A+
          </button>
        </div>

        {/* Font Family Segmented */}
        <div className={styles.fontSegmented} role="group" aria-label="Jenis font baca">
          <button
            type="button"
            className={`${styles.segmentBtn} ${fontFamily === 'soft' ? styles.segmentBtnActive : ''}`}
            onClick={() => onSetFontFamily('soft')}
            aria-pressed={fontFamily === 'soft'}
          >
            Lembut
          </button>
          <button
            type="button"
            className={`${styles.segmentBtn} ${fontFamily === 'serif' ? styles.segmentBtnActive : ''}`}
            onClick={() => onSetFontFamily('serif')}
            aria-pressed={fontFamily === 'serif'}
          >
            Serif
          </button>
        </div>
      </div>

      {/* 4. Regenerate Note (Buat Ulang Catatan) */}
      {!isEditing && (
        <div className={styles.railSection}>
          <div className={styles.railSectionTitle}>Buat Ulang Catatan</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Select
              value={regenStyle}
              onChange={(e) => setRegenStyle(e.target.value as NoteStyle)}
              aria-label="Pilih gaya untuk membuat ulang catatan"
            >
              <option value="ringkas">Ringkas</option>
              <option value="cornell">Metode Cornell</option>
              <option value="detail">Komprehensif & Detail</option>
              <option value="sederhana">Bahasa Sederhana</option>
            </Select>
            <Button
              variant="outline"
              size="sm"
              icon="refresh"
              onClick={() => onRegenerate(regenStyle)}
              fullWidth
            >
              Buat ulang
            </Button>
          </div>
        </div>
      )}

      {/* 5. Active Study Clock */}
      <div className={styles.studyClockBox} aria-label="Waktu belajar sesi ini">
        <Icon name="clock" size={16} />
        <span>Waktu belajar: <b>{formattedStudyTime}</b></span>
      </div>
    </aside>
  );
}

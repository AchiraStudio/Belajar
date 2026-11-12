import React, { useEffect, useRef, useState } from 'react';
import { renderMarkdown } from './markdown/parser';
import { Icon, useToast } from '../../components/ui';
import { useTextSelection } from './useTextSelection';
import type { TocItem } from './types';
import styles from './Notes.module.css';
import { tr } from '../../services/i18n';

interface NotesReaderProps {
  contentMd: string;
  documentTitle?: string;
  fontScale?: number; // 15 to 23
  readFont?: 'soft' | 'serif';
  onTocChange?: (toc: TocItem[]) => void;
  onAskText?: (text: string) => void;
  isEditing?: boolean;
}

export function NotesReader({
  contentMd,
  documentTitle,
  fontScale = 17,
  readFont = 'soft',
  onTocChange,
  onAskText,
  isEditing = false,
}: NotesReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const [htmlContent, setHtmlContent] = useState<string>('');

  const { coords, clearSelection } = useTextSelection(containerRef, !isEditing);

  useEffect(() => {
    const rendered = renderMarkdown(contentMd);
    setHtmlContent(rendered);
  }, [contentMd]);

  // TOC extraction & Code copy listener
  useEffect(() => {
    if (!containerRef.current) return;
    const root = containerRef.current;

    // Suppress H1 if identical to document title
    const firstH1 = root.querySelector('h1');
    if (firstH1 && documentTitle && firstH1.textContent?.trim().toLowerCase() === documentTitle.trim().toLowerCase()) {
      firstH1.style.display = 'none';
    }

    // Extract H2 sections for TOC
    const h2Elements = Array.from(root.querySelectorAll<HTMLHeadingElement>('h2[id^="bagian-"]'));
    if (onTocChange) {
      onTocChange(h2Elements.map((el) => ({ id: el.id, text: el.textContent || '' })));
    }

    // Delegated click listener for code copy buttons
    const handleCopyClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const copyBtn = target?.closest<HTMLButtonElement>('[data-action="copy"]');
      if (!copyBtn) return;

      const code = copyBtn.getAttribute('data-code') || '';
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(code);
        } else {
          // Fallback
          const ta = document.createElement('textarea');
          ta.value = code;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        const originalText = copyBtn.textContent;
        copyBtn.textContent = tr('Disalin ✓');
        copyBtn.disabled = true;
        toast.success(tr('Kode disalin ke papan klip'));
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.disabled = false;
        }, 1600);
      } catch {
        toast.error(tr('Gagal menyalin kode'));
      }
    };

    root.addEventListener('click', handleCopyClick);
    return () => root.removeEventListener('click', handleCopyClick);
  }, [htmlContent, documentTitle, onTocChange, toast]);

  return (
    <div className={styles.notesContainer}>
      <article
        ref={containerRef}
        className={`${styles.sheet} ${readFont === 'serif' ? styles.serif : styles.soft}`}
        style={{ '--fs': `${fontScale}px` } as React.CSSProperties}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
        aria-label={tr('Isi Catatan')}
      />

      {/* Floating Selection "Tanya AI" Pill */}
      {coords && onAskText && (
        <button
          type="button"
          className={styles.floatingPill}
          style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
          onClick={() => {
            const txt = coords.text;
            clearSelection();
            onAskText(txt);
          }}
          aria-label={tr('Tanya AI tentang teks yang dipilih')}
        >
          <Icon name="sparkles" size={14} />
          <span>{tr('Tanya')}</span>
        </button>
      )}
    </div>
  );
}

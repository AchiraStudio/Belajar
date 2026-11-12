import React, { useState, useRef } from 'react';
import { Button, IconButton, Icon, Input, Select, useToast } from '../../components/ui';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { apiFetch } from '../../services/api/client';
import { dropCache } from '../../services/api/rpc';
import { NOTE_STYLES, type SubjectItem, type UploadResponse } from './types';
import styles from './Materials.module.css';
import { tr } from '../../services/i18n';

interface UploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: SubjectItem[];
  onSuccess: (newDocId: number) => void;
}

const ALLOWED_EXTS = ['.pdf', '.docx', '.pptx', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.txt', '.md'];
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024; // 40 MB

export function UploadDialog({ isOpen, onClose, subjects, onSuccess }: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [newSubject, setNewSubject] = useState('');
  const [style, setStyle] = useState('ringkas');
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isOpen, onClose);

  if (!isOpen) return null;

  const handleFileSelection = (f: File) => {
    const ext = '.' + (f.name.split('.').pop()?.toLowerCase() || '');
    if (!ALLOWED_EXTS.includes(ext)) {
      toast.error(tr('Format {a} tidak didukung. Pilih PDF, Office, Gambar, atau Teks.', { a: ext }));
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      toast.error(tr('Ukuran file melebihi batas maksimum 40 MB.'));
      return;
    }
    setFile(f);
    if (!title) {
      // Default title without extension
      const base = f.name.replace(/\.[^/.]+$/, '');
      setTitle(base.slice(0, 120));
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error(tr('Silakan pilih berkas materi terlebih dahulu.'));
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (title.trim()) formData.append('title', title.trim().slice(0, 120));
      if (subjectId === '__new') {
        if (newSubject.trim()) formData.append('new_subject', newSubject.trim().slice(0, 60));
      } else if (subjectId) {
        formData.append('subject_id', subjectId);
      }
      formData.append('style', style);

      const res = await apiFetch<UploadResponse>('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const docId = res?.data?.doc_id ?? res?.data?.id ?? res?.doc_id ?? res?.id;
      dropCache();
      toast.success(tr('Materi berhasil diunggah! Sedang memproses...'));
      onClose();
      if (docId) {
        onSuccess(docId);
      }
    } catch (err: any) {
      toast.error(err?.message || tr('Gagal mengunggah materi. Periksa server.'));
    } finally {
      setIsUploading(false);
    }
  };

  const currentStyleDesc = tr(NOTE_STYLES.find((s) => s.id === style)?.desc || '');

  return (
    <div ref={dialogRef} className={styles.modalBackdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label={tr('Unggah Materi')}>
      <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{tr('Unggah Materi Baru')}</h2>
          <IconButton label={tr('Tutup dialog')} onClick={onClose} icon="x" size="sm" variant="ghost" />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Dropzone */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_EXTS.join(',')}
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileSelection(e.target.files[0]);
            }}
          />

          {!file ? (
            <div
              className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ''}`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label={tr('Area seret atau pilih berkas materi')}
            >
              <Icon name="upload" size={32} />
              <div className={styles.dropzoneText}>{tr('Seret file ke sini atau klik untuk memilih')}</div>
              <div className={styles.dropzoneSubtext}>
                {tr('Mendukung PDF, DOCX, PPTX, Gambar, TXT, MD (Maks 40 MB)')}
              </div>
            </div>
          ) : (
            <div className={styles.selectedFileCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon name="book" size={20} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{file.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFile(null)}
                type="button"
              >
                {tr('Ganti')}
              </Button>
            </div>
          )}

          {/* Title Override */}
          <Input
            label={tr('Judul Materi (opsional)')}
            placeholder={tr('Contoh: Pengantar Jaringan Komputer')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />

          {/* Subject Picker */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              {tr('Mata Pelajaran')}
            </label>
            <Select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              aria-label={tr('Pilih mata pelajaran')}
            >
              <option value="">{tr('-- Tanpa Mata Pelajaran --')}</option>
              {subjects.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
              <option value="__new">{tr('+ Buat mata pelajaran baru…')}</option>
            </Select>

            {subjectId === '__new' && (
              <div style={{ marginTop: '8px' }}>
                <Input
                  placeholder={tr('Nama mata pelajaran baru')}
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  maxLength={60}
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* Note Style Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              {tr('Gaya Catatan AI')}
            </label>
            <Select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              aria-label={tr('Pilih gaya catatan AI')}
            >
              <optgroup label={tr('Umum')}>
                {NOTE_STYLES.filter((s) => s.group === 'Umum').map((s) => (
                  <option key={s.id} value={s.id}>
                    {tr(s.label)}
                  </option>
                ))}
              </optgroup>
              <optgroup label={tr('Detail')}>
                {NOTE_STYLES.filter((s) => s.group === 'Detail').map((s) => (
                  <option key={s.id} value={s.id}>
                    {tr(s.label)}
                  </option>
                ))}
              </optgroup>
            </Select>
            {currentStyleDesc && <div className={styles.styleDesc}>{currentStyleDesc}</div>}
          </div>

          {/* Submit Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <Button variant="ghost" onClick={onClose} disabled={isUploading} type="button">
              {tr('Batal')}
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={isUploading}
              disabled={!file || isUploading}
              icon="upload"
            >
              {isUploading ? tr('Mengunggah…') : tr('Mulai Proses AI')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

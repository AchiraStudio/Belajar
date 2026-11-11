import React, { useRef, useState } from 'react';
import { Button, IconButton, Input, useToast } from '../../components/ui';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { rpcCall, dropCache } from '../../services/api/rpc';
import { SUBJ_COLORS, type SubjectItem } from './types';
import styles from './Materials.module.css';

interface SubjectManageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: SubjectItem[];
  onSubjectsChange: () => void;
}

export function SubjectManageDialog({
  isOpen,
  onClose,
  subjects,
  onSubjectsChange,
}: SubjectManageDialogProps) {
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(SUBJ_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const toast = useToast();

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isOpen, onClose);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Nama mata pelajaran wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      await rpcCall('create_subject', {
        name: name.trim().slice(0, 60),
        color: selectedColor,
      });
      dropCache();
      setName('');
      toast.success('Mata pelajaran berhasil ditambahkan.');
      onSubjectsChange();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menambahkan mata pelajaran.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await rpcCall('delete_subject', { id });
      dropCache();
      setDeletingId(null);
      toast.success('Mata pelajaran dihapus.');
      onSubjectsChange();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus mata pelajaran.');
    }
  };

  const subjectToDelete = subjects.find((s) => s.id === deletingId);

  return (
    <div
      ref={dialogRef}
      className={styles.modalBackdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Kelola Mata Pelajaran"
    >
      <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Kelola Mata Pelajaran</h2>
          <IconButton label="Tutup dialog" onClick={onClose} icon="x" size="sm" variant="ghost" />
        </div>

        {/* Delete Confirmation Step */}
        {deletingId !== null && subjectToDelete ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              Hapus &quot;{subjectToDelete.name}&quot;?
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: 0 }}>
              Materi di dalam mata pelajaran ini tidak akan terhapus, melainkan dipindahkan ke &quot;Tanpa Mata Pelajaran&quot;.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <Button variant="ghost" size="sm" onClick={() => setDeletingId(null)}>
                Batal
              </Button>
              <Button variant="danger" size="sm" onClick={() => handleDelete(deletingId)}>
                Ya, Hapus
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Create Section */}
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Input
                label="Tambah Mata Pelajaran Baru"
                placeholder="Contoh: Biologi Molekuler"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Pilih Warna Label:
                </label>
                <div className={styles.swatches}>
                  {SUBJ_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      className={`${styles.swatchBtn} ${selectedColor === col ? styles.swatchSelected : ''}`}
                      style={{ backgroundColor: col }}
                      onClick={() => setSelectedColor(col)}
                      aria-label={`Warna ${col}`}
                    />
                  ))}
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                loading={isSubmitting}
                disabled={!name.trim() || isSubmitting}
                icon="plus"
                style={{ alignSelf: 'flex-start' }}
              >
                Tambah
              </Button>
            </form>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />

            {/* List Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>
                Daftar Mata Pelajaran ({subjects.length})
              </h3>
              {subjects.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Belum ada mata pelajaran.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                  {subjects.map((subj) => (
                    <div
                      key={subj.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'var(--surface-raised)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            backgroundColor: subj.color || '#6558E8',
                          }}
                        />
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{subj.name}</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          ({subj.doc_count ?? 0} materi)
                        </span>
                      </div>
                      <IconButton
                        label={`Hapus mata pelajaran ${subj.name}`}
                        icon="trash"
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeletingId(subj.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Selesai
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

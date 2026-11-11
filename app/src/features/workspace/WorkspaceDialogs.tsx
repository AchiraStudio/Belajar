import React, { useEffect, useState } from 'react';
import { Button, Dialog, Input, useToast } from '../../components/ui';
import { rpcCall, dropCache } from '../../services/api/rpc';

/*
 * Confirmation dialogs of the material workspace. They use the shared accessible `Dialog`
 * (focus trap, Escape, focus restore, bottom sheet on narrow screens).
 */

const bodyText: React.CSSProperties = { fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 };

interface RenameTitleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: number;
  currentTitle: string;
  onSuccess: (newTitle: string) => void;
}

export function RenameTitleDialog({ isOpen, onClose, documentId, currentTitle, onSuccess }: RenameTitleDialogProps) {
  const [title, setTitle] = useState(currentTitle);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  // Start from the current title every time the dialog opens.
  useEffect(() => {
    if (isOpen) setTitle(currentTitle);
  }, [isOpen, currentTitle]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!title.trim()) {
      toast.error('Judul materi tidak boleh kosong.');
      return;
    }

    setIsSubmitting(true);
    try {
      const next = title.trim().slice(0, 120);
      await rpcCall('update_document', { id: documentId, title: next });
      dropCache();
      toast.success('Judul materi berhasil diperbarui');
      onSuccess(next);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengubah judul materi');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} title="Ganti Judul Materi" size="sm" dismissible={!isSubmitting}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input label="Judul Baru" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} data-autofocus />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting} type="button">
            Batal
          </Button>
          <Button variant="primary" size="sm" type="submit" loading={isSubmitting} disabled={!title.trim() || isSubmitting}>
            Simpan Judul
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

interface DeleteDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: number;
  documentTitle: string;
  onSuccess: () => void;
}

export function DeleteDocumentDialog({ isOpen, onClose, documentId, documentTitle, onSuccess }: DeleteDocumentDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const toast = useToast();

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await rpcCall('delete_document', { id: documentId });
      dropCache();
      toast.success('Materi berhasil dihapus');
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus materi');
      setIsDeleting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Hapus Materi?"
      size="sm"
      dismissible={!isDeleting}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isDeleting}>
            Batal
          </Button>
          <Button variant="danger" size="sm" onClick={handleDelete} loading={isDeleting} disabled={isDeleting}>
            Ya, Hapus Materi
          </Button>
        </>
      }
    >
      <p style={bodyText}>
        Apakah kamu yakin ingin menghapus materi <b>&quot;{documentTitle}&quot;</b>? Seluruh catatan, data mind map, dan paket kuis yang terkait akan dihapus
        secara permanen.
      </p>
    </Dialog>
  );
}

interface RegenerateConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function RegenerateConfirmDialog({ isOpen, onClose, onConfirm }: RegenerateConfirmDialogProps) {
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Gantikan Catatan Pribadi?"
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            Tetap Buat Ulang
          </Button>
        </>
      }
    >
      <p style={bodyText}>
        Catatan ini telah kamu modifikasi secara manual. Jika kamu membuat ulang catatan dengan AI, seluruh editan pribadimu akan digantikan dengan rangkuman baru.
      </p>
    </Dialog>
  );
}

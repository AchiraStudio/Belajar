import React, { useState } from 'react';
import { Button, Icon, useToast } from '../../components/ui';
import { rpcCall, dropCache } from '../../services/api/rpc';
import styles from './Notes.module.css';

interface NotesEditorProps {
  documentId: number;
  initialContent: string;
  onSaveSuccess: (newContent: string) => void;
  onCancel: () => void;
}

export function NotesEditor({
  documentId,
  initialContent,
  onSaveSuccess,
  onCancel,
}: NotesEditorProps) {
  const [draft, setDraft] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const toast = useToast();

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await rpcCall('save_note', { document_id: documentId, content_md: draft });
      dropCache();
      toast.success('Catatan berhasil disimpan');
      onSaveSuccess(draft);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan catatan');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.editorContainer}>
      <div className={styles.editorToolbar}>
        <p className={styles.editorHint}>
          Format Markdown didukung: <code># Judul</code>, <code>**tebal**</code>, <code>- daftar</code>, <code>$$ rumus $$</code>, <code>| tabel |</code>.
        </p>
        <div className={styles.editorActions}>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
            Batal
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={isSaving} icon="check">
            {isSaving ? 'Menyimpan…' : 'Simpan catatan'}
          </Button>
        </div>
      </div>
      <textarea
        className={styles.textarea}
        aria-label="Isi catatan (Markdown)"
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={isSaving}
      />
    </div>
  );
}

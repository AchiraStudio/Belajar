import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router';
import {
  Skeleton,
  ErrorState,
  SurfaceCard,
  Icon,
  useToast,
} from '../../components/ui';
import { rpcCall, dropCache } from '../../services/api/rpc';
import type {
  DocumentDetailResponse,
  WorkspaceDocument,
  DocumentSubject,
  DocumentNote,
  DocumentQuizSummary,
  TocItem,
  WorkspaceTabId,
  NoteStyle,
} from './types';
import { WorkspaceHeader } from './WorkspaceHeader';
import { ActionRail } from './ActionRail';
import { ReadingProgressBar } from './ReadingProgressBar';
import { MindMapView } from '../mindmap';
import { ChatView } from '../chat';
import { MaterialQuizzes } from '../quizzes/MaterialQuizzes';
import {
  RenameTitleDialog,
  DeleteDocumentDialog,
  RegenerateConfirmDialog,
} from './WorkspaceDialogs';
import { useStudyTimer } from './useStudyTimer';
import { useTocScrollspy } from './useTocScrollspy';
import { useReadingPreferences } from './useReadingPreferences';
import { NotesReader, NotesEditor, TanyaPanel } from '../notes';
import styles from './Workspace.module.css';

export function WorkspaceShell() {
  const { id } = useParams<{ id: string }>();
  const docId = Number(id);

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const activeTab: WorkspaceTabId = (['catatan', 'mindmap', 'chat', 'kuis'].includes(
    searchParams.get('tab') || ''
  )
    ? searchParams.get('tab')
    : 'catatan') as WorkspaceTabId;

  const [document, setDocument] = useState<WorkspaceDocument | null>(null);
  const [subject, setSubject] = useState<DocumentSubject | null>(null);
  const [note, setNote] = useState<DocumentNote | null>(null);
  const [quizzes, setQuizzes] = useState<DocumentQuizSummary[]>([]);
  const [job, setJob] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);

  // Dialog states
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isRegenConfirmOpen, setIsRegenConfirmOpen] = useState(false);
  const [pendingRegenStyle, setPendingRegenStyle] = useState<NoteStyle>('ringkas');

  // Tanya AI state
  const [isTanyaOpen, setIsTanyaOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState('');

  // Hooks
  const {
    fontSize,
    fontFamily,
    increaseFont,
    decreaseFont,
    setFontFamily,
  } = useReadingPreferences();

  const { formattedTime } = useStudyTimer(docId);
  const activeHeadingId = useTocScrollspy(tocItems);

  const loadDocument = useCallback(
    async (bypass = false) => {
      if (!docId || isNaN(docId)) {
        setError('Materi tidak ditemukan.');
        setLoading(false);
        return;
      }

      try {
        const res = await rpcCall<DocumentDetailResponse>(
          'get_document',
          { id: docId },
          { bypassCache: bypass }
        );
        if (res && res.document) {
          setDocument(res.document);
          setSubject(res.subject || null);
          setNote(res.note || null);
          setQuizzes(res.quizzes || []);
          setJob(res.job || null);
          setError(null);
        } else {
          setError('Materi tidak ditemukan.');
        }
      } catch (err: any) {
        setError(err?.message || 'Materi tidak ditemukan.');
      } finally {
        setLoading(false);
      }
    },
    [docId]
  );

  useEffect(() => {
    setLoading(true);
    loadDocument(false);
  }, [loadDocument]);

  // Polling for processing/queued status
  useEffect(() => {
    if (!document) return;
    const isProcessing =
      document.status === 'processing' || document.status === 'queued';
    if (!isProcessing) return;

    const timer = setInterval(() => {
      if (
        typeof window !== 'undefined' &&
        window.document.visibilityState === 'visible'
      ) {
        loadDocument(true);
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [document, loadDocument]);

  const handleTabChange = (tab: WorkspaceTabId) => {
    searchParams.set('tab', tab);
    setSearchParams(searchParams, { replace: true });
  };

  // "Cari di catatan" from the mind map: switch to the notes, then scroll to the first match.
  const [pendingFind, setPendingFind] = useState<string | null>(null);
  const findInNotes = (text: string) => {
    setIsEditing(false);
    handleTabChange('catatan');
    setPendingFind(text);
  };
  useEffect(() => {
    if (!pendingFind || activeTab !== 'catatan' || isEditing || loading) return;
    const needle = pendingFind.toLowerCase();
    const t = setTimeout(() => {
      const root = window.document.getElementById('view');
      const pick = (sel: string) =>
        Array.from(root?.querySelectorAll<HTMLElement>(sel) ?? []).find((e) => (e.textContent ?? '').toLowerCase().includes(needle));
      const hit = pick('h2, h3, h4') ?? pick('strong') ?? pick('p, li, td, th');
      if (!hit) {
        toast.warning('Istilah itu tidak ditemukan di catatan.');
      } else {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        hit.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        hit.setAttribute('data-flash', '1');
        setTimeout(() => hit.removeAttribute('data-flash'), 1900);
      }
      setPendingFind(null);
    }, 80);
    return () => clearTimeout(t);
  }, [pendingFind, activeTab, isEditing, loading, toast]);

  const handleDownloadMd = () => {
    if (!note?.content_md || !document) return;
    const blob = new Blob([note.content_md], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${document.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60)}.md`;
    window.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('File Markdown diunduh');
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const executeRegenerate = async (styleToUse: NoteStyle) => {
    try {
      await rpcCall('reprocess_document', {
        id: docId,
        style: styleToUse,
        force: true,
      });
      dropCache();
      toast.success('Membuat ulang catatan...');
      loadDocument(true);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal membuat ulang catatan');
    }
  };

  const handleRegenerateClick = (styleToUse: NoteStyle) => {
    if (note?.edited === 1) {
      setPendingRegenStyle(styleToUse);
      setIsRegenConfirmOpen(true);
    } else {
      executeRegenerate(styleToUse);
    }
  };

  if (loading) {
    return (
      <div className={styles.container} aria-label="Memuat ruang kerja materi">
        <Skeleton width="180px" height="24px" />
        <Skeleton width="340px" height="38px" />
        <div style={{ display: 'flex', gap: '12px' }}>
          <Skeleton width="100px" height="32px" />
          <Skeleton width="100px" height="32px" />
        </div>
        <div className={styles.workspaceLayout}>
          <Skeleton height="500px" borderRadius="12px" />
          <Skeleton height="360px" borderRadius="12px" />
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className={styles.container} aria-label="Error ruang kerja materi">
        <ErrorState
          title="Materi Tidak Ditemukan"
          message={error || 'Materi yang kamu cari tidak ada atau sudah dihapus.'}
          onRetry={() => navigate('/materi')}
          retryLabel="Kembali ke Semua Materi"
        />
      </div>
    );
  }

  const isProcessing =
    document.status === 'processing' || document.status === 'queued';
  const progressPct = Math.round(job?.progress ?? document.page_count ? 20 : 10);

  return (
    <div className={styles.container} aria-label={`Ruang Kerja: ${document.title}`}>
      {/* Top Fixed Reading Progress Bar */}
      <ReadingProgressBar />

      {/* Header */}
      <WorkspaceHeader
        document={document}
        subject={subject}
        note={note}
        quizzes={quizzes}
      />

      {/* Tab Strip */}
      <div className={styles.tabStrip} role="tablist" aria-label="Navigasi Ruang Kerja">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'catatan'}
          className={`${styles.tabBtn} ${activeTab === 'catatan' ? styles.tabBtnActive : ''}`}
          onClick={() => handleTabChange('catatan')}
        >
          <Icon name="book" size={16} />
          <span>Catatan</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'mindmap'}
          className={`${styles.tabBtn} ${activeTab === 'mindmap' ? styles.tabBtnActive : ''}`}
          onClick={() => handleTabChange('mindmap')}
        >
          <Icon name="network" size={16} />
          <span>Mind Map</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'chat'}
          className={`${styles.tabBtn} ${activeTab === 'chat' ? styles.tabBtnActive : ''}`}
          onClick={() => handleTabChange('chat')}
        >
          <Icon name="message" size={16} />
          <span>Tanya AI</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'kuis'}
          className={`${styles.tabBtn} ${activeTab === 'kuis' ? styles.tabBtnActive : ''}`}
          onClick={() => handleTabChange('kuis')}
        >
          <Icon name="quiz" size={16} />
          <span>Kuis</span>
          <span className={styles.tabCount}>{quizzes.length}</span>
        </button>
      </div>

      {/* Processing State Notice */}
      {isProcessing ? (
        <SurfaceCard padded className={styles.processingCard}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
            Catatan Sedang Dibuat
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
            <Icon name="refresh" size={16} className="spin" />
            <span>{job?.message || 'Menunggu giliran diproses oleh AI...'}</span>
          </div>
          <div
            className={styles.processingBarTrack}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={styles.processingBarFill}
              style={{ width: `${Math.max(5, progressPct)}%` }}
            />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, maxWidth: '440px' }}>
            Materi panjang bisa memakan beberapa menit. Halaman ini boleh ditinggalkan, prosesnya tetap berjalan otomatis.
          </p>
        </SurfaceCard>
      ) : (
        /* Workspace Content */
        <div className={`${styles.workspaceLayout} ${activeTab === 'catatan' ? '' : styles.workspaceLayoutWide}`}>
          <div className={styles.mainColumn}>
            {activeTab === 'catatan' && (
              <>
                {isEditing ? (
                  <NotesEditor
                    documentId={docId}
                    initialContent={note?.content_md || ''}
                    onSaveSuccess={(newMd) => {
                      setNote((prev) =>
                        prev ? { ...prev, content_md: newMd, edited: 1 } : null
                      );
                      setIsEditing(false);
                    }}
                    onCancel={() => setIsEditing(false)}
                  />
                ) : (
                  <NotesReader
                    contentMd={note?.content_md || 'Belum ada isi catatan.'}
                    documentTitle={document.title}
                    fontScale={fontSize}
                    readFont={fontFamily}
                    onTocChange={setTocItems}
                    onAskText={(quote) => {
                      setSelectedQuote(quote);
                      setIsTanyaOpen(true);
                    }}
                    isEditing={isEditing}
                  />
                )}
              </>
            )}

            {activeTab === 'mindmap' && (
              <MindMapView documentId={docId} onFindInNotes={findInNotes} />
            )}

            {activeTab === 'chat' && (
              <ChatView documentId={docId} onDeleted={() => handleTabChange('catatan')} />
            )}

            {activeTab === 'kuis' && (
              <MaterialQuizzes
                documentId={docId}
                quizzes={quizzes}
                canGenerate={document.status === 'ready' && Boolean(note)}
                onChanged={() => loadDocument(true)}
              />
            )}
          </div>

          {/* Action Rail: note tools only */}
          {activeTab === 'catatan' && (
          <ActionRail
            tocItems={tocItems}
            activeHeadingId={activeHeadingId}
            isEditing={isEditing}
            onToggleEdit={() => setIsEditing(!isEditing)}
            onDownloadMd={handleDownloadMd}
            onPrint={handlePrint}
            onOpenRename={() => setIsRenameOpen(true)}
            onOpenDelete={() => setIsDeleteOpen(true)}
            onRegenerate={handleRegenerateClick}
            fontSize={fontSize}
            fontFamily={fontFamily}
            onIncreaseFont={increaseFont}
            onDecreaseFont={decreaseFont}
            onSetFontFamily={setFontFamily}
            formattedStudyTime={formattedTime}
          />
          )}
        </div>
      )}

      {/* Tanya AI Slide-out Popover */}
      <TanyaPanel
        isOpen={isTanyaOpen}
        onClose={() => setIsTanyaOpen(false)}
        documentId={docId}
        initialQuote={selectedQuote}
      />

      {/* Dialogs */}
      <RenameTitleDialog
        isOpen={isRenameOpen}
        onClose={() => setIsRenameOpen(false)}
        documentId={docId}
        currentTitle={document.title}
        onSuccess={(newTitle) => {
          setDocument((prev) => (prev ? { ...prev, title: newTitle } : null));
        }}
      />

      <DeleteDocumentDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        documentId={docId}
        documentTitle={document.title}
        onSuccess={() => {
          navigate('/materi');
        }}
      />

      <RegenerateConfirmDialog
        isOpen={isRegenConfirmOpen}
        onClose={() => setIsRegenConfirmOpen(false)}
        onConfirm={() => executeRegenerate(pendingRegenStyle)}
      />
    </div>
  );
}

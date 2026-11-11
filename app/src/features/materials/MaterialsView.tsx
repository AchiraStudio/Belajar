import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Button,
  Icon,
  Input,
  Skeleton,
  EmptyState,
  ErrorState,
} from '../../components/ui';
import { rpcCall } from '../../services/api/rpc';
import type { MaterialDoc, SubjectItem, ViewMode, SortMode } from './types';
import { DocumentCard } from './DocumentCard';
import { DocumentRow } from './DocumentRow';
import { UploadDialog } from './UploadDialog';
import { SubjectManageDialog } from './SubjectManageDialog';
import styles from './Materials.module.css';

export function MaterialsView() {
  const [documents, setDocuments] = useState<MaterialDoc[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // URL-synced subject filter
  const currentSubjectId = searchParams.get('s') || '';

  // LocalStorage-synced view mode & sort mode
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (window.localStorage.getItem('belajar-view-mode') as ViewMode) || 'grid';
    }
    return 'grid';
  });

  const [sortMode, setSortMode] = useState<SortMode>(() => {
    if (typeof window !== 'undefined') {
      return (window.localStorage.getItem('belajar-sort') as SortMode) || 'new';
    }
    return 'new';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isSubjectManageOpen, setIsSubjectManageOpen] = useState(false);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      window.localStorage.setItem('belajar-view-mode', mode);
    } catch {
      /* ignore */
    }
  };

  const handleSortChange = (mode: SortMode) => {
    setSortMode(mode);
    try {
      window.localStorage.setItem('belajar-sort', mode);
    } catch {
      /* ignore */
    }
  };

  // Data Loading
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const [subjRes, docRes] = await Promise.all([
        rpcCall<{ subjects: SubjectItem[] }>('list_subjects'),
        rpcCall<{ documents: MaterialDoc[] }>('list_documents', currentSubjectId ? { subject_id: Number(currentSubjectId) } : {}, {
          bypassCache: isSilent,
        }),
      ]);
      setSubjects(subjRes.subjects || []);
      setDocuments(docRes.documents || []);
    } catch (err: any) {
      if (!isSilent) {
        setError(err?.message || 'Gagal memuat katalog materi.');
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [currentSubjectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Active Job Polling: every 2.5s when any document is processing/queued
  useEffect(() => {
    const hasActiveJob = documents.some((d) => d.status === 'processing' || d.status === 'queued');
    if (!hasActiveJob) return;

    let timer: NodeJS.Timeout;

    const poll = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadData(true);
      }
    };

    timer = setInterval(poll, 2500);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        poll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [documents, loadData]);

  // Filtering & Sorting
  const filteredAndSortedDocs = useMemo(() => {
    let list = [...documents];

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((d) => d.title.toLowerCase().includes(q) || (d.summary && d.summary.toLowerCase().includes(q)));
    }

    // Sort
    list.sort((a, b) => {
      if (sortMode === 'az') {
        return a.title.localeCompare(b.title, 'id-ID');
      }
      if (sortMode === 'quiz') {
        return (b.quiz_count || 0) - (a.quiz_count || 0);
      }
      // 'new' default: newest created_at / id
      const dateA = a.created_at ? new Date(a.created_at).getTime() : a.id;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : b.id;
      return dateB - dateA;
    });

    return list;
  }, [documents, searchQuery, sortMode]);

  // Filter Chip navigation
  const selectSubject = (subjId?: number) => {
    if (!subjId) {
      searchParams.delete('s');
      setSearchParams(searchParams, { replace: true });
    } else {
      searchParams.set('s', String(subjId));
      setSearchParams(searchParams, { replace: true });
    }
  };

  if (loading) {
    return (
      <div className={styles.container} aria-label="Memuat katalog materi">
        <header className={styles.header}>
          <Skeleton width="220px" height="36px" />
          <Skeleton width="140px" height="36px" />
        </header>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Skeleton width="300px" height="38px" />
          <Skeleton width="120px" height="38px" />
        </div>
        <div className={styles.chipsRow}>
          <Skeleton width="80px" height="32px" borderRadius="999px" />
          <Skeleton width="110px" height="32px" borderRadius="999px" />
          <Skeleton width="100px" height="32px" borderRadius="999px" />
        </div>
        <div className={styles.gridCatalog}>
          <Skeleton height="180px" borderRadius="12px" />
          <Skeleton height="180px" borderRadius="12px" />
          <Skeleton height="180px" borderRadius="12px" />
          <Skeleton height="180px" borderRadius="12px" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container} aria-label="Error materi">
        <ErrorState
          title="Gagal Memuat Materi"
          message={error}
          onRetry={() => loadData(false)}
        />
      </div>
    );
  }

  // Determine empty states:
  // 1. Overall library is empty (no docs returned when no subject filter applied)
  const isOverallEmpty = documents.length === 0 && !currentSubjectId && !searchQuery.trim();
  // 2. Selected subject is empty
  const isSubjectEmpty = documents.length === 0 && Boolean(currentSubjectId) && !searchQuery.trim();
  // 3. Search yields 0 matches
  const isSearchEmpty = filteredAndSortedDocs.length === 0 && Boolean(searchQuery.trim());

  return (
    <div className={styles.container} aria-label="Materi">
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Materi Belajar</h1>
          <span className={styles.countBadge}>
            {filteredAndSortedDocs.length} materi
          </span>
        </div>

        <div className={styles.headerActions}>
          <Button
            variant="primary"
            size="md"
            icon="plus"
            onClick={() => setIsUploadOpen(true)}
          >
            Unggah materi
          </Button>

          <Button
            variant="outline"
            size="md"
            icon="folder"
            onClick={() => setIsSubjectManageOpen(true)}
          >
            Kelola Mata Pelajaran
          </Button>
        </div>
      </header>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Input
            placeholder="Cari materi berdasarkan judul…"
            icon="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            clearable
            aria-label="Cari materi"
          />
        </div>

        <div className={styles.controlsWrap}>
          <select
            className={styles.sortSelect}
            value={sortMode}
            onChange={(e) => handleSortChange(e.target.value as SortMode)}
            aria-label="Urutkan materi"
          >
            <option value="new">Terbaru</option>
            <option value="az">Judul A–Z</option>
            <option value="quiz">Paling banyak kuis</option>
          </select>

          <div className={styles.viewToggle} role="group" aria-label="Mode tampilan">
            <button
              type="button"
              className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewBtnActive : ''}`}
              onClick={() => handleViewModeChange('grid')}
              aria-label="Tampilan Grid"
              aria-pressed={viewMode === 'grid'}
            >
              <Icon name="cards" size={16} />
            </button>
            <button
              type="button"
              className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewBtnActive : ''}`}
              onClick={() => handleViewModeChange('list')}
              aria-label="Tampilan Daftar"
              aria-pressed={viewMode === 'list'}
            >
              <Icon name="menu" size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Subject Filter Chips */}
      <div className={styles.chipsRow} role="tablist" aria-label="Filter Mata Pelajaran">
        <button
          type="button"
          role="tab"
          aria-selected={!currentSubjectId}
          className={`${styles.chip} ${!currentSubjectId ? styles.chipActive : ''}`}
          onClick={() => selectSubject(undefined)}
        >
          Semua
        </button>

        {subjects.map((subj) => {
          const isSelected = currentSubjectId === String(subj.id);
          return (
            <button
              key={subj.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`${styles.chip} ${isSelected ? styles.chipActive : ''}`}
              onClick={() => selectSubject(subj.id)}
            >
              <span
                className={styles.chipDot}
                style={{ backgroundColor: isSelected ? '#ffffff' : subj.color || 'var(--accent)' }}
              />
              <span>{subj.name}</span>
              {subj.doc_count != null ? (
                <span className={styles.chipCount}>({subj.doc_count})</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Content State */}
      {isOverallEmpty ? (
        <EmptyState
          icon="folder"
          title="Belum ada materi"
          description="Kamu belum memiliki berkas materi belajar. Unggah berkas dokumen atau materi pertama untuk mulai belajar."
          actionLabel="Unggah Materi"
          onAction={() => setIsUploadOpen(true)}
        />
      ) : isSubjectEmpty ? (
        <EmptyState
          icon="folder"
          title="Belum ada materi di mata pelajaran ini"
          description="Belum ada berkas materi yang diasosiasikan dengan mata pelajaran yang dipilih."
          actionLabel="Unggah Materi ke Sini"
          onAction={() => setIsUploadOpen(true)}
        />
      ) : isSearchEmpty ? (
        <EmptyState
          icon="search"
          title="Tidak ada materi yang cocok"
          description={`Tidak ditemukan materi dengan kata kunci "${searchQuery}".`}
          actionLabel="Hapus pencarian"
          onAction={() => setSearchQuery('')}
        />
      ) : (
        <div
          className={viewMode === 'grid' ? styles.gridCatalog : styles.listCatalog}
          role="list"
          aria-label="Katalog Materi"
        >
          {filteredAndSortedDocs.map((doc) =>
            viewMode === 'grid' ? (
              <DocumentCard
                key={doc.id}
                document={doc}
                onClick={() => navigate(`/materi/${doc.id}`)}
              />
            ) : (
              <DocumentRow
                key={doc.id}
                document={doc}
                onClick={() => navigate(`/materi/${doc.id}`)}
              />
            )
          )}
        </div>
      )}

      {/* Modals */}
      <UploadDialog
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        subjects={subjects}
        onSuccess={(docId) => {
          loadData(true);
          navigate(`/materi/${docId}`);
        }}
      />

      <SubjectManageDialog
        isOpen={isSubjectManageOpen}
        onClose={() => setIsSubjectManageOpen(false)}
        subjects={subjects}
        onSubjectsChange={() => loadData(true)}
      />
    </div>
  );
}

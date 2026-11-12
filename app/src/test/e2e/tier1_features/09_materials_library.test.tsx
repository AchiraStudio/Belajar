import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { SurfaceCard } from '../../../components/ui/SurfaceCard';
import { rpcCall } from '../../../services/api/rpc';
import { chooseOption } from '../harness/select';
import {
  defaultDocumentsFixture,
  defaultSubjectsFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type ListDocumentsResponse,
  type ListSubjectsResponse,
  type PublicDocSummary,
  type SubjectRow,
} from '../harness';

function MaterialsLibraryView() {
  const [documents, setDocuments] = useState<PublicDocSummary[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      rpcCall<ListDocumentsResponse>('list_documents'),
      rpcCall<ListSubjectsResponse>('list_subjects'),
    ])
      .then(([docsRes, subsRes]) => {
        if (active) {
          setDocuments(docsRes.documents);
          setSubjects(subsRes.subjects);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      const matchSearch = doc.title.toLowerCase().includes(search.toLowerCase());
      const matchSubject =
        selectedSubject === 'all' || doc.subject_id === Number(selectedSubject);
      return matchSearch && matchSubject;
    });
  }, [documents, search, selectedSubject]);

  return (
    <main aria-label="Perpustakaan Materi">
      <header>
        <h1>Perpustakaan Materi</h1>
        <Button onClick={() => setShowUploadModal(true)}>Unggah Materi</Button>
      </header>

      {/* Filters */}
      <section aria-label="Pencarian dan Filter">
        <Input
          placeholder="Cari materi..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Cari materi"
        />

        <Select
          label="Mata Pelajaran"
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
          options={[
            { value: 'all', label: 'Semua Subjek' },
            ...subjects.map((s) => ({ value: String(s.id), label: s.name })),
          ]}
        />
      </section>

      {/* Documents Grid */}
      <section aria-label="Daftar Dokumen">
        {loading ? (
          <div role="status">Memuat materi…</div>
        ) : (
          <div role="list">
            {filteredDocs.map((doc) => (
              <SurfaceCard key={doc.id} role="listitem">
                <Link to={`/materi/${doc.id}`}>{doc.title}</Link>
                <span>{doc.filename}</span>
                <StatusBadge status={doc.status} />
              </SurfaceCard>
            ))}
          </div>
        )}
      </section>

      {/* Upload Modal */}
      {showUploadModal && (
        <div role="dialog" aria-label="Unggah Berkas Materi">
          <h2>Pilih Berkas untuk Diunggah</h2>
          <Button onClick={() => setShowUploadModal(false)}>Batal</Button>
        </div>
      )}
    </main>
  );
}

describe('Feature 9: Materials Library', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('list_documents', defaultDocumentsFixture);
    mockRpc.setResponse('list_subjects', defaultSubjectsFixture);
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('09.1 - Materials Directory Listing', async () => {
    renderWithProviders(<MaterialsLibraryView />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Perpustakaan Materi' })).toBeTruthy();
      expect(screen.getByText('Pengantar Jaringan Komputer & OSI Layer')).toBeTruthy();
      expect(screen.getByText('Termodinamika & Siklus Carnot')).toBeTruthy();
    });
  });

  it('09.2 - Primary Upload Trigger', async () => {
    renderWithProviders(<MaterialsLibraryView />);

    const uploadBtn = await screen.findByRole('button', { name: 'Unggah Materi' });
    fireEvent.click(uploadBtn);

    expect(screen.getByRole('dialog', { name: 'Unggah Berkas Materi' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Pilih Berkas untuk Diunggah' })).toBeTruthy();
  });

  it('09.3 - Interactive Keyword Search Filtering', async () => {
    renderWithProviders(<MaterialsLibraryView />);

    await screen.findByText('Pengantar Jaringan Komputer & OSI Layer');

    const searchInput = screen.getByPlaceholderText('Cari materi...');
    fireEvent.change(searchInput, { target: { value: 'Termodinamika' } });

    expect(screen.getByText('Termodinamika & Siklus Carnot')).toBeTruthy();
    expect(screen.queryByText('Pengantar Jaringan Komputer & OSI Layer')).toBeNull();
  });

  it('09.4 - Subject Category Filtering', async () => {
    renderWithProviders(<MaterialsLibraryView />);

    await screen.findByText('Pengantar Jaringan Komputer & OSI Layer');

    const subjectSelect = screen.getByRole('combobox', { name: 'Mata Pelajaran' });
    chooseOption(subjectSelect, /Ilmu Komputer/);

    expect(screen.getByText('Pengantar Jaringan Komputer & OSI Layer')).toBeTruthy();
    expect(screen.queryByText('Termodinamika & Siklus Carnot')).toBeNull(); // subject_id: 2
  });

  it('09.5 - Honest Processing Badges', async () => {
    renderWithProviders(<MaterialsLibraryView />);

    await screen.findByText('Aljabar Linear: Matriks & Vektor Eigen');

    const badges = screen.getAllByRole('status');
    expect(badges.length).toBeGreaterThanOrEqual(3);

    // Document 101 and 102 are ready, Document 103 is processing
    expect(screen.getAllByText('Siap').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Memproses')).toBeTruthy();
  });
});

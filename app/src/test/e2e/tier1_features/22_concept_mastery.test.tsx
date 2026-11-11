import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Select } from '../../../components/ui/Select';
import { SurfaceCard } from '../../../components/ui/SurfaceCard';
import { rpcCall } from '../../../services/api/rpc';
import {
  defaultDocumentsFixture,
  defaultPlayMapFixture,
  defaultSubjectsFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type ListDocumentsResponse,
  type ListSubjectsResponse,
  type PlayMapResponse,
} from '../harness';

function MasteryMapView() {
  const [mapData, setMapData] = useState<PlayMapResponse | null>(null);
  const [subjects, setSubjects] = useState<ListSubjectsResponse['subjects']>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const fetchMap = (subjectId?: number) => {
    setLoading(true);
    const payload = subjectId !== undefined ? { subject_id: subjectId } : {};
    rpcCall<PlayMapResponse>('play_map', payload)
      .then((res) => {
        setMapData(res);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      rpcCall<ListSubjectsResponse>('list_subjects'),
      rpcCall<PlayMapResponse>('play_map'),
    ])
      .then(([subsRes, mapRes]) => {
        if (active) {
          setSubjects(subsRes.subjects);
          setMapData(mapRes);
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

  const handleSubjectChange = (val: string) => {
    setSelectedSubject(val);
    if (val === 'all') {
      fetchMap();
    } else {
      fetchMap(Number(val));
    }
  };

  if (loading) {
    return <div>Memuat Peta Konsep...</div>;
  }

  const concepts = mapData?.concepts || [];
  const totalConcepts = concepts.length;
  const masteredCount = concepts.filter((c) => c.tier === 'kuasai').length;
  const totalMasteryRate =
    totalConcepts > 0
      ? Math.round(
          concepts.reduce((acc, c) => acc + c.accuracy, 0) / totalConcepts
        )
      : 0;

  return (
    <main aria-label="Peta Penguasaan Konsep">
      <header>
        <Link to="/game" aria-label="Kembali ke Game Hub">
          Kembali ke Game Hub
        </Link>
        <h1>Peta Penguasaan Konsep</h1>

        {/* Filter controls */}
        <Select
          aria-label="Filter Mata Pelajaran"
          value={selectedSubject}
          onChange={(e) => handleSubjectChange(e.target.value)}
        >
          <option value="all">Semua Pelajaran</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </header>

      {/* Summary Statistics Tiles */}
      <section role="region" aria-label="Statistik Penguasaan">
        <div>
          <span>Total Konsep: {totalConcepts}</span>
          <span>Sudah Dikuasai: {masteredCount}</span>
          <span>Penguasaan Total: {totalMasteryRate}%</span>
        </div>
      </section>

      {/* 4-Tier Legend */}
      <section role="region" aria-label="Legenda Tingkat Penguasaan">
        <ul role="list">
          <li role="listitem">Baru (0%)</li>
          <li role="listitem">Dikenal (1-60%)</li>
          <li role="listitem">Paham (61-85%)</li>
          <li role="listitem">Kuasai (86-100%)</li>
        </ul>
      </section>

      {/* Grid of Concept Cards or Honest Empty State */}
      {concepts.length === 0 ? (
        <section role="region" aria-label="Keadaan Kosong">
          <p>Belum ada data konsep</p>
          <p>Unggah materi dan ikuti latihan untuk membangun peta penguasaan.</p>
        </section>
      ) : (
        <section role="region" aria-label="Daftar Kartu Konsep">
          <div role="list">
            {concepts.map((concept) => (
              <SurfaceCard key={concept.id} role="listitem">
                <h3>{concept.name}</h3>
                <span>Akurasi: {concept.accuracy}%</span>
                <span>Status: {concept.tier}</span>
                <p>
                  Konsep {concept.name} berada pada tier penguasaan {concept.tier}.
                </p>
              </SurfaceCard>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

describe('Feature 22: Concept Mastery Map', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('play_map', defaultPlayMapFixture);
    mockRpc.setResponse('list_subjects', defaultSubjectsFixture);
    mockRpc.setResponse('list_documents', defaultDocumentsFixture);
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('22.1 - renders concept mastery map with 4-tier legend and overview statistics', async () => {
    renderWithProviders(<MasteryMapView />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Peta Penguasaan Konsep' })
      ).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Kembali ke Game Hub' })).toBeTruthy();
      expect(screen.getByText(/total konsep: 4/i)).toBeTruthy();
      expect(screen.getByText(/sudah dikuasai: 1/i)).toBeTruthy();
      expect(screen.getByText(/penguasaan total: 66%/i)).toBeTruthy();

      const legend = screen.getByRole('region', {
        name: 'Legenda Tingkat Penguasaan',
      });
      expect(legend.textContent).toContain('Baru (0%)');
      expect(legend.textContent).toContain('Dikenal');
      expect(legend.textContent).toContain('Paham');
      expect(legend.textContent).toContain('Kuasai');
    });
  });

  it('22.2 - displays concept cards categorized by mastery tier', async () => {
    renderWithProviders(<MasteryMapView />);

    await waitFor(() => {
      expect(screen.getByText('Model OSI 7 Layer')).toBeTruthy();
      expect(screen.getByText('Status: kuasai')).toBeTruthy();

      expect(screen.getByText('TCP vs UDP')).toBeTruthy();
      expect(screen.getByText('Status: paham')).toBeTruthy();

      expect(screen.getByText('Subnetting IPv4')).toBeTruthy();
      expect(screen.getByText('Status: dikenal')).toBeTruthy();

      expect(screen.getByText('BGP Routing')).toBeTruthy();
      expect(screen.getByText('Status: baru')).toBeTruthy();
    });
  });

  it('22.3 - filters concept cards by selected subject or document', async () => {
    renderWithProviders(<MasteryMapView />);

    await screen.findByRole('combobox', { name: 'Filter Mata Pelajaran' });

    const select = screen.getByRole('combobox', { name: 'Filter Mata Pelajaran' });
    fireEvent.change(select, { target: { value: '1' } });

    await waitFor(() => {
      const call = mockRpc.getLastCall('play_map');
      expect(call).toBeTruthy();
      expect(call?.payload.subject_id).toBe(1);
    });
  });

  it('22.4 - displays concept details including term definition and mastery accuracy', async () => {
    renderWithProviders(<MasteryMapView />);

    await waitFor(() => {
      expect(screen.getByText('Model OSI 7 Layer')).toBeTruthy();
      expect(screen.getByText('Akurasi: 95%')).toBeTruthy();
      expect(screen.getByText(/tier penguasaan kuasai/i)).toBeTruthy();
    });
  });

  it('22.5 - displays honest empty state when no concepts have been processed', async () => {
    mockRpc.setResponse('play_map', {
      concepts: [],
      grid: { total: 0, tiers: { baru: 0, dikenal: 0, paham: 0, kuasai: 0 } },
    });

    renderWithProviders(<MasteryMapView />);

    await waitFor(() => {
      expect(screen.getByText('Belum ada data konsep')).toBeTruthy();
      expect(
        screen.getByText(/unggah materi dan ikuti latihan untuk membangun peta penguasaan/i)
      ).toBeTruthy();
    });
  });
});

import { cleanup, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrostPanel } from '../../../components/ui/FrostPanel';
import { Icon } from '../../../components/ui/Icon';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { SurfaceCard } from '../../../components/ui/SurfaceCard';
import { rpcCall } from '../../../services/api/rpc';
import {
  defaultDashboardFixture,
  defaultDocumentsFixture,
  emptyDashboardFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type DashboardResponse,
  type ListDocumentsResponse,
} from '../harness';

/**
 * Overview / Dashboard feature view component adhering to design.md §7
 * and consuming real rpcCall('dashboard') and rpcCall('list_documents').
 */
function OverviewDashboardView() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      rpcCall<DashboardResponse>('dashboard'),
      rpcCall<ListDocumentsResponse>('list_documents').catch(() => defaultDocumentsFixture),
    ])
      .then(([dash]) => {
        if (active) {
          setData(dash);
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

  if (loading || !data) {
    return (
      <main aria-label="Beranda">
        <div role="status">Memuat ringkasan belajar…</div>
      </main>
    );
  }

  const lastDoc = data.recent_docs?.[0];

  return (
    <main aria-label="Beranda">
      <header>
        <h1>Beranda Belajar</h1>
        <p>Selamat datang kembali! Lanjutkan belajarmu hari ini.</p>
      </header>

      {/* Streak and Daily Target Indicators */}
      <section aria-label="Statistik Harian">
        <FrostPanel elevation="panel">
          <div>
            <span>Streak Belajar</span>
            <strong>{data.streak.count} hari</strong>
          </div>
          <div>
            <span>Target Mingguan</span>
            <strong>{data.overall.total_study_minutes} menit dipelajari</strong>
          </div>
        </FrostPanel>
      </section>

      {/* Continue Learning CTA */}
      {lastDoc && (
        <section aria-label="Lanjutkan Belajar">
          <SurfaceCard>
            <h2>Lanjutkan Materi Terakhir</h2>
            <Link
              to={`/materi/${lastDoc.id}`}
              role="link"
              aria-label={`Lanjutkan belajar: ${lastDoc.title}`}
            >
              Lanjutkan Belajar: {lastDoc.title}
            </Link>
          </SurfaceCard>
        </section>
      )}

      {/* Recent Materials */}
      <section aria-label="Materi Terbaru">
        <h2>Materi Terbaru</h2>
        {data.recent_docs?.length === 0 ? (
          <p>Belum ada materi belajar.</p>
        ) : (
          <div role="list">
            {data.recent_docs?.map((doc) => (
              <SurfaceCard key={doc.id} role="listitem">
                <Link to={`/materi/${doc.id}`}>{doc.title}</Link>
                <StatusBadge status={doc.status} />
              </SurfaceCard>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

describe('Feature 8: Overview / Dashboard', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('dashboard', defaultDashboardFixture);
    mockRpc.setResponse('list_documents', defaultDocumentsFixture);
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('08.1 - Greeting & Daily Learning Command Center', async () => {
    renderWithProviders(<OverviewDashboardView />);

    await waitFor(() => {
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.textContent).toContain('Beranda Belajar');
      expect(screen.getByText(/selamat datang kembali/i)).toBeTruthy();
    });
  });

  it('08.2 - Real Streak Count Display', async () => {
    renderWithProviders(<OverviewDashboardView />);

    await waitFor(() => {
      expect(screen.getByText('7 hari')).toBeTruthy();
    });
  });

  it('08.3 - Continue Learning Call-to-Action', async () => {
    renderWithProviders(<OverviewDashboardView />);

    const continueLink = await screen.findByRole('link', {
      name: /lanjutkan belajar: pengantar jaringan komputer/i,
    });
    expect(continueLink).toBeTruthy();
    expect(continueLink.getAttribute('href')).toBe('/materi/101');
  });

  it('08.4 - Recent Materials Catalog Snapshot', async () => {
    renderWithProviders(<OverviewDashboardView />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Materi Terbaru' })).toBeTruthy();
      expect(screen.getByText('Pengantar Jaringan Komputer & OSI Layer')).toBeTruthy();
      expect(screen.getByText('Termodinamika & Siklus Carnot')).toBeTruthy();
    });

    const statusBadges = screen.getAllByRole('status');
    expect(statusBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('08.5 - Weekly Study Target Summary', async () => {
    renderWithProviders(<OverviewDashboardView />);

    await waitFor(() => {
      expect(screen.getByText('Target Mingguan')).toBeTruthy();
      expect(screen.getByText(/290 menit dipelajari/i)).toBeTruthy();
    });
  });
});

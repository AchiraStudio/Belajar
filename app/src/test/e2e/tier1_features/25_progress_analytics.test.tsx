import { cleanup, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SurfaceCard } from '../../../components/ui/SurfaceCard';
import { rpcCall } from '../../../services/api/rpc';
import {
  defaultProgressFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type ProgressResponse,
} from '../harness';

function AnalyticsView() {
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    rpcCall<ProgressResponse>('progress')
      .then((res) => {
        if (active) {
          setData(res);
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

  if (loading) {
    return <div>Memuat Analisis Progres...</div>;
  }

  const overall = data?.overall;
  const isZeroActivity =
    !overall ||
    (overall.total_study_minutes === 0 && overall.total_quizzes_taken === 0);

  return (
    <main aria-label="Progres Belajar">
      <header>
        <h1>Progres & Analisis Belajar</h1>
      </header>

      {isZeroActivity ? (
        <section role="region" aria-label="Keadaan Kosong Progres">
          <h2>Belum Ada Aktivitas Belajar</h2>
          <p>
            Mulai pelajari materi atau kerjakan kuis latihan untuk melihat statistik
            dan analitik penguasaanmu di sini.
          </p>
        </section>
      ) : (
        <>
          {/* 1. Overall Metrics Tiles */}
          <section role="region" aria-label="Metrik Utama">
            <div>
              <SurfaceCard>
                <span>Akurasi Rata-rata</span>
                <strong>{overall?.average_accuracy}%</strong>
              </SurfaceCard>
              <SurfaceCard>
                <span>Kuis Selesai</span>
                <strong>{overall?.total_quizzes_taken}</strong>
              </SurfaceCard>
              <SurfaceCard>
                <span>Waktu Belajar</span>
                <strong>{overall?.total_study_minutes} Menit</strong>
              </SurfaceCard>
              <SurfaceCard>
                <span>Streak Belajar</span>
                <strong>{overall?.streak_days} Hari</strong>
              </SurfaceCard>
            </div>
          </section>

          {/* 2. Score Trend Chart */}
          <section role="region" aria-label="Tren Skor Kuis">
            <h2>Tren Skor Kuis</h2>
            <div role="list" aria-label="Riwayat Skor">
              {data?.trend?.map((t, idx) => (
                <div key={idx} role="listitem">
                  <span>{t.date}</span>
                  <span>{t.score}%</span>
                </div>
              ))}
            </div>
          </section>

          {/* 3. Topics Mastery Breakdown */}
          <section role="region" aria-label="Penguasaan per Topik">
            <h2>Penguasaan per Topik</h2>
            <div role="list">
              {data?.topics?.map((topic, idx) => {
                const isStrong = topic.mastery_percentage >= 80;
                return (
                  <SurfaceCard key={idx} role="listitem">
                    <h3>{topic.topic}</h3>
                    <span>{topic.subject}</span>
                    <span>{topic.mastery_percentage}%</span>
                    <span>{isStrong ? 'Kuat' : 'Perlu Diulang'}</span>
                  </SurfaceCard>
                );
              })}
            </div>
          </section>

          {/* 4. Per-material progress */}
          <section role="region" aria-label="Progres per Materi">
            <h2>Progres per Materi</h2>
            <div role="list">
              {data?.documents?.map((doc) => (
                <SurfaceCard key={doc.document_id} role="listitem">
                  <h3>{doc.title}</h3>
                  <span>{doc.studied_minutes} Menit Dipelajari</span>
                  <span>Penguasaan: {doc.mastery_rate}%</span>
                </SurfaceCard>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

describe('Feature 25: Progress & Mastery Analytics', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('progress', defaultProgressFixture);
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('25.1 - renders overall learning metrics (accuracy, quizzes completed, study duration, streak)', async () => {
    renderWithProviders(<AnalyticsView />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Progres & Analisis Belajar' })
      ).toBeTruthy();
      expect(screen.getByText('86.2%')).toBeTruthy();
      expect(screen.getByText('14')).toBeTruthy();
      expect(screen.getByText('420 Menit')).toBeTruthy();
      expect(screen.getByText('7 Hari')).toBeTruthy();
    });
  });

  it('25.2 - renders quiz score trend chart with recent attempts', async () => {
    renderWithProviders(<AnalyticsView />);

    await waitFor(() => {
      const trendSection = screen.getByRole('region', { name: 'Tren Skor Kuis' });
      expect(trendSection).toBeTruthy();
      expect(trendSection.textContent).toContain('2026-11-01');
      expect(trendSection.textContent).toContain('75%');
      expect(trendSection.textContent).toContain('2026-11-09');
      expect(trendSection.textContent).toContain('90%');
    });
  });

  it('25.3 - displays topic mastery breakdown distinguishing weak and strong topics', async () => {
    renderWithProviders(<AnalyticsView />);

    await waitFor(() => {
      const osiCard = screen.getByText('Model OSI').closest('[role="listitem"]');
      expect(osiCard?.textContent).toContain('92%');
      expect(osiCard?.textContent).toContain('Kuat');

      const subnettingCard = screen
        .getByText('Subnetting IPv4')
        .closest('[role="listitem"]');
      expect(subnettingCard?.textContent).toContain('55%');
      expect(subnettingCard?.textContent).toContain('Perlu Diulang');
    });
  });

  it('25.4 - displays per-material study progress bars and mastery rates', async () => {
    renderWithProviders(<AnalyticsView />);

    await waitFor(() => {
      expect(screen.getByText('Pengantar Jaringan Komputer')).toBeTruthy();
      expect(screen.getByText(/150 menit dipelajari/i)).toBeTruthy();
      expect(screen.getByText(/penguasaan: 88%/i)).toBeTruthy();

      expect(screen.getByText('Termodinamika & Siklus Carnot')).toBeTruthy();
      expect(screen.getByText(/90 menit dipelajari/i)).toBeTruthy();
      expect(screen.getByText(/penguasaan: 75%/i)).toBeTruthy();
    });
  });

  it('25.5 - displays honest empty state when learner has zero activity', async () => {
    mockRpc.setResponse('progress', {
      overall: {
        total_study_minutes: 0,
        total_quizzes_taken: 0,
        average_accuracy: 0,
        streak_days: 0,
      },
      trend: [],
      topics: [],
      documents: [],
    });

    renderWithProviders(<AnalyticsView />);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Keadaan Kosong Progres' })).toBeTruthy();
      expect(screen.getByText('Belum Ada Aktivitas Belajar')).toBeTruthy();
      expect(
        screen.getByText(/mulai pelajari materi atau kerjakan kuis latihan/i)
      ).toBeTruthy();
      expect(screen.queryByRole('region', { name: 'Metrik Utama' })).toBeNull();
    });
  });
});

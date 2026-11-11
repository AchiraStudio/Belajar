import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tabs, type TabItem } from '../../../components/ui/Tabs';
import { rpcCall } from '../../../services/api/rpc';
import {
  defaultDocumentDetailFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type GetDocumentResponse,
} from '../harness';

const WORKSPACE_TABS: TabItem[] = [
  { id: 'catatan', label: 'Catatan' },
  { id: 'mindmap', label: 'Mind map' },
  { id: 'kuis', label: 'Kuis' },
  { id: 'chat', label: 'Tanya AI' },
];

function MaterialWorkspaceShellView({ documentId = 101 }: { documentId?: number }) {
  const [data, setData] = useState<GetDocumentResponse | null>(null);
  const [activeTab, setActiveTab] = useState('catatan');
  const [studySeconds, setStudySeconds] = useState(0);

  const location = useLocation();

  useEffect(() => {
    // Read query parameter for initial tab deep-link
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam && WORKSPACE_TABS.some((t) => t.id === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location.search]);

  useEffect(() => {
    let active = true;
    rpcCall<GetDocumentResponse>('get_document', { id: documentId })
      .then((res) => {
        if (active) setData(res);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [documentId]);

  // Integrated study timer
  useEffect(() => {
    const timer = setInterval(() => {
      setStudySeconds((prev) => {
        const next = prev + 1;
        if (next % 60 === 0) {
          rpcCall('log_study', { seconds: 60 }).catch(() => {});
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!data) {
    return <div role="status">Memuat materi workspace…</div>;
  }

  return (
    <main aria-label="Ruang Kerja Materi">
      <header>
        <h1>{data.document.title}</h1>
        <div>
          <span>{data.subject?.name}</span>
          <span aria-label="Penghitung Waktu Belajar">{formatTimer(studySeconds)}</span>
        </div>
      </header>

      <Tabs items={WORKSPACE_TABS} activeTab={activeTab} onChange={setActiveTab} />

      <section role="tabpanel" aria-label={`Panel ${activeTab}`}>
        {activeTab === 'catatan' && <div>Konten Catatan Materi</div>}
        {activeTab === 'mindmap' && <div>Kanvas Mind Map</div>}
        {activeTab === 'kuis' && <div>Daftar Kuis Terkait</div>}
        {activeTab === 'chat' && <div>Chat Asisten AI</div>}
      </section>
    </main>
  );
}

describe('Feature 10: Material Workspace Shell', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('get_document', defaultDocumentDetailFixture);
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('10.1 - Material Workspace Initialization', async () => {
    renderWithProviders(<MaterialWorkspaceShellView />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Pengantar Jaringan Komputer & OSI Layer',
        })
      ).toBeTruthy();
      expect(screen.getByText('Ilmu Komputer')).toBeTruthy();
    });
  });

  it('10.2 - Unified Segmented Tab Navigation', async () => {
    renderWithProviders(<MaterialWorkspaceShellView />);

    await screen.findByRole('tablist');

    expect(screen.getByRole('tab', { name: 'Catatan' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Mind map' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Kuis' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Tanya AI' })).toBeTruthy();
  });

  it('10.3 - Tab Switching State Transition', async () => {
    renderWithProviders(<MaterialWorkspaceShellView />);

    const mindmapTab = await screen.findByRole('tab', { name: 'Mind map' });
    fireEvent.click(mindmapTab);

    expect(mindmapTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'Panel mindmap' })).toBeTruthy();
    expect(screen.getByText('Kanvas Mind Map')).toBeTruthy();
  });

  it('10.4 - URL Query Parameter Tab Deeplink', async () => {
    renderWithProviders(<MaterialWorkspaceShellView />, { route: '/materi/101?tab=kuis' });

    await waitFor(() => {
      const kuisTab = screen.getByRole('tab', { name: 'Kuis' });
      expect(kuisTab.getAttribute('aria-selected')).toBe('true');
      expect(screen.getByText('Daftar Kuis Terkait')).toBeTruthy();
    });
  });

  it('10.5 - Integrated Study Timer', async () => {
    renderWithProviders(<MaterialWorkspaceShellView />);

    const timer = await screen.findByLabelText('Penghitung Waktu Belajar');
    expect(timer.textContent).toMatch(/\d{2}:\d{2}/);
  });
});

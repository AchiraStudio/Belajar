import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { WorkspaceShell } from './WorkspaceShell';
import { dropCache } from '../../services/api/rpc';
import {
  renderWithProviders,
  mockRpc,
  defaultDocumentDetailFixture,
} from '../../test/e2e/harness';

function renderWorkspace(route = '/materi/101') {
  return renderWithProviders(
    <Routes>
      <Route path="/materi/:id" element={<WorkspaceShell />} />
    </Routes>,
    { route }
  );
}

describe('WorkspaceShell Component', () => {
  beforeEach(() => {
    cleanup();
    dropCache();
    mockRpc.install();
    mockRpc.reset();
  });

  afterEach(() => {
    cleanup();
    dropCache();
    mockRpc.uninstall();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders loading skeleton while document is fetching', () => {
    mockRpc.setDelay('get_document', 500);
    renderWorkspace('/materi/101');

    expect(screen.getByLabelText('Memuat ruang kerja materi')).toBeTruthy();
  });

  it('renders honest 404 error state when document is not found', async () => {
    mockRpc.setError('get_document', {
      status: 404,
      code: 'not_found',
      message: 'Materi tidak ditemukan.',
    });

    renderWorkspace('/materi/999');

    await waitFor(() => {
      expect(screen.getByText('Materi Tidak Ditemukan')).toBeTruthy();
      expect(screen.getByText('Materi tidak ditemukan.')).toBeTruthy();
    });

    const backBtn = screen.getByRole('button', { name: 'Kembali ke Semua Materi' });
    expect(backBtn).toBeTruthy();
  });

  it('renders processing state with progress bar when status is processing', async () => {
    mockRpc.setResponse('get_document', {
      document: {
        id: 103,
        title: 'Materi Sedang Diproses',
        status: 'processing',
        page_count: 12,
      },
      job: {
        progress: 45,
        message: 'Menganalisis bab 2...',
      },
      quizzes: [],
    });

    renderWorkspace('/materi/103');

    await waitFor(() => {
      expect(screen.getByText('Catatan Sedang Dibuat')).toBeTruthy();
      expect(screen.getByText('Menganalisis bab 2...')).toBeTruthy();
    });

    const pbar = screen.getByRole('progressbar', { name: /progres membaca/i });
    expect(pbar).toBeTruthy();
  });

  it('renders ready document workspace with header, notes reader, and action rail', async () => {
    mockRpc.setResponse('get_document', defaultDocumentDetailFixture);

    renderWorkspace('/materi/101');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Pengantar Jaringan Komputer & OSI Layer' })).toBeTruthy();
      // Subject tag
      expect(screen.getByText('Ilmu Komputer')).toBeTruthy();
      // Tabs
      expect(screen.getByRole('tab', { name: /catatan/i })).toBeTruthy();
      expect(screen.getByRole('tab', { name: /mind map/i })).toBeTruthy();
      expect(screen.getByRole('tab', { name: /kuis/i })).toBeTruthy();
      // Reading controls
      expect(screen.getByRole('button', { name: 'Edit catatan' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Unduh .md' })).toBeTruthy();
      expect(screen.getByText(/Waktu belajar:/i)).toBeTruthy();
    });
  });

  it('switches between tabs and renders the real mind map and quiz tabs', async () => {
    mockRpc.setResponse('get_document', defaultDocumentDetailFixture);
    mockRpc.setResponse('mindmap_get', { mindmap: null, job: null });

    renderWorkspace('/materi/101');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Pengantar Jaringan Komputer & OSI Layer' })).toBeTruthy();
    });

    // Mind Map: no map yet -> honest empty state with a real action, no simulated tree
    fireEvent.click(screen.getByRole('tab', { name: /mind map/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Belum ada mind map' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Buat mind map' })).toBeTruthy();
    });

    // Kuis: the real list of this material's quizzes, with start actions
    fireEvent.click(screen.getByRole('tab', { name: /kuis/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Kuis materi/i })).toBeTruthy();
      expect(screen.getByText('Kuis Diagnostik Jaringan')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Latihan' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Ujian' })).toBeTruthy();
    });
  });

  it('shows an honest unavailable state (no fake map) when the server has no AI layer', async () => {
    mockRpc.setResponse('get_document', defaultDocumentDetailFixture);
    mockRpc.setError('mindmap_get', {
      status: 400,
      code: 'rpc_error',
      message: 'Layanan AI belum dikonfigurasi di server ini.',
    });

    renderWorkspace('/materi/101');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Pengantar Jaringan Komputer & OSI Layer' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('tab', { name: /mind map/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Mind map belum tersedia di server ini' })).toBeTruthy();
    });
    expect(screen.queryByRole('application')).toBeNull();
  });

  it('toggles edit mode and saves note', async () => {
    mockRpc.setResponse('get_document', defaultDocumentDetailFixture);
    mockRpc.setResponse('save_note', {});

    renderWorkspace('/materi/101');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit catatan' })).toBeTruthy();
    });

    // Click Edit catatan
    const editBtn = screen.getByRole('button', { name: 'Edit catatan' });
    fireEvent.click(editBtn);

    expect(screen.getByRole('textbox', { name: 'Isi catatan (Markdown)' })).toBeTruthy();

    const saveBtn = screen.getByRole('button', { name: /simpan catatan/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Catatan berhasil disimpan')).toBeTruthy();
    });
  });

  it('opens rename title dialog and updates title via RPC', async () => {
    mockRpc.setResponse('get_document', defaultDocumentDetailFixture);
    mockRpc.setResponse('update_document', {});

    renderWorkspace('/materi/101');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ganti judul' })).toBeTruthy();
    });

    const renameBtn = screen.getByRole('button', { name: 'Ganti judul' });
    fireEvent.click(renameBtn);

    expect(screen.getByRole('dialog', { name: 'Ganti Judul Materi' })).toBeTruthy();

    const titleInput = screen.getByLabelText('Judul Baru');
    fireEvent.change(titleInput, { target: { value: 'Judul Baru Jaringan Komputer' } });

    const submitBtn = screen.getByRole('button', { name: 'Simpan Judul' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const lastCall = mockRpc.getLastCall('update_document');
      expect(lastCall).toBeDefined();
      expect(lastCall?.payload).toEqual({
        id: 101,
        title: 'Judul Baru Jaringan Komputer',
      });
      expect(screen.getByRole('heading', { level: 1, name: 'Judul Baru Jaringan Komputer' })).toBeTruthy();
    });
  });

  it('adjusts reading font size via appearance controls', async () => {
    mockRpc.setResponse('get_document', defaultDocumentDetailFixture);

    renderWorkspace('/materi/101');

    await waitFor(() => {
      expect(screen.getByText('17px')).toBeTruthy();
    });

    const incBtn = screen.getByRole('button', { name: 'Besarkan ukuran teks' });
    fireEvent.click(incBtn);

    expect(screen.getByText('18px')).toBeTruthy();
  });
});

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MaterialsView } from './MaterialsView';
import { dropCache } from '../../services/api/rpc';
import {
  renderWithProviders,
  mockRpc,
  defaultDocumentsFixture,
  defaultSubjectsFixture,
} from '../../test/e2e/harness';

describe('MaterialsView Component', () => {
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
  });

  it('renders loading skeleton while fetching data', () => {
    mockRpc.setDelay('list_documents', 500);
    renderWithProviders(<MaterialsView />);

    expect(screen.getByLabelText('Memuat katalog materi')).toBeTruthy();
  });

  it('renders error state and handles retry', async () => {
    mockRpc.setError('list_documents', {
      status: 500,
      code: 'server_error',
      message: 'Gagal mengambil dokumen.',
    });

    renderWithProviders(<MaterialsView />);

    await waitFor(() => {
      expect(screen.getByText('Gagal Memuat Materi')).toBeTruthy();
      expect(screen.getByText('Gagal mengambil dokumen.')).toBeTruthy();
    });

    // Clear error and click retry
    dropCache();
    mockRpc.clearError('list_documents');
    mockRpc.setResponse('list_documents', defaultDocumentsFixture);
    mockRpc.setResponse('list_subjects', defaultSubjectsFixture);

    const retryBtn = screen.getByRole('button', { name: /coba lagi/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Materi Belajar' })).toBeTruthy();
    });
  });

  it('renders honest empty state when entire library has 0 documents', async () => {
    mockRpc.setResponse('list_documents', { documents: [] });
    mockRpc.setResponse('list_subjects', defaultSubjectsFixture);

    renderWithProviders(<MaterialsView />);

    await waitFor(() => {
      expect(screen.getByText('Belum ada materi')).toBeTruthy();
      expect(screen.getByText(/Kamu belum memiliki berkas materi belajar/i)).toBeTruthy();
    });
  });

  it('renders documents with status badges and active job progress', async () => {
    mockRpc.setResponse('list_documents', defaultDocumentsFixture);
    mockRpc.setResponse('list_subjects', defaultSubjectsFixture);

    renderWithProviders(<MaterialsView />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Materi Belajar' })).toBeTruthy();
      expect(screen.getByText('Pengantar Jaringan Komputer & OSI Layer')).toBeTruthy();
      expect(screen.getByText('Termodinamika & Siklus Carnot')).toBeTruthy();
      expect(screen.getByText('Aljabar Linear: Matriks & Vektor Eigen')).toBeTruthy();
    });

    // Verify progress bar on processing item
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBeGreaterThanOrEqual(1);
  });

  it('toggles between grid and list view modes', async () => {
    mockRpc.setResponse('list_documents', defaultDocumentsFixture);
    mockRpc.setResponse('list_subjects', defaultSubjectsFixture);

    renderWithProviders(<MaterialsView />);

    await waitFor(() => {
      expect(screen.getByText('Pengantar Jaringan Komputer & OSI Layer')).toBeTruthy();
    });

    const listBtn = screen.getByRole('button', { name: 'Tampilan Daftar' });
    fireEvent.click(listBtn);

    expect(listBtn.getAttribute('aria-pressed')).toBe('true');

    const gridBtn = screen.getByRole('button', { name: 'Tampilan Grid' });
    fireEvent.click(gridBtn);

    expect(gridBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('filters documents via search and renders search empty state', async () => {
    mockRpc.setResponse('list_documents', defaultDocumentsFixture);
    mockRpc.setResponse('list_subjects', defaultSubjectsFixture);

    renderWithProviders(<MaterialsView />);

    await waitFor(() => {
      expect(screen.getByText('Pengantar Jaringan Komputer & OSI Layer')).toBeTruthy();
    });

    const searchInput = screen.getByLabelText('Cari materi');
    fireEvent.change(searchInput, { target: { value: 'Termodinamika' } });

    expect(screen.getByText('Termodinamika & Siklus Carnot')).toBeTruthy();
    expect(screen.queryByText('Pengantar Jaringan Komputer & OSI Layer')).toBeNull();

    // Search that matches nothing
    fireEvent.change(searchInput, { target: { value: 'ZzzNothingMatched999' } });
    expect(screen.getByText('Tidak ada materi yang cocok')).toBeTruthy();

    // Click clear search
    const clearBtn = screen.getByRole('button', { name: 'Hapus pencarian' });
    fireEvent.click(clearBtn);

    expect(screen.getByText('Pengantar Jaringan Komputer & OSI Layer')).toBeTruthy();
  });

  it('opens and closes Upload Dialog', async () => {
    mockRpc.setResponse('list_documents', defaultDocumentsFixture);
    mockRpc.setResponse('list_subjects', defaultSubjectsFixture);

    renderWithProviders(<MaterialsView />);

    await waitFor(() => {
      expect(screen.getByText('Pengantar Jaringan Komputer & OSI Layer')).toBeTruthy();
    });

    const uploadBtn = screen.getByRole('button', { name: 'Unggah materi' });
    fireEvent.click(uploadBtn);

    expect(screen.getByRole('dialog', { name: 'Unggah Materi' })).toBeTruthy();
    expect(screen.getByText('Unggah Materi Baru')).toBeTruthy();

    const closeBtn = screen.getByRole('button', { name: 'Tutup dialog' });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole('dialog', { name: 'Unggah Materi' })).toBeNull();
  });

  it('opens and closes Subject Manage Dialog', async () => {
    mockRpc.setResponse('list_documents', defaultDocumentsFixture);
    mockRpc.setResponse('list_subjects', defaultSubjectsFixture);

    renderWithProviders(<MaterialsView />);

    await waitFor(() => {
      expect(screen.getByText('Kelola Mata Pelajaran')).toBeTruthy();
    });

    const manageBtn = screen.getByRole('button', { name: 'Kelola Mata Pelajaran' });
    fireEvent.click(manageBtn);

    expect(screen.getByRole('dialog', { name: 'Kelola Mata Pelajaran' })).toBeTruthy();
    expect(screen.getByText(/Daftar Mata Pelajaran/i)).toBeTruthy();

    const closeBtn = screen.getByRole('button', { name: 'Tutup dialog' });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole('dialog', { name: 'Kelola Mata Pelajaran' })).toBeNull();
  });
});

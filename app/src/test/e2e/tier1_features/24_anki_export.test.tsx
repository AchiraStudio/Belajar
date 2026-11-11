import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../../components/ui/Button';
import { rpcCall } from '../../../services/api/rpc';
import {
  defaultCardsExportFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type CardsExportResponse,
} from '../harness';

function AnkiExportView() {
  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [emptyNotice, setEmptyNotice] = useState<string | null>(null);

  const handleExportTsv = async () => {
    setIsExporting(true);
    setToastMessage(null);
    setEmptyNotice(null);

    try {
      const res = await rpcCall<CardsExportResponse>('cards_export');
      if (!res.tsv || res.tsv.trim() === '') {
        setEmptyNotice('Belum ada kartu untuk diekspor');
        setIsExporting(false);
        return;
      }

      // Generate client-side blob download
      const blob = new Blob([res.tsv], {
        type: 'text/tab-separated-values;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = res.filename || 'belajar_flashcards_export.tsv';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setToastMessage(
        'Kartu berhasil diekspor! Impor ke Anki sebagai teks dipisah tab.'
      );
    } catch {
      setToastMessage('Gagal mengekspor kartu.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <main aria-label="Kelola Flashcards">
      <section role="region" aria-label="Kelola Kartu">
        <h2>Kelola Kartu</h2>
        <p>Ekspor kartu belajarmu ke format TSV untuk dipelajari di Anki.</p>

        <Button
          onClick={handleExportTsv}
          disabled={isExporting}
          aria-label="Ekspor ke Anki (TSV)"
        >
          {isExporting ? 'Mengekspor...' : 'Ekspor ke Anki (TSV)'}
        </Button>

        {emptyNotice && (
          <div role="status" aria-label="Peringatan Ekspor">
            <p>{emptyNotice}</p>
          </div>
        )}

        {toastMessage && (
          <div role="status" aria-label="Notifikasi Toast">
            <p>{toastMessage}</p>
          </div>
        )}
      </section>
    </main>
  );
}

describe('Feature 24: Anki TSV Flashcard Export', () => {
  let createObjectURLSpy: any;
  let revokeObjectURLSpy: any;

  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('cards_export', defaultCardsExportFixture);

    createObjectURLSpy = vi.fn().mockReturnValue('blob:http://localhost/test-uuid');
    revokeObjectURLSpy = vi.fn();
    globalThis.URL.createObjectURL = createObjectURLSpy;
    globalThis.URL.revokeObjectURL = revokeObjectURLSpy;
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('24.1 - renders Anki export trigger button in flashcard management panel', async () => {
    renderWithProviders(<AnkiExportView />);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Kelola Kartu' })).toBeTruthy();
      const exportBtn = screen.getByRole('button', { name: 'Ekspor ke Anki (TSV)' });
      expect(exportBtn).toBeTruthy();
      expect(exportBtn.hasAttribute('disabled')).toBe(false);
    });
  });

  it('24.2 - dispatches cards_export RPC on user click', async () => {
    renderWithProviders(<AnkiExportView />);

    const exportBtn = await screen.findByRole('button', {
      name: 'Ekspor ke Anki (TSV)',
    });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('cards_export');
      expect(call).toBeTruthy();
    });
  });

  it('24.3 - generates client-side blob download with TSV content and filename', async () => {
    renderWithProviders(<AnkiExportView />);

    const exportBtn = await screen.findByRole('button', {
      name: 'Ekspor ke Anki (TSV)',
    });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(createObjectURLSpy).toHaveBeenCalled();
      const blobArg = createObjectURLSpy.mock.calls[0][0];
      expect(blobArg).toBeInstanceOf(Blob);
      expect(blobArg.type).toBe('text/tab-separated-values;charset=utf-8');
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/test-uuid');
    });
  });

  it('24.4 - displays informative toast notification after successful export', async () => {
    renderWithProviders(<AnkiExportView />);

    const exportBtn = await screen.findByRole('button', {
      name: 'Ekspor ke Anki (TSV)',
    });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      const toast = screen.getByRole('status', { name: 'Notifikasi Toast' });
      expect(toast.textContent).toContain(
        'Kartu berhasil diekspor! Impor ke Anki sebagai teks dipisah tab.'
      );
    });
  });

  it('24.5 - handles empty deck export honestly with warning message', async () => {
    mockRpc.setResponse('cards_export', { tsv: '', filename: 'empty.tsv' });

    renderWithProviders(<AnkiExportView />);

    const exportBtn = await screen.findByRole('button', {
      name: 'Ekspor ke Anki (TSV)',
    });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      const warning = screen.getByRole('status', { name: 'Peringatan Ekspor' });
      expect(warning.textContent).toContain('Belum ada kartu untuk diekspor');
      expect(createObjectURLSpy).not.toHaveBeenCalled();
    });
  });
});

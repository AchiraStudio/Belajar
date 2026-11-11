import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { NotesReader } from './NotesReader';
import { NotesEditor } from './NotesEditor';
import { TanyaPanel } from './TanyaPanel';
import { dropCache } from '../../services/api/rpc';
import { renderWithProviders, mockRpc } from '../../test/e2e/harness';

describe('Notes Feature Components', () => {
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

  describe('NotesReader', () => {
    it('renders prose markdown with headings, code blocks, and math', async () => {
      const onTocChange = vi.fn();
      const sampleMd = `# Pengantar Jaringan\n\n## Model OSI\nModel OSI memiliki 7 lapisan.\n\n\`\`\`python\nprint("OSI")\n\`\`\`\n\nRumus: $E=mc^2$`;

      renderWithProviders(
        <NotesReader
          contentMd={sampleMd}
          documentTitle="Pengantar Jaringan"
          onTocChange={onTocChange}
        />
      );

      // Verify H1 is hidden because title matches
      const h1 = screen.getByRole('heading', { level: 1, hidden: true });
      expect(h1.style.display).toBe('none');

      // Verify H2 and TOC extraction
      expect(screen.getByRole('heading', { level: 2, name: 'Model OSI' })).toBeTruthy();
      expect(onTocChange).toHaveBeenCalledWith([
        { id: 'bagian-0', text: 'Model OSI' },
      ]);

      // Verify Code block and math fallback
      expect(screen.getByText('Python')).toBeTruthy();
      expect(screen.getByText('$E=mc^2$')).toBeTruthy();
    });

    it('handles code block copy button click with toast feedback', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      const sampleMd = `\`\`\`bash\nnpm install\n\`\`\``;

      renderWithProviders(
        <NotesReader contentMd={sampleMd} documentTitle="Demo" />
      );

      const copyBtn = screen.getByRole('button', { name: 'Salin kode' });
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledWith('npm install');
        expect(screen.getByText('Disalin ✓')).toBeTruthy();
      });
    });
  });

  describe('NotesEditor', () => {
    it('binds draft content to textarea and saves note via RPC', async () => {
      const onSaveSuccess = vi.fn();
      const onCancel = vi.fn();

      mockRpc.setResponse('save_note', {});

      renderWithProviders(
        <NotesEditor
          documentId={101}
          initialContent="Catatan awal."
          onSaveSuccess={onSaveSuccess}
          onCancel={onCancel}
        />
      );

      const textarea = screen.getByRole('textbox', { name: 'Isi catatan (Markdown)' });
      expect((textarea as HTMLTextAreaElement).value).toBe('Catatan awal.');

      fireEvent.change(textarea, { target: { value: 'Catatan yang sudah diedit.' } });

      const saveBtn = screen.getByRole('button', { name: /simpan catatan/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        const lastCall = mockRpc.getLastCall('save_note');
        expect(lastCall).toBeDefined();
        expect(lastCall?.payload).toEqual({
          document_id: 101,
          content_md: 'Catatan yang sudah diedit.',
        });
        expect(onSaveSuccess).toHaveBeenCalledWith('Catatan yang sudah diedit.');
      });
    });

    it('triggers onCancel when Batal is clicked', () => {
      const onSaveSuccess = vi.fn();
      const onCancel = vi.fn();

      renderWithProviders(
        <NotesEditor
          documentId={101}
          initialContent="Catatan awal."
          onSaveSuccess={onSaveSuccess}
          onCancel={onCancel}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: 'Batal' });
      fireEvent.click(cancelBtn);

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('TanyaPanel', () => {
    it('executes default question and displays AI response', async () => {
      mockRpc.setResponse('notes_ask', {
        answer: 'Ini adalah penjelasan tentang teks pilihan.',
        ask_session_id: 991,
      });

      renderWithProviders(
        <TanyaPanel
          isOpen={true}
          onClose={vi.fn()}
          documentId={101}
          initialQuote="Protokol TCP/IP menyediakan transmisi data andal."
        />
      );

      expect(screen.getByText(/Protokol TCP\/IP menyediakan/i)).toBeTruthy();

      await waitFor(() => {
        expect(screen.getByText('Ini adalah penjelasan tentang teks pilihan.')).toBeTruthy();
      });
    });

    it('cleans up session via notes_ask_delete when closed', async () => {
      mockRpc.setResponse('notes_ask', {
        answer: 'Penjelasan AI.',
        ask_session_id: 992,
      });
      mockRpc.setResponse('notes_ask_delete', { ok: true });

      const onClose = vi.fn();

      renderWithProviders(
        <TanyaPanel
          isOpen={true}
          onClose={onClose}
          documentId={101}
          initialQuote="Kutipan uji."
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Penjelasan AI.')).toBeTruthy();
      });

      const closeBtn = screen.getByRole('button', { name: 'Tutup panel tanya AI' });
      fireEvent.click(closeBtn);

      await waitFor(() => {
        const lastCall = mockRpc.getLastCall('notes_ask_delete');
        expect(lastCall).toBeDefined();
        expect(lastCall?.payload).toEqual({ ask_session_id: 992 });
        expect(onClose).toHaveBeenCalled();
      });
    });
  });
});

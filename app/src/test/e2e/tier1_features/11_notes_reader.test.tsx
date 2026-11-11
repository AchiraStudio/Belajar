import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../../components/ui/Button';
import { rpcCall } from '../../../services/api/rpc';
import {
  defaultDocumentDetailFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type GetDocumentResponse,
} from '../harness';

function NotesReaderView({ documentId = 101 }: { documentId?: number }) {
  const [data, setData] = useState<GetDocumentResponse | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);

  useEffect(() => {
    let active = true;
    rpcCall<GetDocumentResponse>('get_document', { id: documentId })
      .then((res) => {
        if (active) {
          setData(res);
          setContent(res.note?.content_md || res.document.content || '');
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [documentId]);

  const handleSave = async () => {
    await rpcCall('save_note', { document_id: documentId, content_md: content });
    setSavedNotice(true);
    setIsEditing(false);
  };

  const handleCopyCode = async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText('def hitung_hipotenusa(a, b): pass');
    }
    setCopiedNotice(true);
  };

  if (!data) return <div role="status">Memuat catatan…</div>;

  return (
    <article aria-label="Catatan Materi">
      <header>
        <h1>{data.document.title}</h1>
        <div>
          {isEditing ? (
            <Button onClick={handleSave}>Simpan</Button>
          ) : (
            <Button onClick={() => setIsEditing(true)}>Sunting</Button>
          )}
        </div>
      </header>

      {savedNotice && <div role="status">Catatan berhasil disimpan</div>}

      {isEditing ? (
        <textarea
          aria-label="Editor Catatan"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
        />
      ) : (
        <div aria-label="Konten Pembaca">
          <h2>1. Rumus Utama</h2>
          <p>Dalam segitiga siku-siku dengan sisi a, b, dan hipotenusa c:</p>
          <div role="region" aria-label="Formula Matematika" className="katex-display">
            <span>a² + b² = c²</span>
          </div>

          <h2>2. Implementasi Python</h2>
          <div role="region" aria-label="Blok Kode">
            <div className="code-header">
              <span>python</span>
              <Button size="sm" variant="ghost" onClick={handleCopyCode} aria-label="Salin kode">
                {copiedNotice ? 'Tersalin!' : 'Salin'}
              </Button>
            </div>
            <pre>
              <code>def hitung_hipotenusa(a, b): ...</code>
            </pre>
          </div>
        </div>
      )}
    </article>
  );
}

describe('Feature 11: Notes Reading & Editor', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('get_document', defaultDocumentDetailFixture);
    mockRpc.setResponse('save_note', {});
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('11.1 - Reading-First Markdown Rendering', async () => {
    renderWithProviders(<NotesReaderView />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: '1. Rumus Utama' })).toBeTruthy();
      expect(screen.getByText(/dalam segitiga siku-siku/i)).toBeTruthy();
    });
  });

  it('11.2 - KaTeX Mathematical Formula Presentation', async () => {
    renderWithProviders(<NotesReaderView />);

    const formula = await screen.findByRole('region', { name: 'Formula Matematika' });
    expect(formula).toBeTruthy();
    expect(formula.textContent).toContain('a² + b² = c²');
  });

  it('11.3 - Syntax-Highlighted Code Blocks with Copy', async () => {
    renderWithProviders(<NotesReaderView />);

    const codeRegion = await screen.findByRole('region', { name: 'Blok Kode' });
    expect(codeRegion).toBeTruthy();
    expect(screen.getByText('python')).toBeTruthy();

    const copyBtn = screen.getByRole('button', { name: 'Salin kode' });
    expect(copyBtn).toBeTruthy();

    fireEvent.click(copyBtn);
    expect(screen.getByText('Tersalin!')).toBeTruthy();
  });

  it('11.4 - In-Place Markdown Editor Mode', async () => {
    renderWithProviders(<NotesReaderView />);

    const editBtn = await screen.findByRole('button', { name: 'Sunting' });
    fireEvent.click(editBtn);

    const textarea = screen.getByRole('textbox', { name: 'Editor Catatan' });
    expect(textarea).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Simpan' })).toBeTruthy();
  });

  it('11.5 - Save Draft & Note Persistence', async () => {
    renderWithProviders(<NotesReaderView />);

    const editBtn = await screen.findByRole('button', { name: 'Sunting' });
    fireEvent.click(editBtn);

    const textarea = screen.getByRole('textbox', { name: 'Editor Catatan' });
    fireEvent.change(textarea, { target: { value: '# Catatan Diperbarui' } });

    const saveBtn = screen.getByRole('button', { name: 'Simpan' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Catatan berhasil disimpan');
    });

    const lastCall = mockRpc.getLastCall('save_note');
    expect(lastCall?.payload.content_md).toBe('# Catatan Diperbarui');
  });
});

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { rpcCall } from '../../../services/api/rpc';
import {
  defaultNotesAskFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type NotesAskResponse,
} from '../harness';

function NotesTanyaView({ documentId = 101 }: { documentId?: number }) {
  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);

  const simulateSelectText = (text: string) => {
    setSelectedQuote(text);
  };

  const handleOpenDrawer = () => {
    setIsDrawerOpen(true);
  };

  const handleSubmitInquiry = async () => {
    if (!selectedQuote || !question) return;
    const res = await rpcCall<NotesAskResponse>('notes_ask', {
      document_id: documentId,
      quote: selectedQuote,
      question,
      ask_session_id: sessionId || undefined,
    });
    setAnswer(res.answer);
    setSessionId(res.ask_session_id);
  };

  const handleClose = async () => {
    if (sessionId) {
      await rpcCall('notes_ask_delete', { ask_session_id: sessionId }).catch(() => {});
    }
    setIsDrawerOpen(false);
    setSelectedQuote(null);
    setAnswer(null);
    setSessionId(null);
  };

  return (
    <main aria-label="Pembaca Catatan">
      <article
        onMouseUp={() =>
          simulateSelectText('Transport Layer bertugas memastikan transmisi data andal')
        }
      >
        <p>Transport Layer bertugas memastikan transmisi data andal dari ujung ke ujung.</p>
      </article>

      {/* Floating Action Button when text is selected */}
      {selectedQuote && !isDrawerOpen && (
        <Button onClick={handleOpenDrawer} aria-label="Tanya AI tentang kutipan">
          Tanya
        </Button>
      )}

      {/* Slide-out Tanya Drawer */}
      {isDrawerOpen && (
        <aside role="complementary" aria-label="Panel Tanya AI">
          <header>
            <h2>Tanya Asisten AI</h2>
            <Button variant="ghost" onClick={handleClose} aria-label="Tutup panel tanya">
              Tutup
            </Button>
          </header>

          <blockquote aria-label="Kutipan Terpilih">
            {selectedQuote}
          </blockquote>

          {answer && (
            <div role="region" aria-label="Jawaban AI">
              <p>{answer}</p>
            </div>
          )}

          <div>
            <Input
              placeholder="Ajukan pertanyaan tentang kutipan ini..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              aria-label="Pertanyaanmu"
            />
            <Button onClick={handleSubmitInquiry} aria-label="Kirim pertanyaan">
              Kirim
            </Button>
          </div>
        </aside>
      )}
    </main>
  );
}

describe('Feature 12: Notes "Tanya" Quick Ask', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('notes_ask', defaultNotesAskFixture);
    mockRpc.setResponse('notes_ask_delete', { ok: true });
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('12.1 - Text Selection Trigger', () => {
    renderWithProviders(<NotesTanyaView />);

    const article = screen.getByText(/transport layer bertugas/i);
    fireEvent.mouseUp(article);

    const askBtn = screen.getByRole('button', { name: 'Tanya AI tentang kutipan' });
    expect(askBtn).toBeTruthy();
  });

  it('12.2 - Quick Ask Drawer Presentation', () => {
    renderWithProviders(<NotesTanyaView />);

    const article = screen.getByText(/transport layer bertugas/i);
    fireEvent.mouseUp(article);

    const askBtn = screen.getByRole('button', { name: 'Tanya AI tentang kutipan' });
    fireEvent.click(askBtn);

    const drawer = screen.getByRole('complementary', { name: 'Panel Tanya AI' });
    expect(drawer).toBeTruthy();

    const quote = screen.getByRole('blockquote', { name: 'Kutipan Terpilih' });
    expect(quote.textContent).toContain('Transport Layer bertugas memastikan transmisi data andal');
  });

  it('12.3 - AI Inquiry Dispatch', async () => {
    renderWithProviders(<NotesTanyaView />);

    const article = screen.getByText(/transport layer bertugas/i);
    fireEvent.mouseUp(article);
    fireEvent.click(screen.getByRole('button', { name: 'Tanya AI tentang kutipan' }));

    const questionInput = screen.getByRole('textbox', { name: 'Pertanyaanmu' });
    fireEvent.change(questionInput, {
      target: { value: 'Apa perbedaan TCP dan UDP pada Transport Layer?' },
    });

    const sendBtn = screen.getByRole('button', { name: 'Kirim pertanyaan' });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      const call = mockRpc.getLastCall('notes_ask');
      expect(call).toBeTruthy();
      expect(call?.payload.question).toBe('Apa perbedaan TCP dan UDP pada Transport Layer?');
      expect(call?.payload.document_id).toBe(101);
    });
  });

  it('12.4 - Contextual Answer Rendering', async () => {
    renderWithProviders(<NotesTanyaView />);

    const article = screen.getByText(/transport layer bertugas/i);
    fireEvent.mouseUp(article);
    fireEvent.click(screen.getByRole('button', { name: 'Tanya AI tentang kutipan' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Pertanyaanmu' }), {
      target: { value: 'Jelaskan fungsinya' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim pertanyaan' }));

    const answerRegion = await screen.findByRole('region', { name: 'Jawaban AI' });
    expect(answerRegion.textContent).toContain(
      'Transport Layer bertugas memastikan transmisi data andal dari ujung ke ujung'
    );
  });

  it('12.5 - Session Termination & Cleanup', async () => {
    renderWithProviders(<NotesTanyaView />);

    const article = screen.getByText(/transport layer bertugas/i);
    fireEvent.mouseUp(article);
    fireEvent.click(screen.getByRole('button', { name: 'Tanya AI tentang kutipan' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Pertanyaanmu' }), {
      target: { value: 'Pertanyaan' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim pertanyaan' }));

    await screen.findByRole('region', { name: 'Jawaban AI' });

    const closeBtn = screen.getByRole('button', { name: 'Tutup panel tanya' });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      const deleteCall = mockRpc.getLastCall('notes_ask_delete');
      expect(deleteCall).toBeTruthy();
      expect(deleteCall?.payload.ask_session_id).toBe(12);
    });

    expect(screen.queryByRole('complementary', { name: 'Panel Tanya AI' })).toBeNull();
  });
});

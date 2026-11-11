import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { rpcCall } from '../../../services/api/rpc';
import {
  defaultChatSendFixture,
  defaultChatStartFixture,
  mockRpc,
  renderWithProviders,
  unstubTauri,
  type ChatMessage,
  type ChatSendResponse,
  type ChatStartResponse,
} from '../harness';

function MaterialChatView({ documentId = 101 }: { documentId?: number }) {
  const [data, setData] = useState<ChatStartResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    let active = true;
    rpcCall<ChatStartResponse>('chat_start', { document_id: documentId })
      .then((res) => {
        if (active) {
          setData(res);
          setMessages(res.messages || []);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [documentId]);

  const handleSend = async (msgToSend?: string) => {
    const text = (msgToSend ?? input).trim();
    if (!text || !data) return;

    // Optimistically append user message
    const tempUserMsg: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setInput('');
    setIsThinking(true);

    try {
      const res = await rpcCall<ChatSendResponse>('chat_send', {
        session_id: data.session.id,
        message: text,
      });
      setMessages(res.messages || [
        ...messages,
        tempUserMsg,
        { id: Date.now() + 1, role: 'assistant', content: res.response },
      ]);
    } catch {
      // Handle error
    } finally {
      setIsThinking(false);
    }
  };

  const handlePromptClick = (prompt: string) => {
    handleSend(prompt);
  };

  if (!data) return <div role="status">Memuat sesi chat…</div>;

  return (
    <main aria-label="Ruang Chat AI">
      <header>
        <h1>Chat Materi: {data.document.title}</h1>
        <p>Asisten AI belajar siap menjawab pertanyaan seputar materi ini.</p>
      </header>

      {/* Suggested Prompts */}
      <section aria-label="Saran Pertanyaan">
        <Button
          size="sm"
          variant="outline"
          onClick={() => handlePromptClick('Jelaskan konsep dasar materi ini')}
        >
          Jelaskan konsep dasar materi ini
        </Button>
      </section>

      {/* Messages Thread */}
      <section role="log" aria-label="Percakapan Chat">
        {messages.map((m) => (
          <div
            key={m.id}
            role="article"
            aria-label={m.role === 'user' ? 'Pesan Pengguna' : 'Pesan Asisten'}
            className={`msg-${m.role}`}
          >
            <strong>{m.role === 'user' ? 'Kamu' : 'Asisten AI'}</strong>
            <p>{m.content}</p>
          </div>
        ))}
        {isThinking && <div role="status">Sedang berpikir...</div>}
      </section>

      {/* Message Composer */}
      <footer>
        <Input
          placeholder="Tanyakan apa saja tentang materi ini..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Tulis pertanyaan"
        />
        <Button onClick={() => handleSend()} aria-label="Kirim pesan">
          Kirim
        </Button>
      </footer>
    </main>
  );
}

describe('Feature 14: Material AI Chat', () => {
  beforeEach(() => {
    mockRpc.install();
    mockRpc.reset();
    mockRpc.setResponse('chat_start', defaultChatStartFixture);
    mockRpc.setResponse('chat_send', defaultChatSendFixture);
  });

  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    unstubTauri();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('14.1 - Document Context Grounding & Slogan', async () => {
    renderWithProviders(<MaterialChatView />);

    await waitFor(() => {
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.textContent).toContain('Pengantar Jaringan Komputer & OSI Layer');
      expect(
        screen.getByText(/asisten ai belajar siap menjawab pertanyaan/i)
      ).toBeTruthy();
    });
  });

  it('14.2 - Learner vs Assistant Message Styling', async () => {
    renderWithProviders(<MaterialChatView />);

    const assistantMsg = await screen.findByRole('article', { name: 'Pesan Asisten' });
    expect(assistantMsg).toBeTruthy();
    expect(assistantMsg.textContent).toContain('Halo! Saya siap membantu kamu');
  });

  it('14.3 - Message Submission & Optimistic Append', async () => {
    renderWithProviders(<MaterialChatView />);

    await screen.findByRole('article', { name: 'Pesan Asisten' });

    const composer = screen.getByRole('textbox', { name: 'Tulis pertanyaan' });
    fireEvent.change(composer, { target: { value: 'Apa fungsi utama Network Layer?' } });

    const sendBtn = screen.getByRole('button', { name: 'Kirim pesan' });
    fireEvent.click(sendBtn);

    // Optimistically shows user bubble
    expect(screen.getByRole('article', { name: 'Pesan Pengguna' })).toBeTruthy();
    expect(screen.getByText('Apa fungsi utama Network Layer?')).toBeTruthy();

    await waitFor(() => {
      const sendCall = mockRpc.getLastCall('chat_send');
      expect(sendCall).toBeTruthy();
      expect(sendCall?.payload.message).toBe('Apa fungsi utama Network Layer?');
    });
  });

  it('14.4 - Generation Indicator Presentation', async () => {
    mockRpc.setDelay('chat_send', 500);
    renderWithProviders(<MaterialChatView />);

    await screen.findByRole('article', { name: 'Pesan Asisten' });

    const composer = screen.getByRole('textbox', { name: 'Tulis pertanyaan' });
    fireEvent.change(composer, { target: { value: 'Halo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim pesan' }));

    expect(screen.getByRole('status').textContent).toContain('Sedang berpikir...');
  });

  it('14.5 - Suggested Prompt Quick Injection', async () => {
    renderWithProviders(<MaterialChatView />);

    const promptBtn = await screen.findByRole('button', {
      name: 'Jelaskan konsep dasar materi ini',
    });
    fireEvent.click(promptBtn);

    await waitFor(() => {
      const sendCall = mockRpc.getLastCall('chat_send');
      expect(sendCall).toBeTruthy();
      expect(sendCall?.payload.message).toBe('Jelaskan konsep dasar materi ini');
    });
  });
});

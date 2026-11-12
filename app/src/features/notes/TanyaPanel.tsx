import React, { useEffect, useRef, useState } from 'react';
import { Icon, IconButton } from '../../components/ui';
import { rpcCall } from '../../services/api/rpc';
import { apiUrl } from '../../services/api/client';
import { renderMarkdown } from './markdown/parser';
import type { TanyaMessage } from './types';
import styles from './Notes.module.css';
import { tr } from '../../services/i18n';

interface TanyaPanelProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: number;
  initialQuote: string;
}

export function TanyaPanel({
  isOpen,
  onClose,
  documentId,
  initialQuote,
}: TanyaPanelProps) {
  const [messages, setMessages] = useState<TanyaMessage[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [askSessionId, setAskSessionId] = useState<number | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const currentSessionRef = useRef<number | null>(null);
  const activeReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    currentSessionRef.current = askSessionId;
  }, [askSessionId]);

  // Teardown session and cancel in-flight stream on unmount
  useEffect(() => {
    return () => {
      if (activeReaderRef.current) {
        try {
          activeReaderRef.current.cancel();
        } catch {
          /* ignore */
        }
      }
      if (currentSessionRef.current) {
        rpcCall('notes_ask_delete', { ask_session_id: currentSessionRef.current }).catch(() => {});
      }
    };
  }, []);

  const handleClose = () => {
    if (activeReaderRef.current) {
      try {
        activeReaderRef.current.cancel();
      } catch {
        /* ignore */
      }
    }
    if (currentSessionRef.current) {
      rpcCall('notes_ask_delete', { ask_session_id: currentSessionRef.current }).catch(() => {});
      setAskSessionId(null);
      currentSessionRef.current = null;
    }
    onClose();
  };

  const scrollToBottom = () => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  };

  const executeAsk = async (question: string, quote?: string) => {
    setIsAsking(true);
    const userMsgId = `u-${Date.now()}`;
    const botMsgId = `a-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: question },
      { id: botMsgId, role: 'assistant', content: '', isStreaming: true },
    ]);
    setTimeout(scrollToBottom, 20);

    let streamed = false;
    let accumulated = '';

    try {
      const response = await fetch(apiUrl('/api/notes/ask'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: documentId,
          quote: quote || undefined,
          question,
          ask_session_id: currentSessionRef.current,
        }),
      });

      if (
        response.ok &&
        response.body &&
        (response.headers.get('content-type') || '').includes('text/event-stream')
      ) {
        const reader = response.body.getReader();
        activeReaderRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(trimmed.slice(6));
              if (ev.type === 'chunk' && ev.chunk) {
                accumulated += ev.chunk;
                setMessages((prev) =>
                  prev.map((m) => (m.id === botMsgId ? { ...m, content: accumulated } : m))
                );
                scrollToBottom();
              } else if (ev.type === 'done' && ev.data) {
                if (ev.data.ask_session_id) {
                  setAskSessionId(ev.data.ask_session_id);
                  currentSessionRef.current = ev.data.ask_session_id;
                }
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === botMsgId
                      ? { ...m, content: ev.data.answer || accumulated, isStreaming: false }
                      : m
                  )
                );
                streamed = true;
              } else if (ev.type === 'error') {
                throw new Error(ev.error || tr('Kesalahan pada respon AI'));
              }
            } catch {
              /* ignore parse errors on malformed event */
            }
          }
        }
        activeReaderRef.current = null;
      }
    } catch {
      /* fallback to non-streaming RPC */
    }

    if (!streamed) {
      try {
        const r = await rpcCall<{ answer: string; ask_session_id?: number }>('notes_ask', {
          document_id: documentId,
          quote: quote || undefined,
          question,
          ask_session_id: currentSessionRef.current,
        });
        if (r.ask_session_id) {
          setAskSessionId(r.ask_session_id);
          currentSessionRef.current = r.ask_session_id;
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMsgId ? { ...m, content: r.answer, isStreaming: false } : m
          )
        );
      } catch (err: any) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMsgId
              ? { ...m, content: err?.message || tr('Gagal memuat jawaban.'), isStreaming: false }
              : m
          )
        );
      }
    }

    setIsAsking(false);
    setTimeout(scrollToBottom, 20);
  };

  // Trigger default question on receiving initialQuote when opening
  useEffect(() => {
    if (isOpen && initialQuote) {
      setMessages([]);
      executeAsk('Jelaskan teks yang saya kutip ini dengan bahasa sederhana.', initialQuote);
    }
  }, [isOpen, initialQuote]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = inputVal.trim();
    if (!q || isAsking) return;
    setInputVal('');
    executeAsk(q);
  };

  return (
    <aside className={styles.askPanel} role="dialog" aria-label={tr('Panel tanya AI')}>
      <header className={styles.askHead}>
        <div className={styles.askTitleGroup}>
          <Icon name="sparkles" size={18} />
          <div>
            <div className={styles.askTitle}>{tr('Tanya AI')}</div>
            <div className={styles.askSubtitle}>{tr('Penjelasan teks pilihan')}</div>
          </div>
        </div>
        <IconButton label={tr('Tutup panel tanya AI')} icon="x" size="sm" variant="ghost" onClick={handleClose} />
      </header>

      {initialQuote && (
        <div className={styles.quoteCard}>
          <div className={styles.quoteLabel}>{tr('Teks yang ditanyakan:')}</div>
          <div className={styles.quoteText}>
            {initialQuote.length > 200 ? `${initialQuote.slice(0, 200)}…` : initialQuote}
          </div>
        </div>
      )}

      <div ref={threadRef} className={styles.thread}>
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? styles.userBubble : styles.assistantBubble}>
            {m.role === 'user' ? (
              m.content
            ) : (
              <div>
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                {m.isStreaming && <span className={styles.cursor} />}
              </div>
            )}
          </div>
        ))}
      </div>

      <footer className={styles.askFoot}>
        <form onSubmit={handleSubmit} className={styles.inputForm}>
          <input
            type="text"
            className={styles.askInput}
            placeholder={tr('Lanjut tanya…')}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            disabled={isAsking}
            maxLength={500}
            aria-label={tr('Pertanyaan lanjutan')}
          />
          <IconButton
            label={tr('Kirim pertanyaan')}
            icon="sparkles"
            type="submit"
            size="sm"
            variant="primary"
            disabled={isAsking || !inputVal.trim()}
          />
        </form>
        <div className={styles.hintText}>{tr('Tekan Enter untuk mengirim · Dijawab oleh DeepSeek')}</div>
      </footer>
    </aside>
  );
}

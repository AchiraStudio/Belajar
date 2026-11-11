import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  ErrorState,
  Icon,
  IconButton,
  Skeleton,
  StatusBadge,
  UnavailableState,
  useToast,
} from '../../components/ui';
import { errorMessage, isUnavailableMessage } from '../../hooks/useRpcQuery';
import { ApiError, apiStream } from '../../services/api/client';
import { dropCache, rpcCall } from '../../services/api/rpc';
import { copyText } from '../../services/files';
import { renderMarkdown } from '../notes/markdown/parser';
import type { ChatMessage, ChatSession, ChatStartResponse } from './types';
import styles from './Chat.module.css';

interface Props {
  documentId: number;
  /** Called after the session is deleted, so the workspace can return to the notes. */
  onDeleted: () => void;
}

const SEND_TIMEOUT_MS = 120_000;

function timeLabel(ts?: number): string {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; unavailable: boolean }
  | { kind: 'ready' };

export function ChatView({ documentId, onDeleted }: Props) {
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'new' | 'continue'>('new');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const start = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      const res = await rpcCall<ChatStartResponse>('chat_start', { document_id: documentId });
      if (!alive.current) return;
      setSession(res.session);
      setMessages(res.messages ?? []);
      setTitle(res.document?.title ?? '');
      setMode(res.mode === 'continue' ? 'continue' : 'new');
      setPhase({ kind: 'ready' });
    } catch (err) {
      if (!alive.current) return;
      const message = errorMessage(err, 'Gagal memulai chat.');
      setPhase({ kind: 'error', message, unavailable: isUnavailableMessage(message) });
    }
  }, [documentId]);

  useEffect(() => {
    void start();
  }, [start]);

  // While the server assembles the material context, poll until the session is ready.
  useEffect(() => {
    if (!session || session.status !== 'preparing') return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await rpcCall<{ session: ChatSession; messages: ChatMessage[] }>(
          'chat_get',
          { session_id: session.id },
          { bypassCache: true },
        );
        if (stop || !alive.current) return;
        setSession(res.session);
        setMessages(res.messages ?? []);
        if (res.session.status === 'ready') toast.success('Konteks materi siap. Kamu bisa mulai bertanya.');
      } catch {
        /* retry on the next round */
      }
    };
    const t = setInterval(tick, 1500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [session, toast]);

  // Keep the thread pinned to the bottom only while the reader is already near it.
  const onScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useLayoutEffect(() => {
    const el = threadRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, phase.kind]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || !session || session.status !== 'ready') return;
    setSending(true);
    setDraft('');
    stickRef.current = true;
    const stamp = Date.now();
    const userMsg: ChatMessage = { id: `u-${stamp}`, role: 'user', content: text, ts: stamp / 1000 };
    const botId = `a-${stamp}`;
    setMessages((prev) => [...prev, userMsg, { id: botId, role: 'assistant', content: '', pending: true }]);

    const rollback = (message: string) => {
      setMessages((prev) => prev.filter((m) => m.id !== botId && m.id !== userMsg.id));
      setDraft(text);
      toast.error(message);
    };

    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    let acc = '';
    let raf = 0;
    const flush = () => {
      raf = 0;
      const snapshot = acc;
      setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, content: snapshot } : m)));
    };
    let final: { response?: string; messages?: ChatMessage[] } | null = null;
    let streamError: string | null = null;

    try {
      let outcome: 'streamed' | 'not-stream' = 'not-stream';
      try {
        outcome = await apiStream(
          '/api/chat/send',
          { session_id: session.id, message: text },
          {
            signal,
            onEvent: (ev) => {
              if (ev.type === 'chunk' && typeof ev.chunk === 'string') {
                acc += ev.chunk;
                if (!raf) raf = requestAnimationFrame(flush);
              } else if (ev.type === 'done' && ev.data && typeof ev.data === 'object') {
                final = ev.data as typeof final;
              } else if (ev.type === 'error') {
                streamError = typeof ev.error === 'string' ? ev.error : 'Terjadi kesalahan pada respons AI.';
              }
            },
          },
        );
      } catch (err) {
        if (signal.aborted) throw err;
        // Network problems before any text arrived fall back to the plain RPC below.
        if (acc) throw err;
        outcome = 'not-stream';
      }
      if (raf) cancelAnimationFrame(raf);

      if (outcome === 'streamed') {
        if (streamError) throw new Error(streamError);
        const done = final as { response?: string; messages?: ChatMessage[] } | null;
        if (done?.messages) setMessages(done.messages);
        else
          setMessages((prev) =>
            prev.map((m) => (m.id === botId ? { ...m, content: done?.response ?? acc, pending: false } : m)),
          );
      } else {
        const res = await rpcCall<{ messages: ChatMessage[] }>(
          'chat_send',
          { session_id: session.id, message: text },
          { timeoutMs: SEND_TIMEOUT_MS, signal },
        );
        setMessages(res.messages);
      }
      dropCache();
    } catch (err) {
      if (raf) cancelAnimationFrame(raf);
      if (signal.aborted) {
        // Stopped by the learner: keep what already streamed, mark it as interrupted.
        setMessages((prev) =>
          prev.map((m) => (m.id === botId ? { ...m, pending: false, interrupted: true, content: m.content || '' } : m)),
        );
        toast.info('Jawaban dihentikan.');
      } else {
        rollback(err instanceof ApiError || err instanceof Error ? err.message : 'Gagal mengirim pesan.');
      }
    } finally {
      abortRef.current = null;
      if (alive.current) setSending(false);
    }
  };

  const stop = () => abortRef.current?.abort();

  const resetSession = async () => {
    if (!session || deleting) return;
    setDeleting(true);
    try {
      await rpcCall('chat_delete', { session_id: session.id });
      dropCache();
      setConfirmDelete(false);
      toast.success('Sesi chat dihapus');
      onDeleted();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menghapus sesi chat.'));
    } finally {
      setDeleting(false);
    }
  };

  const retryContext = async () => {
    if (!session) return;
    try {
      await rpcCall('chat_delete', { session_id: session.id });
    } catch {
      /* chat_start cleans up error sessions itself */
    }
    void start();
  };

  const copy = async (text: string) => {
    (await copyText(text)) ? toast.success('Jawaban disalin') : toast.error('Tidak bisa menyalin ke papan klip.');
  };

  // ------------------------------------------------------------------ render
  if (phase.kind === 'loading') {
    return (
      <div className={styles.shell} aria-busy="true" aria-label="Memuat chat">
        <Skeleton height="56px" borderRadius="16px" />
        <Skeleton height="280px" borderRadius="16px" />
      </div>
    );
  }
  if (phase.kind === 'error') {
    if (phase.unavailable) {
      return (
        <UnavailableState
          icon="message"
          title="Chat AI belum tersedia di server ini"
          description={`${phase.message} Chat dijawab oleh model AI berdasarkan isi materimu, jadi tidak disimulasikan.`}
          requirements={['Layanan AI dikonfigurasi di server', 'Aksi chat_start, chat_get, dan chat_send tersedia']}
        />
      );
    }
    return <ErrorState message={phase.message} onRetry={() => void start()} />;
  }

  const status = session?.status ?? 'error';
  const ready = status === 'ready';
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

  return (
    <section className={styles.shell} aria-label={`Chat AI tentang ${title || 'materi'}`}>
      <header className={styles.head}>
        <div className={styles.headText}>
          <span className={styles.grounded}>
            <Icon name="book" size={14} /> Berdasarkan materi
          </span>
          <h2 className={styles.title}>{title || 'Materi'}</h2>
        </div>
        <div className={styles.headMeta}>
          <StatusBadge
            status={status === 'ready' ? 'success' : status === 'preparing' ? 'processing' : 'error'}
            label={status === 'ready' ? 'Siap' : status === 'preparing' ? 'Menyiapkan konteks' : 'Konteks gagal'}
            pulse={status === 'preparing'}
          />
          <span className={styles.mode}>{mode === 'continue' ? 'Melanjutkan obrolan' : 'Obrolan baru'}</span>
          <IconButton label="Hapus sesi chat" icon="trash" size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} />
        </div>
      </header>

      {status === 'error' && (
        <div className={styles.notice} role="alert">
          <Icon name="alert-circle" size={16} />
          <span>Konteks materi gagal disiapkan.</span>
          <Button size="sm" variant="outline" onClick={retryContext}>
            Coba lagi
          </Button>
        </div>
      )}
      {status === 'preparing' && (
        <div className={styles.notice} role="status">
          <Icon name="refresh" size={16} className="spin" />
          <span>Menyiapkan konteks materi… pertanyaan bisa diajukan setelah siap.</span>
        </div>
      )}

      <div ref={threadRef} className={styles.thread} onScroll={onScroll} role="log" aria-label="Riwayat percakapan" aria-live="off" tabIndex={0}>
        {messages.length === 0 && (
          <div className={styles.hello}>
            <Icon name="sparkles" size={22} />
            <p>Tanyakan apa saja tentang materi ini. Jawaban disusun dari isinya, dan bisa salah, jadi periksa kembali hal penting.</p>
          </div>
        )}
        {messages.map((m) => (
          <article key={m.id} className={`${styles.msg} ${m.role === 'user' ? styles.user : styles.ai}`}>
            <div className={styles.who}>
              {m.role === 'user' ? 'Kamu' : 'Asisten'}
              {m.ts ? <span className={styles.time}>{timeLabel(m.ts)}</span> : null}
            </div>
            {m.role === 'user' ? (
              <div className={styles.userText}>{m.content}</div>
            ) : m.pending && !m.content ? (
              <div className={styles.typing} role="status" aria-label="Asisten sedang menjawab">
                <i /><i /><i />
              </div>
            ) : (
              <>
                <div className={styles.md} dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                {m.pending && <span className={styles.cursor} aria-hidden="true" />}
                {m.interrupted && <div className={styles.interrupted}>Jawaban dihentikan.</div>}
                {!m.pending && m.content && (
                  <div className={styles.msgActions}>
                    <IconButton label="Salin jawaban" icon="copy" size="sm" variant="ghost" onClick={() => void copy(m.content)} />
                  </div>
                )}
              </>
            )}
          </article>
        ))}
      </div>

      <p className={styles.srOnly} role="status" aria-live="polite">
        {sending ? 'Asisten sedang menjawab.' : lastAssistant && !lastAssistant.pending ? 'Jawaban asisten selesai.' : ''}
      </p>

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className={styles.srOnly} htmlFor="chat-input">
          Pertanyaan tentang materi
        </label>
        <textarea
          id="chat-input"
          className={styles.input}
          rows={1}
          maxLength={4000}
          placeholder={ready ? 'Tanyakan sesuatu tentang materi…' : 'Menunggu konteks materi…'}
          value={draft}
          disabled={!ready}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        {sending ? (
          <Button type="button" variant="outline" icon="x" onClick={stop}>
            Berhenti
          </Button>
        ) : (
          <Button type="submit" icon="send" disabled={!ready || !draft.trim()} aria-label="Kirim pertanyaan">
            Kirim
          </Button>
        )}
      </form>
      <p className={styles.fine}>Enter untuk kirim · Shift+Enter baris baru</p>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Hapus sesi chat?"
        description="Seluruh riwayat obrolan untuk materi ini dihapus permanen, termasuk konteks yang sudah disiapkan."
        size="sm"
        dismissible={!deleting}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Batal
            </Button>
            <Button variant="danger" loading={deleting} onClick={resetSession}>
              Hapus sesi
            </Button>
          </>
        }
      >
        <p className={styles.fine}>Kamu bisa memulai obrolan baru kapan saja.</p>
      </Dialog>
    </section>
  );
}

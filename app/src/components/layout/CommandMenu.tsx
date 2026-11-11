import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { rpcCall } from '../../services/api/rpc';
import { Dialog } from '../ui/Dialog';
import { Icon, type IconName } from '../ui/Icon';
import { ALL_ENTRIES } from './navigation';
import styles from './CommandMenu.module.css';

interface Result {
  key: string;
  label: string;
  hint: string;
  icon: IconName;
  to: string;
}

interface DocLite {
  id: number;
  title: string;
  subject_name?: string | null;
}

/**
 * Ctrl/Cmd+K palette: jump to any destination or open a material by title. Materials come from the
 * existing `list_documents` action (filtered locally); nothing new is requested from the server.
 */
export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [docs, setDocs] = useState<DocLite[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    let cancelled = false;
    rpcCall<{ documents: DocLite[] }>('list_documents', {})
      .then((r) => {
        if (!cancelled) setDocs(r.documents ?? []);
      })
      .catch(() => {
        /* the destinations still work without materials */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const pages: Result[] = ALL_ENTRIES.filter((e) => !q || `${e.label} ${e.keywords ?? ''}`.toLowerCase().includes(q)).map((e) => ({
      key: `p:${e.path}`,
      label: e.label,
      hint: e.soon ? 'Segera' : 'Halaman',
      icon: e.icon,
      to: e.path,
    }));
    const materials: Result[] = q
      ? docs
          .filter((d) => d.title.toLowerCase().includes(q) || (d.subject_name ?? '').toLowerCase().includes(q))
          .slice(0, 8)
          .map((d) => ({ key: `d:${d.id}`, label: d.title, hint: d.subject_name || 'Materi', icon: 'book' as const, to: `/materi/${d.id}` }))
      : [];
    return [...materials, ...pages].slice(0, 12);
  }, [query, docs]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (r: Result | undefined) => {
    if (!r) return;
    onClose();
    navigate(r.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Cari" description="Lompat ke halaman atau buka materi." size="md">
      <div className={styles.box}>
        <div className={styles.field}>
          <Icon name="search" size={16} />
          <input
            data-autofocus
            className={styles.input}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            aria-activedescendant={results[active] ? `cmd-${results[active]!.key}` : undefined}
            aria-label="Cari halaman atau materi"
            placeholder="Ketik nama halaman atau judul materi…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <ul id="cmd-list" ref={listRef} role="listbox" aria-label="Hasil pencarian" className={styles.list}>
          {results.map((r, i) => (
            <li
              key={r.key}
              id={`cmd-${r.key}`}
              role="option"
              aria-selected={i === active}
              className={`${styles.item} ${i === active ? styles.itemActive : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r)}
            >
              <Icon name={r.icon} size={18} />
              <span className={styles.label}>{r.label}</span>
              <span className={styles.hint}>{r.hint}</span>
            </li>
          ))}
          {results.length === 0 && <li className={styles.empty}>Tidak ada hasil untuk “{query}”.</li>}
        </ul>
      </div>
    </Dialog>
  );
}

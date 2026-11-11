import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  ProgressBar,
  Skeleton,
  StatusBadge,
  SurfaceCard,
  UnavailableState,
  useToast,
} from '../../components/ui';
import { errorMessage, isUnavailableMessage } from '../../hooks/useRpcQuery';
import { pollJob } from '../../services/api/jobs';
import { dropCache, rpcCall } from '../../services/api/rpc';
import { copyText } from '../../services/files';
import { useTheme } from '../../services/theme/ThemeContext';
import { buildSvg, exportFileName, saveBlob, svgToPng } from './export';
import { THEME_DARK, THEME_LIGHT } from './Graph';
import { buildLayout, canvasMeasure, defaultCollapsed, findPath } from './layout';
import { MindMapCanvas, type CanvasHandle } from './MindMapCanvas';
import type { MindJob, MindMapResponse, MindNode } from './types';
import styles from './MindMap.module.css';

interface Props {
  documentId: number;
  /** Switches to the notes tab and scrolls to the first match for `text`. */
  onFindInNotes: (text: string) => void;
}

function collectMatches(root: MindNode, query: string): Set<string> {
  const q = query.trim().toLowerCase();
  const out = new Set<string>();
  if (!q) return out;
  const walk = (n: MindNode) => {
    if (n.label.toLowerCase().includes(q)) out.add(n.id);
    n.children?.forEach(walk);
  };
  walk(root);
  return out;
}

export function MindMapView({ documentId, onFindInNotes }: Props) {
  const toast = useToast();
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === 'dark' ? THEME_DARK : THEME_LIGHT;

  const [resp, setResp] = useState<MindMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<MindJob | null>(null);
  const [view, setView] = useState<'peta' | 'daftar'>(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches ? 'daftar' : 'peta',
  );
  const [showRel, setShowRel] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(100);
  const [exporting, setExporting] = useState<null | 'svg' | 'png' | 'copy'>(null);
  const handle = useRef<CanvasHandle>(null);
  const loadedStamp = useRef<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  const mm = resp?.mindmap ?? null;

  const load = useCallback(
    async (bypass = false) => {
      try {
        const r = await rpcCall<MindMapResponse>('mindmap_get', { document_id: documentId }, { bypassCache: bypass });
        setResp(r);
        setError(null);
        setJob(r.job && (r.job.status === 'queued' || r.job.status === 'running') ? r.job : null);
        const next = r.mindmap;
        if (next && next.updated_at !== loadedStamp.current) {
          loadedStamp.current = next.updated_at;
          setSelected(null);
          setCollapsed(defaultCollapsed(next.root));
        }
        return r;
      } catch (err) {
        setError(errorMessage(err, 'Gagal memuat mind map.'));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [documentId],
  );

  const watch = useCallback(
    async (jobId: number) => {
      abort.current?.abort();
      abort.current = new AbortController();
      const done = await pollJob(jobId, {
        signal: abort.current.signal,
        onUpdate: (j) => setJob(j as MindJob),
      });
      if (!done) return;
      if (done.status === 'failed') {
        setJob(null);
        toast.error(done.error || 'Mind map gagal dibuat.');
        return;
      }
      dropCache();
      await load(true);
    },
    [load, toast],
  );

  useEffect(() => {
    setLoading(true);
    void load(false).then((r) => {
      if (r?.job && (r.job.status === 'queued' || r.job.status === 'running')) void watch(r.job.id);
    });
    return () => abort.current?.abort();
  }, [load, watch]);

  const generate = async () => {
    try {
      const r = await rpcCall<{ job_id: number }>('mindmap_generate', { document_id: documentId });
      setJob({ id: r.job_id, status: 'queued', progress: 3, message: 'Menunggu giliran' });
      void watch(r.job_id);
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal memulai pembuatan mind map.'));
    }
  };

  const layout = useMemo(() => (mm ? buildLayout(mm.root, collapsed, canvasMeasure) : null), [mm, collapsed]);
  const matches = useMemo(() => (mm && query.trim() ? collectMatches(mm.root, query) : null), [mm, query]);

  // Searching opens every branch that hides a match.
  useEffect(() => {
    if (!mm || !matches || matches.size === 0) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of matches) {
        const path = findPath(mm.root, id) ?? [];
        for (const anc of path.slice(0, -1)) {
          if (next.delete(anc.id)) changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [matches, mm]);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !matches || matches.size === 0) return;
    const first = [...matches][0] as string;
    setSelected(first);
    // wait one frame so the layout includes any freshly opened branch
    requestAnimationFrame(() => handle.current?.centerOn(first));
  };

  const doExport = async (kind: 'svg' | 'png' | 'copy') => {
    if (!mm || exporting) return;
    setExporting(kind);
    try {
      const svg = await buildSvg(mm, THEME_LIGHT);
      if (kind === 'copy') {
        (await copyText(svg.text)) ? toast.success('SVG disalin ke papan klip') : toast.error('Tidak bisa menyalin ke papan klip.');
      } else if (kind === 'svg') {
        saveBlob(new Blob([svg.text], { type: 'image/svg+xml;charset=utf-8' }), exportFileName(mm, 'svg'))
          ? toast.success('SVG diunduh')
          : toast.error('Perangkat ini tidak mengizinkan unduhan. Coba "Salin SVG".');
      } else {
        const blob = await svgToPng(svg);
        blob && saveBlob(blob, exportFileName(mm, 'png')) ? toast.success('PNG diunduh') : toast.error('Gagal membuat PNG.');
      }
    } catch {
      toast.error('Gagal mengekspor mind map.');
    } finally {
      setExporting(null);
    }
  };

  // ------------------------------------------------------------------ states
  if (loading && !resp) {
    return (
      <div className={styles.wrap} aria-busy="true" aria-label="Memuat mind map">
        <Skeleton height="460px" borderRadius="20px" />
      </div>
    );
  }

  if (error && !resp) {
    if (isUnavailableMessage(error)) {
      return (
        <UnavailableState
          icon="network"
          title="Mind map belum tersedia di server ini"
          description={`${error} Mind map disusun AI dari catatanmu, jadi tidak ditampilkan sebagai data tiruan.`}
          requirements={['Layanan AI dikonfigurasi di server', 'Aksi mindmap_get dan mindmap_generate tersedia']}
        />
      );
    }
    return <ErrorState message={error} onRetry={() => { setLoading(true); void load(true); }} />;
  }

  if (job) {
    const p = Math.round(job.progress ?? 3);
    return (
      <SurfaceCard className={styles.progressCard} role="status" aria-live="polite">
        <Icon name="refresh" size={20} className="spin" />
        <h2 className={styles.stateTitle}>Menyusun mind map…</h2>
        <p className={styles.stateText}>{job.message || 'Menunggu giliran diproses AI.'}</p>
        <ProgressBar value={p} label="Kemajuan pembuatan mind map" showValue />
        <p className={styles.stateHint}>Halaman ini boleh ditinggalkan; prosesnya tetap berjalan.</p>
      </SurfaceCard>
    );
  }

  if (!mm || !layout) {
    return (
      <EmptyState
        icon="network"
        title="Belum ada mind map"
        description="AI akan menyusun konsep utama, cabang pembahasan, dan hubungan antarcabang dari catatan materi ini."
        actionLabel="Buat mind map"
        onAction={generate}
      />
    );
  }

  const sel = selected ? layout.byId.get(selected) ?? null : null;
  const selNode = selected && mm ? (findPath(mm.root, selected)?.at(-1) ?? null) : null;
  const trail = selected && mm ? (findPath(mm.root, selected) ?? []) : [];
  const related = selected && mm
    ? mm.relations.filter((r) => r.from === selected || r.to === selected).map((r) => {
        const otherId = r.from === selected ? r.to : r.from;
        const other = findPath(mm.root, otherId)?.at(-1);
        return other ? { id: otherId, label: other.label, relation: r.label } : null;
      }).filter((x): x is { id: string; label: string; relation: string | undefined } => x !== null)
    : [];

  return (
    <div className={styles.wrap}>
      {mm.stale && (
        <div className={styles.stale} role="status">
          <Icon name="alert-triangle" size={16} />
          <span>Catatan berubah sejak mind map ini dibuat, jadi isinya mungkin sudah usang.</span>
          <Button size="sm" variant="outline" onClick={generate}>
            Buat ulang
          </Button>
        </div>
      )}

      <div className={styles.toolbar} role="toolbar" aria-label="Kontrol mind map">
        <div className={styles.seg} role="group" aria-label="Mode tampilan">
          <button type="button" aria-pressed={view === 'peta'} onClick={() => setView('peta')}>
            <Icon name="network" size={15} /> Peta
          </button>
          <button type="button" aria-pressed={view === 'daftar'} onClick={() => setView('daftar')}>
            <Icon name="list" size={15} /> Daftar
          </button>
        </div>

        <label className={styles.search}>
          <Icon name="search" size={15} />
          <span className={styles.srOnly}>Cari konsep di peta</span>
          <input
            type="search"
            placeholder="Cari konsep…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
          />
          {matches && <span className={styles.count}>{matches.size}</span>}
        </label>

        {view === 'peta' && (
          <div className={styles.group} role="group" aria-label="Zoom">
            <IconButton label="Perkecil" icon="zoom-out" size="sm" variant="ghost" onClick={() => handle.current?.zoomBy(1 / 1.2)} />
            <span className={styles.zoom} aria-live="off">{zoom}%</span>
            <IconButton label="Perbesar" icon="zoom-in" size="sm" variant="ghost" onClick={() => handle.current?.zoomBy(1.2)} />
            <IconButton label="Sesuaikan ke layar" icon="maximize" size="sm" variant="ghost" onClick={() => handle.current?.fit()} />
            <IconButton label="Reset zoom" icon="undo" size="sm" variant="ghost" onClick={() => handle.current?.reset()} />
          </div>
        )}

        <label className={styles.check}>
          <input type="checkbox" checked={showRel} onChange={(e) => setShowRel(e.target.checked)} />
          Hubungan antarcabang
        </label>

        <details className={styles.menu}>
          <summary>
            <Icon name="download" size={15} /> Ekspor
          </summary>
          <div className={styles.menuPanel}>
            <button type="button" onClick={() => void doExport('svg')} disabled={exporting !== null}>
              Unduh SVG
            </button>
            <button type="button" onClick={() => void doExport('png')} disabled={exporting !== null}>
              Unduh PNG
            </button>
            <button type="button" onClick={() => void doExport('copy')} disabled={exporting !== null}>
              Salin SVG
            </button>
          </div>
        </details>
      </div>

      {view === 'peta' ? (
        <div className={styles.stage}>
          <MindMapCanvas
            ref={handle}
            layout={layout}
            relations={mm.relations}
            theme={theme}
            selected={selected}
            showRelations={showRel}
            collapsed={collapsed}
            matches={matches && matches.size > 0 ? matches : matches ? new Set<string>() : null}
            onSelect={setSelected}
            onToggle={toggle}
            onZoom={setZoom}
            label="Peta konsep. Seret untuk menggeser, Ctrl dan gulir untuk zoom, atau gunakan tombol panah."
          />
          {sel && selNode && (
            <aside className={styles.detail} aria-label="Detail konsep terpilih">
              <div className={styles.detailHead}>
                <strong>{selNode.label}</strong>
                <IconButton label="Tutup detail" icon="x" size="sm" variant="ghost" onClick={() => setSelected(null)} />
              </div>
              {trail.length > 1 && <div className={styles.trail}>{trail.slice(0, -1).map((t) => t.label).join(' › ')}</div>}
              {(selNode.children?.length ?? 0) > 0 && (
                <p className={styles.detailMeta}>{selNode.children!.length} sub-topik</p>
              )}
              {related.length > 0 && (
                <ul className={styles.related}>
                  {related.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => { setSelected(r.id); handle.current?.centerOn(r.id); }}>
                        {r.relation ? <em>{r.relation}</em> : <em>terkait</em>} {r.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className={styles.detailActions}>
                <Button size="sm" icon="book" onClick={() => onFindInNotes(selNode.label)}>
                  Cari di catatan
                </Button>
                {sel.hasKids && sel.depth > 0 && (
                  <Button size="sm" variant="outline" onClick={() => toggle(selNode.id)}>
                    {collapsed.has(selNode.id) ? 'Buka cabang' : 'Lipat cabang'}
                  </Button>
                )}
              </div>
            </aside>
          )}
        </div>
      ) : (
        <SurfaceCard className={styles.outline}>
          <Outline node={mm.root} depth={0} collapsed={collapsed} matches={matches} onToggle={toggle} onFind={onFindInNotes} />
        </SurfaceCard>
      )}

      <div className={styles.footer}>
        <StatusBadge status="neutral" label={`${mm.node_count} simpul`} />
        <span>Dibuat dari catatan oleh AI. Periksa kembali isinya terhadap sumber.</span>
      </div>
    </div>
  );
}

function Outline({
  node,
  depth,
  collapsed,
  matches,
  onToggle,
  onFind,
}: {
  node: MindNode;
  depth: number;
  collapsed: ReadonlySet<string>;
  matches: ReadonlySet<string> | null;
  onToggle: (id: string) => void;
  onFind: (text: string) => void;
}) {
  const kids = node.children ?? [];
  const closed = collapsed.has(node.id) && depth > 0;
  const hit = matches?.has(node.id);
  return (
    <ul className={depth === 0 ? styles.tree : styles.subtree} role={depth === 0 ? 'tree' : 'group'}>
      <li role="treeitem" aria-expanded={kids.length ? !closed : undefined}>
        <div className={`${styles.nodeRow} ${hit ? styles.hit : ''}`}>
          {kids.length > 0 && depth > 0 ? (
            <button type="button" className={styles.fold} onClick={() => onToggle(node.id)} aria-label={`${closed ? 'Buka' : 'Ciutkan'} ${node.label}`}>
              <Icon name={closed ? 'chevron-right' : 'chevron-down'} size={14} />
            </button>
          ) : (
            <span className={styles.foldSpace} />
          )}
          <button type="button" className={`${styles.nodeBtn} ${depth === 0 ? styles.nodeRoot : ''}`} onClick={() => onFind(node.label)} title="Cari di catatan">
            {node.label}
          </button>
          {closed && <span className={styles.count}>{kids.length}</span>}
        </div>
        {!closed &&
          kids.map((c) => (
            <Outline key={c.id} node={c} depth={depth + 1} collapsed={collapsed} matches={matches} onToggle={onToggle} onFind={onFind} />
          ))}
      </li>
    </ul>
  );
}

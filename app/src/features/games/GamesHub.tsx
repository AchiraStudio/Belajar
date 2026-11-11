import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  MetricTile,
  PageHeader,
  ProgressBar,
  Select,
  Skeleton,
  StatusBadge,
  SurfaceCard,
  useToast,
  type IconName,
} from '../../components/ui';
import { errorMessage, isUnavailableMessage, useRpcQuery } from '../../hooks/useRpcQuery';
import { dropCache, rpcCall } from '../../services/api/rpc';
import { parseScope, type GameHub, type GameMode } from './types';
import styles from './Games.module.css';

const MODE_ICON: Record<string, IconName> = {
  ajari: 'message',
  detektif: 'search',
  petualangan: 'compass',
  kasus: 'lightbulb',
  kilat: 'zap',
  boss: 'trophy',
};

const MODE_TIPS: Record<string, string> = {
  ajari: 'Jelaskan dengan kata-katamu sendiri. Murid AI akan bertanya kritis, lalu menilai penjelasanmu dengan rubrik.',
  detektif: 'Cari 1–2 kalimat keliru di dalam penjelasan yang tampak meyakinkan. Koreksi opsional dinilai AI.',
  petualangan: 'Cerita bercabang dengan 3 nyawa. Tiap rintangan adalah tantangan dari materimu.',
  kasus: 'Pilih tindakan untuk skenario dunia nyata, lalu jelaskan alasanmu.',
  kilat: 'Soal cepat, satu tangan. Cocok untuk 5–10 menit.',
  boss: 'Ujian lintas topik tanpa petunjuk dan tanpa umpan balik sampai selesai, ditutup rapor.',
};

const LEVEL_LABEL = { baru: 'Baru', dikenal: 'Dikenal', paham: 'Paham', kuasai: 'Kuasai' } as const;
const SCOPE_KEY = 'belajar-play-scope';

function newClientKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readScope(): string {
  try {
    return window.localStorage.getItem(SCOPE_KEY) || 'all';
  } catch {
    return 'all';
  }
}

export function GamesHub() {
  const { data, loading, error, reload } = useRpcQuery<GameHub>('play_hub');
  const [scope, setScope] = useState<string>(readScope);
  const [picked, setPicked] = useState<GameMode | null>(null);

  const scopeOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'Semua materi' }];
    for (const s of data?.subjects ?? []) opts.push({ value: `s:${s.id}`, label: `Mata pelajaran: ${s.name}` });
    for (const d of data?.documents ?? []) opts.push({ value: `d:${d.id}`, label: d.title });
    return opts;
  }, [data]);

  // A remembered scope may point at a deleted document: fall back to "all".
  const effectiveScope = scopeOptions.some((o) => o.value === scope) ? scope : 'all';

  const onScope = (value: string) => {
    setScope(value);
    try {
      window.localStorage.setItem(SCOPE_KEY, value);
    } catch {
      /* ignore */
    }
  };

  if (loading && !data) {
    return (
      <div className={styles.page} aria-busy="true" aria-label="Memuat game">
        <Skeleton height="140px" borderRadius="20px" />
        <div className={styles.modes}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height="170px" borderRadius="20px" />
          ))}
        </div>
      </div>
    );
  }
  if (error || !data) return <ErrorState message={error ?? 'Game tidak tersedia.'} onRetry={reload} />;

  const noDocs = data.documents.length === 0;
  const { profile } = data;
  const xpPct = profile.next > profile.level_start ? ((profile.xp - profile.level_start) / (profile.next - profile.level_start)) * 100 : null;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Game & Tantangan"
        title="Game Belajar"
        description="Latihan interaktif dari materimu sendiri. AI menulis tantangan; server bertindak sebagai wasit, jadi kunci jawaban dan skor tidak bisa diintip."
        actions={
          <>
            <Link to="/kartu" className={styles.chipLink}>
              <Icon name="cards" size={15} /> {data.cards.due} kartu
            </Link>
            <Link to="/game/peta" className={styles.chipLink}>
              <Icon name="compass" size={15} /> Peta konsep
            </Link>
          </>
        }
      />

      <SurfaceCard className={styles.hero}>
        <div className={styles.heroLevel}>
          <span className={styles.levelNum}>{profile.level}</span>
          <div>
            <div className={styles.levelLabel}>Level</div>
            <div className={styles.levelXp}>
              {profile.xp} XP
            </div>
          </div>
        </div>
        <div className={styles.heroBar}>
          <ProgressBar value={xpPct} label="Kemajuan menuju level berikutnya" />
          <span className={styles.heroNext}>{Math.max(0, profile.next - profile.xp)} XP lagi ke level {profile.level + 1}</span>
        </div>
        <div className={styles.heroStats}>
          <MetricTile label="Streak" icon="flame" value={data.streak.current} unit="hari" />
          <MetricTile label="Kartu jatuh tempo" icon="cards" value={data.cards.due} />
        </div>
      </SurfaceCard>

      {data.active && <ActiveRunCard run={data.active} onChanged={() => { dropCache(); reload(); }} />}

      {noDocs ? (
        <EmptyState
          icon="game"
          title="Belum ada materi siap"
          description="Game dibuat dari materimu. Unggah materi dan tunggu catatannya selesai diproses."
          actionLabel="Unggah materi"
          onAction={() => (window.location.hash = '#/materi')}
        />
      ) : (
        <>
          <section aria-labelledby="scope-h" className={styles.scopeRow}>
            <h2 id="scope-h" className={styles.sectionTitle}>
              Pilih mode
            </h2>
            <div className={styles.scopeSelect}>
              <Select label="Cakupan materi" value={effectiveScope} onChange={(e) => onScope(e.target.value)} options={scopeOptions} />
            </div>
          </section>

          <div className={styles.modes}>
            {data.modes.map((m) => (
              <button key={m.key} type="button" className={styles.modeCard} onClick={() => setPicked(m)} data-mode={m.key}>
                <span className={styles.modeIcon}>
                  <Icon name={MODE_ICON[m.key] ?? 'game'} size={22} />
                </span>
                <span className={styles.modeTitle}>{m.title}</span>
                <span className={styles.modeDesc}>{m.desc}</span>
                <span className={styles.modeFoot}>
                  <span className={styles.modeMeta}>
                    {m.turns.default} giliran{m.hints ? ' · ada petunjuk' : ' · tanpa petunjuk'}
                  </span>
                  <span className={styles.modeGo}>
                    Mulai <Icon name="arrow-right" size={14} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className={styles.twoCol}>
        <SurfaceCard className={styles.panel}>
          <h2 className={styles.panelTitle}>Misi harian</h2>
          {data.quests.length === 0 ? (
            <p className={styles.muted}>Belum ada misi hari ini.</p>
          ) : (
            <ul className={styles.quests}>
              {data.quests.map((q) => (
                <li key={q.key} className={q.done ? styles.questDone : ''}>
                  <Icon name={q.done ? 'check-circle' : 'target'} size={18} />
                  <span>{q.title}</span>
                  <span className={styles.xpTag}>{q.done ? 'Selesai' : `+${q.xp} XP`}</span>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        <SurfaceCard className={styles.panel}>
          <h2 className={styles.panelTitle}>Penguasaan konsep</h2>
          <dl className={styles.levelRow}>
            {(Object.keys(LEVEL_LABEL) as (keyof typeof LEVEL_LABEL)[]).map((k) => (
              <div key={k}>
                <dt>{LEVEL_LABEL[k]}</dt>
                <dd>{data.levels[k]}</dd>
              </div>
            ))}
          </dl>
          {data.weak.length > 0 ? (
            <>
              <h3 className={styles.subTitle}>Perlu diulang</h3>
              <ul className={styles.weakList}>
                {data.weak.map((w) => (
                  <li key={w.id}>
                    <span>{w.term}</span>
                    <span className={styles.muted}>{w.doc_title} · {Math.round(w.score)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className={styles.muted}>Belum ada konsep yang lemah. Mainkan game untuk mengisi penguasaan.</p>
          )}
        </SurfaceCard>
      </div>

      <SurfaceCard className={styles.soon}>
        <div className={styles.soonHead}>
          <Icon name="trophy" size={20} />
          <h2 className={styles.panelTitle}>Tantangan harian, turnamen, dan papan peringkat</h2>
          <StatusBadge status="neutral" label="Belum tersedia" />
        </div>
        <p className={styles.muted}>
          Tantangan harian, kompetisi asinkron antarteman, dan papan peringkat membutuhkan layanan sosial serta penilaian yang dijalankan
          server. Fitur ini belum ada di server saat ini, jadi tidak ditampilkan sebagai fitur aktif.
        </p>
      </SurfaceCard>

      <StartDialog mode={picked} scope={effectiveScope} onClose={() => setPicked(null)} />
    </div>
  );
}

function ActiveRunCard({ run, onChanged }: { run: NonNullable<GameHub['active']>; onChanged: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const abandon = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await rpcCall('play_abandon', { run_id: run.id });
      toast.success('Sesi ditinggalkan');
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal meninggalkan sesi.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SurfaceCard className={styles.activeRun}>
      <div className={styles.activeText}>
        <StatusBadge status="processing" label="Sesi berjalan" />
        <h2 className={styles.panelTitle}>{run.title}</h2>
        <p className={styles.muted}>
          {run.scope_title ? `${run.scope_title} · ` : ''}giliran {run.turn_count} dari {run.max_turns} · {run.correct}/{run.total} benar · {run.xp} XP
        </p>
      </div>
      <div className={styles.activeActions}>
        <Button icon="play" onClick={() => navigate(`/game/main/${run.id}`)}>
          Lanjutkan
        </Button>
        <Button variant="ghost" loading={busy} onClick={abandon}>
          Tinggalkan
        </Button>
      </div>
    </SurfaceCard>
  );
}

function StartDialog({ mode, scope, onClose }: { mode: GameMode | null; scope: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [turns, setTurns] = useState('');
  const [level, setLevel] = useState('sedang');
  const [theme, setTheme] = useState('fantasi');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ text: string; unavailable: boolean } | null>(null);
  // One key per dialog opening: a double-click or retry reuses it, so the server can de-duplicate.
  const clientKey = useRef(newClientKey());
  const modeKey = mode?.key;

  useEffect(() => {
    if (!mode) return;
    clientKey.current = newClientKey();
    setTurns(String(mode.turns.default));
    setFailure(null);
    // Reset only when a different mode is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeKey]);

  const start = async () => {
    if (!mode || busy) return;
    const n = Math.max(mode.turns.min, Math.min(mode.turns.max, Number(turns) || mode.turns.default));
    setBusy(true);
    setFailure(null);
    try {
      const res = await rpcCall<{ run: { id: number } }>(
        'play_turn',
        {
          op: 'start',
          game: mode.key,
          ...parseScope(scope),
          options: { jumlah_giliran: n, tingkat: level, ...(mode.key === 'petualangan' ? { tema: theme } : {}) },
          client_key: clientKey.current,
        },
        { timeoutMs: 180_000 },
      );
      dropCache();
      onClose();
      navigate(`/game/main/${res.run.id}`);
    } catch (err) {
      const text = errorMessage(err, 'Gagal memulai game.');
      setFailure({ text, unavailable: isUnavailableMessage(text) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={mode !== null}
      onClose={onClose}
      title={mode?.title ?? ''}
      description={mode ? MODE_TIPS[mode.key] ?? mode.desc : undefined}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button icon="play" loading={busy} onClick={start}>
            Mulai
          </Button>
        </>
      }
    >
      {mode && (
        <div className={styles.startForm}>
          <Input
            label={`Jumlah giliran (${mode.turns.min}–${mode.turns.max})`}
            type="number"
            min={mode.turns.min}
            max={mode.turns.max}
            inputMode="numeric"
            value={turns}
            onChange={(e) => setTurns(e.target.value)}
            data-autofocus
          />
          <Select
            label="Tingkat"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            options={[
              { value: 'mudah', label: 'Mudah' },
              { value: 'sedang', label: 'Sedang' },
              { value: 'sulit', label: 'Sulit' },
            ]}
          />
          {mode.key === 'petualangan' && (
            <Select
              label="Tema cerita"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              options={[
                { value: 'fantasi', label: 'Fantasi' },
                { value: 'detektif', label: 'Detektif' },
                { value: 'scifi', label: 'Sains fiksi' },
                { value: 'kantor', label: 'Kantor' },
              ]}
            />
          )}
          {!mode.hints && <p className={styles.muted}>Mode ini tanpa petunjuk dan tanpa umpan balik sampai selesai.</p>}
          {failure && (
            <div className={failure.unavailable ? styles.alertInfo : styles.alertError} role="alert">
              <Icon name={failure.unavailable ? 'info' : 'alert-circle'} size={18} />
              <div>
                <strong>{failure.unavailable ? 'Game belum bisa dimulai' : 'Gagal memulai game'}</strong>
                <p>{failure.text}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

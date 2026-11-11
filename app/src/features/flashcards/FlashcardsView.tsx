import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  MetricTile,
  PageHeader,
  ProgressBar,
  Select,
  Skeleton,
  SurfaceCard,
  useToast,
} from '../../components/ui';
import { errorMessage, useRpcQuery } from '../../hooks/useRpcQuery';
import { copyText, downloadTextFile } from '../../services/files';
import { dropCache, rpcCall } from '../../services/api/rpc';
import { GRADES, type CardCounts, type CardsDueResponse, type DueCard, type HubDocument } from './types';
import styles from './Flashcards.module.css';

export function FlashcardsView() {
  const due = useRpcQuery<CardsDueResponse>('cards_due', { limit: 30 });
  const hub = useRpcQuery<{ documents: HubDocument[] }>('play_hub');
  const [reviewing, setReviewing] = useState<DueCard[] | null>(null);
  const [lastReview, setLastReview] = useState<{ total: number; again: number } | null>(null);

  if (reviewing) {
    return (
      <ReviewSession
        cards={reviewing}
        onExit={(summary) => {
          setReviewing(null);
          setLastReview(summary);
          dropCache();
          due.reload();
        }}
      />
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Belajar"
        title="Kartu Belajar"
        description="Ulangan berjarak (SM-2): kartu yang kamu kuasai muncul makin jarang, yang sulit muncul lebih sering. Konsep yang lemah di game otomatis masuk ke sini."
      />

      {due.loading && !due.data && (
        <div aria-busy="true" aria-label="Memuat kartu" className={styles.statGrid}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height="86px" borderRadius="16px" />
          ))}
        </div>
      )}
      {due.error && !due.data && <ErrorState message={due.error} onRetry={due.reload} />}

      {due.data && (
        <>
          {lastReview && (
            <div className={styles.doneBanner} role="status">
              <Icon name="check-circle" size={20} />
              <span>
                Review selesai: {lastReview.total} kartu diulang
                {lastReview.again ? `, ${lastReview.again}× perlu diulang lagi` : ''}.
              </span>
            </div>
          )}

          <Counts counts={due.data.counts} />

          {due.data.cards.length > 0 ? (
            <SurfaceCard className={styles.startCard}>
              <div>
                <h2 className={styles.startTitle}>{due.data.counts.due} kartu menunggu diulang hari ini</h2>
                <p className={styles.startSub}>Sesi ini memuat hingga {due.data.cards.length} kartu. Satu kartu pada satu waktu.</p>
              </div>
              <Button size="lg" icon="play" onClick={() => { setLastReview(null); setReviewing(due.data!.cards); }}>
                Mulai review
              </Button>
            </SurfaceCard>
          ) : (
            <EmptyState
              icon="cards"
              title={due.data.counts.total ? 'Tidak ada kartu jatuh tempo' : 'Belum ada kartu'}
              description={
                due.data.counts.total
                  ? 'Semua kartu sudah diulang. Kembali lagi besok.'
                  : 'Bangun kartu dari istilah materi di bawah, atau mainkan game: konsep yang lemah otomatis dibuatkan kartu.'
              }
            />
          )}

          <ManageCards documents={hub.data?.documents ?? []} onChanged={() => { dropCache(); due.reload(); }} />
        </>
      )}
    </div>
  );
}

function Counts({ counts }: { counts: CardCounts }) {
  return (
    <div className={styles.statGrid}>
      <MetricTile label="Jatuh tempo" value={counts.due} icon="clock" tone={counts.due > 0 ? 'accent' : 'default'} />
      <MetricTile label="Baru" value={counts.new} icon="sparkles" />
      <MetricTile label="Dipelajari" value={counts.learning} icon="refresh" />
      <MetricTile label="Matang" value={counts.mature} icon="check-circle" tone="success" hint={`Total ${counts.total} kartu`} />
    </div>
  );
}

function ManageCards({ documents, onChanged }: { documents: HubDocument[]; onChanged: () => void }) {
  const toast = useToast();
  const [source, setSource] = useState('all');
  const [building, setBuilding] = useState(false);
  const [exporting, setExporting] = useState(false);

  const build = async () => {
    if (building) return;
    setBuilding(true);
    try {
      const res = await rpcCall<{ added: number; achievements?: { title: string }[] }>(
        'cards_build',
        source === 'all' ? {} : { document_id: Number(source) },
      );
      toast.success(res.added ? `${res.added} kartu baru dibuat` : 'Semua istilah sudah punya kartu');
      res.achievements?.forEach((a) => toast.info(a.title, 'Lencana baru'));
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal membangun kartu.'));
    } finally {
      setBuilding(false);
    }
  };

  const exportTsv = async (mode: 'file' | 'copy') => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await rpcCall<{ text: string; count: number }>('cards_export');
      if (!res.count) {
        toast.warning('Belum ada kartu untuk diekspor.');
        return;
      }
      if (mode === 'copy') {
        const ok = await copyText(res.text);
        ok ? toast.success('Disalin. Tempel ke Anki sebagai teks dipisah tab.') : toast.error('Tidak bisa menyalin ke papan klip.');
      } else if (downloadTextFile('kartu-belajar.tsv', res.text, 'text/tab-separated-values;charset=utf-8')) {
        toast.success('Diekspor. Impor ke Anki sebagai teks dipisah tab.');
      } else {
        toast.error('Perangkat ini tidak mengizinkan unduhan. Gunakan "Salin TSV".');
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengekspor kartu.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <SurfaceCard className={styles.manage}>
      <h2 className={styles.manageTitle}>Kelola kartu</h2>
      <div className={styles.manageRow}>
        <Select
          label="Bangun kartu dari istilah"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          options={[{ value: 'all', label: 'Semua materi' }, ...documents.map((d) => ({ value: String(d.id), label: d.title }))]}
        />
        <Button variant="outline" icon="plus" loading={building} onClick={build}>
          Bangun kartu
        </Button>
      </div>
      <div className={styles.manageRow}>
        <Button variant="ghost" icon="download" loading={exporting} onClick={() => void exportTsv('file')}>
          Ekspor ke Anki (TSV)
        </Button>
        <Button variant="ghost" icon="copy" disabled={exporting} onClick={() => void exportTsv('copy')}>
          Salin TSV
        </Button>
      </div>
    </SurfaceCard>
  );
}

function ReviewSession({ cards, onExit }: { cards: DueCard[]; onExit: (summary: { total: number; again: number }) => void }) {
  const toast = useToast();
  const [queue, setQueue] = useState<DueCard[]>(cards);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [again, setAgain] = useState(0);
  const [rating, setRating] = useState(false);
  const shownAt = useRef(Date.now());
  const total = cards.length;
  const current = queue[0];

  useEffect(() => {
    shownAt.current = Date.now();
  }, [current?.id, queue.length]);

  const rate = useCallback(
    async (grade: number) => {
      if (!current || !flipped || rating) return; // idempotent against double clicks / key repeat
      setRating(true);
      try {
        await rpcCall('cards_review', {
          id: current.id,
          grade,
          seconds: Math.round((Date.now() - shownAt.current) / 1000),
        });
        setQueue((q) => (grade === 1 ? [...q.slice(1), current] : q.slice(1)));
        if (grade === 1) setAgain((n) => n + 1);
        else setDone((n) => n + 1);
        setFlipped(false);
      } catch (err) {
        toast.error(errorMessage(err, 'Gagal menyimpan penilaian kartu.'));
      } finally {
        setRating(false);
      }
    },
    [current, flipped, rating, toast],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [role="dialog"]')) return;
      if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped && '1234'.includes(e.key) && e.key) {
        const g = GRADES['1234'.indexOf(e.key)];
        if (g) void rate(g.grade);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [flipped, rate]);

  if (!current) {
    return (
      <div className={styles.page}>
        <div className={styles.finish}>
          <span className={styles.finishIcon}>
            <Icon name="check" size={34} />
          </span>
          <h1 className={styles.finishTitle}>Review selesai</h1>
          <p className={styles.finishText}>
            {total} kartu diulang{again ? `, ${again}× perlu diulang lagi` : ''}.
          </p>
          <div className={styles.finishActions}>
            <Button onClick={() => onExit({ total, again })}>Kembali ke kartu</Button>
            <Link to="/game" className={styles.plainLink}>
              Ke game
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.review}>
      <div className={styles.reviewTop}>
        <Button size="sm" variant="ghost" icon="x" onClick={() => onExit({ total: done, again })}>
          Akhiri sesi
        </Button>
        <span className={styles.reviewCount} aria-live="polite">
          {done} / {total} selesai
        </span>
      </div>
      <ProgressBar value={(done / total) * 100} label="Kemajuan sesi review" />

      <div className={styles.stage}>
        {!flipped ? (
          <button type="button" className={styles.card} onClick={() => setFlipped(true)} aria-label="Balik kartu untuk melihat jawaban">
            <small className={styles.cardSource}>{current.doc_title}</small>
            <div className={styles.cardText}>{current.front}</div>
            <span className={styles.cardHint}>Ketuk atau tekan Spasi untuk melihat jawaban</span>
          </button>
        ) : (
          <div className={`${styles.card} ${styles.cardBack}`} role="group" aria-label="Jawaban kartu">
            <small className={styles.cardSource}>{current.front}</small>
            <div className={`${styles.cardText} ${styles.cardDef}`}>{current.back}</div>
          </div>
        )}
      </div>

      {flipped && (
        <div className={styles.rates} role="group" aria-label="Seberapa baik kamu mengingatnya?">
          {GRADES.map((g, i) => (
            <button
              key={g.grade}
              type="button"
              disabled={rating}
              className={`${styles.rate} ${styles[`rate_${g.tone}`]}`}
              onClick={() => void rate(g.grade)}
              title={g.hint}
            >
              <kbd>{i + 1}</kbd>
              {g.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

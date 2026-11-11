import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Icon, Skeleton, StatusBadge, SurfaceCard } from '../../components/ui';
import { fetchOpportunities, fetchTracked } from '../opportunities/api';
import type { Opportunity, TrackedOpportunity } from '../opportunities/types';
import { deadlineState, formatDeadline } from '../opportunities/utils';
import { useEnvironment } from '../../services/environment/EnvironmentContext';
import styles from './Bento.module.css';

const DISMISS_KEY = 'belajar-dismissed-spotlight';

function readDismissed(): number[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(DISMISS_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is number => typeof x === 'number') : [];
  } catch {
    return [];
  }
}

type Load<T> = { state: 'loading' } | { state: 'error' } | { state: 'ok'; data: T };

function useLoad<T>(fn: (signal: AbortSignal) => Promise<T>): Load<T> {
  const [res, setRes] = useState<Load<T>>({ state: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    fn(controller.signal)
      .then((data) => setRes({ state: 'ok', data }))
      .catch(() => {
        if (!controller.signal.aborted) setRes({ state: 'error' });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return res;
}

/**
 * The bento row under the daily hero. Every tile loads on its own, so a failing opportunities
 * service never takes the rest of the dashboard down, and nothing here is invented: a tile with
 * no real data says so and points to the place where the data would come from.
 */
export function DashboardBento({ lastDocId }: { lastDocId?: number }) {
  return (
    <section className={styles.bento} aria-label="Peluang dan pintasan">
      <SpotlightTile />
      <DeadlinesTile />
      <QuickActions lastDocId={lastDocId} />
      <GameTile />
    </section>
  );
}

function SpotlightTile() {
  const { info } = useEnvironment();
  const list = useLoad<Opportunity[]>((signal) => fetchOpportunities({ category: 'scholarship', limit: 40 }, signal));
  const [dismissed, setDismissed] = useState<number[]>(readDismissed);

  const pick = useMemo(() => {
    if (list.state !== 'ok') return null;
    return (
      list.data
        .filter((o) => deadlineState(o.deadline).kind !== 'closed' && !dismissed.includes(o.id))
        .sort((a, b) => a.deadline - b.deadline)[0] ?? null
    );
  }, [list, dismissed]);

  const dismiss = (id: number) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* the dismissal lasts for this session */
    }
  };

  return (
    <SurfaceCard className={`${styles.tile} ${styles.spotlight}`} aria-labelledby="spot-h">
      <div className={styles.tileHead}>
        <h2 id="spot-h" className={styles.tileTitle}>
          <Icon name="graduation" size={18} /> Beasiswa untukmu
        </h2>
        <Link to="/peluang" className={styles.more}>
          Lihat semua
        </Link>
      </div>

      {list.state === 'loading' && <Skeleton height="120px" borderRadius="12px" aria-label="Memuat beasiswa" />}
      {list.state === 'error' && <p className={styles.muted}>Daftar beasiswa belum bisa dimuat sekarang.</p>}
      {list.state === 'ok' && !pick && (
        <p className={styles.muted}>
          {list.data.length === 0
            ? 'Belum ada beasiswa yang dipublikasikan di server ini.'
            : 'Tidak ada beasiswa terbuka yang belum kamu sembunyikan.'}
        </p>
      )}
      {pick && (
        <div className={styles.spotBody}>
          <div className={styles.spotTop}>
            <StatusBadge status={deadlineState(pick.deadline).kind === 'soon' ? 'warning' : 'success'} label={deadlineState(pick.deadline).label} />
            <span className={styles.src}>Daftar server · bukan iklan</span>
          </div>
          <h3 className={styles.spotTitle}>{pick.title}</h3>
          <p className={styles.org}>{pick.organizer || 'Penyelenggara tidak dicantumkan'}</p>
          <dl className={styles.facts}>
            <div>
              <dt>Batas waktu</dt>
              <dd>{formatDeadline(pick.deadline)}</dd>
            </div>
            {pick.reward && (
              <div>
                <dt>Manfaat</dt>
                <dd>{pick.reward}</dd>
              </div>
            )}
            {pick.eligibility && (
              <div>
                <dt>Syarat ringkas</dt>
                <dd>{pick.eligibility}</dd>
              </div>
            )}
          </dl>
          <p className={styles.why}>
            Mengapa muncul: batas waktu terdekat di antara beasiswa yang masih dibuka{info ? ` (lingkungan belajarmu: ${info.short})` : ''}. Konfirmasi syarat di situs resmi sebelum mendaftar.
          </p>
          <div className={styles.spotActions}>
            <Link to="/peluang" className={styles.primaryLink}>
              Lihat detail
            </Link>
            <button type="button" className={styles.ghost} onClick={() => dismiss(pick.id)}>
              Sembunyikan
            </button>
          </div>
        </div>
      )}
    </SurfaceCard>
  );
}

function DeadlinesTile() {
  const tracked = useLoad<TrackedOpportunity[]>((signal) => fetchTracked(signal));
  const items = useMemo(() => {
    if (tracked.state !== 'ok') return [];
    return tracked.data
      .filter((t) => t.opportunity)
      .sort((a, b) => (a.opportunity!.deadline ?? 0) - (b.opportunity!.deadline ?? 0))
      .slice(0, 4);
  }, [tracked]);

  return (
    <SurfaceCard className={`${styles.tile} ${styles.deadlines}`} aria-labelledby="dl-h">
      <div className={styles.tileHead}>
        <h2 id="dl-h" className={styles.tileTitle}>
          <Icon name="calendar" size={18} /> Tenggat tersimpan
        </h2>
      </div>
      {tracked.state === 'loading' && <Skeleton height="96px" borderRadius="12px" aria-label="Memuat tenggat" />}
      {tracked.state === 'error' && <p className={styles.muted}>Tenggat tersimpan belum bisa dimuat (butuh sesi yang dikenali API).</p>}
      {tracked.state === 'ok' && items.length === 0 && (
        <p className={styles.muted}>
          Belum ada peluang tersimpan. Simpan beasiswa atau kompetisi di <Link to="/peluang">Beasiswa &amp; Peluang</Link> untuk memantau tenggatnya.
        </p>
      )}
      {items.length > 0 && (
        <ul className={styles.dlList}>
          {items.map((t) => {
            const dl = deadlineState(t.opportunity!.deadline);
            return (
              <li key={t.id}>
                <span className={styles.dlTitle}>{t.opportunity!.title}</span>
                <span className={`${styles.dlWhen} ${dl.kind === 'closed' ? styles.dlClosed : dl.kind === 'soon' ? styles.dlSoon : ''}`}>
                  {dl.kind === 'closed' ? 'Sudah ditutup' : dl.label === 'Dibuka' ? formatDeadline(t.opportunity!.deadline) : dl.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SurfaceCard>
  );
}

function QuickActions({ lastDocId }: { lastDocId?: number }) {
  const navigate = useNavigate();
  return (
    <SurfaceCard className={`${styles.tile} ${styles.quick}`} aria-labelledby="qa-h">
      <h2 id="qa-h" className={styles.tileTitle}>
        <Icon name="zap" size={18} /> Pintasan
      </h2>
      <div className={styles.qaGrid}>
        <Button variant="outline" icon="upload" onClick={() => navigate('/materi')}>
          Unggah materi
        </Button>
        <Button variant="outline" icon="cards" onClick={() => navigate('/kartu')}>
          Review kartu
        </Button>
        <Button variant="outline" icon="quiz" onClick={() => navigate('/kuis')}>
          Kerjakan kuis
        </Button>
        {lastDocId != null && (
          <Button variant="outline" icon="message" onClick={() => navigate(`/materi/${lastDocId}?tab=chat`)}>
            Tanya AI
          </Button>
        )}
        <Button variant="outline" icon="graduation" onClick={() => navigate('/peluang')}>
          Jelajahi beasiswa
        </Button>
      </div>
    </SurfaceCard>
  );
}

function GameTile() {
  return (
    <SurfaceCard className={`${styles.tile} ${styles.game}`} aria-labelledby="gm-h">
      <h2 id="gm-h" className={styles.tileTitle}>
        <Icon name="game" size={18} /> Game belajar
      </h2>
      <p className={styles.muted}>Latihan interaktif dari materimu sendiri. Pilih mode, jawab tantangan, dan lihat penguasaan konsepmu naik.</p>
      <Link to="/game" className={styles.primaryLink}>
        Buka game <Icon name="arrow-right" size={14} />
      </Link>
    </SurfaceCard>
  );
}

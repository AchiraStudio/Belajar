import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Icon, Skeleton, StatusBadge, SurfaceCard } from '../../components/ui';
import { fetchOpportunities, fetchTracked } from '../opportunities/api';
import type { Opportunity, TrackedOpportunity } from '../opportunities/types';
import { deadlineState, formatDeadline } from '../opportunities/utils';
import { useEnvironment } from '../../services/environment/EnvironmentContext';
import { useI18n } from '../../services/i18n';
import styles from './Dashboard.module.css';

const DISMISS_KEY = 'stuby-dismissed-spotlight';

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
 * Every tile loads on its own, so a failing opportunities service never takes the rest of the home
 * page down, and nothing here is invented: a tile with no real data says so and points to where the
 * data would come from.
 */
export function SpotlightTile() {
  const { info } = useEnvironment();
  const { t } = useI18n();
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
          <Icon name="graduation" size={18} /> {t('Beasiswa untukmu')}
        </h2>
        <Link to="/peluang" className={styles.more}>
          {t('Lihat semua')}
        </Link>
      </div>

      {list.state === 'loading' && <Skeleton height="140px" borderRadius="16px" aria-label={t('Memuat beasiswa')} />}
      {list.state === 'error' && <p className={styles.muted}>{t('Daftar beasiswa belum bisa dimuat sekarang.')}</p>}
      {list.state === 'ok' && !pick && (
        <p className={styles.muted}>
          {list.data.length === 0
            ? t('Belum ada beasiswa yang dipublikasikan di server ini.')
            : t('Tidak ada beasiswa terbuka yang belum kamu sembunyikan.')}
        </p>
      )}
      {pick && (
        <div className={styles.spotBody}>
          <div className={styles.spotTop}>
            <StatusBadge
              status={deadlineState(pick.deadline).kind === 'soon' ? 'warning' : 'success'}
              label={deadlineState(pick.deadline).label}
            />
            <span className={styles.src}>{t('Daftar server, bukan iklan')}</span>
          </div>
          <h3 className={styles.spotTitle}>{pick.title}</h3>
          <p className={styles.org}>{pick.organizer || t('Penyelenggara tidak dicantumkan')}</p>
          <dl className={styles.facts}>
            <div>
              <dt>{t('Batas waktu')}</dt>
              <dd>{formatDeadline(pick.deadline)}</dd>
            </div>
            {pick.reward && (
              <div>
                <dt>{t('Manfaat')}</dt>
                <dd>{pick.reward}</dd>
              </div>
            )}
            {pick.eligibility && (
              <div>
                <dt>{t('Syarat ringkas')}</dt>
                <dd>{pick.eligibility}</dd>
              </div>
            )}
          </dl>
          <p className={styles.why}>
            {t('Mengapa muncul: batas waktu terdekat di antara beasiswa yang masih dibuka')}
            {info ? ` (${t('lingkungan belajarmu: {env}', { env: info.short })})` : ''}. {t('Konfirmasi syarat di situs resmi sebelum mendaftar.')}
          </p>
          <div className={styles.spotActions}>
            <Link to="/peluang" className={styles.primaryLink}>
              {t('Lihat detail')}
            </Link>
            <button type="button" className={styles.ghost} onClick={() => dismiss(pick.id)}>
              {t('Sembunyikan')}
            </button>
          </div>
        </div>
      )}
    </SurfaceCard>
  );
}

export function DeadlinesTile() {
  const { t } = useI18n();
  const tracked = useLoad<TrackedOpportunity[]>((signal) => fetchTracked(signal));
  const items = useMemo(() => {
    if (tracked.state !== 'ok') return [];
    return tracked.data
      .filter((t) => t.opportunity)
      .sort((a, b) => (a.opportunity!.deadline ?? 0) - (b.opportunity!.deadline ?? 0))
      .slice(0, 4);
  }, [tracked]);

  return (
    <SurfaceCard className={styles.tile} aria-labelledby="dl-h">
      <div className={styles.tileHead}>
        <h2 id="dl-h" className={styles.tileTitle}>
          <Icon name="calendar" size={18} /> {t('Tenggat tersimpan')}
        </h2>
      </div>
      {tracked.state === 'loading' && <Skeleton height="96px" borderRadius="14px" aria-label={t('Memuat tenggat')} />}
      {tracked.state === 'error' && (
        <p className={styles.muted}>{t('Tenggat tersimpan belum bisa dimuat (butuh sesi yang dikenali API).')}</p>
      )}
      {tracked.state === 'ok' && items.length === 0 && (
        <p className={styles.muted}>
          {t('Belum ada peluang tersimpan. Simpan beasiswa atau kompetisi di')} <Link to="/peluang">{t('Beasiswa & Peluang')}</Link>{' '}
          {t('untuk memantau tenggatnya.')}
        </p>
      )}
      {items.length > 0 && (
        <ul className={styles.dlList}>
          {items.map((item) => {
            const dl = deadlineState(item.opportunity!.deadline);
            return (
              <li key={item.id}>
                <span className={styles.dlTitle}>{item.opportunity!.title}</span>
                <span className={`${styles.dlWhen} ${dl.kind === 'closed' ? styles.dlClosed : dl.kind === 'soon' ? styles.dlSoon : ''}`}>
                  {dl.kind === 'closed' ? t('Sudah ditutup') : dl.label === t('Dibuka') ? formatDeadline(item.opportunity!.deadline) : dl.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SurfaceCard>
  );
}

export function QuickActions({ lastDocId }: { lastDocId?: number }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <nav className={styles.quick} aria-label={t('Pintasan')}>
      <Button variant="secondary" size="sm" icon="upload" onClick={() => navigate('/materi')}>
        {t('Unggah materi')}
      </Button>
      <Button variant="secondary" size="sm" icon="cards" onClick={() => navigate('/kartu')}>
        {t('Review kartu')}
      </Button>
      <Button variant="secondary" size="sm" icon="quiz" onClick={() => navigate('/kuis')}>
        {t('Kerjakan kuis')}
      </Button>
      {lastDocId != null && (
        <Button variant="secondary" size="sm" icon="message" onClick={() => navigate(`/materi/${lastDocId}?tab=chat`)}>
          {t('Tanya AI')}
        </Button>
      )}
      <Button variant="secondary" size="sm" icon="graduation" onClick={() => navigate('/peluang')}>
        {t('Jelajahi beasiswa')}
      </Button>
    </nav>
  );
}

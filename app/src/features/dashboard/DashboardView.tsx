import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ErrorState, Icon, Skeleton } from '../../components/ui';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { BannerCarousel, BannerSlotView, useBanners } from '../banners';
import { MobileHome } from './MobileHome';
import { rpcCall } from '../../services/api/rpc';
import { useI18n } from '../../services/i18n';
import { useEnvironment } from '../../services/environment/EnvironmentContext';
import { buildDashboardModel } from './normalize';
import { DeadlinesTile, QuickActions, SpotlightTile } from './OpportunityTiles';
import { AttemptsTile, ContinueTile, GoalTile, HeatmapTile, StatTile, WeakTile, WeekTile } from './tiles';
import type { DashboardResponse } from './types';
import { fmtDur, greeting } from './utils';
import styles from './Dashboard.module.css';

/**
 * Home. Layout follows the reference: four pastel stat tiles, a banner row (advertisement slots),
 * then a bento of unequal white tiles. Every figure is read from the server's `dashboard` answer; where a value is missing the tile says so.
 */
export function DashboardView() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { t } = useI18n();
  const { info: environmentInfo } = useEnvironment();
  const heroBanners = useBanners('hero');
  const sideBanners = useBanners('side');
  const stripBanners = useBanners('strip');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await rpcCall<DashboardResponse>('dashboard');
      setData(res);
    } catch (err: any) {
      setError(err?.message || t('Gagal memuat ringkasan belajar'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const model = useMemo(() => (data ? buildDashboardModel(data) : null), [data]);
  const phone = useMediaQuery('(max-width: 768px)');

  if (loading) {
    return (
      <div className={styles.dashboard} aria-busy="true" aria-label={t('Memuat beranda')}>
        <header className={styles.header}>
          <div>
            <Skeleton width="260px" height="40px" />
            <Skeleton width="380px" height="20px" />
          </div>
        </header>
        <div className={styles.stats}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height="116px" borderRadius="20px" />
          ))}
        </div>
        <div className={styles.promoRow}>
          <Skeleton height="230px" borderRadius="16px" className={styles.heroCell} />
          <Skeleton height="230px" borderRadius="16px" className={styles.sideCell} />
        </div>
        <div className={styles.grid}>
          <Skeleton height="280px" borderRadius="20px" className={styles.cont} />
          <Skeleton height="280px" borderRadius="20px" className={styles.goal} />
          <Skeleton height="260px" borderRadius="20px" className={styles.att} />
          <Skeleton height="260px" borderRadius="20px" className={styles.spot} />
        </div>
      </div>
    );
  }

  if (error || !data || !model) {
    return (
      <div className={styles.dashboard} aria-label={t('Error beranda')}>
        <ErrorState
          title={t('Gagal Memuat Beranda')}
          message={error || t('Terjadi kesalahan saat memuat data dasbor.')}
          onRetry={loadDashboard}
        />
      </div>
    );
  }

  if (phone) return <MobileHome data={data} model={model} />;

  const recentDocs = data.recent_docs ?? [];
  const lastDoc = recentDocs[0];

  const streakHint = model.todayDone
    ? t('Target hari ini tercapai')
    : model.atRisk
      ? t('Belajar hari ini agar streak tidak putus')
      : model.streakCount > 0
        ? t('Belajar hari ini untuk melanjutkan')
        : t('Mulai streakmu hari ini');

  const todayHint =
    model.goalSeconds != null ? t('Target harian {goal}', { goal: fmtDur(model.goalSeconds) }) : t('Target harian belum tersedia');

  return (
    <div className={styles.dashboard} aria-label={t('Beranda')}>
      <header className={styles.header}>
        <div className={styles.headText}>
          <h1 className={styles.title}>{greeting()}.</h1>
          <p className={styles.subtitle}>{t('Ini ringkasan belajarmu. Lanjutkan dari tempat kamu berhenti.')}</p>
          <p className={styles.envLine}>
            {environmentInfo ? (
              <>
                <Icon name="graduation" size={14} /> {t('Lingkungan belajar')}: <strong>{environmentInfo.label}</strong> ·{' '}
                <Link to="/profil">{t('Ubah')}</Link>
              </>
            ) : (
              <>
                <Icon name="info" size={14} /> {t('Belum memilih lingkungan belajar.')} <Link to="/profil">{t('Pilih jenjangmu')}</Link>{' '}
                {t('agar Stuby tahu konteksmu.')}
              </>
            )}
          </p>
        </div>
        <QuickActions lastDocId={lastDoc?.id} />
      </header>

      <section className={styles.stats} aria-label={t('Ringkasan belajar')}>
        <StatTile tone="apricot" icon="flame" label={t('Streak belajar')} value={<>{t('{n} hari', { n: model.streakCount })}</>} hint={streakHint} />
        <StatTile
          tone="accent"
          icon="timer"
          label={t('Belajar hari ini')}
          value={model.todaySeconds != null ? fmtDur(model.todaySeconds) : '–'}
          hint={todayHint}
        />
        <StatTile
          tone="ice"
          icon="quiz"
          label={t('Kuis selesai')}
          value={model.attempts}
          chip={model.accuracy != null ? { text: `${Math.round(model.accuracy)}%`, label: t('Akurasi rata-rata') } : undefined}
          hint={model.accuracy != null ? t('Akurasi rata-rata semua kuis') : t('Belum ada nilai')}
        />
        <StatTile
          tone="plain"
          icon="folder"
          label={t('Materi')}
          value={model.documents}
          hint={model.studySeconds > 0 ? t('Total belajar {time}', { time: fmtDur(model.studySeconds) }) : t('Belum ada waktu belajar')}
        />
      </section>

      {(heroBanners.length > 0 || sideBanners.length > 0) && (
        <section className={styles.promoRow} aria-label={t('Banner dan promo')}>
          {heroBanners.length > 0 && (
            <div className={styles.heroCell}>
              <BannerCarousel banners={heroBanners} />
            </div>
          )}
          {sideBanners.length > 0 && (
            <div className={styles.sideCell}>
              <BannerSlotView banners={sideBanners} />
            </div>
          )}
        </section>
      )}

      <section className={styles.grid} aria-label={t('Aktivitas belajar')}>
        <div className={styles.cont}>
          <ContinueTile docs={recentDocs} onUpload={() => navigate('/materi')} />
        </div>
        <div className={styles.goal}>
          <GoalTile model={model} />
        </div>
        <div className={styles.att}>
          <AttemptsTile attempts={data.recent_attempts ?? []} />
        </div>
        <div className={styles.spot}>
          <SpotlightTile />
        </div>
        {stripBanners.length > 0 && (
          <div className={styles.stripCell}>
            <BannerSlotView banners={stripBanners} />
          </div>
        )}
        <div className={styles.week}>
          <WeekTile model={model} />
        </div>
        <div className={styles.weak}>
          <WeakTile topics={data.weak_topics ?? []} weakCount={data.weak_count ?? 0} />
        </div>
        <div className={styles.heat}>
          <HeatmapTile heatmap={data.heatmap ?? []} streakCount={model.streakCount} />
        </div>
        <div className={styles.dl}>
          <DeadlinesTile />
        </div>
      </section>
    </div>
  );
}

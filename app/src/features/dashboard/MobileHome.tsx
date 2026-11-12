import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Icon } from '../../components/ui';
import { BannerCarousel, BannerSlotView, useBanners } from '../banners';
import { useEnvironment } from '../../services/environment/EnvironmentContext';
import { useI18n } from '../../services/i18n';
import { ratio, type DashboardModel } from './normalize';
import { DeadlinesTile, SpotlightTile } from './OpportunityTiles';
import { HeatmapTile } from './tiles';
import type { DashboardResponse } from './types';
import { fileKind, fmtDur, greeting, relDay } from './utils';
import styles from './MobileHome.module.css';

const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;

/**
 * The phone's home. It is its own composition, not the desktop grid squeezed narrow: one focal "today"
 * card, then sections that deliberately differ in shape (a sideways scroller, an inline stat strip, a
 * small column chart, chips), so the page has rhythm instead of a stack of equal tiles. There is no top
 * bar on a phone, so the greeting is the page's first line.
 */
export function MobileHome({ data, model }: { data: DashboardResponse; model: DashboardModel }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { info: environment } = useEnvironment();
  const hero = useBanners('hero');
  const side = useBanners('side');
  const strip = useBanners('strip');

  const docs = data.recent_docs ?? [];
  const first = docs[0];
  const weak = (data.weak_topics ?? []).slice(0, 5);
  const progress = ratio(model.todaySeconds, model.goalSeconds);

  // The ring fills in once on arrival: that is the one moment it tells you where you are.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const known = model.todaySeconds != null && model.goalSeconds != null;
  const remaining = known ? Math.max(0, model.goalSeconds! - model.todaySeconds!) : null;
  const longest = Math.max(...model.days.map((d) => d.seconds), model.goalSeconds ?? 0, 1);

  return (
    <div className={styles.page} aria-label={t('Beranda')}>
      <header className={styles.head}>
        <h1 className={styles.hello}>{greeting()}.</h1>
        <div className={styles.headRow}>
          <span className={styles.streak} title={t('Streak belajar')}>
            <Icon name="flame" size={16} aria-hidden="true" />
            <span className="sr-only">{t('Streak belajar')}: </span>
            {t('{n} hari', { n: model.streakCount })}
          </span>
          <Link to="/profil" className={styles.env}>
            {environment ? environment.label : t('Pilih jenjangmu')}
          </Link>
        </div>
      </header>

      {/* The focal point: where you are today, and the one thing to do next. */}
      <section className={styles.today} aria-label={t('Target hari ini')}>
        <div className={styles.ring}>
          <svg viewBox="0 0 100 100" role="img" aria-label={known ? t('Belajar {time} dari target {goal} hari ini', { time: fmtDur(model.todaySeconds!), goal: fmtDur(model.goalSeconds!) }) : t('Waktu belajar hari ini belum tersedia')}>
            <circle className={styles.ringTrack} cx="50" cy="50" r={RING_R} />
            <circle
              className={styles.ringFill}
              cx="50"
              cy="50"
              r={RING_R}
              strokeDasharray={RING_C}
              strokeDashoffset={drawn ? RING_C * (1 - progress) : RING_C}
              transform="rotate(-90 50 50)"
            />
          </svg>
          <strong>{model.todaySeconds != null ? fmtDur(model.todaySeconds) : '–'}</strong>
        </div>
        <div className={styles.todayText}>
          <span className={styles.todayLabel}>{t('Target hari ini')}</span>
          <strong className={styles.todayState}>
            {model.todayDone
              ? t('Target hari ini tercapai')
              : remaining != null
                ? t('Sisa {time}', { time: fmtDur(remaining) })
                : t('Target harian belum tersedia')}
          </strong>
        </div>
        {first ? (
          <button type="button" className={styles.todayCta} onClick={() => navigate(`/materi/${first.id}`)}>
            <Icon name="book" size={18} aria-hidden="true" />
            <span>{t('Lanjutkan')}: {first.title}</span>
          </button>
        ) : (
          <button type="button" className={styles.todayCta} onClick={() => navigate('/materi')}>
            <Icon name="upload" size={18} aria-hidden="true" />
            <span>{t('Unggah Materi Pertama')}</span>
          </button>
        )}
      </section>

      {/* Sideways scroller: recent materials, the newest one wider and outlined. */}
      <section aria-labelledby="m-docs">
        <div className={styles.secHead}>
          <h2 id="m-docs" className={styles.h2}>{t('Lanjutkan belajar')}</h2>
          <Link to="/materi" className={styles.more}>{t('Semua materi')}</Link>
        </div>
        {docs.length === 0 ? (
          <p className={styles.empty}>{t('Unggah materimu dan ia muncul di sini.')}</p>
        ) : (
          <ul className={styles.scroller}>
            {docs.slice(0, 6).map((doc, i) => (
              <li key={doc.id} className={`${styles.doc} ${i === 0 ? styles.docFirst : ''}`}>
                <Link to={`/materi/${doc.id}`} className={styles.docLink}>
                  <span className={styles.kind} aria-hidden="true">{fileKind(doc.filename)}</span>
                  <span className={styles.docTitle}>{doc.title}</span>
                  <span className={styles.docMeta}>
                    {doc.subject_name && <span>{doc.subject_name}</span>}
                    <span>{relDay(doc.updated_at || doc.created_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* One inline strip instead of four tiles. */}
      <dl className={styles.strip} aria-label={t('Ringkasan belajar')}>
        <div>
          <dt>{t('Kuis selesai')}</dt>
          <dd>{model.attempts}</dd>
        </div>
        <div>
          <dt>{t('Akurasi rata-rata')}</dt>
          <dd>{model.accuracy != null ? `${Math.round(model.accuracy)}%` : '–'}</dd>
        </div>
        <div>
          <dt>{t('Materi')}</dt>
          <dd>{model.documents}</dd>
        </div>
      </dl>

      {hero.length > 0 && <BannerCarousel banners={hero} />}

      <section className={styles.week} aria-labelledby="m-week">
        <div className={styles.secHead}>
          <h2 id="m-week" className={styles.h2}>{t('Tujuh hari terakhir')}</h2>
          {model.goalSeconds != null && <span className={styles.note}>{t('Target harian {goal}', { goal: fmtDur(model.goalSeconds) })}</span>}
        </div>
        {model.days.length === 0 ? (
          <p className={styles.empty}>{t('Belum ada catatan waktu belajar. Buka sebuah materi dan waktunya mulai tercatat.')}</p>
        ) : (
          <ol className={styles.bars}>
            {model.days.map((d) => (
              <li key={d.key} className={d.isToday ? styles.barToday : ''}>
                <span className={styles.barVal}>{d.seconds > 0 ? fmtDur(d.seconds) : ''}</span>
                <span className={styles.barTrack} aria-hidden="true">
                  <i style={{ height: `${Math.max(d.seconds > 0 ? 8 : 0, ratio(d.seconds, longest) * 100)}%` }} />
                </span>
                <span className={styles.barDay}>
                  {d.label}
                  {d.isToday && <span className="sr-only"> ({t('hari ini')})</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {weak.length > 0 && (
        <section aria-labelledby="m-weak">
          <div className={styles.secHead}>
            <h2 id="m-weak" className={styles.h2}>{t('Topik lemah')}</h2>
          </div>
          <ul className={styles.chips}>
            {weak.map((w, i) => {
              const acc = Math.round(w.accuracy ?? w.acc ?? 0);
              return (
                <li key={`${w.topic}-${i}`} className={styles.chip}>
                  <span>{w.topic}</span>
                  <b>{acc}%</b>
                </li>
              );
            })}
          </ul>
          {(data.weak_count ?? 0) > 0 && (
            <Button variant="secondary" size="sm" icon="refresh" onClick={() => navigate('/soal-lemah')}>
              {t('Ulangi {n} soal lemah', { n: data.weak_count ?? 0 })}
            </Button>
          )}
        </section>
      )}

      {side.length > 0 && <BannerSlotView banners={side} />}
      <SpotlightTile />
      {strip.length > 0 && <BannerSlotView banners={strip} />}
      <DeadlinesTile />
      <HeatmapTile heatmap={data.heatmap ?? []} streakCount={model.streakCount} />
    </div>
  );
}

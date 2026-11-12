import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '../../components/ui';
import { useI18n } from '../../services/i18n';
import type { Banner } from './banners';
import styles from './Banner.module.css';

/** The decorative picture: stacked books, a star and sparkles. Pure SVG, tinted by the theme. */
function Art() {
  return (
    <svg className={styles.art} viewBox="0 0 220 160" aria-hidden="true" focusable="false">
      <circle cx="150" cy="84" r="62" className={styles.artDisc} />
      <g>
        <rect x="96" y="104" width="104" height="20" rx="5" className={styles.artBookA} />
        <rect x="108" y="82" width="84" height="20" rx="5" className={styles.artBookB} />
        <rect x="100" y="60" width="92" height="20" rx="5" className={styles.artBookC} />
        <rect x="104" y="108" width="40" height="3" rx="1.5" className={styles.artLine} />
        <rect x="116" y="86" width="30" height="3" rx="1.5" className={styles.artLine} />
        <rect x="108" y="64" width="34" height="3" rx="1.5" className={styles.artLine} />
      </g>
      <path
        className={styles.artStar}
        d="M150 14l6.2 12.6 13.9 2-10 9.8 2.4 13.8L150 45.6l-12.4 6.6 2.4-13.8-10-9.8 13.9-2z"
      />
      <circle cx="58" cy="46" r="5" className={styles.artDot} />
      <circle cx="40" cy="104" r="3.5" className={styles.artDot} />
      <circle cx="206" cy="34" r="3" className={styles.artDot} />
    </svg>
  );
}

function Label({ banner }: { banner: Banner }) {
  const { t } = useI18n();
  return (
    <span className={styles.tag}>
      {banner.kind === 'ad' ? t('Iklan') : t('Promo')}
      {banner.sponsor && <span className="sr-only"> {t('dari {name}', { name: t(banner.sponsor) })}</span>}
    </span>
  );
}

function Cta({ banner, className }: { banner: Banner; className?: string }) {
  const { t } = useI18n();
  const inner = (
    <>
      {t(banner.cta)}
      <Icon name={banner.href ? 'external-link' : 'arrow-right'} size={16} />
    </>
  );
  if (banner.href) {
    return (
      <a className={className} href={banner.href} target="_blank" rel="sponsored noopener noreferrer">
        {inner}
      </a>
    );
  }
  return (
    <Link className={className} to={banner.to ?? '/'}>
      {inner}
    </Link>
  );
}

/** One banner, any slot. The slot decides the size (CSS); the content is the same everywhere. */
export function BannerCard({ banner, className = '' }: { banner: Banner; className?: string }) {
  const { t } = useI18n();
  const style = banner.image ? ({ '--banner-image': `url("${banner.image}")` } as React.CSSProperties) : undefined;
  return (
    <article
      className={`${styles.banner} ${styles[`theme_${banner.theme}`]} ${styles[`slot_${banner.slot}`]} ${
        banner.image ? styles.hasImage : ''
      } ${className}`}
      style={style}
      aria-label={`${banner.kind === 'ad' ? t('Iklan') : t('Promo')}: ${t(banner.title)}`}
    >
      <Label banner={banner} />
      <div className={styles.copy}>
        <h3 className={styles.title}>{t(banner.title)}</h3>
        {banner.body && <p className={styles.body}>{t(banner.body)}</p>}
        <Cta banner={banner} className={styles.cta} />
      </div>
      <Art />
    </article>
  );
}

const AUTO_MS = 6500;

/**
 * Wide rotating banner. Built on native horizontal scroll-snap, so it swipes on touch for free, and
 * every slide is reachable with the arrow buttons, the dots and the keyboard (no gesture-only action).
 *
 * Auto-advance follows the accessibility rules for moving content: it has a visible pause button, it
 * stops while the pointer or focus is inside, and it does not start at all when the system asks for
 * reduced motion (the person can still press play).
 */
export function BannerCarousel({ banners, label }: { banners: Banner[]; label?: string }) {
  const { t } = useI18n();
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const [held, setHeld] = useState(false);
  const count = banners.length;

  const goTo = useCallback(
    (i: number) => {
      const el = trackRef.current;
      if (!el || count === 0) return;
      const next = (i + count) % count;
      setIndex(next);
      const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo?.({ left: next * el.clientWidth, behavior: calm ? 'auto' : 'smooth' });
    },
    [count],
  );

  // Keep the dot in step with a swipe.
  const onScroll = () => {
    const el = trackRef.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((prev) => (prev === i ? prev : Math.min(Math.max(i, 0), count - 1)));
  };

  useEffect(() => {
    if (!playing || held || count < 2) return;
    const id = window.setTimeout(() => goTo(index + 1), AUTO_MS);
    return () => window.clearTimeout(id);
  }, [playing, held, index, count, goTo]);

  if (count === 0) return null;

  return (
    <section
      className={styles.carousel}
      aria-roledescription="carousel"
      aria-label={label ?? t('Banner pilihan')}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') goTo(index + 1);
        if (e.key === 'ArrowLeft') goTo(index - 1);
      }}
    >
      <div ref={trackRef} className={styles.track} onScroll={onScroll} aria-live={playing && !held ? 'off' : 'polite'}>
        {banners.map((b, i) => (
          <div
            key={b.id}
            className={styles.slide}
            role="group"
            aria-roledescription="slide"
            aria-label={t('{n} dari {total}', { n: i + 1, total: count })}
            aria-hidden={i === index ? undefined : true}
            // Off-screen slides stay out of the tab order so Tab does not scroll the track sideways.
            ref={(node) => {
              if (!node) return;
              if (i === index) node.removeAttribute('inert');
              else node.setAttribute('inert', '');
            }}
          >
            <BannerCard banner={b} className={styles.fill} />
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.ctl}
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? t('Jeda pergantian banner') : t('Putar pergantian banner')}
          >
            <Icon name={playing ? 'pause' : 'play'} size={14} />
          </button>
          <button type="button" className={styles.ctl} onClick={() => goTo(index - 1)} aria-label={t('Banner sebelumnya')}>
            <Icon name="chevron-left" size={16} />
          </button>
          <ul className={styles.dots}>
            {banners.map((b, i) => (
              <li key={b.id}>
                <button
                  type="button"
                  className={`${styles.dot} ${i === index ? styles.dotOn : ''}`}
                  onClick={() => goTo(i)}
                  aria-label={t('Banner {n}', { n: i + 1 })}
                  aria-current={i === index ? 'true' : undefined}
                />
              </li>
            ))}
          </ul>
          <button type="button" className={styles.ctl} onClick={() => goTo(index + 1)} aria-label={t('Banner berikutnya')}>
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      )}
    </section>
  );
}

/** Renders nothing when the slot has no banner, so an empty config leaves no hole in the page. */
export function BannerSlotView({ banners, className = '' }: { banners: Banner[]; className?: string }) {
  const first = banners[0];
  if (!first) return null;
  return <BannerCard banner={first} className={className} />;
}

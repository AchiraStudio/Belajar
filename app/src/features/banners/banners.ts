/**
 * Banner and advertisement slots.
 *
 * Three slots exist; each is sized by CSS, so one config entry works wherever its `slot` says:
 *
 *   hero     wide carousel at the top of Beranda          design for 1200 x 400 px (3:1)
 *   side     card next to the hero                        design for 560 x 400 px
 *   strip    slim leaderboard between dashboard sections  design for 1200 x 140 px
 *
 * To add a banner, append an entry below. To use artwork, put the file in `app/public/banners/` and
 * set `image: '/banners/<file>'`; the app's CSP only allows images from the app itself or `data:`,
 * so a remote image URL will NOT load. Text, colours and the decorative art stay on top of the image
 * (a scrim keeps the text readable), so every banner stays accessible without it.
 *
 * `kind` is shown to the person as a label: house promotions say "Promo", paid placements say
 * "Iklan". Never ship a paid placement as "promo".
 *
 * Later this list can come from the server (a `banners` answer) instead of this file; only
 * `useBanners` below would change.
 */

export type BannerSlot = 'hero' | 'side' | 'strip';
export type BannerTheme = 'ink' | 'bamboo' | 'deep' | 'sun';

export interface Banner {
  id: string;
  slot: BannerSlot;
  /** `promo` = Stuby's own; `ad` = a paid placement. Drives the visible label. */
  kind: 'promo' | 'ad';
  theme: BannerTheme;
  title: string;
  body?: string;
  cta: string;
  /** In-app route (`/kuis`). Opens in the same window. */
  to?: string;
  /** External address. Opens outside the app with `rel="sponsored noopener noreferrer"`. */
  href?: string;
  /** Optional artwork from `app/public/banners/`, e.g. `/banners/beasiswa.webp`. */
  image?: string;
  /** Who is behind it, announced to screen readers ("Iklan dari ..."). */
  sponsor?: string;
}

export const BANNERS: Banner[] = [
  {
    id: 'hero-kartu',
    slot: 'hero',
    kind: 'promo',
    theme: 'ink',
    title: 'Ingat lebih lama dengan Kartu Belajar',
    body: 'Ulangi tepat waktu dengan jadwal SM-2, lalu ekspor ke Anki kapan saja.',
    cta: 'Mulai berlatih',
    to: '/kartu',
  },
  {
    id: 'hero-beasiswa',
    slot: 'hero',
    kind: 'promo',
    theme: 'bamboo',
    title: 'Cari beasiswa yang cocok untukmu',
    body: 'Simpan tenggat, lihat syaratnya, dan jangan sampai terlewat.',
    cta: 'Jelajahi peluang',
    to: '/peluang',
  },
  {
    id: 'hero-iklan',
    slot: 'hero',
    kind: 'ad',
    theme: 'deep',
    title: 'Ruang banner iklan',
    body: 'Contoh penempatan 1200 × 400 px. Ganti isinya di features/banners/banners.ts.',
    cta: 'Lihat cara memasang',
    to: '/bantuan',
    sponsor: 'contoh penempatan',
  },
  {
    id: 'side-kuis',
    slot: 'side',
    kind: 'promo',
    theme: 'sun',
    title: 'Uji pemahamanmu hari ini',
    body: 'Satu kuis singkat menjaga streak tetap menyala.',
    cta: 'Kerjakan kuis',
    to: '/kuis',
  },
  {
    id: 'strip-iklan',
    slot: 'strip',
    kind: 'ad',
    theme: 'bamboo',
    title: 'Ruang iklan lebar · 1200 × 140 px',
    body: 'Cocok untuk penawaran kursus, buku, atau acara kampus.',
    cta: 'Pasang di sini',
    to: '/bantuan',
    sponsor: 'contoh penempatan',
  },
];

export function bannersFor(slot: BannerSlot): Banner[] {
  return BANNERS.filter((b) => b.slot === slot);
}

/** The single entry point screens use, so the source (file now, server later) can change in one place. */
export function useBanners(slot: BannerSlot): Banner[] {
  return bannersFor(slot);
}

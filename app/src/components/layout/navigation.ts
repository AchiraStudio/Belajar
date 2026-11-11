import type { IconName } from '../ui/Icon';

export interface NavEntry {
  path: string;
  label: string;
  icon: IconName;
  /** The destination exists, but has no working service behind it yet (it says so on arrival). */
  soon?: boolean;
  /** Extra words the command menu matches on. */
  keywords?: string;
  /** Longer page title for the top bar (defaults to `label`). */
  title?: string;
}

export interface NavGroup {
  /** `null` renders the group without a heading (the home entry). */
  label: string | null;
  items: NavEntry[];
}

/** Primary navigation: the five product pillars, grouped (design.md §6 and §18). */
export const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ path: '/', label: 'Beranda', icon: 'home', keywords: 'overview ringkasan' }] },
  {
    label: 'Belajar',
    items: [
      { path: '/materi', label: 'Materi', title: 'Perpustakaan Materi', icon: 'folder', keywords: 'unggah catatan perpustakaan' },
      { path: '/kuis', label: 'Kuis', icon: 'quiz', keywords: 'ujian latihan soal' },
      { path: '/soal-lemah', label: 'Soal Lemah', icon: 'target', keywords: 'ulangi salah review' },
      { path: '/kartu', label: 'Kartu Belajar', icon: 'cards', keywords: 'flashcard anki sm-2' },
      { path: '/progres', label: 'Progres', title: 'Progres Pembelajaran', icon: 'chart', keywords: 'statistik penguasaan streak' },
    ],
  },
  {
    label: 'Jelajahi',
    items: [
      { path: '/peluang', label: 'Beasiswa & Peluang', icon: 'graduation', keywords: 'beasiswa kompetisi lomba' },
      { path: '/komunitas', label: 'Komunitas', icon: 'users', soon: true, keywords: 'grup diskusi' },
      { path: '/game', label: 'Game & Tantangan', title: 'Game Belajar', icon: 'game', keywords: 'permainan peta konsep' },
    ],
  },
];

/** Bottom of the rail. */
export const FOOTER_ENTRIES: NavEntry[] = [
  { path: '/profil', label: 'Profil', icon: 'user', keywords: 'lingkungan belajar jenjang' },
  { path: '/pengaturan', label: 'Pengaturan', icon: 'settings', keywords: 'tema target koneksi keluar' },
];

/** Contextual destinations reached from the top bar and the "Lainnya" sheet. */
export const SECONDARY_ENTRIES: NavEntry[] = [
  { path: '/asisten', label: 'Asisten AI', icon: 'sparkles', soon: true },
  { path: '/pesan', label: 'Pesan', icon: 'message', soon: true },
  { path: '/notifikasi', label: 'Notifikasi', icon: 'bell', soon: true },
  { path: '/bantuan', label: 'Bantuan & Keamanan', icon: 'help-circle', keywords: 'faq privasi aman' },
];

export const ALL_ENTRIES: NavEntry[] = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...FOOTER_ENTRIES,
  ...SECONDARY_ENTRIES,
];

export function isRouteActive(current: string, path: string): boolean {
  if (path === '/') return current === '/';
  return current === path || current.startsWith(`${path}/`);
}

const EXTRA_TITLES: Record<string, string> = {
  '/latihan': 'Kerjakan Kuis',
  '/hasil': 'Hasil Kuis',
  '/game/peta': 'Peta Penguasaan',
};

/** Page title shown in the top bar. Longest matching prefix wins. */
export function titleForPath(pathname: string): string {
  const candidates = [
    ...ALL_ENTRIES.map((e) => [e.path, e.title ?? e.label] as const),
    ...Object.entries(EXTRA_TITLES),
  ].filter(([p]) => p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`));
  candidates.sort((a, b) => b[0].length - a[0].length);
  return candidates[0]?.[1] ?? 'Belajar';
}

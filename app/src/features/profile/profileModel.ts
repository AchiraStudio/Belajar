/**
 * The profile as the page uses it.
 *
 * The server's `peer_profiles` row has columns for name, field, class year, bio, interests and skills.
 * Everything else a social-style profile needs (handle, tagline, location, banner colour, photo,
 * links) lives in its free-form `contact_info` JSON, which the server validates on write
 * (`validate_contact_info` in crates/stuby-api). These helpers read that object leniently (anything
 * unexpected is dropped, never rendered) and write it back without losing keys they do not know.
 */

export interface PeerProfile {
  id: number;
  full_name: string;
  major: string;
  batch_year: number | null;
  bio: string | null;
  academic_interests: string[];
  skills: string[];
  contact_info?: unknown;
}

export const BANNER_TONES = ['bamboo', 'sun', 'leaf', 'cream', 'ink'] as const;
export type BannerTone = (typeof BANNER_TONES)[number];

export interface ProfileLink {
  label: string;
  url: string;
}

export interface ProfileExtras {
  handle: string;
  headline: string;
  location: string;
  banner: BannerTone;
  /** A small image as a data URL, or null for the initials badge. */
  avatar: string | null;
  links: ProfileLink[];
}

/** Limits. The server enforces the same numbers. */
export const LIMITS = {
  name: 120,
  handleMin: 3,
  handleMax: 24,
  headline: 80,
  location: 60,
  bio: 2000,
  field: 120,
  skills: 20,
  links: 6,
  linkLabel: 40,
  linkUrl: 300,
} as const;

/** What the server writes when it creates a profile on first visit. These are placeholders, not the person's data. */
export const SERVER_DEFAULT_NAME = 'Mahasiswa Belajar';
export const DEFAULT_BANNER: BannerTone = 'bamboo';

export const EMPTY_EXTRAS: ProfileExtras = { handle: '', headline: '', location: '', banner: DEFAULT_BANNER, avatar: null, links: [] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Accepts `github.com/x` as well as `https://github.com/x`; refuses every other scheme. Returns null when unusable. */
export function safeHttpUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text || text.length > LIMITS.linkUrl || /\s/.test(text)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.') || u.username || u.password) return null;
    const out = u.toString();
    return out.length <= LIMITS.linkUrl ? out : null;
  } catch {
    return null;
  }
}

/** `https://www.github.com/x` -> `github.com`. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Lower-case, no leading @, only letters, digits, dot and underscore. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, LIMITS.handleMax);
}

export function handleError(handle: string): 'short' | null {
  return handle !== '' && handle.length < LIMITS.handleMin ? 'short' : null;
}

export function readExtras(contact: unknown): ProfileExtras {
  if (!isRecord(contact)) return { ...EMPTY_EXTRAS, links: [] };
  const banner = BANNER_TONES.find((t) => t === contact.banner) ?? DEFAULT_BANNER;
  const avatar = typeof contact.avatar === 'string' && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(contact.avatar) ? contact.avatar : null;
  const links = (Array.isArray(contact.links) ? contact.links : [])
    .slice(0, LIMITS.links)
    .flatMap((l): ProfileLink[] => {
      if (!isRecord(l) || typeof l.url !== 'string') return [];
      const url = safeHttpUrl(l.url);
      if (!url) return [];
      return [{ label: str(l.label, LIMITS.linkLabel) || linkHost(url), url }];
    });
  return {
    handle: normalizeHandle(str(contact.handle, LIMITS.handleMax)),
    headline: str(contact.headline, LIMITS.headline),
    location: str(contact.location, LIMITS.location),
    banner,
    avatar,
    links,
  };
}

/** The object to send back: keys this page does not manage are kept as they were; empty values are left out. */
export function writeExtras(original: unknown, extras: ProfileExtras): Record<string, unknown> {
  const out: Record<string, unknown> = isRecord(original) ? { ...original } : {};
  for (const key of ['handle', 'headline', 'location', 'avatar', 'links', 'banner']) delete out[key];
  if (extras.handle) out.handle = extras.handle;
  if (extras.headline) out.headline = extras.headline;
  if (extras.location) out.location = extras.location;
  if (extras.banner !== DEFAULT_BANNER) out.banner = extras.banner;
  if (extras.avatar) out.avatar = extras.avatar;
  if (extras.links.length) out.links = extras.links.map((l) => ({ label: l.label, url: l.url }));
  return out;
}

export const isPlaceholderName = (name: string | null | undefined): boolean => !name || name.trim() === '' || name === SERVER_DEFAULT_NAME;

/** The profile's own field/year only count once the person has made the profile theirs (see SERVER_DEFAULT_NAME). */
export function personalFields(p: PeerProfile | null): { name: string; major: string; year: number | null } {
  if (!p || isPlaceholderName(p.full_name)) return { name: '', major: '', year: null };
  return { name: p.full_name.trim(), major: p.major?.trim() ?? '', year: p.batch_year };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export const splitList = (s: string): string[] =>
  Array.from(new Set(s.split(',').map((x) => x.trim()).filter(Boolean)));

export type ChecklistId = 'photo' | 'name' | 'bio' | 'links' | 'level';

/** The "finish your profile" steps, in the order they are offered. */
export function checklist(p: PeerProfile | null, extras: ProfileExtras, hasLevel: boolean): { id: ChecklistId; done: boolean }[] {
  return [
    { id: 'photo', done: extras.avatar !== null },
    { id: 'name', done: !isPlaceholderName(p?.full_name) },
    { id: 'bio', done: (p?.bio ?? '').trim() !== '' },
    { id: 'links', done: extras.links.length > 0 },
    { id: 'level', done: hasLevel },
  ];
}

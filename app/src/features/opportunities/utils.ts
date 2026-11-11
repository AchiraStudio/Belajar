import type { DeadlineState } from './types';

const DAY = 86_400;
export const SOON_DAYS = 14;

/**
 * Deadline status is derived only from the stored deadline and the current time: it states a fact
 * ("closes in N days") rather than a verification claim, and never adds urgency copy.
 */
export function deadlineState(deadline: number, nowSeconds: number = Date.now() / 1000): DeadlineState {
  const diff = deadline - nowSeconds;
  if (diff <= 0) return { kind: 'closed', label: 'Ditutup', days: Math.floor(diff / DAY) };
  const days = Math.ceil(diff / DAY);
  if (days <= SOON_DAYS) return { kind: 'soon', label: days === 1 ? 'Ditutup besok' : `Ditutup ${days} hari lagi`, days };
  return { kind: 'open', label: 'Dibuka', days };
}

export function formatDeadline(deadline: number): string {
  return new Date(deadline * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function categoryLabel(category: string): string {
  return category === 'scholarship' ? 'Beasiswa' : category === 'competition' ? 'Kompetisi' : category;
}

/** Only http(s) links are ever rendered as anchors. */
export function safeUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

import { useCallback, useEffect, useRef } from 'react';

/** Counts seconds the page is actually visible, so a backgrounded tab does not inflate study time. */
export function useActiveClock(): () => number {
  const seconds = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') seconds.current += 1;
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return useCallback(() => seconds.current, []);
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function formatDuration(totalSeconds?: number | null): string {
  if (totalSeconds == null) return '—';
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} dtk`;
  const m = Math.floor(s / 60);
  return `${m} mnt ${s % 60} dtk`;
}

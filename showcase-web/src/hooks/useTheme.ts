import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark';

const KEY = 'stuby-showcase-theme';
const listeners = new Set<() => void>();
const root = document.documentElement;
const system = window.matchMedia('(prefers-color-scheme: dark)');

const read = (): Theme => (root.dataset.theme === 'dark' ? 'dark' : 'light');

function write(next: Theme) {
  root.dataset.theme = next;
  listeners.forEach((l) => l());
}

const hasSavedChoice = () => {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark'; } catch { return false; }
};

// Until the visitor picks a theme themselves, the page follows the operating system live.
system.addEventListener('change', () => { if (!hasSavedChoice()) write(system.matches ? 'dark' : 'light'); });

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

/** Swap themes with a circle that grows from the toggle. Falls back to an instant swap. */
export function toggleTheme(origin?: { x: number; y: number }) {
  const next: Theme = read() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, next); } catch { /* storage blocked: the choice lasts for this visit */ }

  const vt = (document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }).startViewTransition;
  if (!vt) { write(next); return; }

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? 0;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const t = vt.call(document, () => { flushSync(() => write(next)); });
  t.ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 620, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => { /* the swap already happened; only the wipe was skipped */ });
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => 'light');
}

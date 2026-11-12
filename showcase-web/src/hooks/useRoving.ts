import { useRef, type KeyboardEvent } from 'react';

/**
 * Roving-tabindex keyboard model for tablists and radiogroups: arrows move focus and selection,
 * Home/End jump to the ends. Attach `ref(i)` to each item and `onKeyDown` to the container.
 */
export function useRoving(count: number, onSelect: (i: number) => void, axis: 'both' | 'vertical' = 'both') {
  const items = useRef<(HTMLElement | null)[]>([]);

  const ref = (i: number) => (el: HTMLElement | null) => { items.current[i] = el; };

  const onKeyDown = (e: KeyboardEvent) => {
    const i = items.current.findIndex((el) => el === document.activeElement);
    if (i < 0) return;
    const next = (i + 1) % count;
    const prev = (i - 1 + count) % count;
    let n = -1;
    if (e.key === 'ArrowDown' || (axis === 'both' && e.key === 'ArrowRight')) n = next;
    else if (e.key === 'ArrowUp' || (axis === 'both' && e.key === 'ArrowLeft')) n = prev;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = count - 1;
    if (n < 0) return;
    e.preventDefault();
    onSelect(n);
    items.current[n]?.focus();
  };

  return { ref, onKeyDown };
}

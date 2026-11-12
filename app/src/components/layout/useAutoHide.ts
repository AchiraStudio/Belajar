import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hides a floating bar after a stretch of inactivity and brings it back on activity, the same way
 * on desktop and on phones:
 *
 *  - scrolling the page (or any panel) up or down brings it back. Sideways scrolling does not: a banner
 *    that slides by itself scrolls its track horizontally, and that must not keep summoning the bar;
 *  - a touch or pen press anywhere brings it back, because a short page has nothing to scroll;
 *  - a mouse brings it back when it moves near the bottom edge, and any key press does too (Tab
 *    must be able to reach the bar);
 *  - it never hides while `hold` is true (pointer over it, focus inside it, a menu open).
 *
 * Hiding is only a visual state. The bar stays in the DOM and in the tab order, so keyboard and
 * screen-reader users are never locked out of navigation.
 */
export function useAutoHide({ idleMs = 3200, hold = false }: { idleMs?: number; hold?: boolean } = {}) {
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);
  const holdRef = useRef(hold);
  const timer = useRef(0);
  holdRef.current = hold;

  const setHiddenState = useCallback((value: boolean) => {
    hiddenRef.current = value;
    setHidden(value);
  }, []);

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (holdRef.current) schedule();
      else setHiddenState(true);
    }, idleMs);
  }, [idleMs, setHiddenState]);

  const reveal = useCallback(() => {
    if (hiddenRef.current) setHiddenState(false);
    schedule();
  }, [schedule, setHiddenState]);

  // Holding (hover, focus, an open menu) also resets the idle clock when it ends.
  useEffect(() => {
    if (hold) {
      if (hiddenRef.current) setHiddenState(false);
      window.clearTimeout(timer.current);
    } else {
      schedule();
    }
  }, [hold, schedule, setHiddenState]);

  useEffect(() => {
    schedule();
    // Only a change in vertical position counts. Each scroller's last position is remembered so a
    // horizontal-only scroll (the auto-playing banner, a carousel) is ignored.
    const lastTop = new WeakMap<object, number>();
    const onScroll = (e: Event) => {
      const el = e.target as (Element & { scrollTop?: number }) | Document | null;
      const top = !el || el === document || el === document.documentElement ? window.scrollY : ((el as Element).scrollTop ?? 0);
      const key = el ?? document;
      const before = lastTop.get(key) ?? 0;
      lastTop.set(key, top);
      if (top !== before) reveal();
    };
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) reveal();
    };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') reveal();
      else if (e.clientY > window.innerHeight - 120) reveal();
      else if (!hiddenRef.current) schedule();
    };
    const onKey = () => reveal();
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    document.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener('scroll', onScroll, { capture: true });
      document.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [reveal, schedule]);

  return { hidden, reveal };
}

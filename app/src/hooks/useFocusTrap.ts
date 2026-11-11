import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal behaviour for a container that is mounted while a dialog is open: moves focus inside,
 * keeps Tab within it, closes on Escape, and returns focus to the element that opened it.
 * (New dialogs should use `components/ui/Dialog`; this adds the same behaviour to older markup.)
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;
    const opener = document.activeElement as HTMLElement | null;

    const nodes = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
    (container.querySelector<HTMLElement>('[data-autofocus]') ?? nodes()[0])?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = nodes();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0] as HTMLElement;
      const last = list[list.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      opener?.focus?.();
    };
    // `onEscape` is intentionally not a dependency: re-running would steal focus on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ref]);
}

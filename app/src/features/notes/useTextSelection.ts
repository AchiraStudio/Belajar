import { useEffect, useState, type RefObject } from 'react';
import type { SelectionCoords } from './types';

export function useTextSelection(containerRef: RefObject<HTMLElement | null>, enabled: boolean = true) {
  const [coords, setCoords] = useState<SelectionCoords | null>(null);

  useEffect(() => {
    if (!enabled) {
      setCoords(null);
      return;
    }

    const checkSelection = () => {
      if (typeof window === 'undefined') return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !containerRef.current) {
        setCoords(null);
        return;
      }

      const text = sel.toString().trim();
      if (text.length < 2) {
        setCoords(null);
        return;
      }

      if (!sel.anchorNode || !containerRef.current.contains(sel.anchorNode)) {
        setCoords(null);
        return;
      }

      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          setCoords(null);
          return;
        }

        const pw = 100; // estimated pill width
        const ph = 36;  // estimated pill height
        let left = Math.max(10, Math.min(window.innerWidth - pw - 10, rect.left + rect.width / 2 - pw / 2));
        let top = rect.top - ph - 8;
        if (top < 12) top = rect.bottom + 8;

        setCoords({ top: Math.round(top), left: Math.round(left), text });
      } catch {
        setCoords(null);
      }
    };

    const handleSelectionChange = () => {
      setTimeout(checkSelection, 20);
    };

    const handleScroll = () => {
      setCoords(null);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [containerRef, enabled]);

  const clearSelection = () => {
    setCoords(null);
    try {
      if (typeof window !== 'undefined') {
        window.getSelection()?.removeAllRanges();
      }
    } catch {
      /* ignore */
    }
  };

  return { coords, clearSelection };
}

import { useState } from 'react';

export function useReadingPreferences() {
  const [fontSize, setFontSizeState] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const stored = Number(window.localStorage.getItem('belajar-fs'));
      if (stored && stored >= 15 && stored <= 23) return stored;
    }
    return 17;
  });

  const [fontFamily, setFontFamilyState] = useState<'soft' | 'serif'>(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('belajar-read');
      if (stored === 'serif') return 'serif';
    }
    return 'soft';
  });

  const setFontSize = (size: number) => {
    const clamped = Math.max(15, Math.min(23, size));
    setFontSizeState(clamped);
    try {
      window.localStorage.setItem('belajar-fs', String(clamped));
    } catch {
      /* ignore */
    }
  };

  const increaseFont = () => setFontSize(fontSize + 1);
  const decreaseFont = () => setFontSize(fontSize - 1);

  const setFontFamily = (family: 'soft' | 'serif') => {
    setFontFamilyState(family);
    try {
      window.localStorage.setItem('belajar-read', family);
    } catch {
      /* ignore */
    }
  };

  return {
    fontSize,
    fontFamily,
    increaseFont,
    decreaseFont,
    setFontSize,
    setFontFamily,
  };
}

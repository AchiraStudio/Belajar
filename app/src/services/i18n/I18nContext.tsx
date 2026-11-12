import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, isLanguage, localeFor, type Language } from './languages';
import { setCurrentLanguage, translate } from './translate';

export interface I18nValue {
  language: Language;
  locale: string;
  setLanguage: (language: Language) => void;
  /** Translate Indonesian source text (see translate.ts). */
  t: (source: string, vars?: Record<string, string | number>) => string;
}

function storedLanguage(): Language | null {
  try {
    const raw = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(raw) ? raw : null;
  } catch {
    return null;
  }
}

const fallback: I18nValue = {
  language: DEFAULT_LANGUAGE,
  locale: localeFor(DEFAULT_LANGUAGE),
  setLanguage: () => {},
  t: (source, vars) => translate(DEFAULT_LANGUAGE, source, vars),
};

// Works without a provider (small component tests): it simply uses the default language.
const I18nContext = createContext<I18nValue>(fallback);

export function I18nProvider({ children, initial }: { children: React.ReactNode; initial?: Language }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const start = initial ?? storedLanguage() ?? DEFAULT_LANGUAGE;
    setCurrentLanguage(start); // before the first render, so non-React helpers agree from the start
    return start;
  });

  useEffect(() => {
    setCurrentLanguage(language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setCurrentLanguage(next);
    setLanguageState(next);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* the choice still applies for this session */
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      language,
      locale: localeFor(language),
      setLanguage,
      t: (source, vars) => translate(language, source, vars),
    }),
    [language, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

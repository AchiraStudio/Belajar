export type Language = 'en' | 'id' | 'es' | 'zh';

export interface LanguageInfo {
  code: Language;
  /** The language's own name, always shown in that language so anyone can find it. */
  native: string;
  /** Used for dates and numbers (Intl). */
  locale: string;
}

export const LANGUAGES: readonly LanguageInfo[] = [
  { code: 'en', native: 'English', locale: 'en-US' },
  { code: 'id', native: 'Bahasa Indonesia', locale: 'id-ID' },
  { code: 'es', native: 'Español', locale: 'es-ES' },
  { code: 'zh', native: '中文（简体）', locale: 'zh-CN' },
] as const;

/**
 * English for everyone. Tests keep Indonesian (the language their assertions were written in)
 * so they do not depend on a stored preference; `I18nProvider` tests pass a language explicitly.
 */
export const DEFAULT_LANGUAGE: Language = import.meta.env.MODE === 'test' ? 'id' : 'en';

export const LANGUAGE_STORAGE_KEY = 'stuby-language';

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((l) => l.code === value);
}

export function localeFor(language: Language): string {
  return LANGUAGES.find((l) => l.code === language)?.locale ?? 'en-US';
}

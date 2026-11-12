import { DEFAULT_LANGUAGE, localeFor, type Language } from './languages';
import { MESSAGES } from './messages';

/**
 * How translation works. The source text IS the Indonesian text written in the component, so the
 * code stays readable and Indonesian needs no lookup. Other languages look the phrase up in
 * `messages.ts`; a phrase that has no row (a page not translated yet) is shown as written rather
 * than as a key or blank. `{name}` placeholders are filled from `vars`; `singular|plural` picks by `n`.
 */
const table = new Map<string, { en: string; es: string; zh: string }>(
  MESSAGES.map(([id, en, es, zh]) => [id, { en, es, zh }]),
);

export function hasTranslation(source: string): boolean {
  return table.has(source);
}

export function translate(language: Language, source: string, vars?: Record<string, string | number>): string {
  // Callers sometimes pass an unexpected value through (an unknown status, a missing label): hand it back.
  if (typeof source !== 'string') return source;
  let text = source;
  if (language !== 'id') {
    const row = table.get(source);
    if (row) text = row[language];
  }
  // Plurals: a translation may hold `singular|plural`; `n` picks the form (1 is singular).
  if (text.includes('|')) {
    const parts = text.split('|');
    const singular = vars !== undefined && Number(vars.n) === 1;
    text = (singular ? parts[0] : (parts[1] ?? parts[0])) ?? text;
  }
  if (vars) {
    text = text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
  }
  return text;
}

/**
 * The language non-React code (formatters, route titles) should use. The provider keeps it in step
 * with the person's choice; components that show such text still call `useI18n()` so they re-render
 * when it changes.
 */
let current: Language = DEFAULT_LANGUAGE;

export function setCurrentLanguage(language: Language): void {
  current = language;
}

export function currentLanguage(): Language {
  return current;
}

export function currentLocale(): string {
  return localeFor(current);
}

/** `translate` in the current language, for code outside React. */
export function tr(source: string, vars?: Record<string, string | number>): string {
  return translate(current, source, vars);
}

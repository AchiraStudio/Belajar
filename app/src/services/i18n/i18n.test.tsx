import { act, cleanup, render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, useI18n } from './I18nContext';
import { LANGUAGES, LANGUAGE_STORAGE_KEY, isLanguage } from './languages';
import { MESSAGES } from './messages';
import { setCurrentLanguage, tr, translate } from './translate';

const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort().join(',');

describe('message table', () => {
  it('has no duplicate or empty entries', () => {
    const ids = MESSAGES.map((r) => r[0]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of MESSAGES) {
      expect(row.length).toBe(4);
      row.forEach((cell) => expect(cell.trim().length).toBeGreaterThan(0));
    }
  });

  it('keeps every {placeholder} in all four languages', () => {
    for (const [id, en, es, zh] of MESSAGES) {
      const want = placeholders(id);
      expect({ id, lang: 'en', found: placeholders(en) }).toEqual({ id, lang: 'en', found: want });
      expect({ id, lang: 'es', found: placeholders(es) }).toEqual({ id, lang: 'es', found: want });
      expect({ id, lang: 'zh', found: placeholders(zh) }).toEqual({ id, lang: 'zh', found: want });
    }
  });

  it('covers every phrase that migrated screens ask for, so nothing falls back by accident', () => {
    const src = path.resolve(__dirname, '../..');
    const known = new Set(MESSAGES.map((r) => r[0]));
    const call = /\b(?:t|tr)\(\s*'((?:[^'\\]|\\.)*)'/g;
    const missing: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'test' && entry.name !== 'node_modules') walk(p);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) && !p.includes(`${path.sep}i18n${path.sep}`)) {
          const text = fs.readFileSync(p, 'utf-8');
          for (const m of text.matchAll(call)) {
            const phrase = m[1]!.replace(/\\'/g, "'");
            if (!known.has(phrase)) missing.push(`${path.relative(src, p)}: ${phrase}`);
          }
        }
      }
    };
    walk(src);
    expect(missing).toEqual([]);
  });
});

describe('translate', () => {
  it('returns the Indonesian source untouched, and looks other languages up', () => {
    expect(translate('id', 'Pengaturan')).toBe('Pengaturan');
    expect(translate('en', 'Pengaturan')).toBe('Settings');
    expect(translate('es', 'Pengaturan')).toBe('Ajustes');
    expect(translate('zh', 'Pengaturan')).toBe('设置');
  });

  it('shows an untranslated phrase as written instead of a key or blank', () => {
    expect(translate('en', 'Kalimat yang belum diterjemahkan')).toBe('Kalimat yang belum diterjemahkan');
  });

  it('fills placeholders, including in Indonesian', () => {
    expect(translate('id', 'Total belajar {time}', { time: '2 jam' })).toBe('Total belajar 2 jam');
    expect(translate('zh', 'Total belajar {time}', { time: '2 小时' })).toBe('累计学习 2 小时');
    expect(translate('en', 'Halaman {name}', { name: 'Quizzes' })).toBe('Quizzes pages');
  });

  it('picks singular or plural from n (and never prints a "|")', () => {
    expect(translate('en', '{n} hari', { n: 1 })).toBe('1 day');
    expect(translate('en', '{n} hari', { n: 7 })).toBe('7 days');
    expect(translate('es', '{n} hari', { n: 1 })).toBe('1 día');
    expect(translate('es', '{n} hari', { n: 3 })).toBe('3 días');
    expect(translate('zh', '{n} hari', { n: 7 })).toBe('7 天');
    expect(translate('id', '{n} hari', { n: 7 })).toBe('7 hari');
  });

  it('tr() follows the current language for non-React code', () => {
    setCurrentLanguage('es');
    expect(tr('Hari ini')).toBe('Hoy');
    setCurrentLanguage('en');
    expect(tr('Hari ini')).toBe('Today');
    setCurrentLanguage('id');
  });
});

function Probe() {
  const { language, t, setLanguage } = useI18n();
  return (
    <div>
      <output data-testid="lang">{language}</output>
      <output data-testid="text">{t('Pengaturan')}</output>
      <button onClick={() => setLanguage('zh')}>to-zh</button>
    </div>
  );
}

describe('I18nProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = '';
  });
  afterEach(() => {
    cleanup();
    setCurrentLanguage('id');
  });

  it('knows the four languages, English first', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'id', 'es', 'zh']);
    expect(isLanguage('zh')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
  });

  it('uses the language it is given, and sets <html lang>', () => {
    render(
      <I18nProvider initial="en">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('lang').textContent).toBe('en');
    expect(screen.getByTestId('text').textContent).toBe('Settings');
    expect(document.documentElement.lang).toBe('en');
  });

  it('reads the saved choice when none is passed, and ignores a corrupt one', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'es');
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('text').textContent).toBe('Ajustes');
    cleanup();

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'klingon');
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(isLanguage(screen.getByTestId('lang').textContent)).toBe(true);
  });

  it('switching re-renders, persists, and updates <html lang>', () => {
    render(
      <I18nProvider initial="en">
        <Probe />
      </I18nProvider>,
    );
    act(() => {
      screen.getByText('to-zh').click();
    });
    expect(screen.getByTestId('text').textContent).toBe('设置');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('zh');
    expect(document.documentElement.lang).toBe('zh');
  });

  it('works without a provider (the default language)', () => {
    render(<Probe />);
    expect(isLanguage(screen.getByTestId('lang').textContent)).toBe(true);
  });
});

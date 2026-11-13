import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasTranslation } from '../../services/i18n';

/**
 * Every phrase the profile screens pass to `t()` / `tr()` has a row in the translation table, so no
 * Indonesian is left over when the language is English, Spanish or Chinese. Phrases that reach `t()`
 * through a lookup table (banner colour names, "finish your profile" steps) are listed here by hand.
 */
const DYNAMIC = [
  'Bambu', 'Matahari', 'Daun', 'Krem', 'Tinta',
  'Tambah foto profil', 'Biar kamu mudah dikenali', 'Tulis namamu', 'Ganti isian bawaan dengan namamu',
  'Tulis bio singkat', 'Ceritakan apa yang sedang kamu pelajari', 'Tambah tautan', 'Portofolio, situs, atau profil lain',
  'Pilih jenjang belajar', 'Menyesuaikan bahasa dan saran',
  'Aktivitas', 'Tentang', 'Jenjang', 'Privasi',
];

function phrases(): string[] {
  const dir = __dirname;
  const out = new Set<string>(DYNAMIC);
  for (const f of readdirSync(dir).filter((n) => /\.(ts|tsx)$/.test(n) && !n.includes('.test.'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/\b(?:t|tr)\(\s*'((?:[^'\\]|\\.)*)'/g)) out.add(m[1]!.replace(/\\'/g, "'"));
  }
  return [...out];
}

describe('profile translations', () => {
  it('has a row for every phrase', () => {
    const missing = phrases().filter((p) => !hasTranslation(p));
    expect(missing).toEqual([]);
  });
});

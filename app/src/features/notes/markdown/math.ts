import type { MathToken } from '../types';

export const MATH_OPEN = '\uE000';
export const MATH_CLOSE = '\uE001';
export const MATH_TOKEN = /\uE000(\d+)\uE001/g;
export const MATH_ONLY = /^\s*\uE000(\d+)\uE001\s*$/;
const SPECIAL = /[`\\$]/g;

export const esc = (t: string | number): string =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

export function extractMath(src: string): [string, MathToken[]] {
  const math: MathToken[] = [];
  const n = src.length;
  let out = '';
  let i = 0;
  const put = (tex: string, display: boolean) => {
    math.push({ tex, display });
    out += MATH_OPEN + (math.length - 1) + MATH_CLOSE;
  };

  while (i < n) {
    SPECIAL.lastIndex = i;
    const m = SPECIAL.exec(src);
    if (!m) {
      out += src.slice(i);
      break;
    }
    if (m.index > i) {
      out += src.slice(i, m.index);
      i = m.index;
    }
    const c = src[i];
    if (c === '`') {
      if (src.startsWith('```', i)) {
        const end = src.indexOf('```', i + 3);
        const stop = end < 0 ? n : end + 3;
        out += src.slice(i, stop);
        i = stop;
        continue;
      }
      const end = src.indexOf('`', i + 1);
      const nl = src.indexOf('\n', i + 1);
      if (end > 0 && (nl < 0 || end < nl)) {
        out += src.slice(i, end + 1);
        i = end + 1;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    if (c === '\\') {
      const nx = src[i + 1];
      if (nx === '$') {
        math.push({ tex: '$', display: false, lit: '$' });
        out += MATH_OPEN + (math.length - 1) + MATH_CLOSE;
        i += 2;
        continue;
      }
      if (nx === '\\') {
        out += '\\\\';
        i += 2;
        continue;
      }
      if (nx === '[') {
        const end = src.indexOf('\\]', i + 2);
        if (end > 0) {
          put(src.slice(i + 2, end), true);
          i = end + 2;
          continue;
        }
      } else if (nx === '(') {
        const end = src.indexOf('\\)', i + 2);
        if (end > 0) {
          put(src.slice(i + 2, end), false);
          i = end + 2;
          continue;
        }
      }
      out += c;
      i++;
      continue;
    }
    // c === '$'
    if (src[i + 1] === '$') {
      const end = src.indexOf('$$', i + 2);
      if (end > i + 2) {
        put(src.slice(i + 2, end), true);
        i = end + 2;
        continue;
      }
      out += '$$';
      i += 2;
      continue;
    }
    const nx = src[i + 1];
    if (nx && !/\s/.test(nx)) {
      let j = i + 1;
      let found = -1;
      while (j < n) {
        const cj = src[j];
        if (cj === '\n') break;
        if (cj === '\\') {
          j += 2;
          continue;
        }
        if (cj === '$') {
          found = j;
          break;
        }
        j++;
      }
      if (found > i + 1 && !/\s/.test(src[found - 1] ?? '') && !/\d/.test(src[found + 1] ?? '')) {
        put(src.slice(i + 1, found), false);
        i = found + 1;
        continue;
      }
    }
    out += '$';
    i++;
  }
  return [out, math];
}

const mathCache = new Map<string, string>();

export function renderMath(m: MathToken): string {
  if (m.lit != null) return esc(m.lit);
  const tex = m.tex.trim();
  const key = (m.display ? 'D' : 'I') + tex;
  let html = mathCache.get(key);
  if (html == null) {
    const katex = typeof window !== 'undefined' ? (window as any).katex : null;
    if (katex && typeof katex.renderToString === 'function') {
      try {
        html = katex.renderToString(tex, {
          displayMode: Boolean(m.display),
          throwOnError: false,
          strict: 'ignore',
          trust: false,
        });
      } catch {
        html = undefined;
      }
    }
    if (html == null) {
      const d = m.display ? '$$' : '$';
      html = `<code class="math-fallback">${esc(d + tex + d)}</code>`;
    }
    if (mathCache.size > 800) mathCache.clear();
    mathCache.set(key, html);
  }
  return html;
}

export function restoreMath(html: string, math: MathToken[]): string {
  return html.replace(MATH_TOKEN, (all, i) => (math[+i] ? renderMath(math[+i] as MathToken) : all));
}

import { detox } from './detox';
import {
  extractMath,
  restoreMath,
  MATH_ONLY,
  MATH_OPEN,
  MATH_CLOSE,
} from './math';
import type { MathToken } from '../types';
import { renderCodeBlock } from './codeBlock';
import { inline } from './inline';

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const isTableSep = (l: string) =>
  l.includes('|') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l);
const isDisplayTok = (l: string, math: MathToken[]) => {
  const m = MATH_ONLY.exec(l);
  return Boolean(m && math[+(m[1] ?? '')]?.display);
};
const isBlockStart = (
  l: string,
  next: string | undefined,
  math: MathToken[],
) =>
  /^(#{1,6})\s/.test(l) ||
  /^\s*```/.test(l) ||
  LIST_RE.test(l) ||
  /^\s*>/.test(l) ||
  /^\s*([-*_])\1{2,}\s*$/.test(l) ||
  (l.includes('|') && next != null && isTableSep(next)) ||
  isDisplayTok(l, math);

/** Indexed read that is always a string (out-of-range reads as an empty line). */
const at = (a: readonly string[], i: number): string => a[i] ?? '';

const indentOf = (l: string) =>
  l.match(/^\s*/)?.[0].replace(/\t/g, '    ').length ?? 0;

function cells(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i] ?? '';
    if (c === '\\' && t[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (c === '|') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

const alignOf = (c: string) => {
  const x = c.replace(/\s/g, '');
  return x.startsWith(':') && x.endsWith(':')
    ? 'center'
    : x.endsWith(':')
    ? 'right'
    : '';
};

function parseList(lines: string[], i: number, indent: number): [string, number] {
  const first = at(lines, i).match(LIST_RE)!;
  const marker = first[2] ?? '';
  const ordered = /\d/.test(marker);
  const tag = ordered ? 'ol' : 'ul';
  const startNum = ordered ? parseInt(marker, 10) : 1;
  let html = `<${tag}${ordered && startNum !== 1 ? ` start="${startNum}"` : ''}>`;
  let open = false;

  while (i < lines.length) {
    let line = at(lines, i);
    if (/^\s*$/.test(line)) {
      let k = i;
      while (k < lines.length && /^\s*$/.test(at(lines, k))) k++;
      const nm = k < lines.length ? at(lines, k).match(LIST_RE) : null;
      if (nm && indentOf(at(lines, k)) >= indent && k - i <= 2) {
        i = k;
        line = at(lines, i);
      } else break;
    }
    const m = line.match(LIST_RE);
    if (!m) {
      if (open && indentOf(line) > indent && !/^\s*(```|#{1,6}\s|>)/.test(line)) {
        html = html.replace(/<\/li>$/, '') + ' ' + inline(line.trim()) + '</li>';
        i++;
        continue;
      }
      break;
    }
    const ind = indentOf(line);
    if (ind < indent) break;
    if (ind > indent) {
      const [sub, next] = parseList(lines, i, ind);
      html = open ? html.replace(/<\/li>$/, '') + sub + '</li>' : html + `<li>${sub}</li>`;
      open = true;
      i = next;
      continue;
    }
    if (/\d/.test(m[2] ?? '') !== ordered) break;
    let body = m[3] ?? '';
    const task = body.match(/^\[( |x|X)\]\s+(.*)$/);
    if (task) body = `${/x/i.test(task[1] ?? '') ? '☑' : '☐'} ${task[2] ?? ''}`;
    html += `<li>${inline(body)}</li>`;
    open = true;
    i++;
  }
  return [html + `</${tag}>`, i];
}

export function renderBlocks(text: string, math: MathToken[]): string {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let i = 0;
  let sectionIndex = 0;

  while (i < lines.length) {
    const line = at(lines, i);
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }
    let m: RegExpMatchArray | null;
    if (/^\s*```/.test(line)) {
      const info = line.replace(/^\s*```/, '').trim();
      const ind = indentOf(line);
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(at(lines, i))) {
        code.push(at(lines, i++).replace(new RegExp('^ {0,' + ind + '}'), ''));
      }
      i++;
      out.push(renderCodeBlock(info, code.join('\n')));
      continue;
    }
    if ((m = line.match(/^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/))) {
      const level = (m[1] ?? '#').length;
      const headingText = inline(m[2] ?? '');
      const idAttr = level === 2 ? ` id="bagian-${sectionIndex++}"` : '';
      out.push(`<h${level}${idAttr}>${headingText}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && /^\s*>/.test(at(lines, i))) {
        inner.push(at(lines, i++).replace(/^\s*>\s?/, ''));
      }
      out.push(`<blockquote>${renderBlocks(inner.join('\n'), math)}</blockquote>`);
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isTableSep(at(lines, i + 1))) {
      const head = cells(line);
      const aligns = cells(at(lines, i + 1)).map(alignOf);
      const n = head.length;
      i += 2;
      let body = '';
      while (i < lines.length && at(lines, i).includes('|') && !/^\s*$/.test(at(lines, i))) {
        const row = cells(at(lines, i));
        if (row.length > n) row.splice(n - 1, row.length - n + 1, row.slice(n - 1).join(' / '));
        while (row.length < n) row.push('');
        body += `<tr>${row.map((c, k) => `<td${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${inline(c)}</td>`).join('')}</tr>`;
        i++;
      }
      out.push(
        `<div class="tw"><table><thead><tr>${head.map((c, k) => `<th${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`,
      );
      continue;
    }
    if (LIST_RE.test(line)) {
      const [listHtml, next] = parseList(lines, i, indentOf(line));
      out.push(listHtml);
      i = next;
      continue;
    }
    if (isDisplayTok(line, math)) {
      const tokenMatch = MATH_ONLY.exec(line);
      out.push(`<div class="math-block">${MATH_OPEN}${tokenMatch?.[1] ?? ''}${MATH_CLOSE}</div>`);
      i++;
      continue;
    }
    const para = [line.trim()];
    i++;
    while (i < lines.length && !/^\s*$/.test(at(lines, i)) && !isBlockStart(at(lines, i), lines[i + 1], math)) {
      para.push(at(lines, i++).trim());
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

export function renderMarkdown(src: string): string {
  const [text, math] = extractMath(detox(src));
  return restoreMath(renderBlocks(text, math), math);
}

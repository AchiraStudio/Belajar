const LATEX_AFTER =
  'abla|earrow|eg|eLeftrightarrow|eleftarrow|emid|eoalign|eobreak|eoindent|eolimits|eonscript|eq|ewline|ot|otin|u' +
  '|ag|au|ext|extbf|extit|extsf|exttt|frac|ilde|imes|o|op|riangle|riangleq|riangleleft|riangleright' +
  '|angle|brace|brack|floor|group|ho|ight|ightarrow|Rightarrow|ightleftharpoons|ightharpoondown|ightharpoonup|ing|m|vert';

const ESCAPE_RE = new RegExp('(^|[^\\\\])\\\\([ntr])(?!(?:' + LATEX_AFTER + ')(?![a-zA-Z]))', 'g');
const ESCAPE_IN_MATH = /(^|[^\\])\\([ntr])(?![a-zA-Z])/g;
const MATH_SPAN_SPLIT = /(\$\$[\s\S]+?\$\$|\$(?=\S)[^$\n]*?\S\$(?!\d))/;

function replaceAll(t: string, re: RegExp): string {
  let prev: string;
  do {
    prev = t;
    t = t.replace(re, (_m, pre, c) => pre + ({ n: '\n', t: '\t', r: '\r' }[c as 'n' | 't' | 'r'] || ''));
  } while (t !== prev);
  return t;
}

function unescapeLiterals(t: string): string {
  return t
    .split(MATH_SPAN_SPLIT)
    .map((p, i) => replaceAll(p, i % 2 ? ESCAPE_IN_MATH : ESCAPE_RE))
    .join('');
}

function mapOutsideFences(t: string, fn: (s: string) => string): string {
  const out: string[] = [];
  let buf: string[] = [];
  let inFence = false;
  const flush = () => {
    if (buf.length) {
      const chunk = buf.join('\n');
      out.push(inFence ? chunk : fn(chunk));
      buf = [];
    }
  };
  for (const ln of t.split('\n')) {
    if (!inFence && /^\s*```/.test(ln)) {
      flush();
      inFence = true;
      buf.push(ln);
    } else if (inFence && /^\s*```\s*$/.test(ln)) {
      buf.push(ln);
      flush();
      inFence = false;
    } else {
      buf.push(ln);
    }
  }
  flush();
  return out.join('\n');
}

export function detox(src: string): string {
  let t = String(src || '');
  t = t.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');
  const open = t.search(/<think>/i);
  if (open >= 0) {
    const head = t.slice(0, open);
    t = head.trim() ? head : t.slice(open + 7);
  }
  const trimmed = t.trim();
  const wrap = trimmed.match(/^```([^\n]*)\s*\n([\s\S]*?)\n?```\s*$/);
  if (wrap && /^(|markdown|md)$/i.test((wrap[1] ?? '').trim()) && !(wrap[2] ?? '').includes('```')) {
    t = wrap[2] ?? t;
  }
  const shell = t.trim();
  if (shell.startsWith('{') && shell.endsWith('}')) {
    try {
      const obj = JSON.parse(shell);
      const ks = Object.keys(obj);
      const k0 = ks[0] ?? '';
      const keys = ['content', 'response', 'answer', 'reply', 'message', 'text', 'jawaban', 'balasan', 'catatan', 'isi'];
      if (ks.length === 1 && keys.includes(k0.toLowerCase()) && typeof obj[k0] === 'string' && obj[k0].trim()) {
        t = obj[k0];
      }
    } catch {
      /* not json */
    }
  }
  if (!t.includes('\n') && (t.match(/\\n/g) || []).length >= 2) {
    t = unescapeLiterals(t);
  }
  t = mapOutsideFences(t, (p) => unescapeLiterals(p).replace(/\n{3,}/g, '\n\n'));
  return t.trim();
}

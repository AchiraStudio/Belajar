import { esc } from './math';

type TokenDef = [string, string]; // [classKey, text]

const W = (s: string) => new Set(s.split(/\s+/).filter(Boolean));
const S = (re: RegExp) => re.source;

const CMT_SL = S(/\/\/[^\n]*/);
const CMT_HASH = S(/#[^\n]*/);
const CMT_DASH = S(/--[^\n]*/);
const CMT_BLOCK = S(/\/\*[\s\S]*?(?:\*\/|$)/);
const STR_DQ = S(/"(?:\\.|[^"\\\n])*"?/);
const STR_SQ = S(/'(?:\\.|[^'\\\n])*'?/);
const STR_BT = S(/`(?:\\.|[^`\\])*`?/);
const STR_TDQ = S(/"""[\s\S]*?(?:"""|$)/);
const STR_TSQ = S(/'''[\s\S]*?(?:'''|$)/);
const STR_RAW_SQ = S(/'(?:''|[^'])*'?/);

interface LangDef {
  kw: Set<string>;
  lit: Set<string>;
  bi: Set<string>;
  cmt: string[];
  str: string[];
  extra?: [string, string];
  ci?: boolean;
  keys?: boolean;
}

const DEFS: Record<string, LangDef> = {
  python: {
    kw: W('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'),
    lit: W('True False None'),
    bi: W('print len range int str float list dict set tuple input open type isinstance enumerate zip map filter sum min max abs sorted super self cls bool bytes round any all'),
    cmt: [CMT_HASH],
    str: [STR_TDQ, STR_TSQ, STR_DQ, STR_SQ],
    extra: [S(/@[A-Za-z_][\w.]*/), 'b'],
  },
  javascript: {
    kw: W('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await static get set from as'),
    lit: W('true false null undefined NaN Infinity'),
    bi: W('console document window Math JSON Object Array Promise Map Set require module process String Number Boolean Date RegExp Error'),
    cmt: [CMT_SL, CMT_BLOCK],
    str: [STR_BT, STR_DQ, STR_SQ],
  },
  typescript: {
    kw: W('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await static get set from as interface type enum implements private public protected readonly abstract namespace declare keyof'),
    lit: W('true false null undefined NaN Infinity'),
    bi: W('console document window Math JSON Object Array Promise Map Set require module string number boolean any never unknown void'),
    cmt: [CMT_SL, CMT_BLOCK],
    str: [STR_BT, STR_DQ, STR_SQ],
  },
  java: {
    kw: W('abstract assert break case catch class continue default do else enum extends final finally for if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try void volatile while var record'),
    lit: W('true false null'),
    bi: W('int long double float boolean char byte short String System Math List Map Set ArrayList HashMap Integer Object'),
    cmt: [CMT_SL, CMT_BLOCK],
    str: [STR_DQ, STR_SQ],
    extra: [S(/@[A-Za-z_]\w*/), 'b'],
  },
  c: {
    kw: W('auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while'),
    lit: W('NULL true false'),
    bi: W('printf scanf malloc free sizeof strlen strcpy size_t FILE'),
    cmt: [CMT_SL, CMT_BLOCK],
    str: [STR_DQ, STR_SQ],
    extra: [S(/#[ \t]*(?:include|define|ifdef|ifndef|endif|if|else|elif|pragma|undef)\b.*/), 'b'],
  },
  cpp: {
    kw: W('auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while bool class namespace template typename using new delete public private protected virtual override nullptr this try catch throw constexpr final'),
    lit: W('NULL true false nullptr'),
    bi: W('std cout cin endl string vector map set cerr size_t'),
    cmt: [CMT_SL, CMT_BLOCK],
    str: [STR_DQ, STR_SQ],
    extra: [S(/#[ \t]*(?:include|define|ifdef|ifndef|endif|if|else|elif|pragma|undef)\b.*/), 'b'],
  },
  csharp: {
    kw: W('abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new object operator out override params private protected public readonly ref return sbyte sealed short sizeof static string struct switch this throw try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while async await'),
    lit: W('true false null'),
    bi: W('Console String List Dictionary Math'),
    cmt: [CMT_SL, CMT_BLOCK],
    str: [S(/@"(?:""|[^"])*"?/), STR_DQ, STR_SQ],
  },
  go: {
    kw: W('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'),
    lit: W('true false nil iota'),
    bi: W('fmt Println Printf Sprintf len make append cap new panic string int int64 float64 bool byte error rune'),
    cmt: [CMT_SL, CMT_BLOCK],
    str: [STR_BT, STR_DQ, STR_SQ],
  },
  rust: {
    kw: W('as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while'),
    lit: W('true false None Some Ok Err'),
    bi: W('Vec String Option Result Box i8 i16 i32 i64 u8 u16 u32 u64 usize isize f32 f64 bool char str'),
    cmt: [CMT_SL, CMT_BLOCK],
    str: [STR_DQ, S(/'(?:\\.|[^'\\\n])'/)],
  },
  php: {
    kw: W('abstract and array as break case catch class clone const continue declare default do echo else elseif empty extends final finally fn for foreach function global if implements include include_once instanceof interface isset namespace new or print private protected public require require_once return static switch throw trait try unset use var while yield'),
    lit: W('true false null TRUE FALSE NULL'),
    bi: W('count strlen array_map array_filter in_array str_replace json_encode json_decode'),
    cmt: [CMT_SL, CMT_HASH, CMT_BLOCK],
    str: [STR_DQ, STR_SQ],
    extra: [S(/\$[A-Za-z_]\w*/), 'b'],
  },
  ruby: {
    kw: W('alias and begin break case class def do else elsif end ensure for if in module next not or redo rescue retry return self super then undef unless until when while yield'),
    lit: W('true false nil'),
    bi: W('puts print require include attr_accessor attr_reader attr_writer lambda proc'),
    cmt: [CMT_HASH],
    str: [STR_DQ, STR_SQ],
    extra: [S(/:[A-Za-z_]\w*|@@?[A-Za-z_]\w*/), 'b'],
  },
  kotlin: {
    kw: W('as break class continue do else for fun if in interface is object package return super this throw try typealias val var when while by catch finally import init constructor override open data sealed abstract private public protected internal companion suspend lateinit'),
    lit: W('true false null'),
    bi: W('println print String Int Long Double Float Boolean List Map Set Unit Any'),
    cmt: [CMT_SL, CMT_BLOCK],
    str: [STR_TDQ, STR_DQ, STR_SQ],
    extra: [S(/@[A-Za-z_]\w*/), 'b'],
  },
  swift: {
    kw: W('associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public rethrows static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as catch is super self Self throw throws try'),
    lit: W('true false nil'),
    bi: W('print String Int Double Float Bool Array Dictionary Set Any'),
    cmt: [CMT_SL, CMT_BLOCK],
    str: [STR_DQ],
  },
  sql: {
    ci: true,
    kw: W('select from where and or not insert into values update set delete create table alter drop index view join inner left right outer full on group by order having limit offset as distinct union all is in like between exists case when then else end primary key foreign references default unique check constraint int integer varchar char text date timestamp boolean float double decimal serial asc desc add column database use begin commit rollback with'),
    lit: W('null true false'),
    bi: W('count sum avg min max now coalesce length upper lower round'),
    cmt: [CMT_DASH, CMT_BLOCK],
    str: [STR_RAW_SQ, STR_DQ],
  },
  bash: {
    kw: W('if then else elif fi for while until do done case esac function in return exit export local select time'),
    lit: W('true false'),
    bi: W('echo cd ls cat grep sed awk sudo apt git npm pip python node curl chmod mkdir rm cp mv source read printf test'),
    cmt: [CMT_HASH],
    str: [STR_DQ, STR_RAW_SQ],
    extra: [S(/\$\{[^}\n]*\}|\$[A-Za-z_]\w*|\$[0-9?@#*!$]/), 'b'],
  },
  yaml: {
    kw: new Set(),
    lit: W('true false null yes no ~ True False Null'),
    bi: new Set(),
    cmt: [CMT_HASH],
    str: [STR_DQ, STR_SQ],
    keys: true,
    extra: [S(/[&*][A-Za-z_][\w-]*/), 'b'],
  },
  json: {
    kw: new Set(),
    lit: W('true false null'),
    bi: new Set(),
    cmt: [],
    str: [S(/"(?:\\.|[^"\\\n])*"?/)],
    keys: true,
  },
};

const NUM = S(/\b0[xX][0-9a-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[fFlLuU]*\b/);
const NEVER = '(?!)';
const EMPTY_DEF: LangDef = { kw: new Set(), lit: new Set(), bi: new Set(), cmt: [], str: [] };
const RE_CACHE: Record<string, RegExp> = {};

function scanner(lang: string): RegExp {
  const cached = RE_CACHE[lang];
  if (cached) return cached;
  const d = DEFS[lang] ?? EMPTY_DEF;
  const src = `(${d.cmt.length ? d.cmt.join('|') : NEVER})|(${d.str.length ? d.str.join('|') : NEVER})|(${d.extra ? d.extra[0] : NEVER})|(${NUM})|([A-Za-z_$][\\w$]*)|([\\s\\S])`;
  return (RE_CACHE[lang] = new RegExp(src, 'g'));
}

function tokenizeGeneric(code: string, lang: string): TokenDef[] {
  const d = DEFS[lang] ?? EMPTY_DEF;
  const re = new RegExp(scanner(lang).source, 'g');
  const out: TokenDef[] = [];
  const push = (cls: string, text: string) => {
    const last = out[out.length - 1];
    if (last && last[0] === cls) last[1] += text;
    else out.push([cls, text]);
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m[1] !== undefined) push('c', m[1]);
    else if (m[2] !== undefined) {
      let cls = 's';
      if (d.keys && /^\s*:/.test(code.slice(re.lastIndex, re.lastIndex + 40))) cls = 't';
      push(cls, m[2]);
    } else if (m[3] !== undefined && d.extra) push(d.extra[1], m[3]);
    else if (m[4] !== undefined) push('n', m[4]);
    else if (m[5] !== undefined) {
      const w = m[5];
      const after = code.slice(re.lastIndex, re.lastIndex + 40);
      let cls = '';
      if (d.kw.has(d.ci ? w.toLowerCase() : w)) cls = 'k';
      else if (d.lit.has(w) || d.bi.has(w)) cls = 'b';
      else if (/^\s*\(/.test(after) || (lang === 'rust' && /^!\s*[([{]/.test(after))) cls = 'f';
      else if (d.keys && /^\s*:/.test(after)) cls = 't';
      else if (/^[A-Z][A-Za-z0-9_]*[a-z][A-Za-z0-9_]*$/.test(w)) cls = 't';
      push(cls, w);
    } else push('', m[6] ?? '');
  }
  return out;
}

function tokenizeMarkup(code: string): TokenDef[] {
  const re = /<!--[\s\S]*?(?:-->|$)|<![A-Za-z][^>]*>?|<\/?[A-Za-z][\w:-]*|\/?>|"[^"]*"?|'[^']*'?|[A-Za-z_:@][\w:.@-]*(?=\s*=)|&[A-Za-z0-9#]+;|[\s\S]/g;
  const out: TokenDef[] = [];
  const push = (cls: string, text: string) => {
    const last = out[out.length - 1];
    if (last && last[0] === cls) last[1] += text;
    else out.push([cls, text]);
  };
  let inTag = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const t = m[0];
    if (t.startsWith('<!--')) push('c', t);
    else if (t.startsWith('<!')) push('b', t);
    else if (/^<\/?[A-Za-z]/.test(t)) {
      const p = t.startsWith('</') ? '</' : '<';
      push('p', p);
      push('k', t.slice(p.length));
      inTag = true;
    } else if (inTag && /^\/?>$/.test(t)) {
      push('p', t);
      inTag = false;
    } else if (!inTag && (t[0] === '"' || t[0] === "'") && t.length > 1) {
      re.lastIndex = m.index + 1;
      push('', t[0]);
    } else if (inTag && (t[0] === '"' || t[0] === "'")) push('s', t);
    else if (inTag && /^[A-Za-z_:@]/.test(t) && t.length > 0 && /^[\w:.@-]+$/.test(t)) push('f', t);
    else if (!inTag && t[0] === '&' && t.length > 2) push('n', t);
    else push('', t);
  }
  return out;
}

function tokenizeCss(code: string): TokenDef[] {
  const re = /\/\*[\s\S]*?(?:\*\/|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|@[A-Za-z-]+|#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr|pt)?\b|![a-z]+|[A-Za-z_-][\w-]*(?=\s*:)|[.#][A-Za-z_-][\w-]*|[\s\S]/g;
  const out: TokenDef[] = [];
  const push = (cls: string, text: string) => {
    const last = out[out.length - 1];
    if (last && last[0] === cls) last[1] += text;
    else out.push([cls, text]);
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const t = m[0];
    if (t.startsWith('/*')) push('c', t);
    else if (t[0] === '"' || t[0] === "'") push('s', t);
    else if (t[0] === '@' || t[0] === '!') push('k', t);
    else if (/^#[0-9a-fA-F]{3,8}$/.test(t) || /^-?\d*\.?\d+(?:[a-z%]*)$/.test(t)) push('n', t);
    else if (/^[.#]/.test(t) && t.length > 1) push('t', t);
    else if (/^[A-Za-z_-][\w-]*$/.test(t) && /^\s*:/.test(code.slice(re.lastIndex, re.lastIndex + 8))) push('f', t);
    else push('', t);
  }
  return out;
}

const CLASS_MAP: Record<string, string> = {
  k: 'token-keyword',
  s: 'token-string',
  c: 'token-comment',
  n: 'token-number',
  b: 'token-builtin',
  f: 'token-function',
  t: 'token-type',
  p: 'token-punct',
};

export function highlightCode(code: string, lang: string): string {
  const l = lang.toLowerCase();
  let tokens: TokenDef[];
  if (l === 'html' || l === 'xml') tokens = tokenizeMarkup(code);
  else if (l === 'css') tokens = tokenizeCss(code);
  else if (DEFS[l]) tokens = tokenizeGeneric(code, l);
  else tokens = [['', code]];

  return tokens
    .map(([cls, txt]) => {
      const escaped = esc(txt);
      const spanClass = CLASS_MAP[cls];
      return spanClass ? `<span class="${spanClass}">${escaped}</span>` : escaped;
    })
    .join('');
}

export function renderCodeBlock(info: string, code: string): string {
  const raw = String(info || '').trim();
  const [first = ''] = raw.split(/\s+/);
  const lang = first.toLowerCase().replace(/^[{.]+|[}]+$/g, '') || 'text';
  const label = lang.charAt(0).toUpperCase() + lang.slice(1);
  const trimmed = String(code || '').replace(/\s+$/, '');
  const lines = trimmed.split('\n');
  const lineCount = lines.length;
  const highlighted = highlightCode(trimmed, lang);

  return `
<figure class="code-canvas" data-lang="${esc(lang)}" data-lines="${lineCount}">
  <figcaption class="code-canvas-bar">
    <span class="code-canvas-lang">${esc(label)}</span>
    <span class="code-canvas-meta">${lineCount} baris</span>
    <span class="code-canvas-actions">
      <button type="button" class="code-canvas-btn" data-action="copy" data-code="${esc(trimmed)}" aria-label="Salin kode">
        Salin
      </button>
    </span>
  </figcaption>
  <pre class="code-canvas-pre" tabindex="0"><code>${highlighted}</code></pre>
</figure>`.trim();
}

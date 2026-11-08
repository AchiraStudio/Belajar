'use strict';
/* Canvas coding: blok kode pada catatan/chat tampil sebagai kartu "canvas" — label bahasa, nama berkas,
   nomor baris, warna sintaks, Salin / Bungkus / Perbesar / Unduh, dan lipat otomatis untuk kode panjang.
   Tanpa pustaka luar: pewarna sintaks ditulis sendiri (pemindai berbasis regex per bahasa).
   API: window.CodeCanvas.render(info, code) -> string HTML. Interaksi lewat delegasi event di document. */
(() => {
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ------------------------------------------------------------------ nama bahasa
  const ALIAS = {
    py: 'python', python3: 'python', js: 'javascript', node: 'javascript', mjs: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript', 'c++': 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', 'c#': 'csharp', cs: 'csharp',
    golang: 'go', rs: 'rust', rb: 'ruby', kt: 'kotlin', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
    terminal: 'bash', yml: 'yaml', htm: 'html', xhtml: 'html', svg: 'xml', vue: 'html', txt: 'text', plain: 'text',
    plaintext: 'text', output: 'text', md: 'markdown',
  };
  const LABEL = {
    python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', java: 'Java', c: 'C', cpp: 'C++', csharp: 'C#',
    go: 'Go', rust: 'Rust', php: 'PHP', ruby: 'Ruby', kotlin: 'Kotlin', swift: 'Swift', sql: 'SQL', bash: 'Bash',
    html: 'HTML', xml: 'XML', css: 'CSS', json: 'JSON', yaml: 'YAML', markdown: 'Markdown', text: 'Teks',
  };
  const EXT = {
    python: 'py', javascript: 'js', typescript: 'ts', java: 'java', c: 'c', cpp: 'cpp', csharp: 'cs', go: 'go', rust: 'rs',
    php: 'php', ruby: 'rb', kotlin: 'kt', swift: 'swift', sql: 'sql', bash: 'sh', html: 'html', xml: 'xml', css: 'css',
    json: 'json', yaml: 'yaml', markdown: 'md', text: 'txt',
  };
  const canon = (l) => {
    const k = String(l || '').toLowerCase().replace(/^[{.]+|[}]+$/g, '');
    return ALIAS[k] || k;
  };

  // ------------------------------------------------------------------ definisi bahasa (pemindai generik)
  const S = (re) => re.source;
  const CMT_SL = S(/\/\/.*/);
  const CMT_BLOCK = S(/\/\*[\s\S]*?(?:\*\/|$)/);
  const CMT_HASH = S(/#.*/);
  const CMT_DASH = S(/--.*/);
  const STR_DQ = S(/"(?:\\.|[^"\\\n])*"?/);
  const STR_SQ = S(/'(?:\\.|[^'\\\n])*'?/);
  const STR_BT = S(/`(?:\\[\s\S]|[^`\\])*`?/);
  const STR_TDQ = S(/"""[\s\S]*?(?:"""|$)/);
  const STR_TSQ = S(/'''[\s\S]*?(?:'''|$)/);
  const STR_RAW_SQ = S(/'[^'\n]*'?/);
  const W = (s) => new Set(s.split(/\s+/).filter(Boolean));

  const DEFS = {
    python: { kw: W('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'), lit: W('True False None'), bi: W('print len range int str float list dict set tuple input open type isinstance enumerate zip map filter sum min max abs sorted super self cls bool bytes round any all'), cmt: [CMT_HASH], str: [STR_TDQ, STR_TSQ, STR_DQ, STR_SQ], extra: [S(/@[A-Za-z_][\w.]*/), 'b'] },
    javascript: { kw: W('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await static get set from as'), lit: W('true false null undefined NaN Infinity'), bi: W('console document window Math JSON Object Array Promise Map Set require module process String Number Boolean Date RegExp Error'), cmt: [CMT_SL, CMT_BLOCK], str: [STR_BT, STR_DQ, STR_SQ] },
    typescript: { kw: W('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await static get set from as interface type enum implements private public protected readonly abstract namespace declare keyof'), lit: W('true false null undefined NaN Infinity'), bi: W('console document window Math JSON Object Array Promise Map Set require module string number boolean any never unknown void'), cmt: [CMT_SL, CMT_BLOCK], str: [STR_BT, STR_DQ, STR_SQ] },
    java: { kw: W('abstract assert break case catch class continue default do else enum extends final finally for if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try void volatile while var record'), lit: W('true false null'), bi: W('int long double float boolean char byte short String System Math List Map Set ArrayList HashMap Integer Object'), cmt: [CMT_SL, CMT_BLOCK], str: [STR_DQ, STR_SQ], extra: [S(/@[A-Za-z_]\w*/), 'b'] },
    c: { kw: W('auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while'), lit: W('NULL true false'), bi: W('printf scanf malloc free sizeof strlen strcpy size_t FILE'), cmt: [CMT_SL, CMT_BLOCK], str: [STR_DQ, STR_SQ], extra: [S(/#[ \t]*(?:include|define|ifdef|ifndef|endif|if|else|elif|pragma|undef)\b.*/), 'b'] },
    cpp: { kw: W('auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while bool class namespace template typename using new delete public private protected virtual override nullptr this try catch throw constexpr final'), lit: W('NULL true false nullptr'), bi: W('std cout cin endl string vector map set cerr size_t'), cmt: [CMT_SL, CMT_BLOCK], str: [STR_DQ, STR_SQ], extra: [S(/#[ \t]*(?:include|define|ifdef|ifndef|endif|if|else|elif|pragma|undef)\b.*/), 'b'] },
    csharp: { kw: W('abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new object operator out override params private protected public readonly ref return sbyte sealed short sizeof static string struct switch this throw try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while async await'), lit: W('true false null'), bi: W('Console String List Dictionary Math'), cmt: [CMT_SL, CMT_BLOCK], str: [S(/@"(?:""|[^"])*"?/), STR_DQ, STR_SQ] },
    go: { kw: W('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'), lit: W('true false nil iota'), bi: W('fmt Println Printf Sprintf len make append cap new panic string int int64 float64 bool byte error rune'), cmt: [CMT_SL, CMT_BLOCK], str: [STR_BT, STR_DQ, STR_SQ] },
    rust: { kw: W('as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while'), lit: W('true false None Some Ok Err'), bi: W('Vec String Option Result Box i8 i16 i32 i64 u8 u16 u32 u64 usize isize f32 f64 bool char str'), cmt: [CMT_SL, CMT_BLOCK], str: [STR_DQ, S(/'(?:\\.|[^'\\\n])'/)] },
    php: { kw: W('abstract and array as break case catch class clone const continue declare default do echo else elseif empty extends final finally fn for foreach function global if implements include include_once instanceof interface isset namespace new or print private protected public require require_once return static switch throw trait try unset use var while yield'), lit: W('true false null TRUE FALSE NULL'), bi: W('count strlen array_map array_filter in_array str_replace json_encode json_decode'), cmt: [CMT_SL, CMT_HASH, CMT_BLOCK], str: [STR_DQ, STR_SQ], extra: [S(/\$[A-Za-z_]\w*/), 'b'] },
    ruby: { kw: W('alias and begin break case class def do else elsif end ensure for if in module next not or redo rescue retry return self super then undef unless until when while yield'), lit: W('true false nil'), bi: W('puts print require include attr_accessor attr_reader attr_writer lambda proc'), cmt: [CMT_HASH], str: [STR_DQ, STR_SQ], extra: [S(/:[A-Za-z_]\w*|@@?[A-Za-z_]\w*/), 'b'] },
    kotlin: { kw: W('as break class continue do else for fun if in interface is object package return super this throw try typealias val var when while by catch finally import init constructor override open data sealed abstract private public protected internal companion suspend lateinit'), lit: W('true false null'), bi: W('println print String Int Long Double Float Boolean List Map Set Unit Any'), cmt: [CMT_SL, CMT_BLOCK], str: [STR_TDQ, STR_DQ, STR_SQ], extra: [S(/@[A-Za-z_]\w*/), 'b'] },
    swift: { kw: W('associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public rethrows static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as catch is super self Self throw throws try'), lit: W('true false nil'), bi: W('print String Int Double Float Bool Array Dictionary Set Any'), cmt: [CMT_SL, CMT_BLOCK], str: [STR_DQ] },
    sql: { ci: true, kw: W('select from where and or not insert into values update set delete create table alter drop index view join inner left right outer full on group by order having limit offset as distinct union all is in like between exists case when then else end primary key foreign references default unique check constraint int integer varchar char text date timestamp boolean float double decimal serial asc desc add column database use begin commit rollback with'), lit: W('null true false'), bi: W('count sum avg min max now coalesce length upper lower round'), cmt: [CMT_DASH, CMT_BLOCK], str: [STR_RAW_SQ, STR_DQ] },
    bash: { kw: W('if then else elif fi for while until do done case esac function in return exit export local select time'), lit: W('true false'), bi: W('echo cd ls cat grep sed awk sudo apt git npm pip python node curl chmod mkdir rm cp mv source read printf test'), cmt: [CMT_HASH], str: [STR_DQ, STR_RAW_SQ], extra: [S(/\$\{[^}\n]*\}|\$[A-Za-z_]\w*|\$[0-9?@#*!$]/), 'b'] },
    yaml: { kw: new Set(), lit: W('true false null yes no ~ True False Null'), bi: new Set(), cmt: [CMT_HASH], str: [STR_DQ, STR_SQ], keys: true, extra: [S(/[&*][A-Za-z_][\w-]*/), 'b'] },
    json: { kw: new Set(), lit: W('true false null'), bi: new Set(), cmt: [], str: [S(/"(?:\\.|[^"\\\n])*"?/)], keys: true },
  };
  const NUM = S(/\b0[xX][0-9a-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[fFlLuU]*\b/);
  const NEVER = '(?!)';
  const RE_CACHE = {};

  function scanner(lang) {
    if (RE_CACHE[lang]) return RE_CACHE[lang];
    const d = DEFS[lang];
    const src = `(${d.cmt.length ? d.cmt.join('|') : NEVER})|(${d.str.length ? d.str.join('|') : NEVER})|(${d.extra ? d.extra[0] : NEVER})|(${NUM})|([A-Za-z_$][\\w$]*)|([\\s\\S])`;
    return (RE_CACHE[lang] = new RegExp(src, 'g'));
  }

  function tokenizeGeneric(code, lang) {
    const d = DEFS[lang];
    const re = new RegExp(scanner(lang).source, 'g');
    const out = [];
    const push = (cls, text) => {
      const last = out[out.length - 1];
      if (last && last[0] === cls) last[1] += text; else out.push([cls, text]);
    };
    let m;
    while ((m = re.exec(code))) {
      if (m[1] !== undefined) push('c', m[1]);
      else if (m[2] !== undefined) {
        let cls = 's';
        if (d.keys && /^\s*:/.test(code.slice(re.lastIndex, re.lastIndex + 40))) cls = 't';
        push(cls, m[2]);
      } else if (m[3] !== undefined) push(d.extra[1], m[3]);
      else if (m[4] !== undefined) push('n', m[4]);
      else if (m[5] !== undefined) {
        const w = m[5];
        const after = code.slice(re.lastIndex, re.lastIndex + 40);
        let cls = '';
        if (d.kw.has(d.ci ? w.toLowerCase() : w)) cls = 'k';
        else if (d.lit.has(w)) cls = 'b';
        else if (d.bi.has(w)) cls = 'b';
        else if (/^\s*\(/.test(after) || (lang === 'rust' && /^!\s*[([{]/.test(after))) cls = 'f';
        else if (d.keys && /^\s*:/.test(after)) cls = 't';
        else if (/^[A-Z][A-Za-z0-9_]*[a-z][A-Za-z0-9_]*$/.test(w)) cls = 't';
        push(cls, w);
      } else push('', m[6]);
    }
    return out;
  }

  function tokenizeMarkup(code) {
    const re = /<!--[\s\S]*?(?:-->|$)|<![A-Za-z][^>]*>?|<\/?[A-Za-z][\w:-]*|\/?>|"[^"]*"?|'[^']*'?|[A-Za-z_:@][\w:.@-]*(?=\s*=)|&[A-Za-z0-9#]+;|[\s\S]/g;
    const out = [];
    const push = (cls, text) => { const last = out[out.length - 1]; if (last && last[0] === cls) last[1] += text; else out.push([cls, text]); };
    let inTag = false;
    let m;
    while ((m = re.exec(code))) {
      const t = m[0];
      if (t.startsWith('<!--')) push('c', t);
      else if (t.startsWith('<!')) push('b', t);
      else if (/^<\/?[A-Za-z]/.test(t)) { const p = t.startsWith('</') ? '</' : '<'; push('p', p); push('k', t.slice(p.length)); inTag = true; }
      else if (inTag && /^\/?>$/.test(t)) { push('p', t); inTag = false; }
      else if (!inTag && (t[0] === '"' || t[0] === "'") && t.length > 1) { re.lastIndex = m.index + 1; push('', t[0]); }   // kutip di teks biasa bukan string
      else if (inTag && (t[0] === '"' || t[0] === "'")) push('s', t);
      else if (inTag && /^[A-Za-z_:@]/.test(t) && t.length > 0 && /^[\w:.@-]+$/.test(t)) push('f', t);
      else if (!inTag && t[0] === '&' && t.length > 2) push('n', t);
      else push('', t);
    }
    return out;
  }

  function tokenizeCss(code) {
    const re = /\/\*[\s\S]*?(?:\*\/|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|@[A-Za-z-]+|#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr|pt)?\b|![a-z]+|[A-Za-z_-][\w-]*(?=\s*:)|[.#][A-Za-z_-][\w-]*|[\s\S]/g;
    const out = [];
    const push = (cls, text) => { const last = out[out.length - 1]; if (last && last[0] === cls) last[1] += text; else out.push([cls, text]); };
    let m;
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

  const MAX_HL = 60000;                                   // kode sangat besar: tanpa pewarnaan (cegah macet)
  function tokenize(lang, code) {
    if (code.length > MAX_HL) return [['', code]];
    if (lang === 'html' || lang === 'xml') return tokenizeMarkup(code);
    if (lang === 'css') return tokenizeCss(code);
    if (DEFS[lang]) return tokenizeGeneric(code, lang);
    return [['', code]];
  }

  // ------------------------------------------------------------------ tebak bahasa (fence tanpa nama bahasa)
  const GUESS = [
    ['python', [/^\s*def \w+\(.*\):/m, /^\s*(?:import \w+|from \S+ import)/m, /\bprint\(/, /\belif\b/, /\bself\b/, /\b(?:None|True|False)\b/]],
    ['javascript', [/\bfunction\b/, /\b(?:const|let|var) \w+/, /=>/, /console\.log/, /require\(/, /===/, /document\./]],
    ['java', [/public (?:static )?(?:class|void)/, /System\.out/, /String\[\] args/, /\bnew \w+\(/]],
    ['cpp', [/std::/, /\bcout\b/, /#include\s*<(?:iostream|vector|string)>/, /using namespace std/]],
    ['c', [/#include\s*<\w+\.h>/, /\bprintf\(/, /\bint main\(/, /\bscanf\(/]],
    ['csharp', [/Console\.Write/, /using System/, /\bnamespace \w+/]],
    ['go', [/^package \w+/m, /\bfunc \w*\(/, /\bfmt\./, /:=/]],
    ['rust', [/\bfn \w+\(/, /\blet mut\b/, /println!/, /\bimpl\b/]],
    ['php', [/<\?php/, /\$\w+\s*=/, /\becho\b/]],
    ['sql', [/\bSELECT\b[\s\S]+\bFROM\b/i, /\bINSERT INTO\b/i, /\bCREATE TABLE\b/i, /\bWHERE\b/, /\bJOIN\b/]],
    ['html', [/<!DOCTYPE/i, /<html/i, /<div[\s>]/i, /<\/\w+>/, /<(?:p|a|ul|li|span|body|head)[\s>]/i]],
    ['css', [/[.#]?[\w-]+\s*\{[^}]*:[^}]*;/, /@media/, /\b(?:margin|padding|color|display)\s*:/]],
    ['bash', [/^\s*\$ /m, /^#!\/bin\/(?:ba)?sh/, /\b(?:sudo|apt|chmod|grep|curl|git|npm|pip)\b/, /\becho\b/]],
  ];
  function guessLang(code) {
    if (/^\s*[[{]/.test(code) && /"[\w-]+"\s*:/.test(code)) return 'json';
    let best = '';
    let top = 0;
    for (const [lang, pats] of GUESS) {
      const score = pats.reduce((a, p) => a + (p.test(code) ? 1 : 0), 0);
      if (score > top) { best = lang; top = score; }
    }
    return top >= 2 ? best : '';
  }

  // ------------------------------------------------------------------ HTML kartu
  const COLLAPSE_AT = 26;
  const FILE_RE = /^[\w.\-]+\.[A-Za-z0-9]{1,8}$/;

  function linesHtml(tokens) {
    const lines = [''];
    for (const [cls, text] of tokens) {
      text.split('\n').forEach((part, i) => {
        if (i > 0) lines.push('');
        if (part) lines[lines.length - 1] += cls ? `<span class="t-${cls}">${esc(part)}</span>` : esc(part);
      });
    }
    return lines;
  }

  function parseInfo(info) {
    const raw = String(info || '').trim();
    const [first = '', ...rest] = raw.split(/\s+/);
    let title = rest.join(' ');
    const m = title.match(/title\s*=\s*["']?([^"'}]+)/);
    if (m) title = m[1];
    return { raw: first.replace(/^[{.]+|[}]+$/g, ''), title: title.replace(/[{}]/g, '').trim() };
  }

  function render(info, code) {
    const { raw, title } = parseInfo(info);
    const text = String(code || '').replace(/\s+$/, '');
    let lang = canon(raw);
    let guessed = false;
    if (!lang || (!DEFS[lang] && !['html', 'xml', 'css', 'text', 'markdown'].includes(lang) && !LABEL[lang])) {
      const g = guessLang(text);
      if (g) { lang = g; guessed = true; } else if (!lang) lang = 'text';
    }
    const label = (lang === 'text' && !raw) ? 'Kode' : (LABEL[lang] || raw || 'Kode');
    const lines = linesHtml(tokenize(lang, text));
    const n = lines.length;
    const ext = EXT[lang] || 'txt';
    const fileName = FILE_RE.test(title) ? title : '';
    const long = n >= COLLAPSE_AT;
    const body = lines.map((l) => `<span class="cl">${l}</span>`).join('');
    return `<figure class="code-canvas${long ? ' cc-collapsed' : ''}" data-lang="${esc(lang)}" data-ext="${esc(ext)}" data-name="${esc(fileName)}" data-lines="${n}">`
      + `<figcaption class="cc-bar"><span class="cc-lang">${esc(label)}${guessed ? '<i title="Bahasa ditebak otomatis">?</i>' : ''}</span>`
      + (title ? `<span class="cc-title">${esc(title)}</span>` : '')
      + `<span class="cc-meta">${n} baris</span>`
      + '<span class="cc-actions">'
      + '<button type="button" class="cc-btn" data-cc="copy">Salin</button>'
      + '<button type="button" class="cc-btn" data-cc="wrap" aria-pressed="false">Bungkus</button>'
      + '<button type="button" class="cc-btn" data-cc="save">Unduh</button>'
      + '<button type="button" class="cc-btn" data-cc="full" aria-pressed="false">Perbesar</button>'
      + '</span></figcaption>'
      + `<pre class="cc-pre" tabindex="0"><code>${body}</code></pre>`
      + (long ? `<button type="button" class="cc-more" data-cc="more" data-n="${n}">Tampilkan semua (${n} baris)</button>` : '')
      + '</figure>';
  }

  // ------------------------------------------------------------------ interaksi (delegasi event)
  const codeOf = (fig) => Array.from(fig.querySelectorAll('.cl')).map((l) => l.textContent).join('\n');

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.append(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy gagal')); } catch (e) { reject(e); } finally { ta.remove(); }
    });
  }
  function flash(btn, text) {
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.textContent = text;
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.textContent = btn.dataset.label; }, 1600);
  }
  function syncLock() {
    document.body.classList.toggle('cc-lock', !!document.querySelector('.code-canvas.cc-full'));
  }
  function closeFull() {
    document.querySelectorAll('.code-canvas.cc-full').forEach((f) => {
      f.classList.remove('cc-full'); f.removeAttribute('role'); f.removeAttribute('aria-modal');
      const b = f.querySelector('[data-cc="full"]'); if (b) { b.textContent = 'Perbesar'; b.setAttribute('aria-pressed', 'false'); }
    });
    syncLock();
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('[data-cc]');
    if (!btn) return;
    const fig = btn.closest('.code-canvas');
    if (!fig) return;
    const act = btn.getAttribute('data-cc');
    if (act === 'copy') {
      copyText(codeOf(fig)).then(() => flash(btn, 'Disalin ✓'), () => flash(btn, 'Gagal menyalin'));
    } else if (act === 'wrap') {
      const on = fig.classList.toggle('cc-wrap');
      btn.setAttribute('aria-pressed', String(on));
    } else if (act === 'full') {
      const on = !fig.classList.contains('cc-full');
      closeFull();
      if (on) {
        fig.classList.add('cc-full'); fig.setAttribute('role', 'dialog'); fig.setAttribute('aria-modal', 'true');
        btn.textContent = 'Tutup'; btn.setAttribute('aria-pressed', 'true');
        const pre = fig.querySelector('.cc-pre'); if (pre) pre.focus();
      }
      syncLock();
    } else if (act === 'save') {
      const name = fig.getAttribute('data-name') || `kode.${fig.getAttribute('data-ext') || 'txt'}`;
      const url = URL.createObjectURL(new Blob([codeOf(fig) + '\n'], { type: 'text/plain;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } else if (act === 'more') {
      const collapsed = fig.classList.toggle('cc-collapsed');
      btn.textContent = collapsed ? `Tampilkan semua (${btn.getAttribute('data-n')} baris)` : 'Ciutkan';
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.querySelector('.code-canvas.cc-full')) closeFull(); });

  window.CodeCanvas = { render, tokenize, guessLang, canon, LABEL, EXT, closeFull };
})();

'use strict';
(() => {
  // ====================================================================== util DOM
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function add(el, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false || k === true) continue; // nilai kosong tidak pernah menjadi teks
      el.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
  }
  /** Ganti isi elemen. Pengganti replaceChildren bawaan, yang mengubah false/array menjadi teks. */
  function fill(el, ...kids) { el.replaceChildren(); add(el, kids); return el; }
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    let value;
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'value') value = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = true;
      else el.setAttribute(k, v === true ? '' : v);
    }
    add(el, kids);
    if (value !== undefined) el.value = value;
    return el;
  }
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
    add(el, kids);
    return el;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* diblokir */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* diblokir */ } },
  };

  const ICONS = {
    home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    book: 'M5 3h14v15H7a2 2 0 0 0-2 2z|M5 20a2 2 0 0 0 2 2h12',
    quiz: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z|M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.8|M12 17h.01',
    chart: 'M5 21v-8|M12 21V4|M19 21v-12',
    flame: 'M12 2.5c.8 3.4 4.5 5 4.5 9.7a4.5 4.5 0 0 1-9 0c0-1.7.6-2.8 1.6-3.9.1 1.3.8 2 1.6 2.2-.4-3 .2-5.6 1.3-8z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    x: 'M6 6l12 12|M18 6L6 18',
    plus: 'M12 5v14|M5 12h14',
    upload: 'M12 16V4|M7 9l5-5 5 5|M4 20h16',
    download: 'M12 4v12|M7 11l5 5 5-5|M4 20h16',
    edit: 'M4 20h4L19 9l-4-4L4 16z',
    trash: 'M4 7h16|M9 7V4h6v3|M6 7l1 13h10l1-13',
    print: 'M7 9V3h10v6|M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2|M7 14h10v7H7z',
    clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z|M12 7v5l3 2',
    back: 'M19 12H5|M11 6l-6 6 6 6',
    next: 'M5 12h14|M13 6l6 6-6 6',
    chev: 'M9 6l6 6-6 6',
    refresh: 'M20 11a8 8 0 1 0-2.3 6|M20 4v7h-7',
    spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
    search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z|M20 20l-4-4',
    sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z|M12 2v2|M12 20v2|M4.9 4.9l1.4 1.4|M17.7 17.7l1.4 1.4|M2 12h2|M20 12h2|M4.9 19.1l1.4-1.4|M17.7 6.3l1.4-1.4',
    moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z',
    auto: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z|M12 3v18',
    logout: 'M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4|M16 8l4 4-4 4|M20 12H9',
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z|M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
    folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
    trophy: 'M7 4h10v5a5 5 0 0 1-10 0z|M7 6H4v1a3 3 0 0 0 3 3|M17 6h3v1a3 3 0 0 1-3 3|M12 14v4|M8 20h8',
    target: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z|M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z',
    chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    send: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z',
    bot: 'M12 2a2 2 0 0 1 2 2v2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4V4a2 2 0 0 1 2-2z|M9 11h.01|M15 11h.01|M9 15h6',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8z',
    copy: 'M8 4v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2z|M4 8H3a1 1 0 0 0-1 1v12a2 2 0 0 0 2 2h12a1 1 0 0 0 1-1v-1',
    bulb: 'M9 18h6|M10 22h4|M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7z',
    reply: 'M9 17l-5-5 5-5|M4 12h11a5 5 0 0 1 5 5v1',
    down: 'M6 9l6 6 6-6',
  };
  function ico(name, size = 18) {
    const svg = s('svg', { class: 'i', viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    for (const d of (ICONS[name] || '').split('|')) svg.append(s('path', { d }));
    return svg;
  }

  function toast(msg) {
    const t = h('div', { class: 'toast' }, msg);
    $('#toasts').append(t);
    setTimeout(() => t.remove(), 4200);
  }

  // ----- tema & ukuran huruf
  const THEMES = [['auto', 'Otomatis', 'auto'], ['light', 'Terang', 'sun'], ['dark', 'Gelap', 'moon']];
  let themeReady = false;
  let themeTimer = 0;
  function applyTheme(t) {
    const root = document.documentElement;
    // Peralihan warna yang halus, tetapi bukan saat memuat pertama kali dan bukan bila pengguna meminta gerak minim.
    if (themeReady && !reduceMotion()) {
      root.classList.add('theme-anim');
      clearTimeout(themeTimer);
      themeTimer = setTimeout(() => root.classList.remove('theme-anim'), 380);
    }
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
    else root.removeAttribute('data-theme');
    store.set('belajar-theme', t);
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#F3F2FA';
    themeReady = true;
    document.dispatchEvent(new CustomEvent('belajar:theme', { detail: { theme: t, dark: effectiveDark() } }));
  }
  const getTheme = () => store.get('belajar-theme', 'auto');
  /** Apakah tampilan saat ini gelap (pilihan pengguna, atau mengikuti sistem pada mode Otomatis). */
  function effectiveDark() {
    const t = getTheme();
    return t === 'dark' || (t !== 'light' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  const cycleTheme = () => { const i = THEMES.findIndex((x) => x[0] === getTheme()); applyTheme(THEMES[(i + 1) % THEMES.length][0]); };
  // Mode Otomatis harus ikut berubah saat sistem berganti terang/gelap, tanpa memuat ulang.
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = () => { if (getTheme() === 'auto') applyTheme('auto'); };
    if (mq.addEventListener) mq.addEventListener('change', follow); else if (mq.addListener) mq.addListener(follow);
  }
  function applyFont(px) {
    px = Math.max(15, Math.min(23, px));
    document.documentElement.style.setProperty('--fs', px + 'px');
    store.set('belajar-fs', String(px));
    return px;
  }
  const getFont = () => Number(store.get('belajar-fs', 0)) || 0;
  // Huruf baca: "lembut" (Nunito, bawaan) atau "serif" (Literata). Disimpan di perangkat.
  const getReadFont = () => (store.get('belajar-read', 'soft') === 'serif' ? 'serif' : 'soft');
  function applyReadFont(v) {
    if (v === 'serif') document.documentElement.setAttribute('data-read', 'serif'); else document.documentElement.removeAttribute('data-read');
    store.set('belajar-read', v === 'serif' ? 'serif' : 'soft');
  }

  // ----- gaya catatan: satu definisi untuk dialog unggah, "Buat ulang catatan", dan Pengaturan.
  // Kategori Detail dikerjakan model Grok di backend (lihat pipeline.DETAIL_STYLES).
  const NOTE_STYLES = [
    { group: 'Umum', items: [
      ['ringkas', 'Ringkas', 'Poin-poin inti yang padat.'],
      ['cornell', 'Cornell', 'Kolom isyarat, catatan, dan ringkasan.'],
      ['sederhana', 'Sederhana (bahasa awam + contoh)', 'Penjelasan berbahasa sehari-hari lengkap dengan contoh.'],
    ] },
    { group: 'Detail (model Grok)', items: [
      ['detail', 'Detail (komprehensif)', 'Catatan lengkap dan mendalam, bebas format.'],
      ['sentence', 'Sentence Method', 'Kalimat lengkap yang bernomor dan berurutan.'],
      ['charting', 'Charting Method', 'Tabel untuk mengelompokkan dan membandingkan.'],
      ['outline', 'Outline Notes', 'Kerangka hierarkis bertingkat dari topik ke rincian.'],
      ['worked', 'Worked Examples', 'Contoh soal, langkah pengerjaan, dan alasan tiap langkah.'],
    ] },
  ];
  const styleHint = (id) => { for (const g of NOTE_STYLES) for (const [v, , hint] of g.items) if (v === id) return hint; return ''; };
  function styleSelect(attrs, value) {
    const sel = h('select', attrs, NOTE_STYLES.map((g) => h('optgroup', { label: g.group }, g.items.map(([v, l]) => h('option', { value: v }, l)))));
    if (value) sel.value = value;
    return sel;
  }

  // ----- dialog konfirmasi / isian (pengganti confirm & prompt bawaan browser)
  function ask({ title, message, confirm = 'Ya', cancel = 'Batal', danger = false, input = null }) {
    return new Promise((resolve) => {
      const dlg = h('dialog', { class: 'dlg sm', 'aria-labelledby': 'ask-t' });
      let done = false;
      const close = (val) => { if (done) return; done = true; dlg.close(); dlg.remove(); resolve(val); };
      const field = input ? h('input', { type: input.type || 'text', value: input.value || '', placeholder: input.placeholder || '', 'aria-label': input.label || title, min: input.min, max: input.max }) : null;
      const form = h('form', { onSubmit: (e) => { e.preventDefault(); close(input ? field.value : true); } },
        h('h2', { id: 'ask-t' }, title),
        message && h('p', { class: 'msg' }, message),
        field && h('div', { style: 'margin-bottom:6px' }, field),
        h('div', { class: 'actions' },
          h('button', { class: 'btn quiet', type: 'button', onClick: () => close(input ? null : false) }, cancel),
          h('button', { class: 'btn' + (danger ? ' danger solid' : ''), type: 'submit' }, confirm)));
      dlg.append(form);
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(input ? null : false); });
      document.body.append(dlg);
      dlg.showModal();
      if (field) { field.focus(); field.select(); } else $('button[type=submit]', dlg).focus();
    });
  }

  // ====================================================================== format
  const fmtDur = (sec) => {
    sec = Math.round(sec || 0);
    if (sec < 60) return `${sec} dtk`;
    if (sec < 3600) return `${Math.round(sec / 60)} mnt`;
    return `${(sec / 3600).toFixed(1).replace('.', ',')} jam`;
  };
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  function relDay(ts) {
    const d = new Date(ts * 1000);
    const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
    if (diff <= 0) return 'hari ini';
    if (diff === 1) return 'kemarin';
    if (diff < 7) return `${diff} hari lalu`;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }
  const parseDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const DAY3 = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  const pct = (n) => (n == null ? '–' : `${n}%`);
  const tone = (p) => (p >= 80 ? 'good' : p >= 60 ? 'mid' : 'bad');
  const greeting = () => { const hr = new Date().getHours(); return hr < 11 ? 'Selamat pagi' : hr < 15 ? 'Selamat siang' : hr < 19 ? 'Selamat sore' : 'Selamat malam'; };
  function fileKind(name) {
    const ext = (String(name || '').split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return 'PDF';
    if (ext === 'docx') return 'DOCX';
    if (ext === 'pptx') return 'PPTX';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) return 'IMG';
    return 'TXT';
  }

  // ====================================================================== markdown aman
  // Semua teks di-escape lebih dulu; hanya tag buatan sendiri yang keluar.

  // Pembersih hasil AI (backstop untuk data lama di PC): buang <think>, bungkus
  // fence, JSON shell satu-field, dan escape literal \n/\t (di luar code fence;
  // perintah LaTeX seperti \neq/\times/\rho dilindungi agar rumus tidak rusak).
  const LATEX_AFTER = 'abla|earrow|eg|eLeftrightarrow|eleftarrow|emid|eoalign|eobreak|eoindent|eolimits|eonscript|eq|ewline|ot|otin|u' +
    '|ag|au|ext|extbf|extit|extsf|exttt|frac|ilde|imes|o|op|riangle|riangleq|riangleleft|riangleright' +
    '|angle|brace|brack|floor|group|ho|ight|ightarrow|Rightarrow|ightleftharpoons|ightharpoondown|ightharpoonup|ing|m|vert';
  const ESCAPE_RE = new RegExp('(^|[^\\\\])\\\\([ntr])(?!(?:' + LATEX_AFTER + ')(?![a-zA-Z]))', 'g');
  // Diulang sampai stabil: regex menelan karakter pendahulu, sehingga "\\n\\n" berurutan perlu dua putaran.
  const replaceAll = (t, re) => { let prev; do { prev = t; t = t.replace(re, (m, pre, c) => pre + ({ n: '\n', t: '\t', r: '\r' }[c])); } while (t !== prev); return t; };
  // Di dalam rumus ($...$, $$...$$), \n \t \r hanyalah escape bila TIDAK diikuti huruf (\theta, \tan, \nabla = LaTeX).
  const ESCAPE_IN_MATH = /(^|[^\\])\\([ntr])(?![a-zA-Z])/g;
  const MATH_SPAN_SPLIT = /(\$\$[\s\S]+?\$\$|\$(?=\S)[^$\n]*?\S\$(?!\d))/;
  const unescapeLiterals = (t) => t.split(MATH_SPAN_SPLIT).map((p, i) => replaceAll(p, i % 2 ? ESCAPE_IN_MATH : ESCAPE_RE)).join('');

  // Terapkan fn hanya pada teks di luar pagar kode (isi pagar, termasuk yang belum ditutup saat streaming, utuh).
  function mapOutsideFences(t, fn) {
    const out = [];
    let buf = [];
    let inFence = false;
    const flush = () => { if (buf.length) { const chunk = buf.join('\n'); out.push(inFence ? chunk : fn(chunk)); buf = []; } };
    for (const ln of t.split('\n')) {
      if (!inFence && /^\s*```/.test(ln)) { flush(); inFence = true; buf.push(ln); } else if (inFence && /^\s*```\s*$/.test(ln)) { buf.push(ln); flush(); inFence = false; } else buf.push(ln);
    }
    flush();
    return out.join('\n');
  }

  function detox(src) {
    let t = String(src || '');
    t = t.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');
    const open = t.search(/<think>/i);
    if (open >= 0) { const head = t.slice(0, open); t = head.trim() ? head : t.slice(open + 7); }
    const trimmed = t.trim();
    const wrap = trimmed.match(/^```([^\n]*)\s*\n([\s\S]*?)\n?```\s*$/);
    // hanya bungkus seluruh jawaban (```markdown / ``` polos). Blok berbahasa pemrograman dan dua blok
    // terpisah (diawali & diakhiri pagar) bukan pembungkus.
    if (wrap && /^(|markdown|md)$/i.test(wrap[1].trim()) && !wrap[2].includes('```')) t = wrap[2];
    const shell = t.trim();
    if (shell.startsWith('{') && shell.endsWith('}')) {
      try {
        const obj = JSON.parse(shell);
        const ks = Object.keys(obj);
        const keys = ['content', 'response', 'answer', 'reply', 'message', 'text', 'jawaban', 'balasan', 'catatan', 'isi'];
        if (ks.length === 1 && keys.includes(ks[0].toLowerCase()) && typeof obj[ks[0]] === 'string' && obj[ks[0]].trim()) t = obj[ks[0]];
      } catch { /* bukan JSON */ }
    }
    // jawaban satu baris penuh "\\n" literal: buka dulu supaya pagar kode terlihat sebagai baris
    if (!t.includes('\n') && (t.match(/\\n/g) || []).length >= 2) t = unescapeLiterals(t);
    t = mapOutsideFences(t, (p) => unescapeLiterals(p).replace(/\n{3,}/g, '\n\n'));
    // Catatan: judul TIDAK didemosi di sini — struktur "## Bagian" pada catatan
    // dibuat oleh kode sendiri (assemble_notes); demosi output model sudah
    // ditangani di backend per potongan.
    return t.trim();
  }

  // ----- rumus (KaTeX, di-host sendiri di /vendor/katex).
  // Rumus diekstrak lebih dulu menjadi token agar tidak dirusak parser Markdown (mis. `|x|` di tabel,
  // `_` dan `*` di dalam rumus), lalu dirender di akhir. Pemindai manual (tanpa regex lookbehind) supaya
  // aman di Safari lama. Mendukung $...$, $$...$$, \(...\), \[...\]; `\$` = tanda dolar biasa.
  // Aturan `$...$` ala Pandoc: pembuka diikuti non-spasi, penutup didahului non-spasi dan tidak diikuti
  // angka, sehingga "Rp5 dan $10" tidak dianggap rumus.
  const MATH_OPEN = '\uE000';
  const MATH_CLOSE = '\uE001';
  const MATH_TOKEN = /\uE000(\d+)\uE001/g;
  const MATH_ONLY = /^\s*\uE000(\d+)\uE001\s*$/;
  const SPECIAL = /[`\\$]/g;

  function extractMath(src) {
    const math = [];
    const n = src.length;
    let out = '';
    let i = 0;
    const put = (tex, display) => { math.push({ tex, display }); out += MATH_OPEN + (math.length - 1) + MATH_CLOSE; };
    while (i < n) {
      SPECIAL.lastIndex = i;
      const m = SPECIAL.exec(src);
      if (!m) { out += src.slice(i); break; }
      if (m.index > i) { out += src.slice(i, m.index); i = m.index; }
      const c = src[i];
      if (c === '`') {
        if (src.startsWith('```', i)) {
          const end = src.indexOf('```', i + 3);
          const stop = end < 0 ? n : end + 3;
          out += src.slice(i, stop); i = stop; continue;
        }
        const end = src.indexOf('`', i + 1);
        const nl = src.indexOf('\n', i + 1);
        if (end > 0 && (nl < 0 || end < nl)) { out += src.slice(i, end + 1); i = end + 1; continue; }
        out += c; i++; continue;
      }
      if (c === '\\') {
        const nx = src[i + 1];
        if (nx === '$') { math.push({ lit: '$' }); out += MATH_OPEN + (math.length - 1) + MATH_CLOSE; i += 2; continue; }
        if (nx === '\\') { out += '\\\\'; i += 2; continue; }
        if (nx === '[') {
          const end = src.indexOf('\\]', i + 2);
          if (end > 0) { put(src.slice(i + 2, end), true); i = end + 2; continue; }
        } else if (nx === '(') {
          const end = src.indexOf('\\)', i + 2);
          if (end > 0) { put(src.slice(i + 2, end), false); i = end + 2; continue; }
        }
        out += c; i++; continue;
      }
      // c === '$'
      if (src[i + 1] === '$') {
        const end = src.indexOf('$$', i + 2);
        if (end > i + 2) { put(src.slice(i + 2, end), true); i = end + 2; continue; }
        out += '$$'; i += 2; continue;
      }
      const nx = src[i + 1];
      if (nx && !/\s/.test(nx)) {
        let j = i + 1;
        let found = -1;
        while (j < n) {
          const cj = src[j];
          if (cj === '\n') break;
          if (cj === '\\') { j += 2; continue; }
          if (cj === '$') { found = j; break; }
          j++;
        }
        if (found > i + 1 && !/\s/.test(src[found - 1]) && !/\d/.test(src[found + 1] || '')) {
          put(src.slice(i + 1, found), false); i = found + 1; continue;
        }
      }
      out += '$'; i++;
    }
    return [out, math];
  }

  const mathCache = new Map();
  function renderMath(m) {
    if (m.lit != null) return esc(m.lit);
    const tex = m.tex.trim();
    const key = (m.display ? 'D' : 'I') + tex;
    let html = mathCache.get(key);
    if (html == null) {
      if (window.katex) {
        try {
          html = window.katex.renderToString(tex, { displayMode: !!m.display, throwOnError: false, strict: 'ignore', trust: false });
        } catch { html = null; }
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
  const restoreMath = (html, math) => html.replace(MATH_TOKEN, (all, i) => (math[+i] ? renderMath(math[+i]) : all));

  function inline(text) {
    return text.split(/(`[^`]+`)/g).map((part, i) => {
      if (i % 2) return `<code>${esc(part.slice(1, -1))}</code>`;
      let t = esc(part);
      // tautan dengan token rumus di URL tidak dijadikan <a> (token tidak boleh masuk atribut)
      t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (all, label, url) => (url.includes(MATH_OPEN) ? all : `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`));
      t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>');
      t = t.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?![\w*])/g, '$1<em>$2</em>');
      t = t.replace(/(^|[^\w_])_([^_\s][^_]*?)_(?![\w_])/g, '$1<em>$2</em>');
      return t;
    }).join('');
  }
  const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const isTableSep = (l) => l.includes('|') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l);
  const isDisplayTok = (l, math) => { const m = MATH_ONLY.exec(l); return !!(m && math[+m[1]] && math[+m[1]].display); };
  const isBlockStart = (l, next, math) => /^(#{1,6})\s/.test(l) || /^\s*```/.test(l) || LIST_RE.test(l) || /^\s*>/.test(l)
    || /^\s*([-*_])\1{2,}\s*$/.test(l) || (l.includes('|') && next != null && isTableSep(next)) || isDisplayTok(l, math);
  const indentOf = (l) => l.match(/^\s*/)[0].replace(/\t/g, '    ').length;
  // sel tabel: `\|` = tanda | biasa; | di dalam rumus sudah aman karena rumus berupa token
  function cells(line) {
    let t = line.trim();
    if (t.startsWith('|')) t = t.slice(1);
    if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
    const out = [];
    let cur = '';
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue; }
      if (c === '|') { out.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    out.push(cur.trim());
    return out;
  }
  const alignOf = (c) => { const x = c.replace(/\s/g, ''); return x.startsWith(':') && x.endsWith(':') ? 'center' : x.endsWith(':') ? 'right' : ''; };

  // Daftar bersarang. Baris kosong tunggal di antara butir tidak memutus daftar (nomor tidak mengulang
  // dari 1), baris teks yang menjorok menjadi lanjutan butir sebelumnya, dan ganti jenis (bullet/nomor)
  // pada tingkat yang sama memulai daftar baru.
  function parseList(lines, i, indent) {
    const first = lines[i].match(LIST_RE);
    const ordered = /\d/.test(first[2]);
    const tag = ordered ? 'ol' : 'ul';
    const startNum = ordered ? parseInt(first[2], 10) : 1;
    let html = `<${tag}${ordered && startNum !== 1 ? ` start="${startNum}"` : ''}>`;
    let open = false;                                   // ada <li> yang belum ditutup
    while (i < lines.length) {
      let line = lines[i];
      if (/^\s*$/.test(line)) {                         // lewati baris kosong bila daftar berlanjut
        let k = i;
        while (k < lines.length && /^\s*$/.test(lines[k])) k++;
        const nm = k < lines.length ? lines[k].match(LIST_RE) : null;
        if (nm && indentOf(lines[k]) >= indent && k - i <= 2) { i = k; line = lines[i]; } else break;
      }
      const m = line.match(LIST_RE);
      if (!m) {
        if (open && indentOf(line) > indent && !/^\s*(```|#{1,6}\s|>)/.test(line)) {   // lanjutan butir
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
      if (/\d/.test(m[2]) !== ordered) break;           // jenis daftar berganti
      let body = m[3];
      const task = body.match(/^\[( |x|X)\]\s+(.*)$/);
      if (task) body = `${/x/i.test(task[1]) ? '☑' : '☐'} ${task[2]}`;
      html += `<li>${inline(body)}</li>`;
      open = true;
      i++;
    }
    return [html + `</${tag}>`, i];
  }

  function renderBlocks(text, math) {
    const lines = text.replace(/\r/g, '').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }
      let m;
      if (/^\s*```/.test(line)) {
        const info = line.replace(/^\s*```/, '').trim();
        const ind = indentOf(line);
        const code = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++].replace(new RegExp('^ {0,' + ind + '}'), ''));
        i++;
        const body = code.join('\n');
        // "canvas coding" (codecanvas.js); tanpa modul itu kembali ke <pre><code> biasa
        out.push(window.CodeCanvas ? window.CodeCanvas.render(info, body) : `<pre><code>${esc(body)}</code></pre>`);
        continue;
      }
      if ((m = line.match(/^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (/^\s*>/.test(line)) {
        const inner = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) inner.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push(`<blockquote>${renderBlocks(inner.join('\n'), math)}</blockquote>`);
        continue;
      }
      if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const head = cells(line);
        const aligns = cells(lines[i + 1]).map(alignOf);
        const n = head.length;
        i += 2;
        let body = '';
        while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) {
          const row = cells(lines[i]);
          if (row.length > n) row.splice(n - 1, row.length - n + 1, row.slice(n - 1).join(' / '));
          while (row.length < n) row.push('');
          body += `<tr>${row.map((c, k) => `<td${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${inline(c)}</td>`).join('')}</tr>`;
          i++;
        }
        out.push(`<div class="tw"><table><thead><tr>${head.map((c, k) => `<th${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`);
        continue;
      }
      if (LIST_RE.test(line)) {
        const [html, next] = parseList(lines, i, indentOf(line));
        out.push(html);
        i = next;
        continue;
      }
      if (isDisplayTok(line, math)) { out.push(`<div class="math-block">${MATH_OPEN}${MATH_ONLY.exec(line)[1]}${MATH_CLOSE}</div>`); i++; continue; }
      const para = [line.trim()];
      i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i], lines[i + 1], math)) para.push(lines[i++].trim());
      out.push(`<p>${inline(para.join(' '))}</p>`);
    }
    return out.join('\n');
  }

  function renderMarkdown(src) {
    const [text, math] = extractMath(detox(src));
    return restoreMath(renderBlocks(text, math), math);
  }
  const sheet = (md, cls = '') => { const el = h('div', { class: ('sheet ' + cls).trim() }); el.innerHTML = renderMarkdown(md); return el; };

  // ====================================================================== API
  const state = { authed: false, agent: null, streak: null, subjects: [], lastSide: 0 };
  class ApiError extends Error {
    constructor(message, status, offline) { super(message); this.status = status; this.offline = !!offline; }
  }
  async function api(path, body, init = {}) {
    // Setiap tulisan selain RPC baca (unggah, masuk/keluar, ...) membuat cache bacaan tidak lagi dapat dipercaya.
    if (body !== undefined && !path.startsWith('/api/rpc/')) dropCache();
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    let res;
    try {
      res = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
        body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body)),
        credentials: 'same-origin',
        ...init,
      });
    } catch {
      throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi internet.', 0);
    }
    let data = null;
    try { data = await res.json(); } catch { /* bukan JSON */ }
    if (res.status === 401 && path !== '/api/login') {
      state.authed = false;
      showLogin();
      throw new ApiError('Sesi berakhir. Silakan masuk lagi.', 401);
    }
    if (!res.ok) {
      if (data && data.offline) setAgent(false);
      throw new ApiError((data && data.error) || `Terjadi kesalahan (${res.status})`, res.status, data && data.offline);
    }
    return data;
  }
  // ----- cache bacaan: berpindah tab tidak menunggu server lagi.
  // Hanya aksi baca murni yang disimpan (30 dtk). Aksi lain mungkin mengubah data, jadi apa pun yang
  // bukan bacaan membuang seluruh cache; `gen` mencegah bacaan yang sudah berangkat sebelum
  // perubahan menulis data lama kembali ke cache. Permintaan identik yang sedang berjalan dipakai
  // bersama (mis. sidebar dan halaman sama-sama meminta data yang sama).
  const READ_ACTIONS = new Set(['list_subjects', 'list_documents', 'get_document', 'list_quizzes', 'dashboard', 'progress',
    'cards_stats', 'cards_due', 'concepts_list', 'get_settings', 'play_hub']);
  const CACHE_TTL = 30000;
  const rpcCache = new Map();
  const rpcFlight = new Map();
  let rpcGen = 0;
  const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
  function dropCache() { rpcGen++; rpcCache.clear(); rpcFlight.clear(); }
  async function rpcFetch(action, body) {
    const res = await api('/api/rpc/' + action, body);
    setAgent(true);
    return res.data;
  }
  async function rpc(action, body = {}) {
    if (!READ_ACTIONS.has(action)) {
      dropCache();
      try { return await rpcFetch(action, body); } finally { dropCache(); }
    }
    const key = action + '|' + JSON.stringify(body);
    const hit = rpcCache.get(key);
    if (hit && Date.now() - hit.t < CACHE_TTL) return clone(hit.data);
    let flight = rpcFlight.get(key);
    if (!flight) {
      const gen = rpcGen;
      flight = rpcFetch(action, body).then((data) => {
        if (gen === rpcGen) rpcCache.set(key, { t: Date.now(), data });
        return data;
      }).finally(() => { if (rpcFlight.get(key) === flight) rpcFlight.delete(key); });
      rpcFlight.set(key, flight);
    }
    return clone(await flight);
  }
  /** Panaskan cache untuk sebuah halaman sebelum dibuka (saat kursor melayang di menu). Senyap bila gagal. */
  const PREFETCH = {
    home: [['dashboard']],
    materi: [['list_subjects'], ['list_documents']],
    kuis: [['list_quizzes'], ['list_subjects'], ['progress']],
    game: [['play_hub']],
    progres: [['progress']],
  };
  function prefetch(navKey) {
    if (!state.authed) return;
    for (const [action, body] of PREFETCH[navKey] || []) rpc(action, body).catch(() => {});
  }

  /** Baca aliran SSE dari POST. Menggantikan pembaca ganda per fitur (chat/Panel Tanya tetap memakai
   *  pembacanya sendiri pada v2.0). Event: status, chunk, done, error; komentar ": ping" diabaikan.
   *  Mengembalikan data `done`. Melempar ApiError; `interrupted` = true bila aliran putus di tengah jalan
   *  (mis. HP tidur) sehingga pemanggil dapat mengambil hasilnya lewat RPC, `retryable` dari server. */
  async function sse(url, body, { onChunk, onStatus, signal } = {}) {
    let resp;
    dropCache();
    try {
      resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin', signal });
    } catch (err) {
      const e = new ApiError('Tidak dapat terhubung ke server. Periksa koneksi internet.', 0);
      e.interrupted = true;
      throw e;
    }
    if (resp.status === 401) { state.authed = false; showLogin(); throw new ApiError('Sesi berakhir. Silakan masuk lagi.', 401); }
    if (!resp.ok || !resp.body || !(resp.headers.get('content-type') || '').includes('text/event-stream')) {
      let data = null;
      try { data = await resp.json(); } catch { /* bukan JSON */ }
      if (data && data.offline) setAgent(false);
      throw new ApiError((data && data.error) || `Terjadi kesalahan (${resp.status})`, resp.status, data && data.offline);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let result = null;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data: ')) continue;       // ": ping" dan baris kosong
          let ev;
          try { ev = JSON.parse(t.slice(6)); } catch { continue; }
          if (ev.type === 'chunk' && ev.chunk) { if (onChunk) onChunk(ev.chunk); }
          else if (ev.type === 'status') { if (onStatus) onStatus(ev.stage); }
          else if (ev.type === 'done') result = ev.data || {};
          else if (ev.type === 'error') { const e = new ApiError(ev.error || 'Kesalahan pada respon AI', 400); e.retryable = !!ev.retryable; throw e; }
        }
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      const e = new ApiError('Koneksi terputus saat menerima jawaban.', 0);
      e.interrupted = true;
      throw e;
    }
    if (result == null) { const e = new ApiError('Koneksi terputus saat menerima jawaban.', 0); e.interrupted = true; throw e; }
    return result;
  }

  function setAgent(on) {
    state.agent = on;
    $$('.js-agent').forEach((el) => {
      el.className = 'status js-agent ' + (on ? 'on' : 'off');
      el.title = on ? 'PC lokal terhubung' : 'PC lokal offline';
      $('span', el).textContent = on ? 'PC terhubung' : 'PC offline';
    });
    const b = $('#banner');
    if (b) {
      if (on === false) {
        fill(b, h('div', { class: 'banner', role: 'status' },
          h('span', null, 'PC lokal sedang offline. Catatan dan kuis tidak bisa dibuka sampai agent menyala.'),
          h('button', { class: 'btn sm line', onClick: async (e) => { e.target.disabled = true; await pollStatus(); e.target.disabled = false; if (state.agent) route(); } }, 'Periksa lagi')));
      } else fill(b);
    }
  }
  function setStreak(n) {
    state.streak = n;
    $$('.js-streak').forEach((el) => { el.textContent = String(n); });
  }
  function setSideStreak(st) {
    setStreak(st.current);
    const card = $('#side-streak');
    if (!card) return;
    const t = st.today;
    const p = Math.min(100, Math.round(100 * t.seconds / (t.goal_seconds || 1)));
    $('.bar > i', card).style.width = (t.done ? 100 : p) + '%';
    $('small', card).textContent = t.done ? 'Target hari ini tercapai' : `${Math.floor(t.seconds / 60)} dari ${Math.round(t.goal_seconds / 60)} mnt hari ini`;
  }
  async function pollStatus() {
    if (!state.authed) return;
    try { setAgent((await api('/api/status')).agent); } catch { /* diabaikan */ }
  }
  async function refreshSide(force) {
    if (!force && Date.now() - state.lastSide < 8000) return;
    state.lastSide = Date.now();
    try {
      const [sj, d] = await Promise.all([rpc('list_subjects'), rpc('dashboard', { streak_only: true })]);
      state.subjects = sj.subjects;
      renderSideSubjects();
      setSideStreak(d.streak);
    } catch { /* sidebar tidak kritis */ }
  }
  function renderSideSubjects() {
    const box = $('#side-subjects');
    if (!box) return;
    const cur = (location.hash.match(/[?&]s=(\d+)/) || [])[1];
    fill(box, state.subjects.length > 0 && [h('h3', { class: 'sect-lbl' }, 'Mata pelajaran'),
      h('div', { class: 'sjs' }, state.subjects.map((x) => h('a', { href: `#/materi?s=${x.id}`, style: `--c:${x.color}`, 'aria-current': String(String(x.id) === cur) },
        h('i', { class: 'dot' }), h('span', null, x.name), h('span', { class: 'n' }, String(x.doc_count)))))]);
  }

  // ====================================================================== siklus tampilan
  let seq = 0;
  let cleanups = [];
  const onCleanup = (fn) => cleanups.push(fn);
  function newView() {
    for (const fn of cleanups) { try { fn(); } catch { /* diabaikan */ } }
    cleanups = [];
    return ++seq;
  }
  const alive = (n) => n === seq;

  function mount(title) {
    document.title = `${title} · Belajar`;
    const v = $('#view');
    fill(v);
    return v;
  }
  const skeleton = (rows = 3) => h('div', { 'aria-busy': 'true', 'aria-label': 'Memuat' },
    h('div', { class: 'skel', style: 'height:44px;width:min(320px,70%);margin-bottom:22px' }),
    Array.from({ length: rows }, () => h('div', { class: 'skel', style: 'height:78px;margin-bottom:12px' })));
  const loading = () => skeleton();
  function showError(v, e, retry) {
    fill(v, h('div', { class: 'notice bad', role: 'alert' },
      h('p', null, e.message || 'Terjadi kesalahan.'),
      retry && h('div', { class: 'actions' }, h('button', { class: 'btn line sm', onClick: retry }, 'Coba lagi'))));
  }

  // jam aktif: hanya berjalan saat tab terlihat dan ada interaksi dalam 90 detik terakhir
  function activeClock(onTick) {
    let last = Date.now();
    let secs = 0;
    const bump = () => { last = Date.now(); };
    const evs = ['pointermove', 'keydown', 'scroll', 'touchstart', 'click'];
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - last < 90000) { secs++; if (onTick) onTick(secs); }
    }, 1000);
    const stop = () => { clearInterval(timer); evs.forEach((e) => window.removeEventListener(e, bump)); };
    onCleanup(stop);
    return { get seconds() { return secs; }, stop };
  }

  async function pollJob(jobId, n, onUpdate) {
    for (;;) {
      await sleep(1400);
      if (!alive(n)) return null;
      let job;
      try { job = await rpc('get_job', { id: jobId }); } catch (e) { if (!alive(n)) return null; await sleep(3000); continue; }
      if (onUpdate) onUpdate(job);
      if (job.status === 'done' || job.status === 'failed') return job;
    }
  }

  // ====================================================================== token smoother
  // Antrean buffer adaptif: menghaluskan potongan streaming menjadi tampilan kata-per-kata
  // (ticker ~25ms) dengan akselerasi bila buffer menumpuk. Dipakai chat AI dan panel Tanya.
  function createSmoother(render) {
    let target = '';
    let shown = '';
    let finished = false;
    let timer = null;
    let settle = null;
    const done = new Promise((resolve) => { settle = resolve; });
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const tick = () => {
      if (shown.length < target.length) {
        const remaining = target.slice(shown.length);
        const pendingLen = remaining.length;
        // tentukan jumlah kata/karakter per tick secara adaptif
        let wordsToTake = 1;
        if (finished) wordsToTake = Math.max(1, Math.ceil(pendingLen / 12));
        else if (pendingLen > 180) wordsToTake = 5;
        else if (pendingLen > 90) wordsToTake = 3;
        else if (pendingLen > 40) wordsToTake = 2;
        let takenLen = 0;
        let sub = remaining;
        for (let w = 0; w < wordsToTake; w++) {
          if (!sub) break;
          const m = sub.match(/\s+/);
          if (m && m.index !== undefined) {
            const wordEnd = m.index + m[0].length;
            takenLen += wordEnd;
            sub = sub.slice(wordEnd);
          } else {
            if (finished || sub.length > 25) takenLen += sub.length;
            else takenLen += Math.min(sub.length, 3);
            break;
          }
        }
        if (takenLen <= 0) takenLen = Math.min(remaining.length, 3);
        shown += remaining.slice(0, takenLen);
        render(shown, true);
      } else if (finished) {
        stop();
        render(target, false);
        settle();
      }
    };
    timer = setInterval(tick, 25);
    return {
      push: (chunk) => { target += chunk; },
      finish: (finalText) => {
        if (finalText && finalText.length >= target.length) target = finalText;
        finished = true;
      },
      abort: stop,
      done,
    };
  }

  // Tombol mengambang yang muncul saat pengguna menyeleksi teks di dalam `container`.
  // `enabled` (opsional) membatasi kapan tombol boleh tampil; `scrollEls` menambah
  // elemen yang scroll-nya menyembunyikan tombol (mis. utas chat yang scroll sendiri).
  function selectionButton(container, { label, icon, cls = 'ask-pop', onPick, enabled = null, scrollEls = [] }) {
    const btn = h('button', { type: 'button', class: cls, 'aria-label': label }, ico(icon, 13), h('span', null, label));
    document.body.append(btn);
    const hide = () => btn.classList.remove('visible');
    const check = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return hide();
      if (enabled && !enabled()) return hide();
      const text = sel.toString().trim();
      if (!text || text.length < 2) return hide();
      if (!sel.anchorNode || !container.contains(sel.anchorNode)) return hide();
      try {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return hide();
        const pw = btn.offsetWidth || 120, ph = btn.offsetHeight || 36;
        let left = Math.max(10, Math.min(window.innerWidth - pw - 10, rect.left + (rect.width / 2) - (pw / 2)));
        let top = rect.top - ph - 8;
        if (top < 12) top = rect.bottom + 8;
        btn.style.left = Math.round(left) + 'px';
        btn.style.top = Math.round(top) + 'px';
        btn.classList.add('visible');
      } catch { hide(); }
    };
    const onSelChange = () => setTimeout(check, 20);
    const onScroll = () => hide();
    document.addEventListener('selectionchange', onSelChange);
    window.addEventListener('scroll', onScroll, { passive: true });
    scrollEls.forEach((el) => el.addEventListener('scroll', onScroll, { passive: true }));
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    btn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (text) {
        onPick(text);
        try { sel.removeAllRanges(); } catch { /* diabaikan */ }
      }
      hide();
    });
    const destroy = () => {
      document.removeEventListener('selectionchange', onSelChange);
      window.removeEventListener('scroll', onScroll);
      scrollEls.forEach((el) => el.removeEventListener('scroll', onScroll));
      btn.remove();
    };
    onCleanup(destroy);
    return { destroy };
  }

  // ====================================================================== komponen visual
  function ring({ value, max, size = 124, stroke = 13, kind = '', center }) {
    const r = (size - stroke) / 2;
    const len = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(1, max ? value / max : 0));
    const svg = s('svg', { class: 'ring ' + kind, viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': `${Math.round(p * 100)} persen` },
      s('circle', { class: 'trk', cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke }),
      s('circle', { class: 'prg', cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke, 'stroke-linecap': 'round',
        transform: `rotate(-90 ${size / 2} ${size / 2})`, style: `--len:${len};stroke-dasharray:${len};stroke-dashoffset:${len * (1 - p)}` }));
    return h('div', { class: 'ring-box', style: `width:${size}px;height:${size}px` }, svg, h('div', { class: 'center' }, center));
  }

  /** Kotak grafik yang digambar ulang sesuai lebar sebenarnya, supaya teks tidak ikut mengecil di layar sempit. */
  function chartBox(draw) {
    const box = h('div', { class: 'chartbox' });
    let w = 0;
    fill(box, draw(680));
    const render = () => {
      const nw = Math.round(box.clientWidth);
      if (!nw || nw === w) return;
      w = nw;
      fill(box, draw(nw));
    };
    requestAnimationFrame(render);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(render);
      ro.observe(box);
      onCleanup(() => ro.disconnect());
    }
    return box;
  }

  function lineChart(points) {
    return chartBox((W) => {
      const H = W < 520 ? 190 : 230, L = 40, R = 14, T = 14, B = 26;
      const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img',
        'aria-label': `Tren skor kuis: ${points.map((p) => p.pct + '%').join(', ')}` });
      for (const v of [0, 50, 100]) {
        const y = T + (H - T - B) * (1 - v / 100);
        svg.append(s('line', { class: 'grid', x1: L, x2: W - R, y1: y, y2: y }), s('text', { x: 0, y: y + 4 }, v + '%'));
      }
      const step = points.length > 1 ? (W - L - R - 16) / (points.length - 1) : 0;
      const x0 = L + 8;
      const xy = points.map((p, i) => [points.length > 1 ? x0 + step * i : (L + W - R) / 2, T + (H - T - B) * (1 - p.pct / 100)]);
      if (xy.length > 1) {
        svg.append(s('path', { class: 'area', d: `M${xy[0][0]},${H - B} ` + xy.map((p) => `L${p[0]},${p[1]}`).join(' ') + ` L${xy[xy.length - 1][0]},${H - B}Z` }));
        svg.append(s('polyline', { class: 'ln', points: xy.map((p) => p.join(',')).join(' ') }));
      }
      xy.forEach(([x, y], i) => svg.append(s('circle', { class: 'pt' + (i === xy.length - 1 ? ' last' : ''), cx: x, cy: y, r: 5.5 },
        s('title', null, `${points[i].title}: ${points[i].pct}%`))));
      return svg;
    });
  }
  function barChart(days) {
    return chartBox((W) => {
      const H = W < 520 ? 150 : 180, B = 24, gap = W < 520 ? 5 : 9;
      const max = Math.max(900, ...days.map((d) => d.seconds));
      const bw = (W - gap * (days.length - 1)) / days.length;
      const total = days.reduce((a, d) => a + d.seconds, 0);
      const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `Waktu belajar ${days.length} hari terakhir, total ${fmtDur(total)}` });
      days.forEach((d, i) => {
        const bh = Math.max(d.seconds ? 6 : 4, (H - B - 8) * (d.seconds / max));
        const x = i * (bw + gap);
        const last = i === days.length - 1;
        svg.append(s('rect', { class: 'bar-s' + (d.seconds ? '' : ' none') + (last ? ' today' : ''), x, y: H - B - bh, width: bw, height: bh, rx: Math.min(6, bw / 2) },
          s('title', null, `${parseDay(d.day).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}: ${d.seconds ? fmtDur(d.seconds) : 'tidak belajar'}`)));
        svg.append(s('text', { x: x + bw / 2, y: H - 7, 'text-anchor': 'middle' }, DAY3[parseDay(d.day).getDay()][0]));
      });
      return svg;
    });
  }

  function heatmap(data) {
    const first = parseDay(data[0].day);
    const offset = (first.getDay() + 6) % 7; // Senin = 0
    const cols = Math.ceil((offset + data.length) / 7);
    const grid = h('div', { class: 'hm', style: `--cols:${cols}`, role: 'img', 'aria-label': 'Kalender aktivitas belajar 20 minggu terakhir' });
    for (let i = 0; i < offset; i++) grid.append(h('i', { class: 'pad' }));
    data.forEach((c, i) => {
      const label = `${parseDay(c.day).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}: ${c.seconds ? fmtDur(c.seconds) : 'tidak belajar'}${c.quizzes ? `, ${c.quizzes} kuis` : ''}`;
      grid.append(h('i', { class: (c.level ? 'l' + c.level : '') + (i === data.length - 1 ? ' td' : ''), title: label }));
    });
    const months = h('div', { class: 'hm-months', style: `--cols:${cols}`, 'aria-hidden': 'true' });
    let prev = -1;
    for (let w = 0; w < cols; w++) {
      const di = Math.min(Math.max(0, w * 7 - offset), data.length - 1);
      const mo = parseDay(data[di].day).getMonth();
      if (mo !== prev) { if (prev !== -1 && w + 2 < cols) months.append(h('span', { style: `grid-column:${w + 1}` }, MON3[mo])); prev = mo; }
    }
    const first0 = parseDay(data[0].day).getMonth();
    months.prepend(h('span', { style: 'grid-column:1' }, MON3[first0]));
    const days = h('div', { class: 'hm-days', 'aria-hidden': 'true' }, ['Sen', '', 'Rab', '', 'Jum', '', ''].map((t) => h('span', null, t)));
    const shade = (l) => `background:${l ? `color-mix(in srgb, var(--brand) ${[0, 26, 50, 76, 100][l]}%, var(--surface-2))` : 'var(--surface-2)'}`;
    return h('div', null,
      h('div', { class: 'hm-wrap' }, h('span'), months, days, grid),
      h('div', { class: 'legend' }, 'Sedikit', ...[0, 1, 2, 3, 4].map((l) => h('i', { style: shade(l) })), 'Banyak'));
  }

  const SUBJ_COLORS = ['#4B3FE8', '#D63E6A', '#0C8F5B', '#C77700', '#0A83B0', '#A33FC7', '#C2432B', '#3F6F14'];
  const EMPTY_ART = {
    doc: 'M20 10h30l14 14v46a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z|M50 10v14h14|M26 40h28|M26 52h28|M26 64h18',
    quiz: 'M42 12a30 30 0 1 0 0 60a30 30 0 1 0 0-60z|M33 34a9 9 0 1 1 13 8c-3 2-4 4-4 8|M42 62h.01',
    chart: 'M16 70V44|M32 70V24|M48 70V36|M64 70V16|M10 74h64',
    book: 'M18 20h48a4 4 0 0 1 4 4v46H22a4 4 0 0 1-4-4V20zm0 0a4 4 0 0 0-4 4v42a4 4 0 0 0 4 4h4|M26 34h36|M26 46h24',
    compass: 'M42 12a30 30 0 1 0 0 60a30 30 0 1 0 0-60z|M42 22v6|M42 56v6|M22 42h6|M56 42h6|M35 49l5-19 9-5-5 19-9 5z',
  };
  function emptyArt(kind) {
    const p = EMPTY_ART[kind] || EMPTY_ART.doc || '';
    const svg = s('svg', { class: 'art', viewBox: '0 0 84 84', fill: 'none', stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    for (const d of p.split('|')) if (d) svg.append(s('path', { d }));
    return svg;
  }
  const emptyState = (kind, title, text, ...actions) => h('div', { class: 'empty' }, emptyArt(kind), h('h3', null, title), h('p', null, text), actions.length > 0 && h('div', { class: 'actions', style: 'justify-content:center' }, actions));

  // ====================================================================== masuk & kerangka
  function showLogin() {
    newView();
    document.title = 'Masuk · Belajar';
    const err = h('p', { class: 'small', role: 'alert', style: 'color:var(--bad)' });
    const input = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true });
    const eye = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Tampilkan password', onClick: () => { input.type = input.type === 'password' ? 'text' : 'password'; eye.setAttribute('aria-label', input.type === 'password' ? 'Tampilkan password' : 'Sembunyikan password'); input.focus(); } }, ico('eye', 18));
    const btn = h('button', { class: 'btn lg', type: 'submit' }, 'Masuk');
    const form = h('form', { onSubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      try { await api('/api/login', { password: input.value }); boot(); }
      catch (x) { err.textContent = x.message; btn.disabled = false; input.select(); }
    } },
    h('h1', null, 'Selamat datang'),
    h('p', { class: 'muted' }, 'Masukkan password untuk membuka catatan dan kuismu.'),
    h('label', { class: 'field', for: 'pw' }, 'Password', h('span', { class: 'inwrap' }, input, eye)), err, h('div', { class: 'actions' }, btn));
    fill($('#app'), h('div', { class: 'login' },
      h('div', { class: 'lside' },
        h('span', { class: 'brand' }, h('i', null, ico('book', 18)), 'belajar'),
        h('div', null, h('div', { class: 'big' }, 'Satu hari,', h('br'), 'satu langkah.'), h('p', null, 'Catatan dari materimu, kuis dari catatanmu, dan streak yang menjaga kebiasaan.'),
          h('div', { class: 'feats' }, ['Catatan otomatis dari PDF, DOCX, PPTX, dan gambar', 'Kuis dengan pembahasan per soal', 'Streak harian dan progres belajar'].map((t) => h('span', null, ico('check', 14), t))))),
      form));
    input.focus();
  }

  const NAV = [['#/', 'Beranda', 'home', 'home'], ['#/materi', 'Materi', 'materi', 'book'], ['#/kuis', 'Kuis', 'kuis', 'quiz'], ['#/game', 'Game', 'game', 'trophy'], ['#/progres', 'Progres', 'progres', 'chart']];
  async function logout() {
    try { await api('/api/logout', {}); } catch { /* */ }
    state.authed = false;
    showLogin();
  }
  function themeButton() {
    const btn = h('button', { class: 'iconbtn', type: 'button' });
    const paint = () => {
      const [, label, icon] = THEMES.find((t) => t[0] === getTheme()) || THEMES[0];
      btn.title = `Tema: ${label}`;
      btn.setAttribute('aria-label', `Tema: ${label}. Klik untuk mengganti`);
      fill(btn, ico(icon, 18));
    };
    btn.addEventListener('click', () => { cycleTheme(); paint(); });
    document.addEventListener('belajar:theme', paint);
    paint();
    return btn;
  }
  function renderShell() {
    const navLinks = (cls) => NAV.map(([href, label, key, icon]) => h('a', { href, 'data-nav': key }, ico(icon, cls === 'tab' ? 22 : 20), cls === 'tab' ? h('span', null, label) : label));
    fill($('#app'), h('div', { class: 'shell' },
      h('aside', { class: 'side', 'aria-label': 'Menu' },
        h('a', { class: 'brand', href: '#/' }, h('i', null, ico('book', 18)), 'belajar'),
        h('nav', { class: 'nav', 'aria-label': 'Navigasi utama' }, navLinks('side')),
        h('div', { id: 'side-subjects' }),
        h('div', { class: 'grow' }),
        h('a', { class: 'sidecard', id: 'side-streak', href: '#/' },
          h('div', { class: 'r' }, (() => { const f = ico('flame', 20); f.classList.add('f'); return f; })(), h('b', { class: 'js-streak' }, state.streak == null ? '–' : state.streak), h('span', null, 'hari streak')),
          h('div', { class: 'bar' }, h('i', { style: 'width:0%' })), h('small', null, 'Memuat…')),
        h('div', { class: 'sidefoot' },
          h('div', { class: 'status js-agent' }, h('i'), h('span', null, 'Memeriksa PC lokal…')),
          themeButton(),
          h('button', { class: 'iconbtn', type: 'button', title: 'Keluar', 'aria-label': 'Keluar', onClick: logout }, ico('logout', 18)))),
      h('div', { class: 'main' },
        h('header', { class: 'mtop' },
          h('a', { class: 'brand', href: '#/' }, h('i', null, ico('book', 16)), 'belajar'),
          h('div', { class: 'end' },
            h('a', { class: 'chip-streak', href: '#/', title: 'Streak harian', 'aria-label': 'Streak harian' }, ico('flame', 16), h('span', { class: 'js-streak' }, state.streak == null ? '–' : state.streak)),
            h('div', { class: 'status js-agent' }, h('i'), h('span', { class: 'sr-only' }, 'Memeriksa PC lokal…')),
            themeButton())),
        h('div', { id: 'banner' }),
        h('main', { class: 'page', id: 'view', tabindex: '-1' })),
      h('nav', { class: 'tabbar', 'aria-label': 'Navigasi utama' }, navLinks('tab'))));
  }
  function setNav(key) {
    $$('[data-nav]').forEach((a) => { if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }

  // ====================================================================== router
  const routes = [
    [/^$/, 'home', dashboardView],
    [/^materi$/, 'materi', libraryView],
    [/^materi\/(\d+)$/, 'materi', docView],
    [/^kuis$/, 'kuis', quizzesView],
    [/^latihan\/(\d+)$/, 'kuis', runnerView],
    [/^hasil\/(\d+)$/, 'kuis', resultView],
    [/^progres$/, 'progres', progressView],
    [/^chat\/(\d+)$/, 'materi', chatView],
  ];
  function route() {
    if (!state.authed) return;
    const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    const n = newView();
    renderSideSubjects();
    refreshSide(false);
    for (const [re, nav, view] of routes) {
      const m = path.match(re);
      if (m) { setNav(nav); view(n, ...m.slice(1).map((x) => (/^\d+$/.test(x) ? Number(x) : x)), query); window.scrollTo(0, 0); return; }
    }
    setNav('');
    fill(mount('Tidak ditemukan'), emptyState('doc', 'Halaman tidak ditemukan', 'Alamat yang kamu buka tidak ada atau sudah dipindahkan.', h('a', { class: 'btn', href: '#/' }, 'Kembali ke beranda')));
  }

  async function startReview() {
    try { const r = await rpc('start_review', { count: 10 }); location.hash = `#/latihan/${r.attempt.id}`; }
    catch (e) { toast(e.message); }
  }

  // ====================================================================== Beranda
  async function dashboardView(n) {
    const v = mount('Beranda');
    fill(v, loading());
    let d;
    try { d = await rpc('dashboard'); } catch (e) { if (alive(n)) showError(v, e, () => dashboardView(n)); return; }
    if (!alive(n)) return;

    const st = d.streak, today = st.today, w = d.weekly, o = d.overall;
    setSideStreak(st);
    const hasDocs = o.documents > 0;
    const recent = d.recent_docs.filter((x) => x.status === 'ready');
    const week = d.heatmap.slice(-7);

    const msg = today.done ? 'Target hari ini sudah tercapai. Lanjut kalau masih semangat.'
      : st.at_risk ? 'Belum belajar hari ini. Selesaikan target atau satu kuis agar streakmu tidak putus.'
        : 'Belajar sebentar atau selesaikan satu kuis untuk memulai.';

    const hero = h('section', { class: 'hero', 'aria-label': 'Streak harian' },
      h('div', { class: 'tl' }, h('span', { class: 'flame-badge' }, ico('flame', 22)), 'Streak harian',
        st.freezes > 0 && h('span', { class: 'tag', title: 'Dipakai otomatis bila kamu melewatkan satu hari' }, `${st.freezes} cadangan`)),
      h('div', { class: 'big' }, h('span', { class: 'xl' }, String(st.current)), h('span', { class: 'unit' }, 'hari', h('br'), 'berturut-turut')),
      h('p', { class: 'msg' + (st.at_risk ? ' warn' : '') }, msg),
      h('div', { class: 'wk', role: 'img', 'aria-label': 'Aktivitas 7 hari terakhir' }, week.map((c, i) => h('div', { class: 'd' + (c.level ? ' on' : '') + (i === 6 ? ' now' : ''), style: `--i:${i}`, title: c.seconds ? fmtDur(c.seconds) : 'Tidak belajar' },
        h('span', { class: 'c' }, c.level ? ico('check', 20) : null), DAY3[parseDay(c.day).getDay()]))));

    const mins = Math.floor(today.seconds / 60);
    const goalMin = Math.round(today.goal_seconds / 60);
    const weekPct = Math.min(100, Math.round(100 * (w.seconds / 60) / w.goal_min));
    const goal = (done, text) => h('div', { class: 'goal' + (done ? ' done' : '') }, h('span', { class: 'tick' }, ico('check', 13)), h('span', null, text));
    const cta = recent[0]
      ? h('a', { class: 'btn lg block wrap', href: `#/materi/${recent[0].id}` }, ico('book', 20), h('span', { class: 'btn-txt' }, `Lanjutkan: ${recent[0].title}`))
      : h('a', { class: 'btn lg block', href: '#/materi' }, ico('upload', 20), 'Unggah materi pertama');
    const todayPanel = h('section', { class: 'card today', 'aria-label': 'Target hari ini' },
      h('div', { class: 'top-row' },
        ring({ value: today.seconds, max: today.goal_seconds, kind: today.done ? 'good' : '', center: [h('b', { class: 'num' }, String(mins)), h('span', null, `dari ${goalMin} mnt`)] }),
        h('div', null, h('h2', null, today.done ? 'Target tercapai' : 'Target hari ini'),
          h('p', { class: 'sub' }, today.quizzes ? `${today.quizzes} kuis selesai hari ini.` : 'Belum ada kuis hari ini.'))),
      h('div', { class: 'goals' }, goal(today.seconds >= today.goal_seconds, `Belajar ${goalMin} menit`), goal(today.quizzes >= 1, 'Selesaikan satu kuis'), d.weak_count > 0 && goal(false, `${Math.min(d.weak_count, 10)} soal lemah menunggu diulang`)),
      h('div', { class: 'wkbar' },
        h('div', { class: 'lab' }, h('span', null, 'Minggu ini'), h('span', { class: 'num' }, `${Math.floor(w.seconds / 60)} dari ${w.goal_min} mnt · ${w.quizzes} kuis`)),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': weekPct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: `width:${weekPct}%` }))),
      h('div', { style: 'display:grid;gap:10px' }, cta,
        d.weak_count > 0 && h('button', { class: 'btn line block', onClick: startReview }, ico('refresh', 18), `Ulangi ${Math.min(d.weak_count, 10)} soal lemah`)));

    const stat = (label, icon, value, unit) => h('div', { class: 'stat' }, h('dt', null, ico(icon, 16), label), h('dd', { class: 'num' }, value, unit && h('small', null, unit)));
    const active = d.heatmap.filter((c) => c.level > 0).length;
    const miles = [3, 7, 14, 30, 60, 100];
    const longest = st.longest || 0;

    fill(v,
      h('div', { class: 'hello' }, h('span', { class: 'eyebrow' }, greeting()), h('h1', { class: 'title sr-only' }, `Streak ${st.current} hari berturut-turut`)),
      h('div', { class: 'home' }, hero, todayPanel),
      h('dl', { class: 'stats' },
        stat('Akurasi', 'target', o.accuracy == null ? '–' : o.accuracy, o.accuracy == null ? '' : '%'),
        stat('Kuis selesai', 'quiz', String(o.attempts)),
        stat('Materi', 'book', String(o.documents)),
        stat('Waktu belajar', 'clock', fmtDur(o.study_seconds))),
      !hasDocs
        ? h('div', { style: 'margin-top:40px' }, emptyState('doc', 'Mulai dari satu materi', 'Unggah PDF, DOCX, PPTX, atau foto catatan. AI membuatkan catatannya, lalu kamu bisa menguji diri lewat kuis.', h('a', { class: 'btn', href: '#/materi' }, ico('upload', 18), 'Unggah materi')))
        : h('div', { class: 'two-col' },
          h('div', null,
            h('div', { class: 'sec-h' }, h('h2', { class: 'sec' }, 'Lanjutkan belajar'), h('a', { class: 'aside', href: '#/materi' }, 'Semua materi')),
            recent.length ? h('ul', { class: 'rows' }, recent.slice(0, 4).map(docItem))
              : h('p', { class: 'muted' }, 'Materi yang selesai diproses muncul di sini.')),
          h('div', null,
            h('div', { class: 'sec-h' }, h('h2', { class: 'sec' }, 'Perlu diulang')),
            d.weak_topics.length ? h('ul', { class: 'rows' }, d.weak_topics.map(topicRow))
              : h('p', { class: 'muted' }, o.answers ? 'Tidak ada topik lemah. Pertahankan.' : 'Kerjakan satu kuis dulu, topik yang sulit akan muncul di sini.'),
            d.recent_attempts.length > 0 && [
              h('div', { class: 'sec-h' }, h('h2', { class: 'sec' }, 'Hasil terbaru'), h('a', { class: 'aside', href: '#/progres' }, 'Progres')),
              h('ul', { class: 'rows' }, d.recent_attempts.slice(0, 3).map((a) => h('li', { class: 'row' },
                h('div', { class: 'grow' }, h('div', { class: 'name' }, h('a', { class: 'stretch', href: `#/hasil/${a.id}` }, a.title)), h('div', { class: 'meta' }, `${a.score} dari ${a.total} benar · ${relDay(a.ts)}`)),
                h('span', { class: 'scorepill ' + ({ good: 'hi', mid: 'mid', bad: 'lo' })[tone(a.pct)] }, `${a.pct}%`))))])),
      h('div', { class: 'sec-h' }, h('h2', { class: 'sec' }, 'Konsistensi belajar'), h('span', { class: 'aside num' }, `${active} hari belajar dalam 20 minggu`)),
      h('div', { class: 'split' },
        h('div', { class: 'card' }, heatmap(d.heatmap)),
        h('div', { class: 'card miles' }, h('h3', null, 'Pencapaian streak'),
          miles.map((m) => h('div', { class: 'mile' + (longest >= m ? ' got' : '') }, h('span', { class: 'b' }, longest >= m ? ico('trophy', 18) : String(m)), h('div', null, h('b', null, `${m} hari`), h('small', null, longest >= m ? 'Tercapai' : `Kurang ${m - longest}`)))))));
  }

  function topicRow(t) {
    return h('li', { class: 'row' },
      h('div', { class: 'grow' }, h('div', { class: 'name' }, t.topic), h('div', { class: 'meta' }, `${t.ok} benar dari ${t.n} jawaban`)),
      h('div', { class: 'pbar', style: 'width:min(180px,42%)' }, h('div', { class: 'bar ' + t.level }, h('i', { style: `width:${t.acc}%` })), h('span', { class: 'pct' }, t.acc + '%')));
  }

  function docItem(d) {
    const busy = d.status === 'queued' || d.status === 'processing';
    const meta = [d.subject_name, d.page_count ? `${d.page_count} halaman/slide` : null, relDay(d.created_at || d.updated_at)].filter(Boolean).join(' · ');
    return h('li', { class: 'row' },
      h('span', { class: 'tile', style: `--c:${d.subject_color || 'var(--brand)'}`, 'aria-hidden': 'true' }, fileKind(d.filename)),
      h('div', { class: 'grow' },
        h('div', { class: 'name' }, h('a', { class: 'stretch', href: `#/materi/${d.id}` }, d.title)),
        h('div', { class: 'meta' }, meta),
        busy && h('div', { class: 'small muted', style: 'margin-top:4px' }, d.job_message || 'Sedang diproses')),
      h('span', { class: 'go', 'aria-hidden': 'true' }, ico('chev', 18)));
  }

  function docCard(d) {
    const busy = d.status === 'queued' || d.status === 'processing';
    const meta = [d.page_count ? `${d.page_count} halaman/slide` : null, relDay(d.created_at || d.updated_at)].filter(Boolean).join(' · ');
    return h('li', { class: 'dcard', style: `--c:${d.subject_color || 'var(--brand)'}` },
      h('div', { class: 'hd' },
        h('span', { class: 'tile', 'aria-hidden': 'true' }, fileKind(d.filename)),
        d.subject_name
          ? h('span', { class: 'tag', title: d.subject_name, onClick: () => { location.hash = `#/materi/${d.id}`; } }, h('i', { class: 'dot' }), h('span', { class: 'tag-txt' }, d.subject_name))
          : h('span', { class: 'tag', title: 'Tanpa mata pelajaran', onClick: () => { location.hash = `#/materi/${d.id}`; } }, h('span', { class: 'tag-txt' }, 'Tanpa mata pelajaran'))),
      h('div', null, h('h3', null, h('a', { href: `#/materi/${d.id}` }, d.title)), h('div', { class: 'meta', style: 'margin-top:4px' }, meta)),
      busy && h('div', null,
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': Math.round(d.job_progress || 3), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: `width:${Math.round(d.job_progress || 3)}%` })),
        h('div', { class: 'small muted', style: 'margin-top:6px' }, h('span', { class: 'spin' }), d.job_message || 'Menunggu giliran')),
      d.status === 'error' && h('div', { class: 'err' }, d.error || 'Pemrosesan gagal. Buka untuk mencoba lagi.'),
      h('div', { class: 'ft' },
        d.status === 'ready' && h('span', null, d.quiz_count ? h('span', null, h('b', null, String(d.quiz_count)), ' kuis') : 'Belum ada kuis'),
        busy && h('span', null, 'Sedang dibuatkan catatan'),
        d.status === 'error' && h('span', { class: 'tag weak' }, 'Gagal'),
        d.status === 'ready' && d.error && h('span', { class: 'tag warn' }, 'sebagian gagal'),
        d.status === 'ready' && !d.error && h('span', { class: 'tag strong' }, 'Siap dipelajari')));
  }

  // ====================================================================== Materi (daftar)
  function subjectDialog(subject, onDone) {
    let color = subject ? subject.color : SUBJ_COLORS[Math.floor(Math.random() * SUBJ_COLORS.length)];
    const dlg = h('dialog', { class: 'dlg sm', 'aria-labelledby': 'sj-t' });
    const name = h('input', { type: 'text', maxlength: '60', required: true, value: subject ? subject.name : '', placeholder: 'Contoh: Biologi' });
    const err = h('p', { class: 'small', role: 'alert', style: 'color:var(--bad)' });
    const sw = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Warna' });
    const paint = () => fill(sw, SUBJ_COLORS.map((c) => h('button', { type: 'button', style: `--c:${c}`, 'aria-label': c, 'aria-pressed': String(c === color), onClick: () => { color = c; paint(); } })));
    paint();
    const close = () => { dlg.close(); dlg.remove(); };
    fill(dlg, h('h2', { id: 'sj-t' }, subject ? 'Ubah mata pelajaran' : 'Mata pelajaran baru'),
      h('form', { class: 'form', onSubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        try {
          if (subject) await rpc('update_subject', { id: subject.id, name: name.value.trim(), color });
          else await rpc('create_subject', { name: name.value.trim(), color });
          close();
          onDone();
        } catch (x) { err.textContent = x.message; }
      } },
      h('label', { class: 'field' }, 'Nama', name), h('div', { class: 'field' }, h('span', { style: 'font-weight:600;font-size:14px' }, 'Warna'), sw), err,
      h('div', { class: 'actions', style: 'justify-content:flex-end' }, h('button', { class: 'btn quiet', type: 'button', onClick: close }, 'Batal'), h('button', { class: 'btn', type: 'submit' }, 'Simpan'))));
    dlg.addEventListener('cancel', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    name.focus();
  }

  function manageSubjects(onChange) {
    const dlg = h('dialog', { class: 'dlg', 'aria-labelledby': 'ms-t' });
    const list = h('div', { class: 'sjlist' });
    const close = () => { dlg.close(); dlg.remove(); onChange(); };
    const paint = async () => {
      let data;
      try { data = await rpc('list_subjects'); } catch (e) { fill(list, h('p', { class: 'muted' }, e.message)); return; }
      state.subjects = data.subjects;
      fill(list, data.subjects.length ? data.subjects.map((x) => h('div', { class: 'row', style: `--c:${x.color}` },
        h('i', { class: 'dot' }), h('div', { class: 'grow' }, h('div', { class: 'name' }, x.name), h('div', { class: 'meta' }, `${x.doc_count} materi`)),
        h('button', { class: 'btn quiet sm', onClick: () => subjectDialog(x, paint) }, ico('edit', 15), 'Ubah'),
        h('button', { class: 'btn quiet sm', 'aria-label': `Hapus ${x.name}`, onClick: async () => {
          if (!(await ask({ title: `Hapus "${x.name}"?`, message: 'Materinya tidak ikut terhapus, hanya dipindah ke "Tanpa mata pelajaran".', confirm: 'Hapus', danger: true }))) return;
          try { await rpc('delete_subject', { id: x.id }); toast('Mata pelajaran dihapus'); paint(); } catch (e) { toast(e.message); }
        } }, ico('trash', 15)))) : h('p', { class: 'muted' }, 'Belum ada mata pelajaran.'));
    };
    fill(dlg, h('h2', { id: 'ms-t' }, 'Mata pelajaran'), list,
      h('div', { class: 'actions', style: 'justify-content:space-between' },
        h('button', { class: 'btn line', onClick: () => subjectDialog(null, paint) }, ico('plus', 16), 'Tambah'),
        h('button', { class: 'btn', onClick: close }, 'Selesai')));
    dlg.addEventListener('cancel', () => { dlg.remove(); onChange(); });
    document.body.append(dlg);
    dlg.showModal();
    paint();
  }

  async function libraryView(n, query) {
    const v = mount('Materi');
    fill(v, loading());
    const filter = query.s ? Number(query.s) : null;
    let subjects, docs;
    let q = '';
    let sort = store.get('belajar-sort', 'new');
    const load = async () => { [subjects, docs] = await Promise.all([rpc('list_subjects'), rpc('list_documents', { subject_id: filter })]); state.subjects = subjects.subjects; };
    try { await load(); } catch (e) { if (alive(n)) showError(v, e, () => libraryView(n, query)); return; }
    if (!alive(n)) return;

    const openUpload = () => uploadDialog(subjects.subjects, filter, (res) => { refreshSide(true); location.hash = `#/materi/${res.doc_id}`; });
    const listBox = h('div');
    const chipsBox = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter mata pelajaran', style: 'margin-bottom:18px' });
    const countEl = h('span', { class: 'aside' });
    const render = () => {
      fill(chipsBox,
        h('a', { class: 'chip', href: '#/materi', 'aria-pressed': String(!filter) }, 'Semua'),
        subjects.subjects.map((sj) => h('a', { class: 'chip', href: `#/materi?s=${sj.id}`, style: `--c:${sj.color}`, 'aria-pressed': String(filter === sj.id) }, h('i', { class: 'dot' }), `${sj.name} (${sj.doc_count})`)));
      let list = docs.documents.filter((d) => !q || (d.title + ' ' + (d.subject_name || '') + ' ' + d.filename).toLowerCase().includes(q));
      if (sort === 'az') list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'id'));
      else if (sort === 'quiz') list = [...list].sort((a, b) => (b.quiz_count || 0) - (a.quiz_count || 0));
      countEl.textContent = `${list.length} materi`;
      fill(listBox, list.length
        ? h('ul', { class: 'cards plain', style: 'list-style:none;padding:0' }, list.map(docCard))
        : docs.documents.length
          ? emptyState('doc', 'Tidak ada yang cocok', `Tidak ada materi yang cocok dengan "${q}".`, h('button', { class: 'btn line', onClick: () => { q = ''; search.value = ''; render(); } }, 'Hapus pencarian'))
          : emptyState('doc', filter ? 'Belum ada materi di mata pelajaran ini' : 'Belum ada materi', 'Unggah file pertamamu, lalu catatannya dibuat otomatis.', h('button', { class: 'btn', onClick: openUpload }, ico('upload', 18), 'Unggah materi')));
    };
    const search = h('input', { type: 'search', placeholder: 'Cari materi', 'aria-label': 'Cari materi', onInput: (e) => { q = e.target.value.trim().toLowerCase(); render(); } });
    const sortSel = h('select', { 'aria-label': 'Urutkan', onChange: (e) => { sort = e.target.value; store.set('belajar-sort', sort); render(); } },
      [['new', 'Terbaru'], ['az', 'Judul A–Z'], ['quiz', 'Paling banyak kuis']].map(([val, l]) => h('option', { value: val }, l)));
    sortSel.value = sort;
    fill(v,
      h('div', { class: 'pagehead' }, h('div', null, h('h1', { class: 'title' }, 'Materi'), h('p', { class: 'lede' }, 'Semua file yang sudah kamu unggah, lengkap dengan catatan dan kuisnya.')),
        h('button', { class: 'btn', onClick: openUpload }, ico('plus', 18), 'Unggah materi')),
      h('div', { class: 'toolbar' },
        h('label', { class: 'inwrap' }, ico('search', 18), search), sortSel,
        h('span', { class: 'sp' }), countEl,
        h('button', { class: 'btn line sm', onClick: () => manageSubjects(async () => { try { await load(); render(); refreshSide(true); } catch { /* */ } }) }, ico('folder', 15), 'Kelola mata pelajaran')),
      chipsBox, listBox);
    render();

    const tick = async () => {
      if (!alive(n)) return;
      if (docs.documents.some((d) => d.status === 'queued' || d.status === 'processing')) {
        await sleep(2500);
        if (!alive(n)) return;
        try { await load(); render(); } catch { /* coba lagi di putaran berikut */ }
        tick();
      }
    };
    tick();
  }

  function uploadDialog(subjects, presetSubject, onDone) {
    const dlg = h('dialog', { class: 'dlg', 'aria-labelledby': 'up-title' });
    const fileInput = h('input', { type: 'file', name: 'file', accept: '.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.gif,.bmp,.txt,.md', required: true });
    const fileName = h('span', { class: 'small muted' }, 'PDF, DOCX, PPTX, gambar, TXT, atau MD. Maksimal 40 MB.');
    const dropTitle = h('strong', null, 'Pilih file atau tarik ke sini');
    const drop = h('label', { class: 'drop' }, h('span', { class: 'ic' }, ico('upload', 22)), dropTitle, fileName, fileInput);
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0];
      if (!f) return;
      dropTitle.textContent = f.name;
      fileName.textContent = `${(f.size / 1048576).toFixed(1)} MB · klik untuk mengganti`;
      drop.classList.add('has');
    });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; fileInput.dispatchEvent(new Event('change')); } });

    const subj = h('select', { name: 'subject_id' }, h('option', { value: '' }, 'Tanpa mata pelajaran'),
      subjects.map((x) => h('option', { value: x.id, selected: presetSubject === x.id }, x.name)), h('option', { value: '__new' }, 'Mata pelajaran baru…'));
    const newSubj = h('input', { type: 'text', name: 'new_subject', placeholder: 'Nama mata pelajaran', maxlength: '60', hidden: true });
    subj.addEventListener('change', () => { newSubj.hidden = subj.value !== '__new'; if (!newSubj.hidden) newSubj.focus(); });
    const style = styleSelect({ name: 'style' });
    const styleNote = h('span', { class: 'hint' }, styleHint(style.value));
    style.addEventListener('change', () => { styleNote.textContent = styleHint(style.value); });
    const title = h('input', { type: 'text', name: 'title', maxlength: '120', placeholder: 'Kosongkan agar AI memilihkan judul' });
    const err = h('p', { class: 'small', role: 'alert', style: 'color:var(--bad)' });
    const submit = h('button', { class: 'btn', type: 'submit' }, 'Unggah dan buat catatan');
    const close = () => { dlg.close(); dlg.remove(); };
    const form = h('form', { class: 'form', onSubmit: async (e) => {
      e.preventDefault();
      if (!fileInput.files[0]) { err.textContent = 'Pilih file terlebih dahulu.'; return; }
      const fd = new FormData();
      fd.append('title', title.value.trim());
      fd.append('style', style.value);
      if (subj.value === '__new') fd.append('new_subject', newSubj.value.trim()); else fd.append('subject_id', subj.value);
      fd.append('file', fileInput.files[0]);
      submit.disabled = true;
      err.textContent = '';
      fill(submit, h('span', { class: 'spin' }), 'Mengunggah…');
      try { const res = await api('/api/upload', fd); close(); onDone(res.data); }
      catch (x) { err.textContent = x.message; submit.disabled = false; fill(submit, 'Unggah dan buat catatan'); }
    } },
    drop,
    h('label', { class: 'field' }, 'Judul (opsional)', title),
    h('div', { class: 'form two' }, h('label', { class: 'field' }, 'Mata pelajaran', subj, newSubj), h('label', { class: 'field' }, 'Gaya catatan', style, styleNote)),
    err,
    h('div', { class: 'actions', style: 'justify-content:flex-end' }, h('button', { class: 'btn quiet', type: 'button', onClick: close }, 'Batal'), submit));
    fill(dlg, h('h2', { id: 'up-title' }, 'Unggah materi'), form);
    dlg.addEventListener('cancel', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  // ====================================================================== Materi (detail)
  async function docView(n, id, query) {
    const v = mount('Materi');
    fill(v, loading());
    const TABS = ['catatan', 'mindmap', 'kuis'];
    let tab = TABS.includes(query.tab) ? query.tab : 'catatan';
    let data;
    let editing = false;
    let draft = '';
    let toc = [];
    let spy = null;
    const main = h('div', { class: 'doc-main' });
    const rail = h('aside', { class: 'doc-rail', 'aria-label': 'Alat materi' });
    const header = h('div', { class: 'dochead' });
    const body = h('div');
    const notesWrap = h('div'); // wadah persisten catatan: target tombol "Tanya" saat seleksi teks
    // Mind map: komponen dibuat sekali (saat tab pertama kali dibuka) dan dipakai ulang antar tab.
    let mm = null;
    const mmHost = h('div');
    function findInNotes(text) {
      tab = 'catatan'; editing = false; renderBody(); renderRail();
      const needle = String(text).toLowerCase();
      const pick = (sel) => $$(sel, notesWrap).find((e) => e.textContent.toLowerCase().includes(needle));
      const hit = pick('h2, h3, h4') || pick('strong') || pick('p, li, td, th');
      if (!hit) { toast('Istilah itu tidak ditemukan di catatan'); return; }
      hit.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
      hit.classList.add('flash');
      setTimeout(() => hit.classList.remove('flash'), 1900);
    }
    function showMindmap() {
      if (!mm && window.Belajar.mindmap) { mm = window.Belajar.mindmap.create({ docId: id, n, onFind: findInNotes }); fill(mmHost, mm.el); }
      else if (mm) mm.reload();                  // segarkan status "usang" bila catatan berubah
      return mmHost;
    }
    const timerText = h('span', null, 'Waktu belajar 00:00');
    const clock = h('span', { class: 'timer' }, ico('clock', 16), timerText);

    const load = async () => { data = await rpc('get_document', { id }); };
    try { await load(); } catch (e) { if (alive(n)) showError(v, e, () => docView(n, id, query)); return; }
    if (!alive(n)) return;
    startStudyTimer(n, id, timerText);

    // Panel Tanya: seleksi teks pada catatan → tombol "Tanya" → penjelasan singkat + lanjut bertanya
    const askPanel = mountAskPanel(id);
    selectionButton(notesWrap, {
      label: 'Tanya', icon: 'bulb',
      onPick: (text) => askPanel.open(text),
      enabled: () => tab === 'catatan' && !editing && data.document.status === 'ready' && !!data.note,
    });

    const act = async (fn, okMsg) => {
      try { await fn(); if (okMsg) toast(okMsg); await load(); if (alive(n)) renderAll(); poll(); }
      catch (e) { toast(e.message); }
    };

    function renderHeader() {
      const d = data.document;
      const best = data.quizzes.reduce((m, z) => (z.best_pct != null && z.best_pct > m ? z.best_pct : m), -1);
      fill(header,
        h('a', { class: 'back', href: '#/materi' }, ico('back', 16), 'Semua materi'),
        h('div', { class: 'meta-line', style: 'margin:0 0 8px' }, data.subject && h('span', { class: 'tag', title: data.subject.name, style: `--c:${data.subject.color}` }, h('i', { class: 'dot' }), h('span', { class: 'tag-txt' }, data.subject.name)),
          d.status === 'ready' && data.note && data.note.edited ? h('span', { class: 'tag brand' }, 'Sudah kamu edit') : null),
        h('h1', { class: 'title' }, d.title),
        h('div', { class: 'meta-line' }, [d.filename, d.page_count ? `${d.page_count} halaman/slide` : null, relDay(d.created_at)].filter(Boolean).map((t) => h('span', null, t))),
        d.status === 'ready' && h('div', { class: 'docstats' },
          h('span', { class: 'pill' }, ico('quiz', 15), h('b', null, String(data.quizzes.length)), 'kuis'),
          best >= 0 && h('span', { class: 'pill' }, ico('trophy', 15), 'Skor terbaik', h('b', null, best + '%')),
          data.note && h('span', { class: 'pill' }, ico('book', 15), h('b', null, String(Math.max(1, Math.round(data.note.content_md.split(/\s+/).length / 200)))), 'menit baca'),
          h('a', { class: 'btn sm line', href: `#/chat/${id}`, title: 'Tanya AI tentang materi ini' }, ico('chat', 16), 'Chat AI')));
    }

    function renderRail() {
      const d = data.document;
      const ready = d.status === 'ready' && data.note;
      if (!ready) { fill(rail); return; }
      const styleSel = styleSelect({ 'aria-label': 'Gaya catatan' });
      styleSel.value = d.style || 'ringkas';
      const fs = getFont() || parseInt(getComputedStyle(document.documentElement).getPropertyValue('--fs'), 10) || 18;
      fill(rail,
        tab === 'catatan' && !editing && toc.length > 0 && h('div', { class: 'rail-sec tocwrap' }, h('h3', null, 'Isi catatan'),
          h('div', { class: 'toc' }, toc.map((t, i) => h('button', { type: 'button', 'data-i': i, onClick: () => t.el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }) }, t.text)))),
        h('div', { class: 'rail-sec' }, h('h3', null, 'Alat'),
          h('div', { class: 'rail-actions' },
            tab === 'catatan' && (editing
              ? [h('button', { class: 'btn sm', onClick: async () => {
                try { await rpc('save_note', { document_id: id, content_md: draft }); data.note.content_md = draft; data.note.edited = 1; editing = false; toast('Catatan disimpan'); renderAll(); }
                catch (e) { toast(e.message); }
              } }, ico('check', 16), 'Simpan catatan'), h('button', { class: 'btn quiet sm', onClick: () => { editing = false; renderBody(); renderRail(); } }, 'Batal')]
              : [h('button', { class: 'btn line sm', onClick: () => { editing = true; draft = data.note.content_md; renderBody(); renderRail(); } }, ico('edit', 16), 'Edit catatan'),
                h('button', { class: 'btn line sm', onClick: () => downloadMd(d.title, data.note.content_md) }, ico('download', 16), 'Unduh .md'),
                h('button', { class: 'btn line sm', onClick: () => window.print() }, ico('print', 16), 'Cetak'),
                h('button', { class: 'btn line sm', onClick: () => { tab = 'kuis'; renderBody(); renderRail(); } }, ico('quiz', 16), 'Buat kuis'),
              ]),
            h('button', { class: 'btn quiet sm', onClick: async () => {
              const t = await ask({ title: 'Ganti judul', input: { value: d.title, label: 'Judul baru', placeholder: 'Judul materi' }, confirm: 'Simpan' });
              if (t && t.trim()) act(() => rpc('update_document', { id, title: t.trim() }), 'Judul diperbarui');
            } }, 'Ganti judul'),
            h('button', { class: 'btn danger sm', onClick: async () => {
              if (!(await ask({ title: 'Hapus materi ini?', message: `"${d.title}" beserta catatan, kuis, dan filenya akan dihapus permanen.`, confirm: 'Hapus', danger: true }))) return;
              try { await rpc('delete_document', { id }); toast('Materi dihapus'); refreshSide(true); location.hash = '#/materi'; } catch (e) { toast(e.message); }
            } }, ico('trash', 16), 'Hapus materi'))),
        tab === 'catatan' && !editing && h('div', { class: 'rail-sec' }, h('h3', null, 'Tampilan baca'),
          h('div', { class: 'fsz' }, h('button', { class: 'btn line sm', 'aria-label': 'Perkecil huruf', onClick: () => { applyFont(fs - 1); renderRail(); } }, 'A−'), h('span', { class: 'small muted num' }, `${fs}px`), h('button', { class: 'btn line sm', 'aria-label': 'Perbesar huruf', onClick: () => { applyFont(fs + 1); renderRail(); } }, 'A+')),
          h('div', { class: 'seg', role: 'group', 'aria-label': 'Jenis huruf', style: 'margin-top:10px' },
            [['soft', 'Lembut'], ['serif', 'Serif']].map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(getReadFont() === v), onClick: () => { applyReadFont(v); renderRail(); } }, l)))),
        tab === 'catatan' && !editing && h('div', { class: 'rail-sec' }, h('h3', null, 'Buat ulang catatan'),
          h('div', { class: 'actions', style: 'flex-wrap:nowrap' }, styleSel,
            h('button', { class: 'btn line sm', onClick: async () => {
              if (data.note.edited && !(await ask({ title: 'Ganti catatan hasil editanmu?', message: 'Catatan yang sudah kamu edit akan diganti dengan versi baru.', confirm: 'Buat ulang', danger: true }))) return;
              act(() => rpc('reprocess_document', { id, style: styleSel.value, force: true }), 'Membuat ulang catatan');
            } }, 'Buat'))),
        clock);
      observeToc();
    }

    function observeToc() {
      if (spy) { spy.disconnect(); spy = null; }
      if (!toc.length || typeof IntersectionObserver === 'undefined') return;
      spy = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = toc.findIndex((t) => t.el === e.target);
          $$('.toc button', rail).forEach((b) => b.setAttribute('aria-current', String(Number(b.dataset.i) === i)));
        }
      }, { rootMargin: '-20px 0px -70% 0px' });
      toc.forEach((t) => spy.observe(t.el));
    }
    onCleanup(() => { if (spy) spy.disconnect(); });

    function processingPanel() {
      const j = data.job || {};
      const p = Math.round(j.progress || 3);
      return h('div', { class: 'card' },
        h('h2', { class: 'sec', style: 'margin-bottom:10px' }, 'Catatan sedang dibuat'),
        h('p', { style: 'margin-bottom:14px' }, h('span', { class: 'spin' }), j.message || 'Menunggu giliran diproses'),
        h('div', { class: 'bar tall', role: 'progressbar', 'aria-valuenow': p, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: `width:${p}%` })),
        h('p', { class: 'small muted', style: 'margin-top:12px' }, 'Materi panjang bisa memakan beberapa menit. Halaman ini boleh ditinggalkan, prosesnya tetap berjalan.'));
    }

    function notesTab() {
      const d = data.document;
      const wrap = h('div');
      toc = [];
      if (d.warning) wrap.append(h('div', { class: 'notice warn' }, h('p', null, d.warning)));
      if (d.error) wrap.append(h('div', { class: 'notice warn' }, h('p', null, d.error),
        h('div', { class: 'actions' }, h('button', { class: 'btn sm', onClick: () => act(() => rpc('reprocess_document', { id }), 'Mencoba lagi bagian yang gagal') }, 'Coba lagi'))));
      if (!data.note) { wrap.append(h('p', { class: 'muted' }, 'Catatan belum tersedia.')); return wrap; }
      if (editing) {
        const ta = h('textarea', { class: 'editor', 'aria-label': 'Isi catatan (Markdown)', spellcheck: 'false' });
        ta.value = draft;
        ta.addEventListener('input', () => { draft = ta.value; });
        wrap.append(h('p', { class: 'small muted', style: 'margin-bottom:10px' }, 'Tulis dalam Markdown: # judul, **tebal**, - daftar, | tabel |.'), ta);
      } else {
        const el = sheet(data.note.content_md);
        const first = $('h1', el);
        if (first && first.textContent.trim().toLowerCase() === d.title.trim().toLowerCase()) first.remove(); // judul sudah ada di kepala halaman
        $$('h2', el).forEach((hd, i) => { hd.id = `bagian-${i}`; toc.push({ el: hd, text: hd.textContent }); });
        wrap.append(el);
      }
      return wrap;
    }

    function quizTab() {
      const d = data.document;
      const list = data.quizzes.length
        ? h('ul', { class: 'rows' }, data.quizzes.map((z) => quizRow(z, () => act(async () => {}))))
        : emptyState('quiz', 'Belum ada kuis', 'Buat satu kuis di bawah. Soalnya diambil dari seluruh isi materi, lengkap dengan pembahasan.');
      return h('div', null, list, h('div', { class: 'sec-h' }, h('h2', { class: 'sec' }, 'Buat kuis baru')),
        h('div', { class: 'panel', style: 'max-width:600px' }, quizForm({ document_id: id }, n, () => { toast('Kuis siap dikerjakan'); act(async () => {}); }, d.status !== 'ready')));
    }

    function renderBody() {
      const d = data.document;
      toc = [];
      if (d.status === 'queued' || d.status === 'processing') { fill(body, processingPanel()); return; }
      if (d.status === 'error') {
        fill(body, h('div', { class: 'notice bad', role: 'alert' }, h('p', null, d.error || 'Pemrosesan gagal.'),
          h('div', { class: 'actions' },
            h('button', { class: 'btn sm', onClick: () => act(() => rpc('reprocess_document', { id }), 'Mencoba lagi') }, 'Coba lagi'),
            h('button', { class: 'btn line sm', onClick: () => act(() => rpc('reprocess_document', { id, reextract: true }), 'Membaca ulang file') }, 'Baca ulang file'))));
        return;
      }
      const tabs = h('div', { class: 'tabs', role: 'tablist' },
        TABS.map((t) => h('button', { role: 'tab', 'aria-selected': String(tab === t), onClick: () => { tab = t; editing = false; renderBody(); renderRail(); } },
          t === 'catatan' ? 'Catatan' : t === 'mindmap' ? 'Mind map' : `Kuis (${data.quizzes.length})`)),
        h('a', { class: 'btn sm line', href: `#/chat/${id}`, style: 'margin-left:auto', title: 'Tanya AI tentang materi ini' }, ico('chat', 15), 'Chat AI'));
      if (tab === 'catatan') { fill(notesWrap, notesTab()); fill(body, tabs, notesWrap); }
      else if (tab === 'mindmap') fill(body, tabs, showMindmap());
      else fill(body, tabs, quizTab());
    }
    function renderAll() { renderHeader(); renderBody(); renderRail(); }

    async function poll() {
      for (;;) {
        const d = data.document;
        if (!(d.status === 'queued' || d.status === 'processing')) return;
        await sleep(2000);
        if (!alive(n)) return;
        try { await load(); } catch { continue; }
        if (!alive(n)) return;
        const d2 = data.document;
        if (d2.status === 'queued' || d2.status === 'processing') fill(body, processingPanel());
        else { renderAll(); refreshSide(true); return; }
      }
    }

    // bilah progres baca
    const bar = h('i');
    const readbar = h('div', { class: 'readbar', 'aria-hidden': 'true' }, bar);
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0) + '%';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onCleanup(() => window.removeEventListener('scroll', onScroll));

    fill(main, header, body);
    fill(v, readbar, h('div', { class: 'doc' }, main, rail));
    renderAll();
    poll();
  }

  function startStudyTimer(n, docId, label) {
    let pending = 0;
    const clock = activeClock((secs) => {
      pending++;
      if (label.isConnected) label.textContent = `Waktu belajar ${mmss(secs)}`;
      if (pending >= 30) flush();
    });
    async function flush() {
      if (pending <= 0) return;
      const sec = Math.min(pending, 120);
      pending -= sec;
      try { const r = await rpc('log_study', { document_id: docId, seconds: sec }); if (r && r.streak) setSideStreak(r.streak); }
      catch { pending = Math.min(pending + sec, 600); }
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden' && pending > 0 && navigator.sendBeacon) {
        const sec = Math.min(pending, 120);
        if (navigator.sendBeacon('/api/rpc/log_study', new Blob([JSON.stringify({ document_id: docId, seconds: sec })], { type: 'application/json' }))) pending -= sec;
      }
    };
    document.addEventListener('visibilitychange', onHide);
    onCleanup(() => { document.removeEventListener('visibilitychange', onHide); clock.stop(); flush(); });
  }

  function downloadMd(title, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = h('a', { href: url, download: title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) + '.md' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ====================================================================== panel tanya pada catatan
  // Kartu samping (desktop) / bottom sheet (mobile) untuk bertanya tentang teks yang
  // diseleksi pada catatan. Bersesi: pertanyaan pertama menginjeksi konteks materi
  // (mode NEW), pertanyaan berikutnya melanjutkan sesi gateway yang sama (CONTINUE).
  const ASK_DEFAULT_QUESTION = 'Jelaskan teks yang saya kutip ini dengan bahasa sederhana.';
  function mountAskPanel(docId) {
    let quote = null;
    let askSessionId = null; // null = belum ada sesi -> pertanyaan berikutnya mode NEW
    let asking = false;

    const root = h('aside', { class: 'ask-panel', 'aria-label': 'Panel tanya AI', hidden: true });
    const quoteBox = h('div', { class: 'ask-quote', hidden: true });
    const threadEl = h('div', { class: 'ask-thread' });
    const inputEl = h('input', { type: 'text', class: 'ask-input', placeholder: 'Lanjut tanya…', 'aria-label': 'Pertanyaan lanjutan', maxlength: '500', autocomplete: 'off' });
    const sendBtn = h('button', { class: 'ask-send', type: 'submit', 'aria-label': 'Kirim pertanyaan' }, ico('send', 16));

    function close() { root.hidden = true; }

    const threadScroll = () => { threadEl.scrollTop = threadEl.scrollHeight; };

    function renderQuote() {
      if (!quote) { quoteBox.hidden = true; return; }
      const plain = quote.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')
        .replace(/^#{1,6}\s+/gm, '').replace(/\s+/g, ' ').trim();
      quoteBox.hidden = false;
      fill(quoteBox,
        h('div', { class: 'ask-quote-head' }, ico('reply', 12), 'Teks yang ditanyakan'),
        h('div', { class: 'ask-quote-text' }, plain.length > 220 ? plain.slice(0, 220) + '…' : plain));
    }

    function exchange(qText) {
      const ans = h('div', { class: 'ask-answer' });
      threadEl.append(h('div', { class: 'ask-item' },
        h('div', { class: 'ask-q' }, qText.length > 160 ? qText.slice(0, 160) + '…' : qText),
        ans));
      threadScroll();
      return ans;
    }

    async function askStream(question) {
      asking = true;
      sendBtn.disabled = true;
      inputEl.disabled = true;
      const ans = exchange(question);
      fill(ans, h('div', { class: 'ask-thinking' },
        h('div', { class: 'typing-dots' }, h('span'), h('span'), h('span')),
        h('span', { class: 'thinking-label' }, askSessionId ? 'menulis…' : 'membaca materi & menjawab…')));
      let smoother = null;
      let streamed = false;
      try {
        dropCache();
        const resp = await fetch('/api/notes/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_id: docId, quote, question, ask_session_id: askSessionId }),
        });
        if (resp.ok && resp.body && (resp.headers.get('content-type') || '').includes('text/event-stream')) {
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          let finalData = null;
          let started = false;
          const render = (content, showCursor) => {
            if (!started) { started = true; fill(ans); }
            let mdHtml = renderMarkdown(content);
            if (showCursor) {
              if (mdHtml.endsWith('</p>')) mdHtml = mdHtml.slice(0, -4) + '<span class="chat-cursor"></span></p>';
              else mdHtml += '<span class="chat-cursor"></span>';
            }
            ans.innerHTML = `<div class="sheet">${mdHtml}</div>`;
            threadScroll();
          };
          smoother = createSmoother(render);
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              const lines = buf.split('\n');
              buf = lines.pop();
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data: ')) continue;
                let ev;
                try { ev = JSON.parse(trimmed.slice(6)); } catch { continue; }
                if (ev.type === 'chunk' && ev.chunk) smoother.push(ev.chunk);
                else if (ev.type === 'done' && ev.data) { finalData = ev.data; smoother.finish(ev.data.answer); }
                else if (ev.type === 'error') throw new Error(ev.error || 'Kesalahan pada respon AI');
              }
            }
          } finally {
            smoother.finish();
          }
          await smoother.done;
          streamed = true;
          if (finalData && finalData.ask_session_id) askSessionId = finalData.ask_session_id;
        }
      } catch (err) {
        if (smoother) smoother.abort();
        if (!streamed) console.warn('Fallback ke non-streaming notes ask:', err);
      }
      if (!streamed) {
        try {
          const r = await rpc('notes_ask', { document_id: docId, quote, question, ask_session_id: askSessionId });
          fill(ans, sheet(r.answer));
          if (r.ask_session_id) askSessionId = r.ask_session_id;
          threadScroll();
        } catch (e) {
          fill(ans, h('p', { class: 'ask-err', role: 'alert' }, e.message));
        }
      }
      asking = false;
      sendBtn.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();
    }

    function open(text) {
      quote = text.trim().slice(0, 2000);
      threadEl.replaceChildren();
      renderQuote();
      root.hidden = false;
      // sesi gateway dipertahankan antar-seleksi: AI sudah memahami materi (mode CONTINUE)
      askStream(ASK_DEFAULT_QUESTION);
    }

    const form = h('form', { class: 'ask-form', onSubmit: (e) => {
      e.preventDefault();
      const text = inputEl.value.trim();
      if (!text || asking) return;
      inputEl.value = '';
      askStream(text);
    } }, inputEl, sendBtn);

    fill(root,
      h('header', { class: 'ask-head' },
        h('div', { class: 'ask-head-txt' },
          h('span', { class: 'ask-title' }, ico('bulb', 15), 'Tanya AI'),
          h('span', { class: 'ask-sub' }, 'Penjelasan singkat dari teks yang kamu pilih')),
        h('button', { class: 'chat-iconbtn', type: 'button', title: 'Tutup panel', 'aria-label': 'Tutup panel tanya AI', onClick: close }, ico('x', 17))),
      quoteBox,
      threadEl,
      h('div', { class: 'ask-foot' }, form,
        h('div', { class: 'ask-hint' }, h('kbd', null, 'Enter'), ' kirim · jawaban oleh ', ico('spark', 11), ' DeepSeek')));

    document.body.append(root);
    onCleanup(() => {
      root.remove();
      // sesi panel dibebaskan di gateway saat halaman materi ditinggalkan (best effort)
      if (askSessionId) api('/api/rpc/notes_ask_delete', { ask_session_id: askSessionId }).catch(() => {});
    });
    return { open, close };
  }

  // ====================================================================== form & daftar kuis
  function quizForm(target, n, onDone, disabled) {
    const count = h('select', { name: 'count' }, [5, 10, 15, 20, 30].map((c) => h('option', { value: c, selected: c === 10 }, `${c} soal`)));
    const diff = h('select', { name: 'difficulty' }, [['mixed', 'Campuran'], ['easy', 'Mudah'], ['medium', 'Sedang'], ['hard', 'Sulit']].map(([val, l]) => h('option', { value: val }, l)));
    const qual = h('select', { name: 'quality' }, h('option', { value: 'normal' }, 'Cepat'), h('option', { value: 'high' }, 'Teliti (AI berpikir lebih lama)'));
    const types = [['mcq', 'Pilihan ganda', true], ['tf', 'Benar atau salah', true], ['short', 'Isian singkat', false]]
      .map(([val, l, on]) => ({ val, el: h('input', { type: 'checkbox', value: val, checked: on }), l }));
    const err = h('p', { class: 'small', role: 'alert', style: 'color:var(--bad)' });
    const prog = h('div', { hidden: true, class: 'notice soft' });
    const btn = h('button', { class: 'btn', type: 'submit', disabled }, ico('spark', 18), 'Buat kuis');
    return h('form', { class: 'form', onSubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      const chosen = types.filter((t) => t.el.checked).map((t) => t.val);
      if (!chosen.length) { err.textContent = 'Pilih minimal satu jenis soal.'; return; }
      btn.disabled = true;
      try {
        const { job_id } = await rpc('generate_quiz', { ...target, count: Number(count.value), difficulty: diff.value, quality: qual.value, types: chosen });
        prog.hidden = false;
        const label = h('p', null, h('span', { class: 'spin' }), h('span', null, 'Menyusun soal…'));
        const bar = h('i', { style: 'width:3%' });
        fill(prog, label, h('div', { class: 'bar tall' }, bar));
        const job = await pollJob(job_id, n, (j) => { bar.style.width = Math.max(3, j.progress) + '%'; label.lastChild.textContent = j.message || 'Menyusun soal…'; });
        if (!job) return;
        if (job.status === 'failed') { err.textContent = job.error || 'Gagal membuat kuis.'; prog.hidden = true; btn.disabled = false; return; }
        if (job.result && job.result.count < job.result.requested) toast(`Terbentuk ${job.result.count} dari ${job.result.requested} soal (sisanya duplikat atau tidak valid).`);
        onDone(job.result);
      } catch (x) { err.textContent = x.message; prog.hidden = true; btn.disabled = false; }
    } },
    h('div', { class: 'form two' }, h('label', { class: 'field' }, 'Jumlah soal', count), h('label', { class: 'field' }, 'Tingkat kesulitan', diff)),
    h('fieldset', { class: 'group' }, h('legend', null, 'Jenis soal'), types.map((t) => h('label', { class: 'check' }, t.el, t.l))),
    h('label', { class: 'field' }, 'Kualitas', qual, h('span', { class: 'hint' }, 'Mode teliti memakai Qwen berpikir: lebih lambat, soalnya biasanya lebih tajam.')),
    err, prog, h('div', { class: 'actions' }, btn, disabled && h('span', { class: 'small muted' }, 'Tunggu pemrosesan materi selesai.')));
  }

  function quizRow(z, refresh) {
    const start = async (mode) => {
      try {
        let limit;
        if (mode === 'exam') {
          const input = await ask({ title: 'Mulai ujian', message: 'Jawaban tidak diperiksa sampai dikumpulkan. Kuis otomatis dikumpulkan saat waktu habis.', input: { type: 'number', value: String(Math.max(1, z.question_count)), min: '1', max: '240', label: 'Batas waktu (menit)' }, confirm: 'Mulai' });
          if (input === null) return;
          limit = Math.max(1, Math.min(240, parseInt(input, 10) || z.question_count));
        }
        const r = await rpc('start_attempt', { quiz_id: z.id, mode, time_limit_min: limit, shuffle: mode === 'exam' });
        location.hash = `#/latihan/${r.attempt.id}`;
      } catch (e) { toast(e.message); }
    };
    return h('li', { class: 'row' },
      h('div', { class: 'grow' }, h('div', { class: 'name' }, z.title),
        h('div', { class: 'meta' }, [`${z.question_count} soal`, z.attempt_count ? `${z.attempt_count}× dikerjakan` : 'belum dikerjakan', z.source_title && z.title.indexOf(z.source_title) < 0 ? z.source_title : null, relDay(z.created_at)].filter(Boolean).join(' · '))),
      z.last_pct != null && h('span', { class: 'scorepill ' + ({ good: 'hi', mid: 'mid', bad: 'lo' })[tone(z.last_pct)], title: 'Skor terakhir' }, `${z.last_pct}%`),
      h('div', { class: 'actions' },
        h('button', { class: 'btn sm', onClick: () => start('practice') }, 'Latihan'),
        h('button', { class: 'btn line sm', onClick: () => start('exam') }, 'Ujian'),
        h('button', { class: 'btn quiet sm', 'aria-label': `Hapus ${z.title}`, title: 'Hapus kuis', onClick: async () => {
          if (!(await ask({ title: 'Hapus kuis ini?', message: 'Soal dan riwayat pengerjaannya ikut terhapus.', confirm: 'Hapus', danger: true }))) return;
          try { await rpc('delete_quiz', { id: z.id }); toast('Kuis dihapus'); if (refresh) refresh(); } catch (e) { toast(e.message); }
        } }, ico('trash', 16))));
  }

  async function quizzesView(n) {
    const v = mount('Kuis');
    fill(v, loading());
    let quizzes, subjects, prog;
    const load = async () => { [quizzes, subjects, prog] = await Promise.all([rpc('list_quizzes'), rpc('list_subjects'), rpc('progress')]); };
    try { await load(); } catch (e) { if (alive(n)) showError(v, e, () => quizzesView(n)); return; }
    if (!alive(n)) return;

    const render = () => {
      const formBox = h('div');
      const usable = subjects.subjects.filter((x) => x.doc_count > 0);
      const subjSel = h('select', { 'aria-label': 'Mata pelajaran untuk kuis gabungan' }, usable.map((x) => h('option', { value: x.id }, `${x.name} (${x.doc_count} materi)`)));
      fill(v,
        h('div', { class: 'pagehead' }, h('div', null, h('h1', { class: 'title' }, 'Kuis'), h('p', { class: 'lede' }, 'Kerjakan latihan, ujian bertimer, atau ulangi soal yang masih salah.'))),
        h('div', { class: 'quiz-layout' },
          h('div', null,
            prog.weak_count > 0 && h('div', { class: 'notice soft', style: 'margin-top:0' },
              h('p', null, h('strong', null, `${prog.weak_count} soal lemah`), ' menunggu diulang. Soal yang jawaban terakhirnya salah masuk ke sini.'),
              h('div', { class: 'actions' }, h('button', { class: 'btn sm', onClick: startReview }, ico('refresh', 16), 'Ulangi soal lemah'))),
            quizzes.quizzes.length
              ? h('ul', { class: 'rows' }, quizzes.quizzes.map((z) => quizRow(z, async () => { await load(); render(); })))
              : emptyState('quiz', 'Belum ada kuis', 'Buka salah satu materi lalu buat kuis dari tab Kuis, atau buat kuis gabungan per mata pelajaran.', h('a', { class: 'btn', href: '#/materi' }, 'Pilih materi'))),
          usable.length > 0 && h('aside', { class: 'side2' }, h('div', { class: 'panel' },
            h('h2', null, 'Kuis gabungan'),
            h('p', { class: 'muted small', style: 'margin-bottom:16px' }, 'Soal diambil dari semua materi yang siap di satu mata pelajaran. Cocok untuk persiapan ujian.'),
            h('label', { class: 'field', style: 'margin-bottom:16px' }, 'Mata pelajaran', subjSel), formBox))));
      if (usable.length) {
        const mountForm = () => fill(formBox, quizForm({ subject_id: Number(subjSel.value) }, n, async () => { toast('Kuis gabungan siap'); await load(); if (alive(n)) render(); }, false));
        subjSel.addEventListener('change', mountForm);
        mountForm();
      }
    };
    render();
  }

  // ====================================================================== pengerjaan kuis
  async function runnerView(n, id) {
    const v = mount('Kuis');
    fill(v, loading());
    let data;
    try { data = await rpc('get_attempt', { attempt_id: id }); } catch (e) { if (alive(n)) showError(v, e, () => runnerView(n, id)); return; }
    if (!alive(n)) return;
    if (data.attempt.finished_at) { location.replace(`#/hasil/${id}`); return; }

    const attempt = data.attempt;
    const qs = data.questions;
    const exam = attempt.mode === 'exam';
    const storeKey = `belajar-exam-${id}`;
    let answers = {};
    if (exam) { try { answers = JSON.parse(store.get(storeKey, '{}')); } catch { answers = {}; } }
    const saveAnswers = () => store.set(storeKey, JSON.stringify(answers));
    let idx = exam ? 0 : Math.max(0, qs.findIndex((q) => !q.revealed));
    const clock = activeClock();
    const box = h('div');
    const clockEl = h('span', { class: 'clock', 'aria-label': 'Sisa waktu' });
    let finishing = false;
    const answered = (q) => (exam ? answers[q.id] !== undefined && answers[q.id] !== '' : !!q.revealed);

    async function finish(auto) {
      if (finishing) return;
      if (exam && !auto) {
        const blank = qs.filter((q) => !answered(q)).length;
        if (!(await ask({ title: 'Kumpulkan jawaban?', message: blank ? `${blank} soal belum dijawab.` : 'Semua soal sudah dijawab.', confirm: 'Kumpulkan' }))) return;
      }
      finishing = true;
      try {
        await rpc('finish_attempt', { attempt_id: id, answers, duration: clock.seconds });
        store.del(storeKey);
        location.hash = `#/hasil/${id}`;
      } catch (e) { finishing = false; toast(e.message); }
    }

    if (exam && attempt.time_limit) {
      const tick = () => {
        const left = Math.max(0, Math.round(attempt.time_limit - (Date.now() / 1000 - attempt.started_at)));
        fill(clockEl, ico('clock', 18), mmss(left));
        clockEl.classList.toggle('low', left <= 60);
        if (left === 0) { toast('Waktu habis. Jawaban dikumpulkan otomatis.'); finish(true); }
      };
      tick();
      const t = setInterval(tick, 1000);
      onCleanup(() => clearInterval(t));
    }

    async function check(q, given) {
      try {
        const r = await rpc('check_answer', { attempt_id: id, question_id: q.id, given });
        Object.assign(q, r, { given, revealed: true });
        render();
      } catch (e) { toast(e.message); }
    }

    function optionButton(i, label, st) {
      return h('button', { class: 'opt' + (st.ok ? ' ok' : '') + (st.no ? ' no' : ''), type: 'button', disabled: st.locked, 'aria-pressed': String(!!st.chosen), 'data-i': i, onClick: st.onClick },
        h('span', { class: 'k', 'aria-hidden': 'true' }, st.ok ? ico('check', 17) : st.no ? ico('x', 17) : String.fromCharCode(65 + i)),
        h('span', { class: 'lbl' }, label),
        st.ok && h('span', { class: 'tagtxt', style: 'color:var(--good)' }, 'Jawaban benar'),
        st.no && h('span', { class: 'tagtxt', style: 'color:var(--bad)' }, 'Jawabanmu'));
    }

    function questionView(q) {
      const wrap = h('div');
      wrap.append(h('div', { class: 'qtext' }, q.question));
      const revealed = !exam && q.revealed;
      const current = exam ? answers[q.id] : q.given;
      if (q.qtype === 'mcq' || q.qtype === 'tf') {
        const opts = q.qtype === 'mcq' ? q.options : ['Benar', 'Salah'];
        const valueOf = (i) => (q.qtype === 'mcq' ? String(i) : (i === 0 ? 'true' : 'false'));
        wrap.append(h('div', { class: 'opts', role: 'group', 'aria-label': 'Pilihan jawaban' }, opts.map((label, i) => {
          const val = valueOf(i);
          return optionButton(i, label, {
            chosen: current === val, locked: revealed,
            ok: revealed && q.answer === val, no: revealed && current === val && q.answer !== val,
            onClick: () => { if (exam) { answers[q.id] = val; saveAnswers(); render(); } else check(q, val); },
          });
        })));
      } else {
        const input = h('input', { type: 'text', 'aria-label': 'Jawabanmu', placeholder: 'Ketik jawabanmu', autocomplete: 'off', disabled: revealed, maxlength: '300' });
        input.value = current || '';
        if (exam) input.addEventListener('input', () => { answers[q.id] = input.value; saveAnswers(); render.segsOnly(); });
        wrap.append(h('form', { class: 'short actions', onSubmit: (e) => { e.preventDefault(); if (!exam && !revealed && input.value.trim()) check(q, input.value.trim()); } },
          input, !exam && !revealed && h('button', { class: 'btn', type: 'submit' }, 'Periksa')));
        if (!exam && !revealed) setTimeout(() => input.focus(), 0);
      }
      if (revealed) {
        const kind = q.correct === true ? 'ok' : q.correct === false ? 'no' : '';
        const text = q.correct === true ? 'Benar' : q.correct === false ? 'Belum tepat' : 'Jawabanmu akan dinilai di akhir';
        wrap.append(h('div', { class: 'feedback ' + kind, role: 'status' },
          h('div', { class: 'verdict' }, kind === 'ok' && ico('check', 20), kind === 'no' && ico('x', 20), text),
          q.qtype === 'short' && h('p', null, 'Kunci jawaban: ', h('strong', null, q.answer_text)),
          q.explanation && h('p', { class: 'why' }, q.explanation),
          q.source && h('p', { class: 'small muted' }, `Sumber: ${q.source}`)));
      }
      return wrap;
    }

    function segs() {
      return h('div', { class: 'segs', role: exam ? 'group' : 'img', 'aria-label': exam ? 'Loncat ke soal' : `Soal ${idx + 1} dari ${qs.length}` },
        qs.map((x, i) => {
          const cls = i === idx ? 'cur' : (!exam && x.revealed) ? (x.correct === true ? 'ok' : x.correct === false ? 'no' : 'ans') : (exam && answered(x)) ? 'ans' : '';
          return exam
            ? h('button', { type: 'button', class: cls, 'aria-label': `Soal ${i + 1}${answered(x) ? ', sudah dijawab' : ''}`, 'aria-current': String(i === idx), onClick: () => { idx = i; render(); } })
            : h('span', { class: cls });
        }));
    }

    function render() {
      const q = qs[idx];
      const last = idx === qs.length - 1;
      const revealed = !exam && q.revealed;
      fill(box,
        segs(),
        h('div', { class: 'qmeta' }, h('span', null, `Soal ${idx + 1} dari ${qs.length}`), q.topic && h('span', { class: 'tag' }, q.topic)),
        questionView(q),
        h('div', { class: 'qfoot' },
          exam && idx > 0 && h('button', { class: 'btn line', onClick: () => { idx--; render(); } }, ico('back', 18), 'Sebelumnya'),
          exam && !last && h('button', { class: 'btn primary-next', onClick: () => { idx++; render(); } }, 'Berikutnya', ico('next', 18)),
          h('span', { class: 'sp' }),
          exam && h('button', { class: last ? 'btn' : 'btn line', onClick: () => finish(false) }, 'Kumpulkan'),
          !exam && revealed && !last && h('button', { class: 'btn lg primary-next', autofocus: true, onClick: () => { idx++; render(); } }, 'Soal berikutnya', ico('next', 18)),
          !exam && revealed && last && h('button', { class: 'btn lg primary-next', onClick: () => finish(false) }, 'Selesai dan lihat hasil'),
          !exam && !revealed && (q.qtype === 'mcq' || q.qtype === 'tf') && h('span', { class: 'small muted hintk' }, 'Tekan ', h('span', { class: 'kbd' }, 'A'), ' – ', h('span', { class: 'kbd' }, q.qtype === 'mcq' ? 'D' : 'B'), ' untuk memilih'),
          revealed && h('span', { class: 'small muted hintk' }, 'Tekan ', h('span', { class: 'kbd' }, 'Enter'))));
      const focusBtn = $('button[autofocus]', box);
      if (focusBtn) focusBtn.focus({ preventScroll: true });
    }
    render.segsOnly = () => { const old = $('.segs', box); if (old) old.replaceWith(segs()); };

    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea, select, dialog')) return;
      const q = qs[idx];
      const key = e.key.toLowerCase();
      if (key === 'enter') { const nx = $('.primary-next', box); if (nx && !exam) { e.preventDefault(); nx.click(); } return; }
      if (q.qtype === 'short') return;
      const i = 'abcd'.indexOf(key) >= 0 ? 'abcd'.indexOf(key) : '1234'.indexOf(key);
      if (i < 0) return;
      const btn = $(`.opt[data-i="${i}"]`, box);
      if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));

    const leave = async () => {
      const some = qs.some(answered);
      if (some && !(await ask({ title: 'Keluar dari kuis?', message: exam ? 'Jawabanmu tersimpan di perangkat ini dan waktu tetap berjalan.' : 'Jawaban yang sudah diperiksa tersimpan. Kamu bisa melanjutkan nanti.', confirm: 'Keluar', cancel: 'Tetap di sini' }))) return;
      location.hash = '#/kuis';
    };
    fill(v, h('div', { class: 'qwrap' },
      h('div', { class: 'qtop' }, h('button', { class: 'btn quiet sm', onClick: leave }, ico('x', 16), 'Keluar'),
        h('span', { class: 'ttl' }, attempt.title), exam ? clockEl : h('span', { class: 'tag' }, attempt.mode === 'review' ? 'Ulangi soal lemah' : 'Latihan')),
      box));
    render();
  }

  // ====================================================================== hasil kuis
  async function resultView(n, id) {
    const v = mount('Hasil kuis');
    fill(v, loading());
    const load = async () => rpc('get_attempt', { attempt_id: id });
    let data;
    let showWrongOnly = false;
    try { data = await load(); } catch (e) { if (alive(n)) showError(v, e, () => resultView(n, id)); return; }
    if (!alive(n)) return;
    if (!data.attempt.finished_at) { location.replace(`#/latihan/${id}`); return; }
    refreshSide(true);

    function render() {
      const a = data.attempt;
      const percent = a.total ? Math.round(100 * a.score / a.total) : 0;
      const pending = a.grading === 'pending';
      const msg = percent >= 80 ? 'Hasil yang bagus.' : percent >= 60 ? 'Sudah cukup baik, masih bisa lebih kuat.' : 'Perlu diulang. Mulai dari soal yang salah di bawah.';
      const wrong = data.questions.filter((q) => q.correct === false).length;
      const shown = data.questions.map((q, i) => [q, i]).filter(([q]) => !showWrongOnly || q.correct === false);
      const byTopic = new Map();
      for (const q of data.questions) {
        if (q.correct === null || q.correct === undefined) continue;
        const t = q.topic || 'Umum';
        const e = byTopic.get(t) || { topic: t, n: 0, ok: 0 };
        e.n++; if (q.correct) e.ok++;
        byTopic.set(t, e);
      }
      const topics = [...byTopic.values()].map((t) => ({ ...t, acc: Math.round(100 * t.ok / t.n), level: t.ok / t.n < 0.6 ? 'weak' : t.ok / t.n >= 0.8 ? 'strong' : '' })).sort((x, y) => x.acc - y.acc);
      fill(v,
        h('a', { class: 'back', href: '#/kuis' }, ico('back', 16), 'Semua kuis'),
        h('p', { class: 'muted', style: 'margin-bottom:12px' }, a.title),
        h('section', { class: 'result' },
          ring({ value: a.score, max: a.total, size: 156, stroke: 16, kind: tone(percent), center: [h('b', { class: 'num', style: 'font-size:38px' }, `${percent}%`)] }),
          h('div', null,
            h('div', { class: 'score num' }, `${a.score} dari ${a.total} benar`),
            h('p', { class: 'lede', style: 'margin-top:6px' }, pending ? 'Jawaban isianmu sedang dinilai AI. Skor ini sementara.' : msg),
            h('div', { class: 'rstats' }, h('span', { class: 'tag strong' }, ico('check', 13), `${a.score} benar`), h('span', { class: 'tag weak' }, ico('x', 13), `${a.total - a.score} salah`), h('span', { class: 'tag' }, ico('clock', 13), fmtDur(a.duration)),
              h('span', { class: 'tag' }, a.mode === 'exam' ? 'Ujian' : a.mode === 'review' ? 'Ulangi soal lemah' : 'Latihan')),
            pending && h('p', { class: 'small muted', style: 'margin-top:10px' }, h('span', { class: 'spin' }), 'Menilai jawaban isian…'),
            h('div', { class: 'actions' },
              a.quiz_id && h('button', { class: 'btn', onClick: async () => { try { const r = await rpc('start_attempt', { quiz_id: a.quiz_id, mode: a.mode === 'exam' ? 'exam' : 'practice', shuffle: true }); location.hash = `#/latihan/${r.attempt.id}`; } catch (e) { toast(e.message); } } }, ico('refresh', 18), 'Kerjakan lagi'),
              wrong > 0 && h('button', { class: 'btn line', onClick: startReview }, 'Ulangi soal lemah'),
              h('a', { class: 'btn quiet', href: '#/progres' }, 'Lihat progres')))),
        topics.length > 1 && [h('div', { class: 'sec-h' }, h('h2', { class: 'sec' }, 'Hasil per topik')), h('ul', { class: 'rows' }, topics.map(topicRow))],
        h('div', { class: 'sec-h' }, h('h2', { class: 'sec' }, 'Pembahasan'),
          wrong > 0 && h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter pembahasan' },
            h('button', { class: 'chip', 'aria-pressed': String(!showWrongOnly), onClick: () => { showWrongOnly = false; render(); } }, 'Semua'),
            h('button', { class: 'chip', 'aria-pressed': String(showWrongOnly), onClick: () => { showWrongOnly = true; render(); } }, `Salah (${wrong})`))),
        h('div', null, shown.map(([q, i]) => resultItem(q, i))));
    }

    function resultItem(q, i) {
      const kind = q.correct === true ? 'ok' : q.correct === false ? 'no' : '';
      const given = q.given === null || q.given === undefined || q.given === '' ? '(tidak dijawab)' : (q.qtype === 'mcq' ? (q.given_text || q.given) : q.qtype === 'tf' ? (q.given === 'true' ? 'Benar' : 'Salah') : q.given);
      const deepBox = h('div');
      if (q.deep_explanation) deepBox.append(h('div', { class: 'deep' }, sheet(q.deep_explanation)));
      const deepBtn = h('button', { class: 'btn line sm', onClick: async () => {
        deepBtn.disabled = true;
        fill(deepBtn, h('span', { class: 'spin' }), 'Grok sedang menjelaskan…');
        try {
          const r = await rpc('explain_question', { question_id: q.id, attempt_id: id });
          let text = r.text;
          if (!r.cached) {
            const job = await pollJob(r.job_id, n);
            if (!job) return;
            if (job.status === 'failed') throw new Error(job.error || 'Gagal membuat penjelasan');
            text = job.result.text;
          }
          q.deep_explanation = text;
          fill(deepBox, h('div', { class: 'deep' }, sheet(text)));
          deepBtn.remove();
        } catch (e) { toast(e.message); deepBtn.disabled = false; fill(deepBtn, ico('spark', 16), 'Jelaskan lebih dalam'); }
      } }, ico('spark', 16), 'Jelaskan lebih dalam');
      const det = h('details', { class: 'qres' },
        h('summary', null,
          h('span', { class: 'st ' + kind }, kind === 'ok' ? ico('check', 16) : kind === 'no' ? ico('x', 16) : ico('clock', 15)),
          h('span', { class: 'q' }, q.question), h('span', { class: 'chev' }, ico('chev', 18))),
        h('div', { class: 'body' },
          h('div', { class: 'small muted' }, `Soal ${i + 1}${q.topic ? ' · ' + q.topic : ''}${q.source ? ' · ' + q.source : ''}`),
          h('p', null, h('span', { class: 'v ' + kind }, kind === 'ok' ? 'Benar' : kind === 'no' ? 'Salah' : 'Menunggu penilaian'), '. Jawabanmu: ', h('strong', null, given)),
          q.correct !== true && h('p', null, 'Jawaban benar: ', h('strong', null, q.answer_text)),
          q.feedback && h('p', { class: 'small muted' }, q.feedback),
          q.explanation && h('p', { class: 'why' }, q.explanation),
          deepBox,
          !q.deep_explanation && h('div', null, deepBtn)));
      if (q.correct === false) det.open = true;
      return det;
    }

    render();
    (async function waitGrading() {
      while (alive(n) && data.attempt.grading === 'pending') {
        await sleep(2500);
        if (!alive(n)) return;
        const openIdx = $$('.qres').map((d, i) => (d.open ? i : -1)).filter((i) => i >= 0);
        try { data = await load(); render(); $$('.qres').forEach((d, i) => { if (openIdx.includes(i)) d.open = true; }); } catch { /* coba lagi */ }
      }
    })();
  }

  // ====================================================================== progres
  async function progressView(n) {
    const v = mount('Progres');
    fill(v, loading());
    let d;
    try { d = await rpc('progress'); } catch (e) { if (alive(n)) showError(v, e, () => progressView(n)); return; }
    if (!alive(n)) return;
    setSideStreak(d.streak);
    const o = d.overall;
    const weak = d.topics.filter((t) => t.level === 'weak');
    const strong = d.topics.filter((t) => t.level === 'strong');

    const set = d.settings;
    const daily = h('input', { type: 'number', min: '1', max: '600', value: set.daily_goal_min });
    const weekly = h('input', { type: 'number', min: '10', max: '3000', value: set.weekly_goal_min });
    const style = styleSelect(null);
    style.value = set.notes_style;
    const lang = h('select', null, [['auto', 'Ikuti bahasa materi'], ['id', 'Bahasa Indonesia'], ['en', 'English']].map(([val, l]) => h('option', { value: val }, l)));
    lang.value = set.language;
    const llmOut = h('p', { class: 'small', role: 'status' });
    const fact = (label, value) => h('div', { class: 'stat' }, h('dt', null, label), h('dd', { class: 'num' }, String(value)));
    const themeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Tema' });
    const paintTheme = () => fill(themeSeg, THEMES.map(([val, label]) => h('button', { type: 'button', 'aria-pressed': String(getTheme() === val), onClick: () => { applyTheme(val); paintTheme(); } }, label)));
    paintTheme();

    fill(v,
      h('div', { class: 'pagehead' }, h('div', null, h('h1', { class: 'title' }, 'Progres'), h('p', { class: 'lede' }, 'Pantau skor, topik yang perlu diulang, dan waktu belajarmu.')),
        d.weak_count > 0 && h('button', { class: 'btn', onClick: startReview }, ico('refresh', 18), `Ulangi ${Math.min(10, d.weak_count)} soal lemah`)),
      o.answers === 0 && o.study_seconds === 0 && h('div', { class: 'notice soft', style: 'margin-top:0' }, h('p', null, 'Belum ada data. Baca catatan atau kerjakan kuis, grafik akan terisi di sini.')),
      h('dl', { class: 'stats six', style: 'margin-top:0' },
        fact('Akurasi', pct(o.accuracy)), fact('Kuis selesai', o.attempts), fact('Soal dijawab', o.answers), fact('Waktu belajar', fmtDur(o.study_seconds)),
        fact('Streak', `${d.streak.current} hari`), fact('Streak terpanjang', `${d.streak.longest} hari`)),

      h('div', { class: 'sec-h' }, h('h2', { class: 'sec' }, 'Skor kuis'), d.trend.length > 0 && h('span', { class: 'aside' }, `${d.trend.length} kuis terakhir`)),
      d.trend.length ? h('div', { class: 'card' }, lineChart(d.trend)) : emptyState('chart', 'Belum ada skor', 'Selesaikan satu kuis dan grafik skormu muncul di sini.', h('a', { class: 'btn', href: '#/kuis' }, 'Ke halaman kuis')),

      h('div', { class: 'two-col' },
        h('div', null,
          h('div', { class: 'sec-h' }, h('h2', { class: 'sec' }, 'Penguasaan per topik'), d.topics.length > 0 && h('span', { class: 'aside' }, `${weak.length} lemah · ${strong.length} kuat`)),
          d.topics.length ? [h('p', { class: 'muted small', style: 'margin-bottom:10px' }, 'Topik dinilai setelah minimal 3 jawaban.'), h('ul', { class: 'rows' }, d.topics.map(topicRow))]
            : h('p', { class: 'muted' }, 'Topik muncul setelah kamu menyelesaikan kuis.')),
        h('div', null,
          h('div', { class: 'sec-h' }, h('h2', { class: 'sec' }, 'Per materi')),
          d.documents.length ? h('ul', { class: 'rows' }, d.documents.map((x) => h('li', { class: 'row' },
            h('div', { class: 'grow' }, h('div', { class: 'name' }, h('a', { class: 'stretch', href: `#/materi/${x.id}` }, x.title)), h('div', { class: 'meta' }, `${x.n} jawaban`)),
            h('div', { class: 'pbar', style: 'width:110px' }, h('div', { class: 'bar ' + (x.acc < 60 ? 'weak' : x.acc >= 80 ? 'strong' : '') }, h('i', { style: `width:${x.acc}%` })), h('span', { class: 'pct' }, x.acc + '%')))))
            : h('p', { class: 'muted' }, 'Belum ada jawaban per materi.'))),

      h('div', { class: 'sec-h' }, h('h2', { class: 'sec' }, 'Waktu belajar'), h('span', { class: 'aside' }, `${d.study_days.length} hari terakhir`)),
      h('div', { class: 'card' }, barChart(d.study_days)),

      h('div', { class: 'sec-h' }, h('h2', { class: 'sec' }, 'Pengaturan')),
      h('form', { class: 'card form', style: 'max-width:640px', onSubmit: async (e) => {
        e.preventDefault();
        try { await rpc('save_settings', { settings: { daily_goal_min: daily.value, weekly_goal_min: weekly.value, notes_style: style.value, language: lang.value } }); toast('Pengaturan disimpan'); refreshSide(true); }
        catch (x) { toast(x.message); }
      } },
      h('div', { class: 'form two' }, h('label', { class: 'field' }, 'Target harian (menit)', daily, h('span', { class: 'hint' }, 'Streak terhitung bila target tercapai atau satu kuis selesai.')),
        h('label', { class: 'field' }, 'Target mingguan (menit)', weekly)),
      h('div', { class: 'form two' }, h('label', { class: 'field' }, 'Gaya catatan bawaan', style), h('label', { class: 'field' }, 'Bahasa hasil AI', lang)),
      h('div', { class: 'field' }, h('span', { style: 'font-weight:600;font-size:14px' }, 'Tema tampilan'), themeSeg),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, 'Simpan pengaturan'),
        h('button', { class: 'btn line', type: 'button', onClick: async () => {
          fill(llmOut, h('span', { class: 'spin' }), 'Memeriksa gateway…');
          llmOut.style.color = '';
          try {
            const r = await rpc('llm_check', { probe_stream: true });
            const stream = !r.ok ? '' : r.stream_ok ? ` Stream DeepSeek berfungsi (chunk pertama ${r.first_chunk_s ? r.first_chunk_s.toFixed(1) + ' dtk' : '-'}).` : ` Stream DeepSeek BELUM berfungsi: ${r.error || 'jalankan worker dengan --enable-stream'}. Game dan chat butuh stream.`;
            fill(llmOut, r.ok ? `PAF-Model terhubung. Model: ${(r.models || []).join(', ') || '-'}.${stream}` : `PAF-Model bermasalah: ${r.error}`);
            llmOut.style.color = r.ok && r.stream_ok ? 'var(--good)' : 'var(--bad)';
          }
          catch (x) { fill(llmOut, x.message); llmOut.style.color = 'var(--bad)'; }
        } }, 'Tes koneksi AI'),
        h('button', { class: 'btn quiet', type: 'button', onClick: logout }, ico('logout', 16), 'Keluar')),
      llmOut));
  }

  // ====================================================================== Chat AI per dokumen
  async function chatView(n, docId) {
    const v = mount('Chat AI');
    fill(v, loading());

    let chatData;
    try {
      chatData = await rpc('chat_start', { document_id: docId });
    } catch (e) {
      if (alive(n)) showError(v, e, () => chatView(n, docId));
      return;
    }
    if (!alive(n)) return;

    // Mode layar penuh: kunci scroll halaman, scroll hanya pada utas chat.
    document.body.classList.add('chat-mode');
    v.classList.add('page-chat');
    onCleanup(() => {
      document.body.classList.remove('chat-mode');
      v.classList.remove('page-chat');
    });

    let { session, messages } = chatData;
    const docTitle = (chatData.document && chatData.document.title) || `Materi #${docId}`;
    document.title = `Tanya AI: ${docTitle} · Belajar`;

    let pendingQuote = null;

    // ----- elemen inti
    const statusBadge = h('span', { class: 'chat-badge' });
    const noteEl = h('div', { class: 'chat-note' });
    const threadEl = h('div', { class: 'chat-thread', role: 'log', 'aria-live': 'polite' });
    const inputEl = h('textarea', { class: 'chat-input', placeholder: 'Tanyakan apa saja tentang materi ini…', rows: '1', 'aria-label': 'Pesan pertanyaan' });
    const sendBtn = h('button', { class: 'chat-send-btn', type: 'button', 'aria-label': 'Kirim pertanyaan' }, ico('send', 17));
    const backLink = h('a', { class: 'chat-iconbtn chat-back', href: `#/materi/${docId}`, title: 'Kembali ke materi', 'aria-label': 'Kembali ke materi' }, ico('back', 18));
    const deleteBtn = h('button', { class: 'chat-iconbtn chat-del', type: 'button', title: 'Hapus riwayat chat', 'aria-label': 'Hapus riwayat chat' }, ico('trash', 17));
    const jumpBtn = h('button', { class: 'chat-jump', type: 'button', 'aria-label': 'Turun ke pesan terbaru', onClick: () => {
      threadEl.scrollTo({ top: threadEl.scrollHeight, behavior: reduceMotion() ? 'auto' : 'smooth' });
    } }, ico('down', 18));

    // ----- tombol kutip mengambang, muncul saat pengguna menyeleksi teks di utas
    selectionButton(threadEl, {
      label: 'Kutip untuk Tanya', icon: 'reply', cls: 'chat-quote-popover',
      onPick: (text) => setQuote(text),
      scrollEls: [threadEl],
    });

    // ----- bar kutipan aktif di atas komposer
    const quoteBar = h('div', { class: 'chat-quote-bar', hidden: true });
    const quoteSnippet = h('span', { class: 'chat-quote-snip' });
    quoteBar.append(
      h('div', { class: 'chat-quote-ic' }, ico('reply', 13)),
      h('div', { class: 'chat-quote-meta' },
        h('span', { class: 'chat-quote-lbl' }, 'Membalas kutipan'),
        quoteSnippet),
      h('button', { type: 'button', class: 'chat-quote-clear', title: 'Batalkan kutipan', 'aria-label': 'Batalkan kutipan', onClick: () => clearQuote() }, ico('x', 13)));

    // Tampilan kutipan dibersihkan dari penanda Markdown; pesan yang dikirim tetap memakai teks asli.
    const plainQuote = (t) => t
      .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1').replace(/^#{1,6}\s+/gm, '').trim();

    function setQuote(text) {
      pendingQuote = text.trim();
      const plain = plainQuote(pendingQuote);
      quoteSnippet.textContent = plain.length > 90 ? plain.slice(0, 90) + '…' : plain;
      quoteBar.hidden = false;
      inputEl.placeholder = 'Tanyakan tentang bagian yang kamu kutip…';
      inputEl.focus();
    }

    function clearQuote() {
      pendingQuote = null;
      quoteBar.hidden = true;
      inputEl.placeholder = 'Tanyakan apa saja tentang materi ini…';
      inputEl.focus();
    }

    // ----- status sesi: badge di kepala + pil info di puncak utas
    async function retrySession() {
      // chat_start membersihkan sesi berstatus error sendiri; hapus manual bila masih ada.
      try { await rpc('chat_delete', { session_id: session.id }); } catch { /* lanjut mulai baru */ }
      chatView(n, docId);
    }

    function renderStatus() {
      const s = session.status;
      const known = s === 'preparing' || s === 'ready';
      statusBadge.className = 'chat-badge ' + (known ? s : 'error');
      fill(statusBadge, h('span', { class: 'pulse-dot' }),
        s === 'preparing'
          ? [h('span', { class: 'badge-txt-full' }, 'Menyiapkan konteks'), h('span', { class: 'badge-txt-short' }, 'Menyiapkan')]
          : s === 'ready'
            ? [h('span', { class: 'badge-txt-full' }, 'DeepSeek siap'), h('span', { class: 'badge-txt-short' }, 'Siap')]
            : [h('span', { class: 'badge-txt-full' }, 'Konteks gagal'), h('span', { class: 'badge-txt-short' }, 'Gagal')]);
      noteEl.classList.toggle('bad', !known);
      if (s === 'preparing') {
        fill(noteEl, h('span', { class: 'spin sm' }), h('span', null, 'Menyiapkan konteks materi…'));
      } else if (s === 'ready') {
        fill(noteEl, ico('spark', 12),
          h('span', null, messages.length > 1 ? `DeepSeek mengingat seluruh isi materi · ${messages.length} pesan` : 'DeepSeek mengingat seluruh isi materi'));
      } else {
        fill(noteEl, h('span', null, 'Konteks materi gagal disiapkan.'),
          h('button', { type: 'button', class: 'chat-note-btn', onClick: retrySession }, 'Coba lagi'));
      }
    }

    // ----- format waktu
    const formatTime = (ts) => ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const dayLabel = (ts) => {
      const s = relDay(ts || Date.now() / 1000);
      return s.charAt(0).toUpperCase() + s.slice(1);
    };

    function copyToClipboard(text, btn) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          const orig = btn.innerHTML;
          fill(btn, ico('check', 12), 'Tersalin');
          btn.classList.add('copied');
          setTimeout(() => {
            btn.innerHTML = orig;
            btn.classList.remove('copied');
          }, 2000);
        }).catch(() => toast('Gagal menyalin'));
      } else {
        toast('Clipboard tidak didukung');
      }
    }

    // ----- gelembung pesan
    function msgBubble(msg) {
      const time = msg.ts ? h('span', { class: 'chat-msg-time' }, formatTime(msg.ts)) : null;

      if (msg.role === 'user') {
        const kids = [];
        const quoteMatch = msg.content.match(/^((?:>[^\n]*(?:\n|$))+)\n*([\s\S]*)$/);
        if (quoteMatch) {
          const rawQuote = quoteMatch[1].split('\n').map((l) => l.replace(/^>\s?/, '')).join('\n').trim();
          const mainText = quoteMatch[2].trim();
          kids.push(h('div', { class: 'chat-quote-callout' },
            h('div', { class: 'chat-quote-head' }, ico('reply', 11), 'Kutipan'),
            h('div', { class: 'chat-quote-text' }, plainQuote(rawQuote))));
          kids.push(h('div', { class: 'chat-main-text' }, mainText || rawQuote));
        } else {
          kids.push(h('div', { class: 'chat-main-text' }, msg.content));
        }
        return h('div', { class: 'chat-msg user' },
          h('div', { class: 'chat-bubble user' }, kids),
          time && h('div', { class: 'chat-msg-foot' }, time));
      }

      const copyBtn = h('button', { type: 'button', class: 'chat-action-btn' }, ico('copy', 12), 'Salin');
      copyBtn.addEventListener('click', () => copyToClipboard(msg.content, copyBtn));
      const replyBtn = h('button', { type: 'button', class: 'chat-action-btn' }, ico('reply', 12), 'Balas');
      replyBtn.addEventListener('click', () => setQuote(msg.content));
      return h('div', { class: 'chat-msg ai' },
        h('div', { class: 'chat-avatar' }, ico('spark', 15)),
        h('div', { class: 'chat-msg-body' },
          h('div', { class: 'chat-msg-head' },
            h('span', { class: 'chat-msg-name' }, 'DeepSeek Tutor'),
            h('span', { class: 'chat-msg-tag' }, 'DeepSeek'),
            time),
          h('div', { class: 'chat-bubble ai' }, sheet(msg.content)),
          h('div', { class: 'chat-msg-actions' }, copyBtn, replyBtn)));
    }

    // ----- saran pembuka saat utas masih kosong
    function makeChips() {
      const suggestions = [
        { icon: 'bulb', text: 'Apa konsep inti paling penting dalam materi ini?' },
        { icon: 'book', text: 'Buat rangkuman 5 poin kunci yang mudah diingat' },
        { icon: 'search', text: 'Berikan contoh penerapan nyata dari konsep ini' },
        { icon: 'quiz', text: 'Beri saya 1 pertanyaan latihan untuk menguji pemahaman' },
      ];
      const wrap = h('div', { class: 'chat-chips-grid' });
      for (const s of suggestions) {
        const chip = h('button', { type: 'button', class: 'chat-chip' }, ico(s.icon, 16), h('span', null, s.text));
        chip.addEventListener('click', () => {
          inputEl.value = s.text;
          doSend();
        });
        wrap.append(chip);
      }
      return wrap;
    }

    function heroCard() {
      return h('div', { class: 'chat-hero' },
        h('div', { class: 'chat-hero-icon' }, ico('bot', 30)),
        h('h2', { class: 'chat-hero-title' }, 'Tanya AI tentang materi ini'),
        h('p', { class: 'chat-hero-desc' }, `Seluruh catatan dan konsep kunci dari "${docTitle}" sudah dipahami. Mulai dari saran di bawah, atau tulis pertanyaanmu sendiri.`),
        makeChips());
    }

    function prepCard() {
      return h('div', { class: 'chat-prep' },
        h('div', { class: 'prep-icon-wrap' }, h('div', { class: 'prep-pulse-ring' }), ico('spark', 32)),
        h('h2', { class: 'prep-title' }, 'Menyiapkan konteks materi'),
        h('p', { class: 'prep-desc' }, 'DeepSeek sedang menyerap seluruh catatan dan konsep kunci materi ini. Setelah selesai, kamu bisa bertanya sepuasnya tanpa menunggu lagi.'),
        h('div', { class: 'prep-steps' },
          h('div', { class: 'prep-step done' }, ico('check', 14), 'Membaca catatan materi'),
          h('div', { class: 'prep-step active' }, h('span', { class: 'spin sm' }), 'Menyuntikkan konteks ke DeepSeek'),
          h('div', { class: 'prep-step pending' }, ico('clock', 14), 'Mengaktifkan mode tanya-jawab')));
    }

    // ----- render utas
    function nearBottom() { return threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight < 160; }

    function updateJump() {
      jumpBtn.classList.toggle('show', threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight > 240);
    }

    threadEl.addEventListener('scroll', () => {
      updateJump();
      if (nearBottom()) jumpBtn.classList.remove('ping');
    }, { passive: true });

    function renderThread(force) {
      const wasNear = nearBottom();
      if (session.status === 'preparing') {
        fill(threadEl, prepCard());
      } else if (session.status !== 'ready') {
        fill(threadEl, noteEl);
      } else if (!messages.length) {
        fill(threadEl, heroCard());
      } else {
        const kids = [noteEl];
        let lastDay = null;
        for (const m of messages) {
          const dk = m.ts ? startOfDay(new Date(m.ts * 1000)).getTime() : null;
          if (dk !== lastDay) {
            kids.push(h('div', { class: 'chat-day' }, dayLabel(m.ts)));
            lastDay = dk;
          }
          kids.push(msgBubble(m));
        }
        fill(threadEl, ...kids);
      }
      requestAnimationFrame(() => {
        if (force || wasNear) {
          threadEl.scrollTop = threadEl.scrollHeight;
          jumpBtn.classList.remove('ping');
        } else if (messages.length) {
          jumpBtn.classList.add('ping');
        }
        updateJump();
      });
    }

    function setInputEnabled(on) {
      inputEl.disabled = !on;
      sendBtn.disabled = !on;
      if (on) inputEl.focus();
    }

    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
    });

    async function doSend() {
      const text = inputEl.value.trim();
      if (!text || inputEl.disabled) return;

      let fullText = text;
      if (pendingQuote) {
        const quoteLines = pendingQuote.split('\n').map((l) => `> ${l}`).join('\n');
        fullText = `${quoteLines}\n\n${text}`;
        clearQuote();
      }

      inputEl.value = '';
      inputEl.style.height = 'auto';
      setInputEnabled(false);

      messages.push({ role: 'user', content: fullText, ts: Date.now() / 1000 });
      renderThread(true);

      const thinking = h('div', { class: 'chat-msg ai thinking-row' },
        h('div', { class: 'chat-avatar' }, ico('spark', 15)),
        h('div', { class: 'chat-msg-body' },
          h('div', { class: 'chat-msg-head' },
            h('span', { class: 'chat-msg-name' }, 'DeepSeek Tutor'),
            h('span', { class: 'chat-msg-tag' }, 'DeepSeek')),
          h('div', { class: 'chat-bubble ai' },
            h('div', { class: 'typing-dots' }, h('span'), h('span'), h('span')),
            h('span', { class: 'thinking-label' }, 'sedang berpikir…'))));
      threadEl.append(thinking);
      threadEl.scrollTop = threadEl.scrollHeight;

      let streamed = false;
      let smoother = null;
      try {
        dropCache();
        const resp = await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: session.id, message: fullText }),
        });
        if (resp.ok && resp.body && (resp.headers.get('content-type') || '').includes('text/event-stream')) {
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          const bubble = thinking.querySelector('.chat-bubble.ai');
          let finalData = null;
          let hasStartedStream = false;

          function renderSmooth(content, showCursor = true) {
            if (!hasStartedStream) {
              hasStartedStream = true;
              fill(bubble);
            }
            let mdHtml = renderMarkdown(content);
            if (showCursor) {
              if (mdHtml.endsWith('</p>')) {
                mdHtml = mdHtml.slice(0, -4) + '<span class="chat-cursor"></span></p>';
              } else {
                mdHtml += '<span class="chat-cursor"></span>';
              }
            }
            bubble.innerHTML = `<div class="sheet">${mdHtml}</div>`;
            if (nearBottom()) {
              threadEl.scrollTop = threadEl.scrollHeight;
            }
            updateJump();
          }

          smoother = createSmoother(renderSmooth);
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              const lines = buf.split('\n');
              buf = lines.pop();

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data: ')) continue;
                let ev;
                try { ev = JSON.parse(trimmed.slice(6)); } catch { continue; }

                if (ev.type === 'chunk' && ev.chunk) {
                  smoother.push(ev.chunk);
                } else if (ev.type === 'done' && ev.data) {
                  finalData = ev.data;
                  smoother.finish(finalData.response);
                } else if (ev.type === 'error') {
                  throw new Error(ev.error || 'Terjadi kesalahan pada respon AI');
                }
              }
            }
          } finally {
            smoother.finish();
          }

          await smoother.done;
          streamed = true;
          if (finalData && finalData.messages) {
            messages = finalData.messages;
          }
          renderStatus();
          renderThread(false);
        }
      } catch (err) {
        if (smoother) {
          smoother.abort();
          smoother = null;
        }
        if (!streamed) {
          console.warn('Fallback ke non-streaming chat:', err);
        } else {
          thinking.remove();
          inputEl.value = text;
          toast(err.message);
          messages.pop();
          renderThread(false);
          setInputEnabled(session.status === 'ready');
          return;
        }
      }

      if (!streamed) {
        try {
          const res = await rpc('chat_send', { session_id: session.id, message: fullText });
          messages = res.messages;
          renderStatus();
          renderThread(false);
        } catch (e) {
          thinking.remove();
          inputEl.value = text;
          toast(e.message);
          messages.pop();
          renderThread(false);
        } finally {
          setInputEnabled(session.status === 'ready');
        }
      } else {
        setInputEnabled(session.status === 'ready');
      }
    }

    sendBtn.addEventListener('click', doSend);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });

    deleteBtn.addEventListener('click', async () => {
      const ok = await ask({
        title: 'Hapus sesi chat?',
        message: 'Seluruh riwayat obrolan untuk materi ini akan dihapus permanen di PC lokal dan server DeepSeek.',
        confirm: 'Hapus sesi',
        danger: true,
      });
      if (!ok) return;
      try {
        await rpc('chat_delete', { session_id: session.id });
        toast('Sesi chat berhasil dihapus');
        location.hash = `#/materi/${docId}`;
      } catch (e) { toast(e.message); }
    });

    async function pollPreparing() {
      while (alive(n)) {
        if (session.status !== 'preparing') return;
        await sleep(1500);
        if (!alive(n)) return;
        try {
          const res = await rpc('chat_get', { session_id: session.id });
          session = res.session;
          messages = res.messages;
          if (session.status !== 'preparing') {
            renderStatus();
            renderThread(false);
            setInputEnabled(session.status === 'ready');
            if (session.status === 'ready') toast('Konteks siap! DeepSeek sudah aktif dalam Mode CONTINUE.');
            return;
          }
        } catch { /* coba lagi pada putaran berikutnya */ }
      }
    }

    // Keyboard virtual (iOS/Android): jaga utas tetap di dasar saat viewport menyusut.
    if (window.visualViewport) {
      const onVpResize = () => {
        requestAnimationFrame(() => { threadEl.scrollTop = threadEl.scrollHeight; });
      };
      window.visualViewport.addEventListener('resize', onVpResize);
      onCleanup(() => window.visualViewport.removeEventListener('resize', onVpResize));
    }

    fill(v,
      h('div', { class: 'chat-container' },
        h('header', { class: 'chat-header' },
          h('div', { class: 'chat-header-in' },
            backLink,
            h('div', { class: 'chat-doc' },
              h('span', { class: 'chat-doc-eyebrow' }, 'Tanya AI · Materi'),
              h('h1', { class: 'chat-doc-title' }, docTitle)),
            h('div', { class: 'chat-header-end' },
              statusBadge,
              themeButton(),
              deleteBtn))),
        h('div', { class: 'chat-body' },
          threadEl,
          jumpBtn,
          h('div', { class: 'chat-composer' },
            quoteBar,
            h('div', { class: 'chat-dock' }, inputEl, sendBtn),
            h('div', { class: 'chat-dock-hints' },
              h('span', null, h('kbd', null, 'Enter'), ' kirim · ', h('kbd', null, 'Shift'), ' + ', h('kbd', null, 'Enter'), ' baris baru'),
              h('span', { class: 'chat-dock-model' }, ico('spark', 12), 'DeepSeek'))))));

    renderStatus();
    setInputEnabled(session.status === 'ready');
    renderThread(true);
    if (session.status === 'preparing') pollPreparing();
  }

  // ====================================================================== mulai
  async function boot() {
    let session;
    try { session = await api('/api/session'); } catch { session = { authenticated: false }; }
    if (!session.authenticated) { state.authed = false; showLogin(); return; }
    state.authed = true;
    renderShell();
    pollStatus();
    refreshSide(true);
    route();
  }
  // API kecil untuk modul tambahan (games/*.js). Modul mendaftarkan rute lewat addRoute.
  window.Belajar = {
    $, $$, h, s, fill, ico, ICONS, rpc, api, toast, ask, mount, newView, alive, onCleanup, sleep, pollJob,
    activeClock, emptyState, showError, loading, state, esc, store, reduceMotion, sheet, mmss, fmtDur, relDay,
    tone, setNav, refreshSide, route, sse, createSmoother, renderMarkdown, addRoute: (re, nav, view) => routes.push([re, nav, view]),
    theme: { get: getTheme, set: applyTheme, cycle: cycleTheme, isDark: effectiveDark, modes: THEMES },
  };
  applyTheme(getTheme());
  if (getFont()) applyFont(getFont());
  applyReadFont(getReadFont());
  window.addEventListener('hashchange', route);
  for (const ev of ['mouseover', 'focusin', 'touchstart']) {
    document.addEventListener(ev, (e) => {
      const a = e.target.closest && e.target.closest('[data-nav]');
      if (a && a.dataset.nav !== document.body.dataset.nav) prefetch(a.dataset.nav);
    }, { passive: true });
  }
  setInterval(pollStatus, 15000);
  // tunggu semua <script> (termasuk games/*.js) terpasang sebelum rute pertama dijalankan
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

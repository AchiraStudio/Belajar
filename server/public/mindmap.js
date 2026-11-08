'use strict';
/* Mind map catatan. Tata letak dua sisi (akar di tengah), pan/zoom, lipat/buka cabang, garis hubungan
   lintas cabang, panel detail, tampilan daftar, unduh SVG/PNG. Tanpa pustaka luar: semua digambar
   sebagai SVG. Data dari RPC mindmap_get / mindmap_generate (lihat mindmap.py). Lewat window.Belajar. */
(() => {
  const B = window.Belajar;
  const { h, s, fill, ico, rpc, toast, alive, sheet, onCleanup } = B;

  Object.assign(B.ICONS, {
    minus: 'M5 12h14',
    fit: 'M4 9V4h5|M20 9V4h-5|M4 15v5h5|M20 15v5h-5',
    branch: 'M6 3v8|M6 11a3 3 0 1 0 0 6a3 3 0 1 0 0-6z|M18 3a3 3 0 1 0 0 6a3 3 0 1 0 0-6z|M18 9c0 4-12 2-12 2',
  });

  // ------------------------------------------------------------------ warna (eksplisit agar ekspor SVG mandiri)
  const PAL_LIGHT = ['#3A2FE0', '#0B8F4D', '#D9480F', '#0C8599', '#B02A8A', '#7048E8', '#A66A06', '#C92A2A'];
  const PAL_DARK = ['#8B83FF', '#4FD08B', '#FF9A62', '#4DD0E1', '#F783C5', '#B197FC', '#F2C14E', '#FF8787'];
  const TH_LIGHT = { dark: false, pal: PAL_LIGHT, surface: '#FFFFFF', ink: '#15133B', ink2: '#5A5884', line: '#DDDAF0', root: '#3A2FE0', rootInk: '#FFFFFF', onBranch: '#FFFFFF', rel: '#FF6A2B', relInk: '#B8400F', tint: 0.88 };
  const TH_DARK = { dark: true, pal: PAL_DARK, surface: '#17163A', ink: '#EEEDFF', ink2: '#A9A7D6', line: '#2E2C60', root: '#7167FF', rootInk: '#FFFFFF', onBranch: '#0E0D24', rel: '#FF7B3F', relInk: '#FFA877', tint: 0.8 };
  const isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    return t === 'dark' || (t !== 'light' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  };
  const theme = () => (isDark() ? TH_DARK : TH_LIGHT);
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const x = rgb(a); const y = rgb(b); return '#' + x.map((v, i) => Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, '0')).join(''); };

  // ------------------------------------------------------------------ ukur teks
  let measureCtx;
  try { measureCtx = document.createElement('canvas').getContext('2d'); } catch { measureCtx = null; }
  const FONT = 'Nunito, "Segoe UI", system-ui, sans-serif';
  function textW(text, size, weight) {
    if (measureCtx) { measureCtx.font = `${weight} ${size}px ${FONT}`; const w = measureCtx.measureText(text).width; if (w > 0) return w; }
    return text.length * size * 0.56;
  }
  function wrap(text, maxW, size, weight) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? cur + ' ' + w : w;
      if (cur && textW(next, size, weight) > maxW) { lines.push(cur); cur = w; } else cur = next;
    }
    if (cur) lines.push(cur);
    const out = [];
    for (const l of lines) {                           // kata sangat panjang dipotong
      let rest = l;
      while (textW(rest, size, weight) > maxW * 1.15 && rest.length > 8) {
        let cut = rest.length - 1;
        while (cut > 4 && textW(rest.slice(0, cut), size, weight) > maxW) cut--;
        out.push(rest.slice(0, cut) + '‑'); rest = rest.slice(cut);
      }
      out.push(rest);
    }
    return out.slice(0, 4);
  }
  const STYLE = [
    { size: 17, weight: 800, maxW: 190, px: 20, py: 13 },   // akar
    { size: 15, weight: 750, maxW: 210, px: 15, py: 9 },    // cabang utama
    { size: 13.5, weight: 650, maxW: 220, px: 12, py: 7 },  // tingkat 2+
  ];
  const HGAP = 56;
  const VGAP = 12;

  // ------------------------------------------------------------------ tata letak
  function buildLayout(root, collapsed) {
    const byId = new Map();
    const kidsOf = (n) => (collapsed.has(n.id) ? [] : (n.children || []));
    const weightOf = (n) => { const k = kidsOf(n); return k.length ? k.reduce((a, c) => a + weightOf(c), 0) : 1; };

    function prep(n, depth, side, branch, parent) {
      const st = STYLE[Math.min(depth, 2)];
      const lines = wrap(n.label, st.maxW, st.size, st.weight);
      const lh = st.size * 1.3;
      const w = Math.max(...lines.map((l) => textW(l, st.size, st.weight))) + st.px * 2;
      const o = { n, depth, side, branch, parent, lines, size: st.size, weight: st.weight, lh,
        w: Math.max(w, depth === 0 ? 110 : 64), hgt: lines.length * lh + st.py * 2, kids: [], hasKids: !!(n.children && n.children.length),
        x: 0, y: 0, bh: 0, cy: 0 };
      byId.set(n.id, o);
      for (const c of kidsOf(n)) o.kids.push(prep(c, depth + 1, side, branch, o));
      return o;
    }
    const rootO = prep0();
    function prep0() {
      const st = STYLE[0];
      const lines = wrap(root.label, st.maxW, st.size, st.weight);
      const lh = st.size * 1.3;
      const w = Math.max(...lines.map((l) => textW(l, st.size, st.weight))) + st.px * 2;
      const o = { n: root, depth: 0, side: 0, branch: -1, parent: null, lines, size: st.size, weight: st.weight, lh,
        w: Math.max(w, 120), hgt: lines.length * lh + st.py * 2, kids: [], hasKids: true, x: 0, y: 0, bh: 0, cy: 0 };
      byId.set(root.id, o);
      return o;
    }

    const l1 = root.children || [];
    const total = l1.reduce((a, c) => a + weightOf(c), 0);
    let split = 1;                                    // cabang pertama selalu di kanan; pilih titik pisah paling seimbang
    let best = Infinity;
    let acc = 0;
    for (let i = 1; i <= l1.length; i++) {
      acc += weightOf(l1[i - 1]);
      const diff = Math.abs(2 * acc - total);
      if (diff < best) { best = diff; split = i; }
    }
    const right = l1.slice(0, split).map((c, i) => prep(c, 1, 1, i % PAL_LIGHT.length, rootO));
    const left = l1.slice(split).map((c, i) => prep(c, 1, -1, (split + i) % PAL_LIGHT.length, rootO));
    rootO.kids = [...right, ...left];

    function place(o, top) {
      if (!o.kids.length) { o.bh = o.hgt + VGAP; o.cy = top + o.bh / 2; return o.bh; }
      let y = top;
      for (const k of o.kids) y += place(k, y);
      const used = y - top;
      o.bh = Math.max(used, o.hgt + VGAP);
      if (o.bh > used) shiftY(o.kids, (o.bh - used) / 2);
      o.cy = (o.kids[0].cy + o.kids[o.kids.length - 1].cy) / 2;
      return o.bh;
    }
    function shiftY(list, dy) { for (const o of list) { o.cy += dy; shiftY(o.kids, dy); } }
    function all(list, out = []) { for (const o of list) { out.push(o); all(o.kids, out); } return out; }

    for (const [list, sign] of [[right, 1], [left, -1]]) {
      if (!list.length) continue;
      let y = 0;
      for (const o of list) y += place(o, y);
      shiftY(list, -y / 2);
      const nodes = all(list);
      const colW = [];
      for (const o of nodes) colW[o.depth] = Math.max(colW[o.depth] || 0, o.w);
      const xs = [];
      let x = rootO.w / 2 + HGAP;
      for (let d = 1; d < colW.length; d++) { xs[d] = x; x += colW[d] + HGAP; }
      for (const o of nodes) o.x = sign === 1 ? xs[o.depth] : -xs[o.depth] - o.w;
    }
    rootO.x = -rootO.w / 2;
    rootO.cy = 0;
    const nodes = [rootO, ...all(rootO.kids)];
    for (const o of nodes) o.y = o.cy - o.hgt / 2;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const o of nodes) { minX = Math.min(minX, o.x - 50); maxX = Math.max(maxX, o.x + o.w + 50); minY = Math.min(minY, o.y); maxY = Math.max(maxY, o.y + o.hgt); }
    return { nodes, byId, root: rootO, bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
  }

  // ------------------------------------------------------------------ gambar
  const bez = (t, a, b, c, d) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;

  /** Susun elemen SVG (tanpa interaksi bila opts.interactive=false). Dipakai layar dan ekspor. */
  function drawGraph(layout, rels, th, opts) {
    const { interactive, selected, showRel, collapsed } = opts;
    const gEdges = s('g', { fill: 'none' });
    const gRels = s('g');
    const gNodes = s('g');
    const colorOf = (o) => (o.branch < 0 ? th.root : th.pal[o.branch % th.pal.length]);

    for (const o of layout.nodes) {
      if (!o.parent) continue;
      const p = o.parent;
      const right = o.side === 1;
      const sx = p.depth === 0 ? (right ? p.w / 2 : -p.w / 2) : (right ? p.x + p.w : p.x);
      const sy = p.cy;
      const ex = right ? o.x : o.x + o.w;
      const ey = o.cy;
      const dx = (ex - sx) / 2;
      gEdges.append(s('path', { d: `M${sx} ${sy}C${sx + dx} ${sy} ${ex - dx} ${ey} ${ex} ${ey}`, stroke: colorOf(o), 'stroke-width': o.depth === 1 ? 3.2 : o.depth === 2 ? 2.2 : 1.6, 'stroke-linecap': 'round', opacity: o.depth === 1 ? 0.95 : 0.8 }));
    }

    if (showRel) {
      for (const r of rels || []) {
        const a = layout.byId.get(r.from);
        const b = layout.byId.get(r.to);
        if (!a || !b) continue;
        const aRight = b.x + b.w / 2 >= a.x + a.w / 2;
        const sx = aRight ? a.x + a.w : a.x;
        const sy = a.cy;
        const bRight = !aRight;
        const ex = bRight ? b.x + b.w : b.x;
        const ey = b.cy;
        const near = Math.abs(ex - sx) < 120;
        const bulge = (a.side || 1) * 90;
        const c1x = near ? sx + bulge : sx + (ex - sx) * 0.4;
        const c2x = near ? ex + bulge : ex - (ex - sx) * 0.4;
        const active = selected && (selected === r.from || selected === r.to);
        gRels.append(s('path', { d: `M${sx} ${sy}C${c1x} ${sy} ${c2x} ${ey} ${ex} ${ey}`, fill: 'none', stroke: th.rel, 'stroke-width': active ? 2.8 : 1.8, 'stroke-dasharray': '5 4', opacity: selected && !active ? 0.4 : 0.92 }));
        if (r.label) {
          const mx = bez(0.5, sx, c1x, c2x, ex);
          const my = bez(0.5, sy, sy, ey, ey);
          const w = textW(r.label, 11.5, 700) + 14;
          gRels.append(s('g', { opacity: selected && !active ? 0.5 : 1 },
            s('rect', { x: mx - w / 2, y: my - 10, width: w, height: 20, rx: 10, fill: th.surface, stroke: th.rel, 'stroke-width': 1 }),
            s('text', { x: mx, y: my, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 11.5, 'font-weight': 700, fill: th.relInk }, r.label)));
        }
      }
    }

    for (const o of layout.nodes) {
      const col = colorOf(o);
      const isRoot = o.depth === 0;
      const solid = isRoot || o.depth === 1;
      const fillC = isRoot ? th.root : solid ? col : mix(col, th.surface, th.tint);
      const inkC = isRoot ? th.rootInk : solid ? th.onBranch : th.ink;
      const sel = selected === o.n.id;
      const attrs = interactive
        ? { class: 'mm-node' + (sel ? ' sel' : ''), 'data-id': o.n.id, tabindex: '0', role: 'button', 'aria-pressed': String(sel),
          'aria-label': o.n.label }
        : {};
      const g = s('g', attrs,
        s('rect', { class: 'box', x: o.x, y: o.y, width: o.w, height: o.hgt, rx: Math.min(14, o.hgt / 2), fill: fillC, stroke: sel ? th.ink : (solid ? fillC : col), 'stroke-width': sel ? 3.2 : 1.8 }));
      const cx = o.x + o.w / 2;
      const top = o.y + (o.hgt - o.lines.length * o.lh) / 2 + o.lh / 2;
      o.lines.forEach((ln, i) => g.append(s('text', { x: cx, y: top + i * o.lh, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': o.size, 'font-weight': o.weight, fill: inkC }, ln)));
      gNodes.append(g);
      if (!isRoot && o.hasKids) {
        const tx = o.side === 1 ? o.x + o.w + 12 : o.x - 12;
        const closed = collapsed && collapsed.has(o.n.id);
        const count = (o.n.children || []).length;
        const tg = s('g', interactive ? { class: 'mm-toggle', 'data-toggle': o.n.id, role: 'button', tabindex: '0', 'aria-label': closed ? `Buka ${count} sub-topik ${o.n.label}` : `Ciutkan ${o.n.label}` } : {},
          s('circle', { cx: tx, cy: o.cy, r: 10, fill: th.surface, stroke: col, 'stroke-width': 1.8 }),
          s('text', { x: tx, y: o.cy + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': closed ? 11 : 14, 'font-weight': 800, fill: th.ink2 }, closed ? String(count) : '−'));
        gNodes.append(tg);
      }
    }
    return [gEdges, gRels, gNodes];
  }

  // ------------------------------------------------------------------ komponen
  function create({ docId, n, onFind }) {
    const el = h('div', { class: 'mm' });
    const st = { mm: null, job: null, loading: true, error: '', view: 'peta', showRel: true, collapsed: new Set(), selected: null, layout: null };
    let svg = null; let vp = null; let canvas = null; let sideEl = null;
    let k = 1; let tx = 0; let ty = 0; let interacted = false; let ro = null; let mo = null; let polling = false;

    const find = (id, list = st.mm.root ? [st.mm.root] : []) => {
      for (const nd of list) { if (nd.id === id) return nd; const f = find(id, nd.children || []); if (f) return f; }
      return null;
    };
    const pathTo = (id, node = st.mm.root, trail = []) => {
      const t = [...trail, node];
      if (node.id === id) return t;
      for (const c of node.children || []) { const r = pathTo(id, c, t); if (r) return r; }
      return null;
    };
    const countNodes = (nd) => 1 + (nd.children || []).reduce((a, c) => a + countNodes(c), 0);

    async function load() {
      try {
        const r = await rpc('mindmap_get', { document_id: docId });
        if (!alive(n)) return;
        const first = st.loading;
        const prev = st.mm;
        const next = r.mindmap || null;
        const same = !!(prev && next && prev.updated_at === next.updated_at && prev.stale === next.stale);
        if (next && (!prev || prev.updated_at !== next.updated_at)) {
          st.selected = null; interacted = false; st.collapsed = new Set();
          if (countNodes(next.root) > 40) (function walk(nd, d) { if (d >= 2 && nd.children && nd.children.length) st.collapsed.add(nd.id); (nd.children || []).forEach((c) => walk(c, d + 1)); })(next.root, 1);
        }
        st.loading = false; st.error = ''; st.mm = next; st.job = r.job;
        const running = !!(r.job && (r.job.status === 'queued' || r.job.status === 'running'));
        if (first || !same || running) render();          // tanpa perubahan: biarkan posisi & zoom pengguna
        if (running) poll(r.job.id);
      } catch (e) { if (alive(n)) { st.loading = false; st.error = e.message; render(); } }
    }

    async function generate() {
      try {
        const r = await rpc('mindmap_generate', { document_id: docId });
        st.job = { id: r.job_id, status: 'queued', progress: 3, message: 'Menunggu giliran' };
        render();
        poll(r.job_id);
      } catch (e) { toast(e.message); }
    }

    async function poll(jobId) {
      if (polling) return;
      polling = true;
      const job = await B.pollJob(jobId, n, (j) => { st.job = j; const bar = el.querySelector('.mm-prog'); if (bar) updateProgress(bar, j); });
      polling = false;
      if (!job || !alive(n)) return;
      if (job.status === 'failed') { st.job = job; render(); toast(job.error || 'Mind map gagal dibuat'); return; }
      await load();
    }
    const updateProgress = (bar, j) => {
      const p = Math.round(j.progress || 3);
      const i = bar.querySelector('i'); if (i) i.style.width = p + '%';
      const m = bar.querySelector('.msg'); if (m) m.textContent = j.message || '';
    };

    // ---- transformasi
    const apply = () => { if (vp) vp.setAttribute('transform', `translate(${tx} ${ty}) scale(${k})`); };
    const size = () => { const r = canvas ? canvas.getBoundingClientRect() : { width: 0, height: 0 }; return { w: r.width || 800, h: r.height || 520 }; };
    function fit() {
      if (!st.layout) return;
      const { w, h: hh } = size();
      const b = st.layout.bbox;
      const minK = w < 520 ? 0.74 : 0.25;               // layar sempit: jaga teks tetap terbaca, sisanya digeser
      k = Math.max(minK, Math.min(1.25, Math.min((w - 40) / b.w, (hh - 40) / b.h)));
      tx = w / 2 - (b.x + b.w / 2) * k;
      ty = hh / 2 - (b.y + b.h / 2) * k;
      apply();
    }
    function zoomAt(px, py, f) {
      const nk = Math.max(0.25, Math.min(2.6, k * f));
      tx = px - (px - tx) * (nk / k); ty = py - (py - ty) * (nk / k); k = nk; interacted = true; apply();
    }
    const zoomCenter = (f) => { const { w, h: hh } = size(); zoomAt(w / 2, hh / 2, f); };
    function centerOn(id, viewH) {
      const o = st.layout && st.layout.byId.get(id); if (!o) return;
      const { w, h: hh } = size();
      tx = w / 2 - (o.x + o.w / 2) * k; ty = (viewH || hh) / 2 - o.cy * k; interacted = true; apply();
    }

    // ---- gambar ulang (tema/lipat/pilih)
    function redraw(anchorId) {
      if (!svg) return;
      const before = anchorId && st.layout && st.layout.byId.get(anchorId);
      const bx = before ? before.x * k + tx : 0; const by = before ? before.cy * k + ty : 0;
      st.layout = buildLayout(st.mm.root, st.collapsed);
      const after = anchorId && st.layout.byId.get(anchorId);
      if (after) { tx = bx - after.x * k; ty = by - after.cy * k; }
      vp.replaceChildren(...drawGraph(st.layout, st.mm.relations, theme(), { interactive: true, selected: st.selected, showRel: st.showRel, collapsed: st.collapsed }));
      apply();
    }

    function select(id, center) {
      st.selected = id;
      redraw();
      renderSide();
      if (!id) return;
      const narrow = !!(window.matchMedia && window.matchMedia('(max-width: 700px)').matches);
      if (narrow && sideEl && !sideEl.hidden) {          // lembar detail menutupi bawah kanvas: geser peta ke area yang terlihat
        const { h: hh } = size();
        centerOn(id, Math.max(140, hh - sideEl.offsetHeight - 16));
      } else if (center) centerOn(id);
    }
    function toggle(id) {
      if (st.collapsed.has(id)) st.collapsed.delete(id); else st.collapsed.add(id);
      redraw(id);
      renderSide();
    }

    function renderSide() {
      if (!sideEl) return;
      const node = st.selected && find(st.selected);
      if (!node) { sideEl.hidden = true; return; }
      sideEl.hidden = false;
      const trail = pathTo(node.id) || [node];
      const rels = (st.mm.relations || []).filter((r) => r.from === node.id || r.to === node.id);
      const hasKids = !!(node.children && node.children.length);
      fill(sideEl,
        h('button', { type: 'button', class: 'mm-close btn quiet', 'aria-label': 'Tutup detail', onClick: () => select(null, false) }, ico('x', 16)),
        trail.length > 1 && h('div', { class: 'crumb' }, trail.slice(0, -1).map((t) => t.label).join(' › ')),
        h('h3', null, node.label),
        node.detail ? sheet(node.detail) : h('p', { class: 'small muted' }, 'Tidak ada keterangan tambahan untuk simpul ini.'),
        h('div', { class: 'actions', style: 'gap:8px;flex-wrap:wrap;margin-top:12px' },
          onFind && h('button', { class: 'btn sm', type: 'button', onClick: () => onFind(node.label) }, ico('book', 15), 'Cari di catatan'),
          hasKids && node.id !== st.mm.root.id && h('button', { class: 'btn line sm', type: 'button', onClick: () => toggle(node.id) }, st.collapsed.has(node.id) ? 'Buka cabang' : 'Ciutkan cabang')),
        hasKids && h('div', null, h('h4', null, `Sub-topik (${node.children.length})`),
          h('div', { class: 'chips' }, node.children.map((c) => h('button', { type: 'button', class: 'chip', onClick: () => { st.collapsed.delete(node.id); select(c.id, true); } }, c.label)))),
        rels.length > 0 && h('div', null, h('h4', null, 'Berhubungan dengan'),
          h('div', { class: 'chips' }, rels.map((r) => {
            const other = find(r.from === node.id ? r.to : r.from);
            if (!other) return null;
            return h('button', { type: 'button', class: 'chip', title: r.label || '', onClick: () => { expandTo(other.id); select(other.id, true); } },
              (r.label ? r.label + ': ' : '') + other.label);
          }))));
    }

    function expandTo(id) {
      const t = pathTo(id) || [];
      for (const nd of t.slice(0, -1)) st.collapsed.delete(nd.id);
    }

    // ---- ekspor
    function exportSvg() {
      const th = TH_LIGHT;
      const layout = buildLayout(st.mm.root, new Set());
      const b = layout.bbox; const pad = 30;
      const w = Math.ceil(b.w + pad * 2); const hh = Math.ceil(b.h + pad * 2);
      const root = s('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, 'font-family': FONT });
      root.append(s('rect', { width: w, height: hh, fill: '#FFFFFF' }));
      const g = s('g', { transform: `translate(${pad - b.x} ${pad - b.y})` });
      g.append(...drawGraph(layout, st.mm.relations, th, { interactive: false, selected: null, showRel: true, collapsed: new Set() }));
      root.append(g);
      return { text: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(root), w, h: hh };
    }
    const fname = (ext) => `mindmap-${String(st.mm.root.label).replace(/[^\w\-]+/g, '_').slice(0, 40) || 'catatan'}.${ext}`;
    function save(blob, name) {
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    const downloadSvg = () => { const { text } = exportSvg(); save(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }), fname('svg')); };
    function downloadPng() {
      const { text, w, h: hh } = exportSvg();
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); const sc = 2;
        c.width = w * sc; c.height = hh * sc;
        const ctx = c.getContext('2d'); ctx.scale(sc, sc); ctx.drawImage(img, 0, 0);
        c.toBlob((bl) => { if (bl) save(bl, fname('png')); else toast('Gagal membuat PNG'); }, 'image/png');
      };
      img.onerror = () => toast('Gagal membuat PNG');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
    }

    // ---- interaksi kanvas
    function wire() {
      const pts = new Map();
      let drag = null; let pinch = null; let moved = false; let justDragged = false;
      const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
      const mid = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
      svg.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 1) { drag = { x: e.clientX, y: e.clientY, tx, ty }; moved = false; }
        else if (pts.size === 2) { pinch = { d: dist(), k }; drag = null; moved = true; }
      });
      svg.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const r = svg.getBoundingClientRect();
        if (pinch && pts.size === 2) {
          const m = mid();
          const nk = Math.max(0.25, Math.min(2.6, pinch.k * (dist() / pinch.d)));
          zoomAt(m.x - r.left, m.y - r.top, nk / k);
          return;
        }
        if (drag) {
          const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
          if (!moved && Math.hypot(dx, dy) > 5) { moved = true; canvas.classList.add('drag'); try { svg.setPointerCapture(e.pointerId); } catch { /* abaikan */ } }
          if (moved) { tx = drag.tx + dx; ty = drag.ty + dy; interacted = true; apply(); }
        }
      });
      const end = (e) => {
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = null;
        if (pts.size === 0) { if (moved) justDragged = true; drag = null; canvas.classList.remove('drag'); setTimeout(() => { justDragged = false; }, 0); }
        else if (pts.size === 1) { const [p] = [...pts.values()]; drag = { x: p.x, y: p.y, tx, ty }; }
      };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', end);
      svg.addEventListener('click', (e) => {
        if (justDragged) { e.stopPropagation(); return; }
        const t = e.target.closest && e.target.closest('[data-toggle]');
        if (t) { e.stopPropagation(); toggle(t.getAttribute('data-toggle')); return; }
        const nd = e.target.closest && e.target.closest('.mm-node');
        if (nd) select(nd.getAttribute('data-id') === st.selected ? null : nd.getAttribute('data-id'), false);
        else if (st.selected) select(null, false);
      });
      svg.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const t = e.target.closest && e.target.closest('[data-toggle]');
        const nd = e.target.closest && e.target.closest('.mm-node');
        if (t) { e.preventDefault(); toggle(t.getAttribute('data-toggle')); } else if (nd) { e.preventDefault(); select(nd.getAttribute('data-id'), false); }
      });
      canvas.addEventListener('wheel', (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;            // scroll biasa tetap menggulir halaman
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0022));
      }, { passive: false });
    }

    // ---- tampilan
    function listView() {
      const rootN = st.mm.root;
      const item = (nd) => {
        const label = h('button', { type: 'button', class: 'nodebtn', title: 'Cari di catatan', onClick: () => onFind && onFind(nd.label) }, nd.label);
        const dt = nd.detail ? h('span', { class: 'dtl' }, nd.detail) : null;
        if (nd.children && nd.children.length) return h('li', null, h('details', { open: '' }, h('summary', null, label, dt), h('ul', null, nd.children.map(item))));
        return h('li', { class: 'lf' }, label, dt);
      };
      const nameOf = (id) => { const f = find(id); return f ? f.label : id; };
      return h('div', { class: 'mm-list' },
        h('ul', null, h('li', null, h('strong', null, rootN.label), rootN.detail && h('span', { class: 'dtl' }, rootN.detail), h('ul', null, (rootN.children || []).map(item)))),
        (st.mm.relations || []).length > 0 && h('div', { style: 'margin-top:14px' }, h('h4', { style: 'margin:0 0 6px;font:700 13px var(--ui);color:var(--ink-2)' }, 'Hubungan antar konsep'),
          h('ul', null, st.mm.relations.map((r) => h('li', { class: 'lf' }, `${nameOf(r.from)} → ${nameOf(r.to)}${r.label ? ' (' + r.label + ')' : ''}`)))));
    }

    function readyView() {
      const info = [`${st.mm.node_count} simpul`, `${(st.mm.relations || []).length} hubungan`].join(' · ');
      const bar = h('div', { class: 'mm-bar' },
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Tampilan' },
          ['peta', 'daftar'].map((v) => h('button', { type: 'button', 'aria-pressed': String(st.view === v), class: st.view === v ? 'on' : '', onClick: () => { st.view = v; render(); } }, v === 'peta' ? 'Peta' : 'Daftar'))),
        h('span', { class: 'small muted' }, info),
        h('span', { class: 'grow' }),
        st.view === 'peta' && (st.mm.relations || []).length > 0 && h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: st.showRel, onChange: (e) => { st.showRel = e.target.checked; redraw(); } }), 'Hubungan'),
        st.view === 'peta' && h('button', { class: 'btn line sm', type: 'button', onClick: () => { st.collapsed = new Set(); redraw(); renderSide(); fit(); } }, 'Buka semua'),
        st.view === 'peta' && h('button', { class: 'btn line sm', type: 'button', onClick: downloadSvg, title: 'Unduh sebagai SVG' }, ico('download', 15), 'SVG'),
        st.view === 'peta' && h('button', { class: 'btn line sm', type: 'button', onClick: downloadPng, title: 'Unduh sebagai PNG' }, ico('download', 15), 'PNG'),
        h('button', { class: 'btn line sm', type: 'button', onClick: async () => {
          if (await B.ask({ title: 'Buat ulang mind map?', message: 'Mind map yang ada akan diganti dengan hasil baru dari catatan saat ini.', confirm: 'Buat ulang' })) generate();
        } }, ico('refresh', 15), 'Buat ulang'));

      const stale = st.mm.stale && h('div', { class: 'notice warn' }, h('p', null, 'Catatan sudah berubah sejak mind map ini dibuat.'),
        h('div', { class: 'actions' }, h('button', { class: 'btn sm', type: 'button', onClick: generate }, 'Perbarui mind map')));
      if (st.view === 'daftar') { fill(el, bar, stale, listView()); svg = null; return; }

      svg = s('svg', { role: 'group', 'aria-label': `Mind map: ${st.mm.root.label}`, tabindex: '-1' });
      vp = s('g');
      svg.append(vp);
      canvas = h('div', { class: 'mm-canvas' }, svg,
        h('div', { class: 'mm-zoom' },
          h('button', { class: 'btn line', type: 'button', 'aria-label': 'Perbesar', onClick: () => zoomCenter(1.25) }, ico('plus', 18)),
          h('button', { class: 'btn line', type: 'button', 'aria-label': 'Perkecil', onClick: () => zoomCenter(0.8) }, ico('minus', 18)),
          h('button', { class: 'btn line', type: 'button', 'aria-label': 'Pas layar', onClick: () => { interacted = false; fit(); } }, ico('fit', 18))));
      sideEl = h('aside', { class: 'mm-side', hidden: '', 'aria-live': 'polite' });
      canvas.append(sideEl);                                  // kartu mengambang di dalam kanvas: peta tidak menyempit
      const stage = h('div', { class: 'mm-stage' }, canvas);
      fill(el, bar, stale, stage, h('p', { class: 'mm-hint' }, 'Geser untuk menggeser peta, cubit atau Ctrl + scroll untuk zoom. Ketuk simpul untuk detail, lingkaran kecil untuk melipat cabang. Garis putus-putus oranye = hubungan antar cabang.'));
      wire();
      st.layout = null;
      redraw();
      renderSide();
      fit();
      if (ro) ro.disconnect();
      if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => { if (!interacted) fit(); }); ro.observe(canvas); }
    }

    function render() {
      if (st.loading) { fill(el, B.loading()); return; }
      if (st.error) { fill(el, h('div', { class: 'notice bad', role: 'alert' }, h('p', null, st.error), h('div', { class: 'actions' }, h('button', { class: 'btn sm', type: 'button', onClick: () => { st.loading = true; render(); load(); } }, 'Coba lagi')))); return; }
      const running = st.job && (st.job.status === 'queued' || st.job.status === 'running');
      if (running) {
        const p = Math.round(st.job.progress || 3);
        fill(el, h('div', { class: 'card mm-prog' }, h('h2', { class: 'sec', style: 'margin-bottom:10px' }, 'Mind map sedang disusun'),
          h('p', { style: 'margin-bottom:14px' }, h('span', { class: 'spin' }), h('span', { class: 'msg' }, st.job.message || 'Menunggu giliran')),
          h('div', { class: 'bar tall', role: 'progressbar', 'aria-valuenow': p, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: `width:${p}%` })),
          h('p', { class: 'small muted', style: 'margin-top:12px' }, 'Biasanya sekitar satu menit. Halaman ini boleh ditinggalkan, prosesnya tetap berjalan.')));
        return;
      }
      if (!st.mm) {
        const failed = st.job && st.job.status === 'failed';
        fill(el, h('div', { class: 'mm-empty' }, ico('branch', 34),
          h('h3', null, 'Mind map materi ini'),
          h('p', null, 'AI menyusun konsep utama di tengah, cabang pembahasan di sekelilingnya, dan hubungan antar konsep dari catatanmu. Berguna untuk melihat gambaran besar sebelum belajar detail.'),
          failed && h('p', { style: 'color:var(--bad)', role: 'alert' }, st.job.error || 'Pembuatan sebelumnya gagal.'),
          h('button', { class: 'btn', type: 'button', onClick: generate }, ico('spark', 16), failed ? 'Coba lagi' : 'Buat mind map')));
        return;
      }
      readyView();
    }

    // ganti tema -> gambar ulang
    if (typeof MutationObserver !== 'undefined') {
      mo = new MutationObserver(() => { if (st.mm && svg && vp && el.isConnected) redraw(); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
    onCleanup(() => { if (ro) ro.disconnect(); if (mo) mo.disconnect(); });

    render();
    load();
    return { el, reload: load, refit: () => { if (svg && !interacted) fit(); }, highlight: (id) => select(id, true) };
  }

  B.mindmap = { create, buildLayout, theme };
})();

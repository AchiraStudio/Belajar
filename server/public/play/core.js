'use strict';
/* Game belajar v2 — hub, peta penguasaan, dan helper bersama.
   Layar permainan ada di run.js, kartu SM-2 di cards.js. Semua lewat window.Belajar. */
(() => {
  const B = window.Belajar;
  const { h, fill, ico, rpc, toast, ask, mount, alive, emptyState, showError, loading, store } = B;

  Object.assign(B.ICONS, {
    heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
    cards: 'M7 4h9a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z|M3 7v12a1 1 0 0 0 1 1h9',
    bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
    map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z|M9 4v14|M15 6v14',
    flag: 'M5 21V4|M5 4h12l-2 4 2 4H5',
    pause: 'M8 5v14|M16 5v14',
  });

  const P = (B.play = { pending: null });
  const clampPct = (v) => Math.max(0, Math.min(100, v));
  P.bar = (value, cls = '') => h('div', { class: ('gbar ' + cls).trim(), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(clampPct(value))) },
    h('i', { style: `width:${clampPct(value)}%` }));
  P.setBar = (el, value) => { const i = el.firstChild; if (i) i.style.width = `${clampPct(value)}%`; el.setAttribute('aria-valuenow', String(Math.round(clampPct(value)))); };
  P.chip = (icon, text, cls = '') => h('span', { class: ('gchip ' + cls).trim() }, ico(icon, 15), h('b', { class: 'num' }, String(text)));
  P.hearts = (n, max) => h('span', { class: 'pl-hp', role: 'img', 'aria-label': `${n} dari ${max} nyawa` },
    Array.from({ length: max }, (_, i) => h('span', { class: i < n ? '' : 'off' }, ico('heart', 18))));
  P.MODE_ICON = { ajari: 'chat', detektif: 'search', petualangan: 'target', kasus: 'bulb', kilat: 'bolt', boss: 'trophy' };
  P.LEVELS = { baru: 'Baru', dikenal: 'Dikenal', paham: 'Paham', kuasai: 'Kuasai' };
  P.pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

  // ------------------------------------------------------------------ cakupan materi
  const scopeKey = 'belajar-play-scope';
  const parseScope = (sel) => {
    const [kind, id] = String(sel).split(':');
    return kind === 'd' ? { scope_kind: 'document', scope_id: Number(id) }
      : kind === 's' ? { scope_kind: 'subject', scope_id: Number(id) } : { scope_kind: 'all', scope_id: 0 };
  };
  P.startGame = (game, sel, options) => {
    P.pending = { game, ...parseScope(sel), options };
    location.hash = '#/game/run';
  };

  // ------------------------------------------------------------------ dialog opsi
  function optionsDialog(mode, sel, hub) {
    const t = mode.turns;
    const dlg = h('dialog', { class: 'dlg', 'aria-labelledby': 'pl-o-t' });
    const close = () => { dlg.close(); dlg.remove(); };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    const turns = h('input', { type: 'number', min: t.min, max: t.max, value: store.get(`belajar-play-${mode.key}-turns`, String(t.default)), 'aria-label': 'Jumlah giliran' });
    const level = h('select', { 'aria-label': 'Tingkat kesulitan' }, ['mudah', 'sedang', 'sulit'].map((x) => h('option', { value: x }, x[0].toUpperCase() + x.slice(1))));
    level.value = store.get('belajar-play-level', 'sedang');
    const theme = mode.key === 'petualangan'
      ? h('select', { 'aria-label': 'Tema cerita' }, [['fantasi', 'Fantasi'], ['detektif', 'Detektif'], ['scifi', 'Sains fiksi'], ['kantor', 'Kantor']].map(([v, l]) => h('option', { value: v }, l)))
      : null;
    const go = () => {
      const n = Math.max(t.min, Math.min(t.max, Number(turns.value) || t.default));
      store.set(`belajar-play-${mode.key}-turns`, String(n));
      store.set('belajar-play-level', level.value);
      close();
      P.startGame(mode.key, sel, { jumlah_giliran: n, tingkat: level.value, ...(theme ? { tema: theme.value } : {}) });
    };
    fill(dlg, h('form', { class: 'pl-opts-form', onSubmit: (e) => { e.preventDefault(); go(); } },
      h('h2', { id: 'pl-o-t' }, mode.title), h('p', { class: 'muted small' }, mode.desc),
      h('label', null, `Jumlah giliran (${t.min}–${t.max})`, turns),
      h('label', null, 'Tingkat', level), theme && h('label', null, 'Tema', theme),
      mode.key === 'boss' && h('p', { class: 'muted small' }, 'Tanpa petunjuk dan tanpa umpan balik sampai ujian selesai.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn quiet', type: 'button', onClick: close }, 'Batal'),
        h('button', { class: 'btn', type: 'submit' }, ico('bolt', 16), 'Mulai'))));
    document.body.append(dlg);
    dlg.showModal();
  }

  // ------------------------------------------------------------------ hub
  async function hubView(n) {
    const v = mount('Game');
    fill(v, loading());
    let hub;
    try { hub = await rpc('play_hub'); } catch (e) { if (alive(n)) showError(v, e, () => hubView(n)); return; }
    if (!alive(n)) return;

    let sel = store.get(scopeKey, 'all');
    const valid = new Set(['all', ...hub.documents.map((d) => 'd:' + d.id), ...hub.subjects.map((x) => 's:' + x.id)]);
    if (!valid.has(sel)) sel = 'all';
    const select = h('select', { 'aria-label': 'Materi yang dimainkan', onChange: () => { sel = select.value; store.set(scopeKey, sel); } },
      h('option', { value: 'all' }, `Semua materi (${hub.documents.length})`),
      hub.subjects.length > 0 && h('optgroup', { label: 'Mata pelajaran' }, hub.subjects.map((x) => h('option', { value: 's:' + x.id }, x.name))),
      hub.documents.length > 0 && h('optgroup', { label: 'Materi' }, hub.documents.map((d) => h('option', { value: 'd:' + d.id }, `${d.title} (${d.concepts} istilah)`))));
    select.value = sel;

    const p = hub.profile;
    const span = Math.max(1, p.next - p.level_start);
    const hero = h('div', { class: 'pl-hero' },
      h('div', { class: 'pl-lvl' }, h('span', null, 'Level'), h('b', { class: 'num' }, String(p.level))),
      h('div', { class: 'pl-xp' }, h('div', { class: 'row' }, h('b', null, 'XP'), h('span', { class: 'num muted' }, `${p.xp - p.level_start} / ${span} ke level ${p.level + 1}`)),
        P.bar(((p.xp - p.level_start) / span) * 100)),
      h('div', { class: 'pl-chips' }, P.chip('flame', hub.streak.current, 'flame'),
        h('a', { class: 'gchip', href: '#/kartu' }, ico('cards', 15), h('b', null, `${hub.cards.due} kartu`)),
        h('a', { class: 'gchip', href: '#/game/peta' }, ico('map', 15), h('b', null, 'Peta'))));

    const resume = hub.active && h('div', { class: 'pl-resume' },
      h('div', { class: 'grow' }, h('b', null, `Lanjutkan ${hub.active.title}`),
        h('p', { class: 'small muted' }, `${hub.active.scope_title} · giliran ${hub.active.turn_count}/${hub.active.max_turns}`)),
      h('button', { class: 'btn', onClick: () => { P.pending = null; location.hash = '#/game/run'; } }, ico('next', 16), 'Lanjutkan'),
      h('button', { class: 'btn quiet', onClick: async () => {
        if (!(await ask({ title: 'Tinggalkan permainan ini?', message: 'XP dari giliran yang sudah dijawab tetap dihitung, tanpa bonus selesai.', confirm: 'Tinggalkan', danger: true }))) return;
        try { await rpc('play_abandon', { run_id: hub.active.id }); B.refreshSide(true); if (alive(n)) hubView(n); } catch (e) { toast(e.message); }
      } }, 'Tinggalkan'));

    const noMaterial = hub.documents.length === 0;
    const modes = hub.modes.map((m) => h('button', { class: 'pl-mode', type: 'button', disabled: noMaterial || !!hub.active,
      title: hub.active ? 'Selesaikan atau tinggalkan permainan yang berjalan dulu' : '', onClick: () => optionsDialog(m, sel, hub) },
      h('h3', null, ico(P.MODE_ICON[m.key] || 'star', 20), m.title), h('p', null, m.desc),
      h('span', { class: 'tag' }, `${m.turns.default} giliran${m.hints ? '' : ' · tanpa petunjuk'}`)));

    const lv = hub.levels;
    const quests = h('div', { class: 'pl-box' }, h('h2', null, 'Misi hari ini'),
      hub.quests.map((q) => h('div', { class: 'pl-q' + (q.done ? ' done' : '') }, h('span', { class: 'dot' }, ico('check', 14)),
        h('span', null, q.title), h('span', { class: 'xp' }, `+${q.xp} XP`))));
    const weak = h('div', { class: 'pl-box' }, h('h2', null, 'Perlu diulang'),
      hub.weak.length ? hub.weak.map((w) => h('div', { class: 'pl-weak' }, h('span', null, w.term), h('span', { class: 'muted small' }, w.doc_title)))
        : h('p', { class: 'muted small' }, 'Belum ada. Mainkan satu permainan dan konsep yang masih lemah akan tampil di sini.'));
    const levels = h('div', { class: 'pl-box' }, h('h2', null, 'Penguasaan konsep'),
      h('div', { class: 'pl-lv' }, Object.keys(P.LEVELS).map((k) => h('span', { class: `pl-pill lvl-${k}` }, `${P.LEVELS[k]} `, h('b', { class: 'num' }, String(lv[k]))))),
      h('p', { class: 'small muted', style: 'margin-top:10px' }, 'Kuasai = skor 75+, minimal 4 bukti dari 2 jenis latihan.'),
      h('div', { class: 'actions', style: 'margin-top:10px' }, h('a', { class: 'btn line sm', href: '#/game/peta' }, ico('map', 15), 'Buka peta')));
    const badges = h('div', { class: 'pl-box' }, h('h2', null, 'Lencana'),
      h('div', { class: 'pl-badges' }, hub.achievements.map((a) => h('span', { class: 'pl-badge' + (a.unlocked ? ' on' : ''), title: a.desc }, a.title))));

    fill(v,
      h('div', { class: 'pagehead' }, h('div', null, h('h1', { class: 'title' }, 'Game belajar'),
        h('p', { class: 'lede' }, 'AI memandu permainan dari materimu sendiri. Penilaian dan skor dipegang aplikasi, bukan AI.'))),
      hero, resume,
      noMaterial ? emptyState('book', 'Belum ada materi siap', 'Unggah dan proses materi dulu supaya bisa dimainkan.', h('a', { class: 'btn', href: '#/materi' }, 'Ke Materi'))
        : h('div', null, h('div', { class: 'pl-scope' }, h('label', { class: 'muted small', for: '' }, 'Main dari'), select), h('div', { class: 'pl-grid' }, modes)),
      h('div', { class: 'pl-cols' }, quests, weak, levels, badges));
  }

  // ------------------------------------------------------------------ peta penguasaan
  async function mapView(n) {
    const v = mount('Peta penguasaan');
    fill(v, loading());
    const sel = store.get(scopeKey, 'all');
    const [kind, id] = String(sel).split(':');
    const body = kind === 'd' ? { document_id: Number(id) } : kind === 's' ? { subject_id: Number(id) } : {};
    let m;
    try { m = await rpc('play_map', body); } catch (e) { if (alive(n)) showError(v, e, () => mapView(n)); return; }
    if (!alive(n)) return;
    const detail = h('div', { class: 'pl-box', 'aria-live': 'polite', style: 'margin-top:16px' }, h('p', { class: 'muted small' }, 'Ketuk sebuah konsep untuk melihat detailnya.'));
    const show = (c) => fill(detail, h('h2', null, c.term), h('p', null, c.definition),
      h('p', { class: 'small muted', style: 'margin-top:8px' }, `${P.LEVELS[c.level]} · skor ${c.score}/100 · ${c.evidence_n} bukti${c.kinds.length ? ' (' + c.kinds.join(', ') + ')' : ''}${c.due ? ' · kartu jatuh tempo' : ''}`));
    fill(v,
      h('div', { class: 'pagehead' }, h('div', null, h('h1', { class: 'title' }, 'Peta penguasaan'),
        h('p', { class: 'lede' }, `${m.source.title}. Warna menunjukkan seberapa kuat tiap konsep.`)),
      h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/game' }, ico('back', 16), 'Game'))),
      h('div', { class: 'pl-legend' }, Object.keys(P.LEVELS).map((k) => h('span', { class: `pl-pill lvl-${k}` }, `${P.LEVELS[k]} `, h('b', { class: 'num' }, String(m.counts[k]))))),
      m.groups.length === 0 ? emptyState('book', 'Belum ada konsep', 'Proses materi dulu untuk mengisi peta.')
        : m.groups.map((g) => h('div', { class: 'pl-map-group' }, h('h2', null, g.title),
          h('div', { class: 'pl-chips-map' }, g.concepts.map((c) => h('button', { class: `pl-cn lvl-${c.level}`, type: 'button', onClick: () => show(c) },
            c.term, h('small', null, String(c.score)), c.due && h('i', { class: 'due', title: 'Kartu jatuh tempo' })))))),
      detail);
  }

  B.addRoute(/^game$/, 'game', hubView);
  B.addRoute(/^game\/peta$/, 'game', mapView);
})();

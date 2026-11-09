'use strict';
// Harness (jsdom): cache bacaan RPC, API tema, dan bilah judul Tauri (dengan __TAURI__ palsu).
// Jalankan: NODE_PATH=<dir berisi node_modules jsdom> node tests/titlebar_cache_harness.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'server', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
function ok(cond, msg) { if (!cond) { console.error('GAGAL:', msg); process.exit(1); } passed++; console.log('  ok -', msg); }
const mk = (json, status = 200) => ({ ok: status < 400, status, json: async () => json });

function boot({ tauri = null } = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost/#/progres', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const calls = [];
  let delay = 0;
  window.fetch = async (p, init = {}) => {
    const u = String(p);
    const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
    if (u === '/api/session') return mk({ authenticated: true });
    if (u === '/api/status') return mk({ agent: true });
    if (u.startsWith('/api/rpc/')) {
      const a = u.replace('/api/rpc/', '');
      calls.push(a);
      if (delay) await sleep(delay);
      if (a === 'list_subjects') return mk({ data: { subjects: [] } });
      if (a === 'dashboard') return mk({ data: { streak: { current: 1, today: { done: false, seconds: 0, goal_seconds: 600 } } } });
      if (a === 'progress') return mk({ data: { overall: {}, streak: { current: 1, longest: 1, freezes: 0, today: { done: false, seconds: 0, goal_seconds: 600 } }, weekly: { seconds: 0, goal_min: 120, quizzes: 0, pct: 0 }, trend: [], topics: [], documents: [], study_days: [], settings: {}, weak_count: 0 } });
      return mk({ data: { echo: a, body } });
    }
    return mk({ error: 'tidak ada' }, 404);
  };
  if (tauri) window.__TAURI__ = tauri;
  window.eval(read('app.js'));
  window.eval(read('titlebar.js'));
  return { window, document: window.document, calls, setDelay: (ms) => { delay = ms; } };
}

async function main() {
  console.log('== Cache bacaan RPC');
  {
    const { window, calls, setDelay } = boot();
    await sleep(200);
    const B = window.Belajar;
    await B.rpc('save_note', { document_id: 1, content_md: 'reset' });   // mulai dari cache kosong (sidebar sudah memanaskannya)
    calls.length = 0;

    await B.rpc('list_subjects'); await B.rpc('list_subjects');
    ok(calls.filter((c) => c === 'list_subjects').length === 1, 'bacaan identik kedua kali dilayani dari cache');

    const a = await B.rpc('list_subjects'); a.subjects.push('rusak');
    const b = await B.rpc('list_subjects');
    ok(b.subjects.length === 0, 'mengubah hasil yang diterima tidak merusak cache (salinan)');

    await B.rpc('list_documents', { subject_id: 1 }); await B.rpc('list_documents', { subject_id: 2 });
    ok(calls.filter((c) => c === 'list_documents').length === 2, 'argumen berbeda = entri cache berbeda');

    await B.rpc('save_note', { document_id: 1, content_md: 'x' });
    calls.length = 0;
    await B.rpc('list_subjects'); await B.rpc('list_documents', { subject_id: 1 });
    ok(calls.length === 2, 'aksi non-baca (save_note) membuang seluruh cache');

    calls.length = 0;
    await B.rpc('get_job', { id: 1 }); await B.rpc('get_job', { id: 1 });
    ok(calls.filter((c) => c === 'get_job').length === 2, 'get_job tidak pernah di-cache');

    setDelay(60);
    calls.length = 0;
    await Promise.all([B.rpc('progress'), B.rpc('progress'), B.rpc('progress')]);
    ok(calls.filter((c) => c === 'progress').length === 1, 'permintaan identik yang sedang berjalan dipakai bersama');

    // Bacaan yang berangkat sebelum perubahan tidak boleh menulis data lama ke cache.
    setDelay(80);
    calls.length = 0;
    const slowRead = B.rpc('cards_stats');
    await sleep(10);
    await B.rpc('cards_review', { id: 1, grade: 3 });
    await slowRead;
    setDelay(0);
    calls.length = 0;
    await B.rpc('cards_stats');
    ok(calls.includes('cards_stats'), 'bacaan yang tumpang tindih dengan perubahan tidak dicache');

    calls.length = 0;
    await B.rpc('dashboard', { streak_only: true }); await B.rpc('dashboard');
    ok(calls.filter((c) => c === 'dashboard').length === 2, 'dashboard ringan (streak_only) dan penuh dicache terpisah');
  }

  console.log('== Tema');
  {
    const { window, document } = boot();
    await sleep(100);
    const B = window.Belajar;
    const seen = [];
    document.addEventListener('belajar:theme', (e) => seen.push(e.detail));
    B.theme.set('dark');
    ok(document.documentElement.getAttribute('data-theme') === 'dark' && seen.at(-1).theme === 'dark' && seen.at(-1).dark === true, 'set(dark) memasang atribut dan memancarkan peristiwa');
    ok(document.documentElement.classList.contains('theme-anim'), 'peralihan tema memasang kelas animasi sementara');
    B.theme.set('light');
    ok(document.documentElement.getAttribute('data-theme') === 'light' && seen.at(-1).dark === false, 'set(light)');
    B.theme.set('auto');
    ok(!document.documentElement.hasAttribute('data-theme'), 'auto melepas atribut (mengikuti sistem)');
    B.theme.set('light'); B.theme.cycle();
    ok(B.theme.get() === 'dark', 'cycle: terang -> gelap');
    B.theme.cycle();
    ok(B.theme.get() === 'auto', 'cycle: gelap -> otomatis');
  }

  console.log('== Bilah judul: bukan Tauri');
  {
    const { document } = boot();
    await sleep(100);
    ok(!document.querySelector('.titlebar') && !document.documentElement.classList.contains('has-titlebar'), 'di peramban biasa tidak ada bilah judul dan tata letak tak berubah');
  }

  console.log('== Bilah judul: Tauri');
  {
    const log = [];
    let maximized = false;
    let resizeCb = null;
    const win = {
      minimize: async () => log.push('minimize'),
      toggleMaximize: async () => { log.push('toggleMaximize'); maximized = !maximized; if (resizeCb) resizeCb(); },
      close: async () => log.push('close'),
      startDragging: async () => log.push('startDragging'),
      isMaximized: async () => maximized,
      setTheme: async (t) => log.push('setTheme:' + t),
      onResized: async (cb) => { resizeCb = cb; return () => {}; },
    };
    const { window, document } = boot({ tauri: { window: { getCurrentWindow: () => win } } });
    await sleep(150);
    const bar = document.querySelector('.titlebar');
    ok(bar && document.body.firstElementChild === bar, 'bilah dibuat di awal <body>');
    ok(document.documentElement.classList.contains('has-titlebar'), 'kelas has-titlebar dipasang (menggeser tata letak lewat --tb)');
    ok(bar.querySelectorAll('.tb-ctrl').length === 3 && bar.querySelector('.tb-theme'), 'tiga tombol jendela + tombol tema');
    ok(bar.dataset.platform, 'platform terdeteksi: ' + bar.dataset.platform);

    const click = (sel) => bar.querySelector(sel).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    click('.tb-ctrl.min'); click('.tb-ctrl.close');
    ok(log.includes('minimize') && log.includes('close'), 'tombol kecilkan dan tutup memanggil jendela');
    click('.tb-ctrl.max');
    await sleep(30);
    ok(log.includes('toggleMaximize') && bar.querySelector('.tb-ctrl.max').getAttribute('aria-label') === 'Pulihkan', 'perbesar -> ikon/label berganti jadi "Pulihkan"');
    click('.tb-ctrl.max');
    await sleep(30);
    ok(bar.querySelector('.tb-ctrl.max').getAttribute('aria-label') === 'Perbesar', 'pulihkan -> kembali "Perbesar"');

    log.length = 0;
    bar.querySelector('.tb-drag').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0, detail: 1 }));
    ok(log.includes('startDragging'), 'menekan area kosong memulai seret jendela');
    bar.querySelector('.tb-drag').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0, detail: 2 }));
    ok(log.includes('toggleMaximize'), 'klik ganda memperbesar/memulihkan');
    log.length = 0;
    bar.querySelector('.tb-ctrl.min').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0, detail: 1 }));
    ok(!log.includes('startDragging'), 'menekan tombol tidak memulai seret');

    window.Belajar.theme.set('dark');
    await sleep(20);
    ok(log.includes('setTheme:dark'), 'tema aplikasi disinkronkan ke jendela asli (gelap)');
    window.Belajar.theme.set('auto');
    await sleep(20);
    ok(log.includes('setTheme:null'), 'mode otomatis melepas tema jendela (ikut sistem)');
    const before = window.Belajar.theme.get();
    click('.tb-theme');
    ok(window.Belajar.theme.get() !== before, 'tombol tema di bilah mengganti tema aplikasi');

    window.document.title = 'Materi · Belajar';
    await sleep(20);
    ok(bar.querySelector('.tb-page').textContent === 'Materi', 'nama halaman diambil dari <title>');
  }

  console.log(`\nSemua ${passed} pemeriksaan lulus.`);
}
main().catch((e) => { console.error(e); process.exit(1); });

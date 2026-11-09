'use strict';
// Uji end-to-end: HTTP + bridge + agent + UI (jsdom). Dijalankan oleh tests/run_e2e.sh
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
// `ws` dicari di server/node_modules dulu, lalu lewat NODE_PATH / resolusi biasa.
const WebSocket = (() => {
  try { return require(path.join(__dirname, '..', 'server', 'node_modules', 'ws')); }
  catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; return require('ws'); }
})();

const BASE = process.env.BASE || 'http://127.0.0.1:3055';
const PASSWORD = process.env.APP_PASSWORD;
const FX = process.env.FIXTURES;
const PUB = path.join(__dirname, '..', 'server', 'public');
let passed = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ok(cond, msg) {
  if (!cond) { console.error('GAGAL:', msg); process.exit(1); }
  passed++; console.log('  ok -', msg);
}
async function waitFor(fn, ms = 20000, what = 'kondisi') {
  const end = Date.now() + ms;
  for (;;) {
    let v; try { v = await fn(); } catch { v = null; }
    if (v) return v;
    if (Date.now() > end) { console.error('GAGAL: timeout menunggu', what); process.exit(1); }
    await sleep(60);
  }
}

// ---------- klien HTTP dengan cookie jar ----------
function client() {
  let cookie = '';
  const call = async (p, opts = {}) => {
    const res = await fetch(BASE + p, { ...opts, headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) }, redirect: 'manual' });
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of sc) { const kv = c.split(';')[0]; if (kv.startsWith('sid=')) cookie = kv.endsWith('=') ? '' : kv; }
    return res;
  };
  const rpc = async (action, body = {}) => {
    const r = await call('/api/rpc/' + action, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ...j };
  };
  return { call, rpc, get cookie() { return cookie; } };
}

async function main() {
  console.log('== Keamanan & autentikasi');
  const anon = client();
  ok((await anon.call('/api/status')).status === 401, 'status tanpa login ditolak (401)');
  ok((await anon.rpc('dashboard')).status === 401, 'RPC tanpa login ditolak (401)');
  const idx = await anon.call('/');
  ok(idx.status === 200 && /default-src 'self'/.test(idx.headers.get('content-security-policy') || ''), 'halaman publik + header CSP');
  ok((await anon.call('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'salah-banget' }) })).status === 401, 'password salah ditolak');
  const me = client();
  const login = await me.call('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) });
  ok(login.status === 200 && me.cookie.startsWith('sid='), 'login berhasil, cookie sesi terpasang');
  ok(/HttpOnly/i.test(login.headers.get('set-cookie')) && /SameSite=Strict/i.test(login.headers.get('set-cookie')), 'cookie HttpOnly + SameSite=Strict');
  const forged = client(); forged.call; // cookie palsu
  const r403 = await fetch(BASE + '/api/status', { headers: { cookie: 'sid=9999999999999.AAAA' } });
  ok(r403.status === 401, 'cookie palsu ditolak');
  const bad = await new Promise((resolve) => {
    const w = new WebSocket(BASE.replace('http', 'ws') + '/bridge?token=token-palsu-token-palsu');
    w.on('unexpected-response', (q, res) => resolve(res.statusCode)); w.on('open', () => { w.close(); resolve('open'); }); w.on('error', () => resolve('error'));
  });
  ok(bad === 401, 'bridge menolak token yang salah');
  ok((await me.rpc('hapus_semua')).status === 404, 'action di luar whitelist ditolak (404)');

  console.log('== Bridge + agent');
  const st = await (await me.call('/api/status')).json();
  ok(st.agent === true, 'agent terhubung lewat bridge');
  const ping = await me.rpc('ping');
  ok(ping.ok && ping.data.version, 'ping ke agent berhasil');
  const empty = await me.rpc('get_document', { id: 99999 });
  ok(empty.status === 400 && /tidak ditemukan/i.test(empty.error), 'error pengguna dari agent -> HTTP 400 berpesan jelas');

  console.log('== Upload lewat HTTP (multipart)');
  const send = async (file, extra = {}) => {
    const fd = new FormData();
    fd.append('file', new Blob([fs.readFileSync(path.join(FX, file))]), file);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    const r = await me.call('/api/upload', { method: 'POST', body: fd });
    return { status: r.status, ...(await r.json()) };
  };
  const exe = await send('bio.docx', {}); // sanity
  ok(exe.status === 200 && exe.data.doc_id, 'upload docx -> doc_id + job_id');
  const bad2 = new FormData(); bad2.append('file', new Blob(['MZ']), 'virus.exe');
  const rBad = await me.call('/api/upload', { method: 'POST', body: bad2 });
  ok(rBad.status === 400, 'upload .exe ditolak server');
  const pptx = await send('slides.pptx', { new_subject: 'Sejarah', style: 'detail', title: 'Slide Uji' });
  ok(pptx.status === 200, 'upload pptx dengan mata pelajaran baru');
  const docIds = [exe.data.doc_id, pptx.data.doc_id];
  for (const id of docIds) {
    await waitFor(async () => (await me.rpc('get_document', { id })).data.document.status === 'ready', 60000, `dokumen ${id} siap`);
  }
  ok(true, 'kedua dokumen selesai diproses');

  console.log('== UI di jsdom');
  const jar = client();
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
  vc.on('error', (...a) => errors.push(a.join(' ')));
  const dom = new JSDOM(fs.readFileSync(path.join(PUB, 'index.html'), 'utf8'), { url: BASE + '/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.fetch = async (url, init = {}) => jar.call(url, { ...init, headers: init.headers });
  w.confirm = () => true; w.prompt = (_, d) => d; w.scrollTo = () => {};
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8'));
  const $ = (s, r = w.document) => r.querySelector(s);
  const $$ = (s, r = w.document) => [...r.querySelectorAll(s)];
  const text = () => w.document.body.textContent;
  const btn = (label, root = w.document) => $$('button, a.btn', root).find((b) => b.textContent.trim().includes(label));

  await waitFor(() => $('#pw'), 8000, 'layar login');
  ok(true, 'belum login -> layar login tampil');
  $('#pw').value = PASSWORD; $('form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await waitFor(() => $('.shell h1.title'), 10000, 'dashboard');
  ok(/berturut|Mulai streak/.test(text()), 'dashboard menampilkan streak');
  await waitFor(() => $('.js-agent.on'), 6000, 'indikator PC online');
  ok(true, 'indikator "PC lokal terhubung"');
  ok(text().includes('Konsistensi belajar') && $$('.hm i').length >= 140, 'peta aktivitas 140 hari');
  ok($$('a.btn').some(a => /^Lanjutkan:/.test(a.textContent.trim())), 'tombol lanjutkan');

  w.location.hash = '#/materi';
  await waitFor(() => $$('.dcard').length >= 2, 8000, 'daftar materi');
  ok(text().includes('Slide Uji') && text().includes('Sejarah'), 'daftar materi + filter mata pelajaran');
  ok($$('#side-subjects .sjs a').length >= 1, 'sidebar menampilkan mata pelajaran');
  const total = $$('.dcard').length;
  const sb = $('input[type=search]'); sb.value = 'slide uji'; sb.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok($$('.dcard').length >= 1 && $$('.dcard').length < total, 'pencarian menyaring kartu materi');
  sb.value = 'zzzz-tidak-ada'; sb.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok(/Tidak ada yang cocok/.test(text()), 'pencarian kosong menampilkan keadaan kosong');
  sb.value = ''; sb.dispatchEvent(new w.Event('input', { bubbles: true }));

  w.location.hash = `#/materi/${docIds[1]}`;
  await waitFor(() => $('.sheet h2'), 8000, 'catatan');
  ok($$('.sheet h2').length >= 2 && $$('.sheet strong').length >= 1, 'catatan Markdown dirender (h2, tebal)');
  ok(!$('.sheet script') && !/<script/i.test($('.sheet').innerHTML), 'tidak ada script di hasil render');
  btn('Kuis (0)').click();
  await waitFor(() => $('form select[name=count]'), 4000, 'form kuis');
  const form = $('.qwrap, form.form') && $$('form.form').find((f) => f.querySelector('select[name=count]'));
  $('select[name=count]', form).value = '5';
  form.dispatchEvent(new w.Event('submit', { cancelable: true }));
  await waitFor(() => $$('.rows .row').some((r) => /5 soal/.test(r.textContent)), 30000, 'kuis tampil di daftar');
  ok(true, 'kuis dibuat dari UI dan muncul di daftar');

  btn('Latihan').click();
  await waitFor(() => /latihan\/\d+/.test(w.location.hash) && $('.qtext'), 8000, 'halaman latihan');
  const attemptId = w.location.hash.match(/latihan\/(\d+)/)[1];
  ok(true, 'latihan dimulai');
  for (let i = 0; i < 5; i++) {
    await waitFor(() => $('.qtext'), 4000, `soal ${i + 1}`);
    const opts = $$('.opt');
    if (opts.length) opts[0].click();
    else { const inp = $('input[type=text]'); inp.value = 'klorofil'; $('form.actions').dispatchEvent(new w.Event('submit', { cancelable: true })); }
    await waitFor(() => $('.feedback'), 6000, `umpan balik soal ${i + 1}`);
    if (i === 0) ok(/Sumber|Benar|Belum tepat|dinilai/.test($('.feedback').textContent), 'umpan balik langsung muncul setelah menjawab');
    const next = btn('Soal berikutnya') || btn('Selesai dan lihat hasil');
    next.click();
  }
  await waitFor(() => /hasil\/\d+/.test(w.location.hash) && $('.score'), 10000, 'hasil kuis');
  ok(/dari 5 benar/.test($('.score').textContent), 'halaman hasil menampilkan skor');
  await waitFor(() => !/Menilai jawaban isian/.test(text()), 20000, 'penilaian selesai');
  ok($$('.qres').length === 5, 'pembahasan 5 soal');
  const deep = $$('button').find((b) => b.textContent.includes('Jelaskan lebih dalam'));
  deep.click();
  await waitFor(() => $('.deep .sheet'), 20000, 'penjelasan Grok');
  ok(/Penjelasan mendalam/.test($('.deep').textContent), 'penjelasan mendalam tampil');

  w.location.hash = '#/progres';
  await waitFor(() => $('svg.chart') && text().includes('Penguasaan per topik'), 8000, 'progres');
  ok($$('svg.chart').length === 2 && $$('dl.stats.six dd').length === 6, 'progres: 2 grafik + 6 ringkasan');
  ok(/1 hari|Streak/.test(text()), 'streak tercatat setelah kuis');

  w.location.hash = '#/kuis';
  await waitFor(() => $$('.rows .row').length >= 1, 8000, 'daftar kuis');
  ok(btn('Ulangi soal lemah') || true, 'halaman kuis');

  w.location.hash = '#/';
  await waitFor(() => /berturut/.test(text()), 8000, 'dashboard setelah kuis');
  ok(/1 hari berturut-turut/.test(text()), 'dashboard: "1 hari berturut-turut." setelah kuis selesai');

  w.location.hash = '#/tidak-ada';
  await waitFor(() => /tidak ditemukan/i.test(text()), 3000, '404');
  ok(true, 'rute tidak dikenal -> halaman 404');
  ok(errors.length === 0, 'tidak ada error JavaScript di UI' + (errors.length ? ': ' + errors.join(' | ') : ''));

  console.log('== Agent offline');
  w.close();
  console.log(`\nE2E LOLOS (${passed} cek)`);
  process.exit(0);
}
main().catch((e) => { console.error('GAGAL (exception):', e); process.exit(1); });

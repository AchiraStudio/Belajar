'use strict';
// Harness UI mind map (jsdom): tab, buat, polling job, peta SVG, detail, lipat, cari di catatan,
// tampilan daftar, status usang, ekspor SVG, dan tata letak tanpa tumpang tindih.
// Jalankan: NODE_PATH=/tmp/jsdomkit/node_modules node tests/mindmap_ui_harness.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'server', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
function ok(cond, msg) {
  if (!cond) { console.error('GAGAL:', msg); process.exit(1); }
  passed++; console.log('  ok -', msg);
}
const mk = (json, status = 200) => ({ ok: status < 400, status, json: async () => json });

const T0 = Math.floor(Date.now() / 1000);
const NOTE = '## Bagian 1\n\n### Reaksi Terang\n\nTerjadi di **tilakoid**. Energi $E = hf$.\n\n### Siklus Calvin\n\nMengikat CO2 di stroma.\n';
const node = (id, label, children, detail) => ({ id, label, ...(detail ? { detail } : {}), ...(children ? { children } : {}) });
const TREE = {
  root: node('n0', 'Fotosintesis', [
    node('n1', 'Reaksi Terang', [node('n2', 'ATP dan NADPH', null, 'Hasil reaksi terang, energi $E = hf$.'), node('n3', 'Fotolisis air')], 'Terjadi di tilakoid.'),
    node('n4', 'Siklus Calvin', [node('n5', 'Fiksasi CO2'), node('n6', 'Reduksi')]),
    node('n7', 'Struktur Daun', [node('n8', 'Stomata'), node('n9', 'Kloroplas')]),
    node('n10', 'Faktor Pembatas', [node('n11', 'Cahaya'), node('n12', 'Suhu')]),
  ], 'Proses membuat makanan dari cahaya.'),
  relations: [{ from: 'n2', to: 'n4', label: 'menyediakan energi' }, { from: 'n8', to: 'n5', label: 'memasok' }],
};

const calls = [];
let mindmap = null; let stale = false; let jobPolls = 0; let job = null;
let lastBlob = null;

async function main() {
  const dom = new JSDOM(html, { url: 'http://localhost/#/materi/1?tab=mindmap', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  window.URL.createObjectURL = (b) => { lastBlob = b; return 'blob:test'; };
  window.URL.revokeObjectURL = () => {};
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.fetch = async (p, init = {}) => {
    const u = String(p);
    const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
    if (u === '/api/session') return mk({ authenticated: true });
    if (u === '/api/status') return mk({ agent: true });
    if (u.startsWith('/api/rpc/')) {
      const a = u.replace('/api/rpc/', '');
      calls.push(a);
      const data = (d) => mk({ ok: true, data: d });
      if (a === 'list_subjects') return data({ subjects: [] });
      if (a === 'dashboard') return data({ streak: { current: 0 }, today: {}, goals: {}, week: [], recent: [], overview: {}, review_due: 0 });
      if (a === 'get_document') return data({ document: { id: 1, title: 'Fotosintesis', status: 'ready', filename: 'bio.docx', page_count: 3, created_at: T0, style: 'outline' },
        subject: null, note: { content_md: NOTE, edited: 0, version: 1, updated_at: T0 }, quizzes: [], job: null });
      if (a === 'mindmap_get') return data({ mindmap: mindmap && { ...mindmap, stale }, job });
      if (a === 'mindmap_generate') { jobPolls = 0; job = { id: 5, status: 'running', progress: 20, message: 'Menyusun mind map' }; return data({ job_id: 5 }); }
      if (a === 'get_job') {
        jobPolls++;
        if (jobPolls < 2) return data({ id: 5, status: 'running', progress: 60, message: 'Menyusun mind map' });
        mindmap = { root: TREE.root, relations: TREE.relations, node_count: 13, updated_at: T0 + 10, stale: false };
        job = { id: 5, status: 'done', progress: 100 };
        return data({ id: 5, status: 'done', progress: 100, message: 'Selesai' });
      }
      return data({});
    }
    return mk({ error: 'tidak ada' }, 404);
  };
  window.eval(read('vendor/katex/katex.min.js'));
  window.eval(read('app.js'));
  window.eval(read('mindmap.js'));
  await sleep(500);

  const $ = (sel, r = document) => r.querySelector(sel);
  const $$ = (sel, r = document) => [...r.querySelectorAll(sel)];

  console.log('== Tab & keadaan kosong');
  const tabs = $$('.tabs [role="tab"]');
  ok(tabs.map((t) => t.textContent.split(' (')[0]).join('|') === 'Catatan|Mind map|Kuis', 'tiga tab: Catatan, Mind map, Kuis');
  ok($('.tabs [role="tab"][aria-selected="true"]').textContent === 'Mind map', 'query ?tab=mindmap membuka tab Mind map');
  ok($('.mm-empty') && $('.mm-empty .btn').textContent.includes('Buat mind map'), 'keadaan kosong dengan tombol Buat mind map');

  console.log('== Buat & polling');
  $('.mm-empty .btn').click();
  await sleep(100);
  ok($('.mm-prog') && $('.mm-prog [role="progressbar"]'), 'panel progres tampil saat job berjalan');
  ok(calls.includes('mindmap_generate'), 'RPC mindmap_generate terkirim');
  await sleep(3800);
  ok($('.mm-canvas svg'), 'peta SVG tampil setelah job selesai');
  ok(!$('.mm-prog'), 'panel progres hilang');

  console.log('== Peta');
  const nodes = $$('.mm-node');
  ok(nodes.length === 13, `13 simpul tergambar (dapat ${nodes.length})`);
  ok($$('.mm-node text').some((t) => t.textContent === 'Fotosintesis'), 'akar "Fotosintesis" ada');
  ok($$('.mm-canvas path[stroke-dasharray]').length === 2, '2 garis hubungan lintas cabang (putus-putus)');
  ok($$('.mm-node[tabindex="0"][role="button"]').length === 13, 'simpul bisa difokus keyboard (role=button)');
  const ids = nodes.map((n) => n.getAttribute('data-id'));
  ok(new Set(ids).size === 13, 'id simpul unik');
  const svgEl = $('.mm-canvas svg');
  ok(/translate\(.+\) scale\(.+\)/.test($('.mm-canvas svg > g').getAttribute('transform')), 'viewport punya transform pan/zoom');

  console.log('== Pilih simpul -> panel detail');
  const n2 = $('.mm-node[data-id="n2"]');
  n2.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(50);
  const side = $('.mm-side');
  ok(side && !side.hidden, 'panel detail tampil');
  ok(side.querySelector('h3').textContent === 'ATP dan NADPH', 'judul panel = label simpul');
  ok(side.querySelector('.crumb').textContent === 'Fotosintesis › Reaksi Terang', 'jejak induk ditampilkan');
  ok(side.querySelector('.katex'), 'rumus pada keterangan dirender KaTeX');
  ok(side.textContent.includes('menyediakan energi: Siklus Calvin'), 'daftar "Berhubungan dengan" memuat relasi');
  ok($('.mm-node[data-id="n2"]').classList.contains('sel'), 'simpul terpilih ditandai');

  console.log('== Lipat / buka cabang');
  const before = $$('.mm-node').length;
  const tg = $('[data-toggle="n1"]');
  ok(!!tg, 'ada tombol lipat pada cabang yang punya anak');
  tg.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(50);
  ok($$('.mm-node').length === before - 2, 'melipat "Reaksi Terang" menyembunyikan 2 anak');
  ok($$('.mm-canvas path[stroke-dasharray]').length === 1, 'relasi yang ujungnya tersembunyi tidak digambar');
  $('[data-toggle="n1"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(50);
  ok($$('.mm-node').length === before, 'membuka kembali memulihkan simpul');

  console.log('== Cari di catatan');
  const toastsBefore = $$('#toasts > *').length;
  $$('.mm-side .btn').find((b) => b.textContent.includes('Cari di catatan')).click();   // "ATP dan NADPH" tidak ada di catatan
  await sleep(80);
  ok($$('#toasts > *').length > toastsBefore && $('#toasts').textContent.includes('tidak ditemukan'), 'simpul yang tidak ada di catatan memberi pesan, bukan error');
  $$('.tabs [role="tab"]').find((t) => t.textContent === 'Mind map').click();
  await sleep(150);
  const canvasRef = $('.mm-canvas');
  $('.mm-node[data-id="n1"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(50);
  $$('.mm-side .btn').find((b) => b.textContent.includes('Cari di catatan')).click();
  await sleep(80);
  ok($('.tabs [role="tab"][aria-selected="true"]').textContent === 'Catatan', 'pindah ke tab Catatan');
  ok($$('.sheet .flash').length === 1 && $('.sheet .flash').textContent === 'Reaksi Terang', 'judul catatan yang cocok diberi sorotan');

  console.log('== Kembali ke Mind map (posisi terjaga) & tampilan daftar');
  $$('.tabs [role="tab"]').find((t) => t.textContent === 'Mind map').click();
  await sleep(150);
  ok($('.mm-canvas') === canvasRef, 'peta tidak dibangun ulang saat pindah tab (posisi & zoom terjaga)');
  $$('.mm-bar .seg button').find((b) => b.textContent === 'Daftar').click();
  await sleep(50);
  ok($('.mm-list') && $$('.mm-list details').length >= 3, 'tampilan daftar: cabang berupa <details>');
  ok($('.mm-list').textContent.includes('menyediakan energi'), 'daftar memuat hubungan antar konsep');
  $$('.mm-bar .seg button').find((b) => b.textContent === 'Peta').click();
  await sleep(50);
  ok($$('.mm-node').length === before, 'kembali ke tampilan peta');

  console.log('== Status usang');
  stale = true;
  $$('.tabs [role="tab"]').find((t) => t.textContent === 'Catatan').click();
  await sleep(30);
  $$('.tabs [role="tab"]').find((t) => t.textContent === 'Mind map').click();
  await sleep(200);
  ok($('.mm .notice.warn') && $('.mm .notice.warn').textContent.includes('Catatan sudah berubah'), 'peringatan mind map usang tampil');
  stale = false;

  console.log('== Ekspor SVG');
  $$('.mm-bar .btn').find((b) => b.textContent.trim() === 'SVG').click();
  await sleep(50);
  ok(lastBlob && lastBlob.type.startsWith('image/svg+xml'), 'unduh SVG membuat Blob image/svg+xml');
  const text = await new Promise((res) => { const fr = new window.FileReader(); fr.onload = () => res(fr.result); fr.readAsText(lastBlob); });
  ok(text.startsWith('<?xml') && text.includes('xmlns="http://www.w3.org/2000/svg"') && text.includes('Fotosintesis'), 'SVG mandiri: xmlns + isi simpul');
  ok(!text.includes('class="mm-') && !text.includes('var(--'), 'SVG tidak bergantung pada CSS/variabel halaman');
  ok((text.match(/stroke-dasharray/g) || []).length === 2, 'SVG ekspor memuat garis hubungan');

  console.log('== Tata letak');
  const L = window.Belajar.mindmap.buildLayout(TREE.root, new Set());
  ok(L.nodes.length === 13, 'layout memuat semua simpul');
  let overlap = 0;
  for (const a of L.nodes) for (const b of L.nodes) {
    if (a === b) continue;
    const ix = a.x < b.x + b.w && b.x < a.x + a.w;
    const iy = a.y < b.y + b.hgt && b.y < a.y + a.hgt;
    if (ix && iy) overlap++;
  }
  ok(overlap === 0, 'tidak ada kotak simpul yang saling menimpa');
  const rightN = L.nodes.filter((o) => o.side === 1).length; const leftN = L.nodes.filter((o) => o.side === -1).length;
  ok(rightN > 0 && leftN > 0, `akar di tengah, cabang menyebar dua sisi (kanan ${rightN}, kiri ${leftN})`);
  ok(L.nodes.filter((o) => o.side === -1).every((o) => o.x + o.w <= L.root.x), 'sisi kiri seluruhnya di kiri akar');
  ok(L.nodes.filter((o) => o.side === 1).every((o) => o.x >= L.root.x + L.root.w), 'sisi kanan seluruhnya di kanan akar');
  const big = { id: 'r', label: 'Akar', children: Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, label: `Cabang ${i} dengan nama yang cukup panjang sekali untuk dibungkus`, children: Array.from({ length: 6 }, (_, j) => ({ id: `b${i}c${j}`, label: `Anak ${j}` })) })) };
  const LB = window.Belajar.mindmap.buildLayout(big, new Set());
  let ov2 = 0;
  for (const a of LB.nodes) for (const b of LB.nodes) if (a !== b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.hgt && b.y < a.y + a.hgt) ov2++;
  ok(LB.nodes.length === 57 && ov2 === 0, 'peta besar (57 simpul, label panjang) tanpa tumpang tindih');

  console.log(`\nSemua ${passed} pemeriksaan lulus.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

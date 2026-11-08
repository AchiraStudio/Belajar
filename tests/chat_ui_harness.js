'use strict';
// Harness UI chat (jsdom): memuat app.js, mem-fake API, lalu mem-mount #/chat/:id.
// Jalankan: NODE_PATH=/tmp/jsdomkit/node_modules node tests/chat_ui_harness.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'server', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
function ok(cond, msg) {
  if (!cond) { console.error('GAGAL:', msg); process.exit(1); }
  passed++; console.log('  ok -', msg);
}

// ---------- data tiruan ----------
const T0 = Math.floor(Date.parse('2026-10-24T08:00:00') / 1000);
const T1 = Math.floor(Date.parse('2026-10-23T08:00:00') / 1000); // kemarin
let session = { id: 7, status: 'ready' };
let messages = [
  { role: 'assistant', content: 'Halo! Aku sudah membaca seluruh materi.', ts: T1 },
  { role: 'user', content: '> reaksi terang\n\nApa itu reaksi terang?', ts: T1 },
  { role: 'assistant', content: 'Reaksi terang adalah **fase** fotosintesis.', ts: T0 },
];

const mk = (json, status = 200) => ({ ok: status < 400, status, json: async () => json });

async function main() {
  const dom = new JSDOM(html, { url: 'http://localhost/#/chat/1', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;

  window.fetch = async (p, init = {}) => {
    const u = String(p);
    const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
    if (u === '/api/session') return mk({ authenticated: true });
    if (u === '/api/status') return mk({ agent: true });
    if (u.startsWith('/api/rpc/')) {
      const a = u.replace('/api/rpc/', '');
      if (a === 'chat_start') return mk({ data: { session, document: { id: 1, title: 'Fotosintesis' }, messages, mode: 'continue' } });
      if (a === 'chat_send') {
        await sleep(150); // simulasikan latensi LLM
        // doSend sudah mem-push pesan user secara optimistik; backend asli
        // mengembalikan daftar lengkap, jadi cukup tambah jawaban AI.
        messages = [...messages, { role: 'assistant', content: 'Jawaban AI.', ts: T0 + 61 }];
        return mk({ data: { response: 'Jawaban AI.', messages } });
      }
      if (a === 'chat_get') return mk({ data: { session, document: { id: 1, title: 'Fotosintesis' }, messages } });
      return mk({ error: 'tidak ada' }, 404);
    }
    return mk({ error: 'tidak ada' }, 404);
  };

  window.eval(appJs);
  await sleep(300);

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  console.log('== Kerangka chat');
  ok(document.body.classList.contains('chat-mode'), 'body.chat-mode aktif');
  ok($('.chat-container'), '.chat-container ada');
  ok($('.chat-header .chat-doc-title').textContent === 'Fotosintesis', 'judul materi di kepala');
  ok($('.chat-badge.ready'), 'badge status ready');
  ok(document.title.includes('Tanya AI: Fotosintesis'), 'judul dokumen diperbarui');

  console.log('== Utas pesan');
  ok($$('.chat-msg').length === 3, '3 pesan ter-render');
  ok($$('.chat-msg.user').length === 1, '1 pesan pengguna');
  ok($('.chat-quote-callout') && $('.chat-quote-text').textContent === 'reaksi terang', 'kutipan (>) dirender sebagai callout');
  ok($$('.chat-day').length === 2, 'pemisah hari: kemarin + hari ini');
  ok($('.chat-day:last-of-type') === null || $$('.chat-day')[1].textContent === 'Hari ini', 'label hari terbaru "Hari ini"');
  ok($('.chat-note') && $('.chat-note').textContent.includes('pesan'), 'pil info jumlah pesan');
  ok($$('.chat-action-btn').length === 4, 'aksi Salin + Balas pada 2 pesan AI');

  console.log('== Kutip / balas');
  // Pilih tombol Balas milik pesan AI yang mengandung Markdown (**fase**)
  const mdMsg = $$('.chat-msg.ai').find((m) => m.textContent.includes('fase'));
  mdMsg.querySelectorAll('.chat-action-btn').forEach((b) => { if (b.textContent.includes('Balas')) b.click(); });
  await sleep(50);
  const qbar = $('.chat-quote-bar');
  ok(qbar && !qbar.hidden, 'bar kutipan tampil setelah klik Balas');
  ok($('.chat-quote-snip').textContent.length > 0, 'cuplikan kutipan terisi');
  ok(!$('.chat-quote-snip').textContent.includes('**'), 'penanda Markdown dibersihkan dari cuplikan');
  $('.chat-quote-clear').click();
  await sleep(50);
  ok(qbar.hidden, 'bar kutipan tertutup setelah dibatalkan');

  console.log('== Kirim pesan');
  const input = $('.chat-input');
  const send = $('.chat-send-btn');
  ok(input && send && !input.disabled, 'input aktif saat ready');
  input.value = 'Bagaimana proses Calvin?';
  send.click();
  await sleep(50);
  ok($('.thinking-row'), 'indikator "sedang berpikir" tampil');
  await sleep(300);
  ok(!$('[class*=thinking-row]'), 'indikator berpikir hilang');
  ok($$('.chat-msg').length === 5, 'pesan user + jawaban AI bertambah (5)');
  ok($$('.chat-msg.user')[1].textContent.includes('Calvin'), 'isi pesan terkirim tampil');

  console.log('== Tombol hapus sesi (dialog konfirmasi)');
  let confirmShown = false;
  const origAskShowModal = window.HTMLDialogElement.prototype.showModal;
  window.HTMLDialogElement.prototype.showModal = function () { confirmShown = true; this.open = true; };
  $('.chat-del').click();
  await sleep(50);
  ok(confirmShown, 'dialog konfirmasi muncul');
  window.HTMLDialogElement.prototype.showModal = origAskShowModal;

  console.log(`\nSemua ${passed} pemeriksaan lulus.`);
  window.close();
  process.exit(0);
}

main().catch((e) => { console.error('ERROR harness:', e); process.exit(1); });

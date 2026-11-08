'use strict';
// Harness UI panel Tanya (jsdom): memuat app.js, mem-fake API, mem-mount #/materi/:id,
// lalu mensimulasikan seleksi teks catatan -> tombol "Tanya" -> panel jawaban + follow-up.
// Jalankan: NODE_PATH=/tmp/jsdomkit/node_modules node tests/notes_ask_harness.js
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
const NOTE = '# Fotosintesis\n\n## Bagian 1\n\nReaksi terang adalah **fase** fotosintesis yang menghasilkan ATP dan NADPH di tilakoid.';
const mk = (json, status = 200) => ({ ok: status < 400, status, json: async () => json });
const askCalls = [];

async function main() {
  const dom = new JSDOM(html, { url: 'http://localhost/#/materi/1', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;

  // jsdom: rect seleksi selalu 0x0; beri ukuran palsu agar popover mau tampil.
  window.Range.prototype.getBoundingClientRect = function () {
    return { width: 120, height: 18, left: 100, top: 200, right: 220, bottom: 218 };
  };

  window.fetch = async (p, init = {}) => {
    const u = String(p);
    const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
    if (u === '/api/session') return mk({ authenticated: true });
    if (u === '/api/status') return mk({ agent: true });
    if (u === '/api/notes/ask') {
      askCalls.push(body);
      return mk({ error: 'SSE tidak tersedia' }, 404); // paksa jalur fallback RPC
    }
    if (u.startsWith('/api/rpc/')) {
      const a = u.replace('/api/rpc/', '');
      if (a === 'list_subjects') return mk({ data: { subjects: [] } });
      if (a === 'dashboard') return mk({ data: { streak: { current: 1, longest: 1, freezes: 0, today: { day: 'x', seconds: 0, quizzes: 0, goal_seconds: 600, done: false }, at_risk: false }, heatmap: [], weekly: {}, overall: {}, recent_docs: [], recent_attempts: [], weak_topics: [], weak_count: 0 } });
      if (a === 'get_document') {
        return mk({ data: {
          document: { id: 1, subject_id: null, title: 'Fotosintesis', filename: 'bio.pdf', size: 10, status: 'ready', error: null, warning: null, page_count: 3, style: 'ringkas', created_at: 1, updated_at: 2, key_concepts: [], topics: [] },
          subject: null,
          note: { content_md: NOTE, edited: 0, version: 1, updated_at: 2 },
          quizzes: [], job: null } });
      }
      if (a === 'log_study') return mk({ data: { streak: { current: 1, today: { seconds: 0, goal_seconds: 600, done: false } } } });
      if (a === 'notes_ask') {
        askCalls.push(body);
        const cont = !!body.ask_session_id;
        return mk({ data: {
          answer: `Penjelasan singkat${cont ? ' (lanjutan)' : ''}: reaksi terang itu seperti panel surya daun.`,
          ask_session_id: cont ? body.ask_session_id : 5,
          mode: cont ? 'continue' : 'new',
        } });
      }
      return mk({ error: 'tidak ada' }, 404);
    }
    return mk({ error: 'tidak ada' }, 404);
  };

  window.eval(appJs);
  await sleep(300);

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  console.log('== Halaman materi');
  ok($('.sheet') && $('.sheet').textContent.includes('fase'), 'catatan ter-render');
  ok($('#view .doc-rail select option[value="sederhana"]'), 'opsi gaya Sederhana ada di rail');

  console.log('== Seleksi teks memunculkan tombol Tanya');
  const para = $$('.sheet p').find((p) => p.textContent.includes('Reaksi terang'));
  ok(!!para, 'paragraf catatan ditemukan');
  const range = document.createRange();
  range.selectNodeContents(para);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new window.Event('selectionchange'));
  await sleep(60);
  const pop = $('.ask-pop.visible');
  ok(!!pop, 'tombol "Tanya" tampil dekat seleksi');
  ok(pop.textContent.includes('Tanya'), 'label tombol benar');

  console.log('== Klik Tanya membuka panel + jawaban fallback RPC');
  pop.click();
  await sleep(80);
  ok($('.ask-panel') && !$('.ask-panel').hidden, 'panel terbuka');
  ok($('.ask-quote-text').textContent.includes('Reaksi terang'), 'kutipan terpilih tampil di panel');
  ok($('.ask-q').textContent.includes('bahasa sederhana'), 'pertanyaan bawaan dikirim');
  ok($('.ask-answer .sheet') && $('.ask-answer .sheet').textContent.includes('Penjelasan singkat'), 'jawaban AI tampil');
  ok(!$('.ask-input').disabled, 'input lanjutan aktif setelah jawaban');

  console.log('== Follow-up memakai sesi panel (CONTINUE)');
  const firstCall = askCalls.find((c) => c.question && c.question.includes('bahasa sederhana'));
  ok(firstCall && firstCall.ask_session_id == null, 'pertanyaan pertama tanpa sesi (mode NEW)');
  const input = $('.ask-input');
  input.value = 'Kenapa disebut reaksi terang?';
  $('.ask-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(80);
  ok($$('.ask-item').length === 2, 'pertanyaan lanjutan menambah utas');
  const rpcCall = askCalls.filter((c) => c.question && c.question.includes('Kenapa')).pop();
  ok(rpcCall && rpcCall.ask_session_id === 5, 'ask_session_id dikirim ulang (mode CONTINUE)');
  ok($$('.ask-answer .sheet')[1].textContent.includes('lanjutan'), 'jawaban lanjutan tampil');

  console.log('== Tutup panel');
  $('.ask-panel .chat-iconbtn').click();
  await sleep(30);
  ok($('.ask-panel').hidden, 'panel tertutup');

  console.log(`\nSemua ${passed} pemeriksaan lulus.`);
  window.close();
  process.exit(0);
}

main().catch((e) => { console.error('ERROR harness:', e); process.exit(1); });

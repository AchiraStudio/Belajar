'use strict';
// Harness UI game v2 (jsdom): hub, layar permainan, streaming, sambung ulang dengan kunci idempoten,
// petunjuk, error + coba lagi, layar hasil. Server dipalsukan di dalam fetch.
// Jalankan: NODE_PATH=<dir berisi node_modules jsdom> node tests/play_ui_harness.js
const fs = require('fs');
const path = require('path');
const { TextEncoder, TextDecoder } = require('util');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'server', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
function ok(cond, msg) { if (!cond) { console.error('GAGAL:', msg); process.exit(1); } passed++; console.log('  ok -', msg); }

const mk = (json, status = 200) => ({ ok: status < 400, status, json: async () => json });
const enc = new TextEncoder();
const sseResponse = (events, { breakAfter = null } = {}) => {
  const lines = events.map((e) => (typeof e === 'string' ? e : `data: ${JSON.stringify(e)}\n\n`));
  let i = 0;
  return {
    ok: true, status: 200,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'text/event-stream; charset=utf-8' : null) },
    body: { getReader: () => ({ read: async () => {
      if (breakAfter !== null && i >= breakAfter) throw new TypeError('network error');
      if (i >= lines.length) return { done: true };
      return { done: false, value: enc.encode(lines[i++]) };
    } }) },
  };
};

const RUN = (o = {}) => ({ id: 7, game: 'ajari', title: 'Ajari Aku', scope_kind: 'document', scope_id: 1, scope_title: 'Biologi', status: 'active',
  turn_count: 0, max_turns: 2, correct: 0, total: 0, xp: 0, state: { combo: 0 }, options: {}, started_at: 1, ...o });
const turnP = (id, idx, extra = {}) => ({ run: RUN({ turn_count: idx - 1 }), turn_id: id, idx, kind: 'explain', status: 'awaiting',
  narration: `Narasi giliran ${idx}.`, public: { prompt: `Jelaskan Klorofil (giliran ${idx})`, concept: 'Klorofil', input: 'text' }, hint_level: 0, error: null,
  retryable: false, judged: null, rewards: null, ended: false, stage: null, ...extra });

const hub = { profile: { level: 1, xp: 10, level_start: 0, next: 100 }, streak: { current: 2 }, quests: [{ key: 'play_1', title: 'Selesaikan 1 permainan', xp: 20, done: false }],
  modes: [['ajari', 'Ajari Aku'], ['detektif', 'Detektif Salah Kaprah'], ['petualangan', 'Petualangan'], ['kasus', 'Kasus Nyata'], ['kilat', 'Kilat'], ['boss', 'Ujian Boss']]
    .map(([key, title]) => ({ key, title, desc: `Deskripsi ${title}`, kind: 'explain', hints: key !== 'boss', turns: { default: 5, min: 2, max: 10 } })),
  documents: [{ id: 1, title: 'Biologi', subject_id: null, subject: null, concepts: 6 }], subjects: [], levels: { baru: 6, dikenal: 0, paham: 0, kuasai: 0 },
  weak: [], cards: { due: 3, total: 3 }, active: null, achievements: [{ key: 'first_play', title: 'Langkah Pertama', desc: 'x', unlocked: false }] };

async function main() {
  const dom = new JSDOM(html, { url: 'http://localhost/#/game', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  window.TextDecoder = TextDecoder;
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};

  const turnCalls = [];
  let answerAttempt = 0;
  let failNextAnswer = false;
  window.fetch = async (p, init = {}) => {
    const u = String(p);
    const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
    if (u === '/api/session') return mk({ authenticated: true });
    if (u === '/api/status') return mk({ agent: true });
    if (u === '/api/play/turn') {
      turnCalls.push(body);
      if (body.op === 'start') return sseResponse([{ type: 'chunk', chunk: 'Halo, aku mur' }, { type: 'chunk', chunk: 'id yang penasaran.' }, { type: 'done', data: turnP(11, 1, { narration: 'Halo, aku murid yang penasaran.' }) }]);
      if (body.op === 'hint') return sseResponse([{ type: 'chunk', chunk: 'Ingat peran pigmen hijau.' }, { type: 'done', data: { turn_id: 11, level: 1, hint: 'Ingat peran pigmen hijau.' } }]);
      if (body.op === 'answer') {
        answerAttempt++;
        if (answerAttempt === 1) return sseResponse([{ type: 'chunk', chunk: 'Bagus, tapi' }], { breakAfter: 1 });      // koneksi putus
        if (failNextAnswer) return sseResponse([{ type: 'done', data: turnP(12, 2, { status: 'error', error: 'AI gagal menyusun giliran', retryable: true, narration: '' }) }]);
        const last = body.turn_id === 12;
        let done;
        if (last) {
          done = { ...turnP(13, 3, { status: 'done', kind: 'end', narration: 'Penutup yang baik.', ended: true, public: {} }),
            run: RUN({ status: 'finished', turn_count: 2, correct: 2, total: 2, xp: 55 }),
            judged: { turn_id: 12, obs: 0.9, correct: true, xp: 20, feedback: 'Mantap.', reveal: { poin_kunci: ['inti'] } },
            rewards: { xp: 55, bonuses: { selesai: 25, akurasi: 15 }, level_up: true, level_after: 2, newly_mastered: ['Klorofil'],
              achievements: [{ key: 'first_play', title: 'Langkah Pertama' }], quests: [], quest_xp: 0 } };
        } else {
          done = turnP(12, 2, { narration: 'Bagus, tapi coba jelaskan lagi.',
            judged: { turn_id: 11, obs: 0.8, correct: true, xp: 12, feedback: 'Penjelasanmu jelas.',
              rubrik: { akurat: 3, lengkap: 2, jelas: 3, contoh: 2 }, reveal: { poin_kunci: ['inti Klorofil', 'contoh'] } } });
        }
        return sseResponse([{ type: 'status', stage: 'merapikan' }, { type: 'chunk', chunk: 'Penutup yang baik.' }, { type: 'done', data: done }]);
      }
      if (body.op === 'retry') return sseResponse([{ type: 'chunk', chunk: 'Ulang berhasil.' }, { type: 'done', data: turnP(12, 2, { narration: 'Ulang berhasil.' }) }]);
      return mk({ error: 'op tidak dikenal' }, 400);
    }
    if (u.startsWith('/api/rpc/')) {
      const a = u.replace('/api/rpc/', '');
      if (a === 'list_subjects') return mk({ data: { subjects: [] } });
      if (a === 'play_hub') return mk({ data: hub });
      if (a === 'play_flag') { turnCalls.push({ rpc: 'play_flag', ...body }); return mk({ data: { ok: true } }); }
      return mk({ data: {} });
    }
    return mk({ error: 'tidak ada' }, 404);
  };

  window.eval(read('app.js'));
  for (const f of ['play/core.js', 'play/run.js', 'play/cards.js']) window.eval(read(f));
  await sleep(300);
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  console.log('== Hub');
  ok($$('.pl-mode').length === 6, 'enam mode permainan tampil');
  ok($('.pl-lvl b').textContent === '1' && $('.pl-xp').textContent.includes('XP'), 'profil: level dan XP');
  ok($$('.pl-q').length === 1 && $('.pl-badge'), 'misi harian dan lencana tampil');
  ok($('.pl-mode').disabled === false, 'mode dapat dipilih (tanpa run aktif)');

  console.log('== Opsi lalu mulai');
  $('.pl-mode').click();
  await sleep(30);
  ok($('dialog[open] .pl-opts-form'), 'dialog opsi terbuka');
  $('dialog[open] form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(500);
  ok(window.location.hash === '#/game/run', 'navigasi ke layar permainan');
  const start = turnCalls.find((c) => c.op === 'start');
  ok(start && start.game === 'ajari' && start.scope_kind === 'all' && start.client_key.length >= 8 && start.options.jumlah_giliran === 5, 'start: game, cakupan, kunci idempoten, opsi dikirim');
  ok($('.pl-narr').textContent.includes('Halo, aku murid yang penasaran.'), 'narasi hasil stream tampil utuh');
  ok($('.pl-panel textarea'), 'panel input Ajari Aku (textarea)');
  ok($('.pl-q-text').textContent.includes('giliran 1'), 'prompt murid tampil');
  ok(!document.body.textContent.includes('poin_kunci'), 'tidak ada kunci jawaban di halaman');
  ok($('.pl-dock button').textContent.includes('Petunjuk (0/3)'), 'tombol petunjuk di dock');

  console.log('== Petunjuk');
  $$('.pl-dock button').find((b) => b.textContent.includes('Petunjuk')).click();
  await sleep(500);
  const hintCall = turnCalls.find((c) => c.op === 'hint');
  ok(hintCall && hintCall.level === 1 && hintCall.turn_id === 11, 'petunjuk tingkat 1 diminta');
  ok($('.pl-hint').textContent.includes('Ingat peran pigmen hijau'), 'petunjuk tampil bertahap');
  ok($$('.pl-dock button').find((b) => b.textContent.includes('Petunjuk')).textContent.includes('1/3'), 'penghitung petunjuk bertambah');

  console.log('== Jawab: koneksi putus lalu sambung dengan kunci yang sama');
  $('.pl-panel textarea').value = 'Klorofil adalah pigmen hijau yang menyerap cahaya untuk fotosintesis.';
  $$('.pl-panel .btn').find((b) => b.textContent.includes('Kirim')).click();
  await sleep(2600);
  const answers = turnCalls.filter((c) => c.op === 'answer');
  ok(answers.length === 2 && answers[0].client_key === answers[1].client_key, 'jawaban dikirim ulang dengan client_key yang sama setelah putus');
  ok(answers[0].turn_id === 11 && answers[0].answer.text.includes('pigmen hijau'), 'jawaban memuat teks dan turn_id');
  ok($('.pl-fb.ok') && $('.pl-fb').textContent.includes('Penjelasanmu jelas.'), 'umpan balik penilaian tampil');
  ok($$('.pl-rubric div').length === 4, 'rubrik 4 dimensi tampil');
  ok($('.pl-fb').textContent.includes('inti Klorofil') && $('.pl-fb .xp').textContent.includes('+12'), 'poin kunci dibuka setelah dinilai + XP');
  ok($('.pl-q-text').textContent.includes('giliran 2'), 'giliran 2 siap dijawab');
  ok($$('.pl-chiprow .gchip').some((c) => c.textContent.includes('1/2') || c.textContent.includes('2/2')), 'chip progres giliran tampil');

  console.log('== Flag soal keliru');
  $('.pl-fb .btn').click();
  await sleep(60);
  ok(turnCalls.some((c) => c.rpc === 'play_flag' && c.turn_id === 11), 'play_flag dikirim untuk giliran yang dinilai');

  console.log('== Error pembuatan giliran lalu coba lagi');
  failNextAnswer = true;
  $('.pl-panel textarea').value = 'Jawaban kedua yang cukup panjang untuk diuji.';
  $$('.pl-panel .btn').find((b) => b.textContent.includes('Kirim')).click();
  await sleep(400);
  ok($('.pl-err') && $('.pl-err').textContent.includes('AI gagal menyusun giliran'), 'error ditampilkan dengan pesan yang jelas');
  const retryBtn = $$('.pl-err .btn').find((b) => b.textContent.includes('Coba lagi'));
  ok(retryBtn, 'tombol Coba lagi tersedia');
  failNextAnswer = false;
  retryBtn.click();
  await sleep(500);
  const retryCall = turnCalls.find((c) => c.op === 'retry');
  ok(retryCall && retryCall.turn_id === 12, 'retry memakai turn_id giliran yang gagal');
  ok($('.pl-narr').textContent.includes('Ulang berhasil.') && $('.pl-panel textarea'), 'giliran pulih setelah coba lagi');

  console.log('== Giliran terakhir dan layar hasil');
  $('.pl-panel textarea').value = 'Penjelasan terakhir yang lengkap tentang klorofil dan cahaya.';
  $$('.pl-panel .btn').find((b) => b.textContent.includes('Kirim')).click();
  await sleep(700);
  ok($('.pl-ended') && $('.pl-endhead h1').textContent.includes('selesai'), 'layar hasil tampil');
  ok($('.pl-endstats').textContent.includes('+55') && $('.pl-endstats').textContent.includes('100%'), 'XP dan akurasi tampil');
  const txt = $('.pl-ended').textContent;
  ok(txt.includes('Bonus selesai +25') && txt.includes('Bonus akurasi'), 'rincian bonus tampil');
  ok(txt.includes('Naik ke level 2') && txt.includes('Konsep dikuasai: Klorofil') && txt.includes('Lencana: Langkah Pertama'), 'perayaan: naik level, konsep dikuasai, lencana');
  ok($('.pl-dock') === null || $('.pl-dock').parentElement === null, 'dock hilang di layar hasil');

  console.log(`\nSemua ${passed} pemeriksaan lulus.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

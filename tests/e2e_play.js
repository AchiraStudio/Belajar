'use strict';
// E2E game v2 lewat tumpukan nyata: HTTP -> sseRoute -> bridge WS -> agent -> mock PAF.
// Dijalankan oleh tests/run_e2e.sh setelah data uji di-seed (tests/seed_play.py).
const BASE = process.env.BASE || 'http://127.0.0.1:3055';
const PASSWORD = process.env.APP_PASSWORD;
const DOC = Number(process.env.PLAY_DOC);
let passed = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ok(cond, msg) { if (!cond) { console.error('GAGAL:', msg); process.exit(1); } passed++; console.log('  ok -', msg); }
const uid = () => 'e2e-' + Math.random().toString(36).slice(2, 12) + Date.now();

let cookie = '';
async function call(p, opts = {}) {
  const res = await fetch(BASE + p, { ...opts, headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) }, redirect: 'manual' });
  for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) { const kv = c.split(';')[0]; if (kv.startsWith('sid=')) cookie = kv; }
  return res;
}
const rpc = async (a, body = {}) => { const r = await call('/api/rpc/' + a, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };

// Baca SSE; abortAfterChunks menutup koneksi dari sisi klien setelah N event chunk.
async function sse(body, { abortAfterChunks = 0 } = {}) {
  const ctl = new AbortController();
  const res = await call('/api/play/turn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
  const out = { status: res.status, headers: res.headers, events: [], pings: 0, aborted: false, done: null, error: null };
  if (!res.headers.get('content-type', '').includes('text/event-stream')) { out.json = await res.json().catch(() => null); return out; }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; let chunks = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n'); buf = parts.pop();
      for (const part of parts) {
        if (part.startsWith(':')) { out.pings++; continue; }
        if (!part.startsWith('data: ')) continue;
        const ev = JSON.parse(part.slice(6)); out.events.push(ev);
        if (ev.type === 'chunk') { chunks++; if (abortAfterChunks && chunks >= abortAfterChunks) { out.aborted = true; ctl.abort(); return out; } }
        if (ev.type === 'done') out.done = ev.data;
        if (ev.type === 'error') out.error = ev;
      }
    }
  } catch (e) { if (!out.aborted) throw e; }
  return out;
}
const text = (o) => o.events.filter((e) => e.type === 'chunk').map((e) => e.chunk).join('');

async function main() {
  console.log('== Game: autentikasi dan validasi');
  const anon = await fetch(BASE + '/api/play/turn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  ok(anon.status === 401, 'rute SSE game menolak pengguna belum login');
  const login = await call('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) });
  ok(login.status === 200, 'login');
  const bad = await sse({ op: 'hapus_semua' });
  ok(bad.status === 400 && /op tidak valid/.test(JSON.stringify(bad.json)), 'op tidak valid ditolak 400 sebelum membuka stream');

  console.log('== Hub lewat RPC');
  const hub = await rpc('play_hub');
  ok(hub.status === 200 && hub.data.modes.length === 6 && hub.data.documents.some((d) => d.id === DOC), 'play_hub: 6 mode dan dokumen uji');
  ok(hub.data.active === null, 'tidak ada run aktif di awal');

  console.log('== Start melalui SSE sungguhan');
  const k1 = uid();
  const st = await sse({ op: 'start', game: 'ajari', scope_kind: 'document', scope_id: DOC, client_key: k1, options: { jumlah_giliran: 3 } });
  ok(st.status === 200 && st.headers.get('x-accel-buffering') === 'no' && /no-cache/.test(st.headers.get('cache-control')), 'header SSE: no-cache dan X-Accel-Buffering');
  ok(st.done && st.done.status === 'awaiting' && st.done.public.prompt, 'event done membawa giliran siap');
  ok(st.events.filter((e) => e.type === 'chunk').length >= 2, 'narasi tiba sebagai beberapa potongan chunk');
  ok(text(st).includes('Narasi ajari') && !text(st).includes('GAME_DATA'), 'narasi benar, blok data tidak diteruskan ke klien');
  ok(!JSON.stringify(st.events).includes('poin_kunci'), 'kunci jawaban tidak pernah lewat jaringan');
  const run1 = st.done.run.id;
  const second = await sse({ op: 'start', game: 'kilat', scope_kind: 'document', scope_id: DOC, client_key: uid() });
  ok(second.error && /Masih ada permainan/.test(second.error.error) && second.error.retryable === false, 'run kedua saat run aktif ditolak lewat event error (bukan retryable) di stream');

  console.log('== Jawab, lalu klien terputus di tengah stream');
  const k2 = uid();
  const cut = await sse({ op: 'answer', run_id: run1, turn_id: st.done.turn_id, client_key: k2, answer: { text: 'Klorofil adalah pigmen hijau penyerap cahaya pada kloroplas tumbuhan.' } }, { abortAfterChunks: 1 });
  ok(cut.aborted && !cut.done, 'koneksi klien ditutup setelah chunk pertama');
  const re = await rpc('play_turn', { op: 'attach', client_key: k2 });
  ok(re.status === 200 && re.data.status === 'awaiting' && re.data.idx === 2, 'agent tetap menyelesaikan giliran: attach lewat client_key mengembalikan giliran 2');
  ok(re.data.judged && re.data.judged.obs > 0 && re.data.judged.reveal.poin_kunci, 'penilaian tersimpan dan terbaca setelah sambung ulang');
  const dup = await rpc('play_turn', { op: 'answer', run_id: run1, turn_id: st.done.turn_id, client_key: k2, answer: { text: 'dikirim ulang' } });
  ok(dup.status === 200 && dup.data.turn_id === re.data.turn_id, 'kirim ulang kunci yang sama: tidak ada giliran ganda');

  console.log('== Hint, finish, dan hadiah');
  const hint = await sse({ op: 'hint', run_id: run1, turn_id: re.data.turn_id });
  ok(hint.done && hint.done.level === 1 && text(hint).includes('Petunjuk tingkat 1'), 'petunjuk di-stream per chunk');
  const fin = await rpc('play_finish', { run_id: run1 });
  ok(fin.status === 200 && fin.data.run.status === 'finished' && fin.data.rewards.xp > 0, 'play_finish: hadiah dibagikan');
  const prof = await rpc('play_profile');
  ok(prof.data.profile.xp >= fin.data.rewards.xp, 'XP masuk ke profil');
  ok((await rpc('play_hub')).data.active === null, 'tidak ada run aktif setelah selesai');

  console.log('== Heartbeat SSE');
  const slow = await sse({ op: 'start', game: 'kilat', scope_kind: 'document', scope_id: DOC, client_key: uid(), options: { jumlah_giliran: 5 } });
  ok(slow.done && slow.done.status === 'awaiting', 'stream lambat tetap selesai');
  ok(slow.pings >= 1, `komentar ": ping" dikirim saat stream berjalan lama (${slow.pings}x)`);
  await rpc('play_abandon', { run_id: slow.done.run.id });

  console.log('== Peta & kartu');
  const mp = await rpc('play_map', { document_id: DOC });
  ok(mp.data.groups.flatMap((g) => g.concepts).length === 6, 'peta penguasaan memuat 6 konsep');
  ok((await rpc('cards_due')).status === 200 && (await rpc('concepts_list', { document_id: DOC })).data.count === 6, 'cards_due dan concepts_list tersedia');

  console.log(`\nSemua ${passed} pemeriksaan lulus.`);
}
main().catch((e) => { console.error(e); process.exit(1); });

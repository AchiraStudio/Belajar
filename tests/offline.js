'use strict';
// Dipanggil run_e2e.sh dengan argumen: fase ("down" | "up")
const BASE = process.env.BASE;
const phase = process.argv[2];
let cookie = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(p, body) {
  const res = await fetch(BASE + p, { method: body === undefined ? 'GET' : 'POST', headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = res.headers.getSetCookie().find((c) => c.startsWith('sid='));
  if (sc) cookie = sc.split(';')[0];
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
function ok(c, m) { if (!c) { console.error('GAGAL:', m); process.exit(1); } console.log('  ok -', m); }
(async () => {
  await call('/api/login', { password: process.env.APP_PASSWORD });
  if (phase === 'down') {
    ok((await call('/api/status')).agent === false, 'status: agent offline setelah PC dimatikan');
    const r = await call('/api/rpc/dashboard', {});
    ok(r.status === 503 && r.offline === true && /offline/i.test(r.error), 'RPC saat PC mati -> 503 dengan pesan jelas');
    const t0 = Date.now(); await call('/api/rpc/ping', {});
    ok(Date.now() - t0 < 1500, 'gagal cepat (tidak menggantung) saat PC mati');
  } else {
    for (let i = 0; i < 40; i++) { if ((await call('/api/status')).agent) break; await sleep(500); }
    ok((await call('/api/status')).agent === true, 'agent tersambung otomatis setelah PC menyala lagi');
    const d = await call('/api/rpc/dashboard', {});
    ok(d.status === 200 && d.data.overall.documents >= 2, 'data lama masih utuh di SQLite lokal setelah restart');
  }
})().catch((e) => { console.error('GAGAL (exception):', e); process.exit(1); });

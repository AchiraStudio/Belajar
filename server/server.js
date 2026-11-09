'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { AgentBridge, safeEqual } = require('./bridge');

// ---- .env sederhana (tanpa dependensi) ----
(function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2].trimEnd(); // hapus trailing whitespace agar tidak ikut terbawa ke nilai token
    if (v.length >= 2 && /^["']/.test(v) && v[0] === v[v.length - 1]) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
})();

const PORT = parseInt(process.env.PORT || '3000', 10);
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';
const SESSION_DAYS = parseInt(process.env.SESSION_DAYS || '30', 10);
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '40', 10);

const problems = [];
if (APP_PASSWORD.length < 8) problems.push('APP_PASSWORD (minimal 8 karakter)');
if (SESSION_SECRET.length < 16) problems.push('SESSION_SECRET (minimal 16 karakter acak)');
if (BRIDGE_TOKEN.length < 16) problems.push('BRIDGE_TOKEN (minimal 16 karakter acak)');
if (problems.length) {
  console.error('Konfigurasi belum lengkap. Isi di server/.env: ' + problems.join(', '));
  process.exit(2);
}

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
const server = http.createServer(app);
const bridge = new AgentBridge(server, { token: BRIDGE_TOKEN, path: '/bridge' });

// ---- Header keamanan ----
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; " +
    "connect-src 'self' ipc: http://ipc.localhost https://ipc.localhost; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// ---- Sesi login (cookie bertanda tangan HMAC) ----
const sign = (value) => crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');

function makeSession() {
  const exp = String(Date.now() + SESSION_DAYS * 86400000);
  return `${exp}.${sign(exp)}`;
}
function validSession(token) {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Date.now();
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function requireAuth(req, res, next) {
  if (validSession(cookies(req).sid)) return next();
  res.status(401).json({ error: 'Belum login' });
}

// Batasi percobaan login: 6 kali per menit per IP
const attempts = new Map();
function loginLimited(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || rec.reset < now) { attempts.set(ip, { count: 1, reset: now + 60000 }); return false; }
  rec.count += 1;
  return rec.count > 6;
}
setInterval(() => { const n = Date.now(); for (const [k, v] of attempts) if (v.reset < n) attempts.delete(k); }, 60000).unref();

app.post('/api/login', express.json({ limit: '4kb' }), (req, res) => {
  if (loginLimited(req.ip)) return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi sebentar.' });
  const password = String((req.body && req.body.password) || '');
  if (!safeEqual(password, APP_PASSWORD)) return res.status(401).json({ error: 'Password salah' });
  const flags = ['HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${SESSION_DAYS * 86400}`];
  if (COOKIE_SECURE) flags.push('Secure');
  res.setHeader('Set-Cookie', `sid=${makeSession()}; ${flags.join('; ')}`);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: validSession(cookies(req).sid) });
});

// ---- Pemetaan error bridge -> HTTP ----
function sendError(res, e) {
  if (e.code === 'AGENT_OFFLINE') return res.status(503).json({ error: 'PC lokal sedang offline. Nyalakan agent lalu coba lagi.', offline: true });
  if (e.code === 'TIMEOUT') return res.status(504).json({ error: 'PC lokal tidak membalas tepat waktu.' });
  if (e.code === 'AGENT_ERROR') return res.status(400).json({ error: e.message });
  console.error('[API]', e);
  res.status(500).json({ error: 'Kesalahan server' });
}

app.get('/api/status', requireAuth, (req, res) => {
  res.json({ agent: bridge.connected });
});

// ---- RPC: hanya action yang ada di daftar ini yang diteruskan ke agent ----
const ACTIONS = new Set([
  'ping', 'llm_check', 'get_job', 'get_settings', 'save_settings',
  'list_subjects', 'create_subject', 'delete_subject',
  'list_documents', 'get_document', 'update_document', 'delete_document', 'reprocess_document',
  'save_note', 'log_study',
  'mindmap_get', 'mindmap_generate', 'mindmap_delete',
  'generate_quiz', 'list_quizzes', 'delete_quiz',
  'start_attempt', 'start_review', 'get_attempt', 'check_answer', 'finish_attempt', 'explain_question',
  'dashboard', 'progress',
  'chat_start', 'chat_get', 'chat_send', 'chat_delete',
  'notes_ask', 'notes_ask_delete',
  // kartu belajar (SM-2) dan istilah
  'cards_due', 'cards_review', 'cards_build', 'cards_stats', 'cards_export',
  'concepts_list', 'concepts_expand',
  // game belajar interaktif (v2)
  'play_hub', 'play_turn', 'play_turn_get', 'play_get', 'play_finish', 'play_abandon', 'play_flag',
  'play_map', 'play_runs', 'play_profile',
]);

app.post('/api/rpc/:action', requireAuth, express.json({ limit: '1mb' }), async (req, res) => {
  const action = req.params.action;
  if (!ACTIONS.has(action)) return res.status(404).json({ error: 'Action tidak dikenal' });
  try {
    const timeout = (action === 'chat_send' || action === 'notes_ask') ? 120000
      : action === 'play_turn' ? 180000
      : action === 'llm_check' ? 60000 : 25000;
    const data = await bridge.send({ ...(req.body || {}), action }, timeout);
    res.json({ ok: true, data });
  } catch (e) { sendError(res, e); }
});

// ---- SSE generik: satu pembantu untuk semua rute streaming (chat, panel Tanya, game) ----
// pick(body) -> { payload } atau { error }. Komentar `: ping` tiap 15 dtk menjaga koneksi hidup di
// jaringan seluler dan proxy. Bila browser terputus, agent TIDAK dibatalkan: ia menyelesaikan dan
// menyimpan hasilnya (klien bisa mengambilnya lagi lewat RPC).
const SSE_PING_MS = Number(process.env.SSE_PING_MS) || 15000;   // env hanya untuk pengujian
function sseRoute(routePath, action, pick, timeoutMs = 120000) {
  app.post(routePath, requireAuth, express.json({ limit: '1mb' }), async (req, res) => {
    if (!bridge.connected) {
      return res.status(503).json({ error: 'PC lokal sedang offline. Nyalakan agent lalu coba lagi.', offline: true });
    }
    const picked = pick(req.body || {});
    if (!picked || picked.error) {
      return res.status(400).json({ error: (picked && picked.error) || 'Parameter tidak lengkap' });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    let closed = false;
    const send = (obj) => { if (!closed) res.write(`data: ${JSON.stringify(obj)}\n\n`); };
    const ping = setInterval(() => { if (!closed) res.write(': ping\n\n'); }, SSE_PING_MS);
    ping.unref();
    res.on('close', () => { closed = true; clearInterval(ping); });

    try {
      const finalData = await bridge.send({ ...picked.payload, action, stream: true }, timeoutMs,
        (d) => send(d && d.stage ? { type: 'status', stage: d.stage } : { type: 'chunk', ...d }));
      send({ type: 'done', data: finalData });
    } catch (e) {
      send({ type: 'error', error: e.message, code: e.code || null, retryable: e.code !== 'AGENT_ERROR' });
    }
    clearInterval(ping);
    if (!closed) res.end();
  });
}

// Chat per materi
sseRoute('/api/chat/send', 'chat_send', (b) => {
  const sessionId = parseInt(b.session_id, 10);
  const message = String(b.message || '').trim();
  if (!sessionId || !message) return { error: 'session_id dan message diperlukan' };
  return { payload: { session_id: sessionId, message } };
});

// Game belajar: satu giliran (start/answer/hint/retry/attach), streaming
sseRoute('/api/play/turn', 'play_turn', (b) => {
  const op = String(b.op || '');
  if (!['start', 'answer', 'hint', 'retry', 'attach'].includes(op)) return { error: 'op tidak valid' };
  return { payload: {
    op, run_id: b.run_id, turn_id: b.turn_id, level: b.level,
    client_key: String(b.client_key || '').slice(0, 64),
    game: b.game, scope_kind: b.scope_kind, scope_id: b.scope_id, options: b.options, answer: b.answer,
  } };
}, 180000);

// Panel Tanya: tanya AI tentang teks yang diseleksi di catatan
sseRoute('/api/notes/ask', 'notes_ask', (b) => {
  const documentId = parseInt(b.document_id, 10);
  const quote = String(b.quote || '').trim();
  const question = String(b.question || '').trim();
  if (!documentId || !quote || !question) return { error: 'document_id, quote, dan question diperlukan' };
  return { payload: { document_id: documentId, quote, question, ask_session_id: b.ask_session_id || null } };
});

// ---- Upload: multipart dari browser -> base64 ke agent ----
const ALLOWED_EXT = new Set(['.pdf', '.docx', '.pptx', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.txt', '.md']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(ALLOWED_EXT.has(ext) ? null : Object.assign(new Error('Format file tidak didukung'), { code: 'BAD_FORMAT' }), true);
  },
});

app.post('/api/upload', requireAuth, (req, res) => {
  if (!bridge.connected) return res.status(503).json({ error: 'PC lokal sedang offline. Nyalakan agent lalu coba lagi.', offline: true });
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `File melebihi ${MAX_UPLOAD_MB} MB`
        : err.code === 'BAD_FORMAT' ? err.message : 'Upload gagal';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'File belum dipilih' });
    const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    try {
      const data = await bridge.send({
        action: 'upload_document',
        filename,
        data: req.file.buffer.toString('base64'),
        subject_id: req.body.subject_id || null,
        new_subject: req.body.new_subject || '',
        style: req.body.style || '',
        title: req.body.title || '',
      }, 120000);
      res.json({ ok: true, data });
    } catch (e) { sendError(res, e); }
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));

// ---- Frontend statis ----
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '5m', index: 'index.html' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log(`Server berjalan di port ${PORT}. Bridge di /bridge`);
});

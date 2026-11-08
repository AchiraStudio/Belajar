'use strict';
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function fail(message, code) {
  return Object.assign(new Error(message), { code });
}

/**
 * Bridge WebSocket: PC lokal (agent.py) menghubungi VPS lebih dulu, lalu VPS
 * mengirim perintah lewat koneksi itu. Dipasang pada server HTTP yang sama
 * (path /bridge) sehingga cukup satu port dan satu sertifikat TLS.
 */
class AgentBridge {
  constructor(httpServer, { token, path = '/bridge' }) {
    this.token = token;
    this.ws = null;
    this.pending = new Map();
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 * 1024 });

    httpServer.on('upgrade', (req, socket, head) => {
      let url;
      try { url = new URL(req.url, 'http://localhost'); } catch { return socket.destroy(); }
      if (url.pathname !== path) return socket.destroy();

      const header = req.headers.authorization || '';
      const supplied = header.startsWith('Bearer ') ? header.slice(7) : (url.searchParams.get('token') || '');
      if (!this.token || !safeEqual(supplied, this.token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        return socket.destroy();
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this._onConnect(ws));
    });

    // Deteksi koneksi mati (PC tidur / jaringan putus tanpa close frame)
    this.timer = setInterval(() => {
      const ws = this.ws;
      if (!ws) return;
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch { /* diabaikan */ }
    }, 20000);
    this.timer.unref();
  }

  get connected() {
    return !!this.ws && this.ws.readyState === 1;
  }

  _onConnect(ws) {
    if (this.ws && this.ws !== ws) {
      try { this.ws.close(4000, 'replaced'); } catch { /* diabaikan */ }
    }
    this.ws = ws;
    ws.isAlive = true;
    console.log('[Bridge] Agent terhubung');

    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (raw) => {
      ws.isAlive = true;
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const entry = this.pending.get(msg.req_id);
      if (!entry) return;
      if (msg.type === 'chunk') {
        if (entry.resetTimer) entry.resetTimer();
        if (entry.onChunk) entry.onChunk(msg.data);
        return;
      }
      this.pending.delete(msg.req_id);
      clearTimeout(entry.timer);
      if (msg.ok) entry.resolve(msg.data);
      else entry.reject(fail(msg.error || 'Agent mengembalikan error', 'AGENT_ERROR'));
    });
    ws.on('close', () => {
      console.log('[Bridge] Agent terputus');
      if (this.ws === ws) this.ws = null;
      for (const [id, entry] of this.pending) {
        if (entry.ws === ws) {
          this.pending.delete(id);
          clearTimeout(entry.timer);
          entry.reject(fail('Agent terputus saat memproses', 'AGENT_OFFLINE'));
        }
      }
    });
    ws.on('error', (e) => console.error('[Bridge] WS error:', e.message));
  }

  send(payload, timeoutMs = 20000, onChunk = null) {
    return new Promise((resolve, reject) => {
      const ws = this.ws;
      if (!ws || ws.readyState !== 1) return reject(fail('Agent tidak terhubung', 'AGENT_OFFLINE'));
      const req_id = crypto.randomBytes(8).toString('hex');
      let timer = setTimeout(() => {
        this.pending.delete(req_id);
        reject(fail('Agent tidak membalas tepat waktu', 'TIMEOUT'));
      }, timeoutMs);
      const resetTimer = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this.pending.delete(req_id);
          reject(fail('Agent tidak membalas tepat waktu', 'TIMEOUT'));
        }, timeoutMs);
      };
      this.pending.set(req_id, { resolve, reject, timer, ws, onChunk, resetTimer });
      ws.send(JSON.stringify({ ...payload, req_id }), (err) => {
        if (err) {
          this.pending.delete(req_id);
          clearTimeout(timer);
          reject(fail('Gagal mengirim ke agent', 'AGENT_OFFLINE'));
        }
      });
    });
  }
}

module.exports = { AgentBridge, safeEqual };

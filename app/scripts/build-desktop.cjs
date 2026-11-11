#!/usr/bin/env node
/*
 * Builds the Belajar desktop app (Tauri 2 release build + installer).
 *
 *   node scripts/build-desktop.cjs                       # server at http://127.0.0.1:8080
 *   node scripts/build-desktop.cjs --server https://belajar.example.org
 *   node scripts/build-desktop.cjs --bundles nsis,msi    # default: nsis
 *
 * Like the Android build, the app loads the UI from the server's address: the session cookie is
 * SameSite=Strict and the server sends no CORS headers, so a UI bundled in the app (origin
 * tauri.localhost) could not log in. Window controls keep working for 127.0.0.1:8080 / localhost:8080
 * (src-tauri/capabilities/default.json); add other origins there if you use a different server.
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tauriDir = path.join(root, 'src-tauri');
const flag = (n) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function validateServer(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Alamat server harus http(s).');
  if (url.username || url.password) throw new Error('Alamat server tidak boleh memuat kredensial.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname);
  if (url.protocol === 'http:' && !local) throw new Error('HTTP polos hanya untuk jaringan lokal. Pakai https untuk server publik.');
  return url.origin;
}

const server = validateServer(flag('--server') || process.env.BELAJAR_SERVER_URL || 'http://127.0.0.1:8080');
const bundles = flag('--bundles') || 'nsis';
const overlay = path.join(tauriDir, '.desktop-server.generated.conf.json');
fs.writeFileSync(overlay, `${JSON.stringify({ build: { frontendDist: server } }, null, 2)}\n`);

console.log(`Server  : ${server}\nBundles : ${bundles}`);
const child = spawn('npx', ['tauri', 'build', '--config', overlay, '--bundles', bundles], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('close', (code) => {
  fs.rmSync(overlay, { force: true });
  if (code === 0) console.log(`\nSelesai. Pemasang ada di: ${path.join(tauriDir, 'target', 'release', 'bundle')}`);
  process.exit(code ?? 1);
});

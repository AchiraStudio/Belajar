#!/usr/bin/env node
/*
 * Builds the Stuby desktop app (Tauri 2 release build + installer).
 *
 *   node scripts/build-desktop.cjs                       # standalone: the server is inside the app
 *   node scripts/build-desktop.cjs --bundles nsis,msi    # default: nsis
 *   node scripts/build-desktop.cjs --debug                # unoptimised build with debug info (bigger, slower)
 *   node scripts/build-desktop.cjs --server https://stuby.example.org   # thin client, see below
 *
 * Standalone (default): the app starts its own Stuby server on a loopback port and shows it, so
 * there is nothing else to run and nothing to configure. Data lives in an on-device SQLite file in
 * the user's app-data folder (src-tauri/src/embedded.rs); it works offline.
 *
 * Thin client (--server): the window shows a Stuby server you run elsewhere (for example the
 * Linux server from docs/LINUX_SERVER_SETUP.md). No server is embedded. The server must be reached
 * over https unless it is on the local network, and window controls only work for the origins
 * listed in src-tauri/capabilities/default.json (127.0.0.1 / localhost; add yours for a domain).
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

const serverArg = flag('--server') || process.env.STUBY_SERVER_URL;
const bundles = flag('--bundles') || 'nsis';
const debug = process.argv.includes('--debug');
const args = ['tauri', 'build', '--bundles', bundles];
if (debug) args.push('--debug');

let overlay;
if (serverArg) {
  const server = validateServer(serverArg);
  overlay = path.join(tauriDir, '.desktop-server.generated.conf.json');
  fs.writeFileSync(overlay, `${JSON.stringify({ build: { frontendDist: server } }, null, 2)}\n`);
  args.push('--config', overlay);
  console.log(`Mode    : thin client -> ${server}\nBundles : ${bundles}`);
} else {
  console.log(`Mode    : standalone (server di dalam aplikasi)\nBundles : ${bundles}`);
}

const child = spawn('npx', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
child.on('close', (code) => {
  if (overlay) fs.rmSync(overlay, { force: true });
  if (code === 0) {
    console.log(`\nSelesai. Pemasang ada di: ${path.join(tauriDir, 'target', debug ? 'debug' : 'release', 'bundle')}`);
    if (!serverArg) console.log('Buka aplikasinya: langsung jalan, tanpa pengaturan dan tanpa internet (data disimpan di perangkat).');
  }
  process.exit(code ?? 1);
});

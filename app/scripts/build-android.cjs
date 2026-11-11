#!/usr/bin/env node
/*
 * Builds the Belajar Android app (debug APK by default).
 *
 *   node scripts/build-android.cjs --server http://192.168.1.20:8080
 *   BELAJAR_SERVER_URL=https://belajar.example.org node scripts/build-android.cjs --release
 *
 * Why the app loads the server's address instead of bundling the UI:
 *   The server authenticates with a SameSite=Strict, HttpOnly cookie and sends no CORS headers.
 *   A UI bundled inside the app has a different origin (tauri.localhost) from the server, so the
 *   WebView would block every API call and never receive the session cookie. Loading the UI from the
 *   server makes everything same-origin, which is what works with the current API. A bundled UI
 *   needs token auth + CORS on the server first (see docs/ANDROID.md).
 *
 * The default 10.0.2.2 is the Android emulator's alias for the host machine's localhost.
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tauriDir = path.join(root, 'src-tauri');

function flag(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name) => process.argv.includes(name);

function isPrivateHost(host) {
  if (host === 'localhost' || host === '10.0.2.2' || host.endsWith('.local')) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

function validateServer(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Alamat server tidak valid: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Alamat server harus http(s).');
  if (url.username || url.password) throw new Error('Alamat server tidak boleh memuat kredensial.');
  if (url.protocol === 'http:' && !isPrivateHost(url.hostname)) {
    throw new Error('HTTP polos hanya untuk jaringan lokal (localhost, 10.0.2.2, IP privat). Pakai https untuk server publik.');
  }
  return url.origin;
}

function findSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(path.join(p, 'platform-tools')));
}

function findNdk(sdk) {
  if (process.env.NDK_HOME && fs.existsSync(process.env.NDK_HOME)) return process.env.NDK_HOME;
  const dir = path.join(sdk, 'ndk');
  if (!fs.existsSync(dir)) return undefined;
  const versions = fs.readdirSync(dir).sort();
  return versions.length ? path.join(dir, versions[versions.length - 1]) : undefined;
}

const TARGETS = {
  aarch64: { triple: 'aarch64-linux-android', abi: 'arm64-v8a', flavor: 'Arm64' },
  armv7: { triple: 'armv7-linux-androideabi', abi: 'armeabi-v7a', flavor: 'Arm' },
  i686: { triple: 'i686-linux-android', abi: 'x86', flavor: 'X86' },
  x86_64: { triple: 'x86_64-linux-android', abi: 'x86_64', flavor: 'X86_64' },
};
const ALL_RUST_TASKS = ['Universal', 'Arm64', 'Arm', 'X86', 'X86_64'];

/** Windows only lets unprivileged users create symlinks in Developer Mode. */
function canSymlink() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'belajar-symlink-'));
  try {
    const target = path.join(dir, 'a');
    fs.writeFileSync(target, 'x');
    fs.symlinkSync(target, path.join(dir, 'b'));
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Runs a command, echoing its output live while also capturing it. */
function run(cmd, args, opts) {
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(cmd, args, { ...opts, stdio: ['inherit', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    const tee = (stream, sink) =>
      stream.on('data', (d) => {
        output += d.toString();
        sink.write(d);
      });
    tee(child.stdout, process.stdout);
    tee(child.stderr, process.stderr);
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

async function main() {
  const server = validateServer(flag('--server') || process.env.BELAJAR_SERVER_URL || 'http://10.0.2.2:8080');
  const sdk = findSdk();
  if (!sdk) throw new Error('Android SDK tidak ditemukan. Set ANDROID_HOME (lihat docs/ANDROID.md).');
  const ndk = findNdk(sdk);
  if (!ndk) throw new Error('Android NDK tidak ditemukan. Pasang lewat sdkmanager: "ndk;27.0.12077973".');

  const release = has('--release');
  const profile = release ? 'release' : 'debug';
  const targets = (flag('--targets') || 'aarch64,x86_64').split(',').map((t) => t.trim()).filter(Boolean);
  for (const t of targets) if (!TARGETS[t]) throw new Error(`Target tidak dikenal: ${t} (pilih: ${Object.keys(TARGETS).join(', ')})`);

  // Overlay merged over tauri.conf.json: the shell loads the server-hosted UI (same origin).
  const overlay = { build: { frontendDist: server }, app: { security: { csp: null } } };
  const overlayPath = path.join(tauriDir, '.android-server.generated.conf.json');
  fs.writeFileSync(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);

  const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, NDK_HOME: ndk, ANDROID_NDK_HOME: ndk };
  const baseArgs = ['tauri', 'android', 'build', '--apk', '--ci', '--config', overlayPath];
  if (!release) baseArgs.push('--debug');

  const symlinks = canSymlink();
  console.log(`Server  : ${server}`);
  console.log(`SDK/NDK : ${sdk} | ${ndk}`);
  console.log(`Mode    : ${profile} APK | target: ${targets.join(', ')}${symlinks ? '' : ' | tanpa symlink (Windows tanpa Developer Mode)'}`);

  const libPath = (t) => path.join(tauriDir, 'target', TARGETS[t].triple, profile, 'libbelajar_app_lib.so');
  const androidDir = path.join(tauriDir, 'gen', 'android');
  const apkDir = path.join(androidDir, 'app', 'build', 'outputs', 'apk');

  // Without symlink support Tauri stops after compiling the FIRST target, so compile one target per run.
  const groups = symlinks ? [targets] : targets.map((t) => [t]);
  let needManualPackaging = false;
  try {
    for (const group of groups) {
      const args = [...baseArgs];
      for (const t of group) args.push('--target', t);
      const built = await run('npx', args, { cwd: root, env });
      if (built.code === 0) continue;
      // Cargo prints "Finished" once the library is compiled; only the symlink step failed after that.
      const compiledOnly =
        /symbolic link|symlink/i.test(built.output) && /Finished/.test(built.output) && group.every((t) => fs.existsSync(libPath(t)));
      if (!compiledOnly) process.exit(built.code);
      needManualPackaging = true;
    }
  } finally {
    fs.rmSync(overlayPath, { force: true });
  }

  if (needManualPackaging) {
    // Windows without Developer Mode: copy each library into the Gradle project ourselves and call Gradle
    // with the (already finished) Rust tasks skipped.
    console.log('\n[build-android] Symlink tidak diizinkan. Menyalin pustaka secara manual lalu menjalankan Gradle langsung.');
    for (const t of targets) {
      const dest = path.join(androidDir, 'app', 'src', 'main', 'jniLibs', TARGETS[t].abi);
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(libPath(t), path.join(dest, 'libbelajar_app_lib.so'));
    }
    const profileCap = release ? 'Release' : 'Debug';
    const wrapper = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
    const gradle = process.platform === 'win32' ? `"${wrapper}"` : wrapper;
    const gradleArgs = [
      ...targets.map((t) => `assemble${TARGETS[t].flavor}${profileCap}`),
      ...ALL_RUST_TASKS.flatMap((f) => ['-x', `rustBuild${f}${profileCap}`]),
    ];
    const g = await run(gradle, gradleArgs, { cwd: androidDir, env });
    if (g.code !== 0) process.exit(g.code);
  }

  console.log(`\nSelesai. APK ada di: ${apkDir}`);
}

main().catch((err) => {
  console.error(`\n[build-android] ${err.message}`);
  process.exit(1);
});

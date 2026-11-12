#!/usr/bin/env node
/*
 * Builds the Stuby Android app (debug APK by default).
 *
 *   node scripts/build-android.cjs                         # arm64 + x86_64 debug APK
 *   node scripts/build-android.cjs --release --targets aarch64
 *
 * The app is fully offline and self-contained: the Stuby server runs inside it (src-tauri/src/embedded.rs)
 * with an on-device SQLite database, and the web UI is compiled into the binary. There is no server
 * address to give and nothing to configure.
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

/** Gradle 9 needs JDK 17+. Prefer JAVA_HOME, then the JDK the setup step puts next to the SDK. */
function findJdk() {
  const candidates = [process.env.JAVA_HOME, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'jdk-17'), path.join(os.homedir(), 'Android', 'jdk-17')].filter(Boolean);
  const exe = process.platform === 'win32' ? 'java.exe' : 'java';
  return candidates.find((p) => fs.existsSync(path.join(p, 'bin', exe)));
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stuby-symlink-'));
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

/**
 * A release APK is unsigned, and Android refuses to install an unsigned APK. Sign it so it installs:
 * with the keystore named by STUBY_KEYSTORE (+ STUBY_KEYSTORE_PASS, STUBY_KEY_ALIAS), or else with the
 * standard Android debug key. The debug key is fine for your own devices; the Play Store needs your own
 * release key (set the STUBY_* variables).
 */
async function signReleaseApks(sdk, env, apkDir) {
  const tools = path.join(sdk, 'build-tools');
  const versions = fs.existsSync(tools) ? fs.readdirSync(tools).sort() : [];
  const latest = versions[versions.length - 1];
  if (!latest) throw new Error('Android build-tools tidak ditemukan; tidak bisa menandatangani APK.');
  const ext = process.platform === 'win32' ? '.bat' : '';
  const exe = process.platform === 'win32' ? '.exe' : '';
  const zipalign = path.join(tools, latest, `zipalign${exe}`);
  const apksigner = path.join(tools, latest, `apksigner${ext}`);
  const keystore = process.env.STUBY_KEYSTORE || path.join(os.homedir(), '.android', 'debug.keystore');
  if (!fs.existsSync(keystore)) throw new Error(`Keystore tidak ditemukan: ${keystore}. Set STUBY_KEYSTORE atau jalankan sekali build debug.`);
  const pass = process.env.STUBY_KEYSTORE_PASS || 'android';
  const alias = process.env.STUBY_KEY_ALIAS || 'androiddebugkey';
  const signed = [];
  for (const abiDir of fs.readdirSync(apkDir)) {
    const dir = path.join(apkDir, abiDir, 'release');
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!/unsigned\.apk$/.test(name)) continue;
      const input = path.join(dir, name);
      const aligned = path.join(dir, name.replace('unsigned', 'aligned'));
      const output = path.join(dir, name.replace('-unsigned', '-signed'));
      const q = (p) => `"${p}"`;
      const a = await run(q(zipalign), ['-f', '-p', '4', q(input), q(aligned)], { env });
      if (a.code !== 0) throw new Error('zipalign gagal');
      const b = await run(q(apksigner), ['sign', '--ks', q(keystore), '--ks-pass', `pass:${pass}`, '--key-pass', `pass:${pass}`, '--ks-key-alias', alias, '--out', q(output), q(aligned)], { env });
      if (b.code !== 0) throw new Error('apksigner gagal');
      fs.rmSync(aligned, { force: true });
      signed.push(output);
    }
  }
  return signed;
}

async function main() {
  const sdk = findSdk();
  if (!sdk) throw new Error('Android SDK tidak ditemukan. Set ANDROID_HOME (lihat docs/ANDROID.md).');
  const ndk = findNdk(sdk);
  if (!ndk) throw new Error('Android NDK tidak ditemukan. Pasang lewat sdkmanager: "ndk;27.0.12077973".');

  const release = has('--release');
  const profile = release ? 'release' : 'debug';
  const targets = (flag('--targets') || 'aarch64,x86_64').split(',').map((t) => t.trim()).filter(Boolean);
  for (const t of targets) if (!TARGETS[t]) throw new Error(`Target tidak dikenal: ${t} (pilih: ${Object.keys(TARGETS).join(', ')})`);

  const jdk = findJdk();
  if (!jdk) throw new Error('JDK 17+ tidak ditemukan. Set JAVA_HOME ke JDK 17 atau lebih baru (Gradle 9 tidak jalan di Java 8).');
  const env = { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, NDK_HOME: ndk, ANDROID_NDK_HOME: ndk };
  const baseArgs = ['tauri', 'android', 'build', '--apk', '--ci'];
  if (!release) baseArgs.push('--debug');

  const symlinks = canSymlink();
  console.log(`SDK/NDK : ${sdk} | ${ndk}\nJDK     : ${jdk}`);
  console.log(`Mode    : ${profile} APK | target: ${targets.join(', ')}${symlinks ? '' : ' | tanpa symlink (Windows tanpa Developer Mode)'}`);

  const libPath = (t) => path.join(tauriDir, 'target', TARGETS[t].triple, profile, 'libstuby_app_lib.so');
  const androidDir = path.join(tauriDir, 'gen', 'android');
  const apkDir = path.join(androidDir, 'app', 'build', 'outputs', 'apk');

  // Anything left in jniLibs from an earlier build (for example under the app's old name) would be
  // packaged into the APK too; one stale debug library added 121 MB. Keep only the current library.
  const jniLibs = path.join(androidDir, 'app', 'src', 'main', 'jniLibs');
  if (fs.existsSync(jniLibs)) {
    for (const abi of fs.readdirSync(jniLibs)) {
      const dir = path.join(jniLibs, abi);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.so') && f !== 'libstuby_app_lib.so') fs.rmSync(path.join(dir, f), { force: true });
      }
    }
  }

  // Without symlink support Tauri stops after compiling the FIRST target, so compile one target per run.
  const groups = symlinks ? [targets] : targets.map((t) => [t]);
  let needManualPackaging = false;
  {
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
  }

  if (needManualPackaging) {
    // Windows without Developer Mode: copy each library into the Gradle project ourselves and call Gradle
    // with the (already finished) Rust tasks skipped.
    console.log('\n[build-android] Symlink tidak diizinkan. Menyalin pustaka secara manual lalu menjalankan Gradle langsung.');
    for (const t of targets) {
      const dest = path.join(androidDir, 'app', 'src', 'main', 'jniLibs', TARGETS[t].abi);
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(libPath(t), path.join(dest, 'libstuby_app_lib.so'));
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

  if (release) {
    const signed = await signReleaseApks(sdk, env, apkDir);
    console.log(`\nAPK produksi (sudah ditandatangani): ${signed.join(', ') || '(tidak ditemukan)'}`);
  }
  console.log(`\nSelesai. APK ada di: ${apkDir}`);
}

main().catch((err) => {
  console.error(`\n[build-android] ${err.message}`);
  process.exit(1);
});

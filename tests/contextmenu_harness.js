'use strict';
// Harness UI (jsdom): menu klik-kanan kustom global (Belajar)
// Jalankan: cmd /c "set NODE_PATH=D:\Codes\Github\Belajar\app\node_modules&&node tests/contextmenu_harness.js"
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'server', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
function ok(cond, msg) { if (!cond) { console.error('GAGAL:', msg); process.exit(1); } passed++; console.log('  ok -', msg); }

async function main() {
  const dom = new JSDOM(html, { url: 'http://localhost/#/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};

  window.eval(read('app.js'));
  window.eval(read('contextmenu.js'));
  await sleep(100);

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  console.log('== Menu klik kanan umum di kanvas');
  {
    ok($('.cm-menu') === null, 'menu awal tidak muncul');
    const ev = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 });
    document.body.dispatchEvent(ev);
    ok(ev.defaultPrevented, 'defaultPrevented aktif');
    ok($('.cm-menu') !== null, 'menu .cm-menu muncul di DOM');
    const items = $$('.cm-item').map((el) => el.textContent.trim());
    ok(items.some((t) => t.includes('Kembali')), 'ada menu Kembali');
    ok(items.some((t) => t.includes('Muat Ulang')), 'ada menu Muat Ulang');
    ok(items.some((t) => t.includes('Periksa Elemen')), 'ada menu Periksa Elemen');

    // Tekan Escape -> menu tertutup
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok($('.cm-menu') === null, 'Escape menutup menu');
  }

  console.log('== Menu klik kanan pada kolom input');
  {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'Teks belajar';
    document.body.append(input);

    const ev = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 150 });
    input.dispatchEvent(ev);

    ok($('.cm-menu') !== null, 'menu muncul di atas input');
    const items = $$('.cm-item').map((el) => el.textContent.trim());
    ok(items.some((t) => t.includes('Tempel')), 'ada Tempel untuk input');
    ok(items.some((t) => t.includes('Pilih Semua')), 'ada Pilih Semua untuk input');
    ok(items.some((t) => t.includes('Periksa Elemen')), 'tetap ada Periksa Elemen');

    // Klik di luar -> menu tertutup
    document.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    ok($('.cm-menu') === null, 'klik di luar menutup menu');
    input.remove();
  }

  console.log('== Menu klik kanan pada tautan <a>');
  {
    const a = document.createElement('a');
    a.href = '#/materi';
    a.textContent = 'Materi';
    document.body.append(a);

    const ev = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 });
    a.dispatchEvent(ev);

    ok($('.cm-menu') !== null, 'menu muncul di atas tautan');
    const items = $$('.cm-item').map((el) => el.textContent.trim());
    ok(items.some((t) => t.includes('Buka Tautan')), 'ada Buka Tautan');
    ok(items.some((t) => t.includes('Salin Alamat Tautan')), 'ada Salin Alamat Tautan');
    ok(items.some((t) => t.includes('Periksa Elemen')), 'tetap ada Periksa Elemen');

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok($('.cm-menu') === null, 'Escape menutup menu');
    a.remove();
  }

  console.log('== Shift + Klik Kanan (konvensi menu asli)');
  {
    const ev = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: true });
    document.body.dispatchEvent(ev);
    ok(!ev.defaultPrevented, 'Shift + klik kanan tidak mencegah default (menu sistem asli)');
    ok($('.cm-menu') === null, 'menu kustom tidak dibuka jika shift ditekan');
  }

  console.log(`\nSemua ${passed} pemeriksaan contextmenu lulus.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


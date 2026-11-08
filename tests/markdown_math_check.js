'use strict';
// Uji renderer Markdown + rumus KaTeX di frontend (jsdom).
// Jalankan: NODE_PATH=/tmp/jsdomkit/node_modules node tests/markdown_math_check.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'server', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const katexJs = fs.readFileSync(path.join(PUB, 'vendor', 'katex', 'katex.min.js'), 'utf8');

let passed = 0;
function ok(cond, msg) {
  if (!cond) { console.error('GAGAL:', msg); process.exit(1); }
  passed++; console.log('  ok -', msg);
}
const count = (s, re) => (s.match(re) || []).length;

const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.fetch = async () => ({ ok: true, status: 200, json: async () => ({ authenticated: false }) });
window.eval(katexJs);
window.eval(appJs);
const md = (s) => window.Belajar.renderMarkdown(s);

console.log('== Rumus');
ok(!!window.katex, 'KaTeX termuat dari vendor');
let o = md('Energi $E = mc^2$ itu.');
ok(o.includes('class="katex"') && !o.includes('$E'), 'rumus inline $..$ dirender');
o = md('Sebelum\n\n$$\n\\frac{a}{b} = c\n$$\n\nSesudah');
ok(o.includes('math-block') && o.includes('katex-display') && count(o, /<p>/g) === 2, 'blok $$..$$ multi-baris dirender sebagai blok, paragraf tetap 2');
o = md('Dengan \\(x^2\\) dan\n\\[ y = 2 \\]');
ok(count(o, /class="katex"/g) >= 1 && o.includes('katex-display'), 'delimiter \\( \\) dan \\[ \\] didukung (catatan lama)');
o = md('Harga $5 dan $10 murah');
ok(!o.includes('katex') && o.includes('$5 dan $10'), 'mata uang "$5 dan $10" bukan rumus');
o = md('Harga \\$5 dan $x$');
ok(o.includes('$5') && count(o, /class="katex"/g) === 1, '\\$ = dolar biasa, $x$ tetap rumus');
o = md('Kode `$x$` dan ```\n$$y$$\n```');
ok(o.includes('<code>$x$</code>') && o.includes('$$y$$') && !o.includes('katex'), 'rumus di dalam kode tidak dirender');
o = md('$a_1 + b_2$ dan _miring_ serta *tebal miring*');
ok(count(o, /<em>/g) === 2 && !/katex[^]*<em>[^]*katex-html/.test(o.split('katex-html')[0]), '_ dan * di dalam rumus tidak jadi huruf miring');
o = md('Rumus $x^2');
ok(o.includes('$x^2') && !o.includes('katex'), 'rumus belum tertutup (streaming) tidak membuat error');
o = md('teks $$x$$ lagi');
ok(o.includes('<p>') && o.includes('katex-display'), '$$ di tengah kalimat tetap dirender');
o = md('$a$ $b$ $c$');
ok(count(o, /class="katex"/g) === 3, 'beberapa rumus inline dalam satu baris');
o = md('$\\notacommand$');
ok(o.includes('katex'), 'perintah tak dikenal tidak membuat error (throwOnError=false)');
o = md('Sudut $\\theta$ dan $\\tan x$ serta $\\nabla f$');
ok(o.includes('θ') && !o.includes('\t') && count(o, /class="katex"/g) === 3, '\\theta, \\tan, \\nabla tidak rusak oleh pembersih escape literal');
o = md('Baris satu\\n\\nBaris dua');
ok(count(o, /<p>/g) === 2, '"\\n\\n" literal berurutan keduanya menjadi baris baru');
o = md('$$\\n\\theta\\n$$');
ok(o.includes('katex-display') && o.includes('θ'), '\\n literal di dalam $$ menjadi baris baru, \\theta tetap utuh');
o = md('$\\href{javascript:alert(1)}{klik}$');
ok(!/href="javascript/i.test(o), 'trust=false: \\href javascript: tidak menjadi tautan');
o = md('[tautan $x$](https://contoh.id/a$b$c)');
ok(!/<a href="[^"]*katex/.test(o), 'token rumus tidak pernah masuk ke atribut href');
o = md('<script>alert(1)</script> $x$');
ok(!o.includes('<script') && o.includes('&lt;script'), 'HTML mentah tetap di-escape');

console.log('== Tabel');
o = md('| Rumus | Nama |\n|---|---|\n| $|x|$ | nilai mutlak |\n| $a_1$ | indeks |');
ok(count(o, /<th>/g) === 2 && count(o, /<td>/g) === 4, 'pipa di dalam rumus tidak memecah sel (2 kolom x 2 baris)');
o = md('| A | B | C |\n|:--|:-:|--:|\n| 1 | 2 |\n| x | y | z | w |');
ok(count(o, /<td/g) === 6, 'baris pendek dipadatkan, baris panjang digabung ke kolom terakhir');
ok(o.includes('text-align:center') && o.includes('text-align:right'), 'perataan kolom (:-:, --:) diterapkan');
o = md('| a | b |\n|---|---|\n| 1 \\| 2 | 3 |');
ok(count(o, /<td>/g) === 2 && o.includes('1 | 2'), '\\| di sel = tanda pipa biasa');

console.log('== Daftar');
o = md('1. satu\n\n2. dua\n\n3. tiga');
ok(count(o, /<ol/g) === 1 && count(o, /<li>/g) === 3 && !o.includes('start='), 'nomor tidak mengulang dari 1 bila ada baris kosong antar butir');
o = md('3. tiga\n4. empat');
ok(o.includes('<ol start="3">'), 'daftar bernomor yang dimulai dari 3');
o = md('- a\n  - a1\n    - a2\n  - b1\n- b');
ok(count(o, /<ul>/g) === 3 && count(o, /<li>/g) === 5, 'daftar bersarang 3 tingkat (menjorok 2 spasi)');
o = md('- butir\n  lanjutan teks\n- kedua');
ok(count(o, /<li>/g) === 2 && o.includes('butir lanjutan teks'), 'baris lanjutan menempel ke butir');
o = md('- a\n1. b');
ok(count(o, /<ul>/g) === 1 && count(o, /<ol/g) === 1, 'ganti jenis daftar memulai daftar baru');
o = md('- [x] selesai\n- [ ] belum');
ok(o.includes('☑ selesai') && o.includes('☐ belum'), 'daftar tugas');
o = md('- a\n\n- b');
ok(count(o, /<ul>/g) === 1 && count(o, /<li>/g) === 2, 'baris kosong tunggal antar butir tetap satu daftar');
o = md('- a\n\nparagraf sela\n\n- b');
ok(count(o, /<ul>/g) === 2 && o.includes('<p>paragraf sela</p>'), 'paragraf di antara butir memutus daftar');
o = md('1. langkah $x^2$\n2. langkah\n\n$$\ny=1\n$$\n\n3. lanjut');
ok(count(o, /<ol/g) >= 1 && o.includes('katex-display'), 'rumus blok di antara daftar tidak merusak');

console.log('== Judul & lain-lain');
o = md('### Bahasa C#\n\nisi');
ok(o.includes('<h3>Bahasa C#</h3>'), 'tanda # di akhir judul tidak terpotong');
o = md('## Judul ##');
ok(o.includes('<h2>Judul</h2>'), 'penutup ## bergaya ATX dibuang');
o = md('> kutipan dengan $x$\n> baris dua');
ok(o.includes('<blockquote>') && o.includes('katex'), 'rumus di dalam blockquote');
o = md('{"content": "isi $x$"}');
ok(o.includes('katex'), 'JSON shell dibuka lalu rumus tetap dirender');

console.log('== Tanpa KaTeX (gagal muat)');
delete window.katex;
o = md('Kalau gagal: $q^7$ dan\n\n$$\n\\zeta\n$$');
ok(count(o, /math-fallback/g) === 2 && o.includes('$q^7$'), 'fallback menampilkan sumber LaTeX apa adanya');

console.log(`\nSemua ${passed} pemeriksaan lulus.`);
process.exit(0);

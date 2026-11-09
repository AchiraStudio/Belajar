'use strict';
/* Bilah judul kustom untuk jendela Tauri tanpa bingkai (decorations: false).
 *
 * Hanya aktif di dalam Tauri; di peramban biasa tidak ada yang dibuat dan tata letak tidak berubah.
 * Warna memakai token tema aplikasi lewat titlebar.css, jadi mengikuti Terang / Gelap / Otomatis.
 * Tombol tema memakai API tema yang sama dengan sidebar (window.Belajar.theme), dan tema aplikasi
 * disinkronkan ke jendela asli agar kontrol sistem ikut gelap/terang.
 */
(() => {
  const T = window.__TAURI__;
  if (!T || !T.window || !T.window.getCurrentWindow || window.__belajarTitlebar) return;
  window.__belajarTitlebar = true;

  const win = T.window.getCurrentWindow();
  const ua = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '';
  const platform = /mac/i.test(ua) ? 'mac' : /win/i.test(ua) ? 'win' : 'linux';
  const root = document.documentElement;
  const NS = 'http://www.w3.org/2000/svg';
  // Kegagalan memanggil jendela (izin, dsb.) tidak boleh merusak halaman.
  const safe = (p) => Promise.resolve(p).catch((e) => console.warn('[titlebar]', e));

  function icon(paths, size = 10, extra = {}) {
    const svg = document.createElementNS(NS, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 10 10', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1, 'aria-hidden': 'true', ...extra })) svg.setAttribute(k, v);
    for (const d of paths) {
      const el = document.createElementNS(NS, d.startsWith('R') ? 'rect' : 'path');
      if (d.startsWith('R')) { const [x, y, w, h] = d.slice(1).split(' ').map(Number); Object.entries({ x, y, width: w, height: h, rx: 1 }).forEach(([k, v]) => el.setAttribute(k, v)); }
      else el.setAttribute('d', d);
      svg.append(el);
    }
    return svg;
  }
  const ICON = {
    min: () => icon(['M1 5h8']),
    max: () => icon(['R1.5 1.5 7 7']),
    restore: () => icon(['R1.5 3 5.5 5.5', 'M3 3V1.5h5.5V7H7']),
    close: () => icon(['M1.5 1.5l7 7M8.5 1.5l-7 7']),
    logo: () => icon(['M9 8h14v13H11a2 2 0 0 0-2 2z'], 12, { viewBox: '4 3 24 24', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }),
    auto: () => icon(['M5 1.2v7.6', 'M5 1.2a3.8 3.8 0 0 1 0 7.6'], 15, { viewBox: '0 0 10 10', 'stroke-width': 1.1 }),
    sun: () => icon(['M5 3.1a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8z', 'M5 .6v1M5 8.4v1M.6 5h1M8.4 5h1M1.9 1.9l.7.7M7.4 7.4l.7.7M1.9 8.1l.7-.7M7.4 2.6l.7-.7'], 15, { 'stroke-width': 1, 'stroke-linecap': 'round' }),
    moon: () => icon(['M8.4 6.2A3.8 3.8 0 0 1 3.8 1.6a3.8 3.8 0 1 0 4.6 4.6z'], 15, { 'stroke-width': 1.1, 'stroke-linejoin': 'round' }),
  };

  const el = (tag, cls, attrs = {}) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const button = (cls, label, svg, onClick) => {
    const b = el('button', cls, { type: 'button', title: label, 'aria-label': label, tabindex: '-1' });
    b.append(svg);
    b.addEventListener('click', onClick);
    return b;
  };

  // ------------------------------------------------------------------ bangun bilah
  const bar = el('header', 'titlebar', { 'data-platform': platform, role: 'banner', 'aria-label': 'Bilah judul' });
  const logo = el('i', 'tb-logo'); logo.append(ICON.logo());
  const brand = el('div', 'tb-brand');
  const app = el('span', 'tb-app'); app.textContent = 'belajar';
  const sep = el('span', 'tb-sep');
  const page = el('span', 'tb-page');
  brand.append(logo, app, sep, page);
  const drag = el('div', 'tb-drag');

  const themeBtn = el('button', 'tb-btn tb-theme', { type: 'button', tabindex: '-1' });
  themeBtn.addEventListener('click', () => { if (window.Belajar && window.Belajar.theme) window.Belajar.theme.cycle(); });

  const bMin = button('tb-btn tb-ctrl min', 'Perkecil', ICON.min(), () => safe(win.minimize()));
  const bMax = button('tb-btn tb-ctrl max', 'Perbesar', ICON.max(), () => safe(win.toggleMaximize()));
  const bClose = button('tb-btn tb-ctrl close', 'Tutup', ICON.close(), () => safe(win.close()));
  const ctrls = el('div', 'tb-ctrls'); ctrls.append(bMin, bMax, bClose);

  bar.append(brand, drag, themeBtn, ctrls);
  root.classList.add('has-titlebar');
  document.body.prepend(bar);

  // Seret jendela dari area kosong; klik ganda memperbesar/memulihkan. Tombol tidak ikut menyeret.
  bar.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    if (e.detail === 2) safe(win.toggleMaximize());
    else safe(win.startDragging());
  });
  bar.addEventListener('contextmenu', (e) => e.preventDefault());

  // ------------------------------------------------------------------ nama halaman (dari <title>)
  const paintPage = () => {
    const t = (document.title || '').replace(/\s*·\s*Belajar\s*$/i, '').trim();
    page.textContent = t && t.toLowerCase() !== 'belajar' ? t : '';
    sep.hidden = !page.textContent;
  };
  paintPage();
  const titleEl = document.querySelector('title');
  if (titleEl) new MutationObserver(paintPage).observe(titleEl, { childList: true, characterData: true, subtree: true });

  // ------------------------------------------------------------------ tema
  const THEME_LABEL = { auto: 'Otomatis', light: 'Terang', dark: 'Gelap' };
  function paintTheme(mode) {
    const th = window.Belajar && window.Belajar.theme;
    const current = mode || (th ? th.get() : 'auto');
    themeBtn.replaceChildren(ICON[current === 'light' ? 'sun' : current === 'dark' ? 'moon' : 'auto']());
    const label = `Tema: ${THEME_LABEL[current] || 'Otomatis'}. Klik untuk mengganti`;
    themeBtn.title = label;
    themeBtn.setAttribute('aria-label', label);
  }
  paintTheme();
  // Selaraskan jendela asli (null = ikuti sistem) agar bayangan/kontrol sistem cocok dengan aplikasi.
  document.addEventListener('belajar:theme', (e) => {
    const mode = e.detail && e.detail.theme;
    paintTheme(mode);
    if (typeof win.setTheme === 'function') safe(win.setTheme(mode === 'light' || mode === 'dark' ? mode : null));
  });
  if (window.Belajar && window.Belajar.theme) {
    const mode = window.Belajar.theme.get();
    if ((mode === 'light' || mode === 'dark') && typeof win.setTheme === 'function') safe(win.setTheme(mode));
  }

  // ------------------------------------------------------------------ status maksimal
  async function paintMax() {
    let max = false;
    try { max = await win.isMaximized(); } catch { /* tanpa izin: anggap tidak maksimal */ }
    root.classList.toggle('is-maximized', max);
    const label = max ? 'Pulihkan' : 'Perbesar';
    bMax.title = label;
    bMax.setAttribute('aria-label', label);
    bMax.replaceChildren(max ? ICON.restore() : ICON.max());
  }
  paintMax();
  if (typeof win.onResized === 'function') safe(win.onResized(() => paintMax()));
})();

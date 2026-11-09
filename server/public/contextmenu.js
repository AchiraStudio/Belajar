'use strict';
/* Menu klik-kanan kustom global (Belajar)
   - Mengikuti estetika aplikasi dan token CSS (--surface, --ink, --brand, --line)
   - Dinamis menyesuaikan tema (terang / gelap)
   - Kontekstual: menyesuaikan elemen yang diklik (teks diseleksi, kolom input, tautan, atau kanvas halaman)
   - Opsi "Periksa Elemen" membuka DevTools asli di Tauri dan memberi panduan pintasan di peramban
   - Shift + Klik Kanan tetap membuka menu bawaan sistem (konvensi power-user) */
(() => {
  let activeMenu = null;

  const ICONS = {
    back: 'M19 12H5|M11 6l-6 6 6 6',
    forward: 'M5 12h14|M13 6l6 6-6 6',
    reload: 'M20 11a8 8 0 1 0-2.3 6|M20 4v7h-7',
    copy: 'M8 4v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2z|M4 8H3a1 1 0 0 0-1 1v12a2 2 0 0 0 2 2h12a1 1 0 0 0 1-1v-1',
    cut: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm14-17L8.7 13.3|M8.7 10.7L20 20',
    paste: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2|M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
    select: 'M3 5a2 2 0 0 1 2-2h2|M17 3h2a2 2 0 0 1 2 2|M21 17v2a2 2 0 0 1-2 2|M7 21H5a2 2 0 0 1-2-2|M3 11v2|M21 11v2|M11 3h2|M11 21h2',
    link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71|M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    inspect: 'M16 18l6-6-6-6|M8 6l-6 6 6 6',
    spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  };

  function svgIcon(name) {
    const d = ICONS[name] || '';
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 24 24');
    el.setAttribute('aria-hidden', 'true');
    for (const p of d.split('|')) {
      if (!p) continue;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', p);
      el.append(path);
    }
    return el;
  }

  function closeMenu() {
    if (!activeMenu) return;
    activeMenu.remove();
    activeMenu = null;
  }

  function onOutsidePointer(e) {
    if (activeMenu && !activeMenu.contains(e.target)) closeMenu();
  }

  function onKeyDown(e) {
    if (activeMenu && e.key === 'Escape') {
      closeMenu();
      e.stopPropagation();
    }
  }

  function createMenuItem(label, iconName, shortcut, onClick, disabled = false) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cm-item' + (disabled ? ' disabled' : '');
    btn.append(svgIcon(iconName));
    const span = document.createElement('span');
    span.textContent = label;
    btn.append(span);
    if (shortcut) {
      const sc = document.createElement('span');
      sc.className = 'cm-shortcut';
      sc.textContent = shortcut;
      btn.append(sc);
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
      if (!disabled && typeof onClick === 'function') onClick();
    });
    return btn;
  }

  function createSeparator() {
    const d = document.createElement('div');
    d.className = 'cm-sep';
    return d;
  }

  async function openDevTools() {
    if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
      try {
        await window.__TAURI_INTERNALS__.invoke('plugin:webview|internal_toggle_devtools');
        return;
      } catch {
        /* jika belum ada capability: jatuh ke toast */
      }
    }
    if (window.Belajar && typeof window.Belajar.toast === 'function') {
      window.Belajar.toast('Tekan F12 atau Ctrl+Shift+I untuk membuka DevTools.');
    } else {
      console.info('Pintasan DevTools: F12 atau Ctrl+Shift+I');
    }
  }

  function onContextMenu(e) {
    // Biarkan pengguna membuka menu asli jika menekan Shift
    if (e.shiftKey) return;

    e.preventDefault();
    closeMenu();

    const target = e.target;
    const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    const selectedText = window.getSelection ? window.getSelection().toString().trim() : '';
    const anchor = target ? target.closest('a[href]') : null;

    const items = [];

    // 1. Kolom Input / Teks yang dapat diedit
    if (isInput) {
      const hasSel = target.selectionStart !== target.selectionEnd;
      items.push(createMenuItem('Potong', 'cut', 'Ctrl+X', () => {
        try {
          const val = target.value;
          const start = target.selectionStart;
          const end = target.selectionEnd;
          const cutText = val.slice(start, end);
          navigator.clipboard.writeText(cutText);
          target.value = val.slice(0, start) + val.slice(end);
          target.selectionStart = target.selectionEnd = start;
          target.dispatchEvent(new Event('input', { bubbles: true }));
        } catch { document.execCommand('cut'); }
      }, !hasSel));

      items.push(createMenuItem('Salin', 'copy', 'Ctrl+C', () => {
        try {
          const val = target.value;
          navigator.clipboard.writeText(val.slice(target.selectionStart, target.selectionEnd));
        } catch { document.execCommand('copy'); }
      }, !hasSel));

      items.push(createMenuItem('Tempel', 'paste', 'Ctrl+V', async () => {
        try {
          const text = await navigator.clipboard.readText();
          const val = target.value;
          const start = target.selectionStart;
          const end = target.selectionEnd;
          target.value = val.slice(0, start) + text + val.slice(end);
          target.selectionStart = target.selectionEnd = start + text.length;
          target.dispatchEvent(new Event('input', { bubbles: true }));
        } catch { document.execCommand('paste'); }
      }));

      items.push(createSeparator());
      items.push(createMenuItem('Pilih Semua', 'select', 'Ctrl+A', () => {
        target.focus();
        target.select();
      }));
    }
    // 2. Ada teks yang diseleksi di luar kolom input
    else if (selectedText) {
      items.push(createMenuItem('Salin', 'copy', 'Ctrl+C', () => {
        navigator.clipboard.writeText(selectedText);
      }));

      // Integrasi Tanya AI jika berada di dalam tampilan catatan materi
      if (document.querySelector('.note-wrap') && window.Belajar && typeof window.Belajar.askSelection === 'function') {
        items.push(createMenuItem('Tanya AI tentang teks ini', 'spark', '', () => {
          window.Belajar.askSelection(selectedText);
        }));
      }
    }

    // 3. Elemen Tautan
    if (anchor && anchor.href) {
      if (items.length) items.push(createSeparator());
      items.push(createMenuItem('Buka Tautan', 'link', '', () => {
        if (anchor.href.startsWith('#') || anchor.origin === location.origin) {
          location.href = anchor.href;
        } else {
          window.open(anchor.href, '_blank', 'noopener');
        }
      }));
      items.push(createMenuItem('Salin Alamat Tautan', 'copy', '', () => {
        navigator.clipboard.writeText(anchor.href);
      }));
    }

    // 4. Navigasi standar jika di area umum
    if (!isInput && !selectedText && !anchor) {
      items.push(createMenuItem('Kembali', 'back', 'Alt+←', () => {
        history.back();
      }, history.length <= 1));

      items.push(createMenuItem('Maju', 'forward', 'Alt+→', () => {
        history.forward();
      }));

      items.push(createMenuItem('Muat Ulang', 'reload', 'Ctrl+R', () => {
        location.reload();
      }));
    }

    // 5. Periksa Elemen (Inspect) selalu hadir di bagian bawah
    items.push(createSeparator());
    items.push(createMenuItem('Periksa Elemen', 'inspect', 'Ctrl+Shift+I', openDevTools));

    // Bangun kontainer menu
    const menu = document.createElement('div');
    menu.className = 'cm-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('tabindex', '-1');
    for (const it of items) menu.append(it);

    document.body.append(menu);
    activeMenu = menu;

    // Hitung posisi agar tidak keluar layar
    const pad = 8;
    const w = menu.offsetWidth || 210;
    const h = menu.offsetHeight || 180;
    let x = e.clientX;
    let y = e.clientY;

    if (x + w > window.innerWidth - pad) x = Math.max(pad, window.innerWidth - w - pad);
    if (y + h > window.innerHeight - pad) y = Math.max(pad, window.innerHeight - h - pad);

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  }

  // Pasang listener global di seluruh aplikasi
  document.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerdown', onOutsidePointer);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);
  window.addEventListener('blur', closeMenu);

  // Ekspos ke Belajar jika diperlukan untuk kontrol manual
  if (window.Belajar) {
    window.Belajar.contextMenu = { close: closeMenu };
  }
})();

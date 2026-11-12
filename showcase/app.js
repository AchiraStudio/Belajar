/* Stuby showcase behaviour. Plain JS, no build step, no dependencies.
   Every interactive piece here has a keyboard path and works without a pointer. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ theme */
  const themeBtn = $('#theme-btn');
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : sysDark.matches);
  const syncTheme = () => themeBtn.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
  themeBtn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('stuby-showcase-theme', next); } catch (e) { /* storage blocked: the choice just lasts for this visit */ }
    syncTheme();
  });
  sysDark.addEventListener('change', syncTheme);
  syncTheme();

  /* ------------------------------------------------------------- mobile menu */
  const menuBtn = $('#menu-btn');
  const menu = $('#menu');
  const setMenu = (open, returnFocus) => {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menuBtn.querySelector('use').setAttribute('href', open ? '#i-x' : '#i-menu');
    if (!open && returnFocus) menuBtn.focus();
  };
  menuBtn.addEventListener('click', () => setMenu(menu.hidden, false));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false, false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) setMenu(false, true); });
  window.matchMedia('(min-width: 1081px)').addEventListener('change', (e) => { if (e.matches) setMenu(false, false); });

  /* ------------------------------------------------- bamboo scroll progress */
  const fill = $('#stalk-fill');
  let ticking = false;
  const paintStalk = () => {
    const max = root.scrollHeight - window.innerHeight;
    fill.style.width = (max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0) + '%';
    ticking = false;
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(paintStalk); } }, { passive: true });
  paintStalk();

  /* ------------------------------------------------------------ scroll reveal */
  const revealEls = $$('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach((el) => {
      const sibs = el.parentElement ? Array.from(el.parentElement.children).filter((c) => c.classList.contains('reveal')) : [];
      el.style.setProperty('--d', Math.min(sibs.indexOf(el), 5) * 60 + 'ms');
      io.observe(el);
    });
  }

  /* --------------------------------------------------- roving-tabindex groups */
  // Used for tablists and radiogroups: arrows move focus and selection, Home/End jump.
  function roving(container, items, onPick, opts = {}) {
    const attr = opts.attr || 'aria-checked';
    const select = (i, focus) => {
      items.forEach((it, j) => {
        const on = i === j;
        it.setAttribute(attr, String(on));
        it.tabIndex = on ? 0 : -1;
      });
      if (focus) items[i].focus();
      onPick(items[i], i);
    };
    items.forEach((it, i) => it.addEventListener('click', () => select(i, false)));
    container.addEventListener('keydown', (e) => {
      const i = items.indexOf(document.activeElement);
      if (i < 0) return;
      let n = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % items.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + items.length) % items.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = items.length - 1;
      if (n < 0) return;
      e.preventDefault();
      select(n, true);
    });
    return select;
  }

  /* ---------------------------------------------------------------- the loop */
  const stages = $$('.stage');
  const panels = $$('.panel');
  roving($('.stages'), stages, (tab, i) => {
    panels.forEach((p, j) => { p.hidden = i !== j; });
  }, { attr: 'aria-selected' });

  /* ------------------------------------------------------------------- notes */
  const NOTES = {
    cornell:
      '<h4>Carnot cycle</h4><div class="cornell"><div class="cues"><span>What sets the efficiency?</span><span>Why kelvin?</span></div>' +
      '<div class="main"><p>A Carnot engine runs between a hot reservoir at T<sub>h</sub> and a cold one at T<sub>c</sub>. Its efficiency depends only on those two temperatures: <b>η = 1 − T<sub>c</sub> / T<sub>h</sub></b>.</p>' +
      '<p>The ratio needs an absolute scale, so the temperatures are always in kelvin.</p></div>' +
      '<div class="sum"><b>Summary.</b> Efficiency rises when the cold side gets colder or the hot side gets hotter.</div></div>',
    outline:
      '<h4>Carnot cycle</h4><ul class="outline"><li>Four reversible steps<ul><li>Isothermal expansion, then adiabatic expansion</li><li>Isothermal compression, then adiabatic compression</li></ul></li>' +
      '<li>Efficiency<ul><li>η = 1 − T<sub>c</sub> / T<sub>h</sub></li><li>Temperatures in kelvin</li></ul></li>' +
      '<li>Limit<ul><li>No real engine beats it between the same two temperatures</li></ul></li></ul>',
    worked:
      '<h4>Worked example</h4><div class="worked">' +
      '<div class="stepl"><b>Given</b><span>T<sub>h</sub> = 500 K, T<sub>c</sub> = 300 K</span></div>' +
      '<div class="stepl"><b>Find</b><span>The maximum efficiency η</span></div>' +
      '<div class="stepl"><b>Step 1</b><span>η = 1 − T<sub>c</sub> / T<sub>h</sub></span></div>' +
      '<div class="stepl"><b>Step 2</b><span>η = 1 − 300 / 500 = 1 − 0.6</span></div>' +
      '<div class="ans">η = 0.40, so at most 40% of the heat can become work.</div></div>',
  };
  const noteBody = $('#note-body');
  const noteRadios = $$('#note-styles button');
  const showNote = (k) => { noteBody.innerHTML = NOTES[k]; };
  showNote('cornell');
  roving($('#note-styles'), noteRadios, (b) => showNote(b.dataset.style));

  const askBtn = $('#ask-btn');
  const askAns = $('#ask-answer');
  askBtn.addEventListener('click', () => {
    const open = askAns.hidden;
    askAns.hidden = !open;
    askBtn.setAttribute('aria-expanded', String(open));
  });

  /* ---------------------------------------------------------------- mind map */
  const map = $('#mindmap');
  const cross = $('#cross');
  const syncCross = () => {
    const open = (id) => $(`.branch[data-branch="${id}"]`, map).getAttribute('aria-expanded') === 'true';
    cross.toggleAttribute('hidden', !(open('b2') && open('b3')));
  };
  $$('.branch', map).forEach((b) => {
    const name = $('text', b).textContent;
    const toggle = () => {
      const wasOpen = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', String(!wasOpen));
      b.setAttribute('aria-label', `${name}, ${wasOpen ? 'expand' : 'collapse'}`);
      $(`[data-leaves="${b.dataset.branch}"]`, map).toggleAttribute('hidden', wasOpen);
      syncCross();
    };
    b.addEventListener('click', toggle);
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });

  /* -------------------------------------------------------------------- quiz */
  const Q = {
    mc: {
      text: 'In a Carnot engine, what happens to the efficiency if the cold reservoir gets hotter while the hot side stays fixed?',
      opts: ['It rises', 'It falls', 'It stays the same', 'It depends on the working fluid'],
      right: 1,
      why: 'η = 1 − T<sub>c</sub> / T<sub>h</sub>. A larger T<sub>c</sub> makes the ratio bigger, so η falls.',
      src: 'Sample question, cited to page 14 of a sample PDF',
    },
    tf: {
      text: "A Carnot engine's efficiency can be calculated with temperatures in °C.",
      opts: ['True', 'False'],
      right: 1,
      why: 'The ratio needs an absolute scale, so the temperatures must be in kelvin.',
      src: 'Sample question, cited to page 15 of a sample PDF',
    },
  };
  const quizBody = $('#quiz-body');
  const quizCap = $('#quiz-cap');
  const qs = { type: 'mc', mode: 'practice', picked: null, done: false, sa: '', saState: null };
  const letters = ['A', 'B', 'C', 'D'];

  function renderQuiz() {
    const exam = qs.mode === 'exam';
    const meta = `<div class="q-meta"><span>Question 1 of 5</span><span class="timer">${exam ? 'Exam: timer running, graded when you submit' : 'Practice: instant feedback'}</span></div>`;
    let html = '';
    if (qs.type === 'sa') {
      const text = 'Which temperature scale must you use in the Carnot efficiency formula?';
      html = meta + `<p class="q-text">${text}</p>` +
        `<form class="sa-row" id="sa-form" novalidate><label for="sa-input">Your answer</label>` +
        `<input id="sa-input" type="text" autocomplete="off" value="${qs.sa.replace(/"/g, '&quot;')}"${qs.done ? ' disabled' : ''}>` +
        `<button class="btn btn-sm" type="submit"${qs.done ? ' disabled' : ''}>${exam ? 'Submit exam' : 'Check answer'}</button></form>`;
      if (qs.done) {
        const a = qs.saState;
        const msg = a === 'right'
          ? ['is-good', 'Correct.', 'Kelvin, an absolute scale. Matched by the local grader.']
          : a === 'unsure'
            ? ['', 'Close, so this is where AI steps in.', 'The answer mentions an absolute scale but not which one. Uncertain matches go to the AI grader; clear ones never do.']
            : ['is-bad', 'Not quite.', 'Hint: it is an absolute scale. The answer is kelvin.'];
        html += `<div class="q-explain ${msg[0]}" role="status"><b>${msg[1]}</b>${msg[2]}</div><button class="btn btn-sm" type="button" data-reset>Try another answer</button>`;
      }
      quizCap.textContent = 'Sample question, cited to page 14 of a sample PDF';
    } else {
      const q = Q[qs.type];
      html = meta + `<p class="q-text">${q.text}</p><div class="opts" role="group" aria-label="Answers">`;
      q.opts.forEach((o, i) => {
        let cls = 'opt', mark = '';
        if (qs.done) {
          if (i === q.right) { cls += ' right'; mark = 'Correct'; }
          else if (i === qs.picked) { cls += ' wrong'; mark = 'Your pick'; }
        } else if (i === qs.picked) { cls += ' picked'; mark = 'Selected'; }
        html += `<button type="button" class="${cls}" data-i="${i}"${qs.done ? ' disabled' : ''} aria-pressed="${i === qs.picked}">` +
          `<span class="k">${qs.type === 'tf' ? (i === 0 ? 'T' : 'F') : letters[i]}</span><span>${o}</span><span class="mark">${mark}</span></button>`;
      });
      html += '</div>';
      if (exam && !qs.done) html += `<button class="btn btn-sm btn-primary" type="button" data-submit${qs.picked === null ? ' disabled' : ''}>Submit exam</button>`;
      if (qs.done) {
        const ok = qs.picked === q.right;
        html += `<div class="q-explain ${ok ? 'is-good' : 'is-bad'}" role="status"><b>${ok ? 'Correct.' : 'Not quite.'}</b>${q.why}</div><button class="btn btn-sm" type="button" data-reset>Reset question</button>`;
      }
      quizCap.textContent = q.src;
    }
    quizBody.innerHTML = html;
  }
  const resetQuiz = () => { qs.picked = null; qs.done = false; qs.sa = ''; qs.saState = null; renderQuiz(); };

  quizBody.addEventListener('click', (e) => {
    const opt = e.target.closest('.opt');
    if (opt && !qs.done) {
      qs.picked = Number(opt.dataset.i);
      if (qs.mode === 'practice') qs.done = true;
      renderQuiz();
      const next = qs.done ? $('[data-reset]', quizBody) : $(`.opt[data-i="${qs.picked}"]`, quizBody);
      if (next) next.focus();
      return;
    }
    if (e.target.closest('[data-submit]')) { qs.done = true; renderQuiz(); const r = $('[data-reset]', quizBody); if (r) r.focus(); return; }
    if (e.target.closest('[data-reset]')) { resetQuiz(); const f = $('.opt, #sa-input', quizBody); if (f) f.focus(); }
  });
  quizBody.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#sa-input', quizBody).value.trim();
    qs.sa = v;
    qs.saState = /kelvin|\bK\b/i.test(v) ? 'right' : /absolute/i.test(v) ? 'unsure' : 'wrong';
    qs.done = true;
    renderQuiz();
    const r = $('[data-reset]', quizBody); if (r) r.focus();
  });
  roving($('#q-types'), $$('#q-types button'), (b) => { qs.type = b.dataset.q; resetQuiz(); });
  roving($('#q-modes'), $$('#q-modes button'), (b) => { qs.mode = b.dataset.mode; resetQuiz(); });
  renderQuiz();

  /* ------------------------------------------------------------- flashcards */
  // Mirrors the app: "Again" returns a card to the end of the queue, any other grade removes it.
  const DECK = [
    { f: 'Carnot efficiency formula', b: 'η = 1 − T<sub>c</sub> / T<sub>h</sub>, with temperatures in kelvin' },
    { f: 'Which two kinds of process make up a Carnot cycle?', b: 'Two isothermal steps and two adiabatic steps' },
    { f: "Why can't a real engine beat a Carnot engine between the same temperatures?", b: 'The Carnot cycle is reversible. Real engines lose energy to irreversibility.' },
  ];
  const flash = $('#flash');
  const flashHint = $('#flash-hint');
  const grades = $('#grades');
  const cDone = $('#cards-done');
  const cCount = $('#cards-count');
  const cs = { queue: [], flipped: false, again: 0, total: DECK.length };

  function renderCard() {
    if (!cs.queue.length) {
      flash.hidden = true; flashHint.hidden = true; grades.hidden = true; cCount.hidden = true; cDone.hidden = false;
      $('#cards-done-text').textContent = `${cs.total} cards reviewed${cs.again ? `, ${cs.again} sent back to the queue` : ''}.`;
      return;
    }
    flash.hidden = false; flashHint.hidden = false; cCount.hidden = false; cDone.hidden = true;
    const c = cs.queue[0];
    flash.classList.toggle('flipped', cs.flipped);
    flash.innerHTML = `<span><small>${cs.flipped ? 'Back' : 'Front'}</small>${cs.flipped ? c.b : c.f}</span>`;
    flash.setAttribute('aria-label', cs.flipped ? 'Card back. Press to flip to the front.' : 'Card front. Press to show the answer.');
    grades.hidden = !cs.flipped;
    flashHint.textContent = cs.flipped ? 'How well did you remember it?' : 'Space or click to flip';
    cCount.textContent = `${cs.queue.length} ${cs.queue.length === 1 ? 'card' : 'cards'} left`;
  }
  function startCards() { cs.queue = DECK.slice(); cs.flipped = false; cs.again = 0; renderCard(); }
  flash.addEventListener('click', () => { cs.flipped = !cs.flipped; renderCard(); });
  function grade(g) {
    if (!cs.flipped || !cs.queue.length) return;
    const c = cs.queue.shift();
    if (g === 'again') { cs.queue.push(c); cs.again += 1; }
    cs.flipped = false;
    renderCard();
    (cs.queue.length ? flash : $('#cards-again')).focus();
  }
  $$('button', grades).forEach((b) => b.addEventListener('click', () => grade(b.dataset.grade)));
  $('#cards-stage').addEventListener('keydown', (e) => {
    const map4 = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };
    if (cs.flipped && map4[e.key]) { e.preventDefault(); grade(map4[e.key]); }
  });
  $('#cards-again').addEventListener('click', () => { startCards(); flash.focus(); });
  startCards();

  /* ------------------------------------------------------- activity heat map */
  (function heat() {
    let s = 20240611; // fixed seed so the sample looks the same every visit
    const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const wrap = $('#heat');
    let out = '';
    for (let i = 0; i < 140; i++) {
      const r = rnd();
      let l = r < 0.3 ? 0 : r < 0.55 ? 1 : r < 0.78 ? 2 : r < 0.92 ? 3 : 4;
      if (i >= 133) l = Math.max(l, 2); // the last 7 days: a 7-day streak
      out += `<i data-l="${l}"></i>`;
    }
    wrap.innerHTML = out;
  })();

  /* ------------------------------------------------------------------- deck */
  const deck = $('#deck');
  const gcards = $$('.g', deck);
  const prev = $('#deck-prev');
  const next = $('#deck-next');
  const pos = $('#deck-pos');
  const padL = () => parseFloat(getComputedStyle(deck).paddingLeft) || 0;
  const cur = () => {
    const x = deck.scrollLeft + padL() + 4;
    let best = 0, bd = Infinity;
    gcards.forEach((c, i) => { const d = Math.abs(c.offsetLeft - x); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const goTo = (i) => {
    const t = Math.max(0, Math.min(gcards.length - 1, i));
    deck.scrollTo({ left: gcards[t].offsetLeft - padL(), behavior: reduced ? 'auto' : 'smooth' });
  };
  const syncDeck = () => {
    const atEnd = deck.scrollLeft + deck.clientWidth >= deck.scrollWidth - 4;
    const i = atEnd ? gcards.length - 1 : cur();
    pos.textContent = `${i + 1} of ${gcards.length}`;
    prev.disabled = deck.scrollLeft <= 2;
    next.disabled = atEnd;
  };
  deck.style.position = 'relative';
  prev.addEventListener('click', () => goTo(cur() - 1));
  next.addEventListener('click', () => goTo(cur() + 1));
  deck.addEventListener('scroll', () => requestAnimationFrame(syncDeck), { passive: true });
  deck.addEventListener('keydown', (e) => {
    if (e.target !== deck) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(cur() + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(cur() - 1); }
  });
  window.addEventListener('resize', syncDeck);
  syncDeck();

  /* ---------------------------------------------------------- spot the error */
  const SENT = [
    'A Carnot engine is the most efficient engine possible between two temperatures.',
    'Its efficiency is 1 − T<sub>c</sub> / T<sub>h</sub>, with both temperatures in kelvin.',
    'Warming the cold reservoir raises the efficiency.',
    'No real engine working between the same two temperatures can beat it.',
  ];
  const WRONG = 2;
  const sentList = $('#sentences');
  const spotOut = $('#spot-out');
  function renderSpot(pick) {
    sentList.innerHTML = SENT.map((s, i) => {
      let cls = '', tag = '';
      if (pick !== null) {
        if (i === WRONG) { cls = 'found'; tag = '<span class="tag">The error: a warmer cold side lowers η.</span>'; }
        else if (i === pick) { cls = 'miss'; tag = '<span class="tag">Not this one: this sentence is correct.</span>'; }
      }
      return `<li><button type="button" class="${cls}" data-i="${i}"${pick !== null ? ' disabled' : ''}>${s}${tag}</button></li>`;
    }).join('');
    spotOut.innerHTML = pick === null
      ? 'Tap the sentence you think is wrong.'
      : (pick === WRONG ? 'Found it. ' : 'Not quite. ') + '<button type="button" class="btn btn-sm" id="spot-again" style="margin-left:6px">Play again</button>';
  }
  sentList.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { renderSpot(Number(b.dataset.i)); $('#spot-again').focus(); } });
  spotOut.addEventListener('click', (e) => { if (e.target.id === 'spot-again') { renderSpot(null); $('#sentences button').focus(); } });
  renderSpot(null);

  /* ------------------------------------------------------------ language demo */
  const LANGS = {
    en: { hi: 'Good afternoon.', level: 'Choose your level', cont: 'Continue studying', nav: ['Home', 'Materials', 'Quizzes', 'Cards', 'Progress'] },
    id: { hi: 'Selamat sore.', level: 'Pilih jenjangmu', cont: 'Lanjutkan belajar', nav: ['Beranda', 'Materi', 'Kuis', 'Kartu', 'Progres'] },
    es: { hi: 'Buenas tardes.', level: 'Elige tu nivel', cont: 'Continuar estudiando', nav: ['Inicio', 'Materiales', 'Quiz', 'Tarjetas', 'Progreso'] },
    zh: { hi: '下午好.', level: '选择你的学习阶段', cont: '继续学习', nav: ['首页', '资料', '测验', '卡片', '进度'] },
  };
  const langCard = $('#lang-card');
  function setLang(k) {
    const L = LANGS[k];
    langCard.lang = k;
    $('#lc-hi').textContent = L.hi;
    $('#lc-level').textContent = L.level;
    $('#lc-cont').textContent = L.cont;
    $('#lc-nav').innerHTML = L.nav.map((n) => `<li>${n}</li>`).join('');
  }
  setLang('en');
  roving($('#langs'), $$('#langs button'), (b) => setLang(b.dataset.lang));

  /* ------------------------------------------------------------- phone dock */
  const TABS = [
    { id: 'home', label: 'Home', icon: 'i-home', menu: [['Home'], ['Notifications', 1], ['Messages', 1]] },
    { id: 'materials', label: 'Materials', icon: 'i-folder', menu: [['Materials'], ['Cards'], ['AI assistant', 1]] },
    { id: 'quizzes', label: 'Quizzes', icon: 'i-quiz', menu: [['Quizzes'], ['Weak questions'], ['Progress']] },
    { id: 'games', label: 'Games', icon: 'i-game', menu: [['Games'], ['Opportunities'], ['Community', 1]] },
    { id: 'more', label: 'More', icon: 'i-menu', menu: [['Profile'], ['Settings'], ['Help and security']] },
  ];
  const demo = $('#dock-demo');
  const dock = $('#dock');
  const dmenu = $('#dock-menu');
  const dstatus = $('#dock-status');
  const HOLD_MS = 420;
  let timer = null, held = false, menuFor = -1;

  dock.innerHTML = TABS.map((t, i) =>
    `<button type="button" class="dtab" role="tab" aria-selected="${i === 0}" aria-haspopup="menu" data-i="${i}" tabindex="${i === 0 ? 0 : -1}">` +
    `<svg class="ico" aria-hidden="true"><use href="#${t.icon}"/></svg><span>${t.label}</span></button>`).join('');
  const dtabs = $$('.dtab', dock);

  const closeMenu = (refocus) => {
    if (menuFor < 0) return;
    const t = dtabs[menuFor];
    dmenu.hidden = true;
    dtabs.forEach((d) => d.classList.remove('holding'));
    menuFor = -1;
    if (refocus) t.focus();
  };
  const selectTab = (i) => {
    dtabs.forEach((d, j) => { d.setAttribute('aria-selected', String(i === j)); d.tabIndex = i === j ? 0 : -1; });
    dstatus.textContent = `${TABS[i].label} tab`;
  };
  const openMenu = (i, focusFirst) => {
    menuFor = i;
    const t = TABS[i];
    dmenu.innerHTML = t.menu.map(([name, soon], k) =>
      `<button type="button" role="menuitem" data-k="${k}"${k === 0 ? '' : ' tabindex="-1"'}>${name}${soon ? '<span class="soon-dot" aria-hidden="true"></span><span class="sr-only"> (coming soon)</span>' : ''}</button>`).join('');
    dmenu.hidden = false;
    dtabs[i].classList.add('holding');
    dstatus.textContent = `${t.label}: pick a page`;
    const dr = demo.getBoundingClientRect(), tr = dtabs[i].getBoundingClientRect(), w = dmenu.offsetWidth;
    const center = tr.left + tr.width / 2 - dr.left;
    dmenu.style.left = Math.max(w / 2 + 8, Math.min(dr.width - w / 2 - 8, center)) + 'px';
    if (focusFirst) $('button', dmenu).focus();
  };
  const pickItem = (btn) => {
    const [name, soon] = TABS[menuFor].menu[Number(btn.dataset.k)];
    const tab = menuFor;
    selectTab(tab);
    dstatus.textContent = soon ? `${name}: coming soon, it has no backend yet` : `Opened: ${name}`;
    closeMenu(true);
  };

  // Slide onto an item and release to open it, as in the app. Listening on the document, because a mouse
  // reports the release on whatever is under the pointer (touch reports it on the tab it started on).
  const onRelease = (e) => {
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const item = over && over.closest('[role="menuitem"]');
    if (menuFor >= 0 && item && dmenu.contains(item)) pickItem(item);
    setTimeout(() => { held = false; }, 0); // after the click that follows a release on the tab itself
  };

  dtabs.forEach((tab, i) => {
    tab.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      held = false;
      clearTimeout(timer);
      closeMenu(false);
      timer = setTimeout(() => {
        held = true;
        openMenu(i, false);
        document.addEventListener('pointerup', onRelease, { once: true });
      }, HOLD_MS);
    });
    tab.addEventListener('pointerup', () => clearTimeout(timer));
    tab.addEventListener('pointercancel', () => { clearTimeout(timer); held = false; });
    tab.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') clearTimeout(timer); });
    tab.addEventListener('contextmenu', (e) => e.preventDefault());
    tab.addEventListener('click', (e) => {
      if (held) { held = false; e.preventDefault(); return; } // the hold already opened the menu
      closeMenu(false);
      selectTab(i);
    });
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); openMenu(i, true); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + dtabs.length) % dtabs.length;
        closeMenu(false); dtabs[n].focus(); selectTab(n);
      }
    });
  });
  dmenu.addEventListener('click', (e) => { const b = e.target.closest('[role="menuitem"]'); if (b) pickItem(b); });
  dmenu.addEventListener('keydown', (e) => {
    const items = $$('[role="menuitem"]', dmenu);
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  });
  document.addEventListener('pointerdown', (e) => { if (menuFor >= 0 && !e.target.closest('#dock-demo')) closeMenu(false); });

  /* -------------------------------------------------------------- copy buttons */
  const copyStatus = $('#copy-status');
  $$('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pre = document.getElementById(btn.dataset.copy);
      const text = pre.textContent.trim();
      copyStatus.classList.remove('err');
      try {
        await navigator.clipboard.writeText(text);
        copyStatus.textContent = 'Copied the commands to your clipboard.';
      } catch (e) {
        const r = document.createRange(); r.selectNodeContents(pre);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        copyStatus.classList.add('err');
        copyStatus.textContent = 'Your browser blocked copying. The commands are selected, press Ctrl+C.';
      }
    });
  });
})();

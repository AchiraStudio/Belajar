'use strict';
/* Layar permainan: satu giliran = SSE dari /api/play/turn. Hasil penilaian datang dari agent;
   klien hanya menampilkan. Koneksi putus ditangani dengan mengirim ulang kunci idempoten yang sama. */
(() => {
  const B = window.Belajar;
  const P = B.play;
  const { h, fill, ico, rpc, toast, ask, mount, alive, onCleanup, sleep, loading, createSmoother, renderMarkdown, reduceMotion } = B;

  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2, 12)}`);
  const md = (el, text) => { el.innerHTML = renderMarkdown(text || ''); };
  const TITLES = { ajari: 'Ajari Aku', detektif: 'Detektif Salah Kaprah', petualangan: 'Petualangan', kasus: 'Kasus Nyata', kilat: 'Kilat', boss: 'Ujian Boss' };
  const STAGES = { merapikan: 'Merapikan jawaban AI…', memulihkan_sesi: 'Memulihkan sesi AI…', menyambung: 'Menyambung ulang…' };
  const BATCH = new Set(['kilat', 'boss']);

  async function runView(n) {
    const v = mount('Permainan');
    fill(v, loading());
    const pending = P.pending;
    P.pending = null;

    const ctx = { n, game: pending ? pending.game : null, data: null, turn: null, prev: null, busy: false, keys: null };
    let wl = null;
    const wakeOn = async () => { try { if (navigator.wakeLock && !wl) wl = await navigator.wakeLock.request('screen'); } catch { /* tidak didukung */ } };
    const wakeOff = () => { try { if (wl) wl.release(); } catch { /* abaikan */ } wl = null; };
    const onVis = () => { if (document.visibilityState === 'visible' && ctx.busy) wakeOn(); };
    document.addEventListener('visibilitychange', onVis);
    const onKey = (e) => { if (ctx.keys && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) ctx.keys(e); };
    document.addEventListener('keydown', onKey);
    const vv = window.visualViewport;
    const onVv = () => document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
    if (vv) { vv.addEventListener('resize', onVv); onVv(); }
    onCleanup(() => {
      wakeOff();
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('keydown', onKey);
      if (vv) { vv.removeEventListener('resize', onVv); document.documentElement.style.removeProperty('--vvh'); }
    });

    // ------------------------------------------------------------ kerangka
    const titleEl = h('h1', null, TITLES[ctx.game] || 'Permainan');
    const chips = h('div', { class: 'pl-chiprow' });
    const progress = P.bar(0, 'thin');
    const fbSlot = h('div');
    const narr = h('div', { class: 'pl-narr sheet', 'aria-live': 'polite' });
    const waitEl = h('div', { class: 'pl-wait', role: 'status' });
    const panel = h('div');
    const dock = h('div', { class: 'pl-dock' });
    const root = h('div', { class: 'pl-run' },
      h('div', { class: 'pl-top' },
        h('div', { class: 'pl-bar' }, h('a', { class: 'btn quiet sm', href: '#/game', 'aria-label': 'Jeda dan kembali ke daftar game' }, ico('back', 16), 'Jeda'), titleEl), chips, progress),
      fbSlot, narr, waitEl, panel);
    fill(v, root, dock);

    const scrollDown = () => { if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 220) window.scrollTo({ top: document.body.scrollHeight, behavior: reduceMotion() ? 'auto' : 'smooth' }); };
    const setWait = (text) => {
      if (!text) { waitEl.replaceChildren(); return; }
      waitEl.replaceChildren(h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('span', null, text));
    };

    function updateTop() {
      const r = ctx.data && ctx.data.run;
      if (!r) return;
      titleEl.textContent = r.title;
      const done = r.turn_count;
      P.setBar(progress, P.pct(done, r.max_turns));
      const st = r.state || {};
      const items = [P.chip('target', `${Math.min(done + 1, r.max_turns)}/${r.max_turns}`), P.chip('star', `${r.xp} XP`)];
      if (st.combo >= 2) items.push(P.chip('flame', `Kombo ×${st.combo}`, 'flame'));
      if (r.game === 'petualangan') items.push(h('span', { class: 'gchip' }, P.hearts(st.hp, st.max_hp || 3)));
      if (st.location) items.push(h('span', { class: 'gchip' }, ico('map', 15), st.location));
      chips.replaceChildren(...items);
    }

    // ------------------------------------------------------------ panggilan stream
    async function recover(body) {
      // koneksi putus di tengah jalan: kirim ulang kunci yang sama (agent idempoten) sampai berhasil
      const again = body.op === 'retry' ? { op: 'attach', turn_id: body.turn_id } : body;
      for (let i = 0; i < 10; i++) {
        if (!alive(ctx.n)) return null;
        setWait(STAGES.menyambung);
        await sleep(Math.min(6000, 1200 + i * 900));
        try { return await B.sse('/api/play/turn', again, {}); } catch (e) { if (!e.interrupted && e.status !== 0) throw e; }
      }
      throw new Error('Tidak dapat menyambung ke server. Permainanmu tersimpan; buka lagi lewat menu Game.');
    }

    async function turnCall(body, { into = narr, quiet = false } = {}) {
      ctx.busy = true;
      wakeOn();
      dock.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      setWait('AI sedang menyiapkan…');
      let any = false;
      const sm = createSmoother((text, live) => {
        if (!alive(ctx.n)) return;
        md(into, text);
        into.classList.toggle('live', live);
        if (text) setWait('');
        scrollDown();
      });
      let result;
      try {
        try {
          result = await B.sse('/api/play/turn', body, {
            onChunk: (c) => { any = true; sm.push(c); },
            onStatus: (st) => { if (alive(ctx.n) && STAGES[st]) setWait(STAGES[st]); },
          });
        } catch (e) {
          if (!e.interrupted) throw e;
          result = await recover(body);
        }
        if (!result) { sm.abort(); return null; }
        if (!any && result.narration && !quiet) sm.push(result.narration);
        sm.finish(result.narration || '');
        await sm.done;
        return result;
      } catch (e) {
        sm.abort();
        throw e;
      } finally {
        ctx.busy = false;
        wakeOff();
        if (alive(ctx.n)) setWait('');
      }
    }

    // ------------------------------------------------------------ tampilan hasil giliran
    const verdict = (j) => (j.obs >= 0.7 ? ['ok', 'Tepat!'] : j.obs >= 0.4 ? ['mid', 'Hampir'] : ['bad', 'Belum tepat']);
    function optionText(turn, id) {
      const pub = turn && turn.public;
      const opts = pub && (pub.options || (pub.challenge && pub.challenge.options)) || [];
      const o = opts.find((x) => x.id === id);
      return o ? o.text : '';
    }
    function revealNode(j, prev) {
      const r = j.reveal || {};
      const pub = (prev && prev.public) || {};
      const out = [];
      if (ctx.game === 'ajari' && r.poin_kunci) out.push(h('div', null, h('b', null, 'Poin kunci'), h('ul', null, r.poin_kunci.map((x) => h('li', null, x)))));
      if (ctx.game === 'detektif' && pub.sentences) {
        out.push(h('div', { class: 'pl-sents' }, pub.sentences.map((t, i) => h('div', { class: 'pl-sent' + (r.wrong.includes(i) ? '' : ' truth'), style: 'cursor:default' },
          t, r.wrong.includes(i) && r.benar && r.benar[String(i)] ? h('div', { class: 'small', style: 'margin-top:6px;color:var(--good)' }, `Seharusnya: ${r.benar[String(i)]}`) : null))));
      }
      if (r.answer_id) { const t = optionText(prev, r.answer_id); if (t) out.push(h('p', null, h('b', null, 'Jawaban benar: '), t)); }
      if (r.answer_text) out.push(h('p', null, h('b', null, 'Jawaban benar: '), r.answer_text));
      else if (r.answer && !r.answer_id) out.push(h('p', null, h('b', null, 'Jawaban: '), String(r.answer)));
      const why = r.explain || r.why || r.explanation;
      if (why) out.push(h('p', { class: 'muted' }, why));
      if (r.concept) out.push(h('p', { class: 'small muted' }, `Konsep: ${r.concept}`));
      return out;
    }
    function showFeedback(j, prev) {
      if (!j) { fbSlot.replaceChildren(); return; }
      if (j.hidden) { fbSlot.replaceChildren(h('div', { class: 'pl-fb' }, h('p', { class: 'muted small' }, 'Jawabanmu tercatat. Hasil dibuka setelah ujian selesai.'))); return; }
      const [cls, title] = verdict(j);
      const flag = h('button', { class: 'btn quiet sm', type: 'button', onClick: async (e) => {
        e.currentTarget.disabled = true;
        try { await rpc('play_flag', { turn_id: j.turn_id }); toast('Dicatat. Giliran ini tidak dihitung ke penguasaanmu.'); B.refreshSide(true); } catch (err) { toast(err.message); e.currentTarget.disabled = false; }
      } }, ico('flag', 14), 'Soal ini keliru');
      const rb = j.rubrik && Object.keys(j.rubrik).length ? h('div', { class: 'pl-rubric' }, [['akurat', 'Akurat'], ['lengkap', 'Lengkap'], ['jelas', 'Jelas'], ['contoh', 'Contoh']]
        .filter(([k]) => k in j.rubrik).map(([k, l]) => h('div', null, h('b', { class: 'num' }, `${j.rubrik[k]}/3`), l))) : null;
      fbSlot.replaceChildren(h('div', { class: `pl-fb ${cls}`, role: 'status' },
        h('h2', null, ico(cls === 'ok' ? 'check' : cls === 'mid' ? 'spark' : 'x', 18), title, h('span', { class: 'xp num' }, `+${j.xp} XP`)),
        j.feedback && h('p', null, j.feedback), rb, j.miskonsepsi && h('p', { class: 'small' }, h('b', null, 'Perhatikan: '), j.miskonsepsi),
        ...revealNode(j, prev), h('div', { class: 'actions' }, flag)));
    }

    // ------------------------------------------------------------ pengiriman jawaban
    async function submit(answer) {
      if (ctx.busy || !ctx.turn) return;
      const body = { op: 'answer', run_id: ctx.data.run.id, turn_id: ctx.turn.turn_id, client_key: uid(), answer };
      const prev = ctx.turn;
      panel.querySelectorAll('button,textarea,input').forEach((e) => { e.disabled = true; });
      const batch = BATCH.has(ctx.game);
      if (batch) narr.replaceChildren();
      else { fbSlot.replaceChildren(); narr.replaceChildren(); }
      try {
        const res = await turnCall(body, { quiet: batch });
        if (!res || !alive(ctx.n)) return;
        ctx.prev = prev;
        render(res);
      } catch (e) {
        if (!alive(ctx.n)) return;
        toast(e.message);
        panel.querySelectorAll('button,textarea,input').forEach((x) => { x.disabled = false; });
      }
    }

    // ------------------------------------------------------------ panel input per mode
    const choiceList = (options, onPick, keyed = true) => {
      const btns = options.map((o, i) => h('button', { class: 'pl-opt', type: 'button', 'aria-pressed': 'false', 'data-id': o.id, onClick: () => onPick(o, btns) },
        keyed && h('kbd', { 'aria-hidden': 'true' }, String(i + 1)), h('span', null, o.text)));
      ctx.keys = (e) => { const i = '1234'.indexOf(e.key); if (i >= 0 && btns[i] && !btns[i].disabled) btns[i].click(); };
      return { el: h('div', { class: 'pl-opts', role: 'group' }, btns), btns };
    };
    const pressOnly = (btns, btn) => btns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    const textArea = (ph, minLen = 0) => {
      const ta = h('textarea', { placeholder: ph, 'aria-label': ph, rows: 5 });
      ta.addEventListener('focus', () => setTimeout(() => ta.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250));
      return ta;
    };

    function panelFor(t) {
      const pub = t.public || {};
      ctx.keys = null;
      const hints = (pub.hints || []).map((x, i) => h('div', { class: 'pl-hint' }, h('b', null, `Petunjuk ${i + 1}`), x));
      const hintBox = h('div', { class: 'pl-hints', 'aria-live': 'polite' }, hints);
      ctx.hintBox = hintBox;
      const g = ctx.game;
      let body;
      if (g === 'ajari') {
        const ta = textArea('Jelaskan dengan kata-katamu sendiri…');
        const send = () => { if (ta.value.trim().length < 3) { toast('Tulis penjelasanmu dulu.'); ta.focus(); return; } submit({ text: ta.value }); };
        ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send(); });
        body = [h('p', { class: 'pl-q-text' }, pub.prompt), ta, h('div', { class: 'actions' }, h('button', { class: 'btn lg', type: 'button', onClick: send }, ico('send', 16), 'Kirim penjelasan'))];
      } else if (g === 'detektif') {
        const picked = new Set();
        const btns = (pub.sentences || []).map((s, i) => h('button', { class: 'pl-sent', type: 'button', 'aria-pressed': 'false', onClick: (e) => {
          if (picked.has(i)) picked.delete(i); else picked.add(i);
          e.currentTarget.setAttribute('aria-pressed', String(picked.has(i)));
        } }, s));
        const fix = textArea('Tulis kalimat yang benar (opsional)…');
        fix.rows = 2;
        body = [h('p', { class: 'pl-q-text' }, pub.title || 'Temukan kalimat yang keliru'), h('p', { class: 'muted small' }, 'Ketuk kalimat yang menurutmu salah (bisa lebih dari satu).'),
          h('div', { class: 'pl-sents' }, btns), fix,
          h('div', { class: 'actions' }, h('button', { class: 'btn lg', type: 'button', onClick: () => submit({ taps: [...picked], correction: fix.value }) }, ico('search', 16), 'Periksa jawabanku'))];
      } else if (g === 'petualangan') {
        const ch = pub.challenge || {};
        let ans;
        if (ch.type === 'short') {
          const inp = h('input', { type: 'text', 'aria-label': 'Jawabanmu', placeholder: 'Ketik jawabanmu…', maxlength: 300 });
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && inp.value.trim()) submit({ text: inp.value }); });
          ans = [inp, h('div', { class: 'actions' }, h('button', { class: 'btn lg', type: 'button', onClick: () => { if (inp.value.trim()) submit({ text: inp.value }); else toast('Tulis jawabanmu dulu.'); } }, 'Jawab'))];
        } else ans = [choiceList(ch.options || [], (o) => submit({ choice_id: o.id })).el];
        body = [h('p', { class: 'pl-scene' }, pub.scene), h('p', { class: 'pl-q-text' }, ch.question), ...ans];
      } else if (g === 'kasus') {
        let chosen = null;
        const reason = textArea('Alasanmu (opsional, menambah nilai)…');
        reason.rows = 3;
        const sendBtn = h('button', { class: 'btn lg', type: 'button', disabled: true, onClick: () => submit({ choice_id: chosen, reason: reason.value }) }, 'Jawab');
        const list = choiceList(pub.options || [], (o, btns) => { chosen = o.id; pressOnly(btns, btns.find((b) => b.dataset.id === o.id)); sendBtn.disabled = false; });
        body = [h('p', { class: 'pl-scene' }, pub.scenario), h('p', { class: 'pl-q-text' }, pub.question), list.el, reason, h('div', { class: 'actions' }, sendBtn)];
      } else {
        const r = ctx.data.run;
        const head = h('p', { class: 'small muted' }, `Soal ${Math.min(r.turn_count + 1, r.max_turns)} dari ${r.max_turns}`);
        let ans;
        if (pub.qtype === 'short') {
          const inp = h('input', { type: 'text', 'aria-label': 'Jawabanmu', placeholder: 'Ketik jawabanmu…', maxlength: 300 });
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit({ given: inp.value }); });
          ans = [inp, h('div', { class: 'actions' }, h('button', { class: 'btn lg', type: 'button', onClick: () => submit({ given: inp.value }) }, 'Jawab'))];
        } else if (pub.qtype === 'tf') {
          ans = [choiceList([{ id: 'true', text: 'Benar' }, { id: 'false', text: 'Salah' }], (o) => submit({ given: o.id })).el];
        } else {
          ans = [choiceList((pub.options || []).map((t, i) => ({ id: String(i), text: t })), (o) => submit({ given: o.id })).el];
        }
        body = [head, h('p', { class: 'pl-q-text' }, pub.question), ...ans];
      }
      return h('div', { class: 'pl-panel' }, ...body, hintBox);
    }

    // ------------------------------------------------------------ dock (petunjuk, akhiri)
    function paintDock(t) {
      const hintOk = t && t.status === 'awaiting' && ctx.game !== 'boss' && !(ctx.data.ended);
      const used = t ? t.hint_level : 0;
      const hintBtn = hintOk && h('button', { class: 'btn line', type: 'button', disabled: used >= 3, onClick: askHint }, ico('bulb', 16), used >= 3 ? 'Petunjuk habis' : `Petunjuk (${used}/3)`);
      const endBtn = !ctx.data.ended && h('button', { class: 'btn quiet', type: 'button', onClick: finishEarly }, ico('flag', 16), 'Akhiri');
      dock.replaceChildren(...[hintBtn, endBtn].filter(Boolean));
      dock.hidden = !(hintBtn || endBtn);
    }
    async function askHint() {
      if (ctx.busy || !ctx.turn) return;
      const level = ctx.turn.hint_level + 1;
      const live = h('div', { class: 'pl-hint' }, h('b', null, `Petunjuk ${level}`), h('span'));
      ctx.hintBox.append(live);
      const sm = createSmoother((text) => { if (alive(ctx.n)) { live.lastChild.textContent = text; } });
      ctx.busy = true;
      dock.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      try {
        const body = { op: 'hint', run_id: ctx.data.run.id, turn_id: ctx.turn.turn_id, level };
        let res;
        try { res = await B.sse('/api/play/turn', body, { onChunk: (c) => sm.push(c) }); }
        catch (e) { if (!e.interrupted) throw e; await sleep(1500); res = await B.sse('/api/play/turn', body, {}); }
        sm.finish(res.hint || '');
        await sm.done;
        ctx.turn.hint_level = res.level;
      } catch (e) { live.remove(); toast(e.message); sm.abort(); }
      ctx.busy = false;
      if (alive(ctx.n)) paintDock(ctx.turn);
    }
    async function finishEarly() {
      if (ctx.busy) return;
      const answered = ctx.data.run.turn_count;
      if (!(await ask({ title: 'Akhiri permainan sekarang?', message: answered ? 'XP dari giliran yang sudah dijawab tetap dihitung.' : 'Belum ada giliran yang dijawab.', confirm: 'Akhiri' }))) return;
      try { const r = await rpc('play_finish', { run_id: ctx.data.run.id }); B.refreshSide(true); showEnd({ run: r.run, rewards: r.rewards, narration: '' }); }
      catch (e) { toast(e.message); }
    }

    // ------------------------------------------------------------ akhir permainan
    function showEnd(d) {
      ctx.keys = null;
      const r = d.run, rw = d.rewards || {};
      const acc = r.total ? Math.round((100 * r.correct) / r.total) : 0;
      const lost = r.game === 'petualangan' && r.state && r.state.hp === 0;
      const win = !lost && acc >= 60;
      const lines = [];
      if (rw.bonuses && rw.bonuses.selesai) lines.push(`Bonus selesai +${rw.bonuses.selesai} XP`);
      if (rw.bonuses && rw.bonuses.akurasi) lines.push(`Bonus akurasi 80%+ +${rw.bonuses.akurasi} XP`);
      if (rw.quest_xp) lines.push(`Misi harian +${rw.quest_xp} XP`);
      const cele = [];
      if (rw.level_up) cele.push(`Naik ke level ${rw.level_after}!`);
      (rw.newly_mastered || []).forEach((t) => cele.push(`Konsep dikuasai: ${t}`));
      (rw.achievements || []).forEach((a) => cele.push(`Lencana: ${a.title}`));
      (rw.quests || []).forEach((q) => cele.push(`Misi selesai: ${q.title}`));
      const closing = d.narration ? h('div', { class: 'pl-narr sheet' }) : null;
      if (closing) md(closing, d.narration);
      fill(v, h('div', { class: 'pl-ended' },
        h('div', { class: 'pl-endhead' + (win ? ' win' : '') }, h('h1', null, lost ? 'Petualangan berakhir' : r.status === 'abandoned' ? 'Permainan dihentikan' : 'Permainan selesai'),
          h('p', { class: 'muted' }, `${r.title} · ${r.scope_title}`)),
        closing,
        h('div', { class: 'pl-endstats' }, [[`+${rw.xp || 0}`, 'XP'], [`${acc}%`, 'Akurasi'], [`${r.correct}/${r.total}`, 'Benar']].map(([b, l]) => h('div', null, h('b', { class: 'num' }, b), h('span', null, l)))),
        lines.length > 0 && h('ul', { class: 'pl-lines' }, lines.map((x) => h('li', null, x))),
        cele.map((x) => h('div', { class: 'pl-celebrate' }, ico('trophy', 18), x)),
        h('div', { class: 'actions center' }, h('a', { class: 'btn', href: '#/game' }, 'Main lagi'), h('a', { class: 'btn line', href: '#/game/peta' }, ico('map', 16), 'Lihat peta'))));
      B.refreshSide(true);
    }

    // ------------------------------------------------------------ render keadaan
    function render(res) {
      ctx.data = res;
      ctx.game = res.run.game;
      updateTop();
      showFeedback(res.judged, ctx.prev);
      if (res.ended) { showEnd(res); return; }
      if (BATCH.has(ctx.game) && !res.narration) narr.replaceChildren();
      if (res.status === 'error') {
        ctx.turn = null;
        panel.replaceChildren(h('div', { class: 'pl-err', role: 'alert' }, h('p', null, res.error || 'Giliran ini gagal dibuat.'),
          h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onClick: retry }, ico('refresh', 16), 'Coba lagi'),
            h('a', { class: 'btn quiet', href: '#/game' }, 'Jeda'))));
        paintDock(null);
        return;
      }
      if (res.status === 'generating') {                 // batas waktu tunggu terlewati: sambung lagi
        ctx.turn = null;
        panel.replaceChildren();
        reattach(res.turn_id);
        return;
      }
      ctx.turn = res;
      if (res.narration && !narr.textContent) md(narr, res.narration);
      panel.replaceChildren(panelFor(res));
      paintDock(res);
      const first = panel.querySelector('textarea,input,button.pl-opt,button.pl-sent');
      if (first && !reduceMotion()) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch { /* abaikan */ } }, 80);
    }
    async function retry() {
      if (ctx.busy || !ctx.data) return;
      try {
        panel.replaceChildren();
        narr.replaceChildren();
        const res = await turnCall({ op: 'retry', run_id: ctx.data.run.id, turn_id: ctx.data.turn_id });
        if (res && alive(ctx.n)) render(res);
      } catch (e) { toast(e.message); if (alive(ctx.n)) render({ ...ctx.data, status: 'error', error: e.message }); }
    }
    async function reattach(turnId) {
      try {
        const res = await turnCall({ op: 'attach', turn_id: turnId });
        if (res && alive(ctx.n)) render(res);
      } catch (e) { toast(e.message); }
    }

    // ------------------------------------------------------------ mulai / lanjutkan
    try {
      if (pending) {
        const res = await turnCall({ op: 'start', client_key: uid(), game: pending.game, scope_kind: pending.scope_kind, scope_id: pending.scope_id, options: pending.options });
        if (res && alive(n)) render(res);
      } else {
        const res = await rpc('play_get');
        if (!alive(n)) return;
        if (!res.run) { location.hash = '#/game'; return; }
        if (res.turn_id == null) { location.hash = '#/game'; return; }
        ctx.game = res.run.game;
        if (res.status === 'generating') { render(res); }
        else { if (res.narration) md(narr, res.narration); render(res); }
      }
    } catch (e) {
      if (!alive(n)) return;
      fill(v, h('div', { class: 'notice bad', role: 'alert' }, h('p', null, e.message),
        h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/game' }, 'Kembali ke daftar game'))));
    }
  }

  B.addRoute(/^game\/run$/, 'game', runView);
})();

'use strict';
/* Kartu belajar SM-2: ringkasan, bangun kartu dari istilah materi, review, ekspor Anki (TSV). */
(() => {
  const B = window.Belajar;
  const P = B.play;
  const { h, fill, ico, rpc, toast, mount, alive, onCleanup, activeClock, emptyState, showError, loading } = B;

  async function cardsView(n) {
    const v = mount('Kartu belajar');
    fill(v, loading());
    let data, hub;
    try { [data, hub] = await Promise.all([rpc('cards_due', { limit: 30 }), rpc('play_hub')]); } catch (e) { if (alive(n)) showError(v, e, () => cardsView(n)); return; }
    if (!alive(n)) return;

    const head = () => h('div', { class: 'pagehead' }, h('div', null, h('h1', { class: 'title' }, 'Kartu belajar'),
      h('p', { class: 'lede' }, 'Ulangan berjarak (SM-2): kartu yang kamu kuasai muncul makin jarang, yang sulit muncul lebih sering. Konsep yang lemah di game otomatis masuk ke sini.')),
    h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/game' }, ico('back', 16), 'Game')));
    const stat = (label, val) => h('div', { class: 'stat' }, h('b', { class: 'num' }, String(val)), h('span', null, label));
    const statsRow = (c) => h('div', { class: 'gstats' }, stat('Jatuh tempo', c.due), stat('Baru', c.new), stat('Dipelajari', c.learning), stat('Matang', c.mature), stat('Total', c.total));

    const buildSel = h('select', { 'aria-label': 'Bangun kartu dari' },
      h('option', { value: 'all' }, 'Semua materi'),
      hub.documents.map((d) => h('option', { value: 'd:' + d.id }, d.title)));
    async function build() {
      const [kind, id] = buildSel.value.split(':');
      try {
        const r = await rpc('cards_build', kind === 'd' ? { document_id: Number(id) } : {});
        toast(r.added ? `${r.added} kartu baru dibuat` : 'Semua istilah sudah punya kartu');
        (r.achievements || []).forEach((a) => toast(`Lencana: ${a.title}`));
        if (alive(n)) cardsView(n);
      } catch (e) { toast(e.message); }
    }
    async function exportTsv() {
      try {
        const r = await rpc('cards_export');
        if (!r.count) { toast('Belum ada kartu untuk diekspor.'); return; }
        const a = h('a', { href: URL.createObjectURL(new Blob([r.text], { type: 'text/tab-separated-values;charset=utf-8' })), download: 'kartu-belajar.tsv' });
        document.body.append(a); a.click(); a.remove();
        toast('Diekspor. Impor ke Anki sebagai teks dipisah tab.');
      } catch (e) { toast(e.message); }
    }

    const area = h('div');
    function overview() {
      fill(area, statsRow(data.counts),
        data.cards.length > 0
          ? h('div', { class: 'notice soft' }, h('p', null, h('strong', null, `${data.counts.due} kartu`), ' menunggu diulang hari ini.'),
            h('div', { class: 'actions' }, h('button', { class: 'btn', onClick: () => review() }, ico('cards', 16), 'Mulai review')))
          : emptyState('quiz', data.counts.total ? 'Tidak ada kartu jatuh tempo' : 'Belum ada kartu',
            data.counts.total ? 'Semua kartu sudah diulang. Kembali lagi besok.' : 'Bangun kartu dari istilah materi, atau mainkan game: konsep yang lemah otomatis dibuatkan kartu.'),
        h('div', { class: 'panel gtool' }, h('h2', null, 'Kelola kartu'),
          h('label', { class: 'field' }, 'Bangun kartu dari istilah', buildSel),
          h('div', { class: 'actions' }, h('button', { class: 'btn line', onClick: build }, ico('plus', 16), 'Bangun kartu'),
            h('button', { class: 'btn quiet', onClick: exportTsv }, ico('download', 16), 'Ekspor ke Anki (TSV)'))));
    }

    function review() {
      const queue = data.cards.slice();
      const total = queue.length;
      let done = 0, againCount = 0, t0 = Date.now(), flipped = false, cur = null;
      const clock = activeClock();
      const progress = P.bar(0);
      const stage = h('div', { class: 'fc-stage' });
      const onKey = (e) => {
        if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
        if (!flipped && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); flip(); }
        else if (flipped && '1234'.includes(e.key) && e.key) rate([1, 3, 4, 5]['1234'.indexOf(e.key)]);
      };
      document.addEventListener('keydown', onKey);
      onCleanup(() => document.removeEventListener('keydown', onKey));

      function show() {
        if (!queue.length) return finish();
        cur = queue[0];
        flipped = false;
        t0 = Date.now();
        P.setBar(progress, (done / total) * 100);
        fill(stage, h('button', { class: 'fc', type: 'button', onClick: flip, 'aria-label': 'Balik kartu' },
          h('small', null, cur.doc_title), h('div', { class: 'fc-t' }, cur.front), h('span', { class: 'fc-h' }, 'Ketuk atau tekan Spasi untuk melihat jawaban')));
      }
      function flip() {
        if (flipped || !cur) return;
        flipped = true;
        fill(stage, h('div', { class: 'fc back' }, h('small', null, cur.front), h('div', { class: 'fc-t def' }, cur.back)),
          h('div', { class: 'fc-rate' }, [[1, 'Lagi', 'bad'], [3, 'Sulit', 'mid'], [4, 'Baik', 'good'], [5, 'Mudah', 'good']].map(([g, label, c], i) =>
            h('button', { class: 'btn line rate ' + c, type: 'button', onClick: () => rate(g) }, h('kbd', { class: 'kbd' }, String(i + 1)), label))));
      }
      async function rate(grade) {
        if (!flipped || !cur) return;
        const card = cur;
        cur = null;
        try { await rpc('cards_review', { id: card.id, grade, seconds: Math.round((Date.now() - t0) / 1000) }); }
        catch (e) { toast(e.message); cur = card; return; }
        queue.shift();
        if (grade === 1) { againCount++; queue.push(card); } else done++;
        show();
      }
      function finish() {
        clock.stop();
        B.refreshSide(true);
        fill(v, h('div', { class: 'gresult' }, h('div', { class: 'gres-head' }, h('div', { class: 'gres-ico' }, ico('check', 34)), h('h1', null, 'Review selesai'),
          h('p', { class: 'muted' }, `${total} kartu diulang${againCount ? `, ${againCount}× perlu diulang lagi` : ''}.`)),
        h('div', { class: 'actions center' }, h('a', { class: 'btn', href: '#/game' }, 'Ke game'), h('button', { class: 'btn line', onClick: () => cardsView(B.newView()) }, 'Kembali ke kartu'))));
      }
      fill(v, head(), progress, stage);
      show();
    }

    fill(v, head(), area);
    overview();
  }

  B.addRoute(/^kartu$/, 'game', cardsView);
})();

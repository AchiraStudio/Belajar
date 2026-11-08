// Peta Penguasaan Konsep Belajar (Mastery Map)
(function () {
  'use strict';
  const B = window.Belajar;
  const { h, fill, ico, rpc, mount, alive, emptyState, showError, loading } = B;

  async function masteryMapView(n, params = {}) {
    const v = mount('Peta Penguasaan');
    B.setNav('game');
    fill(v, loading());

    let mapData, subjectsData, docsData;
    try {
      [mapData, subjectsData, docsData] = await Promise.all([
        rpc('mastery_map', params),
        rpc('list_subjects'),
        rpc('list_documents'),
      ]);
    } catch (e) {
      if (alive(n)) showError(v, e, () => masteryMapView(n, params));
      return;
    }
    if (!alive(n)) return;

    const subjects = subjectsData.subjects || [];
    const docs = docsData.documents || [];

    // Filter selector
    const filterSel = h('select', {
      'aria-label': 'Filter materi',
      onChange: (e) => {
        const val = e.target.value;
        if (!val || val === 'all') masteryMapView(n, {});
        else if (val.startsWith('s:')) masteryMapView(n, { subject_id: Number(val.slice(2)) });
        else if (val.startsWith('d:')) masteryMapView(n, { document_id: Number(val.slice(2)) });
      },
    },
    h('option', { value: 'all', selected: !params.subject_id && !params.document_id }, 'Semua Materi & Mapel'),
    h('optgroup', { label: 'Mata Pelajaran' },
      subjects.map((s) => h('option', { value: 's:' + s.id, selected: params.subject_id === s.id }, s.name)),
    ),
    h('optgroup', { label: 'Materi' },
      docs.map((d) => h('option', { value: 'd:' + d.id, selected: params.document_id === d.id }, d.title)),
    ),
    );

    const head = h('div', { class: 'pagehead' },
      h('div', null,
        h('h1', { class: 'title' }, 'Peta Penguasaan Konsep'),
        h('p', { class: 'lede' }, 'Pantau pemahamanmu secara menyeluruh: konsep baru, dipahami, hingga dikuasai penuh.')),
      h('div', { class: 'actions' },
        h('a', { class: 'btn quiet', href: '#/game' }, ico('back', 16), 'Kembali ke Game Hub')),
    );

    const legend = h('div', { class: 'play-peta-legend' },
      h('div', { class: 'play-leg-item' }, h('span', { class: 'dot dot-baru' }), 'Baru (0)'),
      h('div', { class: 'play-leg-item' }, h('span', { class: 'dot dot-dikenal' }), 'Dikenal (< 50%)'),
      h('div', { class: 'play-leg-item' }, h('span', { class: 'dot dot-paham' }), 'Paham (50–74%)'),
      h('div', { class: 'play-leg-item' }, h('span', { class: 'dot dot-kuasai' }), 'Kuasai (≥ 75% + 4 bukti)'),
    );

    const statsOverview = h('div', { class: 'gstats' },
      h('div', { class: 'stat' }, h('b', { class: 'num' }, String(mapData.total_concepts)), h('span', null, 'Total Konsep')),
      h('div', { class: 'stat' }, h('b', { class: 'num', style: 'color: var(--good);' }, String(mapData.mastered_count)), h('span', null, 'Sudah Dikuasai')),
      h('div', { class: 'stat' },
        h('b', { class: 'num' }, mapData.total_concepts ? `${Math.round((mapData.mastered_count / mapData.total_concepts) * 100)}%` : '0%'),
        h('span', null, 'Penguasaan Total'),
      ),
    );

    let contentEl;
    if (!mapData.topics || mapData.topics.length === 0) {
      contentEl = emptyState('compass', 'Belum ada data konsep', 'Unggah dan proses materi terlebih dahulu untuk melihat peta penguasaan.');
    } else {
      contentEl = h('div', { style: 'display: grid; gap: 16px;' },
        mapData.topics.map((t) => {
          return h('div', { class: 'play-topic-section' },
            h('h2', null,
              h('span', null, `Topik: ${t.topic}`),
              h('span', { class: 'chip' }, `${t.mastered_count}/${t.total_count} dikuasai (rata-rata ${t.average_score}%)`),
            ),
            h('div', { class: 'play-concept-grid' },
              t.concepts.map((c) => {
                const statusLabels = {
                  baru: 'Baru',
                  dikenal: 'Dikenal',
                  paham: 'Paham',
                  kuasai: 'Kuasai 🏆',
                };
                return h('div', { class: `play-concept-card ${c.status}` },
                  h('b', null, c.term),
                  h('span', null, c.definition),
                  h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-top: 6px; font-size: 11.5px; font-weight: 700;' },
                    h('span', null, statusLabels[c.status] || c.status),
                    h('span', null, `${Math.round(c.score)}%`),
                  ),
                );
              }),
            ),
          );
        }),
      );
    }

    fill(v,
      head,
      h('div', { class: 'play-peta-view' },
        h('div', { style: 'display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;' },
          legend,
          h('div', { style: 'min-width: 200px;' }, filterSel),
        ),
        statsOverview,
        contentEl,
      ),
    );
  }

  B.addRoute(/^game\/peta$/, 'game', masteryMapView);
})();

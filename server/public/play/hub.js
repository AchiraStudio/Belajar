// Game Hub v2.0 (Pemilihan Mode, Scope Materi, Level, Misi)
(function () {
  'use strict';
  const B = window.Belajar;
  const { h, fill, ico, rpc, toast, mount, alive, showError, loading } = B;

  async function playHubView(n) {
    const v = mount('Game Hub');
    B.setNav('game');
    fill(v, loading());

    let hub, docsData, subjectsData;
    try {
      [hub, docsData, subjectsData] = await Promise.all([
        rpc('play_hub'),
        rpc('list_documents'),
        rpc('list_subjects'),
      ]);
    } catch (e) {
      if (alive(n)) showError(v, e, () => playHubView(n));
      return;
    }
    if (!alive(n)) return;

    const docs = (docsData.documents || []).filter((d) => d.status === 'ready');
    const subjects = subjectsData.subjects || [];

    // Selected scope state (default to first doc, or first subject)
    let selectedScope = { kind: 'document', id: docs[0] ? docs[0].id : null };
    if (!selectedScope.id && subjects[0]) {
      selectedScope = { kind: 'subject', id: subjects[0].id };
    }

    // Hero Profil
    const prof = hub.profile || { level: 1, xp: 0, level_start: 0, next: 100 };
    const xpInLevel = Math.max(0, prof.xp - prof.level_start);
    const xpSpan = Math.max(1, prof.next - prof.level_start);
    const xpPct = Math.min(100, Math.round((xpInLevel / xpSpan) * 100));

    const hero = h('div', { class: 'play-hero' },
      h('div', { class: 'play-lvl-badge' },
        h('span', null, 'Level'),
        h('b', null, String(prof.level)),
      ),
      h('div', { class: 'play-hero-body' },
        h('div', { class: 'play-hero-top' },
          h('span', null, `Total XP: ${prof.xp}`),
          h('span', { class: 'muted', style: 'font-size: 13px;' }, `${xpInLevel} / ${xpSpan} XP menuju Level ${prof.level + 1}`),
        ),
        h('div', { class: 'play-xp-bar' },
          h('i', { style: `width: ${xpPct}%;` }),
        ),
        h('div', { class: 'play-hero-chips' },
          h('a', { class: 'chip link', href: '#/game/peta' }, ico('compass', 14), `${hub.mastered_concepts_count || 0} Konsep Dikuasai`),
          h('a', { class: 'chip link', href: '#/kartu' }, ico('cards', 14), `${hub.cards_due_count || 0} Kartu Jatuh Tempo`),
          h('span', { class: 'chip flame' }, `🔥 Streak ${hub.streak?.current || 0} Hari`),
        ),
      ),
    );

    // Banner Lanjutkan Permainan
    let resumeCard = null;
    if (hub.active_run && hub.active_run.run) {
      const ar = hub.active_run.run;
      const sTitle = hub.active_run.source?.title || 'Materi';
      resumeCard = h('div', { class: 'play-resume-card' },
        h('div', null,
          h('b', null, `Lanjutkan Permainan: ${ar.game.toUpperCase()}`),
          h('span', null, `${sTitle} · Giliran ${ar.turn_count} / ${ar.max_turns} · ${ar.xp} XP terkumpul`),
        ),
        h('div', { class: 'actions' },
          h('a', { class: 'btn', href: `#/game/main/${ar.id}` }, ico('play', 16), 'Lanjutkan'),
          h('button', {
            class: 'btn quiet',
            onClick: async () => {
              if (confirm('Batalkan permainan aktif ini?')) {
                await rpc('play_abandon', { run_id: ar.id });
                playHubView(n);
              }
            },
          }, 'Batalkan'),
        ),
      );
    }

    // Pemilih Cakupan Materi
    const scopePickerEl = h('div', { class: 'play-scope-picker' },
      h('h3', { style: 'margin: 0; font-size: 16px; font-weight: 750;' }, '1. Pilih Materi atau Mata Pelajaran:'),
    );

    function renderScopePicker() {
      const grid = h('div', { class: 'play-scope-grid' });
      if (docs.length === 0 && subjects.length === 0) {
        fill(grid, h('p', { class: 'muted' }, 'Belum ada materi siap. Unggah materi di menu Beranda terlebih dahulu.'));
      } else {
        docs.forEach((d) => {
          const isActive = selectedScope.kind === 'document' && selectedScope.id === d.id;
          const item = h('div', {
            class: `play-scope-item ${isActive ? 'active' : ''}`,
            onClick: () => {
              selectedScope = { kind: 'document', id: d.id };
              renderScopePicker();
            },
          },
          ico('file', 20),
          h('div', null,
            h('b', null, d.title),
            h('span', null, 'Dokumen Materi'),
          ),
          );
          grid.appendChild(item);
        });

        subjects.forEach((s) => {
          const isActive = selectedScope.kind === 'subject' && selectedScope.id === s.id;
          const item = h('div', {
            class: `play-scope-item ${isActive ? 'active' : ''}`,
            onClick: () => {
              selectedScope = { kind: 'subject', id: s.id };
              renderScopePicker();
            },
          },
          ico('compass', 20),
          h('div', null,
            h('b', null, s.name),
            h('span', null, 'Mata Pelajaran (Lintas Materi)'),
          ),
          );
          grid.appendChild(item);
        });
      }

      fill(scopePickerEl,
        h('h3', { style: 'margin: 0; font-size: 16px; font-weight: 750;' }, '1. Pilih Materi atau Mata Pelajaran:'),
        grid,
      );
    }
    renderScopePicker();

    // Kisi Mode Game (6 Mode)
    const modesGrid = h('div', { class: 'play-modes-grid' },
      (hub.modes || []).map((m) => {
        return h('div', {
          class: 'play-mode-card',
          onClick: async () => {
            if (!selectedScope.id) {
              toast('Silakan pilih materi atau mata pelajaran terlebih dahulu.');
              return;
            }
            try {
              fill(v, loading('Menyiapkan sesi AI dan materi...'));
              const res = await rpc('play_turn', {
                op: 'start',
                game: m.slug,
                scope_kind: selectedScope.kind,
                document_id: selectedScope.kind === 'document' ? selectedScope.id : null,
                subject_id: selectedScope.kind === 'subject' ? selectedScope.id : null,
              });
              location.hash = `#/game/main/${res.run.id}`;
            } catch (err) {
              toast(err.message);
              playHubView(n);
            }
          },
        },
        h('div', null,
          h('div', { class: 'play-mode-top' },
            h('div', { class: 'play-mode-ico' }, ico(m.icon || 'play', 24)),
            h('h3', null, m.title),
          ),
          h('p', { class: 'play-mode-desc' }, m.desc),
        ),
        h('div', { style: 'display: flex; justify-content: space-between; align-items: center;' },
          h('span', { class: 'chip' }, `${m.default_turns} Giliran`),
          h('span', { class: 'btn line', style: 'padding: 6px 14px; font-size: 13px;' }, 'Mulai'),
        ),
        );
      }),
    );

    // Misi Harian Widget
    const questsWidget = h('div', { class: 'play-hub-widget' },
      h('h2', null, ico('check', 18), 'Misi Harian'),
      h('ul', { class: 'play-quest-list' },
        (hub.quests || []).map((q) => {
          return h('li', { class: `play-quest-item ${q.done ? 'done' : ''}` },
            h('div', null,
              h('b', { style: 'display: block; font-size: 14px;' }, q.title),
              h('span', { class: 'muted', style: 'font-size: 12.5px;' }, q.desc),
            ),
            h('span', { class: 'xp-tag' }, q.done ? 'Selesai ✓' : `+${q.xp} XP`),
          );
        }),
      ),
    );

    // Navigasi Ekstra
    const extrasWidget = h('div', { class: 'play-hub-widget' },
      h('h2', null, ico('compass', 18), 'Eksplorasi & Penguasaan'),
      h('div', { style: 'display: grid; gap: 8px;' },
        h('a', { class: 'btn line', href: '#/game/peta' }, ico('compass', 16), 'Buka Peta Penguasaan Konsep'),
        h('a', { class: 'btn line', href: '#/kartu' }, ico('cards', 16), 'Kartu Belajar SM-2'),
      ),
    );

    const widgetsRow = h('div', { class: 'play-hub-row' }, questsWidget, extrasWidget);

    fill(v,
      h('div', { class: 'pagehead' },
        h('div', null,
          h('h1', { class: 'title' }, 'Game Interaktif'),
          h('p', { class: 'lede' }, 'Kuasai konsep materi melalui dialog langsung dengan AI DeepSeek Stream.')),
      ),
      h('div', { class: 'play-hub' },
        hero,
        resumeCard,
        scopePickerEl,
        h('h3', { style: 'margin: 10px 0 0; font-size: 16px; font-weight: 750;' }, '2. Pilih Mode Permainan:'),
        modesGrid,
        widgetsRow,
      ),
    );
  }

  B.addRoute(/^game$/, 'game', playHubView);
})();

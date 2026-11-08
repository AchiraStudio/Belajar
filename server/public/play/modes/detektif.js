// Mode Detektif Salah Kaprah
(function () {
  'use strict';
  window.BelajarModes = window.BelajarModes || {};
  const { h, ico } = window.Belajar;

  window.BelajarModes.detektif = {
    renderChallenge({ publicData, onSubmit, disabled }) {
      const sentences = publicData.sentences || [];
      const selected = new Set();

      const countBadge = h('span', { class: 'chip' }, '0 dipilih');
      const sendBtn = h('button', {
        class: 'btn play-send-btn',
        disabled: true,
        onClick: () => {
          onSubmit({ selected_indices: Array.from(selected).sort((a, b) => a - b) });
        },
      }, ico('check', 16), 'Vonis Kesalahan');

      function updateUI() {
        countBadge.textContent = `${selected.size} kalimat dicurigai`;
        sendBtn.disabled = disabled || selected.size === 0;
      }

      const listEl = h('div', { class: 'play-sentence-list' },
        sentences.map((sentence, idx) => {
          const item = h('div', {
            class: 'play-sentence-item',
            onClick: () => {
              if (disabled) return;
              if (selected.has(idx)) {
                selected.delete(idx);
                item.classList.remove('flagged');
              } else {
                selected.add(idx);
                item.classList.add('flagged');
              }
              updateUI();
            },
          },
          h('span', { class: 'num' }, `#${idx + 1}`),
          h('span', { class: 'text' }, sentence),
          );
          return item;
        }),
      );

      return h('div', { class: 'play-action-box' },
        h('div', { style: 'display: flex; justify-content: space-between; align-items: center;' },
          h('h3', { class: 'play-prompt-lbl' }, '🔍 Ketuk Kalimat yang Menurutmu Salah:'),
          countBadge,
        ),
        listEl,
        h('div', { style: 'display: flex; justify-content: flex-end; margin-top: 8px;' }, sendBtn),
      );
    },
  };
})();

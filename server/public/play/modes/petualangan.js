// Mode Petualangan (RPG Interaktif)
(function () {
  'use strict';
  window.BelajarModes = window.BelajarModes || {};
  const { h, ico } = window.Belajar;

  window.BelajarModes.petualangan = {
    renderChallenge({ publicData, runState, onSubmit, disabled }) {
      const state = runState || {};
      const hp = state.hp !== undefined ? state.hp : 100;
      const scene = state.scene || 1;
      const inventory = state.inventory || [];

      const challengeText = publicData.challenge || publicData.scene_text || 'Pilih aksimu untuk melewati rintangan:';
      const options = publicData.options || [];

      const hpBar = h('div', { class: 'play-xp-bar', style: 'height: 8px;' },
        h('i', { style: `width: ${hp}%; background: ${hp > 30 ? 'var(--good)' : 'var(--bad)'};` }),
      );

      const statusHeader = h('div', { style: 'display: grid; gap: 6px; margin-bottom: 8px;' },
        h('div', { style: 'display: flex; justify-content: space-between; font-weight: 750; font-size: 13px;' },
          h('span', null, `Adegan ${scene}`),
          h('span', { style: `color: ${hp > 30 ? 'var(--good)' : 'var(--bad)'};` }, `HP: ${hp}/100`),
        ),
        hpBar,
        inventory.length > 0 ? h('div', { style: 'display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;' },
          inventory.map((item) => h('span', { class: 'chip' }, '🎒 ' + item)),
        ) : null,
      );

      let interactionEl;
      if (options.length > 0) {
        interactionEl = h('div', { class: 'play-opts-grid' },
          options.map((opt, idx) => {
            const optLabel = typeof opt === 'string' ? opt : (opt.text || opt.action || '');
            return h('button', {
              class: 'play-opt-btn',
              disabled,
              onClick: () => onSubmit(optLabel),
            },
            h('span', { class: 'play-opt-key' }, String.fromCharCode(65 + idx)),
            h('span', null, optLabel),
            );
          }),
        );
      } else {
        const inputEl = h('input', {
          class: 'gin',
          placeholder: 'Ketik aksimu atau jawaban mantra...',
          disabled,
          style: 'flex: 1;',
        });
        interactionEl = h('form', {
          class: 'gform',
          onSubmit: (e) => {
            e.preventDefault();
            if (inputEl.value.trim() && !disabled) onSubmit(inputEl.value.trim());
          },
        },
        inputEl,
        h('button', { class: 'btn play-send-btn', type: 'submit', disabled }, ico('check', 16), 'Aksi'),
        );
      }

      return h('div', { class: 'play-action-box' },
        statusHeader,
        h('h3', { class: 'play-prompt-lbl' }, '⚔️ ' + challengeText),
        interactionEl,
      );
    },
  };
})();

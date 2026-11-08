// Mode Kilat (Pelatih Cepat)
(function () {
  'use strict';
  window.BelajarModes = window.BelajarModes || {};
  const { h, ico } = window.Belajar;

  window.BelajarModes.kilat = {
    renderChallenge({ publicData, onSubmit, disabled }) {
      const q = publicData.question || (publicData.questions && publicData.questions[0]) || {};
      const questionText = typeof q === 'string' ? q : (q.question || 'Jawab pertanyaan berikut:');
      const options = q.options || publicData.options || [];

      let interactionEl;
      if (options.length > 0) {
        interactionEl = h('div', { class: 'play-opts-grid' },
          options.map((opt, idx) => {
            const label = typeof opt === 'string' ? opt : (opt.text || '');
            return h('button', {
              class: 'play-opt-btn',
              disabled,
              onClick: () => onSubmit(label),
            },
            h('span', { class: 'play-opt-key' }, String.fromCharCode(65 + idx)),
            h('span', null, label),
            );
          }),
        );
      } else {
        const inputEl = h('input', {
          class: 'gin',
          placeholder: 'Ketik jawaban singkat...',
          disabled,
          style: 'flex: 1; font-size: 16px;',
          enterkeyhint: 'send',
        });
        interactionEl = h('form', {
          class: 'gform',
          onSubmit: (e) => {
            e.preventDefault();
            if (inputEl.value.trim() && !disabled) onSubmit(inputEl.value.trim());
          },
        },
        inputEl,
        h('button', { class: 'btn play-send-btn', type: 'submit', disabled }, ico('check', 16), 'Jawab'),
        );
      }

      return h('div', { class: 'play-action-box' },
        h('h3', { class: 'play-prompt-lbl' }, '⚡ ' + questionText),
        interactionEl,
      );
    },
  };
})();

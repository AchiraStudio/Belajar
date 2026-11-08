// Mode Ujian Boss (Evaluasi Komprehensif)
(function () {
  'use strict';
  window.BelajarModes = window.BelajarModes || {};
  const { h, ico } = window.Belajar;

  window.BelajarModes.boss = {
    renderChallenge({ publicData, onSubmit, disabled }) {
      const q = publicData.question || (publicData.questions && publicData.questions[0]) || {};
      const questionText = typeof q === 'string' ? q : (q.question || 'Selesaikan soal evaluasi boss:');
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
        const textarea = h('textarea', {
          class: 'play-textarea',
          placeholder: 'Tuliskan jawaban analisismu...',
          rows: 3,
          disabled,
        });
        interactionEl = h('div', { class: 'play-composer' },
          textarea,
          h('div', { class: 'play-composer-bottom' },
            h('span', { class: 'muted', style: 'font-size: 12px;' }, 'Ujian Boss: tanpa petunjuk instan'),
            h('button', {
              class: 'btn play-send-btn',
              disabled,
              onClick: () => {
                if (textarea.value.trim()) onSubmit(textarea.value.trim());
              },
            }, ico('send', 16), 'Kirim Jawaban'),
          ),
        );
      }

      return h('div', { class: 'play-action-box' },
        h('div', { style: 'display: flex; align-items: center; gap: 8px;' },
          h('span', { class: 'chip danger' }, '🛡️ UJIAN BOSS'),
        ),
        h('h3', { class: 'play-prompt-lbl' }, questionText),
        interactionEl,
      );
    },
  };
})();

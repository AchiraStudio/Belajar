// Mode Kasus Nyata (Studi Kasus Dunia Nyata)
(function () {
  'use strict';
  window.BelajarModes = window.BelajarModes || {};
  const { h, ico } = window.Belajar;

  window.BelajarModes.kasus = {
    renderChallenge({ publicData, onSubmit, disabled }) {
      const scenario = publicData.scenario || '';
      const question = publicData.question || 'Analisis situasi di atas: apa keputusan terbaik dan alasannya?';
      const options = publicData.options || [];

      let selectedOption = null;
      let optButtons = [];

      const textarea = h('textarea', {
        class: 'play-textarea',
        placeholder: 'Jelaskan alasan dan prinsip yang mendasari keputusanmu...',
        rows: 3,
        disabled,
      });

      const sendBtn = h('button', {
        class: 'btn play-send-btn',
        disabled,
        onClick: () => {
          const reason = textarea.value.trim();
          if (options.length > 0 && !selectedOption) {
            alert('Pilih salah satu keputusan terlebih dahulu.');
            return;
          }
          onSubmit({
            choice: selectedOption,
            reason: reason,
          });
        },
      }, ico('send', 16), 'Kirim Solusi');

      let optionsEl = null;
      if (options.length > 0) {
        optionsEl = h('div', { class: 'play-opts-grid' },
          options.map((opt, idx) => {
            const btn = h('button', {
              class: 'play-opt-btn',
              disabled,
              onClick: () => {
                selectedOption = opt;
                optButtons.forEach((b) => b.classList.remove('good'));
                btn.classList.add('good');
              },
            },
            h('span', { class: 'play-opt-key' }, String.fromCharCode(65 + idx)),
            h('span', null, opt),
            );
            optButtons.push(btn);
            return btn;
          }),
        );
      }

      return h('div', { class: 'play-action-box' },
        scenario ? h('div', { class: 'notice soft', style: 'font-size: 15px; line-height: 1.6;' }, scenario) : null,
        h('h3', { class: 'play-prompt-lbl' }, question),
        optionsEl,
        h('div', { class: 'play-composer' },
          textarea,
          h('div', { class: 'play-composer-bottom' },
            h('span', { class: 'muted', style: 'font-size: 12px;' }, 'Tuliskan analisis alasanmu'),
            sendBtn,
          ),
        ),
      );
    },
  };
})();

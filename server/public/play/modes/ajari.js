// Mode Ajari Aku (Teknik Feynman)
(function () {
  'use strict';
  window.BelajarModes = window.BelajarModes || {};
  const { h, ico } = window.Belajar;

  window.BelajarModes.ajari = {
    renderChallenge({ publicData, onSubmit, disabled }) {
      const promptText = publicData.prompt || publicData.question || 'Jelaskan konsep ini dengan kata-katamu sendiri:';
      const termName = publicData.term || publicData.focus_term || '';

      const textarea = h('textarea', {
        class: 'play-textarea',
        placeholder: 'Ketik penjelasanmu di sini dengan bahasa sederhana dan analogi...',
        rows: 4,
        disabled,
        enterkeyhint: 'send',
        autocomplete: 'off',
      });

      textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          if (textarea.value.trim() && !disabled) onSubmit(textarea.value.trim());
        }
      });

      const sendBtn = h('button', {
        class: 'btn play-send-btn',
        disabled,
        onClick: () => {
          if (textarea.value.trim()) onSubmit(textarea.value.trim());
        },
      }, ico('send', 16), 'Kirim Penjelasan');

      return h('div', { class: 'play-action-box' },
        h('h3', { class: 'play-prompt-lbl' },
          termName ? `Fokus Konsep: ${termName}` : 'Tantangan Feynman',
        ),
        h('p', { class: 'muted', style: 'margin: 0;' }, promptText),
        h('div', { class: 'play-composer' },
          textarea,
          h('div', { class: 'play-composer-bottom' },
            h('span', { class: 'muted', style: 'font-size: 12px;' }, '💡 Tekan Kirim atau Ctrl+Enter'),
            sendBtn,
          ),
        ),
      );
    },
  };
})();

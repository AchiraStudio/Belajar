/*
 * Drives splash.html. The native side (src-tauri/src/embedded.rs) calls window.stubySplash.* with real
 * progress; the buttons call back into the app through Tauri commands. A separate file (not inline)
 * because the app's CSP only allows scripts from its own origin.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var tauri = window.__TAURI__;
  var invoke = tauri && tauri.core && tauri.core.invoke;
  var counted = { config: 0, database: 0, server: 0 };

  function setState(state) { document.body.dataset.state = state; if (state !== 'loading') delete document.body.dataset.note; }
  function paintBar() {
    var done = 0;
    Object.keys(counted).forEach(function (k) { done += counted[k]; });
    var pct = Math.round((done / 3) * 100);
    $('fill').style.width = Math.max(pct, 6) + '%';
    $('fill').parentNode.setAttribute('aria-valuenow', String(pct));
  }
  window.stubySplash = {
    step: function (id, state) {
      var li = document.querySelector('li[data-step="' + id + '"]');
      if (li) li.dataset.state = state;
      if (id in counted) counted[id] = state === 'done' ? 1 : 0;
      if (state === 'active') {
        setState('loading');
        $('headline').textContent = li ? li.lastElementChild.textContent + '…' : '';
        $('detail').textContent = '';
      }
      paintBar();
    },
    headline: function (text) { $('headline').textContent = text; },
    note: function (text) { document.body.dataset.note = '1'; $('detail').textContent = text; },
    error: function (title, detail) {
      setState('error');
      $('headline').textContent = title;
      $('detail').textContent = detail || '';
    }
  };

  $('retry').addEventListener('click', function () {
    if (!invoke) return;
    setState('loading');
    $('headline').textContent = 'Trying again…';
    $('detail').textContent = '';
    ['config', 'database', 'server'].forEach(function (id) {
      var li = document.querySelector('li[data-step="' + id + '"]');
      if (li) li.dataset.state = 'pending';
      counted[id] = 0;
    });
    paintBar();
    invoke('retry_boot');
  });
})();

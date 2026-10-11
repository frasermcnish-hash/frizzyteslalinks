// Light/dark toggle. Loaded in <head> so the saved choice applies before the page paints.
(function () {
  var KEY = 'ftl-theme', root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);

  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function current() {
    var t = root.getAttribute('data-theme');
    return t === 'light' || t === 'dark' ? t : (media && media.matches ? 'dark' : 'light');
  }
  function syncMeta() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', current() === 'dark' ? '#0b141d' : '#17344f');
  }

  // Dashboard-style headlight symbol: beams glow when the lights are on (dark mode).
  var ICON = '<svg viewBox="0 0 32 24" aria-hidden="true">' +
    '<path class="lamp" d="M19 4c5.5 0 10 3.6 10 8s-4.5 8-10 8c-1.6 0-2.6-3.6-2.6-8S17.4 4 19 4z" stroke-width="2.2" stroke-linejoin="round"/>' +
    '<g class="beams" stroke-width="2.2" stroke-linecap="round">' +
    '<path d="M12.5 6.5 3 8.5"/><path d="M12.5 10.2 3 12.2"/><path d="M12.5 13.9 3 15.9"/><path d="M12.5 17.6 3 19.6"/></g></svg>';

  function update(btn) {
    var dark = current() === 'dark';
    btn.classList.toggle('on', dark);
    btn.setAttribute('aria-pressed', String(dark));
    btn.setAttribute('aria-label', dark ? 'Lights on: dark mode. Switch to light mode' : 'Lights off: light mode. Switch to dark mode');
    btn.title = dark ? 'Lights on (dark mode)' : 'Lights off (light mode)';
    syncMeta();
  }

  function mount() {
    var wrap = document.querySelector('.wrap');
    if (!wrap || document.getElementById('theme-toggle')) return;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'theme-toggle'; btn.className = 'theme-toggle';
    btn.innerHTML = ICON;
    wrap.insertBefore(btn, wrap.firstChild);
    update(btn);
    btn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
      update(btn);
    });
    if (media && media.addEventListener) media.addEventListener('change', function () { update(btn); });
  }
  syncMeta();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();

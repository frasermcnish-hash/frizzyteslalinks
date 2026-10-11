// Share and Add to Home Screen buttons
(function () {
  const shareBtn = document.getElementById('btn-share');
  const installBtn = document.getElementById('btn-install');
  const howto = document.getElementById('howto');
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isMobile = isIOS || isAndroid;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let deferred = null;

  function flash(btn, text) {
    const label = btn.querySelector('.label');
    const old = label.textContent;
    label.textContent = text;
    setTimeout(() => { label.textContent = old; }, 2000);
  }
  function show(html) { if (!howto) return; howto.innerHTML = html; howto.hidden = false; }

  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const url = shareBtn.dataset.url ? location.origin + shareBtn.dataset.url : location.href.split('#')[0];
      const data = { title: document.title, text: shareBtn.dataset.text || "Frizzy's Tesla Links: your survival kit for the Tesla Wait Club", url };
      if (navigator.share) {
        try { await navigator.share(data); } catch (e) { /* cancelled */ }
        return;
      }
      try { await navigator.clipboard.writeText(url); flash(shareBtn, 'Link copied'); }
      catch (e) { show('Copy this link to share it: <span class="mail">' + url + '</span>'); }
    });
  }

  if (!installBtn) return;
  if (standalone) { installBtn.hidden = true; return; }
  if (!isMobile) installBtn.querySelector('.label').textContent = 'Bookmark this page';

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { installBtn.hidden = true; if (howto) howto.hidden = true; });

  installBtn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) {}
      deferred = null;
      return;
    }
    if (isIOS) {
      show('<strong>On iPhone or iPad:</strong> tap the Share button <span class="ios-share" aria-label="Share icon"></span> in your browser, scroll down and choose <strong>Add to Home Screen</strong>.');
    } else if (isAndroid) {
      show('<strong>On Android:</strong> open your browser menu <strong>⋮</strong> and choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.');
    } else {
      const mac = /Mac/.test(navigator.platform);
      show('Press <kbd>' + (mac ? '⌘' : 'Ctrl') + '</kbd> + <kbd>D</kbd> to bookmark this page.');
    }
  });
})();

// Shows shared click counts and records clicks on outbound links.
(function () {
  function fmt(n) {
    if (n >= 10000) return Math.round(n / 1000) + 'k';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }
  function paint(counts) {
    document.querySelectorAll('a[data-id]').forEach(a => {
      const el = a.querySelector('.hits');
      if (!el) return;
      const n = counts[a.dataset.id] || 0;
      el.textContent = n ? fmt(n) + (n === 1 ? ' click' : ' clicks') : '';
      el.title = n ? n.toLocaleString('en-GB') + ' clicks' : '';
    });
  }
  let counts = {};
  let live = false;
  fetch('/api/clicks').then(r => r.json()).then(d => {
    if (!d.configured) return;
    live = true;
    counts = d.counts || {};
    paint(counts);
  }).catch(() => {});

  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-id]');
    if (!a) return;
    const id = a.dataset.id;
    const body = JSON.stringify({ id });
    let sent = false;
    try { sent = navigator.sendBeacon && navigator.sendBeacon('/api/clicks', new Blob([body], { type: 'application/json' })); } catch (err) {}
    if (!sent) fetch('/api/clicks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    if (live) { counts[id] = (counts[id] || 0) + 1; paint(counts); }
  });
})();

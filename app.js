// Frizzy's Tesla Links: renders link sections from /api/links, search, click counts,
// "Most used this week", and the feedback form. Also counts clicks on the guide page.
(function () {
  const $ = id => document.getElementById(id);
  const list = $('list');
  const CACHE_KEY = 'ftl-links-v1';
  let counts = {}, week = {}, live = false, linkIndex = {};

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch (e) {} },
  };

  // ---------- Rendering ----------
  function rowHTML(l) {
    return '<li><a data-id="' + esc(l.id) + '" href="' + esc(l.url) + '" target="_blank" rel="noopener">' +
      '<span class="code">' + esc(l.code) + '</span>' +
      '<span class="txt"><strong>' + esc(l.title) + '</strong>' + (l.desc ? '<span>' + esc(l.desc) + '</span>' : '') + '</span>' +
      '<span class="host"><span class="host-name">' + esc(l.host) + ' </span><span class="hits"></span><span class="arrow">↗</span></span></a></li>';
  }
  function cardHTML(l) {
    return '<li><a data-id="' + esc(l.id) + '" href="' + esc(l.url) + '" target="_blank" rel="noopener">' +
      '<strong>' + esc(l.title) + '</strong>' + (l.desc ? '<span>' + esc(l.desc) + '</span>' : '') +
      (l.tag ? '<em class="tag' + (l.highlight ? ' ev' : '') + '">' + esc(l.tag) + '</em>' : '') +
      '<span class="hits"></span></a></li>';
  }

  // Card sections start collapsed. The label comes from the section's template, if it has one.
  function foldLabel(s) {
    const tpl = $('extra-' + s.id);
    return (tpl && tpl.dataset.fold) || 'Show ' + s.links.length + ' links';
  }

  function render(data) {
    if (!list || !data || !Array.isArray(data.sections)) return;
    linkIndex = {};
    const html = data.sections.map(s => {
      s.links.forEach(l => { linkIndex[l.id] = l; });
      const items = s.links.map(s.layout === 'cards' ? cardHTML : rowHTML).join('');
      return '<section id="' + esc(s.id) + '">' +
        '<h2>' + esc(s.title) + ' <span class="count"></span></h2>' +
        '<div class="fsec-body">' +
        (s.blurb ? '<p>' + esc(s.blurb) + '</p>' : '') +
        '<div class="extra" data-for="' + esc(s.id) + '"></div>' +
        (s.layout === 'cards'
          ? '<details class="fold"><summary><span class="fold-title">' + esc(foldLabel(s)) + '</span><span class="fold-n">' + s.links.length + '</span></summary><ul class="fun">' + items + '</ul></details>'
          : '<ul class="links">' + items + '</ul>') + '</div></section>';
    }).join('');
    list.innerHTML = html;
    // Static extras (e.g. the Wait Club routine) slot into their section.
    list.querySelectorAll('.extra').forEach(div => {
      const tpl = $('extra-' + div.dataset.for);
      if (tpl) div.replaceWith(tpl.content.cloneNode(true)); else div.remove();
    });
    // Section chips
    const nav = $('chips');
    if (nav) {
      nav.querySelectorAll('a[data-section]').forEach(a => a.remove());
      const anchor = nav.querySelector('a[data-static]');
      data.sections.forEach(s => {
        const a = document.createElement('a');
        a.href = '#' + s.id; a.dataset.section = '1';
        const t = s.title.replace(/^Southampton /, '').replace(/ & shipping$/, '');
        a.textContent = t.charAt(0).toUpperCase() + t.slice(1);
        nav.insertBefore(a, anchor);
      });
    }
    list.querySelectorAll('section').forEach(makeFoldable);
    filter();
    paintCounts();
    if (location.hash && !render.scrolled) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) { setOpen(el, true, false); el.scrollIntoView(); render.scrolled = true; }
    }
  }

  // ---------- Collapsible sections ----------
  // Each section folds under its heading. What a visitor opens is remembered on their device.
  const OPEN_KEY = 'ftl-open-v1';
  const openSet = (() => { try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY)) || []); } catch (e) { return new Set(); } })();
  const saveOpen = () => { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...openSet])); } catch (e) {} };

  function makeFoldable(sec) {
    if (sec.dataset.fold) return;
    const h2 = sec.querySelector('h2');
    if (!h2) return;
    let body = sec.querySelector(':scope > .fsec-body');
    if (!body) { // static sections: gather everything after the heading
      body = document.createElement('div'); body.className = 'fsec-body';
      while (h2.nextSibling) body.appendChild(h2.nextSibling);
      sec.appendChild(body);
    }
    body.id = body.id || sec.id + '-body';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'fsec-btn';
    btn.setAttribute('aria-controls', body.id);
    const title = document.createElement('span'); title.className = 'fsec-title';
    const count = h2.querySelector('.count');
    title.append(...[...h2.childNodes].filter(n => n !== count));
    btn.appendChild(title);
    if (count) btn.appendChild(count);
    const chev = document.createElement('span'); chev.className = 'chev'; chev.setAttribute('aria-hidden', 'true');
    btn.appendChild(chev);
    h2.textContent = ''; h2.appendChild(btn); h2.classList.add('fsec-head');
    sec.classList.add('fsec'); sec.dataset.fold = '1';
    btn.addEventListener('click', () => setOpen(sec, body.hidden, true));
    setOpen(sec, openSet.has(sec.id), false);
  }
  function setOpen(sec, open, remember) {
    const body = sec.querySelector(':scope > .fsec-body'), btn = sec.querySelector('.fsec-btn');
    if (!body || !btn) return;
    body.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    sec.classList.toggle('open', open);
    if (remember) { open ? openSet.add(sec.id) : openSet.delete(sec.id); saveOpen(); }
  }
  // Section chips and other in-page links open the section they point to.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const sec = document.getElementById(a.getAttribute('href').slice(1));
    if (sec && sec.dataset.fold) setOpen(sec, true, true);
  });
  const legends = $('legends');
  if (legends && list) makeFoldable(legends);

  async function loadLinks() {
    if (!list) return;
    const cached = store.get();
    if (cached) render(cached);
    try {
      const r = await fetch('/api/links');
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (!cached || JSON.stringify(cached) !== JSON.stringify(data)) render(data);
      store.set(data);
    } catch (e) {
      if (!cached) {
        try { const r = await fetch('/data/links.json'); render(await r.json()); }
        catch (e2) { list.innerHTML = '<p class="loading">The links could not load. Check your connection and refresh.</p>'; }
      }
    }
  }

  // ---------- Search ----------
  const q = $('q');
  function filter() {
    if (!list) return;
    const term = q ? q.value.trim().toLowerCase() : '';
    let total = 0;
    list.querySelectorAll('details.fold').forEach(d => {
      if (term) { if (!d.dataset.searchOpen) { d.dataset.wasOpen = d.open ? '1' : ''; d.dataset.searchOpen = '1'; } d.open = true; }
      else if (d.dataset.searchOpen) { d.open = d.dataset.wasOpen === '1'; delete d.dataset.searchOpen; }
    });
    list.querySelectorAll('section').forEach(s => {
      let shown = 0;
      s.querySelectorAll('li').forEach(li => {
        const a = li.querySelector('a');
        const match = !term || li.textContent.toLowerCase().includes(term) || (a && a.href.toLowerCase().includes(term));
        li.hidden = !match; if (match) shown++;
      });
      s.hidden = shown === 0;
      if (s.dataset.fold) {
        if (term) setOpen(s, shown > 0, false);
        else setOpen(s, openSet.has(s.id), false);
      }
      const linkCount = s.querySelectorAll('ul.links > li:not([hidden]), ul.fun > li:not([hidden])').length;
      const c = s.querySelector('.count');
      if (c) c.textContent = linkCount + (linkCount === 1 ? ' link' : ' links');
      total += shown;
    });
    const empty = $('empty');
    if (empty) empty.style.display = total || !list.querySelector('section') ? 'none' : 'block';
    const pop = $('popular');
    if (pop) pop.classList.toggle('searching', Boolean(term));
  }
  if (q) q.addEventListener('input', filter);

  // ---------- Click counts and popular ----------
  function paintCounts() {
    if (!live) return;
    document.querySelectorAll('a[data-id] .hits').forEach(el => {
      const n = counts[el.closest('a').dataset.id] || 0;
      el.textContent = n ? fmt(n) + (n === 1 ? ' click' : ' clicks') : '';
    });
    paintPopular();
  }
  function paintPopular() {
    const box = $('popular'), ol = $('pop-list');
    if (!box || !ol) return;
    const top = Object.keys(week).filter(id => linkIndex[id] && week[id] > 0)
      .sort((a, b) => week[b] - week[a]).slice(0, 5);
    const totalWeek = top.reduce((n, id) => n + week[id], 0);
    if (top.length < 3 || totalWeek < 5) { box.hidden = true; return; }
    ol.innerHTML = top.map(id => {
      const l = linkIndex[id];
      return '<li><a data-id="' + esc(id) + '" href="' + esc(l.url) + '" target="_blank" rel="noopener">' +
        '<strong>' + esc(l.title) + '</strong><span class="pop-n">' + fmt(week[id]) + ' this week</span></a></li>';
    }).join('');
    box.hidden = false;
  }
  fetch('/api/clicks').then(r => r.json()).then(d => {
    if (!d.configured) return;
    live = true; counts = d.counts || {}; week = d.week || {};
    paintCounts();
  }).catch(() => {});

  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-id]');
    if (!a) return;
    const id = a.dataset.id;
    const body = JSON.stringify({ id });
    let sent = false;
    try { sent = navigator.sendBeacon && navigator.sendBeacon('/api/clicks', new Blob([body], { type: 'application/json' })); } catch (err) {}
    if (!sent) fetch('/api/clicks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    if (live) { counts[id] = (counts[id] || 0) + 1; paintCounts(); }
  });

  // ---------- Feedback ----------
  const form = $('fb');
  if (form) {
    const err = $('fb-err'), ok = $('fb-ok'), send = $('fb-send');
    const fields = () => ({ type: $('fb-type').value, name: $('fb-name').value.trim(), link: $('fb-link').value.trim(), msg: $('fb-msg').value.trim() });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = fields();
      ok.hidden = true;
      if (!f.msg && !f.link) { err.textContent = 'Add a message or a link before sending.'; err.hidden = false; $('fb-msg').focus(); return; }
      err.hidden = true; send.disabled = true; send.textContent = 'Sending…';
      try {
        const r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
        const d = r.status === 201 ? {} : await r.json().catch(() => ({}));
        if (r.status !== 201) throw new Error(d.error || 'Your message could not be sent.');
        form.reset(); ok.hidden = false;
      } catch (ex) {
        err.textContent = ex.message + ' Please try again in a moment.'; err.hidden = false;
      } finally {
        send.disabled = false; send.textContent = 'Send';
      }
    });
  }

  // Show the "Edit links" button on devices that have unlocked the editor.
  try { if (localStorage.getItem('ftl-admin') === '1' && $('admin-pill')) $('admin-pill').hidden = false; } catch (e) {}

  loadLinks();
})();

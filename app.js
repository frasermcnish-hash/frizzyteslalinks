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

  // Small icons shown before some section headings.
  const SECTION_ICONS = {
    track: '<svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ships: '<svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15h18l-2.5 5h-13z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 15v-4h12v4M9 11V7h6v4M12 7V4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    webcams: '<svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m15.5 10.5 6-3.5v10l-6-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chats: '<svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 9h1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v3l-4-3h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    charging: '<svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    resources: '<svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    passtime: '<svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10M7 21h10M8 3c0 4 8 5 8 9s-8 5-8 9M16 3c0 4-8 5-8 9s8 5 8 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    legends: '<svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1-4.5-4.2 6.1-.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    feedback: '<svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    _default: '<svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

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
        const t = s.title.replace(/^Southampton /, '').replace(/ & shipping$/, '').replace(/ at home & away$/, '');
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
    if (!h2.querySelector('.sec-icon')) h2.insertAdjacentHTML('afterbegin', SECTION_ICONS[sec.id] || SECTION_ICONS._default);
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
  ['legends', 'feedback'].forEach(id => { const el = $(id); if (el && list) makeFoldable(el); });

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

  // ---------- Wait Club mood ticker ----------
  const MOODS = [['Excited', '🤩'], ['Hopeful', '🤞'], ['Patient', '😌'], ['Anxious', '😬'], ['Frustrated', '😤'], ['Bored', '🥱']];
  const moodEmoji = m => (MOODS.find(x => x[0] === m) || ['', '💬'])[1];
  const track = $('mood-track');
  function ago(ts) {
    const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
    return m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago';
  }
  function paintTicker(posts) {
    if (!track) return;
    track.classList.remove('run');
    if (!posts.length) {
      track.innerHTML = '<span class="mood-empty">No posts yet. Be the first to share how your wait is going.</span>';
      return;
    }
    const one = posts.map(p => '<span class="mood-item"><span class="mood-emoji" aria-hidden="true">' + moodEmoji(p.mood) + '</span>' +
      '<strong>' + esc(p.name) + '</strong> is feeling <em>' + esc(p.mood.toLowerCase()) + '</em>' +
      (p.text ? '<span class="mood-text">“' + esc(p.text) + '”</span>' : '') +
      '<span class="mood-ago">' + ago(p.ts) + '</span></span>').join('');
    track.innerHTML = '<span class="mood-run">' + one + '</span><span class="mood-run" aria-hidden="true">' + one + '</span>';
    requestAnimationFrame(() => {
      const w = track.firstChild.getBoundingClientRect().width;
      track.style.setProperty('--mood-dur', Math.max(18, w / 45) + 's');
      track.classList.add('run');
    });
  }
  function loadMoods() {
    if (!track) return;
    fetch('/api/moods').then(r => r.json()).then(d => paintTicker(d.posts || [])).catch(() => {
      track.innerHTML = '<span class="mood-empty">The ticker could not load.</span>';
    });
  }
  if (track) {
    loadMoods();
    setInterval(loadMoods, 60000);
    const vp = $('mood-viewport');
    vp.addEventListener('click', () => track.classList.toggle('paused'));
    const opts = $('mood-options');
    opts.innerHTML = MOODS.map(([m, e], i) =>
      '<label class="mood-opt"><input type="radio" name="mood" value="' + m + '" id="mood-' + i + '"><span>' + e + ' ' + m + '</span></label>').join('');
    const form = $('mood-form'), add = $('mood-add'), err = $('mood-err'), send = $('mood-send');
    try { $('mood-name').value = localStorage.getItem('ftl-mood-name') || ''; } catch (e) {}
    const toggle = open => { form.hidden = !open; add.setAttribute('aria-expanded', String(open)); add.textContent = open ? 'Close' : '+ Share'; if (open) ($('mood-name').value ? opts.querySelector('input') : $('mood-name')).focus(); };
    add.addEventListener('click', () => toggle(form.hidden));
    $('mood-cancel').addEventListener('click', () => toggle(false));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const name = $('mood-name').value.trim();
      const picked = form.querySelector('input[name="mood"]:checked');
      const text = $('mood-text').value.trim();
      const fail = msg => { err.textContent = msg; err.hidden = false; };
      if (!name) return fail('Add your name.');
      if (!picked) return fail('Pick how you feel.');
      err.hidden = true; send.disabled = true; send.textContent = 'Posting…';
      try {
        const r = await fetch('/api/moods', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mood: picked.value, text }) });
        const d = await r.json().catch(() => ({}));
        if (r.status !== 201) throw new Error(d.error || 'Your post could not be added.');
        try { localStorage.setItem('ftl-mood-name', name); } catch (ex) {}
        $('mood-text').value = ''; picked.checked = false;
        toggle(false);
        fetch('/api/moods').then(x => x.json()).then(dd => {
          const posts = dd.posts || [];
          if (!posts.some(p => p.id === d.post.id)) posts.unshift(d.post);
          paintTicker(posts);
        }).catch(() => paintTicker([d.post]));
      } catch (ex) { fail(ex.message); }
      finally { send.disabled = false; send.textContent = 'Post to the ticker'; }
    });
  }

  // ---------- Tesla news ticker ----------
  const news = $('news'), newsTrack = $('news-track');
  if (news && newsTrack) {
    fetch('/api/news').then(r => r.json()).then(d => {
      const items = (d.items || []).filter(i => /^https:\/\//.test(i.link));
      if (!items.length) return;
      const one = items.map(i => '<a class="news-item" href="' + esc(i.link) + '" target="_blank" rel="noopener">' +
        '<span class="news-src">' + esc(i.source) + '</span>' + esc(i.title) +
        (i.ts ? '<span class="news-ago">' + ago(i.ts) + '</span>' : '') + '</a>').join('');
      newsTrack.innerHTML = '<span class="news-run">' + one + '</span><span class="news-run" aria-hidden="true">' + one.replace(/<a /g, '<a tabindex="-1" ') + '</span>';
      news.hidden = false;
      requestAnimationFrame(() => {
        const w = newsTrack.firstChild.getBoundingClientRect().width;
        newsTrack.style.setProperty('--news-dur', Math.max(25, w / 50) + 's');
        newsTrack.classList.add('run');
      });
    }).catch(() => {});
  }

  // ---------- Site stats ----------
  try { navigator.sendBeacon ? navigator.sendBeacon('/api/stats') : fetch('/api/stats', { method: 'POST', keepalive: true }); } catch (e) {}
  if ($('stats')) {
    fetch('/api/stats').then(r => r.json()).then(d => {
      const n = v => Number(v || 0).toLocaleString('en-GB');
      $('st-v-today').textContent = n(d.visitors && d.visitors.today);
      $('st-v-total').textContent = n(d.visitors && d.visitors.total);
      $('st-v-week').textContent = n(d.visitors && d.visitors.week);
      $('st-c-total').textContent = n(d.clicks && d.clicks.total);
      $('st-c-week').textContent = n(d.clicks && d.clicks.week);
    }).catch(() => { $('stats').hidden = true; });
  }

  // ---------- Do you like the new site? ----------
  const vote = $('vote');
  if (vote) {
    const show = d => { if (d && typeof d.up === 'number') { $('vote-up').textContent = fmt(d.up); $('vote-down').textContent = fmt(d.down); } };
    fetch('/api/vote').then(r => r.json()).then(show).catch(() => {});
    vote.addEventListener('click', async e => {
      const b = e.target.closest('.vote-btn'); if (!b) return;
      const el = $(b.dataset.v === 'up' ? 'vote-up' : 'vote-down');
      el.textContent = fmt((parseInt(el.textContent.replace(/[^0-9]/g, ''), 10) || 0) + 1);
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      if (b.dataset.v === 'up') $('vote-thanks').textContent = 'Thanks!';
      else $('vote-thanks').innerHTML = 'Thanks, noted. <a href="#feedback">Tell us what to improve</a>.';
      try {
        const r = await fetch('/api/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v: b.dataset.v }) });
        const d = await r.json(); show(d);
        if (r.status === 429) $('vote-thanks').textContent = d.error;
      } catch (ex) {}
    });
  }

  loadLinks();
})();

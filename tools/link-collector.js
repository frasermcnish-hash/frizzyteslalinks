// Link collector bookmarklet source (installed from /collector). Runs on the forum page
// you are reading when you tap the bookmark: collects links posted in the thread into a
// list kept in that site's browser storage, with Next page / CSV / Copy / Clear.
(() => {
  const KEY = "linkCollector_v1";
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || { links: {}, pages: {} }; }
    catch { return { links: {}, pages: {} }; }
  };
  const save = (d) => {
    try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch { return false; }
  };

  const here = location.href.split("#")[0];
  const pageNo = (here.match(/\/page-(\d+)/) || [, "1"])[1];
  const thread = (document.querySelector("h1.p-title-value, h1") || {}).textContent?.replace(/\s+/g, " ").trim() || document.title;
  const NOISE = /\/(members|attachments|login|register|search|goto|account|conversations|reactions|whats-new|tags|help)\b|\/data\/|proxy\.php/;

  const clean = (href) => {
    let u;
    try { u = new URL(href, location.href); } catch { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const proxied = u.pathname.endsWith("/proxy.php") && u.searchParams.get("link");
    if (proxied) { try { u = new URL(proxied); } catch { return null; } }
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_\w+|fbclid|gclid|mc_eid|igshid|si)$/i.test(k)) u.searchParams.delete(k);
    }
    if (u.hostname === location.hostname && NOISE.test(u.pathname)) return null;
    return u;
  };

  // 1. Find the links inside forum posts (XenForo, which TMC runs; generic fallback otherwise)
  const found = [];
  const posts = [...document.querySelectorAll("article.message")];
  if (posts.length) {
    for (const p of posts) {
      const body = p.querySelector(".message-body .bbWrapper") || p.querySelector(".bbWrapper");
      if (!body) continue;
      const author = p.dataset.author || (p.querySelector(".message-name") || {}).textContent?.trim() || "";
      const date = (p.querySelector("time[datetime]") || { getAttribute: () => "" }).getAttribute("datetime") || "";
      const permaA = p.querySelector('.message-attribution-main a[href*="post-"], .message-attribution a[href*="post-"], a[href*="/posts/"]');
      const post = permaA ? new URL(permaA.getAttribute("href"), location.href).href : here;
      body.querySelectorAll("a[href]").forEach((a) =>
        found.push({ a, author, date, post, quoted: !!a.closest(".bbCodeBlock--quote, blockquote") })
      );
    }
  } else {
    const root = document.querySelector("main, #content, [role=main], article") || document.body;
    root.querySelectorAll("a[href]").forEach((a) => {
      if (!a.closest("nav, header, footer, aside")) found.push({ a, author: "", date: "", post: here, quoted: false });
    });
  }
  found.sort((x, y) => x.quoted - y.quoted); // original posts take credit before quotes

  // 2. Merge into the running list
  const d = load();
  let fresh = 0, onPage = 0;
  const seenHere = new Set();
  for (const f of found) {
    const u = clean(f.a.getAttribute("href"));
    if (!u) continue;
    const url = u.href;
    if (!seenHere.has(url)) { seenHere.add(url); onPage++; }
    const text = (f.a.textContent || f.a.querySelector("img")?.alt || f.a.title || "").replace(/\s+/g, " ").trim().slice(0, 200);
    const rec = { url, text, author: f.author, date: f.date, thread, page: pageNo, post: f.post, quoted: f.quoted };
    const old = d.links[url];
    if (!old) { d.links[url] = rec; fresh++; }
    else if (old.quoted && !f.quoted) d.links[url] = rec;
  }
  d.pages[here] = { page: pageNo, links: onPage, at: Date.now() };
  const saved = save(d);

  // 3. Panel (shadow DOM so the forum's styles can't interfere)
  document.getElementById("link-collector")?.remove();
  const host = document.createElement("div");
  host.id = "link-collector";
  host.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647";
  const root = host.attachShadow({ mode: "open" });
  const all = Object.values(d.links);
  const pages = Object.values(d.pages).map((p) => +p.page).sort((a, b) => a - b);
  const nextEl = document.querySelector("a.pageNav-jump--next, a[rel=next], link[rel=next]");
  const next = nextEl && nextEl.href;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const range = pages.length ? (pages.length > 1 ? `pages ${pages[0]}–${pages[pages.length - 1]}` : `page ${pages[0]}`) : "";

  root.innerHTML = `
  <style>
    .s{font:15px/1.4 system-ui,-apple-system,sans-serif;background:#111;color:#f2f2f2;border-radius:16px 16px 0 0;
       padding:14px 16px calc(14px + env(safe-area-inset-bottom));box-shadow:0 -4px 24px rgba(0,0,0,.35);max-width:720px;margin:0 auto}
    .h{display:flex;align-items:flex-start;gap:8px}.h b{font-size:17px}.m{color:#aaa;font-size:13px;margin-top:2px}
    .x{margin-left:auto;background:none;border:0;color:#aaa;font-size:22px;line-height:1;padding:0 4px}
    .r{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
    button.b{flex:1 1 auto;border:0;border-radius:10px;padding:11px 12px;font:600 15px system-ui,sans-serif;background:#2a2a2a;color:#fff}
    button.p{background:#3b6cf6} button.d{background:none;color:#ff8a80;flex:0 0 auto}
    ul{list-style:none;margin:12px 0 0;padding:0;max-height:40vh;overflow:auto;border-top:1px solid #333}
    li{padding:8px 0;border-bottom:1px solid #2a2a2a;font-size:13px} li a{color:#8fb0ff;word-break:break-all} li span{color:#999}
    .w{color:#ffcc80;font-size:13px;margin-top:8px}
  </style>
  <div class="s">
    <div class="h"><div><b>+${fresh} new link${fresh === 1 ? "" : "s"}</b>
      <div class="m">This page ${pageNo}: ${onPage} links · Total ${all.length} from ${pages.length} page${pages.length === 1 ? "" : "s"}${range ? ` (${range})` : ""}</div></div>
      <button class="x" id="x" aria-label="Close">×</button></div>
    ${saved ? "" : `<div class="w">Couldn't save — private browsing or storage is full. Export now.</div>`}
    ${posts.length ? "" : `<div class="w">No forum posts detected here, so this collected links from the main page content.</div>`}
    <div class="r">
      ${next ? `<button class="b p" id="n">Next page →</button>` : `<button class="b" disabled>Last page</button>`}
      <button class="b" id="csv">CSV</button><button class="b" id="cp">Copy</button><button class="b" id="v">List</button>
    </div>
    <div id="lst"></div>
    <div class="r"><button class="b d" id="clr">Clear list</button></div>
  </div>`;
  document.body.appendChild(host);
  const $ = (id) => root.getElementById(id);

  $("x").onclick = () => host.remove();
  if (next) $("n").onclick = () => { location.href = next; };
  $("cp").onclick = async () => {
    const t = all.map((l) => l.url).join("\n");
    try { await navigator.clipboard.writeText(t); } catch {
      const ta = document.createElement("textarea"); ta.value = t; root.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    $("cp").textContent = "Copied";
  };
  $("csv").onclick = () => {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const cols = ["url", "text", "author", "date", "thread", "page", "post", "quoted"];
    const csv = [cols.join(","), ...all.map((l) => cols.map((c) => q(l[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = `links-${new Date().toISOString().slice(0, 10)}.csv`;
    root.appendChild(a); a.click(); a.remove();
  };
  $("v").onclick = () => {
    const box = $("lst");
    if (box.innerHTML) { box.innerHTML = ""; return; }
    box.innerHTML = `<ul>${all.slice(-300).reverse().map((l) =>
      `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.text || l.url)}</a><br><span>${esc(l.author)} · p${esc(l.page)}${l.quoted ? " · quoted" : ""}</span></li>`
    ).join("")}</ul>`;
  };
  $("clr").onclick = () => {
    if (confirm(`Delete all ${all.length} collected links?`)) { localStorage.removeItem(KEY); host.remove(); }
  };
})();

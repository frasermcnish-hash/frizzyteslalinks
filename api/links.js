// The editable list of link sections.
// GET /api/links                   -> { sections: [...], updated }
// PUT /api/links (x-admin-pin)     -> saves a new list, returns it
const { redis, configured, getLinks, slugFromUrl, checkPin, readBody } = require('./_lib');
const MIGRATIONS = require('./_migrations');

// Applies any one-time changes to the saved list that haven't run yet.
async function migrate() {
  if (!configured) return;
  for (const m of MIGRATIONS) {
    const [claim] = await redis([['SET', 'ftl:mig:' + m.id, String(Date.now()), 'NX']]);
    if (claim.result !== 'OK') continue;
    const [got] = await redis([['GET', 'ftl:links']]);
    if (!got.result) continue; // nothing saved yet: the default file already has the change
    try {
      const data = m.apply(JSON.parse(got.result));
      data.updated = new Date().toISOString();
      await redis([['SET', 'ftl:links', JSON.stringify(data)]]);
    } catch (e) {
      await redis([['DEL', 'ftl:mig:' + m.id]]);
    }
  }
}

const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

function clean(input) {
  if (!input || !Array.isArray(input.sections)) throw new Error('The list of sections is missing.');
  if (input.sections.length > 30) throw new Error('Too many sections (30 at most).');
  const usedSectionIds = new Set();
  const usedLinkIds = new Set();
  const sections = input.sections.map((s, si) => {
    const title = str(s.title, 80);
    if (!title) throw new Error('Section ' + (si + 1) + ' needs a title.');
    let id = str(s.id, 40).toLowerCase().replace(/[^a-z0-9-]/g, '') || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'section';
    while (usedSectionIds.has(id)) id += '-2';
    usedSectionIds.add(id);
    const layout = s.layout === 'cards' ? 'cards' : 'rows';
    if (!Array.isArray(s.links) || s.links.length > 80) throw new Error('"' + title + '" has too many links.');
    const links = s.links.map((l, li) => {
      const url = str(l.url, 600);
      let parsed;
      try { parsed = new URL(url); } catch (e) { throw new Error('Link ' + (li + 1) + ' in "' + title + '" needs a full web address starting with https://'); }
      if (!/^https?:$/.test(parsed.protocol)) throw new Error('Link ' + (li + 1) + ' in "' + title + '" must start with https://');
      const ltitle = str(l.title, 100);
      if (!ltitle) throw new Error('Link ' + (li + 1) + ' in "' + title + '" needs a name.');
      let lid = str(l.id, 64).toLowerCase().replace(/[^a-z0-9-]/g, '') || slugFromUrl(url) || 'link';
      let n = 2; const base = lid;
      while (usedLinkIds.has(lid)) lid = (base.slice(0, 60) + '-' + n++);
      usedLinkIds.add(lid);
      const out = { id: lid, title: ltitle, desc: str(l.desc, 200), url };
      if (layout === 'rows') {
        out.code = str(l.code, 6).toUpperCase() || ltitle.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
        out.host = str(l.host, 24) || parsed.hostname.replace(/^www\./, '').split('.')[0];
      }
      const tag = str(l.tag, 24);
      if (tag) out.tag = tag;
      if (l.highlight) out.highlight = true;
      return out;
    });
    return { id, title, blurb: str(s.blurb, 200), layout, links };
  });
  return { sections, updated: new Date().toISOString() };
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      try { await migrate(); } catch (e) { /* show the links regardless */ }
      const data = await getLinks();
      res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=60');
      return res.status(200).json(data);
    }
    if (req.method === 'PUT') {
      if (!configured) return res.status(503).json({ error: 'Storage is not connected.' });
      const auth = await checkPin(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
      let data;
      try { data = clean(await readBody(req)); } catch (e) { return res.status(400).json({ error: e.message }); }
      await redis([['SET', 'ftl:links', JSON.stringify(data)]]);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(data);
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).end();
  } catch (e) {
    return res.status(502).json({ error: 'Links unavailable' });
  }
};

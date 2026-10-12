// Site stats for the bottom of the links page.
// GET  /api/stats  -> { visitors: {total, week}, clicks: {total, week}, since }
// POST /api/stats  -> records a visit (each visitor counts once per day)
// Visitors are counted the same way as Vercel Web Analytics: unique visitors per day, added up.
const { redis, configured, clientKey, londonDay } = require('./_lib');

// Visitors recorded by Vercel Web Analytics before the site started counting them itself.
const BASELINE_VISITORS = { '2026-10-11': 31, '2026-10-12': 49 };
const SINCE = '2026-10-11';

module.exports = async (req, res) => {
  if (!configured) return res.status(200).json({ visitors: { total: 0, week: 0 }, clicks: { total: 0, week: 0 }, since: SINCE });
  try {
    if (req.method === 'POST') {
      const day = londonDay(0);
      const ua = String(req.headers['user-agent'] || '');
      if (/bot|crawl|spider|preview|headless/i.test(ua)) return res.status(204).end();
      const who = clientKey(req, ua + '|' + day);
      const [first] = await redis([['SET', 'ftl:v:' + who, '1', 'NX', 'EX', 2 * 86400]]);
      if (first.result === 'OK') await redis([['HINCRBY', 'ftl:visits', day, 1]]);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(204).end();
    }
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }

    const week = []; for (let i = 0; i < 7; i++) week.push(londonDay(i));
    const cmds = [['HGETALL', 'ftl:visits'], ['HGETALL', 'ftl:clicks']];
    week.forEach(d => cmds.push(['HGETALL', 'ftl:day:' + d]));
    const out = await redis(cmds);
    const toObj = flat => { const o = {}; for (let i = 0; i < (flat || []).length; i += 2) o[flat[i]] = Number(flat[i + 1]) || 0; return o; };
    const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

    const perDay = toObj(out[0].result);
    for (const d in BASELINE_VISITORS) perDay[d] = (perDay[d] || 0) + BASELINE_VISITORS[d];
    const visitors = { total: sum(perDay), week: week.reduce((n, d) => n + (perDay[d] || 0), 0) };
    const clicks = { total: sum(toObj(out[1].result)), week: out.slice(2).reduce((n, r) => n + sum(toObj(r.result)), 0) };

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    return res.status(200).json({ visitors, clicks, since: SINCE });
  } catch (e) {
    return res.status(502).json({ error: 'Stats unavailable' });
  }
};

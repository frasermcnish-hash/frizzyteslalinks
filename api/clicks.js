// Shared click counts.
// GET  /api/clicks       -> { configured, counts: {id: total}, week: {id: last 7 days} }
// POST /api/clicks {id}  -> counts one click (max one per visitor per link every 10 minutes)
const { redis, configured, getLinks, linkIds, clientKey, readBody, londonDay } = require('./_lib');

module.exports = async (req, res) => {
  if (!configured) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ configured: false, counts: {}, week: {} });
  }
  try {
    if (req.method === 'GET') {
      const cmds = [['HGETALL', 'ftl:clicks']];
      for (let i = 0; i < 7; i++) cmds.push(['HGETALL', 'ftl:day:' + londonDay(i)]);
      const out = await redis(cmds);
      const toObj = flat => { const o = {}; for (let i = 0; i < (flat || []).length; i += 2) o[flat[i]] = Number(flat[i + 1]) || 0; return o; };
      const counts = toObj(out[0].result);
      const week = {};
      for (let i = 1; i < out.length; i++) {
        const day = toObj(out[i].result);
        for (const k in day) week[k] = (week[k] || 0) + day[k];
      }
      res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
      return res.status(200).json({ configured: true, counts, week });
    }
    if (req.method === 'POST') {
      const { id } = await readBody(req);
      const ids = linkIds(await getLinks());
      if (typeof id !== 'string' || !ids.has(id)) return res.status(400).json({ error: 'Unknown link' });
      const who = clientKey(req, id);
      const [first] = await redis([['SET', 'ftl:seen:' + who, '1', 'NX', 'EX', '600']]);
      if (first.result === 'OK') {
        const dayKey = 'ftl:day:' + londonDay(0);
        await redis([['HINCRBY', 'ftl:clicks', id, 1], ['HINCRBY', dayKey, id, 1], ['EXPIRE', dayKey, 9 * 86400]]);
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(204).end();
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  } catch (e) {
    return res.status(502).json({ error: 'Counter unavailable' });
  }
};

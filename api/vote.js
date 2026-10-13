// "Do you like the new site?" thumbs up / down.
// GET  /api/vote            -> { up, down }
// POST /api/vote {v}        -> v is 'up' or 'down'; every press counts (max 20 per visitor per hour)
const { redis, configured, clientKey, readBody } = require('./_lib');

// One-time corrections requested by the site owner.
async function corrections() {
  const [claim] = await redis([['SET', 'ftl:mig:votes-remove-2-down', String(Date.now()), 'NX']]);
  if (claim.result !== 'OK') return;
  const [cur] = await redis([['HGET', 'ftl:votes', 'down']]);
  const remove = Math.min(2, Number(cur.result) || 0);
  if (remove) await redis([['HINCRBY', 'ftl:votes', 'down', -remove]]);
}

async function totals() {
  const [out] = await redis([['HMGET', 'ftl:votes', 'up', 'down']]);
  const [up, down] = out.result || [];
  return { up: Number(up) || 0, down: Number(down) || 0 };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!configured) return res.status(200).json({ up: 0, down: 0 });
  try {
    try { await corrections(); } catch (e) {}
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=60');
      return res.status(200).json(await totals());
    }
    if (req.method === 'POST') {
      const { v } = await readBody(req);
      if (v !== 'up' && v !== 'down') return res.status(400).json({ error: 'Unknown vote' });
      const key = 'ftl:voterate:' + clientKey(req, 'vote');
      const [n] = await redis([['INCR', key], ['EXPIRE', key, 3600]]);
      if (Number(n.result) > 20) return res.status(429).json(Object.assign({ error: 'Thanks, you have voted plenty for now.' }, await totals()));
      await redis([['HINCRBY', 'ftl:votes', v, 1]]);
      return res.status(200).json(await totals());
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  } catch (e) {
    return res.status(502).json({ error: 'Voting is unavailable right now.' });
  }
};

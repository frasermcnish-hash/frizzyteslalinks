// Shared click counts for Frizzy's Tesla Links.
// GET  /api/clicks          -> { configured, counts: { linkId: number } }
// POST /api/clicks {id}     -> counts one click (max one per visitor per link every 10 minutes)
// Storage: Upstash Redis REST (env vars added by the Vercel Upstash integration).
const crypto = require('crypto');
const IDS = new Set(require('./_link-ids.json'));

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(commands) {
  const r = await fetch(URL_ + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error('Redis error ' + r.status);
  return r.json();
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(safeParse(req.body));
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1000) req.destroy(); });
    req.on('end', () => resolve(safeParse(data)));
    req.on('error', () => resolve({}));
  });
}
function safeParse(s) { try { return JSON.parse(s); } catch (e) { return {}; } }

module.exports = async (req, res) => {
  if (!URL_ || !TOKEN) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ configured: false, counts: {} });
  }
  try {
    if (req.method === 'GET') {
      const [out] = await redis([['HGETALL', 'ftl:clicks']]);
      const flat = out.result || [];
      const counts = {};
      for (let i = 0; i < flat.length; i += 2) counts[flat[i]] = Number(flat[i + 1]) || 0;
      res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
      return res.status(200).json({ configured: true, counts });
    }
    if (req.method === 'POST') {
      const { id } = await readBody(req);
      if (!IDS.has(id)) return res.status(400).json({ error: 'Unknown link' });
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
      const who = crypto.createHash('sha256').update(ip + '|' + id).digest('hex').slice(0, 24);
      const [first] = await redis([['SET', 'ftl:seen:' + who, '1', 'NX', 'EX', '600']]);
      if (first.result === 'OK') await redis([['HINCRBY', 'ftl:clicks', id, 1]]);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(204).end();
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  } catch (e) {
    return res.status(502).json({ error: 'Counter unavailable' });
  }
};

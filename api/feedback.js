// Feedback and link suggestions.
// POST   /api/feedback {type,name,link,msg}   -> saves one (max 5 per visitor per hour)
// GET    /api/feedback (x-admin-pin)          -> { items: [{raw, ts, type, name, link, msg}] }
// DELETE /api/feedback (x-admin-pin) {raw}    -> removes one
const { redis, configured, checkPin, clientKey, readBody } = require('./_lib');

const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, max);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!configured) return res.status(503).json({ error: 'Storage is not connected.' });
  try {
    if (req.method === 'POST') {
      const b = await readBody(req);
      const item = { ts: Date.now(), type: str(b.type, 60), name: str(b.name, 80), link: str(b.link, 600), msg: str(b.msg, 2000) };
      if (!item.msg && !item.link) return res.status(400).json({ error: 'Add a message or a link.' });
      const key = 'ftl:fbrate:' + clientKey(req, 'fb');
      const [count] = await redis([['INCR', key], ['EXPIRE', key, 3600]]);
      if (Number(count.result) > 5) return res.status(429).json({ error: 'You have sent a lot of messages. Try again in an hour.' });
      await redis([['LPUSH', 'ftl:feedback', JSON.stringify(item)], ['LTRIM', 'ftl:feedback', 0, 499]]);
      return res.status(201).json({ ok: true });
    }
    const auth = await checkPin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (req.method === 'GET') {
      const [out] = await redis([['LRANGE', 'ftl:feedback', 0, 499]]);
      const items = (out.result || []).map(raw => { try { return Object.assign({ raw }, JSON.parse(raw)); } catch (e) { return null; } }).filter(Boolean);
      return res.status(200).json({ items });
    }
    if (req.method === 'DELETE') {
      const { raw } = await readBody(req);
      if (typeof raw !== 'string') return res.status(400).json({ error: 'Nothing to delete.' });
      await redis([['LREM', 'ftl:feedback', 1, raw]]);
      return res.status(204).end();
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).end();
  } catch (e) {
    return res.status(502).json({ error: 'Feedback unavailable' });
  }
};

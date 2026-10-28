// Feedback and link suggestions.
// POST   /api/feedback {type,name,link,msg}   -> saves one (max 5 per visitor per hour)
// GET    /api/feedback (x-admin-pin)          -> { items: [{raw, ts, type, name, link, msg}] }
// DELETE /api/feedback (x-admin-pin) {raw}    -> removes one
// GET    /api/feedback?pinlog=1 (x-admin-pin) -> failed sign-ins (no PINs)
// DELETE /api/feedback?pinlog=1 {id} | {all:true} -> removes one / clears all
const { redis, configured, checkPin, clientKey, readBody } = require('./_lib');

const logId = raw => require('crypto').createHash('sha256').update(raw).digest('hex').slice(0, 16);
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, max);

// Adds (or updates) one task on the McNisdash home dashboard's to-do list, which lives in the
// same Redis database under "todos". The task never includes the visitor's message, only a count.
async function notifyDashboard() {
  const [got] = await redis([['GET', 'todos']]);
  let list = [];
  try { list = got.result ? JSON.parse(got.result) : []; } catch (e) { return; }
  if (!Array.isArray(list)) return;
  const open = list.find(t => t && t.src === 'ftl-feedback' && !t.done);
  if (open) {
    open.count = (Number(open.count) || 1) + 1;
    open.text = 'Tesla Links: ' + open.count + ' new feedback messages';
  } else {
    if (list.length >= 100) return;
    list.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: 'Tesla Links: 1 new feedback message',
      done: false, urgent: false, src: 'ftl-feedback', count: 1,
    });
  }
  await redis([['SET', 'todos', JSON.stringify(list)]]);
}

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
      try { await notifyDashboard(); } catch (e) { /* the feedback is saved either way */ }
      return res.status(201).json({ ok: true });
    }
    const auth = await checkPin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error, ip: auth.ip, at: auth.at });
    const isPinLog = String(req.url || '').includes('pinlog=1');
    if (req.method === 'GET' && isPinLog) {
      const cutoff = Date.now() - 30 * 86400000;
      const [log] = await redis([['LRANGE', 'ftl:pinlog', 0, 99]]);
      const attempts = (log.result || []).map(raw => {
        try {
          const x = JSON.parse(raw);
          return { id: logId(raw), ip: x.ip, at: x.at, city: x.city, country: x.country };
        } catch (e) { return null; }
      }).filter(x => x && x.at > cutoff);
      return res.status(200).json({ attempts });
    }
    if (req.method === 'DELETE' && isPinLog) {
      const { id, all } = await readBody(req);
      if (all === true) { await redis([['DEL', 'ftl:pinlog']]); return res.status(204).end(); }
      if (typeof id !== 'string') return res.status(400).json({ error: 'Nothing to delete.' });
      const [log] = await redis([['LRANGE', 'ftl:pinlog', 0, 99]]);
      const raw = (log.result || []).find(r => logId(r) === id);
      if (raw) await redis([['LREM', 'ftl:pinlog', 1, raw]]);
      return res.status(204).end();
    }
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

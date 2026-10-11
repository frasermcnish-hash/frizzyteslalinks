// "How the Wait Club is feeling" ticker. Each post shows for 12 hours.
// GET    /api/moods                     -> { posts: [{id, ts, name, mood, text}] } newest first
// POST   /api/moods {name, mood, text}   -> adds a post (max 3 per visitor per hour)
// DELETE /api/moods (x-admin-pin) {id}   -> removes a post
const crypto = require('crypto');
const { redis, configured, checkPin, clientKey, readBody } = require('./_lib');

const KEY = 'ftl:moods';
const LIFETIME = 12 * 60 * 60 * 1000;
const MOODS = ['Excited', 'Hopeful', 'Patient', 'Anxious', 'Frustrated', 'Bored'];
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// A light filter for the worst words; the admin Ticker tab is the main way to remove posts.
const BLOCKED = /\b(f+u+c+k+|c+u+n+t+|n+i+g+g+|f+a+g+g?o+t|r+e+t+a+r+d|w+h+o+r+e|s+l+u+t)/i;
const LINKY = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|co\.uk|net|org|io|ly|xyz|ru)\b)/i;

async function current() {
  const cutoff = Date.now() - LIFETIME;
  const out = await redis([
    ['ZREMRANGEBYSCORE', KEY, '-inf', '(' + cutoff],
    ['ZREVRANGEBYSCORE', KEY, '+inf', cutoff],
  ]);
  return (out[1].result || []).map(raw => { try { return JSON.parse(raw); } catch (e) { return null; } }).filter(Boolean);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!configured) return res.status(200).json({ posts: [] });
  try {
    if (req.method === 'GET') {
      const posts = await current();
      res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
      return res.status(200).json({ posts });
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      const name = str(b.name, 30);
      const mood = MOODS.includes(b.mood) ? b.mood : '';
      const text = str(b.text, 140);
      if (!name) return res.status(400).json({ error: 'Add your name.' });
      if (!mood) return res.status(400).json({ error: 'Pick how you feel.' });
      if (BLOCKED.test(name + ' ' + text)) return res.status(400).json({ error: 'Please keep it friendly.' });
      if (LINKY.test(name + ' ' + text)) return res.status(400).json({ error: 'Links are not allowed on the ticker.' });
      const rk = 'ftl:moodrate:' + clientKey(req, 'mood');
      const [count] = await redis([['INCR', rk], ['EXPIRE', rk, 3600]]);
      if (Number(count.result) > 3) return res.status(429).json({ error: 'You have posted a few times already. Try again in an hour.' });
      const post = { id: crypto.randomBytes(6).toString('hex'), ts: Date.now(), name, mood, text };
      await redis([['ZADD', KEY, post.ts, JSON.stringify(post)], ['ZREMRANGEBYRANK', KEY, 0, -201]]);
      return res.status(201).json({ post });
    }
    if (req.method === 'DELETE') {
      const auth = await checkPin(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
      const { id } = await readBody(req);
      const [all] = await redis([['ZRANGE', KEY, 0, -1]]);
      const raw = (all.result || []).find(r => { try { return JSON.parse(r).id === id; } catch (e) { return false; } });
      if (raw) await redis([['ZREM', KEY, raw]]);
      return res.status(204).end();
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).end();
  } catch (e) {
    return res.status(502).json({ error: 'The ticker is unavailable right now.' });
  }
};

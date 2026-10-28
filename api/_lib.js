// Shared helpers for Frizzy's Tesla Links API routes.
const crypto = require('crypto');
const DEFAULT_LINKS = require('../data/links.json');

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const configured = Boolean(REDIS_URL && REDIS_TOKEN);

// Links that appear outside the editable sections (guide page, routine checklist).
const EXTRA_IDS = ['marinetraffic-com', 'tesla-com-en-gb-drive', 'ts-la-fraser164326', 'share-octopus-energy-great-thyme-51'];

async function redis(commands) {
  const r = await fetch(REDIS_URL + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error('Redis error ' + r.status);
  return r.json();
}

async function getLinks() {
  if (!configured) return DEFAULT_LINKS;
  const [out] = await redis([['GET', 'ftl:links']]);
  if (out.result) {
    try { return JSON.parse(out.result); } catch (e) { /* fall through */ }
  }
  return DEFAULT_LINKS;
}

function linkIds(data) {
  const ids = new Set(EXTRA_IDS);
  for (const s of data.sections || []) for (const l of s.links || []) ids.add(l.id);
  return ids;
}

function slugFromUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    return (host + u.pathname).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  } catch (e) {
    return '';
  }
}

function clientKey(req, extra) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  return crypto.createHash('sha256').update(ip + '|' + (extra || '')).digest('hex').slice(0, 24);
}

// PIN check with a limit of 10 wrong attempts per visitor per hour.
async function checkPin(req) {
  const expected = process.env.ADMIN_PIN;
  if (!expected) return { ok: false, status: 503, error: 'No admin PIN is set for this site yet.' };
  const key = 'ftl:pinfail:' + clientKey(req, 'pin');
  const [fails] = await redis([['GET', key]]);
  if (Number(fails.result || 0) >= 10) return { ok: false, status: 429, error: 'Too many wrong PINs. Try again in an hour.' };
  const given = String(req.headers['x-admin-pin'] || '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (given && crypto.timingSafeEqual(a, b)) return { ok: true };
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || String(req.headers['x-real-ip'] || '') || 'unknown';
  const at = Date.now();
  // The PIN that was typed is never stored or sent back.
  const entry = JSON.stringify({ ip, at, city: decodeURIComponent(String(req.headers['x-vercel-ip-city'] || '')), country: String(req.headers['x-vercel-ip-country'] || ''), ua: String(req.headers['user-agent'] || '').slice(0, 160) });
  await redis([['INCR', key], ['EXPIRE', key, 3600], ['LPUSH', 'ftl:pinlog', entry], ['LTRIM', 'ftl:pinlog', 0, 99]]);
  return { ok: false, status: 401, error: 'That PIN is not right.', ip, at };
}

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(safeParse(req.body));
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 200000) req.destroy(); });
    req.on('end', () => resolve(safeParse(data)));
    req.on('error', () => resolve({}));
  });
}
function safeParse(s) { try { return JSON.parse(s); } catch (e) { return {}; } }

function londonDay(offsetDays) {
  const d = new Date(Date.now() - (offsetDays || 0) * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d); // YYYY-MM-DD
}

module.exports = { redis, configured, getLinks, linkIds, slugFromUrl, clientKey, checkPin, readBody, londonDay, DEFAULT_LINKS };

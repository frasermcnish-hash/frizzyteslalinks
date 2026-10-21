// Site stats for the bottom of the links page.
// GET  /api/stats  -> { visitors: {total, week, today}, clicks: {total, week}, since }
// POST /api/stats  -> records a visit (each visitor counts once per day)
// Visitors are counted the same way as Vercel Web Analytics: unique visitors per day, added up.
const { redis, configured, clientKey, londonDay } = require('./_lib');

// Visitors recorded by Vercel Web Analytics before the site started counting them itself.
const BASELINE_VISITORS = { '2026-10-11': 31, '2026-10-12': 49 };
const SINCE = '2026-10-11';

// Current hour (0-23) and minutes past midnight in UK time.
function londonHour() { return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date())); }
function londonMinutes() {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  return Number(p.find(x => x.type === 'hour').value) * 60 + Number(p.find(x => x.type === 'minute').value);
}
// Percentage change, or null when there is nothing to compare with.
const change = (now, before) => before > 0 ? Math.round((now - before) / before * 100) : null;

module.exports = async (req, res) => {
  if (!configured) return res.status(200).json({ visitors: { total: 0, week: 0, today: 0 }, clicks: { total: 0, week: 0 }, since: SINCE });
  try {
    if (req.method === 'POST') {
      const day = londonDay(0);
      const ua = String(req.headers['user-agent'] || '');
      if (/bot|crawl|spider|preview|headless/i.test(ua)) return res.status(204).end();
      const who = clientKey(req, ua + '|' + day);
      const [first] = await redis([['SET', 'ftl:v:' + who, '1', 'NX', 'EX', 2 * 86400]]);
      if (first.result === 'OK') {
        const hk = 'ftl:vh:' + day;
        await redis([['HINCRBY', 'ftl:visits', day, 1], ['HINCRBY', hk, String(londonHour()), 1], ['EXPIRE', hk, 4 * 86400]]);
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(204).end();
    }
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }

    const week = []; for (let i = 0; i < 7; i++) week.push(londonDay(i));
    const prevWeek = []; for (let i = 7; i < 14; i++) prevWeek.push(londonDay(i));
    const cmds = [['HGETALL', 'ftl:visits'], ['HGETALL', 'ftl:clicks'], ['HGETALL', 'ftl:vh:' + londonDay(1)]];
    week.forEach(d => cmds.push(['HGETALL', 'ftl:day:' + d]));
    const out = await redis(cmds);
    const toObj = flat => { const o = {}; for (let i = 0; i < (flat || []).length; i += 2) o[flat[i]] = Number(flat[i + 1]) || 0; return o; };
    const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

    const perDay = toObj(out[0].result);
    for (const d in BASELINE_VISITORS) perDay[d] = (perDay[d] || 0) + BASELINE_VISITORS[d];
    const visitors = { total: sum(perDay), week: week.reduce((n, d) => n + (perDay[d] || 0), 0), today: perDay[week[0]] || 0 };
    const clicks = { total: sum(toObj(out[1].result)), week: out.slice(3).reduce((n, r) => n + sum(toObj(r.result)), 0) };

    // Today so far vs yesterday up to the same time. Uses yesterday's hourly counts when
    // they exist, otherwise yesterday's total scaled to the time of day.
    const hourly = toObj(out[2].result);
    const hour = londonHour();
    let ydaySoFar;
    if (Object.keys(hourly).length) {
      ydaySoFar = Object.keys(hourly).reduce((n, h) => n + (Number(h) < hour ? hourly[h] : 0), 0) + (hourly[hour] || 0) * ((londonMinutes() % 60) / 60);
    } else {
      ydaySoFar = (perDay[londonDay(1)] || 0) * Math.max(londonMinutes(), 60) / 1440;
    }
    const prevWeekTotal = prevWeek.reduce((n, d) => n + (perDay[d] || 0), 0);
    const prevWeekFull = prevWeek.every(d => d >= SINCE);
    visitors.trend = {
      today: londonMinutes() >= 60 ? change(visitors.today, ydaySoFar) : null,
      week: prevWeekFull ? change(visitors.week, prevWeekTotal) : null,
    };

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    return res.status(200).json({ visitors, clicks, since: SINCE });
  } catch (e) {
    return res.status(502).json({ error: 'Stats unavailable' });
  }
};

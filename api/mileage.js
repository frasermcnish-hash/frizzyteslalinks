// Private lease mileage tracker for the admin area. Every request needs the admin PIN.
// GET    /api/mileage                 -> { lease, readings: [{id, date, miles}] } oldest first
// POST   /api/mileage {date, miles}   -> adds a reading (replaces any reading on the same date)
// DELETE /api/mileage {id}            -> removes a reading
const crypto = require('crypto');
const { redis, configured, checkPin, readBody } = require('./_lib');

const KEY = 'ftl:mileage';
const LEASE = { start: '2026-05-26', end: '2030-05-26', limit: 60000, startMiles: 0 };
const SEED = [
  { id: 'seed-2026-07-15', date: '2026-07-15', miles: 2279 },
  { id: 'seed-2026-10-20', date: '2026-10-20', miles: 4803 },
];

async function load() {
  const [got] = await redis([['GET', KEY]]);
  if (got.result) { try { return JSON.parse(got.result); } catch (e) { /* fall through */ } }
  await redis([['SET', KEY, JSON.stringify(SEED), 'NX']]);
  return SEED.slice();
}
const save = list => redis([['SET', KEY, JSON.stringify(list)]]);
const sortList = list => list.sort((a, b) => a.date.localeCompare(b.date));

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!configured) return res.status(503).json({ error: 'Storage is not connected.' });
  try {
    const auth = await checkPin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    let list = await load();

    if (req.method === 'POST') {
      const b = await readBody(req);
      const date = String(b.date || '');
      const miles = Math.round(Number(b.miles));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) return res.status(400).json({ error: 'Choose a valid date.' });
      if (date < LEASE.start) return res.status(400).json({ error: 'That date is before the lease started (26 May 2026).' });
      if (!Number.isFinite(miles) || miles < 0 || miles > 500000) return res.status(400).json({ error: 'Enter the odometer reading in miles.' });
      const others = list.filter(r => r.date !== date);
      const before = others.filter(r => r.date < date).pop();
      const after = others.find(r => r.date > date);
      if (before && miles < before.miles) return res.status(400).json({ error: 'That is lower than your ' + before.date + ' reading of ' + before.miles.toLocaleString('en-GB') + ' miles.' });
      if (after && miles > after.miles) return res.status(400).json({ error: 'That is higher than your later ' + after.date + ' reading of ' + after.miles.toLocaleString('en-GB') + ' miles.' });
      list = sortList(others.concat({ id: crypto.randomBytes(5).toString('hex'), date, miles }));
      await save(list);
    } else if (req.method === 'DELETE') {
      const { id } = await readBody(req);
      list = list.filter(r => r.id !== id);
      await save(list);
    } else if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, POST, DELETE');
      return res.status(405).end();
    }
    return res.status(200).json({ lease: LEASE, readings: sortList(list) });
  } catch (e) {
    return res.status(502).json({ error: 'The mileage tracker is unavailable right now.' });
  }
};

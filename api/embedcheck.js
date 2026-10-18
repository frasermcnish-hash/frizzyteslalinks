// Checks whether Tesla Ships allows itself to be shown inside another page (iframe).
// GET /api/embedcheck -> { embeddable: true|false }
const URL_ = 'https://tesla.propl.eu/';

module.exports = async (req, res) => {
  let embeddable = false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(URL_, { signal: ctrl.signal, headers: { 'User-Agent': 'FrizzysTeslaLinks/1.0 (+https://frizzyteslalinks.vercel.app)' } });
    clearTimeout(t);
    const xfo = (r.headers.get('x-frame-options') || '').toLowerCase();
    const csp = (r.headers.get('content-security-policy') || '').toLowerCase();
    const fa = (csp.match(/frame-ancestors([^;]*)/) || [])[1];
    embeddable = r.ok && !xfo && (!fa || /\*|frizzyteslalinks\.vercel\.app/.test(fa));
  } catch (e) { embeddable = false; }
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json({ embeddable });
};

// Tesla news ticker: the 5 newest headlines from Electrek (Tesla) and Not a Tesla App RSS feeds.
// GET /api/news -> { items: [{title, link, source, ts}] }
const FEEDS = [
  { source: 'Electrek', url: 'https://electrek.co/guides/tesla/feed/' },
  { source: 'Not a Tesla App', url: 'https://www.notateslaapp.com/rss' },
];

const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();
const tag = (xml, name) => { const m = xml.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>', 'i')); return m ? m[1] : ''; };

async function readFeed(feed) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(feed.url, { signal: ctrl.signal, headers: { 'User-Agent': 'FrizzysTeslaLinks/1.0 (+https://frizzyteslalinks.vercel.app)', Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!r.ok) return [];
    const xml = await r.text();
    return (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).slice(0, 10).map(it => {
      const link = decode(tag(it, 'link'));
      const ts = Date.parse(decode(tag(it, 'pubDate'))) || 0;
      return { title: decode(tag(it, 'title')).slice(0, 200), link, source: feed.source, ts };
    }).filter(i => i.title && /^https:\/\//.test(i.link));
  } catch (e) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  const lists = await Promise.all(FEEDS.map(readFeed));
  const items = lists.flat().sort((a, b) => b.ts - a.ts).slice(0, 5);
  res.setHeader('Cache-Control', items.length ? 'public, s-maxage=900, stale-while-revalidate=3600' : 'public, s-maxage=60');
  return res.status(200).json({ items });
};

// One-time changes to the saved list of links. Each runs once (tracked in Redis by its id),
// the next time the links are requested. They also apply to data/links.json by hand.
const NEW_LINKS = {
  track: [
    { id: 'tesla-com-en-gb-support-delivery-day', code: 'DAY', title: 'Tesla Delivery Day guide', desc: "Tesla's UK guide to preparing for handover", url: 'https://www.tesla.com/en_gb/support/delivery-day', host: 'tesla' },
  ],
  chats: [
    { id: 'teslaowners-uk', code: 'TOUK', title: 'Tesla Owners UK', desc: 'The official UK owners club: events, meet-ups and advice', url: 'https://teslaowners.uk/', host: 'teslaowners' },
  ],
  resources: [
    { id: 'notateslaapp-com-software-updates', code: 'OTA', title: 'Software update notes', desc: 'What each Tesla software update brings', url: 'https://www.notateslaapp.com/software-updates/', host: 'notateslaapp' },
    { id: 'teslafi-com', code: 'LOG', title: 'TeslaFi', desc: 'Logs every drive and charge. Paid after a 14-day free trial', url: 'https://www.teslafi.com/', host: 'teslafi' },
    { id: 'github-com-teslamate-org-teslamate', code: 'MATE', title: 'TeslaMate', desc: 'Free, open-source data logger you run yourself', url: 'https://github.com/teslamate-org/teslamate', host: 'github' },
  ],
};
const CHARGING = {
  id: 'charging', title: 'Charging at home & away', blurb: 'Superchargers, home tariffs and grants.', layout: 'rows',
  links: [
    { id: 'zapmap-com-charge-points-public-charging-point-networks-tesla-network', code: 'ZAP', title: 'Zapmap: Tesla Superchargers', desc: 'UK Supercharger sites, prices and which are open to all EVs', url: 'https://www.zapmap.com/charge-points/public-charging-point-networks/tesla-network/', host: 'zapmap' },
    { id: 'electrifying-com-best-ev-tariffs', code: 'TARIFF', title: 'Best EV home tariffs', desc: 'Electrifying.com comparison of UK home charging tariffs', url: 'https://electrifying.com/blog/knowledge-hub/best-ev-electricity-tariffs-the-top-energy-tariffs-for-your-electric-car', host: 'electrifying' },
    { id: 'gov-uk-ev-chargepoint-grants', code: 'GRANT', title: 'EV chargepoint grant', desc: 'Up to £500 towards a home charger if you rent or own a flat', url: 'https://www.gov.uk/government/collections/government-grants-for-low-emission-vehicles', host: 'gov.uk' },
  ],
};

function addResources(data) {
  const sections = data.sections;
  const urls = new Set(sections.flatMap(s => s.links.map(l => l.url.replace(/\/$/, ''))));
  const fresh = l => !urls.has(l.url.replace(/\/$/, ''));
  for (const id in NEW_LINKS) {
    const s = sections.find(x => x.id === id);
    if (s) s.links.push(...NEW_LINKS[id].filter(fresh));
  }
  if (!sections.some(s => s.id === 'charging')) {
    const charging = Object.assign({}, CHARGING, { links: CHARGING.links.filter(fresh) });
    const at = sections.findIndex(s => s.id === 'resources');
    sections.splice(at >= 0 ? at : sections.length, 0, charging);
  }
  // The Octopus referral moved to the "Need juice?" button.
  data.sections = sections.filter(s => s.id !== 'extras');
  return data;
}

const YATST = { id: 'yatst-distl-it', code: 'YATST', title: 'YATST ship tracker', desc: 'Yet Another Tesla Ship Tracker: find your ship by name or VIN', url: 'https://yatst.distl.it/', host: 'distl.it', added: '2026-10-25' };
function addYatst(data) {
  const has = data.sections.some(s => s.links.some(l => l.url.replace(/\/$/, '') === 'https://yatst.distl.it'));
  if (!has) {
    const ships = data.sections.find(s => s.id === 'ships') || data.sections[0];
    ships.links.push(Object.assign({}, YATST));
  }
  return data;
}

module.exports = [
  { id: '2026-10-12-resources', apply: addResources },
  { id: '2026-10-25-yatst', apply: addYatst },
];

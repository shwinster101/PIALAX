// PIA-147: v2 layout gate at 360/390/430, light/dark; legacy UI checks retired.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import { format } from 'node:util';

const ROOT = process.argv[2] || process.cwd();

// Resolving Playwright is deliberately fussy: this repo has no package.json,
// so the module is only ever installed globally, and ESM `import` does NOT
// honour NODE_PATH the way `require.resolve` does. Resolve a concrete path
// with createRequire (seeded with the global root), then import by file URL.
async function loadPlaywright() {
  const roots = [];
  try { roots.push(execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch { /* npm absent */ }
  roots.push('/usr/lib/node_modules', '/usr/local/lib/node_modules');
  if (process.env.NODE_PATH) roots.unshift(...process.env.NODE_PATH.split(path.delimiter));

  // Playwright ships as CommonJS, so an ESM `import` hands back
  // { default: module.exports } — unwrap that rather than reading `chromium`
  // off the namespace object, where it does not exist.
  const unwrap = (m) => (m && m.chromium ? m : (m && m.default && m.default.chromium ? m.default : null));

  for (const name of ['playwright', 'playwright-core']) {
    for (const root of roots.filter(Boolean)) {
      try {
        const req = createRequire(path.join(root, 'noop.js'));
        const got = unwrap(req(name));
        if (got) return got;
      } catch { /* try the next root */ }
    }
    try { const got = unwrap(await import(name)); if (got) return got; } catch { /* keep looking */ }
  }
  return null;
}

const pw = await loadPlaywright();
if (!pw) {
  console.error('FAIL: Playwright is required for viewport verification');
  process.exit(1);
}
const { chromium } = pw;

const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
];

let passCount = 0;
let failCount = 0;
const ok = (m) => { console.log('  OK  ' + m); passCount++; };
const bad = (m) => { console.log('  XX  ' + m); failCount++; };
// PIA-165: independent passes run at once (inPasses, at most PASSES together): a line a pass prints is kept in its own list and
// printed in pass order once that pass and every one before it are done, so the log reads as the passes did one by one
const PASSES = 3, PASS = new AsyncLocalStorage(), rawLog = console.log.bind(console);
console.log = (...a) => { const s = PASS.getStore(); if (s) s.push(format(...a)); else rawLog(...a); };
async function inPasses(tasks, limit = PASSES) {
  const outs = tasks.map(() => []), done = tasks.map(() => false);
  let next = 0, printed = 0;
  const flush = () => { while (printed < tasks.length && done[printed]) outs[printed++].forEach((l) => rawLog(l)); };
  const lane = async () => {
    while (next < tasks.length) {
      const i = next++;
      await PASS.run(outs[i], async () => { try { await tasks[i](); } catch (e) { bad('pass ' + (i + 1) + ' of ' + tasks.length + ' threw: ' + (e && e.stack ? e.stack : String(e))); } });
      done[i] = true; flush();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, lane));
}

const execPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  || '/opt/pw-browsers/chromium';

async function launch() {
  // Prefer the sandbox's pre-installed Chromium; fall back to whatever
  // Playwright resolves on a normal dev machine.
  try {
    return await chromium.launch({ executablePath: execPath });
  } catch {
    return await chromium.launch();
  }
}

const browser = await launch();

console.log('▶ test-viewport: mobile layout regression suite');

// ---- PIA-134: app.html, the v2 shell, at 360 / 390 / 430 in light and dark ----
// PIA-135 adds the Ideas states: the organizer's total and ⏳ cue, the list-share sheet, the receiving sheet (with
// ⤓ Save, and with nothing new).
// Every state the shell can reach (empty, the list with its shelf open, Family, a trip view with eight long
// names, Map, Calendar, ⓘ, ⚙ and P-link) must have no horizontal scroll, ≥44px targets with accessible names,
// and the light or dark token set. The Worker is a route over the repo's fixtures; nothing else is reachable.
{
  const fs = await import('node:fs');
  const W = 'https://pialax-proxy.ashwinyedavalli.workers.dev';
  const fx = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', n), 'utf8'));
  const docs = {};
  ['idea-diwali.json', 'idea-tahoe.json', 'idea-8members.json', 'idea-undated.json', 'idea-thanksgiving-legacy.json', 'idea-lax-local.json'].forEach((f) => { const d = fx(f); docs[d.id] = d; });
  // PIA-137: Diwali moved to Peoria with its dates set: the organizer's 🎫 marks and Book, a host (Mom & Dad, not answered yet),
  // and my own sheet with the PIA | ORD airport cells (home from ORD)
  const LKV = 'lkViewportLockedPIA001';
  docs[LKV] = (() => {
    const d = JSON.parse(JSON.stringify(docs.dwDiwaliRaleigh2026a01)); d.id = LKV; d.idea.title = '🎄 Christmas in Peoria'; d.idea.destination = { city: 'Peoria', airport: 'PIA' };
    d.idea.dates.departure = '2026-12-22'; d.idea.dates.return = '2026-12-27'; d.idea.notes = '📌2026-12-25'; delete d.responses['momdad-k3']; d.responses['ashwin-p8'].leave_from = 'ORD';
    d.decision = { stage: 'chosen', chosen: { airport: 'PIA', city: 'Peoria', departure: '2026-12-22', return: '2026-12-27' }, chosen_at: '2026-10-16T00:00:00.000Z', estimate_total: null, actual_total: null, booked_at: null, delta_pct: null };
    return d;
  })();
  // PIA-139: the 8-member long-name trip with its dates set and every traveler booked (🏁 Done): times for the pickups (a ⏱ run
  // on 12/11), the hosts not answered yet, so 💵 asks first
  const BKV = 'bkViewportBookedDone01';
  docs[BKV] = (() => {
    const d = JSON.parse(JSON.stringify(docs.m8GrandmaNinetieth0c03)); d.id = BKV;
    d.decision = { stage: 'chosen', chosen: { airport: 'SAV', city: 'Savannah', departure: '2026-12-11', return: '2026-12-14' }, chosen_at: '2026-10-16T00:00:00.000Z', estimate_total: null, actual_total: null, booked_at: null, delta_pct: null };
    ['bartholomewmontgomeryfitzgera-dj', 'anastasiakonstantinopoulou-x1', 'maximilianoyelaranwhitfield-5u', 'samlee-sb', 'oluwaseunadebayorichardson-ew'].forEach((c) => { d.responses[c].booked = true; });
    d.responses['bartholomewmontgomeryfitzgera-dj'].note = '🛬15:10 🛫18:05 ' + d.responses['bartholomewmontgomeryfitzgera-dj'].note;
    d.responses['anastasiakonstantinopoulou-x1'].note = '🛬15:40';
    d.responses['oluwaseunadebayorichardson-ew'].note = '📞 🛬15:05 🛫20:00';
    // PIA-151: Sam Lee (booked, no landing time yet) flies in on the board's last day: his ––:–– sits at the track's right edge
    d.responses['samlee-sb'].available_from = '2026-12-14'; d.responses['samlee-sb'].available_to = '2026-12-14';
    return d;
  })();
  // PIA-139 fix pass: the same Done trip on Bartholomew's phone (his booked bar), and paid (💵 $1,490, ✎; times 🔒)
  const BKM = 'bkViewportBookedMine02', BKP = 'bkViewportBookedPaid03';
  docs[BKM] = Object.assign(JSON.parse(JSON.stringify(docs[BKV])), { id: BKM });
  docs[BKP] = (() => { const d = JSON.parse(JSON.stringify(docs[BKV])); d.id = BKP; d.decision.stage = 'booked'; d.decision.actual_total = 1490; d.decision.booked_at = '2026-10-17T00:00:00.000Z'; return d; })();
  // PIA-140 fix pass: the Diwali family a week later in Peoria, Mom & Dad flying in from SEA, Ashwin and Anjo open-jaw (into PIA, home
  // from ORD), so the board's price column holds a 5-digit sum ($10,987), a 5-digit partial one ($10,987+) and a 4-digit one ($1,387+)
  const DWJ = 'dwViewportOpenJawSum05';
  docs[DWJ] = (() => {
    const d = JSON.parse(JSON.stringify(docs.dwDiwaliRaleigh2026a01)); d.id = DWJ; d.idea.dates.departure = '2026-11-13'; d.idea.dates.return = '2026-11-16';
    d.idea.destination = { city: 'Peoria', airport: 'PIA' };
    d.idea.members.find((x) => x.code === 'momdad-k3').airport = 'SEA';
    d.responses['momdad-k3'] = Object.assign({}, d.responses['momdad-k3'], { origin: 'SEA' });
    d.responses['ashwin-p8'] = Object.assign({}, d.responses['ashwin-p8'], { arrive_at: 'PIA', leave_from: 'ORD' });
    d.responses['anjo-z5'] = { member: 'anjo-z5', status: 'in', origin: 'LGA', available_from: '', available_to: '', note: '', arrive_at: 'PIA', leave_from: 'ORD', updated_at: '2026-10-12T00:00:00.000Z' };
    return d;
  })();
  // PIA-141: Diwali with no 📌 and Anjo's own 11/05–11/10 (longer than the stay): 15 candidate weeks on 3 pages, each ⚠🗽, ⟦◀ ▶⟧
  const CHV = 'chViewportCheapWeek006';
  docs[CHV] = (() => {
    const d = JSON.parse(JSON.stringify(docs.dwDiwaliRaleigh2026a01)); d.id = CHV; d.idea.title = '📉 Diwali, any week'; d.idea.notes = '';
    d.responses['anjo-z5'] = { member: 'anjo-z5', status: 'in', origin: 'LGA', available_from: '2026-11-05', available_to: '2026-11-10', note: '', arrive_at: '', leave_from: '', updated_at: '2026-10-12T00:00:00.000Z' };
    return d;
  })();
  // PIA-142: a past trip (last September's Tahoe) for the Family board's 🗄 columns, and a dropped one (never a column)
  // PIA-156: the 8-member trip at a place none of them lives, 🔒, two booked: the key's ✈ Booked row and a ⏳ Waiting row of six
  // (+N where the row is full, Remind at its end) on the organizer's phone (opened by its link near the end, so no list changes)
  const E8V = 'e8ViewportKeyWaiting09';
  docs[E8V] = (() => {
    const d = JSON.parse(JSON.stringify(docs.m8GrandmaNinetieth0c03)); d.id = E8V; d.idea.destination = { city: 'New Orleans', airport: 'MSY' };
    Object.keys(d.responses).forEach((c) => { d.responses[c].status = 'in'; d.responses[c].booked = false; });
    d.responses['bartholomewmontgomeryfitzgera-dj'].booked = true; d.responses['anastasiakonstantinopoulou-x1'].booked = true;
    d.decision = { stage: 'chosen', chosen: { airport: 'MSY', city: 'New Orleans', departure: d.idea.dates.departure, return: d.idea.dates.return }, chosen_at: '2026-10-16T00:00:00.000Z', estimate_total: null, actual_total: null, booked_at: null, delta_pct: null };
    return d;
  })();
  // PIA-157: "P town" as the family has it (📍ORD, 🔒, Mom & Dad hosting at PIA, Ashwin booked 14:35 / 15:30, Anjo In) on the organizer's
  // phone, and a rides trip of 8 (a host at PIA, seven booked at ORD or PIA) on its host's phone; both opened by their link near the end
  const PTV = 'ptViewportPTownRides10', R8V = 'r8ViewportEightRides11';
  docs[PTV] = (() => {
    const d = JSON.parse(JSON.stringify(docs.dwDiwaliRaleigh2026a01)); d.id = PTV; d.idea.title = '🦃 P town thanksgiving'; d.idea.destination = { city: 'Chicago', airport: 'ORD' };
    d.idea.dates.departure = '2026-11-20'; d.idea.dates.return = '2026-11-30'; d.idea.notes = ''; delete d.responses['momdad-k3'];
    d.responses['ashwin-p8'] = Object.assign({}, d.responses['ashwin-p8'], { booked: true, note: '🛬14:35 🛫15:30' });
    d.responses['anjo-z5'] = { member: 'anjo-z5', status: 'in', origin: 'LGA', available_from: '', available_to: '', note: '', arrive_at: '', leave_from: '', updated_at: '2026-10-12T00:00:00.000Z' };
    d.decision = { stage: 'chosen', chosen: { airport: 'ORD', city: 'Chicago', departure: '2026-11-20', return: '2026-11-30' }, chosen_at: '2026-10-16T00:00:00.000Z', estimate_total: null, actual_total: null, booked_at: null, delta_pct: null };
    return d;
  })();
  docs[R8V] = (() => {
    const d = JSON.parse(JSON.stringify(docs.m8GrandmaNinetieth0c03)); d.id = R8V; d.idea.destination = { city: 'Chicago', airport: 'ORD' };
    d.idea.dates.departure = '2026-11-20'; d.idea.dates.return = '2026-11-30'; d.idea.notes = '';
    const host = d.idea.members.find((x) => x.code === 'guadalupehernndezvillanueva-5m'); host.airport = 'PIA';
    d.idea.members.filter((x) => x !== host).forEach((x, i) => {
      d.responses[x.code] = Object.assign({}, d.responses[x.code] || {}, { member: x.code, status: 'in', origin: '', available_from: '', available_to: '', arrive_at: i % 3 === 0 ? 'PIA' : '', leave_from: '', booked: true, updated_at: '2026-10-12T00:00:00.000Z',
        note: '🛬' + ['08:10', '11:20', '13:05', '16:40', '19:15', '21:30', '23:10'][i] + ' 🛫' + ['06:30', '09:45', '12:15', '14:50', '17:20', '19:40', '22:05'][i] });
    });
    d.responses[host.code] = { member: host.code, status: 'in', origin: 'PIA', available_from: '', available_to: '', note: '', arrive_at: '', leave_from: '', updated_at: '2026-10-12T00:00:00.000Z' };
    d.decision = { stage: 'chosen', chosen: { airport: 'ORD', city: 'Chicago', departure: '2026-11-20', return: '2026-11-30' }, chosen_at: '2026-10-16T00:00:00.000Z', estimate_total: null, actual_total: null, booked_at: null, delta_pct: null };
    return d;
  })();
  // PIA-158: P town with Nebby flying both ways (Ashwin's 🐈ad) and Mom & Dad In with a note: their face carries ×2 over the bubble, 🐕
  // Kona beside it and 📝 under it (the tight corner), on Ashwin's phone (opened by its link near the end)
  const PTN = 'ptViewportPTownPets012';
  docs[PTN] = (() => {
    const d = JSON.parse(JSON.stringify(docs[PTV])); d.id = PTN;
    d.responses['ashwin-p8'] = Object.assign({}, d.responses['ashwin-p8'], { note: '🛬14:35 🛫15:30 🐈ad' });
    d.responses['momdad-k3'] = { member: 'momdad-k3', status: 'in', origin: 'PIA', available_from: '', available_to: '', note: 'Turkey is on us', arrive_at: '', leave_from: '', updated_at: '2026-10-12T00:00:00.000Z' };
    return d;
  })();
  // PIA-159 (fix pass): P town with the real flights (Ashwin ORD 2:35 PM / 3:47 PM with Nebby, Anjo MDW 10:30 PM / 5:10 PM) and every
  // ride Mom & Dad's: on Mom & Dad's phone (all set: 🎊 on its first open from the card) and on Ashwin's own (no key; his 🚌 / 🚙)
  const PT9V = 'p9ViewportPTownAllSet1', PT9A = 'p9ViewportPTownAshwin1';
  docs[PT9V] = (() => {
    const d = JSON.parse(JSON.stringify(docs[PTV])); d.id = PT9V;
    d.responses['ashwin-p8'] = Object.assign({}, d.responses['ashwin-p8'], { booked: true, note: '🛬14:35 🛫15:47 🐈ad' });
    d.responses['anjo-z5'] = Object.assign({}, d.responses['anjo-z5'], { booked: true, note: '🛬22:30 🛫17:10 🛬MDW 🛫MDW' });
    d.responses['momdad-k3'] = { member: 'momdad-k3', status: 'in', origin: 'PIA', available_from: '', available_to: '', note: '🚗ashwin-p8.aORD1120,anjo-z5.aMDW1120,ashwin-p8.dORD1130,anjo-z5.dMDW1130', arrive_at: '', leave_from: '', updated_at: '2026-10-12T00:00:00.000Z' };
    return d;
  })();
  docs[PT9A] = Object.assign(JSON.parse(JSON.stringify(docs[PT9V])), { id: PT9A });
  // PIA-161: the same P town with every leg booked and nobody driving yet (Mom & Dad's note empty: each leg "🚗?"), on Mom & Dad's phone
  const PT9O = 'p9ViewportPTownOpenRd1';
  docs[PT9O] = (() => { const d = JSON.parse(JSON.stringify(docs[PT9V])); d.id = PT9O; d.responses['momdad-k3'].note = ''; return d; })();
  const PSV = 'psViewportPastTahoe007', DRV = 'drViewportDroppedTr008';
  docs[PSV] = (() => { const d = JSON.parse(JSON.stringify(docs.thTahoeSkiWeekend26b02)); d.id = PSV; d.idea.dates.departure = '2026-09-11'; d.idea.dates.return = '2026-09-14'; return d; })();
  docs[DRV] = (() => { const d = JSON.parse(JSON.stringify(docs.lxBeachWeekendLAX00d05)); d.id = DRV; d.decision.stage = 'dropped'; return d; })();
  const ids = Object.keys(docs).filter((id) => id !== E8V && id !== PTV && id !== R8V && id !== PTN && id !== PT9V && id !== PT9A && id !== PT9O), KEY = 'pialax-test-edit-key-0123456789abcdefghijk', DW = 'dwDiwaliRaleigh2026a01', M8 = 'm8GrandmaNinetieth0c03', CYV = 'cyCaryShowerUndated004';
  // PIA-135: cached real fares for Diwali, so the organizer's card carries its one total (keys from the model itself)
  const TM = createRequire(import.meta.url)(path.join(path.resolve(ROOT), 'scripts', 'trip-model.js'));
  // PIA-140: the phone has v1's multi-airport flag (the Worker's /account says features.multi_airport), so the keys are the nearby sets
  const NOWMS = Date.parse('2026-10-17T19:00:00Z'), fares = {};
  TM.tripModel(docs[DW], { today: '2026-10-17', now: NOWMS, me: 'ashwin-p8', hasEditKey: true, hasToken: true, multiAirport: true }).travelers.forEach((x, i) => x.keys.forEach((k) => { fares[k.key] = { p: 1234 + 1000 * i, f: NOWMS - 36e5 }; }));
  {
    const mj = TM.tripModel(docs[DWJ], { today: '2026-10-17', now: NOWMS, me: 'ashwin-p8', hasEditKey: true, hasToken: true, multiAirport: true }), tj = (c) => mj.travelers.find((x) => x.code === c);
    fares[tj('momdad-k3').keys[0].key] = { p: 10987, f: NOWMS - 36e5 };   // a round trip: $10,987
    fares[tj('anjo-z5').keys[0].key] = { p: 10987, f: NOWMS - 36e5 };     // her way in only: $10,987+
    fares[tj('ashwin-p8').keys[0].key] = { p: 1387, f: NOWMS - 36e5 };    // his way in only: $1,387+
  }
  // PIA-140: the Worker's /search and /account, stubbed over the repo's SerpAPI fixture: the cheapest offer departs from the last
  // code of the searched set (so a nearby airport can win); nothing leaves the machine
  const SERP = fx('serp-flights.json');
  const serpFor = (u) => {
    const j = JSON.parse(JSON.stringify(SERP)), dep = String(u.searchParams.get('departure_id') || 'LAX').split(','), arr = String(u.searchParams.get('arrival_id') || 'PIA').split(',');
    const all = j.best_flights.concat(j.other_flights), seed = (u.searchParams.get('outbound_date') || '').split('-').reduce((a, b) => a + +b, 0) % 40;
    all.forEach((o, i) => { o.flights[0].departure_airport.id = i === 1 ? dep[dep.length - 1] : dep[0]; o.flights[o.flights.length - 1].arrival_airport.id = arr[0]; o.price += seed; });
    j.price_insights.lowest_price += seed;
    return j;
  };
  const ACCT = { this_month_usage: 41, searches_per_month: 1000, total_searches_left: 959, spend: { serp: { used: 4, cap: 30 }, exact: true }, features: { multi_airport: true } };
  const seed = {
    pialax_fares_v2: JSON.stringify(fares),
    pialax_watchlist_v2: JSON.stringify(ids.map((id) => ({ id, t: '', e: '', at: 1, pin: false, arch: false }))),
    // PIA-136: this phone also organizes the 8-member trip (a join request on a full trip opens its people editor at ⚠ 9/8)
    pialax_idea_keys_v1: JSON.stringify({ [DW]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' }, [M8]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' }, [LKV]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' },
      [CYV]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' }, [BKV]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' },
      [BKP]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' }, [DWJ]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' },
      [CHV]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' }, [E8V]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' }, [PTV]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' } }),   // (PIA-157: + P town)   // PIA-141: the cheapest-week trip (PIA-156: + the key's 8)   // PIA-138: also organizes the undated idea; PIA-139: the Done trip (and its paid copy); PIA-140: the open-jaw sums
    pialax_idea_me_v1: JSON.stringify({ [DW]: 'ashwin-p8', thTahoeSkiWeekend26b02: 'ashwin-l2', [M8]: 'grandmajosephine-nf', [LKV]: 'ashwin-p8', [CYV]: 'ashwin-c3', [BKV]: 'grandmajosephine-nf',
      [BKM]: 'bartholomewmontgomeryfitzgera-dj', [BKP]: 'grandmajosephine-nf', [DWJ]: 'ashwin-p8', [CHV]: 'ashwin-p8', [E8V]: 'grandmajosephine-nf', [PTV]: 'ashwin-p8', [R8V]: 'guadalupehernndezvillanueva-5m', [PTN]: 'ashwin-p8', [PT9V]: 'momdad-k3', [PT9A]: 'ashwin-p8', [PT9O]: 'momdad-k3' }),
    pialax_proxy_token: 'org-token-0123456789abcdefABCDEF', pialax_ui_v1: JSON.stringify({ v1read: 1 }), pialax_multi_airport_v1: '1'
  };
  const LAYOUT = () => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden'; };
    const name = (el) => (el.getAttribute('aria-label') || '').trim() || (el.labels && el.labels[0] && el.labels[0].textContent.trim()) || (el.textContent || '').replace(/\s+/g, ' ').trim();
    const out = { overflow: document.documentElement.scrollWidth - innerWidth, sheetOverflow: 0, small: [], unnamed: [] };
    const sh = document.querySelector('#sheet');
    if (sh && !sh.hidden) out.sheetOverflow = sh.scrollWidth - sh.clientWidth;
    document.querySelectorAll('#screen button, #screen a, #tabbar button, #sheet button, #sheet a, #sheet input, #sheet textarea').forEach((el) => {
      if (!vis(el)) return;
      // a card title is a text button whose overlay covers the whole card: the card is the target
      const box = (el.classList.contains('card-open') ? el.closest('.card') : el).getBoundingClientRect();
      const id = (el.getAttribute('data-act') || el.id || el.className || el.tagName) + '@' + Math.round(box.width) + 'x' + Math.round(box.height);
      if (box.width < 43.5 || box.height < 43.5) out.small.push(id);
      if (!name(el)) out.unnamed.push(id);
    });
    const cs = getComputedStyle(document.body);
    out.bg = cs.backgroundColor; out.ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
    return out;
  };
  const lum = (rgb) => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(rgb || ''); return m ? (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 : -1; };
  // PIA-155: ⋯ More's stage line (run in the page): one line inside the sheet, five small dots on its track with the ring the largest,
  // its word on the same row, and nothing that reads as a control (no border, no fill, the default pointer, inside no button or link);
  // each dot's ring differs from the sheet behind it (light and dark) → '' or what is wrong
  const STAGELINE = () => {
    const l = document.querySelector('#sheet .sline'); if (!l) return 'missing';
    const r = l.getBoundingClientRect(), sh = document.querySelector('#sheet').getBoundingClientRect(), cs = getComputedStyle(l);
    const dots = [...l.querySelectorAll('.strk i')], w = l.querySelector('.sword'), wr = w ? w.getBoundingClientRect() : null;
    const bg = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return ''; };
    if (r.left < sh.left - 0.5 || r.right > sh.right + 0.5 || r.width <= 0) return 'outside the sheet ' + JSON.stringify([r.left, r.right, sh.left, sh.right]);
    if (dots.length !== 5 || dots.some((d) => { const b = d.getBoundingClientRect(); return b.width < 6 || b.width > 16 || Math.abs((b.top + b.bottom) / 2 - (r.top + r.bottom) / 2) > 8; })) return 'five small dots on one row expected';
    const now = l.querySelector('.strk i.now'); if (now && dots.some((d) => d !== now && d.getBoundingClientRect().width >= now.getBoundingClientRect().width)) return 'the ring now should be the largest dot';
    if (!wr || wr.width <= 0 || Math.abs((wr.top + wr.bottom) / 2 - (r.top + r.bottom) / 2) > 8) return 'its word should sit on the dots\' row';
    if (cs.cursor !== 'default' || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 || !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || l.closest('button, a')) return 'it reads as a control';
    const sheetBg = bg(l), ring = dots.map((d) => getComputedStyle(d).borderTopColor);
    if (ring.some((c) => c === sheetBg)) return 'a dot\'s ring is the sheet\'s own colour';
    return '';
  };
  // PIA-156: the key under the board (run in the page): a hairline above it, every row ≥44px tall, its word in the board's name
  // column in secondary ink and whole, every face and Remind a ≥44px target inside the screen, the 28px faces never overlapping,
  // Remind at the row's end, the booked badge (✈) on a light chip in either scheme → {rows, ...} or {bad: what is wrong}
  const KEYCHK = () => {
    const k = document.querySelector('#screen .wk'); if (!k) return { bad: 'no key' };
    const cs = getComputedStyle(k), body = getComputedStyle(document.body).color, W = innerWidth;
    if (!(parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle === 'solid')) return { bad: 'no hairline above the key' };
    const b = document.querySelector('#screen .pb'); if (!b || !(b.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING)) return { bad: 'the key is not under the board' };
    const rows = [...k.querySelectorAll('.wkr')].map((r) => {
      const R = r.getBoundingClientRect(), l = r.querySelector('.wkl'), L = l.getBoundingClientRect(), g = document.createRange(); g.selectNodeContents(l); const T = g.getBoundingClientRect();
      const btns = [...r.querySelectorAll('button')].map((e) => e.getBoundingClientRect()), avs = [...r.querySelectorAll('.wkf .av')].map((e) => e.getBoundingClientRect());
      const rem = r.querySelector('.wkrem'), RR = rem ? rem.getBoundingClientRect() : null, last = avs[avs.length - 1];
      return { word: (l.querySelector('[data-lbl3]') || { textContent: '' }).textContent, h: R.height, faces: avs.length, more: (r.querySelector('.wkn') || { textContent: '' }).textContent, rem: rem ? rem.getAttribute('data-act') : '',
        ink: getComputedStyle(l).color !== body, whole: T.right <= Math.max(L.right, T.right) && T.width <= L.width + 0.5 && L.left >= 0,
        targets: btns.every((x) => x.width >= 43.5 && x.height >= 43.5 && x.left >= -0.5 && x.right <= W + 0.5), apart: avs.every((a, i) => !i || a.left >= avs[i - 1].right - 0.5), sz: avs.every((a) => a.width >= 24 && a.width <= 32),
        remEnd: !RR || !last || RR.left >= last.right - 0.5 };
    });
    const lum = (rgb) => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(rgb || ''); return m ? (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 : -1; };
    const badges = [...document.querySelectorAll('#screen .pb .av .bd [data-k="booked"]')].map((e) => { const c = getComputedStyle(e.closest('.bd')); return { t: e.textContent, bg: lum(c.backgroundColor), fg: lum(c.color) }; });
    return { rows, badges, over: document.documentElement.scrollWidth - W };
  };
  // PIA-160: the type floor and the one grid (run in the page): every visible text with a letter or a digit on the screen and the tab
  // bar and its size (none under 13px), the smallest AM / PM, each board label's size and whether it sits inside its track, the name
  // column's widths (the board's .who, the key's words), the title's left against the bars' day 0, 📍's border → {small, mer, btm, ...}
  const POLISH = () => {
    const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const small = [], seen = new Set();
    ['#screen', '#tabbar'].forEach((q) => { const root = document.querySelector(q); if (!root) return; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const p = n.parentElement; if (!p || seen.has(p) || !/[\p{L}\p{N}]/u.test(n.nodeValue) || !vis(p) || p.closest('.cbar')) continue; seen.add(p); const fs = parseFloat(getComputedStyle(p).fontSize); if (fs < 12.95) small.push(n.nodeValue.trim().slice(0, 12) + ' ' + fs); } });
    const mers = [...document.querySelectorAll('#screen .mer')].filter(vis).map((e) => parseFloat(getComputedStyle(e).fontSize));
    const labs = [...document.querySelectorAll('#screen .pb .track .btm')].filter(vis);
    const out = labs.filter((e) => { const b = e.getBoundingClientRect(), t = e.closest('.track').getBoundingClientRect(); return b.left < t.left - 0.5 || b.right > t.right + 0.5 || b.top < t.top - 0.5 || b.bottom > t.bottom + 0.5; }).length;
    const who = [...document.querySelectorAll('#screen .pb-row .who')].map((e) => e.getBoundingClientRect().width), wkl = [...document.querySelectorAll('#screen .wk .wkl')].map((e) => e.getBoundingClientRect().width);
    const whoL = [...document.querySelectorAll('#screen .pb-row .who')].map((e) => e.getBoundingClientRect().left), wklL = [...document.querySelectorAll('#screen .wk .wkl')].map((e) => e.getBoundingClientRect().left);
    const tr = document.querySelector('#screen .pb-row .track'), tt = document.querySelector('#screen .thead .thd'), pin = document.querySelector('#screen .thead .chip.dchip'), pc = pin ? getComputedStyle(pin) : null;
    // (the board's names, whole or "Mom&Dad", never cut, at their size; the drive primary's content from 🚗 to the faces, and its button)
    const names = [...document.querySelectorAll('#screen .pb-row .who .fn')].map((e) => ({ t: e.textContent, fs: Math.round(parseFloat(getComputedStyle(e).fontSize) * 10) / 10, cut: e.scrollWidth > e.clientWidth + 1 }));
    const pb = document.querySelector('#screen .btn.pri.drv'), dg = pb && pb.querySelector('.dg'), dz = pb && (pb.querySelector('.drvf .av') ? pb.querySelector('.drvf') : pb.querySelector('.dst'));
    return { small, mer: mers.length ? Math.min(...mers) : 99, btm: labs.map((e) => Math.round(parseFloat(getComputedStyle(e).fontSize) * 100) / 100), out, who, wkl,
      colOk: whoL.concat(wklL).every((x) => Math.abs(x - whoL[0]) < 0.6), title: tt ? Math.round(tt.getBoundingClientRect().left) : -1, bars: tr ? Math.round(tr.getBoundingClientRect().left) : -2,
      pin: pc ? pc.borderTopWidth + '|' + pc.borderTopStyle : 'none', over: document.documentElement.scrollWidth - innerWidth, names,
      prim: dg && dz ? Math.round(dz.getBoundingClientRect().right - dg.getBoundingClientRect().left) : -1, primIn: pb ? pb.getBoundingClientRect().right <= innerWidth + 0.5 && pb.scrollWidth <= pb.clientWidth + 1 : false };
  };
  // (the board's names drawn on a phone are whole, ≥13px; a phone's own name is the fitter's to drop, so Mom & Dad's is checked where
  // another phone draws it)
  const namesOk = (p) => p.names.length >= 2 && p.names.every((n) => !n.cut && n.fs >= 13);
  // PIA-160 (fix 2): the times echo beside its share symbol (run in the page): every half (.nw) and the ≥44px share button inside the
  // toast's pill, no half under the button, the pill inside the screen (and the desktop column), nothing scrolling inside it
  const TELLBOX = () => {
    const t = document.querySelector('#toast'); if (!t || t.hidden) return null;
    const T = t.getBoundingClientRect(), b = t.querySelector('[data-act="toastshare"]'), B = b ? b.getBoundingClientRect() : null, app = document.querySelector('#app').getBoundingClientRect();
    const nws = [...t.querySelectorAll('.ech .nw')].map((e) => e.getBoundingClientRect());
    const inT = (r) => r.left >= T.left - 0.5 && r.right <= T.right + 0.5 && r.top >= T.top - 0.5 && r.bottom <= T.bottom + 0.5;
    return { w: innerWidth, root: parseFloat(getComputedStyle(document.documentElement).fontSize), label: b ? b.getAttribute('aria-label') : '', halves: nws.length, text: t.textContent.replace(/\s+/g, ' ').trim(),
      btn: !!B && B.width >= 43.5 && B.height >= 43.5 && inT(B), nws: nws.length > 0 && nws.every(inT), clear: !!B && nws.every((r) => r.right <= B.left + 0.5 || r.bottom <= B.top + 0.5 || r.top >= B.bottom - 0.5),
      below: !!B && nws.length > 0 && B.top >= Math.max(...nws.map((r) => r.bottom)) - 0.5,
      pill: T.left >= Math.max(0, app.left) - 0.5 && T.right <= Math.min(innerWidth, app.right) + 0.5, scroll: t.scrollWidth - t.clientWidth,
      rects: { toast: [T.left, T.right].map(Math.round), btn: B ? [B.left, B.right].map(Math.round) : null, nws: nws.map((r) => [r.left, r.right].map(Math.round)) } };
  };
  const tellOk = (g) => !!g && g.halves === 2 && /✓$/.test(g.text) && /^Tell/.test(g.label) && g.btn && g.nws && g.clear && g.pill && g.scroll <= 0;
  // PIA-161: the large-text fit, walked at the common phone widths and an iPhone's Text Size steps as a root (17 the default, 19, 21,
  // 23: html{font-size:Npx!important}, as above). Each in-page measure clusters an element's parts into lines by their vertical centre
  // (within 4px), so "one line" and "together" mean what a person sees. LEGFIT (P-rides): the sheet's and each run's sideways scroll,
  // each run card inside the sheet's content box, 🛬 / 🛫 beside ⏰, Drive's distance from the header's right edge and whether it is on the ⏰ line, each run's columns (its one-line
  // legs, and its two-line legs, share the code's left and the time's right edge, ±1); each leg's lines, the code with its time and the
  // time with its driver on one line, a wrapped tail's indent, the 🐈 glyph inside its box
  const FIT_W = [320, 360, 375, 390, 393, 402, 414, 430, 440], FIT_R = [17, 19, 21, 23];
  const sizeTo = async (page, vp, w, rp) => {
    await page.setViewportSize({ width: w, height: vp.height });
    await page.evaluate((px) => { [...document.querySelectorAll('style[data-fitroot]')].forEach((s) => s.remove()); if (px !== 17) { const s = document.createElement('style'); s.setAttribute('data-fitroot', ''); s.textContent = 'html{font-size:' + px + 'px!important}'; document.head.appendChild(s); } }, rp);
    await page.waitForTimeout(150);
  };
  const sizeBack = async (page, vp) => { await page.evaluate(() => [...document.querySelectorAll('style[data-fitroot]')].forEach((s) => s.remove())); await page.setViewportSize({ width: vp.width, height: vp.height }); await page.waitForTimeout(120); };
  const LEGFIT = () => {
    const R = (e) => e.getBoundingClientRect(), cy = (e) => { const r = R(e); return (r.top + r.bottom) / 2; }, has = (e) => { if (!e) return false; const r = R(e); return r.width > 0 && r.height > 0; };
    const lines = (els) => { const L = []; els.filter(has).map((e) => ({ e, y: cy(e) })).sort((a, b) => a.y - b.y).forEach((p) => { const l = L[L.length - 1]; if (l && Math.abs(p.y - l.y) <= 4) l.items.push(p.e); else L.push({ y: p.y, items: [p.e] }); }); return L; };
    const near = (a, b, d) => !!a && !!b && Math.abs(cy(a) - cy(b)) <= d;
    const sh = document.querySelector('#sheet'), S = R(sh), cs = getComputedStyle(sh);
    // (the sheet's content box: a run card wider than it overhangs the sheet's padding, which neither scroll measure sees)
    const cL = S.left + sh.clientLeft + parseFloat(cs.paddingLeft), cR = S.left + sh.clientLeft + sh.clientWidth - parseFloat(cs.paddingRight);
    const runs = [...sh.querySelectorAll('.rrun')].map((run) => {
      const hd = run.querySelector('.rrh'), gl = hd.querySelector('[data-k="arrive"], [data-k="leave"]'), lv = hd.querySelector('.rlv > [data-k="drive"]') /* PIA-162: 🚗, not ⏰, heads the range */, ctl = hd.querySelector('.rctl');
      const legs = [...run.querySelectorAll('.rleg')].map((lg) => {
        const ap = lg.querySelector('.ap'), tm = lg.querySelector('.tm'), st = lg.querySelector('.rst'), pet = lg.querySelector('.rpet'), L0 = R(lg);
        const L = lines([lg.querySelector('.rnum'), lg.querySelector('.rf, .facebtn'), lg.querySelector('.rpet, .rpx'), ap, tm, st]);
        let petIn = true;
        if (pet) { const g = document.createRange(); g.selectNodeContents(pet.querySelector('[data-k="petfly"]')); const G = g.getBoundingClientRect(), P = R(pet); petIn = G.width > 0 && G.left >= P.left - 0.5 && G.right <= P.right + 0.5; }
        return { n: L.length, apTm: near(ap, tm, 4), tmSt: near(tm, st, 4), indent: L.length === 2 && ap ? Math.round((R(ap).left - L0.left) * 10) / 10 : null, sw: lg.scrollWidth - lg.clientWidth, petIn,
          apL: ap ? R(ap).left : null, tmR: tm ? R(tm).right : null, text: lg.textContent.replace(/\s+/g, ' ').trim() };
      });
      const col = (ls) => { const a = ls.map((l) => l.apL).filter((x) => x != null), t = ls.map((l) => l.tmR).filter((x) => x != null); return (a.length < 2 || Math.max(...a) - Math.min(...a) <= 1) && (t.length < 2 || Math.max(...t) - Math.min(...t) <= 1); };
      return { sw: run.scrollWidth - run.clientWidth, cardIn: R(run).left >= cL - 0.5 && R(run).right <= cR + 0.5, glyph: near(gl, lv, 4), driveR: ctl ? Math.round((R(hd).right - R(ctl).right) * 10) / 10 : null, driveOn: near(ctl, lv, 8),
        colsOk: col(legs.filter((l) => l.n === 1)) && col(legs.filter((l) => l.n === 2)), legs };
    });
    return { over: sh.scrollWidth - sh.clientWidth, runs };
  };
  // (the leg and run assertions at width w and root rp: no scroll; each card inside the sheet's content; the glyph with ⏰; Drive at the right edge; columns; each leg's code
  // with its time and its time with its driver, ≤2 lines, one line from 375px and everywhere at the default size, a wrapped tail 32px
  // in; at 390px and the default size Drive on the 12:05 and 11:15 cards' line and under the overnight card's, from 402px on every line)
  const legFails = (s, f, w, rp) => {
    if (!f || !f.runs.length) return [s + ': no P-rides runs ' + JSON.stringify(f)];
    const out = [], at = s + ' at ' + w + '×' + rp;
    if (f.over > 0) out.push(at + ': the sheet scrolls sideways ' + f.over + 'px');
    f.runs.forEach((r, i) => {
      if (r.sw > 0 || !r.cardIn || !r.glyph || !(r.driveR != null && Math.abs(r.driveR) <= 1.5) || !r.colsOk) out.push(at + ' run ' + (i + 1) + ': ' + JSON.stringify(Object.assign({}, r, { legs: r.legs.length })));
      r.legs.forEach((l) => { if (l.sw > 1 || !l.petIn || !l.apTm || !l.tmSt || l.n > 2 || (l.n !== 1 && (w >= 375 || rp === 17)) || (l.n === 2 && Math.abs(l.indent - 32) > 1)) out.push(at + ' leg "' + l.text + '": ' + JSON.stringify(l)); });
    });
    const on = f.runs.map((r) => r.driveOn);
    if (w === 390 && rp === 17 && JSON.stringify(on) !== '[true,false,true]') out.push(at + ': Drive on its header\'s line should be [12:05 yes, overnight no, 11:15 yes]: ' + JSON.stringify(on));
    if ([402, 414, 430, 440].includes(w) && rp === 17 && !on.every(Boolean)) out.push(at + ': Drive should be on every header\'s line: ' + JSON.stringify(on));
    return out;
  };
  // ROWFIT (P-person): each read row (a booked leg, not its edit row): on one line; its [code time] and its ride glyph together; 🛬 / 🛫
  // and the day together; where [code time] is on a later line, its left against the row's; and [✈ Track ↗ | ☑ I booked]: its scroll,
  // two rows or one, full width when two, inside the sheet's content and ≥44px tall
  const ROWFIT = () => {
    const R = (e) => e.getBoundingClientRect(), cy = (e) => { const r = R(e); return (r.top + r.bottom) / 2; }, near = (a, b) => !!a && !!b && Math.abs(cy(a) - cy(b)) <= 4;
    const sh = document.querySelector('#sheet'), S = R(sh);
    const rows = [...sh.querySelectorAll('.leg.lbk:not(.tedit)')].map((lg) => {
      const g0 = lg.querySelector('.lg0'), ld = lg.querySelector('.ld'), t = lg.querySelector('.tmb, .lt'), g = lg.querySelector('.rgl'), L0 = R(lg);
      const parts = [g0, ld, t, g].filter(Boolean);
      return { one: parts.every((e) => near(e, parts[0])), together: !g || !t || near(g, t), day: near(g0, ld), x2: t && !near(t, g0) ? Math.round((R(t).left - L0.left) * 10) / 10 : null, sw: lg.scrollWidth - lg.clientWidth,
        text: lg.textContent.replace(/\s+/g, ' ').trim() };
    });
    // (bookRow's split: .split.bk, or a build before it, a .split of two holding the booking toggle)
    const split = [...sh.querySelectorAll('.split')].filter((sp) => sp.classList.contains('bk') || (sp.children.length === 2 && !!sp.querySelector(':scope > .tkb'))).map((sp) => { const P = R(sp), k = [...sp.children];
      return { sw: sp.scrollWidth - sp.clientWidth, two: k.length === 2 && !near(k[0], k[1]), full: k.every((b) => Math.abs(R(b).width - P.width) <= 1), inside: k.every((b) => R(b).left >= S.left + 15.5 && R(b).right <= S.right - 15.5 && R(b).height >= 43.5) }; });
    return { over: sh.scrollWidth - sh.clientWidth, rows, split };
  };
  const rowFails = (s, f, w, rp, one) => {
    const out = [], at = s + ' at ' + w + '×' + rp;
    if (!f || !f.rows.length) return [at + ': no booked rows ' + JSON.stringify(f)];
    if (f.over > 0) out.push(at + ': the sheet scrolls sideways ' + f.over + 'px');
    f.rows.forEach((r) => { if (!r.together || !r.day || (r.x2 != null && Math.abs(r.x2) > 1) || r.sw > 1 || (one && !r.one)) out.push(at + ' row "' + r.text + '": ' + JSON.stringify(r)); });
    return out;
  };
  // PILLFIT (the trip page's date pill): "10🌙 🔒" on one line, the pill not scrolling, inside its row
  const PILLFIT = () => {
    const R = (e) => e.getBoundingClientRect(), cy = (e) => { const r = R(e); return (r.top + r.bottom) / 2; };
    const row = document.querySelector('#screen .daterow'), p = row && row.querySelector('.pill'), n = p && p.querySelector('[data-k="nights"]'), l = p && p.querySelector('[data-k="lock"]');
    if (!p || !n || !l) return null;
    const P = R(p), W = R(row);
    return { lockWithNights: Math.abs(cy(n) - cy(l)) <= 4, sw: p.scrollWidth - p.clientWidth, inRow: P.left >= W.left - 0.5 && P.right <= W.right + 0.5 };
  };
  // CARDFIT (a Trips card): the title's words a line apart from each other but never broken inside one (each word's Range one rect),
  // the slot's content inside its box, the slot inside the card and a 44px target, and whether it sits under the title
  const CARDFIT = (id) => {
    const R = (e) => e.getBoundingClientRect(), c = document.querySelector('#screen article.card[data-trip="' + id + '"]');
    if (!c) return null;
    const b = c.querySelector('.card-open'), tn = b && b.firstChild, t = c.querySelector('.card-t'), sl = c.querySelector('.card-t + *'), broken = [];
    if (tn && tn.nodeType === 3) { let i = 0; for (const w of tn.textContent.split(' ')) { const g = document.createRange(); g.setStart(tn, i); g.setEnd(tn, i + w.length); if ([...g.getClientRects()].filter((r) => r.width > 0).length > 1) broken.push(w); i += w.length + 1; } }
    else broken.push('(no title text)');
    if (!sl) return { broken, spill: 99, inCard: false, tap: false, under: null };
    const S = R(sl), C = R(c);
    return { broken, spill: sl.scrollHeight - sl.clientHeight, inCard: S.left >= C.left - 0.5 && S.right <= C.right + 0.5 && S.bottom <= C.bottom + 0.5, tap: S.width >= 43.5 && S.height >= 43.5, under: S.top >= R(t).bottom - 1, cls: sl.className };
  };
  const cardFails = (s, f, w, rp) => (f && !f.broken.length && f.spill <= 1 && f.inCard && f.tap && f.under === (w < 360) ? [] : [s + ' at ' + w + '×' + rp + ': ' + JSON.stringify(f)]);
  // (each PIA-161 group reports its own line, so a run against #160 names every group that fails)
  const fitReport = (g, f) => { if (f.length) bad('PIA-161 ' + g + ' — ' + f.length + ' failing: ' + f.slice(0, 4).join(' · ')); else ok('PIA-161 ' + g); };
  // PIA-160: edges and small text against what is behind them (run in the page; spec §10 (b) EDGES and (c) CONTRAST). edges: every
  // visible control of these kinds whose top border is drawn (opacity 1: a faded, truly disabled control is not one), its edge against
  // the parent's background (composited up to the first opaque one) at ≥3:1; ink: every visible text with a letter or a digit inside
  // these, its colour (with the opacity it is drawn at) against its own background at ≥4.5:1 → {edges, ink, low: [what is under]}
  const EDGE_SEL = '.tool, .fld, .hchip, .tchip, .ans, .notep, .btn:not(.pri), .ampm .segb, .pills .pill, .dtile, .dishes .dchip, .slot, .achip, .leg .tmb, .pricerow .chipq';
  const CONTRAST = (arg) => {
    const P = (c) => { let m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c || ''); if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
      m = /color\(srgb ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)(?: \/ ([\d.]+))?\)/.exec(c || ''); return m ? [m[1] * 255, m[2] * 255, m[3] * 255, m[4] == null ? 1 : +m[4]] : null; };
    const over = (a, b) => [0, 1, 2].map((i) => a[i] * a[3] + b[i] * (1 - a[3])).concat([1]);
    const ground = (from) => { const ls = []; for (let n = from; n; n = n.parentElement) { const c = P(getComputedStyle(n).backgroundColor); if (c && c[3] > 0) { ls.push(c); if (c[3] >= 1) break; } }
      let g = [255, 255, 255, 1]; for (let i = ls.length - 1; i >= 0; i--) g = over(ls[i], g); return g; };
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }, Lu = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const cr = (a, b) => { const x = Lu(a), y = Lu(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const op = (e) => { let o = 1; for (let n = e; n; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; };
    const id = (e) => e.tagName.toLowerCase() + '.' + [...e.classList].join('.') + (e.getAttribute('data-act') ? '[' + e.getAttribute('data-act') + ']' : '');
    const out = { edges: 0, ink: 0, low: [] };
    const R = document.querySelector(arg.root || 'body');
    if (arg.edges && R) R.querySelectorAll(arg.edges).forEach((e) => {
      const cs = getComputedStyle(e), c = P(cs.borderTopColor);
      if (!vis(e) || parseFloat(cs.borderTopWidth) <= 0 || /none|hidden/.test(cs.borderTopStyle) || !c || c[3] === 0 || op(e) < 0.99) return;
      const g = ground(e.parentElement), r = cr(over(c, g), g); out.edges++;
      if (r < 2.95) out.low.push('edge ' + id(e) + ' ' + r.toFixed(2));
    });
    if (arg.ink) { const seen = new Set(); document.querySelectorAll(arg.ink).forEach((root) => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const p = n.parentElement; if (!p || seen.has(p) || !/[\p{L}\p{N}]/u.test(n.nodeValue) || !vis(p) || p.closest('.vh')) continue; seen.add(p);
        const c = P(getComputedStyle(p).color); if (!c) continue; const g = ground(p), o = op(p), r = cr(over([c[0], c[1], c[2], c[3] * o], g), g); out.ink++;
        if (r < 4.45) out.low.push('ink ' + id(p) + ' "' + n.nodeValue.trim().slice(0, 14) + '" ' + r.toFixed(2)); } }); }
    return out;
  };
  const contrastFails = (s, c, want) => (c.low.length || (want.edges && !c.edges) || (want.ink && !c.ink) ? [s + ': ' + JSON.stringify(c)] : []);
  // PIA-156: on a short phone (678px tall, the owner's iPhone with Safari's bars) with the sticky primary: is the price row, and the
  // key's first row with its Remind, wholly above the primary (or the tab bar) before any scrolling? (run in the page, scrolled to top)
  const SHORTCHK = () => {
    const p = document.querySelector('#screen .split.prim'), t = document.querySelector('#tabbar');
    const floor = Math.min(t ? t.getBoundingClientRect().top : innerHeight, p ? p.getBoundingClientRect().top : 1e9);
    const whole = (e) => { const b = e.getBoundingClientRect(); return b.top >= -0.5 && b.bottom <= floor + 0.5; };
    const r0 = document.querySelector('#screen .wk .wkr'), rem = r0 && r0.querySelector('.wkrem'), price = document.querySelector('#screen .pricerow');
    let remHit = null; if (rem) { const R = rem.getBoundingClientRect(), x = document.elementFromPoint(R.left + R.width / 2, R.top + R.height / 2); remHit = !!x && !!x.closest('.wkrem'); }
    return { first: r0 ? whole(r0) : null, firstWord: r0 ? r0.querySelector('.wkl').textContent.replace(/\s+/g, ' ').trim() : '', rem: remHit, price: price ? whole(price) : null, prim: !!p, floor: Math.round(floor) };
  };
  const keyFails = (s, kc, want) => {
    if (kc.bad) return [s + ': ' + kc.bad];
    const out = [], got = kc.rows.map((r) => r.word + ':' + r.faces + r.more + (r.rem ? ':' + r.rem : ''));
    if (want && JSON.stringify(got) !== JSON.stringify(want)) out.push(s + ': the key reads ' + JSON.stringify(got) + ', not ' + JSON.stringify(want));
    kc.rows.forEach((r, i) => { if (r.h < 43.5 || !r.ink || !r.whole || !r.targets || !r.apart || !r.sz || !r.remEnd) out.push(s + ': key row ' + (i + 1) + ' ' + JSON.stringify(r)); });
    if (kc.badges.some((x) => x.t !== '✈' || !(x.bg > 0.6) || !(x.fg >= 0 && x.fg < 0.3))) out.push(s + ': a booked badge is not a legible ✈ on a light chip ' + JSON.stringify(kc.badges));
    if (kc.over > 0) out.push(s + ': horizontal scroll ' + kc.over + 'px');
    return out;
  };
  // PIA-138: P-dates' occlusion gate (run in the page)
  const OCCLUSION = () => {
    const sh = document.querySelector('#sheet'), R = sh.getBoundingClientRect(), save = sh.querySelector('.btn.stick'), hd = sh.querySelector('.sh-hd');
    const sv = save ? save.getBoundingClientRect() : null, hr = hd ? hd.getBoundingClientRect() : null, out = { covered: [], seeThrough: '', lock: null };
    if (save) {
      const cs = getComputedStyle(save), bg = cs.backgroundColor, a = /rgba\([^)]*,\s*([\d.]+)\)/.exec(bg);
      if (+cs.opacity < 1) out.seeThrough = 'opacity ' + cs.opacity; else if (a && +a[1] < 1) out.seeThrough = 'background ' + bg;
    }
    sh.querySelectorAll('button, a[href], input').forEach((el) => {
      if (el === save) return;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cy < R.top || cy > R.bottom || cx < R.left || cx > R.right) return;              // scrolled out of the sheet
      if (sv && cy >= sv.top - 6 && cy <= sv.bottom + 6) return;                          // hidden under the opaque Save
      if (hr && el.closest('.sh-hd') === null && cy <= hr.bottom) return;                  // hidden under the sticky header
      const t = document.elementFromPoint(cx, cy);
      if (!t || !(t === el || el.contains(t))) out.covered.push((el.getAttribute('data-act') || el.className) + '@' + Math.round(cy) + ' under ' + (t ? t.getAttribute('data-act') || t.className || t.tagName : 'nothing'));
    });
    const lock = sh.querySelector('[data-act="dlock"]');
    // (PIA-154: with nothing left to save, 🔒 Lock dates is the sheet's main button itself: whole and in view)
    if (lock) { const r = lock.getBoundingClientRect(), cy = r.top + r.height / 2; out.lock = lock === save ? r.top >= R.top - 0.5 && r.bottom <= Math.min(innerHeight, R.bottom) + 0.5 : cy > (hr ? hr.bottom : R.top) && cy < (sv ? sv.top - 6 : R.bottom); }
    return out;
  };
  // (PIA-165: the six passes, three viewports in light and dark, share nothing: three at a time; one by one they took 265s)
  await inPasses(VIEWPORTS.flatMap((vp) => ['light', 'dark'].map((scheme) => async () => {
      const label = `app.html @ ${vp.name} ${scheme}`;
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, timezoneId: 'America/Los_Angeles' });
      await ctx.route(/^https?:\/\//, (r) => process.env.PIALAX_TEST_APP_URL && r.request().url().startsWith(process.env.PIALAX_TEST_APP_URL) ? r.continue() : r.abort());
      const net = { search: 0, account: 0 };
      await ctx.route(W + '/**', (route) => {
        const q = route.request(), u = new URL(q.url()), id = u.searchParams.get('id');
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, X-Idea-Key, X-Pialax-Token', 'access-control-expose-headers': 'X-Proxy-Cache, X-Fetched-At', 'content-type': 'application/json' };
        if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        // PIA-140: the paid routes answer only the organizer token
        if (u.pathname === '/search' || u.pathname === '/account') {
          if (q.headers()['x-pialax-token'] !== seed.pialax_proxy_token) return route.fulfill({ status: 401, headers: cors, body: '{"code":"no_token"}' });
          if (u.pathname === '/account') { net.account++; return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(ACCT) }); }
          net.search++;
          return route.fulfill({ status: 200, headers: Object.assign({ 'x-proxy-cache': 'MISS', 'x-fetched-at': '2026-10-17T19:00:00.000Z' }, cors), body: JSON.stringify(serpFor(u)) });
        }
        if (!docs[id]) return route.fulfill({ status: 404, headers: cors, body: '{"code":"not_found"}' });
        return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: true, doc: docs[id], organizer: (id === DW || id === M8 || id === LKV || id === CYV || id === BKV || id === BKP || id === DWJ || id === CHV || id === E8V || id === PTV) && q.headers()['x-idea-key'] === KEY }) });
      });
      const page = await ctx.newPage();
      const fails = [];
      try {
        await page.clock.setFixedTime(new Date('2026-10-17T19:00:00Z'));
        // the first visit is the empty phone; the seed lands before the second
        await page.goto((process.env.PIALAX_TEST_APP_URL || pathToFileURL(path.join(ROOT, 'app.html')).href), { waitUntil: 'load' });
        await page.waitForTimeout(150);
        let states = 0;
        const measure = async (s) => {
          states++;
          const r = await page.evaluate(LAYOUT);
          if (r.overflow > 0 || r.sheetOverflow > 0) fails.push(s + ': horizontal scroll ' + r.overflow + '/' + r.sheetOverflow + 'px');
          if (r.small.length) fails.push(s + ': targets under 44px ' + r.small.slice(0, 4).join(', '));
          if (r.unnamed.length) fails.push(s + ': controls without a name ' + r.unnamed.slice(0, 4).join(', '));
          const L = lum(r.bg);
          if (scheme === 'dark' ? !(L >= 0 && L < 0.2) : !(L > 0.8)) fails.push(s + ': body background ' + r.bg + ' is not the ' + scheme + ' token');
          // PIA-138: in P-dates nothing a finger can see is covered: every control whose centre is in view (not under the
          // sticky header or Save) takes a tap there (elementFromPoint), Save is opaque, and 🔒 / 🔓 are in view
          if (await page.getAttribute('#sheet', 'data-popup').catch(() => null) === 'P-dates') {
            const o = await page.evaluate(OCCLUSION);
            if (o.covered.length) fails.push(s + ': P-dates controls covered ' + o.covered.slice(0, 3).join(', '));
            if (o.seeThrough) fails.push(s + ': P-dates Save is see-through (' + o.seeThrough + ')');
            if (o.lock === false) fails.push(s + ': P-dates 🔒/🔓 is not in view without scrolling');
          }
        };
        await measure('empty');
        await page.evaluate((s) => { Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, seed);
        await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
        await measure('list');
        // (PIA-160: the cards' slots and every other control a finger taps on the list keep a ≥3:1 edge in this scheme)
        fails.push(...contrastFails('PIA-160 the list\'s tappable edges', await page.evaluate(CONTRAST, { edges: EDGE_SEL, root: '#screen' }), { edges: true }));
        // (PIA-158: clicked by its selector, found again if a doc arriving redraws the list between finding it and the click)
        const shelf = await page.$('#screen [data-act="shelf"]'); if (shelf) { await page.click('#screen [data-act="shelf"]'); await page.waitForTimeout(100); await measure('list + shelf'); }
        await page.click('#screen [data-act="seg"][data-v="family"]'); await page.waitForTimeout(100); await measure('family');
        // PIA-160: the Family board's names under the faces: none under 13px (a name still wider than its 76px head at 13px is drawn
        // cut there), "Mom & Dad" (or Mom&Dad) whole among them
        const famN = await page.evaluate(() => [...document.querySelectorAll('#screen .board .rowh .fn')].filter((e) => e.getClientRects().length).map((e) => ({ t: e.textContent, fs: Math.round(parseFloat(getComputedStyle(e).fontSize) * 10) / 10, cut: e.scrollWidth > e.clientWidth + 1 })));
        if (!(famN.length >= 2 && famN.every((n) => n.fs >= 13) && famN.some((n) => /^Mom ?& ?Dad$/.test(n.t) && !n.cut))) fails.push('PIA-160 the Family board\'s names should be ≥13px, Mom & Dad whole among them: ' + JSON.stringify(famN));
        // PIA-142: the board's other pages (≤4 trip columns each), 🗄 with the past trip as a column, and the sheet a cell opens
        const tapF = async (sel) => { await page.$eval(sel, (e) => e.click()); await page.waitForTimeout(110); };
        const famCols = async (s) => { const n = await page.$$eval('#screen #fam-board .hd', (es) => es.length); if (n < 1 || n > 4) fails.push(s + ': ' + n + ' trip columns (1–4 a page)'); };
        await famCols('family');
        // PIA-142 fix pass: every mark chip (⚠ 🎫 🏠 📞 📝 on a cell or a face) is light with dark ink in both schemes, so a dark 📞
        // reads on it (it was a dark chip in dark mode); and scrolled down, the column heads sit opaque right under the top row
        const chips = await page.$$eval('#screen .cell .ov, #screen .av .bd', (es) => es.map((e) => { const cs = getComputedStyle(e); return [cs.backgroundColor, cs.color]; }));
        if (!chips.length) fails.push('family: no mark chip drawn to check');
        chips.forEach(([bg, fg]) => { if (!(lum(bg) > 0.6 && lum(fg) >= 0 && lum(fg) < 0.2)) fails.push('family: a mark chip ' + bg + ' with ' + fg + ' is not light with dark ink'); });
        const stick = await page.evaluate(() => {
          const de = document.documentElement; if (de.scrollHeight <= innerHeight + 8) return null;
          window.scrollTo(0, de.scrollHeight);
          const t = document.querySelector('#screen .toprow').getBoundingClientRect(), hd = document.querySelector('#fam-board .hd'), h = hd.getBoundingClientRect(), bg = getComputedStyle(hd).backgroundColor;
          const r = { gap: Math.round(h.top - t.bottom), bg, y: window.scrollY }; window.scrollTo(0, 0); return r;
        });
        if (stick && (Math.abs(stick.gap) > 1 || /rgba\(.*,\s*0\)|transparent/.test(stick.bg))) fails.push('family: scrolled down, the heads are not opaque right under the top row ' + JSON.stringify(stick));
        for (let n = 0; n < 4 && (await page.$('#screen [data-act="fampage"][data-v="1"]:not([aria-disabled="true"])')); n++) { await tapF('#screen [data-act="fampage"][data-v="1"]'); await measure('family page ' + (n + 2)); await famCols('family page ' + (n + 2)); }
        if (await page.$('#screen [data-act="fampast"]')) {
          await tapF('#screen [data-act="fampast"]'); await measure('family 🗄 (the past trip as a column)'); await famCols('family 🗄');
          if (!(await page.$('#screen #fam-board .hd.past[data-id="' + PSV + '"]')) || (await page.$('#screen #fam-board .hd[data-id="' + DRV + '"]'))) fails.push('🗄 should add the past trip as a column (dimmed), never the dropped one');
          await tapF('#screen [data-act="fampast"]');
        } else fails.push('the Family board should offer 🗄 while there is a past trip');
        for (let n = 0; n < 4 && (await page.$('#screen [data-act="fampage"][data-v="-1"]:not([aria-disabled="true"])')); n++) await tapF('#screen [data-act="fampage"][data-v="-1"]');
        await tapF('#screen button.cell[data-act="fcell"]'); await measure('P-person from a Family cell');
        if ((await page.getAttribute('#sheet', 'data-popup')) !== 'P-person') fails.push('a Family cell should open P-person');
        await tapF('#sheet [data-act="sh-close"]');
        await page.click('#screen [data-act="seg"][data-v="ideas"]'); await page.waitForTimeout(100);
        for (const id of [M8, DW]) {
          await page.click('#screen [data-trip="' + id + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('trip ' + id);
          await page.click('#screen [data-act="key"]'); await page.waitForTimeout(100); await measure('trip ' + id + ' + ⓘ');
          await page.click('#sheet [data-act="sh-close"]'); await page.waitForTimeout(100);
          await page.click('#screen [data-act="back"]'); await page.waitForTimeout(100);
        }
        // PIA-137: the trip view's sheets (tapped as the app sees a tap: the sticky primary may sit over a board row)
        const tapJs = async (sel) => { await page.$eval(sel, (e) => e.click()); await page.waitForTimeout(110); };
        // PIA-156: the page as a 678px-tall phone shows it before any scrolling (then back to this viewport)
        const shortView = async (w, h, also) => {
          await page.setViewportSize({ width: w || vp.width, height: h || 678 }); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(150);
          const r = await page.evaluate(SHORTCHK); if (also) r.also = await page.evaluate(also);
          await page.setViewportSize({ width: vp.width, height: vp.height }); await page.waitForTimeout(100);
          return r;
        };
        await page.click('#screen [data-trip="' + DW + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        // (before 🔒 on the organizer's token phone: the price row keeps its place right under the board; the key comes after it)
        const shDW = await shortView();
        if (!(shDW.prim && shDW.price === true)) fails.push('at 678px tall the price row should stay wholly above the sticky primary (the key goes after it) ' + JSON.stringify(shDW));
        // PIA-154: the header (a small postcard, the title, 📍 under it) and the date row (the pill and my answer chip on one line), inside
        // the screen at every width, in both themes; the chip and 📍 are 44px targets
        const hdr = await page.evaluate(() => {
          const th = document.querySelector('#screen .thead'), pc = th && th.querySelector('.pc, .postcard, [class*="pc"]'), dest = document.querySelector('#screen .thead [data-act="tomap"]');
          const row = document.querySelector('#screen .daterow'), pill = row && row.querySelector('[data-act="dates"]'), chip = row && row.querySelector('[data-act="achip"], .whoami, .achip');
          const R = (e) => e ? e.getBoundingClientRect() : null, rp = R(pill), rc = R(chip), rr = R(row), rd = R(dest), rt = R(th);
          return { head: !!th && rt.right <= innerWidth + 0.5 && rt.left >= -0.5, dest: !!rd && rd.height >= 43.5, row: !!rr && rr.right <= innerWidth + 0.5, chip: !!rc && rc.height >= 43.5 && rc.width >= 43.5, oneLine: !!rp && !!rc && Math.abs((rp.top + rp.height / 2) - (rc.top + rc.height / 2)) < 12 && rp.right <= rc.left + 0.5 };
        });
        if (!hdr.head || !hdr.dest || !hdr.row || !hdr.chip || !hdr.oneLine) fails.push('the trip header and the date row (pill + answer chip on one line, 44px) should fit the screen: ' + JSON.stringify(hdr));
        await tapJs('#screen .pb [data-act="person"][data-code="anjo-z5"]'); await measure('P-person (the organizer on Anjo)'); await tapJs('#sheet [data-act="sh-close"]');
        // (PIA-154: no me line: my own row's face opens my sheet, whose header has ⇄; ⋯ More is P-stage)
        await tapJs('#screen .pb-row.own [data-act="person"]'); await measure('P-person (me)');
        await tapJs('#sheet [data-act="face"]'); await measure('P-face');
        await tapJs('#sheet [data-act="joinopen"]'); await page.type('#join-name', 'Bartholomew Montgomery Fitzgerald'); await page.type('#join-ap', 'bos'); await measure('P-face (join row typed)');
        await page.fill('#join-ap', ''); await page.type('#join-ap', 'San Francisco'); await measure('P-face (join row, a city cut to SAN ⚠)');
        if (await page.$eval('#warn-join-ap', (e) => e.hidden)) fails.push('a city typed in the join airport field should show ⚠');
        await tapJs('#sheet [data-act="sh-close"]');
        await tapJs('#screen .nav [data-act="stage"]'); await measure('P-stage (⋯ More)'); await tapJs('#sheet [data-act="sh-close"]');
        await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-trip="' + M8 + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await tapJs('#screen .pb [data-act="person"][data-code="bartholomewmontgomeryfitzgera-dj"]'); await measure('P-person (8 long names)');
        await tapJs('#sheet [data-act="pnote"]'); await measure('P-note (a person\'s note, read first)');
        await tapJs('#sheet [data-act="noteedit"]'); await measure('P-note (a person\'s note, ✎ editing, ✓)'); await tapJs('#sheet [data-act="sh-close"]');
        await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-trip="' + LKV + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('trip with its dates set (Book | 🎫 I booked)');
        // (PIA-154: the organizer's 🎫 for someone is in their sheet, "🎫 Booked"; the board has no 🎫 column)
        if ((await page.$('#screen .pb [data-act="booked"]')) || !(await page.$('#screen .split.prim [data-act="mybook"]'))) fails.push('the set trip should show [Book | ☐ I booked] and no booking toggle on the board');
        // PIA-156: the key under its board: ⏳ Waiting (me and Anjo, Remind: her own link) and 🏠 Hosting (Mom & Dad), quiet and whole
        fails.push(...keyFails('the set trip\'s key', await page.evaluate(KEYCHK), ['Waiting:2:nudge', 'Hosting:1']));
        // (on a 678px-tall phone the key's first row, ⏳ Waiting with Remind, is wholly above [Book | ☐ I booked], Remind takes its tap)
        const shLK = await shortView();
        if (!(shLK.prim && shLK.first === true && /^⏳ Waiting$/.test(shLK.firstWord) && shLK.rem === true)) fails.push('at 678px tall the key\'s ⏳ Waiting row and its Remind should be wholly above the sticky primary ' + JSON.stringify(shLK));
        await tapJs('#screen .pb [data-act="person"][data-code="anjo-z5"]'); await tapJs('#sheet [data-act="booked"][data-code="anjo-z5"]'); await measure('Anjo\'s sheet with her 🎫 waiting for its confirming tap');
        await tapJs('#sheet [data-act="sh-close"]');
        await tapJs('#screen .pb-row.own [data-act="person"]'); await measure('P-person (me, PIA | ORD cells)');
        if ((await page.$$('#sheet [data-act="legair"]')).length !== 4) fails.push('my sheet on a Peoria trip should have the PIA | ORD cells for each end');
        // PIA-139: my sheet once the dates are set: [✈ Book ↗ | 🎫] side by side
        if (!(await page.$('#sheet .split a[data-ret] + [data-act="mybook"]'))) fails.push('my sheet on a set trip should have [Book | 🎫] side by side');
        await tapJs('#sheet [data-act="sh-close"]');
        // PIA-139: back from Google Flights after a Book tap, the 🎫 glows (the hand-off itself is not followed: offline)
        await page.$eval('#screen .split.prim a[data-ret]', (a) => { a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); });
        await page.evaluate(() => { for (const st of ['hidden', 'visible']) { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => st }); document.dispatchEvent(new Event('visibilitychange')); } });
        await page.waitForTimeout(120); await measure('trip with the 🎫 glowing after Google Flights');
        if (!(await page.$('#screen .split.prim [data-act="mybook"].glow'))) fails.push('back from a Book tap, the 🎫 beside Book should glow');
        await tapJs('#screen .nav [data-act="stage"]'); await tapJs('#sheet [data-act="caladd"]'); await measure('P-calendar-add (dates set)');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        // PIA-139: the Done 8-member trip: a booked traveler's sheet (times, [Flighty | 🎫]), P-stage with 💵 asking first, the Map's pickups
        await page.click('#screen [data-trip="' + BKV + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('the Done 8-member trip');
        await tapJs('#screen .pb [data-act="person"][data-code="bartholomewmontgomeryfitzgera-dj"]'); await measure('P-person (booked: times, Flighty | 🎫)');
        // (PIA-159: a booked leg with its time reads [SAV 3:10 PM], a 44px button into its edit row)
        if (!(await page.$('#sheet #tmb-arr')) || !(await page.$('#sheet #tmb-dep')) || !(await page.$('#sheet .split a [data-k="flighty"]'))) fails.push('a booked traveler\'s sheet should have the [code time] buttons and [✈ Track ↗ | 🎫 Booked]');
        await tapJs('#sheet #tmb-arr');
        await page.fill('#sheet #tm-arr', '23:59'); await measure('P-person (a time typed in its edit row)');
        // PIA-139 fix pass: "25:99" left is marked ⚠. PIA-159: the edit row holds the field and its [AM | PM] on one line
        await page.fill('#sheet #tm-arr', '25:99'); await page.$eval('#sheet [data-act="tmseg"][data-v="am"]', (e) => e.focus()); await page.waitForTimeout(360);
        await measure('P-person (a time marked ⚠, the [AM | PM] beside it)');
        if (!(await page.$('#sheet .fld.bad #tm-arr'))) fails.push('"25:99" left should be marked ⚠');
        await page.evaluate(() => { const f = document.getElementById('tm-arr'); f.value = '3:10'; f.dispatchEvent(new Event('input', { bubbles: true })); });
        // PIA-151: each 🛬 / 🛫 row holds its day and its time on one line; his 🛬 day opens the one-end calendar, where a day asks
        // ⚠ 🎫 Confirm first (booked); ‹ back leaves it unsent
        const rowsOk = await page.evaluate(() => { const L = [...document.querySelectorAll('#sheet .leg')]; return L.length === 2 && !!L[0].querySelector('#tm-arr') && !!L[1].querySelector('#tmb-dep') && L.every((e) => e.getBoundingClientRect().height < 60); });
        if (!rowsOk) fails.push('a booked traveler\'s flight rows should each hold their day and time (the 🛬 row being edited: its field and [AM | PM]) on one line');
        await tapJs('#sheet [data-act="dates"][data-end="0"]'); await measure('P-dates (one end, from the flight section)');
        if ((await page.getAttribute('#sheet', 'data-popup')) !== 'P-dates' || !(await page.$('#sheet .sh-hd .endg')) || (await page.$('#sheet [data-act="dsave"]'))) fails.push('a day in the flight section should open the one-end calendar (no Save bar)');
        await tapJs('#sheet [data-act="dday"][data-v="2026-12-09"]'); await measure('P-dates (one end, ⚠ 🎫 Confirm)');
        if (!(await page.$('#sheet [data-act="dsave"].arm'))) fails.push('a booked traveler\'s first one-end pick should ask ⚠ 🎫 Confirm');
        await tapJs('#sheet [data-act="sh-back"]');
        await tapJs('#sheet [data-act="sh-close"]');
        // PIA-151: the board's final check: booked bars carry their times (a ––:–– for no landing time); every traveler's bar is a 44px button
        // (5 booked: Bartholomew 15:10 / 18:05, Anastasia 15:40, Oluwaseun 15:05 / 20:00, Maximiliano and Sam Lee ––:––; Sam lands on the
        // board's last day: every label stays inside its own track, and the page never scrolls sideways)
        const fin = await page.evaluate(() => ({ times: document.querySelectorAll('#screen .pb .btm').length, miss: document.querySelectorAll('#screen .pb .btm.miss').length, bars: [...document.querySelectorAll('#screen .pb button.track')].map((e) => Math.round(e.getBoundingClientRect().height)),
          out: [...document.querySelectorAll('#screen .pb .btm')].filter((b) => { const t = b.closest('.track').getBoundingClientRect(), r = b.getBoundingClientRect(); return r.left < t.left - 1 || r.right > t.right + 1; }).map((b) => b.getAttribute('aria-label')),
          over: document.documentElement.scrollWidth - innerWidth,
          said: [...document.querySelectorAll('#screen .pb button.track')].map((e) => e.getAttribute('aria-label') || '').filter((s) => /lands /.test(s)) }));
        // (PIA-159: each label's AM / PM is a word; past the screen's 14 the fitter drops whole labels, departures first, so on this
        // 8-name organizer page the booked times live in each bar's spoken name; the two muted 🛬? stay)
        if (fin.times < 2 || fin.times > 7 || fin.miss !== 2 || fin.said.length !== 3 || !fin.said.some((s) => /lands [^,]*3:10 PM, leaves [^,]*6:05 PM$/.test(s)) || !fin.bars.length || fin.bars.some((h) => h < 44) || fin.out.length || fin.over > 0) fails.push('the Done trip\'s board should show its 2 muted 🛬? and whatever time labels its 14 words hold, its three timed bars saying both times, on 44px bars, each label inside its track, with no sideways scroll: ' + JSON.stringify(fin));
        await tapJs('#screen .pb [data-act="flight"][data-code="samlee-sb"]'); await measure('P-person from a traveler\'s bar (the organizer, no landing time yet)');
        if ((await page.evaluate(() => (document.activeElement || {}).id)) !== 'tm-arr') fails.push('a booked traveler\'s bar with no landing time should open their flight at the 🛬 field');
        await tapJs('#sheet [data-act="sh-close"]');
        if (!(await page.$('#screen [data-act="paidopen"]'))) fails.push('at 🏁 the organizer\'s trip view should have 💵 Paid');
        await tapJs('#screen [data-act="paidopen"]'); await page.type('#sheet #paid-amt', '$123,456'); await measure('P-stage (💵 typed)');
        await tapJs('#sheet [data-act="paidsave"]'); await measure('P-stage (💵 Save asks first)');
        if (!(await page.$('#sheet .paidb.arm')) || !(await page.$('#sheet .paidask .paidw'))) fails.push('💵 Save should ask first (⚠ … 🔒 above the field)');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        // PIA-139 fix pass: my booked bar on the Done trip, and a paid trip's 💵 entered again (✎). (PIA-154: booked with my landing time
        // recorded and my travel days not here yet, there is no primary: my bar opens my sheet)
        await page.click('#screen [data-trip="' + BKM + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('trip with my booked bar (no primary)');
        if (await page.$('#screen .split.prim')) fails.push('booked, my landing time recorded, outside my travel days: no primary');
        await tapJs('#screen .pb [data-act="flight"].mybar'); await measure('P-person from my booked bar');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-trip="' + BKP + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('a paid trip (🏁, times 🔒)');
        await tapJs('#screen .nav [data-act="stage"]'); await measure('P-stage (💵 paid, ✎)');
        await tapJs('#sheet [data-act="paidedit"]'); await measure('P-stage (💵 entered again)');
        if (!(await page.$('#sheet #paid-amt'))) fails.push('✎ on a paid trip should give the 💵 field again');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-trip="' + DW + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await tapJs('#screen .nav [data-act="stage"]'); await measure('P-stage (💵 greyed: not everyone booked)');
        await tapJs('#sheet [data-act="caladd"]'); await measure('P-calendar-add (tentative ?)');
        if (await page.$('#sheet .tq')) fails.push('P-calendar-add carries no ? corner (PIA-154: the event\'s title says "? " itself)');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#tabbar [data-v="map"]'); await page.waitForTimeout(120);
        if (await page.$('#screen [data-act="pick"][data-id="' + BKV + '"]')) { await page.click('#screen [data-act="pick"][data-id="' + BKV + '"]'); await page.waitForTimeout(120); }
        await measure('Map (the Done trip\'s pickups, a ⏱ run)');
        if (!(await page.$('#screen .lanes .grp .pk'))) fails.push('the Map should show the Done trip\'s pickup chips with a ⏱ run');
        if (!(await page.$('#screen .lanes .pk.bk')) || (await page.$('#screen .lanes .pk .bk'))) fails.push('a booked traveler\'s pickup chip should be drawn solid (no 🎫 corner)');
        if (!(await page.$('#screen .lanes .lhd [data-lbl3]'))) fails.push('the pickups table should carry its 🛬 Lands | 🛫 Leaves column heads');
        await tapJs('#screen .lanes .pk[data-code]'); await measure('P-day from a pickup chip');
        await tapJs('#sheet [data-act="sh-close"]');
        await page.click('#tabbar [data-v="trips"]'); await page.waitForTimeout(100);
        // PIA-138: P-dates in each state (the plan, a holiday picked, a start picked, my own days on one end), P-day, the undated
        // idea's ⟦window⟧ with ⬚ the best window, and a locked plan to read with 🔓
        await page.click('#screen [data-trip="' + DW + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        // (PIA-154: no holiday chips once there is a plan, no 👥 and no one-end segment in P-dates; P-day is Calendar › a day)
        await tapJs('#screen .daterow [data-act="dates"]'); await measure('P-dates (the plan, 🔒 Lock dates)');
        await tapJs('#sheet [data-act="dshift"][data-v="7"]'); await measure('P-dates (+7)');
        await tapJs('#sheet [data-act="dday"][data-v="2026-11-13"]'); await measure('P-dates (a start picked, 📌⚠)');
        await tapJs('#sheet [data-act="dtarget"][data-v="me"]'); await measure('P-dates (my own days)');
        await tapJs('#sheet [data-act="dday"][data-v="2026-11-05"]'); await measure('P-dates (my arrival picked, ⚠ off the plan)');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#tabbar [data-v="cal"]'); await page.waitForTimeout(120);
        if (await page.$('#screen [data-act="pick"][data-id="' + DW + '"]')) { await page.click('#screen [data-act="pick"][data-id="' + DW + '"]'); await page.waitForTimeout(120); }
        await tapJs('#screen [data-act="calday"][data-v="2026-11-07"]'); await measure('P-day (Calendar › a day)');
        if ((await page.getAttribute('#sheet', 'data-popup')) !== 'P-day') fails.push('Calendar › a day should open P-day');
        await tapJs('#sheet [data-act="sh-close"]');
        await page.click('#tabbar [data-v="trips"]'); await page.waitForTimeout(100);
        await page.click('#screen [data-trip="' + CYV + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await tapJs('#screen .daterow [data-act="dates"]'); await measure('P-dates (an undated idea: ⟦window⟧, ⬚ best)');
        if (!(await page.$('#sheet [data-act="dbest"]'))) fails.push('the undated idea should offer ⬚ its best window');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-trip="' + LKV + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await tapJs('#screen .daterow [data-act="dates"]'); await measure('P-dates (a locked plan to read, 🔓)');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-trip="tgLegacyThanksgiving01"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(200); await measure('P-face (by itself, a v1 trip)');
        // PIA-152: the v1 trip's tiles are the family's own faces (🌽 💪 🗽), each inside its tile
        const tg = await page.$$eval('#sheet [data-act="pickface"]', (es) => es.map((e) => { const r = e.getBoundingClientRect(), f = e.querySelector('.f') || e, g = document.createRange(); g.selectNodeContents(f); const t = g.getBoundingClientRect();
          return { face: (e.querySelector('.f') || {}).textContent || '', fits: t.width > 0 && t.left >= r.left - 0.5 && t.right <= r.right + 0.5 }; })).catch(() => []);
        if (tg.map((x) => x.face).sort().join('') !== ['🌽', '💪', '🗽'].sort().join('') || !tg.every((x) => x.fits)) fails.push('P-face on the v1 Thanksgiving should show the family\'s 🌽 💪 🗽, each inside its tile; got ' + JSON.stringify(tg));
        await tapJs('#sheet [data-act="pickface"][data-code="PIA"]'); await measure('the host\'s trip view (In unconfirmed)');
        await tapJs('#screen [data-act="back"]');
        for (const tab of ['map', 'cal']) { await page.click('#tabbar [data-v="' + tab + '"]'); await page.waitForTimeout(120); await measure(tab); }
        await page.click('#tabbar [data-v="trips"]'); await page.waitForTimeout(100);
        // PIA-135: the list-share sheet, and the receiving sheet a list link opens
        await page.click('#screen [data-act="sharelist"]'); await page.waitForTimeout(120); await measure('P-sharelist');
        await page.click('#sheet [data-act="sh-close"]'); await page.waitForTimeout(100);
        // two of the linked trips are new on this phone, so the sheet shows them and ⤓ Save; then, once saved, the same
        // link again shows the dimmed "nothing new" stack
        await page.evaluate(() => { const L = JSON.parse(localStorage.getItem('pialax_watchlist_v2')); localStorage.setItem('pialax_watchlist_v2', JSON.stringify(L.filter((x) => x.id !== 'thTahoeSkiWeekend26b02' && x.id !== 'm8GrandmaNinetieth0c03'))); });
        const listLink = (process.env.PIALAX_TEST_APP_URL || pathToFileURL(path.join(ROOT, 'app.html')).href) + '?l=' + ids.join('.') + '.zzTripThatIsGone0000z1&f=' + encodeURIComponent('🦊');
        await page.goto(listLink, { waitUntil: 'load' }); await page.waitForTimeout(300);
        await measure('P-savelist (⤓ Save 2)');
        const save = await page.$eval('#sheet [data-act="svsave"]', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
        if (save !== '⤓ Save 2') fails.push('P-savelist: two new trips should offer ⤓ Save 2, got ' + JSON.stringify(save));
        if (save) { await page.click('#sheet [data-act="svsave"]'); await page.waitForTimeout(150); await measure('list after ⤓ Save'); }
        await page.goto(listLink, { waitUntil: 'load' }); await page.waitForTimeout(300);
        await measure('P-savelist (nothing new)');
        await page.click('#sheet [data-act="sh-close"]'); await page.waitForTimeout(100);
        // PIA-136: the one create path (each step, a long typed name, an unknown code, a person's row open, dates and a window) and the
        // organizer's edit sheets (P-edit, name and place, people, caption, drop)
        await page.click('#screen [data-act="new"]'); await page.waitForTimeout(120); await measure('P-new-what');
        await page.fill('#new-title', 'Grandma Josephine ninetieth birthday weekend in Savannah with everyone'); await page.fill('#new-dest', 'ZZQ'); await page.waitForTimeout(60); await measure('P-new-what (typed, unknown code)');
        await page.click('#sheet [data-act="nnext"]'); await page.waitForTimeout(100); await measure('P-new-who');
        await page.click('#sheet [data-act="nedit"] >> nth=0'); await page.fill('#mem-name', 'Bartholomew Montgomery Fitzgerald'); await page.waitForTimeout(60); await measure('P-new-who (a row open)');
        if (!(await page.$('#sheet .metog[aria-pressed="true"]'))) await page.click('#sheet .metog');
        await page.click('#sheet [data-act="nnext"]'); await page.waitForTimeout(100); await measure('P-new-when');
        await page.click('#sheet [data-act="nday"][data-v="2026-11-06"]'); await page.click('#sheet [data-act="nday"][data-v="2026-11-09"]'); await page.waitForTimeout(60); await measure('P-new-when (dates)');
        await page.click('#sheet [data-act="nmode"][data-v="window"]'); await page.waitForTimeout(60); await measure('P-new-when (window)');
        await page.click('#sheet [data-act="sh-close"]'); await page.waitForTimeout(100);
        await page.click('#screen [data-trip="' + DW + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await page.click('#screen .nav [data-act="stage"]'); await page.waitForTimeout(100);
        await page.click('#sheet [data-act="edit"]'); await page.waitForTimeout(100); await measure('P-edit');
        await page.click('#sheet [data-act="etitle"]'); await page.waitForTimeout(100); await measure('P-edit name and place');
        await page.click('#sheet [data-act="sh-back"]'); await page.waitForTimeout(80);
        await page.click('#sheet [data-act="epeople"]'); await page.waitForTimeout(100); await measure('P-edit people');
        // PIA-150: a face is picked in ✎ by tapping it: Diwali's Ashwin (saved 🌴) steps to 💪, and 💪 fits inside its ≥44px tile
        await page.click('#sheet [data-act="nedit"][data-v="1"]'); await page.click('#sheet [data-act="nface"][data-v="1"]'); await page.waitForTimeout(60);
        const fp = await page.$eval('#sheet [data-act="nface"][data-v="1"]', (e) => {
          const r = e.getBoundingClientRect(), g = document.createRange(); g.selectNodeContents(e); const t = g.getBoundingClientRect();
          return { face: e.textContent.trim(), w: r.width, h: r.height, gw: t.width, fits: t.width > 0 && t.left >= r.left - 0.5 && t.right <= r.right + 0.5 && t.top >= r.top - 0.5 && t.bottom <= r.bottom + 0.5 };
        });
        if (fp.face !== '💪' || fp.w < 44 || fp.h < 44 || !fp.fits) fails.push('P-edit people: Ashwin\'s 🌴 should step to 💪, drawn inside its ≥44px tile; got ' + JSON.stringify(fp));
        await measure('P-edit people (💪 picked)');
        await page.click('#sheet [data-act="nedit"] >> nth=0'); await page.click('#sheet [data-act="ndel"]'); await page.waitForTimeout(60); await measure('P-edit people (remove armed)');
        await page.click('#sheet [data-act="sh-back"]'); await page.waitForTimeout(80);
        await page.click('#sheet [data-act="ecap"]'); await page.waitForTimeout(100); await measure('P-note');
        await page.click('#sheet [data-act="sh-back"]'); await page.waitForTimeout(80);
        await page.click('#sheet [data-act="edrop"]'); await page.waitForTimeout(100); await measure('P-drop');
        await page.click('#sheet [data-act="sh-close"]'); await page.waitForTimeout(100);
        await page.click('#screen [data-act="back"]'); await page.waitForTimeout(100);
        // PIA-140: prices. P-total from a card's total (cached fares, nothing to search); the 8-member trip's total block and its
        // P-total with every leg $— and 🔍4; one tap searches (4, through the stub) and every leg carries its facts (age ◷, level,
        // stops, the nearby airport that won); a traveler's sheet with its fare row and ±1 day chips (🔍 for the days next to it);
        // then the Worker's day cap: ⛔ with the local time it lifts, in P-total, P-person and ⚙
        const settle = async (n) => { for (let i = 0; i < 60 && (net.search < n || await page.$('#sheet [data-act="search"].busy')); i++) await page.waitForTimeout(50); await page.waitForTimeout(120); };
        await tapJs('#screen .card [data-act="total"][data-id="' + DW + '"]'); await measure('P-total (cached fares, from a card)');
        if ((await page.getAttribute('#sheet', 'data-popup')) !== 'P-total') fails.push('a card\'s total should open P-total');
        if (net.search) fails.push('opening P-total searched ' + net.search + ' times; nothing searches until 🔍 is tapped');
        await tapJs('#sheet [data-act="sh-close"]');
        await page.click('#screen [data-trip="' + M8 + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('the 8-member trip with its price row (🔍 Price and the faces)');
        // PIA-155: the row says whose fare by their faces ("🔍 Price 🦊🐻🐼+2"): whole, on screen, ≥44px, nothing clipped, never a bare count
        const frow = await page.$eval('#screen .pricerow', (e) => ({ t: e.textContent.replace(/\s+/g, ' ').trim(), h: Math.round(e.getBoundingClientRect().height), out: e.getBoundingClientRect().right > innerWidth + 0.5 || e.getBoundingClientRect().left < -0.5,
          clip: [...e.querySelectorAll('*')].some((c) => c.scrollWidth > c.clientWidth + 1 && getComputedStyle(c).overflow !== 'visible'), uf: !!e.querySelector('.uf[data-k="unpriced"]') })).catch(() => null);
        if (!frow || frow.t !== '🔍 Price 🦊🐻🐼+2' || !frow.uf || frow.h < 44 || frow.out || frow.clip) fails.push('the 8-member trip\'s price row should read "🔍 Price 🦊🐻🐼+2", whole and ≥44px, got ' + JSON.stringify(frow));
        await tapJs('#screen .pricerow[data-act="total"]'); await measure('P-total (8 long names, all $—, 🔍4)');
        const s4 = await page.$eval('#sheet [data-act="search"][data-v="total"]', (e) => e.textContent.replace(/\s+/g, '')).catch(() => null);
        if (s4 !== '🔍4/5' || net.search) fails.push('P-total on the 8-member trip should offer 🔍4/5 before any search, got ' + JSON.stringify(s4) + ' after ' + net.search);
        // PIA-140 fix pass, PIA-154: P-total draws a never-searched leg as P-person does: a plain muted — (no dashed $— chip)
        const missLeg = await page.$eval('#sheet .trows .lgp.miss', (e) => [e.textContent.trim().slice(-1), getComputedStyle(e).borderTopStyle]).catch(() => null);
        if (!missLeg || missLeg[0] !== '—' || missLeg[1] === 'dashed') fails.push('P-total\'s never-searched legs should read a plain — (no dashed $—), got ' + JSON.stringify(missLeg));
        await tapJs('#sheet [data-act="skey"]'); await measure('P-total › its ⓘ (all $—)');
        await tapJs('#sheet [data-act="sh-back"]');
        await tapJs('#sheet [data-act="search"][data-v="total"]'); await settle(4);
        await measure('P-total (4 searched: ◷ ages, levels, stops; 🔍1 left)');
        if (net.search !== 4) fails.push('one 🔍4 tap should make 4 searches, made ' + net.search);
        // the fifth leg (Oluwaseun's NY set, the one nearby search on this trip) is the next tap: its winner is another NY airport
        const s1 = await page.$eval('#sheet [data-act="search"][data-v="total"]', (e) => e.textContent.replace(/\s+/g, '')).catch(() => null);
        if (s1 !== '🔍1') fails.push('after 4 of 5 legs P-total should offer 🔍1, got ' + JSON.stringify(s1));
        await tapJs('#sheet [data-act="search"][data-v="total"]'); await settle(5);
        await measure('P-total (all searched: ◷ ages, levels, stops, a nearby winner)');
        if (net.search !== 5) fails.push('the 🔍1 tap should make 1 search, 5 in all, made ' + net.search);
        if (!(await page.$('#sheet .trows .lgp .lc')) || !(await page.$('#sheet .trows .lgp .lvl')) || !(await page.$('#sheet .trows .lgp .stopl'))) fails.push('searched legs should carry the winning airport, the price level and the stops');
        // the level gauge sits on its baseline with 1px between bars in P-total too (the row's own span rules never reach a leg's parts)
        const gauge = await page.$eval('#sheet .trows .lgp .lvl', (e) => { const cs = getComputedStyle(e); return cs.alignItems + ' ' + cs.columnGap; }).catch(() => null);
        if (gauge !== 'flex-end 1px') fails.push('P-total\'s level gauge should be bottom-aligned with 1px gaps (as in P-person), got ' + JSON.stringify(gauge));
        await tapJs('#sheet [data-act="skey"]'); await measure('P-total › its ⓘ (ages, levels, stops)');
        await tapJs('#sheet [data-act="sh-back"]');
        await tapJs('#sheet .trow [data-act="person"][data-code="bartholomewmontgomeryfitzgera-dj"]'); await measure('P-person (fare row, ±1 day chips, 🔍)');
        if ((await page.$$('#sheet .dayp .dch')).length < 3 || !(await page.$('#sheet .frow .lgp'))) fails.push('a priced traveler\'s sheet should have the fare row and a row of day chips per end');
        const sq = await page.$('#sheet .dayp [data-act="search"]:not([aria-disabled])');
        if (sq) { const n0 = net.search; await sq.click(); await settle(n0 + 1); await measure('P-person (the days next to it searched, ★)'); }
        if (await page.$('#sheet [data-act="skey"]')) { await tapJs('#sheet [data-act="skey"]'); await measure('P-person › its ⓘ (a fare\'s parts, ★)'); await tapJs('#sheet [data-act="sh-back"]'); }
        else fails.push('a priced traveler\'s sheet should carry ⓘ');
        // the day cap, with one leg forgotten on this phone so P-total has a spend control to lock
        await page.evaluate((k) => { localStorage.setItem('pialax_daily_cap_v1', '2026-10-17'); const f = JSON.parse(localStorage.getItem('pialax_fares_v2') || '{}'); delete f[k]; localStorage.setItem('pialax_fares_v2', JSON.stringify(f)); },
          TM.tripModel(docs[M8], { today: '2026-10-17', now: NOWMS, me: 'grandmajosephine-nf', hasEditKey: true, hasToken: true, multiAirport: true }).travelers.find((x) => x.code === 'samlee-sb').keys[0].key);
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen .pricerow[data-act="total"]'); await measure('P-total (⛔ the Worker\'s day cap)');
        const lockTxt = await page.$eval('#sheet [data-act="search"][data-k="cap"]', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
        if (lockTxt !== '⛔ 5:00 PM') fails.push('the day cap should show ⛔ with the local reset time (5:00 PM in Los Angeles, 12-hour since PIA-159), got ' + JSON.stringify(lockTxt));
        await tapJs('#sheet .trow [data-act="person"][data-code="anastasiakonstantinopoulou-x1"]'); await measure('P-person (⛔ beside the day chips)');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-act="settings"]'); await page.waitForTimeout(100); await measure('⚙ (🔍 today, this visit, the month cap, ⛔)');
        if (!(await page.$('#sheet #org-cap')) || !(await page.$('#sheet .budget .bud')) || !(await page.$('#sheet .capt'))) fails.push('⚙ on the organizer\'s phone should show the searches left today, the month cap and ⛔');
        // PIA-152: ⚙ shows the build beside its glyph, one line, inside the header, readable (not the background's colour)
        const bld = await page.$eval('#sheet .sh-hd .bld', (e) => { const r = e.getBoundingClientRect(), h = e.closest('.sh-hd').getBoundingClientRect(), cs = getComputedStyle(e);
          return { txt: e.textContent, in: r.left >= h.left && r.right <= h.right && r.height < 30, color: cs.color, bg: getComputedStyle(document.querySelector('#sheet')).backgroundColor }; }).catch(() => null);
        if (!bld || !/^#\d+$/.test(bld.txt) || !bld.in || bld.color === bld.bg) fails.push('⚙ should show the build (#NNN) inside its header, on one line, readable; got ' + JSON.stringify(bld));
        // (PIA-160: #160 sized and weighted as the sheet's title, in its ink at ≥4.5:1, and the phone row's 📐 / 🔠 numerals ≥4.5:1)
        const bldT = await page.$eval('#sheet .sh-hd .bld', (e) => { const cs = getComputedStyle(e), t = getComputedStyle(e.closest('.sh-hd').querySelector('.ttlg') || e.parentElement); return { fw: cs.fontWeight, fs: parseFloat(cs.fontSize), tfs: parseFloat(t.fontSize) }; }).catch(() => null);
        if (!(bldT && bldT.fw === '700' && Math.abs(bldT.fs - bldT.tfs) < 0.3)) fails.push('PIA-160 ⚙\'s #NNN should be the title\'s size at 700: ' + JSON.stringify(bldT));
        fails.push(...contrastFails('PIA-160 ⚙\'s build and phone row', await page.evaluate(CONTRAST, { ink: '#sheet .sh-hd .bld, #sheet .phonerow' }), { ink: true }));
        await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }); });
        await page.click('#sheet [data-act="devlink"]'); await page.waitForTimeout(150); await measure('P-link');
        // PIA-140 fix pass: the visit's 8 spent (⛔ ↻ in P-total and in a person's square, then ↻8? asked), the month locked by SerpAPI
        // (⛔ 11/1, ⛔ alone in a square, the trip page's block too), and ⚙ with every lock in its own row
        await tapJs('#sheet [data-act="sh-close"]');
        await page.evaluate(() => { localStorage.removeItem('pialax_daily_cap_v1'); sessionStorage.setItem('pialax_spent_v2', '8'); });
        await page.click('#screen [data-trip="' + M8 + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('the 8-member trip, the visit\'s 8 spent (⛔ on its total block)');
        await tapJs('#screen .pricerow[data-act="total"]'); await measure('P-total (⛔ ↻, the visit\'s 8 spent)');
        if (!(await page.$('#sheet [data-act="newvisit"]'))) fails.push('P-total with the visit\'s 8 spent should offer ⛔ ↻');
        else { await tapJs('#sheet [data-act="newvisit"]'); await measure('P-total (↻8? a new visit asked)'); }
        await tapJs('#sheet .trow [data-act="person"][data-code="anastasiakonstantinopoulou-x1"]'); await measure('P-person (⛔ ↻ in the square)');
        await tapJs('#sheet [data-act="sh-close"]');
        await page.evaluate(() => { sessionStorage.setItem('pialax_spent_v2', '0'); const q = JSON.parse(localStorage.getItem('pialax_serpapi_quota') || '{}'); q.exceeded = true; localStorage.setItem('pialax_serpapi_quota', JSON.stringify(q)); });
        await page.evaluate(() => window.scrollTo(0, 0));
        await tapJs('#screen [data-act="back"]'); await page.click('#screen [data-trip="' + M8 + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await measure('the 8-member trip, the month locked (⛔ 11/1 on its total block)');
        await tapJs('#screen .pricerow[data-act="total"]'); await measure('P-total (⛔ 11/1, SerpAPI refused)');
        await tapJs('#sheet .trow [data-act="person"][data-code="anastasiakonstantinopoulou-x1"]'); await measure('P-person (⛔ alone in the square)');
        const sqLk = await page.$eval('#sheet .dayp [data-act="search"][data-k="cap"]', (e) => e.textContent.trim()).catch(() => null);
        if (sqLk !== null && sqLk !== '⛔') fails.push('a locked square ±1 button should show ⛔ alone (its time in its label), got ' + JSON.stringify(sqLk));
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.evaluate(() => { sessionStorage.setItem('pialax_spent_v2', '8'); localStorage.setItem('pialax_daily_cap_v1', '2026-10-17'); });
        await page.click('#screen [data-act="settings"]'); await page.waitForTimeout(120); await measure('⚙ (the day, visit and month locks, each in its row)');
        await tapJs('#sheet [data-act="sh-close"]');
        await page.evaluate(() => { localStorage.removeItem('pialax_daily_cap_v1'); sessionStorage.setItem('pialax_spent_v2', '0'); const q = JSON.parse(localStorage.getItem('pialax_serpapi_quota') || '{}'); q.exceeded = false; localStorage.setItem('pialax_serpapi_quota', JSON.stringify(q)); });
        // PIA-141: the cheapest week. P-dates' 📉 → P-cheapest: 15 weeks on 3 pages (each ⚠🗽: Anjo's own days are longer than the stay),
        // ◀ ▶ and ⟦◀ ▶⟧ on their own row; a hollow week's 🔍3, searched through the stub, then Move asking first (⚠🗽 Confirm); the next
        // page; its ⓘ; and the 8-member trip's weeks with five long-named chips. Nothing is moved (this Worker stub takes no writes)
        // (a fresh page: the app keeps this visit's searches in memory too, and the PIA-140 states above spent 7 of its 8)
        await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
        await page.click('#screen [data-trip="' + CHV + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await tapJs('#screen .daterow [data-act="dates"]'); await measure('P-dates with 📉');
        if (!(await page.$('#sheet [data-act="dcheap"]:not([aria-disabled])'))) fails.push('P-dates on the organizer\'s token phone should offer 📉');
        await tapJs('#sheet [data-act="dcheap"]'); await page.waitForTimeout(150); await measure('P-cheapest (15 weeks, 3 pages, ⟦◀ ▶⟧)');
        const cbs = await page.$$eval('#sheet .cbar', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
        if ((await page.getAttribute('#sheet', 'data-popup')) !== 'P-cheapest' || cbs.length !== 7 || cbs.some((b) => b[0] < 44 || b[1] < 44)) fails.push('P-cheapest should show 7 bars of ≥44px, got ' + JSON.stringify(cbs));
        const ownRow = await page.evaluate(() => { const sb = document.querySelector('#sheet .cstrip').getBoundingClientRect().bottom, c = [...document.querySelectorAll('#sheet [data-act="cpage"], #sheet [data-act="cwiden"]')]; return c.length === 4 && c.every((e) => e.getBoundingClientRect().top >= sb); });
        if (!ownRow) fails.push('P-cheapest\'s ◀ ▶ and ⟦◀ ▶⟧ should sit on their own row below the bars');
        const cs0 = net.search;
        await tapJs('#sheet .cbar[data-v="2026-11-08"]'); await measure('P-cheapest (a hollow week, 🔍3)');
        const c3 = await page.$eval('#sheet [data-act="search"][data-v="week"]', (e) => e.textContent.replace(/\s+/g, '')).catch(() => null);
        if (c3 !== '🔍3') fails.push('a hollow week of the cheapest-week trip should cost 🔍3 first, got ' + JSON.stringify(c3));
        await tapJs('#sheet [data-act="search"][data-v="week"]'); await settle(cs0 + 3);
        await measure('P-cheapest (a week searched: Move)');
        if (net.search !== cs0 + 3 || !(await page.$('#sheet [data-act="cmove"]'))) fails.push('one 🔍3 tap should make 3 searches and offer Move, made ' + (net.search - cs0));
        await tapJs('#sheet [data-act="cmove"]'); await page.waitForTimeout(500); await measure('P-cheapest (Move asks: ⚠🗽 Confirm)');
        if (!(await page.$('#sheet .btn.arm[data-act="cmove"]'))) fails.push('Move on a week that leaves Anjo\'s days out should ask first');
        await tapJs('#sheet [data-act="cpage"][data-v="1"]'); await measure('P-cheapest (page 2)');
        await tapJs('#sheet [data-act="skey"]'); await measure('P-cheapest › its ⓘ'); await tapJs('#sheet [data-act="sh-back"]');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-trip="' + M8 + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await tapJs('#screen .daterow [data-act="dates"]'); await tapJs('#sheet [data-act="dcheap"]'); await page.waitForTimeout(120);
        await measure('P-cheapest (8 long names)');
        if (await page.$('#sheet .cbar:not(.cur)')) { await tapJs('#sheet .cbar:not(.cur)'); await measure('P-cheapest (8 long names, a week selected: 5 chips)'); }
        if ((await page.$$('#sheet .cchip')).length !== 5) fails.push('the 8-member trip\'s P-cheapest should show its 5 travelers\' chips');
        // fix pass: on a short phone (640px high) the one button stays in view, whole and tappable, over the chips (it sticks to the
        // sheet's bottom); and below the 360 gate (320px) a page holds 6 bars of ≥44px with no sideways scroll
        await page.setViewportSize({ width: vp.width, height: 640 }); await page.waitForTimeout(150);
        await measure('P-cheapest (8 long names, a 640px-high phone)');
        const stuck = await page.evaluate(() => {
          const b = document.querySelector('#sheet .btn.pri.wide'), sh = document.querySelector('#sheet'); if (!b) return 'no button';
          const r = b.getBoundingClientRect(), s = sh.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return r.top >= s.top && r.bottom <= Math.min(innerHeight, s.bottom) + 0.5 && t && (t === b || b.contains(t)) ? '' : 'button at ' + Math.round(r.top) + '–' + Math.round(r.bottom) + ' of ' + innerHeight + (t && !(t === b || b.contains(t)) ? ', covered' : '');
        });
        if (stuck) fails.push('P-cheapest\'s button on a 640px-high phone should be whole and in view: ' + stuck);
        if (vp.width === 360) {
          await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(150);
          await tapJs('#sheet .cbar[aria-pressed="true"]');   // (drawn again at this width)
          const n320 = await page.evaluate(() => { const s = document.querySelector('#sheet'), st = document.querySelector('#sheet .cstrip'); return { bars: [...document.querySelectorAll('#sheet .cbar')].map((e) => Math.round(e.getBoundingClientRect().width)), over: s.scrollWidth - s.clientWidth, strip: st ? st.scrollWidth - st.clientWidth : 0, page: document.documentElement.scrollWidth - innerWidth }; });
          if (n320.bars.length > 6 || n320.bars.some((w) => w < 44) || n320.over > 0 || n320.strip > 0 || n320.page > 0) fails.push('P-cheapest at 320px should page 6 bars of ≥44px with no sideways scroll, got ' + JSON.stringify(n320));
        }
        await page.setViewportSize({ width: vp.width, height: vp.height }); await page.waitForTimeout(100);
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        // (PIA-154: no price column on the board) the open-jaw sums sit in the one price row: its 5-digit total and 🔍 fit, nothing clipped
        await page.click('#screen [data-trip="' + DWJ + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('the price row with a 5-digit total');
        const cells = await page.$$eval('#screen .pb .pb-row .pr', (els) => els.length);
        const prow = await page.$eval('#screen .pricerow', (e) => ({ t: e.textContent.replace(/\s+/g, ' ').trim(), clip: [...e.querySelectorAll('*')].some((c) => c.scrollWidth > c.clientWidth + 1 && getComputedStyle(c).overflow !== 'visible'), h: Math.round(e.getBoundingClientRect().height), out: e.getBoundingClientRect().right > innerWidth + 0.5 })).catch(() => null);
        if (cells || !prow || !/\$\d{1,3},\d{3}/.test(prow.t) || prow.clip || prow.h < 44 || prow.out) fails.push('the board should have no price column and the price row should show the total whole, ≥44px, on screen; got ' + JSON.stringify({ cells, prow }));
        await tapJs('#screen [data-act="back"]');
        // PIA-136: a join request on the full 8-member trip (the joiner open, ⚠ 9/8), and a v1 idea link with a long note (📝⚠, then its P-note)
        await page.goto((process.env.PIALAX_TEST_APP_URL || pathToFileURL(path.join(ROOT, 'app.html')).href) + '?idea=' + M8 + '&add=' + encodeURIComponent('Nina Okafor.BOS'), { waitUntil: 'load' }); await page.waitForTimeout(300);
        if (!(await page.$('#who-cap'))) fails.push('a join request on the full trip should open P-edit-who with ⚠ 9/8');
        await measure('P-edit-who (join request, ⚠ 9/8)');
        const v1idea = { version: 'trip-idea-v1', builder: { destination: { city: 'Raleigh-Durham', airport: 'RDU' }, dates: { departure: '2026-11-06', return: '2026-11-09' }, constraints: { eventDate: '2026-11-08' } },
          notes: 'Puja Sunday then ' + Array.from({ length: 30 }, (_, i) => 'lamplighting' + i).join(' ') };
        const tripIdea = Buffer.from(encodeURIComponent(JSON.stringify(v1idea)), 'binary').toString('base64');
        await page.goto((process.env.PIALAX_TEST_APP_URL || pathToFileURL(path.join(ROOT, 'app.html')).href) + '?tripIdea=' + encodeURIComponent(tripIdea), { waitUntil: 'load' }); await page.waitForTimeout(300);
        await measure('P-new-what (a v1 idea link, 📝⚠)');
        await page.click('#sheet [data-act="nnote"]'); await page.waitForTimeout(120); await measure('P-note (the new trip\'s note)');
        // PIA-137: a join request opened on a phone that does not organize that trip (Tahoe): P-joinfwd sends it on
        await page.goto((process.env.PIALAX_TEST_APP_URL || pathToFileURL(path.join(ROOT, 'app.html')).href) + '?idea=thTahoeSkiWeekend26b02&add=' + encodeURIComponent('Bartholomew Montgomery.OAK'), { waitUntil: 'load' }); await page.waitForTimeout(300);
        if ((await page.getAttribute('#sheet', 'data-popup')) !== 'P-joinfwd') fails.push('a join request on a trip this phone does not organize should open P-joinfwd');
        await measure('P-joinfwd');
        // PIA-142: a phone whose trips are all on the shelf (one past, one dropped): the Family board's ghost row, then 🗄
        await page.evaluate(([a, b]) => { localStorage.setItem('pialax_watchlist_v2', JSON.stringify([a, b].map((id) => ({ id, t: '', e: '', at: 1, pin: false, arch: false })))); }, [PSV, DRV]);
        await page.goto((process.env.PIALAX_TEST_APP_URL || pathToFileURL(path.join(ROOT, 'app.html')).href), { waitUntil: 'load' }); await page.waitForTimeout(300);
        await page.click('#screen [data-act="seg"][data-v="family"]'); await page.waitForTimeout(120); await measure('family ghost row (every trip on the shelf)');
        if (!(await page.$('#screen [data-ghost="family"] .gface')) || !(await page.$('#screen [data-ghost="family"] [data-act="fampast"]'))) fails.push('an empty board should show its ghost row with ＋ and 🗄');
        await page.$eval('#screen [data-act="fampast"]', (e) => e.click()); await page.waitForTimeout(120); await measure('family 🗄 (only the past trip)');
        if (!(await page.$('#screen #fam-board .hd.past'))) fails.push('🗄 on the empty board should bring the past trip in');
        // PIA-156: the 8-member trip (🔒, two booked, six to book) on the organizer's phone: ⏳ Waiting first, holding what fits (4 and +2
        // at 360 and 390, all 6 at 430) with Remind (the trip's guest share) at its end, then ✈ Booked with two faces; ✈ legible on the board
        await page.goto((process.env.PIALAX_TEST_APP_URL || pathToFileURL(path.join(ROOT, 'app.html')).href) + '?idea=' + E8V, { waitUntil: 'load' }); await page.waitForTimeout(300);
        if (await page.$('#sheet:not([hidden])')) await tapJs('#sheet [data-act="sh-close"]');
        await measure('the key on the 8-member trip (Booked, Waiting +N, Remind)');
        fails.push(...keyFails('the 8-member trip\'s key', await page.evaluate(KEYCHK), vp.width >= 430 ? ['Waiting:6:tshare', 'Booked:2'] : ['Waiting:4+2:tshare', 'Booked:2']));
        await page.$eval('#screen .wk', (e) => e.scrollIntoView({ block: 'center' }));
        // (the faces are 44px targets at a 36px pitch: only their outer padding overlaps, so each 28px face takes its own tap)
        const reach = await page.evaluate(() => {
          const r = document.querySelector('#screen .wk .wkrem').getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          const faces = [...document.querySelectorAll('#screen .wk .wkf .facebtn')];
          const own = faces.every((f) => { const a = f.querySelector('.av').getBoundingClientRect(), x = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2); return !!x && x.closest('.facebtn') === f; });
          return { rem: !!t && !!t.closest('.wkrem'), faces: faces.length, own };
        });
        if (!reach.rem) fails.push('the key\'s Remind should take a tap where it is drawn (nothing over it once scrolled into view)');
        if (!(reach.faces >= 6 && reach.own)) fails.push('each face in the key should take its own tap at its centre ' + JSON.stringify(reach));
        // PIA-157: P town on the organizer's phone (his own link): the key's 🚗 Rides row after ⏳ Waiting, its head with no word while the
        // primary says "🚗 Rides", one dashed chip a run (🛬 11/20, 🛫 11/30, each ≥44px and named) and Ask Mom & Dad at its end; on a
        // 678px-tall phone ⏳ Waiting and its Remind stay wholly above the sticky "🚗 Rides"; then P-rides (two runs, Mom & Dad's face
        // to tap on each, nothing over the sheet's edge)
        await page.goto((process.env.PIALAX_TEST_APP_URL || pathToFileURL(path.join(ROOT, 'app.html')).href) + '?idea=' + PTV, { waitUntil: 'load' }); await page.waitForTimeout(300);
        if (await page.$('#sheet:not([hidden])')) await tapJs('#sheet [data-act="sh-close"]');
        await measure('P town: the key with its 🚗 Rides row');
        const prt = await page.evaluate(() => {
          const r = document.querySelector('#screen .wk .wkr.wkride'), p = document.querySelector('#screen .split.prim [data-act="rides"]');
          if (!r) return { row: false };
          const chips = [...r.querySelectorAll('.rk')], ask = r.querySelector('.wkrem'), W = innerWidth;
          return { row: true, prim: !!p && /🚗\s*Rides/.test(p.textContent.replace(/\s+/g, ' ')), chips: chips.map((c) => c.textContent.replace(/\s+/g, '')), more: (r.querySelector('.wkn') || { textContent: '' }).textContent,
            named: chips.every((c) => /^(Lands|Leaves) O'Hare \(ORD\) /.test(c.getAttribute('aria-label') || '')), ask: ask ? ask.getAttribute('aria-label') : '',
            inside: [...r.querySelectorAll('button')].every((b) => { const x = b.getBoundingClientRect(); return x.left >= -0.5 && x.right <= W + 0.5; }) };
        });
        // (both runs where the row holds them, else the first and +1)
        const ptChips = ['🛬11/20🌴', '🛫11/30🌴'], ptN = prt.chips ? prt.chips.length : 0;
        if (!(prt.row && prt.prim && ptN >= 1 && JSON.stringify(prt.chips) === JSON.stringify(ptChips.slice(0, ptN)) && prt.more === (ptN < 2 ? '+' + (2 - ptN) : '') && prt.named && prt.ask === 'Ask Mom & Dad' && prt.inside)) fails.push('P town\'s Rides row should hold 🛬 11/20 🌴 and 🛫 11/30 🌴 (or the first and +1; named, inside the screen) and Ask Mom & Dad, under "🚗 Rides": ' + JSON.stringify(prt));
        if (vp.width >= 390 && ptN !== 2) fails.push('at ' + vp.width + 'px P town\'s Rides row should hold both its runs ' + JSON.stringify(prt));
        fails.push(...keyFails('P town\'s key', await page.evaluate(KEYCHK), ['Waiting:1:nudge', ':0' + (ptN < 2 ? '+' + (2 - ptN) : '') + ':nudge', 'Booked:1', 'Hosting:1']));
        // (PIA-160: on the organizer's phone the board draws "Mom & Dad" in the 80px column: whole or "Mom&Dad", never cut, ≥13px)
        const plO = await page.evaluate(POLISH);
        if (!(namesOk(plO) && plO.names.some((n) => /^Mom ?& ?Dad$/.test(n.t)))) fails.push('PIA-160 P town\'s board on the organizer\'s phone should draw Mom & Dad whole (or Mom&Dad) at ≥13px, every name whole: ' + JSON.stringify(plO.names));
        const shPT = await shortView();
        if (!(shPT.prim && shPT.first === true && /^⏳ Waiting$/.test(shPT.firstWord) && shPT.rem === true)) fails.push('at 678px tall P town\'s ⏳ Waiting row and its Remind should be wholly above the sticky "🚗 Rides" ' + JSON.stringify(shPT));
        // (PIA-160: the owner's phone, 440×760 with Safari's bars: the same first screen)
        if (vp.width === 430) {
          const sh440 = await shortView(440, 760, KEYCHK);
          if (!(sh440.prim && sh440.first === true && /^⏳ Waiting$/.test(sh440.firstWord) && sh440.rem === true)) fails.push('at 440×760 (the owner\'s phone) P town\'s ⏳ Waiting row and its Remind should be wholly above the sticky "🚗 Rides" ' + JSON.stringify(sh440));
          // (and its key there: the same rows as at 430, both runs in the Rides row, every row's checks)
          fails.push(...keyFails('at 440×760 P town\'s key', sh440.also, ['Waiting:1:nudge', ':0:nudge', 'Booked:1', 'Hosting:1']));
        }
        await tapJs('#screen .split.prim [data-act="rides"]'); await measure('P-rides (the organizer: two runs, Mom & Dad to tap on each)');
        const prs = await page.evaluate(() => { const a = document.querySelector('#sheet [data-act="nudge"][data-v="ride"]');
          return { popup: document.querySelector('#sheet').getAttribute('data-popup'), runs: document.querySelectorAll('#sheet .rrun').length, ask: a ? a.getAttribute('aria-label') : '',
            cands: [...document.querySelectorAll('#sheet .rrun [data-act="ride"].rcand')].map((b) => b.getAttribute('aria-label') + ':' + b.getAttribute('aria-pressed')) }; });
        if (!(prs.popup === 'P-rides' && prs.runs === 2 && JSON.stringify(prs.cands) === JSON.stringify(['Mom & Dad drives Ashwin:false', 'Mom & Dad drives Ashwin:false']) && prs.ask === 'Ask Mom & Dad')) fails.push('P-rides on the organizer\'s phone should show its two runs, Mom & Dad\'s face to tap on each, and Ask Mom & Dad: ' + JSON.stringify(prs));
        await tapJs('#sheet [data-act="sh-close"]');
        // PIA-159: Ashwin's 🛬 edit row on a rides trip at every width: the 92px field and its two 52×44 [AM | PM] radios on one line beside
        // the day, then O'Hare / Midway / Peoria as ≥64×44 pills under it, inside the sheet, nothing sideways
        await page.$eval('#screen .pb', (e) => e.scrollIntoView({ block: 'center' }));
        await tapJs('#screen .pb [data-act="flight"].mybar'); await tapJs('#sheet #tmb-arr'); await measure('P-person, Ashwin\'s 🛬 edit row ([AM | PM], three airports)');
        const er = await page.evaluate(() => {
          const sh = document.querySelector('#sheet'), S = sh.getBoundingClientRect(), row = sh.querySelector('.leg.tedit'), f = sh.querySelector('#tm-arr'), fl = f && f.closest('.fld');
          const bx = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: Math.round(r.width), h: Math.round(r.height) }; };
          const seg = [...sh.querySelectorAll('#seg-arr .segb')].map(bx), pills = [...sh.querySelectorAll('#pills-arr .pill')].map(bx), F = fl ? bx(fl) : null, R = row ? bx(row) : null;
          return { field: F && F.w, seg: seg.map((s) => s.w + 'x' + s.h), pills: pills.map((p) => p.w >= 64 && p.h >= 44), oneLine: !!R && !!F && R.h < 60 && seg.every((s) => s.t < F.b && s.b > F.t),
            inside: [F].concat(seg, pills).every((b) => !!b && b.l >= S.left - 0.5 && b.r <= S.right + 0.5), over: sh.scrollWidth - sh.clientWidth, page: document.documentElement.scrollWidth - innerWidth };
        });
        if (!(er.field === 92 && JSON.stringify(er.seg) === JSON.stringify(['52x44', '52x44']) && er.pills.length === 3 && er.pills.every(Boolean) && er.oneLine && er.inside && er.over <= 0 && er.page <= 0))
          fails.push('Ashwin\'s 🛬 edit row should hold the 92px field and two 52×44 AM / PM radios on one line, then three ≥64×44 airport pills, all inside the sheet: ' + JSON.stringify(er));
        // PIA-160: his "☑ I booked" keeps its green edge (a pressed secondary button's ink edge never reaches a booking toggle), and every
        // tappable edge in the sheet (the field, the segment, the pills, the tools) is ≥3:1 in this scheme
        const tkE = await page.evaluate(() => { const sh = document.querySelector('#sheet'), tok = document.createElement('span'); tok.style.borderTop = '2px solid var(--in)'; sh.appendChild(tok); const want = getComputedStyle(tok).borderTopColor; tok.remove();
          return [...sh.querySelectorAll('.btn.tkb.tkon')].map((b) => ({ pressed: b.getAttribute('aria-pressed'), green: getComputedStyle(b).borderTopColor === want })); });
        if (!(tkE.length >= 1 && tkE.every((t) => t.pressed === 'true' && t.green))) fails.push('PIA-160 a booked toggle ("☑ I booked") should keep its green edge: ' + JSON.stringify(tkE));
        fails.push(...contrastFails('PIA-160 Ashwin\'s P-person edit row, its edges', await page.evaluate(CONTRAST, { edges: EDGE_SEL, root: '#sheet' }), { edges: true }));
        // the echo of a saved time never covers the primary or the tab bar (S1): "305" (his PM carried), ⌄, the page scrolled to its foot
        await page.fill('#sheet #tm-arr', '305'); await tapJs('#sheet [data-act="sh-close"]');
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForFunction(() => { const t = document.querySelector('#toast'); return !!t && !t.hidden && /✓/.test(t.textContent); }, null, { timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(120);
        const tp = await page.evaluate(() => {
          const t = document.querySelector('#toast'), box = (e) => { if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return r.height ? { t: r.top, b: r.bottom, l: r.left, r: r.right } : null; };
          const T = box(t), P = box(document.querySelector('#screen .split.prim')), B = box(document.querySelector('#tabbar'));
          const meet = (o) => !!T && !!o && Math.min(T.r, o.r) - Math.max(T.l, o.l) > 0 && Math.min(T.b, o.b) - Math.max(T.t, o.t) > 0;
          return { shown: !!T && !t.hidden, text: t.textContent.replace(/\s+/g, ' ').trim(), top: t.classList.contains('top'), hitsPrim: meet(P), hitsTab: meet(B), gap: T && P && !t.classList.contains('top') ? Math.round(P.t - T.b) : null, inView: !!T && T.t >= 0 && T.b <= innerHeight };
        });
        if (!(tp.shown && /✓/.test(tp.text) && !tp.hitsPrim && !tp.hitsTab && tp.inView && (tp.gap === null || tp.gap >= 8))) fails.push('the echo toast should never cover the primary or the tab bar (8px above the higher, else at the top): ' + JSON.stringify(tp));
        // PIA-160: the one-half echo ("🛬 ORD 3:05 PM ✓") is one line at every width, its ✓ never alone on a second; 17px, ≥4.5:1 (read
        // once its fade-in is over)
        await page.waitForFunction(() => { const t = document.querySelector('#toast'); return !!t && !t.hidden && getComputedStyle(t).opacity === '1'; }, null, { timeout: 2000 }).catch(() => {});
        const ech = await page.evaluate(() => { const e = document.querySelector('#toast .ech'); if (!e) return null; const lh = parseFloat(getComputedStyle(e).lineHeight) || 22;
          return { lines: Math.round(e.getBoundingClientRect().height / lh), halves: e.querySelectorAll('.nw').length, fs: parseFloat(getComputedStyle(e).fontSize), t: e.textContent }; });
        if (!(ech && ech.lines === 1 && ech.halves === 1 && /✓$/.test(ech.t) && Math.abs(ech.fs - 17) < 0.3)) fails.push('PIA-160 the one-half echo toast should be one 17px line with its ✓: ' + JSON.stringify(ech));
        fails.push(...contrastFails('PIA-160 the echo toast\'s text', await page.evaluate(CONTRAST, { ink: '#toast' }), { ink: true }));
        // PIA-157: the rides trip of 8 on its PIA host's own phone (a guest; Bartholomew hosts at ORD too): eleven runs at ORD and PIA,
        // her "☐ 🚗 Drive" on each (a ≥44px target, named, inside the sheet; the word while the sheet keeps ≤20), the long names never
        // pushing anything over the edge; and the key's Rides row holding what fits, then +N
        await page.goto((process.env.PIALAX_TEST_APP_URL || pathToFileURL(path.join(ROOT, 'app.html')).href) + '?idea=' + R8V, { waitUntil: 'load' }); await page.waitForTimeout(300);
        if (await page.$('#sheet:not([hidden])')) await tapJs('#sheet [data-act="sh-close"]');
        await measure('the rides trip of 8 (a host\'s phone: the key\'s Rides row, +N)');
        const r8k = await page.evaluate(() => { const r = document.querySelector('#screen .wk .wkr.wkride'); return r ? { chips: r.querySelectorAll('.rk').length, more: (r.querySelector('.wkn') || { textContent: '' }).textContent, over: document.documentElement.scrollWidth - innerWidth } : null; });
        if (!(r8k && r8k.chips >= 1 && r8k.chips < 11 && r8k.more === '+' + (11 - r8k.chips) && r8k.over <= 0)) fails.push('the 8-person rides trip\'s key should hold the open runs that fit, then +N, with no sideways scroll: ' + JSON.stringify(r8k));
        await tapJs('#screen .split.prim [data-act="rides"]'); await measure('P-rides (a host of 8: eleven runs, ☐ 🚗 Drive on each)');
        const r8s = await page.evaluate(() => {
          const sh = document.querySelector('#sheet'), S = sh.getBoundingClientRect(), d = [...sh.querySelectorAll('.rrun [data-act="ride"].rdrv')];
          return { popup: sh.getAttribute('data-popup'), runs: sh.querySelectorAll('.rrun').length, folds: sh.querySelectorAll('.rfold').length, secs: [...sh.querySelectorAll('.rday')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()), drive: d.length,
            fit: d.every((b) => { const x = b.getBoundingClientRect(); return x.height >= 43.5 && x.width >= 43.5 && x.left >= S.left - 0.5 && x.right <= S.right + 0.5; }) &&
              [...sh.querySelectorAll('.rleg, .rrh')].every((e) => { const x = e.getBoundingClientRect(); return x.right <= S.right + 0.5 && e.scrollWidth <= e.clientWidth + 1; }) };
        });
        // (PIA-159: by day, each drawn run with its 44px toggle; past 20 words the ladder folds the runs but one to their chips)
        if (!(r8s.popup === 'P-rides' && r8s.runs + r8s.folds === 11 && r8s.runs >= 1 && r8s.secs.length >= 1 && r8s.secs.every((s) => /^((Mon|Tue|Wed|Thu|Fri|Sat|Sun) )?\d{1,2}\/\d{1,2}$/.test(s)) && r8s.drive === r8s.runs && r8s.fit)) fails.push('P-rides on the host\'s phone of 8 should hold its 11 runs by day (drawn or folded to chips), a 44px ☐ 🚗 Drive on each drawn run, nothing over the sheet\'s edge: ' + JSON.stringify(r8s));
        await tapJs('#sheet [data-act="sh-close"]');
        // PIA-158: P town with Nebby and Kona on Ashwin's phone: the side bubble (16px on the board's 44px faces, 18px on P-person's 72px)
        // never meets ×2, 📝, the top badge or the status mark; the header's picture is a 72×44 button; P-house's picture and its 18 dishes
        // stay inside the sheet, every tile a 44px target
        await page.goto((process.env.PIALAX_TEST_APP_URL || pathToFileURL(path.join(ROOT, 'app.html')).href) + '?idea=' + PTN, { waitUntil: 'load' }); await page.waitForTimeout(300);
        if (await page.$('#sheet:not([hidden])')) await tapJs('#sheet [data-act="sh-close"]');
        await measure('P town with Nebby and Kona: the board\'s bubbles');
        const BUBBLES = (root) => [...document.querySelectorAll(root + ' .av')].filter((a) => a.querySelector('.pet')).map((a) => {
          const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
          const p = box(a.querySelector('.pet')), meet = (o) => !!o && Math.min(p.r, o.r) - Math.max(p.l, o.l) > 0.25 && Math.min(p.b, o.b) - Math.max(p.t, o.t) > 0.25;
          const others = { cnt: box(a.querySelector('.cnt')), bd: box(a.querySelector('.bd:not(.bd2)')), bd2: box(a.querySelector('.bd2')), mk: box(a.querySelector('.mk')) };
          return { g: a.querySelector('.pet').textContent, size: Math.round(p.w) + 'x' + Math.round(p.h), hits: Object.keys(others).filter((k) => meet(others[k])), has: Object.keys(others).filter((k) => !!others[k]), left: p.l };
        });
        const bb = await page.evaluate(BUBBLES, '#screen .pb');
        const head = await page.evaluate(() => { const b = document.querySelector('#screen .thead [data-act="house"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), name: b.getAttribute('aria-label') }; });
        if (!(bb.length === 2 && bb.every((x) => x.hits.length === 0 && x.size === '16x16' && x.left >= 0) && bb.some((x) => x.g === '🐕' && x.has.indexOf('cnt') >= 0 && x.has.indexOf('bd2') >= 0) && bb.some((x) => x.g === '🐈')))
          fails.push('the board\'s side bubbles (🐕 on Mom & Dad\'s face with ×2 and 📝, 🐈 on Ashwin\'s) should be 16px and meet no other mark, on screen: ' + JSON.stringify(bb));
        if (!(head && head.w === 72 && head.h === 44 && head.name === 'House')) fails.push('the trip header\'s picture should be a 72×44 button named House: ' + JSON.stringify(head));
        await tapJs('#screen .pb [data-act="person"][data-code="momdad-k3"]'); await measure('P-person, Mom & Dad (🐕 beside the 72px face, 🐕 Kona, 🐈 11/20–11/30 ›)');
        const pb = await page.evaluate(BUBBLES, '#sheet .pav');
        if (!(pb.length === 1 && pb[0].size === '18x18' && pb[0].hits.length === 0 && pb[0].g === '🐕')) fails.push('P-person\'s 72px face should carry its 18px bubble meeting no other mark: ' + JSON.stringify(pb));
        await tapJs('#sheet [data-act="sh-close"]');
        await tapJs('#screen .thead [data-act="house"]'); await measure('P-house (the house today, 🧺)');
        await tapJs('#sheet [data-act="dishpick"][data-code="ashwin-p8"]'); await measure('P-house, the 18 dishes open');
        const hz = await page.evaluate(() => {
          const sh = document.querySelector('#sheet'), S = sh.getBoundingClientRect(), pic = sh.querySelector('.hpic').getBoundingClientRect(), tiles = [...sh.querySelectorAll('.dtile')];
          // (PIA-160: the potluck chip keeps its own 1.5px pill edge, which 📍 no longer wears)
          const ch = sh.querySelector('.dishes .dchip'), cs = ch ? getComputedStyle(ch) : null;
          return { popup: sh.getAttribute('data-popup'), pic: pic.left >= S.left - 0.5 && pic.right <= S.right + 0.5 && pic.height >= 100, tiles: tiles.length,
            fit: tiles.every((b) => { const x = b.getBoundingClientRect(); return x.width >= 43.5 && x.height >= 43.5 && x.left >= S.left - 0.5 && x.right <= S.right + 0.5; }), over: sh.scrollWidth - sh.clientWidth,
            chip: cs ? (ch.classList.contains('mine') ? 'mine' : 'other') + '|' + cs.borderTopWidth + '|' + cs.borderTopStyle + '|' + (parseFloat(cs.borderTopLeftRadius) >= 20) : 'none' };
        });
        if (!(hz.popup === 'P-house' && hz.pic && hz.tiles === 18 && hz.fit && hz.over <= 0 && /^(mine\|2px|other\|1\.5px)\|solid\|true$/.test(hz.chip))) fails.push('P-house\'s picture and its 18 dishes should stay inside the sheet, each tile a 44px target, the 🧺 chips keeping their pill edge (1.5px, mine 2px): ' + JSON.stringify(hz));
        fails.push(...contrastFails('PIA-160 P-house\'s dish tiles and chips, their edges', await page.evaluate(CONTRAST, { edges: EDGE_SEL, root: '#sheet' }), { edges: true }));
        await tapJs('#sheet [data-act="dishpick"][data-code="ashwin-p8"]');
        await tapJs('#sheet [data-act="sh-close"]');
        // (fix pass) Ashwin's own P-person with Nebby on ("☑ 🐈 Nebby" and its › n/5) and P-pet (its 5 ticks, a tick on, the travel plan
        // open), measured like every state: no horizontal scroll, every target 44px and named
        await tapJs('#screen .pb [data-act="person"][data-code="ashwin-p8"]'); await measure('P-person, Ashwin (☑ 🐈 Nebby, › n/5)');
        const nebRow = await page.evaluate(() => {
          const sh = document.querySelector('#sheet'), S = sh.getBoundingClientRect(), r = sh.querySelector('.petrow');
          return r ? [...r.querySelectorAll('button')].map((b) => { const x = b.getBoundingClientRect(); return { act: b.getAttribute('data-act'), h: Math.round(x.height), w: Math.round(x.width), in: x.left >= S.left - 0.5 && x.right <= S.right + 0.5 }; }) : null;
        });
        await tapJs('#sheet .petrow [data-act="petsheet"]'); await measure('P-pet on Ashwin\'s phone (5 ticks, the folds)');
        await tapJs('#sheet [data-act="pettick"][data-v="p"]'); await page.$eval('#sheet .pet-notes summary', (e) => e.click()); await page.waitForTimeout(110);
        await measure('P-pet, a tick on and Nebby\'s travel plan open');
        const ppet = await page.evaluate(() => {
          const sh = document.querySelector('#sheet'), S = sh.getBoundingClientRect(), ticks = [...sh.querySelectorAll('[data-act="pettick"]')];
          return { popup: sh.getAttribute('data-popup'), ticks: ticks.length, fit: ticks.every((b) => { const x = b.getBoundingClientRect(); return x.height >= 43.5 && x.left >= S.left - 0.5 && x.right <= S.right + 0.5; }),
            open: !!sh.querySelector('.pet-notes[open]'), folds: sh.querySelectorAll('.pet-notes').length, over: sh.scrollWidth - sh.clientWidth };
        });
        if (!(nebRow && nebRow.length === 2 && nebRow.map((b) => b.act).join() === 'pet,petsheet' && nebRow.every((b) => b.h >= 44 && b.w >= 44 && b.in)))
          fails.push('Ashwin\'s Nebby row (☑ 🐈 Nebby, › n/5) should be two 44px targets inside the sheet: ' + JSON.stringify(nebRow));
        if (!(ppet.popup === 'P-pet' && ppet.ticks === 5 && ppet.fit && ppet.open && ppet.folds === 2 && ppet.over <= 0)) fails.push('P-pet\'s 5 ticks and its two folds should stay inside the sheet, each tick a 44px target: ' + JSON.stringify(ppet));
        await tapJs('#sheet [data-act="pettick"][data-v="p"]');
        await tapJs('#sheet [data-act="sh-close"]');
        // PIA-159 (fix pass): P town all set with the real flights on Mom & Dad's phone. The board's 13px labels stay inside their tracks
        // and meet neither each other nor a face or its bubble, every timed label (and its AM / PM) at ≥4.5:1 in this scheme; opened from
        // its card, "🎊 All set" never covers the drive primary ("🚗 11/20 ⏰ 12:05 PM ORD": #158 drew the toast over it) or the tab bar
        const APP = process.env.PIALAX_TEST_APP_URL || pathToFileURL(path.join(ROOT, 'app.html')).href;
        await page.goto(APP + '?idea=' + PT9V, { waitUntil: 'load' }); await page.waitForTimeout(300);
        if (await page.$('#sheet:not([hidden])')) await tapJs('#sheet [data-act="sh-close"]');
        await measure('P town all set on Mom & Dad\'s phone (the real flights, every ride theirs)');
        const lb = await page.evaluate(() => {
          const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
          const meet = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
          const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
          const L = (rgb) => { const m = /(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)/.exec(rgb || ''); return m ? 0.2126 * lin(+m[1]) + 0.7152 * lin(+m[2]) + 0.0722 * lin(+m[3]) : null; };
          const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
          const ratio = (e) => { const a = L(getComputedStyle(e).color), b = L(bgOf(e)); return a == null || b == null ? 0 : (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
          const labs = [...document.querySelectorAll('#screen .pb .track .btm')].filter((e) => e.getClientRects().length), faces = [...document.querySelectorAll('#screen .pb .av')].map(box);
          const txt = labs.map((e) => e.textContent.replace(/\s+/g, ' ').trim()), out = { text: txt, out: [], hit: [], face: [], low: [] };
          labs.forEach((e, i) => {
            const b = box(e), tr = box(e.closest('.track'));
            if (b.l < tr.l - 0.5 || b.r > tr.r + 0.5 || b.t < tr.t - 0.5 || b.b > tr.b + 0.5) out.out.push(txt[i] + ' ' + [b.l, b.r, b.t, b.b, tr.l, tr.r, tr.t, tr.b].map(Math.round).join(',') + ' ' + e.closest('.track').className);
            labs.forEach((f, j) => { if (j > i && meet(b, box(f))) out.hit.push(txt[i] + ' | ' + txt[j]); });
            if (faces.some((x) => meet(b, x))) out.face.push(txt[i]);
            if (!e.classList.contains('miss')) { const r = ratio(e), mr = e.querySelector('.mer'), r2 = mr ? ratio(mr) : 99; if (r < 4.5 || r2 < 4.5) out.low.push(txt[i] + ' ' + r.toFixed(2) + '/' + r2.toFixed(2)); }
          });
          return out;
        });
        if (!(JSON.stringify(lb.text) === JSON.stringify(['2:35 PM', '3:47 PM', 'MDW 10:30 PM', '5:10 PM']) && !lb.out.length && !lb.hit.length && !lb.face.length && !lb.low.length))
          fails.push('P town\'s board labels on Mom & Dad\'s phone should read 2:35 PM, 3:47 PM, MDW 10:30 PM, 5:10 PM, each inside its track, meeting no other label or face, at ≥4.5:1: ' + JSON.stringify(lb));
        // PIA-160: the same page at the default text size: nothing with a letter or a digit under 13px, AM / PM ≥13px, the board's labels
        // 15px, one 80px name column (the board's names, the key's words, the title starting where the bars do), 📍 without the potluck
        // pill; then P-rides from the drive primary: each Drive inside its card at the header's right edge, no dashes inside dashes
        const pl0 = await page.evaluate(POLISH);
        if (!(pl0.small.length === 0 && pl0.mer >= 12.95 && pl0.btm.every((s) => s === 15) && pl0.btm.length === 4 && !pl0.out && pl0.who.every((w) => Math.abs(w - 80) < 0.6) && pl0.wkl.every((w) => w >= 79.5 && w <= 80.5) &&
          pl0.colOk && Math.abs(pl0.title - pl0.bars) <= 1 && pl0.pin === '0px|none' && pl0.over <= 0 && namesOk(pl0) && pl0.names.filter((n) => !/^Mom ?& ?Dad$/.test(n.t)).every((n) => n.fs === 15) &&
          pl0.prim > 0 && pl0.prim <= 240 && pl0.primIn))
          fails.push('PIA-160 P town on Mom & Dad\'s phone: no text under 13px, AM / PM ≥13px, 15px labels on their tracks, the 80px name column (names, key words no wider than it and the title on one grid), 📍 without a border, the names whole (Mom & Dad or Mom&Dad, ≥13px; the others 15px), the two-line drive primary\'s content ≤240px inside its button: ' + JSON.stringify(pl0));
        // (PIA-160: every tappable edge on the page ≥3:1; the drive primary's two lines (.d2 too), the names, the key's words and the
        // board's labels ≥4.5:1, in this scheme)
        fails.push(...contrastFails('PIA-160 P town on Mom & Dad\'s phone, edges and small text', await page.evaluate(CONTRAST, { edges: EDGE_SEL, root: '#screen', ink: '#screen .btn.pri.drv, #screen .pb-row .who .fn, #screen .wk .wkl, #screen .track .btm' }), { edges: true, ink: true }));
        const FIT = vp.width === 390 && scheme === 'light';   // (PIA-161: the width × text-size matrices run on the 390 light phone, as the tells do)
        if (FIT) {
          // PIA-161 (d): the locked pill keeps "10🌙 🔒" together at 320px at every text size (and at 360px), inside its row, never scrolling
          const pf = [];
          for (const [w, rp] of [[320, 17], [320, 19], [320, 21], [320, 23], [360, 17]]) {
            await sizeTo(page, vp, w, rp); const f = await page.evaluate(PILLFIT);
            if (!(f && f.lockWithNights && f.sw <= 1 && f.inRow)) pf.push(w + '×' + rp + ': ' + JSON.stringify(f));
          }
          await sizeBack(page, vp);
          fitReport('(d) the trip page\'s date pill keeps "10🌙 🔒" on one line inside its row at 320px (every text size) and 360px', pf);
        }
        await tapJs('#screen .split.prim .btn.pri.drv'); await page.waitForTimeout(120);
        const rd = await page.evaluate(() => {
          const sh = document.querySelector('#sheet'), runs = [...sh.querySelectorAll('.rrun')], tok = document.createElement('span');
          tok.style.backgroundColor = 'var(--sunk)'; sh.appendChild(tok); const sunk = getComputedStyle(tok).backgroundColor; tok.remove();
          // (each run's codes and times in columns: every leg's .ap starts, and every leg's .tm ends, at the same x, ±1)
          const col = runs.map((r) => { const ap = [...r.querySelectorAll('.rleg .ap')].map((e) => e.getBoundingClientRect().left), tm = [...r.querySelectorAll('.rleg .tm')].map((e) => e.getBoundingClientRect().right);
            return { legs: r.querySelectorAll('.rleg').length, ap: ap.length && Math.max(...ap) - Math.min(...ap) <= 1, tm: tm.length && Math.max(...tm) - Math.min(...tm) <= 1 }; });
          return { popup: sh.getAttribute('data-popup'), drives: runs.filter((r) => r.querySelector('.rdrv')).map((r) => { const c = r.getBoundingClientRect(), h = r.querySelector('.rrh').getBoundingClientRect(), d = r.querySelector('.rdrv').getBoundingClientRect(), cs = getComputedStyle(r);
            return { inCard: d.left >= c.left - 0.5 && d.right <= c.right + 0.5, right: Math.round(h.right - d.right), h: Math.round(d.height), edge: getComputedStyle(r.querySelector('.rdrv')).borderTopStyle, fill: cs.backgroundColor === sunk || r.classList.contains('done') }; }),
            heads: [...sh.querySelectorAll('.rday')].map((e) => { const r = e.getBoundingClientRect(); return { one: r.height < parseFloat(getComputedStyle(e).lineHeight || '20') * 1.6 || r.height < 30, ink: getComputedStyle(e).color === getComputedStyle(document.body).color }; }),
            nested: [...sh.querySelectorAll('.rrun.open .rq')].filter((q) => getComputedStyle(q).borderTopStyle !== 'none').length, over: sh.scrollWidth - sh.clientWidth, col };
        });
        if (!(rd.popup === 'P-rides' && rd.drives.length >= 2 && rd.drives.every((d) => d.inCard && Math.abs(d.right) <= 1.5 && d.h >= 47.5 && d.edge === 'solid' && d.fill) && rd.heads.length >= 2 && rd.heads.every((h) => h.one && h.ink) && !rd.nested && rd.over <= 0 &&
          rd.col.some((c) => c.legs >= 2) && rd.col.every((c) => c.ap && c.tm)))
          fails.push('PIA-160 P-rides on Mom & Dad\'s phone: every "☐ 🚗 Drive" a 48px control with a solid edge, inside its card (on the soft grey fill) at the header\'s right edge (the Midway card too), day heads one line in full ink, no dashes inside dashes, each run\'s codes and times in columns (a run of two legs among them): ' + JSON.stringify(rd));
        fails.push(...contrastFails('PIA-160 P-rides on Mom & Dad\'s phone, edges and small text', await page.evaluate(CONTRAST, { edges: EDGE_SEL, root: '#sheet', ink: '#sheet .rday, #sheet .rrh, #sheet .rleg' }), { edges: true, ink: true }));
        // PIA-161 (a): Mom & Dad's P-rides, every leg claimed: at this phone's own size (every context, light and dark), then on the 390
        // light phone at every width × text size: each leg "① 💪🐈 ORD 3:47 PM 🌽" one line (or its face over the indented tail, never a
        // lone 🌽), 🛬 / 🛫 beside ⏰, Drive at the card's right edge, the columns kept, nothing sideways
        fitReport('(a0) Mom & Dad\'s P-rides (claimed) at ' + label, legFails('P-rides (claimed)', await page.evaluate(LEGFIT), vp.width, 17));
        if (FIT) {
          const lf = [];
          for (const w of FIT_W) for (const rp of FIT_R) { await sizeTo(page, vp, w, rp); lf.push(...legFails('P-rides (claimed)', await page.evaluate(LEGFIT), w, rp)); }
          await sizeBack(page, vp);
          fitReport('(a) Mom & Dad\'s P-rides (claimed) at 320–440px × roots 17–23: every leg one line from 375px and at the default size, else its face over the 32px-indented tail; 🛬 / 🛫 with ⏰; Drive at the right edge (at 390 on the 12:05 and 11:15 lines, from 402 on every line); columns; 🐈 in its box', lf);
        }
        await tapJs('#sheet [data-act="sh-close"]');
        // PIA-160: a larger text size (the root at 23px, an iPhone's largest Text Size steps): the screen grows within its cap and still
        // never scrolls sideways, every label stays on its track, the name column is 88px; P-rides grows to the sheets' cap
        await page.addStyleTag({ content: 'html{font-size:23px!important}' }); await tapJs('#screen .split.prim .btn.pri.drv'); await tapJs('#sheet [data-act="sh-close"]'); await page.waitForTimeout(120);
        const pl23 = await page.evaluate(POLISH);
        await tapJs('#screen .split.prim .btn.pri.drv'); await page.waitForTimeout(120);
        const rs23 = await page.evaluate(() => { const sh = document.querySelector('#sheet'), l = sh.querySelector('.rleg'); return { over: sh.scrollWidth - sh.clientWidth, leg: l ? parseFloat(getComputedStyle(l).fontSize) : 0, head: parseFloat(getComputedStyle(sh.querySelector('.rday')).fontSize) }; });
        await tapJs('#sheet [data-act="sh-close"]');
        if (!(pl23.small.length === 0 && !pl23.out && pl23.over <= 0 && pl23.who.every((w) => Math.abs(w - 88) < 0.6) && pl23.btm.every((s) => Math.abs(s - 15 * 1.118) < 0.3) && Math.abs(rs23.leg - 23) < 0.3 && Math.abs(rs23.head - 15 * 1.353) < 0.3 && rs23.over <= 0 &&
          namesOk(pl23) && pl23.primIn))
          fails.push('PIA-160 at a 23px root on Mom & Dad\'s phone: no sideways scroll, labels on their tracks at the screens\' cap (16.8px), the 88px name column, the names whole, the drive primary inside the screen, P-rides at the sheets\' cap (legs 23px, day heads 20.3px) with no sideways scroll: ' + JSON.stringify({ pl23, rs23 }));
        await page.evaluate(() => { [...document.querySelectorAll('style')].filter((s) => /font-size:23px!important/.test(s.textContent)).forEach((s) => s.remove()); });
        // (a link landing never cheers: Trips again (the list), then its card)
        await tapJs('#tabbar [data-act="tab"][data-v="trips"]'); await page.waitForTimeout(150);
        if (await page.$('#screen [data-act="seg"][data-v="ideas"][aria-pressed="false"]')) await tapJs('#screen [data-act="seg"][data-v="ideas"]');
        if (FIT) {
          // PIA-161 (e): the P town card on 10/17 ("🚗 / 11/20" in its slot): "thanksgiving" never broken inside the word, the slot's
          // lines inside its 48px box, the slot inside the card, a 44px target, on a row of its own under the title below 360px only
          const cf = [];
          for (const [w, rp] of [[320, 17], [320, 23], [390, 23], [360, 17]]) { await sizeTo(page, vp, w, rp); cf.push(...cardFails('the P town card on 10/17', await page.evaluate(CARDFIT, PT9V), w, rp)); }
          await sizeBack(page, vp);
          fitReport('(e) the P town card on 10/17 at 320 (17, 23), 360 and 390 (23): "thanksgiving" whole, the slot\'s two lines inside it, a 44px target in the card, under the title below 360px', cf);
        }
        await page.click('#screen [data-trip="' + PT9V + '"]', { position: { x: 140, y: 28 } });
        await page.waitForFunction(() => { const t = document.querySelector('#toast'); return !!t && !t.hidden && /All set/.test(t.textContent); }, null, { timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(120);
        const pty = await page.evaluate(() => {
          const t = document.querySelector('#toast'), box = (e) => { if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return r.height ? { t: r.top, b: r.bottom, l: r.left, r: r.right } : null; };
          const T = box(t), pr = document.querySelector('#screen .split.prim'), P = box(pr), B = box(document.querySelector('#tabbar'));
          const meet = (o) => !!T && !!o && Math.min(T.r, o.r) - Math.max(T.l, o.l) > 0 && Math.min(T.b, o.b) - Math.max(T.t, o.t) > 0;
          return { shown: !!T && !t.hidden, text: t.textContent.replace(/\s+/g, ' ').trim(), prim: pr ? !!pr.querySelector('.btn.pri.drv') : false, top: t.classList.contains('top'), hitsPrim: meet(P), hitsTab: meet(B), gap: T && P && !t.classList.contains('top') ? Math.round(P.t - T.b) : null, inView: !!T && T.t >= 0 && T.b <= innerHeight };
        });
        if (!(pty.shown && /All set/.test(pty.text) && pty.prim && !pty.hitsPrim && !pty.hitsTab && pty.inView && (pty.gap === null || pty.gap >= 8))) fails.push('"🎊 All set" on Mom & Dad\'s phone should never cover the drive primary or the tab bar (8px above the higher, else at the top): ' + JSON.stringify(pty));
        await measure('P town all set on Mom & Dad\'s phone, opened from its card (🎊 All set)');
        // PIA-160: the day after Mom & Dad's first drives (11/21, midday): the two 11/20 runs are home, muted and never faded (opacity 1,
        // no fill, a hairline, the header in the secondary ink at ≥4.5:1) and their Drive quiet (aria-disabled, the sunk fill, --ink2, a
        // solid --edge, opacity 1); the 11/30 runs still live. Then the clock goes back to 10/17
        await page.clock.setFixedTime(new Date('2026-11-21T20:00:00Z'));
        await page.goto(APP + '?idea=' + PT9V, { waitUntil: 'load' }); await page.waitForTimeout(300);
        if (await page.$('#sheet:not([hidden])')) await tapJs('#sheet [data-act="sh-close"]');
        await tapJs('#screen [data-act="rides"]'); await page.waitForTimeout(120);
        await measure('P-rides on Mom & Dad\'s phone on 11/21 (the 11/20 runs home)');
        const dn = await page.evaluate(() => {
          const sh = document.querySelector('#sheet'), tok = document.createElement('span');
          tok.style.cssText = 'color: var(--ink2); background-color: var(--sunk); border-top: 2px solid var(--edge)'; sh.appendChild(tok);
          const T = getComputedStyle(tok), want = { ink2: T.color, sunk: T.backgroundColor, edge: T.borderTopColor }; tok.remove();
          return { popup: sh.getAttribute('data-popup'), live: sh.querySelectorAll('.rrun:not(.done)').length,
            done: [...sh.querySelectorAll('.rrun.done')].map((r) => { const cs = getComputedStyle(r); return { op: cs.opacity, fill: cs.backgroundColor, ink: getComputedStyle(r.querySelector('.rrh')).color === want.ink2 }; }),
            drive: [...sh.querySelectorAll('.rrun.done .rdrv')].map((b) => { const cs = getComputedStyle(b);
              return { dis: b.classList.contains('dis') && b.getAttribute('aria-disabled') === 'true', op: cs.opacity, style: cs.borderTopStyle, edge: cs.borderTopColor === want.edge, fill: cs.backgroundColor === want.sunk, ink: cs.color === want.ink2 }; }) };
        });
        if (!(dn.popup === 'P-rides' && dn.live >= 1 && dn.done.length >= 1 && dn.done.every((r) => r.op === '1' && /rgba\(0, 0, 0, 0\)|transparent/.test(r.fill) && r.ink) &&
          dn.drive.length >= 1 && dn.drive.every((d) => d.dis && d.op === '1' && d.style === 'solid' && d.edge && d.fill && d.ink)))
          fails.push('PIA-160 on 11/21 Mom & Dad\'s P-rides should draw the 11/20 runs home muted (opacity 1, no fill, the secondary ink) with a quiet Drive (aria-disabled, sunk, --ink2, solid --edge), the 11/30 runs live: ' + JSON.stringify(dn));
        fails.push(...contrastFails('PIA-160 a run that is home and its quiet Drive', await page.evaluate(CONTRAST, { edges: EDGE_SEL, root: '#sheet', ink: '#sheet .rrun.done' }), { edges: true, ink: true }));
        await tapJs('#sheet [data-act="sh-close"]');
        if (FIT) {
          // PIA-161 (f): the P town card on 11/19, its slot "🚗⏰ / 12:05 PM": the same at 320 (17, 23), 375 (19, 23) and 390 (23)
          // (360px with a 19–23px root still breaks "thanksgiving" there: an Android width, recorded, not asserted)
          await page.clock.setFixedTime(new Date('2026-11-19T17:00:00Z'));
          await page.goto(APP, { waitUntil: 'load' }); await page.waitForTimeout(300);
          if (await page.$('#sheet:not([hidden])')) await tapJs('#sheet [data-act="sh-close"]');
          if (await page.$('#screen [data-act="seg"][data-v="ideas"][aria-pressed="false"]')) await tapJs('#screen [data-act="seg"][data-v="ideas"]');
          const cf = [];
          for (const [w, rp] of [[320, 17], [320, 23], [375, 19], [375, 23], [390, 23]]) { await sizeTo(page, vp, w, rp); cf.push(...cardFails('the P town card on 11/19', await page.evaluate(CARDFIT, PT9V), w, rp)); }
          await sizeBack(page, vp);
          fitReport('(f) the P town card on 11/19 ("🚗⏰ / 12:05 PM") at 320 (17, 23), 375 (19, 23) and 390 (23): "thanksgiving" whole, the slot inside it and the card, under the title below 360px', cf);
        }
        await page.clock.setFixedTime(new Date('2026-10-17T19:00:00Z'));
        if (FIT) {
          // PIA-161 (b): nobody driving yet (every leg "🚗?") on Mom & Dad's phone: P-rides from its primary, the same matrix and
          // assertions as (a); then Anjo's read-only P-person rows ("🛬 11/20 [MDW 10:30 PM] 🚗?"): her time and its 🚗? together,
          // under the day together where the row cannot hold them, at x = 0 of the row, nothing sideways
          await page.goto(APP + '?idea=' + PT9O, { waitUntil: 'load' }); await page.waitForTimeout(300);
          if (await page.$('#sheet:not([hidden])')) await tapJs('#sheet [data-act="sh-close"]');
          await tapJs('#screen .split.prim [data-act="rides"]'); await page.waitForTimeout(120);
          const lf = [];
          if ((await page.getAttribute('#sheet', 'data-popup').catch(() => null)) !== 'P-rides') lf.push('the primary should open P-rides');
          else for (const w of FIT_W) for (const rp of FIT_R) { await sizeTo(page, vp, w, rp); lf.push(...legFails('P-rides (nobody driving)', await page.evaluate(LEGFIT), w, rp)); }
          await sizeBack(page, vp);
          fitReport('(b) Mom & Dad\'s P-rides with nobody driving yet at 320–440px × roots 17–23: the same as (a), never a lone 🚗?', lf);
          await tapJs('#sheet [data-act="sh-close"]');
          await tapJs('#screen .pb [data-act="person"][data-code="anjo-z5"]');
          const rf = [];
          if ((await page.getAttribute('#sheet', 'data-popup').catch(() => null)) !== 'P-person') rf.push('Anjo\'s face should open her P-person');
          else for (const w of FIT_W) for (const rp of FIT_R) { await sizeTo(page, vp, w, rp); rf.push(...rowFails('Anjo\'s P-person (read only)', await page.evaluate(ROWFIT), w, rp, false)); }
          await sizeBack(page, vp);
          fitReport('(b2) Anjo\'s read-only P-person rows on Mom & Dad\'s phone at 320–440px × roots 17–23: [MDW time] and its 🚗? together, the day together, a wrapped group at the row\'s left, nothing sideways', rf);
          await tapJs('#sheet [data-act="sh-close"]');
        }
        // Ashwin's own phone: P-rides' joined 11/30 drive, his leg ① 💪🐈 ORD 3:47 PM with its driver and his own 🚌 / 🚙: every leg row
        // inside the sheet (it may wrap, never scroll), every control a 44px target inside it
        await page.goto(APP + '?idea=' + PT9A, { waitUntil: 'load' }); await page.waitForTimeout(300);
        if (await page.$('#sheet:not([hidden])')) await tapJs('#sheet [data-act="sh-close"]');
        await tapJs('#screen .wk [data-act="rides"].wkl'); await measure('P-rides on Ashwin\'s own phone (the joined 11/30 drive, his 🚌 / 🚙)');
        const own = await page.evaluate(() => {
          const sh = document.querySelector('#sheet'), S = sh.getBoundingClientRect(), legs = [...sh.querySelectorAll('.rleg')];
          const mine = legs.filter((e) => /ORD/.test(e.textContent) && /3:47/.test(e.textContent))[0];
          return { popup: sh.getAttribute('data-popup'), legs: legs.length, mine: !!mine, own: mine ? [...mine.querySelectorAll('[data-act="ground"]')].length : -1,
            fit: legs.every((e) => { const x = e.getBoundingClientRect(); return x.left >= S.left - 0.5 && x.right <= S.right + 0.5 && e.scrollWidth <= e.clientWidth + 1; }) &&
              [...sh.querySelectorAll('.rleg button')].every((b) => { const x = b.getBoundingClientRect(); return x.width >= 43.5 && x.height >= 43.5 && x.left >= S.left - 0.5 && x.right <= S.right + 0.5; }), over: sh.scrollWidth - sh.clientWidth };
        });
        if (!(own.popup === 'P-rides' && own.mine && own.own >= 2 && own.fit && own.over <= 0)) fails.push('P-rides on Ashwin\'s own phone should keep his 11/30 leg (ORD 3:47 PM with 🚌 / 🚙) and every leg row inside the sheet, each control a 44px target: ' + JSON.stringify(own));
        // PIA-161 (g): 🚌 🚙 (.rgp) keep to the leg's right edge, on the leg's line or on a line of their own under it, the pair together
        const gp = await page.evaluate(() => {
          const R = (e) => e.getBoundingClientRect(), cy = (e) => { const r = R(e); return (r.top + r.bottom) / 2; };
          return [...document.querySelectorAll('#sheet .rleg .rgp')].map((g) => { const lg = g.closest('.rleg'), b = [...g.querySelectorAll('[data-act="ground"]')];
            return { right: Math.round((R(lg).right - parseFloat(getComputedStyle(lg).paddingRight) - R(g).right) * 10) / 10, pair: b.length < 2 || Math.abs(cy(b[0]) - cy(b[1])) <= 4, text: lg.textContent.replace(/\s+/g, ' ').trim() }; });
        });
        fitReport('(g) Ashwin\'s own P-rides at ' + label + ': each 🚌 🚙 pair together at its leg\'s right edge', gp.length ? gp.filter((g) => !(Math.abs(g.right) <= 1.5 && g.pair)).map((g) => JSON.stringify(g)) : ['no 🚌 🚙 on his legs']);
        await tapJs('#sheet [data-act="sh-close"]');
        if (FIT) {
          // PIA-161 (c): Ashwin's own P-person (his 🛬 / 🛫 rows with 🌽, [✈ Track ↗ | ☑ I booked]) at every width × text size: each
          // [ORD time] with its 🌽, under the day together where the row cannot hold them, one line from 390px (375px up to a 21px root,
          // 360px up to 19px); the two buttons inside the sheet, full-width rows where one row cannot hold them, nothing sideways
          await page.$eval('#screen .pb', (e) => e.scrollIntoView({ block: 'center' }));
          await tapJs('#screen .pb [data-act="flight"].mybar');
          const rf = [];
          if ((await page.getAttribute('#sheet', 'data-popup').catch(() => null)) !== 'P-person') rf.push('his bar should open his P-person');
          else for (const w of FIT_W) for (const rp of FIT_R) {
            await sizeTo(page, vp, w, rp); const f = await page.evaluate(ROWFIT);
            rf.push(...rowFails('Ashwin\'s own P-person', f, w, rp, w >= 390 || (w >= 375 && rp <= 21) || (w >= 360 && rp <= 19)));
            if (!f.split.length) rf.push(w + '×' + rp + ': no [Track | I booked]');
            f.split.forEach((p) => { if (p.sw > 0 || !p.inside || (p.two && !p.full)) rf.push('[Track | I booked] at ' + w + '×' + rp + ': ' + JSON.stringify(p)); });
          }
          await sizeBack(page, vp);
          fitReport('(c) Ashwin\'s own P-person at 320–440px × roots 17–23: [ORD time] and 🌽 together, one line where the row holds them, [✈ Track ↗ | ☑ I booked] inside the sheet (two full-width rows where one cannot hold them)', rf);
          await tapJs('#sheet [data-act="sh-close"]');
        }
        // PIA-160 (fix 2): Mom & Dad drive both his legs, so moving both his times shows the two-half echo with the share symbol
        // ("Tell"): both halves and the 44px button inside the toast's pill, no half under the button. On the 390 light phone the same
        // toast is held in view while the screen goes to 320, 360, 375, 393 and 402 at the default size, and 320, 360 and 430 at a 19px
        // and a 23px root (an iPhone's larger Text Size steps; at 320 with a 23px root the 🛫 half alone leaves no room beside the
        // button, which goes under the echo)
        await page.$eval('#screen .pb', (e) => e.scrollIntoView({ block: 'center' }));
        await tapJs('#screen .pb [data-act="flight"].mybar'); await tapJs('#sheet #tmb-arr'); await page.fill('#sheet #tm-arr', '305');
        await tapJs('#sheet #tmb-dep'); await page.fill('#sheet #tm-dep', '415'); await tapJs('#sheet [data-act="sh-close"]');
        await page.waitForFunction(() => { const t = document.querySelector('#toast'); return !!t && !t.hidden && t.querySelectorAll('.ech .nw').length === 2 && !!t.querySelector('[data-act="toastshare"]'); }, null, { timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(120);
        const tells = [await page.evaluate(TELLBOX)];
        if (vp.width === 390 && scheme === 'light') {
          for (const [w, rp] of [[320, 0], [360, 0], [375, 0], [393, 0], [402, 0], [320, 19], [320, 23], [360, 19], [360, 23], [430, 19], [430, 23]]) {
            await page.setViewportSize({ width: w, height: vp.height });
            await page.evaluate((px) => { [...document.querySelectorAll('style[data-tellroot]')].forEach((s) => s.remove()); if (px) { const s = document.createElement('style'); s.setAttribute('data-tellroot', ''); s.textContent = 'html{font-size:' + px + 'px!important}'; document.head.appendChild(s); }
              document.querySelector('#toast').hidden = false; }, rp);
            await page.waitForTimeout(150);
            tells.push(await page.evaluate(TELLBOX));
            if (w === 320 && rp === 23 && !(tells[tells.length - 1] && tells[tells.length - 1].below)) fails.push('PIA-160 at 320px with a 23px root the share symbol should go under the echo: ' + JSON.stringify(tells[tells.length - 1]));
          }
          await page.evaluate(() => [...document.querySelectorAll('style[data-tellroot]')].forEach((s) => s.remove()));
          await page.setViewportSize({ width: vp.width, height: vp.height }); await page.waitForTimeout(120);
        }
        const tellBad = tells.filter((g) => !tellOk(g));
        if (tellBad.length || tells.length < (vp.width === 390 && scheme === 'light' ? 12 : 1)) fails.push('PIA-160 the two-half echo with its share symbol ("Tell") should keep both halves and the 44px button inside the toast\'s pill, no half under the button, at every width and text size: ' + JSON.stringify(tellBad.length ? tellBad.slice(0, 3) : tells.length));
        if (fails.length === 0) ok(`${label} — no horizontal scroll, every target ≥44px and named, ${scheme} tokens, in ${states} states`);
        else bad(`${label} — ${fails.slice(0, 4).join(' · ')}`);
      } catch (e) { bad(`${label} — threw: ${e && e.message ? e.message.split('\n')[0] : String(e)}${fails.length ? ' · ' + fails.slice(0, 2).join(' · ') : ''}`); }
      await ctx.close();
  })));
  // PIA-138: P-dates on shorter phones too (360x740, 375x667), light and dark: in every picker state nothing in view is
  // covered (elementFromPoint), Save is opaque, 🔒 / 🔓 is in view, and every target is ≥44px with no horizontal scroll
  for (const vp of [{ name: '360x740', width: 360, height: 740 }, { name: '375x667', width: 375, height: 667 }]) {
    for (const scheme of ['light', 'dark']) {
      const label = `app.html P-dates @ ${vp.name} ${scheme}`;
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, timezoneId: 'America/Los_Angeles' });
      await ctx.route(/^https?:\/\//, (r) => process.env.PIALAX_TEST_APP_URL && r.request().url().startsWith(process.env.PIALAX_TEST_APP_URL) ? r.continue() : r.abort());
      await ctx.route(W + '/**', (route) => {
        const q = route.request(), id = new URL(q.url()).searchParams.get('id');
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, X-Idea-Key', 'content-type': 'application/json' };
        if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        if (!docs[id]) return route.fulfill({ status: 404, headers: cors, body: '{"code":"not_found"}' });
        return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: true, doc: docs[id], organizer: (id === DW || id === M8 || id === LKV || id === CYV || id === BKV || id === BKP || id === DWJ || id === CHV) && q.headers()['x-idea-key'] === KEY }) });
      });
      const page = await ctx.newPage();
      const fails = [];
      let states = 0;
      try {
        await page.clock.setFixedTime(new Date('2026-10-17T19:00:00Z'));
        await page.goto((process.env.PIALAX_TEST_APP_URL || pathToFileURL(path.join(ROOT, 'app.html')).href), { waitUntil: 'load' });
        await page.evaluate((s) => { Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, seed);
        await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
        const tapJs = async (sel) => { await page.$eval(sel, (e) => e.click()); await page.waitForTimeout(110); };
        const measure = async (s) => {
          states++;
          const r = await page.evaluate(LAYOUT), o = await page.evaluate(OCCLUSION);
          if (r.overflow > 0 || r.sheetOverflow > 0) fails.push(s + ': horizontal scroll ' + r.overflow + '/' + r.sheetOverflow + 'px');
          if (r.small.length) fails.push(s + ': targets under 44px ' + r.small.slice(0, 4).join(', '));
          if (o.covered.length) fails.push(s + ': controls covered ' + o.covered.slice(0, 3).join(', '));
          if (o.seeThrough) fails.push(s + ': Save is see-through (' + o.seeThrough + ')');
          if (o.lock === false) fails.push(s + ': 🔒/🔓 is not in view without scrolling');
        };
        const open = async (id) => { await page.click('#screen [data-trip="' + id + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await tapJs('#screen .daterow [data-act="dates"]'); };
        const leave = async () => { await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]'); };
        // (PIA-154: 🔒 Lock dates is the main button while nothing is picked; −7 −1 +1 +7 move the pick; no holidays once there is a plan)
        await open(DW); await measure('the plan (🔒 Lock dates)');
        await tapJs('#sheet [data-act="dshift"][data-v="-7"]'); await measure('−7 (Save)');
        await tapJs('#sheet [data-act="dday"][data-v="2026-11-13"]'); await measure('a start picked (📌⚠)');
        await tapJs('#sheet [data-act="dtarget"][data-v="me"]'); await measure('my own days');
        await tapJs('#sheet [data-act="dday"][data-v="2026-11-05"]'); await measure('my arrival picked (⚠🗓)');
        await tapJs('#sheet [data-act="dtarget"][data-v="trip"]'); await measure('back to the plan');
        await leave();
        await open(M8); await measure('the 8-member plan'); await leave();
        await open(CYV); await measure('an undated idea (⟦window⟧, ⬚)'); await leave();
        await open(LKV); await measure('a locked plan (🔓)'); await leave();
        if (states === 9 && fails.length === 0) ok(`${label} — nothing in view is covered, Save is opaque, 🔒/🔓 in view, targets ≥44px, no horizontal scroll, in ${states} states`);
        else bad(`${label} — ${fails.slice(0, 4).join(' · ') || states + ' states'}`);
      } catch (e) { bad(`${label} — threw: ${e && e.message ? e.message.split('\n')[0] : String(e)}${fails.length ? ' · ' + fails.slice(0, 2).join(' · ') : ''}`); }
      await ctx.close();
    }
  }
  // PIA-153: housekeeping and old trips, on the organizer's phone (the v1 Thanksgiving it organizes, not updated yet, and Diwali with
  // its own days off the plan) and on Anjo's (the same v1 trip, her own face): each card's stage button and ⤒, P-stage from a card
  // (🗑, and greyed on the v1 trip), P-migrate's name and picture with Current/Travelers, the trip view's 👪 pill and ⚠ line, P-mine
  // (Follow plan / Keep mine, and Make plan on Diwali), the organizer on Anjo's v1 sheet (⤒, greyed 🎫), P-dates' greyed toggle and
  // Anjo's own flight section on the v1 trip, at 360/390/430, light and dark: no sideways scroll, every target ≥44px and named
  {
    const TGL = 'tgLegacyThanksgiving01', DWM = 'dwViewportMineDays0006';
    const docs153 = { [TGL]: docs[TGL], [DWM]: (() => { const d = JSON.parse(JSON.stringify(docs[DW])); d.id = DWM;
      d.responses['ashwin-p8'] = Object.assign({}, d.responses['ashwin-p8'], { available_from: '2026-11-06', available_to: '2026-11-10' }); return d; })() };
    const k = { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' };
    const phones = {
      organizer: { pialax_watchlist_v2: [TGL, DWM], pialax_idea_keys_v1: { [TGL]: k, [DWM]: k }, pialax_idea_me_v1: { [TGL]: 'LAX', [DWM]: 'ashwin-p8' } },
      anjo: { pialax_watchlist_v2: [TGL], pialax_idea_me_v1: { [TGL]: 'LGA' } }
    };
    for (const vp of VIEWPORTS) {
      for (const scheme of ['light', 'dark']) {
        const label = `app.html housekeeping and old trips @ ${vp.name} ${scheme}`;
        const fails = [];
        let states = 0;
        for (const who of ['organizer', 'anjo']) {
          const ph = phones[who];
          const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, timezoneId: 'America/Los_Angeles' });
          await ctx.route(/^https?:\/\//, (r) => process.env.PIALAX_TEST_APP_URL && r.request().url().startsWith(process.env.PIALAX_TEST_APP_URL) ? r.continue() : r.abort());
          await ctx.route(W + '/**', (route) => {
            const q = route.request(), id = new URL(q.url()).searchParams.get('id');
            const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, X-Idea-Key', 'content-type': 'application/json' };
            if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
            if (q.method() !== 'GET') { fails.push(who + ': nothing here should write, got ' + q.method() + ' ' + new URL(q.url()).pathname); return route.fulfill({ status: 400, headers: cors, body: '{"code":"bad_body"}' }); }
            if (!docs153[id]) return route.fulfill({ status: 404, headers: cors, body: '{"code":"not_found"}' });
            return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: true, doc: docs153[id], organizer: !!(ph.pialax_idea_keys_v1 && ph.pialax_idea_keys_v1[id]) && q.headers()['x-idea-key'] === KEY }) });
          });
          const page = await ctx.newPage();
          try {
            await page.clock.setFixedTime(new Date('2026-10-17T19:00:00Z'));
            await page.goto((process.env.PIALAX_TEST_APP_URL || pathToFileURL(path.join(ROOT, 'app.html')).href), { waitUntil: 'load' });
            await page.evaluate((s) => {
              localStorage.setItem('pialax_watchlist_v2', JSON.stringify(s.pialax_watchlist_v2.map((id) => ({ id, t: '', e: '', at: 1, pin: false, arch: false }))));
              if (s.pialax_idea_keys_v1) localStorage.setItem('pialax_idea_keys_v1', JSON.stringify(s.pialax_idea_keys_v1));
              localStorage.setItem('pialax_idea_me_v1', JSON.stringify(s.pialax_idea_me_v1)); localStorage.setItem('pialax_ui_v1', JSON.stringify({ v1read: 1 }));
            }, ph);
            await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
            const tapJs = async (sel) => { await page.$eval(sel, (e) => e.click()); await page.waitForTimeout(140); };
            const popup = async () => page.getAttribute('#sheet', 'data-popup').catch(() => null);
            const measure = async (s) => {
              states++;
              const r = await page.evaluate(LAYOUT);
              if (r.overflow > 0 || r.sheetOverflow > 0) fails.push(who + ' ' + s + ': horizontal scroll ' + r.overflow + '/' + r.sheetOverflow + 'px');
              if (r.small.length) fails.push(who + ' ' + s + ': targets under 44px ' + r.small.slice(0, 4).join(', '));
              if (r.unnamed.length) fails.push(who + ' ' + s + ': controls without a name ' + r.unnamed.slice(0, 4).join(', '));
              const L = lum(r.bg);
              if (scheme === 'dark' ? !(L >= 0 && L < 0.2) : !(L > 0.8)) fails.push(who + ' ' + s + ': body background ' + r.bg + ' is not the ' + scheme + ' token');
            };
            await measure('the list (stage buttons' + (who === 'organizer' ? ', ⤒ on the v1 card)' : ')'));
            if (who === 'organizer') {
              if (!(await page.$('#screen [data-trip="' + TGL + '"] [data-act="migcard"]'))) fails.push('the organizer\'s v1 card should carry ⤒');
              await tapJs('#screen [data-trip="' + DWM + '"] [data-act="stage"]'); await measure('P-stage from a card (☆ 🗄 🗑)');
              if ((await popup()) !== 'P-stage' || !(await page.$('#sheet [data-act="stagedrop"]:not(.dis)'))) fails.push('a card\'s stage button should open P-stage with 🗑');
              await tapJs('#sheet [data-act="sh-close"]');
              // PIA-155: the v1 card's ⋯ More: the stage as one quiet line (whole in the sheet, nothing about it a control), 🗑 Remove for
              // everyone live, opening P-drop (🗑 Remove | Keep); nothing is sent here (Keep's sheet is closed)
              await tapJs('#screen [data-trip="' + TGL + '"] [data-act="stage"]'); await measure('P-stage from the v1 card (the stage line, 🗑 Remove for everyone)');
              const sl = await page.evaluate(STAGELINE); if (sl) fails.push('P-stage\'s stage line: ' + sl);
              if (!(await page.$('#sheet [data-act="stagedrop"]:not(.dis)'))) fails.push('the v1 trip\'s 🗑 Remove for everyone should be live');
              await tapJs('#sheet [data-act="stagedrop"]'); await measure('P-drop on the v1 trip (🗑 Remove | Keep)');
              if ((await popup()) !== 'P-drop') fails.push('the v1 trip\'s 🗑 should open P-drop');
              await tapJs('#sheet [data-act="sh-close"]');
              await tapJs('#screen [data-trip="' + TGL + '"] [data-act="migcard"]'); await measure('P-migrate (name and picture, Current pressed)');
              if ((await popup()) !== 'P-migrate' || !(await page.$('#sheet #mig-title'))) fails.push('⤒ on the card should open P-migrate with the trip\'s name');
              await page.fill('#mig-title', 'Grandma Josephine ninetieth birthday weekend in Savannah with everyone'); await page.waitForTimeout(80); await measure('P-migrate (a long name typed)');
              await tapJs('#sheet [data-act="migplan"][data-v="span"]'); await measure('P-migrate (Travelers pressed)');
              await tapJs('#sheet [data-act="sh-close"]'); await measure('the v1 trip view (👪 pill, my ⚠ line)');
              await tapJs('#screen [data-act="mine"]'); await measure('P-mine on the v1 trip (Follow plan, Keep mine)');
              if ((await popup()) !== 'P-mine') fails.push('my ⚠ line should open P-mine');
              await tapJs('#sheet [data-act="sh-close"]');
              await tapJs('#screen .pb [data-act="person"][data-code="LGA"]'); await measure('P-person (the organizer on Anjo\'s v1 sheet: ⤒, greyed 🎫)');
              await tapJs('#sheet [data-act="sh-close"]');
              await tapJs('#screen .daterow [data-act="dates"]'); await measure('P-dates on the v1 trip (the trip half greyed)');
              await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
              await page.click('#screen [data-trip="' + DWM + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(200); await measure('a trip view with my own days (👪 pill, ⚠)');
              await tapJs('#screen [data-act="mine"]'); await measure('P-mine (Follow plan, Keep mine, Make plan)');
              if (!(await page.$('#sheet [data-act="mineplan"]'))) fails.push('the organizer\'s P-mine on a v2 trip should offer Make plan');
              await tapJs('#sheet [data-act="sh-close"]');
            } else {
              await page.click('#screen [data-trip="' + TGL + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(200); await measure('Anjo on the v1 trip view');
              await tapJs('#screen .pb-row.own [data-act="person"]'); await measure('Anjo\'s own flight section on the v1 trip (✈↗, 🎫 I booked)');
              if (!(await page.$('#sheet [data-act="mybook"]')) || !(await page.$('#sheet a[data-k="gf"][data-ret]'))) fails.push('Anjo\'s own sheet on the v1 trip should offer ✈ Book ↗ and 🎫');
              await tapJs('#sheet [data-act="sh-close"]');
            }
          } catch (e) { fails.push(who + ' threw: ' + (e && e.message ? e.message.split('\n')[0] : String(e))); }
          await ctx.close();
        }
        if (states === 16 && fails.length === 0) ok(`${label} — no horizontal scroll, every target ≥44px and named, ${scheme} tokens, in ${states} states`);
        else bad(`${label} — ${fails.slice(0, 4).join(' · ') || states + ' states'}`);
      }
    }
  }
  // PIA-140 fix pass 2: P-person's name breaks only at its spaces, never inside a word (not at a hyphen either), however crowded its
  // header: opened from P-total (‹) on the organizer's token phone (ⓘ), as the traveler this phone is (⇄) and as everyone else, on
  // the Diwali trip (Ashwin, Mom & Dad, Anjo) and the 8-member long-name trip (this phone is Bartholomew Montgomery-Fitzgerald on it),
  // and from the board (no ‹), at 360/390/430, light and dark. Each name's rendered lines (Range.getClientRects) are no more than its
  // words, each word sits on one line, the name overflows nothing and covers no button, and the buttons stay on the face's row.
  const NAMECHK = () => {
    const hd = document.querySelector('#sheet .sh-hd.pers'), nm = hd && hd.querySelector('.pnm');
    if (!nm) return null;
    const linesOf = (rs) => { const tops = []; [...rs].forEach((x) => { if (x.width > 0 && !tops.some((t) => Math.abs(t - x.top) < x.height / 2)) tops.push(x.top); }); return tops.length; };
    const text = nm.textContent.replace(/\s+/g, ' ').trim(), words = text.split(' ').filter(Boolean).length;
    const all = document.createRange(); all.selectNodeContents(nm);
    const broken = [], tw = document.createTreeWalker(nm, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      const re = /\S+/g;
      for (let m = re.exec(t.nodeValue); m; m = re.exec(t.nodeValue)) { const r = document.createRange(); r.setStart(t, m.index); r.setEnd(t, m.index + m[0].length); if (linesOf(r.getClientRects()) > 1) broken.push(m[0]); }
    }
    const nr = nm.getBoundingClientRect(), pav = hd.querySelector('.pav').getBoundingClientRect(), mid = (b) => (b.top + b.bottom) / 2;
    const btns = [...hd.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
    return {
      text, words, lines: linesOf(all.getClientRects()), broken, over: nm.scrollWidth - nm.clientWidth,
      covers: btns.some((b) => nr.left < b.right - 0.5 && nr.right > b.left + 0.5 && nr.top < b.bottom - 0.5 && nr.bottom > b.top + 0.5),
      oneRow: btns.every((b) => Math.abs(mid(b) - mid(pav)) < 2),
      back: !!hd.querySelector('[data-act="sh-back"]'), key: !!hd.querySelector('[data-act="skey"]'), sw: !!hd.querySelector('[data-act="face"]'),
      stk: hd.classList.contains('stk'), fs: getComputedStyle(nm).fontSize
    };
  };
  const NAMES_ME = JSON.stringify(Object.assign(JSON.parse(seed.pialax_idea_me_v1), { [M8]: 'bartholomewmontgomeryfitzgera-dj' }));
  for (const vp of VIEWPORTS) {
    for (const scheme of ['light', 'dark']) {
      const label = `app.html P-person names @ ${vp.name} ${scheme}`;
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, timezoneId: 'America/Los_Angeles' });
      await ctx.route(/^https?:\/\//, (r) => process.env.PIALAX_TEST_APP_URL && r.request().url().startsWith(process.env.PIALAX_TEST_APP_URL) ? r.continue() : r.abort());
      const net = { search: 0 };
      await ctx.route(W + '/**', (route) => {
        const q = route.request(), u = new URL(q.url()), id = u.searchParams.get('id');
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, X-Idea-Key, X-Pialax-Token', 'access-control-expose-headers': 'X-Proxy-Cache, X-Fetched-At', 'content-type': 'application/json' };
        if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        if (u.pathname === '/search' || u.pathname === '/account') {
          if (q.headers()['x-pialax-token'] !== seed.pialax_proxy_token) return route.fulfill({ status: 401, headers: cors, body: '{"code":"no_token"}' });
          if (u.pathname === '/account') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(ACCT) });
          net.search++; return route.fulfill({ status: 500, headers: cors, body: '{"code":"not_in_this_test"}' });
        }
        if (!docs[id]) return route.fulfill({ status: 404, headers: cors, body: '{"code":"not_found"}' });
        return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: true, doc: docs[id], organizer: (id === DW || id === M8) && q.headers()['x-idea-key'] === KEY }) });
      });
      const page = await ctx.newPage();
      const fails = [], seen = { n: 0, crowded: 0, all3: 0, stk: 0, bare: 0 };
      try {
        await page.clock.setFixedTime(new Date('2026-10-17T19:00:00Z'));
        await page.goto((process.env.PIALAX_TEST_APP_URL || pathToFileURL(path.join(ROOT, 'app.html')).href), { waitUntil: 'load' });
        await page.evaluate((s) => { Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, Object.assign({}, seed, { pialax_idea_me_v1: NAMES_ME }));
        await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
        const tapJs = async (sel) => { await page.$eval(sel, (e) => e.click()); await page.waitForTimeout(110); };
        const check = async (s) => {
          const r = await page.evaluate(NAMECHK), L = await page.evaluate(LAYOUT);
          if (!r) { fails.push(s + ': P-person did not open'); return; }
          seen.n++; if (r.back && r.key) seen.crowded++; if (r.back && r.key && r.sw) seen.all3++; if (r.stk) seen.stk++; if (!r.back) seen.bare++;
          const at = s + ' "' + r.text + '"' + (r.stk ? ' (under the face, ' + r.fs + ')' : '');
          if (r.lines > r.words) fails.push(at + ': ' + r.lines + ' lines for ' + r.words + ' words');
          if (r.broken.length) fails.push(at + ': broken inside ' + r.broken.join(', '));
          if (r.over > 1) fails.push(at + ': overflows its box by ' + r.over + 'px');
          if (r.covers) fails.push(at + ': drawn over a header button');
          if (!r.oneRow) fails.push(at + ': the header buttons left the face\'s row');
          if (L.overflow > 0 || L.sheetOverflow > 0) fails.push(at + ': horizontal scroll ' + L.overflow + '/' + L.sheetOverflow + 'px');
          if (L.small.length) fails.push(at + ': targets under 44px ' + L.small.slice(0, 3).join(', '));
        };
        for (const [id, opener] of [[DW, '#screen .card [data-act="total"][data-id="' + DW + '"]'], [M8, null]]) {
          if (opener) await tapJs(opener);
          else { await page.click('#screen [data-trip="' + id + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await tapJs('#screen .pricerow[data-act="total"]'); }
          if ((await page.getAttribute('#sheet', 'data-popup')) !== 'P-total') { fails.push(id + ': P-total did not open'); continue; }
          const codes = await page.$$eval('#sheet .trow [data-act="person"]', (els) => els.map((e) => e.getAttribute('data-code')));
          for (const c of codes) {
            await tapJs('#sheet .trow [data-act="person"][data-code="' + c + '"]'); await check(id + ' P-total › ' + c);
            await tapJs('#sheet [data-act="sh-back"]');
            if ((await page.getAttribute('#sheet', 'data-popup')) !== 'P-total') { fails.push(id + ' ' + c + ': ‹ should come back to P-total'); break; }
          }
          await tapJs('#sheet [data-act="sh-close"]');
          if (opener) { await page.click('#screen [data-trip="' + id + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); }
          for (const c of await page.$$eval('#screen .pb [data-act="person"]', (els) => els.map((e) => e.getAttribute('data-code')))) {
            await tapJs('#screen .pb [data-act="person"][data-code="' + c + '"]'); await check(id + ' board › ' + c); await tapJs('#sheet [data-act="sh-close"]');
          }
          await page.evaluate(() => window.scrollTo(0, 0)); await tapJs('#screen [data-act="back"]');
        }
        if (seen.crowded < 6 || seen.all3 < 2 || seen.stk < 1 || seen.bare < 6) fails.push('coverage: ' + JSON.stringify(seen) + ' (want ≥6 with ‹ and ⓘ, ≥2 with ‹ ⇄ ⓘ, ≥1 under the face, ≥6 from the board)');
        if (net.search) fails.push('opening sheets searched ' + net.search + ' times');
        if (fails.length === 0) ok(`${label} — every name breaks only at its spaces, overflows nothing and leaves the buttons on the face's row (${seen.n} sheets, ${seen.all3} with ‹ ⇄ ⓘ, ${seen.stk} under the face)`);
        else bad(`${label} — ${fails.slice(0, 4).join(' · ')}`);
      } catch (e) { bad(`${label} — threw: ${e && e.message ? e.message.split('\n')[0] : String(e)}${fails.length ? ' · ' + fails.slice(0, 2).join(' · ') : ''}`); }
      await ctx.close();
    }
  }
  // PIA-160: a laptop (1024×768, a mouse, no touch) with reduced motion and Increase Contrast, light, on Ashwin's own P town page: the
  // framed 430px column and its tab bar centred, a sheet centred at 430px inside the window less 32px; a hover fill under the mouse; no
  // animation over 1ms, a still ring for a pulse and an outline for a nudge; the Increase Contrast inks. The keyboard: Tab through the
  // page (each focused control ringed and not under a sticky bar; +N never focused), then his 🛬 edit row's [AM | PM] and airports by
  // the arrow keys (one Tab stop each), and Esc back to the page
  {
    const label = 'app.html desktop @ 1024x768 light, reduced motion, Increase Contrast';
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, colorScheme: 'light', reducedMotion: 'reduce', contrast: 'more', timezoneId: 'America/Los_Angeles' });
    await ctx.route(/^https?:\/\//, (r) => process.env.PIALAX_TEST_APP_URL && r.request().url().startsWith(process.env.PIALAX_TEST_APP_URL) ? r.continue() : r.abort());
    await ctx.route(W + '/**', (route) => {
      const q = route.request(), u = new URL(q.url()), id = u.searchParams.get('id');
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, X-Idea-Key, X-Pialax-Token', 'access-control-expose-headers': 'X-Proxy-Cache, X-Fetched-At', 'content-type': 'application/json' };
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (u.pathname === '/account') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(ACCT) });
      if (u.pathname === '/search') return route.fulfill({ status: 500, headers: cors, body: '{"code":"not_in_this_test"}' });
      if (!docs[id]) return route.fulfill({ status: 404, headers: cors, body: '{"code":"not_found"}' });
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: true, doc: docs[id], organizer: false }) });
    });
    const page = await ctx.newPage(), fails = [];
    try {
      const APPU = process.env.PIALAX_TEST_APP_URL || pathToFileURL(path.join(ROOT, 'app.html')).href;
      await page.clock.setFixedTime(new Date('2026-10-17T19:00:00Z'));
      await page.goto(APPU, { waitUntil: 'load' });
      await page.evaluate((s) => { Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, seed);
      await page.goto(APPU + '?idea=' + PT9A, { waitUntil: 'load' }); await page.waitForTimeout(300);
      if (await page.$('#sheet:not([hidden])')) { await page.$eval('#sheet [data-act="sh-close"]', (e) => e.click()); await page.waitForTimeout(150); }
      const look = await page.evaluate(() => {
        const R = (q) => { const e = document.querySelector(q); return e ? e.getBoundingClientRect() : null; }, a = R('#app'), t = R('#tabbar'), W0 = innerWidth;
        const root = getComputedStyle(document.documentElement), v = (n) => root.getPropertyValue(n).trim().toUpperCase();
        const probe = document.createElement('div'); probe.innerHTML = '<span class="pulse">x</span><div class="answers nudge"></div>'; document.querySelector('#screen').appendChild(probe);
        const pu = getComputedStyle(probe.querySelector('.pulse')).boxShadow, nu = getComputedStyle(probe.querySelector('.nudge'));
        const cue = { pulse: pu !== 'none', nudge: nu.outlineStyle === 'solid' && parseFloat(nu.outlineWidth) >= 2 }; probe.remove();
        return { app: a ? [Math.round(a.width), Math.round(a.left - (W0 - a.width) / 2)] : null, tab: t ? [Math.round(t.width), Math.round(t.left - (W0 - t.width) / 2)] : null,
          frame: getComputedStyle(document.querySelector('#app')).boxShadow !== 'none', inks: [v('--ink2'), v('--edge'), v('--line')], cue };
      });
      if (!(look.app && look.app[0] === 430 && Math.abs(look.app[1]) <= 1 && look.tab && look.tab[0] === 430 && Math.abs(look.tab[1]) <= 1 && look.frame))
        fails.push('the desktop column and its tab bar should be 430px, centred and framed: ' + JSON.stringify(look));
      if (JSON.stringify(look.inks) !== JSON.stringify(['#3A4150', '#5B6270', '#7D8594'])) fails.push('Increase Contrast should darken --ink2, --edge and --line: ' + JSON.stringify(look.inks));
      if (!(look.cue.pulse && look.cue.nudge)) fails.push('with reduced motion a pulse keeps a still ring and a nudge a still outline: ' + JSON.stringify(look.cue));
      // a hover fill under the mouse on a stateless control (ⓘ in the top row)
      const ib = await page.$('#screen [data-act="key"]');
      if (ib) {
        await ib.hover(); await page.waitForTimeout(80);
        const hv = await page.evaluate(() => { const e = document.querySelector('#screen [data-act="key"]'), p = document.createElement('i'); p.style.color = 'var(--sunk)'; document.body.appendChild(p); const s = getComputedStyle(p).color; p.remove(); return getComputedStyle(e).backgroundColor === s; });
        if (!hv) fails.push('a mouse over ⓘ should fill it with --sunk');
        await page.mouse.move(2, 760);
      } else fails.push('no ⓘ on the trip page');
      // the keyboard through the page
      await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement) document.activeElement.blur(); });
      const tabbed = [];
      for (let i = 0; i < 48; i++) {
        await page.keyboard.press('Tab');
        const f = await page.evaluate(() => {
          const a = document.activeElement; if (!a || a === document.body || !a.closest('#screen, #tabbar')) return { out: true };
          const r = a.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, h = document.elementFromPoint(x, y), cs = getComputedStyle(a);
          return { act: a.getAttribute('data-act') || a.className, ring: parseFloat(cs.outlineWidth) >= 2 && cs.outlineStyle !== 'none', top: !!h && (h === a || a.contains(h)), wkn: a.classList.contains('wkn'), tab: !!a.closest('#tabbar') };
        });
        if (f.out) break;
        tabbed.push(f); if (f.tab) break;
      }
      const offTab = tabbed.filter((f) => !f.ring || !f.top || f.wkn);
      if (tabbed.length < 8 || offTab.length) fails.push('Tab through the page: every focused control ringed (≥2px) and on top at its centre, +N never focused: ' + JSON.stringify({ n: tabbed.length, off: offTab.slice(0, 4) }));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.$eval('#screen .pb [data-act="flight"].mybar', (e) => e.click()); await page.waitForTimeout(200);
      await page.$eval('#sheet #tmb-arr', (e) => e.click()); await page.waitForTimeout(200);
      const radios = () => page.evaluate(() => {
        const g = (q) => [...document.querySelectorAll(q)].map((b) => b.getAttribute('data-v') + (b.getAttribute('aria-checked') === 'true' ? '*' : '') + (b.getAttribute('tabindex') === '0' ? '@' : ''));
        return { seg: g('#seg-arr .segb').join(' '), pills: g('#pills-arr .pill').join(' '), focus: (document.activeElement && document.activeElement.getAttribute('data-v')) || '' };
      });
      const k0 = await radios();
      await page.focus('#seg-arr .segb[tabindex="0"]'); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(150); const k1 = await radios();
      await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150); const k2 = await radios();
      await page.keyboard.press('Tab'); await page.waitForTimeout(80); const tabFrom = await page.evaluate(() => (document.activeElement && document.activeElement.className) || '');
      await page.focus('#pills-arr .pill[tabindex="0"]'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150); const k3 = await radios();
      await page.keyboard.press('Home'); await page.waitForTimeout(150); const k4 = await radios();
      if (!(k0.seg === 'am pm*@' && k1.seg === 'am*@ pm' && k1.focus === 'am' && k2.seg === 'am pm*@' && k2.focus === 'pm' && !/segb/.test(tabFrom) &&
        /^ORD\*@ MDW PIA$/.test(k0.pills) && /^ORD MDW\*@ PIA$/.test(k3.pills) && k3.focus === 'MDW' && /^ORD\*@ MDW PIA$/.test(k4.pills) && k4.focus === 'ORD'))
        fails.push('[AM | PM] and the airport pills should be one Tab stop each (the pressed one), the arrows and Home moving and pressing: ' + JSON.stringify({ k0, k1, k2, tabFrom, k3, k4 }));
      // a sheet on a laptop: centred at 430px, inside the window less 32px
      const shb = await page.evaluate(() => { const r = document.querySelector('#sheet').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.left - (innerWidth - r.width) / 2), r.height <= innerHeight - 32 + 1]; });
      if (!(shb[0] === 430 && Math.abs(shb[1]) <= 1 && shb[2])) fails.push('a sheet on a laptop should be 430px, centred, at most the window less 32px: ' + JSON.stringify(shb));
      const anim = await page.evaluate(() => document.getAnimations().map((a) => a.effect && a.effect.getTiming ? +a.effect.getTiming().duration || 0 : 0).filter((d) => d > 1));
      if (anim.length) fails.push('with reduced motion no animation should last over 1ms: ' + JSON.stringify(anim));
      await page.keyboard.press('Escape'); await page.waitForTimeout(250);
      const back = await page.evaluate(() => ({ open: !document.querySelector('#sheet').hidden, inScreen: !!(document.activeElement && document.activeElement.closest('#screen')) }));
      if (back.open || !back.inScreen) fails.push('Esc should close the sheet and give the focus back to the page: ' + JSON.stringify(back));
      // PIA-160 (fix 2): the two-half times echo with its share symbol on a laptop: both halves and the button inside the 398px toast,
      // and the toast inside the 430px column, at the default size and at a 23px root (the same toast held in view)
      await page.$eval('#screen .pb [data-act="flight"].mybar', (e) => e.click()); await page.waitForTimeout(200);
      await page.$eval('#sheet #tmb-arr', (e) => e.click()); await page.waitForTimeout(150); await page.fill('#sheet #tm-arr', '305');
      await page.$eval('#sheet #tmb-dep', (e) => e.click()); await page.waitForTimeout(150); await page.fill('#sheet #tm-dep', '415');
      await page.$eval('#sheet [data-act="sh-close"]', (e) => e.click());
      await page.waitForFunction(() => { const t = document.querySelector('#toast'); return !!t && !t.hidden && t.querySelectorAll('.ech .nw').length === 2 && !!t.querySelector('[data-act="toastshare"]'); }, null, { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(120);
      const dTell = [await page.evaluate(TELLBOX)];
      await page.evaluate(() => { const s = document.createElement('style'); s.setAttribute('data-tellroot', ''); s.textContent = 'html{font-size:23px!important}'; document.head.appendChild(s); document.querySelector('#toast').hidden = false; });
      await page.waitForTimeout(150); dTell.push(await page.evaluate(TELLBOX));
      await page.evaluate(() => [...document.querySelectorAll('style[data-tellroot]')].forEach((s) => s.remove()));
      if (!(dTell.every(tellOk) && dTell[1] && dTell[1].root === 23)) fails.push('on a laptop the two-half echo with its share symbol should keep both halves and the button inside the toast, the toast inside the column, at 17px and at a 23px root: ' + JSON.stringify(dTell));
      if (fails.length === 0) ok(`${label} — the framed 430px column, tab bar and sheet centred, a hover fill, still cues and no motion, the darker inks; Tab rings ${tabbed.length} controls none under a sticky bar, [AM | PM] and the airports by arrow (one stop each), Esc back; the times echo and its share symbol inside the toast at 17px and 23px`);
      else bad(`${label} — ${fails.slice(0, 4).join(' · ')}`);
    } catch (e) { bad(`${label} — threw: ${e && e.message ? e.message.split('\n')[0] : String(e)}${fails.length ? ' · ' + fails.slice(0, 2).join(' · ') : ''}`); }
    await ctx.close();
  }
}

await browser.close();

console.log('');
if (failCount > 0) {
  console.log(failCount + ' failing, ' + passCount + ' passing');
  process.exit(1);
} else {
  console.log('all ' + passCount + ' viewport checks passing');
  process.exit(0);
}

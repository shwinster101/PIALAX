// PIA-147: v2 layout gate at 360/390/430, light/dark; legacy UI checks retired.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

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
  const PSV = 'psViewportPastTahoe007', DRV = 'drViewportDroppedTr008';
  docs[PSV] = (() => { const d = JSON.parse(JSON.stringify(docs.thTahoeSkiWeekend26b02)); d.id = PSV; d.idea.dates.departure = '2026-09-11'; d.idea.dates.return = '2026-09-14'; return d; })();
  docs[DRV] = (() => { const d = JSON.parse(JSON.stringify(docs.lxBeachWeekendLAX00d05)); d.id = DRV; d.decision.stage = 'dropped'; return d; })();
  const ids = Object.keys(docs), KEY = 'pialax-test-edit-key-0123456789abcdefghijk', DW = 'dwDiwaliRaleigh2026a01', M8 = 'm8GrandmaNinetieth0c03', CYV = 'cyCaryShowerUndated004';
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
      [CHV]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' } }),   // PIA-141: the cheapest-week trip   // PIA-138: also organizes the undated idea; PIA-139: the Done trip (and its paid copy); PIA-140: the open-jaw sums
    pialax_idea_me_v1: JSON.stringify({ [DW]: 'ashwin-p8', thTahoeSkiWeekend26b02: 'ashwin-l2', [M8]: 'grandmajosephine-nf', [LKV]: 'ashwin-p8', [CYV]: 'ashwin-c3', [BKV]: 'grandmajosephine-nf',
      [BKM]: 'bartholomewmontgomeryfitzgera-dj', [BKP]: 'grandmajosephine-nf', [DWJ]: 'ashwin-p8', [CHV]: 'ashwin-p8' }),
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
    if (lock) { const r = lock.getBoundingClientRect(), cy = r.top + r.height / 2; out.lock = cy > (hr ? hr.bottom : R.top) && cy < (sv ? sv.top - 6 : R.bottom); }
    return out;
  };
  for (const vp of VIEWPORTS) {
    for (const scheme of ['light', 'dark']) {
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
        return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: true, doc: docs[id], organizer: (id === DW || id === M8 || id === LKV || id === CYV || id === BKV || id === BKP || id === DWJ || id === CHV) && q.headers()['x-idea-key'] === KEY }) });
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
        const shelf = await page.$('#screen [data-act="shelf"]'); if (shelf) { await shelf.click(); await page.waitForTimeout(100); await measure('list + shelf'); }
        await page.click('#screen [data-act="seg"][data-v="family"]'); await page.waitForTimeout(100); await measure('family');
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
        await page.click('#screen [data-trip="' + DW + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await tapJs('#screen .pb [data-act="person"][data-code="anjo-z5"]'); await measure('P-person (the organizer on Anjo)'); await tapJs('#sheet [data-act="sh-close"]');
        await tapJs('#screen .me [data-act="person"]'); await measure('P-person (me)'); await tapJs('#sheet [data-act="sh-close"]');
        await tapJs('#screen [data-act="stage"]'); await measure('P-stage'); await tapJs('#sheet [data-act="sh-close"]');
        await tapJs('#screen .me [data-act="face"]'); await measure('P-face');
        await tapJs('#sheet [data-act="joinopen"]'); await page.type('#join-name', 'Bartholomew Montgomery Fitzgerald'); await page.type('#join-ap', 'bos'); await measure('P-face (join row typed)');
        await page.fill('#join-ap', ''); await page.type('#join-ap', 'San Francisco'); await measure('P-face (join row, a city cut to SAN ⚠)');
        if (await page.$eval('#warn-join-ap', (e) => e.hidden)) fails.push('a city typed in the join airport field should show ⚠');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-trip="' + M8 + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await tapJs('#screen .pb [data-act="person"][data-code="bartholomewmontgomeryfitzgera-dj"]'); await measure('P-person (8 long names)');
        await tapJs('#sheet [data-act="pnote"]'); await measure('P-note (a person\'s note, read first)');
        await tapJs('#sheet [data-act="noteedit"]'); await measure('P-note (a person\'s note, ✎ editing, ✓)'); await tapJs('#sheet [data-act="sh-close"]');
        await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-trip="' + LKV + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('trip with its dates set (🎫 marks, Book)');
        if (!(await page.$('#screen .pb [data-act="booked"]')) || !(await page.$('#screen .split.prim [data-act="mybook"]'))) fails.push('the set trip should show the organizer\'s 🎫 marks and [Book | 🎫]');
        await tapJs('#screen .pb [data-act="booked"][data-code="anjo-z5"]'); await measure('trip with a 🎫 waiting for its confirming tap');
        await tapJs('#screen .me [data-act="person"]'); await measure('P-person (me, PIA | ORD cells)');
        if ((await page.$$('#sheet [data-act="legair"]')).length !== 4) fails.push('my sheet on a Peoria trip should have the PIA | ORD cells for each end');
        // PIA-139: my sheet once the dates are set: [✈ Book ↗ | 🎫] side by side
        if (!(await page.$('#sheet .split a[data-ret] + [data-act="mybook"]'))) fails.push('my sheet on a set trip should have [Book | 🎫] side by side');
        await tapJs('#sheet [data-act="sh-close"]');
        // PIA-139: back from Google Flights after a Book tap, the 🎫 glows (the hand-off itself is not followed: offline)
        await page.$eval('#screen .split.prim a[data-ret]', (a) => { a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); });
        await page.evaluate(() => { for (const st of ['hidden', 'visible']) { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => st }); document.dispatchEvent(new Event('visibilitychange')); } });
        await page.waitForTimeout(120); await measure('trip with the 🎫 glowing after Google Flights');
        if (!(await page.$('#screen .split.prim [data-act="mybook"].glow'))) fails.push('back from a Book tap, the 🎫 beside Book should glow');
        await tapJs('#screen .nav [data-act="caladd"]'); await measure('P-calendar-add (dates set)');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        // PIA-139: the Done 8-member trip: a booked traveler's sheet (times, [Flighty | 🎫]), P-stage with 💵 asking first, the Map's pickups
        await page.click('#screen [data-trip="' + BKV + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('the Done 8-member trip');
        await tapJs('#screen .pb [data-act="person"][data-code="bartholomewmontgomeryfitzgera-dj"]'); await measure('P-person (booked: times, Flighty | 🎫)');
        if (!(await page.$('#sheet #tm-arr')) || !(await page.$('#sheet .split a[data-k="flighty"]'))) fails.push('a booked traveler\'s sheet should have the time fields and [Flighty | 🎫]');
        await page.fill('#sheet #tm-arr', '23:59'); await measure('P-person (a time typed)');
        // PIA-139 fix pass: "310" left in the field asks [☀ 15:10 | 🌃 03:10]; "25:99" left is marked ⚠
        await page.fill('#sheet #tm-arr', '310'); await page.fill('#sheet #tm-dep', '25:99'); await page.$eval('#sheet #tm-arr', (e) => e.focus()); await page.waitForTimeout(60);
        await measure('P-person (☀ / 🌃 asked, a time marked ⚠)');
        if ((await page.$$('#sheet #tm-half:not([hidden]) [data-act="tmhalf"]')).length !== 2 || !(await page.$('#sheet .fld.bad #tm-dep'))) fails.push('"310" left should ask ☀ / 🌃, and "25:99" left should be marked ⚠');
        await page.evaluate(() => { ['tm-arr', 'tm-dep'].forEach((id) => { const f = document.getElementById(id); f.value = f.defaultValue; f.dispatchEvent(new Event('input', { bubbles: true })); }); });
        // PIA-151: the time fields sit in their own 🛬 / 🛫 rows (one line each); his 🛬 day opens the one-end calendar, where a day asks
        // ⚠ 🎫 Confirm first (booked); ‹ back leaves it unsent
        const rowsOk = await page.evaluate(() => { const L = [...document.querySelectorAll('#sheet .leg')]; return L.length === 2 && !!L[0].querySelector('#tm-arr') && !!L[1].querySelector('#tm-dep') && L.every((e) => e.getBoundingClientRect().height < 60); });
        if (!rowsOk) fails.push('a booked traveler\'s flight rows should each hold their time field on one line');
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
          over: document.documentElement.scrollWidth - innerWidth }));
        if (fin.times !== 7 || fin.miss !== 2 || !fin.bars.length || fin.bars.some((h) => h < 44) || fin.out.length || fin.over > 0) fails.push('the Done trip\'s board should show its 7 booked times (2 ––:––) on 44px bars, each inside its track, with no sideways scroll: ' + JSON.stringify(fin));
        await tapJs('#screen .pb [data-act="flight"][data-code="samlee-sb"]'); await measure('P-person from a traveler\'s bar (the organizer, no landing time yet)');
        if ((await page.evaluate(() => (document.activeElement || {}).id)) !== 'tm-arr') fails.push('a booked traveler\'s bar with no landing time should open their flight at the 🛬 field');
        await tapJs('#sheet [data-act="sh-close"]');
        if (!(await page.$('#screen [data-act="paidopen"]'))) fails.push('at 🏁 the organizer\'s trip view should have 💵 ＋');
        await tapJs('#screen [data-act="paidopen"]'); await page.type('#sheet #paid-amt', '$123,456'); await measure('P-stage (💵 typed)');
        await tapJs('#sheet [data-act="paidsave"]'); await measure('P-stage (💵 Save asks first)');
        if (!(await page.$('#sheet .paidb.arm')) || !(await page.$('#sheet .paidask .paidw'))) fails.push('💵 Save should ask first (⚠ … 🔒 above the field)');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        // PIA-139 fix pass: my booked bar on the Done trip [🎫 🛬 15:10 ☀ | ✈⏱↗], and a paid trip's 💵 entered again (✎)
        await page.click('#screen [data-trip="' + BKM + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('trip with my booked bar (🎫 🛬 | ✈⏱↗)');
        if (!(await page.$('#screen .split.prim [data-act="mytimes"] + a[data-k="flighty"]'))) fails.push('a booked traveler\'s bar should be [🎫 🛬 | ✈⏱↗]');
        await tapJs('#screen .split.prim [data-act="mytimes"]'); await measure('P-person from my booked bar');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-trip="' + BKP + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('a paid trip (🏁, times 🔒)');
        await tapJs('#screen [data-act="stage"]'); await measure('P-stage (💵 paid, ✎)');
        await tapJs('#sheet [data-act="paidedit"]'); await measure('P-stage (💵 entered again)');
        if (!(await page.$('#sheet #paid-amt'))) fails.push('✎ on a paid trip should give the 💵 field again');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-trip="' + DW + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await tapJs('#screen .nav [data-act="caladd"]'); await measure('P-calendar-add (tentative ?)');
        if (!(await page.$('#sheet .tq'))) fails.push('P-calendar-add before the dates are set should carry the ? corner');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="stage"]'); await measure('P-stage (💵 greyed: not everyone booked)');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#tabbar [data-v="map"]'); await page.waitForTimeout(120);
        if (await page.$('#screen [data-act="pick"][data-id="' + BKV + '"]')) { await page.click('#screen [data-act="pick"][data-id="' + BKV + '"]'); await page.waitForTimeout(120); }
        await measure('Map (the Done trip\'s pickups, a ⏱ run)');
        if (!(await page.$('#screen .lanes .grp .pk'))) fails.push('the Map should show the Done trip\'s pickup chips with a ⏱ run');
        if (!(await page.$('#screen .lanes .pk .bk'))) fails.push('a booked traveler\'s pickup chip should carry its 🎫 corner');
        await tapJs('#screen .lanes .pk[data-code]'); await measure('P-person from a pickup chip');
        await tapJs('#sheet [data-act="sh-close"]');
        await page.click('#tabbar [data-v="trips"]'); await page.waitForTimeout(100);
        // PIA-138: P-dates in each state (the plan, a holiday picked, a start picked, my own days on one end), P-day, the undated
        // idea's ⟦window⟧ with ⬚ the best window, and a locked plan to read with 🔓
        await page.click('#screen [data-trip="' + DW + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await tapJs('#screen .daterow [data-act="dates"]'); await measure('P-dates (the plan)');
        await tapJs('#sheet [data-act="dhol"]'); await measure('P-dates (a holiday picked)');
        await tapJs('#sheet [data-act="dday"][data-v="2026-11-13"]'); await measure('P-dates (a start picked, 📌⚠)');
        await tapJs('#sheet [data-act="dtarget"][data-v="me"]'); await measure('P-dates (my own days)');
        await tapJs('#sheet [data-act="dend"][data-v="0"]'); await tapJs('#sheet [data-act="dday"][data-v="2026-11-05"]'); await measure('P-dates (my arrival only, ⚠ off the plan)');
        await tapJs('#sheet [data-act="dtarget"][data-v="trip"]'); await tapJs('#sheet [data-act="dlook"]'); await tapJs('#sheet [data-act="dday"][data-v="2026-11-07"]'); await measure('P-day');
        if ((await page.getAttribute('#sheet', 'data-popup')) !== 'P-day') fails.push('👥 then a day should open P-day');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
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
        await page.click('#screen [data-act="edit"]'); await page.waitForTimeout(100); await measure('P-edit');
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
        await page.click('#screen [data-trip="' + M8 + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('the 8-member trip with its total block ($—)');
        await tapJs('#screen .totalblk[data-act="total"]'); await measure('P-total (8 long names, all $—, 🔍4)');
        const s4 = await page.$eval('#sheet [data-act="search"][data-v="total"]', (e) => e.textContent.replace(/\s+/g, '')).catch(() => null);
        if (s4 !== '🔍4/5' || net.search) fails.push('P-total on the 8-member trip should offer 🔍4/5 before any search, got ' + JSON.stringify(s4) + ' after ' + net.search);
        // PIA-140 fix pass: P-total draws a leg as P-person does: a never-searched $— is dashed (the sheet's own rules, not a row's)
        const hollowCss = await page.$eval('#sheet .trows .lgp.hollow', (e) => getComputedStyle(e).borderTopStyle).catch(() => null);
        if (hollowCss !== 'dashed') fails.push('P-total\'s $— should be dashed (as in P-person), got ' + JSON.stringify(hollowCss));
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
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen .totalblk[data-act="total"]'); await measure('P-total (⛔ the Worker\'s day cap)');
        const lockTxt = await page.$eval('#sheet [data-act="search"][data-k="cap"]', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
        if (lockTxt !== '⛔ 17:00') fails.push('the day cap should show ⛔ with the local reset time (17:00 in Los Angeles), got ' + JSON.stringify(lockTxt));
        await tapJs('#sheet .trow [data-act="person"][data-code="anastasiakonstantinopoulou-x1"]'); await measure('P-person (⛔ beside the day chips)');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-act="settings"]'); await page.waitForTimeout(100); await measure('⚙ (🔍 today, this visit, the month cap, ⛔)');
        if (!(await page.$('#sheet #org-cap')) || !(await page.$('#sheet .budget .bud')) || !(await page.$('#sheet .capt'))) fails.push('⚙ on the organizer\'s phone should show the searches left today, the month cap and ⛔');
        // PIA-152: ⚙ shows the build beside its glyph, one line, inside the header, readable (not the background's colour)
        const bld = await page.$eval('#sheet .sh-hd .bld', (e) => { const r = e.getBoundingClientRect(), h = e.closest('.sh-hd').getBoundingClientRect(), cs = getComputedStyle(e);
          return { txt: e.textContent, in: r.left >= h.left && r.right <= h.right && r.height < 30, color: cs.color, bg: getComputedStyle(document.querySelector('#sheet')).backgroundColor }; }).catch(() => null);
        if (!bld || !/^#\d+$/.test(bld.txt) || !bld.in || bld.color === bld.bg) fails.push('⚙ should show the build (#NNN) inside its header, on one line, readable; got ' + JSON.stringify(bld));
        await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }); });
        await page.click('#sheet [data-act="devlink"]'); await page.waitForTimeout(150); await measure('P-link');
        // PIA-140 fix pass: the visit's 8 spent (⛔ ↻ in P-total and in a person's square, then ↻8? asked), the month locked by SerpAPI
        // (⛔ 11/1, ⛔ alone in a square, the trip page's block too), and ⚙ with every lock in its own row
        await tapJs('#sheet [data-act="sh-close"]');
        await page.evaluate(() => { localStorage.removeItem('pialax_daily_cap_v1'); sessionStorage.setItem('pialax_spent_v2', '8'); });
        await page.click('#screen [data-trip="' + M8 + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('the 8-member trip, the visit\'s 8 spent (⛔ on its total block)');
        await tapJs('#screen .totalblk[data-act="total"]'); await measure('P-total (⛔ ↻, the visit\'s 8 spent)');
        if (!(await page.$('#sheet [data-act="newvisit"]'))) fails.push('P-total with the visit\'s 8 spent should offer ⛔ ↻');
        else { await tapJs('#sheet [data-act="newvisit"]'); await measure('P-total (↻8? a new visit asked)'); }
        await tapJs('#sheet .trow [data-act="person"][data-code="anastasiakonstantinopoulou-x1"]'); await measure('P-person (⛔ ↻ in the square)');
        await tapJs('#sheet [data-act="sh-close"]');
        await page.evaluate(() => { sessionStorage.setItem('pialax_spent_v2', '0'); const q = JSON.parse(localStorage.getItem('pialax_serpapi_quota') || '{}'); q.exceeded = true; localStorage.setItem('pialax_serpapi_quota', JSON.stringify(q)); });
        await page.evaluate(() => window.scrollTo(0, 0));
        await tapJs('#screen [data-act="back"]'); await page.click('#screen [data-trip="' + M8 + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await measure('the 8-member trip, the month locked (⛔ 11/1 on its total block)');
        await tapJs('#screen .totalblk[data-act="total"]'); await measure('P-total (⛔ 11/1, SerpAPI refused)');
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
        // the board's price column holds $10,987, $10,987+ and $1,387+ without pushing the page sideways or clipping a digit
        await page.click('#screen [data-trip="' + DWJ + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('the board with $10,987, $10,987+ and $1,387+');
        const cells = await page.$$eval('#screen .pb .pb-row .pr', (els) => els.map((e) => [e.textContent, e.scrollWidth - e.clientWidth]));
        const want = ['$10,987', '$10,987+', '$1,387+'];
        if (!want.every((w) => cells.some((c) => c[0] === w))) fails.push('the board should show ' + want.join(', ') + ', got ' + JSON.stringify(cells.map((c) => c[0])));
        if (cells.some((c) => c[1] > 0)) fails.push('a price cell is clipped: ' + JSON.stringify(cells.filter((c) => c[1] > 0)));
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
        if (fails.length === 0) ok(`${label} — no horizontal scroll, every target ≥44px and named, ${scheme} tokens, in ${states} states`);
        else bad(`${label} — ${fails.slice(0, 4).join(' · ')}`);
      } catch (e) { bad(`${label} — threw: ${e && e.message ? e.message.split('\n')[0] : String(e)}${fails.length ? ' · ' + fails.slice(0, 2).join(' · ') : ''}`); }
      await ctx.close();
    }
  }
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
        await open(DW); await measure('the plan');
        await tapJs('#sheet [data-act="dhol"]'); await measure('a holiday picked');
        await tapJs('#sheet [data-act="dday"][data-v="2026-11-13"]'); await measure('a start picked (📌⚠)');
        await tapJs('#sheet [data-act="dtarget"][data-v="me"]'); await measure('my own days');
        await tapJs('#sheet [data-act="dend"][data-v="0"]'); await tapJs('#sheet [data-act="dday"][data-v="2026-11-05"]'); await measure('my arrival only (⚠🗓)');
        await tapJs('#sheet [data-act="dtarget"][data-v="trip"]'); await tapJs('#sheet [data-act="dlook"]'); await measure('👥 then a day');
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
          else { await page.click('#screen [data-trip="' + id + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await tapJs('#screen .totalblk[data-act="total"]'); }
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

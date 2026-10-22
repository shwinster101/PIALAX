'use strict';
// PIA-143: real Chromium map, failure fallback, airport picks and destination pricing.
// Uses the real Worker for shared-record writes. Paid replies are deterministic fixtures: no paid service is called.
// Asset bytes come from PIALAX_MAP_ASSETS or the exact public URLs; their pinned hashes are checked before use.
// Run: NODE_PATH=$(npm root -g) PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node scripts/test-map-browser.js
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), http = require('http');
const { execFileSync } = require('child_process');
const assert = require('assert/strict');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const M = require(path.join(ROOT, 'scripts/trip-model.js'));
const W = M.WORKER_URL, NOW = Date.UTC(2026, 9, 17, 19), KEY = 'pialax-test-edit-key-0123456789abcdefghijk', TOKEN = 'map-test-organizer-token';
const html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const mapURL = /var MAP_URL = '([^']+)'/.exec(html)[1], mapHash = /var MAP_SHA256 = '([^']+)'/.exec(html)[1];
const scripts = [...html.matchAll(/<script async src="([^"]+)" integrity="sha512-([^"]+)"/g)].map(m => ({ url: m[1], hash: m[2], name: path.basename(m[1]) }));
const clone = x => JSON.parse(JSON.stringify(x));
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; process.stdout.write('  OK  ' + message + '\n'); }
async function main() {
  const pw = (() => { try { return require('playwright'); } catch (_) { return require('playwright-core'); } })();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pialax-map-'));
  let browser, server;
  try {
    const assets = {};
    for (const a of scripts.concat([{ url: mapURL, name: 'countries-110m.json', hash: mapHash, alg: 'sha256' }])) {
      const file = path.join(process.env.PIALAX_MAP_ASSETS || temp, a.name);
      if (!fs.existsSync(file)) execFileSync('curl', ['--connect-timeout', '10', '--max-time', '30', '-fsSL', a.url, '-o', file]);
      const bytes = fs.readFileSync(file), got = crypto.createHash(a.alg || 'sha512').update(bytes).digest(a.alg ? 'hex' : 'base64');
      assert.equal(got, a.hash, a.name + ' pinned digest'); assets[a.url] = bytes;
    }
    check(scripts.length === 2 && scripts.every(a => fs.readFileSync(path.join(ROOT, 'pialax.html'), 'utf8').includes('integrity="sha512-' + a.hash + '"')),
      'd3 and topojson use v1’s exact security hashes; exact-version map bytes match their digest');
    const workerFile = path.join(temp, 'worker.mjs'); fs.writeFileSync(workerFile, fs.readFileSync(path.join(ROOT, 'worker.js')));
    const worker = (await import('file://' + workerFile)).default;
    server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port + '/app.html';
    browser = await pw.chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium' });
    async function phone(o = {}) {
      const doc = clone(o.doc || JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/idea-diwali.json'))));
      doc.edit_hash = crypto.createHash('sha256').update(KEY).digest('hex');
      const id = doc.id, kv = new Map([['idea:' + id, JSON.stringify(doc)]]), requests = [], paid = [];
      const env = { IDEAS: { async get(k) { return kv.get(k) || null; }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } } };
      const ctx = await browser.newContext({ viewport: { width: o.width || 360, height: 800 }, colorScheme: o.dark ? 'dark' : 'light', isMobile: true, hasTouch: true });
      await ctx.route('**/*', async route => {
        const req = route.request(), u = new URL(req.url()); requests.push({ url: req.url(), headers: req.headers() });
        if (req.url().startsWith(base)) return route.continue();
        if (assets[req.url()]) {
          if (o.fail === 'd3' && /\/d3\//.test(req.url()) || o.fail === 'topojson' && /\/topojson\//.test(req.url()) || o.fail === 'data' && req.url() === mapURL) return route.abort();
          const body = req.url() === mapURL && o.fail === 'digest' ? Buffer.concat([assets[req.url()], Buffer.from(' ')]) : assets[req.url()];
          return route.fulfill({ body, contentType: req.url() === mapURL ? 'application/json' : 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
        }
        assert.equal(u.origin, W, 'unexpected browser request');
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, X-Idea-Key, X-Pialax-Token', 'access-control-expose-headers': 'X-Fetched-At, X-Proxy-Cache', 'content-type': 'application/json' };
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (u.pathname === '/search' || u.pathname === '/account') {
          assert.equal(req.headers()['x-pialax-token'], TOKEN);
          if (u.pathname === '/account') return route.fulfill({ headers, json: { features: { multi_airport: true }, plan_searches_left: 900, total_searches_left: 900, spend: { serp: { used: paid.length, cap: 30 } } } });
          paid.push(req.url());
          const from = u.searchParams.get('departure_id').split(',')[0], to = u.searchParams.get('arrival_id').split(',')[0], day = u.searchParams.get('outbound_date');
          return route.fulfill({ headers: Object.assign({}, headers, { 'X-Fetched-At': new Date(NOW - 1000).toISOString(), 'X-Proxy-Cache': 'MISS' }), json: { best_flights: [{ price: 300, flights: [{ departure_airport: { id: from, time: day + ' 08:00' }, arrival_airport: { id: to, time: day + ' 15:00' } }] }] } });
        }
        const r = await worker.fetch(new Request(req.url(), { method: req.method(), headers: Object.assign({}, req.headers(), { origin: 'https://shwinster101.github.io' }), body: req.method() === 'POST' ? req.postData() : undefined }), env);
        return route.fulfill({ status: r.status, body: await r.text(), headers: Object.assign({}, Object.fromEntries(r.headers), headers) });
      });
      const seed = { pialax_watchlist_v2: [{ id, t: doc.idea.title, at: 1 }], pialax_idea_keys_v1: o.guest ? {} : { [id]: { edit_key: KEY } }, pialax_idea_me_v1: { [id]: doc.idea.members[0].code }, pialax_proxy_token: o.noToken ? '' : TOKEN,
        pialax_ui_v1: { v1read: 1 }, pialax_multi_airport_v1: '1', pialax_fares_v2: o.fares || {} };
      await ctx.addInitScript(({ seed, now }) => {
        const RealDate = Date; window.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
        for (const [key, v] of Object.entries(seed)) localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v));
      }, { seed, now: NOW });
      const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(base); await page.waitForSelector('#screen .card');
      await page.click('#tabbar [data-v="map"]');
      if (!o.fail) await page.waitForSelector('[data-map="ready"]');
      else { await page.waitForSelector('[data-map="fallback"]'); await page.waitForTimeout(150); }
      return { page, ctx, paid, requests, errors, read: () => JSON.parse(kv.get('idea:' + id)), replace: d => kv.set('idea:' + id, JSON.stringify(d)), doc, id };
    }
    async function measure(page, label) {
      const report = await page.evaluate(() => {
        const visible = e => !!(e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden],.vh'));
        function words(roots) {
          const out = [];
          for (const root of roots) if (visible(root)) for (const e of [root, ...root.querySelectorAll('*')]) if (visible(e) && !e.closest('[data-free]')) {
            for (const n of e.childNodes) if (n.nodeType === 3) out.push(...n.textContent.split(/\s+/).filter(t => /\p{L}/u.test(t)));
            if (e.tagName === 'INPUT' && e.type !== 'password') out.push(...(e.value || e.placeholder || '').split(/\s+/).filter(t => /\p{L}/u.test(t)));
          }
          return out;
        }
        const sheet = document.querySelector('#sheet'), open = visible(sheet), root = open ? sheet : document.querySelector('#screen');
        const small = [...root.querySelectorAll('button,a')].filter(visible).filter(e => { const r = e.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5 || !(e.getAttribute('aria-label') || e.textContent.trim()); }).map(e => e.outerHTML.slice(0, 160));
        return { words: words(open ? [sheet] : [root, document.querySelector('#tabbar')]), max: open ? 20 : 10, small, overflow: document.documentElement.scrollWidth > innerWidth + 1 || sheet.scrollWidth > sheet.clientWidth + 1 && open };
      });
      check(report.words.length <= report.max && !report.small.length && !report.overflow, label + ': words, 44px named controls, no overflow ' + JSON.stringify(report));
    }
    for (const width of [360, 390, 430]) for (const dark of [false, true]) {
      const t = await phone({ width, dark });
      check(await t.page.locator('.map .land').count() === 1 && await t.page.locator('.map .arc').count() >= 3 && await t.page.locator('.map .o.face').count() >= 3, width + (dark ? ' dark' : ' light') + ': real basemap, arcs and origin faces');
      check(t.paid.length === 0, 'opening the map spends no searches');
      await measure(t.page, 'Map');
      if (width === 360) await t.page.screenshot({ path: '/tmp/pialax143-map-' + (dark ? 'dark' : 'light') + '.png', fullPage: true });
      check(!t.requests.some(r => assets[r.url] && r.headers['x-pialax-token']), 'asset requests never carry the organizer token');
      await t.page.click('.map-places [data-act="mapairport"]'); await measure(t.page, 'Airport sheet');
      await t.page.click('#sheet [data-act="sh-close"]');
      await t.page.click('[data-act="candidate"]'); await t.page.fill('#candidate-ap', 'DEN'); await t.page.click('[data-act="candpreview"]');
      await measure(t.page, 'Destination preview');
      check(t.paid.length === 0 && await t.page.locator('#sheet [data-act="search"]').getAttribute('data-n') === '3', 'preview shows its exact cost before spending');
      await t.page.click('#sheet [data-act="search"]'); await t.page.waitForSelector('#sheet [data-act="canduse"]:not([aria-disabled])');
      check(t.paid.length === 3 && t.paid.every(u => new URL(u).searchParams.get('arrival_id') === 'DEN') && t.read().idea.destination.airport === 'RDU', 'one explicit tap prices only the preview; the shared destination is unchanged');
      await measure(t.page, 'Priced preview');
      await t.page.click('#sheet [data-act="canduse"]'); await t.page.waitForSelector('#sheet[hidden]', { state: 'attached' });
      check(t.read().idea.destination.airport === 'DEN' && await t.page.locator('.map-places').innerText().then(s => s.includes('DEN')), 'Use writes the destination through the real Worker and redraws Map from that record');
      check(t.errors.length === 0, 'no browser exceptions');
      await t.ctx.close();
    }
    for (const fail of ['d3', 'topojson', 'data', 'digest']) {
      const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/idea-diwali.json')));
      for (const x of doc.idea.members) doc.responses[x.code] = { status: 'in', origin: x.airport, note: '🛬15:00 🛫18:00', booked: true };
      const t = await phone({ fail, doc, guest: true });
      check(await t.page.locator('[data-map="ready"]').count() === 0 && await t.page.locator('.map-faces [data-act="person"]').count() === 3 && await t.page.locator('.lane .pk').count() > 0, fail + ': faces and pickups survive; no unverified map is drawn');
      await measure(t.page, fail + ' fallback');
      await t.page.click('.pk.arr'); await t.page.waitForSelector('#sheet[data-popup="P-day"]');
      check((await t.page.locator('#sheet .mapday').innerText()).includes('15:00'), fail + ': pickup opens the real names and recorded times');
      await measure(t.page, fail + ' pickup day');
      check(t.paid.length === 0 && !(await t.page.locator('#screen').innerText()).includes('$') && !t.requests.some(r => r.url === mapURL && r.headers['x-pialax-token']), fail + ': guest has no prices or searches; map fetch has no token');
      await t.ctx.close();
    }
    const ny = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/idea-diwali.json'))); ny.idea.destination.airport = 'PIA';
    for (const x of ny.idea.members) ny.responses[x.code] = { status: 'in', origin: x.airport, note: '' };
    const alt = await phone({ doc: ny });
    await alt.page.click('.map-places [data-v="ORD"]'); await alt.page.click('#sheet [data-act="mapwho"][data-code="ashwin-p8"]');
    const responded = alt.page.waitForResponse(r => r.url().includes('/idea/respond') && r.request().method() === 'POST');
    await alt.page.click('#sheet [data-act="legair"][data-end="0"][data-v="ORD"]');
    check((await responded).ok(), 'alternate airport change is accepted by the real Worker');
    await alt.page.waitForFunction(() => document.querySelector('#sheet [data-act="legair"][data-end="0"][data-v="ORD"]')?.getAttribute('aria-pressed') === 'true');
    check(alt.read().responses['ashwin-p8'].arrive_at === 'ORD' && alt.paid.length === 0, 'alternate-pin airport pick changes the shared arrival, without a search');
    await measure(alt.page, 'Alternate airport'); await alt.ctx.close();
    const eight = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/idea-8members.json')));
    for (const x of eight.idea.members) eight.responses[x.code] = { status: 'in', origin: x.airport, note: '' };
    const cap = await phone({ doc: eight });
    await measure(cap.page, 'Eight-person map');
    const overlaps = await cap.page.locator('.map').evaluate(el => {
      const boxes = [...el.querySelectorAll('button')].map(e => e.getBoundingClientRect()), out = [];
      boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => { if (Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1) out.push([a.x, b.x]); })); return out;
    });
    check(overlaps.length === 0, 'map faces and pins have separate touch targets at 360px');
    await cap.page.click('[data-act="candidate"]'); await cap.page.fill('#candidate-ap', 'DEN'); await cap.page.click('[data-act="candpreview"]');
    check(await cap.page.locator('#sheet [data-act="search"]').getAttribute('data-n') === '4', 'eight-person preview shows at most four searches per tap');
    await cap.page.click('#sheet [data-act="search"]'); await cap.page.waitForSelector('#sheet [data-act="search"]:not([aria-busy])');
    check(cap.paid.length === 4, 'first candidate tap spends exactly its displayed four searches');
    if (await cap.page.locator('#sheet [data-act="search"]').count()) {
      await cap.page.click('#sheet [data-act="search"]'); await cap.page.waitForSelector('#sheet [data-act="canduse"]:not([aria-disabled])');
    }
    check(cap.paid.length <= 8 && cap.paid.length > 4, 'remaining candidate legs fit the shared eight-search visit cap');
    await measure(cap.page, 'Eight-person priced preview');
    if (cap.paid.length < 8) {
      await cap.page.fill('#candidate-ap', 'MIA'); await cap.page.click('[data-act="candpreview"]');
      check(+(await cap.page.locator('#sheet [data-act="search"]').getAttribute('data-n')) === 8 - cap.paid.length, 'a second destination shares the remaining visit allowance');
      await cap.page.click('#sheet [data-act="search"]'); await cap.page.waitForSelector('#sheet [data-act="newvisit"]');
    }
    check(cap.paid.length === 8 && await cap.page.locator('#sheet [data-act="search"]:not([aria-disabled])').count() === 0, 'the ninth candidate search is locked until an explicit new visit');
    await measure(cap.page, 'Visit limit'); await cap.ctx.close();
    const locked = await phone(); await locked.page.click('[data-act="candidate"]'); await locked.page.fill('#candidate-ap', 'DEN');
    await locked.page.evaluate(() => localStorage.setItem('pialax_daily_cap_v1', '2026-10-17')); await locked.page.click('[data-act="candpreview"]');
    check((await locked.page.locator('#sheet [data-act="search"]').getAttribute('aria-label')).includes('Searches resume at'), 'candidate pricing honors the daily lock and shows its reset');
    await locked.page.click('#sheet [data-act="search"]', { force: true }); check(locked.paid.length === 0, 'tapping a daily-locked candidate spends nothing');
    await locked.page.evaluate(() => { localStorage.removeItem('pialax_daily_cap_v1'); localStorage.setItem('pialax_serpapi_quota', JSON.stringify({ period: '2026-10', used: 990, budget: 1000 })); });
    await locked.page.click('[data-act="candpreview"]');
    check((await locked.page.locator('#sheet [data-act="search"]').getAttribute('aria-label')).includes('11/1'), 'candidate pricing honors the monthly reset date');
    await measure(locked.page, 'Month limit'); await locked.ctx.close();
    const changed = await phone(); await changed.page.click('[data-act="candidate"]'); await changed.page.fill('#candidate-ap', 'DEN'); await changed.page.click('[data-act="candpreview"]');
    await changed.page.click('#sheet [data-act="search"]'); await changed.page.waitForSelector('#sheet [data-act="canduse"]:not([aria-disabled])');
    const moved = changed.read(); moved.idea.dates.departure = '2026-11-07'; changed.replace(moved);
    await changed.page.click('#sheet [data-act="canduse"]'); await changed.page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('Trip changed'));
    check(changed.read().idea.destination.airport === 'RDU', 'Use rechecks the fresh shared record: another phone’s date change prevents applying a stale preview');
    await changed.ctx.close();
    const pairDoc = clone(ny), pairFares = {}, pm = M.tripModel(pairDoc, { today: '2026-10-17', now: NOW, hasEditKey: true, hasToken: true, multiAirport: true });
    pm.travelers.forEach((x, i) => x.keys.forEach(k => { pairFares[k.key] = { p: 300 + i * 10, f: NOW - 1000, off: [{ p: 300 + i * 10, a: x.A, ar: x.d1 + ' 15:00' }] }; }));
    const paired = await phone({ doc: pairDoc, fares: pairFares }); await paired.page.click('.pk.arr');
    check(await paired.page.locator('#sheet .pair [data-k="pair"]').count() === 1 && (await paired.page.locator('#sheet .pair').innerText()).includes('15:00'), 'P-day shows the cheapest fresh cached pair and its arrival times, without a search');
    await measure(paired.page, 'Cheapest pickup pair'); check(paired.paid.length === 0, 'comparing cached pickup offers costs no searches'); await paired.ctx.close();
    for (const airport of ['ZZQ', 'LHR']) {
      const d = clone(ny); d.idea.destination.airport = airport;
      if (airport === 'ZZQ') d.idea.members.forEach(x => { x.airport = 'QQQ'; d.responses[x.code].origin = 'QQQ'; });
      const t = await phone({ doc: d, guest: true }); await measure(t.page, airport + ' map');
      check(await t.page.locator('.map-faces [data-act="person"]').count() === d.idea.members.length && t.paid.length === 0, airport + ': all faces remain reachable without searches');
      await t.ctx.close();
    }
    process.stdout.write('all ' + checks + ' map browser checks passing\n');
  } finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); fs.rmSync(temp, { recursive: true, force: true }); }
}
main().catch(e => { process.stderr.write(e.stack + '\n'); process.exitCode = 1; });

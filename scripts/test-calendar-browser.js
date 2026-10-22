'use strict';
// PIA-144/145: Calendar jobs in Chromium, real Worker writes, cross-phone reconciliation and UI agreement.
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');
const assert = require('assert/strict');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const M = require(path.join(ROOT, 'scripts/trip-model.js'));
const NOW = Date.UTC(2026, 9, 17, 19), TODAY = '2026-10-17', W = M.WORKER_URL, KEY = 'pialax-test-edit-key-0123456789abcdefghijk';
const clone = x => JSON.parse(JSON.stringify(x));
let count = 0;
function check(ok, label, data) { assert.ok(ok, label + (data ? ': ' + JSON.stringify(data) : '')); count++; process.stdout.write('  OK  ' + label + '\n'); }
function fixture() {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/idea-diwali.json')));
  d.idea.destination = { airport: 'PIA', city: 'Peoria' };
  d.responses = {
    'ashwin-p8': { status: 'in', origin: 'LAX', available_from: '2026-11-05', available_to: '2026-11-09', note: '' },
    'anjo-z5': { status: 'maybe', origin: 'LGA', available_from: '', available_to: '', note: '' }
  };
  const other = clone(d); other.id = 'calendarOtherTrip00001'; other.idea.title = '🌴 Another family trip';
  other.idea.dates = { departure: '2026-11-09', return: '2026-11-12', searchStart: '', searchEnd: '' };
  other.responses = { 'ashwin-p8': { status: 'in', origin: 'LAX', available_from: '', available_to: '', note: '' } };
  return [d, other];
}
async function main() {
  const { chromium } = (() => { try { return require('playwright'); } catch (_) { return require('playwright-core'); } })(), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pialax-calendar-'));
  let browser, server;
  try {
    const file = path.join(temp, 'worker.mjs'); fs.copyFileSync(path.join(ROOT, 'worker.js'), file);
    const worker = (await import('file://' + file)).default;
    server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(fs.readFileSync(path.join(ROOT, 'app.html'))); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port + '/app.html';
    browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {});
    function room(docs) {
      const hash = crypto.createHash('sha256').update(KEY).digest('hex'), kv = new Map();
      docs.forEach(d => kv.set('idea:' + d.id, JSON.stringify(Object.assign({}, d, { edit_hash: hash }))));
      return { read: id => JSON.parse(kv.get('idea:' + id)), replace: d => kv.set('idea:' + d.id, JSON.stringify(d)), env: { IDEAS: {
        async get(k) { return kv.get(k) || null; }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); }
      } } };
    }
    async function phone(docs, o = {}) {
      const db = o.db || room(docs), id = docs[0].id, requests = [], errors = [], net = { fail: false, failWrite: false };
      const ctx = await browser.newContext({ viewport: { width: o.width || 360, height: o.height || 800 }, colorScheme: o.dark ? 'dark' : 'light', isMobile: true, hasTouch: true });
      await ctx.route('**/*', async route => {
        const req = route.request(), u = new URL(req.url());
        if (req.url().startsWith(base)) return route.continue();
        if (u.origin !== W) return route.abort(); // pinned map libraries may fail; Calendar cannot depend on them
        requests.push({ path: u.pathname, method: req.method(), body: req.postData() });
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, X-Idea-Key, X-Pialax-Token', 'content-type': 'application/json' };
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (/^\/(search|account)$/.test(u.pathname)) return route.fulfill({ headers, json: {} });
        if (net.fail || net.failWrite && req.method() === 'POST') { net.failWrite = false; return route.fulfill({ status: 503, headers, json: { code: 'upstream' } }); }
        const response = await worker.fetch(new Request(req.url(), { method: req.method(), headers: Object.assign({}, req.headers(), { origin: 'https://shwinster101.github.io' }), body: req.method() === 'POST' ? req.postData() : undefined }), db.env);
        return route.fulfill({ status: response.status, headers: Object.assign({}, Object.fromEntries(response.headers), headers), body: await response.text() });
      });
      const seed = { pialax_watchlist_v2: docs.map((d, i) => ({ id: d.id, t: d.idea.title, at: i + 1 })), pialax_ui_v1: { sel: id, v1read: 1 },
        pialax_idea_me_v1: o.nobody ? {} : { [id]: o.me || 'ashwin-p8' }, pialax_idea_keys_v1: o.guest ? {} : Object.fromEntries(docs.map(d => [d.id, { edit_key: KEY }])) };
      await ctx.addInitScript(({ seed, now }) => {
        const RealDate = Date; window.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
        if (!sessionStorage.getItem('__calendar_seed')) {
          sessionStorage.setItem('__calendar_seed', '1'); Object.entries(seed).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
        }
      }, { seed, now: NOW });
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(base); await page.waitForFunction(n => document.querySelectorAll('#screen .card').length === n, docs.length);
      return { page, ctx, db, requests, errors, net, id };
    }
    const tap = async (p, selector) => { await p.click(selector); };
    const close = async p => { await tap(p, '#sheet [data-act="sh-close"]'); await p.waitForSelector('#sheet[hidden]', { state: 'attached' }); };
    async function measure(page, label) {
      const r = await page.evaluate(() => {
        const visible = e => !!e && !!e.getClientRects().length && !e.closest('[hidden],.vh') && getComputedStyle(e).visibility !== 'hidden';
        const sheet = document.querySelector('#sheet'), open = visible(sheet), roots = open ? [sheet] : [document.querySelector('#screen'), document.querySelector('#tabbar')], words = [], small = [];
        for (const root of roots) for (const e of [root, ...root.querySelectorAll('*')]) if (visible(e)) {
          if (!e.closest('[data-free]')) {
            for (const n of e.childNodes) if (n.nodeType === 3) words.push(...n.textContent.split(/\s+/).filter(t => /\p{L}/u.test(t)));
            if (e.tagName === 'INPUT' && e.type !== 'password') words.push(...(e.value || e.placeholder || '').split(/\s+/).filter(t => /\p{L}/u.test(t)));
          }
          if (e.matches('button,a')) { const r = e.getBoundingClientRect(); if (r.width < 43.5 || r.height < 43.5 || !(e.getAttribute('aria-label') || e.textContent.trim())) small.push(e.outerHTML.slice(0, 120)); }
        }
        return { words, small, max: open ? 20 : 10, overflow: document.documentElement.scrollWidth > innerWidth + 1 || open && sheet.scrollWidth > sheet.clientWidth + 1 };
      });
      check(r.words.length <= r.max && !r.small.length && !r.overflow, label + ': word budget, named 44px targets, no overflow', r);
    }
    async function agreement(t, docs) {
      const current = docs.map(d => t.db.read(d.id)), m = M.tripModel(current[0], { today: TODAY, now: NOW, otherTrips: current.slice(1) });
      const drawn = await t.page.$$eval('#screen [data-act="calday"]', es => es.map(e => ({ day: e.dataset.v, n: +e.dataset.n, drawn: +(e.querySelector('.pc-n')?.textContent || 0), warn: !!e.querySelector('[data-k="calclash"]') })));
      check(drawn.length >= 28 && drawn.every(d => { const p = M.calendarDay(m, d.day); return d.n === p.n && d.drawn === p.n && d.warn === !!p.clashes.length && d.n <= m.headsIn; }), 'every Calendar day agrees with the shared record and heads ring', drawn.filter(d => d.n > 0));
    }
    for (const width of [360, 390, 430]) for (const dark of [false, true]) {
      const docs = fixture(), t = await phone(docs, { width, dark }), p = t.page;
      await tap(p, '#tabbar [data-v="cal"]'); // one tap from Trips
      await p.waitForSelector('[data-act="calday"][data-v="2026-11-09"]');
      check((await p.locator('.monthhd h3').innerText()).includes('Nov'), width + '/' + dark + ': Calendar is one tap away and starts at the selected trip');
      await agreement(t, docs); await measure(p, 'Calendar');
      check(await p.locator('.monthhd button[data-k="page"]').count() === 2 && await p.locator('.pinday[data-pic]').count() === 1, 'Calendar arrows are keyed and the event-day picture is identified as the trip picture');
      if (width === 360) await p.screenshot({ path: '/tmp/pialax144-calendar-' + (dark ? 'dark' : 'light') + '.png', fullPage: true });
      await tap(p, '[data-act="calday"][data-v="2026-11-09"]'); // one tap to day details
      check((await p.locator('#sheet .dayn').innerText()).includes('3') && await p.locator('#sheet .clashrow').count() === 1, 'P-day shows the same headcount and the overlapping person/trip');
      await measure(p, 'Calendar day');
      await tap(p, '#sheet .dayfaces [data-code="ashwin-p8"]'); // one tap to the existing person sheet
      await p.waitForSelector('#sheet[data-popup="P-person"]');
      check(await p.locator('#sheet [data-act="sh-back"]').count() === 1, 'person is one tap from the day; Back returns to it');
      await tap(p, '#sheet [data-act="sh-back"]');
      await tap(p, '#sheet [data-act="calnew"]');
      check(await p.locator('#sheet[data-popup="P-new-what"]').count() === 1 && await p.inputValue('#new-title') === '' && await p.inputValue('#new-dest') === '', 'day plus opens a fresh create flow in one tap');
      await measure(p, 'Dated new trip'); await p.fill('#new-title', 'Calendar trip'); await p.fill('#new-dest', 'RDU'); await tap(p, '#sheet [data-act="nnext"]'); await tap(p, '#sheet [data-act="nnext"]'); check((await p.locator('#sheet .readout').innerText()).includes('11/9'), 'P-day’s date reaches the create date step'); await close(p);
      await tap(p, '[data-act="calmonth"][data-v="1"]'); await tap(p, '#tabbar [data-v="map"]'); await tap(p, '#tabbar [data-v="cal"]');
      check((await p.locator('.monthhd h3').innerText()).includes('Dec'), 'month navigation survives changing tabs');
      await tap(p, '[data-act="pick"][data-id="' + docs[1].id + '"]');
      check((await p.locator('.monthhd h3').innerText()).includes('Nov'), 'changing trips recenters Calendar on that trip');
      await p.reload(); await p.waitForSelector('[data-act="pick"][data-id="' + docs[1].id + '"][aria-pressed="true"]');
      check(await p.locator('[data-act="pick"][aria-pressed="true"]').getAttribute('data-id') === docs[1].id, 'reload preserves Calendar and the shared trip selection');
      check(!t.requests.some(r => /^\/(search|account)$/.test(r.path)), 'Calendar browsing, details and new-trip opening make no paid requests');
      check(t.errors.length === 0, 'Calendar has no browser exceptions', t.errors); await t.ctx.close();
    }
    const docs = fixture(), db = room(docs), a = await phone(docs, { db }), b = await phone(docs, { db, guest: true });
    await tap(a.page, '#tabbar [data-v="cal"]'); await tap(b.page, '#tabbar [data-v="cal"]');
    await tap(b.page, '[data-act="calday"][data-v="2026-11-09"]'); await tap(b.page, '#sheet .dayfaces [data-code="ashwin-p8"]');
    const replied = b.page.waitForResponse(r => r.url().includes('/idea/respond') && r.request().method() === 'POST');
    await tap(b.page, '#sheet [data-act="answer"][data-v="out"]'); await replied;
    await a.page.reload(); await a.page.waitForSelector('[data-act="calday"]'); await agreement(a, docs);
    check(await a.page.locator('[data-act="calday"][data-v="2026-11-09"]').getAttribute('data-n') === '2' && await a.page.locator('[data-v="2026-11-09"] [data-k="calclash"]').count() === 0, 'another phone’s Out updates presence and clears its overlap');
    await tap(a.page, '#screen .mini');
    check((await a.page.locator('#screen .ring text').textContent()) === '2/4', 'after reconciliation the trip ring agrees with Calendar presence and the shared answer');
    await tap(a.page, '#screen [data-act="back"]'); await tap(a.page, '#tabbar [data-v="trips"]');
    await tap(a.page, '#screen [data-act="seg"][data-v="family"]');
    check((await a.page.locator('#fam-board .ft').allTextContents())[0] === '2/4', 'Family shows the same reconciled headcount');
    await tap(a.page, '#tabbar [data-v="map"]');
    check(await a.page.locator('.map-faces [data-code="ashwin-p8"]').count() === 0, 'Map excludes the same traveler who answered Out');
    await tap(a.page, '#tabbar [data-v="cal"]'); await agreement(a, docs);
    await a.ctx.close(); await b.ctx.close();
    const link = await phone(fixture());
    await tap(link.page, '#tabbar [data-v="cal"]'); await tap(link.page, '[data-act="calday"][data-v="2026-11-09"]'); await tap(link.page, '#sheet .clashtrip');
    await link.page.waitForSelector('#screen[data-screen="trip-organizer"]');
    check((await link.page.locator('#screen h2.ttl').innerText()).includes('Another family trip'), 'the overlapping-trip link opens that real trip');
    await link.ctx.close();
    const failed = await phone(fixture(), { guest: true });
    await tap(failed.page, '#tabbar [data-v="cal"]'); await tap(failed.page, '[data-act="calday"][data-v="2026-11-09"]'); await tap(failed.page, '#sheet .dayfaces [data-code="ashwin-p8"]');
    failed.net.failWrite = true;
    const refusal = failed.page.waitForResponse(r => r.url().includes('/idea/respond') && r.request().method() === 'POST');
    await tap(failed.page, '#sheet [data-act="answer"][data-v="out"]'); check((await refusal).status() === 503, 'a failed Calendar-origin RSVP is a real refused Worker write');
    await failed.page.waitForFunction(() => document.querySelector('#sheet [data-act="answer"][data-v="in"]')?.getAttribute('aria-pressed') === 'true');
    check(failed.db.read(failed.id).responses['ashwin-p8'].status === 'in', 'a failed RSVP does not become a saved Out');
    await failed.ctx.close();
    const crowded = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/idea-8members.json')));
    crowded.idea.dates = { departure: '2026-12-30', return: '2027-01-02' };
    for (const x of crowded.idea.members) crowded.responses[x.code] = { status: 'in', origin: x.airport, note: '' };
    const many = await phone([crowded], { height: 667 });
    await tap(many.page, '#tabbar [data-v="cal"]'); await tap(many.page, '[data-act="calmonth"][data-v="1"]');
    check((await many.page.locator('.monthhd h3').innerText()).includes('Jan 2027'), 'month paging crosses the year boundary');
    await agreement(many, [crowded]); await tap(many.page, '[data-act="calday"][data-v="2027-01-01"]'); await measure(many.page, 'Eight long names on a short-screen Calendar day');
    await many.ctx.close();
    const guest = await phone(fixture(), { guest: true, nobody: true });
    await tap(guest.page, '#tabbar [data-v="cal"]'); await tap(guest.page, '[data-act="calday"][data-v="2026-11-09"]');
    check(!(await guest.page.locator('#sheet').innerText()).includes('$'), 'an unidentified guest sees no prices in Calendar');
    await measure(guest.page, 'Guest day'); await guest.ctx.close();
    process.stdout.write('all ' + count + ' Calendar browser checks passing\n');
  } finally { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); fs.rmSync(temp, { recursive: true, force: true }); }
}
main().catch(e => { process.stderr.write(e.stack + '\n'); process.exitCode = 1; });

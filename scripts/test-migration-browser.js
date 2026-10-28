'use strict';
// PIA-146: migration/import jobs in Chromium, real Worker writes, cross-phone reconciliation and UI agreement.
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
  const { chromium } = (() => { for (const name of ['playwright', 'playwright-core']) { try { return require(require.resolve(name, { paths: [ROOT, path.resolve(path.dirname(process.execPath), '..', 'node_modules'), ...(process.env.NODE_PATH || '').split(path.delimiter)] })); } catch (_) {} } throw new Error('Playwright is required'); })(), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pialax-migration-'));
  let browser, server;
  try {
    const file = path.join(temp, 'worker.mjs'); fs.copyFileSync(path.join(ROOT, 'worker.js'), file);
    const worker = (await import('file://' + file)).default;
    server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(fs.readFileSync(path.join(ROOT, 'app.html'))); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port + '/app.html';
    const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : '');
    browser = await chromium.launch(executable ? { executablePath: executable } : {});
    function room(docs) {
      const hash = crypto.createHash('sha256').update(KEY).digest('hex'), kv = new Map();
      docs.forEach(d => kv.set('idea:' + d.id, JSON.stringify(Object.assign({}, d, { edit_hash: hash }))));
      return { ids: () => [...kv.keys()].filter(k => k.startsWith('idea:')).map(k => k.slice(5)), read: id => JSON.parse(kv.get('idea:' + id)), replace: d => kv.set('idea:' + d.id, JSON.stringify(d)), env: { IDEAS: {
        async get(k) { return kv.get(k) || null; }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); }
      } } };
    }
    async function phone(docs, o = {}) {
      const db = o.db || room(docs), id = docs[0].id, requests = [], errors = [], net = { fail: false, failWrite: false, failPath: '', losePath: '' };
      const ctx = await browser.newContext({ viewport: { width: o.width || 360, height: o.height || 800 }, colorScheme: o.dark ? 'dark' : 'light', isMobile: true, hasTouch: true });
      await ctx.route('**/*', async route => {
        const req = route.request(), u = new URL(req.url());
        if (req.url().startsWith(base)) return route.continue();
        if (u.origin !== W) return route.abort(); // pinned map libraries may fail; Calendar cannot depend on them
        requests.push({ path: u.pathname, method: req.method(), body: req.postData() });
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, X-Idea-Key, X-Pialax-Token', 'content-type': 'application/json' };
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (/^\/(search|account)$/.test(u.pathname)) return route.fulfill({ headers, json: {} });
        if (net.fail || net.failWrite && req.method() === 'POST' || net.failPath === u.pathname && req.method() === 'POST') { net.failWrite = false; net.failPath = ''; return route.fulfill({ status: 503, headers, json: { code: 'upstream' } }); }
        if (u.pathname === '/idea' && req.method() === 'POST' && net.holdCreate) await net.holdCreate;
        const response = await worker.fetch(new Request(req.url(), { method: req.method(), headers: Object.assign({}, req.headers(), { origin: 'https://shwinster101.github.io' }), body: req.method() === 'POST' ? req.postData() : undefined }), db.env);
        if (net.losePath === u.pathname && req.method() === 'POST') { net.losePath = ''; await response.text(); return route.abort(); }
        return route.fulfill({ status: response.status, headers: Object.assign({}, Object.fromEntries(response.headers), headers), body: await response.text() });
      });
      const seed = { pialax_watchlist_v2: docs.map((d, i) => ({ id: d.id, t: d.idea.title, at: i + 1 })), pialax_ui_v1: { sel: id, v1read: 1 },
        pialax_idea_me_v1: o.nobody ? {} : { [id]: o.me || 'ashwin-p8' }, pialax_idea_keys_v1: o.guest ? {} : Object.fromEntries(docs.map(d => [d.id, { edit_key: KEY }])) };
      if (o.v1 !== undefined) seed.pialax_watchlist_v1 = o.v1;
      if (o.extra) Object.assign(seed, o.extra);
      await ctx.addInitScript(({ seed, now }) => {
        const RealDate = Date; window.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
        if (!localStorage.getItem('__migration_seed')) {
          localStorage.setItem('__migration_seed', '1'); Object.entries(seed).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
        }
      }, { seed, now: NOW });
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(base); await page.waitForFunction(n => document.querySelectorAll('#screen .card').length === n, docs.length);
      return { page, ctx, db, requests, errors, net, id };
    }
    const tap = async (p, sel) => p.click(sel);
    const close = async p => { await tap(p, '#sheet [data-act="sh-close"]'); };
    async function measure(page, label) {
      const r = await page.evaluate(() => {
        const root = document.querySelector('#sheet'), visible = e => !!e.getClientRects().length && !e.closest('[hidden],.vh') && getComputedStyle(e).visibility !== 'hidden', words = [], small = [];
        for (const e of [root, ...root.querySelectorAll('*')]) if (visible(e)) {
          if (!e.closest('[data-free]')) {
            if (e.tagName !== 'TEXTAREA') for (const n of e.childNodes) if (n.nodeType === 3) words.push(...n.textContent.split(/\s+/).filter(t => /\p{L}/u.test(t)));
            if (/^(INPUT|TEXTAREA)$/.test(e.tagName) && e.type !== 'password') words.push(...(e.value || e.placeholder || '').split(/\s+/).filter(t => /\p{L}/u.test(t)));
          }
          if (e.matches('button,a,input,textarea')) { const b = e.getBoundingClientRect(); if (b.width < 43.5 || b.height < 43.5 || !(e.getAttribute('aria-label') || e.textContent.trim() || e.labels?.length)) small.push(e.outerHTML.slice(0, 120)); }
        }
        return { words, small, overflow: document.documentElement.scrollWidth > innerWidth + 1 || root.scrollWidth > root.clientWidth + 1 };
      });
      check(r.words.length <= 20 && !r.small.length && !r.overflow, label + ': ≤20 words, named 44px controls, no overflow', r);
    }
    const legacy = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/idea-thanksgiving-legacy.json')));
    const storage = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/v1-watchlist-storage.json')));
    // Pure import adapter must reconstruct the same visible facts as shipping v1, not merely parse overrides.
    const v1History = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/v1-cutover-contract.json'))).history;
    const imported = M.historyItems(JSON.stringify(storage), TODAY), exact = imported.every(it => {
      const before = v1History.find(x => x.id === it.key);
      return before && ['title', 'dep', 'ret', 'eventDate', 'notes', 'sharedIdeaId'].every(k => (it.source[k] || '') === (before[k] || ''));
    });
    check(exact && imported.length === v1History.length, 'history adapter matches v1 starters, corrections, overrides and added trips');
    check(M.historyItems('{', TODAY) === null && M.historyItems('[]', TODAY) === null && M.historyItems('{"added":{}}', TODAY) === null, 'corrupt sources fail closed');
    const polluted = M.historyItems('{"added":[{"id":"__proto__"},{"id":"constructor"}]}', TODAY);
    check(polluted.length === 6, 'prototype-like local IDs cannot enter the import journal');
    const family = M.historyDraft(imported.find(i => i.key === 'london'), TODAY);
    check(family.members.length === 3 && family.members[0].headcount === 2 && family.members[2].airport === 'JAX', 'historical family defaults use the trip date and four people');
    async function migratePhone(o = {}) {
      const t = await phone([o.doc || legacy()], Object.assign({ v1: storage, me: 'LAX' }, o));
      // PIA-153: the card's own ⤒ opens the trip with P-migrate over it in one tap (o.card); else the trip view's ⤒, as before
      if (o.card) await tap(t.page, '#screen .card [data-act="migcard"]');
      else { await tap(t.page, '#screen [data-act="open"]'); await tap(t.page, '#screen [data-act="migrate"]'); }
      return t;
    }
    async function migFinal(p) { await tap(p, '#sheet [data-act="migpage"][data-v="1"]'); await tap(p, '#sheet [data-act="migpage"][data-v="1"]'); }
    // PIA-153: the update that landed closes its sheet back to the trip, the toast saying 🔒 ✓ (v1's chosen dates are 🔒 again)
    async function migClosed(p) { await p.waitForFunction(() => document.querySelector('#sheet').hidden && !document.querySelector('#toast').hidden); return p.evaluate(() => ({ toast: document.querySelector('#toast').textContent.trim(), screen: document.querySelector('#screen').getAttribute('data-screen'), lock: !!document.querySelector('#screen .daterow [data-k="lock"]'), stage: '' })); }
    for (const width of [360, 390, 430]) for (const dark of [false, true]) {
      const t = await migratePhone({ width, dark, card: width === 390 }), p = t.page, original = JSON.stringify(storage);
      check(await p.getAttribute('#sheet', 'data-popup') === 'P-migrate' && await p.getAttribute('#screen', 'data-screen') === 'trip-organizer', 'PIA-153 ⤒ Update trip opens over the trip ' + (width === 390 ? '(one tap on the card\'s ⤒)' : '(the trip view\'s ⤒)'));
      check(await p.inputValue('#mig-title') === 'Thanksgiving at home — Peoria' && await p.getAttribute('#sheet [data-act="migscene"][aria-pressed="true"]', 'data-v') === '0', 'PIA-153 the review shows the trip\'s picture (🦃 pressed) and name, P-edit\'s controls');
      await measure(p, 'Migration dates ' + width + '/' + dark);
      // PIA-153: the organizer renames the v1 trip in the same review ("🦃 Thanksgiving"); the plan he picks reads chosen (filled)
      await p.fill('#mig-title', 'Thanksgiving'); await measure(p, 'Migration renamed ' + width + '/' + dark);
      await tap(p, '#sheet [data-act="migplan"][data-v="span"]');
      const sel = await p.evaluate(() => [...document.querySelectorAll('#sheet [data-act="migplan"]')].map((b) => [b.dataset.v, b.getAttribute('aria-pressed'), getComputedStyle(b).backgroundColor, getComputedStyle(b).color]));
      const on = sel.find((x) => x[1] === 'true'), off = sel.find((x) => x[1] === 'false');
      check(sel.length === 2 && on && on[0] === 'span' && off && on[2] !== off[2] && on[3] !== off[3], 'PIA-153 the plan chosen is filled, the other outlined (aria-pressed styled: background and ink differ)', sel);
      await tap(p, '#sheet [data-act="migpage"][data-v="1"]');
      check(await p.inputValue('#mig-name') === 'Mom & Dad', 'first suggested identity is Mom & Dad'); await measure(p, 'Migration name');
      await tap(p, '#sheet [data-act="migrow"][data-v="1"]'); check(await p.inputValue('#mig-name') === 'Ashwin', 'Me at LAX is suggested as Ashwin');
      await tap(p, '#sheet [data-act="migpage"][data-v="1"]'); await measure(p, 'Migration confirmation');
      await tap(p, '#sheet [data-act="migsource"]'); await measure(p, 'Migration note editor'); await tap(p, '#sheet [data-act="mignoteoriginal"]'); await measure(p, 'Original note page');
      await tap(p, '#sheet [data-act="sh-back"]'); await tap(p, '#sheet [data-act="sh-back"]');
      await tap(p, '#sheet [data-act="migsav"]'); await p.waitForFunction(id => JSON.parse(localStorage.getItem('pialax_transfer_v1'))?.migrations?.[id]?.done, t.id);
      const d = t.db.read(t.id), model = M.tripModel(d, { today: TODAY, now: NOW });
      check(!model.legacy && model.plan.s === '2026-11-20' && model.pin === '2026-11-26' && d.decision.stage === 'chosen' && d.decision.estimate_total === null && d.decision.chosen.familyTotal === null, 'migration keeps the dinner pin, picks reviewed dates and removes estimates');
      check(d.idea.members.map(m => m.code).join(',') === 'PIA,LAX,LGA' && d.responses.LGA.available_from === '2026-11-24' && d.responses.LGA.leave_from === 'ORD' && d.responses.LGA.note.includes('PTO approved'), 'IDs, individual dates, open-jaw airports and notes survive');
      check(d.idea.title === '🦃 Thanksgiving' && t.requests.filter(r => r.path === '/idea/update' && r.method === 'POST').length === 1, 'PIA-153 the new name goes in the update itself (one /idea/update): "🦃 Thanksgiving"', d.idea.title);
      check(await p.evaluate(() => localStorage.getItem('pialax_watchlist_v1')) === original, 'migration never changes v1 storage');
      check(!t.requests.some(r => /^\/(search|account)$/.test(r.path)), 'migration makes no paid requests');
      const done = await migClosed(p);
      // (PIA-154: the stage is read in ⋯ More; ✎ Edit is a row there. PIA-155: its one stage line)
      await tap(p, '#screen .nav [data-act="stage"]');
      done.stage = await p.getAttribute('#sheet .sline', 'aria-label').catch(() => '');
      const edit = await p.locator('#sheet [data-act="edit"]').count();
      await tap(p, '#sheet [data-act="sh-close"]');
      check(done.toast === '🔒 ✓' && done.screen === 'trip-organizer' && done.lock && done.stage === 'Stage 3 of 5, Dates set', 'PIA-153 the update closes its sheet back to the trip; the toast says 🔒 ✓ and the trip reads 🔒 Dates set (its pill\'s 🔒, ⋯ More\'s stage)', done);
      check(edit === 1 && !await p.locator('#screen [data-act="migrate"]').count(), 'successful update unlocks the existing v2 editor (⋯ More › ✎ Edit)');
      check(await p.evaluate(() => (document.querySelector('#screen .ttl [data-free]') || {}).textContent) === '🦃 Thanksgiving', 'PIA-153 the trip view shows its new name');
      check(t.errors.length === 0, 'migration has no browser exceptions', t.errors); await t.ctx.close();
    }
    const stale = await migratePhone(); await tap(stale.page, '#sheet [data-act="migplan"][data-v="span"]');
    const changed = stale.db.read(stale.id); changed.responses.LGA.available_from = '2026-11-23'; stale.db.replace(changed);
    await migFinal(stale.page); const writes = stale.requests.filter(r => r.method === 'POST').length;
    await tap(stale.page, '#sheet [data-act="migsav"]'); await stale.page.waitForSelector('#sheet .warnline');
    check(stale.requests.filter(r => r.method === 'POST').length === writes && (await stale.page.locator('#sheet').innerText()).includes('Changed'), 'stale review sends no writes and asks for another review'); await measure(stale.page, 'Changed migration'); await stale.ctx.close();
    const partial = await migratePhone(); await tap(partial.page, '#sheet [data-act="migplan"][data-v="span"]'); await migFinal(partial.page);
    partial.net.failPath = '/idea/respond'; await tap(partial.page, '#sheet [data-act="migsav"]'); await partial.page.waitForSelector('#sheet .warnline');
    check(!M.tripModel(partial.db.read(partial.id), { today: TODAY, now: NOW }).legacy, 'the update landed before its refused follow-plan normalization');
    await partial.page.reload(); await partial.page.waitForSelector('#screen [data-act="migrate"]'); await tap(partial.page, '#screen [data-act="migrate"]'); await tap(partial.page, '#sheet [data-act="migsav"]');
    await partial.page.waitForFunction(id => JSON.parse(localStorage.getItem('pialax_transfer_v1'))?.migrations?.[id]?.done, partial.id);
    check(partial.requests.filter(r => r.path === '/idea/update' && r.method === 'POST').length === 1 && partial.db.read(partial.id).responses.LAX.available_from === '', 'reload resumes only owed steps without repeating the update'); await partial.ctx.close();
    const lost = await migratePhone(); await migFinal(lost.page); lost.net.losePath = '/idea/update'; await tap(lost.page, '#sheet [data-act="migsav"]'); await lost.page.waitForSelector('#sheet .warnline');
    await tap(lost.page, '#sheet [data-act="migsav"]'); await lost.page.waitForFunction(id => JSON.parse(localStorage.getItem('pialax_transfer_v1'))?.migrations?.[id]?.done, lost.id);
    check(lost.requests.filter(r => r.path === '/idea/update' && r.method === 'POST').length === 1, 'a lost update reply is reconciled against its after-state without replay'); await lost.ctx.close();
    const bookedDoc = legacy(); bookedDoc.responses.LAX.booked = true; bookedDoc.responses.LAX.available_from = ''; bookedDoc.responses.LAX.available_to = '';
    const booked = await migratePhone({ doc: bookedDoc }); await tap(booked.page, '#sheet [data-act="migplan"][data-v="span"]'); await migFinal(booked.page); await tap(booked.page, '#sheet [data-act="migsav"]');
    await booked.page.waitForFunction(id => JSON.parse(localStorage.getItem('pialax_transfer_v1'))?.migrations?.[id]?.done, booked.id);
    check(booked.db.read(booked.id).responses.LAX.booked && booked.db.read(booked.id).responses.LAX.available_from === '2026-11-25', 'a plan move pins the days a booked traveler depended on'); await booked.ctx.close();
    async function openImport(p) { await tap(p, '#screen [data-act="settings"]'); await tap(p, '#sheet [data-act="himport"]'); }
    async function reviewItem(p, key) { if (['tgiving', 'london', 'builder-mg1x2y', 'builder-bad001'].includes(key)) await tap(p, '#sheet [data-act="hipage"][data-v="1"]'); await tap(p, '#sheet [data-act="hitem"][data-v="' + key + '"]'); }
    async function historyFinal(p) { for (let i = 0; i < 3; i++) await tap(p, '#sheet [data-act="hpage"][data-v="1"]'); await tap(p, '#sheet [data-act="hconfirm"]'); }
    async function saved(p, key) { await p.waitForFunction(k => JSON.parse(localStorage.getItem('pialax_transfer_v1'))?.history?.[k]?.state === 'done', key); return p.evaluate(k => JSON.parse(localStorage.getItem('pialax_transfer_v1')).history[k].id, key); }
    for (const width of [360, 390, 430]) for (const dark of [false, true]) {
      const t = await phone([fixture()[0]], { width, dark, v1: storage }), p = t.page;
      check(t.db.ids().length === 1 && !t.requests.some(r => r.method === 'POST'), 'opening v2 never seeds history');
      await openImport(p); await measure(p, 'Import list'); await reviewItem(p, 'nyc'); await measure(p, 'History dates');
      check(await p.inputValue('#hi-return') === '', 'one-way NYC retains an absent return');
      await tap(p, '#sheet [data-act="hpage"][data-v="1"]'); await measure(p, 'History travelers');
      await tap(p, '#sheet [data-act="hpage"][data-v="1"]'); await measure(p, 'History note');
      await tap(p, '#sheet [data-act="hisource"]'); await measure(p, 'History original note'); await tap(p, '#sheet [data-act="sh-back"]');
      const download = p.waitForEvent('download'); await tap(p, '#sheet [data-act="hbackup"]'); const file = await download;
      const backup = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
      check(backup.raw === JSON.stringify(storage) && !JSON.stringify(backup).includes(KEY), 'backup preserves source text and contains no organizer key');
      await tap(p, '#sheet [data-act="hpage"][data-v="1"]'); await measure(p, 'History confirmation'); await tap(p, '#sheet [data-act="hconfirm"]');
      await tap(p, '#sheet [data-act="hsave"]'); const id = await saved(p, 'nyc'), d = t.db.read(id);
      check(d.idea.dates.departure === '2026-08-28' && d.idea.dates.return === '' && d.idea.members.length === 1 && d.idea.members[0].airport === 'LAX' && Object.values(d.responses)[0].booked, 'NYC imports one real traveler, booking and original one-way dates');
      check(d.idea.recommendation === null && d.decision.actual_total === null && d.decision.estimate_total === null, 'history never invents prices or paid totals');
      check(await p.evaluate(() => JSON.parse(localStorage.getItem('pialax_watchlist_v2')).find(x => x.id === JSON.parse(localStorage.getItem('pialax_transfer_v1')).history.nyc.id).arch), 'past one-way history is on the shelf');
      check(await p.evaluate(() => localStorage.getItem('pialax_watchlist_v1')) === JSON.stringify(storage), 'history import leaves v1 source unchanged');
      const n = t.db.ids().length; await p.reload(); await p.waitForSelector('#screen [data-act="settings"]'); await openImport(p); await reviewItem(p, 'nyc'); await p.waitForSelector('#screen[data-screen="trip-organizer"]');
      check(t.db.ids().length === n, 'reopening imported history opens the same shared trip');
      check(!t.requests.some(r => /^\/(search|account)$/.test(r.path)), 'history browsing and import make no paid requests'); check(t.errors.length === 0, 'history has no browser exceptions', t.errors); await t.ctx.close();
    }
    const postponed = await phone([fixture()[0]], { v1: storage }); await openImport(postponed.page); await reviewItem(postponed.page, 'tgiving'); await historyFinal(postponed.page); await tap(postponed.page, '#sheet [data-act="hsave"]');
    const cary = postponed.db.read(await saved(postponed.page, 'tgiving'));
    check(cary.decision.stage === 'dropped' && Object.keys(cary.responses).length === 0 && M.tripModel(cary, { today: TODAY, now: NOW }).headsIn === 0, 'postponed Cary creates neither attendance nor bookings'); await postponed.ctx.close();
    const histFail = await phone([fixture()[0]], { v1: storage }); await openImport(histFail.page); await reviewItem(histFail.page, 'memphis'); await historyFinal(histFail.page); histFail.net.failPath = '/idea/booked'; await tap(histFail.page, '#sheet [data-act="hsave"]'); await histFail.page.waitForSelector('#sheet .warnline');
    await histFail.page.reload(); await histFail.page.waitForSelector('#screen [data-act="settings"]'); await openImport(histFail.page); await reviewItem(histFail.page, 'memphis'); await tap(histFail.page, '#sheet [data-act="hsave"]'); await saved(histFail.page, 'memphis');
    check(histFail.requests.filter(r => r.path === '/idea' && r.method === 'POST').length === 1, 'a booking failure resumes the confirmed creation after reload without a second POST'); await histFail.ctx.close();
    const uncertain = await phone([fixture()[0]], { v1: storage }); await openImport(uncertain.page); await reviewItem(uncertain.page, 'nyc'); await historyFinal(uncertain.page); uncertain.net.losePath = '/idea'; await tap(uncertain.page, '#sheet [data-act="hsave"]'); await uncertain.page.waitForSelector('#sheet .warnline');
    await measure(uncertain.page, 'Uncertain creation'); await uncertain.page.reload(); await uncertain.page.waitForSelector('#screen [data-act="settings"]'); await openImport(uncertain.page); await reviewItem(uncertain.page, 'nyc');
    check((await uncertain.page.locator('#sheet').innerText()).includes('Do not retry') && !await uncertain.page.locator('#sheet [data-act="hsave"]').count() && uncertain.requests.filter(r => r.path === '/idea' && r.method === 'POST').length === 1, 'a lost creation response blocks blind retries across reloads'); await uncertain.ctx.close();
    const london = await phone([fixture()[0]], { v1: storage }); await openImport(london.page); await reviewItem(london.page, 'london');
    await historyFinal(london.page); await tap(london.page, '#sheet [data-act="hsave"]'); const londonId = await saved(london.page, 'london'), londonDoc = london.db.read(londonId);
    const lm = M.tripModel(londonDoc, { today: TODAY, now: NOW });
    check(lm.headsIn === 4 && lm.stage === 'done' && lm.shelf && M.calendarDay(lm, '2026-06-26').n === 4 && lm.members.find(m => m.name === 'Anjo').airport === 'JAX', 'London history agrees on four people, historical origins, stage and daily presence');
    const priorCount = london.db.ids().length;
    await london.page.evaluate(() => localStorage.removeItem('pialax_transfer_v1')); await london.page.reload(); await london.page.waitForSelector('#screen [data-act="settings"]');
    await openImport(london.page); await reviewItem(london.page, 'london'); await historyFinal(london.page); await tap(london.page, '#sheet [data-act="hsave"]');
    check(await saved(london.page, 'london') === londonId && london.db.ids().length === priorCount, 'known shared history is reused even without this phone’s import mapping'); await london.ctx.close();
    const denied = await phone([fixture()[0]], { v1: storage }); await openImport(denied.page); await reviewItem(denied.page, 'nyc'); await historyFinal(denied.page);
    await denied.page.evaluate(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'pialax_transfer_v1') throw new Error('quota'); return set.call(this, k, v); }; });
    await tap(denied.page, '#sheet [data-act="hsave"]'); await denied.page.waitForSelector('#sheet .warnline');
    check(!denied.requests.some(r => r.path === '/idea' && r.method === 'POST'), 'unavailable durable storage stops creation before any POST'); await measure(denied.page, 'Storage failure'); await denied.ctx.close();
    const badJournal = await phone([fixture()[0]], { v1: storage, extra: { pialax_transfer_v1: 'broken' } }); await openImport(badJournal.page);
    check(!await badJournal.page.locator('#sheet [data-act="hitem"]').count() && !badJournal.requests.some(r => r.method === 'POST'), 'corrupt import progress cannot silently reset and duplicate history'); await badJournal.ctx.close();
    const wrong = await phone([legacy()], { v1: storage, me: 'LAX', extra: { pialax_idea_keys_v1: { [legacy().id]: { edit_key: 'wrong-key-0123456789abcdefghijk' } } } });
    await tap(wrong.page, '#screen [data-act="open"]'); await wrong.page.waitForSelector('#screen[data-screen="trip-portal"]');
    check(!await wrong.page.locator('#screen [data-act="migrate"]').count(), 'an invalid organizer key cannot open migration'); await wrong.ctx.close();
    const undatedDoc = legacy(); undatedDoc.idea.recommendation = null; undatedDoc.idea.dates = { departure: '', return: '', searchStart: '2026-11-01', searchEnd: '2026-12-01' }; undatedDoc.responses = {}; undatedDoc.decision = { stage: 'proposed' };
    const undated = await migratePhone({ doc: undatedDoc, v1: { overrides: {}, added: [] } }); await migFinal(undated.page); await tap(undated.page, '#sheet [data-act="migsav"]');
    await undated.page.waitForFunction(id => JSON.parse(localStorage.getItem('pialax_transfer_v1'))?.migrations?.[id]?.done, undated.id);
    check(!M.docLegacy(undated.db.read(undated.id)) && undated.db.read(undated.id).idea.dates.searchStart === '2026-11-01' && undated.db.read(undated.id).idea.dates.departure === '', 'undated legacy ideas migrate without inventing a plan'); await undated.ctx.close();
    const tabs = await phone([fixture()[0]], { v1: storage }); await openImport(tabs.page); await reviewItem(tabs.page, 'nyc'); await historyFinal(tabs.page);
    let release; tabs.net.holdCreate = new Promise(r => { release = r; });
    await tap(tabs.page, '#sheet [data-act="hsave"]');
    await tabs.page.waitForFunction(() => JSON.parse(localStorage.getItem('pialax_transfer_v1'))?.history?.nyc?.state === 'uncertain');
    const second = await tabs.ctx.newPage(); await second.goto(base); await second.waitForSelector('#screen [data-act="settings"]'); await openImport(second); await reviewItem(second, 'nyc');
    check(!await second.locator('#sheet [data-act="hsave"]').count() && tabs.requests.filter(r => r.path === '/idea' && r.method === 'POST').length === 1, 'a second tab cannot retry an in-flight creation');
    release(); await saved(tabs.page, 'nyc'); await tabs.ctx.close();
    const guest = await phone([legacy()], { v1: storage, guest: true }); await tap(guest.page, '#screen [data-act="open"]');
    check(!await guest.page.locator('[data-act="migrate"]').count() && !await guest.page.locator('[data-act="himport"]').count(), 'guests cannot migrate or import'); await guest.ctx.close();
    process.stdout.write('all ' + count + ' migration browser checks passing\n');
  } finally { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); fs.rmSync(temp, { recursive: true, force: true }); }
}
main().catch(e => { process.stderr.write(e.stack + '\n'); process.exitCode = 1; });

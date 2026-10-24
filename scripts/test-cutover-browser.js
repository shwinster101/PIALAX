'use strict';
// PIA-147: public-entry navigation and compatibility, actual Chromium over HTTP.
// Fixture data only; paid routes and mutations are counted and prohibited.
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert/strict');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const M = require(path.join(ROOT, 'scripts/trip-model.js'));
const fx = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures', n)));
const contract = fx('v1-cutover-contract.json'), A = 'dwDiwaliRaleigh2026a01', B = 'thTahoeSkiWeekend26b02';
const KEY = 'pialax-test-edit-key-0123456789abcdefghijk', TOKEN = 'org-token-0123456789abcdefABCDEF';
let count = 0;
function check(value, label) { assert.ok(value, label); count++; console.log('  OK  ' + label); }
async function main() {
  const roots = [ROOT, path.resolve(path.dirname(process.execPath), '..', 'node_modules'), ...(process.env.NODE_PATH || '').split(path.delimiter)];
  let pw;
  for (const name of ['playwright', 'playwright-core']) { try { pw = require(require.resolve(name, { paths: roots })); break; } catch (_) {} }
  if (!pw) throw Error('Chromium/Playwright required; cutover cannot skip');
  const handler = require('./entry-server').entryHandler(ROOT);
  const server = http.createServer((req, res) => {
    if (req.url === '/previous') { res.setHeader('Content-Type', 'text/html'); res.end('<title>Previous</title><p>Previous</p>'); return; }
    handler(req, res);
  });
  let browser;
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium';
    browser = await pw.chromium.launch({ executablePath });
    const docs = Object.fromEntries(['idea-diwali.json', 'idea-tahoe.json', 'idea-thanksgiving-legacy.json'].map(n => { const d = fx(n); return [d.id, d]; }));
    async function phone(width = 390, colorScheme = 'light', seed = {}, extra = {}) {
      const ctx = await browser.newContext({ viewport: { width, height: 850 }, colorScheme, ...extra });
      const paid = [], writes = [], leaked = [], errors = [], navigations = [];
      await ctx.addInitScript(({ seed }) => {
        window.__entryURL = location.href;
        const D = Date; window.Date = class extends D { constructor(...a) { super(...(a.length ? a : [Date.UTC(2026, 9, 17, 19)])); } static now() { return D.UTC(2026, 9, 17, 19); } };
        // Populate a phone once; reload exercises durable storage, not reseeding.
        if (!sessionStorage.getItem('fixture-seeded')) {
          for (const [k,v] of Object.entries(seed)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
          sessionStorage.setItem('fixture-seeded', '1');
        }
      }, { seed });
      await ctx.route('**/*', async route => {
        const req = route.request(), u = new URL(req.url());
        if (req.url().includes(KEY) || req.url().includes(TOKEN) || (req.headers().referer || '').includes(KEY) || (u.origin !== M.WORKER_URL && Object.values(req.headers()).some(v => v.includes(KEY) || v.includes(TOKEN)))) leaked.push(u.pathname);
        if (u.origin === origin) return route.continue();
        if (u.origin !== M.WORKER_URL) return route.abort(); // verifies useful UI with map assets unavailable
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, X-Idea-Key, X-Pialax-Token' };
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (/^\/(search|account|extract|alert)/.test(u.pathname)) paid.push(u.pathname);
        if (req.method() !== 'GET') writes.push(u.pathname);
        const doc = docs[u.searchParams.get('id')];
        return route.fulfill({ status: doc ? 200 : 404, headers, json: doc || { code: 'not_found' } });
      });
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(e.message));
      page.on('framenavigated', f => { if (f === page.mainFrame()) navigations.push(f.url()); });
      async function open(url) {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(u => u.pathname.endsWith('/app.html'));
        await page.waitForSelector('#screen [data-act]');
      }
      async function finish() {
        check(!paid.length && !writes.length, 'entry/reload never spends or mutates shared records');
        check(!leaked.length && !errors.length, 'entry sends no URL/referrer secrets and has no page errors: ' + JSON.stringify({ leaked, errors }));
        await ctx.close();
      }
      return { ctx, page, open, finish, navigations };
    }
    const entries = ['', 'index.html', 'pialax.html', 'pialax-mobile.html'];
    // All entry names, deployment prefixes, breakpoints and themes. Direct app also tested below.
    for (const prefix of ['/', '/PIALAX/']) for (const width of [360, 390, 430, 1200]) for (const theme of ['light', 'dark']) {
      const t = await phone(width, theme);
      for (const entry of entries) {
        const suffix = '?unknown=%2f%2F&empty=&unicode=%F0%9F%8C%B4&repeat=1&repeat=2#section%20two';
        await t.open(origin + prefix + entry + suffix);
        const state = await t.page.evaluate(() => ({ initial: window.__entryURL, now: location.href, version: document.querySelector('meta[name="pialax-version"]').content,
          overflow: document.documentElement.scrollWidth > innerWidth, app: document.querySelector('#app').getBoundingClientRect().toJSON() }));
        check(state.initial === origin + prefix + 'app.html' + suffix && state.now === state.initial && state.version === '2.0.0', `${prefix + entry} ${width}/${theme}: encoded query/hash survive one hop to v2`);
        check(!state.overflow && (width < 700 || Math.abs(state.app.x - (width - state.app.width) / 2) < 2), 'phone fits; desktop app is centered');
      }
      await t.finish();
    }
    for (const entry of entries) {
      const t = await phone();
      const suffix = '?idea=' + A + '#k=' + KEY + '&t=' + TOKEN;
      await t.page.goto(origin + '/previous');
      await t.open(origin + '/PIALAX/' + entry + suffix);
      const read = () => t.page.evaluate(id => ({ initial: window.__entryURL, hash: location.hash, key: JSON.parse(localStorage.getItem('pialax_idea_keys_v1'))?.[id]?.edit_key,
        token: localStorage.getItem('pialax_proxy_token'), ids: JSON.parse(localStorage.getItem('pialax_watchlist_v2') || '[]').map(x => x.id) }), A);
      let state = await read();
      check(state.initial === origin + '/PIALAX/app.html' + suffix && state.hash === '' && state.key === KEY && state.token === TOKEN && state.ids.includes(A), entry + ': organizer credentials reach app, persist, then leave address');
      await t.page.reload(); await t.page.waitForSelector('#screen [data-act]'); state = await read();
      check(state.key === KEY && state.token === TOKEN && state.hash === '', 'reload retains organizer access without hash');
      await t.page.goBack();
      check(new URL(t.page.url()).pathname === '/previous', 'Back bypasses redirect shim');
      await t.finish();
    }
    const legacyLong = encodeURIComponent(Buffer.from(encodeURIComponent(JSON.stringify(contract.list.input)), 'binary').toString('base64'));
    for (const [label, suffix] of [['v2 list', '?l=' + A + '.' + B + '&f=%F0%9F%8C%B4'], ['v1 compact', '?w=' + contract.list.w], ['v1 long', '?wl=' + legacyLong]]) {
      const t = await phone(); await t.open(origin + '/PIALAX/pialax-mobile.html' + suffix);
      await t.page.waitForSelector('#sheet[data-popup="P-savelist"]');
      check(await t.page.evaluate(() => JSON.parse(localStorage.getItem('pialax_watchlist_v2') || '[]').length === 0 && !location.search), label + ': receiving sheet consumes link, saves nothing automatically');
      await t.page.locator('#sheet [data-act="svsave"]').click();
      check(await t.page.evaluate(ids => ids.every(id => JSON.parse(localStorage.getItem('pialax_watchlist_v2') || '[]').some(x => x.id === id)), [A, B]), label + ': explicit Save adds known IDs');
      await t.finish();
    }
    {
      const t = await phone(); await t.open(origin + '/?l=' + A + '.' + B + '#ks=' + A + '.' + KEY + '&t=' + TOKEN);
      check(await t.page.evaluate(ids => ids.every(id => JSON.parse(localStorage.getItem('pialax_watchlist_v2') || '[]').some(x => x.id === id)) && !location.hash && !location.search, [A,B]), 'own-devices link retains access and saves IDs');
      await t.finish();
    }
    for (const suffix of ['?idea=' + A + '&me=ashwin-p8', '?idea=' + A + '#m=ashwin-p8']) {
      const t = await phone(); await t.open(origin + '/PIALAX/pialax.html' + suffix);
      check(await t.page.evaluate(() => !location.hash && !location.search.includes('me=') && !localStorage.getItem('pialax_proxy_token') && !localStorage.getItem('pialax_idea_keys_v1')), 'personal hint is consumed without granting organizer access');
      await t.finish();
    }
    {
      const t = await phone(); await t.open(origin + '/PIALAX/index.html?tripIdea=' + encodeURIComponent(contract.builder));
      await t.page.waitForSelector('#new-title');
      check(await t.page.inputValue('#new-title') === 'Raleigh-Durham' && !t.page.url().includes('tripIdea='), 'legacy builder link prefills create; estimated fare is not imported (model/app suite)');
      await t.finish();
    }
    {
      const source = JSON.stringify(fx('v1-watchlist-storage.json'));
      const t = await phone(390, 'light', { pialax_watchlist_v1: source });
      await t.open(origin + '/PIALAX/');
      check(await t.page.evaluate(source => localStorage.getItem('pialax_watchlist_v1') === source && JSON.parse(localStorage.getItem('pialax_watchlist_v2')).some(x => x.id === 'tgLegacyThanksgiving01'), source), 'first redirected open discovers legacy IDs and preserves source bytes');
      await t.finish();
    }
    {
      const t = await phone();
      await t.open(origin + '/PIALAX/app.html?next=https%3A%2F%2Fevil.example&__proto__=bad#k=bad&t=bad');
      check(await t.page.evaluate(() => location.origin === new URL(window.__entryURL).origin && !location.hash && !localStorage.getItem('pialax_proxy_token') && ({}).polluted === undefined), 'direct app stays put; hostile/invalid link values are inert');
      check(t.navigations.filter(u => u.includes('/app.html')).length <= 2, 'direct app has no redirect loop');
      await t.finish();
    }
    {
      const t = await phone(390, 'light', {}, { javaScriptEnabled: false });
      await t.page.goto(origin + '/PIALAX/index.html?idea=' + A + '#section');
      check(await t.page.locator('noscript').innerText() === 'Enable JavaScript.' && await t.page.locator('#open').getAttribute('href') === 'app.html', 'no-script fallback explains JS and offers app link without claiming dynamic hash preservation');
      await t.ctx.close();
    }
    for (const url of ['/worker.js', '/scripts/fixtures/v1-cutover-contract.json', '/PIALAX/unknown.html']) {
      check((await fetch(origin + url)).status === 404, 'test HTTP server rejects non-entry path ' + url);
    }
    console.log('all ' + count + ' cutover browser checks passing');
  } finally { if (browser) await browser.close(); if (server.listening) await new Promise(r => server.close(r)); }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });

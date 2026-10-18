'use strict';
// test-app.js — PIA-134: the v2 shell in app.html, in Node (no browser).
//
// app.html's app IIFE is loaded through scripts/harness.js (the same loader as the v1 suites) with a shimmed
// address bar, storage, clock and fetch. Writes run against the REAL worker.js /idea handlers in-process, over an
// in-memory KV, so an optimistic doc is compared with what the Worker really returns. Groups are named after the
// PIA-134 acceptance criteria (AC1 … AC15); the browser-only criteria (rendered words, sheets, long-press, layout)
// live in test-words.js and test-viewport.mjs.
//
// Deterministic and offline: the clock is pinned to 2026-10-17 19:00 UTC (12:00 in Los Angeles), and any fetch
// that is not the in-process Worker fails the suite.

process.env.TZ = 'America/Los_Angeles';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { loadApi, extractAppBody, makeLocalStorage, makeShim } = require('./harness.js');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const APP = path.join(ROOT, 'app.html');
const NOW = Date.UTC(2026, 9, 17, 19, 0, 0);
const KEY = 'pialax-test-edit-key-0123456789abcdefghijk';
const KEY2 = 'another-organizer-key-0123456789ABCDEFGHIJ';
const TOKEN = 'org-token-0123456789abcdef';
const ORIGIN = 'https://shwinster101.github.io';
const W = 'https://pialax-proxy.ashwinyedavalli.workers.dev';
const BASE = ORIGIN + '/PIALAX/app.html';

let passCount = 0, failCount = 0;
function check(ok, msg, detail) {
  if (ok) { console.log('  OK  ' + msg); passCount++; return; }
  console.log('  XX  ' + msg + (detail === undefined ? '' : '\n        ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))));
  failCount++;
}
function section(t) { console.log('\n▶ ' + t); }
const clone = (o) => JSON.parse(JSON.stringify(o));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fx = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', n), 'utf8'));
const tick = (n) => new Promise((r) => { let i = 0; (function go() { if (i++ >= (n || 6)) return r(); setImmediate(go); })(); });

const strayNet = [];
globalThis.fetch = async (u) => { strayNet.push(String(u)); throw new Error('network disabled in test-app'); };

const QUIET = { log() {}, warn() {}, error() {}, info() {} };   // v1's boot notes (no CDN in Node) are not this suite's output
// the shimmed clock: pinned, and moved on only where a case says so (the focus gap)
let CLOCK = NOW;
class FixedDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(CLOCK); }
  static now() { return CLOCK; }
}

const EXPECT = ['S', 'DOCS', 'STAT', 'FAIL', 'PEND', 'WSEQ', 'KEYBAD', 'ST', 'readLink', 'applyLink', 'importV1Once', 'refresh', 'refreshAll', 'poll', 'onFocus',
  'respond', 'setBooked', 'organizerWrite', 'createTrip', 'applyLocal', 'api', 'errCode', 'errInfo', 'SHEETS', 'saveKey', 'editKeyFor', 'keysMap', 'setMe', 'meFor',
  'markSeen', 'setToken', 'tokenStr', 'setWorker', 'workerBase', 'listRead', 'listIds', 'organizerLink', 'devicesLink', 'modelOf', 'items', 'v1ShortIds', 'v1LegacyIds',
  'tripModel', 'POLL_MS', 'LEGEND', 'anyFailed', 'boot', 'render', 'qsParse', 'WORKER_OK', 'openSheet', 'closeSheet', 'showError', 'FOCUS_GAP_MS'];

// one fresh app per scenario: {api, ls, loc, hist, fetches, timers}
function loadApp(o) {
  o = o || {};
  const ls = o.ls || makeLocalStorage();
  const u = new URL(o.url || BASE);
  const loc = { search: u.search, hash: u.hash, pathname: u.pathname, origin: u.origin, href: u.href, hostname: u.hostname };
  const hist = {
    state: null, calls: [], pushes: 0, backs: 0,
    replaceState(st, t, url) { if (url !== undefined) { const v = new URL(url, loc.href); loc.search = v.search; loc.hash = v.hash; loc.pathname = v.pathname; loc.href = v.href; this.calls.push(v.href); } this.state = st; },
    pushState(st) { this.pushes++; this.state = st; }, back() { this.backs++; }
  };
  const fetches = [], timers = [], frames = [];
  const fetchImpl = o.fetch || (async () => { throw new Error('no fetch in this scenario'); });
  const shim = makeShim();
  const doc = Object.assign({}, shim.document, { visibilityState: o.hidden ? 'hidden' : 'visible' });
  const ss = makeLocalStorage();
  const over = {
    localStorage: ls, sessionStorage: ss, location: loc, history: hist, Date: FixedDate, document: doc,
    fetch: (url, opts) => { fetches.push({ url: String(url), method: (opts && opts.method) || 'GET', headers: Object.assign({}, (opts && opts.headers) || {}), body: opts && opts.body }); return fetchImpl(url, opts); },
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return { unref() {} }; },
    // every re-render the store asks for is queued here (and run with flush()), so a case can count them
    requestAnimationFrame: (f) => { frames.push(f); return frames.length; },
    navigator: { userAgent: 'test-app', clipboard: { writeText: () => Promise.resolve() } }
  };
  const { api, missing } = loadApi(APP, 'app.html', EXPECT, over);
  const flush = () => { const n = frames.length; frames.splice(0).forEach((f) => f()); return n; };
  return { api, missing, ls, loc, hist, fetches, timers, ss, frames, flush };
}
function seedLs(obj) { const ls = makeLocalStorage(); Object.keys(obj).forEach((k) => ls.setItem(k, typeof obj[k] === 'string' ? obj[k] : JSON.stringify(obj[k]))); return ls; }
const listOf = (ids) => ids.map((id) => ({ id, t: '', e: '', at: 1, pin: false, arch: false }));

// ---- the real Worker, in-process, over an in-memory KV ----
async function loadWorker() {
  const src = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pialax-test-app-'));
  const file = path.join(dir, 'worker.mjs');
  fs.writeFileSync(file, src);
  try { return (await import('file://' + file)).default; } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function makeServer(worker) {
  const map = new Map();
  const env = { IDEAS: { async get(k) { return map.has(k) ? map.get(k) : null; }, async put(k, v) { map.set(k, String(v)); }, async delete(k) { map.delete(k); } } };
  const hash = crypto.createHash('sha256').update(KEY).digest('hex');
  const srv = {
    map, env, hold: null, failNext: null,
    seed(doc) { const d = clone(doc); d.edit_hash = hash; map.set('idea:' + d.id, JSON.stringify(d)); return d.id; },
    read(id) { return JSON.parse(map.get('idea:' + id)); },
    write(doc) { map.set('idea:' + doc.id, JSON.stringify(doc)); },
    // the app's fetch, answered by the Worker (optionally held until released, or failed)
    fetch: async (url, opts) => {
      if (String(url).indexOf(W + '/') !== 0) throw new Error('not the Worker: ' + url);
      if (srv.failNext) { const f = srv.failNext; srv.failNext = null; if (f === 'network') throw new TypeError('Failed to fetch'); return new Response(JSON.stringify(f.body), { status: f.status }); }
      if (srv.hold) await srv.hold;
      const headers = Object.assign({ Origin: ORIGIN }, (opts && opts.headers) || {});
      return worker.fetch(new Request(url, { method: (opts && opts.method) || 'GET', headers, body: opts && opts.body }), env);
    }
  };
  return srv;
}
function deferred() { let res; const p = new Promise((r) => { res = r; }); return { p, res }; }
// a Response-like answer for a scripted fetch
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
// docs compared without the fields only the Worker can stamp
function norm(doc) {
  const d = clone(doc);
  delete d.updated_at; delete d.log; delete d.edit_hash;
  Object.keys(d.responses || {}).forEach((k) => { delete d.responses[k].updated_at; if (d.responses[k].booked_at) d.responses[k].booked_at = 'T'; });
  if (d.decision) { if (d.decision.chosen_at) d.decision.chosen_at = 'T'; if (d.decision.booked_at) d.decision.booked_at = 'T'; }
  return d;
}

(async function main() {
  console.log('▶ test-app: the v2 shell in app.html (PIA-134)');
  const html = fs.readFileSync(APP, 'utf8');
  const modelSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'trip-model.js'), 'utf8');
  const BEGIN = '/* === pialax trip-model: begin === */', END = '/* === pialax trip-model: end === */';
  const region = (s) => { const b = s.indexOf(BEGIN), e = s.indexOf(END); return b >= 0 && e > b ? s.slice(b, e + END.length) : null; };
  const appRegion = region(html), body = extractAppBody(html, 'app.html');
  const appPart = html.slice(0, html.indexOf(BEGIN)) + html.slice(html.indexOf(END) + END.length);   // everything that is not the model
  const worker = await loadWorker();

  // ═══ AC11 ═══
  section('AC11 the model region is byte-identical to scripts/trip-model.js, and the harness finds the app block');
  check(!!appRegion && appRegion === region(modelSrc), 'drift: app.html holds the trip-model region byte for byte (markers included)',
    appRegion ? 'lengths ' + appRegion.length + ' vs ' + (region(modelSrc) || '').length : 'markers missing');
  check(html.split(BEGIN).length === 2 && html.split(END).length === 2, 'exactly one begin and one end marker in app.html');
  check(/^\s*'use strict';\s*\(function\s*\(\)\s*\{/.test(html.slice(html.indexOf('<script>') + 8)) && body.indexOf('try{boot();}catch(e){}') >= 0 && body.indexOf(BEGIN) >= 0,
    'harness: extractAppBody finds the app IIFE in app.html, with the region inside it and boot() neutralised');
  {
    const { api, missing } = loadApp();
    check(missing.length === 0, 'harness: every app symbol under test is reachable (' + EXPECT.length + ')', missing);
    check(typeof api.tripModel === 'function' && api.S && api.S.booted === true, 'the app boots under the harness shim (tripModel inlined, S built)');
  }
  const regionNames = (region(modelSrc).match(/^(?:function|var) [A-Za-z0-9_$]+/gm) || []).map((s) => s.split(' ')[1]);
  const appNames = (appPart.match(/^(?:function|var) [A-Za-z0-9_$]+/gm) || []).map((s) => s.split(' ')[1]);
  const clash = appNames.filter((n) => regionNames.indexOf(n) >= 0);
  check(regionNames.length > 100 && appNames.length > 100 && clash.length === 0, 'no app declaration shadows a model name (' + appNames.length + ' app, ' + regionNames.length + ' model names)', clash);
  {
    const cli = require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'harness.js'), ROOT, 'app.html'], { encoding: 'utf8' });
    const def = require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'harness.js'), ROOT], { encoding: 'utf8' });
    check(cli.status === 0 && /app\.html: app block found/.test(cli.stdout) && def.status === 0 && /pialax\.html/.test(def.stdout) && /pialax-mobile\.html/.test(def.stdout) && !/app\.html/.test(def.stdout),
      'harness CLI takes the app file as an argument (app.html), and with none it checks the v1 pair', cli.stdout + def.stdout);
  }

  // ═══ AC1, AC13, AC15 (static) ═══
  section('AC1 / AC13 / AC15 a new unlinked file: no web-app mode, a strict CSP, system fonts, light and dark tokens');
  const v1Files = ['pialax.html', 'pialax-mobile.html', 'index.html', 'worker.js', 'scripts/trip-idea-builder.js'];
  const linking = v1Files.filter((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').indexOf('app.html') >= 0);
  check(linking.length === 0, 'nothing links to app.html yet (v1 pages, index.html, worker.js, the builder)', linking);
  check(!/apple-mobile-web-app-capable/i.test(html) && !/rel=["']?manifest/i.test(html), 'app.html declares no apple-mobile-web-app-capable and no manifest');
  const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/g) || []);
  const cspv = csp.length === 1 ? /content="([^"]+)"/.exec(csp[0])[1] : '';
  const dir = (n) => { const m = new RegExp('(?:^|;)\\s*' + n + ' ([^;]+)').exec(cspv); return m ? m[1].trim() : null; };
  check(csp.length === 1 && dir('default-src') === "'none'" && dir('connect-src') === W && dir('script-src') === "'unsafe-inline'" && dir('img-src') === 'data:' && !/unsafe-eval|\*/.test(cspv),
    'one CSP meta: default-src none, scripts inline only, connect-src only the Worker, images only data:, no eval, no wildcards', cspv);
  {
    const { api } = loadApp();
    check(Array.isArray(api.WORKER_OK) && eq(api.WORKER_OK.slice().sort(), String(dir('connect-src') || '').split(/\s+/).sort()),
      'the Worker origins the app accepts (WORKER_OK) are exactly the CSP\'s connect-src list, so no accepted Worker URL is blocked', [api.WORKER_OK, dir('connect-src')]);
  }
  {
    const rs = html.slice(html.indexOf('function renderSheet('), html.indexOf('function setInert('));
    check(rs.indexOf('el.hidden = false') > 0 && rs.indexOf('el.hidden = false') < rs.indexOf('fitNames('), 'a sheet is shown before its names are fitted (a hidden sheet counts no words, so nothing would be dropped on a first open)');
  }
  check(!/<script[^>]+src=|<link[^>]+rel=["']?stylesheet|@import|@font-face|url\(\s*["']?https?:/i.test(html) && (html.match(/<link /g) || []).length === 1 && /<link rel="icon" href="data:,">/.test(html),
    'no external script, stylesheet, font or image (one data: favicon link only)');
  check(/--font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto/.test(html) && !/fonts\.googleapis|woff2?/.test(html), 'system font stack only');
  check(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{/.test(html) && /:root\[data-theme="dark"\] \{/.test(html) && /body \{[^}]*background: var\(--bg\)/.test(html),
    'light tokens on :root, dark tokens under prefers-color-scheme and [data-theme="dark"], and body has an explicit background');
  check(!/console\.log/.test(html) && (html.match(/<script[ >]/g) || []).length === 1 && (html.match(/<\/script>/g) || []).length === 1, 'no console.log, one balanced <script> block');

  // ═══ AC10 (static) ═══
  section('AC10 no mock fares, estimators or seeded trips, and no fare search');
  const mockIds = ['getMock', 'SAMPLE_FARES', 'sampleFare', 'makeDocs', 'makePhones', 'makeFares', 'data-proto', 'WKLY_FACTORS', 'estimateMeetupTotalFor', 'computeRanking',
    'computeBestMeetupWeekends', 'dayPrice', 'WATCHLIST_SEED', 'illustrative', 'Math.random', 'pr-count', 'bootProto'];
  const hits = mockIds.filter((s) => html.indexOf(s) >= 0);
  check(hits.length === 0, 'none of the prototype or v1 mock / sample / estimator identifiers are in app.html', hits);
  const seeded = (appPart.match(/['"][A-Za-z0-9_-]{22}['"]/g) || []);
  check(seeded.length === 0 && !/Thanksgiving at home|Diwali|Tahoe|Grandma/.test(html), 'no seeded trip: no trip id literal and no sample trip title in the app', seeded);
  check(!/['"`]\/(search|account|extract|alert)/.test(html) && !/x-pialax-token/i.test(html) && (appPart.match(/\bfetch\(/g) || []).length === 1,
    'no /search, /account, /extract or /alert route and no token header; fetch is called in one place (api)');

  // ═══ AC7 router (pure) ═══
  section('AC7 the router: what a link asks for (pure readLink)');
  {
    const { api } = loadApp();
    const A = 'dwDiwaliRaleigh2026a01', B = 'thTahoeSkiWeekend26b02', C = 'cyCaryShowerUndated004';
    let L = api.readLink('?idea=' + A, '#k=' + KEY + '&t=' + TOKEN, '/PIALAX/app.html');
    check(L.idea === A && eq(L.keys, { [A]: KEY }) && L.token === TOKEN && L.stripHash && !L.list, "v1's organizer link ?idea=<id>#k=<key>&t=<token>: the key for that trip and the token, hash to strip");
    L = api.readLink('?l=' + A + '.' + B, '#ks=' + A + '.' + KEY + ',' + B + '.' + KEY2 + '&t=' + TOKEN, '/PIALAX/app.html');
    check(eq(L.ids, [A, B]) && eq(L.keys, { [A]: KEY, [B]: KEY2 }) && L.token === TOKEN && L.stripHash && eq(L.drop, ['l']), 'the devices link ?l=…#ks=<id>.<key>,…&t=: every id, every key, the token');
    L = api.readLink('?ks=x', '#ks=&t=' + TOKEN, '/');
    check(L.token === TOKEN && eq(L.keys, {}) && L.stripHash, 'a devices link from a phone with a token and no keys still carries the token');
    L = api.readLink('?l=' + A + '.' + B + '.' + C + '.nope.' + A + '&f=' + encodeURIComponent('🌴'), '', '/');
    check(eq(L.ids, [A, B, C]) && L.face === '🌴' && L.list && eq(L.drop, ['l', 'f']) && !L.stripHash, 'a v2 list link ?l=<id>.<id>…&f=<face>: valid ids once each, the sender face');
    const big = Array.from({ length: 60 }, (_, i) => ('x' + i).padEnd(22, 'q'));
    check(api.readLink('?l=' + big.join('.'), '', '/').ids.length === 50, 'a list link imports at most 50 ids');
    check(api.readLink('?f=' + encodeURIComponent('not a face'), '', '/').face === '' && api.readLink('?f=' + encodeURIComponent('🦊🐻'), '', '/').face === '', 'a sender face must be one emoji');
    L = api.readLink('', '', '/PIALAX/i/' + B);
    check(L.idea === B, 'a /i/<id> path opens that trip, like ?idea=');
    L = api.readLink('?idea=' + A, '#m=anjo-z5', '/');
    check(L.hint === 'anjo-z5' && L.stripHash && eq(L.keys, {}) && L.token === '', 'a nudge #m=<code> is a hint, consumed (stripped) and never a key');
    L = api.readLink('', '#k=' + KEY + '&t=' + TOKEN, '/');
    check(eq(L.keys, {}) && L.token === TOKEN && L.stripHash, '#k= without ?idea= saves no key (v1 rule), and the hash is still stripped');
    L = api.readLink('?idea=' + A, '#t=' + TOKEN, '/');
    check(L.token === '' && L.stripHash, 'a token alone (no #k= or #ks=) is never taken, but leaves the address bar');
    L = api.readLink('?idea=short&tab=map&__proto__=1', '#k=tooshort&ks=bad.pair,' + A + '.short', '/');
    check(L.idea === '' && L.tab === 'map' && eq(L.keys, {}) && L.drop.indexOf('tab') >= 0 && Object.getPrototypeOf(L) === Object.prototype, 'malformed ids, keys and pairs are ignored; ?tab=map is read once; __proto__ is inert');
    const strips = [['#k=short&t=tok', 'a truncated key and token'], ['#t=' + TOKEN.slice(0, 9), 'a token cut short'], ['#ks=' + A + '.!!&t=x', 'a broken devices hash'], ['#m=', 'an empty nudge'], ['#k', 'a bare k']];
    const kept = strips.filter(([h]) => { const r = api.readLink('?idea=' + A, h, '/'); return !r.stripHash || !eq(r.keys, {}) || r.token !== ''; });
    check(kept.length === 0, 'a hash with any k=, ks=, t= or m= leaves the address bar even when nothing in it is valid (' + strips.map((s) => s[1]).join(', ') + '), and saves nothing', kept);
    check(!api.readLink('?idea=' + A, '#section-2', '/').stripHash && !api.readLink('', '#flags=assistant', '/').stripHash, 'a hash with none of them is left alone');
    L = api.readLink('?idea=' + A, '#k=' + KEY + '&t=' + TOKEN + ').', '/');
    const L2 = api.readLink('?l=' + A, '#ks=' + A + '.' + KEY + ',' + B + '.' + KEY2 + '.&t=' + TOKEN, '/'), L3 = api.readLink('?idea=' + A, '#k=' + KEY + '.', '/');
    check(eq(L.keys, { [A]: KEY }) && L.token === TOKEN && eq(L2.keys, { [A]: KEY, [B]: KEY2 }) && L2.token === TOKEN && eq(L3.keys, { [A]: KEY }) && L.stripHash && L2.stripHash && L3.stripHash,
      'a link pasted at the end of a sentence ("…#k=<key>." or "…&t=<token>).") still saves its key and token: trailing punctuation is not part of them');
    check(api.readLink('?tab=evil', '', '/').tab === '', 'only map and cal are starting tabs');
    const qp = api.qsParse('?__proto__=x&constructor=y&prototype=z&idea=' + A);
    check(Object.getPrototypeOf(qp) === Object.prototype && eq(Object.keys(qp), ['idea']) && ({}).polluted === undefined, 'query keys __proto__, constructor and prototype are dropped, never assigned');
    // v1's own encoders build the ?w= and ?wl= payloads that v2 must read
    const v1 = loadApi(path.join(ROOT, 'pialax-mobile.html'), 'pialax-mobile.html', ['wlShareEncode', 'wlShareDecode'], { console: QUIET }).api;
    const payload = { overrides: { thanksgiving: { stage: 'planning', sharedIdeaId: A } }, added: [{ id: 'added-1', mode: 'family', origin: 'LAX', dest: 'RDU', dep: '2026-12-01', sharedIdeaId: B, stage: 'watching' }] };
    const w = v1.wlShareEncode(payload);
    check(typeof w === 'string' && v1.wlShareDecode(w) && eq(api.v1ShortIds(w).sort(), [A, B].sort()), "v1's short ?w= payload (built by v1's own wlShareEncode) reads as its shared trip ids", api.v1ShortIds(w));
    L = api.readLink('?w=' + w + '&flags=assistant', '', '/');
    check(eq(L.ids.slice().sort(), [A, B].sort()) && L.list && eq(L.drop, ['w']), '?w= is read once for ids and dropped; other v1 params (?flags=) are left alone');
    const legacy = encodeURIComponent(Buffer.from(encodeURIComponent(JSON.stringify(payload)), 'binary').toString('base64'));
    L = api.readLink('?wl=' + legacy, '', '/');
    check(eq(L.ids.slice().sort(), [A, B].sort()) && eq(L.drop, ['wl']), "v1's legacy base64 ?wl= payload reads as its shared trip ids");
    check(eq(api.v1ShortIds('!!!'), []) && eq(api.v1LegacyIds('%%%'), []) && eq(api.readLink('?w=garbage&wl=junk', '', '/').ids, []), 'broken ?w= / ?wl= payloads read as no ids and never throw');
  }

  // ═══ AC7 + AC8 router at boot, storage formats ═══
  section('AC7 / AC8 opening links saves the trip, keys and token in v1\'s formats, then strips them');
  const A = 'dwDiwaliRaleigh2026a01', B = 'thTahoeSkiWeekend26b02', C = 'cyCaryShowerUndated004', M8 = 'm8GrandmaNinetieth0c03';
  {
    const t = loadApp({ url: BASE });
    check(t.api.S.tab === 'trips' && t.api.S.seg === 'ideas' && t.api.S.trip === null && t.fetches.length === 0, 'a cold open (no ?idea, no ?tab) lands on Trips › Ideas and fetches nothing for an empty list');
  }
  {
    const t = loadApp({ url: BASE + '?idea=' + A });
    check(eq(t.api.listIds(), [A]) && t.api.S.trip === A && t.api.S.sel === A && /\?idea=dwDiwaliRaleigh2026a01$/.test(t.loc.href), '?idea=<id> saves the trip to this phone\'s list with no taps and opens it (?idea stays as the open trip)');
    check(JSON.parse(t.ls.getItem('pialax_ui_v1')).sel === A, 'the opened trip is remembered as the selected trip for Map and Calendar (pialax_ui_v1.sel)');
  }
  {
    const t = loadApp({ url: BASE + '?idea=' + A + '#k=' + KEY + '&t=' + TOKEN });
    const keys = JSON.parse(t.ls.getItem('pialax_idea_keys_v1'));
    check(eq(Object.keys(keys), [A]) && keys[A].edit_key === KEY && keys[A].title === '' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(keys[A].created_at) && eq(Object.keys(keys[A]), ['edit_key', 'title', 'created_at']),
      'organizer link: pialax_idea_keys_v1[id] = {edit_key, title:"", created_at ISO}, exactly v1\'s _tripIdeaSaveKey record', keys);
    check(t.ls.getItem('pialax_proxy_token') === TOKEN, 'organizer link: the token is saved as the raw pialax_proxy_token string (v1 setProxyToken)');
    check(t.loc.hash === '' && t.hist.calls.length >= 1 && t.hist.calls.every((u) => u.indexOf('#') < 0 && u.indexOf(KEY) < 0 && u.indexOf(TOKEN) < 0) && /\?idea=/.test(t.loc.href),
      'organizer link: the key and token are stripped from the address bar by replaceState (no rewrite ever shows them)', t.hist.calls);
  }
  {
    const t = loadApp({ url: BASE + '?idea=' + A + '#k=short&t=tok' });
    check(t.loc.hash === '' && /\?idea=dwDiwaliRaleigh2026a01$/.test(t.loc.href) && !t.ls.getItem('pialax_idea_keys_v1') && !t.ls.getItem('pialax_proxy_token'),
      'a malformed organizer link (?idea=<id>#k=short&t=tok) opens the trip and leaves no key or token in the address bar, and saves neither');
  }
  {
    const ls = seedLs({ pialax_idea_keys_v1: { [A]: { edit_key: KEY, title: 'Diwali', created_at: '2026-10-10T00:00:00.000Z' } } });
    const t = loadApp({ ls, url: BASE + '?idea=' + A + '#k=' + KEY2 });
    const keys = JSON.parse(ls.getItem('pialax_idea_keys_v1'));
    check(keys[A].edit_key === KEY && keys[A].title === 'Diwali' && t.loc.hash === '', 'a link with a different key never replaces the key this phone holds (no control can delete an edit key)');
  }
  {
    const t = loadApp({ url: BASE + '?l=' + A + '.' + B + '#ks=' + A + '.' + KEY + ',' + B + '.' + KEY2 + '&t=' + TOKEN });
    const keys = JSON.parse(t.ls.getItem('pialax_idea_keys_v1'));
    check(keys[A].edit_key === KEY && keys[B].edit_key === KEY2 && t.ls.getItem('pialax_proxy_token') === TOKEN && eq(t.api.listIds().sort(), [A, B].sort()) && t.loc.hash === '' && t.loc.search === '',
      'devices link: every key and the token saved, every trip listed, then ?l= and the hash are stripped');
  }
  {
    const t = loadApp({ url: BASE + '?l=' + A + '.' + B + '&f=' + encodeURIComponent('🌴') + '&flags=assistant' });
    check(eq(t.api.listIds(), [A, B]) && t.loc.search === '?flags=assistant' && !t.ls.getItem('pialax_idea_keys_v1') && !t.ls.getItem('pialax_proxy_token'),
      'list link: ids imported (no keys, no token), ?l and ?f consumed, ?flags kept');
  }
  {
    const v1 = loadApi(path.join(ROOT, 'pialax-mobile.html'), 'pialax-mobile.html', ['wlShareEncode'], { console: QUIET }).api;
    const w = v1.wlShareEncode({ overrides: { thanksgiving: { sharedIdeaId: C } }, added: [] });
    const t = loadApp({ url: BASE + '?w=' + w });
    check(eq(t.api.listIds(), [C]) && t.loc.search === '', 'a v1 ?w= share link opened in v2 imports its shared trip and is read once (dropped from the address bar)');
  }
  {
    const v1raw = fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', 'v1-watchlist-storage.json'), 'utf8').trim();
    const ls = seedLs({ pialax_watchlist_v1: v1raw, pialax_idea_keys_v1: { [M8]: { edit_key: KEY, title: '', created_at: '2026-10-01T00:00:00.000Z' } }, pialax_idea_me_v1: { [B]: 'ashwin-l2', junk: 'x' } });
    loadApp({ ls });
    const ids = JSON.parse(ls.getItem('pialax_watchlist_v2')).map((x) => x.id);
    check(eq(ids.slice().sort(), ['tgLegacyThanksgiving01', 'dwDiwaliRaleigh2026a01', M8, B].sort()) && ls.getItem('pialax_watchlist_v1') === v1raw,
      'first v2 open reads the v1 list (its shared trip ids) plus v1\'s keys and identities into the v2 list, and leaves pialax_watchlist_v1 byte-identical', ids);
    const changedV1 = v1raw.replace('"overrides": {', '"overrides": {"zz": {"sharedIdeaId": "zzNewSharedIdea0000001"},');
    ls.setItem('pialax_watchlist_v1', changedV1);
    loadApp({ ls });
    check(JSON.parse(ls.getItem('pialax_watchlist_v2')).length === 4 && ls.getItem('pialax_watchlist_v1') === changedV1 && JSON.parse(ls.getItem('pialax_ui_v1')).v1read === 1,
      'the v1 list is read once: a later v1 change is not re-imported, and v2 never writes it');
  }
  {
    const ls = seedLs({ pialax_idea_keys_v1: '{not json' });
    const t = loadApp({ ls, url: BASE + '?idea=' + A + '#k=' + KEY });
    check(ls.getItem('pialax_idea_keys_v1') === '{not json' && t.api.saveKey(B, KEY2, '') === false, 'an unreadable key store is never written over (its keys may still be recoverable)');
    const ls2 = seedLs({ pialax_idea_keys_v1: { [A]: { edit_key: KEY, title: 't', created_at: 'c' }, [B]: { edit_key: KEY2, title: '', created_at: 'c' } } });
    const t2 = loadApp({ ls: ls2 });
    const before = ls2.getItem('pialax_idea_keys_v1');
    ['saveKey', 'setMe', 'setToken', 'setWorker', 'markSeen'].forEach((f) => { try { t2.api[f](A, '', ''); t2.api[f](B, KEY, 'x'); } catch (e) { /* bad arguments are fine */ } });
    t2.api.setToken(''); t2.api.setWorker('');
    const after = JSON.parse(ls2.getItem('pialax_idea_keys_v1'));
    check(ls2.getItem('pialax_idea_keys_v1') === before && after[A].edit_key === KEY && after[B].edit_key === KEY2, 'no store call (blank or wrong keys, clearing the token or Worker) removes or rewrites an edit key');
    check(!/removeItem\(ST\.keys|lsDel\(ST\.keys|delete keys\[|lsSet\(ST\.keys/.test(appPart.replace("return lsSet(ST.keys, JSON.stringify(keys));", '')), 'the only write to pialax_idea_keys_v1 is saveKey\'s add (no removeItem, delete or other write)');
  }
  {
    const t = loadApp();
    check(t.api.setToken('  ' + TOKEN + '  ') && t.ls.getItem('pialax_proxy_token') === TOKEN && !t.api.setToken('short') && t.ls.getItem('pialax_proxy_token') === TOKEN && t.api.setToken('') && t.ls.getItem('pialax_proxy_token') === null,
      'token: v1\'s rule (16–128 of A-Z a-z 0-9 _ -), trimmed, invalid refused, blank removes the key');
    check(t.api.setWorker(W + '/') && t.ls.getItem('pialax_proxy_url') === W && t.api.workerBase() === W &&
      !t.api.setWorker('https://evil.example.com') && !t.api.setWorker('https://x.workers.dev/path') && t.api.setWorker('') && t.ls.getItem('pialax_proxy_url') === null && t.api.workerBase() === W,
      'Worker URL: v1\'s https *.workers.dev format, no trailing slash; anything else refused; blank = the built-in Worker');
    const other = 'https://my-proxy.example.workers.dev';
    check(!t.api.setWorker(other) && t.ls.getItem('pialax_proxy_url') === null, 'a well-formed Worker URL the CSP does not allow is refused (it could never be reached from this page)');
    t.ls.setItem('pialax_proxy_url', other);
    check(t.api.workerBase() === W && t.ls.getItem('pialax_proxy_url') === other, 'a v1 override the CSP would block is not used (the built-in Worker answers) and is left in place for v1');
    t.ls.setItem('pialax_proxy_url', 'javascript:alert(1)');
    check(t.api.workerBase() === W, 'a stored Worker URL that fails v1\'s check is ignored, never used');
    t.ls.removeItem('pialax_proxy_url');
    t.api.setMe(A, 'ashwin-p8');
    check(eq(JSON.parse(t.ls.getItem('pialax_idea_me_v1')), { [A]: 'ashwin-p8' }) && t.api.meFor(A) === 'ashwin-p8', 'identity: pialax_idea_me_v1 {id: member code}, v1\'s tripIdeaSetMe format');
    const dw = fx('idea-diwali.json');
    dw.log = [{ at: '2026-10-11T02:10:00.000Z', event: 'rsvp:in', by: 'momdad-k3' }, { at: '2026-10-11T02:11:00.000Z', event: 'rsvp:in', by: 'ashwin-p8' }, { at: '2026-10-12T00:00:00.000Z', event: 'edited', by: 'organizer' }];
    t.api.markSeen(dw);
    check(eq(JSON.parse(t.ls.getItem('pialax_idea_seen_v1')), { [A]: '2026-10-11T02:11:00.000Z' }), 'seen: pialax_idea_seen_v1 {id: the newest rsvp log time}, v1\'s tripIdeaMarkSeen rule');
    // v1 itself reads what v2 wrote
    t.api.saveKey(A, KEY, 'Diwali'); t.api.setToken(TOKEN); t.api.setWorker(W);
    const v1 = loadApi(path.join(ROOT, 'pialax-mobile.html'), 'pialax-mobile.html', ['_tripIdeaKeys', 'tripIdeaMe', 'proxyToken', 'tripIdeaHasNewAnswers', 'PROXY_URL', 'tripIdeaOrganizerLink'], { localStorage: t.ls, console: QUIET }).api;
    check(v1._tripIdeaKeys()[A].edit_key === KEY && v1.tripIdeaMe(A) === 'ashwin-p8' && v1.proxyToken() === TOKEN && v1.tripIdeaHasNewAnswers(dw) === false && t.ls.getItem('pialax_proxy_url') === W && v1.PROXY_URL === W &&
      /#k=pialax-test-edit-key/.test(v1.tripIdeaOrganizerLink(A)), 'v1 (pialax-mobile.html, unchanged) reads every key v2 wrote: the edit key, identity, token, seen state and Worker URL (the bare origin string)');
  }
  {
    const t = loadApp({ ls: seedLs({ pialax_idea_keys_v1: { [A]: { edit_key: KEY, title: '', created_at: 'c' } }, pialax_proxy_token: TOKEN, pialax_watchlist_v2: listOf([A, B]) }) });
    const org = t.api.organizerLink(A), dev = t.api.devicesLink();
    check(org === BASE + '?idea=' + A + '#k=' + KEY + '&t=' + TOKEN && t.api.organizerLink(B) === '', "the organizer link is v1's format ?idea=<id>#k=<key>&t=<token> (only for a trip this phone holds the key to)");
    const back = t.api.readLink(new URL(dev).search, new URL(dev).hash, new URL(dev).pathname);
    check(eq(back.ids.sort(), [A, B].sort()) && eq(back.keys, { [A]: KEY }) && back.token === TOKEN, 'the devices link round-trips through the router: every listed id, every key, the token');
  }

  // ═══ AC9 refresh ═══
  section('AC9 the store refreshes from the Worker on open, on focus and every 60s while visible');
  const srv = makeServer(worker);
  [fx('idea-diwali.json'), fx('idea-tahoe.json'), fx('idea-8members.json'), fx('idea-undated.json')].forEach((d) => srv.seed(d));
  const orgLs = () => seedLs({ pialax_watchlist_v2: listOf([A, B, M8]), pialax_idea_keys_v1: { [A]: { edit_key: KEY, title: '', created_at: 'c' } }, pialax_idea_me_v1: { [A]: 'ashwin-p8', [B]: 'ashwin-l2' }, pialax_proxy_token: TOKEN, pialax_ui_v1: { v1read: 1 } });
  {
    const t = loadApp({ ls: orgLs(), fetch: srv.fetch });
    await t.api.refreshAll(); await tick();
    const gets = t.fetches.filter((f) => f.method === 'GET').map((f) => f.url);
    check(eq(gets.slice(0, 3).sort(), [A, B, M8].map((id) => W + '/idea?id=' + id).sort()) && t.api.DOCS[A] && t.api.DOCS[B] && t.api.DOCS[M8] && t.api.STAT[A] === 'ok',
      'on open: one GET /idea?id= per listed trip, and the docs land in the store', gets);
    check(t.fetches.every((f) => /^https:\/\/pialax-proxy\.ashwinyedavalli\.workers\.dev\/idea(\?|\/|$)/.test(f.url)) && t.fetches.every((f) => !Object.keys(f.headers).some((h) => /pialax-token/i.test(h))),
      'every request goes to the Worker\'s /idea routes, and none carries the organizer token header');
    const keyed = t.fetches.filter((f) => f.headers['X-Idea-Key']);
    check(keyed.length >= 1 && keyed.every((f) => f.url.indexOf(A) >= 0 && f.headers['X-Idea-Key'] === KEY), 'X-Idea-Key rides only on the trip this phone organizes');
    check(t.api.modelOf(A).org === true && t.api.modelOf(B).org === false && t.api.modelOf(A).me.code === 'ashwin-p8', 'the model reads organizer and identity from v1\'s key and identity stores');
    const lst = JSON.parse(t.ls.getItem('pialax_watchlist_v2'));
    check(lst.find((x) => x.id === A).t === '🪔 Diwali in Raleigh' && lst.find((x) => x.id === A).e === '🪔', 'each refresh keeps the list\'s title and emoji snapshot current (cards draw before the first read)');
    const before = t.fetches.length;
    t.api.onFocus();
    check(t.fetches.length === before, 'focus right after a refresh does not refetch (5s gap)');
    CLOCK = NOW + t.api.FOCUS_GAP_MS + 1000;
    await t.api.onFocus(); await tick();
    const focusGets = t.fetches.slice(before).filter((f) => f.method === 'GET').map((f) => f.url);
    check(t.api.FOCUS_GAP_MS === 5000 && eq(focusGets.slice().sort(), [A, B, M8].map((id) => W + '/idea?id=' + id).sort()), 'focus once the 5s gap has passed: one GET /idea per listed trip', focusGets);
    CLOCK = NOW;
    const poll = t.timers.find((x) => x.ms === 60000);
    check(t.api.POLL_MS === 60000 && !!poll, 'a 60s poll timer is set');
    const b2 = t.fetches.length;
    await poll.fn(); await tick();
    check(t.fetches.length === b2 + 3, 'the 60s poll refetches every listed trip while visible', t.fetches.length - b2);
    // an answer that changes nothing re-renders nothing (so a poll never rebuilds a sheet someone is typing in)
    t.flush();
    await poll.fn(); await tick();
    const quiet = t.frames.length;
    const moved = clone(srv.read(B)); moved.idea.notes = (moved.idea.notes || '') + ' x'; srv.write(moved);
    await poll.fn(); await tick();
    check(quiet === 0 && t.frames.length === 1, 'a poll whose answers change nothing asks for no re-render; one that changes a trip asks for one', { quiet, after: t.frames.length });
    t.flush();
    srv.seed(fx('idea-tahoe.json'));
    const h = loadApp({ ls: orgLs(), fetch: srv.fetch, hidden: true });
    await tick(); const n0 = h.fetches.length;
    await (h.timers.find((x) => x.ms === 60000).fn() || Promise.resolve()); h.api.onFocus(); await tick();
    check(h.fetches.length === n0, 'while the page is hidden the poll and focus fetch nothing');
  }
  {
    // a failed background refresh: badge state only, never a sheet
    let fail = true;
    const t = loadApp({ ls: orgLs(), fetch: (u, o) => (fail ? Promise.reject(new TypeError('Failed to fetch')) : srv.fetch(u, o)) });
    await t.api.refreshAll(); await tick();
    check(t.api.anyFailed() && t.api.FAIL[A] && t.api.STAT[A] === 'error' && t.api.S.sheet === null, 'a failed refresh marks the trips (📶⚠, dimmed cards) and opens no sheet');
    fail = false; await t.api.refreshAll(); await tick();
    check(!t.api.anyFailed() && t.api.STAT[A] === 'ok', 'the next good refresh clears the failure');
    fail = true; await t.api.refreshAll(); await tick();
    check(t.api.STAT[A] === 'stale' && t.api.DOCS[A] && t.api.DOCS[A].id === A && t.api.S.sheet === null, 'a failure after a good read keeps the last doc (stale) and still opens no sheet');
    const t2 = loadApp({ ls: orgLs(), fetch: async () => reply(500, { error: 'Internal <script>boom</script>', code: 'upstream' }) });
    await t2.api.refreshAll(); await tick();
    check(t2.api.anyFailed() && t2.api.S.sheet === null, 'a 500 from the Worker is a failed refresh too (no sheet)');
  }
  {
    // a refresh never puts back a doc older than a write. Every way one GET can overlap one write, against the
    // real Worker: the GET is SERVED by the Worker at the point named (so it carries that moment's doc), and its
    // reply is held and released where named. (In a browser a guest's POST waits on a CORS preflight and its GET
    // does not, so a GET that leaves after a write can still be answered from the doc before it.)
    const doc0 = srv.read(A);
    const gate = { get: null, post: null };
    const t = loadApp({ ls: orgLs(), fetch: async (u, o) => {
      const isGet = !o || !o.method || o.method === 'GET';
      if (isGet && gate.get) {
        const g = gate.get; gate.get = null;
        const res = await srv.fetch(u, o), text = await res.text();   // the Worker answers now…
        g.served.res(); await g.release.p;                           // …and the reply reaches the app only later
        return { ok: res.ok, status: res.status, text: async () => text };
      }
      if (!isGet && gate.post) { const p = gate.post; gate.post = null; await p.p; }
      return srv.fetch(u, o);
    } });
    const holdGet = () => { const g = { served: deferred(), release: deferred() }; gate.get = g; return g; };
    const ans = () => ((t.api.DOCS[A].responses || {})['anjo-z5'] || {}).status || '(none)';
    const reset = async () => { srv.write(doc0); const r = await t.api.refresh(A); await tick(); return r; };
    await t.api.refreshAll(); await tick();

    // (a) the write leaves first; a GET leaves during it and is served before the write lands; the write answers;
    //     then the GET's reply arrives
    let post = deferred(); gate.post = post;
    const wA = t.api.respond(A, 'anjo-z5', { status: 'out' }, { by: 'proxy' });
    check(ans() === 'out', 'the write shows at once (optimistic)');
    let g = holdGet(); const rA = t.api.refresh(A);
    await g.served.p; post.res(); const resA = await wA; await tick();
    const afterWriteA = ans();
    g.release.res(); const gotA = await rA; await tick();
    check(resA.ok && afterWriteA === 'out' && ans() === 'out' && srv.read(A).responses['anjo-z5'].status === 'out' && gotA && gotA.dropped,
      '(a) a GET that left during a write and is answered after it is dropped: the written answer stays', { afterWrite: afterWriteA, afterGet: ans(), server: srv.read(A).responses['anjo-z5'].status });

    // (b) a GET leaves and is served; a whole write starts and finishes; then the GET's reply arrives
    check((await reset()).ok && ans() === '(none)', '(reset to the doc before the write)');
    g = holdGet(); const rB = t.api.refresh(A);
    await g.served.p;
    const resB = await t.api.respond(A, 'anjo-z5', { status: 'maybe' }, { by: 'proxy' }); await tick();
    const afterWriteB = ans();
    g.release.res(); const gotB = await rB; await tick();
    check(resB.ok && afterWriteB === 'maybe' && ans() === 'maybe' && gotB && gotB.dropped, '(b) a GET that left before a write and is answered after it is dropped', { afterWrite: afterWriteB, afterGet: ans() });

    // (c) a GET leaves and is served; a write starts; the GET's reply arrives while the write is in flight
    await reset();
    g = holdGet(); const rC = t.api.refresh(A);
    await g.served.p;
    post = deferred(); gate.post = post;
    const wC = t.api.respond(A, 'anjo-z5', { status: 'in' }, { by: 'proxy' });
    g.release.res(); const gotC = await rC; await tick();
    const duringC = ans();
    post.res(); const resC = await wC; await tick();
    check(gotC && gotC.dropped && duringC === 'in' && resC.ok && ans() === 'in' && t.api.PEND[A] === 0, '(c) a GET answered while a write is in flight is dropped; the optimistic answer stays, then the Worker\'s');

    // (d) once the write has finished, the next GET is taken again
    const moved = clone(srv.read(A)); moved.responses['anjo-z5'].note = 'from another phone'; srv.write(moved);
    const rD = await t.api.refresh(A); await tick();
    check(rD && rD.ok && !rD.dropped && t.api.DOCS[A].responses['anjo-z5'].note === 'from another phone', '(d) the next refresh after the write is taken again');
    srv.write(doc0);
  }
  {
    // a multi-request write that fails part-way shows what did land (the 'in' answer before a 🎫), not the old doc
    const doc0 = srv.read(A);
    const t = loadApp({ ls: orgLs(), fetch: (u, o) => (o && o.method === 'POST' && String(u).indexOf('/idea/booked') >= 0 ? Promise.reject(new TypeError('Failed to fetch')) : srv.fetch(u, o)) });
    await t.api.refreshAll(); await tick();
    const r = await t.api.setBooked(A, 'anjo-z5', true, { by: 'proxy' });
    const posts = t.fetches.filter((f) => f.method === 'POST').map((f) => f.url.split('?')[0].replace(W, ''));
    const mine = t.api.DOCS[A].responses['anjo-z5'], server = srv.read(A).responses['anjo-z5'];
    check(eq(posts, ['/idea/respond', '/idea/booked']) && !r.ok && r.code === 'network' && r.partial === true && mine && mine.status === 'in' && !mine.booked && server.status === 'in' && !server.booked,
      'a 🎫 for someone who had not answered: the answer lands, the 🎫 fails; the store keeps the landed answer (partial), not the doc before it', { posts, r, mine, server });
    srv.write(doc0);
  }

  // ═══ AC9 writes ═══
  section('AC9 writes are optimistic, re-read before organizer edits, and revert on failure');
  {
    const t = loadApp({ ls: orgLs(), fetch: srv.fetch });
    await t.api.refreshAll(); await tick();
    const before = clone(t.api.DOCS[A]);
    const p = t.api.respond(A, 'ashwin-p8', { status: 'maybe', available_from: '2026-11-07', note: 'late flight' }, { by: 'self' });
    const optimistic = clone(t.api.DOCS[A]);
    const res = await p;
    const server = srv.read(A);
    check(res.ok && optimistic.responses['ashwin-p8'].status === 'maybe' && eq(norm(optimistic), norm(server)) && eq(norm(t.api.DOCS[A]), norm(server)),
      'respond: the optimistic doc is exactly the doc the Worker stores (dates, note, origin, picks)', [norm(optimistic).responses['ashwin-p8'], norm(server).responses['ashwin-p8']]);
    const req = JSON.parse(t.fetches.filter((f) => f.method === 'POST').pop().body);
    check(t.fetches.filter((f) => f.method === 'POST').pop().url === W + '/idea/respond?id=' + A && req.member === 'ashwin-p8' && 'origin' in req && 'available_to' in req && 'note' in req,
      'respond goes through the model\'s respondRequest: the id in the query, a complete body');
    const b2 = await t.api.setBooked(A, 'ashwin-p8', true);
    check(b2.ok && t.api.DOCS[A].responses['ashwin-p8'].booked === true && srv.read(A).responses['ashwin-p8'].booked === true, 'booked: optimistic, then the Worker\'s doc');
    check(eq(norm(t.api.applyLocal(before, [{ method: 'POST', path: '/idea/booked?id=' + A, body: { member: 'momdad-k3', booked: true } }])).responses['momdad-k3'].booked, true), 'applyLocal mirrors /idea/booked');
    srv.write(Object.assign(clone(srv.read(A)), { responses: before.responses }));
  }
  {
    // the organizer edit re-reads the record first: an answer that arrived after my screen loaded survives my edit
    const t = loadApp({ ls: orgLs(), fetch: srv.fetch });
    await t.api.refreshAll(); await tick();
    const late = clone(srv.read(A));
    late.idea.members.push({ code: 'priya-q1', label: '🦊 Priya', airport: 'DEN', headcount: 1 });
    late.responses['anjo-z5'] = { member: 'anjo-z5', status: 'in', origin: 'LGA', available_from: '', available_to: '', note: '', arrive_at: '', leave_from: '', updated_at: '2026-10-17T18:00:00.000Z' };
    srv.write(late);
    const n0 = t.fetches.length;
    const p = t.api.organizerWrite(A, { caption: 'Puja moved to Saturday' });
    check(t.api.DOCS[A].idea.notes.indexOf('Puja moved to Saturday') >= 0, 'the edit shows at once, before the Worker answers');
    const res = await p;
    const seq = t.fetches.slice(n0);
    check(seq[0] && seq[0].method === 'GET' && seq[0].url === W + '/idea?id=' + A && seq[0].headers['X-Idea-Key'] === KEY && seq[1] && seq[1].method === 'POST' && seq[1].url === W + '/idea/update?id=' + A,
      'organizer edit: GET /idea with X-Idea-Key first, then POST /idea/update', seq.map((f) => f.method + ' ' + f.url));
    const upd = JSON.parse(seq[1].body), server = srv.read(A);
    check(res.ok && upd.edit_key === KEY && upd.idea.members.some((m) => m.code === 'priya-q1') && server.idea.members.some((m) => m.code === 'priya-q1') && server.responses['anjo-z5'].status === 'in' &&
      server.idea.notes === '📌2026-11-08 Puja moved to Saturday' && eq(norm(t.api.DOCS[A]), norm(server)),
      'the update is built from the fresh record: the member and answer added since the screen loaded survive, and the store holds the Worker\'s doc');
    const lockReq = await t.api.organizerWrite(A, { decision: { stage: 'chosen' } });
    check(lockReq.ok && srv.read(A).decision.stage === 'chosen' && eq(norm(t.api.DOCS[A]).decision, norm(srv.read(A)).decision), 'a decision (🔒) applies optimistically exactly as the Worker applies it');
    srv.write(Object.assign(clone(srv.read(A)), { decision: { stage: 'proposed', chosen: null, chosen_at: null, estimate_total: null, actual_total: null, booked_at: null, delta_pct: null } }));
  }
  {
    // revert on failure, error by code
    const t = loadApp({ ls: orgLs(), fetch: srv.fetch });
    await t.api.refreshAll(); await tick();
    const before = clone(t.api.DOCS[A]);
    srv.failNext = { status: 409, body: { error: 'This trip idea is closed — <img src=x onerror=alert(1)>', code: 'closed' } };
    const r = await t.api.respond(A, 'anjo-z5', { status: 'in' });
    check(!r.ok && r.code === 'closed' && eq(t.api.DOCS[A], before), 'a refused write reverts the optimistic doc and reports the Worker\'s code (closed), not its text');
    await tick();
    srv.failNext = 'network';
    const r2 = await t.api.setBooked(A, 'ashwin-p8', true);
    check(!r2.ok && r2.code === 'network' && eq(t.api.DOCS[A].responses, before.responses), 'a write that never reaches the Worker reverts and reports network');
    await tick();
    srv.failNext = 'network';
    const r3 = await t.api.organizerWrite(A, { caption: 'x' });
    check(!r3.ok && r3.code === 'network' && eq(t.api.DOCS[A].idea, before.idea) && t.fetches.filter((f) => f.method === 'POST' && f.url.indexOf('/idea/update') >= 0).length === 0,
      'an organizer edit whose fresh read fails sends nothing and reverts');
    await tick();
    const t2 = loadApp({ ls: orgLs(), fetch: srv.fetch });
    await t2.api.refreshAll(); await tick();
    const r4 = await t2.api.organizerWrite(B, { caption: 'not mine' });
    check(!r4.ok && r4.code === 'forbidden' && t2.fetches.every((f) => f.url.indexOf('/idea/update') < 0), 'no organizer write without this phone\'s edit key');
    const bad = loadApp({ ls: seedLs({ pialax_watchlist_v2: listOf([A]), pialax_idea_keys_v1: { [A]: { edit_key: KEY2, title: '', created_at: 'c' } }, pialax_ui_v1: { v1read: 1 } }), fetch: srv.fetch });
    await bad.api.refreshAll(); await tick();
    check(bad.api.KEYBAD[A] === true && bad.api.modelOf(A).org === false && JSON.parse(bad.ls.getItem('pialax_idea_keys_v1'))[A].edit_key === KEY2, 'a key the Worker does not accept shows the guest view, and the key is kept (never deleted)');
  }
  {
    const t = loadApp({ fetch: srv.fetch });
    const res = await t.api.createTrip({ emoji: '🎄', name: 'Christmas', dest: { airport: 'PIA' }, dates: { departure: '2026-12-20', return: '2026-12-27' }, members: [{ name: 'Ashwin', face: '🌴', airport: 'LAX', headcount: 1 }] });
    const keys = JSON.parse(t.ls.getItem('pialax_idea_keys_v1') || '{}');
    check(res.ok && keys[res.id] && /^[A-Za-z0-9_-]{32,64}$/.test(keys[res.id].edit_key) && keys[res.id].title === '🎄 Christmas' && eq(t.api.listIds(), [res.id]) && t.api.DOCS[res.id].idea.title === '🎄 Christmas',
      'create: POST /idea through createRequest, the edit key saved in v1\'s format, the trip listed');
  }

  // ═══ AC6 ═══
  section('AC6 errors show by Worker error code, never as server text');
  {
    const t = loadApp();
    const table = [[0, null, 'network'], [404, { code: 'not_found' }, 'not_found'], [409, { code: 'closed' }, 'closed'], [403, { code: 'forbidden' }, 'forbidden'], [401, { code: 'no_token' }, 'no_token'],
      [429, { code: 'daily_cap' }, 'daily_cap'], [501, { code: 'no_kv' }, 'no_kv'], [400, { code: 'answer_first' }, 'answer_first'], [400, { code: 'bad_decision' }, 'bad_decision'],
      [413, { code: 'too_large' }, 'too_large'], [400, { code: 'bad_id' }, 'bad_id'], [400, { code: '<b>made up</b>' }, 'bad_body'], [502, { error: 'Proxy error' }, 'network'], [404, null, 'not_found']];
    const wrong = table.filter(([s, j, c]) => t.api.errCode(s, j) !== c);
    check(wrong.length === 0, 'errCode maps every Worker code (and bare statuses) to a known code; an unknown code never passes through', wrong);
    const SERVER = 'This trip idea is closed';
    const words = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').split(/\s+/).filter((w) => /\p{L}/u.test(w));
    const codes = ['network', 'not_found', 'closed', 'forbidden', 'no_token', 'daily_cap', 'no_kv', 'bad_body', 'bad_id', 'answer_first', 'bad_decision', 'too_large', 'whatever'];
    const rendered = codes.map((c) => ({ c, h: t.api.SHEETS.error({ p: { code: c }, local: {} }) }));
    check(rendered.every((x) => x.h.indexOf(SERVER) < 0 && words(x.h).length <= 3), 'P-error for every code: a glyph and at most 3 words from the app\'s own table', rendered.map((x) => x.c + ':' + words(x.h).join(' ')));
    check(rendered.filter((x) => /data-act="eretry"/.test(x.h)).map((x) => x.c).join() === 'network,no_kv,bad_body,whatever', '↻ appears only where a retry can help (network, sharing unavailable, not saved)');
    check(!/json\.error|\.error\b(?!\()/.test(appPart.replace(/error:\s*'|'error'/g, '').replace(/showError|errCode|errInfo|SHEETS\.error|ERR_CODES/g, '')), 'the app never reads the Worker\'s error text (json.error)');
    t.api.S.sheet = null;
    const keyHtml = t.api.SHEETS.key({ p: {}, local: { keys: Object.keys(t.api.LEGEND).filter((k) => ['back', 'key', 'settings', 'close', 'trips', 'map', 'cal'].indexOf(k) < 0).map((k) => ({ k, keys: [k] })) } });
    check(/data-act="kpage"/.test(keyHtml) && words(keyHtml.replace(/<span class="tn"[^<]*<\/span>/, '')).length <= 18, 'P-key pages its legend at ≤18 words a page (every glyph the app can show)');
    check(/data-act="settings"/.test(t.api.SHEETS.key({ p: {}, local: { keys: [] } })), 'P-key always ends with ⚙, so a fresh phone can reach the token entry');
    t.api.openSheet('key', {});
    t.api.showError('closed');
    const waited = t.api.S.sheet && t.api.S.sheet.type;
    t.api.closeSheet();
    check(waited === 'key' && t.api.S.sheet && t.api.S.sheet.type === 'error' && t.api.S.sheet.p.code === 'closed' && !t.api.S.errNext,
      'P-error never replaces an open sheet: it waits until that sheet closes, then opens', { waited, now: t.api.S.sheet && t.api.S.sheet.type });
    t.api.closeSheet();
  }
  {
    // a link to a trip the Worker has never heard of, on a phone whose other trips answer slowly: the link's own
    // 404 decides at once (P-error, the trip off the list), whatever the other GETs are doing
    const Z = 'zzTripThatIsGone0000z1', slow = deferred(), held = deferred();
    const fetchImpl = async (u) => {
      const id = new URL(u).searchParams.get('id');
      if (id === Z) { await held.p; return reply(404, { error: 'Trip idea not found — server words', code: 'not_found' }); }
      await slow.p; return srv.fetch(u);
    };
    const t = loadApp({ ls: seedLs({ pialax_watchlist_v2: listOf([A, B]), pialax_ui_v1: { v1read: 1 } }), url: BASE + '?idea=' + Z, fetch: fetchImpl });
    check(t.api.S.trip === Z && t.api.listIds().indexOf(Z) >= 0, 'the link opens its trip and lists it while the Worker is asked');
    t.api.openSheet('key', {});            // someone opens ⓘ before the answer arrives
    held.res(); await tick();
    const during = t.api.S.sheet && t.api.S.sheet.type;
    check(during === 'key' && t.api.listIds().indexOf(Z) < 0 && t.api.S.trip === null && t.api.S.errNext === 'not_found',
      'the 404 lands while the other trips are still loading: the trip leaves the list at once, and P-error waits for the open sheet', { during, list: t.api.listIds(), errNext: t.api.S.errNext });
    t.api.closeSheet();
    check(t.api.S.sheet && t.api.S.sheet.type === 'error' && t.api.S.sheet.p.code === 'not_found', 'closing that sheet shows "Trip not found" (by code)');
    slow.res(); await tick(); t.api.closeSheet();
    await t.api.refreshAll(); await tick();
    check(!t.api.S.sheet, 'later reads (background) never open P-error again');
  }

  // ═══ AC12 / AC14 ═══
  section('AC12 / AC14 preflight covers app.html; the playbook records the v2 decisions');
  const pf = fs.readFileSync(path.join(ROOT, 'scripts', 'preflight.sh'), 'utf8');
  check(/FILES=\([^)]*app\.html[^)]*\)/.test(pf), 'preflight FILES includes app.html (console.log, secret scan, <script> balance, presence)');
  check(/suites=\([^)]*\btest-app\.sh\b[^)]*\)/.test(pf) && /suites=\([^)]*\btest-words\.sh\b[^)]*\)/.test(pf), 'preflight runs test-app.sh and test-words.sh');
  const sri = fs.readFileSync(path.join(ROOT, 'scripts', 'verify-sri.sh'), 'utf8');
  check(/app\.html/.test(sri) && /integrity=/.test(sri), 'verify-sri.sh checks app.html\'s integrity= attributes against its pinned hashes');
  {
    // the app.html part of verify-sri runs offline (SRI_APP_ONLY=1) and gates here: a <script src> the pinned list does
    // not cover fails whatever its quoting, case or line breaks; a pinned one passes in either quote style
    const D3 = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js', H = (/d3\.min\.js\|([A-Za-z0-9+/=]+)"/.exec(sri) || [])[1] || '';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pialax-sri-'));
    const runSri = (tag) => {
      const f = path.join(tmp, 'app.html');
      fs.writeFileSync(f, tag === null ? html : html.replace('<title>PIALAX</title>', '<title>PIALAX</title>\n' + tag));
      return require('child_process').spawnSync('bash', [path.join(ROOT, 'scripts', 'verify-sri.sh')], { encoding: 'utf8', env: Object.assign({}, process.env, { SRI_APP_ONLY: '1', SRI_APP_HTML: f }) }).status;
    };
    const cases = [[null, 0, 'app.html as it is'], ['<script src="' + D3 + '" integrity="sha512-' + H + '"></script>', 0, 'pinned, double quotes'], ["<script src='" + D3 + "' integrity='sha512-" + H + "'></script>", 0, 'pinned, single quotes'],
      ["<script src='https://cdn.jsdelivr.net/npm/x@1/x.js'></script>", 1, 'unpinned, single quotes'], ['<script src=https://cdn.jsdelivr.net/npm/x@1/x.js></script>', 1, 'unpinned, bare'],
      ['<SCRIPT SRC="https://cdn.jsdelivr.net/npm/x@1/x.js"></SCRIPT>', 1, 'unpinned, upper case'], ['<script\n  src="https://cdn.jsdelivr.net/npm/x@1/x.js"></script>', 1, 'unpinned, split over lines'],
      ['<script src="' + D3 + '" integrity="sha512-AAAA"></script>', 1, 'a hash that is not the pinned one']];
    const wrong = cases.filter(([tag, want]) => runSri(tag) !== want).map((c) => c[2]);
    fs.rmSync(tmp, { recursive: true, force: true });
    check(H.length > 40 && wrong.length === 0, 'verify-sri (app.html part, offline): ' + cases.map((c) => c[2] + (c[1] ? ' fails' : ' passes')).join('; '), wrong);
  }
  const docs = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8') + fs.readFileSync(path.join(ROOT, 'PIALAX_HQ.md'), 'utf8');
  const need = ['D1', 'D2', 'D3', 'D4', 'D5', 'strict word', 'app.html', 'PIA-147', 'familyForDate', 'ORD', 'mock'];
  check(need.every((s) => docs.indexOf(s) >= 0), 'CLAUDE.md + PIALAX_HQ.md record D1–D5, the strict word rule, the app.html cutover (PIA-147) and the amended domain rules', need.filter((s) => docs.indexOf(s) < 0));

  check(strayNet.length === 0, 'offline: nothing reached the network outside the in-process Worker', strayNet);
  console.log('');
  if (failCount) { console.log(failCount + ' failing, ' + passCount + ' passing'); process.exit(1); }
  console.log('all ' + passCount + ' checks passing');
  process.exit(0);
})().catch((e) => { console.log('  XX  suite crashed: ' + (e && e.stack ? e.stack : e)); console.log('1 failing'); process.exit(1); });

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
  'tripModel', 'POLL_MS', 'LEGEND', 'anyFailed', 'boot', 'render', 'qsParse', 'WORKER_OK', 'openSheet', 'closeSheet', 'showError', 'FOCUS_GAP_MS',
  // PIA-135
  'ACTS', 'renderIdeas', 'renderTabbar', 'renderSelected', 'activeItems', 'shelfItems', 'tripsBadge', 'unsharedIds', 'shareModels', 'sharedWl', 'recordShared', 'saveState',
  'SAVED_NEW', 'freshCodes', 'myFace', 'dirBase', 'seenFor', 'readFares', 'listAdd', 'uiSet',
  // PIA-136
  'uiRead', 'openCreate', 'presetChips', 'keptDraft', 'requestDraft', 'whoMode', 'whoWords', 'profileLabel', 'renderTrip', 'popupName', 'openTrip', 'renderSheet', 'meFor',
  'sheetName', 'OWED'];

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
    navigator: o.navigator || { userAgent: 'test-app', clipboard: { writeText: () => Promise.resolve() } }
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
    map, env, hold: null, failNext: null, failOn: null,
    seed(doc) { const d = clone(doc); d.edit_hash = hash; map.set('idea:' + d.id, JSON.stringify(d)); return d.id; },
    read(id) { return JSON.parse(map.get('idea:' + id)); },
    write(doc) { map.set('idea:' + doc.id, JSON.stringify(doc)); },
    // the app's fetch, answered by the Worker (optionally held until released, or failed)
    fetch: async (url, opts) => {
      if (String(url).indexOf(W + '/') !== 0) throw new Error('not the Worker: ' + url);
      if (srv.failNext) { const f = srv.failNext; srv.failNext = null; if (f === 'network') throw new TypeError('Failed to fetch'); return new Response(JSON.stringify(f.body), { status: f.status }); }
      // PIA-136: the next request to one route drops (an update that lands, then its airport-sync answer that does not)
      if (srv.failOn && new URL(String(url)).pathname === srv.failOn) { srv.failOn = null; throw new TypeError('Failed to fetch'); }
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
    check(L.token === TOKEN && eq(L.keys, {}) && L.stripHash && L.devices, 'a devices link from a phone with a token and no keys still carries the token');
    const dj = [api.readLink('?l=' + A + '.' + B, '#ks=junk', '/'), api.readLink('?l=' + A, '#ks=', '/'), api.readLink('?l=' + A, '#ks=' + A + '.short', '/')];
    check(dj.every((x) => !x.devices && x.list && x.stripHash && eq(x.keys, {})) && api.readLink('?l=' + A, '#ks=' + A + '.' + KEY, '/').devices,
      'PIA-135 only a #ks= that proves it (a valid key or the token) is my own devices link; a junk, empty or broken one leaves a list link someone else\'s', dj.map((x) => x.devices));
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
    // PIA-135: someone else's list link opens the receiving sheet; nothing is added until ⤓ Save
    const t = loadApp({ url: BASE + '?l=' + A + '.' + B + '&f=' + encodeURIComponent('🌴') + '&flags=assistant' });
    const sh = t.api.S.sheet;
    check(eq(t.api.listIds(), []) && sh && sh.type === 'savelist' && eq(sh.p.ids, [A, B]) && sh.p.face === '🌴' && t.loc.search === '?flags=assistant' && !t.ls.getItem('pialax_idea_keys_v1') && !t.ls.getItem('pialax_proxy_token'),
      'list link: the receiving sheet opens with its ids and the sender\'s face (nothing listed yet, no keys, no token); ?l and ?f consumed, ?flags kept', { list: t.api.listIds(), sheet: sh && sh.type });
  }
  {
    const v1 = loadApi(path.join(ROOT, 'pialax-mobile.html'), 'pialax-mobile.html', ['wlShareEncode'], { console: QUIET }).api;
    const w = v1.wlShareEncode({ overrides: { thanksgiving: { sharedIdeaId: C } }, added: [] });
    const t = loadApp({ url: BASE + '?w=' + w });
    check(eq(t.api.listIds(), []) && t.api.S.sheet && t.api.S.sheet.type === 'savelist' && eq(t.api.S.sheet.p.ids, [C]) && t.api.S.sheet.p.face === '' && t.loc.search === '',
      'a v1 ?w= share link opened in v2 offers its shared trip on the receiving sheet and is read once (dropped from the address bar)');
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
    // PIA-136: on the app's folder, exactly as v1 builds it (index.html sends it to v1 today, to app.html after the cutover)
    const v1loc = { search: '', hash: '', pathname: '/PIALAX/pialax-mobile.html', origin: ORIGIN, href: ORIGIN + '/PIALAX/pialax-mobile.html', hostname: 'shwinster101.github.io' };
    const v1w = makeShim().window; v1w.location = v1loc; v1w.localStorage = t.ls;   // v1 reads window.location
    const v1l = loadApi(path.join(ROOT, 'pialax-mobile.html'), 'pialax-mobile.html', ['tripIdeaOrganizerLink'], { localStorage: t.ls, location: v1loc, window: v1w, console: QUIET }).api;
    check(org === ORIGIN + '/PIALAX/?idea=' + A + '#k=' + KEY + '&t=' + TOKEN && org === v1l.tripIdeaOrganizerLink(A) && org.indexOf('app.html') < 0 && t.api.organizerLink(B) === '',
      "the organizer link is v1's own, byte for byte (v1's tripIdeaOrganizerLink): <folder>/?idea=<id>#k=<key>&t=<token>, never naming app.html (only for a trip this phone holds the key to)", [org, v1l.tripIdeaOrganizerLink(A)]);
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

  // ═══ PIA-135: Trips › Ideas, the shared watchlist ═══
  section('PIA-135 Trips › Ideas: cards, the one total, hand-offs, list share, the receiving sheet, the shelf, new answers');
  const LX = 'lxBeachWeekendLAX00d05', DROP = 'drTahoeDroppedTrip00d1', UO = 'uoUndatedOldWindow0u01', PAST = 'psTahoePastSeptember01';
  [fx('idea-diwali.json'), fx('idea-tahoe.json'), fx('idea-8members.json'), fx('idea-undated.json'), fx('idea-lax-local.json')].forEach((d) => srv.seed(d));   // the fixtures as they are (earlier groups wrote to them)
  srv.seed(Object.assign(clone(fx('idea-tahoe.json')), { id: DROP, decision: { stage: 'dropped', chosen: null, chosen_at: null, estimate_total: null, actual_total: null, booked_at: null, delta_pct: null } }));
  srv.seed(Object.assign(clone(fx('idea-undated.json')), { id: UO, idea: Object.assign(clone(fx('idea-undated.json').idea), { dates: { departure: '', return: '', searchStart: '2026-08-01', searchEnd: '2026-08-20' } }) }));
  srv.seed(Object.assign(clone(fx('idea-tahoe.json')), { id: PAST, idea: Object.assign(clone(fx('idea-tahoe.json').idea), { dates: { departure: '2026-09-11', return: '2026-09-14', searchStart: '', searchEnd: '' } }) }));
  const keyOf = (ids) => { const o = {}; ids.forEach((id) => { o[id] = { edit_key: KEY, title: '', created_at: 'c' }; }); return o; };
  const cardOf = (html, id) => { const i = html.indexOf('<article class="card'), parts = html.slice(i).split('<article '); return parts.find((p) => p.indexOf('data-trip="' + id + '"') >= 0) || ''; };
  const ME = { [A]: 'ashwin-p8', [B]: 'ashwin-l2', [C]: 'ashwin-c3', [LX]: 'ashwin-x3', [DROP]: 'ashwin-l2', [UO]: 'ashwin-c3', [PAST]: 'ashwin-l2' };
  const boot135 = async (o) => {
    const t = loadApp(Object.assign({ fetch: srv.fetch }, o));
    await t.api.refreshAll(true); await tick(); t.api.render();
    return t;
  };
  {
    // the organizer's phone with the token: a real total from cached real fares on the trips it organizes, nowhere else
    const fares = {};
    const dwm = loadApp().api.tripModel(srv.read(A), { today: '2026-10-17', now: NOW, me: 'ashwin-p8', hasEditKey: true, hasToken: true });
    dwm.travelers.forEach((x, i) => x.keys.forEach((k) => { fares[k.key] = { p: 200 + i * 100, f: NOW - 36e5 }; }));
    const want = dwm.travelers.reduce((s, x, i) => s + (200 + i * 100) * x.keys.length, 0);
    const t = await boot135({ ls: seedLs({ pialax_watchlist_v2: listOf([C, M8, B, A]).map((x) => Object.assign(x, { pin: x.id === M8 })), pialax_idea_keys_v1: keyOf([A]), pialax_proxy_token: TOKEN,
      pialax_idea_me_v1: ME, pialax_fares_v2: fares, pialax_ui_v1: { v1read: 1 } }) });
    const html = t.api.renderIdeas().html, cA = cardOf(html, A), cB = cardOf(html, B);
    const totA = (/<span class="tot[^"]*" data-k="total">([^<]*)/.exec(cA) || [])[1];
    check(totA === '$' + want.toLocaleString('en-US') && cB.indexOf('class="tot') < 0 && cardOf(html, M8).indexOf('class="tot') < 0,
      'PIA-135 AC1 the one total ($' + want + ', the sum of the cached real fares) sits only on the card of a trip this token phone organizes', { totA, want });
    check(/<span data-k="pin"><span class="g">📌<\/span>8<\/span>/.test(cA) && /<span class="tg w" data-k="togo"><span class="g">⏳<\/span>20<i class="bba" data-k="bookby"><i style="width:0\.0%"><\/i><\/i><\/span>/.test(cA),
      'PIA-135 AC1 Diwali\'s pill: the event day (📌8) and ⏳20 days to go, red with an empty book-by arc (book-by 10/16 has passed with travelers unbooked)');
    check(/<span class="tg" data-k="togo"><span class="g">⏳<\/span>41<i class="bba" data-k="bookby"><i style="width:48\.8%"><\/i><\/i><\/span>/.test(cB) && cB.indexOf('class="tg w"') < 0,
      'PIA-135 AC1 Tahoe\'s pill: ⏳41 days to go, neutral, over a book-by arc 20/41 full (it books by 11/06)');
    check(/<span class="loc" data-k="place"><svg viewBox="0 0 360 230" aria-hidden="true"><use href="#us-o"[^>]*\/><circle cx="303.5" cy="125.9"/.test(cA),
      'PIA-135 AC1 the postcard carries a mini locator: Raleigh (RDU) as a dot on the US outline (a glyph with its key: Place)');
    check(/class="card-open"[^>]*>🪔 Diwali in Raleigh<\/button>/.test(cA) && /<h3 class="card-t" data-free>/.test(cA) && /data-k="heads">3\/4</.test(cA) && /class="pip now" data-k="st-asking"/.test(cA) && /class="pip now" data-k="st-asking"/.test(cB),
      'PIA-135 AC1 the card: title (free of the word budget), faces with answer shapes, n/N, and the stage disc on every card (Tahoe, which this phone does not organize, too)');
    const order = (html.match(/data-trip="([^"]+)"/g) || []).map((s) => s.slice(11, -1));
    check(eq(order, [M8, A, B, C]), 'cards sort ⭐ pinned first, then by departure, undated last', order);
    const gf = /<a class="slot gf z" href="(https:\/\/www\.google\.com\/travel\/flights\/search\?tfs=[^"]+)" target="_blank" rel="noopener noreferrer" aria-label="Google Flights" data-k="gf">/.exec(cA);
    check(!!gf && gf[1].replace(/&amp;/g, '&') === t.api.modelOf(A).me.link.href, 'PIA-135 AC2 my own Google Flights search is the card\'s one tap (a new tab), the model\'s own link');
    const noTok = await boot135({ ls: seedLs({ pialax_watchlist_v2: listOf([A, B]), pialax_idea_keys_v1: keyOf([A]), pialax_idea_me_v1: ME, pialax_fares_v2: fares, pialax_ui_v1: { v1read: 1 } }) });
    const guest = await boot135({ ls: seedLs({ pialax_watchlist_v2: listOf([A, B, C]), pialax_idea_me_v1: { [A]: 'anjo-z5', [B]: 'maya-s9', [C]: 'anjo-c4' }, pialax_proxy_token: TOKEN, pialax_fares_v2: fares, pialax_ui_v1: { v1read: 1 } }) });
    const gh = guest.api.renderIdeas().html;
    check(noTok.api.renderIdeas().html.indexOf('class="tot') < 0 && gh.indexOf('class="tot') < 0 && guest.api.modelOf(A).price === null,
      'PIA-135 AC1 guests\' cards have no price slot at all (a guest phone with a token too), and an organizer phone without the token shows none');
    check([A, B].every((id) => /class="pip now" data-k="st-asking"/.test(cardOf(gh, id))) && /data-k="togo"><span class="g">⏳<\/span>20</.test(cardOf(gh, A)) && cardOf(gh, A).indexOf('class="tg w"') < 0,
      'PIA-135 AC1 a guest sees the same stage disc and ⏳ days to go; the red book-by cue stays with those it matters to (Anjo has not answered Diwali)');
  }
  {
    // AC1 the one total never reads as final while a traveler is half priced: Diwali moved to New York (LGA, hub LGA/JFK),
    // Mom & Dad fly into JFK and home from LGA (open-jaw) with only their inbound leg cached; Anjo hosts there
    const OJ = 'ojDiwaliOpenJawLGA0001', oj = clone(fx('idea-diwali.json'));
    oj.id = OJ; oj.idea.destination = { city: 'New York', airport: 'LGA' };
    oj.responses['momdad-k3'] = Object.assign({}, oj.responses['momdad-k3'], { arrive_at: 'JFK', leave_from: 'LGA' });
    srv.seed(oj);
    const om = loadApp().api.tripModel(srv.read(OJ), { today: '2026-10-17', now: NOW, me: 'ashwin-p8', hasEditKey: true, hasToken: true });
    const md = om.travelers.filter((x) => x.code === 'momdad-k3')[0], ash = om.travelers.filter((x) => x.code === 'ashwin-p8')[0];
    const fares = {}; fares[md.keys[0].key] = { p: 200, f: NOW - 36e5 }; ash.keys.forEach((k) => { fares[k.key] = { p: 300, f: NOW - 36e5 }; });
    const t = await boot135({ ls: seedLs({ pialax_watchlist_v2: listOf([OJ]), pialax_idea_keys_v1: keyOf([OJ]), pialax_proxy_token: TOKEN, pialax_idea_me_v1: { [OJ]: 'ashwin-p8' }, pialax_fares_v2: fares, pialax_ui_v1: { v1read: 1 } }) });
    const p = t.api.modelOf(OJ).price, c = cardOf(t.api.renderIdeas().html, OJ);
    check(md.openJaw && md.keys.length === 2 && p.total === 500 && !p.complete && p.per['momdad-k3'].hollow && p.per['momdad-k3'].sum === 200 &&
      /<span class="tot part" data-k="total">\$500 <span class="uf" data-k="unpriced">\+🌽<\/span><\/span>/.test(c),
      'PIA-135 AC1 an open-jaw traveler with one of two legs cached: the total is outlined as partial with their face (+🌽), never a bare $500', { total: p.total, complete: p.complete, tot: (/<span class="tot[\s\S]*?<\/span><\/span>|<span class="tot[^>]*>[^<]*<\/span>/.exec(c) || [])[0] });
  }
  {
    // AC2 hand-offs: a host sees 🏠, a booked traveler the Flighty hand-off, an idea without a place Explore
    const booked = clone(srv.read(B)); booked.id = 'bkTahoeBookedAshwin0b1'; booked.responses['ashwin-l2'] = Object.assign({}, booked.responses['ashwin-l2'], { status: 'in', booked: true }); srv.seed(booked);
    const nowhere = clone(srv.read(B)); nowhere.id = 'nwNoPlaceYetIdea000n02'; nowhere.idea.destination = { city: '', airport: '' }; srv.seed(nowhere);
    // a guest who has not answered yet (Leo on Tahoe), a place off the US map (London) and a code the app does not know
    const UN = 'unTahoeUnansweredLe001', LHR = 'lnLondonCallingLHR0001', ZZ = 'zqUnknownAirportZZQ001';
    srv.seed(Object.assign(clone(fx('idea-tahoe.json')), { id: UN }));
    const lon = clone(fx('idea-tahoe.json')); lon.id = LHR; lon.idea.destination = { city: 'London', airport: 'LHR' }; srv.seed(lon);
    const zz = clone(fx('idea-tahoe.json')); zz.id = ZZ; zz.idea.destination = { city: '', airport: 'ZZQ' }; srv.seed(zz);
    const t = await boot135({ ls: seedLs({ pialax_watchlist_v2: listOf([LX, booked.id, nowhere.id, UN, LHR, ZZ]), pialax_idea_me_v1: { [LX]: 'ashwin-x3', [booked.id]: 'ashwin-l2', [nowhere.id]: 'ashwin-l2', [UN]: 'leo-w6', [LHR]: 'ashwin-l2', [ZZ]: 'ashwin-l2' }, pialax_ui_v1: { v1read: 1 } }) });
    const html = t.api.renderIdeas().html;
    check(/aria-label="Host" data-lbl="Host" data-k="host">🏠</.test(cardOf(html, LX)) && /href="https:\/\/www\.flighty\.com\/"[^>]*data-k="flighty">✈⏱↗</.test(cardOf(html, booked.id)) &&
      /href="https:\/\/www\.google\.com\/travel\/explore[^"]*"[^>]*data-k="explore">🧭↗</.test(cardOf(html, nowhere.id)),
      'PIA-135 AC2 the card\'s slot: 🏠 for a host, ✈⏱↗ Flighty once I have booked, 🧭↗ Explore for an idea with no place');
    const un = t.api.modelOf(UN), ugf = /<a class="slot gf z" href="([^"]+)"[^>]*data-k="gf">✈↗<\/a>/.exec(cardOf(html, UN));
    check(!un.me.answered && un.me.status === 'waiting' && !!ugf && ugf[1].replace(/&amp;/g, '&') === un.me.link.href && /^https:\/\/www\.google\.com\/travel\/flights\/search\?tfs=/.test(un.me.link.href),
      'PIA-135 AC2 nothing is gated behind answering: Leo, who has not answered Tahoe, has his own Google Flights search one tap from the list (SEA→RNO, the plan\'s dates)');
    check(/<span class="loc" data-k="noplace">/.test(cardOf(html, nowhere.id)) && /<span class="loc" data-k="abroad">/.test(cardOf(html, LHR)) && /<span class="loc" data-k="noplace">/.test(cardOf(html, ZZ)) &&
      /<span class="loc" data-k="place">/.test(cardOf(html, LX)) && t.api.LEGEND.place && t.api.LEGEND.abroad && t.api.LEGEND.noplace && t.api.LEGEND.bookby,
      'PIA-135 AC1 the locator\'s states: a dot on the US map (LA), a globe for a known place off it (London), ? for no place yet or a code the app does not know (ZZQ, never a globe); each has its key');
  }
  {
    // AC3 opening any trip link adds it with no taps, and the card flies in when the list is next drawn
    const t = loadApp({ url: BASE + '?idea=' + B, fetch: srv.fetch });
    check(eq(t.api.listIds(), [B]) && t.api.S.trip === B && t.api.S.fly && t.api.S.fly[B] === 1, 'PIA-135 AC3 a trip link saves the trip with no taps and marks its card to fly into the list');
    t.api.S.trip = null;
    check(/<article class="card dim fly" data-trip="thTahoeSkiWeekend26b02">/.test(t.api.renderIdeas().html), 'an arrival flies in even when the list draws it before its first read (the snapshot card)');
  }
  {
    // AC4 / AC5 the list share: groups by people, the largest pre-checked, shelf and dropped left out, my face, no secrets
    const mk = (nav) => boot135({ navigator: nav, ls: seedLs({ pialax_watchlist_v2: listOf([A, B, C, M8, DROP, PAST]), pialax_idea_keys_v1: keyOf([A, DROP]), pialax_proxy_token: TOKEN, pialax_idea_me_v1: ME, pialax_ui_v1: { v1read: 1 } }) });
    let shared = null;
    const t = await mk({ userAgent: 'x', share: (o) => { shared = o; return Promise.resolve(); }, clipboard: { writeText: () => Promise.reject(new Error('no')) } });
    check(eq(t.api.unsharedIds().sort(), [A, B, C, M8].sort()) && /data-act="sharelist" aria-label="Share list, 4 not shared" data-lbl="Share list"[^>]*>[\s\S]*?<span class="badge" data-lbl="Not shared">\+4<\/span>/.test(t.api.renderIdeas().html),
      'PIA-135 AC5 the list-share control counts every trip in my list that no list share has carried yet, whoever organizes it (+4; the shelf\'s two are not counted), and says so to a screen reader');
    t.api.openSheet('sharelist', {});
    const shHtml = t.api.SHEETS.sharelist(t.api.S.sheet), L = t.api.S.sheet.local;
    const listed = (shHtml.match(/data-act="sltoggle" data-id="([^"]+)"/g) || []).map((s) => s.split('"')[3]);
    check(eq(Object.keys(L.checked).sort(), [A, C].sort()) && eq(listed.sort(), [A, B, C, M8].sort()) && (shHtml.match(/data-act="slgroup"/g) || []).length === 3 && /Share <span class="tn">2<\/span>/.test(shHtml),
      'PIA-135 AC4 P-sharelist: trips grouped by who is in them (3 groups), the largest (🌽🗽 Diwali + the shower) pre-checked, shelf and dropped trips never listed', { checked: L.checked, listed });
    t.api.ACTS.slgroup({ dataset: { v: '1' } });
    const g1 = Object.keys(L.checked);
    t.api.ACTS.sltoggle({ dataset: { id: M8 } });
    check(g1.length === 1 && Object.keys(L.checked).length === 2 && L.checked[M8], 'a group chip checks that group\'s trips only; a card toggles itself');
    t.api.ACTS.slgroup({ dataset: { v: '0' } });
    t.api.ACTS.slshare(); await tick();
    const u = shared && new URL(shared.url);
    check(!!u && u.href === ORIGIN + '/PIALAX/?l=' + A + '.' + C + '&f=' + encodeURIComponent('🌴') && Object.keys(shared).length === 1 && !u.hash && shared.url.indexOf(KEY) < 0 && shared.url.indexOf(TOKEN) < 0,
      'PIA-135 AC4 📣 Share hands the phone\'s share sheet the URL only: the app\'s folder ?l=<checked ids>&f=<my face>, no key, token, hash or price', shared);
    check(eq(t.api.sharedWl().sort(), [A, C].sort()) && eq(t.api.unsharedIds().sort(), [B, M8].sort()) && !t.api.S.sheet && /<span class="badge" data-lbl="Not shared">\+2<\/span>/.test(t.api.renderIdeas().html),
      'PIA-135 AC5 once shared: pialax_shared_at_v1.wl holds the ids, the sheet closes, and the count drops by exactly those two (+4 → +2)');
    const g2 = await boot135({ ls: seedLs({ pialax_watchlist_v2: listOf([A, B]), pialax_idea_me_v1: { [A]: 'anjo-z5', [B]: 'maya-s9' }, pialax_ui_v1: { v1read: 1 } }) });
    check(eq(g2.api.unsharedIds().sort(), [A, B].sort()) && /<span class="badge" data-lbl="Not shared">\+2<\/span>/.test(g2.api.renderIdeas().html),
      'PIA-135 AC5 a guest who organizes nothing and has never shared sees +2 too');
    const cancelled = await mk({ share: () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })), clipboard: { writeText: () => Promise.resolve() } });
    cancelled.api.openSheet('sharelist', {}); cancelled.api.SHEETS.sharelist(cancelled.api.S.sheet);
    cancelled.api.ACTS.slshare(); await tick();
    check(cancelled.api.S.sheet && cancelled.api.S.sheet.type === 'sharelist' && eq(cancelled.api.sharedWl(), []), 'cancelling the phone\'s share sheet shares nothing and records nothing');
    const refNav = { clipboard: { writeText: () => Promise.reject(new Error('denied')) } };
    const refused = await mk(refNav);
    refused.api.openSheet('sharelist', {}); refused.api.SHEETS.sharelist(refused.api.S.sheet);
    refused.api.ACTS.slshare(); await tick();
    check(refused.api.S.sheet && refused.api.S.sheet.type === 'link' && /\?l=/.test(refused.api.S.sheet.p.url) && refused.api.S.sheet.back && refused.api.S.sheet.back.type === 'sharelist' && eq(refused.api.sharedWl(), []),
      'no share sheet and a refused clipboard: P-link with the list link, over the list-share sheet; nothing is recorded yet (nothing has gone out)');
    refNav.clipboard.writeText = () => Promise.resolve();
    refused.api.ACTS.lcopy(); await tick();
    check(eq(refused.api.sharedWl().sort(), [A, C].sort()), 'P-link\'s ⧉ copies the link, and only then are its trips recorded as shared');
    const closed = await mk({ clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
    closed.api.openSheet('sharelist', {}); closed.api.SHEETS.sharelist(closed.api.S.sheet);
    closed.api.ACTS.slshare(); await tick();
    closed.api.closeSheet();
    check(eq(closed.api.sharedWl(), []) && eq(closed.api.unsharedIds().sort(), [A, B, C, M8].sort()), 'closing P-link without copying records nothing: the +n count stays');
    const copied = await mk({ clipboard: { writeText: () => Promise.resolve() } });
    copied.api.openSheet('sharelist', {}); copied.api.SHEETS.sharelist(copied.api.S.sheet);
    copied.api.ACTS.slshare(); await tick();
    check(!copied.api.S.sheet && copied.api.sharedWl().length === 2, 'no share sheet: the link is copied and the sheet closes');
    const empty = loadApp({ ls: seedLs({ pialax_watchlist_v2: listOf([PAST]), pialax_ui_v1: { v1read: 1 } }), fetch: srv.fetch });
    await empty.api.refreshAll(true); await tick(); empty.api.render();
    check(empty.api.renderIdeas().html.indexOf('data-act="sharelist"') < 0 && loadApp().api.renderIdeas().html.indexOf('data-act="sharelist"') < 0, 'the list-share control is hidden while there is nothing to share (an empty list, or only shelf trips)');
  }
  {
    // AC4 the receiving sheet: the sender's face, only the trips that are new here, ⤓ Save in one tap
    const Z = 'zzTripThatIsGone0000z1';
    const t = loadApp({ url: BASE + '?l=' + A + '.' + B + '.' + Z + '&f=' + encodeURIComponent('🦊'), fetch: srv.fetch, ls: seedLs({ pialax_watchlist_v2: listOf([A]), pialax_ui_v1: { v1read: 1 } }) });
    await tick(); await t.api.refreshAll(); await tick();
    const sh = t.api.S.sheet, st = t.api.saveState(sh.p), html = t.api.SHEETS.savelist(sh);
    check(sh.type === 'savelist' && eq(st.fresh, [B]) && /<span class="svf" data-face>🦊<\/span>/.test(html) && (html.match(/class="mini/g) || []).length === 1 && /Tahoe ski weekend/.test(html) && /Save <span class="tn">1<\/span>/.test(html) && html.indexOf('Diwali') < 0,
      'PIA-135 AC4 P-savelist shows the sender\'s face and only the trips new to this phone (Tahoe; Diwali is already here, the gone trip is left out): ⤓ Save 1', { fresh: st.fresh });
    const gets = t.fetches.filter((f) => f.method === 'GET').map((f) => new URL(f.url).searchParams.get('id'));
    check([B, Z].every((id) => gets.indexOf(id) >= 0) && eq(t.api.listIds(), [A]), 'the sheet reads the offered trips from the Worker (free GET /idea) and saves nothing by itself');
    t.api.ACTS.svsave();
    const savedNow = t.api.listIds().slice();
    await tick();
    check(eq(savedNow, [A, B]) && eq(t.api.listIds(), [A, B]) && !t.api.S.sheet && t.api.S.tab === 'trips' && t.api.S.seg === 'ideas', 'PIA-135 AC4 one tap on ⤓ Save adds the new trips (and only them) and shows the list (test-words sees them fly in)',
      { list: t.api.listIds(), sheet: t.api.S.sheet && t.api.S.sheet.type, tab: t.api.S.tab });
    const mixed = loadApp({ url: BASE + '?l=' + DROP + '.' + PAST + '.' + B, fetch: srv.fetch, ls: seedLs({ pialax_watchlist_v2: listOf([A]), pialax_ui_v1: { v1read: 1 } }) });
    await tick(); await mixed.api.refreshAll(); await tick();
    const mst = mixed.api.saveState(mixed.api.S.sheet.p), mh = mixed.api.SHEETS.savelist(mixed.api.S.sheet);
    check(eq(mst.fresh, [B]) && /Save <span class="tn">1<\/span>/.test(mh), 'a list link that carries a dropped and a past trip (a crafted link, or a v1 payload) offers neither: ⤓ Save 1 (Tahoe)', mst);
    mixed.api.ACTS.svsave();
    check(eq(mixed.api.listIds(), [A, B]), '⤓ Save adds only the trip that was offered');
    const junk = loadApp({ url: BASE + '?l=' + A + '.' + B + '#ks=junk', fetch: srv.fetch, ls: seedLs({ pialax_watchlist_v2: listOf([A]), pialax_ui_v1: { v1read: 1 } }) });
    check(junk.api.S.sheet && junk.api.S.sheet.type === 'savelist' && eq(junk.api.listIds(), [A]) && junk.loc.hash === '', 'a list link with a junk #ks= (no key, no token) is someone else\'s list: P-savelist opens, nothing is added, and the hash leaves the address bar');
    const none = loadApp({ url: BASE + '?l=' + A + '.' + B, fetch: srv.fetch, ls: seedLs({ pialax_watchlist_v2: listOf([A, B]), pialax_ui_v1: { v1read: 1 } }) });
    await none.api.refreshAll(); await tick();
    const nh = none.api.SHEETS.savelist(none.api.S.sheet);
    check((nh.match(/class="mini dim"/g) || []).length === 2 && nh.indexOf('svsave') < 0, 'with nothing new: the dimmed stack and no Save button');
    const shut = loadApp({ url: BASE + '?l=' + B, fetch: srv.fetch });
    await tick(); shut.api.closeSheet();
    check(eq(shut.api.listIds(), []), '⌄ on the receiving sheet saves nothing');
    const gone = loadApp({ url: BASE + '?l=' + Z, fetch: srv.fetch });
    await tick(); await tick();
    check(/Trip not found/.test(gone.api.SHEETS.savelist(gone.api.S.sheet)) && gone.api.S.sheet.type === 'savelist', 'a list link whose trips are all gone says "Trip not found" on the sheet itself');
    const held = deferred(), Z2 = 'zzAnotherGoneTrip000z2';
    const slow = loadApp({ url: BASE + '?l=' + Z2, fetch: async (u, o) => { if (String(u).indexOf(Z2) >= 0) { await held.p; return reply(404, { code: 'not_found' }); } return srv.fetch(u, o); } });
    slow.api.ACTS.svsave(); await tick();
    const listedFirst = slow.api.listIds().slice();
    held.res(); await tick(); await tick();
    check(eq(listedFirst, [Z2]) && eq(slow.api.listIds(), []), 'a trip saved before its first answer, which the Worker does not have, leaves the list again');
  }
  {
    // AC6 the shelf: past, dropped and hidden trips; really collapses; undated ideas never fall onto it; ↩ for the organizer
    const ls = seedLs({ pialax_watchlist_v2: listOf([A, DROP, PAST, UO, C]).map((x) => Object.assign(x, { arch: x.id === C })), pialax_idea_keys_v1: keyOf([DROP]), pialax_idea_me_v1: ME, pialax_ui_v1: { v1read: 1 } });
    const t = await boot135({ ls });
    const act = t.api.activeItems().map((x) => x.id), shelf = t.api.shelfItems().map((x) => x.id).sort();
    check(eq(act, [A, UO]) && eq(shelf, [C, DROP, PAST].sort()), 'PIA-135 AC6 the shelf holds the past, the dropped and the hidden trip; an undated idea whose window has passed stays on the list', { act, shelf });
    const shut = t.api.renderIdeas().html;
    check(/data-act="shelf" aria-expanded="false"[^>]*><span data-k="shelf">🗄<\/span> <span class="tn">3<\/span>/.test(shut) && [C, DROP, PAST].every((id) => shut.indexOf('data-trip="' + id + '"') < 0),
      'PIA-135 AC6 collapsed, the shelf is one row (🗄 3) and none of its cards are drawn');
    t.api.uiSet({ shelfOpen: true }); t.api.render();
    const open = t.api.renderIdeas().html;
    check([C, DROP, PAST].every((id) => /^class="card dim/.test(cardOf(open, id))) && /data-act="restore" data-id="drTahoeDroppedTrip00d1"/.test(cardOf(open, DROP)) && (open.match(/data-act="restore"/g) || []).length === 1,
      'PIA-135 AC6 expanded, the shelf cards are dimmed, and only the organizer\'s dropped trip offers ↩');
    const restoring = t.api.ACTS.restore({ dataset: { id: DROP } });
    const optimistic = t.api.DOCS[DROP].decision.stage;
    const rr = await restoring; await tick();   // the write's own promise: no fixed number of turns to wait
    t.api.render();
    const up = t.fetches.filter((f) => f.method === 'POST').pop();
    check(rr && rr.ok && t.api.PEND[DROP] === 0 && optimistic === 'proposed' && up && up.url === W + '/idea/update?id=' + DROP && JSON.parse(up.body).decision.stage === 'proposed' && srv.read(DROP).decision.stage === 'proposed' && t.api.activeItems().some((x) => x.id === DROP),
      'PIA-135 AC6 ↩ restores a trip dropped while proposed: /idea/update decision proposed (optimistic, then the Worker\'s), and it leaves the shelf', { optimistic, up: up && up.url, server: srv.read(DROP).decision.stage, act: t.api.activeItems().map((x) => x.id) });
    {
      // a trip dropped after its dates were 🔒 set, and one dropped after it was 💵 paid, come back as they were
      const TM = require(path.join(ROOT, 'scripts', 'trip-model.js'));
      const LK = 'lkTahoeLockedDropped01', PD = 'pdTahoePaidDropped0001';
      const post = async (id, delta) => { const q = TM.updateRequest(srv.read(id), KEY, delta); const r = await srv.fetch(W + q.path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q.body) }); return r.status; };
      srv.seed(Object.assign(clone(fx('idea-tahoe.json')), { id: LK })); srv.seed(Object.assign(clone(fx('idea-tahoe.json')), { id: PD }));
      const st = [await post(LK, { decision: { stage: 'chosen' } }), await post(LK, { decision: { stage: 'dropped' } }),
        await post(PD, { decision: { stage: 'chosen' } }), await post(PD, { decision: { stage: 'booked', actual_total: 905 } }), await post(PD, { decision: { stage: 'dropped' } })];
      const t2 = await boot135({ ls: seedLs({ pialax_watchlist_v2: listOf([LK, PD]), pialax_idea_keys_v1: keyOf([LK, PD]), pialax_proxy_token: TOKEN, pialax_idea_me_v1: { [LK]: 'ashwin-l2', [PD]: 'ashwin-l2' }, pialax_ui_v1: { v1read: 1, shelfOpen: true } }) });
      const onShelf = t2.api.shelfItems().map((x) => x.id).sort();
      const r1 = await t2.api.ACTS.restore({ dataset: { id: LK } }), r2 = await t2.api.ACTS.restore({ dataset: { id: PD } }); await tick(); t2.api.render();
      const sl = srv.read(LK).decision, sp = srv.read(PD).decision, ml = t2.api.modelOf(LK), mp = t2.api.modelOf(PD);
      const sent = t2.fetches.filter((f) => f.method === 'POST').map((f) => JSON.parse(f.body).decision);
      check(st.every((s) => s === 200) && eq(onShelf, [LK, PD].sort()) && r1.ok && r2.ok && sl.stage === 'chosen' && sl.chosen && sl.chosen.departure === '2026-11-27' && ml.locked && ml.stage === 'set' &&
        sp.stage === 'booked' && sp.actual_total === 905 && mp.paid === 905 && eq(sent, [{ stage: 'chosen', chosen: { airport: 'RNO', city: 'Reno', departure: '2026-11-27', return: '2026-11-30' } }, { stage: 'booked', actual_total: 905 }]),
        'PIA-135 AC6 ↩ puts a trip back where it stood: dropped after 🔒 it is locked again (Dates set); dropped after 💵 it is booked again with the $905 paid kept', { st, onShelf, sl: sl.stage, sp: [sp.stage, sp.actual_total], sent });
    }
    srv.write(Object.assign(clone(srv.read(DROP)), { decision: { stage: 'dropped', chosen: null, chosen_at: null, estimate_total: null, actual_total: null, booked_at: null, delta_pct: null } }));
    const guest = await boot135({ ls: seedLs({ pialax_watchlist_v2: listOf([DROP, PAST]), pialax_idea_me_v1: ME, pialax_ui_v1: { v1read: 1, shelfOpen: true } }) });
    const gh = guest.api.renderIdeas().html;
    check(cardOf(gh, DROP).indexOf('🗑') > 0 && gh.indexOf('data-act="restore"') < 0, 'no ↩ on a phone without the trip\'s edit key (the dropped trip is on its shelf, 🗑, without it)');
  }
  {
    // AC7 new answers: a ● on each face that answered since my last look, the Trips tab's numeral, cleared by a look
    let offline = false;   // the look counts even when the trip's refresh on open fails (the doc on screen is what I saw)
    const t = await boot135({ fetch: (u, o) => (offline ? Promise.reject(new TypeError('Failed to fetch')) : srv.fetch(u, o)),
      ls: seedLs({ pialax_watchlist_v2: listOf([A, B]), pialax_idea_me_v1: { [A]: 'anjo-z5', [B]: 'ashwin-l2' }, pialax_idea_seen_v1: { [B]: '2026-10-12T23:00:00.000Z' }, pialax_ui_v1: { v1read: 1 } }) });
    const cB = cardOf(t.api.renderIdeas().html, B);
    check(eq(t.api.freshCodes(t.api.modelOf(B)), ['maya-s9']) && (cB.match(/data-k="new"/g) || []).length === 1 && t.api.tripsBadge() === 2 && /<span class="badge" data-k="look" data-lbl="Needs a look">2<\/span>/.test(t.api.renderTabbar()),
      'PIA-135 AC7 Maya answered after my last look: one ● on her face; the Trips tab counts 2 (Tahoe\'s new answer, Diwali still waiting on mine)');
    offline = true;
    t.api.ACTS.open({ dataset: { id: B } }); await tick();
    check(t.api.seenFor(B) === '2026-10-14T18:45:00.000Z' && t.api.freshCodes(t.api.modelOf(B)).length === 0 && t.api.tripsBadge() === 1, 'opening the trip marks its answers seen (even offline): the ● goes and the numeral drops to 1');
  }
  {
    // AC7 the numeral's other half alone: a trip awaiting my answer with every answer already seen still counts
    const AW = 'awDiwaliAwaitsAnjo0001', aw = Object.assign(clone(fx('idea-diwali.json')), { id: AW });
    srv.seed(aw);
    const TM = require(path.join(ROOT, 'scripts', 'trip-model.js'));
    const t = await boot135({ ls: seedLs({ pialax_watchlist_v2: listOf([AW]), pialax_idea_me_v1: { [AW]: 'anjo-z5' }, pialax_idea_seen_v1: { [AW]: TM.newestAnswerAt(srv.read(AW)) }, pialax_ui_v1: { v1read: 1 } }) });
    const m = t.api.modelOf(AW);
    check(t.api.freshCodes(m).length === 0 && TM.awaitsMe(m) && t.api.tripsBadge() === 1 && /<span class="badge" data-k="look" data-lbl="Needs a look">1<\/span>/.test(t.api.renderTabbar()),
      'PIA-135 AC7 a trip still waiting on my answer counts on the Trips tab even with no unseen answers (1)');
    const done = await t.api.respond(AW, 'anjo-z5', { status: 'in' }, { by: 'self' }); await tick(); t.api.render();
    check(done.ok && t.api.tripsBadge() === 0 && !/data-k="look"/.test(t.api.renderTabbar()), 'once I answer, the trip no longer counts and the numeral goes');
  }
  {
    // AC7 a failed refresh: 📶⚠ on the top row, the stale cards dimmed with ◷, no sheet
    let fail = false;
    const t = await boot135({ ls: seedLs({ pialax_watchlist_v2: listOf([A, B]), pialax_idea_me_v1: ME, pialax_ui_v1: { v1read: 1 } }), fetch: (u, o) => (fail ? Promise.reject(new TypeError('Failed to fetch')) : srv.fetch(u, o)) });
    fail = true; await t.api.refreshAll(); await tick(); t.api.render();
    const html = t.api.renderIdeas().html;
    check(/data-act="offline"[^>]*>📶⚠</.test(html) && [A, B].every((id) => /^class="card dim/.test(cardOf(html, id)) && cardOf(html, id).indexOf('data-k="stale"') > 0) && !t.api.S.sheet,
      'PIA-135 AC7 a failed refresh shows the 📶⚠ badge and dims the stale cards with ◷, without a sheet');
  }
  {
    // AC8 Map and Calendar show the empty-state picture while the list is empty
    const t = loadApp();
    t.api.render();
    check(/data-ghost="map"/.test(t.api.renderSelected('map', 'map').html) && /data-ghost="cal"/.test(t.api.renderSelected('calendar', 'cal').html) && t.api.renderIdeas().id === 'trips-empty',
      'PIA-135 AC8 with an empty list, Trips, Map and Calendar each show the empty-state picture with ＋');
  }

  // ═══ PIA-136: the one create path and organizer edits ═══
  section('PIA-136 create (3 steps, never prefilled from hidden state, draft kept on failure), edits, join requests, drop and ↩, v1 idea links');
  const TM = require(path.join(ROOT, 'scripts', 'trip-model.js'));
  let nSeed = 0;
  // a fixture under a fresh id, so every scenario starts from the same record
  const seedAs = (doc, f) => { const d = clone(doc); d.id = (d.id.slice(0, 16) + 'p136' + String(++nSeed).padStart(2, '0')).slice(0, 22); if (f) f(d); srv.seed(d); return d.id; };
  const act = (t, name, ds) => t.api.ACTS[name]({ dataset: ds || {} });   // a tap on a control (what the click handler calls)
  const D = (t) => (t.api.S.sheet && t.api.S.sheet.local.d) || null;
  const posts = (t, from) => t.fetches.slice(from || 0).filter((f) => f.method === 'POST').map((f) => ({ path: f.url.replace(W, '').split('?')[0], body: JSON.parse(f.body) }));
  // wait for a write the app started on its own (a caption saves as its sheet closes): no fixed number of turns
  const until = async (f, n) => { for (let i = 0; i < (n || 2000) && !f(); i++) await tick(2); return f(); };
  const boot136 = async (o) => { const t = loadApp(Object.assign({ fetch: srv.fetch }, o)); await t.api.refreshAll(true); await tick(); t.api.render(); return t; };
  const lsOf = (ids, extra) => seedLs(Object.assign({ pialax_watchlist_v2: ids.map((id, i) => ({ id, t: '', e: '', at: i + 1, pin: false, arch: false })), pialax_ui_v1: { v1read: 1 } }, extra || {}));
  const DW1 = seedAs(fx('idea-diwali.json')), TH1 = seedAs(fx('idea-tahoe.json'));
  const orgLs136 = () => lsOf([TH1, DW1], { pialax_idea_keys_v1: keyOf([DW1]), pialax_proxy_token: TOKEN, pialax_idea_me_v1: { [DW1]: 'ashwin-p8', [TH1]: 'ashwin-l2' }, pialax_ui_v1: { v1read: 1, sel: DW1 } });
  {
    // AC1 the sheet starts empty, whatever another screen shows (the dated Diwali trip view is open behind it)
    const t = await boot136({ ls: orgLs136() });
    act(t, 'open', { id: DW1 });
    const n0 = t.fetches.length;
    act(t, 'new');
    const d = D(t);
    check(t.api.S.sheet.type === 'new' && t.api.popupName(t.api.S.sheet) === 'P-new-what' && d.step === 1 && d.name === '' && d.dest === '' && d.s === '' && d.e === '' && d.pin === '' && d.scene === '🌆' && !d.kept,
      'PIA-136 AC1 ＋ opens P-new-what empty: no name, no place, no dates, the city picture, even with a dated trip open behind it (nothing comes from hidden state)', { name: d.name, dest: d.dest, s: d.s });
    check(d.preset === 'family' && eq(d.rows.map((r) => r.face + r.name + r.ap + r.n + (r.me ? '🙋' : '')), ['🌽Mom & DadPIA2', '🌴AshwinLAX1🙋', '🗽AnjoLGA1']) && d.rows.every((r) => r.preset),
      'PIA-136 AC1/AC4 step 2 starts from a visible group: 👪 (this token phone\'s trip added last is the family\'s), Anjo at LGA (after 9/1), 🙋 Ashwin from this phone\'s identity', d.rows);
    act(t, 'nnext');
    check(d.step === 1, '▶ without a name stays on step 1 (the name field pulses)');
    d.name = 'Diwali in Raleigh'; act(t, 'nscene', { v: '2' }); d.dest = 'RD';
    act(t, 'nnext');
    check(d.step === 1 && d.scene === '🪔', 'a destination cut short (2 letters) is never dropped silently: ▶ stays and its field pulses');
    d.dest = 'RDU'; act(t, 'nnext'); act(t, 'nnext');
    check(d.step === 3 && d.ym === '2026-11', 'steps 2 → 3; the date grid opens on next month (November)');
    act(t, 'nday', { v: '2026-11-06' }); act(t, 'nday', { v: '2026-11-09' }); act(t, 'npin'); act(t, 'nday', { v: '2026-11-08' });
    check(d.s === '2026-11-06' && d.e === '2026-11-09' && d.pin === '2026-11-08' && /11\/6–11\/9<\/span> · <span data-k="nights">3/.test(t.api.SHEETS.new(t.api.S.sheet)), 'tap start, tap end, 📌 then the event day: 11/6–11/9 · 3🌙 📌11/8');
    const made = await act(t, 'ncreate'); await tick();
    const cp = posts(t, n0).filter((p) => p.path === '/idea')[0], id = made && made.id;
    const keys = JSON.parse(t.ls.getItem('pialax_idea_keys_v1'));
    check(made && made.ok && cp && eq(cp.body.idea.dates, { departure: '2026-11-06', return: '2026-11-09', searchStart: '', searchEnd: '' }) && cp.body.idea.title === '🪔 Diwali in Raleigh' &&
      eq(cp.body.idea.destination, { city: 'Raleigh', airport: 'RDU' }) && cp.body.idea.notes === '📌2026-11-08' && cp.body.idea.recommendation === null &&
      eq(cp.body.idea.members.map((x) => [x.label, x.airport, x.headcount]), [['🌽 Mom & Dad', 'PIA', 2], ['🌴 Ashwin', 'LAX', 1], ['🗽 Anjo', 'LGA', 1]]),
      'PIA-136 AC1 Create: one POST /idea through createRequest (the title with its picture, the place and its city, the plan, 📌, a face on every label, no recommendation)', cp && cp.body.idea);
    check(keys[id] && /^[A-Za-z0-9_-]{32,64}$/.test(keys[id].edit_key) && keys[id].title === '🪔 Diwali in Raleigh' && eq(Object.keys(keys[id]), ['edit_key', 'title', 'created_at']) && keys[DW1].edit_key === KEY,
      'PIA-136 AC1 the edit key is kept on this phone in v1\'s format (and the keys already there are untouched)');
    const me = t.api.meFor(id), meMem = srv.read(id).idea.members.find((x) => x.code === me);
    check(t.api.S.tab === 'trips' && t.api.S.trip === id && !t.api.S.sheet && t.api.listIds().indexOf(id) >= 0 && meMem && meMem.label === '🌴 Ashwin' && JSON.parse(t.ls.getItem('pialax_me_profile_v1')).label === '🌴 Ashwin' &&
      t.api.modelOf(id).stage === 'idea' && t.api.modelOf(id).org && Object.keys(srv.read(id).responses).length === 0 && !('draft' in t.api.uiRead()),
      'PIA-136 AC1 then the trip opens (its organizer view, 💡 Idea, nobody has answered yet), listed, with 🙋 = Ashwin on this phone and as my profile; no draft is left', { trip: t.api.S.trip, me });
    check(/data-act="edit" data-id="[^"]+" aria-label="Edit" data-k="edit">✎<\/button><button class="ib" data-act="tshare"/.test(t.api.renderTrip(id).html), 'the new trip\'s view offers the organizer ✎ and 📣');
  }
  {
    // AC9 the Diwali job, step by step: each tap is dispatched to the app's own action and the state it must reach is
    // checked before the next one, so the job is done in exactly these taps (no step needs another). The 📍 field tap is
    // a tap with no action here (typing is not a tap). The rendered count, with real clicks, is test-words'.
    let shared = null, taps = 0;
    const t = await boot136({ ls: orgLs136(), navigator: { share: (o) => { shared = o; return Promise.resolve(); }, clipboard: { writeText: () => Promise.resolve() } } });
    const steps = [
      [() => act(t, 'new'), () => t.api.popupName(t.api.S.sheet) === 'P-new-what' && D(t).name === '' && D(t).preset === 'family'],
      [() => { D(t).name = 'Diwali in Raleigh'; return act(t, 'nscene', { v: '2' }); }, () => D(t).scene === '🪔' && D(t).scenePicked],
      [() => { D(t).dest = 'RDU'; }, () => D(t).dest === 'RDU'],   // the 📍 field
      [() => act(t, 'nnext'), () => D(t).step === 2 && D(t).rows.filter((r) => r.me).map((r) => r.name).join() === 'Ashwin'],
      [() => act(t, 'nnext'), () => D(t).step === 3 && D(t).ym === '2026-11'],
      [() => act(t, 'nday', { v: '2026-11-06' }), () => D(t).s === '2026-11-06' && D(t).e === ''],
      [() => act(t, 'nday', { v: '2026-11-09' }), () => D(t).e === '2026-11-09'],
      [() => act(t, 'npin'), () => D(t).pinMode],
      [() => act(t, 'nday', { v: '2026-11-08' }), () => D(t).pin === '2026-11-08' && !D(t).pinMode],
      [() => act(t, 'ncreate'), () => !t.api.S.sheet && /^[A-Za-z0-9_-]{22}$/.test(String(t.api.S.trip)) && t.api.modelOf(t.api.S.trip).org]
    ];
    const stuck = [];
    for (let i = 0; i < steps.length; i++) { taps++; await steps[i][0](); await tick(); if (!steps[i][1]()) stuck.push(i + 1); }
    const id = t.api.S.trip;
    taps++; act(t, 'tshare', { id }); await tick();
    check(stuck.length === 0 && taps === 11 && shared && shared.url === W + '/i/' + id && Object.keys(shared).length === 1 && JSON.parse(t.ls.getItem('pialax_shared_at_v1'))[id] === '2026-11-06|2026-11-09',
      'PIA-136 AC9 the Diwali job: ＋ 🪔 📍 ▶ ▶ 11/6 11/9 📌 11/8 Create, each reaching its state, then the trip\'s 📣 (11 taps in the app; the chat and Send make the spec\'s 13): 📣 hands the share sheet the guest link only, and records the plan it carried', { stuck, taps, shared });
  }
  {
    // AC1 / AC3 / AC4 a phone with no token and no trips (Priya): ＋ only; 🙋 = the first person added; a failed Create keeps the draft
    const t = loadApp({ fetch: srv.fetch, ls: seedLs({ pialax_ui_v1: { v1read: 1 } }) });
    t.api.render();
    act(t, 'new');
    const d = D(t);
    check(d.rows.length === 0 && d.preset === null && t.api.presetChips().length === 0, 'PIA-136 AC4 a phone with no token and no trips has no preset: step 2 starts with ＋ only');
    d.name = 'Tahoe ski weekend'; act(t, 'nscene', { v: '10' }); d.dest = 'RNO'; act(t, 'nnext');
    act(t, 'nnext');
    check(d.step === 2, 'no people: ▶ stays on step 2 (＋ pulses)');
    [['Priya', 'DEN'], ['Maya', 'SFO'], ['Ashwin', 'LAX'], ['Leo', 'SEA']].forEach(([n, a], i) => { act(t, 'nadd'); d.rows[i].name = n; d.rows[i].ap = a; });
    check(d.rows[0].me && d.rows.slice(1).every((r) => !r.me) && new Set(d.rows.map((r) => r.face)).size === 4, 'PIA-136 AC3 the first person on an empty sheet is 🙋 me, nobody added after; every face is a different one', d.rows.map((r) => r.face + (r.me ? '🙋' : '')));
    act(t, 'nface', { v: '1' });
    check(new Set(d.rows.map((r) => r.face)).size === 4, 'PIA-136 AC3 🙂 a face cycles to the next one nobody on the trip has');
    d.rows.forEach((r) => { r.me = false; }); act(t, 'nnext');
    check(d.step === 2, 'PIA-136 AC3 with no 🙋 the sheet refuses to continue (▶ stays; the 🙋 column pulses)');
    act(t, 'nme', { v: '0' }); d.rows[2].name = 'Me'; act(t, 'nnext');
    check(d.step === 2 && d.ed === 2, 'a person named "Me" (v1\'s nameless word) is refused: their row opens for a real name');
    d.rows[2].name = 'Ashwin'; act(t, 'nnext');
    check(d.step === 3, '🙋 Priya: on to step 3');
    act(t, 'nday', { v: '2026-11-27' }); act(t, 'nday', { v: '2026-11-30' });
    srv.failNext = 'network';
    const r1 = await act(t, 'ncreate'); await tick();
    const kept = t.api.uiRead().draft;
    check(!r1.ok && d.failed === 'network' && t.api.S.sheet && t.api.S.sheet.type === 'new' && /aria-label="Retry">⚠ ↻<\/button>/.test(t.api.SHEETS.new(t.api.S.sheet)) && kept && kept.name === 'Tahoe ski weekend' && kept.rows.length === 4 && kept.s === '2026-11-27' && t.api.listIds().length === 0,
      'PIA-136 AC1 a failed Create: ⚠ ↻ on Create, the sheet stays, the draft is kept (pialax_ui_v1.draft), nothing is listed', { failed: d.failed, kept: !!kept });
    t.api.closeSheet();
    act(t, 'new');
    const k = D(t);
    check(k.kept && k.step === 3 && k.name === 'Tahoe ski weekend' && k.dest === 'RNO' && k.scene === '🎿' && eq(k.rows.map((r) => r.name), ['Priya', 'Maya', 'Ashwin', 'Leo']) && k.rows[0].me && k.s === '2026-11-27' && k.e === '2026-11-30',
      'PIA-136 AC1 ＋ reopens the kept draft at Create, as it was typed (the only state ＋ ever restores)', { step: k.step, name: k.name });
    const r2 = await act(t, 'ncreate'); await tick();
    const doc = r2.ok && srv.read(r2.id);
    check(r2.ok && !('draft' in t.api.uiRead()) && doc.idea.members.map((x) => x.airport).join() === 'DEN,SFO,LAX,SEA' && t.api.meFor(r2.id) === doc.idea.members[0].code && t.api.S.trip === r2.id &&
      t.fetches.filter((f) => f.method === 'POST' && /\/idea$/.test(f.url)).length === 2,
      'the retry creates it once (the failed POST never reached the Worker) and clears the draft; 🙋 Priya is this phone', doc && doc.idea.members.map((x) => x.label));
    act(t, 'new');
    check(!D(t).kept && D(t).name === '' && D(t).step === 1, 'after a successful Create, ＋ starts empty again');
    t.api.uiSet({ draft: { name: 'x', rows: 'junk', s: 'not a day', scene: '<b>', ym: '1999-01' } });
    t.api.closeSheet(); act(t, 'new');
    check(D(t).kept && D(t).rows.length === 0 && D(t).s === '' && D(t).scene === '🌆' && D(t).ym >= '2026-10', 'a kept draft that is off-shape is cleaned as it is read (nothing junk reaches the sheet)');
    check(/data-act="ndiscard" aria-label="Discard draft"/.test(t.api.SHEETS.new(t.api.S.sheet)), 'a kept draft can be thrown away (🗑 in its header)');
    act(t, 'ndiscard');
    check(!D(t).kept && D(t).step === 1 && D(t).name === '' && !('draft' in t.api.uiRead()), '🗑 Discard draft: the sheet starts empty and nothing is kept');
  }
  {
    // AC2 any 3-letter code; an unknown one is marked, never blocks; no place at all is fine; a rough window keeps 🌙N
    const t = loadApp({ fetch: srv.fetch, ls: seedLs({ pialax_ui_v1: { v1read: 1 }, pialax_me_profile_v1: { label: '🦊 Priya' } }) });
    t.api.render();
    const run = async (dest, setup) => {
      t.api.closeSheet(); act(t, 'new');
      const d = D(t);
      d.name = 'Somewhere'; d.dest = dest;
      const html = t.api.SHEETS.new(t.api.S.sheet);
      act(t, 'nnext'); act(t, 'nadd'); d.rows[0].name = 'Priya'; d.rows[0].ap = 'DEN'; act(t, 'nnext');
      if (setup) setup(d);
      const r = await act(t, 'ncreate'); await tick();
      return { html, r, doc: r && r.ok ? srv.read(r.id) : null };
    };
    const zz = await run('ZZQ'), none = await run('');
    check(/<span id="dest-warn" class="w" data-k="unknown">📍⚠<\/span>/.test(zz.html) && zz.r.ok && eq(zz.doc.idea.destination, { city: '', airport: 'ZZQ' }) && none.r.ok && eq(none.doc.idea.destination, { city: '', airport: '' }) &&
      /<span id="dest-warn" class="w" data-k="unknown" hidden>/.test(none.html),
      'PIA-136 AC2 an unknown code (ZZQ) is marked 📍⚠ and still creates the trip (no city); an idea may start with no place at all');
    const win = await run('CUN', () => { act(t, 'nmode', { v: 'window' }); act(t, 'nday', { v: '2026-12-10' }); act(t, 'nday', { v: '2026-12-31' }); act(t, 'nnights', { v: '1' }); act(t, 'nnights', { v: '1' }); });
    check(win.r.ok && eq(win.doc.idea.dates, { departure: '', return: '', searchStart: '2026-12-10', searchEnd: '2026-12-31' }) && win.doc.idea.notes === '🌙5' && t.api.modelOf(win.r.id).undated && t.api.modelOf(win.r.id).nightsN === 5,
      'PIA-136 AC1 a rough window with nights: ⟦12/10–12/31⟧ 🌙5 (no plan dates), read back by the model as an undated idea', win.doc && win.doc.idea);
    const undated = await run('LHR', () => {});
    check(undated.r.ok && eq(undated.doc.idea.dates, { departure: '', return: '', searchStart: '', searchEnd: '' }) && undated.doc.idea.notes === '', 'dates are optional: an idea may start with none');
  }
  {
    // AC4 the 👪 preset only on the token phone; other phones offer the groups of trips they have seen
    const guest = await boot136({ ls: lsOf([B, A], { pialax_idea_me_v1: { [A]: 'anjo-z5', [B]: 'maya-s9' } }) });
    const chips = guest.api.presetChips();
    check(chips.every((c) => !c.family) && chips.length === 2 && eq(chips[0].faces, ['🌽', '🌴', '🗽']) && eq(chips[1].faces, ['🦊', '🐼', '🌴', '🐸']),
      'PIA-136 AC4 a phone without the token never offers 👪; it offers the people of the trips it has seen (Diwali\'s, Tahoe\'s), newest first', chips.map((c) => c.key));
    act(guest, 'new');
    const d = D(guest);
    check(d.preset === chips[0].key && d.rows.find((r) => r.name === 'Anjo').me && d.rows.filter((r) => r.me).length === 1, 'its pre-applied group is the latest trip\'s, with 🙋 = who this phone is on that trip (Anjo)');
    const tok = await boot136({ ls: seedLs({ pialax_proxy_token: TOKEN, pialax_ui_v1: { v1read: 1 } }) });
    const fam = tok.api.presetChips();
    check(fam.length === 1 && fam[0].family && eq(fam[0].rows.map((r) => r.ap), TM.familyPreset('', '2026-10-17').map((f) => f.airport)) && fam[0].rows.every((r) => r.preset) && fam[0].rows[2].ap === 'LGA',
      'a fresh token phone offers 👪 alone, its airports resolved for today (Anjo LGA from 9/1; Create re-resolves them against the departure)', fam[0].rows.map((r) => r.ap));
  }
  {
    // AC5 organizer edits: name, picture and place (the answered members' flights follow); not the place while 🔒
    const E1 = seedAs(fx('idea-diwali.json'));
    const ls = () => lsOf([E1], { pialax_idea_keys_v1: keyOf([E1]), pialax_idea_me_v1: { [E1]: 'ashwin-p8' } });
    const t = await boot136({ ls: ls() });
    act(t, 'open', { id: E1 }); act(t, 'edit', { id: E1 });
    const tiles = (t.api.SHEETS.edit(t.api.S.sheet).match(/data-act="(\w+)"/g) || []).map((s) => s.slice(10, -1));
    check(t.api.S.sheet.type === 'edit' && eq(tiles, ['etitle', 'epeople', 'ecap', 'ekey', 'edrop']), 'PIA-136 AC5 ✎ opens P-edit: 🏷📍 name and place, 👥 people, 📝 caption, 🔑 organizer link, 🗑 drop', tiles);
    act(t, 'etitle', { id: E1 });
    const d = D(t);
    check(t.api.popupName(t.api.S.sheet) === 'P-edit-what' && d.name === 'Diwali in Raleigh' && d.scene === '🪔' && d.dest === 'RDU' && t.api.S.sheet.back && t.api.S.sheet.back.type === 'edit', 'P-edit 🏷📍 is step 1 filled from the trip, stacked on P-edit');
    d.name = 'Diwali in Charlotte'; d.dest = 'CLT';
    const n0 = t.fetches.length;
    const r = await act(t, 'esave1'); await tick();
    const ps = posts(t, n0), doc = srv.read(E1);
    check(r.ok && ps[0].path === '/idea/update' && ps[0].body.idea.title === '🪔 Diwali in Charlotte' && eq(ps[0].body.idea.destination, { airport: 'CLT', city: 'Charlotte' }) &&
      eq(ps.slice(1).map((p) => p.path + ':' + p.body.member).sort(), ['/idea/respond:ashwin-p8', '/idea/respond:momdad-k3']) && doc.responses['momdad-k3'].status === 'in' &&
      doc.responses['ashwin-p8'].note === fx('idea-diwali.json').responses['ashwin-p8'].note && doc.idea.destination.airport === 'CLT' && !t.api.S.sheet,
      'PIA-136 AC5 a new place: one update, then one complete answer per answered member (their flights now go to CLT; answers and notes kept), and the sheets close', ps.map((p) => p.path + (p.body.member ? ':' + p.body.member : '')));
    // 🔒: the place cannot change (the field is disabled and Save leaves it alone); the name still can
    const t2 = await boot136({ ls: ls() });
    await t2.api.organizerWrite(E1, { decision: { stage: 'chosen' } }); await tick(); t2.api.render();
    act(t2, 'open', { id: E1 }); act(t2, 'edit', { id: E1 }); act(t2, 'etitle', { id: E1 });
    const d2 = D(t2), html = t2.api.SHEETS.new(t2.api.S.sheet);
    d2.dest = 'RDU'; d2.name = 'Diwali at last';
    const n1 = t2.fetches.length, r2 = await act(t2, 'esave1'); await tick();
    const up = posts(t2, n1)[0];
    check(/id="new-dest"[^>]*disabled/.test(html) && /data-k="lock">🔒/.test(html) && r2.ok && up.body.idea.destination.airport === 'CLT' && up.body.idea.title === '🪔 Diwali at last' && srv.read(E1).decision.stage === 'chosen',
      'PIA-136 AC5 while the dates are 🔒 the destination is locked (disabled, 🔒) and Save leaves it alone; the name still changes', up && up.body.idea.destination);
    // a longer name already on the trip (v1, another client) is shown whole and free (a trip name), never cut by the editor
    const longTitle = '🌊 A really long trip name that somebody typed in full because they could not stop';
    const E1b = seedAs(fx('idea-tahoe.json'), (x) => { x.idea.title = longTitle; });
    const t3 = await boot136({ ls: lsOf([E1b], { pialax_idea_keys_v1: keyOf([E1b]) }) });
    act(t3, 'edit', { id: E1b }); act(t3, 'etitle', { id: E1b });
    const h3 = t3.api.SHEETS.new(t3.api.S.sheet);
    check(D(t3).name === longTitle.slice(3) && /<div class="fld" id="fld-title" data-free>/.test(h3) && TM.capTyped(D(t3).name + ' more', D(t3).name, TM.TITLE_WORDS) === D(t3).name,
      'PIA-136 AC5 a longer existing name opens whole (marked free, as trip names are) and typing can shorten it but never adds a word past the cap');
  }
  {
    // AC3 / AC5 the people editor: stable codes, an airport change resends that member's answer, removing someone who answered asks
    // twice, and a member added on another device meanwhile survives
    const E2 = seedAs(fx('idea-diwali.json'));
    const t = await boot136({ ls: lsOf([E2], { pialax_idea_keys_v1: keyOf([E2]), pialax_idea_me_v1: { [E2]: 'ashwin-p8' } }) });
    act(t, 'open', { id: E2 }); act(t, 'edit', { id: E2 }); act(t, 'epeople', { id: E2 });
    const d = D(t);
    check(t.api.popupName(t.api.S.sheet) === 'P-edit-who' && eq(d.rows.map((r) => r.code0), ['momdad-k3', 'ashwin-p8', 'anjo-z5']) && d.rows[1].me && d.rows[0].ans && !d.rows[2].ans, 'P-edit 👥: every member with their code kept, 🙋 this phone, and who has answered');
    act(t, 'nedit', { v: '1' }); d.rows[1].ap = 'SFO';
    act(t, 'nadd'); d.rows[3].name = 'Sam Lee'; d.rows[3].ap = 'OAK';
    check(!d.rows[3].me && new Set(d.rows.map((r) => r.face)).size === 4, 'someone added in an edit is never 🙋 and gets a free face');
    act(t, 'nedit', { v: '0' }); act(t, 'ndel', { v: '0' });
    const armed = d.rows.length === 4 && d.arm === 0 && /aria-label="Remove anyway">🗑⚠<\/button>/.test(t.api.SHEETS.new(t.api.S.sheet));
    act(t, 'ndel', { v: '0' });
    check(armed && d.rows.length === 3 && d.rows.every((r) => r.code0 !== 'momdad-k3'), 'PIA-136 AC5 🗑 on Mom & Dad (they answered) first only shows ⚠; the second tap removes them (their answers go with them)');
    const late = clone(srv.read(E2)); late.idea.members.push({ code: 'priya-q1', label: '🦊 Priya', airport: 'DEN', headcount: 1 }); srv.write(late);   // meanwhile, on another device
    const n0 = t.fetches.length;
    const r = await act(t, 'esave2'); await tick();
    const ps = posts(t, n0), doc = srv.read(E2), codes = doc.idea.members.map((x) => x.code), sam = doc.idea.members.find((x) => /Sam Lee$/.test(x.label));
    check(r.ok && ps[0].path === '/idea/update' && eq(codes.slice(0, 2), ['ashwin-p8', 'anjo-z5']) && codes.indexOf('priya-q1') >= 0 && codes.indexOf('momdad-k3') < 0 && sam && sam.airport === 'OAK' && /^samlee-[a-z0-9]{2}$/.test(sam.code) &&
      !doc.responses['momdad-k3'] && doc.responses['ashwin-p8'].origin === 'SFO' && doc.responses['ashwin-p8'].status === 'in' && ps.some((p) => p.path === '/idea/respond' && p.body.member === 'ashwin-p8') && t.api.meFor(E2) === 'ashwin-p8',
      'PIA-136 AC3/AC5 one Save: codes never rewritten, Sam Lee gets a new code, Mom & Dad go (with their answer), Ashwin\'s answer is resent from SFO (his flights follow), and Priya, added elsewhere meanwhile, stays', { codes, ps: ps.map((p) => p.path) });
  }
  {
    // AC5 the caption (P-note): saved as the sheet closes; a longer v1 text asks twice and is never cut silently; guests only read it
    const longCap = Array.from({ length: 30 }, (_, i) => 'word' + i).join(' ');
    const E3 = seedAs(fx('idea-diwali.json'), (x) => { x.idea.notes = '📌2026-11-08 ' + longCap; });
    const t = await boot136({ ls: lsOf([E3], { pialax_idea_keys_v1: keyOf([E3]), pialax_idea_me_v1: { [E3]: 'ashwin-p8' } }) });
    act(t, 'open', { id: E3 });
    check(/data-act="cap" data-id="[^"]+" aria-label="Note" data-k="note"/.test(t.api.renderTrip(E3).html), 'a trip with a caption shows 📝 on its hero');
    act(t, 'cap', { id: E3 });
    let sh = t.api.S.sheet;
    const html = t.api.SHEETS.note(sh), n0 = t.fetches.length;
    check(sh.local.edit && sh.local.long && sh.local.text.split(' ').length === 20 && /<textarea id="note-text"/.test(html) && /data-k="warn">⚠<\/span> <span id="cut-note-text" class="w" data-k="warn" hidden>⚠<\/span> <span class="tn">20\/20/.test(html),
      'P-note opens the organizer\'s caption at its first 20 words, marked ⚠ (the v1 text is longer)');
    t.api.closeSheet();
    check(!t.api.S.sheet && posts(t, n0).length === 0, 'closing it unchanged sends nothing (the longer text stays as it is)');
    act(t, 'cap', { id: E3 }); sh = t.api.S.sheet;
    sh.local.text = 'Puja moved to Saturday';
    t.api.closeSheet();
    const armedOpen = t.api.S.sheet === sh && sh.local.armed && posts(t, n0).length === 0 && /data-k="close">⌄/.test(t.api.SHEETS.note(sh));
    t.api.closeSheet(); await until(() => srv.read(E3).idea.notes !== '📌2026-11-08 ' + longCap);
    const doc = srv.read(E3);
    check(armedOpen && !t.api.S.sheet && doc.idea.notes === '📌2026-11-08 Puja moved to Saturday', 'PIA-136 AC5 replacing the longer v1 text: the first ⌄ shows ⚠ and keeps the sheet, the second saves it (📌 kept): never lost silently', doc.idea.notes);
    srv.failNext = 'network';
    act(t, 'cap', { id: E3 }); t.api.S.sheet.local.text = 'Puja at 6'; t.api.closeSheet(); await until(() => t.api.S.sheet && t.api.S.sheet.type === 'error');
    const errSheet = t.api.S.sheet && t.api.S.sheet.type === 'error';
    t.api.closeSheet(); act(t, 'cap', { id: E3 });
    check(errSheet && t.api.S.sheet.local.text === 'Puja at 6' && srv.read(E3).idea.notes === '📌2026-11-08 Puja moved to Saturday', 'a caption that fails to save says so (P-error) and comes back in P-note to try again');
    t.api.closeSheet(); await until(() => /Puja at 6$/.test(srv.read(E3).idea.notes));
    const g = await boot136({ ls: lsOf([E3], { pialax_idea_me_v1: { [E3]: 'anjo-z5' } }) });
    act(g, 'cap', { id: E3 });
    const gh = g.api.SHEETS.note(g.api.S.sheet);
    check(!/textarea/.test(gh) && /<p class="notev">Puja at 6<\/p>/.test(gh) && !/data-act="edit"/.test(g.api.renderTrip(E3).html), 'a guest reads the caption (no field) and has no ✎');
  }
  {
    // AC5 the organizer link: copied for my own devices, with the warning; never handed to a share sheet. The phone HAS a
    // share sheet here (it records every call and accepts it), so a link sent to it would be caught, not fall back to copying.
    let copied = null;
    const shared = [];
    const E4 = seedAs(fx('idea-tahoe.json'));
    const t = await boot136({ navigator: { share: (o) => { shared.push(o); return Promise.resolve(); }, clipboard: { writeText: (u) => { copied = u; return Promise.resolve(); } } },
      ls: lsOf([E4], { pialax_idea_keys_v1: keyOf([E4]), pialax_proxy_token: TOKEN }) });
    act(t, 'open', { id: E4 }); act(t, 'edit', { id: E4 }); act(t, 'ekey', { id: E4 }); await tick();
    const secret = (s) => /#k=|#ks=|[#&]t=/.test(String(s)) || String(s).indexOf(TOKEN) >= 0 || String(s).indexOf(KEY) >= 0;
    check(copied === ORIGIN + '/PIALAX/?idea=' + E4 + '#k=' + KEY + '&t=' + TOKEN && /<p class="warnline">🔑⚠ Your devices only<\/p>/.test(t.api.SHEETS.edit(t.api.S.sheet)),
      'PIA-136 AC5 🔑 copies the organizer link (v1\'s <folder>/?idea=…#k=…&t=…) and P-edit then says "Your devices only"', copied);
    const afterKey = shared.length;
    t.api.closeSheet(); act(t, 'tshare', { id: E4 }); await tick();
    check(afterKey === 0 && shared.length === 1 && Object.keys(shared[0]).join() === 'url' && !secret(shared[0].url) && !secret(t.loc.href) && t.hist.calls.every((u) => !secret(u)),
      'PIA-136 AC5 with a share sheet on the phone, ✎ → 🔑 never calls it (only 📣 does, with the guest link alone); no shared, copied-elsewhere or address-bar URL carries #k=, &t=, the key or the token', { shared, href: t.loc.href });
    const legacy = seedAs(fx('idea-thanksgiving-legacy.json'));
    const lg = await boot136({ ls: lsOf([legacy], { pialax_idea_keys_v1: keyOf([legacy]) }) });
    check(lg.api.modelOf(legacy).org && lg.api.modelOf(legacy).legacy && !/data-act="edit"/.test(lg.api.renderTrip(legacy).html), 'no ✎ on an unmigrated v1 trip, even for its organizer (P-migrate comes first)');
  }
  {
    // AC7 Drop asks once, with buttons named by outcome; ↩ undoes it (a 🔒 trip comes back locked)
    const E5 = seedAs(fx('idea-tahoe.json'));
    const t = await boot136({ ls: lsOf([E5], { pialax_idea_keys_v1: keyOf([E5]), pialax_idea_me_v1: { [E5]: 'ashwin-l2' } }) });
    await t.api.organizerWrite(E5, { decision: { stage: 'chosen' } }); await tick(); t.api.render();
    act(t, 'open', { id: E5 }); act(t, 'edit', { id: E5 }); act(t, 'edrop', { id: E5 });
    const html = t.api.SHEETS.drop(t.api.S.sheet);
    check(t.api.S.sheet.type === 'drop' && /<button class="btn danger" data-act="dropyes">🗑 Drop<\/button><button class="btn pri" data-act="dropkeep">Keep<\/button>/.test(html) && srv.read(E5).decision.stage === 'chosen',
      'PIA-136 AC7 P-drop: the trip, a red-outlined 🗑 Drop and the primary Keep (nothing is sent yet)');
    act(t, 'dropkeep');
    check(t.api.S.sheet && t.api.S.sheet.type === 'edit' && srv.read(E5).decision.stage === 'chosen', 'Keep goes back to P-edit, the trip untouched');
    act(t, 'edrop', { id: E5 });
    const r = await act(t, 'dropyes'); await tick();
    check(r.ok && srv.read(E5).decision.stage === 'dropped' && !t.api.S.sheet && t.api.S.trip === null && t.api.shelfItems().some((x) => x.id === E5) && typeof t.api.S.undo === 'function',
      'PIA-136 AC7 🗑 Drop: one update (dropped), the sheets close, the trip view goes back to the list and the trip to the shelf; the toast offers ↩');
    const u = await act(t, 'undo'); await tick();
    check(u.ok && srv.read(E5).decision.stage === 'chosen' && srv.read(E5).decision.chosen.departure === '2026-11-27' && t.api.activeItems().some((x) => x.id === E5),
      'PIA-136 AC7 ↩ undoes it as it stood: the trip is back, still 🔒 on its dates');
    await t.api.organizerWrite(E5, { decision: { stage: 'dropped' } }); await tick(); t.api.render();
    act(t, 'open', { id: E5 }); act(t, 'edit', { id: E5 });
    const dt = (t.api.SHEETS.edit(t.api.S.sheet).match(/data-act="(\w+)"/g) || []).map((x) => x.slice(10, -1));
    act(t, 'etitle', { id: E5 });
    check(eq(dt, ['etitle', 'ecap', 'ekey', 'restore']) && /id="new-dest"[^>]*disabled/.test(t.api.SHEETS.new(t.api.S.sheet)),
      'a dropped trip: P-edit offers its name, caption, organizer link and ↩ (no people and no place: a closed trip takes no answers to resync)', dt);
    t.api.closeSheet();
  }
  {
    // AC6 a join request opens the people editor prefilled on the organizer's phone; one Save adds the person. Elsewhere it does nothing.
    const E6 = seedAs(fx('idea-tahoe.json'));
    const url = TM.joinLink(ORIGIN + '/PIALAX/app.html', E6, 'Sam', 'OAK');
    const t = loadApp({ url, fetch: srv.fetch, ls: lsOf([E6], { pialax_idea_keys_v1: keyOf([E6]), pialax_idea_me_v1: { [E6]: 'priya-d4' } }) });
    await t.api.refreshAll(true); await tick();
    const sh = t.api.S.sheet, d = sh && sh.local.d;
    check(sh && t.api.popupName(sh) === 'P-edit-who' && d.ed === 4 && d.rows[4].name === 'Sam' && d.rows[4].ap === 'OAK' && !d.rows[4].me && t.loc.search === '?idea=' + E6 && t.api.S.trip === E6,
      'PIA-136 AC6 ?idea=<id>&add=Sam.OAK on the organizer\'s phone: the trip opens with the people editor, Sam (OAK) added and open; ?add leaves the address bar', d && d.rows.map((r) => r.name));
    const n0 = t.fetches.length;
    const r = await act(t, 'esave2'); await tick();
    const doc = srv.read(E6), sam = doc.idea.members.find((x) => / Sam$/.test(x.label));
    check(r.ok && posts(t, n0).length === 1 && sam && sam.airport === 'OAK' && doc.idea.members.length === 5 && !t.api.S.sheet, 'one Save adds Sam (one update; nobody else\'s answer is touched)', doc.idea.members.map((x) => x.label));
    const g = loadApp({ url, fetch: srv.fetch, ls: lsOf([E6], { pialax_idea_me_v1: { [E6]: 'maya-s9' } }) });
    await g.api.refreshAll(true); await tick();
    check(!g.api.S.sheet && g.api.S.trip === E6 && g.loc.search === '?idea=' + E6, 'the same link on a phone without the trip\'s key just opens the trip (and drops ?add)');
    const again = loadApp({ url, fetch: srv.fetch, ls: lsOf([E6], { pialax_idea_keys_v1: keyOf([E6]) }) });
    await again.api.refreshAll(true); await tick();
    check(again.api.S.sheet && D(again).rows.length === 5 && D(again).ed === null, 'a join request for someone already on the trip adds nobody');
    const L = t.api.readLink('?add=Sam.OAK', '', '/');
    check(L.join === null && eq(L.drop, ['add']) && t.api.readLink('?idea=' + E6 + '&add=Me.LAX', '', '/').join === null, 'without ?idea= (or for the name Me) there is no join request; ?add is still consumed');
  }
  {
    // AC8 v1's read-only ?tripIdea= link (built here by v1's own encoder) opens a prefilled create sheet; a broken one says so
    const v1 = loadApi(path.join(ROOT, 'pialax-mobile.html'), 'pialax-mobile.html', ['serializeTripIdeaSharePayload', 'encodeTripIdeaSharePayload', 'createTripIdeaBuilderState'], { console: QUIET }).api;
    const builder = v1.createTripIdeaBuilderState({ destination: { city: 'Raleigh-Durham', airport: 'RDU' }, dates: { departure: '2026-11-06', return: '2026-11-09' }, constraints: { eventDate: '2026-11-08' } });
    const raw = v1.encodeTripIdeaSharePayload(v1.serializeTripIdeaSharePayload(builder, { airport: 'RDU', city: 'Raleigh-Durham', departure: '2026-11-06', return: '2026-11-09', totalFare: 955 }, { notes: 'Puja Sunday', timestamp: '2026-10-01T00:00:00.000Z' }));
    const sp = new URLSearchParams(); sp.set('tripIdea', raw);
    const t = loadApp({ url: BASE + '?' + sp.toString(), ls: seedLs({ pialax_ui_v1: { v1read: 1 } }) });
    const d = D(t);
    check(t.api.S.sheet && t.api.popupName(t.api.S.sheet) === 'P-new-what' && d.name === 'Raleigh-Durham' && d.dest === 'RDU' && d.s === '2026-11-06' && d.e === '2026-11-09' && d.pin === '2026-11-08' && d.caption === 'Puja Sunday' && t.loc.search === '' && t.api.listIds().length === 0 &&
      JSON.stringify(d).indexOf('955') < 0,
      'PIA-136 AC8 a v1 ?tripIdea= link (v1\'s own encoder) opens P-new-what filled from it (place, plan, event day, note; never its price); nothing is created yet, and the link is read once', d && { name: d.name, dest: d.dest, s: d.s });
    const bad = loadApp({ url: BASE + '?tripIdea=not-a-payload', ls: seedLs({ pialax_ui_v1: { v1read: 1 } }) });
    check(bad.api.S.sheet && bad.api.S.sheet.type === 'error' && bad.api.S.sheet.p.code === 'bad_id', 'a broken ?tripIdea= says "Link broken" (by code)');
  }
  {
    // AC9 the word guard on P-new-who with 8 long names: 1-word chips with their codes; the open row keeps its full value
    const t = loadApp({ ls: seedLs({ pialax_ui_v1: { v1read: 1 } }) });
    const m8 = t.api.tripModel(fx('idea-8members.json'), { today: '2026-10-17', now: NOW });
    const rows = m8.members.map((x) => ({ face: x.face, name: x.name, ap: x.airport, n: x.headcount, me: false, preset: '' }));
    const Dx = { rows, ed: null, edit: false }, Dy = { rows, ed: 0, edit: true };
    const wide = { rows: rows.map((r) => Object.assign({}, r, { name: 'Ana Maria Lopez', ap: 'ABC' })), ed: 0, edit: true };
    const six = { rows: wide.rows.slice(0, 6), ed: 0, edit: true };
    check(t.api.whoMode(Dx, 20) === 'one' && t.api.whoWords(Dx, 'one') === 16 && t.api.whoWords(Dy, t.api.whoMode(Dy, 19)) <= 19 && t.api.whoWords(wide, t.api.whoMode(wide, 19)) <= 19 &&
      t.api.whoMode(six, 19) === 'short' && t.api.whoWords(six, 'short') === 19,
      'PIA-136 AC9 eight long names: 1-word chips with codes (16 words); with a 3-word name open in the edit sheet still ≤19 (+ Save = 20); six 3-word names keep 2 words each (19)',
      [t.api.whoWords(Dx, 'one'), t.api.whoWords(wide, t.api.whoMode(wide, 19)), t.api.whoMode(six, 19)]);
  }
  // ── the people editor sends only its own changes, against the real Worker ──
  const orgOf = (id, me) => lsOf([id], { pialax_idea_keys_v1: keyOf([id]), pialax_idea_me_v1: me ? { [id]: me } : {} });
  const editPeople = async (id, me) => { const t = await boot136({ ls: orgOf(id, me) }); act(t, 'open', { id }); act(t, 'edit', { id }); act(t, 'epeople', { id }); return t; };
  const DWL = fx('idea-diwali.json').idea.members.map((x) => x.label);
  {
    // an airport-only change for someone who answered: one update, then their answer resent from the new airport
    const E = seedAs(fx('idea-diwali.json')), t = await editPeople(E, 'ashwin-p8'), d = D(t);
    act(t, 'nedit', { v: '1' }); d.rows[1].ap = 'SFO';
    const n0 = t.fetches.length, r = await act(t, 'esave2'); await tick();
    const ps = posts(t, n0), doc = srv.read(E);
    check(r && r.ok && ps.length === 2 && ps[0].path === '/idea/update' && ps[1].path === '/idea/respond' && ps[1].body.member === 'ashwin-p8' && ps[1].body.origin === '' &&
      doc.idea.members[1].airport === 'SFO' && doc.responses['ashwin-p8'].origin === 'SFO' && eq(doc.idea.members.map((x) => x.label), DWL) && !t.api.S.sheet,
      'PIA-136 AC5 an airport-only change (Ashwin LAX → SFO, nothing else touched) is saved: one update, then his answer resent from SFO; every label as it was', ps.map((p) => p.path + (p.body.member ? ':' + p.body.member + '/' + p.body.origin : '')));
  }
  {
    // a member changed on another device meanwhile (Anjo moved to JFK and renamed): a Save of Ashwin's ×2 alone keeps it
    const E = seedAs(fx('idea-diwali.json')), t = await editPeople(E, 'ashwin-p8');
    const late = clone(srv.read(E)); late.idea.members[2].airport = 'JFK'; late.idea.members[2].label = '🗽 Anjo K'; srv.write(late);
    act(t, 'nedit', { v: '1' }); act(t, 'ncount', { v: '1' });
    const r = await act(t, 'esave2'); await tick();
    const doc = srv.read(E);
    check(r && r.ok && doc.idea.members[1].headcount === 2 && doc.idea.members[2].airport === 'JFK' && doc.idea.members[2].label === '🗽 Anjo K' && doc.idea.members[0].label === DWL[0],
      'PIA-136 AC3 a member changed on another device meanwhile keeps that change when this phone saves only Ashwin\'s ×2 (an untouched member goes back as their code alone)', doc.idea.members.map((x) => x.label + ' ' + x.airport + ' ×' + x.headcount));
  }
  {
    // a new row took a face; someone added on another device meanwhile with that same face keeps it
    const E = seedAs(fx('idea-diwali.json')), t = await editPeople(E, 'ashwin-p8'), d = D(t);
    act(t, 'nadd'); d.rows[3].name = 'Sam'; d.rows[3].ap = 'OAK';
    const samFace = d.rows[3].face;
    const late = clone(srv.read(E)); late.idea.members.push({ code: 'priya-q1', label: samFace + ' Priya', airport: 'DEN', headcount: 1 }); srv.write(late);
    const r = await act(t, 'esave2'); await tick();
    const doc = srv.read(E), faces = doc.idea.members.map((x) => TM.splitLabel(x.label).face), pr = doc.idea.members.find((x) => x.code === 'priya-q1'), sam = doc.idea.members.find((x) => / Sam$/.test(x.label));
    check(r && r.ok && pr && pr.label === samFace + ' Priya' && sam && TM.splitLabel(sam.label).face !== samFace && new Set(faces).size === faces.length && doc.idea.members.length === 5 && eq(doc.idea.members.slice(0, 3).map((x) => x.label), DWL),
      'PIA-136 AC3 a member added on another device meanwhile keeps their face (' + samFace + ' Priya) though this Save\'s new row (Sam) had taken it: Sam gets a free one; faces stay unique, kept labels verbatim', doc.idea.members.map((x) => x.label));
  }
  {
    // a 4-word name already on the trip (another client) never blocks an unrelated change; a typed one still cannot pass 3
    const E = seedAs(fx('idea-tahoe.json'), (x) => { x.idea.members.push({ code: 'mary-v1', label: '🐙 Mary Ann Van Dyke', airport: 'BOS', headcount: 1 }); });
    const t = await editPeople(E, 'priya-d4'), d = D(t);
    act(t, 'nedit', { v: '3' }); d.rows[3].ap = 'PDX';
    const r = await act(t, 'esave2'); await tick();
    const doc = srv.read(E);
    const t2 = await editPeople(E, 'priya-d4'), d2 = D(t2);
    act(t2, 'nedit', { v: '0' }); d2.rows[0].name = 'Priya Ann Van Dyke';
    const r2 = act(t2, 'esave2');
    check(r && r.ok && doc.idea.members[3].airport === 'PDX' && doc.idea.members[4].label === '🐙 Mary Ann Van Dyke' && r2 === null && d2.ed === 0 && t2.api.S.sheet && t2.api.S.sheet.type === 'new',
      'PIA-136 AC5 a 4-word name already on the trip never blocks a Save: Leo\'s new airport is saved and Mary\'s label goes back verbatim; a name typed past 3 words is still refused (its row opens)', doc.idea.members.map((x) => x.label));
    act(t2, 'nedit', { v: '4' }); d2.rows[4].name = ''; act(t2, 'nedit', { v: '1' });
    check(d2.rows.length === 5 && d2.rows[4].name === 'Mary Ann Van Dyke', 'clearing a member\'s name never removes them (only 🗑 does, asking again when they answered): the name comes back');
    // the same group on ＋: Mary's name came from a trip, so the new trip takes it as it is
    const t3 = await boot136({ ls: lsOf([E], { pialax_idea_me_v1: { [E]: 'priya-d4' } }) });
    act(t3, 'new'); D(t3).name = 'Reunion'; act(t3, 'nnext'); act(t3, 'nnext');
    const s3 = D(t3) && D(t3).step, r3 = await act(t3, 'ncreate'); await tick();
    const mary = r3 && r3.ok ? srv.read(r3.id).idea.members.find((x) => /Mary/.test(x.label)) : null;
    check(s3 === 3 && mary && mary.label === '🐙 Mary Ann Van Dyke', 'PIA-136 AC4 a group from another trip with a 4-word name (Mary Ann Van Dyke) creates a trip with her name as it is: never refused, never cut', mary);
  }
  {
    // a Save whose update lands and whose airport-sync answer drops: ⚠ ↻ sends exactly what is owed (nobody added twice)
    const E = seedAs(fx('idea-diwali.json')), t = await editPeople(E, 'ashwin-p8'), d = D(t);
    act(t, 'nedit', { v: '1' }); d.rows[1].ap = 'SFO'; act(t, 'nadd'); d.rows[3].name = 'Sam'; d.rows[3].ap = 'OAK';
    srv.failOn = '/idea/respond';
    const r1 = await act(t, 'esave2'); await tick();
    const mid = srv.read(E), sh1 = t.api.S.sheet, html1 = sh1 && t.api.SHEETS.new(sh1), owed = clone(t.api.OWED[E] ? t.api.OWED[E].codes : null);
    const coded = D(t) ? D(t).rows.map((x) => !!x.code0) : [];
    const n0 = t.fetches.length, r2 = await act(t, 'esave2'); await tick();
    const ps = posts(t, n0), doc = srv.read(E), m = t.api.modelOf(E);
    check(r1 && !r1.ok && r1.updated && mid.idea.members[1].airport === 'SFO' && mid.idea.members.length === 4 && mid.responses['ashwin-p8'].origin === 'LAX' && sh1 && /aria-label="Retry">⚠ ↻<\/button>/.test(html1) && eq(owed, ['ashwin-p8']) &&
      coded.length === 4 && coded.every(Boolean),
      'PIA-136 a Save whose update lands but whose airport-sync answer drops: ⚠ ↻ stays, the editor is the trip as it now is (Sam has his code), and Ashwin\'s answer is owed (the record still reads LAX)', { r1, owed });
    check(r2 && r2.ok && ps.length === 1 && ps[0].path === '/idea/respond' && ps[0].body.member === 'ashwin-p8' && ps[0].body.origin === '' && doc.responses['ashwin-p8'].origin === 'SFO' &&
      m.members[1].override === '' && !t.api.OWED[E] && !t.api.S.sheet && doc.idea.members.length === 4,
      'PIA-136 ↻ then sends just the owed answer, from SFO (no second update, Sam not added twice); the model reads no override and the sheet closes', ps.map((p) => p.path));
  }
  {
    // a destination change that lands without its answers: ↻ on P-edit-what sends them (nothing else changed)
    const E = seedAs(fx('idea-diwali.json')), t = await boot136({ ls: orgOf(E, 'ashwin-p8') });
    act(t, 'open', { id: E }); act(t, 'edit', { id: E }); act(t, 'etitle', { id: E }); D(t).dest = 'CLT';
    srv.failOn = '/idea/respond';
    const r1 = await act(t, 'esave1'); await tick();
    const n0 = t.fetches.length, r2 = await act(t, 'esave1'); await tick();
    const ps = posts(t, n0), doc = srv.read(E);
    check(r1 && !r1.ok && r2 && r2.ok && ps.length === 2 && ps.every((p) => p.path === '/idea/respond') && eq(ps.map((p) => p.body.member).sort(), ['ashwin-p8', 'momdad-k3']) && doc.idea.destination.airport === 'CLT' && !t.api.S.sheet,
      'PIA-136 a new place that lands without its answers: ↻ sends the answers it still owes (both answered members, to CLT), not "nothing changed"', ps.map((p) => p.path + ':' + p.body.member));
  }
  {
    // a join request on a full trip: the joiner is shown, ⚠ 9/8, and Save waits until someone is removed
    const E = seedAs(fx('idea-8members.json'));
    const t = loadApp({ url: TM.joinLink(ORIGIN + '/PIALAX/', E, 'Nina', 'BOS'), fetch: srv.fetch, ls: lsOf([E], { pialax_idea_keys_v1: keyOf([E]), pialax_idea_me_v1: { [E]: 'grandmajosephine-nf' } }) });
    await t.api.refreshAll(true); await tick();
    const d = D(t), html = d ? t.api.SHEETS.new(t.api.S.sheet) : '', d0 = d && { n: d.rows.length, last: d.rows[8] && d.rows[8].name, ed: d.ed };
    const n0 = t.fetches.length, r0 = act(t, 'esave2'); await tick();
    const sent0 = t.fetches.length - n0;
    act(t, 'ndel', { v: '5' });   // Guadalupe has not answered
    const r = await act(t, 'esave2'); await tick();
    const doc = srv.read(E);
    check(d0 && d0.n === 9 && d0.last === 'Nina' && d0.ed === 8 && /id="who-cap"[^>]*><span class="w" data-k="warn">⚠<\/span> <span class="tn">9\/8/.test(html) && /data-act="esave2" aria-disabled="true" data-why="1">Save/.test(html) && r0 === null && sent0 === 0,
      'PIA-136 AC6 a join request on a full trip (8 people): Nina is added and open, the sheet shows ⚠ 9/8 and Save waits (nothing is sent): the request is never dropped silently', d0);
    check(r && r.ok && doc.idea.members.length === 8 && doc.idea.members.some((x) => / Nina$/.test(x.label) && x.airport === 'BOS') && !doc.idea.members.some((x) => x.code === 'guadalupehernndezvillanueva-5m'),
      'removing someone makes room: one Save adds Nina (BOS)', doc.idea.members.map((x) => x.label));
  }
  {
    // a join request that also names ?tab=map is still acted on
    const E = seedAs(fx('idea-tahoe.json'));
    const t = loadApp({ url: TM.joinLink(BASE, E, 'Sam', 'OAK') + '&tab=map', fetch: srv.fetch, ls: lsOf([E], { pialax_idea_keys_v1: keyOf([E]) }) });
    await t.api.refreshAll(true); await tick();
    check(t.api.S.sheet && t.api.popupName(t.api.S.sheet) === 'P-edit-who' && D(t).rows[D(t).ed].name === 'Sam' && t.api.S.tab === 'trips' && t.api.S.trip === E && !/add=|tab=/.test(t.loc.search),
      'PIA-136 AC6 a join request with ?tab=map is still acted on: the trip view comes forward with the people editor, Sam open; both params leave the address bar', { tab: t.api.S.tab, search: t.loc.search });
  }
  {
    // a Save that would make 9 because someone was added meanwhile: the editor is rebuilt from the record, with the cap
    const E = seedAs(fx('idea-8members.json'), (x) => { x.idea.members.splice(5, 1); delete x.responses['guadalupehernndezvillanueva-5m']; });
    const t = await editPeople(E, 'grandmajosephine-nf'), d = D(t);
    act(t, 'nadd'); d.rows[7].name = 'Zed'; d.rows[7].ap = 'MIA';
    const late = clone(srv.read(E)); late.idea.members.push({ code: 'yuki-q2', label: '🦄 Yuki', airport: 'SFO', headcount: 1 }); srv.write(late);
    const n0 = t.fetches.length, r = await act(t, 'esave2'); await tick();
    const html = t.api.SHEETS.new(t.api.S.sheet), sent = posts(t, n0).length, r2 = act(t, 'esave2');
    const re = { n: d.rows.length, failed: d.failed, names: d.rows.map((x) => x.name), yuki: d.rows[7] && d.rows[7].code0 };
    act(t, 'ndel', { v: '3' }); act(t, 'ndel', { v: '3' });   // Sam Lee (SEA) answered: two taps
    const r3 = await act(t, 'esave2'); await tick();
    const doc = srv.read(E);
    check(r && !r.ok && re.n === 9 && !re.failed && re.names[7] === 'Yuki' && re.yuki === 'yuki-q2' && re.names[8] === 'Zed' && /9\/8/.test(html) && !/⚠ ↻/.test(html) && r2 === null && sent === 0,
      'PIA-136 a Save that would make 9 (Yuki was added on another device meanwhile): nothing is sent; the editor now shows everyone, Yuki included, with ⚠ 9/8 instead of a ⚠ ↻ that fails on every try', re);
    check(r3 && r3.ok && doc.idea.members.length === 8 && doc.idea.members.some((x) => x.code === 'yuki-q2') && doc.idea.members.some((x) => / Zed$/.test(x.label)) && !doc.idea.members.some((x) => x.code === 'samlee-kz'),
      'removing someone (twice: he answered), then Save: Zed joins and Yuki stays', doc.idea.members.map((x) => x.label));
  }
  // ── the create sheet ──
  {
    // 👪 is date-aware: a token phone whose today is 8/1 creates 8/20 (Anjo JAX), 9/10 (LGA) and an undated idea (JAX)
    CLOCK = Date.UTC(2026, 7, 1, 19, 0, 0);
    const t = await boot136({ ls: seedLs({ pialax_proxy_token: TOKEN, pialax_ui_v1: { v1read: 1 } }) });
    const chips = t.api.presetChips();
    const mk = async (name, s, e) => {
      t.api.closeSheet(); act(t, 'new'); const d = D(t);
      d.name = name; act(t, 'nnext'); act(t, 'nme', { v: '1' }); act(t, 'nnext');
      if (s) { act(t, 'nday', { v: s }); act(t, 'nday', { v: e }); }
      const r = await act(t, 'ncreate'); await tick();
      const a = r && r.ok ? srv.read(r.id).idea.members.find((x) => / Anjo$/.test(x.label)) : null;
      return a ? a.airport : null;
    };
    const aug = await mk('Labor Day', '2026-08-20', '2026-08-23'), sep = await mk('Fall visit', '2026-09-10', '2026-09-13'), idea = await mk('Someday', '', '');
    CLOCK = NOW;
    check(chips.length === 1 && chips[0].family && chips[0].rows[2].ap === 'JAX' && aug === 'JAX' && sep === 'LGA' && idea === 'JAX',
      'PIA-136 AC4 👪 is date-aware: on 8/1 the chip shows Anjo at JAX, and Create re-resolves her against the departure — 8/20 JAX, 9/10 LGA, an undated idea JAX (today)', { chip: chips[0] && chips[0].rows.map((r) => r.ap), aug, sep, idea });
  }
  {
    // a kept draft whose start has passed reopens with no dates
    const t = loadApp({ ls: seedLs({ pialax_ui_v1: { v1read: 1, draft: { name: 'Old plan', scene: '🎿', rows: [{ face: '🦊', name: 'Priya', ap: 'DEN', n: 1, me: true }], s: '2026-10-10', e: '2026-10-20', pin: '2026-10-12', mode: 'dates', ym: '2026-10', caption: '' } } }) });
    act(t, 'new'); const d = D(t);
    check(d.kept && d.name === 'Old plan' && d.s === '' && d.e === '' && d.pin === '' && d.ym >= '2026-10' && !/aria-pressed="true"[^>]*><span class="dn">/.test(t.api.SHEETS.new(t.api.S.sheet)),
      'PIA-136 AC1 a kept draft whose start has passed reopens with no dates and no 📌: a day the picker cannot choose is never restored', { s: d.s, e: d.e, pin: d.pin });
  }
  {
    // v1's note is on the sheet: 📝 (⚠ when cut) opens it, and Create posts exactly what was shown
    const words40 = Array.from({ length: 40 }, (_, i) => 'spark' + i).join(' ');
    const linkWith = (notes) => {
      const p = { version: 'trip-idea-v1', builder: { destination: { city: 'Raleigh-Durham', airport: 'RDU' }, dates: { departure: '2026-11-06', return: '2026-11-09' }, constraints: { eventDate: '2026-11-08' } },
        recommendation: { airport: 'RDU', city: 'Raleigh-Durham', departure: '2026-11-06', return: '2026-11-09', totalFare: 955 }, notes };
      const sp = new URLSearchParams(); sp.set('tripIdea', Buffer.from(encodeURIComponent(JSON.stringify(p)), 'binary').toString('base64'));
      return BASE + '?' + sp.toString();
    };
    const toWhen = (t) => { act(t, 'nnext'); act(t, 'nadd'); D(t).rows[0].name = 'Priya'; D(t).rows[0].ap = 'DEN'; act(t, 'nnext'); };
    const t = loadApp({ url: linkWith(words40), fetch: srv.fetch, ls: seedLs({ pialax_ui_v1: { v1read: 1 } }) });
    const d = D(t), what = t.api.SHEETS.new(t.api.S.sheet);
    act(t, 'nnote'); const ns = t.api.S.sheet, nh = t.api.SHEETS.note(ns), shown = ns.local.text;
    act(t, 'sh-back');
    toWhen(t);
    const when = t.api.SHEETS.new(t.api.S.sheet);
    const r = await act(t, 'ncreate'); await tick();
    const doc = r && r.ok ? srv.read(r.id) : null;
    const chip = /data-act="nnote" aria-label="Note" data-k="note">📝<span class="w">⚠<\/span><\/button>/;
    check(d.captionCut && TM.wordsIn(d.caption) === 20 && chip.test(what) && chip.test(when) && ns.type === 'note' && t.api.popupName(ns) === 'P-note' && /<textarea id="note-text"[^>]*>spark0 spark1 /.test(nh) &&
      TM.wordsIn(shown) === 20 && /<span class="w" data-k="warn">⚠<\/span> <span id="cut-note-text"/.test(nh) && doc && doc.idea.notes === '📌2026-11-08 ' + shown,
      'PIA-136 AC8 a v1 link\'s note is on the sheet, never hidden: 📝⚠ on P-new-what and P-new-when opens it (its first 20 words, ⚠: v1\'s 40 were cut), and Create posts exactly what was shown', doc && doc.idea.notes);
    const t2 = loadApp({ url: linkWith('Bring the sparklers'), fetch: srv.fetch, ls: seedLs({ pialax_ui_v1: { v1read: 1 } }) });
    act(t2, 'nnote'); t2.api.S.sheet.local.text = 'Bring the sparklers and cake'; act(t2, 'sh-back');
    const edited = D(t2).caption;
    act(t2, 'nnote'); act(t2, 'nnoteclr'); act(t2, 'sh-back');
    const what2 = t2.api.SHEETS.new(t2.api.S.sheet);
    toWhen(t2);
    const r2 = await act(t2, 'ncreate'); await tick();
    const doc2 = r2 && r2.ok ? srv.read(r2.id) : null;
    check(edited === 'Bring the sparklers and cake' && !/data-act="nnote"/.test(what2) && doc2 && doc2.idea.notes === '📌2026-11-08',
      'the note can be changed or cleared before Create (‹ takes it back to the sheet); cleared, the trip is created with none', doc2 && doc2.idea.notes);
  }
  {
    // screen-reader names: the step, whose 🙋, and the headcount's value
    const t = loadApp({ ls: seedLs({ pialax_ui_v1: { v1read: 1 } }) });
    act(t, 'new'); const d = D(t); const n1 = t.api.sheetName(t.api.S.sheet);
    d.name = 'X'; act(t, 'nnext');
    const n2 = t.api.sheetName(t.api.S.sheet);
    act(t, 'nadd'); d.rows[0].name = 'Priya Shah'; act(t, 'nadd'); d.rows[1].name = 'Leo'; d.rows[1].n = 2;
    const h = t.api.SHEETS.new(t.api.S.sheet);
    check(n1 === 'New trip, step 1 of 3' && n2 === 'New trip, step 2 of 3' && /aria-label="Me: Priya Shah" data-lbl="Me"/.test(h) && /aria-label="Me: Leo" data-lbl="Me"/.test(h) && /aria-label="Headcount 2" data-lbl="Headcount" data-k="count">×2/.test(h),
      'PIA-136 a screen reader hears the create step ("New trip, step 2 of 3"), whose 🙋 each toggle is ("Me: Priya Shah"), and the headcount\'s value ("Headcount 2"); long-press labels stay "Me" and "Headcount"', [n1, n2]);
  }
  {
    // an unsent create closed by mistake (⌄, the scrim, Back) comes back with the toast's ↩; nothing is stored
    const t = loadApp({ ls: seedLs({ pialax_ui_v1: { v1read: 1 } }) });
    act(t, 'new'); const d = D(t); d.name = 'Tahoe'; d.dest = 'RNO'; act(t, 'nnext');
    t.api.closeSheet();
    const undo = typeof t.api.S.undo === 'function', stored = 'draft' in t.api.uiRead();
    act(t, 'undo');
    const back = D(t);
    t.api.closeSheet(); act(t, 'new');
    const fresh = D(t);
    t.api.closeSheet();
    check(undo && !stored && back === d && back.step === 2 && back.name === 'Tahoe' && back.dest === 'RNO' && fresh !== d && fresh.name === '' && typeof t.api.S.undo !== 'function',
      'PIA-136 closing an unsent create keeps nothing, but the toast\'s ↩ brings it back as it was (step 2, Tahoe, RNO); ＋ still starts empty; an empty sheet closes with no ↩', { undo, stored, step: back && back.step });
  }
  {
    // a Create still in flight when its sheet is closed and another opened: the trip is listed, the other sheet stays
    const t = loadApp({ fetch: srv.fetch, ls: seedLs({ pialax_ui_v1: { v1read: 1 } }) });
    act(t, 'new'); const d = D(t); d.name = 'Busy'; act(t, 'nnext'); act(t, 'nadd'); d.rows[0].name = 'Priya'; act(t, 'nnext');
    const hold = deferred(); srv.hold = hold.p;
    const p = act(t, 'ncreate');
    t.api.closeSheet(); act(t, 'key');
    srv.hold = null; hold.res(); const r = await p; await tick();
    check(r && r.ok && t.api.S.sheet && t.api.S.sheet.type === 'key' && t.api.listIds().indexOf(r.id) >= 0 && t.api.S.trip !== r.id,
      'PIA-136 a Create that lands after its sheet was closed and ⓘ opened: the trip is listed, ⓘ stays open (it is never thrown away)', { sheet: t.api.S.sheet && t.api.S.sheet.type });
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

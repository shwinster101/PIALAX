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
const MAP_DATA = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
const MAP_SCRIPTS = ['https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js'];
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
  'sheetName', 'OWED',
  // PIA-137
  'whoFor', 'meCode', 'listEntry', 'sharePulse', 'faceCheck',
  // PIA-138
  'flushSoon', 'SOON_MS', 'soonResume', 'soonReplay', 'SOON_KEEP_MS',
  // PIA-139
  'bookOut', 'bookAway', 'bookBack', 'invited', 'INVITE_MS', 'onTyped', 'saveTimes', 'lanesHTML', 'paidRow',
  // PIA-139 fix pass
  'TIMES_PULSE_MS', 'LEAVE_MS', 'RET_KEY', 'bookResume', 'flushTimes', 'timesHold', 'timesLeft', 'typedOf', 'pickupChip', 'paidDoor', 'keyLabel', 'keyPages',
  // PIA-140
  'runSearch', 'accountSync', 'lockNow', 'readQuota', 'spentRead', 'absorbV1Fares', 'totalRow', 'fareRows', 'spendBtn', 'cardHTML', 'peopleBoard', 'renderSheet',
  // PIA-142
  'renderFamily', 'famBoard', 'FAM_PER',
  // PIA-152
  'BUILD', 'MIG_PULSE_MS', 'MIG_SPENT', 'migPulse',
  // PIA-153
  'MIG_LIST', 'needsUpdate', 'mineVsPlan', 'transferRead',
  // PIA-154 fix pass
  'whoChip', 'personKeys', 'tapKeys',
  // PIA-155
  'primaryAction', 'removeHeld', 'migInvite', 'priceShown', 'unpricedOf', 'priceWho',
  // PIA-156
  'LEG_GLYPH', 'TK_ON',
  // PIA-157
  'ridesOf', 'rideChanged', 'rides', 'rideEvents', 'shareLink', 'timesTell', 'slotHTML', 'whoKey'];

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
  // PIA-138: o.rec = selectors whose innerHTML writes are kept (el.__rec.html), so a case can read what a render drew
  const rec = {};
  (o.rec || []).forEach((s) => { rec[s] = recEl(); });
  // PIA-140 o.qs(selector): an element of the case's own for that selector (null: the usual one), e.g. a #screen that throws
  const doc = Object.assign({}, shim.document, { visibilityState: o.hidden ? 'hidden' : 'visible' },
    o.rec || o.qs ? { querySelector: (s) => ((o.qs && o.qs(s)) || rec[s] || shim.document.querySelector(s)) } : {});
  const ss = o.ss || makeLocalStorage();   // PIA-139: a tab's sessionStorage can outlive its page (a page the phone discarded)
  const over = {
    localStorage: ls, sessionStorage: ss, location: loc, history: hist, Date: FixedDate, document: doc,
    fetch: (url, opts) => { fetches.push({ url: String(url), method: (opts && opts.method) || 'GET', headers: Object.assign({}, (opts && opts.headers) || {}), body: opts && opts.body, keepalive: !!(opts && opts.keepalive) }); return fetchImpl(url, opts); },
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return { unref() {} }; },
    // every re-render the store asks for is queued here (and run with flush()), so a case can count them
    requestAnimationFrame: (f) => { frames.push(f); return frames.length; },
    navigator: o.navigator || { userAgent: 'test-app', clipboard: { writeText: () => Promise.resolve() } }
  };
  const { api, missing } = loadApi(APP, 'app.html', EXPECT, over);
  const flush = () => { const n = frames.length; frames.splice(0).forEach((f) => f()); return n; };
  return { api, missing, ls, loc, hist, fetches, timers, ss, frames, flush, rec, doc };
}
// an element stub (as harness.js's: every property and call chains back to it) that keeps what is written to innerHTML
function recEl() {
  const html = [];
  const p = new Proxy(function stub() {}, {
    get(t, k) {
      if (k === '__rec') return { html };
      if (k === 'innerHTML') return html.length ? html[html.length - 1] : '';
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.iterator) return function* () {};
      if (k === 'then') return undefined;
      if (k === 'nodeType') return 1;
      if (k === 'length') return 0;
      return p;
    },
    set(t, k, v) { if (k === 'innerHTML') html.push(String(v)); return true; },
    apply() { return p; },
    has() { return true; }
  });
  return p;
}
// PIA-140: an element stub whose innerHTML cannot be written (a redraw that throws)
function throwEl() {
  const p = new Proxy(function stub() {}, {
    get(t, k) { if (k === Symbol.toPrimitive) return () => ''; if (k === Symbol.iterator) return function* () {}; if (k === 'then') return undefined; if (k === 'nodeType') return 1; if (k === 'length') return 0; return p; },
    set(t, k) { if (k === 'innerHTML') throw new Error('redraw failed'); return true; },
    apply() { return p; }, has() { return true; }
  });
  return p;
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
    check(cli.status === 0 && /app\.html: app block found/.test(cli.stdout) && def.status === 0 && /app\.html: app block found/.test(def.stdout) && !/pialax-mobile/.test(def.stdout),
      'harness CLI takes the app file as an argument (app.html), and with none it checks app.html', cli.stdout + def.stdout);
  }

  // ═══ AC1, AC13, AC15 (static) ═══
  section('AC1 / AC13 / AC15 the shipping app: no web-app mode, a strict CSP, system fonts, light and dark tokens');
  const contract = fx('v1-cutover-contract.json');
  const entries = ['index.html', 'pialax.html', 'pialax-mobile.html'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'));
  check(entries.every(s => s.includes("var target = 'app.html' + window.location.search + window.location.hash;") && s.includes('window.location.replace(target)')),
    'PIA-147 every public entry forwards query/hash to the fixed app destination');
  check(!/apple-mobile-web-app-capable/i.test(html) && !/rel=["']?manifest/i.test(html), 'app.html declares no apple-mobile-web-app-capable and no manifest');
  const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/g) || []);
  const cspv = csp.length === 1 ? /content="([^"]+)"/.exec(csp[0])[1] : '';
  const dir = (n) => { const m = new RegExp('(?:^|;)\\s*' + n + ' ([^;]+)').exec(cspv); return m ? m[1].trim() : null; };
  check(csp.length === 1 && dir('default-src') === "'none'" && dir('connect-src') === W + ' ' + MAP_DATA && dir('script-src') === "'unsafe-inline' " + MAP_SCRIPTS.join(' ') && dir('img-src') === 'data:' && !/unsafe-eval|\*/.test(cspv),
    'PIA-143 CSP: only the Worker, exact pinned map-data URL and SRI script paths; data images, no eval or wildcards', cspv);
  {
    const { api } = loadApp();
    check(Array.isArray(api.WORKER_OK) && eq(api.WORKER_OK.slice().sort(), String(dir('connect-src') || '').split(/\s+/).filter((u) => u !== MAP_DATA).sort()),
      'Worker origins match CSP network peers except the exact pinned map-data path', [api.WORKER_OK, dir('connect-src')]);
  }
  {
    const rs = html.slice(html.indexOf('function renderSheet('), html.indexOf('function setInert('));
    check(rs.indexOf('el.hidden = false') > 0 && rs.indexOf('el.hidden = false') < rs.indexOf('fitNames('), 'a sheet is shown before its names are fitted (a hidden sheet counts no words, so nothing would be dropped on a first open)');
  }
  check(!/<link[^>]+rel=["']?stylesheet|@import|@font-face|url\(\s*["']?https?:/i.test(html) && (html.match(/<link /g) || []).length === 1 && /<link rel="icon" href="data:,">/.test(html),
    'no external stylesheet, font or image (one data: favicon link only)');
  check(/--font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto/.test(html) && !/fonts\.googleapis|woff2?/.test(html), 'system font stack only');
  check(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{/.test(html) && /:root\[data-theme="dark"\] \{/.test(html) && /body \{[^}]*background: var\(--bg\)/.test(html),
    'light tokens on :root, dark tokens under prefers-color-scheme and [data-theme="dark"], and body has an explicit background');
  check(!/console\.log/.test(html) && (html.match(/<script[ >]/g) || []).length === 3 && (html.match(/<\/script>/g) || []).length === 3, 'no console.log, three balanced script blocks (app plus two SRI libraries)');

  // ═══ AC10 (static) ═══
  section('AC10 no mock fares, estimators or seeded trips; PIA-140: the fare search lives in one gated place (paid)');
  const mockIds = ['getMock', 'SAMPLE_FARES', 'sampleFare', 'makeDocs', 'makePhones', 'makeFares', 'data-proto', 'WKLY_FACTORS', 'estimateMeetupTotalFor', 'computeRanking',
    'computeBestMeetupWeekends', 'dayPrice', 'WATCHLIST_SEED', 'illustrative', 'Math.random', 'pr-count', 'bootProto'];
  const hits = mockIds.filter((s) => html.indexOf(s) >= 0);
  check(hits.length === 0, 'none of the prototype or v1 mock / sample / estimator identifiers are in app.html', hits);
  const seeded = (appPart.match(/['"][A-Za-z0-9_-]{22}['"]/g) || []);
  const withoutImportSource = html.replace(/var HISTORY_STARTERS = [\s\S]*?;\n\/\* PIA-146:/, '/* PIA-146:');
  check(seeded.length === 0 && !/Thanksgiving at home|Diwali|Tahoe|Grandma/.test(withoutImportSource), 'no automatic seeded trips: historical starter facts live only in the explicit PIA-146 import source; no shared id literal', seeded);
  {
    // PIA-140: fetch is called in exactly two places: api (the free /idea routes, never the token) and paid (GET /search and
    // /account only, the token in the X-Pialax-Token header only); no /extract or /alert route at all
    const fnBody = (name) => { const i = appPart.indexOf('function ' + name + '('), j = appPart.indexOf('\nfunction ', i + 10); return i >= 0 ? appPart.slice(i, j) : ''; };
    const apiB = fnBody('api'), paidB = fnBody('paid'), mapB = fnBody('loadMap'), rest = appPart.replace(apiB, '').replace(paidB, '').replace(mapB, '');
    check((appPart.match(/\bfetch\(/g) || []).length === 3 && /fetch\(MAP_URL,/.test(mapB) && /credentials: 'omit'/.test(mapB) && !/Token|token|workerBase|paid\(/.test(mapB) && /\bfetch\(/.test(apiB) && /\bfetch\(/.test(paidB) && !/['"`]\/(extract|alert)/.test(html) &&
      /path !== '\/search' && path !== '\/account'/.test(paidB) && (appPart.match(/X-Pialax-Token/g) || []).length === 1 && /X-Pialax-Token/.test(paidB) && !/X-Pialax-Token|pialax-token/i.test(apiB) &&
      !/['"`]\/search['"`]/.test(rest.replace(/paid\('\/search'/g, '')) && (rest.match(/paid\('\/(search|account)'/g) || []).length === 2,
      'PIA-143 map requests have no token; paid fetch remains gated in two places: api (the free /idea routes, no token) and paid (only GET /search and /account, the token in its header only); no /extract or /alert route; paid is called from the one search run and the /account sync only');
  }

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
    // Immutable outputs captured from the shipping v1 encoder before retirement.
    const payload = contract.list.input, w = contract.list.w;
    check(typeof w === 'string' && eq(api.v1ShortIds(w).sort(), [A, B].sort()), 'frozen v1 short link reads its shared trip IDs');
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
    const w = contract.single.w;
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
    // Stored formats are public contracts retained after the v1 runtime is retired.
    t.api.saveKey(A, KEY, 'Diwali'); t.api.setToken(TOKEN); t.api.setWorker(W);
    check(JSON.parse(t.ls.getItem('pialax_idea_keys_v1'))[A].edit_key === KEY &&
      JSON.parse(t.ls.getItem('pialax_idea_me_v1'))[A] === 'ashwin-p8' && t.ls.getItem('pialax_proxy_token') === TOKEN &&
      JSON.parse(t.ls.getItem('pialax_idea_seen_v1'))[A] === '2026-10-11T02:11:00.000Z' && t.ls.getItem('pialax_proxy_url') === contract.worker,
      'v2 writes the legacy key, identity, token, seen timestamp and bare Worker URL formats');
  }
  {
    const t = loadApp({ ls: seedLs({ pialax_idea_keys_v1: { [A]: { edit_key: KEY, title: '', created_at: 'c' } }, pialax_proxy_token: TOKEN, pialax_watchlist_v2: listOf([A, B]) }) });
    const org = t.api.organizerLink(A), dev = t.api.devicesLink();
    check(org === ORIGIN + '/PIALAX/?idea=' + A + '#k=' + KEY + '&t=' + TOKEN && org.indexOf('app.html') < 0 && t.api.organizerLink(B) === '',
      'organizer links retain the legacy folder/query/hash format and require that trip key');
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
    check(cA.indexOf('data-k="pin"') < 0 && /<span class="tg w" data-k="togo" data-lbl="Days left"><span class="g">⏳<\/span>20<\/span>/.test(cA) && cA.indexOf('bba') < 0,
      'PIA-135 AC1 Diwali\'s pill: ⏳20 days to go, a plain number, red on the organizer\'s card (book-by 10/16 has passed with travelers unbooked); PIA-154: no 📌 and no book-by arc; its long press says "Days left"');
    check(/<span class="tg" data-k="togo" data-lbl="Days left"><span class="g">⏳<\/span>41<\/span>/.test(cB) && cB.indexOf('class="tg w"') < 0 && cB.indexOf('bba') < 0,
      'PIA-135 AC1 Tahoe\'s pill: ⏳41 days to go, neutral (PIA-154: no book-by arc)');
    check(cA.indexOf('class="loc"') < 0 && cA.indexOf('data-k="lock"') < 0 && !t.api.LEGEND.place && !t.api.LEGEND.abroad && !t.api.LEGEND.noplace && !t.api.LEGEND.bookby,
      'PIA-154 the postcard carries nothing over its scene: no mini locator, no 🔒 corner (and their keys are gone)');
    check(/class="card-open"[^>]*>🪔 Diwali in Raleigh<\/button>/.test(cA) && /<h3 class="card-t" data-free>/.test(cA) && /data-k="heads">3\/4</.test(cA) &&
      [cA, cB].every((c) => /<button class="ib more z" data-act="stage" data-id="[^"]+" data-v="card" aria-label="More" data-k="more">⋯<\/button>/.test(c) && c.indexOf('class="pip') < 0),
      'PIA-135 AC1 the card: title (free of the word budget), faces with answer shapes, n/N, and PIA-154 ⋯ More where the stage disc was (no stage pip), on every card');
    const order = (html.match(/data-trip="([^"]+)"/g) || []).map((s) => s.slice(11, -1));
    check(eq(order, [M8, A, B, C]), 'cards sort ⭐ pinned first, then by departure, undated last', order);
    check(cA.indexOf('data-k="gf"') < 0 && /<button class="slot share z" data-act="tshare" data-id="[^"]+" aria-label="Share" data-k="share"><svg class="shr"/.test(cA) && cB.indexOf('data-k="gf"') < 0,
      'PIA-154 AC2 no ✈↗ on any card before 🔒: the organizer\'s card offers the share symbol while someone waits (primaryAction), a guest\'s Tahoe card nothing');
    const noTok = await boot135({ ls: seedLs({ pialax_watchlist_v2: listOf([A, B]), pialax_idea_keys_v1: keyOf([A]), pialax_idea_me_v1: ME, pialax_fares_v2: fares, pialax_ui_v1: { v1read: 1 } }) });
    const guest = await boot135({ ls: seedLs({ pialax_watchlist_v2: listOf([A, B, C]), pialax_idea_me_v1: { [A]: 'anjo-z5', [B]: 'maya-s9', [C]: 'anjo-c4' }, pialax_proxy_token: TOKEN, pialax_fares_v2: fares, pialax_ui_v1: { v1read: 1 } }) });
    const gh = guest.api.renderIdeas().html;
    check(noTok.api.renderIdeas().html.indexOf('class="tot') < 0 && gh.indexOf('class="tot') < 0 && guest.api.modelOf(A).price === null,
      'PIA-135 AC1 guests\' cards have no price slot at all (a guest phone with a token too), and an organizer phone without the token shows none');
    check([A, B].every((id) => /data-act="stage"[^>]*aria-label="More" data-k="more">⋯</.test(cardOf(gh, id))) && /data-k="togo" data-lbl="Days left"><span class="g">⏳<\/span>20</.test(cardOf(gh, A)) && cardOf(gh, A).indexOf('class="tg w"') < 0,
      'PIA-135 AC1 a guest sees the same ⋯ More and ⏳ days to go; the red book-by cue is the organizer\'s alone (PIA-154)');
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
    t.api.openSheet('total', { id: OJ });
    const ptot = t.api.SHEETS.total(t.api.S.sheet); t.api.closeSheet();
    check(md.openJaw && md.keys.length === 2 && p.total === 500 && !p.complete && p.per['momdad-k3'].hollow && p.per['momdad-k3'].sum === 200 &&
      /<span class="tot part" data-k="total">\$500<\/span>/.test(c) && /<span class="tot part" data-k="total">\$500 <span class="uf" data-k="unpriced">\+🌽<\/span><\/span>/.test(ptot),
      'PIA-135 AC1 an open-jaw traveler with one of two legs cached: the card\'s total is outlined as partial (PIA-154: the faces still to price are P-total\'s, +🌽), never a bare $500', { total: p.total, complete: p.complete, tot: (/<span class="tot[\s\S]*?<\/span><\/span>|<span class="tot[^>]*>[^<]*<\/span>/.exec(c) || [])[0] });
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
    check(/aria-label="Host" data-lbl="Host" data-k="host">🏠</.test(cardOf(html, LX)) && /<button class="slot z" data-act="mytimes" data-id="[^"]+" data-v="card" aria-label="Landing time" data-lbl="Landing time" data-k="arrive">🛬<\/button>/.test(cardOf(html, booked.id)) &&
      cardOf(html, nowhere.id).indexOf('class="slot') < 0,
      'PIA-154 AC2 the card\'s slot follows primaryAction: 🏠 for a host, 🛬 once I have booked and my landing time is missing; a guest\'s idea with no place offers nothing (🧭↗ is the organizer\'s)');
    const un = t.api.modelOf(UN);
    check(!un.me.answered && un.me.status === 'waiting' && cardOf(html, UN).indexOf('data-k="gf"') < 0 && /^https:\/\/www\.google\.com\/travel\/flights\/search\?tfs=/.test(un.me.link.href),
      'PIA-154 AC2 no ✈↗ before 🔒 on any card: Leo, who has not answered Tahoe, has no flight slot on the list (his search still exists, in his own sheet)');
    check([nowhere.id, LHR, ZZ, LX].every((id) => cardOf(html, id).indexOf('class="loc"') < 0), 'PIA-154 no card carries a mini locator (no place, abroad, unknown or in the US)');
    // the slot in my travel days is Track (✈⏱↗), and the organizer's idea with no place keeps 🧭↗
    const tw = clone(srv.read(booked.id)); tw.id = 'twTahoeTravelWindow0w1'; tw.idea.dates = { departure: '2026-10-18', return: '2026-10-20', searchStart: '', searchEnd: '' }; srv.seed(tw);
    const t2 = await boot135({ ls: seedLs({ pialax_watchlist_v2: listOf([tw.id, nowhere.id]), pialax_idea_keys_v1: keyOf([nowhere.id]), pialax_idea_me_v1: { [tw.id]: 'ashwin-l2', [nowhere.id]: 'ashwin-l2' }, pialax_ui_v1: { v1read: 1 } }) });
    const h2 = t2.api.renderIdeas().html;
    check(/href="https:\/\/www\.flighty\.com\/"[^>]*data-k="flighty">✈⏱↗</.test(cardOf(h2, tw.id)) && /href="https:\/\/www\.google\.com\/travel\/explore[^"]*"[^>]*data-k="explore">🧭↗</.test(cardOf(h2, nowhere.id)),
      'PIA-154 AC2 booked, from the day before my first day: ✈⏱↗ Track on the card; the organizer\'s idea with no place keeps 🧭↗ Explore');
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
    const g2h = g2.api.renderIdeas().html;
    check(eq(g2.api.unsharedIds().sort(), [A, B].sort()) && /data-act="sharelist" aria-label="Share list" data-lbl="Share list" data-k="sharelist"><svg class="shr"/.test(g2h) && g2h.indexOf('class="badge"') < 0 && !/class="ib share dot"/.test(g2h),
      'PIA-154 AC5 a guest who organizes nothing keeps the share symbol, with no +N and no dot (the count is the organizer\'s)');
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
    check(/data-act="shelf" aria-expanded="false"[^>]*><span data-k="shelf" aria-hidden="true">🗄<\/span> Archive <span class="tn">3<\/span>/.test(shut) && [C, DROP, PAST].every((id) => shut.indexOf('data-trip="' + id + '"') < 0),
      'PIA-135 AC6 collapsed, the shelf is one row (PIA-154: 🗄 Archive 3) and none of its cards are drawn');
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
    check(cardOf(gh, DROP).indexOf('data-k="more"') > 0 && cardOf(gh, DROP).indexOf('class="pip') < 0 && gh.indexOf('data-act="restore"') < 0, 'no ↩ on a phone without the trip\'s edit key (the dropped trip is on its shelf with ⋯ More, no stage pip)');
  }
  {
    // AC7 new answers: a ● on each face that answered since my last look, the Trips tab's numeral, cleared by a look
    let offline = false;   // the look counts even when the trip's refresh on open fails (the doc on screen is what I saw)
    const t = await boot135({ fetch: (u, o) => (offline ? Promise.reject(new TypeError('Failed to fetch')) : srv.fetch(u, o)),
      ls: seedLs({ pialax_watchlist_v2: listOf([A, B]), pialax_idea_me_v1: { [A]: 'anjo-z5', [B]: 'ashwin-l2' }, pialax_idea_seen_v1: { [B]: '2026-10-12T23:00:00.000Z' }, pialax_ui_v1: { v1read: 1 } }) });
    const cB = cardOf(t.api.renderIdeas().html, B);
    check(eq(t.api.freshCodes(t.api.modelOf(B)), ['maya-s9']) && (cB.match(/data-k="new"/g) || []).length === 0 && t.api.tripsBadge() === 1 && /<span class="badge" data-k="look" data-lbl="Needs a look">1<\/span>/.test(t.api.renderTabbar()),
      'PIA-154 AC7 a guest\'s card has no new-answer dot, and the Trips tab counts only what waits on me (Diwali waits on my answer: 1; Tahoe\'s new answer is not mine to act on)');
    const to = await boot135({ fetch: (u, o) => (offline ? Promise.reject(new TypeError('Failed to fetch')) : srv.fetch(u, o)),
      ls: seedLs({ pialax_watchlist_v2: listOf([A, B]), pialax_idea_keys_v1: keyOf([B]), pialax_idea_me_v1: { [A]: 'anjo-z5', [B]: 'ashwin-l2' }, pialax_idea_seen_v1: { [B]: '2026-10-12T23:00:00.000Z' }, pialax_ui_v1: { v1read: 1 } }) });
    const oB = cardOf(to.api.renderIdeas().html, B);
    check((oB.match(/<span class="ndot" role="img" aria-label="New answers" data-lbl="New answer" data-k="new"><\/span>/g) || []).length === 1 && oB.indexOf('class="new"') < 0 && to.api.tripsBadge() === 2 && /<span class="badge" data-k="look" data-lbl="Needs a look">2<\/span>/.test(to.api.renderTabbar()),
      'PIA-135 AC7 on the organizer\'s card, one dot after n/N says Maya answered after his last look (PIA-154: no dot on each face); the Trips tab counts 2 (Tahoe\'s new answer, Diwali still waiting on mine)');
    offline = true;
    to.api.ACTS.open({ dataset: { id: B } }); await tick();
    check(to.api.seenFor(B) === '2026-10-14T18:45:00.000Z' && to.api.freshCodes(to.api.modelOf(B)).length === 0 && to.api.tripsBadge() === 1, 'opening the trip marks its answers seen (even offline): the dot goes and the numeral drops to 1');
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
  const seedAs = (doc, f) => { const d = clone(doc); d.id = (d.id.slice(0, 16) + 'p' + String(++nSeed).padStart(5, '0')).slice(0, 22); if (f) f(d); srv.seed(d); return d.id; };   // PIA-139: ids stay unique past 99 seeds
  const act = (t, name, ds) => t.api.ACTS[name]({ dataset: ds || {} });   // a tap on a control (what the click handler calls)
  const D = (t) => (t.api.S.sheet && t.api.S.sheet.local.d) || null;
  const posts = (t, from) => t.fetches.slice(from || 0).filter((f) => f.method === 'POST').map((f) => ({ path: f.url.replace(W, '').split('?')[0], body: JSON.parse(f.body) }));
  // wait for a write the app started on its own (a caption saves as its sheet closes): no fixed number of turns. PIA-140 fix pass
  // 2: past its budget of event-loop turns it keeps polling every 5ms for up to 20s more: the in-process Worker hashes the edit
  // key with WebCrypto on Node's thread pool, which a loaded machine can hold up for longer than any number of turns (1 run in
  // 25 read PIA-138's four quick taps' record before their one write had landed). performance.now only bounds how long a wait
  // may take (the test swaps Date); what the app decides still comes from its own clock (CLOCK)
  const until = async (f, n) => {
    for (let i = 0; i < (n || 2000) && !f(); i++) await tick(2);
    for (const end = performance.now() + 20000; !f() && performance.now() < end;) await new Promise((r) => setTimeout(r, 5));
    return f();
  };
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
    check(d.preset === 'family' && eq(d.rows.map((r) => r.face + r.name + r.ap + r.n + (r.me ? '🙋' : '')), ['🌽Mom & DadPIA2', '💪AshwinLAX1🙋', '🗽AnjoLGA1']) && d.rows.every((r) => r.preset),
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
      eq(cp.body.idea.members.map((x) => [x.label, x.airport, x.headcount]), [['🌽 Mom & Dad', 'PIA', 2], ['💪 Ashwin', 'LAX', 1], ['🗽 Anjo', 'LGA', 1]]),
      'PIA-136 AC1 Create: one POST /idea through createRequest (the title with its picture, the place and its city, the plan, 📌, a face on every label, no recommendation)', cp && cp.body.idea);
    check(keys[id] && /^[A-Za-z0-9_-]{32,64}$/.test(keys[id].edit_key) && keys[id].title === '🪔 Diwali in Raleigh' && eq(Object.keys(keys[id]), ['edit_key', 'title', 'created_at']) && keys[DW1].edit_key === KEY,
      'PIA-136 AC1 the edit key is kept on this phone in v1\'s format (and the keys already there are untouched)');
    const me = t.api.meFor(id), meMem = srv.read(id).idea.members.find((x) => x.code === me);
    check(t.api.S.tab === 'trips' && t.api.S.trip === id && !t.api.S.sheet && t.api.listIds().indexOf(id) >= 0 && meMem && meMem.label === '💪 Ashwin' && JSON.parse(t.ls.getItem('pialax_me_profile_v1')).label === '💪 Ashwin' &&
      t.api.modelOf(id).stage === 'idea' && t.api.modelOf(id).org && Object.keys(srv.read(id).responses).length === 0 && !('draft' in t.api.uiRead()),
      'PIA-136 AC1 then the trip opens (its organizer view, 💡 Idea, nobody has answered yet), listed, with 🙋 = Ashwin on this phone and as my profile; no draft is left', { trip: t.api.S.trip, me });
    const nv = t.api.renderTrip(id).html;
    t.api.ACTS.stage({ dataset: { id } });
    const mv = t.api.SHEETS.stage(t.api.S.sheet); t.api.closeSheet();
    check(nv.indexOf('data-act="edit"') < 0 && /data-act="stage" data-id="[^"]+" aria-label="More" data-k="more">⋯<\/button>/.test(nv) && /data-act="edit"[^>]*><span[^>]*data-k="edit">✎<\/span>Edit<\/button>/.test(mv) &&
      /<div class="split prim"><button class="btn pri share dot" data-act="tshare" data-id="[^"]+"><span data-k="share"><svg class="shr"/.test(nv) && nv.indexOf('📣') < 0 && (nv.match(/data-act="tshare"/g) || []).length === 1,
      'the new trip\'s view offers the organizer Share (PIA-154: the share glyph and its dot while nobody has answered; the nav\'s share steps aside for it) and ⋯ More holds ✎ Edit', { prim: (/<div class="split prim">[\s\S]*$/.exec(nv) || [''])[0].slice(0, 200), more: (/data-act="stage"[^>]*>/.exec(nv) || [''])[0], edit: (/<button class="mrowb" data-act="edit"[\s\S]*?<\/button>/.exec(mv) || [''])[0], mega: nv.indexOf('📣') });
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
    const eTile = /<button class="tool bad" data-act="edrop" data-id="[^"]+" aria-label="Remove">🗑<\/button>/.test(t.api.SHEETS.edit(t.api.S.sheet.back));
    check(t.api.S.sheet.type === 'drop' && /<button class="btn danger" data-act="dropyes">🗑 Remove<\/button><button class="btn pri" data-act="dropkeep">Keep<\/button>/.test(html) && srv.read(E5).decision.stage === 'chosen' && eTile,
      'PIA-136 AC7 P-drop: the trip, a red-outlined 🗑 Remove (PIA-155: it removes the trip for everyone; P-edit\'s tile reads "Remove" too) and the primary Keep (nothing is sent yet)');
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
    // Frozen v1 builder output opens the same create sheet without carrying its estimated fare.
    const raw = contract.builder;
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
    // PIA-150: a trip saved with 🌴 Ashwin keeps it (the record's faces are its own) until the organizer changes it in ✎: one tap on
    // his face there gives 💪 (the face after 🌴, nobody else on the trip has it), and Save writes only that
    const E = seedAs(fx('idea-diwali.json')), before = clone(srv.read(E)), t = await editPeople(E, 'ashwin-p8'), d = D(t);
    const shown = t.api.modelOf(E).members.map((x) => x.face);
    act(t, 'nedit', { v: '1' }); act(t, 'nface', { v: '1' });
    const html = t.api.SHEETS.new(t.api.S.sheet), picked = d.rows[1].face;
    act(t, 'nface', { v: '1' }); const wrapped = d.rows[1].face; act(t, 'nface', { v: '1' }); const again = d.rows[1].face;
    for (let i = 0; i < 30 && d.rows[1].face !== '💪'; i++) act(t, 'nface', { v: '1' });
    const n0 = t.fetches.length, r = await act(t, 'esave2'); await tick();
    const ps = posts(t, n0), doc = srv.read(E);
    check(eq(shown, ['🌽', '🌴', '🗽']) && picked === '💪' && /<button class="ib facepick" data-act="nface" data-v="1" aria-label="Change face">💪<\/button>/.test(html) && wrapped === '🦊' && again === '🐻' &&
      r && r.ok && ps.length === 1 && ps[0].path === '/idea/update' && eq(doc.idea.members.map((x) => x.code + ' ' + x.label), ['momdad-k3 🌽 Mom & Dad', 'ashwin-p8 💪 Ashwin', 'anjo-z5 🗽 Anjo']) &&
      eq(doc.responses, before.responses) && eq(t.api.modelOf(E).members.map((x) => x.face), ['🌽', '💪', '🗽']),
      'PIA-150 Diwali (saved with 🌴 Ashwin) shows 🌴 until the organizer taps his face in ✎: 💪 comes next (then 🦊, 🐻 … around again), and Save is one update that relabels him 💪 Ashwin; codes, the others\' labels and every answer stay', { shown, picked, wrapped, again, labels: doc.idea.members.map((x) => x.label), paths: ps.map((p) => p.path) });
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

  // ═══ PIA-137 ═══
  section('PIA-137 the trip view and RSVP: the open portal, P-face, P-person, answers, 🎫, nudges, notes, airports, closed trips');
  // the data-* of the first rendered control with that data-act (and those data-* values): what a tap on it hands its action
  const ctl = (html, name, want) => {
    const re = new RegExp('<(?:button|a)\\b[^>]*\\bdata-act="' + name + '"[^>]*>', 'g'); let mm;
    while ((mm = re.exec(html || ''))) {
      const o = {}; mm[0].replace(/\bdata-([a-z]+)="([^"]*)"/g, (_, k, v) => { o[k] = v.replace(/&amp;/g, '&'); return ''; });
      if (!want || Object.keys(want).every((k) => o[k] === want[k])) return o;
    }
    return null;
  };
  const tap = (t, html, name, want) => { const o = ctl(html, name, want); return o ? t.api.ACTS[name]({ dataset: o }) : Promise.resolve('no control: ' + name); };
  // PIA-154: every trip page and sheet these checks draw is also read for its glyph keys (data-k) and its marked label words
  // (data-lbl3), checked once at the end: every key is one ⓘ explains, every marked word is on the list, and no sheet marks any
  const SEEN_K = new Set(), SEEN_L3 = new Set(), SHEET_L3 = new Set();
  const collect = (h, into) => {
    const s = String(h || '');
    s.replace(/\sdata-k="([^"]+)"/g, (_, k) => { SEEN_K.add(k); return ''; });
    s.replace(/<[a-z]+\b[^>]*\sdata-lbl3\b[^>]*>([^<]*)</g, (_, w) => { into.add(w.trim()); return ''; });
    return h;
  };
  const screen = (t) => collect(t.api.renderTrip(t.api.S.trip).html, SEEN_L3);
  // PIA-154: once I have answered, my answer is a chip on the trip page; one tap there opens In / Maybe / Out in its place
  const answerTap = (t, v) => { if (!ctl(screen(t), 'answer', { v })) tap(t, screen(t), 'achip'); return tap(t, screen(t), 'answer', { v }); };
  const sheet = (t) => collect(t.api.S.sheet ? t.api.SHEETS[t.api.S.sheet.type](t.api.S.sheet) : '', SHEET_L3);
  const nPosts = (t) => t.fetches.filter((f) => f.method === 'POST').length;
  const shown = (h) => String(h || '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter((w) => /\p{L}/u.test(w));
  // a phone opened by a link: the trip is read, then the render that follows (and P-face, if it asks) runs
  const linkPhone = async (url, ls, nav) => {
    const t = loadApp({ fetch: srv.fetch, url: BASE + url, ls: ls || seedLs({ pialax_ui_v1: { v1read: 1 } }), navigator: nav });
    const id = (/[?&]idea=([A-Za-z0-9_-]{22})/.exec(url) || [])[1];
    await until(() => !!t.api.DOCS[id]); await tick(); t.flush();
    return t;
  };
  const recShare = () => { const shared = []; return { shared, nav: { userAgent: 'test-app', share: (o) => { shared.push(o); return Promise.resolve(); }, clipboard: { writeText: () => Promise.resolve() } } }; };
  // every action that reaches ACTS from here on, by name (a tap the person makes, or one an action makes for them)
  const countActs = (t) => { const calls = []; Object.keys(t.api.ACTS).forEach((k) => { const f = t.api.ACTS[k]; t.api.ACTS[k] = function () { calls.push(k); return f.apply(this, arguments); }; }); return calls; };
  const DWX = fx('idea-diwali.json'), M8X = fx('idea-8members.json'), THX = fx('idea-tahoe.json'), TGX = fx('idea-thanksgiving-legacy.json');
  const chosenAt = (d, s, e, ap) => { d.decision = { stage: 'chosen', chosen: { airport: ap, city: '', departure: s, return: e, hub: '', fareFrom: '', fareTo: '', totalFare: null, perTicketFare: null, headcount: 1, priceStatus: 'estimated', familyTotal: null, familyStatus: null }, chosen_at: '2026-10-16T00:00:00.000Z', estimate_total: null, actual_total: null, booked_at: null, delta_pct: null }; };
  // Diwali moved to Peoria: Mom & Dad are hosts there (PIA/ORD is one of the Worker's hub pairs), and their answer is not in yet
  const atPeoria = (d) => { d.idea.destination = { city: 'Peoria', airport: 'PIA' }; delete d.responses['momdad-k3']; };
  const RESP = (status, extra) => Object.assign({ member: '', status, origin: '', available_from: '', available_to: '', note: '', arrive_at: '', leave_from: '', updated_at: '2026-10-16T10:00:00.000Z' }, extra || {});
  {
    // AC1 from the plain group link: the link (1), my face (2), In (3). Nothing is written before In, and In is one complete answer
    const id = seedAs(DWX);
    const t = await linkPhone('?idea=' + id);
    const calls = countActs(t);   // tap 1 is the link itself; every later tap is an action
    const face = t.api.S.sheet && t.api.S.sheet.type === 'face' ? sheet(t) : '';
    const p0 = nPosts(t);
    tap(t, face, 'pickface', { code: 'anjo-z5' });
    const picked = { sheet: t.api.S.sheet, me: t.api.meFor(id), prof: JSON.parse(t.ls.getItem('pialax_me_profile_v1') || '{}').label, posts: nPosts(t) - p0 };
    await tap(t, screen(t), 'answer', { v: 'in' }); await tick();
    const ps = posts(t, 0);
    check(face && t.api.popupName({ type: 'face' }) === 'P-face' && !picked.sheet && picked.me === 'anjo-z5' && picked.prof === '🗽 Anjo' && picked.posts === 0,
      'PIA-137 AC1 a group link opens P-face by itself on a phone that is nobody on the trip; one tap on 🗽 makes this phone Anjo there (and my profile) and writes nothing to the trip', picked);
    check(1 + calls.length === 3 && eq(calls, ['pickface', 'answer']) && ps.length === 1 && ps[0].path === '/idea/respond' && eq(ps[0].body, { member: 'anjo-z5', status: 'in', origin: '', available_from: '', available_to: '', note: '' }) && srv.read(id).responses['anjo-z5'].status === 'in',
      'PIA-137 AC1 …then In: 3 taps from the link (link, face, In: the only actions that ran), one complete answer saved on the tap through the real Worker', { calls, ps });
  }
  {
    // AC1 from a personal nudge link: the link (1) greets Anjo, In (2). The hint writes nothing by itself; her answer does
    const id = seedAs(DWX);
    const t = await linkPhone('?idea=' + id + '#m=anjo-z5');
    const greet = { sheet: t.api.S.sheet && t.api.S.sheet.type, me: t.api.modelOf(id).me && t.api.modelOf(id).me.code, stored: t.api.meFor(id), prof: t.ls.getItem('pialax_me_profile_v1'), hash: t.loc.hash, word: shown(screen(t)).indexOf('Anjo') >= 0 };
    const calls = countActs(t);
    await tap(t, screen(t), 'answer', { v: 'in' }); await tick();
    check(!greet.sheet && greet.me === 'anjo-z5' && greet.stored === '' && greet.hash === '' && greet.word && !greet.prof,
      'PIA-137 AC1 a nudge link (#m=) on a phone that remembers nobody greets 🗽 Anjo at once (no P-face), with nothing stored and the hint gone from the address bar', greet);
    check(1 + calls.length === 2 && eq(calls, ['answer']) && t.api.meFor(id) === 'anjo-z5' && srv.read(id).responses['anjo-z5'].status === 'in' && posts(t).length === 1,
      'PIA-137 AC1 …and In (2 taps from the link: In is the only action) answers as Anjo and makes this phone Anjo on the trip', calls);
    const q = t.api.readLink('?idea=' + id + '&me=anjo-z5', '', '/PIALAX/app.html'), bad = t.api.readLink('?idea=' + id + '&me=..', '', '/');
    check(q.hint === 'anjo-z5' && q.drop.indexOf('me') >= 0 && bad.hint === '' && bad.drop.indexOf('me') >= 0, 'the hint also reads as ?me=<code> on an app link (dropped from the address bar either way; a malformed code is no hint)', q);
  }
  {
    // AC1 a hint never silently overrides a different remembered identity: P-face asks, the remembered face stays until a tap
    const id = seedAs(DWX);
    const t = await linkPhone('?idea=' + id + '#m=anjo-z5', lsOf([id], { pialax_idea_me_v1: { [id]: 'ashwin-p8' } }));
    const sh = t.api.S.sheet, h = sheet(t), me0 = t.api.modelOf(id).me.code;
    t.api.closeSheet();
    const kept = { me: t.api.meFor(id), model: t.api.modelOf(id).me.code, again: !!t.api.S.sheet };
    check(sh && sh.type === 'face' && sh.p.hint === 'anjo-z5' && sh.focus === 'pf-mark' && /class="tile hint" id="pf-mark" data-act="pickface" data-id="[^"]+" data-code="ashwin-p8"[^>]*><span class="tw" data-k="you">👋<\/span>/.test(h) &&
      /class="tile hinted" data-act="pickface" data-id="[^"]+" data-code="anjo-z5"[^>]*><span class="tw" data-k="fromlink">✉<\/span>/.test(h) && me0 === 'ashwin-p8',
      'PIA-137 AC1 a nudge hint for Anjo on a phone that remembers Ashwin opens P-face: the remembered face outlined, focused and 👋, Anjo only marked (✉, dashed); the trip still shows Ashwin', { me0 });
    check(kept.me === 'ashwin-p8' && kept.model === 'ashwin-p8' && !kept.again && nPosts(t) === 0, 'closing it keeps the remembered face (never overridden silently), and it does not ask again this visit', kept);
    const t2 = await linkPhone('?idea=' + id + '#m=nobody-x9', lsOf([id], { pialax_idea_me_v1: { [id]: 'ashwin-p8' } }));
    check(!t2.api.S.sheet && t2.api.modelOf(id).me.code === 'ashwin-p8', 'a hint for nobody on the trip asks nothing and changes nothing');
  }
  {
    // AC1 a legacy 'Me' is never a pickable word: the v1 Thanksgiving's 'Me' is a dashed face with no name, last
    const id = seedAs(TGX);
    const t = await linkPhone('?idea=' + id);
    const h = sheet(t), tiles = h.split('data-act="pickface"').length - 1, last = h.lastIndexOf('data-act="pickface"');
    check(t.api.S.sheet && t.api.S.sheet.type === 'face' && tiles === 3 && shown(h).indexOf('Me') < 0 && !/aria-label="Me"/.test(h) && /class="tile legacy" data-act="pickface" data-id="[^"]+" data-code="LAX" aria-label="Person"/.test(h) && h.indexOf('data-code="LAX"', last - 200) > 0,
      'PIA-137 AC1 P-face on the v1 Thanksgiving: three faces, the v1 "Me" last as a dashed face with no word (its name is "Person" to a screen reader), never the word Me', shown(h));
  }
  {
    // carried over from PIA-136: a trip saved from a list link has no face on this phone (no ✈↗ on its card); P-face picks one,
    // preselecting the face whose name this phone already is on its other trips, never saving it by itself
    const mine = seedAs(DWX), saved = seedAs(DWX);
    const t = await boot136({ ls: lsOf([mine, saved], { pialax_idea_me_v1: { [mine]: 'anjo-z5' } }) });
    const card = (id) => { const h = t.api.renderIdeas().html, i = h.indexOf('data-trip="' + id + '"'); return h.slice(i, h.indexOf('</article>', i)); };
    const before = card(saved);
    act(t, 'open', { id: saved });
    const sh = t.api.S.sheet, h = sheet(t);
    check(!/data-k="gf"/.test(before) && !/data-k="gf"/.test(card(mine)) && sh && sh.type === 'face' && sh.p.pre === 'anjo-z5' && /class="tile hint" id="pf-mark"[^>]*data-code="anjo-z5"/.test(h) && t.api.meFor(saved) === '',
      'PIA-137 a trip saved from a list link has no ✈↗ on its card (PIA-154: nor one she has not answered: no ✈↗ before 🔒); opening it, P-face preselects 🗽 Anjo (who this phone is on its other trip) without saving her', { pre: sh && sh.p.pre });
    tap(t, h, 'pickface', { code: 'anjo-z5' });
    check(t.api.meFor(saved) === 'anjo-z5' && !/data-k="gf"/.test(card(saved)) && /<p class="ansq" id="ansq-[^"]+" data-lbl3>Coming\?<\/p><div class="answers[^"]*" role="group" aria-labelledby="ansq-/.test(t.api.renderTrip(saved).html),
      'one tap there, and the trip page asks her "Coming?" over In / Maybe / Out (the question labels the row)');
  }
  {
    // AC2 someone not on the list asks to join from P-face: 🙋＋ name and airport, 📣 hands the share sheet the join link only
    const id = seedAs(THX), rs = recShare();
    const t = await linkPhone('?idea=' + id, null, rs.nav);
    tap(t, sheet(t), 'joinopen');
    const L = t.api.S.sheet.local;
    tap(t, sheet(t), 'joinshare'); await tick();
    const refused1 = rs.shared.length;
    L.jname = 'Nina Okafor'; L.jap = 'BO';
    tap(t, sheet(t), 'joinshare'); await tick();
    const refused2 = rs.shared.length;
    L.jap = 'BOS';
    tap(t, sheet(t), 'joinshare'); await tick(); await tick();
    const j = t.api.uiRead().joins || {};
    check(refused1 === 0 && refused2 === 0 && rs.shared.length === 1 && eq(Object.keys(rs.shared[0]), ['url']) && rs.shared[0].url === ORIGIN + '/PIALAX/?idea=' + id + '&add=' + encodeURIComponent('Nina Okafor.BOS') &&
      nPosts(t) === 0 && j[id] && j[id].name === 'Nina Okafor' && j[id].ap === 'BOS' && !t.api.S.sheet,
      'PIA-137 AC2 P-face 🙋＋: with a name (and a 3-letter code, when one is typed) 📣 shares <app>?idea=<id>&add=Nina Okafor.BOS (the URL only; nothing written to the trip), and the sheet closes', rs.shared);
    // the organizer adds her (PIA-136's ?add=); on her phone the next read brings P-face back with her new face preselected
    const doc = srv.read(id); doc.idea.members.push({ code: 'ninaokafor-q1', label: '🦋 Nina Okafor', airport: 'BOS', headcount: 1 }); srv.write(doc);
    await t.api.refresh(id); await tick(); t.flush();
    const sh = t.api.S.sheet;
    check(sh && sh.type === 'face' && sh.p.pre === 'ninaokafor-q1' && t.api.meFor(id) === '', 'PIA-137 AC2 once the organizer has added her, the next read reopens P-face with 🦋 Nina preselected (still not saved by itself)', sh && sh.p);
    tap(t, sheet(t), 'pickface', { code: 'ninaokafor-q1' });
    check(t.api.meFor(id) === 'ninaokafor-q1' && !(t.api.uiRead().joins || {})[id], 'one tap and she is Nina on the trip; the join request is forgotten');
  }
  {
    // AC3 In / Maybe / Out labelled, saved on tap, never defaulted; a host's In visibly unconfirmed until tapped; Out is ⊘
    const id = seedAs(DWX, atPeoria);
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'momdad-k3' } }) });
    act(t, 'open', { id });
    const n0 = nPosts(t);
    act(t, 'stage', { id }); t.api.closeSheet(); act(t, 'person', { id, code: 'ashwin-p8' }); t.api.closeSheet(); act(t, 'face', { id }); t.api.closeSheet();
    const h = screen(t), m0 = t.api.modelOf(id);
    const ans = (v) => (new RegExp('<button class="ans ' + v + '[^"]*"[^>]*>').exec(h) || [''])[0];
    const hostFace = (hh) => { const i = hh.indexOf('data-act="person" data-id="' + id + '" data-code="momdad-k3"', hh.indexOf('id="board-')); return hh.slice(i, hh.indexOf('</button>', i)); };
    check(m0.me.status === 'host-default' && /<p class="ansq" id="ansq-[^"]+" data-lbl3>Hosting\?<\/p>/.test(h) && /^<button class="ans in"/.test(ans('in')) && /aria-pressed="false"/.test(ans('in')) && !/hostdef|def"/.test(ans('in')) && /aria-pressed="false"/.test(ans('maybe')) && /aria-pressed="false"/.test(ans('out')) &&
      /class="av s44 st-hostdef"/.test(hostFace(h)) && /<\/svg>In<\/button>/.test(h) && /<\/svg>Maybe<\/button>/.test(h) && /<\/svg>Out<\/button>/.test(h) && /<circle cx="8" cy="8" r="5.6"[^>]*\/><path d="M4 12L12 4"/.test(ans('out') + h.slice(h.indexOf(ans('out')))) && nPosts(t) === n0,
      'PIA-137 AC3 a host is asked "Hosting?" over In / Maybe / Out, labelled, none pressed (PIA-154: In is an ordinary In; their face\'s dotted ring says the default is not confirmed); Out is ⊘; opening P-stage, P-person and P-face wrote nothing', { status: m0.me.status });
    check(m0.headsIn === 3 && m0.heads === 4 && /<span class="hin tn" role="img" aria-label="3 of 4 in" data-lbl="Heads in" data-k="heads">3\/4<\/span>/.test(t.api.renderTrip(id).html), 'the host counts in the heads (PIA-154: the board\'s lead says 3/4: Anjo has not answered)');
    await tap(t, h, 'answer', { v: 'in' }); await tick();
    const h2 = screen(t), r = srv.read(id).responses['momdad-k3'];
    check(r && r.status === 'in' && r.note === '' && /<button class="achip in" data-act="achip" data-id="[^"]+" aria-expanded="false" aria-label="My answer: In, change" data-lbl="Change answer"><span class="ag" aria-hidden="true"><svg[\s\S]*?<\/svg><\/span>In<i class="chev"/.test(h2) && !/data-act="answer"/.test(h2) && !/Hosting\?/.test(h2) &&
      /class="av s44 st-in"/.test(hostFace(h2)) && t.api.modelOf(id).headsIn === 3,
      'PIA-137 AC3 their tap on In is saved at once (status in, as themselves: no 📞); PIA-154: the row folds into their answer chip (✓ In ⌄) at the date row\'s end and the face\'s ring fills; heads stay 3/4 (they were already counted)', r);
    await tap(t, h2, 'achip'); const h3 = screen(t);
    check(t.api.S.ansOpen === id && /class="ans in" data-act="answer"[^>]*aria-pressed="true" data-k="in"/.test(h3) && !/data-act="achip"/.test(h3) && !/class="ansq"/.test(h3) && nPosts(t) === n0 + 1,
      'PIA-154 one tap on the chip opens In / Maybe / Out in its place (no question: they answered), nothing sent');
    await tap(t, h3, 'answer', { v: 'in' }); const h4 = screen(t);
    check(t.api.S.ansOpen == null && /data-act="achip"/.test(h4) && !/data-act="answer"/.test(h4) && nPosts(t) === n0 + 1, 'PIA-154 the same answer again folds the row back to the chip and sends nothing');
    const src = fs.readFileSync(APP, 'utf8');
    check(!/✕/.test(src) && /data-act="sh-close" aria-label="Close" data-k="close">⌄<\/button>/.test(src) && !/data-act="sh-close"[^>]*>⊘/.test(src),
      'PIA-137 AC3 no close control looks like an answer: every sheet closes with ⌄ (never ✕ or ⊘)');
  }
  {
    // AC3 never defaulted: a guest who has not answered has no answer pressed, no airport cells and no note to add
    const id = seedAs(DWX);
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(t, 'open', { id }); act(t, 'person', { id, code: 'anjo-z5' });
    const s = sheet(t), h = screen(t);
    check(!/aria-pressed="true" data-k="(in|maybe|out)"/.test(h) && !/data-act="legair"|data-act="origedit"|data-act="pnote"/.test(s) && /data-k="gf"/.test(s) && nPosts(t) === 0,
      'PIA-137 AC3 nothing is pressed for someone who has not answered, and their own sheet offers no airport cell or note until they answer (nothing is written for them); their ✈↗ is there');
  }
  {
    // AC4 everyone's status, days and marks for everyone; out dimmed; a guest sees no price and only their own flight link
    const id = seedAs(M8X);
    const guest = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'samlee-sb' }, pialax_proxy_token: TOKEN }) });
    const org = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'grandmajosephine-nf' }, pialax_idea_keys_v1: keyOf([id]), pialax_proxy_token: TOKEN }) });
    act(guest, 'open', { id }); act(org, 'open', { id });
    const gh = screen(guest), oh = screen(org);
    const marksOf = (h, code) => { const i = h.indexOf('data-act="person" data-id="' + id + '" data-code="' + code + '"', h.indexOf('id="board-')), seg = h.slice(i, h.indexOf('</button>', i)); return ((/class="av s44 ([^"]*)"/.exec(seg) || [])[1] || '') + '|' + (seg.match(/data-k="[a-z-]+"/g) || []).join(','); };
    const codes = M8X.idea.members.map((x) => x.code), gm = codes.map((c) => marksOf(gh, c)), om = codes.map((c) => marksOf(oh, c));
    const topBadges = (h, code) => { const i = h.indexOf('data-act="person" data-id="' + id + '" data-code="' + code + '"', h.indexOf('id="board-')), seg = h.slice(i, h.indexOf('</button>', i)); return ((/<span class="bd">([\s\S]*?)<\/span><\/span>/.exec(seg) || [])[1] || '').split('data-k=').length - 1; };
    check(eq(gm, om) && /st-out/.test(marksOf(gh, 'samlee-kz')) && /data-k="note"/.test(marksOf(gh, 'samlee-kz')) && !/data-k="called"/.test(gm.join()) &&
      /data-k="note"/.test(marksOf(gh, 'bartholomewmontgomeryfitzgera-dj')) && /data-k="warn"/.test(marksOf(gh, 'bartholomewmontgomeryfitzgera-dj')) && /st-hostdef/.test(marksOf(gh, 'guadalupehernndezvillanueva-5m')) && /st-maybe/.test(marksOf(gh, 'anastasiakonstantinopoulou-x1')) &&
      codes.every((c) => topBadges(gh, c) <= 1),
      'PIA-137 AC4 every face carries the same answer shape and marks on a guest\'s phone as on the organizer\'s; PIA-154: one top badge at most (⚠, else 🎫, else 🏠) and 📝 under it (📞 is in their sheet)', gm);
    act(guest, 'person', { id, code: 'oluwaseunadebayorichardson-ew' });
    check(/data-k="called"/.test(sheet(guest)), 'PIA-154 their sheet (P-person) still carries every mark, 📞 too'); guest.api.closeSheet();
    const rows = gh.split('<div class="pb-row').slice(1);
    check(rows.length === 8 && rows.filter((r) => /^[^"]*dimrow/.test(r)).length === 1 && /dimrow" style/.test(gh.slice(gh.indexOf('data-code="samlee-kz"') - 400, gh.indexOf('data-code="samlee-kz"'))) &&
      (gh.match(/<i class="bar[^"]*"/g) || []).length >= 6, 'the board shows all 8 rows with their bars; the one person who is out is dimmed (still there)');
    const gfs = (gh.match(/href="https:\/\/www\.google\.com\/travel[^"]*"/g) || []), mineGf = TM.handoffs(guest.api.modelOf(id), '', { today: '2026-10-17', now: NOW }).gf.href;
    // the organizer's token phone: with nothing priced yet no $— column; the total block (PIA-140) is $— with its 🔍N, the way
    // into P-total, and no price; one cached fare brings the column and the total
    const omod = org.api.modelOf(id), fares = {}; omod.travelers[0].keys.forEach((k) => { fares[k.key] = { p: 240, f: NOW - 36e5 }; });
    const priced = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'grandmajosephine-nf' }, pialax_idea_keys_v1: keyOf([id]), pialax_proxy_token: TOKEN, pialax_fares_v2: fares }) });
    act(priced, 'open', { id }); const ph = screen(priced);
    act(guest, 'person', { id, code: 'samlee-sb' }); const gs = sheet(guest), ownGf = (gs.match(/href="https:\/\/www\.google\.com\/travel[^"]*"/g) || []); guest.api.closeSheet();
    check(gh.indexOf('$') < 0 && !/class="pricerow|class="tot|class="pr/.test(gh) && gfs.length === 0 && ownGf.length === 1 && ownGf[0] === 'href="' + mineGf.replace(/&/g, '&amp;') + '"' && gs.indexOf('$') < 0 &&
      !/class="pr"|class="pr /.test(oh) && /<button class="pricerow" data-act="total" data-id="[^"]+" aria-label="Price Bartholomew Montgomery-Fitzgerald’s, Anastasia Konstantinopoulou’s, Maximilian Oyelaran-Whitfield’s and 2 more flights" data-lbl="Price Bartholomew Montgomery-Fitzgerald’s, Anastasia Konstantinopoulou’s, Maximilian Oyelaran-Whitfield’s and 2 more flights"><span class="chipq w"><span aria-hidden="true" data-k="search">🔍<\/span> Price <span class="uf" data-k="unpriced">🦊🐻🐼\+2<\/span><\/span><\/button>/.test(oh) &&
      !/\$\d|\$—/.test(oh) && /<button class="pricerow"[\s\S]*?<span class="tot[^"]*" data-k="total">\$\d[\s\S]*?<span class="stack"/.test(ph),
      'PIA-137 AC4 a guest (even one holding the token) sees no price anywhere, and (PIA-154: no ✈↗ before 🔒) no flight link on the trip page, their own in their sheet; the organizer\'s token phone shows no $ until a leg has a cached fare (then its total over the stack of who is priced), and before that (PIA-155) the price row says whose flights are not searched yet, "🔍 Price 🦊🐻🐼+2", named in its label (the way into P-total, whose 🔍N shows the cost), no $— anywhere', { gfs: gfs.length, own: ownGf.length, blk: (/<button class="pricerow[\s\S]*?<\/button>/.exec(oh) || [])[0] });
    act(guest, 'person', { id, code: 'bartholomewmontgomeryfitzgera-dj' });
    const s1 = sheet(guest), acts1 = (s1.match(/data-act="[a-z-]+"/g) || []).map((x) => x.slice(10, -1));
    guest.api.closeSheet(); act(guest, 'person', { id, code: 'anastasiakonstantinopoulou-x1' });
    const s2 = sheet(guest), acts2 = (s2.match(/data-act="[a-z-]+"/g) || []).map((x) => x.slice(10, -1));
    check(!/href=|disabled|data-act="(answer|legair|origedit|booked|unbook)"/.test(s1 + s2) && acts1.every((a) => ['sh-close', 'pnote'].indexOf(a) >= 0) && acts1.indexOf('pnote') >= 0 &&
      eq(acts2, ['sh-close', 'nudge']) && /12\/10/.test(s1) && guest.api.modelOf(id).dest === 'SAV' && !/SAV/.test(s1),
      'PIA-137 AC4 a guest looking at someone else sees their face and ends (12/10; PIA-154: SAV, the destination, is not repeated), their note to read and, for a maybe, Share: no answer row, no link, no airport cell, nothing disabled', { acts1, acts2 });
    act(org, 'person', { id, code: 'bartholomewmontgomeryfitzgera-dj' });
    const s3 = sheet(org);
    check(/data-proxy="1"/.test(s3) && /data-k="gf"/.test(s3) && /data-act="origedit"/.test(s3), 'the organizer looking at the same person gets the answer row (📞), their flight link and where they fly from');
  }
  {
    // AC5 the destination is on every trip view, one tap from the Map
    const id = seedAs(DWX, atPeoria);
    const roles = [{ [id]: 'ashwin-p8' }, { [id]: 'momdad-k3' }, {}];
    const out = [];
    for (const me of roles) {
      const t = await boot136({ ls: lsOf([id], Object.assign({ pialax_idea_me_v1: me }, Object.keys(me)[0] && me[id] === 'ashwin-p8' ? { pialax_idea_keys_v1: keyOf([id]) } : {})) });
      act(t, 'open', { id }); if (t.api.S.sheet) t.api.closeSheet();
      const h = screen(t), chip = /<div class="thd"><h2 class="ttl">[\s\S]*?<\/h2><button class="chip dchip" data-act="tomap" data-id="[^"]+" aria-label="Map" data-k="dest"><span aria-hidden="true">📍<\/span>PIA<\/button>/.test(h);
      tap(t, h, 'tomap');
      out.push({ chip, tab: t.api.S.tab, sel: t.api.S.sel === id });
    }
    check(out.every((o) => o.chip && o.tab === 'map' && o.sel), 'PIA-137 AC5 📍PIA sits on the organizer\'s, the host\'s and a stranger\'s trip view, and one tap shows that trip on the Map', out);
  }
  {
    // AC6 the one primary action, rendered: share and look before dates are set, book and mark booked once set, Flighty after
    const free = seedAs(DWX), locked = seedAs(DWX, (d) => chosenAt(d, '2026-11-06', '2026-11-09', 'RDU')), home = seedAs(DWX, atPeoria);
    const view = async (id, me, key, before) => {
      if (before) await before();
      const t = await boot136({ ls: lsOf([id], Object.assign({ pialax_idea_me_v1: me ? { [id]: me } : {} }, key ? { pialax_idea_keys_v1: keyOf([id]) } : {})) });
      act(t, 'open', { id }); if (t.api.S.sheet) t.api.closeSheet();
      const h = screen(t), prim = (/<div class="split prim">([\s\S]*)<\/div>$/.exec(h) || [])[1] || '';
      const nav = h.slice(0, h.indexOf('<div class="thead">'));
      return { t, h, prim, navShare: /data-act="tshare"/.test(nav) };
    };
    const o1 = await view(free, 'ashwin-p8', true), g0 = await view(free, 'anjo-z5'), hst = await view(home, 'momdad-k3');
    const ans = await view(free, 'anjo-z5', false, async () => { const d = srv.read(free); d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); srv.write(d); });
    const ans2 = await view(free, 'ashwin-p8', true);   // (the same trip once Anjo answered: nobody waits)
    check(/^<button class="btn pri share dot" data-act="tshare" data-id="[^"]+"><span data-k="share"><svg class="shr"[\s\S]*?<\/svg><\/span> Share<\/button>$/.test(o1.prim) && !o1.navShare && !/google\.com\/travel/.test(o1.h) &&
      ans.prim === '' && !ans.navShare && !/google\.com\/travel/.test(ans.h),
      'PIA-154 AC6 before the dates are set: Share alone for the organizer while anyone waits (the nav\'s share steps aside for it), nothing for a guest who answered; no ✈↗ before 🔒 on any phone');
    check(/^<button class="btn pri" data-act="lockdates" data-id="[^"]+" aria-label="Lock dates"><span data-k="lock" aria-hidden="true">🔒<\/span> <span data-lbl3>Lock dates<\/span><\/button>$/.test(ans2.prim) && ans2.navShare,
      'PIA-154 AC6 once nobody waits (and the plan is dated, ahead, with a place), the organizer\'s primary is 🔒 Lock dates (its words the screen\'s marked label); his share is back in the nav');
    check(g0.prim === '' && !g0.navShare && hst.prim === '' && !hst.navShare && /data-act="answer"/.test(g0.h) && /Coming\?/.test(g0.h) && /Hosting\?/.test(hst.h),
      'PIA-137 AC6 a guest who has not answered has no primary (the answer row is the call: "Coming?"); a host has none ("Hosting?"); PIA-154: a guest\'s share is in ⋯ More, not the nav');
    const lk = await view(locked, 'anjo-z5', false, async () => { const d = srv.read(locked); d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); srv.write(d); });
    check(/^<a class="btn pri" href="https:\/\/www\.google\.com\/travel[^"]*" target="_blank" rel="noopener noreferrer" data-ret="[A-Za-z0-9_-]{22}"[^>]*data-k="gf"><span aria-hidden="true">✈<\/span> Book <span aria-hidden="true">↗<\/span><\/a><button class="btn tkb tkoff" data-act="mybook" data-id="[^"]+" aria-pressed="false" aria-label="I booked" data-lbl="I booked"><span class="tkg" data-k="tkoff" aria-hidden="true">☐<\/span> <span data-lbl3>I booked<\/span><\/button>$/.test(lk.prim),
      'PIA-137 AC6 once the dates are set (🔒): [✈ Book ↗ | 🎫 I booked] (PIA-154: the 🎫 says what it records)');
    const p0 = nPosts(lk.t);
    await tap(lk.t, lk.h, 'mybook'); await tick();
    const after = screen(lk.t), bp = posts(lk.t, 0).slice(-1)[0];
    check(nPosts(lk.t) - p0 === 1 && bp.path === '/idea/booked' && eq(bp.body, { member: 'anjo-z5', booked: true }) && srv.read(locked).responses['anjo-z5'].booked === true &&
      /<div class="split prim"><button class="btn pri pulse" data-act="mytimes" data-id="[^"]+" aria-label="Landing time"><span data-k="arrive" aria-hidden="true">🛬<\/span> <span data-lbl3>Landing time<\/span><\/button><\/div>$/.test(after) && !/data-act="mybook"/.test(after) && !/flighty\.com/.test(after),
      'PIA-137 AC6 🎫 marks me booked (one /idea/booked) and the primary becomes 🛬 Landing time (PIA-154: Flighty waits for my travel days)', bp);
    await tap(lk.t, after, 'mytimes');
    const msh = lk.t.api.S.sheet;
    check(msh && msh.type === 'person' && msh.p.code === 'anjo-z5' && /id="tm-arr"/.test(sheet(lk.t)) && !/placeholder=/.test(sheet(lk.t)), 'PIA-154 one tap opens my sheet at the 🛬 field (no ––:–– placeholder)');
    lk.t.api.closeSheet();
    CLOCK = Date.parse('2026-11-05T15:00:00Z');   // the day before my first day: my travel window
    lk.t.api.render(true);
    const trk = screen(lk.t);
    check(/<div class="split prim"><a class="btn pri" href="https:\/\/www\.flighty\.com\/"[^>]*aria-label="Track flight in Flighty" data-lbl="Track flight"><span data-k="flighty" aria-hidden="true">✈<\/span> <span data-lbl3>Track<\/span> <span aria-hidden="true">↗<\/span><\/a><\/div>$/.test(trk),
      'PIA-154 AC6 in my travel days (the day before my first day to my last) the primary is ✈ Track ↗ (Flighty)');
    CLOCK = NOW;
  }
  {
    // PIA-154 🔒 Lock dates: one tap locks the plan as it stands (the one organizerWrite P-dates' lock makes, through the real
    // Worker), the toast's ↩ unlocks it; once locked the primary is gone (the organizer hosts nothing here, nobody waits)
    const id = seedAs(DWX, (d) => { d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); });
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([id]) }), rec: ['#toast'] });
    act(t, 'open', { id }); if (t.api.S.sheet) t.api.closeSheet();
    const p0 = nPosts(t), h0 = screen(t);
    const r = await tap(t, h0, 'lockdates'); await tick();
    const ps = posts(t).slice(p0).filter((p) => p.path !== '/account'), d1 = srv.read(id), h1 = screen(t), toast1 = t.rec['#toast'].innerHTML;
    check(r && r.ok && ps.length === 1 && ps[0].path === '/idea/update' && d1.decision.stage === 'chosen' && t.api.modelOf(id).locked && /🔒/.test(toast1) && /data-act="undo"/.test(toast1) &&
      !/data-act="lockdates"/.test(h1) && /<button class="pill set"[\s\S]*?<span data-k="lock">🔒<\/span>/.test(h1) && eq(d1.idea.dates, srv.read(id).idea.dates),
      'PIA-154 🔒 Lock dates: one /idea/update (decision chosen) through the real Worker, the pill shows 🔒, the primary is gone, and the toast offers ↩', ps.map((p) => p.path));
    const u = await t.api.ACTS.undo(); await tick();
    check(u && u.ok && srv.read(id).decision.stage === 'proposed' && !t.api.modelOf(id).locked && /data-act="lockdates"/.test(screen(t)), 'PIA-154 ↩ in the toast unlocks it (decision proposed): 🔒 Lock dates is the primary again');
    const g = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    g.api.ACTS.lockdates({ dataset: { id } }); await tick();
    check(srv.read(id).decision.stage === 'proposed', 'PIA-154 a phone without the edit key cannot lock (nothing is sent)');
  }
  {
    // AC7 the organizer answers for anyone (📞), marks other travelers booked, and nudges one person with their hint
    const id = seedAs(DWX), rs = recShare();
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([id]) }), navigator: rs.nav });
    act(t, 'open', { id }); act(t, 'person', { id, code: 'anjo-z5' });
    const s = sheet(t);
    await tap(t, s, 'answer', { v: 'maybe', proxy: '1' }); await tick();
    const r = srv.read(id).responses['anjo-z5'], q = posts(t).slice(-1)[0];
    check(r && r.status === 'maybe' && r.note === '📞' && q.body.note === '📞' && eq(Object.keys(q.body), ['member', 'status', 'origin', 'available_from', 'available_to', 'note']),
      'PIA-137 AC7 the organizer answers Maybe for Anjo from her sheet: one complete answer marked 📞', q.body);
    t.api.closeSheet(); act(t, 'person', { id, code: 'anjo-z5' });
    tap(t, sheet(t), 'nudge'); await tick();
    check(rs.shared.length === 1 && eq(rs.shared[0], { url: W + '/i/' + id + '#m=anjo-z5' }), 'PIA-137 AC7 📣 Share on her sheet hands the share sheet her personal link (the guest link with #m=anjo-z5) and nothing else', rs.shared);
    // the share button asks for attention while anyone is unanswered, and again once the plan moved since his last 📣
    const lk = seedAs(DWX, (d) => { d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); });
    const t2 = await boot136({ ls: lsOf([lk], { pialax_idea_me_v1: { [lk]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([lk]) }), navigator: recShare().nav });
    act(t2, 'open', { id: lk });
    // (PIA-154: nobody waits on lk, so its primary is 🔒 Lock dates and the share is the nav's, its dot the call)
    const before = /class="ib share dot" data-act="tshare"/.test(screen(t2));
    tap(t2, screen(t2), 'tshare'); await tick();
    const calm = !/class="ib share dot"/.test(screen(t2)) && /class="ib share" data-act="tshare"/.test(screen(t2));
    const d2 = srv.read(lk); d2.idea.dates.departure = '2026-11-07'; d2.idea.dates.return = '2026-11-10'; srv.write(d2);
    await t2.api.refresh(lk); await t2.api.refresh(lk); await tick();   // (the first may be the open's own read, still in flight)
    const moved = /class="ib share dot" data-act="tshare"/.test(screen(t2));
    check(/share dot" data-act="tshare"/.test(t.api.renderTrip(id).html) && before && calm && moved,
      'PIA-137 AC7 his Share carries its dot while anyone has not answered (PIA-154: the primary then) and before his first share; after a share it is calm, and the dot is back once the plan has moved', { before, calm, moved });
  }
  {
    // AC7 🎫 on other travelers' rows once the dates are set: never a host, never his own row; a confirming tap for someone waiting or out
    const id = seedAs(DWX, (d) => { atPeoria(d); chosenAt(d, '2026-11-06', '2026-11-09', 'PIA'); });
    const rdu = seedAs(DWX, (d) => chosenAt(d, '2026-11-06', '2026-11-09', 'RDU'));
    const t = await boot136({ ls: lsOf([id, rdu], { pialax_idea_me_v1: { [id]: 'ashwin-p8', [rdu]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([id, rdu]) }) });
    act(t, 'open', { id });
    const psh = (tid, code) => { if (t.api.S.sheet) t.api.closeSheet(); act(t, 'person', { id: tid, code }); return sheet(t); };
    const tk = (code) => ctl(psh(id, code), 'booked', { code });
    const onBoard = /data-act="booked"/.test(screen(t));
    check(!onBoard && tk('anjo-z5') && !tk('momdad-k3') && !tk('ashwin-p8'), 'PIA-137 AC7 the organizer\'s 🎫 for someone is in their sheet (PIA-154: not on the board), on Anjo\'s only: none for a host (Mom & Dad live in Peoria), none in his own (his is 🎫 I booked)');
    const s0 = psh(id, 'anjo-z5'), p0 = nPosts(t);
    check(/<button class="btn tkb tkoff" data-act="booked" data-id="[^"]+" data-code="anjo-z5" aria-pressed="false" aria-label="Booked, Anjo" data-lbl="Booked"><span class="tkg" data-k="tkoff" aria-hidden="true">☐<\/span> Booked<\/button>/.test(s0), 'PIA-154 it says what it records: "Booked", outlined until it is on (PIA-156: a checkbox, "☐ Booked")');
    tap(t, s0, 'booked', { code: 'anjo-z5' }); await tick();
    const armed = sheet(t);
    await tap(t, armed, 'booked', { code: 'anjo-z5' }); await tick();
    const ps = posts(t).slice(p0), r = srv.read(id).responses['anjo-z5'];
    check(/class="btn tkb tkoff arm"[^>]*aria-label="Confirm booked, Anjo" data-lbl="Confirm booked"><span class="tkg" data-k="tkoff" aria-hidden="true">☐<\/span> Booked<span class="cfm" aria-hidden="true">✓<\/span>/.test(armed) && ps.length === 2 && ps[0].path === '/idea/respond' && ps[0].body.status === 'in' && ps[0].body.note === '📞' && ps[1].path === '/idea/booked' &&
      r.status === 'in' && r.booked === true && r.note === '📞',
      'PIA-137 AC7 marking Anjo (who has not answered) booked takes a confirming tap (the 🎫 pulses with ✓ first, nothing sent), then records her in (📞) and booked', ps.map((x) => x.path));
    const p1 = nPosts(t), s1 = psh(id, 'anjo-z5');
    tap(t, s1, 'booked', { code: 'anjo-z5' }); const one = nPosts(t) - p1;
    await tap(t, sheet(t), 'booked', { code: 'anjo-z5' }); await tick();
    check(one === 0 && srv.read(id).responses['anjo-z5'].booked === false && srv.read(id).responses['anjo-z5'].status === 'in', 'taking a 🎫 away also takes a confirming tap (her answer stays)');
    {
      // PIA-154: someone Out keeps the organizer's "🎫 Booked" in their sheet (where the board's 🎫 column had it): a confirming tap
      // records them in (📞) and booked, as before
      const oid = seedAs(DWX, (d) => { atPeoria(d); chosenAt(d, '2026-11-06', '2026-11-09', 'PIA'); d.responses['anjo-z5'] = { member: 'anjo-z5', status: 'out', origin: 'LGA', available_from: '', available_to: '', note: 'Work', arrive_at: '', leave_from: '', updated_at: '2026-10-12T00:00:00.000Z' }; });
      const to = await boot136({ ls: lsOf([oid], { pialax_idea_me_v1: { [oid]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([oid]) }) });
      act(to, 'open', { id: oid }); act(to, 'person', { id: oid, code: 'anjo-z5' });
      const so = sheet(to), q0 = nPosts(to);
      tap(to, so, 'booked', { code: 'anjo-z5' }); await tick();
      const armedO = sheet(to);
      await tap(to, armedO, 'booked', { code: 'anjo-z5' }); await tick();
      const ro = srv.read(oid).responses['anjo-z5'];
      check(/data-act="booked"[^>]*data-code="anjo-z5" aria-pressed="false" aria-label="Booked, Anjo"/.test(so) && /aria-label="Confirm booked, Anjo"/.test(armedO) && nPosts(to) - q0 === 2 && ro.status === 'in' && ro.booked === true && /^📞/.test(ro.note),
        'PIA-154 someone Out keeps the organizer\'s "🎫 Booked" in their sheet once the dates are set: a confirming tap, then in (📞) and booked', { status: ro.status, booked: ro.booked, note: ro.note });
    }
    t.api.closeSheet(); act(t, 'back'); act(t, 'open', { id: rdu });
    const s2 = psh(rdu, 'momdad-k3'), p2 = nPosts(t);
    await tap(t, s2, 'booked', { code: 'momdad-k3' }); await tick();
    check(nPosts(t) - p2 === 1 && srv.read(rdu).responses['momdad-k3'].booked === true, 'someone who answered in is marked booked with one tap (one /idea/booked)');
  }
  {
    // AC8 notes: ≤20 words by the person (or the organizer for them, 📞); everyone else reads a preview; v1 proxy notes read as 📞
    const long = Array.from({ length: 26 }, (_, i) => 'word' + i).join(' ');
    const id = seedAs(DWX, (d) => { d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'EWR', available_from: '2026-11-05', available_to: '2026-11-09', note: long, leave_from: '' }); });
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(t, 'open', { id }); act(t, 'person', { id, code: 'anjo-z5' });
    const ps = sheet(t), prev = (/<button class="notep"[^>]*><span data-k="note">📝<\/span><span>([^<]*)<\/span>/.exec(ps) || [])[1] || '';
    tap(t, ps, 'pnote');
    const L = t.api.S.sheet.local, nh = sheet(t);
    check(prev === 'word0 word1 word2 word3 word4 word5 word6 word7…' && t.api.S.sheet.back && /maxlength="280"/.test(nh) && L.edit && L.long && L.text.split(' ').length === 20 && /data-k="warn">⚠/.test(nh),
      'PIA-137 AC8 her sheet previews her note (8 words…); P-note opens her own text to edit at its first 20 words with ⚠ (a longer note), capped to the room the Worker leaves', { prev });
    L.text = 'Taking the red-eye Thursday night';
    t.api.closeSheet();
    const still = !!t.api.S.sheet;
    t.api.closeSheet(); await until(() => srv.read(id).responses['anjo-z5'].note !== long); await tick();
    const r = srv.read(id).responses['anjo-z5'];
    check(still && r.note === 'Taking the red-eye Thursday night' && r.available_from === '2026-11-05' && r.available_to === '2026-11-09' && r.origin === 'EWR' && r.status === 'in',
      'PIA-137 AC8 replacing the longer note asks for a second ⌄, then saves hers (no 📞) inside one complete answer: her days, origin and answer kept', r);
    const org = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([id]) }) });
    act(org, 'open', { id }); act(org, 'person', { id, code: 'anjo-z5' }); tap(org, sheet(org), 'pnote');
    const ro = sheet(org), roL = org.api.S.sheet.local;
    check(!/<textarea/.test(ro) && /data-act="noteedit"/.test(ro) && roL.canEdit && !roL.edit && org.api.S.sheet.focus == null,
      'PIA-137 the organizer opening someone else\'s note reads it first (no field, no keyboard); ✎ makes it a field');
    tap(org, ro, 'noteedit');
    check(/<textarea id="note-text"/.test(sheet(org)) && /data-act="notesave" aria-label="Save" data-k="ok">✓<\/button>/.test(sheet(org)), '…with ✓ to save it');
    org.api.S.sheet.local.text = 'She called: red-eye confirmed'; org.api.closeSheet();
    await until(() => /confirmed/.test(srv.read(id).responses['anjo-z5'].note)); await tick();
    check(srv.read(id).responses['anjo-z5'].note === '📞 She called: red-eye confirmed' && srv.read(id).responses['anjo-z5'].origin === 'EWR', 'PIA-137 AC8 the organizer writing her note for her marks it 📞');
    const g = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'momdad-k3' } }) });
    act(g, 'open', { id }); act(g, 'person', { id, code: 'anjo-z5' }); tap(g, sheet(g), 'pnote');
    const rv = sheet(g);
    check(!/<textarea/.test(rv) && /<p class="notev">She called: red-eye confirmed<\/p>/.test(rv), 'someone else reads her note (no field): the text only, its 📞 a mark and never words');
    const tg = seedAs(TGX);
    const v1 = await boot136({ ls: lsOf([tg], { pialax_idea_me_v1: { [tg]: 'PIA' } }) });
    act(v1, 'open', { id: tg }); act(v1, 'person', { id: tg, code: 'LGA' });
    const vs = sheet(v1);
    check(/data-k="called">📞/.test(vs) && /Arriving late, PTO approved/.test(vs) && !/entered by/.test(vs + screen(v1)), 'PIA-137 AC8 a v1 proxy note ("… (entered by Ashwin)") reads as 📞 with its text, never the v1 words');
  }
  {
    // AC9 airport cells only for the Worker's hub pairs; a change redraws that person's link and bar at once
    const id = seedAs(DWX, (d) => { atPeoria(d); d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); });
    const rdu = seedAs(DWX, (d) => { d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); });
    const t = await boot136({ ls: lsOf([id, rdu], { pialax_idea_me_v1: { [id]: 'anjo-z5', [rdu]: 'anjo-z5' } }) });
    act(t, 'open', { id: rdu }); act(t, 'person', { id: rdu, code: 'anjo-z5' });
    const plain = sheet(t); t.api.closeSheet(); act(t, 'back');
    act(t, 'open', { id }); act(t, 'person', { id, code: 'anjo-z5' });
    const s0 = sheet(t), radios = (s0.match(/data-act="legair"/g) || []).length;
    check(!/legair/.test(plain) && radios === 4 && /<div class="leghd" aria-hidden="true"><span class="lh0"><\/span><span>PIA<\/span><span>ORD<\/span><\/div>/.test(s0) && /aria-checked="true" data-act="legair"[^>]*data-end="1" data-v="PIA"/.test(s0),
      'PIA-137 AC9 airport cells only where the destination is a hub pair: none for Raleigh, PIA | ORD for each end in Peoria (both on PIA)', { radios });
    const p0 = nPosts(t), f0 = t.fetches.length;
    // a code outside the pair, handed straight to the action (no control draws one): refused, nothing sent
    const mdw = t.api.ACTS.legair({ dataset: { id, code: 'anjo-z5', end: '1', v: 'MDW' } });
    const mdw0 = t.api.ACTS.legair({ dataset: { id, code: 'anjo-z5', end: '0', v: 'MDW' } });
    check(mdw === null && mdw0 === null && nPosts(t) === p0 && t.fetches.length === f0, 'PIA-137 AC9 the airport action refuses a code outside the hub pair (MDW for Peoria): nothing is sent, not even a read');
    const hold = deferred(); srv.hold = hold.p;
    const w = tap(t, s0, 'legair', { end: '1', v: 'ORD' });
    t.flush();   // the next frame: before the Worker has answered
    const mid = t.api.modelOf(id).me, s1 = sheet(t), href = (/<a class="btn pri(?: wide)?" href="([^"]+)"/.exec(s1) || [])[1] || '';   // (PIA-151: Book beside her 🎫)
    const dec = TM.gfDecode(href.replace(/&amp;/g, '&')), board = screen(t);
    srv.hold = null; hold.res(); await w; await tick();
    check(nPosts(t) - p0 === 1 && mid.H === 'ORD' && mid.link.trip === 3 && dec && dec.trip === 3 && eq(dec.legs[1].from, ['ORD']) && /data-end="1" data-v="ORD"/.test(s1) && /aria-checked="true" data-act="legair"[^>]*data-end="1" data-v="ORD"/.test(s1) &&
      /data-k="drive">🚗/.test(board) && srv.read(id).responses['anjo-z5'].leave_from === 'ORD' && srv.read(id).responses['anjo-z5'].origin === 'LGA',
      'PIA-137 AC9 tapping 🛫 ORD redraws at once (before the Worker answers): her link becomes one multi-city search home from ORD and her bar ends in 🚗; a code outside the pair is never sent', { trip: dec && dec.trip });
  }
  {
    // AC10 answering from the trip view never erases her days, note or origin (the real Worker)
    const id = seedAs(DWX, (d) => { d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'EWR', available_from: '2026-11-05', available_to: '2026-11-09', note: 'Taking Friday off' }); });
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(t, 'open', { id });
    for (const v of ['maybe', 'out', 'in']) { await tap(t, screen(t), 'answer', { v }); await tick(); }
    const r = srv.read(id).responses['anjo-z5'];
    check(r.status === 'in' && r.available_from === '2026-11-05' && r.available_to === '2026-11-09' && r.note === 'Taking Friday off' && r.origin === 'EWR',
      'PIA-137 AC10 Maybe, Out, In from the answer row: her own days, note and EWR override are all still there in the Worker\'s record', r);
  }
  {
    // AC11 a closed trip (paid or dropped) shows its closed state instead of taps that fail; a trip that is merely Done takes answers
    const booked = (d) => { chosenAt(d, '2026-11-06', '2026-11-09', 'RDU'); ['momdad-k3', 'ashwin-p8'].forEach((c) => { d.responses[c].booked = true; }); d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA', booked: true }); };
    const paid = seedAs(DWX, (d) => { booked(d); d.decision.stage = 'booked'; d.decision.actual_total = 1200; });
    const drop = seedAs(DWX, (d) => { d.decision.stage = 'dropped'; });
    const done = seedAs(DWX, booked);
    const t = await boot136({ ls: lsOf([paid, drop, done], { pialax_idea_me_v1: { [paid]: 'ashwin-p8', [drop]: 'ashwin-p8', [done]: 'anjo-z5' }, pialax_idea_keys_v1: keyOf([paid, drop]) }) });
    act(t, 'open', { id: paid });
    const ph = screen(t); act(t, 'person', { id: paid, code: 'anjo-z5' }); const pp = sheet(t); t.api.closeSheet();
    act(t, 'person', { id: paid, code: 'ashwin-p8' }); const mine = sheet(t); t.api.closeSheet();
    const p0 = nPosts(t);
    await t.api.ACTS.answer({ dataset: { id: paid, v: 'maybe', code: 'ashwin-p8' } });
    check(/<div class="daterow">[\s\S]*?<span class="achip closed" role="img" aria-label="Trip closed" data-lbl="Trip closed" data-k="st-done">🏁<\/span><\/div>/.test(ph) && !/data-act="(answer|achip|booked|mybook|legair|origedit)"/.test(ph + pp) && !/aria-label="Add note"/.test(pp) && nPosts(t) === p0 &&
      !/split prim/.test(ph) && /data-k="flighty"/.test(mine),
      'PIA-137 AC11 a paid trip shows 🏁 closed (PIA-154: at the date row\'s end) instead of the answer row: no answer, 🎫, airport cell or note to add (a tap there sends nothing); a booked traveler keeps Flighty in their sheet (the primary is ✈ Track only in their travel days)');
    act(t, 'back'); act(t, 'open', { id: drop });
    const dh = screen(t);
    check(/aria-label="Removed" data-lbl="Removed" data-k="dropped">🗑<\/span>/.test(dh) && !/data-act="answer"|split prim|data-act="tshare"/.test(dh), 'PIA-137 AC11 a dropped trip shows 🗑 (PIA-155: named "Removed"): no answer row, no primary, no share');
    act(t, 'back'); act(t, 'open', { id: done });
    const m = t.api.modelOf(done), oh = screen(t);
    await tap(t, oh, 'achip'); const oh2 = screen(t);
    await tap(t, oh2, 'answer', { v: 'maybe' }); await tick();
    check(m.stage === 'done' && !m.closed && /data-act="achip"/.test(oh) && /data-act="answer"/.test(oh2) && srv.read(done).responses['anjo-z5'].status === 'maybe' && srv.read(done).responses['anjo-z5'].booked === true,
      'PIA-137 AC11 a trip that is merely Done (every traveler booked, nothing paid) still takes an answer (PIA-154: her chip opens the row), and her 🎫 stays');
  }
  {
    // P-stage: the stage; ⭐ pins the trip in my list; 🗄 hides it on this phone
    const id = seedAs(DWX);
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(t, 'open', { id }); tap(t, screen(t), 'stage');
    const s = sheet(t);
    tap(t, s, 'star'); tap(t, sheet(t), 'hidehere');
    const e = t.api.listEntry(id), s2 = sheet(t);
    const acts = (s.match(/data-act="[a-z-]+"/g) || []).map((x) => x.slice(10, -1));
    const line = (/<div class="sline[^"]*"[\s\S]*?<\/div>/.exec(s) || [''])[0];
    check(t.api.S.sheet.type === 'stage' && eq(shown(line), ['Asking']) &&
      line === '<div class="sline" role="img" aria-label="Stage 2 of 5, Asking" data-lbl="Stage 2 of 5, Asking"><span class="strk" aria-hidden="true"><i class="done"></i><i class="now"></i><i class=""></i><i class=""></i><i class=""></i></span><span class="sword">Asking</span></div>' &&
      !/class="stepper|class="srow|role="list/.test(s) && !/<(button|a)\b[^>]*>[^<]*<span class="strk/.test(s) &&
      /data-act="hidehere"[^>]*><span class="mg" aria-hidden="true" data-k="hidehere">🗄<\/span>Hide on my phone<\/button>/.test(s) && /data-act="hidehere"[^>]*><span class="mg" aria-hidden="true" data-k="hidehere">🗄<\/span>Show on my phone<\/button>/.test(s2) && !/data-act="hidehere"[^>]*aria-pressed/.test(s + s2) &&
      acts.indexOf('star') >= 0 && acts.indexOf('hidehere') >= 0 && acts.indexOf('tshare') >= 0 && acts.indexOf('edit') < 0 && acts.indexOf('stagedrop') < 0 && e.pin && e.arch && t.api.modelOf(id).shelf && nPosts(t) === 0,
      'P-stage (PIA-154: ⋯ More; PIA-155: the stage is one picture, five dots and the word it is at, "Stage 2 of 5, Asking", nothing in it a control); ☆ Pin pins it and "🗄 Hide on my phone" hides it on this phone only (nothing written to the trip), then reads "🗄 Show on my phone"; a guest also has Share there, never Edit or Remove', { e, acts, line });
  }

  // ═══ PIA-137 fix pass ═══
  section('PIA-137 fix pass: a hint never overrides who this phone is elsewhere; writes rebuilt from a fresh read, one at a time; identity without storage; ↻ resends; confirming taps; join requests that are never lost');
  {
    // a forwarded nudge link: Dad's phone (profile 🌽 Mom & Dad) opens Anjo's #m= on a trip it has never opened
    const id = seedAs(DWX);
    const t = await linkPhone('?idea=' + id + '#m=anjo-z5', seedLs({ pialax_ui_v1: { v1read: 1 }, pialax_me_profile_v1: { label: '🌽 Mom & Dad' } }));
    const sh = t.api.S.sheet, h = sheet(t), me0 = t.api.modelOf(id).me;
    check(sh && sh.type === 'face' && sh.p.hint === 'anjo-z5' && sh.p.pre === 'momdad-k3' && !me0 && t.api.meFor(id) === '' &&
      /class="tile hint" id="pf-mark"[^>]*data-code="momdad-k3"[^>]*><span class="tw" data-k="you">👋/.test(h) && /class="tile hinted"[^>]*data-code="anjo-z5"/.test(h),
      'PIA-137 a nudge link for Anjo on a phone whose profile is Mom & Dad (on this trip) is never greeted as Anjo: P-face asks, Mom & Dad outlined and 👋, Anjo only marked', { pre: sh && sh.p.pre, me: me0 && me0.code });
    t.api.closeSheet();
    const r0 = await t.api.ACTS.answer({ dataset: { id, v: 'in', code: '' } });
    check(r0 === null && t.api.S.sheet && t.api.S.sheet.type === 'face' && nPosts(t) === 0 && JSON.parse(t.ls.getItem('pialax_me_profile_v1')).label === '🌽 Mom & Dad' && !srv.read(id).responses['anjo-z5'],
      '…so In from that phone asks who it is (P-face) and writes nothing: Anjo is not answered for, and the profile stays Mom & Dad');
    // a profile that is nobody on the trip: the hint still greets, and the hinted first answer leaves that profile alone
    const id2 = seedAs(DWX);
    const t2 = await linkPhone('?idea=' + id2 + '#m=anjo-z5', seedLs({ pialax_ui_v1: { v1read: 1 }, pialax_me_profile_v1: { label: '🦊 Priya Raman' } }));
    const g2 = t2.api.modelOf(id2).me;
    await tap(t2, screen(t2), 'answer', { v: 'maybe' }); await tick();
    check(!t2.api.S.sheet && g2 && g2.code === 'anjo-z5' && t2.api.meFor(id2) === 'anjo-z5' && srv.read(id2).responses['anjo-z5'].status === 'maybe' && JSON.parse(t2.ls.getItem('pialax_me_profile_v1')).label === '🦊 Priya Raman',
      'a profile for someone who is not on the trip: the hint greets Anjo, her answer makes this phone Anjo here, and the profile (Priya, elsewhere) is not replaced');
    // an explicit tap in P-face does make it the profile (the spec's writes)
    const id3 = seedAs(DWX);
    const t3 = await linkPhone('?idea=' + id3, seedLs({ pialax_ui_v1: { v1read: 1 }, pialax_me_profile_v1: { label: '🦊 Priya Raman' } }));
    tap(t3, sheet(t3), 'pickface', { code: 'anjo-z5' });
    check(JSON.parse(t3.ls.getItem('pialax_me_profile_v1')).label === '🗽 Anjo', 'a face picked in P-face becomes the profile');
  }
  {
    // two phones: the organizer's screen is older than Anjo's own answer; his 📞 Maybe for her keeps her days, note and EWR
    const id = seedAs(DWX);
    const org = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([id]) }) });
    act(org, 'open', { id }); act(org, 'person', { id, code: 'anjo-z5' });
    const stale = sheet(org);
    const anjo = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(anjo, 'open', { id });
    const ra = await anjo.api.respond(id, 'anjo-z5', { status: 'in', available_from: '2026-11-05', available_to: '2026-11-09', note: 'Taking Friday off', origin: 'EWR' }, { by: 'self' });
    const before = org.api.DOCS[id].responses['anjo-z5'];
    const n0 = org.fetches.length;
    await tap(org, stale, 'answer', { v: 'maybe', proxy: '1' }); await tick();
    const seq = org.fetches.slice(n0).map((f) => f.method + ' ' + f.url.replace(W, '').split('?')[0]), r = srv.read(id).responses['anjo-z5'];
    check(ra.ok && !before && eq(seq, ['GET /idea', 'POST /idea/respond']) && r.status === 'maybe' && r.available_from === '2026-11-05' && r.available_to === '2026-11-09' && r.origin === 'EWR' && r.note === '📞 Taking Friday off',
      'PIA-137 a proxy answer from a stale screen reads the trip first (GET, then the answer) and keeps the days, note and EWR she wrote meanwhile on her phone (📞 added)', { seq, r });
    // and the other way round: her own tap from a stale screen keeps the airport cell he set meanwhile
    const pk = seedAs(DWX, (d) => { atPeoria(d); d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); });
    const a2 = await boot136({ ls: lsOf([pk], { pialax_idea_me_v1: { [pk]: 'anjo-z5' } }) });
    act(a2, 'open', { id: pk });
    const o2 = await boot136({ ls: lsOf([pk], { pialax_idea_me_v1: { [pk]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([pk]) }) });
    act(o2, 'open', { id: pk });
    await o2.api.ACTS.legair({ dataset: { id: pk, code: 'anjo-z5', end: '1', v: 'ORD' } }); await tick();
    await answerTap(a2, 'maybe'); await tick();
    const r2 = srv.read(pk).responses['anjo-z5'];
    check(r2.status === 'maybe' && r2.leave_from === 'ORD' && r2.origin === 'LGA', 'her own answer from a stale screen keeps the ORD cell the organizer set meanwhile', r2);
  }
  {
    // one at a time: In then Maybe while the Worker is slow; only one request is out at once, and the last tap is what stays
    const id = seedAs(DWX);
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(t, 'open', { id });
    const hold = deferred(); srv.hold = hold.p;
    const n0 = t.fetches.length;
    const p1 = tap(t, screen(t), 'answer', { v: 'in' });
    const p2 = answerTap(t, 'maybe');
    await tick();
    const out = t.fetches.length - n0, drawn = t.api.DOCS[id].responses['anjo-z5'].status, pend = t.api.PEND[id];
    srv.hold = null; hold.res(); await p1; await p2; await tick();
    const seq = t.fetches.slice(n0).map((f) => f.method + ' ' + f.url.replace(W, '').split('?')[0] + (f.body ? ' ' + JSON.parse(f.body).status : ''));
    check(out === 1 && drawn === 'maybe' && pend === 2 && eq(seq, ['GET /idea', 'POST /idea/respond in', 'GET /idea', 'POST /idea/respond maybe']) && srv.read(id).responses['anjo-z5'].status === 'maybe' &&
      t.api.DOCS[id].responses['anjo-z5'].status === 'maybe' && t.api.PEND[id] === 0,
      'PIA-137 two taps on a slow network: the screen shows the last one at once, one request is out at a time (in order, each read fresh), and Maybe is what the Worker keeps', { out, seq });
  }
  {
    // storage that refuses every write (blocked site data): the face picked this visit still answers
    const id = seedAs(DWX);
    const ls = lsOf([id]); ls.setItem = () => { throw new Error('QuotaExceededError'); };
    const t = await boot136({ ls });
    act(t, 'open', { id });
    const sh = t.api.S.sheet && t.api.S.sheet.type;
    tap(t, sheet(t), 'pickface', { code: 'anjo-z5' });
    const me = t.api.modelOf(id).me, p0 = nPosts(t);
    await tap(t, screen(t), 'answer', { v: 'in' }); await tick();
    check(sh === 'face' && me && me.code === 'anjo-z5' && nPosts(t) - p0 === 1 && srv.read(id).responses['anjo-z5'].status === 'in' && !t.api.S.sheet,
      'PIA-137 with a localStorage whose writes throw, P-face → 🗽 still makes this phone Anjo for the visit, and In sends one answer (no loop back to P-face)', { sh, me: me && me.code });
  }
  {
    // the same phone, empty, and a group link to a trip it has never opened, through the router: the trip is listed in
    // memory for the visit, read and drawn (not the empty Trips list), P-face asks by itself, and the face picked answers
    const id = seedAs(DWX);
    const ls = seedLs({}); ls.setItem = () => { throw new Error('QuotaExceededError'); };
    const t = await linkPhone('?idea=' + id, ls);
    const st = { list: t.api.listIds(), trip: t.api.S.trip, scr: t.api.S.trip ? t.api.renderTrip(t.api.S.trip).id : '', sh: t.api.S.sheet && t.api.S.sheet.type,
      gets: t.fetches.filter((f) => f.method === 'GET' && f.url.indexOf('id=' + id) >= 0).length, search: t.loc.search };
    const p0 = nPosts(t), calls = countActs(t);
    tap(t, sheet(t), 'pickface', { code: 'anjo-z5' });
    const me = t.api.modelOf(id) && t.api.modelOf(id).me;
    await tap(t, screen(t), 'answer', { v: 'in' }); await tick();
    const n1 = nPosts(t) - p0, r1 = srv.read(id).responses['anjo-z5'];
    await answerTap(t, 'maybe'); await tick();
    const n2 = nPosts(t) - p0, r2 = srv.read(id).responses['anjo-z5'];
    check(eq(st.list, [id]) && st.trip === id && st.scr === 'trip-portal' && st.sh === 'face' && st.gets === 1 && st.search === '?idea=' + id,
      'PIA-137 a group link to a new trip on a phone whose storage refuses every write: the trip is listed for the visit, read once, drawn (the address keeps ?idea=), and P-face asks by itself', st);
    check(me && me.code === 'anjo-z5' && eq(calls, ['pickface', 'answer', 'achip', 'answer']) && n1 === 1 && r1 && r1.status === 'in' && n2 === 2 && r2.status === 'maybe' && !t.api.S.sheet &&
      ls.getItem('pialax_watchlist_v2') === null && ls.getItem('pialax_idea_me_v1') === null,
      '…then 🗽 and In send one answer, and Maybe a second (no loop back to P-face); nothing was stored', { n1, n2, calls, me: me && me.code });
    // the phone's Trips list shows the trip for the visit too
    t.api.ACTS.back(); t.flush();
    check(t.api.activeItems().some((it) => it.id === id && it.m), 'back on Trips › Ideas, the trip is a card for the rest of the visit', t.api.activeItems().map((it) => it.id));
  }
  {
    // a full quota: the stored list holds another trip and refuses the longer one. Both trips are read; the link's is drawn;
    // what is stored is left as it was
    const id = seedAs(DWX), other = seedAs(THX);
    const ls = lsOf([other]); ls.setItem = () => { throw new Error('QuotaExceededError'); };
    const t = await linkPhone('?idea=' + id, ls);
    const got = (x) => t.fetches.filter((f) => f.method === 'GET' && f.url.indexOf('id=' + x) >= 0).length;
    check(eq(t.api.listIds(), [other, id]) && got(id) === 1 && got(other) === 1 && t.api.S.trip === id && t.api.S.sheet && t.api.S.sheet.type === 'face' &&
      eq(JSON.parse(ls.getItem('pialax_watchlist_v2')).map((x) => x.id), [other]),
      'PIA-137 a full quota with another trip listed: a link to a new trip reads both, opens the new one with P-face, and the stored list is unchanged', { list: t.api.listIds(), id: got(id), other: got(other) });
  }
  {
    // blocked site data where every access throws (getItem too): the link still opens its trip, and the picked face answers
    const id = seedAs(DWX);
    const boom = () => { throw new Error('SecurityError'); };
    const t = await linkPhone('?idea=' + id, { getItem: boom, setItem: boom, removeItem: boom, clear: boom });
    const sh = t.api.S.sheet && t.api.S.sheet.type, p0 = nPosts(t);
    tap(t, sheet(t), 'pickface', { code: 'anjo-z5' });
    await tap(t, screen(t), 'answer', { v: 'in' }); await tick();
    check(sh === 'face' && t.api.S.trip === id && nPosts(t) - p0 === 1 && srv.read(id).responses['anjo-z5'].status === 'in' && !t.api.S.sheet,
      'PIA-137 storage whose every access throws: the link opens the trip, P-face asks, and 🗽 then In answer once', { sh, posts: nPosts(t) - p0 });
  }
  {
    // …and a link to a trip the Worker does not have, on such a phone: "Trip not found", and the trip leaves the list again
    const Z = 'zzTripThatIsGone0000z2';
    const ls = seedLs({ pialax_ui_v1: { v1read: 1 } }); ls.setItem = () => { throw new Error('QuotaExceededError'); };
    const t = loadApp({ fetch: srv.fetch, url: BASE + '?idea=' + Z, ls });
    const listed = t.api.listIds().indexOf(Z) >= 0;
    await until(() => t.api.STAT[Z] === 'missing'); await tick(); t.flush();
    check(listed && t.api.listIds().indexOf(Z) < 0 && t.api.S.trip === null && t.api.S.sheet && t.api.S.sheet.type === 'error' && t.api.S.sheet.p.code === 'not_found',
      'PIA-137 on that phone a link to a trip the Worker has never heard of says "Trip not found" and leaves the list as it was', { listed, list: t.api.listIds(), sheet: t.api.S.sheet && t.api.S.sheet.type });
  }
  {
    // a failed answer: P-error says it was not saved, and ↻ sends that answer again (once)
    const id = seedAs(DWX);
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(t, 'open', { id });
    srv.failOn = '/idea/respond';
    const r = await tap(t, screen(t), 'answer', { v: 'maybe' }); await tick();
    const sh = t.api.S.sheet, eh = sheet(t), back = t.api.DOCS[id].responses['anjo-z5'];
    const resp = () => t.fetches.filter((f) => f.method === 'POST' && f.url.indexOf('/idea/respond') >= 0).length, n1 = resp();
    const rr = await t.api.ACTS.eretry(); await tick();
    check(!r.ok && typeof r.retry === 'function' && sh && sh.type === 'error' && typeof sh.p.retry === 'function' && /📶⚠/.test(eh) && /Not saved/.test(eh) && /data-act="eretry"/.test(eh) && !back &&
      rr && rr.ok && resp() - n1 === 1 && srv.read(id).responses['anjo-z5'].status === 'maybe' && t.api.DOCS[id].responses['anjo-z5'].status === 'maybe',
      'PIA-137 a failed answer: the screen goes back, P-error shows 📶⚠ Not saved and ↻, and ↻ sends that answer exactly once more (saved)', { n1, after: resp() });
  }
  {
    // 📞 taken over: the organizer answered Maybe for her; her own tap on Maybe clears 📞 and keeps the rest of her note
    const id = seedAs(DWX, (d) => { d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA', note: 'Taking Friday off' }); });
    const org = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([id]) }) });
    act(org, 'open', { id }); act(org, 'person', { id, code: 'anjo-z5' });
    await tap(org, sheet(org), 'answer', { v: 'maybe', proxy: '1' }); await tick();
    const mid = srv.read(id).responses['anjo-z5'].note;
    const again = await tap(org, (org.api.renderSheet(false), sheet(org)), 'answer', { v: 'maybe', proxy: '1' });
    const anjo = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(anjo, 'open', { id });
    const p0 = nPosts(anjo);
    await answerTap(anjo, 'maybe'); await tick();
    const q = posts(anjo, 0).slice(-1)[0], r = srv.read(id).responses['anjo-z5'];
    check(mid === '📞 Taking Friday off' && again === null && nPosts(anjo) - p0 === 1 && q.body.status === 'maybe' && q.body.note === 'Taking Friday off' && r.note === 'Taking Friday off' && r.status === 'maybe' && r.origin === 'LGA',
      'PIA-137 her own tap on the answer the organizer entered (Maybe, 📞) takes it over: one answer, 📞 gone, her note kept; his second tap on the same answer sends nothing', { mid, sent: q && q.body });
  }
  {
    // Out takes a 🎫 away (the Worker drops it), so a booked person's Out asks for a confirming tap; it lapses and is put back
    const id = seedAs(DWX, (d) => { chosenAt(d, '2026-11-06', '2026-11-09', 'RDU'); d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA', booked: true }); });
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(t, 'open', { id });
    const p0 = nPosts(t);
    const first = answerTap(t, 'out');
    const armedH = screen(t);
    act(t, 'back'); act(t, 'open', { id });
    const afterLeave = t.api.S.armTk;
    answerTap(t, 'out');
    CLOCK = NOW + 7000; const lapsed = !/class="ans out arm"/.test(screen(t)); CLOCK = NOW;
    answerTap(t, 'out'); t.api.openSheet('stage', { id }); t.api.closeSheet();
    const afterSheet = t.api.S.armTk;
    answerTap(t, 'out');
    const one = nPosts(t) - p0;
    await answerTap(t, 'out'); await until(() => !(t.api.PEND[id] > 0)); await tick();   // (the write landed, however slow its hash)
    const r = srv.read(id).responses['anjo-z5'];
    check(first === null && /class="ans out arm"[^>]*aria-label="Confirm Out"[^>]*>[\s\S]*?<span class="cfm" aria-hidden="true">✈↩<\/span><\/button>/.test(armedH) && afterLeave === null && lapsed && afterSheet === null && one === 0 && r.status === 'out' && !r.booked && nPosts(t) - p0 === 1,
      'PIA-137 Out for someone booked: the first tap sends nothing and pulses Out with 🎫↩; leaving the trip, a sheet closing or 6s put it back; the confirming tap sends Out (the 🎫 goes)', { afterLeave, lapsed, afterSheet, one });
    // the organizer's armed 🎫 is put back the same way
    const lk = seedAs(DWX, (d) => chosenAt(d, '2026-11-06', '2026-11-09', 'RDU'));
    const o = await boot136({ ls: lsOf([lk], { pialax_idea_me_v1: { [lk]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([lk]) }) });
    act(o, 'open', { id: lk });
    act(o, 'person', { id: lk, code: 'anjo-z5' });   // (PIA-154: the organizer's 🎫 for someone is in their sheet)
    tap(o, sheet(o), 'booked', { code: 'anjo-z5' }); const armedTk = o.api.S.armTk;
    o.api.closeSheet(); act(o, 'back'); act(o, 'open', { id: lk });
    const q0 = nPosts(o);
    act(o, 'person', { id: lk, code: 'anjo-z5' });
    tap(o, sheet(o), 'booked', { code: 'anjo-z5' });
    check(!!armedTk && nPosts(o) === q0 && !!o.api.S.armTk, 'an armed 🎫 left behind is disarmed: coming back, one tap only arms it again (nothing sent)');
  }
  {
    // guests never hand out someone else's personal link; the organizer's 📣 on a sheet does; a member gone mid-sheet is no crash
    const id = seedAs(M8X), rs = recShare(), ro = recShare();
    const g = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'samlee-sb' } }), navigator: rs.nav });
    act(g, 'open', { id }); act(g, 'person', { id, code: 'anastasiakonstantinopoulou-x1' });
    tap(g, sheet(g), 'nudge'); await tick();
    const o = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'grandmajosephine-nf' }, pialax_idea_keys_v1: keyOf([id]) }), navigator: ro.nav });
    act(o, 'open', { id }); act(o, 'person', { id, code: 'anastasiakonstantinopoulou-x1' });
    tap(o, sheet(o), 'nudge'); await tick();
    let threw = null;
    try { g.api.ACTS.nudge({ dataset: { id, code: 'nobody-zz' } }); } catch (e) { threw = e; }
    check(rs.shared.length === 1 && eq(rs.shared[0], { url: W + '/i/' + id }) && ro.shared.length === 1 && eq(ro.shared[0], { url: W + '/i/' + id + '#m=anastasiakonstantinopoulou-x1' }) && !threw,
      'PIA-137 📣 Share on someone else\'s sheet: a guest shares the group link (never her #m= link); the organizer shares her personal one; a member who is gone shares nothing and throws nothing', { guest: rs.shared, org: ro.shared });
  }
  {
    // a hinted face's airport cell or origin makes it this phone's face, as its answer would
    const id = seedAs(DWX, (d) => { atPeoria(d); d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); });
    const t = await linkPhone('?idea=' + id + '#m=anjo-z5');
    const m0 = t.api.meFor(id);
    await t.api.ACTS.legair({ dataset: { id, code: 'anjo-z5', end: '0', v: 'ORD' } }); await tick();
    const id2 = seedAs(DWX, (d) => { d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); });
    const t2 = await linkPhone('?idea=' + id2 + '#m=anjo-z5');
    act(t2, 'person', { id: id2, code: 'anjo-z5' }); act(t2, 'origedit', { id: id2, code: 'anjo-z5' });
    t2.api.S.sheet.local.orig = 'EWR'; await t2.api.ACTS.origsave({ dataset: { id: id2, code: 'anjo-z5' } }); await tick();
    check(m0 === '' && t.api.meFor(id) === 'anjo-z5' && srv.read(id).responses['anjo-z5'].arrive_at === 'ORD' && t2.api.meFor(id2) === 'anjo-z5' && srv.read(id2).responses['anjo-z5'].origin === 'EWR',
      'PIA-137 a hinted face that sets an airport cell or where it flies from becomes this phone\'s face (as an answer, 🎫 or note would)');
  }
  {
    // a join request that reaches a phone without the key: P-joinfwd, 📣 sends the same link on; the joiner's own P-face
    // shows the request as pending (⏳ and the name), and 🙋＋ reopens it filled to send again
    const id = seedAs(THX), rs = recShare();
    const t = await linkPhone('?idea=' + id + '&add=' + encodeURIComponent('Sam Rivera.OAK'), lsOf([id], { pialax_idea_me_v1: { [id]: 'priya-d4' } }), rs.nav);
    const sh = t.api.S.sheet, jh = sheet(t);
    tap(t, jh, 'joinfwd'); await tick();
    check(sh && sh.type === 'joinfwd' && /Sam Rivera/.test(jh) && /OAK/.test(jh) && rs.shared.length === 1 && rs.shared[0].url === ORIGIN + '/PIALAX/?idea=' + id + '&add=' + encodeURIComponent('Sam Rivera.OAK') && !t.loc.search.includes('add=') && nPosts(t) === 0,
      'PIA-137 a join request opened on a phone that does not organize the trip is not dropped: P-joinfwd (Sam Rivera, OAK) and 📣 sends the same link on, writing nothing', rs.shared);
    const sam = await linkPhone('?idea=' + id, seedLs({ pialax_ui_v1: { v1read: 1, joins: { [id]: { name: 'Sam Rivera', ap: 'OAK' } } } }));
    const fh = sheet(sam);
    tap(sam, fh, 'joinopen');
    const L = sam.api.S.sheet.local;
    check(/class="tile join pend"[^>]*aria-label="Asked to join"[^>]*><span data-k="asked" aria-hidden="true">🙋＋<\/span><span class="tw" aria-hidden="true">⏳<\/span><span class="tn2 jn">Sam Rivera<\/span>/.test(fh) && L.jname === 'Sam Rivera' && L.jap === 'OAK' && /To organizer/.test(sheet(sam)),
      'the joiner\'s P-face shows his request pending (🙋＋ ⏳ Sam Rivera); 🙋＋ reopens it filled, saying it goes to the organizer');
    const ans = await sam.api.ACTS.answer({ dataset: { id, v: 'in', code: '' } });
    check(ans === null && nPosts(sam) === 0, '…and until he is added, In asks who he is (nothing is written)');
  }
  {
    // the join and home-airport fields take 3 letters: a city typed there is cut and refused until it is a code; an unknown code goes
    const id = seedAs(THX), rs = recShare();
    const t = await linkPhone('?idea=' + id, null, rs.nav);
    tap(t, sheet(t), 'joinopen');
    const L = t.api.S.sheet.local;
    L.jname = 'Sam Rivera'; L.jap = 'SAN'; L.cuts = { 'join-ap': true };
    tap(t, sheet(t), 'joinshare'); await tick();
    const refused = rs.shared.length;
    L.cuts['join-ap'] = false; L.jap = 'ZZQ';
    const warn = /id="warn-join-ap" class="w" data-k="unknown">📍⚠/.test(sheet(t));
    tap(t, sheet(t), 'joinshare'); await tick();
    check(refused === 0 && warn && rs.shared.length === 1 && /add=Sam%20Rivera\.ZZQ$/.test(rs.shared[0].url),
      'PIA-137 a city cut to 3 letters (San Francisco → SAN ⚠) is refused until it is a code; an unknown code is marked 📍⚠ and still goes', rs.shared);
  }

  // ═══ PIA-138 ═══
  section('PIA-138 dates, the one picker: ±1 on the trip view, P-dates (plan, own days, window), P-day, one leg at a time, confirms, one write per run of taps');
  const gfIn = (h) => ((/href="(https:\/\/www\.google\.com\/travel\/flights\/search\?tfs=[^"]+)"/.exec(h || '') || [])[1] || '').replace(/&amp;/g, '&');
  const legDates = (href) => { const d = TM.gfDecode(href); return d ? d.legs.map((L) => L.date) : null; };
  const org138 = (id, me, extra) => lsOf([id], Object.assign({ pialax_idea_keys_v1: keyOf([id]), pialax_idea_me_v1: { [id]: me || 'ashwin-p8' } }, extra || {}));
  const dsh = (t) => (t.api.S.sheet && t.api.S.sheet.type === 'dates' ? t.api.S.sheet.local : null);
  const settleWrites = async (t, id) => { t.api.flushSoon(); await until(() => !(t.api.PEND[id] > 0)); await tick(); t.flush(); };
  const anjoOwn = (d) => { d.responses['anjo-z5'] = RESP('in', { member: 'anjo-z5', origin: 'LGA', available_from: '2026-11-05', available_to: '2026-11-09', note: 'Leaving early Monday' }); };
  // PIA-154: the trip view has no −1 / +1 (P-dates moves the plan). A leg's one-day move (P-person's ±1 day chips, and the
  // organizer's ↩ in their toast: ACTS.legshift with the end and the step) is still a run of taps made one write, kept when the
  // page is left; a plan run an earlier build kept on this phone (pialax_soon_v2 'plan') is still sent by the next open
  const legTap = (t, code, end, v) => t.api.ACTS.legshift({ dataset: { act: 'legshift', id: t.api.S.trip, code, end: String(end), v: String(v) } });
  {
    const id = seedAs(DWX, anjoOwn);
    const t = await boot136({ ls: org138(id) });
    act(t, 'open', { id });
    const h0 = screen(t), row = h0.slice(h0.indexOf('class="daterow"'), h0.indexOf('class="pb"'));
    check(!/data-act="shift"/.test(h0) && /data-act="dates" data-id="[^"]+" aria-label="Dates 11\/6–11\/9, 3 nights, event day 11\/8, group plan" data-lbl="Dates"><span class="inner">/.test(h0) && !/📌/.test(row) && !/google\.com\/travel/.test(h0),
      'PIA-138 AC1 / PIA-154 the organizer\'s trip view has no −1 / +1 beside the plan pill (and no 📌 on it); the pill is read out as what it shows ("Dates 11/6–11/9, 3 nights, event day 11/8, group plan"); no ✈↗ before 🔒');
    tap(t, h0, 'dates');
    check(t.api.S.sheet && t.api.S.sheet.type === 'dates' && /data-act="dshift"[^>]*data-v="1"/.test(sheet(t)), 'PIA-154 one tap on the pill opens P-dates, whose shift row moves the plan a day');
    t.api.closeSheet();
    const card = t.api.renderIdeas().html;
    check(/<button class="pill z" data-act="dates" data-id="[^"]+" aria-label="Dates 11\/6–11\/9, 3 nights, event day 11\/8(?:, [^"]*)?" data-lbl="Dates">/.test(card),
      'PIA-138 a11y the card\'s date pill is named by what it shows (dates, nights, event day…), and a long press still names it "Dates"', (/<button class="pill z"[^>]*>/.exec(card) || [])[0]);
  }
  {
    // the write goes by itself SOON_MS after the last tap (no flush), once
    const id = seedAs(DWX, anjoOwn);
    const t = await boot136({ ls: org138(id) });
    act(t, 'open', { id });
    legTap(t, 'anjo-z5', 1, -1);
    const early = nPosts(t);
    await new Promise((r) => setTimeout(r, 750)); await until(() => !(t.api.PEND[id] > 0));
    const ps = posts(t, 0).filter((p) => p.path === '/idea/respond'), a = srv.read(id).responses['anjo-z5'];
    check(early === 0 && ps.length === 1 && a.available_to === '2026-11-08' && a.available_from === '2026-11-05' && TM.parseRespNote(a.note).text === 'Leaving early Monday',
      'PIA-138 AC3 with no more taps, the one write goes by itself ' + t.api.SOON_MS + 'ms after the last tap (the organizer\'s leg −1 for Anjo: her 🛫 11/8, her note kept)', ps.length);
  }
  // a page left (pagehide) before its run of taps settled sends nothing from what it read earlier: the run is kept on this
  // phone (pialax_soon_v2) and the next open (the reload) sends it from a fresh read, where the lock, a booking and a
  // newer answer all hold, and where a record someone has changed since keeps that change
  const kept = (t) => { const raw = t.ls.getItem('pialax_soon_v2'); return raw ? JSON.parse(raw) : null; };
  const reopen = async (t, o) => { const r = await boot136(Object.assign({ ls: t.ls }, o || {})); await r.api.S.replay; await tick(); r.flush(); return r; };
  // the page is left: pagehide, then (as a reload or a navigation does) hidden
  const leave = (t) => { const f0 = t.fetches.length; t.api.flushSoon({ type: 'pagehide' }); t.api.flushSoon(); return t.fetches.slice(f0); };
  const P69 = { s: '2026-11-06', e: '2026-11-09' }, P710 = { s: '2026-11-07', e: '2026-11-10' };
  // a plan run an earlier build kept on this phone (its ±1 on the trip view): +1 from 11/6–11/9 to 11/7–11/10
  const keepPlan = (t, id, extra) => { const map = kept(t) || {}; map['legacy.' + (Object.keys(map).length + 1)] = Object.assign({ at: CLOCK - 60000, q: 1, kind: 'plan', id, s: '2026-11-07', e: '2026-11-10', f: ['2026-11-06', '2026-11-09'], k: 1, ack: false, bk: [] }, extra || {}); t.ls.setItem('pialax_soon_v2', JSON.stringify(map)); };
  {
    const id = seedAs(DWX, anjoOwn);
    const t = await boot136({ ls: org138(id) });
    act(t, 'open', { id });
    legTap(t, 'anjo-z5', 1, -1);
    const sent = leave(t), raw = t.ls.getItem('pialax_soon_v2') || '', k = kept(t), e = k ? Object.values(k)[0] : {}, f1 = t.fetches.length;
    await new Promise((r) => setTimeout(r, t.api.SOON_MS + 150));   // the run is parked: nothing goes later either
    const late = t.fetches.length - f1;
    check(sent.length === 0 && t.fetches.filter((f) => f.method === 'POST').length === 0 && late === 0 && k && Object.keys(k).length === 1 && e.kind === 'own' && e.id === id && e.code === 'anjo-z5' && e.by === 'proxy' &&
      eq(e.patch, { available_to: '2026-11-08' }) && eq(e.f, ['2026-11-05', '2026-11-09']) && e.k === -1 && e.ack === false && !/edit_key|pialax-test-edit-key|org-token|X-Idea-Key|"doc"/.test(raw) && srv.read(id).responses['anjo-z5'].available_to === '2026-11-09',
      'PIA-138 AC3 a leg −1, then the page left (pagehide, then hidden) before ' + t.api.SOON_MS + 'ms: nothing is sent, then or later (no write built from the doc read earlier); the run is kept on this phone (pialax_soon_v2: the days it moves from and to, never a key, a token or a doc)', { sent: sent.length, e });
    const r = await reopen(t);
    const fs1 = r.fetches, iu = fs1.findIndex((f) => f.method === 'POST'), a = srv.read(id).responses['anjo-z5'];
    check(fs1.filter((f) => f.method === 'POST').length === 1 && /\/idea\/respond\?id=/.test(fs1[iu].url) && fs1[iu - 1].method === 'GET' && a.available_to === '2026-11-08' && a.available_from === '2026-11-05' &&
      TM.parseRespNote(a.note).text === 'Leaving early Monday' && kept(r) === null && !r.api.S.sheet && !t.fetches.concat(fs1).some((f) => f.keepalive),
      'PIA-138 AC3 the next open (the reload) sends it the usual way: a fresh read, then ONE answer, and her 🛫 moves to 11/8 (her note kept); nothing is kept any more, no request ever went with keepalive', fs1.map((f) => f.method + ' ' + f.url.replace(W, '').split('?')[0]));
  }
  {
    // PIA-154: a plan run an earlier build kept (its trip-view +1) goes on the next open, the same way: ONE update, 📌 kept
    const id = seedAs(DWX);
    const t = await boot136({ ls: org138(id) });
    keepPlan(t, id);
    const r = await reopen(t), fs1 = r.fetches, iu = fs1.findIndex((f) => f.method === 'POST'), doc = srv.read(id);
    check(fs1.filter((f) => f.method === 'POST').length === 1 && /\/idea\/update\?id=/.test(fs1[iu].url) && fs1[iu - 1].method === 'GET' && eq(TM.docPlan(doc), P710) &&
      doc.idea.notes === '📌2026-11-08 Lakshmi puja Sunday evening' && kept(r) === null && !r.api.S.sheet,
      'PIA-138 AC3 a plan run kept by an earlier build (its trip-view +1) is sent by the next open: a fresh read, then ONE update to 11/7–11/10 (📌 kept); nothing is kept any more', fs1.map((f) => f.method + ' ' + f.url.replace(W, '').split('?')[0]));
  }
  {
    // two organizer phones: B locks; A still holds a kept plan run from before (a reload, or a page closed)
    const id = seedAs(DWX);
    const A = await boot136({ ls: org138(id) }), B = await boot136({ ls: org138(id) });
    act(B, 'open', { id });
    tap(B, screen(B), 'dates'); await tap(B, sheet(B), 'dlock'); await settleWrites(B, id);
    keepPlan(A, id);
    const A2 = await reopen(A), doc = srv.read(id);
    check(nPosts(A2) === 0 && doc.decision.stage === 'chosen' && eq(TM.docPlan(doc), P69) && doc.decision.chosen.departure === '2026-11-06' &&
      A2.api.S.sheet && A2.api.S.sheet.type === 'error' && A2.api.S.sheet.p.code === 'locked' && !A2.api.S.sheet.p.retry && kept(A2) === null,
      'PIA-138 AC3 B locked; A\'s kept +1 reads the lock on its next open and sends nothing: the plan and the 🔒 snapshot stay 11/6, and P-error says 🔒 "Dates locked" (no ↻)', { posts: nPosts(A2), stage: doc.decision.stage, plan: TM.docPlan(doc), err: A2.api.S.sheet && A2.api.S.sheet.p.code });
  }
  for (const onTrip of [true, false]) {
    // Anjo booked on her phone after the organizer's last read: his kept +1 never moves her booked days unasked
    const id = seedAs(DWX);
    const t = await boot136({ ls: org138(id) });
    const d = srv.read(id); d.responses['anjo-z5'] = RESP('in', { member: 'anjo-z5', origin: 'LGA', booked: true, booked_at: '2026-10-17T10:00:00.000Z' }); srv.write(d);
    keepPlan(t, id);
    const r = await reopen(t, onTrip ? { url: BASE + '?idea=' + id } : {}), doc = srv.read(id), a = doc.responses['anjo-z5'];
    const asked = r.api.S.sheet && r.api.S.sheet.type === 'error' && r.api.S.sheet.p.code === 'booked' && (!onTrip || r.api.S.trip === id);
    check(nPosts(r) === 0 && eq(TM.docPlan(doc), P69) && a.available_from === '' && a.available_to === '' && a.booked === true && asked && kept(r) === null,
      'PIA-138 AC3 a booking landed after the organizer\'s last read; his kept +1 moves nothing on the next open (her booked days stay 11/6–11/9), which says so (PIA-154: P-error ⚠🎫 "Someone booked"' + (onTrip ? ', over the trip it opened on' : '') + ')', { posts: nPosts(r), plan: TM.docPlan(doc), anjo: [a.available_from, a.available_to], sheet: r.api.S.sheet && r.api.S.sheet.p });
  }
  {
    // Mom & Dad turned Maybe and wrote a note on their phone after the organizer's last read; he moves their 🛫 −1 in
    // P-person and the page is left at once
    const id = seedAs(DWX);
    const t = await boot136({ ls: org138(id) });
    act(t, 'open', { id });
    const d = srv.read(id); Object.assign(d.responses['momdad-k3'], { status: 'maybe', note: 'Dad has a check-up 11/9', updated_at: '2026-10-17T18:00:00.000Z' }); srv.write(d);
    act(t, 'person', { id, code: 'momdad-k3' });
    legTap(t, 'momdad-k3', 1, -1);
    const drawn = t.api.modelOf(id).members.find((x) => x.code === 'momdad-k3').own2, sent = leave(t), e = Object.values(kept(t) || {})[0] || {};
    const r = await reopen(t), rs = posts(r, 0), m = srv.read(id).responses['momdad-k3'];
    check(drawn === '2026-11-08' && sent.length === 0 && e.kind === 'own' && e.code === 'momdad-k3' && e.by === 'proxy' && eq(e.patch, { available_to: '2026-11-08' }) && eq(e.f, ['', '']) &&
      rs.length === 1 && rs[0].path === '/idea/respond' && m.status === 'maybe' && TM.parseRespNote(m.note).text === 'Dad has a check-up 11/9' && m.available_to === '2026-11-08' && m.available_from === '' && kept(r) === null,
      'PIA-138 AC4 his leg −1 for Mom & Dad, left at once, sends nothing then; the next open sends ONE answer rebuilt from the fresh record: their 🛫 11/8 with their Maybe and their note kept (marked 📞 as his edit), never the older answer', { sent: sent.length, rs: rs.map((p) => p.body), m: [m.status, m.note, m.available_to] });
  }
  {
    // the record changed by someone else after the run was left: their change stays
    const id = seedAs(DWX);
    const A = await boot136({ ls: org138(id) });
    keepPlan(A, id);
    const dm = srv.read(id); dm.idea.dates.departure = '2026-11-05'; dm.idea.dates.return = '2026-11-08'; srv.write(dm);   // (B's phone moved it −1)
    const A2 = await reopen(A);
    // her own days changed after a leg move was left: they stay
    const id2 = seedAs(DWX, (dd) => { dd.responses['anjo-z5'] = RESP('in', { member: 'anjo-z5', origin: 'LGA' }); });
    const t = await boot136({ ls: org138(id2) });
    act(t, 'open', { id: id2 }); act(t, 'person', { id: id2, code: 'anjo-z5' });
    legTap(t, 'anjo-z5', 0, -1); leave(t);
    const d2 = srv.read(id2); d2.responses['anjo-z5'].available_from = '2026-11-07'; srv.write(d2);
    const t2 = await reopen(t);
    check(nPosts(A2) === 0 && eq(TM.docPlan(srv.read(id)), { s: '2026-11-05', e: '2026-11-08' }) && !A2.api.S.sheet && kept(A2) === null &&
      nPosts(t2) === 0 && srv.read(id2).responses['anjo-z5'].available_from === '2026-11-07' && !t2.api.S.sheet && kept(t2) === null,
      'PIA-138 B moved the plan (−1: 11/5–11/8) after A\'s +1 was kept: A\'s next open sends nothing and B\'s plan stays; Anjo set her own arrival (11/7) after the organizer\'s leg −1 for her was left: it stays too (no error to show)', { a: nPosts(A2), plan: TM.docPlan(srv.read(id)), t2: nPosts(t2) });
  }
  {
    // hidden, the run is kept and goes the usual way; its update lands but the page dies before the answer
    const id = seedAs(DWX, anjoOwn);
    let dead = false;
    const dying = async (url, opts) => { if (dead) return new Promise(() => {}); const res = await srv.fetch(url, opts); if (opts && opts.method === 'POST') { dead = true; return new Promise(() => {}); } return res; };
    const t = await boot136({ ls: org138(id), fetch: dying });
    act(t, 'open', { id });
    legTap(t, 'anjo-z5', 1, -1);
    t.api.flushSoon();
    await until(() => dead);
    const k = kept(t), r = await reopen(t);
    check(k && Object.keys(k).length === 1 && srv.read(id).responses['anjo-z5'].available_to === '2026-11-08' && nPosts(r) === 0 && kept(r) === null && !r.api.S.sheet,
      'PIA-138 AC3 hidden, a run is kept and sent as usual (a fresh read first); its update lands and the page dies before the answer: the next open finds the record already moved and sends nothing again');
  }
  {
    // hidden, the run goes; its read is still out when the page is left, and the browser aborts it as the page goes: the
    // failure that settles it then does not drop what is kept, and the next open sends it
    const id = seedAs(DWX, anjoOwn), hold = deferred();
    let gateReads = false;
    const aborting = async (url, opts) => { if (gateReads && (!opts || opts.method !== 'POST')) { await hold.p; throw new TypeError('Failed to fetch'); } return srv.fetch(url, opts); };
    const t = await boot136({ ls: org138(id), fetch: aborting });
    act(t, 'open', { id });
    legTap(t, 'anjo-z5', 1, -1);
    const f0 = t.fetches.length;
    gateReads = true; t.api.flushSoon();
    await until(() => t.fetches.length > f0); await tick();
    leave(t); hold.res(); await until(() => !(t.api.PEND[id] > 0)); await tick();
    const k = kept(t), r = await reopen(t), ps = posts(r, 0);
    check(posts(t, 0).length === 0 && k && Object.keys(k).length === 1 && ps.length === 1 && ps[0].path === '/idea/respond' && srv.read(id).responses['anjo-z5'].available_to === '2026-11-08' && kept(r) === null,
      'PIA-138 AC3 a run whose read the browser aborts as the page is left stays kept (its failure, settled while the page goes, drops nothing), and the next open sends it: ONE answer, her 🛫 11/8', { k: !!k, ps: ps.map((p) => p.path) });
  }
  {
    // the back-forward cache: the page left, then shown again (pageshow): the parked run goes then, once
    const id = seedAs(DWX, anjoOwn);
    const t = await boot136({ ls: org138(id) });
    act(t, 'open', { id });
    legTap(t, 'anjo-z5', 1, -1);
    const sent = leave(t), k = kept(t);
    t.api.soonResume();
    await until(() => !(t.api.PEND[id] > 0)); await tick();
    const ps = posts(t, 0);
    check(sent.length === 0 && k && ps.length === 1 && ps[0].path === '/idea/respond' && srv.read(id).responses['anjo-z5'].available_to === '2026-11-08' && kept(t) === null,
      'PIA-138 AC3 a page left and then shown again from the back-forward cache (pageshow): the parked run goes then, once, from a fresh read, and nothing is left kept');
  }
  {
    // an open that cannot read the trip (offline) keeps the run for the next one; a run older than a day is dropped unsent
    const id = seedAs(DWX, anjoOwn);
    const t = await boot136({ ls: org138(id) });
    act(t, 'open', { id }); legTap(t, 'anjo-z5', 1, -1); leave(t);
    const off = loadApp({ ls: t.ls, fetch: async () => { throw new TypeError('Failed to fetch'); } });
    await off.api.S.replay; await tick();
    const still = !!kept(t);
    CLOCK = NOW + off.api.SOON_KEEP_MS + 60000;
    const old = await reopen(t);
    CLOCK = NOW;
    check(nPosts(off) === 0 && still && nPosts(old) === 0 && kept(old) === null && srv.read(id).responses['anjo-z5'].available_to === '2026-11-09',
      'PIA-138 an open that cannot read the trip (offline) sends nothing and keeps the run for the next open; a run older than a day is dropped unsent');
  }
  {
    // two organizer phones: B locks the dates; A, not refreshed, still shows them unlocked. A's P-dates Save of a shifted range
    // is checked on the fresh record and held back: the plan never moves under its 🔒
    const id = seedAs(DWX);
    const A = await boot136({ ls: org138(id) }), B = await boot136({ ls: org138(id) });
    act(A, 'open', { id }); act(B, 'open', { id });
    tap(B, screen(B), 'dates'); await tap(B, sheet(B), 'dlock'); await settleWrites(B, id);
    // B unlocks, A reads it; B locks again; A's P-dates (stale, unlocked) saves +1: held back, the sheet redraws as the lock it is
    await tap(B, sheet(B), 'dlock'); await settleWrites(B, id);
    await A.api.refresh(id); A.flush();
    await tap(B, sheet(B), 'dlock'); await settleWrites(B, id);
    tap(A, screen(A), 'dates');
    const LA = dsh(A), stale = !!LA && !A.api.modelOf(id).locked, pb = nPosts(A);
    tap(A, sheet(A), 'dshift', { v: '1' });
    await tap(A, sheet(A), 'dsave'); await settleWrites(A, id);
    const after2 = srv.read(id), sA = sheet(A);
    check(stale && nPosts(A) === pb && eq(TM.docPlan(after2), { s: '2026-11-06', e: '2026-11-09' }) && after2.decision.stage === 'chosen' && after2.decision.chosen.departure === '2026-11-06' &&
      A.api.S.sheet && A.api.S.sheet.type === 'dates' && /data-act="dlock"[^>]*aria-label="Unlock"/.test(sA) && !/data-act="dsave"/.test(sA) && !LA.failed,
      'PIA-138 AC3 the same in P-dates: a stale Save of 11/7–11/10 is held back (nothing sent), and the picker redraws as the plan to read with 🔓', { posts: nPosts(A) - pb, plan: TM.docPlan(after2) });
  }
  {
    // locked dates cannot move until unlocked; P-dates on a locked plan is the plan to read (days open P-day) with 🔓 only
    const id = seedAs(DWX, (d) => { chosenAt(d, '2026-11-06', '2026-11-09', 'RDU'); d.responses['anjo-z5'] = RESP('in', { member: 'anjo-z5', origin: 'LGA', booked: true }); });
    const t = await boot136({ ls: org138(id) });
    act(t, 'open', { id });
    const h = screen(t);
    act(t, 'dates', { id });
    const s0 = sheet(t), L = dsh(t);
    check(!/data-act="shift"/.test(h) && /<span data-k="lock">🔒<\/span>/.test(h) && t.api.popupName(t.api.S.sheet) === 'P-dates' && L.target === 'trip' && /<button class="btn wide stick unl" data-act="dlock" aria-label="Unlock"><span data-k="unlock" aria-hidden="true">🔓<\/span> Unlock<\/button>$/.test(s0) &&
      !/data-act="dsave"|data-act="dshift"|data-act="dhol"|data-act="dclear"|data-act="dpin"/.test(s0) && /class="dc[^"]* ro"/.test(s0),
      'PIA-138 AC3 a locked plan has no −1 / +1 (its pill shows 🔒); P-dates reads it (no Save, shifts, holidays, 📌 or 🗓⊘); PIA-154: its main button is an outlined "🔓 Unlock"');
    tap(t, s0, 'dday', { v: '2026-11-07' });
    check(t.api.S.sheet.type === 'day' && t.api.popupName(t.api.S.sheet) === 'P-day' && t.api.S.sheet.back && t.api.S.sheet.back.type === 'dates', 'a day of a locked plan opens P-day (‹ goes back to P-dates)');
    t.api.ACTS['sh-back']();
    tap(t, sheet(t), 'dlock');
    const armed = { sheet: sheet(t), n: nPosts(t) };
    tap(t, sheet(t), 'dlock'); await settleWrites(t, id);
    const doc = srv.read(id), u = posts(t, 0).filter((p) => p.path === '/idea/update');
    check(/data-act="dlock" aria-label="Confirm, someone booked" data-lbl="Confirm">⚠ ✈×1 <span class="cw">Confirm<\/span><\/button>/.test(armed.sheet) && armed.n === 0 && u.length === 1 && eq(u[0].body.decision, { stage: 'proposed' }) && doc.decision.stage === 'proposed' &&
      t.api.S.sheet && t.api.S.sheet.type === 'dates' && /data-act="dlock" aria-label="Lock dates"><span data-k="lock" aria-hidden="true">🔒<\/span> Lock dates<\/button>/.test(sheet(t)) && /data-act="dshift"/.test(sheet(t)),
      'PIA-138 AC3 🔓 after someone booked asks once (⚠ 🎫×1 Confirm: the confirming tap says what it is), then unlocks in one write; the sheet stays open, now with the picker, its shifts and (PIA-154: nothing to save yet) "🔒 Lock dates"', { u: u.map((p) => p.body), armed: (/data-act="dlock"[^>]*>[^<]*/.exec(armed.sheet) || [])[0], n: armed.n, stage: doc.decision.stage, sheet: t.api.S.sheet && t.api.S.sheet.type, now: (/data-act="dlock"[^>]*>[^<]*/.exec(sheet(t)) || [])[0] });
    // their own days stay editable while the plan is locked (PIA-154: one end from her flight section, 🛬 Arrive's day)
    const gid = seedAs(DWX, (d) => { chosenAt(d, '2026-11-06', '2026-11-09', 'RDU'); d.responses['anjo-z5'] = RESP('in', { member: 'anjo-z5', origin: 'LGA', booked: true }); });
    const g2 = await boot136({ ls: lsOf([gid], { pialax_idea_me_v1: { [gid]: 'anjo-z5' } }) });
    act(g2, 'open', { id: gid }); act(g2, 'person', { id: gid, code: 'anjo-z5' }); tap(g2, sheet(g2), 'dates', { end: '0' });
    const GL = dsh(g2);
    tap(g2, sheet(g2), 'dday', { v: '2026-11-07' });
    const arm = { h: sheet(g2), n: nPosts(g2) };
    await tap(g2, sheet(g2), 'dsave'); await tick();
    const r = srv.read(gid).responses['anjo-z5'];
    check(GL && GL.target === 'me' && GL.end === 0 && /data-act="dsave" aria-label="Confirm, someone booked" data-lbl="Confirm">⚠ ✈ <span class="cw">Confirm<\/span><\/button>/.test(arm.h) && arm.n === 0 && r.available_from === '2026-11-07' && r.available_to === '' && r.booked === true && !!g2.api.S.sheet,
      'PIA-138 AC4 on the locked trip Anjo still sets her own arrival (🛬 alone, 11/7): after her 🎫 the pick asks once (⚠ 🎫), then one answer keeps her leave end following and her 🎫', r);
  }
  {
    // P-dates for the organizer: holiday chips, tap start / tap end, shifts, paging, 📌 pinned inside, Save stays open, one write
    const id = seedAs(DWX);
    const t = await boot136({ ls: org138(id) });
    act(t, 'open', { id }); tap(t, screen(t), 'dates');
    const L = dsh(t), s0 = sheet(t);
    check(L.target === 'trip' && L.s === '2026-11-06' && L.e === '2026-11-09' && L.pin === '2026-11-08' && /data-act="dtarget" data-v="trip" aria-pressed="true"/.test(s0) && !/data-act="dhol"/.test(s0) &&
      /<button class="btn pri wide stick" data-act="dlock" aria-label="Lock dates"><span data-k="lock" aria-hidden="true">🔒<\/span> Lock dates<\/button>$/.test(s0) && !/data-act="dsave"/.test(s0),
      'PIA-138 the organizer\'s pill opens P-dates on the plan ([👪 Plan | Mine] to his own days); PIA-154: no holiday chips once the trip has a plan, and with nothing to save the main button is "🔒 Lock dates"');
    tap(t, sheet(t), 'dmonth', { v: '1' });
    const paged = [L.ym, L.s, L.e];
    tap(t, sheet(t), 'dmonth', { v: '-1' });
    tap(t, sheet(t), 'dshift', { v: '7' });
    const pinBlocked = ctl(sheet(t), 'dshift', { v: '7' });
    check(eq(paged, ['2026-12', '2026-11-06', '2026-11-09']) && L.s === '2026-11-06' && pinBlocked && pinBlocked.lbl === 'Event day outside' && pinBlocked.why === '1' && /data-act="dshift" data-v="7"[^>]*>\+7<\/button>/.test(sheet(t)),
      'PIA-138 AC2 ◀ ▶ only page (the range stays); +7 that would leave 📌 outside is refused, its numeral dimmed, its reason on a tap');
    tap(t, sheet(t), 'dshift', { v: '-1' });
    check(L.s === '2026-11-05' && L.e === '2026-11-08' && /data-act="dsave">Save<\/button>/.test(sheet(t)) && !/data-act="dlock"/.test(sheet(t)), '−1 moves the whole range a day (11/5–11/8, still 3 nights, 📌 inside); with a change to save, Save is the main button');
    tap(t, sheet(t), 'dday', { v: '2026-11-13' }); tap(t, sheet(t), 'dday', { v: '2026-11-16' });
    const out = sheet(t);
    check(L.s === '2026-11-13' && L.e === '2026-11-16' && /data-k="pinout">📌⚠<\/span>/.test(out) && /data-act="dsave" aria-disabled="true" data-why="1" data-lbl="Event day outside">Save/.test(out) && !/data-act="dlock"/.test(out),
      'PIA-138 AC2 tap a start, tap an end (no dragging): 11/13–11/16 leaves 📌 11/8 out, so Save refuses with 📌⚠ ("Event day outside")');
    await tap(t, sheet(t), 'dsave');
    const n0 = nPosts(t);
    tap(t, sheet(t), 'dpin'); tap(t, sheet(t), 'dday', { v: '2026-11-14' });
    check(L.pin === '2026-11-14' && n0 === 0 && /data-act="dsave">Save<\/button>/.test(sheet(t)), '📌 then a day moves the event day inside the plan; nothing was sent while it was refused');
    const p1 = tap(t, sheet(t), 'dsave'), busyS = sheet(t); const p2 = tap(t, sheet(t), 'dsave');
    const k0 = [L.s, L.e, L.pin].join(); tap(t, busyS, 'dday', { v: '2026-11-20' }); tap(t, busyS, 'dshift', { v: '1' });
    check(/data-act="dsave" aria-label="Saving" aria-busy="true" aria-disabled="true" data-why="1" data-lbl="Saving">◷<\/button>/.test(busyS) && !/<button[^>]*\sdisabled[\s>]/.test(busyS) &&
      /data-act="dpin"[^>]*aria-disabled="true" data-why="1" aria-label="Event day, Saving" data-lbl="Saving"/.test(busyS) && /data-act="dshift" data-v="1"[^>]*aria-disabled="true" data-why="1" data-lbl="Saving"/.test(busyS) &&
      /data-act="dday" data-v="2026-11-20" aria-label="11\/20[^"]*" aria-pressed="false" aria-disabled="true" data-why="1" data-lbl="Saving"/.test(busyS) && [L.s, L.e, L.pin].join() === k0,
      'PIA-138 a11y while Save is out it is ◷, still focusable (aria-disabled + aria-busy, never disabled, so focus is not dropped); 📌 Event, the days and the shifts say "Saving" and take no pick');
    await p1; await tick(); await settleWrites(t, id);
    const u = posts(t, 0).filter((p) => p.path === '/idea/update'), doc = srv.read(id);
    check(u.length === 1 && eq(TM.docPlan(doc), { s: '2026-11-13', e: '2026-11-16' }) && doc.idea.notes === '📌2026-11-14 Lakshmi puja Sunday evening' && p2 === null,
      'PIA-138 AC3 Save, tapped twice quickly, is one write: the plan 11/13–11/16 with 📌 11/14 (the caption kept)', u.length);
    check(t.api.S.sheet && t.api.S.sheet.type === 'dates' && L.s === '2026-11-13' && /<button class="btn pri wide stick" data-act="dlock" aria-label="Lock dates">/.test(sheet(t)) && !/data-act="dsave"/.test(sheet(t)),
      'PIA-138 AC3 the sheet stays open after Save, read again from the record; PIA-154: with nothing left to save, its main button is "🔒 Lock dates", the next tap');
    const nl = t.fetches.length, l1 = tap(t, sheet(t), 'dlock'), busyH = sheet(t), l2 = tap(t, sheet(t), 'dlock');
    check(/data-act="dlock" aria-label="Saving" aria-busy="true" aria-disabled="true" data-why="1" data-lbl="Saving">◷<\/button>/.test(busyH) && !/<button[^>]*\sdisabled[\s>]/.test(busyH),
      'PIA-138 a11y while 🔒 is out the sheet already reads as locked, and the same control (🔓) is ◷, still focusable (aria-disabled + aria-busy, never disabled: focus stays on it)');
    await l1; await settleWrites(t, id);
    const lk = posts(t, nl), after = sheet(t);
    check(srv.read(id).decision.stage === 'chosen' && srv.read(id).decision.chosen.departure === '2026-11-13' && l2 === null && lk.length === 1 && lk[0].body.decision.stage === 'chosen' && eq(lk[0].body.decision.chosen, { airport: 'RDU', city: 'Raleigh', departure: '2026-11-13', return: '2026-11-16' }) &&
      t.api.S.sheet && t.api.S.sheet.type === 'dates' && /data-act="dlock" aria-label="Unlock"><span data-k="unlock" aria-hidden="true">🔓<\/span> Unlock<\/button>/.test(after) && !/data-act="dsave"/.test(after),
      'PIA-138 AC3 🔒, tapped twice quickly, locks once (the second tap is not an 🔓): the plan as saved, chosen from that very plan; the picker stays open, now the plan to read with "🔓 Unlock"', lk.map((q) => q.body.decision));
  }
  {
    // PIA-154: an idea with no plan yet still offers the holiday chips: 🦃 in one tap is Wed 11/25–Sun 11/29 and 📌 11/26
    const id = seedAs(DWX, (d) => { d.idea.dates.departure = ''; d.idea.dates.return = ''; d.idea.notes = ''; });
    const t = await boot136({ ls: org138(id) });
    act(t, 'open', { id }); tap(t, screen(t), 'dates'); tap(t, sheet(t), 'dmode', { v: 'dates' });
    const L = dsh(t), s0 = sheet(t);
    tap(t, s0, 'dhol', { v: '2026-11-26' });
    check(/data-act="dhol" data-v="2026-11-26" aria-label="Thanksgiving 11\/26" data-lbl="Thanksgiving">🦃 11\/26/.test(s0) && L.s === '2026-11-25' && L.e === '2026-11-29' && L.pin === '2026-11-26' && L.ym === '2026-11',
      'PIA-138 AC2 with no plan yet the holiday chips are named by their holiday; 🦃 in one tap: Wed 11/25–Sun 11/29 and 📌 11/26', { mode: L && L.mode, hol: (s0.match(/data-act="dhol"[^>]*>/g) || []).slice(0, 3), s: L && [L.s, L.e, L.pin, L.ym] });
  }
  {
    // members set either end or both, or follow the plan again; nobody sets days before answering (the answer row asks)
    const id = seedAs(DWX, (d) => { d.responses['anjo-z5'] = RESP('maybe', { member: 'anjo-z5', origin: 'LGA', note: 'PTO pending', leave_from: '' }); });
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(t, 'open', { id });
    const h = screen(t);
    check(!/data-act="shift"/.test(h) && /class="track mybar" data-act="flight" data-id="[^"]+" data-code="anjo-z5" aria-label="My flight 11\/6–11\/9" data-lbl="My flight"/.test(h), 'a guest has no −1 / +1; her own bar opens her flight section (PIA-151; read out with her days)');
    tap(t, h, 'dates');
    const L = dsh(t);
    check(t.api.popupName(t.api.S.sheet) === 'P-dates' && L && L.target === 'me' && L.who === 'anjo-z5', 'her plan pill itself (the trip view\'s control, tapped) opens P-dates on her own days');
    tap(t, sheet(t), 'dday', { v: '2026-11-05' }); tap(t, sheet(t), 'dday', { v: '2026-11-08' });
    const s1 = sheet(t);
    await tap(t, s1, 'dsave'); await tick();
    const r1 = srv.read(id).responses['anjo-z5'];
    check(L.target === 'me' && /class="w amb" data-k="offplan">⚠🗓<\/span>/.test(s1) && r1.available_from === '2026-11-05' && r1.available_to === '2026-11-08' && r1.status === 'maybe' && r1.note === 'PTO pending',
      'PIA-138 AC4 Anjo taps 11/5 then 11/8 (⚠🗓 in amber, "Outside plan": allowed, not an error) and saves: one complete answer with both ends her own, her Maybe and note kept', r1);
    // (PIA-154: one end alone from her flight section: 🛫 Leave's day, a month calendar where the day tapped is the Save)
    t.api.closeSheet(); act(t, 'person', { id, code: 'anjo-z5' });
    tap(t, sheet(t), 'dates', { end: '1' }); await tap(t, sheet(t), 'dday', { v: '2026-11-10' }); await tick();
    const r2 = srv.read(id).responses['anjo-z5'];
    if (t.api.S.sheet && t.api.S.sheet.type !== 'person') t.api.ACTS['sh-back']();
    tap(t, sheet(t), 'dates', { end: '1' }); await tap(t, sheet(t), 'dday', { v: '2026-11-09' }); await tick();
    const r2b = srv.read(id).responses['anjo-z5'];
    if (t.api.S.sheet && t.api.S.sheet.type !== 'person') t.api.ACTS['sh-back']();
    const s9 = sheet(t);
    t.api.closeSheet(); tap(t, screen(t), 'dates'); tap(t, sheet(t), 'dfollow');
    await tap(t, sheet(t), 'dsave'); await tick();
    const r3 = srv.read(id).responses['anjo-z5'], m3 = t.api.modelOf(id).members.find((x) => x.code === 'anjo-z5');
    check(r2.available_from === '2026-11-05' && r2.available_to === '2026-11-10' && r2b.available_from === '2026-11-05' && r2b.available_to === '' && /<button class="ld fol" data-act="dates"[^>]*data-end="1"[^>]*>11\/9</.test(s9) &&
      r3.available_from === '' && r3.available_to === '' && m3.d1 === '2026-11-06' && m3.d2 === '2026-11-09' && posts(t, 0).filter((p) => p.path === '/idea/respond').length === 4,
      'PIA-138 AC4 then the leave end alone (🛫 11/10, her arrival kept); 🛫 on the plan\'s own last day (11/9) makes that end follow the plan again (drawn dimmed in her flight section), never a fixed day of her own; then both ends follow the plan: her days are the plan\'s again',
      [r2.available_to, r2b.available_to, r3.available_from]);
    // someone who has not answered: the pill and the bar pulse the answer row instead, and say so in words
    const id2 = seedAs(DWX);
    const t2 = await boot136({ ls: lsOf([id2], { pialax_idea_me_v1: { [id2]: 'anjo-z5' } }), rec: ['#screen', '#toast'] });
    act(t2, 'open', { id: id2 });
    const drawn = t2.rec['#screen'].__rec.html, n0 = drawn.length;
    tap(t2, screen(t2), 'dates');
    const pulsed = drawn.slice(n0).some((x) => /class="answers nudge"/.test(x)), told = /In \/ Maybe \/ Out/.test(t2.rec['#toast'].innerHTML);
    const nb = drawn.length; act(t2, 'dates', { id: id2, code: 'anjo-z5' });
    const pulsed2 = drawn.slice(nb).some((x) => /class="answers nudge"/.test(x));
    check(!t2.api.S.sheet && nPosts(t2) === 0 && t2.api.S.trip === id2 && TM.datesRole(t2.api.modelOf(id2)) === 'answer' && pulsed && told && pulsed2 && !/class="answers nudge"/.test(screen(t2)),
      'PIA-138 AC4 before she answers, her pill (tapped) and her bar open no picker and write nothing: the render that follows pulses her answer row (once), and a toast says "In / Maybe / Out"', { pulsed, told, pulsed2 });
  }
  {
    // nobody's own days are changed behind their back: one end of her own, the other following; a pick on the plan's own day follows
    const id = seedAs(DWX, (d) => { d.responses['anjo-z5'] = RESP('in', { member: 'anjo-z5', origin: 'LGA', available_from: '2026-11-05', available_to: '' }); });
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(t, 'open', { id }); tap(t, screen(t), 'dates');
    const L = dsh(t), noChange = (h) => /data-act="dsave" aria-disabled="true" data-why="1" data-lbl="No change">Save<\/button>/.test(h);
    const open0 = sheet(t), p0 = nPosts(t);
    await tap(t, open0, 'dsave');
    tap(t, sheet(t), 'dfollow'); const on = sheet(t);
    tap(t, sheet(t), 'dfollow'); const off = sheet(t);
    check(L.s === '2026-11-05' && L.e === '2026-11-09' && noChange(open0) && nPosts(t) === p0 && !noChange(on) && noChange(off) && /<span class="fol" data-k="follow">11\/9<\/span>/.test(open0),
      'PIA-138 Anjo set her arrival (11/5) and follows the plan\'s last day: P-dates opens on "No change" (her following end drawn dimmed), an untouched Save writes nothing, and Follow plan on then off again is still "No change"');
    tap(t, sheet(t), 'dday', { v: '2026-11-07' }); tap(t, sheet(t), 'dday', { v: '2026-11-09' });
    await tap(t, sheet(t), 'dsave'); await tick();
    const r = srv.read(id).responses['anjo-z5'];
    check(r.available_from === '2026-11-07' && r.available_to === '',
      'PIA-138 "arrive a day later" with ↔ (11/7 then the plan\'s own 11/9) moves her arrival only: the leave end keeps following the plan, so the next move of the plan carries it', [r.available_from, r.available_to]);
  }
  {
    // an undated idea with a ⟦window⟧ and no 🌙 opens unchanged: 🌙? until one is picked, and an untouched Save writes nothing
    const CYX = fx('idea-undated.json');
    const id = seedAs(CYX, (d) => { d.idea.notes = 'New date TBD'; });
    const t = await boot136({ ls: org138(id, 'ashwin-c3') });
    act(t, 'open', { id }); tap(t, screen(t), 'dates');
    const L = dsh(t), s0 = sheet(t), p0 = nPosts(t);
    await tap(t, s0, 'dsave'); await tick();
    tap(t, sheet(t), 'dnights', { v: '1' }); const s1 = sheet(t);
    check(L.mode === 'window' && /<span data-k="nights"><span class="g">🌙<\/span>\?<\/span>/.test(s0) && /data-act="dsave" aria-disabled="true" data-why="1" data-lbl="No change">Save/.test(s0) && nPosts(t) === p0 && srv.read(id).idea.notes === 'New date TBD' &&
      L.nights === 4 && L.nightsSet && /data-act="dsave">Save<\/button>/.test(s1),
      'PIA-138 an undated idea\'s window with no 🌙 opens as it is (🌙?, Save "No change", nothing written on an untouched Save); 🌙+ picks nights (counting from 3) and only then is there something to save', { notes: srv.read(id).idea.notes, n: L.nights });
  }
  {
    // one leg at a time from P-person, by the person or the organizer for them (📞); a run of taps is one write
    const id = seedAs(DWX, (d) => { d.responses['anjo-z5'] = RESP('in', { member: 'anjo-z5', origin: 'LGA', note: '' }); });
    const t = await boot136({ ls: org138(id) });
    act(t, 'open', { id }); act(t, 'person', { id, code: 'anjo-z5' });
    const s0 = sheet(t);
    check(/<span class="lg0"><span data-k="arrive" aria-hidden="true">🛬<\/span> Arrive<\/span><button class="ld fol" data-act="dates" data-id="[^"]+" data-code="anjo-z5" data-end="0" aria-label="Arrive date 11\/6, follows plan" data-lbl="Arrive, follows plan" id="ld-0">11\/6<\/button>/.test(s0) && !/data-act="legshift"/.test(s0),
      'PIA-138 AC4 P-person: each leg\'s row says its end in a word ("🛬 Arrive"), and its day opens P-dates for that end (read out with its day: "Arrive date 11/6", and that it follows the plan, drawn dimmed; PIA-154: no 🗓 corner, no −1 / +1 beside it)');
    legTap(t, 'anjo-z5', 0, -1); legTap(t, 'anjo-z5', 0, -1); legTap(t, 'anjo-z5', 1, 1);
    const mid = t.api.modelOf(id).members.find((x) => x.code === 'anjo-z5'), pre = nPosts(t);
    await settleWrites(t, id);
    const rs = posts(t, 0).filter((p) => p.path === '/idea/respond'), r = srv.read(id).responses['anjo-z5'];
    check(mid.own1 === '2026-11-04' && mid.own2 === '2026-11-10' && pre === 0 && rs.length === 1 && r.available_from === '2026-11-04' && r.available_to === '2026-11-10' && r.note === '📞' && /class="ld own"/.test(sheet(t)),
      'PIA-138 AC4 the organizer moves Anjo\'s 🛬 −1 −1 and 🛫 +1: drawn at once (her own ends, underlined), sent as ONE answer marked 📞 (11/4–11/10)', { rs: rs.length, r: [r.available_from, r.available_to, r.note] });
    act(t, 'dates', { id, code: 'anjo-z5', end: '1' });
    const L = dsh(t);
    check(L.target === 'me' && L.who === 'anjo-z5' && L.end === 1 && t.api.S.sheet.back && t.api.S.sheet.back.type === 'person' && !/data-act="dend"/.test(sheet(t)) && /<span class="endg"><span data-k="leave" aria-hidden="true">🛫<\/span> Leave<\/span>/.test(sheet(t)),
      'her 🛫 day opens P-dates on her leave end, its header "🛫 Leave" (‹ goes back to her sheet)');
  }
  {
    // an undated idea: the window and nights; ⬚ the best window becomes the plan in one tap; 🗓⊘ makes it undated again
    const CYX = fx('idea-undated.json');
    const id = seedAs(CYX);
    const t = await boot136({ ls: org138(id, 'ashwin-c3') });
    act(t, 'open', { id }); tap(t, screen(t), 'dates');
    const L = dsh(t), s0 = sheet(t);
    check(L.mode === 'window' && L.s === '2026-12-18' && L.e === '2027-01-04' && L.nights === 4 && /data-act="dmode" data-v="window" aria-pressed="true"/.test(s0) && /data-act="dbest" aria-label="Best window 12\/21–12\/25" data-lbl="Best window" data-k="best">⬚ 12\/21–12\/25<\/button>/.test(s0) &&
      !/data-act="dlock"/.test(s0) && !/data-act="shift"/.test(screen(t)),
      'PIA-138 AC5 an undated idea opens on its ⟦12/18–1/4⟧ 🌙4 with ⬚ the best window from the people who set their own days (12/21–12/25); no 🔒 and no ±1 without a plan');
    tap(t, s0, 'dnights', { v: '1' });
    await tap(t, sheet(t), 'dsave'); await tick();
    const w = srv.read(id);
    check(w.idea.notes === '🌙5 New date TBD' && w.idea.dates.searchStart === '2026-12-18' && t.api.S.sheet.type === 'dates', 'the organizer sets the rough window\'s nights (🌙5): one write, the sheet stays open');
    const b = t.api.modelOf(id).best;
    await tap(t, sheet(t), 'dbest'); await tick();
    const d2 = srv.read(id), u = posts(t, 0).filter((p) => p.path === '/idea/update');
    check(b && u.length === 2 && eq(TM.docPlan(d2), { s: b.s, e: b.e }) && d2.idea.notes === 'New date TBD' && d2.idea.dates.searchStart === '2026-12-18' && L.mode === 'dates' && L.s === b.s && t.api.S.sheet.type === 'dates',
      'PIA-138 AC5 ⬚ makes the best window the plan in ONE tap (one write; 🌙 gone, the window kept); the sheet now shows the plan', { best: b, notes: d2.idea.notes });
    await tap(t, sheet(t), 'dclear'); await tick();
    const d3 = srv.read(id), m3 = t.api.modelOf(id);
    check(!TM.docPlan(d3) && m3.undated && m3.nightsN === 5 && d3.idea.dates.searchStart === '2026-12-18' && L.mode === 'window' && t.api.S.undo,
      'PIA-138 AC5 🗓⊘ clears the plan: undated again, with its window and 🌙5 (its length), and ↩ in the toast', d3.idea);
    await t.api.S.undo(); await tick();
    check(eq(TM.docPlan(srv.read(id)), { s: b.s, e: b.e }), '↩ puts the plan back');
  }
  {
    // daily presence: the grid's numerals and P-day agree with the model and never pass the heads ring
    const id = seedAs(DWX, anjoOwn);
    const t = await boot136({ ls: org138(id) });
    act(t, 'open', { id }); tap(t, screen(t), 'dates');
    // PIA-154: a day's numeral is drawn only where someone who is In travels that day (no 0, no dots; a host's own days alone draw none)
    const travelsOn = (mm, d) => mm.members.some((x) => !x.host && x.status === 'in' && !!x.d1 && !x.bad && d >= x.d1 && d <= x.d2);
    const m = t.api.modelOf(id), s0 = sheet(t), bad = [];
    for (let d = '2026-11-01'; d <= '2026-11-30'; d = TM.addD(d, 1)) {
      const cell = (new RegExp('data-act="dday" data-v="' + d + '"[^>]*>([\\s\\S]*?)</button>').exec(s0) || [])[1] || '';
      const n = +((/<span class="pc-n"[^>]*>(\d+)<\/span>/.exec(cell) || [])[1] || 0), want = travelsOn(m, d) ? TM.presentOn(m, d) : 0;
      if (n !== want || n > m.headsIn || /class="dots"|>0</.test(cell)) bad.push(d + ' ' + n + '/' + want);
    }
    {
      // the 8-member trip (9 heads): a numeral where someone In travels; a day pressed long says who is there ("12/11 · 👥6")
      const i8 = seedAs(M8X), t8 = await boot136({ ls: org138(i8, 'grandmajosephine-nf') });
      act(t8, 'open', { id: i8 }); tap(t8, screen(t8), 'dates');
      const L8 = dsh(t8), m8 = t8.api.modelOf(i8), bad8 = [];
      let days8 = 0, drawn8 = 0;
      for (let k = 0; k < 2; k++) {
        const h8 = sheet(t8), re = /<button class="dc[^"]*" data-act="dday" data-v="(\d{4}-\d\d-\d\d)"([^>]*)>([\s\S]*?)<\/button>/g;
        let mm;
        while ((mm = re.exec(h8))) {
          const d = mm[1], cell = mm[3], n = +((/<span class="pc-n"[^>]*>(\d+)<\/span>/.exec(cell) || [])[1] || 0), p = TM.presentOn(m8, d);
          const lbl = (/data-lbl="([^"]*)"/.exec(mm[2]) || [])[1];
          days8++; if (n) drawn8++;
          // (PIA-154: the long press names the count only where the numeral is drawn: a day with only the hosts there is blank)
          if (n !== (travelsOn(m8, d) ? p : 0) || /class="dots"/.test(cell) || (d >= '2026-10-17' && lbl !== TM.md(d) + (n ? ' · 👥' + p : ''))) bad8.push(d + ' n' + n + ' p' + p + ' ' + lbl);
        }
        tap(t8, sheet(t8), 'dmonth', { v: '1' });
      }
      check(bad8.length === 0 && days8 > 50 && drawn8 > 0 && L8.target === 'trip' && m8.heads > 8,
        'PIA-138 AC6 on the 8-member trip (' + m8.heads + ' heads, ' + days8 + ' days): a day\'s numeral is the people there (presentOn), drawn where someone In travels (PIA-154: no dots, no 0); a long press on a day names it with its count ("12/11 · 👥6")', bad8.slice(0, 4));
    }
    t.api.closeSheet(); t.api.ACTS.calday({ dataset: { id, v: '2026-11-05' } });   // (PIA-154: who is there is Calendar → a day; P-dates has no 👥 tool)
    const pd = sheet(t);
    check(bad.length === 0 && t.api.popupName(t.api.S.sheet) === 'P-day' && /<span class="dayn" data-k="present"><span aria-hidden="true">👥<\/span>1<\/span>/.test(pd) && /aria-label="Anjo, there"/.test(pd) && /aria-label="Ashwin, not there"/.test(pd) && TM.presentOn(m, '2026-11-05') === 1,
      'PIA-138 AC6 every day\'s numeral in the grid is the people there (presentOn, never more than the ' + m.headsIn + ' heads in), drawn where someone In travels; 👥 then 11/5 opens P-day: 1 there (Anjo, who arrives early), Ashwin not yet', bad.slice(0, 4));
    // the best window reflects only people who set their own days
    const id2 = seedAs(DWX, (d) => { d.idea.notes = ''; });
    const t2 = await boot136({ ls: org138(id2) });
    act(t2, 'open', { id: id2 }); tap(t2, screen(t2), 'dates');
    const noBest = !/data-act="dbest"/.test(sheet(t2));
    t2.api.closeSheet(); act(t2, 'person', { id: id2, code: 'momdad-k3' });
    act(t2, 'dates', { id: id2, code: 'momdad-k3' });
    tap(t2, sheet(t2), 'dday', { v: '2026-11-12' }); tap(t2, sheet(t2), 'dday', { v: '2026-11-16' });
    await tap(t2, sheet(t2), 'dsave'); await tick();
    t2.api.closeSheet(); tap(t2, screen(t2), 'dates');
    check(noBest && srv.read(id2).responses['momdad-k3'].note === '📞' && /data-act="dbest"[^>]*>⬚ 11\/12–11\/15<\/button>/.test(sheet(t2)),
      'PIA-138 AC6 no best window while everyone follows the plan; once the organizer sets Mom & Dad\'s own 11/12–11/16 (📞), ⬚ 11/12–11/15 appears');
  }

  // ═══ PIA-139 ═══
  section('PIA-139 booking: Book and 🎫 together, the 🎫 inviting its tap after Google Flights, Flighty after, booked times for the pickups, the board\'s 🎫, a stage that moves by itself, 💵, calendars');
  const lock139 = (d) => chosenAt(d, '2026-11-06', '2026-11-09', 'RDU');
  const anjoIn = (extra) => (d) => { d.responses['anjo-z5'] = RESP('in', Object.assign({ member: 'anjo-z5', origin: 'LGA' }, extra || {})); };
  const typed = (t, fid, value, code) => t.api.onTyped({ id: fid, value, dataset: { code: code || '' }, closest: () => null });
  const prim139 = (h) => (/<div class="split prim">([\s\S]*)<\/div>$/.exec(h) || [])[1] || '';
  {
    // AC1 [✈ Book ↗ | 🎫] once the dates are set; back from Google Flights after a Book tap the 🎫 invites the tap once; Flighty after
    const id = seedAs(DWX, (d) => { lock139(d); anjoIn()(d); });
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(t, 'open', { id });
    const p0 = prim139(screen(t));
    const href = (/<a class="btn pri" href="([^"]+)"[^>]*data-ret="([^"]+)"/.exec(p0) || []);
    // back without a Book tap first, and a Book tap that never left the app: no invitation
    const noTap = t.api.bookBack();
    t.api.bookOut(id, 'anjo-z5'); const stayed = t.api.bookBack();
    // a Book tap, the app hidden while Google Flights is open, then shown again
    t.api.bookOut(id, 'anjo-z5'); t.doc.visibilityState = 'hidden'; t.api.bookAway(); t.doc.visibilityState = 'visible';
    const back = t.api.bookBack(), p1 = prim139(screen(t));
    act(t, 'person', { id, code: 'anjo-z5' }); const mySheet = sheet(t); t.api.closeSheet();
    const again = t.api.bookBack();   // a second "return" with no new Book tap invites nothing more
    check(TM.isQuery(href[1].replace(/&amp;/g, '&')) === false && href[2] === id && /data-ret="[^"]+" data-code="anjo-z5"/.test(p0) && /data-act="mybook"/.test(p0) && !/glow/.test(p0) && !noTap && !stayed &&
      back && /class="btn tkb tkoff glow" data-act="mybook"[^>]*aria-label="I booked, tap to mark"/.test(p1) && /class="btn tkb tkoff glow" data-act="mybook"/.test(mySheet) && /data-ret="[^"]+"[^>]*data-k="gf"><span aria-hidden="true">✈<\/span> Book/.test(mySheet) && !again,
      'PIA-139 AC1 once 🔒, [✈ Book ↗ | 🎫 I booked] on her trip view and in her own sheet; after a Book tap and the app hidden then shown again, the 🎫 glows ("I booked, tap to mark") in both, once: no glow without a Book tap, without leaving, or on the next return', { back, noTap, stayed, again });
    CLOCK += t.api.INVITE_MS + 1;
    const faded = !t.api.invited(id) && !/glow/.test(prim139(screen(t)));
    CLOCK = NOW;
    t.api.bookOut(id, 'anjo-z5'); t.api.bookAway(); t.api.bookBack();
    const p2 = posts(t).length;
    await tap(t, screen(t), 'mybook'); await tick();
    const after = prim139(screen(t)), bp = posts(t).slice(p2), undoOffered = typeof t.api.S.undo === 'function';
    check(faded && !t.api.S.invite && bp.length === 1 && bp[0].path === '/idea/booked' && eq(bp[0].body, { member: 'anjo-z5', booked: true }) && srv.read(id).responses['anjo-z5'].booked === true &&
      /^<button class="btn pri pulse" data-act="mytimes" data-id="[^"]+" aria-label="Landing time"><span data-k="arrive" aria-hidden="true">🛬<\/span> <span data-lbl3>Landing time<\/span><\/button>$/.test(after) &&
      !/data-act="mybook"|glow|role="img"|flighty/.test(after) && undoOffered,
      'PIA-139 AC1 the invitation fades by itself; a tap on the glowing 🎫 spends it and marks her booked (one /idea/booked); PIA-154: the primary becomes 🛬 Landing time, pulsing once (a real button, never a static pill; no ––:––), and the 🎫 toast carries ↩', { paths: bp.map((x) => x.path), after });
    CLOCK += t.api.TIMES_PULSE_MS + 1; const pulseGone = !/pulse/.test(prim139(screen(t))); CLOCK = NOW;
    act(t, 'mytimes', { id });
    const s2 = sheet(t), focusArr = t.api.S.sheet && t.api.S.sheet.focus === 'tm-arr' && t.api.S.sheet.type === 'person' && t.api.S.sheet.p.code === 'anjo-z5';
    check(pulseGone && focusArr && /<div class="split"><a class="btn pri" href="https:\/\/www\.flighty\.com\/"[^>]*aria-label="Track flight in Flighty" data-lbl="Track flight"><span data-k="flighty" aria-hidden="true">✈<\/span> Track <span aria-hidden="true">↗<\/span><\/a><button class="btn tkb tkon" data-act="unbook"[^>]*aria-pressed="true"[^>]*data-lbl="I booked"><span class="tkg" data-k="tkon" aria-hidden="true">☑︎<\/span> I booked<\/button>/.test(s2) &&
      /<span class="fld tiny invite"><label for="tm-arr"/.test(s2) && /id="tm-dep"/.test(s2) && !/placeholder=/.test(s2),
      'PIA-139 AC1/AC2 the times button opens her own sheet with 🛬 focused: [✈ Track ↗ | 🎫 Booked] and the 🛬 / 🛫 time fields (no ––:–– placeholder), 🛬 inviting the time once (the pulse ends by itself)');
    t.api.closeSheet();
    // a mistaken 🎫 is one ↩ away: the toast's undo takes it back
    const reBook = seedAs(DWX, (d) => { lock139(d); anjoIn()(d); });
    const tu = await boot136({ ls: lsOf([reBook], { pialax_idea_me_v1: { [reBook]: 'anjo-z5' } }) });
    act(tu, 'open', { id: reBook }); await tap(tu, screen(tu), 'mybook'); await tick();
    const und = tu.api.S.undo, booked1 = srv.read(reBook).responses['anjo-z5'].booked === true;
    await (typeof und === 'function' ? tu.api.ACTS.undo() : null); await tick();
    check(booked1 && typeof und === 'function' && srv.read(reBook).responses['anjo-z5'].booked === false && /data-act="mybook"/.test(prim139(screen(tu))),
      'PIA-139 a 🎫 tapped by mistake (it glows after any return from Google Flights): the toast\'s ↩ takes it back, and [Book | 🎫] is there again');
    // the organizer's sheet on someone else: her Book link and his 🎫 for her, side by side
    const o = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([id]) }) });
    act(o, 'open', { id }); act(o, 'person', { id, code: 'momdad-k3' });
    const os0 = sheet(o), hk = /<a class="btn pri" href="([^"]+)"[^>]*data-ret="[^"]+" data-code="momdad-k3"[^>]*data-k="gf">/.exec(os0);
    // he taps their Book and comes back: HIS 🎫 for them glows (in their sheet and on their row), not his own 🎫 beside his Book
    o.api.bookOut(id, 'momdad-k3'); o.api.bookAway(); const oBack = o.api.bookBack();
    const os = sheet(o), ov = screen(o);
    check(oBack && /class="btn tkb tkoff glow" data-act="booked"[^>]*data-code="momdad-k3"/.test(os) && !/data-act="booked"/.test(ov) && !/class="btn tkb tkoff glow" data-act="mybook"/.test(ov),
      'PIA-139 AC1 the organizer back from the Book he tapped for Mom & Dad: his 🎫 Booked for them glows in their sheet (PIA-154: the board has no 🎫), never his own 🎫');
    const p3 = nPosts(o);
    await tap(o, os, 'booked', { code: 'momdad-k3' }); await tick();
    const os2 = sheet(o);
    check(!!hk && hk[1].replace(/&amp;/g, '&') === TM.handoffs(o.api.modelOf(id), 'momdad-k3', { today: '2026-10-17', now: NOW }).gf.href && /data-act="booked" data-id="[^"]+" data-code="momdad-k3" aria-pressed="false"/.test(os) &&
      nPosts(o) - p3 === 1 && srv.read(id).responses['momdad-k3'].booked === true && /<div class="split"><a class="btn pri" href="https:\/\/www\.flighty\.com\/"[^>]*><span data-k="flighty"[\s\S]*?<\/a><button class="btn tkb tkon" data-act="booked"[^>]*aria-pressed="true"/.test(os2),
      'PIA-139 AC1 the organizer on Mom & Dad\'s sheet: their ✈ Book ↗ (their own search) beside his 🎫 Booked for them; one tap (they answered In) marks them booked, and the slot becomes [✈ Track ↗ | 🎫 Booked]');
  }
  {
    // AC2 booked times: typed in her sheet, saved as it closes, kept in the note's prefix, on everyone's pickup chips
    const id = seedAs(DWX, (d) => { atPeoria(d); chosenAt(d, '2026-11-06', '2026-11-09', 'PIA'); anjoIn({ note: 'Taking the red-eye', available_from: '2026-11-05', leave_from: 'ORD', booked: true, booked_at: '2026-10-16T00:00:00.000Z' })(d); });
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(t, 'open', { id }); act(t, 'person', { id, code: 'anjo-z5' });
    const p0 = nPosts(t);
    typed(t, 'tm-arr', '1510', 'anjo-z5'); typed(t, 'tm-dep', '18:05', 'anjo-z5');
    const keptOnRedraw = /id="tm-arr"[^>]*value="1510"/.test(sheet(t));
    t.api.closeSheet(); await until(() => /🛬/.test(srv.read(id).responses['anjo-z5'].note)); await tick();
    const ps = posts(t).slice(-1)[0], r = srv.read(id).responses['anjo-z5'];
    check(keptOnRedraw && nPosts(t) - p0 === 1 && ps.path === '/idea/respond' && r.note === '🛬15:10 🛫18:05 Taking the red-eye' && r.available_from === '2026-11-05' && r.leave_from === 'ORD' && r.origin === 'LGA' && r.booked === true && r.status === 'in',
      'PIA-139 AC2 she types 1510 and 18:05 in her sheet (kept through a redraw); closing it sends ONE complete answer: 🛬15:10 🛫18:05 before her note, her own arrival, the ORD leave, LGA and her 🎫 all kept', r);
    // everyone's map: the host's phone and a guest's phone read the times on their pickup chips
    const host = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'momdad-k3' } }) });
    act(host, 'tab', { v: 'map' });
    const mh = host.api.renderSelected('map', 'map').html;
    const guest = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'ashwin-p8' } }) });
    const mg = guest.api.renderSelected('map', 'map').html;
    // (PIA-157: Peoria is a rides trip, so each booked chip with a time carries its ride's 18px badge: no driver yet, a dashed ?)
    const chipRe = /<button class="pk arr bk" data-act="pickup" data-id="[^"]+" data-ap="PIA" data-v="2026-11-05" data-code="anjo-z5" aria-label="Lands PIA 11\/5 at 15:10, booked, Anjo, no driver yet" data-lbl="Arrive"><span class="pk1"><span class="tn">11\/5<\/span><span class="t tn">15:10<\/span><\/span><span class="pf" data-pic>🗽<\/span><span class="rbd q" data-k="noride">\?<\/span><\/button>/;
    const depRe = /<button class="pk dep bk" data-act="pickup" data-id="[^"]+" data-ap="ORD" data-v="2026-11-09" data-code="anjo-z5" aria-label="Leaves ORD 11\/9 at 18:05, booked, Anjo, no driver yet" data-lbl="Leave"><span class="pk1"><span class="tn">11\/9<\/span><span class="t tn">18:05<\/span><\/span>/;
    const laneOf = (h, ap) => (new RegExp('<div class="lrow" role="row"><span role="rowheader"><button class="lh" data-act="mapairport"[^>]*data-v="' + ap + '"[\\s\\S]*?</div></div>').exec(h) || [''])[0];
    check(chipRe.test(laneOf(mh, 'PIA')) && depRe.test(laneOf(mh, 'ORD')) && chipRe.test(mg) && depRe.test(mg) && /<b class="lc">PIA<\/b>/.test(mh) && /<b class="lc">ORD<\/b>/.test(mh) && mh.indexOf('$') < 0 && !/☀|🌃|✈/.test(laneOf(mh, 'PIA') + laneOf(mh, 'ORD')),
      'PIA-139 AC2 her times reach everyone\'s Map: the host\'s and a guest\'s pickups read 11/5 15:10 🗽 in PIA\'s row and 11/9 18:05 🗽 in ORD\'s (PIA-154: a lanes table, two lines a chip, solid while booked; no ☀ / 🌃 or booked mark, ✈ since PIA-156, on it; no price anywhere)');
    act(host, 'pickup', { id, v: '2026-11-05', code: 'anjo-z5' });
    const pkPerson = host.api.S.sheet && host.api.S.sheet.type === 'day' && host.api.S.sheet.p.mapmode === true;
    host.api.closeSheet();
    act(host, 'pickup', { id, v: '2026-11-05' });
    check(pkPerson && host.api.S.sheet && host.api.S.sheet.type === 'day' && host.api.S.sheet.p.date === '2026-11-05', 'PIA-143 every pickup chip opens P-day map mode (who lands, when, where)');
    host.api.closeSheet();
    // her note still reads, and the organizer changes only her 🛫 for her (📞 kept as it reads)
    const mid = srv.read(id); mid.responses['anjo-z5'].note = '📞 ' + mid.responses['anjo-z5'].note; srv.write(mid);
    const o = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([id]) }) });
    act(o, 'open', { id }); act(o, 'person', { id, code: 'anjo-z5' });
    const os = sheet(o);
    typed(o, 'tm-dep', '1930', 'anjo-z5'); o.api.closeSheet();
    await until(() => /19:30/.test(srv.read(id).responses['anjo-z5'].note)); await tick();
    check(/id="tm-arr"[^>]*value="15:10"/.test(os) && srv.read(id).responses['anjo-z5'].note === '📞 🛬15:10 🛫19:30 Taking the red-eye' && o.api.modelOf(id).members.find((x) => x.code === 'anjo-z5').noteText === 'Taking the red-eye',
      'PIA-139 AC2 the organizer records her 🛫 19:30 for her: only that time changes; her 🛬 15:10 and her note stay, the 📞 as it was');
    // a guest looking at her sees the times beside her days (no field); nothing is typed for someone not booked
    await guest.api.refresh(id); await tick();
    act(guest, 'open', { id }); act(guest, 'person', { id, code: 'anjo-z5' });
    const gs = sheet(guest); guest.api.closeSheet(); act(guest, 'person', { id, code: 'ashwin-p8' });
    const ms = sheet(guest);
    check(!/id="tm-/.test(gs) && /<span class="lt" role="img" aria-label="Lands at 15:10" data-lbl="Lands at"><span class="tn">15:10<\/span><\/span>/.test(gs) &&
      /<span class="lt" role="img" aria-label="Leaves at 19:30" data-lbl="Leaves at"><span class="tn">19:30<\/span><\/span>/.test(gs) && !/☀|🌃/.test(gs) && !/id="tm-/.test(ms),
      'PIA-139 AC2 a guest looking at her reads 15:10 and 19:30 beside her days (PIA-154: plain HH:MM; ☀ / 🌃 belong to the time field), with no field; my own sheet has no time fields until I have booked');
    // a time that is not HH:MM is not sent; neither is one that would cut her note
    const t2 = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(t2, 'open', { id }); act(t2, 'person', { id, code: 'anjo-z5' });
    const q0 = nPosts(t2);
    typed(t2, 'tm-arr', '25:99', 'anjo-z5'); t2.api.closeSheet(); await tick();
    const held = t2.api.S.sheet && t2.api.S.sheet.type === 'person', heldHtml = sheet(t2);
    t2.api.closeSheet(); await tick();
    check(nPosts(t2) === q0 && srv.read(id).responses['anjo-z5'].note === '📞 🛬15:10 🛫19:30 Taking the red-eye' && held && /<span class="fld tiny bad"><label for="tm-arr"/.test(heldHtml) && !t2.api.S.sheet,
      'PIA-139 AC2 a typed 25:99 is not a time: the first close keeps the sheet open with the field marked ⚠ (to fix in place); the second lets it go; nothing is sent');
    // a 12-hour reader's "440" (4:40 PM) never silently becomes 04:40: it waits for ☀ / 🌃, and the pick is what is sent
    act(t2, 'person', { id, code: 'anjo-z5' });
    typed(t2, 'tm-arr', '440', 'anjo-z5');
    const typing = sheet(t2);
    t2.api.timesLeft({ id: 'tm-arr' });
    const halves = sheet(t2), q1 = nPosts(t2);
    t2.api.closeSheet(); await tick();
    const stillOpen = t2.api.S.sheet && t2.api.S.sheet.type === 'person' && nPosts(t2) === q1;
    const hOrder = (/role="radiogroup" aria-label="Lands, which half of the day">([\s\S]*?)<\/div>/.exec(halves) || [])[1] || '';
    act(t2, 'tmhalf', { end: 'arr', v: 'pm' });
    const picked = sheet(t2);
    t2.api.closeSheet(); await until(() => /🛬16:40/.test(srv.read(id).responses['anjo-z5'].note)); await tick();
    check(/id="tm-half" data-sig="" hidden/.test(typing) && /data-act="tmhalf" data-end="arr" data-v="pm" aria-label="Daytime 16:40"><span class="dp" data-k="tday" aria-hidden="true">☀<\/span><span class="tn">16:40<\/span>/.test(hOrder) &&
      /data-act="tmhalf" data-end="arr" data-v="am" aria-label="Night 04:40"><span class="dp" data-k="tnight" aria-hidden="true">🌃<\/span><span class="tn">04:40<\/span>/.test(hOrder) && hOrder.indexOf('16:40') < hOrder.indexOf('04:40') &&
      stillOpen && /id="tm-arr"[^>]*value="16:40"/.test(picked) && /id="tm-half" data-sig="" hidden/.test(picked) && nPosts(t2) === q1 + 1 &&
      srv.read(id).responses['anjo-z5'].note === '🛬16:40 🛫19:30 Taking the red-eye',
      'PIA-139 AC2 "440" asks nothing while typed; left in the field it asks [☀ 16:40 | 🌃 04:40] (no words; daytime first) and holds the close; ☀ puts 16:40 in the field, and that is what is sent (her own write clears 📞)', srv.read(id).responses['anjo-z5'].note);
    // "6:05 pm" typed on a keyboard with letters decides its half at once; "905" closed twice without a pick is not sent
    act(t2, 'person', { id, code: 'anjo-z5' });
    const fake = { id: 'tm-dep', value: '6:05 pm', dataset: { code: 'anjo-z5' }, closest: () => null };
    t2.api.onTyped(fake);
    const q2 = nPosts(t2); t2.api.closeSheet(); await until(() => /🛫18:05/.test(srv.read(id).responses['anjo-z5'].note)); await tick();
    act(t2, 'person', { id, code: 'anjo-z5' });
    typed(t2, 'tm-arr', '905', 'anjo-z5'); const q3 = nPosts(t2);
    t2.api.closeSheet(); t2.api.closeSheet(); await tick();
    check(fake.value === '18:05' && q3 === q2 + 1 && srv.read(id).responses['anjo-z5'].note === '🛬16:40 🛫18:05 Taking the red-eye' && nPosts(t2) === q3 && !t2.api.S.sheet,
      'PIA-139 AC2 "6:05 pm" becomes 18:05 in the field and is sent as 🛫18:05; "905" with no ☀ / 🌃 picked is never sent as 09:05 (two closes: not sent)', srv.read(id).responses['anjo-z5'].note);
  }
  {
    // AC3 the organizer marks someone booked from the people board; someone who has not answered is recorded in first (📞)
    const id = seedAs(DWX, lock139);
    const o = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([id]) }) });
    act(o, 'open', { id }); act(o, 'person', { id, code: 'anjo-z5' });   // (PIA-154: his 🎫 Booked for her is in her sheet)
    const p0 = nPosts(o);
    tap(o, sheet(o), 'booked', { code: 'anjo-z5' }); await tick();
    const armedFirst = nPosts(o) === p0;
    await tap(o, sheet(o), 'booked', { code: 'anjo-z5' }); await tick();
    const ps = posts(o).slice(-2), r = srv.read(id).responses['anjo-z5'];
    const g = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    check(armedFirst && eq(ps.map((q) => q.path), ['/idea/respond', '/idea/booked']) && ps[0].body.status === 'in' && ps[0].body.note === '📞' && r.status === 'in' && r.booked && r.note === '📞' &&
      o.api.modelOf(id).stage === 'booking' && g.api.modelOf(id).stage === 'booking' && /data-act="achip"|data-act="answer"/.test(g.api.renderTrip(id).html),
      'PIA-139 AC3 his 🎫 Booked in Anjo\'s sheet (she had not answered): a confirming tap, then she is recorded In (📞) and booked; the stage reads Booking on his phone and on hers, and she can still answer (her chip opens the row)');
  }
  {
    // AC4 the stage advances to Booking and then Done from the booked flags, the same on every phone; nobody is locked out
    const id = seedAs(DWX, (d) => { atPeoria(d); chosenAt(d, '2026-11-06', '2026-11-09', 'PIA'); anjoIn()(d); });
    const ls = (me, key) => lsOf([id], Object.assign({ pialax_idea_me_v1: { [id]: me } }, key ? { pialax_idea_keys_v1: keyOf([id]), pialax_proxy_token: TOKEN } : {}));
    const look = async () => {
      const out = [];
      for (const [me, key] of [['ashwin-p8', true], ['anjo-z5', false], ['momdad-k3', false]]) {
        const t = await boot136({ ls: ls(me, key) });
        // (PIA-154: the stage is in ⋯ More, from the card and from the trip page; the card says 🔒, no pip. PIA-155: More's stage line)
        const card = t.api.renderIdeas().html, i = card.indexOf('data-trip="' + id + '"'), c = card.slice(i, card.indexOf('</article>', i));
        const now = (h) => { const x = /<div class="sline" role="img" aria-label="Stage (\d) of 5, ([^"]+)"[^>]*>[\s\S]*?<span class="sword">([^<]+)<\/span><\/div>/.exec(h); return x && x[2] === x[3] && +x[1] - 1 === ['Idea', 'Asking', 'Dates set', 'Booking', 'Done'].indexOf(x[3]) ? x[3] : undefined; };
        t.api.ACTS.stage({ dataset: { id, v: 'card' } }); const sc = now(sheet(t)); t.api.closeSheet();
        act(t, 'open', { id }); if (t.api.S.sheet) t.api.closeSheet();
        tap(t, screen(t), 'stage'); const st = now(sheet(t)); t.api.closeSheet();
        out.push([/<span data-k="lock">🔒<\/span>/.test(c) && !/class="pip/.test(c) ? 'lock' : '?', sc, st].join('/'));
      }
      return out;
    };
    const set = await look();
    let d = srv.read(id); d.responses['ashwin-p8'].booked = true; srv.write(d);
    const booking = await look();
    d = srv.read(id); d.responses['anjo-z5'].booked = true; srv.write(d);
    const done = await look();
    const h = await boot136({ ls: ls('momdad-k3') });
    act(h, 'open', { id });
    const hv = screen(h);
    await tap(h, hv, 'answer', { v: 'in' }); await tick();
    check(set.every((x) => x === 'lock/Dates set/Dates set') && booking.every((x) => x === 'lock/Booking/Booking') && done.every((x) => x === 'lock/Done/Done') &&
      /data-act="answer"/.test(hv) && srv.read(id).responses['momdad-k3'].status === 'in' && srv.read(id).decision.stage === 'chosen',
      'PIA-139 AC4 P-stage (⋯ More, from the card and from the trip page) reads Dates set → Booking → Done on the organizer\'s, Anjo\'s and the host\'s phones alike, from the booked flags alone (the card keeps 🔒); at Done the host (not answered yet) still answers In', { set, booking, done });
  }
  {
    // AC5 the paid total can be recorded only once every traveler has booked (P-stage, the organizer's token phone)
    const allBooked = (d) => { lock139(d); d.responses['momdad-k3'].booked = true; d.responses['ashwin-p8'].booked = true; anjoIn({ booked: true })(d); };
    const half = seedAs(DWX, (d) => { allBooked(d); d.responses['anjo-z5'].booked = false; }), done = seedAs(DWX, allBooked);
    const tok = (ids) => lsOf(ids, { pialax_idea_me_v1: Object.fromEntries(ids.map((i) => [i, 'ashwin-p8'])), pialax_idea_keys_v1: keyOf(ids), pialax_proxy_token: TOKEN });
    const o = await boot136({ ls: tok([half, done]) });
    act(o, 'open', { id: half }); act(o, 'stage', { id: half });
    const hs = sheet(o); o.api.closeSheet(); act(o, 'back');
    const noTok = await boot136({ ls: lsOf([done], { pialax_idea_me_v1: { [done]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([done]) }) });
    act(noTok, 'open', { id: done }); act(noTok, 'stage', { id: done }); const ns = sheet(noTok);
    const gst = await boot136({ ls: lsOf([done], { pialax_idea_me_v1: { [done]: 'anjo-z5' }, pialax_proxy_token: TOKEN }) });
    act(gst, 'open', { id: done }); act(gst, 'stage', { id: done }); const gs = sheet(gst);
    check(/<button class="tool wordy dis" data-act="paidwhy" aria-disabled="true" data-why="1" aria-label="Paid, not everyone booked" data-lbl="Not everyone booked" data-k="paid">💵<span class="uf" aria-hidden="true">🗽<\/span><\/button>/.test(hs) && !/paid-amt/.test(hs) &&
      !/data-k="paid"|paid-amt/.test(ns) && !/data-k="paid"|paid-amt/.test(gs),
      'PIA-139 AC5 before everyone has booked, 💵 is greyed with who is still to book (🗽), and a tap says why; no 💵 at all on the organizer\'s phone without the token, or on a guest\'s');
    act(o, 'open', { id: done }); act(o, 'stage', { id: done });
    const ds = sheet(o), p0 = nPosts(o);
    typed(o, 'paid-amt', '0'); await tap(o, sheet(o), 'paidsave'); await tick();
    const bad = o.api.S.sheet.local.paidBad && nPosts(o) === p0;
    // paying closes the answers and freezes everyone's times, so Save always asks first: ⚠ 🛬 (the three booked travelers have no
    // landing time) 🔒, the amount read back as dollars; the confirm lapses by itself, and a new amount puts it back
    typed(o, 'paid-amt', '1490'); await tap(o, sheet(o), 'paidsave'); await tick();
    const ask1 = sheet(o), asked1 = nPosts(o) === p0;
    CLOCK += 6001; const lapsed = !/>Confirm<\/button>/.test(sheet(o)); CLOCK = NOW; o.api.S.armTk = null;   // (as the app's own timer does then)
    await tap(o, sheet(o), 'paidsave'); typed(o, 'paid-amt', '$1,490'); const reset = !/>Confirm<\/button>/.test(sheet(o)) && nPosts(o) === p0;
    await tap(o, sheet(o), 'paidsave'); await tick();
    const ask2 = sheet(o);
    await tap(o, ask2, 'paidsave'); await tick(); await until(() => srv.read(done).decision.stage === 'booked'); await tick();
    const ps = posts(o).slice(p0), dd = srv.read(done);
    const after = sheet(o), card = (() => { act(o, 'back'); const c = o.api.renderIdeas().html, i = c.indexOf('data-trip="' + done + '"'); return c.slice(i, c.indexOf('</article>', i)); })();
    const gcard = (() => { const g2 = loadApp({ fetch: srv.fetch, ls: lsOf([done], { pialax_idea_me_v1: { [done]: 'anjo-z5' } }) }); return g2; })();
    await gcard.api.refreshAll(true); await tick();
    const gh = gcard.api.renderIdeas().html;
    check(asked1 && /<span class="w paidw" role="img" aria-label="Closes answers and flight times; no landing time from Mom &amp; Dad, Ashwin, Anjo" data-lbl="Closes answers" data-k="closes">⚠<span aria-hidden="true"><span data-k="arrive">🛬<\/span>🌽🌴🗽🔒<\/span><\/span>/.test(ask1) &&
      /id="paid-amt"[^>]*value="\$1,490"/.test(ask1) && /class="btn pri paidb arm" data-act="paidsave"[^>]*>Confirm<\/button>/.test(ask1) && lapsed && reset,
      'PIA-139 AC5 Save asks first even with everyone answered (paying closes the answers and freezes the times): ⚠ 🛬🌽🌴🗽 🔒 names who has no landing time (read out in words), 1490 reads back as $1,490; the confirm lapses after 6s, and a new amount puts it back', { ask1: ask1.slice(ask1.indexOf('paidask') - 20, ask1.indexOf('paidask') + 400) });
    check(/<input id="paid-amt"[^>]*placeholder="\$"/.test(ds) && /data-act="paidsave"[^>]*>Save<\/button>/.test(ds) && bad && ps.length === 1 && ps[0].path === '/idea/update' && eq(ps[0].body.decision, { stage: 'booked', actual_total: 1490 }) &&
      dd.decision.stage === 'booked' && dd.decision.actual_total === 1490 && /<div class="paidv" role="img" aria-label="Paid \$1,490"/.test(after) && /data-k="paid"><span class="g">💵<\/span>\$1,490<\/span>/.test(card) && gh.indexOf('$') < 0,
      'PIA-139 AC5 at 🏁 Done: 💵 field and Save; "0" is refused (nothing sent); $1,490 confirmed is ONE update {booked, 1490}; P-stage then reads 💵 $1,490 and so does his card, while a guest\'s card shows no $', ps.map((q) => q.path));
    // a typo is fixable: ✎ beside the paid amount gives the field again, and Save (one tap: nothing more closes) records 1,940
    act(o, 'open', { id: done }); act(o, 'stage', { id: done });
    const paidS = sheet(o), p1 = nPosts(o);
    await tap(o, paidS, 'paidedit');
    const editS = sheet(o);
    typed(o, 'paid-amt', '1,940'); await tap(o, sheet(o), 'paidsave'); await until(() => srv.read(done).decision.actual_total === 1940); await tick();
    const rp = posts(o).slice(p1);
    check(/data-act="paidedit"[^>]*aria-label="Change amount paid"[^>]*data-k="edit">✎<\/button>/.test(paidS) && /id="paid-amt"[^>]*value="\$1,490"/.test(editS) && rp.length === 1 && eq(rp[0].body.decision, { stage: 'booked', actual_total: 1940 }) &&
      srv.read(done).decision.stage === 'booked' && /aria-label="Paid \$1,940"/.test(sheet(o)),
      'PIA-139 AC5 ✎ on a paid trip: the field holds $1,490; 1,940 is one more booked update, and P-stage reads 💵 $1,940');
    o.api.closeSheet(); act(o, 'back');
    // with a host who has not answered, Save asks first (paying closes the answers); a trip never 🔒 is chosen first
    const pe = seedAs(DWX, (d) => { atPeoria(d); d.responses['ashwin-p8'].booked = true; anjoIn({ booked: true })(d); });
    const o2 = await boot136({ ls: tok([pe]) });
    act(o2, 'open', { id: pe }); act(o2, 'stage', { id: pe });
    typed(o2, 'paid-amt', '905'); const q0 = nPosts(o2);
    tap(o2, sheet(o2), 'paidsave'); await tick();
    const ask = sheet(o2), asked = nPosts(o2) === q0;
    await tap(o2, ask, 'paidsave'); await until(() => srv.read(pe).decision.stage === 'booked'); await tick();
    const ps2 = posts(o2).slice(-3).filter((q) => q.path === '/idea/update');
    check(asked && /<span class="w paidw" role="img" aria-label="Closes answers and flight times; no answer from Mom &amp; Dad; no landing time from Ashwin, Anjo" data-lbl="Closes answers" data-k="closes">⚠<span aria-hidden="true">🌽<span data-k="arrive">🛬<\/span>🌴🗽🔒<\/span><\/span>/.test(ask) &&
      /class="btn pri paidb arm" data-act="paidsave"[^>]*>Confirm<\/button>/.test(ask) &&
      ps2.length === 2 && ps2[0].body.decision.stage === 'chosen' && eq(ps2[1].body.decision, { stage: 'booked', actual_total: 905 }) && srv.read(pe).decision.actual_total === 905,
      'PIA-139 AC5 with Mom & Dad (hosts) not answered yet, Save asks first (⚠🌽 🛬🌴🗽 🔒 Confirm: paying closes their answers and freezes the times; a screen reader hears who); the confirm on a trip never 🔒 sends 🔒 the plan, then 💵 905', ps2.map((q) => q.body.decision.stage));
    // many still to answer: three faces then +n, and every one is named for a screen reader
    const many = TM.tripModel(Object.assign({}, srv.read(pe), { decision: { stage: 'chosen', chosen: { airport: 'PIA', city: 'Peoria', departure: '2026-11-06', return: '2026-11-09' } } }), { today: '2026-10-17', now: NOW, me: 'ashwin-p8', hasEditKey: true, hasToken: true });
    many.members = many.members.concat([1, 2, 3, 4].map((i) => Object.assign({}, many.members[0], { code: 'h' + i, face: ['🐝', '🦉', '🐸', '🐙'][i - 1], short: 'Host ' + i, resp: null, host: true, traveler: false })));
    o2.api.S.armTk = many.id + '||paid'; o2.api.S.armAt = NOW;   // as a first Save tap leaves it
    const mh2 = o2.api.paidRow(many, {}); o2.api.S.armTk = null;
    check(/⚠<span aria-hidden="true">🌽🐝🦉\+2<span data-k="arrive">🛬<\/span>/.test(mh2) && /no answer from Mom &amp; Dad, Host 1, Host 2 \+2/.test(mh2),
      'PIA-139 AC5 five still to answer: ⚠🌽🐝🦉+2 (three faces, then +n), and the label names three of them +2', mh2.slice(mh2.indexOf('paidask'), mh2.indexOf('paidask') + 300));
    // a 🎫 taken away on another phone after this one drew 🏁: nothing is paid, the sheet shows who is still to book
    const race = seedAs(DWX, allBooked);
    const o3 = await boot136({ ls: tok([race]) });
    act(o3, 'open', { id: race }); act(o3, 'stage', { id: race });
    const rd = srv.read(race); rd.responses['anjo-z5'].booked = false; srv.write(rd);
    typed(o3, 'paid-amt', '700'); const r0 = posts(o3).length;
    await tap(o3, sheet(o3), 'paidsave'); await tap(o3, sheet(o3), 'paidsave'); await tick();   // Save, Confirm
    check(posts(o3).slice(r0).length === 0 && srv.read(race).decision.stage === 'chosen' && /data-act="paidwhy"/.test(sheet(o3)),
      'PIA-139 AC5 a 🎫 taken away on another phone after this one drew 🏁: Save sends nothing (re-checked on the fresh record), and 💵 is greyed again with who is to book');
  }
  {
    // AC6 calendar-plus at any dated stage: Apple (.ics) or Google, tentative before the dates are set, only the guest link inside
    const open = seedAs(DWX), locked = seedAs(DWX, (d) => { lock139(d); anjoIn()(d); }), undated = seedAs(fx('idea-undated.json')), dropped = seedAs(DWX, (d) => { d.decision.stage = 'dropped'; });
    const o = await boot136({ ls: lsOf([open, locked, undated, dropped], { pialax_idea_me_v1: { [open]: 'ashwin-p8', [locked]: 'ashwin-p8', [undated]: 'momdad-c1', [dropped]: 'ashwin-p8' },
      pialax_idea_keys_v1: keyOf([open, locked, undated, dropped]), pialax_proxy_token: TOKEN }) });
    // (PIA-154: 📅 Calendar is a row in ⋯ More, P-stage, opened from the trip page's nav)
    const sheetOf = (id) => { act(o, 'open', { id }); tap(o, screen(o), 'stage'); const more = sheet(o), has = /data-act="caladd"/.test(more); if (has) tap(o, more, 'caladd'); const s = has ? sheet(o) : ''; const pn = o.api.S.sheet ? o.api.popupName(o.api.S.sheet) : ''; o.api.closeSheet(); act(o, 'back'); return { has, s, pn, nav: /data-act="caladd"/.test(screen(o) || '') }; };
    const so = sheetOf(open), sl = sheetOf(locked), su = sheetOf(undated), sd = sheetOf(dropped);
    const ics = (s) => { const m = /<a class="btn" href="data:text\/calendar;charset=utf-8,([^"]+)" download="([^"]+)"/.exec(s); return m ? { text: decodeURIComponent(m[1].replace(/&amp;/g, '&')).replace(/\r\n /g, ''), file: m[2] } : null; };
    const gcal = (s) => ((/<a class="btn" href="(https:\/\/calendar\.google\.com\/[^"]+)" target="_blank" rel="noopener noreferrer"/.exec(s) || [])[1] || '').replace(/&amp;/g, '&');
    const io = ics(so.s), il = ics(sl.s), go = gcal(so.s), gl = gcal(sl.s);
    const secret = (x) => [KEY, TOKEN, '#k=', 'k=' + KEY, 't=' + TOKEN, 'edit_key'].some((s) => x.indexOf(s) >= 0);
    check(so.has && sl.has && !su.has && !sd.has && so.pn === 'P-calendar-add' && io && il && io.file === 'diwaliinraleigh.ics' &&
      /\nSTATUS:TENTATIVE\r?\n/.test(io.text) && /SUMMARY:\? 🪔 Diwali in Raleigh/.test(io.text) && !/class="tq"/.test(so.s) &&
      /\nSTATUS:CONFIRMED\r?\n/.test(il.text) && !/class="tq"|🔒/.test(sl.s) && /DTSTART;VALUE=DATE:20261106\r\nDTEND;VALUE=DATE:20261110/.test(il.text),
      'PIA-139 AC6 📅 Calendar is in ⋯ More on a dated trip (none on an undated idea or a dropped one); P-calendar-add\'s .ics is tentative ("? ", STATUS:TENTATIVE) before 🔒 and confirmed after (11/6–11/9, end 11/10); PIA-154: no ? corner or 🔒 on the sheet');
    check([io.text, il.text, go, gl, so.s, sl.s].every((x) => !secret(x)) && (io.text.match(/https?:\/\/[^\s\\]+/g) || []).join() === W + '/i/' + open && /[?&]details=([^&]*)/.exec(gl) && decodeURIComponent(/[?&]details=([^&]*)/.exec(gl)[1]) === W + '/i/' + locked &&
      /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=%3F%20/.test(go),
      'PIA-139 AC6 on the organizer\'s phone holding the edit key and the token, neither rides into the event: the .ics and the Google link carry only the guest /i/<id> link');
    check(/<a class="btn" href="data:text\/calendar[^"]*" download="[^"]+" data-cal="ics" aria-label="Phone calendar file, for Apple Calendar"[^>]*data-k="ics"><span aria-hidden="true">📅<\/span> Phone<\/a>/.test(sl.s) && /data-cal="gcal" aria-label="Google Calendar"[^>]*><span aria-hidden="true">↗<\/span> Google<\/a>/.test(sl.s),
      'PIA-139 AC6 each calendar link\'s spoken name starts with what it shows ("Phone calendar file", "Google Calendar": WCAG 2.5.3), the file one "📅 Phone"');
  }
  {
    // PIA-139 fix pass: the way back from Google Flights — a Book tap that never left is dropped; one that did survives a reload
    const id = seedAs(DWX, (d) => { lock139(d); anjoIn()(d); });
    const ls = () => lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } });
    const t = await boot136({ ls: ls() });
    act(t, 'open', { id });
    t.api.bookOut(id, 'anjo-z5'); CLOCK += t.api.LEAVE_MS + 1; t.api.bookAway(); const dropped = t.api.S.ret === null;
    t.doc.visibilityState = 'hidden'; t.api.bookAway(); t.doc.visibilityState = 'visible'; const later1 = t.api.bookBack();
    CLOCK = NOW;
    check(dropped && !later1 && !/glow/.test(prim139(screen(t))) && t.ss.getItem(t.api.RET_KEY) === null,
      'PIA-139 a Book tap that has not left the app 8s later is dropped: a later trip away and back (📣\'s share sheet, another app) makes nothing glow');
    // away in Google Flights, the page is discarded; the tab loads it again: the 🎫 invites its tap once
    const ss = t.ss;
    t.api.bookOut(id, 'anjo-z5'); t.doc.visibilityState = 'hidden'; t.api.bookAway();
    const kept = JSON.parse(ss.getItem(t.api.RET_KEY) || 'null');
    const t2 = await boot136({ ls: ls(), ss });
    act(t2, 'open', { id });
    const p2 = prim139(screen(t2)), gone = ss.getItem(t2.api.RET_KEY) === null;
    const t3 = await boot136({ ls: ls(), ss });
    act(t3, 'open', { id });
    check(kept && kept.id === id && kept.code === 'anjo-z5' && !('away' in kept) && /class="btn tkb tkoff glow" data-act="mybook"[^>]*aria-label="I booked, tap to mark"/.test(p2) && gone && !/glow/.test(prim139(screen(t3))),
      'PIA-139 a Book tap away in Google Flights is kept in the tab ({id, code, at}); a page the phone discarded and loads again makes the 🎫 glow once ("I booked, tap to mark"), and only once', kept);
    ss.setItem(t.api.RET_KEY, JSON.stringify({ id, code: 'anjo-z5', at: NOW - 4 * 36e5 }));
    const t4 = await boot136({ ls: ls(), ss }); act(t4, 'open', { id });
    ss.setItem(t.api.RET_KEY, '{"id":"<b>","code":"x","at":1}');
    const t5 = await boot136({ ls: ls(), ss }); act(t5, 'open', { id });
    check(!/glow/.test(prim139(screen(t4))) && !/glow/.test(prim139(screen(t5))) && ss.getItem(t.api.RET_KEY) === null,
      'PIA-139 a kept Book tap older than 3h, or one that is not a trip id, invites nothing (and is dropped)');
  }
  {
    // PIA-139 fix pass: a hostile or malformed cached landing time never reaches a chip's markup or a ⏱ run
    const id = seedAs(DWX, (d) => { atPeoria(d); chosenAt(d, '2026-11-06', '2026-11-09', 'PIA'); anjoIn({ available_from: '2026-11-05' })(d); });
    const o = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([id]), pialax_proxy_token: TOKEN }) });
    const k = o.api.modelOf(id).members.find((x) => x.code === 'anjo-z5').keys[0].key, ashK = o.api.modelOf(id).members.find((x) => x.code === 'ashwin-p8').keys[0].key;
    const fares = {}; fares[k] = { p: 300, f: NOW - 36e5, ar: '<img src=x onerror=alert(1)>', off: [{ ar: '"><b>x</b>' }] }; fares[ashK] = { p: 250, f: NOW - 36e5, off: [{ ar: '2026-11-06 15:20' }] };
    o.ls.setItem('pialax_fares_v2', JSON.stringify(fares));
    const lanes = o.api.lanesHTML(o.api.modelOf(id));
    const chip = o.api.pickupChip(o.api.modelOf(id), { kind: 'arr', date: '2026-11-05', time: '<img src=x onerror=alert(1)>', pred: true, faces: ['🗽'], codes: ['anjo-z5'], maybe: false, booked: false }, 'PIA');
    check(!/<img|<b>|onerror/.test(lanes) && !/<img|onerror/.test(chip) && /aria-label="Lands PIA 11\/5, not booked, Anjo"/.test(lanes) && /<span class="t tn pred"><span data-k="predicted">≈<\/span>15:20<\/span>/.test(lanes) && !/class="t tn/.test(chip),
      'PIA-139 the organizer\'s cached offers: a landing time that is markup or junk draws no time and no markup (her chip reads "Lands PIA 11/5"); a "YYYY-MM-DD HH:MM" stamp reads as ≈15:20; pickupChip itself drops a time that is not HH:MM', { lanes: lanes.slice(0, 600) });
  }
  {
    // PIA-139 fix pass: taking a 🎫 back (a sticky confirm) clears its times; times typed when the page is hidden go then;
    // a time typed for someone who was unbooked meanwhile is not sent
    const id = seedAs(DWX, (d) => { atPeoria(d); chosenAt(d, '2026-11-06', '2026-11-09', 'PIA'); anjoIn({ note: '🛬11:05 🛫17:20 Back Sunday', booked: true, booked_at: '2026-10-16T00:00:00.000Z' })(d); });
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(t, 'open', { id }); act(t, 'person', { id, code: 'anjo-z5' });
    const p0 = nPosts(t);
    typed(t, 'tm-dep', '1930', 'anjo-z5');
    t.doc.visibilityState = 'hidden'; t.api.flushTimes(); t.doc.visibilityState = 'visible';
    await until(() => /🛫19:30/.test(srv.read(id).responses['anjo-z5'].note)); await tick();
    const flushed = nPosts(t) === p0 + 1 && t.api.S.sheet && t.api.S.sheet.type === 'person' && !t.api.S.sheet.local.times;
    t.api.render(); const s0 = sheet(t);
    await tap(t, s0, 'unbook', { code: 'anjo-z5' }); await tick();
    CLOCK += 30000; const s1 = sheet(t), stillArmed = /data-act="unbook"[^>]*aria-label="Confirm not booked"/.test(s1); CLOCK = NOW;
    const p1 = nPosts(t);
    await tap(t, s1, 'unbook', { code: 'anjo-z5' }); await until(() => srv.read(id).responses['anjo-z5'].booked === false); await tick();
    const up = posts(t).slice(p1), r = srv.read(id).responses['anjo-z5'];
    const host = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'momdad-k3' } }) }); act(host, 'tab', { v: 'map' });
    const mh = host.api.renderSelected('map', 'map').html;
    check(flushed && nPosts(t) - p1 === 2 && stillArmed && eq(up.map((q) => q.path), ['/idea/respond', '/idea/booked']) && r.note === 'Back Sunday' && r.booked === false && r.status === 'in' && !/11:05|19:30/.test(mh) && /aria-label="Lands PIA 11\/6[^"]*Anjo"/.test(mh),
      'PIA-139 her 🛫 19:30 typed with the sheet open goes when the page is hidden; her 🎫 taken back waits for its second tap past 6s (sticky), then one answer clears 🛬 / 🛫 (her note kept) before the 🎫 goes; the host\'s Map shows no time for her', { flushed, stillArmed, n: nPosts(t) - p1, up: up.map((q) => q.path), note: r.note, mh: mh.slice(mh.indexOf('lanes'), mh.indexOf('lanes') + 500) });
    // the organizer types a time for her while another phone takes her 🎫 back: nothing is sent and 🎫⚠ says why, whether this phone
    // has read the change by then (its own check) or not yet (the fresh read before the write holds it back, never a P-error).
    // PIA-140 fix pass 2: each case is set up and waited for by what the app does, never by how fast a read comes back (the test
    // used to refresh once, which joined the read the trip's open had sent before the change, and then raced that phone's fresh
    // read against a fixed number of ticks: 1 run in 30 saw the P-error the stale path then opened)
    const unbookedMeanwhile = async (knows) => {
      const idx = seedAs(DWX, (d) => { atPeoria(d); chosenAt(d, '2026-11-06', '2026-11-09', 'PIA'); anjoIn({ booked: true, booked_at: '2026-10-16T00:00:00.000Z' })(d); });
      const o = await boot136({ ls: lsOf([idx], { pialax_idea_me_v1: { [idx]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([idx]) }), rec: ['#toast'] });
      act(o, 'open', { id: idx }); act(o, 'person', { id: idx, code: 'anjo-z5' });
      typed(o, 'tm-arr', '1510', 'anjo-z5');
      const dx = srv.read(idx); dx.responses['anjo-z5'].booked = false; srv.write(dx);
      // the first refresh joins the read the open sent before the change (awaited, it is done); the second reads the record as it is
      if (knows) { await o.api.refresh(idx); await o.api.refresh(idx); }
      const an = o.api.modelOf(idx).members.find((x) => x.code === 'anjo-z5'), sawBooked = !!an && !!an.booked;
      const q0 = nPosts(o), g0 = o.fetches.length; o.api.closeSheet();
      await until(() => /✈⚠/.test(o.rec['#toast'].innerHTML) && !(o.api.PEND[idx] > 0)); await tick();
      return { sawBooked, toast: /✈⚠/.test(o.rec['#toast'].innerHTML), posts: posts(o).slice(q0).map((q) => q.path), reads: o.fetches.slice(g0).filter((f) => f.method === 'GET').length,
        sheet: o.api.S.sheet ? o.api.S.sheet.type : null, note: srv.read(idx).responses['anjo-z5'].note || '' };
    };
    const kn = await unbookedMeanwhile(true), st = await unbookedMeanwhile(false);
    check(!kn.sawBooked && st.sawBooked && st.reads >= 1 && [kn, st].every((r) => r.toast && !r.posts.length && r.sheet === null && !/🛬/.test(r.note)),
      'PIA-139 a time typed for someone whose 🎫 was taken back on another phone meanwhile is not sent and 🎫⚠ says so: when this phone has read the change, and when it has not yet (the fresh read holds the write back; no P-error)',
      { kn, st });
  }
  {
    // PIA-139 fix pass: the doors and labels — 💵 from the trip view at 🏁, the no-link reason in a person's slot, the key
    const allB = (d) => { lock139(d); d.responses['momdad-k3'].booked = true; d.responses['ashwin-p8'].booked = true; anjoIn({ booked: true })(d); };
    const done = seedAs(DWX, allB), noAp = seedAs(DWX, (d) => { lock139(d); anjoIn()(d); d.idea.members.forEach((m) => { if (m.code === 'anjo-z5') m.airport = ''; }); d.responses['anjo-z5'].origin = ''; });
    const o = await boot136({ ls: lsOf([done, noAp], { pialax_idea_me_v1: { [done]: 'ashwin-p8', [noAp]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([done, noAp]), pialax_proxy_token: TOKEN }) });
    act(o, 'open', { id: done });
    const v = screen(o), door = /<button class="btn wide" data-act="paidopen" data-id="[^"]+" aria-label="Paid: record what we paid" data-lbl="Paid"><span aria-hidden="true" data-k="paid">💵<\/span> Paid<\/button>/.test(v);
    act(o, 'paidopen', { id: done });
    const opened = o.api.S.sheet && o.api.S.sheet.type === 'stage' && o.api.S.sheet.focus === 'paid-amt';
    o.api.closeSheet(); act(o, 'back');
    const g = await boot136({ ls: lsOf([done], { pialax_idea_me_v1: { [done]: 'anjo-z5' } }) }); act(g, 'open', { id: done });
    act(o, 'open', { id: noAp }); act(o, 'person', { id: noAp, code: 'anjo-z5' });
    const ns = sheet(o); o.api.closeSheet();
    // (PIA-156: ✈ alone is booked: ⓘ groups LEGEND entries by their glyph, so ✈ must be the glyph of one entry only (a round-trip
    // fare is ↔; a missing link ↗⚠ and bad dates 🗓⚠); ✈ otherwise only leads the arrowed hand-offs ✈↗ and ✈⏱↗)
    const LG = o.api.LEGEND, byG = {}; Object.keys(LG).forEach((k) => { (byG[LG[k][0]] = byG[LG[k][0]] || []).push(k); });
    const kl = o.api.keyLabel({ k: 'booked', keys: byG['✈'] }), withPlane = Object.keys(LG).filter((k) => LG[k][0].indexOf('✈') >= 0).sort();
    check(door && opened && !/paidopen/.test(screen(g)) && /<span class="btn pri dis" role="img" aria-label="No home airport" data-lbl="No home airport" data-k="noairport">📍\?<\/span><button class="btn tkb tkoff" data-act="booked"/.test(ns) &&
      kl === 'Booked' && eq(byG['✈'], ['booked']) && eq(withPlane, ['booked', 'flighty', 'gf']) && eq(byG['↔'], ['rt']) && LG.nolink[0] === '↗⚠' && LG.fixdates[0] === '🗓⚠' &&
      o.api.LEG_GLYPH.rt[0] === '↔' && !o.api.LEGEND.mybook,
      'PIA-139 at Done the organizer\'s trip view has "💵 Paid" opening P-stage at the 💵 field (not on a guest\'s); a person\'s [Book | 🎫 Booked] without a link says why (📍? No home airport), as the trip view does; PIA-156: in ⓘ\'s key ✈ alone has one meaning, Booked (a round-trip fare is ↔, no flight link ↗⚠, bad dates 🗓⚠; ✈ otherwise only leads ✈↗ and ✈⏱↗)', { kl, plane: withPlane, rt: byG['↔'] });
  }

  // ═══ PIA-140: prices ═══
  section('PIA-140 prices: one honest total from real fares (P-total, the trip view, the card, the board, P-person agree), never spent without a tap; caps, locks, HITs; v1\'s counters and fares');
  {
    const SERP = fx('serp-flights.json');
    // the in-process Worker's paid routes: its token, its SerpAPI key, and SerpAPI itself stubbed (prices by route, from the fixture)
    srv.env.PROXY_TOKEN = TOKEN; srv.env.SERPAPI_KEY = 'serp-key';
    const serpLog = [], SM = { mode: 'ok', bias: 0, acct: { plan_searches_left: 900, total_searches_left: 900, this_month_usage: 41, searches_per_month: 1000 } };
    const serpFor = (u) => {
      const q = new URL(u).searchParams, dep = q.get('departure_id').split(','), arr = q.get('arrival_id').split(',');
      const base = 150 + crypto.createHash('md5').update([dep, arr, q.get('outbound_date'), q.get('return_date') || '', q.get('adults') || ''].join('|')).digest()[0] + SM.bias;
      const j = clone(SERP);
      // the cheapest offer leaves from the set's first airport (sorted) and lands at the arrival set's first: a nearby search can win elsewhere
      j.best_flights[0].price = base + 13; j.best_flights[0].flights[0].departure_airport.id = dep[dep.length - 1]; j.best_flights[0].flights[1].arrival_airport.id = arr[0];
      j.other_flights.forEach((o, i) => { o.price = base + [0, 36, 59][i]; o.flights[0].departure_airport.id = dep[0]; o.flights[o.flights.length - 1].arrival_airport.id = arr[0]; });
      return j;
    };
    const offline = globalThis.fetch;
    globalThis.fetch = async (u) => {
      const s = String(u);
      if (/^https:\/\/serpapi\.com\/account\.json\?/.test(s)) return new Response(JSON.stringify(SM.acct), { status: 200 });
      if (/^https:\/\/serpapi\.com\/search\.json\?/.test(s)) {
        serpLog.push(s);
        if (SM.mode === '429') return new Response('{"error":"Your account has run out of searches."}', { status: 429 });
        if (SM.mode === '401') return new Response('{"error":"Invalid API key. Your API key should be here: https://serpapi.com/manage-api-key"}', { status: 401 });
        if (SM.mode === 'none') return new Response(JSON.stringify({ search_metadata: { status: 'Success' }, error: 'Google Flights hasn\'t returned any results for this query.' }), { status: 200 });
        return new Response(JSON.stringify(serpFor(s)), { status: 200 });
      }
      return offline(u);
    };
    // the app's requests: /search and /account run on the test clock (the Worker stamps X-Fetched-At and its UTC day from it)
    const RealDate = Date;
    const pfetch = async (url, opts) => {
      const pth = new URL(String(url)).pathname;
      if (pth !== '/search' && pth !== '/account') return srv.fetch(url, opts);
      globalThis.Date = FixedDate;
      try { return await srv.fetch(url, opts); } finally { globalThis.Date = RealDate; }
    };
    const paidOf = (t, from) => t.fetches.slice(from || 0).filter((f) => /\/(search|account)(\?|$)/.test(f.url.replace(W, '')));
    const searches = (t, from) => paidOf(t, from).filter((f) => f.url.indexOf(W + '/search?') === 0);
    const quotaOf = (t) => JSON.parse(t.ls.getItem('pialax_serpapi_quota') || 'null');
    const ptotal = (t, id) => { t.api.render(true); return t.api.SHEETS.total({ type: 'total', p: { id }, local: {} }); };   // drawn as a render would (its clock)
    const wipeWorkerFares = () => { [...srv.map.keys()].filter((k) => /^fare:|^quota:/.test(k)).forEach((k) => srv.map.delete(k)); };
    const boot140 = async (ls) => { const t = loadApp({ fetch: pfetch, ls }); await t.api.refreshAll(true); await tick(); t.api.render(); return t; };
    // the organizer's phone as v1 left it: the token, the trip's key, and pialax_multi_airport_v1 (v1 read it from /account)
    const orgLs = (id, extra) => lsOf([id], Object.assign({ pialax_idea_keys_v1: keyOf([id]), pialax_proxy_token: TOKEN, pialax_idea_me_v1: { [id]: 'ashwin-p8' }, pialax_multi_airport_v1: '1' }, extra || {}));
    // PIA-154: an end's ±1 days (and their 🔍2) appear in a person's sheet once that end's own fare is cached: the sheet's one 🔍N
    // (data-v person) prices their legs first
    const endSearch = async (t, end) => { if (!ctl(sheet(t), 'search', { end: String(end) })) { await tap(t, sheet(t), 'search', { v: 'person' }); await tick(20); } return tap(t, sheet(t), 'search', { end: String(end) }); };
    CLOCK = NOW;

    // AC4 nothing is fetched by itself: open, render, poll, focus, P-person, even with day-old fares → zero /search
    const DQ = seedAs(DWX);
    const stale = {}; TM.tripModel(srv.read(DQ), { today: '2026-10-17', now: NOW, me: 'ashwin-p8', hasEditKey: true, hasToken: true, multiAirport: true }).travelers.forEach((x) => x.keys.forEach((k) => { stale[k.key] = { p: 300, f: NOW - 30 * 36e5 }; }));
    const q0 = await boot140(orgLs(DQ, { pialax_fares_v2: stale }));
    act(q0, 'open', { id: DQ }); await q0.api.poll(); CLOCK += 6000; await q0.api.onFocus(); CLOCK = NOW; q0.api.render();
    act(q0, 'person', { id: DQ, code: 'ashwin-p8' }); await tick(); const pq = sheet(q0); q0.api.closeSheet();
    q0.api.render(true); const tq = screen(q0), cq = q0.api.cardHTML({ id: DQ, x: q0.api.listEntry(DQ), m: q0.api.modelOf(DQ) });
    const tqRow = (/<button class="pricerow[\s\S]*?<\/button>/.exec(tq) || [''])[0];
    check(searches(q0).length === 0 && /<span class="tot stale" data-k="total">\$900 <span data-k="search">🔍<\/span><\/span>/.test(cq) && /<button class="pricerow"[^>]*aria-label="Group total \$900, not complete, some fares a day old"[\s\S]*?<span class="tot stale" data-k="total">\$900 <span data-k="search">🔍<\/span><\/span>/.test(tqRow) && !/data-k="unpriced"|class="chipq/.test(tqRow) &&
      /class="lgp stale"[^>]*data-lbl="Old fare"/.test(pq) && /data-act="search"[^>]*data-v="person" data-code="ashwin-p8" data-n="1"/.test(pq) && /data-act="search"[^>]*data-code="ashwin-p8" data-end="0"/.test(pq),
      'PIA-140 AC4 nothing is fetched by itself: opening, a redraw, the 60s poll and a focus with three day-old fares make 0 /search; the fares turn grey with 🔍 (the card, and the trip\'s price row: PIA-155 no faces, every flight was searched; P-total offers the refresh with its cost), a person\'s legs read "Old fare" with their own 🔍1, and 🔍 for their ±1 days', { searches: searches(q0).length, cq: (/<span class="tot[\s\S]*?<\/button>/.exec(cq) || [])[0], tq: tqRow });

    // AC1 / AC3 the organizer's P-total: every leg $— until searched; the cost on 🔍 before it is tapped; one tap prices them all
    const DA = seedAs(DWX);
    const a = await boot140(orgLs(DA, { pialax_multi_airport_v1: '' }));
    act(a, 'open', { id: DA });
    const blk0 = (/<button class="pricerow[\s\S]*?<\/button>/.exec(screen(a)) || [])[0] || '';
    const pre = searches(a).length;
    // a tap on 🔍 as P-total draws it, before /account ever ran (so before it said nearby airports are taken): single airports
    const want1 = a.api.modelOf(DA).travelers.map((x) => x.keys[0].key);
    await tap(a, ptotal(a, DA), 'search');
    const q1 = quotaOf(a), m1 = a.api.modelOf(DA);   // before the /account sync that follows the run (SerpAPI's own count then replaces it)
    await tick(20);
    const s1 = searches(a, 0).slice(pre);
    check(/aria-label="Price Mom &amp; Dad’s, Ashwin’s and Anjo’s flights"[^>]*>[\s\S]*?<span class="uf" data-k="unpriced">🌽🌴🗽<\/span>/.test(blk0) && s1.length === 3 && s1.every((f, i) => f.headers['X-Pialax-Token'] === TOKEN && f.url === W + '/search?' + TM.searchQuery(want1[i]) && f.url.indexOf(',') < 0 && f.url.indexOf(TOKEN) < 0) &&
      q1 && q1.used === 3 && a.api.spentRead() === 3 && m1.price.complete && serpLog.length === 3,
      'PIA-140 AC3 one tap on 🔍3: three GET /search (one per round trip, the model\'s own queries; one airport each until /account says nearby airports are taken), the token in its header only; v1\'s month counter and this session\'s count move by 3', { urls: s1.map((f) => f.url), q1 });
    await until(() => !!a.api.S.acct); await tick();
    const multi = a.ls.getItem('pialax_multi_airport_v1') === '1', m2 = a.api.modelOf(DA);
    check(multi && paidOf(a).filter((f) => /\/account$/.test(f.url)).length === 1 && quotaOf(a).used === 41 && m2.travelers.every((x) => x.keys[0].key.indexOf(',') > 0) && m2.price.total === null,
      'PIA-140 AC3 /account after the run: v1\'s pialax_multi_airport_v1 = "1" (the Worker takes nearby airports), the month\'s usage from SerpAPI\'s own count (41); from now on each leg is the nearby search, sorted (BUR,LAX,LGB,ONT,SNA), and the single-airport fares no longer price it');
    act(a, 'total', { id: DA });
    const pt0 = ptotal(a, DA);
    await tap(a, pt0, 'search'); await tick(20);
    const m3 = a.api.modelOf(DA), pt1 = ptotal(a, DA), s2 = searches(a).slice(-3);
    const legPrices = (h) => [...h.matchAll(/<span class="lgp[^"]*" role="img" aria-label="([^"]*)"/g)].map((x) => x[1]);
    check(/<button class="btn pri wide" data-act="search" data-id="[^"]+" data-v="total" data-n="3" aria-label="Search 3 fares, 3 searches" data-lbl="Search 3 fares"><span aria-hidden="true" data-k="search">🔍<\/span><span class="tn">3<\/span><\/button>/.test(pt0) &&
      legPrices(pt0).every((x) => /not searched$/.test(x)) && legPrices(pt0).length === 3 && s2.every((f) => /departure_id=[A-Z,]*,[A-Z]/.test(f.url)) && m3.price.complete && !/data-act="search"/.test(pt1),
      'PIA-140 AC3 P-total shows the cost before spending (🔍3, "Search 3 fares, 3 searches"), every leg $— until then; its tap searches the nearby sets, and then nothing is left to search (no 🔍)', { pt0: legPrices(pt0) });
    // AC1 one pricing function: P-total's rows and sum, the trip's block, the card, the board and P-person's legs agree
    const p3 = m3.price, per = (c) => p3.per[c].sum, money = (n) => '$' + n.toLocaleString('en-US');
    const card3 = a.api.cardHTML({ id: DA, x: a.api.listEntry(DA), m: m3 }), view3 = screen(a);
    act(a, 'person', { id: DA, code: 'momdad-k3' }); const pm = sheet(a); a.api.closeSheet();
    const rowsSum = legPrices(pt1).map((x) => +/\$([\d,]+)/.exec(x)[1].replace(/,/g, '')).reduce((x, y) => x + y, 0);
    check(p3.total === per('momdad-k3') + per('ashwin-p8') + per('anjo-z5') && rowsSum === p3.total && new RegExp('<span class="tot" data-k="total">' + money(p3.total).replace('$', '\\$') + '</span>').test(pt1) &&
      card3.indexOf('data-k="total">' + money(p3.total) + '</span>') > 0 && view3.indexOf('data-k="total">' + money(p3.total) + '</span>') > 0 &&
      ((/<span class="stack" aria-hidden="true">([\s\S]*?)<\/span>/.exec(view3) || [])[1] || '').split('<i ').length - 1 === 3 && !/class="pr"/.test(view3) && pm.indexOf('<span class="tn">' + money(per('momdad-k3')) + '</span>') > 0,
      'PIA-140 AC1 one number everywhere: P-total\'s legs add up to its sum, which is the trip view\'s price row and the card\'s total (PIA-154: the price row stacks the 3 priced travelers; no per-person column on the board), and Mom & Dad\'s leg in their sheet — all the model\'s priceTrip', { total: p3.total, rowsSum });
    // AC2 each priced leg: its age, Google's level, its stops, the airport that won when it is not their own
    const ash = legPrices(pt1).find((x) => /from BUR/.test(x)) || '', any = legPrices(pt1);
    check(any.length === 3 && any.every((x) => /fetched just now, price low, 1 stop$/.test(x)) && /Round trip, \$[\d,]+ from BUR, fetched just now/.test(ash) && /<b class="lc" data-k="won" data-lbl="From BUR">BUR→<\/b>/.test(pt1) && /<b class="lc" data-k="won" data-lbl="From ORD">ORD→<\/b>/.test(pt1) && /<b class="lc" data-k="won" data-lbl="From EWR">EWR→<\/b>/.test(pt1) &&
      (pt1.match(/class="agering"[^>]*data-k="age" data-lbl="Fetched just now"/g) || []).length === 3 && (pt1.match(/class="lvl l1"[^>]*data-k="level" data-lbl="Price low"><i class="on"><\/i><i class=""><\/i><i class=""><\/i>/g) || []).length === 3 &&
      (pt1.match(/class="stopl"[^>]*data-k="stops" data-lbl="1 stop"/g) || []).length === 3,
      'PIA-140 AC2 each priced leg shows its fare age ◷, Google\'s price level (a low-to-high gauge with its own bar filled, not a signal meter) and its stops, each naming itself on a long press ("Fetched just now", "Price low", "1 stop"), and the airport that won when it is not their home, on the side it is on (BUR→ for Ashwin, ORD→ for Mom & Dad, EWR→ for Anjo), from the search already paid for', any);
    // the same legs in Mom & Dad's own sheet name the airport that won too (P-total and P-person agree), with ⓘ for the glyphs
    act(a, 'person', { id: DA, code: 'momdad-k3' }); const pmc = sheet(a); a.api.closeSheet();
    check(/<b class="lc" data-k="won" data-lbl="From ORD">ORD→<\/b>/.test(pmc) && /data-act="skey" aria-label="Key" data-k="key">ⓘ</.test(pmc) && /data-act="skey" aria-label="Key" data-k="key">ⓘ</.test(pt1) && /<span class="temo" aria-hidden="true" data-pic>🪔<\/span>/.test(pt1),
      'PIA-140 P-person names the airport that won (ORD→ for Mom & Dad), as P-total does; both sheets carry ⓘ for their glyphs, and P-total\'s header shows the trip\'s own picture');
    // AC5 ▼ / ▲ only between two real fetches of identical searches; a day later they are grey and offer the refresh (on the same
    // phone in a new session: this one has spent 6 of its 8)
    const a8 = a.api.spentRead();
    CLOCK = NOW + 25 * 36e5;
    const capped = ptotal(a, DA);
    const aa = await boot140(orgLs(DA, { pialax_fares_v2: JSON.parse(a.ls.getItem('pialax_fares_v2')) }));
    const day = ptotal(aa, DA), card4 = aa.api.cardHTML({ id: DA, x: aa.api.listEntry(DA), m: aa.api.modelOf(DA) }), dayLegs = legPrices(day);
    check(a8 === 6 && /data-n="2" aria-label="Search 2 of 3 fares, 2 searches"[^>]*><span aria-hidden="true" data-k="search">🔍<\/span><span class="tn">2\/3<\/span>/.test(capped) && dayLegs.length === 3 && dayLegs.every((x) => /fetched 25 hours ago, a day old/.test(x)) && (day.match(/class="lgp stale"/g) || []).length === 3 &&
      /aria-label="Search 3 fares, 3 searches"/.test(day) && /data-k="total">\$[\d,]+ <span data-k="search">🔍<\/span><\/span>/.test(card4) && !/data-k="down"|data-k="up"/.test(day),
      'PIA-140 AC4 a day later every fare is grey ("a day old") and P-total offers the one-tap refresh (🔍3; on the phone that spent 6 this session, 🔍2/3: the visit\'s 8 cut it short, and it says so); no ▼ / ▲ yet (one fetch each)', { a8 });
    wipeWorkerFares(); SM.bias = -20;
    const sa = searches(aa).length;
    await tap(aa, day, 'search'); await tick(20);
    const pt5 = ptotal(aa, DA), m5 = aa.api.modelOf(DA);
    check(searches(aa).length === sa + 3 && /<span class="dl dn" data-k="down">▼\$60<\/span>/.test(pt5) && (pt5.match(/class="tn dl dn">▼\$20</g) || []).length === 3 && m5.price.complete &&
      /<span class="dl dn" data-k="down">▼\$60<\/span>/.test(aa.api.totalRow(m5)),
      'PIA-140 AC5 the refresh (3 real searches) finds each fare $20 lower: each leg reads ▼$20 and the total ▼$60, on P-total and on the trip view');
    // A3 a HIT on another phone keeps the first fetch's time, moves no counter, and (the same fetch) keeps its ▼
    const b = await boot140(orgLs(DA, { pialax_fares_v2: JSON.parse(aa.ls.getItem('pialax_fares_v2')) }));
    CLOCK = NOW + 27 * 36e5;
    const fb0 = JSON.parse(b.ls.getItem('pialax_fares_v2')), bk = b.api.modelOf(DA).travelers.map((x) => x.keys[0].key);
    const fb0m = Object.assign({}, fb0); delete fb0m[bk[0]];
    b.ls.setItem('pialax_fares_v2', JSON.stringify(fb0m));   // this phone never had that fare
    b.api.render(true);
    const sb = searches(b).length, nSerp = serpLog.length;
    await tap(b, ptotal(b, DA), 'search');
    const fb1 = JSON.parse(b.ls.getItem('pialax_fares_v2'))[bk[0]], qb = quotaOf(b);
    await tick(20);
    check(searches(b).length === sb + 1 && serpLog.length === nSerp && fb1.f === fb0[bk[0]].f && fb1.p === fb0[bk[0]].p && (!qb || qb.used === 0) && b.api.spentRead() === 0 &&
      /fetched 2 hours ago/.test(ptotal(b, DA)),
      'PIA-140 A3 a Worker cache HIT (another phone, 2h later): one /search, no SerpAPI call, the fare keeps its first fetch time ("fetched 2 hours ago", not just now), and neither v1\'s month counter nor the session moves', { fb1, qb });
    CLOCK = NOW;

    // AC3 a tap while P-total's /account read is still out waits for it (◷): its searches are then the nearby ones the Worker
    // takes, never single-airport searches the next render would drop (the same 3 legs, 3 searches)
    {
      const DR = seedAs(DWX);
      wipeWorkerFares();   // (the Worker's cache holds these searches from above: they would be HITs, which spend nothing)
      const r = await boot140(orgLs(DR, { pialax_multi_airport_v1: '' }));
      act(r, 'open', { id: DR }); act(r, 'total', { id: DR });
      const out = !!r.api.S.acctBusy, s0 = searches(r).length;
      const run = tap(r, ptotal(r, DR), 'search');
      const waiting = !!(r.api.S.spendBusy && r.api.S.spendBusy.wait) && /data-act="search"[^>]*aria-busy="true"[^>]*>◷</.test(ptotal(r, DR)) && searches(r).length === s0;
      await run; await tick(20);
      const sr = searches(r).slice(s0), mr = r.api.modelOf(DR);
      check(out && waiting && sr.length === 3 && sr.every((f) => /departure_id=[A-Z]{3},[A-Z,]+&/.test(f.url)) && mr.price.complete && r.api.spentRead() === 3 && !r.api.S.spendBusy,
        'PIA-140 AC3 a 🔍 tap while P-total\'s /account read is out waits for it (◷, nothing sent yet), then searches the nearby sets the Worker says it takes: 3 searches, the total complete', { out, waiting, urls: sr.map((f) => f.url) });
    }

    // AC6 one end ±1 day from the person's sheet, the same caps: 🔍2 → the day before and after; ★ on the cheapest; a tap moves it
    const DP = seedAs(DWX);
    const c = await boot140(orgLs(DP, { pialax_multi_airport_v1: '1' }));
    act(c, 'open', { id: DP }); act(c, 'person', { id: DP, code: 'ashwin-p8' });
    const ps0 = sheet(c), cs0 = searches(c).length;
    await tap(c, ps0, 'search', { v: 'person' }); await tick(20);
    const psA = sheet(c), csA = searches(c).length;
    await tap(c, psA, 'search', { end: '0' }); await tick(20);
    const ps1 = sheet(c), s3 = searches(c).slice(csA), mc = c.api.modelOf(DP), x0 = mc.travelers.find((x) => x.code === 'ashwin-p8');
    const ep = TM.endPrices(mc, 'ashwin-p8', 0, c.api.readFares(), CLOCK, '2026-10-17');
    const chips = [...ps1.matchAll(/<(?:button|span) class="dch([^"]*)"[^>]*aria-label="([^"]*)"/g)].map((x) => x[2]).slice(0, 3);
    check(/<button class="btn sq" data-act="search" data-id="[^"]+" data-v="person" data-code="ashwin-p8" data-n="1" aria-label="Search 1 fare, 1 search"/.test(ps0) && !/data-end="0" data-n="\d"|class="dch|\$—/.test(ps0) && csA === cs0 + 1 &&
      /<button class="btn sq" data-act="search" data-id="[^"]+" data-code="ashwin-p8" data-end="0" data-n="2" aria-label="Search 2 fares, 2 searches"/.test(psA) && s3.length === 2 &&
      s3.map((f) => f.url).join() === ep.rows.filter((r) => r.k).map((r) => W + '/search?' + TM.searchQuery(r.key)).join() && ep.rows.filter((r) => r.k).every((r) => r.p != null) && ep.need.length === 0 &&
      chips.length === 3 && /^Arrive 11\/5, \$[\d,]+ round trip/.test(chips[0]) && /^Arrive 11\/6, \$[\d,]+ round trip(, cheapest)?, their day$/.test(chips[1]) && /^Arrive 11\/7, \$/.test(chips[2]) && ep.rows.filter((r) => r.star).length === 1 && (ps1.match(/data-k="cheapest">★</g) || []).length === 1 &&
      !/data-code="ashwin-p8" data-end="0" data-n="\d" aria-label="Search/.test(ps1) &&
      /<button class="dch[^"]* tap" data-act="legshift" data-id="[^"]+" data-code="ashwin-p8" data-end="0" data-day="2026-11-05"/.test(ps1) && x0.keys[0].key === ep.rows[1].key,
      'PIA-140 AC6 in Ashwin\'s sheet (PIA-154) his own 🔍1 prices his round trip first (no $— chips before); then 🔍2 prices his arrival ±1 day (2 searches, the round trip with that day moved); the three days then read their $ with ★ on the cheapest, and the day before or after is a tap from being his', { chips, urls: s3.map((f) => f.url) });
    {
      // PIA-151: once he has booked, a booked day moves only on its calendar (with its ⚠ 🎫 confirm): the day before and after still
      // read their price, and a tap on one says so instead of moving his flight on a second tap
      const bd = srv.read(DP); bd.responses['ashwin-p8'].booked = true; bd.responses['ashwin-p8'].booked_at = '2026-10-16T00:00:00.000Z'; srv.write(bd);
      c.api.closeSheet(); await c.api.refreshAll(true); await tick(); act(c, 'person', { id: DP, code: 'ashwin-p8' });
      const pb = sheet(c), n0 = nPosts(c);
      const ro = !/class="fares"|data-act="legshift"|data-act="search"/.test(pb);
      const r0 = c.api.ACTS.legshift({ dataset: { id: DP, code: 'ashwin-p8', end: '0', day: '2026-11-05' }, getAttribute: (k) => (k === 'aria-disabled' ? 'true' : null) });
      const r1 = c.api.ACTS.legshift({ dataset: { id: DP, code: 'ashwin-p8', end: '0', day: '2026-11-05' } });
      await tick();
      await settleWrites(c, DP);
      check(ro && r0 === null && r1 === null && nPosts(c) === n0 && c.api.modelOf(DP).members.find((x) => x.code === 'ashwin-p8').own1 === '',
        'PIA-151 / PIA-154 booked, his sheet shows no fares or ±1 days (his flight is bought); a day chip tapped anyway moves nothing and sends nothing (his day changes on its calendar)', { ro });
      c.api.closeSheet();
    }

    // AC3 the locks, as every spend control shows them: the Worker's day cap (⛔ 17:00 local, until 00:00 UTC), the month (⛔ 11/1)
    const DL = seedAs(DWX);
    const d = await boot140(orgLs(DL, { pialax_daily_cap_v1: '2026-10-17' }));
    act(d, 'open', { id: DL });
    const lk1 = ptotal(d, DL), dsz = searches(d).length;
    await act(d, 'search', { id: DL, v: 'total' }); act(d, 'person', { id: DL, code: 'anjo-z5' }); const lkp = sheet(d); d.api.closeSheet();
    CLOCK = Date.UTC(2026, 9, 18, 0, 1, 0); const dayOver = d.api.lockNow(); CLOCK = NOW;
    d.ls.removeItem('pialax_daily_cap_v1'); d.ls.setItem('pialax_serpapi_quota', JSON.stringify({ period: '2026-10', used: 12, budget: 1000, exceeded: true }));
    const lk2 = ptotal(d, DL);
    d.ls.setItem('pialax_serpapi_quota', JSON.stringify({ period: '2026-10', used: 50, budget: 50, exceeded: false })); const lk3 = d.api.lockNow();
    d.ls.setItem('pialax_serpapi_quota', JSON.stringify({ period: '2026-10', used: 12, budget: 1000, exceeded: false })); d.api.S.acct = { plan_searches_left: 10 }; const lk4 = d.api.lockNow(); d.api.S.acct = null;
    d.ls.setItem('pialax_serpapi_quota', JSON.stringify({ period: '2026-09', used: 990, budget: 1000, exceeded: true })); const lk5 = d.api.lockNow();
    check(/<button class="btn pri wide dis" data-act="search"[^>]*aria-disabled="true" data-why="1" aria-label="Searches resume at 17:00" data-lbl="Daily limit" data-k="cap">⛔ 17:00<\/button>/.test(lk1) &&
      /<button class="btn sq dis" data-act="search"[^>]*aria-label="Searches resume at 17:00" data-lbl="Daily limit 17:00" data-k="cap">⛔<\/button>/.test(lkp) && searches(d).length === dsz && dayOver === '' &&
      /aria-label="SerpAPI refused the last search; checked again in a few minutes, at the latest searches resume on 11\/1" data-lbl="SerpAPI refused" data-k="cap">⛔ 11\/1<\/button>/.test(lk2) && lk3 === 'month' && lk4 === 'month' && lk5 === '' && d.api.readQuota().used === 0,
      'PIA-140 AC3 the Worker\'s day cap reads ⛔ 17:00 on P-total (local time of 00:00 UTC), ⛔ in a person\'s square ±1 button with the time in its label, and spends nothing; it lifts at 00:00 UTC; the month lock (upstream 429, the organizer\'s month cap, the plan\'s last 10) reads ⛔ 11/1 and says why (SerpAPI refused); a new month starts at 0, unlocked (v1\'s rule)');

    // AC4 a search that found no fares: $∅, not offered again within 24h, offered a day later
    const DN = seedAs(DWX, (dd) => { dd.idea.members = dd.idea.members.filter((x) => x.code === 'ashwin-p8'); dd.responses = { 'ashwin-p8': dd.responses['ashwin-p8'] }; });
    const e = await boot140(orgLs(DN));
    wipeWorkerFares(); SM.mode = 'none'; await tap(e, ptotal(e, DN), 'search'); await tick(20); SM.mode = 'ok';
    const ne = ptotal(e, DN); CLOCK = NOW + 25 * 36e5; const ne2 = ptotal(e, DN); CLOCK = NOW;
    check(/<span class="lgp none" role="img" aria-label="Round trip, no fares found" data-lbl="No fares" data-k="nofare">[\s\S]*?\$∅<\/span>/.test(ne) && !/data-act="search"/.test(ne) && /aria-label="Search 1 fare, 1 search"/.test(ne2) &&
      /<span class="lgp none stale" role="img" aria-label="Round trip, no fares found, a day old" data-lbl="No fares" data-k="nofare">[\s\S]*?\$∅<\/span>/.test(ne2) && !/\$—/.test(ne2.replace(/<span class="tot[^>]*>\$—/, '')),
      'PIA-140 AC4 a search that found no fares reads $∅ and is not offered again within 24h; a day later it is (🔍1), still $∅ (it was searched), grey', { ne, ne2 });

    // v1's fare cache: a live one-adult fare v1 fetched counts here (its own fetch time); one searched here is written there as v1's
    // own fetch would; a 2-adult search never is (v1 searches one adult)
    const DV = seedAs(DWX);
    const ashKey = '1|LAX|RDU|2026-11-06|2026-11-09|1';
    const v1e = TM.v1Fare(serpFor('https://serpapi.com/search.json?departure_id=LAX&arrival_id=RDU&outbound_date=2026-11-06&return_date=2026-11-09'), NOW - 2 * 36e5, false, true);
    wipeWorkerFares();
    const f = await boot140(orgLs(DV, { pialax_multi_airport_v1: '', pialax_prices_v1: { 'LAX|RDU|2026-11-06|2026-11-09': v1e, 'LAX|RDU|2026-11-07|2026-11-09': { data: { ow: 99, live: false }, ts: NOW } } }));
    const absorbed = JSON.parse(f.ls.getItem('pialax_fares_v2') || '{}')[ashKey], mf = f.api.modelOf(DV);
    await tap(f, ptotal(f, DV), 'search'); await tick(20);
    const v1after = JSON.parse(f.ls.getItem('pialax_prices_v1') || '{}');
    check(absorbed && absorbed.f === NOW - 2 * 36e5 && absorbed.p === Math.min(...v1e.data.offers.map((o) => o.price)) && mf.price.per['ashwin-p8'].complete && mf.price.need === 2 &&
      v1after['LGA|RDU|2026-11-06|2026-11-09'] && v1after['LGA|RDU|2026-11-06|2026-11-09'].data.live === true && v1after['LGA|RDU|2026-11-06|2026-11-09'].ts === NOW && !Object.keys(v1after).some((k) => /^PIA/.test(k)) &&
      v1after['LAX|RDU|2026-11-06|2026-11-09'].ts === NOW - 2 * 36e5 && !!v1after['LAX|RDU|2026-11-07|2026-11-09'] && !f.api.readFares()['1|LAX|RDU|2026-11-07|2026-11-09|1'],
      'PIA-140 v1\'s live fare for Ashwin\'s search counts here as fetched 2h ago (never a sample); the two left are searched (🔍2), Anjo\'s one-adult fare written into v1\'s cache as v1 would keep it, Mom & Dad\'s 2-adult fare never', Object.keys(v1after));

    // AC7 no price leaves this phone: answers, edits and shares after the fares are cached carry none of them
    const sharedUrls = [], tsh = loadApp({ fetch: pfetch, ls: orgLs(DA, { pialax_fares_v2: JSON.parse(a.ls.getItem('pialax_fares_v2')), pialax_multi_airport_v1: '1' }), navigator: { userAgent: 'x', share: (o) => { sharedUrls.push(o.url); return Promise.resolve(); }, clipboard: { writeText: (u) => { sharedUrls.push(u); return Promise.resolve(); } } } });
    await tsh.api.refreshAll(true); await tick(); act(tsh, 'open', { id: DA });
    const nums = Object.values(JSON.parse(tsh.ls.getItem('pialax_fares_v2'))).map((x) => String(x.p));
    const from = tsh.fetches.length;
    await act(tsh, 'answer', { id: DA, v: 'maybe', code: 'ashwin-p8' }); await tsh.api.organizerWrite(DA, { caption: 'Puja Sunday' }); act(tsh, 'tshare', { id: DA }); await tick(10);
    const out = tsh.fetches.slice(from).map((x) => (x.body || '') + x.url).join(' ') + sharedUrls.join(' ');
    check(nums.length >= 3 && nums.every((n) => out.indexOf(n) < 0) && sharedUrls.length >= 1 && !/\$/.test(out),
      'PIA-140 AC7 no price leaves this phone: an answer, an organizer edit and the trip\'s 📣 after three fares were cached carry none of them (no $, none of the amounts)', { nums, out: out.slice(0, 300) });

    // AC7 guests and phones without the token: no $ at all, no /search or /account, whatever is tapped
    const g = await boot140(lsOf([DA], { pialax_idea_me_v1: { [DA]: 'anjo-z5' }, pialax_proxy_token: TOKEN, pialax_fares_v2: JSON.parse(a.ls.getItem('pialax_fares_v2')) }));
    // (the taps are forged with a cost, data-n 4, as if a 🔍 had been drawn: the gate is the model's prices, not the button)
    act(g, 'open', { id: DA }); act(g, 'total', { id: DA }); await act(g, 'search', { id: DA, v: 'total', n: '4' }); act(g, 'person', { id: DA, code: 'ashwin-p8' }); const gs = sheet(g); g.api.closeSheet(); await tick(5);
    const nt = await boot140(lsOf([DA], { pialax_idea_keys_v1: keyOf([DA]), pialax_idea_me_v1: { [DA]: 'ashwin-p8' }, pialax_fares_v2: JSON.parse(a.ls.getItem('pialax_fares_v2')) }));
    act(nt, 'open', { id: DA }); act(nt, 'total', { id: DA }); await act(nt, 'search', { id: DA, v: 'total', n: '4' }); act(nt, 'settings'); await tick(5);
    const ntv = screen(nt), door = ctl(ntv, 'tokdoor');
    nt.api.closeSheet(); act(nt, 'tokdoor'); const ntSh = nt.api.S.sheet;
    check(paidOf(g).length === 0 && paidOf(nt).length === 0 && !g.api.S.sheet && !/\$/.test(screen(g) + gs) && !/\$/.test(ntv) && !/data-act="total"/.test(screen(g) + ntv) &&
      !!door && /data-lbl="Add token" data-k="tokdoor">🔑🔍<\/button>/.test(ntv) && !/tokdoor/.test(screen(g)) && ntSh && ntSh.type === 'organizer' && ntSh.focus === 'org-token' && paidOf(nt).length === 0,
      'PIA-140 AC7 a guest (holding the token) and the organizer\'s phone without the token show no $ at all and make no /search or /account call, whatever is tapped; the organizer\'s phone without it shows one muted 🔑🔍 ("Add token") that opens ⚙ at the token field (a guest sees none)');

    // ⚙ the organizer's month cap (v1's budget) and today's Worker searches
    const h = await boot140(orgLs(DA));
    act(h, 'settings'); await until(() => !!h.api.S.acct); await tick();
    const st0 = sheet(h);
    h.api.onTyped({ id: 'org-cap', value: '4x0', dataset: {}, closest: () => null }); act(h, 'orgsave');
    const qh = quotaOf(h);
    check(/<span class="tn bud" role="img" aria-label="\d+ of 30 searches left today" data-lbl="Searches left" data-k="sday">/.test(st0) && /<input id="org-cap" inputmode="numeric"[^>]*value="1000">/.test(st0) && /<span class="tn mu" aria-hidden="true">41\/<\/span>/.test(st0) &&
      qh && qh.budget === 40 && qh.used === 41 && h.api.lockNow() === 'month' && /⛔ 11\/1/.test(sheet(h)),
      'PIA-140 ⚙ on the organizer\'s phone: today\'s Worker searches left (from /account), this visit\'s 8, the month\'s 41 used against a month cap the organizer sets (digits only: "4x0" → 40, v1\'s budget), and a cap under what is used locks the month (⛔ 11/1)', qh);
    check(/data-lbl="Month cap" data-k="cap">⛔ 11\/1<\/span>/.test(sheet(h)) && !/data-lbl="Daily limit"/.test(sheet(h)),
      'PIA-140 ⚙ says why the month is locked where the month is counted ("Month cap": raising it lifts it), and no day lock is drawn beside it');

    // ═══ PIA-140 fix pass ═══
    const boot140o = async (o) => { const t = loadApp(Object.assign({ fetch: pfetch }, o)); await t.api.refreshAll(true); await tick(); t.api.render(); return t; };
    const toastOf = (t) => (t.rec['#toast'] ? t.rec['#toast'].innerHTML : '');
    const acctN = (t) => paidOf(t).filter((f) => /\/account$/.test(f.url)).length;
    const opened = async (t, id) => { act(t, 'open', { id }); act(t, 'total', { id }); await until(() => !t.api.S.acctBusy); await tick(); };

    // a tap never spends more than its control showed: an /account read still out when it lands can switch nearby airports on
    {
      const DB = seedAs(DWX);
      wipeWorkerFares();
      const single = TM.tripModel(srv.read(DB), { today: '2026-10-17', now: NOW, me: 'ashwin-p8', hasEditKey: true, hasToken: true, multiAirport: false });
      const fr = {}; single.travelers.filter((x) => x.code !== 'momdad-k3').forEach((x) => x.keys.forEach((k) => { fr[k.key] = { p: 300, f: NOW - 36e5, off: [] }; }));
      const t = await boot140o({ ls: orgLs(DB, { pialax_multi_airport_v1: '', pialax_fares_v2: fr }), rec: ['#toast'] });
      act(t, 'open', { id: DB }); act(t, 'total', { id: DB });   // P-total opens: its /account read goes out
      const busy = !!t.api.S.acctBusy, pt = ptotal(t, DB), s0 = searches(t).length, shown = (ctl(pt, 'search') || {}).n;
      await tap(t, pt, 'search'); await tick(20);
      const after = ptotal(t, DB), sNone = searches(t).length - s0, said = toastOf(t);
      await tap(t, after, 'search'); await tick(20);
      const sNext = searches(t).length - s0;
      check(busy && shown === '1' && sNone === 0 && /data-n="3" aria-label="Search 3 fares, 3 searches"/.test(after) && /🔍3\?/.test(said) && sNext === 3 && t.api.spentRead() === 3,
        'PIA-140 a tap never spends more than its control showed: P-total drew 🔍1 (two single-airport fares fresh), and the /account read still out when it was tapped switched nearby airports on (3 legs to search): that tap spent nothing, P-total is drawn again with 🔍3 ("🔍3?"), and only the next tap spends the 3', { shown, sNone, sNext, said });
    }

    // a booked traveler's flight is bought: never offered for spending
    {
      const DK = seedAs(DWX, (dd) => { dd.responses['anjo-z5'] = { member: 'anjo-z5', status: 'in', origin: 'LGA', available_from: '', available_to: '', note: '', arrive_at: '', leave_from: '', booked: true, updated_at: '2026-10-12T00:00:00.000Z' }; });
      wipeWorkerFares();
      const t = await boot140o({ ls: orgLs(DK) });
      act(t, 'open', { id: DK });
      const m = t.api.modelOf(DK), anjo = m.travelers.find((x) => x.code === 'anjo-z5'), anjoKey = anjo.keys[0].key;
      const pt = ptotal(t, DK);
      act(t, 'person', { id: DK, code: 'anjo-z5' }); const as = sheet(t); t.api.closeSheet();
      const s0 = searches(t).length;
      const forged = await t.api.runSearch([anjoKey], { id: DK, n: 4 });
      await tap(t, pt, 'search'); await tick(20);
      const sent = searches(t).slice(s0);
      check(anjo.booked && /data-n="2" aria-label="Search 2 fares, 2 searches"/.test(pt) && /class="lgp miss"[^>]*data-k="unsearched">[\s\S]*?—<\/span>/.test(pt) && !/\$—/.test(pt) && !/data-act="search"/.test(as) && forged.asked === 0 &&
        sent.length === 2 && sent.every((f) => f.url !== W + '/search?' + TM.searchQuery(anjoKey)),
        'PIA-140 a booked traveler\'s legs are never offered for spending (v1\'s Get Live Fares skips them too): her leg is shown (PIA-154: a muted —, never $—), P-total\'s 🔍2 prices the two still to book, her sheet has no 🔍, and a search run handed her leg anyway sends nothing', { sent: sent.map((f) => f.url) });
    }

    // the trip page's total block never advertises a cost no tap will spend
    {
      const DC = seedAs(DWX);
      const t = await boot140o({ ls: orgLs(DC, { pialax_daily_cap_v1: '2026-10-17' }) });
      act(t, 'open', { id: DC }); const v1 = screen(t);
      t.ls.removeItem('pialax_daily_cap_v1'); t.ss.setItem('pialax_spent_v2', '8'); t.api.render(true); const v2 = screen(t);
      check(/<button class="pricerow"[^>]*><span class="chipq w lk" data-k="cap">⛔ 17:00<\/span><\/button>/.test(v1) && /<button class="pricerow"[^>]*><span class="chipq w lk" data-k="cap">⛔<\/span><\/button>/.test(v2) && !/🔍<\/span><span class="tn">0|Price <span class="tn">0/.test(v1 + v2),
        'PIA-140 the trip page\'s price row shows the lock instead of a cost no tap will spend: ⛔ 17:00 under the Worker\'s day cap, ⛔ once the visit\'s 8 are spent; never a 🔍0');
    }

    // the visit's 8: ⛔ ↻ says how it lifts, and a confirming tap starts a new visit (it spends nothing itself)
    {
      const DV2 = seedAs(DWX); wipeWorkerFares();
      const ss = makeLocalStorage(); ss.setItem('pialax_spent_v2', '8');
      const t = await boot140o({ ls: orgLs(DV2), ss, rec: ['#toast'] });
      await opened(t, DV2);
      const p0 = ptotal(t, DV2), s0 = searches(t).length;
      act(t, 'settings'); const st0 = sheet(t); t.api.closeSheet(); act(t, 'total', { id: DV2 });
      await tap(t, p0, 'newvisit'); const p1 = ptotal(t, DV2);
      await tap(t, p1, 'newvisit'); const p2 = ptotal(t, DV2), said = toastOf(t);
      const sMid = searches(t).length - s0;
      await tap(t, p2, 'search'); await tick(20);
      check(/<button class="btn pri wide" data-act="newvisit" aria-label="Visit limit: 8 searches used\. Tap twice to start a new visit of 8" data-lbl="New visit" data-k="newvisit">⛔ ↻<\/button>/.test(p0) && !/data-act="search"/.test(p0) &&
        /<button class="tool wordy" data-act="newvisit"/.test(st0) && !/data-k="month"[\s\S]*⛔/.test(st0) &&
        /class="btn pri wide arm" data-act="newvisit"[^>]*>↻<span class="tn">8<\/span>\?<\/button>/.test(p1) && /data-n="3" aria-label="Search 3 fares, 3 searches"/.test(p2) && /↻ 8/.test(said) && sMid === 0 &&
        searches(t).length - s0 === 3 && t.api.spentRead() === 3,
        'PIA-140 the visit\'s 8 spent: P-total shows ⛔ ↻ ("New visit", read out as how it lifts) and ⚙ draws the same ↻ beside the visit\'s dots, not in the month\'s row; the first tap asks (↻8?), the second starts a new visit of 8 and spends nothing itself; the 🔍3 that follows is its own tap');
    }

    // SerpAPI's own 429: held a few minutes, then lifted by an /account read that shows the plan has searches left
    {
      const DM = seedAs(DWX); wipeWorkerFares();
      const t = await boot140o({ ls: orgLs(DM), rec: ['#toast'] });
      await opened(t, DM);
      SM.mode = '429'; await tap(t, ptotal(t, DM), 'search'); await tick(20); SM.mode = 'ok';
      await until(() => !t.api.S.acctBusy); await tick();
      const q1 = quotaOf(t), lk1 = t.api.lockNow(), p1 = ptotal(t, DM), told = toastOf(t), sent1 = searches(t).length;
      CLOCK = NOW + 2 * 60000; const a0 = acctN(t);
      await tap(t, p1, 'search'); await tick(10);
      const a1 = acctN(t), lk2 = t.api.lockNow();
      CLOCK = NOW + 6 * 60000;
      await tap(t, ptotal(t, DM), 'search'); await until(() => !t.api.S.acctBusy); await tick();
      const a2 = acctN(t), lk3 = t.api.lockNow(), p3 = ptotal(t, DM), q3 = quotaOf(t);
      const keep = SM.acct; SM.acct = Object.assign({}, keep, { total_searches_left: 0, plan_searches_left: 0 });
      CLOCK = NOW + 12 * 60000; await t.api.accountSync(true); const lk4 = t.api.lockNow(), q4 = quotaOf(t); SM.acct = keep;
      CLOCK = NOW;
      check(q1.exceeded && lk1 === 'month' && /data-lbl="SerpAPI refused" data-k="cap">⛔ 11\/1</.test(p1) && /⛔ 11\/1/.test(told) && a1 === a0 && lk2 === 'month' &&
        a2 === a1 + 1 && lk3 === '' && !q3.exceeded && q3.used === 41 && /data-act="search"[^>]*data-n="3"/.test(p3) && q4.exceeded && lk4 === 'month' && searches(t).length === sent1,
        'PIA-140 SerpAPI\'s own 429 locks the month (⛔ 11/1, "SerpAPI refused"); the /account read right after it, and a tap on ⛔ within 5 minutes, lift nothing; 6 minutes on, the tap reads /account (free, no search) and a plan with searches left lifts it (v1\'s sync does the same: 🔍3 again, the month\'s 41 from SerpAPI); a plan with nothing left keeps it', { a0, a1, a2, lk1, lk2, lk3, lk4 });
    }

    // a token the Worker refuses: 🔑⚠ in ⚙ and P-total, /account not read again within 5 minutes, and at once after a token save
    {
      const DT = seedAs(DWX);
      const t = await boot140o({ ls: orgLs(DT, { pialax_proxy_token: 'org-token-WRONG-0123456789' }) });
      act(t, 'open', { id: DT }); act(t, 'settings'); await until(() => !t.api.S.acctBusy); await tick();
      const st1 = sheet(t), n1 = acctN(t), bad1 = t.api.S.acctBad;
      t.api.closeSheet(); act(t, 'total', { id: DT }); await tick(5); const pt1 = ptotal(t, DT); t.api.closeSheet(); act(t, 'settings'); await tick(5);
      const n2 = acctN(t);
      t.api.onTyped({ id: 'org-token', value: TOKEN, dataset: {}, closest: () => null }); act(t, 'orgsave'); await until(() => !t.api.S.acctBusy); await tick();
      const n3 = acctN(t), st3 = sheet(t);
      check(bad1 === true && n1 === 1 && /class="fld bad"><label for="org-token"[^>]*>🔑<\/label><input id="org-token"[^>]*aria-label="Token, refused by the Worker"/.test(st1) && /data-lbl="Token refused" data-k="tokbad">🔑⚠</.test(st1) &&
        /data-k="tokbad">🔑⚠</.test(pt1) && n2 === n1 && n3 === n2 + 1 && t.api.S.acctBad === false && !/tokbad/.test(st3),
        'PIA-140 a token the Worker refuses on /account: 🔑⚠ in ⚙ (the token field marked) and in P-total; opening P-total and ⚙ again within 5 minutes reads /account no more; saving a token reads it at once, and the mark goes', { n1, n2, n3 });
    }

    // what stopped a run is read from the Worker's own code: SerpAPI's 401 passed through is not "your token"; no answer is 📶⚠
    {
      const DS = seedAs(DWX); wipeWorkerFares();
      const t = await boot140o({ ls: orgLs(DS), rec: ['#toast'] });
      await opened(t, DS);
      SM.mode = '401'; await tap(t, ptotal(t, DS), 'search'); await tick(20); SM.mode = 'ok';
      const t401 = toastOf(t), sp1 = t.api.spentRead(), bad1 = t.api.S.acctBad;
      await until(() => !t.api.S.acctBusy); await tick();
      srv.failNext = 'network'; await tap(t, ptotal(t, DS), 'search'); await tick(20);
      const tNet = toastOf(t), sp2 = t.api.spentRead();
      check(/<span class="tt">⚠<\/span>/.test(t401) && !/🔑/.test(t401) && bad1 === false && sp1 === 1 && /<span class="tt">📶⚠<\/span>/.test(tNet) && sp2 === sp1,
        'PIA-140 a run\'s stop is read from the Worker\'s own code: SerpAPI\'s 401 passed through on a MISS toasts ⚠ (not 🔑⚠: the organizer\'s token is fine) and counts against the visit (the Worker spent it); no answer at all toasts 📶⚠ and counts nothing', { t401, tNet, sp1, sp2 });
    }

    // a step that throws ends the run like any stop: ◷ never stays on the 🔍
    {
      const DX = seedAs(DWX); wipeWorkerFares();
      const boom = { on: false }, bad = throwEl();
      const bfetch = async (u, o) => { const r = await pfetch(u, o); if (/\/search\?/.test(String(u))) boom.on = true; return r; };
      const t = loadApp({ fetch: bfetch, ls: orgLs(DX), qs: (s) => (s === '#screen' && boom.on ? bad : null) });
      await t.api.refreshAll(true); await tick(); t.api.render();
      await opened(t, DX);
      const out = await tap(t, ptotal(t, DX), 'search'); boom.on = false; await tick(20);
      const pt = ptotal(t, DX);
      check(out && out.asked === 1 && out.stop === 'upstream' && !t.api.S.spendBusy && /data-act="search"[^>]*data-n="2"/.test(pt) && !/aria-busy="true"/.test(pt),
        'PIA-140 a step of a search run that throws (the redraw after its first fare) ends the run like any stop: ◷ never stays on the phone\'s 🔍, and the next 🔍 shows what is left (🔍2)', out);
    }

    // a ±1 day chip names its day: a quick double tap moves one day; the organizer's move of someone else's day has ↩
    {
      const DD = seedAs(DWX); wipeWorkerFares();
      const t = await boot140o({ ls: orgLs(DD), rec: ['#toast'] });
      act(t, 'open', { id: DD }); act(t, 'person', { id: DD, code: 'ashwin-p8' }); await until(() => !t.api.S.acctBusy); await tick();
      await endSearch(t, 0); await tick(20);
      const before = ctl(sheet(t), 'legshift', { day: '2026-11-05' });
      t.api.ACTS.legshift({ dataset: before }); t.api.ACTS.legshift({ dataset: before });   // two taps on "11/5 $…" before a redraw
      await settleWrites(t, DD);
      const ashD1 = t.api.modelOf(DD).travelers.find((x) => x.code === 'ashwin-p8').d1, ashRec = srv.read(DD).responses['ashwin-p8'].available_from;
      t.api.closeSheet(); act(t, 'person', { id: DD, code: 'momdad-k3' });
      await endSearch(t, 0); await tick(20);
      const md0 = sheet(t), after = ctl(md0, 'legshift', { day: '2026-11-07' });
      t.api.ACTS.legshift({ dataset: after }); const said = toastOf(t), movedTo = t.api.modelOf(DD).travelers.find((x) => x.code === 'momdad-k3').d1;
      act(t, 'undo'); await settleWrites(t, DD);
      const backTo = t.api.modelOf(DD).travelers.find((x) => x.code === 'momdad-k3').d1, mdRec = srv.read(DD).responses['momdad-k3'];
      t.api.closeSheet(); act(t, 'person', { id: DD, code: 'anjo-z5' }); const an = sheet(t); t.api.closeSheet();
      check(ashD1 === '2026-11-05' && ashRec === '2026-11-05' && /<button class="dch[^"]* tap" data-act="legshift"/.test(md0) && movedTo === '2026-11-07' && /📞 11\/7/.test(said) && /data-act="undo"/.test(said) &&
        backTo === '2026-11-06' && (mdRec.available_from || '') === '' && !/class="dch[^"]* tap"/.test(an),
        'PIA-140 a ±1 day chip moves to the day it names: a quick double tap on "11/5" moves Ashwin one day (11/5, not 11/4); the organizer moving Mom & Dad\'s day from a chip says 📞 11/7 with ↩, and ↩ puts it back (they follow the plan again); nothing moves Anjo, who has not answered', { ashD1, ashRec, movedTo, backTo, mdRec: mdRec.available_from });
    }

    // a closed trip's card offers no refresh; the board's price column holds a 4- and 5-digit "+" sum
    {
      const DZ = seedAs(DWX, (dd) => { dd.decision = Object.assign({}, dd.decision, { stage: 'dropped' }); });
      const fz = {}; TM.tripModel(srv.read(DZ), { today: '2026-10-17', now: NOW, me: 'ashwin-p8', hasEditKey: true, hasToken: true, multiAirport: true }).travelers.forEach((x) => x.keys.forEach((k) => { fz[k.key] = { p: 250, f: NOW - 30 * 36e5 }; }));
      const t = await boot140o({ ls: orgLs(DZ, { pialax_fares_v2: fz }) });
      const card = t.api.cardHTML({ id: DZ, x: t.api.listEntry(DZ), m: t.api.modelOf(DZ) });
      const DW = seedAs(DWX); const big = {}; const mw = TM.tripModel(srv.read(DW), { today: '2026-10-17', now: NOW, me: 'ashwin-p8', hasEditKey: true, hasToken: true, multiAirport: true });
      big[mw.travelers.find((x) => x.code === 'ashwin-p8').keys[0].key] = { p: 1387, f: NOW - 36e5 }; big[mw.travelers.find((x) => x.code === 'momdad-k3').keys[0].key] = { p: 10987, f: NOW - 36e5 };
      const u = await boot140o({ ls: orgLs(DW, { pialax_fares_v2: big }) });
      act(u, 'open', { id: DW }); const bv = screen(u);
      check(/data-k="total">\$750<\/span>/.test(card) && !/data-k="search"/.test(card) && /<button class="pricerow"[\s\S]*?<span class="tot part" data-k="total">\$12,374<\/span>[\s\S]*?<span class="stack"/.test(bv) && !/class="pr[ "]/.test(bv),
        'PIA-140 a dropped trip\'s card keeps its last total but offers no 🔍 (P-total offers no spend there); PIA-154: a 5-digit sum ($1,387 + $10,987) reads as one outlined total in the price row (no per-person column)', { card: (/<span class="tot[\s\S]*?<\/span><\/span>|<span class="tot[^>]*>[^<]*<\/span>/.exec(card) || [])[0] });
    }

    // ═══ PIA-141: the cheapest week on demand, against the real Worker (its token gate, fare cache, SpendMeter), SerpAPI stubbed ═══
    section('PIA-141 cheapest week on demand: P-dates 📉 → P-cheapest; Thanksgiving S1 pinned; the cost first, the PIA-140 spend path; Move in one write; ⚠ and 🎫 confirm; 🔒 and nobody-follows say why');
    {
      const V1S = fx('v1-watchlist-storage.json'), H = 36e5;
      const wsend = async (reqs) => { const st = []; for (const q of reqs || []) { const r = await srv.fetch(W + q.path, { method: q.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q.body) }); st.push(r.status); } return st; };
      // the legacy Thanksgiving doc, migrated through the real Worker (P-migrate: 📌 11/26 from v1's card, the plan 11/20–11/29, faces),
      // then 🔓 (P-migrate keeps its 🔒): the spec's S1 "before locking". f tweaks the legacy doc first
      const s1Doc = async (f, after) => {
        const id = seedAs(TGX, f), v1 = clone(V1S); v1.overrides.thanksgiving.sharedIdeaId = id;
        const d0 = srv.read(id), mo = TM.migrateOptions(d0, v1);
        const st = (await wsend(TM.migrateRequests(d0, KEY, { plan: mo.span, pin: mo.pin, labels: mo.labels }))).concat(await wsend(TM.organizerEdit(srv.read(id), KEY, { decision: { stage: 'proposed' } })));
        if (after) { const d = srv.read(id); after(d); srv.write(d); }
        return { id, ok: st.every((s) => s === 200) };
      };
      const mOf = (id) => TM.tripModel(srv.read(id), { today: '2026-10-17', now: NOW, me: 'LAX', hasEditKey: true, hasToken: true, multiAirport: true });
      // S1's fares, 3h old (the spec): Ashwin 🛬 $305 + 🛫 $200, Anjo $290 + $160 (the nearby sets: v1's flag is on, as /account says)
      const s1Fares = (id) => { const m = mOf(id), a = m.travelers.find((x) => x.code === 'LAX').keys, j = m.travelers.find((x) => x.code === 'LGA').keys, o = {};
        [[a[0], 305], [a[1], 200], [j[0], 290], [j[1], 160]].forEach(([k, p]) => { o[k.key] = { p, f: NOW - 3 * H }; }); return o; };
      // SerpAPI, stubbed by search: 11/22's legs cost $280 (into PIA) and $160 (home 12/01); any other week's legs $350 / $250
      const S1P = {}, s1Serp = [];
      const priceOf = (q) => S1P[q.get('departure_id') + '>' + q.get('arrival_id') + '@' + q.get('outbound_date')] || (q.get('arrival_id') === 'PIA' ? 350 : 250);
      const prevFetch = globalThis.fetch;
      globalThis.fetch = async (u) => {
        const s = String(u);
        if (/^https:\/\/serpapi\.com\/search\.json\?/.test(s)) {
          s1Serp.push(s);
          const q = new URL(s).searchParams, p = priceOf(q), j = clone(SERP);
          j.best_flights[0].price = p; j.other_flights.forEach((o, i) => { o.price = p + 20 * (i + 1); });
          return new Response(JSON.stringify(j), { status: 200 });
        }
        return prevFetch(u);
      };
      const s1Ls = (id, extra) => orgLs(id, Object.assign({ pialax_idea_me_v1: { [id]: 'LAX' }, pialax_fares_v2: s1Fares(id) }, extra || {}));
      const bars = (h) => [...String(h).matchAll(/<button class="cbar[^"]*"[^>]*data-v="([^"]+)"[^>]*>/g)].map((x) => x[1]);
      const barOf = (h, s) => (new RegExp('<button class="cbar[^"]*"[^>]*data-v="' + s + '"[\\s\\S]*?</button>').exec(h) || [''])[0];
      const openCheap = async (t, id) => { act(t, 'open', { id }); act(t, 'dates', { id }); const pd = sheet(t); await tap(t, pd, 'dcheap'); await until(() => !t.api.S.acctBusy); await tick(); return pd; };
      wipeWorkerFares();

      // AC1 / AC2 / AC3 / AC4 / AC5 the pinned Thanksgiving S1 sample, with real clicks' data through the real Worker
      const S = await s1Doc(); const TS = S.id;
      const m0 = mOf(TS), w22 = TM.cheapCandidates(m0, s1Fares(TS), NOW, '2026-10-17').find((c) => c.s === '2026-11-22');
      [[w22.need[0], 280], [w22.need[1], 160]].forEach(([k, p]) => { const q = new URLSearchParams(TM.searchQuery(k)); S1P[q.get('departure_id') + '>' + q.get('arrival_id') + '@' + q.get('outbound_date')] = p; });
      const t = await boot140o({ ls: s1Ls(TS), rec: ['#toast'] });
      const pd = await openCheap(t, TS), c1 = sheet(t), L1 = t.api.S.sheet.local, sp0 = searches(t).length;
      const all1 = TM.cheapCandidates(t.api.modelOf(TS), t.api.readFares(), NOW, '2026-10-17');
      check(S.ok && /<button class="tool wordy" data-act="dcheap" aria-label="Cheaper week"><span data-k="cheapweek" aria-hidden="true">📉<\/span> Cheaper<\/button>/.test(pd) && t.api.S.sheet.type === 'cheap' && t.api.S.sheet.back && t.api.S.sheet.back.type === 'dates' &&
        t.api.popupName(t.api.S.sheet) === 'P-cheapest' && t.api.sheetName(t.api.S.sheet) === 'Cheaper week' && paidOf(t).filter((f) => /\/account$/.test(f.url)).length === 1 && sp0 === 0,
        'PIA-141 P-dates on the organizer\'s token phone offers 📉 (Cheaper week); a tap opens P-cheapest over it (‹ back to P-dates), reads /account (🔍 26/30) and searches nothing');
      check(all1.length === 10 && L1.page === 0 && eq(bars(c1), ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23']) && L1.sel === '2026-11-20' &&
        /data-act="cpage" data-v="1" aria-label="Later weeks" data-k="page">▶/.test(c1) && /data-act="cpage" data-v="-1" aria-disabled="true" data-why="1"/.test(c1) && !/data-act="cwiden"/.test(c1),
        'PIA-141 AC5 Thanksgiving S1: 10 weeks on 2 pages (7 bars, then 3), paging on its own row (◀ ▶), no ⟦◀ ▶⟧ (the 📌 already bounds the weeks); the plan\'s 11/20 week is selected', bars(c1));
      const marked = all1.filter((c) => c.warn.length).map((c) => c.s), hollow = all1.filter((c) => !c.current);
      check(eq(marked, ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-25', '2026-11-26']) && ['2026-11-17', '2026-11-18', '2026-11-19'].every((s) => /<span class="wf" data-k="leaves">⚠🗽<\/span>/.test(barOf(c1, s))) &&
        hollow.every((c) => c.need.length === 2) && ['2026-11-17', '2026-11-21', '2026-11-23'].every((s) => /<span class="tn v" data-k="wcost">🔍≤2<\/span><span class="cw2"><span class="col hollow" data-k="weekhollow"><\/span>/.test(barOf(c1, s))) &&
        /class="cbar cur"[^>]*aria-pressed="true" aria-label="11\/20–11\/29, \$955, current dates" data-lbl="Current dates"><span class="tn v">\$955<\/span>/.test(c1) && !/data-k="cheapest"/.test(c1) &&
        /<span class="cchip own"[^>]*aria-label="Anjo, \$450, own days"[^>]*data-k="owndays">/.test(c1) && /aria-label="Ashwin, \$505"/.test(c1) && !/data-act="cmove"|data-act="search"/.test(c1),
        'PIA-141 AC2 / AC3 / AC4 5 weeks carry ⚠🗽 (Anjo\'s own 11/24–11/29 would fall outside), every other week is hollow with its cost on top (🔍≤2: Ashwin\'s two one-ways; Anjo\'s legs stay hers, cached), the current week is outlined and filled ($955: Ashwin $505, Anjo $450 underlined as her own days), no ★ with one week priced, and no button on the plan\'s own week');
      act(t, 'cbar', { v: '2026-11-22' });
      const c2 = sheet(t), btn = ctl(c2, 'search', { v: 'week' });
      check(btn && btn.day === '2026-11-22' && btn.n === '2' && /aria-label="Search 2 fares, 2 searches" data-lbl="Search 2 fares"><span aria-hidden="true" data-k="search">🔍<\/span><span class="tn">2<\/span><\/button>/.test(c2) && searches(t).length === sp0,
        'PIA-141 AC4 the cost is shown before the spend: selecting 11/22 draws its one 56px button 🔍2 ("Search 2 fares, 2 searches"), and nothing has gone yet', btn);
      await tap(t, c2, 'search', { v: 'week' }); await until(() => !t.api.S.spendBusy); await tick(20);
      const s2 = searches(t).slice(sp0), c3 = sheet(t), q3 = quotaOf(t);
      check(s2.length === 2 && eq(s2.map((f) => f.url), w22.need.map((k) => W + '/search?' + TM.searchQuery(k))) && s2.every((f) => f.headers['X-Pialax-Token'] === TOKEN && f.url.indexOf(TOKEN) < 0) &&
        s1Serp.length === 2 && t.api.spentRead() === 2 && q3 && q3.used >= 2,
        'PIA-141 AC4 one tap on 🔍2 sends exactly those 2 GET /search (the model\'s own queries for Ashwin\'s 11/22 and 12/01 one-ways, the token in its header only) through the PIA-140 spend path: 2 SerpAPI calls, the visit and v1\'s month counter move by 2', s2.map((f) => f.url));
      check(/aria-label="11\/22–12\/1, \$890, cheapest" data-lbl="Cheapest week"><span class="tn v">\$890<\/span><span class="cw2"><span class="col" data-k="weekfull"[^>]*><span class="st" data-k="cheapest">★<\/span>/.test(c3) &&
        /aria-label="11\/20–11\/29, \$955, current dates"/.test(c3) && (c3.match(/data-k="cheapest">★/g) || []).length === 2 && /<span class="cchip"[^>]*aria-label="Ashwin, \$440"/.test(c3) && /aria-label="Anjo, \$450, own days"/.test(c3) &&
        /<button class="btn pri wide stick" data-act="cmove" data-id="[^"]+" data-v="2026-11-22" aria-label="Move to 11\/22–12\/1">Move<\/button>/.test(c3),
        'PIA-141 AC3 / AC4 the pinned S1 result: 11/22 reads $890 ★ (Ashwin $440 + Anjo $450, fixed and cached), the 11/20 plan $955 without ★ (★ only once two weeks are priced); its button is now Move');
      // Move: drawn at once (every plan-follower's link follows in the same render), then ONE /idea/update; ‹ to P-dates on the new plan
      const p0 = posts(t).length, ashBefore = t.api.modelOf(TS).travelers.find((x) => x.code === 'LAX').link.href, anjoBefore = t.api.modelOf(TS).travelers.find((x) => x.code === 'LGA').link.href;
      const hold = deferred(); srv.hold = hold.p;
      const mv = tap(t, sheet(t), 'cmove', { v: '2026-11-22' });
      const drawn = t.api.modelOf(TS), ashNow = drawn.travelers.find((x) => x.code === 'LAX'), dec = TM.gfDecode(ashNow.link.href), busyBtn = sheet(t);
      srv.hold = null; hold.res(); await mv; await until(() => !(t.api.PEND[TS] > 0)); await tick();
      const ps = posts(t, 0).slice(p0), rec = srv.read(TS), after = t.api.modelOf(TS);
      check(eq(drawn.plan, { s: '2026-11-22', e: '2026-12-01' }) && dec.legs[0].date === '2026-11-22' && dec.legs[1].date === '2026-12-01' && ashNow.link.href !== ashBefore && drawn.travelers.find((x) => x.code === 'LGA').link.href === anjoBefore &&
        /data-act="cmove"[^>]*aria-busy="true"[^>]*>◷</.test(busyBtn) && ps.length === 1 && ps[0].path === '/idea/update' && rec.idea.dates.departure === '2026-11-22' && rec.idea.dates.return === '2026-12-01' && TM.parseNotes(rec.idea.notes).pin === '2026-11-26' &&
        t.api.S.sheet && t.api.S.sheet.type === 'dates' && t.api.S.sheet.local.s === '2026-11-22' && t.api.S.sheet.local.e === '2026-12-01' && /📉 11\/22–12\/1/.test(toastOf(t)) && /data-act="undo"/.test(toastOf(t)) && after.price.total === 890 && after.price.complete,
        'PIA-141 AC6 Move: the new plan is drawn at once (Ashwin\'s Google Flights link reads 11/22 → 12/01 in the same render; Anjo\'s, her own days, unchanged; Move ◷ while it is out), then written ONCE (one /idea/update, 📌 11/26 kept); ‹ back to P-dates on the new plan, a toast with ↩; the trip\'s total is the bar\'s $890', ps.map((x) => x.path));
      const priceNums = [890, 955, 440, 450, 280, 160, 305, 290, 200];
      const leak = posts(t, 0).filter((x) => { const s = JSON.stringify(x.body); return priceNums.some((n) => new RegExp('[^0-9]' + n + '[^0-9]').test(s)) || /fare|price|total/i.test(s.replace(/"notes":"[^"]*"/, '')); });
      check(leak.length === 0, 'PIA-141 no price leaves the phone: the Move (and the 🔓 before it) carry no fare, total or price field and none of the week\'s amounts', leak.map((x) => x.path));
      // ↩ puts the plan back as it was (one more organizer edit)
      const p1 = posts(t).length, undoFn = t.api.S.undo; if (typeof undoFn === 'function') await undoFn(); await until(() => !(t.api.PEND[TS] > 0)); await tick();
      check(typeof undoFn === 'function' && posts(t).slice(p1).length === 1 && srv.read(TS).idea.dates.departure === '2026-11-20' && srv.read(TS).idea.dates.return === '2026-11-29', 'PIA-141 ↩ in Move\'s toast puts the 11/20–11/29 plan back (one edit)');

      // AC2 a week that leaves someone's own days out needs a confirming tap; so does any Move once someone has booked
      {
        const S2 = await s1Doc(); wipeWorkerFares();
        const u = await boot140o({ ls: s1Ls(S2.id) });
        await openCheap(u, S2.id); act(u, 'cbar', { v: '2026-11-19' });
        await tap(u, sheet(u), 'search', { v: 'week' }); await until(() => !u.api.S.spendBusy); await tick(20);
        const pp = posts(u).length, before = sheet(u);
        await tap(u, before, 'cmove', { v: '2026-11-19' });
        const armedH = sheet(u), sent1 = posts(u).length - pp;
        await tap(u, armedH, 'cmove', { v: '2026-11-19' }); await until(() => !(u.api.PEND[S2.id] > 0)); await tick();
        const sent2 = posts(u).slice(pp), r2 = srv.read(S2.id);
        check(/aria-label="11\/19–11\/28, \$1,050, leaves Anjo days out"/.test(before) && /data-v="2026-11-19" aria-label="Move to 11\/19–11\/28">Move</.test(before) && sent1 === 0 &&
          /class="btn pri wide stick arm" data-act="cmove"[^>]*data-lbl="Confirm">⚠🗽 <span class="cw">Confirm<\/span>/.test(armedH) && sent2.length === 1 && r2.idea.dates.departure === '2026-11-19' && r2.responses.LGA.available_from === '2026-11-24',
          'PIA-141 AC2 a week that would leave Anjo\'s own days outside the plan (11/19–11/28, ⚠🗽) asks first: Move\'s first tap only arms "⚠🗽 Confirm" (nothing sent), the second moves the plan (one update); her own days stay hers');
        const S3 = await s1Doc(null, (d) => { d.responses.LGA.booked = true; d.responses.LGA.booked_at = '2026-10-16T00:00:00.000Z'; }); wipeWorkerFares();
        const b = await boot140o({ ls: s1Ls(S3.id) });
        await openCheap(b, S3.id); act(b, 'cbar', { v: '2026-11-22' });
        const bh = sheet(b);
        await tap(b, bh, 'search', { v: 'week' }); await until(() => !b.api.S.spendBusy); await tick(20);
        const bp = posts(b).length; await tap(b, sheet(b), 'cmove', { v: '2026-11-22' }); const ba = sheet(b), bs1 = posts(b).length - bp;
        await tap(b, ba, 'cmove', { v: '2026-11-22' }); await until(() => !(b.api.PEND[S3.id] > 0)); await tick();
        const bs2 = posts(b).slice(bp);
        check(/aria-label="Anjo, booked, \$450, stays on their days, own days"/.test(bh) && /<span data-k="booked">✈<\/span><span class="cbk">\$450<\/span>/.test(bh) && /aria-label="Search 2 fares, 2 searches"/.test(bh) && bs1 === 0 && /⚠✈×1 <span class="cw">Confirm<\/span>/.test(ba) && bs2.length === 1 && srv.read(S3.id).idea.dates.departure === '2026-11-22' &&
          !searches(b).some((f) => /LGA/.test(f.url)),
          'PIA-141 AC6 once anyone has booked, Move asks for one confirming tap (⚠🎫×1 Confirm), then writes once; Anjo\'s booked flight is shown (🎫) but never searched');
      }
      // AC6 the entry: greyed with why while 🔒 or when nobody follows the plan; a lock made on another phone meanwhile holds Move back
      {
        const SL = await s1Doc(null, (d) => { d.decision = Object.assign({}, d.decision, { stage: 'chosen', chosen: { airport: 'PIA', city: 'Peoria', departure: '2026-11-20', return: '2026-11-29' } }); });
        const u = await boot140o({ ls: s1Ls(SL.id) });
        act(u, 'open', { id: SL.id }); act(u, 'dates', { id: SL.id });
        const lk = sheet(u); await tap(u, lk, 'dcheap');
        const SN = await s1Doc(null, (d) => { d.responses.LAX.available_from = '2026-11-20'; d.responses.LAX.available_to = '2026-11-29'; });
        const v = await boot140o({ ls: s1Ls(SN.id) });
        act(v, 'open', { id: SN.id }); act(v, 'dates', { id: SN.id }); const nb = sheet(v); await tap(v, nb, 'dcheap');
        check(/<button class="tool dis wordy" data-act="dcheap" aria-disabled="true" data-why="1" aria-label="Cheaper week, Dates locked" data-lbl="Dates locked"><span data-k="cheapweek" aria-hidden="true">📉<\/span> Cheaper<\/button>/.test(lk) && /data-act="dlock" aria-label="Unlock">/.test(lk) && u.api.S.sheet.type === 'dates' &&
          /aria-label="Cheaper week, Nobody follows plan" data-lbl="Nobody follows plan"/.test(nb) && v.api.S.sheet.type === 'dates' && searches(u).length === 0 && searches(v).length === 0,
          'PIA-141 AC6 📉 Cheaper is greyed with why and opens nothing while the dates are 🔒 ("Dates locked"; 🔓 Unlock is the sheet\'s main button) or when nobody follows the plan ("Nobody follows plan": Ashwin set both ends)');
        const SH = await s1Doc(); wipeWorkerFares();
        const w = await boot140o({ ls: s1Ls(SH.id) });
        await openCheap(w, SH.id); act(w, 'cbar', { v: '2026-11-22' });
        await tap(w, sheet(w), 'search', { v: 'week' }); await until(() => !w.api.S.spendBusy); await tick(20);
        const dl = srv.read(SH.id); dl.decision = Object.assign({}, dl.decision, { stage: 'chosen', chosen: { airport: 'PIA', city: 'Peoria', departure: '2026-11-20', return: '2026-11-29' } }); srv.write(dl);   // 🔒 on another phone
        const wp = posts(w).length; await tap(w, sheet(w), 'cmove', { v: '2026-11-22' }); await until(() => !(w.api.PEND[SH.id] > 0)); await tick();
        const after2 = sheet(w);
        check(posts(w).length === wp && srv.read(SH.id).idea.dates.departure === '2026-11-20' && /data-k="lock">🔒<\/span>/.test(after2) && !/data-act="cmove"/.test(after2) && w.api.modelOf(SH.id).locked,
          'PIA-141 AC6 a 🔒 another phone made meanwhile holds Move back on the fresh record (nothing sent, the plan stays 11/20–11/29), and P-cheapest then says the dates are locked (🔒, no Move)');
        // no token, or a guest: no 📉 at all
        const g = await boot140o({ ls: orgLs(SH.id, { pialax_idea_me_v1: { [SH.id]: 'LAX' }, pialax_proxy_token: '' }) });
        act(g, 'open', { id: SH.id }); act(g, 'dates', { id: SH.id });
        check(!/data-act="dcheap"/.test(sheet(g)) && paidOf(g).length === 0, 'PIA-141 the organizer\'s phone without the token shows no 📉 (no $ anywhere) and makes no paid call');
      }
      // AC4 the PIA-140 caps and locks, unchanged: the visit's 8, the Worker's day cap; a tap then spends nothing
      {
        const SC = await s1Doc(); wipeWorkerFares();
        const u = await boot140o({ ls: s1Ls(SC.id, { pialax_daily_cap_v1: '2026-10-17' }) });
        await openCheap(u, SC.id); act(u, 'cbar', { v: '2026-11-22' });
        const dc = sheet(u); await tap(u, dc, 'search', { v: 'week' }); await tick(10);
        u.ls.removeItem('pialax_daily_cap_v1'); u.ss.setItem('pialax_spent_v2', '8'); u.api.render(true);
        const vc = sheet(u); await tap(u, vc, 'search', { v: 'week' }); await tick(10);
        u.ss.setItem('pialax_spent_v2', '7'); u.api.render(true); const one = sheet(u);
        check(/data-act="search"[^>]*data-v="week"[^>]*aria-label="Searches resume at 17:00" data-lbl="Daily limit" data-k="cap">⛔ 17:00<\/button>/.test(dc) && /data-act="newvisit"[^>]*>⛔ ↻<\/button>/.test(vc) &&
          /data-v="week" data-day="2026-11-22" data-n="1" aria-label="Search 1 of 2 fares, 1 search"/.test(one) && searches(u).length === 0,
          'PIA-141 AC4 the PIA-140 caps apply unchanged: past the Worker\'s day cap the week\'s button reads ⛔ 17:00, at the visit\'s 8 ⛔ ↻, with 1 left 🔍1/2; a tap on a lock sends nothing');
      }
      // ⟦◀ ▶⟧ on a trip with no 📌: ▶⟧ saves a window a week wider (one edit), the new weeks drawn at once with the first one selected
      {
        const SW = await s1Doc(null, (d) => { d.idea.notes = TM.buildNotes('', null, TM.parseNotes(d.idea.notes).caption); });   // (after P-migrate: its 📌 came from v1's card)
        const u = await boot140o({ ls: s1Ls(SW.id) });
        await openCheap(u, SW.id);
        const w0 = sheet(u), n0 = TM.cheapCandidates(u.api.modelOf(SW.id), u.api.readFares(), NOW, '2026-10-17').length, pw = posts(u).length;
        await tap(u, w0, 'cwiden', { v: '1' }); await until(() => !(u.api.PEND[SW.id] > 0)); await tick();
        const w1 = sheet(u), n1 = TM.cheapCandidates(u.api.modelOf(SW.id), u.api.readFares(), NOW, '2026-10-17').length, rw = srv.read(SW.id), Lw = u.api.S.sheet.local;
        check(/<span class="cgrp" role="group" aria-label="Pages">[\s\S]*?<\/span><span class="cgrp wd" role="group" aria-label="Widen window"><button class="tool" data-act="cwiden" data-v="-1"/.test(w0) &&
          /data-act="cwiden" data-v="1" aria-label="Widen window later" data-k="widen">▶⟧/.test(w0) && /data-act="cwiden" data-v="-1"/.test(w0) && n0 === 15 && n1 === 22 && posts(u).slice(pw).length === 1 &&
          rw.idea.dates.searchStart === '2026-11-13' && rw.idea.dates.searchEnd === '2026-12-13' && rw.idea.dates.departure === '2026-11-20' && Lw.sel === '2026-11-28' && Lw.page === 2 && bars(w1).length === 7 && bars(w1)[1] === '2026-11-28',
          'PIA-141 without a 📌 the plan ±7 holds 15 weeks and ⟦◀ ▶⟧ show; ▶⟧ saves the window a week later (one edit: ⟦11/13–12/13⟧, the plan untouched), 22 weeks, the first new one (11/28) selected on its page', { n0, n1, sel: Lw.sel, page: Lw.page, bars: bars(w1) });
        // paging: every page ≤7 bars; ▶ moves the selection with the page
        const L = u.api.S.sheet.local; L.page = 0; L.sel = '2026-11-13'; u.api.renderSheet(false);
        const pages = []; let guard = 0;
        do { pages.push(bars(sheet(u)).length); const nx = ctl(sheet(u), 'cpage', { v: '1' }); if (!nx || nx.why) break; act(u, 'cpage', nx); } while (++guard < 6);
        check(eq(pages, [7, 7, 7, 1]) && u.api.S.sheet.local.page === 3, 'PIA-141 AC5 22 weeks page 7, 7, 7, 1: no page ever holds more than 7 bars, and ▶ walks them', pages);
      }
      // an undated idea: Move turns it into dates (its 🌙 goes, its window stays)
      {
        const SU = seedAs(fx('idea-undated.json')); wipeWorkerFares();
        const u = await boot140o({ ls: orgLs(SU, { pialax_idea_me_v1: { [SU]: 'ashwin-c3' } }) });
        await openCheap(u, SU);
        const uc = sheet(u), first = bars(uc)[0];
        await tap(u, uc, 'search', { v: 'week' }); await until(() => !u.api.S.spendBusy); await tick(20);
        await tap(u, sheet(u), 'cmove', { v: first }); await tap(u, sheet(u), 'cmove', { v: first }); await until(() => !(u.api.PEND[SU] > 0)); await tick();
        const ru = srv.read(SU), mu = u.api.modelOf(SU);
        check(first === '2026-12-18' && /data-k="leaves">⚠🌴🗽<\/span>/.test(uc) && /data-n="3"/.test(uc) && ru.idea.dates.departure === '2026-12-18' && ru.idea.dates.return === '2026-12-22' && ru.idea.dates.searchStart === '2026-12-18' &&
          TM.parseNotes(ru.idea.notes).nights === null && !mu.undated && mu.nights === 4,
          'PIA-141 AC1 an undated idea offers its 🌙4 weeks inside its ⟦window⟧ (each ⚠🌴🗽: Ashwin\'s and Anjo\'s windows are longer than the stay; 🔍3 the first time: Mom & Dad\'s round trip plus the two fixed ones); Move (asked twice) makes 12/18–12/22 the plan, the 🌙 gone and the window kept');
        // fix pass: ‹ P-dates after that Move is on the trip's new dates in dates mode (🔒 one tap away), not the old ⟦window⟧ picker
        const ud = sheet(u), Lu = u.api.S.sheet && u.api.S.sheet.local, pu = posts(u).length;
        await tap(u, ud, 'dsave');
        check(u.api.S.sheet && u.api.S.sheet.type === 'dates' && Lu.mode === 'dates' && Lu.s === '2026-12-18' && Lu.e === '2026-12-22' && /data-act="dlock" aria-label="Lock dates"/.test(ud) && !/data-act="dmode"/.test(ud) &&
          !/data-act="dsave"/.test(ud) && posts(u).length === pu,
          'PIA-141 after Move dates an undated idea, ‹ P-dates reads its new 12/18–12/22 in dates mode (no ⟦window⟧ picker left behind); nothing to save, so its main button is 🔒 Lock dates, one tap away', { mode: Lu && Lu.mode, s: Lu && Lu.s, e: Lu && Lu.e });
      }
      // fix pass: P-dates under P-cheapest follows its writes. ▶⟧ on an undated idea (a quick second tap sends nothing more), then ‹:
      // the picker holds the saved ⟦12/18–1/11⟧, so its Save sends nothing and closing it says no 🗑
      {
        const SV = seedAs(fx('idea-undated.json')); wipeWorkerFares();
        const u = await boot140o({ ls: orgLs(SV, { pialax_idea_me_v1: { [SV]: 'ashwin-c3' } }), rec: ['#toast'] });
        await openCheap(u, SV);
        const pv = posts(u).length, hold = deferred(); srv.hold = hold.p;
        const wv = tap(u, sheet(u), 'cwiden', { v: '1' }); await tap(u, sheet(u), 'cwiden', { v: '1' });
        srv.hold = null; hold.res(); await wv; await until(() => !(u.api.PEND[SV] > 0)); await tick();
        const sentW = posts(u).slice(pv), rv = srv.read(SV), wToast = toastOf(u);
        u.api.ACTS['sh-back']();
        const pdv = sheet(u), Lv = u.api.S.sheet.local, pv2 = posts(u).length;
        await tap(u, pdv, 'dsave'); const savedV = posts(u).length - pv2;
        u.api.ACTS['sh-close']();
        check(sentW.length === 1 && rv.idea.dates.searchStart === '2026-12-18' && rv.idea.dates.searchEnd === '2027-01-11' && /⟦12\/18–1\/11⟧/.test(wToast) &&
          u.api.S.sheet === null && Lv.mode === 'window' && Lv.s === '2026-12-18' && Lv.e === '2027-01-11' && /data-act="dsave" aria-disabled="true" data-why="1" data-lbl="No change"/.test(pdv) && savedV === 0 && !/🗑/.test(toastOf(u)),
          'PIA-141 ▶⟧ on an undated idea saves ⟦12/18–1/11⟧ once (a second tap while it is out sends nothing; the toast shows the window), and ‹ P-dates holds that window: its Save has no change to send, closing it says no 🗑', { sent: sentW.length, mode: Lv.mode, s: Lv.s, e: Lv.e });
      }
      // ‹ while Move is out (and a 60s poll meanwhile): P-dates shows the new plan at once and still does once it lands; one write,
      // a double tap sends nothing more, the poll's older read never undoes it, Save has nothing to send, closing it says no 🗑
      {
        const SB = await s1Doc(); wipeWorkerFares();
        const u = await boot140o({ ls: s1Ls(SB.id), rec: ['#toast'] });
        await openCheap(u, SB.id); act(u, 'cbar', { v: '2026-11-22' });
        await tap(u, sheet(u), 'search', { v: 'week' }); await until(() => !u.api.S.spendBusy); await tick(20);
        const pb = posts(u).length, hold = deferred(); srv.hold = hold.p;
        const mv = tap(u, sheet(u), 'cmove', { v: '2026-11-22' }); await tap(u, sheet(u), 'cmove', { v: '2026-11-22' });
        u.api.ACTS['sh-back']();
        const during = sheet(u), Ld = u.api.S.sheet.local, dS = Ld.s, dE = Ld.e, onDates = u.api.S.sheet.type === 'dates';
        const pollP = u.api.poll(); const drawn = u.api.modelOf(SB.id).plan;
        srv.hold = null; hold.res(); await mv; await pollP; await until(() => !(u.api.PEND[SB.id] > 0)); await tick();
        const after = sheet(u), La = u.api.S.sheet.local, ps = posts(u).slice(pb), rec = srv.read(SB.id), mvToast = toastOf(u), planNow = u.api.modelOf(SB.id).plan;
        const p2 = posts(u).length; await tap(u, after, 'dsave'); const saveSent = posts(u).length - p2;
        u.api.ACTS['sh-close']();
        check(onDates && dS === '2026-11-22' && dE === '2026-12-01' && !/data-act="dsave"/.test(during) && eq(drawn, { s: '2026-11-22', e: '2026-12-01' }) &&
          u.api.S.sheet === null && La.s === '2026-11-22' && La.e === '2026-12-01' && ps.length === 1 && ps[0].path === '/idea/update' && rec.idea.dates.departure === '2026-11-22' && rec.idea.dates.return === '2026-12-01' &&
          eq(planNow, { s: '2026-11-22', e: '2026-12-01' }) && /📉 11\/22–12\/1/.test(mvToast) && !/data-act="dsave"/.test(after) && /data-act="dlock" aria-label="Lock dates"/.test(after) && saveSent === 0 && !/🗑/.test(toastOf(u)),
          'PIA-141 ‹ while Move is out: P-dates shows 11/22–12/1 at once and still does once it lands (one /idea/update: a double tap and a 60s poll meanwhile change nothing), nothing to save (its main button 🔒 Lock dates), and closing it says no 🗑', { dS, dE, La: [La.s, La.e], posts: ps.map((x) => x.path), planNow });
      }
      // a Move that failed (the network) on a ⚠ week: ⚠ ↻, P-dates under it back on the plan; ↻ asks again at once (⚠🗽 Confirm,
      // nothing sent), and its confirm sends exactly one update
      {
        const SF = await s1Doc(); wipeWorkerFares();
        const u = await boot140o({ ls: s1Ls(SF.id) });
        await openCheap(u, SF.id); act(u, 'cbar', { v: '2026-11-19' });
        await tap(u, sheet(u), 'search', { v: 'week' }); await until(() => !u.api.S.spendBusy); await tick(20);
        const pf = posts(u).length;
        await tap(u, sheet(u), 'cmove', { v: '2026-11-19' });
        srv.failNext = 'network'; await tap(u, sheet(u), 'cmove', { v: '2026-11-19' }); await until(() => !(u.api.PEND[SF.id] > 0)); await tick();
        const failedH = sheet(u), backL = u.api.S.sheet.back.local, bS = backL.s, bE = backL.e;
        await tap(u, failedH, 'cmove', { v: '2026-11-19' });
        const reask = sheet(u), sent0 = posts(u).length - pf;
        await tap(u, reask, 'cmove', { v: '2026-11-19' }); await until(() => !(u.api.PEND[SF.id] > 0)); await tick();
        const sentF = posts(u).slice(pf), rf = srv.read(SF.id);
        check(/data-act="cmove"[^>]*aria-label="Retry">⚠ ↻<\/button>/.test(failedH) && bS === '2026-11-20' && bE === '2026-11-29' &&
          /class="btn pri wide stick arm" data-act="cmove"[^>]*data-lbl="Confirm">⚠🗽 <span class="cw">Confirm<\/span>/.test(reask) && !/⚠ ↻/.test(reask) && sent0 === 0 &&
          sentF.length === 1 && sentF[0].path === '/idea/update' && rf.idea.dates.departure === '2026-11-19' && rf.idea.dates.return === '2026-11-28',
          'PIA-141 a Move that failed shows ⚠ ↻ (P-dates under it back on 11/20–11/29); a tap on ↻ asks again at once (⚠🗽 Confirm, nothing sent), and its confirm sends exactly one update', { bS, bE, sent0, sent: sentF.length });
      }
      // ▶⟧ that failed (the network): ⚠↻ on it, the record untouched and the weeks as they were; ↻ saves it once
      {
        const SG = await s1Doc(null, (d) => { d.idea.notes = TM.buildNotes('', null, TM.parseNotes(d.idea.notes).caption); });
        const u = await boot140o({ ls: s1Ls(SG.id) });
        await openCheap(u, SG.id);
        const pg = posts(u).length, before = srv.read(SG.id).idea.dates;
        srv.failNext = 'network'; await tap(u, sheet(u), 'cwiden', { v: '1' }); await until(() => !(u.api.PEND[SG.id] > 0)); await tick();
        const fw = sheet(u), nF = TM.cheapCandidates(u.api.modelOf(SG.id), u.api.readFares(), NOW, '2026-10-17').length, sentG0 = posts(u).length - pg, endF = srv.read(SG.id).idea.dates.searchEnd;
        await tap(u, fw, 'cwiden', { v: '1' }); await until(() => !(u.api.PEND[SG.id] > 0)); await tick();
        const sentG = posts(u).slice(pg), rg = srv.read(SG.id);
        check(/data-act="cwiden" data-v="1" aria-label="Retry">⚠↻<\/button>/.test(fw) && sentG0 === 0 && nF === 15 && endF === before.searchEnd &&
          before.searchEnd !== '2026-12-13' && sentG.length === 1 && rg.idea.dates.searchEnd === '2026-12-13',
          'PIA-141 ▶⟧ that failed shows ⚠↻ on it (nothing saved, the 15 weeks as they were); its ↻ saves ⟦…–12/13⟧ with exactly one update', { nF, sent: sentG.length });
      }
      // a booking another phone made between the tap and the write holds Move back on the fresh record and asks here (⚠🎫×1 Confirm);
      // its confirm moves the plan once, Anjo keeping the days she booked
      {
        const SK = await s1Doc(); wipeWorkerFares();
        const u = await boot140o({ ls: s1Ls(SK.id) });
        await openCheap(u, SK.id); act(u, 'cbar', { v: '2026-11-22' });
        await tap(u, sheet(u), 'search', { v: 'week' }); await until(() => !u.api.S.spendBusy); await tick(20);
        const bd = srv.read(SK.id); bd.responses.LGA.booked = true; bd.responses.LGA.booked_at = '2026-10-17T10:00:00.000Z'; srv.write(bd);   // Anjo books on her phone
        const pk = posts(u).length, bookedHere = u.api.modelOf(SK.id).anyBooked;
        await tap(u, sheet(u), 'cmove', { v: '2026-11-22' }); await until(() => !(u.api.PEND[SK.id] > 0)); await tick();
        const askH = sheet(u), sentA = posts(u).length - pk, recA = srv.read(SK.id);
        await tap(u, askH, 'cmove', { v: '2026-11-22' }); await until(() => !(u.api.PEND[SK.id] > 0)); await tick();
        const sentB = posts(u).slice(pk), recB = srv.read(SK.id);
        check(bookedHere === 0 && sentA === 0 && recA.idea.dates.departure === '2026-11-20' && /⚠✈×1 <span class="cw">Confirm<\/span>/.test(askH) && /aria-label="Anjo, booked, \$450, stays on their days, own days"/.test(askH) &&
          /aria-label="11\/22–12\/1, \$890, cheapest"/.test(askH) && sentB.length === 1 && sentB[0].path === '/idea/update' && recB.idea.dates.departure === '2026-11-22' && recB.idea.dates.return === '2026-12-01' &&
          recB.responses.LGA.booked === true && recB.responses.LGA.available_from === '2026-11-24' && recB.responses.LGA.available_to === '2026-11-29',
          'PIA-141 a booking made on another phone after the tap holds Move back on the fresh record (nothing sent) and asks here (⚠🎫×1 Confirm; her $450 now in every week, 11/22 still $890 ★); its confirm moves the plan in one update, Anjo keeping her booked days', { sentA, sent: sentB.length });
      }
      globalThis.fetch = prevFetch;
    }
    globalThis.fetch = offline;
    CLOCK = NOW;
  }

  // ═══ PIA-142: Trips › Family ═══
  section('PIA-142 Trips › Family: the people × trips board, merged by name and read from the very models the cards and trip views draw; a cell opens that person with the answer row');
  // the board's column heads (trip ids, in order) and its cells: {trip|code: {st: the shape's key, marks, own: the arrival day}}
  const heads = (h) => (h.match(/<button class="hd[^"]*" data-act="open" data-id="[^"]+"/g) || []).map((s) => /data-id="([^"]+)"/.exec(s)[1]);
  const cellsOf = (h) => {
    const out = {}, re = /<button class="cell[^"]*" data-act="fcell" data-id="([^"]+)" data-code="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g; let mm;
    while ((mm = re.exec(h))) out[mm[1] + '|' + mm[2]] = { st: (/class="shape [^"]*" data-k="([a-z]+)"/.exec(mm[3]) || [])[1], marks: (mm[3].match(/<span data-k="[a-z]+">/g) || []).map((s) => s.slice(14, -2)).sort().join(), own: (/data-k="ownarr">([^<]*)</.exec(mm[3]) || [])[1] || '' };
    return out;
  };
  {
    const CYX = fx('idea-undated.json'), LXX = fx('idea-lax-local.json');
    const RIN = (code, origin) => Object.assign(RESP('in'), { member: code, origin });
    const DW = seedAs(DWX), TH = seedAs(THX), M8 = seedAs(M8X), CY = seedAs(CYX), LX = seedAs(LXX);
    // the shelf: Tahoe last September, and a Done New York Anjo hosted (LGA); a dropped one is never a column
    const PS = seedAs(THX, (d) => { d.idea.dates.departure = '2026-09-11'; d.idea.dates.return = '2026-09-14'; });
    const NY = seedAs(DWX, (d) => { d.idea.title = '🌆 New York'; d.idea.destination = { city: 'New York', airport: 'LGA' }; d.idea.dates.departure = '2026-06-24'; d.idea.dates.return = '2026-07-04'; d.idea.notes = ''; d.responses['anjo-z5'] = RIN('anjo-z5', 'LGA'); d.decision.stage = 'booked'; });
    const DR = seedAs(THX, (d) => { d.decision.stage = 'dropped'; }), DR2 = seedAs(LXX, (d) => { d.decision.stage = 'dropped'; });
    const ME = { [DW]: 'ashwin-p8', [TH]: 'ashwin-l2', [CY]: 'ashwin-c3', [LX]: 'ashwin-x3', [PS]: 'ashwin-l2', [NY]: 'ashwin-p8' };
    const fares = {};
    TM.tripModel(srv.read(DW), { today: '2026-10-17', now: NOW, me: 'ashwin-p8', hasEditKey: true, hasToken: true }).travelers.forEach((x) => x.keys.forEach((k) => { fares[k.key] = { p: 200, f: NOW - 36e5 }; }));
    const rs = recShare();
    // the organizer's token phone reads /account when a priced person's sheet opens (PIA-140); the real Worker asks SerpAPI's
    // account page for it, answered here offline (nothing on this board ever searches: checked below)
    const offline142 = globalThis.fetch;
    globalThis.fetch = async (u) => (/^https:\/\/serpapi\.com\/account\.json\?/.test(String(u)) ? new Response(JSON.stringify({ this_month_usage: 41, searches_per_month: 1000, total_searches_left: 959 }), { status: 200 }) : offline142(u));
    const t = await boot136({ ls: lsOf([DW, TH, M8, CY, LX, PS, NY, DR], { pialax_idea_me_v1: ME, pialax_idea_keys_v1: keyOf([DW, LX]), pialax_proxy_token: TOKEN, pialax_fares_v2: fares }), navigator: rs.nav });
    act(t, 'seg', { v: 'family' });
    const fam = (u) => (u || t).api.renderFamily();
    // the same person's face on that trip's own view (its people board): its answer shape and marks
    const facesOf = (u, id) => {
      // (the board's own faces: PIA-156's key under it draws the same people again, small and without marks)
      const h0 = u.api.renderTrip(id).html, h = h0.indexOf('<div class="wk"') >= 0 ? h0.slice(0, h0.indexOf('<div class="wk"')) : h0;
      const out = {}, re = /<button class="facebtn" data-act="person" data-id="([^"]+)" data-code="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g; re.lastIndex = h.indexOf('id="board-'); let mm;
      while ((mm = re.exec(h))) out[mm[1] + '|' + mm[2]] = { st: (/class="av s44[^"]*"[^>]*data-k="([a-z]+)"/.exec(mm[3]) || [])[1], marks: (mm[3].match(/<span data-k="[a-z]+">/g) || []).map((s) => s.slice(14, -2)).sort().join() };
      return out;
    };
    const page = (u, p) => { (u || t).api.S.famPage = p; return fam(u); };
    const all = (u) => { const pages = Math.ceil(u.api.famBoard().cols.length / u.api.FAM_PER), hs = []; for (let p = 0; p < pages; p++) hs.push(page(u, p).html); page(u, 0); return hs; };
    // the board on the organizer's token phone, both pages
    const f0 = fam(), H = all(t), C = Object.assign({}, ...H.map(cellsOf)), cards = (t.api.renderIdeas().html.match(/data-trip="([^"]+)"/g) || []).map((s) => s.slice(11, -1));
    const actIds = [DW, TH, M8, CY, LX];
    check(f0.id === 'trips-family' && eq(heads(H[0]), cards.slice(0, 4)) && eq(heads(H[1]), cards.slice(4, 5)) && eq(cards.slice(0, 5).sort(), actIds.slice().sort()) && heads(H.join('')).indexOf(PS) < 0 && heads(H.join('')).indexOf(DR) < 0,
      'PIA-142 AC6 the board\'s columns are the cards\' trips in the cards\' order, 4 a page (5 trips: 4 + 1); the past and the dropped trips are not columns', { heads: H.map(heads), cards });
    // cross-view consistency: every person on every trip shows the same answer shape and marks in their cell as on that trip's own view
    // (PIA-154: a cell carries the face's one top badge, ⚠ else 🎫 else 🏠; 📝 rides only on the board's face, 📞 only in the sheet)
    const topOnly = (s) => s.split(',').filter((k) => k && k !== 'note' && k !== 'called').join();
    const diff = [];
    actIds.forEach((id) => {
      const F = facesOf(t, id), m = t.api.modelOf(id);
      m.members.forEach((x) => {
        const k = id + '|' + x.code, c = C[k], f = F[k];
        if (!c || !f || c.st !== f.st || c.marks !== topOnly(f.marks) || c.marks.split(',').filter(Boolean).length > 1 || c.own !== (x.status !== 'out' && x.own1 ? TM.md(x.own1) : '')) diff.push({ k, c, f });
      });
    });
    const foot = (h) => (h.match(/data-k="heads">(\d+\/\d+)</g) || []).map((s) => s.slice(15, -1));
    const cardHeads = (id) => (/data-k="heads">(\d+\/\d+)</.exec(cardOf(t.api.renderIdeas().html, id)) || [])[1];
    const ringOf = (id) => (/font-variant-numeric:tabular-nums">(\d+\/\d+)<\/text>/.exec(t.api.renderTrip(id).html) || [])[1];
    const footer = [].concat(...H.map(foot)), order = [].concat(...H.map(heads));
    // …and the same shapes as the faces on each trip's card (its first four)
    const cardSt = (id) => (cardOf(t.api.renderIdeas().html, id).match(/class="av s28[^"]*"[^>]*data-k="([a-z]+)"/g) || []).map((s) => /data-k="([a-z]+)"/.exec(s)[1]);
    actIds.forEach((id) => { const want = t.api.modelOf(id).members.slice(0, 4).map((x) => (C[id + '|' + x.code] || {}).st); if (!eq(cardSt(id), want)) diff.push({ card: id, faces: cardSt(id), cells: want }); });
    check(diff.length === 0 && Object.keys(C).length === actIds.reduce((s, id) => s + t.api.modelOf(id).members.length, 0),
      'PIA-142 cross-view: every one of the ' + Object.keys(C).length + ' cells (every member of every trip) shows the very answer shape its face shows on that trip\'s own view and (PIA-154) its one top badge (⚠ else 🎫 else 🏠), and their own arrival day; the faces on each card wear the same shapes', diff);
    const leadOf = (id) => (/<span class="hin tn"[^>]*data-k="heads">(\d+\/\d+)<\/span>/.exec(t.api.renderTrip(id).html) || [])[1];
    check(order.every((id, i) => footer[i] === cardHeads(id) && footer[i] === leadOf(id) && footer[i] === t.api.modelOf(id).headsIn + '/' + t.api.modelOf(id).heads) && footer[order.indexOf(DW)] === '3/4' && !ringOf(DW),
      'PIA-142 AC3 each column\'s foot is that trip\'s heads by headcount, the same n/N as its card and (PIA-154) its people board\'s lead (Diwali 3/4: Mom & Dad count 2, Anjo not answered)', { order, footer });
    const rowh = (h) => h.split('<div class="rowh').slice(1).map((s) => s.slice(0, s.indexOf('</div>')));
    const r0 = rowh(H[0]), md = r0.find((s) => /🌽/.test(s));
    check(/^ self"/.test(r0[0]) && /data-nm="900">Ashwin<\/span>/.test(r0[0]) && !/data-k="you"/.test(r0[0]) && /🌴/.test(r0[0]) && md && /data-k="count">×2/.test(md) && !/data-k="hosted"/.test(md) && /data-k="hosted">🏠1</.test(r0[0]) && /data-k="hosted">🏠1</.test(r0.find((s) => /🗽/.test(s))),
      'PIA-142 AC1 / AC2 me first (PIA-154: my name on my tinted row, no 👋), Mom & Dad ×2; 🏠n on a row is the trips that person hosts, past ones too (Ashwin the LA beach weekend, Anjo the New York the shelf holds), Mom & Dad none', r0.map((s) => s.slice(0, 80)));
    check(/<span class="cell none[^"]*" role="img" aria-label="Not on [^"]*" data-lbl="Not invited"><\/span>/.test(H[0]) && !/data-k="notinv"/.test(H.join('')) && !/\$/.test(H.join('')) && /\$/.test(t.api.renderIdeas().html),
      'PIA-142 someone not on a trip is an empty cell (PIA-154: no grey dot; a long press still says "Not invited"); the board has no price anywhere, on the token phone whose cards show them');
    const r1 = rowh(H[1]), pads = (H[1].match(/<span class="pad"><\/span>/g) || []).length;
    check(r1.length === 3 && /🌴/.test(r1[0]) && /🌽/.test(r1[1]) && /🗽/.test(r1[2]) && pads === 3 * (1 + 3 + 1),
      'PIA-142 AC6 page 2 (Cary alone) keeps the 4 columns\' width and shows me and the people on its trip only (Ashwin, Mom & Dad, Anjo), not rows of dots', { rows: r1.length, pads });
    page(t, 0);
    t.api.ACTS.fampage({ dataset: { v: '-1' }, getAttribute: (k) => (k === 'aria-disabled' ? 'true' : null) });
    const p0 = t.api.S.famPage;
    act(t, 'fampage', { v: '1' }); const p1 = t.api.S.famPage; act(t, 'fampage', { v: '1' }); fam(); const p2 = t.api.S.famPage;
    check(/data-act="fampage" data-v="-1" aria-disabled="true" data-why="1" aria-label="Earlier trips, First page"/.test(f0.html) && /data-act="fampage" data-v="1" aria-label="Later trips"/.test(f0.html) && p0 === 0 && p1 === 1 && p2 === 1 &&
      /aria-label="Page 1 of 2"/.test(f0.html), 'PIA-142 AC6 ◀ ▶ page the trips (◀ says "First page" on a tap, nothing moves); ▶ past the last page stays on it', { p0, p1, p2 });
    // 🗄: the past trips as columns (hosting history); the board jumps to the first of them
    page(t, 0);
    act(t, 'fampast');
    const pastOn = { ui: t.api.uiRead().famPast, pg: t.api.S.famPage, h: fam().html };
    const nyCell = cellsOf(pastOn.h)[NY + '|anjo-z5'];
    check(/data-act="fampast" aria-pressed="false"/.test(f0.html) && pastOn.ui === 1 && pastOn.pg === 1 && eq(heads(pastOn.h), [CY, PS, NY]) && pastOn.h.indexOf('class="hd past" data-act="open" data-id="' + PS + '"') >= 0 &&
      nyCell && nyCell.st === 'in' && /host/.test(nyCell.marks) && /data-act="fampast" aria-pressed="true"/.test(pastOn.h),
      'PIA-142 AC5 🗄 adds the past trips as columns (kept on this phone), and the board shows the page with the first of them: Cary, last September\'s Tahoe and New York, where Anjo\'s cell is ✓ with 🏠', { pg: pastOn.pg, heads: heads(pastOn.h) });
    act(t, 'fampast');
    check(t.api.uiRead().famPast === undefined && heads(page(t, 1).html).length === 1, '…and 🗄 again takes them away');
    // a cell opens that person on that trip: the organizer's own trip, Anjo not answered: the very sheet her face opens, with his
    // answer row (📞) and 📣
    page(t, 0);
    act(t, 'fcell', { id: DW, code: 'anjo-z5' });
    const sFam = sheet(t), outside = t.api.S.sheet && t.api.S.sheet.p.outside;
    t.api.closeSheet(); act(t, 'open', { id: DW }); act(t, 'person', { id: DW, code: 'anjo-z5' });
    const sTrip = sheet(t); t.api.closeSheet(); act(t, 'back');
    check(outside && sFam === sTrip && /data-act="answer" data-v="in"[^>]*data-proxy="1"/.test(sFam) && /data-act="nudge"/.test(sFam) && t.api.S.seg === 'family',
      'PIA-142 AC4 a cell opens that person on that trip: the same sheet her face on the trip view opens, with the organizer\'s answer row (📞) and 📣 Share');
    act(t, 'fcell', { id: DW, code: 'anjo-z5' }); tap(t, sheet(t), 'nudge'); await tick();
    const q0 = posts(t).length;
    await tap(t, sheet(t), 'answer', { v: 'in', proxy: '1' }); await until(() => !(t.api.PEND[DW] > 0)); await tick();
    const sent = posts(t).slice(q0), after = cellsOf(fam().html)[DW + '|anjo-z5'], tv = facesOf(t, DW)[DW + '|anjo-z5'], sv = sheet(t);
    t.api.closeSheet();
    check(rs.shared.length === 1 && eq(rs.shared[0], { url: W + '/i/' + DW + '#m=anjo-z5' }) && sent.length === 1 && sent[0].path === '/idea/respond' && sent[0].body.member === 'anjo-z5' && sent[0].body.status === 'in' && sent[0].body.note === '📞' &&
      srv.read(DW).responses['anjo-z5'].note === '📞' && after.st === 'in' && after.marks === '' && tv.st === 'in' && tv.marks === '' && /data-k="called"/.test(sv) && foot(fam().html)[0] === '4/4',
      'PIA-142 AC4 from her cell the organizer nudges her (her own #m= link) and answers In for her: one complete answer marked 📞; her cell and her face on the trip view show ✓ (PIA-154: 📞 is in her sheet), heads 4/4', { shared: rs.shared, sent });
    // my own cell: my sheet with my own answer row (outside a trip view; the trip view's own sheet has none: its answer row is the page's)
    act(t, 'fcell', { id: TH, code: 'ashwin-l2' });
    const mine = sheet(t), q1 = posts(t).length;
    t.api.closeSheet(); act(t, 'open', { id: TH }); act(t, 'person', { id: TH, code: 'ashwin-l2' }); const mineTrip = sheet(t); t.api.closeSheet(); act(t, 'back');
    act(t, 'fcell', { id: TH, code: 'ashwin-l2' });
    await tap(t, sheet(t), 'answer', { v: 'in' }); await until(() => !(t.api.PEND[TH] > 0)); await tick(); t.api.closeSheet();
    const mySent = posts(t).slice(q1);
    check(/data-act="answer" data-v="maybe"[^>]*aria-pressed="true"/.test(mine) && !/data-proxy/.test(mine) && !/data-act="answer"/.test(mineTrip) && mySent.length === 1 && mySent[0].body.member === 'ashwin-l2' && mySent[0].body.status === 'in' &&
      mySent[0].body.note === 'Depends on Thanksgiving dates' && cellsOf(fam().html)[TH + '|ashwin-l2'].st === 'in',
      'PIA-142 AC4 my own cell opens my sheet with my answer row (my Maybe pressed); In there is my own answer (no 📞, my note kept), and my cell turns ✓', mySent.map((q) => q.body));
    act(t, 'famrow', { v: '0' });
    const hl = fam().html, hlKey = t.api.S.famRow; act(t, 'famrow', { v: '0' });
    check(hlKey === 'ashwin' && /<div class="rowh hl self"/.test(hl) && (hl.match(/class="cell( none)? hl( self)?"/g) || []).length === 4 && t.api.S.famRow === '' && !/class="rowh hl/.test(fam().html),
      'PIA-142 a face lights its row up across the trips; a second tap puts it out');
    // PIA-154: my own row is tinted in my colour (its head and every cell: .self with my --pc), never the trip page's .mine line class
    {
      const fh = fam().html, myHead = /<div class="rowh self" style="--pc:var\(--p(\d+)\)">/.exec(fh);
      const myCells = (fh.match(/class="cell( none)? self"[^>]*style="--pc:var\(--p\d+\)"/g) || []).length;
      check(!!myHead && myCells === 4 && !/class="(rowh|cell)[^"]* mine"/.test(fh),
        'PIA-154 B3 Trips › Family: my row (its head and its 4 cells) carries .self with my colour, the tint my row has on the trip page; no Family element takes the trip page\'s .mine class', { myHead: !!myHead, myCells });
    }
    const acct142 = t.fetches.filter((f) => f.url.indexOf(W + '/account') === 0).length;
    check(t.fetches.filter((f) => f.url.indexOf(W + '/search') === 0).length === 0 && acct142 <= 1,
      'PIA-142 nothing on the board, its pages, 🗄 or the sheets its cells open spent a search; /account was read at most once (a priced person\'s sheet, throttled) across every cell opened', { acct: acct142 });
    globalThis.fetch = offline142;
  }
  {
    // a guest (Anjo's phone, even holding the token): no price; someone else's cell is their face, days and note with 📣 for
    // someone who has not answered (the group link, never their own), no answer row
    const DW = seedAs(DWX), TH = seedAs(THX), CY = seedAs(fx('idea-undated.json')), rs = recShare();
    const g = await boot136({ ls: lsOf([DW, TH, CY], { pialax_idea_me_v1: { [DW]: 'anjo-z5', [CY]: 'anjo-c4' }, pialax_proxy_token: TOKEN }), navigator: rs.nav });
    act(g, 'seg', { v: 'family' });
    const h = g.api.renderFamily().html;
    act(g, 'fcell', { id: TH, code: 'leo-w6' });
    const s = sheet(g), acts = (s.match(/data-act="[a-z-]+"/g) || []).map((x) => x.slice(10, -1));
    tap(g, s, 'nudge'); await tick(); g.api.closeSheet();
    act(g, 'fcell', { id: DW, code: 'momdad-k3' }); const s2 = sheet(g); g.api.closeSheet();
    const paid = g.fetches.filter((f) => /\/(search|account)(\?|$)/.test(f.url.replace(W, '')));
    check(!/\$/.test(h) && eq(acts, ['pjoin', 'sh-close', 'nudge']) && !/data-act="pickface"/.test(s) && rs.shared.length === 1 && eq(rs.shared[0], { url: W + '/i/' + TH }) && !/data-act="(answer|nudge|pjoin|pickface)"/.test(s2) && posts(g).length === 0 && paid.length === 0,
      'PIA-142 AC4 on a guest\'s phone a cell of someone who has not answered offers only 📣 (the group link: a guest never hands out someone else\'s personal link), someone who answered none; no answer row, no price, and not one /search or /account call though this phone holds a token; on Tahoe, where this phone (Anjo elsewhere) is nobody and no name is hers, 🙋＋ asks to join, never 🙋 It\'s me',
      { acts, shared: rs.shared, paid: paid.map((f) => f.url) });
    // fix pass: 🙋＋ opens P-face with its join row open, over that sheet (‹ back to it); nothing is written
    act(g, 'fcell', { id: TH, code: 'leo-w6' }); tap(g, sheet(g), 'pjoin');
    const fs0 = g.api.S.sheet, fh = sheet(g);
    check(fs0 && fs0.type === 'face' && fs0.local.join === true && fs0.back && fs0.back.type === 'person' && fs0.p.then === 'person' && /id="join-name"/.test(fh) && posts(g).length === 0,
      'PIA-142 🙋＋ on a cell\'s sheet opens P-face with the join row open (‹ goes back to the sheet; a face picked there opens my own sheet in its place)');
    g.api.closeSheet();
  }
  {
    // fix pass: a first-run phone (a list link, no profile, no face, no token: Mom): her own cell opens her face with 🙋 It's me;
    // one tap makes the sheet her own P-person with her answer row (the same history entry), and In there is her own answer
    const DW = seedAs(DWX), TH = seedAs(THX), rs = recShare();
    const u = await boot136({ ls: lsOf([DW, TH]), navigator: rs.nav });
    act(u, 'seg', { v: 'family' });
    act(u, 'fcell', { id: DW, code: 'momdad-k3' });
    const s0 = sheet(u), sh0 = u.api.S.sheet, push0 = u.hist.pushes, back0 = u.hist.backs;
    const a0 = (s0.match(/data-act="[a-z-]+"/g) || []).map((x) => x.slice(10, -1));
    tap(u, s0, 'pickface', { code: 'momdad-k3' });
    const sh1 = u.api.S.sheet, s1 = sheet(u);
    const q0 = posts(u).length;
    await tap(u, s1, 'answer', { v: 'in' }); await until(() => !(u.api.PEND[DW] > 0)); await tick();
    const sent = posts(u).slice(q0), cell = cellsOf(u.api.renderFamily().html)[DW + '|momdad-k3'];
    const paid = u.fetches.filter((f) => /\/(search|account)(\?|$)/.test(f.url.replace(W, '')));
    check(sh0.type === 'person' && sh0.p.outside && eq(a0, ['pjoin', 'sh-close', 'pickface']) && /<button class="btn pri wide" data-act="pickface"[^>]*aria-label="This is me: Mom &amp; Dad"><span data-k="me">🙋<\/span> It's me<\/button>/.test(s0) && !/data-act="answer"/.test(s0) &&
      sh1 && sh1.type === 'person' && sh1.p.code === 'momdad-k3' && sh1.p.outside && /data-act="answer"/.test(s1) && !/data-proxy/.test(s1) && !/data-act="pickface"/.test(s1) && u.api.meFor(DW) === 'momdad-k3' && u.hist.pushes === push0 && u.hist.backs === back0 &&
      sent.length === 1 && sent[0].path === '/idea/respond' && sent[0].body.member === 'momdad-k3' && sent[0].body.status === 'in' && sent[0].body.note === '' && cell && cell.st === 'in' && cell.marks === '' && paid.length === 0 && rs.shared.length === 0,
      'PIA-142 AC4 a first-run phone\'s own cell (no name, no face): her face with 🙋 It\'s me (and 🙋＋, no answer row); one tap makes it her own sheet with her answer row (same history entry); In is her own answer (the organizer\'s 📞 goes) and her cell turns ✓; no /search or /account',
      { a0, sent: sent.map((q) => q.body), cell });
    u.api.closeSheet();
    // the same 🙋 on a trip view's face sheet: the sheet closes onto the trip, whose own answer row now pulses for me
    const v = await boot136({ ls: lsOf([TH, DW]), rec: ['#screen'] });
    act(v, 'open', { id: TH }); act(v, 'person', { id: TH, code: 'leo-w6' });
    const sv = sheet(v), out0 = v.api.S.sheet && v.api.S.sheet.p.outside;
    tap(v, sv, 'pickface', { code: 'leo-w6' });
    const drawn = v.rec['#screen'].innerHTML;   // (the trip as the close drew it: the pulse is drawn once)
    check(out0 === false && /data-act="pickface"/.test(sv) && !v.api.S.sheet && v.api.meFor(TH) === 'leo-w6' && v.api.S.trip === TH && /<div class="answers nudge"/.test(drawn) && posts(v).length === 0,
      'PIA-142 🙋 It\'s me on a face\'s sheet in a trip view: the sheet closes onto the trip, this phone is Leo there now, and the trip\'s own answer row pulses for him (nothing written)');
  }
  {
    // fix pass: the organizer's cell on the unmigrated v1 Thanksgiving, and on a past trip nobody closed: the answer row stays,
    // greyed, saying why on a tap ("Update trip first", "Trip over"); nothing is sent, and a trip that is over offers no 📣
    const TG = seedAs(TGX), DW = seedAs(DWX), PS = seedAs(THX, (d) => { d.idea.dates.departure = '2026-09-11'; d.idea.dates.return = '2026-09-14'; });
    const t = await boot136({ ls: lsOf([DW, TG, PS], { pialax_idea_me_v1: { [DW]: 'ashwin-p8', [TG]: 'LAX', [PS]: 'ashwin-l2' }, pialax_idea_keys_v1: keyOf([DW, TG, PS]) }) });
    act(t, 'seg', { v: 'family' });
    act(t, 'fcell', { id: TG, code: 'LGA' });
    const sl = sheet(t), q0 = posts(t).length, why = [];
    const shownLbl = (h) => { const o = ctl(h, 'answer', { v: 'in' }); return o ? o.lbl : null; };
    // the tap as the click handler makes it (the button says aria-disabled): it explains itself and returns nothing; and the same
    // tap's action without that attribute (a script, a stale render) still sends nothing
    const dis = (o) => ({ dataset: o, getAttribute: (k) => (k === 'aria-disabled' ? 'true' : null) });
    why.push(t.api.ACTS.answer(dis(ctl(sl, 'answer', { v: 'in' }))));
    why.push(await tap(t, sl, 'answer', { v: 'in', proxy: '1' })); await tick();
    t.api.closeSheet();
    act(t, 'fampast');
    act(t, 'fcell', { id: PS, code: 'leo-w6' });
    const sp = sheet(t);
    why.push(t.api.ACTS.answer(dis(ctl(sp, 'answer', { v: 'in' }))));
    why.push(await tap(t, sp, 'answer', { v: 'in', proxy: '1' })); await tick();
    t.api.closeSheet();
    act(t, 'open', { id: PS }); const tv = t.api.renderTrip(PS).html; act(t, 'back');
    check(/data-act="answer" data-v="in"[^>]*aria-disabled="true" data-why="1" aria-label="In, Update trip first" data-lbl="⤒ Update trip first"/.test(sl) && shownLbl(sl) === '⤒ Update trip first' &&
      /aria-label="In, Trip over" data-lbl="Trip over"/.test(sp) && !/data-act="nudge"/.test(sp) && /class="ans in ro"/.test(sp) && /data-act="achip"[^>]*aria-disabled="true" data-why="1" aria-label="\w+, Trip over" data-lbl="Trip over"/.test(tv) && !/data-act="answer"/.test(tv) && posts(t).length === q0 && why.every((r) => r === null),
      'PIA-142 the organizer\'s cell on a v1 doc and on a past trip nobody closed: the answer row stays, greyed, and says why on a tap ("Update trip first" until PIA-146\'s update; "Trip over"; PIA-154: the trip view\'s answer chip greyed too); a trip that is over offers no share; nothing is sent');
    // the board's heads name their trips on a long press: the title (free) and the days; 🏠n's key says past or planned
    const fh = t.api.renderFamily().html;
    check(new RegExp('class="hd past" data-act="open" data-id="' + PS + '" aria-label="Open past trip" data-lbl="9/11–9/14" data-ttl="🎿 Tahoe ski weekend"').test(fh) && t.api.LEGEND.hosted[1] === 'Hosted or hosting',
      'PIA-142 a column head\'s long press names its trip: its title (data-ttl, free under the word rule) and its days; ⓘ reads 🏠n as "Hosted or hosting" (past and planned)');
    act(t, 'fampast');
  }
  {
    // fix pass: on Mom's board the v1 Thanksgiving's nameless "Me" is no stranger: it is Ashwin's row (the trip's organizer, by
    // v1's own family preset, as P-migrate suggests), so no "Person" row; and names fitNames drops go last for hosts and for
    // people who still have to answer
    const TG = seedAs(TGX), DW = seedAs(DWX), TH = seedAs(THX);
    const u = await boot136({ ls: lsOf([DW, TG, TH], { pialax_idea_me_v1: { [DW]: 'momdad-k3' } }) });
    act(u, 'seg', { v: 'family' });
    const h = u.api.renderFamily().html, B = u.api.famBoard(), ash = B.rows.find((r) => r.key === 'ashwin');
    const rh = (h.match(/<div class="rowh[^"]*"[^>]*>[\s\S]*?<\/div>/g) || []).map((s) => { const n = /data-nm="(\d+)"/.exec(s); return { i: +(/data-v="(\d+)"/.exec(s) || [])[1], nm: n ? +n[1] : null }; });
    // (PIA-154: my own row carries my name too, kept first: 900)
    const keep = (r) => r.hosted > 0 || r.cells.some((c) => c && c.status === 'waiting'), named = rh.filter((x) => x.nm !== null && !B.rows[x.i].me);
    check(ash && ash.cells[1] && ash.cells[1].code === 'LAX' && B.rows.every((r) => !!r.norm) && !/aria-label="Person/.test(h) &&
      named.every((x) => (x.nm < 100) === keep(B.rows[x.i])) && named.some((x) => x.nm < 100) && named.some((x) => x.nm >= 100),
      'PIA-142 on another phone the v1 Thanksgiving\'s "Me" is Ashwin\'s row (no nameless "Person" row); the names of hosts and of people still to answer are dropped last',
      rh.map((x) => [B.rows[x.i].key, x.nm]));
  }
  {
    // my name's cell on a trip this phone is nobody on yet: P-face asks first (my face outlined), then my sheet with my answer row
    // takes its place under the same history entry
    const DW = seedAs(DWX), TH = seedAs(THX);
    const u = await boot136({ ls: lsOf([DW, TH], { pialax_idea_me_v1: { [DW]: 'ashwin-p8' }, pialax_me_profile_v1: { label: '🌴 Ashwin' } }) });
    act(u, 'seg', { v: 'family' });
    const h = u.api.renderFamily().html, row0 = h.split('<div class="rowh').slice(1)[0];
    act(u, 'fcell', { id: TH, code: 'ashwin-l2' });
    const sh = u.api.S.sheet, face = sheet(u), push0 = u.hist.pushes, back0 = u.hist.backs;
    tap(u, face, 'pickface', { code: 'ashwin-l2' });
    const sh2 = u.api.S.sheet, mine = sheet(u);
    check(/^ (hl )?self"/.test(row0) && cellsOf(h)[TH + '|ashwin-l2'] && sh && sh.type === 'face' && sh.p.pre === 'ashwin-l2' && sh.p.then === 'person' && sh.focus === 'pf-mark' && /id="pf-mark"[^>]*data-code="ashwin-l2"/.test(face) &&
      sh2 && sh2.type === 'person' && sh2.p.code === 'ashwin-l2' && sh2.p.outside && /data-act="answer"/.test(mine) && !/data-proxy/.test(mine) && u.api.meFor(TH) === 'ashwin-l2' && u.hist.pushes === push0 && u.hist.backs === back0 && posts(u).length === 0,
      'PIA-142 AC4 my row\'s cell on Tahoe, where this phone is nobody yet: "Who are you?" with Ashwin outlined; one tap and my sheet with my answer row takes its place (same history entry, nothing written)', { pushes: [push0, u.hist.pushes], backs: [back0, u.hist.backs] });
    u.api.closeSheet();
    check(!u.api.S.sheet && u.hist.backs === back0 + 1 && u.api.modelOf(TH).me.code === 'ashwin-l2', '…and closing it leaves the board (one Back), this phone now Ashwin on Tahoe');
  }
  {
    // the empty board: only past and dropped trips: the ghost row with ＋ and 🗄 (which shows the past one); only dropped ones:
    // the ghost alone; trips not read yet: ◷
    const PS = seedAs(THX, (d) => { d.idea.dates.departure = '2026-09-11'; d.idea.dates.return = '2026-09-14'; }), DR = seedAs(THX, (d) => { d.decision.stage = 'dropped'; }), DR2 = seedAs(DWX, (d) => { d.decision.stage = 'dropped'; });
    const e1 = await boot136({ ls: lsOf([PS, DR], { pialax_idea_me_v1: { [PS]: 'ashwin-l2' } }) }); act(e1, 'seg', { v: 'family' });
    const g1 = e1.api.renderFamily(); act(e1, 'fampast'); const g1b = e1.api.renderFamily();
    const e2 = await boot136({ ls: lsOf([DR, DR2]) }); act(e2, 'seg', { v: 'family' }); const g2 = e2.api.renderFamily();
    const e3 = loadApp({ ls: lsOf([PS, DR]) }); await tick(); e3.api.S.seg = 'family'; const g3 = e3.api.renderFamily();
    check(g1.id === 'trips-family-empty' && /data-ghost="family"/.test(g1.html) && /<span class="gface"><\/span>/.test(g1.html) && /data-act="new" aria-label="New trip"/.test(g1.html) && /data-act="fampast"/.test(g1.html) &&
      g1b.id === 'trips-family' && eq(heads(g1b.html), [PS]) && g2.id === 'trips-family-empty' && /data-ghost="family"/.test(g2.html) && !/data-act="fampast"/.test(g2.html) &&
      g3.id === 'trips-family-empty' && /data-k="stale"/.test(g3.html) && !/data-ghost/.test(g3.html),
      'PIA-142 AC6 an empty board shows its ghost row (dotted faces, ＋) and 🗄 while there are past trips to show (one tap brings them in); with only dropped trips the ghost alone; trips not read yet ◷', { g1: g1.id, g2: g2.id, g3: g3.id });
  }


  section('PIA-144 Calendar: selected trip, presence, overlaps and dated create');
  {
    const base = fx('idea-diwali.json'); base.idea.destination = { airport: 'PIA', city: 'Peoria' };
    base.responses = { 'ashwin-p8': { status: 'in', origin: 'LAX', available_from: '', available_to: '', note: '' } };
    const id = seedAs(base), other = seedAs(base, d => { d.idea.dates.departure = '2026-11-09'; d.idea.dates.return = '2026-11-12'; });
    const t = await boot136({ ls: lsOf([id, other], { pialax_idea_keys_v1: keyOf([id]), pialax_idea_me_v1: { [id]: 'ashwin-p8' }, pialax_ui_v1: { sel: id, v1read: 1 } }) });
    act(t, 'tab', { v: 'cal' }); const html = t.api.renderSelected('calendar', 'cal').html;
    check((html.match(/data-act="calday"/g) || []).length === 30 && /data-v="2026-11-09" data-n="3"[^>]*overlapping trips/.test(html), 'Calendar draws the plan month with presence by headcount and inclusive-day overlaps');
    act(t, 'calday', { id, v: '2026-11-09' }); const h = sheet(t);
    check(t.api.S.sheet.p.calendar && /class="dayn"[^>]*>[\s\S]*?3<\/span>/.test(h) && h.includes('data-id="' + other + '"'), 'one day opens P-day with its own count and a link to the overlapping trip');
    act(t, 'person', { id, code: 'ashwin-p8' }); check(t.api.S.sheet.type === 'person' && t.api.S.sheet.back.type === 'day', 'a Calendar day face opens the existing person sheet with Back');
    act(t, 'sh-back'); act(t, 'calnew', { v: '2026-11-09' });
    check(D(t).s === '2026-11-09' && D(t).name === '' && D(t).dest === '', 'day plus starts the normal create flow with the selected date and no copied title/place');
    t.api.closeSheet(); act(t, 'calmonth', { v: '1' }); act(t, 'tab', { v: 'map' }); act(t, 'tab', { v: 'cal' });
    check(t.api.S.calView.ym === '2026-12', 'Calendar retains month navigation across tabs');
    act(t, 'pick', { id: other }); check(t.api.S.calView.id === other && t.api.S.calView.ym === '2026-11', 'selecting another trip resets Calendar to its start month');
    const n = t.fetches.length; act(t, 'calmonth', { v: '-1' }); act(t, 'calday', { id: other, v: '2026-10-01' });
    check(!/data-act="calnew"/.test(sheet(t)) && t.fetches.length === n, 'past days are readable, offer no dated create and make no network call');
  }
  // ═══ PIA-151: my flight ═══
  section('PIA-151 my flight: each traveler\'s two ends in one place (day on a one-tap calendar, airport, time), one write a save, the board\'s final check, different days per person');
  const el0 = (ds, dis) => ({ dataset: ds, getAttribute: (k) => (dis && k === 'aria-disabled' ? 'true' : null) });   // a tapped control (aria-disabled when dis)
  const legOf = (h, end) => (h.match(/<div class="leg"[\s\S]*?(?=<div class="leg"|<\/div><(?:div|button|a|p|span class="sdots")|$)/g) || [])[end] || '';
  const toastTxt = (t) => (t.rec['#toast'] ? t.rec['#toast'].innerHTML : '');
  {
    // AC1 / AC2 / AC3 / AC5 Anjo (in, her own 11/5–11/8) on her phone: her bar opens her flight section; each end's day opens a month
    // calendar for that end alone, where one tap picks it and saves it; nothing else changes
    const id = seedAs(DWX, anjoIn({ available_from: '2026-11-05', available_to: '2026-11-08', note: 'Window seat' }));
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }), rec: ['#toast'] });
    act(t, 'open', { id });
    const h0 = screen(t), bar = ctl(h0, 'flight', { code: 'anjo-z5' });
    act(t, 'flight', bar);
    const s0 = sheet(t), gf = (/<a class="btn pri(?: wide)?" href="([^"]+)"[^>]*data-k="gf">/.exec(s0) || [])[1], dec = gf ? TM.gfDecode(gf.replace(/&amp;/g, '&')) : null;
    check(!!bar && /class="track mybar" data-act="flight"[^>]*aria-label="My flight 11\/5–11\/8, outside plan"/.test(h0) && t.api.S.sheet && t.api.S.sheet.type === 'person' && t.api.S.sheet.p.code === 'anjo-z5' &&
      /class="ld own" data-act="dates"[^>]*data-end="0" aria-label="Arrive date 11\/5, own day, outside plan" data-lbl="Arrive, own day"[^>]*>11\/5<span class="fm off" data-k="offplan" aria-hidden="true">⚠<\/span><\/button>/.test(s0) &&
      /class="ld own" data-act="dates"[^>]*data-end="1" aria-label="Leave date 11\/8, own day" data-lbl="Leave, own day"[^>]*>11\/8<\/button>/.test(s0) &&
      !/data-act="legshift"/.test(s0) && !/id="tm-arr"/.test(s0) && !!dec && eq(dec.legs.map((L) => L.date), ['2026-11-05', '2026-11-08']) && dec.legs[0].to.join() === 'RDU' &&
      /<div class="split"><a class="btn pri" href="[^"]+"[^>]*data-ret="[^"]+" data-code="anjo-z5" aria-label="Google Flights" data-k="gf">✈↗<\/a><button class="btn tkb tkoff" data-act="mybook"[^>]*><span class="tkg" data-k="tkoff" aria-hidden="true">☐<\/span> I booked<\/button>/.test(s0),
      'PIA-151 AC1/AC5 one tap on her own bar opens her flight section: 🛬 11/5 (⚠: outside the plan, allowed) and 🛫 11/8, each her own (underlined, and a long press says so; PIA-154: no −1 / +1 beside them), and [✈↗ | 🎫 I booked] for exactly those days to RDU while the dates are not 🔒 yet (✈ Book ↗ once they are)');
    act(t, 'dates', ctl(s0, 'dates', { end: '0' }));
    const L0 = dsh(t), c0 = sheet(t);
    act(t, 'dmonth', { v: '-1' }); const cOct = sheet(t); act(t, 'dmonth', { v: '1' });
    check(L0 && L0.quick && L0.end === 0 && t.api.S.sheet.back && t.api.S.sheet.back.type === 'person' && /<span class="endg"><span data-k="arrive" aria-hidden="true">🛬<\/span> Arrive<\/span>/.test(c0) && !/data-act="dsave"/.test(c0) &&
      /data-v="2026-11-09" aria-label="11\/9[^"]*, ends cross" aria-disabled="true" data-why="1" data-lbl="Ends cross"/.test(c0) && /data-v="2026-10-16"[^>]*aria-disabled="true" data-why="1" data-lbl="Past"/.test(cOct) &&
      /data-act="dday" data-v="2026-11-08"[^>]*>[\s\S]*?class="pinday"/.test(c0) && /class="plan prop[^"]*" data-k="planprop"/.test(c0) && /data-act="dfollow"/.test(c0) && L0.ym === '2026-11',
      'PIA-151 AC2 her 🛬 day opens a month calendar for that end alone (🛬 beside her face, no Save to find): the plan outlined, 📌 11/8 on its day, ◀ ▶ paging (October\'s past days greyed: "Past"), days after her 🛫 greyed ("Ends cross"), Follow plan for an end of her own');
    const p0 = nPosts(t), r1 = tap(t, c0, 'dday', { v: '2026-11-03' }), busy = sheet(t), r2 = tap(t, busy, 'dday', { v: '2026-11-02' });
    await r1; await settleWrites(t, id);
    const ps1 = posts(t).slice(p0), x1 = srv.read(id).responses['anjo-z5'];
    check(ps1.length === 1 && ps1[0].path === '/idea/respond' && eq([ps1[0].body.available_from, ps1[0].body.available_to, ps1[0].body.note, ps1[0].body.status, ps1[0].body.origin], ['2026-11-03', '2026-11-08', 'Window seat', 'in', '']) &&
      /aria-label="Saving" aria-busy="true"[^>]*>◷<\/button>/.test(busy) && x1.available_from === '2026-11-03' && t.api.S.sheet && t.api.S.sheet.type === 'person' && t.api.S.sheet.focus === 'ld-0' && /🗓✓/.test(toastTxt(t)),
      'PIA-151 AC2/AC4 one tap on 11/3 saves it: ONE complete answer from a fresh read (her 🛫 11/8, her note, her In kept); a second tap while it is out says ◷ and sends nothing; then back to her flight section, its 🛬 day in focus, 🗓✓', { n: ps1.length, b: ps1[0] && ps1[0].body });
    // the day it already is: back, nothing sent; Follow plan for her own 🛬: at once, blank (her 🛫 stays her own)
    act(t, 'dates', ctl(sheet(t), 'dates', { end: '0' })); const p1 = nPosts(t);
    await tap(t, sheet(t), 'dday', { v: '2026-11-03' }); await tick();
    const backSame = t.api.S.sheet && t.api.S.sheet.type === 'person' && nPosts(t) === p1;
    act(t, 'dates', ctl(sheet(t), 'dates', { end: '0' }));
    await tap(t, sheet(t), 'dfollow'); await settleWrites(t, id);
    const x2 = srv.read(id).responses['anjo-z5'], s2 = sheet(t);
    check(backSame && nPosts(t) === p1 + 1 && x2.available_from === '' && x2.available_to === '2026-11-08' && /class="ld fol" data-act="dates"[^>]*aria-label="Arrive date 11\/6, follows plan"[^>]*>11\/6<\/button>/.test(s2) && /class="ld own"[^>]*data-end="1"/.test(s2),
      'PIA-151 AC3 a tap on the day it already is goes back with nothing sent; Follow plan for her own 🛬 goes at once (blank: it follows the plan again, drawn dimmed; PIA-154: no 🗓 corner), her 🛫 still her own');
    // the plan's own day, unbooked, for an end of her own: it follows the plan (the current rule)
    act(t, 'dates', ctl(sheet(t), 'dates', { end: '1' })); await tap(t, sheet(t), 'dday', { v: '2026-11-09' }); await settleWrites(t, id);
    check(srv.read(id).responses['anjo-z5'].available_to === '' && TM.flightEnds(t.api.modelOf(id), 'anjo-z5')[1].follow,
      'PIA-151 AC3 unbooked, her 🛫 picked on the plan\'s last day (11/9) keeps following the plan (stored blank), and her row says so');
    t.api.closeSheet();
  }
  {
    // AC3 / AC4 / AC5 booked: the time fields sit in her rows (in place of ±1); her first move asks ⚠ 🎫 once; a pick is her own day even
    // on the plan's day; typed times and a day picked in one visit never erase each other; a failed save keeps the pick for ↻
    const id = seedAs(DWX, (d) => { lock139(d); anjoIn({ booked: true, booked_at: '2026-10-16T00:00:00.000Z', note: 'Red-eye' })(d); });
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }), rec: ['#toast'] });
    act(t, 'open', { id }); act(t, 'mytimes', { id });
    const s0 = sheet(t), legA = legOf(s0, 0), legD = legOf(s0, 1);
    check(t.api.S.sheet.focus === 'tm-arr' && /id="tm-arr"/.test(legA) && /data-end="0"/.test(legA) && /id="tm-dep"/.test(legD) && /data-end="1"/.test(legD) && !/data-act="legshift"/.test(s0) &&
      /class="ld bk" data-act="dates"[^>]*aria-label="Arrive date 11\/6, booked day"/.test(s0) && /id="tm-half" data-sig="" hidden/.test(s0),
      'PIA-151 AC1 booked: her booked bar opens her flight section at 🛬; each row holds its day (booked: never following the plan), its time field (🛬 in the arrive row, 🛫 in the leave row) in place of −1 / +1');
    typed(t, 'tm-arr', '0905', 'anjo-z5');
    act(t, 'dates', ctl(sheet(t), 'dates', { end: '0' }));
    const p0 = nPosts(t);
    await tap(t, sheet(t), 'dday', { v: '2026-11-05' }); await tick();
    const asked = sheet(t), noPost = nPosts(t) === p0;
    srv.failNext = 'network';
    await tap(t, asked, 'dsave'); await tick(); await settleWrites(t, id);
    const failed = sheet(t), stillPicked = dsh(t) && dsh(t).s === '2026-11-05';
    await tap(t, failed, 'dsave'); await settleWrites(t, id);
    const x1 = srv.read(id).responses['anjo-z5'], back1 = t.api.S.sheet && t.api.S.sheet.type === 'person' && t.api.S.sheet.focus === 'tm-arr', keptTyped = /id="tm-arr"[^>]*value="0905"/.test(sheet(t));
    check(noPost && /data-act="dsave"[^>]*data-lbl="Confirm">⚠ ✈ <span class="cw">Confirm<\/span>/.test(asked) && /data-act="dsave" aria-label="Retry">⚠ ↻<\/button>/.test(failed) && stillPicked &&
      x1.available_from === '2026-11-05' && x1.available_to === '' && x1.booked === true && x1.note === 'Red-eye' && back1 && keptTyped,
      'PIA-151 AC4 her first move after her 🎫 asks once (⚠ 🎫 Confirm, nothing sent); a save that fails keeps 11/5 picked with ⚠ ↻; ↻ saves it (her 🎫 and note kept) and she is back in her flight section at her 🛬 time, 0905 still typed there', { x1 });
    // the plan's last day picked for her 🛫 (booked, still blank in the record): stored as hers (her flight is that day: one tap records
    // it); then the plan's first day for her own 🛬: hers too; no Follow plan for a booked day, in the one-end calendar or in ↔
    act(t, 'dates', ctl(sheet(t), 'dates', { end: '1' })); const p1 = nPosts(t);
    await tap(t, sheet(t), 'dday', { v: '2026-11-09' }); await settleWrites(t, id);
    const pinned = nPosts(t) === p1 + 1 && srv.read(id).responses['anjo-z5'].available_to === '2026-11-09' && t.api.S.sheet.type === 'person';
    act(t, 'dates', ctl(sheet(t), 'dates', { end: '0' }));
    const noFollow = !/data-act="dfollow"/.test(sheet(t));
    // (PIA-154: both ends are P-dates' Mine, opened here over the one-end calendar; ‹ comes back to it)
    t.api.openSheet('dates', { id, who: 'anjo-z5', end: null }, { back: true });
    const bothL = dsh(t), noFollowBoth = !!bothL && bothL.target === 'me' && bothL.end === null && !/data-act="dfollow"/.test(sheet(t)) && /data-act="dsave"[^>]*data-lbl="No change"/.test(sheet(t));
    act(t, 'sh-back');
    await tap(t, sheet(t), 'dday', { v: '2026-11-06' }); await settleWrites(t, id);
    const x2 = srv.read(id).responses['anjo-z5'];
    check(pinned && noFollow && noFollowBoth && x2.available_from === '2026-11-06' && x2.available_to === '2026-11-09' && nPosts(t) === p1 + 2,
      'PIA-151 AC3 booked, her 🛫 tapped on the plan\'s 11/9 (the day it already reads, blank in the record) is stored as HER day, and her 🛬 moved onto the plan\'s 11/6 too (asked once a visit: no second confirm); no Follow plan is offered on a booked day, in the one-end calendar or in ↔ (both ends: No change)', { pinned, noFollow, noFollowBoth, x2 });
    // the typed time goes as the sheet closes: one answer with her days, her times, her note, her 🎫 and LGA, none erasing the others
    t.api.closeSheet(); await until(() => /🛬09:05/.test(srv.read(id).responses['anjo-z5'].note)); await tick();
    const x3 = srv.read(id).responses['anjo-z5'];
    check(x3.note === '🛬09:05 Red-eye' && x3.available_from === '2026-11-06' && x3.available_to === '2026-11-09' && x3.booked === true && x3.origin === 'LGA' && x3.status === 'in',
      'PIA-151 AC4 the time typed before the days were picked goes as her sheet closes: 🛬09:05 before her note, her own 11/6–11/9, her 🎫 and LGA all kept (one complete answer a save, rebuilt from a fresh read)', x3);
    // the organizer moves the plan +1: her booked 11/6 stays (it is stored as hers)
    const o = await boot136({ ls: org138(id) });
    act(o, 'open', { id }); act(o, 'dates', { id }); act(o, 'dlock', {}); await act(o, 'dlock', {}); await settleWrites(o, id); o.api.closeSheet();
    act(o, 'dates', { id }); tap(o, sheet(o), 'dshift', { v: '1' });   // (PIA-154: P-dates moves the plan: its +1, then Save, confirmed once)
    await tap(o, sheet(o), 'dsave'); if (o.api.S.sheet && /data-act="dsave"[^>]*data-lbl="Confirm"/.test(sheet(o))) await tap(o, sheet(o), 'dsave');
    await settleWrites(o, id); if (o.api.S.sheet) o.api.closeSheet();
    const after = TM.flightEnds(o.api.modelOf(id), 'anjo-z5').map((e) => e.day);
    check(eq(TM.docPlan(srv.read(id)), { s: '2026-11-07', e: '2026-11-10' }) && eq(after, ['2026-11-06', '2026-11-09']) && srv.read(id).responses['anjo-z5'].available_to === '2026-11-09',
      'PIA-151 AC3 the organizer unlocks and moves the plan +1 (after the confirming tap): her booked 11/6–11/9, stored as hers, stay: no booked flight moves', { after, plan: TM.docPlan(srv.read(id)) });
  }
  {
    // AC4 locked, closed, paid or past: her days say why on a tap, never a failing write
    const paid = seedAs(DWX, (d) => { lock139(d); anjoIn({ booked: true })(d); d.decision.stage = 'booked'; d.decision.actual_total = 900; });
    const past = seedAs(DWX, (d) => { d.idea.dates.departure = '2026-10-01'; d.idea.dates.return = '2026-10-04'; d.idea.notes = ''; anjoIn()(d); });
    const wait = seedAs(DWX);
    const locked = seedAs(DWX, (d) => { lock139(d); anjoIn()(d); });
    const why = [];
    for (const id of [paid, past, wait, locked]) {
      const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
      act(t, 'open', { id }); act(t, 'person', { id, code: 'anjo-z5' });
      const s = sheet(t), d = ctl(s, 'dates', { end: '0' }), n = nPosts(t);
      if (d) t.api.ACTS.dates(el0(d, /aria-disabled="true"/.test((new RegExp('<button[^>]*data-act="dates"[^>]*data-end="0"[^>]*>').exec(s) || [''])[0])));
      why.push({ lbl: (/data-act="dates"[^>]*data-end="0"[^>]*data-lbl="([^"]+)"/.exec(s) || [])[1], sheet: t.api.S.sheet && t.api.S.sheet.type, posts: nPosts(t) - n });
      t.api.closeSheet();
    }
    check(why[0].lbl === 'Trip closed' && why[1].lbl === 'Trip over' && why[2].lbl === 'Answer first' && why.slice(0, 3).every((w) => w.sheet === 'person' && w.posts === 0) &&
      why[3].lbl === 'Arrive, follows plan' && why[3].sheet === 'dates',
      'PIA-151 AC4 her day on a paid trip says "Trip closed", on a trip that is over "Trip over", before she answers "Answer first" (each a tap that explains, nothing sent); on a 🔒 trip her own days stay hers to pick', why);
  }
  {
    // AC7 / AC8 the board's final check: booked rows carry their landing time at the bar's start and leaving time at its end (––:–– when
    // no landing time yet); the organizer's tap on any traveler's row opens their flight section; screen words unchanged
    const id = seedAs(DWX, (d) => { lock139(d); d.responses['ashwin-p8'] = RESP('in', { member: 'ashwin-p8', origin: 'LAX', booked: true, note: '🛬09:05 🛫18:30' }); anjoIn({ booked: true })(d); });
    const o = await boot136({ ls: org138(id) });
    act(o, 'open', { id });
    const h = screen(o), board = o.api.peopleBoard(o.api.modelOf(id));
    const rowOf = (c) => (new RegExp('<div class="pb-row[^"]*"[^>]*><span class="who"><button class="facebtn" data-act="person" data-id="[^"]+" data-code="' + c + '"[\\s\\S]*?(?=<div class="pb-row|$)').exec(h) || [''])[0];
    const ash = rowOf('ashwin-p8'), anj = rowOf('anjo-z5'), md = rowOf('momdad-k3');
    const bc = {
      ashBar: /class="track mybar" data-act="flight"[^>]*aria-label="My flight 11\/6–11\/9, booked, lands at 09:05, leaves at 18:30"/.test(ash),
      ashLand: /<span class="btm a" style="left:[\d.]+%" role="img" aria-label="Lands at 09:05" data-lbl="Lands at"><span class="tn">09:05<\/span><\/span>/.test(ash),
      ashLeave: /<span class="btm d" style="right:[\d.]+%" role="img" aria-label="Leaves at 18:30"[^>]*><span class="tn">18:30<\/span>/.test(ash),
      anjBar: /class="track fbar" data-act="flight"[^>]*data-code="anjo-z5" aria-label="Anjo, flight 11\/6–11\/9, booked, no landing time"/.test(anj),
      anjMiss: /<span class="btm a miss"[^>]*aria-label="No landing time" data-lbl="No landing time" data-k="notime">🛬\?<\/span>/.test(anj) && !/btm d/.test(anj) && !/––:––/.test(anj),
      md: /class="track fbar" data-act="flight"[^>]*data-code="momdad-k3"/.test(md) && !/btm/.test(md), same: h.indexOf(board) >= 0, words: shown(board.replace(/&amp;/g, '&')) };
    check(bc.ashBar && bc.ashLand && bc.ashLeave && bc.anjBar && bc.anjMiss && bc.md && bc.same && eq(bc.words, ['Mom', 'Dad', 'Ashwin', 'Anjo']),   // (PIA-153: "Mom & Dad", as every sheet spells it; PIA-154: my own name too)
      'PIA-151 AC7 the organizer\'s board: his bar reads 09:05 over its start and 18:30 under its end (PIA-154: plain HH:MM); Anjo (booked, no time yet) a muted 🛬? (never ––:––); Mom & Dad (not booked) no time; every traveler\'s bar is a button to their flight; no new words but the names', { bc, ash: ash.slice(-900), anj: anj.slice(-700) });
    act(o, 'flight', ctl(h, 'flight', { code: 'anjo-z5' }));
    const os = sheet(o);
    check(o.api.S.sheet && o.api.S.sheet.type === 'person' && o.api.S.sheet.p.code === 'anjo-z5' && o.api.S.sheet.focus === 'tm-arr' && /id="tm-arr" data-code="anjo-z5"/.test(os) && /data-act="answer"[^>]*data-proxy="1"/.test(os),
      'PIA-151 AC7/AC8 a tap on Anjo\'s row opens her flight section on the organizer\'s phone with her 🛬 time field focused (the time is what is missing), his answers for her 📞');
    o.api.closeSheet();
    // a guest: only her own bar opens her flight; the others' bars still read their times; nobody's bar opens for a host or someone out
    const g = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(g, 'open', { id });
    const gh = screen(g);
    check(/class="track mybar" data-act="flight"[^>]*data-code="anjo-z5"/.test(gh) && !/class="track fbar"/.test(gh) && /<span class="btm a"[^>]*aria-label="Lands at 09:05"/.test(gh),
      'PIA-151 AC7 on Anjo\'s phone only her own bar opens a flight; Ashwin\'s still reads his 09:05');
    const pd = seedAs(DWX, (d) => { atPeoria(d); anjoIn()(d); }), ph = await boot136({ ls: lsOf([pd], { pialax_idea_me_v1: { [pd]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([pd]) }) });
    act(ph, 'open', { id: pd });
    const hh = screen(ph);
    check(!/data-act="flight"[^>]*data-code="momdad-k3"/.test(hh) && /data-act="flight"[^>]*data-code="anjo-z5"/.test(hh), 'PIA-151 AC8 never for a host: Mom & Dad host in Peoria, so their bar opens no flight; Anjo\'s does');
    // before I answer, my bar asks for my answer first (as my days always did)
    const nw = seedAs(DWX), ng = await boot136({ ls: lsOf([nw], { pialax_idea_me_v1: { [nw]: 'anjo-z5' } }), rec: ['#screen', '#toast'] });
    act(ng, 'open', { id: nw }); const nd = ng.rec['#screen'].__rec.html, n0 = nd.length;
    act(ng, 'flight', ctl(screen(ng), 'flight', { code: 'anjo-z5' }));
    check(!ng.api.S.sheet && nd.slice(n0).some((x) => /class="answers nudge"/.test(x)) && /In \/ Maybe \/ Out/.test(toastTxt(ng)) && nPosts(ng) === 0,
      'PIA-151 before Anjo answers, her bar opens nothing: her answer row pulses and says "In / Maybe / Out" (her answer first, as her days always asked)');
  }
  {
    // AC6 different dates per person: Anjo on her own 11/5–11/8, Ashwin on the plan's 11/6–11/9. Her rows, Book link, the organizer's price
    // search (real /search requests through the Worker, SerpAPI stubbed), Calendar presence and Map pickups all read her days; his his.
    const SERP = fx('serp-flights.json'), offline = globalThis.fetch, serp = [];
    srv.env.PROXY_TOKEN = TOKEN; srv.env.SERPAPI_KEY = 'serp-key';
    globalThis.fetch = async (u) => {
      const s = String(u);
      if (/^https:\/\/serpapi\.com\/account\.json\?/.test(s)) return new Response(JSON.stringify({ plan_searches_left: 900, total_searches_left: 900, this_month_usage: 41, searches_per_month: 1000 }), { status: 200 });
      if (/^https:\/\/serpapi\.com\/search\.json\?/.test(s)) { serp.push(s); return new Response(JSON.stringify(SERP), { status: 200 }); }
      return offline(u);
    };
    try {
      const id = seedAs(DWX, anjoIn({ available_from: '2026-11-05', available_to: '2026-11-08' }));
      [...srv.map.keys()].filter((k) => /^fare:/.test(k)).forEach((k) => srv.map.delete(k));
      const o = await boot136({ ls: lsOf([id], { pialax_idea_keys_v1: keyOf([id]), pialax_proxy_token: TOKEN, pialax_idea_me_v1: { [id]: 'ashwin-p8' }, pialax_ui_v1: { sel: id, v1read: 1 } }) });
      act(o, 'open', { id });
      const rows = {}, book = {};
      ['anjo-z5', 'ashwin-p8'].forEach((c) => {
        act(o, 'person', { id, code: c }); const s = sheet(o); o.api.closeSheet();
        rows[c] = [(/data-end="0"[^>]*>(\d+\/\d+)/.exec(s) || [])[1], (/data-end="1"[^>]*>(\d+\/\d+)/.exec(s) || [])[1]];
        const href = (/<a class="btn pri(?: wide)?" href="([^"]+)"[^>]*data-k="gf">/.exec(s) || [])[1], d = href ? TM.gfDecode(href.replace(/&amp;/g, '&')) : null;
        book[c] = d ? d.legs.map((L) => L.date) : null;
      });
      o.api.render(true);
      await tap(o, o.api.SHEETS.total({ type: 'total', p: { id }, local: {} }), 'search'); await tick(20);
      const q = o.fetches.filter((f) => f.url.indexOf(W + '/search?') === 0).map((f) => new URL(f.url).searchParams);
      const dates = (from) => q.filter((p) => p.get('departure_id').split(',').indexOf(from) >= 0).map((p) => p.get('outbound_date') + '|' + p.get('return_date'));
      act(o, 'tab', { v: 'cal' }); const cal = o.api.renderSelected('calendar', 'cal').html;
      const nOn = (day) => +((new RegExp('data-v="' + day + '" data-n="(\\d+)"').exec(cal) || [])[1]);
      act(o, 'calday', { id, v: '2026-11-05' }); const d5 = sheet(o); o.api.closeSheet();
      act(o, 'tab', { v: 'map' }); const map = o.api.renderSelected('map', 'map').html;
      const chip = (kind, day, code) => new RegExp('<button class="pk ' + kind + '[^"]*" data-act="pickup" data-id="[^"]+" data-ap="RDU" data-v="' + day + '"' + (code ? ' data-code="' + code + '"' : '')).test(map);
      check(eq(rows['anjo-z5'], ['11/5', '11/8']) && eq(rows['ashwin-p8'], ['11/6', '11/9']) && eq(book['anjo-z5'], ['2026-11-05', '2026-11-08']) && eq(book['ashwin-p8'], ['2026-11-06', '2026-11-09']) &&
        eq(dates('LGA'), ['2026-11-05|2026-11-08']) && eq(dates('LAX'), ['2026-11-06|2026-11-09']) && serp.length === 3 &&
        nOn('2026-11-05') === 1 && nOn('2026-11-06') === 4 && nOn('2026-11-08') === 4 && nOn('2026-11-09') === 3 && /dayf"[^>]*data-code="anjo-z5"/.test(d5) && /dayf dimf"[^>]*data-code="ashwin-p8"/.test(d5) &&
        chip('arr', '2026-11-05', 'anjo-z5') && chip('dep', '2026-11-08', 'anjo-z5') && chip('arr', '2026-11-06') && chip('dep', '2026-11-09'),
        'PIA-151 AC6 Anjo on her own days, Ashwin on the plan\'s, all five agree: her flight rows read 11/5–11/8 and his 11/6–11/9; their ✈↗ links search exactly those days; the organizer\'s 🔍 searched LGA for 11/5–11/8 and LAX for 11/6–11/9; Calendar counts her alone on 11/5 (P-day: her there, him not yet) and him without her on 11/9; the Map picks her up 11/5 and drops her 11/8, him 11/6 and 11/9',
        { rows, book, lga: dates('LGA'), lax: dates('LAX'), n: [nOn('2026-11-05'), nOn('2026-11-06'), nOn('2026-11-09')] });
    } finally { globalThis.fetch = offline; }
  }
  {
    // AC5 on a trip still Asking (its dates not 🔒: a new trip's default), a flight bought early can be recorded: her flight section has
    // [✈ Book ↗ | 🎫] for exactly the days in its rows; 🎫 → her 🛬 field invites the time → typed → saved as the sheet closes. The trip
    // view keeps [📣 Share | ✈↗] until then; the board's 🎫 marks keep their rule (once anyone has booked)
    const id = seedAs(DWX, anjoIn({ available_from: '2026-11-05' }));
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }), rec: ['#toast'] });
    act(t, 'open', { id });
    const h0 = screen(t);
    act(t, 'flight', ctl(h0, 'flight', { code: 'anjo-z5' }));
    const s0 = sheet(t), p0 = nPosts(t), gf = (/<a class="btn pri" href="([^"]+)"[^>]*data-k="gf">/.exec(s0) || [])[1], dec = gf ? TM.gfDecode(gf.replace(/&amp;/g, '&')) : null;
    await tap(t, s0, 'mybook'); await settleWrites(t, id);
    const s1 = sheet(t), x1 = srv.read(id).responses['anjo-z5'], pB = nPosts(t) - p0;
    typed(t, 'tm-arr', '21:40', 'anjo-z5');
    t.api.closeSheet(); await until(() => /🛬21:40/.test(srv.read(id).responses['anjo-z5'].note)); await tick();
    const x2 = srv.read(id).responses['anjo-z5'], h2 = screen(t);
    check(t.api.modelOf(id).decision === 'proposed' && !/split prim/.test(h0) && !/data-act="mybook"|google\.com\/travel/.test(h0) && !!dec && eq(dec.legs.map((L) => L.date), ['2026-11-05', '2026-11-09']) &&
      /<div class="split"><a class="btn pri"[^>]*aria-label="Google Flights" data-k="gf">✈↗<\/a><button class="btn tkb tkoff" data-act="mybook"/.test(s0) && pB === 1 && x1.booked === true &&
      /<span class="fld tiny invite"><label for="tm-arr"/.test(s1) && legOf(s1, 0).indexOf('id="tm-arr"') >= 0 && x2.note === '🛬21:40' && x2.available_from === '2026-11-05' && x2.booked &&
      /class="track mybar" data-act="flight"[^>]*aria-label="My flight 11\/5–11\/9, outside plan, booked, lands at 21:40"/.test(h2),
      'PIA-151 AC5 on a trip still Asking: her flight section offers [✈ Book ↗ | 🎫 I booked] for exactly her 11/5–11/9 (PIA-154: the trip view has no primary and no ✈↗ before 🔒); 🎫 records her booked in one write, her 🛬 field in its row invites the time, and 21:40 goes as the sheet closes (her own 11/5 and 🎫 kept); then the trip view shows her booked bar with 21:40', { pB, x2 });
    // the organizer, before anyone has booked: no 🎫 on the board, one in Anjo's flight section (she has not answered: a confirming tap)
    const id2 = seedAs(DWX), o = await boot136({ ls: org138(id2) });
    act(o, 'open', { id: id2 });
    const ob = screen(o);
    act(o, 'flight', ctl(ob, 'flight', { code: 'anjo-z5' }));
    const os = sheet(o), q0 = nPosts(o);
    await tap(o, os, 'booked', { code: 'anjo-z5' }); const armedS = sheet(o), q1 = nPosts(o);
    await tap(o, armedS, 'booked', { code: 'anjo-z5' }); await settleWrites(o, id2);
    const an = srv.read(id2).responses['anjo-z5'], os2 = sheet(o);
    check(!/data-act="booked"/.test(ob) && /data-act="booked" data-id="[^"]+" data-code="anjo-z5" aria-pressed="false"/.test(os) && q1 === q0 && /data-act="booked"[^>]*aria-label="Confirm booked, [^"]*Anjo"/.test(armedS) &&
      an && an.status === 'in' && an.booked === true && /📞/.test(an.note) && /id="tm-arr" data-code="anjo-z5"/.test(os2) && /data-k="booked">✈/.test(screen(o)) && !/data-act="booked"/.test(screen(o)),
      'PIA-151 AC5/AC8 the organizer on an Asking trip: no 🎫 on the board yet; in Anjo\'s flight section his 🎫 asks a confirming tap (she has not answered), then records her In (📞) and booked; her time field follows; the board\'s 🎫 marks appear now that someone has booked', { an });
    o.api.closeSheet(); t.api.closeSheet();
  }
  {
    // AC2 the one-end calendar opens on the month of the end being set, across a month (11/28–12/2) and a year (12/29–1/3)
    const mk = (s, e) => seedAs(DWX, (d) => { d.idea.dates.departure = s; d.idea.dates.return = e; d.idea.notes = ''; anjoIn()(d); });
    const nov = mk('2026-11-28', '2026-12-02'), ny = mk('2026-12-29', '2027-01-03');
    const t = await boot136({ ls: lsOf([nov, ny], { pialax_idea_me_v1: { [nov]: 'anjo-z5', [ny]: 'anjo-z5' } }) });
    const yms = {};
    act(t, 'open', { id: nov }); act(t, 'person', { id: nov, code: 'anjo-z5' });
    act(t, 'dates', ctl(sheet(t), 'dates', { end: '1' })); yms.novLeave = dsh(t).ym; const cn = sheet(t); act(t, 'sh-back');
    act(t, 'dates', ctl(sheet(t), 'dates', { end: '0' })); yms.novArr = dsh(t).ym; t.api.closeSheet(); act(t, 'back');
    act(t, 'open', { id: ny }); act(t, 'person', { id: ny, code: 'anjo-z5' });
    act(t, 'dates', ctl(sheet(t), 'dates', { end: '1' })); yms.nyLeave = dsh(t).ym; const cal = sheet(t);
    await tap(t, cal, 'dday', { v: '2027-01-04' }); await settleWrites(t, ny);
    const x = srv.read(ny).responses['anjo-z5'];
    check(eq(yms, { novLeave: '2026-12', novArr: '2026-11', nyLeave: '2027-01' }) && /data-act="dday" data-v="2026-12-02"/.test(cn) && /data-act="dday" data-v="2027-01-03"/.test(cal) &&
      x.available_to === '2027-01-04' && x.available_from === '' && t.api.S.sheet && t.api.S.sheet.type === 'person',
      'PIA-151 AC2 her 🛫 calendar opens on the month of that end: December for a 11/28–12/2 trip (12/2 picked on it; her 🛬, November), January 2027 for 12/29–1/3; one tap on 1/4, past the turn of the year (⚠ outside the plan, allowed), saves it as her own', { yms, x });
    t.api.closeSheet();
  }
  {
    // AC4 a one-end pick on a hub trip (Peoria: PIA | ORD) keeps her airports, times, note and 🎫 in the record
    const id = seedAs(DWX, (d) => { atPeoria(d); anjoIn({ arrive_at: 'ORD', leave_from: 'ORD', booked: true, booked_at: '2026-10-16T00:00:00.000Z', note: '🛬09:05 🛫18:30 Red-eye' })(d); });
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(t, 'open', { id }); act(t, 'person', { id, code: 'anjo-z5' });
    const s0 = sheet(t);
    act(t, 'dates', ctl(s0, 'dates', { end: '0' }));
    await tap(t, sheet(t), 'dday', { v: '2026-11-05' }); await tick();
    await tap(t, sheet(t), 'dsave'); await settleWrites(t, id);
    const x = srv.read(id).responses['anjo-z5'];
    check(/<b class="lc">ORD<\/b>/.test(legOf(s0, 0)) && !/data-act="legair"/.test(s0) && /id="tm-arr"[^>]*value="09:05"/.test(s0) && x.available_from === '2026-11-05' && x.arrive_at === 'ORD' && x.leave_from === 'ORD' &&
      x.note === '🛬09:05 🛫18:30 Red-eye' && x.booked === true && x.origin === 'LGA' && x.status === 'in',
      'PIA-151 AC4 on a hub trip (PIA | ORD) her booked 🛬 moved to 11/5 on its calendar (after its ⚠ 🎫 confirm) keeps both her ORD ends, 09:05 / 18:30, her note, LGA and her 🎫 in the record', x);
    t.api.closeSheet();
  }
  {
    // AC3 / AC4 a plan this phone drew before it moved never decides the plan-day rule: her phone still draws the plan from 11/6; the
    // organizer has moved it to 11/8–11/11 meanwhile; her tap on 11/6 (the plan's first day as her phone draws it) is HER 11/6
    const id = seedAs(DWX, anjoIn({ available_from: '2026-11-05' }));
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }) });
    act(t, 'open', { id }); act(t, 'person', { id, code: 'anjo-z5' });
    act(t, 'dates', ctl(sheet(t), 'dates', { end: '0' }));
    const d = srv.read(id); d.idea.dates.departure = '2026-11-08'; d.idea.dates.return = '2026-11-11'; srv.write(d);   // (his phone, meanwhile)
    const looked = t.api.modelOf(id).plan.s;
    await tap(t, sheet(t), 'dday', { v: '2026-11-06' }); await settleWrites(t, id);
    const x = srv.read(id).responses['anjo-z5'], fe = TM.flightEnds(t.api.modelOf(id), 'anjo-z5');
    check(looked === '2026-11-06' && x.available_from === '2026-11-06' && x.available_to === '' && fe[0].day === '2026-11-06' && fe[0].own && fe[1].day === '2026-11-11' && fe[1].follow,
      'PIA-151 her pick of 11/6, the plan\'s first day on her phone but no longer on the record (moved to 11/8–11/11), is stored as her own 11/6 (decided on the record it is sent against), never "follow the plan" to 11/8; her 🛫 still follows', { x, fe });
    t.api.closeSheet();
  }
  {
    // a plain ‹ back from her day's calendar never focuses her time field again; a time typed under the calendar that still needs its
    // half (☀ / 🌃) holds a close once, back in her flight section, as it does there
    const id = seedAs(DWX, (d) => { lock139(d); anjoIn({ booked: true, booked_at: '2026-10-16T00:00:00.000Z' })(d); });
    const t = await boot136({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'anjo-z5' } }), rec: ['#toast'] });
    act(t, 'open', { id }); act(t, 'mytimes', { id });
    const f0 = t.api.S.sheet.focus;
    act(t, 'dates', ctl(sheet(t), 'dates', { end: '0' })); act(t, 'sh-back');
    const f1 = t.api.S.sheet && t.api.S.sheet.type === 'person' ? t.api.S.sheet.focus : 'x';
    typed(t, 'tm-arr', '905', 'anjo-z5');
    act(t, 'dates', ctl(sheet(t), 'dates', { end: '1' }));
    const n0 = nPosts(t);
    t.api.closeSheet(); await tick();
    const held = t.api.S.sheet && t.api.S.sheet.type === 'person' && /🛬☀🌃\?/.test(toastTxt(t)) && nPosts(t) === n0 && /id="tm-half" data-sig="arr\|905"/.test(sheet(t));
    await tap(t, sheet(t), 'tmhalf', { end: 'arr', v: 'pm' }); t.api.closeSheet(); await until(() => /🛬21:05/.test(srv.read(id).responses['anjo-z5'].note)); await tick();
    check(f0 === 'tm-arr' && f1 === null && held && !t.api.S.sheet && srv.read(id).responses['anjo-z5'].note === '🛬21:05',
      'PIA-151 opened at her 🛬 time, a plain ‹ back from her day\'s calendar focuses nothing again (no keyboard on every back); "905" typed, then a close from the calendar on top goes back to her flight section and holds once (🛬☀🌃?, nothing sent); 🌃 21:05 picked, the close sends it', { f0, f1, held });
  }
  {
    // AC7 the board's times stay on their track: a booked arrival on the last day of the range is anchored at its bar's end, a booked
    // leave on the first day at its bar's start (never past the track's edge, never over the tail or the faces)
    const id = seedAs(DWX, (d) => { lock139(d); anjoIn({ available_from: '2026-11-09', booked: true, note: '🛬09:05 🛫18:30' })(d); d.responses['ashwin-p8'] = RESP('in', { member: 'ashwin-p8', origin: 'LAX', available_to: '2026-11-06', booked: true, note: '🛬07:15 🛫19:40' }); });
    const o = await boot136({ ls: org138(id) });
    act(o, 'open', { id });
    const h = screen(o), r = o.api.modelOf(id).range;
    const rowOf = (c) => (new RegExp('<div class="pb-row[^"]*"[^>]*><span class="who"><button class="facebtn" data-act="person" data-id="[^"]+" data-code="' + c + '"[\\s\\S]*?(?=<div class="pb-row|$)').exec(h) || [''])[0];
    const lab = (c, k) => (new RegExp('<span class="btm ' + k + '[^"]*" style="([^"]+)"').exec(rowOf(c)) || [])[1] || '';
    const aA = lab('anjo-z5', 'a'), aD = lab('anjo-z5', 'd'), sA = lab('ashwin-p8', 'a'), sD = lab('ashwin-p8', 'd');
    check(r && r.e >= '2026-11-09' && /^right:/.test(aA) && /^right:/.test(aD) && /^left:/.test(sA) && /^left:/.test(sD),
      'PIA-151 AC7 the board\'s time labels never run past the track: Anjo landing on its last day (11/9) reads her 09:05 right-aligned to her bar\'s end; Ashwin leaving on its first day reads his 19:40 left-aligned to his bar\'s start', { aA, aD, sA, sD, r });
  }

  // ═══ PIA-152: a smooth first look ═══
  section('PIA-152 a smooth first look: a v1 trip shows the family\'s faces everywhere (nothing written), ⤒ Update trip invites the organizer\'s tap, ⚙ shows the build');
  const STAND = /🦄|🍩|🐻/;   // the stand-in faces the unmigrated Thanksgiving showed before PIA-152 (Mom & Dad, the v1 "Me", Anjo)
  const migBtn = (h) => { const m = /<button class="ib edit( pulse)?" data-act="migrate" data-id="[^"]+" aria-label="Update trip" data-k="migrate"(?: style="animation-delay:-\d+ms")?>⤒<\/button>/.exec(h); return m ? (m[1] ? 'pulse' : 'still') : 'none'; };
  {
    // AC1 the unmigrated legacy Thanksgiving on its organizer's phone (he is its v1 "Me" at LAX) and on Mom's: 🌽 Mom & Dad, 💪 him,
    // 🗽 Anjo on the card, the trip view and its board, a person's sheet, P-face, the Family board, the Map, the Calendar and P-day
    const TG = seedAs(TGX), rec0 = JSON.stringify(srv.read(TG));
    const views = async (ls, me) => {
      const t = await boot136({ ls }), out = {};
      out.card = t.api.renderIdeas().html;
      act(t, 'open', { id: TG }); out.trip = screen(t);
      act(t, 'person', { id: TG, code: 'LGA' }); out.anjo = sheet(t); t.api.closeSheet();
      act(t, 'person', { id: TG, code: me }); out.mine = sheet(t); t.api.closeSheet();
      act(t, 'face', { id: TG }); out.face = sheet(t); t.api.closeSheet();
      act(t, 'back'); act(t, 'seg', { v: 'family' }); out.fam = t.api.renderFamily().html; act(t, 'seg', { v: 'ideas' });
      act(t, 'tab', { v: 'map' }); out.map = t.api.renderSelected('map', 'map').html;
      act(t, 'tab', { v: 'cal' }); out.cal = t.api.renderSelected('calendar', 'cal').html;
      act(t, 'calday', { id: TG, v: '2026-11-26' }); out.day = sheet(t); t.api.closeSheet();
      act(t, 'tab', { v: 'trips' });
      return { t, out, faces: t.api.modelOf(TG).members.map((x) => x.code + x.face).join(' ') };
    };
    const org = await views(lsOf([TG], { pialax_idea_keys_v1: keyOf([TG]), pialax_idea_me_v1: { [TG]: 'LAX' } }), 'LAX');
    const mom = await views(lsOf([TG], { pialax_idea_me_v1: { [TG]: 'PIA' } }), 'PIA');
    const bad = [], has3 = (h) => ['🌽', '💪', '🗽'].every((f) => h.indexOf(f) >= 0);
    [['organizer', org], ['Mom', mom]].forEach(([who, v]) => {
      Object.keys(v.out).forEach((k) => { if (STAND.test(v.out[k])) bad.push(who + ' ' + k + ': a stand-in face'); });
      ['card', 'trip', 'face', 'fam', 'map', 'day'].forEach((k) => { if (!has3(v.out[k])) bad.push(who + ' ' + k + ': not 🌽 💪 🗽'); });
      if (v.out.anjo.indexOf('🗽') < 0) bad.push(who + ' Anjo\'s sheet: no 🗽');
      if (v.faces !== 'PIA🌽 LAX💪 LGA🗽') bad.push(who + ' model: ' + v.faces);
    });
    check(bad.length === 0 && /class="tile legacy" data-act="pickface" data-id="[^"]+" data-code="LAX" aria-label="Person"/.test(mom.out.face) && shown(mom.out.face).indexOf('Me') < 0 && shown(org.out.trip + mom.out.trip).indexOf('Me') < 0 &&
      posts(org.t).length === 0 && posts(mom.t).length === 0 && JSON.stringify(srv.read(TG)) === rec0,
      'PIA-152 AC1 the unmigrated v1 Thanksgiving shows 🌽 Mom & Dad, 💪 the v1 "Me" at LAX and 🗽 Anjo everywhere, on the organizer\'s phone and on Mom\'s: the card, the trip view and its board, a person\'s sheet, P-face, the Family board, the Map and P-day; no stand-in face (🦄 🍩 🐻) anywhere; the "Me" is still a face with no word (never a pickable name); nothing is sent and the record is unchanged', bad);
    // after ⤒ Update trip (its own requests, through the real Worker) the faces are identical: no jump
    const wsend = async (reqs) => { const st = []; for (const q of reqs || []) { const r = await srv.fetch(W + q.path, { method: q.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q.body) }); st.push(r.status); } return st; };
    const d0 = srv.read(TG), mo = TM.migrateOptions(d0, null), st = await wsend(TM.migrateRequests(d0, KEY, { plan: mo.current, pin: mo.pin, labels: mo.labels }));
    await org.t.api.refreshAll(true); await tick(); org.t.api.render();
    act(org.t, 'open', { id: TG }); const after = screen(org.t), m2 = org.t.api.modelOf(TG);
    act(org.t, 'stage', { id: TG }); const more2 = sheet(org.t); org.t.api.closeSheet();
    check(st.length > 0 && st.every((s) => s === 200) && !m2.legacy && m2.members.map((x) => x.code + x.face).join(' ') === org.faces && migBtn(after) === 'none' && !/data-act="edit"/.test(after) && /data-act="edit"/.test(more2) && !STAND.test(after),
      'PIA-152 AC1 after ⤒ Update trip (its own requests, the real Worker) every face is what it was (🌽 💪 🗽: no jump); ⤒ leaves the nav and ✎ Edit is in ⋯ More (PIA-154)', { st, faces: m2.members.map((x) => x.code + x.face) });
  }
  {
    // AC2 the organizer's ⤒ on the v1 trip pulses once a visit (the share pulse's .pulse, one pulse long), until the trip is updated
    const TG = seedAs(TGX), DW = seedAs(DWX);
    const ls = () => lsOf([TG, DW], { pialax_idea_keys_v1: keyOf([TG, DW]), pialax_idea_me_v1: { [TG]: 'LAX', [DW]: 'ashwin-p8' } });
    const t = await boot136({ ls: ls() }), P = t.api.MIG_PULSE_MS, s = [];
    s.push(migBtn(t.api.renderIdeas().html));                                   // 0 the cards: no ⤒ there
    act(t, 'open', { id: TG }); s.push(migBtn(screen(t))); const first = screen(t); t.api.render(); s.push(migBtn(screen(t)));   // 1, 2 drawn again: still one pulse
    CLOCK = NOW + 1200; t.api.render(); const midway = screen(t);              // drawn again 1.2 s in: the new button carries on from 1.2 s in
    CLOCK = NOW + P + 1; s.push(migBtn(screen(t)));                             // 3 the pulse is over
    act(t, 'back'); act(t, 'open', { id: TG }); s.push(migBtn(screen(t)));      // 4 the same visit: not again
    act(t, 'back'); act(t, 'open', { id: DW }); const dw = screen(t); act(t, 'back');
    // a greyed "Update trip first" row (the organizer's, for Anjo) names ⤒ by its glyph, and points to it: ⤒ pulses once its sheet closes
    act(t, 'open', { id: TG }); act(t, 'person', { id: TG, code: 'LGA' });
    const pa = sheet(t), inB = ctl(pa, 'answer', { v: 'in' });
    const r0 = t.api.ACTS.answer(el0(inB, true)); s.push(migBtn(screen(t)));   // 5 under the sheet: not yet
    t.api.closeSheet(); s.push(migBtn(screen(t)));                               // 6 the sheet closed: ⤒ pulses
    CLOCK += P + 1; s.push(migBtn(screen(t)));                                  // 7 one pulse long
    // a tap on ⤒ takes the invitation: it pulses no more this visit
    act(t, 'person', { id: TG, code: 'LGA' }); t.api.ACTS.answer(el0(ctl(sheet(t), 'answer', { v: 'in' }), true)); t.api.closeSheet(); s.push(migBtn(screen(t)));   // 8 pointed again
    act(t, 'migrate', { id: TG }); const mig = t.api.S.sheet && t.api.S.sheet.type; t.api.closeSheet(); s.push(migBtn(screen(t)));   // 9 taken
    const spent = t.api.S.migPulse[TG]; CLOCK = 1; const spentEarly = t.api.migPulse(t.api.modelOf(TG));   // (taken, whatever the clock reads)
    CLOCK = NOW;
    // a new visit (the page opened again): it pulses again; a guest's phone (no key) has no ⤒; Mom's neither
    const t2 = await boot136({ ls: ls() }); act(t2, 'open', { id: TG }); s.push(migBtn(screen(t2)));   // 10
    const g = await boot136({ ls: lsOf([TG], { pialax_idea_me_v1: { [TG]: 'PIA' } }) }); act(g, 'open', { id: TG }); s.push(migBtn(screen(g)));   // 11
    const trip0 = screen(t2);
    check(eq(s, ['none', 'pulse', 'pulse', 'still', 'still', 'still', 'pulse', 'still', 'pulse', 'still', 'pulse', 'none']) && r0 === null && mig === 'migrate' &&
      migBtn(midway) === 'pulse' && /data-k="migrate" style="animation-delay:-1200ms">⤒</.test(midway) && !/animation-delay/.test(first) && spent === t.api.MIG_SPENT && typeof spent !== 'number' && spentEarly === null &&
      !/data-act="edit"|data-act="migrate"/.test(dw) && !/class="ib edit pulse"/.test(dw) &&
      /data-act="answer" data-v="in"[^>]*aria-disabled="true" data-why="1" aria-label="In, Update trip first" data-lbl="⤒ Update trip first"/.test(pa) && posts(t).length === 0,
      'PIA-152 AC2 the organizer\'s ⤒ on the v1 trip pulses (.pulse, as 📣) the first time its trip view is drawn in a visit, for one pulse (drawn again meanwhile, it carries on from where it was: 1.2 s in, a -1200ms delay, so a redraw never adds a second pulse); not again that visit; a greyed In ("⤒ Update trip first": ⤒ named by its glyph) points to it: ⤒ pulses again as that sheet closes; a tap on ⤒ (P-migrate) takes the invitation; a new visit pulses again; a guest\'s phone has no ⤒; ✎ on a v2 trip never pulses; nothing sent', s);
    // no new words: ⤒ is a glyph with the same label ("Update trip", its key's), pulsing or not; the trip view's words are the same
    CLOCK = NOW + P + 1; const still = screen(t2); CLOCK = NOW;
    check(eq(shown(trip0), shown(still)) && t.api.LEGEND.migrate[1] === 'Update trip' && /aria-label="Update trip" data-k="migrate">⤒</.test(trip0),
      'PIA-152 AC2 no word is added: the trip view says the same words while ⤒ pulses and after; its label stays "Update trip"', { words: shown(trip0) });
  }
  {
    // AC3 ⚙ shows the build as one number (#152: no word), from ONE constant, the newest ticket's number; the meta says the same
    const src = fs.readFileSync(APP, 'utf8'), decl = src.match(/\bvar BUILD = (\d+);/g) || [];
    const nums = fs.readdirSync(path.join(ROOT, 'scripts', 'messages')).map((f) => (/^PIA-(\d+)\.msg$/.exec(f) || [])[1]).filter(Boolean).map(Number);
    const newest = Math.max(...nums), meta = (/<meta name="pialax-build" content="(\d+)">/.exec(src) || [])[1];
    const t = await boot136({ ls: lsOf([]) });
    act(t, 'settings'); const gear = sheet(t);
    const tag = '<span class="tn bld" role="img" aria-label="Build ' + newest + '" data-lbl="Build">#' + newest + '</span>';
    check(decl.length === 1 && t.api.BUILD === newest && +meta === newest && /<meta name="pialax-version" content="2\.0\.0">\n<meta name="pialax-build" content="\d+">/.test(src) &&
      t.api.S.sheet && t.api.S.sheet.type === 'organizer' && gear.indexOf('<div class="ttlg">⚙ ' + tag + '</div>') >= 0 && shown(tag).length === 0 && (src.match(/>#' \+ BUILD \+ '</g) || []).length === 1,
      'PIA-152 AC3 ⚙ shows the build as a number only (#' + newest + ', no word) from the one BUILD constant, which is the newest ticket\'s number (scripts/messages/PIA-' + newest + '.msg: the next ticket must bump it) and agrees with <meta name="pialax-build"> beside pialax-version', { BUILD: t.api.BUILD, newest, meta, decl, gear: gear.slice(0, 300) });
    const how = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8') + fs.readFileSync(path.join(ROOT, 'RELEASE_V2.md'), 'utf8');
    check((how.match(/⚙ #NNN/g) || []).length >= 2 && /pialax-build/.test(how), 'PIA-152 AC3 CLAUDE.md and RELEASE_V2.md say how to check a phone\'s build (⚙ #NNN) against main');
  }

  // ═══ PIA-153: housekeeping in two taps, plan vs my days at a glance, old trips first-class ═══
  section('PIA-153 housekeeping in two taps (the card\'s stage disc → P-stage: ☆ 🗄 🗑), 👪 the plan vs my face my days (P-mine), ⤒ Update trip renames and closes back to the trip, a v1 trip\'s own flight section, one pulse at a time');
  const LOCKS = { userAgent: 'test-app', clipboard: { writeText: () => Promise.resolve() }, locks: { request: (n, o, f) => Promise.resolve().then(() => f({ name: n })) } };   // Web Locks, as a browser has them (P-migrate)
  {
    const cardOf = (h, id) => (new RegExp('<article class="card[^"]*" data-trip="' + id + '">[\\s\\S]*?</article>').exec(h) || [''])[0];
    const migc = (h) => { const m = /<button class="ib z migc( pulse)?" data-act="migcard" data-id="[^"]+" aria-label="Update trip" data-k="migrate"(?: style="animation-delay:-\d+ms")?>⤒<\/button>/.exec(h); return m ? (m[1] ? 'pulse' : 'still') : 'none'; };
    const keyP = (h) => /<button class="ib pulse" data-act="key"/.test(h) ? 'pulse' : /<button class="ib" data-act="key"/.test(h) ? 'still' : 'none';
    const TG = seedAs(TGX), DW = seedAs(DWX);
    const orgLs = () => lsOf([TG, DW], { pialax_idea_keys_v1: keyOf([TG, DW]), pialax_idea_me_v1: { [TG]: 'LAX', [DW]: 'ashwin-p8' } });
    // AC2 the card's stage disc → P-stage; 🗄 in the second tap
    const t = await boot136({ ls: orgLs(), rec: ['#toast'] }), list0 = t.api.renderIdeas().html, p0 = posts(t).length, P = t.api.MIG_PULSE_MS;
    const btnDW = /<button class="ib more z" data-act="stage" data-id="[^"]+" data-v="card" aria-label="More" data-k="more">⋯<\/button>/.test(cardOf(list0, DW)) && !/class="pip/.test(cardOf(list0, DW));
    t.api.ACTS.stage({ dataset: ctl(cardOf(list0, DW), 'stage') });
    const st0 = sheet(t), sType = t.api.S.sheet && t.api.S.sheet.type, hide = ctl(st0, 'hidehere', { id: DW }), named = ((/<span class="sttl wide" data-free>([^<]+)<\/span>/.exec(st0) || [])[1] || '').replace(/&amp;/g, '&') === t.api.modelOf(DW).title;
    t.api.ACTS.hidehere({ dataset: hide });
    const arch = (t.api.listRead().find((x) => x.id === DW) || {}).arch, closed1 = !t.api.S.sheet, toast1 = t.rec['#toast'].innerHTML;
    t.api.closeSheet();
    const active1 = t.api.activeItems().map((x) => x.id), list1 = t.api.renderIdeas().html;
    check(btnDW && !!ctl(cardOf(list0, TG), 'stage') && sType === 'stage' && named && !!hide && arch === true && closed1 && /🗄 ✓/.test(toast1) && !/data-act="undo"/.test(toast1) && active1.indexOf(DW) < 0 && active1.indexOf(TG) >= 0 && /data-act="shelf"/.test(list1) && posts(t).length === p0 &&
      /data-act="star"/.test(st0) && /<button class="mrowb bad" data-act="stagedrop" data-id="[^"]+"><span class="mg" aria-hidden="true">🗑<\/span>Remove for everyone<\/button>/.test(st0) && shown(st0).length <= 20,
      'PIA-153 AC2 / PIA-154 every card\'s ⋯ More is a button above the card\'s tap overlay (no stage disc); tap 1 opens P-stage (its header names the trip, free: the card is under the sheet; ☆ Pin, 🗄 Hide on my phone, the organizer\'s 🗑 Remove for everyone: PIA-155), tap 2 (🗄) puts the trip on this phone\'s shelf and closes the sheet, 🗄 ✓ (a second tap never quietly undoes it); nothing is sent', { btnDW, sType, named, arch, closed1, toast1, active1 });
    t.api.ACTS.stage({ dataset: { id: DW, v: 'card' } }); t.api.ACTS.hidehere({ dataset: { id: DW } });
    const closed2 = !t.api.S.sheet, toast2 = t.rec['#toast'].innerHTML;
    check(closed2 && /✓/.test(toast2) && t.api.activeItems().some((x) => x.id === DW) && !(t.api.listRead().find((x) => x.id === DW) || {}).arch, 'PIA-153 AC2 🗄 again (P-stage from the shelf card) brings the trip back, as the shelf always did, and closes the sheet (✓)', { closed2, toast2 });
    // 🗑 from the list: P-drop over P-stage (its one confirm), the real Worker, ↩ in the toast
    const td = await boot136({ ls: orgLs(), rec: ['#toast'] });
    td.api.ACTS.stage({ dataset: { id: DW } });
    td.api.ACTS.stagedrop(el0(ctl(sheet(td), 'stagedrop', { id: DW })));
    const dropType = td.api.S.sheet && td.api.S.sheet.type, back = td.api.S.sheet && td.api.S.sheet.back && td.api.S.sheet.back.type;
    const r = await td.api.ACTS.dropyes(), dd = srv.read(DW), toastUndo = /🗑/.test(td.rec['#toast'].innerHTML) && /data-act="undo"/.test(td.rec['#toast'].innerHTML);
    const shelfNow = td.api.shelfItems().map((x) => x.id), u = await td.api.ACTS.undo(), du = srv.read(DW);
    check(dropType === 'drop' && back === 'stage' && r && r.ok && dd.decision.stage === 'dropped' && !td.api.S.sheet && toastUndo && shelfNow.indexOf(DW) >= 0 && u && u.ok && du.decision.stage === 'proposed',
      'PIA-153 AC2 the organizer\'s 🗑 in P-stage (from the card) opens P-drop over it (‹ to P-stage): 🗑 Drop drops the trip for everyone through the real Worker, both sheets close, the card is on the shelf, and ↩ in the toast puts it back', { dropType, back, stage: dd.decision.stage, after: du.decision.stage });
    // PIA-155: on the v1 trip 🗑 is live (a decision alone goes on any record: the PIA-155 section removes it through the real Worker);
    // it waits, saying "⤒ Update trip first" and pointing to ⤒ (the card's ⤒ pulses again once the sheet closes), only while a ⤒
    // update of that trip is half done on this phone (its journal resumes it)
    const tl = await boot136({ ls: orgLs() }), h0 = tl.api.renderIdeas().html;
    CLOCK = NOW + P + 1; const h1 = tl.api.renderIdeas().html;
    tl.api.ACTS.stage({ dataset: { id: TG } }); const sl0 = sheet(tl), dl0 = ctl(sl0, 'stagedrop', { id: TG });
    tl.api.ACTS.stagedrop(el0(dl0)); const live = tl.api.S.sheet && tl.api.S.sheet.type; tl.api.closeSheet();
    const half = { v: 1, history: {}, migrations: { [TG]: { original: srv.read(TG), base: srv.read(TG), steps: [], at: 0, done: false } } };
    tl.ls.setItem('pialax_transfer_v1', JSON.stringify(half));
    tl.api.ACTS.stage({ dataset: { id: TG } }); const sl = sheet(tl), dl = ctl(sl, 'stagedrop', { id: TG });
    const rr = tl.api.ACTS.stagedrop(el0(dl, true)), still = tl.api.S.sheet && tl.api.S.sheet.type;
    tl.api.closeSheet(); const h2 = tl.api.renderIdeas().html;
    CLOCK = NOW;
    check(migc(cardOf(h0, TG)) === 'pulse' && migc(cardOf(h0, DW)) === 'none' && migc(cardOf(h1, TG)) === 'still' &&
      dl0 && !dl0.why && /<button class="mrowb bad" data-act="stagedrop" data-id="[^"]+"><span class="mg" aria-hidden="true">🗑<\/span>Remove for everyone<\/button>/.test(sl0) && live === 'drop' &&
      dl && dl.why === '1' && dl.lbl === '⤒ Update trip first' && /aria-label="Remove for everyone, Update trip first"/.test(sl) && rr === null && still === 'stage' &&
      migc(cardOf(h2, TG)) === 'pulse' && posts(tl).length === 0,
      'PIA-153 AC2/AC4b + PIA-155 on the v1 trip P-stage\'s 🗑 Remove for everyone is live (one tap opens P-drop); while a ⤒ update of it is half done on this phone it is greyed: a tap says "⤒ Update trip first", nothing is sent, and its card\'s ⤒ pulses again once the sheet closes', { h0: migc(cardOf(h0, TG)), h1: migc(cardOf(h1, TG)), h2: migc(cardOf(h2, TG)), dl, live });
    // one pulse at a time on the list: while the card's ⤒ pulses, ⓘ (first run) and the list share wait; after it, they pulse
    check(keyP(h0) === 'still' && /class="ib share"/.test(h0) && !/class="ib share dot"/.test(h0) && keyP(h1) === 'pulse' && /class="ib share dot"/.test(h1),
      'PIA-153 AC5 one pulse at a time: on the list ⓘ\'s first-run pulse and the list share wait while the cards\' ⤒ pulses, and pulse once it is over', { k0: keyP(h0), k1: keyP(h1) });
    // a guest's P-stage has no 🗑; a dropped trip's has ↩ on the organizer's phone
    const g = await boot136({ ls: lsOf([TG], { pialax_idea_me_v1: { [TG]: 'PIA' } }) }), gl = g.api.renderIdeas().html;
    g.api.ACTS.stage({ dataset: { id: TG } }); const gs = sheet(g);
    const DR = seedAs(DWX, (d) => { d.decision = { stage: 'dropped' }; });
    const tr = await boot136({ ls: lsOf([DR], { pialax_idea_keys_v1: keyOf([DR]), pialax_idea_me_v1: { [DR]: 'ashwin-p8' } }) });
    tr.api.ACTS.stage({ dataset: { id: DR } }); const rs = sheet(tr);
    check(!/data-act="stagedrop"/.test(gs) && /data-act="hidehere"/.test(gs) && migc(gl) === 'none' && /<button class="mrowb" data-act="restore" data-id="[^"]+"><span class="mg" aria-hidden="true" data-k="restore">↩<\/span>Restore<\/button>/.test(rs) && !/data-act="stagedrop"/.test(rs),
      'PIA-153 AC2 Mom\'s phone (no key): her card has no ⤒ and her P-stage ☆ 🗄 but no 🗑; on the organizer\'s phone a dropped trip\'s P-stage offers ↩');
    // AC4b the card's ⤒: one tap to the trip with P-migrate open over it (its invitation taken, here and on the list)
    const tm = await boot136({ ls: orgLs() }), hm = tm.api.renderIdeas().html;
    tm.api.ACTS.migcard({ dataset: ctl(cardOf(hm, TG), 'migcard') });
    check(tm.api.S.trip === TG && tm.api.S.tab === 'trips' && tm.api.S.sheet && tm.api.S.sheet.type === 'migrate' && tm.api.S.migPulse[TG] === tm.api.MIG_SPENT && tm.api.S.migPulse[tm.api.MIG_LIST] === tm.api.MIG_SPENT && posts(tm).length === 0,
      'PIA-153 AC4b the organizer\'s v1 trip says so on its own card (⤒, labelled "Update trip", no word): one tap opens the trip with ⤒ Update trip over it');
    // one pulse at a time on the trip view: while ⤒ pulses, ⓘ and 📣 Share wait
    const tv = await boot136({ ls: orgLs() }); act(tv, 'open', { id: TG }); const v0 = screen(tv);
    CLOCK = NOW + P + 1; const v1 = screen(tv); CLOCK = NOW;
    check(/data-act="migrate"[^>]*>⤒/.test(v0) && /class="ib edit pulse" data-act="migrate"/.test(v0) && keyP(v0) === 'still' && !/share dot" data-act="tshare"/.test(v0) && /data-act="tshare"/.test(v0) &&
      keyP(v1) === 'pulse' && /share dot" data-act="tshare"/.test(v1) && !/class="ib edit pulse"/.test(v1),
      'PIA-153 AC5 one pulse at a time on the v1 trip view: ⤒ pulses alone; ⓘ (first run) pulses and the share\'s dot shows once its pulse is over');
  }
  {
    // AC3 / AC4c / AC4d ⤒ Update trip renames in its one update, shows which plan it will save, and closes back to the trip: 🔒 ✓
    const CH = seedAs(TGX, (d) => { d.idea.title = 'Chicago trip'; });
    const tc = await boot136({ ls: lsOf([CH], { pialax_idea_keys_v1: keyOf([CH]), pialax_idea_me_v1: { [CH]: 'LAX' } }), navigator: LOCKS, rec: ['#toast'] });
    act(tc, 'open', { id: CH }); act(tc, 'migrate', { id: CH });
    const m0 = sheet(tc), plans = (h) => [...h.matchAll(/<button class="btn wide mplanb" data-act="migplan" data-v="(\w+)" aria-pressed="(\w+)">/g)].map((x) => x[1] + ':' + x[2]);
    const pl0 = plans(m0), title0 = /<input id="mig-title" aria-label="Trip name" placeholder="Trip name" maxlength="\d+" autocomplete="off" value="Chicago trip">/.test(m0) && /data-act="migscene"/.test(m0);
    act(tc, 'migplan', { v: 'span' }); act(tc, 'migscene', { v: '0' }); typed(tc, 'mig-title', 'Thanksgiving');
    const m1 = sheet(tc), pl1 = plans(m1), mark = /aria-pressed="true"><span class="mpk" aria-hidden="true">✓<\/span>Travelers/.test(m1);
    act(tc, 'migpage', { v: '1' }); act(tc, 'migpage', { v: '1' });
    const q0 = posts(tc).length, rr = await tc.api.ACTS.migsav(); await tick();
    const d = srv.read(CH), ups = posts(tc).slice(q0).filter((q) => q.path === '/idea/update'), v = screen(tc), toastM = tc.rec['#toast'].innerHTML;
    act(tc, 'stage', { id: CH }); const mst = sheet(tc); tc.api.closeSheet();
    check(title0 && eq(pl0, ['current:true', 'span:false']) && eq(pl1, ['current:false', 'span:true']) && mark && rr && rr.ok && ups.length === 1 && ups[0].body.idea.title === '🦃 Thanksgiving' && d.idea.title === '🦃 Thanksgiving' &&
      !TM.docLegacy(d) && d.decision.stage === 'chosen' && tc.api.S.trip === CH && /🔒 ✓/.test(toastM) &&
      /<h2 class="ttl"><span data-free>🦃 Thanksgiving<\/span>/.test(v) && /<div class="sline" role="img" aria-label="Stage 3 of 5, Dates set"[\s\S]*?<span class="sword">Dates set<\/span><\/div>/.test(mst) && /data-k="lock">🔒<\/span><\/span><\/button>/.test(v) && /data-act="edit"/.test(mst) && !/data-act="migrate"/.test(v),
      'PIA-153 AC3/AC4c/AC4d ⤒ Update trip shows the trip\'s picture and name (P-edit\'s controls): "Chicago trip" → 🦃 "Thanksgiving" goes in the one /idea/update (the real Worker); Current / Travelers read which plan is chosen (aria-pressed, the chosen one ✓ and filled); once it lands the sheet closes back to the trip, the toast says 🔒 ✓, and the trip reads 🔒 Dates set (its pill\'s 🔒 and its stage) with ✎', { pl0, pl1, title: d.idea.title, toast: tc.rec['#toast'].innerHTML });
    // a name cleared is asked for (page 1, its field), nothing is sent
    const C2 = seedAs(TGX, (d2) => { d2.idea.title = 'Chicago trip'; });
    const tx = await boot136({ ls: lsOf([C2], { pialax_idea_keys_v1: keyOf([C2]), pialax_idea_me_v1: { [C2]: 'LAX' } }), navigator: LOCKS });
    act(tx, 'open', { id: C2 }); act(tx, 'migrate', { id: C2 }); typed(tx, 'mig-title', ''); act(tx, 'migpage', { v: '1' }); act(tx, 'migpage', { v: '1' });
    const qx = posts(tx).length; await tx.api.ACTS.migsav(); await tick();
    check(posts(tx).length === qx && tx.api.S.sheet && tx.api.S.sheet.type === 'migrate' && tx.api.S.sheet.local.page === 0 && TM.docLegacy(srv.read(C2)) && srv.read(C2).idea.title === 'Chicago trip',
      'PIA-153 AC3 a name cleared in the review is asked for first (back on page 1, its field): nothing is sent');
  }
  {
    // AC4a a v1 trip, Anjo's own phone: the v2 flight section ([✈ Book ↗ | 🎫], then her times) through the existing write path
    const TA = seedAs(TGX);
    const ta = await boot136({ ls: lsOf([TA], { pialax_idea_me_v1: { [TA]: 'LGA' } }), rec: ['#toast'] });
    act(ta, 'open', { id: TA }); act(ta, 'person', { id: TA, code: 'LGA' });
    const pa = sheet(ta), hasBook = /aria-label="Google Flights" data-k="gf">✈↗<\/a>/.test(pa) && /data-act="mybook"/.test(pa), q0 = posts(ta).length;   // (PIA-154: ✈↗ until the v2 plan is 🔒, then ✈ Book ↗)
    const rb = await ta.api.ACTS.mybook({ dataset: ctl(pa, 'mybook') }), pb = sheet(ta), r1 = srv.read(TA).responses.LGA;
    typed(ta, 'tm-arr', '09:05', 'LGA'); typed(ta, 'tm-dep', '18:30', 'LGA');
    ta.api.closeSheet(); await until(() => !(ta.api.PEND[TA] > 0)); await tick();
    const r2 = srv.read(TA).responses.LGA, pq = posts(ta).slice(q0).map((q) => q.path);
    check(hasBook && rb && rb.ok && r1.booked && /id="tm-arr" data-code="LGA"/.test(pb) && r2.booked && r2.note === '🛬09:05 🛫18:30 Arriving late, PTO approved' && TM.docLegacy(srv.read(TA)) && eq(pq, ['/idea/booked', '/idea/respond']) &&
      ta.api.modelOf(TA).stage === 'booking',
      'PIA-153 AC4a the family\'s v1 trip on Anjo\'s phone: her flight section is the v2 one, [✈ Book ↗ | 🎫]; her 🎫 (/idea/booked) and then her 🛬 09:05 / 🛫 18:30 (one complete /idea/respond) go through the existing write path onto the v1 record, which stays v1 until ⤒ Update trip', { pq, note: r2.note });
    // the organizer on the same kind of trip: his own [Book | 🎫]; on Anjo's sheet ⤒ in its header, his 🎫 for her and her days greyed with
    // "⤒ Update trip first" (nothing sent); in P-dates his own days, the trip's half greyed with the same words
    const TB = seedAs(TGX);
    const to = await boot136({ ls: lsOf([TB], { pialax_idea_keys_v1: keyOf([TB]), pialax_idea_me_v1: { [TB]: 'LAX' } }) });
    act(to, 'open', { id: TB }); act(to, 'person', { id: TB, code: 'LAX' }); const pm = sheet(to); to.api.closeSheet();
    act(to, 'person', { id: TB, code: 'LGA' }); const po = sheet(to), tk = ctl(po, 'booked', { code: 'LGA' }), day = ctl(po, 'dates', { code: 'LGA', end: '0' });
    const q1 = posts(to).length, rk = to.api.ACTS.booked(el0(tk, true)), rd = to.api.ACTS.dates(el0(day, true)), stillP = to.api.S.sheet && to.api.S.sheet.type;
    to.api.closeSheet(); act(to, 'dates', { id: TB }); const pd = sheet(to), tg0 = to.api.S.sheet.local.target, trp = ctl(pd, 'dtarget', { v: 'trip' });
    (to.api.S.migPulse || (to.api.S.migPulse = {}))[TB] = to.api.MIG_SPENT;   // (⤒'s invitation taken: the greyed half points to it again)
    to.api.ACTS.dtarget(el0(trp, true)); const tg1 = to.api.S.sheet.local.target, pointed = !(TB in to.api.S.migPulse); to.api.closeSheet();
    check(/data-act="mybook"/.test(pm) && /aria-label="Update trip" data-k="migrate">⤒<\/button><button class="ib" data-act="sh-close"/.test(po) && tk && tk.why === '1' && tk.lbl === '⤒ Update trip first' && rk === null &&
      day && day.lbl === '⤒ Update trip first' && rd === null && stillP === 'person' && /data-act="answer"[^>]*data-lbl="⤒ Update trip first"/.test(po) && posts(to).length === q1 &&
      tg0 === 'me' && trp && trp.lbl === '⤒ Update trip first' && tg1 === 'me' && pointed,
      'PIA-153 AC4a/AC5 the organizer on the v1 trip: his own flight section has [✈ Book ↗ | 🎫]; on Anjo\'s, ⤒ sits in the sheet\'s header and his 🎫 for her, her days and the answer row are greyed, each saying "⤒ Update trip first"; the pill opens his own days, its 🦃 half greyed with the same words, a tap pointing to ⤒ (it pulses again) (he never believes he moved the trip); nothing is sent', { tk, day, trp, tg0, tg1, pointed });
  }
  {
    // AC1 👪 the group's plan on the trip page's pill; my own days with my face; ⚠ when they differ; one tap: P-mine
    const both = (d) => { d.responses['ashwin-p8'] = RESP('in', { member: 'ashwin-p8', origin: 'LAX', available_from: '2026-11-06', available_to: '2026-11-10' }); d.responses['anjo-z5'] = RESP('in', { member: 'anjo-z5', origin: 'LGA', available_from: '2026-11-05', available_to: '2026-11-08' }); };
    const DM = seedAs(DWX, both);
    const tj = await boot136({ ls: lsOf([DM], { pialax_idea_me_v1: { [DM]: 'anjo-z5' } }), rec: ['#toast'] });
    act(tj, 'open', { id: DM }); const vj = screen(tj);
    const pill = /data-lbl="Dates"><span class="inner"><span class="dt"><span data-k="plan"><span class="g">👪<\/span><\/span>11\/6–11\/9<\/span>/.test(vj);
    const line = /<div class="mine"><button class="minebtn" data-act="mine" data-id="[^"]+" style="--pc:var\(--p\d\)" aria-label="My days 11\/5–11\/8, not the plan" data-lbl="My days" data-k="mine"><span class="mf" aria-hidden="true"><span class="av s28/.test(vj) && /<span class="tn">11\/5–11\/8<\/span> <span class="w" data-k="notplan">⚠<\/span><\/button><\/div>/.test(vj);
    act(tj, 'mine', ctl(vj, 'mine')); const sm = sheet(tj), smType = tj.api.S.sheet && tj.api.S.sheet.type;
    const rows = /<span class="mvg" data-k="plan">👪<\/span><span class="tn">11\/6–11\/9<\/span>/.test(sm) && /data-k="mine"><span class="av s28[^"]*"[^>]*><span class="f">🗽<\/span><\/span><\/span><span class="tn">11\/5–11\/8<\/span>/.test(sm);
    const L = tj.api.LEGEND;
    check(pill && line && smType === 'mine' && rows && /data-act="minefollow"[^>]*><span data-k="follow">👪<\/span> Follow plan/.test(sm) && /data-act="minekeep"/.test(sm) && !/data-act="mineplan"/.test(sm) && shown(sm).length <= 20 &&
      L.plan[0] === '👪' && L.plan[1] === 'Group plan' && L.mine[1] === 'My days' && L.notplan[1] === 'Not the plan' && posts(tj).length === 0,
      'PIA-153 AC1 Anjo\'s trip page: the pill is 👪 the group\'s plan (11/6–11/9), her own 11/5–11/8 carry her face (🗽, not a bare colour line) and ⚠ (off the plan); one tap opens P-mine (≤20 words): 👪 11/6–11/9 and 🗽 11/5–11/8, Follow plan and Keep mine (no Make plan: not her trip to move); the key (LEGEND, what ⓘ lists for the trip page: test-words\' keyCheck) carries 👪 "Group plan", the face line "My days" and ⚠ "Not the plan"', { pill, line, rows, words: shown(sm) });
    const fr = await tj.api.ACTS.minefollow({ dataset: ctl(sm, 'minefollow') }); await tick();
    const ra = srv.read(DM).responses['anjo-z5'], vj2 = screen(tj), tf = tj.rec['#toast'].innerHTML;
    check(fr && fr.ok && !tj.api.S.sheet && ra.available_from === '' && ra.available_to === '' && ra.status === 'in' && !/data-act="mine"/.test(vj2) && /🗓✓/.test(tf) && /data-act="undo"/.test(tf) && eq(posts(tj).map((q) => q.path), ['/idea/respond']),
      'PIA-153 AC1 Follow plan is the existing follow-plan write: one complete answer (In kept, both ends blank) through the real Worker; she follows the plan and her line is gone (🗓✓, with ↩)');
    // (fix pass) ↩ in Follow plan's toast puts her own days back: one complete answer, her 11/5–11/8 and her ⚠ line again
    const ru = await tj.api.ACTS.undo(); await tick();
    const rb = srv.read(DM).responses['anjo-z5'], vj3 = screen(tj);
    check(ru && ru.ok && rb.available_from === '2026-11-05' && rb.available_to === '2026-11-08' && rb.status === 'in' && /aria-label="My days 11\/5–11\/8, not the plan"/.test(vj3) && eq(posts(tj).map((q) => q.path), ['/idea/respond', '/idea/respond']),
      'PIA-153 AC1 ↩ after Follow plan puts her own days back (one complete answer through the real Worker, as Make plan\'s ↩ puts the plan back): a mis-tap never silently discards them', { ru: ru && ru.code, rb });
    // …and ↩ never overrides a 🎫 that landed meanwhile: held, 🎫⚠, nothing sent
    act(tj, 'mine', { id: DM }); const f2 = await tj.api.ACTS.minefollow({ dataset: ctl(sheet(tj), 'minefollow') }); await tick();
    const bk = clone(srv.read(DM)); bk.responses['anjo-z5'].booked = true; bk.responses['anjo-z5'].booked_at = '2026-10-16T00:00:00.000Z'; srv.write(bk);
    const qh = posts(tj).length, rh = await tj.api.ACTS.undo(); await tick();
    check(f2 && f2.ok && rh && rh.held && rh.code === 'booked' && posts(tj).length === qh && /✈⚠/.test(tj.rec['#toast'].innerHTML) && srv.read(DM).responses['anjo-z5'].available_from === '',
      'PIA-153 AC1 ↩ after Follow plan reads the trip first: once she has booked (another phone) it is held, says 🎫⚠ and sends nothing (a booked traveler\'s days stay as booked)', rh);
    // Keep mine: nothing sent; the ⚠ rests on this phone while the plan and her days stay as they are
    const DK = seedAs(DWX, both), tk = await boot136({ ls: lsOf([DK], { pialax_idea_me_v1: { [DK]: 'anjo-z5' } }) });
    const cardDK = () => (new RegExp('<article class="card[^"]*" data-trip="' + DK + '">[\\s\\S]*?</article>').exec(tk.api.renderIdeas().html) || [''])[0];
    const card0 = cardDK();
    act(tk, 'open', { id: DK }); act(tk, 'mine', { id: DK }); tk.api.ACTS.minekeep({ dataset: { id: DK } });
    const vk = screen(tk), kept = tk.api.uiRead().kept, card1 = cardDK();
    const offW = (c) => /data-k="warn" data-lbl="Off plan">⚠/.test(c);
    check(!tk.api.S.sheet && posts(tk).length === 0 && !/data-act="mine"/.test(vk) && !/data-k="notplan"/.test(vk) && kept && kept[DK] === '2026-11-06|2026-11-09|2026-11-05|2026-11-08' &&
      offW(card0) && !offW(card1),
      'PIA-153 AC1 Keep mine sends nothing: its ⚠ is quiet on this phone (PIA-154: the line, there only while the days are off the plan and not kept, goes; the card\'s ⚠ with it)', { card0: offW(card0), card1: offW(card1) });
    // (fix pass) …only while both stay as they are: her own start moved on another phone (11/5 → 11/4): ⚠ is back; her days back
    // to the ones kept: quiet again; the plan moved (11/6 → 11/7): ⚠ is back, on the line and the card
    const other = async (f) => { const d = clone(srv.read(DK)); f(d); srv.write(d); await tk.api.refresh(DK); await tk.api.refresh(DK); await tick(); return screen(tk); };
    const k1 = await other((d) => { d.responses['anjo-z5'].available_from = '2026-11-04'; });
    const k2 = await other((d) => { d.responses['anjo-z5'].available_from = '2026-11-05'; });
    const k3 = await other((d) => { d.idea.dates.departure = '2026-11-07'; });
    const card3 = cardDK();
    check(/data-k="notplan">⚠/.test(k1) && /aria-label="My days 11\/4–11\/8, not the plan"/.test(k1) && !/data-k="notplan"/.test(k2) && !/data-act="mine"/.test(k2) && /data-k="notplan">⚠/.test(k3) && offW(card3) && posts(tk).length === 0,
      'PIA-153 AC1 Keep mine quiets ⚠ only for the days it was said for: her own start moved elsewhere → ⚠ again; back to the kept days → quiet; the plan moved → ⚠ again (the line and the card)', { k1: /notplan/.test(k1), k2: /notplan/.test(k2), k3: /notplan/.test(k3) });
    // the organizer: Make plan (his own days become the plan, the plan move P-dates makes; ↩ in the toast)
    const DO = seedAs(DWX, both), torg = await boot136({ ls: lsOf([DO], { pialax_idea_keys_v1: keyOf([DO]), pialax_idea_me_v1: { [DO]: 'ashwin-p8' } }), rec: ['#toast'] });
    act(torg, 'open', { id: DO }); act(torg, 'mine', { id: DO }); const so = sheet(torg);
    const mp = await torg.api.ACTS.mineplan(el0(ctl(so, 'mineplan'))), dO = srv.read(DO);
    check(/data-act="mineplan"[^>]*><span data-k="plan">👪<\/span> Make plan/.test(so) && /data-act="minefollow"/.test(so) && shown(so).length <= 20 && mp && mp.ok && eq(TM.docPlan(dO), { s: '2026-11-06', e: '2026-11-10' }) && TM.parseNotes(dO.idea.notes).pin === '2026-11-08' &&
      dO.responses['anjo-z5'].available_from === '2026-11-05' && !torg.api.S.sheet && /👪 11\/6–11\/10/.test(torg.rec['#toast'].innerHTML) && /data-act="undo"/.test(torg.rec['#toast'].innerHTML) && !/data-act="mine"/.test(screen(torg)),
      'PIA-153 AC1 the organizer\'s P-mine adds Make plan: his own 11/6–11/10 become the plan in one organizer write (📌 11/8 kept, Anjo\'s own days untouched), ↩ in the toast; his line is gone (his days are the plan)', { plan: TM.docPlan(dO) });
    // …with someone booked, its ⚠🎫 confirm first (and the booked traveler pinned before the move); 🔒: greyed, "Dates locked"
    const DB = seedAs(DWX, (d) => { both(d); d.responses['anjo-z5'] = RESP('in', { member: 'anjo-z5', origin: 'LGA', booked: true, booked_at: '2026-10-16T00:00:00.000Z' }); });
    const tb = await boot136({ ls: lsOf([DB], { pialax_idea_keys_v1: keyOf([DB]), pialax_idea_me_v1: { [DB]: 'ashwin-p8' } }) });
    act(tb, 'open', { id: DB }); act(tb, 'mine', { id: DB });
    const a1 = await tb.api.ACTS.mineplan(el0(ctl(sheet(tb), 'mineplan'))), armedH = sheet(tb), qa = posts(tb).length;
    const a2 = await tb.api.ACTS.mineplan(el0(ctl(armedH, 'mineplan'))), dB = srv.read(DB), pb = posts(tb).slice(qa).map((q) => q.path);
    const DL = seedAs(DWX, (d) => { both(d); chosenAt(d, '2026-11-06', '2026-11-09', 'RDU'); });
    const tlk = await boot136({ ls: lsOf([DL], { pialax_idea_keys_v1: keyOf([DL]), pialax_idea_me_v1: { [DL]: 'ashwin-p8' } }) });
    act(tlk, 'open', { id: DL }); act(tlk, 'mine', { id: DL }); const sk = sheet(tlk), lk = ctl(sk, 'mineplan'), ql = posts(tlk).length, lr = await tlk.api.ACTS.mineplan(el0(lk, true));
    check(a1 === null && qa === 0 && /data-act="mineplan"[^>]*aria-label="Confirm, someone booked" data-lbl="Confirm">⚠✈×1 <span class="cw">Confirm<\/span>/.test(armedH) && a2 && a2.ok && eq(pb, ['/idea/respond', '/idea/update']) &&
      dB.responses['anjo-z5'].available_from === '2026-11-06' && dB.responses['anjo-z5'].available_to === '2026-11-09' && eq(TM.docPlan(dB), { s: '2026-11-06', e: '2026-11-10' }) &&
      lk && lk.lbl === 'Dates locked' && lk.why === '1' && lr === null && posts(tlk).length === ql,
      'PIA-153 AC1 Make plan keeps the plan move\'s guards: with Anjo booked the first tap asks ⚠🎫×1 Confirm and sends nothing, the second moves the plan with her booked days pinned first (her 11/6–11/9 kept); while 🔒 it is greyed and says "Dates locked"', { pb, anjo: dB.responses['anjo-z5'] });
    // (fix pass) a booking that lands on another phone after the sheet was drawn: Follow plan (Anjo booked meanwhile) is held, 🎫⚠ says
    // why, nothing is sent and her days stay hers (no ⚠ ↻ that could never go); Make plan (nobody booked when drawn, Anjo meanwhile) is
    // held too and asks its ⚠🎫 confirm first
    const late = (id) => { const d = clone(srv.read(id)); d.responses['anjo-z5'].booked = true; d.responses['anjo-z5'].booked_at = '2026-10-16T00:00:00.000Z'; srv.write(d); };
    const DF = seedAs(DWX, both), tfo = await boot136({ ls: lsOf([DF], { pialax_idea_me_v1: { [DF]: 'anjo-z5' } }), rec: ['#toast'] });
    act(tfo, 'open', { id: DF }); act(tfo, 'mine', { id: DF }); const sfo = sheet(tfo); late(DF);
    const qf = posts(tfo).length, rfo = await tfo.api.ACTS.minefollow({ dataset: ctl(sfo, 'minefollow') }); await tick();
    const Lf = tfo.api.S.sheet && tfo.api.S.sheet.local, af = srv.read(DF).responses['anjo-z5'];
    const DP = seedAs(DWX, both), tpo = await boot136({ ls: lsOf([DP], { pialax_idea_keys_v1: keyOf([DP]), pialax_idea_me_v1: { [DP]: 'ashwin-p8' } }) });
    act(tpo, 'open', { id: DP }); act(tpo, 'mine', { id: DP }); const spo = sheet(tpo); late(DP);
    const qp = posts(tpo).length, rpo = await tpo.api.ACTS.mineplan(el0(ctl(spo, 'mineplan'))); await tick();
    const Lp = tpo.api.S.sheet && tpo.api.S.sheet.local;
    check(rfo && rfo.held && rfo.code === 'booked' && posts(tfo).length === qf && /✈⚠/.test(tfo.rec['#toast'].innerHTML) && Lf && Lf.failed !== 'follow' && af.available_from === '2026-11-05' && af.available_to === '2026-11-08' &&
      /data-act="mineplan"/.test(spo) && !/⚠✈/.test(spo) && rpo && rpo.held && rpo.code === 'booked' && posts(tpo).length === qp && Lp && Lp.armed === 'plan' && /⚠✈×1/.test(sheet(tpo)) && eq(TM.docPlan(srv.read(DP)), { s: '2026-11-06', e: '2026-11-09' }),
      'PIA-153 AC1 a 🎫 that lands after P-mine was drawn holds its write: Follow plan says 🎫⚠ and sends nothing (her days stay hers, no dead ↻); Make plan sends nothing and asks ⚠🎫×1 Confirm first', { rfo, rpo, armed: Lp && Lp.armed });
    // booked, my days stay mine: no Follow plan; the organizer of a v1 trip: Follow plan, no Make plan
    const DBk = seedAs(DWX, (d) => { both(d); d.responses['anjo-z5'].booked = true; d.responses['anjo-z5'].booked_at = '2026-10-16T00:00:00.000Z'; });
    const tbk = await boot136({ ls: lsOf([DBk], { pialax_idea_me_v1: { [DBk]: 'anjo-z5' } }) }); act(tbk, 'open', { id: DBk }); act(tbk, 'mine', { id: DBk }); const sbk = sheet(tbk);
    const TV = seedAs(TGX), tvv = await boot136({ ls: lsOf([TV], { pialax_idea_keys_v1: keyOf([TV]), pialax_idea_me_v1: { [TV]: 'LAX' } }) });
    act(tvv, 'open', { id: TV }); const vv = screen(tvv); act(tvv, 'mine', { id: TV }); const svv = sheet(tvv);
    // (fix pass: Make plan is there on the v1 trip, greyed: a tap says "⤒ Update trip first" and points to ⤒, as the 🎫 and rows do)
    const mpv = ctl(svv, 'mineplan'), Pm = tvv.api.S.migPulse || (tvv.api.S.migPulse = {}); Pm[TV] = tvv.api.MIG_SPENT; Pm[tvv.api.MIG_LIST] = tvv.api.MIG_SPENT;
    const qv = posts(tvv).length, rv = tvv.api.ACTS.mineplan(el0(mpv, true));
    check(!/data-act="minefollow"/.test(sbk) && /data-act="minekeep"/.test(sbk) && /data-k="booked">✈/.test(sbk) &&
      /data-lbl="Dates"><span class="inner"><span class="dt"><span data-k="plan"><span class="g">👪<\/span><\/span>11\/25–11\/29/.test(vv) && /aria-label="My days 11\/20–11\/29, not the plan"/.test(vv) && /data-act="minefollow"/.test(svv) &&
      /<button class="btn wide dis" data-act="mineplan" data-id="[^"]+" aria-disabled="true" data-why="1" aria-label="Make plan, Update trip first" data-lbl="⤒ Update trip first"><span data-k="plan">👪<\/span> Make plan<\/button>/.test(svv) &&
      rv === null && posts(tvv).length === qv && tvv.api.S.sheet && tvv.api.S.sheet.type === 'mine' && !(TV in tvv.api.S.migPulse) && !(tvv.api.MIG_LIST in tvv.api.S.migPulse) && shown(svv).length <= 20,
      'PIA-153 AC1 booked, Anjo\'s days stay hers (P-mine: 🎫, Keep mine, no Follow plan); the owner\'s v1 Thanksgiving reads 👪 11/25–11/29 over 💪 11/20–11/29 ⚠, and his P-mine offers Follow plan, with Make plan greyed: a tap says "⤒ Update trip first", sends nothing and points to ⤒ (it pulses again on the trip and the cards)', { mpv, rv });
  }
  {
    // AC5 queued fixes: Import history is 📜 (⤒ is Update trip alone); a join request pending on this phone shows 🙋＋⏳ where 👋 ? was
    const DW = seedAs(DWX), ti = await boot136({ ls: lsOf([DW], { pialax_idea_keys_v1: keyOf([DW]), pialax_idea_me_v1: { [DW]: 'ashwin-p8' } }) });
    act(ti, 'settings'); const gs = sheet(ti); ti.api.closeSheet();
    const L = ti.api.LEGEND, upArrow = Object.keys(L).filter((k) => L[k][0] === '⤒');
    const tq = await boot136({ ls: lsOf([DW], { pialax_ui_v1: { v1read: 1, joins: { [DW]: { name: 'Priya', ap: 'DEN' } } } }) }); act(tq, 'open', { id: DW }); const vq = screen(tq);
    const tn = await boot136({ ls: lsOf([DW]) }); act(tn, 'open', { id: DW }); const vn = screen(tn);
    check(/data-act="himport" aria-label="Import history"><span data-k="import" aria-hidden="true">📜<\/span> Import<\/button>/.test(gs) && L.import[0] === '📜' && eq(upArrow, ['migrate']) &&
      /<button class="ib whoami" data-act="face" data-id="[^"]+" aria-label="Asked to join" data-k="asked">🙋＋⏳<\/button>/.test(vq) && /aria-label="Pick yourself" data-k="whoami">👋 \?<\/button>/.test(vn) && eq(shown(vq), shown(vn)),
      'PIA-153 AC5 one glyph, one meaning: Import history is 📜 (⚙ and its key), ⤒ is Update trip alone; a join request sent from this phone shows 🙋＋⏳ where 👋 ? was (no word added)', upArrow);
  }

  {
    // (fix pass) ⤒ Update trip's review keeps what was typed: closed and opened again, the new name and picture are still there; a
    // record that changed meanwhile (Anjo booked on the v1 trip) is reviewed again with the name, picture and page kept, and the next
    // Update sends one /idea/update carrying it
    const CH = seedAs(TGX, (d) => { d.idea.title = 'Chicago trip'; });
    const tc = await boot136({ ls: lsOf([CH], { pialax_idea_keys_v1: keyOf([CH]), pialax_idea_me_v1: { [CH]: 'LAX' } }), navigator: LOCKS, rec: ['#toast'] });
    act(tc, 'open', { id: CH }); act(tc, 'migrate', { id: CH }); act(tc, 'migscene', { v: '0' }); typed(tc, 'mig-title', 'Thanksgiving');
    tc.api.closeSheet(); act(tc, 'migrate', { id: CH });
    const m1 = sheet(tc), reopened = /<input id="mig-title"[^>]*value="Thanksgiving">/.test(m1) && /data-act="migscene" data-v="0" aria-pressed="true"/.test(m1);
    tc.api.S.drafts.mig = {};   // (the re-review below keeps the sheet's own name, not this kept draft)
    act(tc, 'migpage', { v: '1' }); act(tc, 'migpage', { v: '1' });
    const lt = clone(srv.read(CH)); lt.responses.LGA.booked = true; lt.responses.LGA.booked_at = '2026-10-16T00:00:00.000Z'; srv.write(lt);
    const q0 = posts(tc).length, r1 = await tc.api.ACTS.migsav(); await tick();
    const L1 = tc.api.S.sheet && tc.api.S.sheet.local, t1 = L1 && L1.t ? [L1.t.scene, L1.t.name, L1.t.touched] : null, pg1 = L1 && L1.page;
    const r2 = await tc.api.ACTS.migsav(); await tick();
    const ups = posts(tc).slice(q0).filter((q) => q.path === '/idea/update'), d = srv.read(CH);
    check(reopened && r1 && r1.code === 'changed' && eq(t1, ['🦃', 'Thanksgiving', true]) && pg1 === 2 && r2 && r2.ok && ups.length === 1 && ups[0].body.idea.title === '🦃 Thanksgiving' && d.idea.title === '🦃 Thanksgiving' && d.responses.LGA.booked === true &&
      !tc.api.S.sheet && !(tc.api.S.drafts.mig && tc.api.S.drafts.mig[CH]),
      'PIA-153 AC3 ⤒ Update trip keeps the typed name and picture when its sheet is closed and opened again (memory only); a record that changed meanwhile is reviewed again with them and the page kept, and the next Update sends one /idea/update with "🦃 Thanksgiving" (Anjo\'s 🎫 kept)', { reopened, r1: r1 && r1.code, t1, pg1, n: ups.length });
  }
  {
    // (fix pass) one pulse at a time is the list's alone: hushed while the cards' ⤒ pulses, Family and Map / Calendar draw ⓘ's first-run
    // pulse again; ⤒ tapped inside the trip spends the cards' pulse too (once a visit, the same as the card's ⤒)
    const TG = seedAs(TGX), DW = seedAs(DWX);
    const keyP = (h) => /<button class="ib pulse" data-act="key"/.test(h) ? 'pulse' : /<button class="ib" data-act="key"/.test(h) ? 'still' : 'none';
    const th = await boot136({ ls: lsOf([TG, DW], { pialax_idea_keys_v1: keyOf([TG, DW]), pialax_idea_me_v1: { [TG]: 'LAX', [DW]: 'ashwin-p8' } }), navigator: LOCKS });
    const hl = th.api.renderIdeas().html, hush0 = th.api.S.hush;
    th.api.S.seg = 'family'; const hf = th.api.renderFamily().html, hush1 = th.api.S.hush; th.api.S.seg = 'ideas';
    th.api.renderIdeas(); const hm = th.api.renderSelected('map', 'map').html, hush2 = th.api.S.hush;
    act(th, 'open', { id: TG }); act(th, 'migrate', { id: TG }); const P = th.api.S.migPulse; th.api.closeSheet();
    check(keyP(hl) === 'still' && hush0 === true && keyP(hf) === 'pulse' && hush1 === false && keyP(hm) === 'pulse' && hush2 === false && P[TG] === th.api.MIG_SPENT && P[th.api.MIG_LIST] === th.api.MIG_SPENT,
      'PIA-153 AC5 ⓘ waits only while the cards\' ⤒ pulses on the list: Family and Map / Calendar draw its first-run pulse again; ⤒ tapped in the trip spends the cards\' pulse as well (once a visit)', { k: [keyP(hl), keyP(hf), keyP(hm)], hush: [hush0, hush1, hush2], P });
    // Keep mine records stay for every trip still on this phone, read or not (a failed read never brings its ⚠ back); a trip gone goes
    const kd = (d) => { d.responses['anjo-z5'] = RESP('in', { member: 'anjo-z5', origin: 'LGA', available_from: '2026-11-05', available_to: '2026-11-08' }); };
    const KA = seedAs(DWX, kd), tkp = await boot136({ ls: lsOf([TG, KA], { pialax_idea_me_v1: { [KA]: 'anjo-z5' }, pialax_ui_v1: { v1read: 1, kept: { [TG]: 'a|b|c|d', gone0000000000000000xx: 'a|b|c|d' } } }) });
    delete tkp.api.DOCS[TG];   // (its read failed this visit)
    act(tkp, 'open', { id: KA }); act(tkp, 'mine', { id: KA }); tkp.api.ACTS.minekeep({ dataset: { id: KA } });
    const kept = tkp.api.uiRead().kept;
    check(kept[TG] === 'a|b|c|d' && !('gone0000000000000000xx' in kept) && kept[KA] === '2026-11-06|2026-11-09|2026-11-05|2026-11-08',
      'PIA-153 AC1 Keep mine prunes only trips no longer on this phone: another trip\'s record stays though its read failed this visit', kept);
  }

  // ═══ PIA-154 fix pass ═══
  section('PIA-154 fix pass: a nobody phone on a closed trip, the follow chip, a greyed Lock dates, the share dot, the cards\' dot, 💵 Paid, Calendar marks, words beside 🛬 / 🛫, the dead paths');
  {
    // a phone that is nobody on a paid trip (or a dropped one) still says 👋 ? beside 🏁 / 🗑: P-face is how it says who it is
    const PD = seedAs(DWX, (d) => { chosenAt(d, '2026-11-06', '2026-11-09', 'RDU'); d.decision.stage = 'booked'; d.decision.actual_total = 905; });
    const DR = seedAs(DWX, (d) => { d.decision = { stage: 'dropped', chosen: null, chosen_at: null, estimate_total: null, actual_total: null, booked_at: null, delta_pct: null }; });
    const nb = await boot136({ ls: lsOf([PD, DR]) });
    act(nb, 'open', { id: PD }); if (nb.api.S.sheet) nb.api.closeSheet();
    const hp = screen(nb), p0 = nPosts(nb);
    act(nb, 'back'); act(nb, 'open', { id: DR }); if (nb.api.S.sheet) nb.api.closeSheet();
    const hd = screen(nb);
    act(nb, 'back'); act(nb, 'open', { id: PD }); if (nb.api.S.sheet) nb.api.closeSheet();
    tap(nb, screen(nb), 'face'); const fType = nb.api.S.sheet && nb.api.S.sheet.type;
    tap(nb, sheet(nb), 'pickface', { code: 'anjo-z5' }); if (nb.api.S.sheet) nb.api.closeSheet();
    const ha = screen(nb);
    check(/<span class="achip closed"[^>]*data-k="st-done">🏁<\/span><button class="ib whoami" data-act="face"[^>]*data-k="whoami">👋 \?<\/button>/.test(hp) &&
      /<span class="achip closed"[^>]*data-k="dropped">🗑<\/span><button class="ib whoami" data-act="face"[^>]*data-k="whoami">👋 \?<\/button>/.test(hd) &&
      fType === 'face' && nb.api.meFor(PD) === 'anjo-z5' && /data-k="st-done">🏁<\/span><\/div>/.test(ha) && !/data-act="face" data-id="[^"]+" aria-label="Pick yourself"/.test(ha) && nPosts(nb) === p0,
      'PIA-154 B1 a phone that is nobody on a paid trip shows 👋 ? beside 🏁 (beside 🗑 on a dropped one): P-face, one tap, and it is Anjo there (nothing written); identified, the date row ends in 🏁 alone');
  }
  {
    // P-dates my days: a fresh open that follows the plan shows no follow chip and no shift row; a pick brings both
    const FD = seedAs(DWX, (d) => { d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); });
    const g = await boot136({ ls: lsOf([FD], { pialax_idea_me_v1: { [FD]: 'anjo-z5' } }) });
    act(g, 'open', { id: FD }); act(g, 'dates', { id: FD });
    const s0 = sheet(g), L = g.api.S.sheet && g.api.S.sheet.local, follow0 = !!(L && L.follow);
    tap(g, s0, 'dday', { v: '2026-11-07' }); tap(g, sheet(g), 'dday', { v: '2026-11-09' });
    const s1 = sheet(g);
    check(L && L.target === 'me' && follow0 && /<span class="endg">My days<\/span>/.test(s0) && !/data-act="dfollow"/.test(s0) && !/data-act="dshift"/.test(s0) &&
      /data-act="dfollow" aria-pressed="false"[^>]*>[\s\S]*?11\/6–11\/9<\/button>/.test(s1) && (s1.match(/data-act="dshift"/g) || []).length === 4,
      'PIA-154 B7 Anjo\'s My days, opened as it follows the plan: no "👪 11/6–11/9" chip beside the same dates and no −7 −1 +1 +7; once she picks 11/7–11/9 the chip (unpressed) and the shift row are there',
      { target: L && L.target, follow: L && L.follow, endg: /<span class="endg">My days<\/span>/.test(s0), f0: /data-act="dfollow"/.test(s0), sh0: (s0.match(/data-act="dshift"/g) || []).length, f1: (/<button class="hchip followb"[^>]*>[\s\S]*?<\/button>/.exec(s1) || [''])[0], sh1: (s1.match(/data-act="dshift"/g) || []).length });
  }
  {
    // a saved plan that cannot be locked: 🔒 Lock dates greyed with why (no destination; the plan has begun), a tap writes nothing
    const ND = seedAs(DWX, (d) => { d.idea.destination = { city: '', airport: '' }; d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); });
    const OK = seedAs(DWX, (d) => { d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); });
    const o = await boot136({ ls: lsOf([ND, OK], { pialax_idea_me_v1: { [ND]: 'ashwin-p8', [OK]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([ND, OK]) }) });
    act(o, 'open', { id: ND }); act(o, 'dates', { id: ND });
    const sn = sheet(o), p0 = nPosts(o), gl = ctl(sn, 'dlock');
    await o.api.ACTS.dlock(el0(gl || {}, true)); await o.api.ACTS.dlock(el0(gl || {})); await tick();
    o.api.closeSheet(); act(o, 'back');
    CLOCK = Date.parse('2026-11-07T15:00:00Z'); o.api.render(true);   // (the plan began yesterday)
    act(o, 'open', { id: OK }); act(o, 'dates', { id: OK });
    const sb = sheet(o); await o.api.ACTS.dlock(el0(ctl(sb, 'dlock') || {})); await tick();
    o.api.closeSheet(); CLOCK = NOW;
    check(/data-act="dlock" aria-disabled="true" data-why="1" aria-label="Lock dates, No destination" data-lbl="No destination"><span data-k="lock" aria-hidden="true">🔒<\/span> Lock dates<\/button>/.test(sn) &&
      /data-act="dlock" aria-disabled="true" data-why="1" aria-label="Lock dates, Before today" data-lbl="Before today">/.test(sb) && !/data-act="dsave"/.test(sn) &&
      nPosts(o) === p0 && srv.read(ND).decision.stage === 'proposed' && srv.read(OK).decision.stage === 'proposed',
      'PIA-154 B7 a saved plan with no place, or one that has begun: P-dates\' main button is 🔒 Lock dates greyed, saying why on a tap ("No destination", "Before today"); no tap on it locks anything (nothing sent)');
  }
  {
    // the Share dot rests for the visit once he has shared this plan, though someone still has to answer; a moved plan brings it back
    const SD = seedAs(DWX), rs = recShare();
    const o = await boot136({ ls: lsOf([SD], { pialax_idea_me_v1: { [SD]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([SD]) }), navigator: rs.nav });
    act(o, 'open', { id: SD });
    const before = /<button class="btn pri share dot" data-act="tshare"/.test(screen(o));
    tap(o, screen(o), 'tshare'); await tick();
    const after = screen(o), rested = /<button class="btn pri share" data-act="tshare"/.test(after) && !/share dot/.test(after);
    const d2 = srv.read(SD); d2.idea.dates.departure = '2026-11-07'; d2.idea.dates.return = '2026-11-10'; srv.write(d2);
    await o.api.refresh(SD); await o.api.refresh(SD); await tick();
    const back = /<button class="btn pri share dot" data-act="tshare"/.test(screen(o));
    check(before && rs.shared.length === 1 && rested && back && o.api.modelOf(SD).waitingAny,
      'PIA-154 the Share primary\'s dot rests once he has shared (Anjo still waiting: Share stays the primary, calm, for this visit); the plan moving brings the dot back', { before, rested, back });
  }
  {
    // the cards: one dot where the card needs this phone's look, the cards the Trips tab counts (my answer awaited, on any phone)
    const AW = seedAs(DWX), ANS = seedAs(DWX, (d) => { d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); });
    const g = await boot136({ ls: lsOf([AW, ANS], { pialax_idea_me_v1: { [AW]: 'anjo-z5', [ANS]: 'anjo-z5' } }) });
    const h = g.api.renderIdeas().html;
    check(/<span class="ndot" role="img" aria-label="Waiting on your answer" data-lbl="Your answer" data-k="askme"><\/span>/.test(cardOf(h, AW)) && cardOf(h, ANS).indexOf('class="ndot"') < 0 &&
      g.api.tripsBadge() === 1 && g.api.LEGEND.askme && g.api.LEGEND.askme[1] === 'Your answer',
      'PIA-154 B2 Anjo\'s badge says 1 and the one card waiting on her answer carries the dot after n/N ("Your answer"); the card she answered has none');
  }
  {
    // 💵 Paid opens the amount alone (no stepper, no rows over the keyboard); ⋯ More still holds every row and the 💵 field
    const allB = (d) => { chosenAt(d, '2026-11-06', '2026-11-09', 'RDU'); d.responses['momdad-k3'].booked = true; d.responses['ashwin-p8'].booked = true; d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA', booked: true }); };
    const DN = seedAs(DWX, allB);
    const o = await boot136({ ls: lsOf([DN], { pialax_idea_me_v1: { [DN]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([DN]), pialax_proxy_token: TOKEN }) });
    act(o, 'open', { id: DN }); act(o, 'paidopen', { id: DN });
    const sp = sheet(o), nm = o.api.sheetName(o.api.S.sheet), pid = o.api.popupName(o.api.S.sheet); o.api.closeSheet();
    act(o, 'stage', { id: DN }); const sm = sheet(o); o.api.closeSheet();
    check(/id="paid-amt"/.test(sp) && !/class="sline/.test(sp) && !/class="mrowb/.test(sp) && nm === 'Paid' && pid === 'P-stage' && /class="sline"/.test(sm) && /data-act="stagedrop"/.test(sm) && /id="paid-amt"/.test(sm),
      'PIA-154 💵 Paid opens P-stage with the amount alone (named "Paid"; its field and Save stay in view over the keyboard), while ⋯ More keeps the stage line (PIA-155), its rows and the same 💵 field', { nm, pid });
  }
  {
    // Calendar: no window brackets (P-dates\' own), my days underlined only where they leave the plan, a day's spoken count as drawn
    const CW = seedAs(DWX, (d) => { atPeoria(d); d.idea.dates.searchStart = '2026-10-30'; d.idea.dates.searchEnd = '2026-12-05';
      d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA', available_from: '2026-11-05' }); });
    const g = await boot136({ ls: lsOf([CW], { pialax_idea_me_v1: { [CW]: 'anjo-z5' } }) });
    act(g, 'open', { id: CW }); act(g, 'tab', { v: 'cal' });
    const ch = g.api.renderSelected('calendar', 'cal').html, bad = [], hostOnly = [];
    const re = /<button class="dc[^"]*" data-act="calday" data-id="[^"]+" data-v="(\d{4}-\d\d-\d\d)" data-n="(\d+)" aria-label="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g; let mm;
    const lines = [];
    while ((mm = re.exec(ch))) {
      const drawn = /class="pc-n"/.test(mm[4]), said = /present/.test(mm[3]);
      if (drawn !== said) bad.push(mm[1] + ' ' + mm[3]);
      if (+mm[2] > 0 && !drawn) hostOnly.push(mm[1]);
      if (/class="myline"/.test(mm[4])) lines.push(mm[1]);
    }
    check(ch.indexOf('data-k="window"') < 0 && bad.length === 0 && eq(lines, ['2026-11-05']),
      'PIA-154 B5 Calendar draws no lone ⟦ ⟧ bracket (the window ends are P-dates\' own); Anjo\'s days (11/5–11/9 against the plan\'s 11/6–11/9) are underlined on 11/5 alone; a day speaks its count only where its numeral is drawn (' + hostOnly.length + ' days with only the hosts there read as blank)', { bad: bad.slice(0, 3), lines, hostOnly: hostOnly.slice(0, 3) });
    // P-mapairport: 🛬 / 🛫 never alone in a text row
    act(g, 'tab', { v: 'map' }); g.api.ACTS.mapairport({ dataset: { id: CW, v: 'PIA' } });
    const ma = sheet(g); g.api.closeSheet();
    check(/<span class="lg0"><span data-k="arrive" aria-hidden="true">🛬<\/span> Arrive<\/span>/.test(ma) && /<span class="lg0"><span data-k="leave" aria-hidden="true">🛫<\/span> Leave<\/span>/.test(ma),
      'PIA-154 A2 P-mapairport\'s rows read "🛬 Arrive" / "🛫 Leave"');
  }
  {
    // ⋯ More's header: the title alone when it starts with the trip's picture (no 🪔 🪔), the picture too when it does not
    const DW2 = seedAs(DWX), CH = seedAs(DWX, (d) => { d.idea.title = 'Chicago trip'; });
    const o = await boot136({ ls: lsOf([DW2, CH], { pialax_idea_me_v1: { [DW2]: 'ashwin-p8', [CH]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([DW2, CH]) }) });
    act(o, 'stage', { id: DW2 }); const s1 = sheet(o); o.api.closeSheet();
    act(o, 'stage', { id: CH }); const s2 = sheet(o); o.api.closeSheet();
    const m1 = o.api.modelOf(DW2);
    check(m1.title.indexOf(m1.emoji) === 0 && !/class="temo"/.test(s1) && /<span class="sttl wide" data-free>🪔 Diwali in Raleigh<\/span>/.test(s1) && /class="temo"/.test(s2) && /<span class="sttl wide" data-free>Chicago trip<\/span>/.test(s2),
      'PIA-154 B6 More\'s header shows "🪔 Diwali in Raleigh" once (its picture is the title\'s own first glyph), and the picture beside a title that has none');
  }
  {
    // the dead paths are gone, and one rule picks the legs a tap searches (a traveler's sheet = P-total's, one traveler at a time)
    const PK = seedAs(DWX, (d) => { d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); });
    const o = await boot136({ ls: lsOf([PK], { pialax_idea_me_v1: { [PK]: 'ashwin-p8' }, pialax_idea_keys_v1: keyOf([PK]), pialax_proxy_token: TOKEN }) });
    const m = o.api.modelOf(PK), all = o.api.tapKeys(m), per = [];
    m.travelers.forEach((x) => o.api.personKeys(m, x.code).forEach((k) => { if (per.indexOf(k) < 0) per.push(k); }));
    check(!o.api.ACTS.dlook && !o.api.ACTS.dend && !('facePulse' in o.api.S) && all.length > 0 && eq(per.slice().sort(), all.slice().sort()) && o.api.personKeys(m, 'momdad-k3').length >= 0,
      'PIA-154 no dead path is left (👥\'s dlook, the [🛬|↔|🛫] segment\'s dend, the me row\'s facePulse); each traveler\'s 🔍N in their sheet searches their part of P-total\'s legs (one rule: the model\'s tapKeys)', { all: all.length, per: per.length });
  }

  // ═══ PIA-155 ═══
  section('PIA-155 remove an old (v1) trip for everyone without ⤒ Update trip; ⋯ More says what each row does; the price row says whose fare; one 🛬 ask');
  {
    const cardOf = (h, id) => (new RegExp('<article class="card[^"]*" data-trip="' + id + '">[\\s\\S]*?</article>').exec(h) || [''])[0];
    const orgLs = (ids) => lsOf(ids, { pialax_idea_keys_v1: keyOf(ids), pialax_idea_me_v1: Object.fromEntries(ids.map((i) => [i, 'LAX'])) });
    // A1 from the card's ⋯: 3 taps (⋯, 🗑 Remove for everyone, 🗑 Remove), one decision-only update through the real Worker
    const TG = seedAs(TGX), idea0 = JSON.stringify(srv.read(TG).idea), dec0 = clone(srv.read(TG).decision);
    const t = await boot136({ ls: orgLs([TG]), rec: ['#toast'] }), list0 = t.api.renderIdeas().html, f0 = t.fetches.length;
    t.api.ACTS.stage({ dataset: ctl(cardOf(list0, TG), 'stage') });                       // tap 1: ⋯
    const st = sheet(t), rm = ctl(st, 'stagedrop', { id: TG });
    t.api.ACTS.stagedrop(el0(rm));                                                         // tap 2: 🗑 Remove for everyone
    const pdType = t.api.S.sheet && t.api.S.sheet.type, pd = sheet(t), sent0 = posts(t, f0).length;
    const r = await act(t, 'dropyes'); await tick();                                       // tap 3: 🗑 Remove
    const a1 = srv.read(TG), ups = posts(t, f0), toastA = t.rec['#toast'].innerHTML, shelfA = t.api.shelfItems().map((x) => x.id);
    check(t.api.modelOf(TG) && rm && !rm.why && pdType === 'drop' && /<button class="btn danger" data-act="dropyes">🗑 Remove<\/button><button class="btn pri" data-act="dropkeep">Keep<\/button>/.test(pd) && sent0 === 0 &&
      r && r.ok && a1.decision.stage === 'dropped' && JSON.stringify(a1.idea) === idea0 && eq(a1.decision.chosen, dec0.chosen) &&
      ups.length === 1 && ups[0].path === '/idea/update' && eq(Object.keys(ups[0].body).sort(), ['decision', 'edit_key']) && eq(ups[0].body.decision, { stage: 'dropped' }) &&
      !t.api.S.sheet && shelfA.indexOf(TG) >= 0 && /🗑/.test(toastA) && /data-act="undo"/.test(toastA) && t.api.modelOf(TG).legacy,
      'PIA-155 A the organizer removes the duplicate v1 Thanksgiving from its card in 3 taps (⋯, 🗑 Remove for everyone, 🗑 Remove; no ⤒ Update first): one /idea/update with {edit_key, decision: dropped} and no idea, the record dropped with its idea JSON byte-identical (still v1), the card on the shelf, ↩ in the toast', { pdType, r, ups: ups.map((q) => q.body.decision), stage: a1.decision.stage });
    // A2 ↩ in the toast: back as it stood (chosen again with its own stored choice and estimate; its idea untouched; still v1)
    const f1 = t.fetches.length, u = await act(t, 'undo'); await tick();
    const a2 = srv.read(TG), ups2 = posts(t, f1);
    check(u && u.ok && a2.decision.stage === 'chosen' && JSON.stringify(a2.idea) === idea0 && eq(a2.decision.chosen, dec0.chosen) && a2.decision.estimate_total === 704 && a2.decision.estimate_total === dec0.estimate_total &&
      ups2.length === 1 && eq(Object.keys(ups2[0].body).sort(), ['decision', 'edit_key']) && eq(ups2[0].body.decision, { stage: 'chosen', chosen: dec0.chosen }) &&
      t.api.activeItems().some((x) => x.id === TG) && t.api.modelOf(TG).legacy && t.api.modelOf(TG).legacyLock && t.api.modelOf(TG).stage === 'asking',
      'PIA-155 A ↩ (the model\'s restoreDelta) puts the v1 trip back as it stood: {decision: {stage: chosen, chosen: <its own stored choice>}}, no idea; the record chosen again with the same choice and estimate (PIA 11/25–11/29, $704; only chosen_at re-stamped) and its idea byte-identical; the card back in the list, still Asking, still v1', ups2.map((q) => q.body));
    // A3 from the trip page's ⋯ (3 taps too); Mom's phone then sees it removed on her shelf; the shelf card's ↩ restores it
    const T2 = seedAs(TGX), i2 = JSON.stringify(srv.read(T2).idea);
    const o = await boot136({ ls: orgLs([T2]), rec: ['#toast'] });
    act(o, 'open', { id: T2 }); const v0 = screen(o);
    tap(o, v0, 'stage'); const ost = sheet(o);                                             // tap 1: the nav's ⋯
    o.api.ACTS.stagedrop(el0(ctl(ost, 'stagedrop', { id: T2 })));                          // tap 2
    const ro = await act(o, 'dropyes'); await tick();                                      // tap 3
    const b1 = srv.read(T2), leftTrip = o.api.S.trip === null && !o.api.S.sheet;
    const mom = await boot136({ ls: lsOf([T2], { pialax_idea_me_v1: { [T2]: 'PIA' } }) });
    const momShelf = mom.api.shelfItems().map((x) => x.id), momAct = mom.api.activeItems().map((x) => x.id), mm = mom.api.modelOf(T2);
    mom.ls.setItem('pialax_ui_v1', JSON.stringify({ v1read: 1, shelfOpen: true })); const momList = mom.api.renderIdeas().html;
    mom.api.ACTS.stage({ dataset: { id: T2, v: 'card' } }); const momMore = sheet(mom); mom.api.closeSheet();
    o.ls.setItem('pialax_ui_v1', JSON.stringify(Object.assign(JSON.parse(o.ls.getItem('pialax_ui_v1') || '{}'), { shelfOpen: true })));
    const oList = o.api.renderIdeas().html, oCard = cardOf(oList, T2);
    o.api.ACTS.stage({ dataset: { id: T2, v: 'card' } }); const oMore = sheet(o); o.api.closeSheet();
    act(o, 'open', { id: T2 }); const oView = screen(o); act(o, 'back');
    const rr = await o.api.ACTS.restore({ dataset: ctl(oCard, 'restore') }); await tick();
    const b2 = srv.read(T2);
    check(/<div class="sline" role="img" aria-label="Stage 2 of 5, Asking"/.test(ost) && ro && ro.ok && leftTrip && b1.decision.stage === 'dropped' && JSON.stringify(b1.idea) === i2 &&
      momShelf.indexOf(T2) >= 0 && momAct.indexOf(T2) < 0 && mm.stage === 'dropped' && mm.closed && !/data-act="restore"/.test(cardOf(momList, T2)) && /🗄<\/span> Archive <span class="tn">1<\/span>/.test(momList) &&
      /<div class="sline off" role="img" aria-label="Removed for everyone" data-lbl="Removed for everyone">[\s\S]*?<span class="sword">Removed<\/span><\/div>/.test(momMore) && !/data-act="(tshare|stagedrop|restore)"/.test(momMore) &&
      /data-act="restore"/.test(oCard) && !/data-act="migcard"/.test(oCard) && !/data-act="stagedrop"/.test(oMore) && /data-act="restore"/.test(oMore) && !/data-act="migrate"/.test(oView) &&
      rr && rr.ok && b2.decision.stage === 'chosen' && JSON.stringify(b2.idea) === i2,
      'PIA-155 A from the trip page\'s ⋯ too (3 taps; the trip view leaves for the list); Mom\'s phone (no key) sees it removed, on her 🗄 Archive shelf like any removed trip (her ⋯ More reads "Removed", no Share, no 🗑 or ↩); on his phone the removed card offers ↩ and no ⤒ (nor the trip\'s nav: a removed trip\'s next step is ↩), and the shelf\'s ↩ restores it, its idea untouched', { momShelf, stage: b2.decision.stage });
    // A4 a v1 record with no decision object: its 🗑 is not offered as live (greyed, "⤒ Update trip first"), and a tap sends nothing
    const ND = seedAs(TGX, (d) => { delete d.decision; });
    const n = await boot136({ ls: orgLs([ND]) }), nf = n.fetches.length;
    n.api.ACTS.stage({ dataset: { id: ND } }); const ns = sheet(n), nd = ctl(ns, 'stagedrop', { id: ND });
    const nr = n.api.ACTS.stagedrop(el0(nd, true));
    check(!n.api.modelOf(ND).hasDecision && nd && nd.why === '1' && nd.lbl === '⤒ Update trip first' && nr === null && n.api.S.sheet.type === 'stage' && posts(n, nf).length === 0,
      'PIA-155 A a v1 record without a decision object (no Worker-created one lacks it) keeps 🗑 greyed: the Worker\'s decision would fail on it; nothing is sent');
    // (an updated record with no decision object, never drawn by the Worker: no 🗑 at all, nothing to point to)
    const NV = seedAs(DWX, (d) => { delete d.decision; });
    const nv = await boot136({ ls: lsOf([NV], { pialax_idea_keys_v1: keyOf([NV]), pialax_idea_me_v1: { [NV]: 'ashwin-p8' } }) });
    nv.api.ACTS.stage({ dataset: { id: NV } }); const nvs = sheet(nv);
    check(!nv.api.modelOf(NV).legacy && !nv.api.modelOf(NV).hasDecision && nv.api.removeHeld(nv.api.modelOf(NV)) && !/data-act="stagedrop"|Update trip first/.test(nvs) && /data-act="hidehere"/.test(nvs),
      'PIA-155 A an updated record with no decision object offers no 🗑 (no dead "⤒ Update trip first": there is no ⤒ to point to)');
    // A5 two organizer phones: another removed (or restored) the v1 trip first. Ours finds the record already there: nothing is sent,
    // and it settles as the same tap on an updated trip does (no ⚠ ↻ forever); any other v1 edit is still refused
    const RC = seedAs(TGX), rcIdea = JSON.stringify(srv.read(RC).idea);
    const other = async (id, delta) => { const fr = srv.read(id), q = TM.updateRequest(fr, KEY, typeof delta === 'function' ? delta(fr) : delta); const r = await srv.fetch(W + q.path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q.body) }); return r.status; };
    const a = await boot136({ ls: orgLs([RC]), rec: ['#toast'] });
    a.api.ACTS.stage({ dataset: { id: RC } }); a.api.ACTS.stagedrop(el0(ctl(sheet(a), 'stagedrop', { id: RC })));
    const pdOpen = a.api.S.sheet && a.api.S.sheet.type === 'drop', dropNm = a.api.sheetName(a.api.S.sheet);
    const st1 = await other(RC, { decision: { stage: 'dropped' } }), fa = a.fetches.length;          // the other phone removes it
    const ra = await act(a, 'dropyes'); await tick();
    const raPosts = posts(a, fa), after1 = srv.read(RC), toastR = a.rec['#toast'].innerHTML, shelved = a.api.shelfItems().some((x) => x.id === RC);
    const st2 = await other(RC, (fr) => TM.restoreDelta(fr)), fb = a.fetches.length;                // the other phone restores it
    const ub = await act(a, 'undo'); await tick();
    const ubPosts = posts(a, fb), after2 = srv.read(RC), errOpen = a.api.S.sheet && a.api.S.sheet.type;
    const fc = a.fetches.length, lk = await a.api.organizerWrite(RC, { decision: { stage: 'chosen' } }); await tick();
    check(pdOpen && dropNm === 'Remove trip' && st1 === 200 && ra && ra.ok && raPosts.length === 0 && after1.decision.stage === 'dropped' && !a.api.S.sheet && /data-act="undo"/.test(toastR) && shelved &&
      st2 === 200 && ub && ub.ok && ubPosts.length === 0 && after2.decision.stage === 'chosen' && !errOpen && JSON.stringify(after2.idea) === rcIdea && a.api.activeItems().some((x) => x.id === RC) &&
      lk && !lk.ok && lk.code === 'bad_body' && posts(a, fc).length === 0 && srv.read(RC).decision.chosen_at === after2.decision.chosen_at,
      'PIA-155 A two organizer phones on the v1 trip: P-drop (named "Remove trip") open here while the other phone removes it: our 🗑 Remove settles with nothing sent (the trip on the shelf, ↩ in the toast), not a ⚠ ↻ that never clears; the other phone restores it, and our toast ↩ settles too (no P-error); a lock on the v1 record is still refused (bad_body, nothing sent)', { ra, ub, lk, raPosts: raPosts.length, ubPosts: ubPosts.length, shelved, errOpen });
  }
  {
    // B ⋯ More in every state: ≤20 words, no marked label word (sheet() collects any into SHEET_L3), the stage one quiet line
    const TG = seedAs(TGX), DW = seedAs(DWX), DR = seedAs(DWX, (d) => { d.decision.stage = 'dropped'; });
    const PAIDX = seedAs(DWX, (d) => { chosenAt(d, '2026-11-06', '2026-11-09', 'RDU'); d.responses['momdad-k3'].booked = true; d.responses['ashwin-p8'].booked = true; d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA', booked: true }); });
    const ids = [TG, DW, DR, PAIDX], org = await boot136({ ls: lsOf(ids, { pialax_idea_keys_v1: keyOf(ids), pialax_idea_me_v1: { [TG]: 'LAX', [DW]: 'ashwin-p8', [DR]: 'ashwin-p8', [PAIDX]: 'ashwin-p8' }, pialax_proxy_token: TOKEN }) });
    const guest = await boot136({ ls: lsOf([TG, DW], { pialax_idea_me_v1: { [TG]: 'LGA', [DW]: 'anjo-z5' } }) });
    const more = (t, id) => { t.api.ACTS.stage({ dataset: { id } }); const h = sheet(t); t.api.closeSheet(); return h; };
    const states = { 'organizer v1': more(org, TG), 'organizer v2': more(org, DW), 'organizer removed': more(org, DR), 'organizer token, paid row': more(org, PAIDX), 'guest v1': more(guest, TG), 'guest v2': more(guest, DW) };
    org.api.ACTS.hidehere({ dataset: { id: DW } }); states['organizer hidden'] = more(org, DW);
    const words = Object.keys(states).map((k) => k + ':' + shown(states[k]).length), over = Object.keys(states).filter((k) => shown(states[k]).length > 20);
    const lines = Object.keys(states).map((k) => (/<div class="sline[^"]*" role="img" aria-label="([^"]+)"/.exec(states[k]) || [])[1]);
    check(over.length === 0 && Object.keys(states).every((k) => !/data-lbl3/.test(states[k]) && !/class="stepper|class="srow/.test(states[k])) &&
      eq(lines, ['Stage 2 of 5, Asking', 'Stage 2 of 5, Asking', 'Removed for everyone', 'Stage 5 of 5, Done', 'Stage 2 of 5, Asking', 'Stage 2 of 5, Asking', 'Stage 2 of 5, Asking']) &&
      /Hide on my phone/.test(states['organizer v2']) && /Show on my phone/.test(states['organizer hidden']) && /Remove for everyone/.test(states['organizer v1']) && /Remove for everyone/.test(states['organizer v2']) &&
      /data-act="restore"[^>]*>[\s\S]*?Restore<\/button>/.test(states['organizer removed']) && /data-act="paidsave"|data-act="paidwhy"|class="paidv"/.test(states['organizer token, paid row']) && !/Remove/.test(states['guest v1'] + states['guest v2']) &&
      org.api.LEGEND.hidehere[1] === 'Hide on my phone' && org.api.LEGEND.dropped[1] === 'Removed' && !org.api.LEGEND.snow && !org.api.LEGEND.sdone && !org.api.LEGEND.snext,
      'PIA-155 B ⋯ More says what each row does in every state (organizer v1 / v2 / removed / hidden / token phone with 💵, guest v1 / v2), ≤20 words and nothing marked: the stage one picture with its word ("Stage 2 of 5, Asking", "Removed for everyone"), "🗄 Hide on my phone" / "Show on my phone", the organizer\'s "🗑 Remove for everyone" (a removed trip "↩ Restore"); ⓘ\'s key says 🗄 Hide on my phone and 🗑 Removed', { words, lines });
    // a trip the shelf holds anyway (removed, or over) offers no 🗄: Hide or Show would change nothing there; a hidden trip restored
    // after a removal can be shown again
    const PAST = seedAs(DWX, (d) => { d.idea.dates.departure = '2026-09-04'; d.idea.dates.return = '2026-09-07'; });
    const pst = await boot136({ ls: lsOf([PAST, DR], { pialax_idea_me_v1: { [PAST]: 'anjo-z5', [DR]: 'anjo-z5' } }) });
    const pastMore = more(pst, PAST), drGuest = more(pst, DR);
    const css = fs.readFileSync(APP, 'utf8');
    check(pst.api.modelOf(PAST).past && pst.api.modelOf(PAST).shelf && !/data-act="hidehere"/.test(pastMore) && /data-act="star"/.test(pastMore) && !/data-act="hidehere"/.test(states['organizer removed']) && !/data-act="hidehere"/.test(drGuest) &&
      /data-act="hidehere"/.test(states['organizer hidden']) && /\.sline\.off \.strk \{ opacity: \.55; \}/.test(css) && !/\.sline\.off \{[^}]*opacity/.test(css),
      'PIA-155 B no "🗄 Hide on my phone" on a trip the 🗄 Archive shelf holds anyway (removed, for the organizer and a guest, or over): it would change nothing; a removed trip\'s line dims its dots only, its word "Removed" at full ink (AA contrast)');
  }
  {
    // C the price row says whose fare, and shows where a price helps decide; D my own bar does not ask for 🛬 twice
    // ("P town": Mom & Dad host at PIA, Ashwin booked from LAX, Anjo in from LGA and not booked)
    const town = (d) => { atPeoria(d); d.responses['ashwin-p8'].booked = true; d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); };
    const OPEN = seedAs(DWX, town), LOCK = seedAs(DWX, (d) => { town(d); chosenAt(d, '2026-11-06', '2026-11-09', 'PIA'); });
    const tok = (ids, extra) => lsOf(ids, Object.assign({ pialax_idea_keys_v1: keyOf(ids), pialax_idea_me_v1: Object.fromEntries(ids.map((i) => [i, 'ashwin-p8'])), pialax_proxy_token: TOKEN, pialax_multi_airport_v1: '1' }, extra || {}));
    const rowOf = (h) => (/<button class="pricerow[\s\S]*?<\/button>/.exec(h) || [''])[0];
    const cardMoney = (t, id) => (/<button class="totb z"[\s\S]*?<\/button>/.exec(t.api.cardHTML({ id, x: t.api.listEntry(id), m: t.api.modelOf(id) })) || [''])[0];
    const p1 = await boot136({ ls: tok([OPEN, LOCK]) });
    act(p1, 'open', { id: OPEN }); const ho = screen(p1); act(p1, 'back');
    act(p1, 'open', { id: LOCK }); const hl = screen(p1);
    p1.api.openSheet('person', { id: LOCK, code: 'anjo-z5' }); const aj = sheet(p1); p1.api.closeSheet();   // (her face's sheet, drawn without its /account read)
    const ro = rowOf(ho), rl = rowOf(hl), co = cardMoney(p1, OPEN), cl = cardMoney(p1, LOCK);
    check(ro === '<button class="pricerow" data-act="total" data-id="' + OPEN + '" aria-label="Price Anjo’s flight" data-lbl="Price Anjo’s flight"><span class="chipq w"><span aria-hidden="true" data-k="search">🔍</span> Price <span class="uf" data-k="unpriced">🗽</span></span></button>' &&
      /data-k="search">🔍<\/span><span class="tn">1<\/span>/.test(co) && rl === '' && cl === '' && !/data-k="search"/.test(cardMoney(p1, LOCK)) &&
      /data-act="search" data-id="[^"]+" data-v="person" data-code="anjo-z5" data-n="1" aria-label="Search 1 fare, 1 search" data-lbl="Search 1 fare">/.test(aj) && !/Price 1|<span class="tn">1<\/span><\/span><\/button>/.test(ro),
      'PIA-155 C before 🔒 the price row says whose fare: "🔍 Price 🗽" (Anjo\'s round trip; Ashwin booked, Mom & Dad host), named "Price Anjo’s flight", never a bare "Price 1"; the card keeps its 🔍1. After 🔒 with nothing cached: no row and no card chip, and Anjo\'s own sheet (her face on the board: 2 taps) keeps its 🔍1 for her flight, which says what its number is on a long press ("Search 1 fare")', { ro, rl, co, cl });
    const pw = p1.api.priceWho, me = { me: { code: 'lax' } }, X = (code, short) => ({ code, short, one: short });
    check(pw(me, [X('lax', '')]) === 'Price my flight' && pw(me, [X('lax', ''), X('anjo-z5', 'Anjo')]) === 'Price my and Anjo’s flights' && pw({ me: null }, [X('lax', '')]) === 'Price Person’s flight' &&
      pw(me, [X('a', 'Ann'), X('b', 'Bo'), X('c', 'Cy'), X('d', 'Di')]) === 'Price Ann’s, Bo’s, Cy’s and 1 more flight' && pw(me, [X('a', 'Ann'), X('b', 'Bo'), X('c', 'Cy'), X('d', 'Di'), X('e', 'Ed')]) === 'Price Ann’s, Bo’s, Cy’s and 2 more flights' &&
      pw(me, [X('lax', 'Ashwin')]) === 'Price Ashwin’s flight',
      'PIA-155 C the row\'s name in plain words: my own nameless v1 "Me" reads "my" ("Price my and Anjo’s flights", never "Person’s"), "and 1 more flight", "and 2 more flights"; a named me keeps my name');
    // a cached fare brings the row back after 🔒 (a real total); with one traveler still unsearched it says "$X 🔍🗽"
    const m0 = TM.tripModel(srv.read(LOCK), { today: '2026-10-17', now: NOW, me: 'ashwin-p8', hasEditKey: true, hasToken: true, multiAirport: true }), anj = m0.travelers.find((x) => x.code === 'anjo-z5');
    const fares = {}; anj.keys.forEach((k) => { fares[k.key] = { p: 321, f: NOW - 36e5 }; });
    const p2 = await boot136({ ls: tok([LOCK], { pialax_fares_v2: fares }) });
    act(p2, 'open', { id: LOCK }); const r2 = rowOf(screen(p2)), c2 = cardMoney(p2, LOCK);
    const TWO = seedAs(DWX, (d) => { town(d); d.responses['ashwin-p8'].booked = false; chosenAt(d, '2026-11-06', '2026-11-09', 'PIA'); });
    const p3 = await boot136({ ls: tok([TWO], { pialax_fares_v2: fares }) });   // (Anjo's fare cached, Ashwin's not)
    act(p3, 'open', { id: TWO }); const r3 = rowOf(screen(p3));
    // (Ashwin's flight is bought: never searched, so the sum stays outlined, "not complete", with no face to price)
    check(/<span class="tot part" data-k="total">\$321<\/span>/.test(r2) && !/data-k="unpriced"|chipq/.test(r2) && /aria-label="Group total \$321, not complete"/.test(r2) && /\$321/.test(c2) &&
      /<span class="tot part" data-k="total">\$321<\/span>[\s\S]*?<span class="chipq" data-lbl="Price Ashwin’s flight"><span aria-hidden="true" data-k="search">🔍<\/span><span class="uf" data-k="unpriced">🌴<\/span><\/span><\/button>$/.test(r3) && /aria-label="Group total \$321, not complete, price Ashwin’s flight" data-lbl="Group total"/.test(r3),
      'PIA-155 C after 🔒 a cached fare brings the row (and the card\'s $) back with the real total; with one traveler still unsearched it reads "$321 🔍🌴", the faces naming themselves ("Price Ashwin’s flight"), the row "Group total $321, not complete, price Ashwin’s flight"; the cost is P-total\'s 🔍N', { r2, r3 });
    // D: my own booked bar carries no 🛬? while my primary is 🛬 Landing time; another booked traveler's keeps it on the organizer's phone
    const BOTH = seedAs(DWX, (d) => { town(d); d.responses['anjo-z5'].booked = true; chosenAt(d, '2026-11-06', '2026-11-09', 'PIA'); });
    const p4 = await boot136({ ls: tok([BOTH]) }), g4 = await boot136({ ls: lsOf([BOTH], { pialax_idea_me_v1: { [BOTH]: 'anjo-z5' } }) });
    act(p4, 'open', { id: BOTH }); const h4 = screen(p4); act(g4, 'open', { id: BOTH }); const hg = screen(g4);
    const barOf = (h, code) => { const i = h.indexOf('data-act="flight" data-id="' + BOTH + '" data-code="' + code + '"'); return i < 0 ? '' : h.slice(i, h.indexOf('</button>', i)); };
    const myBar = barOf(h4, 'ashwin-p8'), herBar = barOf(h4, 'anjo-z5');
    check(p4.api.primaryAction(p4.api.modelOf(BOTH), '2026-10-17') === 'times' && /data-act="mytimes"[^>]*aria-label="Landing time"/.test(h4) && !!myBar && !/data-k="notime"/.test(myBar) && /data-k="notime">🛬\?<\/span>/.test(herBar) &&
      !/data-k="notime"/.test(hg) && (h4.match(/data-k="notime"/g) || []).length === 1,
      'PIA-155 D the organizer\'s own booked bar shows no muted 🛬? while his primary already is "🛬 Landing time" (the same ask once); Anjo\'s booked bar keeps it on his phone; a guest\'s phone shows none', { my: myBar.slice(0, 120), her: herBar.slice(0, 120) });
  }

  // ═══ PIA-156 ═══
  section('PIA-156 who is set: a quiet key under the board (✈ Booked, ⏳ Waiting, 🏠 Hosting), its faces and the organizer\'s Remind; ✈ means booked; the booking toggles read as checkboxes');
  // the key's rows as drawn: the group's name, the word's long press, its glyph and key, its marked word, its faces, +N and Remind
  // (PIA-157: the key's 🚗 Rides row is read apart, rideRowOf; these are the whoSet rows)
  const keyRows = (h) => {
    const i = h.indexOf('<div class="wk"'); if (i < 0) return null;
    const k = h.slice(i, h.indexOf('</div></div>', i) + 12), un = (s) => (s || '').replace(/&amp;/g, '&');
    return k.split(/<div class="wkr(?=[" ])/).slice(1).filter((r) => !/^ wkride"/.test(r)).map((r) => ({
      name: un((/ aria-label="([^"]*)"/.exec(r) || [])[1]), lbl: (/class="wkl" aria-hidden="true" data-lbl="([^"]*)"/.exec(r) || [])[1],
      k: (/class="wg" data-k="([a-z]+)">/.exec(r) || [])[1], g: (/class="wg" data-k="[a-z]+">([^<]*)</.exec(r) || [])[1], word: (/<span data-lbl3>([^<]*)<\/span>/.exec(r) || [])[1] || '',
      faces: (r.match(/data-act="person" data-id="[^"]+" data-code="[^"]+"/g) || []).map((s) => /data-code="([^"]+)"/.exec(s)[1]),
      more: (/<span class="wkn tn" aria-hidden="true">\+(\d+)<\/span>/.exec(r) || [])[1] || '',
      rem: (/<button class="ib wkrem" data-act="([a-z]+)"(?: data-v="remind")? data-id="[^"]+"(?: data-code="([^"]+)")? aria-label="Remind[^"]*" data-lbl="Remind[^"]*"><span data-k="remind">/.exec(r) || []).slice(1).filter(Boolean).join(':'),
      remName: un((/<button class="ib wkrem"[^>]* aria-label="([^"]*)" data-lbl="([^"]*)">/.exec(r) || []).slice(1).join('|'))
    }));
  };
  const short = (rs) => (rs || []).map((r) => r.word + '|' + r.faces.join(',') + (r.more ? '+' + r.more : '') + (r.rem ? '|' + r.rem : ''));
  const marked = (h) => { const out = []; String(h).replace(/<[a-z]+\b[^>]*\sdata-lbl3\b[^>]*>([^<]*)</g, (_, w) => { out.push(w.trim()); return ''; }); return out; };
  const words3 = (h) => marked(h).join(' ').split(/\s+/).filter(Boolean).length;
  {
    const momIn = (d) => { d.responses['momdad-k3'] = Object.assign(RESP('in'), { member: 'momdad-k3', origin: 'PIA' }); };
    // "P town" as on the owner's phone: Peoria, 🔒, Mom & Dad hosting (confirmed), Ashwin booked with his times, Anjo In and not booked
    const town = (d) => { atPeoria(d); momIn(d); chosenAt(d, '2026-11-06', '2026-11-09', 'PIA'); d.responses['ashwin-p8'].booked = true; d.responses['ashwin-p8'].note = '🛬14:35 🛫15:30';
      d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); };
    // (a second trip in December: the phone has its Family board, and nobody's days clash)
    const PT = seedAs(DWX, town), D2 = seedAs(DWX, (d) => { d.idea.dates.departure = '2026-12-04'; d.idea.dates.return = '2026-12-07'; d.idea.notes = ''; }), rs = recShare();
    const org = await boot136({ ls: lsOf([PT, D2], { pialax_idea_keys_v1: keyOf([PT]), pialax_idea_me_v1: { [PT]: 'ashwin-p8', [D2]: 'ashwin-p8' } }), navigator: rs.nav });
    act(org, 'open', { id: PT }); const ho = screen(org), ro = keyRows(ho);
    const at = (s) => ho.indexOf(s);
    check(eq(short(ro), ['Waiting|anjo-z5|nudge:anjo-z5', 'Booked|ashwin-p8', 'Hosting|momdad-k3']) && eq(ro.map((r) => r.name), ['Not booked yet: Anjo', 'Booked: Ashwin', 'Hosting: Mom & Dad']) &&
      eq(ro.map((r) => r.lbl), ['Not booked yet', 'Booked', 'Hosting']) && eq(ro.map((r) => r.g + r.k), ['⏳waitbook', '✈booked', '🏠host']) && ro[0].remName === 'Remind Anjo|Remind Anjo' &&
      at('id="board-') < at('data-act="tokdoor"') && at('data-act="tokdoor"') < at('<div class="wk"') && !/class="pricerow|data-act="paidopen"|data-act="tokdoor"/.test(ho.slice(at('<div class="wk"'))) &&
      org.api.primaryAction(org.api.modelOf(PT), '2026-10-17') === 'rides' && eq(marked(ho), ['Waiting', 'Booked', 'Hosting', 'Rides']) && !/🎫/.test(ho),
      'PIA-156 A the owner\'s "P town" on his phone: under the board, after the rows already there (here his 🔑🔍), the key reads ⏳ Waiting 🗽 with Remind (named "Remind Anjo") first, then ✈ Booked 💪 and 🏠 Hosting 🌽; each row a group named "Not booked yet: Anjo", "Booked: Ashwin", "Hosting: Mom & Dad", its word\'s long press saying the same; no 🎫 on the page (PIA-157: his primary is now "🚗 Rides", the 4th marked word, and the key\'s Rides row between Waiting and Booked keeps its glyph alone)', { ro, marked: marked(ho) });
    // Remind is one tap: Anjo's own link (she is In, so her sheet offers no Share); no key in it; nothing written
    const p0 = nPosts(org), remD = ctl(keyRows(ho) ? ho.slice(at('<div class="wk"')) : '', 'nudge', { v: 'remind' });
    await org.api.ACTS.nudge({ dataset: remD }); await tick();
    act(org, 'person', { id: PT, code: 'anjo-z5' }); const ajSheet = sheet(org); org.api.closeSheet();
    check(rs.shared.length === 1 && new RegExp('/i/' + PT + '#m=anjo-z5$').test(rs.shared[0].url) && rs.shared[0].url.indexOf(KEY) < 0 && !/#k=|[?&]t=/.test(rs.shared[0].url) && nPosts(org) === p0 && !/data-act="nudge"/.test(ajSheet),
      'PIA-156 A Remind (the organizer\'s phone): one tap shares Anjo\'s own guest link (…/i/<id>#m=anjo-z5, never a key), though she is In and her sheet has no Share; nothing is written', rs.shared);
    // a face in the key opens that person's sheet (the board's own 'person' act)
    const kf = ctl(ho.slice(at('<div class="wk"')), 'person', { code: 'anjo-z5' }); org.api.ACTS.person({ dataset: kf });
    const opened = org.api.S.sheet && org.api.S.sheet.type === 'person' && org.api.S.sheet.p.code === 'anjo-z5'; org.api.closeSheet();
    // the guest (Anjo) and the host (Mom & Dad): the same rows, no Remind; Anjo's screen marks 5 words (I booked + the key's three)
    const g = await boot136({ ls: lsOf([PT], { pialax_idea_me_v1: { [PT]: 'anjo-z5' } }) }); act(g, 'open', { id: PT }); const hg = screen(g);
    const mom = await boot136({ ls: lsOf([PT], { pialax_idea_me_v1: { [PT]: 'momdad-k3' } }) }); act(mom, 'open', { id: PT }); const hm = screen(mom);
    // (PIA-157: Anjo's page marks I booked, Waiting, Rides and Booked (Hosting keeps its glyph: the cap of 5); Mom & Dad's primary is
    // "🚗 Rides", so their key's Rides row has no word and Hosting keeps its)
    check(opened && eq(short(keyRows(hg)), ['Waiting|anjo-z5', 'Booked|ashwin-p8', '|momdad-k3']) && eq(short(keyRows(hm)), ['Waiting|anjo-z5', 'Booked|ashwin-p8', 'Hosting|momdad-k3']) && !/wkrem/.test(hg + hm) &&
      eq(marked(hg), ['Waiting', 'Rides', 'Booked', 'I booked']) && words3(hg) === 5 && /<span class="tkg" data-k="tkoff" aria-hidden="true">☐<\/span> <span data-lbl3>I booked<\/span>/.test(hg) &&
      eq(marked(hm), ['Waiting', 'Booked', 'Hosting', 'Rides']),
      'PIA-156 A a face in the key opens their sheet; Anjo\'s and Mom & Dad\'s phones show the same rows with no Remind (guests share nothing from the key); Anjo\'s trip page marks 5 words, "☐ I booked" and the key\'s Waiting, Rides (PIA-157) and Booked, its Hosting row glyph-only (the cap)', { g: short(keyRows(hg)), m: marked(hg), mom: marked(hm) });
    // ✈ is booked wherever a face carries the mark: the board, the Family board, his sheet's 72px face; no 🎫 left on any of them
    const fh = org.api.renderFamily().html; act(org, 'person', { id: PT, code: 'ashwin-p8' }); const ash = sheet(org); org.api.closeSheet();
    const boardFace = (ho.slice(at('id="board-'), at('<div class="wk"')).match(/data-code="ashwin-p8"[^>]*>[\s\S]*?<\/button>/) || [''])[0];
    check(/<span class="bd"><span data-k="booked">✈<\/span><\/span>/.test(boardFace) && /data-k="booked">✈</.test(fh) && /data-k="booked">✈</.test(ash) && !/🎫/.test(fh + ash + hg + hm) &&
      org.api.LEGEND.booked[0] === '✈' && org.api.LEGEND.booked[1] === 'Booked' && org.api.LEGEND.waitans[0] === '⏳' && org.api.LEGEND.waitans[1] === 'No answer yet' &&
      org.api.LEGEND.waitbook[0] === '⏳' && org.api.LEGEND.waitbook[1] === 'Not booked yet' && org.api.LEGEND.remind[1] === 'Remind' && org.api.LEGEND.host[0] === '🏠' &&
      org.api.LEGEND.tkoff[0] === '☐' && org.api.LEGEND.tkon[0] === '☑' + String.fromCharCode(0xFE0E) && !org.api.LEGEND.mybook && !org.api.LEGEND.waiton,
      'PIA-156 B ✈ is the booked badge in the same place on the board, the Family board and his sheet; ⓘ\'s key says ✈ Booked, ⏳ No answer yet / Not booked yet (by stage), the Remind, 🏠 Host, ☐ Not booked, ☑ Booked (☑ in text presentation, U+FE0E); no 🎫 anywhere drawn',
      { boardFace: boardFace.slice(0, 400), fam: (/[^>]{0,80}data-k="booked">[^<]*</.exec(fh) || [''])[0], ash: (/[^>]{0,80}data-k="booked">[^<]*</.exec(ash) || [''])[0] });
  }
  {
    // the answers stage (no 🔒, nobody booked): ⏳ Waiting is who has not answered (never a host), 🏠 Hosting the hosts; Remind is the
    // nudge for one; with several waiting while the primary is the trip's Share already, no second share in the key
    const ASK = seedAs(DWX, (d) => { atPeoria(d); }), rs = recShare();
    const SEV = seedAs(DWX, (d) => { delete d.responses['momdad-k3']; });
    // (his token phone: the price row is there before 🔒, and keeps its place right under the board, the key after it)
    const o = await boot136({ ls: lsOf([ASK, SEV], { pialax_idea_keys_v1: keyOf([ASK, SEV]), pialax_idea_me_v1: { [ASK]: 'ashwin-p8', [SEV]: 'ashwin-p8' }, pialax_proxy_token: TOKEN }), navigator: rs.nav });
    act(o, 'open', { id: ASK }); const ha = screen(o), ra = keyRows(ha), ia = (s) => ha.indexOf(s);
    await o.api.ACTS.nudge({ dataset: ctl(ha.slice(ha.indexOf('<div class="wk"')), 'nudge', { v: 'remind' }) || {} }); await tick();
    act(o, 'back'); act(o, 'open', { id: SEV }); const hs = screen(o), rsv = keyRows(hs);
    check(o.api.primaryAction(o.api.modelOf(ASK), '2026-10-17') === 'share' && eq(short(ra), ['Waiting|anjo-z5|nudge:anjo-z5', 'Hosting|momdad-k3']) && eq(ra.map((r) => r.name), ['No answer yet: Anjo', 'Hosting: Mom & Dad']) && ra[0].lbl === 'No answer yet' &&
      ra[0].k === 'waitans' && ra[0].remName === 'Remind Anjo|Remind Anjo' &&
      ia('id="board-') < ia('class="pricerow"') && ia('class="pricerow"') < ia('<div class="wk"') && ia('<div class="wk"') < ia('class="split prim"') &&
      o.api.modelOf(ASK).members.find((x) => x.code === 'momdad-k3').status === 'host-default' && rs.shared.length === 1 && new RegExp('/i/' + ASK + '#m=anjo-z5$').test(rs.shared[0].url) &&
      eq(short(rsv), ['Waiting|momdad-k3,anjo-z5']) && /class="btn pri share/.test(hs) && marked(ha).length === 2,
      'PIA-156 A before 🔒: ⏳ Waiting is who has not answered ("No answer yet: Anjo"), Mom & Dad\'s unconfirmed default is 🏠 Hosting; the organizer\'s price row keeps its place under the board, the key after it and above the primary; Remind ("Remind Anjo") beside one waiting is her nudge (her own link); with two waiting, the primary already is the trip\'s Share, so the key adds no second one', { ra: short(ra), rsv: short(rsv), shared: rs.shared, order: [ia('id="board-'), ia('class="pricerow"'), ia('<div class="wk"'), ia('class="split prim"')] });
  }
  {
    // several waiting to book once 🔒: Remind is the trip's guest share (tshare), one tap, no #m=; Maybe waits too; Out is in no row
    const L3 = seedAs(DWX, (d) => { chosenAt(d, '2026-11-06', '2026-11-09', 'RDU'); d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); });
    const MX = seedAs(DWX, (d) => { chosenAt(d, '2026-11-06', '2026-11-09', 'RDU'); d.responses['momdad-k3'].status = 'out'; d.responses['anjo-z5'] = Object.assign(RESP('maybe'), { member: 'anjo-z5', origin: 'LGA' }); });
    const rs = recShare(), o = await boot136({ ls: lsOf([L3, MX], { pialax_idea_keys_v1: keyOf([L3, MX]), pialax_idea_me_v1: { [L3]: 'ashwin-p8', [MX]: 'ashwin-p8' } }), navigator: rs.nav });
    act(o, 'open', { id: L3 }); const h3 = screen(o), r3 = keyRows(h3), p0 = nPosts(o);
    await o.api.ACTS.tshare({ dataset: ctl(h3.slice(h3.indexOf('<div class="wk"')), 'tshare') || {} }); await tick();
    act(o, 'back'); act(o, 'open', { id: MX }); const hx = screen(o), rx = keyRows(hx);
    check(o.api.primaryAction(o.api.modelOf(L3), '2026-10-17') === 'book' && eq(short(r3), ['Waiting|momdad-k3,ashwin-p8,anjo-z5|tshare']) && r3[0].name === 'Not booked yet: Mom & Dad, Ashwin and Anjo' &&
      rs.shared.length === 1 && new RegExp('/i/' + L3 + '$').test(rs.shared[0].url) && nPosts(o) === p0 && eq(marked(h3), ['Waiting', 'I booked']) &&
      eq(short(rx), ['Waiting|ashwin-p8,anjo-z5|nudge:anjo-z5']) && !/momdad-k3/.test(hx.slice(hx.indexOf('<div class="wk"'), hx.indexOf('</div></div>', hx.indexOf('<div class="wk"')))),
      'PIA-156 A once 🔒 with three to book (me among them): Remind is the trip\'s guest share in one tap (no #m=, nothing written); a Maybe waits to book too, someone Out is in no row (Remind is then Anjo\'s own link: she is the one besides me)', { r3: short(r3), rx: short(rx), shared: rs.shared });
  }
  {
    // the 8-member trip at a place none of them lives, 🔒, nobody booked: as many faces as the row holds at 360px, then +N
    const E8 = seedAs(M8X, (d) => { d.idea.destination = { city: 'New Orleans', airport: 'MSY' }; Object.keys(d.responses).forEach((c) => { d.responses[c].status = 'in'; d.responses[c].booked = false; }); chosenAt(d, '2026-12-11', '2026-12-14', 'MSY'); });
    const o = await boot136({ ls: lsOf([E8], { pialax_idea_keys_v1: keyOf([E8]), pialax_idea_me_v1: { [E8]: 'grandmajosephine-nf' } }) });
    const g = await boot136({ ls: lsOf([E8], { pialax_idea_me_v1: { [E8]: 'bartholomewmontgomeryfitzgera-dj' } }) });
    act(o, 'open', { id: E8 }); act(g, 'open', { id: E8 });
    const ho = screen(o), hg = screen(g), ro = keyRows(ho), rg = keyRows(hg), m = o.api.modelOf(E8);
    check(m.members.length === 8 && ro.length === 1 && ro[0].faces.length === 4 && ro[0].more === '4' && ro[0].rem === 'tshare' && rg[0].faces.length === 5 && rg[0].more === '3' && !rg[0].rem &&
      ro[0].name === 'Not booked yet: ' + m.members.slice(0, 7).map((x) => x.short || x.one).join(', ') + ' and ' + (m.members[7].short || m.members[7].one) && eq(ro[0].faces, m.members.slice(0, 4).map((x) => x.code)),
      'PIA-156 A the 8-member trip (🔒, nobody booked, no host): the organizer\'s Waiting row holds 4 faces, +4 and Remind at 360px (5 and +3 on a guest\'s phone, with no Remind); the row\'s name says all eight', { ro: short(ro), rg: short(rg), name: ro[0].name });
  }
  {
    // no key on a paid, removed or past trip; the family's v1 Thanksgiving shows 🏠 Hosting; a host who has not confirmed stays Hosting
    const PD = seedAs(DWX, (d) => { chosenAt(d, '2026-11-06', '2026-11-09', 'RDU'); d.decision.stage = 'booked'; d.decision.actual_total = 905; });
    const DR = seedAs(DWX, (d) => { d.decision.stage = 'dropped'; }), PS = seedAs(DWX, (d) => { d.idea.dates.departure = '2026-09-04'; d.idea.dates.return = '2026-09-07'; });
    const TG = seedAs(TGX), ids = [PD, DR, PS, TG];
    const o = await boot136({ ls: lsOf(ids, { pialax_idea_keys_v1: keyOf(ids), pialax_idea_me_v1: { [PD]: 'ashwin-p8', [DR]: 'ashwin-p8', [PS]: 'ashwin-p8', [TG]: 'LAX' } }) });
    // (each trip page drew: its board is there, and no key under it)
    const none = [PD, DR, PS].map((id) => { act(o, 'open', { id }); if (o.api.S.sheet) o.api.closeSheet(); const h = screen(o); act(o, 'back'); return h.indexOf('id="board-' + id + '"') >= 0 && h.indexOf('class="wk"') < 0; });
    const mom = await boot136({ ls: lsOf([TG], { pialax_idea_me_v1: { [TG]: 'PIA' } }) }); act(mom, 'open', { id: TG }); const hm = screen(mom);
    act(o, 'open', { id: TG }); const hv = screen(o);
    check(none.every(Boolean) && eq(short(keyRows(hv)), ['Hosting|PIA']) && eq(short(keyRows(hm)), ['Hosting|PIA']) && keyRows(hm)[0].name === 'Hosting: Mom & Dad' && o.api.modelOf(TG).legacy &&
      eq(marked(hm), ['Hosting?', 'Hosting']),
      'PIA-156 A no key on a paid, removed or past trip; the family\'s v1 Thanksgiving (both travelers answered, its v1 choice not a 🔒) reads 🏠 Hosting Mom & Dad on his phone and on Mom\'s, under "Hosting?" there', { none, v1: short(keyRows(hv)), mom: marked(hm) });
  }
  {
    // the busiest marked state: the organizer is a host who has not confirmed ("Hosting?"), the dates are not 🔒 but someone booked
    // early, and Lock dates is his primary: the key keeps 2 words (Booked, Waiting), and 🏠 alone (named, long-pressed) — 5 in all
    const BZ = seedAs(DWX, (d) => { atPeoria(d); d.responses['ashwin-p8'].booked = true; d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); });
    const o = await boot136({ ls: lsOf([BZ], { pialax_idea_keys_v1: keyOf([BZ]), pialax_idea_me_v1: { [BZ]: 'momdad-k3' } }) });
    act(o, 'open', { id: BZ }); const h = screen(o), r = keyRows(h);
    check(o.api.primaryAction(o.api.modelOf(BZ), '2026-10-17') === 'lock' && eq(r.map((x) => x.word), ['Waiting', 'Booked', '']) && r[2].name === 'Hosting: Mom & Dad' && r[2].lbl === 'Hosting' && r[2].g === '🏠' &&
      eq(marked(h), ['Hosting?', 'Waiting', 'Booked', 'Lock dates']) && words3(h) === 5 && r[0].rem === 'nudge:anjo-z5',
      'PIA-156 C the most a trip page marks: "Hosting?" (his own unconfirmed host answer), "Lock dates" and the key\'s Waiting and Booked are 5; the third row keeps 🏠 with its faces, named "Hosting: Mom & Dad" (its word left out: never over 5)', { words: marked(h), rows: short(r) });
  }
  {
    // the booking toggles as checkboxes, through the real Worker: the same writes as before (mybook / unbook / the organizer's booked)
    const TB = seedAs(DWX, (d) => { chosenAt(d, '2026-11-06', '2026-11-09', 'RDU'); d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); });
    const g = await boot136({ ls: lsOf([TB], { pialax_idea_me_v1: { [TB]: 'anjo-z5' } }) });
    act(g, 'open', { id: TB }); const pr = screen(g), q0 = g.fetches.length;
    await tap(g, pr, 'mybook'); await tick();
    const b1 = posts(g, q0), after = srv.read(TB).responses['anjo-z5'];
    act(g, 'person', { id: TB, code: 'anjo-z5' }); const mine = sheet(g);
    const q1 = g.fetches.length; await tap(g, mine, 'unbook'); const armedS = sheet(g); await tap(g, armedS, 'unbook'); await tick(); g.api.closeSheet();
    const b2 = posts(g, q1), undone = srv.read(TB).responses['anjo-z5'].booked === false;
    const o = await boot136({ ls: lsOf([TB], { pialax_idea_keys_v1: keyOf([TB]), pialax_idea_me_v1: { [TB]: 'ashwin-p8' } }) });
    act(o, 'open', { id: TB }); act(o, 'person', { id: TB, code: 'anjo-z5' }); const os0 = sheet(o), q2 = o.fetches.length;
    await tap(o, os0, 'booked', { code: 'anjo-z5' }); await tick(); const os1 = sheet(o); o.api.closeSheet();
    const b3 = posts(o, q2);
    check(/data-act="mybook"[^>]*aria-pressed="false"[^>]*>(<span class="tkg" data-k="tkoff" aria-hidden="true">☐<\/span>) <span data-lbl3>I booked<\/span>/.test(pr) &&
      b1.length === 1 && b1[0].path === '/idea/booked' && b1[0].body.booked === true && b1[0].body.member === 'anjo-z5' && after.booked === true &&
      /data-act="unbook"[^>]*aria-pressed="true"[^>]*data-lbl="I booked"><span class="tkg" data-k="tkon" aria-hidden="true">☑︎<\/span> I booked<\/button>/.test(mine) && /class="btn tkb tkon arm"[^>]*aria-label="Confirm not booked"/.test(armedS) &&
      b2.length === 1 && b2[0].path === '/idea/booked' && b2[0].body.booked === false && undone && srv.read(TB).responses['anjo-z5'].booked === true &&
      /data-act="booked"[^>]*data-code="anjo-z5" aria-pressed="false"[^>]*><span class="tkg" data-k="tkoff" aria-hidden="true">☐<\/span> Booked<\/button>/.test(os0) && b3.length === 1 && b3[0].path === '/idea/booked' && b3[0].body.booked === true &&
      /data-act="booked"[^>]*data-code="anjo-z5" aria-pressed="true"[^>]*><span class="tkg" data-k="tkon" aria-hidden="true">☑︎<\/span> Booked<\/button>/.test(os1),
      'PIA-156 B the toggles read as checkboxes with the same words both ways: "☐ I booked" (aria-pressed false) beside Book is one /idea/booked (booked); in her sheet "☑ I booked" (pressed) takes two taps to undo, one /idea/booked (not booked); the organizer\'s "☐ Booked" for Anjo becomes "☑ Booked" after one /idea/booked: the same writes as before',
      { b1, b2, b3, pr: (/<button[^>]*data-act="mybook"[\s\S]*?<\/button>/.exec(pr) || [''])[0], mine: (/<button[^>]*data-act="unbook"[\s\S]*?<\/button>/.exec(mine) || [''])[0], armed: (/<button[^>]*data-act="unbook"[^>]*>/.exec(armedS) || [''])[0],
        os0: (/<button[^>]*data-act="booked"[\s\S]*?<\/button>/.exec(os0) || [''])[0], os1: (/<button[^>]*data-act="booked"[\s\S]*?<\/button>/.exec(os1) || [''])[0] });
  }
  {
    // ✈ is the one glyph for booked: no 🎫 left in app.html outside comments (toasts, confirms, LEGEND, aria and long-press text)
    const code = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"])\/\/[^\n]*/g, '$1');
    check(code.indexOf('🎫') < 0 && /'⚠✈', 'Someone booked'/.test(html) && /toast\('✈↩\?'\)/.test(html),
      'PIA-156 B no 🎫 is drawn anywhere: the confirms read ⚠✈ ("Someone booked"), taking a booking back ✈↩?, the toasts ✈ / ✈⚠ (code comments may keep it)');
  }

  // ═══ PIA-157 ═══
  section('PIA-157 rides: the key\'s 🚗 Rides row, the primary, the card, P-rides through the real Worker, 🚌 / 🚙, the phone calendar, the Map\'s badges, 💵\'s wait, the time-save tell');
  {
    // "P town" as on the family's phones: 📍ORD (the PIA / ORD pair), 🔒 11/20–11/30, Mom & Dad at PIA hosting (not answered yet), Ashwin
    // booked landing 14:35 and leaving 15:30, Anjo In and not booked. The phones read 10/17 (this suite's clock)
    const ptown = (d) => { d.idea.destination = { city: 'Chicago', airport: 'ORD' }; d.idea.dates.departure = '2026-11-20'; d.idea.dates.return = '2026-11-30'; d.idea.notes = ''; delete d.responses['momdad-k3'];
      d.idea.members[1].label = '💪 Ashwin'; chosenAt(d, '2026-11-20', '2026-11-30', 'ORD'); d.responses['ashwin-p8'].booked = true; d.responses['ashwin-p8'].booked_at = '2026-10-16T00:00:00.000Z'; d.responses['ashwin-p8'].note = '🛬14:35 🛫15:30';
      d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); };
    const rowOf = (h) => { const i = h.indexOf('<div class="wkr wkride"'); if (i < 0) return ''; const j = h.indexOf('<div class="wkr', i + 10); return j < 0 ? h.slice(i, h.indexOf('</div></div>', i) + 6) : h.slice(i, j); };
    const PT = seedAs(DWX, ptown), rs = recShare();
    const org = await boot136({ ls: lsOf([PT], { pialax_idea_keys_v1: keyOf([PT]), pialax_idea_me_v1: { [PT]: 'ashwin-p8' } }), navigator: rs.nav, rec: ['#toast'] });
    const mom = await boot136({ ls: lsOf([PT], { pialax_idea_me_v1: { [PT]: 'momdad-k3' } }), rec: ['#toast'] });
    const anj = await boot136({ ls: lsOf([PT], { pialax_idea_me_v1: { [PT]: 'anjo-z5' } }) });
    const nob = await boot136({ ls: lsOf([PT]) });
    act(org, 'open', { id: PT }); act(mom, 'open', { id: PT }); act(anj, 'open', { id: PT }); act(nob, 'open', { id: PT }); if (nob.api.S.sheet) nob.api.closeSheet();
    const ho = screen(org), hm = screen(mom), ha = screen(anj), hn = screen(nob), ro = rowOf(ho), rm = rowOf(hm), ra = rowOf(ha), rn = rowOf(hn);
    const chips = (r) => (r.match(/<button class="rk[ "][^>]*data-act="rides"[^>]*data-v="([^"]+)"/g) || []).map((s) => /data-v="([^"]+)"/.exec(s)[1]);
    const order = (h) => ['<div class="wkr" role="group" aria-label="Not booked yet', '<div class="wkr wkride"', 'aria-label="Booked:', 'aria-label="Hosting:'].map((s) => h.indexOf(s));
    check(org.api.primaryAction(org.api.modelOf(PT), '2026-10-17') === 'rides' && mom.api.primaryAction(mom.api.modelOf(PT), '2026-10-17') === 'rides' && anj.api.primaryAction(anj.api.modelOf(PT), '2026-10-17') === 'book' &&
      /<button class="btn pri" data-act="rides" data-id="[^"]+" aria-label="Rides"><span data-k="drive" aria-hidden="true">🚗<\/span> <span data-lbl3>Rides<\/span><\/button>/.test(ho) && /data-act="rides"[^>]*aria-label="Rides"[^>]*><span data-k="drive"[^>]*>🚗<\/span> <span data-lbl3>Rides/.test(hm) &&
      eq(marked(ho), ['Waiting', 'Booked', 'Hosting', 'Rides']) && eq(marked(hm), ['Hosting?', 'Waiting', 'Booked', 'Hosting', 'Rides']) && eq(marked(ha), ['Waiting', 'Rides', 'Booked', 'I booked']) &&
      !/data-lbl3>Rides/.test(ro) && /data-lbl3>Rides/.test(ra) && order(ho).every((v, i, a) => v > 0 && (!i || v > a[i - 1])) && order(ha).every((v, i, a) => v > 0 && (!i || v > a[i - 1])) &&
      eq(chips(ro), ['aORD1120-ashwin-p8']) && /<span class="wkn tn" aria-hidden="true">\+1<\/span>/.test(ro) && eq(chips(rm), ['aORD1120-ashwin-p8', 'dORD1130-ashwin-p8']) &&
      /aria-label="Rides: Ashwin no driver yet"/.test(ro) && /aria-label="Lands ORD 11\/20 at 14:35, Ashwin, no driver yet"/.test(ro) && /<span class="rkg" data-k="arrive" aria-hidden="true">🛬<\/span><span class="tn">11\/20<\/span><span class="rkf" aria-hidden="true" data-pic>💪<\/span>/.test(ro) &&
      /data-act="nudge" data-v="ride"[^>]*data-code="momdad-k3" aria-label="Ask Mom &amp; Dad"/.test(ro) && !/data-act="nudge"|data-act="tshare"/.test(rm + ra + rn) && !!rn && /data-act="rides"/.test(rn),
      'PIA-157 A the key\'s 🚗 Rides row, after ⏳ Waiting and before ✈ Booked / 🏠 Hosting, on every phone: the organizer and Mom & Dad (a candidate host) get "🚗 Rides" as their primary (its word, so the row keeps its glyph alone: 4 marked words); Anjo keeps Book and the row its word (Waiting, Rides, Booked; Hosting drops to its glyph: 5); open runs as dashed chips (🛬 11/20 💪, said in full) as many as fit at 360 (the organizer\'s Ask beside them: 1 and +1; Mom & Dad 2), and only the organizer\'s row ends in Ask (one candidate: "Ask Mom & Dad", her own link)',
      { ro: ro.slice(0, 600), marked: [marked(ho), marked(hm), marked(ha)] });
    // the card: 🚗? for the organizer and in the host's 🏠 place for Mom & Dad; a tap opens the trip with P-rides on top
    const so = org.api.slotHTML(org.api.modelOf(PT)), sm = mom.api.slotHTML(mom.api.modelOf(PT)), sa = anj.api.slotHTML(anj.api.modelOf(PT));
    act(mom, 'back'); act(mom, 'ridescard', { id: PT }); const momFromCard = mom.api.S.trip === PT && mom.api.S.sheet && mom.api.S.sheet.type === 'rides';
    const sheetM = sheet(mom);
    check(/class="slot ride z" data-act="ridescard"[^>]*aria-label="Rides open" data-lbl="Rides open"><span data-k="noride" aria-hidden="true">🚗\?<\/span>/.test(so) && /data-act="ridescard"/.test(sm) && !/🏠/.test(sm) && !/ridescard/.test(sa) && momFromCard &&
      /<b class="lc">ORD<\/b>/.test(sheetM) && (sheetM.match(/data-act="ride" [^>]*data-code="momdad-k3" aria-pressed="false"/g) || []).length === 2 && (sheetM.match(/> Drive<\/button>/g) || []).length === 2 &&
      /<span class="rlv" role="img" aria-label="Leave home 12:05: 2:30 drive, at ORD as Ashwin lands"/.test(sheetM) && /aria-label="Leave home 11:00: 2:30 drive, 2:00 before Ashwin’s flight"/.test(sheetM) &&
      /<span class="rq" data-k="noride">🚗\?<\/span>/.test(sheetM) && /data-k="waitbook"[^>]*>⏳<\/span><span aria-hidden="true" data-pic>🗽/.test(sheetM) && !/data-act="ridecal"|data-act="ground"/.test(sheetM),
      'PIA-157 C/D the card\'s slot is 🚗? ("Rides open") for the organizer and in Mom & Dad\'s 🏠 place (Anjo\'s keeps her Book); from the list it opens the trip with P-rides on top: 📍ORD, both runs, ⏰12:05 / ⏰11:00 (a long press: "2:30 drive, at ORD as Ashwin lands", "2:00 before Ashwin’s flight"), dashed 🚗? on each leg, "☐ 🚗 Drive" twice on Mom & Dad\'s phone, ⏳ 🗽 below; no 📅 Phone yet, no 🚌 / 🚙 on someone else\'s leg', sheetM.slice(0, 800));
    // Mom & Dad claim R1 on their phone: their first answer (In, by them: no 📞), the claim in their own note; 🚗✓ and ↩ takes it back
    const p0 = nPosts(mom);
    await tap(mom, sheetM, 'ride', { v: 'aORD1120-ashwin-p8' }); await until(() => /🚗/.test((srv.read(PT).responses['momdad-k3'] || {}).note || '')); await tick();
    const w1 = posts(mom, 0).slice(-1)[0], toast1 = mom.rec['#toast'].__rec.html.slice(-1)[0] || '', md1 = srv.read(PT).responses['momdad-k3'];
    const undo = mom.api.S.undo; await undo(); await until(() => !/🚗/.test(srv.read(PT).responses['momdad-k3'].note)); await tick();
    const afterUndo = srv.read(PT).responses['momdad-k3'];
    check(nPosts(mom) - p0 === 2 && w1.path === '/idea/respond' && w1.body.member === 'momdad-k3' && w1.body.status === 'in' && w1.body.note === '🚗ashwin-p8.aORD1120' && md1.status === 'in' &&
      /🚗✓/.test(toast1) && /data-act="undo"/.test(toast1) && afterUndo.note === '' && afterUndo.status === 'in',
      'PIA-157 D Mom & Dad\'s "☐ 🚗 Drive" on R1: one /idea/respond, their own first answer In (no 📞) with 🚗ashwin-p8.aORD1120 in their note; 🚗✓ with ↩, which takes the claim back (their In stays)', { w1, md1, afterUndo });
    // claim both, then the trip page: 🚗 11/20 ⏰12:05 with Ashwin's face, no word; the card 🚗11/20; the key shows 🌽 driving
    const sm2 = sheet(mom); await tap(mom, sm2, 'ride', { v: 'aORD1120-ashwin-p8' }); await until(() => /aORD1120/.test(srv.read(PT).responses['momdad-k3'].note)); await tick();
    await tap(mom, sheet(mom), 'ride', { v: 'dORD1130-ashwin-p8' }); await until(() => /dORD1130/.test(srv.read(PT).responses['momdad-k3'].note)); await tick();
    const both = srv.read(PT).responses['momdad-k3'].note, sheetM2 = sheet(mom); mom.api.closeSheet(); const hm2 = screen(mom), rm2 = rowOf(hm2), slot2 = mom.api.slotHTML(mom.api.modelOf(PT));
    check(both === '🚗ashwin-p8.aORD1120,ashwin-p8.dORD1130' && mom.api.primaryAction(mom.api.modelOf(PT), '2026-10-17') === 'drive' &&
      /<button class="btn pri drv" data-act="rides" data-id="[^"]+" data-v="aORD1120-ashwin-p8" aria-label="Leave home 12:05 Friday for Ashwin" data-lbl="Leave home 12:05"><span data-k="drive" aria-hidden="true">🚗<\/span><span class="tn">11\/20<\/span><span aria-hidden="true"><span data-k="lvhome">⏰<\/span><span class="tn">12:05<\/span><\/span><span class="drvf"/.test(hm2) &&
      eq(marked(hm2), ['Waiting', 'Rides', 'Booked', 'Hosting']) && /aria-label="Rides: Mom &amp; Dad drive Ashwin"/.test(rm2) && /data-act="rides"[^>]*data-code="momdad-k3" aria-label="Mom &amp; Dad driving"/.test(rm2) &&
      /data-act="ridescard"[^>]*data-v="aORD1120-ashwin-p8" aria-label="Drive 11\/20" data-lbl="Drive 11\/20"><span data-k="drive" aria-hidden="true">🚗<\/span><span class="tn">11\/20<\/span>/.test(slot2) &&
      (sheetM2.match(/aria-pressed="true"/g) || []).length === 2 && /download="rides-diwaliinraleigh\.ics" data-act="ridecal"/.test(sheetM2) && /<span class="ndot" aria-hidden="true"><\/span><\/a>/.test(sheetM2),
      'PIA-157 B/C both runs claimed: Mom & Dad\'s primary is "🚗 11/20 ⏰12:05" with Ashwin\'s face (no word; "Leave home 12:05 Friday for Ashwin"), the key\'s row "Mom & Dad drive Ashwin" (its word back: 4 marked), the card 🚗11/20; P-rides shows ☑ twice and 📅 Phone with its dot', { both, rm2: rm2.slice(0, 400) });
    // 📅 Phone: one file, both runs, floating local times, two alarms each, the guest link only; tapping it keeps its signature (the dot rests)
    mom.api.ACTS.rides({ dataset: { id: PT } }); const cal = /href="data:text\/calendar;charset=utf-8,([^"]+)"/.exec(sheet(mom)), ics = cal ? decodeURIComponent(cal[1]) : '';
    mom.api.ACTS.ridecal({ dataset: { id: PT } }); await tick(4); const kept = mom.api.uiRead().rides || {};
    const dotGone = !/<span class="ndot" aria-hidden="true"><\/span><\/a>/.test(sheet(mom)); mom.api.closeSheet();
    check(/BEGIN:VCALENDAR/.test(ics) && (ics.match(/BEGIN:VEVENT/g) || []).length === 2 && (ics.match(/BEGIN:VALARM/g) || []).length === 4 && /DTSTART:20261120T120500\r\n/.test(ics) && /DTSTART:20261130T110000\r\n/.test(ics) &&
      ics.indexOf(KEY) < 0 && !/#k=|t=|\$/.test(ics) && /DESCRIPTION:https:\/\/pialax-proxy/.test(ics) && typeof kept[PT] === 'string' && kept[PT].length > 10 && dotGone && !mom.api.rideChanged(mom.api.modelOf(PT)),
      'PIA-157 D 📅 Phone: one calendar file with both runs (DTSTART 11/20 12:05 and 11/30 11:00, floating), two alarms each, the guest link alone; a tap keeps its signature on this phone (pialax_ui_v1.rides) and the dot rests', ics.slice(0, 300));
    // a same-day time change: the claim carries, ⏰ moves; Mom & Dad's card and the Trips tab get their dot (the calendar holds the old time);
    // the organizer saved it, so his toast offers to tell the driver (their own link, the new ride in words)
    act(org, 'person', { id: PT, code: 'ashwin-p8' }); typed(org, 'tm-arr', '15:05', 'ashwin-p8'); org.api.closeSheet();
    await until(() => /🛬15:05/.test(srv.read(PT).responses['ashwin-p8'].note)); await until(() => /🛬✓/.test(org.rec['#toast'].__rec.html.slice(-1)[0] || '')); await tick();
    const toastO = org.rec['#toast'].__rec.html.slice(-1)[0] || '', tellBtn = /data-act="toastshare" aria-label="Tell Mom &amp; Dad"/.test(toastO);
    const n0 = rs.shared.length; await org.api.ACTS.toastshare({ dataset: {} }); await tick();
    const told = rs.shared[n0] || {};
    await mom.api.refreshAll(true); await tick(); mom.api.render();
    const mm = mom.api.modelOf(PT), card = mom.api.renderIdeas().html;
    check(tellBtn && /🛬✓/.test(toastO) && /\/i\/[A-Za-z0-9_-]{22}#m=momdad-k3$/.test(told.url || '') && /^🚗 Ride update: Fri 11\/20: pick up Ashwin at ORD Chicago, lands 3:05 PM \(leave home 12:35 PM\)\.$/.test(told.text || '') &&
      (told.text || '').indexOf(KEY) < 0 && mom.api.rideChanged(mm) && mom.api.tripsBadge() >= 1 && /data-k="ridenew"/.test(card) && mom.api.primaryAction(mm, '2026-10-17') === 'drive',
      'PIA-157 H/J Ashwin\'s landing moved to 15:05 (the same day): Mom & Dad\'s claim carries, ⏰ is 12:35; his toast "🛬✓" carries the share symbol, "Tell Mom & Dad": her own link with "🚗 Ride update: Fri 11/20: pick up Ashwin … lands 3:05 PM (leave home 12:35 PM)." (no key); on her phone the card\'s dot (Rides changed) and the Trips numeral until she adds the rides again', { told, toastO });
    // P-person: each booked leg's ride after its time (🌽 driving), into P-rides; Mom & Dad's host line 🏠 ORD 🚗2
    act(org, 'person', { id: PT, code: 'ashwin-p8' }); const pa = sheet(org); org.api.closeSheet();
    act(org, 'person', { id: PT, code: 'momdad-k3' }); const pm2 = sheet(org); org.api.closeSheet();
    check(/<button class="rgl" data-act="rides" data-id="[^"]+" data-v="aORD1120-ashwin-p8" aria-label="Landing 11\/20 ride: Mom &amp; Dad driving" data-lbl="Mom &amp; Dad driving"><span aria-hidden="true" data-pic>🌽<\/span><\/button>/.test(pa) &&
      /<button class="rgl" data-act="rides" data-id="[^"]+" data-v="dORD1130-ashwin-p8" aria-label="Leaving 11\/30 ride: Mom &amp; Dad driving" data-lbl="Mom &amp; Dad driving"><span aria-hidden="true" data-pic>🌽<\/span><\/button>/.test(pa) &&
      /<div class="pline"><span data-k="host">🏠<\/span><b>ORD<\/b><button class="rgl" data-act="rides"[^>]*aria-label="Mom &amp; Dad drive 2 rides" data-lbl="2 rides"><span data-k="drive" aria-hidden="true">🚗<\/span><span class="tn">2<\/span><\/button><\/div>/.test(pm2),
      'PIA-157 E P-person: Ashwin\'s 🛬 and 🛫 rows each show 🌽 (Mom & Dad driving) after the time, a 44px button into P-rides at that run, named by its leg and day (fix pass: "Landing 11/20 ride: …", "Leaving 11/30 ride: …", so the two differ); Mom & Dad\'s host line reads 🏠 ORD 🚗2', { pa: (pa.match(/<button class="rgl"[^]*?<\/button>/) || [''])[0], pm2: (/<div class="pline">[\s\S]*?<\/div>/.exec(pm2) || [''])[0] });
  }
  {
    // the organizer for Mom & Dad (their default answer): his face toggle is an answer on their behalf (📞, In); Anjo booked lands 15:10 and
    // leaves 17:00 (one run each way with Ashwin); 🚌 for her way home (her own phone), back with ↩; the Ask for several; 🚙 from his phone
    const PT2 = seedAs(DWX, (d) => { d.idea.destination = { city: 'Chicago', airport: 'ORD' }; d.idea.dates.departure = '2026-11-20'; d.idea.dates.return = '2026-11-30'; d.idea.notes = ''; delete d.responses['momdad-k3'];
      chosenAt(d, '2026-11-20', '2026-11-30', 'ORD'); d.responses['ashwin-p8'].booked = true; d.responses['ashwin-p8'].note = '🛬14:35 🛫15:30';
      d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA', booked: true, note: '🛬18:10 🛫17:00', available_from: '2026-11-18' }); });
    const rs = recShare(), org = await boot136({ ls: lsOf([PT2], { pialax_idea_keys_v1: keyOf([PT2]), pialax_idea_me_v1: { [PT2]: 'ashwin-p8' } }), navigator: rs.nav, rec: ['#toast'] });
    const anj = await boot136({ ls: lsOf([PT2], { pialax_idea_me_v1: { [PT2]: 'anjo-z5' } }), rec: ['#toast'] });
    act(org, 'open', { id: PT2 }); act(anj, 'open', { id: PT2 });
    const R = org.api.ridesOf(org.api.modelOf(PT2)), keys = R.runs.map((r) => r.key + ':' + r.legs.map((l) => l.code).join('+'));
    org.api.ACTS.rides({ dataset: { id: PT2, v: 'aORD1120-ashwin-p8' } }); const so = sheet(org);
    const faceT = /data-act="ride" data-id="[^"]+" data-v="aORD1120-ashwin-p8" data-code="momdad-k3" aria-pressed="false" aria-label="Mom &amp; Dad drives Ashwin"/.test(so);
    await tap(org, so, 'ride', { v: 'aORD1120-ashwin-p8', code: 'momdad-k3' }); await until(() => !!srv.read(PT2).responses['momdad-k3']); await tick();
    const mdr = srv.read(PT2).responses['momdad-k3'];
    // the ask for several runs' candidates: Anjo is there for R2 (11/18–11/30)? no: she leaves on 11/30 herself; the trip's guest link when two
    check(eq(keys, ['aORD1118-anjo-z5:anjo-z5', 'aORD1120-ashwin-p8:ashwin-p8', 'dORD1130-ashwin-p8:ashwin-p8+anjo-z5']) && faceT && mdr.status === 'in' && mdr.note === '📞 🚗ashwin-p8.aORD1120' &&
      /class="rrun open on" id="run-aORD1120-ashwin-p8"/.test(so) && /<span data-k="pickup">⏱<\/span><span class="tn" data-k="runwait">1:30<\/span>/.test(so) &&
      /data-act="ride"[^>]*data-v="aORD1120-ashwin-p8" data-code="anjo-z5"/.test(so),
      'PIA-157 D the organizer\'s P-rides at R1 (ringed): each candidate\'s face is a toggle (Mom & Dad, and Anjo, there since 11/18); his tap for Mom & Dad, still on their default, answers for them: In with 📞 and the claim; Anjo\'s own 11/18 landing is its own run, the 11/30 drop-off one run of two (⏱1:30)', { keys, mdr });
    // Anjo's own phone: her 🛫 leg in R2 shows 🚌 and 🚙 inline (her own); 🚌 → her 🚌d, the leg leaves the run, 🚌✓ ↩ puts it back
    anj.api.ACTS.rides({ dataset: { id: PT2, v: 'dORD1130-ashwin-p8' } }); const sa = sheet(anj);
    const p0 = nPosts(anj);
    await tap(anj, sa, 'ground', { code: 'anjo-z5', end: 'd', v: 'bus' }); await until(() => /🚌d/.test(srv.read(PT2).responses['anjo-z5'].note)); await tick();
    const ta = anj.rec['#toast'].__rec.html.slice(-1)[0] || '', w = posts(anj, p0)[0], sa2 = sheet(anj);
    await anj.api.S.undo(); await until(() => !/🚌/.test(srv.read(PT2).responses['anjo-z5'].note)); await tick();
    check(/data-act="ground"[^>]*data-code="anjo-z5" data-end="d" data-v="bus"[^>]*data-lbl="Bus" data-k="bus">🚌<\/button>/.test(sa) && /data-v="rent"[^>]*data-lbl="Rental car" data-k="rental">🚙/.test(sa) &&
      !/data-code="ashwin-p8" data-end="d" data-v="bus"/.test(sa) && w.body.note === '🛬18:10 🛫17:00 🚌d' && /🚌✓/.test(ta) &&
      /<button class="rql" data-act="ground"[^>]*data-code="anjo-z5" data-end="d" data-v="bus" aria-pressed="true"/.test(sa2) && srv.read(PT2).responses['anjo-z5'].note === '🛬18:10 🛫17:00',
      'PIA-157 D Anjo on her own phone: her 🛫 in the 11/30 run of two shows 🚌 (Bus) and 🚙 (Rental car) inline, Ashwin\'s leg none; 🚌 writes 🚌d in her own answer (one /idea/respond), the leg leaves the run for the quiet "🚌 11/30 🗽" line; 🚌✓ and ↩ puts the family ride back', { w });
    // the organizer: 🚙 on someone else's leg of a run of several appears by a tap on their face; greyed on a paid trip ("Trip closed")
    org.api.ACTS.rides({ dataset: { id: PT2, v: 'dORD1130-ashwin-p8' } }); const sr0 = sheet(org);
    org.api.ACTS.rideleg({ dataset: { v: 'dORD1130-ashwin-p8', code: 'anjo-z5' } }); const sr1 = sheet(org);
    check(!/data-code="anjo-z5" data-end="d" data-v="rent"/.test(sr0) && /data-act="rideleg"[^>]*data-code="anjo-z5" aria-expanded="false"/.test(sr0) && /data-code="anjo-z5" data-end="d" data-v="rent"/.test(sr1),
      'PIA-157 D the organizer\'s phone: Anjo\'s 🚌 / 🚙 in the 11/30 run of two show once her face there is tapped');
    org.api.closeSheet();
  }
  {
    // paid: the Rides row alone in the key (read only, until its last run), the controls greyed "Trip closed"; removed or past: no row
    const base = (d) => { d.idea.destination = { city: 'Chicago', airport: 'ORD' }; d.idea.dates.departure = '2026-11-20'; d.idea.dates.return = '2026-11-30'; d.idea.notes = ''; delete d.responses['momdad-k3'];
      chosenAt(d, '2026-11-20', '2026-11-30', 'ORD'); d.responses['ashwin-p8'].booked = true; d.responses['ashwin-p8'].note = '🛬14:35 🛫15:30'; d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA', booked: true }); };
    const PD = seedAs(DWX, (d) => { base(d); d.responses['momdad-k3'] = Object.assign(RESP('in'), { member: 'momdad-k3', origin: 'PIA', note: '🚗ashwin-p8.aORD1120' }); d.decision.stage = 'booked'; d.decision.actual_total = 905; });
    const DR = seedAs(DWX, (d) => { base(d); d.decision.stage = 'dropped'; }), PS = seedAs(DWX, (d) => { base(d); d.idea.dates.departure = '2026-09-04'; d.idea.dates.return = '2026-09-07'; chosenAt(d, '2026-09-04', '2026-09-07', 'ORD'); });
    const DONE = seedAs(DWX, (d) => { base(d); d.responses['anjo-z5'].note = '🛬15:10 🛫17:00'; });
    const ids = [PD, DR, PS, DONE];
    const o = await boot136({ ls: lsOf(ids, { pialax_idea_keys_v1: keyOf(ids), pialax_idea_me_v1: Object.fromEntries(ids.map((i) => [i, 'ashwin-p8'])), pialax_proxy_token: TOKEN }) });
    const momP = await boot136({ ls: lsOf([PD], { pialax_idea_me_v1: { [PD]: 'momdad-k3' } }) });
    act(o, 'open', { id: PD }); const hp = screen(o); o.api.ACTS.rides({ dataset: { id: PD } }); const sp = sheet(o); o.api.closeSheet(); act(o, 'back');
    act(momP, 'open', { id: PD }); const hmp = screen(momP);
    const none = [DR, PS].map((id) => { act(o, 'open', { id }); if (o.api.S.sheet) o.api.closeSheet(); const h = screen(o); act(o, 'back'); return h.indexOf('id="board-' + id + '"') >= 0 && h.indexOf('wkride') < 0; });
    act(o, 'open', { id: DONE }); const hd = screen(o), m = o.api.modelOf(DONE);
    o.api.ACTS.stage({ dataset: { id: DONE } }); o.api.S.sheet.local.amt = '$905'; await o.api.ACTS.paidsave({ dataset: { id: DONE } }); const st = sheet(o); o.api.closeSheet();
    check(/<div class="wk"[^>]*><div class="wkr wkride"/.test(hp) && (hp.match(/<div class="wkr/g) || []).length === 1 && /aria-disabled="true" data-why="1" data-lbl="Trip closed"/.test(sp) &&
      momP.api.primaryAction(momP.api.modelOf(PD), '2026-10-17') === 'drive' && /class="btn pri drv"/.test(hmp) && none.every(Boolean) && m.stage === 'done' &&
      !/data-act="paidopen"/.test(hd) && /rides open: Ashwin, Anjo/.test(st) && /<span class="rq" data-k="noride">🚗\?<\/span>🌴🗽/.test(st),
      'PIA-157 A/G a paid trip keeps the Rides row alone in its key (read only: P-rides greyed "Trip closed") and Mom & Dad\'s "🚗 11/20 ⏰…" until the day; no row on a removed or past trip; at 🏁 Done "💵 Paid" waits while rides are open, and More\'s 💵 confirm names them ("rides open: Ashwin, Anjo", 🚗? 🌴🗽)', { none, st: (/<div class="rowc nw paidask">[\s\S]*?<\/div>/.exec(st) || [''])[0] });
  }
  {
    // the Map: departures get ⏱ too, each booked chip with a time a 16px badge (no driver yet ?, a driver's face, 🚌), ≈ chips none, a chip
    // still opens P-day, whose legs carry the same badge and a 🚗 into P-rides
    const MP = seedAs(DWX, (d) => { d.idea.destination = { city: 'Chicago', airport: 'ORD' }; d.idea.dates.departure = '2026-11-20'; d.idea.dates.return = '2026-11-30'; d.idea.notes = '';
      d.responses['momdad-k3'] = Object.assign(RESP('in'), { member: 'momdad-k3', origin: 'PIA', note: '🚗ashwin-p8.aORD1120' }); chosenAt(d, '2026-11-20', '2026-11-30', 'ORD');
      d.responses['ashwin-p8'].booked = true; d.responses['ashwin-p8'].note = '🛬14:35 🛫15:30'; d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA', booked: true, note: '🛬15:10 🛫17:00 🚌d' }); });
    const g = await boot136({ ls: lsOf([MP], { pialax_idea_me_v1: { [MP]: 'momdad-k3' } }) });
    act(g, 'tab', { v: 'map' }); const mh = g.api.renderSelected('map', 'map').html;
    act(g, 'pickup', { id: MP, ap: 'ORD', v: '2026-11-20' }); const day = sheet(g);
    const g2 = /<span class="grp"><span class="gh"><span data-k="pickup">⏱<\/span><span class="tn" data-k="runwait">0:35<\/span><\/span>(<button class="pk arr bk"[^]*?<\/button>){2}<\/span>/.test(mh);
    check(g2 && /aria-label="Lands ORD 11\/20 at 14:35, booked, Ashwin, Mom &amp; Dad driving"[^>]*>[\s\S]*?<span class="rbd" aria-hidden="true" data-pic>🌽<\/span><\/button>/.test(mh) &&
      /aria-label="Lands ORD 11\/20 at 15:10, booked, Anjo, no driver yet"[^>]*>[\s\S]*?<span class="rbd q" data-k="noride">\?<\/span><\/button>/.test(mh) &&
      /aria-label="Leaves ORD 11\/30 at 17:00, booked, Anjo, bus"[^>]*>[\s\S]*?<span class="rbd" data-k="bus">🚌<\/span><\/button>/.test(mh) && g.api.S.sheet && g.api.S.sheet.type === 'day' &&
      /<span class="rbd" aria-hidden="true" data-pic>🌽<\/span><\/button>/.test(day) &&/data-act="rides" data-id="[^"]+" data-v="aORD1120-ashwin-p8"[^>]*data-lbl="Rides"><span data-k="drive" aria-hidden="true">🚗<\/span>/.test(day),
      'PIA-157 F the Map: the 11/20 arrivals one ⏱0:35 run, Ashwin\'s chip badged 🌽 (Mom & Dad driving), Anjo\'s a dashed ? (no driver yet), her 17:00 departure 🚌 (her own); a chip opens P-day, whose legs carry the same badge and a 🚗 into P-rides at the run', mh.slice(mh.indexOf('class="lanes"'), mh.indexOf('class="lanes"') + 900));
    g.api.closeSheet();
    // the shared links: a share with no text is exactly as before ({url}); the ask's text never carries a key
    const rs = recShare(), o2 = await boot136({ ls: lsOf([MP], { pialax_idea_keys_v1: keyOf([MP]), pialax_idea_me_v1: { [MP]: 'ashwin-p8' } }), navigator: rs.nav });
    act(o2, 'open', { id: MP }); await o2.api.ACTS.tshare({ dataset: { id: MP } }); await tick();
    check(rs.shared.length === 1 && eq(Object.keys(rs.shared[0]), ['url']) && o2.api.LEGEND.noride[1] === 'No driver yet' && o2.api.LEGEND.lvhome[0] === '⏰' && o2.api.LEGEND.bus[1] === 'Bus' && o2.api.LEGEND.rental[1] === 'Rental car' &&
      o2.api.LEGEND.ridemoved[1] === 'Ride changed' && o2.api.LEGEND.drive[1] === 'Drive' && o2.api.BUILD === 157,
      'PIA-157 I/K/L the trip\'s plain Share still hands the share sheet {url} alone (shareLink without text is unchanged); LEGEND names 🚗? No driver yet, ⏰ Leave home, 🚌 Bus, 🚙 Rental car, ⚠ Ride changed (🚗 keeps Drive); ⚙ #157', rs.shared);
  }
  {
    // PIA-157 fix pass, through the real Worker on "P town" (the phones read 10/17)
    const pt = (d) => { d.idea.destination = { city: 'Chicago', airport: 'ORD' }; d.idea.dates.departure = '2026-11-20'; d.idea.dates.return = '2026-11-30'; d.idea.notes = ''; delete d.responses['momdad-k3'];
      d.idea.members[1].label = '💪 Ashwin'; chosenAt(d, '2026-11-20', '2026-11-30', 'ORD'); d.responses['ashwin-p8'].booked = true; d.responses['ashwin-p8'].note = '🛬14:35 🛫15:30';
      d.responses['anjo-z5'] = Object.assign(RESP('in'), { member: 'anjo-z5', origin: 'LGA' }); };
    const momIs = (id) => ({ ls: lsOf([id], { pialax_idea_me_v1: { [id]: 'momdad-k3' } }), rec: ['#toast'] });
    const lastToast = (t) => t.rec['#toast'].__rec.html.slice(-1)[0] || '';
    const K1 = 'aORD1120-ashwin-p8', K2 = 'dORD1130-ashwin-p8';
    // (1) Mom's phone and Dad's are one member: Dad claims R1; Mom's phone, before its next read, taps ☐ Drive there: the fresh record
    // already has it, so nothing is sent, the tap says 🚗✓ (no ↩, no "Not saved" sheet) and the sheet redraws ☑
    const P1 = seedAs(DWX, pt), mom = await boot136(momIs(P1)), dad = await boot136(momIs(P1));
    act(mom, 'open', { id: P1 }); act(dad, 'open', { id: P1 }); mom.api.ACTS.rides({ dataset: { id: P1 } }); dad.api.ACTS.rides({ dataset: { id: P1 } });
    const sMom = sheet(mom);
    await tap(dad, sheet(dad), 'ride', { v: K1 }); await until(() => /aORD1120/.test((srv.read(P1).responses['momdad-k3'] || {}).note || '')); await tick();
    const q0 = nPosts(mom); await tap(mom, sMom, 'ride', { v: K1 }); await tick(10);
    const t1 = lastToast(mom), s1 = sheet(mom);
    check(nPosts(mom) === q0 && /🚗✓/.test(t1) && !/data-act="undo"/.test(t1) && !mom.api.S.errNext && mom.api.S.sheet && mom.api.S.sheet.type === 'rides' &&
      new RegExp('data-act="ride" [^>]*data-v="' + K1 + '" data-code="momdad-k3" aria-pressed="true"').test(s1) && srv.read(P1).responses['momdad-k3'].note === '🚗ashwin-p8.aORD1120',
      'PIA-157 fix: Dad claims the 11/20 pickup on his phone; Mom\'s phone (one member, not read again yet) taps ☐ Drive there: the fresh record already has it ("same"), so nothing is sent, the toast says 🚗✓ (no ↩), no "Not saved" waits behind the sheet, and it redraws ☑', { t1, errNext: mom.api.S.errNext });
    // (2) a claim the note has no room for (a 261-character note): nothing is built or sent, and the tap says ⚠ Too long
    const P2 = seedAs(DWX, (d) => { pt(d); d.responses['momdad-k3'] = Object.assign(RESP('in'), { member: 'momdad-k3', origin: 'PIA', note: 'x'.repeat(261) }); });
    const ml = await boot136(momIs(P2)); act(ml, 'open', { id: P2 }); ml.api.ACTS.rides({ dataset: { id: P2 } });
    const q2 = nPosts(ml), f2 = ml.fetches.length; await tap(ml, sheet(ml), 'ride', { v: K1 }); await tick(6);
    check(nPosts(ml) === q2 && ml.fetches.length === f2 && /⚠ Too long/.test(lastToast(ml)) && !ml.api.S.errNext && srv.read(P2).responses['momdad-k3'].note === 'x'.repeat(261),
      'PIA-157 fix: Mom & Dad\'s 261-character note leaves no room for a claim: ☐ Drive builds nothing, sends nothing (not even a read) and says "⚠ Too long" (never clipped, never a silent tap)', lastToast(ml));
    // (3) a share of a run: Mom & Dad drive Ashwin's 14:35, Bob drives Anjo's 15:10, the same run: their toggle reads ☑ and lets it go
    const P3 = seedAs(DWX, (d) => { pt(d); d.idea.members.push({ code: 'bob-q4', label: '🎸 Bob', airport: 'SEA', headcount: 1 });
      d.responses['bob-q4'] = Object.assign(RESP('in'), { member: 'bob-q4', origin: 'SEA', available_from: '2026-11-15', available_to: '2026-11-30', booked: true, note: '🚗anjo-z5.aORD1120' });
      d.responses['anjo-z5'].booked = true; d.responses['anjo-z5'].note = '🛬15:10 🛫17:00'; d.responses['momdad-k3'] = Object.assign(RESP('in'), { member: 'momdad-k3', origin: 'PIA', note: '🚗ashwin-p8.aORD1120' }); });
    const mp = await boot136(momIs(P3)); act(mp, 'open', { id: P3 }); mp.api.ACTS.rides({ dataset: { id: P3, v: K1 } }); const s3 = sheet(mp);
    const pressed = new RegExp('data-act="ride" [^>]*data-v="' + K1 + '" data-code="momdad-k3" aria-pressed="true"').test(s3);
    const q3 = nPosts(mp); await tap(mp, s3, 'ride', { v: K1 }); await until(() => srv.read(P3).responses['momdad-k3'].note === ''); await tick();
    const w3 = posts(mp, 0).slice(-1)[0];
    check(pressed && nPosts(mp) - q3 === 1 && w3.body.member === 'momdad-k3' && w3.body.note === '' && srv.read(P3).responses['bob-q4'].note === '🚗anjo-z5.aORD1120' && /🚗✓/.test(lastToast(mp)),
      'PIA-157 fix: Mom & Dad drive Ashwin and Bob drives Anjo in the same 11/20 run: Mom & Dad\'s toggle reads ☑ (aria-pressed) and one tap takes their claim back (one /idea/respond), Bob\'s stays', { w3 });
    // (4) a traveler who joined a run I drive: the primary shows only the legs I drive; my toggle reads ☐ and claims hers too
    const P4 = seedAs(DWX, (d) => { pt(d); d.responses['anjo-z5'].booked = true; d.responses['anjo-z5'].note = '🛬15:10'; d.responses['momdad-k3'] = Object.assign(RESP('in'), { member: 'momdad-k3', origin: 'PIA', note: '🚗ashwin-p8.aORD1120' }); });
    const mj = await boot136(momIs(P4)); act(mj, 'open', { id: P4 }); const h4 = screen(mj); mj.api.ACTS.rides({ dataset: { id: P4, v: K1 } }); const s4 = sheet(mj);
    check(/class="btn pri drv"[^>]*aria-label="Leave home 12:05 Friday for Ashwin"/.test(h4) && /<span class="drvf" aria-hidden="true">[^]*?💪[^]*?<\/span><\/button>/.test(h4) && !/<span class="drvf"[^]*?🗽[^]*?<\/button>/.test(h4) &&
      new RegExp('data-act="ride" [^>]*data-v="' + K1 + '" data-code="momdad-k3" aria-pressed="false"').test(s4),
      'PIA-157 fix: Anjo booked into the 11/20 run Mom & Dad drive for Ashwin (her 15:10 still open): their primary reads "for Ashwin" with his face alone (not hers), and their toggle there reads ☐ (a tap claims her leg too)', (/<button class="btn pri drv"[^]*?<\/button>/.exec(h4) || [''])[0]);
    // (5) 📅 Phone kept, then the drives are gone (Ashwin Out): the card's dot and the Trips numeral show; opening the trip says
    // "📅 Rides changed" once and forgets what this phone added. A kept run already behind us is no change
    const P5 = seedAs(DWX, (d) => { pt(d); d.responses['momdad-k3'] = Object.assign(RESP('in'), { member: 'momdad-k3', origin: 'PIA', note: '🚗ashwin-p8.aORD1120,ashwin-p8.dORD1130' }); });
    const mc = await boot136(momIs(P5)); act(mc, 'open', { id: P5 }); mc.api.ACTS.ridecal({ dataset: { id: P5 } }); await tick(4);
    const sig5 = (mc.api.uiRead().rides || {})[P5] || '', calm = !mc.api.rideChanged(mc.api.modelOf(P5));
    const past = 'aORD1015-ashwin-p8|2026-10-15|2026-10-15|11:00|ashwin-p8@13:30;' + sig5; mc.api.uiSet({ rides: { [P5]: past } });
    const pastCalm = !mc.api.rideChanged(mc.api.modelOf(P5)); mc.api.uiSet({ rides: { [P5]: sig5 } });
    const d5 = srv.read(P5); d5.responses['ashwin-p8'].status = 'out'; srv.write(d5);
    act(mc, 'back'); await mc.api.refreshAll(true); await tick(); mc.api.render();
    const card5 = mc.api.renderIdeas().html, dot5 = mc.api.rideChanged(mc.api.modelOf(P5)), badge5 = mc.api.tripsBadge();
    act(mc, 'open', { id: P5 }); await tick();
    const t5 = lastToast(mc), gone5 = !((mc.api.uiRead().rides || {})[P5]), calm5 = !mc.api.rideChanged(mc.api.modelOf(P5));
    check(sig5.split(';').length === 2 && calm && pastCalm && dot5 && /data-k="ridenew"/.test(card5) && badge5 >= 1 && /📅 Rides changed/.test(t5) && gone5 && calm5 && mc.api.tripsBadge() === badge5 - 1,
      'PIA-157 fix: after 📅 Phone (two rides kept), a kept run already behind us is no change (no dot); then Ashwin says Out, so Mom & Dad drive nothing while their calendar still holds both: the card\'s dot (Rides changed) and the Trips numeral show; opening the trip says "📅 Rides changed" once and forgets what this phone added (the dot goes)', { t5, badge5 });
    // (6) the organizer's Ask for several candidates (Anjo there from 11/18 can drive 11/20 too): "Ask", the trip's guest link with
    // every open run in words, never a key
    const P6 = seedAs(DWX, (d) => { pt(d); d.responses['anjo-z5'].available_from = '2026-11-18'; });
    const rs6 = recShare(), o6 = await boot136({ ls: lsOf([P6], { pialax_idea_keys_v1: keyOf([P6]), pialax_idea_me_v1: { [P6]: 'ashwin-p8' } }), navigator: rs6.nav });
    act(o6, 'open', { id: P6 }); const h6 = screen(o6), askBtn = ctl(h6, 'tshare', { v: 'ride' });
    await tap(o6, h6, 'tshare', { v: 'ride' }); await tick(); const sh6 = rs6.shared.slice(-1)[0] || {};
    check(!!askBtn && /data-act="tshare" data-v="ride" data-id="[^"]+" aria-label="Ask" data-lbl="Ask"/.test(h6) && !ctl(h6, 'nudge', { v: 'ride' }) &&
      new RegExp('/i/' + P6 + '$').test(sh6.url || '') && /^🚗 Can you drive\? Fri 11\/20: pick up Ashwin at ORD Chicago, lands 2:35 PM \(leave home 12:05 PM\)\. Mon 11\/30: drop off Ashwin/.test(sh6.text || '') &&
      (sh6.url + sh6.text).indexOf(KEY) < 0 && !/#k=|#m=/.test(sh6.url || ''),
      'PIA-157 fix (the several-candidate Ask, now asserted): with Anjo there from 11/18 the 11/20 pickup has two candidates, so the key\'s row ends in "Ask" (tshare, data-v ride; no personal nudge): the trip\'s guest link /i/<id> and "🚗 Can you drive? Fri 11/20: …", no key, no #m=', sh6);
  }

  // ═══ AC12 / AC14 ═══
  section('AC12 / AC14 preflight covers app.html; the playbook records the v2 decisions');
  const pf = fs.readFileSync(path.join(ROOT, 'scripts', 'preflight.sh'), 'utf8');
  check(/FILES=\([^)]*app\.html[^)]*\)/.test(pf), 'preflight FILES includes app.html (console.log, secret scan, <script> balance, presence)');
  check(/suites=\([^)]*\btest-app\.sh\b[^)]*\)/.test(pf) && /suites=\([^)]*\btest-job-flows\.sh\b[^)]*\)/.test(pf) && /test-words\.js/.test(fs.readFileSync(path.join(ROOT, 'scripts', 'test-job-flows.js'), 'utf8')), 'PIA-145 preflight runs app checks and the required job-flow suite, including the full word gate');
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
    const badMaps = [html.replace('world-atlas@2.0.2/countries-110m.json\';', 'world-atlas@2/countries-110m.json\';'), html.replace(/var MAP_SHA256 = '[^']+';/, "var MAP_SHA256 = '0000';")];
    const mapFails = badMaps.map(body => {
      const f = path.join(tmp, 'map.html'); fs.writeFileSync(f, body);
      return require('child_process').spawnSync('bash', [path.join(ROOT, 'scripts', 'verify-sri.sh')], { encoding: 'utf8', env: Object.assign({}, process.env, { SRI_APP_ONLY: '1', SRI_APP_HTML: f }) }).status === 1;
    });
    check(mapFails.every(Boolean), 'PIA-143 SRI gate refuses a floating map-data version or changed map-data digest');
    fs.rmSync(tmp, { recursive: true, force: true });
    check(H.length > 40 && wrong.length === 0, 'verify-sri (app.html part, offline): ' + cases.map((c) => c[2] + (c[1] ? ' fails' : ' passes')).join('; '), wrong);
  }
  const docs = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8') + fs.readFileSync(path.join(ROOT, 'PIALAX_HQ.md'), 'utf8');
  const need = ['D1', 'D2', 'D3', 'D4', 'D5', 'strict word', 'app.html', 'PIA-147', 'familyForDate', 'ORD', 'mock'];
  check(need.every((s) => docs.indexOf(s) >= 0), 'CLAUDE.md + PIALAX_HQ.md record D1–D5, the strict word rule, the app.html cutover (PIA-147) and the amended domain rules', need.filter((s) => docs.indexOf(s) < 0));

  {
    // PIA-154: one glyph, one meaning, and each explained: every data-k the app writes as a literal, and every one a check above drew
    // on a trip page or a sheet, is a LEGEND key (what ⓘ lists) or one ⓘ skips as self-evident (‹ ⓘ ⚙ ⌄ and the tabs); every marked
    // label word drawn is on the PIA-154 list, and no sheet marks one
    const L = (await boot136({})).api.LEGEND, SKIP = ['back', 'key', 'settings', 'close', 'trips', 'map', 'cal'];
    const lit = new Set(); html.replace(/\sdata-k="([a-z][a-z0-9-]*)"/g, (_, k) => { lit.add(k); return ''; });
    const unkeyed = [...new Set([...lit, ...SEEN_K])].filter((k) => !Object.prototype.hasOwnProperty.call(L, k) && SKIP.indexOf(k) < 0);
    // (the one list: test-words' LBL3_OK, the word gate's own; CLAUDE.md names every word on it)
    const twSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'test-words.js'), 'utf8');
    const OK3 = JSON.parse(((/const LBL3_OK = (\[[^\]]*\]);/.exec(twSrc) || [])[1] || '[]').replace(/'/g, '"'));
    const claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8').replace(/\s+/g, ' ');
    const odd3 = [...SEEN_L3].filter((w) => OK3.indexOf(w) < 0), undoc = OK3.filter((w) => claude.indexOf(w) < 0);
    check(SEEN_K.size >= 60 && unkeyed.length === 0 && SEEN_L3.size >= 4 && OK3.length === 15 && odd3.length === 0 && undoc.length === 0 && SHEET_L3.size === 0,
      'PIA-154 every glyph key in app.html (' + lit.size + ' literal) and drawn by these checks (' + SEEN_K.size + ') has its LEGEND entry; the marked label words drawn (' + [...SEEN_L3].join(', ') + ') are all on the one list (test-words\' LBL3_OK, each word named in CLAUDE.md); no sheet marks one', { unkeyed, odd3, undoc, sheet: [...SHEET_L3] });
  }
  check(strayNet.length === 0, 'offline: nothing reached the network outside the in-process Worker', strayNet);
  console.log('');
  if (failCount) { console.log(failCount + ' failing, ' + passCount + ' passing'); process.exit(1); }
  console.log('all ' + passCount + ' checks passing');
  process.exit(0);
})().catch((e) => { console.log('  XX  suite crashed: ' + (e && e.stack ? e.stack : e)); console.log('1 failing'); process.exit(1); });

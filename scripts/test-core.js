'use strict';
// test-core.js — PIA-042 T1 pure-function regression harness.
//
// PIALAX has no build system and no module boundary: every function in
// pialax.html / pialax-mobile.html lives inside one page-level IIFE and is
// NOT exported to `window` (only ~12 inline-event-handler targets are).
// To test the pure helpers without changing production code, this script:
//   1. extracts each file's inline app <script> block (the one opening with
//      'use strict'; (function () { ... — NOT the small CDN-integrity-check
//      or error-overlay IIFEs that also live in the file),
//   2. strips that wrapping IIFE so the body's top-level `function`/`var`
//      declarations become reachable,
//   3. neutralizes the trailing boot()/initShellView() invocation calls so
//      nothing async or DOM-heavy runs uncontrolled during eval,
//   4. evaluates the body under `new Function(...)` with a minimal browser
//      shim (a self-referential Proxy stub covers arbitrary DOM/d3 chains
//      generically, so we don't have to enumerate every browser API the file
//      touches at the top level),
//   5. captures the functions/constants under test via an appended
//      `return {...}` statement,
//   6. asserts against them.
//
// Fails LOUDLY (non-zero exit, explicit XX lines) if a file can't be loaded
// or an expected symbol can't be captured — this harness testing nothing is
// exactly as dangerous as the bug it exists to catch, so it must never pass
// silently.

const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || process.cwd();
const FILES = ['pialax.html', 'pialax-mobile.html'];

let passCount = 0;
let failCount = 0;
function ok(msg) { console.log('  OK  ' + msg); passCount++; }
function bad(msg) { console.log('  XX  ' + msg); failCount++; }
function note(msg) { console.log('  ··  ' + msg); }

// ---- 1+2+3: extract the app <script> block and unwrap its IIFE ----------

function extractAppBody(html, label) {
  const scriptRe = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  let appBody = null;
  while ((m = scriptRe.exec(html))) {
    if (/^\s*'use strict';\s*\(function\s*\(\)\s*\{/.test(m[1])) {
      appBody = m[1];
      break;
    }
  }
  if (appBody == null) {
    throw new Error("could not find the app <script> block ('use strict'; IIFE) in " + label);
  }

  const openRe = /^\s*'use strict';\s*\(function\s*\(\)\s*\{/;
  const closeRe = /\}\)\(\);\s*\/\/\s*end IIFE\s*$/;
  if (!openRe.test(appBody)) {
    throw new Error('IIFE opener marker not found in ' + label + ' — has the wrapper changed?');
  }
  const trimmed = appBody.trimEnd();
  if (!closeRe.test(trimmed)) {
    throw new Error('IIFE closer marker ("// end IIFE") not found in ' + label + ' — has the wrapper changed?');
  }

  let body = trimmed.replace(openRe, '').replace(closeRe, '');

  // Neutralize the trailing boot invocation(s). Desktop calls
  // initShellView() then boot(); mobile has no initShellView and calls only
  // boot(). Both replacements are non-global / first-match-only against the
  // single known invocation site (verified against both files) — a no-op
  // .replace() when the pattern is absent (mobile's initShellView case).
  body = body.replace(/initShellView\(\);/, 'try{initShellView();}catch(e){}');
  body = body.replace(/\bboot\(\);/, 'try{boot();}catch(e){}');

  return body;
}

// ---- 4: minimal browser shim ---------------------------------------------

function makeElementStub() {
  // A self-referential Proxy: any property access or method call returns
  // itself, so arbitrary chains (document.querySelector('x').closest('y')
  // .classList.toggle('z'), d3.select(...).append('g').attr(...), etc.) never
  // throw, without enumerating every DOM/d3 API the app happens to touch at
  // the top level (dozens of `document.getElementById(id).addEventListener`
  // wiring statements run immediately when the body is evaluated).
  const target = function stub() {};
  const proxy = new Proxy(target, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return function () { return ''; };
      if (p === Symbol.iterator) return function* () {};
      if (p === 'then') return undefined; // never look like a thenable
      if (p === 'nodeType') return 1;
      if (p === 'length') return 0;
      return proxy;
    },
    set() { return true; },
    apply() { return proxy; },
    has() { return true; },
  });
  return proxy;
}

function makeLocalStorage() {
  let store = Object.create(null);
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = Object.create(null); },
  };
}

function makeShim() {
  const elStub = makeElementStub();
  const loc = {
    search: '', pathname: '/pialax.html', origin: 'http://localhost',
    href: 'http://localhost/pialax.html', hash: '', hostname: 'localhost',
  };
  const hist = { replaceState: () => {}, pushState: () => {}, state: null };
  const ls = makeLocalStorage();
  const nav = { userAgent: 'pialax-test-core', clipboard: { writeText: () => Promise.resolve() } };
  const doc = {
    getElementById: () => elStub,
    querySelector: () => elStub,
    querySelectorAll: () => [],
    createElement: () => elStub,
    createElementNS: () => elStub,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
    body: elStub, documentElement: elStub, head: elStub,
  };
  const matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  const winReal = {
    location: loc, history: hist, localStorage: ls, navigator: nav, document: doc,
    console, matchMedia, requestAnimationFrame: () => 0, innerWidth: 1024, innerHeight: 768,
  };
  // window as a Proxy: known keys resolve to the real shim objects above (so
  // `window.location.search`, exported functions via `window.foo = bar`,
  // etc. all behave correctly); anything unanticipated falls back to the
  // generic chainable stub instead of throwing "cannot read property of
  // undefined" on some browser API this harness didn't think to enumerate.
  const win = new Proxy(winReal, {
    get(t, p) { return (p in t) ? t[p] : elStub; },
    set(t, p, v) { t[p] = v; return true; },
    has() { return true; },
  });

  return {
    window: win,
    document: doc,
    location: loc,
    history: hist,
    localStorage: ls,
    navigator: nav,
    console,
    fetch: () => Promise.reject(new Error('fetch disabled in test-core')),
    requestAnimationFrame: () => 0,
    matchMedia,
    d3: makeElementStub(),
    topojson: makeElementStub(),
    confirm: () => false,
    alert: () => {},
  };
}

// ---- 5: capture the symbols under test -----------------------------------

// Kept intentionally broader than T1's assertions need — T2/T3/T4 (estimate
// stability, preflight wiring, share isolation) reuse this same capture list
// without re-architecting the harness.
const EXPECT = [
  '_isSeedDupMemphis', 'sanitizeWatchlistItem', 'watchlistClashFor',
  'tbDays', 'gflightsUrl', 'bookingUrlFor', 'binderKeyFor', 'esc',
  'watchlistEst', 'BLOCKERS', 'WATCHLIST_STAGES', 'WL_CODE_RE', 'WATCHLIST_SEED',
  // PIA-046: feature-flag primitive.
  'parseFlagsParam', 'KNOWN_FLAGS',
];

function loadApi(filepath, label) {
  const html = fs.readFileSync(filepath, 'utf8');
  const body = extractAppBody(html, label);
  const returnStmt =
    '\nreturn { ' +
    EXPECT.map((n) => n + ": (typeof " + n + " !== 'undefined' ? " + n + ' : undefined)').join(', ') +
    ' };\n';

  const shim = makeShim();
  const paramNames = Object.keys(shim);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...paramNames, body + returnStmt);
  const api = fn(...paramNames.map((k) => shim[k]));

  const missing = EXPECT.filter((n) => typeof api[n] === 'undefined');
  return { api, missing };
}

// ---- 6: run + assert ------------------------------------------------------

console.log('▶ test-core: pure-function regression suite');

const loaded = {};
for (const f of FILES) {
  try {
    const { api, missing } = loadApi(path.join(ROOT, f), f);
    if (missing.length) {
      bad(f + ': captured 0/' + EXPECT.length + ' — missing: ' + missing.join(', '));
    } else {
      ok(f + ': loaded, captured all ' + EXPECT.length + ' expected symbols');
      loaded[f] = api;
    }
  } catch (e) {
    bad(f + ': failed to load — ' + (e && e.message ? e.message : String(e)));
  }
}

// AC1 (F2 migration filter) — a Memphis trip dated OUTSIDE the seeded
// Aug 31–Sep 4 2026 window must survive; one dated to match the seed
// window is a genuine duplicate and must still be dropped.
for (const f of FILES) {
  const api = loaded[f];
  if (!api) { bad(f + ': AC1 skipped — file failed to load above'); continue; }

  const inWindow = api._isSeedDupMemphis({ mode: 'solo', dest: 'MEM', dep: '2026-08-31', ret: '2026-09-04' });
  if (inWindow === true) ok(f + ': AC1 — Memphis Aug31–Sep4 (seed window) correctly flagged as duplicate');
  else bad(f + ': AC1 — Memphis Aug31–Sep4 should be flagged duplicate, got ' + inWindow);

  const outOfWindow = api._isSeedDupMemphis({ mode: 'solo', dest: 'MEM', dep: '2027-03-01', ret: '2027-03-05' });
  if (outOfWindow === false) ok(f + ': AC1 — Memphis 2027-03 (outside seed window) correctly NOT flagged');
  else bad(f + ': AC1 — Memphis 2027-03 should NOT be flagged duplicate, got ' + outOfWindow);

  const noDates = api._isSeedDupMemphis({ mode: 'solo', dest: 'MEM' });
  if (noDates === false) ok(f + ': AC1 — Memphis with no dates correctly NOT flagged (missing dep is not a match)');
  else bad(f + ': AC1 — Memphis with no dates should NOT be flagged duplicate, got ' + noDates);

  const notMemphis = api._isSeedDupMemphis({ mode: 'solo', dest: 'JAX', dep: '2026-08-31', ret: '2026-09-04' });
  if (notMemphis === false) ok(f + ': AC1 — non-Memphis dest correctly NOT flagged');
  else bad(f + ': AC1 — non-Memphis dest should NOT be flagged duplicate, got ' + notMemphis);
}

// AC-FLAGS (PIA-046) — the feature-flag primitive. It gates every unreleased
// surface, so "defaults to off" and "an unknown name never persists" are the two
// properties that keep an in-progress feature from leaking to a family member.
for (const f of FILES) {
  const api = loaded[f];
  if (!api) { bad(f + ': AC-FLAGS skipped — file failed to load above'); continue; }
  const P = api.parseFlagsParam;

  const def = P('', null);
  if (Object.keys(def.flags).length === 0) ok(f + ': AC-FLAGS — no param, no storage → all flags OFF');
  else bad(f + ': AC-FLAGS — expected no flags by default, got ' + JSON.stringify(def.flags));

  const on = P('?flags=assistant', null);
  if (on.flags.assistant === true && on.changed === true) ok(f + ': AC-FLAGS — ?flags=assistant enables and reports changed');
  else bad(f + ': AC-FLAGS — ?flags=assistant should enable+change, got ' + JSON.stringify(on));

  const off = P('?flags=-assistant', '{"assistant":true}');
  if (off.flags.assistant === undefined && off.changed === true) ok(f + ': AC-FLAGS — ?flags=-assistant disables a stored flag');
  else bad(f + ': AC-FLAGS — ?flags=-assistant should disable, got ' + JSON.stringify(off));

  const restored = P('', '{"assistant":true}');
  if (restored.flags.assistant === true && restored.changed === false) ok(f + ': AC-FLAGS — stored flag restored without a rewrite');
  else bad(f + ': AC-FLAGS — stored flag should restore unchanged, got ' + JSON.stringify(restored));

  const unknown = P('?flags=notARealFlag', null);
  if (Object.keys(unknown.flags).length === 0) ok(f + ': AC-FLAGS — unknown flag name ignored, never stored');
  else bad(f + ': AC-FLAGS — unknown flag should be dropped, got ' + JSON.stringify(unknown.flags));

  const none = P('?flags=none', '{"assistant":true}');
  if (Object.keys(none.flags).length === 0) ok(f + ': AC-FLAGS — ?flags=none clears everything');
  else bad(f + ': AC-FLAGS — ?flags=none should clear, got ' + JSON.stringify(none.flags));

  const corrupt = P('', '{not json');
  if (Object.keys(corrupt.flags).length === 0) ok(f + ': AC-FLAGS — corrupt stored JSON degrades to OFF, does not throw');
  else bad(f + ': AC-FLAGS — corrupt storage should degrade to empty, got ' + JSON.stringify(corrupt.flags));

  const stripped = P('', '{"assistant":true,"ghost":true}');
  if (stripped.flags.ghost === undefined && stripped.changed === true) ok(f + ': AC-FLAGS — unknown stored key stripped on load');
  else bad(f + ': AC-FLAGS — unknown stored key should be stripped, got ' + JSON.stringify(stripped));
}

// AC-PARITY (PIA-046) — the two files are hand-mirrored with nothing enforcing
// it. Every captured pure function must be byte-identical across them, so drift
// is caught here instead of as a bug that only reproduces on one device.
if (loaded[FILES[0]] && loaded[FILES[1]]) {
  const a = loaded[FILES[0]], b = loaded[FILES[1]];
  const drifted = EXPECT.filter((n) => typeof a[n] === 'function' && String(a[n]) !== String(b[n]));
  if (drifted.length === 0) ok('parity — all captured functions byte-identical across desktop + mobile');
  else bad('parity — drifted between desktop and mobile: ' + drifted.join(', '));
}

console.log('');
if (failCount > 0) {
  console.log(failCount + ' failing, ' + passCount + ' passing');
  process.exit(1);
} else {
  console.log('all ' + passCount + ' checks passing');
  process.exit(0);
}

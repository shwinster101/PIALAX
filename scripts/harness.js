'use strict';
// harness.js — PIA-047: the shared loader behind every scripts/test-*.js.
//
// Extracted verbatim from test-core.js (PIA-042) when a second suite
// (test-extraction.js) needed the same machinery. Keeping one copy matters
// more than usual here: the extraction/unwrap logic depends on exact markers
// in the HTML files ('use strict'; (function () { … })(); // end IIFE), and two
// drifting copies would mean one suite silently testing a stale shape.
//
// Why this exists at all: PIALAX has no build system and no module boundary —
// every function lives inside one page-level IIFE and is NOT exported. To test
// the pure helpers without changing production code, this
//   1. extracts each file's inline app <script> block,
//   2. strips the wrapping IIFE so top-level declarations become reachable,
//   3. neutralizes the trailing boot()/initShellView() calls,
//   4. evaluates the body under `new Function` with a minimal browser shim
//      (a self-referential Proxy covers arbitrary DOM/d3 chains generically),
//   5. returns the requested symbols.
//
// Callers pass their own EXPECT list and MUST treat a non-empty `missing` as a
// hard failure — a harness that silently tests nothing is exactly as dangerous
// as the bugs it exists to catch.

const fs = require('fs');

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


// `shimOverrides` lets a suite swap individual browser globals — a controllable
// fetch, a pre-seeded localStorage — WITHOUT the app having to export anything
// for testability. PIALAX deliberately exports only its ~12 inline-handler
// targets; adding more just to make tests possible would be the test tail
// wagging the production dog.
function loadApi(filepath, label, EXPECT, shimOverrides) {
  const html = fs.readFileSync(filepath, 'utf8');
  const body = extractAppBody(html, label);
  const returnStmt =
    '\nreturn { ' +
    EXPECT.map((n) => n + ": (typeof " + n + " !== 'undefined' ? " + n + ' : undefined)').join(', ') +
    ' };\n';

  const shim = Object.assign(makeShim(), shimOverrides || {});
  const paramNames = Object.keys(shim);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...paramNames, body + returnStmt);
  const api = fn(...paramNames.map((k) => shim[k]));

  const missing = EXPECT.filter((n) => typeof api[n] === 'undefined');
  return { api, missing };
}

// ---- PIA-134: the app file is an argument --------------------------------
// v1 stays the default: with no file named, the harness means the v1 pair. The
// v2 shell (app.html) uses the same markers, so `loadApi(app.html, …)` and
// `node scripts/harness.js app.html` work on it unchanged.
const V1_APP_FILES = ['pialax.html', 'pialax-mobile.html'];
function appFiles(args) {
  const named = (args || []).filter((a) => typeof a === 'string' && /\.html?$/i.test(a));
  return named.length ? named : V1_APP_FILES.slice();
}
// CLI: `node scripts/harness.js [root] [file.html …]` checks that the app block is found in each file.
if (require.main === module) {
  const path = require('path');
  const args = process.argv.slice(2);
  const root = args[0] && !/\.html?$/i.test(args[0]) ? args.shift() : path.join(__dirname, '..');
  let bad = 0;
  appFiles(args).forEach((f) => {
    try {
      const body = extractAppBody(fs.readFileSync(path.isAbsolute(f) ? f : path.join(root, f), 'utf8'), f);
      process.stdout.write('  OK  ' + f + ': app block found (' + body.length + ' chars)\n');
    } catch (e) { bad++; process.stdout.write('  XX  ' + f + ': ' + e.message + '\n'); }
  });
  process.exit(bad ? 1 : 0);
}
module.exports = { extractAppBody, makeElementStub, makeLocalStorage, makeShim, loadApi, appFiles, V1_APP_FILES };

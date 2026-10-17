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

// ---- loader: shared with the other suites (PIA-047) --------------------
// Extraction/unwrap/shim logic lives in scripts/harness.js so test-core and
// test-extraction cannot drift apart on the IIFE markers they both depend on.
const { loadApi, makeShim } = require('./harness.js');

// ---- symbols under test -----------------------------------------------

// Kept intentionally broader than T1's assertions need — T2/T3/T4 (estimate
// stability, preflight wiring, share isolation) reuse this same capture list
// without re-architecting the harness.
const EXPECT = [
  '_isSeedDupMemphis', 'sanitizeWatchlistItem', 'watchlistClashFor',
  'tbDays', 'gflightsUrl', 'bookingUrlFor', 'binderKeyFor', 'esc',
  'watchlistEst', 'BLOCKERS', 'WATCHLIST_STAGES', 'WL_CODE_RE', 'WATCHLIST_SEED',
  // PIA-046: feature-flag primitive.
  'parseFlagsParam', 'KNOWN_FLAGS',
  'pastBookedTrip', 'archivePastBookedTrips', 'currentBookedCount', 'loadWatchlist', 'watchlistItem',
  'createTripIdeaBuilderState', 'normalizeTripIdeaBuilderState', 'resolveTripIdeaCity',
  'generateTripIdeaDatePairs', 'tripIdeaScore', 'rankTripIdeaRecommendations',
  'buildTripIdeaRecommendations', 'serializeTripIdeaSharePayload', 'restoreTripIdeaSharePayload',
  'tripIdeaFlexibilityLabel', 'createTripIdeaWatchlistItem',
  // PIA-131: compact share links.
  'wlShareEncode', 'wlShareDecode', '_wlShareUrl', 'shareWatchlistTrip', 'sharePlan',
];


// ---- 6: run + assert ------------------------------------------------------

console.log('▶ test-core: pure-function regression suite');

const loaded = {};
for (const f of FILES) {
  try {
    const { api, missing } = loadApi(path.join(ROOT, f), f, EXPECT);
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

// Completed trip seeds, persisted overrides, shared links and old booked
// trips must all agree. Keep user-authored text and the seeded itinerary.
for (const f of FILES) {
  const seed = loaded[f];
  if (!seed) { bad(f + ': archival skipped — file failed to load'); continue; }
  const peruSeed = seed.WATCHLIST_SEED.find((t) => t.id === 'peru');
  if (peruSeed.stage === 'completed' && peruSeed.notes.includes('LA 603') && peruSeed.ret === '2026-09-13')
    ok(f + ': Peru seed completed with booked itinerary retained');
  else bad(f + ': Peru seed stage or itinerary changed unexpectedly');
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (/data-hol="peru"[^>]*aria-label="[^"]*trip completed"[^>]*>[^<]*\(done\)<\/button>/.test(html))
    ok(f + ': Peru quick-pick visibly marked completed');
  else bad(f + ': Peru quick-pick still appears active');

  const items = [
    { id: 'past', stage: 'booked', dep: '2026-01-01', ret: '2026-01-04', notes: 'personal history' },
    { id: 'oneway', stage: 'booked', dep: '2026-01-01', notes: 'one-way' },
    { id: 'today', stage: 'booked', dep: '2026-09-29', ret: '2026-09-30' },
    { id: 'undated', stage: 'booked' },
  ];
  seed.archivePastBookedTrips(items, '2026-09-29');
  if (items[0].stage === 'completed' && items[0].notes === 'personal history' &&
      items[1].stage === 'completed' && items[2].stage === 'booked' && items[3].stage === 'booked' &&
      seed.currentBookedCount(items, '2026-09-29') === 2)
    ok(f + ': old round-trip and one-way bookings leave current booked count; future/undated stay booked');
  else bad(f + ': archival/count boundary failed: ' + JSON.stringify(items));
  items[0].stage = 'booked'; // even a newly loaded stale override must not inflate the rail
  if (seed.currentBookedCount(items, '2026-09-29') === 2)
    ok(f + ': displayed booked count excludes a stale past booked override');
  else bad(f + ': stale booked override inflated the displayed count');

  const shim = makeShim();
  shim.localStorage.setItem('pialax_watchlist_v1', JSON.stringify({ overrides: {
    peru: { stage: 'booked', notes: 'My trek journal', nextAction: 'Keep photos', blockers: [], dep: '2026-09-04', ret: '2026-09-13' },
    memphis: { stage: 'booked', notes: 'My work trip notes' },
  }, added: [{ id: 'old-solo', _added: true, mode: 'solo', title: 'Old booking', origin: 'LAX', dest: 'SFO', dep: '2026-01-01', ret: '2026-01-03', stage: 'booked', notes: 'Custom trip note' }] }));
  const shared = { overrides: { peru: { stage: 'booked', notes: 'Shared personal note' } }, added: [] };
  shim.window.location.search = '?wl=' + encodeURIComponent(Buffer.from(encodeURIComponent(JSON.stringify(shared))).toString('base64'));
  try {
    const { api, missing } = loadApi(path.join(ROOT, f), f, EXPECT, shim);
    if (missing.length) throw new Error('missing: ' + missing.join(', '));
    api.loadWatchlist();
    const peru = api.watchlistItem('peru'), memphis = api.watchlistItem('memphis'), old = api.watchlistItem('old-solo');
    if (peru.stage === 'completed' && peru.notes === 'Shared personal note' && peru.routeTxt.includes('SCL') &&
        memphis.stage === 'completed' && memphis.notes === 'My work trip notes' &&
        old.stage === 'completed' && old.notes === 'Custom trip note')
      ok(f + ': storage and shared-link booked overrides archive, while notes and itinerary survive');
    else bad(f + ': migration lost stage, notes or route: ' + JSON.stringify({ peru, memphis, old }));
    shim.window.location.search = '';
    api.loadWatchlist();
    const savedPeru = api.watchlistItem('peru');
    if (savedPeru.stage === 'completed' && savedPeru.notes === 'My trek journal' && savedPeru.nextAction === 'Keep photos')
      ok(f + ': local Peru note and next action survive without a shared link');
    else bad(f + ': local Peru override was lost: ' + JSON.stringify(savedPeru));
  } catch (e) { bad(f + ': archival migration failed — ' + e.message); }
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

// PIA-131 — compact share links. The old ?wl= link ran the JSON through
// encodeURIComponent, base64 and encodeURIComponent again: ~900 characters for
// one trip. ?w= must round-trip every field, stay short, keep old links
// working, and still send every added trip through sanitizeWatchlistItem.
{
  const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x))
    ? Object.keys(x).sort().reduce((o, key) => { o[key] = x[key]; return o; }, {}) : x);
  const json = (v) => JSON.parse(JSON.stringify(v));
  const ORD = { id: 'w1792121078503', _added: true, mode: 'family', origin: 'PIA', dest: 'ORD', hub: 'NYC', dep: '2026-12-22', ret: '2026-12-26', stage: 'watching', title: 'ORD — family meetup idea', routeTxt: 'PIA → ORD', gf: { from: 'PIA', to: 'NYC' }, notes: '', eventDate: '2026-10-15', reminders: [], nextAction: '', blockers: [] };
  const SOLO = { id: 'w1790000000001', _added: true, mode: 'solo', origin: 'LAX', dest: 'SFO', hub: null, dep: '2026-11-02', ret: null, stage: 'booked', title: 'SFO — solo trip', routeTxt: 'LAX → SFO', gf: { from: 'LAX', to: 'SFO' }, notes: '', eventDate: null, reminders: [], nextAction: '', blockers: [] };
  const READABLE = { id: 'w1790000000002', _added: true, mode: 'family', origin: 'LAX', dest: 'North Carolina', hub: null, dep: '2027-03-10', ret: '2027-03-14', stage: 'planning', title: 'North Carolina — family meetup idea', routeTxt: 'LAX → North Carolina', gf: { from: 'LAX', to: null }, notes: 'Grandma 90th 🎂', eventDate: '2027-03-12', reminders: ['2027-02-01'], nextAction: 'Ask Anjo', blockers: [] };
  const CUSTOM = { id: 'trip-idea-abc', _added: true, mode: 'family', origin: 'LAX', dest: 'PIA', hub: 'PIA', dep: '2026-11-25', ret: '2026-11-29', stage: 'watching', title: '🦃 Thanksgiving in Peoria', routeTxt: 'Everyone → PIA', gf: { from: 'LAX', to: 'ORD' }, notes: 'Zoë’s pick — “drive from ORD”', eventDate: null, reminders: [], nextAction: '', blockers: [], sharedIdeaId: 'AbCdEfGhIjKlMnOpQrStUv', calendarEvents: [{ title: 'Dinner', start: '2026-11-26', end: '2026-11-27' }], bookBy: '2026-11-01' };
  const NOGF = { id: 'w3', _added: true, mode: 'solo', origin: 'LAX', dest: 'JFK', dep: '2026-12-01', stage: 'watching', title: 'JFK — solo trip' };
  const OVR = { peru: { stage: 'planning', notes: '', nextAction: '', blockers: [], dep: '2026-09-04', ret: '2026-09-13', eventDate: null, sharedIdeaId: undefined } };
  const b64 = (s) => Buffer.from(s).toString('base64url');
  const URL_RE = /^https:\/\/shwinster101\.github\.io\/PIALAX\/\?w=[A-Za-z0-9_-]+$/;

  for (const f of FILES) {
    const api = loaded[f];
    if (!api) continue;
    const E = api.wlShareEncode, D = api.wlShareDecode;
    const full = { overrides: OVR, added: [ORD, SOLO, READABLE, CUSTOM] };
    const back = D(E(full));
    if (back && canon(back.added) === canon(json(full.added)))
      ok(f + ': ?w= round-trips family, solo, readable-destination and custom trips exactly');
    else bad(f + ': ?w= round-trip changed the added trips: ' + JSON.stringify(back));
    // Starter trips send only what differs from WATCHLIST_SEED; a changed value
    // (even an emptied note) is kept exactly.
    if (back && canon(back.overrides) === canon({ peru: { stage: 'planning', notes: '' } }))
      ok(f + ': a starter-trip override keeps changed fields (emptied note too) and leaves out seed-equal ones');
    else bad(f + ': starter-trip override diff: ' + JSON.stringify(back && back.overrides));
    const ng = D(E({ overrides: {}, added: [NOGF] }));
    const n0 = ng && ng.added[0];
    if (n0 && !('gf' in n0) && n0.title === NOGF.title && n0.dep === NOGF.dep && n0.mode === 'solo')
      ok(f + ': a trip with no flight target still has none after the round-trip');
    else bad(f + ': a trip without gf gained one or lost fields: ' + JSON.stringify(n0));

    const shim = makeShim();
    shim.location.origin = 'https://shwinster101.github.io';
    shim.location.pathname = '/PIALAX/' + f;
    let copied = null;
    shim.navigator.clipboard.writeText = (t) => { copied = t; return Promise.resolve(); };
    shim.setTimeout = () => 0;
    shim.localStorage.setItem('pialax_watchlist_v1', JSON.stringify({ overrides: { london: { notes: 'Our own London note' } }, added: [ORD, CUSTOM] }));
    try {
      const { api: live, missing } = loadApi(path.join(ROOT, f), f, EXPECT, shim);
      if (missing.length) throw new Error('missing: ' + missing.join(', '));
      live.loadWatchlist();
      const legacy = 'https://shwinster101.github.io/PIALAX/' + f + '?wl=' + encodeURIComponent(Buffer.from(encodeURIComponent(JSON.stringify({ overrides: {}, added: [ORD] }))).toString('base64'));
      const url = live._wlShareUrl({ overrides: {}, added: [ORD] });
      if (URL_RE.test(url) && url.length <= 220 && url.length * 4 <= legacy.length)
        ok(f + ': the ORD link is ' + url.length + ' characters (was ' + legacy.length + '), at the site root, with no % = or +');
      else bad(f + ': ORD link too long or malformed (' + url.length + ' vs ' + legacy.length + '): ' + url);

      live.shareWatchlistTrip(ORD.id);
      const lines = String(copied || '').split('\n');
      if (lines[0] === '📋 Proposed trip: ORD — family meetup idea' && lines.includes('✈️ PIA → ORD · flights to NYC') &&
          lines.includes('📅 Tue Dec 22 – Sat Dec 26') && lines.includes('📌 Event: Thu Oct 15') &&
          lines[lines.length - 2] === 'Open in PIALAX:' && URL_RE.test(lines[lines.length - 1]))
        ok(f + ': the trip message has friendly dates, the route, and the bare link alone on its last line');
      else bad(f + ': trip message format: ' + JSON.stringify(copied));
      const sent = D(new URL(lines[lines.length - 1]).searchParams.get('w'));
      const sent0 = sent && sent.added[0];
      if (sent0 && sent0.id === ORD.id && sent0.hub === 'NYC' && sent0.eventDate === '2026-10-15' && sent0.gf && sent0.gf.to === 'NYC')
        ok(f + ': the shared link decodes back to the same trip');
      else bad(f + ': shared link lost trip fields: ' + JSON.stringify(sent));

      copied = null; live.shareWatchlistTrip(CUSTOM.id);
      const last = String(copied || '').split('\n').pop();
      if (last.includes(CUSTOM.sharedIdeaId) && !/[?&]w=/.test(last))
        ok(f + ': a trip already shared with the family sends its short invite link instead');
      else bad(f + ': linked trip did not use its invite link: ' + last);

      copied = null; live.shareWatchlistTrip('peru');
      const peruUrl = String(copied || '').split('\n').pop();
      if (URL_RE.test(peruUrl) && peruUrl.length <= 80)
        ok(f + ': sharing an unedited starter trip sends a ' + peruUrl.length + '-character link, not its notes');
      else bad(f + ': starter-trip link: ' + peruUrl);

      copied = null; live.sharePlan();
      const plan = String(copied || '').split('\n'), planUrl = plan[plan.length - 1], planGot = D(new URL(planUrl).searchParams.get('w') || '');
      const seedNotes = live.WATCHLIST_SEED.map((t) => t.notes).filter(Boolean);
      if (plan[plan.length - 2] === 'Open in PIALAX:' && URL_RE.test(planUrl) && planGot && planGot.added.some((a) => a.id === ORD.id) &&
          planGot.overrides.london && planGot.overrides.london.notes === 'Our own London note' &&
          !Object.values(planGot.overrides).some((o) => seedNotes.includes(o.notes)))
        ok(f + ': the whole-plan link uses ?w= too (' + planUrl.length + ' characters), with edited notes but not the seeds\' own');
      else bad(f + ': plan share link: ' + planUrl);
    } catch (e) { bad(f + ': share message check failed — ' + e.message); }

    // Receiving: ?w= loads like ?wl= and lands the trip; hostile links change nothing.
    const recv = (search) => {
      const s2 = makeShim(); s2.location.search = search;
      const { api: r } = loadApi(path.join(ROOT, f), f, EXPECT, s2);
      r.loadWatchlist(); return r;
    };
    try {
      const r = recv('?w=' + E({ overrides: { peru: { notes: 'Shared via ?w=' } }, added: [ORD] }));
      const got = r.watchlistItem(ORD.id), peru = r.watchlistItem('peru');
      if (got && got.title === ORD.title && got.dep === ORD.dep && got.ret === ORD.ret && got.hub === 'NYC' && got.eventDate === ORD.eventDate && peru && peru.notes === 'Shared via ?w=')
        ok(f + ': opening a ?w= link adds the trip and applies the overrides');
      else bad(f + ': ?w= link did not load: ' + JSON.stringify({ got, peru: peru && peru.notes }));
      const base = recv('').WATCHLIST_SEED.length;
      const junk = ['?w=not*base64', '?w=' + 'A'.repeat(40000), '?w=' + b64('{"v":1,"a":[]}'), '?w=' + b64('nope')];
      const counts = junk.map((q) => { const j = recv(q); return j.watchlistItem(ORD.id) ? -1 : 0; });
      if (counts.every((c) => c === 0) && junk.every((q) => D(q.slice(3)) === null) && base > 0)
        ok(f + ': garbage, oversized and wrong-version ?w= links decode to nothing and load nothing');
      else bad(f + ': a hostile ?w= link was accepted');
      const evil = recv('?w=' + b64('{"v":2,"a":[{"i":"evil","m":"s","o":"<script>","d":"SFO"}]}'));
      const pp = D(b64('{"v":2,"a":[{"i":"pp","m":"s","o":"LAX","d":"SFO","z":{"__proto__":{"polluted":1}}}]}'));
      if (!evil.watchlistItem('evil') && pp && Object.getPrototypeOf(pp.added[0]) === Object.prototype && pp.added[0].polluted === undefined)
        ok(f + ': a ?w= trip with a bad airport code is still dropped, and __proto__ passthrough is ignored');
      else bad(f + ': hostile ?w= trip got through');
    } catch (e) { bad(f + ': ?w= receive check failed — ' + e.message); }
  }
}

// AC-PARITY (PIA-046) — the two files are hand-mirrored with nothing enforcing
// it. Every captured pure function must be byte-identical across them, so drift
// is caught here instead of as a bug that only reproduces on one device.
if (loaded[FILES[0]] && loaded[FILES[1]]) {
  const a = loaded[FILES[0]], b = loaded[FILES[1]];
  // loadWatchlist has an existing mobile-specific comment; its behavior is
  // exercised above with matching fixtures in both views.
  const drifted = EXPECT.filter((n) => n !== 'loadWatchlist' && typeof a[n] === 'function' && String(a[n]) !== String(b[n]));
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

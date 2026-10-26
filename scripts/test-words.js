'use strict';
// test-words.js — PIA-134: the strict word gate for app.html, plus the shell's browser-only criteria.
// PIA-135 adds Trips › Ideas: totals, new-answer marks, the list-share and receiving sheets, the shelf, card fit.
//
// THE RULE (CLAUDE.md, PIALAX_HQ.md): a word is a visible whitespace-separated token that contains a Unicode
// letter. Tab labels, codes, month names, names, buttons, placeholders and typed values all count. Trip names
// ([data-free]), numerals, emoji, glyphs and shapes are free. Every screen ≤10 words and every popup (sheet,
// long-press label, toast) ≤20, in every state.
//
// This suite counts the RENDERED DOM in headless Chromium with its own counter (it does not trust the app's),
// for every screen and popup the shell can reach, on several phones built from fixtures: an 8-member trip with
// long names, unknown airports, an idea with no place, a long typed title, the unmigrated v1 Thanksgiving doc,
// shelf trips, a revealed token, long typed field values, a failed refresh and a link to a trip that is gone.
// It also checks, per acceptance criterion of PIA-134:
//   AC2  three labelled tabs, no wordmark; [Ideas | Family] once the phone holds two trips; a cold open lands
//        on Trips › Ideas; the selected trip is the one Map and Calendar show, across a reload and a cold open
//   AC4  one sheet at a time, named for what it is; ⌄, ‹, Esc, the browser's Back and a tap on the scrim close it
//        (typed ⚙ values survive); nothing closes it by itself; a failed background refresh never opens one, and
//        a P-error waits for an open sheet; focus stays inside an open sheet and returns to its opener; the
//        phone's Back on a trip view returns to the list or to Map
//   AC5  ⓘ explains every glyph drawn on screen (read from the rendered text, not from the app's tags);
//        long-press names every labelled control and every glyph (under a card's overlay too), never a container,
//        and never triggers anything; ⚙ (and so the token entry) is reachable from every screen and refuses a
//        Worker the CSP would block
//   AC6  a missing trip shows the app's own words, never the Worker's text, however slowly other trips load
//   AC7  organizer links leave the address bar; list links import ids
//   AC9  a focus refresh reads every listed trip
//   PIA-135  cards fit at 360px; the one total only on the organizer's token phone (none at all on a guest's), and
//        partial when a traveler is priced by one leg of two; ⏳ over the book-by arc and the stage disc on every
//        card; P-sharelist (groups, the largest pre-checked, shelf and dropped left out, the exact +n count, the
//        link it hands over, keyboard focus, chip names); P-savelist (the sender's face, only new trips, ⤓ Save,
//        cards fly in); long-press inside both sheets; ● new answers and the exact Trips numeral; a failed refresh
//        dims cards; the empty Map and Calendar
// Offline: the Worker is a route over fixture docs, every other request is aborted and fails the suite.
// The clock is pinned to 2026-10-17 19:00 UTC (12:00 in Los Angeles).
//
// Skips cleanly (exit 0, "SKIPPED") when Playwright or its browser is missing, like test-viewport.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const APP_URL = process.env.PIALAX_TEST_APP_URL || 'file://' + path.join(ROOT, 'app.html');
const W = 'https://pialax-proxy.ashwinyedavalli.workers.dev';
const NOW_ISO = '2026-10-17T19:00:00.000Z';
const KEY = 'pialax-test-edit-key-0123456789abcdefghijk';
const TOKEN = 'org-token-0123456789abcdefABCDEF';
const WIDTHS = [360, 390, 430];
const SCREEN_MAX = 10, POPUP_MAX = 20;

function loadPlaywright() {
  const roots = [];
  if (process.env.NODE_PATH) roots.push(...process.env.NODE_PATH.split(path.delimiter));
  try { roots.push(execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch (e) { /* npm absent */ }
  roots.push('/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules');
  for (const name of ['playwright', 'playwright-core']) {
    try { return require(name); } catch (e) { /* not local */ }
    for (const r of roots.filter(Boolean)) {
      try { const m = require(require.resolve(name, { paths: [r] })); if (m && m.chromium) return m; } catch (e) { /* next root */ }
    }
  }
  return null;
}

let passCount = 0, failCount = 0;
const ok = (m) => { console.log('  OK  ' + m); passCount++; };
const bad = (m, d) => { console.log('  XX  ' + m + (d === undefined ? '' : '\n        ' + (typeof d === 'string' ? d : JSON.stringify(d)))); failCount++; };
const check = (c, m, d) => (c ? ok(m) : bad(m, d));
const section = (t) => console.log('\n▶ ' + t);

// ---- fixtures: the repo's /idea docs plus a few built here ----
const fx = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', n), 'utf8'));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const MODEL = require(path.join(ROOT, 'scripts', 'trip-model.js'));
const DOC = {};
['idea-diwali.json', 'idea-tahoe.json', 'idea-8members.json', 'idea-undated.json', 'idea-thanksgiving-legacy.json', 'idea-lax-local.json'].forEach((f) => { const d = fx(f); DOC[d.id] = d; });
const A = 'dwDiwaliRaleigh2026a01', B = 'thTahoeSkiWeekend26b02', M8 = 'm8GrandmaNinetieth0c03', C = 'cyCaryShowerUndated004', TG = 'tgLegacyThanksgiving01', LX = 'lxBeachWeekendLAX00d05';
function mkDoc(id, title, dest, dates, notes, members, responses, stage) {
  const R = {};
  Object.keys(responses || {}).forEach((c) => { R[c] = Object.assign({ member: c, status: 'in', origin: '', available_from: '', available_to: '', note: '', arrive_at: '', leave_from: '', updated_at: '2026-10-16T10:00:00.000Z' }, responses[c]); });
  return { v: 1, id, created_at: '2026-10-14T10:00:00.000Z', updated_at: '2026-10-16T10:00:00.000Z',
    idea: { title, destination: { city: '', airport: dest }, dates: Object.assign({ departure: '', return: '', searchStart: '', searchEnd: '' }, dates), recommendation: null, notes: notes || '',
      members: members.map((m) => ({ code: m[0], label: m[1], airport: m[2], headcount: m[3] || 1 })) },
    responses: R, decision: { stage: stage || 'proposed', chosen: null, chosen_at: null, estimate_total: null, actual_total: null, booked_at: null, delta_pct: null },
    log: Object.keys(R).map((c) => ({ at: '2026-10-16T10:00:00.000Z', event: 'rsvp:' + R[c].status, by: c })) };
}
const UK = 'ukUnknownAirports00u01', ND = 'ndNoPlaceYetIdea000n01', LT = 'ltLongTitleTrip0000l01', PAST = 'psPastTripSeptember001', DROP = 'drDroppedTripIdea00d01';
const LONG_TITLE = '🌊 A really long trip name that somebody typed in full because they could not stop typing words';
DOC[UK] = mkDoc(UK, '🌵 Desert getaway somewhere new', 'ZZQ', { departure: '2026-11-13', return: '2026-11-16' }, '📌2026-11-14 Stargazing night out on the dunes',
  [['priya-u1', '🦊 Priya Raghunathan-Venkataraman', 'QQQ'], ['maya-u2', '🐼 Maya', 'XYZ', 2], ['ashwin-u3', '🌴 Ashwin', 'LAX']], { 'priya-u1': { origin: 'QQQ' }, 'maya-u2': { status: 'maybe', origin: 'XYZ' } });
DOC[ND] = mkDoc(ND, '💡 Somewhere warm in January', '', { searchStart: '2027-01-08', searchEnd: '2027-01-20' }, '🌙5 Anywhere with a beach',
  [['ashwin-n1', '🌴 Ashwin', 'LAX'], ['anjo-n2', '🗽 Anjo', 'LGA']], { 'ashwin-n1': { origin: 'LAX', available_from: '2027-01-09', available_to: '2027-01-14' } });
DOC[LT] = mkDoc(LT, LONG_TITLE.slice(0, 80), 'SAN', { departure: '2026-12-18', return: '2026-12-21' }, '',
  [['ashwin-t1', '🌴 Ashwin', 'LAX'], ['anjo-t2', '🗽 Anjo', 'LGA'], ['leo-t3', '🐸 Leonardo Bartholomew', 'SEA'], ['maya-t4', '🐼 Maya', 'SFO']], { 'ashwin-t1': { origin: 'LAX' } });
DOC[PAST] = mkDoc(PAST, '🌆 Chicago weekend', 'ORD', { departure: '2026-09-11', return: '2026-09-14' }, '', [['ashwin-p1', '🌴 Ashwin', 'LAX'], ['anjo-p2', '🗽 Anjo', 'LGA']], { 'ashwin-p1': { origin: 'LAX' }, 'anjo-p2': { origin: 'LGA' } });
DOC[DROP] = mkDoc(DROP, '⚾ Spring training', 'PHX', { departure: '2027-03-05', return: '2027-03-09' }, '', [['ashwin-d1', '🌴 Ashwin', 'LAX'], ['leo-d2', '🐸 Leo', 'SEA']], { 'ashwin-d1': { origin: 'LAX' } }, 'dropped');
// PIA-135: the widest card row B the app can draw: a plan across two months with 📌 in the second, my days off the
// plan, missing 📌 and double-booked (⚠ + three causes), a three-digit ⏳ over its book-by arc, and a partial stale
// total with six faces unpriced
const WC1 = 'wcWidestCardRowB000w01', WC2 = 'wcClashingTripIdea0w02', OJ = 'ojNewYorkOpenJaw000o01';
DOC[WC1] = mkDoc(WC1, '🎂 Widest card', 'SAV', { departure: '2027-11-30', return: '2027-12-02' }, '📌2027-12-01 Party',
  [['ashwin-w1', '🌴 Ashwin', 'LAX'], ['priya-w2', '🦊 Priya', 'DEN'], ['maya-w3', '🐻 Maya', 'SFO'], ['leo-w4', '🐼 Leo', 'SEA'], ['sam-w5', '🐨 Sam', 'PDX', 2], ['ana-w6', '🦁 Ana', 'ATL'], ['bo-w7', '🐯 Bo', 'BOS']],
  { 'ashwin-w1': { origin: 'LAX', available_from: '2027-11-29', available_to: '2027-11-30' } });
DOC[WC2] = mkDoc(WC2, '⛺ Clashing trip', 'DEN', { departure: '2027-11-29', return: '2027-12-01' }, '', [['ashwin-w9', '🌴 Ashwin', 'LAX'], ['leo-w8', '🐼 Leo', 'SEA']], { 'ashwin-w9': { origin: 'LAX' } });
// an open-jaw traveler priced by one leg of two (Mom & Dad fly into JFK and home from LGA; only their inbound is cached)
DOC[OJ] = mkDoc(OJ, '🗽 New York weekend', 'LGA', { departure: '2026-12-11', return: '2026-12-14' }, '',
  [['ashwin-o1', '🌴 Ashwin', 'LAX'], ['momdad-o2', '🌽 Mom & Dad', 'PIA', 2], ['anjo-o3', '🗽 Anjo', 'LGA']],
  { 'ashwin-o1': { origin: 'LAX' }, 'momdad-o2': { origin: 'PIA', arrive_at: 'JFK', leave_from: 'LGA' } });
// PIA-136: a trip whose caption is a longer v1 text (P-note asks twice before replacing it)
const LC = 'lcLongCaptionTrip00c01';
DOC[LC] = mkDoc(LC, '🎄 Christmas in Peoria', 'PIA', { departure: '2026-12-22', return: '2026-12-27' }, '📌2026-12-25 ' + Array.from({ length: 30 }, (_, i) => 'longword' + i).join(' '),
  [['ashwin-c1', '🌴 Ashwin', 'LAX'], ['anjo-c2', '🗽 Anjo', 'LGA']], { 'ashwin-c1': { origin: 'LAX' } });
// PIA-137: a trip whose dates are set (🔒) in Peoria (PIA/ORD): the organizer's 🎫 marks, a host, someone waiting and someone
// out, a 2-word name and a leave from ORD; and a paid New Year trip (closed: 🏁) where the guest has booked
const LK = 'lkLockedChristmas00k01', PD = 'pdPaidNewYearTrip00p01';
DOC[LK] = mkDoc(LK, '🎄 Christmas at the Hernández-Villanuevas', 'PIA', { departure: '2026-12-22', return: '2026-12-27' }, '📌2026-12-25 Bring the good pie',
  [['ashwin-k1', '🌴 Ashwin', 'LAX'], ['guadalupe-k2', '🦉 Guadalupe Hernández-Villanueva', 'PIA', 2], ['leo-k3', '🐸 Leonardo Bartholomew', 'SEA'], ['anjo-k4', '🗽 Anjo', 'LGA'], ['sam-k5', '🐨 Sam Lee', 'PDX']],
  { 'ashwin-k1': { origin: 'LAX', available_from: '2026-12-21', leave_from: 'ORD' }, 'leo-k3': { origin: 'SEA', note: 'Red-eye Monday night then a train down from Chicago with the kids and the dog' }, 'sam-k5': { status: 'out', note: 'Work' } }, 'chosen');
DOC[PD] = mkDoc(PD, '🎉 New Year in New York', 'LGA', { departure: '2026-12-30', return: '2027-01-02' }, '',
  [['ashwin-q1', '🌴 Ashwin', 'LAX'], ['leo-q3', '🐸 Leonardo Bartholomew', 'SEA'], ['anjo-q4', '🗽 Anjo', 'LGA']], { 'ashwin-q1': { origin: 'LAX', booked: true }, 'leo-q3': { origin: 'SEA', booked: true } }, 'booked');
DOC[PD].decision.actual_total = 1400;
DOC[PD].decision.chosen = { airport: 'LGA', city: 'New York', departure: '2026-12-30', return: '2027-01-02' };
// PIA-139: the 8-member long-name trip with its dates set and every traveler booked (🏁 Done, nothing paid yet): times
// recorded for the pickups (two arrivals 30 minutes apart make one ⏱ run), the hosts not answered yet
const BK = 'bkBookedBirthdayDone01';
DOC[BK] = (() => {
  const d = JSON.parse(JSON.stringify(DOC[M8])); d.id = BK;
  d.decision = { stage: 'chosen', chosen: { airport: 'SAV', city: 'Savannah', departure: '2026-12-11', return: '2026-12-14' }, chosen_at: '2026-10-16T00:00:00.000Z', estimate_total: null, actual_total: null, booked_at: null, delta_pct: null };
  ['bartholomewmontgomeryfitzgera-dj', 'anastasiakonstantinopoulou-x1', 'maximilianoyelaranwhitfield-5u', 'samlee-sb', 'oluwaseunadebayorichardson-ew'].forEach((c) => { d.responses[c].booked = true; d.responses[c].booked_at = '2026-10-16T00:00:00.000Z'; });
  d.responses['bartholomewmontgomeryfitzgera-dj'].note = '🛬15:10 🛫18:05 ' + d.responses['bartholomewmontgomeryfitzgera-dj'].note;
  d.responses['anastasiakonstantinopoulou-x1'].note = '🛬15:40';
  d.responses['oluwaseunadebayorichardson-ew'].note = '📞 🛬15:05 🛫20:00';
  return d;
})();
// PIA-140: the worst case for P-total's words: 8 travelers with long names, each open-jaw (into PIA, home from ORD) from a nearby set,
// and each leg won by another airport of their set (16 codes on screen)
const PW = 'pwWorstCasePrices00p01';
DOC[PW] = mkDoc(PW, '🦃 Every airport wins somewhere', 'PIA', { departure: '2026-11-20', return: '2026-11-29' }, '',
  [['bartholomew-w1', '🦊 Bartholomew Montgomery-Fitzgerald', 'LAX'], ['anastasia-w2', '🐻 Anastasia Konstantinopoulou', 'LGA', 2], ['maximilian-w3', '🐼 Maximilian Oyelaran-Whitfield', 'BUR'],
    ['guadalupe-w4', '🦉 Guadalupe Hernández-Villanueva', 'JFK'], ['oluwaseun-w5', '🐙 Oluwaseun Adebayo-Richardson', 'SNA'], ['priya-w6', '🐯 Priya Raghunathan-Venkataraman', 'EWR'],
    ['leonardo-w7', '🐸 Leonardo Bartholomew', 'ONT'], ['ashwin-w8', '🌴 Ashwin', 'LGB']],
  // each with their own days, so no two travelers share a search (one search per set and day would give them one winner)
  ['bartholomew-w1', 'anastasia-w2', 'maximilian-w3', 'guadalupe-w4', 'oluwaseun-w5', 'priya-w6', 'leonardo-w7', 'ashwin-w8'].reduce((o, c, i) => {
    o[c] = { origin: ['LAX', 'LGA', 'BUR', 'JFK', 'SNA', 'EWR', 'ONT', 'LGB'][i], leave_from: 'ORD', available_from: MODEL.addD('2026-11-20', -i), available_to: MODEL.addD('2026-11-29', i) }; return o; }, {}));
// PIA-141: the worst case for P-cheapest's words: the same 8 long names, the first four following the plan, the last four with own
// days longer than the trip (so every week carries ⚠ and four faces, and 8 chips under the selected week), no 📌 (15 weeks, 3 pages)
const PC = 'pcCheapWeekWorstCase01';
DOC[PC] = (() => {
  const d = JSON.parse(JSON.stringify(DOC[PW])); d.id = PC; d.idea.title = '📉 Every week leaves someone out';
  ['bartholomew-w1', 'anastasia-w2', 'maximilian-w3', 'guadalupe-w4'].forEach((c) => { d.responses[c].available_from = ''; d.responses[c].available_to = ''; });
  return d;
})();
// PIA-141: the spec's Thanksgiving S1 (the legacy doc migrated through the real Worker, then 🔓) and the same without its 📌 are built
// in main() once worker.js is loaded (buildS1)
const S1 = 'tgS1ThanksgivingS10001', S1N = 'tnS1NoPinThanksgiv0001';
const idOk = Object.keys(DOC).every((id) => /^[A-Za-z0-9_-]{22}$/.test(id) && DOC[id].id === id);
// PIA-135: cached real fares on the organizer's token phone (keys from the model itself): Diwali complete and fresh,
// the long-title trip partly priced, the unknown-airports trip priced from a stale search
const NOW_MS = Date.parse(NOW_ISO);
const FARES = (() => {
  const out = {}, keysOf = (id, me) => MODEL.tripModel(DOC[id], { today: '2026-10-17', now: NOW_MS, me, hasEditKey: true, hasToken: true }).travelers;
  keysOf(A, 'ashwin-p8').forEach((x, i) => x.keys.forEach((k) => { out[k.key] = { p: 310 + 95 * i, f: NOW_MS - 2 * 36e5 }; }));
  keysOf(LT, 'ashwin-t1').slice(0, 1).forEach((x) => x.keys.forEach((k) => { out[k.key] = { p: 189, f: NOW_MS - 36e5 }; }));
  keysOf(UK, 'ashwin-u3').forEach((x) => x.keys.forEach((k) => { out[k.key] = { p: 402, f: NOW_MS - 30 * 36e5 }; }));
  keysOf(WC1, 'ashwin-w1').slice(0, 1).forEach((x) => x.keys.forEach((k) => { out[k.key] = { p: 123456, f: NOW_MS - 30 * 36e5 }; }));
  keysOf(OJ, 'ashwin-o1').forEach((x) => { (x.code === 'momdad-o2' ? x.keys.slice(0, 1) : x.keys).forEach((k) => { out[k.key] = { p: x.code === 'momdad-o2' ? 260 : 199, f: NOW_MS - 36e5 }; }); });
  // PIA-140: the Done 8-member trip's five travelers in every state a leg can be in: fresh (with Google's level, stops, a ▼), a day
  // old, searched with no fares, and never searched; Anastasia's ±1 days priced too
  const SERP = fx('serp-flights.json');
  keysOf(BK, 'grandmajosephine-nf').forEach((x, i) => x.keys.forEach((k) => {
    const e = MODEL.fareFromSerp(SERP, NOW_MS - (i === 1 ? 30 : 2) * 36e5, i === 0 ? { p: 1450, f: NOW_MS - 50 * 36e5 } : null);
    if (i === 2) out[k.key] = { p: null, none: true, f: NOW_MS - 36e5 };
    else if (i !== 3) { e.p += 1000 * i; e.off[0].p = e.p; out[k.key] = e; }
  }));
  const bkm = MODEL.tripModel(DOC[BK], { today: '2026-10-17', now: NOW_MS, me: 'grandmajosephine-nf', hasEditKey: true, hasToken: true });
  MODEL.endPrices(bkm, 'anastasiakonstantinopoulou-x1', 0, out, NOW_MS, '2026-10-17').rows.forEach((r, j) => { if (r.k) out[r.key] = { p: 980 + 70 * j, f: NOW_MS - 36e5 }; });
  // the worst case: every leg of every traveler won by another airport of their set, both ways (multi-airport keys)
  MODEL.tripModel(DOC[PW], { today: '2026-10-17', now: NOW_MS, me: 'ashwin-w8', hasEditKey: true, hasToken: true, multiAirport: true }).travelers.forEach((x, i) => x.keys.forEach((k) => {
    const other = x.O.filter((c) => c !== x.origin)[i % (x.O.length - 1)];
    out[k.key] = { p: 4321 + 1111 * i, f: NOW_MS - (i % 3) * 13 * 36e5, lvl: ['low', 'typical', 'high'][i % 3], typ: [300, 500], prev: 4400 + 1111 * i, pf: NOW_MS - 60 * 36e5,
      off: [{ p: 4321 + 1111 * i, d: k.kind === 'in' ? other : 'ORD', a: k.kind === 'in' ? 'PIA' : other, dt: '2026-11-20 07:15', ar: '2026-11-20 15:35', s: i % 3 }] };
  }));
  return out;
})();

// ---- phones ----
const keyRec = (ids) => { const o = {}; ids.forEach((id) => { o[id] = { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' }; }); return o; };
const listRec = (ids, pin) => ids.map((id) => ({ id, t: '', e: '', at: 1, pin: (pin || []).indexOf(id) >= 0, arch: false }));
const PHONES = {
  organizer: { ls: { pialax_watchlist_v2: listRec([A, B, M8, C, LT, UK, ND, PAST, DROP, LX], [B]), pialax_idea_keys_v1: keyRec([A, LT, UK, DROP]), pialax_proxy_token: TOKEN, pialax_fares_v2: FARES,
    pialax_idea_seen_v1: { [UK]: '2026-10-16T09:00:00.000Z', [B]: '2026-10-13T00:00:00.000Z' },
    pialax_idea_me_v1: { [A]: 'ashwin-p8', [B]: 'ashwin-l2', [C]: 'ashwin-c3', [LT]: 'ashwin-t1', [UK]: 'ashwin-u3', [ND]: 'ashwin-n1', [PAST]: 'ashwin-p1', [DROP]: 'ashwin-d1', [LX]: 'ashwin-x3' }, pialax_ui_v1: { v1read: 1 } } },
  guest: { ls: { pialax_watchlist_v2: listRec([A, TG, C]), pialax_idea_me_v1: { [A]: 'anjo-z5', [TG]: 'LGA', [C]: 'anjo-c4' }, pialax_ui_v1: { v1read: 1 } } },
  host: { ls: { pialax_watchlist_v2: listRec([TG, A]), pialax_idea_me_v1: { [TG]: 'PIA' }, pialax_ui_v1: { v1read: 1 } } },
  eight: { ls: { pialax_watchlist_v2: listRec([M8]), pialax_idea_keys_v1: keyRec([M8]), pialax_idea_me_v1: { [M8]: 'grandmajosephine-nf' }, pialax_ui_v1: { v1read: 1 } } },   // PIA-136: organizes the 8-member trip
  shelf: { ls: { pialax_watchlist_v2: listRec([PAST, DROP]), pialax_idea_me_v1: { [PAST]: 'ashwin-p1', [DROP]: 'ashwin-d1' }, pialax_ui_v1: { v1read: 1 } } },   // every trip on the shelf
  fresh: { ls: {} },
  widest: { ls: { pialax_watchlist_v2: listRec([WC1, WC2, OJ]), pialax_idea_keys_v1: keyRec([WC1, OJ]), pialax_proxy_token: TOKEN, pialax_fares_v2: FARES,   // PIA-135: the widest card, and a half-priced open-jaw traveler
    pialax_idea_me_v1: { [WC1]: 'ashwin-w1', [WC2]: 'ashwin-w9', [OJ]: 'ashwin-o1' }, pialax_ui_v1: { v1read: 1 } } }
};
const KEYS = { [A]: KEY, [LT]: KEY, [UK]: KEY, [DROP]: KEY, [WC1]: KEY, [OJ]: KEY, [M8]: KEY, [LC]: KEY, [LK]: KEY };
// PIA-137 phones: the organizer of the set Christmas trip (his 🎫 marks on the board), and a guest on it and on the paid trip
PHONES.lockorg = { ls: { pialax_watchlist_v2: listRec([LK]), pialax_idea_keys_v1: keyRec([LK]), pialax_proxy_token: TOKEN, pialax_idea_me_v1: { [LK]: 'ashwin-k1' }, pialax_ui_v1: { v1read: 1 } } };
PHONES.portal = { ls: { pialax_watchlist_v2: listRec([LK, PD]), pialax_idea_me_v1: { [LK]: 'leo-k3', [PD]: 'leo-q3' }, pialax_ui_v1: { v1read: 1 } } };
// PIA-136 phones: Ashwin's token phone whose trip added last is the family's (Diwali), and one trip with a longer v1 caption
PHONES.diwali = { ls: { pialax_watchlist_v2: [{ id: B, t: '', e: '', at: 1, pin: false, arch: false }, { id: A, t: '', e: '', at: 2, pin: false, arch: false }], pialax_idea_keys_v1: keyRec([A]), pialax_proxy_token: TOKEN,
  pialax_idea_me_v1: { [A]: 'ashwin-p8', [B]: 'ashwin-l2' }, pialax_ui_v1: { v1read: 1 } } };
PHONES.caption = { ls: { pialax_watchlist_v2: listRec([LC]), pialax_idea_keys_v1: keyRec([LC]), pialax_idea_me_v1: { [LC]: 'ashwin-c1' }, pialax_ui_v1: { v1read: 1 } } };
// PIA-139 phones: the organizer of the Done 8-member trip, on his token phone (💵 in P-stage, everyone's times), and a booked
// traveler on it (Bartholomew: Flighty, his own time fields) who is also Leo on the set Christmas trip (not booked: Book | 🎫)
KEYS[BK] = KEY;
PHONES.bookorg = { ls: { pialax_watchlist_v2: listRec([BK]), pialax_idea_keys_v1: keyRec([BK]), pialax_proxy_token: TOKEN, pialax_idea_me_v1: { [BK]: 'grandmajosephine-nf' }, pialax_ui_v1: { v1read: 1 },
  pialax_fares_v2: FARES, pialax_serpapi_quota: { period: '2026-10', used: 41, budget: 1000, exceeded: false } } };   // PIA-140: its travelers' fares in every state
// PIA-140: the organizer of the worst-case prices trip (16 winning airports), nearby airports on (pialax_multi_airport_v1, as v1 leaves it)
KEYS[PW] = KEY; KEYS[PC] = KEY;   // PIA-141: + the P-cheapest worst case on the same phone
PHONES.prices = { ls: { pialax_watchlist_v2: listRec([PW, PC]), pialax_idea_keys_v1: keyRec([PW, PC]), pialax_proxy_token: TOKEN, pialax_idea_me_v1: { [PW]: 'ashwin-w8', [PC]: 'ashwin-w8' }, pialax_ui_v1: { v1read: 1 },
  pialax_fares_v2: FARES, pialax_multi_airport_v1: '1' } };
PHONES.booked = { ls: { pialax_watchlist_v2: listRec([BK, LK]), pialax_idea_me_v1: { [BK]: 'bartholomewmontgomeryfitzgera-dj', [LK]: 'leo-k3' }, pialax_ui_v1: { v1read: 1 } } };
// PIA-142: the Family board's worst case for names: the 8 long names (two Sam Lees), the unknown-airports trip and the long-title
// trip, 13 people (Ashwin is me on two of them); this phone organizes the 8-member trip without being on it. And a phone that is
// Ashwin on Diwali and nobody on Tahoe yet (its profile says Ashwin): his Tahoe cell asks who he is first
PHONES.fam8 = { ls: { pialax_watchlist_v2: listRec([M8, UK, LT]), pialax_idea_keys_v1: keyRec([M8]), pialax_idea_me_v1: { [UK]: 'ashwin-u3', [LT]: 'ashwin-t1' }, pialax_ui_v1: { v1read: 1 } } };
PHONES.famface = { ls: { pialax_watchlist_v2: listRec([A, B]), pialax_idea_me_v1: { [A]: 'ashwin-p8' }, pialax_me_profile_v1: { label: '🌴 Ashwin' }, pialax_ui_v1: { v1read: 1 } } };
// PIA-142 fix pass: a first-run phone (Mom: three trips by a list link, no name, no face, no token), and the organizer of the v1
// Thanksgiving (its key; this phone is its "Me")
PHONES.fammom = { ls: { pialax_watchlist_v2: listRec([A, B, M8]), pialax_ui_v1: { v1read: 1 } } };
PHONES.famv1 = { ls: { pialax_watchlist_v2: listRec([TG, A]), pialax_idea_keys_v1: keyRec([TG]), pialax_idea_me_v1: { [TG]: 'LAX', [A]: 'ashwin-p8' }, pialax_ui_v1: { v1read: 1 } } };

// PIA-136: the real worker.js /idea handlers, in-process, for the phones that write (create, edit, join): each such phone gets its
// own in-memory KV seeded with the fixture docs (the organizer's key hashed in), so a Create, an update or an answer really happens
const crypto = require('crypto');
let WORKER = null;
async function loadWorker() {
  const os = require('os'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pialax-test-words-')), file = path.join(dir, 'worker.mjs');
  fs.writeFileSync(file, fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8'));
  try { return (await import('file://' + file)).default; } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
// PIA-141: Thanksgiving S1 as the app meets it: the legacy fixture migrated by the model's own P-migrate requests through the real
// Worker (📌 11/26 from v1's card, plan 11/20–11/29, faces), then 🔓 (P-migrate keeps the 🔒); S1N the same with its 📌 cleared.
// The 's1' phone is the organizer's token phone on them (S1's fares 3h old, as the spec has them) and on the undated idea
async function buildS1() {
  const hash = crypto.createHash('sha256').update(KEY).digest('hex'), V1 = fx('v1-watchlist-storage.json');
  for (const [id, nopin] of [[S1, false], [S1N, true]]) {
    const map = new Map(), env = { IDEAS: { async get(k) { return map.has(k) ? map.get(k) : null; }, async put(k, v) { map.set(k, String(v)); }, async delete(k) { map.delete(k); } } };
    const d0 = JSON.parse(JSON.stringify(DOC[TG])); d0.id = id; d0.edit_hash = hash; map.set('idea:' + id, JSON.stringify(d0));
    const v1 = JSON.parse(JSON.stringify(V1)); v1.overrides.thanksgiving.sharedIdeaId = id;
    const send = async (reqs) => { for (const q of reqs || []) await WORKER.fetch(new Request('https://w.dev' + q.path, { method: q.method, headers: { 'Content-Type': 'application/json', Origin: 'https://shwinster101.github.io' }, body: JSON.stringify(q.body) }), env); };
    const read = () => JSON.parse(map.get('idea:' + id));
    const mo = MODEL.migrateOptions(read(), v1);
    await send(MODEL.migrateRequests(read(), KEY, { plan: mo.span, pin: mo.pin, labels: mo.labels }));
    await send(MODEL.organizerEdit(read(), KEY, { decision: { stage: 'proposed' } }));
    if (nopin) await send(MODEL.organizerEdit(read(), KEY, { pin: '' }));
    const d = read(); delete d.edit_hash; DOC[id] = d; KEYS[id] = KEY;
  }
  const m = MODEL.tripModel(DOC[S1], { today: '2026-10-17', now: NOW_MS, me: 'LAX', hasEditKey: true, hasToken: true, multiAirport: true }), f = {};
  const a = m.travelers.find((x) => x.code === 'LAX').keys, j = m.travelers.find((x) => x.code === 'LGA').keys;
  [[a[0], 305], [a[1], 200], [j[0], 290], [j[1], 160]].forEach(([k, p]) => { f[k.key] = { p, f: NOW_MS - 3 * 36e5 }; });
  KEYS[C] = KEY;
  PHONES.s1 = { ls: { pialax_watchlist_v2: listRec([S1, S1N, C]), pialax_idea_keys_v1: keyRec([S1, S1N, C]), pialax_proxy_token: TOKEN, pialax_multi_airport_v1: '1',
    pialax_idea_me_v1: { [S1]: 'LAX', [S1N]: 'LAX', [C]: 'ashwin-c3' }, pialax_fares_v2: f, pialax_ui_v1: { v1read: 1 } } };
  return DOC[S1] && DOC[S1N] && MODEL.parseNotes(DOC[S1].idea.notes).pin === '2026-11-26' && !MODEL.parseNotes(DOC[S1N].idea.notes).pin && DOC[S1].decision.stage === 'proposed';
}
function workerKV() {
  const map = new Map(), hash = crypto.createHash('sha256').update(KEY).digest('hex');
  Object.keys(DOC).forEach((id) => { const d = JSON.parse(JSON.stringify(DOC[id])); d.edit_hash = hash; map.set('idea:' + id, JSON.stringify(d)); });
  return { map, env: { IDEAS: { async get(k) { return map.has(k) ? map.get(k) : null; }, async put(k, v) { map.set(k, String(v)); }, async delete(k) { map.delete(k); } } } };
}

// ---- the strict counter, evaluated in the page (independent of the app's own countWords) ----
const COUNT = (sels) => {
  const out = [];
  const vis = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { if (e.hasAttribute('hidden')) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
  const push = (s) => String(s).split(/\s+/).forEach((t) => { if (/\p{L}/u.test(t)) out.push(t); });
  for (const sel of sels) {
    const root = document.querySelector(sel); if (!root || !vis(root)) continue;
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.closest('[data-free]') || /^(SCRIPT|STYLE)$/.test(el.tagName) || !vis(el)) continue;
      if (el.tagName !== 'TEXTAREA') for (const n of el.childNodes) if (n.nodeType === 3) push(n.textContent);
      if ((el.tagName === 'INPUT' && !['password', 'hidden', 'checkbox', 'radio'].includes(el.type)) || el.tagName === 'TEXTAREA') push(el.value || el.placeholder || '');
    }
  }
  return out;
};
const SKIP_KEY = ['back', 'key', 'settings', 'close'];
// the app's declared icon vocabulary: key → its 1–3 word label (read from app.html's LEGEND, the one place it is written)
const LEGEND_LABEL = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8'), b = src.indexOf('var LEGEND = {'), e = src.indexOf('};', b);
  const out = {}, re = /(?:^|[\s{,])'?([a-z][a-z-]*)'?:\s*\[[^\]]*?,\s*'([^']+)'\]/g;
  let m; while ((m = re.exec(src.slice(b, e)))) out[m[1]] = m[2];
  return out;
})();
// labelled controls, as the app defines them; anything else (a tab, a segment, a chip row, the sheet) is a container or a text control
const CTL = 'button[aria-label],a[aria-label],[role="img"][aria-label],[data-lbl]';
// a glyph: a pictograph or symbol (not a letter, numeral or ordinary punctuation)
const GLYPH_SRC = '[\\p{Extended_Pictographic}\\p{So}\\u27E6\\u27E7\\u2039\\u203A\\uFF0B\\u2190-\\u21FF\\u25A0-\\u25FF]';

async function main() {
  const pw = loadPlaywright();
  console.log('PIALAX test-words · HERE=' + ROOT);
  if (!pw) { console.log('  ··  playwright not resolvable — skipping (not a gate failure)\n\nTEST-WORDS: SKIPPED (no playwright)'); return 0; }
  let browser;
  try { browser = await pw.chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/opt/pw-browsers/chromium' }); }
  catch (e) { try { browser = await pw.chromium.launch(); } catch (e2) { console.log('  ··  no Chromium for Playwright — skipping\n\nTEST-WORDS: SKIPPED (no browser)'); return 0; } }
  console.log('▶ test-words: the strict word gate over app.html (PIA-134)');
  check(idOk, 'fixtures: every trip id is a valid 22-character /idea id');
  WORKER = await loadWorker();
  check(!!(WORKER && typeof WORKER.fetch === 'function'), 'PIA-136 worker.js loads in-process (the phones that create and edit write to the real /idea handlers)');
  check(await buildS1(), 'PIA-141 Thanksgiving S1 built as the app meets it: the legacy doc migrated through the real Worker (📌 11/26 from v1\'s card), then 🔓; and the same with no 📌');

  const worst = { screen: { n: -1 }, popup: { n: -1 } };
  const stray = [], consoleErrs = [];
  let screensCounted = 0, popupsCounted = 0, pressed = 0, glyphsPressed = 0;
  // long-press coverage is kept per phone and width (phones walk in parallel, so nothing shared decides what is pressed)
  const pressLog = {};
  const seenOn = (who) => (pressLog[who] = pressLog[who] || { labels: new Set(), glyphs: new Set(), faces: 0 });
  const a11yLog = [];   // PIA-135: keyboard focus and group-chip names in P-sharelist, per phone and width

  async function phone(name, o) {
    o = o || {};
    const ctx = await browser.newContext({ viewport: { width: o.width || 360, height: 800 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles', colorScheme: o.dark ? 'dark' : 'light' });
    const net = { mode: o.mode || 'ok', gets: 0, posts: 0, delay: o.delay || {}, kv: o.worker ? workerKV() : null, paid: [] };   // delay: {id: ms} holds that trip's answers
    if (net.kv && o.paid) Object.assign(net.kv.env, { PROXY_TOKEN: TOKEN, SERPAPI_KEY: 'serp-key' });   // PIA-140: the Worker's paid routes, for real
    await ctx.route(/^https?:\/\//, (r) => { const u = r.request().url(); if (u === APP_URL || u.startsWith(APP_URL + '?')) return r.continue(); if (/^https:\/\/(cdnjs.cloudflare.com\/ajax\/libs\/(d3\/7\.9\.0\/d3\.min\.js|topojson\/3\.0\.2\/topojson\.min\.js)|cdn.jsdelivr.net\/npm\/world-atlas@2\.0\.2\/countries-110m\.json)$/.test(u)) return r.abort(); stray.push(u); return r.abort(); });
    await ctx.route(W + '/**', async (route) => {
      const q = route.request(), u = new URL(q.url()), id = u.searchParams.get('id');
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, X-Idea-Key, X-Pialax-Token', 'access-control-expose-headers': 'X-Proxy-Cache, X-Fetched-At, X-SerpAPI-Status', 'content-type': 'application/json' };
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (u.pathname === '/search' || u.pathname === '/account') net.paid.push({ path: u.pathname, url: q.url(), token: q.headers()['x-pialax-token'] || '' });   // PIA-140
      if (u.pathname === '/account' && net.holdAcct) await net.holdAcct;   // PIA-140: an /account read held out (a 🔍 tap waits for it: ◷)
      if (net.kv) {   // PIA-136: the real Worker answers (a POST that net.failPost names fails once, as a dropped connection)
        if (q.method() === 'GET') net.gets++; else net.posts++;
        if (q.method() !== 'GET' && net.failPost) { net.failPost = false; return route.abort('internetdisconnected'); }
        if (q.method() !== 'GET' && net.holdPost) await net.holdPost;   // PIA-138: a write held out (its control's ◷ state)
        const h = Object.assign({}, q.headers(), { origin: 'https://shwinster101.github.io' });
        const res = await WORKER.fetch(new Request(q.url(), { method: q.method(), headers: h, body: q.method() === 'GET' ? undefined : q.postData() }), net.kv.env);
        const fh = {}; ['x-proxy-cache', 'x-fetched-at'].forEach((k) => { const v = res.headers.get(k); if (v) fh[k] = v; });
        return route.fulfill({ status: res.status, headers: Object.assign(fh, cors), body: await res.text() });
      }
      if (q.method() !== 'GET') { net.posts++; return route.fulfill({ status: 400, headers: cors, body: '{"error":"no writes in test-words","code":"bad_body"}' }); }
      net.gets++;
      if (net.delay[id]) await new Promise((r) => setTimeout(r, net.delay[id]));
      if (net.mode === 'abort') return route.abort('internetdisconnected');
      if (net.mode === 'fail') return route.fulfill({ status: 500, headers: cors, body: JSON.stringify({ error: 'Internal <b>boom</b> stack trace', code: 'upstream' }) });
      const doc = DOC[id];
      if (!doc) return route.fulfill({ status: 404, headers: cors, body: JSON.stringify({ error: 'Trip idea not found — server words here', code: 'not_found' }) });
      const organizer = !!KEYS[id] && q.headers()['x-idea-key'] === KEYS[id];
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: true, doc, organizer, preview: true }) });
    });
    const page = await ctx.newPage();
    // Chrome logs every 4xx/5xx it is handed (the failing-Worker scenarios answer 404 and 500 on purpose); app errors are what count
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) consoleErrs.push(name + ': ' + m.text()); });
    page.on('pageerror', (e) => consoleErrs.push(name + ': PAGEERROR ' + e.message));
    if (o.installClock) await page.clock.install({ time: new Date(NOW_ISO) });
    else await page.clock.setFixedTime(new Date(NOW_ISO));
    await page.addInitScript(([seed, clipOk, share]) => {
      if (!sessionStorage.getItem('__seeded')) {
        sessionStorage.setItem('__seeded', '1');
        Object.keys(seed).forEach((k) => localStorage.setItem(k, typeof seed[k] === 'string' ? seed[k] : JSON.stringify(seed[k])));
      }
      // the clipboard refuses, so copying a link falls back to P-link (the sheet with the link and its warning)
      try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => (clipOk ? Promise.resolve() : Promise.reject(new Error('denied'))) } }); } catch (e) { /* keep the real one */ }
      // PIA-135: a phone share sheet that records what it was handed
      if (share) try { Object.defineProperty(navigator, 'share', { configurable: true, value: (d) => { window.__shared = (window.__shared || []).concat([d]); return Promise.resolve(); } }); } catch (e) { /* none */ }
    }, [o.ls || PHONES[name].ls, !!o.clipOk, !!o.share]);
    await page.goto(APP_URL + (o.url || ''), { waitUntil: 'load' });
    await settle(page);
    return { ctx, page, net };
  }
  async function settle(page, ms) { await page.waitForTimeout(ms || 250); }
  // a card opens from anywhere on its title or picture (the title button's overlay covers the card)
  async function openCard(page, id) { await page.click('#screen [data-trip="' + id + '"]', { position: { x: 140, y: 28 } }); }
  async function screenId(page) { return page.getAttribute('#screen', 'data-screen'); }
  async function measureScreen(page, label) {
    const w = await page.evaluate(COUNT, ['#screen', '#tabbar']);
    screensCounted++;
    if (w.length > worst.screen.n) worst.screen = { n: w.length, label, words: w.join(' ') };
    if (w.length > SCREEN_MAX) bad('screen over ' + SCREEN_MAX + ' words: ' + label + ' (' + w.length + ')', w.join(' '));
    return w;
  }
  async function measurePopup(page, label, only) {
    const sel = await page.evaluate((q0) => {
      const on = (q) => { const e = document.querySelector(q); return e && !e.hidden; };
      if (q0) return on(q0) ? q0 : null;   // a named popup (a long-press label over an open sheet is its own popup)
      return on('#sheet') ? '#sheet' : on('#lbl') ? '#lbl' : on('#toast') ? '#toast' : null;
    }, only || null);
    if (!sel) { bad('no popup visible to count: ' + label); return []; }
    const w = await page.evaluate(COUNT, [sel]);   // a popup's count is its own text; the screen behind it is not added
    popupsCounted++;
    if (w.length > worst.popup.n) worst.popup = { n: w.length, label, words: w.join(' ') };
    if (w.length > POPUP_MAX) bad('popup over ' + POPUP_MAX + ' words: ' + label + ' (' + w.length + ')', w.join(' '));
    return w;
  }
  async function popupId(page) { return page.evaluate(() => { const s = document.querySelector('#sheet'); return s && !s.hidden ? s.getAttribute('data-popup') : null; }); }
  async function closeSheet(page) { if (await popupId(page)) { await page.click('#sheet [data-act="sh-close"]'); await settle(page, 150); } }

  // ⓘ on this screen: every page counted, every glyph on screen explained, ⚙ at the foot. "Every glyph" is read
  // from the rendered TEXT, not from the app's own data-k tags: any pictograph or symbol drawn on the screen outside
  // a trip name, a postcard, a face, an inline picture or the trip's own emoji must sit inside a [data-k] that ⓘ lists.
  async function keyCheck(page, label) {
    const scan = await page.evaluate(([skip, glyphSrc]) => {
      const GLYPH = new RegExp(glyphSrc, 'u');
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
      const keys = [...new Set([...document.querySelectorAll('#screen [data-k], #tabbar [data-k]')].filter(vis).map((e) => e.getAttribute('data-k')))].filter((k) => skip.indexOf(k) < 0);
      const untagged = [], w = document.createTreeWalker(document.querySelector('#screen'), NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const p = n.parentElement; if (!p || !vis(p) || p.closest('[data-free], .pc, .av, svg, [data-pic]')) continue;
        const g = [...n.nodeValue].filter((c) => GLYPH.test(c)).join('');
        if (g && !p.closest('[data-k]')) untagged.push(g + ' in <' + p.tagName.toLowerCase() + ' class="' + p.className + '">');
      }
      return { keys, untagged };
    }, [SKIP_KEY, GLYPH_SRC]);
    const onScreen = scan.keys;
    if (scan.untagged.length) bad('glyphs on ' + label + ' that ⓘ cannot explain (no key)', scan.untagged);
    await page.click('#screen [data-act="key"]');
    await settle(page, 120);
    const explained = new Set();
    for (let i = 0; i < 12; i++) {
      await measurePopup(page, label + ' › P-key page ' + (i + 1));
      (await page.evaluate(() => [...document.querySelectorAll('#sheet .li')].map((x) => x.getAttribute('data-keys') || ''))).join(' ').split(' ').filter(Boolean).forEach((k) => explained.add(k));
      const next = await page.$('#sheet [data-act="kpage"][data-v="1"]:not([disabled])');
      if (!next) break;
      await next.click(); await settle(page, 80);
    }
    const missing = onScreen.filter((k) => !explained.has(k));
    if (missing.length) bad('ⓘ leaves glyphs on ' + label + ' unexplained', missing);
    const gear = await page.$('#sheet [data-act="settings"]');
    if (!gear) bad('⚙ is not at the foot of ⓘ on ' + label);
    await closeSheet(page);
    return { onScreen, missing };
  }
  // PIA-140: ⓘ in a sheet (P-total, P-person): every page counted, every glyph drawn in the sheet sits inside a [data-k] its ⓘ
  // lists, and ‹ comes back to the sheet. Returns the keys it explained.
  async function sheetKey(page, label) {
    const from = await popupId(page);
    const scan = await page.evaluate(([skip, glyphSrc]) => {
      const GLYPH = new RegExp(glyphSrc, 'u');
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
      const keys = [...new Set([...document.querySelectorAll('#sheet [data-k]')].filter(vis).map((e) => e.getAttribute('data-k')))].filter((k) => skip.indexOf(k) < 0);
      const untagged = [], w = document.createTreeWalker(document.querySelector('#sheet'), NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const p = n.parentElement; if (!p || !vis(p) || p.closest('[data-free], .pc, .av, svg, [data-pic], input')) continue;
        const g = [...n.nodeValue].filter((c) => GLYPH.test(c)).join('');
        if (g && !p.closest('[data-k]')) untagged.push(g + ' in <' + p.tagName.toLowerCase() + ' class="' + p.className + '">');
      }
      return { keys, untagged };
    }, [SKIP_KEY, GLYPH_SRC]);
    if (scan.untagged.length) bad('glyphs in ' + label + ' that its ⓘ cannot explain (no key)', scan.untagged);
    const btn = await page.$('#sheet [data-act="skey"]');
    if (!btn) { bad('no ⓘ in ' + label); return new Set(); }
    await btn.click(); await settle(page, 120);
    const explained = new Set();
    for (let i = 0; i < 12; i++) {
      await measurePopup(page, label + ' › its ⓘ page ' + (i + 1));
      (await page.evaluate(() => [...document.querySelectorAll('#sheet .li')].map((x) => x.getAttribute('data-keys') || ''))).join(' ').split(' ').filter(Boolean).forEach((k) => explained.add(k));
      const next = await page.$('#sheet [data-act="kpage"][data-v="1"]:not([disabled])');
      if (!next) break;
      await next.click(); await settle(page, 80);
    }
    const missing = scan.keys.filter((k) => !explained.has(k));
    if (missing.length) bad('the ⓘ of ' + label + ' leaves glyphs unexplained', missing);
    await page.click('#sheet [data-act="sh-back"]'); await settle(page, 120);
    const back = await popupId(page);
    if (back !== from) bad('‹ from the ⓘ of ' + label + ' went to ' + back + ', not ' + from);
    return explained;
  }
  // every icon-only control has a 1–3 word label; a long-press shows it (≤20 words) and never triggers the control.
  // where = 'screen' (the screen and tab bar) or 'sheet' (the open sheet: its glyphs are named too, PIA-135)
  async function labelCheck(page, label, who, where) {
    const inSheet = where === 'sheet';
    const els = await page.evaluate((sh) => {
      const out = [], vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
      // (PIA-140: in a sheet, a fare's own parts too: its age ring, level gauge, stops line and winning airport each name themselves)
      [...document.querySelectorAll(sh ? '#sheet button, #sheet a, #sheet [role="img"], #sheet svg[data-lbl], #sheet .lvl[data-lbl], #sheet .lc[data-lbl]' : '#screen button, #screen a, #screen [role="img"], #tabbar button')].filter(vis).forEach((el, i) => {
        const txt = (el.innerText || '').trim(), lbl = el.getAttribute('data-lbl') || el.getAttribute('aria-label') || '';
        const iconOnly = !/\p{L}/u.test(txt) && !el.closest('[data-free]');
        el.setAttribute('data-tw', String(i));
        // (PIA-142: a Family column's head says its trip's title too, free under the word rule, before its own label)
        out.push({ i, tag: el.tagName, txt, lbl, ttl: el.getAttribute('data-ttl') || '', iconOnly, face: !!el.querySelector('.av'), pe: getComputedStyle(el).pointerEvents });
      });
      return out;
    }, inSheet);
    const unlabeled = els.filter((e) => e.iconOnly && !e.lbl), long = els.filter((e) => e.iconOnly && e.lbl.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length > 3);
    if (unlabeled.length) bad('icon-only controls without a label on ' + label, unlabeled);
    if (long.length) bad('icon labels longer than 3 words on ' + label, long);
    const seen = seenOn(inSheet ? who + ' sheet' : who);
    // what a press could change: the screen, the sheet, the address, and (in a sheet) which toggles are on
    const state = async () => [await screenId(page), await popupId(page), page.url(),
      await page.evaluate(() => [...document.querySelectorAll('#sheet [aria-pressed]')].map((e) => e.getAttribute('aria-pressed')).join())];
    // a long press at (x, y): the bubble's text, and whether anything changed
    const press = async (x, y) => {
      const before = await state();
      await page.mouse.move(x, y); await page.mouse.down();
      await page.waitForTimeout(650);
      const shown = await page.evaluate(() => { const b = document.querySelector('#lbl'); return b && !b.hidden ? b.textContent : null; });
      if (shown) await measurePopup(page, label + ' › P-label "' + shown + '"', '#lbl');
      await page.mouse.up(); await settle(page, 120);
      const after = await state();
      pressed++;
      return { shown, moved: JSON.stringify(after) !== JSON.stringify(before), before, after };
    };
    const centre = async (sel) => {
      const h = await page.$(sel); if (!h) return null;
      await h.scrollIntoViewIfNeeded().catch(() => {});
      const box = await h.boundingBox(); return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
    };
    // 1. every labelled control (each label once per phone; three faces at most): its own label, never a press
    for (const e of els) {
      const lk = e.ttl ? '#titled' : e.lbl;   // (one titled head a phone: each names its own trip the same way)
      if (!e.lbl || seen.labels.has(lk) || e.pe === 'none' || (e.face && seen.faces >= 3)) continue;
      const c = await centre('[data-tw="' + e.i + '"]'); if (!c) continue;
      // the finger is on this control itself, not on a part of it that names itself (a fare's age ring inside its leg)
      const hit = await page.evaluate(([x, y, i, ctl]) => { const t = document.elementFromPoint(x, y), n = t && t.closest(ctl); return !!(t && t.closest('[data-tw="' + i + '"]') && n && n.getAttribute('data-tw') === String(i)); }, [c.x, c.y, e.i, CTL]);
      if (!hit) continue;
      seen.labels.add(lk); if (e.face) seen.faces++;
      const r = await press(c.x, c.y);
      if (r.shown !== (e.ttl ? e.ttl + ' ' : '') + e.lbl) bad('long-press on "' + e.lbl + '" (' + label + ') showed ' + JSON.stringify(r.shown));
      if (r.moved) bad('long-press on "' + e.lbl + '" triggered the control', { before: r.before, after: r.after });
    }
    // 2. every glyph that is not a control (a card's faces, heads, pill, locator, stage disc, ⭐; 🗓, 🌙, 👋 in a trip
    //    view; in a sheet ◷, ⟦ ⟧, a mini's locator or stage disc, the header glyphs): a long press on it names it with
    //    its key's label, even under a card's tap overlay or inside a toggle, and changes nothing
    const glyphs = await page.evaluate(([ctl, sh]) => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
      return [...document.querySelectorAll(sh ? '#sheet [data-k]' : '#screen [data-k]')].filter(vis).map((el, i) => {
        const inCtl = el.closest(ctl);
        el.setAttribute('data-tg', String(i));
        return { i, k: el.getAttribute('data-k'), ctl: !!(inCtl && !inCtl.classList.contains('card-open')) };
      }).filter((g) => !g.ctl);
    }, [CTL, inSheet]);
    for (const g of glyphs) {
      if (seen.glyphs.has(g.k) || !LEGEND_LABEL[g.k]) continue;
      const c = await centre('[data-tg="' + g.i + '"]'); if (!c) continue;
      const hit = await page.evaluate(([x, y, i]) => {
        const t = document.elementFromPoint(x, y), el = document.querySelector('[data-tg="' + i + '"]');
        return !!(t && el && (el.contains(t) || t.closest('.card-open, .mini')));   // the glyph itself, or the card overlay or sheet toggle above it
      }, [c.x, c.y, g.i]);
      if (!hit) continue;
      seen.glyphs.add(g.k); glyphsPressed++;
      const r = await press(c.x, c.y);
      if (r.shown !== LEGEND_LABEL[g.k]) bad('long-press on the ' + g.k + ' glyph (' + label + ') showed ' + JSON.stringify(r.shown) + ', not "' + LEGEND_LABEL[g.k] + '"');
      if (r.moved) bad('long-press on the ' + g.k + ' glyph triggered the card under it', { before: r.before, after: r.after });
    }
    return els;
  }
  // ⚙ is reachable from this screen: in its top row, or at the foot of ⓘ
  async function gearReachable(page) {
    if (await page.$('#screen [data-act="settings"]')) return true;
    await page.click('#screen [data-act="key"]'); await settle(page, 100);
    const g = !!(await page.$('#sheet [data-act="settings"]'));
    await closeSheet(page);
    return g;
  }
  // PIA-136: the one create path in every state a phone can reach, counted: empty, the longest name that can be typed with an
  // unknown code, the people (this phone's preset; with a row open holding the longest name), dates and a window, and ⌄
  const createLog = [];
  async function createWalk(page, tag, who, deep) {
    const plus = await page.$('#screen [data-act="new"]'); if (!plus) return;
    await plus.click(); await settle(page, 120);
    const first = { pop: await popupId(page), title: await page.$eval('#new-title', (e) => e.value).catch(() => null), focus: await page.evaluate(() => (document.activeElement || {}).id || '') };
    await measurePopup(page, tag('P-new-what (empty)'));
    await page.type('#new-title', 'Our very long family reunion trip name that keeps going on and on and on', { delay: 0 });
    await page.type('#new-dest', 'zzq', { delay: 0 });
    const typed = await page.evaluate(() => ({ title: document.querySelector('#new-title').value, dest: document.querySelector('#new-dest').value, warn: !document.querySelector('#dest-warn').hidden }));
    await measurePopup(page, tag('P-new-what (12 typed words, unknown code)'));
    if (deep) await labelCheck(page, tag('P-new-what'), who + '-new', 'sheet');
    await page.click('#sheet [data-act="nnext"]'); await settle(page, 100);
    const who2 = await popupId(page);
    await measurePopup(page, tag('P-new-who (preset)'));
    const chip = await page.$('#sheet [data-act="nedit"]');
    if (chip) await chip.click(); else await page.click('#sheet [data-act="nadd"]');
    await settle(page, 80);
    await page.fill('#mem-name', ''); await page.type('#mem-name', 'Bartholomew Montgomery Fitzgerald Junior', { delay: 0 });
    await page.fill('#mem-ap', ''); await page.type('#mem-ap', 'qqq', { delay: 0 });
    const row = await page.evaluate(() => ({ name: document.querySelector('#mem-name').value, ap: document.querySelector('#mem-ap').value }));
    await measurePopup(page, tag('P-new-who (a row open with the longest name)'));
    if (deep) await labelCheck(page, tag('P-new-who'), who + '-new', 'sheet');
    if (!(await page.$('#sheet .metog[aria-pressed="true"]'))) await page.click('#sheet .metog');
    await page.click('#sheet [data-act="nnext"]'); await settle(page, 100);
    const when = await popupId(page);
    await measurePopup(page, tag('P-new-when (empty)'));
    await page.click('#sheet [data-act="nday"]:not([disabled]) >> nth=10'); await page.click('#sheet [data-act="nday"]:not([disabled]) >> nth=13');
    await page.click('#sheet [data-act="npin"]'); await page.click('#sheet [data-act="nday"]:not([disabled]) >> nth=12'); await settle(page, 60);
    await measurePopup(page, tag('P-new-when (dates and 📌)'));
    if (deep) await labelCheck(page, tag('P-new-when'), who + '-new', 'sheet');
    await page.click('#sheet [data-act="nmode"][data-v="window"]'); await page.click('#sheet [data-act="nday"]:not([disabled]) >> nth=3'); await page.click('#sheet [data-act="nday"]:not([disabled]) >> nth=20');
    await page.click('#sheet [data-act="nnights"][data-v="1"]'); await settle(page, 60);
    await measurePopup(page, tag('P-new-when (a window and nights)'));
    createLog.push({ who: tag(''), first, typed, who2, row, when });
    await closeSheet(page);
  }
  // PIA-136: the organizer's P-edit and each of its parts on a trip this phone holds the key to (the trip view is open)
  const editLog = [];
  async function editWalk(page, tag, who, deep) {
    const pen = await page.$('#screen [data-act="edit"]'); if (!pen) return false;
    await pen.click(); await settle(page, 100);
    await measurePopup(page, tag('P-edit'));
    if (deep) await labelCheck(page, tag('P-edit'), who + '-edit', 'sheet');
    const tiles = await page.evaluate(() => [...document.querySelectorAll('#sheet .tiles6 [data-act]')].map((e) => e.getAttribute('data-act')));
    await page.click('#sheet [data-act="etitle"]'); await settle(page, 100);
    await measurePopup(page, tag('P-edit-what'));
    await page.click('#sheet [data-act="sh-back"]'); await settle(page, 80);
    let people = null;
    if (tiles.indexOf('epeople') >= 0) {
      await page.click('#sheet [data-act="epeople"]'); await settle(page, 100);
      await measurePopup(page, tag('P-edit-who'));
      await page.click('#sheet [data-act="nedit"] >> nth=0'); await settle(page, 60);
      await page.fill('#mem-name', ''); await page.type('#mem-name', 'Bartholomew Montgomery Fitzgerald Junior', { delay: 0 });
      await measurePopup(page, tag('P-edit-who (a row open with the longest name)'));
      await page.click('#sheet [data-act="ndel"]'); await settle(page, 60);
      people = { pop: await popupId(page), armed: !!(await page.$('#sheet .ib.del.arm')), rows: (await page.$$('#sheet .mrow')).length };
      await measurePopup(page, tag('P-edit-who (remove armed)'));
      await page.click('#sheet [data-act="sh-back"]'); await settle(page, 80);
    }
    await page.click('#sheet [data-act="ecap"]'); await settle(page, 100);
    await measurePopup(page, tag('P-note (caption)'));
    await page.click('#sheet [data-act="sh-back"]'); await settle(page, 80);
    await page.click('#sheet [data-act="ekey"]'); await settle(page, 150);
    const linkPop = await popupId(page), linkTxt = await page.$eval('#sheet #link-url', (e) => e.value).catch(() => '');
    await measurePopup(page, tag('P-link (organizer link from P-edit)'));
    if (linkPop === 'P-link') { await page.click('#sheet [data-act="sh-back"]'); await settle(page, 80); }
    const warned = !!(await page.$('#sheet .warnline'));
    await measurePopup(page, tag('P-edit (after 🔑, warning)'));
    const dropAct = tiles.indexOf('edrop') >= 0 ? 'edrop' : null;
    let drop = null;
    if (dropAct) {
      await page.click('#sheet [data-act="edrop"]'); await settle(page, 100);
      drop = await page.evaluate(() => [...document.querySelectorAll('#sheet .split .btn')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
      await measurePopup(page, tag('P-drop'));
      if (deep) await labelCheck(page, tag('P-drop'), who + '-edit', 'sheet');
      await page.click('#sheet [data-act="dropkeep"]'); await settle(page, 80);
    }
    editLog.push({ who: tag(''), tiles, people, linkPop, linkTxt, warned, drop, back: await popupId(page) });
    await closeSheet(page);
    return true;
  }
  // PIA-137: the trip view's sheets on every trip a phone can open: P-person for every face (each one's note too), P-stage, and
  // P-face (⇄, or 👋 ? on a trip where this phone is nobody) with its join row holding the longest name that can be typed.
  // Long-press inside each kind of sheet once per phone. Controls are tapped as the app sees a tap (the sticky primary may
  // sit over a row of the board).
  const faceLog = [], sheetLog = [];
  const timesLog = [], paidLog = [], calLog = [];   // PIA-139
  const totalLog = [];   // PIA-140
  const jsClick = (page, sel) => page.$eval(sel, (e) => e.click());
  async function tripWalk(page, tag, who, deep) {
    const codes = await page.evaluate(() => [...document.querySelectorAll('#screen .pb [data-act="person"]')].map((e) => e.getAttribute('data-code')));
    for (const c of deep ? codes : codes.slice(0, 2)) {
      await jsClick(page, '#screen .pb [data-act="person"][data-code="' + c + '"]'); await settle(page, 80);
      await measurePopup(page, tag('P-person ' + c));
      if (deep && !seenOn(who + ' person').done) { seenOn(who + ' person').done = true; await labelCheck(page, tag('P-person ' + c), who + '-person', 'sheet'); }
      // PIA-139: a booked traveler's 🛬 / 🛫 time fields, typed in (by them, or by the organizer for them); nothing is saved here
      if (deep && (await page.$('#sheet #tm-arr'))) {
        await page.fill('#sheet #tm-arr', ''); await page.type('#sheet #tm-arr', '1510', { delay: 0 });
        await page.fill('#sheet #tm-dep', ''); await page.type('#sheet #tm-dep', '23:59', { delay: 0 });
        await measurePopup(page, tag('P-person ' + c + ' (times typed)'));
        // PIA-139 fix pass: an hour that could be either half of the day, left: [☀ | 🌃]; a time that is not one, left: ⚠
        await page.fill('#sheet #tm-arr', ''); await page.type('#sheet #tm-arr', '310', { delay: 0 });
        await page.fill('#sheet #tm-dep', ''); await page.type('#sheet #tm-dep', '25:99', { delay: 0 });
        await jsClick(page, '#sheet #tm-arr'); await page.$eval('#sheet #tm-arr', (e) => e.focus()); await settle(page, 40);
        const hv = await page.$$eval('#sheet #tm-half [data-act="tmhalf"]', (els) => els.length);
        await measurePopup(page, tag('P-person ' + c + ' (☀ / 🌃 asked, a time marked ⚠)'));
        timesLog.push(tag(c) + (hv === 2 ? ' halves' : ''));
        // put the fields back as they were, so closing the sheet sends nothing (this walk writes nowhere)
        await page.evaluate(() => { ['tm-arr', 'tm-dep'].forEach((id) => { const f = document.getElementById(id); if (f) { f.value = f.defaultValue; f.dispatchEvent(new Event('input', { bubbles: true })); } }); });
      }
      if (await page.$('#sheet [data-act="pnote"]')) {
        await jsClick(page, '#sheet [data-act="pnote"]'); await settle(page, 80);
        await measurePopup(page, tag('P-note ' + c));
        await jsClick(page, '#sheet [data-act="sh-back"]'); await settle(page, 60);
      }
      await closeSheet(page);
    }
    if (await page.$('#screen [data-act="stage"]')) {
      await jsClick(page, '#screen [data-act="stage"]'); await settle(page, 80);
      await measurePopup(page, tag('P-stage'));
      if (deep && !seenOn(who + ' stage').done) { seenOn(who + ' stage').done = true; await labelCheck(page, tag('P-stage'), who + '-stage', 'sheet'); }
      // PIA-139: 💵 on the organizer's token phone at 🏁 Done: a long amount typed, Save asking first (hosts not answered yet)
      if (await page.$('#sheet #paid-amt')) {
        await page.type('#sheet #paid-amt', '$123,456.78', { delay: 0 });
        await measurePopup(page, tag('P-stage (💵 typed)'));
        // the long presses come before Save: its confirm lapses after 6s, and the sheet would move under a press as it goes
        if (deep && !seenOn(who + ' paid').done) { seenOn(who + ' paid').done = true; await labelCheck(page, tag('P-stage 💵'), who + '-paid', 'sheet'); }
        await jsClick(page, '#sheet [data-act="paidsave"]'); await settle(page, 80);
        const arm = await page.$eval('#sheet [data-act="paidsave"]', (e) => e.textContent).catch(() => '');
        await measurePopup(page, tag('P-stage (💵 Save asks first)'));
        paidLog.push({ who: tag(''), arm });
      } else if (await page.$('#sheet [data-act="paidwhy"]')) {
        await jsClick(page, '#sheet [data-act="paidwhy"]'); await settle(page, 60);
        paidLog.push({ who: tag(''), why: await page.evaluate(() => { const b = document.querySelector('#lbl'); return b && !b.hidden ? b.textContent : ''; }) });
        await measurePopup(page, tag('P-stage (💵 greyed, why)'), '#lbl');
      }
      await closeSheet(page);
    }
    // PIA-140: P-total from the trip's total block: every traveler's legs, the budget, the one spend control (never tapped here)
    if (await page.$('#screen [data-act="total"]')) {
      await jsClick(page, '#screen .totalblk[data-act="total"]'); await settle(page, 80);
      totalLog.push({ who: tag(''), pid: await popupId(page), codes: await page.$$eval('#sheet .lgp .lc', (els) => els.length) });
      await measurePopup(page, tag('P-total'));
      if (deep && !seenOn(who + ' total').done) { seenOn(who + ' total').done = true; await labelCheck(page, tag('P-total'), who + '-total', 'sheet'); }
      const face = await page.$('#sheet .trow [data-act="person"]');
      if (face) { await jsClick(page, '#sheet .trow [data-act="person"]'); await settle(page, 80); await measurePopup(page, tag('P-total › P-person')); await jsClick(page, '#sheet [data-act="sh-back"]'); await settle(page, 60); }
      await closeSheet(page);
    }
    // PIA-139: calendar-plus in the nav at any dated stage: P-calendar-add (my days, else the plan; tentative until set)
    if (await page.$('#screen .nav [data-act="caladd"]')) {
      await jsClick(page, '#screen .nav [data-act="caladd"]'); await settle(page, 80);
      const pid = await popupId(page), c = await page.evaluate(() => ({ ics: (document.querySelector('#sheet a[download]') || {}).href || '', g: (document.querySelector('#sheet a[data-k="gcal"]') || {}).href || '', tq: !!document.querySelector('#sheet .tq') }));
      await measurePopup(page, tag('P-calendar-add'));
      calLog.push({ who: tag(''), pid, ics: decodeURIComponent(c.ics), g: c.g, tq: c.tq });
      if (deep && !seenOn(who + ' cal').done) { seenOn(who + ' cal').done = true; await labelCheck(page, tag('P-calendar-add'), who + '-cal', 'sheet'); }
      await closeSheet(page);
    }
    if (await page.$('#screen [data-act="face"]')) {
      await jsClick(page, '#screen [data-act="face"]'); await settle(page, 80);
      await measurePopup(page, tag('P-face'));
      if (deep && !seenOn(who + ' face').done) { seenOn(who + ' face').done = true; await labelCheck(page, tag('P-face'), who + '-face', 'sheet'); }
      if (await page.$('#sheet [data-act="joinopen"]')) {
        await jsClick(page, '#sheet [data-act="joinopen"]'); await settle(page, 60);
        await page.type('#join-name', 'Bartholomew Montgomery Fitzgerald Junior', { delay: 0 }); await page.type('#join-ap', 'zzq', { delay: 0 });
        const w = await measurePopup(page, tag('P-face (join row, the longest name)'));
        sheetLog.push({ who: tag(''), join: await page.$eval('#join-name', (e) => e.value), words: w.length });
      }
      await closeSheet(page);
    }
    await datesWalk(page, tag, who, deep);
  }
  // PIA-141: P-dates' 📉 on every organizer token phone: greyed, its tap names why (Dates locked, Nobody follows plan) in a counted
  // label; else P-cheapest, counted as it opens, with a hollow week selected (its 🔍 cost) and on its next page; at 360 its long
  // presses and its ⓘ (every glyph keyed). Bars measured: ≤7 a page, each ≥44px, no sideways scroll; ‹ back to P-dates
  const cheapLog = [];
  async function cheapWalk(page, tag, who, deep) {
    const b = await page.$('#sheet [data-act="dcheap"]'); if (!b) return;
    if ((await b.getAttribute('aria-disabled')) === 'true') {
      await jsClick(page, '#sheet [data-act="dcheap"]'); await settle(page, 60);
      const why = await page.evaluate(() => { const l = document.querySelector('#lbl'); return l && !l.hidden ? l.textContent : ''; });
      if (why) await measurePopup(page, tag('P-dates 📉 greyed: ' + why), '#lbl');
      cheapLog.push({ who: tag(''), why, pid: await popupId(page) });
      return;
    }
    await jsClick(page, '#sheet [data-act="dcheap"]'); await settle(page, 150);
    const lay = () => page.evaluate(() => {
      const sh = document.querySelector('#sheet'), strip = sh.querySelector('.cstrip'), sb = strip ? strip.getBoundingClientRect().bottom : 0;
      return { bars: [...sh.querySelectorAll('.cbar')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width * 10) / 10, Math.round(r.height)]; }), over: sh.scrollWidth - sh.clientWidth, pageOver: document.documentElement.scrollWidth - innerWidth,
        pagerBelow: [...sh.querySelectorAll('[data-act="cpage"], [data-act="cwiden"]')].every((e) => e.getBoundingClientRect().top >= sb) };
    });
    const pid = await popupId(page), l0 = await lay();
    await measurePopup(page, tag('P-cheapest'));
    const rec = { who: tag(''), pid, l0 };
    if (deep && !seenOn(who + ' cheap').done) { seenOn(who + ' cheap').done = true; await labelCheck(page, tag('P-cheapest'), who + '-cheap', 'sheet'); rec.keys = [...await sheetKey(page, tag('P-cheapest'))]; }
    const hol = await page.$eval('#sheet .cbar:not(.cur) .col.hollow', (e) => e.closest('.cbar').getAttribute('data-v')).catch(() => null);
    if (hol) { await jsClick(page, '#sheet .cbar[data-v="' + hol + '"]'); await settle(page, 60); rec.cost = await page.$eval('#sheet [data-act="search"]', (e) => e.textContent.trim()).catch(() => ''); await measurePopup(page, tag('P-cheapest (a hollow week selected)')); }
    if (await page.$('#sheet [data-act="cpage"][data-v="1"]:not([aria-disabled])')) { await jsClick(page, '#sheet [data-act="cpage"][data-v="1"]'); await settle(page, 60); rec.l1 = await lay(); await measurePopup(page, tag('P-cheapest (next page)')); }
    await jsClick(page, '#sheet [data-act="sh-back"]'); await settle(page, 80);
    rec.back = await popupId(page);
    cheapLog.push(rec);
  }
  // PIA-138: P-dates from the plan pill on every trip view (the plan, my own days, or the plan to read), and P-day from 👥 then a
  // day (or any day of a plan to read), the busiest day first; deep: the picker's other states (a holiday, a start picked, my
  // own days on one end, following the plan, an undated idea's window) and one person's leg from P-person, with long-press once
  const dateLog = [], dayLog = [], keyLog = [];
  async function datesWalk(page, tag, who, deep) {
    if (!(await page.$('#screen .daterow [data-act="dates"]'))) return;
    await jsClick(page, '#screen .daterow [data-act="dates"]'); await settle(page, 100);
    const pid = await popupId(page);
    if (pid !== 'P-dates') { dateLog.push({ who: tag(''), pid, nudge: await page.evaluate(() => !!document.querySelector('#screen .answers.nudge')) }); if (pid) await closeSheet(page); return; }
    dateLog.push({ who: tag(''), pid });
    await measurePopup(page, tag('P-dates'));
    if (deep && !seenOn(who + ' dates').done) { seenOn(who + ' dates').done = true; await labelCheck(page, tag('P-dates'), who + '-dates', 'sheet'); }
    await cheapWalk(page, tag, who, deep);   // PIA-141: 📉 → P-cheapest (or, greyed, why)
    // PIA-138 fix pass: ⓘ in P-dates reads the key over this sheet (its grid's marks), ‹ back
    if (deep && (await page.$('#sheet [data-act="dkey"]'))) {
      await jsClick(page, '#sheet [data-act="dkey"]'); await settle(page, 60);
      if ((await popupId(page)) === 'P-key') { await measurePopup(page, tag('P-key over P-dates')); keyLog.push(tag('')); }
      await jsClick(page, '#sheet [data-act="sh-back"]'); await settle(page, 60);
    }
    const busiest = () => page.evaluate(() => {
      let best = null, n = -1;
      document.querySelectorAll('#sheet .grid [data-act="dday"]:not([aria-disabled="true"])').forEach((b) => { const c = b.querySelector('.pc-n'), k = c ? +c.textContent : 0; if (k > n) { n = k; best = b.getAttribute('data-v'); } });
      return best;
    });
    if (await page.$('#sheet [data-act="dlook"]')) { await jsClick(page, '#sheet [data-act="dlook"]'); await settle(page, 60); await measurePopup(page, tag('P-dates (👥 then a day)')); }
    const dv = await busiest();
    if (dv) {
      await jsClick(page, '#sheet [data-act="dday"][data-v="' + dv + '"]'); await settle(page, 80);
      if ((await popupId(page)) === 'P-day') {
        const w = await measurePopup(page, tag('P-day ' + dv));
        dayLog.push({ who: tag(''), day: dv, words: w.length, faces: (await page.$$('#sheet .dayf')).length, n: await page.$eval('#sheet .dayn', (e) => e.textContent).catch(() => '') });
        if (deep && !seenOn(who + ' day').done) { seenOn(who + ' day').done = true; await labelCheck(page, tag('P-day'), who + '-day', 'sheet'); }
        await jsClick(page, '#sheet [data-act="sh-back"]'); await settle(page, 60);
      }
    }
    if (deep) {
      const tapIf = async (sel, label) => { if (!(await page.$(sel))) return false; await jsClick(page, sel); await settle(page, 60); if ((await popupId(page)) === 'P-dates') await measurePopup(page, tag('P-dates (' + label + ')')); return true; };
      await tapIf('#sheet [data-act="dhol"]', 'a holiday picked');
      const d0 = await page.$eval('#sheet .grid [data-act="dday"]:not([aria-disabled="true"]):not(.ro)', (e) => e.getAttribute('data-v')).catch(() => null);
      if (d0) await tapIf('#sheet [data-act="dday"][data-v="' + d0 + '"]', 'a start picked');
      await tapIf('#sheet [data-act="dmode"][data-v="window"]', 'the ⟦window⟧');
      await tapIf('#sheet [data-act="dtarget"][data-v="me"]', 'my own days');
      if (await tapIf('#sheet [data-act="dend"][data-v="0"]', 'my arrival only')) {
        const d1 = await page.$eval('#sheet .grid [data-act="dday"]:not([aria-disabled="true"])', (e) => e.getAttribute('data-v')).catch(() => null);
        if (d1) await tapIf('#sheet [data-act="dday"][data-v="' + d1 + '"]', 'my arrival moved (⚠ off the plan)');
      }
      await tapIf('#sheet [data-act="dfollow"]', 'following the plan');
    }
    await closeSheet(page);
    // one person's leg (P-person's 🛬 / 🛫 day) opens P-dates for that end
    if (deep && !seenOn(who + ' leg').done) {
      const codes = await page.evaluate(() => [...document.querySelectorAll('#screen .pb [data-act="person"]')].map((e) => e.getAttribute('data-code')));
      for (const c of codes) {
        await jsClick(page, '#screen .pb [data-act="person"][data-code="' + c + '"]'); await settle(page, 80);
        // (PIA-151: a day that cannot be set here, on a trip closed or over, is a button that says why: not this walk's leg)
        if (await page.$('#sheet [data-act="dates"][data-end="1"]:not([aria-disabled="true"])')) {
          seenOn(who + ' leg').done = true;
          await measurePopup(page, tag('P-person ' + c + ' (−1 / +1 on each leg)'));
          await jsClick(page, '#sheet [data-act="dates"][data-end="1"]'); await settle(page, 80);
          await measurePopup(page, tag('P-dates (' + c + '\'s leave end)'));
          dateLog.push({ who: tag(''), pid: await popupId(page), leg: c });
          await closeSheet(page);
          break;
        }
        await closeSheet(page);
      }
    }
  }
  // PIA-142: the Family board, page by page, then with 🗄 (the past trips as columns) page by page; at 360 the sheet the first cell
  // of each page opens, and ⓘ / long-press once with 🗄 on. famLog keeps each page's layout (columns, targets, overflow)
  const famLog = [];
  const FAMCHK = () => {
    const b = document.querySelector('#fam-board');
    if (!b) return { board: false, ghost: !!document.querySelector('#screen [data-ghost="family"]'), over: document.documentElement.scrollWidth - innerWidth };
    const small = [...b.querySelectorAll('.hd, button.cell, .rowh .facebtn, .corner .ib')].filter((e) => { const r = e.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; }).map((e) => e.className);
    const br = b.getBoundingClientRect(), rows = b.querySelectorAll('.rowh').length, names = b.querySelectorAll('.rowh .fn[data-nm]').length;
    return { board: true, cols: b.querySelectorAll('.hd').length, small, rows, names, over: document.documentElement.scrollWidth - innerWidth, inside: br.left >= -0.5 && br.right <= innerWidth + 0.5 };
  };
  async function famWalk(page, tag, who, deep) {
    for (const past of [false, true]) {
      if (past) { if (!(await page.$('#screen [data-act="fampast"]'))) break; await jsClick(page, '#screen [data-act="fampast"]'); await settle(page, 100); }
      for (let n = 0; n < 6 && (await page.$('#screen [data-act="fampage"][data-v="-1"]:not([aria-disabled="true"])')); n++) { await jsClick(page, '#screen [data-act="fampage"][data-v="-1"]'); await settle(page, 60); }
      for (let i = 0; i < 6; i++) {
        const s = 'Family' + (past ? ' 🗄' : '') + ' page ' + (i + 1);
        if (i || past) await measureScreen(page, tag(s));
        famLog.push(Object.assign({ who: tag(s) }, await page.evaluate(FAMCHK)));
        if (deep && past && !i) { await keyCheck(page, tag(s)); await labelCheck(page, tag(s), who); }
        if (deep && (await page.$('#screen button.cell[data-act="fcell"]'))) {
          await jsClick(page, '#screen button.cell[data-act="fcell"]'); await settle(page, 80);
          const pid = await popupId(page);
          if (pid) await measurePopup(page, tag(s + ' › ' + pid + ' (the first cell)'));
          famLog.push({ who: tag(s + ' cell'), sheet: pid });
          await closeSheet(page);
        }
        const nx = await page.$('#screen [data-act="fampage"][data-v="1"]:not([aria-disabled="true"])'); if (!nx) break;
        await jsClick(page, '#screen [data-act="fampage"][data-v="1"]'); await settle(page, 60);
      }
    }
    if (await page.$('#screen [data-act="fampast"][aria-pressed="true"]')) { await jsClick(page, '#screen [data-act="fampast"]'); await settle(page, 80); }
  }
  // every screen of one phone: list (shelf open and shut), Family, each trip view, Map and Calendar per chip
  async function walk(name, o) {
    o = o || {};
    const { ctx, page } = await phone(name, o);
    const W0 = o.width || 360, deep = W0 === 360;
    const tag = (s) => name + ' @' + W0 + ' ' + s;
    const visit = async (s) => {
      const id = await screenId(page);
      await measureScreen(page, tag(s + ' [' + id + ']'));
      if (deep) {
        await keyCheck(page, tag(s));
        await labelCheck(page, tag(s), name + '@' + W0);
        if (!(await gearReachable(page))) bad('⚙ is not reachable from ' + tag(s));
      }
    };
    await visit('Trips');
    if (deep && (await page.$('#screen .card [data-act="total"]'))) {   // PIA-140: a card's total opens P-total
      await jsClick(page, '#screen .card [data-act="total"]'); await settle(page, 80);
      totalLog.push({ who: tag('card'), pid: await popupId(page) });
      await measurePopup(page, tag('Trips › P-total (from a card)')); await closeSheet(page);
    }
    if (await page.$('#screen [data-act="shelf"]')) { await page.click('#screen [data-act="shelf"]'); await settle(page, 120); await visit('Trips shelf open'); await page.click('#screen [data-act="shelf"]'); await settle(page, 120); }
    if (await page.$('#screen [data-act="seg"][data-v="family"]')) {
      await page.click('#screen [data-act="seg"][data-v="family"]'); await settle(page, 120); await visit('Family');
      await famWalk(page, tag, name + '@' + W0, deep);   // PIA-142: every page, 🗄, a cell's sheet
      await page.click('#screen [data-act="seg"][data-v="ideas"]'); await settle(page, 120);
    }
    if (await page.$('#screen [data-act="shelf"][aria-expanded="false"]')) { await page.click('#screen [data-act="shelf"]'); await settle(page, 100); }
    const trips = await page.evaluate(() => [...document.querySelectorAll('#screen [data-trip]')].map((e) => e.getAttribute('data-trip')));
    let edited = false;
    for (const id of trips) {
      await openCard(page, id); await settle(page, 150);
      // PIA-137: a trip this phone is nobody on opens P-face by itself (once a visit): counted, then ⌄ (browse as nobody)
      if ((await popupId(page)) === 'P-face') { await measurePopup(page, tag('trip ' + id + ' › P-face (by itself)')); faceLog.push(tag(id)); await closeSheet(page); }
      await visit('trip ' + id);
      await tripWalk(page, (s) => tag('trip ' + id + ' › ' + s), name + '@' + W0, deep);
      if (!edited) edited = await editWalk(page, (s) => tag('trip ' + id + ' › ' + s), name + '@' + W0, deep);   // PIA-136: P-edit on the first trip this phone organizes
      await page.click('#screen [data-act="back"]'); await settle(page, 120);
    }
    for (const tab of ['map', 'cal']) {
      await page.click('#tabbar [data-act="tab"][data-v="' + tab + '"]'); await settle(page, 150);
      await visit(tab);
      const chips = await page.evaluate(() => [...document.querySelectorAll('#screen [data-act="pick"]')].map((e) => e.getAttribute('data-id')));
      for (const id of chips) { await page.click('#screen [data-act="pick"][data-id="' + id + '"]'); await settle(page, 100); await measureScreen(page, tag(tab + ' chip ' + id)); }
    }
    await page.click('#tabbar [data-act="tab"][data-v="trips"]'); await settle(page, 120);
    // popups reachable from the shell: ＋ (the one create path, PIA-136; at every width), ⚙ in every state
    await createWalk(page, tag, name + '@' + W0, deep && name === 'organizer');
    if (deep) {
      // PIA-135: the list-share sheet in each state (group chips, a toggled card, P-link when the clipboard refuses)
      if (await page.$('#screen [data-act="sharelist"]')) {
        await page.click('#screen [data-act="sharelist"]'); await settle(page, 120);
        await measurePopup(page, tag('P-sharelist'));
        await labelCheck(page, tag('P-sharelist'), name + '@' + W0, 'sheet');
        // the keyboard: Space on a trip toggle keeps focus on that toggle (the sheet is rebuilt), and each group chip
        // is told apart by its people
        const kb = await page.evaluate(() => [...document.querySelectorAll('#sheet [data-act="sltoggle"]')].map((e) => e.getAttribute('data-id')));
        if (kb.length > 1) {
          await page.focus('#sheet [data-act="sltoggle"][data-id="' + kb[1] + '"]');
          const was = await page.getAttribute('#sheet [data-act="sltoggle"][data-id="' + kb[1] + '"]', 'aria-pressed');
          await page.keyboard.press('Space'); await settle(page, 80);
          const f = await page.evaluate(() => { const a = document.activeElement; return { act: a && a.getAttribute('data-act'), id: a && a.getAttribute('data-id'), pressed: a && a.getAttribute('aria-pressed'), tag: a && a.tagName }; });
          const good = f.act === 'sltoggle' && f.id === kb[1] && f.pressed !== was;
          a11yLog.push({ who: tag(''), what: 'toggle focus', good, f });
          await page.keyboard.press('Space'); await settle(page, 80);
        }
        const chipNames = await page.evaluate(() => [...document.querySelectorAll('#sheet [data-act="slgroup"]')].map((e) => e.getAttribute('aria-label')));
        if (chipNames.length) a11yLog.push({ who: tag(''), what: 'chip names', good: new Set(chipNames).size === chipNames.length && chipNames.every((n) => /^Group: \p{L}/u.test(n || '')), chipNames });
        const ng = (await page.$$('#sheet [data-act="slgroup"]')).length;
        for (let i = 0; i < ng; i++) { await page.click('#sheet [data-act="slgroup"][data-v="' + i + '"]'); await settle(page, 60); await measurePopup(page, tag('P-sharelist group ' + i)); }
        const one = await page.$('#sheet [data-act="sltoggle"]'); if (one) { await one.click(); await settle(page, 60); await measurePopup(page, tag('P-sharelist toggled')); }
        if (await page.$('#sheet [data-act="slshare"]:not([disabled])')) {
          await page.click('#sheet [data-act="slshare"]'); await settle(page, 150);
          await measurePopup(page, tag('P-link (list)'));
          if ((await popupId(page)) !== 'P-link' || (await page.$('#sheet .warnline'))) bad('a refused clipboard shows the list link on P-link, with no own-devices warning (it carries no secret) (' + tag('') + ')');
          await page.click('#sheet [data-act="sh-back"]'); await settle(page, 100);
        }
        await closeSheet(page);
      }
      if (await page.$('#screen [data-act="settings"]')) await page.click('#screen [data-act="settings"]');
      else { await page.click('#screen [data-act="key"]'); await settle(page, 100); await page.click('#sheet [data-act="settings"]'); }
      await settle(page, 120);
      await measurePopup(page, tag('⚙'));
      await page.click('#sheet [data-act="tokshow"]'); await settle(page, 80);
      const shownTok = await page.$eval('#org-token', (e) => [e.type, e.value]);
      await measurePopup(page, tag('⚙ token revealed'));
      // typed values count: a long typed string in either field is still one word (spaces cannot be typed)
      await page.fill('#org-token', ''); await page.type('#org-token', 'this is my very long organizer token typed with lots of spaces in it ok', { delay: 0 });
      await page.fill('#org-url', ''); await page.type('#org-url', 'https://some where else typed with spaces . workers . dev / path', { delay: 0 });
      const typed = await measurePopup(page, tag('⚙ long typed values'));
      if (typed.length > 4) bad('typed values in ⚙ cost more than one word each (' + tag('') + ')', typed);
      await page.click('#sheet [data-act="orgsave"]'); await settle(page, 120);
      await measurePopup(page, tag('⚙ refused save'));
      const stored = await page.evaluate(() => [localStorage.getItem('pialax_proxy_token'), localStorage.getItem('pialax_proxy_url')]);
      if (name === 'organizer' && stored[0] !== TOKEN) bad('a refused save must not change the stored token', stored);
      if (name === 'organizer' && shownTok[0] !== 'text') bad('👁 must reveal the token', shownTok);
      const dev = await page.$('#sheet [data-act="devlink"]');
      if (dev) {
        await dev.click(); await settle(page, 150);
        const pl = await popupId(page);
        await measurePopup(page, tag('P-link (devices)'));
        const linkTxt = await page.$eval('#sheet #link-url', (e) => e.value).catch(() => '');
        if (pl !== 'P-link' || !/#ks=/.test(linkTxt) || !(await page.$('#sheet .warnline'))) bad('a refused clipboard shows P-link with the devices link and the own-devices warning (' + tag('') + ')', { pl, linkTxt });
        await page.click('#sheet [data-act="sh-back"]'); await settle(page, 120);
        await measurePopup(page, tag('⚙ after copy (warning)'));
        if (!(await page.$('#sheet .warnline'))) bad('⚙ shows "Your devices only" after a devices link is copied');
      } else if (name === 'organizer') bad('the organizer phone offers the devices link in ⚙');
      const org = await page.$('#sheet [data-act="orglink"]');
      if (org) { await org.click(); await settle(page, 150); await measurePopup(page, tag('P-link (organizer)')); await page.click('#sheet [data-act="sh-back"]'); await settle(page, 100); }
      await closeSheet(page);
    }
    await ctx.close();
  }

  // ═══ AC3: every screen and popup within budget, at three widths, on every phone ═══
  section('AC3 the strict word gate: every screen ≤10 words and every popup ≤20, rendered, on every phone');
  const NAMES = ['organizer', 'guest', 'host', 'eight', 'shelf', 'fresh', 'lockorg', 'portal', 'bookorg', 'booked', 'prices'];   // PIA-139: + the Done 8-member trip's organizer and a booked traveler; PIA-140: + the worst-case prices
  for (const width of WIDTHS) await Promise.all(NAMES.map((name) => walk(name, { width })));   // phones in parallel, one width at a time
  ok('walked every screen of the ' + NAMES.join(', ') + ' phones at ' + WIDTHS.join(', ') + 'px');
  {
    // a failed refresh: stub cards, 📶⚠, P-error by code (never the server's text)
    const { ctx, page } = await phone('organizer', { mode: 'fail' });
    await measureScreen(page, 'failed refresh › Trips');
    const badge = await page.$('#screen [data-act="offline"]');
    check(!!badge && (await popupId(page)) === null, 'a failed refresh shows 📶⚠ and opens no sheet');
    await keyCheck(page, 'failed refresh › Trips'); await labelCheck(page, 'failed refresh › Trips', 'failed');
    const first = await page.$eval('#screen [data-trip]', (e) => e.getAttribute('data-trip'));
    await openCard(page, first); await settle(page, 150);
    await measureScreen(page, 'failed refresh › trip view (stub)'); await labelCheck(page, 'failed refresh › trip view', 'failed');
    await page.click('#screen [data-act="offline"]'); await settle(page, 120);
    const txt = await page.$eval('#sheet', (e) => e.innerText);
    await measurePopup(page, 'P-error network');
    check((await popupId(page)) === 'P-error' && !/boom|stack|Internal/.test(txt) && !!(await page.$('#sheet [data-act="eretry"]')), 'P-error (network) shows the app\'s glyph and ↻, never the Worker\'s text');
    await ctx.close();
  }
  {
    const { ctx, page } = await phone('fresh', { url: '?idea=zzTripThatIsGone0000z1' });
    await settle(page, 300);
    const txt = await page.evaluate(() => document.querySelector('#sheet').innerText);
    await measurePopup(page, 'P-error not_found (link to a missing trip)');
    const list = await page.evaluate(() => localStorage.getItem('pialax_watchlist_v2'));
    check((await popupId(page)) === 'P-error' && /Trip not found/.test(txt) && !/server words/.test(txt) && !/zzTripThatIsGone/.test(list || ''), 'AC6 a link to a missing trip: "Trip not found" by code (not the Worker\'s text), and the trip is not left in the list');
    await ctx.close();
  }
  {
    // the same link on a phone that holds other trips, one of which answers slowly: the link's own 404 decides
    const Z = 'zzTripThatIsGone0000z1';
    const { ctx, page } = await phone('guest', { url: '?idea=' + Z, delay: { [A]: 1500 } });
    await settle(page, 300);
    const pop = await popupId(page), txt = pop ? await page.$eval('#sheet', (e) => e.innerText) : '';
    const list = await page.evaluate(() => localStorage.getItem('pialax_watchlist_v2'));
    check(pop === 'P-error' && /Trip not found/.test(txt) && !/zzTripThatIsGone/.test(list || '') && /^trips-/.test(await screenId(page)),
      'AC6 a link to a missing trip on a phone with other trips still loading: "Trip not found" at once, and the trip leaves the list', { pop, txt });
    await page.waitForTimeout(1400);
    await ctx.close();
  }
  {
    // P-error never replaces an open sheet: the 404 arrives while ⓘ is open, and shows once ⓘ closes
    const Z = 'zzTripThatIsGone0000z1';
    const { ctx, page } = await phone('guest', { url: '?idea=' + Z, delay: { [Z]: 1200 } });
    await page.click('#screen [data-act="key"]'); await settle(page, 1400);
    const during = await popupId(page);
    await page.click('#sheet [data-act="sh-close"]'); await settle(page, 200);
    const after = await popupId(page), txt = after ? await page.$eval('#sheet', (e) => e.innerText) : '';
    check(during === 'P-key' && after === 'P-error' && /Trip not found/.test(txt), 'AC4 a P-error that arrives while a sheet is open waits for it to close, then shows', { during, after });
    await ctx.close();
  }
  {
    // PIA-135: someone's list link opens the receiving sheet (their face, the trips new here, ⤓ Save); the address is cleaned
    const Z = 'zzTripThatIsGone0000z1';
    const { ctx, page } = await phone('guest', { url: '?l=' + A + '.' + B + '.' + Z + '&f=' + encodeURIComponent('🦊') });
    await settle(page, 200);
    const pop = await popupId(page);
    await measurePopup(page, 'P-savelist (one new trip of three)');
    const sv = await page.evaluate(() => ({ face: (document.querySelector('#sheet [data-face]') || {}).textContent || '', minis: [...document.querySelectorAll('#sheet .mini .mt')].map((e) => e.textContent),
      save: (document.querySelector('#sheet [data-act="svsave"]') || {}).textContent || '', listed: localStorage.getItem('pialax_watchlist_v2') }));
    check(pop === 'P-savelist' && sv.face === '🦊' && sv.minis.length === 1 && /Tahoe/.test(sv.minis[0]) && /Save\s*1/.test(sv.save) && sv.listed.indexOf(B) < 0 && !/[?&]l=/.test(page.url()),
      'PIA-135 a list link opens P-savelist: the sender\'s face and only the trip that is new here (Diwali is already listed, the gone trip is left out), ⤓ Save 1; nothing saved yet; ?l= leaves the address bar', sv);
    await labelCheck(page, 'P-savelist', 'guest-savelist', 'sheet');
    const sg = seenOn('guest-savelist sheet').glyphs;
    check((await popupId(page)) === 'P-savelist' && !(await page.evaluate(() => localStorage.getItem('pialax_watchlist_v2'))).includes(B) && ['trips', 'place', 'save'].every((k) => sg.has(k)) && [...sg].some((k) => /^st-/.test(k)),
      'PIA-135 long-press names the sheet\'s glyphs (🧳, the mini\'s locator and stage disc, ⤓) and saves nothing', [...sg]);
    await page.click('#sheet [data-act="svsave"]'); await page.waitForTimeout(60);
    const after = await page.evaluate(() => ({ fly: [...document.querySelectorAll('#screen .card.fly')].map((e) => e.getAttribute('data-trip')), toast: (document.querySelector('#toast:not([hidden])') || {}).textContent || null,
      listed: JSON.parse(localStorage.getItem('pialax_watchlist_v2')).map((x) => x.id) }));
    if (after.toast) await measurePopup(page, 'toast after ⤓ Save');
    check((await popupId(page)) === null && after.fly.length === 1 && after.fly[0] === B && after.toast === '⤓ 1' && after.listed.indexOf(B) >= 0 && after.listed.indexOf(Z) < 0,
      'PIA-135 one tap on ⤓ Save: the new trip is listed and its card flies into the list (toast ⤓ 1); the gone trip is not saved', after);
    await measureScreen(page, 'guest › after ⤓ Save');
    await ctx.close();
  }
  {
    // a receiving sheet whose trips could not be read (yet): the snapshot minis with ◷, named by a long press
    const { ctx, page } = await phone('guest', { url: '?l=' + B + '.' + LT, mode: 'fail' });
    await settle(page, 150);
    const stub = await page.$('#sheet .mini.dim [data-k="stale"]');
    await measurePopup(page, 'P-savelist (not read)');
    await labelCheck(page, 'P-savelist not read', 'guest-loading', 'sheet');
    const g = seenOn('guest-loading sheet').glyphs;
    check(!!stub && g.has('stale') && (await popupId(page)) === 'P-savelist', 'PIA-135 a trip the receiving sheet could not read yet shows ◷, and a long press names it', [...g]);
    await ctx.close();
  }
  for (const [label, url, ls] of [['nothing new', '?l=' + A + '.' + C, null], ['every trip gone', '?l=zzTripThatIsGone0000z1', null], ['a v1 ?w= payload (no face)', '?w=' + Buffer.from(JSON.stringify({ v: 2, o: { thanksgiving: { sh: B } }, a: [] })).toString('base64url'), null]]) {
    const { ctx, page } = await phone('guest', { url, ls });
    await settle(page, 200);
    const pop = await popupId(page), w = await measurePopup(page, 'P-savelist (' + label + ')');
    const st = await page.evaluate(() => ({ dim: document.querySelectorAll('#sheet .mini.dim').length, save: !!document.querySelector('#sheet [data-act="svsave"]'), txt: document.querySelector('#sheet').innerText }));
    const okState = label === 'nothing new' ? st.dim === 2 && !st.save && w.length === 0 : label === 'every trip gone' ? /Trip not found/.test(st.txt) && !st.save : st.save && /Tahoe/.test(st.txt);
    check(pop === 'P-savelist' && okState, 'PIA-135 P-savelist with ' + label + (label === 'nothing new' ? ': the dimmed stack, no Save, no words' : label === 'every trip gone' ? ': "Trip not found", no Save' : ': the shared trip, ⤓ Save'), st);
    await ctx.close();
  }
  {
    const { ctx, page } = await phone('fresh', { url: '?idea=' + A + '#k=' + KEY + '&t=' + TOKEN });
    const u = page.url(), st = await page.evaluate(() => [localStorage.getItem('pialax_idea_keys_v1'), localStorage.getItem('pialax_proxy_token')]);
    check(u.indexOf('#') < 0 && u.indexOf(KEY) < 0 && u.indexOf(TOKEN) < 0 && /\?idea=dwDiwaliRaleigh2026a01$/.test(u) && /pialax-test-edit-key/.test(st[0]) && st[1] === TOKEN && (await screenId(page)) === 'trip-organizer',
      'AC7 an organizer link is saved, stripped from the address bar, and opens the trip as its organizer', { u, st });
    await measureScreen(page, 'organizer link › trip view');
    await ctx.close();
  }

  // ═══ AC2 ═══
  section('AC2 three labelled tabs, no wordmark, the Ideas | Family segment, cold opens and the selected trip');
  {
    const { ctx, page } = await phone('organizer');
    const tabs = await page.$$eval('#tabbar button', (bs) => bs.map((b) => [...b.childNodes].filter((n) => !(n.classList && n.classList.contains('badge'))).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim()));
    check(JSON.stringify(tabs.map((t) => t.replace(/^\S+\s/, ''))) === '["Trips","Map","Calendar"]' && tabs.every((t) => /^\S+ \S+$/.test(t)), 'three tabs, each a glyph and its label: Trips, Map, Calendar', tabs);
    const brand = await page.evaluate(() => /PIALAX/i.test(document.body.innerText));
    check(!brand, 'no wordmark anywhere on screen');
    check((await screenId(page)) === 'trips-ideas' && !!(await page.$('#screen .seg [data-v="ideas"][aria-pressed="true"]')) && !!(await page.$('#screen .seg [data-v="family"]')), 'a cold open lands on Trips › Ideas, with the [Ideas | Family] segment (this phone holds several trips)');
    await openCard(page, M8); await settle(page, 120);
    if ((await popupId(page)) === 'P-face') await closeSheet(page);   // PIA-137: this phone is nobody on that trip (P-face asks once; ⌄ browses)
    await page.click('#tabbar [data-v="map"]'); await settle(page, 120);
    const sel = async () => page.evaluate(() => { const p = document.querySelector('#screen [data-act="pick"][aria-pressed="true"]'); return p ? p.getAttribute('data-id') : null; });
    const mapSel = await sel();
    await page.click('#tabbar [data-v="cal"]'); await settle(page, 120);
    const calSel = await sel();
    check(mapSel === M8 && calSel === M8, 'the trip opened last is the selected trip on Map and on Calendar', { mapSel, calSel });
    await page.click('#screen [data-act="pick"][data-id="' + A + '"]'); await settle(page, 100);
    await page.reload(); await settle(page, 300);
    check((await screenId(page)) === 'calendar' && (await sel()) === A, 'a reload keeps the tab (session) and the selected trip (picked on Calendar)');
    await ctx.close();
    const ls2 = Object.assign({}, PHONES.organizer.ls, { pialax_ui_v1: { v1read: 1, sel: A } });
    const p2 = await phone('organizer', { ls: ls2 });
    const cold = await screenId(p2.page);
    await p2.page.click('#tabbar [data-v="map"]'); await settle(p2.page, 120);
    const coldSel = await p2.page.evaluate(() => { const p = document.querySelector('#screen [data-act="pick"][aria-pressed="true"]'); return p ? p.getAttribute('data-id') : null; });
    check(cold === 'trips-ideas' && coldSel === A, 'a cold open (new session, no ?idea) lands on Trips › Ideas, and Map still shows the remembered trip', { cold, coldSel });
    await p2.ctx.close();
    const p3 = await phone('eight');
    check(!(await p3.page.$('#screen .seg')) && (await screenId(p3.page)) === 'trips-ideas', 'a phone with one trip shows no segment (there is no family view to switch to)');
    await p3.ctx.close();
    const p4 = await phone('fresh');
    check((await screenId(p4.page)) === 'trips-empty' && !!(await p4.page.$('#screen [data-ghost="trips"] [data-act="new"]')), 'an empty phone shows the empty-state picture with ＋');
    for (const tab of ['map', 'cal']) { await p4.page.click('#tabbar [data-v="' + tab + '"]'); await settle(p4.page, 100); check(!!(await p4.page.$('#screen [data-ghost="' + tab + '"]')), (tab === 'map' ? 'Map' : 'Calendar') + ' shows the empty-state picture while the list is empty'); }
    await p4.ctx.close();
  }

  // ═══ AC4 ═══
  section('AC4 sheets: one at a time, closed by ⌄, ‹, Esc, Back or the scrim; never by themselves or by a refresh');
  {
    const { ctx, page, net } = await phone('organizer', { installClock: true });
    await page.clock.runFor(300);
    // a focus refresh happens: with the 60s poll far away, coming back to the app (focus) after the 5s gap reads every trip
    const gF = net.gets;
    await page.clock.runFor(6000);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(250); await page.clock.runFor(50);
    check(net.gets - gF === 10, 'AC9 focus after the 5s gap (no poll due) refreshes every listed trip: one GET each', { gets: net.gets - gF });
    const visibleSheets = () => page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].filter((d) => !d.hidden).length);
    await page.click('#screen [data-act="key"]'); await page.clock.runFor(50);
    const keyName = await page.getAttribute('#sheet', 'aria-label');
    await page.click('#sheet [data-act="settings"]'); await page.clock.runFor(50);
    check((await popupId(page)) === 'P-organizer' && (await visibleSheets()) === 1, 'ⓘ → ⚙ replaces the sheet: one sheet open, never two');
    check(keyName === 'Key' && (await page.getAttribute('#sheet', 'aria-label')) === 'Settings', 'each sheet is announced by its own name (Key, Settings), not "Sheet"');
    await page.click('#sheet [data-act="sh-back"]'); await page.clock.runFor(50);
    check((await popupId(page)) === 'P-key', '‹ in a stacked sheet goes back to the one below');
    const closeGlyph = await page.$eval('#sheet [data-act="sh-close"]', (e) => e.textContent);
    await page.click('#sheet [data-act="sh-close"]'); await page.clock.runFor(50);
    check(closeGlyph === '⌄' && (await popupId(page)) === null && !(await page.evaluate(() => /✕/.test(document.documentElement.outerHTML))), '⌄ closes the sheet (and ✕ is used nowhere)', closeGlyph);
    await page.click('#screen [data-act="key"]'); await page.clock.runFor(50);
    await page.keyboard.press('Escape'); await page.clock.runFor(50);
    check((await popupId(page)) === null, 'Esc closes the sheet');
    const url0 = page.url();
    await page.click('#screen [data-act="key"]'); await page.clock.runFor(50);
    await page.goBack(); await page.clock.runFor(100);
    check((await popupId(page)) === null && page.url() === url0, "the browser's Back closes the sheet and stays in the app");
    await page.click('#screen [data-act="key"]'); await page.clock.runFor(50);
    net.mode = 'fail';
    const g0 = net.gets;
    await page.clock.runFor(65000);            // a 60s poll fires, and fails
    await page.waitForTimeout(250); await page.clock.runFor(50);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(250); await page.clock.runFor(500);
    check(net.gets > g0 && (await popupId(page)) === 'P-key', 'over a minute open, with a failing background refresh in between, the sheet stays open (nothing auto-dismisses it)', { gets: net.gets - g0 });
    await page.click('#sheet [data-act="sh-close"]'); await page.clock.runFor(100);
    const g1 = net.gets;
    await page.clock.runFor(61000); await page.waitForTimeout(300); await page.clock.runFor(100);
    check(net.gets > g1 && (await popupId(page)) === null && !!(await page.$('#screen [data-act="offline"]')), 'a failed background refresh never opens a sheet: it shows 📶⚠ instead');
    net.mode = 'ok';
    await page.clock.runFor(61000); await page.waitForTimeout(300); await page.clock.runFor(100);
    check(!(await page.$('#screen [data-act="offline"]')) && (await popupId(page)) === null, 'the next good poll clears 📶⚠, still without a sheet');
    await ctx.close();
  }
  {
    const { ctx, page } = await phone('organizer');
    const active = () => page.evaluate(() => { const a = document.activeElement; return a ? { inSheet: !!a.closest('#sheet'), act: a.getAttribute('data-act'), id: a.id, tag: a.tagName } : null; });
    // focus stays in an open sheet: the screen and tab bar behind it are inert, and Tab wraps inside the sheet
    await page.click('#screen [data-act="settings"]'); await settle(page, 120);
    const inertOpen = await page.evaluate(() => [document.querySelector('#app').inert, document.querySelector('#tabbar').inert]);
    const escaped = [];
    for (let i = 0; i < 9; i++) { await page.keyboard.press('Tab'); const a = await active(); if (!a || !a.inSheet) escaped.push(a); }
    for (let i = 0; i < 9; i++) { await page.keyboard.press('Shift+Tab'); const a = await active(); if (!a || !a.inSheet) escaped.push(a); }
    check(inertOpen.every(Boolean) && escaped.length === 0, 'with a sheet open the screen and tab bar are inert, and Tab / Shift+Tab never leave the sheet', { inertOpen, escaped: escaped.slice(0, 3) });
    // a tap on the scrim closes it; what was typed and not saved comes back on the next open (and nothing was stored)
    await page.fill('#org-token', 'draft-token-0123456789');
    await page.mouse.click(20, 20); await settle(page, 150);
    const closedByScrim = (await popupId(page)) === null;
    const inertClosed = await page.evaluate(() => [document.querySelector('#app').inert, document.querySelector('#tabbar').inert]);
    await page.click('#screen [data-act="settings"]'); await settle(page, 120);
    const draft = await page.$eval('#org-token', (e) => e.value), stored = await page.evaluate(() => localStorage.getItem('pialax_proxy_token'));
    check(closedByScrim && !inertClosed.some(Boolean) && draft === 'draft-token-0123456789' && stored === TOKEN, 'a tap on the scrim closes the sheet; the typed token is still there when ⚙ opens again, and nothing was saved', { closedByScrim, draft, stored });
    // a Worker the CSP does not allow is refused with the field's bad state, and nothing is stored
    await page.fill('#org-token', TOKEN);
    await page.fill('#org-url', 'https://my-proxy.example.workers.dev');
    await page.click('#sheet [data-act="orgsave"]'); await settle(page, 150);
    const refused = await page.evaluate(() => [!!document.querySelector('#org-url').closest('.fld.bad'), localStorage.getItem('pialax_proxy_url')]);
    check(refused[0] === true && refused[1] === null, 'AC5 ⚙ refuses a Worker URL the page\'s CSP would block (bad field, nothing stored)', refused);
    await page.fill('#org-url', W);
    await page.click('#sheet [data-act="orgsave"]'); await settle(page, 150);
    await page.click('#sheet [data-act="sh-close"]'); await settle(page, 120);
    // closing a sheet gives focus back to the control that opened it
    await page.focus('#screen [data-act="key"]'); await page.keyboard.press('Enter'); await settle(page, 120);
    const opened = await popupId(page);
    await page.keyboard.press('Escape'); await settle(page, 120);
    const back = await active();
    check(opened === 'P-key' && back && back.act === 'key', 'closing a sheet puts focus back on the control that opened it (ⓘ)', { opened, back });
    // the phone's Back on a trip view returns to the list (or to Map, when the trip was opened from Map)
    await openCard(page, A); await settle(page, 150);
    const inTrip = await screenId(page);
    await page.goBack(); await settle(page, 200);
    const afterBack = await screenId(page), url1 = new URL(page.url());
    check(inTrip === 'trip-organizer' && afterBack === 'trips-ideas' && /app\.html$/.test(url1.pathname) && !url1.searchParams.get('idea'), 'the phone\'s Back on a trip view returns to the list and stays in the app', { inTrip, afterBack, url: page.url() });
    await page.click('#tabbar [data-v="map"]'); await settle(page, 150);
    const mapUrl = new URL(page.url()), mapSel = await page.evaluate(() => { const p = document.querySelector('#screen [data-act="pick"][aria-pressed="true"]'); return p ? p.getAttribute('data-id') : null; });
    check(mapUrl.searchParams.get('idea') === mapSel && mapUrl.searchParams.get('tab') === 'map', 'Map keeps the selected trip in the address bar (?idea=<id>&tab=map), like Trips and Calendar', page.url());
    const chip = await page.$eval('#screen .tchip[aria-pressed="true"]', (e) => ({ al: e.getAttribute('aria-label'), lbl: e.getAttribute('data-lbl'), desc: (document.getElementById(e.getAttribute('aria-describedby') || '') || {}).textContent || '' }));
    const subttl = await page.$eval('#screen .subttl', (e) => e.textContent);
    check(chip.al === null && chip.lbl === 'Trip' && chip.desc === subttl && subttl.length > 0, 'a trip chip is named by what it shows and described by its trip\'s title (screen readers can tell trips apart)', chip);
    await page.click('#screen .mini'); await settle(page, 150);
    const fromMap = await screenId(page);
    await page.goBack(); await settle(page, 200);
    check(/^trip-/.test(fromMap) && (await screenId(page)) === 'map', 'Back on a trip opened from Map returns to Map', { fromMap, now: await screenId(page) });
    await page.click('#tabbar [data-v="trips"]'); await settle(page, 150);
    // long-press on containers and text controls names nothing (no "Tabs", "Trips view" or "Sheet"), and hover sets no such title
    const holdAt = async (sel) => {
      const box = await (await page.$(sel)).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(650);
      const shown = await page.evaluate(() => { const b = document.querySelector('#lbl'); return b && !b.hidden ? b.textContent : null; });
      await page.mouse.up(); await settle(page, 150);
      return shown;
    };
    const segShown = await holdAt('#screen .seg [data-v="family"]');
    const segScreen = await screenId(page);
    await page.click('#screen .seg [data-v="ideas"]'); await settle(page, 120);
    const tabShown = await holdAt('#tabbar [data-v="cal"]');
    const tabScreen = await screenId(page);
    await page.click('#tabbar [data-v="trips"]'); await settle(page, 120);
    await page.click('#screen [data-act="key"]'); await settle(page, 120);
    const sheetShown = await holdAt('#sheet .li > span:last-child');
    await page.hover('#sheet .li > span:last-child');
    const sheetTitle = await page.evaluate(() => [...document.querySelectorAll('#sheet, #sheet .li, #sheet .li *, #sheet .legend')].map((e) => e.getAttribute('title')).filter(Boolean));
    await page.keyboard.press('Escape'); await settle(page, 120);
    await page.hover('#tabbar [data-v="map"]'); await page.hover('#screen .seg [data-v="family"]');
    const titles = sheetTitle.concat(await page.evaluate(() => [...document.querySelectorAll('#tabbar, #tabbar button, .seg, .seg button, #sheet, .chips')].map((e) => e.getAttribute('title')).filter(Boolean)));
    check(segShown === null && tabShown === null && sheetShown === null && titles.length === 0 && segScreen === 'trips-family' && tabScreen === 'calendar',
      'a long press on a tab, a segment or a sheet\'s text names no container (it is a plain tap), and no container gets a hover title', { segShown, tabShown, sheetShown, titles, segScreen, tabScreen });
    await ctx.close();
  }
  {
    // every trip on the shelf: Map and Calendar show the empty picture, never ◷ (nothing is out of date)
    const { ctx, page } = await phone('shelf');
    const seen = [];
    for (const tab of ['map', 'cal']) { await page.click('#tabbar [data-v="' + tab + '"]'); await settle(page, 120); seen.push([await screenId(page), !!(await page.$('#screen [data-k="stale"]')), !!(await page.$('#screen [data-ghost]'))]); }
    check(seen.every((s) => /-shelf$/.test(s[0]) && !s[1] && s[2]), 'a phone whose trips are all on the shelf: Map and Calendar show the empty picture, not ◷', seen);
    await ctx.close();
  }

  // ═══ PIA-135: Trips › Ideas ═══
  section('PIA-135 Trips › Ideas: cards fit at 360px, the one total, list share, new answers, the shelf');
  {
    // every card fits inside its own box at 360px (nothing pokes out or scrolls), on the busiest phones, shelf open
    const misfit = [];
    for (const name of ['widest', 'organizer', 'guest', 'eight', 'host', 'shelf']) {
      const { ctx, page } = await phone(name, { width: 360 });
      if (name === 'widest') {
        const row = await page.$eval('#screen [data-trip="' + WC1 + '"] .card-b', (e) => e.textContent.replace(/\s+/g, ' ').trim());
        if (!/^🗓11\/30–12\/2 📌12\/1 ⚠⛺📌🗓 ⏳409\$123,456 \+🦊🐻🐼\+3 🔍$/.test(row)) misfit.push('widest: the worst-case row B is not drawn as expected: ' + row);
        const oj = await page.$eval('#screen [data-trip="' + OJ + '"] .tot', (e) => [e.className, e.textContent.replace(/\s+/g, ' ').trim()]).catch(() => null);
        check(!!oj && oj[0] === 'tot part' && oj[1] === '$459 +🌽', 'PIA-135 AC1 a traveler priced by one leg of two (open-jaw into JFK, home from LGA): the total is outlined as partial with that face, never a bare $459', oj);
        for (const w of WIDTHS) { await page.setViewportSize({ width: w, height: 800 }); await settle(page, 120); await measureScreen(page, 'widest @' + w + ' Trips'); }
        await page.setViewportSize({ width: 360, height: 800 }); await settle(page, 120);
      }
      if (await page.$('#screen [data-act="shelf"][aria-expanded="false"]')) { await page.click('#screen [data-act="shelf"]'); await settle(page, 120); }
      const r = await page.evaluate(() => {
        const out = [], vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
        document.querySelectorAll('#screen .card').forEach((card) => {
          const c = card.getBoundingClientRect();
          if (card.scrollWidth > card.clientWidth + 0.5) out.push(card.getAttribute('data-trip') + ' scrolls');
          card.querySelectorAll('*').forEach((el) => {
            if (!vis(el) || el.closest('svg')) return;
            const b = el.getBoundingClientRect();
            if (b.right > c.right + 0.5 || b.left < c.left - 0.5) out.push(card.getAttribute('data-trip') + ' <' + el.tagName.toLowerCase() + ' class="' + el.className + '"> ' + Math.round(b.left) + '–' + Math.round(b.right) + ' outside ' + Math.round(c.left) + '–' + Math.round(c.right));
          });
          // nothing spills out of its own box (a squeezed pill or total), and nothing in a row sits on top of its neighbour
          card.querySelectorAll('.pill, .tot, .slot, .faces, .heads, .card-t').forEach((el) => { if (vis(el) && el.scrollWidth > el.clientWidth + 1) out.push(card.getAttribute('data-trip') + ' .' + el.className.split(' ')[0] + ' overflows itself by ' + (el.scrollWidth - el.clientWidth) + 'px'); });
          card.querySelectorAll('.card-a, .card-b, .card-c').forEach((row) => {
            const kids = [...row.children].filter(vis).map((k) => [k, k.getBoundingClientRect()]);
            kids.forEach(([k, r], i) => kids.slice(i + 1).forEach(([k2, r2]) => {
              const ox = Math.min(r.right, r2.right) - Math.max(r.left, r2.left), oy = Math.min(r.bottom, r2.bottom) - Math.max(r.top, r2.top);
              if (ox > 1 && oy > 1) out.push(card.getAttribute('data-trip') + ' .' + (k.className || k.tagName).split(' ')[0] + ' overlaps .' + (k2.className || k2.tagName).split(' ')[0]);
            }));
          });
        });
        return { out, cards: document.querySelectorAll('#screen .card').length, page: document.documentElement.scrollWidth - innerWidth };
      });
      if (r.out.length || r.page > 0) misfit.push(name + ': ' + r.out.slice(0, 3).join('; ') + (r.page > 0 ? ' page scroll ' + r.page : ''));
      if (!r.cards) misfit.push(name + ': no cards drawn');
      await ctx.close();
    }
    check(misfit.length === 0, 'PIA-135 AC9 every card fits at 360px (the widest row B the app draws: 📌 across months, ⚠ with three causes, ⏳, a partial stale total; the organizer, guest, 8 long names, host, the shelf open), and the page never scrolls sideways', misfit);
  }
  {
    // the one total: on the organizer's token phone, on the trips it organizes; none at all on a guest's phone
    const { ctx, page } = await phone('organizer');
    const tots = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#screen .card')].map((c) => [c.getAttribute('data-trip'), (c.querySelector('.tot') || {}).textContent || null])));
    check(/^\$1,215$/.test(tots[A] || '') && /^\$189 \+/.test(tots[LT] || '') && /^\$1,206 🔍$/.test(tots[UK] || '') && tots[B] === null && tots[M8] === null && tots[C] === null,
      'PIA-135 AC1 the organizer\'s token phone shows the one total on its own trips only: $1,215 (complete), $189 +faces (partial), grey with 🔍 (a stale search)', tots);
    const marks = await page.evaluate(() => ({ news: [...document.querySelectorAll('#screen .card')].map((c) => [c.getAttribute('data-trip'), c.querySelectorAll('[data-k="new"]').length]).filter((x) => x[1]),
      badge: (document.querySelector('#tabbar .badge') || {}).textContent || null, share: (document.querySelector('#screen [data-act="sharelist"] .badge') || {}).textContent || null,
      pin: (document.querySelector('#screen [data-trip="' + 'dwDiwaliRaleigh2026a01' + '"] [data-k="pin"]') || {}).textContent || null, togo: (document.querySelector('#screen [data-trip="dwDiwaliRaleigh2026a01"] [data-k="togo"]') || {}).textContent || null }));
    const news = Object.fromEntries(marks.news);
    const srt = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
    check(srt(news) === srt({ [B]: 1, [A]: 1, [C]: 1, [UK]: 2, [LX]: 2 }) && marks.badge === '5' && marks.share === '+8' && marks.pin === '📌8' && marks.togo === '⏳20',
      'PIA-135 AC1/AC5/AC7 the organizer\'s cards: ● on the faces with new answers, a numeral on the Trips tab, +8 unshared (every trip off the shelf, whoever organizes it), 📌8 and ⏳20 on Diwali', marks);
    const cue = await page.evaluate(() => [...document.querySelectorAll('#screen .card')].map((c) => [c.getAttribute('data-trip'), (c.querySelector('[data-k="togo"]') || {}).className || null, !!c.querySelector('[data-k="bookby"]'), !!c.querySelector('.pip.now')]));
    const cueOf = Object.fromEntries(cue.map((x) => [x[0], x.slice(1)]));
    check(cueOf[A][0] === 'tg w' && cueOf[B][0] === 'tg' && cueOf[B][1] && cueOf[C][0] === null && cue.every((x) => x[3]),
      'PIA-135 AC1 ⏳ days to go over the book-by arc on every dated card (red on Diwali, whose book-by passed; neutral on Tahoe), none on an undated idea; a stage disc on every card', cue);
    // P-sharelist: the largest group pre-checked, no shelf or dropped trip, a share sheet handed the list link only
    await ctx.close();
    const p2 = await phone('organizer', { share: true });
    await p2.page.click('#screen [data-act="sharelist"]'); await settle(p2.page, 150);
    const sh = await p2.page.evaluate(() => ({ trips: [...document.querySelectorAll('#sheet [data-act="sltoggle"]')].map((e) => [e.getAttribute('data-id'), e.getAttribute('aria-pressed')]), groups: document.querySelectorAll('#sheet [data-act="slgroup"]').length,
      btn: (document.querySelector('#sheet [data-act="slshare"]') || {}).textContent || '' }));
    const listed = sh.trips.map((x) => x[0]), checkedIds = sh.trips.filter((x) => x[1] === 'true').map((x) => x[0]);
    check(listed.indexOf(PAST) < 0 && listed.indexOf(DROP) < 0 && listed.length === 8 && sh.groups >= 2 && checkedIds.length > 0 && new RegExp('Share\\s*' + checkedIds.length).test(sh.btn),
      'PIA-135 AC4 P-sharelist lists every trip off the shelf (no past or dropped one), with group chips and the largest group pre-checked', sh);
    await p2.page.click('#sheet [data-act="slshare"]'); await settle(p2.page, 200);
    const handed = await p2.page.evaluate(() => window.__shared || []);
    const url = handed[0] && new URL(handed[0].url);
    const ids = url ? (url.searchParams.get('l') || '').split('.') : [];
    const toastTxt = await p2.page.evaluate(() => { const t = document.querySelector('#toast'); return t && !t.hidden ? t.textContent : null; });
    if (toastTxt) await measurePopup(p2.page, 'toast after 📣 Share');
    check(handed.length === 1 && Object.keys(handed[0]).join() === 'url' && JSON.stringify(ids.slice().sort()) === JSON.stringify(checkedIds.slice().sort()) && url.searchParams.get('f') === '🌴' && !url.hash &&
      handed[0].url.indexOf(KEY) < 0 && handed[0].url.indexOf(TOKEN) < 0 && (await popupId(p2.page)) === null && toastTxt === '📣 ' + ids.length,
      'PIA-135 AC4 📣 Share hands the phone\'s share sheet one URL: ?l=<the checked ids>&f=<my face>, no key or token; the sheet closes', { handed, toastTxt });
    const after = await p2.page.evaluate(() => ({ badge: (document.querySelector('#screen [data-act="sharelist"] .badge') || {}).textContent || null, wl: JSON.parse(localStorage.getItem('pialax_shared_at_v1') || '{}').wl }));
    check(JSON.stringify((after.wl || []).slice().sort()) === JSON.stringify(checkedIds.slice().sort()) && checkedIds.length > 0 && after.badge === (8 - checkedIds.length ? '+' + (8 - checkedIds.length) : null),
      'PIA-135 AC5 the shared ids are recorded and the unshared count drops by exactly them (+8 → +' + (8 - checkedIds.length) + ')', after);
    await p2.ctx.close();
  }
  {
    // ● new answers clear with a look; the Trips numeral follows
    const ls = Object.assign({}, PHONES.guest.ls, { pialax_idea_seen_v1: { [A]: '2026-10-11T02:10:30.000Z' } });
    const { ctx, page } = await phone('guest', { ls });
    const count = () => page.evaluate(() => ({ dots: document.querySelectorAll('#screen [data-trip="dwDiwaliRaleigh2026a01"] [data-k="new"]').length, badge: (document.querySelector('#tabbar .badge') || {}).textContent || '' }));
    const before = await count();
    await openCard(page, A); await settle(page, 150);
    await page.click('#screen [data-act="back"]'); await settle(page, 150);
    const after = await count();
    check(before.dots === 1 && after.dots === 0 && before.badge !== '' && after.badge === before.badge,
      'PIA-135 AC7 Ashwin answered after my last look: ● on his face; opening the trip clears it, and the Trips numeral stays (Diwali still waits on my own answer)', { before, after });
    await ctx.close();
  }
  {
    // the numeral counts each trip once: Tahoe has an unseen answer and does not wait on me (I answered), so a look takes exactly one off
    const { ctx, page } = await phone('organizer');
    const count = () => page.evaluate((id) => ({ dots: document.querySelectorAll('#screen [data-trip="' + id + '"] [data-k="new"]').length, badge: (document.querySelector('#tabbar .badge') || {}).textContent || '' }), B);
    const before = await count();
    await openCard(page, B); await settle(page, 150);
    await page.click('#screen [data-act="back"]'); await settle(page, 150);
    const after = await count();
    check(before.dots === 1 && after.dots === 0 && before.badge === '5' && after.badge === '4', 'PIA-135 AC7 a look at Tahoe clears its ● and the Trips numeral drops by exactly one (5 → 4)', { before, after });
    await ctx.close();
  }
  {
    // a failed refresh dims every stale card with ◷
    const { ctx, page } = await phone('guest', { mode: 'fail' });
    const st = await page.evaluate(() => [...document.querySelectorAll('#screen .card')].map((c) => c.classList.contains('dim') && !!c.querySelector('[data-k="stale"]')));
    check(st.length > 0 && st.every(Boolean) && !!(await page.$('#screen [data-act="offline"]')) && (await popupId(page)) === null, 'PIA-135 AC7 a failed refresh dims every stale card with ◷ and shows 📶⚠, no sheet', st);
    await ctx.close();
  }

  // ═══ PIA-136: the one create path and organizer edits ═══
  section('PIA-136 create and edit: every step within budget on every phone, the spec\'s tap counts, a failed Create, join requests, v1 links, captions, drop');
  {
    const words = (s) => String(s || '').split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
    const off = createLog.filter((x) => x.first.pop !== 'P-new-what' || x.first.title !== '' || x.first.focus !== 'new-title' || x.typed.dest !== 'ZZQ' || !x.typed.warn ||
      words(x.typed.title) !== 12 || x.who2 !== 'P-new-who' || x.when !== 'P-new-when' || words(x.row.name) !== 3 || x.row.ap !== 'QQQ');
    check(createLog.length === NAMES.length * WIDTHS.length && off.length === 0,
      'PIA-136 AC1/AC2/AC9 ＋ on every phone (' + NAMES.length + ') at 360/390/430: P-new-what opens empty with the name focused; a name takes 12 words at most and a person\'s 3 (typing past stops); an unknown code (ZZQ) is marked 📍⚠ and ▶ goes on; ▶ ▶ reaches P-new-when — every step counted ≤20 words',
      off.slice(0, 2));
    const eight = editLog.filter((x) => /^eight /.test(x.who)), org = editLog.filter((x) => /^organizer /.test(x.who));
    const good = (x) => JSON.stringify(x.tiles) === '["etitle","epeople","ecap","ekey","edrop"]' && x.linkPop === 'P-link' && /#k=pialax-test-edit-key/.test(x.linkTxt) && x.warned &&
      JSON.stringify(x.drop) === '["🗑 Drop","Keep"]' && x.back === 'P-edit';
    check(eight.length === 3 && org.length === 3 && eight.concat(org).every(good) && eight.every((x) => x.people && x.people.armed && x.people.rows === 8),
      'PIA-136 AC5/AC7/AC9 P-edit on the organizer\'s trips (and the 8-member trip with long names) at every width: 🏷📍 👥 📝 🔑 🗑; removing someone who answered shows ⚠ first; 🔑 gives the organizer link (P-link when the clipboard refuses) and "Your devices only"; P-drop is 🗑 Drop / Keep, and Keep goes back',
      eight.concat(org).filter((x) => !good(x)).slice(0, 2));
  }
  {
    // AC9 the Diwali job, counted as the spec counts it: 10 taps in the sheet, the trip's 📣, then the chat and Send (OS steps)
    const { ctx, page } = await phone('diwali', { worker: true, share: true });
    let taps = 0;
    const tap = async (sel) => { await page.click(sel); taps++; await settle(page, 60); };
    await tap('#screen [data-act="new"]');
    await page.keyboard.type('Diwali in Raleigh', { delay: 0 });   // the name field has the focus: typing is not a tap
    await tap('#sheet [data-act="nscene"][data-v="2"]');
    await tap('#new-dest'); await page.keyboard.type('RDU', { delay: 0 });
    await measurePopup(page, 'Diwali › P-new-what');
    await tap('#sheet [data-act="nnext"]');
    const who = await page.evaluate(() => ({ preset: (document.querySelector('#sheet [data-act="npreset"][aria-pressed="true"]') || {}).textContent || '',
      me: [...document.querySelectorAll('#sheet .mrow')].filter((r) => r.querySelector('.metog[aria-pressed="true"]')).map((r) => (r.querySelector('.mn') || {}).textContent) }));
    const wWho = await measurePopup(page, 'Diwali › P-new-who');
    await tap('#sheet [data-act="nnext"]');
    const month = await page.$eval('#sheet .monthhd h3', (e) => e.textContent.replace(/\s+/g, ' ').trim());
    await tap('#sheet [data-act="nday"][data-v="2026-11-06"]'); await tap('#sheet [data-act="nday"][data-v="2026-11-09"]');
    await tap('#sheet [data-act="npin"]'); await tap('#sheet [data-act="nday"][data-v="2026-11-08"]');
    const ro = await page.$eval('#sheet .readout', (e) => e.textContent.replace(/\s+/g, ' ').trim());
    const wWhen = await measurePopup(page, 'Diwali › P-new-when');
    await tap('#sheet [data-act="ncreate"]'); await settle(page, 300);
    const scr = await screenId(page);
    await measureScreen(page, 'Diwali › the new trip');
    await tap('#screen [data-act="tshare"]'); await settle(page, 150);
    const st = await page.evaluate(() => ({ shared: window.__shared || [], keys: JSON.parse(localStorage.getItem('pialax_idea_keys_v1') || '{}') }));
    const ids = Object.keys(st.keys).filter((k) => k !== A);
    check(taps + 2 === 13 && who.preset === '👪🌽💪🗽' && JSON.stringify(who.me) === '["Ashwin"]' && wWho.join(' ') === 'Mom Dad PIA Ashwin LAX Anjo LGA' && month === 'Nov 2026' && ro === '11/6–11/9 · 3🌙 📌11/8' &&
      wWhen.join(' ') === 'Nov Sun Sat Create' && scr === 'trip-organizer' && ids.length === 1 && st.shared.length === 1 && st.shared[0].url === W + '/i/' + ids[0],
      'PIA-136 AC9 "Diwali in Raleigh" takes the spec\'s 13 taps (＋ 🪔 📍 ▶ ▶ 11/6 11/9 📌 11/8 Create 📣, then the chat and Send): 👪 pre-applied with 🙋 Ashwin, November, the trip opens as its organizer, 📣 hands over the guest link',
      { taps, who, wWho, month, ro, wWhen, scr, shared: st.shared });
    // AC7 drop it from P-edit, then ↩ from the toast
    await tap('#screen [data-act="edit"]'); await tap('#sheet [data-act="edrop"]');
    await tap('#sheet [data-act="dropyes"]'); await settle(page, 250);
    const dropped = { scr: await screenId(page), pop: await popupId(page), toast: await page.evaluate(() => { const t = document.querySelector('#toast'); return t && !t.hidden ? t.textContent : null; }) };
    if (dropped.toast !== null) await measurePopup(page, 'toast after 🗑 Drop', '#toast');
    await page.click('#toast [data-act="undo"]'); await settle(page, 300);
    const back = await page.evaluate((id) => !!document.querySelector('#screen [data-trip="' + id + '"]:not(.dim)'), ids[0]);
    check(dropped.scr === 'trips-ideas' && dropped.pop === null && /🗑/.test(dropped.toast || '') && back, 'PIA-136 AC7 🗑 Drop closes the trip into the list and its shelf; the toast\'s ↩ brings it back', dropped);
    await ctx.close();
  }
  {
    // AC9 the Tahoe job on a phone with no token and no trips (Priya): 17 taps in the app, then the chat and Send
    const { ctx, page, net } = await phone('fresh', { worker: true, share: true });
    let taps = 0;
    const tap = async (sel) => { await page.click(sel); taps++; await settle(page, 60); };
    await tap('#screen [data-act="new"]');
    await page.keyboard.type('Tahoe ski weekend', { delay: 0 });
    await tap('#sheet [data-act="nscene"][data-v="10"]');
    await tap('#new-dest'); await page.keyboard.type('RNO', { delay: 0 });
    await tap('#sheet [data-act="nnext"]');
    const empty = { rows: (await page.$$('#sheet .mrow')).length, presets: (await page.$$('#sheet [data-act="npreset"]')).length };
    for (const [n, a] of [['Priya', 'DEN'], ['Maya', 'SFO'], ['Ashwin', 'LAX'], ['Leo', 'SEA']]) {
      await tap('#sheet [data-act="nadd"]'); await page.keyboard.type(n, { delay: 0 });   // ＋ puts the cursor in the new name field
      await tap('#mem-ap'); await page.keyboard.type(a, { delay: 0 });
    }
    const people = await page.evaluate(() => [...document.querySelectorAll('#sheet .mrow')].map((r) => { const f = r.querySelector('.mf') || r.querySelector('.facepick'); return (f ? f.textContent : '') + ((r.querySelector('.metog[aria-pressed="true"]')) ? '🙋' : ''); }));
    await measurePopup(page, 'Tahoe › P-new-who (four friends)');
    await tap('#sheet [data-act="nnext"]');
    await tap('#sheet [data-act="nday"][data-v="2026-11-27"]'); await tap('#sheet [data-act="nday"][data-v="2026-11-30"]');
    // a dropped connection on Create: ⚠ ↻ on the button, the draft kept (a retry is not a step of the job, so it is not counted)
    net.failPost = true;
    await page.click('#sheet [data-act="ncreate"]'); await settle(page, 300);
    const failed = { pop: await popupId(page), btn: await page.$eval('#sheet [data-act="ncreate"]', (e) => e.textContent).catch(() => null), draft: await page.evaluate(() => (JSON.parse(localStorage.getItem('pialax_ui_v1') || '{}').draft || {}).name || null) };
    await measurePopup(page, 'Tahoe › P-new-when (Create failed: ⚠ ↻)');
    await closeSheet(page);
    await page.click('#screen [data-act="new"]'); await settle(page, 150);
    const reopened = { pop: await popupId(page), sel: await page.$$eval('#sheet [data-act="nday"][aria-pressed="true"]', (e) => e.map((x) => x.getAttribute('data-v'))) };
    await measurePopup(page, 'Tahoe › the kept draft, reopened by ＋');
    await tap('#sheet [data-act="ncreate"]'); await settle(page, 300);
    const scr = await screenId(page);
    await tap('#screen [data-act="tshare"]'); await settle(page, 150);
    const st = await page.evaluate(() => ({ shared: window.__shared || [], draft: 'draft' in JSON.parse(localStorage.getItem('pialax_ui_v1') || '{}'), me: JSON.parse(localStorage.getItem('pialax_idea_me_v1') || '{}') }));
    check(taps + 2 === 19 && empty.rows === 0 && empty.presets === 0 && people.length === 4 && /🙋$/.test(people[0]) && people.slice(1).every((p) => !/🙋/.test(p)) && new Set(people.map((p) => p.replace('🙋', ''))).size === 4 &&
      scr === 'trip-organizer' && st.shared.length === 1 && /\/i\/[A-Za-z0-9_-]{22}$/.test(st.shared[0].url) && !st.draft && Object.keys(st.me).length === 1,
      'PIA-136 AC9 "Tahoe ski weekend" on a phone with no token and no trips takes the spec\'s 19 taps (＋ 🎿 📍 ▶, then ＋ and the airport field for each of 4 friends, ▶ 11/27 11/30 Create 📣, the chat and Send): no 👪 and no groups, Priya 🙋 by default, four different faces',
      { taps, empty, people, scr });
    check(failed.pop === 'P-new-when' && /⚠\s*↻/.test(failed.btn || '') && failed.draft === 'Tahoe ski weekend' && reopened.pop === 'P-new-when' && JSON.stringify(reopened.sel) === JSON.stringify(['2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30']),
      'PIA-136 AC1 a Create that fails shows ⚠ ↻ and keeps the draft; ＋ reopens it where it was (one tap retries)', { failed, reopened });
    await ctx.close();
  }
  {
    // AC6 a join request on the organizer's phone: the people editor, Sam open, one Save
    const { ctx, page, net } = await phone('diwali', { worker: true, url: '?idea=' + A + '&add=' + encodeURIComponent('Sam Lee.OAK') });
    await settle(page, 300);
    const pop = await popupId(page), row = await page.evaluate(() => ({ name: (document.querySelector('#mem-name') || {}).value, ap: (document.querySelector('#mem-ap') || {}).value }));
    await measurePopup(page, 'join request › P-edit-who (Sam Lee open)');
    const p0 = net.posts;
    await page.click('#sheet [data-act="esave2"]'); await settle(page, 300);
    const after = { pop: await popupId(page), scr: await screenId(page), faces: (await page.$$('#screen .pb-row')).length, url: page.url() };
    await measureScreen(page, 'join request › the trip with Sam');
    check(pop === 'P-edit-who' && row.name === 'Sam Lee' && row.ap === 'OAK' && net.posts - p0 === 1 && after.pop === null && after.scr === 'trip-organizer' && after.faces === 4 && !/[?&]add=/.test(after.url),
      'PIA-136 AC6 ?idea=…&add=Sam Lee.OAK on the organizer\'s phone opens the people editor with Sam (OAK) added and open; one Save adds him (one update)', { pop, row, after });
    await ctx.close();
    // PIA-137: on someone else's phone the request is not lost: the trip opens under P-joinfwd, whose 📣 sends it on
    const g = await phone('guest', { url: '?idea=' + A + '&add=' + encodeURIComponent('Sam Lee.OAK'), share: true });
    await settle(g.page, 200);
    const gpop = await popupId(g.page), gscr = await screenId(g.page);
    const gw = await measurePopup(g.page, 'join request on a guest\'s phone › P-joinfwd');
    await labelCheck(g.page, 'P-joinfwd', 'joinfwd', 'sheet');
    await g.page.click('#sheet [data-act="joinfwd"]'); await settle(g.page, 200);
    const fwd = await g.page.evaluate(() => window.__shared || []);
    check(gpop === 'P-joinfwd' && /^trip-/.test(gscr) && gw.join(' ').indexOf('Sam Lee') >= 0 && fwd.length === 1 && /\?idea=[A-Za-z0-9_-]+&add=Sam%20Lee\.OAK$/.test(fwd[0].url) && Object.keys(fwd[0]).join() === 'url' && (await popupId(g.page)) === null,
      'PIA-137 the same link on someone else\'s phone opens the trip under P-joinfwd (Sam Lee, OAK): its 📣 (a real tap) sends the same link on, URL only', { gpop, words: gw, fwd });
    await g.ctx.close();
  }
  {
    // AC8 v1's read-only ?tripIdea= link → the create sheet, filled; its note (here a longer v1 text) is on the sheet as 📝⚠
    const note = 'Puja Sunday then ' + Array.from({ length: 30 }, (_, i) => 'lamp' + i).join(' ');
    const payload = { version: 'trip-idea-v1', builder: { destination: { city: 'Raleigh-Durham', airport: 'RDU' }, dates: { departure: '2026-11-06', return: '2026-11-09' }, constraints: { eventDate: '2026-11-08' } },
      recommendation: { airport: 'RDU', city: 'Raleigh-Durham', departure: '2026-11-06', return: '2026-11-09', totalFare: 955 }, notes: note };
    const raw = Buffer.from(encodeURIComponent(JSON.stringify(payload)), 'binary').toString('base64');
    const { ctx, page } = await phone('fresh', { url: '?tripIdea=' + encodeURIComponent(raw) });
    await settle(page, 150);
    const st = { pop: await popupId(page), title: await page.$eval('#new-title', (e) => e.value).catch(() => null), dest: await page.$eval('#new-dest', (e) => e.value).catch(() => null), url: page.url(),
      chip: await page.$eval('#sheet [data-act="nnote"]', (e) => e.textContent).catch(() => null) };
    await measurePopup(page, 'v1 ?tripIdea= › P-new-what (filled, with its note)');
    await labelCheck(page, 'v1 ?tripIdea= › P-new-what', 'v1link-new', 'sheet');
    await page.click('#sheet [data-act="nnote"]'); await settle(page, 120);
    const nt = { pop: await popupId(page), text: await page.$eval('#note-text', (e) => e.value).catch(() => ''), warn: await page.evaluate(() => !!document.querySelector('#note-count [data-k="warn"]:not([hidden])')) };
    await measurePopup(page, 'v1 ?tripIdea= › P-note (its note, first 20 words)');
    await page.click('#sheet [data-act="sh-back"]'); await settle(page, 120);
    const backPop = await popupId(page);
    check(st.pop === 'P-new-what' && st.title === 'Raleigh-Durham' && st.dest === 'RDU' && !/tripIdea/.test(st.url) && st.chip === '📝⚠' && nt.pop === 'P-note' &&
      nt.text.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length === 20 && /^Puja Sunday then lamp0 /.test(nt.text) && nt.warn && backPop === 'P-new-what',
      'PIA-136 AC8 a v1 ?tripIdea= link opens the create sheet filled from it and leaves the address bar; its note is shown (📝⚠ opens its first 20 words, ⚠: v1\'s text was longer), ‹ goes back', { st, nt, backPop });
    await ctx.close();
  }
  {
    // PIA-136 typing never rebuilds the field being typed in; a keyboard still composing is left alone; a paste past a cap
    // keeps what fits (⚠ beside the field) instead of vanishing
    const { ctx, page } = await phone('fresh');
    await page.click('#screen [data-act="new"]'); await settle(page, 120);
    const field = await page.$('#new-title');
    await page.type('#new-title', 'Diwali party', { delay: 0 });
    const typed = { same: await field.evaluate((e) => e.isConnected && e === document.activeElement), pic: await page.$eval('#sheet .pcrow', (e) => e.textContent), pressed: await page.$eval('#sheet [data-act="nscene"][aria-pressed="true"]', (e) => e.textContent) };
    await page.fill('#new-title', '');
    const words20 = Array.from({ length: 20 }, (_, i) => 'Word' + i).join(' ');
    // a composing keyboard: nothing is cut while the word is open; when it ends, the cap applies
    const ime = await page.evaluate((w) => {
      const f = document.querySelector('#new-title');
      f.value = w; f.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText' }));
      const during = f.value;
      f.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: w }));
      return { during, after: f.value };
    }, words20);
    await page.fill('#new-title', '');
    await page.focus('#new-title'); await page.keyboard.insertText(words20); await settle(page, 60);   // one input event, as a paste is
    const paste = await page.evaluate(() => ({ value: document.querySelector('#new-title').value, warn: !document.querySelector('#cut-new-title').hidden, same: document.activeElement && document.activeElement.id }));
    await measurePopup(page, 'P-new-what (a 20-word paste, cut to 12 with ⚠)');
    const w = (s) => s.split(/\s+/).filter((x) => /\p{L}/u.test(x)).length;
    check(typed.same && /🪔/.test(typed.pic) && typed.pressed === '🪔' && ime.during === words20 && w(ime.after) === 12 && w(paste.value) === 12 && /^Word0 Word1 /.test(paste.value) && paste.warn && paste.same === 'new-title',
      'PIA-136 typing "Diwali party" turns the picture to 🪔 without rebuilding the name field (still the focused element); a composing keyboard is not cut mid-word, the cap applies when it ends; a 20-word paste keeps its first 12 words with ⚠ (never an empty field)', { typed, ime: { during: w(ime.during), after: w(ime.after) }, paste });
    await ctx.close();
  }
  {
    // PIA-136 the organizer link on a phone that HAS a share sheet: ✎ → 🔑 copies it and never hands it to the share sheet
    const { ctx, page } = await phone('diwali', { share: true, clipOk: true });
    await openCard(page, A); await settle(page, 150);
    await page.click('#screen [data-act="edit"]'); await settle(page, 100);
    await page.click('#sheet [data-act="ekey"]'); await settle(page, 150);
    const st = await page.evaluate(() => ({ shared: (window.__shared || []).length, warn: !!document.querySelector('#sheet .warnline'), pop: document.querySelector('#sheet').getAttribute('data-popup'), url: location.href }));
    check(st.shared === 0 && st.warn && st.pop === 'P-edit' && !/#k=|[#&]t=/.test(st.url), 'PIA-136 AC5 with a share sheet on the phone, 🔑 still only copies the organizer link (the share sheet is never called) and says "Your devices only"', st);
    await ctx.close();
  }
  {
    // PIA-136 AC6 a join request on the full 8-member trip: the joiner is shown with ⚠ 9/8 and Save waits; still ≤20 words
    const { ctx, page } = await phone('eight', { url: '?idea=' + M8 + '&add=' + encodeURIComponent('Nina Okafor.BOS') });
    await settle(page, 300);
    const st = await page.evaluate(() => ({ pop: document.querySelector('#sheet').getAttribute('data-popup'), rows: document.querySelectorAll('#sheet .mrow').length, name: (document.querySelector('#mem-name') || {}).value,
      cap: (document.querySelector('#who-cap') || {}).textContent || '', save: (document.querySelector('#sheet [data-act="esave2"]') || {}).getAttribute ? document.querySelector('#sheet [data-act="esave2"]').getAttribute('aria-disabled') : null }));
    await measurePopup(page, 'join request on a full trip › P-edit-who (⚠ 9/8)');
    await labelCheck(page, 'join request on a full trip › P-edit-who', 'eight-join', 'sheet');
    check(st.pop === 'P-edit-who' && st.rows === 9 && st.name === 'Nina Okafor' && /⚠\s*9\/8/.test(st.cap) && st.save === 'true',
      'PIA-136 AC6 a join request on a full trip shows the joiner (Nina Okafor, open) and ⚠ 9/8; Save waits until someone is removed — never dropped silently', st);
    await ctx.close();
  }
  {
    // AC5 a caption that is a longer v1 text: P-note shows its first 20 words with ⚠; replacing it takes a second ⌄
    const { ctx, page } = await phone('caption', { worker: true });
    await openCard(page, LC); await settle(page, 150);
    await page.click('#screen [data-act="cap"]'); await settle(page, 120);
    const before = await page.$eval('#note-text', (e) => e.value.split(/\s+/).length);
    await measurePopup(page, 'P-note (a longer v1 caption, first 20 words)');
    const captionBeforePet = await page.$eval('#note-text', (e) => e.value);
    await page.focus('#sheet .pet-notes summary');
    await page.keyboard.press('Enter');
    await measurePopup(page, 'P-note (Nebby guidance expanded, exempt notes)');
    const pet = await page.$eval('#sheet .pet-notes', (e) => ({ open: e.open, text: e.innerText, exempt: e.hasAttribute('data-free'), width: e.scrollWidth <= e.clientWidth }));
    check(pet.open && pet.exempt && pet.width && pet.text.includes('Pet fees are not included') && pet.text.includes('private screening room') && pet.text.includes('return') && (await page.$eval('#note-text', (e) => e.value)) === captionBeforePet,
      'PIA-148 Nebby guidance expands without changing the saved-note field, fits the phone and leaves fees/reservation unconfirmed', pet);
    await page.click('#sheet .pet-notes summary');

    await page.fill('#note-text', ''); await page.type('#note-text', 'Dad wants the Peoria parade and then we eat ' + Array.from({ length: 15 }, (_, i) => 'w' + i).join(' '), { delay: 0 });
    const typed = await page.$eval('#note-text', (e) => e.value.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length);   // numerals are free: "w11" stops at its letter
    await page.click('#sheet [data-act="sh-close"]'); await settle(page, 120);
    const armed = { pop: await popupId(page), warn: !!(await page.$('#sheet .warnline')) };
    await measurePopup(page, 'P-note (replacing it: ⚠ ⌄)');
    await page.click('#sheet [data-act="sh-close"]'); await settle(page, 400);
    await page.click('#screen [data-act="cap"]'); await settle(page, 120);
    const saved = await page.$eval('#note-text', (e) => e.value);
    check(before === 20 && typed === 20 && armed.pop === 'P-note' && armed.warn && /^Dad wants the Peoria parade and then we eat w0/.test(saved) && saved.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length === 20,
      'PIA-136 AC5 P-note: a longer v1 caption opens at its first 20 words (⚠); typing stops at 20; the first ⌄ asks (⚠ ⌄), the second saves', { before, typed, armed, saved });
    await closeSheet(page);
    await ctx.close();
  }

  // ═══ AC5 summary, network, console ═══
  section('PIA-137 the trip view: the 3-tap and 2-tap answers with real clicks, P-face and its join row, one person\'s sheet and note, closed and set trips');
  {
    // the walk above: every trip view and its sheets on every phone, at every width
    check(faceLog.length >= 6 && sheetLog.length >= 8 && sheetLog.every((x) => x.join.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length <= 3 && x.words <= POPUP_MAX),
      'PIA-137 the walk opened P-person for every face (and each one\'s note), P-stage and P-face on every trip of every phone; P-face opened by itself where a phone is nobody (' + faceLog.length + ' times); a join name stops at 3 words', sheetLog.slice(0, 2));
  }
  {
    // AC1 the group link: the link (1) opens P-face; 🗽 (2); In (3). One answer, through the real Worker
    const { ctx, page, net } = await phone('fresh', { worker: true, url: '?idea=' + A });
    await settle(page, 200);
    let taps = 1;
    const pop = await popupId(page);
    await measurePopup(page, 'group link › P-face (by itself)');
    const tiles = await page.$$eval('#sheet [data-act="pickface"]', (els) => els.map((e) => e.getAttribute('data-code')));
    taps++; await page.click('#sheet [data-act="pickface"][data-code="anjo-z5"]'); await settle(page, 200);
    const w1 = await measureScreen(page, 'group link › the trip as Anjo (before she answers)');
    const pulsed = await page.evaluate(() => !!document.querySelector('#screen .answers.nudge'));
    const p0 = net.posts;
    taps++; await page.click('#screen [data-act="answer"][data-v="in"]'); await settle(page, 400);
    const r = JSON.parse(net.kv.map.get('idea:' + A)).responses['anjo-z5'];
    const st = await page.evaluate(() => ({ me: JSON.parse(localStorage.getItem('pialax_idea_me_v1') || '{}'), pressed: (document.querySelector('#screen [data-act="answer"][aria-pressed="true"]') || {}).textContent || '' }));
    await measureScreen(page, 'group link › the trip after In');
    check(pop === 'P-face' && tiles.length === 3 && taps === 3 && net.posts - p0 === 1 && r && r.status === 'in' && st.me[A] === 'anjo-z5' && /In$/.test(st.pressed) && pulsed && w1.indexOf('Anjo') >= 0,
      'PIA-137 AC1 from the plain group link Anjo answers in 3 taps with real clicks: the link (P-face opens by itself), 🗽 (the answer row pulses), In (one answer, saved)', { pop, taps, pulsed, status: r && r.status });
    await ctx.close();
  }
  {
    // AC1 a personal nudge link: the link (1) greets Anjo, In (2)
    const { ctx, page, net } = await phone('fresh', { worker: true, url: '?idea=' + A + '#m=anjo-z5' });
    await settle(page, 200);
    const pop = await popupId(page), url = page.url();
    const w = await measureScreen(page, 'nudge link › greeted as Anjo');
    const p0 = net.posts;
    await page.click('#screen [data-act="answer"][data-v="in"]'); await settle(page, 400);
    const r = JSON.parse(net.kv.map.get('idea:' + A)).responses['anjo-z5'];
    check(pop === null && url.indexOf('#') < 0 && w.indexOf('Anjo') >= 0 && net.posts - p0 === 1 && r && r.status === 'in',
      'PIA-137 AC1 from a personal nudge link (#m=anjo-z5) the trip greets Anjo with no sheet and the hint leaves the address bar; In answers: 2 taps', { pop, words: w.join(' ') });
    await ctx.close();
    // the same link on a phone that is someone else there: P-face asks, the hint outlined; the remembered face stays until a tap
    const g = await phone('organizer', { url: '?idea=' + A + '#m=anjo-z5' });
    await settle(g.page, 200);
    const gp = await popupId(g.page), outlined = await g.page.$eval('#sheet .tile.hint', (e) => e.getAttribute('data-code')).catch(() => null);
    const hinted = await g.page.$eval('#sheet .tile.hinted', (e) => e.getAttribute('data-code')).catch(() => null);
    const focused = await g.page.evaluate(() => (document.activeElement || {}).id === 'pf-mark' && document.activeElement.getAttribute('data-code'));
    await measurePopup(g.page, 'nudge link on another face\'s phone › P-face (the remembered face outlined, the hint marked)');
    await closeSheet(g.page);
    const kept = await g.page.evaluate(() => JSON.parse(localStorage.getItem('pialax_idea_me_v1'))['dwDiwaliRaleigh2026a01']);
    check(gp === 'P-face' && outlined === 'ashwin-p8' && focused === 'ashwin-p8' && hinted === 'anjo-z5' && kept === 'ashwin-p8' && (await g.page.$eval('#screen .me .nm', (e) => e.textContent)).indexOf('Ashwin') >= 0,
      'PIA-137 AC1 a hint never silently overrides a different remembered face: P-face outlines and focuses Ashwin (the remembered face), marks Anjo (✉), and ⌄ leaves this phone Ashwin', { gp, outlined, focused, hinted, kept });
    await g.ctx.close();
    // a forwarded nudge link on a phone whose profile is someone else on the trip: never greeted as Anjo
    const d = await phone('fresh', { worker: true, url: '?idea=' + A + '#m=anjo-z5', ls: { pialax_ui_v1: { v1read: 1 }, pialax_me_profile_v1: { label: '🌽 Mom & Dad' } } });
    await settle(d.page, 200);
    const dp = await popupId(d.page), dOut = await d.page.$eval('#sheet .tile.hint', (e) => e.getAttribute('data-code')).catch(() => null);
    const dw = await measurePopup(d.page, 'forwarded nudge link on Dad\'s phone › P-face (Mom & Dad outlined, Anjo marked)');
    check(dp === 'P-face' && dOut === 'momdad-k3' && dw.join(' ').indexOf('Who are you?') >= 0,
      'PIA-137 Anjo\'s nudge link forwarded to Dad\'s phone (profile Mom & Dad) asks "Who are you?" with Mom & Dad outlined: nobody is greeted as Anjo', { dp, dOut });
    await d.ctx.close();
  }
  {
    // AC2 + AC12 the join row: a long name stops at 3 words, the airport takes 3 letters, 📣 hands over the join link only
    const { ctx, page } = await phone('fresh', { url: '?idea=' + B, share: true });
    await settle(page, 200);
    await page.click('#sheet [data-act="joinopen"]'); await settle(page, 80);
    const focus = await page.evaluate(() => (document.activeElement || {}).id);
    await page.type('#join-name', 'Nina Okafor Adaeze Obi', { delay: 0 }); await page.type('#join-ap', 'bos', { delay: 0 });
    const vals = await page.evaluate(() => [document.querySelector('#join-name').value, document.querySelector('#join-ap').value]);
    await measurePopup(page, 'P-face › 🙋＋ join row (typed)');
    await labelCheck(page, 'P-face › join row', 'join-face', 'sheet');
    await page.click('#sheet [data-act="joinshare"]'); await settle(page, 200);
    const shared = await page.evaluate(() => window.__shared || []);
    check(focus === 'join-name' && vals[0].trim() === 'Nina Okafor Adaeze' && vals[1] === 'BOS' && shared.length === 1 && Object.keys(shared[0]).join() === 'url' &&
      /\?idea=thTahoeSkiWeekend26b02&add=Nina%20Okafor%20Adaeze\.BOS$/.test(shared[0].url) && !/app\.html/.test(shared[0].url) && (await popupId(page)) === null,
      'PIA-137 AC2 🙋＋ focuses the name, which stops at 3 words; the airport takes 3 letters; 📣 shares the app folder\'s ?idea=…&add=Nina Okafor Adaeze.BOS (URL only) and closes', { vals, shared });
    await ctx.close();
  }
  {
    // AC3 a host sees their In drawn as unconfirmed (dotted), not pressed
    const { ctx, page } = await phone('host', { url: '?idea=' + TG });
    await settle(page, 200);
    const h = await page.$eval('#screen .ans.in', (e) => ({ cls: e.className, pressed: e.getAttribute('aria-pressed'), outline: getComputedStyle(e).outlineStyle, text: e.textContent }));
    const others = await page.$$eval('#screen .ans', (els) => els.map((e) => e.textContent + ':' + e.getAttribute('aria-pressed')));
    check(/\bdef\b/.test(h.cls) && h.pressed === 'false' && h.outline === 'dotted' && JSON.stringify(others) === JSON.stringify(['In:false', 'Maybe:false', 'Out:false']),
      'PIA-137 AC3 Mom & Dad\'s In is drawn dotted, unconfirmed and not pressed until they tap it; In / Maybe / Out are labelled', { h, others });
    await ctx.close();
  }
  {
    // AC4 / AC7 / AC8 / AC12 the 8-member trip with long names, as its organizer: every person's sheet, a note typed past its cap
    const { ctx, page, net } = await phone('eight', { worker: true, url: '?idea=' + M8 });
    await settle(page, 200);
    const codes = await page.$$eval('#screen .pb [data-act="person"]', (els) => els.map((e) => e.getAttribute('data-code')));
    let proxy = 0, links = 0;
    for (const c of codes) {
      await jsClick(page, '#screen .pb [data-act="person"][data-code="' + c + '"]'); await settle(page, 80);
      await measurePopup(page, '8 long names › P-person ' + c);
      if (await page.$('#sheet [data-act="answer"][data-proxy="1"]')) proxy++;
      if (await page.$('#sheet a[data-k="gf"]')) links++;
      await closeSheet(page);
    }
    await jsClick(page, '#screen .pb [data-act="person"][data-code="bartholomewmontgomeryfitzgera-dj"]'); await settle(page, 80);
    await jsClick(page, '#sheet [data-act="pnote"]'); await settle(page, 100);
    // his note opens to read on the organizer's phone (no field, no keyboard); ✎ (a real tap) makes it a field
    const ro = await page.evaluate(() => ({ field: !!document.querySelector('#sheet textarea'), focus: (document.activeElement || {}).tagName, edit: !!document.querySelector('#sheet [data-act="noteedit"]') }));
    await measurePopup(page, '8 long names › P-note (someone else\'s, read first)');
    await page.click('#sheet [data-act="noteedit"]'); await settle(page, 80);
    check(!ro.field && ro.focus !== 'TEXTAREA' && ro.edit && !!(await page.$('#sheet textarea#note-text')) && !!(await page.$('#sheet [data-act="notesave"]')),
      'PIA-137 the organizer opening someone else\'s note reads it (no field, no keyboard); ✎ makes it a field with ✓ to save', ro);
    await page.fill('#note-text', '');
    await page.type('#note-text', Array.from({ length: 25 }, (_, i) => 'w' + i + 'x').join(' '), { delay: 0 });
    const typed = await page.$eval('#note-text', (e) => e.value);
    await measurePopup(page, '8 long names › P-note (the organizer, typed past 20 words)');
    const p0 = net.posts;
    await closeSheet(page); await settle(page, 400);
    const r = JSON.parse(net.kv.map.get('idea:' + M8)).responses['bartholomewmontgomeryfitzgera-dj'];
    const nw = typed.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
    check(codes.length === 8 && proxy === 7 && links >= 4 && nw === 20 && net.posts - p0 === 1 && r.note === '📞 ' + typed.trim() && r.available_from === '2026-12-10' && r.origin === 'ORD',
      'PIA-137 AC7 / AC8 the organizer opens all 8 sheets (an answer row, 📞, on each but his own; each traveler\'s link), and a note typed for Bartholomew stops at 20 words and saves marked 📞 with his days and origin kept', { proxy, links, nw, note: r.note.slice(0, 40) });
    await jsClick(page, '#screen [data-act="stage"]'); await settle(page, 80);
    const names = await page.evaluate(() => [...document.querySelectorAll('#sheet .srow')].map((e) => e.lastElementChild.textContent.trim()));
    await measurePopup(page, '8 long names › P-stage');
    await closeSheet(page);
    check(names.join('|') === 'Idea|Asking|Dates set|Booking|Done', 'P-stage names the five stages', names);
    await ctx.close();
  }
  {
    // AC6 / AC7 / AC11 the set Christmas trip (organizer: 🎫 marks, Book), the paid New Year trip (closed: 🏁, Flighty)
    const { ctx, page } = await phone('lockorg', { url: '?idea=' + LK });
    await settle(page, 200);
    const o = await page.evaluate(() => ({
      tk: [...document.querySelectorAll('#screen .pb [data-act="booked"]')].map((e) => e.getAttribute('data-code')),
      book: !!document.querySelector('#screen .split.prim a[data-k="gf"]') && /Book/.test((document.querySelector('#screen .split.prim') || {}).textContent || ''),
      mine: !!document.querySelector('#screen .split.prim [data-act="mybook"]'), drive: !!document.querySelector('#screen [data-k="drive"]') }));
    await jsClick(page, '#screen .pb [data-act="booked"][data-code="anjo-k4"]'); await settle(page, 100);
    const armed = await page.$eval('#screen .pb [data-act="booked"][data-code="anjo-k4"]', (e) => e.className + '|' + e.getAttribute('aria-label'));
    await measureScreen(page, 'set trip › a 🎫 waiting for its confirming tap');
    check(JSON.stringify(o.tk) === JSON.stringify(['leo-k3', 'anjo-k4', 'sam-k5']) && o.book && o.mine && o.drive && /arm/.test(armed) && /Confirm booked/.test(armed),
      'PIA-137 AC6 / AC7 once the dates are set the organizer\'s primary is [✈ Book ↗ | 🎫], and his 🎫 marks sit on other travelers\' rows (not the host, not his own); Anjo, who has not answered, needs a confirming tap', { o, armed });
    await ctx.close();
    const g = await phone('portal', { url: '?idea=' + PD });
    await settle(g.page, 200);
    const p = await g.page.evaluate(() => ({ closed: (document.querySelector('#screen .closed') || {}).textContent, answers: document.querySelectorAll('#screen [data-act="answer"]').length,
      flighty: !!document.querySelector('#screen .split.prim a[data-k="flighty"]'), dollars: document.querySelector('#screen').textContent.indexOf('$') }));
    await measureScreen(g.page, 'paid trip › closed');
    await jsClick(g.page, '#screen .me [data-act="person"]'); await settle(g.page, 80);
    const mine = await g.page.evaluate(() => ({ legair: document.querySelectorAll('#sheet [data-act="legair"]').length, unbook: !!document.querySelector('#sheet [data-act="unbook"]') }));
    await measurePopup(g.page, 'paid trip › my P-person');
    check(p.closed === '🏁' && p.answers === 0 && p.flighty && p.dollars < 0 && mine.legair === 0 && !mine.unbook,
      'PIA-137 AC11 a paid trip shows 🏁 instead of the answer row (no taps that would fail), keeps my Flighty hand-off, and its sheets offer no airport cell or 🎫 to change', { p, mine });
    await g.ctx.close();
  }

  section('PIA-137 fix pass: real taps (hit-tested, scrolled into view) on the trip view\'s controls, through the real Worker');
  {
    const { ctx, page, net } = await phone('lockorg', { worker: true, url: '?idea=' + LK, share: true });
    await settle(page, 200);
    const hit = async (sel) => { try { await page.click(sel, { timeout: 4000 }); await settle(page, 150); return true; } catch (e) { return false; } };
    const rec = () => JSON.parse(net.kv.map.get('idea:' + LK)).responses;
    const r = {};
    r.ring = await hit('#screen [data-act="ring"]');
    r.face = await hit('#screen .pb [data-act="person"][data-code="anjo-k4"]'); r.facePop = await popupId(page);
    await closeSheet(page);
    r.refocus = await page.evaluate(() => { const a = document.activeElement; return a && a.getAttribute('data-act') === 'person' ? a.getAttribute('data-code') : null; });
    r.stage = await hit('#screen [data-act="stage"]'); r.stagePop = await popupId(page); await closeSheet(page);
    r.swap = await hit('#screen .me [data-act="face"]'); r.swapPop = await popupId(page); await closeSheet(page);
    const p0 = net.posts;
    r.tk = await hit('#screen .pb [data-act="booked"][data-code="leo-k3"]'); await settle(page, 300);
    r.tkPosts = net.posts - p0; r.leoBooked = rec()['leo-k3'].booked === true;
    r.arm = await hit('#screen .pb [data-act="booked"][data-code="anjo-k4"]');
    r.armed = await page.$eval('#screen .pb [data-act="booked"][data-code="anjo-k4"]', (e) => e.classList.contains('arm') && !!e.querySelector('.cfm'));
    r.other = await hit('#screen [data-act="ring"]');
    r.disarmed = await page.$eval('#screen .pb [data-act="booked"][data-code="anjo-k4"]', (e) => !e.classList.contains('arm'));
    r.armPosts = net.posts - p0;
    // my own sheet: a 🛫 cell (focus stays on that very cell), where I fly from (a city is refused, a code saves)
    r.mine = await hit('#screen .me [data-act="person"]');
    r.cell = await hit('#sheet [data-act="legair"][data-end="1"][data-v="PIA"]'); await settle(page, 300);
    r.cellFocus = await page.evaluate(() => { const a = document.activeElement; return a && a.getAttribute('data-act') === 'legair' ? a.getAttribute('data-end') + a.getAttribute('data-v') : null; });
    r.leave = rec()['ashwin-k1'].leave_from;
    r.orig = await hit('#sheet [data-act="origedit"]');
    r.selAll = await page.evaluate(() => { const f = document.querySelector('#orig-code'); return !!f && document.activeElement === f && f.selectionStart === 0 && f.selectionEnd === f.value.length && f.value.length === 3; });
    await page.keyboard.type('San Francisco', { delay: 0 });
    r.cut = await page.evaluate(() => ({ v: document.querySelector('#orig-code').value, warn: !document.querySelector('#warn-orig-code').hidden }));
    await measurePopup(page, 'set trip › my P-person, a city typed where I fly from (⚠)');
    await page.keyboard.press('Enter'); await settle(page, 150);
    r.refused = !!(await page.$('#orig-code')) && rec()['ashwin-k1'].origin === 'LAX';
    await page.fill('#orig-code', ''); await page.type('#orig-code', 'BUR', { delay: 0 });
    await page.keyboard.press('Enter'); await settle(page, 400);
    r.origin = rec()['ashwin-k1'].origin;
    await closeSheet(page);
    // my note from the me line (📝＋), saved with ✓
    r.note = await hit('#screen .me [data-act="pnote"]'); r.notePop = await popupId(page);
    await page.type('#note-text', 'Landing late Monday', { delay: 0 });
    r.save = await hit('#sheet [data-act="notesave"]'); await settle(page, 300);
    r.noteSaved = rec()['ashwin-k1'].note; r.toast = await page.evaluate(() => { const t = document.querySelector('#toast'); return t && !t.hidden ? t.textContent : ''; });
    r.answer = await hit('#screen .answers [data-act="answer"][data-v="maybe"]'); await settle(page, 400);
    r.status = rec()['ashwin-k1'].status;
    await measureScreen(page, 'set trip › after my real taps');
    check(r.ring && r.face && r.facePop === 'P-person' && r.refocus === 'anjo-k4' && r.stage && r.stagePop === 'P-stage' && r.swap && r.swapPop === 'P-face' &&
      r.tk && r.tkPosts === 1 && r.leoBooked && r.arm && r.armed && r.other && r.disarmed && r.armPosts === 1 &&
      r.mine && r.cell && r.cellFocus === '1PIA' && r.leave === '' && r.orig && r.selAll && r.cut.v === 'SAN' && r.cut.warn && r.refused && r.origin === 'BUR' &&
      r.note && r.notePop === 'P-note' && r.save && r.noteSaved === 'Landing late Monday' && r.toast.indexOf('📝✓') >= 0 && r.answer && r.status === 'maybe',
      'PIA-137 real taps reach every new control: the heads ring, a board face (P-person; ⌄ gives focus back to that face), the stage, ⇄, the 🎫 for Leo (one write), Anjo\'s 🎫 armed with ✓ and put back by the next tap, my 🛫 PIA cell (focus stays on it), where I fly from (all selected; a city is cut and refused, BUR saves), my note from the me line saved with ✓ (📝✓), and Maybe', r);
    await ctx.close();
  }
  {
    // the organizer's 📣 stops pulsing the moment it is shared (nobody is waiting once he has answered for Anjo)
    const { ctx, page } = await phone('organizer', { worker: true, url: '?idea=' + A, share: true });
    await settle(page, 200);
    await page.click('#screen .pb [data-act="person"][data-code="anjo-z5"]'); await settle(page, 120);
    await page.click('#sheet [data-act="answer"][data-v="maybe"][data-proxy="1"]'); await settle(page, 400);
    await closeSheet(page);
    const sel = '#screen .split.prim [data-act="tshare"]';
    const before = await page.$eval(sel, (e) => e.classList.contains('pulse'));
    await page.click(sel); await settle(page, 80);
    const after = await page.$eval(sel, (e) => e.classList.contains('pulse')), shared = await page.evaluate(() => window.__shared || []);
    check(before && !after && shared.length === 1 && /\/i\/dwDiwaliRaleigh2026a01$/.test(shared[0].url),
      'PIA-137 the organizer\'s 📣 Share pulses until it is shared, and stops at once when it is (no other render needed)', { before, after, shared });
    await ctx.close();
  }

  section('PIA-138 dates: the one picker with real clicks (±1 on the trip view, P-dates, P-day, a leg at a time), through the real Worker');
  {
    // the walk above: P-dates on every trip view of every phone, P-day where a day has people
    const opened = dateLog.filter((x) => x.pid === 'P-dates'), asked = dateLog.filter((x) => x.pid !== 'P-dates');
    check(opened.length >= 20 && dayLog.length >= 15 && dayLog.every((x) => x.words <= POPUP_MAX) && dateLog.some((x) => x.leg) && asked.every((x) => x.nudge && !x.pid) && keyLog.length >= 5,
      'PIA-138 the walk opened P-dates from the plan pill on every trip view of every phone (' + opened.length + ' times; a phone that has not answered gets its answer row pulsed instead, ' + asked.length + ' times), P-day ' + dayLog.length + ' times (8 long-named faces at most ' + Math.max.apply(null, dayLog.map((x) => x.words)) + ' words), its ⓘ key ' + keyLog.length + ' times, and a person\'s leg', { asked: asked.slice(0, 3), day: dayLog.slice(0, 2) });
  }
  {
    const { ctx, page, net } = await phone('diwali', { worker: true, url: '?idea=' + A });
    await settle(page, 200);
    const kv = () => JSON.parse(net.kv.map.get('idea:' + A));
    const gfDates = async () => { const href = await page.$eval('#screen .split.prim a[data-k="gf"]', (e) => e.href).catch(() => ''); const d = MODEL.gfDecode(href); return d ? d.legs.map((L) => L.date) : null; };
    const r = {};
    r.link0 = await gfDates();
    const p0 = net.posts;
    await page.click('#screen .daterow [data-act="shift"][data-v="1"]'); await settle(page, 80);
    r.pill = await page.$eval('#screen .daterow [data-act="dates"]', (e) => e.textContent.replace(/\s+/g, ' ').trim());
    r.link1 = await gfDates();
    r.focus = await page.evaluate(() => { const a = document.activeElement; return a ? a.getAttribute('data-act') + a.getAttribute('data-v') : null; });
    r.early = net.posts - p0;
    await measureScreen(page, 'diwali › trip view after +1 (before the write)');
    await page.click('#screen .daterow [data-act="shift"][data-v="1"]'); await settle(page, 60);
    r.blocked = await page.$eval('#screen .daterow [data-act="shift"][data-v="1"]', (e) => [e.getAttribute('aria-disabled'), e.getAttribute('data-lbl'), e.textContent]);
    // a tap on the disabled +1 says why (its label), and so does a long press; nothing moves
    await page.click('#screen .daterow [data-act="shift"][data-v="1"]', { force: true }); await settle(page, 60);
    r.why = await page.evaluate(() => { const b = document.querySelector('#lbl'); return b && !b.hidden ? b.textContent : null; });
    await measurePopup(page, 'diwali › the disabled +1 explains itself', '#lbl');
    await page.click('#screen .daterow [data-act="shift"][data-v="-1"]'); await settle(page, 1300);
    r.posts = net.posts - p0; r.plan = MODEL.docPlan(kv());
    check(eq(r.link0, ['2026-11-06', '2026-11-09']) && /11\/7–11\/10/.test(r.pill) && eq(r.link1, ['2026-11-07', '2026-11-10']) && r.focus === 'shift1' && r.early === 0 &&
      r.blocked[0] === 'true' && r.blocked[1] === 'Event day outside' && r.blocked[2] === '📌⚠' && r.why === 'Event day outside' && r.posts === 1 && eq(r.plan, { s: '2026-11-07', e: '2026-11-10' }),
      'PIA-138 AC1/AC2/AC3 a real +1 moves the pill and my ✈↗ to 11/7–11/10 in that render, focus staying on +1; the next +1 would drop 📌 (📌⚠, and a tap says "Event day outside"); +1 +1 −1 is ONE write (11/7–11/10)', r);
    // P-dates: a holiday chip, Save (the sheet stays open), 👥 then a day (P-day)
    await page.click('#screen .daterow [data-act="dates"]'); await settle(page, 120);
    await page.click('#sheet [data-act="dhol"][data-v="2026-11-26"]'); await settle(page, 80);
    const wHol = await measurePopup(page, 'diwali › P-dates after 🦃');
    const n1 = net.posts;
    await page.click('#sheet [data-act="dsave"]'); await page.click('#sheet [data-act="dsave"]', { force: true }).catch(() => {}); await settle(page, 500);
    const k1 = kv();
    r.saved = { posts: net.posts - n1, plan: MODEL.docPlan(k1), notes: k1.idea.notes, pop: await popupId(page), save: await page.$eval('#sheet [data-act="dsave"]', (e) => e.getAttribute('data-lbl')) };
    await page.click('#sheet [data-act="dlook"]'); await settle(page, 60);
    await page.click('#sheet [data-act="dday"][data-v="2026-11-27"]'); await settle(page, 100);
    r.day = { pop: await popupId(page), faces: (await page.$$('#sheet .dayf')).length, n: await page.$eval('#sheet .dayn', (e) => e.textContent.trim()), dim: (await page.$$('#sheet .dayf.dimf')).length };
    await measurePopup(page, 'diwali › P-day 11/27');
    await page.click('#sheet [data-act="sh-back"]'); await settle(page, 80);
    await closeSheet(page);
    check(wHol.length <= POPUP_MAX && r.saved.posts === 1 && eq(r.saved.plan, { s: '2026-11-25', e: '2026-11-29' }) && /^📌2026-11-26 /.test(r.saved.notes) && r.saved.pop === 'P-dates' && r.saved.save === 'Saved' &&
      r.day.pop === 'P-day' && r.day.faces === 3 && r.day.n === '👥3' && r.day.dim === 1,
      'PIA-138 AC2/AC3 🦃 picks Wed 11/25–Sun 11/29 with 📌 11/26; Save (tapped twice) is one write and the sheet stays open (✓ "Saved"); 👥 then 11/27 opens P-day: 3 there (Anjo, who has not answered, dimmed)', { saved: r.saved, day: r.day });
    // one leg at a time (P-person): Mom & Dad's 🛬 −1, focus stays, one write
    await page.click('#screen .pb [data-act="person"][data-code="momdad-k3"]'); await settle(page, 120);
    const n2 = net.posts;
    await page.click('#sheet [data-act="legshift"][data-end="0"][data-v="-1"]'); await settle(page, 60);
    const lf = await page.evaluate(() => { const a = document.activeElement; return a ? [a.getAttribute('data-act'), a.getAttribute('data-end'), a.getAttribute('data-v')].join() : null; });
    const own = await page.$eval('#sheet [data-act="dates"][data-end="0"]', (e) => [e.textContent, e.classList.contains('own')]);
    await measurePopup(page, 'diwali › Mom & Dad\'s P-person after 🛬 −1');
    await settle(page, 1300);
    const md = kv().responses['momdad-k3'];
    check(lf === 'legshift,0,-1' && own[0] === '11/24⚠' && own[1] && net.posts - n2 === 1 && md.available_from === '2026-11-24' && md.available_to === '' && md.note === '📞',
      'PIA-138 AC4 the organizer moves Mom & Dad\'s 🛬 a day earlier (11/24, now their own, underlined, and PIA-151: ⚠ outside the plan, allowed; focus stays on −1): one answer, their leave end still following the plan, marked 📞', { lf, own, md });
    await closeSheet(page);
    await ctx.close();
  }
  {
    // a reload within SOON_MS of a +1 (pagehide comes first, then hidden): nothing is sent from what the page read earlier;
    // the reloaded page sends the kept run from a fresh read, where a lock another phone made meanwhile holds
    const { ctx, page, net } = await phone('diwali', { worker: true, url: '?idea=' + A });
    await settle(page, 200);
    const kv = () => JSON.parse(net.kv.map.get('idea:' + A));
    const stage = (st) => { const d = kv(); d.decision = Object.assign({}, d.decision, st === 'chosen' ? { stage: 'chosen', chosen: { airport: 'RDU', city: 'Raleigh', departure: '2026-11-06', return: '2026-11-09' }, chosen_at: '2026-10-17T18:00:00.000Z' } : { stage: 'proposed', chosen: null, chosen_at: null }); net.kv.map.set('idea:' + A, JSON.stringify(d)); };
    const kept = () => page.evaluate(() => localStorage.getItem('pialax_soon_v2'));
    stage('chosen');   // another organizer phone locks the dates; this one has not seen it
    const p0 = net.posts;
    await page.click('#screen .daterow [data-act="shift"][data-v="1"]'); await settle(page, 60);
    await page.reload({ waitUntil: 'load' }); await settle(page, 900);
    const r = { posts: net.posts - p0, plan: MODEL.docPlan(kv()), stage: kv().decision.stage, pop: await popupId(page), kept: await kept() };
    r.words = r.pop ? (await measurePopup(page, 'diwali › P-error: a reload\'s kept +1 held by a lock made meanwhile')).join(' ') : '';
    check(r.posts === 0 && eq(r.plan, { s: '2026-11-06', e: '2026-11-09' }) && r.stage === 'chosen' && r.pop === 'P-error' && /Dates locked/.test(r.words) && r.kept === null,
      'PIA-138 AC3 a +1 then a reload in Chromium, after another phone locked: no write as the page goes, none from the reloaded page (the plan stays 11/6–11/9, 🔒), which says 🔒 "Dates locked"; nothing is kept', r);
    await closeSheet(page);
    stage('proposed');   // unlocked again, read by this phone: the same +1 and reload now moves the plan, from a fresh read
    await page.reload({ waitUntil: 'load' }); await settle(page, 400);
    const p1 = net.posts, g1 = net.gets;
    await page.click('#screen .daterow [data-act="shift"][data-v="1"]'); await settle(page, 60);
    await page.reload({ waitUntil: 'load' }); await settle(page, 900);
    const c = { posts: net.posts - p1, gets: net.gets - g1, plan: MODEL.docPlan(kv()), pop: await popupId(page), kept: await kept(), pill: await page.$eval('#screen .daterow [data-act="dates"]', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '') };
    check(c.posts === 1 && c.gets >= 2 && eq(c.plan, { s: '2026-11-07', e: '2026-11-10' }) && !c.pop && c.kept === null && /11\/7–11\/10/.test(c.pill),
      'PIA-138 AC3 the same +1 then reload on an open plan: the reloaded page reads the trip and sends ONE update (11/7–11/10, drawn on its pill); nothing is kept', c);
    await ctx.close();
  }
  {
    // someone who has not answered: the pill pulses the answer row (no picker); after answering, the pill opens their own days
    const { ctx, page, net } = await phone('guest', { worker: true, url: '?idea=' + A });
    await settle(page, 200);
    await page.click('#screen .daterow [data-act="dates"]'); await settle(page, 60);
    const before = { pop: await popupId(page), nudge: await page.evaluate(() => !!document.querySelector('#screen .answers.nudge')),
      toast: await page.$eval('#toast', (e) => (e.hidden ? null : e.textContent.trim())).catch(() => null) };
    const wt = await measurePopup(page, 'guest › her pill before she answers (the toast)', '#toast');
    await page.click('#screen [data-act="answer"][data-v="maybe"]'); await settle(page, 400);
    await page.click('#screen .daterow [data-act="dates"]'); await settle(page, 120);
    const after = { pop: await popupId(page), me: await page.$eval('#sheet [data-act="dend"][data-v="both"]', (e) => e.getAttribute('aria-pressed')).catch(() => null) };
    await page.click('#sheet [data-act="dday"][data-v="2026-11-05"]'); await page.click('#sheet [data-act="dday"][data-v="2026-11-08"]'); await settle(page, 60);
    const w = await measurePopup(page, 'guest › my own days picked (⚠🗓 off the plan)');
    const amber = await page.$eval('#sheet .readout [data-k="offplan"]', (e) => [e.textContent, getComputedStyle(e).color, getComputedStyle(document.documentElement).getPropertyValue('--maybe').trim()]).catch(() => null);
    await page.click('#sheet [data-act="dsave"]'); await settle(page, 400);
    const r = JSON.parse(net.kv.map.get('idea:' + A)).responses['anjo-z5'];
    check(before.pop === null && before.nudge && before.toast === '👋 In / Maybe / Out' && wt.length <= POPUP_MAX && after.pop === 'P-dates' && after.me === 'true' && w.length <= POPUP_MAX &&
      !!amber && amber[0] === '⚠🗓' && r.status === 'maybe' && r.available_from === '2026-11-05' && r.available_to === '2026-11-08',
      'PIA-138 AC4 before Anjo answers, her pill only pulses the answer row and says so ("👋 In / Maybe / Out"); after Maybe it opens her own days: 11/5 then 11/8 (⚠🗓 "Outside plan", amber), Save (her Maybe kept)', { before, after, amber, r });
    await ctx.close();
  }
  {
    // PIA-138 fix pass, on the 8-member long-name trip (Bartholomew has booked): P-dates names all seven weekdays, keeps 🔒 and
    // Save in view at 360x740 and 375x667, explains itself (ⓘ: its grid's marks), asks its confirming taps in one word
    // (Confirm), says Saving while a write is out (◷, focus kept), shows ✓ once saved, and a pick closed without Save comes
    // back with ↩. Every state is counted.
    const { ctx, page, net } = await phone('eight', { worker: true, url: '?idea=' + M8 });
    const kv0 = JSON.parse(net.kv.map.get('idea:' + M8));
    kv0.responses['bartholomewmontgomeryfitzgera-dj'].booked = true; kv0.responses['bartholomewmontgomeryfitzgera-dj'].booked_at = '2026-10-16T12:00:00.000Z';
    net.kv.map.set('idea:' + M8, JSON.stringify(kv0));
    await page.reload({ waitUntil: 'load' }); await settle(page, 300);
    const r = {};
    await page.click('#screen .daterow [data-act="dates"]'); await settle(page, 150);
    r.pop = await popupId(page);
    r.days = await page.$$eval('#sheet .grid .wd', (els) => els.map((e) => e.textContent.trim()).join(' '));
    await measurePopup(page, '8 long names › P-dates (all seven weekdays)');
    // ⓘ: P-key read over this sheet (‹ comes back)
    await page.click('#sheet [data-act="dkey"]'); await settle(page, 120);
    r.key = { pop: await popupId(page), items: await page.$$eval('#sheet .legend .li', (els) => els.map((e) => e.textContent.trim())) };
    await measurePopup(page, '8 long names › P-key over P-dates');
    for (let pg = 2; pg <= 4 && (await page.$('#sheet [data-act="kpage"][data-v="1"]:not([disabled])')); pg++) {
      await page.click('#sheet [data-act="kpage"][data-v="1"]'); await settle(page, 80); await measurePopup(page, '8 long names › P-key over P-dates, page ' + pg);
      r.key.items = r.key.items.concat(await page.$$eval('#sheet .legend .li', (els) => els.map((e) => e.textContent.trim())));
    }
    await page.click('#sheet [data-act="sh-back"]'); await settle(page, 120);
    r.back = await popupId(page);
    // a holiday, then Save: someone booked, so it asks first, in a word
    await page.click('#sheet [data-act="dhol"]'); await settle(page, 80);
    await page.click('#sheet [data-act="dsave"]'); await settle(page, 80);
    r.armSave = await page.$eval('#sheet [data-act="dsave"]', (e) => e.textContent.replace(/\s+/g, ' ').trim());
    await measurePopup(page, '8 long names › P-dates, Save asking (⚠ 🎫×1 Confirm)');
    await page.click('#sheet [data-act="dlock"]'); await settle(page, 80);
    r.armLock = await page.$eval('#sheet [data-act="dlock"]', (e) => e.textContent.replace(/\s+/g, ' ').trim());
    await measurePopup(page, '8 long names › P-dates, 🔒 asking (⚠🎫×1 Confirm)');
    // closed without Save: 🗑, and ↩ brings the pick back
    await closeSheet(page); await settle(page, 100);
    r.lost = await page.$eval('#toast', (e) => (e.hidden ? null : e.textContent.trim())).catch(() => null);
    await measurePopup(page, '8 long names › the toast for a pick not saved', '#toast');
    await page.click('#toast [data-act="undo"]'); await settle(page, 150);
    r.undo = { pop: await popupId(page), save: await page.$eval('#sheet [data-act="dsave"]', (e) => e.getAttribute('data-lbl') || e.textContent.trim()).catch(() => null) };
    // Save → its confirming tap → the write held out: ◷ Saving everywhere, focus kept; then ✓ Saved
    let release; net.holdPost = new Promise((res) => { release = res; });
    await page.click('#sheet [data-act="dsave"]'); await settle(page, 60);
    const n0 = net.posts;
    await page.click('#sheet [data-act="dsave"]'); await settle(page, 150);
    r.busy = await page.evaluate(() => ({ save: (document.querySelector('#sheet [data-act="dsave"]') || {}).textContent, busy: (document.querySelector('#sheet [data-act="dsave"]') || { getAttribute() {} }).getAttribute('aria-busy'),
      focus: (document.activeElement || {}).getAttribute ? document.activeElement.getAttribute('data-act') : null, native: document.querySelectorAll('#sheet button[disabled]').length,
      saying: document.querySelectorAll('#sheet [data-lbl="Saving"]').length }));
    await measurePopup(page, '8 long names › P-dates while Save is out (◷, Saving)');
    net.holdPost = null; release(); await settle(page, 700);
    r.saved = { posts: net.posts - n0, save: await page.$eval('#sheet [data-act="dsave"]', (e) => e.getAttribute('data-lbl')).catch(() => null), focus: await page.evaluate(() => (document.activeElement || {}).getAttribute ? document.activeElement.getAttribute('data-act') : null) };
    await measurePopup(page, '8 long names › P-dates once saved (✓ Saved)');
    const doc = JSON.parse(net.kv.map.get('idea:' + M8));
    check(r.pop === 'P-dates' && r.days === 'Sun Mon Tue Wed Thu Fri Sat' && r.key.pop === 'P-key' && r.key.items.some((t) => /People there/.test(t)) && r.key.items.some((t) => /There/.test(t)) && r.back === 'P-dates' &&
      /^⚠ 🎫×1 Confirm$/.test(r.armSave) && /^⚠🎫×1 Confirm$/.test(r.armLock) && r.lost === '🗑↩' && r.undo.pop === 'P-dates' && r.undo.save !== 'No change' &&
      r.busy.save === '◷' && r.busy.busy === 'true' && r.busy.focus === 'dsave' && r.busy.native === 0 && r.busy.saying >= 10 && r.saved.posts >= 1 && r.saved.save === 'Saved' && r.saved.focus === 'dsave' &&
      doc.responses['bartholomewmontgomeryfitzgera-dj'].available_from === '2026-12-10' && doc.responses['bartholomewmontgomeryfitzgera-dj'].booked === true,
      'PIA-138 on the 8-member trip: all seven weekdays named; ⓘ explains the grid (P-key over P-dates, ‹ back); with a 🎫 Save and 🔒 ask in a word (⚠🎫×1 Confirm); a pick closed unsaved toasts 🗑 and ↩ restores it; while Save is out it is ◷ (focus kept, no native disabled, the rest say Saving); then ✓ Saved', r);
    // P-dates fits short phones: 🔒 and Save are where a finger lands (nothing under Save, which never shows through)
    for (const vp of [{ width: 360, height: 740 }, { width: 375, height: 667 }]) {
      await closeSheet(page);
      await page.setViewportSize(vp); await settle(page, 120);
      await page.click('#screen .daterow [data-act="dates"]'); await settle(page, 150);
      const o = await page.evaluate(() => {
        const sh = document.querySelector('#sheet'), R = sh.getBoundingClientRect(), save = sh.querySelector('.btn.stick'), sv = save.getBoundingClientRect(), hd = sh.querySelector('.sh-hd').getBoundingClientRect();
        const lock = sh.querySelector('[data-act="dlock"]'), lr = lock.getBoundingClientRect(), hit = (el) => { const r = el.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === el || el.contains(t)); };
        return { lock: hit(lock) && lr.bottom <= sv.top - 4, save: hit(save) && sv.bottom <= R.bottom + 1, opaque: getComputedStyle(save).opacity, top: hd.bottom <= lr.top };
      });
      await measurePopup(page, '8 long names › P-dates @' + vp.width + 'x' + vp.height);
      check(o.lock && o.save && o.opaque === '1' && o.top, 'PIA-138 P-dates @' + vp.width + 'x' + vp.height + ' on the 8-member trip: 🔒 is in view and takes the tap (never under Save), Save takes its own, and Save is opaque', o);
    }
    await ctx.close();
  }

  section('PIA-139 booking with real clicks through the real Worker: Book and 🎫, the 🎫 inviting its tap on the way back, Flighty, times on the pickups, 💵, calendars');
  {
    // the walk above: time fields, 💵 and P-calendar-add on every phone that has them, at every width
    const sec = (s) => s.replace(/\r?\n /g, '');
    const secret = calLog.filter((c) => [KEY, TOKEN, '#k=', 't=' + TOKEN].some((x) => c.ics.indexOf(x) >= 0 || c.g.indexOf(x) >= 0));
    const onlyGuest = calLog.every((c) => { const links = sec(c.ics).match(/https?:\/\/[^\s\\]+/g) || []; return links.length === 1 && /^https:\/\/pialax-proxy\.ashwinyedavalli\.workers\.dev\/i\/[A-Za-z0-9_-]{22}$/.test(links[0]) && /details=https%3A%2F%2Fpialax-proxy\.ashwinyedavalli\.workers\.dev%2Fi%2F/.test(c.g); });
    check(timesLog.length >= 2 && timesLog.every((x) => / halves$/.test(x)) && paidLog.some((x) => x.arm === 'Confirm') && paidLog.some((x) => x.why === 'Not everyone booked') && calLog.length >= 20 && calLog.every((c) => c.pid === 'P-calendar-add') && secret.length === 0 && onlyGuest &&
      calLog.some((c) => c.tq) && calLog.some((c) => !c.tq),
      'PIA-139 the walk counted the 🛬 / 🛫 time fields typed in (' + timesLog.length + ' times), P-stage\'s 💵 typed and asking first (and greyed with why elsewhere), and P-calendar-add from the nav ' + calLog.length + ' times (tentative ? and set): every event carries only the guest /i/<id> link, never the key or token',
      { times: timesLog.length, paid: paidLog.slice(0, 3), cal: calLog.length, secret: secret.slice(0, 2) });
  }
  {
    // AC1 Leo on the set Christmas trip: [✈ Book ↗ | 🎫]; a Book tap (the hand-off itself is not followed: offline), the app hidden and
    // shown again, and the 🎫 glows; a real tap on it marks him booked through the Worker, and the slot is Flighty's
    const { ctx, page, net } = await phone('booked', { worker: true, url: '?idea=' + LK });
    await settle(page, 200);
    const rec = () => JSON.parse(net.kv.map.get('idea:' + LK)).responses;
    const vis = (v) => page.evaluate((st) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => st }); document.dispatchEvent(new Event('visibilitychange')); }, v);
    const r = {};
    r.split = await page.evaluate(() => { const p = document.querySelector('#screen .split.prim'); return p ? [...p.children].map((e) => (e.getAttribute('data-k') || '') + ':' + (e.getAttribute('data-act') || e.getAttribute('data-ret') && 'ret' || '')) : []; });
    r.glow0 = !!(await page.$('#screen .split.prim .glow'));
    await page.$eval('#screen .split.prim a[data-ret]', (a) => { a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); });
    await vis('hidden'); await settle(page, 60); await vis('visible'); await settle(page, 120);
    r.glow = await page.$eval('#screen .split.prim [data-act="mybook"]', (e) => e.classList.contains('glow') + '|' + e.getAttribute('aria-label')).catch(() => '');
    await measureScreen(page, 'set trip › back from Google Flights, the 🎫 glowing');
    const p0 = net.posts;
    await page.click('#screen .split.prim [data-act="mybook"]'); await settle(page, 400);
    r.posts = net.posts - p0; r.booked = rec()['leo-k3'].booked === true;
    r.after = await page.evaluate(() => { const p = document.querySelector('#screen .split.prim'); return p ? [...p.children].map((e) => e.getAttribute('data-k') + ':' + e.tagName.toLowerCase()).join(',') : ''; });
    r.pulse = await page.$eval('#screen .split.prim [data-act="mytimes"]', (e) => e.classList.contains('pulse')).catch(() => false);
    await measureScreen(page, 'set trip › booked: my flight times and Flighty');
    // the bar's 🎫 🛬 ––:–– is a button: it opens his own sheet with 🛬 focused
    await page.click('#screen .split.prim [data-act="mytimes"]'); await settle(page, 150);
    r.focus = await page.evaluate(() => (document.activeElement || {}).id || '');
    r.fields = !!(await page.$('#sheet #tm-arr')) && !!(await page.$('#sheet #tm-dep'));
    await page.type('#sheet #tm-arr', '0905', { delay: 0 }); await page.keyboard.press('Enter'); await page.type('#sheet #tm-dep', '1720', { delay: 0 });
    await measurePopup(page, 'set trip › my P-person, times typed');
    // taking his 🎫 back asks, and keeps asking past 6s until another tap (nothing is sent here: ⌄ puts it back)
    const u0 = net.posts;
    await page.click('#sheet [data-act="unbook"]'); await settle(page, 120);
    await measurePopup(page, 'set trip › my P-person, taking the 🎫 back (asks)');
    await page.waitForTimeout(6300);
    r.sticky = await page.$eval('#sheet [data-act="unbook"]', (e) => e.getAttribute('aria-label')).catch(() => '');
    await page.click('#sheet [data-act="sh-close"]'); await settle(page, 500);
    r.unbookSent = net.posts - u0 - 1;   // the close sends his times (one write); the 🎫 stays
    r.note = rec()['leo-k3'].note; r.stillBooked = rec()['leo-k3'].booked === true;
    check(eq(r.split, ['gf:ret', 'mybook:mybook']) && !r.glow0 && r.glow === 'true|Booked? Tap to mark' && r.posts === 1 && r.booked && r.after === 'booked:button,flighty:a' && r.pulse && r.focus === 'tm-arr' && r.fields &&
      r.sticky === 'Confirm not booked' && r.unbookSent === 0 && r.stillBooked &&
      r.note === '🛬09:05 🛫17:20 Red-eye Monday night then a train down from Chicago with the kids and the dog',
      'PIA-139 AC1/AC2 Leo\'s [✈ Book ↗ | 🎫]: back from Google Flights the 🎫 glows ("Booked? Tap to mark"), a real tap marks him booked (one write) and the bar becomes [🎫 🛬 ––:–– | ✈⏱↗], the times button pulsing; it opens his sheet at 🛬, where 0905 ↵ 1720 and ⌄ save 🛬09:05 🛫17:20 before his whole note; taking the 🎫 back still asks after 6s, and ⌄ sends nothing of it', r);
    // P-calendar-add from the nav: a set trip is not tentative; the event is the guest link alone
    await jsClick(page, '#screen .nav [data-act="caladd"]'); await settle(page, 100);
    const c = await page.evaluate(() => ({ pid: document.querySelector('#sheet').getAttribute('data-popup'), ics: decodeURIComponent((document.querySelector('#sheet a[download]') || {}).href || ''), file: (document.querySelector('#sheet a[download]') || {}).getAttribute('download'),
      g: (document.querySelector('#sheet a[data-k="gcal"]') || {}).href || '', tq: !!document.querySelector('#sheet .tq'), big: [...document.querySelectorAll('#sheet .split .btn')].map((b) => Math.round(b.getBoundingClientRect().height)) }));
    await measurePopup(page, 'set trip › P-calendar-add');
    check(c.pid === 'P-calendar-add' && /^data:text\/calendar;charset=utf-8,BEGIN:VCALENDAR/.test(c.ics) && /STATUS:CONFIRMED/.test(c.ics) && /DTSTART;VALUE=DATE:20261222\r?\nDTEND;VALUE=DATE:20261228/.test(c.ics) && !c.tq && c.big.every((h) => h >= 56) &&
      /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=%F0%9F%8E%84/.test(c.g) && c.ics.indexOf(KEY) < 0 && c.file === 'christmasatthehernndezvillanuevas.ics',
      'PIA-139 AC6 calendar-plus → P-calendar-add: [📅 .ics] (an all-day event 12/22–12/27, end 12/28, confirmed: the dates are set) and [↗ Google] (Google Calendar\'s form), both 56px', { pid: c.pid, file: c.file, big: c.big, tq: c.tq });
    await closeSheet(page);
    // AC2 Bartholomew on the Done 8-member trip: his times on everyone's Map (one ⏱ run with Anastasia's 15:40), a chip opens that day
    await page.click('#screen [data-act="back"]'); await settle(page, 120);
    await openCard(page, BK); await settle(page, 200);
    await jsClick(page, '#screen .me [data-act="person"]'); await settle(page, 100);
    // "410" (a 12-hour 4:10 PM) is not sent as 04:10: leaving the field asks [☀ 16:10 | 🌃 04:10]; ☀ puts 16:10 there
    await page.fill('#sheet #tm-arr', ''); await page.type('#sheet #tm-arr', '410', { delay: 0 });
    const typingHalves = await page.$eval('#sheet #tm-half', (e) => e.hidden).catch(() => null);
    await page.click('#sheet #tm-dep'); await settle(page, 80);
    const halves = await page.$$eval('#sheet #tm-half [data-act="tmhalf"]', (els) => els.map((e) => e.textContent.trim() + ':' + Math.round(e.getBoundingClientRect().height)));
    await measurePopup(page, 'Done trip › my P-person, ☀ / 🌃 asked for 410');
    await page.click('#sheet [data-act="tmhalf"][data-v="pm"]'); await settle(page, 80);
    const fieldNow = await page.$eval('#sheet #tm-arr', (e) => e.value);
    await page.click('#sheet [data-act="sh-close"]'); await settle(page, 500);
    const bk = JSON.parse(net.kv.map.get('idea:' + BK)).responses['bartholomewmontgomeryfitzgera-dj'];
    check(typingHalves === true && eq(halves.map((x) => x.split(':').slice(0, 2).join(':')), ['☀16:10', '🌃04:10']) && halves.every((x) => +x.split(':').pop() >= 44) && fieldNow === '16:10',
      'PIA-139 AC2 Bartholomew types 410: nothing asks while he types; leaving the field asks [☀16:10 | 🌃04:10] (≥44px, no words), and ☀ puts 16:10 in the field', { typingHalves, halves, fieldNow });
    await page.click('#screen [data-act="back"]'); await settle(page, 100);
    await page.click('#tabbar [data-act="tab"][data-v="map"]'); await settle(page, 150);
    if (await page.$('#screen [data-act="pick"][data-id="' + BK + '"]')) { await page.click('#screen [data-act="pick"][data-id="' + BK + '"]'); await settle(page, 120); }
    const lanes = await page.evaluate(() => [...document.querySelectorAll('#screen .lane')].map((l) => l.querySelector('.lc').textContent + ': ' + [...l.querySelectorAll('.pk')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()).join(' | ') + (l.querySelector('.grp') ? ' ⏱' + l.querySelector('.grp .gh .tn').textContent : '')));
    await measureScreen(page, 'Map › the Done 8-member trip\'s pickups');
    await keyCheck(page, 'Map › pickups'); await labelCheck(page, 'Map › pickups', 'booked-map');
    const corners = await page.$$eval('#screen .pk', (els) => els.filter((e) => e.querySelector('.bk')).length);
    await page.click('#screen .pk.arr'); await settle(page, 120);
    const day = await popupId(page), dayWho = await page.evaluate(() => (document.querySelector('#sheet .mapday') || {}).textContent || '');
    await measurePopup(page, 'Map › a pickup chip › P-day with names and times');
    await closeSheet(page);
    let multi = '';
    if (await page.$('#screen .pk:not([data-code])')) { await page.click('#screen .pk:not([data-code])'); await settle(page, 120); multi = await popupId(page); await measurePopup(page, 'Map › a chip of several › P-day'); await closeSheet(page); }
    check(bk.note === '🛬16:10 🛫18:05 Driving down from Chicago if flights are bad' && bk.booked && lanes.length === 1 && /^SAV: /.test(lanes[0]),
      'PIA-139 AC2 Bartholomew changes his 🛬 to 16:10 (his 🛫 18:05 and note kept); the Map\'s SAV lane shows everyone\'s chips with their times', { note: bk.note, lanes });
    check(lanes.length === 1 && ['16:10', '15:05', '15:40', '18:05', '20:00'].every((x) => lanes[0].indexOf(x) >= 0) && / ⏱0:35$/.test(lanes[0]) && /☀/.test(lanes[0]) && /🌃/.test(lanes[0]) && corners >= 5 &&
      day === 'P-day' && /Bartholomew/.test(dayWho) && /16:10/.test(dayWho) && (multi === '' || multi === 'P-day'),
      'PIA-139 AC2 the pickups read 16:10☀ on 12/10, then 15:05 and 15:40 on 12/11 (one ⏱ pickup run of 0:35), 18:05 and 20:00🌃 on the way home, every booked chip with its 🎫 corner; every chip opens P-day map mode with the travelers and their times', { lanes, corners, day, dayWho, multi });
    await ctx.close();
  }
  {
    // AC5 the organizer of the Done trip records 💵 on his token phone: Save asks first (the hosts have not answered), the confirm pays
    const { ctx, page, net } = await phone('bookorg', { worker: true, url: '?idea=' + BK });
    await settle(page, 200);
    const dec = () => JSON.parse(net.kv.map.get('idea:' + BK)).decision;
    // at 🏁 the trip view itself has 💵 ＋: P-stage opens at the 💵 field
    const door = !!(await page.$('#screen [data-act="paidopen"]'));
    await page.click('#screen [data-act="paidopen"]'); await settle(page, 120);
    const focus = await page.evaluate(() => (document.activeElement || {}).id || '');
    await page.type('#sheet #paid-amt', '1490', { delay: 0 });
    const p0 = net.posts;
    // a quick double tap on Save is one tap: it asks, and the second tap of the pair is dropped
    await page.dblclick('#sheet [data-act="paidsave"]'); await settle(page, 150);
    const dbl = { posts: net.posts - p0, btn: await page.$eval('#sheet [data-act="paidsave"]', (e) => e.textContent).catch(() => '') };
    const ask = await page.evaluate(() => ({ btn: (document.querySelector('#sheet [data-act="paidsave"]') || {}).textContent, faces: (document.querySelector('#sheet .paidw') || {}).textContent,
      label: (document.querySelector('#sheet .paidw') || { getAttribute: () => '' }).getAttribute('aria-label'), amt: (document.querySelector('#sheet #paid-amt') || {}).value }));
    const asked = net.posts === p0;
    await measurePopup(page, 'Done trip › P-stage, 💵 asking first');
    // a long press on ⚠ names it ("Closes answers"), within the popup budget
    const wb = await page.$eval('#sheet .paidw', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(wb.x, wb.y); await page.mouse.down(); await page.waitForTimeout(650);
    ask.lp = await page.evaluate(() => { const b = document.querySelector('#lbl'); return b && !b.hidden ? b.textContent : ''; });
    if (ask.lp) await measurePopup(page, 'Done trip › P-stage, 💵 asking first › P-label', '#lbl');
    await page.mouse.up(); await page.waitForTimeout(450);
    await page.focus('#sheet #paid-amt'); await page.keyboard.press('Enter'); await settle(page, 600);   // ↵ in the field: Confirm
    const d = dec(), shown = await page.evaluate(() => (document.querySelector('#sheet .paidv') || {}).textContent || '');
    await measurePopup(page, 'Done trip › P-stage, 💵 paid');
    // ✎: a typo is fixable (the field again, holding the amount)
    await page.click('#sheet [data-act="paidedit"]'); await settle(page, 100);
    const again = await page.$eval('#sheet #paid-amt', (e) => e.value).catch(() => '');
    await measurePopup(page, 'Done trip › P-stage, 💵 entered again (✎)');
    await closeSheet(page);
    const closed = await page.evaluate(() => ({ closed: (document.querySelector('#screen .closed') || {}).textContent, answers: document.querySelectorAll('#screen [data-act="answer"]').length, door: !!document.querySelector('#screen [data-act="paidopen"]') }));
    await measureScreen(page, 'Done trip › paid: closed');
    check(door && focus === 'paid-amt' && dbl.posts === 0 && dbl.btn === 'Confirm' && asked && ask.btn === 'Confirm' && /⚠/.test(ask.faces) && /🔒/.test(ask.faces) && /^Closes answers and flight times; no answer from /.test(ask.label) && ask.amt === '$1,490' && ask.lp === 'Closes answers' &&
      d.stage === 'booked' && d.actual_total === 1490 && /💵\s*\$1,490/.test(shown) && again === '$1,490' && closed.closed === '🏁' && closed.answers === 0 && !closed.door,
      'PIA-139 AC5 at 🏁 Done the trip view\'s 💵 ＋ opens P-stage at the field; a double tap on Save only asks (⚠ the hosts, 🛬 who has no landing time, 🔒; read out in words; 1490 reads back as $1,490), then ↵ records it through the Worker (booked, $1,490); P-stage reads 💵 $1,490 with ✎ to fix it, and the trip shows 🏁 closed', { door, focus, dbl, ask, d: { stage: d.stage, total: d.actual_total }, shown, again, closed });
    await ctx.close();
  }

  // ═══ PIA-151: my flight, with real clicks through the real Worker ═══
  section('PIA-151 my flight with real clicks through the real Worker: one place per traveler, a one-tap day calendar, 🎫 → landing time, the board\'s final check; the job tap counts');
  {
    // Leo on the set Christmas trip (PIA | ORD, 🔒 12/22–12/27, not booked yet)
    const { ctx, page, net } = await phone('booked', { worker: true, url: '?idea=' + LK });
    await settle(page, 200);
    const rec = () => JSON.parse(net.kv.map.get('idea:' + LK)).responses['leo-k3'];
    const focusId = () => page.evaluate(() => (document.activeElement || {}).id || '');
    // a save's way back is waited for by what it shows (his flight section again, or ⚠ ↻), never a bare sleep; then the app's own
    // 400ms tap hold after a sheet change (TAP_HOLD_MS: a quick second tap is dropped by design) is let pass before the next tap
    const TAP_HOLD = 450;
    const backIn = async () => { await page.waitForFunction(() => { const s = document.querySelector('#sheet'); return !!s && !s.hidden && s.getAttribute('data-popup') === 'P-person'; }, null, { timeout: 8000 }).catch(() => {}); await settle(page, TAP_HOLD); };
    const failedIn = () => page.waitForFunction(() => { const b = document.querySelector('#sheet [data-act="dsave"]'); return !!b && b.textContent.trim() === '⚠ ↻'; }, null, { timeout: 8000 }).catch(() => {});
    const recUntil = async (f) => { for (let i = 0; i < 160 && !f(rec()); i++) await page.waitForTimeout(50); };
    const r = {};
    let taps = 0;
    const tapS = async (sel, ms) => { await page.click(sel); taps++; await settle(page, ms || 150); };          // a tap in the sheet
    const tapJ = async (sel, ms) => { await jsClick(page, sel); taps++; await settle(page, ms || 150); };       // a tap on the screen (the sticky bar may cover a row)
    // AC1 one tap on his own bar: his flight section, its ✈ Book ↗ for exactly the days and airports in its rows, 🎫 beside it
    await tapJ('#screen .pb [data-act="flight"][data-code="leo-k3"]');
    r.open = { pop: await popupId(page), taps, rows: await page.$$eval('#sheet .leg .ld', (els) => els.map((e) => e.textContent.trim())), cells: (await page.$$('#sheet .leg [data-act="legair"]')).length,
      book: await page.$eval('#sheet .split a[data-ret]', (e) => e.href).catch(() => ''), tk: !!(await page.$('#sheet .split a[data-ret] + [data-act="mybook"]')) };
    const dec = MODEL.gfDecode(r.open.book);
    r.open.legs = dec ? dec.legs.map((L) => L.date + ':' + [].concat(L.from).join(',') + '>' + [].concat(L.to).join(',')) : null;
    await measurePopup(page, 'my flight › his flight section (not booked: days following the plan, PIA | ORD, Book | 🎫)');
    // AC5 / AC9 🎫 → landing time: 🎫 (1), the 🛬 field in its row, inviting (2), typed, ↵ ↵
    taps = 0; const p0 = net.posts;
    await tapS('#sheet [data-act="mybook"]', 50); await page.waitForSelector('#sheet #tm-arr', { timeout: 8000 }).catch(() => {}); await settle(page, 100);
    r.invite = await page.$eval('#sheet #tm-arr', (e) => e.closest('.fld').classList.contains('invite') && !!e.closest('.leg')).catch(() => false);
    r.noShift = !(await page.$('#sheet [data-act="legshift"]'));
    await tapS('#sheet #tm-arr', 80);
    await page.keyboard.type('0905'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await recUntil((x) => /🛬09:05/.test(x.note)); await settle(page, 150);
    r.jobB = { taps, posts: net.posts - p0, booked: rec().booked === true, note: rec().note };
    await measurePopup(page, 'my flight › booked: each row its day, its time field and its airports');
    check(r.open.pop === 'P-person' && r.open.taps === 1 && eq(r.open.rows, ['12/22🗓', '12/27🗓']) && r.open.cells === 4 && r.open.tk && eq(r.open.legs, ['2026-12-22:SEA>PIA', '2026-12-27:PIA>SEA']) &&
      r.invite && r.noShift && r.jobB.taps === 2 && r.jobB.posts === 2 && r.jobB.booked && /^🛬09:05 Red-eye/.test(r.jobB.note),
      'PIA-151 AC1/AC5/AC9 one tap on Leo\'s bar opens his flight section: 🛬 12/22 and 🛫 12/27 (both following the plan, 🗓), PIA | ORD for each end, ✈ Book ↗ for exactly SEA→PIA 12/22 and PIA→SEA 12/27 with 🎫 beside it; then 🎫 → landing time in 2 taps: 🎫, the 🛬 field (in its own row, inviting, in place of −1 / +1), 0905 ↵ ↵ saved', r);
    await page.click('#sheet [data-act="sh-close"]'); await settle(page, 300);
    // AC9 record my booked arrive DAY + time from the trip page in ≤5 taps: my booked bar (1), my 🛬 day (2), the day (3), ⚠ 🎫 Confirm
    // (4: the first move after my 🎫 asks once), the time typed in the 🛬 field that has the focus, ⌄ (5)
    taps = 0; const p1 = net.posts;
    await tapJ('#screen .split.prim [data-act="mytimes"]');
    r.f1 = await focusId();
    await tapS('#sheet [data-act="dates"][data-end="0"]');
    r.cal = { pop: await popupId(page), endg: await page.$eval('#sheet .sh-hd .endg', (e) => e.textContent).catch(() => ''), save: !!(await page.$('#sheet [data-act="dsave"]')),
      cross: await page.$eval('#sheet [data-act="dday"][data-v="2026-12-28"]', (e) => e.getAttribute('data-lbl')).catch(() => ''), pin: !!(await page.$('#sheet [data-act="dday"][data-v="2026-12-25"] .pinday')) };
    await measurePopup(page, 'my flight › the one-end calendar (🛬)');
    await tapS('#sheet [data-act="dday"][data-v="2026-12-21"]');
    r.ask = await page.$eval('#sheet [data-act="dsave"]', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
    r.askPosts = net.posts - p1;
    await measurePopup(page, 'my flight › the one-end calendar asking (⚠ 🎫 Confirm)');
    await tapS('#sheet [data-act="dsave"]', 50); await backIn();
    r.back = { pop: await popupId(page), focus: await focusId(), day: await page.$eval('#sheet .leg .ld', (e) => e.textContent.trim()).catch(() => '') };
    await page.fill('#sheet #tm-arr', '1510');
    await tapS('#sheet [data-act="sh-close"]', 50); await recUntil((x) => /🛬15:10/.test(x.note)); await settle(page, 200);
    r.jobA = { taps, posts: net.posts - p1, from: rec().available_from, to: rec().available_to, note: rec().note, booked: rec().booked === true };
    r.board = await page.$eval('#screen .pb [data-act="flight"][data-code="leo-k3"] .btm.a', (e) => e.textContent).catch(() => '');
    await measureScreen(page, 'set trip › my bar with my landing time (the final check)');
    check(r.f1 === 'tm-arr' && r.cal.pop === 'P-dates' && r.cal.endg === '🛬' && !r.cal.save && r.cal.cross === 'Ends cross' && r.cal.pin && r.ask === '⚠ 🎫 Confirm' && r.askPosts === 0 &&
      r.back.pop === 'P-person' && r.back.focus === 'tm-arr' && r.back.day === '12/21⚠' && r.jobA.taps === 5 && r.jobA.posts === 2 && r.jobA.from === '2026-12-21' && r.jobA.to === '' && r.jobA.booked &&
      /^🛬15:10 Red-eye/.test(r.jobA.note) && /^15:10/.test(r.board),
      'PIA-151 AC2/AC9 from the trip page Leo records his booked arrive day and time in 5 taps: his booked bar (🛬 focused), his 🛬 day (a month calendar for that end: 📌 on its day, days past his 🛫 greyed "Ends cross", no Save to find), 12/21, ⚠ 🎫 Confirm (once a visit, nothing sent before it), back at his 🛬 field, 1510, ⌄: two writes (the day, then the time), his 🎫 kept, and his bar reads 15:10', r);
    // AC4 one end saving (◷) and failed (⚠ ↻, the day still picked; ↻ saves it), each a counted popup state
    await jsClick(page, '#screen .pb [data-act="flight"][data-code="leo-k3"]'); await settle(page, 150);
    await page.click('#sheet [data-act="dates"][data-end="1"]'); await settle(page, 150);
    let release; net.holdPost = new Promise((res) => { release = res; });
    await page.click('#sheet [data-act="dday"][data-v="2026-12-26"]'); await settle(page, 150);
    r.busy = await page.$eval('#sheet [data-act="dsave"]', (e) => e.textContent.trim() + '|' + e.getAttribute('aria-busy')).catch(() => '');
    await measurePopup(page, 'my flight › the one-end calendar saving (◷)');
    net.holdPost = null; release(); await backIn();
    r.afterBusy = { pop: await popupId(page), to: rec().available_to };
    await page.click('#sheet [data-act="dates"][data-end="1"]'); await settle(page, 150);
    net.failPost = true;
    await page.click('#sheet [data-act="dday"][data-v="2026-12-24"]'); await failedIn(); await settle(page, 100);
    r.failed = { btn: await page.$eval('#sheet [data-act="dsave"]', (e) => e.textContent.trim()).catch(() => ''), picked: await page.$eval('#sheet [data-act="dday"][data-v="2026-12-24"]', (e) => e.getAttribute('aria-pressed')).catch(() => ''), to: rec().available_to };
    await measurePopup(page, 'my flight › the one-end calendar after a failed save (⚠ ↻)');
    await page.click('#sheet [data-act="dsave"]'); await backIn();
    r.retried = { pop: await popupId(page), to: rec().available_to, note: rec().note };
    check(r.busy === '◷|true' && r.afterBusy.pop === 'P-person' && r.afterBusy.to === '2026-12-26' && r.failed.btn === '⚠ ↻' && r.failed.picked === 'true' && r.failed.to === '2026-12-26' &&
      r.retried.pop === 'P-person' && r.retried.to === '2026-12-24' && /^🛬15:10 Red-eye/.test(r.retried.note),
      'PIA-151 AC4 picking his 🛫 day: ◷ while the write is out, then back in his flight section (12/26); a save that fails keeps 12/24 picked with ⚠ ↻, and ↻ saves it (his time and note kept)', { busy: r.busy, afterBusy: r.afterBusy, failed: r.failed, retried: r.retried });
    await closeSheet(page);
    await ctx.close();
  }
  {
    // AC7 / AC8 the organizer's final check on the Done 8-member trip: who is booked, when each lands and leaves, who has no time;
    // a tap on a row opens that traveler's flight section (focused on the missing time): recorded in 2 taps, 📞
    const { ctx, page, net } = await phone('bookorg', { worker: true, url: '?idea=' + BK });
    await settle(page, 200);
    const rows = () => page.evaluate(() => [...document.querySelectorAll('#screen .pb .pb-row')].map((row) => {
      const f = row.querySelector('.who [data-act="person"]'), tr = row.querySelector('.track');
      return { code: f && f.getAttribute('data-code'), btn: !!(tr && tr.tagName === 'BUTTON' && tr.getAttribute('data-act') === 'flight'), h: tr ? Math.round(tr.getBoundingClientRect().height) : 0,
        a: ((row.querySelector('.btm.a') || {}).textContent || ''), miss: !!row.querySelector('.btm.a.miss'), d: ((row.querySelector('.btm.d') || {}).textContent || '') };
    }));
    const b0 = await rows(), by = (c) => b0.find((x) => x.code === c) || {};
    const w0 = await measureScreen(page, 'Done 8-member trip › the board\'s final check (times, ––:––)');
    let taps = 0;
    await jsClick(page, '#screen .pb [data-act="flight"][data-code="samlee-sb"]'); taps++; await settle(page, 150);
    const s = { pop: await popupId(page), focus: await page.evaluate(() => (document.activeElement || {}).id || '') };
    await measurePopup(page, 'Done 8-member trip › Sam Lee\'s flight section from his row (the organizer)');
    await page.fill('#sheet #tm-arr', '1730');
    await page.click('#sheet [data-act="sh-close"]'); taps++; await settle(page, 700);
    const note = JSON.parse(net.kv.map.get('idea:' + BK)).responses['samlee-sb'].note, b1 = await rows();
    check(by('bartholomewmontgomeryfitzgera-dj').a === '15:10☀' && by('bartholomewmontgomeryfitzgera-dj').d === '18:05🌃' && by('anastasiakonstantinopoulou-x1').a === '15:40☀' && !by('anastasiakonstantinopoulou-x1').d &&
      by('oluwaseunadebayorichardson-ew').a === '15:05☀' && by('oluwaseunadebayorichardson-ew').d === '20:00🌃' && by('samlee-sb').miss && by('samlee-sb').a === '––:––' && by('maximilianoyelaranwhitfield-5u').miss &&
      b0.filter((x) => x.btn).every((x) => x.h >= 44) && b0.some((x) => !x.btn) && w0.length <= SCREEN_MAX &&
      s.pop === 'P-person' && s.focus === 'tm-arr' && taps === 2 && note === '🛬17:30' && (b1.find((x) => x.code === 'samlee-sb') || {}).a === '17:30☀',
      'PIA-151 AC7/AC8 at a glance on the 8-name board (≤10 words): Bartholomew lands 15:10☀ and leaves 18:05🌃, Anastasia lands 15:40☀, Oluwaseun 15:05☀ / 20:00🌃, Sam Lee and Maximiliano booked with ––:–– (no landing time); a tap on Sam Lee\'s row opens his flight section at 🛬, 1730 and ⌄: recorded for him in 2 taps (his 📞 mark as it reads, as PIA-139\'s organizer times), and his row reads 17:30', { b0, s, note, w: w0.length });
    await ctx.close();
  }
  {
    // AC5 / AC9 a trip still Asking (its dates not 🔒: a new trip's default), the worst case for the flight section's words: 8 long names,
    // PIA | ORD, every traveler on their own days, on the organizer's token phone. Each section has [✈ Book ↗ | 🎫] (a flight bought early
    // can be recorded); his 🎫 for Anastasia (in): one tap, then her 🛬 field invites the time; ≤20 words in every state
    const { ctx, page, net } = await phone('prices', { worker: true, url: '?idea=' + PW });
    await settle(page, 300);
    const codes = await page.evaluate(() => [...document.querySelectorAll('#screen .pb [data-act="flight"]')].map((e) => e.getAttribute('data-code')));
    const seen = [];
    for (const c of codes) {
      await jsClick(page, '#screen .pb [data-act="flight"][data-code="' + c + '"]'); await settle(page, 120);
      const w = await measurePopup(page, 'Asking 8-name trip › ' + c + '\'s flight section ([✈ Book ↗ | 🎫] before the 🔒)');
      seen.push({ c, book: !!(await page.$('#sheet .split a[data-ret]')), tk: !!(await page.$('#sheet .split [data-act="booked"], #sheet .split [data-act="mybook"]')), w: w.length });
      await closeSheet(page);
    }
    const w0 = await measureScreen(page, 'Asking 8-name trip › the trip view (nobody booked yet)');
    await jsClick(page, '#screen .pb [data-act="flight"][data-code="anastasia-w2"]'); await settle(page, 120);
    const p0 = net.posts;
    await page.click('#sheet .split [data-act="booked"]'); await page.waitForSelector('#sheet #tm-arr', { timeout: 8000 }).catch(() => {}); await settle(page, 150);
    const inv = await page.$eval('#sheet #tm-arr', (e) => e.closest('.fld').classList.contains('invite') && !!e.closest('.leg')).catch(() => false);
    const w2 = await measurePopup(page, 'Asking 8-name trip › Anastasia marked booked by the organizer (her 🛬 field inviting)');
    const an = JSON.parse(net.kv.map.get('idea:' + PW)).responses['anastasia-w2'];
    await closeSheet(page);
    const w3 = await measureScreen(page, 'Asking 8-name trip › the trip view once Anastasia has booked (her ––:––)');
    check(codes.length === 8 && seen.every((x) => x.book && x.tk && x.w <= POPUP_MAX) && inv && an.booked === true && net.posts - p0 === 1 && w2.length <= POPUP_MAX && w0.length <= SCREEN_MAX && w3.length <= SCREEN_MAX,
      'PIA-151 AC5/AC9 on the 8-name trip still Asking, every traveler\'s flight section has [✈ Book ↗ | 🎫] (≤20 words each); the organizer\'s 🎫 for Anastasia is one tap (one write), then her 🛬 field invites the time; the trip view stays ≤10 words before and after', { seen, inv, posts: net.posts - p0, w2: w2.length, w0: w0.length, w3: w3.length });
    await ctx.close();
  }

  // ═══ PIA-140: prices with real clicks, through the real Worker (its token gate, fare cache and caps), SerpAPI stubbed ═══
  section('PIA-140 prices with real clicks through the real Worker: P-total, 🔍 (its cost first), a person\'s ±1 days, the locks, ⚙\'s budget');
  {
    const SERP = fx('serp-flights.json');
    const serp = [];
    const offline = globalThis.fetch;
    globalThis.fetch = async (u) => {
      const sU = String(u);
      if (/^https:\/\/serpapi\.com\/account\.json\?/.test(sU)) return new Response(JSON.stringify({ plan_searches_left: 900, total_searches_left: 900, this_month_usage: 41, searches_per_month: 1000 }), { status: 200 });
      if (/^https:\/\/serpapi\.com\/search\.json\?/.test(sU)) {
        serp.push(sU);
        const q = new URL(sU).searchParams, j = JSON.parse(JSON.stringify(SERP)), base = 180 + serp.length * 17;
        j.best_flights[0].price = base + 13; j.other_flights.forEach((o, i) => { o.price = base + [0, 36, 59][i]; o.flights[0].departure_airport.id = q.get('departure_id').split(',')[0]; o.flights[o.flights.length - 1].arrival_airport.id = q.get('arrival_id').split(',')[0]; });
        return new Response(JSON.stringify(j), { status: 200 });
      }
      throw new Error('test-words: no network for ' + sU);
    };
    const ls = Object.assign({}, PHONES.eight.ls, { pialax_proxy_token: TOKEN, pialax_multi_airport_v1: '1' });
    const { ctx, page, net } = await phone('eight', { worker: true, paid: true, ls, url: '?idea=' + M8 });
    const blk = await page.$eval('#screen .totalblk', (e) => e.getAttribute('aria-label')).catch(() => '');
    await measureScreen(page, 'prices › the 8-member trip, nothing searched yet');
    await page.click('#screen .totalblk'); await settle(page, 200);
    const pt0 = await page.$eval('#sheet [data-act="search"]', (e) => [e.textContent.trim(), e.getAttribute('aria-label')]).catch(() => null);
    await measurePopup(page, 'prices › P-total (all $—, 🔍4)');
    await labelCheck(page, 'prices › P-total (all $—)', 'prices-real', 'sheet');
    await page.click('#sheet [data-act="search"]'); await settle(page, 600);
    const after1 = await page.evaluate(() => ({ legs: [...document.querySelectorAll('#sheet .lgp')].map((e) => e.getAttribute('aria-label')), btn: (document.querySelector('#sheet [data-act="search"]') || {}).textContent || '',
      q: JSON.parse(localStorage.getItem('pialax_serpapi_quota') || 'null'), fares: Object.keys(JSON.parse(localStorage.getItem('pialax_fares_v2') || '{}')).length }));
    await measurePopup(page, 'prices › P-total after one 🔍 (4 priced, 1 left)');
    const s1 = net.paid.filter((x) => x.path === '/search');
    // its ⓘ explains every glyph in it now: each priced leg's age ring, level gauge and stops line, the airport that won, the $— left,
    // this visit's dots, today's searches, the 🔍 (and its own parts name themselves on a long press)
    const k1 = await sheetKey(page, 'prices › P-total (4 priced, 1 left)');
    await labelCheck(page, 'prices › P-total (4 priced)', 'prices-real-priced', 'sheet');
    const subLbl = await page.evaluate(() => [...document.querySelectorAll('#sheet .agering[data-lbl], #sheet .lvl[data-lbl], #sheet .stopl[data-lbl]')].map((e) => e.getAttribute('data-lbl')));
    await page.click('#sheet [data-act="search"]'); await settle(page, 500);
    const after2 = await page.evaluate(() => ({ btn: !!document.querySelector('#sheet [data-act="search"]'), sum: (document.querySelector('#sheet .sum') || {}).textContent || '' }));
    await measurePopup(page, 'prices › P-total, all priced');
    check(/^Group total, not searched, 5 to search$/.test(blk) && pt0 && pt0[0] === '🔍4/5' && pt0[1] === 'Search 4 of 5 fares, 4 searches' && s1.length === 4 && s1.every((x) => x.token === TOKEN && x.url.indexOf(TOKEN) < 0) &&
      after1.legs.filter((x) => /fetched/.test(x)).length === 4 && after1.btn.trim() === '🔍1' && after1.q && after1.q.used >= 4 && after1.fares === 4 && serp.length === 5 && !after2.btn && /^\$[\d,]+$/.test(after2.sum.trim()),
      'PIA-140 with real clicks: the trip\'s total block opens P-total (5 legs $—, 🔍4/5: its cost, and that the caps cut it short); the tap prices 4 through the real Worker (the token in its header only), 🔍1 then the last one; the sum then stands alone', { blk, pt0, after1, after2, serp: serp.length });
    check(['age', 'level', 'stops', 'unsearched', 'visit', 'search'].every((k) => k1.has(k)) && subLbl.length >= 12 && subLbl.some((l) => l === 'Fetched just now') && subLbl.some((l) => /^Price (low|typical|high)$/.test(l)) && subLbl.some((l) => /^(Nonstop|\d stops?)$/.test(l)),
      'PIA-140 the organizer can tell each fare\'s age, price level and stops from P-total: its ⓘ explains the age ring, the level gauge, the stops line, $—, the visit\'s dots and 🔍 (every glyph in the sheet is keyed), and each part names itself on a long press ("Fetched just now", "Price low", "1 stop")', { keys: [...k1], subLbl: subLbl.slice(0, 6) });
    // a person's ±1 days from P-total's face (‹ back to P-total): 🔍2, then three days with ★
    await page.click('#sheet .trow [data-act="person"]'); await settle(page, 150);
    await measurePopup(page, 'prices › P-person from P-total (fares, 🔍2 each end)');
    const pp0 = await page.$$eval('#sheet .dayp [data-act="search"]', (els) => els.map((e) => e.textContent.trim()));
    await page.click('#sheet .dayp [data-act="search"]'); await settle(page, 500);
    const pp1 = await page.evaluate(() => ({ chips: [...document.querySelectorAll('#sheet .dayp')][0].querySelectorAll('.dch').length, star: document.querySelectorAll('#sheet [data-k="cheapest"]').length, priced: [...document.querySelectorAll('#sheet .dayp')][0].querySelectorAll('.dch.hollow').length }));
    await measurePopup(page, 'prices › P-person after 🔍2 (★ the cheapest day)');
    await labelCheck(page, 'prices › P-person fares', 'prices-real-person', 'sheet');
    const kp = await sheetKey(page, 'prices › P-person fares');
    await page.click('#sheet [data-act="sh-back"]'); await settle(page, 100);
    const back = await popupId(page);
    check(pp0.length >= 1 && pp0.every((t) => t === '🔍2') && pp1.chips === 3 && pp1.priced === 0 && pp1.star === 1 && back === 'P-total' && net.paid.filter((x) => x.path === '/search').length === 7 &&
      ['age', 'cheapest', 'visit'].every((k) => kp.has(k)),
      'PIA-140 AC6 with real clicks: a traveler\'s sheet from P-total offers 🔍2 per end; one tap prices that end ±1 day (2 searches), the three days read their $ with one ★ (its ⓘ explains the fare\'s parts, ★ and the visit\'s dots); ‹ goes back to P-total', { pp0, pp1, back, kp: [...kp] });
    // the visit's 8 spent: ⛔ ↻ says how it lifts; its first tap asks (↻8?), the second starts a new visit and spends nothing
    await closeSheet(page);
    await page.evaluate(() => { sessionStorage.setItem('pialax_spent_v2', '8'); const f = JSON.parse(localStorage.getItem('pialax_fares_v2')); delete f[Object.keys(f)[0]]; localStorage.setItem('pialax_fares_v2', JSON.stringify(f)); });
    await page.click('#screen .totalblk'); await settle(page, 200);
    const v0 = await page.$eval('#sheet [data-act="newvisit"]', (e) => [e.textContent.trim(), e.getAttribute('data-lbl')]).catch(() => null);
    await measurePopup(page, 'prices › P-total, the visit\'s 8 spent (⛔ ↻)');
    await labelCheck(page, 'prices › P-total, the visit\'s 8 spent', 'prices-real-visit', 'sheet');
    const nv0 = net.paid.filter((x) => x.path === '/search').length;
    await page.click('#sheet [data-act="newvisit"]'); await settle(page, 150);
    const v1 = await page.$eval('#sheet [data-act="newvisit"]', (e) => [e.textContent.trim(), e.getAttribute('data-lbl')]).catch(() => null);
    await measurePopup(page, 'prices › P-total, a new visit asked (↻8?)');
    await page.click('#sheet [data-act="newvisit"]'); await settle(page, 150);
    const v2 = await page.$eval('#sheet [data-act="search"]', (e) => e.textContent.trim()).catch(() => null);
    const toastV = await page.evaluate(() => { const t = document.querySelector('#toast'); return t && !t.hidden ? t.textContent : ''; });
    if (toastV) await measurePopup(page, 'prices › the new visit\'s toast', '#toast');
    await measurePopup(page, 'prices › P-total, a new visit (🔍1)');
    const spentV = await page.evaluate(() => sessionStorage.getItem('pialax_spent_v2'));
    check(v0 && v0[0] === '⛔ ↻' && v0[1] === 'New visit' && v1 && v1[0] === '↻8?' && v1[1] === 'Tap again' && v2 === '🔍1' && /↻ 8/.test(toastV) && spentV === '0' && net.paid.filter((x) => x.path === '/search').length === nv0,
      'PIA-140 with real clicks: the visit\'s 8 spent, P-total shows ⛔ ↻ ("New visit"); the first tap asks (↻8?, "Tap again"), the second starts a new visit (its 8 dots empty, ↻ 8) and spends nothing; 🔍1 is the next tap\'s cost', { v0, v1, v2, toastV, spentV });
    // the month locked by SerpAPI's refusal: ⛔ 11/1 everywhere, and a tap says why ("SerpAPI refused"); the trip page's block says ⛔ 11/1 too
    await closeSheet(page);
    await page.evaluate(() => { const q = JSON.parse(localStorage.getItem('pialax_serpapi_quota')); q.exceeded = true; localStorage.setItem('pialax_serpapi_quota', JSON.stringify(q)); });
    await page.click('#screen .totalblk'); await settle(page, 200);
    const mo = await page.$eval('#sheet [data-act="search"]', (e) => [e.textContent.trim(), e.getAttribute('data-lbl')]).catch(() => null);
    await measurePopup(page, 'prices › P-total, the month locked (⛔ 11/1)');
    await page.click('#sheet [data-act="search"]', { force: true }); await settle(page, 200);
    const moWhy = await page.evaluate(() => { const b = document.querySelector('#lbl'); return b && !b.hidden ? b.textContent : ''; });
    await measurePopup(page, 'prices › ⛔ 11/1 explained', '#lbl');
    await closeSheet(page);
    const chipM = await page.$eval('#screen .totalblk .chipq', (e) => e.textContent.trim()).catch(() => '');
    await measureScreen(page, 'prices › the trip page, the month locked');
    await page.evaluate(() => { const q = JSON.parse(localStorage.getItem('pialax_serpapi_quota')); q.exceeded = false; localStorage.setItem('pialax_serpapi_quota', JSON.stringify(q)); });
    check(mo && mo[0] === '⛔ 11/1' && mo[1] === 'SerpAPI refused' && moWhy === 'SerpAPI refused' && chipM === '⛔ 11/1' && net.paid.filter((x) => x.path === '/search').length === nv0,
      'PIA-140 with real clicks: SerpAPI\'s refusal locks the month: P-total reads ⛔ 11/1, a tap says why ("SerpAPI refused") and sends nothing, and the trip page\'s total block shows ⛔ 11/1 instead of a cost', { mo, moWhy, chipM });
    // the Worker's day cap: every spend control reads ⛔ 17:00 (00:00 UTC, local), a tap explains and sends nothing
    await closeSheet(page);
    // (one fare forgotten on this phone, so there is a leg to search again)
    await page.evaluate(() => { localStorage.setItem('pialax_daily_cap_v1', '2026-10-17'); const f = JSON.parse(localStorage.getItem('pialax_fares_v2')); delete f[Object.keys(f)[0]]; localStorage.setItem('pialax_fares_v2', JSON.stringify(f)); });
    await page.click('#screen .totalblk'); await settle(page, 200);
    const lk = await page.$eval('#sheet [data-act="search"]', (e) => [e.textContent.trim(), e.getAttribute('aria-label'), e.getAttribute('aria-disabled')]).catch(() => null);
    await measurePopup(page, 'prices › P-total locked (⛔ 17:00)');
    const n0 = net.paid.filter((x) => x.path === '/search').length;
    await page.click('#sheet [data-act="search"]', { force: true }); await settle(page, 200);   // aria-disabled (it explains itself): a tap as a finger makes it
    const why = await page.evaluate(() => { const b = document.querySelector('#lbl'); return b && !b.hidden ? b.textContent : ''; });
    await measurePopup(page, 'prices › ⛔ explained', '#lbl');
    check(lk && lk[0] === '⛔ 17:00' && lk[1] === 'Searches resume at 17:00' && lk[2] === 'true' && why === 'Daily limit' && net.paid.filter((x) => x.path === '/search').length === n0,
      'PIA-140 AC3 with real clicks: past the Worker\'s day cap P-total\'s 🔍 reads ⛔ 17:00 (00:00 UTC in Los Angeles), a tap says "Daily limit" and sends nothing', { lk, why });
    await closeSheet(page);
    // ⚙ on the organizer's phone: today's Worker searches (from /account), this visit's dots, the month against its cap, ⛔ while locked
    await page.click('#screen [data-act="settings"]'); await settle(page, 400);
    const gear = await page.evaluate(() => ({ bud: (document.querySelector('#sheet .bud') || {}).textContent || '', cap: (document.querySelector('#org-cap') || {}).value || '', lock: (document.querySelector('#sheet .capt') || {}).textContent || '' }));
    await measurePopup(page, 'prices › ⚙ with the budget');
    await labelCheck(page, 'prices › ⚙ budget', 'prices-real-gear', 'sheet');
    check(/🔍 \d+\/30/.test(gear.bud) && gear.cap === '1000' && gear.lock === '⛔ 17:00' && net.paid.some((x) => x.path === '/account' && x.token === TOKEN),
      'PIA-140 ⚙ on the organizer\'s phone: today\'s Worker searches left (/account, the token in its header), the month cap (1000), and ⛔ 17:00 while the day cap holds', gear);
    // ⚙ with every lock on at once: each sits with what it counts (the day's ⛔ by 🔍 n/30, the visit's ↻ by its dots, the month's
    // ⛔ and why in the month's row)
    await closeSheet(page);
    await page.evaluate(() => { sessionStorage.setItem('pialax_spent_v2', '8'); const q = JSON.parse(localStorage.getItem('pialax_serpapi_quota')); q.exceeded = true; localStorage.setItem('pialax_serpapi_quota', JSON.stringify(q)); });
    await page.click('#screen [data-act="settings"]'); await settle(page, 300);
    const all3 = await page.evaluate(() => ({ budget: (document.querySelector('#sheet .budget') || {}).textContent || '', visit: !!document.querySelector('#sheet .budget [data-act="newvisit"]'),
      month: [...document.querySelectorAll('#sheet .capf ~ .capt')].map((e) => [e.textContent, e.getAttribute('data-lbl')]) }));
    await measurePopup(page, 'prices › ⚙ with the day, visit and month locks');
    await labelCheck(page, 'prices › ⚙ every lock', 'prices-real-gear-locks', 'sheet');
    check(/⛔ 17:00/.test(all3.budget) && all3.visit && all3.month.length === 1 && all3.month[0][0] === '⛔ 11/1' && all3.month[0][1] === 'SerpAPI refused',
      'PIA-140 ⚙ with every lock on: the day\'s ⛔ 17:00 beside today\'s searches, the visit\'s ↻ beside its dots, and the month\'s ⛔ 11/1 in the month\'s row with why ("SerpAPI refused")', all3);
    await ctx.close();
    // a 🔍 tapped while P-total's /account read is out waits for it: ◷ ("Searching"), nothing sent until it is in
    {
      const w = await phone('eight', { worker: true, paid: true, ls, url: '?idea=' + M8 });
      let release = null; w.net.holdAcct = new Promise((r) => { release = r; });
      await w.page.click('#screen .totalblk'); await settle(w.page, 150);
      await w.page.click('#sheet [data-act="search"]'); await settle(w.page, 150);
      const busy = await w.page.$eval('#sheet [data-act="search"]', (e) => [e.textContent.trim(), e.getAttribute('aria-busy'), e.getAttribute('data-lbl')]).catch(() => null);
      await measurePopup(w.page, 'prices › P-total, a 🔍 waiting for /account (◷)');
      await labelCheck(w.page, 'prices › P-total ◷', 'prices-real-wait', 'sheet');
      const sent = w.net.paid.filter((x) => x.path === '/search').length;
      w.net.holdAcct = null; release(); await settle(w.page, 700);
      const sentAfter = w.net.paid.filter((x) => x.path === '/search').length;
      await w.ctx.close();
      check(busy && busy[0] === '◷' && busy[1] === 'true' && busy[2] === 'Searching' && sent === 0 && sentAfter === 4,
        'PIA-140 with real clicks: a 🔍 tapped while P-total\'s /account read is out shows ◷ ("Searching") and sends nothing; once /account is in, the 4 it showed go', { busy, sent, sentAfter });
    }
    // a token the Worker refuses: 🔑⚠ in ⚙ (the field marked) and in P-total
    {
      const w = await phone('eight', { worker: true, paid: true, ls: Object.assign({}, ls, { pialax_proxy_token: 'wrong-token-0123456789abcdef' }), url: '?idea=' + M8 });
      await w.page.click('#screen [data-act="settings"]'); await settle(w.page, 400);
      const g = await w.page.evaluate(() => ({ bad: !!document.querySelector('#sheet .fld.bad #org-token'), mark: (document.querySelector('#sheet [data-k="tokbad"]') || {}).textContent || '' }));
      await measurePopup(w.page, 'prices › ⚙ with a token the Worker refuses (🔑⚠)');
      await labelCheck(w.page, 'prices › ⚙ token refused', 'prices-real-tokbad', 'sheet');
      await closeSheet(w.page);
      await w.page.click('#screen .totalblk'); await settle(w.page, 200);
      const pm = await w.page.$eval('#sheet [data-k="tokbad"]', (e) => e.textContent).catch(() => '');
      await measurePopup(w.page, 'prices › P-total with a token the Worker refuses (🔑⚠)');
      await w.ctx.close();
      check(g.bad && g.mark === '🔑⚠' && pm === '🔑⚠', 'PIA-140 with real clicks: a token the Worker refuses on /account marks ⚙\'s token field and shows 🔑⚠ ("Token refused") in ⚙ and P-total', { g, pm });
    }
    // the wait and the locks at every width, counted with their long-press labels: ◷ while /account is out, ⛔ ↻ and ↻8? at the
    // visit's 8 (P-total and a person's square), ⛔ 11/1 when SerpAPI refused (and its "SerpAPI refused"), ⛔ alone in a square
    const lockLog = [];
    for (const width of WIDTHS) {
      const w = await phone('eight', { width, worker: true, paid: true, ls, url: '?idea=' + M8 }), tag = (s) => 'prices @' + width + ' › ' + s;
      let release = null; w.net.holdAcct = new Promise((r) => { release = r; });
      await w.page.click('#screen .totalblk'); await settle(w.page, 150);
      await w.page.click('#sheet [data-act="search"]'); await settle(w.page, 150);
      const wait = await w.page.$('#sheet [data-act="search"][aria-busy="true"]');
      await measurePopup(w.page, tag('P-total ◷ (a 🔍 waiting for /account)'));
      w.net.holdAcct = null; release(); await settle(w.page, 700);
      await closeSheet(w.page);
      await w.page.evaluate(() => sessionStorage.setItem('pialax_spent_v2', '8'));
      await w.page.click('#screen .totalblk'); await settle(w.page, 150);
      const visit = await w.page.$('#sheet [data-act="newvisit"]');
      await measurePopup(w.page, tag('P-total ⛔ ↻ (the visit\'s 8 spent)'));
      await labelCheck(w.page, tag('P-total ⛔ ↻'), 'prices-visit@' + width, 'sheet');
      if (visit) { await w.page.click('#sheet [data-act="newvisit"]'); await settle(w.page, 120); await measurePopup(w.page, tag('P-total ↻8? (a new visit asked)')); }
      await w.page.click('#sheet .trow [data-act="person"]'); await settle(w.page, 150);
      await measurePopup(w.page, tag('P-person (⛔ ↻ in a square)'));
      await closeSheet(w.page);
      await w.page.evaluate(() => { sessionStorage.setItem('pialax_spent_v2', '0'); const q = JSON.parse(localStorage.getItem('pialax_serpapi_quota') || 'null') || { period: '2026-10', used: 41, budget: 1000 }; q.exceeded = true; localStorage.setItem('pialax_serpapi_quota', JSON.stringify(q)); });
      await w.page.click('#screen .totalblk'); await settle(w.page, 150);
      const month = await w.page.$eval('#sheet [data-act="search"][data-k="cap"]', (e) => e.textContent.trim()).catch(() => '');
      await measurePopup(w.page, tag('P-total ⛔ 11/1 (SerpAPI refused)'));
      await w.page.click('#sheet [data-act="search"]', { force: true }); await settle(w.page, 150);
      const why = await w.page.evaluate(() => { const b = document.querySelector('#lbl'); return b && !b.hidden ? b.textContent : ''; });
      if (why) await measurePopup(w.page, tag('⛔ 11/1 explained'), '#lbl');
      await w.page.click('#sheet .trow [data-act="person"]'); await settle(w.page, 150);
      await measurePopup(w.page, tag('P-person (⛔ in a square)'));
      await labelCheck(w.page, tag('P-person ⛔'), 'prices-month@' + width, 'sheet');
      await w.ctx.close();
      lockLog.push({ width, wait: !!wait, visit: !!visit, month, why });
    }
    check(lockLog.length === WIDTHS.length && lockLog.every((x) => x.wait && x.visit && x.month === '⛔ 11/1' && x.why === 'SerpAPI refused'),
      'PIA-140 the wait and the locks at every width, counted with their labels: ◷ while /account is out, ⛔ ↻ and ↻8? once the visit\'s 8 are spent (P-total and a person\'s square), ⛔ 11/1 with "SerpAPI refused", ⛔ alone in a square', lockLog);
    globalThis.fetch = offline;
    // every walked phone: P-total from its cards and trip views, counted (the worst case: 16 winning airports, within 20 words)
    const worstT = totalLog.filter((x) => x.codes === 16), cards = totalLog.filter((x) => / card$/.test(x.who));
    check(totalLog.length >= 6 && totalLog.every((x) => x.pid === 'P-total') && worstT.length === WIDTHS.length && cards.length >= 2,
      'PIA-140 P-total opens from a card\'s total and the trip\'s total block on every organizer token phone, at every width, counted (the worst case, 8 open-jaw travelers each won by another airport both ways, draws all 16 codes within the popup budget)', totalLog.map((x) => x.who + ' ' + x.codes));
  }

  // ═══ PIA-141: the cheapest week with real clicks, through the real Worker (its token gate, fare cache and caps), SerpAPI stubbed ═══
  section('PIA-141 the cheapest week with real clicks through the real Worker: P-dates 📉 → P-cheapest (Thanksgiving S1), 🔍2 → $890 ★, Move, ⚠ Confirm, the locks, ⟦◀ ▶⟧, an undated idea; every state counted at 360, 390 and 430');
  {
    const SERP = fx('serp-flights.json'), serp = [], offline = globalThis.fetch;
    // SerpAPI by search: 11/22's legs $280 (into PIA) and $160 (home 12/01), any other leg $350 into PIA and $250 otherwise
    globalThis.fetch = async (u) => {
      const sU = String(u);
      if (/^https:\/\/serpapi\.com\/account\.json\?/.test(sU)) return new Response(JSON.stringify({ plan_searches_left: 900, total_searches_left: 900, this_month_usage: 41, searches_per_month: 1000 }), { status: 200 });
      if (/^https:\/\/serpapi\.com\/search\.json\?/.test(sU)) {
        serp.push(sU);
        const q = new URL(sU).searchParams, d = q.get('outbound_date'), p = d === '2026-11-22' ? 280 : d === '2026-12-01' ? 160 : q.get('arrival_id') === 'PIA' ? 350 : 250;
        const j = JSON.parse(JSON.stringify(SERP)); j.best_flights[0].price = p; j.other_flights.forEach((o, i) => { o.price = p + 20 * (i + 1); });
        return new Response(JSON.stringify(j), { status: 200 });
      }
      throw new Error('test-words: no network for ' + sU);
    };
    const nS = (net) => net.paid.filter((x) => x.path === '/search').length;
    const until = async (page, f, ms) => { for (let i = 0; i < (ms || 4000) / 50; i++) { if (await f()) return true; await page.waitForTimeout(50); } return !!(await f()); };
    const idle = (page) => page.evaluate(() => !document.querySelector('#sheet [aria-busy="true"]'));
    const lbl = (page) => page.evaluate(() => { const b = document.querySelector('#lbl'); return b && !b.hidden ? b.textContent : ''; });
    const barsNow = (page) => page.evaluate(() => [...document.querySelectorAll('#sheet .cbar')].map((e) => { const r = e.getBoundingClientRect(); return { v: e.getAttribute('data-v'), w: r.width, h: r.height, top: ((e.querySelector('.v') || {}).textContent || '').trim(), wf: ((e.querySelector('.wf') || {}).textContent || '').trim(), cur: e.classList.contains('cur'), star: !!e.querySelector('[data-k="cheapest"]') }; }));
    const overflow = (page) => page.evaluate(() => { const s = document.querySelector('#sheet'); return [document.documentElement.scrollWidth - innerWidth, s.scrollWidth - s.clientWidth]; });
    const real = [];
    for (const width of WIDTHS) {
      const T = (s) => 's1 @' + width + ' › ' + s, deepW = width === 360, R = { width };
      const { ctx, page, net } = await phone('s1', { width, worker: true, paid: true, url: '?idea=' + S1 });
      try {
        await jsClick(page, '#screen .daterow [data-act="dates"]'); await settle(page, 150);
        R.tool = await page.$eval('#sheet [data-act="dcheap"]', (e) => [e.textContent, e.getAttribute('aria-label'), e.getAttribute('aria-disabled')]).catch(() => null);
        await measurePopup(page, T('P-dates with 📉'));
        await jsClick(page, '#sheet [data-act="dcheap"]'); await settle(page, 300);
        R.pid = await popupId(page); R.b0 = await barsNow(page); R.o0 = await overflow(page);
        R.pager = await page.evaluate(() => { const sb = document.querySelector('#sheet .cstrip').getBoundingClientRect().bottom; return [...document.querySelectorAll('#sheet [data-act="cpage"]')].map((e) => e.getBoundingClientRect().top >= sb); });
        await measurePopup(page, T('P-cheapest (S1 opened: the plan\'s week)'));
        if (deepW) { await labelCheck(page, T('P-cheapest (S1)'), 's1-cheap', 'sheet'); R.keys = [...await sheetKey(page, T('P-cheapest (S1)'))]; }
        await jsClick(page, '#sheet [data-act="cpage"][data-v="1"]'); await settle(page, 80);
        R.b1 = await barsNow(page); await measurePopup(page, T('P-cheapest page 2'));
        await jsClick(page, '#sheet [data-act="cpage"][data-v="-1"]'); await settle(page, 80);
        // 11/22: the cost first (🔍2), one tap → 2 searches → $890 ★ and Move
        await jsClick(page, '#sheet .cbar[data-v="2026-11-22"]'); await settle(page, 80);
        R.cost = await page.$eval('#sheet [data-act="search"][data-v="week"]', (e) => [e.textContent.trim(), e.getAttribute('aria-label')]).catch(() => null);
        await measurePopup(page, T('P-cheapest 11/22 selected (🔍2)'));
        const n0 = nS(net);
        // (by keyboard: the focus that was on 🔍2 lands on Move once the week is priced, never on <body>)
        await page.focus('#sheet [data-act="search"][data-v="week"]'); await page.keyboard.press('Enter');
        await until(page, async () => nS(net) >= n0 + 2 && (await idle(page))); await settle(page, 150);
        R.sent = nS(net) - n0; R.b2 = await barsNow(page);
        R.focus = await page.evaluate(() => { const a = document.activeElement; return a && a.getAttribute ? [a.getAttribute('data-act'), !!a.closest('#sheet')] : null; });
        R.btn = await page.$eval('#sheet [data-act="cmove"]', (e) => e.textContent.trim()).catch(() => '');
        R.chips = await page.$$eval('#sheet .cchip', (els) => els.map((e) => e.getAttribute('aria-label')));
        await measurePopup(page, T('P-cheapest 11/22 priced ($890 ★, Move)'));
        if (deepW) { await labelCheck(page, T('P-cheapest priced'), 's1-cheap-priced', 'sheet'); R.keys2 = [...await sheetKey(page, T('P-cheapest priced'))]; }
        // fix pass: a short tap on a face chip, or on 🔍 26/30, names it (nothing in P-cheapest looks like a control that does nothing)
        if (deepW) {
          R.taps = [];
          for (const sel of ['#sheet .cchip', '#sheet .bud']) {
            await until(page, async () => !(await lbl(page)), 3000);
            await page.click(sel); await settle(page, 80);
            const said = await lbl(page); R.taps.push(said);
            if (said) await measurePopup(page, T('P-cheapest ' + sel.slice(8) + ' tapped (P-label "' + said + '")'), '#lbl');
          }
          R.tapPop = await popupId(page);
          await until(page, async () => !(await lbl(page)), 3000);
        }
        // Move: ◷ while its write is out, then ‹ P-dates on the new plan and its toast (↩)
        let release; net.holdPost = new Promise((r) => { release = r; });
        await jsClick(page, '#sheet [data-act="cmove"]'); await settle(page, 150);
        R.busy = await page.$eval('#sheet [data-act="cmove"]', (e) => [e.textContent.trim(), e.getAttribute('aria-busy'), e.getAttribute('data-lbl')]).catch(() => null);
        await measurePopup(page, T('P-cheapest Move ◷'));
        net.holdPost = null; release();
        await until(page, async () => (await popupId(page)) === 'P-dates'); await settle(page, 150);
        R.back = await popupId(page);
        R.readout = await page.$eval('#sheet .readout', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
        R.toast = await page.evaluate(() => { const t = document.querySelector('#toast'); return t && !t.hidden ? t.textContent : ''; });
        if (R.toast) await measurePopup(page, T('Move\'s toast (↩)'), '#toast');
        await measurePopup(page, T('P-dates after Move'));
        R.rec = JSON.parse(net.kv.map.get('idea:' + S1)).idea.dates;
        // a week that leaves Anjo's own days out: its search, then Move asks first (⚠🗽 Confirm); ⌄ leaves it unsent
        await jsClick(page, '#sheet [data-act="dcheap"]'); await settle(page, 250);
        await jsClick(page, '#sheet .cbar[data-v="2026-11-19"]'); await settle(page, 80);
        const n1 = nS(net);
        await jsClick(page, '#sheet [data-act="search"][data-v="week"]');
        await until(page, async () => nS(net) >= n1 + 2 && (await idle(page))); await settle(page, 150);
        const p0 = net.posts;
        await jsClick(page, '#sheet [data-act="cmove"]'); await settle(page, 600);
        R.ask = await page.$eval('#sheet [data-act="cmove"]', (e) => [e.textContent.replace(/\s+/g, ' ').trim(), e.getAttribute('data-lbl')]).catch(() => null);
        await measurePopup(page, T('P-cheapest Move asks (⚠🗽 Confirm)'));
        if (deepW) await labelCheck(page, T('P-cheapest Move asks'), 's1-cheap-ask', 'sheet');
        // fix pass: a tap on the ⚠ of the face it leaves out says why (and the confirm stays asked)
        if (deepW) {
          await until(page, async () => !(await lbl(page)), 3000);
          await page.click('#sheet .cchip.off [data-k="leaves"]'); await settle(page, 80);
          R.warnTap = await lbl(page); if (R.warnTap) await measurePopup(page, T('P-cheapest ⚠ tapped (P-label "' + R.warnTap + '")'), '#lbl');
          R.stillAsks = !!(await page.$('#sheet .btn.arm[data-act="cmove"]'));
        }
        R.askPosts = net.posts - p0;
        await closeSheet(page);
        // the PIA-140 locks on a week's button: the Worker's day cap (⛔ 17:00, its tap says why), the visit's 8 (⛔ ↻)
        await page.evaluate(() => localStorage.setItem('pialax_daily_cap_v1', '2026-10-17'));
        await jsClick(page, '#screen .daterow [data-act="dates"]'); await settle(page, 120);
        await jsClick(page, '#sheet [data-act="dcheap"]'); await settle(page, 250);
        await jsClick(page, '#sheet .cbar[data-v="2026-11-21"]'); await settle(page, 80);
        R.day = await page.$eval('#sheet [data-act="search"]', (e) => [e.textContent.trim(), e.getAttribute('data-lbl')]).catch(() => null);
        await measurePopup(page, T('P-cheapest ⛔ 17:00'));
        await page.click('#sheet [data-act="search"]', { force: true }); await settle(page, 150);
        R.dayWhy = await lbl(page); if (R.dayWhy) await measurePopup(page, T('⛔ 17:00 explained'), '#lbl');
        await page.evaluate(() => { localStorage.removeItem('pialax_daily_cap_v1'); sessionStorage.setItem('pialax_spent_v2', '8'); });
        await jsClick(page, '#sheet .cbar[data-v="2026-11-23"]'); await settle(page, 80);
        R.visit = await page.$eval('#sheet [data-act="newvisit"]', (e) => [e.textContent.trim(), e.getAttribute('data-lbl')]).catch(() => null);
        await measurePopup(page, T('P-cheapest ⛔ ↻ (the visit\'s 8 spent)'));
        if (deepW) await labelCheck(page, T('P-cheapest ⛔ ↻'), 's1-cheap-visit', 'sheet');
        await page.evaluate(() => sessionStorage.setItem('pialax_spent_v2', '4'));
        await closeSheet(page);
        // no 📌 (S1N): ⟦◀ ▶⟧ show; ▶⟧ saves the window a week later through the real Worker, the new weeks drawn at once
        await page.goto(APP_URL + '?idea=' + S1N, { waitUntil: 'load' }); await settle(page, 300);
        await jsClick(page, '#screen .daterow [data-act="dates"]'); await settle(page, 120);
        await jsClick(page, '#sheet [data-act="dcheap"]'); await settle(page, 250);
        R.widen = await page.$$eval('#sheet [data-act="cwiden"]', (els) => els.map((e) => e.textContent.trim()));
        await measurePopup(page, T('P-cheapest with ⟦◀ ▶⟧ (no 📌)'));
        if (deepW) R.keys3 = [...await sheetKey(page, T('P-cheapest with ⟦◀ ▶⟧'))];
        await jsClick(page, '#sheet [data-act="cwiden"][data-v="1"]'); await until(page, () => idle(page)); await settle(page, 300);
        R.widened = Object.assign({ bars: (await barsNow(page)).map((b) => b.v) }, JSON.parse(net.kv.map.get('idea:' + S1N)).idea.dates);
        R.o2 = await overflow(page);
        await measurePopup(page, T('P-cheapest after ▶⟧'));
        await closeSheet(page);
        // an undated idea: its 🌙4 weeks inside its ⟦window⟧, each ⚠🌴🗽 (Ashwin's and Anjo's windows are longer than the stay)
        await page.goto(APP_URL + '?idea=' + C, { waitUntil: 'load' }); await settle(page, 300);
        await jsClick(page, '#screen .daterow [data-act="dates"]'); await settle(page, 120);
        await measurePopup(page, T('P-dates ⟦window⟧ with 📉'));
        await jsClick(page, '#sheet [data-act="dcheap"]'); await settle(page, 250);
        R.undated = await barsNow(page); R.o3 = await overflow(page);
        await measurePopup(page, T('P-cheapest (an undated idea)'));
        // fix pass: Move on the undated idea (its first week's 🔍, then ⚠🌴🗽 Confirm), then ‹ P-dates on its new dates in dates mode
        // (🔒 there, no ⟦window⟧ picker left behind) with nothing for Save to send; closing it says no 🗑
        const nU = nS(net), needU = await page.$eval('#sheet [data-act="search"][data-v="week"]', (e) => +e.getAttribute('data-n')).catch(() => 0);
        await jsClick(page, '#sheet [data-act="search"][data-v="week"]');
        await until(page, async () => nS(net) >= nU + needU && (await idle(page))); await settle(page, 150);
        await jsClick(page, '#sheet [data-act="cmove"]'); await settle(page, 600);
        await measurePopup(page, T('P-cheapest (the undated idea: Move asks, ⚠🌴🗽 Confirm)'));
        await jsClick(page, '#sheet [data-act="cmove"]');
        await until(page, async () => (await popupId(page)) === 'P-dates'); await settle(page, 200);
        R.uPop = await popupId(page);
        R.uMoved = await page.evaluate(() => { const s = document.querySelector('#sheet [data-act="dsave"]'); return { lock: !!document.querySelector('#sheet [data-act="dlock"]'), mode: !!document.querySelector('#sheet [data-act="dmode"]'), save: s ? s.getAttribute('data-lbl') : null, readout: ((document.querySelector('#sheet .readout') || {}).textContent || '').replace(/\s+/g, ' ').trim() }; });
        await measurePopup(page, T('P-dates after Move (the undated idea, now dated)'));
        const pU = net.posts; await jsClick(page, '#sheet [data-act="dsave"]'); await settle(page, 150); R.uSave = net.posts - pU;
        await closeSheet(page);
        R.uToast = await page.evaluate(() => { const t = document.querySelector('#toast'); return t && !t.hidden ? t.textContent : ''; });
        R.uRec = JSON.parse(net.kv.map.get('idea:' + C)).idea.dates;
      } finally { await ctx.close(); }
      real.push(R);
    }
    globalThis.fetch = offline;
    const r360 = real[0] || {};
    check(real.length === WIDTHS.length && real.every((R) => R.tool && R.tool[0] === '📉' && R.tool[1] === 'Cheaper week' && R.tool[2] === null && R.pid === 'P-cheapest'),
      'PIA-141 with real clicks: P-dates on the organizer\'s token phone offers 📉 (Cheaper week) and opens P-cheapest, at every width', real.map((R) => [R.width, R.tool, R.pid]));
    check(real.every((R) => R.b0.length === 7 && R.b0.every((b) => b.w >= 44 && b.h >= 44) && R.b1.length === 3 && R.b1.map((b) => b.v).join() === '2026-11-24,2026-11-25,2026-11-26' && R.pager.length === 2 && R.pager.every(Boolean) && R.o0.every((x) => x <= 0) &&
      R.b0.filter((b) => b.wf === '⚠🗽').map((b) => b.v).join() === '2026-11-17,2026-11-18,2026-11-19' && R.b1.filter((b) => b.wf === '⚠🗽').length === 2 && R.b0.filter((b) => !b.cur).every((b) => b.top === '🔍≤2') && R.b0.find((b) => b.cur).top === '$955' && !R.b0.some((b) => b.star)),
      'PIA-141 AC5 / AC2 / AC3 S1 with real clicks, at every width: 10 weeks on 2 pages (7 then 3), every bar ≥44px, ◀ ▶ on their own row below, no sideways scroll; 5 weeks carry ⚠🗽, every other hollow week costs 🔍≤2, the plan\'s week is outlined at $955 and nothing has ★', real.map((R) => ({ w: R.width, bars: R.b0.map((b) => Math.round(b.w) + 'x' + Math.round(b.h)), o: R.o0 })));
    check(real.every((R) => R.cost && R.cost[0] === '🔍2' && R.cost[1] === 'Search 2 fares, 2 searches' && R.sent === 2 && R.b2.find((b) => b.v === '2026-11-22').top === '$890' && R.b2.find((b) => b.v === '2026-11-22').star && !R.b2.find((b) => b.cur).star && R.btn === 'Move' &&
      R.chips.indexOf('Ashwin, $440') >= 0 && R.chips.indexOf('Anjo, $450, own days') >= 0),
      'PIA-141 AC4 the pinned S1 sample with real clicks, at every width: 11/22 shows its cost first (🔍2), one tap sends 2 searches through the real Worker, and it reads $890 ★ (Ashwin $440, Anjo $450 her own days), the plan\'s $955 without; Move', real.map((R) => [R.width, R.cost, R.sent, R.btn]));
    check(real.every((R) => R.busy && R.busy[0] === '◷' && R.busy[1] === 'true' && R.back === 'P-dates' && /11\/22–12\/1/.test(R.readout) && /📉 11\/22–12\/1/.test(R.toast) && R.rec.departure === '2026-11-22' && R.rec.return === '2026-12-01'),
      'PIA-141 AC6 with real clicks: Move shows ◷ while its one write is out, then ‹ P-dates on the new plan (11/22–12/1) with its toast (↩); the record holds 11/22–12/01', real.map((R) => [R.width, R.busy, R.back, R.readout, R.toast]));
    check(real.every((R) => R.ask && R.ask[0] === '⚠🗽 Confirm' && R.ask[1] === 'Confirm' && R.askPosts === 0),
      'PIA-141 AC2 with real clicks: Move on a week that leaves Anjo\'s days out only asks (⚠🗽 Confirm, nothing sent), counted with its label', real.map((R) => [R.width, R.ask, R.askPosts]));
    check(real.every((R) => R.day && R.day[0] === '⛔ 17:00' && R.day[1] === 'Daily limit' && R.dayWhy === 'Daily limit' && R.visit && R.visit[0] === '⛔ ↻' && R.visit[1] === 'New visit'),
      'PIA-141 AC4 the PIA-140 locks on a week\'s button, at every width: ⛔ 17:00 (its tap says "Daily limit"), ⛔ ↻ at the visit\'s 8; nothing sent', real.map((R) => [R.width, R.day, R.dayWhy, R.visit]));
    check(real.every((R) => R.widen.join() === '⟦◀,▶⟧' && R.widened.searchEnd === '2026-12-13' && R.widened.searchStart === '2026-11-13' && R.widened.departure === '2026-11-20' && R.widened.bars.indexOf('2026-11-28') >= 0 && R.o2.every((x) => x <= 0)),
      'PIA-141 with real clicks: with no 📌, ⟦◀ ▶⟧ sit on the paging row; ▶⟧ saves ⟦11/13–12/13⟧ through the real Worker (the plan untouched) and the first new week (11/28) is on screen', real.map((R) => [R.width, R.widen, R.widened]));
    check(real.every((R) => R.undated.length === 7 && R.undated.every((b) => b.wf === '⚠🌴🗽' && b.w >= 44) && R.undated[0].v === '2026-12-18' && R.o3.every((x) => x <= 0)),
      'PIA-141 AC1 with real clicks: an undated idea\'s P-cheapest pages its 🌙4 weeks from 12/18, each ⚠🌴🗽, at every width', real.map((R) => [R.width, R.undated.length, R.undated[0] && R.undated[0].wf]));
    check(real.every((R) => R.focus && R.focus[0] === 'cmove' && R.focus[1]),
      'PIA-141 by keyboard, at every width: the focus that was on 🔍2 lands on Move once the week is priced (never on <body> inside the dialog)', real.map((R) => [R.width, R.focus]));
    check(eq(r360.taps, ['Ashwin', 'Searches left']) && r360.tapPop === 'P-cheapest' && r360.warnTap === 'Leaves days out' && r360.stillAsks === true,
      'PIA-141 nothing in P-cheapest looks like a dead control: a short tap on a face chip names it ("Ashwin"), on 🔍 26/30 "Searches left", on a left-out face\'s ⚠ "Leaves days out" (the confirm stays asked), each a counted label', { taps: r360.taps, warn: r360.warnTap, asks: r360.stillAsks });
    check(real.every((R) => R.uPop === 'P-dates' && R.uMoved && R.uMoved.lock && !R.uMoved.mode && R.uMoved.save === 'No change' && /12\/18–12\/22/.test(R.uMoved.readout) && R.uSave === 0 && !/🗑/.test(R.uToast) &&
      R.uRec && R.uRec.departure === '2026-12-18' && R.uRec.return === '2026-12-22'),
      'PIA-141 with real clicks, at every width: Move on the undated idea (⚠🌴🗽 Confirm) dates it 12/18–12/22, and ‹ P-dates reads those dates in dates mode (🔒 there, no ⟦window⟧ toggle), its Save with no change to send; closing it says no 🗑', real.map((R) => [R.width, R.uPop, R.uMoved, R.uSave, R.uToast]));
    check(r360.keys && ['cheapweek', 'weekcur', 'weekhollow', 'wcost', 'leaves', 'page', 'owndays', 'visit'].every((k) => r360.keys.indexOf(k) >= 0) && r360.keys2 && ['cheapest', 'weekfull'].every((k) => r360.keys2.indexOf(k) >= 0) && r360.keys3 && r360.keys3.indexOf('widen') >= 0,
      'PIA-141 P-cheapest\'s ⓘ explains every glyph it draws (📉, the plan\'s outline, a hollow and a filled week, 🔍≤2, ⚠, ◀ ▶, ⟦◀ ▶⟧, ★, own days underlined, the visit\'s dots)', { k: r360.keys, k2: r360.keys2, k3: r360.keys3 });
    // every walked organizer token phone: 📉 opens P-cheapest (counted, its bars ≤7 a page and ≥44px), or, greyed, names why
    const opened = cheapLog.filter((x) => x.pid === 'P-cheapest'), greyed = cheapLog.filter((x) => x.why);
    const badLay = opened.filter((x) => x.l0.bars.length > 7 || x.l0.bars.some((b) => b[0] < 44 || b[1] < 44) || x.l0.over > 0 || x.l0.pageOver > 0 || !x.l0.pagerBelow || x.back !== 'P-dates' || (x.l1 && (x.l1.bars.length > 7 || x.l1.bars.some((b) => b[0] < 44))));
    const worst = opened.filter((x) => /^prices /.test(x.who));
    check(opened.length >= 6 && badLay.length === 0 && worst.length === WIDTHS.length * 1 && worst.every((x) => x.l0.bars.length === 7 && x.l1 && /^🔍4\/\d+$/.test(x.cost || '')) &&
      ['Dates locked', 'Nobody follows plan'].every((w) => greyed.some((x) => x.why === w)) && greyed.every((x) => x.pid === 'P-dates'),
      'PIA-141 AC5 / AC6 on every organizer token phone and width, 📉 opens P-cheapest (≤7 bars a page, each ≥44px, the pager on its own row, no sideways scroll, ‹ back to P-dates; the worst case, 8 long names and four faces left out of every week, within 20 words, its hollow week 🔍4/n: the caps cut it short and say so), or, greyed, names why in a counted label ("Dates locked", "Nobody follows plan")',
      { opened: opened.map((x) => x.who + ' ' + x.l0.bars.length + (x.cost ? ' ' + x.cost : '')), greyed: greyed.map((x) => x.who + ' ' + x.why), badLay: badLay.map((x) => x.who) });
  }

  section('PIA-142 Trips › Family with real clicks: ≤4 trip columns a page at every width, ◀ ▶, 🗄 for the past trips, a cell opens that person with the answer row, the ghost row, ≤10 words in every state');
  {
    // the walk above: every page of every phone's board, at every width, 🗄 off and on
    const pages = famLog.filter((x) => x.board === true), ghosts = famLog.filter((x) => x.board === false), cells = famLog.filter((x) => 'sheet' in x);
    const badL = pages.filter((x) => x.cols > 4 || x.cols < 1 || x.small.length || x.over > 0 || !x.inside);
    check(pages.length >= 20 && badL.length === 0 && pages.some((x) => x.cols === 4) && pages.some((x) => /🗄/.test(x.who)),
      'PIA-142 AC6 every page of every board the walk drew (' + pages.length + ' pages on every phone with two trips, at 360/390/430, 🗄 off and on) has 1–4 trip columns, every column head, cell and face ≥44px, nothing past the screen', badL.slice(0, 4));
    check(ghosts.some((x) => x.ghost && x.over <= 0) && cells.length >= 5 && cells.every((x) => x.sheet === 'P-person' || x.sheet === 'P-face'),
      'PIA-142 the shelf-only phone\'s board is its ghost row; every first cell the walk tapped opened that person on that trip (P-person, or who-are-you first)', { ghosts: ghosts.length, cells: [...new Set(cells.map((x) => x.sheet))] });
  }
  const famHeads = (page) => page.$$eval('#screen #fam-board .hd', (es) => es.map((e) => e.getAttribute('data-id')));
  const cellOf = (page, id, code) => page.$eval('#screen button.cell[data-id="' + id + '"][data-code="' + code + '"]', (e) => ({ st: e.querySelector('.shape').getAttribute('data-k'), marks: [...e.querySelectorAll('.ov [data-k]')].map((x) => x.getAttribute('data-k')).sort().join() })).catch(() => null);
  // PIA-142 fix pass: what a write did is read once it is there, never after a fixed sleep. The respond path is a fresh GET and a
  // POST into the in-process Worker (which hashes the edit key with WebCrypto on Node's thread pool, late under load), so each of
  // these polls the outcome itself; the real-time ceiling only bounds how long a wait may take, it never decides a check
  const recOf = (net, id, code) => { const v = net.kv.map.get('idea:' + id); return v ? (JSON.parse(v).responses || {})[code] : undefined; };
  const untilRec = async (net, id, code, f) => {
    for (const end = performance.now() + 30000; performance.now() < end;) { const x = recOf(net, id, code); if (x && f(x)) return x; await new Promise((res) => setTimeout(res, 25)); }
    return recOf(net, id, code);
  };
  const untilQuiet = (page) => page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 30000 }).catch(() => {});
  const untilCell = (page, id, code, st) => page.waitForFunction(([id, code, st]) => { const e = document.querySelector('#screen button.cell[data-id="' + id + '"][data-code="' + code + '"] .shape'); return !!e && e.getAttribute('data-k') === st; },
    [id, code, st], { timeout: 30000 }).catch(() => {});
  const untilShared = (page, n) => page.waitForFunction((n) => (window.__shared || []).length >= n, n, { timeout: 30000 }).catch(() => {});
  const untilLabelGone = (page) => page.waitForFunction(() => { const b = document.querySelector('#lbl'); return !b || b.hidden; }, null, { timeout: 30000 }).catch(() => {});
  const lblNow = (page) => page.evaluate(() => { const b = document.querySelector('#lbl'); return b && !b.hidden ? b.textContent : null; });
  // a tap where the finger lands (an aria-disabled control too: Playwright's click waits for "enabled")
  const fingerTap = async (page, sel) => { const h = await page.$(sel); if (!h) return false; await h.scrollIntoViewIfNeeded().catch(() => {}); const b = await h.boundingBox(); if (!b) return false; await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); return true; };
  for (const width of WIDTHS) {
    // the worst case for names: 13 people (8 long names, two Sam Lees, unknown airports); fitNames keeps the screen at 10 words exactly
    const { ctx, page, net } = await phone('fam8', { width, worker: true });
    await page.click('#screen [data-act="seg"][data-v="family"]'); await settle(page, 150);
    const w = await measureScreen(page, 'fam8 @' + width + ' Family (13 people, long names, unknown airports)');
    const L = await page.evaluate(FAMCHK);
    const r = { words: w.length, rows: L.rows, names: L.names, cols: L.cols, small: L.small, over: L.over };
    if (width === 360) { await keyCheck(page, 'fam8 @360 Family'); await labelCheck(page, 'fam8 @360 Family', 'fam8@360'); }   // every mark, ×2, 🏠n, Not invited, own days
    await page.click('#screen button.cell[data-id="' + M8 + '"][data-code="bartholomewmontgomeryfitzgera-dj"]'); await settle(page, 150);
    r.sheet = await popupId(page); await measurePopup(page, 'fam8 @' + width + ' › P-person (Bartholomew, from his cell)');
    r.proxy = !!(await page.$('#sheet [data-act="answer"][data-v="out"][data-proxy="1"]'));
    if (width === 360) {
      await page.click('#sheet [data-act="answer"][data-v="out"][data-proxy="1"]');
      r.rec = await untilRec(net, M8, 'bartholomewmontgomeryfitzgera-dj', (x) => x.status === 'out'); await untilQuiet(page);
      await closeSheet(page);
      await untilCell(page, M8, 'bartholomewmontgomeryfitzgera-dj', 'out');
      r.cell = await cellOf(page, M8, 'bartholomewmontgomeryfitzgera-dj');
      await measureScreen(page, 'fam8 @360 Family after answering Out for Bartholomew');
      // a face whose name fitNames dropped still says it on a long press (and nothing happens)
      const lastFace = await page.$$('#screen .rowh .facebtn'), fb = lastFace[lastFace.length - 1];
      await fb.scrollIntoViewIfNeeded(); const box = await fb.boundingBox();
      const lbl = await fb.getAttribute('data-lbl'), sid = await screenId(page);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(650);
      r.press = await page.evaluate(() => { const b = document.querySelector('#lbl'); return b && !b.hidden ? b.textContent : null; });
      if (r.press) await measurePopup(page, 'fam8 @360 › long press on a face with no name beside it', '#lbl');
      await page.mouse.up(); await settle(page, 120);
      r.pressOk = r.press === lbl && (await screenId(page)) === sid && !(await popupId(page)) && !(await page.$('#screen .rowh.hl'));
    } else await closeSheet(page);
    check(r.words === 10 && r.rows === 13 && r.names === 5 && r.cols === 3 && !r.small.length && r.over <= 0 && r.sheet === 'P-person' && r.proxy &&
      (width !== 360 || (r.rec.status === 'out' && /^📞 /.test(r.rec.note) && r.cell.st === 'out' && /called/.test(r.cell.marks) && r.pressOk)),
      'PIA-142 AC6 @' + width + ' 13 people on 3 trips: 10 words exactly (fitNames keeps 5 names, every face stays), every target ≥44px, no sideways scroll; Bartholomew\'s cell opens his sheet with the organizer\'s answer row' +
      (width === 360 ? '; Out there is saved as 📞 through the real Worker and his cell turns ⊘ 📞; a face whose name was dropped names itself on a long press' : ''), r);
    await ctx.close();
  }
  {
    // the organizer: 8 trips on 2 pages, real clicks on ◀ ▶ and 🗄, a cell (his answer row, 📣), my own cell, a column head
    const { ctx, page, net } = await phone('organizer', { worker: true, share: true });
    await page.click('#screen [data-act="seg"][data-v="family"]'); await settle(page, 150);
    const r = {};
    r.p1 = await famHeads(page);
    {   // (aria-disabled: Playwright's click waits for "enabled", so the finger goes down on its centre itself)
      const bx = await (await page.$('#screen [data-act="fampage"][data-v="-1"]')).boundingBox();
      await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2);
    }
    r.why = await lblNow(page);   // (read at once: the label is drawn by the tap itself and goes on its own a moment later)
    if (r.why) await measurePopup(page, 'organizer Family › ◀ on the first page says why', '#lbl');
    r.still = await famHeads(page);
    await untilLabelGone(page);
    await page.click('#screen [data-act="fampage"][data-v="1"]'); await settle(page, 150);
    r.p2 = await famHeads(page); await measureScreen(page, 'organizer Family page 2 (a real click on ▶)');
    await page.click('#screen [data-act="fampast"]'); await settle(page, 150);
    r.past = await famHeads(page); r.pastCls = await page.$eval('#screen .hd[data-id="' + PAST + '"]', (e) => e.classList.contains('past')).catch(() => false);
    r.pressed = await page.$eval('#screen [data-act="fampast"]', (e) => e.getAttribute('aria-pressed'));
    await measureScreen(page, 'organizer Family 🗄 (the past trip\'s column, a real click)');
    {   // fix pass: a past trip nobody closed (Chicago, 9/11–9/14): my own cell is my sheet with my answer row greyed ("Trip over" on
        // a tap, nothing sent) and no 📣; and the past column's head names the trip on a long press (its title free, then its days)
      const p0 = net.posts;
      await page.click('#screen button.cell[data-id="' + PAST + '"][data-code="ashwin-p1"]'); await settle(page, 150);
      r.pastSheet = await popupId(page); await measurePopup(page, 'organizer Family 🗄 › my P-person on the past Chicago (Trip over)');
      r.pastNudge = !!(await page.$('#sheet [data-act="nudge"]'));
      r.pastRo = await page.$$eval('#sheet .answers [data-act="answer"]', (es) => es.map((e) => e.getAttribute('aria-disabled') + '|' + e.getAttribute('data-lbl')));
      await fingerTap(page, '#sheet [data-act="answer"][data-v="in"]'); r.pastWhy = await lblNow(page);
      if (r.pastWhy) await measurePopup(page, 'organizer Family 🗄 › In on a trip that is over says why', '#lbl');
      await untilLabelGone(page); await closeSheet(page);
      r.pastPosts = net.posts - p0;
      const hd = await page.$('#screen #fam-board .hd[data-id="' + PAST + '"]'), hb = await hd.boundingBox();
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await page.waitForTimeout(650);
      r.headLbl = await lblNow(page); if (r.headLbl) r.headWords = (await measurePopup(page, 'organizer Family 🗄 › long press on the past trip\'s head', '#lbl')).length;
      await page.mouse.up(); await untilLabelGone(page);
      r.headOk = r.headLbl === '🌆 Chicago weekend 9/11–9/14' && r.headWords === 0 && (await screenId(page)) === 'trips-family';
    }
    await page.click('#screen [data-act="fampast"]'); await settle(page, 150);
    for (let n = 0; n < 3 && (await page.$('#screen [data-act="fampage"][data-v="-1"]:not([aria-disabled="true"])')); n++) { await page.click('#screen [data-act="fampage"][data-v="-1"]'); await settle(page, 120); }
    r.home = await famHeads(page);
    await page.click('#screen button.cell[data-id="' + A + '"][data-code="anjo-z5"]'); await settle(page, 150);
    r.sheet = await popupId(page); await measurePopup(page, 'organizer Family › P-person Anjo on Diwali (from her cell)');
    r.proxy = !!(await page.$('#sheet [data-act="answer"][data-v="in"][data-proxy="1"]'));
    await page.click('#sheet [data-act="nudge"]'); await untilShared(page, 1);
    r.shared = await page.evaluate(() => window.__shared || []);
    await page.click('#sheet [data-act="answer"][data-v="in"][data-proxy="1"]');
    r.rec = await untilRec(net, A, 'anjo-z5', (x) => x.status === 'in'); await untilQuiet(page);
    await closeSheet(page);
    await untilCell(page, A, 'anjo-z5', 'in');
    r.focus = await page.evaluate(() => { const a = document.activeElement; return a ? a.getAttribute('data-act') + '|' + a.getAttribute('data-code') : ''; });
    r.cell = await cellOf(page, A, 'anjo-z5');
    r.foot = await page.$eval('#screen #fam-board .ft', (e) => e.textContent).catch(() => '');
    await measureScreen(page, 'organizer Family after answering In for Anjo');
    await page.click('#screen button.cell[data-id="' + B + '"][data-code="ashwin-l2"]'); await settle(page, 150);
    r.mine = await popupId(page); r.mineAns = !!(await page.$('#sheet [data-act="answer"][data-v="in"]:not([data-proxy])'));
    await measurePopup(page, 'organizer Family › my own P-person on Tahoe (my answer row)'); await closeSheet(page);
    await page.click('#screen #fam-board .hd[data-id="' + B + '"]'); await settle(page, 150);
    r.trip = await screenId(page);
    await page.click('#screen [data-act="back"]'); await settle(page, 150);
    r.backTo = await screenId(page);
    const okShare = r.shared.length === 1 && eq(Object.keys(r.shared[0]), ['url']) && r.shared[0].url === W + '/i/' + A + '#m=anjo-z5';
    check(r.p1.length === 4 && r.why === 'First page' && eq(r.still, r.p1) && r.p2.length === 4 && r.p2.every((id) => r.p1.indexOf(id) < 0) && eq(r.past, [PAST]) && r.pastCls && r.pressed === 'true' && eq(r.home, r.p1) &&
      r.sheet === 'P-person' && r.proxy && okShare && r.rec.status === 'in' && r.rec.note === '📞' && r.cell && r.cell.st === 'in' && r.cell.marks === 'called' && r.focus === 'fcell|anjo-z5' &&
      r.mine === 'P-person' && r.mineAns && r.trip === 'trip-portal' && r.backTo === 'trips-family' &&
      r.pastSheet === 'P-person' && !r.pastNudge && eq(r.pastRo, ['true|Trip over', 'true|Trip over', 'true|Trip over']) && r.pastWhy === 'Trip over' && r.pastPosts === 0 && r.headOk,
      'PIA-142 real clicks: ◀ on page 1 says "First page" and stays, ▶ shows the other 4 trips, 🗄 the past trip\'s column (pressed, dimmed head); Anjo\'s cell opens her sheet with the organizer\'s answer row: 📣 hands over her own link only, In saves 📞 through the real Worker and her cell turns ✓ 📞 (⌄ gives focus back to the cell); my own cell opens my sheet with my answer row; a column head opens that trip, ‹ comes back to the board; on the past trip nobody closed my answer row is greyed and says "Trip over" on a tap (nothing sent, no 📣), and its head\'s long press names it (title free, then its days)', r);
    await ctx.close();
  }
  {
    // the empty board (every trip on the shelf): the ghost row with ＋ and 🗄; 🗄 brings the past trip in; ＋ starts a trip
    const { ctx, page } = await phone('shelf');
    await page.click('#screen [data-act="seg"][data-v="family"]'); await settle(page, 150);
    const r = { id: await screenId(page), ghost: !!(await page.$('#screen [data-ghost="family"] .gface')) };
    await measureScreen(page, 'shelf phone › Family ghost row');
    await page.click('#screen [data-ghost="family"] [data-act="fampast"]'); await settle(page, 150);
    r.id2 = await screenId(page); r.heads = await famHeads(page); await measureScreen(page, 'shelf phone › Family 🗄 (the past trip)');
    await page.click('#screen [data-act="fampast"]'); await settle(page, 150);
    await page.click('#screen [data-ghost="family"] [data-act="new"]'); await settle(page, 150);
    r.new = await popupId(page); await measurePopup(page, 'shelf phone › ＋ from the ghost row'); await closeSheet(page);
    check(r.id === 'trips-family-empty' && r.ghost && r.id2 === 'trips-family' && eq(r.heads, [PAST]) && r.new === 'P-new-what',
      'PIA-142 AC6 an empty board (only a past and a dropped trip) shows its ghost row of dotted faces with ＋ (one tap: P-new-what) and 🗄, which brings the past trip in as a column (the dropped one never)', r);
    await ctx.close();
  }
  {
    // my name's cell on a trip this phone is nobody on yet: who-are-you first (my face outlined and focused), then my sheet
    const { ctx, page, net } = await phone('famface', { worker: true });
    await page.click('#screen [data-act="seg"][data-v="family"]'); await settle(page, 150);
    await page.click('#screen button.cell[data-id="' + B + '"][data-code="ashwin-l2"]'); await settle(page, 150);
    const r = { face: await popupId(page), mark: await page.evaluate(() => { const a = document.activeElement; return a && a.id === 'pf-mark' ? a.getAttribute('data-code') : null; }) };
    await measurePopup(page, 'famface › P-face from my Tahoe cell');
    await page.click('#sheet #pf-mark'); await settle(page, 150);
    r.next = await popupId(page); r.ans = !!(await page.$('#sheet [data-act="answer"][data-v="in"]:not([data-proxy])'));
    await measurePopup(page, 'famface › my P-person after picking myself');
    await page.click('#sheet [data-act="answer"][data-v="in"]');
    r.rec = await untilRec(net, B, 'ashwin-l2', (x) => x.status === 'in'); await untilQuiet(page);
    await closeSheet(page);
    await untilCell(page, B, 'ashwin-l2', 'in');
    r.me = await page.evaluate((id) => JSON.parse(localStorage.getItem('pialax_idea_me_v1') || '{}')[id], B);
    r.cell = await cellOf(page, B, 'ashwin-l2');
    check(r.face === 'P-face' && r.mark === 'ashwin-l2' && r.next === 'P-person' && r.ans && r.rec.status === 'in' && r.rec.note === 'Depends on Thanksgiving dates' && r.me === 'ashwin-l2' && r.cell && r.cell.st === 'in',
      'PIA-142 AC4 my row\'s cell on a trip this phone is nobody on yet asks who I am first (Ashwin outlined and focused); one tap and my sheet with my answer row is there: In is my own answer (my note kept), this phone is Ashwin there now, and the cell turns ✓', r);
    await ctx.close();
  }
  {
    // fix pass: a first-run phone (Mom: a list link, no profile, no face, no token). Any cell's sheet carries 🙋 It's me and 🙋＋
    // (Bartholomew's, with the 8 long names, counted first); her own cell, one tap on 🙋 It's me, is her own sheet with her answer
    // row and In is her own answer. Once she is someone, a trip with nobody of her name offers 🙋＋ only, which opens P-face with
    // the join row open (‹ back to the sheet)
    const { ctx, page, net } = await phone('fammom', { worker: true });
    await page.click('#screen [data-act="seg"][data-v="family"]'); await settle(page, 150);
    await measureScreen(page, 'fammom › Family (this phone is nobody on any trip yet)');
    const bart = '#screen button.cell[data-id="' + M8 + '"][data-code="bartholomewmontgomeryfitzgera-dj"]';
    await page.click(bart); await settle(page, 150);
    const r = { b0: await popupId(page), bIam: !!(await page.$('#sheet [data-act="pickface"]')), bJoin: !!(await page.$('#sheet [data-act="pjoin"]')) };
    await measurePopup(page, 'fammom › P-person Bartholomew (8 long names) with 🙋 It\'s me and 🙋＋');
    await closeSheet(page);
    await page.click('#screen button.cell[data-id="' + A + '"][data-code="momdad-k3"]'); await settle(page, 150);
    Object.assign(r, { s0: await popupId(page), iam: !!(await page.$('#sheet [data-act="pickface"][data-code="momdad-k3"]')), ans0: !!(await page.$('#sheet [data-act="answer"]')) });
    await measurePopup(page, 'fammom › P-person Mom & Dad on Diwali (her own cell: 🙋 It\'s me)');
    await labelCheck(page, 'fammom › her own cell\'s sheet', 'fammom@360', 'sheet');
    await page.click('#sheet [data-act="pickface"]'); await settle(page, 150);
    r.s1 = await popupId(page); r.ans = !!(await page.$('#sheet [data-act="answer"][data-v="in"]:not([data-proxy])')); r.iam1 = !!(await page.$('#sheet [data-act="pickface"]'));
    await measurePopup(page, 'fammom › her own P-person after 🙋 It\'s me');
    await page.click('#sheet [data-act="answer"][data-v="in"]');
    r.rec = await untilRec(net, A, 'momdad-k3', (x) => x.status === 'in' && !/📞/.test(x.note || '')); await untilQuiet(page);
    await closeSheet(page);
    await untilCell(page, A, 'momdad-k3', 'in');
    r.cell = await cellOf(page, A, 'momdad-k3');
    r.me = await page.evaluate((id) => JSON.parse(localStorage.getItem('pialax_idea_me_v1') || '{}')[id], A);
    await page.click(bart); await settle(page, 150);
    r.b1Iam = !!(await page.$('#sheet [data-act="pickface"]')); r.b1Join = !!(await page.$('#sheet [data-act="pjoin"]'));
    await page.click('#sheet [data-act="pjoin"]'); await settle(page, 150);
    r.join = await popupId(page); r.joinFocus = await page.evaluate(() => (document.activeElement && document.activeElement.id) || '');
    await measurePopup(page, 'fammom › 🙋＋ from Bartholomew\'s sheet: P-face, the join row open');
    await page.click('#sheet [data-act="sh-back"]'); await settle(page, 150);
    r.back = await popupId(page);
    await closeSheet(page);
    r.paid = net.paid.length;
    check(r.b0 === 'P-person' && r.bIam && r.bJoin && r.s0 === 'P-person' && r.iam && !r.ans0 && r.s1 === 'P-person' && r.ans && !r.iam1 &&
      r.rec.status === 'in' && r.me === 'momdad-k3' && r.cell && r.cell.st === 'in' && r.cell.marks === '' && !r.b1Iam && r.b1Join && r.join === 'P-face' && r.joinFocus === 'join-name' && r.back === 'P-person' && r.paid === 0,
      'PIA-142 AC4 a first-run phone (no name, no face, no token): her own cell\'s sheet offers 🙋 It\'s me (no answer row); one tap and her own sheet with her answer row is there, In is her own answer (the organizer\'s 📞 goes) and her cell turns ✓; then, being Mom & Dad, a trip with nobody of her name offers 🙋＋ only: P-face with the join row open, ‹ back; no /search or /account', r);
    await ctx.close();
  }
  {
    // fix pass: the organizer's cell for Anjo on the unmigrated v1 Thanksgiving: his answer row is there, greyed; a tap says
    // "Update trip first" (PIA-146 brings that update) and sends nothing
    const { ctx, page, net } = await phone('famv1', { worker: true });
    await page.click('#screen [data-act="seg"][data-v="family"]'); await settle(page, 150);
    await measureScreen(page, 'famv1 › Family (the organizer of the v1 Thanksgiving)');
    const p0 = net.posts;
    await page.click('#screen button.cell[data-id="' + TG + '"][data-code="LGA"]'); await settle(page, 150);
    const r = { s: await popupId(page), ro: await page.$$eval('#sheet .answers [data-act="answer"]', (es) => es.map((e) => e.getAttribute('aria-disabled') + '|' + e.getAttribute('data-lbl'))) };
    await measurePopup(page, 'famv1 › P-person Anjo on the v1 Thanksgiving (Update trip first)');
    await fingerTap(page, '#sheet [data-act="answer"][data-v="in"]'); r.why = await lblNow(page);
    if (r.why) await measurePopup(page, 'famv1 › In on a v1 doc says why', '#lbl');
    await untilLabelGone(page); await closeSheet(page);
    r.posts = net.posts - p0;
    check(r.s === 'P-person' && eq(r.ro, ['true|⤒ Update trip first', 'true|⤒ Update trip first', 'true|⤒ Update trip first']) && r.why === '⤒ Update trip first' && r.posts === 0,
      'PIA-142 the organizer\'s cell on an unmigrated v1 doc: his answer row for them is there, greyed, and says "⤒ Update trip first" on a tap (PIA-152: ⤒ named by its glyph); nothing is sent', r);
    // PIA-152 AC1 / AC2 his v1 trip: the family's faces (🌽 💪 🗽, never a stand-in), and ⤒ Update trip pulsing as the trip view first
    // shows (the share pulse's .pulse); his tap on ⤒ takes it; a greyed "⤒ Update trip first" points to it: it pulses again as that
    // sheet closes; every state within the word budget, ⤒ still labelled "Update trip"
    const q = {};
    const migCls = () => page.$eval('#screen [data-act="migrate"]', (e) => (e.classList.contains('pulse') ? 'pulse' : 'still') + '|' + e.getAttribute('aria-label') + '|' + e.textContent).catch(() => 'none');
    await page.click('#screen .hd[data-act="open"][data-id="' + TG + '"]'); await settle(page, 200);
    q.open = await migCls(); await measureScreen(page, 'famv1 › the v1 Thanksgiving (⤒ pulsing)');
    q.faces = await page.$$eval('#screen .pb-row .facebtn[data-act="person"] .av .f', (es) => es.map((e) => e.textContent).join(''));
    q.stand = /🦄|🍩|🐻/.test(await page.$eval('#screen', (e) => e.textContent));
    await fingerTap(page, '#screen [data-act="migrate"]'); await settle(page, 150); q.mig = await popupId(page);
    await closeSheet(page); q.taken = await migCls();
    const faceSel = '#screen .pb-row .facebtn[data-act="person"][data-code="LGA"]';
    await page.$eval(faceSel, (e) => e.scrollIntoView({ block: 'center' })).catch(() => {});   // (clear of the tab bar, which a finger would hit instead)
    await fingerTap(page, faceSel); await settle(page, 150); q.p = await popupId(page);
    await fingerTap(page, '#sheet [data-act="answer"][data-v="in"]'); q.why = await lblNow(page);
    q.under = await migCls();
    await untilLabelGone(page); await closeSheet(page); q.pointed = await migCls();
    await measureScreen(page, 'famv1 › the v1 Thanksgiving (⤒ pointed to again)');
    q.posts = net.posts - p0;
    check(q.open === 'pulse|Update trip|⤒' && /🌽/.test(q.faces) && /💪/.test(q.faces) && /🗽/.test(q.faces) && !q.stand && q.mig === 'P-migrate' && q.taken === 'still|Update trip|⤒' && q.p === 'P-person' &&
      q.why === '⤒ Update trip first' && q.under === 'still|Update trip|⤒' && q.pointed === 'pulse|Update trip|⤒' && q.posts === 0,
      'PIA-152 AC1/AC2 the organizer\'s v1 Thanksgiving shows 🌽 💪 🗽 (no stand-in face); its ⤒ pulses as the trip view first shows, labelled "Update trip"; his tap on ⤒ (P-migrate) takes it; a tap on a greyed In says "⤒ Update trip first" and ⤒ pulses again once that sheet closes; within the word budget; nothing sent', q);
    await ctx.close();
  }

  section('PIA-153 housekeeping in two taps, 👪 the plan vs my face my days, ⤒ Update trip from the card, the v1 trip\'s flight section, one pulse at a time (Chromium, words counted)');
  for (const width of WIDTHS) {
    // the organizer of the v1 Thanksgiving (its "Me" at LAX: own 11/20–11/29, the plan 11/25–11/29) and Diwali (not his to organize here)
    const { ctx, page, net } = await phone('famv1', { width, worker: true });
    const tag = (s) => 'famv1 @' + width + ' › ' + s, q = { width }, p0 = net.posts;
    const cls = (sel) => page.$eval(sel, (e) => (e.classList.contains('pulse') ? 'pulse' : 'still') + '|' + (e.getAttribute('data-lbl') || e.getAttribute('aria-label'))).catch(() => 'none');
    q.card = await cls('#screen [data-trip="' + TG + '"] [data-act="migcard"]'); q.key = await cls('#screen [data-act="key"]');
    q.stageTG = await cls('#screen [data-trip="' + TG + '"] [data-act="stage"]'); q.stageA = await cls('#screen [data-trip="' + A + '"] [data-act="stage"]');
    q.noMigA = !(await page.$('#screen [data-trip="' + A + '"] [data-act="migcard"]'));
    q.box = await page.$$eval('#screen .card [data-act="stage"], #screen .card [data-act="migcard"]', (es) => es.every((e) => { const b = e.getBoundingClientRect(); return b.width >= 43.5 && b.height >= 43.5; }));
    await measureScreen(page, tag('Trips (⤒ on the v1 card, the stage discs as buttons)'));
    if (width === 360) { await keyCheck(page, tag('Trips')); await labelCheck(page, tag('Trips'), 'famv1-153@360'); }
    // tap 1: Diwali's stage disc → P-stage (☆ 🗄, no 🗑: he does not organize it here); tap 2: 🗄 → the shelf; back with 🗄 again
    await fingerTap(page, '#screen [data-trip="' + A + '"] [data-act="stage"]'); await settle(page, 120); q.stagePop = await popupId(page);
    q.drop = !!(await page.$('#sheet [data-act="stagedrop"]'));
    await measurePopup(page, tag('P-stage from the Diwali card'));
    await fingerTap(page, '#sheet [data-act="hidehere"]'); await settle(page, 120); await closeSheet(page);
    q.hidden = !(await page.$('#screen > .card[data-trip="' + A + '"]')) && !!(await page.$('#screen [data-act="shelf"]'));
    await page.click('#screen [data-act="shelf"]'); await settle(page, 120);
    await fingerTap(page, '#screen [data-trip="' + A + '"] [data-act="stage"]'); await settle(page, 120); await fingerTap(page, '#sheet [data-act="hidehere"]'); await settle(page, 120); await closeSheet(page);
    q.back = !!(await page.$('#screen [data-trip="' + A + '"]:not(.dim)'));
    // the v1 card's P-stage: 🗑 greyed, "⤒ Update trip first" on a tap
    await fingerTap(page, '#screen [data-trip="' + TG + '"] [data-act="stage"]'); await settle(page, 120);
    if (width === 360) await labelCheck(page, tag('P-stage (v1 trip)'), 'famv1-153-stage', 'sheet');
    await fingerTap(page, '#sheet [data-act="stagedrop"]'); q.dropWhy = await lblNow(page);
    if (q.dropWhy) await measurePopup(page, tag('P-stage 🗑 says why'), '#lbl');
    await untilLabelGone(page); await measurePopup(page, tag('P-stage (v1 trip)')); await closeSheet(page);
    // one tap on the card's ⤒: the trip, with ⤒ Update trip over it (its picture and name first, the longest name typed)
    await fingerTap(page, '#screen [data-trip="' + TG + '"] [data-act="migcard"]'); await settle(page, 200);
    q.mig = await popupId(page) + '|' + await screenId(page);
    await measurePopup(page, tag('P-migrate (picture, name, plans)'));
    await page.fill('#mig-title', ''); await page.type('#mig-title', 'Our very long family reunion trip name that keeps going on and on and on', { delay: 0 });
    await page.click('#sheet [data-act="migplan"][data-v="span"]'); await settle(page, 80);
    q.pressed = await page.$$eval('#sheet [data-act="migplan"]', (es) => es.map((e) => e.getAttribute('aria-pressed') + '|' + getComputedStyle(e).backgroundColor));
    await measurePopup(page, tag('P-migrate (a 12-word name typed, Travelers chosen)'));
    if (width === 360) await labelCheck(page, tag('P-migrate'), 'famv1-153-mig', 'sheet');
    await closeSheet(page);
    // the trip view: 👪 on the plan's pill, 💪 on his own days with ⚠; ⓘ explains them; one tap → P-mine (Follow plan, Keep mine)
    q.pill = await page.$eval('#screen .daterow [data-act="dates"] [data-k="plan"]', (e) => e.textContent).catch(() => '');
    q.line = await page.$eval('#screen [data-act="mine"]', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
    await measureScreen(page, tag('the v1 Thanksgiving (👪 plan, 💪 my days ⚠)'));
    if (width === 360) await keyCheck(page, tag('the v1 Thanksgiving'));
    await fingerTap(page, '#screen [data-act="mine"]'); await settle(page, 120); q.minePop = await popupId(page);
    q.mineActs = await page.$$eval('#sheet [data-act^="mine"]', (es) => es.map((e) => e.getAttribute('data-act')));
    await measurePopup(page, tag('P-mine (v1 trip: Follow plan, Keep mine, Make plan greyed)'));
    if (width === 360) await labelCheck(page, tag('P-mine'), 'famv1-153-mine', 'sheet');
    // (fix pass) the greyed Make plan says why on a tap: "⤒ Update trip first"
    await fingerTap(page, '#sheet [data-act="mineplan"]'); q.planWhy = await lblNow(page);
    if (q.planWhy) await measurePopup(page, tag('P-mine Make plan says why'), '#lbl');
    await untilLabelGone(page);
    await fingerTap(page, '#sheet [data-act="minekeep"]'); await settle(page, 120);
    q.kept = !(await popupId(page)) && !(await page.$('#screen [data-act="mine"] [data-k="notplan"]')) && !!(await page.$('#screen [data-act="mine"]'));
    // Anjo's sheet on his phone: ⤒ in its header, his 🎫 for her greyed ("⤒ Update trip first": the header's ⤒ pulses)
    const faceSel = '#screen .pb-row .facebtn[data-act="person"][data-code="LGA"]';
    await page.$eval(faceSel, (e) => e.scrollIntoView({ block: 'center' })).catch(() => {});
    await fingerTap(page, faceSel); await settle(page, 150);
    q.hdr = !!(await page.$('#sheet .sh-hd [data-act="migrate"]'));
    await fingerTap(page, '#sheet [data-act="booked"][data-code="LGA"]'); q.tkWhy = await lblNow(page);
    q.hdrPulse = await page.$eval('#sheet .sh-hd [data-act="migrate"]', (e) => e.classList.contains('pulse')).catch(() => false);
    await untilLabelGone(page); await measurePopup(page, tag('P-person Anjo (⤒ in the header, 🎫 greyed)')); await closeSheet(page);
    q.posts = net.posts - p0;
    check(q.card === 'pulse|Update trip' && q.key === 'still|Key' && q.stageTG === 'still|Asking' && q.stageA === 'still|Asking' && q.noMigA && q.box && q.stagePop === 'P-stage' && !q.drop && q.hidden && q.back &&
      q.dropWhy === '⤒ Update trip first' && q.mig === 'P-migrate|trip-organizer' && q.pressed.length === 2 && q.pressed[1].startsWith('true') && q.pressed[0].startsWith('false') && q.pressed[0].split('|')[1] !== q.pressed[1].split('|')[1] &&
      q.pill === '👪' && /^💪 ?11\/20–11\/29 ⚠$/.test(q.line) && q.minePop === 'P-mine' && eq(q.mineActs, ['minefollow', 'minekeep', 'mineplan']) && q.planWhy === '⤒ Update trip first' && q.kept && q.hdr && q.tkWhy === '⤒ Update trip first' && q.hdrPulse && q.posts === 0,
      'PIA-153 @' + width + ' the organizer\'s list: the v1 card\'s ⤒ pulses alone (ⓘ waits), every stage disc is a 44px button; Diwali hidden and back in two taps each; the v1 trip\'s 🗑 says "⤒ Update trip first"; the card\'s ⤒ opens P-migrate over the trip (picture, name, Travelers filled); the trip view reads 👪 over 💪 11/20–11/29 ⚠, P-mine offers Follow plan / Keep mine and a greyed Make plan ("⤒ Update trip first") (kept: ⚠ quiet); on Anjo\'s sheet ⤒ sits in the header and his greyed 🎫 points to it; nothing sent', q);
    await ctx.close();
  }
  {
    // AC4a Anjo's own phone on the v1 Thanksgiving: [✈ Book ↗ | 🎫] in her flight section, and once booked her time fields (the real Worker)
    const { ctx, page, net } = await phone('guest', { worker: true, url: '?idea=' + TG });
    await settle(page, 200);
    await jsClick(page, '#screen .me [data-act="person"]'); await settle(page, 150);
    const r = { pop: await popupId(page), book: !!(await page.$('#sheet .split a[data-ret] + [data-act="mybook"]')) };
    await measurePopup(page, 'guest › her flight section on the v1 Thanksgiving ([Book | 🎫])');
    await fingerTap(page, '#sheet [data-act="mybook"]'); await page.waitForFunction(() => !!document.querySelector('#sheet #tm-arr'), null, { timeout: 15000 }).catch(() => {});
    r.times = !!(await page.$('#sheet #tm-arr')) && !!(await page.$('#sheet #tm-dep'));
    r.booked = JSON.parse(net.kv.map.get('idea:' + TG)).responses.LGA.booked === true;
    await measurePopup(page, 'guest › booked on the v1 Thanksgiving (her time fields)');
    await closeSheet(page);
    check(r.pop === 'P-person' && r.book && r.times && r.booked, 'PIA-153 AC4a Anjo on the family\'s v1 Thanksgiving: her flight section is [✈ Book ↗ | 🎫] as on a v2 trip; her 🎫 lands on the v1 record (the real Worker) and her 🛬 / 🛫 time fields follow, within the word budget', r);
    await ctx.close();
  }

  section('AC5 the key, labels and ⚙; nothing else reached the network; no console errors');
  {
    const org = seenOn('organizer@360'), deep = NAMES.map((n) => n + '@360').filter((w) => pressLog[w]);
    check(org.labels.size >= 12 && org.glyphs.size >= 10 && deep.every((w) => pressLog[w].labels.size + pressLog[w].glyphs.size > 0),
      'long-press named every labelled control and glyph once per phone (organizer: ' + org.labels.size + ' controls, ' + org.glyphs.size + ' glyphs; ' + pressed + ' presses on all phones) and triggered none of them',
      deep.map((w) => w + ' ' + pressLog[w].labels.size + '/' + pressLog[w].glyphs.size));
  }
  {
    const tf = a11yLog.filter((x) => x.what === 'toggle focus'), cn = a11yLog.filter((x) => x.what === 'chip names');
    check(tf.length >= 2 && tf.every((x) => x.good), 'PIA-135 P-sharelist by keyboard: Space on a trip toggle flips it and keeps focus on that toggle after the sheet is rebuilt (' + tf.length + ' runs)', tf.filter((x) => !x.good).slice(0, 3));
    check(cn.length >= 1 && cn.every((x) => x.good), 'PIA-135 every P-sharelist group chip has its own accessible name, its people ("' + ((cn[0] || {}).chipNames || []).join('", "') + '")', cn.filter((x) => !x.good).slice(0, 3));
    const sheetG = Object.keys(pressLog).filter((w) => / sheet$/.test(w)).reduce((s, w) => s + pressLog[w].glyphs.size + pressLog[w].labels.size, 0);
    check(sheetG > 0 && pressLog['organizer@360 sheet'] && pressLog['organizer@360 sheet'].glyphs.size >= 3, 'PIA-135 long-press names the glyphs and controls in P-sharelist and P-savelist too (' + sheetG + ' named; organizer P-sharelist: ' + [...((pressLog['organizer@360 sheet'] || {}).glyphs || [])].join(', ') + ')');
  }
  check(stray.length === 0, 'no request left for anything but the Worker (its /idea routes, and on the organizer\'s phone /search and /account)', [...new Set(stray)].slice(0, 5));
  check(consoleErrs.length === 0, 'no console error or page error on any phone', consoleErrs.slice(0, 5));
  ok('counted ' + screensCounted + ' screens and ' + popupsCounted + ' popups');
  check(worst.screen.n <= SCREEN_MAX, 'busiest screen: ' + worst.screen.n + ' words (' + worst.screen.label + ': ' + worst.screen.words + ')');
  check(worst.popup.n <= POPUP_MAX, 'busiest popup: ' + worst.popup.n + ' words (' + worst.popup.label + ': ' + worst.popup.words + ')');
  await browser.close();
  return failCount ? 1 : 0;
}

main().then((code) => {
  if (passCount || failCount) {
    console.log('');
    if (failCount) console.log(failCount + ' failing, ' + passCount + ' passing');
    else console.log('all ' + passCount + ' word-gate checks passing');
  }
  process.exit(code);
}).catch((e) => { console.log('  XX  suite crashed: ' + (e && e.stack ? e.stack : e)); console.log('1 failing'); process.exit(1); });

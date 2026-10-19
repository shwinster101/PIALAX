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
const APP_URL = 'file://' + path.join(ROOT, 'app.html');
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
  eight: { ls: { pialax_watchlist_v2: listRec([M8]), pialax_idea_me_v1: { [M8]: 'grandmajosephine-nf' }, pialax_ui_v1: { v1read: 1 } } },
  shelf: { ls: { pialax_watchlist_v2: listRec([PAST, DROP]), pialax_idea_me_v1: { [PAST]: 'ashwin-p1', [DROP]: 'ashwin-d1' }, pialax_ui_v1: { v1read: 1 } } },   // every trip on the shelf
  fresh: { ls: {} },
  widest: { ls: { pialax_watchlist_v2: listRec([WC1, WC2, OJ]), pialax_idea_keys_v1: keyRec([WC1, OJ]), pialax_proxy_token: TOKEN, pialax_fares_v2: FARES,   // PIA-135: the widest card, and a half-priced open-jaw traveler
    pialax_idea_me_v1: { [WC1]: 'ashwin-w1', [WC2]: 'ashwin-w9', [OJ]: 'ashwin-o1' }, pialax_ui_v1: { v1read: 1 } } }
};
const KEYS = { [A]: KEY, [LT]: KEY, [UK]: KEY, [DROP]: KEY, [WC1]: KEY, [OJ]: KEY };

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
    const net = { mode: o.mode || 'ok', gets: 0, posts: 0, delay: o.delay || {} };   // delay: {id: ms} holds that trip's answers
    await ctx.route(/^https?:\/\//, (r) => { stray.push(r.request().url()); return r.abort(); });
    await ctx.route(W + '/**', async (route) => {
      const q = route.request(), u = new URL(q.url()), id = u.searchParams.get('id');
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, X-Idea-Key', 'content-type': 'application/json' };
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
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
  // every icon-only control has a 1–3 word label; a long-press shows it (≤20 words) and never triggers the control.
  // where = 'screen' (the screen and tab bar) or 'sheet' (the open sheet: its glyphs are named too, PIA-135)
  async function labelCheck(page, label, who, where) {
    const inSheet = where === 'sheet';
    const els = await page.evaluate((sh) => {
      const out = [], vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
      [...document.querySelectorAll(sh ? '#sheet button, #sheet a, #sheet [role="img"]' : '#screen button, #screen a, #screen [role="img"], #tabbar button')].filter(vis).forEach((el, i) => {
        const txt = (el.innerText || '').trim(), lbl = el.getAttribute('data-lbl') || el.getAttribute('aria-label') || '';
        const iconOnly = !/\p{L}/u.test(txt) && !el.closest('[data-free]');
        el.setAttribute('data-tw', String(i));
        out.push({ i, tag: el.tagName, txt, lbl, iconOnly, face: !!el.querySelector('.av'), pe: getComputedStyle(el).pointerEvents });
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
      if (!e.lbl || seen.labels.has(e.lbl) || e.pe === 'none' || (e.face && seen.faces >= 3)) continue;
      const c = await centre('[data-tw="' + e.i + '"]'); if (!c) continue;
      const hit = await page.evaluate(([x, y, i]) => { const t = document.elementFromPoint(x, y); return !!(t && t.closest('[data-tw="' + i + '"]')); }, [c.x, c.y, e.i]);
      if (!hit) continue;
      seen.labels.add(e.lbl); if (e.face) seen.faces++;
      const r = await press(c.x, c.y);
      if (r.shown !== e.lbl) bad('long-press on "' + e.lbl + '" (' + label + ') showed ' + JSON.stringify(r.shown));
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
    if (await page.$('#screen [data-act="shelf"]')) { await page.click('#screen [data-act="shelf"]'); await settle(page, 120); await visit('Trips shelf open'); await page.click('#screen [data-act="shelf"]'); await settle(page, 120); }
    if (await page.$('#screen [data-act="seg"][data-v="family"]')) { await page.click('#screen [data-act="seg"][data-v="family"]'); await settle(page, 120); await visit('Family'); await page.click('#screen [data-act="seg"][data-v="ideas"]'); await settle(page, 120); }
    if (await page.$('#screen [data-act="shelf"][aria-expanded="false"]')) { await page.click('#screen [data-act="shelf"]'); await settle(page, 100); }
    const trips = await page.evaluate(() => [...document.querySelectorAll('#screen [data-trip]')].map((e) => e.getAttribute('data-trip')));
    for (const id of trips) {
      await openCard(page, id); await settle(page, 150);
      await visit('trip ' + id);
      await page.click('#screen [data-act="back"]'); await settle(page, 120);
    }
    for (const tab of ['map', 'cal']) {
      await page.click('#tabbar [data-act="tab"][data-v="' + tab + '"]'); await settle(page, 150);
      await visit(tab);
      const chips = await page.evaluate(() => [...document.querySelectorAll('#screen [data-act="pick"]')].map((e) => e.getAttribute('data-id')));
      for (const id of chips) { await page.click('#screen [data-act="pick"][data-id="' + id + '"]'); await settle(page, 100); await measureScreen(page, tag(tab + ' chip ' + id)); }
    }
    await page.click('#tabbar [data-act="tab"][data-v="trips"]'); await settle(page, 120);
    // popups reachable from the shell: ＋ (P-new frame), ⚙ in every state
    if (deep) {
      const plus = await page.$('#screen [data-act="new"]');
      if (plus) { await plus.click(); await settle(page, 120); await measurePopup(page, tag('P-new')); await closeSheet(page); }
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
  const NAMES = ['organizer', 'guest', 'host', 'eight', 'shelf', 'fresh'];
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

  // ═══ AC5 summary, network, console ═══
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
  check(stray.length === 0, 'no request left for anything but the Worker\'s /idea routes', [...new Set(stray)].slice(0, 5));
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

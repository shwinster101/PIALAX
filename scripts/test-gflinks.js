'use strict';
// test-gflinks.js — PIA-133: the one link builder (scripts/trip-model.js).
//
// Every hand-off is computed from the /idea record: Google Flights (tfs, with
// the q= form only when the encoder fails), Explore for an idea without a
// place, Flighty once a traveler is booked, and the calendar event (Google
// TEMPLATE link and .ics text). Each acceptance criterion of PIA-133 has a
// named group below (AC1 … AC9).
//
// Golden strings: E1, E2, E3, E6 and E7 were opened live in Google Flights on
// 2026-10-17. The v2 sample links are encoder output pinned here; each still
// owes one manual open in Google Flights before ship (listed as "owed" in the
// output). Nothing here calls Google: fetch and Node's http/https/net are
// stubbed to fail, and today is pinned to 2026-10-17 (TEST-DEFLAKE-AGE).

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const net = require('net');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const TODAY = '2026-10-17';
const NOW = Date.UTC(2026, 9, 17, 19, 0, 0);
const KEY = 'pialax-test-edit-key-0123456789abcdefghijk';   // the shape of a real edit key (IDEA_KEY_RE)
const TOKEN = 'pialax-organizer-token-0123456789';          // the shape of a real organizer token

let passCount = 0;
let failCount = 0;
function check(ok, msg, detail) {
  if (ok) { console.log('  OK  ' + msg); passCount++; return; }
  console.log('  XX  ' + msg + (detail === undefined ? '' : '\n        ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))));
  failCount++;
}
function section(title) { console.log('\n▶ ' + title); }
function note(msg) { console.log('  ··  ' + msg); }

// ---- offline: no path in this suite (or in the model) may touch the network ----
const netCalls = [];
const refuse = (what) => (...a) => { netCalls.push(what + ' ' + String(a[0])); throw new Error('network disabled in test-gflinks'); };
globalThis.fetch = async (u) => { netCalls.push('fetch ' + String(u)); throw new Error('network disabled in test-gflinks'); };
[http, https].forEach((mod) => { mod.request = refuse('http.request'); mod.get = refuse('http.get'); });
net.connect = refuse('net.connect'); net.createConnection = refuse('net.createConnection');

const M = require(path.join(ROOT, 'scripts', 'trip-model.js'));
const fx = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', name), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tweak = (doc, f) => { const d = clone(doc); f(d); return d; };
const ctx = (over) => Object.assign({ today: TODAY, now: NOW }, over || {});
const model = (doc, over) => M.tripModel(doc, ctx(over));
const mem = (m, code) => m.members.find((x) => x.code === code);
function R(status, origin, from, to, extra) {
  return Object.assign({ status, origin, available_from: from || '', available_to: to || '', note: '', arrive_at: '', leave_from: '', updated_at: '2026-10-16T00:00:00.000Z' }, extra || {});
}

// ---- golden links --------------------------------------------------------
const GF = 'https://www.google.com/travel/flights/search?tfs=';
const TAIL = '&hl=en&gl=us&curr=USD';
const LIVE = {   // opened live in Google Flights on 2026-10-17
  E1: GF + 'CBwQAhoeEgoyMDI2LTExLTIwagcIARIDTEFYcgcIARIDUElBGh4SCjIwMjYtMTEtMjlqBwgBEgNQSUFyBwgBEgNMQVhAAUgBcAGCAQsI____________AZgBAQ' + TAIL,
  E2: GF + 'CBwQAhoeEgoyMDI2LTExLTIwagcIARIDTEFYcgcIARIDUElBGh4SCjIwMjYtMTEtMjlqBwgBEgNPUkRyBwgBEgNMQVhAAUgBcAGCAQsI____________AZgBAw' + TAIL,
  E3: GF + 'CBwQAhoeEgoyMDI2LTExLTIwagcIARIDUElBcgcIARIDUkRVGh4SCjIwMjYtMTEtMjlqBwgBEgNSRFVyBwgBEgNQSUFAAUABSAFwAYIBCwj___________8BmAEB' + TAIL,
  E6: GF + 'CBwQAhonEgoyMDI2LTExLTIwagcIARIDTEdBagcIARIDSkZLcgcIARIDUElBGicSCjIwMjYtMTEtMjlqBwgBEgNQSUFyBwgBEgNMR0FyBwgBEgNKRktAAUgBcAGCAQsI____________AZgBAQ' + TAIL,
  E7: GF + 'CBwQAhokEgoyMDI2LTExLTIwKAAyAlVBagcIARIDTEFYcgcIARIDT1JEGiQSCjIwMjYtMTEtMjkoADICVUFqBwgBEgNPUkRyBwgBEgNMQVhAAUABSAFwAYIBCwj___________8BmAEB' + TAIL,
};
const OWED = {   // the v2 sample links: encoder output, each owes one manual open in Google Flights before ship
  tgAshwin: GF + 'CBwQAhpCEgoyMDI2LTExLTIwagcIARIDTEFYagcIARIDQlVSagcIARIDTEdCagcIARIDU05BagcIARIDT05UcgcIARIDUElBGkISCjIwMjYtMTEtMjlqBwgBEgNPUkRyBwgBEgNMQVhyBwgBEgNCVVJyBwgBEgNMR0JyBwgBEgNTTkFyBwgBEgNPTlRAAUgBcAGCAQsI____________AZgBAw' + TAIL,
  tgAshIn: GF + 'CBwQAhpCEgoyMDI2LTExLTIwagcIARIDTEFYagcIARIDQlVSagcIARIDTEdCagcIARIDU05BagcIARIDT05UcgcIARIDUElBQAFIAXABggELCP___________wGYAQI' + TAIL,
  tgAshOut: GF + 'CBwQAhpCEgoyMDI2LTExLTI5agcIARIDT1JEcgcIARIDTEFYcgcIARIDQlVScgcIARIDTEdCcgcIARIDU05BcgcIARIDT05UQAFIAXABggELCP___________wGYAQI' + TAIL,
  tgAnjo: GF + 'CBwQAhowEgoyMDI2LTExLTI0agcIARIDTEdBagcIARIDSkZLagcIARIDRVdScgcIARIDUElBGjASCjIwMjYtMTEtMjlqBwgBEgNPUkRyBwgBEgNMR0FyBwgBEgNKRktyBwgBEgNFV1JAAUgBcAGCAQsI____________AZgBAw' + TAIL,
  dwAsh: GF + 'CBwQAhpCEgoyMDI2LTExLTA2agcIARIDTEFYagcIARIDQlVSagcIARIDTEdCagcIARIDU05BagcIARIDT05UcgcIARIDUkRVGkISCjIwMjYtMTEtMDlqBwgBEgNSRFVyBwgBEgNMQVhyBwgBEgNCVVJyBwgBEgNMR0JyBwgBEgNTTkFyBwgBEgNPTlRAAUgBcAGCAQsI____________AZgBAQ' + TAIL,
  dwAshP1: GF + 'CBwQAhpCEgoyMDI2LTExLTA3agcIARIDTEFYagcIARIDQlVSagcIARIDTEdCagcIARIDU05BagcIARIDT05UcgcIARIDUkRVGkISCjIwMjYtMTEtMTBqBwgBEgNSRFVyBwgBEgNMQVhyBwgBEgNCVVJyBwgBEgNMR0JyBwgBEgNTTkFyBwgBEgNPTlRAAUgBcAGCAQsI____________AZgBAQ' + TAIL,
  dwMD: GF + 'CBwQAhonEgoyMDI2LTExLTA2agcIARIDUElBagcIARIDT1JEcgcIARIDUkRVGicSCjIwMjYtMTEtMDlqBwgBEgNSRFVyBwgBEgNQSUFyBwgBEgNPUkRAAUABSAFwAYIBCwj___________8BmAEB' + TAIL,
  dwAnjo: GF + 'CBwQAhowEgoyMDI2LTExLTA2agcIARIDTEdBagcIARIDSkZLagcIARIDRVdScgcIARIDUkRVGjASCjIwMjYtMTEtMDlqBwgBEgNSRFVyBwgBEgNMR0FyBwgBEgNKRktyBwgBEgNFV1JAAUgBcAGCAQsI____________AZgBAQ' + TAIL,
};
// the q= fallback strings opened live on 2026-10-17 (research cases 1 and 4)
const Q = 'https://www.google.com/travel/flights?q=';
const LIVE_Q = {
  rt: Q + 'Flights%20from%20LAX%20to%20PIA%20on%202026-11-20%20through%202026-11-29' + TAIL,
  ow: Q + 'Flights%20from%20LAX%20to%20PIA%20on%202026-11-20%20one%20way' + TAIL,
  rt2: Q + 'Flights%20from%20PIA%20to%20RDU%20on%202026-11-20%20through%202026-11-29%20for%202%20adults' + TAIL,
  ow2: Q + 'Flights%20from%20LAX%20to%20ORD%20on%202026-11-20%20one%20way%20for%202%20adults' + TAIL,
};
// the verified q= grammar, nothing else
const Q_RE = /^Flights from ([A-Z]{3}) to ([A-Z]{3}) on (\d{4}-\d{2}-\d{2})(?: through (\d{4}-\d{2}-\d{2})| one way)(?: for ([2-9]) adults)?$/;
function qDecode(href) {
  if (typeof href !== 'string' || href.indexOf(Q) !== 0 || href.slice(-TAIL.length) !== TAIL) return null;
  const enc = href.slice(Q.length, -TAIL.length);
  let phrase; try { phrase = decodeURIComponent(enc); } catch (e) { return null; }
  const m = Q_RE.exec(phrase);
  if (!m || encodeURIComponent(phrase) !== enc) return null;
  return { phrase, from: m[1], to: m[2], d1: m[3], d2: m[4] || '', oneWay: !m[4], adults: m[5] ? +m[5] : 1 };
}
const ENVELOPE = [1, 2, 3, 8, 9, 14, 16, 19];

// ---- the inlined region, run on its own (as app.html will), with a stand-in encoder ----
const modelSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'trip-model.js'), 'utf8');
const BEGIN = '/* === pialax trip-model: begin === */', END = '/* === pialax trip-model: end === */';
const region = modelSrc.slice(modelSrc.indexOf(BEGIN), modelSrc.indexOf(END) + END.length);
function sandbox(encoder) {
  const make = new Function('"use strict";\n' + region + '\nreturn function (enc) { if (enc) gfTfs = enc; return { tripModel: tripModel, handoffs: handoffs, flightLink: flightLink, calendarAdd: calendarAdd }; };');
  return make()(encoder);
}

// every hand-off a fixture can produce, for every face on it
function allHandoffs(doc, over) {
  const out = [];
  const meCodes = [undefined].concat(doc.idea.members.map((x) => x.code));
  meCodes.forEach((me) => {
    const m = model(doc, Object.assign({ me }, over || {}));
    [undefined].concat(m.members.map((x) => x.code)).forEach((code) => { out.push({ me, code, h: M.handoffs(m, code, ctx(over)) }); });
  });
  return out;
}

function main() {
  console.log('▶ test-gflinks: one link builder for Google Flights, Explore, Flighty and calendars (PIA-133)');
  const LEG = fx('idea-thanksgiving-legacy.json');
  const DW = fx('idea-diwali.json');
  const TH = fx('idea-tahoe.json');
  const M8 = fx('idea-8members.json');
  const CY = fx('idea-undated.json');
  const LX = fx('idea-lax-local.json');
  // the v2 Thanksgiving as P-migrate leaves it: plan 11/20–11/29, faces on labels, Ashwin follows the plan
  const TG = tweak(LEG, (d) => {
    d.idea.recommendation = null;
    d.idea.destination = { city: 'Peoria', airport: 'PIA' };
    d.idea.dates = { departure: '2026-11-20', return: '2026-11-29', searchStart: '', searchEnd: '' };
    d.idea.members = [{ code: 'PIA', label: '🌽 Mom & Dad', airport: 'PIA', headcount: 2 }, { code: 'LAX', label: '🌴 Ashwin', airport: 'LAX', headcount: 1 }, { code: 'LGA', label: '🗽 Anjo', airport: 'LGA', headcount: 1 }];
    d.idea.notes = '📌2026-11-26';
    d.responses.LAX.available_from = ''; d.responses.LAX.available_to = '';
    d.decision = { stage: 'proposed', chosen: null, chosen_at: null, estimate_total: null, actual_total: null, booked_at: null, delta_pct: null };
  });
  const CHOSEN = { stage: 'chosen', chosen: { airport: 'RDU', city: 'Raleigh', departure: '2026-11-06', return: '2026-11-09' }, chosen_at: '2026-10-16T00:00:00.000Z', estimate_total: null, actual_total: null, booked_at: null, delta_pct: null };
  const DW_SET = tweak(DW, (d) => { d.decision = clone(CHOSEN); });
  const DW_P1 = tweak(DW, (d) => { d.idea.dates.departure = '2026-11-07'; d.idea.dates.return = '2026-11-10'; });
  const DW_BOOKED = tweak(DW_SET, (d) => { d.responses['ashwin-p8'].booked = true; });
  const DW_NODEST = tweak(DW, (d) => { d.idea.destination = { city: '', airport: '' }; });
  // Diwali moved to New York: Anjo hosts, Mom & Dad (×2) fly into JFK and home from LGA (an open-jaw party of 2)
  const DW_NY = tweak(DW, (d) => { d.idea.destination = { city: 'New York', airport: 'LGA' }; d.responses['momdad-k3'].arrive_at = 'JFK'; d.responses['momdad-k3'].leave_from = 'LGA'; });
  const DW_DROP = tweak(DW_BOOKED, (d) => { d.decision.stage = 'dropped'; });
  const scenarios = {
    legacy: [LEG, { me: 'LAX' }], tg: [TG, { me: 'LAX' }], tgMulti: [TG, { me: 'LGA', multiAirport: true }], diwali: [DW, {}], diwaliSet: [DW_SET, {}], diwaliP1: [DW_P1, {}],
    tahoe: [TH, {}], m8: [M8, {}], undated: [CY, {}], laxLocal: [LX, { multiAirport: true }],
    override: [tweak(DW, (d) => { d.responses['ashwin-p8'].origin = 'SFO'; d.responses['anjo-z5'] = R('maybe', 'EWR', '2026-11-05', ''); }), {}],
    party3: [tweak(DW, (d) => { d.idea.members[0].headcount = 3; }), {}],
    toClt: [tweak(TG, (d) => { d.idea.destination = { city: 'Charlotte', airport: 'CLT' }; }), {}],
    ojParty: [DW_NY, {}],
  };

  // ═══ AC1 ════════════════════════════════════════════════════════════════
  section('AC1 the live-verified links E1, E2, E3, E6 and E7 are reproduced byte for byte');
  const legs = (a, b, from1, to1, from2, to2) => [{ date: a, from: from1, to: to1 }, { date: b, from: from2, to: to2 }];
  check(M.gfSearchUrl({ trip: 1, adults: 1, legs: legs('2026-11-20', '2026-11-29', ['LAX'], ['PIA'], ['PIA'], ['LAX']) }) === LIVE.E1, 'E1 LAX⇄PIA 11/20–11/29, 1 adult (encoder)');
  check(M.gfSearchUrl({ trip: 3, adults: 1, legs: legs('2026-11-20', '2026-11-29', ['LAX'], ['PIA'], ['ORD'], ['LAX']) }) === LIVE.E2, 'E2 open-jaw LAX→PIA, ORD→LAX as one multi-city link, trip=3 (encoder)');
  check(M.gfSearchUrl({ trip: 1, adults: 2, legs: legs('2026-11-20', '2026-11-29', ['PIA'], ['RDU'], ['RDU'], ['PIA']) }) === LIVE.E3, 'E3 PIA⇄RDU, 2 adults (encoder)');
  check(M.gfSearchUrl({ trip: 1, adults: 1, legs: legs('2026-11-20', '2026-11-29', ['LGA', 'JFK'], ['PIA'], ['PIA'], ['LGA', 'JFK']) }) === LIVE.E6, 'E6 LGA+JFK⇄PIA (encoder)');
  check(M.gfSearchUrl({ trip: 1, adults: 2, legs: [{ date: '2026-11-20', from: ['LAX'], to: ['ORD'], nonstop: true, airlines: ['UA'] }, { date: '2026-11-29', from: ['ORD'], to: ['LAX'], nonstop: true, airlines: ['UA'] }] }) === LIVE.E7,
    'E7 nonstop + United + 2 adults (encoder; a fixture only, the app never adds filters)');
  const fl = (O, A, H, n, home) => M.flightLink(O, A, H, '2026-11-20', '2026-11-29', n, home);
  check(fl(['LAX'], 'PIA', 'PIA', 1, 'LAX').href === LIVE.E1 && fl(['LAX'], 'PIA', 'ORD', 1, 'LAX').href === LIVE.E2 && fl(['PIA'], 'RDU', 'RDU', 2, 'PIA').href === LIVE.E3 && fl(['LGA', 'JFK'], 'PIA', 'PIA', 1, 'LGA').href === LIVE.E6,
    'the one builder (flightLink) produces E1, E2, E3 and E6 from a traveler’s origin set, arrive / leave airports, dates and headcount');
  const d1 = M.gfDecode(LIVE.E1), d2 = M.gfDecode(LIVE.E2), d3 = M.gfDecode(LIVE.E3), d6 = M.gfDecode(LIVE.E6), d7 = M.gfDecode(LIVE.E7);
  check(d1.trip === 1 && d1.adults === 1 && d1.cabin === 1 && eq(d1.legs.map((L) => [L.date, L.from, L.to]), [['2026-11-20', ['LAX'], ['PIA']], ['2026-11-29', ['PIA'], ['LAX']]]) && eq(d1.fields, [1, 2, 3, 3, 8, 9, 14, 16, 19]),
    'the decoder reads E1 back: round trip, 1 adult, economy, LAX→PIA 11/20 and PIA→LAX 11/29, in Google’s envelope');
  check(d2.trip === 3 && eq(d2.legs[1].from, ['ORD']) && d3.adults === 2 && eq(d6.legs[0].from, ['LGA', 'JFK']) && eq(d6.legs[1].to, ['LGA', 'JFK']),
    'E2 decodes as multi-city home from ORD, E3 as 2 adults, E6 as LGA+JFK on both ends');
  check(d7.legs.every((L) => L.stops === 0 && eq(L.airlines, ['UA'])) && [d1, d2, d3, d6].every((d) => d.legs.every((L) => L.stops === null && L.airlines.length === 0)),
    'the decoder sees E7’s nonstop and United filters (so the no-filter checks below can fail), and none on E1–E6');

  // ═══ AC2 ════════════════════════════════════════════════════════════════
  section('AC2 the v2 sample links are pinned as golden strings');
  const lg = model(LEG, { me: 'LAX' }), lgAsh = mem(lg, 'LAX');
  check(lgAsh.link.href === OWED.tgAshwin && lgAsh.d1 === '2026-11-20' && lgAsh.d2 === '2026-11-29',
    "Ashwin's link on the unmigrated legacy fixture: his own 11/20–11/29 beats the stale 11/25 plan (LA set → PIA, ORD → LA set, trip=3)");
  check(lgAsh.link.inHref === OWED.tgAshIn && lgAsh.link.outHref === OWED.tgAshOut, 'the one-way pair: 🛬 LA set → PIA 11/20 and 🛫 ORD → LA set 11/29 (trip=2 each)');
  check(mem(lg, 'LGA').link.href === OWED.tgAnjo, 'multi-city with sets: Anjo on her own 11/24–11/29 (NY set → PIA, ORD → NY set)');
  const tg = model(TG, { me: 'LAX' });
  check(mem(tg, 'LAX').link.href === OWED.tgAshwin && mem(tg, 'LAX').link.inHref === OWED.tgAshIn && mem(tg, 'LAX').link.outHref === OWED.tgAshOut && mem(tg, 'LGA').link.href === OWED.tgAnjo,
    'the migrated Thanksgiving gives the same four links (Ashwin now follows the 11/20–11/29 plan)');
  check(!mem(tg, 'PIA').link && mem(tg, 'PIA').host, 'Mom & Dad on Thanksgiving: hosts, no link');
  const dw = model(DW);
  check(mem(dw, 'ashwin-p8').link.href === OWED.dwAsh && mem(dw, 'anjo-z5').link.href === OWED.dwAnjo, 'origin sets: Diwali, Ashwin LA set ⇄ RDU and Anjo NY set ⇄ RDU, 11/06–11/09');
  check(mem(dw, 'momdad-k3').link.href === OWED.dwMD, 'the 2-adult PIA+ORD set: Mom & Dad ⇄ RDU');
  check(mem(model(DW_P1), 'ashwin-p8').link.href === OWED.dwAshP1, 'the same Ashwin link after one +1 on the plan (11/07–11/10)');
  const LA = ['LAX', 'BUR', 'LGB', 'SNA', 'ONT'], NY = ['LGA', 'JFK', 'EWR'];
  const expect = {
    tgAshwin: [3, 1, [['2026-11-20', LA, ['PIA']], ['2026-11-29', ['ORD'], LA]]], tgAshIn: [2, 1, [['2026-11-20', LA, ['PIA']]]], tgAshOut: [2, 1, [['2026-11-29', ['ORD'], LA]]],
    tgAnjo: [3, 1, [['2026-11-24', NY, ['PIA']], ['2026-11-29', ['ORD'], NY]]], dwAsh: [1, 1, [['2026-11-06', LA, ['RDU']], ['2026-11-09', ['RDU'], LA]]],
    dwAshP1: [1, 1, [['2026-11-07', LA, ['RDU']], ['2026-11-10', ['RDU'], LA]]], dwMD: [1, 2, [['2026-11-06', ['PIA', 'ORD'], ['RDU']], ['2026-11-09', ['RDU'], ['PIA', 'ORD']]]],
    dwAnjo: [1, 1, [['2026-11-06', NY, ['RDU']], ['2026-11-09', ['RDU'], NY]]],
  };
  const wrong = Object.keys(OWED).filter((k) => { const d = M.gfDecode(OWED[k]); return !d || !eq([d.trip, d.adults, d.legs.map((L) => [L.date, L.from, L.to])], expect[k]) || !eq(d.fields.filter((f) => f !== 3), [1, 2].concat(Array(d.adults).fill(8), [9, 14, 16, 19])); });
  check(wrong.length === 0, 'each pinned link decodes to exactly the trip the spec describes (trip type, party, dates, airports, envelope)', wrong);
  Object.keys(OWED).forEach((k) => note('owed: open once by hand in Google Flights before ship — ' + k + ' ' + OWED[k]));

  // ═══ PIA-138 ════════════════════════════════════════════════════════════
  section('PIA-138 a shifted plan: every link that follows it is rebuilt from the record (golden strings re-checked); ends people set stay byte for byte');
  {
    // the organizer's edit as the model builds it (organizerEdit), applied the way the Worker stores it
    const edited = (doc, delta) => {
      const d = clone(doc), reqs = M.organizerEdit(d, KEY, delta) || [];
      reqs.forEach((q) => {
        if (q.path.indexOf('/idea/update') === 0 && q.body.idea) d.idea = clone(q.body.idea);
        if (q.path.indexOf('/idea/respond') === 0) d.responses[q.body.member] = Object.assign({}, d.responses[q.body.member], q.body);
      });
      return { doc: d, reqs };
    };
    const shift = (doc, k) => { const r = M.planShift(model(doc, { hasEditKey: true }), k, TODAY); return r.why ? { doc: null, why: r.why } : edited(doc, { dates: { departure: r.s, return: r.e } }); };
    const legsOf = (href) => { const d = M.gfDecode(href); return d ? [d.trip, d.adults, d.legs.map((L) => [L.date, L.from, L.to])] : null; };
    const LA = ['LAX', 'BUR', 'LGB', 'SNA', 'ONT'], NY = ['LGA', 'JFK', 'EWR'];
    const p1 = shift(DW, 1), m1 = model(p1.doc);
    check(p1.reqs.length === 1 && mem(m1, 'ashwin-p8').link.href === OWED.dwAshP1,
      'PIA-138 one +1 (the trip view\'s shift, built by the model) gives Ashwin exactly the golden "after one +1" link (11/07–11/10), from the record alone');
    check(eq(legsOf(mem(m1, 'momdad-k3').link.href), [1, 2, [['2026-11-07', ['PIA', 'ORD'], ['RDU']], ['2026-11-10', ['RDU'], ['PIA', 'ORD']]]]) &&
      eq(legsOf(mem(m1, 'anjo-z5').link.href), [1, 1, [['2026-11-07', NY, ['RDU']], ['2026-11-10', ['RDU'], NY]]]),
      'Mom & Dad (2 adults, PIA+ORD) and Anjo (NY set) follow the plan: their links move to 11/07–11/10 in the same rebuild');
    const back = shift(p1.doc, -1), mb = model(back.doc);
    const mm1 = model(shift(DW, -1).doc);
    check(mem(mb, 'ashwin-p8').link.href === OWED.dwAsh && mem(mb, 'momdad-k3').link.href === OWED.dwMD && mem(mb, 'anjo-z5').link.href === OWED.dwAnjo &&
      eq(legsOf(mem(mm1, 'ashwin-p8').link.href), [1, 1, [['2026-11-05', LA, ['RDU']], ['2026-11-08', ['RDU'], LA]]]),
      '+1 then −1 puts every link back byte for byte on the golden 11/06–11/09 strings; −1 from the start is 11/05–11/08');
    // Anjo set her own days: the plan moves, her link does not
    const own = tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA', '2026-11-06', '2026-11-09'); });
    const o1 = model(shift(own, 1).doc);
    check(mem(o1, 'anjo-z5').link.href === OWED.dwAnjo && mem(o1, 'ashwin-p8').link.href === OWED.dwAshP1 && mem(o1, 'anjo-z5').warn.indexOf('off') >= 0,
      'Anjo\'s own 11/06–11/09 stay put through a +1: her link is still the golden one byte for byte (with ⚠: her days are off the plan now), while Ashwin\'s moves');
    // a booked traveler who followed the plan keeps the days he booked
    const bk = tweak(DW, (d) => { d.responses['ashwin-p8'].booked = true; });
    const b1 = shift(bk, 1), bm = model(b1.doc);
    check(b1.reqs.length === 2 && mem(bm, 'ashwin-p8').link.href === OWED.dwAsh && eq(bm.plan, { s: '2026-11-07', e: '2026-11-10' }),
      'Ashwin had booked while following the plan: his booked days are written as his own first, so his link stays the golden 11/06–11/09 one');
    // a week shift (no event day to keep), and one leg moved by itself
    const nopin = tweak(DW, (d) => { d.idea.notes = ''; });
    const w1 = model(shift(nopin, 7).doc);
    check(shift(DW, 7).why === 'pin' && eq(legsOf(mem(w1, 'ashwin-p8').link.href), [1, 1, [['2026-11-13', LA, ['RDU']], ['2026-11-16', ['RDU'], LA]]]),
      'a week shift that would drop 📌 builds nothing; without 📌, +7 moves every follower\'s link a week (11/13–11/16)');
    const leg = M.legShift(model(DW), 'ashwin-p8', 0, -1, TODAY);
    const lm = model(tweak(DW, (d) => { Object.assign(d.responses['ashwin-p8'], leg.patch); }));
    check(leg.why === '' && eq(legsOf(mem(lm, 'ashwin-p8').link.href), [1, 1, [['2026-11-05', LA, ['RDU']], ['2026-11-09', ['RDU'], LA]]]) && mem(lm, 'momdad-k3').link.href === OWED.dwMD,
      'one leg at a time: Ashwin\'s 🛬 −1 makes 11/05 his own; his round trip is 11/05–11/09 while everyone else keeps the golden plan links');
  }

  // ═══ AC3 ════════════════════════════════════════════════════════════════
  section('AC3 round trip = one round-trip search; open-jaw = one multi-city link + the two priced one-ways; party = headcount; no filters');
  let produced = 0, rt = 0, oj = 0;
  const bad = [];
  Object.keys(scenarios).forEach((name) => {
    const [doc, over] = scenarios[name];
    const m = model(doc, Object.assign({ hasEditKey: true, hasToken: true }, over));
    m.members.forEach((x) => {
      if (!x.link) return;
      const tag = name + ':' + x.code;
      const urls = [x.link.href].concat(x.link.inHref ? [x.link.inHref, x.link.outHref] : []);
      urls.forEach((u) => {
        produced++;
        const d = M.gfDecode(u);
        if (!d) { bad.push(tag + ' does not decode'); return; }
        if (d.adults !== x.headcount) bad.push(tag + ' adults ' + d.adults + ' ≠ headcount ' + x.headcount);
        if (d.cabin !== 1) bad.push(tag + ' cabin ' + d.cabin);
        if (d.legs.some((L) => L.stops !== null || L.airlines.length)) bad.push(tag + ' carries a stops or airline filter');
        if (d.fields.some((f) => ENVELOPE.indexOf(f) < 0)) bad.push(tag + ' has a field outside the envelope: ' + d.fields);
      });
      const p = M.gfDecode(x.link.href), L = p.legs.map((l) => [l.date, l.from, l.to]);
      if (!x.openJaw) {
        rt++;
        if (p.trip !== 1 || !eq(L, [[x.d1, x.O, [x.A]], [x.d2, [x.A], x.O]]) || x.link.inHref || x.link.outHref) bad.push(tag + ' is not one round-trip search ' + JSON.stringify(L));
        if (x.keys.length !== 1 || x.keys[0].kind !== 'rt') bad.push(tag + ' round trip is not one round-trip priced search');
      } else {
        oj++;
        if (p.trip !== 3 || !eq(L, [[x.d1, x.O, [x.A]], [x.d2, [x.H], x.O]])) bad.push(tag + ' is not one multi-city link ' + JSON.stringify(L));
        const i = M.gfDecode(x.link.inHref), o = M.gfDecode(x.link.outHref);
        if (i.trip !== 2 || o.trip !== 2 || i.legs.length !== 1 || o.legs.length !== 1 || !eq(i.legs[0], p.legs[0]) || !eq(o.legs[0], p.legs[1])) bad.push(tag + ' one-ways are not the multi-city legs');
        // the one-ways are the two searches PIALAX prices (with the Worker's multi-airport search: the same airports)
        const k = (d) => M.fareKey(2, d.legs[0].from, d.legs[0].to, d.legs[0].date, '', d.adults);
        if (x.keys.length !== 2 || x.keys[0].kind !== 'in' || x.keys[1].kind !== 'out') bad.push(tag + ' open-jaw is not priced as two one-ways');
        else if (over.multiAirport ? (x.keys[0].key !== k(i) || x.keys[1].key !== k(o)) : (x.keys[0].key.split('|')[2] !== x.A || i.legs[0].from.indexOf(x.from[0]) < 0)) bad.push(tag + ' one-ways ≠ priced searches ' + x.keys.map((q) => q.key));
      }
    });
  });
  check(bad.length === 0 && produced >= 45 && rt >= 30 && oj >= 6,
    'every link the fixtures produce (' + produced + ' URLs: ' + rt + ' round trips, ' + oj + ' open-jaws) decodes to the traveler’s own legs, dates and trip type, adults = headcount, economy, no airline or nonstop filter', bad.slice(0, 5));
  const tgm = model(TG, { me: 'LGA', multiAirport: true, hasEditKey: true, hasToken: true }), anjo = mem(tgm, 'LGA');
  // PIA-140: a fare key names its airports as a set, sorted (the Worker's cache order); the link keeps her home code first
  check(anjo.keys[0].key === '2|EWR,JFK,LGA|PIA|2026-11-24||1' && M.gfDecode(anjo.link.inHref).legs[0].from.join() === 'LGA,JFK,EWR' && anjo.keys[1].key === '2|ORD|EWR,JFK,LGA|2026-11-29||1' &&
    M.searchQuery(anjo.keys[0].key).indexOf('departure_id=EWR,JFK,LGA&arrival_id=PIA&') > 0,
    'with the Worker’s multi-airport search, Anjo’s 🛬 and 🛫 links are exactly her two priced one-way searches (the key and the /search query name the set sorted)');
  const p3 = model(scenarios.party3[0]);
  check(M.gfDecode(mem(p3, 'momdad-k3').link.href).adults === 3 && M.gfDecode(mem(model(M8), 'anastasiakonstantinopoulou-x1').link.href).adults === 2,
    'party size follows headcount: Mom & Dad at headcount 3 → 3 adults; Anastasia (×2) on the 90th → 2 adults');
  const ov = model(scenarios.override[0]);
  check(eq(M.gfDecode(mem(ov, 'ashwin-p8').link.href).legs[0].from, ['SFO']) && eq(M.gfDecode(mem(ov, 'anjo-z5').link.href).legs[0].from, NY) && M.gfDecode(mem(ov, 'anjo-z5').link.href).legs[0].date === '2026-11-05',
    'an origin override (SFO) searches from it; an EWR override searches the NY set; her own 11/05 start is the link’s date');
  const clt = model(scenarios.toClt[0], { me: 'LAX' });
  check(eq(M.gfDecode(mem(clt, 'LAX').link.href).legs[0].to, ['CLT']) && M.gfDecode(mem(clt, 'LAX').link.href).trip === 1 && !!mem(clt, 'PIA').link && M.gfDecode(mem(clt, 'PIA').link.href).adults === 2,
    'a destination change (PIA → CLT) rewrites every link from the record: stale PIA/ORD picks dropped (round trip), Mom & Dad now fly (2 adults)');
  // handoffs() is the one entry point the app calls: for an open-jaw traveler its primary must be the multi-city
  // link itself, with the two one-ways the right way round, each for the whole party
  const hLeg = M.handoffs(lg, 'LAX', ctx()), [ojA, ojI, ojO] = [hLeg.gf, hLeg.gfIn, hLeg.gfOut].map((h) => M.gfDecode(h.href));
  check(hLeg.gf.kind === 'gf' && hLeg.gf.trip === 3 && ojA.trip === 3 && hLeg.gf.href === lgAsh.link.href && hLeg.gfIn.href === lgAsh.link.inHref && hLeg.gfOut.href === lgAsh.link.outHref &&
    hLeg.gfIn.kind === 'gf-in' && ojI.trip === 2 && ojI.legs.length === 1 && eq(ojI.legs[0].to, ['PIA']) && ojI.legs[0].date === '2026-11-20' &&
    hLeg.gfOut.kind === 'gf-out' && ojO.trip === 2 && ojO.legs.length === 1 && eq(ojO.legs[0].from, ['ORD']) && ojO.legs[0].date === '2026-11-29',
    'handoffs() for Ashwin (open-jaw): ✈↗ is the multi-city link itself (trip=3), 🛬 the one-way into PIA 11/20, 🛫 the one-way home from ORD 11/29');
  const hMD = M.handoffs(model(DW_NY), 'momdad-k3', ctx()), [mA, mI, mO] = [hMD.gf, hMD.gfIn, hMD.gfOut].map((h) => M.gfDecode(h.href));
  check(mem(model(DW_NY), 'momdad-k3').openJaw && mA.trip === 3 && [mA, mI, mO].every((d) => d.adults === 2) &&
    eq(mA.legs.map((L) => [L.date, L.from, L.to]), [['2026-11-06', ['PIA', 'ORD'], ['JFK']], ['2026-11-09', ['LGA'], ['PIA', 'ORD']]]) && eq(mI.legs[0].to, ['JFK']) && eq(mO.legs[0].from, ['LGA']),
    'an open-jaw party of 2 (Diwali moved to New York: Mom & Dad into JFK, home from LGA): the multi-city link and both one-ways book 2 adults');

  // ═══ AC4 ════════════════════════════════════════════════════════════════
  section('AC4 no link for hosts, local members, undated, impossible or past ranges; an idea without a place offers Explore');
  const H = (doc, code, over) => M.handoffs(model(doc, over), code, ctx(over));
  const none = (h) => !h.gf && !h.gfIn && !h.gfOut;
  const tgBooked = tweak(TG, (d) => { d.responses.PIA = R('in', 'PIA', '', '', { booked: true }); });
  check(none(H(TG, 'PIA')) && H(TG, 'PIA').why === 'host' && none(H(tgBooked, 'PIA')) && !H(tgBooked, 'PIA').flighty, 'hosts: Mom & Dad on Thanksgiving get no link (and no Flighty), even answered in and marked booked');
  check(none(H(LX, 'maya-x2')) && none(H(LX, 'ashwin-x3')) && H(LX, 'maya-x2').why === 'host', 'LA beach weekend: the SNA member (metro group) and the LAX member get no link');
  const localOrigin = tweak(LX, (d) => { d.responses['priya-x1'].origin = 'BUR'; });
  check(none(H(localOrigin, 'priya-x1')) && H(localOrigin, 'priya-x1').why === 'local' && mem(model(localOrigin), 'priya-x1').traveler, 'a traveler whose origin is inside the destination’s own airports (BUR for LAX) gets no link (local)');
  check(none(H(CY, 'momdad-c1')) && H(CY, 'momdad-c1').why === 'nodates' && !!H(CY, 'ashwin-c3').gf, 'undated idea: no link without a range; Ashwin’s own 12/19–12/26 window is a range, so his link exists');
  const oneEnd = tweak(CY, (d) => { d.responses['ashwin-c3'].available_to = ''; });
  check(none(H(oneEnd, 'ashwin-c3')) && H(oneEnd, 'ashwin-c3').why === 'nodates', 'an undated idea with only one end set: no link');
  const order = tweak(DW, (d) => { d.responses['ashwin-p8'].available_from = '2026-11-12'; });
  check(none(H(order, 'ashwin-p8')) && H(order, 'ashwin-p8').why === 'order', 'an impossible range (own 11/12 → plan 11/09): no link');
  const past = tweak(DW, (d) => { d.idea.dates.departure = '2026-10-10'; d.idea.dates.return = '2026-10-20'; d.idea.notes = ''; });
  check(['momdad-k3', 'ashwin-p8'].every((c) => none(H(past, c)) && H(past, c).why === 'past'), 'a departure in the past (plan 10/10–10/20 on 10/17): no link');
  const edge = (from) => H(tweak(DW, (d) => { d.responses['ashwin-p8'].available_from = from; }), 'ashwin-p8');
  check(!!edge(TODAY).gf && M.gfDecode(edge(TODAY).gf.href).legs[0].date === TODAY && none(edge('2026-10-16')) && edge('2026-10-16').why === 'past',
    'departing today still links; departing yesterday does not');
  const outDw = tweak(DW, (d) => { d.responses['anjo-z5'] = R('out', 'LGA'); });
  check(none(H(outDw, 'anjo-z5')) && H(outDw, 'anjo-z5').why === 'out', 'a member who is out gets no link');
  const nd = model(DW_NODEST, { me: 'ashwin-p8' });
  const ndH = nd.members.map((x) => M.handoffs(nd, x.code, ctx()));
  check(nd.members.every((x) => !x.link && x.why === 'nodest') && ndH.every((h) => none(h) && h.explore && h.explore.href === M.GF_EXPLORE && h.explore.kind === 'explore'),
    'an idea without a place: no Google Flights link for anyone, and 🧭 Explore for everyone');
  check(M.GF_EXPLORE === 'https://www.google.com/travel/explore?hl=en&gl=us&curr=USD' && !/[?&](tfs|q)=/.test(M.GF_EXPLORE),
    'Explore is unprefilled (no tfs or q; no prefilled form has been verified live)');
  check([DW, TG, CY, LX].every((doc) => allHandoffs(doc).every((r) => r.h.explore === null)),
    'a trip with a place never offers Explore, dated or undated (Diwali, Thanksgiving, the undated Cary shower, the LA weekend)');
  const noAir = tweak(DW, (d) => { d.idea.members[1].airport = ''; d.responses['ashwin-p8'].origin = ''; });
  const noAirSfo = tweak(noAir, (d) => { d.responses['ashwin-p8'].origin = 'SFO'; });
  check(none(H(noAir, 'ashwin-p8')) && H(noAir, 'ashwin-p8').why === 'noairport' && mem(model(noAir), 'ashwin-p8').why === 'noairport' && !!H(noAirSfo, 'ashwin-p8').gf,
    'a traveler with no home airport and no override gets no link and says why (noairport, never "local"); an override alone is enough to link');
  const SX = sandbox(() => { throw new Error('encoder down'); });
  const metro = tweak(DW, (d) => { d.idea.members[1].airport = 'NYC'; d.responses['ashwin-p8'].origin = 'NYC'; });
  const mx = SX.tripModel(clone(metro), ctx()), hx = SX.handoffs(mx, 'ashwin-p8', ctx()), ax = mx.members.find((x) => x.code === 'ashwin-p8');
  check(!hx.gf && !hx.gfIn && hx.why === 'nolink' && ax.why === 'nolink' && ax.keys.length === 1 && !!H(metro, 'ashwin-p8').gf,
    'if the encoder fails and q= refuses the code (the metro code NYC), there is no link and why says so (nolink; the leg is still priced); the working encoder links NYC');
  const dropRows = allHandoffs(DW_DROP);
  const dropNoPlace = allHandoffs(tweak(DW_NODEST, (d) => { d.decision.stage = 'dropped'; }));
  const overNoPlace = allHandoffs(tweak(DW_NODEST, (d) => { d.idea.dates.departure = '2026-09-01'; d.idea.dates.return = '2026-09-05'; d.idea.notes = ''; }));
  check(dropRows.length > 10 && dropRows.every((r) => none(r.h) && r.h.calendar === null && r.h.nudge === '' && r.h.explore === null && r.h.share === M.WORKER_URL + '/i/' + DW.id && (!r.h.code || r.h.why === 'dropped')) &&
    !!M.handoffs(model(DW_DROP), 'ashwin-p8', ctx()).flighty && dropNoPlace.concat(overNoPlace).every((r) => r.h.explore === null),
    'a dropped trip (🗑) offers no Google Flights link, calendar event, nudge or Explore (why: dropped), only its share link and a booked traveler’s Flighty; an idea without a place that is dropped or over offers no Explore');

  // ═══ AC5 ════════════════════════════════════════════════════════════════
  section('AC5 every hand-off opens in a new tab');
  const offs = [];
  [LEG, TG, DW, DW_SET, DW_BOOKED, DW_NODEST, TH, M8, CY, LX].forEach((doc) => allHandoffs(doc).forEach((r) => {
    const h = r.h; ['gf', 'gfIn', 'gfOut', 'explore', 'flighty'].forEach((k) => { if (h[k]) offs.push(h[k]); });
    if (h.calendar) offs.push(h.calendar.google);
  }));
  const kinds = new Set(offs.map((h) => h.kind));
  check(offs.length > 200 && ['gf', 'gf-in', 'gf-out', 'explore', 'flighty', 'calendar'].every((k) => kinds.has(k)) && offs.every((h) => h.target === '_blank' && /\bnoopener\b/.test(h.rel) && /^https:\/\//.test(h.href)),
    'all ' + offs.length + ' hand-offs (Google Flights, both one-ways, Explore, Flighty, Google Calendar) carry target _blank and rel noopener');
  const attrs = M.handoffAttrs(M.handoffs(lg, 'LAX', ctx()).calendar.google);
  check(/ target="_blank" rel="noopener noreferrer"$/.test(attrs) && attrs.indexOf('&amp;dates=') > 0 && attrs.indexOf('&dates=') < 0 && attrs.indexOf('"', 6) === attrs.indexOf('" target'),
    'handoffAttrs is the one place that writes an <a>: href escaped (&amp;), target="_blank", rel="noopener noreferrer"', attrs);
  check(M.tripModel(DW, ctx()).members.every((x) => !x.link || (x.link.target === '_blank' && x.link.rel === 'noopener noreferrer')), 'the model’s own member.link is a hand-off too (target and rel included)');
  const ics = M.handoffs(lg, 'LAX', ctx()).calendar.ics;
  check(ics.kind === 'ics' && !('href' in ics) && ics.mime === 'text/calendar;charset=utf-8' && /\.ics$/.test(ics.filename), 'the .ics is a download (file name, type and text), not a page to open');

  // ═══ AC6 ════════════════════════════════════════════════════════════════
  section('AC6 the q= form is used only if the encoder fails, and only in the verified grammar');
  const everyUrl = [];
  Object.keys(scenarios).forEach((name) => { const [doc, over] = scenarios[name]; model(doc, over).members.forEach((x) => { if (x.link) everyUrl.push(x.link.href, x.link.inHref || x.link.href, x.link.outHref || x.link.href); if (x.link && x.link.q) everyUrl.push('q flag on ' + name); }); });
  check(everyUrl.length > 60 && everyUrl.every((u) => u.indexOf(GF) === 0 && u.indexOf('?q=') < 0), 'with the working encoder no link anywhere is q= (' + everyUrl.length + ' URLs, all tfs)');
  check(M.gfQueryUrl('LAX', 'PIA', '2026-11-20', '2026-11-29', 1) === LIVE_Q.rt && M.gfQueryUrl('LAX', 'PIA', '2026-11-20', '', 1) === LIVE_Q.ow &&
    M.gfQueryUrl('PIA', 'RDU', '2026-11-20', '2026-11-29', 2) === LIVE_Q.rt2 && M.gfQueryUrl('LAX', 'ORD', '2026-11-20', '', 2) === LIVE_Q.ow2,
    'the q= builder reproduces the four live-verified q= links byte for byte (round trip, one way, each with and without "for 2 adults")');
  check(['LGA,JFK', 'LGA or JFK', 'NYC', 'CHI', 'lax', '', 'LAXX'].every((c) => M.gfQueryUrl(c, 'PIA', '2026-11-20', '2026-11-29', 1) === '') &&
    M.gfQueryUrl('LAX', 'LAX', '2026-11-20', '', 1) === '' && M.gfQueryUrl('LAX', 'PIA', '2026-11-29', '2026-11-20', 1) === '' && M.gfQueryUrl('LAX', 'PIA', 'Nov 20', '', 1) === '' && M.gfQueryUrl('LAX', 'PIA', '2026-11-20', '', 10) === '',
    'q= refuses what the live checks broke on: several airports, "or", metro codes (NYC, CHI), months or loose dates, reversed ranges, same-airport legs, > 9 adults');
  const fallbackRuns = {
    throws: () => { throw new Error('encoder down'); }, garbage: () => LIVE.E1.slice(GF.length, -TAIL.length), empty: () => '',
    // the right legs, dates and party, but with a nonstop and an airline filter slipped in: the self-check must refuse it
    filtered: (o) => M.gfTfs(Object.assign({}, o, { legs: o.legs.map((L) => Object.assign({}, L, { nonstop: true, airlines: ['UA'] })) })),
  };
  const filteredDec = M.gfDecode(GF + fallbackRuns.filtered({ trip: 1, adults: 1, legs: legs('2026-11-20', '2026-11-29', ['LAX'], ['PIA'], ['PIA'], ['LAX']) }) + TAIL);
  check(filteredDec.trip === 1 && eq(filteredDec.legs.map((L) => [L.date, L.from, L.to]), [['2026-11-20', ['LAX'], ['PIA']], ['2026-11-29', ['PIA'], ['LAX']]]) && filteredDec.legs.every((L) => L.stops === 0 && eq(L.airlines, ['UA'])),
    'the "filtered" stand-in encoder gets every leg, date and party right and only adds the filters (so only the no-filter clause can refuse it)');
  Object.keys(fallbackRuns).forEach((kind) => {
    const S = sandbox(fallbackRuns[kind]);
    const issues = [];
    let n = 0, splits = 0;
    Object.keys(scenarios).forEach((name) => {
      const [doc, over] = scenarios[name];
      const real = model(doc, over), m = S.tripModel(clone(doc), ctx(over));
      m.members.forEach((x) => {
        const r = mem(real, x.code), tag = name + ':' + x.code;
        if (!!x.link !== !!r.link) { issues.push(tag + ' link exists ≠ with the real encoder'); return; }
        if (!x.link) return;
        const urls = [x.link.href].concat(x.link.inHref ? [x.link.inHref, x.link.outHref] : []);
        const qs = urls.map(qDecode);
        n += urls.length;
        if (!x.link.q || qs.some((q) => !q)) { issues.push(tag + ' not all q= in the verified grammar: ' + urls.join(' ')); return; }
        if (qs.some((q) => q.adults !== x.headcount)) issues.push(tag + ' adults ≠ headcount');
        if (qs.some((q) => / or |,|nonstop|NYC|United|Delta|American|Southwest|January|February|March|April|May|June|July|August|September|October|November|December/.test(q.phrase))) issues.push(tag + ' phrase outside the grammar');
        const home = x.O.indexOf(x.origin) >= 0 ? x.origin : x.O[0];
        const hh = S.handoffs(m, x.code, ctx(over));
        if (!x.openJaw) {
          const q = qs[0];
          if (q.oneWay || q.from !== home || q.to !== x.A || q.d1 !== x.d1 || q.d2 !== x.d2 || x.link.inHref || x.link.trip !== 1 || x.link.split || hh.gf.trip !== 1) issues.push(tag + ' round trip q= wrong: ' + q.phrase);
        } else {
          splits++;
          const qi = qDecode(x.link.inHref), qo = qDecode(x.link.outHref);
          if (!x.link.split || x.link.href !== x.link.inHref || !qi.oneWay || !qo.oneWay || qi.from !== home || qi.to !== x.A || qi.d1 !== x.d1 || qo.from !== x.H || qo.to !== home || qo.d1 !== x.d2)
            issues.push(tag + ' open-jaw is not two one-way q= links: ' + qi.phrase + ' / ' + qo.phrase);
          // the primary is then a one-way search, so it must not be labelled multi-city
          if (x.link.trip !== 2 || x.link.plan.trip !== 3 || !hh.gf.split || hh.gf.trip !== 2 || hh.gf.href !== hh.gfIn.href || hh.gfOut.href !== x.link.outHref)
            issues.push(tag + ' split primary is labelled trip ' + x.link.trip + ' / ' + hh.gf.trip + ', not a one-way (2)');
        }
      });
    });
    check(issues.length === 0 && n >= 40 && splits >= 3, 'encoder ' + kind + ': every link falls back to q= in the verified grammar (' + n + ' URLs), from the home code alone; open-jaw becomes two one-way q= links, its primary labelled a one-way (trip 2, split)', issues.slice(0, 4));
  });
  const SQ = sandbox(fallbackRuns.throws);
  const qAsh = SQ.tripModel(clone(LEG), ctx({ me: 'LAX' })).members.find((x) => x.code === 'LAX').link;
  check(qAsh.href === Q + 'Flights%20from%20LAX%20to%20PIA%20on%202026-11-20%20one%20way' + TAIL && qAsh.outHref === Q + 'Flights%20from%20ORD%20to%20LAX%20on%202026-11-29%20one%20way' + TAIL,
    "Ashwin's fallback on the legacy doc is exactly the research's two one-ways: LAX → PIA 11/20 and ORD → LAX 11/29");
  const qPast = SQ.tripModel(clone(past), ctx()).members.filter((x) => x.link);
  check(qPast.length === 0, 'q= silently rewrites past dates, so a range that has started gets no q= link either');
  const SB = sandbox();
  check(mem(SB.tripModel(clone(LEG), ctx({ me: 'LAX' })), 'LAX').link.href === OWED.tgAshwin, 'the region runs on its own with the real encoder and gives the golden link (no fallback)');

  // ═══ AC7 ════════════════════════════════════════════════════════════════
  section('AC7 calendars: all-day, exclusive end, my own dates (hosts: the plan), tentative before 🔒, only the guest /i/ link');
  const W = M.WORKER_URL;
  const cal = (doc, me, over) => M.calendarAdd(model(doc, Object.assign({ me }, over || {})), ctx(over));
  const anjoCal = cal(LEG, 'LGA');
  const G_CAL_ANJO = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=%3F%20%F0%9F%A6%83%20Thanksgiving%20at%20home%20%E2%80%94%20Peoria&dates=20261124/20261130' +
    '&details=https%3A%2F%2Fpialax-proxy.ashwinyedavalli.workers.dev%2Fi%2FtgLegacyThanksgiving01&location=Peoria';
  const ICS_ANJO = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PIALAX//Trip//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:tgLegacyThanksgiving01-LGA@pialax', 'DTSTAMP:20261017T190000Z', 'DTSTART;VALUE=DATE:20261124', 'DTEND;VALUE=DATE:20261130',
    'SUMMARY:? 🦃 Thanksgiving at home — Peoria', 'LOCATION:Peoria', 'DESCRIPTION:https://pialax-proxy.ashwinyedavalli.workers.dev/i/tgLegacyThan', ' ksgiving01',
    'STATUS:TENTATIVE', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
  check(anjoCal.google.href === G_CAL_ANJO, 'golden Google TEMPLATE link: Anjo on the legacy doc, her own 11/24–11/29 as dates=20261124/20261130 (end exclusive), tentative "? "');
  check(anjoCal.ics.text === ICS_ANJO, 'golden .ics: the same all-day event (DTSTART/DTEND VALUE=DATE, DTEND = 11/30), STATUS:TENTATIVE, the guest link folded at 75 octets');
  check(anjoCal.d1 === '2026-11-24' && anjoCal.d2 === '2026-11-29' && anjoCal.end === '2026-11-30' && anjoCal.own && anjoCal.tentative, 'my own travel dates (her window beats the stale 11/25 plan), with the exclusive end 11/30');
  const ashTg = cal(TG, 'LAX'), mdTg = cal(TG, 'PIA'), mdLg = cal(LEG, 'PIA'), noFace = cal(TG, undefined), outCal = cal(outDw, 'anjo-z5');
  check(ashTg.own && ashTg.d1 === '2026-11-20' && ashTg.d2 === '2026-11-29', 'a traveler who follows the plan gets the plan as his own days (Ashwin 11/20–11/29)');
  check(!mdTg.own && mdTg.d1 === '2026-11-20' && mdTg.d2 === '2026-11-29' && mdLg.d1 === '2026-11-25' && mdLg.d2 === '2026-11-29', 'hosts get the plan: Mom & Dad 11/20–11/29 on the v2 doc, the legacy 11/25–11/29 plan on the old one');
  check(!noFace.own && noFace.d1 === '2026-11-20' && !outCal.own && outCal.d1 === '2026-11-06' && outCal.d2 === '2026-11-09', 'a phone with no face, or someone who is out, gets the plan');
  const setCal = cal(DW_SET, 'ashwin-p8'), paidCal = cal(tweak(DW_SET, (d) => { d.decision.stage = 'booked'; d.decision.actual_total = 1490; }), 'ashwin-p8');
  check(setCal.google.href === 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=%F0%9F%AA%94%20Diwali%20in%20Raleigh&dates=20261106/20261110&details=https%3A%2F%2Fpialax-proxy.ashwinyedavalli.workers.dev%2Fi%2FdwDiwaliRaleigh2026a01&location=Raleigh' &&
    !setCal.tentative && /\r\nSTATUS:CONFIRMED\r\n/.test(setCal.ics.text) && /\r\nSUMMARY:🪔 Diwali in Raleigh\r\n/.test(setCal.ics.text) && !paidCal.tentative,
    'once 🔒 (and once paid) the event is confirmed: no "? " and STATUS:CONFIRMED (golden Diwali link, 11/06–11/10)');
  check(cal(DW, 'ashwin-p8').tentative && /^\? /.test(cal(DW, 'ashwin-p8').title) && /\r\nSTATUS:TENTATIVE\r\n/.test(cal(DW, 'ashwin-p8').ics.text) && cal(LEG, 'LAX').tentative,
    'before 🔒 it is tentative ("? " title, STATUS:TENTATIVE); a legacy 🔒 reads as proposed, so it stays tentative');
  // PIA-139: a window is not trip days: an undated idea makes no event at all, even for someone with their own window
  // (Ashwin's 12/19–12/26 on a 🌙4 idea would have been an 8-day event)
  check(cal(CY, 'momdad-c1') === null && cal(CY, undefined) === null && mem(model(CY), 'ashwin-c3').d1 === '2026-12-19' && cal(CY, 'ashwin-c3') === null,
    'an undated idea: no event without the trip\'s days, even for Ashwin with his own 12/19–12/26 window');
  const orderCal = cal(order, 'ashwin-p8');
  check(!orderCal.own && orderCal.d1 === '2026-11-06' && orderCal.d2 === '2026-11-09' && orderCal.end === '2026-11-10' &&
    cal(tweak(DW, (d) => { d.idea.dates.departure = '2026-10-01'; d.idea.dates.return = '2026-10-16'; d.idea.notes = ''; }), 'ashwin-p8') === null && !!cal(past, 'ashwin-p8'),
    'my own reversed ⚠ range (11/12 → 11/09) never becomes an event: the plan 11/06–11/09 stands in (as the prototype sheet does); no event for days already over; a trip still under way can be added');
  const hostOwn = tweak(LEG, (d) => { d.responses.PIA = R('in', 'PIA', '2026-11-22', '2026-11-27'); });
  const hoCal = cal(hostOwn, 'PIA');
  check(mem(model(hostOwn), 'PIA').own1 === '2026-11-22' && !hoCal.own && hoCal.d1 === '2026-11-25' && hoCal.d2 === '2026-11-29' && /&dates=20261125\/20261130&/.test(hoCal.google.href) &&
    /\r\nDTSTART;VALUE=DATE:20261125\r\nDTEND;VALUE=DATE:20261130\r\n/.test(hoCal.ics.text),
    'a host who set own days (Mom & Dad 11/22–11/27 on Thanksgiving) still gets the plan: 11/25–11/29, end 11/30');
  const DW_ASHBK = tweak(DW, (d) => { d.responses['ashwin-p8'].booked = true; });
  const DW_DONE = tweak(DW, (d) => { d.responses['momdad-k3'].booked = true; d.responses['ashwin-p8'].booked = true; d.responses['anjo-z5'] = R('in', 'LGA', '', '', { booked: true }); });
  const ashBk = cal(DW_ASHBK, 'ashwin-p8'), anjoBk = cal(DW_ASHBK, 'anjo-z5'), doneM = model(DW_DONE);
  check(model(DW_ASHBK).stage === 'booking' && !model(DW_ASHBK).locked && !ashBk.tentative && /^🪔/.test(ashBk.title) && /\r\nSTATUS:CONFIRMED\r\n/.test(ashBk.ics.text) && anjoBk.tentative &&
    doneM.stage === 'done' && doneM.decision === 'proposed' && ['momdad-k3', 'anjo-z5', undefined].every((c) => !cal(DW_DONE, c).tentative) && cal(DW_DROP, 'ashwin-p8') === null,
    'booked days are set days: my own 🎫 confirms my event before 🔒 (Anjo, not booked, stays "? "); a derived 🏁 Done trip is confirmed for everyone; a dropped trip makes no event');
  // only the guest link, never an edit key or token
  const leaks = [];
  let scanned = 0;
  const sensitive = [KEY, TOKEN, 'edit_key', 'edit_hash', '#k=', '&k=', '?k=', '#t=', '&t=', '?t=', 'X-Pialax-Token', 'X-Idea-Key'];
  [LEG, TG, DW, DW_SET, DW_BOOKED, TH, M8, CY, LX].forEach((doc) => {
    const withHash = tweak(doc, (d) => { d.edit_hash = 'e'.repeat(64); d.edit_key = KEY; });
    allHandoffs(withHash, { hasEditKey: true, hasToken: true, editKey: KEY, token: TOKEN, proxyToken: TOKEN }).forEach((r) => {
      scanned++;
      const h = r.h, out = [h.share, h.nudge].concat(h.calendar ? [h.calendar.google.href, h.calendar.ics.text, h.calendar.details] : []);
      const blob = JSON.stringify(out) + out.join(' ');
      sensitive.concat(['e'.repeat(64)]).forEach((s) => { if (blob.indexOf(s) >= 0) leaks.push(doc.id + ' me=' + r.me + ' code=' + r.code + ' carries ' + s); });
      if (h.calendar) {
        const text = h.calendar.ics.text.replace(/\r\n /g, ''), links = text.match(/https?:\/\/[^\s\\]+/g) || [];
        const det = /[?&]details=([^&]*)/.exec(h.calendar.google.href);
        if (!eq(links, [W + '/i/' + doc.id]) || !det || decodeURIComponent(det[1]) !== W + '/i/' + doc.id || h.calendar.details !== W + '/i/' + doc.id) leaks.push(doc.id + ' calendar carries more than the guest link: ' + links);
      }
      if (h.share !== W + '/i/' + doc.id || (h.nudge && h.nudge !== W + '/i/' + doc.id + '#m=' + r.code)) leaks.push(doc.id + ' share/nudge ' + h.share + ' ' + h.nudge);
    });
  });
  check(leaks.length === 0 && scanned > 150,
    'organizer phones with the edit key and token (even passed in by a careless caller, on docs with edit_hash): calendar events, shares and nudges carry only the guest /i/<id> link (' + scanned + ' faces scanned)', leaks.slice(0, 4));
  const evil = [W + '/#k=' + KEY, W + '?t=' + TOKEN, W + '/i/x', 'http://pialax-proxy.ashwinyedavalli.workers.dev', 'https://evil.example.com', ' https://evil.example.com '];
  check(evil.every((w) => M.guestLink(DW.id, '', w) === '' && M.calendarAdd(model(DW, { me: 'ashwin-p8' }), ctx({ worker: w })).details === '' &&
    M.calendarAdd(model(DW, { me: 'ashwin-p8' }), ctx({ worker: w })).ics.text.indexOf('DESCRIPTION') < 0 && M.calendarAdd(model(DW, { me: 'ashwin-p8' }), ctx({ worker: w })).google.href.indexOf('details=') < 0),
    'a Worker URL with a path, query, fragment, plain http or another host builds no guest link at all, so nothing extra can ride into an event');
  check(M.guestLink(DW.id, '', 'https://my-proxy.someone.workers.dev/') === 'https://my-proxy.someone.workers.dev/i/' + DW.id && M.guestLink('short', '') === '' && M.guestLink(DW.id, 'bad code!') === '' &&
    M.guestLink(DW.id, 'anjo-z5') === W + '/i/' + DW.id + '#m=anjo-z5',
    'a valid Worker override is used (trailing slash trimmed); a malformed id or member code builds no link; the nudge adds only #m=<code>');
  check(['', '   ', null, undefined].every((w) => M.guestLink(DW.id, '', w) === W + '/i/' + DW.id && M.calendarAdd(model(DW, { me: 'ashwin-p8' }), ctx({ worker: w })).details === W + '/i/' + DW.id),
    'a blank Worker override (empty or spaces) keeps the built-in Worker, as v1 does (PIA-119), so shares and events never silently lose the guest link');
  const meH = M.handoffs(model(DW, { me: 'ashwin-p8' }), 'ashwin-p8', ctx()), otherH = M.handoffs(model(DW, { me: 'ashwin-p8' }), 'anjo-z5', ctx());
  check(meH.nudge === '' && !!meH.calendar && otherH.calendar === null && otherH.nudge === W + '/i/' + DW.id + '#m=anjo-z5' && M.handoffs(model(DW), 'nope', ctx()) === null,
    'the calendar is offered on my own face only; a nudge only for someone else; an unknown code gets nothing');
  const nudgeOf = (doc, me, code) => M.handoffs(model(doc, { me }), code, ctx()).nudge;
  const maybeAnjo = tweak(DW, (d) => { d.responses['anjo-z5'] = R('maybe', 'LGA'); });
  check(nudgeOf(TG, 'LAX', 'PIA') === '' && nudgeOf(LEG, 'LAX', 'PIA') === '' && nudgeOf(TG, 'LAX', 'LGA') === '' && nudgeOf(DW, 'ashwin-p8', 'momdad-k3') === '' && nudgeOf(outDw, 'ashwin-p8', 'anjo-z5') === '' &&
    nudgeOf(DW, 'ashwin-p8', 'anjo-z5') === W + '/i/' + DW.id + '#m=anjo-z5' && nudgeOf(maybeAnjo, 'ashwin-p8', 'anjo-z5') === W + '/i/' + DW.id + '#m=anjo-z5' && nudgeOf(DW, undefined, 'anjo-z5') !== '',
    'a nudge only for someone else who is ◌ waiting or ? maybe: never a host (Mom & Dad on Thanksgiving, answered or not), never someone who is in or out');
  check(cal(DW, 'ashwin-p8').ics.filename === 'diwaliinraleigh.ics' && cal(tweak(DW, (d) => { d.idea.title = '🪔 ディワリ'; }), 'ashwin-p8').ics.filename === 'rdu.ics' &&
    cal(tweak(DW_NODEST, (d) => { d.idea.title = '🪔 ディワリ'; }), 'ashwin-p8').ics.filename === 'trip.ics',
    'the .ics file name is the trip name in ASCII, else the destination code, else "trip" (never the member-code fallback "m")');
  const tricky = cal(tweak(DW, (d) => { d.idea.title = '🎉 Mom, Dad; and a \\ backslash\nnext'; }), 'ashwin-p8');
  check(/\r\nSUMMARY:\? 🎉 Mom\\, Dad\\; and a \\\\ backslash\\nnext\r\n/.test(tricky.ics.text) && tricky.google.href.indexOf('text=%3F%20%F0%9F%8E%89%20Mom%2C%20Dad%3B%20and%20a%20%5C%20backslash%0Anext&') > 0,
    '.ics text values escape commas, semicolons, backslashes and newlines; the Google link percent-encodes them');
  // an unknown destination code, so the stored city (with its comma) is the event's place
  const longCal = cal(tweak(DW, (d) => { d.idea.title = '🪔 Diwali at the Venkataraman–Oyelaran family home 🏡 with everyone 🎆🎆'; d.idea.destination = { city: 'Raleigh–Durham, Research Triangle', airport: 'ZZV' }; }), 'ashwin-p8');
  const physical = longCal.ics.text.split('\r\n');
  const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  const unfolded = longCal.ics.text.replace(/\r\n /g, '');
  check(physical[physical.length - 1] === '' && physical.every((l) => Buffer.byteLength(l, 'utf8') <= 75 && !loneSurrogate.test(l) && l.indexOf('\n') < 0 && l.indexOf('\r') < 0) &&
    physical.some((l) => l[0] === ' ') && unfolded.indexOf('\r\nSUMMARY:' + longCal.title.replace(/,/g, '\\,') + '\r\n') > 0 && unfolded.indexOf('\r\nLOCATION:Raleigh–Durham\\, Research Triangle\r\n') > 0,
    'every .ics line is ≤ 75 octets with CRLF endings; long values fold without splitting an emoji and unfold back exactly');
  const foldBytes = (s) => M.icsFold(s).split('\r\n').map((l) => Buffer.byteLength(l, 'utf8'));
  const fireworks = 'SUMMARY:' + '🎆'.repeat(40);
  check(eq(foldBytes('DESCRIPTION:' + 'x'.repeat(200)), [75, 75, 64]) && eq(foldBytes(fireworks), [72, 73, 25]) && eq(foldBytes('x'.repeat(75)), [75]) && eq(foldBytes('x'.repeat(76)), [75, 2]) &&
    M.icsFold(fireworks).replace(/\r\n /g, '') === fireworks && !loneSurrogate.test(M.icsFold(fireworks).split('\r\n').join('')),
    'folding fills each line to exactly 75 octets, a continuation counting its leading space: 212 ASCII octets fold as 75/75/64, 40 fireworks (168 octets) as 72/73/25 without splitting one');
  // a stored title or city is free text (the Worker only trims it): a lone CR or a control character must not start a line
  const crCal = cal(tweak(DW, (d) => { d.idea.title = '🎉 A\rDESCRIPTION:https://evil.example/#k=x\u0000\u0007'; d.idea.destination = { city: 'Ral\reigh\u0000\u001b', airport: 'ZZV' }; }), 'ashwin-p8');
  const anyBreak = crCal.ics.text.replace(/\r\n /g, '').split(/\r\n|\r|\n/);   // unfold, then break on anything a parser might
  check(eq(anyBreak.filter((l) => /DESCRIPTION:/.test(l) && !/^SUMMARY:/.test(l)), ['DESCRIPTION:' + W + '/i/' + DW.id]) &&
    !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(crCal.ics.text) && crCal.ics.text.split('\r\n').every((l) => l.indexOf('\r') < 0 && l.indexOf('\n') < 0) &&
    /\r\nSUMMARY:\? 🎉 A\\nDESCRIPTION:https:\/\/evil\.example\/#k=x\r\n/.test(crCal.ics.text) && /\r\nLOCATION:Ral\\neigh\r\n/.test(crCal.ics.text),
    'a lone CR or a control character (NUL, BEL, ESC) in a stored title or city cannot start a new .ics line on any parser: CR becomes \\n, controls are dropped, and the guest link is the only DESCRIPTION');
  const badId = cal(tweak(DW, (d) => { d.id = 'x\r\nDESCRIPTION:https://evil.example/'; }), 'ashwin-p8');
  check(/\r\nUID:trip-ashwin-p8@pialax\r\n/.test(badId.ics.text) && badId.ics.text.indexOf('evil') < 0 && badId.details === '' && badId.ics.text.indexOf('DESCRIPTION') < 0,
    'the UID is built from checked codes only: a malformed trip id never reaches the .ics (UID falls back to "trip", and with no guest link there is no DESCRIPTION)');
  const legacy = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/v1-cutover-contract.json'), 'utf8'));
  check(legacy.worker === M.WORKER_URL, 'guest links retain the frozen v1 Worker origin');

  // ═══ AC8 ════════════════════════════════════════════════════════════════
  section('AC8 Flighty is offered only after that traveler is booked');
  const bk = model(DW_BOOKED, { me: 'ashwin-p8' });
  const fly = bk.members.map((x) => [x.code, !!M.handoffs(bk, x.code, ctx()).flighty]);
  check(eq(fly, [['momdad-k3', false], ['ashwin-p8', true], ['anjo-z5', false]]) && M.handoffs(bk, 'ashwin-p8', ctx()).flighty.href === 'https://www.flighty.com/',
    'Diwali with only Ashwin 🎫: Flighty for him alone (https://www.flighty.com/); nobody else gets it');
  check(allHandoffs(DW).every((r) => !r.h.flighty) && allHandoffs(TG).every((r) => !r.h.flighty) && allHandoffs(LX).every((r) => !r.h.flighty), 'no Flighty on trips where nobody is booked');
  const outBooked = tweak(DW, (d) => { d.responses['ashwin-p8'] = R('out', 'LAX', '', '', { booked: true }); });
  check(!M.handoffs(model(outBooked), 'ashwin-p8', ctx()).flighty && !M.handoffs(model(tgBooked), 'PIA', ctx()).flighty, 'a stray booked flag on someone who is out, or on a host, offers no Flighty');
  const maybeBooked = tweak(DW, (d) => { d.responses['ashwin-p8'].status = 'maybe'; d.responses['ashwin-p8'].booked = true; });
  check(!!M.handoffs(model(maybeBooked), 'ashwin-p8', ctx()).flighty, 'a maybe who marked booked is a booked traveler: Flighty shows');
  check(legacy.flighty === M.FLIGHTY_URL, 'Flighty retains the frozen v1 handoff URL');

  // ═══ AC9 ════════════════════════════════════════════════════════════════
  section('AC9 no test or app path calls Google live');
  const banned = [[/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts/, 'network call'], [/window\.open|\b(?:document|window|navigator|location)\.[A-Za-z_]/, 'DOM, window.open or navigation'],
    [/console\.log/, 'console.log'], [/<\/script/i, 'closing script tag'], [/Date\.now|new Date\(\s*\)|performance\.now|Math\.random/, 'clock or randomness']];
  banned.forEach(([re, what]) => check(!re.test(region), 'the inlined region (with the link builder) has no ' + what, (region.match(re) || [])[0]));
  const sample = M.handoffs(model(DW_BOOKED, { me: 'ashwin-p8' }), 'ashwin-p8', ctx());
  check(eq(JSON.parse(JSON.stringify(sample)), sample) && !JSON.stringify(sample).includes('function'), 'hand-offs are plain data (strings and flags): the builder only builds URLs, it never opens one');
  const pf = fs.readFileSync(path.join(ROOT, 'scripts', 'preflight.sh'), 'utf8');
  check(/suites=\([^)]*\btest-gflinks\.sh\b[^)]*\)/.test(pf) && fs.existsSync(path.join(ROOT, 'scripts', 'test-gflinks.sh')), 'preflight runs this suite (test-gflinks.sh is in its suites list)');
  check(netCalls.length === 0, 'no network: fetch, http(s) and net were never called', netCalls);

  console.log('');
  if (failCount) { console.log(failCount + ' failing, ' + passCount + ' passing'); process.exit(1); }
  console.log('all ' + passCount + ' checks passing');
  process.exit(0);
}
try { main(); } catch (e) { console.log('  XX  suite crashed: ' + (e && e.stack ? e.stack : e)); console.log('1 failing'); process.exit(1); }

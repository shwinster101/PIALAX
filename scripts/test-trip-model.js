'use strict';
// test-trip-model.js — PIA-132: the v2 trip model (scripts/trip-model.js).
//
// One /idea record (plus this phone's identity, keys and fare cache) → one
// view. Every acceptance criterion of PIA-132 has a named group below
// (AC1 … AC11). Write builders are proven by round-tripping through the REAL
// worker.js /idea handlers in-process — loaded the way test-worker.js loads
// it (a byte-identical .mjs copy in a temp dir) — against an in-memory KV.
//
// Deterministic and offline: "today" is pinned to 2026-10-17 and "now" to
// 19:00 UTC that day (see the TEST-DEFLAKE-AGE lesson: no check reads the
// clock or sits on a time boundary), and fetch is stubbed to fail, so any
// network call is caught as a failure.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const TODAY = '2026-10-17';
const NOW = Date.UTC(2026, 9, 17, 19, 0, 0);
const HOUR = 36e5;
const KEY = 'pialax-test-edit-key-0123456789abcdefghijk';   // matches the Worker's IDEA_KEY_RE
const ORIGIN = 'https://shwinster101.github.io';

let passCount = 0;
let failCount = 0;
function check(ok, msg, detail) {
  if (ok) { console.log('  OK  ' + msg); passCount++; return; }
  console.log('  XX  ' + msg + (detail === undefined ? '' : '\n        ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))));
  failCount++;
}
function section(title) { console.log('\n▶ ' + title); }

// ---- offline: no path in this suite may touch the network ----------------
const netCalls = [];
globalThis.fetch = async (u) => { netCalls.push(String(u)); throw new Error('network disabled in test-trip-model'); };

const M = require(path.join(ROOT, 'scripts', 'trip-model.js'));
const fx = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', name), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ctx = (over) => Object.assign({ today: TODAY, now: NOW }, over || {});
const model = (doc, over) => M.tripModel(doc, ctx(over));
const mem = (m, code) => m.members.find((x) => x.code === code);
const tweak = (doc, f) => { const d = clone(doc); f(d); return d; };
function R(status, origin, from, to, extra) {
  return Object.assign({ status, origin, available_from: from || '', available_to: to || '', note: '', arrive_at: '', leave_from: '', updated_at: '2026-10-16T00:00:00.000Z' }, extra || {});
}
// every number and key reachable from a value (cycle-safe), to prove a price never leaks in
function scan(v) {
  const nums = [], keys = [], seen = new Set();
  (function walk(x) {
    if (x === null || typeof x !== 'object') { if (typeof x === 'number') nums.push(x); return; }
    if (seen.has(x)) return; seen.add(x);
    Object.keys(x).forEach((k) => { keys.push(k); walk(x[k]); });
  })(v);
  return { nums, keys };
}
function eachDay(s, e, f) { for (let d = s; d <= e; d = M.addD(d, 1)) f(d); }

// Golden links: E1–E3, E6, E7 were opened live 2026-10-17; the trip links are the spec's v2 sample links.
const GF = 'https://www.google.com/travel/flights/search?tfs=';
const TAIL = '&hl=en&gl=us&curr=USD';
const G = {
  E1: GF + 'CBwQAhoeEgoyMDI2LTExLTIwagcIARIDTEFYcgcIARIDUElBGh4SCjIwMjYtMTEtMjlqBwgBEgNQSUFyBwgBEgNMQVhAAUgBcAGCAQsI____________AZgBAQ' + TAIL,
  E2: GF + 'CBwQAhoeEgoyMDI2LTExLTIwagcIARIDTEFYcgcIARIDUElBGh4SCjIwMjYtMTEtMjlqBwgBEgNPUkRyBwgBEgNMQVhAAUgBcAGCAQsI____________AZgBAw' + TAIL,
  E3: GF + 'CBwQAhoeEgoyMDI2LTExLTIwagcIARIDUElBcgcIARIDUkRVGh4SCjIwMjYtMTEtMjlqBwgBEgNSRFVyBwgBEgNQSUFAAUABSAFwAYIBCwj___________8BmAEB' + TAIL,
  E6: GF + 'CBwQAhonEgoyMDI2LTExLTIwagcIARIDTEdBagcIARIDSkZLcgcIARIDUElBGicSCjIwMjYtMTEtMjlqBwgBEgNQSUFyBwgBEgNMR0FyBwgBEgNKRktAAUgBcAGCAQsI____________AZgBAQ' + TAIL,
  E7: GF + 'CBwQAhokEgoyMDI2LTExLTIwKAAyAlVBagcIARIDTEFYcgcIARIDT1JEGiQSCjIwMjYtMTEtMjkoADICVUFqBwgBEgNPUkRyBwgBEgNMQVhAAUABSAFwAYIBCwj___________8BmAEB' + TAIL,
  tgAshwin: GF + 'CBwQAhpCEgoyMDI2LTExLTIwagcIARIDTEFYagcIARIDQlVSagcIARIDTEdCagcIARIDU05BagcIARIDT05UcgcIARIDUElBGkISCjIwMjYtMTEtMjlqBwgBEgNPUkRyBwgBEgNMQVhyBwgBEgNCVVJyBwgBEgNMR0JyBwgBEgNTTkFyBwgBEgNPTlRAAUgBcAGCAQsI____________AZgBAw' + TAIL,
  tgAshIn: GF + 'CBwQAhpCEgoyMDI2LTExLTIwagcIARIDTEFYagcIARIDQlVSagcIARIDTEdCagcIARIDU05BagcIARIDT05UcgcIARIDUElBQAFIAXABggELCP___________wGYAQI' + TAIL,
  tgAshOut: GF + 'CBwQAhpCEgoyMDI2LTExLTI5agcIARIDT1JEcgcIARIDTEFYcgcIARIDQlVScgcIARIDTEdCcgcIARIDU05BcgcIARIDT05UQAFIAXABggELCP___________wGYAQI' + TAIL,
  tgAnjo: GF + 'CBwQAhowEgoyMDI2LTExLTI0agcIARIDTEdBagcIARIDSkZLagcIARIDRVdScgcIARIDUElBGjASCjIwMjYtMTEtMjlqBwgBEgNPUkRyBwgBEgNMR0FyBwgBEgNKRktyBwgBEgNFV1JAAUgBcAGCAQsI____________AZgBAw' + TAIL,
  dwAsh: GF + 'CBwQAhpCEgoyMDI2LTExLTA2agcIARIDTEFYagcIARIDQlVSagcIARIDTEdCagcIARIDU05BagcIARIDT05UcgcIARIDUkRVGkISCjIwMjYtMTEtMDlqBwgBEgNSRFVyBwgBEgNMQVhyBwgBEgNCVVJyBwgBEgNMR0JyBwgBEgNTTkFyBwgBEgNPTlRAAUgBcAGCAQsI____________AZgBAQ' + TAIL,
  dwAshP1: GF + 'CBwQAhpCEgoyMDI2LTExLTA3agcIARIDTEFYagcIARIDQlVSagcIARIDTEdCagcIARIDU05BagcIARIDT05UcgcIARIDUkRVGkISCjIwMjYtMTEtMTBqBwgBEgNSRFVyBwgBEgNMQVhyBwgBEgNCVVJyBwgBEgNMR0JyBwgBEgNTTkFyBwgBEgNPTlRAAUgBcAGCAQsI____________AZgBAQ' + TAIL,
  dwMD: GF + 'CBwQAhonEgoyMDI2LTExLTA2agcIARIDUElBagcIARIDT1JEcgcIARIDUkRVGicSCjIwMjYtMTEtMDlqBwgBEgNSRFVyBwgBEgNQSUFyBwgBEgNPUkRAAUABSAFwAYIBCwj___________8BmAEB' + TAIL,
  dwAnjo: GF + 'CBwQAhowEgoyMDI2LTExLTA2agcIARIDTEdBagcIARIDSkZLagcIARIDRVdScgcIARIDUkRVGjASCjIwMjYtMTEtMDlqBwgBEgNSRFVyBwgBEgNMR0FyBwgBEgNKRktyBwgBEgNFV1JAAUgBcAGCAQsI____________AZgBAQ' + TAIL,
};

// ---- the real Worker, in-process, over an in-memory KV ---------------------
async function loadWorker() {
  const src = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pialax-trip-model-'));
  const file = path.join(dir, 'worker.mjs');
  fs.writeFileSync(file, src);
  try { return { src, worker: (await import('file://' + file)).default }; }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function makeServer(worker) {
  const map = new Map();
  const env = { IDEAS: { async get(k) { return map.has(k) ? map.get(k) : null; }, async put(k, v) { map.set(k, String(v)); }, async delete(k) { map.delete(k); } } };
  const hash = crypto.createHash('sha256').update(KEY).digest('hex');
  let n = 0;
  const srv = {
    // seed a fixture under a fresh id, so every scenario starts from the same record
    seed(doc) { const d = clone(doc); d.id = (d.id.slice(0, 18) + 'n' + String(++n).padStart(3, '0')).slice(0, 22); d.edit_hash = hash; map.set('idea:' + d.id, JSON.stringify(d)); return d.id; },
    async call(method, p, body, key) {
      const headers = { 'Content-Type': 'application/json', Origin: ORIGIN };
      if (key) headers['X-Idea-Key'] = key;
      const res = await worker.fetch(new Request('https://w.dev' + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
      let json = null; try { json = JSON.parse(await res.text()); } catch (e) { json = null; }
      return { status: res.status, json };
    },
    async get(id, key) { const r = await srv.call('GET', '/idea?id=' + encodeURIComponent(id), undefined, key); return r.json && r.json.doc; },
    async send(reqs) {
      const out = [];
      for (const q of [].concat(reqs || [])) { const r = await srv.call(q.method, q.path, q.body); out.push(r); if (r.status >= 300) break; }
      return out;
    },
    allOk: (rs) => rs.length > 0 && rs.every((r) => r.status === 200 || r.status === 201),
  };
  return srv;
}

(async function main() {
  console.log('▶ test-trip-model: one /idea record → one view (PIA-132)');
  const { src: workerSrc, worker } = await loadWorker();
  check(!!(worker && typeof worker.fetch === 'function'), 'worker.js loads as an ES module (the real /idea handlers run in-process)');
  const srv = makeServer(worker);

  const LEG = fx('idea-thanksgiving-legacy.json');
  const DW = fx('idea-diwali.json');
  const TH = fx('idea-tahoe.json');
  const M8 = fx('idea-8members.json');
  const CY = fx('idea-undated.json');
  const LX = fx('idea-lax-local.json');
  const V1 = fx('v1-watchlist-storage.json');

  // ---- setup: the legacy doc, read through the Worker as organizer and guest, then migrated ----
  const lgId = srv.seed(LEG);
  const lgOrg = await srv.get(lgId, KEY);
  const lgGuest = await srv.get(lgId);
  const v1 = tweak(V1, (s) => { s.overrides.thanksgiving.sharedIdeaId = lgId; });
  const mig = M.migrateOptions(lgOrg, v1);
  const migReqs = M.migrateRequests(lgOrg, KEY, { plan: mig.span, pin: mig.pin, labels: mig.labels });
  const migRes = await srv.send(migReqs);
  const tg = await srv.get(lgId, KEY);           // the v2 Thanksgiving every later group builds on

  // ═══ AC1 ════════════════════════════════════════════════════════════════
  section('AC1 legacy Thanksgiving: one place, plan, heads count and stage; no Me; no stored price; own window wins');
  check(lgOrg.idea.recommendation.familyTotal === 704 && lgOrg.decision.estimate_total === 704 && lgGuest.idea.recommendation.familyTotal === null,
    'fixture: the organizer view carries the frozen familyTotal 704 (decision chosen); the guest view has it stripped');
  const lg = model(lgOrg, { me: 'LAX', hasEditKey: true, hasToken: true, fares: {} });
  check(lg.dest === 'PIA' && eq(lg.hub, ['PIA', 'ORD']) && lg.alt === 'ORD' && lg.city === 'Peoria',
    'exactly one destination (PIA) and hub pair (PIA+ORD); the city comes from the airport table, not the v1 card title');
  check(eq(lg.plan, { s: '2026-11-25', e: '2026-11-29' }), "exactly one plan: the recommendation's 11/25–11/29");
  check(lg.heads === 4 && lg.headsIn === 4, 'one heads count: 4 (Mom & Dad ×2 + Ashwin + Anjo), 4 in');
  check(lg.stage === 'asking' && lg.decision === 'chosen', 'one stage: Asking (the legacy decision is chosen, but that does not make it Dates set)');
  check(lg.legacy && lg.legacyLock && !lg.locked && !lg.closed, 'the legacy 🔒 renders as proposed: legacyLock, not locked, not closed');
  // every string in the model a screen could render (raw answers, typed note text and link URLs aside)
  const meHits = [];
  [lg, model(lgGuest, { me: 'LAX' })].forEach((mm) => {
    const seen = new Set();
    (function walk(x, p) {
      if (typeof x === 'string') { if (/\bme\b/i.test(x)) meHits.push(p + ' = ' + x); return; }
      if (!x || typeof x !== 'object' || seen.has(x)) return; seen.add(x);
      Object.keys(x).forEach((k) => { if (['resp', 'noteText', 'link'].indexOf(k) < 0) walk(x[k], p + '.' + k); });
    })(mm, 'model');
  });
  const lgMe = mem(lg, 'LAX');
  check(meHits.length === 0 && lgMe.name === '' && lgMe.norm === '' && !!lgMe.face && lgMe.label === lgMe.face,
    "no 'Me' word in any string of the model (organizer and guest): the 'Me' member's label is its face alone, with no name", meHits);
  // (PIA-152: the family preset's people on a v1 doc show the preset's faces; the same labels anywhere else keep the hashed rule)
  const lgAway = model(tweak(lgOrg, (d) => { d.idea.members.forEach((x) => { x.airport = 'DEN'; }); }), { me: 'LAX' });
  check(mem(lg, 'PIA').face === '🌽' && lgMe.face === '💪' && mem(lg, 'LGA').face === '🗽' && new Set(lg.members.map((x) => x.face)).size === 3 &&
    mem(lgAway, 'PIA').face === M.hashedFace('mom & dad') && mem(lgAway, 'LGA').face === M.hashedFace('anjo') && new Set(lgAway.members.map((x) => x.face)).size === 3,
    'emoji-less v1 labels the family preset recognises (Mom & Dad at PIA, the v1 "Me" at LAX, Anjo at LGA) show its faces 🌽 💪 🗽 (PIA-152); any other gets the hashed face FACES[fnv1a(name) % 24], moved on when the trip already shows it: three tiles, three faces');
  const lgScan = scan(lg);
  check(!lgScan.nums.includes(704) && !lgScan.keys.some((k) => /familyTotal|totalFare|perTicketFare|estimate_total|actual_total/.test(k)) && lg.price && lg.price.total === null && lg.paid === null,
    'never a price from the record: 704 and familyTotal appear nowhere in the model, and with no cached fares the total is empty');
  const lgAsh = mem(lg, 'LAX');
  check(lgAsh.d1 === '2026-11-20' && lgAsh.d2 === '2026-11-29' && lgAsh.warn.indexOf('off') >= 0, "Ashwin's dates are his own 11/20–11/29 (his window wins) with ⚠ outside the stale plan");
  check(!!lgAsh.link && lgAsh.link.href === G.tgAshwin, "Ashwin's link on the unmigrated doc is the golden multi-city link (LA set → PIA 11/20, ORD → LA set 11/29)");
  const lgDec = lgAsh.link && M.gfDecode(lgAsh.link.href);
  check(!!lgDec && lgDec.trip === 3 && lgDec.legs[0].date === '2026-11-20' && lgDec.legs[1].date === '2026-11-29' && eq(lgDec.legs[1].from, ['ORD']) && lgDec.adults === 1,
    'decoded: trip 3, in to PIA on 11/20, home from ORD on 11/29, 1 adult');
  check(mem(lg, 'LGA').link && mem(lg, 'LGA').link.href === G.tgAnjo && mem(lg, 'LGA').warn.indexOf('off') >= 0, "Anjo's own 11/24–11/29 wins too (NY set, ORD home), also flagged off the stale plan");
  const lgG = model(lgGuest, { me: 'LAX' });
  check(lgG.stage === lg.stage && lgG.heads === 4 && eq(lgG.plan, lg.plan) && mem(lgG, 'LAX').link.href === G.tgAshwin && lgG.price === null,
    'the guest view of the same doc reads the same (stage, plan, heads, link) and has no price slot');

  // ═══ AC2 ════════════════════════════════════════════════════════════════
  section('AC2 the stage follows the record in order; closed means only paid or dropped; organizer = guest');
  const CHOSEN = { stage: 'chosen', chosen: { airport: 'RDU', city: 'Raleigh', departure: '2026-11-06', return: '2026-11-09' }, chosen_at: '2026-10-16T00:00:00.000Z', estimate_total: null, actual_total: null, booked_at: null, delta_pct: null };
  check(model(tweak(DW, (d) => { d.responses = {}; })).stage === 'idea', 'no answer → 💡 Idea');
  check(model(DW).stage === 'asking', 'any answer → 📣 Asking');
  const dwSet = tweak(DW, (d) => { d.decision = clone(CHOSEN); });
  check(model(dwSet).stage === 'set' && model(dwSet).locked && !model(dwSet).closed, 'locked (non-legacy chosen) → 🔒 Dates set, not closed');
  const dwOne = tweak(dwSet, (d) => { d.responses['ashwin-p8'].booked = true; });
  check(model(dwOne).stage === 'booking', 'any traveler booked → 🎫 Booking (ranks above Dates set)');
  const dwAll = tweak(dwOne, (d) => { d.responses['momdad-k3'].booked = true; d.responses['anjo-z5'] = R('in', 'LGA', '', '', { booked: true }); });
  check(model(dwAll).stage === 'done' && !model(dwAll).closed, 'every traveler booked → 🏁 Done, yet not closed (a derived 🏁 is not closed)');
  const dwPaid = tweak(DW, (d) => { d.decision = Object.assign(clone(CHOSEN), { stage: 'booked', actual_total: 1490, booked_at: '2026-10-17T00:00:00.000Z' }); });
  check(model(dwPaid).stage === 'done' && model(dwPaid).closed && model(dwPaid).paid === 1490, 'paid (decision booked) → 🏁 Done and closed');
  const dwDrop = tweak(dwAll, (d) => { d.decision.stage = 'dropped'; });
  check(model(dwDrop).stage === 'dropped' && model(dwDrop).closed, 'dropped outranks everything (even all booked) → 🗑, closed');
  const dwOut = tweak(DW, (d) => { ['momdad-k3', 'ashwin-p8', 'anjo-z5'].forEach((c) => { d.responses[c] = R('out', '', '', '', { booked: true }); }); });
  check(model(dwOut).travelers.length === 0 && model(dwOut).stage === 'asking', 'never Done on an empty traveler set (everyone out, even with stray booked flags)');
  const lxHosts = tweak(LX, (d) => { ['priya-x1', 'leo-x4', 'anjo-x5'].forEach((c) => { d.responses[c] = R('out', ''); }); });
  check(model(lxHosts).travelers.length === 0 && model(lxHosts).stage === 'asking', 'a trip left with only hosts is not Done either');
  check(model(dwSet).stage === 'set' && model(tweak(LEG, () => {})).stage !== 'set', 'a legacy chosen doc is never Dates set; a v2 chosen doc is');
  // organizer and guest read the same doc through the Worker at every stage
  const sid = srv.seed(DW);
  const views = async (label) => {
    const o = await srv.get(sid, KEY), g = await srv.get(sid);
    const a = model(o, { me: 'ashwin-p8' }), b = model(g, { me: 'ashwin-p8' });
    const strip = (m) => { const x = clone(m); delete x.paid; return x; };
    check(eq(strip(a), strip(b)) && a.stage === label, 'organizer and guest views give the identical model at ' + label, { org: a.stage, guest: b.stage });
  };
  await views('asking');
  await srv.send(M.updateRequest(await srv.get(sid, KEY), KEY, { decision: { stage: 'chosen', chosen: CHOSEN.chosen } }));
  await views('set');
  await srv.send(M.bookedRequests(await srv.get(sid), 'ashwin-p8', true));
  await views('booking');
  await srv.send(M.bookedRequests(await srv.get(sid), 'momdad-k3', true));
  await srv.send(M.bookedRequests(await srv.get(sid), 'anjo-z5', true, { by: 'self' }));
  await views('done');
  await srv.send(M.updateRequest(await srv.get(sid, KEY), KEY, { decision: { stage: 'booked', actual_total: 1490 } }));
  await views('done');
  const paidOrg = model(await srv.get(sid, KEY)), paidGuest = model(await srv.get(sid));
  check(paidOrg.closed && paidGuest.closed && paidOrg.paid === 1490 && paidGuest.paid === null, 'after 💵 both views are closed; only the organizer view carries what was paid');
  // the decision an update sends is built from the record, never passed through from the caller
  const chId = srv.seed(DW);
  const chFresh = await srv.get(chId, KEY);
  const chRes = await srv.send(M.updateRequest(chFresh, KEY, { decision: { stage: 'chosen' } }));
  const chDoc = await srv.get(chId, KEY);
  check(srv.allOk(chRes) && chDoc.decision.stage === 'chosen' && eq([chDoc.decision.chosen.airport, chDoc.decision.chosen.city, chDoc.decision.chosen.departure, chDoc.decision.chosen.return], ['RDU', 'Raleigh', '2026-11-06', '2026-11-09']) &&
    chDoc.decision.estimate_total === null && model(chDoc).stage === 'set',
    "🔒 alone ({stage: 'chosen'}) round-trips through the Worker: the plan is chosen (RDU 11/06–11/09) with no estimate stored");
  const priced = M.updateRequest(chFresh, KEY, { decision: { stage: 'chosen', chosen: { airport: 'CLT', departure: '2027-01-01', return: '2027-01-05', familyTotal: 999, totalFare: 998 } } });
  const prRes = await srv.send(priced);
  const prDoc = await srv.get(chId, KEY);
  check(srv.allOk(prRes) && !scan(priced.body).nums.some((n) => n >= 998) && prDoc.decision.estimate_total === null && prDoc.decision.chosen.familyTotal === null && prDoc.decision.chosen.airport === 'RDU',
    'a chosen the caller passes (another airport, prices) is ignored: the Worker stores no estimate and 🔒 is the plan');
  const moveLock = M.updateRequest(chFresh, KEY, { dates: { departure: '2026-11-07', return: '2026-11-10' }, decision: { stage: 'chosen' } });
  check(moveLock.body.decision.chosen.departure === '2026-11-07' && moveLock.body.decision.chosen.return === '2026-11-10', 'a plan move plus 🔒 in one edit chooses the NEW plan');
  check(M.updateRequest(tweak(chFresh, (d) => { d.idea.dates.departure = ''; d.idea.dates.return = ''; }), KEY, { decision: { stage: 'chosen' } }) === null &&
    M.updateRequest(tweak(chFresh, (d) => { d.idea.destination.airport = ''; }), KEY, { decision: { stage: 'chosen' } }) === null,
    'nothing to 🔒 without a plan or a destination: builds nothing instead of a 400');
  const pay = M.updateRequest(prDoc, KEY, { decision: { stage: 'booked', actual_total: 1489.6, chosen: { familyTotal: 5 } } });
  check(eq(pay.body.decision, { stage: 'booked', actual_total: 1490 }) && M.updateRequest(chFresh, KEY, { decision: { stage: 'booked', actual_total: 1490 } }) === null &&
    [0, -5, '1490', NaN, 1e6, undefined].every((v) => M.updateRequest(prDoc, KEY, { decision: { stage: 'booked', actual_total: v } }) === null),
    '💵 sends only {stage, actual_total} in whole dollars, needs a 🔒 first, and a bad amount builds nothing');
  check(eq(M.updateRequest(prDoc, KEY, { decision: { stage: 'dropped', chosen: {} } }).body.decision, { stage: 'dropped' }) && M.updateRequest(prDoc, KEY, { decision: { stage: 'nope' } }) === null,
    'proposed and dropped carry the stage alone; an unknown stage builds nothing');

  // ═══ AC3 ════════════════════════════════════════════════════════════════
  section('AC3 hosts: in until they answer, unconfirmed, never nudged, no links or searches; heads by headcount');
  const tgM = model(tg, { me: 'LAX', hasEditKey: true, hasToken: true });
  const md = mem(tgM, 'PIA');
  check(md.host && md.status === 'host-default' && md.unconfirmed && !md.nudge && !md.traveler && !md.link && md.keys.length === 0,
    'Thanksgiving: Mom & Dad (PIA) host — in by default, unconfirmed, not a nudge target, no link and no search');
  check(tgM.headsIn === 4 && tgM.nudgeTargets.length === 0 && tgM.price.hosts.indexOf('PIA') >= 0 && !tgM.price.per.PIA, 'they count as in (4/4), nobody is nudged, and pricing gives them no row');
  const mdIn = model(tweak(tg, (d) => { d.responses.PIA = R('in', 'PIA'); }));
  const mdOutM = model(tweak(tg, (d) => { d.responses.PIA = R('out', 'PIA'); }));
  check(mem(mdIn, 'PIA').status === 'in' && !mem(mdIn, 'PIA').unconfirmed && mem(mdOutM, 'PIA').status === 'out' && mdOutM.headsIn === 2,
    'once a host answers the flag goes; a host who says out leaves the count (2/4)');
  const dwM = model(DW);
  check(!mem(dwM, 'momdad-k3').host && !!mem(dwM, 'momdad-k3').link && eq(dwM.nudgeTargets.map((x) => x.code), ['anjo-z5']),
    'Diwali (RDU): Mom & Dad are ordinary travelers with a link; only the waiting Anjo is a nudge target');
  const lx = model(LX, { hasEditKey: true, hasToken: true, multiAirport: true });
  check(mem(lx, 'maya-x2').host && mem(lx, 'ashwin-x3').host && !mem(lx, 'maya-x2').link && !mem(lx, 'ashwin-x3').link && !mem(lx, 'maya-x2').keys.length && !mem(lx, 'ashwin-x3').keys.length,
    'LAX trip: the SNA member (metro group) and the LAX member are hosts with no link or search');
  const LA = M.NEARBY_GROUPS[0];
  const selfSearch = [];
  const inLA = (cs) => cs.some((c) => LA.indexOf(c) >= 0);
  lx.members.forEach((m) => {
    m.keys.forEach((k) => { const p = k.key.split('|'), F = p[1].split(','), T = p[2].split(','); if (F.some((c) => T.indexOf(c) >= 0) || (inLA(F) && inLA(T))) selfSearch.push(k.key); });
    if (m.link) M.gfDecode(m.link.href).legs.forEach((L) => { if (L.from.some((c) => L.to.indexOf(c) >= 0) || (inLA(L.from) && inLA(L.to))) selfSearch.push(m.code); });
  });
  M.cheapCandidates(lx, {}, NOW, TODAY).forEach((c) => c.missing.forEach((k) => { const p = k.split('|'); if (inLA(p[1].split(',')) && inLA(p[2].split(','))) selfSearch.push(k); }));
  check(selfSearch.length === 0 && eq(M.originSet('SNA', 'LAX'), []), 'never a LAX→LAX (LA set → LA set) search or link, in links, priced legs or cheapest-week candidates', selfSearch);
  const m8 = model(M8);
  check(m8.members.length === 8 && m8.heads === 10 && m8.headsIn === 7, 'heads are counted by headcount, not rows: 8 members, 10 heads, 7 in (2 SAV hosts by default)');

  // ═══ AC4 ════════════════════════════════════════════════════════════════
  section("AC4 each end is the person's own when set, else the plan's; plan moves never rewrite a set end; problems are flagged");
  const th = model(TH);
  check(mem(th, 'priya-d4').d1 === '2026-11-27' && mem(th, 'priya-d4').d2 === '2026-11-30' && !mem(th, 'priya-d4').own1, 'a blank end follows the plan (Tahoe 11/27–11/30)');
  const oneEnd = model(tweak(DW, (d) => { d.responses['ashwin-p8'].available_from = '2026-11-07'; }));
  const oneDec = M.gfDecode(mem(oneEnd, 'ashwin-p8').link.href);
  check(mem(oneEnd, 'ashwin-p8').d1 === '2026-11-07' && mem(oneEnd, 'ashwin-p8').d2 === '2026-11-09' && oneDec.legs[0].date === '2026-11-07' && oneDec.legs[1].date === '2026-11-09',
    'each end is independent: own arrive 11/07 + the plan’s 11/09 return, and the link carries both');
  const withOwn = tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA', '2026-11-05', '2026-11-09'); });
  const movedPlan = model(tweak(withOwn, (d) => { d.idea.dates.departure = '2026-11-09'; d.idea.dates.return = '2026-11-12'; d.idea.notes = '📌2026-11-10'; }));
  check(mem(movedPlan, 'ashwin-p8').d1 === '2026-11-09' && mem(movedPlan, 'anjo-z5').d1 === '2026-11-05' && mem(movedPlan, 'anjo-z5').d2 === '2026-11-09',
    'a plan move moves the followers and leaves a set end alone (Anjo keeps 11/05–11/09)');
  const wo = model(withOwn);
  check(mem(wo, 'anjo-z5').warn.indexOf('off') >= 0 && mem(wo, 'ashwin-p8').warn.length === 0, '⚠ off: an end outside the plan (11/05 < 11/06); followers carry no flag');
  const missPin = model(tweak(DW, (d) => { d.responses['ashwin-p8'].available_to = '2026-11-07'; }));
  check(mem(missPin, 'ashwin-p8').warn.indexOf('pin') >= 0 && mem(missPin, 'ashwin-p8').warn.indexOf('off') < 0, '⚠ pin: a window that misses the event day (📌 11/08, leaves 11/07)');
  const bad = mem(model(tweak(DW, (d) => { d.responses['ashwin-p8'].available_from = '2026-11-12'; })), 'ashwin-p8');
  check(bad.bad && bad.warn.indexOf('order') >= 0 && !bad.link && bad.why === 'order' && bad.keys.length === 0, '⚠ order: an impossible range (own 11/12 → plan 11/09) gets no link and no search');
  const thMe = model(TH, { me: 'ashwin-l2', otherTrips: [tg] });
  const clash = mem(thMe, 'ashwin-l2').clash;
  check(clash.length === 1 && clash[0].s === '2026-11-27' && clash[0].e === '2026-11-29' && clash[0].emoji === '🦃' && mem(thMe, 'ashwin-l2').warn.indexOf('clash') >= 0,
    '⚠ clash: Ashwin is on 🦃 (11/20–11/29) and 🎿 (maybe, 11/27–11/30) at once — 11/27–11/29');
  const thOther = model(TH, { me: 'priya-d4', otherTrips: [tg] });
  check(mem(thOther, 'ashwin-l2').clash.length === 1 && mem(thOther, 'ashwin-l2').warn.indexOf('clash') < 0, 'the clash data is there for every face; the ⚠ marks only the viewer’s own face');
  const tgBack = model(tg, { me: 'LAX', otherTrips: [TH, tg] });
  check(mem(tgBack, 'LAX').clash.length === 1 && mem(tgBack, 'LAX').clash[0].s === '2026-11-27', 'the same clash shows from the Thanksgiving side (the trip itself is skipped)');
  check(mem(model(TH, { me: 'ashwin-l2', otherTrips: [lgOrg] }), 'ashwin-l2').clash.length === 0, "until P-migrate, the legacy 'Me' and 'Ashwin' count as two people (name matching)");
  const thDrop = mem(model(TH, { me: 'ashwin-l2', otherTrips: [tweak(tg, (d) => { d.decision.stage = 'dropped'; })] }), 'ashwin-l2');
  check(thDrop.clash.length === 0 && thDrop.warn.indexOf('clash') < 0, 'a dropped 🦃 is not a trip any more: no clash with it');
  const samTrip = tweak(DW, (d) => { d.idea.members[1].label = '🐨 Sam Lee'; d.idea.dates.departure = '2026-12-11'; d.idea.dates.return = '2026-12-14'; d.idea.notes = ''; });
  const samClash = mem(model(samTrip, { me: 'ashwin-p8', otherTrips: [M8] }), 'ashwin-p8').clash;
  check(samClash.length === 1 && samClash[0].s === '2026-12-12' && samClash[0].e === '2026-12-13',
    'two rows with one name in the other trip (Sam Lee out from SEA, Sam Lee in from PDX 12/12–12/13): the one who answered in is found', samClash);

  // ═══ AC5 ════════════════════════════════════════════════════════════════
  section('AC5 stale arrive/leave picks are ignored once the destination changes (PIA→CLT with leave ORD → round trip CLT)');
  const cId = srv.seed(tg);
  const cFresh = await srv.get(cId, KEY);
  const toClt = M.updateRequest(cFresh, KEY, { destination: { airport: 'CLT' }, decision: { stage: 'proposed' } });
  const cltRes = await srv.send(toClt);
  const clt = await srv.get(cId, KEY);
  check(srv.allOk(cltRes) && clt.responses.LAX.arrive_at === 'PIA' && clt.responses.LAX.leave_from === 'ORD' && clt.idea.destination.city === 'Charlotte',
    'after the destination edit alone the stored picks are still PIA / ORD (city from the table: Charlotte)');
  const cltM = model(clt, { me: 'LAX' });
  const cAsh = mem(cltM, 'LAX'), cDec = cAsh.link && M.gfDecode(cAsh.link.href);
  check(cAsh.A === 'CLT' && cAsh.H === 'CLT' && !cAsh.openJaw && cDec && cDec.trip === 1 && eq(cDec.legs[0].to, ['CLT']) && eq(cDec.legs[1].from, ['CLT']) && cAsh.keys.length === 1 && cAsh.keys[0].kind === 'rt',
    'the model ignores them: Ashwin flies a round trip to CLT (one round-trip search)');
  check(!mem(cltM, 'PIA').host && !!mem(cltM, 'PIA').link, 'Mom & Dad stop being hosts away from Peoria and get a link');
  const syncRes = await srv.send(M.airportSyncRequests(cFresh, toClt.body.idea));
  const synced = await srv.get(cId, KEY);
  check(srv.allOk(syncRes) && synced.responses.LAX.arrive_at === '' && synced.responses.LAX.leave_from === '' && synced.responses.LGA.leave_from === '',
    'the airport-sync answers then clear the stale picks in the record');

  // ═══ AC6 ════════════════════════════════════════════════════════════════
  section('AC6 write builders never lose data (round-tripped through the real worker.js handlers)');
  // complete answers
  const aId = srv.seed(DW);
  await srv.send(M.respondRequest(await srv.get(aId), 'anjo-z5', { status: 'in', available_from: '2026-11-05', available_to: '2026-11-09', note: 'Taking Friday off', origin: 'EWR', leave_from: 'RDU' }, { by: 'self' }));
  const a1 = await srv.get(aId);
  const maybe = M.respondRequest(a1, 'anjo-z5', { status: 'maybe' }, { by: 'self' });
  check(['member', 'status', 'origin', 'available_from', 'available_to', 'note'].every((k) => Object.prototype.hasOwnProperty.call(maybe.body, k)) && maybe.path === '/idea/respond?id=' + aId,
    'an answer body always carries member, status, origin, both dates and the note; the id rides the query');
  await srv.send(maybe);
  const a2 = (await srv.get(aId)).responses['anjo-z5'];
  check(a2.status === 'maybe' && a2.available_from === '2026-11-05' && a2.available_to === '2026-11-09' && a2.note === 'Taking Friday off' && a2.origin === 'EWR',
    'changing only the status keeps her dates, note and EWR override in the record');
  await srv.call('POST', '/idea/respond?id=' + aId, { member: 'anjo-z5', status: 'in' });
  const naive = (await srv.get(aId)).responses['anjo-z5'];
  check(naive.available_from === '' && naive.note === '' && naive.origin === 'LGA', 'contract: a partial body would blank dates and note and reset origin (why every answer is complete)');
  // origin: override or blank
  const ov = M.respondRequest(a1, 'anjo-z5', { origin: 'LGA' });
  const ov2 = M.respondRequest(a1, 'anjo-z5', {});
  check(ov.body.origin === '' && ov2.body.origin === 'EWR', 'origin is sent as the override, else blank (the home code counts as no override)');
  // the proxy mark
  const pId = srv.seed(DW);
  const p0 = await srv.get(pId);
  const prox1 = M.respondRequest(p0, 'anjo-z5', { status: 'in', note: 'She said yes' }, { by: 'proxy' });
  await srv.send(prox1);
  const p1 = await srv.get(pId);
  const prox2 = M.respondRequest(p1, 'anjo-z5', { status: 'maybe' }, { by: 'proxy' });
  await srv.send(prox2);
  const p2 = await srv.get(pId);
  check(p1.responses['anjo-z5'].note === '📞 She said yes' && p2.responses['anjo-z5'].note === '📞 She said yes' && (p2.responses['anjo-z5'].note.match(/📞/gu) || []).length === 1,
    'an organizer answer is marked 📞 once; a second proxy write keeps one mark (idempotent)');
  await srv.send(M.respondRequest(p2, 'anjo-z5', { status: 'in' }, { by: 'self' }));
  check((await srv.get(pId)).responses['anjo-z5'].note === 'She said yes', 'when the person answers herself the 📞 is stripped');
  check(mem(model(DW), 'momdad-k3').called && M.parseRespNote('📞').called && M.buildRespNote(true, '', '', '') === '📞', 'a bare 📞 (the Worker trims "📞 ") still reads as the organizer’s answer');
  const legacyNote = lgOrg.responses.LGA.note;
  const lgKeep = M.respondRequest(lgOrg, 'LGA', { status: 'in' });
  const lgSelf = M.respondRequest(lgOrg, 'LGA', { status: 'in' }, { by: 'self' });
  check(/\(entered by Ashwin\)$/.test(legacyNote) && lgKeep.body.note === '📞 Arriving late, PTO approved' && lgSelf.body.note === 'Arriving late, PTO approved' && mem(lg, 'LGA').called,
    "a legacy '(entered by Ashwin)' reads as 📞 and becomes the 📞 prefix on the next write");
  // airport picks only when changed
  const same = M.respondRequest(lgOrg, 'LAX', { status: 'maybe', arrive_at: 'PIA' });
  const changed = M.respondRequest(lgOrg, 'LAX', { leave_from: 'PIA' });
  check(!('arrive_at' in same.body) && !('leave_from' in same.body) && changed.body.leave_from === 'PIA' && !('arrive_at' in changed.body),
    'arrive_at / leave_from are sent only when they change');
  check(M.respondRequest(lgOrg, 'LAX', { arrive_at: 'MDW' }) === null && M.respondRequest(lgOrg, 'LAX', { available_from: '2026-11-30', available_to: '2026-11-20' }) === null && M.respondRequest(lgOrg, 'NOPE', {}) === null,
    'a pick outside the hub pair, an impossible range or an unknown member builds nothing (instead of a 400)');
  const kId = srv.seed(tg);
  await srv.send(M.respondRequest(await srv.get(kId), 'LGA', { status: 'maybe' }));
  const kept = (await srv.get(kId)).responses.LGA;
  check(kept.arrive_at === 'PIA' && kept.leave_from === 'ORD' && kept.status === 'maybe', 'an answer without picks keeps the stored PIA / ORD picks (the Worker keeps absent ones)');
  // airport sync after member-airport edits
  const sId = srv.seed(DW);
  await srv.send(M.respondRequest(await srv.get(sId), 'anjo-z5', { status: 'in', note: 'Can do Thu night' }));
  await srv.send(M.respondRequest(await srv.get(sId), 'ashwin-p8', { origin: 'BUR' }));
  const sFresh = await srv.get(sId, KEY);
  const edit = M.organizerEdit(sFresh, KEY, { members: [{ code: 'momdad-k3' }, { code: 'ashwin-p8', airport: 'SFO' }, { code: 'anjo-z5', airport: 'JFK' }] });
  const editUp = edit.filter((q) => /\/idea\/update/.test(q.path));
  const editSync = edit.filter((q) => /\/idea\/respond/.test(q.path));
  check(editUp.length === 1 && editSync.length === 2 && edit[0] === editUp[0], 'a member-airport edit is one update followed by one sync answer per moved, answered member');
  await srv.send(editUp);
  const noSync = model(await srv.get(sId, KEY));
  check(mem(noSync, 'anjo-z5').override === 'LGA', 'contract: without the sync, the old LGA origin would read as an override');
  const sRes = await srv.send(editSync);
  const sDoc = await srv.get(sId, KEY), sM = model(sDoc);
  check(srv.allOk(sRes) && sDoc.responses['anjo-z5'].origin === 'JFK' && mem(sM, 'anjo-z5').override === '' && eq(mem(sM, 'anjo-z5').O, ['LGA', 'JFK', 'EWR']) && sDoc.responses['anjo-z5'].note === 'Can do Thu night',
    'with it, Anjo’s origin follows her new JFK home (NY set), and her note is resent unchanged with no 📞');
  check(sDoc.responses['ashwin-p8'].origin === 'BUR' && mem(sM, 'ashwin-p8').override === 'BUR' && sDoc.responses['momdad-k3'].note === '📞',
    'an override (BUR) survives the sync; members whose airport did not move are not rewritten');
  const dSync = M.airportSyncRequests(cFresh, toClt.body.idea);
  const lgaSync = dSync.find((q) => q.body.member === 'LGA'), laxSync = dSync.find((q) => q.body.member === 'LAX');
  check(dSync.length === 2 && laxSync.body.arrive_at === '' && laxSync.body.leave_from === '' && laxSync.body.note === '' && laxSync.body.origin === '' &&
    lgaSync.body.available_from === '2026-11-24' && M.parseRespNote(lgaSync.body.note).text === 'Arriving late, PTO approved',
    'a destination edit produces one sync answer per answered member: picks outside the new hub cleared, dates kept, notes read the same, no 📞 added');
  // edits start from a fresh record and keep codes and notes
  const eId = srv.seed(DW);
  const stale = await srv.get(eId, KEY);
  await srv.send(M.updateRequest(stale, KEY, { members: stale.idea.members.concat([{ name: 'Priya', face: '🦊', airport: 'DEN', headcount: 1 }]) }));
  const fresh = await srv.get(eId, KEY);
  const titleEdit = M.updateRequest(fresh, KEY, { title: '🪔 Diwali at Priya’s' });
  check(titleEdit.path === '/idea/update?id=' + eId && titleEdit.body.edit_key === KEY && titleEdit.body.idea.recommendation === null &&
    eq(titleEdit.body.idea.members.map((x) => x.code), fresh.idea.members.map((x) => x.code)) && titleEdit.body.idea.notes === fresh.idea.notes && eq(titleEdit.body.idea.dates, fresh.idea.dates),
    'an edit carries the id in the query and the edit key in the body, and keeps every member code, the notes and the dates');
  const fromStale = M.updateRequest(stale, KEY, { title: 'x' });
  check(fresh.idea.members.length === 4 && titleEdit.body.idea.members.length === 4 && fromStale.body.idea.members.length === 3,
    'built from the fresh GET the edit keeps a member another device just added (a stale copy would drop her)');
  const eRes = await srv.send(titleEdit);
  const eDoc = await srv.get(eId, KEY);
  check(srv.allOk(eRes) && eDoc.idea.title === '🪔 Diwali at Priya’s' && M.parseNotes(eDoc.idea.notes).pin === '2026-11-08' && Object.keys(eDoc.responses).length === 2,
    'the Worker accepts it; 📌, caption and every answer survive');
  const capEdit = M.updateRequest(eDoc, KEY, { caption: 'Puja at 6' });
  check(capEdit.body.idea.notes === '📌2026-11-08 Puja at 6' && M.updateRequest(eDoc, 'short', { title: 'x' }) === null, 'a caption edit keeps the 📌 prefix; a malformed edit key builds nothing');
  check(M.updateRequest(lgOrg, KEY, { title: 'x' }) === null && M.organizerEdit(lgOrg, KEY, { dates: { departure: '2026-11-20', return: '2026-11-29' } }) === null,
    'a legacy doc refuses every idea edit until P-migrate (nulling recommendation would lose its plan; PIA-155: only its removal and the ↩ that undoes it go, a decision alone)');
  // member codes
  const same8 = M.createRequest({ title: '🎉 Eight Sams', members: Array.from({ length: 8 }, () => ({ name: 'Sam', airport: 'SEA' })) }, { today: TODAY, rand: () => 0 });
  const codes8 = same8.body.idea.members.map((x) => x.code);
  check(new Set(codes8).size === 8 && codes8.every((c) => /^sam-[a-z0-9]{2}$/.test(c)), 'member codes are unique for 8 identical names, even with a rand that always repeats', codes8);
  const c8 = await srv.call('POST', '/idea', same8.body);
  check(c8.status === 201 && eq(c8.json.doc.idea.members.map((x) => x.code), codes8), 'the Worker accepts all 8 (its duplicate-code check passes) and stores the codes as sent');
  const longCode = M.memberCode('Bartholomew Montgomery-Fitzgerald the Third', []), blank = M.memberCode('☃☃', []);
  check(longCode.length === 32 && M.MEMBER_CODE_RE.test(longCode) && /^m-[a-z0-9]{2}$/.test(blank), "slugs cap at 29 chars (codes ≤ 32, the Worker's CODE_RE) and fall back to 'm'");
  const add9 = M.updateRequest(fresh, KEY, { members: fresh.idea.members.concat([{ name: 'Priya', airport: 'DEN' }]) });
  check(add9.body.idea.members.filter((x) => /^priya-/.test(x.code)).length === 2 && new Set(add9.body.idea.members.map((x) => x.code)).size === 5, 'a second Priya gets her own code; existing codes never change');
  // booked
  const bId = srv.seed(DW);
  const bReqs = M.bookedRequests(await srv.get(bId), 'anjo-z5', true, { by: 'self' });
  const bRes = await srv.send(bReqs);
  const bDoc = await srv.get(bId);
  check(bReqs.length === 2 && /respond/.test(bReqs[0].path) && /booked/.test(bReqs[1].path) && srv.allOk(bRes) && bDoc.responses['anjo-z5'].booked === true && bDoc.responses['anjo-z5'].status === 'in',
    'booking someone with no answer sends a complete "in" first (the Worker’s answer_first rule), then 🎫');
  // plan moves: set ends and booked travelers keep their dates
  const mvId = srv.seed(DW);
  await srv.send(M.respondRequest(await srv.get(mvId), 'anjo-z5', { status: 'in', available_from: '2026-11-05', available_to: '2026-11-09' }));
  await srv.send(M.bookedRequests(await srv.get(mvId), 'momdad-k3', true));
  const mvFresh = await srv.get(mvId, KEY);
  const mv = M.organizerEdit(mvFresh, KEY, { dates: { departure: '2026-11-07', return: '2026-11-10' }, pin: '2026-11-08' });
  check(mv.length === 2 && mv[0].body.member === 'momdad-k3' && mv[0].body.available_from === '2026-11-06' && mv[0].body.available_to === '2026-11-09' && /update/.test(mv[1].path) && !('responses' in mv[1].body),
    'a plan move first writes the booked Mom & Dad’s plan-following ends as their own (11/06–11/09), then updates idea.dates only');
  const mvRes = await srv.send(mv);
  const mvM = model(await srv.get(mvId, KEY), { me: 'ashwin-p8' });
  check(srv.allOk(mvRes) && mem(mvM, 'momdad-k3').d1 === '2026-11-06' && mem(mvM, 'momdad-k3').d2 === '2026-11-09' && mem(mvM, 'momdad-k3').booked,
    'after the move the booked travelers keep the days they booked');
  check(mem(mvM, 'anjo-z5').own1 === '2026-11-05' && mem(mvM, 'anjo-z5').own2 === '2026-11-09', 'a set end is never rewritten by the move (Anjo keeps 11/05–11/09)');
  check(mem(mvM, 'ashwin-p8').d1 === '2026-11-07' && mem(mvM, 'ashwin-p8').link.href === G.dwAshP1, 'a plan follower moves with it, and his link is the golden +1 link (11/07–11/10)');
  const bothId = srv.seed(DW);
  await srv.send(M.bookedRequests(await srv.get(bothId), 'momdad-k3', true));
  const both = M.organizerEdit(await srv.get(bothId, KEY), KEY, { dates: { departure: '2026-11-07', return: '2026-11-10' }, pin: '2026-11-08', destination: { airport: 'CLT' } });
  const bothRes = await srv.send(both);
  const bothMd = (await srv.get(bothId, KEY)).responses['momdad-k3'];
  check(srv.allOk(bothRes) && both.length === 4 && bothMd.available_from === '2026-11-06' && bothMd.available_to === '2026-11-09' && bothMd.booked,
    'a move plus a destination change in one edit: the sync answers start from the pinned dates, so the booked days survive');
  // a decision that closes the trip goes last, after the answers an open trip still takes
  const dpId = srv.seed(tg);
  const dp = M.organizerEdit(await srv.get(dpId, KEY), KEY, { destination: { airport: 'CLT' }, decision: { stage: 'dropped' } });
  const dpRes = await srv.send(dp);
  const dpDoc = await srv.get(dpId, KEY);
  check(srv.allOk(dpRes) && dp.length === 4 && /update/.test(dp[0].path) && !dp[0].body.decision && dp.slice(1, 3).every((q) => /respond/.test(q.path)) && eq(dp[3].body.decision, { stage: 'dropped' }) &&
    dpDoc.decision.stage === 'dropped' && dpDoc.responses.LAX.arrive_at === '' && dpDoc.responses.LGA.leave_from === '',
    'a destination change plus 🗑 in one edit: the update, both sync answers, then the drop last (no 409, no stale picks left behind)');
  // a paid trip takes no answers: an edit that needs one builds nothing, other edits go through
  const pdId = srv.seed(DW);
  await srv.send(M.bookedRequests(await srv.get(pdId), 'momdad-k3', true));
  await srv.send(M.updateRequest(await srv.get(pdId, KEY), KEY, { decision: { stage: 'chosen' } }));
  await srv.send(M.updateRequest(await srv.get(pdId, KEY), KEY, { decision: { stage: 'booked', actual_total: 1490 } }));
  const pdFresh = await srv.get(pdId, KEY);
  const toSfo = [{ code: 'momdad-k3' }, { code: 'ashwin-p8', airport: 'SFO' }, { code: 'anjo-z5' }];
  const pdMove = M.organizerEdit(pdFresh, KEY, { dates: { departure: '2026-11-13', return: '2026-11-16' } });
  const pdAir = M.organizerEdit(pdFresh, KEY, { members: toSfo });
  const pdReMove = M.organizerEdit(pdFresh, KEY, { dates: { departure: '2026-11-13', return: '2026-11-16' }, decision: { stage: 'proposed' } });
  const pdTitle = M.organizerEdit(pdFresh, KEY, { title: '🪔 Diwali 2026' });
  const pdTitleRes = await srv.send(pdTitle);
  check(pdFresh.decision.stage === 'booked' && pdMove === null && pdAir === null && pdReMove === null && srv.allOk(pdTitleRes) && pdTitle.length === 1,
    'paid trip: moving the plan Mom & Dad booked, or changing an answered member’s airport, builds nothing (reopen first); a title edit goes through');
  const pdReopen = M.organizerEdit(await srv.get(pdId, KEY), KEY, { members: toSfo, decision: { stage: 'proposed' } });
  const pdReRes = await srv.send(pdReopen);
  const pdRe = await srv.get(pdId, KEY);
  check(srv.allOk(pdReRes) && pdReopen.length === 2 && pdRe.decision.stage === 'proposed' && pdRe.responses['ashwin-p8'].origin === 'SFO' && pdRe.responses['momdad-k3'].booked,
    'reopening in the same edit lets the sync answer through, since it goes after the update that reopens the trip');
  check(M.bookedRequests(DW, 'anjo-z5', false) === null && M.bookedRequests(DW, 'ashwin-p8', false).length === 1,
    'un-booking someone with no in/maybe answer builds nothing (the Worker would answer 400 answer_first)');
  check(M.respondRequest(DW, 'anjo-z5', { origin: 'EWR' }) === null && M.respondRequest(DW, 'anjo-z5', { status: 'maybe', origin: 'EWR' }).body.status === 'maybe',
    'a waiting member is never answered "in" by default: a patch with no status builds nothing until someone picks one');
  const typed = ['(entered by Mom)', 'Late (entered by Ashwin)', '📞 typed phone', '📞 📞 x (entered by A) (entered by B)'].map((t) => M.respondRequest(DW, 'ashwin-p8', { note: t }, { by: 'self' }).body.note);
  const tnId = srv.seed(DW);
  await srv.send(M.respondRequest(await srv.get(tnId), 'ashwin-p8', { note: 'Late (entered by Ashwin)' }, { by: 'self' }));
  const tnBack = model(await srv.get(tnId));
  check(eq(typed, ['', 'Late', 'typed phone', 'x']) && !mem(tnBack, 'ashwin-p8').called && mem(tnBack, 'ashwin-p8').noteText === 'Late',
    "typed text can't fake the organizer's mark: a leading 📞 or a trailing '(entered by X)' is dropped from what someone types", typed);
  const room = M.noteRoom(true, '10:30', '18:00');
  const fullNote = M.respondRequest(DW, 'momdad-k3', { note: 'y'.repeat(room), arrTime: '10:30', depTime: '18:00' }, { by: 'proxy' }).body.note;
  check(room === 261 && M.noteRoom(false, '', '') === 280 && fullNote.length === 280 && M.parseRespNote(fullNote).text === 'y'.repeat(room),
    'noteRoom gives the typed-text room left after the 📞 🛬 🛫 prefixes (261 of 280), so a capped text field loses nothing');
  // create: the family preset re-resolves against the final departure
  const draft = { emoji: '🎄', name: 'Christmas', dest: { airport: 'PIA' }, dates: { departure: '', return: '' }, members: M.familyPreset('', TODAY) };
  const undatedCreate = M.createRequest(draft, { today: TODAY });
  const movedCreate = M.createRequest(Object.assign({}, draft, { dates: { departure: '2026-08-15', return: '2026-08-20' } }), { today: TODAY });
  const cr = await srv.call('POST', '/idea', movedCreate.body);
  check(undatedCreate.body.idea.members[2].airport === 'LGA' && movedCreate.body.idea.members[2].airport === 'JAX' && cr.status === 201 && cr.json.doc.idea.members[2].airport === 'JAX',
    'a preset picked while undated (LGA) re-resolves at Create when the date moves across 9/1 (2026-08-15 → JAX)');
  check(undatedCreate.body.idea.title === '🎄 Christmas' && undatedCreate.body.idea.destination.city === 'Peoria' && undatedCreate.body.idea.recommendation === null &&
    eq(undatedCreate.body.idea.members.map((x) => x.label), ['🌽 Mom & Dad', '💪 Ashwin', '🗽 Anjo']) && undatedCreate.body.idea.members[0].headcount === 2,
    'create: title and labels carry their faces, the city comes from the table, no recommendation');
  const typedOver = M.familyPreset('', TODAY).map((f) => (f.preset === 'anjo' ? Object.assign({}, f, { airport: 'EWR' }) : f.preset === 'ashwin' ? Object.assign({}, f, { airport: '' }) : f));
  const ewrCreate = M.createRequest(Object.assign({}, draft, { dates: { departure: '2026-08-15', return: '2026-08-20' }, members: typedOver }), { today: TODAY });
  check(eq(ewrCreate.body.idea.members.map((x) => x.airport), ['PIA', 'LAX', 'EWR']),
    'an airport typed over the preset (Anjo → EWR) is kept at Create; only a preset airport (JAX / LGA) or a blank one re-resolves');
  // no builder ever writes a doc that reads as legacy (no face, or the v1 word 'Me')
  const names = ['Me', ' me ', 'ME', '', '   ', 'Anjo', '🦊 Bob', 'Mé', 'Mom & Dad', 'x'.repeat(60)];
  const faceIn = [undefined, '🦊', 'X', '🦊🐻', ''];
  let built = 0; const legacyOut = [];
  names.forEach((n) => faceIn.forEach((f) => {
    [M.createRequest({ emoji: '🎉', name: 't', dest: { airport: 'RDU' }, members: [{ name: n, face: f, airport: 'LAX' }] }, { today: TODAY }),
      M.updateRequest(fresh, KEY, { members: fresh.idea.members.concat([{ name: n, face: f, airport: 'DEN' }]) }),
      M.updateRequest(fresh, KEY, { members: fresh.idea.members.map((m, i) => (i ? { code: m.code } : { code: m.code, label: (f || '') + n })) }),
      M.organizerEdit(fresh, KEY, { members: fresh.idea.members.map((m, i) => (i ? { code: m.code } : { code: m.code, name: n, face: f })) })
    ].forEach((q) => {
      const up = [].concat(q || []).find((x) => /\/idea(\/update)?\?|^\/idea$/.test(x.path) && x.body.idea);
      if (!up) return;
      built++;
      if (M.docLegacy({ idea: up.body.idea })) legacyOut.push([n, f, up.body.idea.members.map((x) => x.label)]);
    });
  }));
  check(built > 100 && legacyOut.length === 0, 'create, update and organizer edits never write a label without a face or with the name Me (' + built + ' fuzzed writes)', legacyOut.slice(0, 3));
  const anjoOnly = M.updateRequest(fresh, KEY, { members: fresh.idea.members.map((m) => (m.code === 'anjo-z5' ? { code: m.code, label: 'Anjo' } : { code: m.code })) });
  const anjoLabel = anjoOnly.body.idea.members.find((x) => x.code === 'anjo-z5').label;
  check(M.createRequest({ emoji: '🎉', name: 't', dest: { airport: 'RDU' }, members: [{ name: 'Me', face: '🌴', airport: 'LAX' }] }, { today: TODAY }) === null &&
    M.createRequest({ emoji: '🎉', name: 't', dest: { airport: 'RDU' }, members: [{ name: ' ', airport: 'LAX' }] }, { today: TODAY }) === null &&
    M.updateRequest(fresh, KEY, { members: [{ code: 'ashwin-p8', label: '🌴 me' }] }) === null &&
    !!M.splitLabel(anjoLabel).face && M.splitLabel(anjoLabel).name === 'Anjo' && fresh.idea.members.filter((m) => m.code !== 'anjo-z5').every((m) => anjoOnly.body.idea.members.find((x) => x.code === m.code).label === m.label),
    "a member named 'Me' or with a blank name builds nothing (the screen asks for a real name); a label with no face gets one; kept labels are resent verbatim");
  const cyCreate = M.createRequest({ emoji: '🎉', name: 'Cary', dest: { airport: 'RDU' }, dates: { searchStart: '2026-12-18', searchEnd: '2027-01-04' }, nights: 4, pin: '', caption: 'New date TBD', members: [{ name: 'Ashwin', face: '🌴', airport: 'LAX' }] }, { today: TODAY });
  check(cyCreate.body.idea.notes === '🌙4 New date TBD' && cyCreate.body.idea.dates.searchStart === '2026-12-18', 'an undated idea stores its window and the 🌙N prefix');
  // P-migrate
  check(srv.allOk(migRes) && migReqs.length === 2 && /update/.test(migReqs[0].path) && migReqs[1].body.member === 'LAX' && migReqs[1].body.available_from === '',
    'P-migrate: one update, then one answer for the member whose window now equals the plan (sent blank = follows)');
  check(tg.idea.recommendation === null && tg.idea.destination.airport === 'PIA' && tg.idea.destination.city === 'Peoria' && eq(tg.idea.dates, { departure: '2026-11-20', return: '2026-11-29', searchStart: '', searchEnd: '' }),
    'the recommendation’s airport, city and the picked plan (the answers’ span 11/20–11/29) are copied into the idea before it is nulled');
  check(eq(tg.idea.members.map((x) => x.code), ['PIA', 'LAX', 'LGA']) && eq(tg.idea.members.map((x) => x.label), ['🌽 Mom & Dad', '💪 Ashwin', '🗽 Anjo']) && mig.pin === '2026-11-26' && M.parseNotes(tg.idea.notes).pin === '2026-11-26' && /Peoria parade/.test(tg.idea.notes),
    'codes never change, labels get faces (Me → 💪 Ashwin), 📌 11/26 comes from v1 storage and the v1 notes are kept');
  check(tg.decision.stage === 'chosen' && tg.decision.chosen.departure === '2026-11-20' && tg.decision.chosen.familyTotal === null && tg.decision.estimate_total === null && tg.responses.LGA.available_from === '2026-11-24',
    're-chosen on the new plan with no stored price; Anjo’s own window is untouched');

  // ═══ AC7 ════════════════════════════════════════════════════════════════
  section('AC7 one pricing function: real cached fares only; fresh / stale / missing / none; open-jaw = two one-ways; adults = headcount; hosts free');
  const at = (hoursAgo) => NOW - hoursAgo * HOUR;
  const tgOrg = (fares, over) => model(tg, Object.assign({ me: 'LAX', hasEditKey: true, hasToken: true, fares }, over || {}));
  const keysOf = mem(tgOrg({}), 'LAX').keys;
  check(keysOf.length === 2 && keysOf[0].kind === 'in' && keysOf[1].kind === 'out' && keysOf[0].key === '2|LAX|PIA|2026-11-20||1' && keysOf[1].key === '2|ORD|LAX|2026-11-29||1',
    'open-jaw is priced as two one-ways: LAX→PIA 11/20 and ORD→LAX 11/29');
  check(mem(tgOrg({}, { multiAirport: true }), 'LAX').keys[0].key === '2|BUR,LAX,LGB,ONT,SNA|PIA|2026-11-20||1', 'with the Worker’s multi-airport search the leg is priced from the whole LA set (PIA-140: the key names the set sorted, the Worker\'s cache order)');
  const dwP = model(DW, { hasEditKey: true, hasToken: true });
  const mdLink = M.gfDecode(mem(dwP, 'momdad-k3').link.href);
  check(mem(dwP, 'momdad-k3').keys[0].key === '1|PIA|RDU|2026-11-06|2026-11-09|2' && mdLink.adults === 2 && mem(dwP, 'momdad-k3').link.href === G.dwMD && mem(dwP, 'ashwin-p8').keys[0].kind === 'rt',
    'adults = headcount: Mom & Dad search and link for 2 (golden PIA+ORD⇄RDU link); a round trip is one round-trip search');
  const k = { ain: '2|LAX|PIA|2026-11-20||1', aout: '2|ORD|LAX|2026-11-29||1', jin: '2|LGA|PIA|2026-11-24||1', jout: '2|ORD|LGA|2026-11-29||1' };
  const fares = {}; fares[k.ain] = { p: 305, f: at(3) }; fares[k.aout] = { p: 200, f: at(3) }; fares[k.jin] = { p: 290, f: at(30) };
  const pr = tgOrg(fares).price;
  check(pr.per.LAX.legs.map((l) => l.st).join() === 'fresh,fresh' && pr.per.LGA.legs.map((l) => l.st).join() === 'stale,missing' && pr.per.LAX.complete && !pr.per.LGA.complete,
    'leg states: fresh (3h), stale (30h), missing (never searched)');
  check(pr.total === 795 && !pr.complete && pr.need === 2 && pr.stale && pr.per.LGA.sum === 290 && pr.per.LGA.hollow,
    'the total is exactly the real cached prices (305+200+290 = 795), marked incomplete, with 2 legs to search; nothing is estimated');
  const none = Object.assign({}, fares); none[k.jin] = { p: 290, f: at(2) }; none[k.jout] = { p: null, none: true, f: at(1) };
  const prNone = tgOrg(none).price;
  check(prNone.per.LGA.legs[1].st === 'none' && prNone.need === 0 && !prNone.complete && prNone.total === 795, "'no fares' (searched, nothing found) is its own state: not re-offered within 24h, never complete");
  const all = Object.assign({}, none); all[k.jout] = { p: 160, f: at(1) };
  const prAll = tgOrg(all).price;
  check(prAll.complete && prAll.total === 955 && prAll.need === 0 && !prAll.stale && prAll.hosts.indexOf('PIA') >= 0 && prAll.segs.length === 2, 'all legs fresh → complete $955; hosts cost nothing and have no row');
  const oneStale = Object.assign({}, all); oneStale[k.aout] = { p: 200, f: at(30) };
  const prS = tgOrg(oneStale).price;
  check(prS.total === 955 && !prS.complete && !prS.per.LAX.complete && prS.need === 1 && prS.stale, 'every leg priced but one stale → the same $955, still marked incomplete, 1 leg to refresh');
  const border = {}; border[k.ain] = { p: 1, f: at(23.9) }; border[k.aout] = { p: 1, f: new Date(at(24.1)).toISOString() };
  const prB = tgOrg(border).price;
  check(prB.per.LAX.legs[0].st === 'fresh' && prB.per.LAX.legs[1].st === 'stale', '23.9h old is fresh, 24.1h old is stale (an ISO fetched-at works too)');
  check(model(tg, { hasEditKey: true, fares: all }).price === null && model(tg, { hasToken: true, fares: all }).price === null, 'prices exist only on a phone with the edit key AND the token');
  const cand = M.cheapCandidates(tgOrg(all), all, NOW, TODAY).find((c) => c.current);
  check(!!cand && cand.filled && cand.total === prAll.total, 'the cheapest-week bar for the current plan shows the same total as priceTrip (one pricing function)');
  // one pricing rule: on the current plan the cheapest-week bar IS priceTrip, whatever state the legs are in
  const ORG = { hasEditKey: true, hasToken: true };
  const pricedDocs = {
    tg, diwali: DW, tahoe: TH, m8: M8, laxLocal: LX, hostsOnly: lxHosts,
    localOrigin: tweak(LX, (d) => { d.responses['priya-x1'].origin = 'BUR'; }),                 // Priya flies from inside LA: nothing to price
    noDest: tweak(DW, (d) => { d.idea.destination = { city: '', airport: '' }; }),
    pastEnd: tweak(DW, (d) => { d.responses['ashwin-p8'].available_from = '2026-10-10'; }),       // an own end already in the past
    oneEnd: tweak(DW, (d) => { d.responses['ashwin-p8'].available_to = '2026-11-12'; }),
  };
  const legStates = [null, { p: 100, f: at(1) }, { p: 130, f: at(30) }, { p: null, none: true, f: at(1) }, { p: 70, f: at(2) }];
  const parity = [];
  let parityRuns = 0;
  Object.keys(pricedDocs).forEach((name) => {
    const doc = pricedDocs[name];
    const allKeys = [...new Set(model(doc, ORG).travelers.flatMap((t) => t.keys.map((x) => x.key)))];
    for (let seed = 0; seed < legStates.length * 2; seed++) {
      const fr = {};
      allKeys.forEach((key, i) => { const st = legStates[(i * (seed + 1) + seed) % legStates.length]; if (st) fr[key] = st; });
      const pm = model(doc, Object.assign({ fares: fr }, ORG)), pt = pm.price;
      const cur = M.cheapCandidates(pm, fr, NOW, TODAY).find((c) => c.current);
      parityRuns++;
      if (!cur) { parity.push(name + ': no current-plan candidate'); continue; }
      const same = cur.filled === pt.complete && cur.total === (pt.complete ? pt.total : null) && eq(cur.missing, pt.search) && cur.none === pt.none &&
        eq(cur.price.per, pt.per) && eq(cur.price.blocked, pt.blocked) && cur.price.total === pt.total;
      if (!same) parity.push(name + ' #' + seed + ' bar ' + JSON.stringify([cur.filled, cur.total, cur.missing.length]) + ' vs priceTrip ' + JSON.stringify([pt.complete, pt.total, pt.need]));
    }
  });
  check(parity.length === 0 && parityRuns === 100, 'on the current plan the cheapest-week bar and priceTrip agree on complete, total, legs to search, no-fares and every row (' + parityRuns + ' fare mixes over 10 trips, incl. stale legs)', parity.slice(0, 4));
  const fillAll = (doc) => { const fr = {}; M.cheapCandidates(model(doc, ORG), {}, NOW, TODAY).forEach((c) => c.missing.forEach((x) => { fr[x] = { p: 100, f: at(1) }; })); return fr; };
  const barsFor = (doc) => { const fr = fillAll(doc), pm = model(doc, Object.assign({ fares: fr }, ORG)); return { pm, cs: M.cheapCandidates(pm, fr, NOW, TODAY) }; };
  const blockedTrips = ['hostsOnly', 'localOrigin', 'noDest'].map((name) => {
    const { pm, cs } = barsFor(pricedDocs[name]);
    return cs.length > 0 && cs.every((c) => !c.filled && c.total === null && !c.star) && !pm.price.complete;
  });
  const lxBars = barsFor(LX).cs;
  check(blockedTrips.every(Boolean) && lxBars.length > 1 && lxBars.every((c) => c.filled && c.total > 0),
    'a trip with only hosts, with a traveler who has nothing to fly (origin inside LA) or with no destination never gets a filled bar or a ★, even with every leg cached; the same LAX trip without the local origin fills every bar');
  const lo = model(pricedDocs.localOrigin, Object.assign({ fares: fillAll(pricedDocs.localOrigin) }, ORG)).price;
  check(!lo.complete && lo.need === 0 && eq(lo.blocked, [{ code: 'priya-x1', why: 'local' }]) && lo.total > 0,
    "a total that nothing more can complete says why: priya-x1 is blocked ('local'), with 0 legs left to search");
  const prM8 = model(M8, { hasEditKey: true, hasToken: true }).price;
  check(prM8.total === null && !prM8.complete && prM8.need > 0, 'with no cached fares a trip has no total at all (no fallback, no mock)');

  // ═══ AC8 ════════════════════════════════════════════════════════════════
  section('AC8 daily presence never exceeds the heads ring; the best window uses explicit windows only');
  const longStay = tweak(tg, (d) => { d.responses.LAX = R('in', 'LAX', '2026-12-01', '2026-12-10'); d.responses.LGA = R('in', 'LGA', '2026-12-02', '2026-12-10'); });
  const fixtures = { tg, legacy: lgOrg, diwali: DW, tahoe: TH, m8: M8, undated: CY, laxLocal: LX, moved: tweak(withOwn, () => {}), longStay, hostsOnly: lxHosts };
  let over = [], under = [], drawn = 0;
  Object.keys(fixtures).forEach((name) => {
    const m = model(fixtures[name]);
    const a = [m.span, m.range].filter(Boolean); if (!a.length) return;
    const s0 = a.map((x) => x.s).sort()[0], e0 = a.map((x) => x.e).sort().pop();
    eachDay(M.addD(s0, -3), M.addD(e0, 3), (day) => {
      const p = M.presentOn(m, day), dots = M.dotsOn(m, day).filter((x) => x.kind === 'fill').length;
      if (p > m.headsIn || dots !== p) over.push(name + ' ' + day + ' ' + p + '/' + m.headsIn);
      // a host covers every day a screen draws for the trip; anyone else covers their own travel dates
      const allCover = m.members.every((x) => (x.host ? M.hostDay(m, day) : x.status !== 'in' || (x.d1 && !x.bad && day >= x.d1 && day <= x.d2)));
      if (M.hostDay(m, day)) drawn++;
      if (allCover && p !== m.headsIn) under.push(name + ' ' + day + ' ' + p + '/' + m.headsIn);
    });
  });
  check(over.length === 0, 'on every day of every fixture, present ≤ heads in, and filled dots = the numeral', over.slice(0, 5));
  check(under.length === 0 && drawn >= 150, 'on every drawn day (plan, flex window and board range, not just plan days; ' + drawn + ' over 10 trips) that every in-member covers, present = heads in', under.slice(0, 5));
  const ls = model(longStay);
  check(ls.range.e === '2026-12-10' && ls.span.e < '2026-12-08' && M.presentOn(ls, '2026-12-08') === 4 && ls.headsIn === 4,
    'a host is there on board days past the flex window too: 12/08 reads 4 (Ashwin and Anjo stayed on, plus Mom & Dad)');
  const mdMaybe = model(tweak(tg, (d) => { d.responses.PIA = R('maybe', 'PIA'); }));
  check(M.dotsOn(mdMaybe, '2026-11-26').filter((x) => x.code === 'PIA' && x.kind === 'maybe').length === 2 && M.presentOn(mdMaybe, '2026-11-26') === 2 && mdMaybe.headsIn === 2,
    'a host who answers maybe keeps two amber maybe dots (×2) on the board, and is not counted present');
  const d21 = M.dotsOn(tgM, '2026-11-21');
  check(M.presentOn(tgM, '2026-11-21') === 3 && d21.filter((x) => x.kind === 'hollow').length === 1 && tgM.headsIn === 4 && M.presentOn(tgM, '2026-11-26') === 4,
    "Thanksgiving 11/21 reads 3 with one hollow dot (Anjo lands 11/24) while the ring reads 4/4; 11/26 reads 4");
  check(model(DW).best === null && model(TH).best === null && tgM.best === null, 'nobody with an explicit window that fits → no best window (followers never count)');
  const elsewhere = tweak(DW, (d) => { d.idea.notes = ''; d.responses['ashwin-p8'] = R('in', 'LAX', '2026-11-12', '2026-11-15'); d.responses['anjo-z5'] = R('maybe', 'LGA', '2026-11-12', '2026-11-16'); });
  const bw = model(elsewhere).best;
  check(!!bw && bw.s === '2026-11-12' && bw.e === '2026-11-15' && bw.full === 2, 'explicit windows elsewhere suggest their own 3-night window (11/12–11/15, both fully there)', bw);
  check(model(tweak(TH, (d) => { d.responses['priya-d4'].available_from = '2026-11-27'; d.responses['priya-d4'].available_to = '2026-11-30'; })).best === null,
    'a best window that equals the plan is not shown (it cannot echo the plan)');
  // a case where counting the plan-followers WOULD change the answer
  const fol = tweak(DW, (d) => { d.idea.notes = ''; d.responses['ashwin-p8'] = R('in', 'LAX', '2026-11-12', '2026-11-16'); d.responses['anjo-z5'] = R('maybe', 'LGA', '2026-11-05', '2026-11-16'); });
  const folBest = model(fol).best;
  const folOwn = model(tweak(fol, (d) => { d.responses['momdad-k3'].available_from = '2026-11-06'; d.responses['momdad-k3'].available_to = '2026-11-09'; })).best;
  check(!!folBest && folBest.s === '2026-11-12' && folBest.e === '2026-11-15' && folBest.full === 2 && folOwn === null,
    'Mom & Dad (×2) only follow the plan, so the best window is 11/12–11/15 (Ashwin + Anjo); were their plan days counted, 11/06–11/09 would win and echo the plan', [folBest, folOwn]);
  const cy = model(CY);
  check(cy.undated && cy.nights === 4 && !!cy.best && cy.best.s === '2026-12-21' && cy.best.e === '2026-12-25' && cy.best.full === 2,
    'an undated idea uses its stated 🌙4: best 12/21–12/25 inside the 12/18–1/04 window');
  check(eq(cy.win, { s: '2026-12-18', e: '2027-01-04' }) && model(DW).win.s === '2026-10-30' && model(DW).win.e === '2026-11-16', 'the flex window is the explicit ⟦⟧ window, else the plan ± 7 days');
  const tgCands = M.cheapCandidates(tgM, {}, NOW, TODAY);
  check(tgCands.length === 10 && tgCands[0].s === '2026-11-17' && tgCands[9].s === '2026-11-26' && tgCands.every((c) => c.s <= '2026-11-26' && c.e >= '2026-11-26'),
    'with 📌 11/26 from v1 storage, Thanksgiving gets exactly 10 candidate weeks (11/17–11/26 starts), none after the dinner');

  // ═══ AC9 ════════════════════════════════════════════════════════════════
  section('AC9 origin sets = the nearby groups (+ PIA→ORD) minus the destination’s airports; the family preset is date-aware');
  const LAset = ['LAX', 'BUR', 'LGB', 'SNA', 'ONT'], NY = ['LGA', 'JFK', 'EWR'];
  check(LAset.every((c) => eq(M.originSet(c, 'RDU'), LAset)) && NY.every((c) => eq(M.originSet(c, 'RDU'), NY)), 'every LA-set code searches the LA set; every NY-set code the NY set');
  check(eq(M.originSet('PIA', 'RDU'), ['PIA', 'ORD']) && eq(M.originSet('ORD', 'RDU'), ['ORD']) && eq(M.originSet('DEN', 'RNO'), ['DEN']) && eq(M.originSet('QQQ', 'RDU'), ['QQQ']),
    'PIA adds the ORD drive pivot; anything else searches itself');
  check(eq(M.originSet('PIA', 'ORD'), []) && eq(M.originSet('EWR', 'JFK'), []) && eq(M.originSet('LGA', 'PIA'), NY) && eq(M.originSet('LAX', 'BUR'), []) && eq(M.originSet('PIA', 'LGA'), ['PIA', 'ORD']),
    "the destination's own airports (hub pair + metro group) are removed");
  const hubSrc = /const IDEA_HUBS = (\[\[[^;]*\]\]);/.exec(workerSrc);
  check(!!hubSrc && eq(JSON.parse(hubSrc[1].replace(/'/g, '"')), M.IDEA_HUBS), 'hub pairs are exactly worker.js IDEA_HUBS');
  const { loadApi } = require(path.join(ROOT, 'scripts', 'harness.js'));
  const QUIET = { console: { log() {}, warn() {}, error() {}, info() {} } };   // v1's boot notes (no CDN in Node), which surface at the next await
  const legacy = fx('v1-cutover-contract.json');
  check(eq(legacy.nearby, M.NEARBY_GROUPS), 'nearby groups match the frozen v1 contract');
  check(Object.entries(legacy.family).every(([d, expected]) => eq(M.familyForDate(d), expected)),
    'familyForDate matches the frozen v1 contract on every date across the September move');
  const pre = (dep) => M.familyPreset(dep, TODAY).map((f) => f.airport).join();
  check(pre('') === 'PIA,LAX,LGA' && pre('2026-08-15') === 'PIA,LAX,JAX' && pre('2026-08-31') === 'PIA,LAX,JAX' && pre('2026-09-01') === 'PIA,LAX,LGA',
    'familyPreset: undated on 2026-10-17 → LGA; departure 2026-08-15 → JAX; 8/31 JAX, 9/1 LGA');
  check(M.familyPreset('', '2026-08-15')[2].airport === 'JAX' && M.familyPreset('', TODAY).reduce((n, f) => n + f.headcount, 0) === 4,
    'an undated idea resolves against today (passed in, never read from the clock); the preset is 4 heads');

  // ═══ AC10 ═══════════════════════════════════════════════════════════════
  section('AC10 the airport table lives here; any 3-letter code is accepted without coordinates');
  const codes = Object.keys(M.AIRPORTS);
  check(codes.length >= 300 && codes.every((c) => /^[A-Z]{3}$/.test(c)) && codes.every((c) => { const a = M.AIRPORTS[c]; return typeof a[0] === 'string' && a[0] && Math.abs(a[1]) <= 90 && Math.abs(a[2]) <= 180; }),
    'the inline table has ' + codes.length + ' IATA airports, each with a city and valid lat/lon');
  const hand = { PIA: ['Peoria', 40.66, -89.69], ORD: ['Chicago', 41.98, -87.90], LAX: ['Los Angeles', 33.94, -118.41], BUR: ['Burbank', 34.20, -118.36], LGB: ['Long Beach', 33.82, -118.15],
    SNA: ['Santa Ana', 33.68, -117.87], ONT: ['Ontario', 34.06, -117.60], LGA: ['New York', 40.78, -73.87], JFK: ['New York', 40.64, -73.78], EWR: ['Newark', 40.69, -74.17],
    JAX: ['Jacksonville', 30.49, -81.69], RDU: ['Raleigh', 35.88, -78.79], RNO: ['Reno', 39.50, -119.77], DEN: ['Denver', 39.86, -104.67], SFO: ['San Francisco', 37.62, -122.37],
    OAK: ['Oakland', 37.72, -122.22], SEA: ['Seattle', 47.45, -122.31], CLT: ['Charlotte', 35.21, -80.94], MEM: ['Memphis', 35.04, -89.98], LIM: ['Lima', -12.02, -77.11],
    LHR: ['London', 51.47, -0.46], CUZ: ['Cusco', -13.54, -71.94] };
  const off = Object.keys(hand).filter((c) => { const a = M.airportInfo(c), h = hand[c]; return !a.known || a.city !== h[0] || Math.abs(a.lat - h[1]) > 0.05 || Math.abs(a.lon - h[2]) > 0.05; });
  check(off.length === 0, 'hand-verified: PIA ORD LAX BUR LGB SNA ONT LGA JFK EWR JAX RDU RNO DEN SFO OAK SEA CLT MEM LIM LHR CUZ', off);
  const used = new Set();
  [LEG, DW, TH, M8, CY, LX].forEach((d) => { used.add(M.docDest(d)); d.idea.members.forEach((m) => used.add(m.airport)); Object.values(d.responses).forEach((r) => r.origin && used.add(r.origin)); });
  const unknownUsed = [...used].filter((c) => !M.airportInfo(c).known);
  check(eq(unknownUsed, ['QQQ']), 'every airport the family and friends fixtures use is in the table, except the deliberately unknown QQQ', unknownUsed);
  const q = M.airportInfo('qqq');
  check(q.code === 'QQQ' && !q.known && q.city === '' && q.lat === null && q.lon === null && M.airportInfo('PIAX').code === '' && M.normIata(' sna ') === 'SNA', 'an unknown code is accepted with no city or coordinates; non-codes are rejected');
  const qq = model(tweak(DW, (d) => { d.idea.destination = { city: '', airport: 'ZZV' }; }), { me: 'ashwin-p8' });
  check(qq.dest === 'ZZV' && qq.city === '' && qq.lat === null && !!mem(qq, 'ashwin-p8').link && eq(M.gfDecode(mem(qq, 'ashwin-p8').link.href).legs[0].to, ['ZZV']),
    'a trip to an unknown code still works: blank city, no coordinates, links to ZZV');
  check(!!mem(m8, M8.idea.members[2].code).link && eq(M.gfDecode(mem(m8, M8.idea.members[2].code).link.href).legs[0].from, ['QQQ']), 'a member from an unknown code (QQQ) still gets a link');

  // ═══ dates ══════════════════════════════════════════════════════════════
  section('Pinned dates: holidays, book-by, days already past, and pickups (every check ties to today = 2026-10-17)');
  const hol = (y) => Object.fromEntries(M.holidays(y).map((h) => [h.k, h.d]));
  check(eq(hol(2026), { 'h-ny': '2026-01-01', 'h-mem': '2026-05-25', 'h-jul': '2026-07-04', 'h-lab': '2026-09-07', 'h-tg': '2026-11-26', 'h-xm': '2026-12-25' }) &&
    hol(2027)['h-mem'] === '2027-05-31' && hol(2027)['h-lab'] === '2027-09-06' && hol(2027)['h-tg'] === '2027-11-25' &&
    [2026, 2027, 2028].every((y) => M.dowOf(hol(y)['h-mem']) === 1 && M.dowOf(hol(y)['h-lab']) === 1 && M.dowOf(hol(y)['h-tg']) === 4),
    'holidays: Memorial Day (last Monday of May), Labor Day (first Monday of September), Thanksgiving (4th Thursday of November)');
  check(eq(M.nextHolidays(TODAY, 3).map((h) => h.g + h.d), ['🦃2026-11-26', '🎄2026-12-25', '🎉2027-01-01']) && M.holidayOn('2026-11-26').g === '🦃' && M.holidayOn('2026-11-27') === null,
    'after 10/17 the next holidays are 🦃 11/26, 🎄 12/25 and 🎉 1/1');
  const dwB = model(DW), thB = model(TH);
  check(dwB.bookBy === '2026-10-16' && dwB.bookByLeft === -1 && dwB.bookByPassed && dwB.daysTo === 20 && !dwB.past && !dwB.shelf,
    'book-by is the plan start − 21 days: Diwali (11/06) had to book by 10/16, so it is passed, 20 days out');
  check(thB.bookBy === '2026-11-06' && thB.bookByLeft === 20 && !thB.bookByPassed && !model(dwAll).bookByPassed && !model(dwDrop).bookByPassed,
    'Tahoe (11/27) books by 11/06 (20 days left); book-by never nags once every traveler booked, or on a dropped trip');
  const prog = model(tweak(DW, (d) => { d.idea.dates.departure = '2026-10-10'; d.idea.dates.return = '2026-10-20'; d.idea.notes = ''; }), ORG);
  const progA = mem(prog, 'ashwin-p8');
  check(progA.why === 'past' && !progA.link && progA.keys.length === 0 && !prog.past && !prog.shelf && prog.daysTo === -7 &&
    prog.price.blocked.some((x) => x.code === 'ashwin-p8' && x.why === 'past') && !prog.price.complete,
    'a plan already under way (10/10–10/20): no link or search for days already past, the total says why, and the trip is not on the shelf yet');
  const ended = model(tweak(DW, (d) => { d.idea.dates.departure = '2026-10-01'; d.idea.dates.return = '2026-10-16'; d.idea.notes = ''; }));
  check(ended.past && ended.shelf && !ended.bookByPassed, 'a plan that ended yesterday (10/16) is past and on the shelf, and never nags about book-by');
  const nd = mem(model(pricedDocs.noDest), 'ashwin-p8');
  check(nd.why === 'nodest' && !nd.link && nd.keys.length === 0, 'no destination: no link and no search');
  // (PIA-139: a recorded time is a pickup while its traveler is booked)
  const pk = model(tweak(DW, (d) => { d.responses['ashwin-p8'].note = '🛬10:00'; d.responses['momdad-k3'].note = '📞 🛬14:00'; d.responses['anjo-z5'] = R('in', 'LGA', '', '', { note: '🛬11:30' }); ['ashwin-p8', 'momdad-k3', 'anjo-z5'].forEach((c) => { d.responses[c].booked = true; }); }));
  const pkL = M.pickups(pk, {}, NOW, false), arr = pkL.RDU.filter((c) => c.kind === 'arr'), dep = pkL.RDU.filter((c) => c.kind === 'dep');
  check(eq(Object.keys(pkL), ['RDU']) && eq(arr.map((c) => c.time), ['10:00', '11:30', '14:00']) && !!arr[0].group && arr[0].group === arr[1].group && !arr[2].group,
    '⏱ one pickup run: arrivals 10:00 and 11:30 (90 min apart) share a run; 14:00 (150 min later) does not');
  check(dep.length === 1 && dep[0].date === '2026-11-09' && dep[0].faces.length === 3 && !dep[0].time, 'departures with no recorded time on one day merge into one chip (3 faces, 11/09)');
  const tgPk = M.pickups(tgM, {}, NOW, false);
  check(eq(Object.keys(tgPk), ['PIA', 'ORD']) && tgPk.PIA.every((c) => c.kind === 'arr') && tgPk.ORD.every((c) => c.kind === 'dep') && tgPk.PIA.length === 2,
    'Thanksgiving lanes: arrivals at PIA (Ashwin 11/20, Anjo 11/24), departures from ORD; hosts have no chips');
  const ashKey = mem(model(DW, ORG), 'ashwin-p8').keys[0].key;
  const pkF = {}; pkF[ashKey] = { p: 300, f: at(30), off: [{ ar: '09:15' }] };
  const chipOf = (ln) => ln.RDU.find((c) => c.kind === 'arr' && c.codes.indexOf('ashwin-p8') >= 0);
  const pOrg = chipOf(M.pickups(model(DW, Object.assign({ fares: pkF }, ORG)), pkF, NOW, false));
  const pGuest = chipOf(M.pickups(model(DW, { fares: pkF }), pkF, NOW, false));
  check(pOrg.time === '09:15' && pOrg.pred && pGuest.time === '' && !pGuest.pred && pGuest.codes.length === 2,
    "a predicted arrival (the cached offer's 09:15, even from a stale search) shows only on the organizer's token phone, marked predicted; elsewhere the untimed arrivals merge");

  // ═══ PIA-135 ════════════════════════════════════════════════════════════
  section('PIA-135 the shared watchlist: new answers, what waits on me, the book-by cue, groups, the list link, the US map');
  {
    // answer times come from the Worker's own record: answer through the real handler, read it back
    const id = srv.seed(DW);
    const d0 = await srv.get(id, KEY);
    const seen0 = M.newestAnswerAt(d0);
    const q = M.respondRequest(d0, 'anjo-z5', { status: 'maybe' }, { by: 'self' });
    const rs = await srv.send([q]);
    const d1 = await srv.get(id, KEY);
    const t1 = M.answerTimes(d1), logAt = d1.log.filter((l) => l.event === 'rsvp:maybe' && l.by === 'anjo-z5').map((l) => l.at).pop();
    check(srv.allOk(rs) && t1['anjo-z5'] === logAt && t1['anjo-z5'] >= d1.responses['anjo-z5'].updated_at && t1['momdad-k3'] === '2026-10-11T02:10:00.000Z' && M.newestAnswerAt(d1) === logAt,
      'answerTimes: each member\'s newest rsvp log time from the Worker (the answer\'s updated_at when the log has none); newestAnswerAt is the trip\'s newest', { t1, logAt });
    const mine = M.tripModel(d1, ctx({ me: 'ashwin-p8' }));
    check(eq(M.newAnswers(mine, seen0), ['anjo-z5']) && eq(M.newAnswers(mine, M.newestAnswerAt(d1)), []) && eq(M.newAnswers(mine, '').sort(), ['anjo-z5', 'momdad-k3']),
      'newAnswers: the faces that answered since my last look (never my own); nothing once I have seen the newest; all of them before any look');
    check(eq(M.newAnswers(M.tripModel(d1, ctx()), ''), []) && eq(M.newAnswers(M.tripModel(tweak(d1, (d) => { d.decision.stage = 'dropped'; }), ctx({ me: 'ashwin-p8' })), ''), []),
      'no new-answer marks on a trip where I am nobody yet, or on a shelf trip');
    check(mem(mine, 'anjo-z5').ansAt === logAt && mem(M.tripModel(d0, ctx()), 'anjo-z5').ansAt === '', 'the model carries each face\'s answer time (ansAt; blank without an answer)');
    // v1 reads what newestAnswerAt records as "seen" (v1's own rule is the newest rsvp log time, never later)
    const v1rule = (doc) => { let last = ''; (doc.log || []).forEach((l) => { if (/^rsvp:/.test(l.event || '') && l.at > last) last = l.at; }); return last; };
    check(M.newestAnswerAt(d1) >= v1rule(d1) && M.newestAnswerAt(DW) === '2026-10-11T02:11:00.000Z' && v1rule(DW) === '',
      'seen = the newest answer, never older than v1\'s newest-rsvp-log rule (a doc whose log lost its rsvp lines still reads as seen)');
  }
  {
    const anjo = M.tripModel(DW, ctx({ me: 'anjo-z5' })), ash = M.tripModel(DW, ctx({ me: 'ashwin-p8' }));
    const host = M.tripModel(tweak(DW, (d) => { d.idea.destination.airport = 'PIA'; d.idea.destination.city = 'Peoria'; }), ctx({ me: 'momdad-k3' }));
    const hostUn = M.tripModel(tweak(DW, (d) => { d.idea.destination.airport = 'PIA'; delete d.responses['momdad-k3']; }), ctx({ me: 'momdad-k3' }));
    check(M.awaitsMe(anjo) && !M.awaitsMe(ash) && !M.awaitsMe(host) && M.awaitsMe(hostUn) && !M.awaitsMe(M.tripModel(DW, ctx())) &&
      !M.awaitsMe(M.tripModel(tweak(DW, (d) => { d.decision.stage = 'dropped'; }), ctx({ me: 'anjo-z5' }))),
      'awaitsMe: a trip still waiting on my answer (a host\'s default In counts until confirmed); not once answered, not without an identity, not when dropped');
  }
  {
    // Diwali (11/06) had to book by 10/16: 20 days to go. Tahoe (11/27) books by 11/06: no cue yet.
    const cue = (doc, over) => M.bookByCue(M.tripModel(doc, ctx(over)));
    const booked = tweak(DW, (d) => { d.responses['ashwin-p8'].booked = true; });
    check(cue(DW, { me: 'ashwin-p8' }) === 20 && cue(DW, { hasEditKey: true }) === 20 && cue(TH, { me: 'ashwin-l2', hasEditKey: true }) === null,
      'bookByCue: once book-by has passed, the days to go (Diwali ⏳20) for the organizer and for an answered traveler; none before (Tahoe)');
    check(cue(DW, { me: 'anjo-z5' }) === null && cue(booked, { me: 'ashwin-p8' }) === null && cue(DW, {}) === null &&
      cue(tweak(DW, (d) => { d.idea.destination.airport = 'LAX'; }), { me: 'ashwin-p8' }) === null && cue(tweak(DW, (d) => { d.decision.stage = 'dropped'; }), { hasEditKey: true }) === null,
      'the cue shows only when it matters: never to someone who has not answered, who already booked, has no identity, hosts, or on a shelf trip');
    // ⏳ days to go is on every upcoming dated card, for everyone; the book-by arc is (days to book-by) / (days to go)
    const tg = (doc, over) => M.togoCue(M.tripModel(doc, ctx(over)));
    const allBooked = tweak(TH, (d) => { Object.keys(d.responses).forEach((c) => { d.responses[c].status = 'in'; d.responses[c].booked = true; }); d.responses['leo-w6'] = { member: 'leo-w6', status: 'in', origin: 'SEA', available_from: '', available_to: '', note: '', arrive_at: '', leave_from: '', updated_at: '2026-10-16T10:00:00.000Z', booked: true }; });
    check(eq(tg(TH, {}), { days: 41, frac: 0.488, late: false }) && eq(tg(DW, { me: 'anjo-z5' }), { days: 20, frac: 0, late: false }) && eq(tg(DW, { me: 'ashwin-p8' }), { days: 20, frac: 0, late: true }),
      'togoCue: Tahoe ⏳41 with the arc 20/41 full, for anyone; Diwali ⏳20 with an empty arc, red only where the cue matters (Ashwin answered, Anjo has not)');
    check(tg(allBooked, {}).frac === null && tg(CY, {}) === null && tg(tweak(TH, (d) => { d.decision.stage = 'dropped'; }), {}) === null && tg(tweak(TH, (d) => { d.idea.dates.departure = '2026-10-10'; }), {}) === null &&
      eq(tg(tweak(TH, (d) => { d.idea.dates.departure = '2026-10-17'; }), {}), { days: 0, frac: 0, late: false }),
      'no arc once every traveler has booked; no ⏳ on an undated idea, a shelf trip or one already under way; ⏳0 on the day');
  }
  {
    // groups: 🌽🗽 family (Diwali, the shower, Thanksgiving) and 🦊🐼🐸 friends (Tahoe); a solo trip is in none
    const solo = tweak(DW, (d) => { d.id = 'soSoloTripJustMe00s001'; d.idea.members = [d.idea.members[1]]; d.responses = {}; });
    const ms = [M.tripModel(TH, ctx({ me: 'ashwin-l2' })), M.tripModel(DW, ctx({ me: 'ashwin-p8' })), M.tripModel(solo, ctx({ me: 'ashwin-p8' })), M.tripModel(CY, ctx({ me: 'ashwin-c3' })),
      M.tripModel(tg, ctx({ me: 'LAX' }))];
    const g = M.tripGroups(ms, 'ashwin');
    check(g.length === 2 && eq(g[0].ids, [DW.id, CY.id, tg.id]) && eq(g[0].faces, ['🌽', '🗽']) && eq(g[1].ids, [TH.id]) && eq(g[1].faces, ['🦊', '🐼', '🐸']) && eq(g[1].names, ['Priya', 'Maya', 'Leo']) && g[0].names.length === 2,
      'tripGroups: trips that share anyone but me form one group (a v1 "Me" is nobody), most trips first; a trip with nobody else is in none', g.map((x) => [x.ids, x.faces.join('')]));
    // Anjo is on the LA beach weekend with the Tahoe friends, so that trip chains the two groups into one
    const g2 = M.tripGroups([ms[0], M.tripModel(LX, ctx({ me: 'ashwin-x3' })), ms[1]], 'ashwin');
    check(g2.length === 1 && eq(g2[0].ids, [TH.id, LX.id, DW.id]), 'a trip that shares someone with two groups joins them (connected, not first match), in list order', g2.map((x) => x.ids));
    check(eq(M.tripGroups([], 'x'), []) && M.tripGroups([ms[2]], 'ashwin').length === 0, 'no trips, or only solo trips: no groups');
  }
  {
    const A = 'dwDiwaliRaleigh2026a01', B = 'thTahoeSkiWeekend26b02', base = 'https://shwinster101.github.io/PIALAX/';
    const L = M.listLink(base, [A, B, 'bad id', A], '🌴');
    check(L === base + '?l=' + A + '.' + B + '&f=' + encodeURIComponent('🌴'), 'listLink: <base>?l=<id>.<id>&f=<my face>, valid ids once each', L);
    const many = Array.from({ length: 30 }, (_, i) => ('t' + i).padEnd(22, 'q'));
    check(M.LIST_LINK_MAX === 20 && new URL(M.listLink(base, many, '')).searchParams.get('l').split('.').length === 20 && !/[&?]f=/.test(M.listLink(base, many, 'not a face')),
      'a list link carries at most 20 trips, and a face only when it is one emoji');
    check(M.listLink(base, [], '🌴') === '' && M.listLink('javascript:alert(1)', [A], '') === '' && M.listLink(base + '?x=1', [A], '') === '', 'no link without trips or with a base that is not a plain address');
    const u = new URL(L);
    check(!u.hash && decodeURIComponent(u.search).replace(/[A-Za-z0-9_-]{22}/g, 'ID') === '?l=ID.ID&f=🌴', 'nothing in a list link but trip ids and one face: no key, token, hash or price');
  }
  {
    // d3-geo's geoAlbersUsa fitted to 360×230 (the Map's box), golden values from d3 itself (rounded to 0.1)
    const gold = { PIA: [233.4, 96.8], LAX: [54.3, 134], LGA: [324.7, 82.2], SEA: [59, 25.9], JAX: [292, 170.6], RDU: [303.5, 125.9], MIA: [307.2, 205], BOS: [337.7, 66.1], ANC: [64.2, 195.6], HNL: [116.9, 197.1] };
    const off = Object.keys(gold).filter((k) => { const p = M.mapXY(k); return !p || Math.abs(p[0] - gold[k][0]) > 0.11 || Math.abs(p[1] - gold[k][1]) > 0.11; });
    check(off.length === 0, 'mapXY: the US map projection matches d3\'s geoAlbersUsa (lower 48, Alaska and Hawaii insets)', off.map((k) => [k, M.mapXY(k), gold[k]]));
    check(M.mapXY('LHR') === null && M.mapXY('CUN') === null && M.mapXY('ZZQ') === null && M.mapXY('') === null && M.usPoint(NaN, 0) === null,
      'a place off the US map (London, Cancún), an unknown code or a bad point has no map position');
  }

  // ═══ PIA-136 ════════════════════════════════════════════════════════════
  section('PIA-136 the one create path and organizer edits: typed caps, names, join requests, v1 idea links, groups, faces');
  {
    // typed text under a word cap: a change that adds a word past the cap is refused; nothing already there is ever cut
    const twelve = 'one two three four five six seven eight nine ten eleven twelve', long = 'a b c d e f g h i j k l m n o p q r s t u v w x y z';
    check(M.wordsIn('🎉 Diwali in 2026 — Raleigh') === 3 && M.wordsIn('') === 0 && M.wordsIn('  ') === 0 && M.wordsIn('Mom & Dad') === 2,
      'wordsIn counts the strict rule\'s words: tokens with a letter (numerals, emoji and dashes are free)');
    check(M.capTyped(twelve + ' thirteen', twelve, 12) === twelve && M.capTyped(twelve + ' 13', twelve, 12) === twelve + ' 13' && M.capTyped('a b', 'a', 12) === 'a b',
      'capTyped refuses the word that would pass the cap (the field keeps what it had); numerals and emoji still go in');
    check(M.capTyped(long.replace(' z', ''), long, 20) === long.replace(' z', '') && M.capTyped(long + 'z', long, 20) === long + 'z' && M.capTyped(long + ' zz', long, 20) === long,
      'a text that was already longer than the cap (a v1 caption) can be edited and shortened, never grown, and is never cut by typing');
    const fw = M.firstWords('Dad wants the  Peoria parade 🦃 at 9 and then lunch', 5);
    check(fw.text === 'Dad wants the  Peoria parade 🦃' && fw.more === true && eq(M.firstWords('two words', 5), { text: 'two words', more: false }) && M.firstWords('', 3).text === '',
      'firstWords: the first n words (tokens with no letter ride along), and whether any were left out', fw);
  }
  {
    check(M.cleanName('  Sam   Lee ') === 'Sam Lee' && M.cleanName('Me') === '' && M.cleanName(' me ') === '' && M.cleanName('123') === '' && M.cleanName('Ana Maria de Souza') === '' &&
      M.cleanName('Bartholomew Montgomery-Fitzgerald').length === 33 && M.cleanName('x'.repeat(60)).length === M.NAME_CHARS && M.NAME_CHARS === 37 && M.TITLE_CHARS === 77,
      'cleanName: one space between words, ≤3 words, ≤37 characters (a label is "<face> <name>" ≤40), a letter in it, never the v1 word Me');
    const id = 'dwDiwaliRaleigh2026a01', base = 'https://shwinster101.github.io/PIALAX/';
    const L1 = M.joinLink(base, id, 'Sam', 'oak'), L2 = M.joinLink(base, id, ' Dr. Ana  Lee ', ''), L3 = M.joinLink(base, id, 'José', 'GRU');
    const back = (u) => { const p = new URL(u).searchParams; return { idea: p.get('idea'), j: M.parseJoin(p.get('add')) }; };
    check(L1 === base + '?idea=' + id + '&add=Sam.OAK' && eq(back(L1), { idea: id, j: { name: 'Sam', airport: 'OAK' } }) && eq(back(L2).j, { name: 'Dr. Ana Lee', airport: '' }) && eq(back(L3).j, { name: 'José', airport: 'GRU' }),
      'joinLink → parseJoin round-trips through the address bar: ?idea=<id>&add=<name>.<IATA> (a name with a dot, no airport, an accent)', [L1, L2, L3]);
    check(M.parseJoin('Sam.12') === null && M.parseJoin('.OAK') === null && M.parseJoin('Me.LAX') === null && M.parseJoin('') === null && eq(M.parseJoin('Priya'), { name: 'Priya', airport: '' }) &&
      M.joinLink(base, 'short', 'Sam', 'OAK') === '' && M.joinLink(base, id, 'Me', 'OAK') === '' && M.joinLink('javascript:x', id, 'Sam', '') === '',
      'a join request needs a real name and a 3-letter code or none; a bad id, the word Me or a base that is not an address builds nothing');
    const u = new URL(L1);
    check(!u.hash && eq([...u.searchParams.keys()], ['idea', 'add']), 'a join request carries the trip id, a name and an airport only: no key, token or hash');
  }
  {
    // v1's read-only ?tripIdea= payload (encodeTripIdeaSharePayload: base64 of the URI-encoded JSON); test-app reads one v1 itself built
    const enc = (p) => Buffer.from(encodeURIComponent(JSON.stringify(p)), 'binary').toString('base64');
    const v1p = { version: 'trip-idea-v1', builder: { destination: { city: 'Raleigh-Durham', airport: 'RDU' }, dates: { departure: '2026-11-06', return: '2026-11-09', searchStart: '', searchEnd: '' }, constraints: { tripLength: null, eventDate: '2026-11-08' } },
      recommendation: { airport: 'RDU', city: 'Raleigh-Durham', departure: '2026-11-06', return: '2026-11-09', totalFare: 955, perTicketFare: 240, hub: 'LAX' }, fareStatus: 'estimated', notes: 'Lakshmi puja Sunday', eventContext: '2026-11-08' };
    const d1 = M.legacyDraft(enc(v1p), TODAY);
    check(eq(d1, { name: 'Raleigh-Durham', code: 'RDU', mode: 'dates', s: '2026-11-06', e: '2026-11-09', pin: '2026-11-08', nights: 3, caption: 'Lakshmi puja Sunday', cut: false }) && JSON.stringify(d1).indexOf('955') < 0,
      'legacyDraft: a v1 idea link fills the create sheet with its place, plan, event day and note; v1\'s prices and hub are never read', d1);
    // v1's builder note has no limit: the caption is its first 20 words (and fits the notes field), marked cut
    const words40 = Array.from({ length: 40 }, (_, i) => 'note' + i).join(' '), huge = 'x'.repeat(849);
    const c40 = M.legacyDraft(enc(Object.assign({}, v1p, { notes: words40 })), TODAY), cHuge = M.legacyDraft(enc(Object.assign({}, v1p, { notes: huge })), TODAY);
    const built = M.createRequest({ emoji: '🪔', name: 'X', dest: { airport: 'RDU' }, dates: { departure: c40.s, return: c40.e }, pin: c40.pin, caption: cHuge.caption, members: [{ name: 'Ana', airport: 'LAX' }] }, { today: TODAY });
    check(c40.cut && M.wordsIn(c40.caption) === 20 && c40.caption === words40.split(' ').slice(0, 20).join(' ') && cHuge.cut && cHuge.caption.length === M.CAPTION_CHARS &&
      built.body.idea.notes === '📌2026-11-08 ' + cHuge.caption && built.body.idea.notes.length <= M.TEXT_MAX.notes,
      'a longer v1 note is cut visibly, never silently: its first 20 words (849 characters → CAPTION_CHARS), marked cut; with 📌 it still fits the 500-character notes whole', { w: M.wordsIn(c40.caption), len: cHuge.caption.length });
    const win = M.legacyDraft(encodeURIComponent(JSON.stringify({ version: 'trip-idea-v0', builder: { destination: { airport: 'cun' }, dates: { searchStart: '2026-10-01', searchEnd: '2026-12-20' }, constraints: { tripLength: 5 } } })), TODAY);
    const past = M.legacyDraft(enc(Object.assign({}, v1p, { recommendation: Object.assign({}, v1p.recommendation, { departure: '2026-09-01', return: '2026-09-04' }), builder: Object.assign({}, v1p.builder, { dates: {} }) })), TODAY);
    check(eq(win, { name: '', code: 'CUN', mode: 'window', s: TODAY, e: '2026-12-20', pin: '', nights: 5, caption: '', cut: false }) && past.s === '' && past.e === '' && past.pin === '2026-11-08',
      'a window idea becomes a ⟦window⟧ (from today) with its nights; days already past are not offered again', { win, past });
    check(M.legacyDraft('!!!', TODAY) === null && M.legacyDraft(enc({ version: 'something-else' }), TODAY) === null && M.legacyDraft('', TODAY) === null && M.legacyDraft(enc(v1p), 'nope') === null,
      'anything that is not a v1 idea payload reads as nothing (the router then says the link is broken)');
  }
  {
    // the groups P-new-who offers: the people of each trip this phone has seen, newest first, one per set of names
    const solo = tweak(DW, (d) => { d.id = 'soSoloTripJustMe00s001'; d.idea.members = [d.idea.members[1]]; d.responses = {}; });
    const ms = [M.tripModel(TH, ctx({ me: 'ashwin-l2' })), M.tripModel(DW, ctx({ me: 'ashwin-p8' })), M.tripModel(CY, ctx({ me: 'ashwin-c3' })), M.tripModel(solo, ctx()), M.tripModel(LEG, ctx({ me: 'LAX' }))];
    const g = M.groupPresets(ms);
    check(g.length === 3 && eq(g[0].faces, ['🦊', '🐼', '🌴', '🐸']) && eq(g[0].rows.map((r) => r.me), [false, false, true, false]) && g[1].family && eq(g[1].faces, ['🌽', '🌴', '🗽']) && !g[0].family &&
      eq(g[2].rows.map((r) => r.name), ['Ashwin']) && eq(g[1].rows.map((r) => [r.name, r.airport, r.headcount]), [['Mom & Dad', 'PIA', 2], ['Ashwin', 'LAX', 1], ['Anjo', 'LGA', 1]]),
      'groupPresets: Tahoe\'s friends (me marked from this phone\'s identity), the 👪 family once (Diwali and the shower are the same people), a solo trip', g.map((x) => x.faces.join('')));
    const legOnly = M.groupPresets([M.tripModel(LEG, ctx({ me: 'LAX' }))]);
    check(M.tripModel(LEG, ctx({ me: 'LAX' })).legacy && legOnly.length === 0 && g.every((x) => x.rows.every((r) => r.name !== 'Me')),
      'an unmigrated v1 trip offers no group: its faces are read-time stand-ins (the preset\'s or a hashed face, never stored), so picking it would hand people faces they never had', legOnly.map((x) => x.faces.join('')));
    check(M.freeFace(['🦊', '🐻']) === '🐼' && M.freeFace(['🦊'], ['🐻', '🐼']) === '🐨' && M.freeFace(M.FACES.slice(0, 23), M.FACES) === M.FACES[23] && M.FACES.indexOf(M.freeFace(M.FACES)) >= 0,
      'freeFace: the first face nobody on the trip has, preferring one nobody on this phone has either');
  }
  {
    // faces are unique within a trip whatever the screen sends; codes never change
    const twins = M.createRequest({ emoji: '🎉', name: 'Twins', dest: { airport: 'RDU' }, members: [{ name: 'Ana', face: '🦊', airport: 'LAX' }, { name: 'Bo', face: '🦊', airport: 'SEA' }, { name: 'Cy', airport: 'SEA' }] }, { today: TODAY });
    const faces = twins.body.idea.members.map((x) => M.splitLabel(x.label).face);
    check(new Set(faces).size === 3 && faces[0] === '🦊' && faces[1] !== '🦊', 'createRequest: a face an earlier member already has is replaced by a free one (faces stay unique in the trip)', faces);
    const id = srv.seed(DW), fresh = await srv.get(id, KEY);
    const dup = M.updateRequest(fresh, KEY, { members: fresh.idea.members.map((m) => ({ code: m.code })).concat([{ name: 'Priya', face: '🌽', airport: 'DEN' }]) });
    const df = dup.body.idea.members.map((x) => M.splitLabel(x.label).face);
    check(new Set(df).size === 4 && eq(dup.body.idea.members.slice(0, 3).map((x) => x.label), fresh.idea.members.map((x) => x.label)) && eq(dup.body.idea.members.slice(0, 3).map((x) => x.code), fresh.idea.members.map((x) => x.code)),
      'an edit that adds someone with a face already on the trip gives them a free one; the kept members\' labels and codes are resent verbatim', df);
    // the people editor's own changes, through the real Worker: an airport change resends the answered member's flights
    const ed = M.organizerEdit(fresh, KEY, { members: fresh.idea.members.map((m) => (m.code === 'ashwin-p8' ? { code: m.code, name: 'Ashwin', face: '🌴', airport: 'SFO', headcount: 1 } : { code: m.code })) });
    const res = await srv.send(ed), after = await srv.get(id, KEY);
    check(srv.allOk(res) && ed.length === 2 && /respond/.test(ed[1].path) && ed[1].body.member === 'ashwin-p8' && after.responses['ashwin-p8'].origin === 'SFO' && after.responses['ashwin-p8'].status === 'in' &&
      after.responses['ashwin-p8'].note === fresh.responses['ashwin-p8'].note && M.tripModel(after, ctx({ me: 'ashwin-p8' })).me.O.join() === 'SFO',
      'moving an answered member\'s home airport (Ashwin LAX → SFO) is one update plus a complete answer resent with the new origin: his flights follow, his answer and note stay', ed.map((q) => q.path.split('?')[0]));
    const rm = M.organizerEdit(after, KEY, { members: after.idea.members.filter((m) => m.code !== 'anjo-z5').map((m) => ({ code: m.code })) });
    const rmRes = await srv.send(rm), gone = await srv.get(id, KEY);
    check(srv.allOk(rmRes) && gone.idea.members.length === 2 && !gone.responses['anjo-z5'] && gone.responses['momdad-k3'].status === 'in',
      'removing someone drops their answers on the Worker (why the editor asks twice for someone who answered); everyone else\'s answers stay');
  }
  {
    // a kept member (its code alone) keeps its label whatever order the list is in: a new or edited row never takes its face
    const id = srv.seed(tweak(DW, (d) => { d.id = 'dwKeptFacesFirst000k01'; })), fresh = await srv.get(id, KEY);
    const kept = fresh.idea.members.map((m) => ({ code: m.code }));
    const first = M.updateRequest(fresh, KEY, { members: [{ name: 'Priya', face: '🌽', airport: 'DEN' }].concat(kept) });
    const pf = first.body.idea.members.map((x) => x.label);
    check(eq(pf.slice(1), fresh.idea.members.map((x) => x.label)) && M.splitLabel(pf[0]).face !== '🌽' && new Set(pf.map((l) => M.splitLabel(l).face)).size === 4,
      'reverse order: a new row listed BEFORE the kept members, with a face one of them has (🌽), gets a free face; the kept labels go back verbatim', pf);
    const refaced = M.updateRequest(fresh, KEY, { members: [{ code: 'momdad-k3' }, { code: 'ashwin-p8', face: '🗽' }, { code: 'anjo-z5' }] });
    const rf = refaced.body.idea.members.map((x) => x.label);
    check(rf[0] === fresh.idea.members[0].label && rf[2] === fresh.idea.members[2].label && M.splitLabel(rf[1]).face !== '🗽' && M.splitLabel(rf[1]).name === 'Ashwin',
      'a member re-faced to a face someone kept already has (Anjo\'s 🗽, later in the list) gets a free one instead; Anjo keeps hers', rf);
    const air = M.updateRequest(fresh, KEY, { members: [{ code: 'momdad-k3' }, { code: 'ashwin-p8', airport: 'SFO' }, { code: 'anjo-z5' }] });
    check(eq(air.body.idea.members.map((x) => x.label), fresh.idea.members.map((x) => x.label)) && air.body.idea.members[1].airport === 'SFO' && air.body.idea.members[1].headcount === 1,
      'an airport-only change ({code, airport}) leaves every label as it is (another device\'s rename of the same member would survive)');
    // a long name already on the trip (another client, P-migrate) is kept as it is; the word cap is for typing only
    check(M.keepName('Mary  Ann Van Dyke') === 'Mary Ann Van Dyke' && M.cleanName('Mary Ann Van Dyke') === '' && M.keepName('Me') === '' && M.keepName('42') === '' && M.keepName('x'.repeat(60)).length === M.NAME_CHARS,
      'keepName keeps a name that is already on a trip however many words it has (never the word Me, never one without a letter); cleanName is the typed rule');
  }
  {
    // an edit whose update landed but whose airport-sync answer did not: the answer is still owed, rebuilt from the record that edit began with
    const id = srv.seed(tweak(DW, (d) => { d.id = 'dwOwedAnswerRetry00o01'; })), base = await srv.get(id, KEY);
    const ed = M.organizerEdit(base, KEY, { members: [{ code: 'momdad-k3' }, { code: 'ashwin-p8', airport: 'SFO' }, { code: 'anjo-z5' }] });
    await srv.send(ed.slice(0, 1));   // the update lands; the connection drops before Ashwin's answer
    const landed = await srv.get(id, KEY);
    const naive = M.organizerEdit(landed, KEY, { members: [{ code: 'momdad-k3' }, { code: 'ashwin-p8', airport: 'SFO' }, { code: 'anjo-z5' }] });
    const owed = { base, codes: ['ashwin-p8'] };
    const alone = M.organizerEdit(landed, KEY, {}, { owed }), withEdit = M.organizerEdit(landed, KEY, { caption: 'Puja at 6' }, { owed });
    check(M.tripModel(landed, ctx({ me: 'ashwin-p8' })).me.override === 'LAX' && naive.length === 1 && M.organizerEdit(landed, KEY, {}) === null,
      'after the landed update the record reads LAX as an override (his flights still from LAX); rebuilt from the landed record the same edit owes nothing, so a plain retry would never send the answer', naive.map((q) => q.path.split('?')[0]));
    check(alone.length === 1 && /\/idea\/respond/.test(alone[0].path) && alone[0].body.member === 'ashwin-p8' && alone[0].body.origin === '' && alone[0].body.note === base.responses['ashwin-p8'].note &&
      withEdit.length === 2 && /update/.test(withEdit[0].path) && withEdit[1].body.member === 'ashwin-p8' && withEdit[1].body.origin === '',
      'opts.owed: the owed answer is rebuilt against base (origin "" — his own home now), alone for an empty delta or after the next idea edit\'s update', [alone.map((q) => q.body), withEdit.map((q) => q.path.split('?')[0])]);
    const res = await srv.send(alone), fixed = await srv.get(id, KEY);
    check(srv.allOk(res) && fixed.responses['ashwin-p8'].origin === 'SFO' && M.tripModel(fixed, ctx({ me: 'ashwin-p8' })).me.override === '' && M.tripModel(fixed, ctx({ me: 'ashwin-p8' })).me.O.join() === 'SFO',
      'through the real Worker the owed answer puts him on SFO for good (no override left)');
    const closed = clone(landed); closed.decision = { stage: 'dropped' };
    check(M.organizerEdit(closed, KEY, {}, { owed }) === null && M.organizerEdit(landed, KEY, {}, { owed: { base, codes: ['nobody-zz'] } }) === null,
      'nothing is owed on a closed trip (it takes no answers), nor for a member who has no answer');
  }
  {
    // a paste (or autocorrect) that would pass a word cap: everything already there stays, and as much of the paste as fits goes in
    const prev = 'Diwali in', pasted = 'Diwali in ' + Array.from({ length: 18 }, (_, i) => 'w' + i + 'x').join(' ');
    const f1 = M.fitTyped(pasted, prev, 12), mid = M.fitTyped('Sam PASTE ME HERE Lee', 'Sam Lee', 3), ok = M.fitTyped('Sam Lee', 'Sam', 3);
    check(f1.cut && M.wordsIn(f1.text) === 12 && f1.text.indexOf('Diwali in w0x') === 0 && f1.at === f1.text.length && mid.cut && mid.text === 'Sam PASTE Lee' && mid.at === 10 && !ok.cut && ok.text === 'Sam Lee' && ok.at === -1 &&
      eq(M.fitTyped('🦊🦁 a b', '🦊🦁', 1), { text: '🦊🦁 a ', cut: true, at: 7 }) && M.fitTyped(prev + ' 12 13', prev, 2).cut === false,
      'fitTyped: a paste past the cap keeps the text that was there (before and after the cursor) and the first words that fit, and says it was cut; numerals ride free', [f1.text, mid.text]);
  }

  // ═══ PIA-137 ════════════════════════════════════════════════════════════
  section('PIA-137 the trip view: who this phone is, the one primary action, the organizer\'s 🎫, and answers that keep everything');
  {
    // who this phone is: a remembered face wins, a hint greets only when nothing is remembered, else P-face asks
    const w = (doc, o) => M.whoAmI(doc, o);
    const a = w(DW, { stored: 'anjo-z5' }), b = w(DW, { stored: 'anjo-z5', hint: 'anjo-z5' }), c = w(DW, { stored: 'anjo-z5', hint: 'momdad-k3' }), d = w(DW, { stored: 'anjo-z5', hint: 'nobody-zz' });
    check(a.me === 'anjo-z5' && a.from === 'stored' && !a.ask && b.me === 'anjo-z5' && !b.ask && !b.hint && d.me === 'anjo-z5' && !d.ask && !d.hint,
      'a remembered face that is on the trip is me; the same hint (or one for nobody on the trip) asks nothing', [a, b, d]);
    check(c.me === 'anjo-z5' && c.ask && c.hint === 'momdad-k3' && c.from === 'stored',
      'a hint that differs from the remembered face never overrides it: P-face asks, the remembered face outlined and the hint marked (one tap decides)', c);
    const h = w(DW, { hint: 'anjo-z5' }), gone = w(DW, { stored: 'removed-x1' });
    check(h.me === 'anjo-z5' && h.from === 'hint' && !h.ask && gone.me === '' && gone.ask,
      'with nothing remembered a hint greets that face (2 taps: the link, then In); a remembered face that left the trip counts as none', [h, gone]);
    const pre = w(DW, { names: ['anjo'] }), none = w(DW, {}), twoSams = w(M8, { names: ['Sam Lee'] }), legacy = w(LEG, { names: ['me', 'Me'] }), lgAnjo = w(LEG, { names: ['ANJO '] });
    check(pre.me === '' && pre.ask && pre.pre === 'anjo-z5' && none.ask && none.pre === '' && twoSams.ask && twoSams.pre === '' && legacy.pre === '' && lgAnjo.pre === 'LGA',
      'with neither, P-face asks; the one member named as this phone already is (its profile, its faces elsewhere) is preselected, never saved; two "Sam Lee"s or a v1 "Me" preselect nobody', [pre.pre, twoSams.pre, legacy.pre, lgAnjo.pre]);
    const joined = tweak(TH, (x) => { x.idea.members.push({ code: 'sam-j1', label: '🐨 Sam', airport: 'OAK', headcount: 1 }); });
    check(w(joined, { join: 'Sam' }).pre === 'sam-j1' && w(TH, { join: 'Sam' }).pre === '',
      'a phone that asked to join as Sam preselects Sam once the organizer has added him (and nobody before)');
    // a forwarded nudge link: the names this phone already is count as remembered, so a hint for someone else here asks
    const fwd = w(DW, { hint: 'anjo-z5', names: ['Mom & Dad'] }), fwd2 = w(DW, { hint: 'anjo-z5', names: ['Ashwin'] });
    const own = w(DW, { hint: 'anjo-z5', names: ['Anjo', 'Mom & Dad'] }), stranger = w(DW, { hint: 'anjo-z5', names: ['Priya Raman'] }), asked = w(joined, { hint: 'ashwin-l2', join: 'Sam' });
    check(fwd.me === '' && fwd.ask && fwd.hint === 'anjo-z5' && fwd.pre === 'momdad-k3' && fwd.from === '' && fwd2.ask && fwd2.pre === 'ashwin-p8' && !fwd2.me,
      'PIA-137 a nudge link for Anjo on a phone whose profile (or face on another trip) is Mom & Dad here never greets Anjo: P-face asks, Mom & Dad preselected, the hint marked', [fwd, fwd2]);
    check(own.me === 'anjo-z5' && own.from === 'hint' && !own.ask && stranger.me === 'anjo-z5' && !stranger.ask && stranger.from === 'hint',
      'a hint still greets its face when one of this phone\'s names is that face, or when none of them is on the trip', [own, stranger]);
    const twoHint = w(M8, { hint: 'samlee-kz', names: ['Sam Lee'] }), twoOther = w(M8, { hint: 'grandmajosephine-nf', names: ['Sam Lee'] });
    check(twoHint.me === 'samlee-kz' && !twoHint.ask && twoOther.ask && twoOther.pre === '' && twoOther.hint === 'grandmajosephine-nf' && asked.ask && asked.pre === 'sam-j1' && asked.hint === 'ashwin-l2',
      'two "Sam Lee"s: a hint for one of them greets; a hint for someone else asks with nobody preselected (the hint marked); the name a phone asked to join with counts too', [twoHint, twoOther, asked]);
  }
  {
    // PIA-154: the one primary action, checked in order: closed → Track in my travel days; the organizer before 🔒 → Share while
    // anyone waits, then Lock dates; me booked → Track in my travel days, else Landing time while it is missing; me answered, 🔒 → Book
    const P = (doc, o, today) => M.primaryAction(model(doc, o), today || TODAY);
    const ORG = { me: 'ashwin-p8', hasEditKey: true };
    const locked = tweak(DW, (x) => { x.decision = { stage: 'chosen', chosen: { airport: 'RDU', city: 'Raleigh', departure: '2026-11-06', return: '2026-11-09' } }; });
    const bookedAnjo = tweak(locked, (x) => { x.responses['anjo-z5'] = R('in', 'LGA', '', '', { booked: true }); });
    const timedAnjo = tweak(bookedAnjo, (x) => { x.responses['anjo-z5'].note = '🛬15:10'; });
    const paid = tweak(bookedAnjo, (x) => { x.decision.stage = 'booked'; x.decision.actual_total = 900; });
    const dropped = tweak(bookedAnjo, (x) => { x.decision.stage = 'dropped'; });
    const outAnjo = tweak(DW, (x) => { x.responses['anjo-z5'] = R('out', 'LGA'); }), inAnjo = tweak(DW, (x) => { x.responses['anjo-z5'] = R('in', 'LGA'); });
    const lockedIn = tweak(locked, (x) => { x.responses['anjo-z5'] = R('in', 'LGA'); });
    const orgBooked = tweak(DW, (x) => { x.responses['ashwin-p8'].booked = true; });
    const legWait = tweak(LEG, (x) => { delete x.responses.LGA; });
    check(P(DW, ORG) === 'share' && P(DW, { hasEditKey: true }) === 'share' && P(CY, { me: 'ashwin-c3', hasEditKey: true }) === 'share' && P(orgBooked, ORG) === 'share',
      'PIA-154 the organizer before 🔒, while anyone who is not a host still waits: Share (on the trip or not, dated or not, booked early or not)');
    const tgOpen = tweak(tg, (x) => { x.decision.stage = 'proposed'; });   // (P-migrate keeps the v1 🔒; unlocked, the host still owes his answer)
    check(P(inAnjo, ORG) === 'lock' && P(inAnjo, { hasEditKey: true }) === 'lock' && P(outAnjo, ORG) === 'lock' && P(tgOpen, { me: 'PIA', hasEditKey: true }) === 'lock' && P(tg, { me: 'PIA', hasEditKey: true }) === 'none',
      'PIA-154 …once nobody waits (out is an answer; a host\'s default In is not waiting): 🔒 Lock dates, for an organizer who hosts too');
    check(P(inAnjo, ORG, '2026-11-07') === 'share' && P(tweak(inAnjo, (x) => { x.idea.destination.airport = ''; }), ORG) === 'share' &&
      P(tweak(CY, (x) => { x.responses['momdad-c1'] = R('in', 'PIA'); }), { me: 'ashwin-c3', hasEditKey: true }) === 'share',
      'PIA-154 …but never Lock for a plan that has begun, a trip with no destination or no dates yet: Share stays');
    check(P(LEG, { me: 'LAX', hasEditKey: true }) === 'none' && P(legWait, { me: 'LAX', hasEditKey: true }) === 'share',
      'PIA-154 a v1 trip not updated yet: Share while someone waits, else nothing (the nav\'s ⤒ carries its next step)');
    check(P(inAnjo, { me: 'anjo-z5' }) === 'none' && P(inAnjo, { me: 'ashwin-p8' }) === 'none' && P(DW, { me: 'anjo-z5' }) === 'none' && P(outAnjo, { me: 'anjo-z5' }) === 'none' && P(DW, {}) === 'none' && P(tg, { me: 'PIA' }) === 'none',
      'PIA-154 guests before 🔒 have no primary (answered or not, out, nobody here, a host): the answer row is the call');
    check(P(lockedIn, { me: 'anjo-z5' }) === 'book' && P(locked, { me: 'ashwin-p8' }) === 'book' && P(locked, ORG) === 'book' && P(locked, { me: 'anjo-z5' }) === 'none' && P(locked, { me: 'anjo-z5', hasEditKey: true }) === 'none' &&
      P(locked, { hasEditKey: true }) === 'none' && P(locked, { me: 'ashwin-p8' }, '2026-11-07') === 'none' && P(tweak(lockedIn, (x) => { x.responses['anjo-z5'].status = 'out'; }), { me: 'anjo-z5' }) === 'none',
      'PIA-154 once 🔒: Book for a traveler who answered (the organizer too) while their days are ahead; none unanswered, out, begun, or not travelling');
    check(P(bookedAnjo, { me: 'anjo-z5' }) === 'times' && P(bookedAnjo, { me: 'anjo-z5' }, '2026-11-04') === 'times' && P(timedAnjo, { me: 'anjo-z5' }) === 'none',
      'PIA-154 booked: Landing time while it is missing (mine to record), nothing once it is there');
    check(P(bookedAnjo, { me: 'anjo-z5' }, '2026-11-05') === 'track' && P(bookedAnjo, { me: 'anjo-z5' }, '2026-11-09') === 'track' && P(timedAnjo, { me: 'anjo-z5' }, '2026-11-06') === 'track' &&
      P(tweak(bookedAnjo, (x) => { x.responses['ashwin-p8'].booked = true; }), ORG, '2026-11-05') === 'track',
      'PIA-154 booked, from the day before my first day to my last: Track (the organizer too, once locked)');
    check(P(paid, { me: 'anjo-z5' }) === 'none' && P(paid, { me: 'anjo-z5' }, '2026-11-06') === 'track' && P(paid, ORG) === 'none' && P(dropped, { me: 'anjo-z5' }) === 'none' && P(dropped, { me: 'anjo-z5' }, '2026-11-08') === 'track',
      'PIA-154 closed (paid or dropped): Track in my travel days, else nothing');
    const TW = (doc, code, day) => M.travelWindow(model(doc, { me: code }), code, day);
    check(TW(bookedAnjo, 'anjo-z5', '2026-11-05') && TW(bookedAnjo, 'anjo-z5', '2026-11-09') && !TW(bookedAnjo, 'anjo-z5', '2026-11-04') && !TW(bookedAnjo, 'anjo-z5', '2026-11-10') &&
      !TW(locked, 'ashwin-p8', '2026-11-06') && !TW(bookedAnjo, 'nobody-00', '2026-11-06') && !M.travelWindow(model(bookedAnjo, {}), 'anjo-z5', '') &&
      TW(tweak(bookedAnjo, (x) => { x.responses['anjo-z5'].available_from = '2026-11-08'; }), 'anjo-z5', '2026-11-07') && !TW(tweak(bookedAnjo, (x) => { x.responses['anjo-z5'].available_from = '2026-11-08'; }), 'anjo-z5', '2026-11-06'),
      'PIA-154 travelWindow: booked, from the day before their own first day to their last, inclusive; never unbooked, unknown or undated');
    const LK = (doc, o, day) => M.lockable(model(doc, o), day || TODAY);
    check(LK(inAnjo, ORG) && LK(DW, ORG) && LK(inAnjo, { hasEditKey: true }) && !LK(inAnjo, { me: 'ashwin-p8' }) && !LK(locked, ORG) && !LK(paid, ORG) && !LK(dropped, ORG) && !LK(LEG, { me: 'LAX', hasEditKey: true }) &&
      !LK(CY, { me: 'ashwin-c3', hasEditKey: true }) && !LK(tweak(DW, (x) => { x.idea.destination.airport = ''; }), ORG) && LK(DW, ORG, '2026-11-06') && !LK(DW, ORG, '2026-11-07') && !LK(DW, ORG, '2026-11-12'),
      'PIA-154 lockable: the organizer\'s phone, a v2 trip open and not locked, with a plan and a destination that has not begun');
    // bookSlot keeps every 🎫 outcome it had: the old rule (the old primary's 'book' / 'share', written out here) over a matrix
    const OLD = (m, code, today) => {
      const me = m.me, x = m.members.find((y) => y.code === code) || null;
      if (!x || !x.traveler) return { slot: '', tk: '', early: false };
      const pa = !me || me.code !== code ? '' : (m.decision === 'dropped' || me.host) ? 'none' : (me.traveler && me.booked) ? 'booked' : m.closed ? 'none' :
        !me.traveler ? (m.org && !m.locked ? 'share-only' : 'none') : (!m.org && !me.answered) ? 'none' : m.locked ? (me.d1 && me.d1 >= today ? 'book' : 'none') : 'share';
      const early = M.earlyBook(m, code, today), mine = !!me && me.code === code;
      const tk = m.closed ? '' : mine ? (x.booked || pa === 'book' || (early && pa === 'share') ? 'self' : '') : M.bookToggle(m, code, early) ? 'org' : '';
      return { slot: x.booked ? 'booked' : tk ? 'book' : 'gf', tk, early };
    };
    const docs = [DW, inAnjo, outAnjo, locked, lockedIn, bookedAnjo, timedAnjo, paid, dropped, orgBooked, LEG, legWait, tg, CY, M8, TH];
    const days = [TODAY, '2026-11-05', '2026-11-07', '2026-11-26', '2026-12-30'], diffs = [];
    let cases = 0;
    docs.forEach((d, di) => [true, false].forEach((org) => [''].concat(d.idea.members.map((x) => x.code)).forEach((me) => days.forEach((day) => {
      const m = M.tripModel(d, ctx({ me: me || null, hasEditKey: org, today: day }));
      m.members.forEach((x) => { cases++; const a = M.bookSlot(m, x.code, day), b = OLD(m, x.code, day); if (!eq(a, b)) diffs.push({ di, org, me, day, code: x.code, a, b }); });
    }))));
    check(!diffs.length && cases > 400, 'PIA-154 bookSlot keeps every 🎫 outcome it had (' + cases + ' cases: 16 trips × organizer or not × each face × 5 days), decided without the trip view\'s primary', diffs.slice(0, 5));
    // the organizer's 🎫 on other rows
    const T = (doc, me, code, org) => M.bookToggle(model(doc, { me, hasEditKey: org !== false }), code);
    const lockedOut = tweak(locked, (x) => { x.responses['anjo-z5'] = R('out', 'LGA'); });
    check(T(DW, 'ashwin-p8', 'anjo-z5') === null && eq(T(locked, 'ashwin-p8', 'anjo-z5'), { on: false, confirm: true }) && eq(T(locked, 'ashwin-p8', 'momdad-k3'), { on: false, confirm: false }) &&
      eq(T(lockedOut, 'ashwin-p8', 'anjo-z5'), { on: false, confirm: true }) && eq(T(bookedAnjo, 'ashwin-p8', 'anjo-z5'), { on: true, confirm: true }),
      'the organizer\'s 🎫 shows once the dates are set: one tap for someone in, a confirming tap for someone waiting or out (recorded in first, 📞) and for taking a 🎫 away');
    check(T(locked, 'ashwin-p8', 'ashwin-p8') === null && T(locked, 'ashwin-p8', 'anjo-z5', false) === null && T(paid, 'ashwin-p8', 'momdad-k3') === null && T(dropped, 'ashwin-p8', 'momdad-k3') === null &&
      M.bookToggle(model(tg, { me: 'LAX', hasEditKey: true, }), 'PIA') === null && T(LEG, 'LAX', 'LGA') === null,
      'never on his own row, never for a guest, never on a closed trip, never on a host, never on an unmigrated v1 doc');
    const anyB = tweak(DW, (x) => { x.responses['ashwin-p8'].booked = true; });
    check(eq(T(anyB, 'ashwin-p8', 'momdad-k3'), { on: false, confirm: false }), 'someone booking early shows the column before the dates are set');
  }
  {
    // answering never erases a person's dates, note or origin (each write the trip view makes, through the real Worker)
    const id = srv.seed(tg), at = async () => (await srv.get(id)).responses.LGA;
    const steps = [
      ['she answers In with her own days, a note, an EWR override and home from ORD', (doc) => M.respondRequest(doc, 'LGA', { status: 'in', available_from: '2026-11-24', available_to: '2026-11-29', note: 'Arriving late', origin: 'EWR', leave_from: 'ORD' }, { by: 'self' })],
      ['she changes to Maybe (the status alone)', (doc) => M.respondRequest(doc, 'LGA', { status: 'maybe' }, { by: 'self' })],
      ['the organizer answers Out for her (📞)', (doc) => M.respondRequest(doc, 'LGA', { status: 'out' }, { by: 'proxy' })],
      ['she answers In herself again', (doc) => M.respondRequest(doc, 'LGA', { status: 'in' }, { by: 'self' })],
      ['she flies into ORD (an airport cell)', (doc) => M.respondRequest(doc, 'LGA', { arrive_at: 'ORD' }, { by: 'self' })],
      ['the organizer moves her home airport cell back to PIA', (doc) => M.respondRequest(doc, 'LGA', { leave_from: '' }, { by: 'keep' })],
      ['she marks herself booked', (doc) => M.bookedRequests(doc, 'LGA', true, { by: 'self' })],
      ['she answers Maybe after booking', (doc) => M.respondRequest(doc, 'LGA', { status: 'maybe' }, { by: 'self' })]
    ];
    const log = [];
    for (const [what, build] of steps) {
      const doc = await srv.get(id), res = await srv.send(build(doc)), r = await at();
      log.push({ what, ok: srv.allOk(res), status: r.status, from: r.available_from, to: r.available_to, note: r.note, origin: r.origin, A: r.arrive_at, H: r.leave_from, booked: !!r.booked });
    }
    const kept = log.every((x) => x.ok && x.from === '2026-11-24' && x.to === '2026-11-29' && M.parseRespNote(x.note).text === 'Arriving late' && x.origin === 'EWR');
    check(kept, 'PIA-137 answering never erases her dates, note or origin: In, Maybe, the organizer\'s Out, In again, two airport cells, 🎫 and Maybe after it, each through the real Worker', log);
    check(log[2].note === '📞 Arriving late' && log[3].note === 'Arriving late' && log[1].H === 'ORD' && log[4].A === 'ORD' && log[4].H === 'ORD' && log[5].H === '' && log[5].A === 'ORD' && log[6].booked && log[7].booked && log[7].status === 'maybe',
      'the organizer\'s answer is marked 📞 and hers clears it; airport picks change only when a cell is tapped; the 🎫 stays through a later Maybe', log.map((x) => [x.status, x.note, x.A, x.H, x.booked]));
    // a trip that is merely Done (every traveler booked) still takes answers; a paid one is closed
    const did = srv.seed(tg);
    await srv.send(M.bookedRequests(await srv.get(did), 'LAX', true, { by: 'self' }));
    await srv.send(M.bookedRequests(await srv.get(did), 'LGA', true, { by: 'self' }));
    const done = await srv.get(did, KEY), doneM = model(done, { me: 'LGA' });
    const ans = M.respondRequest(done, 'LGA', { status: 'maybe' }, { by: 'self' }), ansRes = await srv.send(ans);
    check(doneM.stage === 'done' && !doneM.closed && ans && srv.allOk(ansRes) && (await srv.get(did)).responses.LGA.status === 'maybe' && (await srv.get(did)).responses.LGA.booked === true,
      'PIA-137 a trip that is merely Done (every traveler booked, nothing paid) still takes an answer, and keeps the 🎫', { stage: doneM.stage, closed: doneM.closed });
    const payRes = await srv.send(M.updateRequest(await srv.get(did, KEY), KEY, { decision: { stage: 'booked', actual_total: 1180 } }));
    const paidDoc = await srv.get(did, KEY), paidM = model(paidDoc, { me: 'LGA' });
    const raw = await srv.call('POST', '/idea/respond?id=' + did, { member: 'LGA', status: 'in', origin: '', available_from: '', available_to: '', note: '' });
    check(srv.allOk(payRes) && paidM.closed && paidM.paid === 1180 && M.respondRequest(paidDoc, 'LGA', { status: 'in' }, { by: 'self' }) === null && raw.status === 409 && raw.json.code === 'closed',
      'once paid (💵) the trip is closed: no answer is built (the Worker would refuse it, 409 closed), so the trip view shows its closed state instead of taps that fail', { raw: raw.status });
  }

  // ═══ PIA-138 ════════════════════════════════════════════════════════════
  section('PIA-138 dates, the one picker: the plan moves with everyone who follows it, own ends stay, 📌 stays inside, undated ideas collect windows');
  {
    // the organizer's ±1: the whole plan, keeping its length and 📌; why it cannot move otherwise
    const org = model(DW, { me: 'ashwin-p8', hasEditKey: true });
    const p1 = M.planShift(org, 1, TODAY), m1 = M.planShift(org, -1, TODAY), p3 = M.planShift(org, 3, TODAY), m3 = M.planShift(org, -3, TODAY);
    check(eq(p1, { s: '2026-11-07', e: '2026-11-10', why: '' }) && eq(m1, { s: '2026-11-05', e: '2026-11-08', why: '' }) && p3.why === 'pin' && m3.why === 'pin' && M.planShift(org, 2, TODAY).why === '' && M.planShift(org, -2, TODAY).why === 'pin' && M.planShift(org, 7, TODAY).why === 'pin',
      'PIA-138 AC1 ±1 moves the whole plan a day (11/6–11/9 → 11/7–11/10 or 11/5–11/8), keeping its 3 nights; a move that would leave 📌 11/8 outside it cannot go (📌⚠)', [p1, m1, p3]);
    const soon = model(tweak(DW, (d) => { d.idea.dates.departure = '2026-10-18'; d.idea.dates.return = '2026-10-21'; d.idea.notes = ''; }), { hasEditKey: true });
    const locked = tweak(DW, (d) => { d.decision = { stage: 'chosen', chosen: { airport: 'RDU', city: 'Raleigh', departure: '2026-11-06', return: '2026-11-09' } }; });
    const why = (doc, o) => M.planShift(model(doc, o), 1, TODAY).why;
    check(M.planShift(soon, -1, TODAY).why === '' && M.planShift(soon, -2, TODAY).why === 'past' && why(DW, { me: 'anjo-z5' }) === 'org' && why(locked, { hasEditKey: true }) === 'locked' &&
      why(LEG, { hasEditKey: true }) === 'legacy' && why(CY, { hasEditKey: true }) === 'none' && why(tweak(locked, (d) => { d.decision.stage = 'dropped'; }), { hasEditKey: true }) === 'closed',
      'it never starts before today (⏳⚠); only the organizer moves it; locked dates do not move until 🔓; a v1 doc waits for P-migrate; an undated idea has no plan to move');
    const r7 = M.moveRange('2026-11-06', '2026-11-09', 7, '', TODAY), r7m = M.moveRange('2026-11-06', '2026-11-09', -7, '', TODAY);
    check(eq(r7, { s: '2026-11-13', e: '2026-11-16', why: '' }) && eq(r7m, { s: '2026-10-30', e: '2026-11-02', why: '' }) && M.moveRange('2026-10-20', '2026-10-22', -7, '', TODAY).why === 'past' && M.moveRange('', '', 1, '', TODAY) === null,
      'PIA-138 AC2 the day and week shifts move the whole range and keep its length (±7 a week), never before today', [r7, r7m]);
    check(eq(M.SHIFT_STEPS, [-7, -1, 1, 7]), 'the picker\'s shift row is −7 −1 +1 +7');
  }
  {
    // a shift through the real Worker: every end that follows the plan moves with it; an end someone set stays (⚠ once off the plan)
    const base = tweak(DW, (d) => {
      d.responses['anjo-z5'] = R('in', 'LGA', '2026-11-05', '2026-11-09', { note: 'Leaving early Monday' });
      d.responses['ashwin-p8'] = R('in', 'LAX', '', '', { booked: true });
    });
    const id = srv.seed(base), before = await srv.get(id, KEY), mb = model(before, { me: 'ashwin-p8', hasEditKey: true });
    const sh = M.planShift(mb, 1, TODAY), reqs = M.organizerEdit(before, KEY, { dates: { departure: sh.s, return: sh.e } });
    const res = await srv.send(reqs), after = await srv.get(id, KEY), ma = model(after, { me: 'ashwin-p8', hasEditKey: true });
    const dec = (x) => { const d = M.gfDecode(x.link && x.link.href); return d ? d.legs.map((L) => L.date) : null; };
    check(srv.allOk(res) && eq(ma.plan, { s: '2026-11-07', e: '2026-11-10' }) && ma.pin === '2026-11-08' && after.idea.notes === before.idea.notes && eq(after.idea.members, before.idea.members),
      'PIA-138 AC1 one shift is one organizer edit: the plan moves to 11/7–11/10 and nothing else in the idea changes (📌, caption, people)', reqs.map((q) => q.path));
    check(eq(dec(mem(ma, 'momdad-k3')), ['2026-11-07', '2026-11-10']) && eq(dec(mem(mb, 'momdad-k3')), ['2026-11-06', '2026-11-09']) && mem(ma, 'momdad-k3').d1 === '2026-11-07',
      'Mom & Dad follow the plan: their days and their Google Flights link move with it (11/7 out, 11/10 home)', [dec(mem(mb, 'momdad-k3')), dec(mem(ma, 'momdad-k3'))]);
    const an0 = mem(mb, 'anjo-z5'), an1 = mem(ma, 'anjo-z5');
    check(an0.link.href === an1.link.href && an1.own1 === '2026-11-05' && an1.own2 === '2026-11-09' && an0.warn.indexOf('off') >= 0 && an1.warn.indexOf('off') >= 0 &&
      after.responses['anjo-z5'].available_from === '2026-11-05' && M.parseRespNote(after.responses['anjo-z5'].note).text === 'Leaving early Monday',
      'Anjo set her own 11/5–11/9: they stay put (her link is byte for byte the same) and carry ⚠ while they fall off the plan; her note is untouched', an1.warn);
    const ash1 = mem(ma, 'ashwin-p8');
    check(reqs.length === 2 && reqs[0].path.indexOf('/idea/respond') === 0 && ash1.booked && ash1.own1 === '2026-11-06' && ash1.own2 === '2026-11-09' && eq(dec(ash1), ['2026-11-06', '2026-11-09']) && ash1.warn.indexOf('off') >= 0,
      'Ashwin had booked while following the plan: before the plan moves his booked days are written as his own (11/6–11/9), so a move never changes the days he booked (⚠ shows they are now off the plan)', { own: [ash1.own1, ash1.own2] });
  }
  {
    // holiday chips: a whole long weekend and its event day in one tap
    const tgk = M.holidayPick('2026-11-26', TODAY), xm = M.holidayPick('2026-12-25', TODAY), lab = M.holidayPick('2027-09-06', TODAY), mem27 = M.holidayPick('2027-05-31', TODAY);
    check(tgk.s === '2026-11-25' && tgk.e === '2026-11-29' && tgk.pin === '2026-11-26' && tgk.g === '🦃' && M.dowOf(tgk.s) === 3 && M.dowOf(tgk.e) === 0 && xm.s === '2026-12-23' && xm.e === '2026-12-27' && xm.pin === '2026-12-25' &&
      lab.s === '2027-09-03' && lab.e === '2027-09-06' && M.dowOf(lab.s) === 5 && mem27.s === '2027-05-28' && mem27.e === '2027-05-31',
      'PIA-138 AC2 one holiday tap picks its whole long weekend and pins the holiday: 🦃 Wed 11/25–Sun 11/29 📌11/26, 🎄 12/23–12/27, 🌭 and 🎗 Fri–Mon', [tgk, xm, lab, mem27]);
    check(M.holidayPick('2026-11-26', '2026-11-26').s === '2026-11-26' && M.holidayPick('2026-11-27', TODAY) === null && M.holidayPick('2026-07-04', TODAY) === null,
      'never a day before today (on Thanksgiving itself the weekend starts that day); a day that is no holiday, or one already past, picks nothing');
  }
  {
    // what stops a pick from being saved: the event day is pinned and can never fall outside the plan
    const c = (s, e, o) => M.planCheck(s, e, Object.assign({ today: TODAY }, o));
    check(c('', '') === 'empty' && c('2026-11-06', '') === 'partial' && c('2026-11-09', '2026-11-06') === 'order' && c('2026-10-16', '2026-10-20') === 'past' && c('2026-11-09', '2026-11-12', { pin: '2026-11-08' }) === 'pin' &&
      c('2026-11-06', '2026-11-09', { pin: '2026-11-08' }) === '' && c('2026-12-18', '2026-12-20', { window: true, nights: 4 }) === 'nights' && c('2026-12-18', '2027-01-04', { window: true, nights: 4, pin: '2026-11-08' }) === '',
      'PIA-138 AC2 a plan is saved only whole (a start and an end, in order, from today) and with 📌 inside it (📌⚠ otherwise); a ⟦window⟧ must hold its 🌙 nights');
  }
  {
    // clearing a plan makes the idea undated again; the best window (explicit windows only) turns back into a plan in one write
    const id = srv.seed(tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA', '2026-11-06', '2026-11-12'); d.responses['ashwin-p8'] = R('in', 'LAX', '2026-11-07', '2026-11-11'); }));
    const f0 = await srv.get(id, KEY), m0 = model(f0, { hasEditKey: true });
    const cd = M.clearDelta(m0), clr = await srv.send(M.organizerEdit(f0, KEY, cd)), f1 = await srv.get(id, KEY), m1 = model(f1, { hasEditKey: true });
    check(srv.allOk(clr) && eq(cd.dates, { departure: '', return: '', searchStart: '2026-10-30', searchEnd: '2026-11-16' }) && m1.undated && !m1.plan && eq(m1.win, { s: '2026-10-30', e: '2026-11-16' }) && m1.nightsN === 3 && m1.nights === 3 &&
      m1.pin === '2026-11-08' && m1.caption === 'Lakshmi puja Sunday evening',
      'PIA-138 AC5 🗓⊘ clears the plan: the idea is undated again, keeping its flex window ⟦10/30–11/16⟧ as its window, its length as 🌙3, its 📌 and caption', f1.idea);
    check(!!m1.best && m1.best.s === '2026-11-07' && m1.best.e === '2026-11-10' && m1.best.full === 2 && mem(m1, 'anjo-z5').own1 === '2026-11-06' && f1.responses['ashwin-p8'].available_from === '2026-11-07',
      'the undated idea suggests its best 3-night window from the two people who set their own days, keeping 📌 11/8 inside (11/7–11/10), and nobody\'s own days changed', m1.best);
    const tk = await srv.send(M.organizerEdit(f1, KEY, M.planDelta(m1.best.s, m1.best.e, m1.pin))), f2 = await srv.get(id, KEY), m2 = model(f2, { hasEditKey: true });
    check(srv.allOk(tk) && eq(m2.plan, { s: '2026-11-07', e: '2026-11-10' }) && !m2.nightsN && eq(m2.win, { s: '2026-10-30', e: '2026-11-16' }) && m2.best === null && f2.idea.notes === '📌2026-11-08 Lakshmi puja Sunday evening',
      'the organizer takes it in one write: it becomes the plan (its own length, so no 🌙; 📌 and the caption kept), the ⟦window⟧ stays, and the best window no longer shows (it is the plan)', [m2.plan, f2.idea.notes]);
  }
  {
    // an undated idea collects a rough window and nights; members set their own days inside it; the organizer takes the best window
    const id = srv.seed(CY), f0 = await srv.get(id, KEY), m0 = model(f0, { hasEditKey: true });
    const wd = await srv.send(M.organizerEdit(f0, KEY, M.windowDelta('2026-12-18', '2027-01-04', 5))), f1 = await srv.get(id, KEY), m1 = model(f1, { hasEditKey: true });
    check(srv.allOk(wd) && m1.undated && m1.nightsN === 5 && eq(m1.win, { s: '2026-12-18', e: '2027-01-04' }) && f1.idea.notes === '🌙5 New date TBD' && !!m1.best && m1.best.s === '2026-12-21' && m1.best.e === '2026-12-26',
      'PIA-138 AC5 the organizer sets the rough window and 🌙 nights (⟦12/18–1/4⟧ 🌙5): the best 5-night window follows Ashwin and Anjo\'s own days (12/21–12/26)', [m1.best, f1.idea.notes]);
    const both = M.ownDays(m1, 'anjo-c4', '2026-12-20', '2026-12-26', null, TODAY);
    const sent = await srv.send(M.respondRequest(f1, 'anjo-c4', both.patch, { by: 'self' })), f2 = await srv.get(id, KEY), m2 = model(f2, { hasEditKey: true });
    check(both.why === '' && srv.allOk(sent) && f2.responses['anjo-c4'].available_from === '2026-12-20' && !!m2.best && m2.best.s === '2026-12-20' && m2.best.e === '2026-12-25' && eq(M.dayPeople(m2, '2026-12-24').there.sort(), ['anjo-c4', 'ashwin-c3']),
      'a member sets her own window (12/20–12/26) and the best window moves with it (12/20–12/25); P-day 12/24 has both of them there', m2.best);
    const tk = await srv.send(M.organizerEdit(f2, KEY, M.planDelta(m2.best.s, m2.best.e, m2.pin))), f3 = await srv.get(id, KEY), m3 = model(f3, { hasEditKey: true });
    check(srv.allOk(tk) && eq(m3.plan, { s: '2026-12-20', e: '2026-12-25' }) && !m3.undated && f3.idea.notes === 'New date TBD' && f3.responses['ashwin-c3'].available_from === '2026-12-19' && f3.responses['anjo-c4'].available_to === '2026-12-26',
      'the best window becomes the plan in one write (🌙 gone: the plan has its own length); everyone\'s own days stay as they set them', f3.idea);
  }
  {
    // 🔒 locks the plan as it stands (no price, the plan's own dates), 🔓 unlocks it
    const id = srv.seed(DW), f0 = await srv.get(id, KEY);
    const lk = M.organizerEdit(f0, KEY, Object.assign(M.planDelta('2026-11-13', '2026-11-16', ''), { decision: { stage: 'chosen' } }));
    const r1 = await srv.send(lk), f1 = await srv.get(id, KEY), m1 = model(f1, { hasEditKey: true });
    check(srv.allOk(r1) && lk.length === 1 && m1.locked && m1.stage === 'set' && f1.decision.chosen.departure === '2026-11-13' && f1.decision.chosen.return === '2026-11-16' && f1.decision.chosen.totalFare === null && m1.pin === '',
      'PIA-138 AC3 🔒 with a new plan picked is one update: the plan, then the decision chosen from that very plan (no price stored)', f1.decision.chosen);
    check(M.planShift(m1, 1, TODAY).why === 'locked', 'locked dates cannot be moved until unlocked');
    const r2 = await srv.send(M.organizerEdit(f1, KEY, { decision: { stage: 'proposed' } })), m2 = model(await srv.get(id, KEY), { hasEditKey: true });
    check(srv.allOk(r2) && !m2.locked && m2.stage === 'asking' && eq(m2.plan, { s: '2026-11-13', e: '2026-11-16' }) && M.planShift(m2, 1, TODAY).why === '', '🔓 unlocks it (the plan stays), and it can move again');
  }
  {
    // a phone that has not seen the 🔒 yet never moves a locked plan: every write is rebuilt from the fresh record, and on a
    // locked (or closed) one organizerEdit builds nothing for a date move (datesHeld)
    const id = srv.seed(DW), f0 = await srv.get(id, KEY);
    await srv.send(M.organizerEdit(f0, KEY, { decision: { stage: 'chosen' } }));   // another organizer phone locks it
    const f1 = await srv.get(id, KEY), m1 = model(f1, { hasEditKey: true });
    const move = { dates: { departure: '2026-11-07', return: '2026-11-10' } };
    const mv = M.organizerEdit(f1, KEY, move), lkmv = M.organizerEdit(f1, KEY, Object.assign(M.planDelta('2026-11-13', '2026-11-16', '2026-11-14'), { decision: { stage: 'chosen' } }));
    const clr = M.organizerEdit(f1, KEY, M.clearDelta(m1)), pin = M.organizerEdit(f1, KEY, { pin: '2026-11-07' }), nights = M.organizerEdit(f1, KEY, { nights: 4 });
    const same = M.organizerEdit(f1, KEY, M.planDelta('2026-11-06', '2026-11-09', '2026-11-08')), cap = M.organizerEdit(f1, KEY, { caption: 'Puja at 6' });
    const unmv = M.organizerEdit(f1, KEY, Object.assign({ decision: { stage: 'proposed' } }, move));
    check(m1.locked && M.datesHeld(f1, move) === 'locked' && mv === null && lkmv === null && clr === null && pin === null && nights === null && !!same && !!cap && cap.length === 1 && !!unmv && M.datesHeld(f1, { title: 'x' }) === '',
      'PIA-138 AC3 on a record another phone has 🔒: a move, a lock with new dates, 🗓⊘, a new 📌 or 🌙 build nothing (datesHeld: locked); the same dates, a caption, or an unlock-and-move in one update still go', { mv, lkmv: !!lkmv, clr, pin });
    const res = await srv.send(unmv), f2 = await srv.get(id, KEY);
    check(srv.allOk(res) && f2.decision.stage === 'proposed' && eq(M.docPlan(f2), { s: '2026-11-07', e: '2026-11-10' }) && !(f2.decision.chosen && f2.decision.chosen.departure === '2026-11-06' && f2.decision.stage === 'chosen'),
      'through the real Worker: unlock-and-move lands as one update, so the plan never disagrees with a 🔒 snapshot', f2.decision);
    const dropped = tweak(DW, (d) => { d.decision = { stage: 'dropped' }; }), legacyChosen = tweak(LEG, (d) => { d.decision = { stage: 'chosen' }; });
    check(M.datesHeld(dropped, move) === 'closed' && M.organizerEdit(dropped, KEY, move) === null && M.datesHeld(DW, move) === '' && M.datesHeld(legacyChosen, move) === '' && M.datesHeld(null, move) === '',
      'a dropped or paid trip holds a move too (closed); an open trip does not; a v1 doc is P-migrate\'s (its edits are refused there anyway)');
  }
  {
    // nobody's own days are changed behind their back: a pick that only repeats the plan's day keeps that end following
    const one = tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA', '2026-11-05', ''); }), m1 = model(one, { me: 'anjo-z5' });
    const o = (s, e, end) => M.ownDays(m1, 'anjo-z5', s, e, end === undefined ? null : end, TODAY);
    const opened = o('2026-11-05', '2026-11-09'), later = o('2026-11-07', '2026-11-09'), plan = o('2026-11-06', '2026-11-09'), leave = o('', '2026-11-09', 1), fol = o('', '');
    check(opened.same && eq(opened.patch, { available_from: '2026-11-05', available_to: '' }) && !later.same && eq(later.patch, { available_from: '2026-11-07', available_to: '' }) &&
      !plan.same && eq(plan.patch, { available_from: '', available_to: '' }) && leave.same && eq(leave.patch, { available_to: '' }) && !fol.same && fol.d1 === '2026-11-06',
      'PIA-138 Anjo set her arrival (11/5) and follows the leave end: her days as they are change nothing (same: Save "No change"); "arrive a day later" (11/7 → 11/9, the plan\'s own last day) sets the arrival only; picking the plan\'s own days follows it again', [opened.patch, later.patch, plan.patch]);
    const own = tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA', '2026-11-06', '2026-11-09'); }), mo = model(own, { me: 'anjo-z5' });
    const keep = M.ownDays(mo, 'anjo-z5', '2026-11-06', '2026-11-09', null, TODAY), md1 = M.legShift(model(DW, { me: 'momdad-k3' }), 'momdad-k3', 0, 1, TODAY), back = M.legShift(model(tweak(DW, (d) => { d.responses['momdad-k3'].available_from = '2026-11-07'; }), { me: 'momdad-k3' }), 'momdad-k3', 0, -1, TODAY);
    check(keep.same && eq(keep.patch, { available_from: '2026-11-06', available_to: '2026-11-09' }) && eq(md1.patch, { available_from: '2026-11-07' }) && eq(back.patch, { available_from: '' }),
      'days someone set that equal the plan stay theirs (they pinned them); a leg shift off the plan\'s day is their own (+1: 11/7), and back onto it follows the plan again (−1: blank)', [keep.patch, md1.patch, back.patch]);
  }
  {
    // members set either end or both, or follow the plan again; never someone who has not answered; ⚠ when off the plan
    const mo = tweak(DW, (d) => { d.responses['anjo-z5'] = R('maybe', 'LGA', '', '', { note: 'PTO pending', arrive_at: '' }); });
    const m = model(mo, { me: 'anjo-z5' }), o = (c, s, e, end, today) => M.ownDays(m, c, s, e, end, today || TODAY);
    const both = o('anjo-z5', '2026-11-05', '2026-11-08', null), arr = o('anjo-z5', '2026-11-07', '', 0), dep = o('anjo-z5', '', '2026-11-08', 1), fol = o('anjo-z5', '', '', null);
    check(both.why === '' && eq(both.patch, { available_from: '2026-11-05', available_to: '2026-11-08' }) && both.off && arr.why === '' && eq(arr.patch, { available_from: '2026-11-07' }) && arr.d2 === '2026-11-09' && !arr.off &&
      eq(dep.patch, { available_to: '2026-11-08' }) && dep.d1 === '2026-11-06' && eq(fol.patch, { available_from: '', available_to: '' }) && fol.why === '' && fol.d1 === '2026-11-06',
      'PIA-138 AC4 a member sets both ends, or the arrive end alone (the leave end still follows the plan), or the leave end alone, or follows the plan again; ⚠ when an end lands off the plan', [both, arr, dep]);
    check(o('momdad-k3', '2026-11-05', '2026-11-08', null).why === '' && o('anjo-z5', '2026-11-10', '', 0).why === 'order' && o('anjo-z5', '', '2026-11-05', 1).why === 'order' &&
      o('anjo-z5', '2026-10-16', '', 0).why === 'past' && M.ownDays(model(DW), 'anjo-z5', '2026-11-05', '2026-11-08', null, TODAY).why === 'answer' &&
      M.ownDays(model(tweak(DW, (d) => { d.responses['anjo-z5'] = R('out', 'LGA'); })), 'anjo-z5', '2026-11-05', '2026-11-08', null, TODAY).why === 'out' && M.ownDays(model(tg), 'PIA', '2026-11-21', '2026-11-22', null, TODAY).why === 'host',
      'an end that would cross the other (an arrival after the leave day) or fall before today is refused; nobody sets days for someone who has not answered (they answer first), who is out, or who hosts');
    check(M.ownDays(model(CY), 'ashwin-c3', '2026-12-20', '', 0, TODAY).why === '' && M.ownDays(model(tweak(CY, (d) => { d.responses['ashwin-c3'].available_to = ''; d.responses['ashwin-c3'].available_from = ''; })), 'ashwin-c3', '2026-12-20', '', 0, TODAY).why === 'partial',
      'an undated idea has no plan to follow: a member there sets both ends (one end alone, with nothing to follow, waits for the other)');
    // through the real Worker: a one-end write keeps the other end, the note, the airports and the 🎫
    const id = srv.seed(tweak(tg, (d) => { d.responses.LGA = R('in', 'LGA', '2026-11-24', '2026-11-29', { note: 'Arriving late', leave_from: 'ORD', booked: true }); }));
    const f0 = await srv.get(id), mm = model(f0, { me: 'LGA' }), ls = M.legShift(mm, 'LGA', 0, -1, TODAY);
    const r1 = await srv.send(M.respondRequest(f0, 'LGA', ls.patch, { by: 'self' })), x1 = (await srv.get(id)).responses.LGA;
    check(ls.why === '' && eq(ls.patch, { available_from: '2026-11-23' }) && srv.allOk(r1) && x1.available_from === '2026-11-23' && x1.available_to === '2026-11-29' && x1.note === 'Arriving late' && x1.leave_from === 'ORD' && x1.booked === true,
      'PIA-138 AC4 one leg at a time: −1 on her 🛬 makes 11/23 her own; the Worker keeps her 🛫 11/29, her note, her ORD leave and her 🎫', x1);
    const f1 = await srv.get(id), m1 = model(f1, { me: 'LGA' }), fl = M.ownDays(m1, 'LGA', '', '', null, TODAY);
    // PIA-151: booked, she never goes back to following the plan (the next plan move would carry a bought flight): her days stay hers
    check(fl.same && eq(fl.patch, { available_from: '2026-11-23', available_to: '2026-11-29' }),
      'PIA-151 booked, "follow the plan" changes nothing: her own 11/23–11/29 stay hers (No change)', fl.patch);
    const id2 = srv.seed(tweak(tg, (d) => { d.responses.LGA = R('in', 'LGA', '2026-11-23', '2026-11-29', { note: 'Arriving late', leave_from: 'ORD' }); }));
    const g1 = await srv.get(id2), gl = M.ownDays(model(g1, { me: 'LGA' }), 'LGA', '', '', null, TODAY);
    const r2 = await srv.send(M.respondRequest(g1, 'LGA', gl.patch, { by: 'self' })), x2 = (await srv.get(id2)).responses.LGA, m2 = model(await srv.get(id2), { me: 'LGA' });
    check(srv.allOk(r2) && x2.available_from === '' && x2.available_to === '' && mem(m2, 'LGA').d1 === m2.plan.s && mem(m2, 'LGA').d2 === m2.plan.e && x2.note === 'Arriving late' && x2.leave_from === 'ORD',
      'and, not booked, back to following the plan: both ends blank, her days are the plan\'s again (her note and her ORD leave stay)');
    check(M.legShift(m1, 'LGA', 1, 1, TODAY).why === '' && M.legShift(m1, 'LGA', 0, 7, TODAY).why === 'order' && M.legShift(model(DW), 'zz-none', 0, 1, TODAY) === null,
      'a leg shift that would cross the other end is refused (+7 on an arrival 6 days before the leave)');
  }
  {
    // daily presence never contradicts the heads ring, and P-day names exactly the heads the grid counts
    const docs = { tg, diwali: DW, tahoe: TH, m8: M8, undated: CY, laxLocal: LX, legacy: LEG };
    const bad = [];
    let days = 0;
    Object.keys(docs).forEach((k) => {
      const m = model(docs[k]), a = [m.span, m.range].filter(Boolean); if (!a.length) return;
      const s0 = a.map((x) => x.s).sort()[0], e0 = a.map((x) => x.e).sort().pop();
      eachDay(M.addD(s0, -2), M.addD(e0, 2), (day) => {
        days++;
        const p = M.dayPeople(m, day), heads = (cs) => cs.reduce((n, c) => n + mem(m, c).headcount, 0);
        const fill = M.dotsOn(m, day).filter((x) => x.kind === 'fill').length;
        if (p.n !== M.presentOn(m, day) || heads(p.there) !== p.n || p.n > m.headsIn || fill !== p.n || p.there.length + p.maybe.length + p.away.length !== m.members.length) bad.push(k + ' ' + day);
      });
    });
    check(bad.length === 0 && days > 150, 'PIA-138 AC6 on every day of every fixture (' + days + ' days), P-day\'s faces there add up to the grid\'s numeral (presentOn), which equals its filled dots and never passes the heads ring', bad.slice(0, 5));
    const tgm = model(tg), d21 = M.dayPeople(tgm, '2026-11-21');
    check(d21.n === 3 && eq(d21.there, ['PIA', 'LAX']) && eq(d21.away, ['LGA']) && tgm.headsIn === 4, 'Thanksgiving 11/21: Mom & Dad (×2) and Ashwin are there (3, while the ring reads 4/4); Anjo, who lands 11/24, is away');
    const m8 = model(M8), d12 = M.dayPeople(m8, '2026-12-12');
    check(d12.maybe.indexOf('anastasiakonstantinopoulou-x1') >= 0 && d12.there.indexOf('samlee-kz') < 0 && d12.away.indexOf('samlee-kz') >= 0, 'someone who said maybe is drawn as maybe (not counted there), someone out is away');
  }
  {
    // the best window reflects only people who set their own days; following the plan never counts
    const id = srv.seed(tweak(DW, (d) => { d.idea.notes = 'Lakshmi puja Sunday evening'; })), f0 = await srv.get(id), m0 = model(f0);
    const set = M.ownDays(model(f0, { me: 'momdad-k3' }), 'momdad-k3', '2026-11-12', '2026-11-16', null, TODAY);
    await srv.send(M.respondRequest(f0, 'momdad-k3', set.patch, { by: 'proxy' }));
    const f1 = await srv.get(id), m1 = model(f1);
    const f2 = tweak(f1, (d) => { d.responses['ashwin-p8'].status = 'maybe'; }), m2 = model(f2);
    await srv.send(M.respondRequest(f1, 'momdad-k3', M.ownDays(m1, 'momdad-k3', '', '', null, TODAY).patch, { by: 'proxy' }));
    const m3 = model(await srv.get(id));
    check(m0.best === null && !!m1.best && m1.best.s === '2026-11-12' && m1.best.e === '2026-11-15' && m1.best.full === 2 && eq(m2.best, m1.best) && m3.best === null && f1.responses['momdad-k3'].note === '📞',
      'PIA-138 AC6 nobody set days: no best window; Mom & Dad (×2) set 11/12–11/16 (by the organizer, 📞): best 11/12–11/15 for their 2 heads; Ashwin, who follows the plan, changes nothing; back to following: none again', [m0.best, m1.best, m3.best]);
  }
  {
    // what the date pill opens, for each role
    const role = (doc, o) => M.datesRole(model(doc, o));
    const inAnjo = tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA'); }), outAnjo = tweak(DW, (d) => { d.responses['anjo-z5'] = R('out', 'LGA'); });
    const past = tweak(DW, (d) => { d.idea.dates.departure = '2026-10-01'; d.idea.dates.return = '2026-10-04'; });
    check(role(DW, { me: 'ashwin-p8', hasEditKey: true }) === 'plan' && role(DW, { me: 'anjo-z5' }) === 'answer' && role(inAnjo, { me: 'anjo-z5' }) === 'mine' && role(outAnjo, { me: 'anjo-z5' }) === 'look' &&
      role(tg, { me: 'PIA' }) === 'look' && role(DW, {}) === 'look' && role(past, { me: 'ashwin-p8', hasEditKey: true }) === 'look' && role(LEG, { me: 'LAX', hasEditKey: true }) === 'mine' &&
      role(tweak(DW, (d) => { d.decision.stage = 'dropped'; }), { hasEditKey: true }) === 'look' && role(CY, { me: 'anjo-c4' }) === 'mine',
      'PIA-138 the date pill opens the plan for the organizer, my own days once I have answered (the answer row asks first otherwise), and the plan to read for a host, someone out, nobody, or a trip that is over, dropped or a v1 doc\'s guest');
  }

  // ═══ PIA-139 ════════════════════════════════════════════════════════════
  section('PIA-139 booking: one booked control, flight times for pickups, a stage that reaches Done by itself, 💵 only once everyone booked, calendars');
  {
    const lockAt = (d) => { d.decision = clone(CHOSEN); };
    const peoria = (d) => { d.idea.destination = { city: 'Peoria', airport: 'PIA' }; delete d.responses['momdad-k3']; };
    // AC4 the stage moves on from the booked flags alone, read the same by every phone; a 🎫 never locks out anyone who has not answered
    const id = srv.seed(tweak(DW, (d) => { peoria(d); lockAt(d); d.decision.chosen.airport = 'PIA'; d.decision.chosen.city = 'Peoria'; }));
    const phones = async () => {
      const o = await srv.get(id, KEY), g = await srv.get(id);
      const ms = [model(o, { me: 'ashwin-p8', hasEditKey: true, hasToken: true }), model(g, { me: 'anjo-z5' }), model(g, { me: 'momdad-k3' }), model(g, {})];
      return ms.map((m) => m.stage);
    };
    const s0 = await phones();
    await srv.send(M.bookedRequests(await srv.get(id), 'ashwin-p8', true, { by: 'self' }));
    const s1 = await phones();
    const ans = await srv.send(M.respondRequest(await srv.get(id), 'anjo-z5', { status: 'maybe' }, { by: 'self' }));
    const s2 = await phones();
    // the organizer marks Anjo (she said maybe) booked: one /idea/booked
    const tk = M.bookedRequests(await srv.get(id), 'anjo-z5', true, { by: 'proxy' });
    await srv.send(tk);
    const s3 = await phones();
    const host = await srv.send(M.respondRequest(await srv.get(id), 'momdad-k3', { status: 'in' }, { by: 'self' }));
    const s4 = await phones(), fin = await srv.get(id);
    check(eq(s0, ['set', 'set', 'set', 'set']) && eq(s1, ['booking', 'booking', 'booking', 'booking']) && eq(s3, ['done', 'done', 'done', 'done']) && eq(s4, s3),
      'PIA-139 AC4 through the real Worker: 🔒 Dates set, then Ashwin\'s 🎫 makes it 🎫 Booking, and Anjo\'s makes it 🏁 Done, the same on the organizer\'s, Anjo\'s, the host\'s and a faceless phone', { s0, s1, s3, s4 });
    check(srv.allOk(ans) && eq(s2, s1) && tk.length === 1 && srv.allOk(host) && fin.responses['momdad-k3'].status === 'in' && fin.decision.stage === 'chosen' &&
      fin.responses['ashwin-p8'].booked && fin.responses['anjo-z5'].booked && fin.responses['anjo-z5'].status === 'maybe' && !model(fin).closed,
      'PIA-139 AC4 a 🎫 never locks anyone out: while Booking, Anjo (not answered) still answers Maybe; at 🏁 Done the hosts (not answered) still answer In; the record is still open, the 🎫s kept', { ans: ans.map((r) => r.status), host: host.map((r) => r.status) });
    // AC3 the organizer marks someone who has not answered: recorded in first (📞), then booked
    const wid = srv.seed(tweak(DW, lockAt));
    const wq = M.bookedRequests(await srv.get(wid), 'anjo-z5', true, { by: 'proxy' }), wres = await srv.send(wq), wd = await srv.get(wid);
    const om = model(await srv.get(wid, KEY), { me: 'ashwin-p8', hasEditKey: true });
    const out = srv.seed(tweak(DW, (d) => { lockAt(d); d.responses['anjo-z5'] = R('out', 'LGA', '', '', { note: 'Work trip' }); }));
    const oq = M.bookedRequests(await srv.get(out), 'anjo-z5', true, { by: 'proxy' }), ores = await srv.send(oq), od = await srv.get(out);
    check(eq(wq.map((q) => q.path.split('?')[0]), ['/idea/respond', '/idea/booked']) && wq[0].body.status === 'in' && wq[0].body.note === '📞' && srv.allOk(wres) &&
      wd.responses['anjo-z5'].status === 'in' && wd.responses['anjo-z5'].booked === true && wd.responses['anjo-z5'].note === '📞' && om.stage === 'booking' &&
      srv.allOk(ores) && od.responses['anjo-z5'].status === 'in' && od.responses['anjo-z5'].booked && od.responses['anjo-z5'].note === '📞 Work trip',
      'PIA-139 AC3 the organizer marks Anjo booked before she answered: one complete In (📞) first, then the 🎫, through the Worker; marking someone who said Out does the same and keeps her note', wq.map((q) => q.path));
    check(eq(M.bookToggle(model(tweak(DW, lockAt), { me: 'ashwin-p8', hasEditKey: true }), 'anjo-z5'), { on: false, confirm: true }) &&
      M.bookToggle(model(tweak(DW, lockAt), { me: 'ashwin-p8', hasEditKey: true }), 'momdad-k3').confirm === false &&
      M.bookToggle(model(tweak(DW, (d) => { peoria(d); lockAt(d); }), { me: 'ashwin-p8', hasEditKey: true }), 'momdad-k3') === null && M.bookToggle(model(tweak(DW, lockAt), { me: 'anjo-z5' }), 'momdad-k3') === null,
      'PIA-139 AC3 the board\'s 🎫 is the organizer\'s only: a confirming tap for someone not answered (one tap for someone in), none on a host, none on a guest\'s phone');

    // AC1 the booking slot: Book and 🎫 together once the dates are set, Flighty after
    const slot = (doc, me, code, over) => { const s = M.bookSlot(model(doc, Object.assign({ me }, over || {})), code, TODAY); return { slot: s.slot, tk: s.tk }; };
    const lk = tweak(DW, (d) => { lockAt(d); d.responses['anjo-z5'] = R('in', 'LGA'); });
    const lkB = tweak(lk, (d) => { d.responses['anjo-z5'].booked = true; });
    const ORGK = { hasEditKey: true };
    // (PIA-151: before the 🔒 her flight section offers [✈ Book ↗ | 🎫] too once she has answered, her days being known and ahead;
    // before she answers, her ✈↗ alone, as before)
    check(eq(slot(DW, 'anjo-z5', 'anjo-z5'), { slot: 'gf', tk: '' }) && eq(slot(tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA'); }), 'anjo-z5', 'anjo-z5'), { slot: 'book', tk: 'self' }) &&
      eq(slot(lk, 'anjo-z5', 'anjo-z5'), { slot: 'book', tk: 'self' }) && eq(slot(lkB, 'anjo-z5', 'anjo-z5'), { slot: 'booked', tk: 'self' }) &&
      eq(slot(lk, 'ashwin-p8', 'anjo-z5', ORGK), { slot: 'book', tk: 'org' }) && eq(slot(lkB, 'ashwin-p8', 'anjo-z5', ORGK), { slot: 'booked', tk: 'org' }) &&
      eq(slot(lk, 'momdad-k3', 'anjo-z5'), { slot: 'gf', tk: '' }) && eq(slot(tweak(DW, (d) => { peoria(d); lockAt(d); }), 'momdad-k3', 'momdad-k3'), { slot: '', tk: '' }) &&
      eq(slot(tweak(lkB, (d) => { d.decision.stage = 'booked'; d.decision.actual_total = 900; }), 'anjo-z5', 'anjo-z5'), { slot: 'booked', tk: '' }) &&
      eq(slot(tweak(lk, (d) => { d.idea.dates.departure = '2026-10-10'; d.idea.dates.return = '2026-10-20'; d.decision.chosen.departure = '2026-10-10'; d.decision.chosen.return = '2026-10-20'; }), 'anjo-z5', 'anjo-z5'), { slot: 'gf', tk: '' }),
      'PIA-139 AC1 one slot rule: before 🔒 their ✈↗ alone; once 🔒 [✈ Book ↗ | 🎫] (mine, or the organizer\'s for someone); after the 🎫 [✈⏱↗ | 🎫]; a host has none; a paid trip keeps Flighty with no 🎫 to take away; days already begun book nothing');
    const lkH = M.handoffs(model(lkB, { me: 'anjo-z5' }), 'anjo-z5', ctx()), lkH0 = M.handoffs(model(lk, { me: 'anjo-z5' }), 'anjo-z5', ctx());
    check(lkH.flighty && lkH.flighty.href === M.FLIGHTY_URL && lkH.flighty.target === '_blank' && !lkH0.flighty && !!lkH0.gf && M.primaryAction(model(lkB, { me: 'anjo-z5' }), TODAY) === 'times',
      'PIA-139 AC1 after her 🎫 the slot hands off to Flighty (a new tab); before it, Google Flights (PIA-154: the trip view\'s primary is 🛬 Landing time until she records it)');

    // AC2 booked times: typed, recorded by her or by the organizer for her, kept in the note's prefix without erasing it
    check(eq(['15:10', '1510', '0905', ' 07:45 ', '0:30', '', '24:00', '15:60', '15:1', 'abc', '12345', '15', '13:00pm'].map((s) => M.typedTime(s)), ['15:10', '15:10', '09:05', '07:45', '00:30', '', null, null, null, null, null, null, null]),
      'PIA-139 AC2 a typed time reads as HH:MM (15:10, 1510, 0905, 0:30); blank clears it; anything else is not a time');
    // a 12-hour reader's 3:10 PM never silently becomes 03:10: an hour 1–12 with no leading 0 and no am / pm is not a time until
    // its half is picked (the two readings differ in ☀ / 🌃), and an am / pm typed with it decides
    check(eq(['310', '6:05', '905', '1105', '12:30'].map((s) => M.typedTime(s)), [null, null, null, null, null]) &&
      eq(M.timeHalves('310'), { am: '03:10', pm: '15:10' }) && eq(M.timeHalves('6:05'), { am: '06:05', pm: '18:05' }) && eq(M.timeHalves('12:30'), { am: '00:30', pm: '12:30' }) &&
      M.timeHalves('1510') === null && M.timeHalves('0310') === null && M.timeHalves('6:05 pm') === null && M.timeHalves('') === null && M.timeHalves('25:99') === null &&
      M.typedTime('310', 'pm') === '15:10' && M.typedTime('310', 'am') === '03:10' && M.typedTime('12:30', 'am') === '00:30' && M.typedTime('1510', 'am') === '15:10' &&
      eq(['6:05 pm', '6:05pm', '6pm', '3PM', '11:05a', '11:05 a.m.', '12am', '12:15 pm'].map((s) => M.typedTime(s)), ['18:05', '18:05', '18:00', '15:00', '11:05', '11:05', '00:00', '12:15']) &&
      ['310', '905', '1105', '12:30', '6:05', '1:00', '5:59'].every((s) => { const h = M.timeHalves(s); return M.dayPart(h.am) !== M.dayPart(h.pm); }) &&
      eq(['05:59', '06:00', '17:59', '18:00', '00:30', '12:00', 'x'].map(M.dayPart), ['night', 'day', 'day', 'night', 'night', 'day', '']),
      'PIA-139 AC2 "310" and "6:05" are never saved as 03:10 / 06:05: they wait for ☀ / 🌃 (03:10 or 15:10, 06:05 or 18:05; the two readings never share a glyph); "6:05 pm" is 18:05, "11:05a" 11:05, "0310" 03:10');
    const tId = srv.seed(tweak(DW, (d) => { peoria(d); lockAt(d); d.responses['anjo-z5'] = R('in', 'EWR', '2026-11-05', '2026-11-09', { note: '📞 Taking the red-eye', leave_from: 'ORD', booked: true, booked_at: '2026-10-16T00:00:00.000Z' }); }));
    const t0 = await srv.get(tId), mine = model(t0, { me: 'anjo-z5' }), orgM = model(await srv.get(tId, KEY), { me: 'ashwin-p8', hasEditKey: true }), guestM = model(t0, { me: 'ashwin-p8' });
    check(M.timesBy(mine, 'anjo-z5') === 'self' && M.timesBy(orgM, 'anjo-z5') === 'proxy' && M.timesBy(guestM, 'anjo-z5') === '' && M.timesBy(mine, 'ashwin-p8') === '' &&
      M.timesBy(orgM, 'ashwin-p8') === '' && M.timesBy(model(tweak(t0, (d) => { d.decision.stage = 'booked'; d.decision.actual_total = 1; }), { me: 'anjo-z5' }), 'anjo-z5') === '' &&
      M.timesBy(model(tweak(DW, (d) => { peoria(d); d.responses['momdad-k3'] = R('in', 'PIA', '', '', { booked: true }); }), { me: 'momdad-k3' }), 'momdad-k3') === '',
      'PIA-139 AC2 who records booked times: the traveler once booked (self), the organizer for her (proxy); nobody for someone not booked, a host, on a paid trip, or on a guest\'s phone looking at someone else');
    const tq = M.timesRequest(t0, 'anjo-z5', '15:10', '18:05', 'self'), tRes = await srv.send(tq), t1 = await srv.get(tId);
    const r1 = t1.responses['anjo-z5'];
    check(srv.allOk(tRes) && r1.note === '🛬15:10 🛫18:05 Taking the red-eye' && r1.available_from === '2026-11-05' && r1.available_to === '2026-11-09' && r1.origin === 'EWR' && r1.leave_from === 'ORD' && r1.booked === true && r1.status === 'in' &&
      !('arrive_at' in tq.body) && !('leave_from' in tq.body),
      'PIA-139 AC2 her own 🛬 15:10 / 🛫 18:05 go as the note\'s prefixes in one complete answer through the Worker: her note\'s text, own days, EWR, the ORD leave and her 🎫 all kept (her own write clears 📞)', r1);
    const pk1 = (doc, ctxOver) => M.pickups(model(doc, ctxOver), {}, NOW, false);
    const host1 = pk1(t1, { me: 'momdad-k3' }), guest1 = pk1(t1, { me: 'ashwin-p8' });
    const aChip = (ln) => (ln.PIA || []).find((c) => c.kind === 'arr' && c.codes.indexOf('anjo-z5') >= 0), dChip = (ln) => (ln.ORD || []).find((c) => c.kind === 'dep' && c.codes.indexOf('anjo-z5') >= 0);
    check(aChip(host1).time === '15:10' && aChip(host1).date === '2026-11-05' && !aChip(host1).pred && dChip(host1).time === '18:05' && dChip(host1).date === '2026-11-09' && eq(aChip(guest1), aChip(host1)) && eq(dChip(guest1), dChip(host1)) &&
      mem(model(t1, { me: 'momdad-k3' }), 'anjo-z5').noteText === 'Taking the red-eye',
      'PIA-139 AC2 the times reach everyone\'s pickup chips from the record: the host\'s phone and another guest\'s both read 🛬 PIA 11/5 15:10 and 🛫 ORD 11/9 18:05, and her note still reads "Taking the red-eye"');
    const pq = M.timesRequest(await srv.get(tId), 'anjo-z5', '16:40', undefined, 'proxy'), pRes = await srv.send(pq), t2 = await srv.get(tId);
    const t2b = tweak(t2, (d) => { d.responses['anjo-z5'].note = '📞 ' + d.responses['anjo-z5'].note; });
    const keepCalled = M.timesRequest(t2b, 'anjo-z5', undefined, '', 'proxy');
    check(srv.allOk(pRes) && t2.responses['anjo-z5'].note === '🛬16:40 🛫18:05 Taking the red-eye' && keepCalled.body.note === '📞 🛬16:40 Taking the red-eye' &&
      M.timesRequest(t2, 'anjo-z5', '16:40', '18:05', 'self') === null && M.timesRequest(t2, 'anjo-z5', '25:00', undefined, 'self') === null && M.timesRequest(t2, 'ashwin-p8', '10:00', undefined, 'self') === null,
      'PIA-139 AC2 the organizer changes only her 🛬 (16:40; 🛫 stays); his write keeps a 📞 as it reads, and a blank clears one time; no change, a bad time or someone not booked builds nothing');
    const room = M.noteRoom(false, '', ''), longId = srv.seed(tweak(t2, (d) => { d.responses['anjo-z5'].note = 'z'.repeat(room); }));
    const longQ = M.timesRequest(await srv.get(longId), 'anjo-z5', '15:10', '', 'self');
    const shortId = srv.seed(tweak(t2, (d) => { d.responses['anjo-z5'].note = 'z'.repeat(room - 8); }));
    const shortQ = M.timesRequest(await srv.get(shortId), 'anjo-z5', '15:10', '', 'self'), shortRes = await srv.send(shortQ);
    check(longQ === null && srv.allOk(shortRes) && (await srv.get(shortId)).responses['anjo-z5'].note === '🛬15:10 ' + 'z'.repeat(room - 8),
      'PIA-139 AC2 times never cut a note short: a 280-character note leaves no room, so nothing is built; one with room takes 🛬15:10 and keeps every character');
    const paidT = srv.seed(tweak(t2, (d) => { d.decision.stage = 'booked'; d.decision.actual_total = 900; }));
    const late = await srv.send(M.respondRequest(tweak(await srv.get(paidT), (d) => { d.decision.stage = 'chosen'; }), 'anjo-z5', { arrTime: '11:00' }, { by: 'self' }));
    check(late[0].status === 409 && M.timesRequest(await srv.get(paidT), 'anjo-z5', '11:00', undefined, 'self') === null,
      'once 💵 is recorded the Worker takes no answer (409), and times are not offered then (timesBy is nobody on a closed trip; see Owed)');
    // taking the 🎫 back clears the times that went with it (one complete answer first, then the 🎫), so no pickup outlives it
    const unQ = M.bookedRequests(await srv.get(tId), 'anjo-z5', false, { by: 'self' }), unRes = await srv.send(unQ), t3 = await srv.get(tId), r3 = t3.responses['anjo-z5'];
    const plainUn = M.bookedRequests(tweak(t3, (d) => { d.responses['anjo-z5'].booked = true; }), 'anjo-z5', false, { by: 'self' });
    const orgUn = M.bookedRequests(tweak(t2b, () => {}), 'anjo-z5', false, { by: 'proxy' });
    check(eq(unQ.map((q) => q.path.split('?')[0]), ['/idea/respond', '/idea/booked']) && srv.allOk(unRes) && r3.note === 'Taking the red-eye' && r3.booked === false && r3.status === 'in' &&
      r3.available_from === '2026-11-05' && r3.leave_from === 'ORD' && r3.origin === 'EWR' && !aChip(pk1(t3, { me: 'momdad-k3' })).time && !dChip(pk1(t3, { me: 'momdad-k3' })).time &&
      eq(plainUn.map((q) => q.path.split('?')[0]), ['/idea/booked']) && orgUn[0].body.note === '📞 Taking the red-eye',
      'PIA-139 her 🎫 taken back: one complete answer clears 🛬 / 🛫 (her note, days, EWR and the ORD leave kept), then the 🎫 goes; the hosts\' chips no longer show a time. With no times only the 🎫 goes; the organizer\'s keeps 📞', r3);
    // a time left in a note without a 🎫 (an older write) is never drawn as a pickup; nor is a cached offer's time that is not HH:MM
    const stale = pk1(tweak(t3, (d) => { d.responses['anjo-z5'].note = '🛬09:00 🛫21:00'; }), { me: 'momdad-k3' });
    const hk = mem(model(t3, ORG), 'anjo-z5').keys[0].key, hostile = {}, stamp = {};
    hostile[hk] = { p: 300, f: at(30), ar: '<img src=x onerror=alert(1)>', off: [{ ar: '"><b>' }] }; stamp[hk] = { p: 300, f: at(30), off: [{ ar: '2026-11-05 15:10' }] };
    const hc = aChip(M.pickups(model(t3, Object.assign({ fares: hostile }, ORG)), hostile, NOW, false)), sc = aChip(M.pickups(model(t3, Object.assign({ fares: stamp }, ORG)), stamp, NOW, false));
    check(!aChip(stale).time && !dChip(stale).time && hc.time === '' && !hc.pred && sc.time === '15:10' && sc.pred &&
      eq(['<img src=x onerror=alert(1)>', '2026-11-05 15:10', '2026-11-05T07:05', '15:10', '25:00', '1510', 3, null].map(M.cachedTime), ['', '15:10', '07:05', '15:10', '', '', '', '']),
      'PIA-139 a 🛬 / 🛫 left in an unbooked traveler\'s note is never drawn; a cached offer\'s time is drawn only as HH:MM (a "YYYY-MM-DD HH:MM" stamp reads as its time), so markup or junk never reaches a chip or a ⏱ run');

    // AC5 💵 only once every traveler has booked, on the organizer's token phone
    const pc = (doc, over) => M.paidCheck(model(doc, over));
    const ORGT = { me: 'ashwin-p8', hasEditKey: true, hasToken: true };
    const doneL = tweak(DW, (d) => { lockAt(d); d.responses['momdad-k3'].booked = true; d.responses['ashwin-p8'].booked = true; d.responses['anjo-z5'] = R('in', 'LGA', '', '', { booked: true }); });
    const doneHostWait = tweak(DW, (d) => { peoria(d); lockAt(d); d.responses['ashwin-p8'].booked = true; d.responses['anjo-z5'] = R('in', 'LGA', '', '', { booked: true }); });
    const NT = ['momdad-k3', 'ashwin-p8', 'anjo-z5'];   // booked with no 🛬 time recorded yet
    // (PIA-157: + norides, the travelers no one drives yet on a run still ahead: none here, no day given)
    check(eq(pc(tweak(DW, lockAt), ORGT), { why: 'unbooked', unbooked: ['momdad-k3', 'ashwin-p8', 'anjo-z5'], unanswered: ['anjo-z5'], notimes: [], again: false, norides: [] }) &&
      pc(tweak(doneL, (d) => { d.responses['anjo-z5'].booked = false; }), ORGT).why === 'unbooked' && eq(pc(tweak(doneL, (d) => { d.responses['anjo-z5'].booked = false; }), ORGT).unbooked, ['anjo-z5']) &&
      eq(pc(doneL, ORGT), { why: '', unbooked: [], unanswered: [], notimes: NT, again: false, norides: [] }) && eq(pc(doneHostWait, ORGT), { why: '', unbooked: [], unanswered: ['momdad-k3'], notimes: ['ashwin-p8', 'anjo-z5'], again: false, norides: [] }) &&
      eq(pc(tweak(doneL, (d) => { d.responses['anjo-z5'].note = '🛬15:10'; d.responses['ashwin-p8'].note = '🛫18:00'; }), ORGT).notimes, ['momdad-k3', 'ashwin-p8']) &&
      pc(doneL, { me: 'ashwin-p8', hasEditKey: true }).why === 'token' && pc(doneL, { me: 'anjo-z5', hasToken: true }).why === 'org' &&
      pc(tweak(doneL, (d) => { d.decision.stage = 'booked'; d.decision.actual_total = 905; }), ORGT).why === 'closed' && pc(tweak(doneL, (d) => { d.decision.stage = 'dropped'; }), ORGT).why === 'closed' &&
      pc(tweak(doneL, (d) => { d.decision.stage = 'booked'; d.decision.actual_total = 905; }), ORGT).again === true && pc(tweak(doneL, (d) => { d.decision.stage = 'dropped'; d.decision.actual_total = 905; }), ORGT).again === false &&
      pc(tweak(doneL, (d) => { d.decision.stage = 'booked'; d.decision.actual_total = 905; }), { me: 'ashwin-p8', hasEditKey: true }).again === false &&
      pc(tweak(LX, (d) => { ['priya-x1', 'leo-x4', 'anjo-x5'].forEach((c) => { d.responses[c] = R('out', ''); }); }), { hasEditKey: true, hasToken: true }).why === 'nobody' && pc(LEG, { me: 'LAX', hasEditKey: true, hasToken: true }).why === 'legacy',
      'PIA-139 AC5 💵 can be recorded only at 🏁 Done (every traveler booked; the unbooked are listed otherwise), only on the organizer\'s phone with the token, never twice or on a dropped, all-host or v1 trip; the hosts still unanswered are named (paying closes their answers)');
    const pdId = srv.seed(doneL), pdFresh = await srv.get(pdId, KEY);
    const pdReq = M.organizerEdit(pdFresh, KEY, { decision: { stage: 'booked', actual_total: M.typedPaid('$1,490') } }), pdRes = await srv.send(pdReq), pdDoc = await srv.get(pdId, KEY), pdGuest = await srv.get(pdId);
    check(pdReq.length === 1 && eq(pdReq[0].body.decision, { stage: 'booked', actual_total: 1490 }) && srv.allOk(pdRes) && pdDoc.decision.stage === 'booked' && pdDoc.decision.actual_total === 1490 &&
      model(pdDoc, ORGT).paid === 1490 && model(pdGuest, { me: 'anjo-z5' }).paid === null && model(pdGuest).closed,
      'PIA-139 AC5 at 🏁 Done on a 🔒 trip, 💵 $1,490 is one update {stage booked, actual_total 1490}; the organizer\'s record reads it, the guest view never carries the amount');
    const upId = srv.seed(tweak(doneL, (d) => { d.decision = { stage: 'proposed', chosen: null, chosen_at: null, estimate_total: null, actual_total: null, booked_at: null, delta_pct: null }; }));
    const upReq = M.organizerEdit(await srv.get(upId, KEY), KEY, { decision: { stage: 'booked', actual_total: 905 } }), upRes = await srv.send(upReq), upDoc = await srv.get(upId, KEY);
    check(upReq.length === 2 && eq(upReq[0].body.decision, { stage: 'chosen', chosen: { airport: 'RDU', city: 'Raleigh', departure: '2026-11-06', return: '2026-11-09' } }) && eq(upReq[1].body.decision, { stage: 'booked', actual_total: 905 }) &&
      srv.allOk(upRes) && upDoc.decision.stage === 'booked' && upDoc.decision.actual_total === 905 && upDoc.decision.chosen.departure === '2026-11-06',
      'PIA-139 AC5 on a trip whose dates were never 🔒 (or were unlocked), 💵 chooses the plan first, then records 905: two updates the Worker takes in order');
    const halfId = srv.seed(tweak(doneL, (d) => { d.responses['anjo-z5'].booked = false; }));
    const halfFresh = await srv.get(halfId, KEY);
    check(M.organizerEdit(halfFresh, KEY, { decision: { stage: 'booked', actual_total: 905 } }) === null && M.paidHeld(halfFresh) === 'unbooked' && M.paidHeld(pdFresh) === '' && M.paidHeld(pdDoc) === 'closed' &&
      M.updateRequest(pdDoc, KEY, { decision: { stage: 'booked', actual_total: 905 } }) !== null &&
      M.organizerEdit(tweak(pdDoc, (d) => { d.decision.stage = 'dropped'; }), KEY, { decision: { stage: 'booked', actual_total: 1490 } }) !== null,
      'PIA-139 AC5 on the record it is sent against: a 🎫 taken away meanwhile builds no 💵 (paidHeld unbooked), a paid record is closed; ↩ restoring a dropped paid trip still re-records its amount');
    // a typo in 💵 can be fixed: the amount entered again on a paid trip is one more booked update the Worker takes
    const agQ = M.organizerEdit(pdDoc, KEY, { decision: { stage: 'booked', actual_total: M.typedPaid('1,940') } }), agRes = await srv.send(agQ), agDoc = await srv.get(pdId, KEY);
    check(agQ.length === 1 && eq(agQ[0].body.decision, { stage: 'booked', actual_total: 1940 }) && srv.allOk(agRes) && agDoc.decision.stage === 'booked' && agDoc.decision.actual_total === 1940 &&
      M.paidHeld(pdDoc, true) === '' && M.paidHeld(tweak(pdDoc, (d) => { d.decision.stage = 'dropped'; }), true) === 'closed' && M.paidHeld(tweak(pdDoc, (d) => { d.decision.stage = 'chosen'; }), true) === 'closed',
      'PIA-139 AC5 💵 entered again on a paid trip (149 meant 1,490): one update {booked, 1940} through the Worker; held back once the trip was dropped or reopened meanwhile');
    check(eq(['905', '$1,490', '1490.40', '0.6', ' 12 ', '', '0', '-5', '1e3', 'abc', '1000000', '12.345'].map(M.typedPaid), [905, 1490, 1490, 1, 12, null, null, null, null, null, null, null]),
      'PIA-139 AC5 the 💵 amount reads as whole dollars ($1,490 → 1490); nothing under $1 or from $1,000,000, and no other text');

    // AC6 at any dated stage the trip can go into a calendar: tentative before the dates are set, only the guest link inside
    const stages = [['idea', tweak(DW, (d) => { d.responses = {}; })], ['asking', DW], ['set', tweak(DW, lockAt)], ['booking', tweak(DW, (d) => { lockAt(d); d.responses['ashwin-p8'].booked = true; })], ['done', doneL]];
    const calRows = stages.map(([st, doc]) => { const m = model(doc, { me: 'anjo-z5' }), c = M.handoffs(m, '', ctx()).calendar; return { st, stage: m.stage, tentative: c && c.tentative, ok: !!c && c.details === M.WORKER_URL + '/i/' + DW.id && c.google.href.indexOf(KEY) < 0 && c.ics.text.indexOf('#k=') < 0 }; });
    check(calRows.every((r) => r.ok && r.stage === r.st) && eq(calRows.map((r) => r.tentative), [true, true, false, false, false]) &&
      M.handoffs(model(CY, { me: 'momdad-c1' }), '', ctx()).calendar === null && M.handoffs(model(tweak(DW, (d) => { d.decision.stage = 'dropped'; }), { me: 'anjo-z5' }), '', ctx()).calendar === null &&
      M.handoffs(model(tweak(CY, (d) => { d.responses['ashwin-c3'] = R('in', 'LAX', '2026-12-19', '2026-12-26'); }), { me: 'ashwin-c3' }), '', ctx()).calendar === null &&
      M.calendarAdd(model(tweak(CY, (d) => { d.responses['ashwin-c3'] = R('in', 'LAX', '2026-12-19', '2026-12-26'); }), { me: 'ashwin-c3' }), ctx()) === null,
      'PIA-139 AC6 calendar-plus at every dated stage (💡 🗳 🔒 🎫 🏁): tentative ("? ", STATUS:TENTATIVE) until 🔒, set from then on; the event carries only the guest link; none for an undated idea (even for someone with their own 12/19–12/26 window) or a dropped trip', calRows);
  }

  // ═══ PIA-140 ════════════════════════════════════════════════════════════
  section('PIA-140 prices: one honest total from real fares; each search exactly the Worker\'s; caps, locks and v1\'s stores in v1\'s formats');
  {
    const SERP = fx('serp-flights.json');
    const H1 = 36e5;
    // AC1 the one pricing function: the trip's legs, a traveler's ±1 days and the cheapest-week bars price the same keys the same way
    const tgP = (fares, over) => model(tg, Object.assign({ me: 'LAX', hasEditKey: true, hasToken: true, fares: fares || {} }, over || {}));
    const ash = mem(tgP(), 'LAX'), anjo = mem(tgP(), 'LGA');
    const f0 = {}; f0[ash.keys[0].key] = { p: 305, f: NOW - 3 * H1 }; f0[ash.keys[1].key] = { p: 200, f: NOW - 3 * H1 };
    const ep = M.endPrices(tgP(f0), 'LAX', 0, f0, NOW, TODAY);
    check(!!ep && eq(ep.rows.map((r) => [r.k, r.day, r.kind]), [[-1, '2026-11-19', 'in'], [0, '2026-11-20', 'in'], [1, '2026-11-21', 'in']]) && ep.rows[1].key === ash.keys[0].key && ep.rows[1].p === 305 &&
      ep.rows[1].p === tgP(f0).price.per.LAX.legs[0].p && eq(ep.need, ['2|LAX|PIA|2026-11-19||1', '2|LAX|PIA|2026-11-21||1']),
      'PIA-140 AC6 one end ±1 day: the day before, their day and the day after (open-jaw: that end\'s one-way only); their day is the very leg the total prices, the ±1 legs are what 🔍2 searches', ep);
    const f1 = Object.assign({}, f0, { '2|LAX|PIA|2026-11-19||1': { p: 280, f: NOW - H1 }, '2|LAX|PIA|2026-11-21||1': { p: 330, f: NOW - H1 } });
    const ep1 = M.endPrices(tgP(f1), 'LAX', 0, f1, NOW, TODAY), ep2 = M.endPrices(tgP(f1), 'LAX', 1, f1, NOW, TODAY);
    check(ep1.need.length === 0 && eq(ep1.rows.map((r) => !!r.star), [true, false, false]) && ep2.rows.every((r) => r.kind === 'out') && ep2.rows[1].p === 200 && ep2.need.length === 2,
      'PIA-140 AC6 once priced, ★ marks the cheapest day (11/19 $280); the leave end prices the way home (ORD→LAX) ±1');
    const dwm = model(DW, { me: 'ashwin-p8', hasEditKey: true, hasToken: true }), dwRt = M.endPrices(dwm, 'ashwin-p8', 1, {}, NOW, TODAY);
    check(dwRt && dwRt.rows.every((r) => r.kind === 'rt') && dwRt.rows[0].key === '1|LAX|RDU|2026-11-06|2026-11-08|1' && dwRt.rows[2].key === '1|LAX|RDU|2026-11-06|2026-11-10|1' &&
      M.endPrices(model(DW, { me: 'anjo-z5', hasEditKey: true, hasToken: true }), 'momdad-k3', 0, {}, NOW, TODAY).rows[0].key === '1|PIA|RDU|2026-11-05|2026-11-09|2',
      'PIA-140 AC6 a round trip\'s end ±1 is the round trip with that day moved (Mom & Dad: still 2 adults)');
    const pastEnd = tweak(DW, (d) => { d.idea.dates.departure = '2026-10-18'; d.idea.dates.return = '2026-10-20'; });
    const pe = M.endPrices(model(pastEnd, { hasEditKey: true, hasToken: true }), 'ashwin-p8', 0, {}, NOW, '2026-10-18');
    check(pe && eq(pe.rows.map((r) => r.k), [0, 1]) && M.endPrices(model(DW, ORG), 'momdad-k3', 0, {}, NOW, TODAY) && M.endPrices(model(tg, ORG), 'PIA', 0, {}, NOW, TODAY) === null,
      'PIA-140 AC6 a day before today is never offered (or searched); a host has no end to price');
    // AC2 what a priced leg says, from data already paid for
    const e = M.fareFromSerp(SERP, NOW - 2 * H1, null);
    check(e.p === 305 && e.f === NOW - 2 * H1 && !e.none && e.lvl === 'low' && eq(e.typ, [330, 470]) && e.off.length === 3 && eq(e.off.map((o) => o.p), [305, 318, 341]) &&
      e.off[0].d === 'BUR' && e.off[0].a === 'PIA' && e.off[0].dt === '2026-11-20 07:15' && e.off[0].ar === '2026-11-20 15:35' && e.off[0].s === 1 && e.prev === undefined,
      'PIA-140 AC2 a SerpAPI reply keeps the cheapest real fare ($305), when SerpAPI was called, Google\'s level and typical range, and the 3 cheapest offers (airports, times as HH:MM, stops)', e);
    const facts = M.fareFacts(e, 'in', 'LAX', NOW);
    check(facts.age === 2 * H1 && facts.lvl === 1 && facts.stops === 1 && facts.win === 'BUR' && facts.delta === null && M.fareFacts(e, 'in', 'BUR', NOW).win === '' &&
      M.fareFacts(Object.assign({}, e, { off: [{ p: 200, d: 'ORD', a: 'BUR', s: 0 }] }), 'out', 'LAX', NOW).win === 'BUR' && M.fareFacts({ p: null, none: true, f: NOW }, 'in', 'LAX', NOW) === null,
      'PIA-140 AC2 a leg\'s facts: its age, Google\'s level (low = 1 of 3), its stops, and the airport that won when it is not their own (in: where it leaves; home: where it lands)');
    // AC1 a leg shows the price the total adds: fareFacts and ▼ / ▲ read a cached fare through the same rule as priceRows (legTotal)
    const fx2 = {}; fx2[ash.keys[0].key] = M.fareFromSerp(SERP, NOW - H1, { p: 340, f: NOW - 30 * H1 }); fx2[ash.keys[1].key] = { p: 200, f: NOW - H1, prev: 210, pf: NOW - 40 * H1 };
    const pr2 = tgP(fx2).price.per.LAX.legs;
    check(pr2.every((l) => M.fareFacts(l.f, l.kind, 'LAX', NOW).p === l.p) && M.prevDelta(fx2[ash.keys[0].key]) === -35 && M.prevDelta(fx2[ash.keys[1].key]) === -10 &&
      M.priceDelta(tgP(fx2).price) === -45 && M.priceDelta(tgP(Object.assign({ [anjo.keys[0].key]: { p: 150, f: NOW - H1 } }, fx2)).price) === null && M.prevDelta({ p: null, none: true, prev: 300 }) === null,
      'PIA-140 AC1 a leg shows exactly the price the total adds for it (fareFacts and ▼ / ▲ go through priceRows\' own rule): ▼$35 and ▼$10, the total ▼$45; once Anjo\'s leg is priced with no earlier price for it, the total shows no change');
    const hostile = M.fareFromSerp({ best_flights: [{ price: 99.6, flights: [{ departure_airport: { id: '<b>x</b>', time: '"><img src=x>' }, arrival_airport: { id: 'pia', time: '2026-11-20 25:00' } }] }], price_insights: { price_level: '<script>', typical_price_range: ['a', 3] } }, NOW, null);
    check(hostile.p === 100 && hostile.off[0].d === '' && hostile.off[0].a === 'PIA' && hostile.off[0].dt === '' && hostile.off[0].ar === '' && hostile.lvl === '' && hostile.typ === null,
      'PIA-140 AC2 nothing from a reply reaches the cache unchecked: airports are codes or nothing, times are times or nothing, the level is low / typical / high or nothing', hostile);
    const nf = M.fareFromSerp({ error: 'Google Flights hasn\'t returned any results for this query.' }, NOW, null);
    check(nf.none === true && nf.p === null && M.fareState(nf, NOW) === 'none' && M.fareState(nf, NOW + 25 * H1) === 'stale',
      'PIA-140 AC4 a search that found no fares is kept as none ($∅): not offered again within 24h, offered once it is a day old');
    // AC5 ▼ / ▲ only between two real fetches of the identical search
    const later = M.fareFromSerp(tweak(SERP, (j) => { j.other_flights[0].price = 285; }), NOW, e), hitAgain = M.fareFromSerp(SERP, NOW, later);
    check(later.prev === 305 && later.pf === NOW - 2 * H1 && M.fareFacts(later, 'in', 'LAX', NOW).delta === -20 && hitAgain.prev === 305 &&
      M.fareFromSerp(SERP, NOW, { p: null, none: true, f: NOW - H1 }).prev === undefined && M.fareFromSerp(SERP, NOW - 3 * H1, later).prev === undefined,
      'PIA-140 AC5 ▼$20: a newer fetch of the same search remembers the price before it; a cache HIT of that same fetch keeps it; no-fares or an older fetch is never a "before"');
    const two = {}; two[ash.keys[0].key] = later; two[ash.keys[1].key] = { p: 200, f: NOW - H1 };
    const twoBoth = Object.assign({}, two); twoBoth[ash.keys[1].key] = { p: 200, f: NOW - H1, prev: 180, pf: NOW - 30 * H1 };
    check(M.priceDelta(tgP(two).price) === null && M.priceDelta(tgP(twoBoth).price) === 0 && M.priceDelta(tgP(Object.assign({}, twoBoth, { [ash.keys[1].key]: { p: 150, f: NOW - H1, prev: 180, pf: NOW - 30 * H1 } })).price) === -50,
      'PIA-140 AC5 the total\'s change only when every priced leg has an earlier price for its identical search (one leg new: no change shown)');
    // AC3 every search is the Worker's, in v1's own parameters; nearby airports sorted, ≤5; adults only above 1
    const tgMulti = model(tg, { me: 'LAX', hasEditKey: true, hasToken: true, multiAirport: true }), mdDw = mem(model(DW, Object.assign({ multiAirport: true }, ORG)), 'momdad-k3');
    const v1q = new URLSearchParams({ engine: 'google_flights', departure_id: 'LAX', arrival_id: 'PIA', outbound_date: '2026-11-20', type: 2, currency: 'USD', hl: 'en' });
    const q1 = new URLSearchParams(M.searchQuery(ash.keys[0].key));
    check(eq([...q1.entries()].sort(), [...v1q.entries()].sort()) && M.searchQuery(mem(tgMulti, 'LAX').keys[0].key).indexOf('departure_id=BUR,LAX,LGB,ONT,SNA&arrival_id=PIA') > 0 &&
      M.searchQuery(mdDw.keys[0].key) === 'engine=google_flights&departure_id=ORD,PIA&arrival_id=RDU&outbound_date=2026-11-06&return_date=2026-11-09&type=1&currency=USD&hl=en&adults=2' &&
      ['', 'x', '3|LAX|PIA|2026-11-20||1', '2|LAX,BUR,LGB,SNA,ONT,SAN|PIA|2026-11-20||1', '2|lax|PIA|2026-11-20||1', '1|LAX|PIA|2026-11-20||1', '2|LAX|PIA|2026-11-20|2026-11-22|1', '2|LAX|PIA|2026-11-20||0'].every((k) => M.searchQuery(k) === ''),
      'PIA-140 AC3 a one-adult search is v1\'s exact parameter set (one Worker cache entry for both apps); a nearby search names its ≤5 airports sorted; Mom & Dad add adults=2; anything the Worker would refuse builds nothing');
    // the REAL worker.js accepts every search the model builds, for every fixture traveler, with and without nearby airports
    const serpSeen = [], realFetch = globalThis.fetch;
    globalThis.fetch = async (u) => { if (/^https:\/\/serpapi\.com\/search\.json\?/.test(String(u))) { serpSeen.push(String(u)); return new Response(JSON.stringify(SERP), { status: 200 }); } return realFetch(u); };
    const wenv = { PROXY_TOKEN: 'trip-model-token-0123456789', SERPAPI_KEY: 'k', IDEAS: { m: new Map(), async get(k) { return this.m.has(k) ? this.m.get(k) : null; }, async put(k, v) { this.m.set(k, String(v)); } } };
    const allKeys = [];
    [tg, DW, TH, M8, LX].forEach((d) => [false, true].forEach((ma) => model(d, Object.assign({ multiAirport: ma }, ORG)).travelers.forEach((t) => t.keys.forEach((k) => { if (allKeys.indexOf(k.key) < 0) allKeys.push(k.key); }))));
    const statuses = [];
    for (const k of allKeys) {
      const res = await worker.fetch(new Request('https://w.dev/search?' + M.searchQuery(k), { headers: { Origin: ORIGIN, 'X-Pialax-Token': wenv.PROXY_TOKEN } }), wenv);
      statuses.push(res.status + ' ' + res.headers.get('X-Proxy-Cache'));
    }
    globalThis.fetch = realFetch;
    check(allKeys.length >= 20 && statuses.every((s) => s === '200 MISS') && serpSeen.length === allKeys.length && serpSeen.every((u) => !/token|no_cache/.test(u)),
      'PIA-140 AC3 the real Worker takes every search the model builds (' + allKeys.length + ' keys over 5 trips, nearby airports on and off): 200, one SerpAPI call each, nothing the strict allowlist refuses', statuses.filter((s) => s !== '200 MISS').slice(0, 4));
    // AC3 / AC4 what one tap may search, and what it costs
    const fz = {}; fz['2|LAX|PIA|2026-11-20||1'] = { p: 305, f: NOW - H1 }; fz['2|ORD|LAX|2026-11-29||1'] = { p: 200, f: NOW - 30 * H1 }; fz['2|LGA|PIA|2026-11-24||1'] = { p: null, none: true, f: NOW - H1 };
    const want = ['2|LAX|PIA|2026-11-20||1', '2|ORD|LAX|2026-11-29||1', '2|LGA|PIA|2026-11-24||1', '2|ORD|LGA|2026-11-29||1', '2|ORD|LGA|2026-11-29||1', '2|LAX|PIA|2026-10-10||1', 'junk'];
    check(eq(M.spendKeys(want, fz, NOW, TODAY), ['2|ORD|LGA|2026-11-29||1', '2|ORD|LAX|2026-11-29||1']) && M.spendKeys(want, fz, NOW + 25 * H1, TODAY).indexOf('2|LGA|PIA|2026-11-24||1') >= 0,
      'PIA-140 AC4 a tap searches only what is missing or a day old, each once, the never-searched first (a tap the caps cut short prices a $— leg before it refreshes a grey one): never a fresh fare, never a no-fares answer within 24h, never a day already past, never a key the Worker refuses');
    // a booked traveler's flight is bought: P-total's tap (tapKeys) and every ±1 day leave them out; spendable is all one trip may search
    {
      const bk = clone(DW); bk.responses['anjo-z5'] = { member: 'anjo-z5', status: 'in', origin: 'LGA', available_from: '', available_to: '', note: '', arrive_at: '', leave_from: '', booked: true };
      const bm = model(bk, { me: 'ashwin-p8', hasEditKey: true, hasToken: true }), anjo = mem(bm, 'anjo-z5'), dm = model(DW, { me: 'ashwin-p8', hasEditKey: true, hasToken: true });
      const all = M.spendable(dm, {}, NOW, TODAY), allB = M.spendable(bm, {}, NOW, TODAY), epB = M.endPrices(bm, 'anjo-z5', 0, {}, NOW, TODAY);
      check(anjo.booked && eq(M.tapKeys(dm), dm.price.search) && M.tapKeys(bm).length === 2 && M.tapKeys(bm).indexOf(anjo.keys[0].key) < 0 && bm.price.search.indexOf(anjo.keys[0].key) >= 0 &&
        all.length === 24 && all.every((k) => !!M.parseFareKey(k)) && allB.length === 16 && allB.indexOf(anjo.keys[0].key) < 0 && epB && epB.rows.length === 3 && epB.need.length === 0 && eq(M.tapKeys(null), []) &&
        M.cheapCandidates(bm, {}, NOW, TODAY).every((c) => c.need.every((k) => allB.indexOf(k) >= 0) && c.need.indexOf(anjo.keys[0].key) < 0),
        'PIA-140 a booked traveler\'s legs are shown but never offered to a tap: P-total\'s tap (tapKeys) leaves Anjo\'s out (2 of the 3), her ±1 days are drawn with nothing to search, and all one trip may search (spendable: 24 legs, P-total\'s, every end ±1 and, PIA-141, the 3 other candidate weeks\' 9) drops her 8 (her 5, and her 3 candidate weeks)', { all: all.length, allB: allB.length });
    }
    check(M.spendCount(9, 0) === 4 && M.spendCount(9, 6) === 2 && M.spendCount(3, 0) === 3 && M.spendCount(9, 8) === 0 && M.spendCount(0, 0) === 0 && M.SPEND_PER_TAP === 4 && M.SPEND_PER_SESSION === 8,
      'PIA-140 AC3 a tap costs at most 4 searches, and never more than the session has left of its 8');
    // AC3 the locks
    const Q = (o) => Object.assign({ period: '2026-10', used: 12, budget: 1000, exceeded: false }, o || {});
    const L = (o) => M.spendLock(Object.assign({ quota: Q(), utcDay: '2026-10-17', spent: 0 }, o));
    check(L({}) === '' && L({ quota: Q({ exceeded: true }) }) === 'month' && L({ quota: Q({ used: 300, budget: 300 }) }) === 'month' && L({ quota: Q({ used: 990, budget: 5000 }) }) === 'month' &&
      L({ acct: { plan_searches_left: 10 } }) === 'month' && L({ acct: { plan_searches_left: 11 } }) === '' && L({ acct: { total_searches_left: 0 } }) === 'month',
      'PIA-140 AC3 the month lock: an upstream 429 (exceeded), the organizer\'s month cap, 990 used, or the plan\'s last 10 searches (or none left at all)');
    check(L({ dayCap: '2026-10-17' }) === 'day' && L({ dayCap: '2026-10-16' }) === '' && L({ dayCap: '2026-10-17', utcDay: '2026-10-18' }) === '' &&
      L({ acct: { spend: { serp: { used: 30, cap: 30 } } }, acctDay: '2026-10-17' }) === 'day' && L({ acct: { spend: { serp: { used: 30, cap: 30 } } }, acctDay: '2026-10-16' }) === '' &&
      L({ spent: 8 }) === 'session' && L({ spent: 7 }) === '' && L({ dayCap: '2026-10-17', quota: Q({ exceeded: true }) }) === 'month',
      'PIA-140 AC3 the Worker\'s day cap locks only until the next UTC day (pialax_daily_cap_v1, or today\'s /account at its cap); 8 spent locks the session; the month lock wins');
    // v1's own stores in v1's formats: the quota counter, and v1's one-adult fare cache read and written as v1 would
    const qrows = legacy.quota.map(v => {
      const mine = M.quotaRead(v.raw, '2026-10');
      return { ok: eq(v.got, mine.q) && v.write === mine.write && eq(v.bump, M.quotaBump(mine.q, 1)) &&
        eq(v.exceeded, M.quotaExceeded(M.quotaBump(mine.q, 1))), raw: v.raw };
    });
    check(qrows.every(r => r.ok), 'quota migration, monthly reset, bump and lock match frozen v1 outputs', qrows.filter(r => !r.ok));
    const qa = M.quotaFromAccount(Q({ used: 1000, exceeded: true }), { this_month_usage: 41, total_searches_left: 959, spend: {} });
    const qh = M.quotaFromAccount(Q({ used: 1000, exceeded: true }), { this_month_usage: 41, total_searches_left: 959 }, true);
    const qn = M.quotaFromAccount(Q({ used: 1000, exceeded: true }), { this_month_usage: 41 }), qp = M.quotaFromAccount(Q({ used: 3 }), { searches_per_month: 5000, total_searches_left: 4900 });
    check(qa.used === 41 && qa.exceeded === false && qa.budget === 1000 && qh.exceeded === true && qh.used === 41 && qn.exceeded === true && qp.used === 100 && qp.budget === 1000 &&
      M.quotaFromAccount(Q(), { total_searches_left: 0 }).exceeded === true && M.quotaFromAccount(Q(), { total_searches_left: 0 }, true).exceeded === true && eq(M.quotaFromAccount(Q(), null), Q()),
      'PIA-140 /account, as v1\'s sync reads it: the month\'s usage from SerpAPI\'s own count (or the plan less what is left), a plan with nothing left locks the month and one with searches left lifts a refusal\'s lock (v1 does the same) unless the app still holds it (a refusal just now); an /account that says nothing of what is left lifts nothing; the organizer\'s month cap is never touched');
    check(M.monthWhy({ quota: Q({ exceeded: true }) }) === 'refused' && M.monthWhy({ quota: Q(), acct: { plan_searches_left: 4 } }) === 'plan' && M.monthWhy({ quota: Q(), acct: { total_searches_left: 0 } }) === 'plan' &&
      M.monthWhy({ quota: Q({ used: 300, budget: 300 }) }) === 'cap' && M.monthWhy({ quota: Q({ used: 990, budget: 5000 }) }) === 'safety' && M.monthWhy({ quota: Q() }) === '' && M.monthWhy({}) === '' &&
      ['refused', 'plan', 'cap', 'safety'].every((w) => L(w === 'refused' ? { quota: Q({ exceeded: true }) } : w === 'plan' ? { acct: { plan_searches_left: 4 } } : w === 'cap' ? { quota: Q({ used: 300, budget: 300 }) } : { quota: Q({ used: 990, budget: 5000 }) }) === 'month'),
      'PIA-140 monthWhy names every month lock for its label: refused (SerpAPI\'s 429, or the plan empty on /account), the plan\'s last 10, the organizer\'s own cap (raising it lifts it), 990 (v1\'s cutoff); each is a month lock');
    const v1k = M.v1FareKey(mem(tgMulti, 'LAX').keys[0].key);
    check(M.v1FareKey(ash.keys[0].key) === 'LAX|PIA|2026-11-20|' && v1k === 'BUR,LAX,LGB,ONT,SNA|PIA|2026-11-20|' && M.v1FareKey(mdDw.keys[0].key) === '' &&
      M.fareKeyOfV1('LAX|PIA|2026-11-20|') === ash.keys[0].key && M.fareKeyOfV1('LAX|RDU|2026-11-06|2026-11-09') === '1|LAX|RDU|2026-11-06|2026-11-09|1' && M.fareKeyOfV1(v1k) === mem(tgMulti, 'LAX').keys[0].key && M.fareKeyOfV1('junk') === '',
      'PIA-140 a one-adult fare key is v1\'s cache key (from|to|dep|ret, nearby airports sorted as v1 sorts them) and back; a 2-adult search is never v1\'s (v1 searches one adult)');
    const v1e = M.v1Fare(SERP, NOW - H1, true, false);
    const back = M.fareFromV1(v1e, null);
    check(v1e.ts === NOW - H1 && v1e.data.live === true && v1e.data.ow === 318 && v1e.data.rt === null && v1e.data.cached === true && v1e.data.offers.length === 4 && v1e.data.byDep.BUR === 305 &&
      v1e.data.lastVerified === new Date(NOW - H1).toISOString() && back.p === 305 && back.f === NOW - H1 && eq(back.off.map((o) => o.p), [305, 318, 341]) && back.lvl === 'low' &&
      M.v1Fare({ error: 'none' }, NOW, false, false) === null && M.fareFromV1({ data: { ow: 99 }, ts: NOW }) === null && M.fareFromV1({ data: { live: true, ow: 99, locked: true }, ts: NOW }) === null && M.fareFromV1({ data: { live: true, ow: 99 } }) === null,
      'PIA-140 a fare is written to v1\'s cache as v1\'s own fetch would (headline best_flights[0] $318, offers, byDep, original fetch time, HIT marked) and v1\'s live fares read back by v2\'s rule (the cheapest, $305); a sample, a booked stand-in or no fetch time is never a price');
    // the cache keeps itself: never an older fetch over a newer, no fares for days already past, the newest 400
    const big = {}; for (let i = 0; i < 420; i++) big['2|LAX|PIA|2026-12-' + String(1 + (i % 28)).padStart(2, '0') + '||' + (1 + Math.floor(i / 28) % 9)] = { p: i + 1, f: NOW - i * 1000 };
    big['2|LAX|PIA|2026-10-01||1'] = { p: 1, f: NOW };
    const put = M.faresPut(fz, '2|LAX|PIA|2026-11-20||1', { p: 999, f: NOW - 5 * H1 }, TODAY), put2 = M.faresPut(fz, '2|LAX|PIA|2026-11-20||1', { p: 299, f: NOW }, TODAY);
    const kept = M.faresPut(big, '2|SEA|PIA|2026-12-01||1', { p: 5, f: NOW }, TODAY);
    check(put['2|LAX|PIA|2026-11-20||1'].p === 305 && put2['2|LAX|PIA|2026-11-20||1'].p === 299 && Object.keys(kept).length <= M.FARES_KEEP && !kept['2|LAX|PIA|2026-10-01||1'] && kept['2|SEA|PIA|2026-12-01||1'].p === 5 &&
      Object.keys(M.faresPut({ junk: { p: 1, f: NOW } }, 'nope', { p: 1, f: NOW }, TODAY)).length === 0,
      'PIA-140 the fare cache: an older fetch never replaces a newer one; fares for a day already past go; at most the newest ' + M.FARES_KEEP + ' are kept');
    // AC7 no price is ever written to the record: no write builder can reach a fare. Each builder (and what it calls in the region)
    // is read as source: none takes or reads the fare cache, a leg's price or the pricing rule (the app's own write-and-share
    // check in test-app covers what the app hands them)
    {
      const src = fs.readFileSync(path.join(ROOT, 'scripts', 'trip-model.js'), 'utf8');
      const fnSrc = (name) => {
        const m0 = new RegExp('\\bfunction\\s+' + name + '\\s*\\(').exec(src); if (!m0) return null;
        let i = src.indexOf('{', m0.index), depth = 0;
        for (; i < src.length; i++) { const c = src[i]; if (c === '{') depth++; else if (c === '}' && --depth === 0) return src.slice(m0.index, i + 1); }
        return null;
      };
      const builders = ['createRequest', 'respondRequest', 'bookedRequests', 'updateRequest', 'airportSyncRequests', 'organizerEdit', 'timesRequest', 'migrateRequests', 'decisionBody'];
      const PRICE_RE = /\bfares?\b|legTotal|priceRows|priceTrip|fareFacts|fareState|fareAt|\.price\b|pialax_fares/;
      const rows = builders.map((n) => { const s = fnSrc(n); return { n, found: !!s, hit: s ? (s.match(PRICE_RE) || [])[0] || '' : '' }; });
      check(rows.every((r) => r.found && !r.hit), 'PIA-140 AC7 no write builder can carry a fetched price: ' + builders.join(', ') + ' never take or read a fare, a leg\'s price or the pricing rule', rows.filter((r) => !r.found || r.hit));
    }
  }

  // ═══ PIA-141 ════════════════════════════════════════════════════════════
  section('PIA-141 cheapest week on demand: weeks that keep the length, 📌 and window; only followers move; real fares only; ★; Move through the plan write');
  {
    const H1 = 36e5, ORGP = { me: 'LAX', hasEditKey: true, hasToken: true };
    // the spec's Thanksgiving S1 (the migrated legacy doc): Ashwin follows the 11/20–11/29 plan (into PIA, home from ORD: two
    // one-ways), Anjo's own 11/24–11/29 (home from ORD) is fixed and cached, Mom & Dad host. Fares 3h old: Ashwin 🛬 $305 + 🛫 $200,
    // Anjo $290 + $160 = $955
    const S1 = { '2|LAX|PIA|2026-11-20||1': { p: 305, f: NOW - 3 * H1 }, '2|ORD|LAX|2026-11-29||1': { p: 200, f: NOW - 3 * H1 },
      '2|LGA|PIA|2026-11-24||1': { p: 290, f: NOW - 3 * H1 }, '2|ORD|LGA|2026-11-29||1': { p: 160, f: NOW - 3 * H1 } };
    // P-migrate re-chose the legacy doc (🔒): the cheapest week waits for 🔓, which S1 is ("before locking"), through the real Worker
    const s1Id = srv.seed(tg), s1Un = await srv.send(M.organizerEdit(await srv.get(s1Id, KEY), KEY, { decision: { stage: 'proposed' } })), TS1 = await srv.get(s1Id, KEY);
    check(M.cheapWhy(model(tg, Object.assign({ fares: S1 }, ORGP)), TODAY) === 'locked' && srv.allOk(s1Un) && !model(TS1, ORGP).locked && eq(model(TS1, ORGP).plan, { s: '2026-11-20', e: '2026-11-29' }),
      'PIA-141 AC6 the migrated Thanksgiving is 🔒 (P-migrate kept its chosen): no cheapest week until 🔓, which gives S1 (the same plan, unlocked)');
    const s1m = (fares, doc) => model(doc || TS1, Object.assign({ fares }, ORGP));
    const c0 = M.cheapCandidates(s1m(S1), S1, NOW, TODAY), anjoKeys = mem(s1m(S1), 'LGA').keys.map((k) => k.key);
    const starts = c0.map((c) => c.s), marked = c0.filter((c) => c.warn.length);
    check(M.cheapWhy(s1m(S1), TODAY) === '' && c0.length === 10 && starts[0] === '2026-11-17' && starts[9] === '2026-11-26' && starts.every((s, i) => i === 0 || M.diffD(starts[i - 1], s) === 1) &&
      c0.every((c) => M.diffD(c.s, c.e) === 9 && c.s <= '2026-11-26' && c.e >= '2026-11-26' && c.s > TODAY),
      'PIA-141 AC1 Thanksgiving S1 (the migrated legacy doc, 📌 11/26): 10 candidate weeks, 11/17–11/26, each 9 nights (the plan\'s length) with the dinner inside, all in the future', starts);
    check(marked.length === 5 && eq(marked.map((c) => c.s), ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-25', '2026-11-26']) && marked.every((c) => eq(c.warn, ['🗽']) && eq(c.warnCodes, ['LGA'])),
      'PIA-141 AC2 5 weeks carry Anjo\'s 🗽: they would leave her own 11/24–11/29 outside the plan (11/17–11/19 end too soon, 11/25–11/26 start too late)', marked.map((c) => c.s));
    const cur = c0.find((c) => c.current), others = c0.filter((c) => !c.current);
    check(cur && cur.s === '2026-11-20' && cur.filled && cur.total === 955 && cur.need.length === 0 && others.every((c) => c.need.length === 2 && !c.filled && c.total === null && c.sum === null && !c.star) &&
      c0.every((c) => c.need.length <= 2 && c.need.every((k) => anjoKeys.indexOf(k) < 0) && c.price.per.LGA.legs.map((l) => l.key).join() === anjoKeys.join() && c.price.per.LGA.sum === 450) &&
      others.every((c) => eq(c.need, ['2|LAX|PIA|' + c.s + '||1', '2|ORD|LAX|' + c.e + '||1'])),
      'PIA-141 AC2 / AC4 only Ashwin moves with a week: each other week costs ≤2 searches (his two one-ways for it), Anjo\'s legs stay hers (the same keys, $450 from the cache, never searched again); the current 11/20 week is already filled ($955); unsearched weeks stay hollow (no total), nothing estimated');
    check(!c0.some((c) => c.star), 'PIA-141 AC3 ★ only once two weeks are priced: with one filled week there is no cheapest');
    const S1b = Object.assign({}, S1, { '2|LAX|PIA|2026-11-22||1': { p: 280, f: NOW - H1 }, '2|ORD|LAX|2026-12-01||1': { p: 160, f: NOW - H1 } });
    const c1 = M.cheapCandidates(s1m(S1b), S1b, NOW, TODAY), w22 = c1.find((c) => c.s === '2026-11-22');
    check(w22 && w22.filled && w22.total === 890 && w22.star && c1.filter((c) => c.star).length === 1 && !c1.find((c) => c.current).star && c1.find((c) => c.current).total === 955 &&
      eq(w22.per.map((p) => [p.code, p.sum, p.own]), [['LAX', 440, false], ['LGA', 450, true]]) && w22.e === '2026-12-01' && !w22.warn.length,
      'PIA-141 AC4 the pinned S1 sample: once 11/22\'s two legs are searched it reads $890 (Ashwin 🛬 11/22 $280 + 🛫 12/01 $160 + Anjo $450, fixed and cached) with ★, the 11/20 plan $955 without; the chips name each part, Anjo\'s own days marked', w22 && w22.per);
    // never a week after the dinner: whatever the window, the 📌 day is inside every week; widening adds nothing then
    const wide = tweak(TS1, (d) => { d.idea.dates.searchStart = '2026-11-01'; d.idea.dates.searchEnd = '2026-12-31'; });
    const cw = M.cheapCandidates(s1m(S1, wide), S1, NOW, TODAY), nopin = tweak(TS1, (d) => { d.idea.notes = M.buildNotes('', null, M.parseNotes(d.idea.notes).caption); });
    const nw = M.widenWin(s1m(S1, nopin), 1, TODAY), np = s1m(S1, nopin);
    check(cw.length === 10 && cw.every((c) => c.s >= '2026-11-17' && c.s <= '2026-11-26') && !cw.some((c) => c.s === '2026-12-03') && M.widenWin(s1m(S1), 1, TODAY) === null && M.widenWin(s1m(S1), -1, TODAY) === null &&
      M.parseNotes(TS1.idea.notes).pin === '2026-11-26' && !!nw && nw.e === '2026-12-13' && nw.s === np.win.s && M.cheapCandidates(np, S1, NOW, TODAY).length === 15 &&
      M.cheapCandidates(model(tweak(nopin, (d) => { d.idea.dates.searchStart = np.win.s; d.idea.dates.searchEnd = nw.e; }), Object.assign({ fares: S1 }, ORGP)), S1, NOW, TODAY).length === 22,
      'PIA-141 AC1 Thanksgiving is never offered a week after the dinner (the migrated 📌 11/26 is there): even in a 11/1–12/31 window every week holds 11/26 (no 12/3 week), and ⟦◀ ▶⟧ add nothing; without the 📌 the plan ±7 holds 15 weeks and ▶⟧ widens to 12/13 (22)');
    check(M.cheapWhy(model(lgOrg, Object.assign({ fares: S1 }, ORGP)), TODAY) === 'legacy', 'PIA-141 the unmigrated v1 doc offers no cheapest week (P-migrate first: its 📌 lives in v1 storage until then)');
    // an undated idea: its stated 🌙4 inside its ⟦window⟧, tomorrow at the earliest
    const cyM = model(CY, { me: 'ashwin-c3', hasEditKey: true, hasToken: true }), cyC = M.cheapCandidates(cyM, {}, NOW, TODAY);
    const mdK = (c) => c.price.per['momdad-c1'].legs.map((l) => l.key).join();
    const fixedK = (c) => ['ashwin-c3', 'anjo-c4'].map((x) => c.price.per[x].legs.map((l) => l.key).join()).join();
    check(M.cheapWhy(cyM, TODAY) === '' && cyC.length === 14 && cyC[0].s === '2026-12-18' && cyC[13].s === '2026-12-31' && cyC.every((c) => M.diffD(c.s, c.e) === 4 && c.e <= '2027-01-04') &&
      cyC.every((c) => mdK(c) === '1|PIA|RDU|' + c.s + '|' + c.e + '|2' && c.need.length === 3 && c.need[0] === mdK(c) && fixedK(c) === fixedK(cyC[0]) && eq(c.warnCodes, ['ashwin-c3', 'anjo-c4'])),
      'PIA-141 AC1 an undated idea keeps its stated 🌙4 inside its ⟦12/18–1/04⟧ window (14 weeks): Mom & Dad (waiting) move with each (one round trip for 2), Ashwin\'s and Anjo\'s own windows stay (the same two searches in every week, still uncached: ≤3) and mark every week');
    const soon = tweak(DW, (d) => { d.idea.dates.departure = '2026-10-19'; d.idea.dates.return = '2026-10-22'; d.idea.notes = ''; });
    const sc = M.cheapCandidates(model(soon, ORGP), {}, NOW, TODAY);
    check(sc.length > 0 && sc[0].s === '2026-10-18' && sc.every((c) => c.s > TODAY && c.e <= '2026-10-29'), 'PIA-141 AC1 weeks start tomorrow at the earliest, never inside the past part of the window (10/12–10/29)', sc.map((c) => c.s));
    // a booked traveler keeps the days they booked: never priced or searched here, their face marks every week that would leave them out
    const bk = tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA', '', '', { booked: true }); });
    const bkm = model(bk, ORGP), bkc = M.cheapCandidates(bkm, {}, NOW, TODAY), aK = mem(model(DW, ORGP), 'anjo-z5').keys[0].key;
    check(bkc.length === 4 && bkc.every((c) => c.price.per['anjo-z5'] === undefined && c.per.find((p) => p.code === 'anjo-z5').booked && c.need.indexOf(aK) < 0 && !c.need.some((k) => /\|LGA\|/.test(k))) &&
      eq(bkc.filter((c) => c.warn.length).map((c) => c.s), ['2026-11-05', '2026-11-07', '2026-11-08']) && bkc.filter((c) => c.warn.length).every((c) => eq(c.warnCodes, ['anjo-z5'])) && M.cheapWhy(bkm, TODAY) === '',
      'PIA-141 AC2 a booked follower (Anjo 🎫) stays on the days she booked: her flight is bought, so no week prices or searches it, and every week but the plan carries her 🗽 (it would leave her days out)');
    // fix pass: a booked flight's cached price is the same in every week, so every week's total is the trip's whole cost and the
    // plan's own bar reads P-total's total (D2: no two screens disagree), booked or not; it is never searched, and a day-old fare of
    // hers (never refreshed: it is bought) neither greys a week nor holds Move back
    const S1k = tweak(TS1, (d) => { d.responses.LGA.booked = true; d.responses.LGA.booked_at = '2026-10-16T00:00:00.000Z'; });
    const kFares = Object.assign({}, S1b, { '2|LGA|PIA|2026-11-24||1': { p: 290, f: NOW - 30 * H1 } });
    const km = s1m(kFares, S1k), kc = M.cheapCandidates(km, kFares, NOW, TODAY), kcur = kc.find((c) => c.current), k22 = kc.find((c) => c.s === '2026-11-22');
    const kAnjo = (c) => c.per.find((p) => p.code === 'LGA');
    check(km.anyBooked === 1 && kc.length === 10 && kc.every((c) => c.bought === 450 && c.price.per.LGA === undefined && kAnjo(c).booked && kAnjo(c).sum === 450 && c.need.every((k) => anjoKeys.indexOf(k) < 0)) &&
      kcur.filled && kcur.total === 955 && km.price.total === 955 && !km.price.complete && k22.filled && k22.total === 890 && k22.star && kc.filter((c) => c.star).length === 1 &&
      kc.filter((c) => !c.current && c.s !== '2026-11-22').every((c) => c.total === null && c.sum === null),
      'PIA-141 a booked traveler\'s cached price ($450, one fare a day old) is in every week alike: the plan\'s bar reads $955, P-total\'s total; 11/22 still $890 ★ (only Ashwin\'s part moves); never searched, never what greys a week', { cur: kcur && kcur.total, w22: k22 && k22.total, pt: km.price.total });
    check(M.cheapWhy(model(tweak(DW, (d) => { ['momdad-k3', 'ashwin-p8'].forEach((c) => { d.responses[c].available_from = '2026-11-06'; d.responses[c].available_to = '2026-11-09'; }); d.responses['anjo-z5'] = R('in', 'LGA', '2026-11-05', '2026-11-09'); }), ORGP), TODAY) === 'nobody' &&
      M.cheapWhy(model(tweak(DW, (d) => { ['momdad-k3', 'ashwin-p8', 'anjo-z5'].forEach((c) => { d.responses[c] = R('in', '', '', '', { booked: true }); }); }), ORGP), TODAY) === 'nobody',
      'PIA-141 AC6 the entry is unavailable when nobody follows the plan: everyone set both ends, or everyone has booked');
    const whys = {
      org: model(DW, { me: 'ashwin-p8', hasToken: true }), token: model(DW, { me: 'ashwin-p8', hasEditKey: true }),
      closed: model(tweak(DW, (d) => { d.decision = { stage: 'dropped' }; }), ORGP), past: model(tweak(DW, (d) => { d.idea.dates.departure = '2026-10-01'; d.idea.dates.return = '2026-10-04'; d.idea.notes = ''; }), ORGP),
      locked: model(tweak(DW, (d) => { d.decision = { stage: 'chosen', chosen: { airport: 'RDU', city: 'Raleigh', departure: '2026-11-06', return: '2026-11-09' } }; }), ORGP),
      nodest: model(tweak(DW, (d) => { d.idea.destination = { city: '', airport: '' }; }), ORGP),
      nights: model(tweak(CY, (d) => { d.idea.notes = 'New date TBD'; }), ORGP), window: model(tweak(CY, (d) => { d.idea.dates.searchStart = ''; d.idea.dates.searchEnd = ''; }), ORGP),
      unpriced: model(tweak(DW, (d) => { d.idea.members[0].airport = ''; d.responses['momdad-k3'].origin = ''; }), ORGP),
      noweek: model(tweak(DW, (d) => { d.idea.dates.departure = '2026-10-17'; d.idea.dates.return = '2026-10-20'; d.idea.notes = '📌2026-10-17'; }), ORGP)
    };
    const gotW = Object.keys(whys).map((k) => [k, M.cheapWhy(whys[k], TODAY)]);
    check(gotW.every(([k, w]) => k === w) && M.cheapCandidates(whys.noweek, {}, NOW, TODAY).length === 0 && M.cheapWhy(null, TODAY) === 'org',
      'PIA-141 AC6 P-dates\' 📉 says why it cannot open: not the organizer\'s phone, no token, dropped, over, 🔒 (Move is never offered while the dates are locked), no place, no nights, no window, someone with no airport, no week that fits', gotW);
    // ★ needs a cheaper week (equal totals have no cheapest); a week whose search found no fares, or where someone cannot be priced,
    // offers nothing to spend; a day-old week is priced (grey), not filled, and offers its refresh
    const fillDW = (doc, f) => { const fr = {}; M.cheapCandidates(model(doc, ORGP), {}, NOW, TODAY).forEach((c) => c.need.forEach((k) => { fr[k] = f(k); })); return fr; };
    const eqF = fillDW(DW, () => ({ p: 100, f: NOW - H1 })), eqC = M.cheapCandidates(model(DW, Object.assign({ fares: eqF }, ORGP)), eqF, NOW, TODAY);
    const noneF = Object.assign({}, eqF), w5 = eqC.find((c) => c.s === '2026-11-05'); noneF[w5.missing.length ? w5.missing[0] : w5.price.per['ashwin-p8'].legs[0].key] = { p: null, none: true, f: NOW - H1 };
    const noneC = M.cheapCandidates(model(DW, Object.assign({ fares: noneF }, ORGP)), noneF, NOW, TODAY).find((c) => c.s === '2026-11-05');
    const staleF = Object.assign({}, eqF), w7k = eqC.find((c) => c.s === '2026-11-07').price.per['ashwin-p8'].legs[0].key; staleF[w7k] = { p: 120, f: NOW - 30 * H1 };
    const staleC = M.cheapCandidates(model(DW, Object.assign({ fares: staleF }, ORGP)), staleF, NOW, TODAY).find((c) => c.s === '2026-11-07');
    const cross = tweak(DW, (d) => { d.responses['ashwin-p8'].available_from = '2026-11-09'; });
    const crossC = M.cheapCandidates(model(cross, Object.assign({ fares: fillDW(cross, () => ({ p: 90, f: NOW - H1 })) }, ORGP)), fillDW(cross, () => ({ p: 90, f: NOW - H1 })), NOW, TODAY).find((c) => c.s === '2026-11-05');
    check(eqC.every((c) => c.filled && c.total === 300) && !eqC.some((c) => c.star) && noneC.none && !noneC.filled && noneC.need.length === 0 &&
      staleC.priced && staleC.stale && !staleC.filled && staleC.total === null && staleC.sum === 320 && eq(staleC.need, [w7k]) &&
      crossC.blocked.length === 1 && crossC.blocked[0].why === 'order' && !crossC.filled && crossC.need.length === 0,
      'PIA-141 AC3 four weeks priced alike ($300 each) have no ★; a week where a search found no fares is $∅ and offers nothing to spend; a day-old week shows its real $320 grey and offers only its refresh; a week where someone\'s own arrival would come after the week ends offers nothing');
    // spendable takes each week's legs while the cheapest week can be asked for, and never while the dates are locked
    const dwm0 = model(DW, ORGP), allW = M.cheapCandidates(dwm0, {}, NOW, TODAY).reduce((a, c) => a.concat(c.need), []);
    check(allW.length === 12 && allW.every((k) => M.spendable(dwm0, {}, NOW, TODAY).indexOf(k) >= 0) && M.spendable(whys.locked, {}, NOW, TODAY).length === 15,
      'PIA-141 AC4 one spend path: every candidate week\'s legs are among what a tap on this trip may search (spendable, the PIA-140 path, its caps and locks), and none of them once the dates are 🔒');
    // Move: the week becomes the plan in ONE /idea/update (planDelta, 📌 kept), through the real Worker; every follower's link follows,
    // own days stay; a booked follower's days are written as hers first (PIA-138's rule); a 🔒 meanwhile holds it back
    const mvId = srv.seed(TS1), mvFresh = await srv.get(mvId, KEY), mvM = model(mvFresh, Object.assign({ fares: S1b }, ORGP));
    const target = M.cheapCandidates(mvM, S1b, NOW, TODAY).find((c) => c.s === '2026-11-22');
    const mvReqs = M.organizerEdit(mvFresh, KEY, M.moveDelta(mvM, target)), anjoBefore = mem(mvM, 'LGA').link.href;
    const mvRes = await srv.send(mvReqs), mvDoc = await srv.get(mvId, KEY), after = model(mvDoc, Object.assign({ fares: S1b }, ORGP));
    const ashDec = M.gfDecode(mem(after, 'LAX').link.href);
    check(mvReqs.length === 1 && mvReqs[0].path.indexOf('/idea/update') === 0 && srv.allOk(mvRes) && eq(after.plan, { s: '2026-11-22', e: '2026-12-01' }) && after.pin === '2026-11-26' &&
      ashDec.legs[0].date === '2026-11-22' && ashDec.legs[1].date === '2026-12-01' && mem(after, 'LGA').link.href === anjoBefore && after.price.complete && after.price.total === 890 &&
      M.cheapCandidates(after, S1b, NOW, TODAY).find((c) => c.current).s === '2026-11-22',
      'PIA-141 AC6 Move writes the new plan once (one /idea/update through the real Worker, 📌 11/26 kept): Ashwin\'s link now reads 11/22 → 12/01, Anjo\'s is unchanged, and the trip\'s total is the bar\'s $890');
    const bkId = srv.seed(bk), bkFresh = await srv.get(bkId, KEY), bkReqs = M.organizerEdit(bkFresh, KEY, M.moveDelta(model(bkFresh, ORGP), { s: '2026-11-07', e: '2026-11-10' }));
    const bkRes = await srv.send(bkReqs), bkAfter = model(await srv.get(bkId, KEY), ORGP);
    check(bkReqs.map((q) => q.path.split('?')[0]).join() === '/idea/respond,/idea/update' && srv.allOk(bkRes) && mem(bkAfter, 'anjo-z5').d1 === '2026-11-06' && mem(bkAfter, 'anjo-z5').d2 === '2026-11-09' &&
      mem(bkAfter, 'ashwin-p8').d1 === '2026-11-07' && mem(bkAfter, 'momdad-k3').d2 === '2026-11-10',
      'PIA-141 AC6 with a booked follower the plan is still written once: her booked days are made her own first (PIA-138\'s rule), then the one update moves everyone else');
    check(M.organizerEdit(tweak(mvFresh, (d) => { d.decision = { stage: 'chosen', chosen: { airport: 'PIA', city: 'Peoria', departure: '2026-11-20', return: '2026-11-29' } }; }), KEY, M.moveDelta(mvM, target)) === null,
      'PIA-141 AC6 a Move on a record locked meanwhile builds nothing (datesHeld: 🔒 first)');
    // ⟦◀ ▶⟧ saves the wider window as the trip's ⟦⟧ (plan, 📌 and 🌙 untouched)
    const wdId = srv.seed(nopin), wdFresh = await srv.get(wdId, KEY), wdM = model(wdFresh, ORGP), wNew = M.widenWin(wdM, 1, TODAY);
    const wdRes = await srv.send(M.organizerEdit(wdFresh, KEY, M.widenDelta(wNew))), wdAfter = model(await srv.get(wdId, KEY), ORGP);
    check(srv.allOk(wdRes) && eq(wdAfter.plan, wdM.plan) && wdAfter.explicitWin && eq(wdAfter.win, wNew) && wdAfter.pin === '' && M.cheapCandidates(wdAfter, {}, NOW, TODAY).length === 22 && M.widenWin(wdM, -1, TODAY) !== null,
      'PIA-141 ▶⟧ widens the flex window by a week and saves it (searchStart / searchEnd through the real Worker): the plan stays, 15 weeks become 22');
  }

  // ═══ PIA-142 ════════════════════════════════════════════════════════════
  section('PIA-142 Trips › Family: people merged across trips by name, cells that are the trips\' own members, 🏠n hosted, heads by headcount, past trips as columns');
  {
    const PAST = tweak(TH, (d) => { d.id = 'psTahoePastSeptember01'; d.idea.dates.departure = '2026-09-11'; d.idea.dates.return = '2026-09-14'; });
    const DROP = tweak(LX, (d) => { d.id = 'drLaxDroppedTrip000d01'; d.decision.stage = 'dropped'; });
    // NYC (LGA): Anjo hosts it; a past Done trip she hosted, Ashwin and Mom & Dad flew in
    const NYC = tweak(DW, (d) => { d.id = 'nyNewYorkPastDone00n01'; d.idea.title = '🌆 New York'; d.idea.destination = { city: 'New York', airport: 'LGA' };
      d.idea.dates.departure = '2026-06-24'; d.idea.dates.return = '2026-07-04'; d.responses['anjo-z5'] = R('in', 'LGA'); d.decision.stage = 'booked'; });
    const ms = (o) => {
      const mk = (doc, me) => model(doc, Object.assign({ me }, o || {}));
      return [mk(DW, 'ashwin-p8'), mk(TH, 'ashwin-l2'), mk(M8), mk(CY, 'ashwin-c3'), mk(LX, 'ashwin-x3'), mk(PAST, 'ashwin-l2'), mk(NYC, 'ashwin-p8'), mk(DROP, 'ashwin-x3')];
    };
    const all = ms(), B = M.familyBoard(all), Bp = M.familyBoard(all, { past: true });
    const row = (b, key) => b.rows.find((r) => r.key === key), ids = (b) => b.cols.map((m) => m.id);
    check(eq(ids(B), [DW.id, TH.id, M8.id, CY.id, LX.id]) && eq(ids(Bp), [DW.id, TH.id, M8.id, CY.id, LX.id, PAST.id, NYC.id]) && ids(Bp).indexOf(DROP.id) < 0,
      'PIA-142 AC5 the columns are the trips off the shelf in the order given (the cards\'); 🗄 adds the past ones after them; a dropped trip is never a column', ids(Bp));
    const ash = row(B, 'ashwin');
    check(B.rows[0] === ash && ash.me && B.mine === 'ashwin' && ash.cells.filter(Boolean).length === 4 && ash.cells[2] === null &&
      [0, 1, 3, 4].every((c) => ash.cells[c] === B.cols[c].members.find((x) => x.norm === 'ashwin')),
      'PIA-142 AC1 people are merged across trips by name: Ashwin is one row (me, first) whose cells ARE the four trips\' own member objects, none on the 8-member trip');
    const sams = B.rows.filter((r) => r.norm === 'sam lee');
    const twoSam = tweak(LX, (d) => { d.id = 'tsTwoSamsOtherTrip0t01'; d.idea.members.push({ code: 'samlee-q1', label: '🐳 Sam Lee', airport: 'SEA', headcount: 1 }); });
    const S2 = M.familyBoard([model(M8), model(twoSam)]), s2 = S2.rows.filter((r) => r.norm === 'sam lee');
    check(sams.length === 2 && sams[0].cells[2].code === 'samlee-kz' && sams[1].cells[2].code === 'samlee-sb' && sams[1].key === 'sam lee#2' &&
      s2.length === 2 && s2[0].cells[1] && s2[0].cells[1].code === 'samlee-q1' && s2[1].cells[1] === null,
      'PIA-142 AC1 two "Sam Lee"s on one trip stay two rows; the first Sam Lee of another trip joins the first of them (the k-th joins the k-th)');
    const LG1 = tweak(LEG, (d) => { d.id = 'lgLegacyOneMe000000l01'; }), LG2 = tweak(LEG, (d) => { d.id = 'lgLegacyTwoMe000000l02'; });
    const LB = M.familyBoard([model(LG1, { me: 'LAX' }), model(LG2)]), meRows = LB.rows.filter((r) => !r.norm);
    check(meRows.length === 2 && meRows[0].key === '#' + LG1.id + '|LAX' && meRows[0].me && LB.rows[0] === meRows[0] && meRows[0].cells[1] === null && meRows[1].cells[0] === null && meRows[1].name === '' &&
      LB.rows.filter((r) => r.norm === 'anjo').length === 1,
      'PIA-142 a v1 "Me" (no name) is a row of its own on its trip (never merged, never a word); this phone\'s "Me" is still me, first; named people still merge');
    const LB2 = M.familyBoard([model(DW, { me: 'ashwin-p8' }), model(LG1, { me: 'LAX' }), model(LG2)]), me2 = LB2.rows[0];
    check(me2.key === 'ashwin' && me2.me && me2.cells[1] && me2.cells[1].code === 'LAX' && me2.cells[0].code === 'ashwin-p8' && me2.cells[2] && me2.cells[2].code === 'LAX' && me2.cells[2] === LB2.cols[2].members.find((x) => x.code === 'LAX') &&
      LB2.rows.filter((r) => !r.norm).length === 0,
      'PIA-142 the v1 "Me" this phone is joins my own row (Ashwin on Diwali, "Me" on the v1 Thanksgiving); so does the "Me" of a v1 trip this phone is nobody on: it is that trip\'s organizer, whom v1\'s family preset names by airport (LAX: Ashwin, P-migrate\'s own suggestion)');
    // fix pass: on Mom's phone (nobody on the v1 doc, Mom & Dad on Diwali) the v1 "Me" at LAX is Ashwin's row, named from his Diwali
    // face even though the v1 trip comes first; a v1 "Me" at an airport outside the preset (SEA), or whose preset name is on its own
    // trip by name, stays a row of its own, after every named row, and is never anybody's row by guess
    const momB = M.familyBoard([model(LG1), model(DW, { me: 'momdad-k3' })]), momAsh = momB.rows.find((r) => r.key === 'ashwin');
    const SEA = tweak(LEG, (d) => { d.id = 'lgLegacySeaMe00000l03'; d.idea.members[1].airport = 'SEA'; });
    const NAMED = tweak(LEG, (d) => { d.id = 'lgLegacyNamedAsh00l04'; d.idea.members.push({ code: 'ASH', label: 'Ashwin', airport: 'SFO', headcount: 1 }); });
    const seaB = M.familyBoard([model(SEA), model(DW, { me: 'momdad-k3' })]), namedB = M.familyBoard([model(NAMED), model(DW, { me: 'momdad-k3' })]);
    const lastNameless = (b) => { const i = b.rows.findIndex((r) => !r.norm); return i >= 0 && b.rows.slice(i).every((r) => !r.norm); };
    check(momAsh && momAsh.name === 'Ashwin' && momAsh.face === '🌴' && momAsh.cells[0] && momAsh.cells[0].code === 'LAX' && momAsh.cells[1].code === 'ashwin-p8' && momB.rows.filter((r) => !r.norm).length === 0 && momB.rows[0].key === 'mom & dad' && momB.rows[0].me &&
      seaB.rows.filter((r) => !r.norm).length === 1 && lastNameless(seaB) && seaB.rows.find((r) => r.key === 'ashwin').cells[0] === null &&
      namedB.rows.filter((r) => !r.norm).length === 1 && lastNameless(namedB) && namedB.rows.find((r) => r.key === 'ashwin').cells[0].code === 'ASH',
      'PIA-142 on another phone a v1 "Me" at a family airport joins the preset\'s person when they have a named row (named from that row, not the v1 face); one outside the preset, or whose preset name is already on its trip, stays a row of its own after the named rows',
      { mom: momB.rows.map((r) => r.key), sea: seaB.rows.map((r) => r.key), named: namedB.rows.map((r) => r.key) });
    const md = row(B, 'mom & dad'), dwCol = B.cols[0];
    check(md.headcount === 2 && dwCol.headsIn === 3 && dwCol.heads === 4 && md.cells[0].headcount === 2 &&
      B.cols.every((m) => m.heads === m.members.reduce((s, x) => s + x.headcount, 0) && m.headsIn === m.members.filter((x) => x.status === 'in' || x.status === 'host-default').reduce((s, x) => s + x.headcount, 0)),
      'PIA-142 AC3 heads per trip by headcount: Mom & Dad ×2 on their row, Diwali 3/4 (Mom & Dad 2 + Ashwin; Anjo has not answered); every column\'s heads are its own model\'s');
    const anjoP = row(Bp, 'anjo'), mayaP = row(Bp, 'maya'), ashP = row(Bp, 'ashwin');
    check(anjoP.hosted === 1 && anjoP.cells[6].host && anjoP.cells[6].status === 'in' && row(B, 'anjo').hosted === 1 && mayaP.hosted === 1 && ashP.hosted === 1 && md.hosted === 0 &&
      row(Bp, 'grandma josephine').hosted === 1 && row(Bp, 'guadalupe hernández-villanueva').hosted === 1,
      'PIA-142 AC2 🏠n counts the trips a person hosts across the active and past trips, shown or not: Anjo hosted the past New York (🏠1 with 🗄 off too), Ashwin and Maya the LA beach weekend (SNA is in LA\'s set), Grandma and Guadalupe the Savannah trip; Mom & Dad none');
    const dropAsh = M.familyBoard([model(DW, { me: 'ashwin-p8' }), model(tweak(LX, (d) => { d.id = 'drLaxDroppedTrip000d02'; d.decision.stage = 'dropped'; }), { me: 'ashwin-x3' })]);
    const outHost = M.familyBoard([model(DW, { me: 'ashwin-p8' }), model(tweak(LX, (d) => { d.id = 'ohLaxHostSaidOut000o01'; d.responses['ashwin-x3'].status = 'out'; }), { me: 'ashwin-x3' })]);
    check(row(dropAsh, 'ashwin').hosted === 0 && row(outHost, 'ashwin').hosted === 0 && row(outHost, 'ashwin').cells[1].status === 'out' && row(outHost, 'ashwin').cells[1].host,
      'PIA-142 AC2 a dropped trip never counts as hosted (it never happened), nor one the host said Out to (their cell still shows it: ⊘ with 🏠)');
    const shown = (b, key) => b.rows.find((r) => r.key === key).cells.filter((x) => x && x.host && x.status !== 'out').length;
    check(Bp.rows.every((r) => r.hosted === shown(Bp, r.key)),
      'PIA-142 AC5 with 🗄 on, every row\'s 🏠n is exactly the 🏠 cells on its row (so hosting history reads off the board)', Bp.rows.map((r) => [r.key, r.hosted, shown(Bp, r.key)]));
    const tgB = M.familyBoard([model(tg, { me: 'LAX' }), model(DW, { me: 'ashwin-p8' })]), tgMD = tgB.rows.find((r) => r.cells[0] && r.cells[0].code === 'PIA');
    check(tgMD && tgMD.cells[0].status === 'host-default' && tgMD.cells[0].unconfirmed && tgMD.cells[0].host && tgMD.key === 'mom & dad' && tgMD.cells[1].code === 'momdad-k3' && tgB.rows[0].cells[0].code === 'LAX' && tgB.rows[0].me,
      'PIA-142 AC1 the migrated Thanksgiving: Mom & Dad\'s cell is their unconfirmed host default (🏠, in until they answer), merged with their Diwali cell; Ashwin (LAX) first');
    const cyAsh = row(B, 'ashwin').cells[3], cyAnjo = row(B, 'anjo').cells[3];
    check(cyAsh.own1 === '2026-12-19' && cyAnjo.own1 === '2026-12-21' && row(B, 'mom & dad').cells[3].own1 === '' && row(B, 'mom & dad').cells[3].status === 'waiting',
      'PIA-142 AC1 each cell carries that person\'s own arrival day when they set one (Cary: Ashwin 12/19, Anjo 12/21; Mom & Dad waiting, none)');
    const m8 = row(B, 'bartholomew montgomery-fitzgerald').cells[2], ol = row(B, 'oluwaseun adebayo-richardson').cells[2];
    check(m8.warn.length && m8.noteText && ol.called && row(B, 'sam lee').cells[2].noteText === 'Work' && row(B, 'sam lee').cells[2].status === 'out',
      'PIA-142 AC1 the marks come with the member: ⚠ and 📝 for Bartholomew, 📞 for Oluwaseun, ⊘ and 📝 for Sam Lee');
    const anon = M.familyBoard([model(DW), model(TH)], { name: 'Ashwin' }), anon2 = M.familyBoard([model(DW), model(TH)]);
    check(anon.rows[0].key === 'ashwin' && anon.rows[0].me && !anon2.rows.some((r) => r.me) && anon2.rows[0].key === 'mom & dad',
      'PIA-142 with no face picked on any trip, this phone\'s profile name puts that row first as me; with neither, nobody is me and rows keep their order');
    const clashDoc = tweak(TH, (d) => { d.id = 'clClashingTripIdea0c01'; d.idea.dates.departure = '2026-11-07'; d.idea.dates.return = '2026-11-10'; d.responses['ashwin-l2'].status = 'in'; });
    const dwC = model(DW, { me: 'ashwin-p8', otherTrips: [clashDoc] }), clB = M.familyBoard([dwC, model(clashDoc, { me: 'ashwin-l2', otherTrips: [DW] })]);
    check(row(clB, 'ashwin').cells[0].warn.indexOf('clash') >= 0 && row(clB, 'ashwin').cells[0] === mem(dwC, 'ashwin-p8'),
      'PIA-142 AC1 a clash is the model\'s own mark on my cell (Diwali 11/6–11/9 against a trip 11/7–11/10 on this phone): the cell is the trip view\'s member, so the two can never differ');
    const tok = M.familyBoard(ms({ hasEditKey: true, hasToken: true, fares: { x: { p: 1, f: NOW } } }));
    const hasPrice = (v) => scan(v).keys.some((k) => /^(price|prices|total|sum|p|paid|fares|per|segs)$/.test(k));
    check(tok.cols.every((m) => m.prices && m.price) && tok.rows.every((r) => !hasPrice(r)),'PIA-142 the board\'s rows carry no price on any phone (a token phone\'s models do; the board reads only their members)');
  }

  // ═══ AC11 ═══════════════════════════════════════════════════════════════
  section('AC11 the inlined region is clean, the encoder port is exact, and the suite is offline and in preflight');
  const modelSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'trip-model.js'), 'utf8');
  const BEGIN = '/* === pialax trip-model: begin === */', END = '/* === pialax trip-model: end === */';
  const b = modelSrc.indexOf(BEGIN), e = modelSrc.indexOf(END);
  check(b > 0 && e > b && modelSrc.indexOf(BEGIN, b + 1) < 0 && modelSrc.indexOf(END, e + 1) < 0, 'exactly one begin and one end marker');
  const region = modelSrc.slice(b, e + END.length);
  const banned = [[/console\.log/, 'console.log'], [/<\/script/i, 'closing script tag'], [/Date\.now|new Date\(\s*\)|performance\.now/, 'clock read'], [/Math\.random/, 'Math.random'],
    [/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/, 'network call'],
    [/localStorage|sessionStorage|indexedDB|\b(?:document|window|navigator|location)\.[A-Za-z_]/, 'DOM or storage access'],
    [/familyTotal|totalFare|perTicketFare|estimate_total/, 'stored price field']];
  banned.forEach(([re, what]) => check(!re.test(region), 'the inlined region has no ' + what, (region.match(re) || [])[0]));
  check(modelSrc.indexOf('module.exports') > e && region.indexOf('module') < 0 && /if \(typeof module !== 'undefined'/.test(modelSrc.slice(e)), 'the Node export guard sits outside the markers');
  const sandbox = new Function('"use strict";\n' + region + '\nreturn { tripModel: tripModel, gfSearchUrl: gfSearchUrl };')();
  check(mem(sandbox.tripModel(clone(lgOrg), ctx({ me: 'LAX' })), 'LAX').link.href === G.tgAshwin, 'the region runs on its own, as it will inline in app.html (no module, same result)');
  let threw = 0;
  try { M.tripModel(DW, { now: NOW }); } catch (err) { threw++; }
  try { M.tripModel(DW, { today: TODAY }); } catch (err) { threw++; }
  check(threw === 2, 'tripModel refuses to run without today and now (it never reads the clock itself)');
  const enc = (legs, adults, trip) => M.gfSearchUrl({ legs, adults, trip });
  check(enc([{ date: '2026-11-20', from: ['LAX'], to: ['PIA'] }, { date: '2026-11-29', from: ['PIA'], to: ['LAX'] }], 1, 1) === G.E1 &&
    enc([{ date: '2026-11-20', from: ['LAX'], to: ['PIA'] }, { date: '2026-11-29', from: ['ORD'], to: ['LAX'] }], 1, 3) === G.E2 &&
    enc([{ date: '2026-11-20', from: ['PIA'], to: ['RDU'] }, { date: '2026-11-29', from: ['RDU'], to: ['PIA'] }], 2, 1) === G.E3 &&
    enc([{ date: '2026-11-20', from: ['LGA', 'JFK'], to: ['PIA'] }, { date: '2026-11-29', from: ['PIA'], to: ['LGA', 'JFK'] }], 1, 1) === G.E6 &&
    M.gfSearchUrl({ adults: 2, trip: 1, legs: [{ date: '2026-11-20', from: ['LAX'], to: ['ORD'], nonstop: true, airlines: ['UA'] }, { date: '2026-11-29', from: ['ORD'], to: ['LAX'], nonstop: true, airlines: ['UA'] }] }) === G.E7,
    'the encoder port reproduces the live-verified E1, E2, E3, E6 and E7 byte for byte');
  const tgLinks = model(tg, { me: 'LAX' });
  check(mem(tgLinks, 'LAX').link.href === G.tgAshwin && mem(tgLinks, 'LAX').link.inHref === G.tgAshIn && mem(tgLinks, 'LAX').link.outHref === G.tgAshOut && mem(tgLinks, 'LGA').link.href === G.tgAnjo,
    'after P-migrate the links are unchanged: Ashwin follows the 11/20–11/29 plan (golden primary + both one-ways), Anjo keeps her own window');
  check(mem(dwM, 'ashwin-p8').link.href === G.dwAsh && mem(dwM, 'momdad-k3').link.href === G.dwMD && mem(dwM, 'anjo-z5').link.href === G.dwAnjo, 'Diwali golden links: LA set, PIA+ORD ×2, NY set ⇄ RDU');
  check(eq(M.v1SharedIds(V1), ['tgLegacyThanksgiving01', 'dwDiwaliRaleigh2026a01']) && M.v1PinFor(JSON.stringify(V1), 'tgLegacyThanksgiving01') === '2026-11-26' && M.v1PinFor(V1, 'not-an-id') === '' && M.v1SharedIds('{broken') .length === 0,
    'v1 storage is only read: its shared trip ids (bad ones dropped) and the 📌 event day per trip');
  const cmp = (re) => { const x = re.exec(workerSrc); return x ? x[1] : null; };
  check(cmp(/const CODE_RE = (\/[^\n]*\/);/) === String(M.MEMBER_CODE_RE) && +cmp(/const IDEA_MAX_MEMBERS = (\d+);/) === M.IDEA_MAX_MEMBERS &&
    ['title, 80', 'm.label, 40', 'dest.city, 60', 'raw.notes, 500', 'raw.note, 280'].every((s) => workerSrc.indexOf('ideaStr(' + (s.indexOf('.') < 0 ? 'raw.' : '') + s + ')') >= 0) &&
    M.TEXT_MAX.title === 80 && M.TEXT_MAX.label === 40 && M.TEXT_MAX.city === 60 && M.TEXT_MAX.notes === 500 && M.TEXT_MAX.note === 280,
    "member-code rule, member cap and text limits match worker.js (labels clip like the Worker's ideaStr)");
  check(M.clip('🦊' + 'x'.repeat(37) + '🐻', 40).length === 39 && M.memberLabel('🦊', 'Bartholomew Montgomery-Fitzgerald the Third').length <= 40, 'clipping never splits an emoji in half');
  const pf = fs.readFileSync(path.join(ROOT, 'scripts', 'preflight.sh'), 'utf8');
  check(/suites=\([^)]*\btest-trip-model\.sh\b[^)]*\)/.test(pf) && fs.existsSync(path.join(ROOT, 'scripts', 'test-trip-model.sh')), 'preflight runs this suite (test-trip-model.sh is in its suites list)');


  section('PIA-144 Calendar presence and overlapping trips');
  {
    const d = clone(DW); d.idea.destination = { airport: 'PIA', city: 'Peoria' };
    d.idea.dates = { departure: '2026-11-06', return: '2026-11-09', searchStart: '', searchEnd: '' };
    d.responses = { 'ashwin-p8': R('in', 'LAX', '2026-11-05', '2026-11-09'), 'anjo-z5': R('maybe', 'LGA') };
    const other = clone(d); other.id = 'calendarOtherTrip00001'; other.idea.dates.departure = '2026-11-09'; other.idea.dates.return = '2026-11-12'; other.responses = { 'ashwin-p8': R('in', 'LAX') };
    const m = model(d, { otherTrips: [other, other] });
    const day = M.calendarDay(m, '2026-11-09');
    check(day.n === 3 && day.there.includes('momdad-k3') && day.there.includes('ashwin-p8') && day.maybe.includes('anjo-z5'), 'Calendar counts the host pair as two, the traveler as one, and Maybe separately');
    check(day.n === M.presentOn(m, day.day) && eq(day.there, M.dayPeople(m, day.day).there), 'Calendar and P-day use the same presence rule');
    check(day.clashes.length === 1 && day.clashes[0].code === 'ashwin-p8' && day.clashes[0].id === other.id, 'an inclusive end/start overlap is flagged once per person/trip, even when supplied twice');
    check(!M.calendarDay(m, '2026-11-08').clashes.length && M.calendarDay(m, '2026-11-10').n === 2, 'only actual overlap days warn; host presence follows the existing trip span');
    const dropped = clone(other); dropped.decision.stage = 'dropped';
    check(!M.calendarDay(model(d, { otherTrips: [dropped] }), '2026-11-09').clashes.length, 'dropped trips cannot create a Calendar conflict');
    const away = clone(d); away.responses['ashwin-p8'].status = 'out';
    check(!M.calendarDay(model(away, { otherTrips: [other] }), '2026-11-09').clashes.length, 'an Out traveler has no Calendar clash');
    const bad = clone(d); bad.responses['ashwin-p8'].available_to = '2026-11-04';
    check(!M.calendarDay(model(bad, { otherTrips: [other] }), '2026-11-09').clashes.length, 'reversed personal dates are not counted or flagged as bookings');
    const dated = clone(d); dated.idea.dates = { departure: '2026-12-30', return: '2027-01-02' }; dated.responses['ashwin-p8'] = R('in', 'LAX');
    const mm = model(dated);
    check(['2026-12-31', '2027-01-01', '2027-01-02'].every(day => M.calendarDay(mm, day).n === 3), 'presence crosses month and year boundaries and includes the departure day');
    check(M.calendarDay(model(d), '2026-11-09').clashes.length === 0, 'a phone with only this trip claims no knowledge of other bookings');
  }
  section('PIA-143 map pricing and pickup pairs');
  {
    const d = clone(DW), cc = ctx({ hasEditKey: true, hasToken: true }), before = JSON.stringify(d);
    const preview = M.destinationCandidate(d, cc, 'PIA');
    check(preview && preview.dest === 'PIA' && preview.hosts.some(x => x.code === 'momdad-k3') && JSON.stringify(d) === before,
      'destination preview derives hosts, travelers and fares from the same record without mutating it');
    check(eq(preview.price, M.priceTrip(preview, {}, NOW)) && preview.price.total === null && !preview.price.complete,
      'an unsearched destination has no estimated fare; its total uses priceTrip');
    const f = {};
    preview.travelers.forEach(x => x.keys.forEach(k => { f[k.key] = { p: 315, f: NOW - 1000 }; }));
    const priced = M.destinationCandidate(d, Object.assign({}, cc, { fares: f }), 'PIA');
    check(priced.price.complete && priced.price.total === priced.travelers.length * 315, 'only real cached fares fill a destination total');
    check(M.destinationCandidate(d, ctx({ hasToken: true }), 'PIA') === null && M.destinationCandidate(d, ctx({ hasEditKey: true }), 'PIA') === null,
      'guests, including a token-only phone, and organizers without a token cannot price another destination');
    for (const [name, mutate] of [['locked', d => { d.decision.stage = 'chosen'; }], ['closed', d => { d.decision.stage = 'dropped'; }],
      ['booked', d => { d.responses['ashwin-p8'] = R('in', 'LAX', '', '', { booked: true }); }], ['undated', d => { d.idea.dates.departure = ''; d.idea.dates.return = ''; }]]) {
      check(M.destinationCandidate(tweak(d, mutate), cc, 'DEN') === null, name + ' trip cannot spend on a different destination');
    }
    check(M.destinationCandidate(d, cc, '<x>') === null && M.destinationCandidate(d, cc, 'ZZQ').dest === 'ZZQ', 'unknown IATA is accepted; malformed airport text is refused');
    d.responses = Object.fromEntries(d.idea.members.map(x => [x.code, R('in', x.airport)]));
    const m = M.tripModel(d, cc), ap = m.dest, day = m.plan.s, fares = {};
    m.travelers.forEach((x, i) => x.keys.forEach(k => { fares[k.key] = { p: 100 + i * 10, f: NOW - 1000,
      off: [{ p: 100 + i * 10, a: ap, ar: day + ' ' + ['08:00', '15:00', '16:00'][i] }, { p: 150 + i * 10, a: ap, ar: day + ' 15:30' }] }; }));
    const pair = M.pickupPair(m, fares, NOW, ap, day);
    check(pair && pair.sum === 230 && pair.wait === 60 && eq(pair.codes, m.travelers.slice(1).map(x => x.code)),
      'cheapest pickup pair compares distinct travelers and every cached offer within two hours, rather than taking the first two arrivals', pair);
    const stale = Object.fromEntries(Object.entries(fares).map(([k, v]) => [k, Object.assign({}, v, { f: NOW - 25 * HOUR })]));
    check(M.pickupPair(m, stale, NOW, ap, day) === null && M.pickupPair(M.tripModel(d, ctx()), fares, NOW, ap, day) === null,
      'stale fares and guest phones have no cheapest pickup pair');
    const overnight = clone(fares); Object.values(overnight).forEach(v => v.off.forEach(o => { o.ar = M.addD(day, 1) + ' 15:00'; }));
    check(M.pickupPair(m, overnight, NOW, ap, day) === null && M.pickups(m, overnight, NOW, false)[ap].every(c => !c.pred), 'an overnight offer neither forms a same-day pickup pair nor shows a time on the wrong day');
    const hostile = clone(fares); Object.values(hostile).forEach(v => v.off.forEach(o => { o.ar = '<img src=x>'; o.p = -20; }));
    check(M.pickupPair(m, hostile, NOW, ap, day) === null, 'malformed times and invalid offer prices never form a pickup pair');
    const bought = M.tripModel(tweak(d, x => { x.responses[m.travelers[1].code].booked = true; x.responses[m.travelers[2].code].booked = true; }), cc);
    check(M.pickupPair(bought, fares, NOW, ap, day) === null, 'a bought flight is never replaced by an alternative cached offer');
  }

  section('PIA-150 family faces: Ashwin 💪 and Anjo 🗽 from the preset, the legacy review and the history import; every face chosen before stays put');
  {
    // FACES as it was before PIA-150: 💪 is appended after it, so none of these may move
    const OLD = ['🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐸', '🐙', '🦉', '🐝', '🌻', '🌽', '🍉', '🍕', '🎸', '🎨', '🚲', '🗽', '🐳', '🦄', '🍩', '🐢', '🦋', '🌴'];
    const faces = (labels) => labels.map((l) => M.splitLabel(l).face + M.splitLabel(l).name);
    const presets = [M.familyPreset('', TODAY), M.familyPreset('2026-08-15', TODAY), M.familyPreset('2026-12-20', TODAY)];
    check(eq(M.FAMILY.map((f) => f.key + f.face), ['momdad🌽', 'ashwin💪', 'anjo🗽']) &&
      presets.every((p) => eq(p.map((f) => f.face + f.name), ['🌽Mom & Dad', '💪Ashwin', '🗽Anjo']) && eq(p.map((f) => f.label), ['🌽 Mom & Dad', '💪 Ashwin', '🗽 Anjo'])) &&
      eq(presets.map((p) => p[2].airport), ['LGA', 'JAX', 'LGA']) && eq(undatedCreate.body.idea.members.map((x) => x.label), ['🌽 Mom & Dad', '💪 Ashwin', '🗽 Anjo']),
      'the 👪 preset gives Mom & Dad 🌽, Ashwin 💪 and Anjo 🗽 on any date (Anjo still JAX before 9/1), and a new family trip is created with those labels');
    const lgOpts = M.migrateOptions(lgOrg, v1);
    check(eq(faces(lgOpts.labels.map((x) => x.label)), ['🌽Mom & Dad', '💪Ashwin', '🗽Anjo']) && eq(faces(tg.idea.members.map((x) => x.label)), ['🌽Mom & Dad', '💪Ashwin', '🗽Anjo']) &&
      M.migrateLabel({ code: 'LAX', label: 'Me', airport: 'LAX' }) === '💪 Ashwin' && M.migrateLabel({ code: 'x', label: 'Ashwin', airport: 'LAX' }) === '💪 Ashwin' &&
      M.migrateLabel({ code: 'y', label: 'Anjo', airport: 'JAX' }) === '🗽 Anjo' && M.migrateLabel({ code: 'z', label: '', airport: 'JFK' }) === '🗽 Anjo' &&
      M.migrateLabel({ code: 'LAX', label: '🌴 Ashwin', airport: 'LAX' }) === '🌴 Ashwin',
      'the legacy review (P-migrate) suggests 💪 Ashwin for the v1 "Me" at LAX and 🗽 Anjo at JAX / LGA / JFK; a label that already has a face keeps it (🌴 stays 🌴)');
    const hist = M.historyItems(JSON.stringify(V1), TODAY), drafts = hist.map((it) => ({ key: it.key, family: it.source.mode === 'family', d: M.historyDraft(it, TODAY) }));
    const fam = drafts.filter((x) => x.family), solo = drafts.filter((x) => !x.family);
    check(fam.length >= 3 && fam.every((x) => eq(x.d.members.map((m) => m.face + m.name), ['🌽Mom & Dad', '💪Ashwin', '🗽Anjo'])) &&
      solo.length >= 3 && solo.every((x) => x.d.members.length === 1 && x.d.members[0].face === '💪') && solo.filter((x) => x.d.members[0].name === 'Ashwin').length >= 3 &&
      drafts.find((x) => x.key === 'london').d.members[2].airport === 'JAX' && !JSON.stringify(drafts.map((x) => x.d.members)).includes('🌴'),
      'the history import gives Ashwin 💪 (the family trips and every solo trip) and Anjo 🗽 (London at her historical JAX); no 🌴 default is left', drafts.map((x) => x.key + ':' + x.d.members.map((m) => m.face).join('')));
    check(eq(M.FACES.slice(0, OLD.length), OLD) && M.FACES.length === OLD.length + 1 && M.FACES[OLD.length] === '💪' && M.FACE_RING === OLD.length &&
      new Set(M.FACES).size === M.FACES.length && M.FACES.every((f) => M.faceOf(f) === f),
      'FACES keeps its 24 faces in their order and appends 💪 at the end (one emoji, a usable face, no duplicate); the hash ring stays those 24');
    // freeFace walks FACES in order: every choice it made before is the same, and 💪 comes only after all 24
    check(OLD.every((f, k) => M.freeFace(OLD.slice(0, k)) === f && M.freeFace([], OLD.slice(0, k)) === f) && M.freeFace(OLD) === '💪' && M.freeFace([], OLD.slice(0, 23)) === '🌴' &&
      M.freeFace(['🦊'], OLD) === '💪' && M.freeFace(['🦊'], OLD.concat(['💪'])) === '🐻',
      'freeFace makes the same choice as before while any older face is free, and offers 💪 only once the 24 older faces are taken (on the trip, or on this phone\'s other trips)');
    // a face derived from a name (a faceless v1 label read by the model, a row written without a face) is the same as before
    const oldAuto = (norm, used) => { const s = M.fnv1a(norm) % OLD.length; for (let i = 0; i < OLD.length; i++) { const f = OLD[(s + i) % OLD.length]; if (used.indexOf(f) < 0) return f; } return OLD[s]; };
    const NAMES = ['Mom & Dad', 'Anjo', 'Ashwin', 'Priya', 'Maya', 'Leo', 'Sam Lee', 'Grandma Josephine', 'Bo', 'Ana', 'Guadalupe Hernández-Villanueva', 'Oluwaseun', 'Zed', 'Kim', 'Ravi', 'Lena'];
    let hashMoved = 0, readMoved = 0, writeMoved = 0;
    for (let i = 0; i < 4000; i++) { const n = 'person ' + i; if (M.hashedFace(n) !== OLD[M.fnv1a(n) % OLD.length]) hashMoved++; }
    NAMES.forEach((n) => { if (M.hashedFace(M.normName(n)) !== OLD[M.fnv1a(M.normName(n)) % OLD.length]) hashMoved++; });
    for (let t = 0; t < 300; t++) {
      const k = 1 + (t % 8), names = [];
      for (let j = 0; j < k; j++) names.push(NAMES[(t * 7 + j * 5) % NAMES.length] + (j && (t + j) % 3 === 0 ? ' ' + t : ''));
      const uniqNames = [...new Set(names)];
      const doc = tweak(LEG, (d) => { d.id = 'pia150FaceRing' + String(t).padStart(8, '0'); d.idea.members = uniqNames.map((n, j) => ({ code: 'c' + j, label: n, airport: 'DEN', headcount: 1 })); d.responses = {}; });
      const shown = [], want = uniqNames.map((n) => { const f = oldAuto(M.normName(n), shown); shown.push(f); return f; });
      if (!eq(model(doc).members.map((x) => x.face), want)) readMoved++;
      const cr = M.createRequest({ emoji: '🎉', name: 't', dest: { airport: 'RDU' }, members: uniqNames.map((n) => ({ name: n, airport: 'DEN' })) }, { today: TODAY });
      const used = [], wrote = uniqNames.map((n) => { const f = oldAuto(M.normName(n), used); used.push(f); return f; });
      if (!cr || !eq(cr.body.idea.members.map((x) => M.splitLabel(x.label).face), wrote)) writeMoved++;
    }
    // PIA-152: the legacy Thanksgiving's family shows the preset (🌽 💪 🗽); the same faceless labels away from the family's airports
    // (nobody the preset recognises) still show the faces derived from their names, as before 💪: Anjo there is still 🐻
    const lgFaces = model(LEG).members.map((x) => x.face);
    const awayFaces = model(tweak(LEG, (d) => { d.idea.members.forEach((x, j) => { x.airport = ['DEN', 'SEA', 'BOS'][j]; }); })).members.map((x) => x.face);
    check(hashMoved === 0 && readMoved === 0 && writeMoved === 0 && eq(lgFaces, ['🌽', '💪', '🗽']) &&
      eq(awayFaces, [oldAuto('mom & dad', []), oldAuto('#LAX', [awayFaces[0]]), oldAuto('anjo', awayFaces.slice(0, 2))]) && awayFaces[2] === '🐻',
      'a face derived from a name never moves: hashed faces (4,016 names), the faces a faceless v1 trip of people the family preset does not recognise shows (300 trips, and the legacy Thanksgiving\'s labels away from the family\'s airports: Anjo still 🐻) and the faces written for faceless rows (300 creates) are what they were before 💪; the legacy Thanksgiving itself shows the family\'s 🌽 💪 🗽 (PIA-152)', { hashMoved, readMoved, writeMoved, lgFaces, awayFaces });
    // PIA-152: on the Thanksgiving with friends, a friend shows the face derived before PIA-152 (the family's old stand-ins 🦄 🍩 🐻 still
    // ahead of them), unless it is a face the family now shows (🌽 / 🗽): then a face of their own nobody else on the trip shows
    const FR = ['Sam', 'Bob', 'Nina', 'Frank', 'Priya', 'Maya', 'Leo', 'Max', 'Ravi', 'Lena', 'Kim', 'Zed', 'Oluwaseun', 'Bo'];
    let mixFamily = 0, mixMoved = 0, mixOff = 0, mixBad = 0;
    for (let t = 0; t < 300; t++) {
      const fr = []; for (let j = 0; j < 1 + (t % 5); j++) { const n = FR[(t * 5 + j * 3) % FR.length]; if (fr.indexOf(n) < 0) fr.push(n); }
      const doc = tweak(LEG, (d) => { d.idea.members = d.idea.members.concat(fr.map((n, j) => ({ code: 'f' + j, label: n, airport: ['BOS', 'DEN', 'SEA', 'SFO', 'MIA'][j], headcount: 1 }))); });
      const was = []; ['mom & dad', '#LAX', 'anjo'].concat(fr.map(M.normName)).forEach((n) => was.push(oldAuto(n, was)));
      const got = model(doc).members.map((x) => x.face);
      if (!eq(got.slice(0, 3), ['🌽', '💪', '🗽'])) mixFamily++;
      if (new Set(got).size !== got.length) mixBad++;
      got.slice(3).forEach((f, j) => { const w = was[3 + j]; if (['🌽', '🗽'].indexOf(w) < 0) { if (f !== w) mixMoved++; } else { mixOff++; if (f === w || was.slice(3).indexOf(f) >= 0) mixBad++; } });
    }
    const samFace = model(tweak(LEG, (d) => { d.idea.members.push({ code: 'sam', label: 'Sam', airport: 'BOS', headcount: 1 }); })).members[3].face;
    check(mixFamily === 0 && mixMoved === 0 && mixBad === 0 && mixOff > 0 && samFace === '🐢' && samFace === oldAuto('sam', ['🦄', '🍩', '🐻']),
      'PIA-152 a friend\'s face never moves on a v1 trip with the family (300 trips of the Thanksgiving and 1 to 5 friends; Sam at BOS stays 🐢, not the 🍩 the family no longer holds), except a friend whose face was one the family now shows (🌽 / 🗽), who gets a face nobody else there has', { mixFamily, mixMoved, mixOff, mixBad, samFace });
    // a trip saved with 🌴 keeps it: the record's faces are its own
    const keptDw = model(DW, { me: 'ashwin-p8' });
    check(mem(keptDw, 'ashwin-p8').face === '🌴' && mem(keptDw, 'anjo-z5').face === '🗽' && mem(keptDw, 'momdad-k3').face === '🌽',
      'a trip already saved keeps the faces stored in it (Diwali\'s Ashwin is still 🌴); the organizer changes a face in ✎');
  }

  section('PIA-151 my flight: each traveler\'s two ends in one place; a booked day is stored as theirs; different days per person agree everywhere');
  {
    // Diwali (RDU, 11/6–11/9, 📌 11/8): Anjo lands a day early and leaves a day early (11/5–11/8, her own); Ashwin follows the plan
    const ANJ = tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA', '2026-11-05', '2026-11-08'); });
    const orgCtx = { me: 'ashwin-p8', hasEditKey: true, hasToken: true };
    const five = (doc, who, d1, d2) => {
      const m = model(doc, orgCtx), x = mem(m, who), fe = M.flightEnds(m, who), out = {};
      out.rows = fe ? fe.map((e) => e.day) : null;
      const gf = M.handoffs(m, who, { today: TODAY, now: NOW }).gf, dec = gf ? M.gfDecode(gf.href) : null;
      out.book = dec ? dec.legs.map((L) => L.date) : null;
      const keys = M.tapKeys(m).filter((k) => x.keys.some((q) => q.key === k)), q = keys.map((k) => M.searchQuery(k));
      out.search = keys.map((k) => { const p = M.parseFareKey(k); return [p.d, p.r]; });
      out.query = q.every((s) => s.indexOf('outbound_date=' + d1) >= 0 && s.indexOf('return_date=' + d2) >= 0) && q.length === 1;
      out.cal = [M.addD(d1, -1), d1, d2, M.addD(d2, 1)].map((day) => M.calendarDay(m, day).there.indexOf(who) >= 0);
      const lane = M.pickups(m, {}, NOW, false)[m.dest] || [];
      out.map = ['arr', 'dep'].map((k) => (lane.filter((c) => c.kind === k && c.codes.indexOf(who) >= 0)[0] || {}).date || '');
      out.ok = eq(out.rows, [d1, d2]) && eq(out.book, [d1, d2]) && eq(out.search, [[d1, d2]]) && out.query && eq(out.cal, [false, true, true, false]) && eq(out.map, [d1, d2]);
      return out;
    };
    const a1 = five(ANJ, 'anjo-z5', '2026-11-05', '2026-11-08'), s1 = five(ANJ, 'ashwin-p8', '2026-11-06', '2026-11-09');
    check(a1.ok && s1.ok,
      'AC6 Anjo on her own 11/5–11/8, Ashwin on the plan\'s 11/6–11/9: each one\'s flight rows, Book link (Google Flights legs), the organizer\'s price search (the Worker query\'s dates), Calendar presence (the day before and after: not there) and Map pickups (landing and leaving day) all read that traveler\'s own days', { a1, s1 });
    const m1 = model(ANJ, orgCtx), fa = M.flightEnds(m1, 'anjo-z5'), fs = M.flightEnds(m1, 'ashwin-p8');
    check(fa[0].own && fa[1].own && !fa[0].follow && fa[0].off && !fa[1].off && fs[0].follow && fs[1].follow && !fs[0].own && fs.every((e) => e.ap === 'RDU' && e.aps.length === 0 && e.time === '') &&
      M.flightEnds(m1, 'momdad-k3')[0].follow && M.flightEnds(model(tg), 'PIA') === null && M.flightEnds(model(tweak(ANJ, (d) => { d.responses['anjo-z5'].status = 'out'; })), 'anjo-z5') === null && M.flightEnds(m1, 'nobody') === null,
      'AC1/AC3 flightEnds: Anjo\'s ends are her own (her 11/5 arrival is off the plan: ⚠), Ashwin\'s and Mom & Dad\'s follow the plan; RDU is no hub pair, so no airport choice; nothing for a host, someone out or nobody');
    const pia = model(tweak(tg, (d) => { d.responses.LGA = R('in', 'LGA', '', '', { leave_from: 'ORD', booked: true, note: '🛬09:05 🛫18:30 Red-eye' }); }), { me: 'LGA' }), fl = M.flightEnds(pia, 'LGA');
    check(eq(fl.map((e) => [e.ap, e.aps.join('|'), e.time, e.follow, e.own, e.booked]), [['PIA', 'PIA|ORD', '09:05', false, false, true], ['ORD', 'PIA|ORD', '18:30', false, false, true]]),
      'AC1/AC3 on Thanksgiving (PIA|ORD) Anjo\'s booked ends: PIA in, ORD home, a hub choice each, her recorded 09:05 and 18:30; booked days never read as following the plan, even blank in the record');
    // a booked traveler's pick is her own day, even on the plan's own day; an unbooked one there still follows the plan
    const bkOwn = tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA', '2026-11-05', '', { booked: true }); });
    const ub = tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA', '2026-11-05', ''); });
    const bkBlank = tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA', '', '', { booked: true }); });
    const pb = M.ownDays(model(bkOwn), 'anjo-z5', '2026-11-06', '', 0, TODAY), pu = M.ownDays(model(ub), 'anjo-z5', '2026-11-06', '', 0, TODAY);
    const pbl = M.ownDays(model(bkBlank), 'anjo-z5', '2026-11-06', '', 0, TODAY), pbl2 = M.ownDays(model(bkBlank), 'anjo-z5', '', '2026-11-09', 1, TODAY), ls = M.legShift(model(bkOwn), 'anjo-z5', 0, 1, TODAY);
    check(eq(pb.patch, { available_from: '2026-11-06' }) && !pb.same && eq(pu.patch, { available_from: '' }) && !pu.same && !pbl.same && eq(pbl.patch, { available_from: '2026-11-06' }) &&
      !pbl2.same && eq(pbl2.patch, { available_to: '2026-11-09' }) && eq(ls.patch, { available_from: '2026-11-06' }),
      'AC3 booked Anjo moving her arrival from 11/5 onto the plan\'s 11/6 stores 11/6 as her own (±1 too); unbooked she would follow the plan again (blank); booked with an end still blank, a pick of the day it already is (the plan\'s 11/6, or 11/9 to leave) stores that day as hers: "my flight is this day" is always recorded', [pb.patch, pu.patch, pbl.patch, pbl2.patch]);
    // a booked end never goes back to following the plan: a blank pick (Follow plan) keeps the day of her own; still blank stays blank
    const fo = M.ownDays(model(bkOwn), 'anjo-z5', '', '', null, TODAY), fb = M.ownDays(model(bkBlank), 'anjo-z5', '', '', null, TODAY), fu = M.ownDays(model(ub), 'anjo-z5', '', '', null, TODAY);
    check(fo.same && eq(fo.patch, { available_from: '2026-11-05', available_to: '' }) && fb.same && eq(fb.patch, { available_from: '', available_to: '' }) && !fu.same && eq(fu.patch, { available_from: '', available_to: '' }),
      'AC3 booked, a blank pick ("follow the plan") keeps her own 11/5 and changes nothing (No change), and a booked end still blank stays as it is; unbooked, the same pick follows the plan again', [fo.patch, fb.patch, fu.patch]);
    // AC5 / AC8 the 🎫 is in her flight section before the 🔒 (a flight bought early can be recorded): hers once she has answered, the
    // organizer's for anyone with days ahead (a confirming tap for someone waiting); never on a past, closed or v1 trip, nor with no days
    const slot5 = (doc, ctx2, code) => M.bookSlot(model(doc, ctx2), code, TODAY);
    const ub0 = tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA'); }), ORG5 = { me: 'ashwin-p8', hasEditKey: true };
    const und = tweak(ub0, (d) => { d.idea.dates.departure = ''; d.idea.dates.return = ''; });
    const pastT = tweak(ub0, (d) => { d.idea.dates.departure = '2026-10-01'; d.idea.dates.return = '2026-10-04'; d.idea.notes = ''; });
    const b5 = [slot5(ub0, { me: 'anjo-z5' }, 'anjo-z5'), slot5(ub0, ORG5, 'anjo-z5'), slot5(DW, ORG5, 'anjo-z5'), slot5(ub0, ORG5, 'ashwin-p8'), slot5(und, { me: 'anjo-z5' }, 'anjo-z5'), slot5(pastT, { me: 'anjo-z5' }, 'anjo-z5'), slot5(DW, { me: 'anjo-z5' }, 'anjo-z5')];
    check(eq(b5.map((s) => [s.slot, s.tk, s.early]), [['book', 'self', true], ['book', 'org', true], ['book', 'org', true], ['book', 'self', true], ['gf', '', false], ['gf', '', false], ['gf', '', true]]) &&
      M.bookToggle(model(ub0, ORG5), 'anjo-z5') === null && eq(M.bookToggle(model(DW, ORG5), 'anjo-z5', true), { on: false, confirm: true }) && M.primaryAction(model(ub0, { me: 'anjo-z5' }), TODAY) === 'none' &&
      M.earlyBook(model(tweak(ub0, (d) => { d.decision = clone(CHOSEN); })), 'anjo-z5', TODAY) === false && M.earlyBook(model(tweak(ub0, (d) => { d.decision.stage = 'dropped'; })), 'anjo-z5', TODAY) === false,
      'PIA-151 AC5 before the 🔒: her flight section has [✈ Book ↗ | 🎫] (hers once she answered; the organizer\'s for her, a confirming tap while she is waiting; his own), the board\'s 🎫 keeps its rule (PIA-154: a guest\'s trip view has no primary before 🔒); no 🎫 with no days, on a trip that is over, or before she answers', b5);
    // through the real Worker: her booked 11/6 is stored; the organizer moves the plan +1: her booked flight stays, Ashwin follows,
    // and all five places agree on both of them again
    const id = srv.seed(tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA', '2026-11-05', '2026-11-08', { booked: true, note: '🛬09:05 🛫18:30' }); }));
    const f0 = await srv.get(id), op = M.ownDays(model(f0), 'anjo-z5', '2026-11-06', '', 0, TODAY);
    const r0 = await srv.send(M.respondRequest(f0, 'anjo-z5', op.patch, { by: 'self' })), f1 = await srv.get(id);
    const mv = M.organizerEdit(await srv.get(id, KEY), KEY, { dates: { departure: '2026-11-07', return: '2026-11-10' } }), r1 = await srv.send(mv), f2 = await srv.get(id);
    const a2 = five(f2, 'anjo-z5', '2026-11-06', '2026-11-08'), s2 = five(f2, 'ashwin-p8', '2026-11-07', '2026-11-10'), x2 = f2.responses['anjo-z5'];
    check(srv.allOk(r0) && f1.responses['anjo-z5'].available_from === '2026-11-06' && f1.responses['anjo-z5'].note === '🛬09:05 🛫18:30' && f1.responses['anjo-z5'].booked && srv.allOk(r1) && mv.length === 1 &&
      x2.available_from === '2026-11-06' && x2.available_to === '2026-11-08' && x2.booked && a2.rows && eq(a2.rows, ['2026-11-06', '2026-11-08']) && eq(a2.map, ['2026-11-06', '2026-11-08']) && eq(a2.cal, [false, true, true, false]) &&
      a2.search.length === 0 && s2.ok,
      'AC3/AC6 through the real Worker: booked Anjo\'s 11/6 is stored as hers (times and 🎫 kept); the plan moves to 11/7–11/10 in one update: her flight stays 11/6–11/8 (rows, Calendar, Map; a bought flight is never searched again), Ashwin\'s five places move with the plan', { a2, s2, x2 });
    // a booked traveler whose ends were blank is pinned by the move itself (the model's rule, kept), so her rows never jump
    const id2 = srv.seed(tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA', '', '', { booked: true }); }));
    const mv2 = M.organizerEdit(await srv.get(id2, KEY), KEY, { dates: { departure: '2026-11-07', return: '2026-11-10' } }), r2 = await srv.send(mv2), g2 = await srv.get(id2);
    check(srv.allOk(r2) && mv2.length === 2 && eq(M.flightEnds(model(g2), 'anjo-z5').map((e) => e.day), ['2026-11-06', '2026-11-09']) && g2.responses['anjo-z5'].available_from === '2026-11-06',
      'AC3 a booked traveler still following in the record is pinned to her booked 11/6–11/9 before the plan moves (organizerEdit, unchanged): her flight rows read the same days after the move');
  }

  section('PIA-152 a smooth first look: a v1 trip shows the family\'s own faces (read from the record, never written), and ⤒ Update trip keeps every face');
  {
    const RING = M.FACES.slice(0, M.FACE_RING);
    const oldAuto = (norm, used) => { const s = M.fnv1a(norm) % RING.length; for (let i = 0; i < RING.length; i++) { const f = RING[(s + i) % RING.length]; if (used.indexOf(f) < 0) return f; } return RING[s]; };
    const facesOf = (m) => m.members.map((x) => x.code + x.face).join(' ');
    // AC1 the legacy Thanksgiving on every phone: the organizer's, a guest's, a phone that is nobody there, Mom's
    const before = JSON.stringify(lgOrg), beforeG = JSON.stringify(lgGuest), beforeL = JSON.stringify(LEG);
    const ms = [model(lgOrg, { me: 'LAX', hasEditKey: true, hasToken: true }), model(lgGuest, { me: 'LGA' }), model(lgGuest), model(LEG, { me: 'PIA' })];
    const meX = mem(ms[0], 'LAX');
    check(ms.every((m) => facesOf(m) === 'PIA🌽 LAX💪 LGA🗽' && m.legacy) && meX.name === '' && meX.norm === '' && meX.short === '' && meX.label === '💪' &&
      JSON.stringify(lgOrg) === before && JSON.stringify(lgGuest) === beforeG && JSON.stringify(LEG) === beforeL && lgOrg.idea.members.every((x) => !M.splitLabel(x.label).face),
      'AC1 the unmigrated legacy Thanksgiving shows the family preset\'s faces on every phone (organizer, guest, nobody, Mom): 🌽 Mom & Dad, 💪 the v1 "Me" at LAX, 🗽 Anjo at LGA; the "Me" still has no name (its label is its face alone, never a pickable word); the record is untouched (its labels stay faceless)', ms.map(facesOf));
    // the rule is migrateLabel's own: whoever P-migrate gives the preset's label shows the preset's face already. migrateLabel's own
    // outputs are pinned literally (what it wrote before PIA-152 factored familyOf out of it), so a change to the shared rule fails here
    const cases = [['a', 'Me', 'LAX'], ['b', 'Ashwin', 'LAX'], ['c', '', 'LAX'], ['d', 'Anjo', 'JAX'], ['e', 'Anjo', 'JFK'], ['f', 'anjo', 'EWR'], ['g', 'Mom & Dad', 'ORD'], ['g2', 'Mom &  dad', 'PIA'],
      ['h', 'Priya', 'LAX'], ['i', 'Anjo', 'SEA'], ['j', '🌴 Ashwin', 'LAX'], ['k', 'Me', 'DEN'], ['l', 'Mom', 'PIA'], ['m', 'Ashwin', ''], ['n', '🦊 Me', 'LGA']].map(([code, label, airport]) => ({ code, label, airport, headcount: 1 }));
    const LIT = ['💪 Ashwin', '💪 Ashwin', '💪 Ashwin', '🗽 Anjo', '🗽 Anjo', '🗽 Anjo', '🌽 Mom & Dad', '🌽 Mom & Dad', '🦊 Priya', '🐻 Anjo', '🌴 Ashwin', '🐳 k', '🚲 Mom', '🐙 Ashwin', '🗽 Anjo'];
    const presetLabel = (l) => M.FAMILY.some((g) => l === M.memberLabel(g.face, g.name));
    const rule = cases.map((c, k) => { const f = M.familyOf(c), alone = model(tweak(LEG, (d) => { d.idea.members = [c]; d.responses = {}; })).members[0];
      return { code: c.code, key: f ? f.key : '', wrote0: M.migrateLabel(c), lit: LIT[k], agree: !!f === presetLabel(LIT[k]), face: alone.face, wrote: M.splitLabel(M.migrateLabels([c])[0].label).face }; });
    check(eq(rule.map((r) => r.key), ['ashwin', 'ashwin', 'ashwin', 'anjo', 'anjo', 'anjo', 'momdad', 'momdad', '', '', '', '', '', '', 'anjo']) && eq(rule.map((r) => r.wrote0), LIT) && rule.every((r) => r.agree && r.face === r.wrote) &&
      eq(rule.filter((r) => r.key).map((r) => r.face), ['💪', '💪', '💪', '🗽', '🗽', '🗽', '🌽', '🌽', '🗽']) && rule.find((r) => r.code === 'j').face === '🌴' && rule.find((r) => r.code === 'h').face === oldAuto('priya', []),
      'AC1 recognised by migrateLabel\'s own rule (the home airport, and a matching name, a v1 "Me" or no name): the preset\'s face, alone on a trip; Priya at LAX, Anjo at SEA, a "Me" at DEN, "Mom", an airport-less Ashwin are nobody\'s preset (a hashed face); a face already on a label stays (🌴), and a "🦊 Me" at LGA is Anjo (🗽, as P-migrate always wrote); migrateLabel writes exactly what it wrote before (15 literal labels); what each shows is what P-migrate writes', rule);
    // AC1 anyone else keeps the face they showed before PIA-152; faces stay unique. The oracle is the rule before PIA-152, written out here:
    // stored faces first, then every faceless row in member order (the family's stand-ins 🦄 🍩 🐻 too) gets its name's hashed face, moved on
    // past the faces already shown. A friend keeps that face unless the family now shows it (Nina's 🗽, Frank's 🌽): then the next free one
    const MIX = tweak(LEG, (d) => { d.id = 'pia152MixedLegacy00001'; d.idea.members = d.idea.members.concat([{ code: 'sam', label: 'Sam', airport: 'BOS', headcount: 1 }, { code: 'nina', label: 'nina', airport: 'DEN', headcount: 1 },
      { code: 'frank', label: 'Frank', airport: 'SEA', headcount: 1 }, { code: 'leo', label: '🐼 Leo', airport: 'SEA', headcount: 1 }, { code: 'bos', label: 'Me', airport: 'BOS', headcount: 1 }]); });
    const mixBefore = JSON.stringify(MIX), mx = model(MIX), mf = mx.members.map((x) => x.face);
    const today = [], used = ['🐼'];
    ['mom & dad', '#LAX', 'anjo', 'sam', 'nina', 'frank', null, '#bos'].forEach((n) => { if (!n) { today.push('🐼'); return; } const f = oldAuto(n, used); used.push(f); today.push(f); });
    check(MIX.idea.members.length === M.IDEA_MAX_MEMBERS && eq(today, ['🦄', '🍩', '🐻', '🐢', '🗽', '🌽', '🐼', today[7]]) && eq(mf, ['🌽', '💪', '🗽', '🐢', '🐳', '🍉', '🐼', today[7]]) &&
      [3, 6, 7].every((k) => mf[k] === today[k]) && new Set(mf).size === 8 && mem(mx, 'bos').name === '' && JSON.stringify(MIX) === mixBefore,
      'AC1 on a v1 trip with friends too (8 people): the family shows 🌽 💪 🗽; Sam keeps 🐢 (not the 🍩 the family no longer holds), Leo his own 🐼, the "Me" at BOS the face it showed before PIA-152; only a friend whose face the family now shows moves to the next free one (Nina 🗽 → 🐳, Frank 🌽 → 🍉); eight faces, eight tiles; the "Me" has no name; nothing written', { mf, today });
    const CL = tweak(LEG, (d) => { d.idea.members.unshift({ code: 'corn', label: '🌽 Corn', airport: 'DEN', headcount: 1 }); d.idea.members.push({ code: 'jfk', label: '', airport: 'JFK', headcount: 1 }); });
    const cf = model(CL).members.map((x) => x.face), clWas = [];
    ['mom & dad', '#LAX', 'anjo', '?'].forEach((n) => clWas.push(oldAuto(n, ['🌽'].concat(clWas))));
    check(eq(cf, ['🌽', clWas[0], '💪', '🗽', clWas[3]]) && cf[1] === '🦄' && new Set(cf).size === 5,
      'AC1 faces stay unique and are never taken: a friend\'s stored 🌽 keeps it (Mom & Dad then keeps the face they showed before, 🦄), and a second person the preset would call Anjo (a nameless row at JFK) keeps the face they showed before, not a second 🗽', { cf, clWas });
    // a v2 trip shows exactly the faces stored in it (Diwali keeps Ashwin's 🌴; every fixture, every member)
    const v2docs = [DW, TH, M8, CY, LX, tg], v2 = v2docs.map((d) => model(d));
    const stored = v2docs.every((d, k) => eq(v2[k].members.map((x) => x.face), d.idea.members.map((x) => M.splitLabel(x.label).face)));
    check(stored && !v2.some((m) => m.legacy) && mem(v2[0], 'ashwin-p8').face === '🌴',
      'AC1 a v2 trip (every fixture, and the migrated Thanksgiving) shows exactly the faces stored in its labels: the preset never changes a face a trip already has (Diwali\'s Ashwin stays 🌴)');
    // the screens all read these faces: the Family board's rows, the Map's pickup lanes
    const B = M.familyBoard([ms[3], model(DW, { me: 'momdad-k3' })], {}), lanes = M.pickups(ms[0], {}, NOW, false);
    const laneFaces = [].concat(...Object.values(lanes).map((l) => [].concat(...l.map((c) => c.faces || []))));
    check(B.rows.find((r) => r.key === 'anjo').cells[1] && B.rows.find((r) => r.key === 'anjo').cells.every((c) => !c || c.face === '🗽') && laneFaces.length >= 2 && laneFaces.every((f) => ['💪', '🗽'].indexOf(f) >= 0) &&
      B.rows.find((r) => r.key === 'ashwin').cells[0] && B.rows.find((r) => r.key === 'ashwin').cells[0].code === 'LAX' && B.rows.find((r) => r.key === 'ashwin').cells[0].face === '💪',
      'AC1 every screen reads them: on the Family board Anjo is 🗽 on both trips, the v1 "Me" is 💪 in Ashwin\'s row; the Map\'s pickup lanes show 💪 and 🗽', { laneFaces });
    // AC1 after ⤒ Update trip the faces are identical (through the real Worker): the Thanksgiving, and the v1 trip with friends
    const byCode = (m) => Object.fromEntries(m.members.map((x) => [x.code, x.face]));
    const mxId = srv.seed(MIX), mxOrg = await srv.get(mxId, KEY), mo = M.migrateOptions(mxOrg, null), mr = M.migrateRequests(mxOrg, KEY, { plan: mo.current, pin: mo.pin, labels: mo.labels });
    const mxRes = await srv.send(mr), mxAfter = await srv.get(mxId, KEY);
    const plain = M.migrateRequests(mxOrg, KEY, { plan: mo.current, pin: mo.pin }), plainLabels = plain.find((q) => /\/idea\/update/.test(q.path)).body.idea.members.map((x) => x.label);
    check(eq(byCode(model(tg)), byCode(model(lgOrg))) && eq(tg.idea.members.map((x) => x.label), ['🌽 Mom & Dad', '💪 Ashwin', '🗽 Anjo']) &&
      srv.allOk(mxRes) && !model(mxAfter).legacy && eq(byCode(model(mxAfter)), byCode(model(mxOrg))) && eq(mo.labels.map((x) => M.splitLabel(x.label).face), mf) &&
      eq(mxAfter.idea.members.map((x) => x.label), ['🌽 Mom & Dad', '💪 Ashwin', '🗽 Anjo', '🐢 Sam', '🐳 nina', '🍉 Frank', '🐼 Leo', today[7] + ' bos']) && eq(plainLabels, mxAfter.idea.members.map((x) => x.label)) &&
      new Set(mxAfter.idea.members.map((x) => M.splitLabel(x.label).face)).size === 8,
      'AC1 after ⤒ Update trip (the real Worker) every face is what it was: the Thanksgiving writes 🌽 Mom & Dad, 💪 Ashwin, 🗽 Anjo; on the trip with friends P-migrate suggests the faces shown and writes them (🐢 Sam, 🐳 nina, 🍉 Frank, the "Me" at BOS named by its code; no jump, no face twice), with or without the review\'s labels', { labels: mxAfter.idea.members.map((x) => x.label) });
  }

  section('PIA-153 housekeeping in two taps, plan vs my days: a v1 trip\'s own flight section, the update that renames, my days beside the plan');
  {
    // AC4a on the unmigrated v1 Thanksgiving a traveler who picked her own face (Anjo) has the v2 flight section: [✈ Book ↗ | 🎫] in
    // her sheet (earlyBook: no 🔒 on a v1 doc), the organizer's own too; only his 🎫 for someone else still waits for ⤒ Update trip
    const lgA = model(lgGuest, { me: 'LGA' }), lgO = model(lgOrg, { me: 'LAX', hasEditKey: true }), sl = (m, c) => { const s = M.bookSlot(m, c, TODAY); return [s.slot, s.tk, s.early]; };
    check(lgA.legacy && eq(sl(lgA, 'LGA'), ['book', 'self', true]) && eq(sl(lgO, 'LAX'), ['book', 'self', true]) && eq(sl(lgO, 'LGA'), ['gf', '', true]) &&
      M.bookToggle(lgO, 'LGA', true) === null && M.primaryAction(lgA, TODAY) === 'none' && M.earlyBook(lgA, 'LGA', TODAY) &&
      !M.earlyBook(model(tweak(lgGuest, (d) => { d.decision = { stage: 'dropped' }; }), { me: 'LGA' }), 'LGA', TODAY),
      'AC4a a v1 trip (not updated): Anjo\'s own flight section is [✈ Book ↗ | 🎫] (early, as on a v2 trip still Asking), the organizer\'s own too; his 🎫 for Anjo waits for ⤒ Update trip (no bookToggle); the trip view has no primary for her before 🔒 (PIA-154); none on a dropped trip');
    // through the real Worker: her 🎫 on the v1 record, then her landing and leaving times; the record stays a v1 doc until the update,
    // which keeps her 🎫, days and times
    const vId = srv.seed(LEG), v0 = await srv.get(vId), bk = await srv.send(M.bookedRequests(v0, 'LGA', true, { by: 'self' })), v1d = await srv.get(vId);
    const tq = M.timesRequest(v1d, 'LGA', '09:05', '18:30', M.timesBy(model(v1d, { me: 'LGA' }), 'LGA')), tr = await srv.send(tq), v2d = await srv.get(vId), mA = model(v2d, { me: 'LGA' });
    const vOrg = await srv.get(vId, KEY), mo3 = M.migrateOptions(vOrg, null), mr3 = await srv.send(M.migrateRequests(vOrg, KEY, { plan: mo3.current, pin: mo3.pin, labels: mo3.labels })), v3 = await srv.get(vId), x3 = v3.responses.LGA;
    check(srv.allOk(bk) && srv.allOk(tr) && M.docLegacy(v2d) && v2d.responses.LGA.booked && v2d.responses.LGA.note === '🛬09:05 🛫18:30 Arriving late, PTO approved' &&
      v2d.responses.LGA.available_from === '2026-11-24' && v2d.responses.LGA.leave_from === 'ORD' && mA.stage === 'booking' && M.timesBy(mA, 'LGA') === 'self' &&
      eq(M.flightEnds(mA, 'LGA').map((e) => e.time), ['09:05', '18:30']) && eq(M.bookSlot(mA, 'LGA', TODAY).slot, 'booked') && JSON.stringify(v2d.idea) === JSON.stringify(v0.idea) &&
      srv.allOk(mr3) && !M.docLegacy(v3) && x3.booked && x3.note === v2d.responses.LGA.note && x3.available_from === '2026-11-24' && x3.leave_from === 'ORD',
      'AC4a through the real Worker on the v1 record: Anjo\'s 🎫 (her own answer kept), then 🛬 09:05 / 🛫 18:30 in her note\'s prefix (her own write drops v1\'s "(entered by …)" mark, as every own answer does); the trip reads 🎫 Booking with her times on both rows; the record\'s idea is untouched (still v1); ⤒ Update trip later keeps her 🎫, days, airports and times', { note: v2d.responses.LGA.note, after: x3 });
    // AC3 the update renames in the same write: P-edit's picture and name ("Chicago trip" → "🦃 Thanksgiving"); one left as it was is
    // not sent, and a title with no name is refused
    const ch = tweak(LEG, (d) => { d.idea.title = 'Chicago trip'; }), cId = srv.seed(ch), cOrg = await srv.get(cId, KEY), co = M.migrateOptions(cOrg, null);
    const base = { plan: co.current, pin: co.pin, labels: co.labels }, withT = M.migrateRequests(cOrg, KEY, Object.assign({ title: '🦃 Thanksgiving' }, base));
    const ups = withT.filter((q) => /\/idea\/update/.test(q.path)), same = M.migrateRequests(cOrg, KEY, Object.assign({ title: 'Chicago trip' }, base)), plain = M.migrateRequests(cOrg, KEY, base);
    const cr = await srv.send(withT), cAfter = await srv.get(cId, KEY);
    check(ups.length === 1 && ups[0].body.idea.title === '🦃 Thanksgiving' && eq(same.map((q) => q.body), plain.map((q) => q.body)) && plain.find((q) => /\/idea\/update/.test(q.path)).body.idea.title === 'Chicago trip' &&
      M.migrateRequests(cOrg, KEY, Object.assign({ title: '🦃' }, base)) === null && M.migrateRequests(cOrg, KEY, Object.assign({ title: '   ' }, base)) === null && M.migrateRequests(cOrg, KEY, Object.assign({ title: 7 }, base)) === null &&
      srv.allOk(cr) && cAfter.idea.title === '🦃 Thanksgiving' && !M.docLegacy(cAfter) && model(cAfter).emoji === '🦃' && model(cAfter).name === 'Thanksgiving' && eq(cAfter.idea.members.map((x) => x.label), ['🌽 Mom & Dad', '💪 Ashwin', '🗽 Anjo']),
      'AC3 ⤒ Update trip renames in its one update: "Chicago trip" → "🦃 Thanksgiving" (picture and name, through the real Worker, faces and plan as reviewed); the name as it was sends exactly what the update sent before; a picture with no name (or none at all) is refused', { title: cAfter.idea.title });
    // AC1 my days beside the plan (mineVsPlan): Diwali's plan 11/6–11/9 (📌 11/8)
    const mv = (doc, me, over) => M.mineVsPlan(model(doc, Object.assign({ me }, over || {})), TODAY);
    const ANJ3 = tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA', '2026-11-05', '2026-11-08'); });
    const INS = tweak(DW, (d) => { d.responses['anjo-z5'] = R('in', 'LGA', '2026-11-07', ''); });
    const BKD = tweak(ANJ3, (d) => { d.responses['anjo-z5'].booked = true; });
    const ASH = tweak(DW, (d) => { d.responses['ashwin-p8'] = R('in', 'LAX', '2026-11-06', '2026-11-10'); }), ORG3 = { hasEditKey: true };
    const a = mv(ANJ3, 'anjo-z5'), ins = mv(INS, 'anjo-z5'), b = mv(BKD, 'anjo-z5'), o = mv(ASH, 'ashwin-p8', ORG3);
    check(a && a.differ && a.off && a.follow && eq(a.patch, { available_from: '', available_to: '' }) && a.make === 'org' && a.s === '2026-11-06' && a.e === '2026-11-09' && a.d1 === '2026-11-05' && a.d2 === '2026-11-08' &&
      ins && ins.differ && !ins.off && ins.follow && ins.d1 === '2026-11-07' && ins.d2 === '2026-11-09' &&
      b && b.differ && b.booked && !b.follow && b.patch === null &&
      o && o.make === '' && eq(o.delta, { dates: { departure: '2026-11-06', return: '2026-11-10' }, pin: '2026-11-08', nights: null }) && o.follow &&
      mv(DW, 'anjo-z5') === null && mv(DW, 'momdad-k3') === null && mv(CY, 'anjo-c4') === null && mv(ANJ3, '') === null &&
      mv(tweak(ASH, (d) => { d.decision = clone(CHOSEN); }), 'ashwin-p8', ORG3).make === 'locked' && mv(tweak(ASH, (d) => { d.responses['ashwin-p8'].available_from = '2026-11-09'; }), 'ashwin-p8', ORG3).make === 'pin' &&
      mv(tweak(ASH, (d) => { d.decision = { stage: 'dropped' }; }), 'ashwin-p8', ORG3).follow === false && mv(lgOrg, 'LAX', ORG3).make === 'legacy' && mv(lgOrg, 'LAX', ORG3).follow,
      'AC1 mineVsPlan: Anjo\'s own 11/5–11/8 beside the plan 11/6–11/9 differs (off the plan: ⚠), Follow plan blanks both ends; arriving 11/7 (inside) differs too; booked, her days stay hers (no Follow plan); the organizer\'s 11/6–11/10 can become the plan (planDelta, 📌 11/8 kept), never while 🔒, nor leaving 📌 out, nor on a v1 trip (⤒ first); nothing to compare with no day of her own, as a host, on an undated idea or for nobody', { a, b, o });
    // through the real Worker: Follow plan (her one complete answer) and Make plan (the organizer's plan move); after either, nothing differs
    const fId = srv.seed(ANJ3), f0 = await srv.get(fId), fr = await srv.send(M.respondRequest(f0, 'anjo-z5', mv(f0, 'anjo-z5').patch, { by: 'self' })), f1 = await srv.get(fId);
    const pId = srv.seed(ASH), p0 = await srv.get(pId, KEY), pr = await srv.send(M.organizerEdit(p0, KEY, mv(p0, 'ashwin-p8', ORG3).delta)), p1 = await srv.get(pId, KEY), after = mv(p1, 'ashwin-p8', ORG3);
    check(srv.allOk(fr) && f1.responses['anjo-z5'].available_from === '' && f1.responses['anjo-z5'].available_to === '' && f1.responses['anjo-z5'].status === 'in' && mv(f1, 'anjo-z5') === null &&
      M.flightEnds(model(f1), 'anjo-z5').every((e) => e.follow) &&
      srv.allOk(pr) && eq(M.docPlan(p1), { s: '2026-11-06', e: '2026-11-10' }) && M.parseNotes(p1.idea.notes).pin === '2026-11-08' && after && !after.differ && after.make === 'same' && !after.follow &&
      mem(model(p1), 'anjo-z5').d2 === '2026-11-10',
      'AC1 through the real Worker: Follow plan sends Anjo\'s one complete answer with both ends blank (In kept): she follows the plan again; Make plan moves the plan to the organizer\'s 11/6–11/10 (📌 kept) and everyone following moves with it; then nothing differs');
    // AC5 'Mom & Dad' is spelled as every sheet spells it, the board's one-word name too
    const md = mem(model(DW), 'momdad-k3');
    check(M.oneWord('Mom & Dad') === 'Mom & Dad' && M.oneWord('Mom&Dad') === 'Mom & Dad' && M.oneWord('Bartholomew Montgomery') === 'Bartholomew' && md.one === 'Mom & Dad' && md.short === 'Mom & Dad',
      'AC5 one spelling: "Mom & Dad" on the board (its one-word name) as in every sheet; other names keep their first word');
  }

  // ═══ PIA-155 ═══
  section('PIA-155 a v1 trip is removed for everyone without ⤒ Update trip (a decision alone: its idea untouched), and ↩ puts it back as it stood');
  {
    const DROPD = { decision: { stage: 'dropped' } };
    const vId = srv.seed(LEG), v0 = await srv.get(vId, KEY), idea0 = JSON.stringify(v0.idea), dec0 = clone(v0.decision);
    const drop = M.updateRequest(v0, KEY, DROPD), viaEdit = M.organizerEdit(v0, KEY, DROPD);
    check(M.docLegacy(v0) && model(v0).hasDecision && !!drop && eq(Object.keys(drop.body).sort(), ['decision', 'edit_key']) && !('idea' in drop.body) && eq(drop.body.decision, { stage: 'dropped' }) &&
      drop.method === 'POST' && drop.path === '/idea/update?id=' + vId && Array.isArray(viaEdit) && viaEdit.length === 1 && eq(viaEdit[0], drop),
      'AC1 removing the v1 Thanksgiving (no ⤒ first) is one /idea/update whose body is {edit_key, decision: {stage: dropped}}: no idea in it (organizerEdit builds the same one request)', drop && drop.body);
    const dRes = await srv.send(viaEdit), v1 = await srv.get(vId, KEY), g1 = await srv.get(vId);
    const mom = model(g1, { me: 'PIA' }), org1 = model(v1, { me: 'LAX', hasEditKey: true });
    check(srv.allOk(dRes) && v1.decision.stage === 'dropped' && JSON.stringify(v1.idea) === idea0 && eq(v1.decision.chosen, dec0.chosen) && v1.decision.estimate_total === dec0.estimate_total && eq(v1.responses, v0.responses) &&
      M.docLegacy(v1) && org1.legacy && org1.closed && org1.stage === 'dropped' && mom.stage === 'dropped' && mom.shelf && mom.closed,
      'AC1 through the real Worker: the record\'s decision.stage is dropped, its idea JSON byte-identical (still a v1 record), its choice and answers as they were; another phone (Mom\'s guest read) sees it removed, on its 🗄 shelf', { stage: v1.decision.stage });
    // ↩ (restoreDelta, the model's): the v1 trip was chosen in v1, so it is chosen again with the record's own stored choice
    const back = M.restoreDelta(v1), rq = M.updateRequest(v1, KEY, back), viaBack = M.organizerEdit(v1, KEY, back);
    check(eq(back, { decision: { stage: 'chosen' } }) && !!rq && !('idea' in rq.body) && eq(Object.keys(rq.body).sort(), ['decision', 'edit_key']) && eq(rq.body.decision, { stage: 'chosen', chosen: dec0.chosen }) &&
      rq.body.decision.chosen !== v1.decision.chosen && Array.isArray(viaBack) && viaBack.length === 1 && eq(viaBack[0], rq),
      'AC2 ↩ on the removed v1 trip sends exactly {edit_key, decision: {stage: chosen, chosen: <the record\'s own stored choice>}} (PIA, 11/25–11/29, familyTotal 704, a copy): no idea', rq && rq.body.decision);
    const rRes = await srv.send(viaBack), v2 = await srv.get(vId, KEY), m0 = model(v0, { me: 'LAX', hasEditKey: true }), m2 = model(v2, { me: 'LAX', hasEditKey: true });
    const asStood = (a, b) => eq(Object.assign({}, a, { chosen_at: 'T' }), Object.assign({}, b, { chosen_at: 'T' }));
    check(srv.allOk(rRes) && v2.decision.stage === 'chosen' && JSON.stringify(v2.idea) === idea0 && eq(v2.decision.chosen, dec0.chosen) && asStood(v2.decision, dec0) &&
      v2.decision.estimate_total === 704 && v2.decision.chosen.familyTotal === 704 && typeof v2.decision.chosen_at === 'string' && eq(v2.responses, v0.responses) &&
      M.docLegacy(v2) && m2.legacyLock && !m2.closed && m2.stage === m0.stage && eq(m2.plan, m0.plan) && m2.dest === m0.dest,
      'AC2 through the real Worker: the trip is back as it stood: its decision equal to the one before the drop field for field (the stored choice, estimate_total 704, chosen.familyTotal 704; only chosen_at re-stamped), the same stage, plan and answers, the idea byte-identical, still v1', v2.decision);
    // a v1 choice that differs from its recommendation (Chicago / ORD 11/24–11/30 against PIA 11/25–11/29) comes back as it was chosen
    const oId = srv.seed(tweak(LEG, (d) => { Object.assign(d.decision.chosen, { city: 'Chicago', airport: 'ORD', departure: '2026-11-24', return: '2026-11-30', familyTotal: 650 }); d.decision.estimate_total = 650; })), o0 = await srv.get(oId, KEY);
    await srv.send(M.organizerEdit(o0, KEY, DROPD)); const o1 = await srv.get(oId, KEY);
    const oRes = await srv.send(M.organizerEdit(o1, KEY, M.restoreDelta(o1))), o2 = await srv.get(oId, KEY);
    check(o1.decision.stage === 'dropped' && srv.allOk(oRes) && o2.decision.stage === 'chosen' && eq(o2.decision.chosen, o0.decision.chosen) && asStood(o2.decision, o0.decision) &&
      o2.decision.chosen.airport === 'ORD' && o2.decision.chosen.departure === '2026-11-24' && o2.decision.estimate_total === 650 && JSON.stringify(o2.idea) === JSON.stringify(o0.idea),
      'AC2 a v1 choice unlike its recommendation (Chicago / ORD 11/24–11/30, $650) is restored as it was chosen, not re-chosen from the recommendation', o2.decision);
    // the ↩ never passes caller data through: a v2 trip's chosen ↩ is still built from its plan; a migrate's chosen from the new idea
    const dwChosenDrop = tweak(DW, (d) => { d.id = 'dwDiwaliRaleigh2026a01'; d.decision = Object.assign(clone(CHOSEN), { stage: 'dropped' }); d.decision.chosen = Object.assign({}, d.decision.chosen, { airport: 'ORD', departure: '2026-01-01' }); });
    const dq = M.updateRequest(dwChosenDrop, KEY, { decision: { stage: 'chosen' } });
    check(!!dq && dq.body.decision.chosen.airport === M.docDest(dwChosenDrop) && dq.body.decision.chosen.departure === M.docPlan(dwChosenDrop).s && !('familyTotal' in dq.body.decision.chosen),
      'AC2 an updated (v2) trip\'s ↩ is unchanged: chosen again from its plan and place ({airport, city, departure, return}), never its stored choice', dq && dq.body.decision);
    // ⤒ Update trip still works on the restored record, and re-chooses as it always did
    const vv1 = tweak(V1, (s) => { s.overrides.thanksgiving.sharedIdeaId = vId; }), mo = M.migrateOptions(v2, vv1);
    const mRes = await srv.send(M.migrateRequests(v2, KEY, { plan: mo.span, pin: mo.pin, labels: mo.labels })), v3 = await srv.get(vId, KEY);
    check(srv.allOk(mRes) && !M.docLegacy(v3) && v3.decision.stage === 'chosen' && v3.decision.chosen.departure === '2026-11-20' && model(v3).stage === 'set',
      'AC2 ⤒ Update trip on the restored trip goes through as before (re-chosen on the updated idea: 🔒 Dates set)');
    // every other v1 edit still builds nothing
    const noDec = tweak(v0, (d) => { delete d.decision; }), nullDec = tweak(v0, (d) => { d.decision = null; }), arrDec = tweak(v0, (d) => { d.decision = []; });
    const others = [
      M.updateRequest(v0, KEY, { decision: { stage: 'chosen' } }), M.updateRequest(v0, KEY, { decision: { stage: 'proposed' } }), M.updateRequest(v0, KEY, { decision: { stage: 'booked', actual_total: 900 } }),
      M.updateRequest(v0, KEY, { title: 'x', decision: { stage: 'dropped' } }), M.updateRequest(v0, KEY, { caption: 'x' }), M.updateRequest(v0, KEY, { dates: { departure: '2026-11-20', return: '2026-11-29' }, decision: { stage: 'dropped' } }),
      M.organizerEdit(v0, KEY, { destination: { airport: 'ORD' }, decision: { stage: 'dropped' } }),
      M.updateRequest(v1, KEY, { decision: { stage: 'proposed' } }), M.updateRequest(v1, KEY, { decision: { stage: 'booked', actual_total: 900 } }), M.updateRequest(v1, KEY, { decision: { stage: 'dropped' } }),
      M.updateRequest(v1, KEY, { decision: { stage: 'chosen' }, members: v1.idea.members }),
      M.updateRequest(noDec, KEY, DROPD), M.updateRequest(nullDec, KEY, DROPD), M.updateRequest(arrDec, KEY, DROPD), M.organizerEdit(noDec, KEY, DROPD)];
    check(others.every((q) => q === null) && !model(noDec).hasDecision && !model(nullDec).hasDecision && !model(arrDec).hasDecision && model(v1).hasDecision && M.legacyDecision(v0, DROPD) && !M.legacyDecision(noDec, DROPD),
      'AC1 every other v1 edit still builds nothing: a lock or unlock, 💵, a drop with any idea field, a caption, a ↩ other than restoreDelta\'s (or a second drop), and a drop of a record with no decision object (the Worker\'s applyDecision would fail on it: not offered)', others.map((q) => !!q));
    // a paid v1 trip comes back paid (its choice untouched), and one never chosen comes back proposed
    const pId = srv.seed(tweak(LEG, (d) => { d.decision.stage = 'booked'; d.decision.actual_total = 1490; d.decision.booked_at = '2026-10-08T00:00:00.000Z'; })), p0 = await srv.get(pId, KEY);
    await srv.send(M.organizerEdit(p0, KEY, DROPD)); const p1 = await srv.get(pId, KEY), pb = M.restoreDelta(p1);
    const prr = await srv.send(M.organizerEdit(p1, KEY, pb)), p2 = await srv.get(pId, KEY);
    const nId = srv.seed(tweak(LEG, (d) => { d.decision = { stage: 'proposed', chosen: null, chosen_at: null, estimate_total: null, actual_total: null, booked_at: null, delta_pct: null }; })), n0 = await srv.get(nId, KEY);
    await srv.send(M.organizerEdit(n0, KEY, DROPD)); const n1 = await srv.get(nId, KEY), nb = M.restoreDelta(n1);
    const nrr = await srv.send(M.organizerEdit(n1, KEY, nb)), n2 = await srv.get(nId, KEY);
    check(p1.decision.stage === 'dropped' && eq(pb, { decision: { stage: 'booked', actual_total: 1490 } }) && srv.allOk(prr) && p2.decision.stage === 'booked' && p2.decision.actual_total === 1490 && eq(p2.decision.chosen, p0.decision.chosen) &&
      JSON.stringify(p2.idea) === JSON.stringify(p0.idea) && model(p2, { hasEditKey: true }).paid === 1490 &&
      n1.decision.stage === 'dropped' && eq(nb, { decision: { stage: 'proposed' } }) && srv.allOk(nrr) && n2.decision.stage === 'proposed' && JSON.stringify(n2.idea) === JSON.stringify(n0.idea),
      'AC2 a paid v1 trip removed and restored is paid again with its amount ($1,490, its choice untouched); one never chosen comes back proposed; each idea byte-identical', { paid: p2.decision, plain: n2.decision.stage });
    // v2 trips: the same ↩ as before (restoreDelta moved into the model, unchanged)
    const dwC = tweak(DW, (d) => { d.decision = Object.assign(clone(CHOSEN), { stage: 'dropped' }); }), dwP = tweak(dwC, (d) => { d.decision.actual_total = 1490; });
    check(eq(M.restoreDelta(tweak(DW, (d) => { d.decision.stage = 'dropped'; })), { decision: { stage: 'proposed' } }) && eq(M.restoreDelta(dwC), { decision: { stage: 'chosen' } }) && eq(M.restoreDelta(dwP), { decision: { stage: 'booked', actual_total: 1490 } }) &&
      !!M.updateRequest(Object.assign({ id: 'dwDiwaliRaleigh2026a01' }, DW), KEY, DROPD),
      'AC2 a v2 trip\'s ↩ is unchanged: proposed, 🔒 chosen again, or 💵 paid again with its amount');
  }

  section('PIA-156 who is set: the trip page\'s key (whoSet / waitsOn) read from records the real Worker wrote, and the Remind link (handoffs\' remind)');
  {
    const rows = (m, today) => M.whoSet(m, today || TODAY).rows.map((r) => r.k + ':' + r.codes.join(','));
    // "P town": Diwali moved to Peoria (Mom & Dad host there, not answered yet), Anjo in through the Worker, then the plan locked
    const pId = srv.seed(tweak(DW, (d) => { d.idea.destination = { city: 'Peoria', airport: 'PIA' }; delete d.responses['momdad-k3']; }));
    await srv.send(M.respondRequest(await srv.get(pId), 'anjo-z5', { status: 'in', origin: 'LGA' }, { by: 'self' }));
    const p0 = await srv.get(pId, KEY), a0 = model(p0, { me: 'ashwin-p8', hasEditKey: true });
    // (answers stage: everyone non-host answered, so no Waiting row; the unconfirmed host is Hosting, never Waiting)
    const anjoOut = model(tweak(p0, (d) => { d.responses['anjo-z5'].status = 'out'; }));
    const anjoWait = model(tweak(p0, (d) => { delete d.responses['anjo-z5']; }));
    check(eq(rows(a0), ['hosting:momdad-k3']) && !M.whoSet(a0, TODAY).booking && mem(a0, 'momdad-k3').status === 'host-default' && !M.waitsOn(a0, mem(a0, 'momdad-k3')) &&
      eq(rows(anjoWait), ['waiting:anjo-z5', 'hosting:momdad-k3']) && eq(rows(anjoOut), ['hosting:momdad-k3']),
      'AC1 before 🔒 and before anyone books: ⏳ Waiting is who has not answered (Anjo before her In), never a host (Mom & Dad\'s unconfirmed default is 🏠 Hosting); someone Out is in no row', { a0: rows(a0), anjoWait: rows(anjoWait) });
    // the booking stage: the plan 🔒 (organizerEdit's lock), then Ashwin books through the Worker
    await srv.send(M.organizerEdit(p0, KEY, { decision: { stage: 'chosen' } }));
    const l0 = await srv.get(pId, KEY), b0 = model(l0, { me: 'ashwin-p8', hasEditKey: true });
    await srv.send(M.bookedRequests(l0, 'ashwin-p8', true, { by: 'self' }));
    const l1 = await srv.get(pId, KEY), b1 = model(l1, { me: 'ashwin-p8', hasEditKey: true }), g1 = model(l1, { me: 'anjo-z5' });
    check(l0.decision.stage === 'chosen' && b0.locked && eq(rows(b0), ['waiting:ashwin-p8,anjo-z5', 'hosting:momdad-k3']) && M.whoSet(b0, TODAY).booking &&
      l1.responses['ashwin-p8'].booked === true && eq(rows(b1), ['waiting:anjo-z5', 'booked:ashwin-p8', 'hosting:momdad-k3']) && eq(rows(g1), rows(b1)),
      'AC2 once 🔒: ⏳ Waiting is every traveler not booked yet, me included (Ashwin and Anjo, both In); after Ashwin\'s booking (the Worker\'s /idea/booked) the rows read ⏳ Waiting Anjo (first: what is still to do), ✈ Booked Ashwin, 🏠 Hosting Mom & Dad, the same on her phone', { b0: rows(b0), b1: rows(b1) });
    // a maybe and an unanswered traveler wait too once 🔒; a booking before 🔒 starts the booking stage; everyone booked is the all-set
    const mixed = model(tweak(l1, (d) => { d.responses['anjo-z5'].status = 'maybe'; }));
    const unans = model(tweak(l1, (d) => { delete d.responses['anjo-z5']; }));
    const early = model(tweak(l1, (d) => { d.decision.stage = 'proposed'; }));
    const allSet = model(tweak(l1, (d) => { d.responses['anjo-z5'].booked = true; }));
    const hostOut = model(tweak(l1, (d) => { d.responses['momdad-k3'] = R('out', 'PIA'); }));
    check(eq(rows(mixed), ['waiting:anjo-z5', 'booked:ashwin-p8', 'hosting:momdad-k3']) && eq(rows(unans), ['waiting:anjo-z5', 'booked:ashwin-p8', 'hosting:momdad-k3']) &&
      !early.locked && eq(rows(early), ['waiting:anjo-z5', 'booked:ashwin-p8', 'hosting:momdad-k3']) && allSet.stage === 'done' && eq(rows(allSet), ['booked:ashwin-p8,anjo-z5', 'hosting:momdad-k3']) &&
      eq(rows(hostOut), ['waiting:anjo-z5', 'booked:ashwin-p8']),
      'AC2 a Maybe and a traveler who has not answered still wait to book; a booking made before 🔒 starts the booking stage; everyone travelling booked is ✈ Booked (+ 🏠 Hosting), the all-set; a host who said Out is not Hosting');
    // no key on a paid, removed or past trip; a v1 trip reads its own record (its v1 choice is not a 🔒: the answers stage)
    const paid = model(tweak(l1, (d) => { d.decision.stage = 'booked'; d.decision.actual_total = 900; }));
    const removed = model(tweak(l1, (d) => { d.decision.stage = 'dropped'; }));
    const v1 = model(LEG, { me: 'LAX', hasEditKey: true }), v1b = model(tweak(LEG, (d) => { d.responses.LGA.booked = true; }), { me: 'LAX', hasEditKey: true });
    check(M.whoSet(paid, TODAY).rows.length === 0 && M.whoSet(removed, TODAY).rows.length === 0 && M.whoSet(model(l1, { today: '2026-11-12', me: 'ashwin-p8' }), '2026-11-12').rows.length === 0 &&
      M.whoSet(model(tweak(l1, (d) => { d.idea.dates.return = ''; }), { today: '2026-11-12' }), '2026-11-12').rows.length === 0 && M.whoSet(model(tweak(l1, (d) => { d.idea.dates.return = ''; })), TODAY).rows.length > 0 &&
      v1.legacy && !v1.locked && eq(rows(v1), ['hosting:PIA']) && eq(rows(v1b), ['waiting:LAX', 'booked:LGA', 'hosting:PIA']),
      'AC3 no key on a paid or removed trip, or once the trip is over; the family\'s v1 Thanksgiving (its v1 choice reads as proposed) shows 🏠 Hosting Mom & Dad, and once Anjo books ⏳ Waiting / ✈ Booked / 🏠 Hosting', { v1: rows(v1), v1b: rows(v1b) });
    // Remind: handoffs' remind is the personal guest link of someone else the trip waits on (an In traveler not booked yet, where the
    // P-person nudge rule offers none); never my own, a booked traveler, a host, someone out, a removed trip; never a key in it
    const ctxW = { today: TODAY, now: NOW, worker: 'https://pialax-proxy.ashwinyedavalli.workers.dev' };
    const hA = M.handoffs(b1, 'anjo-z5', ctxW), hMe = M.handoffs(b1, 'ashwin-p8', ctxW), hHost = M.handoffs(b1, 'momdad-k3', ctxW), hDr = M.handoffs(removed, 'anjo-z5', ctxW);
    check(hA.nudge === '' && /\/i\/[A-Za-z0-9_-]{22}#m=anjo-z5$/.test(hA.remind) && hA.remind.indexOf(KEY) < 0 && !/#k=|t=/.test(hA.remind) && hMe.remind === '' && hHost.remind === '' && hDr.remind === '' &&
      M.handoffs(anjoWait, 'anjo-z5', ctxW).remind === M.handoffs(anjoWait, 'anjo-z5', ctxW).nudge && M.handoffs(model(l1, { me: 'anjo-z5' }), 'ashwin-p8', ctxW).remind === '',
      'AC4 Remind\'s link: Anjo (In, not booked, after 🔒) gets her own /i/<id>#m= link (P-person\'s nudge rule offers her none), no key or token in it; never my own, a host, a booked traveler or a removed trip; before 🔒 it is the nudge link itself', { remind: hA.remind });
    // the 8-member trip: no host at a new destination, 🔒, nobody booked: all 8 wait, in the trip's order (the key shows 6 at most, then +N)
    const m8 = model(tweak(M8, (d) => { d.idea.destination = { city: 'New Orleans', airport: 'MSY' }; Object.keys(d.responses).forEach((c) => { d.responses[c].status = 'in'; d.responses[c].booked = false; }); d.decision = clone(CHOSEN); d.decision.chosen.airport = 'MSY'; }), { me: 'grandmajosephine-nf', hasEditKey: true });
    const w8 = M.whoSet(m8, TODAY).rows;
    check(m8.members.length === 8 && w8.length === 1 && w8[0].k === 'waiting' && eq(w8[0].codes, m8.members.filter((x) => x.traveler).map((x) => x.code)) && w8[0].codes.length === m8.travelers.length,
      'AC5 the 8-member trip at a place none of them lives (🔒, nobody booked): one ⏳ Waiting row with every traveler, in the trip\'s order', w8.map((r) => r.k + ':' + r.codes.length));
  }
  // ═══ PIA-157 ═════════════════════════════════════════════════════════════
  section('PIA-157 rides: the note grammar, runs and ⏰ from records the real Worker wrote, claims in the driver\'s own answer, 🚌 / 🚙, the primary, 💵\'s wait, the calendar file and the ask');
  {
    const T = '2026-10-30', WK = 'https://pialax-proxy.ashwinyedavalli.workers.dev';
    // b2cfd85's (#156) note functions, verbatim: what a phone that has not updated yet does with a #157 note
    const OLD = (function (clip, TEXT_MAX, normIata, isIata, isIso, hubPair, docDest, icsFold) {
      var IDEA_STATUSES = { in: 1, maybe: 1, out: 1 };
      var HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
      function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
      var LEGACY_PROXY_RE = /\s*\(entered by [^()]*\)\s*$/;
      function parseRespNote(note) {
        var s = typeof note === 'string' ? note : '', called = false, arr = '', dep = '', m;
        for (;;) {
          if ((m = /^📞(?: |$)/u.exec(s))) { called = true; s = s.slice(m[0].length); continue; }
          if ((m = /^🛬(\d\d:\d\d)(?: |$)/u.exec(s)) && HHMM_RE.test(m[1])) { arr = m[1]; s = s.slice(m[0].length); continue; }
          if ((m = /^🛫(\d\d:\d\d)(?: |$)/u.exec(s)) && HHMM_RE.test(m[1])) { dep = m[1]; s = s.slice(m[0].length); continue; }
          break;
        }
        if (LEGACY_PROXY_RE.test(s)) { called = true; s = s.replace(LEGACY_PROXY_RE, ''); }
        return { called: called, arr: arr, dep: dep, text: s.trim() };
      }
      function buildRespNote(called, arr, dep, text) {
        var parts = [];
        if (called) parts.push('📞');
        if (arr && HHMM_RE.test(arr)) parts.push('🛬' + arr);
        if (dep && HHMM_RE.test(dep)) parts.push('🛫' + dep);
        if (text && String(text).trim()) parts.push(String(text).trim());
        return clip(parts.join(' '), TEXT_MAX.note);
      }
      function memberOf(doc, code) { return ((doc && doc.idea && doc.idea.members) || []).filter(function (m) { return m && m.code === code; })[0] || null; }
      function docClosed(doc) { var st = doc && doc.decision && doc.decision.stage; return st === 'booked' || st === 'dropped'; }
      function validResp(r) { return r && typeof r === 'object' && hasOwn(IDEA_STATUSES, r.status) ? r : null; }
      function icsEsc(s) {
        return String(s).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
          .replace(/;/g, '\\;').replace(/,/g, '\\,');
      }
      function icsDay(s) { return s.replace(/-/g, ''); }
      function icsText(ev) {
        var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PIALAX//Trip//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
          'UID:' + ev.uid, 'DTSTAMP:' + ev.stamp, 'DTSTART;VALUE=DATE:' + icsDay(ev.d1), 'DTEND;VALUE=DATE:' + icsDay(ev.end),
          'SUMMARY:' + icsEsc(ev.title)];
        if (ev.where) lines.push('LOCATION:' + icsEsc(ev.where));
        if (ev.details) lines.push('DESCRIPTION:' + icsEsc(ev.details));
        lines.push('STATUS:' + (ev.tentative ? 'TENTATIVE' : 'CONFIRMED'), 'END:VEVENT', 'END:VCALENDAR');
        return lines.map(icsFold).join('\r\n') + '\r\n';
      }
      function reqPath(route, id) { return route + '?id=' + encodeURIComponent(id); }
      function typedNote(s) {
        var t = String(s == null ? '' : s).trim(), m;
        for (;;) { t = t.replace(LEGACY_PROXY_RE, '').trim(); if ((m = /^📞(?: |$)/u.exec(t))) { t = t.slice(m[0].length).trim(); continue; } break; }
        return t;
      }
      function respondRequest(doc, code, patch, opts) {
        opts = opts || {}; patch = patch || {};
        var mem = memberOf(doc, code); if (!mem || !doc.id || docClosed(doc)) return null;
        var prev = validResp(doc.responses && doc.responses[code]);
        var has = function (k) { return hasOwn(patch, k); };
        if (!prev && !has('status')) return null;
        var status = has('status') ? patch.status : prev.status;
        if (!hasOwn(IDEA_STATUSES, status)) return null;
        var home = normIata(mem.airport);
        var origin = has('origin') ? normIata(patch.origin) : (prev && isIata(prev.origin) && prev.origin !== home ? prev.origin : '');
        if (origin === home) origin = '';
        var from = has('available_from') ? patch.available_from || '' : (prev && isIso(prev.available_from) ? prev.available_from : '');
        var to = has('available_to') ? patch.available_to || '' : (prev && isIso(prev.available_to) ? prev.available_to : '');
        if ((from && !isIso(from)) || (to && !isIso(to)) || (from && to && to < from)) return null;
        var n = parseRespNote(prev && prev.note);
        var arr = has('arrTime') ? patch.arrTime || '' : n.arr, dep = has('depTime') ? patch.depTime || '' : n.dep;
        if ((arr && !HHMM_RE.test(arr)) || (dep && !HHMM_RE.test(dep))) return null;
        var called = opts.by === 'self' ? false : opts.by === 'proxy' ? true : n.called;
        var text = has('note') ? typedNote(patch.note) : n.text, note = buildRespNote(called, arr, dep, text);
        // PIA-139: booked times never cut a note short: times that would leave the text it has no room build nothing
        if ((has('arrTime') || has('depTime')) && parseRespNote(note).text !== String(text || '').trim()) return null;
        var body = { member: code, status: status, origin: origin, available_from: from, available_to: to, note: note };
        var hub = hubPair(docDest(doc));
        var bad = ['arrive_at', 'leave_from'].some(function (k) {
          if (!has(k)) return false;
          var v = normIata(patch[k]);
          if (patch[k] && !v) return true;
          if (v && hub.indexOf(v) < 0) return true;
          if (v !== ((prev && prev[k]) || '')) body[k] = v;
          return false;
        });
        return bad ? null : { method: 'POST', path: reqPath('/idea/respond', doc.id), body: body };
      }
      function timesRequest(doc, code, arr, dep, by) {
        var r = validResp(doc && doc.responses && doc.responses[code]);
        if (!r || !r.booked || (r.status !== 'in' && r.status !== 'maybe')) return null;
        var n = parseRespNote(r.note), patch = {};
        if (arr !== undefined && arr !== n.arr) patch.arrTime = arr;
        if (dep !== undefined && dep !== n.dep) patch.depTime = dep;
        if (!hasOwn(patch, 'arrTime') && !hasOwn(patch, 'depTime')) return null;
        return respondRequest(doc, code, patch, { by: by === 'self' ? 'self' : 'keep' });
      }
      return { parseRespNote: parseRespNote, buildRespNote: buildRespNote, respondRequest: respondRequest, timesRequest: timesRequest, icsText: icsText };
    })(M.clip, M.TEXT_MAX, M.normIata, M.isIata, M.isIso, M.hubPair, M.docDest, M.icsFold);

    // ---- the note grammar ----
    const C1 = { code: 'ashwin-t2', kind: 'a', ap: 'ORD', day: '1120' }, C2 = { code: 'anjo-t3', kind: 'd', ap: 'ORD', day: '1130' };
    const MK = { claims: [C1, C2], bus: 'd', rent: 'a', pet: 'ad', dish: ['🥧', '🍷'] };
    const full = M.buildRespNote(true, '14:35', '15:30', 'Bringing the good pie', MK), pf = M.parseRespNote(full);
    const shuffled = M.parseRespNote('🧺🥧🍷 🐈ad 📞 🚙a 🛫15:30 🚌d 🚗ashwin-t2.aORD1120,anjo-t3.dORD1130 🛬14:35 Bringing the good pie');
    check(full === '📞 🛬14:35 🛫15:30 🚗ashwin-t2.aORD1120,anjo-t3.dORD1130 🚌d 🚙a 🐈ad 🧺🥧🍷 Bringing the good pie' &&
      pf.called && pf.arr === '14:35' && pf.dep === '15:30' && eq(pf.claims, [C1, C2]) && pf.bus === 'd' && pf.rent === 'a' && pf.pet === 'ad' && eq(pf.dish, ['🥧', '🍷']) && pf.text === 'Bringing the good pie' &&
      eq(shuffled, pf) && M.buildRespNote(pf.called, pf.arr, pf.dep, pf.text, M.noteMarks(pf)) === full &&
      M.buildRespNote(false, '', '', '', { bus: 'a' }) === '🚌a' && M.buildRespNote(false, '', '', 'hi') === 'hi' && M.buildRespNote(true, '09:05', '', 'x') === '📞 🛬09:05 x',
      'AC1 every marker kind writes in the one fixed order (📞 🛬 🛫 🚗 🚌 🚙 🐈 🧺, then the text), reads back in any order, and round-trips byte for byte; a note without markers builds as before', { full });
    // the first unknown, malformed or repeated token ends the markers; the legacy "(entered by X)" still reads as 📞; MMDD is a real day
    const stop = (s) => { const p = M.parseRespNote(s); return [p.claims.length, p.bus, p.pet, p.dish.length, p.text]; };
    check(eq(stop('🚌a 🚌d rest'), [0, 'a', '', 0, '🚌d rest']) && eq(stop('🚗x.aORD1320 hi'), [0, '', '', 0, '🚗x.aORD1320 hi']) && eq(stop('🚗x.aORD0230 hi'), [0, '', '', 0, '🚗x.aORD0230 hi']) &&
      eq(stop('🚗x.aORD0229 hi'), [1, '', '', 0, 'hi']) && eq(stop('🚗x.aORD1120, hi'), [0, '', '', 0, '🚗x.aORD1120, hi']) && eq(stop('🚗x.qORD1120'), [0, '', '', 0, '🚗x.qORD1120']) &&
      eq(stop('🐈adx'), [0, '', '', 0, '🐈adx']) && eq(stop('🧺🥧🥧 x'), [0, '', '', 0, '🧺🥧🥧 x']) && eq(stop('🧺🥧🍷🍰🍪'), [0, '', '', 0, '🧺🥧🍷🍰🍪']) && eq(stop('🧺🦃'), [0, '', '', 0, '🧺🦃']) &&
      eq(stop('🚌 taking the bus'), [0, '', '', 0, '🚌 taking the bus']) && M.parseRespNote('🚗a.aORD1120 Late flight (entered by Ashwin)').called === true &&
      M.parseRespNote('📞 📞 🛬10:00 🛬11:00 x').arr === '11:00' && M.DISH_PALETTE.length === 18 && new Set(M.DISH_PALETTE).size === 18 &&
      M.DISH_PALETTE.every((g) => Array.from(g).length === 1 && M.FACES.indexOf(g) < 0 && M.SCENES.indexOf(g) < 0 && !M.holidays(2026).some((h) => h.g === g)),
      'AC1 the first unknown, malformed or repeated token begins the text (a 2nd 🚌, 13/20, 02/30, a trailing comma, kind q, 🐈adx, a dish twice, four dishes, 🦃); 02/29 is a real day; "🚌 taking the bus" is text; "(entered by X)" still reads 📞; a 2nd 🛬 still overrides as before; the 18 dishes are single code points, none a face, scene or holiday glyph');
    // typed text never forges a marker; noteRoom subtracts every marker
    check(M.typedNote('🚗ashwin-t2.aORD1120 🚌ad 🛬09:00 📞 hello') === 'hello' && M.typedNote('🚌 taking the bus') === '🚌 taking the bus' && M.typedNote('hi 🚗a.aORD1120') === 'hi 🚗a.aORD1120' &&
      M.noteRoom(false, '', '') === 280 && M.noteRoom(true, '14:35', '', MK) === 280 - (M.buildRespNote(true, '14:35', '', '', MK).length + 1) && M.noteRoom(false, '', '', { bus: 'a' }) === 276,
      'AC2 typedNote strips any leading marker-shaped token (a claim, 🚌ad, 🛬, 📞), so typed text cannot forge a claim; "🚌 taking the bus" and a claim inside the text stay text; noteRoom subtracts every marker');

    // ---- "P town" through the real Worker: 📍ORD, 🔒 11/20–11/30, Mom & Dad host at PIA (no answer yet), Ashwin booked 14:35 / 15:30, Anjo In ----
    const PTD = { v: 1, id: 'ptPTownThanksgiving001', created_at: '2026-10-14T10:00:00.000Z', updated_at: '2026-10-16T10:00:00.000Z',
      idea: { title: '🦃 P town thanksgiving', destination: { city: 'Chicago', airport: 'ORD' }, dates: { departure: '2026-11-20', return: '2026-11-30', searchStart: '', searchEnd: '' }, recommendation: null, notes: '',
        members: [{ code: 'momdad-t1', label: '🌽 Mom & Dad', airport: 'PIA', headcount: 2 }, { code: 'ashwin-t2', label: '💪 Ashwin', airport: 'LAX', headcount: 1 }, { code: 'anjo-t3', label: '🗽 Anjo', airport: 'LGA', headcount: 1 }] },
      responses: { 'ashwin-t2': R('in', 'LAX', '', '', { booked: true, booked_at: '2026-10-16T00:00:00.000Z', note: '🛬14:35 🛫15:30' }), 'anjo-t3': R('in', 'LGA') },
      decision: { stage: 'chosen', chosen: { airport: 'ORD', city: 'Chicago', departure: '2026-11-20', return: '2026-11-30' }, chosen_at: '2026-10-16T00:00:00.000Z', estimate_total: null, actual_total: null, booked_at: null, delta_pct: null },
      log: [] };
    const ptId = srv.seed(PTD), pt0 = await srv.get(ptId, KEY);
    const pm = (doc, me, today, over) => M.tripModel(doc, Object.assign({ today: today || T, now: NOW, me: me || null }, over || {}));
    const r0 = M.rides(pm(pt0, 'ashwin-t2'), T);
    const brief = (r) => r.runs.map((x) => [x.key, x.legs.map((l) => l.code + '@' + l.time + ':' + l.ride.state).join('+'), x.leave && x.leave.t, x.back && x.back.t, x.state, x.candidates.join(','), x.upcoming]);
    check(r0 && r0.home === 'PIA' && eq(brief(r0), [['aORD1120-ashwin-t2', 'ashwin-t2@14:35:open', '12:05', '17:05', 'open', 'momdad-t1', true], ['dORD1130-ashwin-t2', 'ashwin-t2@15:30:open', '11:00', '16:00', 'open', 'momdad-t1', true]]) &&
      r0.runs[0].leave.day === '2026-11-20' && r0.runs[1].leave.day === '2026-11-30' && r0.runs[0].drive === 150 && eq(r0.waiting, ['anjo-t3']) && r0.open === 2 && r0.notime.length === 0 && r0.self.length === 0,
      'AC3 P town on 10/30: R1 Fri 11/20 🛬 ORD 💪 14:35 leave home 12:05, back 17:05; R2 Mon 11/30 🛫 ORD 💪 15:30 leave home 11:00 (2:00 before, 2:30 drive), back 16:00; both open, Mom & Dad the candidates; ⏳ Anjo', brief(r0));
    // Anjo lands 15:10 and leaves 17:00: one chained run each way; Ashwin's run keys stay (the trip's first traveler)
    const ptA = tweak(pt0, (d) => { d.responses['anjo-t3'].booked = true; d.responses['anjo-t3'].note = '🛬15:10 🛫17:00'; });
    const rA = M.rides(pm(ptA), T);
    check(eq(brief(rA), [['aORD1120-ashwin-t2', 'ashwin-t2@14:35:open+anjo-t3@15:10:open', '12:05', '17:40', 'open', 'momdad-t1', true], ['dORD1130-ashwin-t2', 'ashwin-t2@15:30:open+anjo-t3@17:00:open', '11:00', '16:00', 'open', 'momdad-t1', true]]) &&
      rA.runs[0].spread === 35 && rA.runs[1].spread === 90 && rA.waiting.length === 0,
      'AC3 Anjo booked, landing 15:10 and leaving 17:00: R1 holds 14:35 and 15:10 (⏱0:35, ⏰12:05, back 17:40), R2 holds 15:30 and 17:00 (⏱1:30, ⏰11:00), the keys unchanged', brief(rA));
    // the deliberate fix: a departure between two same-day arrivals no longer splits their ⏱ run; departures chain too
    const ix = M.pickups(pm(tweak(pt0, (d) => { d.idea.dates.departure = '2026-11-20'; d.responses['ashwin-t2'].available_to = '2026-11-20'; d.responses['ashwin-t2'].note = '🛬12:00 🛫14:00';
      d.responses['anjo-t3'].booked = true; d.responses['anjo-t3'].note = '🛬13:30'; })), {}, NOW, false).ORD;
    const ixA = ix.filter((c) => c.kind === 'arr'), ixD = ix.filter((c) => c.kind === 'dep' && c.time);
    check(eq(ix.map((c) => c.kind + c.time).slice(0, 3), ['arr12:00', 'arr13:30', 'dep14:00']) && !!ixA[0].group && ixA[0].group === ixA[1].group && !ixD[0].group && ixD[0].run !== ixA[0].run &&
      M.runChain([{ date: 'x', time: '10:00' }, { date: 'x', time: '12:00' }, { date: 'x', time: '14:01' }, { date: 'y', time: '14:02' }]).map((r) => r.length).join() === '2,1,1',
      'AC3 a departure between two same-day arrivals (12:00 🛬, 13:30 🛬 with 14:00 🛫 after; 12:00 / 14:00 / 13:30 sorted 12:00, 13:30, 14:00) leaves the arrivals one ⏱ run; runChain chains ≤ 2:00 consecutively, never across days',
      ix.map((c) => c.kind + c.time + ':' + (c.group || '') + '/' + (c.run || '')));
    const ix2 = M.pickups(pm(tweak(pt0, (d) => { d.responses['ashwin-t2'].note = '🛬14:35'; d.responses['anjo-t3'].booked = true; d.responses['anjo-t3'].available_from = '2026-11-20'; d.responses['anjo-t3'].available_to = '2026-11-20'; d.responses['anjo-t3'].note = '🛬16:00 🛫15:00'; })), {}, NOW, false).ORD;
    const ix2A = ix2.filter((c) => c.kind === 'arr' && c.time);
    check(ix2A.length === 2 && ix2A[0].group && ix2A[0].group === ix2A[1].group,
      'AC3 the fix in the order the old rule broke on: 🛬14:35, then 🛫15:00 (sorted between), then 🛬16:00 — one ⏱ run of arrivals (before PIA-157 the departure between them split it)', ix2.map((c) => c.kind + c.time + ':' + (c.group || '')));
    // an arrival before 02:30 leaves home the day before; a pickup that ends after midnight comes back the next day
    const early = M.rides(pm(tweak(pt0, (d) => { d.responses['ashwin-t2'].note = '🛬01:10 🛫23:50'; })), T);
    check(early.runs[0].leave.day === '2026-11-19' && early.runs[0].leave.t === '22:40' && early.runs[0].back.day === '2026-11-20' && early.runs[0].back.t === '03:40' &&
      early.runs[1].leave.day === '2026-11-30' && early.runs[1].leave.t === '19:20' && early.runs[1].back.t === '00:20' && early.runs[1].back.day === '2026-12-01',
      'AC3 landing 01:10 (before the 2:30 drive): leave home Thu 11/19 22:40; a 23:50 flight: leave 19:20, back 00:20 the next day', [early.runs[0].leave, early.runs[0].back, early.runs[1].leave, early.runs[1].back]);
    // at PIA (home): the 0:20 drive
    const atPia = M.rides(pm(tweak(pt0, (d) => { d.responses['ashwin-t2'].arrive_at = 'PIA'; })), T);
    check(atPia.runs[0].ap === 'PIA' && atPia.runs[0].drive === 20 && atPia.runs[0].leave.t === '14:15' && atPia.runs[0].back.t === '14:55' && atPia.runs[1].ap === 'ORD',
      'AC3 Ashwin landing at PIA instead (home): the 0:20 drive, leave home 14:15, back 14:55; his ORD departure keeps 2:30', brief(atPia));

    // ---- writes through the real Worker ----
    const kR1 = 'aORD1120-ashwin-t2', kR2 = 'dORD1130-ashwin-t2';
    // Mom & Dad's own first claim: their first answer, In, by them (no 📞)
    const qSelf = M.ridesRequest(pt0, 'momdad-t1', kR1, 'on', 'self', T), resSelf = await srv.send(qSelf), pt1 = await srv.get(ptId, KEY);
    const md1 = pt1.responses['momdad-t1'];
    check(srv.allOk(resSelf) && md1.status === 'in' && md1.note === '🚗ashwin-t2.aORD1120' && md1.origin === 'PIA' && M.parseRespNote(md1.note).called === false &&
      M.rides(pm(pt1), T).runs[0].state === 'covered' && eq(M.rides(pm(pt1), T).runs[0].legs[0].ride.by, ['momdad-t1']) && M.rides(pm(pt1), T).open === 1,
      'AC4 Mom & Dad claim R1 on their own phone: their first answer is In (by them: no 📞), the claim 🚗ashwin-t2.aORD1120 in their own note; R1 covered by 🌽, one run left open', md1);
    // the organizer's claim for a host still on their default: In with 📞 (an answer on their behalf)
    const ptB = srv.seed(PTD), ptB0 = await srv.get(ptB, KEY);
    const qOrg = M.ridesRequest(ptB0, 'momdad-t1', kR2, 'on', 'keep', T), resOrg = await srv.send(qOrg), ptB1 = await srv.get(ptB, KEY);
    check(srv.allOk(resOrg) && ptB1.responses['momdad-t1'].status === 'in' && ptB1.responses['momdad-t1'].note === '📞 🚗ashwin-t2.dORD1130',
      'AC4 the organizer claims R2 for Mom & Dad while they are on their default: it answers for them, In with 📞 (the honest mark), 🚗ashwin-t2.dORD1130', ptB1.responses['momdad-t1']);
    // the organizer on an answered host: keep (no 📞 added); 'off' takes it back; nothing changes → nothing built
    const qKeep = M.ridesRequest(pt1, 'momdad-t1', kR2, 'on', 'keep', T), resKeep = await srv.send(qKeep), pt2 = await srv.get(ptId, KEY);
    check(srv.allOk(resKeep) && pt2.responses['momdad-t1'].note === '🚗ashwin-t2.aORD1120,ashwin-t2.dORD1130' && M.rides(pm(pt2), T).open === 0 &&
      M.ridesRequest(pt2, 'momdad-t1', kR2, 'on', 'keep', T) === null && M.ridesRequest(pt2, 'momdad-t1', kR1, 'on', 'self', T) === null &&
      M.ridesRequest(pt2, 'momdad-t1', kR2, 'off', 'self', T).body.note === '🚗ashwin-t2.aORD1120',
      'AC4 the organizer claims R2 for Mom & Dad once they have answered: kept as it reads (no 📞); both runs covered; claiming again builds nothing; off takes back that run alone', pt2.responses['momdad-t1']);
    // nobody else may claim: a non-candidate, a traveler on the run, an unknown run; the trip closed or past
    check(M.ridesRequest(pt2, 'anjo-t3', kR1, 'on', 'self', T) === null && M.ridesRequest(pt2, 'ashwin-t2', kR1, 'on', 'self', T) === null && M.ridesRequest(pt2, 'momdad-t1', 'aORD1121-ashwin-t2', 'on', 'self', T) === null &&
      M.ridesRequest(pt2, 'momdad-t1', kR1, 'on', 'self', '2026-12-02') === null && M.ridesRequest(pt2, 'momdad-t1', kR2, 'off', 'self', '2026-11-25') !== null &&
      M.ridesRequest(pt2, 'momdad-t1', kR1, 'off', 'self', '2026-11-25') === null && M.ridesRequest(tweak(pt2, (d) => { d.decision.stage = 'dropped'; }), 'momdad-t1', kR1, 'off', 'self', T) === null &&
      M.rides(pm(tweak(pt2, (d) => { d.decision.stage = 'dropped'; })), T) === null,
      'AC4 no claim from someone who cannot drive it (Anjo is not there all day 11/20, Ashwin is on it), on no run, or once its day is past (11/25: R1 is behind, R2 still ahead); a removed trip has no rides at all');
    // paid: nothing is built, and the Worker refuses an answer anyway (409)
    const ptP = srv.seed(tweak(PTD, (d) => { d.decision.stage = 'booked'; d.decision.actual_total = 905; d.responses['anjo-t3'].booked = true; })), ptP0 = await srv.get(ptP, KEY);
    const late = await srv.send(M.ridesRequest(tweak(ptP0, (d) => { d.decision.stage = 'chosen'; }), 'momdad-t1', kR1, 'on', 'self', T));
    check(M.ridesRequest(ptP0, 'momdad-t1', kR1, 'on', 'self', T) === null && late[0].status === 409 && M.rides(pm(ptP0), T).open === 2 && M.rides(pm(ptP0), T).notime.length === 2 && M.rideGuard(ptP0, 'momdad-t1', kR1, 'on', T) === 'closed',
      'AC4 a paid trip builds no ride write (the Worker answers 409 to one sent anyway), its rides still read (Anjo booked with no times: R1 and R2 are Ashwin\'s), the guard says closed');
    // the v1 Thanksgiving: a host's own claim goes; the organizer's for them waits for ⤒
    const v1d = tweak(LEG, (d) => { d.responses.LAX.booked = true; d.responses.LAX.note = '🛬14:35'; });
    const v1m = model(v1d), v1r = M.rides(v1m, T);
    check(v1m.legacy && v1r && v1r.runs.length >= 1 && M.ridesRequest(v1d, 'PIA', v1r.runs[0].key, 'on', 'self', T) !== null && M.ridesRequest(v1d, 'PIA', v1r.runs[0].key, 'on', 'keep', T) === null &&
      M.groundRequest(v1d, 'LAX', 'a', 'rent', 'keep', T) === null && M.groundRequest(v1d, 'LAX', 'a', 'rent', 'self', T) !== null,
      'AC4 the family\'s v1 Thanksgiving (dest PIA): Mom & Dad\'s own claim builds, the organizer\'s for them is null (⤒ Update trip first); the same for a traveler\'s 🚙', v1r && brief(v1r));
    // the 'taken' guard, and two phones racing for two runs both land (each its own answer: no lost claim)
    const ptC = srv.seed(tweak(PTD, (d) => { d.responses['anjo-t3'].available_from = '2026-11-18'; })), ptC0 = await srv.get(ptC, KEY);
    const rC = M.rides(pm(ptC0), T);
    const qMom = M.ridesRequest(ptC0, 'momdad-t1', kR1, 'on', 'self', T), qAnjo = M.ridesRequest(ptC0, 'anjo-t3', kR1, 'on', 'self', T);
    await srv.send(qMom); const ptC1 = await srv.get(ptC, KEY);
    const guard = M.rideGuard(ptC1, 'anjo-t3', kR1, 'on', T);
    await srv.send(M.ridesRequest(ptC1, 'momdad-t1', kR2, 'on', 'self', T)); await srv.send(M.ridesRequest(ptC1, 'anjo-t3', kR1, 'off', 'self', T) || []);
    const qA2 = M.ridesRequest(await srv.get(ptC, KEY), 'momdad-t1', kR2, 'off', 'self', T);
    check(eq(rC.runs[0].candidates, ['momdad-t1', 'anjo-t3']) && qAnjo !== null && guard === 'taken' && M.rideGuard(ptC1, 'anjo-t3', kR1, 'off', T) === 'same' && M.rideGuard(ptC1, 'momdad-t1', kR2, 'on', T) === '' &&
      eq(M.rides(pm(await srv.get(ptC, KEY)), T).runs.map((r) => r.legs[0].ride.by.join()), ['momdad-t1', 'momdad-t1']) && qA2 !== null,
      'AC4 Anjo arriving 11/18 can drive R1 too (a candidate after the hosts); Mom & Dad claim it first, so Anjo\'s "on" on the fresh record is held as taken (nothing sent), and her "off" there (she has no claim) is "same" (fix pass: nothing to send); racing claims for R1 and R2 both land, each in Mom & Dad\'s own answer');
    const ptD = srv.seed(tweak(PTD, (d) => { d.responses['anjo-t3'].available_from = '2026-11-18'; })), ptD0 = await srv.get(ptD, KEY);
    // (both built on the same record, before either phone saw the other's: each is that driver's own answer, so both land)
    const qD1 = M.ridesRequest(ptD0, 'momdad-t1', kR1, 'on', 'self', T), qD2 = M.ridesRequest(ptD0, 'anjo-t3', kR1, 'on', 'self', T);
    const resD = (await srv.send(qD1)).concat(await srv.send(qD2)), twoR = M.rides(pm(await srv.get(ptD, KEY)), T).runs[0];
    check(srv.allOk(resD) && eq(twoR.legs[0].ride.by.slice().sort(), ['anjo-t3', 'momdad-t1']) && twoR.state === 'covered',
      'AC5 two drivers on one leg (two phones that tapped at once, each writing their own answer): both faces cover it, no ⚠', twoR.legs[0].ride);
    // same-day time change: the claim carries, ⏰ moves; a day or airport change: moved (open) until ✓ ('ok')
    const tc = M.timesRequest(pt2, 'ashwin-t2', '15:05', undefined, 'self'); await srv.send(tc); const pt3 = await srv.get(ptId, KEY), r3 = M.rides(pm(pt3), T);
    check(pt3.responses['ashwin-t2'].note === '🛬15:05 🛫15:30' && r3.runs[0].key === kR1 && r3.runs[0].state === 'covered' && r3.runs[0].leave.t === '12:35' && eq(r3.runs[0].legs[0].ride.by, ['momdad-t1']),
      'AC6 Ashwin moves his landing to 15:05 the same day: Mom & Dad\'s claim carries over (tied to ORD and 11/20, not the time), ⏰ moves to 12:35', brief(r3));
    const dayMv = tweak(pt3, (d) => { d.responses['ashwin-t2'].available_from = '2026-11-21'; }), rMv = M.rides(pm(dayMv), T);
    const apMv = tweak(pt3, (d) => { d.responses['ashwin-t2'].arrive_at = 'PIA'; }), rAp = M.rides(pm(apMv), T);
    const okQ = M.ridesRequest(dayMv, 'momdad-t1', 'aORD1121-ashwin-t2', 'ok', 'self', T), okRes = await srv.send([okQ].filter(Boolean));
    check(rMv.runs[0].key === 'aORD1121-ashwin-t2' && rMv.runs[0].state === 'open' && rMv.runs[0].legs[0].ride.state === 'moved' && eq(rMv.runs[0].legs[0].ride.was, ['momdad-t1']) && rMv.open === 1 &&
      rAp.runs[0].ap === 'PIA' && rAp.runs[0].legs[0].ride.state === 'moved' &&
      okQ && okQ.body.note === '🚗ashwin-t2.dORD1130,ashwin-t2.aORD1121' && okRes.length === 1 &&
      M.ridesRequest(dayMv, 'momdad-t1', 'aORD1121-ashwin-t2', 'on', 'self', T).body.note === okQ.body.note,
      'AC6 Ashwin lands a day later (11/21) or at PIA instead: the claim is "moved" (⚠, the run open again) until Mom & Dad\'s ✓ (op ok) moves it to the leg as it is now (on does the same)', { mv: brief(rMv), ok: okQ && okQ.body.note });
    // unbooked, Out or removed from the trip: the claim is ignored, and dropped on the claimer's next ride write
    const unbk = tweak(pt3, (d) => { d.responses['ashwin-t2'].booked = false; }), outA = tweak(pt3, (d) => { d.responses['ashwin-t2'].status = 'out'; });
    const gone = tweak(pt3, (d) => { d.idea.members = d.idea.members.filter((x) => x.code !== 'ashwin-t2'); delete d.responses['ashwin-t2']; d.responses['anjo-t3'].booked = true; d.responses['anjo-t3'].note = '🛫17:00'; });
    const drop = M.ridesRequest(gone, 'momdad-t1', 'dORD1130-anjo-t3', 'on', 'self', T);
    check(M.rides(pm(unbk), T).runs.length === 0 && M.rides(pm(outA), T).runs.length === 0 && M.rides(pm(gone), T).runs.length === 1 && drop && drop.body.note === '🚗anjo-t3.dORD1130' &&
      M.primaryAction(pm(unbk, 'momdad-t1'), T) === 'none',
      'AC6 Ashwin unbooked, Out, or removed from the trip: Mom & Dad\'s claims on his legs are ignored (no run, no ⏰ on their phone), and their next ride write (claiming Anjo\'s 17:00) drops them', drop && drop.body.note);
    // 🚌 / 🚙: the traveler's own leg, in no run, beating a claim; the coach only from O'Hare (never home: PIA)
    const bus = M.groundRequest(pt3, 'ashwin-t2', 'd', 'bus', 'self', T), busRes = await srv.send(bus), pt4 = await srv.get(ptId, KEY), r4 = M.rides(pm(pt4), T);
    check(srv.allOk(busRes) && pt4.responses['ashwin-t2'].note === '🛬15:05 🛫15:30 🚌d' && r4.runs.length === 1 && r4.runs[0].kind === 'a' && eq(r4.self, [{ code: 'ashwin-t2', kind: 'd', ap: 'ORD', day: '2026-11-30', mode: 'bus', time: '15:30' }]) &&
      M.groundRequest(apMv, 'ashwin-t2', 'a', 'bus', 'self', T) === null && M.groundRequest(apMv, 'ashwin-t2', 'a', 'rent', 'self', T).body.note === '🛬15:05 🛫15:30 🚙a' &&
      M.groundRequest(pt4, 'ashwin-t2', 'd', 'bus', 'self', T) === null && M.groundRequest(pt4, 'ashwin-t2', 'd', 'rent', 'keep', T).body.note === '🛬15:05 🛫15:30 🚙d' &&
      M.groundRequest(pt4, 'ashwin-t2', 'd', '', 'self', T).body.note === '🛬15:05 🛫15:30' && M.groundRequest(pt4, 'anjo-t3', 'a', 'bus', 'self', T) !== null && M.groundRequest(pt4, 'momdad-t1', 'a', 'bus', 'self', T) === null &&
      M.pickups(pm(pt4), {}, NOW, false).ORD.filter((c) => c.kind === 'dep' && c.self === 'bus').length === 1,
      'AC7 Ashwin takes the coach home (🚌d, his own answer): that leg leaves its run (in self, beating Mom & Dad\'s claim); the coach only where the airport is not home (at PIA: 🚙 only); 🚙 replaces 🚌, blank goes back to the family ride; a host has no leg', r4.self);
    // a past run is never open; a trip to New York (LGA) or with no host at the Peoria pivot has no rides
    const nyc = tweak(pt0, (d) => { d.idea.destination = { city: 'New York', airport: 'LGA' }; d.decision.chosen.airport = 'LGA'; });
    const noHost = tweak(pt0, (d) => { d.idea.members[0].airport = 'SEA'; }), hostOut = tweak(pt0, (d) => { d.responses['momdad-t1'] = R('out', 'PIA'); });
    const past = M.rides(pm(pt0, null, '2026-11-25'), '2026-11-25');
    check(past.runs[0].upcoming === false && past.runs[1].upcoming === true && past.open === 1 && M.rides(pm(nyc), T) === null && M.rides(pm(noHost), T) === null && M.rides(pm(hostOut), T) === null &&
      M.rides(model(DW), TODAY) === null,
      'AC8 on 11/25 the 11/20 run is past (never open); New York (LGA: Mom & Dad are not hosts there), a trip with no Peoria host, a host who said Out, Diwali in Raleigh: no rides at all');

    // ---- the primary: every role and stage, Book / Landing time / Track / Share / Lock unchanged ----
    const pa = (doc, me, today, over) => M.primaryAction(pm(doc, me, today, over), today || T);
    const ORGK = { hasEditKey: true };
    const unlocked = tweak(pt0, (d) => { d.decision = { stage: 'proposed', chosen: null, chosen_at: null, estimate_total: null, actual_total: null, booked_at: null, delta_pct: null }; });
    const notimes = tweak(pt0, (d) => { d.responses['ashwin-t2'].note = ''; });
    check(pa(pt0, 'ashwin-t2', T, ORGK) === 'rides' && pa(pt0, 'momdad-t1') === 'rides' && pa(pt0, 'anjo-t3') === 'book' && pa(pt0, null) === 'none' && pa(pt0, 'ashwin-t2') === 'none' &&
      pa(pt2, 'momdad-t1') === 'drive' && pa(pt2, 'ashwin-t2', T, ORGK) === 'none' && pa(pt1, 'ashwin-t2', T, ORGK) === 'rides' && pa(pt1, 'momdad-t1') === 'drive' &&
      pa(unlocked, 'ashwin-t2', T, ORGK) === 'lock' && pa(tweak(unlocked, (d) => { delete d.responses['anjo-t3']; }), 'ashwin-t2', T, ORGK) === 'share' &&
      pa(notimes, 'ashwin-t2', T, ORGK) === 'times' && pa(pt0, 'ashwin-t2', '2026-11-19', ORGK) === 'track' && pa(pt0, 'ashwin-t2', '2026-11-29', ORGK) === 'track' &&
      pa(pt2, 'momdad-t1', '2026-11-30') === 'drive' && pa(pt2, 'momdad-t1', '2026-12-01') === 'none' &&
      pa(tweak(pt2, (d) => { d.decision.stage = 'booked'; d.decision.actual_total = 905; }), 'momdad-t1') === 'drive' && pa(tweak(pt2, (d) => { d.decision.stage = 'dropped'; }), 'momdad-t1') === 'none' &&
      pa(tweak(pt0, (d) => { d.responses['anjo-t3'].available_from = '2026-11-18'; }), 'anjo-t3') === 'book' && pa(tweak(ptA, (d) => { d.responses['anjo-t3'].available_from = '2026-11-18'; d.responses['anjo-t3'].note = '🛬09:00'; }), 'anjo-t3') === 'none' &&
      pa(nyc, 'ashwin-t2', T, ORGK) === 'none' && pa(LEG, 'LAX', TODAY, { hasEditKey: true }) === 'none',
      'AC9 primaryAction: the organizer (booked, times in, open runs) and Mom & Dad (a candidate host) get 🚗 Rides; Anjo keeps Book; a guest and a traveler who is not the organizer none; a driver gets 🚗 drive (also on a paid trip, until its day; never on a removed one); Lock, Share, Landing time and Track keep their place; a traveler who could drive never gets Rides; New York and the v1 trip unchanged');

    // ---- 💵 waits while rides are open: paidCheck's norides ----
    const doneP = tweak(pt0, (d) => { d.responses['anjo-t3'].booked = true; d.responses['anjo-t3'].note = '🛬15:10 🛫17:00'; });
    const pcOpen = M.paidCheck(pm(doneP, 'ashwin-t2', T, { hasEditKey: true, hasToken: true }), T), pcNoDay = M.paidCheck(pm(doneP, 'ashwin-t2', T, { hasEditKey: true, hasToken: true }));
    const doneC = tweak(doneP, (d) => { d.responses['momdad-t1'] = R('in', 'PIA', '', '', { note: '🚗ashwin-t2.aORD1120,anjo-t3.aORD1120,ashwin-t2.dORD1130' }); });
    const pcPart = M.paidCheck(pm(doneC, 'ashwin-t2', T, { hasEditKey: true, hasToken: true }), T);
    check(pcOpen.why === '' && eq(pcOpen.norides, ['ashwin-t2', 'anjo-t3']) && eq(pcNoDay.norides, []) && pcPart.why === '' && eq(pcPart.norides, ['anjo-t3']) &&
      eq(M.paidCheck(pm(doneC, 'ashwin-t2', '2026-12-01', { hasEditKey: true, hasToken: true }), '2026-12-01').norides, []),
      'AC10 paidCheck(model, today).norides: everyone booked, nobody driving yet → Ashwin and Anjo; once Mom & Dad cover R1 and Ashwin\'s 15:30, Anjo\'s 17:00 alone; after the trip none', { pcOpen, pcPart: pcPart.norides });

    // ---- the ask, the share text, the calendar file ----
    const ask = M.rideAsk(pm(pt0, 'ashwin-t2', T, ORGK), T, WK), ask2 = M.rideAsk(pm(ptC0, 'ashwin-t2', T, ORGK), T, WK);
    const text = M.rideText(pm(pt0), r0.runs, 'ask');
    check(ask && eq(ask.codes, ['momdad-t1']) && ask.url === WK + '/i/' + ptId + '#m=momdad-t1' && eq(ask2.codes, ['momdad-t1', 'anjo-t3']) && ask2.url === WK + '/i/' + ptC + '' &&
      M.rideAsk(pm(pt2, 'ashwin-t2', T, ORGK), T, WK) === null &&
      // (PIA-159: the airport by name, "O'Hare (ORD)", and home again: "home about 5:05 PM")
      text === '🚗 Can you drive? Fri 11/20: pick up Ashwin at O\'Hare (ORD), lands 2:35 PM (leave home 12:05 PM, home about 5:05 PM). Mon 11/30: drop off Ashwin at O\'Hare (ORD), flight 3:30 PM (leave home 11:00 AM, home about 4:00 PM).' &&
      M.rideText(pm(ptA), rA.runs.slice(0, 1), 'remind') === '🚗 Reminder: Fri 11/20: pick up Ashwin, Anjo at O\'Hare (ORD), lands 2:35 PM, 3:10 PM (leave home 12:05 PM, home about 5:40 PM).' &&
      /^🚗 Ride update: Fri 11\/20: pick up Ashwin at O'Hare \(ORD\), lands 1:10 AM \(leave home Thu 10:40 PM, home about 3:40 AM\)\.$/.test(M.rideText(pm(pt0), early.runs.slice(0, 1), 'tell')) &&
      text.indexOf(KEY) < 0 && !/\$|\d{3,}\.\d|#k=|t=/.test(text) && eq(['00:05', '09:30', '12:00', '14:35', '23:59', 'x'].map(M.h12), ['12:05 AM', '9:30 AM', '12:00 PM', '2:35 PM', '11:59 PM', '']),
      'AC11 the organizer\'s Ask: one candidate → Mom & Dad\'s own guest link (#m=), several → the trip\'s guest link; none once every run is covered; the text in plain 12-hour English with the weekday ("…lands 2:35 PM (leave home 12:05 PM)…"), the day before named when ⏰ falls on it, never a key, token or price', { text, ask, ask2 });
    const ev = M.rideEvents(pm(pt2, 'momdad-t1'), 'momdad-t1', { today: T, now: NOW, worker: WK }), evText = ev ? ev.ics.text : '';
    const vevents = evText.split('BEGIN:VEVENT').length - 1, alarms = (evText.match(/BEGIN:VALARM/g) || []).length;
    check(ev && ev.n === 2 && vevents === 2 && alarms === 4 && (evText.match(/TRIGGER:-P1D\r\n/g) || []).length === 2 && (evText.match(/TRIGGER:-PT30M\r\n/g) || []).length === 2 &&
      /\r\nDTSTART:20261120T120500\r\nDTEND:20261120T170500\r\n/.test(evText) && /\r\nDTSTART:20261130T110000\r\nDTEND:20261130T160000\r\n/.test(evText) && !/DTSTART[^\r]*Z\r\n|TZID/.test(evText) &&
      // (PIA-159: the UID holds no airport, <id>-<driver>-<a|d><MMDD>-<lead>@pialax; the airport by name, its full name as the location;
      // the description the ride in words, then exactly one URL, the guest link: never #k=, t= or $)
      evText.indexOf('UID:' + ptId + '-momdad-t1-a1120-ashwin-t2@pialax\r\n') >= 0 && evText.indexOf('SUMMARY:🚗 Pick up Ashwin – O\'Hare (ORD)\\, lands 2:35 PM\r\n') >= 0 &&
      evText.indexOf('SUMMARY:🚗 Drop off Ashwin – O\'Hare (ORD)\\, flight 3:30 PM\r\n') >= 0 && /\r\nLOCATION:O'Hare International Airport \(ORD\)\r\n/.test(evText) && (evText.match(/STATUS:CONFIRMED/g) || []).length === 2 &&
      (() => {
        const ds = evText.replace(/\r\n /g, '').split('\r\n').filter((l) => /^DESCRIPTION:/.test(l) && !/^DESCRIPTION:🚗/.test(l)), link = M.guestLink(ptId, '', WK);
        return ds.length === 2 && ds.every((l) => { const urls = l.match(/https?:\/\/[^\s\\]+/g) || []; return urls.length === 1 && urls[0] === link && !/#k=|t=|\$/.test(l); }) &&
          ds[0] === 'DESCRIPTION:Fri 11/20: pick up Ashwin at O\'Hare (ORD)\\, lands 2:35 PM (leave home 12:05 PM\\, home about 5:05 PM).\\n' + link;
      })() &&
      evText.indexOf(KEY) < 0 && !/#k=|t=|\$/.test(evText) && evText.split('\r\n').every((l) => Buffer.byteLength(l) <= 75) && ev.ics.filename === 'rides-ptownthanksgiving.ics' &&
      M.rideEvents(pm(pt2, 'ashwin-t2'), 'ashwin-t2', { today: T, now: NOW }) === null && M.rideEvents(pm(pt2, 'momdad-t1', '2026-12-01'), 'momdad-t1', { today: '2026-12-01', now: NOW }) === null &&
      M.rideEvents(pm(pt3, 'momdad-t1'), 'momdad-t1', { today: T, now: NOW, worker: WK }).sig !== ev.sig,
      'AC12 rideEvents: one calendar file with both of Mom & Dad\'s runs, each from leaving home to back (floating DTSTART:20261120T120500, no Z, no TZID), two alarms each (a day before, 30 minutes before), PIA-159 UID <id>-<driver>-<a|d><MMDD>-<lead>@pialax, the ride in words then the guest link as its description (one URL, the guest link; no key, token or price), lines folded at 75 octets; nothing for someone who drives nothing or once the trip is over; a time change changes its signature', evText.slice(0, 600));
    // calendarAdd and icsText are byte-identical to b2cfd85 (the one calendar builder now shares icsCalendar)
    const evs = [{ uid: 'a@pialax', stamp: '20261017T190000Z', d1: '2026-11-20', end: '2026-12-01', title: '? 🦃 P town; thanksgiving, with "everyone"\n', where: 'Chicago', details: WK + '/i/' + ptId, tentative: true },
      { uid: 'b@pialax', stamp: '20261017T190000Z', d1: '2026-11-20', end: '2026-12-01', title: 'x'.repeat(200), where: '', details: '', tentative: false }];
    const cal = M.calendarAdd(pm(pt0, 'ashwin-t2', TODAY), { today: TODAY, now: NOW, worker: WK });
    const calEv = { uid: ptId + '-ashwin-t2@pialax', stamp: new Date(NOW).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'), d1: cal.d1, end: cal.end, title: cal.title, where: cal.where, details: cal.details, tentative: cal.tentative };
    check(evs.every((e) => M.icsText(e) === OLD.icsText(e)) && cal.ics.text === OLD.icsText(calEv),
      'AC12 icsText and calendarAdd\'s file are byte-identical to b2cfd85\'s (escaping, folding, tentative and confirmed; icsCalendar is shared, not changed)');

    // ---- #156 phones read a #157 note: times read, the rest kept byte for byte (the order is load-bearing) ----
    const n157 = '🛬14:35 🛫15:30 🚗anjo-t3.aORD1120 🚌d 🧺🥧 Bringing pie';
    const o157 = tweak(pt0, (d) => { d.responses['ashwin-t2'].note = n157; });
    const oT = OLD.timesRequest(o157, 'ashwin-t2', '15:05', undefined, 'self'), oA = OLD.respondRequest(o157, 'ashwin-t2', { status: 'maybe' }, { by: 'self' });
    const oBad = OLD.parseRespNote('🚗anjo-t3.aORD1120 🛬14:35 🛫15:30 hi');
    check(OLD.parseRespNote(n157).arr === '14:35' && OLD.parseRespNote(n157).dep === '15:30' && OLD.parseRespNote(n157).text === '🚗anjo-t3.aORD1120 🚌d 🧺🥧 Bringing pie' &&
      oT.body.note === '🛬15:05 🛫15:30 🚗anjo-t3.aORD1120 🚌d 🧺🥧 Bringing pie' && oA.body.note === n157 &&
      eq(M.parseRespNote(oT.body.note).claims, [{ code: 'anjo-t3', kind: 'a', ap: 'ORD', day: '1120' }]) && M.parseRespNote(oT.body.note).bus === 'd' &&
      oBad.arr === '' && oBad.dep === '' && OLD.timesRequest(tweak(pt0, (d) => { d.responses['ashwin-t2'].note = '🚗anjo-t3.aORD1120 🛬14:35 🛫15:30'; }), 'ashwin-t2', '15:05', undefined, 'self').body.note !== '🚗anjo-t3.aORD1120 🛬15:05 🛫15:30',
      'AC13 a #156 phone (b2cfd85\'s functions, verbatim) reads 🛬 / 🛫 from a #157 note, keeps the markers after them as text, and writes them back byte for byte after a time change or an answer change; a marker written before 🛬 would break that (the order is load-bearing)', { oT: oT.body.note, oA: oA.body.note });

    // ---- 280: refused, never clipped (an 8-member trip with 32-character codes) ----
    const big = { v: 1, id: 'bgBigFamilyRidesTest01', idea: { title: '🦃 Big', destination: { city: 'Chicago', airport: 'ORD' }, dates: { departure: '2026-11-20', return: '2026-11-30', searchStart: '', searchEnd: '' }, recommendation: null, notes: '',
      members: [{ code: 'h'.repeat(32), label: '🌽 Mom & Dad', airport: 'PIA', headcount: 2 }].concat(Array.from({ length: 7 }, (_, i) => ({ code: String.fromCharCode(97 + i).repeat(31) + i, label: M.FACES[i] + ' T' + i, airport: 'LAX', headcount: 1 }))) },
      responses: {}, decision: { stage: 'chosen', chosen: { airport: 'ORD', city: 'Chicago', departure: '2026-11-20', return: '2026-11-30' } } };
    big.idea.members.slice(1).forEach((x, i) => { big.responses[x.code] = R('in', 'LAX', '', '', { booked: true, note: '🛬' + ['08:00', '12:00', '16:00', '20:00', '23:00', '06:00', '10:30'][i] + ' 🛫' + ['07:00', '11:00', '15:00', '19:00', '22:00', '05:30', '09:00'][i] }); });
    const bigR = M.rides(model(big), T), host = 'h'.repeat(32);
    let bd = clone(big), steps = 0, legs = 0, refused = null;
    for (const r of bigR.runs) { const q = M.ridesRequest(bd, host, r.key, 'on', 'self', T); if (!q) { refused = r.key; break; } bd = tweak(bd, (d) => { d.responses[host] = Object.assign(R('in', 'PIA'), { note: q.body.note }); }); steps++; legs += r.legs.length; }
    const bigNote = (bd.responses[host] || {}).note || '';
    check(bigR.runs.length >= 6 && refused !== null && steps >= 3 && bigNote.length <= 280 && M.parseRespNote(bigNote).claims.length === legs &&
      M.respondRequest(tweak(bd, (d) => { d.responses[host].note = bigNote + ' ' + 'z'.repeat(40); }), host, { claims: M.parseRespNote(bigNote).claims.concat([{ code: 'a'.repeat(31) + '0', kind: 'd', ap: 'ORD', day: '1130' }]) }, { by: 'self' }) === null &&
      M.buildRespNote(false, '', '', '', { claims: Array.from({ length: 9 }, (_, i) => ({ code: 'q'.repeat(32), kind: i % 2 ? 'a' : 'd', ap: 'ORD', day: '11' + (10 + i) })) }) === null,
      'AC14 the 8-member trip with 32-character codes: one host claiming run after run fills the note to ' + bigNote.length + ' of 280 after ' + steps + ' runs, then the next claim is refused (null), never clipped; markers alone past 280 build nothing', { steps, refused, len: bigNote.length });

    // ---- fix pass ----
    // the 📅 dot's signature: a run that passes is no change; a driver who now drives nothing ahead is one
    const evB = M.rideEvents(pm(pt2, 'momdad-t1'), 'momdad-t1', { today: T, now: NOW }), evB21 = M.rideEvents(pm(pt2, 'momdad-t1', '2026-11-21'), 'momdad-t1', { today: '2026-11-21', now: NOW });
    const evOut = M.rideEvents(pm(tweak(pt2, (d) => { d.responses['ashwin-t2'].status = 'out'; }), 'momdad-t1'), 'momdad-t1', { today: T, now: NOW });
    check(evB.sig.split(';').every((s) => /^[ad]ORD11[23]0-ashwin-t2\|2026-11-[23]0\|/.test(s)) && evB21.sig !== evB.sig && M.rideSigAhead(evB.sig, '2026-11-21') === evB21.sig && M.rideSigAhead(evB.sig, T) === evB.sig &&
      M.rideSigAhead(evB.sig, '2026-12-01') === '' && evOut === null && M.rideSigAhead(evB.sig, T) !== '' && M.rideSigAhead('', T) === '' && M.rideSigAhead('junk', T) === '',
      'FIX the 📅 signature names each run\'s day: read less the runs behind us (rideSigAhead), Mom & Dad\'s two rides kept on 10/30 equal the one left on 11/21 (a run that passes is no change, so no dot the day after a drive), nothing after the trip; once Ashwin is Out they drive nothing (rideEvents null) while what they kept is still ahead: a change, so the dot shows', { evB: evB.sig, evB21: evB21.sig });
    // a share of a run: Mom & Dad cover Ashwin's 14:35, Bob (there 11/15–11/30) covers Anjo's 15:10 in the same run: the toggle releases it
    const bob = (d) => { d.idea.members.push({ code: 'bob-t4', label: '🎸 Bob', airport: 'SEA', headcount: 1 }); d.responses['bob-t4'] = R('in', 'SEA', '2026-11-15', '2026-12-05', { booked: true }); };
    const ptE = srv.seed(tweak(PTD, (d) => { bob(d); d.responses['anjo-t3'].booked = true; d.responses['anjo-t3'].note = '🛬15:10 🛫17:00'; d.responses['momdad-t1'] = R('in', 'PIA', '', '', { note: '🚗ashwin-t2.aORD1120' }); d.responses['bob-t4'].note = '🚗anjo-t3.aORD1120'; }));
    const ptE0 = await srv.get(ptE, KEY), rE = M.rides(pm(ptE0), T).runs[0];
    const offE = M.ridesRequest(ptE0, 'momdad-t1', kR1, M.rideToggle(rE, 'momdad-t1'), 'self', T), offRes = await srv.send(offE), rE1 = M.rides(pm(await srv.get(ptE, KEY)), T).runs[0];
    check(rE.key === kR1 && eq(rE.legs.map((l) => l.ride.by.join()), ['momdad-t1', 'bob-t4']) && M.rideToggle(rE, 'momdad-t1') === 'off' && M.rideToggle(rE, 'bob-t4') === 'off' &&
      M.ridesRequest(ptE0, 'momdad-t1', kR1, 'on', 'self', T) === null && M.rideGuard(ptE0, 'momdad-t1', kR1, 'on', T) === 'same' && srv.allOk(offRes) && offE.body.note === '' &&
      eq(rE1.legs.map((l) => l.ride.by.join()), ['', 'bob-t4']) && M.rideToggle(rE1, 'momdad-t1') === 'on',
      'FIX a driver with a share of a run (Mom & Dad drive Ashwin, Bob drives Anjo in the same 11/20 run) can let it go: rideToggle says off (aria-pressed), its write takes their claim back through the real Worker, Bob\'s stays; "on" there builds nothing and the guard calls it same', { e: rE.legs.map((l) => l.ride), e1: rE1.legs.map((l) => l.ride.by) });
    // a traveler who joined a run I drive: the toggle claims her leg too; every leg someone else's: on, held as taken
    const joined = tweak(pt1, (d) => { d.responses['anjo-t3'].booked = true; d.responses['anjo-t3'].note = '🛬15:10'; }), rJ = M.rides(pm(joined), T).runs[0];
    const allOther = tweak(ptC0, (d) => { d.responses['momdad-t1'] = R('in', 'PIA', '', '', { note: '🚗ashwin-t2.aORD1120' }); }), rAO = M.rides(pm(allOther), T).runs[0];
    check(eq(rJ.legs.map((l) => l.code + ':' + l.ride.by.join()), ['ashwin-t2:momdad-t1', 'anjo-t3:']) && M.rideToggle(rJ, 'momdad-t1') === 'on' && M.ridesRequest(joined, 'momdad-t1', kR1, 'on', 'self', T).body.note === '🚗ashwin-t2.aORD1120,anjo-t3.aORD1120' &&
      M.primaryAction(pm(joined, 'momdad-t1'), T) === 'drive' && M.rideToggle(rAO, 'anjo-t3') === 'on' && M.rideGuard(allOther, 'anjo-t3', kR1, 'on', T) === 'taken',
      'FIX Anjo booked into the run Mom & Dad drive (her 15:10 open): their toggle reads ☐ and claims her leg too (one note: both claims); a candidate on a run every leg of which someone else drives: on, held as "Already covered"');
    // the same end state on the fresh record (Mom's and Dad's phones, one member): 'same', nothing to send; 🚌 / 🚙 likewise
    check(M.rideGuard(pt2, 'momdad-t1', kR1, 'on', T) === 'same' && M.ridesRequest(pt2, 'momdad-t1', kR1, 'on', 'self', T) === null && M.rideGuard(pt0, 'momdad-t1', kR1, 'off', T) === 'same' &&
      M.rideGuard(pt2, 'momdad-t1', kR1, 'ok', T) === 'same' && M.rideGuard(dayMv, 'momdad-t1', 'aORD1121-ashwin-t2', 'ok', T) === '' && M.rideGuard(pt2, 'momdad-t1', kR1, 'off', T) === '' &&
      M.groundGuard(pt4, 'ashwin-t2', 'd', 'bus', T) === 'same' && M.groundGuard(pt4, 'ashwin-t2', 'd', 'rent', T) === '' && M.groundGuard(pt3, 'ashwin-t2', 'd', '', T) === 'same' &&
      M.groundGuard(tweak(pt4, (d) => { d.decision.stage = 'dropped'; }), 'ashwin-t2', 'd', 'rent', T) === 'closed',
      'FIX a tap whose end state the fresh record already has is "same", not an error: claim a run already theirs, take back one they never had, ✓ with nothing moved; 🚌 on a leg already 🚌, a family ride already one; removed: closed');
    // too long is told apart from the other nulls: the patch builds, the note does not
    const longD = tweak(pt0, (d) => { d.responses['momdad-t1'] = R('in', 'PIA', '', '', { note: 'x'.repeat(261) }); }), longA = tweak(pt0, (d) => { d.responses['anjo-t3'].booked = true; d.responses['anjo-t3'].note = '🛬15:10 ' + 'y'.repeat(270); });
    check(M.ridesRequest(longD, 'momdad-t1', kR1, 'on', 'self', T) === null && eq(M.rideClaims(longD, 'momdad-t1', kR1, 'on', 'self', T), { claims: [{ code: 'ashwin-t2', kind: 'a', ap: 'ORD', day: '1120' }] }) &&
      M.rideClaims(pt2, 'momdad-t1', kR1, 'on', 'self', T) === null && M.groundRequest(longA, 'anjo-t3', 'a', 'rent', 'self', T) === null && eq(M.groundPatch(longA, 'anjo-t3', 'a', 'rent', 'self', T), { bus: '', rent: 'a' }) &&
      M.groundPatch(pt4, 'ashwin-t2', 'd', 'bus', 'self', T) === null,
      'FIX a claim or 🚙 the note has no room for: rideClaims / groundPatch build the patch, ridesRequest / groundRequest refuse the note (the phone says ⚠ Too long); no change builds no patch either');
    // a claim by someone who is no longer there that day is ignored (the leg open again) and dropped on their next ride write
    const ptF = srv.seed(tweak(PTD, (d) => { bob(d); d.responses['bob-t4'].note = '🚗ashwin-t2.aORD1120'; })), ptF0 = await srv.get(ptF, KEY);
    const moveBob = M.respondRequest(ptF0, 'bob-t4', { available_from: '2026-11-21' }, { by: 'self' }); await srv.send(moveBob); const ptF1 = await srv.get(ptF, KEY), rF1 = M.rides(pm(ptF1), T);
    const bobOn = M.ridesRequest(ptF1, 'bob-t4', kR2, 'on', 'self', T), bobRes = await srv.send(bobOn), ptF2 = await srv.get(ptF, KEY);
    check(M.rides(pm(ptF0), T).runs[0].state === 'covered' && rF1.runs[0].state === 'open' && eq(rF1.runs[0].legs[0].ride.by, []) && eq(rF1.runs[0].candidates, ['momdad-t1']) && rF1.open === 2 &&
      M.drivesOf(rF1, 'bob-t4').length === 0 && M.primaryAction(pm(ptF1, 'bob-t4'), T) !== 'drive' && srv.allOk(bobRes) && ptF2.responses['bob-t4'].note === '🚗ashwin-t2.dORD1130',
      'FIX Bob claimed Ashwin\'s 11/20 pickup, then moved his own arrival to 11/21: he is no longer a candidate of that run, so his claim is ignored (R1 open, Mom & Dad its one candidate), and his next ride write (Ashwin\'s 11/30 drop-off) drops it', { r: rF1.runs[0].legs[0].ride, note: ptF2.responses['bob-t4'].note });
    // the ride's words name a nameless v1 'Me' as the family preset does (never a bare face)
    const v1t = M.rideText(v1m, v1r.runs, 'ask');
    check(M.rideName(v1m.members.find((x) => x.code === 'LAX')) === 'Ashwin' && /pick up Ashwin at Peoria \(PIA\)/.test(v1t) && !/💪/.test(v1t) && M.rideName(mem(pm(pt0), 'anjo-t3')) === 'Anjo' &&
      M.rideName({ name: '', short: '', one: '', face: '🎸', airport: 'LAX' }) === '🎸',
      'FIX the ride text on the v1 Thanksgiving names its "Me" at LAX (💪) Ashwin, as ⤒ Update trip does ("pick up Ashwin at PIA…"); a nameless member the preset does not recognise keeps their face', v1t);
  }

  // ═══ PIA-158 ═════════════════════════════════════════════════════════════
  section('PIA-158 pets & fun: Nebby per trip and Kona at home from the preset, 🐈 / 🧺 written through the real Worker, the house filling up, 🎊 all set, "+ Nebby 🐈" in the ride words and the 📅 signature');
  {
    const T = '2026-10-30', WK = 'https://pialax-proxy.ashwinyedavalli.workers.dev';
    const PTD = { v: 1, id: 'ptPTownPetsAndFun0001', created_at: '2026-10-14T10:00:00.000Z', updated_at: '2026-10-16T10:00:00.000Z',
      idea: { title: '🦃 P town thanksgiving', destination: { city: 'Chicago', airport: 'ORD' }, dates: { departure: '2026-11-20', return: '2026-11-30', searchStart: '', searchEnd: '' }, recommendation: null, notes: '',
        members: [{ code: 'momdad-t1', label: '🌽 Mom & Dad', airport: 'PIA', headcount: 2 }, { code: 'ashwin-t2', label: '💪 Ashwin', airport: 'LAX', headcount: 1 }, { code: 'anjo-t3', label: '🗽 Anjo', airport: 'LGA', headcount: 1 }] },
      responses: { 'ashwin-t2': R('in', 'LAX', '', '', { booked: true, booked_at: '2026-10-16T00:00:00.000Z', note: '🛬14:35 🛫15:30' }), 'anjo-t3': R('in', 'LGA') },
      decision: { stage: 'chosen', chosen: { airport: 'ORD', city: 'Chicago', departure: '2026-11-20', return: '2026-11-30' }, chosen_at: '2026-10-16T00:00:00.000Z', estimate_total: null, actual_total: null, booked_at: null, delta_pct: null },
      log: [] };
    const pm = (doc, me, today, over) => M.tripModel(doc, Object.assign({ today: today || T, now: NOW, me: me || null }, over || {}));
    const ptId = srv.seed(PTD), pt0 = await srv.get(ptId, KEY);

    // ---- familyKey: the preset by home airport and name, whatever the face; petOf / petsOf ----
    const fk = (label, airport) => M.familyKey({ code: 'x', label, airport });
    check(fk('💪 Ashwin', 'LAX') === 'ashwin' && M.familyOf({ code: 'x', label: '💪 Ashwin', airport: 'LAX' }) === null && fk('Me', 'LAX') === 'ashwin' && fk('', 'LAX') === 'ashwin' && fk('💪', 'LAX') === 'ashwin' &&
      fk('🦊', 'LAX') === '' && fk('🌽', 'PIA') === 'momdad' && fk('🦊', 'PIA') === '' &&
      fk('🌴 Ashwin', 'LAX') === 'ashwin' && fk('🌽 Mom & Dad', 'PIA') === 'momdad' && fk('Mom & Dad', 'ORD') === 'momdad' && fk('🗽 Anjo', 'LGA') === 'anjo' &&
      fk('💪 Ash', 'LAX') === '' && fk('💪 Ashwin', 'SEA') === '' && fk('🐢 Sam', 'LAX') === '' && M.PETS.ashwin.name === 'Nebby' && M.PETS.ashwin.flies && M.PETS.momdad.name === 'Kona' && M.PETS.momdad.home &&
      mem(pm(pt0), 'ashwin-t2').fam === 'ashwin' && mem(pm(pt0), 'momdad-t1').fam === 'momdad' && mem(pm(pt0), 'anjo-t3').fam === 'anjo' && mem(model(LEG), 'LAX').fam === 'ashwin',
      'familyKey: the family preset\'s key by home airport and name, the face free (a v2 "💪 Ashwin", for which familyOf is null, a v1 "Me", no name, another face beside the name): ashwin / momdad / anjo; a label that is only a face counts only as the preset\'s own face (💪 at LAX, 🌽 at PIA; 🦊 alone is nobody\'s); a renamed member, a moved airport or anyone else: none. PETS: Nebby flies, Kona is at home; every member carries fam');
    const pt1d = tweak(pt0, (d) => { d.responses['ashwin-t2'].note = '🛬14:35 🛫15:30 🐈ad'; });
    const ps1 = M.petsOf(pm(pt1d)), ps0 = M.petsOf(pm(pt0));
    check(eq(ps1, { 'momdad-t1': { g: '🐕', name: 'Kona', home: true }, 'ashwin-t2': { g: '🐈', name: 'Nebby', legs: 'ad', flies: true } }) && eq(ps0, { 'momdad-t1': { g: '🐕', name: 'Kona', home: true } }) &&
      eq(Object.keys(M.petsOf(pm(tweak(pt1d, (d) => { d.responses['momdad-t1'] = R('out', 'PIA'); })))), ['ashwin-t2']) &&
      eq(Object.keys(M.petsOf(pm(tweak(pt1d, (d) => { d.responses['ashwin-t2'].status = 'out'; })))), ['momdad-t1']) &&
      eq(M.petsOf(pm(tweak(pt1d, (d) => { d.idea.destination = { city: 'Los Angeles', airport: 'LAX' }; d.decision.chosen.airport = 'LAX'; }))), {}) &&
      eq(M.petsOf(pm(tweak(pt1d, (d) => { d.idea.destination = { city: 'New York', airport: 'LGA' }; d.decision.chosen.airport = 'LGA'; d.responses['momdad-t1'] = R('in', 'PIA'); }))), { 'ashwin-t2': { g: '🐈', name: 'Nebby', legs: 'ad', flies: true } }) &&
      M.petOf(mem(pm(tweak(pt1d, (d) => { d.responses['ashwin-t2'].note = '🐈a'; })), 'ashwin-t2')).legs === 'a' && M.petLeg(mem(pm(tweak(pt1d, (d) => { d.responses['ashwin-t2'].note = '🐈a'; })), 'ashwin-t2'), 'd') === null &&
      pm(pt1d).heads === pm(pt0).heads,
      'petsOf: Ashwin\'s 🐈ad → Nebby both ways; Mom & Dad hosting (not Out) → Kona at home (derived, never written, never in heads); a host who said Out → no Kona; Ashwin Out → no Nebby; a trip to LAX (Ashwin hosts) has neither; New York (Mom & Dad travel) has no Kona; 🐈a flies the arrival only', ps1);

    // ---- 🐈: the owner's own answer through the real Worker; the organizer's 'keep'; refusals ----
    const qPet = M.petRequest(pt0, 'ashwin-t2', 'ad', 'self', T), resPet = await srv.send(qPet), pt1 = await srv.get(ptId, KEY);
    const qOff = M.petRequest(pt1, 'ashwin-t2', '', 'keep', T);
    check(srv.allOk(resPet) && pt1.responses['ashwin-t2'].note === '🛬14:35 🛫15:30 🐈ad' && pt1.responses['ashwin-t2'].booked === true && pt1.responses['ashwin-t2'].status === 'in' &&
      M.petRequest(pt1, 'ashwin-t2', 'ad', 'self', T) === null && M.petGuard(pt1, 'ashwin-t2', 'ad', T) === 'same' && M.petGuard(pt1, 'ashwin-t2', '', T) === '' && M.petGuard(tweak(pt1, (d) => { d.decision.stage = 'dropped'; }), 'ashwin-t2', '', T) === 'closed' &&
      qOff && qOff.body.note === '🛬14:35 🛫15:30' && M.parseRespNote(qOff.body.note).called === false &&
      M.petRequest(pt0, 'anjo-t3', 'ad', 'self', T) === null && M.petRequest(pt0, 'momdad-t1', 'ad', 'self', T) === null && M.petRequest(pt0, 'ashwin-t2', 'x', 'self', T) === null &&
      M.petRequest(pt0, 'ashwin-t2', 'ad', 'self', '2026-12-01') === null && M.petRequest(tweak(pt0, (d) => { d.decision.stage = 'booked'; d.decision.actual_total = 900; }), 'ashwin-t2', 'ad', 'self', T) === null &&
      M.petRequest(tweak(pt0, (d) => { d.responses['ashwin-t2'] = R('maybe', 'LAX'); }), 'ashwin-t2', 'a', 'self', T).body.note === '🐈a' && M.petRequest(tweak(pt0, (d) => { delete d.responses['ashwin-t2']; }), 'ashwin-t2', 'ad', 'self', T) === null &&
      M.petRequest(tweak(LEG, (d) => { d.responses.LAX.note = 'hi'; }), 'LAX', 'ad', 'self', TODAY).body.note === '🐈ad hi' && M.petRequest(LEG, 'LAX', 'ad', 'keep', TODAY) === null,
      'petRequest: Ashwin\'s own 🐈ad (the Worker keeps his 🎫 and 🛬 / 🛫), nothing again, the guard\'s same / closed, the organizer\'s off (keep: no 📞); none for Anjo (no pet that flies), a host, a bad leg, after the trip, a paid trip or before he answers; Maybe goes; on the v1 Thanksgiving his own write goes and the organizer\'s for him waits for ⤒', { note: pt1.responses['ashwin-t2'].note, off: qOff && qOff.body.note });
    // 280: refused, never clipped (petPatch builds, petRequest does not, so the phone says "⚠ Too long")
    const longP = tweak(pt0, (d) => { d.responses['ashwin-t2'].note = '🛬14:35 🛫15:30 ' + 'n'.repeat(262); });
    check(M.petRequest(longP, 'ashwin-t2', 'ad', 'self', T) === null && eq(M.petPatch(longP, 'ashwin-t2', 'ad', 'self', T), { pet: 'ad' }) && M.petPatch(pt1, 'ashwin-t2', 'ad', 'self', T) === null,
      'a 🐈 the note has no room for: petPatch builds {pet: ad}, petRequest refuses (null), the typed text is never cut; no change builds no patch');
    // fix pass: petPatch and dishPatch hold every refusal but the note's room themselves (so the phone's "⚠ Too long", patch && !request,
    // never stands for a trip that closed, someone Out or a traveler who has not answered)
    const paidP = tweak(pt0, (d) => { d.decision.stage = 'booked'; d.decision.actual_total = 900; }), dropP = tweak(pt0, (d) => { d.decision.stage = 'dropped'; });
    const cPatch = [M.petPatch(paidP, 'ashwin-t2', 'ad', 'self', T), M.petPatch(dropP, 'ashwin-t2', 'ad', 'self', T), M.petPatch(tweak(pt0, (d) => { delete d.responses['ashwin-t2']; }), 'ashwin-t2', 'ad', 'self', T),
      M.petPatch(tweak(pt0, (d) => { d.responses['ashwin-t2'].status = 'out'; }), 'ashwin-t2', 'ad', 'self', T), M.petPatch(pt0, 'momdad-t1', 'ad', 'self', T), M.petPatch(pt0, 'anjo-t3', 'ad', 'self', T),
      M.petPatch(LEG, 'LAX', 'ad', 'keep', TODAY), M.petPatch(pt0, 'ashwin-t2', 'ad', 'self', '2026-12-01'), M.petPatch(pt0, 'ashwin-t2', 'x', 'self', T),
      M.dishPatch(paidP, 'anjo-t3', ['🥧'], 'self', T), M.dishPatch(dropP, 'anjo-t3', ['🥧'], 'self', T), M.dishPatch(tweak(pt0, (d) => { d.responses['anjo-t3'].status = 'out'; }), 'anjo-t3', ['🥧'], 'self', T),
      M.dishPatch(tweak(pt0, (d) => { delete d.responses['anjo-t3']; }), 'anjo-t3', ['🥧'], 'self', T), M.dishPatch(pt0, 'anjo-t3', ['🥧', '🍰', '🍪', '🧁'], 'self', T), M.dishPatch(pt0, 'anjo-t3', ['🦃'], 'self', T),
      M.dishPatch(LEG, 'PIA', ['🥧'], 'keep', TODAY), M.dishPatch(pt0, 'anjo-t3', ['🥧'], 'self', '2026-12-01')];
    check(cPatch.every((p) => p === null) && eq(M.petPatch(pt0, 'ashwin-t2', 'ad', 'self', T), { pet: 'ad' }) && eq(M.dishPatch(pt0, 'anjo-t3', ['🥧'], 'self', T), { dish: ['🥧'] }) &&
      eq(M.petPatch(LEG, 'LAX', 'ad', 'self', TODAY), { pet: 'ad' }),
      'petPatch / dishPatch refuse what petRequest / dishRequest refuse, the note\'s room aside: a paid or removed trip, a traveler who has not answered, someone Out, a host or a traveler with no pet that flies, the organizer\'s for someone on a v1 trip, after the trip, a bad leg; a 4th dish, one off the palette; the plain cases build', cPatch.map((p, i) => (p === null ? -1 : i)).filter((i) => i >= 0));

    // ---- 🧺: anyone's own answer (a host's default becomes In), keeping the driver's 🚗 claims byte for byte ----
    const qDish = M.dishRequest(pt1, 'momdad-t1', ['🥧', '🍷'], 'self', T), resDish = await srv.send(qDish), pt2 = await srv.get(ptId, KEY);
    const ptB = srv.seed(PTD), ptB0 = await srv.get(ptB, KEY), qOrgD = M.dishRequest(ptB0, 'momdad-t1', ['🥧'], 'keep', T), resOrgD = await srv.send(qOrgD), ptB1 = await srv.get(ptB, KEY);
    check(srv.allOk(resDish) && pt2.responses['momdad-t1'].status === 'in' && pt2.responses['momdad-t1'].note === '🧺🥧🍷' && pt2.responses['momdad-t1'].origin === 'PIA' &&
      srv.allOk(resOrgD) && ptB1.responses['momdad-t1'].status === 'in' && ptB1.responses['momdad-t1'].note === '📞 🧺🥧' && eq(mem(pm(pt2), 'momdad-t1').dish, ['🥧', '🍷']),
      '🧺 Mom & Dad on their default: their own first dish write answers In (no 📞), 🧺🥧🍷 in their note; the organizer\'s for them answers on their behalf (📞 🧺🥧)', [pt2.responses['momdad-t1'], ptB1.responses['momdad-t1']]);
    const claimsQ = M.ridesRequest(pt2, 'momdad-t1', 'aORD1120-ashwin-t2', 'on', 'self', T); await srv.send(claimsQ); const pt3 = await srv.get(ptId, KEY);
    const claimsQ2 = M.ridesRequest(pt3, 'momdad-t1', 'dORD1130-ashwin-t2', 'on', 'self', T); await srv.send(claimsQ2); const pt4 = await srv.get(ptId, KEY);
    const qDish2 = M.dishRequest(pt4, 'momdad-t1', ['🍗'], 'self', T), resDish2 = await srv.send(qDish2), pt5 = await srv.get(ptId, KEY);
    const qPet2 = M.petRequest(pt5, 'ashwin-t2', 'a', 'self', T), resPet2 = await srv.send(qPet2), pt6 = await srv.get(ptId, KEY);
    check(pt4.responses['momdad-t1'].note === '🚗ashwin-t2.aORD1120,ashwin-t2.dORD1130 🧺🥧🍷' && srv.allOk(resDish2) && pt5.responses['momdad-t1'].note === '🚗ashwin-t2.aORD1120,ashwin-t2.dORD1130 🧺🍗' &&
      srv.allOk(resPet2) && pt6.responses['ashwin-t2'].note === '🛬14:35 🛫15:30 🐈a' && M.rides(pm(pt6), T).open === 0 && pt6.responses['momdad-t1'].note === pt5.responses['momdad-t1'].note,
      '🧺 a dish write keeps the driver\'s 🚗 claims byte for byte (🚗ashwin-t2.aORD1120,ashwin-t2.dORD1130 🧺🍗) and a 🐈 write keeps 🛬 / 🛫 (🛬14:35 🛫15:30 🐈a), through the real Worker; both rides stay covered', [pt5.responses['momdad-t1'].note, pt6.responses['ashwin-t2'].note]);
    const longD = tweak(pt0, (d) => { d.responses['anjo-t3'].note = 'y'.repeat(276); });
    check(M.dishRequest(pt0, 'anjo-t3', ['🥧', '🍰', '🍪', '🧁'], 'self', T) === null && M.dishRequest(pt0, 'anjo-t3', ['🦃'], 'self', T) === null && M.dishRequest(pt0, 'anjo-t3', '🥧', 'self', T) === null &&
      M.dishRequest(pt0, 'anjo-t3', ['🥧', '🥧'], 'self', T) === null && M.dishRequest(pt0, 'anjo-t3', ['🥧'], 'self', T).body.note === '🧺🥧' &&
      M.dishRequest(pt5, 'momdad-t1', ['🍗'], 'self', T) === null && M.dishRequest(pt5, 'momdad-t1', [], 'self', T).body.note === '🚗ashwin-t2.aORD1120,ashwin-t2.dORD1130' &&
      M.dishRequest(tweak(pt0, (d) => { d.responses['anjo-t3'].status = 'out'; }), 'anjo-t3', ['🥧'], 'self', T) === null && M.dishRequest(tweak(pt0, (d) => { delete d.responses['anjo-t3']; }), 'anjo-t3', ['🥧'], 'self', T) === null &&
      M.dishRequest(pt0, 'anjo-t3', ['🥧'], 'self', '2026-12-01') === null && M.dishRequest(tweak(pt0, (d) => { d.decision.stage = 'dropped'; }), 'anjo-t3', ['🥧'], 'self', T) === null &&
      M.dishRequest(LEG, 'PIA', ['🥧'], 'keep', TODAY) === null && M.dishRequest(LEG, 'PIA', ['🥧'], 'self', TODAY).body.status === 'in' &&
      M.dishRequest(longD, 'anjo-t3', ['🥧'], 'self', T) === null && eq(M.dishPatch(longD, 'anjo-t3', ['🥧'], 'self', T), { dish: ['🥧'] }) &&
      M.dishGuard(pt5, 'momdad-t1', ['🍗'], T) === 'same' && M.dishGuard(pt5, 'momdad-t1', ['🥧'], T) === '' && M.dishGuard(tweak(pt5, (d) => { d.decision.stage = 'booked'; }), 'momdad-t1', ['🥧'], T) === 'closed',
      '🧺 refusals: a 4th dish, one off the palette, not a list, one twice, no change, someone Out, a traveler who has not answered, after the trip, a removed trip, the organizer\'s for someone on a v1 trip (their own goes: Mom & Dad\'s first answer); [] clears it and keeps the claims; a note with no room: dishPatch builds, dishRequest refuses; the guard\'s same / closed');

    // ---- the house, by day: 10/30, 11/20, 12/1 ----
    const ptA = tweak(pt1d, (d) => { d.responses['anjo-t3'].booked = true; d.responses['anjo-t3'].note = '🛬15:10 🛫17:00'; });
    const hs = (doc, day) => M.houseScene(pm(doc, null, day), day);
    const h1030 = hs(pt1d, T), h1120 = hs(ptA, '2026-11-20'), h1201 = hs(ptA, '2026-12-01'), hOut = hs(tweak(pt1d, (d) => { d.responses['momdad-t1'] = R('out', 'PIA'); }), T);
    check(eq(h1030, { win: ['momdad-t1'], path: ['ashwin-t2'], door: [{ g: '🐕', name: 'Kona', code: 'momdad-t1' }], walk: [{ g: '🐈', name: 'Nebby', code: 'ashwin-t2' }], lit: false }) &&
      eq(h1120, { win: ['momdad-t1', 'ashwin-t2', 'anjo-t3'], path: [], door: [{ g: '🐕', name: 'Kona', code: 'momdad-t1' }, { g: '🐈', name: 'Nebby', code: 'ashwin-t2' }], walk: [], lit: true }) &&
      eq(h1201, { win: ['momdad-t1'], path: [], door: [{ g: '🐕', name: 'Kona', code: 'momdad-t1' }], walk: [], lit: false }) &&
      eq(hOut, { win: [], path: ['ashwin-t2'], door: [], walk: [{ g: '🐈', name: 'Nebby', code: 'ashwin-t2' }], lit: false }) && eq(hs(ptA, T).path, ['ashwin-t2', 'anjo-t3']),
      'houseScene: on 10/30 Mom & Dad in the window, Ashwin on the path with Nebby beside him (Anjo, not booked, is not drawn), Kona at the door; on 11/20 everyone booked is there (the window lit, Nebby at the door with Kona); on 12/1 the hosts alone; a host who said Out leaves the window and the door empty', { h1030, h1120 });
    // ---- 🎊 all set ----
    const allC = tweak(ptA, (d) => { d.responses['momdad-t1'] = R('in', 'PIA', '', '', { note: '🚗ashwin-t2.aORD1120,anjo-t3.aORD1120,ashwin-t2.dORD1130,anjo-t3.dORD1130' }); });
    const nyc = tweak(pt0, (d) => { d.idea.destination = { city: 'New York', airport: 'LGA' }; d.decision.chosen.airport = 'LGA'; d.responses['anjo-t3'].booked = true; d.responses['momdad-t1'] = R('in', 'PIA'); d.responses['momdad-t1'].booked = true; });
    check(M.allSet(pm(allC), T) === true && M.allSet(pm(pt0), T) === false && M.allSet(pm(ptA), T) === false &&
      M.allSet(pm(tweak(allC, (d) => { d.responses['anjo-t3'].note = '🛬15:10'; })), T) === false && M.rides(pm(tweak(allC, (d) => { d.responses['anjo-t3'].note = '🛬15:10'; })), T).open === 0 &&
      M.allSet(pm(allC, null, '2026-12-01'), '2026-12-01') === false && M.allSet(pm(tweak(allC, (d) => { d.decision.stage = 'dropped'; })), T) === false &&
      M.allSet(pm(tweak(allC, (d) => { d.decision.stage = 'booked'; d.decision.actual_total = 1800; })), T) === true && M.allSet(pm(nyc), T) === true &&
      M.allSet(pm(tweak(allC, (d) => { d.responses['anjo-t3'].status = 'out'; d.responses['momdad-t1'].note = '🚗ashwin-t2.aORD1120,ashwin-t2.dORD1130'; })), T) === true,
      'allSet: everyone travelling booked and every ride covered (Mom & Dad drive all four legs) → 🎊; Anjo unbooked, or a run still open → no; a booked leg ahead with no time (Anjo\'s 🛫?), which no run can plan, → no (while rides() has no open run); over or removed → no; paid → yes; New York (no rides) once everyone booked → yes; someone Out does not count');
    // fix pass: each predicate on its own (no open ride to hide it): a trip with no rides and one traveler not booked; nobody travelling (all
    // Out); the window lit only when every traveler is there; at most 4 in the window and on the path
    const nyc1 = tweak(nyc, (d) => { d.responses['momdad-t1'].booked = false; });
    const allOut = tweak(allC, (d) => { d.responses['ashwin-t2'].status = 'out'; d.responses['anjo-t3'].status = 'out'; });
    const big = tweak(ptA, (d) => { [['sam-t4', '🐢 Sam', 'BOS'], ['kim-t5', '🦉 Kim', 'SEA'], ['lee-t6', '🐙 Lee', 'SFO']].forEach(([c, l, a]) => { d.idea.members.push({ code: c, label: l, airport: a, headcount: 1 }); d.responses[c] = R('in', a, '', '', { booked: true, booked_at: '2026-10-16T00:00:00.000Z' }); }); });
    const h20 = hs(pt1d, '2026-11-20'), hO = hs(allOut, '2026-11-20'), hb30 = hs(big, T), hb21 = hs(big, '2026-11-21');
    check(M.rides(pm(nyc1), T) === null && M.allSet(pm(nyc1), T) === false && pm(allOut).travelers.length === 0 && M.allSet(pm(allOut), T) === false &&
      h20.lit === false && eq(h20.win, ['momdad-t1', 'ashwin-t2']) && hO.lit === false && eq(hO.win, ['momdad-t1']) &&
      eq(hb30.path, ['ashwin-t2', 'anjo-t3', 'sam-t4', 'kim-t5']) && eq(hb21.win, ['momdad-t1', 'ashwin-t2', 'anjo-t3', 'sam-t4']) && hb21.lit === true && pm(big).travelers.length === 5,
      'allSet and houseScene, each rule on its own: New York (no rides) with Mom & Dad not booked → no 🎊; a trip where every traveler said Out → no 🎊 and no glow; 11/20 with Ashwin there and Anjo not booked → not lit; 5 travelers: 4 on the path on 10/30 and 4 in the window on 11/21 (the hosts first), lit once all 5 are there', { h20, hb30: hb30.path, hb21: hb21.win });

    // ---- "+ Nebby 🐈" in the ride words, the calendar event and its 📅 signature; none without 🐈 ----
    const pt7 = tweak(pt4, (d) => { d.responses['ashwin-t2'].note = '🛬14:35 🛫15:30 🐈ad'; }), pt8 = tweak(pt4, (d) => { d.responses['ashwin-t2'].note = '🛬14:35 🛫15:30 🐈a'; });
    const pt9 = tweak(pt4, (d) => { d.responses['ashwin-t2'].note = '🛬14:35 🛫15:30'; });
    const ev0 = M.rideEvents(pm(pt9, 'momdad-t1'), 'momdad-t1', { today: T, now: NOW, worker: WK }), ev7 = M.rideEvents(pm(pt7, 'momdad-t1'), 'momdad-t1', { today: T, now: NOW, worker: WK });
    const ev8 = M.rideEvents(pm(pt8, 'momdad-t1'), 'momdad-t1', { today: T, now: NOW, worker: WK }), t7 = M.rideText(pm(pt7), M.rides(pm(pt7), T).runs, 'remind');
    check(ev0.sig === 'aORD1120-ashwin-t2|2026-11-20|2026-11-20|12:05|ashwin-t2@14:35;dORD1130-ashwin-t2|2026-11-30|2026-11-30|11:00|ashwin-t2@15:30' &&
      ev7.sig === 'aORD1120-ashwin-t2|2026-11-20|2026-11-20|12:05|ashwin-t2@14:35+🐈;dORD1130-ashwin-t2|2026-11-30|2026-11-30|11:00|ashwin-t2@15:30+🐈' &&
      ev8.sig === 'aORD1120-ashwin-t2|2026-11-20|2026-11-20|12:05|ashwin-t2@14:35+🐈;dORD1130-ashwin-t2|2026-11-30|2026-11-30|11:00|ashwin-t2@15:30' &&
      M.rideSigAhead(ev7.sig, '2026-11-21') === ev7.sig.split(';')[1] && M.rideSigAhead(ev0.sig, T) !== ev7.sig &&
      // (PIA-159: the words with the airport by name and home again; the signatures above are #158's byte for byte)
      ev7.ics.text.indexOf('SUMMARY:🚗 Pick up Ashwin + Nebby 🐈 – O\'Hare (ORD)\\, lands 2:35 PM\r\n') >= 0 && ev7.ics.text.indexOf('SUMMARY:🚗 Drop off Ashwin + Nebby 🐈 – O\'Hare (ORD)\\, flight 3:30 PM\r\n') >= 0 &&
      ev8.ics.text.indexOf('SUMMARY:🚗 Drop off Ashwin – O\'Hare (ORD)\\, flight 3:30 PM\r\n') >= 0 && ev0.ics.text.indexOf('Nebby') < 0 &&
      t7 === '🚗 Reminder: Fri 11/20: pick up Ashwin + Nebby 🐈 at O\'Hare (ORD), lands 2:35 PM (leave home 12:05 PM, home about 5:05 PM). Mon 11/30: drop off Ashwin + Nebby 🐈 at O\'Hare (ORD), flight 3:30 PM (leave home 11:00 AM, home about 4:00 PM).' &&
      M.rideText(pm(pt9), M.rides(pm(pt9), T).runs, 'ask') === '🚗 Can you drive? Fri 11/20: pick up Ashwin at O\'Hare (ORD), lands 2:35 PM (leave home 12:05 PM, home about 5:05 PM). Mon 11/30: drop off Ashwin at O\'Hare (ORD), flight 3:30 PM (leave home 11:00 AM, home about 4:00 PM).' &&
      ev7.ics.text.split('\r\n').every((l) => Buffer.byteLength(l) <= 75),
      'Nebby in the rides: with 🐈ad the driver\'s calendar events and the ride words say "Ashwin + Nebby 🐈" on both runs (🐈a: the pickup only), and each leg she flies ends its 📅 signature\'s time in "+🐈" (so the driver\'s 📅 Phone gets its dot); without 🐈 the signature and the words are #157\'s byte for byte', { ev0: ev0.sig, ev7: ev7.sig });
    // a #157-format note round-trips, and 🐈 off keeps every other marker
    const n157 = '📞 🛬14:35 🛫15:30 🚗anjo-t3.aORD1120 🚌d 🐈ad 🧺🥧 Bringing pie', p157 = tweak(pt0, (d) => { d.responses['ashwin-t2'].note = n157; });
    const pn = M.parseRespNote(n157);
    check(M.buildRespNote(pn.called, pn.arr, pn.dep, pn.text, M.noteMarks(pn)) === n157 && M.petRequest(p157, 'ashwin-t2', '', 'keep', T).body.note === '📞 🛬14:35 🛫15:30 🚗anjo-t3.aORD1120 🚌d 🧺🥧 Bringing pie' &&
      M.dishRequest(p157, 'ashwin-t2', ['🥧', '🍰'], 'self', T).body.note === '🛬14:35 🛫15:30 🚗anjo-t3.aORD1120 🚌d 🐈ad 🧺🥧🍰 Bringing pie',
      'a #157-format note with every marker round-trips byte for byte; 🐈 off (the organizer\'s keep) and a dish change (his own: 📞 cleared, as every own answer does) keep the other markers and the text');
  }

  // ═══ PIA-159 ═════════════════════════════════════════════════════════════
  section('PIA-159 airports per leg and 12-hour times: 🛬IATA / 🛫IATA in the traveler\'s own note under the honor rule, one drive to two airports, the ride in words, nextDrive');
  {
    const T = '2026-10-31', WK = 'https://pialax-proxy.ashwinyedavalli.workers.dev';
    const PTD = { v: 1, id: 'ptPTownAirports0000001', created_at: '2026-10-14T10:00:00.000Z', updated_at: '2026-10-16T10:00:00.000Z',
      idea: { title: '🦃 P town thanksgiving', destination: { city: 'Chicago', airport: 'ORD' }, dates: { departure: '2026-11-20', return: '2026-11-30', searchStart: '', searchEnd: '' }, recommendation: null, notes: '',
        members: [{ code: 'momdad-t1', label: '🌽 Mom & Dad', airport: 'PIA', headcount: 2 }, { code: 'ashwin-t2', label: '💪 Ashwin', airport: 'LAX', headcount: 1 }, { code: 'anjo-t3', label: '🗽 Anjo', airport: 'LGA', headcount: 1 }] },
      responses: { 'ashwin-t2': R('in', 'LAX', '', '', { booked: true, booked_at: '2026-10-16T00:00:00.000Z', note: '🛬14:35 🛫15:47 🐈ad' }), 'anjo-t3': R('in', 'LGA', '', '', { booked: true, booked_at: '2026-10-20T00:00:00.000Z' }) },
      decision: { stage: 'chosen', chosen: { airport: 'ORD', city: 'Chicago', departure: '2026-11-20', return: '2026-11-30' }, chosen_at: '2026-10-16T00:00:00.000Z', estimate_total: null, actual_total: null, booked_at: null, delta_pct: null },
      log: [] };
    const pm = (doc, me, today, over) => M.tripModel(doc, Object.assign({ today: today || T, now: NOW, me: me || null }, over || {}));
    const anjo = (doc) => mem(pm(doc), 'anjo-t3');
    const brief = (r) => r.runs.map((x) => [x.key, x.uid, x.aps.join('+'), x.leave && x.leave.day + ' ' + x.leave.t, x.back && x.back.day + ' ' + x.back.t, x.exact && x.exact.leave.t + '/' + x.exact.back.t, x.stops.map((s) => s.ap + '@' + (s.at && s.at.t)).join(' ')]);
    const hasKey = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
    // = 2cf6ec9 (unchanged by #158): #157 / #158's note functions, verbatim, as a phone that has not updated yet runs them
    const OLD159 = (function (IDEA_HUBS, NEARBY_GROUPS, MEMBER_CODE_RE, TEXT_MAX, DISH_PALETTE, clip, normIata, isIata, isIso) {
      var IDEA_STATUSES = { in: 1, maybe: 1, out: 1 };
      var HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
      function uniq(a) { var o = []; a.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; }
      function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
      function hubPair(dest) { for (var i = 0; i < IDEA_HUBS.length; i++) if (IDEA_HUBS[i].indexOf(dest) >= 0) return IDEA_HUBS[i].slice(); return dest ? [dest] : []; }
      function metroOf(dest) { for (var i = 0; i < NEARBY_GROUPS.length; i++) if (NEARBY_GROUPS[i].indexOf(dest) >= 0) return NEARBY_GROUPS[i].slice(); return []; }
      function localSet(dest) { return dest ? uniq(hubPair(dest).concat(metroOf(dest))) : []; }
      var CLAIM_RE = /^([A-Za-z0-9_-]{1,32})\.([ad])([A-Z]{3})(\d\d)(\d\d)$/;
      function mdKey(day) { return isIso(day) ? day.slice(5, 7) + day.slice(8, 10) : /^\d{4}$/.test(String(day || '')) && isIso('2000-' + day.slice(0, 2) + '-' + day.slice(2)) ? String(day) : ''; }
      function claimOf(s) { var m = CLAIM_RE.exec(String(s || '')); return m && isIso('2000-' + m[4] + '-' + m[5]) ? { code: m[1], kind: m[2], ap: m[3], day: m[4] + m[5] } : null; }
      function claimTok(c) { var d = c ? mdKey(c.day) : ''; return c && MEMBER_CODE_RE.test(String(c.code)) && (c.kind === 'a' || c.kind === 'd') && isIata(c.ap) && d ? c.code + '.' + c.kind + c.ap + d : ''; }
      function legsOf(v) { return v === 'a' || v === 'd' || v === 'ad' ? v : v === 'da' ? 'ad' : ''; }
      function dishesOf(v) { var out = []; (Array.isArray(v) ? v : []).forEach(function (g) { if (DISH_PALETTE.indexOf(g) >= 0 && out.indexOf(g) < 0 && out.length < 3) out.push(g); }); return out; }
      function noteMark(s) {
        var sp = s.indexOf(' '), tok = sp < 0 ? s : s.slice(0, sp), n = sp < 0 ? s.length : sp + 1, cps = Array.from(tok), g = cps[0] || '', rest = cps.slice(1).join('');
        if (!tok) return null;
        if (tok === '📞') return { k: 'called', v: true, n: n };
        if ((g === '🛬' || g === '🛫') && HHMM_RE.test(rest)) return { k: g === '🛬' ? 'arr' : 'dep', v: rest, n: n };
        if (g === '🚗' && rest) { var cl = rest.split(',').map(claimOf); return cl.every(Boolean) ? { k: 'claims', v: cl, n: n } : null; }
        var lk = { '🚌': 'bus', '🚙': 'rent', '🐈': 'pet' }[g];
        if (lk && (rest === 'a' || rest === 'd' || rest === 'ad')) return { k: lk, v: rest, n: n };
        if (g === '🧺') { var ds = cps.slice(1); return ds.length >= 1 && ds.length <= 3 && dishesOf(ds).length === ds.length ? { k: 'dish', v: ds, n: n } : null; }
        return null;
      }
      var LEGACY_PROXY_RE = /\s*\(entered by [^()]*\)\s*$/;
      function parseRespNote(note) {
        var s = typeof note === 'string' ? note : '', o = { called: false, arr: '', dep: '', claims: [], bus: '', rent: '', pet: '', dish: [] }, seen = {}, m;
        for (;;) {
          m = noteMark(s);
          // (📞 / 🛬 / 🛫 read as they always have, a repeat too; each later kind once)
          if (!m || (seen[m.k] && m.k !== 'called' && m.k !== 'arr' && m.k !== 'dep')) break;
          seen[m.k] = 1; o[m.k] = m.v; s = s.slice(m.n);
        }
        if (LEGACY_PROXY_RE.test(s)) { o.called = true; s = s.replace(LEGACY_PROXY_RE, ''); }
        o.text = s.trim();
        return o;
      }
      function buildRespNote(called, arr, dep, text, mk) {
        var parts = [], k = mk || {}, cl = uniq((Array.isArray(k.claims) ? k.claims : []).map(claimTok).filter(Boolean)), ds = dishesOf(k.dish);
        if (called) parts.push('📞');
        if (arr && HHMM_RE.test(arr)) parts.push('🛬' + arr);
        if (dep && HHMM_RE.test(dep)) parts.push('🛫' + dep);
        if (cl.length) parts.push('🚗' + cl.join(','));
        [['🚌', k.bus], ['🚙', k.rent], ['🐈', k.pet]].forEach(function (p) { var v = legsOf(p[1]); if (v) parts.push(p[0] + v); });
        if (ds.length) parts.push('🧺' + ds.join(''));
        if (parts.join(' ').length > TEXT_MAX.note) return null;
        if (text && String(text).trim()) parts.push(String(text).trim());
        return clip(parts.join(' '), TEXT_MAX.note);
      }
      function noteMarks(n) { return { claims: n.claims, bus: n.bus, rent: n.rent, pet: n.pet, dish: n.dish }; }
      function docDest(doc) {
        var I = (doc && doc.idea) || {}, rec = I.recommendation;
        return normIata((rec && rec.airport) || (I.destination && I.destination.airport) || ''); // = worker.js ideaMutate dest
      }
      function memberOf(doc, code) { return ((doc && doc.idea && doc.idea.members) || []).filter(function (m) { return m && m.code === code; })[0] || null; }
      function docClosed(doc) { var st = doc && doc.decision && doc.decision.stage; return st === 'booked' || st === 'dropped'; }
      function validResp(r) { return r && typeof r === 'object' && hasOwn(IDEA_STATUSES, r.status) ? r : null; }
      function reqPath(route, id) { return route + '?id=' + encodeURIComponent(id); }
      function typedNote(s) {
        var t = String(s == null ? '' : s).trim(), m;
        for (;;) { t = t.replace(LEGACY_PROXY_RE, '').trim(); if ((m = noteMark(t))) { t = t.slice(m.n).trim(); continue; } break; }
        return t;
      }
      var MARK_KEYS = ['claims', 'bus', 'rent', 'pet', 'dish'];
      function respondRequest(doc, code, patch, opts) {
        opts = opts || {}; patch = patch || {};
        var mem = memberOf(doc, code); if (!mem || !doc.id || docClosed(doc)) return null;
        var prev = validResp(doc.responses && doc.responses[code]);
        var has = function (k) { return hasOwn(patch, k); };
        var marks = MARK_KEYS.some(has), by = opts.by, status;
        if (!prev && !has('status')) {
          var dest = docDest(doc), ap = normIata(mem.airport);
          if (!marks || !dest || !ap || localSet(dest).indexOf(ap) < 0) return null;
          status = 'in'; if (by !== 'self') by = 'proxy';
        } else status = has('status') ? patch.status : prev.status;
        if (!hasOwn(IDEA_STATUSES, status)) return null;
        // a marker patched with something that is not one builds nothing (never silently dropped)
        if (['bus', 'rent', 'pet'].some(function (k) { return has(k) && patch[k] !== '' && !legsOf(patch[k]); })) return null;
        if (has('claims') && (!Array.isArray(patch.claims) || patch.claims.some(function (c) { return !claimTok(c); }))) return null;
        if (has('dish') && (!Array.isArray(patch.dish) || patch.dish.length > 3 || dishesOf(patch.dish).length !== patch.dish.length)) return null;
        var home = normIata(mem.airport);
        var origin = has('origin') ? normIata(patch.origin) : (prev && isIata(prev.origin) && prev.origin !== home ? prev.origin : '');
        if (origin === home) origin = '';
        var from = has('available_from') ? patch.available_from || '' : (prev && isIso(prev.available_from) ? prev.available_from : '');
        var to = has('available_to') ? patch.available_to || '' : (prev && isIso(prev.available_to) ? prev.available_to : '');
        if ((from && !isIso(from)) || (to && !isIso(to)) || (from && to && to < from)) return null;
        var n = parseRespNote(prev && prev.note);
        var arr = has('arrTime') ? patch.arrTime || '' : n.arr, dep = has('depTime') ? patch.depTime || '' : n.dep;
        if ((arr && !HHMM_RE.test(arr)) || (dep && !HHMM_RE.test(dep))) return null;
        var called = by === 'self' ? false : by === 'proxy' ? true : n.called;
        var mk = {}; MARK_KEYS.forEach(function (k) { mk[k] = has(k) ? patch[k] : n[k]; });
        var text = has('note') ? typedNote(patch.note) : n.text, note = buildRespNote(called, arr, dep, text, mk);
        if (note === null) return null;
        // PIA-139: booked times never cut a note short: times that would leave the text it has no room build nothing (PIA-157: nor markers)
        if ((has('arrTime') || has('depTime') || marks) && parseRespNote(note).text !== String(text || '').trim()) return null;
        var body = { member: code, status: status, origin: origin, available_from: from, available_to: to, note: note };
        var hub = hubPair(docDest(doc));
        var bad = ['arrive_at', 'leave_from'].some(function (k) {
          if (!has(k)) return false;
          var v = normIata(patch[k]);
          if (patch[k] && !v) return true;
          if (v && hub.indexOf(v) < 0) return true;
          if (v !== ((prev && prev[k]) || '')) body[k] = v;
          return false;
        });
        return bad ? null : { method: 'POST', path: reqPath('/idea/respond', doc.id), body: body };
      }
      function timesRequest(doc, code, arr, dep, by) {
        var r = validResp(doc && doc.responses && doc.responses[code]);
        if (!r || !r.booked || (r.status !== 'in' && r.status !== 'maybe')) return null;
        var n = parseRespNote(r.note), patch = {};
        if (arr !== undefined && arr !== n.arr) patch.arrTime = arr;
        if (dep !== undefined && dep !== n.dep) patch.depTime = dep;
        if (!hasOwn(patch, 'arrTime') && !hasOwn(patch, 'depTime')) return null;
        return respondRequest(doc, code, patch, { by: by === 'self' ? 'self' : 'keep' });
      }
      return { noteMark: noteMark, parseRespNote: parseRespNote, buildRespNote: buildRespNote, noteMarks: noteMarks, typedNote: typedNote, respondRequest: respondRequest, timesRequest: timesRequest };
    })(M.IDEA_HUBS, M.NEARBY_GROUPS, M.MEMBER_CODE_RE, M.TEXT_MAX, M.DISH_PALETTE, M.clip, M.normIata, M.isIata, M.isIso);

    // ---- the grammar: 🛬IATA / 🛫IATA after 🧺, read in any order, once; typed text never forges one; never clipped ----
    const full = '📞 🛬22:30 🛫17:10 🚗ashwin-t2.aORD1120 🚌a 🚙d 🐈ad 🧺🥧 🛬MDW 🛫MDW see you', pf = M.parseRespNote(full);
    const big = Array.from({ length: 12 }, (_, i) => ({ code: ('m' + i + 'x'.repeat(31)).slice(0, 32), kind: 'a', ap: 'MDW', day: '1120' }));
    // (every marker and six claims with long codes: 275 units without the airports, 287 with them)
    const mkBig = { claims: big.slice(0, 5).concat([{ code: 'z'.repeat(13), kind: 'a', ap: 'MDW', day: '1120' }]), bus: 'a', rent: 'd', pet: 'ad', dish: ['🥧', '🍰', '🍪'] }, noAp = M.buildRespNote(true, '22:30', '17:10', '', mkBig);
    const nFit = noAp ? noAp.length : 0, nAp = nFit + ' 🛬MDW 🛫MDW'.length;
    check(pf.arrAp === 'MDW' && pf.depAp === 'MDW' && pf.arr === '22:30' && pf.text === 'see you' && M.buildRespNote(pf.called, pf.arr, pf.dep, pf.text, M.noteMarks(pf)) === full &&
      eq((({ arrAp, depAp, arr, text }) => [arrAp, depAp, arr, text])(M.parseRespNote('🛬MDW 🛬22:30 🛫MDW hi')), ['MDW', 'MDW', '22:30', 'hi']) &&
      eq((({ arrAp, text }) => [arrAp, text])(M.parseRespNote('🛬MDW 🛬ORD hi')), ['MDW', '🛬ORD hi']) && M.parseRespNote('🛬MDWX hi').arrAp === '' && M.parseRespNote('🛬mdw hi').text === '🛬mdw hi' &&
      M.typedNote('🛬MDW 🛫JFK hello') === 'hello' && M.typedNote('landing 🛬MDW') === 'landing 🛬MDW' &&
      M.noteRoom(false, '22:30', '17:10', { arrAp: 'MDW', depAp: 'MDW' }) === 280 - '🛬22:30 🛫17:10 🛬MDW 🛫MDW'.length - 1 && '🛬22:30 🛫17:10 🛬MDW 🛫MDW'.length === 27 &&
      nFit === 275 && nAp === 287 && M.buildRespNote(true, '22:30', '17:10', '', Object.assign({}, mkBig, { arrAp: 'MDW', depAp: 'MDW' })) === null,
      'grammar: 🛬IATA / 🛫IATA go after 🧺 and round-trip byte for byte with every other marker; read in any order, each once (a 2nd 🛬IATA begins the text; a 4-letter or lower-case code is text); typedNote strips a leading one; noteRoom counts them (Anjo\'s 27 units); markers alone past 280 build nothing, never clipped (the airports make a full note refuse sooner)', { nFit, nAp });

    // ---- the airports a booked leg can be at; the nearest hub; drives either way ----
    check(eq(M.legChoices('ORD'), ['ORD', 'MDW', 'PIA']) && eq(M.legChoices('PIA'), ['PIA', 'ORD', 'MDW']) && eq(M.legChoices('LGA'), ['LGA', 'JFK', 'EWR']) && eq(M.legChoices('BOS'), ['BOS']) &&
      eq(M.legChoices({ dest: 'ORD' }), M.legChoices('ORD')) && eq(M.legOutsideHub('ORD'), ['MDW']) && eq(M.legOutsideHub('LGA'), ['EWR']) && eq(M.legOutsideHub('BOS'), []) &&
      M.hubNear('ORD', 'MDW') === 'ORD' && M.hubNear('PIA', 'MDW') === 'ORD' && M.hubNear('LGA', 'EWR') === 'LGA' && M.hubNear('JFK', 'EWR') === 'JFK' && M.hubNear('ORD', 'PIA') === 'PIA' &&
      M.driveMin('MDW', 'PIA') === 165 && M.driveMin('PIA', 'MDW') === 165 && M.driveMin('MDW', 'ORD') === 45 && M.driveMin('ORD', 'ORD') === 0 && M.driveMin('MDW', 'LGA') === null &&
      M.homeDrive('PIA', 'PIA') === 20 && M.homeDrive('PIA', 'ORD') === 150 && M.homeDrive('PIA', 'MDW') === 165 && M.DRIVE['PIA|MDW'] === '2:45' && M.DRIVE['ORD|MDW'] === '0:45' && M.NEAR_MIN === 60,
      'legChoices: ORD [ORD, MDW, PIA], PIA [PIA, ORD, MDW], LGA [LGA, JFK, EWR], BOS [BOS]; legOutsideHub; hubNear: MDW → ORD on ORD and PIA trips, EWR → the destination (no drive known); the owner-confirmed drives PIA|MDW 2:45 and ORD|MDW 0:45, either way');

    // ---- the honor rule: legAp, through the real Worker's records ----
    const id0 = srv.seed(PTD), d0 = await srv.get(id0, KEY);
    const withAnjo = (note, extra) => tweak(d0, (d) => { Object.assign(d.responses['anjo-t3'], { note: note }, extra || {}); });
    const honored = anjo(withAnjo('🛬22:30 🛫17:10 🛬MDW 🛫MDW')), unbooked = anjo(withAnjo('🛬22:30 🛫17:10 🛬MDW 🛫MDW', { booked: false })), noTime = anjo(withAnjo('🛫17:10 🛬MDW 🛫MDW'));
    const hubMk = anjo(withAnjo('🛬22:30 🛫17:10 🛬ORD 🛫PIA')), badField = anjo(withAnjo('🛬22:30 🛫17:10 🛬MDW 🛫MDW', { arrive_at: 'PIA' }));
    check(honored.arrAp === 'MDW' && honored.depAp === 'MDW' && honored.A === 'ORD' && honored.H === 'ORD' && M.legAp(honored, 'a') === 'MDW' && M.legAp(honored, 1) === 'MDW' && honored.marks.arrAp === 'MDW' && honored.noteText === '' &&
      unbooked.arrAp === 'ORD' && unbooked.marks.arrAp === 'MDW' && noTime.arrAp === 'ORD' && noTime.depAp === 'MDW' && hubMk.arrAp === 'ORD' && hubMk.depAp === 'ORD' && badField.arrAp === 'PIA' && badField.depAp === 'MDW' &&
      eq(M.flightEnds(pm(withAnjo('🛬22:30 🛫17:10 🛬MDW 🛫MDW')), 'anjo-t3').map((e) => [e.ap, e.hub, e.choices.join()]), [['MDW', 'ORD', 'ORD,MDW,PIA'], ['MDW', 'ORD', 'ORD,MDW,PIA']]) &&
      eq(M.flightEnds(pm(withAnjo('', { booked: false })), 'anjo-t3').map((e) => e.choices.length), [0, 0]),
      'the honor rule: Anjo booked with 🛬22:30 🛫17:10 🛬MDW 🛫MDW lands and leaves at Midway (legAp; A / H stay ORD for prices and links; no 📝: the markers are not text); not booked, a leg with no time, a hub airport as a marker, or a hub field that is not hubNear it (arrive_at PIA) → A / H; flightEnds names the leg\'s real airport and its choices once booked');

    // ---- legPatch / legRequest through the real Worker ----
    const first = M.legRequest(d0, 'anjo-t3', { arr: '22:30', dep: '17:10', arrAp: 'MDW', depAp: 'MDW' }, 'self'), firstRes = await srv.send(first), d1 = await srv.get(id0, KEY);
    const tOnly = M.legRequest(d1, 'anjo-t3', { arr: '22:45' }, 'self'), oldT = OLD159.timesRequest(d1, 'anjo-t3', '22:45', undefined, 'self');
    const plain = tweak(d1, (d) => { d.responses['anjo-t3'].note = '🛬22:30 🛫17:10 red-eye'; });
    const toPia = M.legRequest(d1, 'anjo-t3', { arrAp: 'PIA' }, 'self'), back = M.legRequest(d1, 'anjo-t3', { arrAp: 'ORD', depAp: 'ORD' }, 'keep');
    check(srv.allOk(firstRes) && eq(first.body, { member: 'anjo-t3', status: 'in', origin: '', available_from: '', available_to: '', note: '🛬22:30 🛫17:10 🛬MDW 🛫MDW' }) && d1.responses['anjo-t3'].note === '🛬22:30 🛫17:10 🛬MDW 🛫MDW' &&
      !d1.responses['anjo-t3'].arrive_at && anjo(d1).arrAp === 'MDW' && anjo(d1).depAp === 'MDW' && d1.responses['anjo-t3'].booked === true &&
      tOnly.body.note === '🛬22:45 🛫17:10 🛬MDW 🛫MDW' && eq(tOnly, oldT) && eq(M.timesRequest(plain, 'anjo-t3', '22:45', undefined, 'self'), OLD159.timesRequest(plain, 'anjo-t3', '22:45', undefined, 'self')) &&
      toPia.body.note === '🛬22:30 🛫17:10 🛫MDW' && toPia.body.arrive_at === 'PIA' && back.body.note === '🛬22:30 🛫17:10' && !hasKey(back.body, 'arrive_at') &&
      M.legPatch(d1, 'anjo-t3', { arrAp: 'BOS' }, 'self') === null && M.legPatch(d1, 'anjo-t3', { arrAp: 'MDW' }, 'self') === null && M.legPatch(d0, 'anjo-t3', { arrAp: 'MDW' }, 'self') === null &&
      M.legPatch(tweak(d1, (d) => { d.responses['anjo-t3'].booked = false; }), 'anjo-t3', { arr: '21:00' }, 'self') === null && M.legPatch(d1, 'anjo-t3', { arr: '25:00' }, 'self') === null &&
      M.legPatch(d1, 'anjo-t3', { arr: '22:30', dep: '17:10', arrAp: 'MDW', depAp: 'MDW' }, 'self') === null,
      'legRequest: Anjo\'s first entry is ONE complete answer "🛬22:30 🛫17:10 🛬MDW 🛫MDW" (the Worker keeps it, her 🎫 and her empty hub fields: MDW → ORD = the destination, so nothing is sent for them); time alone = #158\'s timesRequest byte for byte, with or without markers; PIA → arrive_at PIA and her 🛬 marker cleared; ORD clears both; null: an airport not offered, no change, an airport for a leg with no time, not booked, not a time', { first: first && first.body, toPia: toPia && toPia.body });
    // a note at 270 units: the airport has no room (legRequest null, legPatch not), the time alone still goes
    const long = withAnjo('🛬22:30 🛫17:10 ' + 'x'.repeat(254)), lo = { arr: '22:40', arrAp: 'MDW', depAp: 'MDW' }, lp = M.legPatch(long, 'anjo-t3', lo, 'self');
    check(long.responses['anjo-t3'].note.length === 270 && lp && lp.arrAp === 'MDW' && lp.depAp === 'MDW' && M.legRequest(long, 'anjo-t3', lo, 'self') === null &&
      M.timesRequest(long, 'anjo-t3', '22:40', undefined, 'self').body.note === '🛬22:40 🛫17:10 ' + 'x'.repeat(254),
      'a 270-unit note: legRequest with Midway both ways (12 more units) builds nothing (never clipped, the text never cut), legPatch still names them (so the phone tells "Too long: MDW" from the rest), and the time alone goes');
    // on a PIA trip Midway's hub field is ORD (hubNear); unbooking clears the markers and gives that field back; a pick of their own stays
    const PIAD = tweak(PTD, (d) => { d.idea.destination = { city: 'Peoria', airport: 'PIA' }; d.decision.chosen.airport = 'PIA'; d.responses['anjo-t3'].note = '🛬22:30 🛫17:10'; });
    const idP = srv.seed(PIAD), p0 = await srv.get(idP, KEY), pq = M.legRequest(p0, 'anjo-t3', { arrAp: 'MDW' }, 'self'), pqRes = await srv.send(pq), p1 = await srv.get(idP, KEY);
    const ub = M.bookedRequests(p1, 'anjo-t3', false, { by: 'self' }), ubRes = await srv.send(ub), p2 = await srv.get(idP, KEY);
    const own = tweak(d1, (d) => { d.responses['anjo-t3'].note = '🛬MDW 🛫MDW'; d.responses['anjo-t3'].leave_from = 'PIA'; }), ubOwn = M.bookedRequests(own, 'anjo-t3', false, { by: 'self' });
    check(srv.allOk(pqRes) && pq.body.arrive_at === 'ORD' && p1.responses['anjo-t3'].note === '🛬22:30 🛫17:10 🛬MDW' && p1.responses['anjo-t3'].arrive_at === 'ORD' && anjo(p1).arrAp === 'MDW' && anjo(p1).A === 'ORD' &&
      srv.allOk(ubRes) && ub.length === 2 && ub[0].body.note === '' && ub[0].body.arrive_at === '' && p2.responses['anjo-t3'].note === '' && !p2.responses['anjo-t3'].arrive_at && p2.responses['anjo-t3'].booked === false &&
      ubOwn.length === 2 && ubOwn[0].body.note === '' && !hasKey(ubOwn[0].body, 'leave_from'),
      'a PIA trip: Midway is 🛬MDW with arrive_at ORD (the hub airport nearest it); unbooking sends the clear (times and both markers) and puts arrive_at back to the destination; the clear goes when only markers are there, and a hub pick of her own (leave_from PIA, not hubNear MDW on an ORD trip) is left alone');

    // ---- carried markers that fail the honor rule are dropped on the next #159 write; patched ones refuse ----
    const oldUnbook = OLD159.respondRequest(d1, 'anjo-t3', { arrTime: '', depTime: '' }, { by: 'self' }), afterOld = tweak(d1, (d) => { d.responses['anjo-t3'].note = oldUnbook.body.note; });
    const rePia = tweak(afterOld, (d) => { d.responses['anjo-t3'].arrive_at = 'PIA'; d.responses['anjo-t3'].note = '🛬21:00 🛬MDW 🛫MDW'; });
    const toLga = tweak(d1, (d) => { d.idea.destination = { city: 'New York', airport: 'LGA' }; d.decision.chosen.airport = 'LGA'; });
    const bos = withAnjo('🛬22:30 🛫17:10 🛬BOS hi');
    check(oldUnbook.body.note === '🛬MDW 🛫MDW' && anjo(afterOld).arrAp === 'ORD' && anjo(afterOld).noteText === '' && anjo(rePia).arrAp === 'PIA' &&
      M.respondRequest(afterOld, 'anjo-t3', { status: 'maybe' }, { by: 'self' }).body.note === '' && M.respondRequest(rePia, 'anjo-t3', { status: 'in' }, { by: 'self' }).body.note === '🛬21:00 🛫MDW'.replace(' 🛫MDW', '') &&
      anjo(toLga).arrAp === 'LGA' && !hasKey(M.pickups(pm(toLga), {}, NOW, false), 'MDW') && M.respondRequest(toLga, 'anjo-t3', { status: 'in' }, { by: 'self' }).body.note === '🛬22:30 🛫17:10' &&
      anjo(bos).arrAp === 'ORD' && anjo(bos).noteText === 'hi' && M.respondRequest(bos, 'anjo-t3', { note: 'hello' }, { by: 'self' }).body.note === '🛬22:30 🛫17:10 hello' &&
      M.respondRequest(d1, 'anjo-t3', { arrAp: 'ORD' }, { by: 'self' }) === null && M.respondRequest(d1, 'anjo-t3', { arrAp: 'BOS' }, { by: 'self' }) === null &&
      M.respondRequest(d1, 'anjo-t3', { arrTime: '', arrAp: 'MDW' }, { by: 'self' }) === null && M.respondRequest(d1, 'anjo-t3', { arrAp: 'mdw' }, { by: 'self' }) === null &&
      M.respondRequest(tweak(d0, (d) => { delete d.responses['momdad-t1']; }), 'momdad-t1', { arrAp: 'MDW' }, { by: 'keep' }) === null,
      'carried markers: (a) a #158 unbook leaves "🛬MDW 🛫MDW" (not honored: no times; nor after a legair PIA), and the next #159 write drops what fails; (b) ORD → LGA: no Midway, no MDW lane, dropped on the next write; (c) "🛬BOS" typed on an old phone is not honored and the next write drops it; patched: a hub airport, one not offered, one for a leg with no time, a malformed one, an airport for a host still on their default: nothing built');

    // (fix pass) timesRequest keeps #157 / #158's reading of a falsy time: null, 0 or false clears it as '' does
    const clr = withAnjo('🛬22:30 🛫17:10 hi'), clr0 = M.timesRequest(clr, 'anjo-t3', '', undefined, 'self');
    check(clr0 && clr0.body.note === '🛫17:10 hi' && [null, 0, false].every((v) => { const q = M.timesRequest(clr, 'anjo-t3', v, undefined, 'self'); return q && q.body.note === '🛫17:10 hi'; }) && M.timesRequest(clr, 'anjo-t3', undefined, undefined, 'self') === null,
      'timesRequest: a null, 0 or false 🛬 clears it as \'\' does ("🛫17:10 hi"), as before #159; undefined leaves both and builds nothing');
    // ---- old phones: #158 (2cf6ec9) reads a #159 note as text and writes it back byte for byte; #159 reads what it wrote ----
    const n159 = '🛬22:30 🛫17:10 🛬MDW 🛫MDW see you', o159 = withAnjo(n159), op = OLD159.parseRespNote(n159);
    const ow = { times: OLD159.timesRequest(o159, 'anjo-t3', '22:45', undefined, 'self'), dish: OLD159.respondRequest(o159, 'anjo-t3', { dish: ['🍪'] }, { by: 'self' }), bus: OLD159.respondRequest(o159, 'anjo-t3', { bus: 'a', rent: '' }, { by: 'self' }),
      status: OLD159.respondRequest(o159, 'anjo-t3', { status: 'maybe' }, { by: 'self' }) };
    const ash = tweak(d1, (d) => { d.responses['ashwin-t2'].note = '🛬14:35 🛫15:47 🐈ad 🛬MDW'; }), petOff = OLD159.respondRequest(ash, 'ashwin-t2', { pet: '' }, { by: 'self' });
    const sent = await srv.send(ow.dish), d2 = await srv.get(id0, KEY);
    check(op.arr === '22:30' && op.dep === '17:10' && op.text === '🛬MDW 🛫MDW see you' && ow.times.body.note === '🛬22:45 🛫17:10 🛬MDW 🛫MDW see you' && ow.dish.body.note === '🛬22:30 🛫17:10 🧺🍪 🛬MDW 🛫MDW see you' &&
      ow.bus.body.note === '🛬22:30 🛫17:10 🚌a 🛬MDW 🛫MDW see you' && ow.status.body.note === n159 && petOff.body.note === '🛬14:35 🛫15:47 🛬MDW' &&
      Object.keys(ow).every((k) => !hasKey(ow[k].body, 'arrive_at') && !hasKey(ow[k].body, 'leave_from')) && OLD159.typedNote('🛬MDW hi') === '🛬MDW hi' &&
      srv.allOk(sent) && d2.responses['anjo-t3'].note === '🛬22:30 🛫17:10 🧺🍪 🛬MDW 🛫MDW see you' && anjo(d2).arrAp === 'MDW' && eq(anjo(d2).dish, ['🍪']) && anjo(d2).noteText === 'see you' &&
      OLD159.parseRespNote('🛬22:30 🛬MDW 🚗momdad-t1.aMDW1120 hi').claims.length === 0,
      'old phones: #158\'s note functions (= 2cf6ec9, unchanged by #158, verbatim) read "🛬22:30 🛫17:10 🛬MDW 🛫MDW see you" as times and text, and its time, 🧺, 🚌, answer and 🐈-off writes keep "🛬MDW 🛫MDW" byte for byte (no hub field sent; the Worker keeps it); #159 reads the result fully; a marker placed before 🚗 would break an old claim read (the order is load-bearing)', ow.dish.body.note);

    // ---- rides(): one drive to two airports, rounded to 5 minutes; R.apart; keys and uids ----
    const pt = withAnjo('🛬22:30 🛫17:10 🛬MDW 🛫MDW'), R1 = M.rides(pm(pt), T);
    check(eq(brief(R1), [
      ['aORD1120-ashwin-t2', 'a1120-ashwin-t2', 'ORD', '2026-11-20 12:05', '2026-11-20 17:05', '12:05/17:05', 'ORD@14:35'],
      ['aMDW1120-anjo-t3', 'a1120-anjo-t3', 'MDW', '2026-11-20 19:45', '2026-11-21 01:15', '19:45/01:15', 'MDW@22:30'],
      ['dORD1130-ashwin-t2', 'd1130-ashwin-t2', 'ORD+MDW', '2026-11-30 11:15', '2026-11-30 17:15', '11:17/17:17', 'ORD@13:45 MDW@14:30']]) &&
      eq(R1.apart, [{ day: '2026-11-20', kind: 'a', a: 'aORD1120-ashwin-t2', b: 'aMDW1120-anjo-t3', why: 'wait', gap: 475 }]) && R1.runs[2].legs.map((l) => l.code + '@' + l.ap).join() === 'ashwin-t2@ORD,anjo-t3@MDW' &&
      R1.runs[1].drive === 165 && R1.runs[2].drive === 150 && R1.runs[2].exact.back.day === '2026-11-30' && eq(R1.runs[2].candidates, ['momdad-t1']),
      'P town with the real flights: R1 ORD 2:35 PM leave 12:05, home 17:05; R2 Midway 10:30 PM leave 19:45, home 11/21 01:15 (a drive of its own: R.apart wait, 7:55 after Ashwin); R3 one drive, O\'Hare then Midway: exact 11:17 → leave 11:15, at ORD 13:45, MDW 14:30, home 17:15 (exact 17:17); keys keep the first stop, uids hold none', brief(R1));
    const late = M.rides(pm(tweak(pt, (d) => { d.responses['ashwin-t2'].note = '🛬14:35 🛫13:30'; d.responses['anjo-t3'].note = '🛬22:30 🛫13:00 🛬MDW 🛫MDW'; })), T);
    const join = (t1, t2) => M.rides(pm(tweak(pt, (d) => { d.responses['ashwin-t2'].note = '🛬14:35 🛫' + t1; d.responses['anjo-t3'].note = '🛬22:30 🛫' + t2 + ' 🛬MDW 🛫MDW'; })), T).runs.filter((r) => r.kind === 'd');
    const old1530 = join('15:30', '17:10'), atDl = join('15:00', '15:45'), past = join('15:00', '15:44'), j1520 = join('15:50', '17:10'), single = join('15:47', '22:00');
    check(late.runs.filter((r) => r.kind === 'd').length === 2 && late.apart.some((p) => p.why === 'late' && p.kind === 'd' && p.a === 'dMDW1130-anjo-t3' && p.b === 'dORD1130-ashwin-t2') &&
      old1530.length === 1 && old1530[0].leave.t === '11:00' && old1530[0].back.t === '17:00' && atDl.length === 1 && past.length === 2 && j1520[0].exact.leave.t === '11:20' && j1520[0].leave.t === '11:20' &&
      single.length === 2 && single[0].exact.leave.t === '11:17' && single[0].leave.t === '11:15' && single[0].exact.back.t === '16:17' && single[0].back.t === '16:15',
      'joins are on exact minutes: MDW 13:00 then ORD 13:30 drop-offs are two drives (late); the old 15:30 runs 11:00–17:00; a drop-off whose exact reach is its deadline joins, one minute later it does not; exact leaves 11:20 and 11:17 (shown 11:15); a single-airport run\'s exact leave and back are #157\'s (11:17 / 16:17), shown 11:15 / 16:15');
    // the home airport never joins; 🚌 to Midway, never to Peoria; an early Midway landing leaves the day before; no drive known: nodrive
    const home = M.rides(pm(tweak(pt, (d) => { d.responses['anjo-t3'].note = '🛬14:50 🛫17:10'; d.responses['anjo-t3'].arrive_at = 'PIA'; })), T).runs.filter((r) => r.kind === 'a');
    const early = M.rides(pm(tweak(pt, (d) => { d.responses['anjo-t3'].available_from = '2026-11-21'; d.responses['anjo-t3'].note = '🛬01:30 🛫17:10 🛬MDW 🛫MDW'; })), T).runs.filter((r) => r.kind === 'a' && r.ap === 'MDW')[0];
    M.DRIVE['ORD|GYY'] = '0:50';
    const nod = M.rides(pm(tweak(pt, (d) => { d.responses['ashwin-t2'].note = '🛬22:00 🛫15:47 🛬GYY'; })), T);
    delete M.DRIVE['ORD|GYY'];
    check(home.length === 2 && home.every((r) => r.aps.length === 1) && !M.rides(pm(tweak(pt, (d) => { d.responses['anjo-t3'].note = '🛬14:50 🛫17:10'; d.responses['anjo-t3'].arrive_at = 'PIA'; })), T).apart.length &&
      !!M.groundPatch(pt, 'anjo-t3', 'a', 'bus', 'self', T) && M.groundPatch(tweak(pt, (d) => { d.responses['anjo-t3'].note = '🛬14:50 🛫17:10'; d.responses['anjo-t3'].arrive_at = 'PIA'; }), 'anjo-t3', 'a', 'bus', 'self', T) === null &&
      early.leave.day === '2026-11-20' && early.leave.t === '22:45' && early.back.day === '2026-11-21' && early.back.t === '04:15' &&
      nod.apart.some((p) => p.why === 'nodrive') && nod.runs.filter((r) => r.kind === 'a').every((r) => r.aps.length === 1) && !hasKey(M.DRIVE, 'ORD|GYY'),
      'the home airport (Peoria) never joins; 🚌 is offered at Midway and not at Peoria (the leg\'s own airport); a Midway landing at 1:30 AM leaves home the day before (Fri 22:45, home 4:15 AM); two airports with no drive known between them stay apart (nodrive)', { early: early && [early.leave, early.back] });
    // (fix pass) the pickup join on exact minutes and the shown rounding: landings that are not multiples of 5, a car that reaches a
    // stop after its landing, the RUN_GAP boundary either way, and a group the car would reach too late (the |gap| rule, not gap)
    const pk = (ashA, anjoA, extra) => M.rides(pm(tweak(pt, (d) => { d.responses['ashwin-t2'].note = '🛬' + ashA + ' 🛫15:47'; d.responses['anjo-t3'].note = '🛬' + anjoA + ' 🛫17:10 🛬MDW 🛫MDW'; if (extra) extra(d); })), T);
    const pkA = (R) => brief(R).filter((x) => x[0][0] === 'a');
    const sam = (d) => { d.idea.members.push({ code: 'sam-t4', label: '🎸 Sam', airport: 'LAX', headcount: 1 }); d.responses['sam-t4'] = R('in', 'LAX', '', '', { booked: true, booked_at: '2026-10-20T00:00:00.000Z', note: '🛬16:00 🛫19:00' }); };
    const j1 = pk('14:00', '15:00'), j2 = pk('14:32', '14:40'), j3 = pk('14:30', '14:00'), j4 = pk('14:32', '22:30'), b120 = pk('14:00', '16:45'), b121 = pk('14:00', '16:46'), lateA = pk('14:00', '14:30', sam);
    check(eq(pkA(j1), [['aORD1120-ashwin-t2', 'a1120-ashwin-t2', 'ORD+MDW', '2026-11-20 11:30', '2026-11-20 17:45', '11:30/17:45', 'ORD@14:00 MDW@15:00']]) &&
      eq(pkA(j2), [['aORD1120-ashwin-t2', 'a1120-ashwin-t2', 'ORD+MDW', '2026-11-20 12:00', '2026-11-20 18:05', '12:02/18:02', 'ORD@14:32 MDW@15:17']]) &&
      eq(pkA(j3), [['aMDW1120-ashwin-t2', 'a1120-ashwin-t2', 'MDW+ORD', '2026-11-20 11:15', '2026-11-20 17:15', '11:15/17:15', 'MDW@14:00 ORD@14:45']]) &&
      eq(pkA(j4)[0], ['aORD1120-ashwin-t2', 'a1120-ashwin-t2', 'ORD', '2026-11-20 12:00', '2026-11-20 17:05', '12:02/17:02', 'ORD@14:32']) &&
      pkA(b120).length === 1 && pkA(b120)[0][2] === 'ORD+MDW' && pkA(b121).length === 2 && b121.apart.some((p) => p.why === 'wait' && p.gap === 166) &&
      pkA(lateA).length === 2 && pkA(lateA).every((x) => x[2].indexOf('+') < 0) && eq(lateA.apart, [{ day: '2026-11-20', kind: 'a', a: 'aORD1120-ashwin-t2', b: 'aMDW1120-anjo-t3', why: 'late', gap: -90 }]),
      'pickups join on exact minutes: ORD 2:00 PM + MDW 3:00 PM is one drive (leave 11:30, ORD 14:00, MDW 15:00, home 17:45); ORD 2:32 + MDW 2:40 PM: leave 12:00 (exact 12:02), the car at Midway 15:17 (after her landing: it waits for the car), home 18:05 (exact 18:02, rounded up); MDW 2:00 + ORD 2:30 PM: the car reaches O\'Hare 14:45, after his landing; a lone ORD 2:32 PM: home 17:05 (exact 17:02); a landing RUN_GAP after the car\'s arrival joins, one minute more does not (wait); a landing the car reaches 2:15 late (Sam at ORD 4:00 PM, Anjo MDW 2:30 PM) is its own drive (late)', { j1: pkA(j1), j2: pkA(j2), j3: pkA(j3), j4: pkA(j4), b121: b121.apart, lateA: lateA.apart });
    // a run visits each airport once (drop-offs ORD 12:00, MDW 1:30 PM, ORD 2:30 PM: two drives, never ORD → MDW → ORD); a driver
    // holding two moved tokens for one leg keeps only the first on their next write
    const once = M.rides(pm(tweak(pt, (d) => { sam(d); d.responses['ashwin-t2'].note = '🛬14:35 🛫12:00'; d.responses['anjo-t3'].note = '🛬22:30 🛫13:30 🛬MDW 🛫MDW'; d.responses['sam-t4'].note = '🛬16:00 🛫14:30'; })), T).runs.filter((r) => r.kind === 'd');
    const two = M.ridesRequest(tweak(pt, (d) => { d.responses['momdad-t1'] = R('in', 'PIA', '', '', { note: '🚗anjo-t3.aORD1120,anjo-t3.aORD1121' }); }), 'momdad-t1', 'dORD1130-ashwin-t2', 'on', 'self', T);
    check(eq(once.map((r) => r.aps.join('+')), ['ORD+MDW', 'ORD']) && two && two.body.note === '🚗anjo-t3.aORD1120,ashwin-t2.dORD1130,anjo-t3.dMDW1130',
      'a run visits each airport once: ORD 12:00, MDW 1:30 PM and ORD 2:30 PM drop-offs are ORD → MDW and then O\'Hare again on a drive of its own; Mom & Dad holding anjo-t3.aORD1120 and anjo-t3.aORD1121 (both moved: she lands at Midway) keep only the first on their next write', { once: once.map((r) => r.aps), two: two && two.body.note });
    // #157 parity: every claim fixture's keys and times hold; counts() tightened
    const mom = (note) => tweak(pt, (d) => { d.responses['momdad-t1'] = R('in', 'PIA', '', '', { note: note }); });
    const on3 = M.ridesRequest(pt, 'momdad-t1', 'dORD1130-ashwin-t2', 'on', 'self', T), moved = mom('🚗anjo-t3.aORD1120'), mv = M.rides(pm(moved), T).runs[1];
    const ok = M.ridesRequest(moved, 'momdad-t1', 'aMDW1120-anjo-t3', 'ok', 'self', T), both = mom('🚗anjo-t3.aORD1120,anjo-t3.aMDW1120'), bw = M.ridesRequest(both, 'momdad-t1', 'aORD1120-ashwin-t2', 'on', 'self', T);
    check(on3.body.note === '🚗ashwin-t2.dORD1130,anjo-t3.dMDW1130' && mv.legs[0].ride.state === 'moved' && eq(mv.legs[0].ride.was, ['momdad-t1']) && ok.body.note === '🚗anjo-t3.aMDW1120' &&
      bw.body.note === '🚗anjo-t3.aMDW1120,ashwin-t2.aORD1120' && M.rides(pm(both), T).runs[1].legs[0].ride.state === 'covered',
      'claims name the leg\'s real airport: Mom & Dad\'s Drive on R3 writes ashwin-t2.dORD1130 and anjo-t3.dMDW1130; a #158 anjo-t3.aORD1120 reads ⚠ moved, ✓ makes it aMDW1120; holding both, the next write keeps only aMDW1120 (the tightened counts)', { on3: on3.body.note, bw: bw.body.note });

    // ---- nextDrive / runLive / primaryAction on the phone's clock ----
    const all = mom('🚗ashwin-t2.aORD1120,anjo-t3.aMDW1120,ashwin-t2.dORD1130,anjo-t3.dMDW1130'), RA = M.rides(pm(all, 'momdad-t1'), T);
    const nx = (day, hh) => { const r = M.nextDrive(RA, 'momdad-t1', day, hh); return r ? r.key : null; };
    const paAt = (day, hh) => M.primaryAction(pm(all, 'momdad-t1', day), day, hh);
    check(nx('2026-11-20', '16:59') === 'aORD1120-ashwin-t2' && nx('2026-11-20', '17:06') === 'aMDW1120-anjo-t3' && nx('2026-11-21', '00:30') === 'aMDW1120-anjo-t3' && nx('2026-11-21', '01:16') === 'dORD1130-ashwin-t2' &&
      nx('2026-11-30', '17:16') === null && paAt('2026-11-21', '00:30') === 'drive' && paAt('2026-11-30', '17:16') !== 'drive' && paAt('2026-11-30', '17:14') === 'drive' &&
      M.runLive(RA.runs[1], '2026-11-21', '01:14') === true && M.runLive(RA.runs[1], '2026-11-21', '01:15') === false && M.runLive(RA.runs[1], '2026-11-21') === false && RA.runs[1].upcoming === true &&
      // (fix pass: with hhmm omitted, pinned to the answers 2cf6ec9's own primaryAction gives on this record, every phone and day)
      eq(['momdad-t1', 'ashwin-t2', 'anjo-t3'].map((c) => [T, '2026-11-20', '2026-11-30', '2026-12-01'].map((d) => M.primaryAction(pm(all, c, d), d)).join()),
        ['drive,drive,drive,none', 'none,track,track,none', 'none,track,track,none']),
      'nextDrive on the phone\'s clock: 11/20 16:59 → R1, 17:06 → R2; 11/21 00:30 → R2 (home 1:15 AM), 01:16 → R3; 11/30 17:16 → none (the primary is no longer 🚗); runLive is false from the back time, and with no hh:mm it is run.upcoming (PIA-157\'s rule): primaryAction with hhmm omitted answers as #158 did on 10/31, 11/20, 11/30 and 12/1 on all three phones (Mom & Dad drive, drive, drive, none; Ashwin and Anjo none, track, track, none)');

    // ---- the ride in words and in the calendar ----
    const words = M.rideText(pm(pt), R1.runs, 'ask'), plainW = M.rideText(pm(tweak(pt, (d) => { d.responses['ashwin-t2'].note = '🛬14:35 🛫15:47'; })), M.rides(pm(tweak(pt, (d) => { d.responses['ashwin-t2'].note = '🛬14:35 🛫15:47'; })), T).runs.slice(2), 'remind');
    const ev = M.rideEvents(pm(all, 'momdad-t1'), 'momdad-t1', { today: T, now: NOW, worker: WK }), evT = ev.ics.text.replace(/\r\n /g, '');
    const evOrd = M.rideEvents(pm(tweak(all, (d) => { d.responses['anjo-t3'].note = '🛬22:30 🛫17:10'; d.responses['momdad-t1'].note = '🚗ashwin-t2.aORD1120,anjo-t3.aORD1120,ashwin-t2.dORD1130,anjo-t3.dORD1130'; }), 'momdad-t1'), 'momdad-t1', { today: T, now: NOW, worker: WK });
    const uids = (e) => e.ics.text.replace(/\r\n /g, '').split('\r\n').filter((l) => /^UID:/.test(l)), link = M.guestLink(id0, '', WK);
    const descs = evT.split('\r\n').filter((l) => /^DESCRIPTION:/.test(l) && !/^DESCRIPTION:🚗/.test(l));
    check(words === '🚗 Can you drive? Fri 11/20: pick up Ashwin + Nebby 🐈 at O\'Hare (ORD), lands 2:35 PM (leave home 12:05 PM, home about 5:05 PM). Fri 11/20: pick up Anjo at Midway (MDW), lands 10:30 PM (leave home 7:45 PM, home about Sat 1:15 AM). Mon 11/30: drop off Ashwin + Nebby 🐈 at O\'Hare (ORD), flight 3:47 PM, then Anjo at Midway (MDW), flight 5:10 PM (leave home 11:15 AM, home about 5:15 PM).' &&
      plainW === '🚗 Reminder: Mon 11/30: drop off Ashwin at O\'Hare (ORD), flight 3:47 PM, then Anjo at Midway (MDW), flight 5:10 PM (leave home 11:15 AM, home about 5:15 PM).' &&
      M.rideLine(pm(pt), M.rides(pm(tweak(pt, (d) => { d.responses['anjo-t3'].available_from = '2026-11-21'; d.responses['anjo-t3'].note = '🛬01:30 🛫17:10 🛬MDW 🛫MDW'; })), T).runs.filter((r) => r.ap === 'MDW' && r.kind === 'a')[0]) === 'Sat 11/21: pick up Anjo at Midway (MDW), lands 1:30 AM (leave home Fri 10:45 PM, home about 4:15 AM).' &&
      /\r\nDTSTART:20261120T194500\r\nDTEND:20261121T011500\r\nSUMMARY:🚗 Pick up Anjo – Midway \(MDW\)\\, lands 10:30 PM\r\nLOCATION:Chicago Midway International Airport \(MDW\)\r\n/.test(evT) &&
      /\r\nDTSTART:20261130T111500\r\nDTEND:20261130T171500\r\nSUMMARY:🚗 Drop off Ashwin \+ Nebby 🐈 \(ORD 3:47 PM\)\\, then Anjo \(MDW 5:10 PM\)\r\nLOCATION:O'Hare International Airport \(ORD\)\r\n/.test(evT) &&
      (evT.match(/TRIGGER:-P1D/g) || []).length === 3 && (evT.match(/TRIGGER:-PT30M/g) || []).length === 3 &&
      descs.length === 3 && descs.every((l) => { const u = l.match(/https?:\/\/[^\s\\]+/g) || []; return u.length === 1 && u[0] === link && !/#k=|t=|\$/.test(l) && l.indexOf(KEY) < 0; }) &&
      eq(uids(ev), uids(evOrd)) && uids(ev).indexOf('UID:' + id0 + '-momdad-t1-a1120-anjo-t3@pialax') >= 0 &&
      ev.sig === 'aORD1120-ashwin-t2|2026-11-20|2026-11-20|12:05|ashwin-t2@14:35+🐈;aMDW1120-anjo-t3|2026-11-20|2026-11-20|19:45|anjo-t3@22:30;dORD1130-ashwin-t2|2026-11-30|2026-11-30|11:15|ashwin-t2@15:47+🐈|anjo-t3@17:10@MDW' &&
      evOrd.sig.split(';')[0] === ev.sig.split(';')[0],
      'the words, per stop ("Ashwin + Nebby 🐈" on his own stop), with "home about", the day first on another day ("Sat 1:15 AM", "Fri 10:45 PM"); the calendar: R2 Fri 7:45 PM to Sat 1:15 AM at Chicago Midway International Airport (MDW), R3 one event for both stops, two alarms each, the words then exactly the guest link (no key, token or price); the UIDs hold no airport, so Anjo\'s ORD → MDW replaces her event; the signature keeps #158\'s "+🐈" and adds "@MDW" off the first stop', { words, sig: ev.sig });

    // ---- the clock helpers; DST is floating wall-clock arithmetic (documented, not fixed) ----
    const dst = tweak(pt, (d) => { d.idea.dates = { departure: '2027-03-14', return: '2027-03-20', searchStart: '', searchEnd: '' }; d.decision.chosen.departure = '2027-03-14'; d.decision.chosen.return = '2027-03-20'; d.responses['ashwin-t2'].note = ''; d.responses['ashwin-t2'].booked = false; d.responses['anjo-t3'].note = '🛬03:30 🛬MDW'; });
    const dr = M.rides(pm(dst, null, '2027-03-01'), '2027-03-01').runs[0];
    check(M.clock({ day: '2026-11-21', t: '01:15' }, '2026-11-20') === 'Sat 1:15 AM' && M.clock({ day: '2026-11-20', t: '19:45' }, '2026-11-20') === '7:45 PM' &&
      M.clockRange({ day: '2026-11-20', t: '12:05' }, { day: '2026-11-20', t: '17:05' }, '2026-11-20') === '12:05–5:05 PM' && M.clockRange({ day: '2026-11-30', t: '11:15' }, { day: '2026-11-30', t: '17:15' }, '2026-11-30') === '11:15 AM–5:15 PM' &&
      M.clockRange({ day: '2026-11-20', t: '19:45' }, { day: '2026-11-21', t: '01:15' }, '2026-11-20') === '7:45 PM–Sat 1:15 AM' &&
      eq(['10:30 PM', '1030p', '2:35 PM', '12:05 AM', '0030', '2230', '347', '700', '3:47'].map((s) => M.typedTime(s)), ['22:30', '22:30', '14:35', '00:05', '00:30', '22:30', null, null, null]) &&
      eq(M.timeHalves('347'), { am: '03:47', pm: '15:47' }) && M.rideWhere('MDW') === 'Midway (MDW)' && M.rideWhere('JFK') === 'JFK' && M.rideWhere('DEN') === 'Denver (DEN)' && M.rideWhere('XQZ') === 'XQZ' &&
      M.rideFull('ORD') === 'O\'Hare International Airport (ORD)' && dr && dr.ap === 'MDW' && dr.leave.t === '00:45' && dr.leave.day === '2027-03-14',
      'clock / clockRange / h12 / typedTime: "Sat 1:15 AM", "12:05–5:05 PM", "11:15 AM–5:15 PM", "7:45 PM–Sat 1:15 AM"; 12-hour and 24-hour input, an ambiguous hour waits for its half; the airport in words; DST: a 3:30 AM Midway landing on 2027-03-14 leaves at 00:45 by floating wall-clock arithmetic (pinned; LATER has the "check time" mark)', dr && dr.leave);
  }
  check(netCalls.length === 0, 'no network: fetch was never called', netCalls);

  console.log('');
  if (failCount) { console.log(failCount + ' failing, ' + passCount + ' passing'); process.exit(1); }
  console.log('all ' + passCount + ' checks passing');
  process.exit(0);
})().catch((e) => { console.log('  XX  suite crashed: ' + (e && e.stack ? e.stack : e)); console.log('1 failing'); process.exit(1); });

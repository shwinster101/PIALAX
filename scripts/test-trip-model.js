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
  check(mem(lg, 'PIA').face === M.hashedFace('mom & dad') && mem(lg, 'LGA').face === M.hashedFace('anjo') && new Set(lg.members.map((x) => x.face)).size === 3,
    'emoji-less v1 labels get the hashed face FACES[fnv1a(name) % 24], moved on when the trip already shows it: three tiles, three faces');
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
    'a legacy doc refuses every organizer edit until P-migrate (nulling recommendation would lose its plan)');
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
    eq(undatedCreate.body.idea.members.map((x) => x.label), ['🌽 Mom & Dad', '🌴 Ashwin', '🗽 Anjo']) && undatedCreate.body.idea.members[0].headcount === 2,
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
  check(eq(tg.idea.members.map((x) => x.code), ['PIA', 'LAX', 'LGA']) && eq(tg.idea.members.map((x) => x.label), ['🌽 Mom & Dad', '🌴 Ashwin', '🗽 Anjo']) && mig.pin === '2026-11-26' && M.parseNotes(tg.idea.notes).pin === '2026-11-26' && /Peoria parade/.test(tg.idea.notes),
    'codes never change, labels get faces (Me → 🌴 Ashwin), 📌 11/26 comes from v1 storage and the v1 notes are kept');
  check(tg.decision.stage === 'chosen' && tg.decision.chosen.departure === '2026-11-20' && tg.decision.chosen.familyTotal === null && tg.decision.estimate_total === null && tg.responses.LGA.available_from === '2026-11-24',
    're-chosen on the new plan with no stored price; Anjo’s own window is untouched');

  // ═══ AC7 ════════════════════════════════════════════════════════════════
  section('AC7 one pricing function: real cached fares only; fresh / stale / missing / none; open-jaw = two one-ways; adults = headcount; hosts free');
  const at = (hoursAgo) => NOW - hoursAgo * HOUR;
  const tgOrg = (fares, over) => model(tg, Object.assign({ me: 'LAX', hasEditKey: true, hasToken: true, fares }, over || {}));
  const keysOf = mem(tgOrg({}), 'LAX').keys;
  check(keysOf.length === 2 && keysOf[0].kind === 'in' && keysOf[1].kind === 'out' && keysOf[0].key === '2|LAX|PIA|2026-11-20||1' && keysOf[1].key === '2|ORD|LAX|2026-11-29||1',
    'open-jaw is priced as two one-ways: LAX→PIA 11/20 and ORD→LAX 11/29');
  check(mem(tgOrg({}, { multiAirport: true }), 'LAX').keys[0].key === '2|LAX,BUR,LGB,SNA,ONT|PIA|2026-11-20||1', 'with the Worker’s multi-airport search the leg is priced from the whole LA set');
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
  const v1m = loadApi(path.join(ROOT, 'pialax-mobile.html'), 'pialax-mobile.html', ['familyForDate', 'TRIP_NEARBY_GROUPS'], QUIET);
  const v1d = loadApi(path.join(ROOT, 'pialax.html'), 'pialax.html', ['familyForDate', 'TRIP_NEARBY_GROUPS'], QUIET);
  check(!v1m.missing.length && !v1d.missing.length && eq(v1m.api.TRIP_NEARBY_GROUPS, M.NEARBY_GROUPS) && eq(v1d.api.TRIP_NEARBY_GROUPS, M.NEARBY_GROUPS),
    'nearby groups are exactly v1 TRIP_NEARBY_GROUPS (both pialax.html and pialax-mobile.html)');
  const days = ['2026-06-25', '2026-08-15', '2026-08-31', '2026-09-01', '2026-10-17', '2026-11-26'];
  check(!v1m.missing.length && !v1d.missing.length && days.every((d) => eq(M.familyForDate(d), v1m.api.familyForDate(d)) && eq(M.familyForDate(d), v1d.api.familyForDate(d))),
    'familyForDate matches v1 (both files) on every test day, across the 9/1 move');
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
  const pk = model(tweak(DW, (d) => { d.responses['ashwin-p8'].note = '🛬10:00'; d.responses['momdad-k3'].note = '📞 🛬14:00'; d.responses['anjo-z5'] = R('in', 'LGA', '', '', { note: '🛬11:30' }); }));
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
  check(netCalls.length === 0, 'no network: fetch was never called', netCalls);

  console.log('');
  if (failCount) { console.log(failCount + ' failing, ' + passCount + ' passing'); process.exit(1); }
  console.log('all ' + passCount + ' checks passing');
  process.exit(0);
})().catch((e) => { console.log('  XX  suite crashed: ' + (e && e.stack ? e.stack : e)); console.log('1 failing'); process.exit(1); });

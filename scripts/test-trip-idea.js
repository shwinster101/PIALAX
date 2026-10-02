'use strict';
const fs = require('fs');
const path = require('path');
const { loadApi } = require('./harness.js');

const ROOT = process.argv[2] || process.cwd();
const EXPECT = [
  'createTripIdeaBuilderState', 'normalizeTripIdeaBuilderState',
  'resolveTripIdeaCity', 'generateTripIdeaDatePairs', 'tripIdeaScore',
  'rankTripIdeaRecommendations', 'buildTripIdeaRecommendations',
  'serializeTripIdeaSharePayload', 'encodeTripIdeaSharePayload',
  'restoreTripIdeaSharePayload', 'tripIdeaFlexibilityLabel',
  'createTripIdeaWatchlistItem', '_tripIdeaInputsHtml',
  'resolveTripIdeaSearchDates', '_tripIdeaSamplePairs',
  'tripIdeaFareFor', 'tripIdeaHubHeadcount', 'tripIdeaPriceSummary',
  'TRIP_IDEA_HUBS', 'S', '_flightCache', '_cacheKey', 'FLIGHT_CACHE_TTL_MS',
  'tripIdeaBuilder', '_tripIdeaShare', '_tripIdeaOpenRemote', '_tripIdeaKeys', 'tripIdeaMembersFor',
  'summarizeIdeaResponses', 'ideaCommonWindow', 'ideaDecisionStage', 'buildSharedIdeaPayload', 'tripIdeaSharedState',
];
const OPTIONAL = ['tripIdeaDecisionAction', 'tripIdeaDecisionLog', 'tripIdeaDecisionStats'];
let failures = 0;
const formMarkup = {};
function check(ok, message) {
  console.log((ok ? '  OK  ' : '  XX  ') + message);
  if (!ok) failures++;
}

for (const file of ['pialax.html', 'pialax-mobile.html']) {
  const { api, missing } = loadApi(path.join(ROOT, file), file, EXPECT);
  check(!missing.length, `${file}: captures Trip Idea Builder API`);
  if (missing.length) continue;

  const rdu = api.resolveTripIdeaCity('Cary', []);
  check(rdu && rdu.airport === 'RDU', `${file}: Cary resolves to nearby RDU`);
  const lga = api.resolveTripIdeaCity('LGA', []);
  check(lga && lga.airport === 'LGA' && lga.alternatives.includes('JFK'), `${file}: LGA/JFK alternatives remain grouped`);

  const exact = api.generateTripIdeaDatePairs({
    dates: { departure: '2026-10-10', return: '2026-10-13', flexibilityDays: 0 },
  });
  check(exact.length === 1 && exact[0].changedIndependently === false, `${file}: exact date mode`);

  const flexible = api.generateTripIdeaDatePairs({
    dates: { departure: '2026-10-10', return: '2026-10-13', flexibilityDays: 1 },
  });
  check(flexible.length === 9 && flexible.some((x) => x.departureOffset === -1 && x.returnOffset === 1 && x.changedIndependently),
    `${file}: independent ±1 date combinations`);

  const state = api.createTripIdeaBuilderState({
    mode: 'city-first',
    baseHub: 'PIA_ORD',
    destination: { city: 'Cary', airport: 'RDU' },
    dates: { searchStart: '2026-10-01', searchEnd: '2026-10-31' },
    constraints: { tripLength: 3 },
  });
  const rows = api.buildTripIdeaRecommendations(state);
  check(rows.length && rows[0].scoreBreakdown.weights.fare === 55 &&
    rows[0].scoreBreakdown.weights.convenience === 25 &&
    rows[0].scoreBreakdown.weights.dateFit === 20,
    `${file}: transparent 55/25/20 recommendation score`);

  const payload = api.serializeTripIdeaSharePayload(state, rows[0], {
    fareStatus: 'estimated', notes: 'family event',
  });
  const restored = api.restoreTripIdeaSharePayload(api.encodeTripIdeaSharePayload(payload));
  check(restored && restored.version === 'trip-idea-v1' &&
    restored.builder.mode === 'city-first' && restored.fareStatus === 'estimated' &&
    restored.notes === 'family event', `${file}: versioned share payload round trip`);
  check(api.tripIdeaFlexibilityLabel({ dates: { flexibilityDays: 2 } }) === 'Independent dates ±2 days',
    `${file}: flexibility label is explicit`);
  formMarkup[file] = api._tripIdeaInputsHtml();
  check(formMarkup[file].includes('type="date"') && formMarkup[file].includes('id="trip-idea-departure"') && formMarkup[file].includes('id="trip-idea-return"'),
    `${file}: native calendar controls remain the primary date picker`);
  check(formMarkup[file].includes('Dates can shift') && formMarkup[file].includes('±1 day') && formMarkup[file].includes('±2 days'),
    `${file}: fixed dates offer a simple ±day margin`);
  check(formMarkup[file].includes('Where to? <span>Optional</span>') && formMarkup[file].includes('More planning options <span>Optional</span>') &&
    !formMarkup[file].match(/<details class="trip-idea-options" open/),
    `${file}: destination is optional and extra preferences are collapsed`);
  check(formMarkup[file].includes('Earliest departure') && formMarkup[file].includes('Latest departure') &&
    formMarkup[file].includes('Trip length <span>Optional</span>') && formMarkup[file].includes('data-trip-date-mode="window"'),
    `${file}: search window and optional trip length exist only as flexible-date mode`);

  // PIA-068: date resolution gaps found after PIA-067.
  const TODAY = '2026-10-01';
  const cityOnly = api.resolveTripIdeaSearchDates({ destination: { city: 'Raleigh-Durham', airport: 'RDU' } }, 'specific', TODAY);
  check(!cityOnly.error && cityOnly.mode === 'window' && cityOnly.state.dates.searchStart === TODAY &&
    cityOnly.state.dates.searchEnd === '2026-12-30' && cityOnly.state.dates.autoWindow === true,
    `${file}: destination-only search defaults to the next 90 days`);
  const cityRows = api.buildTripIdeaRecommendations(cityOnly.state);
  check(cityRows.length && cityRows.every((r) => r.departure && r.return),
    `${file}: destination-only results always carry dates`);
  check(api.tripIdeaFlexibilityLabel(cityOnly.state) === 'Next 90 days',
    `${file}: destination-only label is not "Exact dates"`);
  const deps = new Set(cityRows.map((r) => r.departure));
  check(deps.size > 1 && [...deps].some((x) => x > '2026-12-01'),
    `${file}: long windows are sampled across their whole span`);
  check(api.resolveTripIdeaSearchDates({ dates: { departure: '2026-11-09', return: '2026-11-06' } }, 'specific', TODAY).error === 'Return must be after departure',
    `${file}: reversed specific dates are rejected`);
  check(api.resolveTripIdeaSearchDates({ dates: { return: '2026-11-06' } }, 'specific', TODAY).error === 'Add a departure date',
    `${file}: return-only search asks for a departure`);
  check(api.resolveTripIdeaSearchDates({ dates: { searchStart: '2026-11-30', searchEnd: '2026-11-01' } }, 'window', TODAY).error.startsWith('Latest departure'),
    `${file}: reversed window is rejected`);
  const openEnd = api.resolveTripIdeaSearchDates({ dates: { searchStart: '2026-11-01' } }, 'window', TODAY);
  check(!openEnd.error && openEnd.state.dates.searchEnd === '2026-12-01',
    `${file}: window with only a start gets a 30-day end`);
  check(api.resolveTripIdeaSearchDates({}, 'specific', TODAY).error === 'Add a destination or date to start',
    `${file}: empty search is rejected`);
  const win = api.generateTripIdeaDatePairs({ dates: { searchStart: '2026-11-01', searchEnd: '2026-11-30' }, constraints: { tripLength: 3 } });
  check(win.length === 30 && win[win.length - 1].departure === '2026-11-30',
    `${file}: "Latest departure" bounds departure, not return`);
  check(api._tripIdeaSamplePairs([1, 2, 3], 8).length === 3 && api._tripIdeaSamplePairs(win, 8)[7] === win[29],
    `${file}: sampler keeps short lists and the last date of long ones`);

  // PIA-070: rank from cached fares the dashboard already holds (zero quota).
  const DEP = '2026-11-06', RET = '2026-11-09';
  const hub = (k) => api.TRIP_IDEA_HUBS.find((h) => h.key === k);
  const RDU = { city: 'Raleigh-Durham', airport: 'RDU', alternatives: [] };
  const seed = (from, to, data, ageMs) => {
    api._flightCache[api._cacheKey(from, to, DEP, RET)] = { data, ts: Date.now() - (ageMs || 0) };
  };
  const clearCache = () => Object.keys(api._flightCache).forEach((k) => delete api._flightCache[k]);
  clearCache();

  const est = api.tripIdeaFareFor(hub('LAX'), RDU, DEP, RET);
  check(est.status === 'estimated' && est.perTicket === 438 && est.from === 'LAX',
    `${file}: no cache → labelled sample fare (LAX-RDU rt 438)`);
  seed('LAX', 'RDU', { rt: 199, live: true, lastVerified: '2026-10-01T12:00:00Z' });
  const hit = api.tripIdeaFareFor(hub('LAX'), RDU, DEP, RET);
  check(hit.status === 'cached' && hit.perTicket === 199 && hit.lastVerified,
    `${file}: fresh dated cache entry prices the row as cached`);
  check(api.tripIdeaFareFor(hub('LAX'), RDU, '2026-11-07', RET).status === 'estimated',
    `${file}: a cached fare for other dates is not reused`);
  seed('LAX', 'RDU', { rt: 199, live: true }, api.FLIGHT_CACHE_TTL_MS + 1000);
  check(api.tripIdeaFareFor(hub('LAX'), RDU, DEP, RET).status === 'estimated',
    `${file}: stale (>24h) cache entry falls back to estimate`);

  clearCache();
  const piaEst = api.tripIdeaFareFor(hub('PIA_ORD'), RDU, DEP, RET);
  check(piaEst.from === 'ORD' && piaEst.perTicket === 230, `${file}: hub picks its cheapest airport (ORD 230 < PIA 280)`);
  seed('PIA', 'RDU', { rt: 300, live: true });
  check(api.tripIdeaFareFor(hub('PIA_ORD'), RDU, DEP, RET).from === 'PIA',
    `${file}: a real cached fare beats a cheaper sample estimate`);
  check(api.tripIdeaHubHeadcount(hub('PIA_ORD'), DEP) === 2 && api.tripIdeaHubHeadcount(hub('LAX'), DEP) === 1 &&
    api.tripIdeaHubHeadcount(hub('LGA_JFK'), DEP) === 1, `${file}: hub headcount PIA_ORD=2, LAX=1, LGA_JFK=1`);

  clearCache();
  api.S.depDate = new Date(DEP + 'T12:00:00'); api.S.retDate = new Date(RET + 'T12:00:00');
  api.S.prices = { 'LGA-RDU': { rt: 150, cached: true } };
  check(api.tripIdeaFareFor(hub('LGA_JFK'), RDU, DEP, RET).status === 'cached',
    `${file}: planner S.prices used when dates match the planner`);
  check(api.tripIdeaFareFor(hub('LGA_JFK'), RDU, '2026-11-13', '2026-11-16').status === 'estimated',
    `${file}: planner S.prices ignored for other dates`);
  api.S.prices = {}; api.S.depDate = null; api.S.retDate = null;

  seed('LAX', 'RDU', { rt: 199, live: true });
  const priced = api.buildTripIdeaRecommendations(api.createTripIdeaBuilderState({
    destination: { city: 'Raleigh-Durham', airport: 'RDU' }, dates: { departure: DEP, return: RET },
  }));
  const laxRow = priced.find((r) => r.hub === 'LAX'), piaRow = priced.find((r) => r.hub === 'PIA_ORD');
  check(laxRow && laxRow.priceStatus === 'cached' && laxRow.totalFare === 199,
    `${file}: recommendation row carries the cached fare`);
  check(piaRow && piaRow.totalFare === piaRow.perTicketFare * 2 && piaRow.headcount === 2,
    `${file}: PIA_ORD row total = per-ticket × 2 travelers`);
  check(/1 of 3 from cached fares/.test(api.tripIdeaPriceSummary(priced)) && /no quota used/.test(api.tripIdeaPriceSummary(priced)),
    `${file}: summary counts cached vs estimated rows`);

  const memRows = api.buildTripIdeaRecommendations(api.createTripIdeaBuilderState({
    destination: { city: 'Memphis', airport: 'MEM' }, dates: { departure: DEP, return: RET },
  }));
  check(memRows.length && memRows.every((r) => r.priceStatus === 'unavailable' && r.totalFare === null && r.scoreBreakdown.fareScore === 0),
    `${file}: route with no fare is "unavailable" and scores 0 for fare, not 100`);
  clearCache();
}

// PIA-070: pricing a search must never spend SerpAPI quota.
{
  let fetchCalls = 0;
  const spy = () => { fetchCalls++; return Promise.reject(new Error('fetch must not be called')); };
  const { api } = loadApi(path.join(ROOT, 'pialax.html'), 'pialax.html', EXPECT, { fetch: spy });
  const before = fetchCalls;
  for (const k of ['LAX', 'PIA_ORD', 'LGA_JFK']) {
    api.buildTripIdeaRecommendations(api.createTripIdeaBuilderState({
      baseHub: k, dates: { searchStart: '2026-11-01', searchEnd: '2026-12-15' }, constraints: { tripLength: 4 },
    }));
  }
  check(fetchCalls === before, 'building recommendations makes zero network calls');
}

check(formMarkup['pialax-mobile.html'] === formMarkup['pialax.html'], 'desktop/mobile builder inputs remain identical');

// PIA-068: scripts/trip-idea-builder.js is the reviewable copy of the block
// mirrored into both HTML files; it drifted in PIA-067. Keep all three equal.
function builderBlock(text) {
  const a = text.indexOf('// Trip Idea Builder (shared by pialax.html and pialax-mobile.html).');
  const i = text.indexOf('\nfunction initTripIdeaBuilder(){', a);
  return a < 0 || i < 0 ? null : text.slice(a, text.indexOf('\n}\n', i) + 3);
}
const sharedCopy = fs.readFileSync(path.join(ROOT, 'scripts/trip-idea-builder.js'), 'utf8');
for (const file of ['pialax.html', 'pialax-mobile.html']) {
  check(builderBlock(fs.readFileSync(path.join(ROOT, file), 'utf8')) === sharedCopy,
    `${file}: Trip Idea block matches scripts/trip-idea-builder.js`);
}

// PIA-072/073: shared ideas end to end — the client's fetch is routed into the
// real worker.js (loaded as ESM) backed by an in-memory KV, so the payload the
// browser sends is checked against the validation the Worker enforces.
async function sharedIdeaSuite() {
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pialax-idea-'));
  fs.writeFileSync(path.join(tmp, 'worker.mjs'), fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8'));
  const worker = (await import('file://' + path.join(tmp, 'worker.mjs'))).default;
  fs.rmSync(tmp, { recursive: true, force: true });
  const kvMap = new Map();
  const kv = { get: async (k) => (kvMap.has(k) ? kvMap.get(k) : null), put: async (k, v) => { kvMap.set(k, v); } };
  const makeFetch = (env) => async (url, opts) => {
    const o = opts || {};
    const res = await worker.fetch(new Request(String(url), { method: o.method || 'GET', headers: o.headers, body: o.body }), env);
    return res;
  };

  for (const file of ['pialax.html', 'pialax-mobile.html']) {
    // No IDEAS binding: share falls back to the read-only ?tripIdea= link.
    {
      const { api } = loadApi(path.join(ROOT, file), file, EXPECT.concat(OPTIONAL), { fetch: makeFetch({}) });
      api.tripIdeaBuilder.recommendation = { id: 'r1', city: 'Raleigh-Durham', airport: 'RDU', hub: 'LAX', fareFrom: 'LAX', fareTo: 'RDU', departure: '2026-11-06', return: '2026-11-09', totalFare: 199, perTicketFare: 199, headcount: 1, priceStatus: 'cached' };
      const url = await api._tripIdeaShare();
      check(typeof url === 'string' && url.includes('tripIdea=') && !/[?&]idea=/.test(url),
        `${file}: no IDEAS binding → share falls back to read-only ?tripIdea= link`);
    }

    const env = { IDEAS: kv };
    const { api } = loadApi(path.join(ROOT, file), file, EXPECT.concat(OPTIONAL), { fetch: makeFetch(env) });
    const members = api.tripIdeaMembersFor('2026-11-06');
    check(members.length === 3 && members[0].code === 'PIA' && members[0].headcount === 2 && members.some((m) => m.code === 'LGA'),
      `${file}: members for Nov 2026 are PIA(2), LAX, LGA (date-aware family)`);
    const rec = { id: 'r1', city: 'Raleigh-Durham', airport: 'RDU', hub: 'PIA_ORD', fareFrom: 'ORD', fareTo: 'RDU', departure: '2026-11-06', return: '2026-11-09', totalFare: 460, perTicketFare: 230, headcount: 2, priceStatus: 'cached' };
    api.tripIdeaBuilder.recommendation = rec;
    api.tripIdeaBuilder._notes = 'Shower is Saturday';
    const url = await api._tripIdeaShare();
    const id = url && (url.match(/[?&]idea=([A-Za-z0-9_-]{22})/) || [])[1];
    check(!!id && !/tripIdea=/.test(url), `${file}: with IDEAS bound, share creates an RSVP link ?idea=<id>`);
    const keys = api._tripIdeaKeys();
    check(keys[id] && /^[A-Za-z0-9_-]{43}$/.test(keys[id].edit_key), `${file}: organizer edit key kept on this device only`);

    await api._tripIdeaOpenRemote(id);
    const doc = api.tripIdeaSharedState().doc;
    check(doc && doc.idea.recommendation.totalFare === 460 && doc.idea.notes === 'Shower is Saturday' && doc.idea.members.length === 3,
      `${file}: the worker accepted the client payload unchanged (fare, notes, members)`);
    check(api.ideaDecisionStage(doc) === 'proposed', `${file}: new shared idea is "proposed"`);

    const respond = (body) => makeFetch(env)('https://w.dev/idea/respond?id=' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await respond({ member: 'PIA', status: 'in', available_from: '2026-11-05', available_to: '2026-11-10' });
    await respond({ member: 'LAX', status: 'maybe', available_from: '2026-11-06', available_to: '2026-11-12' });
    await api._tripIdeaOpenRemote(id);
    const after = api.tripIdeaSharedState().doc;
    const sum = api.summarizeIdeaResponses(after);
    check(sum.counts.in === 1 && sum.counts.maybe === 1 && sum.counts.pending === 1 && sum.travelersIn === 2,
      `${file}: summary counts 1 in (2 travelers) · 1 maybe · 1 waiting`);
    check(api.ideaDecisionStage(after) === 'answered', `${file}: stage becomes "answered" once anyone RSVPs`);
    const win = api.ideaCommonWindow(after);
    check(win && win.overlaps && win.from === '2026-11-06' && win.to === '2026-11-10',
      `${file}: common window is the overlap of in/maybe dates (Nov 6 → Nov 10)`);
    check(api.ideaCommonWindow({ idea: after.idea, responses: { PIA: { status: 'in', available_from: '2026-11-01', available_to: '2026-11-03' }, LAX: { status: 'in', available_from: '2026-11-05', available_to: '2026-11-08' } } }).overlaps === false,
      `${file}: non-overlapping availability is reported, not hidden`);

    // PIA-073: organizer decision flow through the client.
    if (typeof api.tripIdeaDecisionAction === 'function') {
      await api.tripIdeaDecisionAction('choose');
      check(api.tripIdeaSharedState().doc.decision.stage === 'chosen' && api.tripIdeaSharedState().doc.decision.estimate_total === 460,
        `${file}: organizer "choose" records the $460 estimate`);
      await api.tripIdeaDecisionAction('book', 506);
      const d = api.tripIdeaSharedState().doc.decision;
      check(d.stage === 'booked' && d.actual_total === 506 && d.delta_pct === 10, `${file}: organizer "booked" records actual $506 (+10%)`);
      const log = api.tripIdeaDecisionLog();
      const entry = log.filter((e) => e.id === id)[0];
      check(entry && entry.stage === 'booked' && entry.estimate_total === 460 && entry.actual_total === 506,
        `${file}: local decision history keeps estimate vs actual`);
      const stats = api.tripIdeaDecisionStats(log);
      check(stats.booked === 1 && stats.avgDeltaPct === 10, `${file}: history stats: 1 booked, estimates ran 10% low`);
      api.tripIdeaSharedState().editKey = '';
      const r = await api.tripIdeaDecisionAction('drop');
      check(r === null && api.tripIdeaSharedState().doc.decision.stage === 'booked', `${file}: without the edit key, decision actions do nothing`);
    }
  }
}

sharedIdeaSuite().catch((e) => check(false, 'shared idea suite threw: ' + (e && e.stack || e))).then(() => {
  if (failures) process.exit(1);
  console.log('all Trip Idea Builder checks passing');
});

'use strict';
const fs = require('fs');
const path = require('path');
const { loadApi, makeLocalStorage } = require('./harness.js');

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
EXPECT.push('WATCHLIST', 'watchlistItem', 'sanitizeWatchlistItem', 'tripIdeaRsvpChipHtml', 'tripIdeaAskFamily', 'tripIdeaPayloadFromItem', 'tripIdeaCardActionsHtml', '_tripIdeaSave'); // PIA-076
EXPECT.push('memberStatusFromIdea', 'tripIdeaApplyLinkedRsvp', 'tripIdeaLinkedStatusHtml', 'tripIdeaLinkedNoteHtml'); // PIA-077
EXPECT.push('tripIdeaShareText', 'tripIdeaDistribute', 'tripIdeaDateRange', 'tripIdeaHoldDates', 'tripIdeaNudge'); // PIA-078
EXPECT.push('tripStateFor', 'computeRecommendation', 'tripIdeaHasNewAnswers', 'tripIdeaMarkSeen'); // PIA-079
EXPECT.push('tripIdeaPromptActual', 'setWatchlistStage'); // PIA-080
EXPECT.push('watchlistGFLinks'); // PIA-082
EXPECT.push('handoffIntentsForWatchlistItem', 'tripIdeaAnswerDates', 'tripIdeaMemberTravel', 'tripIdeaChosenWithAnswers', 'tripIdeaFetchDoc'); // PIA-083
EXPECT.push('tripIdeaFamilyEstimate', 'tripIdeaDecisionAction', 'tripIdeaDecisionLog', 'tripIdeaDecisionStats', 'renderTripIdeaDecisionPanel'); // PIA-073: required
EXPECT.push('mapHubOption'); // PIA-091
EXPECT.push('tripIdeaLooseWhen'); // PIA-098
EXPECT.push('tripIdeaMe', 'tripIdeaSetMe', 'tripIdeaWho', 'tripIdeaCalendarStartMonth', 'tripIdeaCalendarTap', 'tripIdeaDayCounts', 'tripIdeaRangeCalendarHtml'); // PIA-100/101
const OPTIONAL = [];
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
  // PIA-100: this device remembers who answered, per idea; the organizer device defaults to "Me".
  {
    const doc = { id: 'x', idea: { members: [{ code: 'LAX', label: 'Me', airport: 'LAX' }, { code: 'LGA', label: 'Anjo', airport: 'LGA' }] } };
    api.tripIdeaSetMe('idea-1', 'LGA');
    check(api.tripIdeaMe('idea-1') === 'LGA' && api.tripIdeaWho({ id: 'idea-1', doc }) === 'LGA' && api.tripIdeaWho({ id: 'idea-2', doc }) === '' &&
      api.tripIdeaWho({ id: 'idea-2', doc, editKey: 'k' }) === 'LAX' && api.tripIdeaWho({ id: 'idea-1', doc, answerFor: 'LAX' }) === 'LAX',
      `${file}: who answers — remembered per idea, organizer device defaults to Me, "answer for" wins`);
    api.tripIdeaSetMe('idea-1', '');
    check(api.tripIdeaMe('idea-1') === '', `${file}: "Not you?" forgets the remembered name`);
  }
  // PIA-101: the calendar opens on the proposal's month; tap arrive, then leave.
  {
    const doc = { idea: { recommendation: { departure: '2026-11-25' }, members: [{ code: 'LAX', label: 'Me', airport: 'LAX' }, { code: 'LGA', label: 'Anjo', airport: 'LGA' }, { code: 'PIA', label: 'Mom & Dad', airport: 'PIA' }], destination: { airport: 'PIA' } },
      responses: { LAX: { status: 'in', available_from: '2026-11-21', available_to: '2026-11-23' }, LGA: { status: 'out', available_from: '2026-11-22', available_to: '2026-11-24' } } };
    check(api.tripIdeaCalendarStartMonth(doc, {}) === '2026-11' && api.tripIdeaCalendarStartMonth(doc, { available_from: '2026-12-02' }) === '2026-12',
      `${file}: calendar opens on the proposal month (or your own earlier answer's month)`);
    const c = { from: '', to: '' };
    api.tripIdeaCalendarTap(c, '2026-11-24'); api.tripIdeaCalendarTap(c, '2026-11-29');
    const c2 = api.tripIdeaCalendarTap({ from: '2026-11-24', to: '' }, '2026-11-20');
    const c3 = api.tripIdeaCalendarTap({ from: '2026-11-24', to: '2026-11-29' }, '2026-11-26');
    check(c.from === '2026-11-24' && c.to === '2026-11-29' && c2.from === '2026-11-20' && c2.to === '' && c3.from === '2026-11-26' && c3.to === '',
      `${file}: calendar taps — arrive then leave; an earlier day restarts; a third tap starts over`);
    const counts = api.tripIdeaDayCounts(doc, 'LGA');
    check(counts['2026-11-21'] === 1 && counts['2026-11-23'] === 1 && !counts['2026-11-24'] && !counts['2026-11-20'],
      `${file}: day dots count others who are in/maybe (not "out", not yourself, not hosts)`);
    const html = api.tripIdeaRangeCalendarHtml('2026-11', '2026-11-24', '2026-11-29', counts, '2026-11-22');
    check(/November 2026/.test(html) && /data-cal-day="2026-11-21"[^>]*disabled/.test(html) && /is-start/.test(html) && /Nov 24–29 · 5 nights/.test(html),
      `${file}: calendar marks past days, the picked range and its nights`);
  }
  // PIA-091: the builder's New York hub key (LGA_JFK) used to fall back to PIA/ORD on the map.
  check(api.mapHubOption('LGA_JFK').key === 'LGA' && api.mapHubOption('LAX').key === 'LAX' && api.mapHubOption('PIA_ORD').key === 'PIA_ORD',
    `${file}: map focus from the builder's LGA_JFK hub lands on New York, not PIA/ORD`);
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

// PIA-082: an old saved "planning" override must not reopen the archived Cary card.
for (const file of ['pialax.html', 'pialax-mobile.html']) {
  const ls = makeLocalStorage();
  ls.setItem('pialax_watchlist_v1', JSON.stringify({ overrides: { tgiving: { stage: 'planning', dep: '2026-11-26', ret: '2026-11-29', nextAction: 'old', notes: 'my note' } }, added: [] }));
  const { api } = loadApi(path.join(ROOT, file), file, ['watchlistItem'], { localStorage: ls });
  const t = api.watchlistItem('tgiving');
  check(t && t.stage === 'completed' && t.nextAction !== 'old' && t.notes === 'my note',
    `${file}: stale Cary overrides are scrubbed (stays archived, keeps personal notes)`);
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
    // PIA-076: the shared idea lives on exactly one Trip Ideas card.
    const linked = api.WATCHLIST.filter((t) => t.sharedIdeaId === id);
    check(linked.length === 1 && linked[0].mode === 'family' && linked[0].hub === 'RDU',
      `${file}: sharing saves one Trip Ideas card linked to the idea (family, hub RDU)`);
    const again = api._tripIdeaSave(true);
    check(again && again.id === linked[0].id && api.WATCHLIST.filter((t) => t.sharedIdeaId === id).length === 1,
      `${file}: saving the same recommendation again does not duplicate the card`);
    check(api.sanitizeWatchlistItem({ id: 'x1', mode: 'solo', sharedIdeaId: '../../etc' }).sharedIdeaId === undefined &&
      api.sanitizeWatchlistItem({ id: 'x2', mode: 'solo', sharedIdeaId: id }).sharedIdeaId === id,
      `${file}: stored sharedIdeaId is validated on load`);
    check(/See answers/.test(api.tripIdeaCardActionsHtml(linked[0])), `${file}: linked card offers "See answers"`);
    const keys = api._tripIdeaKeys();
    check(keys[id] && /^[A-Za-z0-9_-]{43}$/.test(keys[id].edit_key), `${file}: organizer edit key kept on this device only`);

    await api._tripIdeaOpenRemote(id);
    const doc = api.tripIdeaSharedState().doc;
    check(doc && doc.idea.recommendation.totalFare === 460 && doc.idea.notes === 'Shower is Saturday' && doc.idea.members.length === 3,
      `${file}: the worker accepted the client payload unchanged (fare, notes, members)`);
    // Family estimate = LAX 438×1 + ORD 230×2 + LGA 218×1 (sample fares, no cache) = 1116.
    const fam = api.tripIdeaFamilyEstimate(rec);
    check(fam.total === 1116 && fam.status === 'estimated' && fam.parts.length === 3,
      `${file}: family estimate sums every hub × travelers ($1,116), not one row`);
    check(doc.idea.recommendation.familyTotal === 1116, `${file}: shared idea carries the family estimate`);
    const hostFam = api.tripIdeaFamilyEstimate(Object.assign({}, rec, { airport: 'LAX' }));
    check(hostFam.parts.some((p) => p.hub === 'LAX' && p.status === 'host' && p.perTicket === 0),
      `${file}: a hub that is the destination counts as home base ($0)`);
    check(api.ideaDecisionStage(doc) === 'proposed', `${file}: new shared idea is "proposed"`);
    check(doc.responses.LAX && doc.responses.LAX.status === 'in' && Object.keys(doc.responses).length === 1,
      `${file}: the organizer ("Me") is counted in automatically`);
    check(!/Me/.test(api.tripIdeaShareText(doc, 'nudge').replace('Mom', '')), `${file}: nudges never ask the organizer`);

    const respond = (body) => makeFetch(env)('https://w.dev/idea/respond?id=' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await respond({ member: 'PIA', status: 'in', available_from: '2026-11-05', available_to: '2026-11-10' });
    await respond({ member: 'LAX', status: 'maybe', available_from: '2026-11-06', available_to: '2026-11-12' });
    await api._tripIdeaOpenRemote(id);
    const after = api.tripIdeaSharedState().doc;
    const sum = api.summarizeIdeaResponses(after);
    check(sum.counts.in === 1 && sum.counts.maybe === 1 && sum.counts.pending === 1 && sum.travelersIn === 2,
      `${file}: summary counts 1 in (2 travelers) · 1 maybe · 1 waiting`);
    check(api.ideaDecisionStage(after) === 'answered', `${file}: stage becomes "answered" once anyone RSVPs`);
    const chip = api.tripIdeaRsvpChipHtml(linked[0]);
    check(/1 in · 1 maybe · 0 out · 1 waiting/.test(chip), `${file}: card chip shows live RSVP counts`);
    // PIA-077: shared answers drive Family Plan statuses (maybe → tentative; in = default).
    api.S.linkedIdeaId = id; api.S.depDate = new Date('2026-11-06T12:00:00');
    await api.tripIdeaApplyLinkedRsvp();
    check(JSON.stringify(api.S.memberStatus) === JSON.stringify({ LAX: 'tentative' }) && api.S.tentativeMembers.join() === 'LAX',
      `${file}: linked trip sets Family Plan statuses from answers (LAX maybe → tentative, PIA in)`);
    check(/✅ in · answered/.test(api.tripIdeaLinkedStatusHtml('PIA')) && /⏳ waiting/.test(api.tripIdeaLinkedStatusHtml('LGA')),
      `${file}: Family Plan shows read-only "answered" / "waiting" labels`);
    check(/switch to what-if/.test(api.tripIdeaLinkedNoteHtml()), `${file}: Family Plan says it is using family answers, with a what-if escape`);
    const moved = api.memberStatusFromIdea({ responses: { LGA: { status: 'out' } } }, new Date('2026-08-01T12:00:00'));
    check(moved.JAX === 'out' && !moved.LGA, `${file}: an answer follows the person across a home move (LGA answer → JAX before Sep 1)`);
    api.S.linkedIdeaId = null; api.S.memberStatus = {}; api.S.tentativeMembers = [];

    // PIA-079: answers feed the trip assistant.
    const ts = api.tripStateFor(linked[0], [], '2026-10-03T12:00:00Z');
    const byLabel = Object.fromEntries(ts.companions.map((c) => [c.label, c.status]));
    check(byLabel['Mom & Dad'] === 'confirmed' && byLabel.Anjo === 'tentative' && !('Me' in byLabel),
      `${file}: trip state companions come from answers (Mom & Dad confirmed, Anjo no answer → tentative, organizer excluded)`);
    const recm = api.computeRecommendation(ts, null, '2026-10-03T12:00:00Z');
    check(recm && recm.state === 'COORDINATE' && /Anjo/.test(recm.headline || ''),
      `${file}: assistant says to confirm Anjo before booking`);
    check(api.tripIdeaHasNewAnswers(after) === false, `${file}: answers the organizer already opened are not flagged as new`);
    const newer = Object.assign({}, after, { log: after.log.concat([{ at: '2099-01-01T00:00:00.000Z', event: 'rsvp:in', by: 'LGA' }]) });
    check(api.tripIdeaHasNewAnswers(newer) === true, `${file}: a later answer flags the card as new`);
    api.tripIdeaMarkSeen(newer);
    check(api.tripIdeaHasNewAnswers(newer) === false, `${file}: opening the answers clears the new-answers dot`);
    // PIA-078: group-text distribution.
    const inviteTxt = api.tripIdeaShareText(after, 'invite');
    // PIA-098: no price and no exact days — a rough time, own dates, the ask; URL passed separately.
    check(/early Nov/.test(inviteTxt) && !/\$/.test(inviteTxt) && !/\d/.test(inviteTxt.replace('✈️', '')) && /own dates/.test(inviteTxt) && /in \/ maybe \/ out/.test(inviteTxt) && !/https?:/.test(inviteTxt),
      `${file}: invite text has a rough time and the ask — no price, no exact dates, no URL`);
    check(!/\$|\d/.test(api.tripIdeaShareText(after, 'nudge')), `${file}: nudge has no price or exact dates either`);
    check(api.tripIdeaLooseWhen('2026-11-25') === 'late Nov' && api.tripIdeaLooseWhen('2026-11-15') === 'mid-Nov' && api.tripIdeaLooseWhen('') === '',
      `${file}: loose time of month (early / mid- / late)`);
    check(/still need an answer from Anjo/.test(api.tripIdeaShareText(after, 'nudge')), `${file}: nudge names who is still waiting`);
    check(api.tripIdeaDateRange('2026-10-30', '2026-11-02') === 'Oct 30–Nov 2' && api.tripIdeaDateRange('', '') === 'dates TBD',
      `${file}: date ranges read naturally across months`);
    {
      const calls = [];
      const navOk = { userAgent: 'iPhone', clipboard: { writeText: () => Promise.resolve() }, share: async (d) => { calls.push(d); } };
      const navCancel = { userAgent: 'iPhone', clipboard: { writeText: () => Promise.resolve() }, share: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; } };
      const navFail = { userAgent: 'iPhone', clipboard: { writeText: () => Promise.resolve() }, share: async () => { throw new Error('NotAllowed'); } };
      const p1 = loadApi(path.join(ROOT, file), file, EXPECT.concat(OPTIONAL), { fetch: makeFetch(env), navigator: navOk }).api;
      const r1 = await p1.tripIdeaDistribute('T', 'Are you in?', 'https://x/?idea=' + id);
      check(r1 === 'shared' && calls.length === 1 && calls[0].url.endsWith(id) && calls[0].text === 'Are you in?',
        `${file}: phones use the native share sheet with text and url separate`);
      const r2 = await loadApi(path.join(ROOT, file), file, EXPECT.concat(OPTIONAL), { navigator: navCancel }).api.tripIdeaDistribute('T', 't', 'u');
      const r3 = await loadApi(path.join(ROOT, file), file, EXPECT.concat(OPTIONAL), { navigator: navFail }).api.tripIdeaDistribute('T', 't', 'u');
      check(r2 === 'cancelled' && r3 === 'copied', `${file}: cancel stays quiet; a share failure falls back to copy`);
    }
    {
      let ev = null;
      try { ev = api.tripIdeaHoldDates(linked[0].id); } catch (e) { ev = api.watchlistItem(linked[0].id).calendarEvents; }
      ev = ev || api.watchlistItem(linked[0].id).calendarEvents;
      check(ev && ev[0].start === '2026-11-06' && ev[0].end === '2026-11-10' && ev[0].notes.includes('?idea=' + id),
        `${file}: "Hold the dates" calendar event spans Nov 6–9 and carries the RSVP link`);
    }
    // PIA-082: Thanksgiving at Mom & Dad's (PIA) is the family RSVP card; Cary is archived.
    check(api.watchlistItem('tgiving') && api.watchlistItem('tgiving').stage === 'completed' &&
      api.tripIdeaCardActionsHtml(api.watchlistItem('tgiving')) === '', `${file}: postponed Cary card is archived (no RSVP actions)`);
    const tg = api.watchlistItem('thanksgiving');
    check(tg && tg.hub === 'PIA' && tg.dep === '2026-11-25' && tg.ret === '2026-11-29' && /Ask the family/.test(api.tripIdeaCardActionsHtml(tg)),
      `${file}: Thanksgiving card (PIA, Nov 25–29) offers "Ask the family"`);
    const tgLinks = api.watchlistGFLinks(tg).map((l) => l.label + ' ' + l.url);
    check(tgLinks.length === 2 && tgLinks.some((l) => /^Me · /.test(l) && /LAX/.test(l)) && tgLinks.some((l) => /^Anjo · /.test(l) && /LGA/.test(l)) &&
      !tgLinks.some((l) => /Mom/.test(l)), `${file}: Thanksgiving card links one flight search per traveler; Mom & Dad host`);
    const tgPayload = api.tripIdeaPayloadFromItem(tg);
    check(tgPayload.recommendation && tgPayload.recommendation.airport === 'PIA' && tgPayload.recommendation.departure === '2026-11-25' &&
      tgPayload.recommendation.familyTotal === 704 && tgPayload.members.length === 3,
      `${file}: Thanksgiving payload: PIA, Nov 25, family ≈ $704 (LAX 362 + LGA 342, hosts $0)`);
    // PIA-080 runs on its own idea below; keep the earlier one open for the PIA-073 flow.
    const tgId = await api.tripIdeaAskFamily('thanksgiving');
    // PIA-080: marking the linked card booked records the whole-trip total (choosing first).
    const tgDone = await api.tripIdeaPromptActual(api.watchlistItem('thanksgiving'), '$1,300');
    const tgDec = tgDone && tgDone.decision;
    check(tgDec && tgDec.stage === 'booked' && tgDec.actual_total === 1300 && tgDec.estimate_total > 0 && typeof tgDec.delta_pct === 'number',
      `${file}: booking a linked card records actual vs estimate (chosen automatically first)`);
    check(api.tripIdeaDecisionLog().some((e) => e.id === tgId && e.actual_total === 1300),
      `${file}: the decision log gets the booked total without opening the builder`);
    check((await api.tripIdeaPromptActual(api.watchlistItem('thanksgiving'), '')) === null, `${file}: a blank total is skipped, nothing recorded`);
    check(/^[A-Za-z0-9_-]{22}$/.test(tgId || '') && api.watchlistItem('thanksgiving').sharedIdeaId === tgId,
      `${file}: "Ask the family" on a seed card creates and links a shared idea`);
    const win = api.ideaCommonWindow(after);
    check(win && win.overlaps && win.from === '2026-11-06' && win.to === '2026-11-10',
      `${file}: common window is the overlap of in/maybe dates (Nov 6 → Nov 10)`);
    check(api.ideaCommonWindow({ idea: after.idea, responses: { PIA: { status: 'in', available_from: '2026-11-01', available_to: '2026-11-03' }, LAX: { status: 'in', available_from: '2026-11-05', available_to: '2026-11-08' } } }).overlaps === false,
      `${file}: non-overlapping availability is reported, not hidden`);

    // PIA-073: organizer decision flow through the client.
    {
      await api.tripIdeaDecisionAction('choose');
      check(api.tripIdeaSharedState().doc.decision.stage === 'chosen' && api.tripIdeaSharedState().doc.decision.estimate_total === 1116,
        `${file}: organizer "choose" records the $1,116 family estimate`);
      await api.tripIdeaDecisionAction('book', '$1,228');
      const d = api.tripIdeaSharedState().doc.decision;
      check(d.stage === 'booked' && d.actual_total === 1228 && d.delta_pct === 10, `${file}: organizer "booked" records actual $1,228 (+10%)`);
      const log = api.tripIdeaDecisionLog();
      const entry = log.filter((e) => e.id === id)[0];
      check(entry && entry.stage === 'booked' && entry.estimate_total === 1116 && entry.actual_total === 1228,
        `${file}: local decision history keeps estimate vs actual`);
      const stats = api.tripIdeaDecisionStats(log);
      const bookedDeltas = log.filter((e) => e.stage === 'booked').map((e) => e.delta_pct);
      const expectAvg = Math.round(bookedDeltas.reduce((x, y) => x + y, 0) / bookedDeltas.length * 10) / 10;
      check(stats.booked === 2 && bookedDeltas.includes(10) && stats.avgDeltaPct === expectAvg,
        `${file}: history stats average actual-vs-estimate across booked ideas (2 booked)`);
      api.tripIdeaSharedState().editKey = '';
      const r = await api.tripIdeaDecisionAction('drop');
      check(r === null && api.tripIdeaSharedState().doc.decision.stage === 'booked', `${file}: without the edit key, decision actions do nothing`);
    }
  }
}

// PIA-083: Thanksgiving in Peoria with staggered arrivals — one trip, one link,
// each traveler's own dates driving their flight search, Family Plan and estimate.
async function staggeredArrivalsSuite() {
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pialax-pia-'));
  fs.writeFileSync(path.join(tmp, 'worker.mjs'), fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8'));
  const worker = (await import('file://' + path.join(tmp, 'worker.mjs'))).default;
  fs.rmSync(tmp, { recursive: true, force: true });
  const kvMap = new Map();
  const env = { IDEAS: { get: async (k) => (kvMap.has(k) ? kvMap.get(k) : null), put: async (k, v) => { kvMap.set(k, v); } } };
  const fetchW = async (url, opts) => { const o = opts || {}; return worker.fetch(new Request(String(url), { method: o.method || 'GET', headers: o.headers, body: o.body }), env); };
  const respond = (id, body) => fetchW('https://w.dev/idea/respond?id=' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  for (const file of ['pialax.html', 'pialax-mobile.html']) {
    const { api } = loadApi(path.join(ROOT, file), file, EXPECT, { fetch: fetchW });
    const id = await api.tripIdeaAskFamily('thanksgiving');
    let doc = await api.tripIdeaFetchDoc(id, true);
    let sum = api.summarizeIdeaResponses(doc);
    const row = (code) => sum.rows.find((r) => r.code === code);
    check(row('PIA').status === 'hosting' && row('LAX').status === 'in' && row('LGA').status === 'pending' && sum.counts.pending === 1,
      `${file}: Thanksgiving starts with Mom & Dad hosting, Me in, Anjo waiting`);
    check(/still need an answer from Anjo\./.test(api.tripIdeaShareText(doc, 'nudge')), `${file}: nudge names only Anjo — never the hosts or the organizer`);

    await respond(id, { member: 'LAX', status: 'in', available_from: '2026-11-21', available_to: '2026-11-29' });
    await respond(id, { member: 'LGA', status: 'maybe', available_from: '2026-11-24', available_to: '2026-11-29' });
    doc = await api.tripIdeaFetchDoc(id, true);
    sum = api.summarizeIdeaResponses(doc);
    check(sum.counts.pending === 0 && sum.travelersIn === 1, `${file}: nobody left waiting once both travelers answer`);

    const item = api.watchlistItem('thanksgiving');
    const intents = api.handoffIntentsForWatchlistItem(item);
    const lax = intents.find((x) => x.from === 'LAX'), lga = intents.find((x) => x.from === 'LGA');
    check(intents.length === 2 && lax.depISO === '2026-11-21' && lax.retISO === '2026-11-29' && lga.depISO === '2026-11-24' && lga.retISO === '2026-11-29' &&
      !intents.some((x) => x.from === 'PIA'), `${file}: each traveler's flight search uses their own dates (LAX Nov 21, LGA Nov 24); hosts get none`);
    const labels = api.watchlistGFLinks(item).map((l) => l.label);
    check(labels.some((l) => /^Me \(Nov 21–29\)/.test(l)) && labels.some((l) => /^Anjo \(Nov 24–29\)/.test(l)),
      `${file}: flight links are labelled with each person's dates`);

    api.S.linkedIdeaId = id; api.S.depDate = new Date('2026-11-25T12:00:00'); api.S.retDate = new Date('2026-11-29T12:00:00');
    await api.tripIdeaApplyLinkedRsvp();
    const md = api.S.memberDates || {};
    const iso = (d) => d && d.toISOString().slice(0, 10);
    check(iso(md.LAX && md.LAX.dep) === '2026-11-21' && iso(md.LGA && md.LGA.dep) === '2026-11-24' && !md.PIA && api.S.memberStatus.LGA === 'tentative',
      `${file}: Family Plan gets per-person dates (LAX Nov 21, LGA Nov 24) and Anjo's maybe`);
    api.S.linkedIdeaId = null; api.S.memberDates = {}; api.S.memberStatus = {};

    // Estimate on each person's own dates: a cached LAX→PIA fare for Nov 21–29 is used.
    api._flightCache[api._cacheKey('LAX', 'PIA', '2026-11-21', '2026-11-29')] = { data: { rt: 250, live: true }, ts: Date.now() };
    const chosen = api.tripIdeaChosenWithAnswers(doc);
    check(chosen && chosen.familyTotal === 592, `${file}: estimate uses each traveler's dates (LAX $250 cached for Nov 21–29 + LGA $342) = $592`);
    const booked = await api.tripIdeaPromptActual(api.watchlistItem('thanksgiving'), '$900');
    check(booked && booked.decision.estimate_total === 592 && booked.decision.actual_total === 900,
      `${file}: booking compares the actual $900 with the per-person estimate $592`);
    Object.keys(api._flightCache).forEach((k) => delete api._flightCache[k]);
  }
}

sharedIdeaSuite().catch((e) => check(false, 'shared idea suite threw: ' + (e && e.stack || e)))
  .then(() => staggeredArrivalsSuite()).catch((e) => check(false, 'staggered arrivals suite threw: ' + (e && e.stack || e))).then(() => {
  if (failures) process.exit(1);
  console.log('all Trip Idea Builder checks passing');
});

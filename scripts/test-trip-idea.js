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
];
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

if (failures) process.exit(1);
console.log('all Trip Idea Builder checks passing');

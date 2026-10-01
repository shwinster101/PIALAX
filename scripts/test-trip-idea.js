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
}

check(formMarkup['pialax-mobile.html'] === formMarkup['pialax.html'], 'desktop/mobile builder inputs remain identical');

if (failures) process.exit(1);
console.log('all Trip Idea Builder checks passing');

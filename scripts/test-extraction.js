'use strict';
// test-extraction.js — PIA-047. Exercises the Trip Assistant data layer against
// scripts/fixtures/extraction-fixtures.json, for BOTH html files.
//
// Three gates, in descending order of how much I trust them:
//
//   1. NO INVENTED VALUES (hard fail, any fixture). A fabricated origin or date
//      silently produces a wrong price and a wrong booking link; a missing one
//      just asks the user a question. Recall is a preference, invention is a bug.
//   2. SOURCE-TEXT HONESTY (hard fail). Every emitted value that carries
//      source_text must quote text actually present in the input, so a human
//      reviewing a proposed fact can always see where it came from.
//   3. FIELD ACCURACY >= 90% across the parser set (the spec's number).
//
// Plus the merge contract (proposed never overwrites confirmed) and the notes
// migration's idempotence — the two properties that make "your note is never
// lost or silently rewritten" true rather than aspirational.

const fs = require('fs');
const path = require('path');
const { loadApi } = require('./harness.js');

const ROOT = process.argv[2] || process.cwd();
const FILES = ['pialax.html', 'pialax-mobile.html'];

const EXPECT = [
  'fallbackParse', 'taResolveDate', 'taScanPlaces', 'validateExtraction',
  'extractionToFacts', 'applyParsedFacts', 'setFactStatus', 'rebuildTripState',
  'sanitizeContextEvent', 'sanitizeParsedFact', 'sanitizeTripState',
  'createContextEvent', 'migrateNotesToContextEvents', 'taCapEvents',
  'classifyExtractResponse',
  // PIA-049 decision engine + handoff
  'computeRecommendation', 'typicalRangeFor', 'constraintViolationsFor',
  'buildHandoffUrl', 'buildReviewLine', 'taIsRoundTrip',
  'TA_GAZETTEER_PLACEHOLDER',
];
// TA_GAZETTEER_PLACEHOLDER is not a real symbol — drop it. (Kept out of the
// list rather than renamed so the intent stays obvious if someone re-adds it.)
EXPECT.pop();

let passCount = 0;
let failCount = 0;
const ok = (m) => { console.log('  OK  ' + m); passCount++; };
const bad = (m) => { console.log('  XX  ' + m); failCount++; };

const FIXTURES = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/extraction-fixtures.json'), 'utf8'));

console.log('▶ test-extraction: trip-assistant data layer');

const loaded = {};
for (const f of FILES) {
  try {
    const { api, missing } = loadApi(path.join(ROOT, f), f, EXPECT);
    if (missing.length) bad(`${f}: missing symbols — ${missing.join(', ')}`);
    else { ok(`${f}: captured all ${EXPECT.length} assistant symbols`); loaded[f] = api; }
  } catch (e) {
    bad(`${f}: failed to load — ${e && e.message ? e.message : String(e)}`);
  }
}

// ---- helpers ---------------------------------------------------------------
const allSegValues = (ex, key) => (ex.segments || []).map((s) => s[key]).filter((v) => v != null);
function allDates(ex) {
  const out = [];
  (ex.segments || []).forEach((s) => { if (s.departure_date) out.push(s.departure_date); });
  (ex.constraints || []).forEach((c) => { if (c.datetime) out.push(String(c.datetime).slice(0, 10)); });
  if (ex.decision_deadline) out.push(ex.decision_deadline);
  return out;
}
// Collect every source_text the extraction emitted, so honesty can be checked
// uniformly rather than per-shape.
function allSourceTexts(ex) {
  const out = [];
  ['segments', 'constraints', 'companions'].forEach((k) => {
    (ex[k] || []).forEach((item) => { if (item && item.source_text) out.push(item.source_text); });
  });
  return out;
}
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

// ---- 1. parser fixtures ----------------------------------------------------
for (const f of FILES) {
  const api = loaded[f];
  if (!api) { bad(`${f}: parser fixtures skipped — file failed to load`); continue; }

  let fieldsChecked = 0;
  let fieldsCorrect = 0;
  let invented = 0;
  let dishonest = 0;
  const failures = [];

  for (const fx of FIXTURES.parser) {
    let ex;
    try {
      ex = api.fallbackParse(fx.input.text, fx.input.refIso);
    } catch (e) {
      failures.push(`${fx.name}: threw ${e && e.message}`);
      continue;
    }

    // Schema must always validate, whatever the input was.
    const v = api.validateExtraction(ex);
    if (!v.ok) failures.push(`${fx.name}: own output fails validateExtraction — ${v.errors.join('; ')}`);

    // --- gate 1: nothing invented ---
    const forbid = fx.forbid || {};
    (forbid.segment_origins || []).forEach((code) => {
      if (allSegValues(ex, 'origin').includes(code)) {
        invented++; failures.push(`${fx.name}: INVENTED origin ${code}`);
      }
    });
    (forbid.segment_destinations || []).forEach((code) => {
      if (allSegValues(ex, 'destination').includes(code)) {
        invented++; failures.push(`${fx.name}: INVENTED destination ${code}`);
      }
    });
    if (forbid.any_date && allDates(ex).length) {
      invented++; failures.push(`${fx.name}: INVENTED date(s) ${allDates(ex).join(',')}`);
    }

    // --- gate 2: source_text must be quoted verbatim from the input ---
    const hay = norm(fx.input.text);
    for (const st of allSourceTexts(ex)) {
      if (!hay.includes(norm(st))) {
        dishonest++;
        failures.push(`${fx.name}: source_text not present in input — ${JSON.stringify(st.slice(0, 60))}`);
      }
    }

    // --- gate 3: field accuracy ---
    const want = fx.expect || {};
    const check = (label, got, exp) => {
      fieldsChecked++;
      const good = JSON.stringify(got) === JSON.stringify(exp);
      if (good) fieldsCorrect++;
      else failures.push(`${fx.name}: ${label} expected ${JSON.stringify(exp)} got ${JSON.stringify(got)}`);
    };
    if (want.segments) {
      want.segments.forEach((wseg, i) => {
        const got = (ex.segments || [])[i] || {};
        Object.keys(wseg).forEach((k) => check(`segments[${i}].${k}`, got[k] == null ? null : got[k], wseg[k]));
      });
    }
    if (want.segment_count != null) check('segment_count', (ex.segments || []).length, want.segment_count);
    if (want.segment_count_max != null) {
      fieldsChecked++;
      if ((ex.segments || []).length <= want.segment_count_max) fieldsCorrect++;
      else failures.push(`${fx.name}: segment_count ${(ex.segments || []).length} > max ${want.segment_count_max}`);
    }
    if (want.target_price !== undefined) check('target_price', ex.target_price == null ? null : ex.target_price, want.target_price);
    if (want.decision_deadline !== undefined) check('decision_deadline', ex.decision_deadline == null ? null : ex.decision_deadline, want.decision_deadline);
    if (want.constraint_types) {
      check('constraint_types', (ex.constraints || []).map((c) => c.type).slice(0, want.constraint_types.length), want.constraint_types);
    }
    if (want.constraint_datetimes) {
      const got = (ex.constraints || []).map((c) => c.datetime);
      want.constraint_datetimes.forEach((dt) => {
        fieldsChecked++;
        if (got.includes(dt)) fieldsCorrect++;
        else failures.push(`${fx.name}: constraint datetime ${dt} not found in ${JSON.stringify(got)}`);
      });
    }
    if (want.companion_labels) {
      const got = (ex.companions || []).map((c) => String(c.label).toLowerCase());
      want.companion_labels.forEach((lbl) => {
        fieldsChecked++;
        if (got.includes(lbl)) fieldsCorrect++;
        else failures.push(`${fx.name}: companion "${lbl}" not found in ${JSON.stringify(got)}`);
      });
    }
    if (want.companion_status) {
      Object.keys(want.companion_status).forEach((lbl) => {
        const c = (ex.companions || []).filter((x) => String(x.label).toLowerCase() === lbl)[0];
        check(`companion[${lbl}].status`, c ? c.status : null, want.companion_status[lbl]);
      });
    }
    if (want.companion_count != null) check('companion_count', (ex.companions || []).length, want.companion_count);
    if (want.missing_includes) {
      want.missing_includes.forEach((mf) => {
        fieldsChecked++;
        if ((ex.missing_fields || []).includes(mf)) fieldsCorrect++;
        else failures.push(`${fx.name}: missing_fields lacks ${mf} — got ${JSON.stringify(ex.missing_fields)}`);
      });
    }
    if (want.conflict_reasons) {
      const got = (ex.conflicts || []).map((c) => c.reason);
      want.conflict_reasons.forEach((r) => {
        fieldsChecked++;
        if (got.includes(r)) fieldsCorrect++;
        else failures.push(`${fx.name}: conflict reason ${r} not found in ${JSON.stringify(got)}`);
      });
    }
    if (want.conflict_values) {
      const got = [].concat.apply([], (ex.conflicts || []).map((c) => c.values || []));
      want.conflict_values.forEach((val) => {
        fieldsChecked++;
        if (got.includes(val)) fieldsCorrect++;
        else failures.push(`${fx.name}: conflict option ${val} not offered — got ${JSON.stringify(got)}`);
      });
    }
  }

  const acc = fieldsChecked ? fieldsCorrect / fieldsChecked : 0;
  if (invented === 0) ok(`${f}: parser invented nothing across ${FIXTURES.parser.length} fixtures`);
  else bad(`${f}: parser INVENTED values in ${invented} case(s) — hard failure`);

  if (dishonest === 0) ok(`${f}: every source_text quotes the input verbatim`);
  else bad(`${f}: ${dishonest} value(s) carried source_text absent from the input`);

  if (acc >= 0.9) ok(`${f}: field accuracy ${(acc * 100).toFixed(1)}% (${fieldsCorrect}/${fieldsChecked}) — gate is 90%`);
  else bad(`${f}: field accuracy ${(acc * 100).toFixed(1)}% (${fieldsCorrect}/${fieldsChecked}) — below the 90% gate`);

  if (failures.length) {
    console.log(`  ··  ${f}: ${failures.length} fixture detail(s):`);
    failures.slice(0, 14).forEach((m) => console.log('       - ' + m));
    if (failures.length > 14) console.log(`       … and ${failures.length - 14} more`);
  }
}

// ---- 2. merge contract -----------------------------------------------------
for (const f of FILES) {
  const api = loaded[f];
  if (!api) { bad(`${f}: merge fixtures skipped — file failed to load`); continue; }
  const NOW = '2026-08-02T12:00:00.000Z';

  for (const fx of FIXTURES.merge) {
    let facts = [];
    let lastId = null;
    let n = 0;
    try {
      for (const step of fx.steps) {
        if (step.propose || step.confirm) {
          const spec = step.propose || step.confirm;
          n++;
          const nf = {
            id: `fact-${fx.trip_id}-${n}`,
            trip_id: fx.trip_id,
            context_event_id: `ce-${n}`,
            field_path: spec.field_path,
            value: spec.value,
            status: 'proposed',
            confidence: 0.9,
            source_text: '',
            is_inferred: false,
            created_at: NOW,
            resolved_at: '',
          };
          facts = api.applyParsedFacts(facts, [nf]).facts;
          lastId = nf.id;
          if (step.confirm) facts = api.setFactStatus(facts, nf.id, 'confirmed', NOW);
        } else if (step.confirm_last) {
          facts = api.setFactStatus(facts, lastId, 'confirmed', NOW);
        } else if (step.reject_last) {
          facts = api.setFactStatus(facts, lastId, 'rejected', NOW);
        }
      }
      const state = api.rebuildTripState(fx.trip_id, facts, null, NOW);
      const want = fx.expect || {};
      const label = `${f}: merge — ${fx.name}`;

      if (want.confirmed_values) {
        let good = true;
        Object.keys(want.confirmed_values).forEach((p) => {
          const hit = facts.filter((x) => x.field_path === p && x.status === 'confirmed')[0];
          const got = hit ? hit.value : null;
          if (JSON.stringify(got) !== JSON.stringify(want.confirmed_values[p])) {
            good = false;
            bad(`${label} — confirmed ${p} expected ${JSON.stringify(want.confirmed_values[p])} got ${JSON.stringify(got)}`);
          }
        });
        if (good) ok(`${label} — confirmed values correct`);
      }
      if (want.conflicted_paths) {
        const got = facts.filter((x) => x.status === 'conflicted').map((x) => x.field_path);
        const uniq = got.filter((v, i) => got.indexOf(v) === i).sort();
        const exp = want.conflicted_paths.slice().sort();
        if (JSON.stringify(uniq) === JSON.stringify(exp)) ok(`${label} — conflicts: ${exp.length ? exp.join(',') : 'none'}`);
        else bad(`${label} — conflicted paths expected ${JSON.stringify(exp)} got ${JSON.stringify(uniq)}`);
      }
      if (want.state_unresolved) {
        const exp = want.state_unresolved.slice().sort();
        const got = (state.unresolved_conflicts || []).slice().sort();
        if (JSON.stringify(got) === JSON.stringify(exp)) ok(`${label} — TripState.unresolved_conflicts correct`);
        else bad(`${label} — unresolved expected ${JSON.stringify(exp)} got ${JSON.stringify(got)}`);
      }
      if (want.status_counts) {
        Object.keys(want.status_counts).forEach((st) => {
          const got = facts.filter((x) => x.status === st).length;
          if (got === want.status_counts[st]) ok(`${label} — ${want.status_counts[st]} ${st} fact(s) retained`);
          else bad(`${label} — expected ${want.status_counts[st]} ${st}, got ${got}`);
        });
      }
      if (want.state_segments) {
        let good = true;
        want.state_segments.forEach((ws, i) => {
          const got = (state.segments || [])[i] || {};
          Object.keys(ws).forEach((k) => {
            if (JSON.stringify(got[k] == null ? null : got[k]) !== JSON.stringify(ws[k])) {
              good = false;
              bad(`${label} — state segments[${i}].${k} expected ${JSON.stringify(ws[k])} got ${JSON.stringify(got[k])}`);
            }
          });
        });
        if (good) ok(`${label} — TripState built from confirmed facts only`);
      }
      if (want.state_missing_includes) {
        const miss = state.missing_required_fields || [];
        const absent = want.state_missing_includes.filter((m) => !miss.includes(m));
        if (!absent.length) ok(`${label} — missing_required_fields flags ${want.state_missing_includes.join(', ')}`);
        else bad(`${label} — missing_required_fields lacks ${absent.join(', ')} (got ${JSON.stringify(miss)})`);
      }
    } catch (e) {
      bad(`${f}: merge — ${fx.name} threw ${e && e.message ? e.message : String(e)}`);
    }
  }
}

// ---- 3. notes migration ----------------------------------------------------
for (const f of FILES) {
  const api = loaded[f];
  if (!api) { bad(`${f}: migration fixtures skipped — file failed to load`); continue; }
  const NOW = '2026-08-02T12:00:00.000Z';

  for (const fx of FIXTURES.migration) {
    try {
      const before = JSON.parse(JSON.stringify(fx.watchlist));
      let res = api.migrateNotesToContextEvents(fx.watchlist, [], NOW);
      const gotIds = res.events.map((e) => e.trip_id).sort();
      const expIds = (fx.expect.created_trip_ids || []).slice().sort();
      const label = `${f}: migration — ${fx.name}`;

      if (JSON.stringify(gotIds) === JSON.stringify(expIds)) ok(`${label} — events created for ${expIds.join(', ') || 'nothing'}`);
      else bad(`${label} — expected events for ${JSON.stringify(expIds)} got ${JSON.stringify(gotIds)}`);

      // The whole promise of this feature: migrating must not touch the note.
      if (JSON.stringify(fx.watchlist) === JSON.stringify(before)) ok(`${label} — original notes left untouched`);
      else bad(`${label} — migration MUTATED the watchlist items`);

      if (fx.run_twice) {
        const second = api.migrateNotesToContextEvents(fx.watchlist, res.events, NOW);
        if (second.changed === false && second.events.length === res.events.length) {
          ok(`${label} — second run is a no-op (idempotent)`);
        } else {
          bad(`${label} — second run created ${second.events.length - res.events.length} duplicate event(s)`);
        }
      }
    } catch (e) {
      bad(`${f}: migration — ${fx.name} threw ${e && e.message ? e.message : String(e)}`);
    }
  }
}

// ---- 4. sanitizers reject hostile / malformed input -------------------------
for (const f of FILES) {
  const api = loaded[f];
  if (!api) continue;
  const cases = [
    ['sanitizeContextEvent', () => api.sanitizeContextEvent({ id: 'a"onload=x', trip_id: 'peru', raw_text: 'x' }), null, 'id outside the charset is rejected'],
    ['sanitizeParsedFact', () => api.sanitizeParsedFact({ id: 'f1', trip_id: '../../etc', field_path: 'x' }), null, 'trip_id outside the charset is rejected'],
    ['sanitizeTripState', () => api.sanitizeTripState({ trip_id: 'ok', segments: [{ origin: '"><img>' }] }), 'obj', 'bad segment code is nulled, not passed through'],
  ];
  for (const [name, run, mode, desc] of cases) {
    let got;
    try { got = run(); } catch (e) { bad(`${f}: ${name} threw on hostile input — ${e.message}`); continue; }
    if (mode === null) {
      if (got === null) ok(`${f}: ${name} — ${desc}`);
      else bad(`${f}: ${name} — ${desc}: expected null, got ${JSON.stringify(got)}`);
    } else {
      if (got && got.segments && got.segments[0] && got.segments[0].origin === null) ok(`${f}: ${name} — ${desc}`);
      else bad(`${f}: ${name} — ${desc}: got ${JSON.stringify(got && got.segments)}`);
    }
  }
  // Truncation guard: an oversized note must not be stored whole.
  const big = api.createContextEvent('peru', 'x'.repeat(9000), '2026-08-02T00:00:00Z');
  if (big.raw_text.length <= 4000) ok(`${f}: createContextEvent truncates oversized notes (${big.raw_text.length} chars)`);
  else bad(`${f}: createContextEvent stored ${big.raw_text.length} chars — cap not applied`);
}

// ---- 4b. /extract response classification (PIA-048) ------------------------
// This function decides what the user is told when extraction does not work.
// Getting it wrong in the "fallback" direction nags people about something they
// cannot fix; getting it wrong in the "failed" direction hides a real
// misconfiguration behind silently degraded results.
for (const f of FILES) {
  const api = loaded[f];
  if (!api) continue;
  const cases = [
    [200, '{"ok":true}', 'ok', 'a good response is usable'],
    [404, '', 'fallback', 'old Worker without the route degrades quietly'],
    [405, '', 'fallback', 'method not allowed degrades quietly'],
    [501, '{"code":"no_key"}', 'fallback', 'unconfigured Worker degrades quietly'],
    [502, '{"code":"bad_json"}', 'fallback', 'unusable model output degrades quietly'],
    [502, '{"code":"upstream"}', 'fallback', 'upstream trouble degrades quietly'],
    [0, '', 'fallback', 'offline degrades quietly'],
    [429, '{"code":"rate_limit"}', 'retry', 'rate limit is retryable'],
    [504, '{"code":"timeout"}', 'retry', 'timeout is retryable'],
    [401, '{"code":"bad_key"}', 'failed', 'a rejected API key IS surfaced'],
    [403, '{"code":"bad_key"}', 'failed', 'a forbidden API key IS surfaced'],
    [200, 'not json at all', 'ok', 'status wins over an unparseable body'],
  ];
  let allGood = true;
  for (const [status, body, want, desc] of cases) {
    const got = api.classifyExtractResponse(status, body);
    if (got !== want) { allGood = false; bad(`${f}: classify(${status}) — ${desc}: expected ${want}, got ${got}`); }
  }
  if (allGood) ok(`${f}: /extract classification correct for all ${cases.length} response shapes`);
}

// ---- 4c. decision engine (PIA-049) -----------------------------------------
// The engine is what a user actually acts on, so its priority ORDER is the
// thing under test: a blocked itinerary or an unsettled contradiction must
// outrank any price, however good. A cheap fare for a trip that misses a paid
// trek is not a buy signal.
for (const f of FILES) {
  const api = loaded[f];
  if (!api) { bad(`${f}: decision fixtures skipped — file failed to load`); continue; }

  for (const fx of FIXTURES.decision) {
    const label = `${f}: decision — ${fx.name}`;
    let rec;
    try { rec = api.computeRecommendation(fx.trip_state, fx.fare_snapshot, fx.now); }
    catch (e) { bad(`${label} — threw ${e && e.message}`); continue; }
    const want = fx.expect || {};

    if (rec.state === want.state) ok(`${label} — ${rec.state}`);
    else bad(`${label} — expected ${want.state}, got ${rec.state} ("${rec.headline}")`);

    if (want.blocking_kind !== undefined) {
      const got = rec.blocking_conflict ? rec.blocking_conflict.kind : null;
      if (got === want.blocking_kind) ok(`${label} — blocking_conflict ${got === null ? 'absent' : got}`);
      else bad(`${label} — blocking kind expected ${want.blocking_kind}, got ${got}`);
    }
    if (want.next_action_contains) {
      if (String(rec.next_action).includes(want.next_action_contains)) ok(`${label} — next action names "${want.next_action_contains}"`);
      else bad(`${label} — next action missing "${want.next_action_contains}": "${rec.next_action}"`);
    }
    // Structural invariants that hold for EVERY recommendation.
    if (!Array.isArray(rec.evidence) || rec.evidence.length > 3) bad(`${label} — evidence must be an array of <=3, got ${JSON.stringify(rec.evidence)}`);
    if (want.evidence_min != null && rec.evidence.length < want.evidence_min) bad(`${label} — expected >=${want.evidence_min} evidence, got ${rec.evidence.length}`);
    if (!rec.next_action) bad(`${label} — every recommendation must carry a next action`);
    if (rec.trip_state_version !== (fx.trip_state.version || 0)) bad(`${label} — recommendation must record the trip_state_version it saw`);
    if (rec.generated_at !== fx.now) bad(`${label} — generated_at must be the injected now, got ${rec.generated_at}`);

    // Determinism: same inputs, same output, twice. The engine must not read
    // the clock or anything else ambient.
    const again = api.computeRecommendation(fx.trip_state, fx.fare_snapshot, fx.now);
    if (JSON.stringify(again) === JSON.stringify(rec)) ok(`${label} — deterministic across repeated calls`);
    else bad(`${label} — NOT deterministic; second call differed`);

    if (want.handoff_url_null != null) {
      const url = api.buildHandoffUrl(fx.trip_state);
      if (want.handoff_url_null && url === null) ok(`${label} — booking CTA correctly disabled`);
      else if (!want.handoff_url_null && url) ok(`${label} — booking CTA available`);
      else bad(`${label} — handoff url expected ${want.handoff_url_null ? 'null' : 'a url'}, got ${JSON.stringify(url)}`);
    }
  }

  // typicalRangeFor: refuses to invent a "typical" from too little data.
  if (api.typicalRangeFor([]) === null && api.typicalRangeFor([{ price: 1 }, { price: 2 }]) === null) {
    ok(`${f}: typicalRangeFor returns null below 3 data points`);
  } else bad(`${f}: typicalRangeFor should be null under 3 points`);
  const tr = api.typicalRangeFor([{ price: 100 }, { price: 200 }, { price: 300 }, { price: 400 }, { price: 500 }]);
  if (tr && tr.low === 200 && tr.median === 300 && tr.high === 400 && tr.n === 5) ok(`${f}: typicalRangeFor quartiles correct`);
  else bad(`${f}: typicalRangeFor quartiles wrong — ${JSON.stringify(tr)}`);
}

// ---- 4d. handoff URL (PIA-049) ---------------------------------------------
// The review line and the URL must describe the SAME search. If they can
// disagree, the review step is theatre and the user is confirming a fiction.
for (const f of FILES) {
  const api = loaded[f];
  if (!api) { bad(`${f}: handoff fixtures skipped — file failed to load`); continue; }
  for (const fx of FIXTURES.handoff) {
    const label = `${f}: handoff — ${fx.name}`;
    const url = api.buildHandoffUrl(fx.trip_state);
    if (fx.expect_url === null) {
      if (url === null) ok(`${label} — no url, CTA disabled`);
      else bad(`${label} — expected null, got ${url}`);
      continue;
    }
    if (url === fx.expect_url) ok(`${label} — url matches exactly`);
    else bad(`${label} — url mismatch\n       want ${fx.expect_url}\n       got  ${url}`);

    if (fx.expect_review) {
      const line = api.buildReviewLine(fx.trip_state);
      if (line === fx.expect_review) ok(`${label} — review line matches`);
      else bad(`${label} — review line mismatch\n       want ${fx.expect_review}\n       got  ${line}`);
      // Cross-check: every airport + date in the review line must appear in
      // the decoded URL, so the two can never drift apart silently.
      const decoded = decodeURIComponent(url);
      const tokens = (line.match(/\b[A-Z]{3}\b/g) || []);
      const missing = tokens.filter((t) => !decoded.includes(t));
      if (!missing.length) ok(`${label} — review line and url agree on airports`);
      else bad(`${label} — review names ${missing.join(',')} but the url does not`);
    }
  }
  // An open jaw must never be readable as a round trip.
  const oj = [{ origin: 'LAX', destination: 'CUZ', departure_date: '2026-09-04' }, { origin: 'LIM', destination: 'LAX', departure_date: '2026-09-13' }];
  const rt = [{ origin: 'LAX', destination: 'ORD', departure_date: '2026-09-17' }, { origin: 'ORD', destination: 'LAX', departure_date: '2026-09-20' }];
  if (api.taIsRoundTrip(oj) === false && api.taIsRoundTrip(rt) === true) ok(`${f}: open jaw vs round trip distinguished structurally`);
  else bad(`${f}: taIsRoundTrip misclassified`);
}

// ---- 5. parity -------------------------------------------------------------
if (loaded[FILES[0]] && loaded[FILES[1]]) {
  const a = loaded[FILES[0]], b = loaded[FILES[1]];
  const drift = EXPECT.filter((n) => typeof a[n] === 'function' && String(a[n]) !== String(b[n]));
  if (!drift.length) ok('parity — all assistant functions byte-identical across desktop + mobile');
  else bad('parity — drifted: ' + drift.join(', '));
}

console.log('');
if (failCount > 0) {
  console.log(failCount + ' failing, ' + passCount + ' passing');
  process.exit(1);
} else {
  console.log('all ' + passCount + ' checks passing');
  process.exit(0);
}

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

'use strict';
// test-trust.js — PIA-117. The release gate for the trust tickets (PIA-114..116).
// Adversarial checks on observable outcomes only, against worker.js running in
// process with a counting fetch stub, a KV mock whose reads can be held at a
// barrier (so racing writers interleave deterministically), and an in-memory
// Durable Object namespace that runs the real IdeaRoom class.
//
//   A1  unauthorized requests spend nothing — every paid route, without the
//       organizer token (or with a wrong one, a spoofed Origin, a cache-busting
//       or unknown parameter, an unknown path) makes ZERO upstream calls; past
//       the daily cap, even the organizer spends nothing.
//   A2  simultaneous answers all survive — three family answers, an organizer
//       edit and a "booked" flag racing on one trip all land. The same race on
//       the old KV-only path is shown to lose data, so the check bites.
//   A3  cache hits keep their age without spending — the second identical
//       search is a HIT with the first fetch's X-Fetched-At and no upstream
//       call; the dashboards (both files) keep that age and don't count quota.

process.env.TZ = 'America/Los_Angeles';   // PIA-140: the app's local reset times (⛔ 17:00 = 00:00 UTC) are read in one zone
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] || process.cwd();
let passCount = 0, failCount = 0;
const ok = (m) => { console.log('  OK  ' + m); passCount++; };
const bad = (m) => { console.log('  XX  ' + m); failCount++; };
const check = (cond, m, detail) => (cond ? ok(m) : bad(m + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')));

const ORIGIN = 'https://shwinster101.github.io';
const TOKEN = 'trust-test-token-0123456789abcdef';
const SEARCH = 'engine=google_flights&departure_id=LAX&arrival_id=PIA&outbound_date=2026-11-20&type=2&currency=USD&hl=en';

// ── mocks ────────────────────────────────────────────────────────────────────
// Reads wait at a barrier while `gate.on`: they are released together once
// `gate.n` are waiting (or after 40ms), so N racing read-modify-writes all read
// the same old state — the worst case KV's eventual consistency allows.
function makeBarrier(gate) {
  let waiting = [];
  return async function barrier() {
    if (!gate.on) return;
    await new Promise((res) => {
      waiting.push(res);
      if (waiting.length >= gate.n) { const w = waiting; waiting = []; w.forEach((f) => f()); return; }
      setTimeout(() => { const i = waiting.indexOf(res); if (i >= 0) { waiting.splice(i, 1); res(); } }, 40);
    });
  };
}
function makeKv(gate) {
  const m = new Map();
  const barrier = makeBarrier(gate || { on: false });
  return {
    map: m,
    async get(k) { await barrier(); return m.has(k) ? m.get(k) : null; },
    async put(k, v) { await new Promise((r) => setImmediate(r)); m.set(k, String(v)); },
    async delete(k) { m.delete(k); },
  };
}
function makeStorage(gate) {
  const m = new Map();
  const barrier = makeBarrier(gate || { on: false });
  return {
    async get(k) { await barrier(); return m.has(k) ? structuredClone(m.get(k)) : undefined; },
    async put(k, v) { await new Promise((r) => setImmediate(r)); m.set(k, structuredClone(v)); },
    async deleteAll() { m.clear(); },
    async setAlarm() {},
  };
}
function makeRooms(IdeaRoom, env, gate) {
  const rooms = new Map();
  return {
    idFromName: (n) => 'room:' + n,
    get(id) {
      if (!rooms.has(id)) rooms.set(id, new IdeaRoom({ storage: makeStorage(gate) }, env));
      const room = rooms.get(id);
      return { fetch: (url, init) => room.fetch(new Request(url, init)) };
    },
  };
}

(async function main() {
  console.log('▶ test-trust: A1 unauthorized spends nothing · A2 racing answers survive · A3 cache hits keep age · B exact caps');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pialax-trust-'));
  const tmpFile = path.join(tmpDir, 'worker.mjs');
  fs.copyFileSync(path.join(ROOT, 'worker.js'), tmpFile);
  let mod;
  try { mod = await import('file://' + tmpFile); } catch (e) { bad('worker.js import failed — ' + e.message); return finish(tmpDir); }
  const worker = mod.default;
  check(typeof mod.IdeaRoom === 'function', 'worker.js exports the IdeaRoom Durable Object class');

  // Every upstream call (SerpAPI, Anthropic, Resend) goes through this counter.
  const upstream = [];
  let serpMode = 'ok';   // PIA-140: '429' makes SerpAPI itself refuse (its own rate limit / an exhausted plan)
  let acctLeft = null;   // PIA-140: SerpAPI's account says how many searches the plan has left (null: it says nothing)
  globalThis.fetch = async (url) => {
    upstream.push(String(url));
    if (/serpapi\.com\/account/.test(url)) return new Response(JSON.stringify(Object.assign({ this_month_usage: 7, api_key: 'LEAK', account_email: 'x@y' }, acctLeft === null ? {} : { total_searches_left: acctLeft, plan_searches_left: acctLeft })), { status: 200 });
    if (/serpapi\.com/.test(url) && serpMode === '429') return new Response('{"error":"Your account has run out of searches."}', { status: 429 });
    if (/serpapi\.com/.test(url)) return new Response(JSON.stringify({ best_flights: [{ price: 199, flights: [{ airline: 'AA', flight_number: 'AA 1' }] }] }), { status: 200 });
    if (/anthropic/.test(url)) return new Response('{"content":[]}', { status: 200 });
    return new Response('{"id":"email"}', { status: 200 });
  };
  const baseEnv = (over) => Object.assign({
    PROXY_TOKEN: TOKEN, SERPAPI_KEY: 'serp-key', ANTHROPIC_API_KEY: 'sk-ant', RESEND_API_KEY: 're-key',
    IDEAS: makeKv(), ALERTS: makeKv(),
  }, over || {});
  const hdrs = (h) => Object.assign({ 'Content-Type': 'application/json', Origin: ORIGIN }, h || {});
  const get = (env, p, h) => worker.fetch(new Request('https://w.dev' + p, { headers: hdrs(h) }), env);
  const post = (env, p, body, h) => worker.fetch(new Request('https://w.dev' + p, { method: 'POST', headers: hdrs(h), body: JSON.stringify(body) }), env);
  const json = async (res) => { try { return JSON.parse(await res.text()); } catch (e) { return null; } };
  const T = { 'X-Pialax-Token': TOKEN };

  // ── A1 ──────────────────────────────────────────────────────────────────────
  {
    const env = baseEnv();
    const extractBody = { today: '2026-10-04', tz: 'UTC', trip_state: null, context_event: { id: 'c1', raw_text: 'Fly LAX to PIA Nov 20' } };
    const alertBody = { to: 'me@example.com', event: { id: 'e1', trip_id: 't', type: 'test', subject: 's', body_text: 'b' } };
    const cases = [
      ['GET /search without a token', () => get(env, '/search?' + SEARCH), [401]],
      ['GET /search with a wrong token of the right length', () => get(env, '/search?' + SEARCH, { 'X-Pialax-Token': TOKEN.replace(/.$/, 'X') }), [401]],
      ['GET /search with a short token prefix', () => get(env, '/search?' + SEARCH, { 'X-Pialax-Token': TOKEN.slice(0, 16) }), [401]],
      ['GET /search with the token in the query string instead of the header', () => get(env, '/search?' + SEARCH + '&token=' + TOKEN), [401, 400]],
      ['GET /search from a spoofed Origin, no token', () => get(env, '/search?' + SEARCH, { Origin: 'https://evil.example' }), [401]],
      ['GET / (legacy root) without a token', () => get(env, '/?' + SEARCH), [401]],
      ['GET /?action=account without a token', () => get(env, '/?action=account'), [401]],
      ['GET /account without a token', () => get(env, '/account'), [401]],
      ['POST /extract without a token', () => post(env, '/extract', extractBody), [401]],
      ['POST /alert without a token', () => post(env, '/alert', alertBody), [401]],
      ['POST /alerts/sync without a token', () => post(env, '/alerts/sync', { email: 'me@example.com', watches: [] }), [401]],
      ['GET /alerts/status without a token (PIA-130)', () => get(env, '/alerts/status'), [401]],
      ['organizer token + no_cache=true (cache bypass)', () => get(env, '/search?' + SEARCH + '&no_cache=true', T), [400]],
      ['organizer token + random cache-buster param', () => get(env, '/search?' + SEARCH + '&x=' + Date.now(), T), [400]],
      ['organizer token + duplicated param', () => get(env, '/search?' + SEARCH + '&arrival_id=ORD', T), [400]],
      ['organizer token + a non-flights engine', () => get(env, '/search?' + SEARCH.replace('google_flights', 'google'), T), [400]],
      ['organizer token + lowercase / injected airport', () => get(env, '/search?' + SEARCH.replace('LAX', 'lax%26api_key%3Dx'), T), [400]],
      // PIA-122: comma-joined airports are allowed, but only 1–5 clean IATA codes.
      ['organizer token + 6 comma-joined airports', () => get(env, '/search?' + SEARCH.replace('LAX', 'LAX%2CBUR%2CLGB%2CSNA%2CONT%2CSAN'), T), [400]],
      ['organizer token + trailing comma in an airport list', () => get(env, '/search?' + SEARCH.replace('LAX', 'LAX%2C'), T), [400]],
      ['organizer token + lowercase code in an airport list', () => get(env, '/search?' + SEARCH.replace('LAX', 'lax%2CBUR'), T), [400]],
      ['organizer token + unknown GET path', () => get(env, '/whatever?' + SEARCH, T), [404]],
    ];
    for (const [label, run, want] of cases) {
      const before = upstream.length;
      const res = await run();
      const spent = upstream.length - before;
      check(want.includes(res.status) && spent === 0, `A1 ${label} → ${res.status}, 0 upstream calls`, `got ${res.status}, ${spent} call(s)`);
    }
    const noSecret = baseEnv({ PROXY_TOKEN: undefined });
    let before = upstream.length;
    let res = await get(noSecret, '/search?' + SEARCH, T);
    check(res.status === 401 && upstream.length === before, 'A1 Worker without a PROXY_TOKEN secret refuses every paid call (fails closed)', `got ${res.status}`);

    before = upstream.length;
    res = await get(env, '/account', T);
    const acct = await json(res);
    check(res.status === 200 && upstream.length - before === 1 && acct && acct.this_month_usage === 7 && !('api_key' in acct) && !('account_email' in acct),
      'A1 /account with the token returns quota numbers only (no key, no email)', JSON.stringify(acct));

    before = upstream.length;
    res = await get(env, '/search?' + SEARCH, T);
    const sent = upstream.slice(before);
    check(res.status === 200 && sent.length === 1 && /api_key=serp-key/.test(sent[0]) && !/no_cache|token/.test(sent[0]),
      'A1 organizer token on a cache miss → exactly 1 SerpAPI call, canonical params only', sent.join(' | '));

    const capped = baseEnv({ SERP_DAILY_CAP: '2', EXTRACT_DAILY_CAP: '1' });
    const dates = ['2026-11-20', '2026-11-21', '2026-11-22'];
    const statuses = []; before = upstream.length;
    for (const d of dates) statuses.push((await get(capped, '/search?' + SEARCH.replace('2026-11-20', d), T)).status);
    check(statuses.join() === '200,200,429' && upstream.length - before === 2, 'A1 past SERP_DAILY_CAP the organizer gets 429 and spends nothing', statuses.join() + ' · calls ' + (upstream.length - before));
    before = upstream.length;
    const ex = [(await post(capped, '/extract', extractBody, T)).status, (await post(capped, '/extract', extractBody, T)).status];
    check(ex[1] === 429 && upstream.length - before === 1, 'A1 past EXTRACT_DAILY_CAP /extract gets 429 and spends nothing', ex.join() + ' · calls ' + (upstream.length - before));
  }

  // ── A2 ──────────────────────────────────────────────────────────────────────
  const IDEA = {
    title: 'Thanksgiving race test', destination: { city: 'Peoria', airport: 'PIA' }, dates: { departure: '2026-11-20', return: '2026-11-29' },
    members: [{ code: 'PIA', label: 'Mom & Dad', airport: 'PIA', headcount: 2 }, { code: 'LAX', label: 'Me', airport: 'LAX', headcount: 1 },
      { code: 'LGA', label: 'Anjo', airport: 'LGA', headcount: 1 }, { code: 'JFK', label: 'Cousin', airport: 'JFK', headcount: 1 }],
  };
  async function race(serialized) {
    const gate = { on: false, n: 5 };
    const env = baseEnv({ IDEAS: makeKv(gate) });
    if (serialized) env.IDEA_ROOM = makeRooms(mod.IdeaRoom, env, gate);
    const made = await json(await post(env, '/idea', { idea: IDEA }));
    const id = made.id;
    await post(env, '/idea/respond?id=' + id, { member: 'LAX', status: 'in', available_from: '2026-11-20', available_to: '2026-11-29' });
    gate.on = true;   // from here every read is held until all five racers have read
    const results = await Promise.all([
      post(env, '/idea/respond?id=' + id, { member: 'PIA', status: 'in', available_from: '2026-11-20', available_to: '2026-11-29' }),
      post(env, '/idea/respond?id=' + id, { member: 'LGA', status: 'maybe', available_from: '2026-11-25', available_to: '2026-11-29' }),
      post(env, '/idea/respond?id=' + id, { member: 'JFK', status: 'out' }),
      post(env, '/idea/booked?id=' + id, { member: 'LAX', booked: true }),
      post(env, '/idea/update?id=' + id, { edit_key: made.edit_key, idea: Object.assign({}, IDEA, { title: 'Thanksgiving race test (edited)' }) }),
    ]);
    gate.on = false;
    const view = await json(await get(env, '/idea?id=' + id, { 'X-Idea-Key': made.edit_key }));
    return { made, statuses: results.map((r) => r.status), view, env, id };
  }
  {
    const { made, statuses, view } = await race(true);
    const d = view && view.doc, r = (d && d.responses) || {};
    check(made && made.serialized === true, 'A2 a Worker with the IDEA_ROOM binding reports serialized:true');
    check(statuses.every((s) => s === 200), 'A2 all five racing writes are accepted', statuses.join());
    check(r.PIA && r.PIA.status === 'in' && r.LGA && r.LGA.status === 'maybe' && r.JFK && r.JFK.status === 'out',
      'A2 three simultaneous family answers all survive', JSON.stringify(Object.keys(r)));
    check(r.LAX && r.LAX.status === 'in' && r.LAX.booked === true && r.LAX.available_from === '2026-11-20',
      'A2 a simultaneous "booked" keeps the rest of that answer', JSON.stringify(r.LAX));
    check(d && d.idea.title === 'Thanksgiving race test (edited)', 'A2 a simultaneous organizer edit lands without erasing any answer');
    check(view && view.serialized === true, 'A2 the read after the race is served by the room (serialized:true)');
  }
  {
    // Same race with the KV-only path: proves the barrier actually forces the
    // lost-update interleaving, i.e. that the check above can fail.
    const { view } = await race(false);
    const r = (view && view.doc && view.doc.responses) || {};
    const survived = ['PIA', 'LGA', 'JFK'].filter((k) => r[k]).length + (r.LAX && r.LAX.booked ? 1 : 0) + (view && view.doc && /edited/.test(view.doc.idea.title) ? 1 : 0);
    check(view && view.serialized === false && survived < 5, `A2 control: the old KV-only path loses ${5 - survived} of 5 racing writes (the test bites)`, 'survived ' + survived);
  }
  {
    // Lazy migration: a trip that exists only in KV (created before the room
    // existed) is picked up by the room on first touch and written through.
    const kvEnv = baseEnv();
    const made = await json(await post(kvEnv, '/idea', { idea: IDEA }));
    kvEnv.IDEA_ROOM = makeRooms(mod.IdeaRoom, kvEnv);
    const res = await json(await post(kvEnv, '/idea/respond?id=' + made.id, { member: 'PIA', status: 'in' }));
    const kvDoc = JSON.parse(kvEnv.IDEAS.map.get('idea:' + made.id));
    check(res && res.serialized === true && res.doc.idea.title === IDEA.title && kvDoc.responses.PIA && kvDoc.responses.PIA.status === 'in',
      'A2 an existing KV trip migrates into its room on first touch and writes back through to KV');
  }

  // ── A3 ──────────────────────────────────────────────────────────────────────
  {
    const env = baseEnv();
    const day = new Date().toISOString().slice(0, 10);
    const before = upstream.length;
    const r1 = await get(env, '/search?' + SEARCH, T);
    const b1 = await r1.text();
    await new Promise((r) => setTimeout(r, 25));
    const reordered = SEARCH.split('&').reverse().join('&');
    const r2 = await get(env, '/search?' + reordered, T);
    const b2 = await r2.text();
    const at1 = r1.headers.get('X-Fetched-At'), at2 = r2.headers.get('X-Fetched-At');
    check(r1.headers.get('X-Proxy-Cache') === 'MISS' && r2.headers.get('X-Proxy-Cache') === 'HIT', 'A3 second identical search (params reordered) is a cache HIT');
    check(upstream.length - before === 1, 'A3 two identical searches cost exactly 1 SerpAPI call', String(upstream.length - before));
    check(at1 && at1 === at2 && b1 === b2, 'A3 the HIT carries the original X-Fetched-At and body', at1 + ' vs ' + at2);
    check(env.IDEAS.map.get('quota:serp:' + day) === '1', 'A3 the server spend counter moved once, not twice', env.IDEAS.map.get('quota:serp:' + day));
    const r3 = await get(env, '/search?' + SEARCH);
    check(r3.status === 401, 'A3 a cache HIT still needs the token (no free reads of cached fares)');
    // PIA-122: one search covers home + nearby airports; the list is a set, so
    // any order is the same cache entry, and the upstream call is still one.
    const n0 = upstream.length;
    const m1 = await get(env, '/search?' + SEARCH.replace('LAX', 'LAX%2CBUR%2CSNA'), T);
    const m2 = await get(env, '/search?' + SEARCH.replace('LAX', 'SNA%2CLAX%2CBUR%2CLAX'), T);
    check(m1.status === 200 && m1.headers.get('X-Proxy-Cache') === 'MISS' && m2.headers.get('X-Proxy-Cache') === 'HIT' && upstream.length - n0 === 1 && /departure_id=BUR,LAX,SNA&/.test(upstream[upstream.length - 1]),
      'A3 nearby airports — LAX,BUR,SNA is one SerpAPI call; SNA,LAX,BUR,LAX is the same cache entry (HIT)', String(upstream.length - n0));
    const acct = await json(await get(env, '/account', T));
    check(acct && acct.features && acct.features.multi_airport === true, 'A3 /account announces multi-airport search (so old Workers never get a comma)');
  }
  // ── C (PIA-130): the alert cron spends like the dashboard ───────────────────
  // Same KV fare cache (a fare priced today costs 0), same daily serp/email
  // caps, and a traveler's legs together vs their own target → one email a day.
  {
    const cron = async (env) => { const waits = []; await worker.scheduled({}, env, { waitUntil: (p) => waits.push(p) }); await Promise.all(waits); return JSON.parse(await env.ALERTS.get('alerts:last_run')); };
    const serpCalls = () => upstream.filter((u) => /serpapi\.com\/search/.test(u)).length, mails = () => upstream.filter((u) => /resend/.test(u)).length;
    const leg = (id, from, to, dep, extra) => Object.assign({ trip_id: id, label: 'Ashwin · ' + from + '→' + to, from, to, dep, ret: null, threshold_pct: 10, remind_days: 0, baseline: null }, extra || {});
    {
      const env = baseEnv();
      const q = 'engine=google_flights&departure_id=LAX&arrival_id=PIA&outbound_date=2030-11-20&type=2&currency=USD&hl=en';
      await get(env, '/search?' + q, T); // the dashboard priced it today → KV fare cache
      await env.ALERTS.put('alerts:config', JSON.stringify({ email: 'me@example.com', watches: [leg('tg_LAX_in', 'LAX', 'PIA', '2030-11-20')] }));
      const s0 = serpCalls(), run = await cron(env);
      check(serpCalls() === s0 && run.cached === 1 && run.spent === 0, 'C1 the cron reads the KV fare cache — a fare priced today costs 0 searches', JSON.stringify(run));
    }
    {
      const env = baseEnv({ SERP_DAILY_CAP: '1' });
      await env.ALERTS.put('alerts:config', JSON.stringify({ email: 'me@example.com', watches: [leg('a1', 'LAX', 'PIA', '2030-11-21'), leg('a2', 'LAX', 'PIA', '2030-11-22'), leg('a3', 'LAX', 'PIA', '2030-11-23')] }));
      const s0 = serpCalls(), run = await cron(env);
      check(serpCalls() - s0 === 1 && run.spent === 1 && run.capped === true, 'C2 the cron stops at the daily serp cap (SERP_DAILY_CAP=1 → exactly 1 search, run marked capped)', JSON.stringify(run));
    }
    {
      const env = baseEnv();
      const g = { group: 'tg_LAX', target: 400, threshold_pct: 1 };
      await env.ALERTS.put('alerts:config', JSON.stringify({ email: 'me@example.com', watches: [leg('tg_LAX_in', 'LAX', 'PIA', '2030-11-20', g), leg('tg_LAX_home', 'ORD', 'LAX', '2030-11-29', g)] }));
      const m0 = mails();
      await cron(env); await cron(env);
      check(mails() - m0 === 1, 'C3 Ashwin in $199 + home $199 = $398 ≤ target $400 → one email, not one per leg, not one per run', String(mails() - m0));
      const st = await json(await get(env, '/alerts/status', T));
      check(st && st.ok && st.watches === 2, 'C4 /alerts/status still answers the organizer (token)', JSON.stringify(st));
    }
    // Review fixes: a group with a departed leg never alerts on the leg that's left;
    // the per-run ceiling counts real searches (cache hits and the rest still run);
    // the group sum never uses a price that wasn't fetched in this run.
    {
      const env = baseEnv();
      const g = { group: 'tg_LGA', target: 400, threshold_pct: 1 };
      await env.ALERTS.put('alerts:config', JSON.stringify({ email: 'me@example.com', watches: [leg('tg_LGA_in', 'LGA', 'PIA', '2020-11-26', g), leg('tg_LGA_home', 'ORD', 'LGA', '2030-11-30', g)] }));
      const m0 = mails();
      await cron(env);
      check(mails() - m0 === 0, 'C5 a traveler whose in-leg has departed gets no "at your target" email for the home leg alone', String(mails() - m0));
    }
    {
      const env = baseEnv({ ALERT_CRON_MAX: '1' });
      const dates = ['2030-12-01', '2030-12-02', '2030-12-03'];
      for (const d of dates) await get(env, '/search?engine=google_flights&departure_id=LAX&arrival_id=PIA&outbound_date=' + d + '&type=2&currency=USD&hl=en', T);
      await env.ALERTS.put('alerts:config', JSON.stringify({ email: 'me@example.com', watches: dates.map((d, i) => leg('w' + i, 'LAX', 'PIA', d)).concat([leg('w3', 'LAX', 'PIA', '2030-12-04'), leg('w4', 'LAX', 'PIA', '2030-12-05')]) }));
      const s0 = serpCalls(), run = await cron(env);
      check(run.checked === 5 && run.cached === 3 && run.spent === 1 && serpCalls() - s0 === 1, 'C6 ALERT_CRON_MAX=1 caps real searches only — 3 cached + 1 search, all 5 watches checked', JSON.stringify(run));
    }
    {
      const env = baseEnv({ SERP_DAILY_CAP: '1' });
      const g = { group: 'tg_LAX', target: 999, threshold_pct: 1 };
      const day = new Date().toISOString().slice(0, 10);
      await env.ALERTS.put('alerts:config', JSON.stringify({ email: 'me@example.com', watches: [leg('tg_LAX_in', 'LAX', 'PIA', '2030-12-10', g), leg('tg_LAX_home', 'ORD', 'LAX', '2030-12-12', g)] }));
      await env.ALERTS.put('alerts:state', JSON.stringify({ tg_LAX_home: { last_price: 100, last_checked: day } })); // seen today, not priced today
      const m0 = mails();
      await cron(env);
      check(mails() - m0 === 0, 'C7 the group sum never uses a price that was not fetched in this run (home leg capped)', String(mails() - m0));
    }
  }
  // ── B (PIA-118): exact caps under a parallel burst ──────────────────────────
  // KV reads are held at a barrier so all racers read the counter at once; the
  // SpendMeter Durable Object must still let exactly `cap` of them spend.
  async function burst(metered, kind, cap, n) {
    const gate = { on: true, n };
    const env = baseEnv({ IDEAS: makeKv(gate), SERP_DAILY_CAP: String(cap), EXTRACT_DAILY_CAP: String(cap) });
    if (metered) env.SPEND_METER = makeRooms(mod.SpendMeter, env);
    const before = upstream.length;
    const reqs = [];
    for (let i = 0; i < n; i++) {
      const d = '2027-02-' + String(i + 1).padStart(2, '0');   // all different → all cache misses
      reqs.push(kind === 'serp'
        ? get(env, '/search?' + SEARCH.replace('2026-11-20', d), T)
        : post(env, '/extract', { today: '2026-10-04', tz: 'UTC', trip_state: null, context_event: { id: 'c' + i, raw_text: 'Fly LAX to PIA on ' + d } }, T));
    }
    const statuses = (await Promise.all(reqs)).map((r) => r.status);
    gate.on = false;
    return { env, calls: upstream.length - before, capped: statuses.filter((s) => s === 429).length };
  }
  check(typeof mod.SpendMeter === 'function', 'B worker.js exports the SpendMeter Durable Object class');
  {
    const r = await burst(true, 'serp', 3, 10);
    check(r.calls === 3 && r.capped === 7, 'B1 10 parallel searches with SERP_DAILY_CAP=3 → exactly 3 SerpAPI calls, 7 × 429', `calls ${r.calls}, 429s ${r.capped}`);
    const acct = await json(await get(r.env, '/account', T));
    check(acct && acct.spend && acct.spend.exact === true && acct.spend.serp.used === 3 && acct.spend.serp.cap === 3,
      'B3 /account reports today\'s Worker spend from the meter (serp 3/3, exact:true)', JSON.stringify(acct && acct.spend));
  }
  {
    const r = await burst(true, 'extract', 1, 5);
    check(r.calls === 1 && r.capped === 4, 'B1 5 parallel /extract calls with EXTRACT_DAILY_CAP=1 → exactly 1 Anthropic call', `calls ${r.calls}, 429s ${r.capped}`);
  }
  {
    const r = await burst(false, 'serp', 3, 10);
    check(r.calls > 3, `B2 control: without the meter the same burst overshoots the cap (${r.calls} calls for a cap of 3 — the test bites)`, 'calls ' + r.calls);
    const acct = await json(await get(r.env, '/account', T));
    check(acct && acct.spend && acct.spend.exact === false, 'B3 without the meter /account says exact:false');
  }

  // Client side, both dashboards: fetchFlights runs for real in a sandbox with
  // a fetch that answers like a Worker cache HIT from five hours ago.
  for (const file of ['pialax.html', 'pialax-mobile.html']) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const fns = ['fareStamp', 'fetchFlights', 'freshnessLabel', '_freshPill', 'tripFareParse', 'fareAgeLabel'].map((n) => extractFn(html, n));
    if (fns.some((f) => !f)) { bad(`A3 ${file}: could not find fareStamp/fetchFlights/freshnessLabel/tripFareParse`); continue; }
    const fetchedAt = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
    const quota = { n: 0 };
    const ctx = {
      console: { warn() {}, log() {} }, Date, Math, JSON, Object, Promise, URLSearchParams, setTimeout, clearTimeout, isNaN, Number, String,
      PROXY_URL: 'https://w.dev', FLIGHT_CACHE_TTL_MS: 86400000, _flightCache: {}, _flightInflight: {}, _lastFetchError: null, _liveFetchErrorCount: 0,
      _cacheKey: (a, b, c, d) => [a, b, c, d].join('|'), isQuotaExceeded: () => false, isFetchLocked: () => false,
      findLockedTrip: () => null, AbortController, getMock: () => ({ mock: true }), fmtISO: (d) => d.toISOString().slice(0, 10), persistFlightCache() {}, markQuotaExceeded() {},
      bumpQuota: (n) => { quota.n += n; }, proxyToken: () => TOKEN, paidHeaders: () => ({ 'X-Pialax-Token': TOKEN }), noteMissingToken() {},
      fetch: async () => new Response(JSON.stringify({ best_flights: [{ price: 210, flights: [{ airline: 'UA' }] }] }), { status: 200, headers: { 'X-Proxy-Cache': 'HIT', 'X-Fetched-At': fetchedAt } }),
    };
    vm.createContext(ctx);
    vm.runInContext(fns.join('\n'), ctx);
    const data = await ctx.fetchFlights('LAX', 'PIA', '2026-11-20', null);
    const entry = ctx._flightCache['LAX|PIA|2026-11-20|'];
    const label = ctx.freshnessLabel(data, null).label;
    check(data.lastVerified === fetchedAt && data.cached === true, `A3 ${file}: a Worker HIT keeps lastVerified = X-Fetched-At (${label})`, data.lastVerified);
    check(quota.n === 0, `A3 ${file}: a Worker HIT does not move the SerpAPI quota or session counter`, 'bumpQuota ' + quota.n);
    check(entry && entry.ts === Date.parse(fetchedAt), `A3 ${file}: the client cache TTL runs from the original fetch time`);
    check(/CACHED 5h ago/.test(label), `A3 ${file}: the label reads "CACHED 5h ago", not LIVE`, label);
    // PIA-140: app.html writes a fare it searched into v1's cache exactly as this file's own fetchFlights caches it, so v1 on
    // the same phone reads the search app.html paid for (and app.html reads v1's back: fareFromV1)
    const TMv = require(path.resolve(ROOT, 'scripts', 'trip-model.js'));
    const sortK = (v) => (Array.isArray(v) ? v.map(sortK) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = sortK(v[k]); return o; }, {}) : v);
    const mine = TMv.v1Fare({ best_flights: [{ price: 210, flights: [{ airline: 'UA' }] }] }, Date.parse(fetchedAt), true, false);
    check(entry && JSON.stringify(sortK(entry)) === JSON.stringify(sortK(mine)) && TMv.fareFromV1(entry, null).p === 210 && TMv.fareFromV1(entry, null).f === Date.parse(fetchedAt),
      `A3 ${file}: app.html's v1Fare writes a fare exactly as this file's fetchFlights caches it (HIT kept as cached, its first fetch time), and reads it back as $210 fetched then`, { entry, mine });
    // PIA-121: the shared parser keeps the same headline price and adds the offers.
    check(entry && entry.data.ow === 210 && entry.data.airline === 'UA' && Array.isArray(entry.data.offers) && entry.data.offers[0].price === 210,
      `A3 ${file}: the cached fare keeps its price ($210, UA) and now carries its offers`);
    ctx.fetch = async () => new Response(JSON.stringify({ best_flights: [{ price: 220 }] }), { status: 200, headers: { 'X-Proxy-Cache': 'MISS', 'X-Fetched-At': new Date().toISOString() } });
    await ctx.fetchFlights('LAX', 'ORD', '2026-11-20', null);
    check(quota.n === 1, `A3 ${file}: a MISS (real SerpAPI call) counts exactly once`, 'bumpQuota ' + quota.n);
    // PIA-125: the Worker's own daily cap (429 daily_cap) locks only until tomorrow,
    // never the month; a SerpAPI 429 keeps the month lock.
    const marks = { day: 0, month: 0 };
    ctx.tripDailyCapMark = () => { marks.day++; }; ctx.markQuotaExceeded = () => { marks.month++; };
    ctx.fetch = async () => new Response(JSON.stringify({ error: 'Daily cap reached', code: 'daily_cap' }), { status: 429 });
    const capped = await ctx.fetchFlights('LAX', 'BUR', '2026-11-21', null);
    ctx.fetch = async () => new Response('{"error":"rate"}', { status: 429 });
    await ctx.fetchFlights('LAX', 'SNA', '2026-11-21', null);
    check(capped && capped.mock === true && marks.day === 1 && marks.month === 1, `A1 ${file}: a Worker daily_cap 429 locks today only (month untouched); a SerpAPI 429 still locks the month`, JSON.stringify(marks));
    let calls = 0;
    ctx.proxyToken = () => '';
    ctx.fetch = async () => { calls++; return new Response('{}'); };
    const noTok = await ctx.fetchFlights('LAX', 'JFK', '2026-11-20', null);
    check(calls === 0 && noTok && noTok.mock === true, `A1 ${file}: with no organizer token the dashboard never calls the Worker (sample fares)`);
  }

  // PIA-140: app.html's own spend path (it replaces PIA-134's "no /search at all" check). The app runs in-process
  // (scripts/harness.js) against the REAL worker.js above (its SerpAPI upstream is the counting stub), so the Worker's
  // token gate, fare cache, SpendMeter caps and 429s are the real ones:
  //   A1  no token → zero Worker paid calls (no /search, no /account), and no $ drawn; a guest holding the token, too
  //   A1  the organizer's tap: one /search per leg, the token in the X-Pialax-Token header only, ≤4 a tap, ≤8 a session
  //   A3  a cache HIT keeps the first fetch's time and moves no counter (v1's pialax_serpapi_quota, this session's count)
  //   A1  the Worker's day cap (429 daily_cap) locks only until the next UTC day; an upstream 429 locks the month
  await appSpendChecks();
  {
    const app = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
    check(!/['"`]\/(extract|alert)/.test(app) && (app.match(/X-Pialax-Token/g) || []).length === 1, 'A1 app.html: no /extract or /alert route; the token header is written in one place (paid)');
    const { loadApi, makeLocalStorage } = require(path.resolve(ROOT, 'scripts', 'harness.js'));
    const ls = makeLocalStorage();
    const ID = 'dwDiwaliRaleigh2026a01', KEY = 'pialax-test-edit-key-0123456789abcdefghijk';
    ls.setItem('pialax_proxy_token', TOKEN);
    ls.setItem('pialax_idea_keys_v1', JSON.stringify({ [ID]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' } }));
    ls.setItem('pialax_watchlist_v2', JSON.stringify([{ id: ID, t: '', e: '', at: 1, pin: false, arch: false }]));
    const sent = [];
    const spy = async (url, opts) => { sent.push({ url: String(url), opts: opts || {} }); return new Response(JSON.stringify({ error: 'nope', code: 'not_found' }), { status: 404 }); };
    const loc = { search: '?idea=' + ID, hash: '', pathname: '/PIALAX/app.html', origin: ORIGIN, href: ORIGIN + '/PIALAX/app.html?idea=' + ID, hostname: 'shwinster101.github.io' };
    const { api, missing } = loadApi(path.join(ROOT, 'app.html'), 'app.html', ['refreshAll', 'respond', 'organizerWrite', 'createTrip', 'poll'],
      { localStorage: ls, fetch: spy, location: loc, history: { replaceState() {}, pushState() {}, back() {}, state: null }, setInterval: () => ({ unref() {} }) });
    if (missing.length) bad('A1 app.html: harness could not reach ' + missing.join(', '));
    else {
      await api.refreshAll(); await api.poll();
      await api.organizerWrite(ID, { caption: 'x' });
      await api.createTrip({ emoji: '🎄', name: 'X', dest: { airport: 'PIA' }, dates: {}, members: [{ name: 'Ashwin', airport: 'LAX' }] });
      const paths = sent.map((s) => new URL(s.url).pathname);
      const leaks = sent.filter((s) => JSON.stringify([s.url, s.opts.headers || {}, s.opts.body || '']).indexOf(TOKEN) >= 0 || Object.keys(s.opts.headers || {}).some((h) => /pialax-token/i.test(h)));
      check(sent.length >= 3 && paths.every((p) => p === '/idea' || p.indexOf('/idea/') === 0) && sent.every((s) => s.url.indexOf('https://pialax-proxy.ashwinyedavalli.workers.dev/') === 0),
        `A1 app.html: on an organizer phone with the token, every request (${sent.length}) of an open, a poll, an edit and a create goes to the Worker's free /idea routes (no fare search without a tap)`, paths);
      check(leaks.length === 0, 'A1 app.html: the organizer token never leaves the phone in any URL, header or body', leaks.map((s) => s.url));
    }
    // PIA-136: the token and edit keys reach the clipboard only (the organizer's own devices), never a share sheet. Every
    // control that hands a link out is tapped on a phone that HAS a share sheet (recording each payload), so a secret link
    // sent to it is caught here, not hidden by a fallback to copying.
    const shares = [], copies = [];
    const ls2 = makeLocalStorage();
    ls2.setItem('pialax_proxy_token', TOKEN);
    ls2.setItem('pialax_idea_keys_v1', JSON.stringify({ [ID]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' } }));
    ls2.setItem('pialax_watchlist_v2', JSON.stringify([{ id: ID, t: '', e: '', at: 1, pin: false, arch: false }]));
    ls2.setItem('pialax_ui_v1', JSON.stringify({ v1read: 1 }));
    const nav = { userAgent: 'test-trust', share: (o) => { shares.push(o); return Promise.resolve(); }, clipboard: { writeText: (u) => { copies.push(u); return Promise.resolve(); } } };
    const loc2 = Object.assign({}, loc, { search: '', href: ORIGIN + '/PIALAX/app.html' });
    const two = loadApi(path.join(ROOT, 'app.html'), 'app.html', ['ACTS', 'openSheet', 'closeSheet', 'DOCS', 'STAT', 'S'],
      { localStorage: ls2, fetch: spy, location: loc2, navigator: nav, history: { replaceState() {}, pushState() {}, back() {}, state: null }, setInterval: () => ({ unref() {} }) });
    if (two.missing.length) bad('A1 app.html: harness could not reach ' + two.missing.join(', '));
    else {
      const a2 = two.api, tap = (name, ds) => a2.ACTS[name]({ dataset: ds || {} });
      a2.DOCS[ID] = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', 'idea-diwali.json'), 'utf8')); a2.STAT[ID] = 'ok';
      a2.openSheet('edit', { id: ID }); tap('ekey', { id: ID }); a2.closeSheet();       // ✎ → 🔑 the organizer link
      a2.openSheet('organizer', {}); tap('orglink', { id: ID }); tap('devlink'); a2.closeSheet();   // ⚙: the organizer and devices links
      tap('tshare', { id: ID });                                                         // the trip's 📣
      a2.openSheet('sharelist', {}); tap('slshare'); a2.closeSheet();                    // the list share
      a2.openSheet('person', { id: ID, code: 'anjo-z5' }); tap('nudge', { id: ID, code: 'anjo-z5' }); a2.closeSheet();   // PIA-137: 📣 one person (her hint)
      a2.openSheet('face', { id: ID }); tap('joinopen'); a2.S.sheet.local.jname = 'Nina Okafor'; a2.S.sheet.local.jap = 'BOS'; tap('joinshare', { id: ID });   // PIA-137: 🙋＋ a join request
      await new Promise((r) => setTimeout(r, 20));
      const secret = (o) => { const s = JSON.stringify(o); return s.indexOf(TOKEN) >= 0 || s.indexOf(KEY) >= 0 || /#k=|#ks=|[#&]t=/.test(s); };
      check(shares.length === 4 && shares.every((o) => !secret(o) && Object.keys(o).join() === 'url') && /#m=anjo-z5$/.test(shares[2].url) && /&add=Nina%20Okafor\.BOS$/.test(shares[3].url) && copies.filter(secret).length === 3,
        `A1 app.html: no share-sheet payload carries the token, an edit key, #k=, #ks= or &t= (${shares.length} shared, URL only: the trip and list links, PIA-137's nudge with its #m= hint and the join request; the organizer and devices links went to the clipboard only)`, { shares, copies: copies.length });
    }
  }
  // ── PIA-140: app.html's spend path against the real Worker ─────────────────
  async function appSpendChecks() {
    const { loadApi, makeLocalStorage } = require(path.resolve(ROOT, 'scripts', 'harness.js'));
    const TM = require(path.resolve(ROOT, 'scripts', 'trip-model.js'));
    const W = 'https://pialax-proxy.ashwinyedavalli.workers.dev';
    const ID = 'dwDiwaliRaleigh2026a01', KEY = 'pialax-test-edit-key-0123456789abcdefghijk';
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', 'idea-diwali.json'), 'utf8'));
    const hash = require('crypto').createHash('sha256').update(KEY).digest('hex');
    // one clock for the app AND the Worker (swapped in around each Worker call), so X-Fetched-At, the SpendMeter's UTC day and
    // the app's "now" agree, and moving it moves all three
    let CLOCK = Date.UTC(2026, 9, 17, 19, 0, 0);
    const RealDate = Date;
    class FixedDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(CLOCK); } static now() { return CLOCK; } }
    const spendEnv = (over) => {
      const env = baseEnv(over);
      env.SPEND_METER = makeRooms(mod.SpendMeter, env);
      env.IDEAS.map.set('idea:' + ID, JSON.stringify(Object.assign(JSON.parse(JSON.stringify(doc)), { edit_hash: hash })));
      return env;
    };
    // a phone: app.html in-process; every request it makes is recorded and answered by the real Worker. po.strip: the
    // /search replies reach the page without X-Proxy-Cache (an older deploy, a proxy, a dropped Access-Control-Expose-Headers)
    const phone = (env, seed, po) => {
      po = po || {};
      const ls = makeLocalStorage(), ss = makeLocalStorage(), log = [];
      Object.keys(seed).forEach((k) => ls.setItem(k, typeof seed[k] === 'string' ? seed[k] : JSON.stringify(seed[k])));
      const appFetch = async (url, opts) => {
        const u = String(url), o = opts || {};
        log.push({ url: u, path: new URL(u).pathname, headers: Object.assign({}, o.headers || {}), body: o.body || '' });
        if (u.indexOf(W + '/') !== 0) throw new Error('not the Worker: ' + u);
        const prev = globalThis.Date; globalThis.Date = FixedDate;
        let res;
        try { res = await worker.fetch(new Request(u, { method: o.method || 'GET', headers: Object.assign({ Origin: ORIGIN }, o.headers || {}), body: o.body }), env); }
        finally { globalThis.Date = prev; }
        if (!po.strip || new URL(u).pathname !== '/search') return res;
        const h = new Headers(res.headers); h.delete('X-Proxy-Cache');
        return new Response(await res.text(), { status: res.status, headers: h });
      };
      const loc = { search: '', hash: '', pathname: '/PIALAX/app.html', origin: ORIGIN, href: ORIGIN + '/PIALAX/app.html', hostname: 'shwinster101.github.io' };
      const { api, missing } = loadApi(path.join(ROOT, 'app.html'), 'app.html', ['S', 'ACTS', 'modelOf', 'refreshAll', 'runSearch', 'accountSync', 'lockNow', 'readQuota', 'readFares', 'spentRead', 'SHEETS', 'renderTrip', 'renderIdeas', 'render', 'openSheet', 'closeSheet', 'poll', 'onFocus'],
        { localStorage: ls, sessionStorage: ss, fetch: appFetch, location: loc, Date: FixedDate, history: { replaceState() {}, pushState() {}, back() {}, state: null }, setInterval: () => ({ unref() {} }),
          console: { log() {}, warn() {}, error() {}, info() {} } });
      return { api, missing, ls, ss, log, paid: () => log.filter((r) => r.path === '/search' || r.path === '/account') };
    };
    // deterministic waits (never a real timer): setImmediate ticks until the /account read a run starts (and does not await) is in
    const tick = (n) => new Promise((r) => { let i = 0; (function go() { if (i++ >= (n || 6)) return r(); setImmediate(go); })(); });
    const until = async (f, n) => { for (let i = 0; i < (n || 2000) && !f(); i++) await tick(2); return f(); };
    const settle = async (p) => { if (p) await until(() => !p.api.S.acctBusy); await tick(10); };
    const serpCalls = () => upstream.filter((u) => /serpapi\.com\/search/.test(u)).length;   // real searches (not the /account lookup)
    const quota = (p) => JSON.parse(p.ls.getItem('pialax_serpapi_quota') || 'null');
    // a tap with a cost (data-n 4) whatever is drawn: what the gates must refuse on their own
    const tap = (p, ds) => p.api.ACTS.search({ dataset: Object.assign({ n: '4' }, ds) });
    // a tap on the 🔍 as the app draws it now (P-total's, or one traveler's end in their sheet): its data-* are what the click hands on
    const drawn = (p, want) => {
      p.api.render();
      const h = want && want.code ? p.api.SHEETS.person({ type: 'person', p: { id: ID, code: want.code }, local: {}, back: null }) : p.api.SHEETS.total({ type: 'total', p: { id: ID }, local: {} });
      const re = /<button\b[^>]*\bdata-act="search"[^>]*>/g; let mm;
      while ((mm = re.exec(h))) {
        const o = {}; mm[0].replace(/\bdata-([a-z]+)="([^"]*)"/g, (_, k, v) => { o[k] = v; return ''; });
        if (want && want.code ? o.code === want.code && o.end === String(want.end) : o.v === 'total') return p.api.ACTS.search({ dataset: o });
      }
      return Promise.resolve('no control');
    };
    const today = () => { const d = new Date(CLOCK); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const mine = (p) => TM.spendable(p.api.modelOf(ID), p.api.readFares(), CLOCK, today());   // every search this trip may make
    const html = (p) => { const m = p.api.modelOf(ID); return p.api.renderTrip(ID).html + (m && m.prices ? p.api.SHEETS.total({ type: 'total', p: { id: ID }, local: {} }) : '') + p.api.renderIdeas().html; };
    const keyRec = { [ID]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' } }, list = [{ id: ID, t: '', e: '', at: 1, pin: false, arch: false }];
    const ORG = { pialax_proxy_token: TOKEN, pialax_idea_keys_v1: keyRec, pialax_watchlist_v2: list, pialax_idea_me_v1: { [ID]: 'ashwin-p8' }, pialax_ui_v1: { v1read: 1 } };

    // A1: no token → zero Worker paid calls (and no $), whatever is tapped; a guest holding the token, the same
    {
      const env = spendEnv(), u0 = upstream.length;
      const noTok = phone(env, { pialax_idea_keys_v1: keyRec, pialax_watchlist_v2: list, pialax_idea_me_v1: { [ID]: 'ashwin-p8' }, pialax_ui_v1: { v1read: 1 } });
      const guest = phone(env, { pialax_proxy_token: TOKEN, pialax_watchlist_v2: list, pialax_idea_me_v1: { [ID]: 'anjo-z5' }, pialax_ui_v1: { v1read: 1 } });
      const runs = [];
      for (const p of [noTok, guest]) {
        if (p.missing.length) { bad('A1 app.html: harness could not reach ' + p.missing.join(', ')); return; }
        await p.api.refreshAll(true);
        const keys = p.api.modelOf(ID).travelers.reduce((a, t) => a.concat(t.keys.map((k) => k.key)), []);
        await tap(p, { id: ID, v: 'total' }); await tap(p, { id: ID, code: 'ashwin-p8', end: '0' }); await drawn(p);
        p.api.ACTS.total({ dataset: { id: ID } }); p.api.ACTS.person({ dataset: { id: ID, code: 'ashwin-p8' } }); p.api.ACTS.settings({ dataset: {} });
        await p.api.runSearch(keys, { id: ID, n: 4 }); await p.api.runSearch(keys, { n: 4 }); await p.api.accountSync(true); await p.api.poll(); await settle(p);
        runs.push({ paid: p.paid().length, dollars: /\$\d|\$—|\$∅/.test(html(p)), keys: keys.length, ctl: /data-act="search"/.test(html(p)) });
      }
      check(runs.every((r) => r.paid === 0 && !r.dollars && !r.ctl && r.keys === 3) && upstream.length === u0,
        'A1 app.html: a phone without the token, and a guest holding the token, make ZERO Worker paid calls (no /search, no /account) whatever is tapped (🔍 with a cost, ±1, P-total, a person, ⚙, a search run, an /account sync), draw no 🔍 and no $', runs);
    }

    // A1 / A3: the organizer's tap, then a HIT on another phone
    {
      const env = spendEnv(), u0 = serpCalls();
      const a = phone(env, ORG);
      await a.api.refreshAll(true);
      const m = a.api.modelOf(ID), keys = m.price.search.slice();
      const before = a.paid().length;
      await a.api.runSearch([], { id: ID, n: 4 }); await a.api.runSearch(keys, { n: 4 }); await a.api.runSearch(keys, { id: ID });   // nothing asked, no trip named, no cost shown: nothing sent
      await a.api.poll(); a.api.onFocus(); a.api.render(); await settle(a);
      const idle = a.paid().length - before;
      await drawn(a);   // P-total's 🔍3, as drawn
      const q = quota(a);   // read before the /account sync that follows the run lands (SerpAPI's own count then replaces it)
      await settle(a);
      const sent = a.paid().filter((r) => r.path === '/search'), fa = a.api.readFares(), qs = quota(a);
      const ideaReqs = a.log.filter((r) => r.path.indexOf('/idea') === 0);
      check(idle === 0 && keys.length === 3 && sent.length === 3 && sent.every((r, i) => r.headers['X-Pialax-Token'] === TOKEN && r.url === W + '/search?' + TM.searchQuery(keys[i]) && r.url.indexOf(TOKEN) < 0 && !r.body) &&
        ideaReqs.length > 0 && ideaReqs.every((r) => !r.headers['X-Pialax-Token'] && JSON.stringify(r).indexOf(TOKEN) < 0) && serpCalls() - u0 === 3,
        'A1 app.html: nothing searches by itself (open, poll, focus, render: 0); the organizer\'s one tap sends one GET /search per leg (3, the model\'s own queries), the token only in its X-Pialax-Token header, never in a URL or body, never on /idea', { idle, sent: sent.map((r) => r.url) });
      check(q && q.used === 3 && q.exceeded === false && a.api.spentRead() === 3 && keys.every((k) => fa[k] && fa[k].p === 199 && fa[k].f === CLOCK) && a.paid().filter((r) => r.path === '/account').length === 1 && qs.used === 7,
        'A3 app.html: three MISSes move v1\'s month counter (pialax_serpapi_quota.used 3) and this session\'s count by 3, keep each fare with its fetch time; /account is read once after the run (SerpAPI\'s own count, 7, then stands)', { q, qs, spent: a.api.spentRead() });
      // another phone, two hours later, the same three searches: all Worker cache HITs
      CLOCK += 2 * 36e5;
      const b = phone(env, ORG);
      await b.api.refreshAll(true);
      const u1 = serpCalls();
      await drawn(b);
      const fb = b.api.readFares(), qb = quota(b);
      await settle(b);
      check(serpCalls() === u1 && b.paid().filter((r) => r.path === '/search').length === 3 && (!qb || qb.used === 0) && b.api.spentRead() === 0 &&
        keys.every((k) => fb[k] && fb[k].f === CLOCK - 2 * 36e5 && fb[k].p === 199),
        'A3 app.html: a cache HIT spends nothing (0 SerpAPI calls), moves no counter (month 0, session 0) and keeps the first fetch\'s time (2h old, not "just now")', { qb, spent: b.api.spentRead(), f: keys.map((k) => fb[k] && (CLOCK - fb[k].f) / 36e5) });
      CLOCK -= 2 * 36e5;
    }

    // A1: what one run may send. Only this trip's own legs (P-total's, each traveler's ±1 days and, PIA-141, the other candidate
    // weeks of the cheapest week: 24 here), never more than the
    // control showed (n), ≤4 a tap, ≤8 a visit; the visit's count fails closed, so a reply whose X-Proxy-Cache the page cannot
    // read (an older deploy, a proxy, a dropped expose list) still counts and the 9th search never goes
    for (const strip of [false, true]) {
      const env = spendEnv(), u0 = serpCalls(), c = phone(env, ORG, { strip });
      await c.api.refreshAll(true);
      const sN = () => c.paid().filter((r) => r.path === '/search').length;
      const many = ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10'].map((d) => TM.fareKey(2, ['LAX'], ['RDU'], d, '', 1));
      const s0 = sN();
      const r0 = await c.api.runSearch(many, { id: ID, n: 99 }); const n0 = sN() - s0;   // not this trip's legs
      const all = mine(c);
      const rn = await c.api.runSearch(all, { id: ID, n: 2 }); const nn = sN() - s0; await settle(c);   // the control showed 2
      const r1 = await c.api.runSearch(mine(c), { id: ID, n: 99 }); const n1 = sN() - s0; await settle(c);
      const r2 = await c.api.runSearch(mine(c), { id: ID, n: 99 }); const n2 = sN() - s0; await settle(c);
      const r3 = await c.api.runSearch(mine(c), { id: ID, n: 99 }); const n3 = sN() - s0;
      await tap(c, { id: ID, v: 'total' }); await settle(c); const n4 = sN() - s0;
      check(n0 === 0 && r0.asked === 0 && all.length === 24 && nn === 2 && n1 === 6 && n2 === 8 && n3 === 8 && n4 === 8 && r3.stop === 'session' && c.api.spentRead() === 8 && c.api.lockNow() === 'session' && serpCalls() - u0 === 8,
        'A1 app.html' + (strip ? ', X-Proxy-Cache unreadable' : '') + ': a run sends only this trip\'s own legs (10 others: 0), never more than its control showed (2), at most 4 a tap and 8 a visit' +
        (strip ? ' — the visit counts every reply that was not a readable HIT, so with the header gone it still stops at 8 (8 SerpAPI calls, never a 9th)' : ' (then the visit is locked: nothing more goes)'), { n0, nn, n1, n2, n3, n4, spent: c.api.spentRead(), all: all.length });
    }

    // A1, PIA-141: the cheapest week spends through the same gated path. A phone without the token (and a guest holding it) draws no
    // week and sends nothing whatever is tapped; on the organizer's phone one week's 🔍, as P-cheapest draws it, sends exactly that
    // week's legs (≤4, the model's own queries, the token in its header only); once the dates are 🔒 the same kind of keys are no
    // longer this trip's to search (0 sent)
    {
      const env = spendEnv(), u0 = serpCalls();
      const noTok = phone(env, { pialax_idea_keys_v1: keyRec, pialax_watchlist_v2: list, pialax_idea_me_v1: { [ID]: 'ashwin-p8' }, pialax_ui_v1: { v1read: 1 } });
      const guest = phone(env, { pialax_proxy_token: TOKEN, pialax_watchlist_v2: list, pialax_idea_me_v1: { [ID]: 'anjo-z5' }, pialax_ui_v1: { v1read: 1 } });
      const quiet = [];
      for (const p of [noTok, guest]) {
        await p.api.refreshAll(true);
        const wk = TM.cheapCandidates(TM.tripModel(env.IDEAS.map.has('idea:' + ID) ? JSON.parse(env.IDEAS.map.get('idea:' + ID)) : doc, { today: today(), now: CLOCK, me: 'ashwin-p8', hasEditKey: true, hasToken: true }), {}, CLOCK, today()).find((x) => !x.current);
        p.api.openSheet('cheap', { id: ID }); const h = p.api.SHEETS.cheap(p.api.S.sheet); p.api.closeSheet();
        await tap(p, { id: ID, v: 'week', day: wk.s }); await p.api.runSearch(wk.need, { id: ID, n: 4 }); await settle(p);
        quiet.push({ paid: p.paid().length, btn: /data-act="(search|cmove)"/.test(h), bars: /class="cbar/.test(h), dollars: /\$\d|\$—|\$∅/.test(h) });
      }
      const c = phone(env, ORG);
      await c.api.refreshAll(true);
      const sN = () => c.paid().filter((r) => r.path === '/search').length, s0 = sN();
      const wk = TM.cheapCandidates(c.api.modelOf(ID), c.api.readFares(), CLOCK, today()).find((x) => !x.current);
      c.api.openSheet('cheap', { id: ID }); c.api.S.sheet.local.sel = wk.s;
      const drawnBtn = (/<button\b[^>]*\bdata-act="search"[^>]*data-v="week"[^>]*>/.exec(c.api.SHEETS.cheap(c.api.S.sheet)) || [''])[0], ds = {};
      drawnBtn.replace(/\bdata-([a-z]+)="([^"]*)"/g, (_, k, v) => { ds[k] = v; return ''; });
      await c.api.ACTS.search({ dataset: ds }); await settle(c);
      const sent = c.paid().filter((r) => r.path === '/search').slice(s0);
      const lockedDoc = JSON.parse(env.IDEAS.map.get('idea:' + ID)); lockedDoc.decision = { stage: 'chosen', chosen: { airport: 'RDU', city: 'Raleigh', departure: '2026-11-06', return: '2026-11-09' }, chosen_at: '2026-10-16T00:00:00.000Z', estimate_total: null, actual_total: null, booked_at: null, delta_pct: null };
      env.IDEAS.map.set('idea:' + ID, JSON.stringify(lockedDoc));
      await c.api.refreshAll(true);
      const other = TM.cheapCandidates(TM.tripModel(lockedDoc, { today: today(), now: CLOCK, me: 'ashwin-p8', hasEditKey: true, hasToken: true }), c.api.readFares(), CLOCK, today()).find((x) => !x.current && x.s !== wk.s);
      const s1 = sN(); await c.api.runSearch(other.need, { id: ID, n: 4 }); await settle(c);
      check(quiet.every((q) => q.paid === 0 && !q.btn && !q.bars && !q.dollars) && ds.n === String(wk.need.length) && wk.need.length === 3 && sent.length === 3 &&
        sent.every((r, i) => r.headers['X-Pialax-Token'] === TOKEN && r.url === W + '/search?' + TM.searchQuery(wk.need[i]) && r.url.indexOf(TOKEN) < 0) && c.api.modelOf(ID).locked && other.need.length === 3 && sN() === s1 && serpCalls() - u0 === 3,
        'A1 app.html, PIA-141: the cheapest week spends only through the PIA-140 path: no token, or a guest holding one, draws no week, no $ and sends nothing; the organizer\'s drawn 🔍3 on one week sends exactly its 3 legs (the token in its header only); once the dates are 🔒 another week\'s legs are refused (0 sent)', { quiet, sent: sent.map((r) => r.url), n: ds.n });
    }

    // A1: the Worker's day cap (SERP_DAILY_CAP=1 here) → 429 daily_cap → locked until the next UTC day only; the month untouched
    {
      CLOCK = Date.UTC(2026, 9, 17, 19, 0, 0);
      const env = spendEnv({ SERP_DAILY_CAP: '1' }), u0 = serpCalls();
      const a = phone(env, ORG);
      await a.api.refreshAll(true);
      await drawn(a);
      const q = quota(a), cap = a.ls.getItem('pialax_daily_cap_v1');
      await settle(a);
      const sent1 = a.paid().filter((r) => r.path === '/search').length;
      await tap(a, { id: ID, v: 'total' }); await tap(a, { id: ID, code: 'ashwin-p8', end: '1' }); await drawn(a); await settle(a);
      const sent2 = a.paid().filter((r) => r.path === '/search').length;
      const lockTxt = a.api.SHEETS.total({ type: 'total', p: { id: ID }, local: {} });
      CLOCK = Date.UTC(2026, 9, 18, 0, 30, 0);   // 00:30 UTC: the Worker's next day (still 10/17, 17:30 in Los Angeles)
      const unlocked = a.api.lockNow();
      await drawn(a); await settle(a);
      const sent3 = a.paid().filter((r) => r.path === '/search').length;
      check(serpCalls() - u0 === 2 && sent1 === 2 && cap === '2026-10-17' && q.used === 1 && q.exceeded === false && sent2 === sent1 && /aria-label="Searches resume at 17:00"[^>]*>⛔ 17:00</.test(lockTxt) &&
        unlocked === '' && sent3 > sent2,
        'A1 app.html: the Worker\'s day cap (429 daily_cap) locks spending until the next UTC day only (pialax_daily_cap_v1 = 2026-10-17, the month untouched): every tap sends nothing, the button reads ⛔ 17:00 (local), and at 00:00 UTC it spends again', { sent1, sent2, sent3, cap, q, unlocked });
    }

    // A1: an upstream 429 (SerpAPI's own) → the month lock: every spend control locked, ⛔ 11/1, nothing sent, the next day too
    // while /account says nothing of the plan's searches left; one that says the plan has searches left lifts it (as v1's sync
    // does), but never the read right after the refusal (held 5 minutes); one with nothing left locks it again
    {
      CLOCK = Date.UTC(2026, 9, 17, 19, 0, 0);
      const env = spendEnv(), a = phone(env, ORG);
      const sN = () => a.paid().filter((r) => r.path === '/search').length, aN = () => a.paid().filter((r) => r.path === '/account').length;
      await a.api.refreshAll(true);
      acctLeft = 500;   // SerpAPI's account says the plan has searches left: the 429 was a passing limit
      serpMode = '429';
      await drawn(a);
      serpMode = 'ok';
      const q = quota(a);
      await settle(a);
      const held = a.api.lockNow(), sent1 = sN(), acc1 = aN();
      await tap(a, { id: ID, v: 'total' }); await tap(a, { id: ID, code: 'momdad-k3', end: '0' }); await settle(a);
      const acc2 = aN();
      acctLeft = null;
      CLOCK += 36e6;   // the next day: still locked (/account, read again by a tap on ⛔, says nothing of what is left)
      await tap(a, { id: ID, v: 'total' }); await settle(a);
      const sent2 = sN(), sheet = a.api.SHEETS.total({ type: 'total', p: { id: ID }, local: {} }), still = a.api.lockNow(), acc3 = aN();
      acctLeft = 500; CLOCK += 6 * 60000;
      await tap(a, { id: ID, v: 'total' }); await settle(a);   // a tap on ⛔: it explains, and reads /account (free, no search)
      const lifted = a.api.lockNow(), q2 = quota(a), sent3 = sN();
      await drawn(a); await settle(a);
      const sent4 = sN();
      acctLeft = 0; CLOCK += 6 * 60000; await a.api.accountSync(true); const relock = a.api.lockNow(), q3 = quota(a);
      acctLeft = null;
      check(sent1 === 1 && q.exceeded === true && q.used >= q.budget && held === 'month' && acc1 === 1 && acc2 === acc1 && a.ls.getItem('pialax_daily_cap_v1') === null && sent2 === sent1 && still === 'month' && acc3 === acc2 + 1 &&
        /data-lbl="SerpAPI refused" data-k="cap">⛔ 11\/1</.test(sheet) && lifted === '' && q2.exceeded === false && sent3 === sent2 && sent4 > sent3 && relock === 'month' && q3.exceeded === true,
        'A1 app.html: an upstream 429 locks the month (pialax_serpapi_quota.exceeded, v1\'s markQuotaExceeded) and says why (⛔ 11/1, "SerpAPI refused"): every spend control after it sends nothing, the /account read right after it does not lift it, nor the next day while /account says nothing of the plan; an /account that shows searches left lifts it (a free read, no search) and the next tap spends; one with nothing left locks it again', { sent1, sent2, sent3, sent4, held, still, lifted, relock, acc1, acc2, acc3 });
    }
    CLOCK = Date.UTC(2026, 9, 17, 19, 0, 0);
  }
  finish(tmpDir);
})().catch((e) => { bad('crashed: ' + (e && e.stack || e)); finish(); });

// Pull `function name(...) {...}` (or `async function`) out of an HTML file by
// brace matching, skipping string literals and comments.
function extractFn(src, name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) return null;
  let i = src.indexOf('{', m.index), depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(m.index, i + 1);
  }
  return null;
}

function finish(tmpDir) {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('');
  if (failCount) { console.log(failCount + ' failing, ' + passCount + ' passing'); process.exit(1); }
  console.log('all ' + passCount + ' checks passing');
  process.exit(0);
}

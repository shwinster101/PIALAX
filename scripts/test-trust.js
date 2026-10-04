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

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] || process.cwd();
let passCount = 0, failCount = 0;
const ok = (m) => { console.log('  OK  ' + m); passCount++; };
const bad = (m) => { console.log('  XX  ' + m); failCount++; };
const check = (cond, m, detail) => (cond ? ok(m) : bad(m + (detail ? ' — ' + detail : '')));

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
  console.log('▶ test-trust: A1 unauthorized spends nothing · A2 racing answers survive · A3 cache hits keep age');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pialax-trust-'));
  const tmpFile = path.join(tmpDir, 'worker.mjs');
  fs.copyFileSync(path.join(ROOT, 'worker.js'), tmpFile);
  let mod;
  try { mod = await import('file://' + tmpFile); } catch (e) { bad('worker.js import failed — ' + e.message); return finish(tmpDir); }
  const worker = mod.default;
  check(typeof mod.IdeaRoom === 'function', 'worker.js exports the IdeaRoom Durable Object class');

  // Every upstream call (SerpAPI, Anthropic, Resend) goes through this counter.
  const upstream = [];
  globalThis.fetch = async (url) => {
    upstream.push(String(url));
    if (/serpapi\.com\/account/.test(url)) return new Response('{"this_month_usage":7,"api_key":"LEAK","account_email":"x@y"}', { status: 200 });
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
      ['organizer token + no_cache=true (cache bypass)', () => get(env, '/search?' + SEARCH + '&no_cache=true', T), [400]],
      ['organizer token + random cache-buster param', () => get(env, '/search?' + SEARCH + '&x=' + Date.now(), T), [400]],
      ['organizer token + duplicated param', () => get(env, '/search?' + SEARCH + '&arrival_id=ORD', T), [400]],
      ['organizer token + a non-flights engine', () => get(env, '/search?' + SEARCH.replace('google_flights', 'google'), T), [400]],
      ['organizer token + lowercase / injected airport', () => get(env, '/search?' + SEARCH.replace('LAX', 'lax%26api_key%3Dx'), T), [400]],
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
  }
  // Client side, both dashboards: fetchFlights runs for real in a sandbox with
  // a fetch that answers like a Worker cache HIT from five hours ago.
  for (const file of ['pialax.html', 'pialax-mobile.html']) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const fns = ['fareStamp', 'fetchFlights', 'freshnessLabel', '_freshPill'].map((n) => extractFn(html, n));
    if (fns.some((f) => !f)) { bad(`A3 ${file}: could not find fareStamp/fetchFlights/freshnessLabel`); continue; }
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
    ctx.fetch = async () => new Response(JSON.stringify({ best_flights: [{ price: 220 }] }), { status: 200, headers: { 'X-Proxy-Cache': 'MISS', 'X-Fetched-At': new Date().toISOString() } });
    await ctx.fetchFlights('LAX', 'ORD', '2026-11-20', null);
    check(quota.n === 1, `A3 ${file}: a MISS (real SerpAPI call) counts exactly once`, 'bumpQuota ' + quota.n);
    let calls = 0;
    ctx.proxyToken = () => '';
    ctx.fetch = async () => { calls++; return new Response('{}'); };
    const noTok = await ctx.fetchFlights('LAX', 'JFK', '2026-11-20', null);
    check(calls === 0 && noTok && noTok.mock === true, `A1 ${file}: with no organizer token the dashboard never calls the Worker (sample fares)`);
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

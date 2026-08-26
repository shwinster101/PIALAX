'use strict';
// test-worker.js — PIA-048. Exercises worker.js's POST /extract route against a
// mocked Anthropic API and a mocked env, with no network and no API key.
//
// The route's whole job is to FAIL CLOSED: unvalidated model output must never
// cross the wire into stored trip state, and a Worker that is merely
// unconfigured must say so in a way the client can distinguish from a real
// error (so it falls back to the deterministic parser instead of nagging).
// Those are exactly the paths that are painful to reproduce by hand — you would
// need a bad key, a hanging upstream, and a malformed model reply on demand —
// so they get asserted here.
//
// Loading strategy: worker.js is an ES module using `export default`. Node can
// import it directly if the file is seen as ESM, which a .mjs copy in a temp
// dir achieves without adding a package.json to a repo that deliberately has
// none. The copy is byte-identical and removed afterwards.

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = process.argv[2] || process.cwd();

let passCount = 0;
let failCount = 0;
const ok = (m) => { console.log('  OK  ' + m); passCount++; };
const bad = (m) => { console.log('  XX  ' + m); failCount++; };

const ORIGIN = 'https://shwinster101.github.io';
const NOTE = 'Fly LAX to CUZ Sep 4 and return LIM to LAX Sep 13.';

function req(method, url, body, origin) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: origin || ORIGIN },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}
const goodBody = (over) => Object.assign({
  today: '2026-08-02',
  tz: 'America/Los_Angeles',
  trip_state: null,
  context_event: { id: 'ce-1', raw_text: NOTE },
}, over || {});

// A well-formed Anthropic response carrying the forced tool call.
function anthropicOk(input) {
  return new Response(JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    content: [{ type: 'tool_use', name: 'record_trip_facts', input }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
const VALID_EXTRACTION = {
  segments: [
    { origin: 'LAX', destination: 'CUZ', departure_date: '2026-09-04', flight_number: null, confidence: 0.95, source_text: 'Fly LAX to CUZ Sep 4', is_inferred: false },
    { origin: 'LIM', destination: 'LAX', departure_date: '2026-09-13', flight_number: null, confidence: 0.95, source_text: 'return LIM to LAX Sep 13', is_inferred: false },
  ],
  constraints: [], companions: [], target_price: null, decision_deadline: null,
  missing_fields: [], conflicts: [],
};

(async function main() {
  console.log('▶ test-worker: POST /extract contract');

  // ---- load worker.js as ESM without adding a package.json to the repo ----
  const src = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pialax-worker-'));
  const tmpFile = path.join(tmpDir, 'worker.mjs');
  fs.writeFileSync(tmpFile, src);
  let worker;
  try {
    worker = (await import('file://' + tmpFile)).default;
    ok('worker.js loads as an ES module and has a default export');
  } catch (e) {
    bad('worker.js failed to import — ' + (e && e.message ? e.message : String(e)));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    finish();
    return;
  }

  const realFetch = globalThis.fetch;
  const call = async (request, env, fetchImpl) => {
    globalThis.fetch = fetchImpl || (async () => { throw new Error('unexpected upstream call'); });
    try { return await worker.fetch(request, env || {}); }
    finally { globalThis.fetch = realFetch; }
  };
  const readJson = async (res) => { try { return JSON.parse(await res.text()); } catch (e) { return null; } };

  // ---- 1. unconfigured Worker says so distinctly (501 + no_key) ----------
  {
    const res = await call(req('POST', 'https://w.dev/extract', goodBody()), {});
    const j = await readJson(res);
    if (res.status === 501 && j && j.code === 'no_key') {
      ok('no ANTHROPIC_API_KEY -> 501 no_key (client falls back silently, does not retry)');
    } else {
      bad(`no key: expected 501/no_key, got ${res.status}/${j && j.code}`);
    }
  }

  // ---- 2. request validation --------------------------------------------
  {
    const cases = [
      ['not JSON at all', 'this is not json', 400, 'bad_body'],
      ['empty note', goodBody({ context_event: { id: 'x', raw_text: '   ' } }), 400, 'bad_body'],
      ['missing context_event', { today: '2026-08-02' }, 400, 'bad_body'],
      ['missing today (would force the model to invent a year)', { context_event: { id: 'x', raw_text: NOTE } }, 400, 'bad_body'],
      ['bad today format', goodBody({ today: 'next tuesday' }), 400, 'bad_body'],
    ];
    for (const [label, body, wantStatus, wantCode] of cases) {
      const res = await call(req('POST', 'https://w.dev/extract', body), { ANTHROPIC_API_KEY: 'sk-test' });
      const j = await readJson(res);
      if (res.status === wantStatus && j && j.code === wantCode) ok(`rejects ${label} -> ${wantStatus} ${wantCode}`);
      else bad(`${label}: expected ${wantStatus}/${wantCode}, got ${res.status}/${j && j.code}`);
    }
    const huge = JSON.stringify(goodBody({ context_event: { id: 'x', raw_text: 'x'.repeat(20000) } }));
    const res = await call(req('POST', 'https://w.dev/extract', huge), { ANTHROPIC_API_KEY: 'sk-test' });
    const j = await readJson(res);
    if (res.status === 413 && j && j.code === 'too_large') ok('rejects oversized body -> 413 too_large');
    else bad(`oversized body: expected 413/too_large, got ${res.status}/${j && j.code}`);
  }

  // ---- 3. happy path ------------------------------------------------------
  {
    let sent = null;
    const res = await call(
      req('POST', 'https://w.dev/extract', goodBody()),
      { ANTHROPIC_API_KEY: 'sk-test' },
      async (url, init) => { sent = { url, init }; return anthropicOk(VALID_EXTRACTION); }
    );
    const j = await readJson(res);
    if (res.status === 200 && j && j.ok === true && j.extraction && j.extraction.segments.length === 2) {
      ok('valid model output -> 200 with the extraction passed through');
    } else {
      bad(`happy path: got ${res.status} ${JSON.stringify(j).slice(0, 160)}`);
    }
    if (j && j.parser_version === 'llm-1') ok('response is tagged parser_version llm-1');
    else bad(`expected parser_version llm-1, got ${j && j.parser_version}`);

    // The request we send matters as much as the response we accept.
    const body = sent ? JSON.parse(sent.init.body) : {};
    if (sent && sent.url === 'https://api.anthropic.com/v1/messages') ok('calls the Anthropic Messages API');
    else bad(`unexpected upstream URL: ${sent && sent.url}`);
    if (sent && sent.init.headers['x-api-key'] === 'sk-test' && sent.init.headers['anthropic-version']) {
      ok('sends x-api-key + anthropic-version headers');
    } else bad('missing auth/version headers on the upstream call');
    if (body.tool_choice && body.tool_choice.type === 'tool' && body.tool_choice.name === 'record_trip_facts') {
      ok('forces the record_trip_facts tool call (schema enforced structurally)');
    } else bad(`tool_choice not forced: ${JSON.stringify(body.tool_choice)}`);
    if (body.model === 'claude-haiku-4-5-20251001') ok('defaults to claude-haiku-4-5');
    else bad(`unexpected default model: ${body.model}`);
    if (typeof body.system === 'string' && /NEVER invent/i.test(body.system) && /VERBATIM/i.test(body.system)) {
      ok('system prompt carries the never-invent + quote-verbatim rules');
    } else bad('system prompt missing its core rules');
    const userMsg = body.messages && body.messages[0] && body.messages[0].content;
    if (typeof userMsg === 'string' && userMsg.includes('2026-08-02') && userMsg.includes(NOTE)) {
      ok('passes today + the raw note to the model');
    } else bad('user message missing today or the note');
    if (res.headers.get('Cache-Control') === 'no-store') ok('extraction responses are never cached (no-store)');
    else bad(`expected Cache-Control no-store, got ${res.headers.get('Cache-Control')}`);
  }

  // ---- 4. fail closed on bad model output --------------------------------
  {
    const cases = [
      ['plain text reply instead of a tool call', new Response(JSON.stringify({ content: [{ type: 'text', text: 'Sure! Book it.' }] }), { status: 200 })],
      ['wrong tool name', new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'something_else', input: VALID_EXTRACTION }] }), { status: 200 })],
      ['non-JSON upstream body', new Response('<html>502 Bad Gateway</html>', { status: 200 })],
      ['segments not an array', anthropicOk(Object.assign({}, VALID_EXTRACTION, { segments: 'LAX to CUZ' }))],
      ['three segments', anthropicOk(Object.assign({}, VALID_EXTRACTION, { segments: [VALID_EXTRACTION.segments[0], VALID_EXTRACTION.segments[1], VALID_EXTRACTION.segments[0]] }))],
      ['malformed date', anthropicOk(Object.assign({}, VALID_EXTRACTION, { segments: [{ origin: 'LAX', destination: 'CUZ', departure_date: 'Sept 4th', confidence: 1, source_text: 'x' }] }))],
      ['injected airport code', anthropicOk(Object.assign({}, VALID_EXTRACTION, { segments: [{ origin: '"><script>', destination: 'CUZ', departure_date: '2026-09-04', confidence: 1, source_text: 'x' }] }))],
      ['deadline not a date', anthropicOk(Object.assign({}, VALID_EXTRACTION, { decision_deadline: 'soon' }))],
    ];
    for (const [label, upstream] of cases) {
      const res = await call(req('POST', 'https://w.dev/extract', goodBody()), { ANTHROPIC_API_KEY: 'sk-test' }, async () => upstream);
      const j = await readJson(res);
      if (res.status === 502 && j && j.code === 'bad_json') ok(`fails closed on ${label} -> 502 bad_json`);
      else bad(`${label}: expected 502/bad_json, got ${res.status}/${j && j.code}`);
    }
  }

  // ---- 5. upstream failure modes -----------------------------------------
  {
    const res401 = await call(req('POST', 'https://w.dev/extract', goodBody()), { ANTHROPIC_API_KEY: 'sk-bad' },
      async () => new Response('{"error":"authentication_error"}', { status: 401 }));
    const j401 = await readJson(res401);
    if (j401 && j401.code === 'bad_key') ok('upstream 401 -> bad_key (a real misconfiguration, worth telling the user)');
    else bad(`401: expected code bad_key, got ${j401 && j401.code}`);

    const res429 = await call(req('POST', 'https://w.dev/extract', goodBody()), { ANTHROPIC_API_KEY: 'sk-test' },
      async () => new Response('{"error":"rate_limit"}', { status: 429 }));
    if (res429.status === 429) ok('upstream 429 is forwarded as 429 (retryable)');
    else bad(`429: expected status 429, got ${res429.status}`);

    const resTimeout = await call(req('POST', 'https://w.dev/extract', goodBody()), { ANTHROPIC_API_KEY: 'sk-test' },
      async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; });
    const jT = await readJson(resTimeout);
    if (resTimeout.status === 504 && jT && jT.code === 'timeout') ok('upstream timeout -> 504 timeout');
    else bad(`timeout: expected 504/timeout, got ${resTimeout.status}/${jT && jT.code}`);

    const resNet = await call(req('POST', 'https://w.dev/extract', goodBody()), { ANTHROPIC_API_KEY: 'sk-test' },
      async () => { throw new Error('ECONNREFUSED'); });
    const jN = await readJson(resNet);
    if (resNet.status === 502 && jN && jN.code === 'upstream') ok('network failure -> 502 upstream');
    else bad(`network failure: expected 502/upstream, got ${resNet.status}/${jN && jN.code}`);
  }

  // ---- 6. model override --------------------------------------------------
  {
    let body = null;
    await call(req('POST', 'https://w.dev/extract', goodBody()),
      { ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'claude-sonnet-5' },
      async (url, init) => { body = JSON.parse(init.body); return anthropicOk(VALID_EXTRACTION); });
    if (body && body.model === 'claude-sonnet-5') ok('ANTHROPIC_MODEL env var overrides the default');
    else bad(`model override ignored: got ${body && body.model}`);
  }

  // ---- 7. routing + CORS: the SerpAPI path must be untouched -------------
  {
    const res = await call(req('POST', 'https://w.dev/', goodBody()), { ANTHROPIC_API_KEY: 'sk-test' });
    if (res.status === 405) ok('POST to a path other than /extract -> 405 (no accidental surface)');
    else bad(`POST /: expected 405, got ${res.status}`);

    const pre = await call(req('OPTIONS', 'https://w.dev/extract'), {});
    const methods = pre.headers.get('Access-Control-Allow-Methods') || '';
    if (pre.status === 204 && /POST/.test(methods)) ok('CORS preflight advertises POST');
    else bad(`preflight: status ${pre.status}, methods "${methods}"`);
    if (/^https:\/\/shwinster101\.github\.io$/.test(pre.headers.get('Access-Control-Allow-Origin') || '')) {
      ok('CORS origin still pinned to the Pages origin');
    } else bad(`unexpected allow-origin: ${pre.headers.get('Access-Control-Allow-Origin')}`);

    const getNoKey = await call(req('GET', 'https://w.dev/?engine=google_flights'), {});
    if (getNoKey.status === 500) ok('GET path unchanged: missing SERPAPI_KEY still 500s');
    else bad(`GET without SERPAPI_KEY: expected 500, got ${getNoKey.status}`);

    const getBadEngine = await call(req('GET', 'https://w.dev/?engine=google'), { SERPAPI_KEY: 'k' });
    if (getBadEngine.status === 400) ok('GET path unchanged: non-google_flights engine still rejected');
    else bad(`GET with wrong engine: expected 400, got ${getBadEngine.status}`);
  }

  // ---- 8. no upstream content is piped through to the client -------------
  // Regression guard: this route once forwarded text.slice(0,400) of the
  // upstream error body. That is an arbitrary-content passthrough — whatever
  // the upstream says would land in the page. The status class is all the
  // client needs; the body belongs in `wrangler tail`, not in the response.
  {
    const res = await call(req('POST', 'https://w.dev/extract', goodBody()), { ANTHROPIC_API_KEY: 'sk-SECRET-VALUE' },
      async () => new Response('{"error":"ctx sk-SECRET-VALUE and <img src=x onerror=1>"}', { status: 400 }));
    const text = await res.text();
    if (text.includes('sk-SECRET-VALUE')) bad('the API key appeared in the response body');
    else if (text.includes('onerror')) bad('upstream body content was piped through to the client');
    else ok('upstream error bodies are never forwarded (status class only)');
  }

  // ═══ PIA-063: real fare alerts ═══════════════════════════════════════════
  const mockKV = () => {
    const m = new Map();
    return { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); }, _m: m };
  };
  const isoPlus = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const GOOD_EVENT = { id: 'alert-abc123', trip_id: 'peru', type: 'fare_drop', subject: 'Fare dropped 12%', body_text: 'Now $780 (was $895). Book it.' };

  // ---- 9. POST /alert — delivery, fail closed ----------------------------
  {
    const res501 = await call(req('POST', 'https://w.dev/alert', { to: 'a@b.co', event: GOOD_EVENT }), {});
    const j501 = await readJson(res501);
    if (res501.status === 501 && j501 && j501.code === 'no_key') ok('/alert without RESEND_API_KEY -> 501 no_key (client stays preview-only)');
    else bad(`/alert no key: expected 501/no_key, got ${res501.status}/${j501 && j501.code}`);

    const envMail = { RESEND_API_KEY: 're-test' };
    const badCases = [
      ['non-JSON body', 'not json'],
      ['missing recipient', { event: GOOD_EVENT }],
      ['bad recipient', { to: 'not-an-email', event: GOOD_EVENT }],
      ['unknown alert type', { to: 'a@b.co', event: Object.assign({}, GOOD_EVENT, { type: 'spam' }) }],
      ['empty subject', { to: 'a@b.co', event: Object.assign({}, GOOD_EVENT, { subject: '  ' }) }],
      ['injected event id', { to: 'a@b.co', event: Object.assign({}, GOOD_EVENT, { id: '"><script>' }) }],
    ];
    for (const [label, body] of badCases) {
      const res = await call(req('POST', 'https://w.dev/alert', body), envMail);
      const j = await readJson(res);
      if (res.status === 400 && j && j.code === 'bad_body') ok(`/alert rejects ${label} -> 400 bad_body`);
      else bad(`/alert ${label}: expected 400/bad_body, got ${res.status}/${j && j.code}`);
    }

    let sent = null;
    const resOk = await call(req('POST', 'https://w.dev/alert', { to: 'ash@example.com', event: GOOD_EVENT }), envMail,
      async (url, init) => { sent = { url, init }; return new Response('{"id":"em_1"}', { status: 200 }); });
    const jOk = await readJson(resOk);
    if (resOk.status === 200 && jOk && jOk.ok === true) ok('/alert happy path -> 200 ok');
    else bad(`/alert happy path: got ${resOk.status} ${JSON.stringify(jOk)}`);
    const mail = sent ? JSON.parse(sent.init.body) : {};
    if (sent && sent.url === 'https://api.resend.com/emails' && sent.init.headers.Authorization === 'Bearer re-test') {
      ok('/alert calls Resend with the Bearer secret');
    } else bad('/alert upstream call malformed: ' + (sent && sent.url));
    if (mail.to && mail.to[0] === 'ash@example.com' && /PIALAX · Fare dropped/.test(mail.subject) && /\$780/.test(mail.text)) {
      ok('/alert email carries recipient + subject prefix + body');
    } else bad('/alert email payload wrong: ' + JSON.stringify(mail).slice(0, 140));
    if (resOk.headers.get('Cache-Control') === 'no-store') ok('/alert responses are never cached');
    else bad('/alert missing no-store');

    const res401 = await call(req('POST', 'https://w.dev/alert', { to: 'a@b.co', event: GOOD_EVENT }), envMail,
      async () => new Response('{"message":"invalid key sk-LEAK"}', { status: 401 }));
    const j401 = await readJson(res401);
    const t401 = JSON.stringify(j401);
    if (j401 && j401.code === 'bad_key' && !t401.includes('sk-LEAK')) ok('/alert provider 401 -> bad_key, upstream body never forwarded');
    else bad(`/alert 401: got ${res401.status}/${j401 && j401.code}`);
  }

  // ---- 10. /alerts/sync + /alerts/status ---------------------------------
  {
    const resNoKv = await call(req('POST', 'https://w.dev/alerts/sync', { email: 'a@b.co', watches: [] }), {});
    const jNoKv = await readJson(resNoKv);
    if (resNoKv.status === 501 && jNoKv && jNoKv.code === 'no_kv') ok('/alerts/sync without KV binding -> 501 no_kv');
    else bad(`/alerts/sync no KV: expected 501/no_kv, got ${resNoKv.status}/${jNoKv && jNoKv.code}`);

    const goodWatch = { trip_id: 'peru', label: 'Peru — Machu Picchu', from: 'LAX', to: 'CUZ', dep: isoPlus(30), ret: isoPlus(39), threshold_pct: 10, remind_days: 3, baseline: 895 };
    const kvEnv = () => ({ ALERTS: mockKV() });
    const badSyncs = [
      ['bad email', { email: 'nope', watches: [goodWatch] }],
      ['non-IATA origin', { email: 'a@b.co', watches: [Object.assign({}, goodWatch, { from: 'L1' })] }],
      ['prose date', { email: 'a@b.co', watches: [Object.assign({}, goodWatch, { dep: 'next friday' })] }],
      ['eleven watches', { email: 'a@b.co', watches: Array.from({ length: 11 }, () => goodWatch) }],
    ];
    for (const [label, body] of badSyncs) {
      const res = await call(req('POST', 'https://w.dev/alerts/sync', body), kvEnv());
      if (res.status === 400) ok(`/alerts/sync rejects ${label} -> 400`);
      else bad(`/alerts/sync ${label}: expected 400, got ${res.status}`);
    }

    const env = kvEnv();
    const resSync = await call(req('POST', 'https://w.dev/alerts/sync', { email: 'ash@example.com', watches: [goodWatch] }), env);
    const jSync = await readJson(resSync);
    const storedRaw = await env.ALERTS.get('alerts:config');
    const stored = storedRaw ? JSON.parse(storedRaw) : null;
    if (resSync.status === 200 && jSync && jSync.stored === 1 && stored && stored.watches.length === 1 && stored.email === 'ash@example.com') {
      ok('/alerts/sync happy path stores the config in KV');
    } else bad(`/alerts/sync happy path: ${resSync.status} ${JSON.stringify(jSync)}`);

    const resStat = await call(req('GET', 'https://w.dev/alerts/status'), env);
    const jStat = await readJson(resStat);
    if (resStat.status === 200 && jStat && jStat.watches === 1 && jStat.email_masked && !JSON.stringify(jStat).includes('ash@example.com')) {
      ok('/alerts/status reports watch count with a masked email');
    } else bad(`/alerts/status: ${resStat.status} ${JSON.stringify(jStat).slice(0, 140)}`);
  }

  // ---- 11. scheduled cron: drop + deadline, no daily repeats -------------
  {
    const runCron = async (env, fetchImpl) => {
      const waits = [];
      globalThis.fetch = fetchImpl;
      try { await worker.scheduled({}, env, { waitUntil: (p) => waits.push(p) }); await Promise.all(waits); }
      finally { globalThis.fetch = realFetch; }
    };
    const serpOk = (price) => new Response(JSON.stringify({ best_flights: [{ price }] }), { status: 200 });

    // A. price under threshold -> exactly one email; repeat run -> none.
    {
      const env = { ALERTS: mockKV(), SERPAPI_KEY: 'sk', RESEND_API_KEY: 're' };
      await env.ALERTS.put('alerts:config', JSON.stringify({
        email: 'ash@example.com',
        watches: [
          { trip_id: 'peru', label: 'Peru', from: 'LAX', to: 'CUZ', dep: isoPlus(30), ret: isoPlus(39), threshold_pct: 10, remind_days: 3, baseline: 400 },
          { trip_id: 'old', label: 'Departed', from: 'LAX', to: 'MEM', dep: '2020-01-01', ret: null, threshold_pct: 10, remind_days: 3, baseline: 300 },
        ],
      }));
      const mails = [];
      const impl = async (url, init) => {
        if (String(url).startsWith('https://serpapi.com/')) return serpOk(350);
        if (String(url).startsWith('https://api.resend.com/')) { mails.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); }
        throw new Error('unexpected fetch ' + url);
      };
      await runCron(env, impl);
      const run1 = JSON.parse(await env.ALERTS.get('alerts:last_run'));
      if (mails.length === 1 && /dropped to \$350/.test(mails[0].subject) && run1.sent === 1 && run1.checked === 1) {
        ok('cron: $350 vs $400 baseline (10% threshold) -> one fare-drop email; departed watch skipped');
      } else bad(`cron drop: mails=${mails.length} run=${JSON.stringify(run1)}`);
      await runCron(env, impl); // same price again
      if (mails.length === 1) ok('cron: same price on the next run -> no repeat email');
      else bad(`cron repeat: expected 1 mail total, got ${mails.length}`);
      const st = JSON.parse(await env.ALERTS.get('alerts:state'));
      if (st.peru && st.peru.last_alert_price === 350 && st.peru.last_price === 350) ok('cron: per-watch state records last/alerted price');
      else bad('cron state wrong: ' + JSON.stringify(st).slice(0, 140));
    }

    // B. departure inside the remind window -> one reminder, never twice.
    {
      const env = { ALERTS: mockKV(), SERPAPI_KEY: 'sk', RESEND_API_KEY: 're' };
      await env.ALERTS.put('alerts:config', JSON.stringify({
        email: 'ash@example.com',
        watches: [{ trip_id: 'mem', label: 'Memphis', from: 'LAX', to: 'MEM', dep: isoPlus(2), ret: null, threshold_pct: 10, remind_days: 3, baseline: null }],
      }));
      const mails = [];
      const impl = async (url, init) => {
        if (String(url).startsWith('https://serpapi.com/')) return new Response('{}', { status: 200 }); // no price available
        if (String(url).startsWith('https://api.resend.com/')) { mails.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); }
        throw new Error('unexpected fetch ' + url);
      };
      await runCron(env, impl);
      await runCron(env, impl);
      if (mails.length === 1 && /departs in 2 days/.test(mails[0].subject)) ok('cron: departure reminder fires once, even with no price data');
      else bad(`cron reminder: mails=${mails.length} subj=${mails[0] && mails[0].subject}`);
    }

    // C. missing secrets -> run records why it skipped, sends nothing.
    {
      const env = { ALERTS: mockKV(), SERPAPI_KEY: 'sk' }; // no RESEND_API_KEY
      await runCron(env, async () => { throw new Error('must not fetch'); });
      const run = JSON.parse(await env.ALERTS.get('alerts:last_run'));
      if (run && run.skipped === 'no RESEND_API_KEY' && run.sent === 0) ok('cron: unconfigured delivery -> skipped + recorded, zero sends');
      else bad('cron skip: ' + JSON.stringify(run));
    }
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  finish();
})().catch((e) => {
  bad('suite threw — ' + (e && e.stack ? e.stack : String(e)));
  finish();
});

function finish() {
  console.log('');
  if (failCount > 0) {
    console.log(failCount + ' failing, ' + passCount + ' passing');
    process.exit(1);
  } else {
    console.log('all ' + passCount + ' checks passing');
    process.exit(0);
  }
}

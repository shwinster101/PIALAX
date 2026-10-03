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

  // ---- 11. Shared trip ideas — PIA-071 storage · PIA-072 RSVP · PIA-073 decision ----
  {
    const IDEA = {
      title: 'Cary baby shower', destination: { city: 'Raleigh-Durham', airport: 'RDU' },
      dates: { departure: '2026-11-06', return: '2026-11-09' },
      recommendation: { city: 'Raleigh-Durham', airport: 'RDU', hub: 'PIA_ORD', fareFrom: 'ORD', fareTo: 'RDU', departure: '2026-11-06', return: '2026-11-09', totalFare: 460, perTicketFare: 230, headcount: 2, priceStatus: 'cached' },
      notes: 'Shower is Saturday',
      members: [{ code: 'PIA', label: 'Mom & Dad', airport: 'PIA', headcount: 2 }, { code: 'LAX', label: 'Me', airport: 'LAX', headcount: 1 }, { code: 'LGA', label: 'Anjo', airport: 'LGA', headcount: 1 }],
    };
    const noKv = await call(req('POST', 'https://w.dev/idea', { idea: IDEA }), {});
    const jNo = await readJson(noKv);
    if (noKv.status === 501 && jNo && jNo.code === 'no_kv') ok('/idea without IDEAS binding -> 501 no_kv (client keeps read-only links)');
    else bad(`/idea no KV: ${noKv.status}/${jNo && jNo.code}`);

    const env = { IDEAS: mockKV() };
    const created = await call(req('POST', 'https://w.dev/idea', { idea: IDEA }), env);
    const c = await readJson(created);
    const id = c && c.id, key = c && c.edit_key;
    if (created.status === 201 && /^[A-Za-z0-9_-]{22}$/.test(id || '') && /^[A-Za-z0-9_-]{43}$/.test(key || '')) ok('POST /idea -> 201 with 128-bit id and 256-bit edit key');
    else bad('create: ' + created.status + ' ' + JSON.stringify(c));
    const stored = JSON.parse(env.IDEAS._m.get('idea:' + id) || 'null');
    if (stored && stored.edit_hash && !JSON.stringify(stored).includes(key) && !('edit_hash' in c.doc)) ok('edit key stored only as a hash and never returned in doc');
    else bad('edit key leak or missing hash');
    if (c.doc.idea.members.length === 3 && c.doc.decision.stage === 'proposed') ok('created doc keeps members and starts at proposed');
    else bad('create doc shape: ' + JSON.stringify(c.doc));

    const badIdeas = [
      ['no members', Object.assign({}, IDEA, { members: [] })],
      ['nine members', Object.assign({}, IDEA, { members: Array.from({ length: 9 }, (_, i) => ({ code: 'M' + i })) })],
      ['duplicate member', Object.assign({}, IDEA, { members: [{ code: 'PIA' }, { code: 'PIA' }] })],
    ];
    let rejected = 0;
    for (const [, idea] of badIdeas) { const r = await call(req('POST', 'https://w.dev/idea', { idea }), env); if (r.status === 400) rejected++; }
    if (rejected === badIdeas.length) ok('malformed ideas rejected whole (no members / too many / duplicates)');
    else bad(`malformed ideas: ${rejected}/${badIdeas.length} rejected`);
    const sanitized = await readJson(await call(req('POST', 'https://w.dev/idea', { idea: Object.assign({}, IDEA, { title: '<b>x</b>'.repeat(40), destination: { airport: 'not-iata' } }) }), env));
    if (sanitized && sanitized.doc.idea.title.length <= 80 && sanitized.doc.idea.destination.airport === '') ok('over-long text clipped, non-IATA airport dropped');
    else bad('sanitize: ' + JSON.stringify(sanitized && sanitized.doc.idea));

    const got = await call(req('GET', 'https://w.dev/idea?id=' + id), env);
    const g = await readJson(got);
    if (got.status === 200 && g.doc.id === id && !('edit_hash' in g.doc)) ok('GET /idea returns the public doc');
    else bad('get: ' + got.status);
    const miss = await call(req('GET', 'https://w.dev/idea?id=' + 'A'.repeat(22)), env);
    const malformed = await call(req('GET', 'https://w.dev/idea?id=../etc'), env);
    if (miss.status === 404 && malformed.status === 400) ok('unknown id -> 404, malformed id -> 400');
    else bad(`get miss/malformed: ${miss.status}/${malformed.status}`);

    // RSVP (PIA-072)
    const rsvp = await call(req('POST', 'https://w.dev/idea/respond?id=' + id, { member: 'LAX', status: 'maybe', available_from: '2026-11-05', available_to: '2026-11-10', note: 'Work trip that week' }), env);
    const rj = await readJson(rsvp);
    const lax = rj && rj.doc.responses.LAX;
    if (rsvp.status === 200 && lax && lax.status === 'maybe' && lax.origin === 'LAX' && lax.available_to === '2026-11-10') ok('RSVP stored per member; origin defaults to member airport');
    else bad('rsvp: ' + rsvp.status + ' ' + JSON.stringify(rj));
    await call(req('POST', 'https://w.dev/idea/respond?id=' + id, { member: 'LAX', status: 'in' }), env);
    const after = await readJson(await call(req('GET', 'https://w.dev/idea?id=' + id), env));
    if (after.doc.responses.LAX.status === 'in' && Object.keys(after.doc.responses).length === 1) ok('a second RSVP from the same member replaces the first');
    else bad('rsvp replace: ' + JSON.stringify(after.doc.responses));
    const badRsvps = [
      { member: 'BOS', status: 'in' }, { member: 'PIA', status: 'yes' },
      { member: 'PIA', status: 'in', available_from: '2026-11-10', available_to: '2026-11-01' },
    ];
    let rsvpRejected = 0;
    for (const b of badRsvps) { const r = await call(req('POST', 'https://w.dev/idea/respond?id=' + id, b), env); if (r.status === 400) rsvpRejected++; }
    if (rsvpRejected === badRsvps.length) ok('RSVP rejects unknown member, unknown status, reversed availability');
    else bad(`bad rsvps: ${rsvpRejected}/${badRsvps.length}`);

    // Organizer update + decision (PIA-073)
    const wrongKey = await call(req('POST', 'https://w.dev/idea/update?id=' + id, { edit_key: 'x'.repeat(43), decision: { stage: 'chosen' } }), env);
    const noKey = await call(req('POST', 'https://w.dev/idea/update?id=' + id, { decision: { stage: 'chosen' } }), env);
    if (wrongKey.status === 403 && noKey.status === 403) ok('organizer update requires the matching edit key');
    else bad(`update auth: ${wrongKey.status}/${noKey.status}`);
    const earlyBook = await call(req('POST', 'https://w.dev/idea/update?id=' + id, { edit_key: key, decision: { stage: 'booked', actual_total: 500 } }), env);
    if (earlyBook.status === 400) ok('cannot mark booked before choosing');
    else bad('early book: ' + earlyBook.status);
    const chose = await readJson(await call(req('POST', 'https://w.dev/idea/update?id=' + id, { edit_key: key, decision: { stage: 'chosen' } }), env));
    if (chose && chose.doc.decision.stage === 'chosen' && chose.doc.decision.estimate_total === 460) ok('choose records the estimate ($460)');
    else bad('choose: ' + JSON.stringify(chose));
    const booked = await readJson(await call(req('POST', 'https://w.dev/idea/update?id=' + id, { edit_key: key, decision: { stage: 'booked', actual_total: 506 } }), env));
    const dec = booked && booked.doc.decision;
    if (dec && dec.stage === 'booked' && dec.actual_total === 506 && dec.delta_pct === 10) ok('booked records actual $506 and +10% vs estimate');
    else bad('book: ' + JSON.stringify(dec));
    {
      const famIdea = Object.assign({}, IDEA, { recommendation: Object.assign({}, IDEA.recommendation, { familyTotal: 1116, familyStatus: 'estimated' }) });
      const c2 = await readJson(await call(req('POST', 'https://w.dev/idea', { idea: famIdea }), env));
      const ch2 = await readJson(await call(req('POST', 'https://w.dev/idea/update?id=' + c2.id, { edit_key: c2.edit_key, decision: { stage: 'chosen' } }), env));
      if (ch2 && ch2.doc.decision.estimate_total === 1116) ok('choose uses the whole-family estimate when the idea carries one');
      else bad('family estimate: ' + JSON.stringify(ch2 && ch2.doc.decision));
    }
    const closed = await call(req('POST', 'https://w.dev/idea/respond?id=' + id, { member: 'PIA', status: 'in' }), env);
    if (closed.status === 409) ok('RSVPs closed once the idea is booked');
    else bad('closed rsvp: ' + closed.status);
    const logEvents = booked.doc.log.map((l) => l.event).join(',');
    if (/created/.test(logEvents) && /rsvp:maybe/.test(logEvents) && /decision:chosen/.test(logEvents) && /decision:booked/.test(logEvents)) ok('decision log records created → rsvp → chosen → booked');
    else bad('log: ' + logEvents);
    const editResp = await readJson(await call(req('POST', 'https://w.dev/idea/update?id=' + id, { edit_key: key, idea: Object.assign({}, IDEA, { members: [IDEA.members[0]] }) }), env));
    if (editResp && !editResp.doc.responses.LAX) ok('editing members drops RSVPs from removed members');
    else bad('edit members: ' + JSON.stringify(editResp && editResp.doc.responses));
    // PIA-104: prices only for the organizer's key; link previews for chat apps.
    {
      const c3 = await readJson(await call(req('POST', 'https://w.dev/idea', { idea: Object.assign({}, IDEA, { title: '🦃 Thanksgiving <at> home', recommendation: Object.assign({}, IDEA.recommendation, { departure: '2026-11-25', familyTotal: 900 }) }) }), env));
      const withKey = (u, k, ua) => new Request(u, { method: 'GET', headers: Object.assign({ Origin: ORIGIN }, k ? { 'X-Idea-Key': k } : {}, ua ? { 'User-Agent': ua } : {}) });
      const guest = await readJson(await call(withKey('https://w.dev/idea?id=' + c3.id), env));
      const org = await readJson(await call(withKey('https://w.dev/idea?id=' + c3.id, c3.edit_key), env));
      const wrong = await readJson(await call(withKey('https://w.dev/idea?id=' + c3.id, 'y'.repeat(43)), env));
      const gr = guest.doc.idea.recommendation, orr = org.doc.idea.recommendation;
      if (gr.totalFare === null && gr.familyTotal === null && gr.perTicketFare === null && gr.departure === '2026-11-25' && guest.organizer === false && guest.preview === true &&
          orr.familyTotal === 900 && orr.totalFare === 460 && org.organizer === true && wrong.organizer === false && wrong.doc.idea.recommendation.familyTotal === null &&
          !JSON.stringify(guest).includes('900'))
        ok('GET /idea: family gets no prices (dates kept); the X-Idea-Key organizer gets them; a wrong key gets none');
      else bad('fare stripping: ' + JSON.stringify({ gr, orr, organizer: [guest.organizer, org.organizer, wrong.organizer] }));
      const gResp = await readJson(await call(req('POST', 'https://w.dev/idea/respond?id=' + c3.id, { member: 'LGA', status: 'in' }), env));
      if (gResp.doc.idea.recommendation.familyTotal === null && gResp.organizer === false) ok('RSVP answers return the family view (no prices) too');
      else bad('respond view: ' + JSON.stringify(gResp.doc.idea.recommendation));
      const pre = await call(new Request('https://w.dev/', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env);
      if (/X-Idea-Key/.test(pre.headers.get('Access-Control-Allow-Headers') || '')) ok('CORS preflight allows the X-Idea-Key header');
      else bad('cors headers: ' + pre.headers.get('Access-Control-Allow-Headers'));

      const IMESSAGE_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0';
      const bot = await call(withKey('https://w.dev/i/' + c3.id, '', IMESSAGE_UA), env);
      const html = await bot.text();
      if (bot.status === 200 && /text\/html/.test(bot.headers.get('Content-Type') || '') && html.includes('og:title" content="🦃 Thanksgiving &lt;at&gt; home"') &&
          html.includes('Late Nov · Tap to say in / maybe / out') && !/\$|460|900|2026-11-25/.test(html) && html.includes('PIALAX/?idea=' + c3.id) && /noindex/.test(html))
        ok('GET /i/<id> for iMessage: escaped og:title + "Late Nov · Tap to say in / maybe / out", no price or exact date');
      else bad('preview html: ' + bot.status + ' ' + html.slice(0, 400));
      const human = await call(withKey('https://w.dev/i/' + c3.id, '', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'), env);
      if (human.status === 302 && human.headers.get('Location') === 'https://shwinster101.github.io/PIALAX/?idea=' + c3.id) ok('GET /i/<id> for a person: 302 straight to the app RSVP page');
      else bad('preview redirect: ' + human.status + ' ' + human.headers.get('Location'));
      const gone = await call(withKey('https://w.dev/i/' + 'B'.repeat(22), '', IMESSAGE_UA), env);
      const broken = await call(withKey('https://w.dev/i/..%2Fx', '', IMESSAGE_UA), env);
      if (gone.status === 404 && broken.status === 400) ok('GET /i/: unknown id -> 404 page, malformed id -> 400 page');
      else bad(`preview miss/malformed: ${gone.status}/${broken.status}`);
      const proto = await call(req('POST', 'https://w.dev/idea/respond?id=' + c3.id, { member: 'LGA', status: 'toString' }), env);
      const protoStage = await call(req('POST', 'https://w.dev/idea/update?id=' + c3.id, { edit_key: c3.edit_key, decision: { stage: 'constructor' } }), env);
      if (proto.status === 400 && protoStage.status === 400) ok('status/stage lookups ignore Object.prototype names ("toString", "constructor")');
      else bad(`prototype lookups: ${proto.status}/${protoStage.status}`);
    }
    // PIA-106: who's booked.
    {
      const c4 = await readJson(await call(req('POST', 'https://w.dev/idea', { idea: IDEA }), env));
      const post = async (p, b) => { const r = await call(req('POST', 'https://w.dev' + p + '?id=' + c4.id, b), env); return { status: r.status, j: await readJson(r) }; };
      const early = await post('/idea/booked', { member: 'LGA', booked: true });
      await post('/idea/respond', { member: 'LGA', status: 'in', available_from: '2026-11-06', available_to: '2026-11-09', note: 'yay' });
      const set = await post('/idea/booked', { member: 'LGA', booked: true });
      const lga = set.j && set.j.doc.responses.LGA;
      if (early.status === 400 && early.j.code === 'answer_first' && set.status === 200 && lga.booked === true && lga.booked_at && lga.note === 'yay' && lga.available_to === '2026-11-09' && set.j.can_book === true)
        ok('/idea/booked: needs an in/maybe answer first; sets booked and keeps the rest of the answer');
      else bad('booked set: ' + JSON.stringify({ early, set: set.j && set.j.doc.responses }));
      const changed = await post('/idea/respond', { member: 'LGA', status: 'maybe', available_from: '2026-11-07', available_to: '2026-11-09' });
      const out = await post('/idea/respond', { member: 'LGA', status: 'out' });
      if (changed.j.doc.responses.LGA.booked === true && !out.j.doc.responses.LGA.booked) ok('changing an answer keeps "booked"; answering out clears it');
      else bad('booked keep/clear: ' + JSON.stringify([changed.j.doc.responses.LGA, out.j.doc.responses.LGA]));
      const badM = await post('/idea/booked', { member: 'BOS', booked: true });
      const badB = await post('/idea/booked', { member: 'LGA', booked: 'yes' });
      await call(req('POST', 'https://w.dev/idea/update?id=' + c4.id, { edit_key: c4.edit_key, decision: { stage: 'dropped' } }), env);
      const closedB = await post('/idea/booked', { member: 'LGA', booked: false });
      if (badM.status === 400 && badB.status === 400 && closedB.status === 409) ok('/idea/booked rejects unknown members and non-boolean flags; dropped trips are closed');
      else bad(`booked errors: ${badM.status}/${badB.status}/${closedB.status}`);
    }
    const opts = [];
    const ttlEnv = { IDEAS: { get: async () => null, put: async (k, v, o) => { opts.push(o); } } };
    await call(req('POST', 'https://w.dev/idea', { idea: IDEA }), ttlEnv);
    if (opts.length === 1 && opts[0] && opts[0].expirationTtl >= 365 * 86400) ok('KV writes expire (≥ 1 year TTL) instead of living forever');
    else bad('ttl: ' + JSON.stringify(opts));
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

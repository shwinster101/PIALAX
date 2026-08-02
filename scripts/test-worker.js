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

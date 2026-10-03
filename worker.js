/**
 * PIALAX SerpAPI Proxy — Cloudflare Worker
 *
 * Solves two problems at once:
 *   1. CORS — SerpAPI blocks browser-side fetch(); this proxy adds CORS headers
 *   2. Key security — API key lives as a Worker secret, never exposed in browser
 *
 * SETUP (one-time, ~5 minutes):
 *   1. Go to https://dash.cloudflare.com → sign up free if needed
 *   2. Left sidebar → Workers & Pages → Create → Create Worker
 *   3. Name it "pialax-proxy"
 *   4. Paste this entire file into the online editor, click "Deploy"
 *   5. Go to the Worker's Settings → Variables and Secrets
 *   6. Add a secret: Name = SERPAPI_KEY, Value = your SerpAPI key
 *   7. Copy the Worker URL (e.g. https://pialax-proxy.YOUR-SUB.workers.dev)
 *   8. In pialax.html and pialax-mobile.html, set:
 *        var PROXY_URL = 'https://pialax-proxy.YOUR-SUB.workers.dev';
 *   9. Push to GitHub — done! No API key anywhere in your repo.
 *
 * Free tier: 100,000 requests/day (you'll use maybe 20).
 */

const ALLOWED_ORIGINS = [
  'https://shwinster101.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

const SERPAPI_BASE = 'https://serpapi.com/search.json';

// ── Trip-assistant extraction (PIA-048) ──
// POST /extract turns one free-text trip note into structured PROPOSED facts.
// It never decides anything and never builds a URL — the client's deterministic
// code does both, from facts the user has confirmed. See EXTRACT_SYSTEM below.
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Haiku 4.5 is the default deliberately: this is short-input structured
// extraction with a forced schema, which it handles well, and the caller is a
// family dashboard that already rations its API budget carefully. Point
// ANTHROPIC_MODEL at a larger model (e.g. claude-sonnet-5) if notes get gnarlier.
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const EXTRACT_TIMEOUT_MS = 20000;
const MAX_BODY_BYTES = 16384;

export default {
  async fetch(request, env) {
    // ── CORS preflight ──
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // ── POST routes ──
    if (request.method === 'POST') {
      let pathname = '/';
      try { pathname = new URL(request.url).pathname; } catch (e) { /* fall through */ }
      if (pathname === '/extract' || pathname === '/extract/') {
        return handleExtract(request, env);
      }
      // PIA-071..073: shared trip ideas (create · RSVP · organizer update)
      {
        const p = pathname.replace(/\/+$/, '');
        if (p === '/idea' || p === '/idea/respond' || p === '/idea/update') return handleIdea(request, env, p);
      }
      // PIA-063: real fare alerts — send one AlertEvent now (client-drained outbox)
      if (pathname === '/alert' || pathname === '/alert/') {
        return handleAlertSend(request, env);
      }
      // PIA-063: store this device's active fare watches for the daily cron check
      if (pathname === '/alerts/sync' || pathname === '/alerts/sync/') {
        return handleAlertsSync(request, env);
      }
      return jsonError('Method not allowed', 405, request);
    }

    if (request.method !== 'GET') {
      return jsonError('Method not allowed', 405, request);
    }

    // PIA-063: alert config/last-cron-run status (no SerpAPI key required)
    {
      let pathname = '/';
      try { pathname = new URL(request.url).pathname; } catch (e) { /* fall through */ }
      if (pathname === '/alerts/status' || pathname === '/alerts/status/') {
        return handleAlertsStatus(request, env);
      }
      if (pathname === '/idea' || pathname === '/idea/') return handleIdea(request, env, '/idea');
      // PIA-104: the link the family taps — a preview card for chat apps, a redirect for people.
      if (/^\/i\/[^/]*\/?$/.test(pathname)) return handleIdeaPreview(request, env, pathname.split('/')[2] || '');
    }

    // ── Validate API key is configured ──
    const apiKey = env.SERPAPI_KEY;
    if (!apiKey) {
      return jsonError('SERPAPI_KEY secret not configured on this Worker', 500, request);
    }

    // ── Build SerpAPI request from query params ──
    const url = new URL(request.url);
    const params = url.searchParams;

    // Special-case: /account quota lookup. Returns total_searches_left, etc.
    // so the dashboard can sync its local quota counter with the real plan.
    if (params.get('action') === 'account') {
      try {
        const acctRes = await fetch('https://serpapi.com/account.json?api_key=' + apiKey, {
          headers: { 'User-Agent': 'PIALAX-Proxy/1.0' },
        });
        const acctBody = await acctRes.text();
        return new Response(acctBody, {
          status: acctRes.status,
          headers: {
            'Content-Type': 'application/json',
            'X-SerpAPI-Status': String(acctRes.status),
            ...corsHeaders(request),
          },
        });
      } catch (e) {
        return jsonError('Account lookup failed: ' + e.message, 502, request);
      }
    }

    // Safety: only allow google_flights engine for search calls
    if (params.get('engine') !== 'google_flights') {
      return jsonError('Only google_flights engine is allowed', 400, request);
    }

    // Remove any api_key the client may have sent (we inject our own)
    params.delete('api_key');
    params.set('api_key', apiKey);

    const serpUrl = SERPAPI_BASE + '?' + params.toString();

    // ── Edge cache (perf + quota saver) ──
    // Build a cache key WITHOUT the api_key so the same flight query from
    // any browser hits one cached response. TTL = 24 hr — flight prices
    // for non-imminent dates don't move meaningfully day-to-day, and the
    // family-collab use case means multiple people will load the same query.
    // SerpAPI free tier = 250/month; this cache lets all 4 family members
    // share a single fetch per (route + dates) pair per day.
    const cacheParams = new URLSearchParams(params);
    cacheParams.delete('api_key');
    const cacheKey = new Request(SERPAPI_BASE + '?' + cacheParams.toString(), { method: 'GET' });
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      // Re-emit with CORS headers; signal cache hit + remaining quota header (best-effort)
      const body = await cached.text();
      const h = {
        'Content-Type': 'application/json',
        'X-SerpAPI-Status': cached.headers.get('X-SerpAPI-Status') || '200',
        'X-Proxy-Cache': 'HIT',
        ...corsHeaders(request),
      };
      const remaining = cached.headers.get('X-SerpAPI-Searches-Left');
      if (remaining) h['X-SerpAPI-Searches-Left'] = remaining;
      return new Response(body, { status: 200, headers: h });
    }

    try {
      const serpRes = await fetch(serpUrl, {
        headers: { 'User-Agent': 'PIALAX-Proxy/1.0' },
      });

      // Forward rate-limit / error status codes so the client can handle them
      const body = await serpRes.text();

      // SerpAPI returns a `search_metadata` block on success; for the account
      // endpoint they expose remaining searches but not on /search.json. We
      // still surface it if SerpAPI ever sends it as a header.
      const remaining = serpRes.headers.get('X-SerpAPI-Searches-Left') || '';

      const responseHeaders = {
        'Content-Type': 'application/json',
        'X-SerpAPI-Status': String(serpRes.status),
        'X-Proxy-Cache': 'MISS',
        ...corsHeaders(request),
      };
      if (remaining) responseHeaders['X-SerpAPI-Searches-Left'] = remaining;

      const response = new Response(body, { status: serpRes.status, headers: responseHeaders });

      // Only cache successful 200s for 24 hr (was 5 min) — see comment above.
      if (serpRes.status === 200) {
        const cacheable = new Response(body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-SerpAPI-Status': '200',
            ...(remaining ? { 'X-SerpAPI-Searches-Left': remaining } : {}),
            'Cache-Control': 'public, max-age=86400',
          },
        });
        // ctx.waitUntil isn't required; cache.put returns a promise but it's safe to await
        await cache.put(cacheKey, cacheable);
      }

      return response;
    } catch (e) {
      return jsonError('Proxy error: ' + e.message, 502, request);
    }
  },

  // PIA-063: daily fare-alert check (Cron Trigger — see wrangler.toml).
  // Fires with the dashboard CLOSED, which is the entire point: the app can
  // finally tap the user on the shoulder instead of waiting to be opened.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAlertCron(env));
  },
};

function corsHeaders(request) {
  const origin = request && request.headers && request.headers.get('Origin');
  const allowed = origin && ALLOWED_ORIGINS.some(function (o) {
    return origin === o || origin.startsWith(o + ':');
  }) ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Idea-Key',
    'Access-Control-Max-Age': '86400',
  };
}

// `code` is the machine-readable half — the client branches on it to decide
// between falling back silently (no_key / upstream), telling the user something
// is genuinely misconfigured (bad_key), and offering a retry (timeout).
// `detail` carries upstream text for the console only; it is never surfaced
// in the UI, so an upstream error message can't leak into the page.
function jsonError(msg, status, request, code, detail) {
  const payload = { error: msg };
  if (code) payload.code = code;
  if (detail) payload.detail = detail;
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(request),
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /extract — LLM fact extraction (PIA-048)
// ═══════════════════════════════════════════════════════════════════════════
// Contract, and the reasoning behind each half of it:
//
//   · The model EXTRACTS, it does not DECIDE. No recommendation, no URL, no
//     booking advice. The client's deterministic code owns both the decision
//     engine and the Google Flights link, built only from facts the user has
//     confirmed. A model that could emit a URL could emit a wrong one, and a
//     wrong booking link is indistinguishable from a right one until someone
//     has paid for it.
//
//   · It must never invent. A fabricated airport or date silently produces a
//     wrong price and a wrong link; a missing one just asks the user a
//     question. Every material value has to quote its supporting text
//     verbatim so a human reviewing the proposal can see where it came from.
//
//   · Output shape is enforced STRUCTURALLY via a forced tool call, not by
//     asking for "JSON only" — then validated again here, and discarded whole
//     if it fails. Nothing is repaired: a half-understood note must never
//     become confirmed trip state.
//
//   · Responses are NEVER edge-cached. Notes are unique per user and per
//     moment, so a cache would be pure downside plus a cross-user leak risk.
//
// The client treats 404/405/501 as "route not deployed or not configured" and
// silently falls back to its own deterministic parser, so an old Worker (or no
// API key at all) degrades to reduced recall rather than a broken feature.

const EXTRACT_SYSTEM = [
  'You extract structured trip facts from one short, informal travel note.',
  '',
  'Rules, in priority order:',
  '1. NEVER invent. If the note does not state something, leave it null and list',
  '   it in missing_fields. Missing data is safe; guessed data is not.',
  '2. Quote supporting text VERBATIM in source_text for every value you emit.',
  '   The substring must appear character-for-character in the note.',
  '3. Resolve relative dates ONLY against the supplied `today` and `tz`. Never',
  '   assume a year that is not derivable from them.',
  '4. Set is_inferred=true for anything you derived rather than read directly.',
  '5. If a city has more than one plausible airport (Chicago, New York, London,',
  '   Houston, Dallas, Washington), do NOT pick one. Leave the code null and add',
  '   a conflicts entry with reason "multi_airport_city" listing the options.',
  '6. If the note gives two different values for the same thing, emit BOTH as a',
  '   conflicts entry. Do not silently choose.',
  '7. Segments are ordered travel legs, max 2 (round trip = 1 segment; open jaw',
  '   = 2). Do not collapse an open jaw into a round trip.',
  '8. Do not recommend anything, do not decide whether to book, and never emit',
  '   a URL. Extraction only.',
  '',
  'Return your result by calling the record_trip_facts tool exactly once.',
].join('\n');

const EXTRACT_TOOL = {
  name: 'record_trip_facts',
  description: 'Record the trip facts stated in the note. Omit anything not stated.',
  input_schema: {
    type: 'object',
    properties: {
      segments: {
        type: 'array',
        maxItems: 2,
        description: 'Ordered travel legs actually stated in the note.',
        items: {
          type: 'object',
          properties: {
            origin: { type: ['string', 'null'], description: '3-letter IATA code, or null if not stated / ambiguous.' },
            destination: { type: ['string', 'null'], description: '3-letter IATA code, or null if not stated / ambiguous.' },
            departure_date: { type: ['string', 'null'], description: 'YYYY-MM-DD, or null.' },
            flight_number: { type: ['string', 'null'] },
            confidence: { type: 'number' },
            source_text: { type: 'string', description: 'Verbatim substring of the note.' },
            is_inferred: { type: 'boolean' },
          },
          required: ['origin', 'destination', 'departure_date', 'confidence', 'source_text'],
        },
      },
      constraints: {
        type: 'array',
        description: 'Hard time anchors the itinerary must satisfy (briefings, check-ins, ceremonies).',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['must_arrive_before', 'must_depart_after', 'must_be_present'] },
            datetime: { type: 'string', description: 'YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS.' },
            label: { type: 'string' },
            confidence: { type: 'number' },
            source_text: { type: 'string' },
            is_inferred: { type: 'boolean' },
          },
          required: ['type', 'datetime', 'label', 'confidence', 'source_text'],
        },
      },
      companions: {
        type: 'array',
        description: 'Other people whose participation affects the decision.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            status: { type: 'string', enum: ['in', 'tentative', 'out', 'unknown'] },
            confidence: { type: 'number' },
            source_text: { type: 'string' },
            is_inferred: { type: 'boolean' },
          },
          required: ['label', 'status', 'confidence', 'source_text'],
        },
      },
      target_price: { type: ['number', 'null'], description: 'Budget ceiling in USD if stated.' },
      decision_deadline: { type: ['string', 'null'], description: 'YYYY-MM-DD if stated.' },
      missing_fields: {
        type: 'array', items: { type: 'string' },
        description: 'Dotted paths the note left unstated, e.g. segments.0.origin.',
      },
      conflicts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field_path: { type: 'string' },
            values: { type: 'array', items: {} },
            reason: { type: 'string' },
            source_text: { type: 'string' },
          },
          required: ['field_path', 'values', 'reason'],
        },
      },
    },
    required: ['segments', 'constraints', 'companions', 'missing_fields', 'conflicts'],
  },
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;

// Deliberately a near-copy of the client's validateExtraction(). There is no
// module boundary between a Cloudflare Worker and a single-file HTML app, so
// the choice is duplication or trust — and trusting unvalidated model output to
// cross the wire into stored trip state is not a trade worth making. Keep the
// two in sync; both carry this note.
function validateExtractionShape(obj) {
  const errs = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['not an object'] };
  for (const k of ['segments', 'constraints', 'companions', 'missing_fields', 'conflicts']) {
    if (!Array.isArray(obj[k])) errs.push(`${k} must be an array`);
  }
  if (obj.target_price != null && typeof obj.target_price !== 'number') errs.push('target_price must be a number or null');
  if (obj.decision_deadline != null && !ISO_DATE_RE.test(String(obj.decision_deadline))) errs.push('decision_deadline must be YYYY-MM-DD or null');
  if (Array.isArray(obj.segments)) {
    if (obj.segments.length > 2) errs.push('at most 2 segments supported');
    obj.segments.forEach((g, i) => {
      if (!g || typeof g !== 'object') { errs.push(`segments.${i} not an object`); return; }
      if (g.origin != null && !CODE_RE.test(String(g.origin))) errs.push(`segments.${i}.origin bad code`);
      if (g.destination != null && !CODE_RE.test(String(g.destination))) errs.push(`segments.${i}.destination bad code`);
      if (g.departure_date != null && !ISO_DATE_RE.test(String(g.departure_date))) errs.push(`segments.${i}.departure_date not YYYY-MM-DD`);
    });
  }
  return { ok: errs.length === 0, errors: errs };
}

async function handleExtract(request, env) {
  const apiKey = env.ANTHROPIC_KEY || env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // 501, not 500: "this Worker does not offer extraction", which is exactly
    // what the client needs to hear to fall back quietly instead of retrying.
    return jsonError('Extraction not configured on this Worker (no ANTHROPIC_API_KEY secret)', 501, request, 'no_key');
  }

  let raw;
  try {
    raw = await request.text();
  } catch (e) {
    return jsonError('Could not read request body', 400, request, 'bad_body');
  }
  if (raw.length > MAX_BODY_BYTES) {
    return jsonError('Request body too large', 413, request, 'too_large');
  }

  let body;
  try { body = JSON.parse(raw); } catch (e) {
    return jsonError('Body must be JSON', 400, request, 'bad_body');
  }
  const note = body && body.context_event && typeof body.context_event.raw_text === 'string'
    ? body.context_event.raw_text : null;
  if (!note || !note.trim()) {
    return jsonError('context_event.raw_text is required', 400, request, 'bad_body');
  }
  const today = (body.today && ISO_DATE_RE.test(String(body.today))) ? String(body.today) : null;
  if (!today) {
    // Without a reference date the model cannot resolve "Sep 4" without
    // inventing a year, and inventing is the one thing it must not do.
    return jsonError('today (YYYY-MM-DD) is required', 400, request, 'bad_body');
  }
  const tz = typeof body.tz === 'string' ? body.tz.slice(0, 64) : 'UTC';

  const userPayload = {
    today,
    tz,
    note,
    confirmed_trip_state: body.trip_state || null,
  };

  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), EXTRACT_TIMEOUT_MS) : null;

  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: 1024,
        system: EXTRACT_SYSTEM,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'tool', name: EXTRACT_TOOL.name },
        messages: [{ role: 'user', content: JSON.stringify(userPayload) }],
      }),
      signal: ctrl ? ctrl.signal : undefined,
    });
  } catch (e) {
    if (timer) clearTimeout(timer);
    const aborted = e && e.name === 'AbortError';
    return jsonError(
      aborted ? `Extraction timed out after ${EXTRACT_TIMEOUT_MS}ms` : `Extraction request failed: ${e.message}`,
      aborted ? 504 : 502, request, aborted ? 'timeout' : 'upstream'
    );
  }
  if (timer) clearTimeout(timer);

  const text = await res.text();
  if (!res.ok) {
    // Forward the upstream STATUS CLASS only — never the upstream body. The
    // client needs to distinguish "my key is bad" (401/403, worth telling the
    // user) from "try again" (429/5xx), and the status alone carries that.
    // Echoing the body would pipe arbitrary upstream text through to the page;
    // it is logged here instead, where `wrangler tail` shows it to the operator
    // and to nobody else.
    console.warn('[extract] Anthropic ' + res.status + ': ' + text.slice(0, 400));
    return jsonError(`Anthropic API returned ${res.status}`, res.status === 429 ? 429 : 502, request,
      res.status === 401 || res.status === 403 ? 'bad_key' : 'upstream');
  }

  let parsed;
  try { parsed = JSON.parse(text); } catch (e) {
    return jsonError('Anthropic response was not JSON', 502, request, 'bad_json');
  }

  // Pull the forced tool call. Anything else — a text reply, a refusal, a
  // second tool — means the model did not do what was asked, and we fail
  // closed rather than trying to salvage it.
  let extraction = null;
  const content = Array.isArray(parsed.content) ? parsed.content : [];
  for (const block of content) {
    if (block && block.type === 'tool_use' && block.name === EXTRACT_TOOL.name) {
      extraction = block.input;
      break;
    }
  }
  if (!extraction) {
    return jsonError('Model did not return the expected tool call', 502, request, 'bad_json');
  }

  const check = validateExtractionShape(extraction);
  if (!check.ok) {
    return jsonError(`Extraction failed schema validation: ${check.errors.join('; ')}`, 502, request, 'bad_json');
  }

  return new Response(JSON.stringify({
    ok: true,
    parser_version: 'llm-1',
    model: parsed.model || (env.ANTHROPIC_MODEL || DEFAULT_MODEL),
    extraction,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Notes are unique and personal — never cache, at any layer.
      'Cache-Control': 'no-store',
      ...corsHeaders(request),
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PIA-063: REAL FARE ALERTS — delivery (POST /alert) + daily cron check
// ═══════════════════════════════════════════════════════════════════════════
// Realizes the PIA-051/052 contract. Two independent halves:
//
//   A. DELIVERY — POST /alert sends ONE client-built AlertEvent by email.
//      The client drains its pialax_alert_log_v1 outbox through this route
//      and marks events `sent`. Validation mirrors the client's
//      sanitizeAlertEvent and FAILS CLOSED — a malformed event is never sent.
//
//   B. WATCHING — POST /alerts/sync stores the device's active fare watches
//      in KV; a daily Cron Trigger re-prices each watch via SerpAPI (through
//      the same 24h edge cache the browser uses, so a day the user browsed
//      costs zero extra quota) and emails on a real drop or an approaching
//      departure. This is the half that works with the app CLOSED.
//
// Provider: Resend (https://resend.com). With no custom domain, Resend's
// onboarding@resend.dev sender delivers only to the account owner's own
// verified email — exactly right for this single-family dashboard.
//
// SETUP (one-time):
//   1. resend.com → sign up with the alert recipient's email → API key.
//   2. wrangler kv namespace create ALERTS   → paste the id into wrangler.toml
//   3. wrangler secret put RESEND_API_KEY
//   4. wrangler deploy   (wrangler.toml already carries the cron trigger)
// Optional env vars: ALERT_FROM (verified sender), ALERT_CRON_MAX (fetch cap).
//
// Every route degrades exactly like /extract: 501 + code tells the client
// "not configured here", and the dashboard falls back to preview-only.

const RESEND_URL = 'https://api.resend.com/emails';
const ALERT_FROM_DEFAULT = 'PIALAX <onboarding@resend.dev>';
const DASH_URL = 'https://shwinster101.github.io/PIALAX/';
const ALERT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;   // mirrors client TA_ID_RE
const ALERT_EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]{1,63}(\.[^\s@.]{1,63})+$/;
const IATA_RE = /^[A-Z]{3}$/;
const ALERT_TYPES = { fare_drop: 1, constraint_violation: 1, deadline_approaching: 1, conflict_needs_you: 1, test: 1 };
const MAX_WATCHES = 10;
const CRON_MAX_FETCHES_DEFAULT = 8;

function alertsCors(request, extra) {
  return Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, corsHeaders(request), extra || {});
}

async function readJsonBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return { err: jsonErrorSpec('Request body too large', 413, 'too_large') };
  try { return { body: JSON.parse(raw) }; } catch (e) { return { err: jsonErrorSpec('Body must be JSON', 400, 'bad_body') }; }
}
function jsonErrorSpec(msg, status, code) { return { msg, status, code }; }

// Fail-closed validation of one AlertEvent + recipient. Returns {to, event} or null.
function validateAlertPayload(body) {
  if (!body || typeof body !== 'object') return null;
  const to = typeof body.to === 'string' ? body.to.trim() : '';
  if (!ALERT_EMAIL_RE.test(to) || to.length > 200) return null;
  const e = body.event;
  if (!e || typeof e !== 'object') return null;
  if (typeof e.id !== 'string' || !ALERT_ID_RE.test(e.id)) return null;
  if (typeof e.trip_id !== 'string' || !ALERT_ID_RE.test(e.trip_id)) return null;
  if (!Object.prototype.hasOwnProperty.call(ALERT_TYPES, e.type)) return null;
  const subject = typeof e.subject === 'string' ? e.subject.slice(0, 200) : '';
  const bodyText = typeof e.body_text === 'string' ? e.body_text.slice(0, 1000) : '';
  if (!subject.trim() || !bodyText.trim()) return null;
  return { to, event: { id: e.id, trip_id: e.trip_id, type: e.type, subject, body_text: bodyText } };
}

async function sendViaResend(env, to, subject, text) {
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.RESEND_API_KEY },
    body: JSON.stringify({
      from: env.ALERT_FROM || ALERT_FROM_DEFAULT,
      to: [to],
      subject: subject,
      text: text + '\n\n—\nPIALAX family flight dashboard\n' + DASH_URL,
    }),
  });
  if (!res.ok) {
    // Log the body for `wrangler tail`; never forward it (same rule as /extract).
    console.warn('[alert] Resend ' + res.status + ': ' + (await res.text()).slice(0, 300));
  }
  return res;
}

async function handleAlertSend(request, env) {
  if (!env.RESEND_API_KEY) {
    return jsonError('Alert delivery not configured on this Worker (no RESEND_API_KEY secret)', 501, request, 'no_key');
  }
  let parsed;
  try { parsed = await readJsonBody(request); } catch (e) { return jsonError('Could not read request body', 400, request, 'bad_body'); }
  if (parsed.err) return jsonError(parsed.err.msg, parsed.err.status, request, parsed.err.code);
  const v = validateAlertPayload(parsed.body);
  if (!v) return jsonError('Invalid alert payload', 400, request, 'bad_body');
  try {
    const res = await sendViaResend(env, v.to, '✈️ PIALAX · ' + v.event.subject, v.event.body_text);
    if (res.ok) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: alertsCors(request) });
    }
    return jsonError('Email provider returned ' + res.status, res.status === 429 ? 429 : 502, request,
      res.status === 401 || res.status === 403 ? 'bad_key' : 'upstream');
  } catch (e) {
    return jsonError('Email send failed: ' + e.message, 502, request, 'upstream');
  }
}

// One watch = one route+dates the cron re-prices daily. Strict allowlist of
// fields; anything off-shape rejects the WHOLE sync (fail closed — a partial
// config silently watching the wrong trips is worse than an error).
function validateWatch(w) {
  if (!w || typeof w !== 'object') return null;
  if (typeof w.trip_id !== 'string' || !ALERT_ID_RE.test(w.trip_id)) return null;
  const from = typeof w.from === 'string' ? w.from.toUpperCase() : '';
  const to = typeof w.to === 'string' ? w.to.toUpperCase() : '';
  if (!IATA_RE.test(from) || !IATA_RE.test(to) || from === to) return null;
  if (typeof w.dep !== 'string' || !ISO_DATE_RE.test(w.dep)) return null;
  const ret = (typeof w.ret === 'string' && ISO_DATE_RE.test(w.ret)) ? w.ret : null;
  const pct = (typeof w.threshold_pct === 'number' && w.threshold_pct >= 1 && w.threshold_pct <= 100) ? w.threshold_pct : 10;
  const remind = (typeof w.remind_days === 'number' && w.remind_days >= 0 && w.remind_days <= 60) ? w.remind_days : 3;
  const baseline = (typeof w.baseline === 'number' && w.baseline > 0 && w.baseline < 100000) ? Math.round(w.baseline) : null;
  const label = typeof w.label === 'string' ? w.label.slice(0, 80) : (from + ' → ' + to);
  return { trip_id: w.trip_id, label, from, to, dep: w.dep, ret, threshold_pct: pct, remind_days: remind, baseline };
}

async function handleAlertsSync(request, env) {
  if (!env.ALERTS) {
    return jsonError('Alert watching not configured on this Worker (no ALERTS KV binding)', 501, request, 'no_kv');
  }
  let parsed;
  try { parsed = await readJsonBody(request); } catch (e) { return jsonError('Could not read request body', 400, request, 'bad_body'); }
  if (parsed.err) return jsonError(parsed.err.msg, parsed.err.status, request, parsed.err.code);
  const body = parsed.body || {};
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!ALERT_EMAIL_RE.test(email) || email.length > 200) return jsonError('Valid email is required', 400, request, 'bad_body');
  if (!Array.isArray(body.watches) || body.watches.length > MAX_WATCHES) {
    return jsonError('watches must be an array of at most ' + MAX_WATCHES, 400, request, 'bad_body');
  }
  const watches = [];
  for (const w of body.watches) {
    const v = validateWatch(w);
    if (!v) return jsonError('Invalid watch in payload', 400, request, 'bad_body');
    watches.push(v);
  }
  await env.ALERTS.put('alerts:config', JSON.stringify({ email, watches, synced_at: new Date().toISOString() }));
  return new Response(JSON.stringify({ ok: true, stored: watches.length }), { status: 200, headers: alertsCors(request) });
}

async function handleAlertsStatus(request, env) {
  if (!env.ALERTS) {
    return jsonError('Alert watching not configured on this Worker (no ALERTS KV binding)', 501, request, 'no_kv');
  }
  let config = null, lastRun = null;
  try {
    config = JSON.parse((await env.ALERTS.get('alerts:config')) || 'null');
    lastRun = JSON.parse((await env.ALERTS.get('alerts:last_run')) || 'null');
  } catch (e) { /* corrupt KV — report as unconfigured */ }
  const email = config && typeof config.email === 'string' ? config.email : '';
  const masked = email ? email.replace(/^(.).*(@.).*(\..+)$/, '$1***$2***$3') : null;
  return new Response(JSON.stringify({
    ok: true,
    delivery_configured: !!env.RESEND_API_KEY,
    watches: config && Array.isArray(config.watches) ? config.watches.length : 0,
    email_masked: masked,
    synced_at: config ? config.synced_at || null : null,
    last_run: lastRun,
  }), { status: 200, headers: alertsCors(request) });
}

// Cache-first SerpAPI price for one watch. Shares the browser's 24h edge cache
// key (params without api_key), so a route the family already looked at today
// costs zero quota. Returns { price, fromCache } or { price: null }.
async function cronFetchPrice(watch, env, counters) {
  const params = new URLSearchParams();
  params.set('engine', 'google_flights');
  params.set('departure_id', watch.from);
  params.set('arrival_id', watch.to);
  params.set('outbound_date', watch.dep);
  if (watch.ret) { params.set('type', '1'); params.set('return_date', watch.ret); }
  else params.set('type', '2');
  params.set('currency', 'USD');
  params.set('hl', 'en');

  const cacheKey = new Request(SERPAPI_BASE + '?' + params.toString(), { method: 'GET' });
  const cache = (typeof caches !== 'undefined' && caches.default) ? caches.default : null;
  let bodyText = null;
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) { bodyText = await hit.text(); counters.cached++; }
  }
  if (bodyText == null) {
    params.set('api_key', env.SERPAPI_KEY);
    const res = await fetch(SERPAPI_BASE + '?' + params.toString(), { headers: { 'User-Agent': 'PIALAX-Proxy/1.0' } });
    if (!res.ok) { console.warn('[alert-cron] SerpAPI ' + res.status + ' for ' + watch.from + '-' + watch.to); return { price: null }; }
    bodyText = await res.text();
    counters.spent++;
    if (cache) {
      await cache.put(cacheKey, new Response(bodyText, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-SerpAPI-Status': '200', 'Cache-Control': 'public, max-age=86400' },
      }));
    }
  }
  try {
    const j = JSON.parse(bodyText);
    const best = (Array.isArray(j.best_flights) && j.best_flights[0] && j.best_flights[0].price)
      || (Array.isArray(j.other_flights) && j.other_flights[0] && j.other_flights[0].price)
      || (j.price_insights && j.price_insights.lowest_price)
      || null;
    return { price: (typeof best === 'number' && best > 0) ? best : null };
  } catch (e) { return { price: null }; }
}

async function runAlertCron(env) {
  if (!env.ALERTS) return;   // KV not bound — feature off, nothing to record it in
  const summary = { at: new Date().toISOString(), checked: 0, sent: 0, spent: 0, cached: 0, skipped: null };
  try {
    if (!env.SERPAPI_KEY || !env.RESEND_API_KEY) {
      summary.skipped = !env.SERPAPI_KEY ? 'no SERPAPI_KEY' : 'no RESEND_API_KEY';
      await env.ALERTS.put('alerts:last_run', JSON.stringify(summary));
      return;
    }
    const config = JSON.parse((await env.ALERTS.get('alerts:config')) || 'null');
    if (!config || !ALERT_EMAIL_RE.test(String(config.email || '')) || !Array.isArray(config.watches) || !config.watches.length) {
      summary.skipped = 'no watches synced';
      await env.ALERTS.put('alerts:last_run', JSON.stringify(summary));
      return;
    }
    const state = JSON.parse((await env.ALERTS.get('alerts:state')) || '{}') || {};
    const today = summary.at.slice(0, 10);
    const maxFetches = (typeof env.ALERT_CRON_MAX === 'string' && parseInt(env.ALERT_CRON_MAX, 10) > 0)
      ? parseInt(env.ALERT_CRON_MAX, 10) : CRON_MAX_FETCHES_DEFAULT;
    const counters = { spent: 0, cached: 0 };

    for (const raw of config.watches) {
      const w = validateWatch(raw);
      if (!w) continue;
      if (w.dep < today) continue;                    // departed — stale watch
      if (summary.checked >= maxFetches) break;       // hard quota ceiling per run
      summary.checked++;

      // One watch failing (bad route, upstream hiccup) must not kill the run.
      try {
        const got = await cronFetchPrice(w, env, counters);
        const st = state[w.trip_id] || {};
        const daysLeft = Math.round((new Date(w.dep + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);

        if (got.price != null) {
          if (!(st.first_price > 0)) st.first_price = got.price;
          const baseline = w.baseline || st.first_price;
          const target = baseline * (1 - w.threshold_pct / 100);
          // Re-alert only when the fare drops MATERIALLY below the last alert
          // ($10 buckets, same spirit as the client's dedupe key) — never a
          // daily repeat about the same price.
          const dropHit = got.price <= target && (!(st.last_alert_price > 0) || got.price <= st.last_alert_price - 10);
          if (dropHit) {
            const res = await sendViaResend(env, config.email,
              '✈️ PIALAX · ' + w.label + ' dropped to $' + got.price,
              w.from + ' → ' + w.to + ' · ' + w.dep + (w.ret ? ' – ' + w.ret : '') +
              '\nNow $' + got.price + ' (baseline $' + Math.round(baseline) + ', your threshold ' + w.threshold_pct + '%).' +
              '\nDeparts in ' + daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + '.' +
              '\n\nOpen the trip: ' + DASH_URL);
            if (res.ok) { summary.sent++; st.last_alert_price = got.price; st.last_alert_day = today; }
          }
          st.last_price = got.price;
        }

        // Departure-window reminder — once per watch, price known or not.
        if (daysLeft >= 0 && daysLeft <= w.remind_days && !st.deadline_sent) {
          const res = await sendViaResend(env, config.email,
            '✈️ PIALAX · ' + w.label + ' departs ' + (daysLeft === 0 ? 'TODAY' : 'in ' + daysLeft + ' day' + (daysLeft === 1 ? '' : 's')),
            w.from + ' → ' + w.to + ' · ' + w.dep + (w.ret ? ' – ' + w.ret : '') +
            (st.last_price ? '\nLatest fare seen: $' + st.last_price + '.' : '') +
            '\nStill unbooked on the watchlist — decide now.' +
            '\n\nOpen the trip: ' + DASH_URL);
          if (res.ok) { summary.sent++; st.deadline_sent = true; }
        }

        st.last_checked = today;
        state[w.trip_id] = st;
      } catch (e) {
        console.warn('[alert-cron] watch ' + w.trip_id + ' failed: ' + e.message);
      }
    }
    summary.spent = counters.spent;
    summary.cached = counters.cached;
    await env.ALERTS.put('alerts:state', JSON.stringify(state));
    await env.ALERTS.put('alerts:last_run', JSON.stringify(summary));
  } catch (e) {
    console.warn('[alert-cron] run failed: ' + e.message);
    try {
      summary.skipped = 'error: ' + e.message;
      await env.ALERTS.put('alerts:last_run', JSON.stringify(summary));
    } catch (e2) { /* KV write failed too — nothing left to do */ }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared trip ideas — PIA-071 (storage) · PIA-072 (RSVP) · PIA-073 (decision)
// ═══════════════════════════════════════════════════════════════════════════
// One KV record per trip idea, addressed by an unguessable id (128 random
// bits). The link IS the capability: anyone holding ?idea=<id> can read the
// proposal and add an RSVP for one of its listed members — the same trust
// model as the family sharing a Google Doc link. Organizer-only changes
// (editing the proposal, recording the decision) also need the edit key that
// POST /idea returned once; only its SHA-256 lives in KV, so a leaked record
// or a GET never reveals it.
//
//   POST /idea                 {idea}                 → {id, edit_key, doc}
//   GET  /idea?id=…                                   → {doc}
//   POST /idea/respond?id=…    {member, status, …}    → {doc}
//   POST /idea/update?id=…     {edit_key, idea?, decision?} → {doc}
//
// No IDEAS binding → 501 no_kv, which the client reads as "shared ideas not
// set up" and falls back to its read-only ?tripIdea= link.

const IDEA_ID_RE = /^[A-Za-z0-9_-]{22}$/;
const IDEA_KEY_RE = /^[A-Za-z0-9_-]{32,64}$/;
const IDEA_TTL_SECONDS = 400 * 86400;          // a year of planning + a margin
const IDEA_MAX_MEMBERS = 8;
const IDEA_MAX_LOG = 50;
const IDEA_STATUSES = { in: 1, maybe: 1, out: 1 };
const IDEA_STAGES = { proposed: 1, chosen: 1, booked: 1, dropped: 1 };

function ideaRandom(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function ideaHash(key) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const ideaStr = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ideaIata = (v) => { const s = typeof v === 'string' ? v.trim().toUpperCase() : ''; return IATA_RE.test(s) ? s : ''; };
const ideaDate = (v) => (typeof v === 'string' && ISO_DATE_RE.test(v) ? v : '');
const ideaMoney = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 && v < 1000000 ? Math.round(v) : null);

// Strict allowlist — anything off-shape is dropped field by field; a proposal
// with no members is rejected whole (nobody could RSVP to it).
function validateIdea(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const dest = raw.destination && typeof raw.destination === 'object' ? raw.destination : {};
  const dates = raw.dates && typeof raw.dates === 'object' ? raw.dates : {};
  const r = raw.recommendation && typeof raw.recommendation === 'object' ? raw.recommendation : null;
  if (!Array.isArray(raw.members) || !raw.members.length || raw.members.length > IDEA_MAX_MEMBERS) return null;
  const members = [];
  for (const m of raw.members) {
    if (!m || typeof m !== 'object' || !CODE_RE.test(String(m.code || ''))) return null;
    if (members.some((x) => x.code === m.code)) return null;
    const hc = Number(m.headcount);
    members.push({ code: m.code, label: ideaStr(m.label, 40) || m.code, airport: ideaIata(m.airport), headcount: hc >= 1 && hc <= 9 ? Math.round(hc) : 1 });
  }
  return {
    title: ideaStr(raw.title, 80) || 'Trip idea',
    destination: { city: ideaStr(dest.city, 60), airport: ideaIata(dest.airport) },
    dates: { departure: ideaDate(dates.departure), return: ideaDate(dates.return), searchStart: ideaDate(dates.searchStart), searchEnd: ideaDate(dates.searchEnd) },
    recommendation: r ? {
      city: ideaStr(r.city, 60), airport: ideaIata(r.airport), hub: ideaStr(r.hub, 16),
      fareFrom: ideaIata(r.fareFrom), fareTo: ideaIata(r.fareTo),
      departure: ideaDate(r.departure), return: ideaDate(r.return),
      totalFare: ideaMoney(r.totalFare), perTicketFare: ideaMoney(r.perTicketFare),
      headcount: Number(r.headcount) >= 1 && Number(r.headcount) <= 9 ? Math.round(Number(r.headcount)) : 1,
      priceStatus: ['live', 'cached', 'estimated', 'unavailable', 'host'].indexOf(r.priceStatus) >= 0 ? r.priceStatus : 'estimated',
      // PIA-073: whole-family estimate (all hubs × travelers) — the number compared with the actual total.
      familyTotal: ideaMoney(r.familyTotal),
      familyStatus: ['cached', 'estimated', 'partial'].indexOf(r.familyStatus) >= 0 ? r.familyStatus : null,
    } : null,
    notes: ideaStr(raw.notes, 500),
    members,
  };
}

function validateResponse(raw, members) {
  if (!raw || typeof raw !== 'object') return null;
  const member = members.find((m) => m.code === raw.member);
  if (!member || !Object.prototype.hasOwnProperty.call(IDEA_STATUSES, raw.status)) return null;
  const from = ideaDate(raw.available_from), to = ideaDate(raw.available_to);
  if (from && to && to < from) return null;
  return {
    member: member.code,
    status: raw.status,
    origin: ideaIata(raw.origin) || member.airport,
    available_from: from, available_to: to,
    note: ideaStr(raw.note, 280),
    updated_at: new Date().toISOString(),
  };
}

// Organizer decision transitions. `booked` needs a prior choice and an actual
// total — that pairing (estimate vs what was paid) is the point of the log.
function applyDecision(doc, raw) {
  if (!raw || typeof raw !== 'object' || !Object.prototype.hasOwnProperty.call(IDEA_STAGES, raw.stage)) return 'Unknown decision stage';
  const now = new Date().toISOString(), d = doc.decision;
  if (raw.stage === 'chosen') {
    const chosen = validateIdea({ members: doc.idea.members, recommendation: raw.chosen || doc.idea.recommendation }).recommendation;
    if (!chosen) return 'Nothing to choose — the proposal has no recommendation';
    const estimate = chosen.familyTotal != null ? chosen.familyTotal : chosen.totalFare;
    doc.decision = { stage: 'chosen', chosen, chosen_at: now, estimate_total: estimate, actual_total: null, booked_at: null, delta_pct: null };
  } else if (raw.stage === 'booked') {
    if (!d.chosen) return 'Choose an option before marking it booked';
    const actual = ideaMoney(raw.actual_total);
    if (actual == null || actual === 0) return 'actual_total must be a positive number';
    const est = d.estimate_total;
    d.stage = 'booked'; d.actual_total = actual; d.booked_at = now;
    d.delta_pct = est ? Math.round(((actual - est) / est) * 1000) / 10 : null;
  } else if (raw.stage === 'dropped') {
    d.stage = 'dropped';
  } else {
    doc.decision = { stage: 'proposed', chosen: null, chosen_at: null, estimate_total: null, actual_total: null, booked_at: null, delta_pct: null };
  }
  return '';
}

function ideaPublic(doc) {
  const out = Object.assign({}, doc);
  delete out.edit_hash;
  return out;
}
// PIA-104: family members don't get prices — only a request carrying the
// organizer's edit key (X-Idea-Key) does. Dates stay: the RSVP calendar needs
// the trip's month. `organizer` tells the client whether its key matched;
// `preview` tells it this Worker serves /i/<id> link previews.
async function ideaIsOrganizer(request, doc) {
  const k = request.headers.get('X-Idea-Key') || '';
  return IDEA_KEY_RE.test(k) && (await ideaHash(k)) === doc.edit_hash;
}
function ideaGuestView(doc) {
  const out = ideaPublic(doc);
  const strip = (r) => (r ? Object.assign({}, r, { totalFare: null, perTicketFare: null, familyTotal: null, familyStatus: null }) : r);
  out.idea = Object.assign({}, out.idea, { recommendation: strip(out.idea && out.idea.recommendation) });
  out.decision = Object.assign({}, out.decision, { chosen: strip(out.decision && out.decision.chosen), estimate_total: null, actual_total: null, delta_pct: null });
  return out;
}
async function ideaView(request, doc) {
  const organizer = await ideaIsOrganizer(request, doc);
  return { doc: organizer ? ideaPublic(doc) : ideaGuestView(doc), organizer, preview: true };
}
function ideaLog(doc, event, by) {
  doc.log = (doc.log || []).concat([{ at: new Date().toISOString(), event, by: by || null }]).slice(-IDEA_MAX_LOG);
}
async function ideaRead(env, id) {
  try { return JSON.parse((await env.IDEAS.get('idea:' + id)) || 'null'); } catch (e) { return null; }
}
async function ideaWrite(env, doc) {
  doc.updated_at = new Date().toISOString();
  await env.IDEAS.put('idea:' + doc.id, JSON.stringify(doc), { expirationTtl: IDEA_TTL_SECONDS });
}
const ideaOk = (request, payload, status) => new Response(JSON.stringify(Object.assign({ ok: true }, payload)), { status: status || 200, headers: alertsCors(request) });

// ── PIA-104: GET /i/<id> — the RSVP link shared in the family group text ──
// Chat apps build their link preview from Open Graph tags without running
// JavaScript, and the static Pages app has none, so iMessage showed a generic
// "PIALAX — Family Flight Dashboard". Link-preview fetchers get a small page
// with the trip's title and a loose time (no price, no exact dates — PIA-098);
// people get a 302 straight to the app's ?idea=<id> page.
const PREVIEW_BOT_RE = /facebookexternalhit|Facebot|Twitterbot|Slackbot|WhatsApp|TelegramBot|Discordbot|LinkedInBot|Applebot|SkypeUriPreview|Embedly|Iframely|bot\b|crawler|spider|preview/i;
const IDEA_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const htmlEsc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function ideaLooseWhen(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  const day = +m[3];
  return (day <= 10 ? 'Early ' : day <= 20 ? 'Mid-' : 'Late ') + IDEA_MONTHS[+m[2] - 1];
}
async function handleIdeaPreview(request, env, id) {
  const target = IDEA_ID_RE.test(id) ? DASH_URL + '?idea=' + id : DASH_URL;
  const isBot = PREVIEW_BOT_RE.test(request.headers.get('User-Agent') || '');
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' };
  if (!isBot) return new Response(null, { status: 302, headers: Object.assign({ Location: target }, headers) });
  let title = 'PIALAX — family trip', desc = 'Tap to say in / maybe / out and pick your dates.', status = 200;
  if (!IDEA_ID_RE.test(id)) { status = 400; desc = 'This RSVP link looks incomplete.'; }
  else if (env.IDEAS) {
    const doc = await ideaRead(env, id);
    if (!doc) { status = 404; title = 'Trip idea not found'; desc = 'This RSVP link may have expired.'; }
    else {
      const idea = doc.idea || {}, r = idea.recommendation || {}, d = idea.dates || {};
      const when = ideaLooseWhen(r.departure || d.departure || d.searchStart);
      title = idea.title || 'Family trip';
      desc = (when ? when + ' · ' : '') + desc;
    }
  }
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>' + htmlEsc(title) + '</title>' +
    '<meta property="og:title" content="' + htmlEsc(title) + '"><meta property="og:description" content="' + htmlEsc(desc) + '">' +
    '<meta property="og:type" content="website"><meta property="og:site_name" content="PIALAX"><meta property="og:url" content="' + htmlEsc(target) + '">' +
    '<meta name="twitter:card" content="summary"><meta name="twitter:title" content="' + htmlEsc(title) + '"><meta name="twitter:description" content="' + htmlEsc(desc) + '">' +
    // A person misread as a fetcher still lands in the app (fetchers don't run scripts).
    '<script>location.replace(' + JSON.stringify(target).replace(/</g, '\\u003c') + ')</script>' +
    '</head><body><p><a href="' + htmlEsc(target) + '">' + htmlEsc(title) + ' — ' + htmlEsc(desc) + '</a></p></body></html>';
  return new Response(html, { status, headers: Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, headers) });
}

async function handleIdea(request, env, pathname) {
  if (!env.IDEAS) return jsonError('Shared trip ideas not configured on this Worker (no IDEAS KV binding)', 501, request, 'no_kv');
  const id = new URL(request.url).searchParams.get('id') || '';

  if (request.method === 'GET') {
    if (!IDEA_ID_RE.test(id)) return jsonError('Missing or malformed id', 400, request, 'bad_id');
    const doc = await ideaRead(env, id);
    return doc ? ideaOk(request, await ideaView(request, doc)) : jsonError('Trip idea not found', 404, request, 'not_found');
  }

  let parsed;
  try { parsed = await readJsonBody(request); } catch (e) { return jsonError('Could not read request body', 400, request, 'bad_body'); }
  if (parsed.err) return jsonError(parsed.err.msg, parsed.err.status, request, parsed.err.code);
  const body = parsed.body || {};

  if (pathname === '/idea') {
    const idea = validateIdea(body.idea);
    if (!idea) return jsonError('Invalid trip idea', 400, request, 'bad_body');
    const editKey = ideaRandom(32);
    const doc = {
      v: 1, id: ideaRandom(16), created_at: new Date().toISOString(), updated_at: null,
      edit_hash: await ideaHash(editKey), idea, responses: {},
      decision: { stage: 'proposed', chosen: null, chosen_at: null, estimate_total: null, actual_total: null, booked_at: null, delta_pct: null },
      log: [],
    };
    ideaLog(doc, 'created');
    await ideaWrite(env, doc);
    return ideaOk(request, { id: doc.id, edit_key: editKey, doc: ideaPublic(doc), organizer: true, preview: true }, 201);
  }

  if (!IDEA_ID_RE.test(id)) return jsonError('Missing or malformed id', 400, request, 'bad_id');
  const doc = await ideaRead(env, id);
  if (!doc) return jsonError('Trip idea not found', 404, request, 'not_found');

  if (pathname === '/idea/respond') {
    if (doc.decision && (doc.decision.stage === 'booked' || doc.decision.stage === 'dropped')) {
      return jsonError('This trip idea is closed', 409, request, 'closed');
    }
    const resp = validateResponse(body, doc.idea.members);
    if (!resp) return jsonError('Invalid response', 400, request, 'bad_body');
    doc.responses[resp.member] = resp;
    ideaLog(doc, 'rsvp:' + resp.status, resp.member);
    await ideaWrite(env, doc);
    return ideaOk(request, await ideaView(request, doc));
  }

  if (pathname === '/idea/update') {
    if (typeof body.edit_key !== 'string' || !IDEA_KEY_RE.test(body.edit_key) || (await ideaHash(body.edit_key)) !== doc.edit_hash) {
      return jsonError('Edit key does not match this trip idea', 403, request, 'forbidden');
    }
    if (body.idea) {
      const idea = validateIdea(body.idea);
      if (!idea) return jsonError('Invalid trip idea', 400, request, 'bad_body');
      doc.idea = idea;
      Object.keys(doc.responses).forEach((k) => { if (!idea.members.some((m) => m.code === k)) delete doc.responses[k]; });
      ideaLog(doc, 'edited', 'organizer');
    }
    if (body.decision) {
      const err = applyDecision(doc, body.decision);
      if (err) return jsonError(err, 400, request, 'bad_decision');
      ideaLog(doc, 'decision:' + doc.decision.stage, 'organizer');
    }
    await ideaWrite(env, doc);
    return ideaOk(request, { doc: ideaPublic(doc), organizer: true, preview: true });
  }
  return jsonError('Not found', 404, request);
}

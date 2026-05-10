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

export default {
  async fetch(request, env) {
    // ── CORS preflight ──
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method !== 'GET') {
      return jsonError('Method not allowed', 405, request);
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
};

function corsHeaders(request) {
  const origin = request && request.headers && request.headers.get('Origin');
  const allowed = origin && ALLOWED_ORIGINS.some(function (o) {
    return origin === o || origin.startsWith(o + ':');
  }) ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonError(msg, status, request) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

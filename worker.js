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

    // Safety: only allow google_flights engine
    if (params.get('engine') !== 'google_flights') {
      return jsonError('Only google_flights engine is allowed', 400, request);
    }

    // Remove any api_key the client may have sent (we inject our own)
    params.delete('api_key');
    params.set('api_key', apiKey);

    const serpUrl = SERPAPI_BASE + '?' + params.toString();

    try {
      const serpRes = await fetch(serpUrl, {
        headers: { 'User-Agent': 'PIALAX-Proxy/1.0' },
      });

      // Forward rate-limit / error status codes so the client can handle them
      const body = await serpRes.text();

      return new Response(body, {
        status: serpRes.status,
        headers: {
          'Content-Type': 'application/json',
          'X-SerpAPI-Status': String(serpRes.status),
          ...corsHeaders(request),
        },
      });
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

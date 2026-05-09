/**
 * PIALAX SerpAPI Proxy — Cloudflare Worker
 *
 * This tiny proxy forwards Google Flights API requests to SerpAPI
 * and adds CORS headers so the browser-hosted PIALAX dashboard
 * can receive the responses.
 *
 * SETUP (one-time, ~3 minutes):
 *   1. Go to https://dash.cloudflare.com → sign up free if needed
 *   2. Left sidebar → Workers & Pages → Create → Create Worker
 *   3. Name it "pialax-proxy" (or whatever you like)
 *   4. Paste this entire file into the editor, click "Deploy"
 *   5. Copy the URL (e.g. https://pialax-proxy.YOUR-SUB.workers.dev)
 *   6. In pialax.html and pialax-mobile.html, set:
 *        var PROXY_URL = 'https://pialax-proxy.YOUR-SUB.workers.dev';
 *   7. Push to GitHub — done!
 *
 * Free tier: 100,000 requests/day — more than enough.
 * The worker only proxies to serpapi.com; all other targets are rejected.
 */

const ALLOWED_ORIGIN = 'https://shwinster101.github.io';
const SERPAPI_BASE   = 'https://serpapi.com/search.json';

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    // Only allow GET
    if (request.method !== 'GET') {
      return jsonError('Method not allowed', 405, request);
    }

    // Forward query params to SerpAPI
    const url = new URL(request.url);
    const params = url.searchParams;

    // Safety: must have engine=google_flights
    if (params.get('engine') !== 'google_flights') {
      return jsonError('Only google_flights engine is allowed', 400, request);
    }

    // Safety: must have an api_key
    if (!params.get('api_key')) {
      return jsonError('api_key is required', 400, request);
    }

    // Build the SerpAPI URL
    const serpUrl = SERPAPI_BASE + '?' + params.toString();

    try {
      const serpRes = await fetch(serpUrl, {
        headers: { 'User-Agent': 'PIALAX-Proxy/1.0' },
      });

      const body = await serpRes.text();

      return new Response(body, {
        status: serpRes.status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(request),
        },
      });
    } catch (e) {
      return jsonError('Proxy error: ' + e.message, 502, request);
    }
  },
};

function corsHeaders(request) {
  // In production, lock to your GitHub Pages domain.
  // During development you can use '*' temporarily.
  const origin = (request && request.headers && request.headers.get('Origin')) || '*';
  const allowed = (origin === ALLOWED_ORIGIN || origin === 'http://localhost' || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1'))
    ? origin
    : ALLOWED_ORIGIN;

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

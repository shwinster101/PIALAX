fix(fares): cache hits keep their original age and spend no quota

- fareStamp(res) reads X-Fetched-At (future or invalid values clamp
  to now) and X-Proxy-Cache.
- fetchFlights (both files):
  - lastVerified comes from the stamp;
  - a HIT marks the data cached/edgeHit;
  - the _flightCache ts is the fetch time, so the 24h TTL runs from
    the original fetch;
  - bumpQuota (and with it SESSION_CALLS and isFetchLocked) runs only
    on a MISS.
- loadPrices already counts cached results apart from live ones, so a
  HIT no longer raises S.apiCalls.
- freshnessLabel: LIVE means under 1h old; 1h–7d reads CACHED Xh/Xd ago.

Refs PIA-115 (closes after verify-live passes).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8

feat(quota): SerpAPI plan-aware quota gates + fan-out caps + price cache (PIA-005)

- AC1  Budget baseline 250 → 1000 (SerpAPI paid plan, 2026-05-25).
       Default input value bumped at pialax.html:470 + pialax-mobile.html:1142.
       Quota auto-migrate chain extended (100→250→1000) at pialax.html:2303
       with console.info confirmation at :2312. `pialax_serpapi_quota`
       localStorage key preserved so existing `used` counters carry over.
- AC2  Banner thresholds rescaled to absolute counts on the 1000 plan:
       amber at 800, red at 950, fetch button hard-locked at 990.
       Constants QUOTA_AMBER_AT / QUOTA_RED_AT / QUOTA_LOCK_AT at
       pialax.html:2205-2207 (mobile mirror :2682-2684). `isFetchLocked()`
       safety-cutoff helper at :2277 short-circuits loadPrices() at :2610.
       Banner body: "<used>/1000 this month · <SESSION_CALLS> this session ·
       <remaining> until reset (<resetDate>)" at :2319-2322.
- AC3  [DOWNGRADED per spec contingency — see cover note at
       pialax.html:2215-2224] worker.js does not pass multi-day windows or
       multi-destination params through, so broad-search-then-filter
       collapses to MAX_CALLS_PER_REFRESH=3 + cache reuse only. Enforced
       at pialax.html:2680/2685 (liveBudget cap on loadPrices fan-out).
- AC4  FLIGHT_CACHE_TTL_MS raised from 30 min → 24 h at pialax.html:2077
       (mobile :2534). `_flightCache` persisted to localStorage via
       persistFlightCache() at :2087-2097 under PRICES_CACHE_STORAGE_KEY
       = 'pialax_prices_v1'; rehydrated on boot via rehydrateFlightCache()
       at :2098-2114. Stale entries (>TTL) dropped on every persist to
       keep storage bounded. Reload spends 0 SerpAPI calls until TTL
       expiry. MAX_CALLS_PER_SESSION=8 in-memory cap at :2227.
- AC5  setPiaRoute cache-first quota guard at pialax.html:744-779
       (mobile mirror :1477-1503). On hub toggle: compute cache key for
       newly-active leg, check freshness against FLIGHT_CACHE_TTL_MS,
       compute quota headroom (q.budget - q.used). Background fetch
       only when !fresh AND PROXY_URL set AND !isFetchLocked() AND
       headroom > 20. Otherwise stamp the active leg as `sampleStamp:
       true` for PIA-004 badge surfacing.
- AC6  All six changes mirrored verbatim into pialax-mobile.html
       (+162 / -16 lines). Mirror markers: budget input (:1142),
       AC5 guard (:1477-1503), AC4 TTL + persist + rehydrate (:2533-2566),
       write-through on success (:2660), AC2 constants + SESSION_CALLS
       (:2675-2684), AC3 downgrade pointer (:2685).

Verification:
- T3 §2.3 T1 acceptance run: 6/6 PASS (AC3 with documented downgrade flag).
- preflight.sh: 6/7 sandbox (step 5 SRI blocked by sandbox proxy 403,
  passes on user's Mac per PIA-002 §8 documented limit).
- bash -n parse clean on all three shipping scripts.
- 0 console.log, secret scan clean, <script> tags balanced on both files.

Browser smoke to run post-push (AC2 visual progression — the one piece
of acceptance that can only be verified in a real DOM):
  function stub(n){localStorage.setItem('pialax_serpapi_quota',
    JSON.stringify({period:new Date().toISOString().slice(0,7),
    used:n,budget:1000,exceeded:false}));location.reload();}
  stub(850);  // expect amber banner
  stub(960);  // expect red banner
  stub(991);  // expect fetch button locked

Rollback: revert this single commit. localStorage entries
(pialax_prices_v1, pialax_serpapi_quota) are read-tolerant — missing or
older-shape keys fall back to mock/defaults. Auto-migrate 1000→250 is
NOT added on rollback; budget stays at 1000 because that matches the
real plan.

Closes PIA-005.

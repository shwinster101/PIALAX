# PIALAX Daily Review — 2026-05-09

Scheduled review of `pialax.html` (desktop) and `pialax-mobile.html` (mobile). Bug + security sweep with squashing where safe.

## Stats

- Bugs found (verified): 2
- Security gaps identified: 5
- Fixes shipped to both files in lockstep: 4
- False positives caught during verification: 2

## Security fixes shipped (both files)

- Content-Security-Policy meta tag — restricts script/style/connect/img/font origins to a known allowlist (cdnjs, jsdelivr, *.workers.dev, serpapi.com). Defense-in-depth against any future reflected-XSS via URL params.
- Referrer policy hardened — `strict-origin-when-cross-origin` site meta plus `referrerpolicy="no-referrer"` on the CDN script tags. Stops trip-date query strings from leaking to third parties.
- `rel="noopener noreferrer"` added to the SerpAPI setup-guide link in the API drawer (`pialax.html:441`, `pialax-mobile.html:474`). Closes the reverse-tabnabbing path.
- `crossorigin="anonymous"` added to both CDN script tags. Prerequisite for SRI; also keeps cookies off CDN requests.

## Security fix deferred (with reason)

- **SRI integrity hashes on CDN scripts** (HIGH). Wrote a TODO in place of the `integrity=` attribute. The sandbox cannot reach `cdnjs.cloudflare.com` from this scheduled run to compute or verify the SHA-512 of d3 7.9.0 / topojson 3.0.2, and pasting an unverified hash silently breaks the entire dashboard for desktop and mobile. Next interactive session: visit cdnjs.com pages for these libraries and copy the official SRI string into the `integrity` attribute on `pialax.html:9-10` and `pialax-mobile.html:9-10`.
- **Calendar-tooltip `innerHTML` string concat** (MED). Safe today (all interpolated values are `Date` formatter output and integer prices), but a future change that pipes API strings through `showTip` would convert it into XSS. Refactor to `textContent` on child spans when next touched.

## Bugs

- **Mobile breakpoint mismatch** (MED, `pialax-mobile.html:3021`). `isMobileViewport()` uses `<= 640` while CSS `@media` uses the same number — but iPad portrait at 768px gets mobile CSS and desktop event handlers. Extract a shared constant `MOBILE_BREAKPOINT = 768`.
- **Per-member flex dates ignored in cost rollups** (MED, `pialax.html:1100-1150`). Route cards multiply per-ticket fare by `headcountFor(code)` without checking whether `memberDates[code]` overlaps the global trip window. If sister has a custom departure outside the meetup window she's still billed.

## False positives caught during verification

- "Calendar off-by-one" — `renderCal` at `pialax.html:2280-2305` correctly inserts `startDow` empty cells before day 1 and labels `dy` accurately. No bug.
- "JFK missing from ROUTE_GRAPH" — already wired. `ROUTE_GRAPH` (line 530) includes JFK on every relevant node, and `familyForDate(S.depDate)` is called at five sites (893, 1087, 1327, 1465, 2502). Sister's Sep 1 transition is engaged.

## 3 things going well

1. **JFK transition is wired end-to-end.** Five separate sites already call `familyForDate(S.depDate)`, ROUTE_GRAPH includes JFK on every relevant node, `FAMILY_INFO[JAX].moveDate` is the single source of truth. Thanksgiving / Christmas planning will Just Work after Sep 1.
2. **Quota reconciliation is honest.** The /account sync at `pialax.html:2237-2265` costs zero credits and overwrites localStorage with reality, plus shows the last-sync timestamp. Keeps the dashboard from lying about remaining searches — important for a tool whose credibility = future usage.
3. **No `eval`, no `new Function`, no `document.write`.** Grepped both files and found zero hits. Eliminates an entire malware-injection class. With the new CSP, attack surface is genuinely small.

## 3 suggestions to better align with the goal ("help family meet up")

1. **Show the included-passenger roster on every route card.** A "$4,000 total" line says nothing about *who* is in the number. Add a one-line subtitle ("Mom & Dad (PIA) · Me (LAX) · Sister (JAX)"), and dim members whose flex window doesn't overlap the trip. Doubles as the fix for the cost-rollup bug above.
2. **Pin the SRI hashes** — finish the security work this audit started. Two-minute task in any interactive session; prevents a CDN compromise from silently swapping in a malicious script for the whole family.
3. **Add a post-Sep-1 "NYC Thanksgiving" holiday chip.** The JAX June chip stays correct (pre-cutover). For the first big post-move meetup, surface a JFK-anchored chip that pre-fills dates, sets meetup mode, and biases the ranker toward NYC. That's the moment the JFK plumbing earns its keep.

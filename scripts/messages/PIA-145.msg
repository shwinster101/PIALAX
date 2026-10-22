test(v2): require real-browser job flows before shipping

- Add test-job-flows.sh/js to preflight in place of the standalone word runner.
  It requires an actual Chromium launch and runs Calendar, the FULL existing
  word/tap-count jobs, v2 viewport assertions and the verified-map browser suite.
  A missing dependency, browser, skipped suite, timeout or failed assertion is
  NO-GO. No snapshot/assertion is removed to make the gate pass.
- Serve app.html over loopback HTTP to respect browser policy against file
  navigation. Resolve installed Playwright/browser paths without package.json.
  Each suite keeps its own fixtures; shared writes use the real in-process
  Worker, paid upstreams are stubbed. No live paid service is called.
- Preserve Diwali 13/Tahoe 19 and group-link RSVP three-step targets. Their
  documented native share-sheet steps remain assumptions, not automated OS
  taps. Calendar jobs measure one-tap tab/day/person/new entry points and verify
  the selected date reaches creation. Cross-phone RSVP, failed writes, all-day
  counts, trip ring, Family and Map are checked for consistent facts.
- Include short-screen long-name days, month/year navigation, actual overlapping
  trip links, guest privacy and no paid Calendar requests. Add an explicit v2
  scope and HTTP transport to the viewport runner; its default still checks v1
  and v2. Assertions remain unchanged. Support playwright-core in browser jobs.
- The full word gate found Calendar's month arrows and holidays were missing
  from the glyph key. Tag those correctly and identify the pinned trip picture
  as a picture; preserve word/touch limits and the existing picker markup.
- Write per-suite logs and report.json under the printed temporary evidence
  directory (PIALAX_TEST_REPORT_DIR may override it). Document runtime setup,
  the posted acceptance checklist and every v1 feature-purpose disposition in
  V2_ACCEPTANCE.md. Explicit retirements and PIA-146/147 staging are separated
  from covered behavior; the absent original six-asks text is not claimed.

Validation: final combined preflight and all required browser suites must be
green before this two-ticket PR is published and merged. A missing-browser
negative run was rejected with a nonzero exit. Final check counts are recorded
in the PR; no skip is accepted as browser evidence.

app.html stays unlinked. v1 shipping files, Worker and entry URLs are unchanged.
Existing live adults=2, device and comprehension checks remain owed before
cutover, as recorded in V2_ACCEPTANCE.md.

Refs PIA-145.

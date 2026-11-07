test(preflight): the gate in under 10 minutes, every check kept; ⚙ #165

The owner asked for a preflight under 10 minutes. It took 26: the six
browser suites ran one after another, and two of them waited on timers
far more than they worked (test-words 1050s, its AC3 walk 453s at 25% of
four cores; test-viewport 392s; the other four 110s; every other step
about 10s).

- test-job-flows: three groups at once (test-words; test-viewport then
  test-map-browser; cutover, migration then Calendar). Each suite still
  runs to its end with its own log and pass rule; any failure fails the
  gate; output is printed in the old order as soon as a suite and all
  before it are done; report.json adds wallMs.
- test-words: the AC3 walk takes every phone at every width at once
  (labels name phone and width, so census turns are unchanged). The 18
  sections from AC3 to PIA-157 run in four lanes (walk, a, b, serp);
  PIA-140, PIA-141 and PIA-155 replace globalThis.fetch with their
  stand-in SerpAPI, so they share the serp lane. Checks that read what
  the walk logged wait for it (afterWalk). Each section's lines and
  census entries are kept with it (AsyncLocalStorage) and given out in
  section order. A new check says all 18 ran once each in 4 lanes
  (184 = 183 + 1). NAMES and PIA-142's three tap helpers moved up,
  unchanged.
- test-viewport: its six layout passes (360/390/430, light and dark),
  which share nothing, run three at a time; lines printed in pass order.
- Under the other lanes a fixed 500ms sleep after PIA-140's 🔍2 missed
  one of three priced days (and eight long-press census entries), so
  PIA-140's five search taps wait for their outcome (30s ceiling only
  bounds the wait), as PIA-142's fix pass does.
- Measured on this 4-core container: two full preflights after the fix,
  413s and 415s, all green (words 401/404s, viewport 267s, job flows
  401/404s wall, was 1546s); the run before the fix failed on that flow.
- CLAUDE.md records how the gate runs. BUILD and pialax-build 165.

No app, word, storage, link, Worker or model change; no check removed
or loosened.

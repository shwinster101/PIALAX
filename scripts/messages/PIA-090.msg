perf(map): coalesced redraws, ResizeObserver fit, persistent map layers

- redrawMap() keeps its name (~40 callers + shared builder block) but
  now marks dirty and schedules one rAF; flushMap() refreshes the route
  picker/list once and draws only when #map-wrap has a size.
- ResizeObserver on #map-wrap (keyed on rounded size) replaces the
  window resize debounce, the orientationchange timer and the 50/350ms
  open timers; #map-wrap has no height transition, so the map is never
  fitted to a half-open size.
- drawMapNow(w,h): layers created once (defs, bg, land, routes,
  callouts, pivot, panel, airports); land re-projected only when view,
  size or geography changes; arrow markers only when destinations do.
- Dead hover-tooltip handlers removed from the mobile map (#tip is
  hidden on the Map tab); sticky .sp:hover dropped.
- test-viewport: real d3/topojson/us-atlas fetched once via curl and
  served to the page (SRI still verifies); checks final-size open,
  land-path reuse across data changes and toolbar resizes, and rotation
  re-fit both ways. All three fail on the previous code.

Closes PIA-090.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8

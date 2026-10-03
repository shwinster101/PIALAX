feat(map): non-overlapping labels, nearest-airport taps, 11px minimum

- placeMapLabels(items, W, H, obstacles): greedy placement by priority
  (hub, family codes, ORD, fare tags, drive badge). Each label tries its
  preferred spots, then rings around its anchor, and takes the first
  that clears every placed label, airport dot and the focus chip by 1px,
  4px inside the map. Shorter forms come next: code without city, a
  one-line fare tag (all tags switch together so the map is consistent),
  "🚗 drive" for the badge. The last resort is hiding a small unlabelled
  dot wholly under a tag; tags draw above dots, leaders below.
  Text widths come from canvas measureText.
- Taps: the overlapping r=22 per-airport hit circles are replaced by one
  transparent layer. A tap goes to the nearest drawn airport within 30px,
  so PIA vs ORD and LGA vs JFK pick the one tapped. Airports keep
  role=button, tabindex and Enter/Space, a focus-visible ring, and focus
  survives redraws.
- Readability: map text is at least 11px (hub 16, codes 14, fares 13,
  badge 12, sublabels 11). The solo in-map price panel (8px) is removed;
  its picked/best-weekend price moves into the route list row. The
  meetup hub and the solo picked dot use --map-hub-dot, which was white
  on the light map before.
- mapHubOption('LGA_JFK') resolves to the LGA focus (both files). It
  used to fall back to PIA/ORD.
- Tests: test-viewport adds label checks (meetup and solo at 375, 390
  and 430: no overlaps, inside the map, no dot covered, text ≥11px) and
  tap checks (PIA/ORD in meetup; PIA/ORD/LGA/JFK in solo). All fail on
  the previous code. test-trip-idea asserts the LGA_JFK focus in both
  files.

Closes PIA-091.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8

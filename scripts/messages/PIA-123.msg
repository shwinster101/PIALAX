feat(watch): each traveler's fare watch shows target, trend and age

"Is $412 good, is it moving, how old is it?" had no answer. The watch
UI lived behind ?flags=assistant, the target was only a parsed fact
with no editor, and there were no per-traveler watches.

- Shared block (both HTML files + scripts/trip-idea-builder.js):
  - fareAgeLabel(iso|ms|Date): the one "N ago" formatter.
  - Targets in pialax_leg_targets_v1, keyed by shared trip:
    - a trip-wide per-traveler target plus per-traveler overrides
      (tripLegSetTarget / tripLegTargetFor);
    - seeded from a confirmed target_price fact.
  - pialax_leg_history_v1:
    - one point per fetch (deduped by X-Fetched-At), ≤30 per leg;
    - pruned once the date passes;
    - keeps the last price after the 24h cache expires.
  - tripLegWatch / tripLegWatchLineHtml: under each leg, the change
    since the last check, a sparkline (Google price_history, else our
    own), Google's level and typical range, and "checked Nh ago".
    Past 24h: "Last $X · 1d ago · stale" plus a 1-search refresh
    button (token only).
  - tripTravelerWatchHtml (route cards) and tripLegWatchCardHtml
    (Trips card): in + home total vs target, editable inline, with
    the oldest leg age. Booked travelers show ✓ Booked.
- Both files:
  - freshnessLabel, the last-error chip and the /account sync line
    use fareAgeLabel;
  - the Trips card of a linked planning trip shows the fare watch
    outside the assistant flag;
  - CSS for the watch (44px target input, 16px text so iOS doesn't
    zoom).
- Tests:
  - test-trip-idea:
    - age boundaries (just now / 59m / 1h / 24h / 1d);
    - target from the fact, then trip, then traveler, and survives a
      reload;
    - history dedupe and prune;
    - stale display;
    - the cache hit keeps its 5h age, with Δ −$18, sparkline and
      Google's verdict;
    - the Trips card watch.
  - test-trust: the A3 sandbox runs fareAgeLabel ("CACHED 5h ago"
    holds).
  - test-viewport: the target on Me's card is ≥44px, saves, and reads
    back as a verdict.

Closes PIA-123.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dug5vjZj6GAEUycz3AfeN6

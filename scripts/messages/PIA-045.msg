fix(honesty): mock/blind labeling + fail-closed quota lock + retry CTA

Second item from the 2026-08-01 audit, shipped separately from the
disclosure fix (PIA-044) per instruction. Direct port of the ask: sample is
MOCK, quota-exhausted is BLIND, and a proxy failure needs a recovery CTA
rather than a dead state.

1. "Sample" → "Mock" everywhere it's user-facing (data-badge, pill-src,
   data-pill-lbl, cal-hint, the quota-warning-banner's no-proxy message, the
   post-fetch-failure toast). "Sample" reads as "a real fare sample"; "Mock"
   is unambiguous that these are fabricated numbers, not fetched from
   anywhere. No behavior changed, only the word.

2. Quota-exhausted was BLIND in the literal sense — a genuine bug, not just
   a wording gap. loadPrices()'s isFetchLocked() short-circuit returned
   before the button-disable/spinner logic even ran: pressing "Get Live
   Fares" while locked produced zero visible feedback (no toast, no badge
   change, button didn't even flash), and if the lock came from the
   per-session cap rather than the monthly quota, the quota-warning-banner
   didn't fire either — completely silent. Now fails closed: forces the
   badge into an explicit "Blind — quota locked" state (red dot, matching
   severity) and fires a toast explaining why, every time.

3. Recovery CTA: the last-error chip (PIA-043) could only be dismissed, not
   acted on. Added a "↻ Retry" button that re-runs the same explicit,
   quota-gated live fetch as the search button — a proxy/network failure is
   no longer a dead end. The date-guard from PIA-043 (F10) is refactored
   into a shared canFetchLiveDates() so both trigger points enforce it
   identically instead of drifting.

4. Also: 'API Error — Using Samples' → 'Blind — fetch failed (mock shown)',
   consistent with the same fail-closed vocabulary, and its status dot now
   reads red (a genuine failure) rather than the same amber used for
   routine mock/cached states — amber means "never claimed to be live", red
   means "we tried live and it broke".

Mirrored across pialax.html + pialax-mobile.html; mobile's chip styling
stays on its existing stylesheet-rule convention (matching PIA-043's
#last-error-chip pattern) rather than desktop's inline styles.

Verified: node --check on both extracted app bodies, bash
scripts/test-core.sh (10/10), bash scripts/preflight.sh (GO except the
known sandbox SRI/cdnjs 403 — unrelated, SRI count unchanged at 4/file),
symbol-count parity grep across both files (two expected divergences:
mobile's CSS-rule occurrences of #last-error-chip-retry, and a pre-existing
invalid-proxy-URL fallback line that only exists in desktop, predating this
change).

Rollback: revert this commit. All changes are string relabeling, one new
fail-closed branch in loadPrices' quota-lock short-circuit, one new button
+ handler, and one small refactor (inlined guard → shared function with
identical logic) — reverting restores prior behavior exactly.

Closes the sample/live honesty + recovery item from the 2026-08-01 audit.

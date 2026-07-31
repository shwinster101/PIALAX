fix(fetch): date-guard live search + surface persistent fetch errors

Audit remediation, 2026-07-31 findings (9-14 as pasted). Two findings were
verified against the app and found not applicable as stated: F13 claimed no
persistence exists — false, 7 versioned localStorage keys already cover
watchlist/prices/quota/proxy/bookings; F9/F10/F11 assumed a step-wizard UI
that doesn't exist in this app (single dashboard view, not steps). This
ships the 3 real gaps confirmed on inspection, all S-effort:

F10 kernel — Get Live Fares had no date guard. fetchFlights silently
substitutes today's date when dep is null (`outbound_date:dep||fmtISO(new
Date())`), so a press with no dates picked burned a real SerpAPI call on a
meaningless query instead of failing fast. search-btn's click handler now
checks S.depDate (+S.retDate for round-trip) before calling loadPrices(true)
and toasts instead of fetching when incomplete.

F11/F14 kernel — a live-fetch failure (proxy down, network, non-2xx) was
completely silent: fetchFlights' own try/catch swallows every real failure
into a mock-data fallback, so the caller's promise always resolves and
loadPrices' pre-existing allFailed/failCount status label almost never
actually fires on a genuine failure. New module-level _lastFetchError /
_liveFetchErrorCount are set from inside that catch block (the one place
that does see every real failure) and drive two things: a one-time toast
after a button-press batch with failures, and a persistent, dismissible
"last error" chip (route, human-relative age, message) that survives past
the batch until the next successful fetch or manual dismiss.

Mirrored across pialax.html + pialax-mobile.html; mobile uses its existing
stylesheet-rule convention for the chip (matching #quota-warning-banner)
rather than desktop's inline styles — same visibility contract (JS toggles
only the inline style, per PIA-040's fix for that exact banner).

Verified: node --check on both extracted app bodies, bash
scripts/test-core.sh (10/10, confirms neither file's IIFE/app body broke),
bash scripts/preflight.sh (GO except the known sandbox SRI/cdnjs 403,
unrelated to this change), symbol-count parity grep across both files.

Rollback: revert this commit. search-btn reverts to unconditional
loadPrices(true); _lastFetchError/_liveFetchErrorCount and the chip/toast
are additive and inert once removed — no other code depends on them.

Closes findings 10/11/14 kernel from the 2026-07-31 audit; F9 (forced
sample banner) and F12 (accessibility) explicitly deferred, F13 factually
false (no action).

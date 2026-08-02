feat(assistant): Worker /extract via Anthropic + client fallback pipeline

Phase 3 of the 2026-08-02 sprint. Ships DARK — the functions exist and are
tested, but no UI calls them yet (Phase 5 wires the composer). Security
ticket: adds a second Worker secret and the Worker's first non-GET route.

Worker POST /extract turns one free-text note into structured PROPOSED
facts. Two properties matter more than anything else here:

The model EXTRACTS, it never DECIDES. No recommendation, no booking advice,
and above all no URL. The client's deterministic code owns the decision
engine and the Google Flights link, built only from facts the user has
confirmed. A model that could emit a URL could emit a wrong one, and a wrong
booking link is indistinguishable from a right one until someone has paid.

It FAILS CLOSED. Output shape is enforced structurally via a forced tool
call rather than by asking for "JSON only", then validated again in the
Worker, then validated a third time client-side at the point data enters
storage. Anything off-schema is discarded whole — never repaired — because a
half-understood note must not become confirmed trip state. Verified against
a text reply instead of a tool call, the wrong tool name, non-JSON upstream,
three segments, a malformed date, and an injected airport code: all 502
bad_json.

Degradation is the design, not an afterthought. The client treats 404/405/
501 as "this Worker can't do extraction" and silently uses the local parser
from PIA-047. So the feature works fully today with no key and no redeploy,
and an old deployed Worker costs recall rather than function. Only a
rejected API key (401/403 → bad_key) is surfaced to the user, because it is
the one failure they can actually act on; nagging about the rest would be
noise about something unfixable.

Ordering is the safety story on the client: submitContextNote() persists the
ContextEvent BEFORE any network call, so "your note was saved" is true even
if the request times out, the Worker is old, or the browser is offline.
Extraction is enrichment on already-durable data, never a precondition for
keeping it. retryExtraction() reuses the same event id, so retrying after a
timeout cannot duplicate the note.

Model: claude-haiku-4-5 by default. This is short-input structured
extraction against a forced schema — the task Haiku is good at — and the
caller is a family dashboard that already rations its API budget. Override
via ANTHROPIC_MODEL in wrangler.toml for messier notes.

Secret handling unchanged in spirit from SERPAPI_KEY: ANTHROPIC_API_KEY
lives only as a Worker secret. Verified zero occurrences of "ANTHROPIC" in
either HTML file.

While writing test-worker.js it caught a real leak: the route was forwarding
text.slice(0,400) of the upstream error body to the client. That is an
arbitrary-content passthrough — whatever the upstream says lands in the
page. Now only the status class crosses the wire; the body is logged
Worker-side where `wrangler tail` shows it to the operator and nobody else.
The regression guard for it is checked in.

Tests: scripts/test-worker.{sh,js} runs worker.js against a mocked Anthropic
API and mocked env — no network, no key, nothing deployed — covering the
paths that are painful to reproduce by hand (unconfigured Worker, bad key,
hanging upstream, malformed model output) and pinning the SerpAPI GET path
as unchanged. 36 checks. test-extraction gains the response-classification
matrix (12 shapes). harness.js grows a shimOverrides parameter so a suite can
inject a controllable fetch WITHOUT the app exporting anything for
testability — PIALAX exports only its inline-handler targets, and widening
that just to enable tests would be the tail wagging the dog.

Verified end-to-end against a stubbed route in all six modes (good LLM
extraction, 501, 404, 502, network failure, off-schema response): the note is
saved in every case, facts land, and only the parser_version differs.

Invariants: SRI unchanged (4/file), no new loadPrices(true) sites, and boot
still makes ZERO SerpAPI search calls (measured: only the map CDNs and the
0-credit ?action=account sync). /extract never touches SerpAPI quota.

Docs: PIALAX-SETUP-GUIDE.txt gains the enable/verify steps, the exact
wrangler commands, a curl check with every error code explained, and an
explicit privacy section — the note text, today's date, and THAT ONE TRIP's
confirmed state are sent; other trips, watchlist, fares and quota are not.
It also says plainly that confirmed state can contain real names if the user
typed them, and that skipping the key keeps everything in-browser.

Rollback: revert this commit. The Worker route is additive (an already
deployed old Worker is unaffected); the client falls back to the local
parser; no existing function changed behavior.

Closes Phase 3. Phase 4 (decision engine + fare snapshots + handoff) follows.

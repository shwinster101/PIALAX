feat(v2): app.html shell — three tabs, sheets, trip store, router, word gate

Start the v2 app as a new same-origin file, rendering only from the trip
model, while v1 keeps serving the family untouched. Nothing links to
app.html yet; pialax.html, pialax-mobile.html, index.html, worker.js and
scripts/trip-idea-builder.js are unchanged.

- app.html (new, one file, no build step):
  - The model region of scripts/trip-model.js inlined byte-identical
    between its markers inside the app IIFE; v1's harness markers, so
    scripts/harness.js finds the app block.
  - Three labelled tabs (Trips, Map, Calendar), no wordmark. Trips has
    the [Ideas | Family] segment once the phone holds two trips (the
    verified prototype's rule). A cold open lands on Trips › Ideas; the
    tab and segment live in sessionStorage; the trip opened or picked
    last (pialax_ui_v1.sel) is the one Map and Calendar show, and the
    address bar carries it there too (?idea=<id>&tab=map|cal).
  - The Trips list renders every listed trip from the store through
    tripModel: postcard, title, plan pill with my own days, faces with
    answer shapes, n/N, the organizer's stage disc, and my own one-tap
    hand-off from handoffs() (Google Flights, Explore, Flighty, 🏠).
    Past, dropped and hidden trips sit on a 🗄 shelf. Trips not read
    yet draw from the list's title/emoji snapshot. Family, the trip
    view, Map, Calendar and P-new are frames on real store data; their
    tickets (PIA-136/137/142/143/144) replace them. With every trip on
    the shelf, Map and Calendar show the empty picture, not ◷.
  - Bottom sheets, one at a time, each with its own accessible name.
    They close with ⌄, ‹ (back to the sheet below), Esc, the phone's
    Back or a tap on the scrim; no timer, refresh or failed read closes
    one. Values typed into ⚙ and not saved survive a close (in memory
    only). While a sheet is open, #app and the tab bar are inert and
    Tab wraps inside the sheet; closing it focuses its opener again.
  - ⓘ lists every glyph on the screen (≤18 words a page) and ends with
    ⚙. Long-press names the labelled control under the finger, or else
    the glyph there by position (a card's faces, heads, pill, stage
    disc and ⭐ sit under its tap overlay), from LEGEND. It never names
    a container (tab bar, segment, chip row, sheet), never triggers
    anything, and the swallowed-click flag lapses after 400ms. Text
    controls (tabs, Ideas | Family, Save) have no label.
  - ⚙ = token (with 👁), Worker URL, Save (only edited fields are
    checked and saved), the devices link (🔑📱) and the selected trip's
    organizer link, both copy-only with "🔑⚠ Your devices only"; P-link
    when the clipboard refuses.
  - Trip store: GET /idea per listed id on open, on focus (5s gap) and
    every 60s while visible. WSEQ moves when a write starts and when it
    ends, so a GET whose life overlapped any part of a write is dropped
    (also while one is pending); test-app pins all three interleavings
    against the real worker.js. An answer that changes nothing asks
    for no re-render, and a store re-render leaves a sheet someone is
    typing in alone. A failed background refresh sets 📶⚠ and dims
    cards, never a sheet. Writes (respond, booked, organizer edit,
    create) go through the model's builders, apply optimistically
    (applyLocal mirrors the Worker, proven equal to its stored doc),
    re-read the record with X-Idea-Key before an organizer edit, and
    revert on failure; when an earlier request of a multi-request write
    landed, the store keeps that reply's doc and reports partial.
  - Errors map from the Worker's error code to P-error's own glyph and
    ≤3 words, never its text. P-error never replaces an open sheet: it
    waits and opens when the sheet closes. A link to a trip the Worker
    does not have is decided by that trip's own first answer ("Trip not
    found", the trip off the list), however slowly the other trips
    load; no background read opens P-error.
  - Router: ?idea= (and a /i/<id> path) saves the trip, no taps, and
    opens it. v1's organizer link ?idea=…#k=…&t=… and the devices link
    #ks=<id>.<key>,…&t=… are saved, then stripped by replaceState. Any
    hash carrying k=, ks=, t= or m= is stripped, valid or not, and
    punctuation after a pasted link is trimmed before matching. The v2
    list link is ?l=<id>.<id>…&f=<face>: the plan's ?wl= is taken by v1
    (legacy) and ?w= by PIA-131, so v1's ?w= and ?wl= payloads are read
    once for their shared trip ids and dropped. The v1 list (plus v1's
    key and identity ids) is read once and never written.
  - A trip view opened in the app gets its own history entry, so the
    phone's Back returns to the list (or to Map, when it was opened
    from Map), like ‹.
  - Keys shared with v1 keep v1's exact formats (keys, me, seen, token,
    Worker URL). saveKey only adds: a link never replaces or removes an
    edit key, and an unreadable key store is never written over.
  - The Worker origins the app accepts (WORKER_OK) are the CSP's
    connect-src list, which test-app checks. ⚙ refuses any other URL
    with the field's bad state, and a v1 pialax_proxy_url override the
    CSP would block is not used (the built-in Worker answers) and is
    left in place for v1.
  - No mock fares, estimators, seeded trips or fare search; the only
    network peer is the Worker's free /idea routes. CSP: default-src
    'none', inline script and style, img data:, connect-src the Worker.
    No apple-mobile-web-app-capable. System fonts, inline SVG/emoji,
    light and dark tokens, ≥44px targets.
- scripts/harness.js: the app file is an argument (`node
  scripts/harness.js app.html`); no argument = the v1 pair, as before.
- scripts/test-app.js + .sh (new, in preflight, offline): drift test,
  harness, static rules (CSP, WORKER_OK = connect-src, no web-app mode,
  no mock or seeded data, no paid route), the router (pure and at
  boot, with v1's own wlShareEncode payloads, malformed and punctuated
  hashes), v1-format storage read back by the unchanged v1 page, the
  refresh, poll and focus (with a moving clock), the three GET/write
  interleavings, partial and failed writes, P-error waiting for a
  sheet, the slow-sibling missing link, writes and reverts against the
  real worker.js in-process, and verify-sri's app.html check run
  offline (so it gates) on quoting, case and line-break variants.
- scripts/test-words.js + .sh (new, in preflight; skips without
  Playwright): the strict word gate counts the rendered DOM of every
  screen and popup the shell reaches at 360/390/430 on six fixture
  phones (8 members with long names, unknown airports, no place, a
  long title, the legacy v1 doc, shelf trips, every trip on the shelf,
  a revealed token, long typed values, a failed refresh, a missing
  trip). Busiest screen 10 words, busiest popup 17. ⓘ coverage is read
  from the rendered text: any pictograph or symbol outside a trip name,
  postcard, face, picture or the trip's own emoji must sit in a key ⓘ
  lists. Long-press is checked on each distinct control label and
  each glyph key on every phone (three faces at most; no state shared
  between parallel phones), plus tabs, segment and sheet text (no
  container label, no hover title). Also sheets (one at a time,
  names, ⌄, ‹, Esc, Back, the scrim with the ⚙ draft kept, inert and
  the Tab wrap, focus return, P-error waiting), Back on a trip view,
  the focus refresh, ⚙ refusing a CSP-blocked Worker, and links.
- scripts/test-trust.js: app.html has no /search fetch and no token
  header, and on an organizer phone with the token every request goes
  to /idea and never carries the token.
- scripts/test-viewport.mjs: app.html at 360/390/430, light and dark:
  no horizontal scroll, named ≥44px targets, the right tokens.
- scripts/preflight.sh: FILES += app.html; suites += test-app.sh,
  test-words.sh. scripts/verify-sri.sh: every <script> in app.html with
  a src (any quoting or case, split over lines or not) must carry an
  integrity= value pinned in its list (none yet); SRI_APP_ONLY=1 runs
  that part alone, offline.
- CLAUDE.md, PIALAX_HQ.md (§6 amended, §12 new): D1–D5, the strict
  word rule, the build-and-cutover plan and the amended domain rules
  (estimates retired in v2; the ORD pivot and familyForDate kept).

Checked against deliberate mutations, each re-run in this pass and
failing its suite: no refresh guard at all; the end-of-write sequence
bump removed (a GET sent during a write and answered after it); the
sequence check removed; no revert; no partial doc; edit from a stale
doc; hash kept; malformed hash kept; trailing punctuation kept; key
replaced; v1 list re-read; v1 list written; region drift; unknown codes
passed through; P-error over an open sheet; the missing-link error
waiting for other trips; every answer re-rendering; focus never
refreshing; names fitted before the sheet shows; names never dropped;
wordy labels; long-press firing; the old long-press target rule
(container names, glyphs unnamed); a chip's 🌙 without a key; ✕ for
close; no inert; no Tab wrap; no focus return; no ⚙ draft; no trip
history entry; Map without ?idea; ◷ on an all-shelf phone; every sheet
named "Sheet"; any *.workers.dev accepted; Esc ignored; spaces in typed
values; a token header; a /search fetch; small targets; no dark tokens;
sideways scroll.

For the spec author to confirm (each is one line plus its check):
- ⌄ closes a sheet, per the AC and the spec's icon vocabulary (the
  verified prototype used ✕); the shelf row's chevron is now a drawn
  shape so ⌄ keeps one meaning.
- A tap on the scrim also closes a sheet (the prototype's behaviour);
  ⚙ keeps what was typed, so nothing is lost by it.
- A trip view a link opened has no history entry under it, so Back
  there returns to where the link was tapped; trips opened inside the
  app get one.
- Until a second Worker is added to the CSP and WORKER_OK together,
  ⚙'s Worker field accepts only the built-in Worker (or blank).

Not covered here: P-day map mode (PIA-143 builds P-day), the typed
title in P-new-what (PIA-136) and a sheet that lists names (PIA-135+);
test-words is the place to add them. fitNames on a first open is only
pinned statically (the sheet is shown before names are fitted) until
then.

Owed, needs a real phone (not reproducible in headless Chromium): that
a long press on iOS Safari and Android Chrome shows the label and the
next tap still works (headless sends a click after every long press);
that the soft keyboard and IME composition in ⚙ survive a 60s poll.

Owed before cutover (PIA-147), needs people: the prototype's Mom & Dad
icon check on the link-first path, and the 2-person shared-list
comprehension check ("Where did Tahoe come from? Will new ideas
appear?").

Refs PIA-134.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g

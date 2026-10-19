feat(v2): Trips › Ideas — the shared watchlist

Trips › Ideas is now the shared watchlist (D3). It lists every trip this
phone has opened, live from the record, readable at a glance, one tap
from Google Flights, and shareable in chosen groups. app.html is still
linked from nowhere. pialax.html, pialax-mobile.html, index.html,
worker.js and scripts/trip-idea-builder.js are unchanged.

- scripts/trip-model.js (region, inlined byte-identical in app.html):
  - answerTimes / newestAnswerAt: each member's newest rsvp log time,
    or the answer's own updated_at once the 50-entry log has dropped
    it. tripModel members carry ansAt.
  - newAnswers(model, seenAt): faces that answered since my last look,
    never my own. Only on a trip where I am someone, off the shelf.
  - awaitsMe(model): a trip still waiting on my answer.
  - bookByCue(model): the red cue, only when book-by has passed with
    travelers unbooked and it matters (the organizer, or a traveler
    who answered and has not booked).
  - togoCue(model): ⏳ days to go on every upcoming dated trip, for
    everyone, with the book-by arc = (days to book-by) / (days to go),
    which empties as book-by nears; no arc once everyone has booked;
    late = bookByCue.
  - tripGroups(models, mine): connected groups of trips sharing anyone
    but me; most trips first; each with faces and short names.
  - listLink(base, ids, face): <base>?l=<id>.<id>…&f=<face>, ≤20 ids,
    ids and one face only.
  - mapXY(code) / usPoint(lat, lon): d3-geo's geoAlbersUsa fitted to
    360×230, with its Alaska and Hawaii insets and clip boxes. Checked
    against d3 for all 348 airports in the table (190 on the map, max
    error 0.05px before rounding).
- app.html:
  - Cards (the same on every phone):
    - The postcard's mini locator: a dot on the US outline, a globe for
      a known place off the map, ? for no place or an unknown code.
      Each state has a key entry (ⓘ, long-press).
    - The plan pill: 📌 (the day alone inside one month, else m/d), ⚠
      with its cause, and ⏳N over the book-by arc, red when late.
    - Faces with answer shapes and ● on new answers, n/N, and the
      stage disc on every card (🗑 once dropped); ↩ stays the
      organizer's.
    - My own one-tap hand-off for any trip, answered or not (an
      unanswered traveler's search is from their home airport on the
      plan's dates): ✈↗, ✈⏱↗ once booked, 🏠 for a host, 🧭↗ with no
      place, ✈⚠ when no link can be built.
    - The one total sits on the organizer's token phone only: tripModel
      gets pialax_fares_v2 there and nowhere else. $—; outlined with
      the unpriced faces whenever any traveler's sum misses a leg (an
      open-jaw traveler priced by one leg of two never reads as a final
      total); grey with 🔍 when stale; 💵 paid. A guest's card has no
      price element at all.
    - Sort: ⭐ first, then departure, undated ideas last. Arrivals fly
      in, the not-yet-read snapshot card too.
  - Trips tab numeral (data-k look): trips awaiting my answer or with
    unseen answers. markSeen records the model's newestAnswerAt (v1's
    format; v1 still reads the trip as seen).
  - List-share control (Ideas top row): hidden with nothing to share.
    +n and a pulse for every listed trip off the shelf not yet in
    pialax_shared_at_v1.wl, whoever organizes it. Its accessible name
    carries the count; a long press says "Share list".
  - P-sharelist:
    - Group chips (faces), each named by its people for a screen
      reader; the largest group starts checked; shelf and dropped trips
      are never listed; ≤20 per link.
    - Focus stays on the toggle or chip after the sheet redraws.
    - 📣 Share hands navigator.share {url} only. It falls back to the
      clipboard, then P-link (stacked; no own-devices warning, since
      the link holds no secret). Trips count as shared only once the
      link went out: the share sheet took it, it was copied, or P-link's
      ⧉ copied it. A cancelled share or a closed P-link records nothing.
    - The link is the app's folder (as v1's share links are), so after
      the PIA-147 cutover it opens app.html through index.html.
  - P-savelist:
    - Opened by ?l= and by v1's ?w= / ?wl= payloads. These no longer
      add trips on their own. The devices link (#ks=) still does, but
      only when its hash carries a valid key or the token; a junk #ks=
      on someone's list link opens P-savelist.
    - Shows the sender's face (&f=) and only trips new to this phone,
      read with free GET /idea; a trip that turns out past or dropped
      is never offered.
    - ⤓ Save N adds them and the cards fly in. ⌄ saves nothing.
    - Nothing new: the dimmed stack, no button. All gone: "Trip not
      found".
    - A trip saved before its first answer that the Worker does not
      have leaves the list again.
  - Shelf: one row with its count when folded (no shelf cards drawn).
    Dimmed cards when open. ↩ on a dropped trip for the organizer puts
    it back as it stood, through organizerWrite (optimistic, rebuilt
    from a fresh GET, reverted with P-error on failure): booked again
    with the amount paid while the record holds it, 🔒 chosen again
    (from the plan) while it holds a choice, else proposed. The
    Worker's 'proposed' would clear both.
  - Long-press names glyphs inside the open sheet too (◷, ⟦ ⟧, a mini's
    locator and stage disc, the header glyphs), not only on the screen.
  - LEGEND gains sharelist, share, save, new, look, total, paid,
    unpriced, search, restore, bookby, place, abroad and noplace.
- Tests:
  - test-trip-model +19 (answer times through the real Worker, new
    answers, awaitsMe, the book-by cue, togoCue and its arc, groups
    including chains and names, the list link, the projection against
    d3 golden points). v1's boot notes, which surfaced at the new
    awaits, are silenced.
  - test-app +50:
    - Totals by role, and an open-jaw traveler with one of two legs
      cached (outlined, +🌽, never a bare $500).
    - The card pill (red ⏳20 with an empty arc; neutral ⏳41 at 48.8%),
      the locator's states (dot, globe, ? for none and for ZZQ), the
      stage disc on every card and on a guest's, and the order.
    - The hand-off slot: 🏠, ✈⏱↗, 🧭↗, and an unanswered guest's ✈↗.
    - Trip links fly in, the snapshot card too.
    - Share: pre-check, groups, toggle, the URL handed over, wl
      recorded, +4 → +2 exactly, a guest's +2, cancel, clipboard, P-link
      recording only on ⧉, a closed P-link recording nothing.
    - Receive: only new trips, Save, dropped and past trips not
      offered, a junk #ks=, nothing new, ⌄, all gone, a missing trip
      saved early. The router's devices rule (junk, empty, broken #ks=).
    - The shelf: undated, collapsed, open, ↩ of a proposed, a locked
      and a paid trip against the real Worker (awaiting the write's own
      promise, no fixed tick budget; 8 concurrent runs green), no ↩
      without the key.
    - Both halves of the Trips numeral (a trip awaiting my answer with
      nothing unseen counts, and stops counting once I answer); a failed
      refresh; the empty tabs.
  - test-words:
    - Fixtures: fares, seen state, a worst-case "widest card" phone
      (📌 across months, ⚠ with three causes, a three-digit ⏳ with its
      arc, a partial stale total) and an open-jaw trip priced by leg.
    - Every card fits at 360px: nothing outside the card, nothing
      overflowing its own box, no overlap in a row.
    - Totals only on the organizer's own trips; the half-priced total
      outlined; ⏳ and the stage disc on every dated card; ● counts.
    - Exact counts: the Trips numeral drops 5 → 4 after a look at
      Tahoe; +8 unshared drops by exactly the shared ids.
    - P-sharelist states, the link it hands over (URL only, no key or
      token), Space on a toggle keeping focus, distinct chip names.
      P-savelist states, ⤓ Save and the fly-in.
    - Long-press inside P-sharelist and P-savelist (including ◷ on a
      trip not read yet), never toggling or saving anything.
    - Busiest popup 18 words (P-key page 1 on the organizer phone),
      busiest screen 10.
  - test-viewport: P-sharelist, and P-savelist both with ⤓ Save 2 and
    with nothing new, at 360/390/430, light and dark.

Checked against deliberate mutations, each failing a suite:
- Cards and badges: a total on guest cards; no fares on the token
  phone; no locator; a globe for an unknown code; a locator without its
  key; no 📌; ⏳ only once book-by passed; the stage disc for the
  organizer only; a guest who has not answered gets no ✈↗; a hollow
  traveler not flagged; no ● dot; no Trips numeral; the numeral
  counting unseen answers only; a trip opened offline not marked seen;
  undated ideas sorted by their window; no fly-in on a snapshot card.
- Shelf: never collapses; ↩ for everyone; ↩ always to proposed.
- Sharing: no largest-group pre-check; a token appended to the list
  link; extra fields handed to the share sheet; nothing recorded after
  a share; recorded when P-link merely opens; P-link's ⧉ recording
  nothing; shelf trips offered for sharing; +n counting organized trips
  only; all group chips named "Group"; focus lost after a redraw.
- Receiving: a list link that imports by itself; a junk #ks= treated
  as my devices link; the receiving sheet showing trips I have; dropped
  or past trips offered; Save adding every offered id; a missing saved
  trip kept; no fly-in after Save; sheet glyphs not named on a long
  press.
- Layout: row B that never wraps.

For the spec author to confirm:
- The list link is ?l=<id>.<id>…&f=<face>, not the spec's ?wl=: v1
  owns ?w= (PIA-131) and decodes ?wl= as its base64 payload, so a v2
  ?wl= would be misread by v1. app.html still reads v1's ?w= / ?wl=
  for ids. PIA-147's index.html shim must forward the query (it keeps
  query and hash today), so ?l= reaches app.html after the cutover.
- The list link points at the app's folder (DASH_URL), like v1's share
  links. Before the cutover it lands in v1, which ignores ?l=. No v2
  link is shared before PIA-147.
- The book-by arc is (days to book-by) / (days to go): full far out,
  empty on the book-by day, gone once everyone has booked. ⏳N shows
  for everyone; red only where book-by matters (organizer, answered
  unbooked traveler).
- ↩ restores a dropped trip to its last decision (booked with its
  paid amount, or 🔒 chosen from the plan) rather than always to
  proposed.
- The card total is not a control yet: P-total is PIA-140's. A tap
  there opens the trip like the rest of the card.

Not covered here: P-dates from the card pill (PIA-138), P-total
(PIA-140), hiding a trip on this phone (P-stage, PIA-137), pull-down
refresh, and the first-run auto-open of ⓘ. A trip saved from a list
link has no identity on this phone until P-face or the profile
auto-pick (PIA-137), so its card has no ✈↗ until then.

Owed before cutover (PIA-147), needs people: the 2-person shared-list
comprehension check ("Where did Tahoe come from? Will new ideas
appear?"), now against the real list-share and receiving sheets.

Refs PIA-135.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g

feat(v2): trip view and RSVP — the organizer page and the open portal

The trip page is the open portal: anyone with the link sees the whole plan
(without prices), answers in 3 taps from the group link or 2 from a
personal one, says why in a short note and can ask to join; the organizer
sees and chases answers. app.html is still linked from nowhere.
pialax.html, pialax-mobile.html, index.html, worker.js and
scripts/trip-idea-builder.js are unchanged.

- scripts/trip-model.js (region, inlined byte-identical in app.html):
  - whoAmI(doc, {stored, hint, names, join}): who this phone is on a
    trip. A remembered face on the trip wins; a hint never overrides it
    (ask: P-face). The names this phone already is (its profile, its
    faces on other trips, its join request) count as remembered too: a
    hint greets its face for the visit (writing nothing) only when none
    of them names a different member of the trip; else P-face asks with
    that member preselected and the hint marked. With neither, P-face
    asks, pre = the one member whose name this phone already is (never
    saved by itself; two "Sam Lee"s or a v1 "Me" preselect nobody).
  - primaryAction(model, today): the one rule for every role. share
    [📣 | ✈↗] before 🔒 (a traveler who answered; the organizer even
    before he answers), share-only (an organizer who does not travel),
    book [✈ Book ↗ | 🎫] once set with my days ahead, booked
    [✈⏱↗ | 🎫] after my 🎫 (kept on a paid trip), none for hosts, out,
    unanswered or faceless guests, begun days and closed trips.
  - bookToggle(model, code): the organizer's 🎫 on another row once the
    dates are set (or anyone booked); never a host, his own row, a closed
    trip or a v1 doc; confirm for waiting / out (recorded in first, 📞)
    and for taking a 🎫 away.
- app.html:
  - The trip view, one skeleton for every role (trip-organizer,
    trip-portal, trip-portal-host):
    - nav ‹ ✎(organizer) 📣 ⓘ ⚙; the nav's 📣 is hidden while the
      primary is Share, and the organizer's pulses while anyone is ◌ or
      the plan moved since his last 📣 (pialax_shared_at_v1[id]); it
      stops the moment he shares (the view redraws).
    - hero: 📍<code> on every view, hosts' too (one tap: the Map, this
      trip; the Map gets its own history entry, so the phone's Back
      returns to the trip), 📝 caption, the stage pip (named by its
      stage; → P-stage), the heads ring (→ scrolls to the board).
    - me: my 64px face (→ my P-person), 👋 + my name (≤2 words), 📝＋
      (my own note, once I have answered), ⇄ (→ P-face); a phone that is
      nobody here has 👋 ? instead.
    - the plan pill, my own days in my colour (⚠ when reversed).
    - In / Maybe / Out labelled, equal, nothing pre-pressed; a host's In
      is a question until tapped (grey, dotted; a hollow grey ✓ on the
      face); the pressed answer breathes while it is on its way (aria-
      busy) and ✓ toasts once saved; Out on someone booked arms first
      (🎫↩, it takes the 🎫 away); 🏁 / 🗑 on a closed trip (paid or
      dropped) instead of taps that fail; Done still answers.
    - the people board: day numerals (weekends, 📌 under the trip's own
      picture, today ▾), one row per person: answer shape, every mark
      (⚠ 🎫 🏠 top, 📞 📝 bottom), name (fitNames drops them to keep
      ≤10), the bar (in / maybe / waiting over the plan / a host band /
      none when out; squared own ends, ⚠ off the plan, 🚗 on the hub's
      other airport); out rows dimmed. Faces are named for a screen
      reader with their answer and marks. One tail column: the
      organizer's 🎫 (bookToggle, aria "Booked, <name>") once set, else
      on his token phone each traveler's cached-fare sum, shown only once
      any leg has a cached fare (no column of $—). A guest's has neither.
    - the one total on the organizer's token phone (the card's rule),
      also only once a fare is cached (or 💵 paid).
    - the primary (primaryAction). With no flight link it says why:
      🧭↗ Explore for an idea with no place, 📍? no airport, 🚗 no flight
      needed, ✈⚠ the dates (or no link).
  - P-face: "👋 ? Who are you?" (the question gives way to "To
    organizer" while the join row is open, so it stays ≤20 words); the
    trip's people (named first, a v1 "Me" last as a dashed face with no
    word), 1-word names above six, ×N, 🏠. The outlined and focused tile
    (#pf-mark) is who this phone already is (its face here, else its
    preselected name, else the link's face), with 👋; a hint for someone
    else is only marked (✉, dashed). A tap: pialax_idea_me_v1[id] and my
    profile (v1 format), kept in memory too (S.picked, read first) so the
    face just picked answers even where the stored map cannot be read;
    an answer still waiting pulses. 🙋＋ opens a name (≤3 words, focused) and airport row (a
    longer word is cut to 3 letters with ⚠ and refused until it is a
    code; an unknown code is 📍⚠ and goes); 📣 shares joinLink(dirBase(),
    …) through navigator.share {url} (P-link fallback) and remembers the
    ask (pialax_ui_v1.joins[id] = {name, ap}). While it waits, the 🙋＋
    tile shows ⏳ and the name, and reopens the row filled. It opens by
    itself once per trip and visit: nobody here, or a hint that differs;
    never over a sheet, never on a past or dropped trip; once more when
    the organizer has added the joiner (their tile preselected).
  - P-joinfwd: a join link opened on a phone without the trip's key (the
    friend who forwarded the trip, or the joiner) shows who asked (name,
    airport) and 📣 "To organizer" to send the same link on, instead of
    vanishing; nothing is written.
  - P-person: header (72px face named by the person, marks, name, ⇄ on
    my own), the bar, 🏠 <code> for a host, else where they fly from
    (🛫 code +n ✎, once answered, dated or not; the field opens selected,
    ⚠ as above, cleared = home) and, with days, the legs: 🛬/🛫 with
    dates (own ones underlined), the hub pair's radio cells (only
    PIA/ORD, LGA/JFK; for me or the organizer, once answered) or the
    airport written out, the open-jaw one-way links; the organizer's
    proxy answer row (📞); the note preview (8 words…; ＋ for an editor
    once answered); their link (✈↗, ✈⏱↗ once booked) for me or the
    organizer only; 🎫 to take my own booking back (two taps); 📣 Share
    while they are ◌ or ?: their #m= link on the organizer's phone, the
    group link on anyone else's (a guest never hands out someone else's
    personal link). A guest looking at someone else: face, bar, ends,
    note, Share — no dead control.
  - P-note for one person: ≤20 words (typing and pastes capped), saved
    with ✓ or as the sheet closes inside one complete answer (by self:
    📞 cleared; by the organizer: 📞), 📝✓ once saved, maxlength from
    noteRoom; the organizer opening someone else's note reads it first
    (no field, no keyboard) and ✎ makes it a field; a longer v1 note
    opens at its first 20 words with ⚠ and needs a second ⌄; others
    read it. A failed save keeps the text and shows P-error.
  - P-stage: the five stages by name (the others dimmed: a picture, not
    a menu), ⭐ (list pin) and 🗄 (hide here).
  - The trip store: every write of a trip (answers, notes, cells,
    origins, 🎫 and the organizer's edits) waits its turn in a per-trip
    queue (WQ) and is rebuilt from a fresh GET /idea when its turn comes,
    as organizerWrite always was; each is drawn at once on top of the
    Worker's last doc (BASE) and the writes queued ahead of it. A failed
    write carries retry: P-error says "📶⚠ Not saved" and ↻ sends that
    write again (rebuilt), instead of only re-reading.
  - Device storage (lsGet / lsSet / lsDel): a value this page fails to
    store (a write that throws: blocked site data, a full quota, some
    in-app browsers; or every access throwing) is kept in memory
    (LS_MEM) and read first until the page closes; the next write of
    that key that lands hands it back to storage, and callers still see
    the failed write. So a link to a trip new to such a phone lists it
    for the visit, refreshAll reads it, the trip view and P-face open,
    and the picked face answers; a trip the Worker lacks still says
    "Trip not found" and leaves the list. Before, listAdd failed
    silently, nothing was read and the person landed on an empty Trips
    list with no way to answer.
  - Confirming taps (🎫 for someone waiting or out, taking a 🎫 away, Out
    on someone booked) keep the 🎫 and pulse with ✓ or ↩; any other tap,
    a sheet closing, another trip or 6 seconds put them back.
  - Actions: answer (self, or proxy from P-person; nobody → P-face; a
    hinted face is confirmed by its first answer, 🎫, note, airport cell
    or origin, never replacing a profile that names someone else;
    confetti on In unless reduced motion; mine over the organizer's
    entry takes it over), booked, mybook, unbook, legair, origedit /
    origsave, pnote, noteedit, notesave, nudge, joinopen / joinshare,
    joinfwd, pickface, face, person, stage, star, hidehere, ring, eretry.
    Enter: join name → airport → 📣; home code → ↵.
  - Router: ?me=<code> reads as the hint too (#m= is what guestLink
    builds and survives the Worker's 302); both leave the address bar.
    A link to a remembered face pulses it once.
  - ctxFor uses meCode (whoAmI with this phone's names), so a hinted face
    is me for the visit; cards and the Trips numeral follow it.
  - Focus after a sheet closes or redraws returns to the very control:
    its signature now holds the member code and the leg end too.
  - Long-press finds a glyph only in the layer under the finger (the
    sticky primary, the nav, a top row), never one scrolled beneath; a
    mark on a face is named itself when the finger is on it.
  - Dark: the 🎫 toggles and P-stage's tools sit on a lighter chip.
  - LEGEND: switch, whoami, join, hidehere, arrive, leave, drive, today,
    fromlink, asked, nolink, ok.
- Tests:
  - test-trip-model (+19): whoAmI in every case (stored, same and
    different hints, a hint for nobody, a member removed, preselect,
    two "Sam Lee"s, a v1 "Me", a join name before and after the add, a
    hint against a profile naming someone else here, against one naming
    nobody here, against two "Sam Lee"s); primaryAction for organizer,
    guest (unanswered, in, out, faceless), host, set, begun, booked,
    paid and dropped; bookToggle; the trip view's writes in order
    through the real Worker keeping days, note and origin, 📞 set and
    cleared; a Done trip still answering, a paid one closed (409).
  - test-app (+75), against the real Worker: the group link (P-face by
    itself, face, In: 3 taps, counted by the actions that actually ran);
    the nudge link (no sheet, nothing stored, In: 2 taps; ?me=); a hint
    against a remembered face (the remembered one outlined and focused,
    the hint ✉) and against a profile (Dad's phone never answers as
    Anjo; a profile for nobody here is not replaced); a v1 "Me" with no
    word; the list-link trip's preselected face; the join row, its
    pending tile and P-joinfwd on a phone without the key; a host's
    dotted In, Out ⊘, ⌄ for every close; marks equal on a guest's and
    the organizer's board; no price for a guest, no $— before a fare;
    📍 for every role; the primary for every role; proxy Maybe (📞);
    the nudge (the organizer's #m=, a guest's group link, a member gone
    = no crash); the share pulse; 🎫 and Out with their confirming taps
    and their disarming; notes (read-only first for the organizer, ✎,
    ✓, second ⌄, self vs 📞, v1's "(entered by …)" as 📞); airport cells
    only on hub pairs (MDW handed straight to the action sends nothing);
    a stale phone's proxy answer keeping her newer days, note and EWR,
    and her stale answer keeping his ORD cell; In then Maybe on a slow
    network (one request out at a time, Maybe kept); storage whose
    writes throw (pickface then In: one answer), also for a group link
    opened through the router on an empty phone (the trip listed in
    memory, read once, drawn with ?idea= kept, P-face by itself, In then
    Maybe: two answers, nothing stored, a card back on Trips), on a full
    quota with another trip listed (both read, the stored list
    unchanged), with every access throwing, and for a trip the Worker
    does not have ("Trip not found", off the list); a failed answer, "Not
    saved" and ↻ resending it once; 📞 taken over by her own tap; a
    hinted face's cell and origin making it this phone's; a city cut to
    SAN refused, an unknown code sent; paid 🏁, dropped 🗑, Done
    answering; P-stage.
  - test-trust: A1 also taps the nudge and the join request on a phone
    with a share sheet: 4 payloads, URL only, none with a secret.
  - test-words: two new phones (the organizer of a set trip in Peoria,
    a guest on it and on a paid trip); every trip view of every phone
    at every width walks P-person for each face (and each note),
    P-stage and P-face with the longest join name, with long-press
    once in each kind of sheet; P-face counted wherever it opens by
    itself; the 3-tap and 2-tap answers with real clicks against the
    real Worker; a hint on another face's phone (Ashwin outlined and
    focused, Anjo marked); Anjo's link forwarded to Dad's phone ("Who
    are you?", Mom & Dad outlined); the join row (3-word cap, BOS, the
    URL only); P-joinfwd on a guest's phone with a real tap; a host's
    dotted In; all 8 long-named sheets as the organizer, someone else's
    note read first and ✎, a note typed past 20 words saved with 📞;
    P-stage's names; a set trip's 🎫 marks (armed) and Book; a paid
    trip's 🏁 and Flighty; real, hit-tested taps on the ring, a board
    face (focus back on it), the stage, ⇄, two 🎫 (one written, one
    armed and put back), my 🛫 PIA cell (focus stays), the origin field
    (selected; a city cut and refused; BUR saved), my note from the me
    line with ✓, and Maybe; the 📣 pulse stopping at once.
  - test-viewport: the trip view's states and sheets (P-person as
    organizer, mine, with 8 long names and with PIA | ORD cells;
    P-stage; P-face, its join row and a city cut with ⚠; someone else's
    P-note read and ✎ editing; a set trip with 🎫 marks and one armed;
    P-face by itself on a v1 trip; the host's view; P-joinfwd) at
    360/390/430, light and dark.

Decisions:
- The hint format is guestLink's #m=<code> on /i/<id> (the fragment
  survives the Worker's 302 to ?idea=); ?me=<code> is read too, for a
  link built straight to the app. Neither is ever written by itself:
  the hinted face's first answer (or 🎫, note, cell, origin) makes it
  this phone's, and never replaces a profile that names someone else.
- "Remembered" covers the profile and this phone's faces on other trips,
  not only pialax_idea_me_v1[id]: a forwarded personal link is the
  likely way a wrong hint arrives.
- A preselected face (profile, other trips, a join request) is only
  outlined in P-face; one tap saves it. Matching is by the normalized
  name, so two members with one name preselect nobody.
- A guest's 📣 on someone else's sheet shares the group link; only the
  organizer hands out a personal #m= link.
- Every write reads the trip first (a free GET), one write at a time per
  trip. It doubles the requests of an answer and costs nothing; it closes
  the stale-screen and racing-tap erasures except for the moment between
  that GET and the POST (see Owed).
- The organizer tapping the same answer a person gave themselves sends
  nothing (it would only stamp 📞 over their own answer); a person's own
  tap on an answer the organizer entered does send, to clear 📞.
- Storage that refuses a write is mirrored in memory per key for the
  visit, at the one storage layer, rather than only for the list: the
  trip list, the face, the profile, the join request and the seen marks
  then agree with each other on such a phone, and no screen needs its
  own fallback. Nothing in memory outlives the page or reaches another
  tab, and no edit key or token is ever written anywhere new by it.
- A guest who has not answered gets no primary: the answer row is the
  call (the spec's portal rule); the card's ✈↗ stays one tap away.
- The organizer's 🎫 column shows once the dates are set or anyone has
  booked (before that, his token phone shows each traveler's sum once a
  fare is cached); a waiting or out person, taking a 🎫 away, or Out on
  someone booked needs a confirming tap that lapses after 6 seconds.
- Airport cells, origin and notes are offered only once a person has
  answered (respondRequest needs an answer, and none is ever guessed).
  The organizer's airport or origin change keeps the 📞 mark as it was;
  a person's own change, note or answer clears it.
- ⭐ and 🗄 live in P-stage (the prototype), not the nav. The heads ring
  scrolls to the board (the spec), so names dropped by fitNames stay a
  long press away.
- No separate me-row in the board: my row is 👋 there; the me line above
  the plan holds my face, name, my note and ⇄ (the spec's hero face),
  and 👋 ? when this phone is nobody.

Owed (needs a person, a device or a later ticket, not done here):
- The record names no organizer (the Worker keeps only the edit key's
  hash, and validateIdea has no field for one), so no phone but his can
  mark his face for a joiner; the join row says "To organizer" in words
  and P-joinfwd sends a stray request on. A Worker field (or a structured
  notes prefix) would let every board show ✎ on his face.
- /idea/respond replaces a whole answer, so a write that lands between
  this phone's fresh GET and its POST can still be overwritten; a
  field-level merge in the Worker would close it.
- A group link opened on a real phone whose storage refuses writes
  (an in-app browser, blocked site data, a full quota): checked here in
  Node and in Chromium with localStorage writes (and every access)
  throwing, not on a device.
- The comprehension and icon checks listed in CLAUDE.md before cutover;
  the confetti, pulses and confirming taps on a real phone with reduced
  motion on and off; dark-mode contrast of 🗄 and the 🎫 chips by eye.
- Board names dropped by fitNames on busy trips (a "who's in" list in a
  popup was suggested); a guest's Share made secondary to ✈↗ until the
  dates are set: both left for the PIA-142 Family pass.
- The Map tab still shows only the selected trip's card until PIA-143.

Not covered here: P-dates, the ±1 plan shift and leg date shifts
(PIA-138); booked flight times, the 🎫 pulse on return from Google
Flights, 💵 paid in P-stage and calendar-plus (PIA-139); P-total, leg
prices and 🔍 (PIA-140); P-person opened outside a trip view (Family,
Map, P-day: PIA-142 … PIA-144, which pass outside: true for my own
answer row).

Refs PIA-137.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g

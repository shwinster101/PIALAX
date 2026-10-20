feat(v2): Trips › Family — the people × trips board

Trips › Family is the people × trips board: one row per person, merged
across every trip on this phone by name, one column per trip in the
cards' order, 4 a page. Each cell is that person's answer on that trip
drawn exactly as their face on the trip view draws it (the same shape,
a host's unconfirmed default too, the same ⚠ 🎫 🏠 📞 📝 marks), with
the day they set to arrive. Each row carries 🏠n, the trips that person
hosts, past and planned; each column's foot is that trip's heads by
headcount. A cell opens that person on that trip with the answer row:
the organizer answers for them (📞), anyone nudges someone who has not
answered, my own cell gives me my own In / Maybe / Out, and a phone
with no name yet makes a face its own with one tap (🙋 It's me). 🗄
adds the past trips as columns (hosting history). The board is built by
the model from the very models the cards and trip views draw, so it can
never disagree with them. No prices on it, on any phone. app.html is
still linked from nowhere. pialax.html, pialax-mobile.html, index.html,
worker.js and scripts/trip-idea-builder.js are unchanged.

- scripts/trip-model.js (region, inlined byte-identical in app.html):
  - familyBoard(models, {past, name}): cols = the trips off the shelf
    in the order given (the cards'), then, with past, the shelf's;
    never a dropped trip. rows = one per person, merged by normalized
    name; the k-th member of a name on one trip joins the k-th of it on
    another (two "Sam Lee"s on one trip stay two rows). A v1 'Me' (no
    name) is my row when it is this phone's face there; on any other
    phone it is that trip's organizer, whom v1's family preset names by
    airport (P-migrate's own suggestion: 'Me' at LAX is Ashwin), so it
    joins that person's row when they are on the board by name and not
    on its own trip by name; any other v1 'Me' is a row of its own,
    after the named rows. A row takes its name and face from its first
    named appearance. Me first (who this phone is on a trip shown, else
    on any trip given, else its profile name), then in order of first
    appearance. cells[i] = that trip's own member object (or null: not
    on that trip), so every answer, mark and own day is the model's.
    hosted = the trips given (shown or not, never a dropped one) where
    the person is a host by airport and has not said Out, past and
    planned. headcount = the largest across their trips.
- app.html:
  - renderFamily (trips-family): the top row and [Ideas | Family] as on
    Ideas (list share included); a pager row (◀ dots ▶, aria-disabled
    with "First page" / "Last page" on a tap) when there are more than
    4 trips; the board: a corner with 🗄 (only while there are past
    trips; aria-pressed, "Show / Hide past trips"), column heads (the
    trip's picture, its first day or 🌙N; dimmed for a past trip; one
    tap opens it; a long press names it: its title, free under the word
    rule as data-ttl in a [data-free] span of the label, then its days;
    sticky under the top row, opaque, at the top row's drawn height),
    one row per person on the page's trips (and me): the face on its
    colour with ×N and 🏠n ("Hosted or hosting" in place on a long
    press), the first name (fitNames drops them from the bottom up to
    keep 10 words, the names of hosts and of people who still have to
    answer here last), 👋 for me; cells (famCell: the shape by
    statusKey, the marks by markSets, the own arrival day; a faint dot
    "Not invited"), and the foot's n/N heads ("Heads in"). A short tap
    on n/N, a faint dot or the pager's dots names it (picTap → explain),
    as a long press does. 4 tracks a page at every width (76px row heads
    + 4 × ≥63px fit 360), a short last page keeps the columns' width.
    Empty (nothing upcoming): trips-family-empty, the ghost row of
    dotted faces with ＋ (P-new-what) and 🗄 when there are past trips;
    ◷ while trips are still being read.
  - markSets(x): the marks as [glyph, key] top and bottom; marksHTML
    (the trip view) and famCell both draw from it. Their chip (a cell's
    .ov, a face's .bd) is --markbg / --markink: white with dark ink in
    light, #D9DEE7 with dark ink in dark, so a dark 📞 reads (it was a
    near-black chip in dark mode). The board's wrapper is .cwrap (no
    longer the unscoped .cw label utility).
  - P-person: a trip whose days are past (not closed) takes answers and
    nudges no more, like a closed one; the answer row that would be
    there stays greyed (aria-disabled, data-why) and a tap says "Trip
    over" (answerRow, so the trip view's own row too); on an unmigrated
    v1 doc the organizer's row for someone else says "Update trip
    first" (PIA-146 brings that update). On a phone that is nobody on
    the trip and does not organize it: 🙋 It's me (pickface for that
    face) when the phone has no name yet or its names pick this face,
    and 🙋＋ (pjoin: P-face with its join row open, ‹ back) when its
    names pick nobody there. 📣 is still offered there (AC4: anyone can
    nudge), under 🙋 It's me.
  - Actions: fcell (a cell: P-person outside a trip view, so my own
    answer row is there; on a trip this phone is nobody on yet, my
    name's cell opens P-face with that face outlined and focused, then
    pickface turns the sheet into my P-person under the same history
    entry, its In / Maybe / Out pulsing once); pickface from a sheet
    opened outside a trip view does the same, from a trip view's sheet
    it closes onto the trip with its answer row pulsing; pjoin; answer
    (aria-disabled: explain, nothing sent; a past trip sends nothing);
    nudge (never on a past trip); famrow (a face lights its row up
    across the trips; again: off); fampage; fampast (kept in
    pialax_ui_v1.famPast, now in the key's format comment with joins
    and draft; switched on, the board shows the page where the past
    trips start).
  - Long press names a cell's marks and own day and a face's 🏠n in
    place (pressTarget); the face itself says the name, so names
    fitNames dropped are still a long press away. layerOf counts the
    board's sticky heads and corner as a layer, so a press there never
    names a glyph scrolled under them.
  - LEGEND: ownarr (Own arrival), notinv (Not invited), hosted (Hosted
    or hosting), pastcols (Past trips).
  - CSS: the board's corner and sticky heads, past heads, highlighted
    rows, the marks' chips, the pager dots, the ghost row, a greyed
    answer row (.ans.ro), a titled label that wraps inside the screen;
    the unused .people .cpp rules of the old placeholder are gone.
- Tests:
  - test-trip-model (+16): columns and their order, 🗄 and the dropped
    trip; people merged by name with their cells being the trips' own
    member objects; two Sam Lees (the k-th joins the k-th); v1 'Me'
    rows (this phone's joins my row; another phone's joins the preset's
    named row, named from it even when the v1 trip comes first; one at
    an airport outside the preset, or whose preset name is on its trip,
    stays its own row after the named rows); heads by headcount; 🏠n
    across active and past trips (Anjo's New York with 🗄 off too,
    Ashwin and Maya the LA weekend, SNA in LA's set), never a dropped
    trip or a host who said Out, and with 🗄 on equal to the 🏠 cells
    on the row; the migrated Thanksgiving's unconfirmed host default
    merged with Diwali; own arrival days; marks; the profile name as
    me; a clash on my cell (the model's own mark); no price on any row
    of a token phone.
  - test-app (+24), against the real Worker: cross-view consistency
    (all 23 cells of five trips against every face on each trip view's
    board, the faces on each card, every column's heads against its card
    and its heads ring, Diwali 3/4 by headcount); columns in the cards'
    order 4 a page; me first, ×2, 🏠n; Not invited; no price on the
    token phone's board; page 2 rows and width; ◀ ▶; 🗄 on (the page of
    the past trips, Anjo's hosted New York) and off; Anjo's cell opens
    the very sheet her face opens, 📣 hands over her #m= link, In saves
    📞 and her cell and face both turn ✓ 📞 (4/4); my own cell's answer
    row (no 📞, my note kept); the row highlight; nothing searched and
    /account read at most once on the organizer's phone; a guest
    (holding a token) shares the group link, offers no answer row and
    makes not one /search or /account call; 🙋＋ → P-face with the join
    row open over the sheet; my name's cell on a trip this phone is
    nobody on: P-face, then my P-person under the same history entry; a
    first-run phone's own cell: 🙋 It's me (no answer row), then her
    own sheet (same history entry) and In as her own answer (📞 gone),
    her cell ✓, no /search or /account; 🙋 on a trip view's face sheet
    closes onto the trip, its answer row pulsing; the organizer's greyed
    rows on the v1 Thanksgiving ("Update trip first") and on a past
    trip ("Trip over", the trip view's row too, no 📣), a tap sending
    nothing; the heads' data-ttl / days and the hosted key; the v1 'Me'
    folded into Ashwin's row on Mom's board and the names kept last for
    hosts and people still to answer; the ghost row with 🗄 and ＋, the
    ghost alone with only dropped trips, ◷ while unread.
  - test-words: the AC3 walk now pages every phone's board, then with
    🗄 on, at 360/390/430 (a cell's sheet on each page at 360, ⓘ and
    long press with 🗄 on), counted; PIA-142 section: every page 1–4
    columns, targets ≥44px, no sideways scroll; 13 people (8 long names,
    two Sam Lees, unknown airports) at exactly 10 words at each width
    with ⓘ and long press, Bartholomew's cell → his sheet with the
    organizer's answer row, Out saved 📞 through the real Worker, a face
    whose name was dropped naming itself; real clicks on ◀ ("First
    page"), ▶, 🗄, a past trip's greyed row ("Trip over", nothing sent,
    no 📣) and its head's long press (title free, then its days),
    Anjo's cell (📣 her link only, In 📞, focus back on the cell), my
    own cell, a column head and ‹ back to the board; the ghost row (🗄,
    ＋ → P-new-what); P-face then my P-person and In; a first-run phone:
    Bartholomew's sheet with 🙋 It's me and 🙋＋ (the long names'
    worst case), her own cell's 🙋 It's me then her own answer, then 🙋＋
    → P-face with the join row; a v1 doc's "Update trip first". Every
    write is read back by polling the real Worker's record (and the
    cell, the share sheet, the label) with a real-time ceiling that only
    bounds the wait, never after a fixed sleep (the review's three new
    400ms waits and the 1500ms wait are gone). labelCheck expects a
    titled head to say its title before its label.
  - test-viewport: the board's pages (1–4 columns each), 🗄 with the
    past trip (dimmed, the dropped one never), a cell's P-person, the
    ghost row then 🗄, at 360/390/430, light and dark; every mark chip
    on the board light with dark ink in both schemes; scrolled down, the
    heads opaque right under the top row.

Decisions:
- A cell is the model's member object, drawn by the trip view's own
  rules (statusKey, markSets), so the board shows a clash ⚠ exactly
  where the trip view does: on this phone's own face (the model's rule:
  a clash is known only from this phone's list). Another person's
  double-booking is not flagged on the board; that stays the rule.
- 🏠n counts every non-dropped trip on this phone where the person
  hosts and has not said Out, upcoming ones too (the spec's "across
  active and shelf trips": the fairest next host); its key says so
  ("Hosted or hosting"); with 🗄 on it equals the 🏠 cells on the row.
- 🗄 shows the past trips (and trips hidden here) after the active
  ones, never a dropped one, and jumps to the page where they start.
- A page shows me and the people on its trips only (rows of faint dots
  said nothing); the board keeps 4 tracks on a short last page.
- Faces stay; only names go (fitNames, from the bottom row up, hosts'
  and still-to-answer names last). Every face names itself on a long
  press.
- A trip whose days are past takes no answers or nudges (it was one
  tap away under 🗄). A v1 doc's cells stay read-only for the organizer
  until PIA-146's update, and say so.
- 🙋 It's me only where this phone could be that person (no name yet,
  or its names pick that face), never on the organizer's phone; 📣 stays
  beside it, as AC4 has anyone nudge.
- The old placeholder's faces row is gone; myNorm stays for P-sharelist.

Owed (needs a person, a device or a later ticket):
- The prototype's Mom & Dad icon check and the 2-person comprehension
  checks listed in CLAUDE.md, now also: does a dotted cell read as "has
  not answered", the outlined ✓ as "host, not confirmed", 🏠n as
  "hosted or hosting", 🗄 as "past trips", and does a first-time
  visitor find 🙋 It's me on her own cell?
- History (NYC, Memphis, Peru, London) reaches the board only through
  PIA-146's ⤒ import; until then 🏠n counts only the trips on this phone.
  The organizer answers for people on the v1 Thanksgiving only after
  PIA-146's update (its cells say "Update trip first" until then).
- A "who's in" list for names fitNames drops on a busy trip view
  (PIA-137's owed note) is still not built: on the board every face
  names itself on a long press.
- The mark chip's contrast (now light in dark mode) and the sticky
  heads by eye on a real phone; VoiceOver / TalkBack reading of the
  cells (each is "<trip>: <name>, <answer>, <marks>, arrives <day>")
  and of a head's long press on a real device.
- The full scripts/preflight.sh still does not fit one 600s foreground
  run here (test-words alone runs far past 10 minutes on this machine;
  each part below took 7-8 minutes).
  This pass ran preflight's steps 1-7 and every other suite in one run
  (GO: test-core 63, test-extraction 229, test-worker 91, test-trip-
  idea, test-trust 86, test-trip-model 365, test-gflinks 100, test-app
  497) and the word gate in parts that each keep the full AC3 walk and
  AC5 (+ PIA-142: 36 checks; + PIA-141: 39; + AC2, AC4, PIA-135: 67;
  + PIA-136: 39; + PIA-137: 40; + PIA-138, PIA-139: 43), all passing.
  PIA-140's section fits only beside a walk of its own prices phone:
  its own checks pass there; the five that need the organizer's full
  walk in the same run (P-total from a card on every token phone, and
  AC5's organizer long-press and P-sharelist checks) could not be run
  in one window. test-viewport passed (123). Nothing here times a gate
  out as a pass: the ship step (no ceiling of its own) needs one full
  run, by a person or CI, to see a single GO.

Refs PIA-142.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g

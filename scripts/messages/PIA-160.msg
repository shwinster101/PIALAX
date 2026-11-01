feat(polish): one type scale, the phone's text size, clearer edges, aligned times; ⚙ #160

The owner: "Clean up ui after 158 to look smooth and natural for a family (user
stories of mom dad and Gen Z kids) emphasizing formatting, text size font, and
spacing." Mom & Dad read on iPhones, often at a larger text size, and host and
drive; Ashwin and Anjo want it to feel like an iPhone app. His earlier answers
stand (12-hour times everywhere, 14 + 5 words); the twelve design confirms are
built as specced and stay reversible. Presentation only: no word, tap, storage
format, link, marker, Worker or model change (trip-model.js and the inlined
region are untouched).

- Tokens (app.html :root): seven type sizes, --fs-1 … --fs-6 with --fs-3b
  (13/15/17/18/20/22/28px at the default), each clamp(old px, rem, old px ×
  --cap); --cap is 1.118 on :root (the screens) and 1.353 on #sheet, #toast
  and #lbl (P-dates, P-cheapest and the create sheet's month grid keep 1.118).
  The root is 106.25% (1rem = 17px where the default is 16px) and, where
  supported, -apple-system-body (an iPhone's Text Size). Spacing
  4/8/12/16/24/32, radii 8/12/16/20/pill, line heights, the 80px name column
  (--col-name, 88px at a root of 19 or more), the board row, motion durations
  and one easing. --edge and --weekend-solid join the colours in :root and
  both dark blocks (the dark blocks hold colours and the key dim only). Light
  --in, --maybe, --bad, --ink3 darker, dark --ink3 lighter; a
  prefers-contrast: more block darkens edges and secondary inks; forced
  colours keep the bars and dots.
- The type map: every px size a person reads is a token; glyph-only boxes,
  face marks and badges keep px, and so do the map's labels (13px), P-dates'
  holidays (14px), P-cheapest's bar values and the 16px link field. 650 →
  600, 800 → 700, prose 400. Badge numerals and ×2 13px. Numerals take
  --font-num (ui-rounded, a local font name), codes the system font. Inputs
  ≥16px. A booking toggle's, Nebby's and a P-pet tick's ☐ / ☑ box is
  1.15em of its label (P-rides' Drive keeps 1em: at 1.15em its second P
  town card's Drive drops under the header at 430px); P-person's 🛬 / 🛫
  sit in a
  1.2em box.
- Times: .tm rounded, tabular, nowrap (600, the hero's 700 in a button, the
  card slot and a P-rides header; the card slot's font shorthand keeps
  tabular-nums); .mer max(13px, .8em) in the time's own ink (the .78em grey
  and the .85 opacity retire); .ap max(13px, .92em) in the system font. The
  board's 12px .ap and the slot's .75em AM / PM go.
- Board: labels 15px on a 17px line; a labelled track calc(2 × 17 + 20) =
  54px in the 72px row (the bar at 19, the leaving line at 37) for every
  track kind; fitTimes, after shrinkNames in render(), measures every label
  and then pins one that would leave its track to that edge (position only).
  peopleBoard reads RT.col and draws every day numeral while a day is ≥1.5
  numerals wide (every other ≥0.75, every third ≥0.5, else every seventh),
  so two drawn numerals are ≥1.5 numerals apart, centre to centre, on any
  range up to 7 weeks (two digits keep about 3px of ink between them or
  more; P town at the default size every day at 375–440px, every other at
  320–360); a
  weekend's Saturday and Sunday are one tinted band (.we6 / .we0 square their
  inner corners). Rows min-height (72px at the default) with 15px names;
  shrinkNames from the drawn size in 0.5px steps to a fixed 13px (#159: 11px;
  a name still too wide is drawn cut). Out names --ink3 at full opacity; the
  host hatch 60% / 22%; weekend numerals on full rounded tiles. The Family
  board's name may use its 76px head.
- One grid: .who, .wkl, the lanes' first column and .lh are --col-name; the
  title's gap is --col-name − 64px, so it starts where the bars do. rideRow
  and whoKey read RT.col (whoKey's room is unchanged at the default,
  rideRow's 4px less); rideRow's chip estimate is set for 15px chips (46 +
  8.8 a day's character + 17 a face, ⚠ 19, +N 18, the no-time chip 78, all ×
  the screens' scale; a one-face 11/20 chip draws 108.5px in Chromium
  against 107), and it holds no chip at all where not even the first fits
  (+N alone: a 320px phone beside the Ask with a two-face chip, or at a
  larger text size, no longer scrolls sideways). KEYCHK's counts and P
  town's Rides row hold at 360 / 390 / 430 / 440; at 414 the organizer's P
  town row with nobody driving holds one chip and +2 where #159 held two.
- +N in the key's rows is a span role="img" named "N more" (in the Rides row
  "1 more ride" / "N more rides"), with the same data-lbl; never a button.
- Edges: --edge on the controls a finger taps (tools, fields, chips, pills,
  answers, the date pill, the card slot, the price row, the time button, the
  segment, the airport pills, P-house's chips and tiles, the Map's lane
  chips (an arrival keeps its ink, a maybe its amber), ⋯ More); .btn's
  border --edge with the primary's ink. A pressed secondary .btn keeps an
  ink edge (P-mapairport's airports), its rule skipping .tkb, .ok, .arm,
  .danger and a quiet button, so "☑ I booked" and "☑ 🐈 Nebby" keep their
  green edge. The quiet look, last in the sheet: a read-only .btn, .tool,
  .hchip, .tg2 button, .mrowb and .ib (and a past Drive) take the sunk fill,
  --ink2 and a solid --edge (.ib, which has no edge, the fill and ink alone)
  at full opacity, their glyphs .55 (a ☐ / ☑ box stays at full ink; a busy
  control and a booked toggle keep their own look); .ans.ro and .achip.ro
  the sunk fill with their answer's ink; a .dc.nope day (a past day in the
  create sheet's month grid, a past or crossing day in P-dates) the sunk
  fill under its --ink2 numeral. 📍's .chip.dchip resets the potluck chip's
  border, radius and line height. An estimated ≈ pickup time on the lanes
  keeps its muted ink.
- The drive primary: .dg 🚗, then .dst with .d1 "⏰ 12:05 PM" (20px/700,
  never a date; the date there only while no ⏰ is known) over .d2 "11/20
  ORD" (the day of ⏰, 15px/600), then the faces; its aria-label, data-lbl and
  words are #159's. The card slot's two lines size to their content.
- P-rides: .rsec's margins reset, .rday 15px/700 in --ink with 8px above (24
  with the sheet's gap) and 8px under (its 6 and the day's 2px gap); .rrun on
  --sunk with a transparent edge (open: dashed amber), 16px corners, 14px
  apart; .rrun.done transparent with a hairline, its header and legs --ink2
  (no opacity); the header's controls in one .rctl (margin-left auto,
  wrapping right-aligned), so Drive keeps to the card's right edge (the
  Midway card's Drive no longer drops to the left); .rdrv 48px, padding 0
  12px, a solid --edge on the surface; legs with avatar(x, 32) faces (.rleg
  .av.s32 only), .ap ≥2.9em and .tm ≥4.7em right-aligned, an empty hidden
  .ap for a later leg at the same stop and an empty hidden .rpx where a
  run's pet flies on another leg; .rhop at 26px; .rrun .rq on a surface pill
  with no dashes (the P-person, paid-line and legend 🚗? keep theirs); a
  covered run's folded chip has a solid edge. P-day's map mode puts its .tm
  in the same 4.7em right-aligned column.
- P-person: the time and field at --fs-4 (20px; the field calc(4.6 ×
  --fs-4), 92px at the default), the field and [AM | PM] wrapped in one
  nowrap .tgrp on a leg's edit row and on timesRow's stand-alone rows, the
  followed airport pill on --sunk with a dashed ink edge at full opacity;
  .leg gap 8, min-height 52. The segment and the pills have one Tab stop
  each (tabindex 0 on the pressed radio, else the first; appended after the
  existing attributes) and the arrow keys, Home and End move and press (not
  with Alt, Ctrl, ⌘ or Shift held: ⌘← stays the browser's Back); the
  sheet's Tab wrap skips tabindex="-1".
- Sheets, toasts, labels: .sheet 16px gaps, 24px bottom padding, 20px
  corners, its text --fs-3, scroll-padding, an 88dvh height on a phone; ⚙'s
  #160 is the title (inherit / 700 / ink); a .phonerow under it on every
  phone (📐 the screen width, 🔠 the text size, role img "Screen 390 wide,
  text 17", a long press "Width, text size" (an icon's label stays within 3
  words), data-k scrw / txtsz with LEGEND entries "Screen width" / "Text
  size", which no ⓘ page lists: ⚙ has none). Toasts 17px/600, readHold:
  min(6000, max(2000, 1000 + 300 × visible pieces)), ≥5000 with ↩ or share
  (the "Too long" toast's hidden sentence not counted); the echo is one .ech
  (display block, width max-content up to --echw, the toast's content width:
  100vw − 64px, on a desktop min(100vw − 64px, 366px) inside a toast of at
  most 398px; 52px less when the share symbol and its 8px gap follow it,
  .ech:not(:last-child); so the toast no longer shrinks to half the screen
  and the share symbol stays inside it) of whole .nw halves, the · ending the
  first and the ✓ inside the last, so it wraps only after its · and its ✓
  never stands alone. The echo's toast carries .echo (toast()'s {html,
  echo: true}): width max-content, its row wrapping, the .ech never under
  min-content (its widest half), so where a half alone leaves no room beside
  the share symbol (320px at a 23px root, the largest) the symbol wraps
  under the echo, at the right (margin-left auto). A top toast under the
  safe area. The bubble
  17px/600, wrapping within min(320px, 100vw − 32px); lblHold: min(5000,
  max(1500, 1000 + 250 × pieces)) after endPress and explain() (were 900 and
  1400ms). fitHead starts a pixel under the drawn size, down to 14 × RT.kR.
- typeScale() (root px, kD ≤1.118, kR ≤1.353, col 80–88) is read in runCtx
  on every render, guarded where there is no getComputedStyle (the node
  harness).
- Motion and hover: hover only under (hover: hover) and (pointer: fine),
  never on a pressed, done or state-filled control; (hover: none) :active
  dims to .72 with a passive touchstart listener; .sheet.open 240ms and
  .card.fly 320ms with no overshoot; the nudge ±4px over .4s; a toast fades
  in; reduced motion keeps a still ring (.pulse, .btn.glow, .fld.invite) or
  outline (.answers.nudge, .pulsefld, the carried AM / PM). :focus-visible
  has no radius of its own; the grid and dish tiles ring inside.
- Calendar: numerals 15px, a weekend's on --weekend-solid, a past or
  unavailable day's in --ink2 at full opacity (only the trip lines dim),
  today 24px. P-house: 1.5px --edge chips and tiles, 2px ink for mine, the
  dish grid five columns under 340px. Dead CSS with no markup is deleted
  (.app.fabpad with it).
- Tests: test-app checks BUILD and the meta (160), the exact text-size rules
  and 📍 reset, the dark blocks (colours only, one name list), a type lint
  over every px size (an allowlist of glyph-only boxes, marks and named
  exceptions; no 650 / 800; no focus radius; no dashed quiet rule; the hover
  and press media), the pressed rule's exclusions and .btn.tkb.tkon's green
  edge, that no .done / .dis rule fades a control, the echo's and the
  .dc.nope rules, a fixed matrix of token pairs for contrast in light, dark
  and both Increase Contrast schemes, the still motion rules, readHold /
  lblHold and the holds toast(), explain() and endPress() set, ⚙'s phone
  row and LEGEND, the touch listener, the default scale in the harness and
  the board's numeral density (at 360: 10 days every day, 11 every other, 22
  every third);
  its drive-primary, +N, segment and pill regexes are re-asserted on the new
  markup, the echo read flat (echoFlat) and its raw markup pinned once.
  test-words gains the census: PIALAX_CENSUS=capture wrote
  scripts/fixtures/census-159.json from #159 (4170 screens and popups), a
  shown link and the test token recorded as "<link>" and "<token>" (so the
  fixture holds no checkout path, test key or token); each run must measure
  every recorded state again (one not reached is named and fails) and
  compares it as a multiset of ordinary and marked words (a long-press label
  that a layout change lets the walk reach on another screen of the same
  phone is compared there; PIALAX_CENSUS_OUT keeps a run's own census). The
  same words at a 23px root, as multisets, on P town as Mom & Dad, the
  organizer and Anjo, P-rides (Mom & Dad, the organizer), P-person, P-pet,
  P-house, the Map and the Family board. Its drive-primary text is
  re-asserted in the new order, ⚙'s row label is 3 words, and the rides
  flows read a confirming toast once it shows its ✓ (up to 2.5s: the Worker
  can hold the note a moment before the phone has its answer).
  test-viewport: on P town for Mom & Dad no text under 13px, AM / PM ≥13px,
  15px labels on their tracks, the 80px grid (the key's words no wider), 📍
  borderless, the names whole (Mom & Dad or Mom&Dad, ≥13px, the others
  15px), the drive primary's content ≤240px inside its button; P-rides'
  Drive at each card's right edge, 48px with a solid edge, on the --sunk
  card, each run's .ap starts and .tm ends in one column (±1px, a run of two
  legs among them), day heads one line in ink, no nested dashes; tappable
  edges ≥3:1 and small text ≥4.5:1 (CONTRAST: on the list, P town, P-rides,
  Ashwin's P-person edit row, P-house, ⚙'s #160 and phone row, and the
  echo), "☑ I booked" with its green edge, the one-half echo one 17px line,
  the two-half echo with its share symbol on Ashwin's P town (Mom & Dad
  drive his legs; TELLBOX: both .nw halves and the ≥44px button inside the
  pill, no half under the button, nothing scrolling) at each phone's width
  and, on the 390 light phone, the same toast held in view at 320, 360,
  375, 393 and 402 and at 320, 360 and 430 with a 19px and a 23px root (at
  320 with 23px the button under the echo),
  ⚙'s #160 the title's size at 700; P-rides on 11/21 for Mom & Dad (the
  clock moved and back): the 11/20 runs home at opacity 1, no fill, --ink2,
  their Drive aria-disabled on --sunk with --ink2 and a solid --edge; the
  Family board's names ≥13px with Mom & Dad whole; at a 23px root no
  sideways scroll, labels on their tracks at 16.8px, an 88px column, the
  names whole, the primary inside the screen and P-rides at the sheets' cap;
  the owner's 440×760 first screen and its key; P-house's 🧺 chips keep
  their 1.5px pill edge. A laptop run (1024×768, a mouse, reduced motion,
  Increase Contrast): the framed 430px column, tab bar and sheet centred, a
  hover fill, a still ring and outline, the darker inks, no animation over
  1ms, Tab through Ashwin's P town page (every control ringed, on top at its
  centre, +N never focused), [AM | PM] and the airports by the arrow keys
  and Home (one Tab stop each), Esc back, then the two-half echo with its
  share symbol inside the toast (≤398px) and the column at 17px and at a 23px
  root. The Calendar suite: 15px numerals,
  weekend tint boxes, past numerals in --ink2 at ≥4.5:1, today 24px. The
  Map suite: the lanes' 80px column, the chip's date and time inks, AM / PM
  ≥13px.
- Deliberately not built, recorded in HQ §12: P-person's [🛬 day] as its
  own nowrap group and the pills' indent following a wrapped [field | AM
  PM]; a fixed two-line Map lane chip; keeping the tapped Drive's place on
  the first claim; a 1.15em box on P-rides' Drive. The browser checks not
  written yet are listed in
  V2_ACCEPTANCE.md.
- Docs: CLAUDE.md (one paragraph), PIALAX_HQ.md §12 (PIA-160 amendment),
  V2_ACCEPTANCE.md (a purpose row, the framed desktop column, device checks
  and the browser checks not written yet, pending), CHANGELOG (the PIA-159
  entry kept under its own heading). BUILD and <meta name="pialax-build">
  are 160.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g

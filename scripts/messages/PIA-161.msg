fix(fit): each P-rides leg on one line, its driver never alone; ⚙ #161

The owner's request that PIA-160 answered: "Clean up ui after 158 to look
smooth and natural for a family (user stories of mom dad and Gen Z kids)
emphasizing formatting, text size font, and spacing." Mom & Dad read on
iPhones, often at a larger Text Size, and P-rides is their main sheet. #159
ignored Text Size; #160 grew P-rides' legs from 17px to 23px with it (the
sheets' ×1.353 cap) but kept fixed-width parts, 2.9em / 4.7em columns on every
run and 8px gaps, so in the PIA-161 audit (Chromium, P town, 9 widths × roots
17–23) a leg wrapped with its driver's face (🌽) or "🚗?" alone under the
time at 320 × 17–23, 360 × 19–23, 375 × 21 / 23 (and × 19 with nobody driving),
390 × 21 / 23, 393 × 23 (and × 21 open), 402 × 23 and 414 × 23 (open); a run's
🛬 / 🛫 stood alone above its ⏰ range at 320 × 21 / 23 and 360 × 23, and at
320 × 23 the overnight range made the 11/20 cards 12px wider than the sheet's
column; P-person's ride glyph dropped alone under "[MDW 10:30 PM]" (Anjo's rows
on Mom & Dad's phone at 320 × 17–21, 360 × 21 / 23, 375 × 23, 390 × 23, 393 ×
23) and under "[ORD 2:35 PM]" (Ashwin's own at 320 × 17 / 19, 360 × 21 / 23,
375 × 23, 390 × 23, 393 × 23); [✈ Track ↗ | ☑ I booked] scrolled the sheet
sideways 10 / 29px at 320 × 21 / 23; the trip page's pill left a lone 🔒 on
its second line at 320; the Trips card broke "thanksgiving" mid-word at 320
and its "🚗 / 11/20" slot spilled 5px below its box at roots 19–23 (every
width). PIA-161 fixes these by layout alone:
groups that wrap as one piece, columns sized to what they hold, 4px gaps
inside a run card, 12px card padding. No word, tap, storage format, link,
marker, Worker or model change (trip-model.js and the inlined region are
untouched; h12 is only called).

- P-rides legs (runHTML): tcol, one string for every leg of a run (' r1' for a
  run of one leg, ' hr1' for a run of several whose times all have a
  one-digit hour, else ''), and each leg is num + face + pet + one
  <span class="rtl"+tcol> of the code (or the empty .ap) and <span class="rtt">
  [time + driver], then 🚌 🚙 (.rgp); the .sp spacer is gone and .rrun's
  class list is unchanged. A tail wider than the card (a joined run with a
  two-digit hour and two drivers or ⚠ at 320 × 23) breaks once more, the
  code over [time driver], which never parts. CSS: .rrun padding var(--sp-3) (12px all round);
  .rrh, .rleg flex-wrap with no shared gap, .rrh gap var(--sp-2) var(--sp-1),
  .rleg gap 0 var(--sp-1); .rleg padding-left var(--sp-6) with
  .rleg > :first-child margin-left calc(-1 * var(--sp-6)) (a 32px hanging
  indent); .rleg .rtl inline-flex wrap, gap 0 var(--sp-1); .rleg .rtt
  inline-flex, gap var(--sp-1), never wrapping; .ap 2.9em and .tm 4.7em kept,
  .rtl.hr1 .tm 4.05em, .rtl.r1 .ap / .tm min-width 0; .rleg .rgp margin-left
  auto; .rleg .rpet, .rleg .rpx font-size min(var(--fs-2), calc(15px *
  1.118)), width 1.25em, margin 0 2px 0 -6px (the global .rpet rule deleted);
  .rrun .rq padding 2px var(--sp-1).
- The run header: <span class="rhd"> holds 🛬 / 🛫 and the ⏰ range (or the
  day); the range's spaces are U+00A0 ('\u00a0' in the source), so it breaks
  only after its en dash; no trailing .sp. CSS: .rrh .sp deleted; .rrh .rhd,
  .rrh .rhd .rlv inline-flex, align-items flex-start; .rrh .rhd gap
  var(--sp-1); .rrh .rhd .tm white-space normal; .rdrv gap var(--sp-1).
- Drive (observation 2, decided): PIA-160's rule is kept, Drive at the card's
  right edge, on the header's line when the whole header fits, else on its
  own row under it. Reasons: each card places its Drive from its own content
  in CSS alone, so no script measures a card or moves its Drive after the
  sheet draws (Mom & Dad's first claim can still move every card up while the
  sheet grows by its 📅 Phone row: see "Checked and left as is" below);
  from a 21px root Drive is already under the header on every P town
  card up to 393px (up to 430px at 23px), so where Mom & Dad read most it is
  consistent; "all under if any wraps" needs a measuring script and "always
  under" costs about 56px a card on every phone; "always on its line" is
  impossible (at the default size the overnight card's header is wider than
  its card on a phone up to 393px). Measured (12:05 / overnight / 11:15, 1 on
  the line): root 17: 320 000, 360–375 100, 390–393 101, 402–440 111 (#160:
  320–375 000, 390–402 100, 414 101, 430 / 440 111); root 19: 320–360 000,
  375–402 100, 414 / 430 101, 440 111; root 21: 320–393 000, 402–440 100;
  root 23: 440 100, else 000. So at 390px and the default size the 12:05
  and 11:15 cards carry Drive on their line and the overnight card under it
  (as at #159); from 402px all three are on their line.
- P-person (legRows): a booked read row is g0 + day + <span class="ltl">
  [code time] (or the empty field) + ride glyph</span>. CSS: .leg .ltl
  inline-flex, nowrap, gap var(--sp-1); .leg.lbk .lg0 padding-right 0. The
  edit row keeps its .tgrp and the pills' 52px indent; as a booked row
  (.leg.lbk tedit) its 🛬 / 🛫 box drops the same 4px, so where the read and
  edit rows wrap alike the field opens where the time was. The read group is
  the wider one, so where only it wraps (Anjo's 🛬 row in Chromium at 360 ×
  19, 375–390 × 21, 393–414 × 23) the tap opens the field on the line above,
  focused (#160 moved it at six sizes too, the other way); recorded in HQ
  §12. The unbooked rows are unchanged.
- [✈ Track ↗ | ☑ I booked] (bookRow): both returns are
  <div class="split bk">. CSS: .split.bk flex-wrap wrap; .split.bk >
  .btn.tkb flex 1 0 auto; .split.bk > :first-child flex 999 1 0%.
- The date pill: datesText(m, long, grp, pin, tail), a new optional tail that
  goes inside one <span class="dtl"> with the nights; dateRow passes the 🔒
  as that tail when there is a plan (and keeps it after datesText when there
  is none); P-dates' read-only line passes none and draws as before. CSS:
  .daterow .pill .dtl inline-flex, column-gap var(--sp-2).
- The Trips card: .card-a gap var(--sp-2); @media (max-width: 359px)
  .card-a wraps, .card-t flex-basis calc(100% - 72px - var(--sp-2)) and the
  element after it margin-left auto (the slot, or ◷ / 🏠, on a row of its
  own at the right); .slot.wide line-height var(--lh-1).
- Checked and left as is (HQ §12): the organizer's candidate faces follow
  Drive's rule; Kona's › breaks its dates after "–" at 320px from a 21px root
  (a planned wrap inside one button); the Map lane chip "10:30 PM" at 320px
  with a larger root runs into its own padding, inside its edge; the board
  title's 6px overflow, the Calendar cells at 320px and the list's 42.5px
  title button as at #159; toasts keep PIA-160's TELLBOX checks; the Trips
  card title at 360px from 11/19 with a 19–23px root still breaks
  "thanksgiving" (an Android width); 🚌 🚙 take a line of their own at the
  leg's right edge where its line cannot hold them (the joined 11/30 legs on
  Ashwin's and Anjo's phones up to 402px at the default size, at every width
  from 21px), a pair, never a lone glyph; Mom & Dad's first Drive tap still
  grows the bottom-anchored sheet upward by its 📅 Phone row, and the shorter
  cards leave the sheet under its cap at more sizes, so the tapped Drive
  moves up at more sizes than at #160, and further at most of the sizes
  where #160 already moved it (a regression, later: 87px at 390 × 17, #160
  56px; 46px at 375–402 × 19, where #160 moved it 0–13px; 80px at 414 / 430
  × 19, #160 46px; none at 320–393px from 21px; HQ §12 has the table and
  Mom's device check asks her to note it at 🔠 19).
- Tests: test-viewport, inside the existing P town contexts, the matrices on
  the 390 × 844 light phone (as the tells loop), widths 320 / 360 / 375 / 390
  / 393 / 402 / 414 / 430 / 440 × roots 17 / 19 / 21 / 23
  (html{font-size:Npx!important}), each group its own OK / XX line:
  (a) Mom & Dad's claimed P-rides (LEGFIT): no sideways scroll; each run
  card inside the sheet's content box (#160's 11/20 cards overhung it by 12px
  at 320 × 23, inside the sheet's padding, where neither scroll measure sees
  it); each run's 🛬 / 🛫 beside ⏰, Drive within 1.5px of the header's
  right edge, its columns; each leg's code with its time and its time with
  its driver on one line, at most two lines, one line from 375px and at the
  default size, a wrapped tail 32px in, the 🐈 glyph inside its box; at 390
  × 17 Drive on the 12:05 and 11:15 lines and under the overnight one, from
  402 × 17 on every line; and (a0) the same once at each context's own size,
  light and dark. Fails on #160: (a) 79 failures (78 without the card check,
  so it alone fails a run there), the first at 320 × 17 (each leg's 🌽 alone
  on the next line); (a0) at 390 light and dark (Drive [true, false, false]).
  (b) the same with nobody driving yet (a new PT9O fixture, P town with Mom &
  Dad's note empty, on their phone only, never in the keys list), from the
  primary: fails on #160 with 83 failures (82 without the card check; a lone
  🚗? from 320 × 17, the 🐈 wider than its box at 320 × 19, …). (b2) Anjo's
  read-only P-person rows on that phone (ROWFIT): [MDW time] and 🚗? together, the day together, a
  wrapped group at the row's left, nothing sideways: fails on #160 with 12.
  (c) Ashwin's own P-person (PT9A): the same, each row one line from 390px
  (375px up to a 21px root, 360px up to 19px), and [✈ Track ↗ | ☑ I
  booked] not scrolling, inside the sheet, full-width rows when two: fails on
  #160 with 20. (d) the pill (PILLFIT) at 320 × 17–23 and 360 × 17: fails on
  #160 at 320 × 17 (🔒 apart from 10🌙). (e) the P town card on 10/17
  (CARDFIT) at 320 × 17 / 23, 390 × 23, 360 × 17: "thanksgiving" whole, the
  slot inside its box and the card, a 44px target, under the title only below
  360px: fails on #160 ("thanksgiving" broken at 320 × 17 / 23, the slot
  spilling 5px at 320 × 23 and 390 × 23). (f) the card on 11/19 at 320 × 17 /
  23, 375 × 19 / 23, 390 × 23: fails on #160 ("thanksgiving" broken at 320 ×
  17 / 23). (g) Ashwin's own P-rides, in every context at its own size: each
  🚌 🚙 pair together at its leg's right edge (±1.5px), on the leg's line or
  under it: fails on #160 in all six contexts (a wrapped pair 204px short of
  the edge at 360, 234px at 390, 274px at 430). test-app, a "PIA-161
  large-text fit" section: Mom & Dad's P-rides markup (.rhd, the U+00A0 range, .rtl r1 / hr1 with .rtt, the ② leg's empty
  pet place, no .sp in a run, the six U+00A0 the ranges' own spaces and no
  others, the ranges read with plain spaces exactly #160's),
  Ashwin's two .ltl rows, the pill's .dtl and P-dates' read-only line without
  one, and the CSS exactly (the deleted rules absent, the pet box's
  min(var(--fs-2), calc(15px * 1.118))): each of the four fails on #160.
  test-words is unchanged and passes on the untouched census.
- test-app regexes updated for the new markup only (same meaning; #160's
  line numbers): 2823, 2848, 4230, 4429 <div class="split"> → <div
  class="split bk">; 5378 (both
  legs) and 5969 <b class="ap">…</b><span class="tm"> → …</b><span
  class="rtt"><span class="tm">; 5380, 5381, 5933, 5965 and 5966 the leave
  ranges' spaces → \u00a0; 4711 the pill's 🔒 now closes the .dtl as well
  (🔒</span></span></span></button>); 6162 BUILD === 161.
- Docs: PIALAX_HQ.md §12 (PIA-161 amendment), V2_ACCEPTANCE.md (device checks
  and the checks not automated, pending), CHANGELOG (the PIA-160 entry kept
  under its own heading). CLAUDE.md is unchanged: no rule changes. BUILD and
  <meta name="pialax-build"> are 161.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g

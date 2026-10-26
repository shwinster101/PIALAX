feat(flight): each traveler's legs, days and times in one place

- P-person is the traveler's flight section: a 🛬 and a 🛫 row, each
  with its day, its airport (hub pairs only) and, once booked, its
  time field, every row read from the model's flightEnds (day, own /
  follows the plan / booked, ⚠ outside the plan, airport, hub pair,
  time). It opens in one tap from a traveler's bar on the board (mine
  anywhere, anyone's for the organizer), from my booked bar and from
  any face. A long press on a day says which kind it is.
- A row's day opens P-dates for that end alone, on that end's month
  (a 🛫 across a month or a year opens on its day): one tap on a day
  saves it through P-dates' own Save (fresh read, booked confirm once
  a visit, ◷, ⚠ ↻ keeping the pick), then returns to the row's time.
  Days that are past or would cross the other end are greyed with why.
- [✈ Book ↗ | 🎫] in the flight section before the dates are 🔒 too
  (earlyBook): a flight bought early can be recorded on a trip still
  Asking; mine once I answered, the organizer's for anyone with days
  ahead (bookToggle early; a confirming tap for someone waiting). The
  trip view's primary and the board's 🎫 marks keep their rule.
- ownDays: a booked traveler's pick is always stored as their own day
  (the plan's day too, an end still blank as well), and a blank pick
  keeps a booked end as it is; no Follow plan for a booked traveler in
  any picker. A one-end save rebuilds its patch from ownDays on the
  fresh record's model, so a plan moved meanwhile never turns a pick
  into "follow".
- Once booked, the ±1 price chips read their price and say to tap the
  day (the calendar owns a booked day's moves, with its ⚠ 🎫 confirm).
- The board's booked bars carry the landing time over their start and
  the leaving time under their end, ––:–– in amber when missing; near
  the range's edges a label is anchored at its bar's other edge.
- ‹ back to a person's sheet does not focus its time field again; a
  close from the calendar holds a typed time still needing ☀ / 🌃 once,
  back in the flight section (timesWait along the sheet chain).
- Closed, paid or past days and unanswered travelers say why on a tap.
- Tests: Anjo on her own days vs Ashwin on the plan's agree in rows,
  Book links, the organizer's /search, Calendar and Map; an Asking
  trip's 🎫 (hers, and the organizer's for someone waiting); month and
  year turns; a hub trip's ORD ends, times and 🎫 kept by a one-end
  pick; a plan moved on another phone meanwhile; booked chips read
  only; ‹ focus; a held time under the calendar; the board's labels
  inside their track (test-viewport, no sideways scroll); Chromium job
  taps (🎫 → landing time 2, booked day + time 5, organizer 2) waiting
  on what the screen shows, not bare sleeps; words, 44px targets and
  layout at 360/390/430, light and dark.

Decisions:
- A booked end never follows the plan: Follow plan is gone for booked
  travelers and a blank pick keeps their days (the PIA-138 "back to
  following" test now covers an unbooked traveler).
- The 🎫 before the 🔒 lives in the flight section only; the trip
  view's [📣 Share | ✈↗] stays the call to answer and share.
- A second day tapped while a save is out is not taken: the grid says
  "Saving" on that tap, as every P-dates control does.

Owed (needs a person or a real device):
- On a real iPhone and Android phone: the keyboard rising for the 🛬
  field focused after the day's save returns (a focus after a network
  wait); if it does not, the "booked day + time in 5 taps" job is 6.
- 2-person check that 🗓 (follows the plan), the underline (own day)
  and ––:–– (no landing time yet) read without the long press.

Closes PIA-151.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g

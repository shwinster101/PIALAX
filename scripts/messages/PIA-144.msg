feat(v2): Calendar presence and overlapping trips

- Replace Calendar's selected-trip placeholder with the plan/window month,
  daily headcounts, presence dots, holidays, fixed event day and personal dates.
  Month navigation is view state: retained across tabs/background renders and
  reset when another trip is selected. No paid request or new shared fact.
- calendarDay derives the exact same presence as presentOn/dayPeople and adds
  deduplicated clashes from tripModel's existing inclusive-day/name matching.
  Only other trips known on this phone can warn. Maybe stays separate; the
  host pair counts as two. Model region remains byte-identical in app.html.
- Calendar days open P-day with people and links to overlapping trips. Faces
  open existing person sheets with Back. Today/future days offer plus into the
  normal create flow with that date; past days stay readable without creation.
  No title/place is copied and a kept draft cannot override an explicit day.
- Add model, app and real Chromium coverage, including month/year boundaries,
  inclusive overlaps, Out/Maybe/hosts, dropped trips, month navigation, new-trip
  dates, guest privacy, word/touch limits and another phone's RSVP through the
  real in-process Worker. No live paid service is used by the browser suite.

Validated as part of the combined PIA-144/145 build: model checks and dedicated
Calendar browser scenarios pass; the final PIA-145 preflight additionally gates
the full word, viewport and map regression suites before merge.

app.html remains unlinked. v1, Worker, migration and cutover are unchanged.

Refs PIA-144.

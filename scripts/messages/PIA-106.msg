feat(rsvp): who's booked — I booked ✓, strip, counts, booking nudges

Worker:
- POST /idea/booked?id= {member, booked:boolean}:
  - needs an in/maybe answer (400 answer_first);
  - flips only booked/booked_at and keeps the rest of the answer;
  - unknown member or non-boolean → 400; dropped trip → 409;
  - logs booked:/unbooked:<member>.
- /idea/respond keeps booked when an answer changes, and clears it on
  "out".
- Every idea response carries can_book:true.

Client (builder block, three copies):
- tripIdeaCanBook() is set from can_book (pialax_idea_booked_v1); before
  the deploy nothing booking-related shows.
- summarizeIdeaResponses rows carry `booked`; tripIdeaBookedCount gives
  booked/total/unbooked.
- Answer card: "I booked ✓" → "✈️ Booked" + Undo.
- Book panel rows show "✓ Booked"; the organizer gets Mark booked / Undo
  for anyone.
- Strip: booked days are green. "✈️ N of M booked" line; the Trips chip
  adds "· ✈️ N booked".
- Nudge: once everyone has answered, it asks the people who haven't
  booked; the admin button reads "Nudge N to book".

Tests:
- test-worker +3: set/keep fields, keep on change / clear on out, errors
  and closed.
- test-trip-idea: counts, nudge text before and after can_book.
- test-viewport: I booked sticks across a reload (card tag, "1 of 2
  booked", 5 green strip cells).

Closes PIA-106.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8

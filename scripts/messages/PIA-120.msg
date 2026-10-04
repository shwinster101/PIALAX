feat(family): a linked trip has one place for dates and one place to book

Before, the Family tab let you change dates in places the RSVP plan
never saw: the 📅 strip pills, and "Step 2 · Choose Dates" leading to
the Calendar tab. Its route cards linked a round trip LAX→PIA while the
plan was in PIA / home ORD. The correct one-way links were only in the
RSVP sheet's closed "Book for these dates" drawer.

- Shared block (both HTML files + scripts/trip-idea-builder.js):
  - tripIdeaPlanDates(doc);
  - tripIdeaBookListHtml(doc), the same rows and links as
    tripIdeaBookRows/_tripIdeaLegBtns;
  - tripIdeaLinkedRoute(code);
  - _tripIdeaOpenRemote(id, {planEdit}) and _tripIdeaStartPlanEdit;
  - tripIdeaApplyLinkedRsvp moves S.depDate/S.retDate to the plan
    dates and repaints the trip card;
  - the nudge copy now matches the real buttons.
- Mobile trip card (syncLinkedTripChrome): plan dates, "✎ Dates" for
  the organizer, and a "✈️ Book flights" list. body.linked-trip hides
  #step2-bridge.
- Both files:
  - on a linked trip, the strip shows "Plan: … · from RSVP" (no
    openCal);
  - each route card shows "📋 RSVP" plus that person's answer dates
    and the same In/Home links, with no ✏️/reset.
  - Unlinked trips are unchanged.
- Empty-state copy: "Calendar" tab.
- Tests:
  - test-trip-idea: plan dates; book list = In PIA / Home ORD, hosts
    skipped, booked ✓.
  - test-viewport (linked Thanksgiving, in-process Worker + IdeaRoom):
    - the card shows the RSVP plan dates (Wed Nov 25), not the Trips
      card's dates;
    - Me = In PIA Sat Nov 21 + Home ORD Sun Nov 29, buttons ≥44px;
    - the LAX route card's links are identical to the card's;
    - no "✱ custom", the bridge is hidden, no 📅 pickers;
    - ✎ Dates opens the plan calendar.

Closes PIA-120.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8

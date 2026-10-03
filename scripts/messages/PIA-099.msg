feat(rsvp): family RSVP-only page and remembered identity

PIA-099
- ?idea= without this idea's edit key sets body.idea-guest. The backdrop
  becomes opaque, the close controls are hidden and Escape does nothing,
  so the RSVP is the family's page. "Open full PIALAX" leaves it.
- The organizer's device keeps today's dialog over the dashboard.
- The sticky footer button becomes "Send my answer" while the form is
  open.
- restoreFromURL ignores a query that only carries idea/tripIdea, so the
  organizer's saved prefs still load.

PIA-100
- pialax_idea_me_v1 stores {ideaId: memberCode}; tripIdeaWho() picks the
  person the form is for.
- The answer area has three states:
  - name buttons (first visit);
  - "Your answer" card with Change / Not X? (returning);
  - form prefilled from the saved response.
- Hosts get "Confirm we're hosting" (status in, no dates).
- Guests see the organizer as TRIP_IDEA_ORGANIZER_NAME, not "Me".
- Switching names no longer keeps the previous person's origin and dates.

Shared CSS is in <style id="rsvp-layer">, identical in both HTML files.
The builder block is identical in all three copies.

test-viewport runs worker.js in-process behind PROXY_URL (in-memory KV)
and checks:
- the guest page covers the dashboard, has no close and no prices;
- the Send button is on screen;
- the answer survives a reload;
- the organizer view keeps exact dates and cost.
The guest checks fail on the previous code.

Closes PIA-099, PIA-100.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8

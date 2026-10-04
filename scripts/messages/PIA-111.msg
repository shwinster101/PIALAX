feat(rsvp): per-traveler In / Home airport picks (round trip when they match)

Worker:
- validateResponse(raw, members, dest) accepts arrive_at / leave_from,
  but only airports of the destination's hub (IDEA_HUBS PIA/ORD,
  LGA/JFK); anything else is ''.
- /idea/respond keeps earlier picks when an answer doesn't mention them;
  /idea/booked already keeps the rest of the answer.
- Responses add can_legs:true.

Client (builder block, three copies):
- tripIdeaLegPick(dest, row): saved picks, else in = dest and
  home = TRIP_IDEA_HOME_FROM (PIA → ORD).
- tripIdeaLegLinks: one round-trip search when in === home, else two
  one-ways.
- Answer card: "In [PIA][ORD] · Home [PIA][ORD]" segmented toggles.
  tripIdeaSetLegs re-saves the answer with the new picks. Shown once the
  Worker reports can_legs. Buttons follow the picks.
- Book panel rows: "LGA → PIA · home ORD · dates" with In/Home or a
  Round trip button. The round-trip fallback footnote is removed.
- Trips card (both files): handoffIntentsForWatchlistItem uses
  tripIdeaMemberLegs (cached doc) before the trip's gf.returnFrom.
- Tests: worker hub-only and keep-across-changes; unit leg picks/links;
  viewport Home → PIA = round trip, survives a reload.

Closes PIA-111.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8

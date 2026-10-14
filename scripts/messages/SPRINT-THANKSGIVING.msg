docs(backlog): file the Thanksgiving sprint, PIA-121 to PIA-130

The sprint takes Ashwin (LAX) and Anjo (LGA) from "considering" to
"booked" for Thanksgiving in Peoria.

- SPRINT_THANKSGIVING_2026-10.md: the original proposal, with a
  build-decisions box at the top from checking it against the code:
  - a linked trip is priced as two one-ways, not a round trip;
  - a fare is stale only after 24h (the caches keep it 24h);
  - targets are stored on the device;
  - there is no auto-fetch;
  - the airline.com link is dropped (it needs a paid call);
  - Anjo flies from LGA;
  - new ticket PIA-130 hardens the alert path;
  - PIA-128 stays open for infra.
- backlog.md: one row per ticket, in build order.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dug5vjZj6GAEUycz3AfeN6

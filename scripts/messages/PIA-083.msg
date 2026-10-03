feat(trip-ideas): per-person arrive/leave dates on one family trip

- RSVP form: "I'd arrive / I'd leave" (prefilled with trip dates, stored
  in the Worker's existing available_from/available_to - no redeploy);
  rows read "here Nov 21-29"; overlap reads "everyone's there Nov 24-29".
- Hosts (home airport = destination) read "Hosting": travel fields hidden,
  never pending or nudged; companions treat them as confirmed.
- handoffIntentsForWatchlistItem (both files): each traveler's Google
  Flights search uses their own answered dates; label shows them.
- Family Plan: linked answers set S.memberDates (effectiveDatesFor) and a
  cache-only loadPrices; what-if clears them.
- tripIdeaFamilyEstimate(rec, datesByPerson) prices each hub on its
  traveler's dates; choose sends the re-estimated chosen option.
- Tests: staggered Thanksgiving end to end through worker.js (hosting,
  nudge, per-traveler links + labels, member dates, $592 estimate from a
  cached Nov 21-29 fare, booking delta).

Closes PIA-083.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8

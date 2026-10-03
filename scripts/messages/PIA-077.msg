feat(family-plan): shared RSVP answers drive Family Plan in/maybe/out

- openWatchlistTrip sets S.linkedIdeaId for cards with sharedIdeaId and
  applies memberStatusFromIdea (maybe -> tentative) to S.memberStatus,
  so computeRanking / memberCostsFor exclude "out" with no new math.
- renderGroupCost: selectors become read-only "answered"/"waiting"
  labels; note "Using the family's RSVP answers · switch to what-if".
- Answers match by person across the JAX -> LGA move (FAMILY base code)
  and are written under the code active for S.depDate.
- syncURL skips ms= while linked (family answers are not URL state).
- Tests: status mapping, labels, what-if note, home-move mapping.

Closes PIA-077.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8

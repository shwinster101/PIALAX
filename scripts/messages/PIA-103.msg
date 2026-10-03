feat(rsvp): organizer answers for family members; portable organizer link

- Answer for: on the organizer's device, every non-organizer row gets
  "✎ Answer for", which sets sh.answerFor.
  - The form reads "Answering for X (entered by you)" with
    "Save for X" / Cancel.
  - The note is tagged "(entered by Ashwin)".
  - The remembered identity (pialax_idea_me_v1) is left alone.
  - A host's "in" reads "🏠 Hosting — confirmed".
- Organizer link: tripIdeaOrganizerLink(id) builds
  <site root>?idea=<id>#k=<edit_key>; tripIdeaCopyOrganizerLink copies it
  with a do-not-share toast.
  - Shown on the RSVP admin row and as "🔑 Organizer link" on the Trips
    card.
  - On open, _tripIdeaTakeHashKey saves a valid #k= into
    pialax_idea_keys_v1 and strips the hash (history.replaceState) before
    the guest check, so that device gets the organizer view.
- test-viewport:
  - answer-for targets are PIA and LGA, not Me;
  - Mom & Dad's hosting gets saved and tagged;
  - the organizer's own card is unchanged;
  - a fresh device opening #k= becomes the organizer, the hash is wiped
    and the key is stored.

Closes PIA-103.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8

feat(first-look): v1 trips show the family's faces; ⤒ invites; ⚙ #152

- A v1 trip (not updated yet) shows the family preset's faces at read
  time, everywhere the model's faces go (cards, the trip view and its
  board, sheets, P-face, Family, Map, Calendar, P-day): 🌽 Mom & Dad,
  💪 Ashwin (v1's "Me" at LAX), 🗽 Anjo (JAX / LGA / JFK). familyOf is
  migrateLabel's own rule, factored out (a label with no face or the
  v1 word "Me", at a preset home airport, named as the preset names
  them, "Me" or not named); migrateLabel keeps its output.
- memberFaces (trip-model, inlined): a label's own face stays; someone
  the preset recognises shows its face unless a label on the trip has
  it or an earlier row is that person (then the face shown before);
  everyone else shows nameFaces' face, the rule before this change
  (stored faces first, then autoFace of each faceless row's name in
  member order, '#code' for a nameless "Me", the family's old stand-ins
  included), moved on to the next free face only when the family now
  shows it. Only a v1 doc has faceless labels, so v2 trips show exactly
  their stored faces. A "Me" still has no name; nothing is written.
- ⤒ Update trip writes the faces already shown: migrateLabels gives
  P-migrate migrateLabel's names with memberFaces' faces (migrateOptions
  and migrateRequests' defaults), so no face jumps on the update, a
  friend's or a nameless "Me"'s included, and a friend whose hashed
  face is 🌽 or 🗽 is no longer written with a face the family has.
- On a v1 trip the organizer's ⤒ pulses (.pulse, as 📣) once a visit:
  from the first time its trip view is drawn with no sheet over it,
  for one pulse (MIG_PULSE_MS 4800; drawn again mid-pulse, the new
  button gets a negative animation-delay and carries on), until the
  trip is updated (then ✎). A tap on ⤒ spends it (MIG_SPENT, not a
  time); a tap on a greyed "Update trip first" row points to it
  (migPoint): its label now reads "⤒ Update trip first" (the glyph, no
  word) and ⤒ pulses again once that sheet closes. ⤒'s label stays
  "Update trip".
- ⚙ shows the build beside its glyph as a number only (#152, free under
  the word rule, "Build" on a long press) from one constant, BUILD, in
  app.html; <meta name="pialax-build" content="152"> sits beside
  pialax-version. CLAUDE.md and RELEASE_V2.md say how to check a
  phone's build (⚙ #NNN) against main.
- Tests: test-trip-model (the legacy Thanksgiving on every phone; the
  rule against migrateLabel, its 15 labels pinned literally; friends
  against the old rule written out in the test: Sam 🐢 kept, Nina 🗽 →
  🐳, Frank 🌽 → 🍉, a stored 🐼 and a "Me" kept, and 300 trips of the
  Thanksgiving with 1 to 5 friends; a stored 🌽 kept with Mom & Dad on
  their old face; a second "Anjo"; v2 fixtures unchanged; Family board
  and pickup lanes; the update through the real Worker with no jump and
  no face twice; the PIA-150 stability test pins the Thanksgiving's 🌽
  💪 🗽 and its labels away from the family's airports still 🐻 for
  Anjo); test-app (every view on the organizer's and Mom's phones, no
  stand-in face, nothing sent; the update then ✎; the pulse states, a
  redraw 1.2 s in carrying on, the spent sentinel; BUILD = the newest
  scripts/messages/PIA-*.msg, the meta, ⚙'s tag); test-words (the trip
  view pulsing, spent by ⤒, pointed to again, in Chromium, words
  counted); test-viewport (P-face's 🌽 💪 🗽 tiles, ⚙'s #152 inside its
  header, 360/390/430 light and dark).

Decisions:
- When a preset face is already on a label of the trip, that label
  keeps it and the family member keeps the face they showed before: a
  face is never taken from anyone at read time.
- The family's faces come first: a friend whose old face is 🌽 or 🗽
  (2 of the 24 hashed faces) moves on to the next free face, as a
  taken face always did. Every other friend keeps exactly the face the
  previous build showed, even where the family's old stand-in (🦄 🍩 🐻)
  is now free, so nobody else's face changes on this build.
- A v1 "Me" at a family airport that already has a face (no real v1
  doc has one) takes the preset's face, by design: migrateLabel has
  always written it as that family member with the preset's face, so
  the read and the update agree.
- "Once a visit" is per page load and per trip; the pulse does not run
  under a sheet, so a sheet opened first never spends it unseen.
- Every PIA ticket bumps BUILD and the meta; test-app enforces it.

Owed (needs a person or a real device):
- On the owner's iPhone: open the live Thanksgiving and see 🌽 💪 🗽,
  ⤒ pulsing once, and ⚙ #152 after main updates.

Closes PIA-152.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g

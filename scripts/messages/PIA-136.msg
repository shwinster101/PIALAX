feat(v2): create and edit — the one create path

One way to start a trip, for family and friend groups alike, using
pictures instead of prose, from a firm plan or just a rough window; the
organizer can fix any trip later and add people who ask to join.
app.html is still linked from nowhere (no copied link names it either:
the organizer link is v1's own). pialax.html, pialax-mobile.html,
index.html, worker.js and scripts/trip-idea-builder.js are unchanged.

- scripts/trip-model.js (region, inlined byte-identical in app.html):
  - wordsIn / capTyped / fitTyped / firstWords: the strict rule's word
    count; a typed value under a word cap takes a change only while it
    stays within the cap or adds no word to a text that was already
    longer (nothing already there is ever cut); a paste past the cap
    keeps everything that was there and the inserted words that fit
    (cut, and where the caret goes); the first n words of a text.
  - cleanName (a typed name: ≤3 words, ≤37 units, a letter, never the
    v1 word Me) and keepName (a name already on a record, kept however
    many words it has).
  - joinLink / parseJoin: <base>?idea=<id>&add=<name>.<IATA>, the join
    request PIA-137's 🙋＋ will share; ids, a name and a code only.
  - legacyDraft: v1's read-only ?tripIdea= payload (base64 of the
    URI-encoded builder JSON, or the URI-encoded JSON) → a create draft
    with its place, plan or window, event day and nights; its note is
    cut visibly to its first 20 words within CAPTION_CHARS (cut: true).
    v1's prices and hub are never read; past days are not offered again.
  - groupPresets: the people of every trip this phone has seen, one
    group per set of names, newest first, my own row marked; never from
    an unmigrated v1 trip (its faces are read-time stand-ins nobody
    chose). freeFace: the first face nobody on the trip has, preferring
    one nobody on this phone has.
  - buildMembers (createRequest, updateRequest, organizerEdit): faces
    are unique within a trip. A member resent as its code alone is kept:
    its label goes back verbatim and its face is reserved first,
    wherever it sits in the list; a new or edited row whose face a kept
    member or an earlier row has gets a free one. So an edit never
    rewrites the face of someone it did not touch.
  - organizerEdit opts.owed {base, codes}: the airport-sync answers an
    earlier edit still owes (its update landed, they did not), rebuilt
    against the record as it is with base as the old side; they ride
    the next idea edit or go alone for an empty delta; none on a closed
    trip.
- app.html:
  - P-new-what → P-new-who → P-new-when, one sheet (data-popup names
    each step; a screen reader hears "New trip, step 2 of 3"):
    - It starts empty: the city picture, no name, no place, no dates,
      whatever trip is open behind it. The picture follows the name
      until one is tapped. The name field has the focus.
    - 📍 any 3 letters; an unknown code is marked 📍⚠ and never blocks;
      no place at all is fine. A code cut short stops ▶ (its field
      pulses) instead of being dropped. Up to 3 recent places as chips.
    - People: a pressed preset chip (👪 only on the token phone, with
      familyPreset for today and preset keys so Create re-resolves
      against the departure; else the group of the trip added last),
      🙋 from my profile (pialax_me_profile_v1, else my label on the
      trip added last). Rows are chips (face, name, code, ×N) with a
      🙋 toggle each ("Me: <name>" to a screen reader); a tap opens one
      row (face cycles to a free one, name, airport, ×N "Headcount N",
      🙋, 🗑). The first person on an empty sheet is 🙋; ▶ refuses
      without a 🙋 (the column pulses), without people, or with a typed
      name that is no name; a group's name from another trip is taken
      as it is. 1–8 people.
    - Word guard: the open row keeps its full value; chips shorten to
      2 words, then 1 (Mom&Dad), then codes hide, so the sheet stays
      ≤20 words (≤19 + Save when editing); above 6 people names start
      at 1 word.
    - Dates: [🗓 | ⟦⟧], holiday chips within 90 days, the one date grid
      (monthHeader / gridHTML, next month first, no day before today):
      tap start, tap end, 📌 then a day; or a window with 🌙− / 🌙+
      (never more nights than the window holds). Readout
      '11/6–11/9 · 3🌙 📌11/8'; ⚠ for a 📌 outside the dates.
    - Everything Create sends is on the sheet: a v1 link's (or a kept
      draft's) note is a 📝 chip on the first and last steps (📝⚠ when
      v1's longer text was cut), opening P-note over the draft to read,
      change or clear it (‹ takes it back); Create posts exactly that.
    - Create: POST /idea through createRequest; the edit key saved
      (saveKey, v1 format), pialax_idea_me_v1 = the 🙋 code, the
      profile set, the trip listed, flown in and opened as its
      organizer at 💡 (only over the create sheet: a sheet opened while
      it was in flight stays, and a toast says it landed). Failure:
      ⚠ ↻ on Create and the draft kept in pialax_ui_v1.draft (read back
      field by field; a passed start date comes back as no dates); ＋
      reopens it at the dates (🗑 discards it). A sheet closed before
      Create stores nothing, but the toast's ↩ (5s) brings it back.
  - Typing: a keyboard still composing a word (IME, predictive text)
    is left alone until the composition ends; the field being typed in
    is never rebuilt (the picture and the chips are patched in place);
    a paste past a cap keeps what fits, with ⚠ beside the field.
  - P-edit (✎ in the trip view's nav; organizer, not a v1 doc):
    - 🏷📍 name, picture and destination (disabled while 🔒 or closed).
    - 👥 people (not on a closed trip): codes kept; 🗑 on someone who
      answered shows 🗑⚠ first; clearing a member's name never removes
      them; my 🙋 follows the Save (setMe, profile).
    - A Save sends only what it changed: each row remembers how it was
      (o, name0); an untouched member goes as its code alone, a changed
      one with only its changed fields, then members added meanwhile on
      another device (as they are), then the new people. A name already
      on the trip is never refused (only typed ones are held to 3
      words).
    - More than 8 (a join request on a full trip, or someone added
      meanwhile so the fresh record would pass 8): the editor shows
      everyone (rebuilt over the fresh record, this edit's changes
      kept) with ⚠ 9/8, and Save waits until someone is removed.
    - 📝 P-note: the caption, ≤20 words, saved when the sheet closes
      (⌄, ‹, Esc, Back, scrim); a longer v1 text opens at its first 20
      words with ⚠ and needs a second ⌄; a failed save opens P-error
      and the text comes back in P-note.
    - 🔑 copies the organizer link (dirBase, byte for byte v1's
      tripIdeaOrganizerLink; never shared), then "🔑⚠ Your devices
      only" (P-link when the clipboard refuses).
    - 🗑 → P-drop: the trip dimmed, a red-outlined 🗑 Drop and a
      primary Keep (back to P-edit). Drop closes into the list, the
      trip goes to the shelf, and the toast offers ↩ (restoreDelta, as
      the shelf's ↩: back to 🔒 or paid as it stood). On a dropped
      trip the tile is ↩.
    - Saves go through organizerWrite (a fresh GET first, then
      organizerEdit: the update, then the airport-sync answers for a
      new destination or a member's new home airport). The primary
      shows ◷ while it is out, ⚠ ↻ if it fails; the sheets close on
      success. When the update lands and an answer does not, the
      answers still owed are kept (OWED, in memory) and the people
      editor becomes the trip as it now is, so ↻ sends just those
      answers (nobody added twice); they also ride this phone's next
      idea edit of the trip.
  - Router: ?idea=<id>&add=<name>.<IATA> opens the trip and, on a
    phone holding its key, the people editor with that person added
    and open (once the trip is read; nobody is added twice; whatever
    ?tab= the link also names); elsewhere the trip only. ?tripIdea=
    opens the filled create sheet; a broken one opens P-error "Link
    broken". Both params leave the address bar.
  - The trip view's nav: ✎ (organizer) and 📣 (the guest /i/<id> link
    through the share sheet, URL only; records the plan hash in
    pialax_shared_at_v1[id]); 📝 on the hero when there is a caption.
  - The toast can carry ↩ (5s). LEGEND gains edit, me, unknown and
    noairport. Enter in a person's name moves to the airport; in the
    airport it closes the row.
- Tests:
  - test-trip-model (+28): typed caps, pastes and first words, names
    typed and kept, join links round-tripped through URLSearchParams,
    v1 idea links (dates, windows, past days, a 40-word and an
    849-character note cut visibly, junk), groups (never from a v1
    trip) and free faces, unique faces in create and update with kept
    members in either order, an airport-only change, the owed answer
    of a partly landed edit rebuilt and sent through the real Worker,
    an airport change and a removal through the real Worker.
  - test-app (+83), against the real Worker: create from the token
    phone (empty sheet with a dated trip open behind it, 👪 with 🙋,
    the exact POST, the key in v1's format, my 🙋 and profile, the trip
    opened at 💡); the Diwali job tap by tap, each step's state checked
    before the next; a fresh phone (no preset, 🙋 by default, unique
    faces, refusals) whose Create fails (⚠ ↻, draft kept, ＋ reopens
    it, the retry creates once); off-shape and past-dated drafts
    cleaned; 🗑 discard; ZZQ, no place, a window, no dates; presets by
    role; 👪 on a phone whose today is 8/1 (8/20 JAX, 9/10 LGA, an
    undated idea JAX); every edit (a new place resyncing answered
    members, 🔒 keeping the place, a long existing name, an airport-only
    change, a member changed and one added meanwhile, a 4-word name
    elsewhere on the trip and in a group, captions with the two-tap
    replace and a failed save, drop / Keep / ↩, a dropped trip's
    P-edit); an update that lands while its answer drops, then ↻ (for
    people and for a new place); 9 of 8 from a join on a full trip and
    from someone added meanwhile; the organizer link on a phone with a
    share sheet (never called; no URL carries #k=, &t=, the key or the
    token) and byte for byte v1's; join requests on the organizer's, a
    guest's and a repeat phone, and with ?tab=map; v1's ?tripIdea=
    built by v1's own encoder, its note shown, edited and cleared, and
    a broken one; the word guard with 8 long names; screen-reader
    names; ↩ for a closed unsent create; a Create landing after another
    sheet opened.
  - test-trust (+1): A1 now also taps every control that hands a link
    out (🔑, ⚙'s organizer and devices links, 📣, the list share) on a
    phone with a recording share sheet: no share payload carries the
    token, an edit key, #k=, #ks= or &t=.
  - test-words: the create path on all six phones at 360/390/430 (the
    longest name and person it accepts, an unknown code, a row open,
    dates, a window), with long-press in its sheets; P-edit and every
    part on the organizer's trip and the 8-member trip with long names
    at every width; tap counts with real clicks (Diwali 13 on the token
    phone, Tahoe 19 on a phone with no token and no trips); a failed
    Create and its kept draft; drop and ↩; a join request, and one on
    the full trip (⚠ 9/8); a v1 link with a long note (📝⚠ and its
    P-note); typing that turns the picture without rebuilding the
    field, a composing keyboard left alone, a 20-word paste kept at 12
    with ⚠; 🔑 on a phone with a share sheet; a long v1 caption. The
    writing phones use the real worker.js in-process. Busiest popup 20
    words, busiest screen 10.
  - test-viewport: every create and edit sheet at 360/390/430, light
    and dark, plus the join request at ⚠ 9/8 and a v1 link's note.
  - Mutation check (scratch copies): each of the audit's four missed
    regressions (the organizer link sent to a share sheet, an
    airport-only change not saved, the 👪 preset not re-resolved, a
    kept draft restoring past days) now fails a suite, as do the
    fix-pass regressions (owed answers not retried, untouched members
    resent in full, kept faces rewritten, the v1 note hidden again, 9
    of 8 not shown, a join ignored on ?tab=map or on a full trip).

Decisions:
- "Never prefilled from hidden state": the sheet's name, place and
  dates always start empty. The people start from a preset that is
  visible as a pressed chip, and 🙋 from my own profile; a kept draft
  is only ever the one a failed Create left, reopened where it failed
  and discardable. Everything Create sends is visible on the sheet (a
  v1 link's note included).
- A sheet closed by mistake gets a ↩ toast rather than a stored draft:
  ＋ keeps starting empty, and only a failed Create is ever restored.
- The first person added to an EMPTY sheet is 🙋; adding someone to a
  preset group never makes them me (the sheet asks instead).
- A name typed past its cap stops; a paste keeps what fits, with ⚠. A
  name already on a record (a member, a group) is kept as it is. An
  existing longer trip name (v1, another client) opens whole and counts
  as a trip name (free) in the edit sheet; typing can shorten it but
  not add a word.
- Kept labels win over face uniqueness: two kept members that already
  share a face (another client) both keep it; only rows this edit
  builds are given free faces.
- The destination is also fixed on a closed trip: a new place would
  need answers resent, which a closed trip refuses.
- Owed answers live in memory only: the retry is the sheet's ⚠ ↻ (or
  the next edit of the trip from this phone); a reload loses them,
  as a reload loses any unsent sheet.
- The devices link (#ks=) stays on app.html until the cutover: v1 does
  not read #ks= and would leave the keys in its address bar. It is
  copied only, to the organizer's own devices.
- Member codes stay deterministic (memberCode without rand): app.html
  uses no Math.random, and codes need to be unique, not secret.

Owed (needs a person, not done here): the comprehension checks and
icon checks listed in CLAUDE.md before cutover; IME and predictive-text
behaviour on a real Android and iOS keyboard (the browser suite
simulates composition events only).

Not covered here: the joiner's side of a join request (P-face 🙋＋,
PIA-137), P-dates and the date pill (PIA-138), P-migrate (PIA-146),
and a P-day ＋ that carries its start date (Calendar, PIA-144: openCreate
already takes it).

Refs PIA-136.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g

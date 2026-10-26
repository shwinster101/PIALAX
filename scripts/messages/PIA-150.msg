feat(faces): show Ashwin as 💪 in the family preset

- The 👪 preset gives Ashwin 💪 (Mom & Dad 🌽, Anjo 🗽). New family
  trips, the legacy-trip review and the history import inherit it.
- Append 💪 to FACES. Name-derived faces keep hashing over the first
  24 (FACE_RING), so no face already shown or picked moves.
- Saved trips keep their stored faces; ✎ can switch one to 💪.
- Tests: preset, review and import faces; FACES order, freeFace and
  hashed faces unchanged; the ✎ switch through the Worker; 💪 fits
  its 44px tile at 360/390/430, light and dark.

Closes PIA-150.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g

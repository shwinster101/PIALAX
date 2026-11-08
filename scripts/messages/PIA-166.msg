feat(clarity): four labels where a first look found only glyphs; ⚙ #166

A first look on a phone found the setup clear but too terse: step 2
showed only ＋ and a greyed ▶, nothing said dates are optional, and an
empty Map and Calendar repeated the Trips picture. The owner chose to
add the words (over a glyph-only fix), each only in its empty state.

- whoHTML: with nobody added, the ＋ reads "＋ Add travelers" (aria-
  label the same; .tool.lbl at the 17px token); once someone is in, ＋
  alone ("Add person"), as before.
- whenHTML: "Dates optional" (.hintl) until a day is picked; an idea may
  start undated and Create already works without dates.
- ghostCard: an empty Map says "Your trip on a map", an empty Calendar
  "Your trip’s days" (GHOST_LINE), above ＋ New trip; Trips unchanged.
- .hintl: one quiet line, secondary ink, the 15px token, weight 400.
- scripts/fixtures/census-159.json: exactly the 48 states the labels
  reach are re-baselined (6 Map, 6 Calendar, 3 step 2, 33 step 3), each
  verified to gain only its label; every other state byte-identical.
- CLAUDE.md and PIALAX_HQ.md (PIA-166 amendment) record the words.
- Tests: test-app checks each label in its empty state and gone once
  there is content, the Trips picture without a line, and the CSS.
- Fix pass, test-words: under PIA-165's lanes PIA-139 tapped ⋯ More's 📅
  before the sheet was drawn and threw; jsClick (85 uses) now waits for
  its target (30s ceiling only bounds the wait), and that flow waits for
  its sheet's close and one write instead of a fixed 500ms.
- BUILD and <meta name="pialax-build"> 166.

The word caps hold (14 + 5 on a screen, 20 in a popup). No tap,
storage format, link, Worker or model change.

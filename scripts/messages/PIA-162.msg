feat(clarity): P-rides heads the drive window with 🚗, not ⏰; ⚙ #162

The owner, reading P town's P-rides on an iPhone, asked what the large
times on each card meant and whether they were flight times. They were
the drive window (leave home → home again), "🛬 ⏰ 12:05–5:05 PM", the
hero of the card, while the flight time sat smaller after the code.

- runHTML: the range is headed by 🚗 (data-k drive, "Drive"), the glyph
  the card already uses for "🚗 0:45" between stops; the long press (the
  arithmetic) is unchanged. ⏰ keeps one meaning, Leave home (the drive
  primary, the card's slot).
- Tried and dropped: 🛬 / 🛫 on each leg. The 11/30 joined run's tail
  needed 189px of 172px at 320×17 and wrapped at 375px from a 21px root,
  breaking PIA-161's one-line legs; a width media rule cannot follow
  iOS Text Size, so the legs keep #161's markup.
- Tests: test-app pins 🚗 in the three ranges and no lvhome in P-rides;
  test-viewport reads the header group and Drive's line from 🚗.
- BUILD and <meta name="pialax-build"> 162.

No word, tap, layout, storage format, link, marker, Worker or model
change; trip-model.js and its inlined region are untouched.

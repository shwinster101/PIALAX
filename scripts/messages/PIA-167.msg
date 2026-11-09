feat(setup): a closed setup keeps its draft; Next, Dates and Flexible named; ⚙ #167

A second look on a phone found ⌄ read as "collapse" but threw the create
form away (reopening ＋ started blank unless the few-second ↩ toast was
caught), and the ▶ and 🗓 | ⟦⟧ glyphs still needed a guess. The owner
chose words for the controls.

- closeSheet → keepCreate: a create sheet closed before Create keeps
  what is in it, with its step, in pialax_ui_v1.draft (draftOut gains
  step; where a failed Create's draft already lived). A draft emptied
  again goes; a fresh empty sheet touches nothing. The unsent-create ↩
  toast is retired.
- keptDraft reopens at the kept step (1 or 2; otherwise 3, as a failed
  Create's draft and any draft from before this build).
- keptBtn: 🗑 in the header of every step of a kept draft; the first tap
  arms it (🗑?, "Tap again", .sh-hd .ib.arm in the danger colour, no
  motion), the second throws the draft away.
- whatHTML / whoHTML: ▶ reads "Next ▶" (aria-label "Next", the arrow
  aria-hidden). whenHTML: the modes read "🗓 Dates" and "⟦⟧ Flexible"
  (tg2 wordy; aria-labels the same; group "Dates or flexible").
- scripts/fixtures/census-159.json: exactly the 240 states the labels
  reach are re-baselined (each gained only its label) and the dates
  step's long-press label renamed "Flex window" → "Flexible"; every
  other state byte-identical.
- CLAUDE.md (the words list; pialax_ui_v1.draft) and PIALAX_HQ.md
  (PIA-167 amendment).
- Tests: test-app (kept draft and its step, emptied, fresh close, 🗑's
  two taps, the labels); test-words' Diwali pins for steps 2 and 3.
- Fix pass, test-words: under PIA-165's lanes a walk read its cards while a
  trip was still being read (a dimmed stub last in the list), walked them in
  another order and long-pressed another trip's P-person; 14 census states
  went unmeasured. The walk now waits until no stub card is left.
- Fix pass, test-viewport: a pass clicked a sheet's 🎫 before it was drawn;
  its click-by-eval helpers (tapJs, tapF) now wait for their target, and
  the passes run two at a
  time (viewport still ends before test-words; the gate's time unchanged).
- BUILD and <meta name="pialax-build"> 167.

The caps hold (step 1 17, step 2 19, step 3 8 of 20). No link, Worker
or model change.

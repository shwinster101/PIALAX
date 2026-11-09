fix(calendar): the trip band sits under the day numbers; ⚙ #168

On an iPhone in dark mode the Calendar's plan outline ran along the top
of each day cell, through the numerals, and a trip crossing weeks drew a
doubled line where one week's bottom edge met the next week's top.

- #screen .dc .plan { top: 31px; bottom: 0; }: on the Calendar screen the
  plan is a band under the numerals and the presence caps (24-30px),
  holding the head-count badges; the pickers in a sheet keep the outline.
- test-app pins the rule against the caps' position.
- BUILD and <meta name="pialax-build"> 168.

No word, tap, storage, link, Worker or model change.

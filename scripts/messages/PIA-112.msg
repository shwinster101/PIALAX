feat(rsvp): calmer RSVP screen; organizer fixes plan dates with ✎

- Header:
  - one title row + stage pill, then one plan line: the organizer sees
    "Plan <weekday range> · ≈ $total" with ✎, guests the loose "Late
    Nov · pick your own dates";
  - notes are clamped to two lines (tap to expand);
  - the title/result card and "Fare not priced yet" are removed.
- tripIdeaCountsLine: one status line ("All 3 in" / "2 in · 1 waiting"
  + "N of M booked"). It replaces the counts + "travelers confirmed" +
  booked lines (_tripIdeaBookedLineHtml removed).
- The answers list folds into <details data-fold="list"> "Answers &
  notes (N)"; it opens itself while answering for someone.
- Nudge / Hold / Organizer link / decision panel fold into
  <details data-fold="org"> "Organizer". Open state survives redraws.
- ✎ plan dates: the same range calendar (#trip-idea-plan-cal-wrap). Save
  posts /idea/update {edit_key, idea: tripIdeaPlanDatesPayload(doc,
  from, to)}, which moves idea.dates and recommendation.departure/return
  and keeps everything else. No Worker change.
- Tests: unit status line + payload; viewport folds start collapsed, a ✎
  edit saves and survives a reload; existing checks follow the new
  layout.

Closes PIA-112.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8

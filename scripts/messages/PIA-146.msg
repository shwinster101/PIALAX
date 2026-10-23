feat(migration): review legacy trips and import family history

- Add organizer-only legacy review using the shared model and existing IDs.
- Preserve event pins, answers, personal airports, member codes and bookings;
  protect booked inherited dates before moving a plan and remove chosen estimates.
- Import reviewed v1 history explicitly; preserve source storage, absent returns
  and postponed status, with source-only backups and no paid requests.
- Journal partial writes, reconcile lost update replies, reuse known records and
  lock across tabs. Block blind retries when a creation response is unknown.
- Require migration browser jobs in preflight; keep root entry URLs unchanged.

Closes PIA-146.

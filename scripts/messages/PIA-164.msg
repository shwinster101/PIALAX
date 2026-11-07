feat(short): links shared with the family start with pialax.pages.dev; ⚙ #164

pialax.pages.dev went live on 2026-11-07 (Pages project pialax, Git-
connected to main, output short). Checked from outside: the page is byte-
identical to short/index.html, the four _headers are sent, /i/<id> answers
302 to the Worker's /i/<id>, every other path (app.html, worker.js,
CLAUDE.md, scripts/...) is the forwarder, and a preview fetcher following
/i/<id> gets the Worker's preview page. So the links people share can now
use the short address, as the owner chose with the short link.

- trip-model.js (and its inlined region in app.html, byte for byte):
  SHORT_URL = 'https://pialax.pages.dev', exported; guestLink writes
  SHORT_URL/i/<id>[#m=<code>] when the Worker is the built-in WORKER_URL
  (short/_redirects sends it there: its chat preview, then the app);
  another valid Worker's link stays its own; validation is unchanged.
  Every share, nudge, Remind, Ask and calendar event takes it.
- app.html: shareBase() = SHORT_URL + '/', used for a shared list
  (listLink) and an invitation sent or forwarded (joinLink). The
  organizer's own-devices links (organizerLink #k=, devicesLink #ks=)
  keep the app's folder, so a key or token never passes another site.
- Links already sent keep working (Worker /i/ and the GitHub address are
  unchanged); each phone keeps its storage, since the short address hands
  everything to the same app.
- Tests: model, gflinks, app and word jobs expect the short guest, list
  and invitation links (the golden .ics guest link is one 61-octet line;
  folding stays pinned by its own checks); test-app pins SHORT_URL,
  shareBase, another Worker's own link and _redirects naming WORKER_URL;
  the cutover suite follows /i/<id>#m=<code> through short/_redirects
  (read from the file), the Worker's /i/ (DASH_URL read from worker.js)
  and the app's folder to the trip, #m= kept then consumed, nothing
  granted.
- CLAUDE.md and SHORT_LINK.md record the live project and the link rule.
- BUILD and <meta name="pialax-build"> 164.

No word, tap, storage format, Worker or model-logic change.

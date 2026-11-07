feat(short): a short address that forwards to the app (Cloudflare Pages, short/); ⚙ #163

The owner asked to port the Pages site to Cloudflare or simplify its
address. The app cannot move origin safely now: each phone's list, edit
keys, token and "me" live in shwinster101.github.io's storage, and the
Worker answers that origin alone (ALLOWED_ORIGINS; /i/<id> → DASH_URL).
A new origin would show every phone an empty list until a storage
handoff and a budgeted Worker deploy, 13 days before Thanksgiving. So
the short address only forwards; the app keeps its one home.

- short/index.html: the whole Cloudflare Pages site of the short address
  (pialax.pages.dev once the project exists). It forwards in one hop to
  the fixed https://shwinster101.github.io/PIALAX/app.html with the
  encoded query and hash unchanged (location.replace, the entry pages'
  pattern; no query value is ever a destination); no-referrer; the
  entry pages' CSP; a no-script Open link to the same fixed home.
- short/_headers: that CSP plus frame-ancestors 'none', Referrer-Policy
  no-referrer, X-Robots-Tag noindex, nosniff, for every path.
- short/_redirects: /i/:id → the Worker's /i/:id (302), so a short guest
  link keeps its chat preview; the app does not build one yet.
- SHORT_LINK.md: the dashboard click-path (Connect to Git, project
  pialax, no build command, output directory short) and the agent path
  (a Pages:Edit token, wrangler pages project create / deploy), checks
  and undo.
- preflight.sh scans short/index.html with the entry pages (relative
  names in its file steps). CLAUDE.md records short/ and why the app
  never runs on a second origin.
- Tests: test-app pins short/'s three files, the fixed destination, no
  asset, storage or network call, the headers and the one redirect to
  the app's own Worker; the cutover suite serves short/ on a second
  origin and answers the app's home with app.html: one hop with the
  query and hash unchanged at 360/390/1200 light and dark from / and a
  deeper path, an organizer link's key and token stored on the app's
  own origin and gone from the address, reload kept, Back past the
  forwarder, hostile values inert, the no-script fallback.
- BUILD and <meta name="pialax-build"> 163.

No app behaviour, word, storage format, link format, Worker or model
change; trip-model.js and its inlined region are untouched. Nothing is
deployed by this commit: the Cloudflare project is created by the owner
or an agent per SHORT_LINK.md after merge.

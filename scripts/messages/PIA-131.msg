fix(share): short ?w= share links instead of 900-character ?wl= blobs

"Share idea" copied a ~900-character link that wrapped into a wall of
text in family chats. Four causes:
- encoding: the payload went JSON -> encodeURIComponent -> base64 ->
  encodeURIComponent, so %XX tripled every symbol before base64 and
  escaping inflated it again;
- payload: every empty or derived field was sent (_added, title,
  routeTxt, gf, notes:"", reminders:[], blockers:[]), and a starter
  trip resent its own 150-330 character seed notes;
- path: the link pointed at the sender's page, so a desktop recipient
  got pialax-mobile.html;
- layout: the URL was glued to "Open this idea in PIALAX:" and the
  dates were ISO strings.

- pialax.html + pialax-mobile.html (identical):
  - wlShareEncode / wlShareDecode: base64url of UTF-8 JSON with short
    keys.
    - An added trip drops the fields the receiver rebuilds; any other
      field passes through untouched.
    - A starter-trip override sends only fields that differ from
      WATCHLIST_SEED.
    - Decode rejects garbage, a wrong version and anything over 32 KB.
    - It ignores __proto__ keys and still feeds sanitizeWatchlistItem.
  - _wlShareUrl: links to the site root, so index.html picks phone vs
    desktop.
  - loadWatchlist reads ?w= first, then legacy ?wl=. ?w= lands on the
    Watchlist like ?wl=.
  - shareWatchlistTrip:
    - a trip linked to a shared trip sends tripIdeaInviteUrl;
    - the message has a route line, tripIdeaDateRange / tripIdeaDay
      dates, and the URL alone on the last line.
  - sharePlan uses the same link.
- scripts/test-core.js:
  - round-trips for family, solo, readable-destination and custom
    trips, plus starter-trip diffs;
  - size limit: the ORD trip link is 208 characters or fewer, was 900;
  - message format, invite-link reuse, ?w= load, and hostile input;
  - desktop/mobile parity for the new functions.

The ORD trip's link: 900 -> 208 characters. An untouched starter trip:
51.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dug5vjZj6GAEUycz3AfeN6

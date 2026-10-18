feat(v2): one link builder for Google Flights, Explore, Flighty and calendars

Every hand-off is now computed from the /idea record on each render, so
a date, airport or party-size change can never leave a stale or wrong
link. Nothing in the app uses it yet; v1 is untouched.

- scripts/trip-model.js, inside the inlined region:
  - flightLink, the one Google Flights builder. tripModel calls it for
    every searchable traveler.
    - A round trip is one round-trip tfs search (trip=1).
    - Open-jaw is ONE multi-city link (trip=3), plus inHref / outHref,
      the two one-way searches PIALAX prices (trip=2).
    - Origin sets, adults = headcount, economy, no airline or nonstop
      filter.
    - Each URL is decoded back and compared with its plan (gfSame). A
      throw, or a link that doesn't carry the plan exactly (filters
      included), counts as an encoder failure.
    - Only then does a search fall back to q= (gfQueryUrl), in the
      grammar verified live:
        'Flights from AAA to BBB on D1 through D2[ for N adults]'
        'Flights from AAA to BBB on D one way[ for N adults]'
      It uses one code per side (the home code), never metro codes.
      Open-jaw becomes two one-way q= links (split); the primary is
      then labelled trip=2, since it opens a one-way search.
  - No link for hosts, local origins, people who are out, or missing,
    reversed or started ranges. legWhy now says 'noairport' (not
    'local') for someone with no home airport and no override, and
    the model says 'nolink' when the encoder fails and q= refuses the
    codes (the leg is still priced).
  - handoffs(model, code, ctx), the one entry point for a face:
    - gf, gfIn, gfOut, and why whenever there is no gf;
    - explore: GF Explore, unprefilled, only for an idea without a
      place that is not over or dropped (no prefilled form was
      verified live);
    - flighty: https://www.flighty.com/ (v1's hand-off), only once that
      traveler is booked;
    - calendar: my own face only;
    - share: the guest /i/<id> link; nudge: /i/<id>#m=<code>, only for
      someone else who is waiting or maybe (P-person's rule), never a
      host or someone who is in or out.
    - A dropped trip offers no Google Flights link, Explore, calendar
      event or nudge: only share, and Flighty for a booked traveler.
  - calendarAdd: one all-day event with an exclusive end (d2 + 1), as a
    Google TEMPLATE link and RFC 5545 .ics text (folded at 75 octets).
    - Dates: my own travel days when I have a usable pair, else the
      plan (hosts, people who are out, a phone with no face, and a
      reversed range, as in the prototype's sheet).
    - Tentative ('? ' title, STATUS:TENTATIVE) until the days are set:
      decision chosen (a legacy 🔒 reads as proposed), my own 🎫 on my
      own days, or a derived 🏁 Done.
    - No event for an undated idea, days that are over, or a dropped
      trip.
    - Text values escape backslash, ';', ',' and every line break (a
      lone CR too); other control characters are dropped. The UID is
      built from the checked id and member code only. The file name
      falls back to the destination code, then 'trip'.
  - guestLink builds from the trip id and a member code only, on a bare
    https *.workers.dev origin (v1's check; default = v1 PROXY_URL). A
    blank override keeps the built-in Worker, as v1 does (PIA-119).
    The edit key and token never reach any calendar or share link, and
    a Worker URL with a path, query or fragment builds no link.
  - Every hand-off carries target=_blank rel="noopener noreferrer";
    handoffAttrs is the one place that writes the <a> attributes.
  - gfDecode also reports per-leg stops / airlines and the top-level
    field list, so tests can prove no filter is ever sent.
- scripts/test-gflinks.js + .sh (new, 93 checks, in preflight), named
  AC1–AC9, one per acceptance criterion.
  - E1, E2, E3, E6 and E7 reproduced byte for byte, by the encoder and
    by flightLink.
  - The v2 sample links pinned as golden strings, from the fixtures:
    - origin sets;
    - multi-city with sets;
    - the one-way pair;
    - the 2-adult PIA+ORD set;
    - Ashwin's link on the unmigrated legacy doc;
    - the +1 link.
  - Every produced link is decoded and checked for legs, dates, adults
    and trip type, and against the priced one-way keys.
  - handoffs() itself on an open-jaw traveler (multi-city primary, the
    one-ways the right way round), and an open-jaw party of 2 (2
    adults on all three links).
  - The four live-verified q= links reproduced byte for byte. The
    encoder is swapped (throwing / wrong / empty / right legs plus
    filters) in a standalone copy of the region to prove the q=
    fallback stays in the verified grammar.
  - Golden Google Calendar and .ics events; fold boundaries (75/75/64
    ASCII, 72/73/25 emoji); a lone CR, NUL, BEL or ESC in a title or
    city; a malformed id in the UID; hosts with own days; booked and
    derived-Done tentative rules; dropped trips; blank Worker
    overrides; nudge targets; file names.
  - A leak scan on organizer phones (edit key and token in ctx,
    edit_hash on docs) proves calendar and share links carry only the
    guest /i/<id> link.
  - fetch, http(s) and net are stubbed to fail; today = 2026-10-17.
  - Checked against 19 deliberate mutations of the builder (filters
    added, adults fixed, inclusive end, key in details, Flighty for
    all, q= always, same tab, …) and 26 more from the PIA-133 audit
    and review (primary = inbound, one-ways swapped or 1 adult, host
    own dates, Explore with a place, the old escaping, folding and
    tentative rules, the no-filter clause removed, …): each one fails
    the suite.
- scripts/preflight.sh: test-gflinks.sh added to the suites.

For the spec author to confirm (each is pinned by a test, so a change
is one line plus its check):
- Booked days count as set: my own 🎫, or 🏁 Done, makes the event
  confirmed even before 🔒.
- My own reversed range gets the plan's days, as the prototype's sheet
  does, rather than no event.
- The nudge link follows P-person (waiting or maybe). The model's
  nudgeTargets (dotted faces) stay waiting only.
- A dropped trip keeps Flighty for a booked traveler.

Owed before ship (needs a person): open each of these once by hand in
Google Flights and record pass or fail per link on PIA-133. Check that
the route, every airport in each set, the dates, the trip type (round
trip, one way or multi-city) and the passenger count match the label.
An automated open from the build environment was refused by Google
(302 to google.com/sorry, a CAPTCHA), so it cannot be done here. If a
link misparses, fix legPlan or the encoder and re-pin it.
- tgAshwin, multi-city: LAX+BUR+LGB+SNA+ONT → PIA 11/20, ORD → LA set
  11/29, 1 adult (also Ashwin's link on the unmigrated legacy doc):
  https://www.google.com/travel/flights/search?tfs=CBwQAhpCEgoyMDI2LTExLTIwagcIARIDTEFYagcIARIDQlVSagcIARIDTEdCagcIARIDU05BagcIARIDT05UcgcIARIDUElBGkISCjIwMjYtMTEtMjlqBwgBEgNPUkRyBwgBEgNMQVhyBwgBEgNCVVJyBwgBEgNMR0JyBwgBEgNTTkFyBwgBEgNPTlRAAUgBcAGCAQsI____________AZgBAw&hl=en&gl=us&curr=USD
- tgAshIn, one way: LA set → PIA 11/20:
  https://www.google.com/travel/flights/search?tfs=CBwQAhpCEgoyMDI2LTExLTIwagcIARIDTEFYagcIARIDQlVSagcIARIDTEdCagcIARIDU05BagcIARIDT05UcgcIARIDUElBQAFIAXABggELCP___________wGYAQI&hl=en&gl=us&curr=USD
- tgAshOut, one way: ORD → LA set 11/29:
  https://www.google.com/travel/flights/search?tfs=CBwQAhpCEgoyMDI2LTExLTI5agcIARIDT1JEcgcIARIDTEFYcgcIARIDQlVScgcIARIDTEdCcgcIARIDU05BcgcIARIDT05UQAFIAXABggELCP___________wGYAQI&hl=en&gl=us&curr=USD
- tgAnjo, multi-city: LGA+JFK+EWR → PIA 11/24, ORD → NY set 11/29:
  https://www.google.com/travel/flights/search?tfs=CBwQAhowEgoyMDI2LTExLTI0agcIARIDTEdBagcIARIDSkZLagcIARIDRVdScgcIARIDUElBGjASCjIwMjYtMTEtMjlqBwgBEgNPUkRyBwgBEgNMR0FyBwgBEgNKRktyBwgBEgNFV1JAAUgBcAGCAQsI____________AZgBAw&hl=en&gl=us&curr=USD
- dwAsh, round trip: LA set ⇄ RDU 11/06–11/09:
  https://www.google.com/travel/flights/search?tfs=CBwQAhpCEgoyMDI2LTExLTA2agcIARIDTEFYagcIARIDQlVSagcIARIDTEdCagcIARIDU05BagcIARIDT05UcgcIARIDUkRVGkISCjIwMjYtMTEtMDlqBwgBEgNSRFVyBwgBEgNMQVhyBwgBEgNCVVJyBwgBEgNMR0JyBwgBEgNTTkFyBwgBEgNPTlRAAUgBcAGCAQsI____________AZgBAQ&hl=en&gl=us&curr=USD
- dwAshP1, round trip after one +1: LA set ⇄ RDU 11/07–11/10:
  https://www.google.com/travel/flights/search?tfs=CBwQAhpCEgoyMDI2LTExLTA3agcIARIDTEFYagcIARIDQlVSagcIARIDTEdCagcIARIDU05BagcIARIDT05UcgcIARIDUkRVGkISCjIwMjYtMTEtMTBqBwgBEgNSRFVyBwgBEgNMQVhyBwgBEgNCVVJyBwgBEgNMR0JyBwgBEgNTTkFyBwgBEgNPTlRAAUgBcAGCAQsI____________AZgBAQ&hl=en&gl=us&curr=USD
- dwMD, round trip: PIA+ORD ⇄ RDU 11/06–11/09, 2 adults:
  https://www.google.com/travel/flights/search?tfs=CBwQAhonEgoyMDI2LTExLTA2agcIARIDUElBagcIARIDT1JEcgcIARIDUkRVGicSCjIwMjYtMTEtMDlqBwgBEgNSRFVyBwgBEgNQSUFyBwgBEgNPUkRAAUABSAFwAYIBCwj___________8BmAEB&hl=en&gl=us&curr=USD
- dwAnjo, round trip: LGA+JFK+EWR ⇄ RDU 11/06–11/09:
  https://www.google.com/travel/flights/search?tfs=CBwQAhowEgoyMDI2LTExLTA2agcIARIDTEdBagcIARIDSkZLagcIARIDRVdScgcIARIDUkRVGjASCjIwMjYtMTEtMDlqBwgBEgNSRFVyBwgBEgNMR0FyBwgBEgNKRktyBwgBEgNFV1JAAUgBcAGCAQsI____________AZgBAQ&hl=en&gl=us&curr=USD

Explore stays unprefilled: no prefilled Explore form was checked live,
so none ships.

Refs PIA-133. It closes once the eight opens above are recorded.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g

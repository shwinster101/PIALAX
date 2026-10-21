feat(v2): Map with verified assets, pickups and destination previews

PIA-143 fills the Map beside the existing Trips/Family and booking flows.
app.html remains unlinked. v1, index.html, the Worker and cutover are unchanged.

- Draw the selected trip's destination/alternate pins, origin faces and routes
  from its model. Nearby faces have separate 44px targets with leaders to their
  actual origins. A persistent face roster includes hosts and unknown airports.
  Known international airports use the world view. Airport controls, people,
  totals and pickup lanes remain HTML when map assets cannot load.
- d3 7.9.0 and topojson 3.0.2 use v1's exact cdnjs URLs and SHA-512 SRI hashes,
  crossorigin anonymous and async loading. CSP allows their exact paths only.
  world-atlas@2.0.2/countries-110m.json is fetched without credentials or a token;
  SHA-256 2516c915867c7baf18ddec727aec46c315541a07cfb3d79a6559b05d5e94eee8
  is checked before JSON parsing/topojson conversion. Missing libraries, failed
  data, absent WebCrypto or a bad digest leave the functional fallback.
- Every pickup chip opens P-day map mode with that airport's names and times.
  Recorded booked times are visible to everyone; cached times are marked with
  approximately and available only on the organizer's token phone. An overnight
  offer never appears as landing on its outbound day. PickupPair compares fresh
  cached offers for two different travelers landing at the same airport/day
  within two hours, using complete traveler prices including open-jaw returns.
  No paid request or shared flight selection occurs when comparing a pair.
- The alternate airport pin opens a person picker and arrival/departure choices.
  Self or organizer may change an answered, unbooked traveler's hub airport
  through the existing respond path. Others and booked travelers are read-only.
  Shared answers drive the links, price keys, routes and pickup lanes together.
- Another destination opens P-candidate: type a code, Preview (free), then the
  exact search cost. Preview derives a new model from the current shared record;
  priceTrip/priceRows remain the only total rule. No synthetic fares. An unknown
  code is accepted but marked; incomplete or stale totals cannot be applied.
  Use is explicit and checks fresh dates, travelers, keys and fares before writing
  through organizerWrite. An edit on another phone invalidates an old preview.
- Destination searches enter runSearch with only that preview's allowed keys.
  The shared 4/tap, 8/visit, daily and monthly limits, cost-growth recheck,
  /account capability wait, token gate, v1 fare mirror and shared fare cache stay
  in that one path. Eligibility and allowed keys are rechecked between requests.
  Guests (even token-only phones), organizers without a token, legacy, locked,
  closed, past, undated and already-booked trips cannot spend on another city.
  Undated ideas choose dates first; booked trips use the existing edit flow.
- The SRI gate checks the app's exact map-data version/hash offline and verifies
  the live data hash alongside the existing live script hashes. Tests refuse a
  floating data version or changed digest. Worker overrides remain limited to
  the Worker's CSP peers; the data URL is never accepted as a Worker.
- test-map-browser.js exercises real pinned assets at 360/390/430, both themes,
  every individual library/data/digest failure, guest privacy, unknown and world
  airports, pickup details, shared airport writes, destination search/apply,
  caps, reset labels and a stale preview. Shared writes run through the real
  in-process Worker; paid replies are fixtures, never a live paid service.
  PIALAX_MAP_ASSETS may supply previously downloaded, hash-checked asset bytes.
  The word suite may use PIALAX_TEST_APP_URL for local HTTP when file URLs are
  blocked by browser policy; its normal default and all assertions remain.

Validation:
- scripts/preflight.sh: GO, including live script/data hashes and all Node suites.
  Its default browser lookup skipped the word runner in this environment; the
  word suite was also run explicitly in real Chromium over local HTTP.
- Full word suite: all 146 checks; 366 screens and 3539 popups; maximum 10/20.
- v2 viewport block: all 16 checks, including 109 states at each width/theme,
  short date sheets and 19 person sheets per width/theme. Original assertions,
  local HTTP transport. v1 viewport cases were not rerun for this v2-only ticket.
- Model: 379 checks. App: 498 checks. Dedicated map browser: 110 checks.
- No v1 shipping file changed; app.html is still linked from nowhere.

PIA-144 owns Calendar; PIA-145 owns the full real-browser job-flow/preflight suite
and final purpose/six-asks review. Existing manual party-fare and pre-cutover
device/comprehension checks remain outstanding as previously recorded.

Refs PIA-143.

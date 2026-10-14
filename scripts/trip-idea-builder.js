// Trip Idea Builder (shared by pialax.html and pialax-mobile.html).
// This file is mirrored into the two no-build HTML entry points at release time.
var TRIP_IDEA_BUILDER_VERSION = 'trip-idea-v1';
var TRIP_IDEA_HUBS = [
  { key:'LAX', label:'LAX', airports:['LAX'], description:'West Coast base' },
  { key:'PIA_ORD', label:'PIA / ORD', airports:['PIA','ORD'], description:'Central Illinois pivot' },
  { key:'LGA_JFK', label:'LGA / JFK', airports:['LGA','JFK'], description:'New York base' }
];
var TRIP_IDEA_DESTINATIONS = [
  { city:'Raleigh-Durham', aliases:['RDU','Cary','Raleigh','Durham'], airport:'RDU', alternatives:['RDU'], saved:false },
  { city:'New York', aliases:['NYC','JFK','LGA'], airport:'JFK', alternatives:['LGA','JFK'], saved:false },
  { city:'Los Angeles', aliases:['LA','LAX'], airport:'LAX', alternatives:['LAX'], saved:false },
  { city:'Peoria', aliases:['PIA'], airport:'PIA', alternatives:['PIA'], saved:false },
  { city:'Chicago', aliases:['ORD','O Hare','O’Hare'], airport:'ORD', alternatives:['ORD','PIA'], saved:false },
  { city:'Jacksonville', aliases:['JAX'], airport:'JAX', alternatives:['JAX'], saved:false },
  { city:'London', aliases:['LHR'], airport:'LHR', alternatives:['LHR'], saved:false },
  { city:'Memphis', aliases:['MEM'], airport:'MEM', alternatives:['MEM'], saved:false }
];

function createTripIdeaBuilderState(seed) {
  var s = seed && typeof seed === 'object' ? seed : {};
  return {
    mode: s.mode === 'city-first' || s.mode === 'spontaneous' ? s.mode : 'dates-first',
    baseHub: ['LAX','PIA_ORD','LGA_JFK','all'].indexOf(s.baseHub) >= 0 ? s.baseHub : 'all',
    destination: Object.assign({city:'', airport:'', alternatives:[]}, s.destination || {}),
    dates: Object.assign({departure:'', return:'', searchStart:'', searchEnd:'', flexibilityDays:0, flexibilityMode:'independent'}, s.dates || {}),
    constraints: Object.assign({tripLength:null, nonstopPreferred:false, eventDate:'', savedCityPriority:true}, s.constraints || {}),
    recommendation: s.recommendation || null,
    priceStatus: ['live','cached','estimated','unavailable'].indexOf(s.priceStatus) >= 0 ? s.priceStatus : 'estimated'
  };
}

function normalizeTripIdeaBuilderState(value) {
  var s = createTripIdeaBuilderState(value);
  s.destination.city = String(s.destination.city || '').trim();
  s.destination.airport = String(s.destination.airport || '').trim().toUpperCase();
  s.destination.alternatives = Array.isArray(s.destination.alternatives) ?
    s.destination.alternatives.map(function(a){ return String(a || '').trim().toUpperCase(); }).filter(Boolean) : [];
  ['departure','return','searchStart','searchEnd'].forEach(function(k){
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.dates[k] || ''))) s.dates[k] = '';
  });
  s.dates.flexibilityDays = Math.max(0, Math.min(2, Number(s.dates.flexibilityDays) || 0));
  s.dates.flexibilityMode = s.dates.flexibilityMode === 'independent' ? 'independent' : 'independent';
  s.dates.autoWindow = !!s.dates.autoWindow;
  s.constraints.tripLength = s.constraints.tripLength == null || s.constraints.tripLength === '' ? null : Math.max(1, Math.min(30, Number(s.constraints.tripLength) || 1));
  s.constraints.nonstopPreferred = !!s.constraints.nonstopPreferred;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.constraints.eventDate || ''))) s.constraints.eventDate = '';
  s.constraints.savedCityPriority = s.constraints.savedCityPriority !== false;
  return s;
}

function _tripIdeaDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return null;
  var d = new Date(String(iso) + 'T12:00:00');
  return isNaN(d.getTime()) ? null : d;
}
function _tripIdeaISO(d) {
  return d && !isNaN(d.getTime()) ? d.toISOString().slice(0,10) : '';
}
function _tripIdeaAddDays(iso, days) {
  var d = _tripIdeaDate(iso); if (!d) return '';
  d.setDate(d.getDate() + Number(days || 0)); return _tripIdeaISO(d);
}
function _tripIdeaDays(a, b) {
  var x = _tripIdeaDate(a), y = _tripIdeaDate(b);
  return x && y ? Math.round((y - x) / 86400000) : null;
}

function resolveTripIdeaCity(query, savedCities) {
  var q = String(query || '').trim().toLowerCase();
  var saved = Array.isArray(savedCities) ? savedCities : [];
  var savedNames = saved.map(function(c){ return String(c && (c.city || c.name || c.dest) || '').toLowerCase(); });
  var candidates = TRIP_IDEA_DESTINATIONS.map(function(c){
    var hay = [c.city,c.airport].concat(c.aliases || []).join(' ').toLowerCase();
    var exact = q && (c.city.toLowerCase() === q || c.airport.toLowerCase() === q || (c.aliases || []).some(function(a){ return String(a).toLowerCase() === q; }));
    var match = !q || exact || hay.indexOf(q) >= 0;
    if (!match) return null;
    var clone = Object.assign({}, c);
    if (/^[A-Z]{3}$/.test(q.toUpperCase()) && (clone.alternatives || []).indexOf(q.toUpperCase()) >= 0) {
      clone.airport = q.toUpperCase();
      clone.alternatives = (clone.alternatives || []).filter(function(a){ return a !== clone.airport; }).concat([c.airport]).filter(function(a, i, arr){ return arr.indexOf(a) === i; });
    }
    clone.saved = c.saved === true || savedNames.indexOf(c.city.toLowerCase()) >= 0 || savedNames.indexOf(c.airport.toLowerCase()) >= 0;
    clone.rank = (exact ? 0 : 1) + (clone.saved ? -2 : 0);
    return clone;
  }).filter(Boolean).sort(function(a,b){ return a.rank - b.rank || a.city.localeCompare(b.city); });
  return candidates[0] || null;
}

function generateTripIdeaDatePairs(state) {
  var s = normalizeTripIdeaBuilderState(state), out = [], dep = s.dates.departure, ret = s.dates.return;
  var margin = s.dates.flexibilityDays;
  if (dep && ret) {
    if (!margin) return [{departure:dep, return:ret, tripLength:_tripIdeaDays(dep,ret), changedIndependently:false}];
    for (var di=-margin; di<=margin; di++) for (var ri=-margin; ri<=margin; ri++) {
      var d = _tripIdeaAddDays(dep, di), r = _tripIdeaAddDays(ret, ri), len = _tripIdeaDays(d,r);
      if (len != null && len >= 1) out.push({departure:d, return:r, tripLength:len, changedIndependently:di !== 0 || ri !== 0, departureOffset:di, returnOffset:ri});
    }
    return out;
  }
  var start = s.dates.searchStart || dep, end = s.dates.searchEnd || ret;
  if (start && end) {
    var wanted = Number(s.constraints.tripLength) || 3, cursor = _tripIdeaDate(start), finish = _tripIdeaDate(end);
    while (cursor && finish && cursor <= finish) {
      // searchEnd is the latest DEPARTURE (UI: "Latest departure"), not the latest return.
      var d0 = _tripIdeaISO(cursor), r0 = _tripIdeaAddDays(d0, wanted);
      out.push({departure:d0, return:r0, tripLength:wanted, changedIndependently:false});
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return out;
}

function tripIdeaScore(result, context) {
  var r = result || {}, c = context || {}, fare = r.totalFare == null || r.totalFare === '' ? NaN : Number(r.totalFare);
  var fareScore = isFinite(fare) ? Math.max(0, Math.min(100, 100 - fare / 12)) : 0; // no fare → 0, not 100
  var convenienceScore = Math.max(0, Math.min(100, (r.nonstop ? 92 : 64) - Math.max(0, Number(r.durationHours || 0) - 5) * 2));
  var wanted = Number(c.tripLength);
  var lengthFit = wanted ? Math.max(0, 100 - Math.abs(Number(r.tripLength || 0) - wanted) * 18) : 82;
  var proximity = c.departure && r.departure ? Math.max(0, 100 - Math.abs(_tripIdeaDays(c.departure, r.departure) || 0) * 8) : 75;
  var dateFit = Math.round((lengthFit * 0.65) + (proximity * 0.35));
  var savedBonus = r.savedCity ? 0 : 0; // visible preference badge, never a hidden fare distortion
  var score = Math.round(fareScore * 0.55 + convenienceScore * 0.25 + dateFit * 0.20 + savedBonus);
  return {score:score, fareScore:Math.round(fareScore), convenienceScore:Math.round(convenienceScore), dateFit:dateFit, weights:{fare:55,convenience:25,dateFit:20}};
}

function rankTripIdeaRecommendations(results, context) {
  return (Array.isArray(results) ? results : []).map(function(r){
    var copy = Object.assign({}, r); copy.scoreBreakdown = tripIdeaScore(copy, context); return copy;
  }).sort(function(a,b){ return b.scoreBreakdown.score - a.scoreBreakdown.score || _tripIdeaStatusRank(a) - _tripIdeaStatusRank(b) || Number(a.totalFare || Infinity) - Number(b.totalFare || Infinity); });
}
// Equal score: a real (cached/live) fare outranks a sample estimate.
function _tripIdeaStatusRank(r) {
  var s = r && r.priceStatus; return s === 'live' || s === 'cached' || s === 'host' ? 0 : s === 'estimated' ? 1 : 2;
}

function buildTripIdeaRecommendations(state, destinations) {
  var s = normalizeTripIdeaBuilderState(state), selected = s.destination && s.destination.airport;
  var cities = Array.isArray(destinations) && destinations.length ? destinations : TRIP_IDEA_DESTINATIONS;
  var match = selected ? cities.filter(function(c){ return c.airport === selected || (c.alternatives || []).indexOf(selected) >= 0; }) : cities.slice();
  if (!match.length) match = cities.slice();
  var pairs = generateTripIdeaDatePairs(s);
  if (!pairs.length) pairs = [{departure:s.dates.departure || s.dates.searchStart || '', return:s.dates.return || s.dates.searchEnd || '', tripLength:Number(s.constraints.tripLength) || null, changedIndependently:false}];
  var hubs = s.baseHub === 'all' ? TRIP_IDEA_HUBS : TRIP_IDEA_HUBS.filter(function(h){ return h.key === s.baseHub; });
  var out = [];
  match.slice(0, 8).forEach(function(city, ci){ hubs.forEach(function(hub, hi){ _tripIdeaSamplePairs(pairs, 8).forEach(function(pair, pi){
    var same = hub.airports.indexOf(city.airport) >= 0;
    var price = same ? {perTicket:0, from:city.airport, to:city.airport, status:'host', lastVerified:null} : tripIdeaFareFor(hub, city, pair.departure, pair.return);
    var headcount = tripIdeaHubHeadcount(hub, pair.departure);
    var total = price.perTicket == null ? null : price.perTicket * headcount;
    out.push({id:'trip-'+ci+'-'+hi+'-'+pi, city:city.city, airport:city.airport, alternatives:(city.alternatives || []).slice(), hub:hub.key, departure:pair.departure, return:pair.return, tripLength:pair.tripLength, changedIndependently:pair.changedIndependently, totalFare:total, perTicketFare:price.perTicket, headcount:headcount, fareFrom:price.from, fareTo:price.to, lastVerified:price.lastVerified, nonstop:!same && (city.airport === 'RDU' || city.airport === 'LAX'), durationHours:same ? 0 : 4.5 + hi, savedCity:!!city.saved, priceStatus:same ? 'host' : price.status});
  }); }); });
  return rankTripIdeaRecommendations(out, s).slice(0, 12);
}

// PIA-070: price a (hub → city) pair from fares the dashboard already holds.
// Read-only — never calls fetchFlights, so it costs zero SerpAPI quota.
// Order per origin/dest: dated 24h cache (_flightCache) → S.prices when the
// dates equal the planner's → sample table (getMock). Any cached fare beats
// any estimate; within a tier the cheapest wins. Returns a per-ticket fare.
// S.depDate/S.retDate are Date objects (or null); builder dates are ISO strings.
function _tripIdeaIsoOf(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return typeof fmtISO === 'function' ? fmtISO(v) : _tripIdeaISO(v);
}
function _tripIdeaPickFare(p, ret) {
  var v = p ? (ret ? (p.rt || p.ow) : p.ow) : 0;
  return Number(v) > 0 ? Number(v) : 0;
}
function tripIdeaFareFor(hub, city, dep, ret) {
  var origins = (hub && hub.airports) || [], dests = [city && city.airport].concat((city && city.alternatives) || []).filter(Boolean);
  var cache = typeof _flightCache === 'object' && _flightCache ? _flightCache : {};
  var ttl = typeof FLIGHT_CACHE_TTL_MS === 'number' ? FLIGHT_CACHE_TTL_MS : 0, now = Date.now();
  var planner = typeof S === 'object' && S && dep && _tripIdeaIsoOf(S.depDate) === dep && _tripIdeaIsoOf(S.retDate) === (ret || '') ? (S.prices || {}) : null;
  var best = {cached:null, estimated:null};
  origins.forEach(function(o){ dests.forEach(function(d){
    if (o === d) return;
    var fare = 0, status = 'cached', verified = null;
    var hit = typeof _cacheKey === 'function' ? cache[_cacheKey(o, d, dep, ret)] : null;
    if (hit && hit.data && now - hit.ts < ttl) { fare = _tripIdeaPickFare(hit.data, ret); verified = hit.data.lastVerified || null; }
    if (!fare && planner) { var p = planner[o + '-' + d]; if (p && (p.live || p.cached) && !p.rateLimited) { fare = _tripIdeaPickFare(p, ret); verified = p.lastVerified || null; } }
    if (!fare && typeof getMock === 'function') { fare = _tripIdeaPickFare(getMock(o, d), ret); status = 'estimated'; verified = null; }
    if (!fare) return;
    var cur = best[status];
    if (!cur || fare < cur.perTicket) best[status] = {perTicket:fare, from:o, to:d, status:status, lastVerified:verified};
  }); });
  return best.cached || best.estimated || {perTicket:null, from:origins[0] || '', to:dests[0] || '', status:'unavailable', lastVerified:null};
}
// Travelers who fly from this hub on the departure date (PIA_ORD = Mom & Dad = 2).
function tripIdeaHubHeadcount(hub, dep) {
  var airports = (hub && hub.airports) || [], n = 0;
  var members = typeof familyForDate === 'function' ? familyForDate(dep || undefined) : [];
  (members || []).forEach(function(code){ if (airports.indexOf(code) >= 0) n += typeof headcountFor === 'function' ? (Number(headcountFor(code)) || 1) : 1; });
  return n || 1;
}

function serializeTripIdeaSharePayload(builder, recommendation, options) {
  var o = options || {}, s = normalizeTripIdeaBuilderState(builder);
  return {version:TRIP_IDEA_BUILDER_VERSION, builder:s, recommendation:recommendation || s.recommendation || null, fareStatus:o.fareStatus || s.priceStatus || 'estimated', timestamp:o.timestamp || new Date().toISOString(), notes:String(o.notes || ''), eventContext:String(o.eventContext || s.constraints.eventDate || '')};
}
function encodeTripIdeaSharePayload(payload) {
  var text = encodeURIComponent(JSON.stringify(payload));
  try { return btoa(text); } catch(e) { return text; }
}
function restoreTripIdeaSharePayload(value) {
  if (!value) return null;
  if (typeof value === 'object') return value.version ? value : null;
  var text = String(value);
  try { text = decodeURIComponent(atob(text)); } catch(e) { try { text = decodeURIComponent(text); } catch(ignore) {} }
  try { var payload = JSON.parse(text); return payload && (payload.version === TRIP_IDEA_BUILDER_VERSION || payload.version === 'trip-idea-v0') ? payload : null; } catch(e2) { return null; }
}
function tripIdeaFlexibilityLabel(state) {
  var s = normalizeTripIdeaBuilderState(state), d = s.dates, n = d.flexibilityDays;
  if (!d.departure && !d.return) {
    if (d.searchStart && d.searchEnd) return (d.autoWindow ? 'Next ' + (_tripIdeaDays(d.searchStart, d.searchEnd) || 0) + ' days' : 'Flexible window ' + d.searchStart + ' → ' + d.searchEnd) + (s.constraints.tripLength ? ' · ' + s.constraints.tripLength + ' nights' : '');
    if (!n) return 'Any dates';
  }
  return n ? 'Independent dates ±' + n + ' day' + (n === 1 ? '' : 's') : 'Exact dates';
}
// Spread a long date list evenly (always keeps first and last) so a 30–90 day
// window is scored across its whole span, not just its first `max` departures.
function _tripIdeaSamplePairs(pairs, max) {
  if (pairs.length <= max) return pairs.slice();
  var out = [], step = (pairs.length - 1) / (max - 1);
  for (var i = 0; i < max; i++) out.push(pairs[Math.round(i * step)]);
  return out;
}
var TRIP_IDEA_DEFAULT_WINDOW_DAYS = 90, TRIP_IDEA_OPEN_END_WINDOW_DAYS = 30;
// PIA-068: one place that turns raw form state + date mode into a searchable
// state, or an error the user can act on. Pure (today is injectable) for tests.
function resolveTripIdeaSearchDates(state, mode, todayIso) {
  var s = normalizeTripIdeaBuilderState(state), d = s.dates, today = todayIso || _tripIdeaISO(new Date(new Date().setHours(12,0,0,0))); // local date, not UTC
  var hasDestination = !!(s.destination.city || s.destination.airport);
  d.autoWindow = false;
  if (mode === 'window') { d.departure = ''; d.return = ''; d.flexibilityDays = 0; }
  else { d.searchStart = ''; d.searchEnd = ''; s.constraints.tripLength = null; }
  if (!hasDestination && !d.departure && !d.return && !d.searchStart && !d.searchEnd) return {state:s, mode:mode, error:'Add a destination or date to start'};
  if (mode === 'window') {
    if (!d.searchStart && d.searchEnd) d.searchStart = today < d.searchEnd ? today : d.searchEnd;
    if (d.searchStart && !d.searchEnd) d.searchEnd = _tripIdeaAddDays(d.searchStart, TRIP_IDEA_OPEN_END_WINDOW_DAYS);
    if (d.searchEnd < d.searchStart) return {state:s, mode:mode, error:'Latest departure must be on or after earliest departure'};
    return {state:s, mode:mode, error:''};
  }
  if (d.departure && d.return && d.return <= d.departure) return {state:s, mode:mode, error:'Return must be after departure'};
  if (!d.departure && d.return) return {state:s, mode:mode, error:'Add a departure date'};
  if (!d.departure && !d.return) {
    // Destination only: search the next 90 days instead of returning dateless results.
    d.searchStart = today; d.searchEnd = _tripIdeaAddDays(today, TRIP_IDEA_DEFAULT_WINDOW_DAYS);
    d.autoWindow = true;
    return {state:s, mode:'window', error:''};
  }
  return {state:s, mode:mode, error:''};
}
function createTripIdeaWatchlistItem(builder, recommendation, options) {
  var s = normalizeTripIdeaBuilderState(builder), r = recommendation || s.recommendation || {};
  var stamp = (options && options.timestamp) || new Date().toISOString();
  return {id:'builder-'+Date.now().toString(36), _added:true, mode:'solo', title:(r.city || s.destination.city || 'Trip idea') + ' · Trip idea', routeTxt:(r.hub || s.baseHub) + ' → ' + (r.airport || s.destination.airport || 'TBD'), origin:(r.hub === 'LAX' ? 'LAX' : 'PIA'), dest:r.airport || s.destination.airport || 'TBD', dep:r.departure || s.dates.departure || null, ret:r.return || s.dates.return || null, stage:'watching', notes:String(options && options.notes || ''), reminders:[], nextAction:'Refresh pricing before booking', blockers:[], builderMetadata:{version:TRIP_IDEA_BUILDER_VERSION,mode:s.mode,baseHub:s.baseHub,destination:s.destination,dates:s.dates,constraints:s.constraints,recommendation:r,priceStatus:s.priceStatus,recommendationTimestamp:stamp,wishlistDestinationPriority:!!r.savedCity,eventContext:s.constraints.eventDate || ''}, gf:{from:r.fareFrom || (r.hub === 'PIA_ORD' ? 'PIA' : r.hub === 'LGA_JFK' ? 'LGA' : r.hub) || 'LAX',to:r.fareTo || r.airport || ''}};
}

var tripIdeaBuilder = createTripIdeaBuilderState();
var _tripIdeaBuilderStage = 'inputs', _tripIdeaBuilderOpen = false, _tripIdeaBuilderReadOnly = false, _tripIdeaBuilderLaunch = null, _tripIdeaDateMode = 'specific';

function _tripIdeaEl(id){ return document.getElementById(id); }
function _tripIdeaEsc(v){ return typeof esc === 'function' ? esc(v) : String(v == null ? '' : v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function _tripIdeaSavedCities(){
  var rows = (typeof WATCHLIST !== 'undefined' && Array.isArray(WATCHLIST)) ? WATCHLIST : [];
  return rows.filter(function(t){ return t && t.stage !== 'completed'; }).map(function(t){ return {city:t.title || t.dest, dest:t.dest}; });
}
function _tripIdeaShow(){ _tripIdeaBuilderOpen=true; var bd=_tripIdeaEl('trip-idea-builder-bd'), sheet=_tripIdeaEl('trip-idea-builder'); if(bd) bd.hidden=false; if(sheet){sheet.hidden=false;sheet.setAttribute('aria-hidden','false');} document.body.classList.add('trip-idea-open'); }
function _tripIdeaHide(){ _tripIdeaBuilderOpen=false; var bd=_tripIdeaEl('trip-idea-builder-bd'), sheet=_tripIdeaEl('trip-idea-builder'); if(bd) bd.hidden=true; if(sheet){sheet.hidden=true;sheet.setAttribute('aria-hidden','true');} document.body.classList.remove('trip-idea-open'); }
function tripIdeaBuilderOpen(mode){
  _tripIdeaBuilderLaunch = document.activeElement;
  _tripIdeaBuilderReadOnly = false; _tripIdeaBuilderStage = 'inputs';
  tripIdeaBuilder = createTripIdeaBuilderState(tripIdeaBuilder);
  _tripIdeaDateMode = !tripIdeaBuilder.dates.departure && !tripIdeaBuilder.dates.return && (tripIdeaBuilder.dates.searchStart || tripIdeaBuilder.dates.searchEnd) ? 'window' : 'specific';
  if (mode === 'dates-first' || mode === 'city-first' || mode === 'spontaneous') tripIdeaBuilder.mode = mode;
  _tripIdeaShow(); renderTripIdeaBuilder();
  setTimeout(function(){ var x=_tripIdeaEl('trip-idea-city'); if(x) x.focus(); },0);
}
function tripIdeaBuilderClose(){ if(_tripIdeaGuest) return; _tripIdeaHide(); if(_tripIdeaBuilderLaunch && _tripIdeaBuilderLaunch.focus) _tripIdeaBuilderLaunch.focus(); }
// PIA-099: family members who open an RSVP link get the RSVP as their whole
// page (body.idea-guest: opaque backdrop, no close) — not the organizer's
// dashboard. "Open full PIALAX" is the deliberate way out.
var _tripIdeaGuest = false;
function tripIdeaSetGuest(on){ _tripIdeaGuest = !!on; if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('idea-guest', _tripIdeaGuest); }
function tripIdeaLeaveGuest(){ tripIdeaSetGuest(false); tripIdeaBuilderClose(); }
function _tripIdeaSetStage(stage){ _tripIdeaBuilderStage=stage; renderTripIdeaBuilder(); }
function _tripIdeaCitySuggestions(){
  return TRIP_IDEA_DESTINATIONS.map(function(c){ return '<option value="'+_tripIdeaEsc(c.city)+'">'+_tripIdeaEsc(c.airport)+' · '+_tripIdeaEsc(c.city)+'</option>'; }).join('');
}
function _tripIdeaInputsHtml(){
  var s=tripIdeaBuilder, d=s.dates, c=s.constraints;
  return '<div class="trip-idea-plan">' +
    '<label class="trip-idea-destination">Where to? <span>Optional</span><input id="trip-idea-city" list="trip-idea-city-list" value="'+_tripIdeaEsc(s.destination.city || s.destination.airport)+'" placeholder="City or airport, e.g. Cary or RDU"><datalist id="trip-idea-city-list">'+_tripIdeaCitySuggestions()+'</datalist><small>Saved cities and nearby airports are ranked first.</small></label>' +
    '<div class="trip-idea-date-heading"><strong>When?</strong><span>Choose dates or a flexible window</span></div>' +
    '<div class="trip-idea-date-mode" role="group" aria-label="Date search type"><button type="button" data-trip-date-mode="specific" aria-pressed="'+(_tripIdeaDateMode==='specific'?'true':'false')+'"'+(_tripIdeaDateMode==='specific'?' class="selected"':'')+'>I know my dates</button><button type="button" data-trip-date-mode="window" aria-pressed="'+(_tripIdeaDateMode==='window'?'true':'false')+'"'+(_tripIdeaDateMode==='window'?' class="selected"':'')+'>I’m flexible</button></div>' +
    '<div class="trip-idea-date-fields"'+(_tripIdeaDateMode==='specific'?'':' hidden')+'><label>Departure<input id="trip-idea-departure" type="date" value="'+d.departure+'"></label><label>Return<input id="trip-idea-return" type="date" value="'+d.return+'"></label><label class="trip-idea-margin">Dates can shift<select id="trip-idea-flex"><option value="0"'+(!d.flexibilityDays?' selected':'')+'>Exact dates</option><option value="1"'+(d.flexibilityDays===1?' selected':'')+'>±1 day</option><option value="2"'+(d.flexibilityDays===2?' selected':'')+'>±2 days</option></select></label></div>' +
    '<div class="trip-idea-date-fields"'+(_tripIdeaDateMode==='window'?'':' hidden')+'><label>Earliest departure<input id="trip-idea-search-start" type="date" value="'+d.searchStart+'"></label><label>Latest departure<input id="trip-idea-search-end" type="date" value="'+d.searchEnd+'"></label><label>Trip length <span>Optional</span><input id="trip-idea-length" type="number" min="1" max="30" value="'+(c.tripLength || '')+'" placeholder="Any length"></label></div>' +
    '<details class="trip-idea-options"><summary>More planning options <span>Optional</span></summary><div class="trip-idea-grid"><label>Starting hub <span>Optional</span><select id="trip-idea-hub"><option value="all">All base hubs</option>'+TRIP_IDEA_HUBS.map(function(h){return '<option value="'+h.key+'"'+(s.baseHub===h.key?' selected':'')+'>'+h.label+' · '+h.description+'</option>';}).join('')+'</select></label><label>Event date <span>Optional</span><input id="trip-idea-event" type="date" value="'+c.eventDate+'"></label><label class="trip-idea-check"><input id="trip-idea-nonstop" type="checkbox"'+(c.nonstopPreferred?' checked':'')+'> Prefer nonstop</label><label class="trip-idea-notes">Notes or family context <span>Optional</span><textarea id="trip-idea-notes" rows="2" placeholder="Anything else that matters"></textarea></label></div></details></div>';
}
function renderTripIdeaBuilder(){
  var body=_tripIdeaEl('trip-idea-builder-body'), title=_tripIdeaEl('trip-idea-builder-title'), step=_tripIdeaEl('trip-idea-builder-step'), primary=_tripIdeaEl('trip-idea-builder-primary');
  if(!body) return;
  if(title) title.textContent=_tripIdeaBuilderStage==='shared'?'Family trip idea':_tripIdeaBuilderReadOnly?'Shared trip idea':'Build a trip idea';
  if(step) step.textContent=_tripIdeaBuilderStage==='shared'?'Who’s in? Answer below':_tripIdeaBuilderReadOnly?'Read-only proposal':(_tripIdeaBuilderStage==='results'?'Compare options':'Choose a place or dates');
  if(primary) primary.textContent=_tripIdeaBuilderStage==='intent'?'Continue':(_tripIdeaBuilderStage==='inputs'?'Find recommendations':'Save selected idea');
  if(_tripIdeaBuilderStage==='intent'){
    body.innerHTML='<p class="trip-idea-lead">Start with what you know. PIALAX will keep exact inputs, flexible combinations, and estimated pricing separate.</p><div class="trip-idea-intents">'+
      [['dates-first','📅 Dates first','Choose dates; rank destination cities.'],['city-first','📍 City first','Choose a destination; find the best dates in the next 90 days.'],['spontaneous','✨ Feeling spontaneous','Choose a window; find a low-fare suitable destination.']].map(function(x){return '<button type="button" class="trip-idea-intent'+(tripIdeaBuilder.mode===x[0]?' selected':'')+'" id="trip-idea-intent-'+x[0]+'" data-trip-mode="'+x[0]+'"><strong>'+x[1]+'</strong><span>'+x[2]+'</span></button>';}).join('')+'</div>';
  } else if(_tripIdeaBuilderStage==='shared'){
    renderTripIdeaShared(body);
  } else if(_tripIdeaBuilderStage==='inputs'){
    body.innerHTML='<p class="trip-idea-lead">Start with what you know. Add a destination, dates, or both; everything else is optional.</p>'+_tripIdeaInputsHtml()+tripIdeaHistoryHtml();
    var notes=_tripIdeaEl('trip-idea-notes'); if(notes && tripIdeaBuilder._notes) notes.value=tripIdeaBuilder._notes;
  } else {
    renderTripIdeaResults(body);
  }
  if(_tripIdeaBuilderReadOnly && _tripIdeaBuilderStage==='intent') _tripIdeaBuilderStage='results';
  _tripIdeaWireStage();
  _tripIdeaSyncPrimary();
}
function _tripIdeaSyncPrimary(){
  var primary=_tripIdeaEl('trip-idea-builder-primary');
  if(!primary || _tripIdeaBuilderStage!=='inputs' || _tripIdeaBuilderReadOnly) return;
  var city=(_tripIdeaEl('trip-idea-city')||{}).value || '';
  var ids=_tripIdeaDateMode==='window'?['trip-idea-search-start','trip-idea-search-end']:['trip-idea-departure','trip-idea-return'];
  var hasDates=ids.some(function(id){return !!((_tripIdeaEl(id)||{}).value);});
  primary.disabled=!city.trim() && !hasDates;
  primary.textContent=primary.disabled?'Choose a destination or date':'Find recommendations';
}
function _tripIdeaReadInputs(){
  var city=(_tripIdeaEl('trip-idea-city')||{}).value || '', resolved=resolveTripIdeaCity(city,_tripIdeaSavedCities());
  tripIdeaBuilder.destination=resolved ? {city:resolved.city,airport:resolved.airport,alternatives:resolved.alternatives || []} : {city:city,airport:'',alternatives:[]};
  tripIdeaBuilder.baseHub=(_tripIdeaEl('trip-idea-hub')||{}).value || 'all';
  ['departure','return','searchStart','searchEnd'].forEach(function(k){ var e=_tripIdeaEl('trip-idea-'+k.replace(/[A-Z]/g,function(m){return '-'+m.toLowerCase();})); tripIdeaBuilder.dates[k]=e ? e.value : ''; });
  tripIdeaBuilder.dates.flexibilityDays=Number((_tripIdeaEl('trip-idea-flex')||{}).value || 0);
  tripIdeaBuilder.constraints.tripLength=Number((_tripIdeaEl('trip-idea-length')||{}).value || 0) || null;
  tripIdeaBuilder.constraints.eventDate=(_tripIdeaEl('trip-idea-event')||{}).value || '';
  tripIdeaBuilder.constraints.nonstopPreferred=!!((_tripIdeaEl('trip-idea-nonstop')||{}).checked);
  tripIdeaBuilder._notes=(_tripIdeaEl('trip-idea-notes')||{}).value || '';
  var notes=tripIdeaBuilder._notes; tripIdeaBuilder=normalizeTripIdeaBuilderState(tripIdeaBuilder); tripIdeaBuilder._notes=notes; // normalize drops _-prefixed fields
}
function tripIdeaRunSearch(){
  _tripIdeaReadInputs();
  var notes=tripIdeaBuilder._notes, resolved=resolveTripIdeaSearchDates(tripIdeaBuilder,_tripIdeaDateMode);
  if(resolved.error){showShareToast(resolved.error);return;}
  tripIdeaBuilder=resolved.state; tripIdeaBuilder._notes=notes; _tripIdeaDateMode=resolved.mode;
  var destinations=TRIP_IDEA_DESTINATIONS.map(function(c){var x=Object.assign({},c); var saved=_tripIdeaSavedCities().some(function(s){return String(s.city||'').toLowerCase().indexOf(c.city.toLowerCase())>=0 || String(s.dest||'').toUpperCase()===c.airport;}); x.saved=saved; return x;});
  var rows=buildTripIdeaRecommendations(tripIdeaBuilder,destinations);
  if(tripIdeaBuilder.mode==='spontaneous') rows=rows.sort(function(a,b){var fa=a.totalFare==null?Infinity:a.totalFare, fb=b.totalFare==null?Infinity:b.totalFare;return (fa===fb?0:fa<fb?-1:1) || b.scoreBreakdown.score-a.scoreBreakdown.score;});
  tripIdeaBuilder.recommendation=rows[0] || null; tripIdeaBuilder.priceStatus=rows.some(function(r){return r.priceStatus==='cached'||r.priceStatus==='live';})?'cached':'estimated'; tripIdeaBuilder._results=rows;
  _tripIdeaBuilderStage='results'; renderTripIdeaBuilder(); tripIdeaFocusMap(rows[0]);
}
function renderTripIdeaResults(target){
  var rows=tripIdeaBuilder._results || (tripIdeaBuilder.recommendation ? [tripIdeaBuilder.recommendation] : []);
  if(!rows.length){target.innerHTML='<div class="trip-idea-empty">No suitable combinations yet. Adjust the window or destination.</div>';return;}
  target.innerHTML='<div class="trip-idea-results-summary"><strong>'+rows.length+' recommendations</strong><span>'+_tripIdeaEsc(tripIdeaFlexibilityLabel(tripIdeaBuilder))+' · '+_tripIdeaEsc(tripIdeaPriceSummary(rows))+'</span></div><div class="trip-idea-results">'+rows.map(function(r,i){
    var selected=tripIdeaBuilder.recommendation && tripIdeaBuilder.recommendation.id===r.id;
    var status=r.priceStatus||'estimated', dates=(r.departure||'Dates TBD')+(r.return?' → '+r.return:'');
    var fareTxt=status==='host'?'Home base':r.totalFare?'$'+r.totalFare:'No fare yet';
    var perTxt=r.totalFare&&r.headcount>1?' · $'+r.perTicketFare+' × '+r.headcount:'';
    return '<button type="button" class="trip-idea-result'+(selected?' selected':'')+'" data-trip-result="'+_tripIdeaEsc(r.id)+'"><span class="trip-idea-result-head"><strong>'+_tripIdeaEsc(r.city)+'</strong><b>'+_tripIdeaEsc(fareTxt)+'</b></span><span>'+_tripIdeaEsc(r.fareFrom||r.hub)+' → '+_tripIdeaEsc(r.fareTo||r.airport)+_tripIdeaEsc(perTxt)+' · '+_tripIdeaEsc(dates)+'</span><span>'+_tripIdeaEsc((r.tripLength || '—')+' nights')+' · '+(r.changedIndependently?'dates changed independently · ':'')+_tripIdeaEsc(tripIdeaFlexibilityLabel(tripIdeaBuilder))+'</span><span class="trip-idea-badges">'+(r.savedCity?'<em>Saved city</em> ':'')+'<em>'+_tripIdeaEsc(status)+'</em><em>Score '+r.scoreBreakdown.score+'/100</em></span></button>';
  }).join('')+'</div><div id="trip-idea-map-summary" class="trip-idea-map-summary"></div><div class="trip-idea-result-actions"><button type="button" data-trip-action="refresh">↻ Refresh pricing</button><button type="button" data-trip-action="provider">Open provider handoff</button></div>';
  tripIdeaFocusMap(tripIdeaBuilder.recommendation);
}
// PIA-070: say how many rows carry real cached fares vs sample estimates.
function tripIdeaPriceSummary(rows){
  var list=Array.isArray(rows)?rows:[], real=list.filter(function(r){return r.priceStatus==='cached'||r.priceStatus==='live';}).length;
  var priced=list.filter(function(r){return r.priceStatus!=='host';}).length;
  if(!priced) return 'no quota used';
  return (real?real+' of '+priced+' from cached fares'+(real<priced?' · rest are sample estimates':''):'sample estimates — refresh the dashboard to cache real fares')+' · no quota used';
}
function tripIdeaFocusMap(r){
  if(!r) return;
  tripIdeaBuilder.recommendation=r;
  var el=_tripIdeaEl('trip-idea-map-summary'); if(el) el.innerHTML='<strong>Map focus</strong><span>'+_tripIdeaEsc(r.hub)+' → '+_tripIdeaEsc(r.airport)+' · '+_tripIdeaEsc(r.departure || 'dates TBD')+(r.return?' → '+_tripIdeaEsc(r.return):'')+'</span><small>Fare labels show only this selected route · '+_tripIdeaEsc(r.priceStatus || 'estimated')+'</small>';
  try { if(typeof selectMapHubFocus==='function' && (r.hub==='LAX' || r.hub==='PIA_ORD' || r.hub==='LGA_JFK')) selectMapHubFocus(r.hub); else if(typeof redrawMap==='function') redrawMap(); } catch(e) {}
}
var _tripIdeaSavedFor = {}; // PIA-076: recommendation id → watchlist item id (no duplicate cards)
function _tripIdeaSave(quiet){
  var r=tripIdeaBuilder.recommendation; if(!r){showShareToast('Select a recommendation first');return null;}
  var prevId=_tripIdeaSavedFor[r.id], prev=prevId && typeof watchlistItem==='function' ? watchlistItem(prevId) : null;
  if(prev){ if(!quiet) showShareToast('✓ Already in Trip Ideas'); return prev; }
  var item=createTripIdeaWatchlistItem(tripIdeaBuilder,r,{notes:tripIdeaBuilder._notes});
  if(typeof WATCHLIST!=='undefined'){ WATCHLIST.push(item); if(typeof saveWatchlist==='function') saveWatchlist(); if(typeof renderWatchlist==='function') renderWatchlist(); }
  if(r.id) _tripIdeaSavedFor[r.id]=item.id;
  if(!quiet) showShareToast('✓ Saved to Trip Ideas'); return item;
}
function _tripIdeaOpenShared(payload){
  if(!payload || !payload.builder) return;
  tripIdeaBuilder=createTripIdeaBuilderState(payload.builder); _tripIdeaDateMode=!tripIdeaBuilder.dates.departure && !tripIdeaBuilder.dates.return && (tripIdeaBuilder.dates.searchStart || tripIdeaBuilder.dates.searchEnd)?'window':'specific'; tripIdeaBuilder.recommendation=payload.recommendation || null; tripIdeaBuilder._results=payload.recommendation ? [payload.recommendation] : []; tripIdeaBuilder._notes=payload.notes || ''; _tripIdeaBuilderReadOnly=true; _tripIdeaBuilderStage='results'; _tripIdeaShow(); renderTripIdeaBuilder();
}
function _tripIdeaWireStage(){
  var sheet=_tripIdeaEl('trip-idea-builder'); if(!sheet) return;
  var resultsStage = _tripIdeaBuilderStage === 'results';
  var copyBtn = _tripIdeaEl('trip-idea-builder-copy'), editBtn = _tripIdeaEl('trip-idea-builder-edit'), shareBtn = _tripIdeaEl('trip-idea-builder-share'), saveBtn = _tripIdeaEl('trip-idea-builder-save');
  var calendarBtn = _tripIdeaEl('trip-idea-builder-calendar');
  if (copyBtn) copyBtn.hidden = !(resultsStage && _tripIdeaBuilderReadOnly);
  if (editBtn) { editBtn.hidden = !resultsStage; editBtn.textContent = _tripIdeaBuilderReadOnly ? 'Edit search' : 'Change search'; }
  if (shareBtn) shareBtn.hidden = !resultsStage;
  if (saveBtn) saveBtn.hidden = !resultsStage;
  if (calendarBtn) calendarBtn.hidden = !resultsStage;
  var primaryBtn = _tripIdeaEl('trip-idea-builder-primary'); if (primaryBtn) primaryBtn.hidden = _tripIdeaBuilderStage === 'shared' && !(_tripIdeaShared && _tripIdeaShared.formOpen);
  sheet.querySelectorAll('[data-idea-open]').forEach(function(b){b.onclick=function(){_tripIdeaOpenRemote(b.getAttribute('data-idea-open'));};});
  sheet.querySelectorAll('[data-idea-action]').forEach(function(b){b.onclick=function(){var a=b.getAttribute('data-idea-action');if(a==='respond')_tripIdeaRespond();else if(a==='nudge'&&_tripIdeaShared)tripIdeaNudge(_tripIdeaShared.id);else if(typeof tripIdeaDecisionAction==='function')tripIdeaDecisionAction(a);};});
  sheet.querySelectorAll('[data-trip-mode]').forEach(function(b){b.onclick=function(){tripIdeaBuilder.mode=b.getAttribute('data-trip-mode');renderTripIdeaBuilder();};});
  sheet.querySelectorAll('[data-trip-date-mode]').forEach(function(b){b.onclick=function(){_tripIdeaReadInputs();_tripIdeaDateMode=b.getAttribute('data-trip-date-mode')==='window'?'window':'specific';renderTripIdeaBuilder();};});
  ['trip-idea-city','trip-idea-departure','trip-idea-return','trip-idea-search-start','trip-idea-search-end'].forEach(function(id){var input=_tripIdeaEl(id);if(input){input.addEventListener('input',_tripIdeaSyncPrimary);input.addEventListener('change',_tripIdeaSyncPrimary);}});
  sheet.querySelectorAll('[data-trip-result]').forEach(function(b){b.onclick=function(){var id=b.getAttribute('data-trip-result'), r=(tripIdeaBuilder._results||[]).filter(function(x){return x.id===id;})[0]; if(r){tripIdeaBuilder.recommendation=r;renderTripIdeaResults(_tripIdeaEl('trip-idea-builder-body'));tripIdeaFocusMap(r);}};});
  sheet.querySelectorAll('[data-trip-action]').forEach(function(b){b.onclick=function(){var a=b.getAttribute('data-trip-action');if(a==='refresh'){tripIdeaRunSearch();}if(a==='provider'){var r=tripIdeaBuilder.recommendation||{};var u=typeof gflightsUrl==='function'?gflightsUrl(r.fareFrom||r.hub,r.fareTo||r.airport,r.departure,r.return):'https://www.google.com/travel/flights';window.open(u,'_blank','noopener');}};});
  var primary=_tripIdeaEl('trip-idea-builder-primary'); if(primary) primary.onclick=function(){if(_tripIdeaBuilderStage==='shared'){_tripIdeaRespond();return;}if(_tripIdeaBuilderReadOnly){_tripIdeaBuilderReadOnly=false;_tripIdeaBuilderStage='inputs';renderTripIdeaBuilder();return;}if(_tripIdeaBuilderStage==='intent'){_tripIdeaBuilderStage='inputs';renderTripIdeaBuilder();return;}if(_tripIdeaBuilderStage==='inputs'){tripIdeaRunSearch();return;} _tripIdeaSave();};
  var share=_tripIdeaEl('trip-idea-builder-share');if(share)share.onclick=_tripIdeaShare;
  var save=_tripIdeaEl('trip-idea-builder-save');if(save)save.onclick=_tripIdeaSave;
  if(calendarBtn) calendarBtn.onclick=function(){var item=_tripIdeaSave(true);if(item && typeof addWatchlistTripToCalendar==='function') addWatchlistTripToCalendar(item.id);};
  var edit=_tripIdeaEl('trip-idea-builder-edit');if(edit)edit.onclick=function(){_tripIdeaBuilderReadOnly=false;_tripIdeaBuilderStage='inputs';renderTripIdeaBuilder();};
  var copy=_tripIdeaEl('trip-idea-builder-copy');if(copy)copy.onclick=function(){_tripIdeaBuilderReadOnly=false;_tripIdeaBuilderStage='inputs';renderTripIdeaBuilder();};
  sheet.querySelectorAll('[data-trip-close]').forEach(function(b){b.onclick=tripIdeaBuilderClose;});
}
// ── PIA-072: shared trip ideas with RSVP (Worker /idea, KV-backed) ─────────
// "Share proposal" stores the idea on the Worker and copies a ?idea=<id> link.
// Anyone with the link picks who they are and answers in / maybe / out, with
// their airport and the dates that work. No IDEAS binding (501) or no proxy →
// fall back to the read-only ?tripIdea= link, exactly as before.
var TRIP_IDEA_KEYS_STORAGE = 'pialax_idea_keys_v1';
var TRIP_IDEA_RSVP_LABELS = {in:'✅ In', maybe:'🤔 Maybe', out:'❌ Out', pending:'⏳ No answer yet', hosting:'🏠 Hosting'};
var _tripIdeaShared = null; // {id, doc, editKey, error, picked, editing, answerFor, formOpen}
// PIA-100: which family member this device answers as, per idea — so the link
// opens straight to "your answer" next time instead of "Who are you?".
var TRIP_IDEA_ME_STORAGE = 'pialax_idea_me_v1';
function _tripIdeaMeMap() { try { return JSON.parse(localStorage.getItem(TRIP_IDEA_ME_STORAGE)) || {}; } catch (e) { return {}; } }
function tripIdeaMe(id) { return _tripIdeaMeMap()[id] || ''; }
function tripIdeaSetMe(id, code) {
  var m = _tripIdeaMeMap(); if (code) m[id] = code; else delete m[id];
  try { localStorage.setItem(TRIP_IDEA_ME_STORAGE, JSON.stringify(m)); } catch (e) {}
}
// The organizer is "Me" on their own device; the family sees their name.
var TRIP_IDEA_ORGANIZER_NAME = 'Ashwin';
function _tripIdeaName(label) { return _tripIdeaIsOrganizer(label) && !(_tripIdeaShared && _tripIdeaShared.editKey) ? TRIP_IDEA_ORGANIZER_NAME : label; }
function _tripIdeaOrganizerCode(doc) {
  var m = ((doc && doc.idea && doc.idea.members) || []).filter(function(x){ return _tripIdeaIsOrganizer(x.label); })[0];
  return m ? m.code : '';
}
// Who the answer form is for: someone the organizer is answering for, else the
// person picked on this device, else (organizer device) the organizer.
function tripIdeaWho(sh) {
  if (!sh) return '';
  return sh.answerFor || sh.picked || tripIdeaMe(sh.id) || (sh.editKey ? _tripIdeaOrganizerCode(sh.doc) : '');
}

function tripIdeaMembersFor(dep) {
  var codes = typeof familyForDate === 'function' ? familyForDate(dep || undefined) : [];
  return (codes || []).map(function(code){
    return {code:code, label:typeof labelFor === 'function' ? labelFor(code) : code, airport:code,
      headcount:typeof headcountFor === 'function' ? (Number(headcountFor(code)) || 1) : 1};
  });
}
// Whole-family estimate for one destination + dates: every hub's fare × its
// travelers (a hub that IS the destination is home base, $0). This — not the
// selected row's single-hub fare — is what gets compared with the actual total.
function tripIdeaFamilyEstimate(rec, datesByPerson) {
  var r = rec || {}, city = {airport:r.airport, alternatives:r.alternatives || []}, total = 0, missing = 0, cached = 0, priced = 0;
  var members = typeof familyForDate === 'function' ? familyForDate(r.departure || undefined) : [];
  var parts = TRIP_IDEA_HUBS.map(function(hub){
    var hc = tripIdeaHubHeadcount(hub, r.departure);
    if (hub.airports.indexOf(r.airport) >= 0) return {hub:hub.key, from:r.airport, perTicket:0, headcount:hc, status:'host'};
    // PIA-083: price this hub on its traveler's own dates when they gave them.
    var own = null;
    (members || []).forEach(function(code){ var d = datesByPerson && datesByPerson[_tripIdeaPersonBase(code)]; if (!own && d && hub.airports.indexOf(code) >= 0) own = d; });
    var p = tripIdeaFareFor(hub, city, own ? own.dep : r.departure, own ? (own.ret || r.return) : r.return);
    if (p.perTicket == null) { missing++; return {hub:hub.key, from:p.from, perTicket:null, headcount:hc, status:'unavailable'}; }
    priced++; if (p.status === 'cached' || p.status === 'live') cached++;
    total += p.perTicket * hc;
    return {hub:hub.key, from:p.from, perTicket:p.perTicket, headcount:hc, status:p.status};
  });
  return {total:missing ? null : total, status:missing ? 'partial' : priced && cached === priced ? 'cached' : 'estimated', parts:parts};
}
function buildSharedIdeaPayload(builder, recommendation, notes, members) {
  var s = normalizeTripIdeaBuilderState(builder), r = recommendation || s.recommendation || null;
  var pick = r ? {city:r.city, airport:r.airport, hub:r.hub, fareFrom:r.fareFrom, fareTo:r.fareTo, departure:r.departure, return:r.return,
    totalFare:r.totalFare == null ? null : r.totalFare, perTicketFare:r.perTicketFare == null ? null : r.perTicketFare, headcount:r.headcount || 1, priceStatus:r.priceStatus || 'estimated'} : null;
  if (pick) { var fam = tripIdeaFamilyEstimate(r); pick.familyTotal = fam.total; pick.familyStatus = fam.status; }
  return {title:((r && r.city) || s.destination.city || 'Trip idea') + ' trip', destination:{city:s.destination.city, airport:s.destination.airport},
    dates:{departure:s.dates.departure, return:s.dates.return, searchStart:s.dates.searchStart, searchEnd:s.dates.searchEnd},
    recommendation:pick, notes:String(notes || '').slice(0, 500), members:members || tripIdeaMembersFor((r && r.departure) || s.dates.departure)};
}
function ideaDecisionStage(doc) {
  var d = doc && doc.decision, st = d && d.stage;
  if (st === 'chosen' || st === 'booked' || st === 'dropped') return st;
  // PIA-081: the organizer's own automatic "in" doesn't make an idea "answered".
  var org = {}; ((doc && doc.idea && doc.idea.members) || []).forEach(function(m){ if (m.label === 'Me') org[m.code] = true; });
  return doc && doc.responses && Object.keys(doc.responses).some(function(k){ return !org[k]; }) ? 'answered' : 'proposed';
}
// PIA-083: a member whose home airport IS the destination hosts (Mom & Dad for
// PIA). With no answer they read "hosting" — never "waiting", never nudged.
function _tripIdeaDestAirport(doc) {
  var idea = (doc && doc.idea) || {};
  return (idea.recommendation && idea.recommendation.airport) || (idea.destination && idea.destination.airport) || '';
}
function summarizeIdeaResponses(doc) {
  var members = (doc && doc.idea && doc.idea.members) || [], resp = (doc && doc.responses) || {}, dest = _tripIdeaDestAirport(doc);
  var counts = {in:0, maybe:0, out:0, pending:0, hosting:0}, travelersIn = 0;
  var rows = members.map(function(m){
    var r = resp[m.code] || null, host = !!dest && m.airport === dest, status = r ? r.status : (host ? 'hosting' : 'pending');
    counts[status] = (counts[status] || 0) + 1;
    if (status === 'in' && !host) travelersIn += Number(m.headcount) || 1;
    return {code:m.code, label:m.label || m.code, headcount:Number(m.headcount) || 1, status:status, host:host,
      origin:(r && r.origin) || m.airport || '', available_from:(r && r.available_from) || '', available_to:(r && r.available_to) || '', note:(r && r.note) || '',
      booked:!!(r && r.booked && (r.status === 'in' || r.status === 'maybe')), arrive_at:(r && r.arrive_at) || '', leave_from:(r && r.leave_from) || ''};
  });
  return {rows:rows, counts:counts, travelersIn:travelersIn, stage:ideaDecisionStage(doc)};
}
// Dates every in/maybe responder said work: latest "from" to earliest "to".
function ideaCommonWindow(doc) {
  var from = '', to = '', n = 0;
  summarizeIdeaResponses(doc).rows.forEach(function(r){
    if ((r.status !== 'in' && r.status !== 'maybe') || (!r.available_from && !r.available_to)) return;
    n++;
    if (r.available_from && (!from || r.available_from > from)) from = r.available_from;
    if (r.available_to && (!to || r.available_to < to)) to = r.available_to;
  });
  if (!n) return null;
  return {from:from, to:to, people:n, overlaps:!(from && to && to < from)};
}
// PIA-102: the days the most travelers are all there, even when not everyone
// overlaps. Runs of days with the same people present; the largest group wins,
// then the longest run. Hosts are home throughout, so they never limit it.
function ideaBestWindow(doc) {
  var coming = summarizeIdeaResponses(doc).rows.filter(function(x){ return !x.host && (x.status === 'in' || x.status === 'maybe'); });
  var dated = coming.filter(function(x){ return !!x.available_from; }).map(function(x){
    return {row:x, from:x.available_from, to:x.available_to && x.available_to >= x.available_from ? x.available_to : x.available_from};
  });
  if (!dated.length) return null;
  var lo = dated.reduce(function(a, d){ return d.from < a ? d.from : a; }, dated[0].from), hi = dated.reduce(function(a, d){ return d.to > a ? d.to : a; }, dated[0].to);
  var runs = [], run = null, best = null;
  for (var day = lo, i = 0; day <= hi && i < 120; day = _tripIdeaIsoAdd(day, 1), i++) {
    var here = dated.filter(function(d){ return d.from <= day && d.to >= day; }).map(function(d){ return d.row.code; }), sig = here.join(',');
    if (run && run.sig === sig) run.to = day; else { run = {sig:sig, codes:here, from:day, to:day}; runs.push(run); }
  }
  runs.forEach(function(r){
    if (r.codes.length && (!best || r.codes.length > best.codes.length || (r.codes.length === best.codes.length && _tripIdeaNights(r.from, r.to) > _tripIdeaNights(best.from, best.to)))) best = r;
  });
  if (!best) return null;
  var missing = coming.filter(function(x){ return best.codes.indexOf(x.code) < 0; }).map(function(x){
    return {code:x.code, label:x.label, why:x.available_from ? 'here ' + tripIdeaDateRange(x.available_from, x.available_to) : 'no dates yet'};
  });
  return {from:best.from, to:best.to, nights:_tripIdeaNights(best.from, best.to), there:best.codes.length, total:coming.length,
    everyone:best.codes.length === coming.length, codes:best.codes, missing:missing, span:{from:lo, to:hi}};
}
// ── PIA-105: from overlap to booking — one Google Flights search per person ──
// Each traveler searches their own airport, their own dates, their own seats:
// a multi-passenger search sells every seat at one fare class (often dearer),
// and each origin is its own booking anyway. Hosts don't fly.
// PIA-124: `pick` (from a live cached fare for this exact search) opens Google's
// own link for that search, else narrows the text query to the fare's nonstop /
// airline. Without a pick the link is unchanged.
function tripIdeaFlightUrl(from, to, dep, ret, adults, pick) {
  if (!/^[A-Z]{3}$/.test(from || '') || !/^[A-Z]{3}$/.test(to || '') || from === to || !/^\d{4}-\d{2}-\d{2}$/.test(dep || '')) return '';
  if (pick && pick.gfUrl && !(adults > 1)) return pick.gfUrl;
  var q = 'Flights from ' + from + ' to ' + to + ' on ' + dep + (ret && ret >= dep ? ' through ' + ret : ' one way') + (adults > 1 ? ' for ' + adults + ' adults' : '') +
    (pick && pick.nonstop ? ' nonstop' : '') + (pick && pick.airline ? ' on ' + pick.airline : '');
  return 'https://www.google.com/travel/flights?q=' + encodeURIComponent(q);
}
// PIA-108: a hub has more than one airport — Peoria's family also flies into
// O'Hare and drives (PIA/ORD); New York is LGA or JFK. Each traveler gets the
// other airport as a second search.
function tripIdeaAltAirports(dest) {
  var hub = TRIP_IDEA_HUBS.filter(function(h){ return h.airports.indexOf(dest) >= 0; })[0];
  return hub ? hub.airports.filter(function(a){ return a !== dest; }) : [];
}
// PIA-109: the family's usual way to do Peoria — fly in to PIA, fly home from
// O'Hare (two one-ways). For these destinations that pair is the primary search;
// round trips into either airport stay as the fallback.
var TRIP_IDEA_HOME_FROM = {PIA:'ORD'};
// PIA-111: each traveler's in / home airports — their saved picks (arrive_at /
// leave_from), else the family default (Peoria: in PIA, home ORD). Same airport
// both ways = one round-trip search; different = two one-ways.
function tripIdeaLegPick(dest, row) {
  var hub = [dest].concat(tripIdeaAltAirports(dest));
  return {in:row && hub.indexOf(row.arrive_at) >= 0 ? row.arrive_at : dest,
    home:row && hub.indexOf(row.leave_from) >= 0 ? row.leave_from : (TRIP_IDEA_HOME_FROM[dest] || dest), hub:hub};
}
function tripIdeaLegLinks(from, legs, dep, ret, adults) {
  if (!dep) return null;
  if (legs.in === legs.home || !ret) { var rr = ret && ret >= dep ? ret : '', u = tripIdeaFlightUrl(from, legs.in, dep, ret, adults, tripFarePick(from, legs.in, dep, rr, adults)); return u ? {round:true, to:legs.in, back:legs.in, url:u} : null; }
  var inUrl = tripIdeaFlightUrl(from, legs.in, dep, '', adults, tripFarePick(from, legs.in, dep, '', adults)), outUrl = tripIdeaFlightUrl(legs.home, from, ret, '', adults, tripFarePick(legs.home, from, ret, '', adults));
  return inUrl && outUrl ? {round:false, to:legs.in, back:legs.home, inUrl:inUrl, outUrl:outUrl} : null;
}
function tripIdeaOpenJaw(from, dest, dep, ret, adults) {
  var l = tripIdeaLegLinks(from, tripIdeaLegPick(dest, null), dep, ret, adults);
  return l && !l.round ? l : null;
}
function tripIdeaBookRows(doc) {
  var dest = _tripIdeaDestAirport(doc), alts = tripIdeaAltAirports(dest);
  return summarizeIdeaResponses(doc).rows.filter(function(x){ return !x.host && (x.status === 'in' || x.status === 'maybe'); }).map(function(x){
    var from = String(x.origin || '').toUpperCase(), legs = tripIdeaLegPick(dest, x);
    var links = x.available_from ? tripIdeaLegLinks(from, legs, x.available_from, x.available_to, x.headcount) : null;
    return {code:x.code, label:x.label, from:from, to:dest, dep:x.available_from, ret:x.available_to, headcount:x.headcount, status:x.status, booked:!!x.booked,
      legs:legs, links:links, openJaw:links && !links.round ? links : null,
      url:x.available_from ? tripIdeaFlightUrl(from, dest, x.available_from, x.available_to, x.headcount) : '',
      alts:x.available_from ? alts.filter(function(a){ return a !== from; }).map(function(a){ return {to:a, url:tripIdeaFlightUrl(from, a, x.available_from, x.available_to, x.headcount)}; }).filter(function(a){ return a.url; }) : []};
  });
}
function _tripIdeaLegBtns(l, code, cls) {
  var c = cls || 'trip-idea-book-go';
  if (l.round) return '<a class="' + c + '" href="' + _tripIdeaEsc(l.url) + '" target="_blank" rel="noopener" data-book-for="' + _tripIdeaEsc(code) + '" data-leg="round">Round trip · ' + _tripIdeaEsc(l.to) + ' ↗</a>';
  return '<a class="' + c + '" href="' + _tripIdeaEsc(l.inUrl) + '" target="_blank" rel="noopener" data-book-for="' + _tripIdeaEsc(code) + '" data-leg="in">✈️ In ' + _tripIdeaEsc(l.to) + ' ↗</a>' +
    '<a class="' + c + '" href="' + _tripIdeaEsc(l.outUrl) + '" target="_blank" rel="noopener" data-leg="home">🏠 Home ' + _tripIdeaEsc(l.back) + ' ↗</a>';
}
// PIA-120: the trip's plan dates as the RSVP stores them (what the organizer
// set with ✎). A linked trip uses these everywhere, not the dashboard's own.
function tripIdeaPlanDates(doc) {
  var idea = (doc && doc.idea) || {}, r = idea.recommendation || {}, d = idea.dates || {};
  var dep = r.departure || d.departure || '', ret = r.return || d.return || '';
  return /^\d{4}-\d{2}-\d{2}$/.test(dep) ? {dep:dep, ret:/^\d{4}-\d{2}-\d{2}$/.test(ret) && ret >= dep ? ret : ''} : null;
}
// PIA-120: the same per-person booking rows as the RSVP sheet, always open —
// for the Family tab's trip card.
function tripIdeaBookListHtml(doc) {
  var rows = doc ? tripIdeaBookRows(doc) : [];
  if (!rows.length) return '';
  // PIA-124: the book-by countdown, each traveler's fare confidence, Mark booked.
  var bb = doc.id ? tripBookBy(doc.id) : null;
  return '<div class="lt-book"><div class="lt-book-hd">✈️ Book flights' + (bb ? ' ' + _tripBookByHtml(bb) : '') + '</div><ul>' + rows.map(function(r){
    var legs = r.booked ? [] : tripLegsForRow(r);
    return '<li data-lt-book="' + _tripIdeaEsc(r.code) + '"><div><strong>' + _tripIdeaEsc(_tripIdeaName(r.label)) + (r.headcount > 1 ? ' (' + r.headcount + ')' : '') + '</strong><span>' +
      _tripIdeaEsc(r.dep ? tripIdeaDateRange(r.dep, r.ret) : 'no dates yet') + '</span>' + (legs.length ? _tripConfHtml(tripTravelerConfidence({legs:legs})) : '') + '</div>' +
      (r.booked ? '<b class="trip-idea-booked-tag">✓ Booked</b>' : r.links ? '<span class="trip-idea-book-btns">' + _tripIdeaLegBtns(r.links, r.code) + (doc.id ? _tripMarkBookedBtn(doc.id, r.code) : '') + '</span>' : '') + '</li>';
  }).join('') + '</ul></div>';
}
// PIA-120: one Family-tab route card of a linked trip = that person's RSVP
// answer: their dates, their In/Home airports, the same links as the RSVP sheet.
function tripIdeaLinkedRoute(code) {
  var doc = typeof S === 'object' && S && S.linkedIdeaId ? tripIdeaCachedDoc(S.linkedIdeaId) : null;
  if (!doc) return null;
  var base = _tripIdeaPersonBase(code);
  var r = tripIdeaBookRows(doc).filter(function(x){ return _tripIdeaPersonBase(x.code) === base; })[0];
  if (!r) return {dates:'📋 RSVP · no answer yet', links:'', booked:false};
  var legs = r.legs.home !== r.legs.in && r.ret ? ' · in ' + r.legs.in + ', home ' + r.legs.home : '';
  return {dates:'📋 RSVP · ' + (r.dep ? tripIdeaDateRange(r.dep, r.ret) + legs : 'no dates yet'), booked:r.booked,
    links:r.booked ? '<b class="trip-idea-booked-tag">✓ Booked</b>' : r.links ? _tripIdeaLegBtns(r.links, r.code) : ''};
}
function tripIdeaBookPanelHtml(sh) {
  var rows = tripIdeaBookRows(sh.doc);
  if (!rows.length) return '';
  return '<details class="trip-idea-book"' + (sh.bookOpen ? ' open' : '') + '><summary>✈️ Book for these dates</summary><ul>' + rows.map(function(r){
    return '<li><div><strong>' + _tripIdeaEsc(_tripIdeaName(r.label)) + (r.headcount > 1 ? ' (' + r.headcount + ')' : '') + '</strong><span>' +
      _tripIdeaEsc(r.dep ? r.from + ' → ' + r.legs.in + (r.legs.home !== r.legs.in && r.ret ? ' · home ' + r.legs.home : '') + ' · ' + tripIdeaDateRange(r.dep, r.ret) : 'no dates yet') + '</span></div>' +
      (r.booked ? '<b class="trip-idea-booked-tag">✓ Booked</b>' : r.links ? '<span class="trip-idea-book-btns">' + _tripIdeaLegBtns(r.links, r.code) + '</span>' : '') +
      (sh.editKey && tripIdeaCanBook() ? '<button type="button" class="trip-idea-linkish" data-idea-booked="' + _tripIdeaEsc(r.code) + '" data-booked-to="' + (r.booked ? '0' : '1') + '">' + (r.booked ? 'Undo' : 'Mark booked') + '</button>' : '') + '</li>';
  }).join('') + '</ul><small>One search per person, on their own dates and airports.</small></details>';
}
// ── PIA-106: who's booked ───────────────────────────────────────────────────
// Shown only once the Worker says it stores it (can_book), so nothing appears
// before `wrangler deploy`.
var TRIP_IDEA_BOOKED_STORAGE = 'pialax_idea_booked_v1';
function tripIdeaCanBook() { try { return localStorage.getItem(TRIP_IDEA_BOOKED_STORAGE) === '1'; } catch (e) { return false; } }
var TRIP_IDEA_LEGS_STORAGE = 'pialax_idea_legs_v1';
function tripIdeaCanLegs() { try { return localStorage.getItem(TRIP_IDEA_LEGS_STORAGE) === '1'; } catch (e) { return false; } }
// One tap on In / Home re-saves the answer with the new airports (rest unchanged).
function tripIdeaSetLegs(sh, code, pick) {
  var r = (sh.doc.responses && sh.doc.responses[code]) || {};
  var body = {member:code, status:r.status, origin:r.origin || '', available_from:r.available_from || '', available_to:r.available_to || '', note:r.note || '',
    arrive_at:pick.in, leave_from:pick.home};
  return _tripIdeaApi('POST', '/idea/respond?id=' + encodeURIComponent(sh.id), body).then(function(res){
    if (res.ok && res.json && res.json.doc) { sh.doc = res.json.doc; if (typeof tripIdeaStoreDoc === 'function') tripIdeaStoreDoc(sh.doc); renderTripIdeaBuilder(); return sh.doc; }
    showShareToast('Could not save — try again'); return null;
  });
}
// Trips-card handoff: a linked traveler's saved picks, when they made any.
function tripIdeaMemberLegs(item, code) {
  if (!item || !item.sharedIdeaId) return null;
  var doc = tripIdeaCachedDoc(item.sharedIdeaId);
  if (!doc) return null;
  var base = _tripIdeaPersonBase(code), row = summarizeIdeaResponses(doc).rows.filter(function(x){ return _tripIdeaPersonBase(x.code) === base; })[0];
  return row && (row.arrive_at || row.leave_from) ? tripIdeaLegPick(_tripIdeaDestAirport(doc), row) : null;
}
function tripIdeaBookedCount(doc) {
  var t = summarizeIdeaResponses(doc).rows.filter(function(x){ return !x.host && (x.status === 'in' || x.status === 'maybe'); });
  return {booked:t.filter(function(x){ return x.booked; }).length, total:t.length,
    unbooked:t.filter(function(x){ return !x.booked && !_tripIdeaIsOrganizer(x.label); }).map(function(x){ return x.label; })};
}
function tripIdeaSetBooked(sh, code, booked) {
  return _tripIdeaApi('POST', '/idea/booked?id=' + encodeURIComponent(sh.id), {member:code, booked:!!booked}).then(function(res){
    if (res.ok && res.json && res.json.doc) {
      sh.doc = res.json.doc; if (typeof tripIdeaStoreDoc === 'function') tripIdeaStoreDoc(sh.doc);
      showShareToast(booked ? '✈️ Marked booked — nice!' : 'Booked mark removed'); renderTripIdeaBuilder(); return sh.doc;
    }
    showShareToast(res.json && res.json.code === 'answer_first' ? 'Answer in or maybe first' : 'Could not save — try again');
    return null;
  });
}
function tripIdeaWindowText(win) {
  if (!win) return 'No dates picked yet';
  if (win.total < 2) return 'Dates so far: ' + tripIdeaDateRange(win.from, win.to);
  var when = tripIdeaDateRange(win.from, win.to);
  if (win.everyone) return 'Everyone’s there ' + when;
  return 'Best window ' + when + ' · ' + win.there + ' of ' + win.total + ' there (' + win.missing.map(function(m){ return _tripIdeaName(m.label) + ': ' + m.why; }).join('; ') + ')';
}
// Who's there which day: one row per person across the answered days, the
// best window shaded. Hosts are a full bar; people without dates say so.
function tripIdeaDayStripHtml(doc, win) {
  if (!win) return '';
  var rows = summarizeIdeaResponses(doc).rows.filter(function(x){ return x.host || x.status === 'in' || x.status === 'maybe'; });
  var from = win.span.from, to = win.span.to;
  if (_tripIdeaNights(from, to) > 20) { from = _tripIdeaIsoAdd(win.from, -3) < from ? from : _tripIdeaIsoAdd(win.from, -3); to = _tripIdeaIsoAdd(from, 20) < to ? _tripIdeaIsoAdd(from, 20) : to; }
  var days = []; for (var d = from; d <= to; d = _tripIdeaIsoAdd(d, 1)) days.push(d);
  var every = days.length > 14 ? 2 : 1, cols = 'grid-template-columns:minmax(64px,auto) repeat(' + days.length + ',minmax(0,1fr))';
  var wd = function(d){ return new Date(d + 'T12:00:00Z').getUTCDay(); };
  var head = '<span class="trip-idea-strip-name"></span>' + days.map(function(d){
    return '<span class="trip-idea-strip-wd' + (wd(d) === 0 || wd(d) === 6 ? ' we' : '') + (d >= win.from && d <= win.to ? ' win' : '') + '">' + 'SMTWTFS'.charAt(wd(d)) + '</span>';
  }).join('') + '<span class="trip-idea-strip-name">' + TRIP_IDEA_MONTHS[+days[0].slice(5, 7) - 1] + '</span>' + days.map(function(d, i){
    return '<span class="trip-idea-strip-day' + (d >= win.from && d <= win.to ? ' win' : '') + '">' + (i % every ? '' : +d.slice(8)) + '</span>';
  }).join('');
  var body = rows.map(function(x){
    var a = x.available_from, b = x.available_to && x.available_to >= a ? x.available_to : a;
    var name = '<span class="trip-idea-strip-name">' + (x.host ? '🏠 ' : '') + _tripIdeaEsc(_tripIdeaName(x.label)) + '</span>';
    if (!x.host && !a) return name + '<span class="trip-idea-strip-none" style="grid-column:2/-1">no dates yet</span>';
    return name + days.map(function(d){ var on = x.host || (d >= a && d <= b); return '<i class="' + (on ? (x.booked ? 'on booked' : x.status === 'maybe' ? 'on maybe' : 'on') : '') + (d >= win.from && d <= win.to ? ' win' : '') + '"></i>'; }).join('');
  }).join('');
  return '<div class="trip-idea-strip" style="' + cols + '" role="img" aria-label="' + _tripIdeaEsc(tripIdeaWindowText(win)) + '">' + head + body + '</div>';
}
function tripIdeaSharedState() { return _tripIdeaShared; } // read accessor (tests, debugging)
// PIA-103: the organizer's edit key, portable to their other devices. It rides
// in the URL hash (#k=), which never reaches a server or a link preview, and
// is stripped from the address bar as soon as it's saved. Links to the site
// root so the device lands on its own (desktop / phone) page.
function tripIdeaOrganizerLink(id) {
  var k = _tripIdeaKeys()[id];
  if (!k || !k.edit_key) return '';
  // PIA-114: the organizer's own token rides along so a second device of
  // theirs unlocks live fares too. Family links never carry it.
  var t = (typeof proxyToken === 'function') ? proxyToken() : '';
  return window.location.origin + window.location.pathname.replace(/[^\/]*$/, '') + '?idea=' + encodeURIComponent(id) + '#k=' + encodeURIComponent(k.edit_key) + (t ? '&t=' + encodeURIComponent(t) : '');
}
function tripIdeaCopyOrganizerLink(id) {
  var url = tripIdeaOrganizerLink(id);
  if (!url) { showShareToast('Only the organizer’s device has this link'); return ''; }
  _tripIdeaCopy(url); showShareToast('🔑 Organizer link copied — open it on your other phone or computer. Don’t send it to the family.');
  return url;
}
function _tripIdeaTakeHashKey(id) {
  var m = /(?:^#|&)k=([A-Za-z0-9_-]{32,64})(?:&|$)/.exec((window.location && window.location.hash) || '');
  if (!m) return false;
  var keys = _tripIdeaKeys(); if (!(keys[id] && keys[id].edit_key === m[1])) _tripIdeaSaveKey(id, m[1], '');
  var t = /(?:^#|&)t=([A-Za-z0-9_-]{16,128})(?:&|$)/.exec(window.location.hash);
  if (t && typeof setProxyToken === 'function') setProxyToken(t[1]);
  try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) {}
  return true;
}
function _tripIdeaKeys() {
  try { return JSON.parse(localStorage.getItem(TRIP_IDEA_KEYS_STORAGE)) || {}; } catch (e) { return {}; }
}
function _tripIdeaSaveKey(id, editKey, title) {
  var keys = _tripIdeaKeys(); keys[id] = {edit_key:editKey, title:title || '', created_at:new Date().toISOString()};
  try { localStorage.setItem(TRIP_IDEA_KEYS_STORAGE, JSON.stringify(keys)); } catch (e) {}
}
// PIA-104: a Worker that answers with `preview:true` serves /i/<id> link
// previews and hides prices from anyone without the organizer's key. Only once
// that's known does the app send X-Idea-Key (an older Worker's CORS rules would
// refuse the header) and share /i/ links.
var TRIP_IDEA_PREVIEW_STORAGE = 'pialax_idea_preview_v1';
function _tripIdeaWorkerPreview() { try { return localStorage.getItem(TRIP_IDEA_PREVIEW_STORAGE) === '1'; } catch (e) { return false; } }
function _tripIdeaApi(method, path, body) {
  var base = typeof PROXY_URL === 'string' ? PROXY_URL.replace(/\/+$/, '') : '';
  if (!base) return Promise.resolve({ok:false, status:0, json:null});
  var opts = {method:method, headers:{'Content-Type':'application/json'}};
  var idm = /[?&]id=([A-Za-z0-9_-]{22})/.exec(path), key = idm && _tripIdeaKeys()[idm[1]];
  if (key && key.edit_key && _tripIdeaWorkerPreview()) opts.headers['X-Idea-Key'] = key.edit_key;
  if (body) opts.body = JSON.stringify(body);
  return fetch(base + path, opts).then(function(res){
    return res.text().then(function(t){
      var j = null; try { j = JSON.parse(t); } catch (e) {}
      if (j && j.preview === true && !_tripIdeaWorkerPreview()) { try { localStorage.setItem(TRIP_IDEA_PREVIEW_STORAGE, '1'); } catch (e) {} }
      if (j && j.can_book === true && !tripIdeaCanBook()) { try { localStorage.setItem(TRIP_IDEA_BOOKED_STORAGE, '1'); } catch (e) {} }
      if (j && j.can_legs === true && !tripIdeaCanLegs()) { try { localStorage.setItem(TRIP_IDEA_LEGS_STORAGE, '1'); } catch (e) {} }
      return {ok:res.ok, status:res.status, json:j, sentKey:!!opts.headers['X-Idea-Key']};
    });
  }).catch(function(){ return {ok:false, status:0, json:null}; });
}
// The link the family taps: the Worker's /i/<id> (a proper iMessage preview)
// once the Worker serves it, else the app's own ?idea=<id> page.
function tripIdeaInviteUrl(id) {
  var base = typeof PROXY_URL === 'string' ? PROXY_URL.replace(/\/+$/, '') : '';
  return base && _tripIdeaWorkerPreview() ? base + '/i/' + encodeURIComponent(id) : _tripIdeaShareUrl({idea:id});
}
function _tripIdeaShareUrl(params) {
  var sp = new URLSearchParams(); Object.keys(params).forEach(function(k){ sp.set(k, params[k]); });
  return window.location.origin + window.location.pathname + '?' + sp.toString();
}
function _tripIdeaCopy(text) {
  if (typeof copyRouteText === 'function') copyRouteText(text); else if (navigator.clipboard) navigator.clipboard.writeText(text);
}
function _tripIdeaShareReadOnly(note) {
  var payload = serializeTripIdeaSharePayload(tripIdeaBuilder, tripIdeaBuilder.recommendation, {fareStatus:tripIdeaBuilder.priceStatus, notes:tripIdeaBuilder._notes});
  var url = _tripIdeaShareUrl({tripIdea:encodeTripIdeaSharePayload(payload)});
  _tripIdeaCopy('✈️ Shared Trip Idea\n' + url);
  showShareToast(note || '✓ Read-only proposal link copied'); return url;
}
function _tripIdeaShare(){
  if (!tripIdeaBuilder.recommendation) { showShareToast('Select a recommendation first'); return Promise.resolve(null); }
  var payload = buildSharedIdeaPayload(tripIdeaBuilder, tripIdeaBuilder.recommendation, tripIdeaBuilder._notes);
  return _tripIdeaApi('POST', '/idea', {idea:payload}).then(function(res){
    if (!res.ok || !res.json || !res.json.id) {
      return _tripIdeaShareReadOnly(res.status === 501 || res.status === 404 || res.status === 405 || res.status === 0
        ? '✓ Read-only link copied (RSVP storage not set up yet)' : '✓ Read-only link copied (could not create RSVP link)');
    }
    _tripIdeaSaveKey(res.json.id, res.json.edit_key, payload.title);
    if (typeof tripIdeaRecordDecision === 'function') tripIdeaRecordDecision(res.json.doc);
    // PIA-076: the shared idea lives on a Trip Ideas card (saved now if it wasn't).
    if (typeof tripIdeaStoreDoc === 'function') tripIdeaStoreDoc(res.json.doc);
    var item = _tripIdeaSave(true); if (item && typeof tripIdeaLinkItem === 'function') { tripIdeaLinkItem(item, res.json.id); if (typeof renderWatchlist === 'function') renderWatchlist(); }
    return _tripIdeaAnswerAsOrganizer(res.json.doc).then(function(doc){ if (typeof renderWatchlist === 'function') try { renderWatchlist(); } catch (e) {} return tripIdeaSendInvite(doc); });
  });
}
function _tripIdeaOpenRemote(id, opts) {
  var keys = _tripIdeaKeys();
  _tripIdeaShared = {id:id, doc:null, editKey:(keys[id] && keys[id].edit_key) || '', error:''};
  _tripIdeaBuilderReadOnly = false; _tripIdeaBuilderStage = 'shared';
  _tripIdeaShow(); renderTripIdeaBuilder();
  return _tripIdeaApi('GET', '/idea?id=' + encodeURIComponent(id)).then(function(res){
    // First contact with a price-hiding Worker: ask again with the organizer key.
    if (res.ok && res.json && res.json.preview && res.json.organizer === false && _tripIdeaShared && _tripIdeaShared.editKey && !res.sentKey) return _tripIdeaApi('GET', '/idea?id=' + encodeURIComponent(id));
    return res;
  }).then(function(res){
    if (!_tripIdeaShared || _tripIdeaShared.id !== id) return;
    // A key the Worker doesn't recognise can't manage the trip: show the family view.
    if (res.ok && res.json && res.json.preview && res.json.organizer === false && res.sentKey && _tripIdeaShared.editKey) { _tripIdeaShared.editKey = ''; showShareToast('This device’s organizer key doesn’t match this trip'); }
    if (res.ok && res.json && res.json.doc) { _tripIdeaShared.doc = res.json.doc; if (typeof tripIdeaStoreDoc === 'function') tripIdeaStoreDoc(res.json.doc); if (_tripIdeaShared.editKey && typeof tripIdeaMarkSeen === 'function') { tripIdeaMarkSeen(res.json.doc); if (typeof renderWatchlist === 'function') try { renderWatchlist(); } catch (e) {} } if (typeof tripIdeaRecordDecision === 'function' && _tripIdeaShared.editKey) tripIdeaRecordDecision(res.json.doc); }
    else _tripIdeaShared.error = res.status === 404 ? 'This trip idea was not found — it may have expired.' : res.status === 501 || res.status === 0 ? 'Shared trip ideas are not available right now.' : 'Could not load this trip idea.';
    // PIA-120: "✎ Dates" on the Family tab opens straight into the plan-dates editor.
    if (opts && opts.planEdit && _tripIdeaShared.doc && _tripIdeaShared.editKey) _tripIdeaStartPlanEdit(_tripIdeaShared);
    if (_tripIdeaBuilderStage === 'shared') renderTripIdeaBuilder();
  });
}
function _tripIdeaStartPlanEdit(sh) {
  var p = tripIdeaPlanDates(sh.doc) || {dep:'', ret:''};
  sh.planCal = {month:(p.dep || _tripIdeaTodayIso()).slice(0, 7), from:p.dep, to:p.ret};
}
function _tripIdeaRespond() {
  var sh = _tripIdeaShared; if (!sh || !sh.doc) return Promise.resolve(null);
  var val = function(id){ return ((_tripIdeaEl(id) || {}).value || '').trim(); };
  var checked = document.querySelector('input[name="trip-idea-rsvp-status"]:checked');
  var who = tripIdeaWho(sh), me = summarizeIdeaResponses(sh.doc).rows.filter(function(x){ return x.code === who; })[0];
  var body = {member:who, status:me && me.host ? 'in' : (checked ? checked.value : ''), origin:val('trip-idea-rsvp-origin').toUpperCase(),
    available_from:val('trip-idea-rsvp-from'), available_to:val('trip-idea-rsvp-to'), note:val('trip-idea-rsvp-note')};
  if (!body.member) { showShareToast('Tap your name first'); return Promise.resolve(null); }
  if (!body.status) { showShareToast('Pick in / maybe / out'); return Promise.resolve(null); }
  if (me && me.host) { body.available_from = ''; body.available_to = ''; body.origin = ''; }
  if (sh.answerFor && body.note.indexOf('(entered by ') < 0) body.note = (body.note ? body.note + ' ' : '') + '(entered by ' + TRIP_IDEA_ORGANIZER_NAME + ')';
  body.note = body.note.slice(0, 280);
  if (body.available_from && body.available_to && body.available_to < body.available_from) { showShareToast('“I’d leave” must be on or after “I’d arrive”'); return Promise.resolve(null); }
  return _tripIdeaApi('POST', '/idea/respond?id=' + encodeURIComponent(sh.id), body).then(function(res){
    if (res.ok && res.json && res.json.doc) {
      sh.doc = res.json.doc; if (typeof tripIdeaStoreDoc === 'function') tripIdeaStoreDoc(sh.doc);
      if (!sh.answerFor) tripIdeaSetMe(sh.id, body.member);
      showShareToast(sh.answerFor ? '✓ Saved for ' + ((me && me.label) || body.member) : '✓ Answer saved — thanks!');
      sh.answerFor = ''; sh.picked = ''; sh.editing = false; sh.cal = null; renderTripIdeaBuilder(); return res.json.doc;
    }
    showShareToast(res.status === 409 ? 'This trip is already decided' : 'Could not save your answer — try again');
    return null;
  });
}
// PIA-083: each person's answer carries their own travel dates (stored in the
// Worker's available_from / available_to — no Worker change). Keyed by person,
// so an answer survives the JAX → LGA move.
function tripIdeaAnswerDates(doc) {
  var out = {}, resp = (doc && doc.responses) || {};
  Object.keys(resp).forEach(function(code){
    var r = resp[code];
    if (!r || (r.status !== 'in' && r.status !== 'maybe') || !r.available_from) return;
    out[_tripIdeaPersonBase(code)] = {dep:r.available_from, ret:r.available_to || ''};
  });
  return out;
}
function tripIdeaMemberTravel(item, code) {
  if (!item || !item.sharedIdeaId) return null;
  var ans = tripIdeaAnswerDates(tripIdeaCachedDoc(item.sharedIdeaId))[_tripIdeaPersonBase(code)];
  if (!ans || (ans.dep === item.dep && (ans.ret || null) === (item.ret || null))) return null;
  return {dep:ans.dep, ret:ans.ret || item.ret || null, custom:true};
}
// The chosen option re-estimated with everyone's own dates (falls back to the stored estimate).
function tripIdeaChosenWithAnswers(doc) {
  var rec = doc && doc.idea && doc.idea.recommendation;
  if (!rec) return null;
  var fam = tripIdeaFamilyEstimate(rec, tripIdeaAnswerDates(doc));
  return fam.total == null ? Object.assign({}, rec) : Object.assign({}, rec, {familyTotal:fam.total, familyStatus:fam.status});
}
function renderTripIdeaShared(target) {
  var sh = _tripIdeaShared;
  if (!sh || (!sh.doc && !sh.error)) { target.innerHTML = '<div class="trip-idea-empty">Loading trip idea…</div>'; return; }
  if (!sh.doc) { target.innerHTML = '<div class="trip-idea-empty">' + _tripIdeaEsc(sh.error) + '</div>'; return; }
  var doc = sh.doc, idea = doc.idea || {}, r = idea.recommendation || {}, sum = summarizeIdeaResponses(doc), win = ideaBestWindow(doc);
  var closed = sum.stage === 'booked' || sum.stage === 'dropped';
  var tripDep = r.departure || (idea.dates && idea.dates.departure) || '', tripRet = r.return || (idea.dates && idea.dates.return) || '';
  // PIA-112: one header line. Guests see a rough time (PIA-098); the organizer
  // sees the plan dates (✎ to fix them) and the family estimate.
  var plan = sh.editKey ? (tripDep ? 'Plan ' + tripIdeaDateRange(tripDep, tripRet) : 'No plan dates yet') + (r.familyTotal != null ? ' · ≈ $' + Number(r.familyTotal).toLocaleString('en-US') : '')
    : (tripIdeaLooseWhen(tripDep) ? tripIdeaLooseWhen(tripDep).replace(/^./, function(c){ return c.toUpperCase(); }) + ' · pick your own dates' : 'Pick your own dates');
  var html = '<div class="trip-idea-hd"><strong>' + _tripIdeaEsc(idea.title || 'Trip idea') + '</strong><span class="trip-idea-stage trip-idea-stage-' + sum.stage + '">' + _tripIdeaEsc(sum.stage) + '</span></div>' +
    '<div class="trip-idea-planline"><span>' + _tripIdeaEsc(plan) + '</span>' + (sh.editKey && !closed ? '<button type="button" class="trip-idea-linkish" data-plan-edit aria-label="Change plan dates">✎</button>' : '') + '</div>' +
    (sh.planCal ? _tripIdeaPlanEditHtml(sh) : '') +
    (idea.notes ? '<p class="trip-idea-notes-clamp" data-clamp>' + _tripIdeaEsc(idea.notes) + '</p>' : '') +
    '<div class="trip-idea-rsvp-summary"><strong>' + _tripIdeaEsc(tripIdeaCountsLine(doc)) + '</strong>' +
    '<b class="trip-idea-window' + (win && win.everyone && win.total > 1 ? ' all' : '') + '">' + _tripIdeaEsc(tripIdeaWindowText(win)) + '</b>' + tripIdeaDayStripHtml(doc, win) + tripIdeaBookPanelHtml(sh) + '</div>';
  var listHtml = '<ul class="trip-idea-rsvp-list">' + sum.rows.map(function(x){      var canAnswerFor = sh.editKey && !closed && !_tripIdeaIsOrganizer(x.label);
      return '<li' + (canAnswerFor ? ' class="has-edit"' : '') + '><strong>' + _tripIdeaEsc(_tripIdeaName(x.label)) + (x.headcount > 1 ? ' (' + x.headcount + ')' : '') + '</strong>' +
        (canAnswerFor ? '<button type="button" class="trip-idea-row-edit" data-idea-answer-for="' + _tripIdeaEsc(x.code) + '" aria-label="Answer for ' + _tripIdeaEsc(x.label) + '">✎ Answer for</button>' : '') +
        '<span>' + _tripIdeaEsc(x.host && x.status === 'in' ? '🏠 Hosting — confirmed' : (TRIP_IDEA_RSVP_LABELS[x.status] || x.status) + (x.booked ? ' · ✈️ booked' : '')) + (x.origin && !x.host ? ' · from ' + _tripIdeaEsc(x.origin) : '') +
        (x.available_from && !x.host ? ' · here ' + _tripIdeaEsc(tripIdeaDateRange(x.available_from, x.available_to)) : '') + '</span>' + (x.note ? '<small>' + _tripIdeaEsc(x.note) + '</small>' : '') + '</li>';
    }).join('') + '</ul>';
  html += _tripIdeaAnswerHtml(sh, sum, closed);
  // PIA-112: the strip already shows who's there; the full list and the
  // organizer tools fold away.
  html += '<details class="trip-idea-fold"' + (sh.listOpen || sh.answerFor ? ' open' : '') + ' data-fold="list"><summary>Answers &amp; notes (' + sum.rows.length + ')</summary>' + listHtml + '</details>';
  var orgHtml = '';
  var othersWaiting = sum.rows.filter(function(x){ return x.status === 'pending' && !_tripIdeaIsOrganizer(x.label); }).length;
  var notBooked = tripIdeaCanBook() ? tripIdeaBookedCount(doc).unbooked.length : 0;
  if (!closed && sh.editKey && (othersWaiting || notBooked || (win && win.total > 1))) orgHtml += '<div class="trip-idea-decision-row trip-idea-admin-row">' +
    (othersWaiting ? '<button type="button" class="secondary trip-idea-rsvp-send" data-idea-action="nudge">📣 Nudge ' + othersWaiting + ' waiting</button>'
      : notBooked ? '<button type="button" class="secondary trip-idea-rsvp-send" data-idea-action="nudge">📣 Nudge ' + notBooked + ' to book</button>' : '') +
    (win && win.total > 1 ? '<button type="button" class="secondary trip-idea-rsvp-send" data-idea-hold>📅 Hold ' + _tripIdeaEsc(tripIdeaDateRange(win.from, win.to)) + '</button>' : '') + '</div>';
  if (sh.editKey) orgHtml += '<div class="trip-idea-decision-row trip-idea-admin-row"><button type="button" class="secondary trip-idea-rsvp-send" data-idea-orglink>🔑 Copy organizer link</button></div>';
  var decision = typeof renderTripIdeaDecisionPanel === 'function' ? renderTripIdeaDecisionPanel(doc, !!sh.editKey) : '';
  if (sh.editKey) html += '<details class="trip-idea-fold"' + (sh.orgOpen ? ' open' : '') + ' data-fold="org"><summary>Organizer</summary>' + orgHtml + decision + '</details>';
  else html += decision;
  if (_tripIdeaGuest) html += '<p class="trip-idea-guest-exit"><button type="button" class="trip-idea-linkish" data-idea-leave>Open full PIALAX</button></p>';
  target.innerHTML = html;
  var primary = _tripIdeaEl('trip-idea-builder-primary');
  if (primary && sh.formOpen) { primary.disabled = false; primary.textContent = sh.answerFor ? 'Save for ' + sh.formName : sh.formHost ? 'Confirm we’re hosting' : 'Send my answer'; }
  _tripIdeaWireShared(target, sh);
}
// PIA-112: one status line — "All 3 in", or "2 in · 1 waiting · 1 booked".
function tripIdeaCountsLine(doc) {
  var c = summarizeIdeaResponses(doc).counts, people = c.in + c.maybe + c.out + c.pending, parts = [];
  if (c.in && c.in === people) parts.push('All ' + c.in + ' in');
  else [['in', c.in], ['maybe', c.maybe], ['out', c.out], ['waiting', c.pending]].forEach(function(p){ if (p[1]) parts.push(p[1] + ' ' + p[0]); });
  var b = tripIdeaCanBook() ? tripIdeaBookedCount(doc) : null;
  if (b && b.booked) parts.push(b.booked + ' of ' + b.total + ' booked');
  return parts.join(' · ') || 'No answers yet';
}
// Organizer fixes the plan dates (the proposal stored on the Worker) — same
// calendar as the RSVP, saved through /idea/update with the edit key.
function tripIdeaPlanDatesPayload(doc, from, to) {
  var idea = JSON.parse(JSON.stringify((doc && doc.idea) || {}));
  idea.dates = Object.assign({}, idea.dates || {}, {departure:from, return:to || ''});
  if (idea.recommendation) { idea.recommendation.departure = from; idea.recommendation.return = to || ''; }
  return idea;
}
function _tripIdeaPlanEditHtml(sh) {
  var c = sh.planCal;
  return '<div class="trip-idea-planedit"><div id="trip-idea-plan-cal-wrap">' + tripIdeaRangeCalendarHtml(c.month, c.from, c.to, {}, _tripIdeaTodayIso()) + '</div>' +
    '<div class="trip-idea-decision-row"><button type="button" class="trip-idea-rsvp-send" data-plan-save' + (c.from ? '' : ' disabled') + '>Save plan dates</button><button type="button" class="trip-idea-linkish" data-plan-cancel>Cancel</button></div></div>';
}
function tripIdeaSavePlanDates(sh) {
  var c = sh.planCal; if (!c || !c.from || !sh.editKey) return Promise.resolve(null);
  return _tripIdeaApi('POST', '/idea/update?id=' + encodeURIComponent(sh.id), {edit_key:sh.editKey, idea:tripIdeaPlanDatesPayload(sh.doc, c.from, c.to)}).then(function(res){
    if (res.ok && res.json && res.json.doc) { sh.doc = res.json.doc; sh.planCal = null; if (typeof tripIdeaStoreDoc === 'function') tripIdeaStoreDoc(sh.doc); showShareToast('✓ Plan dates saved'); renderTripIdeaBuilder(); return sh.doc; }
    showShareToast('Could not save the plan dates'); return null;
  });
}
// PIA-100: the answer area is one of three states — pick your name (first
// visit), your saved answer with "Change" (return visits), or the form.
function _tripIdeaAnswerHtml(sh, sum, closed) {
  sh.formOpen = false; sh.formHost = false;
  if (closed) return '<div class="trip-idea-empty">This trip is ' + _tripIdeaEsc(sum.stage) + ' — answers are closed.</div>';
  var who = tripIdeaWho(sh), row = sum.rows.filter(function(x){ return x.code === who; })[0];
  if (!row) {
    var pick = sum.rows.filter(function(x){ return sh.editKey || !_tripIdeaIsOrganizer(x.label); });
    return '<div class="trip-idea-who"><strong>Who are you?</strong><span>Tap your name — this phone remembers it.</span><div class="trip-idea-who-grid">' +
      pick.map(function(x){ return '<button type="button" data-idea-who="' + _tripIdeaEsc(x.code) + '">' + _tripIdeaEsc(x.label) + (x.host ? ' <small>🏠 hosting</small>' : '') + '</button>'; }).join('') + '</div></div>';
  }
  var answered = !!(sh.doc.responses && sh.doc.responses[row.code]), forOther = !!sh.answerFor;
  var name = _tripIdeaIsOrganizer(row.label) ? 'You' : row.label;
  if (answered && !sh.editing && !forOther) {
    var bits = [];
    if (row.available_from && !row.host) bits.push('here ' + tripIdeaDateRange(row.available_from, row.available_to));
    if (row.origin && !row.host) bits.push('from ' + row.origin);
    return '<div class="trip-idea-mine"><span>Your answer' + (name !== 'You' ? ' · ' + _tripIdeaEsc(name) : '') + '</span><strong>' + _tripIdeaEsc(row.host ? '🏠 Hosting' : (TRIP_IDEA_RSVP_LABELS[row.status] || row.status)) + '</strong>' +
      (bits.length ? '<span>' + _tripIdeaEsc(bits.join(' · ')) + '</span>' : '') + (row.note ? '<small>' + _tripIdeaEsc(row.note) + '</small>' : '') +
      '<div class="trip-idea-mine-actions">' + (row.booked ? '<b class="trip-idea-booked-tag">✈️ Booked</b><button type="button" class="trip-idea-linkish" data-idea-booked="' + _tripIdeaEsc(row.code) + '" data-booked-to="0">Undo</button>'
        : _tripIdeaLegToggleHtml(sh, row) + _tripIdeaFindFlightHtml(sh, row) + (tripIdeaCanBook() && !row.host && (row.status === 'in' || row.status === 'maybe') ? '<button type="button" class="trip-idea-ibooked" data-idea-booked="' + _tripIdeaEsc(row.code) + '" data-booked-to="1">I booked ✓</button>' : '')) +
      '<button type="button" data-idea-edit>Change my answer</button>' + (sh.editKey ? '' : '<button type="button" class="trip-idea-linkish" data-idea-notme>Not ' + _tripIdeaEsc(row.label) + '?</button>') + '</div></div>';
  }
  sh.formOpen = true; sh.formHost = row.host; sh.formName = row.label;
  var mine = (sh.doc.responses && sh.doc.responses[row.code]) || {};
  var head = forOther ? 'Answering for ' + _tripIdeaEsc(row.label) + ' <small>(entered by you)</small>' : name === 'You' ? 'Your answer' : 'Answering as ' + _tripIdeaEsc(row.label);
  var aside = forOther ? '<button type="button" class="trip-idea-linkish" data-idea-cancel>Cancel</button>'
    : answered ? '<button type="button" class="trip-idea-linkish" data-idea-cancel>Keep my answer</button>'
    : sh.editKey ? '' : '<button type="button" class="trip-idea-linkish" data-idea-notme>Not ' + _tripIdeaEsc(row.label) + '?</button>';
  var html = '<form class="trip-idea-plan trip-idea-rsvp-form" onsubmit="return false"><div class="trip-idea-form-head"><strong>' + head + '</strong>' + aside + '</div>';
  if (row.host) {
    html += '<p class="trip-idea-host-note">🏠 ' + _tripIdeaEsc(name === 'You' ? 'You’re' : row.label + ' —') + ' hosting at home — no flights or dates needed. Add a note if you like.</p>';
  } else {
    html += '<div class="trip-idea-date-mode" role="radiogroup" aria-label="Are you in?">' + ['in','maybe','out'].map(function(st){ return '<label class="trip-idea-rsvp-choice"><input type="radio" name="trip-idea-rsvp-status" value="' + st + '"' + (mine.status === st ? ' checked' : '') + '> ' + _tripIdeaEsc(TRIP_IDEA_RSVP_LABELS[st]) + '</label>'; }).join('') + '</div>' +
      '<div class="trip-idea-rsvp-travel"><strong class="trip-idea-cal-title">When would you be there?</strong><div id="trip-idea-rsvp-cal-wrap">' + _tripIdeaCalHtml(sh, row, mine) + '</div></div>' +
      '<div class="trip-idea-grid"><label class="trip-idea-rsvp-travel">Flying from<input id="trip-idea-rsvp-origin" maxlength="3" value="' + _tripIdeaEsc(mine.origin || row.origin || '') + '" placeholder="e.g. LAX" autocapitalize="characters"></label></div>';
  }
  html += '<label class="trip-idea-notes">Note <span>Optional</span><textarea id="trip-idea-rsvp-note" rows="2" maxlength="280" placeholder="Anything the group should know">' + _tripIdeaEsc(mine.note || '') + '</textarea></label></form>';
  return html;
}
function _tripIdeaFindFlightHtml(sh, row) {
  if (row.host || (row.status !== 'in' && row.status !== 'maybe') || !row.available_from) return '';
  var from = String(row.origin || '').toUpperCase(), legs = tripIdeaLegPick(_tripIdeaDestAirport(sh.doc), row);
  var l = tripIdeaLegLinks(from, legs, row.available_from, row.available_to, row.headcount);
  return l ? _tripIdeaLegBtns(l, row.code, 'trip-idea-findflight') : '';
}
// In: [PIA][ORD]  Home: [PIA][ORD] — saved with the answer (needs a Worker that stores it).
function _tripIdeaLegToggleHtml(sh, row) {
  if (!tripIdeaCanLegs() || row.host || (row.status !== 'in' && row.status !== 'maybe') || !row.available_from) return '';
  var legs = tripIdeaLegPick(_tripIdeaDestAirport(sh.doc), row);
  if (legs.hub.length < 2) return '';
  var seg = function(kind, cur){ return '<span class="trip-idea-seg" role="group" aria-label="' + (kind === 'in' ? 'Fly in to' : 'Fly home from') + '">' + legs.hub.map(function(a){
    return '<button type="button" data-leg-' + kind + '="' + _tripIdeaEsc(a) + '" aria-pressed="' + (a === cur ? 'true' : 'false') + '">' + _tripIdeaEsc(a) + '</button>'; }).join('') + '</span>'; };
  return '<div class="trip-idea-legs"><label>In ' + seg('in', legs.in) + '</label><label>Home ' + seg('home', legs.home) + '</label></div>';
}
function _tripIdeaWireShared(target, sh) {
  target.querySelectorAll('details.trip-idea-book').forEach(function(d){ d.addEventListener('toggle', function(){ sh.bookOpen = d.open; }); });
  target.querySelectorAll('[data-leg-in],[data-leg-home]').forEach(function(b){ b.onclick = function(e){
    e.preventDefault(); var who = tripIdeaWho(sh), row = summarizeIdeaResponses(sh.doc).rows.filter(function(x){ return x.code === who; })[0];
    if (!row) return; var p = tripIdeaLegPick(_tripIdeaDestAirport(sh.doc), row);
    if (b.hasAttribute('data-leg-in')) p.in = b.getAttribute('data-leg-in'); else p.home = b.getAttribute('data-leg-home');
    tripIdeaSetLegs(sh, row.code, p);
  }; });
  target.querySelectorAll('[data-idea-booked]').forEach(function(b){ b.onclick = function(e){ e.preventDefault(); tripIdeaSetBooked(sh, b.getAttribute('data-idea-booked'), b.getAttribute('data-booked-to') === '1'); }; });
  var on = function(sel, fn){ target.querySelectorAll(sel).forEach(function(el){ el.onclick = function(e){ e.preventDefault(); fn(el); }; }); };
  on('[data-idea-who]', function(el){ sh.picked = el.getAttribute('data-idea-who'); sh.editing = true; renderTripIdeaBuilder(); });
  on('[data-idea-edit]', function(){ sh.editing = true; sh.cal = null; renderTripIdeaBuilder(); });
  on('[data-idea-cancel]', function(){ sh.editing = false; sh.answerFor = ''; sh.cal = null; renderTripIdeaBuilder(); });
  on('[data-idea-notme]', function(){ tripIdeaSetMe(sh.id, ''); sh.picked = ''; sh.editing = false; renderTripIdeaBuilder(); });
  on('[data-idea-leave]', function(){ tripIdeaLeaveGuest(); });
  target.querySelectorAll('details[data-fold]').forEach(function(d){ d.addEventListener('toggle', function(){ if (d.getAttribute('data-fold') === 'list') sh.listOpen = d.open; else sh.orgOpen = d.open; }); });
  target.querySelectorAll('[data-clamp]').forEach(function(p){ p.onclick = function(){ p.classList.toggle('open'); }; });
  on('[data-plan-edit]', function(){ _tripIdeaStartPlanEdit(sh); renderTripIdeaBuilder(); });
  on('[data-plan-cancel]', function(){ sh.planCal = null; renderTripIdeaBuilder(); });
  on('[data-plan-save]', function(){ tripIdeaSavePlanDates(sh); });
  var pw = _tripIdeaEl('trip-idea-plan-cal-wrap');
  if (pw && sh.planCal) {
    pw.querySelectorAll('[data-cal-day]').forEach(function(b){ b.onclick = function(){ tripIdeaCalendarTap(sh.planCal, b.getAttribute('data-cal-day')); renderTripIdeaBuilder(); }; });
    pw.querySelectorAll('[data-cal-nav]').forEach(function(b){ b.onclick = function(){ var y = +sh.planCal.month.slice(0, 4), m = +sh.planCal.month.slice(5, 7) - 1 + Number(b.getAttribute('data-cal-nav')); sh.planCal.month = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); renderTripIdeaBuilder(); }; });
    pw.querySelectorAll('[data-cal-clear]').forEach(function(b){ b.onclick = function(){ sh.planCal.from = ''; sh.planCal.to = ''; renderTripIdeaBuilder(); }; });
  }
  on('[data-idea-hold]', function(){ var w = ideaBestWindow(sh.doc); if (w) tripIdeaHoldWindow(sh.id, w); });
  on('[data-idea-orglink]', function(){ tripIdeaCopyOrganizerLink(sh.id); });
  on('[data-idea-answer-for]', function(el){
    sh.answerFor = el.getAttribute('data-idea-answer-for'); sh.editing = true; sh.cal = null; renderTripIdeaBuilder();
    var f = target.querySelector('.trip-idea-rsvp-form'); if (f && f.scrollIntoView) f.scrollIntoView({block:'start'});
  });
  _tripIdeaWireCal(sh);
}
// ── PIA-101: arrive/leave calendar ──────────────────────────────────────────
// Opens on the proposal's month with nothing picked (a native date input opens
// on today's month). Tap the arrive day, then the leave day. Dots show how many
// others already said they're there that day. Writes the same available_from /
// available_to the Worker stores (hidden inputs read by _tripIdeaRespond).
var TRIP_IDEA_MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function _tripIdeaIsoAdd(iso, days) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function _tripIdeaTodayIso() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function _tripIdeaNights(from, to) { return Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000); }
function tripIdeaCalendarStartMonth(doc, mine) {
  var idea = (doc && doc.idea) || {}, r = idea.recommendation || {}, d = idea.dates || {};
  var iso = (mine && mine.available_from) || r.departure || d.departure || d.searchStart || '';
  return (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : _tripIdeaTodayIso()).slice(0, 7);
}
// People (not seats) who said they're there each day, excluding one member.
function tripIdeaDayCounts(doc, exceptCode) {
  var out = {};
  summarizeIdeaResponses(doc).rows.forEach(function(x){
    if (x.code === exceptCode || x.host || (x.status !== 'in' && x.status !== 'maybe') || !x.available_from) return;
    var to = x.available_to && x.available_to >= x.available_from ? x.available_to : x.available_from;
    for (var d = x.available_from, i = 0; d <= to && i < 90; d = _tripIdeaIsoAdd(d, 1), i++) out[d] = (out[d] || 0) + 1;
  });
  return out;
}
function tripIdeaRangeCalendarHtml(month, from, to, counts, todayIso) {
  var y = +month.slice(0, 4), m = +month.slice(5, 7), first = new Date(Date.UTC(y, m - 1, 1)), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  var cells = ['S','M','T','W','T','F','S'].map(function(w){ return '<span class="trip-idea-cal-wd" aria-hidden="true">' + w + '</span>'; });
  for (var b = 0; b < first.getUTCDay(); b++) cells.push('<span></span>');
  var any = false;
  for (var day = 1; day <= days; day++) {
    var iso = month + '-' + ('0' + day).slice(-2), n = (counts && counts[iso]) || 0, past = !!todayIso && iso < todayIso;
    var cls = 'trip-idea-cal-day' + (iso === from ? ' is-start' : '') + (iso === to ? ' is-end' : '') + (from && to && iso > from && iso < to ? ' is-in' : '') + (n ? ' has-others' : '');
    if (n) any = true;
    cells.push('<button type="button" class="' + cls + '" data-cal-day="' + iso + '"' + (past ? ' disabled' : '') + ' aria-pressed="' + (iso === from || iso === to || (from && to && iso > from && iso < to) ? 'true' : 'false') + '" aria-label="' + TRIP_IDEA_MONTHS[m - 1] + ' ' + day + (n ? ', ' + n + ' other' + (n === 1 ? '' : 's') + ' there' : '') + '"><span>' + day + '</span>' + (n ? '<i>' + new Array(Math.min(n, 3) + 1).join('•') + '</i>' : '') + '</button>');
  }
  var sel = !from ? 'Tap the day you’d arrive.' : !to ? 'Arrive ' + tripIdeaDateRange(from) + ' — now tap the day you’d leave.'
    : tripIdeaDateRange(from, to) + ' · ' + _tripIdeaNights(from, to) + ' night' + (_tripIdeaNights(from, to) === 1 ? '' : 's');
  return '<div class="trip-idea-cal" id="trip-idea-rsvp-cal"><div class="trip-idea-cal-head"><button type="button" data-cal-nav="-1" aria-label="Previous month">‹</button><strong>' + TRIP_IDEA_MONTHS_LONG[m - 1] + ' ' + y + '</strong><button type="button" data-cal-nav="1" aria-label="Next month">›</button></div>' +
    '<div class="trip-idea-cal-grid">' + cells.join('') + '</div>' +
    '<p class="trip-idea-cal-sel" aria-live="polite"><span>' + _tripIdeaEsc(sel) + '</span>' + (from ? '<button type="button" class="trip-idea-linkish" data-cal-clear>Clear</button>' : '') + '</p>' +
    (any ? '<small class="trip-idea-cal-key">• = someone else is there that day</small>' : '') + '</div>';
}
function _tripIdeaCalHtml(sh, row, mine) {
  if (!sh.cal || sh.cal.code !== row.code) sh.cal = {code:row.code, month:tripIdeaCalendarStartMonth(sh.doc, mine), from:mine.available_from || '', to:mine.available_to || ''};
  var c = sh.cal;
  return tripIdeaRangeCalendarHtml(c.month, c.from, c.to, tripIdeaDayCounts(sh.doc, row.code), _tripIdeaTodayIso()) +
    '<input type="hidden" id="trip-idea-rsvp-from" value="' + _tripIdeaEsc(c.from) + '"><input type="hidden" id="trip-idea-rsvp-to" value="' + _tripIdeaEsc(c.to) + '">';
}
// Tap 1 = arrive, tap 2 = leave (a day before arrive restarts there), tap 3 starts over.
function tripIdeaCalendarTap(cal, iso) {
  if (!cal.from || cal.to || iso < cal.from) { cal.from = iso; cal.to = ''; }
  else cal.to = iso;
  return cal;
}
function _tripIdeaWireCal(sh) {
  var wrap = _tripIdeaEl('trip-idea-rsvp-cal-wrap'); if (!wrap || !sh.cal) return;
  var redraw = function(){
    var row = summarizeIdeaResponses(sh.doc).rows.filter(function(x){ return x.code === sh.cal.code; })[0];
    if (!row) return;
    wrap.innerHTML = _tripIdeaCalHtml(sh, row, {}); _tripIdeaWireCal(sh);
  };
  wrap.querySelectorAll('[data-cal-day]').forEach(function(b){ b.onclick = function(){ tripIdeaCalendarTap(sh.cal, b.getAttribute('data-cal-day')); redraw(); }; });
  wrap.querySelectorAll('[data-cal-nav]').forEach(function(b){ b.onclick = function(){
    var y = +sh.cal.month.slice(0, 4), m = +sh.cal.month.slice(5, 7) - 1 + Number(b.getAttribute('data-cal-nav'));
    var d = new Date(Date.UTC(y, m, 1)); sh.cal.month = d.toISOString().slice(0, 7); redraw();
  }; });
  wrap.querySelectorAll('[data-cal-clear]').forEach(function(b){ b.onclick = function(){ sh.cal.from = ''; sh.cal.to = ''; redraw(); }; });
}
// ── PIA-073: decision log — proposed → answered → chosen → booked (actual) ──
// The Worker record is the source of truth; this device also keeps a compact
// history of the ideas it organized so "how good were our estimates?" can be
// answered across trips (estimate at choice time vs what was actually paid).
var TRIP_IDEA_DECISIONS_STORAGE = 'pialax_decision_log_v1';
function tripIdeaDecisionEntry(doc) {
  var d = (doc && doc.decision) || {}, idea = (doc && doc.idea) || {}, r = idea.recommendation || {};
  return {id:doc && doc.id, title:idea.title || 'Trip idea', city:r.city || (idea.destination && idea.destination.city) || '',
    stage:ideaDecisionStage(doc), estimate_total:d.estimate_total == null ? (r.familyTotal != null ? r.familyTotal : r.totalFare == null ? null : r.totalFare) : d.estimate_total,
    actual_total:d.actual_total == null ? null : d.actual_total, delta_pct:d.delta_pct == null ? null : d.delta_pct,
    updated_at:(doc && (doc.updated_at || doc.created_at)) || new Date().toISOString()};
}
function tripIdeaDecisionLog() {
  var map = {}; try { map = JSON.parse(localStorage.getItem(TRIP_IDEA_DECISIONS_STORAGE)) || {}; } catch (e) {}
  return Object.keys(map).map(function(k){ return map[k]; }).sort(function(a,b){ return String(b.updated_at).localeCompare(String(a.updated_at)); });
}
function tripIdeaRecordDecision(doc) {
  if (!doc || !doc.id) return null;
  var map = {}; try { map = JSON.parse(localStorage.getItem(TRIP_IDEA_DECISIONS_STORAGE)) || {}; } catch (e) {}
  var entry = tripIdeaDecisionEntry(doc); map[doc.id] = entry;
  try { localStorage.setItem(TRIP_IDEA_DECISIONS_STORAGE, JSON.stringify(map)); } catch (e) {}
  return entry;
}
function tripIdeaDecisionStats(entries) {
  var list = Array.isArray(entries) ? entries : [], booked = list.filter(function(e){ return e.stage === 'booked'; });
  var deltas = booked.map(function(e){ return e.delta_pct; }).filter(function(x){ return typeof x === 'number' && isFinite(x); });
  var avg = deltas.length ? Math.round(deltas.reduce(function(a,b){ return a + b; }, 0) / deltas.length * 10) / 10 : null;
  return {count:list.length, booked:booked.length, dropped:list.filter(function(e){ return e.stage === 'dropped'; }).length, avgDeltaPct:avg};
}
function tripIdeaDecisionAction(action, amount) {
  var sh = _tripIdeaShared;
  if (!sh || !sh.doc || !sh.editKey) return Promise.resolve(null);
  var decision = action === 'choose' ? {stage:'chosen', chosen:tripIdeaChosenWithAnswers(sh.doc) || undefined} : action === 'drop' ? {stage:'dropped'} : action === 'reopen' ? {stage:'proposed'} : null;
  if (action === 'book') {
    var raw = amount != null ? amount : (_tripIdeaEl('trip-idea-actual') || {}).value;
    var actual = Math.round(Number(String(raw == null ? '' : raw).replace(/[$,\s]/g, '')));
    if (!(actual > 0)) { showShareToast('Enter what the trip actually cost in total'); return Promise.resolve(null); }
    decision = {stage:'booked', actual_total:actual};
  }
  if (!decision) return Promise.resolve(null);
  return _tripIdeaApi('POST', '/idea/update?id=' + encodeURIComponent(sh.id), {edit_key:sh.editKey, decision:decision}).then(function(res){
    if (res.ok && res.json && res.json.doc) {
      sh.doc = res.json.doc; tripIdeaRecordDecision(sh.doc); tripIdeaStoreDoc(sh.doc);
      showShareToast(action === 'book' ? '✓ Booked — estimate vs actual saved' : action === 'choose' ? '✓ Option chosen' : action === 'drop' ? '✓ Idea dropped' : '✓ Reopened');
      if (_tripIdeaBuilderStage === 'shared') renderTripIdeaBuilder();
      return sh.doc;
    }
    showShareToast(res.status === 403 ? 'Only the organizer can change the decision' : (res.json && res.json.error) || 'Could not save the decision');
    return null;
  });
}
function _tripIdeaMoney(v) { return v == null ? '—' : '$' + Number(v).toLocaleString('en-US'); }
function renderTripIdeaDecisionPanel(doc, isOrganizer) {
  var d = (doc && doc.decision) || {}, stage = ideaDecisionStage(doc), est = tripIdeaDecisionEntry(doc).estimate_total;
  var outcome = stage === 'booked' ? '<span>Booked for <strong>' + _tripIdeaMoney(d.actual_total) + '</strong> · estimate was ' + _tripIdeaMoney(est) +
    (d.delta_pct == null ? '' : ' · ' + (d.delta_pct > 0 ? '+' : '') + d.delta_pct + '% vs estimate') + '</span>' :
    stage === 'chosen' ? '<span>Chosen · estimate ' + _tripIdeaMoney(est) + ' — book each traveler in Google Flights, then record the total here.</span>' :
    stage === 'dropped' ? '<span>Dropped — kept in history.</span>' : '';
  if (!isOrganizer) return outcome ? '<div class="trip-idea-decision"><strong>Decision</strong>' + outcome + '</div>' : '';
  var btn = function(a, label, secondary){ return '<button type="button"' + (secondary ? ' class="secondary"' : '') + ' data-idea-action="' + a + '">' + _tripIdeaEsc(label) + '</button>'; };
  var controls = stage === 'proposed' || stage === 'answered' ? btn('choose', 'Choose this option') + btn('drop', 'Drop idea', true) :
    stage === 'chosen' ? '<label>Actual total paid<input id="trip-idea-actual" inputmode="numeric" placeholder="e.g. 1240"></label>' + btn('book', 'Mark booked') + btn('reopen', 'Reopen', true) :
    btn('reopen', 'Reopen', true);
  return '<div class="trip-idea-decision"><strong>Organizer decision</strong>' + outcome + '<div class="trip-idea-decision-row">' + controls + '</div></div>';
}
function tripIdeaHistoryHtml() {
  var log = tripIdeaDecisionLog(); if (!log.length) return '';
  var st = tripIdeaDecisionStats(log);
  return '<details class="trip-idea-options trip-idea-history"><summary>Past family decisions <span>' + st.count + ' idea' + (st.count === 1 ? '' : 's') +
    (st.avgDeltaPct == null ? '' : ' · actual vs estimate ' + (st.avgDeltaPct > 0 ? '+' : '') + st.avgDeltaPct + '%') + '</span></summary><ul>' +
    log.slice(0, 12).map(function(e){
      return '<li><button type="button" data-idea-open="' + _tripIdeaEsc(e.id) + '"><strong>' + _tripIdeaEsc(e.title) + '</strong> · ' + _tripIdeaEsc(e.stage) +
        ' · est ' + _tripIdeaEsc(_tripIdeaMoney(e.estimate_total)) + (e.actual_total == null ? '' : ' → paid ' + _tripIdeaEsc(_tripIdeaMoney(e.actual_total))) + '</button></li>';
    }).join('') + '</ul></details>';
}

// PIA-081: the organizer ("Me" in FAMILY_INFO) proposed the trip, so they are
// "in" from the start — they never show as waiting and are never nudged.
function _tripIdeaIsOrganizer(label) { return label === 'Me'; }
function _tripIdeaAnswerAsOrganizer(doc) {
  var me = ((doc && doc.idea && doc.idea.members) || []).filter(function(m){ return _tripIdeaIsOrganizer(m.label); })[0];
  if (!me || (doc.responses && doc.responses[me.code])) return Promise.resolve(doc);
  return _tripIdeaApi('POST', '/idea/respond?id=' + encodeURIComponent(doc.id), {member:me.code, status:'in'}).then(function(res){
    var next = res.ok && res.json && res.json.doc ? res.json.doc : doc;
    if (typeof tripIdeaStoreDoc === 'function') tripIdeaStoreDoc(next);
    if (typeof tripIdeaMarkSeen === 'function') tripIdeaMarkSeen(next); // your own "in" isn't news
    return next;
  });
}

// ── PIA-076: shared ideas ↔ Trip Ideas cards ────────────────────────────────
// A watchlist item carries `sharedIdeaId` once the family has been asked. The
// card shows a live RSVP chip (cached GET /idea, ≤ 1 fetch per idea per 5 min)
// and actions to open answers or ask the family for an unlinked trip.
var TRIP_IDEA_ID_RE = /^[A-Za-z0-9_-]{22}$/;
var TRIP_IDEA_DOC_TTL_MS = 5 * 60 * 1000;
var _tripIdeaDocCache = {}; // id → {doc, ts, pending}
function tripIdeaCachedDoc(id) { var c = _tripIdeaDocCache[id]; return c && c.doc ? c.doc : null; }
function tripIdeaFetchDoc(id, force) {
  if (!TRIP_IDEA_ID_RE.test(String(id || ''))) return Promise.resolve(null);
  var c = _tripIdeaDocCache[id] || (_tripIdeaDocCache[id] = {doc:null, ts:0, pending:null});
  if (c.pending) return c.pending;
  if (!force && c.ts && Date.now() - c.ts < TRIP_IDEA_DOC_TTL_MS) return Promise.resolve(c.doc);
  c.pending = _tripIdeaApi('GET', '/idea?id=' + encodeURIComponent(id)).then(function(res){
    var before = c.doc && c.doc.updated_at;
    c.pending = null; c.ts = Date.now();
    if (res.ok && res.json && res.json.doc) c.doc = res.json.doc;
    if (c.doc && c.doc.updated_at !== before && typeof renderWatchlist === 'function') { try { renderWatchlist(); } catch (e) {} }
    return c.doc;
  });
  return c.pending;
}
function tripIdeaStoreDoc(doc) { if (doc && doc.id) _tripIdeaDocCache[doc.id] = {doc:doc, ts:Date.now(), pending:null}; }
function tripIdeaRsvpChipHtml(item) {
  if (!item || !item.sharedIdeaId) return '';
  var doc = tripIdeaCachedDoc(item.sharedIdeaId);
  tripIdeaFetchDoc(item.sharedIdeaId);
  var txt = '👥 checking answers…';
  if (doc) {
    var s = summarizeIdeaResponses(doc);
    txt = s.stage === 'booked' ? '👥 booked' : s.stage === 'dropped' ? '👥 dropped' :
      '👥 ' + s.counts.in + ' in · ' + s.counts.maybe + ' maybe · ' + s.counts.out + ' out' + (s.counts.pending ? ' · ' + s.counts.pending + ' waiting' : '') +
      (function(){ var b = tripIdeaBookedCount(doc); return b.booked ? ' · ✈️ ' + b.booked + ' booked' : ''; })();
  }
  var fresh = typeof tripIdeaHasNewAnswers === 'function' && doc && tripIdeaHasNewAnswers(doc);
  return '<div class="wl-rsvp-chip">' + _tripIdeaEsc(txt) + (fresh ? ' <b class="wl-rsvp-new" title="New answers since you last looked">● new</b>' : '') + '</div>';
}
// Builder-saved items keep their recommendation; others are rebuilt from card fields.
function tripIdeaPayloadFromItem(item) {
  var bm = item.builderMetadata || {}, iata = /^[A-Z]{3}$/;
  var airport = [item.gf && item.gf.to, item.hub, item.dest].filter(function(x){ return iata.test(String(x || '')); })[0] || '';
  var rec = bm.recommendation && bm.recommendation.airport ? Object.assign({}, bm.recommendation) :
    {city:item.title, airport:airport, alternatives:[], hub:'', departure:item.dep || '', return:item.ret || '', totalFare:null, perTicketFare:null, headcount:1, priceStatus:'estimated'};
  if (item.dep) rec.departure = item.dep;
  if (item.ret) rec.return = item.ret;
  var builder = createTripIdeaBuilderState({destination:{city:item.title, airport:airport}, dates:{departure:item.dep || '', return:item.ret || ''}});
  var payload = buildSharedIdeaPayload(builder, rec.airport ? rec : null, item.notes || '');
  payload.title = String(item.title || payload.title).replace(/\s*·\s*Trip idea$/, '').slice(0, 80);
  if (!rec.airport) payload.recommendation = null;
  return payload;
}
function tripIdeaLinkItem(item, id) {
  if (!item || !TRIP_IDEA_ID_RE.test(String(id || ''))) return;
  item.sharedIdeaId = id;
  if (item._added && item.mode !== 'family') {
    item.mode = 'family';
    if (!item.hub && /^[A-Z]{3}$/.test(String(item.dest || ''))) item.hub = item.dest;
  }
  if (typeof saveWatchlist === 'function') saveWatchlist();
}
function tripIdeaAskFamily(itemId) {
  var item = typeof watchlistItem === 'function' ? watchlistItem(itemId) : null;
  if (!item) return Promise.resolve(null);
  if (item.sharedIdeaId) return Promise.resolve(item.sharedIdeaId);
  var payload = tripIdeaPayloadFromItem(item);
  return _tripIdeaApi('POST', '/idea', {idea:payload}).then(function(res){
    if (!res.ok || !res.json || !res.json.id) { showShareToast(res.status === 501 ? 'Shared RSVPs are not set up on the Worker yet' : 'Could not create the RSVP link — try again'); return null; }
    _tripIdeaSaveKey(res.json.id, res.json.edit_key, payload.title);
    tripIdeaStoreDoc(res.json.doc); tripIdeaRecordDecision(res.json.doc);
    tripIdeaLinkItem(item, res.json.id);
    return _tripIdeaAnswerAsOrganizer(res.json.doc).then(function(doc){
      if (typeof renderWatchlist === 'function') renderWatchlist();
      tripIdeaSendInvite(doc);
      return res.json.id;
    });
  });
}
// ── PIA-078: distribution to the family group text ─────────────────────────
// Phones open the native share sheet (iMessage / WhatsApp / etc.); anything
// without navigator.share copies the same text + link. Text and url are passed
// separately so Messages renders one link preview instead of a duplicate.
var TRIP_IDEA_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// PIA-110: dates say the weekday — "Fri Nov 20 – Sun Nov 29".
var TRIP_IDEA_WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function tripIdeaDay(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  return TRIP_IDEA_WEEKDAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] + ' ' + TRIP_IDEA_MONTHS[+m[2] - 1] + ' ' + (+m[3]);
}
function tripIdeaDateRange(dep, ret) {
  var a = tripIdeaDay(dep), b = tripIdeaDay(ret);
  if (!a) return 'dates TBD';
  return b && ret !== dep ? a + ' – ' + b : a;
}
// PIA-098: a rough time of month ("late Nov"), never exact days — each person
// picks their own arrive/leave dates in the RSVP.
function tripIdeaLooseWhen(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  var day = +m[3];
  return (day <= 10 ? 'early ' : day <= 20 ? 'mid-' : 'late ') + TRIP_IDEA_MONTHS[+m[2] - 1];
}
// PIA-098: the group text carries no price and no exact dates — people come and
// go on their own dates, and the cost is the organizer's to weigh.
function tripIdeaShareText(doc, kind) {
  var idea = (doc && doc.idea) || {}, r = idea.recommendation || {}, d = idea.dates || {};
  var title = String(idea.title || 'Trip idea').replace(/\s+trip$/i, '');
  if (/^[A-Za-z0-9]/.test(title)) title = '✈️ ' + title; // titles that open with their own emoji keep it
  var when = tripIdeaLooseWhen(r.departure || d.departure || d.searchStart);
  if (kind === 'nudge') {
    var waiting = summarizeIdeaResponses(doc).rows.filter(function(x){ return x.status === 'pending' && !_tripIdeaIsOrganizer(x.label); }).map(function(x){ return x.label; });
    // PIA-106: once everyone has answered, the nudge is about booking.
    var unbooked = !waiting.length && tripIdeaCanBook() ? tripIdeaBookedCount(doc).unbooked : [];
    if (unbooked.length) return title + (when ? ' (' + when + ')' : '') + ' — ' + unbooked.join(' and ') + ', have you booked? Tap your ✈️ flight button, then “I booked ✓”:';
    return title + (when ? ' (' + when + ')' : '') + ' — still need an answer from ' + (waiting.length ? waiting.join(' and ') : 'everyone') + '. In / maybe / out, and your dates?';
  }
  return title + (when ? ' · ' + when : '') + '. Come and go on your own dates — tap to say in / maybe / out and when you’d be there:';
}
function tripIdeaDistribute(title, text, url) {
  var nav = typeof navigator !== 'undefined' ? navigator : null;
  var copy = function(){ _tripIdeaCopy(text + '\n' + url); showShareToast('✓ Copied — paste it into the family group text'); return 'copied'; };
  if (nav && typeof nav.share === 'function') {
    return Promise.resolve().then(function(){ return nav.share({title:title, text:text, url:url}); })
      .then(function(){ showShareToast('✓ Sent'); return 'shared'; })
      .catch(function(err){ return err && err.name === 'AbortError' ? 'cancelled' : copy(); });
  }
  return Promise.resolve(copy());
}
function tripIdeaSendInvite(doc, kind) {
  var url = tripIdeaInviteUrl(doc.id);
  return tripIdeaDistribute((doc.idea && doc.idea.title) || 'Trip idea', tripIdeaShareText(doc, kind || 'invite'), url).then(function(){ return url; });
}
function tripIdeaNudge(id) {
  var doc = tripIdeaCachedDoc(id) || (_tripIdeaShared && _tripIdeaShared.id === id ? _tripIdeaShared.doc : null);
  if (!doc) return Promise.resolve(null);
  return tripIdeaSendInvite(doc, 'nudge');
}
// Calendar hold for the proposed dates, with the RSVP link inside the event.
// PIA-102: or for the family's best window (`win`), which replaces the hold.
function tripIdeaHoldDates(itemId, win) {
  var item = typeof watchlistItem === 'function' ? watchlistItem(itemId) : null;
  if (!item || !item.sharedIdeaId) return null;
  var doc = tripIdeaCachedDoc(item.sharedIdeaId), r = (doc && doc.idea && doc.idea.recommendation) || {};
  var dep = win ? win.from : item.dep || r.departure, ret = win ? win.to : item.ret || r.return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dep || ''))) { showShareToast('Add trip dates first'); return null; }
  var url = tripIdeaInviteUrl(item.sharedIdeaId);
  if (win) item.calendarEvents = [];
  if (!(Array.isArray(item.calendarEvents) && item.calendarEvents.length)) {
    item.calendarEvents = [{title:'✈️ ' + String(item.title || 'Family trip').replace(/\s*·\s*Trip idea$/, '') + (win ? ' (family window)' : ' (proposed — RSVP)'), start:dep,
      end:typeof _wlNextDay === 'function' ? _wlNextDay(ret || dep) : (ret || dep), location:(r.city || item.hub || ''), notes:'Are you in? Answer here: ' + url}];
    if (typeof saveWatchlist === 'function') saveWatchlist();
  }
  if (typeof addWatchlistTripToCalendar === 'function') addWatchlistTripToCalendar(item.id);
  return item.calendarEvents;
}
function tripIdeaHoldWindow(ideaId, win) {
  var item = (typeof WATCHLIST !== 'undefined' && Array.isArray(WATCHLIST) ? WATCHLIST : []).filter(function(t){ return t && t.sharedIdeaId === ideaId; })[0];
  if (!item) { showShareToast('Open this trip from your Trips card on this device to add it to your calendar'); return null; }
  return tripIdeaHoldDates(item.id, win);
}
// Card actions (expanded card). Family trips and builder ideas can ask the family.
function tripIdeaCardActionsHtml(item) {
  if (!item || item.stage === 'completed') return '';
  var b = function(cls, label){ return '<button type="button" class="' + cls + ' wl-act" data-id="' + _tripIdeaEsc(item.id) + '" style="color:var(--accent);border:1px solid var(--accent);">' + label + '</button>'; };
  if (item.sharedIdeaId) {
    var doc = tripIdeaCachedDoc(item.sharedIdeaId), pending = doc ? summarizeIdeaResponses(doc).rows.filter(function(x){ return x.status === 'pending' && !_tripIdeaIsOrganizer(x.label); }).length : 0;
    // PIA-107: two buttons lead — the RSVP (answers, overlap, booking) and one
    // Share that says what it will send. The rest lives in tripIdeaCardMoreHtml.
    var unbooked = doc && tripIdeaCanBook() ? tripIdeaBookedCount(doc).unbooked.length : 0;
    var shareLbl = pending ? '📤 Nudge ' + pending + ' waiting' : unbooked ? '📤 Nudge ' + unbooked + ' to book' : '📤 Share invite';
    return b('wl-idea-open wl-idea-main', '👥 Family RSVP') + b('wl-idea-share', shareLbl);
  }
  if (item.mode === 'family' || item.builderMetadata) return b('wl-idea-ask', '👥 Ask the family');
  return '';
}
function tripIdeaCardMoreHtml(item) {
  if (!item || !item.sharedIdeaId || item.stage === 'completed') return '';
  var b = function(cls, label){ return '<button type="button" class="' + cls + ' wl-act" data-id="' + _tripIdeaEsc(item.id) + '" style="color:var(--accent);border:1px solid var(--accent);">' + label + '</button>'; };
  var hasKey = !!(_tripIdeaKeys()[item.sharedIdeaId] || {}).edit_key;
  return b('wl-idea-hold', '📅 Hold the dates') + (hasKey ? b('wl-idea-key', '🔑 Organizer link') : '');
}
// Share = the right message for where things stand: who hasn't answered, then
// who hasn't booked, else the plain invite.
function tripIdeaShareCard(id) {
  var doc = tripIdeaCachedDoc(id);
  if (!doc) return Promise.resolve(null);
  var waiting = summarizeIdeaResponses(doc).rows.some(function(x){ return x.status === 'pending' && !_tripIdeaIsOrganizer(x.label); });
  var unbooked = tripIdeaCanBook() && tripIdeaBookedCount(doc).unbooked.length;
  return tripIdeaSendInvite(doc, waiting || unbooked ? 'nudge' : 'invite');
}
function tripIdeaWireCardActions(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('.wl-idea-open').forEach(function(el){ el.addEventListener('click', function(e){ e.stopPropagation(); var t = watchlistItem(el.getAttribute('data-id')); if (t && t.sharedIdeaId) _tripIdeaOpenRemote(t.sharedIdeaId); }); });
  root.querySelectorAll('.wl-idea-nudge').forEach(function(el){ el.addEventListener('click', function(e){ e.stopPropagation(); var t = watchlistItem(el.getAttribute('data-id')); if (t && t.sharedIdeaId) tripIdeaNudge(t.sharedIdeaId); }); });
  root.querySelectorAll('.wl-idea-hold').forEach(function(el){ el.addEventListener('click', function(e){ e.stopPropagation(); tripIdeaHoldDates(el.getAttribute('data-id')); }); });
  root.querySelectorAll('.wl-idea-share').forEach(function(el){ el.addEventListener('click', function(e){ e.stopPropagation(); var t = watchlistItem(el.getAttribute('data-id')); if (t && t.sharedIdeaId) tripIdeaShareCard(t.sharedIdeaId); }); });
  root.querySelectorAll('.wl-idea-key').forEach(function(el){ el.addEventListener('click', function(e){ e.stopPropagation(); var t = watchlistItem(el.getAttribute('data-id')); if (t && t.sharedIdeaId) tripIdeaCopyOrganizerLink(t.sharedIdeaId); }); });
  root.querySelectorAll('.wl-idea-ask').forEach(function(el){ el.addEventListener('click', function(e){ e.stopPropagation(); tripIdeaAskFamily(el.getAttribute('data-id')); }); });
}

// ── PIA-077: shared answers drive Family Plan ───────────────────────────────
// Opening a linked card in Family Plan sets S.linkedIdeaId; the family's own
// answers then fill S.memberStatus (maybe → 'tentative', the PIA-023 value), so
// computeRanking / memberCostsFor exclude "out" with no new math. Selectors turn
// into read-only "answered" labels, and these statuses never go into ms=.
// A person keeps one identity across a home move (JAX → LGA), so answers are
// matched by FAMILY base code, then written under the code in use for S.depDate.
function _tripIdeaPersonBase(code) {
  var fam = typeof FAMILY !== 'undefined' ? FAMILY : [], info = typeof FAMILY_INFO !== 'undefined' ? FAMILY_INFO : {};
  for (var i = 0; i < fam.length; i++) { var b = fam[i], x = info[b] || {}; if (code === b || code === x.moveAirport) return b; }
  return code;
}
function memberStatusFromIdea(doc, depDate) {
  var resp = (doc && doc.responses) || {}, out = {}, current = typeof familyForDate === 'function' ? familyForDate(depDate || undefined) : [];
  var byBase = {}; (current || []).forEach(function(c){ byBase[_tripIdeaPersonBase(c)] = c; });
  Object.keys(resp).forEach(function(code){
    var r = resp[code], target = byBase[_tripIdeaPersonBase(code)];
    if (!r || !target) return;
    out[target] = r.status === 'maybe' ? 'tentative' : r.status === 'out' ? 'out' : 'in';
  });
  return out;
}
function tripIdeaApplyLinkedRsvp() {
  var id = typeof S === 'object' && S ? S.linkedIdeaId : null;
  if (!id) return Promise.resolve(null);
  var apply = function(doc){
    if (!doc || S.linkedIdeaId !== id) return null;
    // PIA-120: the RSVP's plan dates are the trip's dates — the Family math
    // follows them instead of whatever the dashboard had selected.
    var plan = tripIdeaPlanDates(doc);
    if (plan) { S.depDate = new Date(plan.dep + 'T12:00:00'); S.retDate = plan.ret ? new Date(plan.ret + 'T12:00:00') : null; }
    var st = memberStatusFromIdea(doc, S.depDate), ms = {};
    Object.keys(st).forEach(function(c){ if (st[c] !== 'in') ms[c] = st[c]; });
    S.memberStatus = ms;
    S.tentativeMembers = Object.keys(ms).filter(function(k){ return ms[k] === 'tentative'; });
    // PIA-083: each person's own travel dates → S.memberDates (effectiveDatesFor prices them).
    var ad = tripIdeaAnswerDates(doc), md = {}, cur = typeof familyForDate === 'function' ? familyForDate(S.depDate || undefined) : [];
    var tripDep = S.depDate && typeof fmtISO === 'function' ? fmtISO(S.depDate) : '', tripRet = S.retDate && typeof fmtISO === 'function' ? fmtISO(S.retDate) : '';
    (cur || []).forEach(function(code){
      var d = ad[_tripIdeaPersonBase(code)];
      if (d && (d.dep !== tripDep || (d.ret || '') !== tripRet)) md[code] = {dep:new Date(d.dep + 'T12:00:00'), ret:d.ret ? new Date(d.ret + 'T12:00:00') : null};
    });
    S.memberDates = md;
    try { if (typeof loadPrices === 'function') loadPrices(); } catch (e) {} // cache-only: zero quota
    try { if (typeof renderMeetupStrip === 'function') renderMeetupStrip(); if (typeof renderMeetupRoutes === 'function') renderMeetupRoutes(); if (typeof redrawMap === 'function') redrawMap(); } catch (e) {}
    try { if (typeof syncLinkedTripChrome === 'function') syncLinkedTripChrome(); if (typeof updateDateUI === 'function') updateDateUI(); } catch (e) {}
    return ms;
  };
  var cached = tripIdeaCachedDoc(id);
  if (cached) apply(cached);
  return tripIdeaFetchDoc(id).then(apply);
}
function _tripIdeaLinkedAnswer(code) {
  var doc = S && S.linkedIdeaId ? tripIdeaCachedDoc(S.linkedIdeaId) : null;
  if (!doc) return null;
  var base = _tripIdeaPersonBase(code), resp = doc.responses || {};
  var hit = Object.keys(resp).filter(function(k){ return _tripIdeaPersonBase(k) === base; })[0];
  return hit ? resp[hit] : null;
}
function tripIdeaLinkedStatusHtml(code) {
  var r = _tripIdeaLinkedAnswer(code);
  var txt = !r ? '⏳ waiting' : r.status === 'in' ? '✅ in' : r.status === 'maybe' ? '🤔 maybe' : '✖ out';
  var col = !r ? 'var(--ink-muted)' : r.status === 'in' ? 'var(--success)' : r.status === 'maybe' ? 'var(--warn)' : 'var(--danger)';
  return '<span class="gc-status-linked" title="' + (r ? 'Answered on the family RSVP link' : 'No answer yet on the family RSVP link') + '" style="font-size:var(--fs-micro);font-weight:800;color:' + col + ';margin-left:4px;">' + txt + (r ? ' · answered' : '') + '</span>';
}
function tripIdeaLinkedNoteHtml() {
  return '<div class="gc-linked-note" style="font-size:var(--fs-micro);color:var(--ink-muted);margin:-2px 0 6px;">Using the family’s RSVP answers · <button type="button" class="gc-unlink" style="font:inherit;font-weight:800;color:var(--accent);background:none;border:none;padding:0;cursor:pointer;">switch to what-if</button></div>';
}
function tripIdeaWireLinkedNote(panel) {
  if (!panel || !panel.querySelectorAll) return;
  panel.querySelectorAll('.gc-unlink').forEach(function(b){ b.addEventListener('click', function(){
    S.linkedIdeaId = null; S.memberStatus = {}; S.tentativeMembers = []; S.memberDates = {};
    if (typeof renderMeetupStrip === 'function') renderMeetupStrip(); if (typeof renderMeetupRoutes === 'function') renderMeetupRoutes(); if (typeof redrawMap === 'function') redrawMap();
    showShareToast('What-if mode — set in / maybe / out yourself');
  }); });
}

// ── PIA-079: RSVP answers feed the trip assistant + "new answers" dot ───────
// Linked cards' trip state gets companions from real answers (in → confirmed,
// maybe / no answer → tentative, out → out), so the existing COORDINATE step
// says "Confirm Anjo before booking" from what people actually said. The
// organizer ("Me") is not their own companion. Pure: reads the cache only.
var TRIP_IDEA_SEEN_STORAGE = 'pialax_idea_seen_v1';
function tripIdeaCompanionsFromDoc(doc) {
  if (!doc) return [];
  return summarizeIdeaResponses(doc).rows.filter(function(r){ return r.label !== 'Me'; }).map(function(r){
    var status = r.status === 'in' || r.status === 'hosting' ? 'confirmed' : r.status === 'out' ? 'out' : 'tentative';
    return {label:r.label, status:status, confidence:1, is_inferred:false,
      source_text:r.status === 'pending' ? 'No answer yet on the family RSVP link' : 'Answered "' + r.status + '" on the family RSVP link'};
  });
}
function tripIdeaAugmentTripState(item, st) {
  if (!item || !item.sharedIdeaId || !st) return st;
  var doc = tripIdeaCachedDoc(item.sharedIdeaId);
  if (!doc) return st;
  var fromIdea = tripIdeaCompanionsFromDoc(doc), have = {};
  fromIdea.forEach(function(c){ have[String(c.label).toLowerCase()] = true; });
  st.companions = (st.companions || []).filter(function(c){ return !(c && have[String(c.label || '').toLowerCase()]); }).concat(fromIdea);
  return st;
}
function _tripIdeaSeen() { try { return JSON.parse(localStorage.getItem(TRIP_IDEA_SEEN_STORAGE)) || {}; } catch (e) { return {}; } }
function _tripIdeaLastAnswerAt(doc) {
  var last = ''; ((doc && doc.log) || []).forEach(function(l){ if (/^rsvp:/.test(l.event || '') && l.at > last) last = l.at; });
  return last;
}
function tripIdeaHasNewAnswers(doc) {
  var last = _tripIdeaLastAnswerAt(doc);
  return !!last && last > (_tripIdeaSeen()[doc.id] || '');
}
function tripIdeaMarkSeen(doc) {
  if (!doc || !doc.id) return;
  var seen = _tripIdeaSeen(), last = _tripIdeaLastAnswerAt(doc);
  if (!last || seen[doc.id] === last) return;
  seen[doc.id] = last;
  try { localStorage.setItem(TRIP_IDEA_SEEN_STORAGE, JSON.stringify(seen)); } catch (e) {}
}

// ── PIA-080: close the loop at booking ──────────────────────────────────────
// Moving a linked card to "booked" asks once for the whole-trip total and
// records it on the shared idea (choosing the proposal first if needed), so
// the decision log fills without reopening the builder. Organizer device only.
function tripIdeaUpdateDecision(id, editKey, decision) {
  return _tripIdeaApi('POST', '/idea/update?id=' + encodeURIComponent(id), {edit_key:editKey, decision:decision}).then(function(res){
    if (res.ok && res.json && res.json.doc) { tripIdeaStoreDoc(res.json.doc); tripIdeaRecordDecision(res.json.doc); return res.json.doc; }
    return null;
  });
}
function tripIdeaPromptActual(item, amount) {
  if (!item || !item.sharedIdeaId) return Promise.resolve(null);
  var id = item.sharedIdeaId, key = (_tripIdeaKeys()[id] || {}).edit_key;
  if (!key) { showShareToast('✓ Booked — record the total from the organizer’s device'); return Promise.resolve(null); }
  var raw = amount;
  if (raw == null && typeof window !== 'undefined' && typeof window.prompt === 'function') raw = window.prompt('What did the whole trip cost for everyone? (Leave blank to skip)', '');
  var actual = Math.round(Number(String(raw == null ? '' : raw).replace(/[$,\s]/g, '')));
  if (!(actual > 0)) return Promise.resolve(null);
  return tripIdeaFetchDoc(id, true).then(function(doc){
    var stage = doc ? ideaDecisionStage(doc) : 'proposed';
    return stage === 'chosen' || stage === 'booked' ? doc : tripIdeaUpdateDecision(id, key, {stage:'chosen', chosen:tripIdeaChosenWithAnswers(doc) || undefined});
  }).then(function(doc){
    if (!doc) { showShareToast('Could not record the total — try again from See answers'); return null; }
    return tripIdeaUpdateDecision(id, key, {stage:'booked', actual_total:actual}).then(function(done){
      if (done) { var d = done.decision || {}; showShareToast('✓ Recorded $' + actual.toLocaleString('en-US') + (d.delta_pct == null ? '' : ' · ' + (d.delta_pct > 0 ? '+' : '') + d.delta_pct + '% vs estimate')); }
      if (typeof renderWatchlist === 'function') try { renderWatchlist(); } catch (e) {}
      return done;
    });
  });
}

// ── PIA-121: a linked trip, priced the way people book it ───────────────────
// Each traveler's RSVP row becomes their real legs: in to PIA and home from ORD
// are two one-ways (one round trip when it's the same airport both ways), on
// their own dates. Prices come from the 24h cache or a ~$ day-of-week estimate;
// tripLegsFetch is the one path that spends, and only on a button press.
var TRIP_LEG_CALLS_PER_PRESS = 4; // one full re-price: two travelers × in + home
var TRIP_LEG_FLEX_DAYS = [-1, 0, 1], TRIP_LEG_FLEX_WIDE = [-2, -1, 0, 1, 2];
// SerpAPI google_flights → what the dashboard keeps. best_flights[0] stays the
// headline price (unchanged meaning); the best and cheapest few offers, Google's
// price insights and its own results link ride along. Self-contained on purpose:
// test-trust runs fetchFlights + this function alone in a sandbox.
function tripFareParse(json) {
  var j = json && typeof json === 'object' ? json : {};
  var top = Array.isArray(j.best_flights) ? j.best_flights : [], more = Array.isArray(j.other_flights) ? j.other_flights : [];
  var best = top[0] || more[0] || null;
  if (!best || typeof best.price !== 'number') return null;
  function offer(o) {
    var segs = Array.isArray(o.flights) ? o.flights : [], a = segs[0] || {}, z = segs[segs.length - 1] || {};
    var da = a.departure_airport || {}, za = z.arrival_airport || {};
    return {price:o.price, airline:a.airline || null, flightNos:segs.map(function(s){ return s && s.flight_number; }).filter(Boolean).slice(0, 4),
      depAirport:da.id || '', arrAirport:za.id || '', depTime:da.time || '', arrTime:za.time || '',
      stops:segs.length > 1 ? segs.length - 1 : 0, durMin:Number(o.total_duration) || null};
  }
  var all = top.concat(more).filter(function(o){ return o && typeof o.price === 'number' && o.price > 0; }).map(offer);
  var offers = all.slice(0, 1).concat(all.slice(1).sort(function(a, b){ return a.price - b.price; })).slice(0, 6);
  // PIA-122: the cheapest fare from / to each airport (a nearby search covers several).
  var byDep = {}, byArr = {};
  all.forEach(function(o){
    if (o.depAirport && !(byDep[o.depAirport] <= o.price)) byDep[o.depAirport] = o.price;
    if (o.arrAirport && !(byArr[o.arrAirport] <= o.price)) byArr[o.arrAirport] = o.price;
  });
  var segs = Array.isArray(best.flights) ? best.flights : [], first = segs[0] || {};
  var back = Array.isArray(best.return_flights) ? best.return_flights : [], bf = back[0] || {};
  var pi = j.price_insights && typeof j.price_insights === 'object' ? j.price_insights : null, insights = null;
  if (pi) {
    var tr = Array.isArray(pi.typical_price_range) ? pi.typical_price_range.map(Number) : [];
    var hist = (Array.isArray(pi.price_history) ? pi.price_history : []).filter(function(p){ return Array.isArray(p) && Number(p[0]) > 0 && Number(p[1]) > 0; })
      .map(function(p){ var t = Number(p[0]); return [t < 1e12 ? t * 1000 : t, Number(p[1])]; }).slice(-30);
    insights = {level:typeof pi.price_level === 'string' ? pi.price_level : '', low:Number(pi.lowest_price) || null,
      typical:tr.length === 2 && tr[0] > 0 && tr[1] >= tr[0] ? tr : null, hist:hist};
  }
  var gf = j.search_metadata && typeof j.search_metadata.google_flights_url === 'string' ? j.search_metadata.google_flights_url : '';
  if (gf.indexOf('https://www.google.com/travel/flights?') !== 0 || /[\s<>]/.test(gf)) gf = '';
  return {price:best.price, airline:first.airline || null, flightNo:first.flight_number || null, airlineLogo:first.airline_logo || best.airline_logo || null,
    stops:segs.length > 1 ? segs.length - 1 : 0, returnAirline:bf.airline || null, returnFlightNo:bf.flight_number || null,
    returnAirlineLogo:bf.airline_logo || null, returnStops:back.length > 1 ? back.length - 1 : 0, offers:offers, insights:insights, gfUrl:gf, byDep:byDep, byArr:byArr};
}
// One traveler's legs, exactly what their booking links search (tripIdeaLegLinks).
// PIA-122: with `nearby`, a one-way leg searches the traveler's whole metro
// (searchFrom / searchTo, e.g. BUR,LAX,LGB,ONT,SNA) in the same one search.
function tripLegsForRow(r, nearby) {
  if (!r || !r.dep || !r.links) return [];
  var l = r.links, hc = r.headcount || 1, ret = r.ret && r.ret >= r.dep ? r.ret : '', g = nearby ? tripNearbyGroup(r.from) : [], metro = g.length > 1 ? g.join(',') : '';
  if (l.round) return [{code:r.code, dir:ret ? 'round' : 'in', from:r.from, to:l.to, date:r.dep, ret:ret, headcount:hc, searchFrom:!ret && metro ? metro : ''}];
  return [{code:r.code, dir:'in', from:r.from, to:l.to, date:r.dep, ret:'', headcount:hc, searchFrom:metro},
    {code:r.code, dir:'home', from:l.back, to:r.from, date:ret, ret:'', headcount:hc, searchTo:metro}];
}
function tripLegsFor(doc) {
  return doc ? tripIdeaBookRows(doc).map(function(r){
    return {code:r.code, label:r.label, headcount:r.headcount, booked:r.booked, from:r.from, row:r, legs:tripLegsForRow(r, tripCanNearby() && tripNearbyOn(doc.id, r.code))};
  }) : [];
}
function tripLinkedDoc() { return typeof S === 'object' && S && S.linkedIdeaId ? tripIdeaCachedDoc(S.linkedIdeaId) : null; }
function tripLinkedTraveler(code) {
  var base = _tripIdeaPersonBase(code);
  return tripLegsFor(tripLinkedDoc()).filter(function(t){ return _tripIdeaPersonBase(t.code) === base; })[0] || null;
}
// Every unbooked traveler's legs on their own dates — what Get Live Fares prices.
function tripLinkedPlanLegs() {
  var out = [];
  tripLegsFor(tripLinkedDoc()).forEach(function(t){ if (!t.booked) out = out.concat(t.legs); });
  return out;
}
function _tripLegKey(leg) { return typeof _cacheKey === 'function' && leg && leg.date ? _cacheKey(leg.searchFrom || leg.from, leg.searchTo || leg.to, leg.date, leg.dir === 'round' ? leg.ret : '') : ''; }
function _tripLegHit(leg) {
  var cache = typeof _flightCache === 'object' && _flightCache ? _flightCache : {}, ttl = typeof FLIGHT_CACHE_TTL_MS === 'number' ? FLIGHT_CACHE_TTL_MS : 0, hit = cache[_tripLegKey(leg)];
  return hit && hit.data && hit.data.live && Date.now() - hit.ts < ttl ? hit : null;
}
// Zero-spend price for one leg: a live fare from the 24h cache, else the
// sample fare × the calendar's day-of-week tier (shown as ~$), else none.
function tripLegPrice(leg) {
  var none = {price:null, status:'none', lastVerified:null, data:null};
  if (!leg || !leg.date) return none;
  var rt = leg.dir === 'round' && !!leg.ret, hit = _tripLegHit(leg), byFrom = !!leg.searchFrom && leg.searchFrom !== leg.from, byTo = !!leg.searchTo && leg.searchTo !== leg.to;
  if (hit) {
    var v = Number(rt ? hit.data.rt : hit.data.ow);
    // PIA-122: a nearby search priced several airports — use the chosen one's own fare.
    if (byFrom || byTo) v = Number(((byFrom ? hit.data.byDep : hit.data.byArr) || {})[byFrom ? leg.from : leg.to]) || 0;
    if (v > 0) return {price:v, status:'live', lastVerified:hit.data.lastVerified || null, data:hit.data};
  }
  if (byFrom || byTo) { var own = tripLegPrice(Object.assign({}, leg, {searchFrom:'', searchTo:''})); if (own.status === 'live') return own; }
  var m = typeof getMock === 'function' ? getMock(leg.from, leg.to) : null, base = m ? Number(rt ? m.rt : m.ow) || 0 : 0;
  if (!(base > 0)) return none;
  var day = _tripIdeaDate(leg.date);
  return {price:day && typeof tier === 'function' && typeof dayPrice === 'function' ? dayPrice(base, tier(day)) : base, status:'estimate', lastVerified:null, data:null};
}
function tripTravelerCost(t) {
  if (!t || !t.legs || !t.legs.length) return null;
  var parts = t.legs.map(function(l){ return {leg:l, p:tripLegPrice(l)}; }), sum = 0, live = 0, missing = 0;
  parts.forEach(function(x){ if (x.p.price == null) missing++; else { sum += x.p.price; if (x.p.status === 'live') live++; } });
  return {per:missing ? null : sum, total:missing ? null : sum * (t.headcount || 1), parts:parts,
    status:missing ? 'none' : live === parts.length ? 'live' : live ? 'mixed' : 'estimate'};
}
// The linked traveler's cost — only while the dashboard's hub is the trip's own.
function tripLinkedCostFor(code, hub) {
  var doc = tripLinkedDoc(); if (!doc) return null;
  var dest = _tripIdeaDestAirport(doc);
  if (hub && hub !== dest && tripIdeaAltAirports(dest).indexOf(hub) < 0) return null;
  var c = tripTravelerCost(tripLinkedTraveler(code));
  return c && c.per != null ? c : null;
}
// Legs still without a live fare: future dates only, each search once.
function tripLegsToPrice(legs) {
  var seen = {}, today = _tripIdeaTodayIso();
  return (legs || []).filter(function(l){
    var k = _tripLegKey(l);
    if (!k || seen[k] || l.date < today) return false;
    seen[k] = true;
    return !_tripLegHit(l);
  });
}
function tripLegsSearchCount(legs) { return Math.min(tripLegsToPrice(legs).length, TRIP_LEG_CALLS_PER_PRESS); }
// The one paid path: uncached legs only, one at a time (so the session cap
// holds), at most `cap` per press. fetchFlights keeps every other guard.
function tripLegsFetch(legs, cap) {
  var todo = tripLegsToPrice(legs).slice(0, cap == null ? TRIP_LEG_CALLS_PER_PRESS : cap), out = {asked:todo.length, live:0, fresh:0};
  if (!todo.length || typeof fetchFlights !== 'function') return Promise.resolve(out);
  return todo.reduce(function(p, l){
    return p.then(function(){
      return Promise.resolve(fetchFlights(l.searchFrom || l.from, l.searchTo || l.to, l.date, l.dir === 'round' ? l.ret : '')).then(function(d){ if (d && d.live) { out.live++; if (!d.cached) out.fresh++; } }, function(){});
    });
  }, Promise.resolve()).then(function(){ try { tripTargetAlerts(); } catch (e) {} return out; }); // PIA-125: a fresh fare may hit a target
}
// ±day strip: one row per date the traveler controls (arrive / leave).
var _tripLegWide = {}, _tripLegWriting = {};
function _tripLegRows(t) {
  var out = [];
  (t.legs || []).forEach(function(l, i){
    if (l.dir === 'round') { out.push({leg:l, idx:i, write:'in', at:'date', lbl:'✈️ Out · ' + l.from + '→' + l.to}); out.push({leg:l, idx:i, write:'home', at:'ret', lbl:'↩ Back · ' + l.to + '→' + l.from}); }
    else if (l.date) out.push({leg:l, idx:i, write:l.dir === 'home' ? 'home' : 'in', at:'date', lbl:l.dir === 'home' ? '🏠 Home · ' + l.from + '→' + l.to : '✈️ In · ' + l.from + '→' + l.to});
  });
  return out;
}
function _tripLegVariant(row, iso) { var v = Object.assign({}, row.leg); v[row.at] = iso; return v; }
function _tripLegDateOk(t, row, iso) {
  if (!iso || iso < _tripIdeaTodayIso()) return false;
  return row.write === 'home' ? (!t.row.dep || iso >= t.row.dep) : (!t.row.ret || iso <= t.row.ret);
}
function _tripLegMoney(p) { return p.price == null ? '—' : (p.status === 'live' ? '$' : '~$') + Math.round(p.price).toLocaleString('en-US'); }
function _tripLegDayShort(iso) { return tripIdeaDay(iso).replace(/ [A-Z][a-z]{2} /, ' '); }
function _tripLegOffsets(t, wide) { return wide || _tripLegWide[t.code] ? TRIP_LEG_FLEX_WIDE : TRIP_LEG_FLEX_DAYS; }
// What "Price these" would search: plan dates first, then ±1, then ±2.
function tripLegFlexLegs(t) {
  if (!t) return [];
  var rows = _tripLegRows(t), out = [];
  _tripLegOffsets(t).slice().sort(function(a, b){ return Math.abs(a) - Math.abs(b); }).forEach(function(o){
    rows.forEach(function(r){ var d = _tripIdeaIsoAdd(r.leg[r.at], o); if (o === 0 || _tripLegDateOk(t, r, d)) out.push(_tripLegVariant(r, d)); });
  });
  return out;
}
function tripIdeaFlexStripHtml(t, wide) {
  if (!t || !t.legs.length || t.booked) return '';
  var code = _tripIdeaEsc(t.code);
  return _tripLegRows(t).map(function(r){
    var plan = tripLegPrice(r.leg), d0 = r.leg[r.at], meta = '';
    var itin = tripLegItinerary(plan);
    if (itin) meta = '<span class="lt-leg-meta">' + _tripIdeaEsc(itin) + '</span>';
    var chips = _tripLegOffsets(t, wide).map(function(o){
      var d = _tripIdeaIsoAdd(d0, o), p = o === 0 ? plan : tripLegPrice(_tripLegVariant(r, d)), ok = o === 0 || _tripLegDateOk(t, r, d);
      var cheaper = o !== 0 && p.status === 'live' && plan.status === 'live' && p.price < plan.price;
      return '<button type="button" class="lt-leg-chip' + (o === 0 ? ' plan' : '') + (p.status === 'live' ? '' : ' est') + (cheaper ? ' cheaper' : '') + '"' + (o === 0 || !ok ? ' disabled' : '') +
        ' data-leg-flex data-code="' + code + '" data-dir="' + r.write + '" data-date="' + d + '" aria-label="' + _tripIdeaEsc((r.write === 'home' ? 'Leave ' : 'Arrive ') + tripIdeaDay(d) + ' ' + _tripLegMoney(p) + (o === 0 ? ' (plan)' : '')) + '">' +
        '<span>' + _tripIdeaEsc(_tripLegDayShort(d)) + '</span><b>' + _tripIdeaEsc(_tripLegMoney(p)) + '</b></button>';
    }).join('');
    return '<div class="lt-leg-row"><div class="lt-leg-lbl">' + _tripIdeaEsc(r.lbl) + ' ' + meta + '</div><div class="lt-leg-chips">' + chips + '</div>' +
      (r.at === 'date' ? tripLegWatchLineHtml(t, r.idx) + tripLegNearbyHtml(t, r.idx) : '') + '</div>';
  }).join('');
}
function _tripLegCanSpend() { return typeof PROXY_URL === 'string' && !!PROXY_URL && typeof proxyToken === 'function' && !!proxyToken(); }
// A linked route card's legs: total, ±day strip, and the one "Price these" button.
function tripIdeaLegsHtml(code) {
  var t = tripLinkedTraveler(code);
  if (!t || !t.legs.length || t.booked) return '';
  var n = tripLegsSearchCount(tripLegFlexLegs(t)), wide = !!_tripLegWide[t.code], c = _tripIdeaEsc(t.code);
  var btn = n && _tripLegCanSpend() ? '<button type="button" class="lt-leg-btn" data-leg-price data-code="' + c + '">Price these (' + n + ' search' + (n > 1 ? 'es' : '') + ')</button>' : '';
  return '<div class="lt-legs" data-leg-box="' + c + '">' + (S.linkedIdeaId ? tripTravelerWatchHtml(S.linkedIdeaId, t) : '') + tripIdeaFlexStripHtml(t) +
    '<div class="lt-leg-foot"><span>~$ = estimate · tap a day to move ' + (_tripIdeaIsOrganizer(t.label) ? 'your' : _tripIdeaEsc(t.label) + '’s') + ' RSVP</span>' +
    '<button type="button" class="lt-leg-btn" data-leg-more data-code="' + c + '" aria-pressed="' + wide + '">' + (wide ? '±1 day' : '±2 days') + '</button>' + tripNearbyToggleHtml(S.linkedIdeaId, t) + btn + '</div>' +
    tripBookCueHtml(S.linkedIdeaId, t) + '</div>';
}
// One tap = one change to that traveler's RSVP answer; the rest of it is kept.
// Reads the doc fresh first so it never rewinds a newer answer. `edit` changes
// the body and returns {done:'what changed'} or {error:'why not'}.
function _tripIdeaRewriteAnswer(id, code, edit) {
  var wk = id + '|' + code;
  if (!TRIP_IDEA_ID_RE.test(String(id || '')) || _tripLegWriting[wk]) return Promise.resolve(null);
  _tripLegWriting[wk] = true;
  var done = function(x){ delete _tripLegWriting[wk]; return x; };
  return tripIdeaFetchDoc(id, true).then(function(doc){
    var r = doc && doc.responses && doc.responses[code];
    if (!r) { showShareToast('No RSVP answer to change yet'); return null; }
    var body = {member:code, status:r.status, origin:r.origin || '', available_from:r.available_from || '', available_to:r.available_to || '', note:r.note || '', arrive_at:r.arrive_at || '', leave_from:r.leave_from || ''};
    var res = edit(body) || {};
    if (res.error) { showShareToast(res.error); return null; }
    var org = _tripIdeaOrganizerCode(doc), mine = !!(_tripIdeaKeys()[id] || {}).edit_key;
    if (mine && org && code !== org && body.note.indexOf('(entered by ') < 0) body.note = ((body.note ? body.note + ' ' : '') + '(entered by ' + TRIP_IDEA_ORGANIZER_NAME + ')').slice(0, 280);
    return _tripIdeaApi('POST', '/idea/respond?id=' + encodeURIComponent(id), body).then(function(resp){
      if (!(resp.ok && resp.json && resp.json.doc)) { showShareToast(resp.status === 409 ? 'This trip is already decided' : 'Could not save — try again'); return null; }
      var next = resp.json.doc, who = summarizeIdeaResponses(next).rows.filter(function(x){ return x.code === code; })[0];
      tripIdeaStoreDoc(next);
      if (_tripIdeaShared && _tripIdeaShared.id === id) _tripIdeaShared.doc = next;
      showShareToast('✓ ' + _tripIdeaName((who && who.label) || code) + ' · ' + res.done);
      if (typeof S === 'object' && S && S.linkedIdeaId === id) tripIdeaApplyLinkedRsvp();
      return next;
    });
  }).then(done, function(){ return done(null); });
}
// PIA-121: a flex tap moves that traveler's arrive (in) or leave (home) date.
function tripIdeaSetTravelDate(id, code, dir, iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return Promise.resolve(null);
  return _tripIdeaRewriteAnswer(id, code, function(b){
    if (dir === 'home') b.available_to = iso; else b.available_from = iso;
    if (!b.available_from || (b.available_to && b.available_to < b.available_from)) return {error:'Leave date must be on or after the arrive date'};
    return {done:(dir === 'home' ? 'leave ' : 'arrive ') + tripIdeaDay(iso)};
  });
}
// ── PIA-123: each traveler's fare watch — target, trend, age ────────────────
// One age formatter for every "N ago" in the app. A fare's age is its original
// fetch time (X-Fetched-At), so a cache hit never reads as "just now".
// Self-contained: test-trust runs freshnessLabel + this alone in a sandbox.
function fareAgeLabel(at) {
  var t = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at);
  if (!(t > 0)) return '';
  var s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
  if (s <= 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}
// Targets live on this device only (keyed by the shared trip): a trip-wide
// per-traveler target, and an optional per-traveler override.
var TRIP_LEG_TARGETS_STORAGE = 'pialax_leg_targets_v1', TRIP_LEG_HISTORY_STORAGE = 'pialax_leg_history_v1';
function _tripLegStore(key) { try { var v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
function _tripLegSave(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
function tripLegTargets(id) {
  var t = _tripLegStore(TRIP_LEG_TARGETS_STORAGE)[id] || {};
  return {trip:Number(t.trip) > 0 ? Number(t.trip) : null, byCode:t.byCode && typeof t.byCode === 'object' ? t.byCode : {}};
}
function tripLegSetTarget(id, code, value) {
  var v = Math.round(Number(String(value == null ? '' : value).replace(/[$,\s]/g, ''))), all = _tripLegStore(TRIP_LEG_TARGETS_STORAGE);
  var t = tripLegTargets(id);
  if (code) { if (v > 0) t.byCode[code] = v; else delete t.byCode[code]; } else t.trip = v > 0 ? v : null;
  all[id] = t; _tripLegSave(TRIP_LEG_TARGETS_STORAGE, all);
  return t;
}
// A confirmed "target price" fact on the linked Trips card seeds the trip target.
function _tripLegFact(id, field) {
  if (typeof tripStateFor !== 'function' || typeof WATCHLIST === 'undefined' || !Array.isArray(WATCHLIST)) return null;
  var item = WATCHLIST.filter(function(x){ return x && x.sharedIdeaId === id; })[0];
  if (!item) return null;
  try { var st = tripStateFor(item, typeof loadParsedFacts === 'function' ? loadParsedFacts() : []); return st ? st[field] : null; } catch (e) { return null; }
}
// Traveler's own target, else the trip's, else the confirmed fact.
function tripLegTargetFor(id, code) {
  var t = tripLegTargets(id), own = Number(t.byCode[code]);
  if (own > 0) return {value:own, from:'traveler'};
  if (t.trip) return {value:t.trip, from:'trip'};
  var f = Number(_tripLegFact(id, 'target_price'));
  return f > 0 ? {value:Math.round(f), from:'fact'} : null;
}
// Leg history: one point per fetch (deduped by its fetch time), ≤30 per leg,
// dropped once the travel date passes. It keeps the last price after the 24h
// cache lets go, so a stale fare can still be shown (greyed) and compared.
function tripLegHistory(leg) { return _tripLegStore(TRIP_LEG_HISTORY_STORAGE)[_tripLegKey(leg)] || []; }
function tripLegRecord(leg, p) {
  var key = _tripLegKey(leg), at = p && p.status === 'live' && p.lastVerified ? Date.parse(p.lastVerified) : NaN;
  if (!key || !(at > 0)) return false;
  var all = _tripLegStore(TRIP_LEG_HISTORY_STORAGE), h = all[key] || [];
  if (h.some(function(x){ return x.t === at; })) return false;
  h.push({t:at, p:p.price}); h.sort(function(a, b){ return a.t - b.t; });
  all[key] = h.slice(-30);
  var today = _tripIdeaTodayIso();
  Object.keys(all).forEach(function(k){ var d = k.split('|')[2]; if (d && d < today) delete all[k]; });
  _tripLegSave(TRIP_LEG_HISTORY_STORAGE, all);
  return true;
}
function tripLegWatch(leg) {
  var p = tripLegPrice(leg); tripLegRecord(leg, p);
  var h = tripLegHistory(leg), last = h[h.length - 1] || null, prev = h.length > 1 ? h[h.length - 2] : null, ins = p.data && p.data.insights;
  var known = p.status === 'live' ? {price:p.price, at:p.lastVerified, stale:false} : last ? {price:last.p, at:new Date(last.t).toISOString(), stale:true} : null;
  var series = ins && ins.hist && ins.hist.length > 1 ? ins.hist.map(function(x){ return x[1]; }) : h.map(function(x){ return x.p; });
  return {price:p, known:known, delta:last && prev ? last.p - prev.p : null, series:series, insights:ins || null};
}
function _tripLegDeltaHtml(d) {
  if (d == null) return '';
  return d === 0 ? '<span class="lt-delta">no change</span>' : '<span class="lt-delta ' + (d < 0 ? 'down' : 'up') + '">' + (d < 0 ? '▼ $' : '▲ $') + Math.abs(d) + '</span>';
}
// Under each leg: Δ vs last check · sparkline · Google's verdict · fare age.
function tripLegWatchLineHtml(t, i) {
  var w = tripLegWatch(t.legs[i]), bits = [];
  if (!w.known) return '<div class="lt-watch-line">Estimate — not priced live yet</div>';
  if (w.known.stale) {
    return '<div class="lt-watch-line stale">Last $' + w.known.price + ' · ' + _tripIdeaEsc(fareAgeLabel(w.known.at)) + ' · stale' +
      (_tripLegCanSpend() ? ' <button type="button" class="lt-leg-btn" data-leg-refresh data-code="' + _tripIdeaEsc(t.code) + '" data-leg="' + i + '">Tap to refresh (1 search)</button>' : '') + '</div>';
  }
  if (w.delta != null) bits.push(_tripLegDeltaHtml(w.delta) + ' since last check');
  if (w.series.length > 1 && typeof sparklineSVG === 'function') bits.push(sparklineSVG(w.series, 64, 16));
  if (w.insights && (w.insights.level || w.insights.typical)) bits.push('Google: ' + _tripIdeaEsc((w.insights.level ? w.insights.level + ' price' : '') + (w.insights.typical ? (w.insights.level ? ' · ' : '') + 'typical $' + w.insights.typical[0] + '–$' + w.insights.typical[1] : '')));
  bits.push('checked ' + _tripIdeaEsc(fareAgeLabel(w.known.at)));
  return '<div class="lt-watch-line">' + bits.join(' · ') + '</div>';
}
// A traveler's watch: in + home total vs target (editable inline), oldest age.
function tripTravelerWatch(id, t) {
  var cost = tripTravelerCost(t);
  if (!cost) return null;
  var target = tripLegTargetFor(id, t.code), delta = null, oldest = null;
  t.legs.forEach(function(l, i){
    var w = tripLegWatch(l);
    if (w.delta != null) delta = (delta || 0) + w.delta;
    if (w.known && !w.known.stale && (!oldest || w.known.at < oldest)) oldest = w.known.at;
  });
  var verdict = !target || cost.per == null ? '' : cost.status !== 'live' ? 'estimate' : cost.per <= target.value ? 'under' : 'over';
  return {cost:cost, target:target, delta:delta, oldest:oldest, verdict:verdict};
}
function _tripLegVerdictHtml(w) {
  if (!w.target || !w.verdict) return '';
  if (w.verdict === 'under') return '<b class="lt-verdict ok">✓ at or under $' + w.target.value + '</b>';
  if (w.verdict === 'over') return '<b class="lt-verdict over">$' + (w.cost.per - w.target.value) + ' over $' + w.target.value + '</b>';
  return '<span class="lt-verdict">target $' + w.target.value + ' (estimate)</span>';
}
function _tripLegTargetInput(id, code, own, ph, label) {
  return '<label class="lt-target">' + _tripIdeaEsc(label) + ' <input type="text" inputmode="numeric" autocomplete="off" data-leg-target data-idea="' + _tripIdeaEsc(id) + '" data-code="' + _tripIdeaEsc(code) +
    '" value="' + (own ? own : '') + '" placeholder="' + _tripIdeaEsc(ph) + '" aria-label="' + _tripIdeaEsc(label) + '"></label>';
}
function tripTravelerWatchHtml(id, t) {
  var w = tripTravelerWatch(id, t);
  if (!w) return '';
  var own = tripLegTargets(id).byCode[t.code], trip = tripLegTargets(id).trip;
  return '<div class="lt-watch">' + _tripLegTargetInput(id, t.code, own, trip ? '$' + trip + ' (trip)' : 'none', '🎯 Target $') + _tripLegVerdictHtml(w) +
    (w.delta != null ? _tripLegDeltaHtml(w.delta) : '') + (w.oldest ? '<span class="lt-age">checked ' + _tripIdeaEsc(fareAgeLabel(w.oldest)) + '</span>' : '') + '</div>';
}
// The Trips card of a linked trip: the trip target + one watch line per traveler.
// Read-only on prices — nothing here spends a search.
function tripLegWatchCardHtml(item) {
  if (!item || !item.sharedIdeaId || (item.stage !== 'watching' && item.stage !== 'planning')) return '';
  var id = item.sharedIdeaId, doc = tripIdeaCachedDoc(id), ts = doc ? tripLegsFor(doc) : [];
  if (!ts.length) return '';
  var trip = tripLegTargets(id).trip, fact = trip ? null : tripLegTargetFor(id, '');
  var rows = ts.map(function(t){
    var name = '<strong>' + _tripIdeaEsc(_tripIdeaName(t.label)) + '</strong>';
    if (t.booked) return '<li>' + name + '<b class="lt-verdict ok">✓ Booked</b></li>';
    var w = tripTravelerWatch(id, t);
    if (!w || w.cost.per == null) return '<li>' + name + '<span>' + (t.legs.length ? 'no fare yet' : 'no dates yet') + '</span></li>';
    return '<li>' + name + '<span>' + (w.cost.status === 'live' ? '$' : '~$') + w.cost.per + ' ' + (t.legs.length > 1 ? 'in + home' : 'trip') + '</span>' + _tripLegVerdictHtml(w) +
      (w.delta != null ? _tripLegDeltaHtml(w.delta) : '') + '<span class="lt-age">' + (w.oldest ? 'checked ' + _tripIdeaEsc(fareAgeLabel(w.oldest)) : 'estimate') + '</span></li>';
  }).join('');
  return '<div class="lt-watch-card"><div class="lt-watch-hd">🎯 Fare watch</div>' +
    _tripLegTargetInput(id, '', trip, fact ? '$' + fact.value + ' (from notes)' : 'e.g. 400', 'Target per traveler $') +
    '<ul>' + rows + '</ul><small>Prices from the Family tab · ~$ = estimate · nothing here spends a search</small></div>';
}
// ── PIA-124: the "pull out the card" moment — exact link, confidence, book-by ─
// What a live cached fare says about one exact search (never fetches). Google's
// own results link (search_metadata) is for 1 adult, so only then.
function tripFarePick(from, to, dep, ret, adults) {
  var p = tripLegPrice({dir:ret ? 'round' : 'in', from:from, to:to, date:dep, ret:ret || ''});
  if (p.status !== 'live' || !p.data) return null;
  var o = (p.data.offers || [])[0] || {airline:p.data.airline, stops:p.data.stops, flightNos:p.data.flightNo ? [p.data.flightNo] : []};
  return {gfUrl:(adults || 1) === 1 ? p.data.gfUrl || '' : '', nonstop:o.stops === 0, airline:o.airline || '', offer:o, price:p.price, lastVerified:p.lastVerified};
}
// How much to trust a fare before paying: ≤6h solid, ≤24h recheck, older stale.
function fareConfidence(iso) {
  var t = iso ? Date.parse(iso) : NaN, h = (Date.now() - t) / 3600000;
  if (!(t > 0)) return {level:'estimate', text:'estimate — search first'};
  if (h <= 6) return {level:'solid', text:'solid'};
  if (h <= 24) return {level:'recheck', text:'recheck on Google Flights before paying'};
  return {level:'stale', text:'stale — refresh first'};
}
// A traveler is only as fresh as their oldest leg; any estimate makes it one.
function tripTravelerConfidence(t) {
  var oldest = null, est = false;
  ((t && t.legs) || []).forEach(function(l){ var p = tripLegPrice(l); if (p.status !== 'live') est = true; else if (!oldest || p.lastVerified < oldest) oldest = p.lastVerified; });
  var c = fareConfidence(est ? null : oldest); c.at = est ? null : oldest; return c;
}
// Book-by: a confirmed "decision deadline" note, else the trip's own book-by
// (Thanksgiving: Nov 1, when holiday fares climb), else 3 weeks before leaving.
function tripBookBy(id) {
  var item = (typeof WATCHLIST !== 'undefined' && Array.isArray(WATCHLIST) ? WATCHLIST : []).filter(function(x){ return x && x.sharedIdeaId === id; })[0] || null;
  var fact = String(_tripLegFact(id, 'decision_deadline') || '').slice(0, 10), iso = /^\d{4}-\d{2}-\d{2}$/;
  var plan = tripIdeaPlanDates(tripIdeaCachedDoc(id)), dep = (item && item.dep) || (plan && plan.dep) || '';
  var date = iso.test(fact) ? fact : item && iso.test(item.bookBy || '') ? item.bookBy : dep ? _tripIdeaIsoAdd(dep, -21) : '';
  if (!date) return null;
  var days = _tripIdeaNights(_tripIdeaTodayIso(), date);
  return {date:date, days:days, tone:days < 0 ? 'red' : days <= 7 ? 'amber' : 'ok',
    text:days < 0 ? 'Book-by passed (' + tripIdeaDay(date) + ')' : 'Book by ' + tripIdeaDay(date) + ' · ' + (days === 0 ? 'today' : days + ' day' + (days > 1 ? 's' : '') + ' left')};
}
function _tripTime(s) {
  var m = /(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  return m ? ((+m[1] % 12) || 12) + ':' + m[2] + (+m[1] < 12 ? 'a' : 'p') : '';
}
// The fare behind the link, in words: so you can find that flight on Google Flights.
function tripLegItinerary(p) {
  if (!p || p.status !== 'live' || !p.data) return '';
  var o = (p.data.offers || [])[0] || {}, airline = o.airline || p.data.airline || '', nos = (o.flightNos && o.flightNos.length ? o.flightNos : p.data.flightNo ? [p.data.flightNo] : []).join(' + ');
  var stops = o.stops != null ? o.stops : p.data.stops, times = o.depTime && o.arrTime ? _tripTime(o.depTime) + '→' + _tripTime(o.arrTime) : '';
  return [airline + (nos ? ' ' + nos : ''), times, stops ? stops + ' stop' + (stops > 1 ? 's' : '') : stops === 0 ? 'nonstop' : ''].filter(Boolean).join(' · ');
}
function _tripLegCanMarkBooked(id) { return tripIdeaCanBook() && !!(_tripIdeaKeys()[id] || {}).edit_key; }
function _tripBookByHtml(bb) { return bb ? '<span class="lt-bookby ' + bb.tone + '">⏳ ' + _tripIdeaEsc(bb.text) + '</span>' : ''; }
function _tripConfHtml(c) { return '<span class="lt-conf ' + c.level + '">Fare: ' + _tripIdeaEsc(c.text) + (c.at ? ' · ' + _tripIdeaEsc(fareAgeLabel(c.at)) : '') + '</span>'; }
function _tripMarkBookedBtn(id, code) {
  return _tripLegCanMarkBooked(id) ? '<button type="button" class="lt-leg-btn lt-mark-booked" data-leg-booked data-code="' + _tripIdeaEsc(code) + '">Mark booked ✓</button>' : '';
}
// Above a traveler's Book buttons: how much to trust the fare, the book-by
// countdown, and "Mark booked ✓" (organizer device, once the Worker stores it).
function tripBookCueHtml(id, t) {
  if (!t || t.booked || !t.legs.length) return '';
  return '<div class="lt-book-cue">' + _tripConfHtml(tripTravelerConfidence(t)) + _tripBookByHtml(tripBookBy(id)) + _tripMarkBookedBtn(id, t.code) + '</div>';
}
function tripIdeaMarkBooked(id, code) {
  var doc = tripIdeaCachedDoc(id);
  if (!doc) return Promise.resolve(null);
  return tripIdeaSetBooked({id:id, doc:doc}, code, true).then(function(next){
    if (next && typeof S === 'object' && S && S.linkedIdeaId === id) tripIdeaApplyLinkedRsvp();
    if (typeof renderWatchlist === 'function') try { renderWatchlist(); } catch (e) {}
    if (typeof syncLtSheet === 'function') try { syncLtSheet(); } catch (e) {}
    return next;
  });
}
// ── PIA-127: the phone's one-thumb flow ─────────────────────────────────────
// A "✈️ Book flights" button on a linked Trips card (opens the same book list
// as the trip card, in a bottom sheet): open app → Book → In PIA ↗ = 2 taps.
function tripCardBookChipHtml(item) {
  if (!item || !item.sharedIdeaId || (item.stage !== 'watching' && item.stage !== 'planning')) return '';
  var doc = tripIdeaCachedDoc(item.sharedIdeaId);
  if (doc && !tripIdeaBookRows(doc).some(function(r){ return !r.booked && r.links; })) return '';
  return '<button type="button" class="wl-book-chip" data-book-idea="' + _tripIdeaEsc(item.sharedIdeaId) + '">✈️ Book flights</button>';
}
// The "Dates & airports" sheet: every traveler's ±2-day strip and nearby toggle.
function tripLegsSheetHtml(doc) {
  var id = doc && doc.id;
  var html = tripLegsFor(doc).filter(function(t){ return !t.booked && t.legs.length; }).map(function(t){
    var cost = tripTravelerCost(t);
    return '<section class="lt-sheet-trav"><h3>' + _tripIdeaEsc(_tripIdeaName(t.label)) + (cost && cost.per != null ? ' · ' + (cost.status === 'live' ? '$' : '~$') + cost.per : '') + '</h3>' +
      tripIdeaFlexStripHtml(t, true) + '<div class="lt-leg-foot">' + tripNearbyToggleHtml(id, t) + '</div></section>';
  }).join('');
  return html || '<p class="lt-sheet-empty">Everyone with dates is booked ✓</p>';
}
// ── PIA-122: nearby airports — one search covers home + its neighbors ───────
// Off unless the Worker says it takes comma-joined airports (/account features),
// so an older Worker never sees a comma. Per traveler, on this device.
var TRIP_NEARBY_GROUPS = [['LAX', 'BUR', 'LGB', 'SNA', 'ONT'], ['LGA', 'JFK', 'EWR']];
var TRIP_NEARBY_STORAGE = 'pialax_leg_nearby_v1', TRIP_MULTI_AIRPORT_STORAGE = 'pialax_multi_airport_v1';
var _tripWorkerAcct = null;
function tripNoteWorkerFeatures(acct) {
  _tripWorkerAcct = acct || null;
  try { if (acct && acct.features && acct.features.multi_airport) localStorage.setItem(TRIP_MULTI_AIRPORT_STORAGE, '1'); else localStorage.removeItem(TRIP_MULTI_AIRPORT_STORAGE); } catch (e) {}
}
function tripCanNearby() { try { return localStorage.getItem(TRIP_MULTI_AIRPORT_STORAGE) === '1'; } catch (e) { return false; } }
// The traveler's metro, sorted (the Worker's cache key order). Keyed by the
// airport they fly from today — Anjo's date-aware LGA, not her old JAX.
function tripNearbyGroup(code) { var g = TRIP_NEARBY_GROUPS.filter(function(x){ return x.indexOf(code) >= 0; })[0]; return g ? g.slice().sort() : []; }
function tripNearbyOn(id, code) { var all = _tripLegStore(TRIP_NEARBY_STORAGE); return !!(all[id] && all[id][code]); }
function tripSetNearby(id, code, on) {
  var all = _tripLegStore(TRIP_NEARBY_STORAGE); all[id] = all[id] || {};
  if (on) all[id][code] = true; else delete all[id][code];
  _tripLegSave(TRIP_NEARBY_STORAGE, all);
}
// Which airport won a nearby search, and by how much (both prices from that one search).
function tripLegNearby(leg) {
  var byFrom = !!leg.searchFrom && leg.searchFrom !== leg.from, byTo = !!leg.searchTo && leg.searchTo !== leg.to, hit = (byFrom || byTo) ? _tripLegHit(leg) : null;
  if (!hit) return null;
  var mins = (byFrom ? hit.data.byDep : hit.data.byArr) || {}, mine = byFrom ? leg.from : leg.to, win = '';
  Object.keys(mins).forEach(function(a){ if (!win || mins[a] < mins[win]) win = a; });
  if (!win) return null;
  return {airport:win, price:mins[win], mine:mine, minePrice:mins[mine] || null, saving:mins[mine] ? mins[mine] - mins[win] : null};
}
function tripLegNearbyHtml(t, i) {
  var n = tripLegNearby(t.legs[i]);
  if (!n) return '';
  if (n.airport === n.mine) return '<div class="lt-nearby ok">✓ ' + _tripIdeaEsc(n.mine) + ' is the cheapest nearby airport</div>';
  return '<div class="lt-nearby"><span>📍 <b>' + _tripIdeaEsc(n.airport) + ' $' + n.price + '</b>' + (n.saving ? ' · saves $' + n.saving + ' vs ' + _tripIdeaEsc(n.mine) : ' · ' + _tripIdeaEsc(n.mine) + ' not in these results') + '</span>' +
    '<button type="button" class="lt-leg-btn" data-leg-origin data-code="' + _tripIdeaEsc(t.code) + '" data-airport="' + _tripIdeaEsc(n.airport) + '">Use ' + _tripIdeaEsc(n.airport) + '</button></div>';
}
function tripNearbyToggleHtml(id, t) {
  var g = tripNearbyGroup(t.from);
  if (!tripCanNearby() || g.length < 2 || !t.legs.some(function(l){ return l.dir !== 'round'; })) return '';
  var on = tripNearbyOn(id, t.code), others = g.filter(function(a){ return a !== t.from; }).join(' · ');
  return '<button type="button" class="lt-leg-btn lt-nearby-tog" data-leg-nearby data-code="' + _tripIdeaEsc(t.code) + '" aria-pressed="' + on + '">' + (on ? '📍 Nearby on · ' : '📍 Also try ') + _tripIdeaEsc(others) + '</button>';
}
// "Use BUR": that traveler now flies from BUR (both legs); the rest is kept.
function tripIdeaSetOrigin(id, code, airport) {
  if (!/^[A-Z]{3}$/.test(String(airport || ''))) return Promise.resolve(null);
  return _tripIdeaRewriteAnswer(id, code, function(b){ b.origin = airport; return {done:'flies from ' + airport}; });
}
// ── PIA-126: one pickup run — when everyone lands, and leaves ──────────────
// Times come from offers already cached with each leg's fare; nothing here
// searches. Same airport + within 2 hours = Mom & Dad make one trip.
function _tripMinutes(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(String(s || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : null;
}
// The offers behind a leg's price: on a nearby search, only its own airport's.
function tripLegOffers(leg) {
  var hit = _tripLegHit(leg), byFrom = !!leg.searchFrom && leg.searchFrom !== leg.from, byTo = !!leg.searchTo && leg.searchTo !== leg.to;
  var list = hit ? (hit.data.offers || []).filter(function(o){ return (!byFrom || o.depAirport === leg.from) && (!byTo || o.arrAirport === leg.to); }) : [];
  return !list.length && (byFrom || byTo) ? tripLegOffers(Object.assign({}, leg, {searchFrom:'', searchTo:''})) : list;
}
// The offer whose price is shown: the headline (best) fare, or on a nearby
// search the cheapest from the traveler's own airport.
function _tripLegShownOffer(leg) {
  var list = tripLegOffers(leg);
  if ((leg.searchFrom && leg.searchFrom !== leg.from) || (leg.searchTo && leg.searchTo !== leg.to)) list = list.slice().sort(function(a, b){ return a.price - b.price; });
  return list[0] || null;
}
function _tripGapText(min) {
  var d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return d ? d + 'd' + (h ? ' ' + h + 'h' : '') : h ? h + 'h' + (m ? ' ' + m + 'm' : '') : m + 'm';
}
function _tripPickupSide(ts, kind) {
  var rows = [], waiting = [];
  ts.forEach(function(t){
    var l = kind === 'arrive' ? t.legs[0] : t.legs.filter(function(x){ return x.dir === 'home'; })[0];
    if (!l) return;
    var o = _tripLegShownOffer(l), at = o && (kind === 'arrive' ? o.arrTime : o.depTime);
    if (!at) { waiting.push(_tripIdeaName(t.label)); return; }
    rows.push({code:t.code, label:t.label, airport:(kind === 'arrive' ? o.arrAirport : o.depAirport) || (kind === 'arrive' ? l.to : l.from), time:at, min:_tripMinutes(at), price:o.price});
  });
  rows.sort(function(a, b){ return a.min - b.min; });
  var same = rows.length > 1 && rows.every(function(x){ return x.airport === rows[0].airport; }), gap = rows.length > 1 ? rows[rows.length - 1].min - rows[0].min : null;
  return {rows:rows, waiting:waiting, same:same, gap:gap, within:!waiting.length && same && gap != null && gap <= 120};
}
function tripPickupTimeline(ts) {
  var list = (ts || []).filter(function(t){ return !t.booked && t.legs && t.legs.length; });
  return {travelers:list.length, arrive:_tripPickupSide(list, 'arrive'), leave:_tripPickupSide(list, 'home')};
}
// The cheapest combination of cached offers where everyone lands (or leaves)
// at the same airport within 2 hours. Pure arithmetic on cached offers.
function tripPickupBestPair(ts, kind) {
  var list = (ts || []).filter(function(t){ return !t.booked && t.legs && t.legs.length; });
  var lists = list.map(function(t){
    var l = kind === 'arrive' ? t.legs[0] : t.legs.filter(function(x){ return x.dir === 'home'; })[0];
    return l ? tripLegOffers(l).map(function(o){ var at = kind === 'arrive' ? o.arrTime : o.depTime; return at ? {code:t.code, label:t.label, offer:o, min:_tripMinutes(at), airport:kind === 'arrive' ? o.arrAirport : o.depAirport} : null; }).filter(Boolean) : [];
  });
  if (lists.length < 2 || lists.some(function(x){ return !x.length; })) return null;
  var best = null, pick = [];
  (function walk(i){
    if (i === lists.length) {
      var mins = pick.map(function(p){ return p.min; }), ap = pick[0].airport;
      if (!pick.every(function(p){ return p.airport === ap; }) || Math.max.apply(null, mins) - Math.min.apply(null, mins) > 120) return;
      var total = pick.reduce(function(s, p){ return s + p.offer.price; }, 0);
      if (!best || total < best.total) best = {total:total, airport:ap, picks:pick.slice()};
      return;
    }
    lists[i].forEach(function(x){ pick.push(x); walk(i + 1); pick.pop(); });
  })(0);
  return best;
}
function _tripPickupWhen(x) { return _tripIdeaEsc(_tripIdeaName(x.label)) + ' <b>' + _tripIdeaEsc(x.airport) + ' ' + _tripIdeaEsc(tripIdeaDay(x.time.slice(0, 10)).replace(/ [A-Z][a-z]{2} \d+$/, '') + ' ' + _tripTime(x.time)) + '</b>'; }
function _tripPickupLineHtml(side, verb, ts, kind) {
  if (!side.rows.length && !side.waiting.length) return '';
  var why = side.waiting.length ? 'waiting on ' + side.waiting.join(' & ') + '’s live fare' :
    !side.same ? 'different airports — two trips' : side.within ? '✓ within 2h · one trip' : _tripGapText(side.gap) + ' apart';
  var best = side.within || side.waiting.length ? null : tripPickupBestPair(ts, kind);
  var shown = side.rows.reduce(function(s, x){ return s + x.price; }, 0);
  return '<div class="lt-pickup-line"><span>' + verb + ' ' + side.rows.map(_tripPickupWhen).join(' · ') + '</span><span class="lt-pickup-gap' + (side.within ? ' ok' : '') + '">' + _tripIdeaEsc(why) + '</span>' +
    (best ? '<span class="lt-pickup-best">Cheapest pair within 2h at ' + _tripIdeaEsc(best.airport) + ': ' + best.picks.map(function(p){ return _tripIdeaEsc(_tripIdeaName(p.label) + ' ' + (p.offer.flightNos[0] || p.offer.airline || '') + ' ' + _tripTime(kind === 'arrive' ? p.offer.arrTime : p.offer.depTime)); }).join(' + ') +
      ' = $' + best.total + (best.total > shown ? ' (+$' + (best.total - shown) + ')' : '') + '</span>' : '') + '</div>';
}
// Top of a linked trip's Flight Breakdown: who lands when, and the gap.
function tripPickupHtml(doc) {
  var ts = tripLegsFor(doc).filter(function(t){ return !t.booked && t.legs.length; });
  if (ts.length < 2) return '';
  var tl = tripPickupTimeline(ts);
  var a = _tripPickupLineHtml(tl.arrive, '✈️ Lands', ts, 'arrive'), l = _tripPickupLineHtml(tl.leave, '🏠 Leaves', ts, 'leave');
  return a || l ? '<div class="lt-pickup"><div class="lt-watch-hd">🚗 Pickup timeline</div>' + a + l + '</div>' : '';
}
// ── PIA-125: a one-tap nudge for day-old fares + target alerts ──────────────
// Nothing here fetches on its own (CLAUDE.md: searches are button-gated). On
// open / return to the tab the app only COUNTS stale legs and offers a button;
// alerts fire from whatever got priced, once per traveler per day.
var TRIP_DAILY_CAP_STORAGE = 'pialax_daily_cap_v1';
function _tripUtcDay() { return new Date().toISOString().slice(0, 10); }
// The Worker's own 30/day cap locks this device until tomorrow (UTC) — not the month.
function tripDailyCapMark() {
  try { localStorage.setItem(TRIP_DAILY_CAP_STORAGE, _tripUtcDay()); } catch (e) {}
  showShareToast('Today’s Worker search cap is used up — live fares resume tomorrow');
}
function tripDailyCapHit() { try { return localStorage.getItem(TRIP_DAILY_CAP_STORAGE) === _tripUtcDay(); } catch (e) { return false; } }
// Linked Trips cards this device is still deciding on.
function _tripWatchedIdeas() {
  return (typeof WATCHLIST !== 'undefined' && Array.isArray(WATCHLIST) ? WATCHLIST : []).filter(function(x){
    return x && x.sharedIdeaId && (x.stage === 'watching' || x.stage === 'planning');
  }).map(function(x){ return {item:x, id:x.sharedIdeaId}; });
}
// Legs that had a live fare whose 24h cache has lapsed — "a day old".
function tripStaleLegs() {
  var out = [], today = _tripIdeaTodayIso();
  _tripWatchedIdeas().forEach(function(w){
    tripLegsFor(tripIdeaCachedDoc(w.id)).forEach(function(t){
      if (!t.booked) t.legs.forEach(function(l){ if (l.date >= today && !_tripLegHit(l) && tripLegHistory(l).length) out.push(l); });
    });
  });
  return tripLegsToPrice(out);
}
function _tripBudgetText() {
  var sp = _tripWorkerAcct && _tripWorkerAcct.spend && _tripWorkerAcct.spend.serp;
  return sp && sp.cap ? ' · Worker searches today ' + sp.used + '/' + sp.cap : '';
}
var _tripNudgeDismissed = false;
function tripStaleNudge() {
  if (!_tripLegCanSpend() || _tripNudgeDismissed || tripDailyCapHit() || (typeof isFetchLocked === 'function' && isFetchLocked())) return Promise.resolve(0);
  return Promise.all(_tripWatchedIdeas().map(function(w){ return tripIdeaFetchDoc(w.id); })).then(function(){
    tripTargetAlerts();
    var legs = tripStaleLegs(), n = Math.min(legs.length, TRIP_LEG_CALLS_PER_PRESS);
    if (!n) { tripBannerHide('nudge'); return 0; }
    tripBannerShow('nudge', n + ' fare' + (n > 1 ? 's are' : ' is') + ' a day old' + _tripBudgetText(), 'Refresh (' + n + ' search' + (n > 1 ? 'es' : '') + ')', function(){
      return tripLegsFetch(legs).then(function(r){
        tripBannerHide('nudge'); tripLegsRepaint();
        if (typeof renderWatchlist === 'function') try { renderWatchlist(); } catch (e) {}
        if (typeof syncSerpApiAccount === 'function') try { syncSerpApiAccount(); } catch (e) {}
        showShareToast('✓ ' + r.live + ' of ' + r.asked + ' refreshed');
      });
    });
    return n;
  });
}
// Any traveler now at or under their target: one alert per traveler per day
// (pialax_alert_log_v1 → emailed by the existing outbox once Resend exists).
var _tripAlertsSeen = {};
function tripTargetAlerts() {
  var hits = [], day = _tripIdeaTodayIso(), log = typeof loadAlertLog === 'function' ? loadAlertLog() : [];
  _tripWatchedIdeas().forEach(function(w){
    tripLegsFor(tripIdeaCachedDoc(w.id)).forEach(function(t){
      if (t.booked) return;
      var tw = tripTravelerWatch(w.id, t), key = 'leg_target|' + w.id + '|' + t.code + '|' + day;
      if (!tw || tw.verdict !== 'under' || _tripAlertsSeen[key] || log.some(function(e){ return e.dedupe_key === key; })) return;
      _tripAlertsSeen[key] = true;
      var who = _tripIdeaName(t.label), title = String(w.item.title || 'Trip').replace(/^\W+/, '');
      var legs = tw.cost.parts.map(function(x){ return x.leg.from + '→' + x.leg.to + ' ' + tripIdeaDay(x.leg.date) + ' $' + x.p.price; }).join(' + ');
      if (typeof appendAlertLog === 'function') appendAlertLog({id:'lt-' + Date.now().toString(36) + '-' + t.code, trip_id:/^[A-Za-z0-9_-]{1,64}$/.test(w.item.id) ? w.item.id : w.id, type:'fare_drop',
        subject:who + '’s ' + title + ' fare is at your target: $' + tw.cost.per + ' (target $' + tw.target.value + ')',
        body_text:legs + ' = $' + tw.cost.per + ' · target $' + tw.target.value + (tw.oldest ? ' · checked ' + fareAgeLabel(tw.oldest) : '') + '. Recheck on Google Flights before paying.',
        dedupe_key:key, created_at:new Date().toISOString(), trip_state_version:0, sent:false});
      hits.push(who + ' $' + tw.cost.per + ' ≤ $' + tw.target.value);
    });
  });
  if (hits.length) {
    tripAttention(hits.length);
    tripBannerShow('alert', '🎯 At your target: ' + hits.join(' · '), '', null);
    if (typeof drainAlertOutbox === 'function') try { drainAlertOutbox(); } catch (e) {}
  }
  return hits;
}
// One in-app banner (alerts win over the nudge), plus a favicon dot and "(1)"
// in the tab title until it's dismissed. No Notification API: there's no
// background polling, so you're already looking at the app when it fires.
function tripBannerShow(kind, text, action, onAction) {
  if (typeof document === 'undefined' || !document.body || typeof document.createElement !== 'function') return null;
  var el = document.getElementById('lt-banner');
  if (el && !el.hidden && el.getAttribute('data-kind') === 'alert' && kind === 'nudge') return el;
  if (!el) { el = document.createElement('div'); el.id = 'lt-banner'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.setAttribute('data-kind', kind);
  el.innerHTML = '<span>' + _tripIdeaEsc(text) + '</span>' + (action ? '<button type="button" class="lt-leg-btn" data-banner-go>' + _tripIdeaEsc(action) + '</button>' : '') +
    '<button type="button" class="lt-banner-x" data-banner-x aria-label="Dismiss">✕</button>';
  el.hidden = false;
  var go = el.querySelector('[data-banner-go]'), x = el.querySelector('[data-banner-x]');
  if (go && onAction) go.onclick = function(){ go.disabled = true; go.textContent = 'Searching…'; onAction(); };
  if (x) x.onclick = function(){ el.hidden = true; if (kind === 'nudge') _tripNudgeDismissed = true; tripAttention(0); };
  return el;
}
function tripBannerHide(kind) {
  var el = typeof document !== 'undefined' && document.getElementById ? document.getElementById('lt-banner') : null;
  if (el && (!kind || el.getAttribute('data-kind') === kind)) el.hidden = true;
}
var _tripTitleBase = null, _tripIconBase = null;
var TRIP_ICON_DOT = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2307101e'/%3E%3Cpath d='M14 36l36-14-10 28-7-11z' fill='%233b82f6'/%3E%3Ccircle cx='50' cy='14' r='12' fill='%23ef4444'/%3E%3C/svg%3E";
function tripAttention(n) {
  if (typeof document === 'undefined' || !document.querySelector) return;
  if (_tripTitleBase == null) _tripTitleBase = String(document.title || '').replace(/^\(\d+\) /, '');
  document.title = (n ? '(' + n + ') ' : '') + _tripTitleBase;
  var link = document.querySelector('link[rel~="icon"]');
  if (!link || !link.setAttribute) return;
  if (_tripIconBase == null) _tripIconBase = link.getAttribute('href') || '';
  link.setAttribute('href', n ? TRIP_ICON_DOT : _tripIconBase);
}
// ── PIA-129: one number for the family ──────────────────────────────────────
// Everyone still to book, combined: what the plan costs now, the cheapest live
// fares already seen within ±2 days or at a nearby airport, and who's booked.
// A saving is only claimed between live fares; estimates are labelled.
function _tripLegBest(t, row) {
  var best = null;
  TRIP_LEG_FLEX_WIDE.forEach(function(o){
    var d = _tripIdeaIsoAdd(row.leg[row.at], o);
    if (o !== 0 && !_tripLegDateOk(t, row, d)) return;
    var v = _tripLegVariant(row, d), p = tripLegPrice(v), n = tripLegNearby(v);
    if (p.status === 'live' && (!best || p.price < best.price)) best = {price:p.price, date:d, offset:o, airport:''};
    if (n && n.airport !== n.mine && (!best || n.price < best.price)) best = {price:n.price, date:d, offset:o, airport:n.airport};
  });
  return best;
}
function tripTotalBoard(doc) {
  var out = {rows:[], booked:0, travelers:0, total:0, live:true, cheapest:0, cheapestOk:true, saving:null};
  tripLegsFor(doc).forEach(function(t){
    out.travelers++;
    if (t.booked) { out.booked++; out.rows.push({t:t, booked:true}); return; }
    var c = tripTravelerCost(t), hc = t.headcount || 1;
    if (!c || c.per == null) { out.live = false; out.cheapestOk = false; out.rows.push({t:t, cost:null}); return; }
    var best = 0, how = [], ok = c.status === 'live';
    _tripLegRows(t).filter(function(r){ return r.at === 'date'; }).forEach(function(r){
      var plan = tripLegPrice(r.leg), b = _tripLegBest(t, r);
      if (!b || plan.status !== 'live') { ok = false; return; }
      best += Math.min(b.price, plan.price);
      if (b.price < plan.price) how.push((b.airport ? b.airport + (b.offset ? ' ' : '') : '') + (b.offset ? _tripLegDayShort(b.date) : '') + ' ' + (r.write === 'home' ? 'home' : 'in'));
    });
    out.total += c.per * hc;
    if (c.status !== 'live') out.live = false;
    if (ok) out.cheapest += best * hc; else out.cheapestOk = false;
    out.rows.push({t:t, cost:c, best:ok ? best : null, how:how});
  });
  if (out.live && out.cheapestOk && out.total > out.cheapest) out.saving = out.total - out.cheapest;
  return out;
}
function tripTotalBoardHtml(doc) {
  var b = tripTotalBoard(doc);
  if (!b.travelers) return '';
  var money = function(v, live){ return (live ? '$' : '~$') + Math.round(v).toLocaleString('en-US'); };
  var title = String((doc.idea && doc.idea.title) || 'Trip').replace(/\s+trip$/i, '');
  var rows = b.rows.map(function(x){
    var name = '<strong>' + _tripIdeaEsc(_tripIdeaName(x.t.label)) + '</strong>';
    if (x.booked) return '<li>' + name + '<b class="lt-verdict ok">✓ Booked</b></li>';
    if (!x.cost) return '<li>' + name + '<span>' + (x.t.legs.length ? 'no fare yet' : 'no dates yet') + '</span></li>';
    return '<li>' + name + '<span>' + money(x.cost.per * (x.t.headcount || 1), x.cost.status === 'live') + '</span>' +
      (x.best != null && x.best < x.cost.per ? '<span class="lt-board-alt">→ $' + Math.round(x.best * (x.t.headcount || 1)) + ' with ' + _tripIdeaEsc(x.how.join(' + ')) + '</span>' : '') + '</li>';
  }).join('');
  var left = b.travelers - b.booked;
  return '<div class="lt-board"><div class="lt-watch-hd">🧮 ' + _tripIdeaEsc(title) + ' · family total</div>' +
    (left ? '<div class="lt-board-main"><b>' + money(b.total, b.live) + '</b> still to book · ' + left + ' of ' + b.travelers + ' traveler' + (b.travelers > 1 ? 's' : '') + (b.live ? ' · live fares' : ' · ~ = includes estimates') + '</div>'
      : '<div class="lt-board-main"><b class="lt-verdict ok">Everyone’s booked ✓</b></div>') +
    '<ul>' + rows + '</ul>' +
    (b.saving ? '<div class="lt-board-save">Cheapest live fares seen (±2 days, nearby airports): <b>$' + Math.round(b.cheapest).toLocaleString('en-US') + '</b> — saves $' + Math.round(b.saving) + '</div>' : '') +
    '<small>Booked: ' + b.booked + ' of ' + b.travelers + '</small></div>';
}
function tripLinkedSummaryHtml() {
  var doc = tripLinkedDoc();
  return doc ? tripTotalBoardHtml(doc) + tripPickupHtml(doc) : '';
}
function tripLegsRepaint() {
  // PIA-127: a repaint never moves the page under your thumb.
  var y = typeof window !== 'undefined' && typeof window.scrollY === 'number' ? window.scrollY : null;
  try { if (typeof renderMeetupRoutes === 'function') renderMeetupRoutes(); } catch (e) {}
  try { if (typeof syncLinkedTripChrome === 'function') syncLinkedTripChrome(); } catch (e) {}
  try { if (typeof syncLtSheet === 'function') syncLtSheet(); } catch (e) {}
  if (y != null && typeof window.scrollTo === 'function' && window.scrollY !== y) try { window.scrollTo(0, y); } catch (e) {}
}
var _tripLegsWired = false;
function tripLegsWire() {
  if (_tripLegsWired || typeof document === 'undefined' || !document || typeof document.addEventListener !== 'function') return;
  _tripLegsWired = true;
  document.addEventListener('click', function(e){
    var el = e.target && e.target.closest ? e.target.closest('[data-leg-flex],[data-leg-more],[data-leg-price],[data-leg-refresh],[data-leg-booked],[data-leg-nearby],[data-leg-origin]') : null;
    if (!el || el.disabled) return;
    var code = el.getAttribute('data-code');
    if (el.hasAttribute('data-leg-more')) { _tripLegWide[code] = !_tripLegWide[code]; tripLegsRepaint(); return; }
    if (el.hasAttribute('data-leg-nearby')) { if (S && S.linkedIdeaId) { tripSetNearby(S.linkedIdeaId, code, !tripNearbyOn(S.linkedIdeaId, code)); tripLegsRepaint(); try { if (typeof loadPrices === 'function') loadPrices(); } catch (x) {} } return; }
    if (el.hasAttribute('data-leg-origin')) { if (S && S.linkedIdeaId) { el.disabled = true; tripIdeaSetOrigin(S.linkedIdeaId, code, el.getAttribute('data-airport')); } return; }
    if (el.hasAttribute('data-leg-booked')) {
      // PIA-127: a sheet opened from the Trips tab names its own trip (data-idea-scope).
      var scope = el.closest('[data-idea-scope]'), bid = scope ? scope.getAttribute('data-idea-scope') : (typeof S === 'object' && S ? S.linkedIdeaId : '');
      if (bid) { el.disabled = true; tripIdeaMarkBooked(bid, code); }
      return;
    }
    if (el.hasAttribute('data-leg-price') || el.hasAttribute('data-leg-refresh')) {
      var tr = tripLinkedTraveler(code), one = el.hasAttribute('data-leg-refresh');
      if (!tr) return;
      el.disabled = true; el.textContent = 'Searching…';
      tripLegsFetch(one ? [tr.legs[+el.getAttribute('data-leg')]].filter(Boolean) : tripLegFlexLegs(tr), one ? 1 : null).then(function(r){
        if (typeof updateApiCallCount === 'function') try { updateApiCallCount(); } catch (x) {}
        tripLegsRepaint();
        showShareToast(r.asked ? '✓ ' + r.live + ' of ' + r.asked + ' priced live' : 'Nothing new to price');
      });
      return;
    }
    if (typeof S === 'object' && S && S.linkedIdeaId) tripIdeaSetTravelDate(S.linkedIdeaId, code, el.getAttribute('data-dir'), el.getAttribute('data-date'));
  });
  // PIA-123: a target typed into any watch (trip-wide or one traveler) saves on change.
  document.addEventListener('change', function(e){
    var el = e.target && e.target.closest ? e.target.closest('[data-leg-target]') : null;
    if (!el) return;
    tripLegSetTarget(el.getAttribute('data-idea'), el.getAttribute('data-code'), el.value);
    tripLegsRepaint();
    try { tripTargetAlerts(); } catch (x) {}
    if (typeof renderWatchlist === 'function') try { renderWatchlist(); } catch (x) {}
  });
  // PIA-125: coming back to the app only COUNTS day-old fares and offers one tap.
  document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible') tripStaleNudge(); });
}

function initTripIdeaBuilder(){
  tripLegsWire();
  setTimeout(function(){ tripStaleNudge(); }, 2500); // PIA-125: after the token / account check at boot
  var c=_tripIdeaEl('build-trip-idea-btn'); if(c) c.onclick=function(){tripIdeaBuilderOpen();};
  var bd=_tripIdeaEl('trip-idea-builder-bd');if(bd)bd.onclick=function(e){if(e.target===bd)tripIdeaBuilderClose();};
  document.addEventListener('keydown',function(e){if(e.key==='Escape' && _tripIdeaBuilderOpen)tripIdeaBuilderClose();});
  var raw='', ideaId=''; try{var q=new URLSearchParams(window.location.search);raw=q.get('tripIdea')||'';ideaId=q.get('idea')||'';}catch(e){}
  if(/^[A-Za-z0-9_-]{22}$/.test(ideaId)){ var took=_tripIdeaTakeHashKey(ideaId), k=_tripIdeaKeys(); tripIdeaSetGuest(!(k[ideaId] && k[ideaId].edit_key)); _tripIdeaOpenRemote(ideaId); if(took) showShareToast('🔑 This device can now manage this trip'); }
  else if(raw){var payload=restoreTripIdeaSharePayload(raw);if(payload){_tripIdeaOpenShared(payload);}}
  window.tripIdeaBuilder=tripIdeaBuilder;
}

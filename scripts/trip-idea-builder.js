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
function tripIdeaBuilderClose(){ _tripIdeaHide(); if(_tripIdeaBuilderLaunch && _tripIdeaBuilderLaunch.focus) _tripIdeaBuilderLaunch.focus(); }
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
  var primaryBtn = _tripIdeaEl('trip-idea-builder-primary'); if (primaryBtn) primaryBtn.hidden = _tripIdeaBuilderStage === 'shared';
  sheet.querySelectorAll('[data-idea-open]').forEach(function(b){b.onclick=function(){_tripIdeaOpenRemote(b.getAttribute('data-idea-open'));};});
  sheet.querySelectorAll('[data-idea-action]').forEach(function(b){b.onclick=function(){var a=b.getAttribute('data-idea-action');if(a==='respond')_tripIdeaRespond();else if(a==='nudge'&&_tripIdeaShared)tripIdeaNudge(_tripIdeaShared.id);else if(typeof tripIdeaDecisionAction==='function')tripIdeaDecisionAction(a);};});
  sheet.querySelectorAll('[data-trip-mode]').forEach(function(b){b.onclick=function(){tripIdeaBuilder.mode=b.getAttribute('data-trip-mode');renderTripIdeaBuilder();};});
  sheet.querySelectorAll('[data-trip-date-mode]').forEach(function(b){b.onclick=function(){_tripIdeaReadInputs();_tripIdeaDateMode=b.getAttribute('data-trip-date-mode')==='window'?'window':'specific';renderTripIdeaBuilder();};});
  ['trip-idea-city','trip-idea-departure','trip-idea-return','trip-idea-search-start','trip-idea-search-end'].forEach(function(id){var input=_tripIdeaEl(id);if(input){input.addEventListener('input',_tripIdeaSyncPrimary);input.addEventListener('change',_tripIdeaSyncPrimary);}});
  sheet.querySelectorAll('[data-trip-result]').forEach(function(b){b.onclick=function(){var id=b.getAttribute('data-trip-result'), r=(tripIdeaBuilder._results||[]).filter(function(x){return x.id===id;})[0]; if(r){tripIdeaBuilder.recommendation=r;renderTripIdeaResults(_tripIdeaEl('trip-idea-builder-body'));tripIdeaFocusMap(r);}};});
  sheet.querySelectorAll('[data-trip-action]').forEach(function(b){b.onclick=function(){var a=b.getAttribute('data-trip-action');if(a==='refresh'){tripIdeaRunSearch();}if(a==='provider'){var r=tripIdeaBuilder.recommendation||{};var u=typeof gflightsUrl==='function'?gflightsUrl(r.fareFrom||r.hub,r.fareTo||r.airport,r.departure,r.return):'https://www.google.com/travel/flights';window.open(u,'_blank','noopener');}};});
  var primary=_tripIdeaEl('trip-idea-builder-primary'); if(primary) primary.onclick=function(){if(_tripIdeaBuilderReadOnly){_tripIdeaBuilderReadOnly=false;_tripIdeaBuilderStage='inputs';renderTripIdeaBuilder();return;}if(_tripIdeaBuilderStage==='intent'){_tripIdeaBuilderStage='inputs';renderTripIdeaBuilder();return;}if(_tripIdeaBuilderStage==='inputs'){tripIdeaRunSearch();return;} _tripIdeaSave();};
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
var TRIP_IDEA_RSVP_LABELS = {in:'✅ In', maybe:'🤔 Maybe', out:'❌ Out', pending:'⏳ No answer yet'};
var _tripIdeaShared = null; // {id, doc, editKey, error}

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
function tripIdeaFamilyEstimate(rec) {
  var r = rec || {}, city = {airport:r.airport, alternatives:r.alternatives || []}, total = 0, missing = 0, cached = 0, priced = 0;
  var parts = TRIP_IDEA_HUBS.map(function(hub){
    var hc = tripIdeaHubHeadcount(hub, r.departure);
    if (hub.airports.indexOf(r.airport) >= 0) return {hub:hub.key, from:r.airport, perTicket:0, headcount:hc, status:'host'};
    var p = tripIdeaFareFor(hub, city, r.departure, r.return);
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
  return doc && doc.responses && Object.keys(doc.responses).length ? 'answered' : 'proposed';
}
function summarizeIdeaResponses(doc) {
  var members = (doc && doc.idea && doc.idea.members) || [], resp = (doc && doc.responses) || {};
  var counts = {in:0, maybe:0, out:0, pending:0}, travelersIn = 0;
  var rows = members.map(function(m){
    var r = resp[m.code] || null, status = r ? r.status : 'pending';
    counts[status] = (counts[status] || 0) + 1;
    if (status === 'in') travelersIn += Number(m.headcount) || 1;
    return {code:m.code, label:m.label || m.code, headcount:Number(m.headcount) || 1, status:status,
      origin:(r && r.origin) || m.airport || '', available_from:(r && r.available_from) || '', available_to:(r && r.available_to) || '', note:(r && r.note) || ''};
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
function tripIdeaSharedState() { return _tripIdeaShared; } // read accessor (tests, debugging)
function _tripIdeaKeys() {
  try { return JSON.parse(localStorage.getItem(TRIP_IDEA_KEYS_STORAGE)) || {}; } catch (e) { return {}; }
}
function _tripIdeaSaveKey(id, editKey, title) {
  var keys = _tripIdeaKeys(); keys[id] = {edit_key:editKey, title:title || '', created_at:new Date().toISOString()};
  try { localStorage.setItem(TRIP_IDEA_KEYS_STORAGE, JSON.stringify(keys)); } catch (e) {}
}
function _tripIdeaApi(method, path, body) {
  var base = typeof PROXY_URL === 'string' ? PROXY_URL.replace(/\/+$/, '') : '';
  if (!base) return Promise.resolve({ok:false, status:0, json:null});
  var opts = {method:method, headers:{'Content-Type':'application/json'}};
  if (body) opts.body = JSON.stringify(body);
  return fetch(base + path, opts).then(function(res){
    return res.text().then(function(t){ var j = null; try { j = JSON.parse(t); } catch (e) {} return {ok:res.ok, status:res.status, json:j}; });
  }).catch(function(){ return {ok:false, status:0, json:null}; });
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
    return tripIdeaSendInvite(res.json.doc);
  });
}
function _tripIdeaOpenRemote(id) {
  var keys = _tripIdeaKeys();
  _tripIdeaShared = {id:id, doc:null, editKey:(keys[id] && keys[id].edit_key) || '', error:''};
  _tripIdeaBuilderReadOnly = false; _tripIdeaBuilderStage = 'shared';
  _tripIdeaShow(); renderTripIdeaBuilder();
  return _tripIdeaApi('GET', '/idea?id=' + encodeURIComponent(id)).then(function(res){
    if (!_tripIdeaShared || _tripIdeaShared.id !== id) return;
    if (res.ok && res.json && res.json.doc) { _tripIdeaShared.doc = res.json.doc; if (typeof tripIdeaStoreDoc === 'function') tripIdeaStoreDoc(res.json.doc); if (_tripIdeaShared.editKey && typeof tripIdeaMarkSeen === 'function') { tripIdeaMarkSeen(res.json.doc); if (typeof renderWatchlist === 'function') try { renderWatchlist(); } catch (e) {} } if (typeof tripIdeaRecordDecision === 'function' && _tripIdeaShared.editKey) tripIdeaRecordDecision(res.json.doc); }
    else _tripIdeaShared.error = res.status === 404 ? 'This trip idea was not found — it may have expired.' : res.status === 501 || res.status === 0 ? 'Shared trip ideas are not available right now.' : 'Could not load this trip idea.';
    if (_tripIdeaBuilderStage === 'shared') renderTripIdeaBuilder();
  });
}
function _tripIdeaRespond() {
  var sh = _tripIdeaShared; if (!sh || !sh.doc) return Promise.resolve(null);
  var val = function(id){ return ((_tripIdeaEl(id) || {}).value || '').trim(); };
  var checked = document.querySelector('input[name="trip-idea-rsvp-status"]:checked');
  var body = {member:val('trip-idea-rsvp-member'), status:checked ? checked.value : '', origin:val('trip-idea-rsvp-origin').toUpperCase(),
    available_from:val('trip-idea-rsvp-from'), available_to:val('trip-idea-rsvp-to'), note:val('trip-idea-rsvp-note')};
  if (!body.member || !body.status) { showShareToast('Pick who you are and in / maybe / out'); return Promise.resolve(null); }
  if (body.available_from && body.available_to && body.available_to < body.available_from) { showShareToast('"Free until" must be after "Free from"'); return Promise.resolve(null); }
  return _tripIdeaApi('POST', '/idea/respond?id=' + encodeURIComponent(sh.id), body).then(function(res){
    if (res.ok && res.json && res.json.doc) { sh.doc = res.json.doc; if (typeof tripIdeaStoreDoc === 'function') tripIdeaStoreDoc(sh.doc); showShareToast('✓ Answer saved — thanks!'); renderTripIdeaBuilder(); return res.json.doc; }
    showShareToast(res.status === 409 ? 'This trip is already decided' : 'Could not save your answer — try again');
    return null;
  });
}
function renderTripIdeaShared(target) {
  var sh = _tripIdeaShared;
  if (!sh || (!sh.doc && !sh.error)) { target.innerHTML = '<div class="trip-idea-empty">Loading trip idea…</div>'; return; }
  if (!sh.doc) { target.innerHTML = '<div class="trip-idea-empty">' + _tripIdeaEsc(sh.error) + '</div>'; return; }
  var doc = sh.doc, idea = doc.idea || {}, r = idea.recommendation || {}, sum = summarizeIdeaResponses(doc), win = ideaCommonWindow(doc);
  var closed = sum.stage === 'booked' || sum.stage === 'dropped';
  var dates = (r.departure || idea.dates && idea.dates.departure || 'Dates TBD') + (r.return ? ' → ' + r.return : '');
  var fare = (r.familyTotal != null ? 'Whole family ≈ $' + Number(r.familyTotal).toLocaleString('en-US') + ' (' + (r.familyStatus === 'cached' ? 'cached fares' : 'estimate') + ') · ' : '') +
    (r.totalFare ? '$' + r.totalFare + (r.headcount > 1 ? ' ($' + r.perTicketFare + ' × ' + r.headcount + ')' : '') + ' from ' + (r.fareFrom || r.hub || '') : 'Fare not priced yet');
  var html = '<div class="trip-idea-results-summary"><strong>' + _tripIdeaEsc(idea.title || 'Trip idea') + '</strong><span class="trip-idea-stage trip-idea-stage-' + sum.stage + '">' + _tripIdeaEsc(sum.stage) + '</span></div>' +
    '<div class="trip-idea-result selected"><span class="trip-idea-result-head"><strong>' + _tripIdeaEsc(r.city || idea.destination && idea.destination.city || 'Destination TBD') + '</strong><b>' + _tripIdeaEsc(dates) + '</b></span><span>' + _tripIdeaEsc(fare) + '</span>' + (idea.notes ? '<span>' + _tripIdeaEsc(idea.notes) + '</span>' : '') + '</div>' +
    '<div class="trip-idea-rsvp-summary"><strong>' + sum.counts.in + ' in · ' + sum.counts.maybe + ' maybe · ' + sum.counts.out + ' out · ' + sum.counts.pending + ' waiting</strong><span>' + sum.travelersIn + ' traveler' + (sum.travelersIn === 1 ? '' : 's') + ' confirmed' +
    (win ? ' · ' + (win.overlaps ? 'everyone who gave dates is free ' + _tripIdeaEsc((win.from || '…') + ' → ' + (win.to || '…')) : 'no dates work for everyone yet') : '') + '</span></div>' +
    '<ul class="trip-idea-rsvp-list">' + sum.rows.map(function(x){
      return '<li><strong>' + _tripIdeaEsc(x.label) + (x.headcount > 1 ? ' (' + x.headcount + ')' : '') + '</strong><span>' + _tripIdeaEsc(TRIP_IDEA_RSVP_LABELS[x.status] || x.status) + (x.origin ? ' · from ' + _tripIdeaEsc(x.origin) : '') +
        (x.available_from || x.available_to ? ' · free ' + _tripIdeaEsc((x.available_from || '…') + ' → ' + (x.available_to || '…')) : '') + '</span>' + (x.note ? '<small>' + _tripIdeaEsc(x.note) + '</small>' : '') + '</li>';
    }).join('') + '</ul>';
  if (!closed) {
    html += '<form class="trip-idea-plan trip-idea-rsvp-form" onsubmit="return false"><strong>Your answer</strong><div class="trip-idea-grid">' +
      '<label>Who are you?<select id="trip-idea-rsvp-member"><option value="">Choose…</option>' + sum.rows.map(function(x){ return '<option value="' + _tripIdeaEsc(x.code) + '">' + _tripIdeaEsc(x.label) + '</option>'; }).join('') + '</select></label>' +
      '<label>Flying from<input id="trip-idea-rsvp-origin" maxlength="3" placeholder="e.g. LAX" autocapitalize="characters"></label></div>' +
      '<div class="trip-idea-date-mode" role="radiogroup" aria-label="Are you in?">' + ['in','maybe','out'].map(function(st){ return '<label class="trip-idea-rsvp-choice"><input type="radio" name="trip-idea-rsvp-status" value="' + st + '"> ' + _tripIdeaEsc(TRIP_IDEA_RSVP_LABELS[st]) + '</label>'; }).join('') + '</div>' +
      '<div class="trip-idea-date-fields"><label>Free from <span>Optional</span><input id="trip-idea-rsvp-from" type="date"></label><label>Free until <span>Optional</span><input id="trip-idea-rsvp-to" type="date"></label></div>' +
      '<label class="trip-idea-notes">Note <span>Optional</span><textarea id="trip-idea-rsvp-note" rows="2" maxlength="280" placeholder="Anything the group should know"></textarea></label>' +
      '<button type="button" class="trip-idea-rsvp-send" data-idea-action="respond">Send my answer</button></form>';
  } else {
    html += '<div class="trip-idea-empty">This trip is ' + _tripIdeaEsc(sum.stage) + ' — answers are closed.</div>';
  }
  if (!closed && sum.counts.pending && sh.editKey) html += '<div class="trip-idea-decision-row" style="margin-top:10px"><button type="button" class="secondary trip-idea-rsvp-send" data-idea-action="nudge">📣 Nudge ' + sum.counts.pending + ' waiting</button></div>';
  if (typeof renderTripIdeaDecisionPanel === 'function') html += renderTripIdeaDecisionPanel(doc, !!sh.editKey);
  target.innerHTML = html;
  var sel = _tripIdeaEl('trip-idea-rsvp-member'), origin = _tripIdeaEl('trip-idea-rsvp-origin');
  if (sel && origin) sel.onchange = function(){ var x = sum.rows.filter(function(m){ return m.code === sel.value; })[0]; if (x && !origin.value) origin.value = x.origin || ''; };
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
  var decision = action === 'choose' ? {stage:'chosen'} : action === 'drop' ? {stage:'dropped'} : action === 'reopen' ? {stage:'proposed'} : null;
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
      '👥 ' + s.counts.in + ' in · ' + s.counts.maybe + ' maybe · ' + s.counts.out + ' out' + (s.counts.pending ? ' · ' + s.counts.pending + ' waiting' : '');
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
    tripIdeaSendInvite(res.json.doc);
    if (typeof renderWatchlist === 'function') renderWatchlist();
    return res.json.id;
  });
}
// ── PIA-078: distribution to the family group text ─────────────────────────
// Phones open the native share sheet (iMessage / WhatsApp / etc.); anything
// without navigator.share copies the same text + link. Text and url are passed
// separately so Messages renders one link preview instead of a duplicate.
var TRIP_IDEA_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function tripIdeaDateRange(dep, ret) {
  var p = function(s){ var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? {m:+m[2] - 1, d:+m[3]} : null; };
  var a = p(dep), b = p(ret);
  if (!a) return 'dates TBD';
  if (!b) return TRIP_IDEA_MONTHS[a.m] + ' ' + a.d;
  return TRIP_IDEA_MONTHS[a.m] + ' ' + a.d + '–' + (b.m === a.m ? '' : TRIP_IDEA_MONTHS[b.m] + ' ') + b.d;
}
function tripIdeaShareText(doc, kind) {
  var idea = (doc && doc.idea) || {}, r = idea.recommendation || {}, d = idea.dates || {};
  var title = String(idea.title || 'Trip idea').replace(/\s+trip$/i, '') + ' trip';
  var when = tripIdeaDateRange(r.departure || d.departure || d.searchStart, r.return || d.return || d.searchEnd);
  if (kind === 'nudge') {
    var waiting = summarizeIdeaResponses(doc).rows.filter(function(x){ return x.status === 'pending'; }).map(function(x){ return x.label; });
    return '✈️ ' + title + ' (' + when + ') — still need an answer from ' + (waiting.length ? waiting.join(' and ') : 'everyone') + '. In / maybe / out?';
  }
  var cost = r.familyTotal != null ? ' — whole family ≈ $' + Number(r.familyTotal).toLocaleString('en-US') : '';
  return '✈️ ' + title + ' ' + when + cost + '. Are you in? Tap to answer in / maybe / out:';
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
  var url = _tripIdeaShareUrl({idea:doc.id});
  return tripIdeaDistribute((doc.idea && doc.idea.title) || 'Trip idea', tripIdeaShareText(doc, kind || 'invite'), url).then(function(){ return url; });
}
function tripIdeaNudge(id) {
  var doc = tripIdeaCachedDoc(id) || (_tripIdeaShared && _tripIdeaShared.id === id ? _tripIdeaShared.doc : null);
  if (!doc) return Promise.resolve(null);
  return tripIdeaSendInvite(doc, 'nudge');
}
// Calendar hold for the proposed dates, with the RSVP link inside the event.
function tripIdeaHoldDates(itemId) {
  var item = typeof watchlistItem === 'function' ? watchlistItem(itemId) : null;
  if (!item || !item.sharedIdeaId) return null;
  var doc = tripIdeaCachedDoc(item.sharedIdeaId), r = (doc && doc.idea && doc.idea.recommendation) || {};
  var dep = item.dep || r.departure, ret = item.ret || r.return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dep || ''))) { showShareToast('Add trip dates first'); return null; }
  var url = _tripIdeaShareUrl({idea:item.sharedIdeaId});
  if (!(Array.isArray(item.calendarEvents) && item.calendarEvents.length)) {
    item.calendarEvents = [{title:'✈️ ' + String(item.title || 'Family trip').replace(/\s*·\s*Trip idea$/, '') + ' (proposed — RSVP)', start:dep,
      end:typeof _wlNextDay === 'function' ? _wlNextDay(ret || dep) : (ret || dep), location:(r.city || item.hub || ''), notes:'Are you in? Answer here: ' + url}];
    if (typeof saveWatchlist === 'function') saveWatchlist();
  }
  if (typeof addWatchlistTripToCalendar === 'function') addWatchlistTripToCalendar(item.id);
  return item.calendarEvents;
}
// Card actions (expanded card). Family trips and builder ideas can ask the family.
function tripIdeaCardActionsHtml(item) {
  if (!item || item.stage === 'completed') return '';
  var b = function(cls, label){ return '<button type="button" class="' + cls + ' wl-act" data-id="' + _tripIdeaEsc(item.id) + '" style="color:var(--accent);border:1px solid var(--accent);">' + label + '</button>'; };
  if (item.sharedIdeaId) {
    var doc = tripIdeaCachedDoc(item.sharedIdeaId), pending = doc ? summarizeIdeaResponses(doc).counts.pending : 0;
    return b('wl-idea-open', '👥 See answers') + (pending ? b('wl-idea-nudge', '📣 Nudge ' + pending + ' waiting') : '') + b('wl-idea-hold', '📅 Hold the dates');
  }
  if (item.mode === 'family' || item.builderMetadata) return b('wl-idea-ask', '👥 Ask the family');
  return '';
}
function tripIdeaWireCardActions(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('.wl-idea-open').forEach(function(el){ el.addEventListener('click', function(e){ e.stopPropagation(); var t = watchlistItem(el.getAttribute('data-id')); if (t && t.sharedIdeaId) _tripIdeaOpenRemote(t.sharedIdeaId); }); });
  root.querySelectorAll('.wl-idea-nudge').forEach(function(el){ el.addEventListener('click', function(e){ e.stopPropagation(); var t = watchlistItem(el.getAttribute('data-id')); if (t && t.sharedIdeaId) tripIdeaNudge(t.sharedIdeaId); }); });
  root.querySelectorAll('.wl-idea-hold').forEach(function(el){ el.addEventListener('click', function(e){ e.stopPropagation(); tripIdeaHoldDates(el.getAttribute('data-id')); }); });
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
    var st = memberStatusFromIdea(doc, S.depDate), ms = {};
    Object.keys(st).forEach(function(c){ if (st[c] !== 'in') ms[c] = st[c]; });
    S.memberStatus = ms;
    S.tentativeMembers = Object.keys(ms).filter(function(k){ return ms[k] === 'tentative'; });
    try { if (typeof renderMeetupStrip === 'function') renderMeetupStrip(); if (typeof renderMeetupRoutes === 'function') renderMeetupRoutes(); if (typeof redrawMap === 'function') redrawMap(); } catch (e) {}
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
    S.linkedIdeaId = null; S.memberStatus = {}; S.tentativeMembers = [];
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
    var status = r.status === 'in' ? 'confirmed' : r.status === 'out' ? 'out' : 'tentative';
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

function initTripIdeaBuilder(){
  var c=_tripIdeaEl('build-trip-idea-btn'); if(c) c.onclick=function(){tripIdeaBuilderOpen();};
  var bd=_tripIdeaEl('trip-idea-builder-bd');if(bd)bd.onclick=function(e){if(e.target===bd)tripIdeaBuilderClose();};
  document.addEventListener('keydown',function(e){if(e.key==='Escape' && _tripIdeaBuilderOpen)tripIdeaBuilderClose();});
  var raw='', ideaId=''; try{var q=new URLSearchParams(window.location.search);raw=q.get('tripIdea')||'';ideaId=q.get('idea')||'';}catch(e){}
  if(/^[A-Za-z0-9_-]{22}$/.test(ideaId)){_tripIdeaOpenRemote(ideaId);}
  else if(raw){var payload=restoreTripIdeaSharePayload(raw);if(payload){_tripIdeaOpenShared(payload);}}
  window.tripIdeaBuilder=tripIdeaBuilder;
}

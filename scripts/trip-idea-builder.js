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
      var d0 = _tripIdeaISO(cursor), r0 = _tripIdeaAddDays(d0, wanted);
      if (r0 <= _tripIdeaISO(finish)) out.push({departure:d0, return:r0, tripLength:wanted, changedIndependently:false});
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return out;
}

function tripIdeaScore(result, context) {
  var r = result || {}, c = context || {}, fare = Number(r.totalFare);
  var fareScore = isFinite(fare) ? Math.max(0, Math.min(100, 100 - fare / 12)) : 0;
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
  }).sort(function(a,b){ return b.scoreBreakdown.score - a.scoreBreakdown.score || Number(a.totalFare || Infinity) - Number(b.totalFare || Infinity); });
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
  match.slice(0, 8).forEach(function(city, ci){ hubs.forEach(function(hub, hi){ pairs.slice(0, 8).forEach(function(pair, pi){
    var fare = 145 + ci * 31 + hi * 24 + (pair.tripLength || 3) * 9 + (s.mode === 'spontaneous' ? ci * 7 : 0);
    var same = hub.airports.indexOf(city.airport) >= 0;
    if (same) fare = 0;
    out.push({id:'trip-'+ci+'-'+hi+'-'+pi, city:city.city, airport:city.airport, alternatives:(city.alternatives || []).slice(), hub:hub.key, departure:pair.departure, return:pair.return, tripLength:pair.tripLength, changedIndependently:pair.changedIndependently, totalFare:fare, nonstop:!same && (city.airport === 'RDU' || city.airport === 'LAX'), durationHours:same ? 0 : 4.5 + hi, savedCity:!!city.saved, priceStatus:s.priceStatus || 'estimated'});
  }); }); });
  return rankTripIdeaRecommendations(out, s).slice(0, 12);
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
  var n = normalizeTripIdeaBuilderState(state).dates.flexibilityDays;
  return n ? 'Independent dates ±' + n + ' day' + (n === 1 ? '' : 's') : 'Exact dates';
}
function createTripIdeaWatchlistItem(builder, recommendation, options) {
  var s = normalizeTripIdeaBuilderState(builder), r = recommendation || s.recommendation || {};
  var stamp = (options && options.timestamp) || new Date().toISOString();
  return {id:'builder-'+Date.now().toString(36), _added:true, mode:'solo', title:(r.city || s.destination.city || 'Trip idea') + ' · Trip idea', routeTxt:(r.hub || s.baseHub) + ' → ' + (r.airport || s.destination.airport || 'TBD'), origin:(r.hub === 'LAX' ? 'LAX' : 'PIA'), dest:r.airport || s.destination.airport || 'TBD', dep:r.departure || s.dates.departure || null, ret:r.return || s.dates.return || null, stage:'watching', notes:String(options && options.notes || ''), reminders:[], nextAction:'Refresh pricing before booking', blockers:[], builderMetadata:{version:TRIP_IDEA_BUILDER_VERSION,mode:s.mode,baseHub:s.baseHub,destination:s.destination,dates:s.dates,constraints:s.constraints,recommendation:r,priceStatus:s.priceStatus,recommendationTimestamp:stamp,wishlistDestinationPriority:!!r.savedCity,eventContext:s.constraints.eventDate || ''}, gf:{from:r.hub || 'LAX',to:r.airport || ''}};
}

var tripIdeaBuilder = createTripIdeaBuilderState();
var _tripIdeaBuilderStage = 'intent', _tripIdeaBuilderOpen = false, _tripIdeaBuilderReadOnly = false, _tripIdeaBuilderLaunch = null;

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
  _tripIdeaBuilderReadOnly = false; _tripIdeaBuilderStage = 'intent';
  tripIdeaBuilder = createTripIdeaBuilderState(tripIdeaBuilder);
  if (mode === 'dates-first' || mode === 'city-first' || mode === 'spontaneous') tripIdeaBuilder.mode = mode;
  _tripIdeaShow(); renderTripIdeaBuilder();
  setTimeout(function(){ var x=_tripIdeaEl('trip-idea-intent-'+tripIdeaBuilder.mode); if(x) x.focus(); },0);
}
function tripIdeaBuilderClose(){ _tripIdeaHide(); if(_tripIdeaBuilderLaunch && _tripIdeaBuilderLaunch.focus) _tripIdeaBuilderLaunch.focus(); }
function _tripIdeaSetStage(stage){ _tripIdeaBuilderStage=stage; renderTripIdeaBuilder(); }
function _tripIdeaCitySuggestions(){
  return TRIP_IDEA_DESTINATIONS.map(function(c){ return '<option value="'+_tripIdeaEsc(c.city)+'">'+_tripIdeaEsc(c.airport)+' · '+_tripIdeaEsc(c.city)+'</option>'; }).join('');
}
function _tripIdeaInputsHtml(){
  var s=tripIdeaBuilder, d=s.dates, c=s.constraints;
  return '<div class="trip-idea-grid">' +
    '<label>Destination city or airport<input id="trip-idea-city" list="trip-idea-city-list" value="'+_tripIdeaEsc(s.destination.city || s.destination.airport)+'" placeholder="Cary, RDU, NYC…"><datalist id="trip-idea-city-list">'+_tripIdeaCitySuggestions()+'</datalist><small>Saved cities and nearby airports are ranked first.</small></label>' +
    '<label>Base hub<select id="trip-idea-hub"><option value="all">All base hubs</option>'+TRIP_IDEA_HUBS.map(function(h){return '<option value="'+h.key+'"'+(s.baseHub===h.key?' selected':'')+'>'+h.label+' · '+h.description+'</option>';}).join('')+'</select></label>' +
    '<label>Departure<input id="trip-idea-departure" type="date" value="'+d.departure+'"></label>' +
    '<label>Return<input id="trip-idea-return" type="date" value="'+d.return+'"></label>' +
    '<label>Search window start<input id="trip-idea-search-start" type="date" value="'+d.searchStart+'"></label>' +
    '<label>Search window end<input id="trip-idea-search-end" type="date" value="'+d.searchEnd+'"></label>' +
    '<label>Flexibility<select id="trip-idea-flex"><option value="0"'+(!d.flexibilityDays?' selected':'')+'>Exact dates</option><option value="1"'+(d.flexibilityDays===1?' selected':'')+'>±1 day, independent</option><option value="2"'+(d.flexibilityDays===2?' selected':'')+'>±2 days, independent</option></select></label>' +
    '<label>Trip length (nights)<input id="trip-idea-length" type="number" min="1" max="30" value="'+(c.tripLength || '')+'" placeholder="3"></label>' +
    '<label>Event date (optional)<input id="trip-idea-event" type="date" value="'+c.eventDate+'"></label>' +
    '<label class="trip-idea-check"><input id="trip-idea-nonstop" type="checkbox"'+(c.nonstopPreferred?' checked':'')+'> Prefer nonstop</label>' +
    '<label class="trip-idea-notes">Notes or family context<textarea id="trip-idea-notes" rows="2" placeholder="Event, companions, lodging…"></textarea></label>' +
    '</div>';
}
function renderTripIdeaBuilder(){
  var body=_tripIdeaEl('trip-idea-builder-body'), title=_tripIdeaEl('trip-idea-builder-title'), step=_tripIdeaEl('trip-idea-builder-step'), primary=_tripIdeaEl('trip-idea-builder-primary');
  if(!body) return;
  if(title) title.textContent=_tripIdeaBuilderReadOnly?'Shared trip idea':'Build a trip idea';
  if(step) step.textContent=_tripIdeaBuilderReadOnly?'Read-only proposal':'Stage '+(_tripIdeaBuilderStage==='intent'?1:_tripIdeaBuilderStage==='inputs'?2:3)+' of 3';
  if(primary) primary.textContent=_tripIdeaBuilderStage==='intent'?'Continue':(_tripIdeaBuilderStage==='inputs'?'Find recommendations':'Save selected idea');
  if(_tripIdeaBuilderStage==='intent'){
    body.innerHTML='<p class="trip-idea-lead">Start with what you know. PIALAX will keep exact inputs, flexible combinations, and estimated pricing separate.</p><div class="trip-idea-intents">'+
      [['dates-first','📅 Dates first','Choose dates; rank destination cities.'],['city-first','📍 City first','Choose a destination; find the best dates in the next 90 days.'],['spontaneous','✨ Feeling spontaneous','Choose a window; find a low-fare suitable destination.']].map(function(x){return '<button type="button" class="trip-idea-intent'+(tripIdeaBuilder.mode===x[0]?' selected':'')+'" id="trip-idea-intent-'+x[0]+'" data-trip-mode="'+x[0]+'"><strong>'+x[1]+'</strong><span>'+x[2]+'</span></button>';}).join('')+'</div>';
  } else if(_tripIdeaBuilderStage==='inputs'){
    body.innerHTML='<div class="trip-idea-mode-note"><strong>'+_tripIdeaEsc(tripIdeaBuilder.mode.replace('-',' '))+'</strong> · USA-first · '+_tripIdeaEsc(tripIdeaFlexibilityLabel(tripIdeaBuilder))+'</div>'+_tripIdeaInputsHtml();
    var notes=_tripIdeaEl('trip-idea-notes'); if(notes && tripIdeaBuilder._notes) notes.value=tripIdeaBuilder._notes;
  } else {
    renderTripIdeaResults(body);
  }
  if(_tripIdeaBuilderReadOnly && _tripIdeaBuilderStage==='intent') _tripIdeaBuilderStage='results';
  _tripIdeaWireStage();
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
  if(tripIdeaBuilder.mode==='city-first' && !tripIdeaBuilder.dates.searchStart && !tripIdeaBuilder.dates.searchEnd){
    var now=new Date(), end=new Date(now.getTime()); end.setDate(end.getDate()+90);
    tripIdeaBuilder.dates.searchStart=_tripIdeaISO(now); tripIdeaBuilder.dates.searchEnd=_tripIdeaISO(end);
  }
  tripIdeaBuilder=normalizeTripIdeaBuilderState(tripIdeaBuilder);
}
function tripIdeaRunSearch(){
  _tripIdeaReadInputs();
  var destinations=TRIP_IDEA_DESTINATIONS.map(function(c){var x=Object.assign({},c); var saved=_tripIdeaSavedCities().some(function(s){return String(s.city||'').toLowerCase().indexOf(c.city.toLowerCase())>=0 || String(s.dest||'').toUpperCase()===c.airport;}); x.saved=saved; return x;});
  var rows=buildTripIdeaRecommendations(tripIdeaBuilder,destinations);
  if(tripIdeaBuilder.mode==='spontaneous') rows=rows.sort(function(a,b){return a.totalFare-b.totalFare || b.scoreBreakdown.score-a.scoreBreakdown.score;});
  tripIdeaBuilder.recommendation=rows[0] || null; tripIdeaBuilder.priceStatus='estimated'; tripIdeaBuilder._results=rows;
  _tripIdeaBuilderStage='results'; renderTripIdeaBuilder(); tripIdeaFocusMap(rows[0]);
}
function renderTripIdeaResults(target){
  var rows=tripIdeaBuilder._results || (tripIdeaBuilder.recommendation ? [tripIdeaBuilder.recommendation] : []);
  if(!rows.length){target.innerHTML='<div class="trip-idea-empty">No suitable combinations yet. Adjust the window or destination.</div>';return;}
  target.innerHTML='<div class="trip-idea-results-summary"><strong>'+rows.length+' recommendations</strong><span>'+_tripIdeaEsc(tripIdeaFlexibilityLabel(tripIdeaBuilder))+' · estimates until a provider refresh</span></div><div class="trip-idea-results">'+rows.map(function(r,i){
    var selected=tripIdeaBuilder.recommendation && tripIdeaBuilder.recommendation.id===r.id;
    var status=r.priceStatus||'estimated', dates=(r.departure||'Dates TBD')+(r.return?' → '+r.return:'');
    return '<button type="button" class="trip-idea-result'+(selected?' selected':'')+'" data-trip-result="'+_tripIdeaEsc(r.id)+'"><span class="trip-idea-result-head"><strong>'+_tripIdeaEsc(r.city)+'</strong><b>'+(r.totalFare?'$'+r.totalFare:'Provider handoff')+'</b></span><span>'+_tripIdeaEsc(r.hub)+' → '+_tripIdeaEsc(r.airport)+' · '+_tripIdeaEsc(dates)+'</span><span>'+_tripIdeaEsc((r.tripLength || '—')+' nights')+' · '+(r.changedIndependently?'dates changed independently · ':'')+_tripIdeaEsc(tripIdeaFlexibilityLabel(tripIdeaBuilder))+'</span><span class="trip-idea-badges">'+(r.savedCity?'<em>Saved city</em> ':'')+'<em>'+_tripIdeaEsc(status)+'</em><em>Score '+r.scoreBreakdown.score+'/100</em></span></button>';
  }).join('')+'</div><div id="trip-idea-map-summary" class="trip-idea-map-summary"></div><div class="trip-idea-result-actions"><button type="button" data-trip-action="refresh">↻ Refresh pricing</button><button type="button" data-trip-action="provider">Open provider handoff</button></div>';
  tripIdeaFocusMap(tripIdeaBuilder.recommendation);
}
function tripIdeaFocusMap(r){
  if(!r) return;
  tripIdeaBuilder.recommendation=r;
  var el=_tripIdeaEl('trip-idea-map-summary'); if(el) el.innerHTML='<strong>Map focus</strong><span>'+_tripIdeaEsc(r.hub)+' → '+_tripIdeaEsc(r.airport)+' · '+_tripIdeaEsc(r.departure || 'dates TBD')+(r.return?' → '+_tripIdeaEsc(r.return):'')+'</span><small>Fare labels show only this selected route · '+_tripIdeaEsc(r.priceStatus || 'estimated')+'</small>';
  try { if(typeof selectMapHubFocus==='function' && (r.hub==='LAX' || r.hub==='PIA_ORD' || r.hub==='LGA_JFK')) selectMapHubFocus(r.hub); else if(typeof redrawMap==='function') redrawMap(); } catch(e) {}
}
function _tripIdeaSave(){
  var r=tripIdeaBuilder.recommendation; if(!r){showShareToast('Select a recommendation first');return null;}
  var item=createTripIdeaWatchlistItem(tripIdeaBuilder,r,{notes:tripIdeaBuilder._notes});
  if(typeof WATCHLIST!=='undefined'){ WATCHLIST.push(item); if(typeof saveWatchlist==='function') saveWatchlist(); if(typeof renderWatchlist==='function') renderWatchlist(); }
  showShareToast('✓ Saved to Trip Ideas'); return item;
}
function _tripIdeaShare(){
  var payload=serializeTripIdeaSharePayload(tripIdeaBuilder,tripIdeaBuilder.recommendation,{fareStatus:tripIdeaBuilder.priceStatus,notes:tripIdeaBuilder._notes});
  var code=encodeTripIdeaSharePayload(payload), sp=new URLSearchParams(window.location.search); sp.set('tripIdea',code);
  var url=window.location.origin+window.location.pathname+'?'+sp.toString();
  if(typeof copyRouteText==='function') copyRouteText('✈️ Shared Trip Idea\\n'+url); else if(navigator.clipboard) navigator.clipboard.writeText(url);
  showShareToast('✓ Read-only proposal link copied'); return url;
}
function _tripIdeaOpenShared(payload){
  if(!payload || !payload.builder) return;
  tripIdeaBuilder=createTripIdeaBuilderState(payload.builder); tripIdeaBuilder.recommendation=payload.recommendation || null; tripIdeaBuilder._results=payload.recommendation ? [payload.recommendation] : []; tripIdeaBuilder._notes=payload.notes || ''; _tripIdeaBuilderReadOnly=true; _tripIdeaBuilderStage='results'; _tripIdeaShow(); renderTripIdeaBuilder();
}
function _tripIdeaWireStage(){
  var sheet=_tripIdeaEl('trip-idea-builder'); if(!sheet) return;
  var resultsStage = _tripIdeaBuilderStage === 'results';
  var copyBtn = _tripIdeaEl('trip-idea-builder-copy'), editBtn = _tripIdeaEl('trip-idea-builder-edit'), shareBtn = _tripIdeaEl('trip-idea-builder-share'), saveBtn = _tripIdeaEl('trip-idea-builder-save');
  var calendarBtn = _tripIdeaEl('trip-idea-builder-calendar');
  if (copyBtn) copyBtn.hidden = !(resultsStage && _tripIdeaBuilderReadOnly);
  if (editBtn) editBtn.hidden = !(resultsStage && _tripIdeaBuilderReadOnly);
  if (shareBtn) shareBtn.hidden = !resultsStage;
  if (saveBtn) saveBtn.hidden = !resultsStage;
  if (calendarBtn) calendarBtn.hidden = !resultsStage;
  sheet.querySelectorAll('[data-trip-mode]').forEach(function(b){b.onclick=function(){tripIdeaBuilder.mode=b.getAttribute('data-trip-mode');renderTripIdeaBuilder();};});
  sheet.querySelectorAll('[data-trip-result]').forEach(function(b){b.onclick=function(){var id=b.getAttribute('data-trip-result'), r=(tripIdeaBuilder._results||[]).filter(function(x){return x.id===id;})[0]; if(r){tripIdeaBuilder.recommendation=r;renderTripIdeaResults(_tripIdeaEl('trip-idea-builder-body'));tripIdeaFocusMap(r);}};});
  sheet.querySelectorAll('[data-trip-action]').forEach(function(b){b.onclick=function(){var a=b.getAttribute('data-trip-action');if(a==='refresh'){tripIdeaRunSearch();}if(a==='provider'){var r=tripIdeaBuilder.recommendation||{};var u=typeof gflightsUrl==='function'?gflightsUrl(r.hub,r.airport,r.departure,r.return):'https://www.google.com/travel/flights';window.open(u,'_blank','noopener');}};});
  var primary=_tripIdeaEl('trip-idea-builder-primary'); if(primary) primary.onclick=function(){if(_tripIdeaBuilderReadOnly){_tripIdeaBuilderReadOnly=false;_tripIdeaBuilderStage='inputs';renderTripIdeaBuilder();return;}if(_tripIdeaBuilderStage==='intent'){_tripIdeaBuilderStage='inputs';renderTripIdeaBuilder();return;}if(_tripIdeaBuilderStage==='inputs'){tripIdeaRunSearch();return;} _tripIdeaSave();};
  var share=_tripIdeaEl('trip-idea-builder-share');if(share)share.onclick=_tripIdeaShare;
  var save=_tripIdeaEl('trip-idea-builder-save');if(save)save.onclick=_tripIdeaSave;
  if(calendarBtn) calendarBtn.onclick=function(){var item=_tripIdeaSave();if(item && typeof addWatchlistTripToCalendar==='function') addWatchlistTripToCalendar(item.id);};
  var edit=_tripIdeaEl('trip-idea-builder-edit');if(edit)edit.onclick=function(){_tripIdeaBuilderReadOnly=false;_tripIdeaBuilderStage='inputs';renderTripIdeaBuilder();};
  var copy=_tripIdeaEl('trip-idea-builder-copy');if(copy)copy.onclick=function(){_tripIdeaBuilderReadOnly=false;_tripIdeaBuilderStage='inputs';renderTripIdeaBuilder();};
  sheet.querySelectorAll('[data-trip-close]').forEach(function(b){b.onclick=tripIdeaBuilderClose;});
}
function initTripIdeaBuilder(){
  var c=_tripIdeaEl('build-trip-idea-btn'); if(c) c.onclick=function(){tripIdeaBuilderOpen();};
  var bd=_tripIdeaEl('trip-idea-builder-bd');if(bd)bd.onclick=function(e){if(e.target===bd)tripIdeaBuilderClose();};
  document.addEventListener('keydown',function(e){if(e.key==='Escape' && _tripIdeaBuilderOpen)tripIdeaBuilderClose();});
  var raw=''; try{raw=new URLSearchParams(window.location.search).get('tripIdea')||'';}catch(e){}
  if(raw){var payload=restoreTripIdeaSharePayload(raw);if(payload){_tripIdeaOpenShared(payload);}}
  window.tripIdeaBuilder=tripIdeaBuilder;
}

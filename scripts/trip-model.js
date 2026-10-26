'use strict';
// trip-model.js — PIA-132: the v2 trip model. One /idea record (plus this
// phone's identity, keys and fare cache) → everything a v2 screen shows, so
// no two screens or phones can disagree on a date, a total, a hub or a stage.
//
// Contract:
//   • Pure. No DOM, no network, no storage, no clock: `today` (the phone's
//     local 'YYYY-MM-DD') and `now` (epoch ms) are always parameters.
//   • The record is the only store of trip facts. Field rules follow worker.js
//     validateIdea / validateResponse / applyDecision; the Worker is fixed.
//   • Write builders return request descriptors {method, path, body} and never
//     lose data: answers are always sent complete, airport picks only when they
//     change, organizer edits start from a fresh record.
//   • Prices come only from real cached fares (pialax_fares_v2). Nothing here
//     reads a price stored in the record, and nothing estimates a missing fare.
//   • PIA-133: one link builder for every hand-off (Google Flights, Explore,
//     Flighty, calendars, the guest link), recomputed from the record on each
//     render and opened in a new tab. Calendar events and shares carry only the
//     guest /i/<id> link, never an edit key or token.
//
// The region between the begin/end markers is inlined byte-identical into the
// app IIFE of app.html (PIA-134 drift test). It must never contain
// console.log or a closing script tag; test-trip-model.js lints it. The Node
// export guard stays outside the markers.

/* === pialax trip-model: begin === */
/* ---- record rules shared with worker.js (fixed backend) and v1 ---- */
var IDEA_HUBS = [['PIA', 'ORD'], ['LGA', 'JFK']];                        // = worker.js IDEA_HUBS
var NEARBY_GROUPS = [['LAX', 'BUR', 'LGB', 'SNA', 'ONT'], ['LGA', 'JFK', 'EWR']]; // = v1 TRIP_NEARBY_GROUPS
var DRIVE_PIVOT = { PIA: ['PIA', 'ORD'] };                               // Peoria travelers can drive to and from O'Hare
var DRIVE = { 'PIA|ORD': '2:30', 'LGA|JFK': '0:45' };                    // drive time between a hub pair
var IDEA_MAX_MEMBERS = 8;                                                // = worker.js IDEA_MAX_MEMBERS
var IDEA_STATUSES = { in: 1, maybe: 1, out: 1 };
var IDEA_STAGES = { proposed: 1, chosen: 1, booked: 1, dropped: 1 };
var IDEA_ID_RE = /^[A-Za-z0-9_-]{22}$/;
var IDEA_KEY_RE = /^[A-Za-z0-9_-]{32,64}$/;
var MEMBER_CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;                            // = worker.js CODE_RE
var IATA_CODE_RE = /^[A-Z]{3}$/;
var ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
var HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
var TEXT_MAX = { title: 80, city: 60, label: 40, notes: 500, note: 280 }; // the Worker's ideaStr limits (UTF-16 units)
var FARE_STALE_MS = 24 * 36e5;
var BOOK_BY_DAYS = 21;
var FLEX_DAYS = 7;                                                       // a blank flex window = plan ± 7 days
var DAY_MS = 864e5;
var FACES = ['🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐸', '🐙', '🦉', '🐝', '🌻', '🌽', '🍉', '🍕', '🎸', '🎨', '🚲', '🗽', '🐳', '🦄', '🍩', '🐢', '🦋', '🌴', '💪'];
/* a face derived from a name (hashedFace, autoFace) comes from the first FACE_RING faces only, so a face appended to
   FACES (PIA-150: 💪) never moves a face already derived for a faceless v1 label or an auto-assigned row */
var FACE_RING = 24;
var SCENES = ['🦃', '🎄', '🪔', '🎉', '🎂', '💍', '🌊', '🗻', '🌆', '🌵', '🎿', '⚾', '⛺'];
var PALETTE_SIZE = 8;
var GF_SEARCH = 'https://www.google.com/travel/flights/search';
var GF_TAIL = '&hl=en&gl=us&curr=USD';
var GF_EXPLORE = 'https://www.google.com/travel/explore?hl=en&gl=us&curr=USD';   // unprefilled: no Explore encoding is verified live
var GF_QUERY = 'https://www.google.com/travel/flights?q=';                       // the q= fallback (only when the tfs encoder fails)
var FLIGHTY_URL = 'https://www.flighty.com/';                                    // = v1's hand-off; Flighty documents no deep link
var GCAL_TEMPLATE = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
var WORKER_URL = 'https://pialax-proxy.ashwinyedavalli.workers.dev';             // = v1 PROXY_URL; serves the guest /i/<id> links
var WORKER_RE = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev$/i;          // = v1's proxy URL check: no path, query or fragment
var HANDOFF_TARGET = '_blank';
var HANDOFF_REL = 'noopener noreferrer';
/* IATA metropolitan-area codes: q= drops to a blank page on them (NYC was checked live), so the fallback never sends one */
var METRO_CODES = ['NYC', 'CHI', 'WAS', 'DTT', 'YTO', 'YMQ', 'LON', 'PAR', 'MIL', 'ROM', 'STO', 'MOW', 'TYO', 'OSA', 'SEL', 'BJS', 'SAO', 'RIO', 'BUE'];

/* The family preset (v1 FAMILY / FAMILY_INFO / familyForDate). Anjo flies from
   JAX before 2026-09-01 and from LGA from that day on; JFK is her alternate
   through the NY set. Labels are v2 constants: v1 labelled LAX 'Me'. */
var FAMILY = [
  { key: 'momdad', face: '🌽', name: 'Mom & Dad', airport: 'PIA', headcount: 2 },
  { key: 'ashwin', face: '💪', name: 'Ashwin', airport: 'LAX', headcount: 1 },
  { key: 'anjo', face: '🗽', name: 'Anjo', airport: 'JAX', headcount: 1, moveDate: '2026-09-01', moveAirport: 'LGA' }
];
/* v1 docs carry no faces: P-migrate suggests them by home airport. */
var FAMILY_BY_AIRPORT = { PIA: 'momdad', ORD: 'momdad', LAX: 'ashwin', LGA: 'anjo', JFK: 'anjo', EWR: 'anjo', JAX: 'anjo' };

/* Airports: IATA → [city, lat, lon]. Source: OurAirports airports.csv
   (https://ourairports.com/data/, public domain), fetched 2026-10-18,
   sha256 0499dbd88de2fc73…. Every US large_airport with scheduled service, plus
   hand-picked US medium and major international airports, all with an IATA
   code. City names are shortened by hand; lat/lon are rounded to 0.01°. PBI is
   kept beside DJT, the code OurAirports now lists for Palm Beach. Any other
   3-letter code is still accepted: it just has no city or coordinates. */
var AIRPORTS = {
  ABE: ['Allentown', 40.65, -75.44], ABQ: ['Albuquerque', 35.04, -106.61], ACC: ['Accra', 5.61, -0.17], ACK: ['Nantucket', 41.25, -70.06],
  ACV: ['Eureka', 40.98, -124.11], ADD: ['Addis Ababa', 8.98, 38.8], ADL: ['Adelaide', -34.95, 138.53], AGP: ['Málaga', 36.68, -4.5],
  AGS: ['Augusta', 33.37, -81.96], AKL: ['Auckland', -37.01, 174.79], ALB: ['Albany', 42.75, -73.8], AMA: ['Amarillo', 35.22, -101.71],
  AMD: ['Ahmedabad', 23.08, 72.63], AMM: ['Amman', 31.72, 35.99], AMS: ['Amsterdam', 52.31, 4.76], ANC: ['Anchorage', 61.18, -149.99],
  ANU: ['Antigua', 17.14, -61.79], ARN: ['Stockholm', 59.65, 17.93], ASE: ['Aspen', 39.22, -106.87], ATH: ['Athens', 37.94, 23.94],
  ATL: ['Atlanta', 33.64, -84.43], ATW: ['Appleton', 44.26, -88.52], AUA: ['Aruba', 12.5, -70.01], AUH: ['Abu Dhabi', 24.44, 54.65],
  AUS: ['Austin', 30.2, -97.66], AVL: ['Asheville', 35.44, -82.54], AVP: ['Scranton', 41.34, -75.72], BCN: ['Barcelona', 41.3, 2.08],
  BDA: ['Bermuda', 32.36, -64.68], BDL: ['Hartford', 41.94, -72.69], BER: ['Berlin', 52.36, 13.5], BGI: ['Barbados', 13.07, -59.49],
  BGR: ['Bangor', 44.81, -68.83], BHM: ['Birmingham', 33.56, -86.75], BIL: ['Billings', 45.81, -108.54], BIS: ['Bismarck', 46.77, -100.75],
  BKK: ['Bangkok', 13.68, 100.75], BLR: ['Bengaluru', 13.2, 77.71], BMI: ['Bloomington', 40.48, -88.92], BNA: ['Nashville', 36.12, -86.68],
  BNE: ['Brisbane', -27.38, 153.12], BOG: ['Bogotá', 4.7, -74.15], BOI: ['Boise', 43.56, -116.22], BOM: ['Mumbai', 19.09, 72.87],
  BOS: ['Boston', 42.36, -71.01], BRU: ['Brussels', 50.9, 4.48], BTR: ['Baton Rouge', 30.53, -91.15], BTV: ['Burlington', 44.47, -73.15],
  BUD: ['Budapest', 47.43, 19.26], BUF: ['Buffalo', 42.94, -78.73], BUR: ['Burbank', 34.2, -118.36], BWI: ['Baltimore', 39.18, -76.67],
  BZE: ['Belize City', 17.54, -88.3], BZN: ['Bozeman', 45.78, -111.15], CAE: ['Columbia', 33.94, -81.12], CAI: ['Cairo', 30.11, 31.4],
  CAK: ['Akron', 40.92, -81.44], CAN: ['Guangzhou', 23.39, 113.3], CCU: ['Kolkata', 22.65, 88.45], CDG: ['Paris', 49.01, 2.55],
  CEB: ['Cebu', 10.31, 123.98], CGK: ['Jakarta', -6.13, 106.66], CHA: ['Chattanooga', 35.04, -85.2], CHC: ['Christchurch', -43.49, 172.53],
  CHS: ['Charleston', 32.9, -80.04], CID: ['Cedar Rapids', 41.88, -91.71], CLE: ['Cleveland', 41.41, -81.85], CLT: ['Charlotte', 35.21, -80.94],
  CMB: ['Colombo', 7.18, 79.88], CMH: ['Columbus', 40, -82.89], CMI: ['Champaign', 40.04, -88.28], CMN: ['Casablanca', 33.37, -7.59],
  CNS: ['Cairns', -16.88, 145.75], CNX: ['Chiang Mai', 18.77, 98.96], COK: ['Kochi', 10.15, 76.4], COS: ['Colorado Springs', 38.81, -104.7],
  CPH: ['Copenhagen', 55.62, 12.66], CPT: ['Cape Town', -33.97, 18.6], CRP: ['Corpus Christi', 27.77, -97.5], CTG: ['Cartagena', 10.44, -75.51],
  CTS: ['Sapporo', 42.77, 141.69], CTU: ['Chengdu', 30.56, 103.95], CUN: ['Cancún', 21.04, -86.87], CUR: ['Curaçao', 12.19, -68.96],
  CUZ: ['Cusco', -13.54, -71.94], CVG: ['Cincinnati', 39.05, -84.67], CZM: ['Cozumel', 20.51, -86.93], DAB: ['Daytona Beach', 29.18, -81.06],
  DAC: ['Dhaka', 23.84, 90.4], DAL: ['Dallas', 32.84, -96.85], DAY: ['Dayton', 39.9, -84.22], DCA: ['Washington', 38.85, -77.04],
  DEL: ['Delhi', 28.56, 77.1], DEN: ['Denver', 39.86, -104.67], DFW: ['Dallas', 32.9, -97.04], DJT: ['West Palm Beach', 26.68, -80.1],
  DOH: ['Doha', 25.27, 51.61], DPS: ['Bali', -8.75, 115.17], DRO: ['Durango', 37.15, -107.75], DSM: ['Des Moines', 41.53, -93.66],
  DTW: ['Detroit', 42.21, -83.35], DUB: ['Dublin', 53.43, -6.26], DUS: ['Düsseldorf', 51.29, 6.77], DXB: ['Dubai', 25.25, 55.37],
  ECP: ['Panama City Beach', 30.36, -85.8], EDI: ['Edinburgh', 55.95, -3.37], EGE: ['Vail', 39.64, -106.92], ELM: ['Elmira', 42.16, -76.89],
  ELP: ['El Paso', 31.81, -106.38], EUG: ['Eugene', 44.12, -123.21], EWR: ['Newark', 40.69, -74.17], EYW: ['Key West', 24.56, -81.76],
  EZE: ['Buenos Aires', -34.82, -58.54], FAI: ['Fairbanks', 64.82, -147.86], FAR: ['Fargo', 46.92, -96.82], FAT: ['Fresno', 36.78, -119.72],
  FCA: ['Kalispell', 48.31, -114.26], FCO: ['Rome', 41.8, 12.25], FLL: ['Fort Lauderdale', 26.07, -80.15], FRA: ['Frankfurt', 50.03, 8.56],
  FSD: ['Sioux Falls', 43.59, -96.74], FUK: ['Fukuoka', 33.59, 130.45], FWA: ['Fort Wayne', 40.98, -85.19], GCM: ['Grand Cayman', 19.29, -81.36],
  GDL: ['Guadalajara', 20.52, -103.31], GEG: ['Spokane', 47.62, -117.53], GIG: ['Rio de Janeiro', -22.81, -43.25], GJT: ['Grand Junction', 39.13, -108.53],
  GLA: ['Glasgow', 55.87, -4.43], GOI: ['Goa', 15.38, 73.83], GRB: ['Green Bay', 44.48, -88.13], GRR: ['Grand Rapids', 42.88, -85.52],
  GRU: ['São Paulo', -23.43, -46.47], GSO: ['Greensboro', 36.1, -79.94], GSP: ['Greenville', 34.9, -82.22], GUA: ['Guatemala City', 14.58, -90.53],
  GVA: ['Geneva', 46.24, 6.11], GYE: ['Guayaquil', -2.16, -79.88], HAM: ['Hamburg', 53.63, 9.99], HAN: ['Hanoi', 21.22, 105.81],
  HAV: ['Havana', 22.99, -82.41], HDN: ['Steamboat Springs', 40.48, -107.22], HEL: ['Helsinki', 60.32, 24.96], HKG: ['Hong Kong', 22.31, 113.91],
  HKT: ['Phuket', 8.11, 98.32], HND: ['Tokyo', 35.55, 139.79], HNL: ['Honolulu', 21.32, -157.93], HOU: ['Houston', 29.65, -95.28],
  HPN: ['White Plains', 41.07, -73.71], HRL: ['Harlingen', 26.23, -97.65], HYA: ['Hyannis', 41.67, -70.28], HYD: ['Hyderabad', 17.23, 78.43],
  IAD: ['Washington', 38.94, -77.46], IAH: ['Houston', 29.98, -95.34], ICN: ['Seoul', 37.47, 126.45], IDA: ['Idaho Falls', 43.51, -112.07],
  ILM: ['Wilmington', 34.27, -77.91], IND: ['Indianapolis', 39.72, -86.29], ISP: ['Islip', 40.8, -73.1], IST: ['Istanbul', 41.27, 28.73],
  ITH: ['Ithaca', 42.49, -76.46], ITO: ['Hilo', 19.72, -155.05], JAC: ['Jackson Hole', 43.61, -110.74], JAN: ['Jackson', 32.31, -90.08],
  JAX: ['Jacksonville', 30.49, -81.69], JED: ['Jeddah', 21.68, 39.16], JFK: ['New York', 40.64, -73.78], JNB: ['Johannesburg', -26.14, 28.25],
  JNU: ['Juneau', 58.35, -134.57], KEF: ['Reykjavík', 63.99, -22.61], KIN: ['Kingston', 17.94, -76.79], KIX: ['Osaka', 34.43, 135.24],
  KOA: ['Kona', 19.74, -156.05], KRK: ['Kraków', 50.08, 19.78], KTM: ['Kathmandu', 27.7, 85.36], KUL: ['Kuala Lumpur', 2.75, 101.71],
  LAN: ['Lansing', 42.78, -84.59], LAS: ['Las Vegas', 36.08, -115.15], LAX: ['Los Angeles', 33.94, -118.41], LBB: ['Lubbock', 33.66, -101.82],
  LEX: ['Lexington', 38.04, -84.61], LFT: ['Lafayette', 30.21, -91.99], LGA: ['New York', 40.78, -73.87], LGB: ['Long Beach', 33.82, -118.15],
  LGW: ['London', 51.15, -0.19], LHR: ['London', 51.47, -0.46], LIH: ['Lihue', 21.97, -159.34], LIM: ['Lima', -12.02, -77.11],
  LIR: ['Liberia', 10.59, -85.54], LIS: ['Lisbon', 38.78, -9.14], LIT: ['Little Rock', 34.73, -92.22], LOS: ['Lagos', 6.58, 3.32],
  LYS: ['Lyon', 45.73, 5.09], MAA: ['Chennai', 12.99, 80.17], MAD: ['Madrid', 40.49, -3.57], MAF: ['Midland', 31.94, -102.2],
  MAN: ['Manchester', 53.35, -2.28], MBJ: ['Montego Bay', 18.5, -77.91], MCI: ['Kansas City', 39.3, -94.71], MCO: ['Orlando', 28.43, -81.31],
  MDE: ['Medellín', 6.16, -75.42], MDW: ['Chicago', 41.79, -87.75], MEL: ['Melbourne', -37.67, 144.84], MEM: ['Memphis', 35.04, -89.98],
  MEX: ['Mexico City', 19.44, -99.07], MFE: ['McAllen', 26.18, -98.24], MFM: ['Macau', 22.15, 113.59], MFR: ['Medford', 42.37, -122.87],
  MHT: ['Manchester', 42.93, -71.44], MIA: ['Miami', 25.8, -80.29], MID: ['Mérida', 20.93, -89.65], MKE: ['Milwaukee', 42.95, -87.9],
  MLB: ['Melbourne', 28.1, -80.64], MLE: ['Malé', 4.19, 73.53], MLI: ['Moline', 41.45, -90.51], MNL: ['Manila', 14.51, 121.02],
  MOB: ['Mobile', 30.69, -88.24], MRY: ['Monterey', 36.59, -121.84], MSN: ['Madison', 43.14, -89.34], MSO: ['Missoula', 46.92, -114.09],
  MSP: ['Minneapolis', 44.88, -93.22], MSY: ['New Orleans', 29.99, -90.26], MTJ: ['Montrose', 38.51, -107.89], MTY: ['Monterrey', 25.78, -100.11],
  MUC: ['Munich', 48.35, 11.79], MVD: ['Montevideo', -34.84, -56.03], MXP: ['Milan', 45.63, 8.73], MYR: ['Myrtle Beach', 33.68, -78.93],
  NAN: ['Nadi', -17.76, 177.44], NAP: ['Naples', 40.89, 14.29], NAS: ['Nassau', 25.04, -77.47], NBO: ['Nairobi', -1.32, 36.93],
  NCE: ['Nice', 43.66, 7.22], NGO: ['Nagoya', 34.86, 136.8], NRT: ['Tokyo', 35.77, 140.39], OAK: ['Oakland', 37.72, -122.22],
  OAX: ['Oaxaca', 17, -96.73], OGG: ['Maui', 20.9, -156.43], OKA: ['Naha', 26.19, 127.64], OKC: ['Oklahoma City', 35.39, -97.6],
  OMA: ['Omaha', 41.3, -95.89], ONT: ['Ontario', 34.06, -117.6], OPO: ['Porto', 41.25, -8.68], ORD: ['Chicago', 41.98, -87.9],
  ORF: ['Norfolk', 36.9, -76.2], ORY: ['Paris', 48.73, 2.36], OSL: ['Oslo', 60.19, 11.1], PBI: ['West Palm Beach', 26.68, -80.1],
  PDX: ['Portland', 45.59, -122.6], PEK: ['Beijing', 40.08, 116.6], PER: ['Perth', -31.94, 115.97], PGD: ['Punta Gorda', 26.92, -81.99],
  PHL: ['Philadelphia', 39.87, -75.24], PHX: ['Phoenix', 33.44, -112.01], PIA: ['Peoria', 40.66, -89.69], PIE: ['St. Petersburg', 27.91, -82.69],
  PIT: ['Pittsburgh', 40.49, -80.23], PKX: ['Beijing', 39.5, 116.41], PLS: ['Turks and Caicos', 21.77, -72.27], PMI: ['Palma de Mallorca', 39.55, 2.74],
  PNS: ['Pensacola', 30.47, -87.19], POS: ['Port of Spain', 10.6, -61.34], PPT: ['Papeete', -17.55, -149.61], PRG: ['Prague', 50.1, 14.26],
  PSC: ['Pasco', 46.26, -119.12], PSP: ['Palm Springs', 33.83, -116.51], PTY: ['Panama City', 9.07, -79.38], PUJ: ['Punta Cana', 18.57, -68.36],
  PVD: ['Providence', 41.73, -71.43], PVG: ['Shanghai', 31.14, 121.81], PVR: ['Puerto Vallarta', 20.68, -105.25], PWM: ['Portland', 43.65, -70.31],
  RAK: ['Marrakesh', 31.6, -8.04], RAP: ['Rapid City', 44.05, -103.06], RDM: ['Bend', 44.25, -121.15], RDU: ['Raleigh', 35.88, -78.79],
  RIC: ['Richmond', 37.51, -77.32], RNO: ['Reno', 39.5, -119.77], ROC: ['Rochester', 43.12, -77.67], RSW: ['Fort Myers', 26.53, -81.75],
  RUH: ['Riyadh', 24.96, 46.7], SAL: ['San Salvador', 13.44, -89.06], SAN: ['San Diego', 32.73, -117.19], SAT: ['San Antonio', 29.53, -98.47],
  SAV: ['Savannah', 32.13, -81.2], SAW: ['Istanbul', 40.9, 29.31], SBA: ['Santa Barbara', 34.43, -119.84], SBD: ['San Bernardino', 34.1, -117.24],
  SBN: ['South Bend', 41.71, -86.32], SBP: ['San Luis Obispo', 35.24, -120.64], SCL: ['Santiago', -33.39, -70.79], SDF: ['Louisville', 38.17, -85.74],
  SDQ: ['Santo Domingo', 18.43, -69.67], SEA: ['Seattle', 47.45, -122.31], SFB: ['Orlando', 28.77, -81.23], SFO: ['San Francisco', 37.62, -122.37],
  SGF: ['Springfield', 37.25, -93.39], SGN: ['Ho Chi Minh City', 10.82, 106.65], SHA: ['Shanghai', 31.2, 121.33], SHV: ['Shreveport', 32.44, -93.83],
  SIN: ['Singapore', 1.35, 103.99], SJC: ['San Jose', 37.36, -121.93], SJD: ['San José del Cabo', 23.15, -109.72], SJO: ['San José', 9.99, -84.21],
  SJU: ['San Juan', 18.44, -66], SLC: ['Salt Lake City', 40.79, -111.98], SMF: ['Sacramento', 38.7, -121.59], SNA: ['Santa Ana', 33.68, -117.87],
  SNN: ['Shannon', 52.7, -8.92], SPI: ['Springfield', 39.84, -89.68], SRQ: ['Sarasota', 27.39, -82.55], STL: ['St. Louis', 38.75, -90.37],
  STN: ['London', 51.88, 0.23], STS: ['Santa Rosa', 38.51, -122.81], STT: ['St. Thomas', 18.34, -64.98], SUN: ['Sun Valley', 43.5, -114.3],
  SWF: ['Newburgh', 41.5, -74.11], SXM: ['Sint Maarten', 18.04, -63.11], SYD: ['Sydney', -33.95, 151.18], SYR: ['Syracuse', 43.11, -76.11],
  SZX: ['Shenzhen', 22.64, 113.8], TLH: ['Tallahassee', 30.4, -84.35], TLV: ['Tel Aviv', 32.01, 34.89], TOL: ['Toledo', 41.59, -83.81],
  TPA: ['Tampa', 27.98, -82.53], TPE: ['Taipei', 25.08, 121.23], TUL: ['Tulsa', 36.2, -95.89], TUS: ['Tucson', 32.12, -110.94],
  TYS: ['Knoxville', 35.81, -83.99], UIO: ['Quito', -0.13, -78.35], UVF: ['St. Lucia', 13.73, -60.95], VCE: ['Venice', 45.51, 12.35],
  VIE: ['Vienna', 48.11, 16.57], VPS: ['Destin', 30.48, -86.52], WAW: ['Warsaw', 52.17, 20.97], XIY: ['Xi\'an', 34.44, 108.76],
  XNA: ['Fayetteville', 36.28, -94.31], YEG: ['Edmonton', 53.31, -113.58], YHZ: ['Halifax', 44.88, -63.51], YOW: ['Ottawa', 45.32, -75.67],
  YQB: ['Québec', 46.79, -71.39], YUL: ['Montréal', 45.47, -73.74], YVR: ['Vancouver', 49.19, -123.18], YWG: ['Winnipeg', 49.91, -97.24],
  YYC: ['Calgary', 51.12, -114.01], YYZ: ['Toronto', 43.68, -79.63], ZQN: ['Queenstown', -45.02, 168.75], ZRH: ['Zurich', 47.46, 8.55]
};

/* ---- dates: 'YYYY-MM-DD' strings and UTC day numbers ---- */
function dn(s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY_MS; }
function ds(n) { return new Date(n * DAY_MS).toISOString().slice(0, 10); }
function isIso(s) { return typeof s === 'string' && ISO_DAY_RE.test(s) && ds(dn(s)) === s; }
function addD(s, k) { return ds(dn(s) + k); }
function diffD(a, b) { return dn(b) - dn(a); }
function md(s) { return (+s.slice(5, 7)) + '/' + (+s.slice(8, 10)); }
function dowOf(s) { return new Date(dn(s) * DAY_MS).getUTCDay(); }
function ym(s) { return s.slice(0, 7); }
function maxD(a, b) { return a > b ? a : b; }
function minD(a, b) { return a < b ? a : b; }
function nthDow(y, m, dw, n) { var f = Date.UTC(y, m - 1, 1) / DAY_MS; var fd = new Date(f * DAY_MS).getUTCDay(); return ds(f + ((dw - fd + 7) % 7) + (n - 1) * 7); }
function lastDow(y, m, dw) { var l = Date.UTC(y, m, 0) / DAY_MS; var ld = new Date(l * DAY_MS).getUTCDay(); return ds(l - ((ld - dw + 7) % 7)); }
/* holiday glyphs, computed per year; r = the default range around the day for the P-dates chips */
function holidays(y) {
  return [
    { g: '🎉', d: y + '-01-01', r: [-2, 2], k: 'h-ny' },
    { g: '🎗', d: lastDow(y, 5, 1), r: [-3, 0], k: 'h-mem' },
    { g: '🎆', d: y + '-07-04', r: [-2, 2], k: 'h-jul' },
    { g: '🌭', d: nthDow(y, 9, 1, 1), r: [-3, 0], k: 'h-lab' },
    { g: '🦃', d: nthDow(y, 11, 4, 4), r: [-1, 3], k: 'h-tg' },
    { g: '🎄', d: y + '-12-25', r: [-2, 2], k: 'h-xm' }
  ];
}
function holidayOn(s) { var hs = holidays(+s.slice(0, 4)); for (var i = 0; i < hs.length; i++) if (hs[i].d === s) return hs[i]; return null; }
function nextHolidays(from, n) { var y = +from.slice(0, 4); return holidays(y).concat(holidays(y + 1)).filter(function (h) { return h.d > from; }).slice(0, n); }

/* ---- text ---- */
function fnv1a(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
function uniq(a) { var o = []; a.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; }
function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
var PICT_RE = /\p{Extended_Pictographic}/u;
/* the Worker trims, then slices UTF-16 units; clip the same way without splitting a surrogate pair */
function clip(s, max) {
  var t = typeof s === 'string' ? s.trim() : '';
  if (t.length <= max) return t;
  var cut = max, c = t.charCodeAt(cut - 1);
  if (c >= 0xd800 && c <= 0xdbff) cut--;
  return t.slice(0, cut).trim();
}
/* a label is '<face emoji> <name>'; the face is its leading single-codepoint emoji (plus an optional VS16) */
function splitLabel(label) {
  var cps = Array.from(typeof label === 'string' ? label : '');
  if (cps.length && PICT_RE.test(cps[0])) {
    var n = cps[1] === '\uFE0F' ? 2 : 1;
    return { face: cps.slice(0, n).join(''), name: cps.slice(n).join('').trim() };
  }
  return { face: null, name: cps.join('').trim() };
}
function normName(n) { return (n || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function isMeLabel(name) { return /^me$/i.test(String(name || '').trim()); }
function shortName(n) { // ≤ 2 words that contain letters
  var out = [], w = 0, t = (n || '').split(/\s+/).filter(Boolean);
  for (var i = 0; i < t.length; i++) { if (/\p{L}/u.test(t[i])) { if (w === 2) break; w++; } out.push(t[i]); }
  while (out.length && !/\p{L}/u.test(out[out.length - 1])) out.pop();
  return out.join(' ');
}
function oneWord(n) { var m = /^(\S+)\s*&\s*(\S+)/.exec(n || ''); return m ? m[1] + ' & ' + m[2] : ((n || '').split(/\s+/)[0] || ''); }   // PIA-153: 'Mom & Dad' spelled as every sheet spells it
function slugOf(name) { var s = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 29); return s || 'm'; }
function hashedFace(norm) { return FACES[fnv1a(norm) % FACE_RING]; }
function colorOf(norm) { return fnv1a(norm) % PALETTE_SIZE; }
function memberLabel(face, name) { return clip((face ? face + ' ' : '') + String(name || '').trim(), TEXT_MAX.label); }
function titleOf(emoji, name) { return clip((emoji ? emoji + ' ' : '') + String(name || '').trim(), TEXT_MAX.title); }

/* ---- airports and the hub / metro rules ---- */
function normIata(v) { var s = typeof v === 'string' ? v.trim().toUpperCase() : ''; return IATA_CODE_RE.test(s) ? s : ''; }
function isIata(v) { return typeof v === 'string' && IATA_CODE_RE.test(v); }
function airportInfo(code) {
  var c = normIata(code), a = c ? AIRPORTS[c] : null;
  return a ? { code: c, city: a[0], lat: a[1], lon: a[2], known: true } : { code: c, city: '', lat: null, lon: null, known: false };
}
function hubPair(dest) { for (var i = 0; i < IDEA_HUBS.length; i++) if (IDEA_HUBS[i].indexOf(dest) >= 0) return IDEA_HUBS[i].slice(); return dest ? [dest] : []; }
function altOf(dest) { var h = hubPair(dest); return h.length === 2 ? (h[0] === dest ? h[1] : h[0]) : ''; }
function metroOf(dest) { for (var i = 0; i < NEARBY_GROUPS.length; i++) if (NEARBY_GROUPS[i].indexOf(dest) >= 0) return NEARBY_GROUPS[i].slice(); return []; }
function localSet(dest) { return dest ? uniq(hubPair(dest).concat(metroOf(dest))) : []; }
/* the airports searched for someone flying from `code` to `dest`: the nearby group (or the ORD drive pivot), minus the destination's own airports */
function originSet(code, dest) {
  var g = metroOf(code), set = g.length ? g : DRIVE_PIVOT[code] ? DRIVE_PIVOT[code].slice() : (code ? [code] : []);
  var loc = localSet(dest);
  return set.filter(function (c) { return loc.indexOf(c) < 0; });
}

/* ---- conventions inside free-text fields ----
   idea.notes  = ['📌YYYY-MM-DD'] ['🌙N'] caption   (any other text is kept as the caption)
   answer note = ['📞'] ['🛬HH:MM'] ['🛫HH:MM'] text  (a legacy trailing '(entered by X)' reads as 📞)
   The Worker trims both fields, so a prefix may end the string. */
function parseNotes(notes) {
  var s = typeof notes === 'string' ? notes : '', pin = '', nights = null, m;
  for (;;) {
    if ((m = /^📌(\d{4}-\d{2}-\d{2})(?: |$)/u.exec(s)) && isIso(m[1])) { pin = m[1]; s = s.slice(m[0].length); continue; }
    if ((m = /^🌙(\d{1,3})(?: |$)/u.exec(s)) && +m[1] > 0) { nights = +m[1]; s = s.slice(m[0].length); continue; }
    break;
  }
  return { pin: pin, nights: nights, caption: s };
}
function buildNotes(pin, nights, caption) {
  var parts = [];
  if (pin && isIso(pin)) parts.push('📌' + pin);
  if (nights && +nights > 0) parts.push('🌙' + Math.round(+nights));
  if (caption && String(caption).trim()) parts.push(String(caption).trim());
  return clip(parts.join(' '), TEXT_MAX.notes);
}
var LEGACY_PROXY_RE = /\s*\(entered by [^()]*\)\s*$/;
function parseRespNote(note) {
  var s = typeof note === 'string' ? note : '', called = false, arr = '', dep = '', m;
  for (;;) {
    if ((m = /^📞(?: |$)/u.exec(s))) { called = true; s = s.slice(m[0].length); continue; }
    if ((m = /^🛬(\d\d:\d\d)(?: |$)/u.exec(s)) && HHMM_RE.test(m[1])) { arr = m[1]; s = s.slice(m[0].length); continue; }
    if ((m = /^🛫(\d\d:\d\d)(?: |$)/u.exec(s)) && HHMM_RE.test(m[1])) { dep = m[1]; s = s.slice(m[0].length); continue; }
    break;
  }
  if (LEGACY_PROXY_RE.test(s)) { called = true; s = s.replace(LEGACY_PROXY_RE, ''); }
  return { called: called, arr: arr, dep: dep, text: s.trim() };
}
function buildRespNote(called, arr, dep, text) {
  var parts = [];
  if (called) parts.push('📞');
  if (arr && HHMM_RE.test(arr)) parts.push('🛬' + arr);
  if (dep && HHMM_RE.test(dep)) parts.push('🛫' + dep);
  if (text && String(text).trim()) parts.push(String(text).trim());
  return clip(parts.join(' '), TEXT_MAX.note);
}

/* ---- Google Flights tfs encoder (scratchpad gf-tfs.js, live-verified 2026-10-17) ----
   Schema: fast-flights / krisukox protobuf with Google's envelope. o = {legs:[{date, from:[], to:[]}], adults, trip:1 RT|2 OW|3 multi}.
   The app never adds nonstop or airline filters; they exist for the E7 golden only. */
function gfTfs(o) {
  var out = [];
  function vint(n) {
    if (n < 0) { out.push(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01); return; }
    do { var b = n & 0x7f; n = Math.floor(n / 128); out.push(n ? b | 0x80 : b); } while (n);
  }
  function str(s) { for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0x7f); }
  function msg(field, fill) { var saved = out; out = []; fill(); var body = out; out = saved; vint(field * 8 + 2); vint(body.length); for (var i = 0; i < body.length; i++) out.push(body[i]); }
  function txt(field, s) { msg(field, function () { str(s); }); }
  function num(field, n) { vint(field * 8); vint(n); }
  function places(field, codes) { [].concat(codes).forEach(function (c) { msg(field, function () { num(1, 1); txt(2, c); }); }); }
  num(1, 28); num(2, 2);
  o.legs.forEach(function (L) {
    msg(3, function () {
      txt(2, L.date);
      if (L.nonstop) num(5, 0);
      (L.airlines || []).forEach(function (a) { txt(6, a); });
      places(13, L.from); places(14, L.to);
    });
  });
  for (var i = 0; i < (o.adults || 1); i++) num(8, 1);
  num(9, o.cabin || 1);
  num(14, 1); msg(16, function () { vint(8); vint(-1); });
  num(19, o.trip || (o.legs.length === 1 ? 2 : 1));
  var bin = String.fromCharCode.apply(null, out);
  var b64 = (typeof btoa === 'function' ? btoa(bin) : Buffer.from(out).toString('base64'));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function gfSearchUrl(o) { return GF_SEARCH + '?tfs=' + gfTfs(o) + GF_TAIL; }
/* decoder for the builder's self-check and for tests: {legs:[{date, from, to, stops, airlines}], adults, trip, cabin,
   fields (top-level field numbers, in order)}. stops is null and airlines empty when the leg has no such filter. */
function gfDecode(href) {
  var m = /[?&]tfs=([^&]+)/.exec(href || ''); if (!m) return null;
  var s = m[1].replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  var bin = (typeof atob === 'function') ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  var b = []; for (var i = 0; i < bin.length; i++) b.push(bin.charCodeAt(i));
  function vr(buf, st) { var v = 0, sh = 0, x; do { x = buf[st.i++]; if (sh < 49) v += (x & 0x7f) * Math.pow(2, sh); sh += 7; } while (x & 0x80); return v; }
  function rd(buf) {
    var st = { i: 0 }, res = [];
    while (st.i < buf.length) {
      var key = vr(buf, st), f = Math.floor(key / 8), wt = key % 8;
      if (wt === 0) res.push({ f: f, v: vr(buf, st) });
      else if (wt === 2) { var l = vr(buf, st); res.push({ f: f, b: buf.slice(st.i, st.i + l) }); st.i += l; }
      else throw new Error('wire type ' + wt);
    }
    return res;
  }
  var legs = [], adults = 0, trip = 0, cabin = 0, fields = [];
  rd(b).forEach(function (e) {
    fields.push(e.f);
    if (e.f === 3) {
      var L = { date: '', from: [], to: [], stops: null, airlines: [] };
      rd(e.b).forEach(function (x) {
        if (x.f === 2 && x.b) L.date = String.fromCharCode.apply(null, x.b);
        if (x.f === 5 && !x.b) L.stops = x.v;
        if (x.f === 6 && x.b) L.airlines.push(String.fromCharCode.apply(null, x.b));
        if ((x.f === 13 || x.f === 14) && x.b) { var c = ''; rd(x.b).forEach(function (y) { if (y.f === 2 && y.b) c = String.fromCharCode.apply(null, y.b); }); (x.f === 13 ? L.from : L.to).push(c); }
      });
      legs.push(L);
    }
    if (e.f === 8) adults++;
    if (e.f === 9) cabin = e.v;
    if (e.f === 19) trip = e.v;
  });
  return { legs: legs, adults: adults, trip: trip, cabin: cabin, fields: fields };
}

/* ---- one traveler's legs, link plan and fare keys ----
   A round trip (A = H) is one round-trip search; open-jaw (A ≠ H) is one
   multi-city link and is priced as two one-way searches. n = headcount. */
function legPlan(O, A, H, d1, d2, n) {
  if (A === H) return { trip: 1, adults: n, legs: [{ date: d1, from: O, to: [A] }, { date: d2, from: [A], to: O }] };
  return { trip: 3, adults: n, legs: [{ date: d1, from: O, to: [A] }, { date: d2, from: [H], to: O }] };
}
/* PIA-140: a fare key names one search: its airports are a set, sorted and de-duplicated (the Worker's cache order), so the
   key v1 caches a search under and the key this model prices it by are the same search */
function codeSet(a) { return uniq([].concat(a || [])).sort().join(','); }
function fareKey(type, from, to, d, r, n) { return [type, codeSet(from), codeSet(to), d, r || '', n].join('|'); }
function legKeys(S, A, H, d1, d2, n) {
  if (A === H) return [{ kind: 'rt', key: fareKey(1, S, [A], d1, d2, n) }];
  return [{ kind: 'in', key: fareKey(2, S, [A], d1, '', n) }, { kind: 'out', key: fareKey(2, [H], S, d2, '', n) }];
}
/* a cached fare (pialax_fares_v2 entry): {p price or null, f fetched-at (ms or ISO), none, off:[{ar, dt…}]…} */
function fareAt(f) { if (!f) return NaN; return typeof f.f === 'number' ? f.f : Date.parse(f.f); }
function fareState(f, now) {
  if (!f) return 'missing';
  var at = fareAt(f);
  if (!isFinite(at) || now - at > FARE_STALE_MS) return 'stale';
  return (f.none || typeof f.p !== 'number') ? 'none' : 'fresh';
}
/* the price a cached search contributes. The search already asked for adults = headcount, so p is the
   party's price. Whether SerpAPI returns a party or a per-person price for adults > 1 is unconfirmed
   (spec risk); this is the single place to change it. */
function legTotal(f) { return f && typeof f.p === 'number' && !f.none ? f.p : null; }
/* why a traveler has nothing to search for d1–d2 ('' = searchable). One rule for the model's links and legs
   and for every cheapest-week candidate, so the two can never disagree on who is priced. origin = the member's
   own code (override or home airport). */
function legWhy(dest, O, d1, d2, today, origin) {
  if (!dest) return 'nodest';
  if (!origin) return 'noairport';     // no home airport and no override: nothing to fly from (not 'local')
  if (!O.length) return 'local';       // their origin is one of the destination's own airports: no flight to price
  if (!d1 || !d2) return 'nodates';
  if (d1 > d2) return 'order';
  if (d1 < today) return 'past';
  return '';
}

/* ---- hand-offs: the one link builder (PIA-133) ----
   Every hand-off is computed from the record on each render, never stored or cached, and opens in a new tab.
   Google Flights links are tfs searches: adults = headcount, economy, and never an airline or nonstop filter. */
function handoff(kind, href, extra) {
  var h = { kind: kind, href: href, target: HANDOFF_TARGET, rel: HANDOFF_REL };
  if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
  return h;
}
function attrEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
/* the attributes of an <a> for a hand-off: the one place that makes every hand-off open in a new tab */
function handoffAttrs(h) { return 'href="' + attrEsc(h.href) + '" target="' + HANDOFF_TARGET + '" rel="' + HANDOFF_REL + '"'; }
function isQuery(href) { return typeof href === 'string' && href.indexOf(GF_QUERY) === 0; }
/* the decoded link carries exactly the plan: trip, party, economy, each leg's date and airports, and no filters */
function gfSame(dec, o) {
  if (!dec || dec.trip !== o.trip || dec.adults !== o.adults || dec.cabin !== (o.cabin || 1) || dec.legs.length !== o.legs.length) return false;
  return o.legs.every(function (L, i) {
    var D = dec.legs[i];
    return D.date === L.date && D.from.join() === [].concat(L.from).join() && D.to.join() === [].concat(L.to).join() && D.stops === null && !D.airlines.length;
  });
}
/* a tfs search for plan o, or '' when the encoder fails: it throws, or its link does not decode back to o */
function gfTry(o) {
  try { var href = gfSearchUrl(o); return gfSame(gfDecode(href), o) ? href : ''; } catch (e) { return ''; }
}
/* The q= fallback, used only when the encoder fails, and only in the grammar verified live on 2026-10-17:
     'Flights from AAA to BBB on YYYY-MM-DD through YYYY-MM-DD[ for N adults]'
     'Flights from AAA to BBB on YYYY-MM-DD one way[ for N adults]'
   One airport code per side: never 'or', commas, metro codes, airline names, months or 'nonstop'. q= rewrites
   past dates silently, so the caller never builds one for a range that has started (legWhy). */
function gfQueryUrl(from, to, d1, d2, n) {
  if (!isIata(from) || !isIata(to) || from === to || METRO_CODES.indexOf(from) >= 0 || METRO_CODES.indexOf(to) >= 0) return '';
  if (!isIso(d1) || (d2 && (!isIso(d2) || d2 < d1))) return '';
  var k = Math.round(+n) || 1;
  if (k < 1 || k > 9) return '';
  var s = 'Flights from ' + from + ' to ' + to + ' on ' + d1 + (d2 ? ' through ' + d2 : ' one way') + (k > 1 ? ' for ' + k + ' adults' : '');
  return GF_QUERY + encodeURIComponent(s) + GF_TAIL;
}
/* One traveler's Google Flights hand-off (the one builder; the model calls it for every searchable traveler):
   • round trip (A = H): one round-trip search, O → A on d1 and A → O on d2 (trip 1);
   • open-jaw (A ≠ H): ONE multi-city link, O → A on d1 and H → O on d2 (trip 3; trip 1 would silently drop H),
     plus inHref / outHref, the two one-way searches PIALAX prices (trip 2).
   O = the origin set, n = headcount, home = the member's own code (override or home airport).
   Should the encoder fail, each search falls back to q= from the home code alone; q= cannot say open-jaw, so the
   primary then opens the inbound one-way with the outbound beside it (split: true, and trip 2, because the primary
   is then a one-way search; plan keeps the trip-3 plan). null when no link can be built at all. */
function flightLink(O, A, H, d1, d2, n, home) {
  var lp = legPlan(O, A, H, d1, d2, n);
  var one = function (i) { return { trip: 2, adults: n, legs: [lp.legs[i]] }; };
  var src = O.indexOf(home) >= 0 ? home : O[0];
  var href = gfTry(lp), split = false, inHref = '', outHref = '';
  if (lp.trip === 3) {
    inHref = gfTry(one(0)) || gfQueryUrl(src, A, d1, '', n);
    outHref = gfTry(one(1)) || gfQueryUrl(H, src, d2, '', n);
    if (!href) { href = inHref; split = true; }
  } else if (!href) href = gfQueryUrl(src, A, d1, d2, n);
  if (!href) return null;
  var link = handoff('gf', href, { trip: split ? 2 : lp.trip, plan: lp, adults: n, q: isQuery(href) || isQuery(inHref) || isQuery(outHref), split: split });
  if (lp.trip === 3) { link.inHref = inHref; link.outHref = outHref; }
  return link;
}

/* ---- reading the record ---- */
function docDest(doc) {
  var I = (doc && doc.idea) || {}, rec = I.recommendation;
  return normIata((rec && rec.airport) || (I.destination && I.destination.airport) || ''); // = worker.js ideaMutate dest
}
/* the plan: a legacy recommendation's dates win per end while it is set (the Worker preview and v1 rule) */
function docPlan(doc) {
  var I = (doc && doc.idea) || {}, rec = I.recommendation, d = I.dates || {};
  var s = (rec && rec.departure) || d.departure || '', e = (rec && rec.return) || d.return || '';
  return isIso(s) && isIso(e) && s <= e ? { s: s, e: e } : null;
}
/* a v1 doc: a recommendation is still set, or a label has no face emoji, or a label is 'Me' (read-time rules until P-migrate) */
function docLegacy(doc) {
  var I = (doc && doc.idea) || {};
  return !!I.recommendation || (I.members || []).some(function (m) { var l = splitLabel(m && m.label); return !l.face || isMeLabel(l.name); });
}
function memberOf(doc, code) { return ((doc && doc.idea && doc.idea.members) || []).filter(function (m) { return m && m.code === code; })[0] || null; }
function docClosed(doc) { var st = doc && doc.decision && doc.decision.stage; return st === 'booked' || st === 'dropped'; }
function validResp(r) { return r && typeof r === 'object' && hasOwn(IDEA_STATUSES, r.status) ? r : null; }
/* the travel dates [{d1, d2}] of every in/maybe member with this normalized name in another doc (for
   double-bookings). A dropped trip is not a trip any more, and a nameless norm ('Me') matches nobody. */
function personDatesIn(doc, norm) {
  if (!norm || !doc || (doc.decision && doc.decision.stage === 'dropped')) return [];
  var plan = docPlan(doc), R = doc.responses || {}, out = [];
  ((doc.idea && doc.idea.members) || []).forEach(function (mem) {
    if (!mem || isMeLabel(splitLabel(mem.label).name) || normName(splitLabel(mem.label).name) !== norm) return;
    var r = validResp(R[mem.code]); if (!r || (r.status !== 'in' && r.status !== 'maybe')) return;
    var d1 = (isIso(r.available_from) && r.available_from) || (plan ? plan.s : ''), d2 = (isIso(r.available_to) && r.available_to) || (plan ? plan.e : '');
    if (d1 && d2 && d1 <= d2) out.push({ d1: d1, d2: d2 });
  });
  return out;
}

/* ---- the model ----
   ctx = {today 'YYYY-MM-DD', now epoch ms, me (this phone's member code), hasEditKey, hasToken,
          fares {fareKey: entry}, multiAirport (Worker features.multi_airport), otherTrips [docs], hidden} */
function tripModel(doc, ctx) {
  ctx = ctx || {};
  var today = ctx.today, now = ctx.now;
  if (!isIso(today)) throw new Error('tripModel: ctx.today must be a YYYY-MM-DD day');
  if (typeof now !== 'number' || !isFinite(now)) throw new Error('tripModel: ctx.now must be epoch milliseconds');
  doc = doc || {};
  var I = doc.idea || {}, R = doc.responses || {}, D = doc.decision || {};
  var decision = hasOwn(IDEA_STAGES, D.stage) ? D.stage : 'proposed';
  var legacy = docLegacy(doc);
  var t = splitLabel(I.title);
  var dest = docDest(doc), hub = hubPair(dest), alt = altOf(dest), loc = localSet(dest);
  var N = parseNotes(I.notes);
  var dts = I.dates || {};
  var plan = docPlan(doc);
  var departureOnly = !plan && isIso(dts.departure) && !dts.return ? dts.departure : '';
  var nights = plan ? diffD(plan.s, plan.e) : (N.nights || null);
  var explicitWin = isIso(dts.searchStart) && isIso(dts.searchEnd) && dts.searchStart <= dts.searchEnd;
  var win = explicitWin ? { s: dts.searchStart, e: dts.searchEnd } : (plan ? { s: addD(plan.s, -FLEX_DAYS), e: addD(plan.e, FLEX_DAYS) } : null);
  var span = plan && win ? { s: minD(plan.s, win.s), e: maxD(plan.e, win.e) } : (win || plan);
  var others = (ctx.otherTrips || []).filter(function (od) { return od && od.id !== doc.id; });
  var rows = (I.members || []).filter(function (m) { return m && typeof m.code === 'string'; });
  var times = answerTimes(doc);                                           // when each member last answered (PIA-135)
  // a label with no face (v1) reads with the family preset's face for someone the preset recognises (PIA-152), else with
  // the hashed face of its name, moved on to the next free face if the trip already shows it, so two tiles never share
  // a face (the face is the primary identity): memberFaces, the faces ⤒ Update trip writes
  var faces = memberFaces(rows);
  var members = rows.map(function (m, i) {
    var r = validResp(R[m.code]);
    // a legacy 'Me' shows its face only and has no name identity until P-migrate, so nobody can pick it as a name
    var lab = splitLabel(m.label), meWord = isMeLabel(lab.name);
    var norm = meWord ? '' : normName(lab.name || '?'), name = meWord ? '' : (lab.name || '?');
    var seed = norm || '#' + m.code, face = faces[i];
    var airport = normIata(m.airport), hc = Math.max(1, Math.min(9, Math.round(+m.headcount) || 1));
    var host = !!dest && !!airport && loc.indexOf(airport) >= 0;
    var status = r ? r.status : (host ? 'host-default' : 'waiting');
    var answered = status === 'in' || status === 'maybe';
    var own1 = (r && isIso(r.available_from) && r.available_from) || '', own2 = (r && isIso(r.available_to) && r.available_to) || '';
    var d1 = own1 || (plan ? plan.s : ''), d2 = own2 || (plan ? plan.e : '');
    var hasDates = !!(d1 && d2), bad = hasDates && d1 > d2;
    var warn = [];
    if (answered && plan && ((own1 && (own1 < plan.s || own1 > plan.e)) || (own2 && (own2 < plan.s || own2 > plan.e)))) warn.push('off');
    if (answered && N.pin && hasDates && !bad && (N.pin < d1 || N.pin > d2)) warn.push('pin');
    if (bad && status !== 'out') warn.push('order');
    // stale arrive/leave picks (another destination's hub) are ignored, as the Worker does on its next write
    var A = (r && r.arrive_at && hub.indexOf(r.arrive_at) >= 0) ? r.arrive_at : dest;
    var H = (r && r.leave_from && hub.indexOf(r.leave_from) >= 0) ? r.leave_from : dest;
    var override = (r && isIata(r.origin) && r.origin !== airport) ? r.origin : '';
    var originCode = override || airport;
    var O = dest ? originSet(originCode, dest) : (originCode ? [originCode] : []);
    // without the Worker's multi-airport search a leg is priced from the home code (or the set's first code)
    var from = ctx.multiAirport ? O.slice() : (O.indexOf(originCode) >= 0 ? [originCode] : O.slice(0, 1));
    var traveler = !host && status !== 'out';
    var note = parseRespNote(r && r.note);
    var booked = !!(r && r.booked) && answered;
    var link = null, why = '', keys = [];
    if (traveler) {
      why = legWhy(dest, O, d1, d2, today, originCode);
      if (!why) {
        link = flightLink(O, A, H, d1, d2, hc, originCode);
        keys = legKeys(from, A, H, d1, d2, hc);
        if (!link) why = 'nolink';     // the encoder failed and q= refused the codes (e.g. a metro code): ✈ ⚠, still priced
      }
    }
    var clash = [];
    if (answered && hasDates && !bad) {
      others.forEach(function (od) {
        personDatesIn(od, norm).forEach(function (p) {
          var a = maxD(d1, p.d1), b = minD(d2, p.d2);
          if (a <= b) clash.push({ id: od.id, s: a, e: b, emoji: splitLabel(od.idea && od.idea.title).face || '💡' });
        });
      });
    }
    // a clash is known from this phone's own list, so only the viewer's own face carries the ⚠
    if (clash.length && ctx.me === m.code) warn.push('clash');
    return {
      // label is display-safe ('<face> <name>', the face alone for a legacy 'Me'); writes read labels from the record
      code: m.code, label: memberLabel(face, name), name: name, norm: norm, short: shortName(name), one: oneWord(name),
      face: face, color: colorOf(seed),
      airport: airport, headcount: hc, host: host, unconfirmed: host && !r, nudge: !host && status === 'waiting',
      status: status, resp: r, answered: answered,
      own1: own1, own2: own2, d1: hasDates ? d1 : '', d2: hasDates ? d2 : '', bad: bad, warn: warn, clash: clash,
      A: A, H: H, openJaw: A !== H, override: override, origin: originCode, O: O, from: from,
      traveler: traveler, booked: booked, called: note.called, arrTime: note.arr, depTime: note.dep, noteText: note.text,
      link: link, why: why, keys: keys, at: (r && r.updated_at) || '', ansAt: (r && times[m.code]) || ''
    };
  });
  var travelers = members.filter(function (x) { return x.traveler; });
  var anyBooked = travelers.some(function (x) { return x.booked; });
  var allBooked = travelers.length > 0 && travelers.every(function (x) { return x.booked; });
  var anyAnswer = members.some(function (x) { return !!x.resp; });
  var stage = decision === 'dropped' ? 'dropped'
    : (decision === 'booked' || allBooked) ? 'done'
    : anyBooked ? 'booking'
    : (decision === 'chosen' && !legacy) ? 'set'
    : anyAnswer ? 'asking' : 'idea';
  var heads = 0, headsIn = 0;
  members.forEach(function (x) { heads += x.headcount; if (x.status === 'in' || x.status === 'host-default') headsIn += x.headcount; });
  var me = ctx.me ? members.filter(function (x) { return x.code === ctx.me; })[0] || null : null;
  var org = !!ctx.hasEditKey, prices = org && !!ctx.hasToken;
  var shelf = !!((plan && plan.e < today) || (departureOnly && departureOnly < today) || decision === 'dropped' || ctx.hidden);
  var bookBy = plan ? addD(plan.s, -BOOK_BY_DAYS) : null;
  var cityInfo = airportInfo(dest);
  var model = {
    id: doc.id || '', title: typeof I.title === 'string' ? I.title : '', emoji: t.face || '💡', name: t.name,
    dest: dest, city: cityInfo.city || (I.destination && I.destination.city) || '', lat: cityInfo.lat, lon: cityInfo.lon,
    legacy: legacy, legacyLock: legacy && decision === 'chosen',
    hub: hub, alt: alt, local: loc, drive: alt ? DRIVE[hub.join('|')] || '' : '',
    plan: plan, departureOnly: departureOnly, nights: nights, win: win, explicitWin: explicitWin, span: span, undated: !plan,
    pin: N.pin, nightsN: N.nights, caption: N.caption.trim(),
    stage: stage, decision: decision, locked: (decision === 'chosen' && !legacy) || decision === 'booked',
    closed: decision === 'booked' || decision === 'dropped',
    paid: decision === 'booked' && typeof D.actual_total === 'number' ? D.actual_total : null, // what the organizer recorded as paid (💵)
    past: !!(plan && plan.e < today),
    members: members, travelers: travelers, heads: heads, headsIn: headsIn,
    hosts: members.filter(function (x) { return x.host; }),
    nudgeTargets: members.filter(function (x) { return x.nudge; }),
    me: me, iHost: !!(me && me.host), org: org, prices: prices, shelf: shelf, hidden: !!ctx.hidden,
    daysTo: plan ? diffD(today, plan.s) : null, bookBy: bookBy, bookByLeft: bookBy ? diffD(today, bookBy) : null,
    bookByPassed: !!(bookBy && bookBy < today && travelers.some(function (x) { return !x.booked; }) && !shelf),
    anyBooked: travelers.filter(function (x) { return x.booked; }).length,
    waitingAny: members.some(function (x) { return x.status === 'waiting'; }),
    followers: travelers.filter(function (x) { return !x.own1 || !x.own2; }),
    planHash: plan ? plan.s + '|' + plan.e : (win ? 'w' + win.s + '|' + win.e : '')
  };
  model.price = prices ? priceTrip(model, ctx.fares || {}, now) : null;
  model.best = bestWindow(model, today);
  model.range = boardRange(model);
  return model;
}

/* The one pricing rule, used by priceTrip and by every cheapest-week candidate: real cached fares only. A leg is
   fresh (<24h), stale, missing (never searched) or none (searched, no fares). rows = the travelers to price,
   [{code, color, keys, why}]; hosts are never rows, so they cost nothing. A total is complete only when there is
   at least one traveler and every traveler's every leg is fresh. A traveler with no searchable legs (why: no
   destination, a local origin, no dates, an impossible range, past days) is listed in `blocked` and keeps the
   total incomplete. Stale prices still add up (they are real), but mark the total incomplete; a missing price
   is never estimated. */
function priceRows(rows, fares, now) {
  var total = 0, any = false, complete = rows.length > 0, oldest = 0, segs = [], per = {}, search = [], blocked = [], none = false;
  fares = fares || {};
  rows.forEach(function (m) {
    var legs = m.keys.map(function (k) {
      var f = hasOwn(fares, k.key) ? fares[k.key] : null, st = fareState(f, now), p = legTotal(f);
      if (st === 'missing' || st === 'stale') search.push(k.key);
      if (st === 'fresh') oldest = Math.max(oldest, now - fareAt(f));
      if (st === 'none') none = true;
      return { kind: k.kind, key: k.key, f: f, st: st, p: p };
    });
    if (!legs.length) blocked.push({ code: m.code, why: m.why || 'local' });
    var sum = 0, has = false, hollow = !legs.length;
    legs.forEach(function (l) { if (l.p != null) { sum += l.p; has = true; } else hollow = true; });
    var stale = legs.some(function (l) { return l.st === 'stale'; });
    var done = legs.length > 0 && legs.every(function (l) { return l.st === 'fresh'; });
    if (!done) complete = false;
    if (has) { any = true; total += sum; }
    per[m.code] = { legs: legs, sum: has ? sum : null, hollow: hollow, stale: stale, complete: done };
    segs.push({ code: m.code, color: m.color, p: has ? sum : 0, hollow: hollow, stale: stale });
  });
  return {
    total: any ? total : null, complete: complete, need: search.length, search: search, oldest: oldest, segs: segs, per: per,
    stale: Object.keys(per).some(function (c) { return per[c].stale; }), none: none, blocked: blocked
  };
}
function priceRow(m) { return { code: m.code, color: m.color, keys: m.keys, why: m.why }; }
/* the trip's total on its current dates (the organizer's token phone only) */
function priceTrip(model, fares, now) {
  var out = priceRows(model.travelers.map(priceRow), fares, now);
  out.hosts = model.members.filter(function (x) { return x.host; }).map(function (x) { return x.code; });
  return out;
}

/* a host lives there, so they are present on every day a screen draws for the trip: the plan, the flex window
   and the people board's range (which holds everyone's own dates) */
function hostDay(model, day) {
  var a = model.span, b = model.range;
  return !!((a && day >= a.s && day <= a.e) || (b && day >= b.s && day <= b.e));
}
/* present heads on a day: in-members whose travel dates cover it, plus hosts (in, or in by default) on every
   hostDay. Never more than headsIn; equal on a day every in-member covers. */
function presentOn(model, day) {
  var n = 0, hd = hostDay(model, day);
  model.members.forEach(function (m) {
    if (m.host) { if ((m.status === 'in' || m.status === 'host-default') && hd) n += m.headcount; return; }
    if (m.status === 'in' && m.d1 && !m.bad && day >= m.d1 && day <= m.d2) n += m.headcount;
  });
  return n;
}
function dotsOn(model, day) { // [{color, kind: fill|hollow|maybe, code}], one per head
  var out = [], hd = hostDay(model, day);
  model.members.forEach(function (m) {
    var cover = m.d1 && !m.bad && day >= m.d1 && day <= m.d2, k = null;
    if (m.host) k = !hd ? null : (m.status === 'in' || m.status === 'host-default') ? 'fill' : m.status === 'maybe' ? 'maybe' : null;
    else if (m.status === 'in') k = cover ? 'fill' : 'hollow';
    else if (m.status === 'maybe' && cover) k = 'maybe';
    if (k) for (var i = 0; i < m.headcount; i++) out.push({ color: m.color, kind: k, code: m.code });
  });
  return out;
}

/* the best L-night window inside the flex window, from EXPLICIT in/maybe windows plus hosts; people who only
   follow the plan are left out, so it can never echo the plan. null when nobody's window fits or it is the plan. */
function bestWindow(model, today) {
  var L = model.nights, w = model.win;
  if (!L || !w) return null;
  var ex = model.members.filter(function (m) { return m.answered && !m.host && (m.own1 || m.own2) && m.d1 && !m.bad; });
  if (!ex.length) return null;
  var hosts = 0; model.members.forEach(function (m) { if (m.host && (m.status === 'in' || m.status === 'host-default')) hosts += m.headcount; });
  var best = null;
  for (var s = maxD(w.s, addD(today, 1)); addD(s, L) <= w.e; s = addD(s, 1)) {
    var e = addD(s, L);
    if (model.pin && (model.pin < s || model.pin > e)) continue;
    var full = hosts, part = 0;
    ex.forEach(function (m) {
      if (m.d1 <= s && m.d2 >= e) full += m.headcount;
      var a = maxD(s, m.d1), b = minD(e, m.d2); if (a <= b) part += (diffD(a, b) + 1) * m.headcount;
    });
    if (!best || full > best.full || (full === best.full && part > best.part)) best = { s: s, e: e, full: full, part: part };
  }
  if (!best || best.full <= hosts) return null;
  if (model.plan && best.s === model.plan.s && best.e === model.plan.e) return null;
  return best;
}
/* the day range a people board draws: the plan plus everyone's travel dates, else the flex window */
function boardRange(model) {
  var a = model.plan ? model.plan.s : null, b = model.plan ? model.plan.e : null;
  model.members.forEach(function (m) { if (m.d1 && !m.bad && m.status !== 'out') { a = a ? minD(a, m.d1) : m.d1; b = b ? maxD(b, m.d2) : m.d2; } });
  if (!a && model.win) { a = model.win.s; b = model.win.e; }
  return a ? { s: a, e: b, n: diffD(a, b) + 1 } : null;
}
/* candidate starts for an L-night stay inside window w that keep the 📌 day, never before tomorrow */
function candStarts(L, w, pin, today) {
  var out = []; if (!L || !w) return out;
  for (var s = maxD(addD(today, 1), w.s); addD(s, L) <= w.e; s = addD(s, 1)) { var e = addD(s, L); if (pin && (pin < s || pin > e)) continue; out.push(s); }
  return out;
}
/* one traveler's pricing row if the plan were s–e: their own ends stay, a blank end takes the window's, and the
   same legWhy / legKeys rules as the model's own legs apply (on the current plan the row IS their model row) */
function windowRow(model, m, s, e, today) {
  var d1 = m.own1 || s, d2 = m.own2 || e, why = legWhy(model.dest, m.O, d1, d2, today, m.origin);
  return { code: m.code, color: m.color, why: why, keys: why ? [] : legKeys(m.from, m.A, m.H, d1, d2, m.headcount) };
}
/* ---- PIA-141: cheapest week on demand (D4) ----
   The organizer asks for it (P-dates 📉 → P-cheapest), sees what pricing each week would cost, spends real searches through
   the one spend path (spendable takes each week's legs) and moves the trip there in one tap. Every week is priced by
   priceRows, the one rule priceTrip uses, from real cached fares only: a week nobody searched stays hollow, nothing is ever
   estimated. Candidates keep the trip's length (the plan's nights, or 🌙N for an undated idea) and its 📌 day, fit the flex
   window and start tomorrow at the earliest. Only plan-followers move with a week: an end someone set stays where it is (and
   is priced as it is), and a booked traveler keeps the days they booked (organizerEdit writes their blank ends as their own
   before the plan moves), so a booked flight is never searched here (it is bought: its cached price is the same in every week). */
var WIDEN_DAYS = 7;   // ⟦◀ ▶⟧: the flex window grows a week a tap
/* a traveler who moves with the plan: they travel, have not booked, and left at least one end blank */
function followsPlan(m) { return !!m && m.traveler && !m.booked && (!m.own1 || !m.own2); }
/* every candidate week: {s, e, current, missing (priceRows' legs not fresh: missing or a day old), need (what one 🔍 on this week
   searches: those legs, never-searched first, none for a week that cannot be filled: a search found no fares, or someone cannot
   be priced on it), filled (every leg fresh: total), priced (every leg has a real price, some maybe a day old: sum, grey), none,
   blocked, per (each traveler's part: own days, booked, their sum), warn / warnCodes (the faces whose own days, or booked days,
   that week would leave outside the plan: Move asks first), star (★ the cheapest filled week, once two are filled and one is
   cheaper), bought (what the booked flights add to every week alike)} */
function cheapCandidates(model, fares, now, today) {
  var out = [], L = model.nights, rows0 = model.travelers.filter(function (m) { return !m.booked; });
  // a booked traveler's flight is bought and stays on their days whatever the week (organizerEdit pins them before a Move): its
  // cached price, as P-total reads it, is the same in every week (never searched here, never what fills or greys a week). Every
  // priced week adds it alike, so a week's total is the trip's whole cost (the plan's own week reads P-total's total) and the
  // weeks, their bars and ★ still compare only what a Move changes
  var bk = priceRows(model.travelers.filter(function (m) { return m.booked; }).map(priceRow), fares, now), bought = bk.total || 0;
  candStarts(L, model.win, model.pin, today).forEach(function (s) {
    var e = addD(s, L), warn = [], codes = [];
    model.members.forEach(function (m) {
      if (m.host || !m.answered) return;
      var held = m.booked && !!m.d1 && !m.bad, a = held ? m.d1 : m.own1, b = held ? m.d2 : m.own2;
      if ((a && (a < s || a > e)) || (b && (b < s || b > e))) { warn.push(m.face); codes.push(m.code); }
    });
    var pr = priceRows(rows0.map(function (m) { return windowRow(model, m, s, e, today); }), fares, now);
    var priced = rows0.length > 0 && !pr.blocked.length && Object.keys(pr.per).every(function (c) { return pr.per[c].legs.every(function (l) { return l.p != null; }); });
    var per = model.travelers.map(function (m) {
      var p = pr.per[m.code], q = p || bk.per[m.code];   // (q: a booked traveler's part, from their own cached legs)
      return { code: m.code, face: m.face, color: m.color, own: !!(m.own1 || m.own2), booked: !p,
        sum: q ? q.sum : null, hollow: q ? q.hollow : false, stale: q ? q.stale : false, complete: q ? q.complete : false,
        none: !!q && q.legs.some(function (l) { return l.st === 'none'; }) };
    });
    out.push({ s: s, e: e, missing: pr.search, need: pr.none || pr.blocked.length ? [] : spendKeys(pr.search, fares, now, today),
      filled: pr.complete, priced: priced, stale: priced && !pr.complete, none: pr.none, blocked: pr.blocked,
      total: pr.complete ? pr.total + bought : null, sum: priced ? pr.total + bought : null, bought: bought, price: pr,
      per: per, warn: warn, warnCodes: codes, current: !!(model.plan && model.plan.s === s && model.plan.e === e) });
  });
  // ★ the cheapest, once two weeks are filled and one is cheaper than another (equal totals have no cheapest), as endPrices
  var filledBars = out.filter(function (c) { return c.filled; }), ts = filledBars.map(function (c) { return c.total; });
  if (filledBars.length >= 2 && Math.min.apply(null, ts) < Math.max.apply(null, ts)) {
    var min = Math.min.apply(null, ts); filledBars.forEach(function (c) { if (c.total === min) c.star = true; });
  }
  return out;
}
/* why P-dates' 📉 cannot open P-cheapest ('' it can): 'org' (not the organizer's phone), 'token' (no token here: no $ at all),
   'legacy' (P-migrate first), 'closed' (paid or dropped), 'past' (the trip is over), 'locked' (🔓 first: Move is never offered
   while the dates are 🔒), 'nodest' (no place to price), 'nights' (no length: an undated idea with no 🌙), 'window' (an undated
   idea with no ⟦window⟧), 'nobody' (nobody follows the plan: everyone set both ends, or booked), 'unpriced' (someone still to
   book has no airport to fly from, so no week could ever be complete), 'noweek' (no week fits, even a week wider either side) */
function cheapWhy(model, today) {
  if (!model || !model.org) return 'org';
  if (!model.prices) return 'token';
  if (model.legacy) return 'legacy';
  if (model.closed) return 'closed';
  if (model.past) return 'past';
  if (model.locked) return 'locked';
  if (!model.dest) return 'nodest';
  if (!model.nights) return 'nights';
  if (!model.win) return 'window';
  if (!model.travelers.some(followsPlan)) return 'nobody';
  if (model.travelers.some(function (m) { return !m.booked && (m.why === 'noairport' || m.why === 'local'); })) return 'unpriced';
  var w = model.win, wide = { s: addD(w.s, -WIDEN_DAYS), e: addD(w.e, WIDEN_DAYS) };
  if (!candStarts(model.nights, w, model.pin, today).length && !candStarts(model.nights, wide, model.pin, today).length) return 'noweek';
  return '';
}
/* ⟦◀ (k < 0) or ▶⟧ (k > 0): the flex window a week wider on that side, or null when that adds no candidate week (the 📌 day or
   tomorrow already bounds it) */
function widenWin(model, k, today) {
  var w = model && model.win; if (!w || !k || !model.nights) return null;
  var nw = { s: k < 0 ? addD(w.s, -WIDEN_DAYS) : w.s, e: k > 0 ? addD(w.e, WIDEN_DAYS) : w.e };
  return candStarts(model.nights, nw, model.pin, today).join() !== candStarts(model.nights, w, model.pin, today).join() ? nw : null;
}
/* the organizer edits P-cheapest makes (organizerEdit deltas): the wider window saved as the trip's ⟦window⟧ (its plan, 📌 and 🌙
   untouched), and Move: the week as the plan, its 📌 kept (planDelta, the same write as P-dates' Save) */
function widenDelta(w) { return { dates: { searchStart: w.s, searchEnd: w.e } }; }
function moveDelta(model, c) { return planDelta(c.s, c.e, model.pin); }
/* PIA-139: a cached offer's landing time as 'HH:MM', from 'HH:MM' or a 'YYYY-MM-DD HH:MM' stamp; anything else (a
   malformed or hostile value in the fare cache) is no time at all, so it can never reach a chip, its markup or a ⏱ run */
function cachedTime(v) {
  var m = typeof v === 'string' ? /^(?:\d{4}-\d{2}-\d{2}[ T])?(\d{2}:\d{2})$/.exec(v) : null;
  return m && HHMM_RE.test(m[1]) ? m[1] : '';
}
/* PIA-143: destination previews use the same record and pricing rule as the trip. A bought flight cannot be
   repriced to another city; unlock first and settle bookings through the existing edit flow. */
function candidateWhy(model) {
  if (!model || !model.org) return 'org';
  if (!model.prices) return 'token';
  if (model.legacy) return 'legacy';
  if (model.closed) return 'closed';
  if (model.past) return 'past';
  if (model.locked) return 'locked';
  if (model.anyBooked) return 'booked';
  if (!model.plan) return 'dates';
  return '';
}
function destinationCandidate(doc, ctx, dest) {
  var base = tripModel(doc, ctx), ap = normIata(dest);
  if (candidateWhy(base) || !ap) return null;
  var copy = Object.assign({}, doc, { idea: Object.assign({}, doc.idea, { destination: { airport: ap, city: airportInfo(ap).city } }) });
  return tripModel(copy, ctx);
}
/* Cheapest pair of different travelers landing at one airport on one day, at most two hours apart. Only fresh
   cached offers qualify. Booked travelers' recorded times remain facts; no alternative offer is assigned to them.
   Each pair uses the complete traveler price (including an open jaw's return), never a made-up per-person price. */
function pickupPair(model, fares, now, ap, day) {
  if (!model || !model.prices) return null;
  var rows = [];
  model.travelers.forEach(function (x) {
    if (!x.answered || x.booked || x.bad || x.A !== ap || x.d1 !== day || !x.keys.length) return;
    var pr = priceRows([priceRow(x)], fares, now);
    if (!pr.complete) return;
    var first = fares[x.keys[0].key], other = pr.per[x.code].sum - legTotal(first);
    (first && Array.isArray(first.off) ? first.off : []).forEach(function (o) {
      var t = cachedTime(o.ar), date = typeof o.ar === 'string' && /^\d{4}-\d{2}-\d{2}[ T]/.test(o.ar) ? o.ar.slice(0, 10) : day;
      if (!t || date !== day || o.a !== ap || typeof o.p !== 'number' || !isFinite(o.p) || o.p <= 0) return;
      rows.push({ code: x.code, time: t, min: +t.slice(0, 2) * 60 + +t.slice(3), p: legTotal(o) + other });
    });
  });
  var best = null;
  rows.forEach(function (a, i) { rows.slice(i + 1).forEach(function (b) {
    var wait = Math.abs(a.min - b.min), sum = a.p + b.p;
    if (a.code !== b.code && wait <= 120 && (!best || sum < best.sum || (sum === best.sum && wait < best.wait)))
      best = { codes: [a.code, b.code], times: [a.time, b.time], sum: sum, wait: wait };
  }); });
  return best;
}
/* pickup chips under the labelled pins (destination and hub alternate). Times recorded at 🎫 show for everyone, while
   that traveler is booked; with showPredicted (the organizer's token phone) an arrival with no recorded time shows the
   cheapest cached offer's time (cachedTime), from any cached search (fresh or stale; `now` is unused, kept so every
   fare reader takes the same arguments). Chips merge only with chips of the same kind, day, maybe and 🎫. */
function pickups(model, fares, now, showPredicted) {
  var lanes = {};
  if (!model.dest) return lanes;
  [model.dest].concat(model.alt ? [model.alt] : []).forEach(function (a) { lanes[a] = []; });
  model.travelers.forEach(function (m) {
    if (!m.answered || !m.d1 || m.bad) return;
    var inKey = m.keys[0] && m.keys[0].key, f = inKey && fares && hasOwn(fares, inKey) ? fares[inKey] : null;
    var offer = f && f.off && f.off[0] ? f.off[0] : null;
    var rawArrival = f && (f.ar || (offer && offer.ar));
    var predicted = (model.prices || showPredicted) && f ? cachedTime(rawArrival) : '';  // any cached offer, fresh or stale
    // A search departs on d1. An overnight offer must not be presented as landing on that same day.
    if (predicted && /^\d{4}-\d{2}-\d{2}[ T]/.test(rawArrival) && rawArrival.slice(0, 10) !== m.d1) predicted = '';
    // PIA-139: a recorded time is a firm pickup only while its traveler is booked (a 🎫 taken back leaves none behind)
    var arrT = (m.booked && m.arrTime) || predicted, depT = m.booked ? m.depTime : '';
    if (lanes[m.A]) lanes[m.A].push({ kind: 'arr', date: m.d1, time: arrT, pred: !(m.booked && m.arrTime) && !!arrT, faces: [m.face], codes: [m.code], maybe: m.status === 'maybe', booked: m.booked });
    if (lanes[m.H]) lanes[m.H].push({ kind: 'dep', date: m.d2, time: depT, pred: false, faces: [m.face], codes: [m.code], maybe: m.status === 'maybe', booked: m.booked });
  });
  Object.keys(lanes).forEach(function (a) {
    var L = lanes[a], merged = [];
    L.sort(function (x, y) { return (x.date + (x.time || '99') + x.kind).localeCompare(y.date + (y.time || '99') + y.kind); });
    L.forEach(function (c) {
      var p = merged[merged.length - 1];
      if (p && !p.time && !c.time && p.kind === c.kind && p.date === c.date && p.maybe === c.maybe && p.booked === c.booked) { p.faces = p.faces.concat(c.faces); p.codes = p.codes.concat(c.codes); }
      else merged.push(c);
    });
    // ⏱ one pickup run: arrivals at one airport on one day, chained ≤ 2h apart
    var gid = 0, tm = function (x) { return +x.time.slice(0, 2) * 60 + +x.time.slice(3, 5); };
    merged.forEach(function (c, i) {
      var p = merged[i - 1];
      if (p && c.kind === 'arr' && p.kind === 'arr' && c.time && p.time && c.date === p.date && tm(c) - tm(p) <= 120) c.group = p.group || (p.group = ++gid);
    });
    lanes[a] = merged;
  });
  return lanes;
}

/* ---- hand-offs for one face on one trip (PIA-133) ---- */
/* The guest link: <worker>/i/<id>, or with #m=<code> for a personal nudge. It is the only link that ever leaves
   in a share or a calendar event: it is built from the id and a member code alone, so an edit key or token cannot
   ride along. worker = the Worker the app talks to: undefined, null or blank → WORKER_URL (a blank override keeps
   the built-in Worker, as v1 does, PIA-119); one that is not a bare https *.workers.dev origin builds no link. */
function guestLink(id, code, worker) {
  var w = worker === undefined || worker === null ? '' : String(worker).trim();
  var base = w ? w.replace(/\/$/, '') : WORKER_URL;
  if (!WORKER_RE.test(base) || !IDEA_ID_RE.test(String(id || ''))) return '';
  if (code && !MEMBER_CODE_RE.test(String(code))) return '';
  return base + '/i/' + id + (code ? '#m=' + code : '');
}
/* RFC 5545 TEXT: escape backslash, every line break (CRLF, a lone CR or a lone LF → \n), ';' and ','; drop every
   other control character (C0 except tab, and DEL), so no stored title or city can start a new property line */
function icsEsc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/;/g, '\\;').replace(/,/g, '\\,');
}
function icsDay(s) { return s.replace(/-/g, ''); }
/* a download file name: ASCII letters and digits only (slugOf's 'm' fallback is for member codes, not files) */
function fileSlug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40); }
/* RFC 5545 folding: lines of at most 75 octets, continued with CRLF + space, never splitting a UTF-8 sequence */
function icsFold(line) {
  var out = '', n = 0;
  Array.from(line).forEach(function (ch) {
    var c = ch.codePointAt(0), b = c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    if (n + b > 75) { out += '\r\n '; n = 1; }   // the continuation's leading space counts toward its 75
    out += ch; n += b;
  });
  return out;
}
function icsText(ev) {
  var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PIALAX//Trip//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:' + ev.uid, 'DTSTAMP:' + ev.stamp, 'DTSTART;VALUE=DATE:' + icsDay(ev.d1), 'DTEND;VALUE=DATE:' + icsDay(ev.end),
    'SUMMARY:' + icsEsc(ev.title)];
  if (ev.where) lines.push('LOCATION:' + icsEsc(ev.where));
  if (ev.details) lines.push('DESCRIPTION:' + icsEsc(ev.details));
  lines.push('STATUS:' + (ev.tentative ? 'TENTATIVE' : 'CONFIRMED'), 'END:VEVENT', 'END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
/* P-calendar-add: one all-day event (d2 + 1 is the exclusive end) over my own travel days when I have a usable
   pair, else the plan, as the prototype's sheet does: a host, someone who is out, a phone with no face, or my own
   reversed ⚠ range gets the plan, so a reversed pair never becomes an event. Tentative ('? ' and STATUS:TENTATIVE)
   until the days are set: 🔒 (a legacy 🔒 reads as proposed), my own 🎫 on my own days, or 🏁 Done (every
   traveler booked, or 💵). The only link inside is the guest /i/<id> link. Both the Google TEMPLATE link and the
   .ics text come from the same event. null when the trip has no plan (an undated idea, even for someone who set
   their own window: PIA-139, a window is not trip days), the days are over, or the trip is dropped (🗑).
   ctx = {today, now, worker}. */
function calendarAdd(model, ctx) {
  ctx = ctx || {};
  if (!isIso(ctx.today)) throw new Error('calendarAdd: ctx.today must be a YYYY-MM-DD day');
  if (typeof ctx.now !== 'number' || !isFinite(ctx.now)) throw new Error('calendarAdd: ctx.now must be epoch milliseconds');
  if (model.decision === 'dropped' || !model.plan) return null;
  var me = model.me, plan = model.plan, own = !!(me && me.traveler && !me.bad && me.d1 && me.d2);
  var d1 = own ? me.d1 : plan ? plan.s : '', d2 = own ? me.d2 : plan ? plan.e : '';
  if (!d1 || !d2 || d1 > d2 || d2 < ctx.today) return null;
  var tentative = !model.locked && model.stage !== 'done' && !(own && me.booked), end = addD(d2, 1);
  var title = (tentative ? '? ' : '') + (model.title || model.emoji);
  var where = model.city || model.dest, details = guestLink(model.id, '', ctx.worker);
  // the UID is built from checked codes only (the id and the member code), never from free text
  var uid = (IDEA_ID_RE.test(String(model.id || '')) ? model.id : 'trip') + (me && MEMBER_CODE_RE.test(String(me.code)) ? '-' + me.code : '') + '@pialax';
  var ev = { uid: uid, stamp: new Date(ctx.now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'),
    d1: d1, end: end, title: title, where: where, details: details, tentative: tentative };
  var google = GCAL_TEMPLATE + '&text=' + encodeURIComponent(title) + '&dates=' + icsDay(d1) + '/' + icsDay(end) +
    (details ? '&details=' + encodeURIComponent(details) : '') + (where ? '&location=' + encodeURIComponent(where) : '');
  return {
    d1: d1, d2: d2, end: end, own: own, tentative: tentative, title: title, where: where, details: details,
    google: handoff('calendar', google),
    ics: { kind: 'ics', filename: (fileSlug(model.name) || fileSlug(model.dest) || 'trip') + '.ics', mime: 'text/calendar;charset=utf-8', text: icsText(ev) }
  };
}
/* Everything one face can open on one trip, from the model alone: the one entry point for every hand-off.
   code = a member code (default: this phone's face). ctx = {today, now, worker}, as for calendarAdd.
   • gf: the primary ✈↗ (one round-trip search, or ONE multi-city link when open-jaw; when the encoder failed and
     q= stands in, split is true and the primary is the inbound one-way, trip 2); gfIn / gfOut: the two one-way
     searches PIALAX prices (open-jaw only).
   • why: the reason whenever there is no gf: dropped, host, out, nodest, noairport, local, nodates, order, past,
     or nolink (the encoder failed and q= refused the codes).
   • explore: 🧭↗ Google Flights Explore, unprefilled, for an idea without a place that is not over or dropped.
   • flighty: 🛂↗ only once that traveler is booked (kept on a dropped trip: a booked flight is still real).
   • calendar: calendarAdd, on this phone's own face only (or on a phone with no face).
   • share: the guest /i/<id> link; nudge: the same with #m=<code>, only for someone else who is ◌ waiting or
     ? maybe (P-person's 📣 rule): never a host, never someone who is in or out.
   A dropped trip (🗑) offers no Google Flights link, Explore, calendar event or nudge, only share (and Flighty for
   a booked traveler). null for a code that is not on the trip. */
function handoffs(model, code, ctx) {
  var me = model.me, x = code ? model.members.filter(function (m) { return m.code === code; })[0] || null : me;
  if (code && !x) return null;
  var dropped = model.decision === 'dropped', worker = (ctx || {}).worker;
  var mine = !x || (!!me && x.code === me.code), L = x && !dropped ? x.link : null;
  var ask = !!x && !mine && !dropped && !x.host && (x.status === 'waiting' || x.status === 'maybe');
  return {
    code: x ? x.code : '',
    gf: L ? handoff('gf', L.href, { trip: L.trip, q: L.q, split: L.split }) : null,
    gfIn: L && L.inHref ? handoff('gf-in', L.inHref) : null,
    gfOut: L && L.outHref ? handoff('gf-out', L.outHref) : null,
    why: x && !L ? (dropped ? 'dropped' : x.host ? 'host' : x.status === 'out' ? 'out' : x.why || 'nolink') : '',
    explore: model.dest || dropped || model.past ? null : handoff('explore', GF_EXPLORE),
    flighty: x && x.traveler && x.booked ? handoff('flighty', FLIGHTY_URL) : null,
    calendar: mine ? calendarAdd(model, ctx) : null,
    share: guestLink(model.id, '', worker),
    nudge: ask ? guestLink(model.id, x.code, worker) : ''
  };
}

/* ---- the family preset (date-aware) and v1 storage ---- */
/* the family's airports on a day: Anjo is at JAX before 2026-09-01 and at LGA from then on */
function familyForDate(day) {
  return FAMILY.map(function (f) { return f.moveDate && isIso(day) && day >= f.moveDate ? f.moveAirport : f.airport; });
}
/* the 👪 preset for a new trip, resolved against its departure, or today for an undated idea */
function familyPreset(departure, today) {
  var day = isIso(departure) ? departure : today, codes = familyForDate(day);
  return FAMILY.map(function (f, i) { return { preset: f.key, face: f.face, name: f.name, label: memberLabel(f.face, f.name), airport: codes[i], headcount: f.headcount }; });
}
/* PIA-152: the family preset's person a v1 member is (P-migrate's rule): a label with no face, or the v1 word 'Me', at one
   of the preset's home airports (FAMILY_BY_AIRPORT), named as the preset names them, 'Me', or not named at all. Anyone else
   (a label with its own face and a real name, another airport, another name) is nobody's preset: null. */
function familyOf(member) {
  var lab = splitLabel(member && member.label), key = FAMILY_BY_AIRPORT[normIata(member && member.airport)];
  var fam = key ? FAMILY.filter(function (f) { return f.key === key; })[0] : null;
  if (!fam || (lab.face && !isMeLabel(lab.name))) return null;
  return isMeLabel(lab.name) || normName(lab.name) === normName(fam.name) || !lab.name ? fam : null;
}
/* P-migrate's suggested face and name for a v1 member (by home airport; others keep their name with a hashed face) */
function migrateLabel(member) {
  var lab = splitLabel(member && member.label), fam = familyOf(member);
  if (lab.face && !isMeLabel(lab.name)) return member.label;
  if (fam) return memberLabel(fam.face, fam.name);
  var name = isMeLabel(lab.name) || !lab.name ? (member && member.code) || '?' : lab.name;
  return memberLabel(lab.face || hashedFace(normName(name)), name);
}
/* the faces a trip's members showed before PIA-152, in member order: a label's own face, else the hashed face of its name
   ('#code' for a nameless v1 'Me'), moved on to the next free face if the trip already shows it (autoFace) */
function nameFaces(rows) {
  var shown = rows.map(function (m) { return splitLabel(m && m.label).face; }).filter(Boolean);
  return rows.map(function (m) {
    var lab = splitLabel(m && m.label), norm = isMeLabel(lab.name) ? '' : normName(lab.name || '?');
    if (lab.face) return lab.face;
    var f = autoFace(norm || '#' + (m && m.code), shown); shown.push(f); return f;
  });
}
/* PIA-152: the face every member of a trip shows, unique within it, in member order. A label's own face stays. Someone the
   family preset recognises (familyOf) shows the preset's face (🌽 / 💪 / 🗽), a v1 '<face> Me' at a family airport too (it
   is that person, as ⤒ Update trip writes), unless a label on the trip already has that face or an earlier row is that
   person: then the face they showed before. Everyone else shows the face they showed before (nameFaces), moved on to the next
   free face only when the family now shows it (a friend whose hashed face is 🌽 or 🗽). Only a v1 doc has a label with no face
   or 'Me', so a v2 trip shows exactly the faces stored in it. Nothing here is written: ⤒ Update trip (migrateLabels) writes
   these same faces, so nobody's face changes when a v1 trip is updated. */
function memberFaces(rows) {
  var fams = rows.map(familyOf), was = nameFaces(rows), took = [];
  var faces = rows.map(function (m, i) { return fams[i] ? '' : splitLabel(m && m.label).face || ''; }), own = faces.slice();
  rows.forEach(function (m, i) { var f = fams[i] && fams[i].face; if (f && own.indexOf(f) < 0 && took.indexOf(f) < 0) { faces[i] = f; took.push(f); } });
  var shown = faces.filter(Boolean);
  rows.forEach(function (m, i) { if (!faces[i] && shown.indexOf(was[i]) < 0) { faces[i] = was[i]; shown.push(was[i]); } });
  rows.forEach(function (m, i) {
    if (faces[i]) return;
    var lab = splitLabel(m && m.label), norm = isMeLabel(lab.name) ? '' : normName(lab.name || '?');
    faces[i] = autoFace(norm || '#' + (m && m.code), shown); shown.push(faces[i]);
  });
  return faces;
}
/* PIA-152: P-migrate's labels for a v1 doc's members: migrateLabel's names (the preset's for someone it recognises, a v1 'Me'
   or a nameless row named by its code), each with the face the trip already shows for them (memberFaces): no face jumps */
function migrateLabels(members) {
  var rows = (members || []).filter(function (m) { return m && typeof m.code === 'string'; }), faces = memberFaces(rows);
  return rows.map(function (m, i) {
    var l = migrateLabel(m), s = splitLabel(l);
    return { code: m.code, label: s.face === faces[i] ? l : memberLabel(faces[i], s.name) };
  });
}
function readV1Storage(raw) {
  var s = raw;
  if (typeof raw === 'string') { try { s = JSON.parse(raw); } catch (e) { s = null; } }
  return s && typeof s === 'object' ? s : null;
}
function v1Items(raw) {
  var s = readV1Storage(raw); if (!s) return [];
  var items = [];
  if (s.overrides && typeof s.overrides === 'object') Object.keys(s.overrides).forEach(function (k) { if (s.overrides[k] && typeof s.overrides[k] === 'object') items.push(s.overrides[k]); });
  if (Array.isArray(s.added)) s.added.forEach(function (a) { if (a && typeof a === 'object') items.push(a); });
  return items;
}
/* pialax_watchlist_v1 is read, never written: the shared trip ids it links… */
function v1SharedIds(raw) { return uniq(v1Items(raw).map(function (x) { return x.sharedIdeaId; }).filter(function (id) { return typeof id === 'string' && IDEA_ID_RE.test(id); })); }
/* …and the event day (📌) its card carried for one of them */
function v1PinFor(raw, ideaId) {
  var hit = v1Items(raw).filter(function (x) { return x.sharedIdeaId === ideaId && isIso(x.eventDate); })[0];
  return hit ? hit.eventDate : '';
}

/* ---- writes: request descriptors {method, path, body}; the id always rides the query string ---- */
function reqPath(route, id) { return route + '?id=' + encodeURIComponent(id); }
var CODE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
/* '<slug>-<2 chars>', the suffix re-rolled until unique in the trip. rand() → [0, 1); without one the
   sequence is a deterministic hash of the name (codes need to be unique, not secret). */
function memberCode(name, taken, rand) {
  var slug = slugOf(name), used = {}, i, n = CODE_CHARS.length;
  (taken || []).forEach(function (c) { used[c] = 1; });
  var seed = fnv1a(slug + ':' + (taken || []).length);
  var next = typeof rand === 'function' ? rand : function () { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  for (i = 0; i < 64; i++) {
    var c = slug + '-' + CODE_CHARS[Math.floor(next() * n) % n] + CODE_CHARS[Math.floor(next() * n) % n];
    if (!used[c]) return c;
  }
  for (i = 0; i < n * n; i++) { var d = slug + '-' + CODE_CHARS[Math.floor(i / n)] + CODE_CHARS[i % n]; if (!used[d]) return d; }
  return null;
}
/* faces auto-assigned from FACES, unique in the trip: around the FACE_RING from the name's hash, then any face after it */
function autoFace(norm, usedFaces) {
  var start = fnv1a(norm) % FACE_RING, i, f;
  for (i = 0; i < FACE_RING; i++) { f = FACES[(start + i) % FACE_RING]; if (usedFaces.indexOf(f) < 0) return f; }
  for (i = FACE_RING; i < FACES.length; i++) if (usedFaces.indexOf(FACES[i]) < 0) return FACES[i];
  return FACES[start];
}
function cleanDates(d, base) {
  var out = {}, src = d || {};
  ['departure', 'return', 'searchStart', 'searchEnd'].forEach(function (k) {
    var v = hasOwn(src, k) ? src[k] : (base ? base[k] : '');
    out[k] = isIso(v) ? v : '';
  });
  return out;
}
/* a usable face: one single-codepoint emoji (plus an optional VS16), as the pickers offer */
function faceOf(f) { return typeof f === 'string' && f && splitLabel(f).face === f ? f : null; }
/* members for a write: existing codes are kept as they are (answers hang off them); new rows get fresh codes.
   Every label written is '<face> <name>' and never reads as legacy (docLegacy): a row with no face gets an
   auto-assigned one, and a blank name or the v1 word 'Me' builds nothing (the screen asks for a real name). A kept
   row's label is resent verbatim when it already starts with a face. PIA-136: faces are unique within the trip. A
   member resent as it is (its code alone, with a face already on its label) is KEPT: its label goes back verbatim
   whatever it holds, and its face is reserved before any other row is built, wherever it sits in the list. Any
   other row (new, renamed, re-faced) whose face a kept member or an earlier row already has gets a free one (a
   nameless face-only label, which has nothing to rebuild its label from, is the only exception). So nobody else's
   face is ever rewritten by an edit that does not touch them. */
function buildMembers(list, prev, rand) {
  if (!Array.isArray(list) || !list.length || list.length > IDEA_MAX_MEMBERS) return null;
  var byCode = {}; (prev || []).forEach(function (m) { if (m) byCode[m.code] = m; });
  var taken = list.map(function (e) { return e && e.code; }).filter(function (c) { return typeof c === 'string' && MEMBER_CODE_RE.test(c); }).concat((prev || []).map(function (m) { return m && m.code; }));
  var faces = [], out = [], used = [];
  list.forEach(function (e) { var f = e && (faceOf(e.face) || splitLabel(e.label || (byCode[e.code] || {}).label).face); if (f) faces.push(f); });
  var kept = list.map(function (e) {
    var base = e && typeof e.code === 'string' && byCode[e.code];
    return !!base && !hasOwn(e, 'name') && !hasOwn(e, 'face') && !hasOwn(e, 'label') && typeof base.label === 'string' && !!splitLabel(base.label).face;
  });
  list.forEach(function (e, k) { if (kept[k]) used.push(splitLabel(byCode[e.code].label).face); });
  for (var i = 0; i < list.length; i++) {
    var e = list[i] || {}, base = (typeof e.code === 'string' && byCode[e.code]) || null;
    var code = typeof e.code === 'string' && MEMBER_CODE_RE.test(e.code) ? e.code : null;
    var lab, raw = '';
    if (hasOwn(e, 'name') || hasOwn(e, 'face')) {
      var bl = splitLabel(e.label || (base && base.label));
      lab = { face: faceOf(e.face) || bl.face, name: hasOwn(e, 'name') ? String(e.name || '').trim() : bl.name };
    } else if (hasOwn(e, 'label')) { raw = clip(e.label, TEXT_MAX.label); lab = splitLabel(raw); }
    else if (base) { raw = typeof base.label === 'string' ? base.label : ''; lab = splitLabel(raw); }
    else lab = { face: null, name: '' };
    if (isMeLabel(lab.name)) return null;
    var label, dup = !kept[i] && !!lab.face && used.indexOf(lab.face) >= 0;
    if (kept[i]) label = raw;                                                          // as it is on the trip
    else if (raw && lab.face && (lab.name || base) && (!dup || !lab.name)) label = raw;   // already '<face> <name>' (an existing face-only row stays)
    else {
      if (!lab.name) return null;
      var face = dup ? null : lab.face;
      if (!face) { face = autoFace(normName(lab.name), faces.concat(used)); faces.push(face); }
      label = memberLabel(face, lab.name);
    }
    if (!kept[i]) used.push(splitLabel(label).face);
    if (!code) { code = memberCode(lab.name, taken, rand); if (!code) return null; taken.push(code); }
    var hc = hasOwn(e, 'headcount') ? +e.headcount : (base ? +base.headcount : 1);
    out.push({ code: code, label: label, airport: normIata(hasOwn(e, 'airport') ? e.airport : (base && base.airport)), headcount: Math.max(1, Math.min(9, Math.round(hc) || 1)) });
  }
  var seen = {};
  for (var j = 0; j < out.length; j++) { if (seen[out[j].code]) return null; seen[out[j].code] = 1; }
  return out;
}

/* POST /idea. draft = {title | emoji + name, dest {airport, city?}, dates {departure, return, searchStart, searchEnd},
   pin, nights, caption, members [{name, face?, airport, headcount, preset?}]}. Members taken from the 👪 preset carry
   `preset` and are re-resolved against the final departure (or today) at Create, but only while their airport is
   still one of that preset's own (Anjo: JAX or LGA) or blank: an airport someone typed in is kept. */
function createRequest(draft, opts) {
  opts = opts || {};
  if (!draft || !isIso(opts.today)) return null;
  var dates = cleanDates(draft.dates);
  if (dates.departure && dates.return && dates.return < dates.departure) return null;
  var fam = {}; familyPreset(dates.departure, opts.today).forEach(function (f) { fam[f.preset] = f; });
  var list = (draft.members || []).map(function (m) {
    var e = { name: m && m.name, face: m && m.face, headcount: m && m.headcount, airport: m && m.airport };
    var f = m && m.preset && fam[m.preset], own = f ? FAMILY.filter(function (x) { return x.key === m.preset; })[0] : null;
    if (f) {
      var ap = normIata(m.airport);
      if (!ap || ap === own.airport || ap === own.moveAirport) e.airport = f.airport;
      if (!e.face) e.face = f.face;
    }
    return e;
  });
  var members = buildMembers(list, [], opts.rand);
  if (!members) return null;
  var airport = normIata(draft.dest && draft.dest.airport);
  var city = clip((draft.dest && draft.dest.city) || airportInfo(airport).city, TEXT_MAX.city);
  var title = draft.title != null ? clip(draft.title, TEXT_MAX.title) : titleOf(draft.emoji, draft.name);
  var idea = { title: title, destination: { city: city, airport: airport }, dates: dates, members: members,
    notes: buildNotes(draft.pin, dates.departure ? null : draft.nights, draft.caption), recommendation: null };
  return docLegacy({ idea: idea }) ? null : { method: 'POST', path: '/idea', body: { idea: idea } };
}

/* typed answer text, minus the marks that are reserved for structure: a leading 📞 (the organizer answered) and a
   trailing '(entered by X)' (v1's proxy mark) would otherwise read back as a proxy answer */
function typedNote(s) {
  var t = String(s == null ? '' : s).trim(), m;
  for (;;) { t = t.replace(LEGACY_PROXY_RE, '').trim(); if ((m = /^📞(?: |$)/u.exec(t))) { t = t.slice(m[0].length).trim(); continue; } break; }
  return t;
}
/* how many characters of typed text fit after the 📞 / 🛬 / 🛫 prefixes (the Worker caps the whole note at 280),
   so the answer screen can cap its text field */
function noteRoom(called, arr, dep) { var p = buildRespNote(called, arr, dep, ''); return TEXT_MAX.note - (p ? p.length + 1 : 0); }
/* POST /idea/respond: always complete, because the Worker blanks missing dates and note and resets origin.
   patch: {status, origin (an override; '' or the home code = none), available_from, available_to, note (text),
           arrTime, depTime, arrive_at, leave_from}. A member with no answer yet needs patch.status (no silent 'in').
   opts.by: 'self' strips 📞, 'proxy' adds it (idempotent), 'keep' (default) keeps the mark as it reads. Typed
   text never carries the 📞 or '(entered by X)' marks. arrive_at / leave_from are sent only when they change. */
function respondRequest(doc, code, patch, opts) {
  opts = opts || {}; patch = patch || {};
  var mem = memberOf(doc, code); if (!mem || !doc.id || docClosed(doc)) return null;
  var prev = validResp(doc.responses && doc.responses[code]);
  var has = function (k) { return hasOwn(patch, k); };
  if (!prev && !has('status')) return null;
  var status = has('status') ? patch.status : prev.status;
  if (!hasOwn(IDEA_STATUSES, status)) return null;
  var home = normIata(mem.airport);
  var origin = has('origin') ? normIata(patch.origin) : (prev && isIata(prev.origin) && prev.origin !== home ? prev.origin : '');
  if (origin === home) origin = '';
  var from = has('available_from') ? patch.available_from || '' : (prev && isIso(prev.available_from) ? prev.available_from : '');
  var to = has('available_to') ? patch.available_to || '' : (prev && isIso(prev.available_to) ? prev.available_to : '');
  if ((from && !isIso(from)) || (to && !isIso(to)) || (from && to && to < from)) return null;
  var n = parseRespNote(prev && prev.note);
  var arr = has('arrTime') ? patch.arrTime || '' : n.arr, dep = has('depTime') ? patch.depTime || '' : n.dep;
  if ((arr && !HHMM_RE.test(arr)) || (dep && !HHMM_RE.test(dep))) return null;
  var called = opts.by === 'self' ? false : opts.by === 'proxy' ? true : n.called;
  var text = has('note') ? typedNote(patch.note) : n.text, note = buildRespNote(called, arr, dep, text);
  // PIA-139: booked times never cut a note short: times that would leave the text it has no room build nothing
  if ((has('arrTime') || has('depTime')) && parseRespNote(note).text !== String(text || '').trim()) return null;
  var body = { member: code, status: status, origin: origin, available_from: from, available_to: to, note: note };
  var hub = hubPair(docDest(doc));
  var bad = ['arrive_at', 'leave_from'].some(function (k) {
    if (!has(k)) return false;
    var v = normIata(patch[k]);
    if (patch[k] && !v) return true;
    if (v && hub.indexOf(v) < 0) return true;
    if (v !== ((prev && prev[k]) || '')) body[k] = v;
    return false;
  });
  return bad ? null : { method: 'POST', path: reqPath('/idea/respond', doc.id), body: body };
}
/* POST /idea/booked, preceded by a complete 'in' answer when the member has none (the Worker's answer_first).
   Unbooking someone with no in/maybe answer builds nothing (the Worker would answer 400 answer_first).
   PIA-139: taking a 🎫 back clears the booked times that went with it (🛬 / 🛫), in one complete answer sent first (the
   Worker keeps the 🎫 through it), so no phone shows a pickup for a flight that is no longer booked; their own write
   clears 📞 as their own answer does, the organizer's keeps it as it reads. */
function bookedRequests(doc, code, booked, opts) {
  if (!memberOf(doc, code) || !doc.id || (doc.decision && doc.decision.stage === 'dropped')) return null;
  var r = validResp(doc.responses && doc.responses[code]), out = [];
  var answered = !!r && (r.status === 'in' || r.status === 'maybe');
  if (!booked && !answered) return null;
  if (booked && !answered) {
    var first = respondRequest(doc, code, { status: 'in' }, opts);
    if (!first) return null;
    out.push(first);
  }
  var had = parseRespNote(r && r.note);
  if (!booked && r.booked && (had.arr || had.dep)) {
    var clear = respondRequest(doc, code, { arrTime: '', depTime: '' }, { by: opts && opts.by === 'self' ? 'self' : 'keep' });
    if (clear) out.push(clear);
  }
  out.push({ method: 'POST', path: reqPath('/idea/booked', doc.id), body: { member: code, booked: !!booked } });
  return out;
}
var IDEA_DELTA_KEYS = ['title', 'destination', 'dates', 'pin', 'nights', 'caption', 'members'];
/* the next idea: a fresh record's idea plus a delta, with recommendation:null. Member codes, labels and every
   part of the notes the delta does not touch are kept. */
function nextIdea(fresh, delta, rand) {
  var I = fresh.idea || {}, N = parseNotes(I.notes), oldDest = I.destination || {};
  var destination = { city: clip(oldDest.city, TEXT_MAX.city), airport: normIata(oldDest.airport) };
  if (hasOwn(delta, 'destination')) {
    var nd = delta.destination || {}, ap = normIata(nd.airport);
    destination = { airport: ap, city: hasOwn(nd, 'city') ? clip(nd.city, TEXT_MAX.city) : (ap === destination.airport ? destination.city : airportInfo(ap).city) };
  }
  var dates = cleanDates(hasOwn(delta, 'dates') ? delta.dates : {}, cleanDates(I.dates));
  if (dates.departure && dates.return && dates.return < dates.departure) return null;
  var members = hasOwn(delta, 'members') ? buildMembers(delta.members, I.members, rand) : (I.members || []).map(function (m) {
    return { code: m.code, label: m.label, airport: normIata(m.airport), headcount: Math.max(1, Math.min(9, Math.round(+m.headcount) || 1)) };
  });
  if (!members) return null;
  return {
    title: hasOwn(delta, 'title') ? clip(delta.title, TEXT_MAX.title) : clip(I.title, TEXT_MAX.title),
    destination: destination, dates: dates, members: members,
    notes: buildNotes(hasOwn(delta, 'pin') ? delta.pin : N.pin, hasOwn(delta, 'nights') ? delta.nights : N.nights, hasOwn(delta, 'caption') ? delta.caption : N.caption),
    recommendation: null
  };
}
/* the decision an update sends, built here and never passed through from the caller:
   • chosen = {airport, city, departure, return} of the idea as it stands after this update, with no prices, so
     the Worker stores no estimate and the 🔒 range is always the plan (no plan or no destination → null);
   • booked (💵) = {stage, actual_total} only: a positive whole-dollar amount, and only once something is chosen;
   • proposed and dropped carry the stage alone. */
function decisionBody(fresh, idea, raw) {
  var st = raw && raw.stage;
  if (!hasOwn(IDEA_STAGES, st)) return null;
  if (st === 'chosen') {
    var shown = { idea: idea }, plan = docPlan(shown), ap = docDest(shown);
    if (!plan || !ap) return null;
    var city = clip((idea.destination && idea.destination.city) || airportInfo(ap).city, TEXT_MAX.city);
    return { stage: 'chosen', chosen: { airport: ap, city: city, departure: plan.s, return: plan.e } };
  }
  if (st === 'booked') {
    var paid = raw.actual_total;
    if (typeof paid !== 'number' || !isFinite(paid) || Math.round(paid) < 1 || paid >= 1e6) return null;
    if (!(fresh.decision && fresh.decision.chosen)) return null;
    return { stage: 'booked', actual_total: Math.round(paid) };
  }
  return { stage: st };
}
/* POST /idea/update from a FRESH record (GET /idea with X-Idea-Key right before): id in the query, edit key in the
   body. A legacy doc refuses every edit but P-migrate (opts.migrate), the only write that nulls recommendation;
   and no update ever writes an idea that would read as legacy. */
function updateRequest(fresh, editKey, delta, opts) {
  opts = opts || {}; delta = delta || {};
  if (!fresh || !IDEA_ID_RE.test(String(fresh.id || '')) || !fresh.idea || !IDEA_KEY_RE.test(String(editKey || ''))) return null;
  if (docLegacy(fresh) && !opts.migrate) return null;
  var body = { edit_key: editKey };
  if (IDEA_DELTA_KEYS.some(function (k) { return hasOwn(delta, k); })) {
    body.idea = nextIdea(fresh, delta, opts.rand);
    if (!body.idea || docLegacy({ idea: body.idea })) return null;
  }
  if (delta.decision) { body.decision = decisionBody(fresh, body.idea || fresh.idea, delta.decision); if (!body.decision) return null; }
  if (!body.idea && !body.decision) return null;
  return { method: 'POST', path: reqPath('/idea/update', fresh.id), body: body };
}
/* after a member-airport or destination change: one complete answer per answered member, origin '' unless it was an
   override, and a pick no longer in the new hub pair cleared. The note is resent as it reads; no 📞 is added. */
function airportSyncRequests(fresh, idea) {
  if (!fresh || !idea || docClosed(fresh)) return [];
  var oldDest = docDest(fresh), newDest = normIata((idea.recommendation && idea.recommendation.airport) || (idea.destination && idea.destination.airport));
  var after = { id: fresh.id, idea: idea, responses: fresh.responses || {}, decision: fresh.decision };
  var hub = hubPair(newDest), out = [];
  (idea.members || []).forEach(function (nm) {
    var r = validResp((fresh.responses || {})[nm.code]); if (!r) return;
    var om = memberOf(fresh, nm.code);
    var moved = !!om && normIata(om.airport) !== normIata(nm.airport);
    if (newDest === oldDest && !moved) return;
    var patch = { status: r.status, origin: om && isIata(r.origin) && r.origin !== normIata(om.airport) ? r.origin : '' };
    if (r.arrive_at && hub.indexOf(r.arrive_at) < 0) patch.arrive_at = '';
    if (r.leave_from && hub.indexOf(r.leave_from) < 0) patch.leave_from = '';
    var q = respondRequest(after, nm.code, patch, { by: 'keep' });
    if (q) out.push(q);
  });
  return out;
}
/* One organizer edit, in order:
   1. a booked traveler keeps the days they booked: before the plan moves, each blank end of a booked answer is
      written as their own (a set end is never rewritten);
   2. the update itself;
   3. the airport-sync answers;
   4. a decision that closes the trip (dropped, or 💵 booked) goes in its own update after them, because the
      Worker refuses answers on a closed trip.
   On a trip that is already closed the Worker takes no answers, so an edit that would need step 1, or step 3
   without this very update reopening the trip, builds nothing: reopen first, then edit.
   PIA-136 opts.owed = {base, codes}: the airport-sync answers an earlier edit still owes (its update landed, these
   answers did not). They are rebuilt here against the record as it is now, with base (the record that earlier edit
   started from) as the old side, so a member's flights follow the move they really made; they ride the next idea
   edit (replacing that edit's own answer for the same member), or go alone when the delta is empty. A closed trip
   takes no answers, so on one they are not sent. */
function owedSync(fresh, responses, decision, idea, owed) {
  var old = { id: fresh.id, idea: owed.base.idea, responses: responses || {}, decision: decision };
  return airportSyncRequests(old, idea).filter(function (q) { return owed.codes.indexOf(q.body.member) >= 0; });
}
function organizerEdit(fresh, editKey, delta, opts) {
  delta = delta || {}; opts = opts || {};
  var owed = opts.owed && opts.owed.base && opts.owed.base.idea && Array.isArray(opts.owed.codes) ? opts.owed : null;
  var ideaEdit = IDEA_DELTA_KEYS.some(function (k) { return hasOwn(delta, k); });
  if (datesHeld(fresh, delta)) return null;   // PIA-138: locked or closed dates never move from a phone that has not seen it
  if (!ideaEdit && !delta.decision) {   // nothing to change: only what an earlier edit still owes
    if (!owed || !fresh || !fresh.id || !fresh.idea || docClosed(fresh)) return null;
    var only = owedSync(fresh, fresh.responses, fresh.decision, fresh.idea, owed);
    return only.length ? only : null;
  }
  var dst = delta.decision && delta.decision.stage, closes = dst === 'booked' || dst === 'dropped';
  // PIA-139: 💵 paid on an open trip goes only once every traveler on the fresh record has booked; on a trip whose dates
  // were never 🔒 (or were unlocked since), the plan is chosen first, because the Worker's booked needs a choice
  if (dst === 'booked' && !docClosed(fresh)) {
    if (paidHeld(fresh)) return null;
    if (!ideaEdit && !(fresh.decision && fresh.decision.chosen)) {
      var ch = updateRequest(fresh, editKey, { decision: { stage: 'chosen' } }, opts);
      var bk = ch && updateRequest(Object.assign({}, fresh, { decision: ch.body.decision }), editKey, { decision: delta.decision }, opts);
      return bk ? [ch, bk] : null;
    }
  }
  if (ideaEdit && closes && !docClosed(fresh)) {
    var tail = updateRequest(fresh, editKey, { decision: delta.decision }, opts);
    var rest = {}; Object.keys(delta).forEach(function (k) { if (k !== 'decision') rest[k] = delta[k]; });
    var head = tail && organizerEdit(fresh, editKey, rest, opts);
    return head ? head.concat([tail]) : null;
  }
  var up = updateRequest(fresh, editKey, delta, opts);
  if (!up) return null;
  if (!up.body.idea) return [up];
  var closed = docClosed(fresh), reopens = closed && !!dst && !closes;
  // build the answers as if the trip were open, then refuse below what a closed trip cannot take
  var open = closed ? { stage: 'proposed' } : fresh.decision;
  var fo = { id: fresh.id, idea: fresh.idea, responses: fresh.responses || {}, decision: open };
  var oldPlan = docPlan(fresh), d = up.body.idea.dates, pinned = {}, before = [];
  var moved = oldPlan && (d.departure !== oldPlan.s || d.return !== oldPlan.e);
  Object.keys(fo.responses).forEach(function (c) { pinned[c] = fo.responses[c]; });
  if (moved) Object.keys(fo.responses).forEach(function (c) {
    var r = validResp(fo.responses[c]);
    if (!r || !r.booked || (r.status !== 'in' && r.status !== 'maybe')) return;
    if (!up.body.idea.members.some(function (m) { return m.code === c; })) return;
    if (isIso(r.available_from) && isIso(r.available_to)) return;
    var q = respondRequest(fo, c, { available_from: r.available_from || oldPlan.s, available_to: r.available_to || oldPlan.e }, { by: 'keep' });
    if (q) { before.push(q); pinned[c] = Object.assign({}, r, { available_from: q.body.available_from, available_to: q.body.available_to, note: q.body.note }); }
  });
  // the sync answers resend dates too, so they start from the answers as they stand after step 1
  var after = airportSyncRequests({ id: fresh.id, idea: fresh.idea, responses: pinned, decision: open }, up.body.idea);
  if (owed && (!closed || reopens)) {
    var ows = owedSync(fresh, pinned, open, up.body.idea, owed);
    after = after.filter(function (q) { return !ows.some(function (o) { return o.body.member === q.body.member; }); }).concat(ows);
  }
  if (closed && (before.length || (after.length && !reopens))) return null;
  return before.concat([up], after);
}
/* P-migrate's two plan choices for a v1 doc: the current plan, and the span of the in-answers' own windows
   widened to contain 📌 (from the doc, else the v1 card's event day) */
function migrateOptions(doc, v1raw) {
  var plan = docPlan(doc), R = (doc && doc.responses) || {}, pin = parseNotes(doc && doc.idea && doc.idea.notes).pin || v1PinFor(v1raw, doc && doc.id);
  var a = '', b = '';
  Object.keys(R).forEach(function (c) {
    var r = validResp(R[c]); if (!r || r.status !== 'in' || !memberOf(doc, c)) return;
    var x = (isIso(r.available_from) && r.available_from) || (plan && plan.s) || '', y = (isIso(r.available_to) && r.available_to) || (plan && plan.e) || '';
    if (!x || !y || x > y) return;
    a = a ? minD(a, x) : x; b = b ? maxD(b, y) : y;
  });
  if (a && pin) { a = minD(a, pin); b = maxD(b, pin); }
  return { current: plan, span: a ? { s: a, e: b } : null, pin: pin, labels: migrateLabels(doc && doc.idea && doc.idea.members) };
}
/* P-migrate: one update that copies the recommendation's airport, city and the picked plan into the idea, adds 📌,
   puts faces on the labels (codes never change), nulls recommendation and re-chooses when the doc was chosen; then
   one answer per member whose own window now equals the plan, sent blank (follows the plan). PIA-153 choice.title: the
   trip's picture and name as the review left them (P-edit's controls, '<picture> <name>'), in that same update; a title
   with no name is refused, and one left as it was is not sent. */
function migrateRequests(fresh, editKey, choice) {
  choice = choice || {};
  if (!fresh || !fresh.idea || (choice.plan ? !isIso(choice.plan.s) || !isIso(choice.plan.e) || choice.plan.e < choice.plan.s : !!docPlan(fresh))) return null;
  if (hasOwn(choice, 'title') && (typeof choice.title !== 'string' || !splitLabel(clip(choice.title, TEXT_MAX.title)).name)) return null;
  var rec = fresh.idea.recommendation || {}, ap = normIata(rec.airport) || docDest(fresh);
  var city = airportInfo(ap).city || clip(rec.city || (fresh.idea.destination && fresh.idea.destination.city), TEXT_MAX.city);
  var labels = {}; migrateLabels(fresh.idea.members).concat(choice.labels || []).forEach(function (x) { if (x && x.code && x.label) labels[x.code] = x.label; });
  var delta = {
    destination: { airport: ap, city: city },
    dates: choice.plan ? { departure: choice.plan.s, return: choice.plan.e } : cleanDates(fresh.idea.dates),
    pin: hasOwn(choice, 'pin') ? choice.pin : parseNotes(fresh.idea.notes).pin,
    members: (fresh.idea.members || []).map(function (m) { return { code: m.code, label: labels[m.code] || migrateLabel(m) }; })   // (labels: what the trip shows, then the review's)
  };
  if (choice.plan && delta.pin && (delta.pin < choice.plan.s || delta.pin > choice.plan.e)) return null;
  if (fresh.decision && fresh.decision.stage === 'chosen' && choice.plan) delta.decision = { stage: 'chosen' };   // re-chosen on the migrated idea, with no price
  // A migrated plan cannot move a booked traveler's implicit dates. Pin them before the update.
  var before = [], oldPlan = docPlan(fresh), R = JSON.parse(JSON.stringify(fresh.responses || {}));
  var moves = oldPlan && choice.plan && (oldPlan.s !== choice.plan.s || oldPlan.e !== choice.plan.e);
  if (docClosed(fresh) && moves) return null;
  if (moves) Object.keys(R).forEach(function (c) {
    var r = R[c]; if (!r || !r.booked || (r.available_from && r.available_to)) return;
    var patch = { available_from: r.available_from || oldPlan.s, available_to: r.available_to || oldPlan.e };
    var q = respondRequest(fresh, c, patch, { by: 'keep' });
    if (q) { before.push(q); R[c] = Object.assign({}, r, patch); }
  });
  // Adding structure must never silently clip an existing caption.
  var caption = hasOwn(choice, 'caption') ? choice.caption : parseNotes(fresh.idea.notes).caption;
  if (buildNotes(delta.pin, null, caption).length < ((delta.pin ? '📌' + delta.pin + (String(caption || '').trim() ? ' ' : '') : '') + String(caption || '').trim()).length) return null;
  if (hasOwn(choice, 'caption')) delta.caption = choice.caption;
  if (hasOwn(choice, 'title') && clip(choice.title, TEXT_MAX.title) !== clip(fresh.idea.title, TEXT_MAX.title)) delta.title = choice.title;
  var up = updateRequest(fresh, editKey, delta, { migrate: true });
  if (!up) return null;
  var after = { id: fresh.id, idea: up.body.idea, responses: R, decision: fresh.decision }, out = before.concat([up]);
  Object.keys(R).forEach(function (c) {
    var r = validResp(R[c]);
    if (!choice.plan || docClosed(fresh) || !r || r.booked || r.available_from !== choice.plan.s || r.available_to !== choice.plan.e) return;
    var q = respondRequest(after, c, { available_from: '', available_to: '' }, { by: 'keep' });
    if (q) out.push(q);
  });
  return out;
}

var HISTORY_STARTERS = [
  {
    "id": "nyc",
    "mode": "solo",
    "title": "NYC — First visit to Anjo (booked)",
    "routeTxt": "LAX → JFK (one-way · chains into Memphis)",
    "origin": "LAX",
    "dest": "JFK",
    "dep": "2026-08-28",
    "ret": null,
    "stage": "booked",
    "notes": "Booked: B6 424 LAX 9:49a → JFK 6:24p, Fri Aug 28. First NYC visit since the move. No return leg on purpose — Mon Aug 31 continues LGA → MEM for the work week.",
    "reminders": [
      "Anjo meets at JFK Friday evening"
    ],
    "nextAction": "",
    "blockers": [],
    "gf": {
      "from": "LAX",
      "to": "JFK"
    }
  },
  {
    "id": "memphis",
    "mode": "solo",
    "title": "Memphis — Work trip",
    "routeTxt": "LGA → MEM · MEM → LAX (via DFW)",
    "origin": "LGA",
    "dest": "MEM",
    "dep": "2026-08-31",
    "ret": "2026-09-03",
    "stage": "booked",
    "notes": "BOOKED: DL 4903 LGA 8:41a → MEM 10:36a, Mon Aug 31 — departs from NYC, chained after the Anjo visit. Return Thu Sep 3: AA 3932 MEM 7:31p → DFW 9:20p, AA 1913 DFW 10:45p → LAX 11:57p — home the night before Peru.",
    "reminders": [],
    "nextAction": "",
    "blockers": [],
    "gf": {
      "from": "LGA",
      "to": "MEM"
    }
  },
  {
    "id": "peru",
    "key": "peru",
    "mode": "solo",
    "title": "Peru — Machu Picchu (solo)",
    "routeTxt": "LAX → SCL → LIM → CUZ · LIM → LAX",
    "origin": "LAX",
    "dest": "CUZ",
    "dep": "2026-09-04",
    "ret": "2026-09-13",
    "stage": "completed",
    "notes": "BOOKED: LATAM via Santiago (not the direct red-eye the plan assumed) — LA 603 LAX 3:55p Sep 4 → SCL 5:35a+1 · LA 650 SCL 7:50a → LIM 10:45a · LA 2028 LIM 1:05p → CUZ 2:25p Sep 5. Lands 2.5h before the 17:00 briefing. Return LA 2224 CUZ 9:20p Sep 12 → LIM · LA 2478 LIM 12:40a → LAX 7:50a Sep 13. Trek was already booked ($1,200).",
    "reminders": [
      "Trek briefing 17:00 Sep 5 · trek operator office",
      "Passport valid 6+ months from entry",
      "A friend is also in Cusco Sep 5–12"
    ],
    "nextAction": "",
    "blockers": [],
    "gf": {
      "from": "LAX",
      "to": "CUZ",
      "openjaw": true
    }
  },
  {
    "id": "thanksgiving",
    "key": null,
    "mode": "family",
    "title": "🦃 Thanksgiving at home — Peoria",
    "routeTxt": "Ashwin (LAX) + Anjo (LGA) → PIA Fri Nov 20 · home from ORD Sun Nov 29 · Mom & Dad host",
    "hub": "PIA",
    "dep": "2026-11-20",
    "ret": "2026-11-29",
    "eventDate": "2026-11-26",
    "stage": "planning",
    "bookBy": "2026-11-01",
    "notes": "Thanksgiving at Mom & Dad’s in Peoria, with the Peoria parade. Plan: fly in direct to PIA Fri Nov 20, fly home from ORD Sun Nov 29 (two one-ways). Arrivals can still be staggered — everyone picks their own arrive / leave dates on the RSVP link.",
    "reminders": [
      "Send the RSVP link to the family group text",
      "Thanksgiving-week fares rise fast — book soon after everyone answers"
    ],
    "nextAction": "Ask the family — everyone picks arrive / leave",
    "blockers": [
      "dates"
    ],
    "calendarEvents": [
      {
        "title": "Thanksgiving dinner — Peoria",
        "start": "2026-11-26",
        "end": "2026-11-27",
        "location": "Peoria, IL",
        "notes": "At Mom & Dad’s"
      }
    ],
    "gf": {
      "from": "LAX",
      "to": "PIA",
      "returnFrom": "ORD"
    }
  },
  {
    "id": "tgiving",
    "key": null,
    "mode": "family",
    "title": "🦃 Cary baby shower — postponed",
    "routeTxt": "Was: Ashwin Nov 21 + Anjo Nov 24 → PIA → RDU",
    "hub": "RDU",
    "dep": "2026-11-26",
    "ret": "2026-11-29",
    "eventDate": null,
    "stage": "completed",
    "notes": "Postponed — the shower is being rescheduled. Kept in history; move back to Planning with new dates when it is set.",
    "reminders": [],
    "nextAction": "Postponed — revive when the shower is rescheduled",
    "blockers": [],
    "gf": {
      "from": "LGA",
      "to": "RDU"
    }
  },
  {
    "id": "london",
    "key": "london",
    "mode": "family",
    "title": "London — Family trip",
    "routeTxt": "PIA + LAX + JAX → LHR",
    "hub": "LHR",
    "dep": "2026-06-25",
    "ret": "2026-07-03",
    "stage": "completed",
    "notes": "Completed — flew Jun 25, returned Jul 3.",
    "reminders": [],
    "gf": {
      "from": "LAX",
      "to": "LHR"
    }
  }
];
/* PIA-146: an explicit import source, never fed into the list or model on boot. The frozen starter
   records are v1's real family history; the caller overlays this phone's v1 storage, then reviews each
   item before creating a shared doc. No fare or recommendation is copied into a shared price. */
function historyItems(raw, today) {
  var stored = raw == null || raw === '' ? { overrides: {}, added: [] } : readV1Storage(raw);
  if (!stored || Array.isArray(stored) || (stored.overrides && (typeof stored.overrides !== 'object' || Array.isArray(stored.overrides))) || (stored.added && !Array.isArray(stored.added))) return null;
  var list = JSON.parse(JSON.stringify(HISTORY_STARTERS)), over = JSON.parse(JSON.stringify(stored.overrides || {}));
  // v1's targeted corrections, applied to a copy; the original storage is never changed.
  if (over.peru && over.peru.dep === '2026-09-05') delete over.peru.dep;
  if (over.thanksgiving && over.thanksgiving.dep === '2026-11-25') delete over.thanksgiving.dep;
  if (over.tgiving) ['stage', 'dep', 'ret', 'eventDate', 'nextAction', 'blockers'].forEach(function (k) { delete over.tgiving[k]; });
  if (over.peru && over.peru.stage === 'booked') delete over.peru.stage;
  ['peru', 'memphis'].forEach(function (id) {
    var o = over[id]; if (!o) return;
    if (o.stage === 'watching' || o.stage === 'planning') delete o.stage;
    delete o.dep; delete o.ret;
  });
  list.forEach(function (t) {
    var o = over[t.id]; if (!o || typeof o !== 'object') return;
    ['stage', 'sharedIdeaId', 'notes', 'nextAction', 'dep', 'ret', 'eventDate', 'blockers'].forEach(function (k) {
      if (!hasOwn(o, k)) return;
      if (k === 'dep' || k === 'ret' || k === 'eventDate') { if (isIso(o[k])) t[k] = o[k]; }
      else t[k] = o[k];
    });
  });
  (stored.added || []).forEach(function (a) {
    if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(a.id) || /^(?:__proto__|constructor|prototype)$/.test(a.id) || list.some(function (t) { return t.id === a.id; })) return;
    var end = a.ret || a.dep;
    // v1's date-scoped duplicates of the NYC / Memphis starters.
    if (a.mode === 'solo' && /^(NYC|JFK|LGA|EWR)$/i.test(String(a.dest || '')) && a.dep >= '2026-08-26' && a.dep <= '2026-09-01') return;
    if (a.mode === 'solo' && /^(MEM|MEMPHIS)$/i.test(String(a.dest || '')) && a.dep && a.dep <= '2026-09-04' && end >= '2026-08-31') return;
    var copy = JSON.parse(JSON.stringify(a)), codeRe = /^[A-Za-z0-9_-]{1,32}$/, destRe = copy.mode === 'family' ? /^[A-Za-z0-9 _&.,'-]{1,48}$/ : codeRe;
    if (['origin', 'hub', 'key'].some(function (k) { return copy[k] != null && (typeof copy[k] !== 'string' || !codeRe.test(copy[k])); }) || copy.dest != null && (typeof copy.dest !== 'string' || !destRe.test(copy.dest))) return;
    if (copy.gf && (copy.gf.from != null && !codeRe.test(String(copy.gf.from)) || copy.gf.to != null && !destRe.test(String(copy.gf.to)))) return;
    ['dep', 'ret', 'eventDate'].forEach(function (k) { if (copy[k] != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(copy[k]))) copy[k] = null; });
    if (copy.sharedIdeaId != null && !IDEA_ID_RE.test(String(copy.sharedIdeaId))) delete copy.sharedIdeaId;
    if (['watching', 'planning', 'booked', 'completed'].indexOf(copy.stage) < 0) copy.stage = 'watching';
    copy.mode = copy.mode === 'family' ? 'family' : 'solo';
    list.push(copy);
  });
  return list.map(function (t) {
    var postponed = t.id === 'tgiving' || /postponed/i.test(String(t.title || '') + ' ' + String(t.notes || ''));
    var end = t.ret || t.dep, past = isIso(end) && end < today;
    return { key: t.id, source: t, linked: IDEA_ID_RE.test(String(t.sharedIdeaId || '')) ? t.sharedIdeaId : '',
      stage: postponed ? 'dropped' : (t.stage === 'completed' || t.stage === 'booked' ? 'booked' : 'proposed'),
      archive: postponed || t.stage === 'completed' || (t.stage === 'booked' && past) };
  });
}
function historyDraft(item, today) {
  var t = item.source, family = t.mode === 'family', known = HISTORY_STARTERS.some(function (s) { return s.id === item.key; });
  return { title: String(t.title || ''), dest: { airport: normIata(t.hub) || normIata(t.dest) || normIata(t.gf && t.gf.to) },
    dates: { departure: isIso(t.dep) ? t.dep : '', return: isIso(t.ret) ? t.ret : '' }, pin: isIso(t.eventDate) ? t.eventDate : '',
    caption: firstWords(String(t.notes || ''), 12).text.slice(0, 480),
    members: family ? familyPreset(t.dep, today).map(function (m) { return { name: m.name, face: m.face, airport: m.airport, headcount: m.headcount }; }) :
      [{ name: known ? 'Ashwin' : '', face: '💪', airport: normIata(t.origin) || normIata(t.gf && t.gf.from), headcount: 1 }],
    stage: item.stage, archive: item.archive };
}
/* Booking marks record a reviewed historical booking, never an invented payment. Postponed imports close
   without any In answers. Active imports invite people but do not answer for them. Safe to rebuild on retry. */
function historyFinishRequests(doc, key, draft) {
  if (!doc || docClosed(doc)) return [];
  if (draft.stage === 'dropped') { var drop = updateRequest(doc, key, { decision: { stage: 'dropped' } }); return drop ? [drop] : null; }
  if (draft.stage !== 'booked') return [];
  var out = [], current = doc;
  (doc.idea.members || []).forEach(function (m) {
    var r = validResp((doc.responses || {})[m.code]);
    if (!r) { var q = respondRequest(current, m.code, { status: 'in' }, { by: 'keep' }); if (q) out.push(q); }
    if ((!r || !r.booked) && localSet(docDest(doc)).indexOf(normIata(m.airport)) < 0) { var qs = bookedRequests(current, m.code, true, { by: 'keep' }); if (qs) { if (!r) qs = qs.filter(function (q) { return q.path.indexOf('/idea/booked') === 0; }); out = out.concat(qs); } }
  });
  return out;
}

/* ---- the shared watchlist (PIA-135): new answers, what needs me, list links, groups, book-by, the US map ---- */
var LIST_LINK_MAX = 20;                                                  // trips one list link carries
/* when each member last answered: the newest 'rsvp:' log entry by that member, or the answer's own updated_at when
   the log no longer holds it (the Worker keeps its last 50 entries). Both are the Worker's ISO times. */
function answerTimes(doc) {
  var out = Object.create(null), R = (doc && doc.responses) || {};
  var put = function (code, at) { if (typeof code === 'string' && MEMBER_CODE_RE.test(code) && typeof at === 'string' && at && (!out[code] || at > out[code])) out[code] = at; };
  ((doc && doc.log) || []).forEach(function (l) { if (l && /^rsvp:/.test(String(l.event || ''))) put(l.by, l.at); });
  Object.keys(R).forEach(function (c) { var r = validResp(R[c]); if (r) put(c, r.updated_at); });
  return out;
}
/* the newest answer on the trip: what "seen" records (pialax_idea_seen_v1, v1's format: never older than v1's own
   newest-rsvp-log rule, so v1 reads the same trip as seen too) */
function newestAnswerAt(doc) { var t = answerTimes(doc), last = ''; Object.keys(t).forEach(function (c) { if (t[c] > last) last = t[c]; }); return last; }
/* faces with an answer that arrived since my last look (seenAt), never my own; only on a trip I am in, off the shelf */
function newAnswers(model, seenAt) {
  if (!model || !model.me || model.shelf) return [];
  var s = typeof seenAt === 'string' ? seenAt : '';
  return model.members.filter(function (x) { return x.code !== model.me.code && !!x.resp && !!x.ansAt && x.ansAt > s; }).map(function (x) { return x.code; });
}
/* a trip still waiting on my own answer (a host's default In is not an answer yet) */
function awaitsMe(model) {
  var me = model && model.me;
  return !!(me && !model.shelf && !model.closed && (me.status === 'waiting' || me.status === 'host-default'));
}
/* the book-by cue: the days to go, in red, only when it matters (the organizer, or a traveler who answered and has
   not booked) and the book-by day (departure − 21) has passed with travelers unbooked; else null */
function bookByCue(model) {
  var me = model && model.me;
  if (!model || !model.plan || model.shelf || !model.bookByPassed || model.daysTo == null || model.daysTo < 0) return null;
  return model.org || !!(me && me.traveler && me.answered && !me.booked) ? model.daysTo : null;
}
/* the card's days to go (⏳N), on every upcoming dated trip off the shelf, for everyone. frac is the book-by arc
   under it: the share of the days left that still come before the book-by day, (days to book-by) / (days to go),
   so it empties as book-by nears and is empty once it has passed; null once every traveler has booked (nothing
   left to book). late = the red cue (bookByCue: book-by passed, and it matters to this phone). null without a
   plan, on the shelf, or once the trip has begun. */
function togoCue(model) {
  if (!model || !model.plan || model.shelf || model.daysTo == null || model.daysTo < 0) return null;
  var open = model.travelers.some(function (x) { return !x.booked; });
  var frac = !open ? null : model.daysTo > 0 ? Math.round(Math.max(0, Math.min(1, model.bookByLeft / model.daysTo)) * 1000) / 1000 : 0;
  return { days: model.daysTo, frac: frac, late: bookByCue(model) != null };
}
/* trips grouped by who is in them: two trips share a group when they share anyone but me (a chain joins them).
   Most trips first, then the group whose first trip comes first in the list. A trip with nobody else is in none.
   Each group: {ids, people (normalized names), faces, names (short names, for a screen reader), first}. */
function tripGroups(models, mine) {
  var groups = [], order = {};
  (models || []).forEach(function (m, i) {
    if (!m) return;
    order[m.id] = i;
    var others = m.members.filter(function (x) { return x.norm && x.norm !== mine && !(m.me && x.code === m.me.code); });
    if (!others.length) return;
    var hit = groups.filter(function (g) { return others.some(function (x) { return g.people.indexOf(x.norm) >= 0; }); });
    var g = { ids: [], people: [], faces: [], names: [] };
    var add = function (norm, face, name) { if (g.people.indexOf(norm) < 0) { g.people.push(norm); g.faces.push(face); g.names.push(name); } };
    hit.forEach(function (h) { g.ids = g.ids.concat(h.ids); h.people.forEach(function (n, k) { add(n, h.faces[k], h.names[k]); }); });
    groups = groups.filter(function (x) { return hit.indexOf(x) < 0; });
    g.ids.push(m.id);
    others.forEach(function (x) { add(x.norm, x.face, x.short || x.one || x.name); });
    groups.push(g);
  });
  groups.forEach(function (g) { g.ids.sort(function (a, b) { return order[a] - order[b]; }); g.first = order[g.ids[0]]; });
  return groups.sort(function (a, b) { return b.ids.length - a.ids.length || a.first - b.first; });
}
/* PIA-142: Trips › Family, the people × trips board, read from the trips' own models (one tripModel per trip: the very
   objects the cards and the trip views draw), so a cell can never say anything that trip's card or view does not.
   models: the trips this phone lists that have been read, in the order the screens show them (the cards', then the
   shelf's); o = {past: 🗄 adds the shelf's trips as columns (hosting history), name: who this phone is when no trip
   shown says so (its profile name)}.
   • cols: the trips off the shelf, then, with o.past, the shelf's; never a dropped trip (it never happened). They are the
     models themselves, so a column's heads are that trip's own headsIn / heads (by headcount: Mom & Dad count 2).
   • rows: one per person, merged across the columns by normalized name. The k-th member of a name on one trip joins the
     k-th of that name on another, so two "Sam Lee"s on one trip stay two rows. A v1 'Me' (no name) is my row when it is
     this phone's own face there; on any other phone it is that trip's organizer, whom v1's own family preset names by
     airport (P-migrate's suggestion: 'Me' at LAX is Ashwin), so it joins that person's row when they are on the board by
     name already (and not on its own trip by name); any other v1 'Me' is a row of its own, after the named rows. Me first
     (who this phone is on a trip shown, else on any trip given, else o.name), then as they first appear. Each row: {key,
     norm, name, short, one, face, color (of the first named appearance), headcount (the largest), me, hosted, cells},
     with cells[i] = that trip's own member (answer, marks, own days: all the model's) or null (not on that trip).
   • hosted: how many of the trips given (shown or not, a dropped one never) this person hosts, past and planned: a host
     by airport who has not said Out. 🏠n on their row, the fairest next host at a glance. */
function familyBoard(models, o) {
  o = o || {};
  var real = (models || []).filter(function (m) { return m && m.members && m.decision !== 'dropped'; });
  var cols = real.filter(function (m) { return !m.shelf; }).concat(o.past ? real.filter(function (m) { return m.shelf; }) : []);
  var keysOf = function (m) {
    var n = {};
    return m.members.map(function (x) {
      if (!x.norm) return '#' + m.id + '|' + x.code;
      n[x.norm] = (n[x.norm] || 0) + 1;
      return n[x.norm] > 1 ? x.norm + '#' + n[x.norm] : x.norm;
    });
  };
  var keys = real.map(keysOf), order = cols.concat(real), mine = '';
  order.forEach(function (m) { if (!mine && m.me && m.me.norm) mine = keys[real.indexOf(m)][m.members.indexOf(m.me)] || ''; });
  if (!mine && o.name) mine = normName(o.name);
  // a v1 'Me' this phone is joins my own row (it is me, named or not); the first one is me when nothing else says who I am
  order.forEach(function (m) {
    var t = real.indexOf(m), i = m.me && !m.me.norm ? m.members.indexOf(m.me) : -1;
    if (i < 0) return;
    if (!mine) mine = keys[t][i];
    else if (keys[t].indexOf(mine) < 0) keys[t][i] = mine;
  });
  // anyone else's v1 'Me': the family preset's person at its airport, when that person has a named row on the board
  var named = {};
  cols.forEach(function (m) { var t = real.indexOf(m); m.members.forEach(function (x, i) { if (x.norm) named[keys[t][i]] = 1; }); });
  real.forEach(function (m, t) {
    m.members.forEach(function (x, i) {
      if (x.norm || keys[t][i] === mine) return;
      var f = FAMILY_BY_AIRPORT[normIata(x.airport)], fam = f ? FAMILY.filter(function (g) { return g.key === f; })[0] : null, n = fam ? normName(fam.name) : '';
      if (n && named[n] && keys[t].indexOf(n) < 0) keys[t][i] = n;
    });
  });
  var hosted = {};
  real.forEach(function (m, t) { m.members.forEach(function (x, i) { if (x.host && x.status !== 'out') hosted[keys[t][i]] = (hosted[keys[t][i]] || 0) + 1; }); });
  var colKeys = cols.map(function (m) { return keys[real.indexOf(m)]; });
  var rows = [], at = {};
  cols.forEach(function (m, c) {
    m.members.forEach(function (x, i) {
      var k = colKeys[c][i], r = at[k];
      if (!r) {
        r = at[k] = { key: k, norm: x.norm, name: x.name, short: x.short, one: x.one, face: x.face, color: x.color, headcount: x.headcount, me: !!mine && k === mine,
          hosted: hosted[k] || 0, cells: cols.map(function () { return null; }) };
        rows.push(r);
      }
      if (!r.norm && x.norm) { r.norm = x.norm; r.name = x.name; r.short = x.short; r.one = x.one; r.face = x.face; r.color = x.color; }
      r.headcount = Math.max(r.headcount, x.headcount);
      r.cells[c] = x;
    });
  });
  rows = rows.filter(function (r) { return r.norm || r.me; }).concat(rows.filter(function (r) { return !r.norm && !r.me; }));
  var mi = -1;
  rows.forEach(function (r, i) { if (mi < 0 && r.me) mi = i; });
  if (mi > 0) rows.unshift(rows.splice(mi, 1)[0]);
  return { cols: cols, rows: rows, mine: mine };
}
/* the v2 list link: <base>?l=<id>.<id>…&f=<my face>. Trip ids and one face only: never a key, a token or a price. */
function listLink(base, ids, face) {
  var b = String(base || ''), list = uniq((ids || []).filter(function (id) { return IDEA_ID_RE.test(String(id)); })).slice(0, LIST_LINK_MAX);
  if (!/^[a-z][a-z0-9+.-]*:\/\/[^?#\s]*$/i.test(b) || !list.length) return '';
  var f = faceOf(face);
  return b + '?l=' + list.join('.') + (f ? '&f=' + encodeURIComponent(f) : '');
}
/* The US map: d3-geo's geoAlbersUsa fitted to a 360×230 box with 6px margins (scale 445.842, translate
   192.959, 113.430), with its Alaska and Hawaii insets and clip boxes, ported exactly (checked against d3 for
   every airport in the table). A point outside all three boxes is off the map: null. */
var US_MAP = { w: 360, h: 230, k: 445.84219085444704, x: 192.95931303862665, y: 113.43020120431142 };
function conicEqualArea(p0, p1, rot, cen, k, tx, ty, box) {
  var R = Math.PI / 180, s0 = Math.sin(p0 * R), n = (s0 + Math.sin(p1 * R)) / 2, c = 1 + s0 * (2 * n - s0), r0 = Math.sqrt(c) / n;
  var raw = function (lam, phi) { var r = Math.sqrt(c - 2 * n * Math.sin(phi)) / n, x = lam * n; return [r * Math.sin(x), r0 - r * Math.cos(x)]; };
  var c0 = raw(cen[0] * R, cen[1] * R);
  return function (lon, lat) {
    var lam = (lon + rot) * R; if (lam > Math.PI) lam -= 2 * Math.PI; else if (lam < -Math.PI) lam += 2 * Math.PI;
    var p = raw(lam, lat * R), X = tx + k * (p[0] - c0[0]), Y = ty - k * (p[1] - c0[1]);
    return X >= box[0] && X <= box[2] && Y >= box[1] && Y <= box[3] ? [X, Y] : null;
  };
}
var US_PROJ = (function (k, x, y) {
  var e = 1e-6;
  return [conicEqualArea(29.5, 45.5, 96, [-0.6, 38.7], k, x, y, [x - 0.455 * k, y - 0.238 * k, x + 0.455 * k, y + 0.238 * k]),
    conicEqualArea(55, 65, 154, [-2, 58.5], k * 0.35, x - 0.307 * k, y + 0.201 * k, [x - 0.425 * k + e, y + 0.120 * k + e, x - 0.214 * k - e, y + 0.234 * k - e]),
    conicEqualArea(8, 18, 157, [-3, 19.9], k, x - 0.205 * k, y + 0.212 * k, [x - 0.214 * k + e, y + 0.166 * k + e, x - 0.115 * k - e, y + 0.234 * k - e])];
})(US_MAP.k, US_MAP.x, US_MAP.y);
function usPoint(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || !isFinite(lat) || !isFinite(lon)) return null;
  for (var i = 0; i < US_PROJ.length; i++) { var p = US_PROJ[i](lon, lat); if (p) return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]; }
  return null;
}
/* where an airport sits on the US map, or null (an unknown code, or a place off the map) */
function mapXY(code) { var a = airportInfo(code); return a.known ? usPoint(a.lat, a.lon) : null; }

/* ---- the one create path, organizer edits and join requests (PIA-136) ---- */
var NAME_WORDS = 3;                                                      // a person's name: ≤3 words wherever it is typed
var TITLE_WORDS = 12;                                                    // a trip name being typed (it counts on P-new-what)
var CAPTION_WORDS = 20;                                                  // a caption (or a note): ≤20 words
var NAME_CHARS = TEXT_MAX.label - 3;                                     // '<face> <name>' ≤40 UTF-16 units; a face is ≤2, then a space
var TITLE_CHARS = TEXT_MAX.title - 3;                                    // '<scene> <name>' ≤80
var CAPTION_CHARS = TEXT_MAX.notes - 13;                                 // a new trip's caption: room left after '📌YYYY-MM-DD ' (a new trip has 📌 or 🌙N, never both)
var V1_IDEA_VERSIONS = { 'trip-idea-v1': 1, 'trip-idea-v0': 1 };         // = v1 TRIP_IDEA_BUILDER_VERSION (and its v0)
function wordsIn(s) { return String(s == null ? '' : s).split(/\s+/).filter(function (w) { return /\p{L}/u.test(w); }).length; }
/* a typed value under a word cap: the change is taken while it stays within the cap, or when it adds no word to a
   text that was already longer (so nothing already there is ever cut); otherwise it is refused and prev stays */
function capTyped(next, prev, max) { var n = wordsIn(next); return n <= max || n <= wordsIn(prev) ? String(next) : String(prev == null ? '' : prev); }
/* the same rule for a change that inserts more than one keystroke (a paste, autocorrect): everything that was there
   stays, and as much of the inserted text as fits under the cap goes in. {text, cut: some of the insertion was left
   out, at: where the caret goes (after what went in; -1 when nothing was cut)}. The insertion is what lies between
   the longest common start and end of prev and next. */
function fitTyped(next, prev, max) {
  var nx = String(next == null ? '' : next), pv = String(prev == null ? '' : prev), lim = Math.max(max, wordsIn(pv));
  if (wordsIn(nx) <= lim) return { text: nx, cut: false, at: -1 };
  var p = 0, s = 0;
  while (p < nx.length && p < pv.length && nx.charCodeAt(p) === pv.charCodeAt(p)) p++;
  if (p > 0 && /[\uD800-\uDBFF]/.test(nx.charAt(p - 1))) p--;                       // never split an emoji in two
  while (s < nx.length - p && s < pv.length - p && nx.charCodeAt(nx.length - 1 - s) === pv.charCodeAt(pv.length - 1 - s)) s++;
  if (s > 0 && /[\uDC00-\uDFFF]/.test(nx.charAt(nx.length - s))) s--;
  var head = nx.slice(0, p), tail = nx.slice(nx.length - s), parts = nx.slice(p, nx.length - s).split(/(\s+)/), ins = '', best = '';
  var apart = !tail || /^\s/.test(tail);                                            // a word may end the cut only if it cannot run into the text after it
  for (var i = 0; i < parts.length; i++) {
    ins += parts[i];
    if (/\S/.test(parts[i]) && !apart) continue;
    if (wordsIn(head + ins + tail) > lim) break;
    best = ins;
  }
  return { text: head + best + tail, cut: true, at: head.length + best.length };
}
/* the first n words of a text, and whether words were left out (tokens with no letter ride along for free) */
function firstWords(s, n) {
  var parts = String(s == null ? '' : s).trim().split(/(\s+)/), out = '', w = 0, more = false;
  for (var i = 0; i < parts.length; i++) {
    var t = parts[i];
    if (/\p{L}/u.test(t)) { if (w === n) { more = true; break; } w++; }
    out += t;
  }
  return { text: out.trim(), more: more };
}
/* a person's name as typed (P-new-who, a join request): one space between words, ≤3 words, ≤37 units, a letter in
   it and never the v1 word 'Me'; '' when it is not a usable name */
function cleanName(s) {
  var t = keepName(s);
  return t && wordsIn(t) <= NAME_WORDS ? t : '';
}
/* a name that is already on a trip (a member's, or a group's from another trip): kept as it is, however many words it
   has (the cap is for typing); '' when it is no name (no letter, or the v1 word 'Me') */
function keepName(s) {
  var t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (!t || !/\p{L}/u.test(t) || isMeLabel(t)) return '';
  return clip(t, NAME_CHARS);
}
/* a join request: <base>?idea=<id>&add=<name>.<IATA>. Someone not on the list shares it (P-face 🙋＋); on the
   organizer's phone it opens the people editor with them added. The airport may be blank. */
function joinLink(base, id, name, airport) {
  var b = String(base || ''), n = cleanName(name);
  if (!/^[a-z][a-z0-9+.-]*:\/\/[^?#\s]*$/i.test(b) || !IDEA_ID_RE.test(String(id || '')) || !n) return '';
  return b + '?idea=' + id + '&add=' + encodeURIComponent(n + '.' + normIata(airport));
}
/* ?add=<name>.<IATA> → {name, airport}, or null (no usable name, or something after the last '.' that is no code) */
function parseJoin(v) {
  var s = String(v == null ? '' : v), i = s.lastIndexOf('.');
  var tail = i >= 0 ? s.slice(i + 1).trim() : '', ap = normIata(tail);
  if (tail && !ap) return null;
  var name = cleanName(i >= 0 ? s.slice(0, i) : s);
  return name ? { name: name, airport: ap } : null;
}
function b64text(s) {
  var t = String(s).replace(/\s/g, '+').replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return typeof atob === 'function' ? atob(t) : Buffer.from(t, 'base64').toString('binary');
}
/* A v1 read-only ?tripIdea= link (v1's encodeTripIdeaSharePayload: base64 of the URI-encoded JSON payload, or the
   URI-encoded JSON itself) → the draft P-new opens with: {name, code, mode 'dates'|'window', s, e, pin, nights,
   caption, cut}. Only the place, the plan or window, the event day, the nights and the note are read; v1's prices, hub
   and mode never are. Days already past are not offered again (the picker cannot choose them). v1's note has no
   limit: the caption is its first 20 words within CAPTION_CHARS, and cut says that some of it was left out (the
   sheet shows it with ⚠). null when the value is not such a payload. */
function legacyDraft(raw, today) {
  var s = String(raw == null ? '' : raw), p = null;
  if (!s || s.length > 32768 || !isIso(today)) return null;
  [function () { return decodeURIComponent(b64text(s)); }, function () { return decodeURIComponent(s); }].some(function (dec) {
    try { var v = JSON.parse(dec()); if (v && typeof v === 'object' && hasOwn(V1_IDEA_VERSIONS, v.version)) { p = v; return true; } } catch (e) { /* not this encoding */ }
    return false;
  });
  if (!p) return null;
  var obj = function (v) { return v && typeof v === 'object' ? v : {}; };
  var b = obj(p.builder), r = obj(p.recommendation), dest = obj(b.destination), d = obj(b.dates), c = obj(b.constraints);
  var iso = function (v) { return isIso(v) ? v : ''; };
  var code = normIata(r.airport) || normIata(dest.airport);
  var name = clip(String(r.city || dest.city || '').replace(/\s+/g, ' '), TITLE_CHARS);
  var out = { name: capTyped(name, '', TITLE_WORDS) === name ? name : firstWords(name, TITLE_WORDS).text, code: code, mode: 'dates', s: '', e: '', pin: '', nights: 3, caption: '', cut: false };
  var dep = iso(r.departure) || iso(d.departure), ret = iso(r.return) || iso(d.return);
  var w1 = iso(d.searchStart), w2 = iso(d.searchEnd), L = Math.round(+c.tripLength);
  if (dep && ret && dep <= ret && dep >= today) { out.s = dep; out.e = ret; }
  else if (w1 && w2 && w1 <= w2 && w2 >= today) { out.mode = 'window'; out.s = maxD(w1, today); out.e = w2; out.nights = L >= 1 && L <= 30 ? Math.min(L, Math.max(1, diffD(out.s, out.e))) : Math.max(1, Math.min(3, diffD(out.s, out.e))); }
  var pin = iso(c.eventDate) || iso(p.eventContext);
  if (out.mode === 'dates' && pin && pin >= today && (!out.s || (pin >= out.s && pin <= out.e))) out.pin = pin;
  var notes = typeof p.notes === 'string' ? p.notes.replace(/\s+/g, ' ').trim() : '';
  if (notes) { var fw = firstWords(notes, CAPTION_WORDS), c = clip(fw.text, CAPTION_CHARS); out.caption = c; out.cut = fw.more || c !== fw.text; }
  return out;
}
/* the people of the trips this phone has seen, as ready groups for P-new-who: one per distinct set of people (by
   name), in the order given (newest trip first). An unmigrated v1 trip offers no group: its faces are only read-time
   stand-ins (the preset's or a hashed face, never stored), so a group built from it would hand someone a face they never had. Each:
   {key, faces, rows [{face, name, airport, headcount, me}], family: it is the 👪 three (the token phone shows its
   own 👪 chip)} */
var FAMILY_KEY = FAMILY.map(function (f) { return normName(f.name); }).sort().join('|');
function groupPresets(models) {
  var out = [], seen = {};
  (models || []).forEach(function (m) {
    if (!m || !m.members || m.legacy) return;
    var ms = m.members.filter(function (x) { return !!x.norm; });
    if (!ms.length) return;
    var key = ms.map(function (x) { return x.norm; }).sort().join('|');
    if (hasOwn(seen, key)) return;
    seen[key] = 1;
    var faces = [], rows = ms.map(function (x) {
      var f = faces.indexOf(x.face) < 0 ? x.face : freeFace(faces); faces.push(f);
      return { face: f, name: x.name, airport: x.airport, headcount: x.headcount, me: !!(m.me && m.me.code === x.code) };
    });
    out.push({ key: key, faces: faces, rows: rows, family: key === FAMILY_KEY });
  });
  return out;
}
/* a face for someone new on a trip: the first face nobody on it has, preferring one nobody on this phone's other
   trips has either (so faces stay telling when names are dropped to fit the words) */
function freeFace(used, avoid) {
  var u = used || [], a = avoid || [], i;
  for (i = 0; i < FACES.length; i++) if (u.indexOf(FACES[i]) < 0 && a.indexOf(FACES[i]) < 0) return FACES[i];
  for (i = 0; i < FACES.length; i++) if (u.indexOf(FACES[i]) < 0) return FACES[i];
  return FACES[0];
}

/* ---- the trip view and its answers (PIA-137): who this phone is, the one primary action, the organizer's 🎫 ---- */
/* Who this phone is on one trip, from what it remembers and what the link says. o = {stored: the code this phone
   remembers for the trip (pialax_idea_me_v1), hint: a personal nudge link's code (#m=), names: the names this phone
   already is (its profile, its faces on other trips), join: the name this phone asked to join this trip with}.
   • A remembered face that is on the trip wins. A hint never overrides it: a different hint only asks (P-face, with
     the remembered face outlined and the hint marked), and one tap there decides.
   • The names this phone already is count as remembered too: a hint greets its face for this visit (it writes
     nothing: the first answer does) only when none of those names belongs to a different member of the trip. A
     forwarded nudge link on a phone whose profile is someone else here asks instead, that someone preselected.
   • Else P-face asks. pre = the one member whose name is who this phone already is (a preselected tile, never saved
     by itself); two members with that name, or a nameless v1 'Me', preselect nobody.
   → {me: the code to show as me ('' = nobody), from: 'stored' | 'hint' | '', ask: open P-face, hint, pre} */
function whoAmI(doc, o) {
  o = o || {};
  var ms = ((doc && doc.idea && doc.idea.members) || []).filter(function (m) { return m && typeof m.code === 'string'; });
  var on = function (c) { return typeof c === 'string' && !!c && ms.some(function (m) { return m.code === c; }); };
  var stored = on(o.stored) ? o.stored : '', hint = on(o.hint) ? o.hint : '';
  if (stored) return { me: stored, from: 'stored', ask: !!hint && hint !== stored, hint: hint !== stored ? hint : '', pre: '' };
  var names = (o.names || []).concat(o.join ? [o.join] : []).map(normName).filter(Boolean);
  var hits = ms.filter(function (m) { var n = splitLabel(m.label).name; return !!n && !isMeLabel(n) && names.indexOf(normName(n)) >= 0; });
  var pre = hits.length === 1 ? hits[0].code : '';
  if (hint && (!hits.length || hits.some(function (m) { return m.code === hint; }))) return { me: hint, from: 'hint', ask: false, hint: hint, pre: '' };
  return { me: '', from: '', ask: true, hint: hint, pre: pre };
}
/* The one primary action of a trip view, the same rule for every role (hosts have none):
   • before the dates are set: share and look: 'share' [📣 Share | ✈↗ my search] for a traveler who answered in or
     maybe (and for the organizer even before he answers), 'share-only' for an organizer who does not travel;
   • once set (🔒), with my days still ahead: 'book' [✈ Book ↗ | 🎫 I booked];
   • after my own 🎫: 'booked' [🎫 | ✈⏱↗ Flighty] (kept on a paid trip: a booked flight is still real);
   • 'none': a host, someone who is out, a guest who has not answered (the answer row is the call) or has no face
     here, a set plan whose days have begun, and a closed trip (paid or dropped). */
function primaryAction(model, today) {
  var me = model.me;
  if (model.decision === 'dropped' || (me && me.host)) return 'none';
  if (me && me.traveler && me.booked) return 'booked';
  if (model.closed) return 'none';
  if (!me || !me.traveler) return model.org && !model.locked ? 'share-only' : 'none';
  if (!model.org && !me.answered) return 'none';
  if (model.locked) return me.d1 && me.d1 >= today ? 'book' : 'none';
  return 'share';
}
/* The organizer's 🎫 on someone else's row of the people board, shown once the dates are set or anyone has booked:
   never on a host, never on his own row (his is the primary's), never on a closed trip or an unmigrated v1 doc.
   Marking someone who has not answered in or maybe (waiting, or out) records them as in first (📞, bookedRequests),
   so it asks for a confirming tap; so does taking a 🎫 away. early (PIA-151: their flight section, earlyBook): the same
   control before the dates are 🔒, for a traveler whose days are known and still ahead. → null (no control) or {on, confirm} */
function bookToggle(model, code, early) {
  var x = model.members.filter(function (m) { return m.code === code; })[0] || null;
  if (!x || !model.org || model.legacy || model.closed || x.host || (model.me && model.me.code === code)) return null;
  if (!model.locked && !model.anyBooked && !early) return null;
  return { on: x.booked, confirm: x.booked || !x.answered };
}
/* PIA-151: a flight already bought can be recorded before the dates are 🔒: in a traveler's flight section (P-person) the 🎫
   sits beside Book once their days are known (their own, or the plan's) and still ahead, on a trip still open (the Worker's
   /idea/booked takes a 🎫 at any stage but dropped). PIA-153: a v1 doc not updated yet too (the family's live trips are all v1
   docs): /idea/booked and /idea/respond answer on any record, so a traveler's own 🎫 and then their times go on it exactly as
   on a v2 trip; only the organizer's 🎫 for someone else waits for ⤒ Update trip (bookToggle). The trip view's primary keeps
   its own rule (primaryAction). */
function earlyBook(model, code, today) {
  var x = model.members.filter(function (m) { return m.code === code; })[0] || null;
  return !!x && x.traveler && !model.closed && !model.locked && !model.past && !!x.d1 && !x.bad && x.d1 >= today;
}

/* ---- dates: the one picker (PIA-138) ----
   The plan is the organizer's; a person's own ends are theirs. Moving the plan carries every end that follows it (a
   blank end), because every link, bar and pill is rebuilt from the record; an end someone set never moves with it. */
var SHIFT_STEPS = [-7, -1, 1, 7];                                        // P-dates' day and week shifts
/* a range moved by k days, keeping its length. why: '' it can go; 'past' it would start before today; 'pin' the event day
   (📌) would fall outside it. null for no range. */
function moveRange(s, e, k, pin, today) {
  if (!isIso(s) || !isIso(e) || s > e || !isIso(today)) return null;
  var a = addD(s, k), b = addD(e, k);
  return { s: a, e: b, why: a < today ? 'past' : pin && (pin < a || pin > b) ? 'pin' : '' };
}
/* the organizer's one-tap shift on the trip view: the plan k days earlier or later, keeping its length and 📌. why also
   says why the plan cannot move at all: 'org' (this phone does not organize it), 'legacy' (P-migrate first), 'closed'
   (paid or dropped), 'locked' (🔓 first), 'none' (an undated idea has no plan to move) */
function planShift(model, k, today) {
  var why = !model.org ? 'org' : model.legacy ? 'legacy' : model.closed ? 'closed' : model.locked ? 'locked' : !model.plan ? 'none' : '';
  return why ? { s: '', e: '', why: why } : moveRange(model.plan.s, model.plan.e, k, model.pin, today);
}
/* a phone that has not seen the 🔒 yet never moves a locked plan: a delta that changes the dates (the plan, the ⟦window⟧,
   📌 or 🌙) of a record whose dates are 🔒 (chosen) or that is closed (paid or dropped) is held back, unless the same
   update unlocks it (decision proposed). organizerEdit builds nothing for it, so it is checked on the fresh record every
   write is rebuilt from, not on the screen it was tapped on. → 'locked' | 'closed' | '' (it can go) */
function datesHeld(fresh, delta) {
  var st = fresh && fresh.decision && fresh.decision.stage;
  var why = st === 'booked' || st === 'dropped' ? 'closed' : st === 'chosen' && !docLegacy(fresh) ? 'locked' : '';
  if (!why || !delta || !fresh.idea || (delta.decision && delta.decision.stage === 'proposed')) return '';
  if (!hasOwn(delta, 'dates') && !hasOwn(delta, 'pin') && !hasOwn(delta, 'nights')) return '';
  var a = cleanDates(fresh.idea.dates), b = cleanDates(hasOwn(delta, 'dates') ? delta.dates || {} : {}, a), N = parseNotes(fresh.idea.notes);
  var pin = hasOwn(delta, 'pin') ? (isIso(delta.pin) ? delta.pin : '') : N.pin;
  var nights = hasOwn(delta, 'nights') ? (delta.nights && +delta.nights > 0 ? Math.round(+delta.nights) : null) : N.nights;
  var moved = ['departure', 'return', 'searchStart', 'searchEnd'].some(function (k) { return a[k] !== b[k]; }) || pin !== N.pin || nights !== N.nights;
  return moved ? why : '';
}
/* a holiday chip: the holiday's whole long weekend (🦃 Wed–Sun; 🎗 and 🌭 Fri–Mon; 🎆 🎄 🎉 the day ±2), never before
   today, with the holiday itself as the event day (📌) → {s, e, pin, g, k}; null for a day that is not a holiday (or is past) */
function holidayPick(day, today) {
  var h = isIso(day) && isIso(today) ? holidayOn(day) : null;
  if (!h || h.d < today) return null;
  var s = maxD(addD(h.d, h.r[0]), today);
  return { s: s, e: maxD(addD(h.d, h.r[1]), s), pin: h.d, g: h.g, k: h.k };
}
/* what stops a picked plan (or ⟦window⟧ with o.window) from being saved: '' fine, 'empty' nothing picked, 'partial' only a
   start, 'order', 'past' (it starts before today), 'pin' (the event day falls outside the plan: 📌⚠), 'nights' (a window
   shorter than its 🌙 nights). o = {today, pin, window, nights} */
function planCheck(s, e, o) {
  o = o || {};
  if (!s && !e) return 'empty';
  if (!isIso(s) || !isIso(e)) return 'partial';
  if (e < s) return 'order';
  if (!isIso(o.today) || s < o.today) return 'past';
  if (!o.window && o.pin && (o.pin < s || o.pin > e)) return 'pin';
  if (o.window && o.nights && +o.nights > diffD(s, e)) return 'nights';
  return '';
}
/* the organizer edits that change the dates (organizerEdit deltas; each touches nothing else):
   • a plan (P-dates Save, ⬚ the best window): departure / return with 📌, and no 🌙 (a plan has its own length); the
     ⟦window⟧ stays as it was;
   • a ⟦window⟧ with 🌙 nights for an undated idea;
   • 🗓⊘: the plan cleared, so the idea is undated again. It keeps a ⟦window⟧ (the flex window it had: the explicit one,
     else the plan ± 7) and the plan's length as 🌙N, so its best window still has something to work with; 📌 stays. */
function planDelta(s, e, pin) { return { dates: { departure: s, return: e }, pin: pin || '', nights: null }; }
function windowDelta(s, e, nights) { return { dates: { departure: '', return: '', searchStart: s, searchEnd: e }, nights: nights || null }; }
function clearDelta(model) {
  var w = model.win;
  return w ? { dates: { departure: '', return: '', searchStart: w.s, searchEnd: w.e }, nights: model.nights || null } : { dates: { departure: '', return: '' } };
}
/* one person's own days, set in P-dates or one leg at a time. end: null both ends (s, e); 0 the arrive end only (s); 1 the
   leave end only (e). A blank value goes back to following the plan (s = e = '' with end null: follow the plan again). The
   other end stays as it is (their own, or the plan's). → {patch (for respondRequest), d1, d2 (their days after it), why,
   off} or null for someone not on the trip. why: '' fine; 'host' (a host is there all along: no days to set); 'out';
   'answer' (no in / maybe answer yet: days are never set for someone who has not answered); 'partial' (an undated trip
   needs both ends); 'order'; 'past' (an end set before today). off: an end set lands outside the plan (⚠, still allowed).
   An end picked on the plan's own day for that side (the plan's first day as an arrival, its last as a departure) keeps
   following the plan (blank), unless it is already their own: a pick that only repeats the plan never pins that end
   against the next move (so "arrive a day later" with ↔ moves the arrival alone). PIA-151: a booked traveler's pick is
   always stored as their own day, the plan's own day too, even an end still blank picked on the day it already is (their
   flight is bought: no later plan move may carry it; organizerEdit also pins a booked traveler's blank ends before every
   move), and a booked end never goes back to following the plan: a blank pick keeps the day of their own it has (an end
   still blank stays blank: nothing changes). same: the patch changes nothing they have now (Save: No change). */
function ownDays(model, code, s, e, end, today) {
  var x = model.members.filter(function (m) { return m.code === code; })[0];
  if (!x) return null;
  var plan = model.plan;
  var pick = function (v, own, side) { v = v || (x.booked ? own : '') || ''; return v && v !== own && plan && v === side && !x.booked ? '' : v; };
  var a = pick(s, x.own1, plan && plan.s), b = pick(e, x.own2, plan && plan.e);
  var patch = end === 0 ? { available_from: a } : end === 1 ? { available_to: b } : { available_from: a, available_to: b };
  var f = hasOwn(patch, 'available_from') ? patch.available_from : x.own1, t = hasOwn(patch, 'available_to') ? patch.available_to : x.own2;
  var d1 = f || (plan ? plan.s : ''), d2 = t || (plan ? plan.e : '');
  var bad = function (v) { return !!v && (!isIso(v) || v < today); };
  var why = x.host ? 'host' : x.status === 'out' ? 'out' : !x.answered ? 'answer'
    : (bad(patch.available_from) || bad(patch.available_to)) ? 'past' : !!d1 !== !!d2 ? 'partial' : d1 && d1 > d2 ? 'order' : '';
  var off = !!plan && ((!!f && (f < plan.s || f > plan.e)) || (!!t && (t < plan.s || t > plan.e)));
  return { patch: patch, d1: d1, d2: d2, why: why, off: off, same: f === x.own1 && t === x.own2 };
}
/* −1 / +1 on one leg (P-person's 🛬 / 🛫): that end alone moves a day and becomes the person's own (ownDays' rules) */
function legShift(model, code, end, k, today) {
  var x = model.members.filter(function (m) { return m.code === code; })[0];
  if (!x || !x.d1) return null;
  var d = addD(end ? x.d2 : x.d1, k);
  return ownDays(model, code, end ? '' : d, end ? d : '', end ? 1 : 0, today);
}
/* PIA-151: one traveler's flight, the two rows of their flight section (P-person) and the times on their board bar, from the
   model alone, so the rows, the Book link, the price search, Calendar and the Map all read the same days: for each end (0 🛬
   arrive, 1 🛫 leave) the day (their own, else the plan's), own (a day they set), follow (the end moves with the plan: blank,
   and not booked; a booked traveler's day never follows, organizerEdit writes it as theirs before the plan moves), off (their
   own day falls outside the plan: ⚠, still allowed), the airport they land at or leave from, the hub pair it can be switched
   within (the Worker's IDEA_HUBS only, else none), and once booked the time recorded for it ('' none yet). null for someone
   with no flight here: not on the trip, a host, someone out. */
function flightEnds(model, code) {
  var x = model.members.filter(function (m) { return m.code === code; })[0] || null;
  if (!x || !x.traveler) return null;
  var plan = model.plan, aps = model.hub.length === 2 ? model.hub.slice() : [];
  return [0, 1].map(function (end) {
    var own = end ? x.own2 : x.own1, day = end ? x.d2 : x.d1;
    return { end: end, day: day, own: !!own, follow: !!plan && !!day && !own && !x.booked, booked: x.booked,
      off: !!(own && plan && (own < plan.s || own > plan.e)), ap: end ? x.H : x.A, aps: aps,
      time: x.booked ? (end ? x.depTime : x.arrTime) : '' };
  });
}
/* who is there on one day (P-day): in-members whose days cover it, and hosts (in, or in by default) on every day a screen
   draws for the trip, are there: their heads are presentOn, so P-day agrees with the grid's numeral and never passes the
   heads ring. Maybe-members whose days cover it are maybe; everyone else is away. → {day, n, there, maybe, away} (codes) */
function dayPeople(model, day) {
  var hd = hostDay(model, day), out = { day: day, n: presentOn(model, day), there: [], maybe: [], away: [] };
  model.members.forEach(function (m) {
    var cover = !!m.d1 && !m.bad && day >= m.d1 && day <= m.d2;
    var there = m.host ? hd && (m.status === 'in' || m.status === 'host-default') : m.status === 'in' && cover;
    var maybe = m.host ? hd && m.status === 'maybe' : m.status === 'maybe' && cover;
    (there ? out.there : maybe ? out.maybe : out.away).push(m.code);
  });
  return out;
}
/* PIA-144: Calendar and its day sheet share presence and overlap facts. Clashes are limited to the
   other trips this phone supplied to tripModel, with the same inclusive dates and name matching. */
function calendarDay(model, day) {
  var p = dayPeople(model, day), clashes = [], seen = {};
  if (isIso(day)) model.members.forEach(function (x) {
    (x.clash || []).forEach(function (c) {
      var key = x.code + '|' + c.id;
      if (day >= c.s && day <= c.e && !seen[key]) {
        seen[key] = true; clashes.push({ code: x.code, id: c.id, emoji: c.emoji, s: c.s, e: c.e });
      }
    });
  });
  return { day: day, n: p.n, there: p.there, maybe: p.maybe, away: p.away, clashes: clashes };
}
/* what the date pill (and my bar on the board) open on this phone: 'plan' the organizer's picker for the plan; 'mine' my
   own days (I have answered in or maybe and travel); 'answer' nothing yet (I have not answered: the answer row asks
   first, a day is never set for someone who has not answered); 'look' the plan to read (a host, someone out, a phone
   that is nobody here, a trip that is closed or over) */
function datesRole(model) {
  if (model.closed || model.past) return 'look';
  if (model.org && !model.legacy) return 'plan';
  var me = model.me;
  if (!me || me.host || me.status === 'out') return 'look';
  return me.answered ? 'mine' : 'answer';
}
/* PIA-153: the trip page's two ranges told apart: 👪 the group's plan, and my own days under it with my face. → null when there
   is nothing to set beside the plan (nobody here, a host, someone out or not answered, no day of my own, no plan, reversed days),
   else {s, e (the plan), d1, d2 (my days), differ (an end is not the plan's: ⚠ on my line, one tap to choose), off (an end falls
   outside the plan, the model's 'off'), booked, follow (Follow plan is offered: they differ, the trip is open and not over, and I
   have not booked: a booked traveler's days stay theirs, as ownDays keeps them), patch (that answer: ownDays' blank pick, sent by
   respondRequest), make ('' when the organizer can make my days the plan, through the plan move every P-dates Save makes (its
   booked confirm applies), else why not: 'org' not his phone, 'legacy' (⤒ Update trip first), 'closed', 'past' (the trip is
   over), 'locked' (🔓 first), 'same' (nothing differs), or planCheck's 'past' / 'pin' for my days), delta (that move: planDelta,
   📌 kept)} */
function mineVsPlan(model, today) {
  var me = model.me, plan = model.plan;
  if (!me || !me.traveler || !me.answered || !plan || !(me.own1 || me.own2) || !me.d1 || me.bad) return null;
  var differ = me.d1 !== plan.s || me.d2 !== plan.e, open = !model.closed && !model.past;
  var od = open && differ && !me.booked ? ownDays(model, me.code, '', '', null, today) : null;
  var follow = !!od && !od.why && !od.same;
  var make = !model.org ? 'org' : model.legacy ? 'legacy' : model.closed ? 'closed' : model.past ? 'past' : model.locked ? 'locked' : !differ ? 'same'
    : planCheck(me.d1, me.d2, { today: today, pin: model.pin });
  return { s: plan.s, e: plan.e, d1: me.d1, d2: me.d2, differ: differ, off: me.warn.indexOf('off') >= 0, booked: me.booked,
    follow: follow, patch: follow ? od.patch : null, make: make, delta: make ? null : planDelta(me.d1, me.d2, model.pin) };
}

/* ---- booking (PIA-139): one booked control, flight times for pickups, and a trip that reaches Done by itself ----
   The stage is derived in tripModel from the booked flags (🎫 Booking once any traveler has booked, 🏁 Done once every one
   has), so every phone reads the same stage from the same record. A 🎫 never closes the answers: only 💵 paid (the Worker's
   booked decision) or 🗑 does. */
/* one traveler's hand-off slot in P-person, by the trip view's own rule (primaryAction, bookToggle): their Google Flights
   search before the dates are set; [✈ Book ↗ | 🎫] side by side once they are; [✈⏱↗ Flighty | 🎫] after their 🎫. tk is
   whose 🎫 sits there: 'self' (my own: one tap, taking it back asks first), 'org' (the organizer marking someone else:
   bookToggle, a confirming tap for someone waiting or out), '' none. PIA-151: their flight section also offers
   [✈ Book ↗ | 🎫] before the 🔒 once their days are known and ahead (earlyBook; early: true), mine where the trip view's
   primary is [📣 Share | ✈↗] (an answer in or maybe, or the organizer's own). → {slot: 'gf' | 'book' | 'booked' | '', tk, early} */
function bookSlot(model, code, today) {
  var x = model.members.filter(function (m) { return m.code === code; })[0] || null;
  if (!x || !x.traveler) return { slot: '', tk: '', early: false };
  var mine = !!model.me && model.me.code === code, early = earlyBook(model, code, today), pa = mine ? primaryAction(model, today) : '';
  var tk = model.closed ? '' : mine ? (x.booked || pa === 'book' || (early && pa === 'share') ? 'self' : '') : bookToggle(model, code, early) ? 'org' : '';
  return { slot: x.booked ? 'booked' : tk ? 'book' : 'gf', tk: tk, early: early };
}
/* a typed time → 'HH:MM' (24h); blank → ''; anything else → null. '15:10', '1510', '0905', '0:30' are times, and so
   are '6:05 pm', '6pm', '11:05a' (am / pm typed). An hour 1–12 typed with no leading 0 and no am / pm ('310', '9:05',
   '1105', '12:30') could be either half of the day, so it is not a time until its half is picked (half 'am' | 'pm',
   the two readings timeHalves offers): a 12-hour reader's 3:10 PM never silently becomes 03:10 (PIA-139). */
var TYPED_TIME_RE = /^(\d{1,2})(?::?(\d{2}))?(?:([ap])\.?m?\.?)?$/;
function timeParts(s) {
  var t = String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();
  if (!t) return { blank: true };
  var m = TYPED_TIME_RE.exec(t);
  if (!m || (m[2] === undefined && !m[3]) || (m[2] !== undefined && +m[2] > 59)) return null;   // '15' alone is not a time; '6pm' is
  return { h: +m[1], mi: m[2] === undefined ? 0 : +m[2], half: m[3] || '', lead: m[1].length === 2 && m[1].charAt(0) === '0' };
}
function hhmm(h, mi) { return ('0' + h).slice(-2) + ':' + ('0' + mi).slice(-2); }
function typedTime(s, half) {
  var p = timeParts(s);
  if (!p) return null;
  if (p.blank) return '';
  var h = p.h, hf = p.half || (h >= 1 && h <= 12 && !p.lead ? (half === 'am' ? 'a' : half === 'pm' ? 'p' : '?') : '');
  if (hf === '?') return null;                                   // either half of the day: timeHalves offers both
  if (hf) { if (h < 1 || h > 12) return null; h = hf === 'p' ? (h % 12) + 12 : h % 12; }
  else if (h > 23) return null;
  return hhmm(h, p.mi);
}
/* the two readings of a time that could be either half of the day ('310' → {am: '03:10', pm: '15:10'}), else null */
function timeHalves(s) {
  var p = timeParts(s);
  if (!p || p.blank || p.half || p.lead || p.h < 1 || p.h > 12) return null;
  return { am: typedTime(s, 'am'), pm: typedTime(s, 'pm') };
}
/* the part of the day a booked time falls in, for its glyph: 'day' 06:00–17:59 (☀), 'night' otherwise (🌃), '' no time.
   The two readings of one typed hour always fall in different parts, so the pick between them is never two of a kind. */
function dayPart(t) { return typeof t === 'string' && HHMM_RE.test(t) ? (+t.slice(0, 2) >= 6 && +t.slice(0, 2) < 18 ? 'day' : 'night') : ''; }
/* who may record a traveler's booked times (🛬 landing, 🛫 leaving) on this phone: 'self' (their own, once booked), 'proxy'
   (the organizer for them), '' nobody (not booked, a host, someone out, a closed trip: the Worker takes no answer on a paid
   one, a guest looking at someone else, a v1 doc on the organizer's phone) */
function timesBy(model, code) {
  var x = model.members.filter(function (m) { return m.code === code; })[0] || null;
  if (!x || !x.traveler || !x.booked || model.closed) return '';
  if (model.me && model.me.code === code) return 'self';
  return model.org && !model.legacy ? 'proxy' : '';
}
/* the answer that records booked times, built on the record it is sent against: the answer as it stands (days, airports,
   origin, the 🎫 and the note's text all kept) with arr / dep as the 🛬 / 🛫 prefixes of the note ('HH:MM', '' clears one,
   undefined leaves it). Their own times clear 📞 (as their own answer does); the organizer's keep it as it reads. null for
   someone not booked, a time that is not HH:MM, no change, or times that would leave the note's text no room. */
function timesRequest(doc, code, arr, dep, by) {
  var r = validResp(doc && doc.responses && doc.responses[code]);
  if (!r || !r.booked || (r.status !== 'in' && r.status !== 'maybe')) return null;
  var n = parseRespNote(r.note), patch = {};
  if (arr !== undefined && arr !== n.arr) patch.arrTime = arr;
  if (dep !== undefined && dep !== n.dep) patch.depTime = dep;
  if (!hasOwn(patch, 'arrTime') && !hasOwn(patch, 'depTime')) return null;
  return respondRequest(doc, code, patch, { by: by === 'self' ? 'self' : 'keep' });
}
/* 💵 paid (P-stage): what the trip cost, recorded by the organizer once every traveler has booked, on his phone with the
   token (the amount is a price, and prices stay there). → {why, unbooked, unanswered}: why '' it can be recorded; 'org' not
   the organizer's phone; 'token' no token here; 'legacy' (P-migrate first); 'closed' (paid already, or dropped); 'nobody'
   (no one travels); 'unbooked' (a traveler has no 🎫 yet: unbooked lists them); 'nodates' (no plan or no destination to 🔒,
   which the Worker's booked needs first). unanswered: the people with no answer yet (hosts, in by default), whom 💵 closes
   out, because the Worker takes no answer on a paid trip. notimes: the booked travelers with no 🛬 time recorded yet,
   whose times 💵 freezes for the same reason (PIA-139: the confirm names both). again: a paid trip whose amount the
   organizer can enter again on this phone (a typo fixed: the Worker takes a second booked decision). */
function paidCheck(model) {
  var unbooked = model.travelers.filter(function (x) { return !x.booked; }).map(function (x) { return x.code; });
  var unanswered = model.members.filter(function (x) { return !x.resp; }).map(function (x) { return x.code; });
  var notimes = model.travelers.filter(function (x) { return x.booked && !x.arrTime; }).map(function (x) { return x.code; });
  var why = !model.org ? 'org' : !model.prices ? 'token' : model.legacy ? 'legacy' : model.closed ? 'closed' : !model.travelers.length ? 'nobody'
    : unbooked.length ? 'unbooked' : !model.locked && (!model.plan || !model.dest) ? 'nodates' : '';
  return { why: why, unbooked: unbooked, unanswered: unanswered, notimes: notimes, again: why === 'closed' && model.decision === 'booked' && model.paid != null };
}
/* the same rule on the record a 💵 is sent against: 'closed' (paid or dropped meanwhile), 'unbooked' (a 🎫 was taken away
   on another phone since this one drew 🏁), '' it can go. Who travels and who has booked does not depend on the day, so
   the model is read with any day. again (💵 entered again on a paid trip): '' while it is still paid, 'closed' once it
   was dropped or reopened meanwhile. */
function paidHeld(fresh, again) {
  if (!fresh || !fresh.idea) return 'unbooked';
  if (again === true) return fresh.decision && fresh.decision.stage === 'booked' && fresh.decision.chosen ? '' : 'closed';
  if (docClosed(fresh)) return 'closed';
  return tripModel(fresh, { today: '2000-01-01', now: 0 }).stage === 'done' ? '' : 'unbooked';
}
/* the 💵 amount as typed: whole dollars ('$1,490', '1490', '1490.40' → 1490); null when it is not an amount the Worker keeps
   (at least $1, under $1,000,000) */
function typedPaid(s) {
  var t = String(s == null ? '' : s).replace(/[\s$,]/g, '');
  if (!/^\d+(?:\.\d{0,2})?$/.test(t)) return null;
  var v = Math.round(+t);
  return v >= 1 && v < 1e6 ? v : null;
}

/* ---- PIA-140: prices. One honest total from real fares, never spent without a tap ----
   Pure rules; the app makes the calls (GET /search and /account on the Worker, with the organizer token) and keeps the
   counters. These decide what a tap may search, what it costs, what is locked, and what a reply means.
   • searchQuery: a fare key is exactly one Worker search, in v1's parameters (engine, airports, dates, type, USD, en): the
     airports of a nearby search comma-joined and sorted (≤5, the Worker's own order), adults only above 1 (SerpAPI's default
     is 1). So a one-adult search is byte for byte v1's, and both apps hit one Worker cache entry for it.
   • fareFromSerp keeps what was paid for (pialax_fares_v2): the cheapest price that search found (p), when SerpAPI was
     called (f: the Worker's X-Fetched-At, which a cache HIT keeps), Google's price level and typical range, the ≤3 cheapest
     offers (airports, times, stops), and, for ▼ / ▲, the price an earlier fetch of the identical search found (prev, pf). A
     search with no fares is none (not offered again within 24h).
   • spendKeys / spendCount: what one tap may search (missing legs first, then stale ones, never a past day): ≤4 a tap, ≤8 a
     session. tapKeys / spendable: the legs of one trip a tap may search at all (never a booked traveler's).
   • spendLock: 'month' (an upstream 429 or a plan with nothing left: exceeded; the organizer's month cap; 990 used; the plan's
     last 10 searches), 'day' (the Worker's per-day cap, until the next UTC day), 'session' (8 spent); monthWhy says which.
   • v1's own stores, in v1's formats, so both apps on one phone agree: pialax_serpapi_quota {period, used, budget, exceeded}
     (quotaRead, quotaBump, quotaExceeded, quotaFromAccount) and the one-adult fares v1 keeps in pialax_prices_v1 (v1FareKey,
     fareFromV1 to read them, v1Fare to write one as v1's own fetch would). */
var SPEND_PER_TAP = 4;           // = v1 TRIP_LEG_CALLS_PER_PRESS
var SPEND_PER_SESSION = 8;       // = v1 MAX_CALLS_PER_SESSION (v1's MAX_CALLS_PER_REFRESH is retired: a tap is the refresh)
var QUOTA_LOCK_AT = 990;         // = v1 QUOTA_LOCK_AT, the month's safety cutoff
var QUOTA_BUDGET = 1000;         // = v1's month budget when none is stored
var PLAN_LEFT_MIN = 10;          // the plan's searches left at or under this lock the month
var FARE_OFFERS = 3;             // the cheapest offers a fare keeps
var FARES_KEEP = 400;            // fares this phone keeps (the newest; none for a day already past)
var FARE_LEVELS = { low: 1, typical: 2, high: 3 };
var SERP_TIME_RE = /^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2})$/;
/* a fare key → {type, from, to, d, r, n}, or null when it is not a search the Worker takes */
function parseFareKey(key) {
  var p = typeof key === 'string' ? key.split('|') : [];
  if (p.length !== 6) return null;
  var type = +p[0], from = p[1].split(','), to = p[2].split(','), n = +p[5];
  var codes = function (a) { return a.length >= 1 && a.length <= 5 && a.every(isIata); };
  if ((type !== 1 && type !== 2) || !codes(from) || !codes(to) || !isIso(p[3]) || !(n >= 1 && n <= 9 && n === Math.round(n))) return null;
  if (type === 1 ? !(isIso(p[4]) && p[4] >= p[3]) : p[4] !== '') return null;
  return { type: type, from: from, to: to, d: p[3], r: p[4], n: n };
}
/* the Worker /search query for one fare key ('' for none): v1's parameters, the strict allowlist's shapes */
function searchQuery(key) {
  var k = parseFareKey(key); if (!k) return '';
  return 'engine=google_flights&departure_id=' + codeSet(k.from) + '&arrival_id=' + codeSet(k.to) + '&outbound_date=' + k.d + (k.type === 1 ? '&return_date=' + k.r : '') +
    '&type=' + k.type + '&currency=USD&hl=en' + (k.n > 1 ? '&adults=' + k.n : '');
}
function serpTime(v) { var m = typeof v === 'string' ? SERP_TIME_RE.exec(v.trim()) : null; return m && +m[2] < 24 ? m[1] + ' ' + ('0' + m[2]).slice(-2) + ':' + m[3] : ''; }
function serpList(v) { return Array.isArray(v) ? v : []; }
/* one SerpAPI offer as a fare keeps it: price, first departure and last arrival airport and time, stops */
function serpOffer(o) {
  var segs = serpList(o.flights), a = segs[0] || {}, z = segs[segs.length - 1] || {}, da = a.departure_airport || {}, za = z.arrival_airport || {};
  return { p: Math.round(o.price), d: normIata(da.id), a: normIata(za.id), dt: serpTime(da.time), ar: serpTime(za.time), s: segs.length ? segs.length - 1 : null };
}
function typRange(t) { var r = Array.isArray(t) ? t.map(Number) : []; return r.length === 2 && r[0] > 0 && r[1] >= r[0] ? [Math.round(r[0]), Math.round(r[1])] : null; }
/* ▼ / ▲ compare two real fetches of the identical search: a fetch newer than the one kept takes the kept price as prev; a
   cache HIT of the very fetch already kept keeps the prev it had */
function withPrev(e, old) {
  var at = old ? fareAt(old) : NaN;
  if (old && typeof old.p === 'number' && !old.none && at < e.f) { e.prev = old.p; e.pf = at; }
  else if (old && at === e.f && typeof old.prev === 'number') { e.prev = old.prev; e.pf = old.pf; }
  return e;
}
/* a SerpAPI google_flights reply → the pialax_fares_v2 entry (at = when SerpAPI was called, ms; old = the entry kept) */
function fareFromSerp(json, at, old) {
  var j = json && typeof json === 'object' ? json : {};
  var all = serpList(j.best_flights).concat(serpList(j.other_flights)).filter(function (o) { return o && typeof o.price === 'number' && isFinite(o.price) && o.price > 0; }).map(serpOffer);
  all.sort(function (x, y) { return x.p - y.p; });
  var off = all.slice(0, FARE_OFFERS), pi = j.price_insights && typeof j.price_insights === 'object' ? j.price_insights : {};
  return withPrev({ p: off.length ? off[0].p : null, f: at, none: !off.length, lvl: hasOwn(FARE_LEVELS, pi.price_level) ? pi.price_level : '', typ: typRange(pi.typical_price_range), off: off }, old);
}
/* what a priced leg can say from data already paid for: its age, Google's level (1–3), stops, the airport that won when it is
   not their own (an inbound or round trip: where the cheapest offer leaves from; the way home: where it lands), only ever one of
   the airports that leg searched (set: their origin set), and the change */
function fareFacts(f, kind, origin, now, set) {
  var p = legTotal(f);   // the one rule that turns a cached fare into a price (priceRows'), so a leg shows what the total adds
  if (p == null) return null;
  var o = Array.isArray(f.off) && f.off[0] ? f.off[0] : null, at = fareAt(f), win = o ? (kind === 'out' ? o.a : o.d) : '';
  var ok = isIata(win) && win !== origin && (!set || set.indexOf(win) >= 0);
  return { p: p, age: isFinite(at) ? Math.max(0, now - at) : null, lvl: hasOwn(FARE_LEVELS, f.lvl) ? FARE_LEVELS[f.lvl] : 0, typ: f.typ || null,
    stops: o && typeof o.s === 'number' ? o.s : null, win: ok ? win : '', delta: prevDelta(f) };
}
/* ▼ / ▲ of one fare: its price against the price an earlier real fetch of the identical search found, by the same rule (legTotal) */
function prevDelta(f) { var p = legTotal(f); return p != null && typeof f.prev === 'number' ? p - legTotal({ p: f.prev }) : null; }
/* the total's ▼ / ▲: only when every priced leg in it has an earlier real price for its identical search */
function priceDelta(pr) {
  if (!pr || !pr.per) return null;
  var d = 0, n = 0, ok = true;
  Object.keys(pr.per).forEach(function (c) { pr.per[c].legs.forEach(function (l) { if (l.p == null) return; n++; var x = l.f ? prevDelta(l.f) : null; if (x != null) d += x; else ok = false; }); });
  return ok && n ? d : null;
}
/* the legs one tap may search: missing or stale (a no-fares answer younger than 24h is not offered again), each once, never
   one for a day already past, never one the Worker would refuse; the never-searched first, then the day-old (in the order
   given), so a tap the caps cut short prices a $— leg before it refreshes a grey one */
function spendKeys(keys, fares, now, today) {
  var miss = [], old = [];
  (keys || []).forEach(function (k) {
    var key = typeof k === 'string' ? k : (k && k.key), q = parseFareKey(key), f = q && fares && hasOwn(fares, key) ? fares[key] : null, st = fareState(f, now);
    if (!q || q.d < today || miss.indexOf(key) >= 0 || old.indexOf(key) >= 0 || (st !== 'missing' && st !== 'stale')) return;
    (st === 'missing' ? miss : old).push(key);
  });
  return miss.concat(old);
}
/* the legs P-total's one tap prices: every traveler's missing or day-old legs on the trip's current dates (priceTrip's), but
   never a booked traveler's (their flight is bought: v1's Get Live Fares skips them too), each once */
function tapKeys(model) {
  var p = model && model.price, out = [];
  if (!p) return out;
  model.travelers.forEach(function (x) {
    if (x.booked || !p.per[x.code]) return;
    p.per[x.code].legs.forEach(function (l) { if ((l.st === 'missing' || l.st === 'stale') && out.indexOf(l.key) < 0) out.push(l.key); });
  });
  return out;
}
/* every search a tap on this trip may make (the app's spend path searches nothing else): P-total's legs (tapKeys), each
   unbooked traveler's ends ±1 day (endPrices' need) and, PIA-141, while the cheapest week can be asked for (cheapWhy), each
   candidate week's legs (cheapCandidates' need: never a booked traveler's) */
function spendable(model, fares, now, today) {
  var out = tapKeys(model);
  if (!model || !model.price) return out;
  var add = function (k) { if (out.indexOf(k) < 0) out.push(k); };
  model.travelers.forEach(function (x) {
    [0, 1].forEach(function (end) { var ep = endPrices(model, x.code, end, fares, now, today); (ep ? ep.need : []).forEach(add); });
  });
  if (!cheapWhy(model, today)) cheapCandidates(model, fares, now, today).forEach(function (c) { c.need.forEach(add); });
  return out;
}
/* how many searches one tap makes (its cost, shown before it is tapped): ≤4, and never past the session's 8 */
function spendCount(n, spent) { return Math.max(0, Math.min(n || 0, SPEND_PER_TAP, SPEND_PER_SESSION - (spent || 0))); }
/* why the month is locked, for its label ('' when it is not): 'refused' (SerpAPI refused a search, or /account says the plan
   has nothing left: exceeded), 'plan' (the plan's last 10), 'cap' (the organizer's own month cap: raising it lifts it),
   'safety' (990, v1's cutoff). o as spendLock's. */
function monthWhy(o) {
  o = o || {};
  var q = o.quota || {}, a = o.acct && typeof o.acct === 'object' ? o.acct : null, used = +q.used || 0, budget = +q.budget > 0 ? +q.budget : QUOTA_BUDGET;
  var num = function (k) { return a && typeof a[k] === 'number' ? a[k] : null; }, pl = num('plan_searches_left'), tl = num('total_searches_left');
  if (q.exceeded) return 'refused';
  if ((pl !== null && pl <= PLAN_LEFT_MIN) || (tl !== null && tl <= 0)) return 'plan';
  if (used >= budget) return 'cap';
  if (used >= QUOTA_LOCK_AT) return 'safety';
  return '';
}
/* what stops every spend: o = {quota, dayCap (pialax_daily_cap_v1), utcDay, acct (the last /account), acctDay, spent} */
function spendLock(o) {
  o = o || {};
  var q = o.quota || {}, a = o.acct && typeof o.acct === 'object' ? o.acct : null, used = +q.used || 0, budget = +q.budget > 0 ? +q.budget : QUOTA_BUDGET;
  var num = function (k) { return a && typeof a[k] === 'number' ? a[k] : null; }, pl = num('plan_searches_left'), tl = num('total_searches_left');
  if (q.exceeded || used >= budget || used >= QUOTA_LOCK_AT || (pl !== null && pl <= PLAN_LEFT_MIN) || (tl !== null && tl <= 0)) return 'month';
  var sp = a && a.spend && a.spend.serp;
  if ((o.dayCap && o.dayCap === o.utcDay) || (sp && o.acctDay === o.utcDay && typeof sp.used === 'number' && typeof sp.cap === 'number' && sp.used >= sp.cap)) return 'day';
  if ((o.spent || 0) >= SPEND_PER_SESSION) return 'session';
  return '';
}
/* pialax_serpapi_quota as v1's readQuota reads it (raw: the parsed value, period: this local 'YYYY-MM'): nothing stored is a
   fresh month (not written); v1's chained budget migration (100 → 250 → 1000) and a new month are written back */
function quotaRead(raw, period) {
  var fresh = function (b) { return { period: period, used: 0, budget: b, exceeded: false }; };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { q: fresh(QUOTA_BUDGET), write: false };
  var q = { period: raw.period, used: +raw.used >= 0 ? +raw.used : 0, budget: +raw.budget > 0 ? +raw.budget : QUOTA_BUDGET, exceeded: !!raw.exceeded }, write = false;
  if (q.budget === 100) { q.budget = 250; write = true; }
  if (q.budget === 250) { q.budget = 1000; write = true; }
  if (write && q.used < q.budget) q.exceeded = false;
  if (q.period !== period) { q = fresh(q.budget); write = true; }
  return { q: q, write: write };
}
function quotaBump(q, n) { return { period: q.period, used: (+q.used || 0) + (n || 0), budget: q.budget, exceeded: !!q.exceeded }; }   // = v1 bumpQuota
function quotaExceeded(q) { return { period: q.period, used: Math.max(+q.used || 0, +q.budget || 0), budget: q.budget, exceeded: true }; }   // = v1 markQuotaExceeded
/* /account → the quota, as v1's syncSerpApiAccount reads it: SerpAPI's own count of this month (or the plan less what is left),
   and exceeded from whether the plan has any search left, so a plan with nothing left locks the month and one with searches
   left again lifts the lock a refusal set (a SerpAPI 429 can be a passing hourly limit). hold: a refusal just now (the app
   holds it ACCT_MS) is not lifted yet. The organizer's month cap (budget) is never overwritten (unlike v1's sync). */
function quotaFromAccount(q, a, hold) {
  var out = { period: q.period, used: q.used, budget: q.budget, exceeded: !!q.exceeded };
  if (!a || typeof a !== 'object') return out;
  var left = typeof a.total_searches_left === 'number' ? a.total_searches_left : null, per = typeof a.searches_per_month === 'number' ? a.searches_per_month : null;
  if (typeof a.this_month_usage === 'number' && a.this_month_usage >= 0) out.used = a.this_month_usage;
  else if (left !== null && per !== null && per >= left) out.used = per - left;
  if (left !== null && left <= 0) out.exceeded = true;
  else if (left !== null && !hold) out.exceeded = false;
  return out;
}
/* the key v1 caches this search under ('from|to|dep|ret', v1 _cacheKey), or '' (v1 never searches for more than one adult) */
function v1FareKey(key) { var k = parseFareKey(key); return k && k.n === 1 ? [codeSet(k.from), codeSet(k.to), k.d, k.type === 1 ? k.r : ''].join('|') : ''; }
/* a v1 key → the fare key of the same one-adult search, or '' */
function fareKeyOfV1(k1) {
  var p = typeof k1 === 'string' ? k1.split('|') : [];
  if (p.length !== 4) return '';
  var key = fareKey(p[3] ? 1 : 2, p[0].split(','), p[1].split(','), p[2], p[3], 1);
  return parseFareKey(key) ? key : '';
}
/* a fare v1 fetched (pialax_prices_v1 {data, ts}) → the same fare as v2 keeps it (its cheapest offer; ts = when SerpAPI was
   called), or null: a sample, a booked stand-in or anything v1 did not fetch live is never a price */
function fareFromV1(e, old) {
  var d = e && e.data;
  if (!d || typeof d !== 'object' || d.live !== true || d.locked || typeof e.ts !== 'number' || !isFinite(e.ts)) return null;
  var off = serpList(d.offers).filter(function (o) { return o && typeof o.price === 'number' && isFinite(o.price) && o.price > 0; }).map(function (o) {
    return { p: Math.round(o.price), d: normIata(o.depAirport), a: normIata(o.arrAirport), dt: serpTime(o.depTime), ar: serpTime(o.arrTime), s: typeof o.stops === 'number' ? o.stops : null };
  });
  off.sort(function (x, y) { return x.p - y.p; });
  var head = typeof d.rt === 'number' && d.rt > 0 ? d.rt : typeof d.ow === 'number' && d.ow > 0 ? d.ow : null;
  if (!off.length && head === null) return null;
  var ins = d.insights && typeof d.insights === 'object' ? d.insights : {};
  return withPrev({ p: off.length ? off[0].p : Math.round(head), f: e.ts, none: false, lvl: hasOwn(FARE_LEVELS, ins.level) ? ins.level : '', typ: typRange(ins.typical), off: off.slice(0, FARE_OFFERS) }, old);
}
/* a SerpAPI reply as v1's own fetchFlights would cache it ({data, ts}: v1's tripFareParse, verbatim in what it keeps), so v1
   on this phone reads the fare this app paid for; null when the search found no fares (v1 caches nothing then) */
function v1Fare(json, at, hit, rt) {
  var j = json && typeof json === 'object' ? json : {};
  var top = serpList(j.best_flights), more = serpList(j.other_flights), best = top[0] || more[0] || null;
  if (!best || typeof best.price !== 'number') return null;
  var offer = function (o) {
    var segs = serpList(o.flights), a = segs[0] || {}, z = segs[segs.length - 1] || {}, da = a.departure_airport || {}, za = z.arrival_airport || {};
    return { price: o.price, airline: a.airline || null, flightNos: segs.map(function (s) { return s && s.flight_number; }).filter(Boolean).slice(0, 4),
      depAirport: da.id || '', arrAirport: za.id || '', depTime: da.time || '', arrTime: za.time || '', stops: segs.length > 1 ? segs.length - 1 : 0, durMin: Number(o.total_duration) || null };
  };
  var all = top.concat(more).filter(function (o) { return o && typeof o.price === 'number' && o.price > 0; }).map(offer);
  var offers = all.slice(0, 1).concat(all.slice(1).sort(function (x, y) { return x.price - y.price; })).slice(0, 6);
  var byDep = {}, byArr = {};
  all.forEach(function (o) {
    if (o.depAirport && !(byDep[o.depAirport] <= o.price)) byDep[o.depAirport] = o.price;
    if (o.arrAirport && !(byArr[o.arrAirport] <= o.price)) byArr[o.arrAirport] = o.price;
  });
  var segs = serpList(best.flights), first = segs[0] || {}, back = serpList(best.return_flights), bf = back[0] || {};
  var pi = j.price_insights && typeof j.price_insights === 'object' ? j.price_insights : null, insights = null;
  if (pi) {
    var tr = Array.isArray(pi.typical_price_range) ? pi.typical_price_range.map(Number) : [];
    var hist = serpList(pi.price_history).filter(function (p) { return Array.isArray(p) && Number(p[0]) > 0 && Number(p[1]) > 0; })
      .map(function (p) { var t = Number(p[0]); return [t < 1e12 ? t * 1000 : t, Number(p[1])]; }).slice(-30);
    insights = { level: typeof pi.price_level === 'string' ? pi.price_level : '', low: Number(pi.lowest_price) || null, typical: tr.length === 2 && tr[0] > 0 && tr[1] >= tr[0] ? tr : null, hist: hist };
  }
  // Google's own results link, as v1 checks it (it becomes an href there): https://www.google.com/travel/flights?… only
  var gf = j.search_metadata && typeof j.search_metadata.google_flights_url === 'string' ? j.search_metadata.google_flights_url : '';
  try { var gu = typeof URL === 'function' && gf ? new URL(gf) : null; gf = gu && gu.protocol === 'https:' && gu.hostname === 'www.google.com' && gu.pathname === '/travel/flights' ? gu.href : ''; } catch (e) { gf = ''; }
  if (gf.indexOf('https://www.google.com/travel/flights?') !== 0 || /[\s<>\x22\x27\x60\x5c]/.test(gf)) gf = '';
  var data = { ow: rt ? null : best.price, rt: rt ? best.price : null, live: true, airline: first.airline || null, flightNo: first.flight_number || null,
    airlineLogo: first.airline_logo || best.airline_logo || null, stops: segs.length > 1 ? segs.length - 1 : 0, returnAirline: bf.airline || null,
    returnFlightNo: bf.flight_number || null, returnAirlineLogo: bf.airline_logo || null, returnStops: back.length > 1 ? back.length - 1 : 0,
    offers: offers, insights: insights, gfUrl: gf, byDep: byDep, byArr: byArr, lastVerified: new Date(at).toISOString() };
  if (hit) { data.cached = true; data.edgeHit = true; }
  return { data: data, ts: at };
}
/* the fare cache with one entry put in (never an older fetch over a newer one), fares for days already past dropped, and the
   newest FARES_KEEP kept */
function faresPut(fares, key, e, today) {
  var out = {};
  Object.keys(fares || {}).forEach(function (k) { var q = parseFareKey(k), f = fares[k]; if (q && q.d >= today && f && typeof f === 'object') out[k] = f; });
  var old = hasOwn(out, key) ? out[key] : null;
  if (parseFareKey(key) && e && !(old && fareAt(old) > e.f)) out[key] = e;
  var ks = Object.keys(out);
  if (ks.length > FARES_KEEP) { ks.sort(function (a, b) { return fareAt(out[b]) - fareAt(out[a]); }); ks.slice(FARES_KEEP).forEach(function (k) { delete out[k]; }); }
  return out;
}
/* one traveler's end (0 the day they land, 1 the day they leave) priced ±1 day, by the one pricing rule (priceRows): the day
   before, their day and the day after, each the leg that end changes (a round trip is one search; open-jaw, that end's one-way),
   ★ on the cheapest once two are priced; need = the ±1 legs still to search (its 🔍 cost; none for a booked traveler). null
   when that end cannot move. */
function endPrices(model, code, end, fares, now, today) {
  var x = model && model.members.filter(function (m) { return m.code === code; })[0];
  if (!x || !x.traveler || x.why || !x.keys.length || !x.d1 || x.bad) return null;
  var rows = [], need = [];
  [-1, 0, 1].forEach(function (k) {
    var d1 = end ? x.d1 : addD(x.d1, k), d2 = end ? addD(x.d2, k) : x.d2;
    if (k && legWhy(model.dest, x.O, d1, d2, today, x.origin)) return;
    var ks = legKeys(x.from, x.A, x.H, d1, d2, x.headcount), lk = ks.length === 1 ? ks[0] : ks[end ? 1 : 0];
    var l = priceRows([{ code: x.code, color: x.color, keys: [lk], why: '' }], fares, now).per[x.code].legs[0];
    rows.push({ k: k, day: end ? d2 : d1, key: lk.key, kind: lk.kind, st: l.st, p: l.p, f: l.f });
    if (k && !x.booked && (l.st === 'missing' || l.st === 'stale')) need.push(lk.key);   // a booked traveler's days are shown, never searched
  });
  // ★ the cheapest, once two days are priced and one is cheaper than another (equal prices have no cheapest)
  var priced = rows.filter(function (r) { return r.p != null; }), ps = priced.map(function (r) { return r.p; });
  if (priced.length >= 2 && Math.min.apply(null, ps) < Math.max.apply(null, ps)) { var min = Math.min.apply(null, ps); priced.forEach(function (r) { if (r.p === min) r.star = true; }); }
  return rows.length > 1 ? { end: end, rows: rows, need: need } : null;
}
/* === pialax trip-model: end === */

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    IDEA_HUBS: IDEA_HUBS, NEARBY_GROUPS: NEARBY_GROUPS, DRIVE: DRIVE, IDEA_MAX_MEMBERS: IDEA_MAX_MEMBERS, MEMBER_CODE_RE: MEMBER_CODE_RE,
    TEXT_MAX: TEXT_MAX, FARE_STALE_MS: FARE_STALE_MS, FACES: FACES, FACE_RING: FACE_RING, SCENES: SCENES, PALETTE_SIZE: PALETTE_SIZE, FAMILY: FAMILY,
    AIRPORTS: AIRPORTS, GF_EXPLORE: GF_EXPLORE, GF_QUERY: GF_QUERY, FLIGHTY_URL: FLIGHTY_URL, GCAL_TEMPLATE: GCAL_TEMPLATE, WORKER_URL: WORKER_URL,
    HANDOFF_TARGET: HANDOFF_TARGET, HANDOFF_REL: HANDOFF_REL,
    handoff: handoff, handoffAttrs: handoffAttrs, isQuery: isQuery, gfSame: gfSame, gfTry: gfTry, gfQueryUrl: gfQueryUrl, flightLink: flightLink,
    guestLink: guestLink, icsFold: icsFold, calendarAdd: calendarAdd, handoffs: handoffs,
    dn: dn, ds: ds, isIso: isIso, addD: addD, diffD: diffD, md: md, dowOf: dowOf, ym: ym, holidays: holidays, holidayOn: holidayOn, nextHolidays: nextHolidays,
    fnv1a: fnv1a, clip: clip, splitLabel: splitLabel, normName: normName, isMeLabel: isMeLabel, shortName: shortName, oneWord: oneWord, slugOf: slugOf,
    hashedFace: hashedFace, colorOf: colorOf, memberLabel: memberLabel, titleOf: titleOf,
    normIata: normIata, isIata: isIata, airportInfo: airportInfo, hubPair: hubPair, altOf: altOf, metroOf: metroOf, localSet: localSet, originSet: originSet,
    parseNotes: parseNotes, buildNotes: buildNotes, parseRespNote: parseRespNote, buildRespNote: buildRespNote,
    gfTfs: gfTfs, gfSearchUrl: gfSearchUrl, gfDecode: gfDecode, legPlan: legPlan, fareKey: fareKey, legKeys: legKeys, fareState: fareState, legTotal: legTotal,
    legWhy: legWhy, docDest: docDest, docPlan: docPlan, docLegacy: docLegacy, memberOf: memberOf, personDatesIn: personDatesIn,
    tripModel: tripModel, priceRows: priceRows, priceTrip: priceTrip, hostDay: hostDay, presentOn: presentOn, dotsOn: dotsOn, bestWindow: bestWindow, boardRange: boardRange,
    candStarts: candStarts, windowRow: windowRow, cheapCandidates: cheapCandidates, pickups: pickups,
    candidateWhy: candidateWhy, destinationCandidate: destinationCandidate, pickupPair: pickupPair,
    familyForDate: familyForDate, familyPreset: familyPreset, migrateLabel: migrateLabel, v1SharedIds: v1SharedIds, v1PinFor: v1PinFor,
    familyOf: familyOf, memberFaces: memberFaces, nameFaces: nameFaces, migrateLabels: migrateLabels, autoFace: autoFace,
    typedNote: typedNote, noteRoom: noteRoom, faceOf: faceOf, decisionBody: decisionBody,
    memberCode: memberCode, createRequest: createRequest, respondRequest: respondRequest, bookedRequests: bookedRequests,
    updateRequest: updateRequest, airportSyncRequests: airportSyncRequests, organizerEdit: organizerEdit,
    migrateOptions: migrateOptions, migrateRequests: migrateRequests,
    historyItems: historyItems, historyDraft: historyDraft, historyFinishRequests: historyFinishRequests,
    LIST_LINK_MAX: LIST_LINK_MAX, answerTimes: answerTimes, newestAnswerAt: newestAnswerAt, newAnswers: newAnswers, awaitsMe: awaitsMe, bookByCue: bookByCue, togoCue: togoCue,
    tripGroups: tripGroups, familyBoard: familyBoard, listLink: listLink, US_MAP: US_MAP, usPoint: usPoint, mapXY: mapXY,
    NAME_WORDS: NAME_WORDS, TITLE_WORDS: TITLE_WORDS, CAPTION_WORDS: CAPTION_WORDS, NAME_CHARS: NAME_CHARS, TITLE_CHARS: TITLE_CHARS,
    wordsIn: wordsIn, capTyped: capTyped, firstWords: firstWords, cleanName: cleanName, joinLink: joinLink, parseJoin: parseJoin,
    legacyDraft: legacyDraft, groupPresets: groupPresets, freeFace: freeFace, FAMILY_KEY: FAMILY_KEY,
    fitTyped: fitTyped, keepName: keepName, CAPTION_CHARS: CAPTION_CHARS, owedSync: owedSync,
    whoAmI: whoAmI, primaryAction: primaryAction, bookToggle: bookToggle,
    SHIFT_STEPS: SHIFT_STEPS, moveRange: moveRange, planShift: planShift, holidayPick: holidayPick, planCheck: planCheck, planDelta: planDelta,
    windowDelta: windowDelta, clearDelta: clearDelta, ownDays: ownDays, legShift: legShift, flightEnds: flightEnds, dayPeople: dayPeople, calendarDay: calendarDay, datesRole: datesRole, datesHeld: datesHeld, mineVsPlan: mineVsPlan,
    bookSlot: bookSlot, earlyBook: earlyBook, typedTime: typedTime, timesBy: timesBy, timesRequest: timesRequest, paidCheck: paidCheck, paidHeld: paidHeld, typedPaid: typedPaid,
    timeHalves: timeHalves, dayPart: dayPart, cachedTime: cachedTime,
    SPEND_PER_TAP: SPEND_PER_TAP, SPEND_PER_SESSION: SPEND_PER_SESSION, QUOTA_LOCK_AT: QUOTA_LOCK_AT, QUOTA_BUDGET: QUOTA_BUDGET, PLAN_LEFT_MIN: PLAN_LEFT_MIN,
    FARE_OFFERS: FARE_OFFERS, FARES_KEEP: FARES_KEEP, codeSet: codeSet, parseFareKey: parseFareKey, searchQuery: searchQuery, serpTime: serpTime,
    fareFromSerp: fareFromSerp, fareFacts: fareFacts, prevDelta: prevDelta, priceDelta: priceDelta, spendKeys: spendKeys, spendCount: spendCount, spendLock: spendLock,
    tapKeys: tapKeys, spendable: spendable, monthWhy: monthWhy,
    quotaRead: quotaRead, quotaBump: quotaBump, quotaExceeded: quotaExceeded, quotaFromAccount: quotaFromAccount,
    v1FareKey: v1FareKey, fareKeyOfV1: fareKeyOfV1, fareFromV1: fareFromV1, v1Fare: v1Fare, faresPut: faresPut, endPrices: endPrices,
    WIDEN_DAYS: WIDEN_DAYS, followsPlan: followsPlan, cheapWhy: cheapWhy, widenWin: widenWin, widenDelta: widenDelta, moveDelta: moveDelta
  };
}

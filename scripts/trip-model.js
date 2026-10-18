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
var FACES = ['🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐸', '🐙', '🦉', '🐝', '🌻', '🌽', '🍉', '🍕', '🎸', '🎨', '🚲', '🗽', '🐳', '🦄', '🍩', '🐢', '🦋', '🌴'];
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
  { key: 'ashwin', face: '🌴', name: 'Ashwin', airport: 'LAX', headcount: 1 },
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
function oneWord(n) { var m = /^(\S+)\s*&\s*(\S+)/.exec(n || ''); return m ? m[1] + '&' + m[2] : ((n || '').split(/\s+/)[0] || ''); }
function slugOf(name) { var s = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 29); return s || 'm'; }
function hashedFace(norm) { return FACES[fnv1a(norm) % FACES.length]; }
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
function fareKey(type, from, to, d, r, n) { return [type, from.join(','), to.join(','), d, r || '', n].join('|'); }
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
  var nights = plan ? diffD(plan.s, plan.e) : (N.nights || null);
  var explicitWin = isIso(dts.searchStart) && isIso(dts.searchEnd) && dts.searchStart <= dts.searchEnd;
  var win = explicitWin ? { s: dts.searchStart, e: dts.searchEnd } : (plan ? { s: addD(plan.s, -FLEX_DAYS), e: addD(plan.e, FLEX_DAYS) } : null);
  var span = plan && win ? { s: minD(plan.s, win.s), e: maxD(plan.e, win.e) } : (win || plan);
  var others = (ctx.otherTrips || []).filter(function (od) { return od && od.id !== doc.id; });
  var rows = (I.members || []).filter(function (m) { return m && typeof m.code === 'string'; });
  // a label with no face (v1) reads with the hashed face of its name, moved on to the next free face if the trip
  // already shows it, so two tiles never share a face (the face is the primary identity)
  var shown = rows.map(function (m) { return splitLabel(m.label).face; }).filter(Boolean);
  var members = rows.map(function (m) {
    var r = validResp(R[m.code]);
    // a legacy 'Me' shows its face only and has no name identity until P-migrate, so nobody can pick it as a name
    var lab = splitLabel(m.label), meWord = isMeLabel(lab.name);
    var norm = meWord ? '' : normName(lab.name || '?'), name = meWord ? '' : (lab.name || '?');
    var seed = norm || '#' + m.code, face = lab.face;
    if (!face) { face = autoFace(seed, shown); shown.push(face); }
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
      link: link, why: why, keys: keys, at: (r && r.updated_at) || ''
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
  var shelf = !!((plan && plan.e < today) || decision === 'dropped' || ctx.hidden);
  var bookBy = plan ? addD(plan.s, -BOOK_BY_DAYS) : null;
  var cityInfo = airportInfo(dest);
  var model = {
    id: doc.id || '', title: typeof I.title === 'string' ? I.title : '', emoji: t.face || '💡', name: t.name,
    dest: dest, city: cityInfo.city || (I.destination && I.destination.city) || '', lat: cityInfo.lat, lon: cityInfo.lon,
    legacy: legacy, legacyLock: legacy && decision === 'chosen',
    hub: hub, alt: alt, local: loc, drive: alt ? DRIVE[hub.join('|')] || '' : '',
    plan: plan, nights: nights, win: win, explicitWin: explicitWin, span: span, undated: !plan,
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
/* cheapest-week candidates: each window is priced by priceRows, the same rule as priceTrip, from real cached fares
   only. A bar is filled only when that total is complete; `missing` lists the legs still to search (missing or
   stale), and `none` marks a window where a search found no fares. */
function cheapCandidates(model, fares, now, today) {
  var out = [];
  candStarts(model.nights, model.win, model.pin, today).forEach(function (s) {
    var e = addD(s, model.nights), warnFaces = [];
    model.members.forEach(function (m) {
      if (m.answered && ((m.own1 && (m.own1 < s || m.own1 > e)) || (m.own2 && (m.own2 < s || m.own2 > e)))) warnFaces.push(m.face);
    });
    var pr = priceRows(model.travelers.map(function (m) { return windowRow(model, m, s, e, today); }), fares, now);
    var per = model.travelers.map(function (m) {
      var p = pr.per[m.code];
      return { code: m.code, face: m.face, color: m.color, sum: p.sum, complete: p.complete, stale: p.stale, own: !!(m.own1 || m.own2) };
    });
    out.push({ s: s, e: e, missing: pr.search, filled: pr.complete, none: pr.none, total: pr.complete ? pr.total : null, price: pr,
      per: per, warn: warnFaces, current: !!(model.plan && model.plan.s === s && model.plan.e === e) });
  });
  var filledBars = out.filter(function (c) { return c.filled; });
  if (filledBars.length >= 2) { var min = Math.min.apply(null, filledBars.map(function (c) { return c.total; })); filledBars.forEach(function (c) { if (c.total === min) c.star = true; }); }
  return out;
}
/* pickup chips under the labelled pins (destination and hub alternate). Times recorded at 🎫 show for everyone;
   with showPredicted (the organizer's token phone) a not-yet-booked arrival shows the cheapest cached offer's time,
   from any cached search (fresh or stale; `now` is unused, kept so every fare reader takes the same arguments). */
function pickups(model, fares, now, showPredicted) {
  var lanes = {};
  if (!model.dest) return lanes;
  [model.dest].concat(model.alt ? [model.alt] : []).forEach(function (a) { lanes[a] = []; });
  model.travelers.forEach(function (m) {
    if (!m.answered || !m.d1 || m.bad) return;
    var inKey = m.keys[0] && m.keys[0].key, f = inKey && fares && hasOwn(fares, inKey) ? fares[inKey] : null;
    var offer = f && f.off && f.off[0] ? f.off[0] : null;
    var predicted = (model.prices || showPredicted) && f ? (f.ar || (offer && offer.ar) || '') : '';  // any cached offer, fresh or stale
    var arrT = m.arrTime || predicted;
    if (lanes[m.A]) lanes[m.A].push({ kind: 'arr', date: m.d1, time: arrT, pred: !m.arrTime && !!arrT, faces: [m.face], codes: [m.code], maybe: m.status === 'maybe', booked: m.booked });
    if (lanes[m.H]) lanes[m.H].push({ kind: 'dep', date: m.d2, time: m.depTime, pred: false, faces: [m.face], codes: [m.code], maybe: m.status === 'maybe', booked: m.booked });
  });
  Object.keys(lanes).forEach(function (a) {
    var L = lanes[a], merged = [];
    L.sort(function (x, y) { return (x.date + (x.time || '99') + x.kind).localeCompare(y.date + (y.time || '99') + y.kind); });
    L.forEach(function (c) {
      var p = merged[merged.length - 1];
      if (p && !p.time && !c.time && p.kind === c.kind && p.date === c.date && p.maybe === c.maybe) { p.faces = p.faces.concat(c.faces); p.codes = p.codes.concat(c.codes); }
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
   .ics text come from the same event. null when there are no days (an undated idea), the days are over, or the
   trip is dropped (🗑). ctx = {today, now, worker}. */
function calendarAdd(model, ctx) {
  ctx = ctx || {};
  if (!isIso(ctx.today)) throw new Error('calendarAdd: ctx.today must be a YYYY-MM-DD day');
  if (typeof ctx.now !== 'number' || !isFinite(ctx.now)) throw new Error('calendarAdd: ctx.now must be epoch milliseconds');
  if (model.decision === 'dropped') return null;
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
/* P-migrate's suggested face and name for a v1 member (by home airport; others keep their name with a hashed face) */
function migrateLabel(member) {
  var lab = splitLabel(member && member.label), key = FAMILY_BY_AIRPORT[normIata(member && member.airport)];
  var fam = key ? FAMILY.filter(function (f) { return f.key === key; })[0] : null;
  if (lab.face && !isMeLabel(lab.name)) return member.label;
  if (fam && (isMeLabel(lab.name) || normName(lab.name) === normName(fam.name) || !lab.name)) return memberLabel(fam.face, fam.name);
  var name = isMeLabel(lab.name) || !lab.name ? (member && member.code) || '?' : lab.name;
  return memberLabel(lab.face || hashedFace(normName(name)), name);
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
/* faces auto-assigned from FACES, unique in the trip */
function autoFace(norm, usedFaces) {
  var start = fnv1a(norm) % FACES.length;
  for (var i = 0; i < FACES.length; i++) { var f = FACES[(start + i) % FACES.length]; if (usedFaces.indexOf(f) < 0) return f; }
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
   row's label is resent verbatim when it already starts with a face. */
function buildMembers(list, prev, rand) {
  if (!Array.isArray(list) || !list.length || list.length > IDEA_MAX_MEMBERS) return null;
  var byCode = {}; (prev || []).forEach(function (m) { if (m) byCode[m.code] = m; });
  var taken = list.map(function (e) { return e && e.code; }).filter(function (c) { return typeof c === 'string' && MEMBER_CODE_RE.test(c); }).concat((prev || []).map(function (m) { return m && m.code; }));
  var faces = [], out = [];
  list.forEach(function (e) { var f = e && (faceOf(e.face) || splitLabel(e.label || (byCode[e.code] || {}).label).face); if (f) faces.push(f); });
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
    var label;
    if (raw && lab.face && (lab.name || base)) label = raw;   // already '<face> <name>' (an existing face-only row stays)
    else {
      if (!lab.name) return null;
      var face = lab.face;
      if (!face) { face = autoFace(normName(lab.name), faces); faces.push(face); }
      label = memberLabel(face, lab.name);
    }
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
  var body = { member: code, status: status, origin: origin, available_from: from, available_to: to,
    note: buildRespNote(called, arr, dep, has('note') ? typedNote(patch.note) : n.text) };
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
   Unbooking someone with no in/maybe answer builds nothing (the Worker would answer 400 answer_first). */
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
   without this very update reopening the trip, builds nothing: reopen first, then edit. */
function organizerEdit(fresh, editKey, delta, opts) {
  delta = delta || {};
  var ideaEdit = IDEA_DELTA_KEYS.some(function (k) { return hasOwn(delta, k); });
  var dst = delta.decision && delta.decision.stage, closes = dst === 'booked' || dst === 'dropped';
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
  return { current: plan, span: a ? { s: a, e: b } : null, pin: pin,
    labels: ((doc && doc.idea && doc.idea.members) || []).map(function (m) { return { code: m.code, label: migrateLabel(m) }; }) };
}
/* P-migrate: one update that copies the recommendation's airport, city and the picked plan into the idea, adds 📌,
   puts faces on the labels (codes never change), nulls recommendation and re-chooses when the doc was chosen; then
   one answer per member whose own window now equals the plan, sent blank (follows the plan). */
function migrateRequests(fresh, editKey, choice) {
  choice = choice || {};
  if (!fresh || !fresh.idea || !choice.plan || !isIso(choice.plan.s) || !isIso(choice.plan.e) || choice.plan.e < choice.plan.s) return null;
  var rec = fresh.idea.recommendation || {}, ap = normIata(rec.airport) || docDest(fresh);
  var city = airportInfo(ap).city || clip(rec.city || (fresh.idea.destination && fresh.idea.destination.city), TEXT_MAX.city);
  var labels = {}; (choice.labels || []).forEach(function (x) { if (x && x.code) labels[x.code] = x.label; });
  var delta = {
    destination: { airport: ap, city: city },
    dates: { departure: choice.plan.s, return: choice.plan.e },
    pin: hasOwn(choice, 'pin') ? choice.pin : parseNotes(fresh.idea.notes).pin,
    members: (fresh.idea.members || []).map(function (m) { return { code: m.code, label: labels[m.code] || migrateLabel(m) }; })
  };
  if (fresh.decision && fresh.decision.stage === 'chosen') delta.decision = { stage: 'chosen' };   // re-chosen on the migrated idea, with no price
  var up = updateRequest(fresh, editKey, delta, { migrate: true });
  if (!up) return null;
  var after = { id: fresh.id, idea: up.body.idea, responses: fresh.responses || {}, decision: fresh.decision }, out = [up];
  Object.keys(fresh.responses || {}).forEach(function (c) {
    var r = validResp(fresh.responses[c]);
    if (!r || r.available_from !== choice.plan.s || r.available_to !== choice.plan.e) return;
    var q = respondRequest(after, c, { available_from: '', available_to: '' }, { by: 'keep' });
    if (q) out.push(q);
  });
  return out;
}
/* === pialax trip-model: end === */

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    IDEA_HUBS: IDEA_HUBS, NEARBY_GROUPS: NEARBY_GROUPS, DRIVE: DRIVE, IDEA_MAX_MEMBERS: IDEA_MAX_MEMBERS, MEMBER_CODE_RE: MEMBER_CODE_RE,
    TEXT_MAX: TEXT_MAX, FARE_STALE_MS: FARE_STALE_MS, FACES: FACES, SCENES: SCENES, PALETTE_SIZE: PALETTE_SIZE, FAMILY: FAMILY,
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
    familyForDate: familyForDate, familyPreset: familyPreset, migrateLabel: migrateLabel, v1SharedIds: v1SharedIds, v1PinFor: v1PinFor,
    typedNote: typedNote, noteRoom: noteRoom, faceOf: faceOf, decisionBody: decisionBody,
    memberCode: memberCode, createRequest: createRequest, respondRequest: respondRequest, bookedRequests: bookedRequests,
    updateRequest: updateRequest, airportSyncRequests: airportSyncRequests, organizerEdit: organizerEdit,
    migrateOptions: migrateOptions, migrateRequests: migrateRequests
  };
}

// ============================================
// PIALAX Flight Dashboard — Baseline v1.0
// ============================================
// STRUCTURE GUIDE (for AI agent modification):
// 1. CONFIG — airports, routes, mock prices
// 2. DATA LOADER — fetches US map GeoJSON
// 3. COMPONENTS — MapView, FlightCard, AirportSelector
// 4. MAIN DASHBOARD — layout and state management
// ============================================
// ENHANCEMENT HOOKS:
// - Replace MOCK_PRICES with API call in fetchFlightPrices()
// - Add real-time price updates via useEffect
// - Extend AIRPORTS config to add new airports
// - Add date picker for custom date ranges
// - Swap mock GeoJSON URL for custom map data
// ============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';

// === SECTION: CONFIG ===

const AIRPORTS = {
  PIA: { code: 'PIA', name: 'Peoria, IL', fullName: 'Peoria International Airport', lat: 40.6642, lon: -89.6933, isHome: true },
  ORD: { code: 'ORD', name: 'Chicago, IL', fullName: "O'Hare International Airport", lat: 41.9742, lon: -87.9073, isHome: true },
  LAX: { code: 'LAX', name: 'Los Angeles, CA', fullName: 'Los Angeles International Airport', lat: 33.9425, lon: -118.4081, isHome: false },
  JAX: { code: 'JAX', name: 'Jacksonville, FL', fullName: 'Jacksonville International Airport', lat: 30.4941, lon: -81.6879, isHome: false },
};

const HOME_AIRPORTS = Object.values(AIRPORTS).filter(a => a.isHome);
const DEST_AIRPORTS = Object.values(AIRPORTS).filter(a => !a.isHome);

// Mock prices — labeled clearly for future API swap
// ENHANCEMENT: Replace this object with an async fetchFlightPrices(from, to, dateRange) call
const MOCK_PRICES = {
  'PIA-LAX': { oneWay: 218, roundTrip: 389, cheapestDate: 'May 7, 2026', departureWindow: 'Apr 1 – Jun 30, 2026', airline: 'American Airlines' },
  'PIA-JAX': { oneWay: 156, roundTrip: 278, cheapestDate: 'Apr 22, 2026', departureWindow: 'Apr 1 – Jun 30, 2026', airline: 'United Airlines' },
  'ORD-LAX': { oneWay: 128, roundTrip: 234, cheapestDate: 'May 14, 2026', departureWindow: 'Apr 1 – Jun 30, 2026', airline: 'Southwest Airlines' },
  'ORD-JAX': { oneWay: 109, roundTrip: 198, cheapestDate: 'Apr 18, 2026', departureWindow: 'Apr 1 – Jun 30, 2026', airline: 'Frontier Airlines' },
};

const ROUTE_COLORS = { LAX: '#3b82f6', JAX: '#f59e0b' };

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

// === SECTION: DATA LOADER ===

function useUSMap() {
  const [geoData, setGeoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(GEO_URL);
        if (!resp.ok) throw new Error('Failed to load map data');
        const topo = await resp.json();
        // Convert TopoJSON to GeoJSON using d3
        const states = topojsonFeature(topo, topo.objects.states);
        if (!cancelled) { setGeoData(states); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setError(e.message); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { geoData, loading, error };
}

// Minimal TopoJSON → GeoJSON converter (avoids extra dependency)
function topojsonFeature(topology, object) {
  const arcs = topology.arcs;
  const transform = topology.transform;

  function decodeArc(arcIndex) {
    const reversed = arcIndex < 0;
    const index = reversed ? ~arcIndex : arcIndex;
    const arc = arcs[index];
    const coords = [];
    let x = 0, y = 0;
    for (const [dx, dy] of arc) {
      x += dx; y += dy;
      coords.push([
        transform ? x * transform.scale[0] + transform.translate[0] : x,
        transform ? y * transform.scale[1] + transform.translate[1] : y
      ]);
    }
    if (reversed) coords.reverse();
    return coords;
  }

  function decodeRing(arcIndices) {
    let coords = [];
    for (const ai of arcIndices) {
      const decoded = decodeArc(ai);
      // skip first point of subsequent arcs to avoid duplication
      coords = coords.concat(coords.length ? decoded.slice(1) : decoded);
    }
    return coords;
  }

  function decodeGeometry(geom) {
    if (geom.type === 'Polygon') {
      return { type: 'Polygon', coordinates: geom.arcs.map(decodeRing) };
    }
    if (geom.type === 'MultiPolygon') {
      return { type: 'MultiPolygon', coordinates: geom.arcs.map(poly => poly.map(decodeRing)) };
    }
    return geom;
  }

  if (object.type === 'GeometryCollection') {
    return {
      type: 'FeatureCollection',
      features: object.geometries.map(g => ({
        type: 'Feature',
        id: g.id,
        properties: g.properties || {},
        geometry: decodeGeometry(g)
      }))
    };
  }
  return { type: 'Feature', id: object.id, properties: object.properties || {}, geometry: decodeGeometry(object) };
}

// === SECTION: COMPONENTS ===

// --- Airport Selector ---
function AirportSelector({ value, onChange }) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Home Airport</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-slate-700 text-white border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 font-medium text-sm"
      >
        {HOME_AIRPORTS.map(a => (
          <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
        ))}
      </select>
    </div>
  );
}

// --- Flight Price Card ---
function FlightCard({ from, to, data }) {
  const color = ROUTE_COLORS[to] || '#3b82f6';
  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden transition-transform hover:scale-102">
      <div className="px-4 py-3 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${color}22, ${color}08)` }}>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-800">{from}</span>
          <svg width="20" height="12" viewBox="0 0 20 12"><path d="M0 6h16M12 1l5 5-5 5" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span className="text-lg font-bold text-gray-800">{to}</span>
        </div>
        <span className="text-xs text-gray-500 font-medium">{data.airline}</span>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 gap-3">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">One-Way</p>
          <p className="text-xl font-bold" style={{ color }}>${data.oneWay}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">Round-Trip</p>
          <p className="text-xl font-bold text-gray-800">${data.roundTrip}</p>
        </div>
      </div>
      <div className="px-4 pb-3 flex items-center justify-between">
        <span className="text-xs text-gray-400">Cheapest: {data.cheapestDate}</span>
        <span className="text-xs text-gray-400">{data.departureWindow}</span>
      </div>
      <div className="px-4 pb-3">
        <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 inline-block font-medium">Sample Data — Google Flights</p>
      </div>
    </div>
  );
}

// --- D3 Map View ---
function MapView({ homeAirport, showPrices }) {
  const svgRef = useRef(null);
  const { geoData, loading, error } = useUSMap();

  const drawMap = useCallback(() => {
    if (!svgRef.current || !geoData) return;

    const container = svgRef.current.parentElement;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);

    // Albers USA projection
    const projection = d3.geoAlbersUsa().fitSize([width - 40, height - 40], geoData).translate([width / 2, height / 2]);
    const pathGen = d3.geoPath().projection(projection);

    // Background
    svg.append('rect').attr('width', width).attr('height', height).attr('fill', '#f8fafc').attr('rx', 12);

    // State paths
    const statesG = svg.append('g').attr('class', 'states');
    statesG.selectAll('path')
      .data(geoData.features)
      .enter().append('path')
      .attr('d', pathGen)
      .attr('fill', '#fff')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 0.8)
      .attr('stroke-linejoin', 'round');

    // Country outline (all features merged)
    statesG.append('path')
      .datum({ type: 'FeatureCollection', features: geoData.features })
      .attr('d', d3.geoPath().projection(projection))
      .attr('fill', 'none')
      .attr('stroke', '#475569')
      .attr('stroke-width', 1.5);

    // --- Routes ---
    const home = AIRPORTS[homeAirport];
    const homeXY = projection([home.lon, home.lat]);
    if (!homeXY) return;

    // Animated route style
    const routeStyle = `
      @keyframes dash { to { stroke-dashoffset: -24; } }
      .route-anim { animation: dash 1.5s linear infinite; }
      @keyframes pulse { 0%,100% { r: 6; opacity:0.7 } 50% { r: 10; opacity: 0.3 } }
      .home-pulse { animation: pulse 2s ease-in-out infinite; }
    `;
    svg.append('defs').append('style').text(routeStyle);

    DEST_AIRPORTS.forEach(dest => {
      const destXY = projection([dest.lon, dest.lat]);
      if (!destXY) return;
      const color = ROUTE_COLORS[dest.code] || '#3b82f6';

      // Curved route line
      const midX = (homeXY[0] + destXY[0]) / 2;
      const midY = (homeXY[1] + destXY[1]) / 2 - Math.abs(homeXY[0] - destXY[0]) * 0.2;
      const path = `M${homeXY[0]},${homeXY[1]} Q${midX},${midY} ${destXY[0]},${destXY[1]}`;

      // Shadow
      svg.append('path').attr('d', path).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 4).attr('opacity', 0.1);
      // Dashed animated line
      svg.append('path').attr('d', path).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '8,6').attr('class', 'route-anim').attr('opacity', 0.85);

      // Price label on route
      if (showPrices) {
        const key = `${homeAirport}-${dest.code}`;
        const price = MOCK_PRICES[key];
        if (price) {
          const labelX = midX;
          const labelY = midY - 8;
          const g = svg.append('g');
          g.append('rect').attr('x', labelX - 28).attr('y', labelY - 12).attr('width', 56).attr('height', 20).attr('rx', 10).attr('fill', color).attr('opacity', 0.9);
          g.append('text').attr('x', labelX).attr('y', labelY + 2).attr('text-anchor', 'middle').attr('fill', '#fff').attr('font-size', 11).attr('font-weight', 700).text(`$${price.oneWay}`);
        }
      }
    });

    // --- Airport Markers ---
    Object.values(AIRPORTS).forEach(ap => {
      const xy = projection([ap.lon, ap.lat]);
      if (!xy) return;
      const isHome = ap.code === homeAirport;
      const isDest = !ap.isHome;
      const color = isHome ? '#10b981' : isDest ? (ROUTE_COLORS[ap.code] || '#3b82f6') : '#94a3b8';
      const r = isHome ? 7 : isDest ? 6 : 4;

      // Outer glow for home
      if (isHome) {
        svg.append('circle').attr('cx', xy[0]).attr('cy', xy[1]).attr('fill', '#10b981').attr('class', 'home-pulse');
      }

      // Dot
      svg.append('circle').attr('cx', xy[0]).attr('cy', xy[1]).attr('r', r).attr('fill', color).attr('stroke', '#fff').attr('stroke-width', 2);

      // Label
      const labelY = isHome ? -16 : -12;
      const g = svg.append('g');
      g.append('text').attr('x', xy[0]).attr('y', xy[1] + labelY).attr('text-anchor', 'middle').attr('font-size', isHome ? 13 : 11).attr('font-weight', 700).attr('fill', '#1e293b').text(ap.code);
      g.append('text').attr('x', xy[0]).attr('y', xy[1] + labelY + 12).attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', isHome ? '#059669' : '#64748b').attr('font-weight', isHome ? 600 : 400).text(isHome ? 'HOME' : ap.name);
    });

    // Legend
    const lg = svg.append('g').attr('transform', `translate(16, ${height - 60})`);
    lg.append('rect').attr('width', 170).attr('height', 50).attr('rx', 8).attr('fill', '#fff').attr('stroke', '#e2e8f0').attr('stroke-width', 1);
    [[8, '#10b981', 'Home Airport'], [8, '#3b82f6', 'LAX Route'], [8, '#f59e0b', 'JAX Route']].forEach(([_, c, t], i) => {
      lg.append('circle').attr('cx', 16).attr('cy', 14 + i * 14).attr('r', 4).attr('fill', c);
      lg.append('text').attr('x', 28).attr('y', 18 + i * 14).attr('font-size', 10).attr('fill', '#475569').text(t);
    });

  }, [geoData, homeAirport, showPrices]);

  useEffect(() => { drawMap(); }, [drawMap]);

  useEffect(() => {
    const handleResize = () => drawMap();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawMap]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-50 rounded-xl">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm text-slate-500">Loading US map data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-red-50 rounded-xl">
        <p className="text-sm text-red-600">Map error: {error}</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full rounded-xl overflow-hidden shadow-lg bg-slate-50">
      <svg ref={svgRef} className="w-full h-full" style={{ minHeight: 480 }} />
    </div>
  );
}

// === SECTION: MAIN DASHBOARD ===

export default function PIALAXDashboard() {
  const [homeAirport, setHomeAirport] = useState('PIA');
  const [showPrices, setShowPrices] = useState(false);

  const routes = DEST_AIRPORTS.map(d => ({
    from: homeAirport,
    to: d.code,
    key: `${homeAirport}-${d.code}`,
  }));

  return (
    <div className="flex h-screen bg-gray-100 font-sans">

      {/* === Sidebar === */}
      <aside className="w-80 flex-shrink-0 bg-gradient-to-b from-slate-900 to-slate-800 text-white flex flex-col">

        {/* Branding */}
        <div className="px-6 pt-8 pb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">PIALAX</h1>
          <p className="text-slate-400 text-sm mt-1">Flight Route Dashboard</p>
        </div>

        <div className="h-px bg-slate-700 mx-6" />

        {/* Controls */}
        <div className="px-6 py-6 space-y-6 flex-1 overflow-y-auto">

          {/* Airport Picker */}
          <AirportSelector value={homeAirport} onChange={setHomeAirport} />

          {/* Current Hub Info */}
          <div className="bg-slate-700 bg-opacity-40 rounded-lg p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Current Hub</p>
            <p className="text-white font-bold text-lg">{AIRPORTS[homeAirport].fullName}</p>
            <p className="text-slate-300 text-xs mt-1">{AIRPORTS[homeAirport].name}</p>
          </div>

          {/* Price Toggle */}
          <label className="flex items-center gap-3 cursor-pointer bg-slate-700 bg-opacity-40 rounded-lg p-4">
            <div className="relative">
              <input
                type="checkbox"
                checked={showPrices}
                onChange={e => setShowPrices(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-11 h-6 rounded-full transition-colors ${showPrices ? 'bg-blue-500' : 'bg-slate-600'}`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${showPrices ? 'translate-x-5' : ''}`} />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-white">Cheapest Flights</p>
              <p className="text-xs text-slate-400">Next 3 months</p>
            </div>
          </label>

          {/* Flight Cards */}
          {showPrices && (
            <div className="space-y-4 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Route Pricing</p>
              {routes.map(r => (
                <FlightCard key={r.key} from={r.from} to={r.to} data={MOCK_PRICES[r.key]} />
              ))}
              <div className="bg-blue-500 bg-opacity-10 border border-blue-400 border-opacity-30 rounded-lg p-3 mt-2">
                <p className="text-xs text-blue-200 leading-relaxed">
                  Prices are sample data sourced from Google Flights. <strong>Live API integration</strong> is a planned enhancement.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700">
          <p className="text-xs text-slate-500">v1.0 Baseline — Built for AI agent enhancement</p>
        </div>
      </aside>

      {/* === Main Content === */}
      <main className="flex-1 flex flex-col p-6 min-w-0">

        {/* Header */}
        <header className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Route Map</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Showing routes from <span className="font-semibold text-gray-700">{homeAirport}</span> to LAX and JAX
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
            Live Map
          </div>
        </header>

        {/* Map */}
        <div className="flex-1 min-h-0">
          <MapView homeAirport={homeAirport} showPrices={showPrices} />
        </div>

        {/* Stats Bar */}
        <div className="mt-4 bg-white rounded-xl shadow-sm px-6 py-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <span className="text-gray-500">Active Routes: <strong className="text-gray-800">{routes.length}</strong></span>
            <span className="text-gray-500">Destinations: <strong className="text-gray-800">{DEST_AIRPORTS.length}</strong></span>
          </div>
          <span className="text-xs text-gray-400">Updated {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </main>
    </div>
  );
}

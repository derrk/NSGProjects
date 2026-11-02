// Builds results/trip-data.json: everything the comparison page needs, nothing it does not.
const fs = require('fs');
const path = require('path');
const { decodePolyline, thinWithCumulative, haversine } = require('./geo');

const ROOT = path.join(__dirname, '..');
const analysis = JSON.parse(fs.readFileSync(path.join(ROOT, 'results', 'analysis.json'), 'utf8'));

// --- projection: equirectangular with a cosine correction at the US mid-latitude ---
const LAT0 = 37.5;
const K = Math.cos(LAT0 * Math.PI / 180);
const proj = (lat, lon) => [lon * K, -lat];

function bounds(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// --- state outlines, simplified ---
function simplify(ring, tol) {
  // Perpendicular-distance decimation; plenty for a reference basemap.
  const out = [ring[0]];
  for (let i = 1; i < ring.length - 1; i++) {
    const [x, y] = ring[i], [px, py] = out[out.length - 1];
    if (Math.abs(x - px) + Math.abs(y - py) >= tol) out.push(ring[i]);
  }
  out.push(ring[ring.length - 1]);
  return out;
}

function buildBasemap() {
  const gj = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'untrusted', 'us-states.json'), 'utf8'));
  const paths = [];
  for (const f of gj.features) {
    const name = f.properties && f.properties.name;
    if (['Alaska', 'Hawaii', 'Puerto Rico'].includes(name)) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      for (const ring of poly) {
        const pts = simplify(ring.map(([lon, lat]) => proj(lat, lon)), 0.08);
        if (pts.length < 4) continue;
        paths.push('M' + pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L') + 'Z');
      }
    }
  }
  return paths;
}

// --- route geometry, thinned for drawing ---
function routePath(geometry) {
  const pts = thinWithCumulative(decodePolyline(geometry), 4.0).pts;
  const xy = pts.map(p => proj(p.lat, p.lon));
  return 'M' + xy.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L');
}

// --- overnight stop naming: nearest corridor site to the end of each day ---
function overnightName(pool, endMi) {
  let best = null;
  for (const s of pool) {
    const d = Math.abs(s.alongMi - endMi);
    if (!best || d < best.d) best = { d, s };
  }
  if (!best) return null;
  return { label: `${best.s.city}, ${best.s.state}`, offBy: Math.round(best.d) };
}

const scenarios = {};
for (const r of analysis.results) {
  if (r.error) continue;
  if (!scenarios[r.id]) {
    scenarios[r.id] = {
      id: r.id, group: r.group, label: r.label, note: r.note,
      waypoints: r.waypoints,
      mustSee: (r.mustSee||[]).map(m=>({name:m.name,hours:m.hours,charger:m.charger,xy:proj(m.lat,m.lon).map(v=>+v.toFixed(3))})),
      routeMi: r.routeMi,
      osrmHours: r.osrmHours,
      poolAll: r.poolAll,
      path: routePath(r.geometry),
      windows: {},
    };
  }
  const stateCounts = {};
  r.collectedSites.forEach(s => { stateCounts[s.state] = (stateCounts[s.state] || 0) + 1; });

  scenarios[r.id].windows[r.window] = {
    travelDays: r.travelDays,
    sitesCollected: r.sitesCollected,
    driveH: r.driveH,
    chargeH: r.chargeH,
    totalDayH: r.totalDayH,
    detourMi: r.detourMi,
    totalMiWithDetours: r.totalMiWithDetours,
    billedKwh: r.billedKwh,
    hotelNights: r.hotelNights,
    cost: r.cost,
    costPerSiteLow: r.costPerSiteLow,
    costPerSiteHigh: r.costPerSiteHigh,
    infeasibleDays: r.infeasibleDays,
    seeH: r.seeH,
    pushDays: r.pushDays,
    sitesPerDriveHour: r.sitesPerDriveHour,
    stateCounts,
    sites: r.collectedSites.map(s => ({
      n: s.name, c: s.city, st: s.state, lat: +s.lat.toFixed(4), lon: +s.lon.toFixed(4),
      off: +s.offRouteMi.toFixed(1), along: Math.round(s.alongMi), stalls: s.stalls, kw: s.powerKw,
      xy: proj(s.lat, s.lon).map(v => +v.toFixed(3)),
    })),
    days: r.days.map((d, i) => ({
      n: i + 1,
      miles: Math.round(d.miles),
      driveH: +d.driveH.toFixed(2),
      energyH: +d.energyH.toFixed(2),
      stopTimeH: +d.stopTimeH.toFixed(2),
      totalDayH: +d.totalDayH.toFixed(2),
      stops: d.stops,
      requiredStops: d.requiredStops,
      poolCount: d.poolCount,
      newPoolCount: d.newPoolCount,
      newSites: d.newSites,
      repeatStops: d.repeatStops,
      seeH: +d.seeH.toFixed(2),
      mustSee: d.mustSee,
      isPush: !!d.isPush,
      budgetH: d.budgetH,
      overnight: overnightName(r.allPool, d.endMi),
      flags: [
        d.overDriveCap ? 'drive-cap' : null,
        d.overBudget ? 'over-budget' : null,
        d.rangeInfeasible ? 'range-gap' : null,
        d.chargingWontFit ? 'charging-wont-fit' : null,
      ].filter(Boolean),
      siteNames: d.sites.map(s => `${s.name}`),
    })),
  };
}

const first = analysis.results.find(r => !r.error);
const out = {
  generatedAt: analysis.generatedAt,
  tripDates: { start: '2026-11-21', endDefault: '2026-11-29', endExtended: '2026-11-30' },
  windows: analysis.windows,
  visitedCount: analysis.visitedCount,
  history: analysis.history,
  assumptions: first.opts,
  provider: first.provider,
  catalog: first.catalogMeta,
  basemap: buildBasemap(),
  extent: null,
  scenarios: Object.values(scenarios),
};

// Shared viewBox across the basemap and every route, so the two options overlay
// correctly and the whole continental map stays in frame.
const allPts = [];
const collect = d => d.replace(/^M/, '').replace(/Z$/, '').split('L').forEach(p => {
  const [x, y] = p.split(',').map(Number);
  if (Number.isFinite(x) && Number.isFinite(y)) allPts.push([x, y]);
});
out.scenarios.forEach(s => collect(s.path));
out.basemap.forEach(collect);
out.extent = bounds(allPts);

const file = path.join(ROOT, 'results', 'trip-data.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log('wrote', file, (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
console.log('scenarios:', out.scenarios.length, 'basemap paths:', out.basemap.length);

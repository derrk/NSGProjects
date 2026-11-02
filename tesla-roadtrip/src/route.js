// Road routing. Provider: OSRM demo server (router.project-osrm.org), car profile,
// OpenStreetMap data. Distances are real road distances, not straight lines.
// NOTE: the demo server's `duration` runs materially slower than observed highway
// times, so we report it as a pessimistic bound and derive planning time from
// distance x an editable average moving speed. See timeFromDistance().
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PLACES = require('./places');

const CACHE_DIR = path.join(__dirname, '..', 'data', 'route-cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const PROVIDER = {
  name: 'OSRM demo server',
  url: 'https://router.project-osrm.org',
  profile: 'driving (car)',
  data: 'OpenStreetMap',
};

function coordsFor(name) {
  const c = PLACES[name];
  if (!c) throw new Error(`No gazetteer entry for "${name}"`);
  return c;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function routeLegs(waypointNames) {
  const coords = waypointNames.map(coordsFor);
  const key = crypto.createHash('sha1')
    .update(JSON.stringify(coords) + '|v2').digest('hex').slice(0, 16);
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);
  if (fs.existsSync(cacheFile)) {
    const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    c.cached = true;
    return c;
  }

  const coordStr = coords.map(([lat, lon]) => `${lon},${lat}`).join(';');
  const url = `${PROVIDER.url}/route/v1/driving/${coordStr}` +
              `?overview=full&geometries=polyline&annotations=false&steps=false`;

  let res, lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      res = await fetch(url, { headers: { 'User-Agent': 'tesla-roadtrip-planner/1.0' } });
      if (res.ok) break;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) { lastErr = e; }
    await sleep(1500 * (attempt + 1));
  }
  if (!res || !res.ok) throw new Error(`Routing failed for ${waypointNames.join(' -> ')}: ${lastErr}`);

  const json = await res.json();
  if (json.code !== 'Ok') throw new Error(`OSRM: ${json.code} ${json.message || ''}`);

  const r = json.routes[0];
  const out = {
    waypoints: waypointNames,
    distanceMi: r.distance / 1609.344,
    osrmHours: r.duration / 3600,
    geometry: r.geometry,
    legs: r.legs.map((l, i) => ({
      from: waypointNames[i],
      to: waypointNames[i + 1],
      distanceMi: l.distance / 1609.344,
      osrmHours: l.duration / 3600,
    })),
    provider: PROVIDER,
    routedAt: new Date().toISOString(),
  };
  fs.writeFileSync(cacheFile, JSON.stringify(out));
  await sleep(1100); // be polite to the public demo server
  return out;
}

// Planning drive time. OSRM's own duration is kept as a pessimistic bound.
function timeFromDistance(distanceMi, avgMph) {
  return distanceMi / avgMph;
}

module.exports = { routeLegs, timeFromDistance, PROVIDER, coordsFor };

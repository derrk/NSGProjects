// Geometry helpers. Distances in statute miles.
const R_MI = 3958.7613;
const rad = d => d * Math.PI / 180;

function haversine(aLat, aLon, bLat, bLon) {
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Decode an OSRM/Google encoded polyline (precision 5) to [lat, lon] pairs.
function decodePolyline(str, precision = 5) {
  const factor = Math.pow(10, precision);
  const out = [];
  let index = 0, lat = 0, lon = 0;
  while (index < str.length) {
    let result = 0, shift = 0, b;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    result = 0; shift = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lon += (result & 1) ? ~(result >> 1) : (result >> 1);
    out.push([lat / factor, lon / factor]);
  }
  return out;
}

// Thin a polyline so consecutive kept points are at least `stepMi` apart,
// and tag each kept point with its cumulative distance along the original line.
function thinWithCumulative(points, stepMi = 1.0) {
  const kept = [];
  let cum = 0, lastKeptCum = -Infinity;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) cum += haversine(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
    if (cum - lastKeptCum >= stepMi || i === 0 || i === points.length - 1) {
      kept.push({ lat: points[i][0], lon: points[i][1], cum });
      lastKeptCum = cum;
    }
  }
  return { pts: kept, totalMi: cum };
}

// Nearest point on a thinned line to (lat, lon): returns { distMi, alongMi }.
// Bounding-box prefilter keeps this cheap across thousands of sites.
function nearestOnLine(lat, lon, line, maxMi) {
  const dLatBox = maxMi / 69.0;
  const dLonBox = maxMi / (69.0 * Math.max(0.2, Math.cos(rad(lat))));
  let best = null;
  for (const p of line) {
    if (Math.abs(p.lat - lat) > dLatBox || Math.abs(p.lon - lon) > dLonBox) continue;
    const d = haversine(lat, lon, p.lat, p.lon);
    if (!best || d < best.distMi) best = { distMi: d, alongMi: p.cum };
  }
  return best;
}

module.exports = { haversine, decodePolyline, thinWithCumulative, nearestOnLine };

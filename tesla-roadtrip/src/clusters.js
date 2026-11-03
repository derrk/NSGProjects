// Finds groups of sites close enough that you would sweep them as a unit rather
// than pass them on a corridor. Single-link clustering: two sites join the same
// cluster if they are within `linkMi` of each other.
const { haversine } = require('./geo');

function buildClusters(sites, linkMi = 12) {
  // Grid index so we only compare nearby sites.
  const cell = linkMi / 69.0;
  const grid = new Map();
  const key = (a, b) => a + ':' + b;
  sites.forEach((s, i) => {
    const gx = Math.floor(s.lat / cell);
    const gy = Math.floor(s.lon / (cell * Math.max(0.2, Math.cos(s.lat * Math.PI / 180))));
    const k = key(gx, gy);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });

  const neighbours = i => {
    const s = sites[i];
    const gx = Math.floor(s.lat / cell);
    const gy = Math.floor(s.lon / (cell * Math.max(0.2, Math.cos(s.lat * Math.PI / 180))));
    const out = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(key(gx + dx, gy + dy));
        if (!bucket) continue;
        for (const j of bucket) {
          if (j === i) continue;
          if (haversine(s.lat, s.lon, sites[j].lat, sites[j].lon) <= linkMi) out.push(j);
        }
      }
    }
    return out;
  };

  const seen = new Uint8Array(sites.length);
  const clusters = [];
  for (let i = 0; i < sites.length; i++) {
    if (seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    const members = [];
    while (stack.length) {
      const cur = stack.pop();
      members.push(cur);
      for (const j of neighbours(cur)) {
        if (!seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    clusters.push(members.map(ix => sites[ix]));
  }

  return clusters.map(members => {
    const lat = members.reduce((a, s) => a + s.lat, 0) / members.length;
    const lon = members.reduce((a, s) => a + s.lon, 0) / members.length;
    // Rough span: the widest pairwise distance, sampled when the cluster is big.
    let span = 0;
    const sample = members.length > 60 ? members.filter((_, i) => i % 3 === 0) : members;
    for (let a = 0; a < sample.length; a++) {
      for (let b = a + 1; b < sample.length; b++) {
        const d = haversine(sample[a].lat, sample[a].lon, sample[b].lat, sample[b].lon);
        if (d > span) span = d;
      }
    }
    const states = [...new Set(members.map(s => s.state))];
    const cities = {};
    members.forEach(s => { cities[s.city] = (cities[s.city] || 0) + 1; });
    const label = Object.entries(cities).sort((a, b) => b[1] - a[1])[0][0] + ', ' + states[0];
    return { label, lat, lon, spanMi: span, count: members.length, states, members };
  }).sort((a, b) => b.count - a.count);
}

module.exports = { buildClusters };

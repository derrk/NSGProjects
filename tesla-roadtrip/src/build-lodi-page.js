// Assembles the Lodi comparison page from the plan plus the cluster evidence.
const fs = require('fs');
const path = require('path');
const { load } = require('./catalog');
const { haversine } = require('./geo');
const { sweepCluster, sweepCurve } = require('./sweep');

const ROOT = path.join(__dirname, '..');
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'results', 'lodi-plan.json'), 'utf8'));
const history = JSON.parse(fs.readFileSync(path.join(ROOT, 'results', 'history.json'), 'utf8'));
const visited = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'visited.json'), 'utf8'));
const vis = new Set(visited.srcIds);
const { sites } = load({ country: 'USA', statuses: ['OPEN'] });
const un = sites.filter(s => !vis.has(s.srcId) && !/^\s*\[/.test(s.name));
const near = (lat, lon, r) => un.filter(s => haversine(lat, lon, s.lat, s.lon) <= r);

const METROS = [
  ['Bay Area', 37.65, -122.2, 40],
  ['Los Angeles', 34.0522, -118.2437, 38],
  ['Las Vegas', 36.1699, -115.1398, 25],
  ['San Diego', 32.7157, -117.1611, 28],
  ['Sacramento', 38.5816, -121.4944, 28],
  ['Phoenix', 33.4484, -112.0740, 30],
];
const clusters = METROS.map(([name, lat, lon, r]) => {
  const pool = near(lat, lon, r);
  const s = sweepCluster(pool, { lat, lon }, 10.5);
  return { name, pool: pool.length, perDay: s.count, minutesPerSite: s.minutesPerSite };
});

const bay = near(37.65, -122.2, 40);
const sessionCurve = sweepCurve(bay, { lat: 37.65, lon: -122.2 }, 10.5, [1, 2, 3, 5, 8])
  .map(r => ({ minSessionKwh: r.minSessionKwh, count: r.count }));

const NORTH = [
  ['Santa Rosa', 38.4405, -122.7141, 25],
  ['Chico', 39.7285, -121.8375, 30],
  ['Redding', 40.5865, -122.3917, 30],
  ['Eureka', 40.8021, -124.1637, 40],
];
const northCoast = NORTH.map(([name, lat, lon, r]) => ({ name, count: near(lat, lon, r).length }));

const payload = {
  builtAt: plan.builtAt,
  assumedMinSessionKwh: plan.options[0].assumptions.minSessionKwh,
  baseline: { unique2026: history.qualifying.uniqueSites2026, corridorOnly: 87 },
  clusters, sessionCurve, northCoast,
  options: plan.options.map(o => {
    const { geometry, collectedSrcIds, ...rest } = o;   // page does not need these
    return rest;
  }),
};

const tpl = fs.readFileSync(path.join(ROOT, 'web', 'lodi.template.html'), 'utf8');
const file = path.join(ROOT, 'web', 'lodi.html');
fs.writeFileSync(file, tpl.replace('__LODI_DATA__', () => JSON.stringify(payload).replace(/<\//g, '<\/')));
console.log('wrote', file, (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
console.log('clusters:', clusters.map(c => c.name + ' ' + c.pool + '/' + c.perDay).join(' | '));

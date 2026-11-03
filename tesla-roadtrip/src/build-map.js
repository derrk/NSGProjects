// Builds web/map.html: a standalone, self-hostable Supercharger map with
// click-to-mark-visited. No server, no build step - open the file or drop it on
// any static host. Everything it needs is inlined.
const fs = require('fs');
const path = require('path');
const { load } = require('./catalog');
const { decodePolyline, thinWithCumulative } = require('./geo');

const ROOT = path.join(__dirname, '..');
const visited = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'visited.json'), 'utf8'));
const lodi = JSON.parse(fs.readFileSync(path.join(ROOT, 'results', 'lodi-plan.json'), 'utf8'));
const analysis = JSON.parse(fs.readFileSync(path.join(ROOT, 'results', 'analysis.json'), 'utf8'));
const history = analysis.history;

const { sites, meta } = load({ country: 'USA', statuses: ['OPEN'] });

// Compact rows keep the standalone file small: [srcId, name, city, state, lat, lon, stalls, kw, thirdParty]
const rows = sites.map(s => [
  s.srcId,
  s.name,
  s.city || '',
  s.state || '',
  +s.lat.toFixed(5),
  +s.lon.toFixed(5),
  s.stalls || 0,
  s.powerKw || 0,
  /^\s*\[/.test(s.name) ? 1 : 0,
]);

// Planned stops for the chosen Lodi plan, by srcId -> day number.
const chosen = lodi.options.find(o => o.id === (process.argv[2] || 'canyon'));
const planned = {};
const dayOfSrc = {};
chosen.days.forEach(d => (d.siteNames || []).forEach(n => { dayOfSrc[n] = d.n; }));
sites.forEach(s => { if (dayOfSrc[s.name] != null) planned[s.srcId] = dayOfSrc[s.name]; });

// Route line, thinned for drawing.
const b1 = analysis.results.find(r => r.id === 'B1' && r.window === 'nov20_29');
const routeLine = thinWithCumulative(decodePolyline(b1.geometry), 2.0).pts
  .map(p => [+p.lat.toFixed(4), +p.lon.toFixed(4)]);

const overnights = chosen.days.map(d => ({ n: d.n, type: d.type, metro: d.metro, miles: d.miles, newSites: d.newSites }));

const payload = {
  builtAt: new Date().toISOString(),
  catalog: { source: meta.endpoint, retrievedAt: meta.retrievedAt, count: rows.length },
  historyVisited: visited.srcIds,
  historyMeta: {
    vin: history ? history.vin : null,
    sessions: history ? history.sessionCount : null,
    unique2026: history ? history.qualifying.uniqueSites2026 : null,
    coverage: history ? history.coverage : null,
  },
  planned,
  planLabel: chosen.label,
  sweepMetros: chosen.sweepMetros || [],
  routeLine,
  overnights,
  sites: rows,
};

const tpl = fs.readFileSync(path.join(ROOT, 'web', 'map.template.html'), 'utf8');
const out = tpl.replace('__MAP_DATA__', () => JSON.stringify(payload).replace(/<\//g, '<\\/'));
const file = path.join(ROOT, 'web', 'map.html');
fs.writeFileSync(file, out);
console.log('wrote', file, (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
console.log('sites:', rows.length, '| history-visited:', visited.srcIds.length, '| planned stops:', Object.keys(planned).length);

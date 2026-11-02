// Runs every scenario for both date windows and writes results/analysis.json.
const fs = require('fs');
const path = require('path');
const { analyzeScenario } = require('./analyze');
const { scenarios } = require('./scenarios');

const ROOTDIR = path.join(__dirname, '..');
const OUT = path.join(ROOTDIR, 'results');
fs.mkdirSync(OUT, { recursive: true });

// Depart Friday Nov 20 after school; home Sunday Nov 29 for the school run.
const EVENING_PLAN = ['evening', 'pushLate', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'push'];
const WINDOWS = [
  { key: 'nov20_29', travelDays: 10, shapes: EVENING_PLAN, short: 'Nov 20-29',
    label: 'Fri Nov 20 after school - Sun Nov 29 (chosen)' },
  { key: 'nov21_29', travelDays: 9, shapes: null, short: 'Nov 21-29',
    label: 'Sat Nov 21 morning - Sun Nov 29 (no Friday head start)' },
];

// Supply real charging history here to subtract already-visited sites.
const visitedFile = path.join(__dirname, '..', 'data', 'visited.json');
const visitedData = fs.existsSync(visitedFile) ? JSON.parse(fs.readFileSync(visitedFile, 'utf8')) : {};
const visitedLocationIds = visitedData.locationIds || [];
const visitedSrcIds = visitedData.srcIds || [];

(async () => {
  const out = {
    generatedAt: new Date().toISOString(),
    windows: WINDOWS,
    visitedCount: visitedSrcIds.length,
    history: fs.existsSync(path.join(ROOTDIR, 'results', 'history.json'))
      ? JSON.parse(fs.readFileSync(path.join(ROOTDIR, 'results', 'history.json'), 'utf8'))
      : null,
    results: [],
  };
  for (const w of WINDOWS) {
    for (const s of scenarios) {
      process.stdout.write(`${s.id}/${w.key} ... `);
      try {
        const r = await analyzeScenario({ ...s, travelDays: w.travelDays, dayShapes: w.shapes, visitedLocationIds, visitedSrcIds });
        r.window = w.key;
        out.results.push(r);
        console.log(`${r.routeMi.toFixed(0)} mi, pool ${r.poolAll}, new ${r.sitesCollected}, drive ${r.driveH.toFixed(1)} h, short ${r.shortfallMi.toFixed(0)} mi`);
      } catch (e) {
        console.log('FAILED:', e.message);
        out.results.push({ id: s.id, window: w.key, error: e.message });
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'analysis.json'), JSON.stringify(out, null, 1));
  console.log('\nwrote results/analysis.json');
})();

// Builds the locked-in B1 itinerary for both date windows -> results/itinerary.json
const fs = require('fs');
const path = require('path');
const { analyzeScenario } = require('./analyze');
const { scenarios } = require('./scenarios');
const { buildItinerary, navLinks } = require('./itinerary');

const lodgingPath = path.join(__dirname, '..', 'data', 'lodging.json');
const lodging = fs.existsSync(lodgingPath) ? JSON.parse(fs.readFileSync(lodgingPath, 'utf8')) : null;

const ROOT = path.join(__dirname, '..');
const visited = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'visited.json'), 'utf8'));
const CHOSEN = process.argv[2] || 'B1';
const sc = scenarios.find(s => s.id === CHOSEN);

(async () => {
  const out = { chosen: CHOSEN, label: sc.label, builtAt: new Date().toISOString(), assumptions: null, lodging, windows: {} };
  // Depart Friday Nov 20 after school; home Sunday Nov 29 for the school run.
  const EVENING_PLAN = ['evening', 'pushLate', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'push'];
  const WINDOWS = [
    { key: 'nov20_29', travelDays: 10, startDate: '2026-11-20', shapes: EVENING_PLAN,
      label: 'Fri Nov 20 after school - Sun Nov 29' },
    { key: 'nov21_29', travelDays: 9, startDate: '2026-11-21', shapes: null,
      label: 'Sat Nov 21 morning - Sun Nov 29' },
  ];
  for (const win of WINDOWS) {
    const { key, travelDays } = win;
    const r = await analyzeScenario({
      ...sc, travelDays, dayShapes: win.shapes,
      visitedSrcIds: visited.srcIds, visitedLocationIds: visited.locationIds,
    });
    const it = buildItinerary(r, r.opts, win.startDate);
    const thirdPartyPassed = r.allPool.filter(s => s.isThirdParty).length;
    out.windows[key] = {
      travelDays,
      label: win.label,
      startDate: win.startDate,
      routeMi: r.routeMi,
      totalMiWithDetours: r.totalMiWithDetours,
      driveH: r.driveH, chargeH: r.chargeH, seeH: r.seeH,
      newSites: r.sitesCollected,
      thirdPartyPassed,
      billedKwh: r.billedKwh,
      hotelNights: r.hotelNights,
      cost: r.cost,
      infeasibleDays: r.infeasibleDays,
      streak: it.streak,
      days: it.days.map(d => ({ ...d, nav: navLinks(d) })),
    };
    out.assumptions = r.opts;
    console.log(`${key}: ${travelDays} days, ${r.sitesCollected} new sites, max streak gap ${it.streak.maxGapH} h${it.streak.withinBuffer ? '' : '  <-- OVER 20 h BUFFER'}`);
  }
  fs.writeFileSync(path.join(ROOT, 'results', 'itinerary.json'), JSON.stringify(out, null, 1));
  console.log('wrote results/itinerary.json');
})();

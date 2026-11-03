// Builds the two feasible Lodi plans -> results/lodi-plan.json
const fs = require('fs');
const path = require('path');
const { buildPlan } = require('./plan-lodi');
const { costModel } = require('./analyze');

const ROOT = path.join(__dirname, '..');
const GC_WP = ['Grand Canyon (Tusayan), AZ', 'Williams, AZ'];

const route = withGC => [
  'Wichita Falls, TX', 'Amarillo, TX', 'Albuquerque, NM', 'Flagstaff, AZ',
  ...(withGC ? GC_WP : []),
  'Kingman, AZ', 'Las Vegas, NV', 'Barstow, CA', 'Bakersfield, CA', 'Fresno, CA',
  'Lodi, CA', 'Sacramento, CA', 'San Francisco, CA', 'San Jose, CA',
  'Los Angeles, CA', 'Palm Springs, CA', 'Phoenix, AZ', 'Tucson, AZ',
  'Las Cruces, NM', 'El Paso, TX', 'Midland, TX', 'Abilene, TX', 'Wichita Falls, TX',
];

const MOM = { name: 'Mom in Lodi', lat: 38.1341, lon: -121.2722, hours: 3 };
const GCV = { name: 'Grand Canyon South Rim', lat: 36.0544, lon: -112.1401, hours: 3 };
const DINER = { name: 'Tesla Diner', withMetro: 'Los Angeles', lat: 34.0901, lon: -118.3437, hours: 1 };

const VEG = { name: 'Las Vegas', lat: 36.1699, lon: -115.1398, radiusMi: 25, days: 1 };
const BAY = { name: 'Bay Area', lat: 37.65, lon: -122.2, radiusMi: 40, days: 1 };
const LA = { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, radiusMi: 38, days: 1 };

const GENTLE = ['evening', 'pushLate', 'push', 'push', 'normal', 'normal', 'normal', 'normal', 'normal', 'push'];
const HARD = ['evening', 'pushLate', 'push', 'normal', 'normal', 'normal', 'normal', 'normal', 'push', 'push'];

const OPTIONS = [
  {
    id: 'canyon',
    label: 'Keep the Grand Canyon',
    note: 'Two sweep days, Bay Area and Los Angeles. Only the two usual push days, so the schedule stays humane. The Grand Canyon costs the third sweep.',
    waypoints: route(true), sweeps: [BAY, LA], visits: [GCV, MOM, DINER], dayShapes: GENTLE,
  },
  {
    id: 'maxsites',
    label: 'Drop the Grand Canyon, add Las Vegas',
    note: 'Three sweep days, Las Vegas plus Bay Area and Los Angeles. Buys about twenty more sites, at the price of the Grand Canyon and four long driving days.',
    waypoints: route(false), sweeps: [VEG, BAY, LA], visits: [MOM, DINER], dayShapes: HARD,
  },
];

(async () => {
  const out = { builtAt: new Date().toISOString(), destination: 'Lodi, California', options: [] };
  for (const o of OPTIONS) {
    const r = await buildPlan(o);
    const cost = costModel(r.billedKwh, r.days.length, r.opts);
    out.options.push({
      id: o.id, label: o.label, note: o.note,
      routeMi: r.routeMi, totalMi: r.totalMi, shortfallMi: r.shortfallMi,
      newSites: r.newSites, sweepDays: r.sweepDays, driveDays: r.driveDays,
      overBudgetDays: r.overBudgetDays,
      pushDays: r.days.filter(d => d.shape === 'push' || d.shape === 'pushLate').length,
      billedKwh: r.billedKwh, cost,
      feasible: r.shortfallMi < 1 && r.overBudgetDays === 0,
      days: r.days.map(d => ({
        n: d.n, type: d.type, shape: d.shape, metro: d.metro || null,
        miles: d.miles, driveH: d.driveH, newSites: d.newSites,
        totalDayH: d.totalDayH, budgetH: d.budgetH,
        visits: d.visits || [], visitH: d.visitH || 0,
        minutesPerSite: d.minutesPerSite || null,
        stoppedBecause: d.stoppedBecause || null,
        siteNames: (d.sites || []).map(s => s.name),
        maxGapMi: d.maxGapMi || null, rangeRisk: !!d.rangeRisk,
        stops: (d.sites || []).map(s => ({ srcId: s.srcId, name: s.name, city: s.city, state: s.state, lat: s.lat, lon: s.lon, stalls: s.stalls, kw: s.powerKw, offRouteMi: s.offRouteMi != null ? +s.offRouteMi.toFixed(1) : null, alongMi: s.alongMi != null ? Math.round(s.alongMi) : null, legMi: s.legMi != null ? s.legMi : null, addKwh: s.addKwh != null ? s.addKwh : null })),
        startMi: d.startMi != null ? Math.round(d.startMi) : null,
        endMi: d.endMi != null ? Math.round(d.endMi) : null,
      })),
      collectedSrcIds: r.collected.map(s => s.srcId),
      geometry: r.geometry,
      sweepMetros: o.sweeps.map(s => ({ name: s.name, lat: s.lat, lon: s.lon, radiusMi: s.radiusMi, days: s.days })),
      visitList: o.visits.map(v => ({ name: v.name, lat: v.lat, lon: v.lon, hours: v.hours })),
      stateCounts: r.collected.reduce((m, s) => { m[s.state] = (m[s.state] || 0) + 1; return m; }, {}),
      assumptions: {
        minSessionKwh: r.opts.minSessionKwh,
        usableKwh: r.opts.usableKwh,
        avgMph: r.opts.avgMph,
        maxDriveH: r.opts.maxDriveH,
        pushDriveH: r.opts.pushDriveH,
      },
    });
    console.log(`${o.id.padEnd(10)} ${String(r.newSites).padStart(4)} sites | ${Math.round(r.routeMi)} route mi | sweeps ${r.sweepDays} | over ${r.overBudgetDays} | short ${Math.round(r.shortfallMi)}`);
  }
  fs.writeFileSync(path.join(ROOT, 'results', 'lodi-plan.json'), JSON.stringify(out, null, 1));
  console.log('wrote results/lodi-plan.json');
})();

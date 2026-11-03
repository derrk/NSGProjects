// Trip planner for the Lodi route, where the point is to sweep dense metros rather
// than only graze a corridor. A day is either a DRIVE day (make distance, collect
// what the corridor offers) or a SWEEP day (stay in one metro and collect hard).
const fs = require('fs');
const path = require('path');
const { load } = require('./catalog');
const { routeLegs, timeFromDistance } = require('./route');
const { decodePolyline, thinWithCumulative, nearestOnLine, haversine } = require('./geo');
const { sweepCluster } = require('./sweep');
const { DEFAULTS } = require('./analyze');

const ROOT = path.join(__dirname, '..');

// Day shapes, as before: Friday evening start, push days at each end.
function shapeFor(kind, opts) {
  if (kind === 'evening') return { kind, driveCapH: opts.eveningDriveH, budgetH: opts.eveningBudgetH, startHour: opts.eveningStartHour };
  if (kind === 'push') return { kind, driveCapH: opts.pushDriveH, budgetH: opts.pushBudgetH, startHour: opts.pushStartHour };
  if (kind === 'pushLate') return { kind, driveCapH: opts.pushDriveH, budgetH: opts.pushBudgetH - 1.5, startHour: opts.normalStartHour };
  return { kind: 'normal', driveCapH: opts.maxDriveH, budgetH: opts.dayBudgetH, startHour: opts.normalStartHour };
}

// Corridor collecting on a drive day.
//
// Stops must be SPREAD across the day, not taken greedily from the start. Two
// reasons, and the physical one matters more: you cannot drive 400 miles having
// charged only in the first half hour, so consecutive stops have to stay inside
// usable range. The second is the streak - charging all morning and not again
// until the next morning opens a gap of well over twenty hours.
function corridorCollect(pool, startMi, endMi, availableH, opts) {
  const seg = pool.filter(s => s.alongMi >= startMi && s.alongMi < endMi && s.isNew);
  if (!seg.length) return { picked: [], hours: 0 };

  const span = Math.max(1, endMi - startMi);
  const costOf = s => opts.stopOverheadMin / 60 + (2 * s.offRouteMi / opts.detourMph);
  const avgCost = seg.reduce((a, s) => a + costOf(s), 0) / seg.length;

  // How many stops the day can afford, and how many the range demands.
  const affordable = Math.max(1, Math.floor(availableH / Math.max(0.05, avgCost)));
  const required = Math.max(1, Math.ceil(span / opts.usableRangeMi));
  const K = Math.min(seg.length, Math.max(required, Math.min(affordable, seg.length)));

  // Targets evenly spaced, the last one at the end of the day so the overnight
  // gap starts as late as possible.
  const used = new Set();
  const picked = [];
  for (let i = 1; i <= K; i++) {
    const target = startMi + span * (i / K);
    let best = null;
    for (const s of seg) {
      if (used.has(s.srcId)) continue;
      const d = Math.abs(s.alongMi - target);
      const score = d + s.offRouteMi * 3;       // nearby beats slightly closer but far off-route
      if (!best || score < best.score) best = { s, score };
    }
    if (!best) break;
    used.add(best.s.srcId);
    picked.push(best.s);
  }

  picked.sort((a, b) => a.alongMi - b.alongMi);

  // Drop anything that violates the session spacing rule, and stay in budget.
  const out = [];
  let last = -Infinity, spent = 0;
  for (const s of picked) {
    if (s.alongMi - last < opts.minSpacingMi) continue;
    const cost = costOf(s);
    if (spent + cost > availableH && out.length >= required) continue;
    out.push(s); spent += cost; last = s.alongMi;
  }

  // Largest gap between consecutive stops, so the caller can flag an unreachable leg.
  let maxGapMi = out.length ? out[0].alongMi - startMi : span;
  for (let i = 1; i < out.length; i++) maxGapMi = Math.max(maxGapMi, out[i].alongMi - out[i - 1].alongMi);
  if (out.length) maxGapMi = Math.max(maxGapMi, endMi - out[out.length - 1].alongMi);

  return { picked: out, hours: spent, maxGapMi };
}

async function buildPlan(cfg) {
  const opts = { ...DEFAULTS, ...(cfg.opts || {}) };
  const visited = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'visited.json'), 'utf8'));
  const visSet = new Set(visited.srcIds);
  const { sites } = load({ country: 'USA', statuses: ['OPEN'] });

  const flagged = sites.map(s => ({
    ...s,
    isThirdParty: /^\s*\[/.test(s.name),
    isNew: !visSet.has(s.srcId) && !/^\s*\[/.test(s.name),
  }));

  const route = await routeLegs(cfg.waypoints);
  const line = thinWithCumulative(decodePolyline(route.geometry), 1.0);

  // Corridor pool.
  const pool = [];
  for (const s of flagged) {
    const hit = nearestOnLine(s.lat, s.lon, line.pts, opts.corridorMi);
    if (hit) pool.push({ ...s, offRouteMi: hit.distMi, alongMi: hit.alongMi });
  }
  pool.sort((a, b) => a.alongMi - b.alongMi);
  const seen = new Set();
  const corridor = pool.filter(s => (seen.has(s.srcId) ? false : (seen.add(s.srcId), true)));

  // Place each sweep metro along the route so its day lands in the right place.
  const sweeps = cfg.sweeps.map(m => {
    const hit = nearestOnLine(m.lat, m.lon, line.pts, 80);
    return { ...m, alongMi: hit ? hit.alongMi : null };
  }).filter(m => m.alongMi != null).sort((a, b) => a.alongMi - b.alongMi);

  // Fixed-time visits (family, sightseeing) placed along the route.
  const visits = (cfg.visits || []).map(v => {
    const hit = nearestOnLine(v.lat, v.lon, line.pts, 60);
    return { ...v, alongMi: hit ? hit.alongMi : null };
  }).filter(v => v.alongMi != null);

  // Build the day list: sweep days sit at their metro's position; drive days
  // share the route miles between them.
  const shapes = cfg.dayShapes.map(k => shapeFor(k, opts));
  const sweepDayIndex = {};   // day index -> sweep metro
  let di = 0;
  const totalSweepDays = sweeps.reduce((a, m) => a + m.days, 0);
  const driveDays = shapes.length - totalSweepDays;

  // A sweep metro cuts the route in two: the drive days before it must deliver you
  // TO that metro, and the sweep day then happens there. Without this the drive day
  // overshoots and you end up sleeping 200 miles past the city you sweep next morning.
  const marks = [];
  sweeps.forEach(m => {
    for (let k = 0; k < m.days; k++) marks.push({ metro: m, atMi: m.alongMi });
  });
  marks.sort((a, b) => a.atMi - b.atMi);

  // Segment boundaries: 0, each metro, then the route end.
  const cuts = [...new Set(marks.map(mk => mk.atMi))].sort((a, b) => a - b);
  const bounds = [0, ...cuts, route.distanceMi];
  const segMiles = bounds.slice(1).map((b, i) => b - bounds[i]);

  // Share the drive days between segments by how far each one is, at least one each.
  let alloc = segMiles.map(mi => Math.max(1, Math.round(driveDays * mi / route.distanceMi)));
  let diff = driveDays - alloc.reduce((a, b) => a + b, 0);
  while (diff !== 0) {
    const order = segMiles.map((mi, i) => ({ i, per: mi / alloc[i] }))
      .sort((a, b) => (diff > 0 ? b.per - a.per : a.per - b.per));
    const pick = order.find(o => diff > 0 || alloc[o.i] > 1);
    if (!pick) break;
    alloc[pick.i] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }

  // Lay the days out: segment drive days, then that segment's sweep day(s), repeat.
  const segmentOfDay = {};     // drive-day index -> segment index
  let dayIdx = 0, markIdx = 0;
  for (let s = 0; s < segMiles.length; s++) {
    for (let k = 0; k < alloc[s] && dayIdx < shapes.length; k++) {
      segmentOfDay[dayIdx] = s;
      dayIdx++;
    }
    // Every sweep sitting at this segment's far boundary happens now.
    while (markIdx < marks.length && dayIdx < shapes.length &&
           Math.abs(marks[markIdx].atMi - bounds[s + 1]) < 1) {
      sweepDayIndex[dayIdx] = marks[markIdx].metro;
      dayIdx++; markIdx++;
    }
  }

  // Share route miles across the drive days by how many miles each day can ACTUALLY
  // do. A mile costs driving time plus the charging time to replace its energy, so
  // budget hours alone overstate capacity - that is what put the Friday evening and
  // the first push day over their budgets.
  const breakH = opts.breakMinPerDay / 60;
  const hoursPerMile = 1 / opts.avgMph + (opts.battKwhPerMi * opts.chargeMultiplier) / opts.avgChargeKw;
  const driveIdx = shapes.map((_, i) => i).filter(i => sweepDayIndex[i] === undefined);
  const capacityMi = {};
  driveIdx.forEach(i => {
    const byTime = Math.max(0, shapes[i].budgetH - breakH) / hoursPerMile;
    const byCap = shapes[i].driveCapH * opts.avgMph;
    capacityMi[i] = Math.min(byTime, byCap);
  });

  // A visit eats hours on whichever day it falls, which lowers that day's mileage
  // capacity, which moves where the visit falls. Iterate until the mapping settles.
  const routeVisits = visits.filter(v => !v.withMetro);
  let milesFor = {};
  let leftover = 0;
  let visitHoursOn = {};
  let converged = false;

  for (let pass = 0; pass < 6; pass++) {
    const capThisPass = {};
    driveIdx.forEach(i => {
      const vh = visitHoursOn[i] || 0;
      const byTime = Math.max(0, shapes[i].budgetH - breakH - vh) / hoursPerMile;
      capThisPass[i] = Math.min(byTime, shapes[i].driveCapH * opts.avgMph);
    });
    // Allocate SEGMENT BY SEGMENT, so the drive days before a sweep deliver exactly
    // the miles to that metro and no further.
    milesFor = {};
    leftover = 0;
    for (let s = 0; s < segMiles.length; s++) {
      const inSeg = driveIdx.filter(i => segmentOfDay[i] === s);
      if (!inSeg.length) { leftover += segMiles[s]; continue; }
      const capSum = inSeg.reduce((a, i) => a + capThisPass[i], 0) || 1;
      inSeg.forEach(i => {
        milesFor[i] = Math.min(capThisPass[i], segMiles[s] * capThisPass[i] / capSum);
      });
      let rest = segMiles[s] - inSeg.reduce((a, i) => a + milesFor[i], 0);
      for (const i of inSeg) {
        if (rest <= 0.5) break;
        const take = Math.min(capThisPass[i] - milesFor[i], rest);
        milesFor[i] += take; rest -= take;
      }
      leftover += Math.max(0, rest);
    }

    // Where do the visits land now?
    const nextVisitHours = {};
    let cur = 0;
    for (let i = 0; i < shapes.length; i++) {
      if (sweepDayIndex[i] !== undefined) continue;
      const end = cur + (milesFor[i] || 0);
      const vh = routeVisits
        .filter(v => v.alongMi > cur && v.alongMi <= end + 1)
        .reduce((a, v) => a + v.hours, 0);
      if (vh) nextVisitHours[i] = vh;
      cur = end;
    }
    const same = JSON.stringify(nextVisitHours) === JSON.stringify(visitHoursOn);
    visitHoursOn = nextVisitHours;
    if (same) { converged = true; break; }
  }

  Object.assign(capacityMi, {});
  // If the route still does not fit, say so rather than quietly overrunning days.
  const shortfallMi = Math.max(0, leftover);

  // Walk the days.
  const days = [];
  const collected = new Map();
  let cursorMi = 0;
  const sweptPools = new Map();   // metro name -> sites already taken there

  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    const metro = sweepDayIndex[i];

    if (metro) {
      const alreadyTaken = sweptPools.get(metro.name) || new Set();
      const metroPool = flagged.filter(s =>
        s.isNew && !collected.has(s.srcId) && !alreadyTaken.has(s.srcId) &&
        haversine(metro.lat, metro.lon, s.lat, s.lon) <= metro.radiusMi);
      const metroVisitH = (cfg.visits || []).filter(v => v.withMetro === metro.name).reduce((a, v) => a + v.hours, 0);
      const budget = shape.budgetH - breakH - metroVisitH;
      const sw = sweepCluster(metroPool, { lat: metro.lat, lon: metro.lon }, budget, {
        minSessionKwh: opts.minSessionKwh,
        usableKwh: opts.usableKwh,
      });
      sw.visited.forEach(s => { collected.set(s.srcId, s); alreadyTaken.add(s.srcId); });
      sweptPools.set(metro.name, alreadyTaken);

      days.push({
        n: i + 1, type: 'sweep', metro: metro.name, shape: shape.kind,
        miles: Math.round(sw.miles), driveH: +(sw.miles / opts.metroMphForReport || sw.miles / 25).toFixed(1),
        newSites: sw.count, poolSeen: metroPool.length,
        totalDayH: +(sw.hours + breakH + metroVisitH).toFixed(1), budgetH: shape.budgetH,
        visits: (cfg.visits || []).filter(v => v.withMetro === metro.name).map(v => v.name), visitH: metroVisitH,
        minutesPerSite: sw.minutesPerSite, stoppedBecause: sw.stoppedBecause,
        kwhAdded: sw.kwhAdded,
        sites: sw.visited,
      });
      continue;
    }

    const miles = milesFor[i] || 0;
    const driveH = timeFromDistance(miles, opts.avgMph);
    const billedKwh = miles * opts.battKwhPerMi * opts.chargeMultiplier;
    const energyH = billedKwh / opts.avgChargeKw;
    const onThisDay = visits.filter(v => !v.withMetro && v.alongMi > cursorMi && v.alongMi <= cursorMi + miles);
    const visitH = onThisDay.reduce((a, v) => a + v.hours, 0);
    const availableH = shape.budgetH - driveH - energyH - breakH - visitH;
    const { picked, hours, maxGapMi } = corridorCollect(corridor, cursorMi, cursorMi + miles, Math.max(0, availableH), opts);
    picked.forEach(s => { if (!collected.has(s.srcId)) collected.set(s.srcId, s); });

    days.push({
      n: i + 1, type: 'drive', shape: shape.kind,
      startMi: cursorMi, endMi: cursorMi + miles,
      miles: Math.round(miles), driveH: +driveH.toFixed(1),
      newSites: picked.filter(s => collected.get(s.srcId) === s).length || picked.length,
      totalDayH: +(driveH + energyH + breakH + hours + visitH).toFixed(1), budgetH: shape.budgetH,
      visits: onThisDay.map(v => v.name), visitH,
      maxGapMi: maxGapMi != null ? Math.round(maxGapMi) : null,
      rangeRisk: maxGapMi != null && maxGapMi > opts.usableRangeMi,
      billedKwh,
      sites: picked,
    });
    cursorMi += miles;
  }

  const totalMi = days.reduce((a, d) => a + d.miles, 0);
  const totalBilled = days.reduce((a, d) => a + (d.billedKwh || (d.kwhAdded || 0)), 0);

  return {
    id: cfg.id, label: cfg.label, note: cfg.note,
    routeMi: route.distanceMi,
    totalMi,
    newSites: collected.size,
    shortfallMi, visitsConverged: converged,
    sweepDays: days.filter(d => d.type === 'sweep').length,
    driveDays: days.filter(d => d.type === 'drive').length,
    overBudgetDays: days.filter(d => d.totalDayH > d.budgetH + 0.05).length,
    billedKwh: totalBilled,
    days,
    collected: [...collected.values()],
    geometry: route.geometry,
    opts,
  };
}

module.exports = { buildPlan };

// Scenario analyzer: corridor site pool -> day split -> feasible unique-site count
// -> time and cost. Every number here is an estimate from the stated assumptions;
// nothing is a booking, a quote, or a Tesla-confirmed contest result.
const { load } = require('./catalog');
const { routeLegs, timeFromDistance } = require('./route');
const { decodePolyline, thinWithCumulative, nearestOnLine } = require('./geo');

// Tuned for a 2023 Tesla Model Y Long Range AWD (from the VIN, position 10
// = P = 2023). Trim assumed Long Range; correct battKwhPerMi/usableRangeMi for RWD
// or Performance. Driving caps come from the owner: 11 h on a push day, no 2nd driver.
const DEFAULTS = {
  corridorMi: 10,         // max offset from the route line to count a site as on-corridor
  minSpacingMi: 8,        // min distance between two stops we count as separate real sessions
  avgMph: 63,             // planning average moving speed (editable); OSRM duration is slower
  dayBudgetH: 12,         // ordinary day: driving + charging + breaks, elapsed
  maxDriveH: 8,           // ordinary day driving cap
  pushBudgetH: 14.5,      // first and last day, when the plan is to get out / get home
  pushStartHour: 6,
  normalStartHour: 7,
  eveningStartHour: 17,   // out of the driveway once the kids are out of school
  eveningDriveH: 4.5,     // Friday evening: road time before a sensible hotel arrival
  eveningBudgetH: 5.5,    // 17:00 to about 22:30 including charging stops
  pushDriveH: 11,         // owner-stated maximum driving hours, push days only
  battKwhPerMi: 0.34,     // Model Y LR at the wheels, winter highway, loaded, 3 occupants
  chargeMultiplier: 1.12, // billed kWh / battery kWh (charging + thermal losses)
  avgChargeKw: 100,       // realistic sustained average on a 250 kW V3 from a low SOC
  usableRangeMi: 180,     // conservative miles between stops, cold weather, loaded car
  stopOverheadMin: 10,    // exit, park, plug, unplug, re-enter - excluding energy time
  detourMph: 32,          // speed on surface streets to and from a site
  breakMinPerDay: 30,     // non-charging break time; kids are 8 and 13, few stops needed
  pricePerKwhLow: 0.40,
  pricePerKwhHigh: 0.55,
  hotelLow: 130,
  hotelHigh: 170,
  foodPerDayLow: 60,
  foodPerDayHigh: 80,
  miscLow: 100,
  miscHigh: 200,
  contingency: 0.15,
  minSessionKwh: 3,       // what counts as a real session in a metro sweep - UNCONFIRMED by Tesla
  usableKwh: 75,          // 2023 Model Y LR usable pack
  countThirdParty: false,  // see analyzeScenario: non-Tesla-operated sites do not score by default
};

function buildPool(geometry, sites, opts) {
  const line = thinWithCumulative(decodePolyline(geometry), 1.0);
  const pool = [];
  for (const s of sites) {
    const hit = nearestOnLine(s.lat, s.lon, line.pts, opts.corridorMi);
    if (hit) pool.push({ ...s, offRouteMi: hit.distMi, alongMi: hit.alongMi });
  }
  pool.sort((a, b) => a.alongMi - b.alongMi);
  return { pool, lineMi: line.totalMi };
}

// Keep sites far enough apart that each stop is a plausible real charging session.
function spaceOut(pool, minSpacingMi) {
  const kept = [];
  let last = -Infinity;
  for (const s of pool) {
    if (s.alongMi - last >= minSpacingMi) { kept.push(s); last = s.alongMi; }
  }
  return kept;
}

// Day shapes. An evening day is a partial start - out of the driveway after school,
// a few hours of road, then a hotel. A push day is the long one at each end.
const DAY_SHAPES = {
  evening: opts => ({
    kind: 'evening', isPush: false, isEvening: true,
    driveCapH: opts.eveningDriveH, budgetH: opts.eveningBudgetH, startHour: opts.eveningStartHour,
  }),
  // A push day that follows a late evening arrival: same distance ambition, later
  // start and a shorter window, so the night before is not cut to seven hours.
  pushLate: opts => ({
    kind: 'pushLate', isPush: true, isEvening: false,
    driveCapH: opts.pushDriveH, budgetH: opts.pushBudgetH - 1.5, startHour: opts.normalStartHour,
  }),
  push: opts => ({
    kind: 'push', isPush: true, isEvening: false,
    driveCapH: opts.pushDriveH, budgetH: opts.pushBudgetH, startHour: opts.pushStartHour,
  }),
  normal: opts => ({
    kind: 'normal', isPush: false, isEvening: false,
    driveCapH: opts.maxDriveH, budgetH: opts.dayBudgetH, startHour: opts.normalStartHour,
  }),
};

// `shapes` is an explicit list like ['evening','push','normal',...,'push'].
// Without one, the first and last day are push days and the rest are ordinary.
function dayProfile(index, dayCount, opts, shapes) {
  if (shapes && shapes[index]) return DAY_SHAPES[shapes[index]](opts);
  const isPush = index === 0 || index === dayCount - 1;
  return DAY_SHAPES[isPush ? 'push' : 'normal'](opts);
}

// Share `miles` across `count` consecutive days by how much driving time each has.
function shareSegment(miles, profiles, opts, seeOnLast) {
  const breakH = opts.breakMinPerDay / 60;
  const capMi = profiles.map(p => p.driveCapH * opts.avgMph);
  const weights = profiles.map((p, i) => {
    const see = (seeOnLast && i === profiles.length - 1) ? seeOnLast : 0;
    return Math.max(0.5, p.budgetH - see - breakH);
  });

  const out = profiles.map(() => 0);
  let pool = miles;
  const open = new Set(profiles.map((_, i) => i));
  for (let guard = 0; guard < profiles.length + 2 && pool > 0.5 && open.size; guard++) {
    const wSum = [...open].reduce((a, i) => a + weights[i], 0);
    let assigned = 0;
    const capped = [];
    for (const i of open) {
      const want = out[i] + pool * (weights[i] / wSum);
      if (want >= capMi[i] - 1e-9) { assigned += capMi[i] - out[i]; out[i] = capMi[i]; capped.push(i); }
      else { assigned += want - out[i]; out[i] = want; }
    }
    pool -= assigned;
    capped.forEach(i => open.delete(i));
    if (!capped.length) break;
  }
  return { miles: out, leftover: pool };
}

// Miles are shared in proportion to the time each day actually has for driving.
// A must-see stop ENDS a day: you arrive, see it, and sleep there. That removes the
// circular dependency between "which day is this on" and "how far does that day drive".
function splitDays(routeDistanceMi, opts, dayCount, anchors = [], shapes = null) {
  const profiles = Array.from({ length: dayCount }, (_, i) => dayProfile(i, dayCount, opts, shapes));

  // Build segments that each END at a must-see (last segment ends at the route end).
  const cuts = [...new Set(anchors.map(a => a.alongMi).filter(m => m > 20 && m < routeDistanceMi - 20))]
    .sort((x, y) => x - y);
  const bounds = [0, ...cuts, routeDistanceMi];
  const segMiles = bounds.slice(1).map((b, i) => b - bounds[i]);
  const segCount = segMiles.length;

  // Days per segment, proportional to miles, at least one each, largest remainder.
  let alloc = segMiles.map(m => Math.max(1, Math.floor(dayCount * m / routeDistanceMi)));
  let diff = dayCount - alloc.reduce((a, b) => a + b, 0);
  while (diff !== 0) {
    const order = segMiles.map((m, i) => ({ i, per: m / alloc[i] }))
      .sort((a, b) => diff > 0 ? b.per - a.per : a.per - b.per);
    const pick = order.find(o => diff > 0 || alloc[o.i] > 1);
    if (!pick) break;
    alloc[pick.i] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }

  const days = [];
  let dayIdx = 0, cursor = 0, leftoverTotal = 0;
  for (let s = 0; s < segCount; s++) {
    const profs = profiles.slice(dayIdx, dayIdx + alloc[s]);
    // Visit time for the must-see at the END of this segment (none for the last).
    const seeOnLast = s < cuts.length
      ? anchors.filter(a => Math.abs(a.alongMi - bounds[s + 1]) < 1).reduce((a, m) => a + m.hours, 0)
      : 0;
    const { miles, leftover } = shareSegment(segMiles[s], profs, opts, seeOnLast);
    leftoverTotal += leftover;
    miles.forEach((mi, k) => {
      days.push({ index: dayIdx + k, miles: mi, startMi: cursor, endMi: cursor + mi, ...profs[k] });
      cursor += mi;
    });
    dayIdx += alloc[s];
  }

  return { days, shortfallMi: leftoverTotal, perDayCap: Math.max(...profiles.map(p => p.driveCapH * opts.avgMph)) };
}

// Time cost of adding one stop: fixed overhead plus the out-and-back surface detour.
function stopCostH(site, opts) {
  return (opts.stopOverheadMin / 60) + (2 * site.offRouteMi / opts.detourMph);
}

// Choose the stop set for one day. Maximises NEW unique sites first, then minimises
// time spent, subject to: consecutive stops at least minSpacingMi apart (so each
// session is a plausible real charge), no gap longer than usableRangeMi (so the
// day is actually drivable), and the day fitting the elapsed-time budget.
//
// `candidates` is every open site on the corridor, not only the unvisited ones:
// an already-visited site is still a place you can charge, it just scores nothing.
// Without that distinction a corridor of familiar sites looks un-drivable.
function selectStops(candidates, day, opts, availableH) {
  const n = candidates.length;
  const R = opts.usableRangeMi;
  if (n === 0) return { chosen: [], costH: 0, rangeOk: day.miles <= R };

  const score = i => (candidates[i].isNew ? 1 : 0);

  // dp[i][k] = min stop-time to have k NEW sites with candidate i as the last stop.
  const NEG = Infinity;
  const dp = Array.from({ length: n }, () => new Float64Array(n + 2).fill(NEG));
  const prev = Array.from({ length: n }, () => new Int32Array(n + 2).fill(-2));

  for (let i = 0; i < n; i++) {
    // Can we reach candidate i from the start of the day on one charge?
    if (candidates[i].alongMi - day.startMi <= R) {
      const k0 = score(i);
      dp[i][k0] = stopCostH(candidates[i], opts);
      prev[i][k0] = -1;
    }
    for (let j = 0; j < i; j++) {
      const gap = candidates[i].alongMi - candidates[j].alongMi;
      if (gap < opts.minSpacingMi || gap > R) continue;
      for (let k = 0; k <= n; k++) {
        if (dp[j][k] === NEG) continue;
        const nk = k + score(i);
        const cand = dp[j][k] + stopCostH(candidates[i], opts);
        if (cand < dp[i][nk]) { dp[i][nk] = cand; prev[i][nk] = j; }
      }
    }
  }

  // Two separate questions, reported separately so a failure says which one broke:
  //  cheapest  - is ANY drivable chain of stops available, at any time cost?
  //  best      - is there one that also fits the remaining time in the day?
  let best = { k: -1, i: -1, cost: 0 };
  let cheapest = { k: 0, i: -1, cost: Infinity };
  for (let i = 0; i < n; i++) {
    if (day.endMi - candidates[i].alongMi > R) continue; // must reach the overnight
    for (let k = 0; k <= n; k++) {
      if (dp[i][k] === NEG) continue;
      if (dp[i][k] < cheapest.cost) cheapest = { k, i, cost: dp[i][k] };
      if (dp[i][k] > availableH) continue;
      if (k > best.k || (k === best.k && dp[i][k] < best.cost)) best = { k, i, cost: dp[i][k] };
    }
  }

  const trace = pick => {
    const out = [];
    let i = pick.i, k = pick.k;
    while (i >= 0) {
      out.push(candidates[i]);
      const p = prev[i][k];
      k -= (candidates[i].isNew ? 1 : 0);
      i = p;
    }
    return out.reverse();
  };

  // No drivable chain at all: the corridor cannot cover this day on one charge each hop.
  if (cheapest.i < 0) return { chosen: [], costH: 0, rangeOk: false, minChainH: null };
  // Drivable, but the minimum viable set of stops will not fit the day budget.
  if (best.i < 0) {
    return { chosen: trace(cheapest), costH: cheapest.cost, rangeOk: true, minChainH: cheapest.cost, overBudgetChain: true };
  }
  return { chosen: trace(best), costH: best.cost, rangeOk: true, minChainH: cheapest.cost };
}

function analyzeDay(day, pool, opts, mustSee = []) {
  const budgetH = day.budgetH != null ? day.budgetH : opts.dayBudgetH;
  const driveCapH = day.driveCapH != null ? day.driveCapH : opts.maxDriveH;

  const driveH = timeFromDistance(day.miles, opts.avgMph);
  const battKwh = day.miles * opts.battKwhPerMi;
  const billedKwh = battKwh * opts.chargeMultiplier;
  const energyH = billedKwh / opts.avgChargeKw;   // roughly fixed regardless of stop count
  const breakH = opts.breakMinPerDay / 60;

  // Sightseeing that falls inside this day's stretch of road.
  // A must-see now sits exactly on the day boundary that ends its day.
  const stopsToSee = mustSee.filter(m => m.alongMi > day.startMi && m.alongMi <= day.endMi + 1);
  const seeH = stopsToSee.reduce((a, m) => a + m.hours, 0);

  const candidates = pool.filter(s => s.alongMi >= day.startMi && s.alongMi < day.endMi);
  const availableH = budgetH - driveH - energyH - breakH - seeH;
  const sel = selectStops(candidates, day, opts, Math.max(0, availableH));
  const { chosen, costH, rangeOk, overBudgetChain } = sel;

  const requiredStops = Math.max(1, Math.ceil(day.miles / opts.usableRangeMi));
  const totalH = driveH + energyH + breakH + seeH + costH;
  const detourMi = chosen.reduce((a, s) => a + 2 * s.offRouteMi, 0);

  return {
    ...day,
    driveH, energyH, breakH, seeH,
    mustSee: stopsToSee.map(m => m.name),
    budgetH, driveCapH,
    requiredStops,
    poolCount: candidates.length,
    newPoolCount: candidates.filter(s => s.isNew).length,
    stops: chosen.length,
    newSites: chosen.filter(s => s.isNew).length,
    repeatStops: chosen.filter(s => !s.isNew).length,
    extraStops: Math.max(0, chosen.length - requiredStops),
    stopTimeH: costH,
    totalDayH: totalH,
    overBudget: totalH > budgetH + 0.05,
    overDriveCap: driveH > driveCapH + 0.02,
    rangeInfeasible: !rangeOk,
    // Drivable, but even the minimum set of charging stops busts the day budget.
    chargingWontFit: !!overBudgetChain,
    minChainH: sel.minChainH,
    billedKwh, detourMi,
    sites: chosen.filter(s => s.isNew),   // only new sites score
    allStops: chosen,
  };
}

// Cost ranges. billedKwh already includes charging losses, so no second multiplier.
// Lodging assumes a paid hotel every night but the last day; family lodging is not assumed.
function costModel(billedKwh, travelDays, opts) {
  const hotelNights = Math.max(0, travelDays - 1);
  const c = {
    hotelNights,
    chargingLow: billedKwh * opts.pricePerKwhLow,
    chargingHigh: billedKwh * opts.pricePerKwhHigh,
    hotelLow: hotelNights * opts.hotelLow,
    hotelHigh: hotelNights * opts.hotelHigh,
    foodLow: travelDays * opts.foodPerDayLow,
    foodHigh: travelDays * opts.foodPerDayHigh,
    miscLow: opts.miscLow,
    miscHigh: opts.miscHigh,
  };
  const subLow = c.chargingLow + c.hotelLow + c.foodLow + c.miscLow;
  const subHigh = c.chargingHigh + c.hotelHigh + c.foodHigh + c.miscHigh;
  c.totalLow = subLow * (1 + opts.contingency);
  c.totalHigh = subHigh * (1 + opts.contingency);
  return c;
}

async function analyzeScenario(cfg) {
  const opts = { ...DEFAULTS, ...(cfg.opts || {}) };
  const { sites, meta } = load({ country: 'USA', statuses: ['OPEN'] });

  // Every open site stays in the pool so range checks and charging stay realistic.
  // `isNew` is what scores: a site already in the charging history earns nothing.
  //
  // A bracketed prefix in the catalog name marks a site operated by someone other
  // than Tesla (Francis Energy, Victron and similar run Tesla-built hardware). Those
  // are chargeable but do NOT score by default, because whether Tesla's app treats
  // them as distinct Supercharger sites is unconfirmed. Set opts.countThirdParty
  // to true to include them, and compare the two totals.
  const visitedSrc = new Set(cfg.visitedSrcIds || []);
  const visitedLoc = new Set(cfg.visitedLocationIds || []);
  const flagged = sites.map(s => {
    const isThirdParty = /^\s*\[/.test(s.name);
    const unvisited = !visitedSrc.has(s.srcId) && !(s.locationId && visitedLoc.has(s.locationId));
    return {
      ...s,
      isThirdParty,
      isNew: unvisited && (opts.countThirdParty ? true : !isThirdParty),
    };
  });

  const route = await routeLegs(cfg.waypoints);
  const { pool } = buildPool(route.geometry, flagged, opts);

  // The same site can fall near an out-and-back corridor twice; count it once.
  const seen = new Set();
  const uniquePool = pool.filter(s => {
    if (seen.has(s.srcId)) return false;
    seen.add(s.srcId);
    return true;
  });
  const spaced = spaceOut(uniquePool, opts.minSpacingMi);

  // Locate each must-see stop along this route so its visit time lands on the right day.
  const line = thinWithCumulative(decodePolyline(route.geometry), 1.0);
  const mustSee = (cfg.mustSee || []).map(m => {
    const hit = nearestOnLine(m.lat, m.lon, line.pts, 60);
    return hit ? { ...m, alongMi: hit.alongMi, offRouteMi: hit.distMi } : { ...m, alongMi: null };
  }).filter(m => m.alongMi != null);

  const { days, shortfallMi, perDayCap } = splitDays(route.distanceMi, opts, cfg.travelDays, mustSee, cfg.dayShapes);
  // Spacing is enforced inside the day optimiser, so it gets the full corridor pool.
  const dayResults = days.map(d => analyzeDay(d, uniquePool, opts, mustSee));

  const collected = new Map();
  dayResults.forEach(d => d.sites.forEach(s => collected.set(s.srcId, s)));

  const totalBilledKwh = dayResults.reduce((a, d) => a + d.billedKwh, 0);
  const totalDetourMi = dayResults.reduce((a, d) => a + d.detourMi, 0);
  const totalSeeH = dayResults.reduce((a, d) => a + d.seeH, 0);
  const totalDriveH = dayResults.reduce((a, d) => a + d.driveH, 0);
  const totalDayH = dayResults.reduce((a, d) => a + d.totalDayH, 0);
  const totalChargeH = dayResults.reduce((a, d) => a + d.energyH + d.stopTimeH, 0);

  const cost = costModel(totalBilledKwh, cfg.travelDays, opts);
  const hotelNights = cost.hotelNights;

  return {
    id: cfg.id, label: cfg.label, group: cfg.group, note: cfg.note,
    waypoints: cfg.waypoints, travelDays: cfg.travelDays,
    routeMi: route.distanceMi,
    shortfallMi,
    perDayCapMi: perDayCap,
    totalMiWithDetours: route.distanceMi + totalDetourMi,
    osrmHours: route.osrmHours,
    driveH: totalDriveH, chargeH: totalChargeH, totalDayH, seeH: totalSeeH,
    mustSee,
    pushDays: dayResults.filter(d => d.isPush).length,
    poolAll: uniquePool.length,
    poolSpaced: spaced.length,
    sitesCollected: collected.size,
    sitesPerDriveHour: collected.size / totalDriveH,
    billedKwh: totalBilledKwh,
    detourMi: totalDetourMi,
    hotelNights,
    cost,
    costPerSiteLow: cost.totalLow / Math.max(1, collected.size),
    costPerSiteHigh: cost.totalHigh / Math.max(1, collected.size),
    days: dayResults,
    collectedSites: [...collected.values()],
    allPool: uniquePool,
    geometry: route.geometry,
    provider: route.provider,
    catalogMeta: meta,
    opts,
    infeasibleDays: dayResults.filter(d => d.overBudget || d.overDriveCap || d.rangeInfeasible || d.chargingWontFit).length,
  };
}

module.exports = { analyzeScenario, analyzeDay, selectStops, costModel, buildPool, DEFAULTS };

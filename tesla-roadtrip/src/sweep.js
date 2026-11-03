// Models sweeping a dense cluster: visiting many sites in a metro rather than
// passing a few on a corridor.
//
// The limit here is NOT time. In a cluster the sites are a few miles apart, so you
// consume almost no energy between them, and the battery fills up. Once it is full
// you cannot take a meaningful charge, and a plug-in that adds nothing is not a
// charging session. So the real cap is:
//
//     sessions <= (battery headroom + energy burned driving) / minimum session size
//
// `minSessionKwh` is therefore the single most important assumption in this file,
// and Tesla has not published a minimum. It is a parameter, not a fact.
const { haversine } = require('./geo');

const SWEEP_DEFAULTS = {
  metroMph: 25,           // surface streets between metro sites
  roadFactor: 1.32,       // straight-line -> road distance in a city grid
  stopOverheadMin: 8,     // park, walk, plug, unplug, exit, back on the road
  minSessionKwh: 3,       // what we are willing to call a real session - UNCONFIRMED
  rampMin: 1.2,           // handshake and ramp before meaningful power flows
  effectiveKw: 100,       // average power for a short low-SOC top-up
  usableKwh: 75,          // 2023 Model Y Long Range usable pack
  socStart: 0.15,         // arrive at the cluster deliberately low
  socCeil: 0.92,          // above this, charging is too slow to be worth a stop
  battKwhPerMi: 0.30,     // city driving, lower than highway
};

// Nearest-neighbour tour. Kept for comparison; it is the wrong objective in a
// cluster that is energy-bound rather than time-bound.
function tour(sites, fromLat, fromLon) {
  const left = sites.slice();
  const out = [];
  let lat = fromLat, lon = fromLon;
  while (left.length) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = haversine(lat, lon, left[i].lat, left[i].lon);
      if (d < bd) { bd = d; bi = i; }
    }
    const next = left.splice(bi, 1)[0];
    out.push({ site: next, legMi: bd });
    lat = next.lat; lon = next.lon;
  }
  return out;
}

// Energy-aware sweep. At each step, work out how much charge must be burned before
// another real session is possible, and pick the NEAREST site that is at least that
// far away. When the pack has room, this behaves like nearest-neighbour; when the
// pack is filling up, it deliberately takes a longer hop to make room.
function sweepCluster(sites, entry, budgetH, optsIn = {}) {
  const o = { ...SWEEP_DEFAULTS, ...optsIn };

  let hours = 0, miles = 0, kwhAdded = 0;
  let charge = o.usableKwh * o.socStart;
  const ceiling = o.usableKwh * o.socCeil;
  const visited = [];
  const left = sites.slice();
  let lat = entry.lat, lon = entry.lon;
  let stoppedBecause = 'ran out of sites';

  while (left.length) {
    // Energy that must be burned to open up room for a full session.
    const headroomNow = ceiling - charge;
    const needBurn = Math.max(0, o.minSessionKwh - headroomNow);
    const needMi = needBurn / o.battKwhPerMi;

    // Nearest site at least `needMi` away; if none qualifies, take the farthest.
    let pick = -1, pickMi = Infinity, farI = -1, farMi = -1;
    for (let i = 0; i < left.length; i++) {
      const roadMi = haversine(lat, lon, left[i].lat, left[i].lon) * o.roadFactor;
      if (roadMi > farMi) { farMi = roadMi; farI = i; }
      if (roadMi >= needMi && roadMi < pickMi) { pickMi = roadMi; pick = i; }
    }
    if (pick < 0) { pick = farI; pickMi = farMi; }

    const roadMi = pickMi;
    const driveH = roadMi / o.metroMph;
    const burn = roadMi * o.battKwhPerMi;
    const headroomAfterDrive = ceiling - (charge - burn);

    if (headroomAfterDrive < o.minSessionKwh) {
      stoppedBecause = 'battery too full for another real session';
      break;
    }

    const addKwh = Math.min(o.minSessionKwh, headroomAfterDrive);
    const sessionH = o.rampMin / 60 + addKwh / o.effectiveKw;
    const stepH = driveH + o.stopOverheadMin / 60 + sessionH;

    if (hours + stepH > budgetH) { stoppedBecause = 'ran out of time'; break; }

    hours += stepH;
    miles += roadMi;
    charge = charge - burn + addKwh;
    kwhAdded += addKwh;
    const site = left.splice(pick, 1)[0];
    lat = site.lat; lon = site.lon;
    visited.push({ ...site, legMi: +roadMi.toFixed(1), addKwh: +addKwh.toFixed(1) });
  }

  return {
    visited,
    count: visited.length,
    hours: +hours.toFixed(2),
    miles: +miles.toFixed(1),
    kwhAdded: +kwhAdded.toFixed(1),
    endSoc: +(charge / o.usableKwh).toFixed(2),
    minutesPerSite: visited.length ? +(hours * 60 / visited.length).toFixed(1) : null,
    stoppedBecause,
    opts: o,
  };
}

// How many sites a cluster can yield per day, and what binds first.
function sweepCurve(sites, entry, budgetH, minSessions = [1, 2, 3, 5, 8, 12]) {
  return minSessions.map(m => {
    const r = sweepCluster(sites, entry, budgetH, { minSessionKwh: m });
    return { minSessionKwh: m, count: r.count, hours: r.hours, miles: r.miles, bound: r.stoppedBecause };
  });
}

module.exports = { sweepCluster, sweepCurve, tour, SWEEP_DEFAULTS };

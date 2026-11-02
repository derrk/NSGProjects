// Turns an analyzed scenario into a drivable schedule: clock times, overnight towns,
// streak margins and navigation links. Times are planning estimates, not promises.
const { haversine } = require('./geo');

// Timezone by state, which is right for every state on these routes. Longitude alone
// gets Oklahoma and Indiana wrong, so it is used only inside the states that genuinely
// split. States not listed fall back to longitude and are reported as uncertain.
const STATE_ZONE = {
  // Eastern
  GA: 'Eastern', SC: 'Eastern', NC: 'Eastern', VA: 'Eastern', WV: 'Eastern',
  MD: 'Eastern', DE: 'Eastern', PA: 'Eastern', NJ: 'Eastern', NY: 'Eastern',
  CT: 'Eastern', RI: 'Eastern', MA: 'Eastern', VT: 'Eastern', NH: 'Eastern',
  ME: 'Eastern', OH: 'Eastern', MI: 'Eastern', IN: 'Eastern', DC: 'Eastern',
  // Central
  TX: 'Central', OK: 'Central', MO: 'Central', AR: 'Central', LA: 'Central',
  MS: 'Central', AL: 'Central', IL: 'Central', WI: 'Central', MN: 'Central',
  IA: 'Central', KS: 'Central', NE: 'Central',
  // Mountain / Pacific
  NM: 'Mountain', CO: 'Mountain', UT: 'Mountain', WY: 'Mountain', MT: 'Mountain',
  AZ: 'Mountain', NV: 'Pacific', CA: 'Pacific', OR: 'Pacific', WA: 'Pacific',
};
const OFFSETS = { Eastern: -5, Central: -6, Mountain: -7, Pacific: -8 };

function zoneFor(lon, state) {
  // Florida splits at the Apalachicola River; the western panhandle is Central.
  if (state === 'FL') {
    const name = lon < -85.0 ? 'Central' : 'Eastern';
    return { name, offset: OFFSETS[name], certain: true };
  }
  // Tennessee and Kentucky split roughly north-south; flag rather than assert.
  if (state === 'TN' || state === 'KY') {
    const name = lon < -85.5 ? 'Central' : 'Eastern';
    return { name, offset: OFFSETS[name], certain: false };
  }
  if (STATE_ZONE[state]) {
    const name = STATE_ZONE[state];
    return { name, offset: OFFSETS[name], certain: true };
  }
  const name = lon > -82.5 ? 'Eastern' : lon > -97.5 ? 'Central' : lon > -114 ? 'Mountain' : 'Pacific';
  return { name, offset: OFFSETS[name], certain: false };
}

const hhmm = h => {
  const t = ((h % 24) + 24) % 24;
  const H = Math.floor(t);
  const M = Math.round((t - H) * 60);
  const H2 = M === 60 ? H + 1 : H;
  const M2 = M === 60 ? 0 : M;
  return String(H2 % 24).padStart(2, '0') + ':' + String(M2).padStart(2, '0');
};

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function dateLabel(startISO, offsetDays) {
  const d = new Date(startISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return WD[d.getUTCDay()] + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCDate();
}

function buildItinerary(scenario, opts, startDate = '2026-11-21') {
  const days = [];
  // Elapsed hours since the start of the trip, used for streak maths because it is
  // immune to timezone changes.
  let elapsed = 0;
  let prevNewSiteElapsed = null;
  let maxGapH = 0, maxGapWhere = null;
  const streakPoints = [];

  scenario.days.forEach((d, di) => {
    const startHour = d.startHour != null ? d.startHour
      : (d.isPush ? opts.pushStartHour : opts.normalStartHour);
    // Each morning begins at the local start hour; the gap from yesterday's finish
    // is real rest time and is what the overnight streak gap is measured against.
    if (di > 0) {
      const prevEnd = days[di - 1].endClock;
      const restH = (24 - prevEnd) + startHour;
      elapsed += restH;
    }

    let clock = startHour;
    const stops = [];
    const dayStops = d.allStops || d.sites;
    // Energy time is shared across stops in proportion to the leg each one feeds.
    const legs = dayStops.map((s, i) => {
      const next = i + 1 < dayStops.length ? dayStops[i + 1].alongMi : d.endMi;
      return Math.max(5, next - s.alongMi);
    });
    const legSum = legs.reduce((a, b) => a + b, 0) || 1;

    let cursorMi = d.startMi;
    dayStops.forEach((s, i) => {
      const driveMi = Math.max(0, s.alongMi - cursorMi);
      const driveH = driveMi / opts.avgMph + (s.offRouteMi / opts.detourMph);
      clock += driveH; elapsed += driveH;

      const chargeH = (d.energyH * legs[i] / legSum);
      const dwellH = opts.stopOverheadMin / 60 + chargeH + (s.offRouteMi / opts.detourMph);

      stops.push({
        name: s.name, city: s.city, state: s.state,
        lat: s.lat, lon: s.lon,
        isNew: !!s.isNew, isThirdParty: !!s.isThirdParty,
        stalls: s.stalls, kw: s.powerKw,
        offRouteMi: +s.offRouteMi.toFixed(1),
        arrive: hhmm(clock),
        dwellMin: Math.round(dwellH * 60),
        depart: hhmm(clock + dwellH),
      });

      if (s.isNew) {
        if (prevNewSiteElapsed !== null) {
          const gap = elapsed - prevNewSiteElapsed;
          if (gap > maxGapH) { maxGapH = gap; maxGapWhere = `${stops[stops.length - 1].name} (day ${di + 1})`; }
        }
        prevNewSiteElapsed = elapsed;
        streakPoints.push({ day: di + 1, name: s.name, elapsedH: +elapsed.toFixed(2) });
      }

      clock += dwellH; elapsed += dwellH;
      cursorMi = s.alongMi;
    });

    // Remaining drive to the overnight point.
    const tailMi = Math.max(0, d.endMi - cursorMi);
    const tailH = tailMi / opts.avgMph;
    clock += tailH; elapsed += tailH;

    // Sightseeing happens at the end of the day: arrive, see it, sleep.
    if (d.seeH > 0) { clock += d.seeH; elapsed += d.seeH; }
    // Non-charging break time for the day.
    clock += d.breakH; elapsed += d.breakH;

    // Hours actually spent, before any clock change. This is the honest day length.
    const workH = clock - startHour;

    // Crossing into a later zone moves the local clock forward. It costs no real
    // time, so `elapsed` and `workH` are untouched - only the local arrival shifts.
    const zPrev = di === 0 ? zoneFor(-98.49, 'TX') : days[di - 1].zone;
    const zNow = di === scenario.days.length - 1
      ? zoneFor(-98.49, 'TX')
      : (stops.length ? zoneFor(stops[stops.length - 1].lon, stops[stops.length - 1].state) : zPrev);
    clock += (zNow.offset - zPrev.offset);

    const last = stops[stops.length - 1];
    const isFinalDay = di === scenario.days.length - 1;
    const overnight = isFinalDay
      ? 'Home - Wichita Falls, TX'
      : (d.overnight ? d.overnight.label : (last ? `${last.city}, ${last.state}` : 'unknown'));

    // The day starts in whatever zone yesterday ended in; day 1 starts at home.
    const zStart = di === 0 ? zoneFor(-98.49, 'TX') : days[di - 1].zone;
    const zEnd = isFinalDay ? zoneFor(-98.49, 'TX') : (last ? zoneFor(last.lon, last.state) : zStart);

    days.push({
      n: di + 1,
      date: dateLabel(startDate, di),
      isPush: !!d.isPush,
      isEvening: !!d.isEvening,
      kind: d.kind || (d.isPush ? 'push' : 'normal'),
      miles: Math.round(d.miles),
      driveH: +d.driveH.toFixed(1),
      newSites: d.newSites,
      repeatStops: d.repeatStops,
      seeH: d.seeH,
      mustSee: d.mustSee,
      startClock: startHour,
      endClock: clock,
      depart: hhmm(startHour),
      arrive: hhmm(clock),
      dayLengthH: +workH.toFixed(1),          // hours actually spent
      clockSpanH: +(clock - startHour).toFixed(1), // includes any zone change
      overnight,
      isFinalDay,
      zone: zEnd,
      zoneFrom: zStart.name,
      zoneTo: zEnd.name,
      // Negative = clock jumps forward, the hour you lose heading east.
      zoneShiftH: zEnd.offset - zStart.offset,
      zoneCertain: zEnd.certain && zStart.certain,
      stops,
    });
  });

  return {
    days,
    streak: {
      newSiteCount: streakPoints.length,
      maxGapH: +maxGapH.toFixed(1),
      maxGapWhere,
      // The conservative buffer the brief asks for, not a Tesla rule.
      bufferH: 20,
      withinBuffer: maxGapH <= 20,
      within24: maxGapH <= 24,
    },
  };
}

// Google Maps accepts an origin, a destination and up to 23 waypoints, so a long day
// has to be split. Every stop is preserved across the batches; none is dropped.
function navLinks(day, maxWaypoints = 23) {
  const pts = day.stops.map(s => `${s.lat},${s.lon}`);
  if (!pts.length) return [];
  const batches = [];
  const perLink = maxWaypoints + 2;
  for (let i = 0; i < pts.length; i += perLink - 1) {
    const chunk = pts.slice(i, i + perLink);
    if (chunk.length < 2 && batches.length) {
      batches[batches.length - 1].push(chunk[0]);
      break;
    }
    batches.push(chunk);
  }
  return batches.map((b, i) => ({
    label: batches.length > 1 ? `Day ${day.n}, part ${i + 1} of ${batches.length}` : `Day ${day.n}`,
    stops: b.length,
    url: 'https://www.google.com/maps/dir/' + b.map(encodeURIComponent).join('/'),
  }));
}

module.exports = { buildItinerary, navLinks, zoneFor, hhmm };

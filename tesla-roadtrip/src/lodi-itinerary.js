// Turns the chosen Lodi plan into a drivable schedule: clock times, overnight
// towns, streak margins and navigation links. Handles both day types, since a
// sweep day is paced completely differently from a driving day.
const fs = require('fs');
const path = require('path');
const { load } = require('./catalog');
const { haversine } = require('./geo');
const { zoneFor, hhmm, navLinks } = require('./itinerary');

const ROOT = path.join(__dirname, '..');
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dateLabel(startISO, offset) {
  const d = new Date(startISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return WD[d.getUTCDay()] + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCDate();
}

const START_HOUR = { evening: 17, push: 6, pushLate: 7, normal: 7 };

function build(plan, optionId, startDate) {
  const o = plan.options.find(x => x.id === optionId);
  const opts = o.assumptions;
  const { sites } = load({ country: 'USA', statuses: ['OPEN'] });

  const days = [];
  let elapsed = 0, prevNewElapsed = null, maxGapH = 0, maxGapWhere = null;

  o.days.forEach((d, di) => {
    const startHour = START_HOUR[d.shape] != null ? START_HOUR[d.shape] : 7;
    if (di > 0) {
      const prevEnd = days[di - 1].endClock;
      elapsed += (24 - prevEnd) + startHour;      // overnight rest, real hours
    }

    let clock = startHour;
    const stops = [];

    if (d.type === 'sweep') {
      // Metro pace: short hop, short session, repeat.
      d.stops.forEach(s => {
        const legMi = s.legMi != null ? s.legMi : 3;
        const driveH = legMi / 25;
        clock += driveH; elapsed += driveH;
        const addKwh = s.addKwh != null ? s.addKwh : opts.minSessionKwh;
        const dwellH = 8 / 60 + 1.2 / 60 + addKwh / 100;
        stops.push({
          name: s.name, city: s.city, state: s.state, lat: s.lat, lon: s.lon,
          stalls: s.stalls, kw: s.kw, arrive: hhmm(clock),
          dwellMin: Math.round(dwellH * 60), depart: hhmm(clock + dwellH),
          legMi: +legMi.toFixed(1), addKwh: +addKwh.toFixed(1),
        });
        if (prevNewElapsed !== null) {
          const gap = elapsed - prevNewElapsed;
          if (gap > maxGapH) { maxGapH = gap; maxGapWhere = `${s.name} (day ${di + 1})`; }
        }
        prevNewElapsed = elapsed;
        clock += dwellH; elapsed += dwellH;
      });
    } else {
      // Highway pace: energy time shared across the day's stops by the leg each feeds.
      const legs = d.stops.map((s, i) => {
        const next = i + 1 < d.stops.length ? d.stops[i + 1].alongMi : d.endMi;
        return Math.max(5, next - s.alongMi);
      });
      const legSum = legs.reduce((a, b) => a + b, 0) || 1;
      const billedKwh = d.miles * 0.34 * 1.12;
      const energyH = billedKwh / 100;
      let cursor = d.startMi;

      d.stops.forEach((s, i) => {
        const driveMi = Math.max(0, s.alongMi - cursor);
        const driveH = driveMi / opts.avgMph + (s.offRouteMi || 0) / 32;
        clock += driveH; elapsed += driveH;
        const dwellH = 10 / 60 + energyH * legs[i] / legSum + (s.offRouteMi || 0) / 32;
        stops.push({
          name: s.name, city: s.city, state: s.state, lat: s.lat, lon: s.lon,
          stalls: s.stalls, kw: s.kw, arrive: hhmm(clock),
          dwellMin: Math.round(dwellH * 60), depart: hhmm(clock + dwellH),
          offRouteMi: s.offRouteMi,
        });
        if (prevNewElapsed !== null) {
          const gap = elapsed - prevNewElapsed;
          if (gap > maxGapH) { maxGapH = gap; maxGapWhere = `${s.name} (day ${di + 1})`; }
        }
        prevNewElapsed = elapsed;
        clock += dwellH; elapsed += dwellH;
        cursor = s.alongMi;
      });

      const tailH = Math.max(0, d.endMi - cursor) / opts.avgMph;
      clock += tailH; elapsed += tailH;
    }

    if (d.visitH) { clock += d.visitH; elapsed += d.visitH; }
    clock += 0.5;  // the day's non-charging break
    elapsed += 0.5;

    const workH = clock - startHour;

    // Overnight: for a sweep day, in the metro; otherwise the nearest town to the
    // end of the day's driving.
    const last = stops[stops.length - 1];
    let overnight;
    if (di === o.days.length - 1) overnight = 'Home - Wichita Falls, TX';
    else if (d.type === 'sweep') overnight = d.metro;
    else if (last) overnight = `${last.city}, ${last.state}`;
    else overnight = 'unknown';

    const zPrev = di === 0 ? zoneFor(-98.49, 'TX') : days[di - 1].zone;
    const zNow = di === o.days.length - 1 ? zoneFor(-98.49, 'TX')
      : (last ? zoneFor(last.lon, last.state) : zPrev);
    clock += (zNow.offset - zPrev.offset);

    days.push({
      n: d.n, date: dateLabel(startDate, di), type: d.type, shape: d.shape,
      metro: d.metro || null, visits: d.visits || [], visitH: d.visitH || 0,
      miles: d.miles, driveH: d.driveH, newSites: d.newSites,
      depart: hhmm(startHour), arrive: hhmm(clock),
      dayLengthH: +workH.toFixed(1), budgetH: d.budgetH,
      startClock: startHour, endClock: clock,
      overnight, zone: zNow, zoneFrom: zPrev.name, zoneTo: zNow.name,
      zoneShiftH: zNow.offset - zPrev.offset,
      minutesPerSite: d.minutesPerSite || null,
      stops,
    });
  });

  const lodgingPath = path.join(ROOT, 'data', 'lodging-lodi.json');
  const lodging = fs.existsSync(lodgingPath) ? JSON.parse(fs.readFileSync(lodgingPath, 'utf8')) : null;
  days.forEach(d => { d.nav = navLinks(d); });

  return {
    optionId, label: o.label, startDate, lodging,
    newSites: o.newSites, routeMi: o.routeMi, totalMi: o.totalMi,
    cost: o.cost, sweepDays: o.sweepDays,
    streak: {
      newSiteCount: o.newSites,
      maxGapH: +maxGapH.toFixed(1),
      maxGapWhere,
      within24: maxGapH <= 24,
      withinBuffer: maxGapH <= 20,
    },
    days,
  };
}

if (require.main === module) {
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'results', 'lodi-plan.json'), 'utf8'));
  const it = build(plan, process.argv[2] || 'canyon', '2026-11-20');
  fs.writeFileSync(path.join(ROOT, 'results', 'lodi-itinerary.json'), JSON.stringify(it, null, 1));
  console.log(`${it.label}: ${it.newSites} sites, max streak gap ${it.streak.maxGapH} h${it.streak.withinBuffer ? '' : '  <-- OVER 20 h'}`);
  it.days.forEach(d => console.log(
    `  ${String(d.n).padStart(2)} ${d.date.padEnd(11)}${d.type === 'sweep' ? 'SWEEP ' : '      '}` +
    `${d.depart}-${d.arrive} ${String(d.dayLengthH).padStart(5)}h ${String(d.miles).padStart(4)}mi ` +
    `+${String(d.newSites).padStart(2)} -> ${d.overnight}` +
    (d.zoneShiftH ? `  [${d.zoneFrom}->${d.zoneTo}]` : '') +
    (d.visits.length ? `  visit: ${d.visits.join(', ')}` : '')));
  console.log('wrote results/lodi-itinerary.json');
}

module.exports = { build };

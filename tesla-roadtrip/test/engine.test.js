// Focused tests on the pieces that produce numbers: geometry, the per-day stop
// optimiser constraints, dedupe, and the cost arithmetic.
const test = require('node:test');
const assert = require('node:assert');
const { haversine, decodePolyline, thinWithCumulative, nearestOnLine } = require('../src/geo');
const { analyzeDay, selectStops, DEFAULTS, costModel } = require('../src/analyze');

test('haversine matches a known distance (LAX to JFK ~2470 statute mi)', () => {
  const d = haversine(33.9416, -118.4085, 40.6413, -73.7781);
  assert.ok(Math.abs(d - 2470) < 15, `got ${d}`);
});

test('polyline decode returns the encoded coordinates', () => {
  // Standard reference polyline from the Google/OSRM encoding spec.
  const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.strictEqual(pts.length, 3);
  assert.ok(Math.abs(pts[0][0] - 38.5) < 1e-5);
  assert.ok(Math.abs(pts[0][1] - (-120.2)) < 1e-5);
  assert.ok(Math.abs(pts[2][1] - (-126.453)) < 1e-5);
});

test('thinWithCumulative keeps endpoints and accumulates real distance', () => {
  const pts = [[35, -100], [35, -99], [35, -98]];
  const { pts: kept, totalMi } = thinWithCumulative(pts, 1.0);
  assert.strictEqual(kept[0].cum, 0);
  assert.ok(Math.abs(totalMi - haversine(35, -100, 35, -98)) < 0.01);
  assert.ok(Math.abs(kept[kept.length - 1].cum - totalMi) < 0.01);
});

test('nearestOnLine rejects sites beyond the corridor width', () => {
  // thinWithCumulative samples an existing line, it does not interpolate, so build
  // a dense one the way a real routing geometry arrives (OSRM gives ~34 pts/mile).
  const dense = [];
  for (let i = 0; i <= 200; i++) dense.push([35, -100 + i * 0.01]);
  const line = thinWithCumulative(dense, 1.0).pts;
  const near = nearestOnLine(35.01, -99, line, 5);
  assert.ok(near, 'site ~0.7 mi off the line should match');
  assert.ok(near.distMi < 1.0, `expected under 1 mi, got ${near.distMi}`);
  assert.strictEqual(nearestOnLine(36.0, -99, line, 5), null); // ~69 mi off
});

// ---- per-day optimiser constraints ----

const mkDay = (startMi, miles) => ({ index: 0, startMi, endMi: startMi + miles, miles });
const mkSites = positions => positions.map((alongMi, i) => ({
  srcId: i, locationId: `site-${i}`, name: `Site ${i}`, alongMi, offRouteMi: 1, lat: 0, lon: 0,
}));

test('selected stops honour the minimum spacing between sessions', () => {
  const opts = { ...DEFAULTS, minSpacingMi: 20, usableRangeMi: 200 };
  const day = mkDay(0, 300);
  // Sites every 5 miles: the optimiser must not take adjacent ones.
  const sites = mkSites([...Array(60)].map((_, i) => i * 5));
  const { chosen } = selectStops(sites, day, opts, 10);
  for (let i = 1; i < chosen.length; i++) {
    assert.ok(chosen[i].alongMi - chosen[i - 1].alongMi >= opts.minSpacingMi,
      `gap ${chosen[i].alongMi - chosen[i - 1].alongMi} below spacing`);
  }
});

test('no gap between stops exceeds usable range, including start and overnight', () => {
  const opts = { ...DEFAULTS, minSpacingMi: 10, usableRangeMi: 150 };
  const day = mkDay(0, 400);
  const sites = mkSites([...Array(40)].map((_, i) => i * 10));
  const { chosen, rangeOk } = selectStops(sites, day, opts, 10);
  assert.ok(rangeOk);
  assert.ok(chosen[0].alongMi - day.startMi <= opts.usableRangeMi);
  assert.ok(day.endMi - chosen[chosen.length - 1].alongMi <= opts.usableRangeMi);
  for (let i = 1; i < chosen.length; i++) {
    assert.ok(chosen[i].alongMi - chosen[i - 1].alongMi <= opts.usableRangeMi);
  }
});

test('a corridor gap longer than usable range is reported, not silently routed', () => {
  const opts = { ...DEFAULTS, minSpacingMi: 10, usableRangeMi: 100 };
  const day = mkDay(0, 400);
  const sites = mkSites([10, 20, 380, 390]); // 360-mile hole in the middle
  const { rangeOk } = selectStops(sites, day, opts, 10);
  assert.strictEqual(rangeOk, false);
});

test('stop selection stays inside the time budget it is given', () => {
  const opts = { ...DEFAULTS, minSpacingMi: 10, usableRangeMi: 200, stopOverheadMin: 12, detourMph: 30 };
  const day = mkDay(0, 300);
  const sites = mkSites([...Array(30)].map((_, i) => i * 10));
  const budget = 1.0;
  const { chosen, costH } = selectStops(sites, day, opts, budget);
  assert.ok(costH <= budget + 1e-9, `cost ${costH} exceeded budget ${budget}`);
  assert.ok(chosen.length >= 1);
});

test('more time budget never yields fewer sites', () => {
  const opts = { ...DEFAULTS, minSpacingMi: 10, usableRangeMi: 200 };
  const day = mkDay(0, 300);
  const sites = mkSites([...Array(30)].map((_, i) => i * 10));
  let prev = -1;
  for (const budget of [0.5, 1, 2, 3, 5, 8]) {
    const { chosen } = selectStops(sites, day, opts, budget);
    assert.ok(chosen.length >= prev, `budget ${budget} gave ${chosen.length}, was ${prev}`);
    prev = chosen.length;
  }
});

test('a day with no reachable sites is flagged rather than given phantom stops', () => {
  const opts = { ...DEFAULTS, usableRangeMi: 150 };
  const day = mkDay(0, 400);
  const res = analyzeDay(day, [], opts);
  assert.strictEqual(res.stops, 0);
  assert.strictEqual(res.rangeInfeasible, true);
});

test('cheaper detours are preferred when the count is the same', () => {
  const opts = { ...DEFAULTS, minSpacingMi: 50, usableRangeMi: 200, stopOverheadMin: 10, detourMph: 30 };
  const day = mkDay(0, 200);
  const sites = [
    { srcId: 1, alongMi: 100, offRouteMi: 9, name: 'far' },
    { srcId: 2, alongMi: 104, offRouteMi: 0.5, name: 'near' },
  ];
  const { chosen } = selectStops(sites, day, opts, 10);
  assert.strictEqual(chosen.length, 1);
  assert.strictEqual(chosen[0].name, 'near');
});

// ---- cost arithmetic ----

test('cost model applies contingency and uses nights = days - 1', () => {
  const opts = { ...DEFAULTS };
  const c = costModel(1000 /* billed kWh */, 9 /* days */, opts);
  assert.strictEqual(c.hotelNights, 8);
  assert.ok(Math.abs(c.chargingLow - 1000 * opts.pricePerKwhLow) < 1e-9);
  const subLow = c.chargingLow + c.hotelLow + c.foodLow + c.miscLow;
  assert.ok(Math.abs(c.totalLow - subLow * 1.15) < 1e-9);
  assert.ok(c.totalHigh > c.totalLow);
});

test('billed kWh already includes charging losses - no second multiplier', () => {
  const opts = { ...DEFAULTS };
  const day = mkDay(0, 100);
  const res = analyzeDay(day, mkSites([50]), opts);
  const expected = 100 * opts.battKwhPerMi * opts.chargeMultiplier;
  assert.ok(Math.abs(res.billedKwh - expected) < 1e-9);
});

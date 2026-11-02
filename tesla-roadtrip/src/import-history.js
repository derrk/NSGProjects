// Imports the Tesla charging-history CSV, classifies every session, writes
// data/visited.json for the route analyzer and results/history.json for the page.
const fs = require('fs');
const path = require('path');
const { importHistory, annualUnique, streaks, siteKey } = require('./history');

const ROOT = path.join(__dirname, '..');
const csv = process.argv[2];
if (!csv) {
  console.error('usage: node src/import-history.js <charging-history.csv>');
  process.exit(1);
}

const h = importHistory(csv);

// Classification. Only a Tesla-operated Supercharger site counts for the contest.
//  - qualifying : matched a catalog Supercharger with no third-party network tag
//  - thirdParty : matched a site the catalog tags with another NACS network
//  - notASite   : no catalog match at all (a Destination Charger at a hotel, say)
for (const s of h.sessions) {
  if (!s.site) s.klass = 'notASite';
  else if (s.network) s.klass = 'thirdParty';
  else s.klass = 'qualifying';
}

const qualifying = h.sessions.filter(s => s.klass === 'qualifying');
const thirdParty = h.sessions.filter(s => s.klass === 'thirdParty');
const notASite = h.sessions.filter(s => s.klass === 'notASite');

const uniq = list => {
  const m = new Map();
  list.forEach(s => { if (!m.has(siteKey(s))) m.set(siteKey(s), s); });
  return m;
};

const allTimeSites = uniq(qualifying);
const annual2026 = annualUnique(qualifying, 2026);
const st = streaks(qualifying, 24);

// Everything he has plugged into gets excluded from "new site" planning, including
// the uncertain ones - routing him back to a site he has used is never useful.
const visitedSrcIds = [...new Set(h.sessions.filter(s => s.site).map(s => s.site.srcId))];
const visitedLocationIds = [...new Set(h.sessions.filter(s => s.site && s.site.locationId).map(s => s.site.locationId))];

fs.writeFileSync(path.join(ROOT, 'data', 'visited.json'), JSON.stringify({
  note: 'Derived from the Tesla charging-history export. srcIds are supercharge.info ids, not Tesla ids.',
  sourceFile: path.basename(csv),
  importedAt: new Date().toISOString(),
  vin: h.vin,
  srcIds: visitedSrcIds,
  locationIds: visitedLocationIds,
}, null, 1));

const firstS = h.sessions[0], lastS = h.sessions[h.sessions.length - 1];
const report = {
  importedAt: new Date().toISOString(),
  sourceFile: path.basename(csv),
  vin: h.vin,
  vehicleNote: '2023 Tesla Model Y (VIN position 10 = P = 2023)',
  rowCount: h.rowCount,
  sessionCount: h.sessions.length,
  duplicatesSkipped: h.duplicates,
  coverage: { from: firstS.localStart, to: lastS.localStart },
  coverageNote: 'Covers 2026 only. Any 2025-and-earlier visits are not in this file, so "never visited" means never in 2026.',
  matchBreakdown: h.sessions.reduce((m, s) => { m[s.matchType] = (m[s.matchType] || 0) + 1; return m; }, {}),
  qualifying: {
    sessions: qualifying.length,
    uniqueSitesAllImported: allTimeSites.size,
    uniqueSites2026: annual2026.size,
    totalKwh: +qualifying.reduce((a, s) => a + s.kwh, 0).toFixed(1),
    totalSpend: +qualifying.reduce((a, s) => a + (s.costIncVat || 0), 0).toFixed(2),
  },
  recordStreak: st.record && {
    sites: st.record.count,
    durationH: +st.record.durationH.toFixed(1),
    from: new Date(st.record.startMs).toISOString(),
    to: new Date(st.record.anchorMs).toISOString(),
    firstSite: st.record.firstSite,
    lastSite: st.record.lastSite,
    mode: 'start-to-start, 24 h window',
  },
  liveStreak: st.live && {
    sites: st.live.count,
    deadline: new Date(st.live.deadlineMs).toISOString(),
    lastSite: st.live.lastSite,
  },
  streakCaveat: 'The export carries no session END time, so only the conservative start-to-start reading can be evaluated. End-mode is unknown.',
  reviewQueue: {
    fuzzy: [...new Map(h.sessions.filter(s => s.matchType === 'fuzzy-review')
      .map(s => [s.siteName, { from: s.siteName, to: s.site.name, confidence: +s.confidence.toFixed(2), sessions: 0 }])).values()],
    thirdPartyNetwork: [...new Map(thirdParty.map(s => [s.siteName,
      { site: s.siteName, network: s.network, sessions: 0 }])).values()],
    noCatalogMatch: h.unmatched,
  },
  topSites: [...qualifying.reduce((m, s) => {
    const k = s.site.name; m.set(k, (m.get(k) || 0) + 1); return m;
  }, new Map())].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, n]) => ({ name, sessions: n })),
  statesVisited: [...new Set(qualifying.map(s => s.site.state))].sort(),
};

// fill in session counts on the review entries
report.reviewQueue.fuzzy.forEach(e => {
  e.sessions = h.sessions.filter(s => s.siteName === e.from).length;
});
report.reviewQueue.thirdPartyNetwork.forEach(e => {
  e.sessions = thirdParty.filter(s => s.siteName === e.site).length;
});

fs.mkdirSync(path.join(ROOT, 'results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'results', 'history.json'), JSON.stringify(report, null, 1));

console.log(`VIN ${h.vin} | ${h.sessionCount || h.sessions.length} sessions | ${h.duplicates} duplicate rows skipped`);
console.log(`coverage ${report.coverage.from.slice(0, 10)} -> ${report.coverage.to.slice(0, 10)}`);
console.log(`qualifying Supercharger sessions: ${qualifying.length}`);
console.log(`  unique sites in 2026: ${annual2026.size}`);
console.log(`  record streak: ${report.recordStreak.sites} sites / ${report.recordStreak.durationH} h`);
console.log(`third-party network sessions: ${thirdParty.length} (${report.reviewQueue.thirdPartyNetwork.length} sites, flagged)`);
console.log(`no catalog match: ${notASite.length} sessions (${h.unmatched.length} names)`);
console.log(`visited set written: ${visitedSrcIds.length} sites -> data/visited.json`);

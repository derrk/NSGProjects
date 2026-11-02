// Tesla charging-history import. Reads the account CSV export, matches each session
// to a catalog site, and reports what could not be matched rather than guessing.
const fs = require('fs');
const { load } = require('./catalog');

// --- RFC4180-ish CSV parse: handles quoted fields and embedded commas ---
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map(h => h.trim());
  return rows.filter(r => r.length === header.length && r.some(v => v !== ''))
    .map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const num = v => {
  if (v == null) return null;
  const m = String(v).match(/-?[\d.]+/);
  return m ? parseFloat(m[0]) : null;   // "27.0138 kwh" -> 27.0138; "N/A" -> null
};

// Site names differ only in punctuation and spacing between the two sources.
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[‐-―]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// The catalog abbreviates street suffixes and directions; the Tesla export spells
// them out. Fold both to one token so "North Freeway" and "North Fwy" agree.
const ABBREV = {
  freeway: 'fwy', fwy: 'fwy',
  road: 'rd', rd: 'rd',
  street: 'st', st: 'st',
  parkway: 'pkwy', pkwy: 'pkwy', pky: 'pkwy',
  boulevard: 'blvd', blvd: 'blvd',
  drive: 'dr', dr: 'dr',
  avenue: 'ave', ave: 'ave', av: 'ave',
  lane: 'ln', ln: 'ln',
  highway: 'hwy', hwy: 'hwy',
  place: 'pl', pl: 'pl',
  court: 'ct', ct: 'ct',
  circle: 'cir', cir: 'cir',
  trail: 'trl', trl: 'trl',
  center: 'ctr', centre: 'ctr', ctr: 'ctr',
  square: 'sq', sq: 'sq',
  turnpike: 'tpke', tpke: 'tpke',
  expressway: 'expy', expy: 'expy',
  interstate: 'i', i: 'i',
  north: 'n', n: 'n', south: 's', s: 's',
  east: 'e', e: 'e', west: 'w', w: 'w',
  northeast: 'ne', ne: 'ne', northwest: 'nw', nw: 'nw',
  southeast: 'se', se: 'se', southwest: 'sw', sw: 'sw',
  mount: 'mt', mt: 'mt',
  fort: 'ft', ft: 'ft',
};

// A bracketed vendor prefix in the catalog marks a non-Tesla NACS site.
const NETWORK_PREFIX = /^\s*\[([^\]]+)\]\s*/;

function stripNetwork(name) {
  const m = String(name || '').match(NETWORK_PREFIX);
  return { network: m ? m[1] : null, name: String(name || '').replace(NETWORK_PREFIX, '') };
}

function tokens(s) {
  return norm(s).split(' ').filter(Boolean).map(t => ABBREV[t] || t);
}

function canon(s) { return tokens(s).join(' '); }

// Jaccard overlap, used only to raise review candidates - never to auto-certify.
function overlap(a, b) {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  A.forEach(t => { if (B.has(t)) inter++; });
  return inter / (A.size + B.size - inter);
}

function importHistory(csvPath, { vin = null } = {}) {
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  const { sites } = load({ country: null, statuses: ['OPEN', 'CLOSED_PERM', 'CLOSED_TEMP', 'EXPANDING'] });

  // Index on the canonical form, with the vendor prefix stripped but remembered.
  const byCanon = new Map();
  const indexed = sites.map(s => {
    const { network, name } = stripNetwork(s.name);
    const rec = { ...s, network, bareName: name, toks: tokens(name) };
    const k = canon(name);
    if (!byCanon.has(k)) byCanon.set(k, []);
    byCanon.get(k).push(rec);
    return rec;
  });

  const vins = [...new Set(rows.map(r => r.Vin).filter(Boolean))];
  const chosenVin = vin || (vins.length === 1 ? vins[0] : null);
  if (!chosenVin) {
    throw new Error(`Multiple vehicles in export (${vins.join(', ')}). Pass one VIN to select the contest vehicle.`);
  }

  const sessions = [];
  const unmatched = new Map();
  const ambiguous = [];
  let skippedOtherVin = 0, skippedNonCharge = 0;

  for (const r of rows) {
    if (r.Vin !== chosenVin) { skippedOtherVin++; continue; }
    const kwh = num(r.QuantityBase);
    // A qualifying session needs actual energy delivered.
    if (!(kwh > 0)) { skippedNonCharge++; continue; }

    const siteName = r.SiteLocationName;
    const hits = byCanon.get(canon(siteName)) || [];
    let site = null, matchType = 'none', confidence = 0;

    if (hits.length === 1) { site = hits[0]; matchType = 'canonical-name'; confidence = 1; }
    else if (hits.length > 1) {
      site = hits[0]; matchType = 'ambiguous-name'; confidence = 0.5;
      ambiguous.push({ siteName, candidates: hits.map(h => `${h.srcId} ${h.name} (${h.city}, ${h.state})`) });
    } else {
      // Fuzzy fallback, restricted to the same city so "same city" alone never wins.
      const toks = tokens(siteName);
      const cityTok = norm(siteName).split(' ')[0];
      let best = null;
      for (const c of indexed) {
        if (!c.city || norm(c.city).split(' ')[0] !== cityTok) continue;
        const sc = overlap(toks, c.toks);
        if (!best || sc > best.sc) best = { sc, c };
      }
      if (best && best.sc >= 0.5) {
        site = best.c; matchType = 'fuzzy-review'; confidence = best.sc;
      }
      if (!site) unmatched.set(siteName, (unmatched.get(siteName) || 0) + 1);
    }

    const iso = r.ChargeStartDateTime;
    const startMs = Date.parse(iso);   // offset is carried in the string, so this is a true instant

    sessions.push({
      invoice: r.InvoiceNumber || null,
      vin: r.Vin,
      siteName,
      localStart: iso,
      startMs: Number.isFinite(startMs) ? startMs : null,
      kwh,
      costIncVat: num(r['Total Inc. VAT']),
      unitCost: num(r.UnitCostBase),
      status: r.Status,
      site, matchType, confidence,
      network: site ? site.network : null,          // non-null = not a Tesla Supercharger site
      siteStatus: site ? site.status : null,
    });
  }

  // Idempotent dedupe on the invoice number, which Tesla assigns per session.
  const seen = new Set();
  const deduped = [];
  let duplicates = 0;
  for (const s of sessions) {
    const k = s.invoice || `${s.siteName}|${s.localStart}|${s.kwh}`;
    if (seen.has(k)) { duplicates++; continue; }
    seen.add(k);
    deduped.push(s);
  }
  deduped.sort((a, b) => a.startMs - b.startMs);

  return {
    vin: chosenVin,
    allVins: vins,
    rowCount: rows.length,
    sessions: deduped,
    duplicates,
    skippedOtherVin,
    skippedNonCharge,
    unmatched: [...unmatched.entries()].map(([name, n]) => ({ name, sessions: n })),
    ambiguous,
  };
}

// --- contest views over the matched sessions ---

// A distinct site is the location, not a stall. Sites only count once per set.
function siteKey(s) { return s.site ? `c${s.site.srcId}` : `name:${norm(s.siteName)}`; }

function annualUnique(sessions, year) {
  const set = new Set();
  for (const s of sessions) {
    if (s.startMs == null) continue;
    if (new Date(s.startMs).getUTCFullYear() !== year) continue;
    set.add(siteKey(s));
  }
  return set;
}

// Start-mode streak: next NEW site's start minus the last NEW site's start <= windowH.
// A repeated site inside a streak adds nothing and does not refresh the deadline.
// The export carries no session end time, so end-mode cannot be evaluated here.
function streaks(sessions, windowH = 24) {
  const windowMs = windowH * 3600 * 1000;
  const withTime = sessions.filter(s => s.startMs != null);
  const all = [];

  for (let start = 0; start < withTime.length; start++) {
    const seen = new Set();
    let anchorMs = null;
    let last = null;
    const members = [];
    for (let i = start; i < withTime.length; i++) {
      const s = withTime[i];
      const k = siteKey(s);
      if (seen.has(k)) continue;            // repeat: no credit, no refresh
      if (anchorMs !== null && s.startMs - anchorMs > windowMs) break;
      seen.add(k);
      members.push(s);
      anchorMs = s.startMs;
      last = s;
    }
    if (members.length) {
      all.push({
        startMs: members[0].startMs,
        anchorMs,
        count: seen.size,
        durationH: (anchorMs - members[0].startMs) / 3600000,
        deadlineMs: anchorMs + windowMs,
        lastSite: last.siteName,
        firstSite: members[0].siteName,
      });
    }
  }

  all.sort((a, b) => b.count - a.count || a.durationH - b.durationH);
  const record = all[0] || null;
  // The live candidate is whichever still has an open deadline right now.
  const now = Date.now();
  const live = all.filter(c => c.deadlineMs > now).sort((a, b) => b.count - a.count)[0] || null;
  return { record, live, candidates: all.length };
}

module.exports = { importHistory, parseCSV, norm, annualUnique, streaks, siteKey };

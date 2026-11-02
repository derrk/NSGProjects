// Supercharger catalog loader.
// Source: supercharge.info community API (https://supercharge.info/service/supercharge/allSites)
// This is NOT an official Tesla feed. Site identity for contest purposes is Tesla's.
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '..', 'data', 'allSites.json');

function load({ country = 'USA', statuses = ['OPEN'] } = {}) {
  const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
  const meta = JSON.parse(fs.readFileSync(RAW.replace('allSites.json', 'allSites.meta.json'), 'utf8'));
  const sites = raw
    .filter(s => s.address && s.gps && s.gps.latitude != null)
    .filter(s => (country ? s.address.country === country : true))
    .filter(s => statuses.includes(s.status))
    .map(s => ({
      srcId: s.id,                       // supercharge.info id - NOT a Tesla id
      locationId: s.locationId || null,  // Tesla location slug when present
      name: s.name,
      city: s.address.city || null,
      state: s.address.state || null,
      street: s.address.street || null,
      country: s.address.country,
      lat: s.gps.latitude,
      lon: s.gps.longitude,
      status: s.status,
      stalls: s.stallCount ?? null,
      powerKw: s.powerKilowatt ?? null,
      dateOpened: s.dateOpened || null,
      elevationM: s.elevationMeters ?? null,
    }));
  return { sites, meta, rawCount: raw.length };
}

module.exports = { load };

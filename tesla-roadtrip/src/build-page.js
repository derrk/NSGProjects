// Injects results/trip-data.json into the page template -> web/compare.html
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(ROOT, 'web', 'compare.template.html'), 'utf8');
const data = fs.readFileSync(path.join(ROOT, 'results', 'trip-data.json'), 'utf8');
// Safe to inline in a JSON script block once the closing-tag sequence is escaped.
const safe = data.replace(/<\//g, '<\/');
const out = tpl.replace('__TRIP_DATA__', () => safe);
const file = path.join(ROOT, 'web', 'compare.html');
fs.writeFileSync(file, out);
console.log('wrote', file, (fs.statSync(file).size / 1024).toFixed(0) + ' KB');

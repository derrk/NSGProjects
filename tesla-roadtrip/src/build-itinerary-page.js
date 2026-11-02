// Injects results/itinerary.json into the run-sheet template -> web/itinerary.html
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(ROOT, 'web', 'itinerary.template.html'), 'utf8');
const data = fs.readFileSync(path.join(ROOT, 'results', 'itinerary.json'), 'utf8');
const safe = data.replace(/<\//g, '<\/');
const file = path.join(ROOT, 'web', 'itinerary.html');
fs.writeFileSync(file, tpl.replace('__ITIN_DATA__', () => safe));
console.log('wrote', file, (fs.statSync(file).size / 1024).toFixed(0) + ' KB');

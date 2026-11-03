// results/lodi-itinerary.json -> web/lodi-run.html
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const it = JSON.parse(fs.readFileSync(path.join(ROOT, 'results', 'lodi-itinerary.json'), 'utf8'));
it.builtAt = new Date().toISOString();
const tpl = fs.readFileSync(path.join(ROOT, 'web', 'lodi-run.template.html'), 'utf8');
const file = path.join(ROOT, 'web', 'lodi-run.html');
fs.writeFileSync(file, tpl.replace('__RUN_DATA__', () => JSON.stringify(it).replace(/<\//g, '<\/')));
console.log('wrote', file, (fs.statSync(file).size / 1024).toFixed(0) + ' KB');

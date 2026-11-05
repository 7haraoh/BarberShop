// Gera a versão de demonstração estática em docs/ (para GitHub Pages).
// Uso: npm run build:demo
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs');

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'shared'), path.join(OUT, 'shared'), { recursive: true });

const vendor = {
  'chart.umd.min.js': 'chart.js/dist/chart.umd.min.js',
  'jspdf.umd.min.js': 'jspdf/dist/jspdf.umd.min.js',
  'jspdf.plugin.autotable.min.js': 'jspdf-autotable/dist/jspdf.plugin.autotable.min.js',
  'exceljs.min.js': 'exceljs/dist/exceljs.min.js',
};
fs.mkdirSync(path.join(OUT, 'vendor'));
for (const [name, src] of Object.entries(vendor)) fs.copyFileSync(path.join(ROOT, 'node_modules', src), path.join(OUT, 'vendor', name));

const indexFile = path.join(OUT, 'index.html');
const html = fs.readFileSync(indexFile, 'utf8').replace('<title>', '<script>window.DEMO_MODE = true;</script>\n  <title>');
fs.writeFileSync(indexFile, html);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('Demonstração gerada em docs/');

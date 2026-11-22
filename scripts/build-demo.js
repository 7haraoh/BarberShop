// Gera a versão de demonstração estática na RAIZ do repositório (GitHub Pages publica a raiz).
// Uso: npm run build:demo
//
// Arquivos gerados (não edite à mão — edite public/ e rode este script):
//   index.html, favicon.svg, manifest.webmanifest, css/, js/, vendor/
// A pasta shared/ já fica na raiz e é usada tanto pelo servidor quanto pela demo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

// Remove somente as saídas conhecidas da build anterior.
for (const p of ['css', 'js', 'vendor']) fs.rmSync(path.join(ROOT, p), { recursive: true, force: true });

for (const f of ['favicon.svg', 'manifest.webmanifest']) fs.copyFileSync(path.join(PUBLIC, f), path.join(ROOT, f));
fs.cpSync(path.join(PUBLIC, 'css'), path.join(ROOT, 'css'), { recursive: true });
fs.cpSync(path.join(PUBLIC, 'js'), path.join(ROOT, 'js'), { recursive: true });

const vendor = {
  'chart.umd.min.js': 'chart.js/dist/chart.umd.min.js',
  'jspdf.umd.min.js': 'jspdf/dist/jspdf.umd.min.js',
  'jspdf.plugin.autotable.min.js': 'jspdf-autotable/dist/jspdf.plugin.autotable.min.js',
  'exceljs.min.js': 'exceljs/dist/exceljs.min.js',
};
fs.mkdirSync(path.join(ROOT, 'vendor'));
for (const [name, src] of Object.entries(vendor)) fs.copyFileSync(path.join(ROOT, 'node_modules', src), path.join(ROOT, 'vendor', name));

const html = fs
  .readFileSync(path.join(PUBLIC, 'index.html'), 'utf8')
  .replace('<title>', '<!-- Gerado por scripts/build-demo.js a partir de public/index.html -->\n  <script>window.DEMO_MODE = true;</script>\n  <title>');
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
fs.writeFileSync(path.join(ROOT, '.nojekyll'), '');
console.log('Demonstração gerada na raiz do repositório.');

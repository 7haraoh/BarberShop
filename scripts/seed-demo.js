// Popula o banco com dados de demonstração (últimos 12 meses).
// Uso: npm run seed:demo            (adiciona aos dados existentes)
//      npm run seed:demo -- --reset (apaga receitas/despesas antes)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, tx } from '../server/db.js';
import { TIMEZONE } from '../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = openDatabase(process.env.DB_FILE || path.join(ROOT, 'data', 'barbearia.db'));
const reset = process.argv.includes('--reset');

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const today = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const services = db.prepare('SELECT * FROM services WHERE active = 1').all();
const weights = { Cabelo: 9, Barba: 4, Sobrancelha: 2, 'Cabelo + Barba': 6, 'Outros serviços': 1 };
const pool = services.flatMap((s) => Array(weights[s.name] ?? 2).fill(s));
const payments = ['pix', 'pix', 'pix', 'pix', 'dinheiro', 'dinheiro', 'debito', 'debito', 'credito', 'outros'];

tx(db, () => {
  if (reset) db.exec('DELETE FROM revenues; DELETE FROM expenses;');
  const insR = db.prepare(
    `INSERT INTO revenues (date, service_id, service_name, quantity, unit_price_cents, total_cents, payment_method, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insE = db.prepare(
    `INSERT INTO expenses (date, description, category, amount_cents, type, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const start = addDays(today, -365);
  let nR = 0;
  
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    const open = dow !== 0; // fechado aos domingos
    const monthIdx = Number(d.slice(5, 7));
    const growth = 1 + (365 - Math.round((new Date(today) - new Date(d)) / 864e5)) / 900;
    const base = (dow === 5 || dow === 6 ? 14 : 8) * growth * (monthIdx === 12 ? 1.3 : 1);
    const n = Math.max(2, Math.round(base + between(-3, 3)));
    for (let i = 0; open && i < n; i++) {
      const s = pick(pool);
      const price = s.price_cents || between(20, 80) * 100;
      const qty = rnd() < 0.08 ? 2 : 1;
      insR.run(d, s.id, s.name, qty, price, price * qty, pick(payments), '');
      nR++;
    }
    const day = d.slice(8, 10);
    const daysFromStart = Math.round((new Date(d) - new Date(start)) / 864e5);
    const weekIdx = Math.floor(daysFromStart / 7);
    if (day === '05') {
      insE.run(d, `Aluguel ${d.slice(5, 7)}/${d.slice(0, 4)}`, 'aluguel', 280000, 'fixa', 'pix', '');
      insE.run(d, 'Comissões dos barbeiros', 'salarios', between(240000, 330000), 'fixa', 'pix', '');
    }
    if (day === '08') insE.run(d, 'Internet', 'internet', 12990, 'fixa', 'debito', '');
    if (day === '10') insE.run(d, 'Conta de água', 'agua', between(9000, 16000), 'fixa', 'debito', '');
    if (day === '15') insE.run(d, 'Conta de luz', 'energia', between(28000, 42000), 'fixa', 'debito', '');
    if (day === '20') insE.run(d, 'DAS Simples Nacional', 'impostos', between(35000, 60000), 'fixa', 'pix', '');
    // Insumos semanais (segunda-feira)
    if (dow === 1) {
      insE.run(d, 'Navalhas / lâminas descartáveis', 'descartaveis', between(3500, 6500), 'variavel', 'dinheiro', '');
      insE.run(d, 'Papel pescoço e toalhas de papel', 'descartaveis', between(2500, 4800), 'variavel', 'dinheiro', '');
      if (weekIdx % 2 === 0) insE.run(d, 'Álcool 70%', 'descartaveis', between(1800, 3200), 'variavel', 'pix', '');
      if (weekIdx % 2 === 1) insE.run(d, 'Creme de barbear', 'produtos_barba', between(4000, 8000), 'variavel', 'credito', '');
      if (weekIdx % 2 === 1) insE.run(d, 'Pomadas modeladoras', 'produtos_cabelo', between(6000, 14000), 'variavel', 'credito', '');
    }
    if (day === '12') insE.run(d, 'Shampoo e condicionador', 'produtos_cabelo', between(5000, 9000), 'variavel', 'credito', '');
    if (day === '15' && rnd() < 0.5) insE.run(d, 'Impulsionamento Instagram', 'marketing', between(10000, 30000), 'variavel', 'credito', '');
    if (day === '18' && rnd() < 0.25) insE.run(d, 'Manutenção de máquinas', 'equipamentos', between(15000, 60000), 'variavel', 'pix', '');
  }
  console.log(`Dados de demonstração inseridos: ${nR} receitas, ${db.prepare('SELECT COUNT(*) n FROM expenses').get().n} despesas.`);
});
db.close();

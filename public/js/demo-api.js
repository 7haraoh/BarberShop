// Modo demonstração: a mesma API do servidor, executada no navegador.
// Os dados ficam no localStorage deste navegador (fictícios, para apresentação).
import { DEFAULT_SERVICES, PAYMENT_METHODS, EXPENSE_CATEGORIES, EXPENSE_TYPES } from '../shared/constants.js';
import { todayISO } from './utils.js';

const KEY = 'bb-demo-v2';
let db = null;

// ---------- persistência ----------
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* modo privado ou cota: segue só em memória */
  }
}
function load() {
  if (db) return db;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) db = JSON.parse(raw);
  } catch {
    db = null;
  }
  if (!db || !Array.isArray(db.revenues)) {
    db = generate();
    save();
  }
  return db;
}
export function resetDemo() {
  db = generate();
  save();
}

// ---------- datas ----------
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const addMonths = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s) => typeof s === 'string' && DATE_RE.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const nowStamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ---------- dados fictícios (12 meses até hoje) ----------
function generate() {
  let seed = 42;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const stamp = nowStamp();
  const services = DEFAULT_SERVICES.map((s, i) => ({ id: i + 1, ...s, active: 1, created_at: stamp, updated_at: stamp }));
  const weights = { Cabelo: 9, Barba: 4, Sobrancelha: 2, 'Cabelo + Barba': 6, 'Outros serviços': 1 };
  const pool = services.flatMap((s) => Array(weights[s.name] ?? 2).fill(s));
  const pays = ['pix', 'pix', 'pix', 'pix', 'dinheiro', 'dinheiro', 'debito', 'debito', 'credito', 'outros'];
  const revenues = [];
  const expenses = [];
  let rid = 0;
  let eid = 0;
  const today = todayISO();
  const exp = (date, description, category, amount_cents, type, payment_method) =>
    expenses.push({ id: ++eid, date, description, category, amount_cents, type, payment_method, notes: '', created_at: stamp, updated_at: stamp });

  for (let d = addDays(today, -365), k = 0; d <= today; d = addDays(d, 1), k++) {
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    if (dow !== 0) {
      const growth = 1 + k / 900;
      const base = (dow === 5 || dow === 6 ? 14 : 8) * growth * (d.slice(5, 7) === '12' ? 1.3 : 1);
      const n = Math.max(2, Math.round(base + between(-3, 3)));
      for (let i = 0; i < n; i++) {
        const s = pick(pool);
        const price = s.price_cents || between(20, 80) * 100;
        const qty = rnd() < 0.08 ? 2 : 1;
        revenues.push({
          id: ++rid, date: d, service_id: s.id, service_name: s.name, quantity: qty, unit_price_cents: price,
          total_cents: price * qty, payment_method: pick(pays), notes: '', created_at: stamp, updated_at: stamp,
        });
      }
    }
    const day = d.slice(8, 10);
    const weekIdx = Math.floor(k / 7);
    if (day === '05') {
      exp(d, `Aluguel ${d.slice(5, 7)}/${d.slice(0, 4)}`, 'aluguel', 280000, 'fixa', 'pix');
      exp(d, 'Comissões dos barbeiros', 'salarios', between(240000, 330000), 'fixa', 'pix');
    }
    if (day === '08') exp(d, 'Internet', 'internet', 12990, 'fixa', 'debito');
    if (day === '10') exp(d, 'Conta de água', 'agua', between(9000, 16000), 'fixa', 'debito');
    if (day === '15') exp(d, 'Conta de luz', 'energia', between(28000, 42000), 'fixa', 'debito');
    if (day === '20') exp(d, 'DAS Simples Nacional', 'impostos', between(35000, 60000), 'fixa', 'pix');
    // Insumos semanais (segunda-feira)
    if (dow === 1) {
      exp(d, 'Navalhas / lâminas descartáveis', 'descartaveis', between(3500, 6500), 'variavel', 'dinheiro');
      exp(d, 'Papel pescoço e toalhas de papel', 'descartaveis', between(2500, 4800), 'variavel', 'dinheiro');
      if (weekIdx % 2 === 0) exp(d, 'Álcool 70%', 'descartaveis', between(1800, 3200), 'variavel', 'pix');
      if (weekIdx % 2 === 1) exp(d, 'Creme de barbear', 'produtos_barba', between(4000, 8000), 'variavel', 'credito');
      if (weekIdx % 2 === 1) exp(d, 'Pomadas modeladoras', 'produtos_cabelo', between(6000, 14000), 'variavel', 'credito');
    }
    if (day === '12') exp(d, 'Shampoo e condicionador', 'produtos_cabelo', between(5000, 9000), 'variavel', 'credito');
    if (day === '15' && rnd() < 0.5) exp(d, 'Impulsionamento Instagram', 'marketing', between(10000, 30000), 'variavel', 'credito');
    if (day === '18' && rnd() < 0.25) exp(d, 'Manutenção de máquinas', 'equipamentos', between(15000, 60000), 'variavel', 'pix');
  }
  return {
    services,
    revenues,
    expenses,
    settings: { shop_name: 'Barbearia Demonstração', opening_balance_cents: 500000 },
    seq: { services: services.length, revenues: rid, expenses: eid },
  };
}

// ---------- validação ----------
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (m) => new HttpError(400, m);
const reqDate = (v, f = 'Data') => {
  if (!isDate(v)) throw bad(`${f} inválida. Use o formato DD/MM/AAAA.`);
  return v;
};
const reqCents = (v, f, allowZero = false) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || (!allowZero && n === 0)) throw bad(`${f} deve ser um valor maior que zero.`);
  return n;
};
const reqText = (v, f, max) => {
  const s = String(v ?? '').trim();
  if (!s) throw bad(`${f} é obrigatório.`);
  return s.slice(0, max);
};
const reqEnum = (v, list, f) => {
  if (!list.some((x) => x.id === v)) throw bad(`${f} inválido.`);
  return v;
};
const range = (q) => {
  const start = reqDate(q.start, 'Data inicial');
  const end = reqDate(q.end, 'Data final');
  if (start > end) throw bad('A data inicial deve ser anterior à data final.');
  return { start, end };
};
const inRange = (d, s, e) => d >= s && d <= e;
const byDateDesc = (a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date));
const sum = (arr, k) => arr.reduce((a, r) => a + r[k], 0);
const derive = (rev, exp, services) => ({
  revenue_cents: rev,
  expenses_cents: exp,
  profit_cents: rev - exp,
  services,
  margin: rev > 0 ? ((rev - exp) / rev) * 100 : null,
  ticket_cents: services > 0 ? Math.round(rev / services) : null,
});
function groupSum(rows, key, valKey, extra = () => ({})) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key];
    const g = m.get(k) || { k, entries: 0, quantity: 0, total_cents: 0 };
    g.entries++;
    g.quantity += r.quantity || 0;
    g.total_cents += r[valKey];
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.total_cents - a.total_cents).map((g) => ({ ...g, ...extra(g) }));
}

// ---------- rotas ----------
function parseService(b) {
  return {
    name: reqText(b.name, 'Nome', 60),
    price_cents: reqCents(b.price_cents, 'Preço', true),
    description: String(b.description ?? '').trim().slice(0, 300),
    active: b.active === undefined ? 1 : b.active ? 1 : 0,
  };
}
function parseRevenue(b) {
  const svc = db.services.find((s) => s.id === Number(b.service_id));
  if (!svc) throw bad('Selecione um tipo de serviço válido.');
  const quantity = Number(b.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) throw bad('Quantidade deve ser um número inteiro maior que zero.');
  const unit = reqCents(b.unit_price_cents, 'Valor cobrado');
  return {
    date: reqDate(b.date, 'Data do recebimento'),
    service_id: svc.id,
    service_name: svc.name,
    quantity,
    unit_price_cents: unit,
    total_cents: unit * quantity,
    payment_method: reqEnum(b.payment_method, PAYMENT_METHODS, 'Forma de pagamento'),
    notes: String(b.notes ?? '').trim().slice(0, 1000),
  };
}
function parseExpense(b) {
  return {
    date: reqDate(b.date, 'Data de pagamento'),
    description: reqText(b.description, 'Descrição', 120),
    category: reqEnum(b.category, EXPENSE_CATEGORIES, 'Categoria'),
    amount_cents: reqCents(b.amount_cents, 'Valor'),
    type: reqEnum(b.type, EXPENSE_TYPES, 'Tipo'),
    payment_method: reqEnum(b.payment_method, PAYMENT_METHODS, 'Forma de pagamento'),
    notes: String(b.notes ?? '').trim().slice(0, 1000),
  };
}
const nameTaken = (name, except = 0) => db.services.some((s) => s.id !== except && s.name.toLowerCase() === name.toLowerCase());
const findOr404 = (list, id, msg) => {
  const r = list.find((x) => x.id === Number(id));
  if (!r) throw new HttpError(404, msg);
  return r;
};
const clone = (x) => JSON.parse(JSON.stringify(x));

function summary(start, end) {
  const rev = db.revenues.filter((r) => inRange(r.date, start, end));
  const exp = db.expenses.filter((e) => inRange(e.date, start, end));
  return {
    start,
    end,
    ...derive(sum(rev, 'total_cents'), sum(exp, 'amount_cents'), sum(rev, 'quantity')),
    by_service: groupSum(rev, 'service_name', 'total_cents').map((g) => ({ name: g.k, quantity: g.quantity, total_cents: g.total_cents })),
    by_payment: groupSum(rev, 'payment_method', 'total_cents').map((g) => ({ id: g.k, entries: g.entries, quantity: g.quantity, total_cents: g.total_cents })),
    expenses_by_category: groupSum(exp, 'category', 'amount_cents').map((g) => ({ id: g.k, entries: g.entries, total_cents: g.total_cents })),
    expenses_by_type: groupSum(exp, 'type', 'amount_cents').map((g) => ({ id: g.k, total_cents: g.total_cents })),
  };
}
function series(start, end, group) {
  const keyOf = group === 'month' ? (d) => d.slice(0, 7) : (d) => d;
  const acc = new Map();
  const get = (k) => acc.get(k) || acc.set(k, { rev: 0, exp: 0, qty: 0 }).get(k);
  db.revenues.forEach((r) => {
    if (inRange(r.date, start, end)) {
      const g = get(keyOf(r.date));
      g.rev += r.total_cents;
      g.qty += r.quantity;
    }
  });
  db.expenses.forEach((e) => {
    if (inRange(e.date, start, end)) get(keyOf(e.date)).exp += e.amount_cents;
  });
  const keys = [];
  if (group === 'month') for (let k = start.slice(0, 7); k <= end.slice(0, 7); k = addMonths(k, 1)) keys.push(k);
  else for (let k = start; k <= end; k = addDays(k, 1)) keys.push(k);
  return keys.map((k) => {
    const g = acc.get(k) || { rev: 0, exp: 0, qty: 0 };
    return { period: k, ...derive(g.rev, g.exp, g.qty) };
  });
}
function cashflow(start, end) {
  const before = sum(db.revenues.filter((r) => r.date < start), 'total_cents') - sum(db.expenses.filter((e) => e.date < start), 'amount_cents');
  const opening = (db.settings.opening_balance_cents || 0) + before;
  const movements = [
    ...db.revenues
      .filter((r) => inRange(r.date, start, end))
      .map((r) => ({
        kind: 'entrada', id: r.id, date: r.date, description: r.service_name + (r.quantity > 1 ? ` (${r.quantity}x)` : ''),
        payment_method: r.payment_method, amount_cents: r.total_cents, created_at: r.created_at,
      })),
    ...db.expenses
      .filter((e) => inRange(e.date, start, end))
      .map((e) => ({ kind: 'saida', id: e.id, date: e.date, description: e.description, payment_method: e.payment_method, amount_cents: e.amount_cents, created_at: e.created_at })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at) || a.kind.localeCompare(b.kind) || a.id - b.id);
  let bal = opening;
  let inflow = 0;
  let outflow = 0;
  const daily = new Map();
  for (const m of movements) {
    const isIn = m.kind === 'entrada';
    bal += isIn ? m.amount_cents : -m.amount_cents;
    if (isIn) inflow += m.amount_cents;
    else outflow += m.amount_cents;
    m.balance_cents = bal;
    const d = daily.get(m.date) || { date: m.date, inflow_cents: 0, outflow_cents: 0 };
    d[isIn ? 'inflow_cents' : 'outflow_cents'] += m.amount_cents;
    daily.set(m.date, d);
  }
  let running = opening;
  const days = [...daily.values()].map((d) => {
    const o = running;
    running = o + d.inflow_cents - d.outflow_cents;
    return { ...d, opening_cents: o, closing_cents: running, net_cents: d.inflow_cents - d.outflow_cents };
  });
  return { start, end, opening_cents: opening, inflow_cents: inflow, outflow_cents: outflow, closing_cents: opening + inflow - outflow, movements, days };
}

function route(method, path, q, b) {
  const [, res, id] = path.split('/');
  const stamp = nowStamp();
  const like = (s) => String(s || '').toLowerCase().includes(String(q.q).toLowerCase());

  if (res === 'services') {
    if (method === 'GET') {
      return db.services
        .map((s) => ({ ...s, usage: db.revenues.filter((r) => r.service_id === s.id).length }))
        .sort((a, b2) => b2.active - a.active || a.name.localeCompare(b2.name, 'pt-BR'));
    }
    if (method === 'POST') {
      const s = parseService(b);
      if (nameTaken(s.name)) throw bad('Já existe um serviço com esse nome.');
      const row = { id: ++db.seq.services, ...s, created_at: stamp, updated_at: stamp };
      db.services.push(row);
      return row;
    }
    const svc = findOr404(db.services, id, 'Serviço não encontrado.');
    if (method === 'PUT') {
      const s = parseService(b);
      if (nameTaken(s.name, svc.id)) throw bad('Já existe um serviço com esse nome.');
      Object.assign(svc, s, { updated_at: stamp });
      db.revenues.forEach((r) => r.service_id === svc.id && (r.service_name = svc.name));
      return svc;
    }
    if (method === 'DELETE') {
      const n = db.revenues.filter((r) => r.service_id === svc.id).length;
      if (n) throw new HttpError(409, `Este serviço possui ${n} lançamento(s) de receita. Desative-o em vez de excluir para preservar o histórico.`);
      db.services = db.services.filter((s) => s !== svc);
      return null;
    }
  }
  if (res === 'revenues') {
    if (method === 'GET') {
      const { start, end } = range(q);
      return db.revenues
        .filter((r) => inRange(r.date, start, end) && (!q.service || r.service_name === q.service) && (!q.payment_method || r.payment_method === q.payment_method) && (!q.q || like(r.notes) || like(r.service_name)))
        .sort(byDateDesc);
    }
    if (method === 'POST') {
      const row = { id: ++db.seq.revenues, ...parseRevenue(b), created_at: stamp, updated_at: stamp };
      db.revenues.push(row);
      return row;
    }
    const r = findOr404(db.revenues, id, 'Receita não encontrada.');
    if (method === 'PUT') return Object.assign(r, parseRevenue(b), { updated_at: stamp });
    if (method === 'DELETE') {
      db.revenues = db.revenues.filter((x) => x !== r);
      return null;
    }
  }
  if (res === 'expenses') {
    if (method === 'GET') {
      const { start, end } = range(q);
      return db.expenses
        .filter((e) => inRange(e.date, start, end) && ['category', 'type', 'payment_method'].every((f) => !q[f] || e[f] === q[f]) && (!q.q || like(e.description) || like(e.notes)))
        .sort(byDateDesc);
    }
    if (method === 'POST') {
      const row = { id: ++db.seq.expenses, ...parseExpense(b), created_at: stamp, updated_at: stamp };
      db.expenses.push(row);
      return row;
    }
    const e = findOr404(db.expenses, id, 'Despesa não encontrada.');
    if (method === 'PUT') return Object.assign(e, parseExpense(b), { updated_at: stamp });
    if (method === 'DELETE') {
      db.expenses = db.expenses.filter((x) => x !== e);
      return null;
    }
  }
  if (res === 'summary') {
    const { start, end } = range(q);
    return summary(start, end);
  }
  if (res === 'series') {
    const { start, end } = range(q);
    return series(start, end, q.group === 'month' ? 'month' : 'day');
  }
  if (res === 'cashflow') {
    const { start, end } = range(q);
    return cashflow(start, end);
  }
  if (res === 'settings') {
    if (method === 'PUT') {
      const ob = Number(b.opening_balance_cents);
      if (!Number.isInteger(ob)) throw bad('Saldo inicial inválido.');
      db.settings = { shop_name: reqText(b.shop_name, 'Nome da barbearia', 60), opening_balance_cents: ob };
    }
    return db.settings;
  }
  throw new HttpError(404, 'Rota não encontrada.');
}

/** Mesma interface do fetch da API real. */
export async function demoRequest(method, url, body) {
  load();
  const u = new URL(url, 'http://demo');
  const q = Object.fromEntries(u.searchParams.entries());
  try {
    const out = route(method, u.pathname, q, body ? clone(body) : {});
    if (method !== 'GET') save();
    return out === null ? null : clone(out);
  } catch (e) {
    if (e instanceof HttpError) throw new Error(e.message);
    throw e;
  }
}

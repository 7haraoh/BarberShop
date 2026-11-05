import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tx, DEFAULT_SETTINGS } from './db.js';
import { summary, series, cashflow } from './stats.js';
import { PAYMENT_METHODS, EXPENSE_CATEGORIES, EXPENSE_TYPES } from '../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);

// ---------- validação ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function reqDate(v, field = 'Data') {
  if (!isDate(v)) throw bad(`${field} inválida. Use o formato DD/MM/AAAA.`);
  return v;
}
function reqCents(v, field, { allowZero = false } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || (!allowZero && n === 0)) throw bad(`${field} deve ser um valor ${allowZero ? 'igual ou ' : ''}maior que zero.`);
  if (n > 100_000_000_00) throw bad(`${field} muito alto.`);
  return n;
}
function reqText(v, field, max = 200) {
  const s = String(v ?? '').trim();
  if (!s) throw bad(`${field} é obrigatório.`);
  if (s.length > max) throw bad(`${field} deve ter no máximo ${max} caracteres.`);
  return s;
}
function optText(v, max = 1000) {
  return String(v ?? '').trim().slice(0, max);
}
function reqEnum(v, list, field) {
  if (!list.some((x) => x.id === v)) throw bad(`${field} inválido.`);
  return v;
}
function range(q) {
  const start = reqDate(q.start, 'Data inicial');
  const end = reqDate(q.end, 'Data final');
  if (start > end) throw bad('A data inicial deve ser anterior à data final.');
  return { start, end };
}
const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, 'Registro não encontrado.');
  return n;
};
const plain = (row) => (row ? { ...row } : row);

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '20mb' }));

  const api = express.Router();

  // ---------- serviços ----------
  const getService = (sid) => plain(db.prepare('SELECT * FROM services WHERE id = ?').get(sid));
  const parseService = (b) => ({
    name: reqText(b.name, 'Nome', 60),
    price_cents: reqCents(b.price_cents, 'Preço', { allowZero: true }),
    description: optText(b.description, 300),
    active: b.active === undefined ? 1 : b.active ? 1 : 0,
  });
  const nameTaken = (name, exceptId = 0) =>
    db.prepare('SELECT id FROM services WHERE name = ? COLLATE NOCASE AND id <> ?').get(name, exceptId);

  api.get('/services', (req, res) => {
    const rows = db
      .prepare(
        `SELECT s.*, (SELECT COUNT(*) FROM revenues r WHERE r.service_id = s.id) AS usage
         FROM services s ORDER BY s.active DESC, s.name COLLATE NOCASE`
      )
      .all();
    res.json(rows.map(plain));
  });
  api.post('/services', (req, res) => {
    const s = parseService(req.body);
    if (nameTaken(s.name)) throw bad('Já existe um serviço com esse nome.');
    const r = db
      .prepare('INSERT INTO services (name, price_cents, description, active) VALUES (?, ?, ?, ?)')
      .run(s.name, s.price_cents, s.description, s.active);
    res.status(201).json(getService(Number(r.lastInsertRowid)));
  });
  api.put('/services/:id', (req, res) => {
    const sid = id(req.params.id);
    if (!getService(sid)) throw new HttpError(404, 'Serviço não encontrado.');
    const s = parseService(req.body);
    if (nameTaken(s.name, sid)) throw bad('Já existe um serviço com esse nome.');
    tx(db, () => {
      db.prepare(
        "UPDATE services SET name = ?, price_cents = ?, description = ?, active = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(s.name, s.price_cents, s.description, s.active, sid);
      // Mantém os relatórios consistentes quando o serviço é renomeado.
      db.prepare('UPDATE revenues SET service_name = ? WHERE service_id = ?').run(s.name, sid);
    });
    res.json(getService(sid));
  });
  api.delete('/services/:id', (req, res) => {
    const sid = id(req.params.id);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM revenues WHERE service_id = ?').get(sid);
    if (n > 0)
      throw new HttpError(409, `Este serviço possui ${n} lançamento(s) de receita. Desative-o em vez de excluir para preservar o histórico.`);
    const r = db.prepare('DELETE FROM services WHERE id = ?').run(sid);
    if (!r.changes) throw new HttpError(404, 'Serviço não encontrado.');
    res.status(204).end();
  });

  // ---------- receitas ----------
  const getRevenue = (rid) => plain(db.prepare('SELECT * FROM revenues WHERE id = ?').get(rid));
  function parseRevenue(b) {
    const date = reqDate(b.date, 'Data do recebimento');
    const sid = Number(b.service_id);
    const svc = Number.isInteger(sid) && sid > 0 ? getService(sid) : null;
    if (!svc) throw bad('Selecione um tipo de serviço válido.');
    const quantity = Number(b.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) throw bad('Quantidade deve ser um número inteiro maior que zero.');
    const unit = reqCents(b.unit_price_cents, 'Valor cobrado');
    return {
      date,
      service_id: svc.id,
      service_name: svc.name,
      quantity,
      unit_price_cents: unit,
      total_cents: unit * quantity,
      payment_method: reqEnum(b.payment_method, PAYMENT_METHODS, 'Forma de pagamento'),
      notes: optText(b.notes),
    };
  }
  api.get('/revenues', (req, res) => {
    const { start, end } = range(req.query);
    const where = ['date BETWEEN ? AND ?'];
    const args = [start, end];
    if (req.query.service) {
      where.push('service_name = ?');
      args.push(String(req.query.service));
    }
    if (req.query.payment_method) {
      where.push('payment_method = ?');
      args.push(String(req.query.payment_method));
    }
    if (req.query.q) {
      where.push('(notes LIKE ? OR service_name LIKE ?)');
      args.push(`%${req.query.q}%`, `%${req.query.q}%`);
    }
    const rows = db
      .prepare(`SELECT * FROM revenues WHERE ${where.join(' AND ')} ORDER BY date DESC, id DESC`)
      .all(...args);
    res.json(rows.map(plain));
  });
  api.post('/revenues', (req, res) => {
    const r = parseRevenue(req.body);
    const out = db
      .prepare(
        `INSERT INTO revenues (date, service_id, service_name, quantity, unit_price_cents, total_cents, payment_method, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(r.date, r.service_id, r.service_name, r.quantity, r.unit_price_cents, r.total_cents, r.payment_method, r.notes);
    res.status(201).json(getRevenue(Number(out.lastInsertRowid)));
  });
  api.put('/revenues/:id', (req, res) => {
    const rid = id(req.params.id);
    if (!getRevenue(rid)) throw new HttpError(404, 'Receita não encontrada.');
    const r = parseRevenue(req.body);
    db.prepare(
      `UPDATE revenues SET date = ?, service_id = ?, service_name = ?, quantity = ?, unit_price_cents = ?, total_cents = ?,
       payment_method = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(r.date, r.service_id, r.service_name, r.quantity, r.unit_price_cents, r.total_cents, r.payment_method, r.notes, rid);
    res.json(getRevenue(rid));
  });
  api.delete('/revenues/:id', (req, res) => {
    const r = db.prepare('DELETE FROM revenues WHERE id = ?').run(id(req.params.id));
    if (!r.changes) throw new HttpError(404, 'Receita não encontrada.');
    res.status(204).end();
  });

  // ---------- despesas ----------
  const getExpense = (eid) => plain(db.prepare('SELECT * FROM expenses WHERE id = ?').get(eid));
  const parseExpense = (b) => ({
    date: reqDate(b.date, 'Data de pagamento'),
    description: reqText(b.description, 'Descrição', 120),
    category: reqEnum(b.category, EXPENSE_CATEGORIES, 'Categoria'),
    amount_cents: reqCents(b.amount_cents, 'Valor'),
    type: reqEnum(b.type, EXPENSE_TYPES, 'Tipo'),
    payment_method: reqEnum(b.payment_method, PAYMENT_METHODS, 'Forma de pagamento'),
    notes: optText(b.notes),
  });
  api.get('/expenses', (req, res) => {
    const { start, end } = range(req.query);
    const where = ['date BETWEEN ? AND ?'];
    const args = [start, end];
    for (const f of ['category', 'type', 'payment_method']) {
      if (req.query[f]) {
        where.push(`${f} = ?`);
        args.push(String(req.query[f]));
      }
    }
    if (req.query.q) {
      where.push('(description LIKE ? OR notes LIKE ?)');
      args.push(`%${req.query.q}%`, `%${req.query.q}%`);
    }
    const rows = db
      .prepare(`SELECT * FROM expenses WHERE ${where.join(' AND ')} ORDER BY date DESC, id DESC`)
      .all(...args);
    res.json(rows.map(plain));
  });
  api.post('/expenses', (req, res) => {
    const e = parseExpense(req.body);
    const out = db
      .prepare(
        `INSERT INTO expenses (date, description, category, amount_cents, type, payment_method, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(e.date, e.description, e.category, e.amount_cents, e.type, e.payment_method, e.notes);
    res.status(201).json(getExpense(Number(out.lastInsertRowid)));
  });
  api.put('/expenses/:id', (req, res) => {
    const eid = id(req.params.id);
    if (!getExpense(eid)) throw new HttpError(404, 'Despesa não encontrada.');
    const e = parseExpense(req.body);
    db.prepare(
      `UPDATE expenses SET date = ?, description = ?, category = ?, amount_cents = ?, type = ?, payment_method = ?, notes = ?,
       updated_at = datetime('now') WHERE id = ?`
    ).run(e.date, e.description, e.category, e.amount_cents, e.type, e.payment_method, e.notes, eid);
    res.json(getExpense(eid));
  });
  api.delete('/expenses/:id', (req, res) => {
    const r = db.prepare('DELETE FROM expenses WHERE id = ?').run(id(req.params.id));
    if (!r.changes) throw new HttpError(404, 'Despesa não encontrada.');
    res.status(204).end();
  });

  // ---------- indicadores e relatórios ----------
  api.get('/summary', (req, res) => {
    const { start, end } = range(req.query);
    res.json(summary(db, start, end));
  });
  api.get('/series', (req, res) => {
    const { start, end } = range(req.query);
    const group = req.query.group === 'month' ? 'month' : 'day';
    if (group === 'day' && (new Date(end) - new Date(start)) / 864e5 > 1100) throw bad('Período muito longo para agrupamento diário.');
    res.json(series(db, start, end, group));
  });
  api.get('/cashflow', (req, res) => {
    const { start, end } = range(req.query);
    res.json(cashflow(db, start, end));
  });

  // ---------- configurações ----------
  const readSettings = () => {
    const out = { ...DEFAULT_SETTINGS };
    for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
    return { shop_name: out.shop_name, opening_balance_cents: Number(out.opening_balance_cents) || 0 };
  };
  api.get('/settings', (req, res) => res.json(readSettings()));
  api.put('/settings', (req, res) => {
    const name = reqText(req.body.shop_name, 'Nome da barbearia', 60);
    const ob = Number(req.body.opening_balance_cents);
    if (!Number.isInteger(ob) || Math.abs(ob) > 100_000_000_00) throw bad('Saldo inicial inválido.');
    const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    tx(db, () => {
      up.run('shop_name', name);
      up.run('opening_balance_cents', String(ob));
    });
    res.json(readSettings());
  });

  // ---------- backup ----------
  api.get('/backup', (req, res) => {
    const data = {
      app: 'barbearia-financeiro',
      version: 1,
      exported_at: new Date().toISOString(),
      settings: db.prepare('SELECT * FROM settings').all().map(plain),
      services: db.prepare('SELECT * FROM services ORDER BY id').all().map(plain),
      revenues: db.prepare('SELECT * FROM revenues ORDER BY id').all().map(plain),
      expenses: db.prepare('SELECT * FROM expenses ORDER BY id').all().map(plain),
    };
    res.setHeader('Content-Disposition', `attachment; filename="backup-barbearia-${data.exported_at.slice(0, 10)}.json"`);
    res.json(data);
  });
  api.post('/restore', (req, res) => {
    const b = req.body || {};
    if (b.app !== 'barbearia-financeiro' || !Array.isArray(b.services) || !Array.isArray(b.revenues) || !Array.isArray(b.expenses))
      throw bad('Arquivo de backup inválido.');
    tx(db, () => {
      db.exec('DELETE FROM revenues; DELETE FROM expenses; DELETE FROM services; DELETE FROM settings;');
      const insS = db.prepare(
        'INSERT INTO services (id, name, price_cents, description, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (const s of b.services) {
        const p = parseService(s);
        insS.run(id(s.id), p.name, p.price_cents, p.description, p.active, s.created_at || null, s.updated_at || null);
      }
      const insR = db.prepare(
        `INSERT INTO revenues (id, date, service_id, service_name, quantity, unit_price_cents, total_cents, payment_method, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const r of b.revenues) {
        const p = parseRevenue(r);
        insR.run(id(r.id), p.date, p.service_id, p.service_name, p.quantity, p.unit_price_cents, p.total_cents, p.payment_method, p.notes);
      }
      const insE = db.prepare(
        `INSERT INTO expenses (id, date, description, category, amount_cents, type, payment_method, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const e of b.expenses) {
        const p = parseExpense(e);
        insE.run(id(e.id), p.date, p.description, p.category, p.amount_cents, p.type, p.payment_method, p.notes);
      }
      const insSet = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
      const settings = Object.fromEntries((b.settings || []).map((s) => [s.key, String(s.value)]));
      for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insSet.run(k, settings[k] ?? v);
    });
    res.json({ ok: true, services: b.services.length, revenues: b.revenues.length, expenses: b.expenses.length });
  });

  api.use((req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  app.use('/api', api);

  // ---------- arquivos estáticos ----------
  const nm = (p) => path.join(ROOT, 'node_modules', p);
  app.get('/vendor/chart.umd.min.js', (req, res) => res.sendFile(nm('chart.js/dist/chart.umd.min.js')));
  app.get('/vendor/jspdf.umd.min.js', (req, res) => res.sendFile(nm('jspdf/dist/jspdf.umd.min.js')));
  app.get('/vendor/jspdf.plugin.autotable.min.js', (req, res) => res.sendFile(nm('jspdf-autotable/dist/jspdf.plugin.autotable.min.js')));
  app.get('/vendor/exceljs.min.js', (req, res) => res.sendFile(nm('exceljs/dist/exceljs.min.js')));
  app.use('/shared', express.static(path.join(ROOT, 'shared')));
  app.use(express.static(path.join(ROOT, 'public')));

  // ---------- erros ----------
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Arquivo muito grande.' });
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  });

  return app;
}

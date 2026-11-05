// Cálculos financeiros. Todos os valores monetários em centavos (inteiros).
//   Faturamento bruto = soma das receitas
//   Despesas totais   = soma das despesas
//   Lucro líquido     = faturamento - despesas
//   Margem            = lucro / faturamento × 100
//   Ticket médio      = faturamento / quantidade de serviços

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return dt.toISOString().slice(0, 7);
}

export function derive(revenue, expenses, services) {
  const profit = revenue - expenses;
  return {
    revenue_cents: revenue,
    expenses_cents: expenses,
    profit_cents: profit,
    services,
    margin: revenue > 0 ? (profit / revenue) * 100 : null,
    ticket_cents: services > 0 ? Math.round(revenue / services) : null,
  };
}

function totals(db, start, end) {
  const r = db
    .prepare('SELECT COALESCE(SUM(total_cents),0) AS rev, COALESCE(SUM(quantity),0) AS qty FROM revenues WHERE date BETWEEN ? AND ?')
    .get(start, end);
  const e = db
    .prepare('SELECT COALESCE(SUM(amount_cents),0) AS exp FROM expenses WHERE date BETWEEN ? AND ?')
    .get(start, end);
  return derive(r.rev, e.exp, r.qty);
}

export function summary(db, start, end) {
  const t = totals(db, start, end);
  const byService = db
    .prepare(
      `SELECT service_name AS name, SUM(quantity) AS quantity, SUM(total_cents) AS total_cents
       FROM revenues WHERE date BETWEEN ? AND ?
       GROUP BY service_name ORDER BY total_cents DESC, quantity DESC`
    )
    .all(start, end);
  const byPayment = db
    .prepare(
      `SELECT payment_method AS id, COUNT(*) AS entries, SUM(quantity) AS quantity, SUM(total_cents) AS total_cents
       FROM revenues WHERE date BETWEEN ? AND ?
       GROUP BY payment_method ORDER BY total_cents DESC`
    )
    .all(start, end);
  const byCategory = db
    .prepare(
      `SELECT category AS id, COUNT(*) AS entries, SUM(amount_cents) AS total_cents
       FROM expenses WHERE date BETWEEN ? AND ?
       GROUP BY category ORDER BY total_cents DESC`
    )
    .all(start, end);
  const byType = db
    .prepare(
      `SELECT type AS id, SUM(amount_cents) AS total_cents
       FROM expenses WHERE date BETWEEN ? AND ? GROUP BY type`
    )
    .all(start, end);
  const plain = (rows) => rows.map((r) => ({ ...r }));
  return {
    start,
    end,
    ...t,
    by_service: plain(byService),
    by_payment: plain(byPayment),
    expenses_by_category: plain(byCategory),
    expenses_by_type: plain(byType),
  };
}

/** Série temporal com lacunas preenchidas. group = 'day' | 'month'. */
export function series(db, start, end, group = 'day') {
  const key = group === 'month' ? 'substr(date,1,7)' : 'date';
  const rev = db
    .prepare(
      `SELECT ${key} AS k, SUM(total_cents) AS rev, SUM(quantity) AS qty
       FROM revenues WHERE date BETWEEN ? AND ? GROUP BY k`
    )
    .all(start, end);
  const exp = db
    .prepare(`SELECT ${key} AS k, SUM(amount_cents) AS exp FROM expenses WHERE date BETWEEN ? AND ? GROUP BY k`)
    .all(start, end);
  const revMap = new Map(rev.map((r) => [r.k, r]));
  const expMap = new Map(exp.map((r) => [r.k, r.exp]));

  const keys = [];
  if (group === 'month') {
    for (let k = start.slice(0, 7); k <= end.slice(0, 7); k = addMonths(k, 1)) keys.push(k);
  } else {
    for (let k = start; k <= end; k = addDays(k, 1)) keys.push(k);
  }
  return keys.map((k) => {
    const r = revMap.get(k);
    return { period: k, ...derive(r ? r.rev : 0, expMap.get(k) || 0, r ? r.qty : 0) };
  });
}

/** Fluxo de caixa: saldo inicial, entradas, saídas, saldo final e movimentações. */
export function cashflow(db, start, end) {
  const base = Number(
    (db.prepare("SELECT value FROM settings WHERE key = 'opening_balance_cents'").get() || { value: '0' }).value
  );
  const before = db
    .prepare(
      `SELECT
        (SELECT COALESCE(SUM(total_cents),0) FROM revenues WHERE date < ?) -
        (SELECT COALESCE(SUM(amount_cents),0) FROM expenses WHERE date < ?) AS bal`
    )
    .get(start, start).bal;
  const opening = base + before;

  const movements = db
    .prepare(
      `SELECT * FROM (
         SELECT 'entrada' AS kind, id, date, service_name || CASE WHEN quantity > 1 THEN ' (' || quantity || 'x)' ELSE '' END AS description,
                payment_method, total_cents AS amount_cents, created_at
         FROM revenues WHERE date BETWEEN ? AND ?
         UNION ALL
         SELECT 'saida' AS kind, id, date, description, payment_method, amount_cents, created_at
         FROM expenses WHERE date BETWEEN ? AND ?
       ) ORDER BY date ASC, created_at ASC, kind ASC, id ASC`
    )
    .all(start, end, start, end)
    .map((m) => ({ ...m }));

  let bal = opening;
  let inflow = 0;
  let outflow = 0;
  const daily = new Map();
  for (const m of movements) {
    if (m.kind === 'entrada') {
      bal += m.amount_cents;
      inflow += m.amount_cents;
    } else {
      bal -= m.amount_cents;
      outflow += m.amount_cents;
    }
    m.balance_cents = bal;
    const d = daily.get(m.date) || { date: m.date, inflow_cents: 0, outflow_cents: 0 };
    if (m.kind === 'entrada') d.inflow_cents += m.amount_cents;
    else d.outflow_cents += m.amount_cents;
    daily.set(m.date, d);
  }

  // Fechamento por dia (somente dias com movimento), com saldos de abertura/fechamento.
  let running = opening;
  const days = [...daily.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const o = running;
      running = o + d.inflow_cents - d.outflow_cents;
      return { ...d, opening_cents: o, closing_cents: running, net_cents: d.inflow_cents - d.outflow_cents };
    });

  return {
    start,
    end,
    opening_cents: opening,
    inflow_cents: inflow,
    outflow_cents: outflow,
    closing_cents: opening + inflow - outflow,
    movements,
    days,
  };
}

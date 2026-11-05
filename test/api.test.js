import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';

let server;
let base;
before(async () => {
  const app = createApp(openDatabase(':memory:'));
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

const call = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};

test('serviços padrão são criados', async () => {
  const { body } = await call('GET', '/services');
  assert.deepEqual(
    body.map((s) => s.name).sort(),
    ['Barba', 'Cabelo', 'Cabelo + Barba', 'Outros serviços', 'Sobrancelha']
  );
});

test('fluxo completo: receitas, despesas, resumo, caixa e consistência', async () => {
  const services = (await call('GET', '/services')).body;
  const cabelo = services.find((s) => s.name === 'Cabelo');
  const combo = services.find((s) => s.name === 'Cabelo + Barba');

  let r = await call('POST', '/revenues', { date: '2026-11-03', service_id: cabelo.id, quantity: 3, unit_price_cents: 4000, payment_method: 'pix' });
  assert.equal(r.status, 201);
  assert.equal(r.body.total_cents, 12000);
  const r2 = await call('POST', '/revenues', { date: '2026-11-04', service_id: combo.id, quantity: 1, unit_price_cents: 6500, payment_method: 'dinheiro', notes: 'cliente novo' });
  await call('POST', '/revenues', { date: '2026-10-10', service_id: cabelo.id, quantity: 2, unit_price_cents: 4000, payment_method: 'debito' });

  const e = await call('POST', '/expenses', { date: '2026-11-05', description: 'Aluguel', category: 'aluguel', amount_cents: 10000, type: 'fixa', payment_method: 'pix' });
  assert.equal(e.status, 201);
  await call('POST', '/expenses', { date: '2026-11-06', description: 'Lâminas', category: 'descartaveis', amount_cents: 2500, type: 'variavel', payment_method: 'dinheiro' });

  const s = (await call('GET', '/summary?start=2026-11-01&end=2026-11-30')).body;
  assert.equal(s.revenue_cents, 18500);
  assert.equal(s.expenses_cents, 12500);
  assert.equal(s.profit_cents, 6000);
  assert.equal(s.services, 4);
  assert.equal(s.ticket_cents, Math.round(18500 / 4));
  assert.ok(Math.abs(s.margin - (6000 / 18500) * 100) < 1e-9);
  assert.equal(s.by_service[0].name, 'Cabelo');
  assert.equal(s.by_payment.find((p) => p.id === 'pix').total_cents, 12000);
  assert.equal(s.expenses_by_category.length, 2);

  // edição recalcula total
  const upd = await call('PUT', `/revenues/${r2.body.id}`, { date: '2026-11-04', service_id: combo.id, quantity: 2, unit_price_cents: 6000, payment_method: 'credito' });
  assert.equal(upd.body.total_cents, 12000);
  const s2 = (await call('GET', '/summary?start=2026-11-01&end=2026-11-30')).body;
  assert.equal(s2.revenue_cents, 24000);

  // série mensal
  const ser = (await call('GET', '/series?start=2026-10-01&end=2026-11-30&group=month')).body;
  assert.deepEqual(ser.map((x) => [x.period, x.revenue_cents]), [['2026-10', 8000], ['2026-11', 24000]]);

  // caixa com saldo inicial
  await call('PUT', '/settings', { shop_name: 'Teste', opening_balance_cents: 50000 });
  const cf = (await call('GET', '/cashflow?start=2026-11-01&end=2026-11-30')).body;
  assert.equal(cf.opening_cents, 58000); // 500 + 80 de outubro
  assert.equal(cf.inflow_cents, 24000);
  assert.equal(cf.outflow_cents, 12500);
  assert.equal(cf.closing_cents, 58000 + 24000 - 12500);
  assert.equal(cf.movements.at(-1).balance_cents, cf.closing_cents);
  const day = (await call('GET', '/cashflow?start=2026-11-05&end=2026-11-05')).body;
  assert.equal(day.opening_cents, 58000 + 24000);
  assert.equal(day.closing_cents, 58000 + 24000 - 10000);

  // filtros
  const fil = (await call('GET', '/expenses?start=2026-11-01&end=2026-11-30&category=aluguel')).body;
  assert.equal(fil.length, 1);

  // renomear serviço propaga para relatórios
  await call('PUT', `/services/${cabelo.id}`, { name: 'Corte', price_cents: 4500, description: '', active: true });
  const s3 = (await call('GET', '/summary?start=2026-11-01&end=2026-11-30')).body;
  assert.ok(s3.by_service.some((x) => x.name === 'Corte'));

  // serviço com lançamentos não pode ser excluído
  assert.equal((await call('DELETE', `/services/${cabelo.id}`)).status, 409);

  // exclusão
  assert.equal((await call('DELETE', `/expenses/${e.body.id}`)).status, 204);
  const s4 = (await call('GET', '/summary?start=2026-11-01&end=2026-11-30')).body;
  assert.equal(s4.expenses_cents, 2500);

  // backup / restore ida e volta
  const bk = (await call('GET', '/backup')).body;
  const rs = await call('POST', '/restore', bk);
  assert.equal(rs.status, 200);
  const s5 = (await call('GET', '/summary?start=2026-11-01&end=2026-11-30')).body;
  assert.equal(s5.revenue_cents, s4.revenue_cents);
  assert.equal(s5.expenses_cents, s4.expenses_cents);
});

test('validações', async () => {
  const sv = (await call('GET', '/services')).body[0];
  assert.equal((await call('POST', '/revenues', { date: '2026-02-30', service_id: sv.id, quantity: 1, unit_price_cents: 100, payment_method: 'pix' })).status, 400);
  assert.equal((await call('POST', '/revenues', { date: '2026-02-10', service_id: sv.id, quantity: 0, unit_price_cents: 100, payment_method: 'pix' })).status, 400);
  assert.equal((await call('POST', '/expenses', { date: '2026-02-10', description: 'x', category: 'nada', amount_cents: 100, type: 'fixa', payment_method: 'pix' })).status, 400);
  assert.equal((await call('POST', '/expenses', { date: '2026-02-10', description: '', category: 'agua', amount_cents: 100, type: 'fixa', payment_method: 'pix' })).status, 400);
  assert.equal((await call('GET', '/summary?start=2026-03-01&end=2026-02-01')).status, 400);
  const empty = (await call('GET', '/summary?start=2020-01-01&end=2020-01-31')).body;
  assert.equal(empty.margin, null);
  assert.equal(empty.ticket_cents, null);
});

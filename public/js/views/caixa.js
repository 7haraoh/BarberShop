import { api } from '../api.js';
import { icon } from '../icons.js';
import { periodPicker, toast, emptyState } from '../ui.js';
import { exportPDF, exportXLSX } from '../export.js';
import { money, fmtDate, todayISO, esc, weekday, cap } from '../utils.js';
import { PAYMENT_METHODS, labelOf } from '/shared/constants.js';
import { getSettings } from '../settings.js';

export const title = 'Controle de caixa';
const state = { period: { type: 'day', anchor: null }, range: null, data: null };

export async function render(el) {
  if (!state.period.anchor) state.period.anchor = todayISO();
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Controle de caixa</h1><p class="muted">Fluxo de caixa com fechamento diário e mensal</p></div>
      <div class="btn-group">
        <button class="btn btn-ghost" data-pdf>${icon('file')} PDF</button>
        <button class="btn btn-ghost" data-xlsx>${icon('sheet')} Excel</button>
      </div>
    </div>
    <div class="toolbar"><div data-period></div></div>
    <div data-body><div class="loading">Carregando…</div></div>`;
  el.querySelector('[data-pdf]').addEventListener('click', () => doExport('pdf'));
  el.querySelector('[data-xlsx]').addEventListener('click', () => doExport('xlsx'));
  periodPicker(el.querySelector('[data-period]'), state.period, (r) => {
    state.range = r;
    load(el);
  });
}

export async function load(el) {
  if (!state.range) return;
  const { start, end } = state.range;
  const cf = await api.get('/cashflow', { start, end });
  state.data = cf;
  const single = start === end;
  const net = cf.inflow_cents - cf.outflow_cents;

  const byPm = new Map();
  cf.movements.forEach((m) => {
    const cur = byPm.get(m.payment_method) || { in: 0, out: 0 };
    if (m.kind === 'entrada') cur.in += m.amount_cents;
    else cur.out += m.amount_cents;
    byPm.set(m.payment_method, cur);
  });

  const body = el.querySelector('[data-body]');
  body.innerHTML = `
    <section class="cash-flow">
      <div class="cf-item"><span>Saldo inicial</span><strong>${money(cf.opening_cents)}</strong></div>
      <div class="cf-op">+</div>
      <div class="cf-item in"><span>Entradas</span><strong>${money(cf.inflow_cents)}</strong></div>
      <div class="cf-op">−</div>
      <div class="cf-item out"><span>Saídas</span><strong>${money(cf.outflow_cents)}</strong></div>
      <div class="cf-op">=</div>
      <div class="cf-item final ${cf.closing_cents < 0 ? 'neg' : ''}"><span>Saldo final</span><strong>${money(cf.closing_cents)}</strong></div>
    </section>
    <p class="muted small cf-note">${icon('lock')} ${single ? `Fechamento de ${esc(cap(weekday(start)))}, ${fmtDate(start)}` : `Fechamento do período ${fmtDate(start)} a ${fmtDate(end)}`}
      — resultado do período: <b class="${net < 0 ? 'txt-neg' : 'txt-pos'}">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</b></p>

    ${
      !single && cf.days.length
        ? `<article class="card">
            <header class="card-head"><h3>Fechamentos diários</h3><span class="muted">${cf.days.length} dia(s) com movimento</span></header>
            <div class="table-wrap"><table class="table responsive compact">
              <thead><tr><th>Data</th><th class="num">Saldo inicial</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Resultado</th><th class="num">Saldo final</th></tr></thead>
              <tbody>${cf.days
                .map(
                  (d) => `<tr>
                  <td data-label="Data"><a href="#" data-day="${d.date}" class="link">${fmtDate(d.date)}</a> <span class="muted small">${esc(weekday(d.date).slice(0, 3))}</span></td>
                  <td data-label="Saldo inicial" class="num">${money(d.opening_cents)}</td>
                  <td data-label="Entradas" class="num txt-pos">${money(d.inflow_cents)}</td>
                  <td data-label="Saídas" class="num txt-neg">${money(d.outflow_cents)}</td>
                  <td data-label="Resultado" class="num ${d.net_cents < 0 ? 'txt-neg' : ''}">${money(d.net_cents)}</td>
                  <td data-label="Saldo final" class="num strong">${money(d.closing_cents)}</td></tr>`
                )
                .join('')}</tbody>
            </table></div>
          </article>`
        : ''
    }

    <section class="grid-2col cf-grid">
      <article class="card span-2-lg">
        <header class="card-head"><h3>Movimentações</h3><span class="muted">${cf.movements.length} registro(s)</span></header>
        ${
          cf.movements.length
            ? `<div class="table-wrap"><table class="table responsive compact">
              <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Pagamento</th><th class="num">Valor</th><th class="num">Saldo</th></tr></thead>
              <tbody>${[...cf.movements]
                .reverse()
                .map(
                  (m) => `<tr>
                  <td data-label="Data">${fmtDate(m.date)}</td>
                  <td data-label="Tipo"><span class="pill ${m.kind === 'entrada' ? 'in' : 'out'}">${m.kind === 'entrada' ? 'Entrada' : 'Saída'}</span></td>
                  <td data-label="Descrição">${esc(m.description)}</td>
                  <td data-label="Pagamento">${esc(labelOf(PAYMENT_METHODS, m.payment_method))}</td>
                  <td data-label="Valor" class="num strong ${m.kind === 'entrada' ? 'txt-pos' : 'txt-neg'}">${m.kind === 'entrada' ? '+' : '−'}${money(m.amount_cents)}</td>
                  <td data-label="Saldo" class="num">${money(m.balance_cents)}</td></tr>`
                )
                .join('')}</tbody>
            </table></div>`
            : emptyState('Nenhuma movimentação neste período.')
        }
      </article>
      <article class="card">
        <header class="card-head"><h3>Por forma de pagamento</h3></header>
        ${
          byPm.size
            ? `<div class="table-wrap"><table class="table compact">
              <thead><tr><th>Forma</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo</th></tr></thead>
              <tbody>${PAYMENT_METHODS.filter((p) => byPm.has(p.id))
                .map((p) => {
                  const v = byPm.get(p.id);
                  return `<tr><td>${esc(p.label)}</td><td class="num txt-pos">${money(v.in)}</td><td class="num txt-neg">${money(v.out)}</td><td class="num strong">${money(v.in - v.out)}</td></tr>`;
                })
                .join('')}</tbody>
            </table></div>
            <p class="muted small pad">Útil para conferir o dinheiro em espécie na gaveta e os valores a receber das maquininhas.</p>`
            : '<p class="muted pad">Sem movimentações.</p>'
        }
      </article>
    </section>`;

  body.querySelectorAll('[data-day]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      state.period.type = 'day';
      state.period.anchor = a.dataset.day;
      render(el);
    })
  );
}

async function doExport(kind) {
  const cf = state.data;
  if (!cf) return;
  const settings = await getSettings();
  const R = (c) => c / 100;
  const title = cf.start === cf.end ? 'Fechamento de Caixa Diário' : 'Fluxo de Caixa';
  const base = `caixa-${cf.start}_a_${cf.end}`;
  try {
    if (kind === 'pdf') {
      exportPDF(
        {
          title,
          shop: settings.shop_name,
          subtitle: state.range.label,
          kpis: [
            ['Saldo inicial', money(cf.opening_cents)],
            ['Entradas', money(cf.inflow_cents)],
            ['Saídas', money(cf.outflow_cents)],
            ['Saldo final', money(cf.closing_cents)],
          ],
          sections: [
            ...(cf.start !== cf.end
              ? [
                  {
                    title: 'Fechamentos diários',
                    head: ['Data', 'Saldo inicial', 'Entradas', 'Saídas', 'Saldo final'],
                    align: ['left', 'right', 'right', 'right', 'right'],
                    rows: cf.days.map((d) => [fmtDate(d.date), money(d.opening_cents), money(d.inflow_cents), money(d.outflow_cents), money(d.closing_cents)]),
                  },
                ]
              : []),
            {
              title: 'Movimentações',
              head: ['Data', 'Tipo', 'Descrição', 'Pagamento', 'Valor', 'Saldo'],
              align: ['left', 'left', 'left', 'left', 'right', 'right'],
              rows: cf.movements.map((m) => [
                fmtDate(m.date),
                m.kind === 'entrada' ? 'Entrada' : 'Saída',
                m.description,
                labelOf(PAYMENT_METHODS, m.payment_method),
                (m.kind === 'entrada' ? '+' : '-') + money(m.amount_cents),
                money(m.balance_cents),
              ]),
            },
          ],
        },
        `${base}.pdf`
      );
    } else {
      await exportXLSX(
        {
          title,
          shop: settings.shop_name,
          subtitle: state.range.label,
          kpis: [
            ['Saldo inicial', R(cf.opening_cents), 'money'],
            ['Entradas', R(cf.inflow_cents), 'money'],
            ['Saídas', R(cf.outflow_cents), 'money'],
            ['Saldo final', R(cf.closing_cents), 'money'],
          ],
          sections: [
            {
              title: 'Fechamentos diários',
              head: ['Data', 'Saldo inicial', 'Entradas', 'Saídas', 'Resultado', 'Saldo final'],
              formats: ['text', 'money', 'money', 'money', 'money', 'money'],
              rows: cf.days.map((d) => [fmtDate(d.date), R(d.opening_cents), R(d.inflow_cents), R(d.outflow_cents), R(d.net_cents), R(d.closing_cents)]),
            },
            {
              title: 'Movimentações',
              head: ['Data', 'Tipo', 'Descrição', 'Forma de pagamento', 'Valor', 'Saldo'],
              formats: ['text', 'text', 'text', 'text', 'money', 'money'],
              rows: cf.movements.map((m) => [
                fmtDate(m.date),
                m.kind === 'entrada' ? 'Entrada' : 'Saída',
                m.description,
                labelOf(PAYMENT_METHODS, m.payment_method),
                R(m.kind === 'entrada' ? m.amount_cents : -m.amount_cents),
                R(m.balance_cents),
              ]),
            },
          ],
        },
        `${base}.xlsx`
      );
    }
    toast('Arquivo gerado.');
  } catch (e) {
    toast(e.message, 'error');
  }
}

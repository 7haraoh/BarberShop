import { api } from '../api.js';
import { icon } from '../icons.js';
import { barsRevExpProfit, lineMoney, doughnut, barsSingle } from '../charts.js';
import { money, pct, int, todayISO, addMonthsYM, monthStart, monthEnd, monthLabel, monthShort, cap, esc } from '../utils.js';
import { labelOf, EXPENSE_CATEGORIES } from '/shared/constants.js';

const state = { ym: null };

export const title = 'Dashboard';

function variation(cur, prev) {
  if (!prev) return cur ? null : 0;
  return ((cur - prev) / Math.abs(prev)) * 100;
}
function delta(v, { invert = false, suffix = 'vs mês anterior' } = {}) {
  if (v === null) return `<span class="delta neutral">sem base ${suffix}</span>`;
  const up = v > 0.05;
  const down = v < -0.05;
  const good = invert ? down : up;
  const bad = invert ? up : down;
  const cls = good ? 'pos' : bad ? 'neg' : 'neutral';
  const arrow = up ? '▲' : down ? '▼' : '■';
  return `<span class="delta ${cls}"><b>${arrow} ${pct(Math.abs(v))}</b> ${suffix}</span>`;
}

export async function render(el) {
  if (!state.ym) state.ym = todayISO().slice(0, 7);
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Visão geral</h1>
        <p class="muted">Resumo financeiro do mês selecionado</p>
      </div>
      <div class="month-nav">
        <button class="icon-btn" data-m="-1" aria-label="Mês anterior">${icon('left')}</button>
        <span class="period-label" data-label></span>
        <button class="icon-btn" data-m="1" aria-label="Próximo mês">${icon('right')}</button>
        <button class="btn btn-ghost btn-sm" data-m="0">Mês atual</button>
      </div>
    </div>
    <div data-body><div class="loading">Carregando…</div></div>`;
  el.querySelectorAll('[data-m]').forEach((b) =>
    b.addEventListener('click', () => {
      const d = Number(b.dataset.m);
      state.ym = d === 0 ? todayISO().slice(0, 7) : addMonthsYM(state.ym, d);
      load(el);
    })
  );
  await load(el);
}

async function load(el) {
  const ym = state.ym;
  const prevYm = addMonthsYM(ym, -1);
  el.querySelector('[data-label]').textContent = cap(monthLabel(ym));
  const [cur, prev, months] = await Promise.all([
    api.get('/summary', { start: monthStart(ym), end: monthEnd(ym) }),
    api.get('/summary', { start: monthStart(prevYm), end: monthEnd(prevYm) }),
    api.get('/series', { start: monthStart(addMonthsYM(ym, -11)), end: monthEnd(ym), group: 'month' }),
  ]);
  if (state.ym !== ym) return; // navegação mudou durante o carregamento

  const vRev = variation(cur.revenue_cents, prev.revenue_cents);
  const vExp = variation(cur.expenses_cents, prev.expenses_cents);
  const vProfit = variation(cur.profit_cents, prev.profit_cents);
  const diffRev = cur.revenue_cents - prev.revenue_cents;
  const last6 = months.slice(-6);

  const body = el.querySelector('[data-body]');
  body.innerHTML = `
    <section class="kpis-hero">
      <article class="kpi kpi-hero kpi-rev">
        <div class="kpi-top"><span class="kpi-ico">${icon('income')}</span><span>Faturamento do mês</span></div>
        <strong class="kpi-value">${money(cur.revenue_cents)}</strong>
        ${delta(vRev)}
      </article>
      <article class="kpi kpi-hero kpi-exp">
        <div class="kpi-top"><span class="kpi-ico">${icon('expense')}</span><span>Despesas do mês</span></div>
        <strong class="kpi-value">${money(cur.expenses_cents)}</strong>
        ${delta(vExp, { invert: true })}
      </article>
      <article class="kpi kpi-hero kpi-profit ${cur.profit_cents < 0 ? 'is-neg' : ''}">
        <div class="kpi-top"><span class="kpi-ico">${icon('wallet')}</span><span>Lucro líquido</span></div>
        <strong class="kpi-value">${money(cur.profit_cents)}</strong>
        ${delta(vProfit)}
      </article>
    </section>
    <section class="kpis">
      <article class="kpi">
        <div class="kpi-top"><span class="kpi-ico">${icon('percent')}</span><span>Margem de lucro</span></div>
        <strong class="kpi-value">${pct(cur.margin)}</strong>
        <span class="kpi-sub">Mês anterior: ${pct(prev.margin)}</span>
      </article>
      <article class="kpi">
        <div class="kpi-top"><span class="kpi-ico">${icon('scissors')}</span><span>Serviços realizados</span></div>
        <strong class="kpi-value">${int(cur.services)}</strong>
        <span class="kpi-sub">Mês anterior: ${int(prev.services)}</span>
      </article>
      <article class="kpi">
        <div class="kpi-top"><span class="kpi-ico">${icon('ticket')}</span><span>Ticket médio</span></div>
        <strong class="kpi-value">${cur.ticket_cents === null ? '—' : money(cur.ticket_cents)}</strong>
        <span class="kpi-sub">Mês anterior: ${prev.ticket_cents === null ? '—' : money(prev.ticket_cents)}</span>
      </article>
      <article class="kpi">
        <div class="kpi-top"><span class="kpi-ico">${icon('trend')}</span><span>Vs. ${esc(monthShort(prevYm))}</span></div>
        <strong class="kpi-value ${diffRev > 0 ? 'txt-pos' : diffRev < 0 ? 'txt-neg' : ''}">${vRev === null ? '—' : (vRev > 0 ? '+' : '') + pct(vRev)}</strong>
        <span class="kpi-sub">${diffRev >= 0 ? '+' : '−'}${money(Math.abs(diffRev))} de faturamento</span>
      </article>
    </section>

    <section class="grid-charts">
      <article class="card span-2">
        <header class="card-head"><h3>Faturamento × Despesas × Lucro</h3><span class="muted">Últimos 6 meses</span></header>
        <div class="chart h-280"><canvas id="ch-rep" role="img" aria-label="Gráfico de barras com faturamento, despesas e lucro dos últimos 6 meses"></canvas></div>
      </article>
      <article class="card">
        <header class="card-head"><h3>Receitas por serviço</h3><span class="muted">${esc(cap(monthLabel(ym)))}</span></header>
        <div class="chart h-260" data-donut="svc"><canvas id="ch-svc" role="img" aria-label="Distribuição de receitas por serviço"></canvas></div>
      </article>
      <article class="card">
        <header class="card-head"><h3>Despesas por categoria</h3><span class="muted">${esc(cap(monthLabel(ym)))}</span></header>
        <div class="chart h-260" data-donut="cat"><canvas id="ch-cat" role="img" aria-label="Distribuição de despesas por categoria"></canvas></div>
      </article>
      <article class="card span-2">
        <header class="card-head"><h3>Evolução do faturamento mensal</h3><span class="muted">Últimos 12 meses</span></header>
        <div class="chart h-240"><canvas id="ch-evo" role="img" aria-label="Evolução do faturamento mensal"></canvas></div>
      </article>
      <article class="card span-2">
        <header class="card-head"><h3>Comparativo de desempenho entre os meses</h3><span class="muted">Margem de lucro mensal e indicadores</span></header>
        <div class="chart h-200"><canvas id="ch-margin" role="img" aria-label="Margem de lucro por mês"></canvas></div>
        <div class="table-wrap">
          <table class="table compact">
            <thead><tr><th>Mês</th><th class="num">Faturamento</th><th class="num">Despesas</th><th class="num">Lucro</th><th class="num">Margem</th><th class="num">Serviços</th><th class="num">Ticket médio</th><th class="num">Var. fat.</th></tr></thead>
            <tbody>
              ${last6
                .map((m, i, arr) => {
                  const p = i > 0 ? arr[i - 1] : months[months.length - 7];
                  const v = p ? variation(m.revenue_cents, p.revenue_cents) : null;
                  return `<tr class="${m.period === ym ? 'row-hl' : ''}">
                    <td>${esc(cap(monthShort(m.period)))}</td>
                    <td class="num">${money(m.revenue_cents)}</td>
                    <td class="num">${money(m.expenses_cents)}</td>
                    <td class="num ${m.profit_cents < 0 ? 'txt-neg' : ''}">${money(m.profit_cents)}</td>
                    <td class="num">${pct(m.margin)}</td>
                    <td class="num">${int(m.services)}</td>
                    <td class="num">${m.ticket_cents === null ? '—' : money(m.ticket_cents)}</td>
                    <td class="num ${v > 0 ? 'txt-pos' : v < 0 ? 'txt-neg' : ''}">${v === null ? '—' : (v > 0 ? '+' : '') + pct(v)}</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </article>
    </section>`;

  barsRevExpProfit(body.querySelector('#ch-rep'), last6.map((m) => cap(monthShort(m.period))), last6);
  lineMoney(body.querySelector('#ch-evo'), months.map((m) => cap(monthShort(m.period))), months.map((m) => m.revenue_cents));
  barsSingle(
    body.querySelector('#ch-margin'),
    months.map((m) => cap(monthShort(m.period))),
    months.map((m) => (m.margin === null ? 0 : Number(m.margin.toFixed(1)))),
    { label: 'Margem de lucro', format: (v) => pct(v, 0) }
  );
  donutOrEmpty(body, 'svc', cur.by_service.map((s) => ({ label: s.name, value: s.total_cents })), 'Sem receitas neste mês', 'Receitas');
  donutOrEmpty(
    body,
    'cat',
    cur.expenses_by_category.map((c) => ({ label: labelOf(EXPENSE_CATEGORIES, c.id), value: c.total_cents })),
    'Sem despesas neste mês',
    'Despesas'
  );
}

function donutOrEmpty(root, key, items, emptyText, center) {
  const box = root.querySelector(`[data-donut="${key}"]`);
  if (!items.some((i) => i.value > 0)) {
    box.innerHTML = `<div class="chart-empty">${icon('report')}<span>${esc(emptyText)}</span></div>`;
    return;
  }
  doughnut(box.querySelector('canvas'), items, { centerLabel: center });
}

import { api } from '../api.js';
import { icon } from '../icons.js';
import { periodPicker, toast } from '../ui.js';
import { linesMulti, doughnut } from '../charts.js';
import { exportPDF, exportXLSX } from '../export.js';
import { money, pct, int, fmtDate, todayISO, esc, daysBetween, monthShort, cap } from '../utils.js';
import { PAYMENT_METHODS, EXPENSE_CATEGORIES, EXPENSE_TYPES, labelOf } from '/shared/constants.js';
import { getSettings } from '../settings.js';

export const title = 'Relatórios';
const state = { period: { type: 'month', anchor: null }, range: null, data: null };

export async function render(el) {
  if (!state.period.anchor) state.period.anchor = todayISO();
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Relatórios financeiros</h1><p class="muted">Análise completa por período</p></div>
      <div class="btn-group">
        <button class="btn btn-ghost" data-pdf>${icon('file')} Exportar PDF</button>
        <button class="btn btn-ghost" data-xlsx>${icon('sheet')} Exportar Excel</button>
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
  const group = daysBetween(start, end) > 62 ? 'month' : 'day';
  const [sum, ser, revenues, expenses] = await Promise.all([
    api.get('/summary', { start, end }),
    api.get('/series', { start, end, group }),
    api.get('/revenues', { start, end }),
    api.get('/expenses', { start, end }),
  ]);
  state.data = { sum, ser, group, revenues, expenses, range: state.range };
  const label = (p) => (group === 'month' ? cap(monthShort(p)) : fmtDate(p).slice(0, 5));
  const fixed = (sum.expenses_by_type.find((t) => t.id === 'fixa') || {}).total_cents || 0;
  const share = (v, t) => (t ? (v / t) * 100 : 0);

  const body = el.querySelector('[data-body]');
  body.innerHTML = `
    <section class="kpis six">
      ${kpi('Faturamento bruto', money(sum.revenue_cents), 'income', 'txt-gold')}
      ${kpi('Total de despesas', money(sum.expenses_cents), 'expense', 'txt-neg')}
      ${kpi('Lucro líquido', money(sum.profit_cents), 'wallet', sum.profit_cents < 0 ? 'txt-neg' : 'txt-pos')}
      ${kpi('Margem de lucro', pct(sum.margin), 'percent')}
      ${kpi('Serviços realizados', int(sum.services), 'scissors')}
      ${kpi('Ticket médio', sum.ticket_cents === null ? '—' : money(sum.ticket_cents), 'ticket')}
    </section>

    <article class="card">
      <header class="card-head"><h3>Evolução financeira</h3><span class="muted">${group === 'month' ? 'Por mês' : 'Por dia'} — ${esc(state.range.label)}</span></header>
      <div class="chart h-280"><canvas id="rp-evo" role="img" aria-label="Evolução de faturamento, despesas e lucro"></canvas></div>
    </article>

    <section class="grid-2col">
      <article class="card">
        <header class="card-head"><h3>Serviços mais vendidos</h3></header>
        ${table(
          ['#', 'Serviço', 'Qtd', 'Faturamento', '%'],
          sum.by_service.map((s, i) => [`${i + 1}º`, esc(s.name), int(s.quantity), money(s.total_cents), pct(share(s.total_cents, sum.revenue_cents))]),
          [money(sum.revenue_cents)],
          'Sem receitas no período'
        )}
      </article>
      <article class="card">
        <header class="card-head"><h3>Receita por forma de pagamento</h3></header>
        <div class="chart h-220" data-donut><canvas id="rp-pay" role="img" aria-label="Receita por forma de pagamento"></canvas></div>
        ${table(
          ['Forma de pagamento', 'Lançamentos', 'Valor', '%'],
          sum.by_payment.map((p) => [esc(labelOf(PAYMENT_METHODS, p.id)), int(p.entries), money(p.total_cents), pct(share(p.total_cents, sum.revenue_cents))]),
          null,
          'Sem receitas no período'
        )}
      </article>
      <article class="card">
        <header class="card-head"><h3>Despesas por categoria</h3>
          <span class="muted">Fixas ${money(fixed)} · Variáveis ${money(sum.expenses_cents - fixed)}</span></header>
        ${table(
          ['Categoria', 'Lançamentos', 'Valor', '%'],
          sum.expenses_by_category.map((c) => [esc(labelOf(EXPENSE_CATEGORIES, c.id)), int(c.entries), money(c.total_cents), pct(share(c.total_cents, sum.expenses_cents))]),
          [money(sum.expenses_cents)],
          'Sem despesas no período'
        )}
      </article>
      <article class="card">
        <header class="card-head"><h3>Demonstrativo do resultado</h3></header>
        <dl class="dre">
          <div><dt>Faturamento bruto</dt><dd class="txt-gold">${money(sum.revenue_cents)}</dd></div>
          <div><dt>(−) Despesas fixas</dt><dd>${money(fixed)}</dd></div>
          <div><dt>(−) Despesas variáveis</dt><dd>${money(sum.expenses_cents - fixed)}</dd></div>
          <div class="sep"><dt>(=) Lucro líquido</dt><dd class="${sum.profit_cents < 0 ? 'txt-neg' : 'txt-pos'}">${money(sum.profit_cents)}</dd></div>
          <div><dt>Margem de lucro</dt><dd>${pct(sum.margin)}</dd></div>
          <div><dt>Serviços realizados</dt><dd>${int(sum.services)}</dd></div>
          <div><dt>Ticket médio</dt><dd>${sum.ticket_cents === null ? '—' : money(sum.ticket_cents)}</dd></div>
        </dl>
      </article>
    </section>`;

  linesMulti(body.querySelector('#rp-evo'), ser.map((s) => label(s.period)), ser);
  const payItems = sum.by_payment.map((p) => ({ label: labelOf(PAYMENT_METHODS, p.id), value: p.total_cents }));
  if (payItems.length) doughnut(body.querySelector('#rp-pay'), payItems, { centerLabel: 'Receitas' });
  else body.querySelector('[data-donut]').remove();
}

const kpi = (label, value, ico, cls = '') =>
  `<article class="kpi"><div class="kpi-top"><span class="kpi-ico">${icon(ico)}</span><span>${label}</span></div><strong class="kpi-value ${cls}">${value}</strong></article>`;

function table(head, rows, totalRight, emptyText) {
  if (!rows.length) return `<p class="muted pad">${emptyText}</p>`;
  const n = head.length;
  return `<div class="table-wrap"><table class="table compact">
    <thead><tr>${head.map((h, i) => `<th class="${i >= n - 3 && i > 0 ? 'num' : ''}">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i >= n - 3 && i > 0 ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody>
    ${totalRight ? `<tfoot><tr><td colspan="${n - 2}">Total</td><td class="num">${totalRight[0]}</td><td class="num">100%</td></tr></tfoot>` : ''}
  </table></div>`;
}

async function doExport(kind) {
  const d = state.data;
  if (!d) return;
  const { sum, ser, group, revenues, expenses, range } = d;
  const settings = await getSettings();
  const R = (c) => c / 100; // centavos -> reais (Excel)
  const share = (v, t) => (t ? (v / t) * 100 : 0);
  const fixed = (sum.expenses_by_type.find((t) => t.id === 'fixa') || {}).total_cents || 0;
  const periodLabel = (p) => (group === 'month' ? cap(monthShort(p)) : fmtDate(p));
  const base = `relatorio-${range.start}_a_${range.end}`;

  try {
    if (kind === 'pdf') {
      exportPDF(
        {
          title: 'Relatório Financeiro',
          shop: settings.shop_name,
          subtitle: `${range.label}`,
          kpis: [
            ['Faturamento bruto', money(sum.revenue_cents)],
            ['Total de despesas', money(sum.expenses_cents)],
            ['Lucro líquido', money(sum.profit_cents)],
            ['Margem de lucro', pct(sum.margin)],
            ['Serviços realizados', int(sum.services)],
            ['Ticket médio', sum.ticket_cents === null ? '—' : money(sum.ticket_cents)],
            ['Despesas fixas', money(fixed)],
            ['Despesas variáveis', money(sum.expenses_cents - fixed)],
          ],
          sections: [
            {
              title: 'Serviços mais vendidos',
              head: ['#', 'Serviço', 'Quantidade', 'Faturamento', '%'],
              align: ['left', 'left', 'right', 'right', 'right'],
              rows: sum.by_service.map((s, i) => [`${i + 1}º`, s.name, int(s.quantity), money(s.total_cents), pct(share(s.total_cents, sum.revenue_cents))]),
              foot: ['', 'Total', int(sum.services), money(sum.revenue_cents), '100%'],
            },
            {
              title: 'Receita por forma de pagamento',
              head: ['Forma de pagamento', 'Lançamentos', 'Valor', '%'],
              align: ['left', 'right', 'right', 'right'],
              rows: sum.by_payment.map((p) => [labelOf(PAYMENT_METHODS, p.id), int(p.entries), money(p.total_cents), pct(share(p.total_cents, sum.revenue_cents))]),
            },
            {
              title: 'Despesas por categoria',
              head: ['Categoria', 'Lançamentos', 'Valor', '%'],
              align: ['left', 'right', 'right', 'right'],
              rows: sum.expenses_by_category.map((c) => [labelOf(EXPENSE_CATEGORIES, c.id), int(c.entries), money(c.total_cents), pct(share(c.total_cents, sum.expenses_cents))]),
              foot: ['Total', '', money(sum.expenses_cents), '100%'],
            },
            {
              title: `Evolução financeira (${group === 'month' ? 'mensal' : 'diária'})`,
              head: ['Período', 'Faturamento', 'Despesas', 'Lucro', 'Margem', 'Serviços'],
              align: ['left', 'right', 'right', 'right', 'right', 'right'],
              rows: ser
                .filter((s) => group === 'month' || s.revenue_cents || s.expenses_cents)
                .map((s) => [periodLabel(s.period), money(s.revenue_cents), money(s.expenses_cents), money(s.profit_cents), pct(s.margin), int(s.services)]),
            },
            {
              title: 'Receitas detalhadas',
              head: ['Data', 'Serviço', 'Qtd', 'Valor unit.', 'Total', 'Pagamento'],
              align: ['left', 'left', 'right', 'right', 'right', 'left'],
              rows: [...revenues].reverse().map((r) => [fmtDate(r.date), r.service_name, int(r.quantity), money(r.unit_price_cents), money(r.total_cents), labelOf(PAYMENT_METHODS, r.payment_method)]),
            },
            {
              title: 'Despesas detalhadas',
              head: ['Data', 'Descrição', 'Categoria', 'Tipo', 'Pagamento', 'Valor'],
              align: ['left', 'left', 'left', 'left', 'left', 'right'],
              rows: [...expenses].reverse().map((e) => [fmtDate(e.date), e.description, labelOf(EXPENSE_CATEGORIES, e.category), labelOf(EXPENSE_TYPES, e.type), labelOf(PAYMENT_METHODS, e.payment_method), money(e.amount_cents)]),
            },
          ],
        },
        `${base}.pdf`
      );
    } else {
      await exportXLSX(
        {
          title: 'Relatório Financeiro',
          shop: settings.shop_name,
          subtitle: range.label,
          kpis: [
            ['Período', `${fmtDate(range.start)} a ${fmtDate(range.end)}`],
            ['Faturamento bruto', R(sum.revenue_cents), 'money'],
            ['Total de despesas', R(sum.expenses_cents), 'money'],
            ['Lucro líquido', R(sum.profit_cents), 'money'],
            ['Margem de lucro', sum.margin === null ? '—' : Number(sum.margin.toFixed(2)), 'pct'],
            ['Serviços realizados', sum.services, 'int'],
            ['Ticket médio', sum.ticket_cents === null ? '—' : R(sum.ticket_cents), 'money'],
            ['Despesas fixas', R(fixed), 'money'],
            ['Despesas variáveis', R(sum.expenses_cents - fixed), 'money'],
          ],
          sections: [
            {
              title: 'Serviços mais vendidos',
              sheet: 'Serviços',
              head: ['Posição', 'Serviço', 'Quantidade', 'Faturamento', '%'],
              formats: ['int', 'text', 'int', 'money', 'pct'],
              rows: sum.by_service.map((s, i) => [i + 1, s.name, s.quantity, R(s.total_cents), Number(share(s.total_cents, sum.revenue_cents).toFixed(2))]),
            },
            {
              title: 'Formas de pagamento',
              head: ['Forma de pagamento', 'Lançamentos', 'Valor', '%'],
              formats: ['text', 'int', 'money', 'pct'],
              rows: sum.by_payment.map((p) => [labelOf(PAYMENT_METHODS, p.id), p.entries, R(p.total_cents), Number(share(p.total_cents, sum.revenue_cents).toFixed(2))]),
            },
            {
              title: 'Despesas por categoria',
              sheet: 'Categorias',
              head: ['Categoria', 'Lançamentos', 'Valor', '%'],
              formats: ['text', 'int', 'money', 'pct'],
              rows: sum.expenses_by_category.map((c) => [labelOf(EXPENSE_CATEGORIES, c.id), c.entries, R(c.total_cents), Number(share(c.total_cents, sum.expenses_cents).toFixed(2))]),
            },
            {
              title: 'Evolução',
              head: ['Período', 'Faturamento', 'Despesas', 'Lucro', 'Margem', 'Serviços', 'Ticket médio'],
              formats: ['text', 'money', 'money', 'money', 'pct', 'int', 'money'],
              rows: ser.map((s) => [
                periodLabel(s.period),
                R(s.revenue_cents),
                R(s.expenses_cents),
                R(s.profit_cents),
                s.margin === null ? null : Number(s.margin.toFixed(2)),
                s.services,
                s.ticket_cents === null ? null : R(s.ticket_cents),
              ]),
            },
            {
              title: 'Receitas',
              head: ['Data', 'Serviço', 'Quantidade', 'Valor unitário', 'Total', 'Forma de pagamento', 'Observações'],
              formats: ['text', 'text', 'int', 'money', 'money', 'text', 'text'],
              rows: [...revenues].reverse().map((r) => [fmtDate(r.date), r.service_name, r.quantity, R(r.unit_price_cents), R(r.total_cents), labelOf(PAYMENT_METHODS, r.payment_method), r.notes]),
            },
            {
              title: 'Despesas',
              head: ['Data', 'Descrição', 'Categoria', 'Tipo', 'Forma de pagamento', 'Valor', 'Observações'],
              formats: ['text', 'text', 'text', 'text', 'text', 'money', 'text'],
              rows: [...expenses].reverse().map((e) => [fmtDate(e.date), e.description, labelOf(EXPENSE_CATEGORIES, e.category), labelOf(EXPENSE_TYPES, e.type), labelOf(PAYMENT_METHODS, e.payment_method), R(e.amount_cents), e.notes]),
            },
          ],
        },
        `${base}.xlsx`
      );
    }
    toast(kind === 'pdf' ? 'PDF gerado.' : 'Planilha Excel gerada.');
  } catch (e) {
    toast(e.message, 'error');
  }
}

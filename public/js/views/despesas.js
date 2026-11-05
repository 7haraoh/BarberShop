import { api, dataChanged } from '../api.js';
import { icon } from '../icons.js';
import { periodPicker, confirmDialog, toast, emptyState } from '../ui.js';
import { expenseForm } from '../forms.js';
import { money, fmtDate, todayISO, esc, debounce, pct } from '../utils.js';
import { PAYMENT_METHODS, EXPENSE_CATEGORIES, EXPENSE_TYPES, labelOf } from '../../shared/constants.js';

export const title = 'Despesas';
const state = { period: { type: 'month', anchor: null }, filters: { category: '', type: '', payment_method: '', q: '' }, range: null };

export async function render(el) {
  if (!state.period.anchor) state.period.anchor = todayISO();
  const sel = (f, list, all) =>
    `<select data-f="${f}" aria-label="${all}"><option value="">${all}</option>${list
      .map((o) => `<option value="${o.id}" ${state.filters[f] === o.id ? 'selected' : ''}>${esc(o.label)}</option>`)
      .join('')}</select>`;
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Despesas e custos</h1><p class="muted">Gastos fixos e variáveis da barbearia</p></div>
      <button class="btn btn-gold" data-new>${icon('plus')} Nova despesa</button>
    </div>
    <div class="toolbar"><div data-period></div></div>
    <section class="stats-row" data-stats></section>
    <section class="card">
      <header class="card-head wrap">
        <h3>Lançamentos</h3>
        <div class="filters">
          <label class="search">${icon('search')}<input type="search" placeholder="Buscar descrição..." value="${esc(state.filters.q)}" data-f="q" aria-label="Buscar"></label>
          ${sel('category', EXPENSE_CATEGORIES, 'Todas as categorias')}
          ${sel('type', EXPENSE_TYPES, 'Fixas e variáveis')}
          ${sel('payment_method', PAYMENT_METHODS, 'Todas as formas')}
        </div>
      </header>
      <div data-list><div class="loading">Carregando…</div></div>
    </section>`;
  el.querySelector('[data-new]').addEventListener('click', () => expenseForm());
  el.querySelectorAll('[data-f]').forEach((inp) => {
    const h = () => {
      state.filters[inp.dataset.f] = inp.value;
      load(el);
    };
    inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', inp.tagName === 'SELECT' ? h : debounce(h, 250));
  });
  periodPicker(el.querySelector('[data-period]'), state.period, (r) => {
    state.range = r;
    load(el);
  });
}

export async function load(el) {
  if (!state.range) return;
  const { start, end } = state.range;
  const rows = await api.get('/expenses', { start, end, ...state.filters });
  const filtered = Object.values(state.filters).some(Boolean);
  const total = rows.reduce((a, r) => a + r.amount_cents, 0);
  const fixed = rows.filter((r) => r.type === 'fixa').reduce((a, r) => a + r.amount_cents, 0);
  const byCat = new Map();
  rows.forEach((r) => byCat.set(r.category, (byCat.get(r.category) || 0) + r.amount_cents));
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);

  el.querySelector('[data-stats]').innerHTML = `
    <div class="stat"><span>Total de despesas ${filtered ? '(filtrado)' : 'no período'}</span><strong class="txt-neg">${money(total)}</strong></div>
    <div class="stat"><span>Despesas fixas</span><strong>${money(fixed)}</strong></div>
    <div class="stat"><span>Despesas variáveis</span><strong>${money(total - fixed)}</strong></div>
    <div class="stat stat-wide">
      <span>Despesas por categoria</span>
      <div class="mini-bars">
        ${
          cats.length
            ? cats
                .map(
                  ([c, v]) => `<div class="mini-bar"><span class="mb-label">${esc(labelOf(EXPENSE_CATEGORIES, c))}</span>
                  <span class="mb-track exp"><i style="width:${total ? (v / total) * 100 : 0}%"></i></span>
                  <span class="mb-val">${money(v)} <em>${pct(total ? (v / total) * 100 : 0, 0)}</em></span></div>`
                )
                .join('')
            : '<span class="muted">Sem despesas no período</span>'
        }
      </div>
    </div>`;

  const list = el.querySelector('[data-list]');
  if (!rows.length) {
    list.innerHTML = emptyState(filtered ? 'Nenhuma despesa encontrada com esses filtros.' : 'Nenhuma despesa lançada neste período.');
    return;
  }
  list.innerHTML = `
    <div class="table-wrap">
      <table class="table responsive">
        <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Pagamento</th><th class="num">Valor</th><th>Observações</th><th class="actions"><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
                <td data-label="Data">${fmtDate(r.date)}</td>
                <td data-label="Descrição" class="strong">${esc(r.description)}</td>
                <td data-label="Categoria"><span class="tag">${esc(labelOf(EXPENSE_CATEGORIES, r.category))}</span></td>
                <td data-label="Tipo"><span class="pill ${r.type}">${esc(labelOf(EXPENSE_TYPES, r.type))}</span></td>
                <td data-label="Pagamento">${esc(labelOf(PAYMENT_METHODS, r.payment_method))}</td>
                <td data-label="Valor" class="num strong txt-neg">${money(r.amount_cents)}</td>
                <td data-label="Obs." class="notes">${esc(r.notes) || '<span class="muted">—</span>'}</td>
                <td class="actions">
                  <button class="icon-btn" data-edit="${r.id}" aria-label="Editar">${icon('edit')}</button>
                  <button class="icon-btn danger" data-del="${r.id}" aria-label="Excluir">${icon('trash')}</button>
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
        <tfoot><tr><td colspan="5">Total (${rows.length} lançamento${rows.length > 1 ? 's' : ''})</td><td class="num strong txt-neg">${money(total)}</td><td colspan="2"></td></tr></tfoot>
      </table>
    </div>`;
  list.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => expenseForm(rows.find((r) => r.id === Number(b.dataset.edit)))));
  list.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const r = rows.find((x) => x.id === Number(b.dataset.del));
      const ok = await confirmDialog({
        title: 'Excluir despesa',
        message: `Excluir a despesa "${r.description}" de ${money(r.amount_cents)} em ${fmtDate(r.date)}? Esta ação não pode ser desfeita.`,
      });
      if (!ok) return;
      try {
        await api.del(`/expenses/${r.id}`);
        toast('Despesa excluída.');
        dataChanged('expenses');
      } catch (e) {
        toast(e.message, 'error');
      }
    })
  );
}

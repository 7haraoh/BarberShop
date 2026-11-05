import { api } from '../api.js';
import { icon } from '../icons.js';
import { periodPicker, emptyState, dayList, moreButton, bindFilterToggle } from '../ui.js';
import { expenseForm } from '../forms.js';
import { money, fmtDate, todayISO, esc, debounce, pct, $ } from '../utils.js';
import { PAYMENT_METHODS, EXPENSE_CATEGORIES, EXPENSE_TYPES, labelOf } from '../../shared/constants.js';

export const title = 'Despesas';
const PAGE = 40;
const state = { period: { type: 'month', anchor: null }, filters: { category: '', type: '', payment_method: '', q: '' }, range: null, limit: PAGE };

export async function render(el) {
  if (!state.period.anchor) state.period.anchor = todayISO();
  const sel = (f, list, all) =>
    `<select data-f="${f}" aria-label="${all}"><option value="">${all}</option>${list
      .map((o) => `<option value="${o.id}" ${state.filters[f] === o.id ? 'selected' : ''}>${esc(o.label)}</option>`)
      .join('')}</select>`;
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Despesas e custos</h1><p class="muted hide-mobile">Gastos fixos e variáveis da barbearia</p></div>
      <button class="btn btn-gold hide-mobile" data-new>${icon('plus')} Nova despesa</button>
    </div>
    <div class="toolbar"><div data-period></div></div>
    <section class="stats-row" data-stats></section>
    <section class="card">
      <header class="card-head wrap">
        <h3>Lançamentos</h3>
        <button type="button" class="btn btn-ghost btn-sm only-mobile" data-filter-toggle>${icon('search')} Filtros<span data-count></span></button>
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
      state.limit = PAGE;
      load(el);
    };
    inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', inp.tagName === 'SELECT' ? h : debounce(h, 250));
  });
  periodPicker(el.querySelector('[data-period]'), state.period, (r) => {
    state.range = r;
    state.limit = PAGE;
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
    <div class="stat"><span>Total${filtered ? ' (filtrado)' : ''}</span><strong class="txt-neg">${money(total)}</strong></div>
    <div class="stat"><span>Fixas</span><strong>${money(fixed)}</strong></div>
    <div class="stat"><span>Variáveis</span><strong>${money(total - fixed)}</strong></div>
    <details class="stat stat-wide" ${matchMedia('(min-width: 721px)').matches ? 'open' : ''}>
      <summary>Despesas por categoria</summary>
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
    </details>`;
  bindFilterToggle(el, Object.values(state.filters).filter(Boolean).length);

  const list = el.querySelector('[data-list]');
  if (!rows.length) {
    list.innerHTML = emptyState(filtered ? 'Nenhuma despesa encontrada com esses filtros.' : 'Nenhuma despesa lançada neste período.');
    return;
  }
  const shown = rows.slice(0, state.limit);
  list.innerHTML = `
    <div class="only-mobile">
      ${dayList(
        shown.map((r) => ({
          id: r.id,
          date: r.date,
          title: esc(r.description),
          sub: [labelOf(EXPENSE_CATEGORIES, r.category), labelOf(EXPENSE_TYPES, r.type), labelOf(PAYMENT_METHODS, r.payment_method)].map(esc).join(' · '),
          amount_cents: r.amount_cents,
          cls: 'txt-neg',
        }))
      )}
      <p class="muted small tap-hint">Toque em uma despesa para editar ou excluir.</p>
    </div>
    <div class="table-wrap hide-mobile">
      <table class="table">
        <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Pagamento</th><th class="num">Valor</th><th>Observações</th><th class="actions"><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>
          ${shown
            .map(
              (r) => `<tr>
                <td>${fmtDate(r.date)}</td>
                <td class="strong">${esc(r.description)}</td>
                <td><span class="tag">${esc(labelOf(EXPENSE_CATEGORIES, r.category))}</span></td>
                <td><span class="pill ${r.type}">${esc(labelOf(EXPENSE_TYPES, r.type))}</span></td>
                <td>${esc(labelOf(PAYMENT_METHODS, r.payment_method))}</td>
                <td class="num strong txt-neg">${money(r.amount_cents)}</td>
                <td class="notes">${esc(r.notes) || '<span class="muted">—</span>'}</td>
                <td class="actions"><button class="icon-btn" data-open="${r.id}" aria-label="Editar ou excluir">${icon('edit')}</button></td>
              </tr>`
            )
            .join('')}
        </tbody>
        <tfoot><tr><td colspan="5">Total (${rows.length} lançamento${rows.length > 1 ? 's' : ''})</td><td class="num strong txt-neg">${money(total)}</td><td colspan="2"></td></tr></tfoot>
      </table>
    </div>
    ${moreButton(shown.length, rows.length)}`;
  list.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => expenseForm(rows.find((r) => r.id === Number(b.dataset.open)))));
  $('[data-more]', list)?.addEventListener('click', () => {
    state.limit += PAGE * 2;
    load(el);
  });
}

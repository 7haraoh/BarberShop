import { api, dataChanged } from '../api.js';
import { icon } from '../icons.js';
import { periodPicker, toast, emptyState, openModal, closeModal, dateField, readDate, dayList, moreButton, bindFilterToggle } from '../ui.js';
import { revenueForm, getServices, lastPayment, rememberPayment, paymentChips } from '../forms.js';
import { money, int, fmtDate, todayISO, esc, debounce, pct, $ } from '../utils.js';
import { PAYMENT_METHODS, labelOf } from '../../shared/constants.js';

export const title = 'Receitas';
const PAGE = 40;
const state = {
  period: { type: 'month', anchor: null },
  filters: { service: '', payment_method: '', q: '' },
  range: null,
  limit: PAGE,
  cart: new Map(), // serviceId -> quantidade selecionada no lançamento rápido
};

export async function render(el) {
  if (!state.period.anchor) state.period.anchor = todayISO();
  const services = await getServices();
  const active = services.filter((s) => s.active);
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Receitas</h1><p class="muted hide-mobile">Entradas financeiras da barbearia</p></div>
      <button class="btn btn-gold hide-mobile" data-new>${icon('plus')} Nova receita</button>
    </div>

    <section class="card quick">
      <header class="card-head">
        <h3>Lançamento rápido</h3>
        <span class="muted small">Toque para selecionar · confirme no final</span>
      </header>
      <div class="quick-services" data-quick>
        ${
          active
            .map(
              (s) => `<div class="svc-tile" data-tile="${s.id}">
                <button type="button" class="svc-btn" data-add="${s.id}">
                  <span class="svc-name">${esc(s.name)}</span>
                  <span class="svc-price">${s.price_cents ? money(s.price_cents) : 'Informar valor'}</span>
                  <span class="svc-count" data-count></span>
                </button>
                <button type="button" class="svc-minus" data-minus="${s.id}" aria-label="Remover um ${esc(s.name)}">−</button>
              </div>`
            )
            .join('') || '<p class="muted">Nenhum serviço ativo. Cadastre em "Serviços e preços".</p>'
        }
      </div>
      <div class="cart-bar" data-cart hidden>
        <div class="cart-info"><b data-cart-qty></b><span data-cart-total></span></div>
        <button type="button" class="btn btn-ghost btn-sm" data-cart-clear>Limpar</button>
        <button type="button" class="btn btn-gold" data-cart-go>Confirmar</button>
      </div>
    </section>

    <div class="toolbar"><div data-period></div></div>

    <section class="stats-row" data-stats></section>

    <section class="card">
      <header class="card-head wrap">
        <h3>Lançamentos</h3>
        <button type="button" class="btn btn-ghost btn-sm only-mobile" data-filter-toggle>${icon('search')} Filtros<span data-count></span></button>
        <div class="filters">
          <label class="search">${icon('search')}<input type="search" placeholder="Buscar..." value="${esc(state.filters.q)}" data-f="q" aria-label="Buscar"></label>
          <select data-f="service" aria-label="Filtrar por serviço">
            <option value="">Todos os serviços</option>
            ${services.map((s) => `<option ${state.filters.service === s.name ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
          </select>
          <select data-f="payment_method" aria-label="Filtrar por forma de pagamento">
            <option value="">Todas as formas</option>
            ${PAYMENT_METHODS.map((p) => `<option value="${p.id}" ${state.filters.payment_method === p.id ? 'selected' : ''}>${p.label}</option>`).join('')}
          </select>
        </div>
      </header>
      <div data-list><div class="loading">Carregando…</div></div>
    </section>`;

  el.querySelector('[data-new]').addEventListener('click', () => revenueForm());
  bindCart(el, active);

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

// ---------- comanda do lançamento rápido ----------
function bindCart(el, active) {
  const byId = (id) => active.find((s) => s.id === Number(id));
  const paint = () => {
    let qty = 0;
    let total = 0;
    el.querySelectorAll('[data-tile]').forEach((t) => {
      const n = state.cart.get(Number(t.dataset.tile)) || 0;
      t.classList.toggle('on', n > 0);
      t.querySelector('[data-count]').textContent = n ? `${n}×` : '';
      const s = byId(t.dataset.tile);
      qty += n;
      total += n * (s?.price_cents || 0);
    });
    const bar = el.querySelector('[data-cart]');
    bar.hidden = qty === 0;
    document.body.classList.toggle('has-cart', qty > 0);
    el.querySelector('[data-cart-qty]').textContent = `${qty} serviço${qty > 1 ? 's' : ''}`;
    el.querySelector('[data-cart-total]').textContent = money(total);
  };
  // Remove do carrinho serviços que deixaram de existir/ativos.
  for (const id of state.cart.keys()) if (!byId(id)) state.cart.delete(id);

  el.querySelectorAll('[data-add]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = byId(b.dataset.add);
      if (!s.price_cents) return revenueForm(null, { service_id: s.id }); // valor livre: formulário completo
      state.cart.set(s.id, (state.cart.get(s.id) || 0) + 1);
      if (navigator.vibrate) navigator.vibrate(10);
      paint();
    })
  );
  el.querySelectorAll('[data-minus]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = Number(b.dataset.minus);
      const n = (state.cart.get(id) || 0) - 1;
      if (n > 0) state.cart.set(id, n);
      else state.cart.delete(id);
      paint();
    })
  );
  el.querySelector('[data-cart-clear]').addEventListener('click', () => {
    state.cart.clear();
    paint();
  });
  el.querySelector('[data-cart-go]').addEventListener('click', () => confirmCart(el, active, paint));
  paint();
}

function confirmCart(el, active, paint) {
  const items = [...state.cart.entries()].map(([id, qty]) => ({ s: active.find((x) => x.id === id), qty })).filter((i) => i.s);
  const total = items.reduce((a, i) => a + i.qty * i.s.price_cents, 0);
  openModal({
    title: 'Confirmar lançamento',
    submitLabel: `Lançar ${money(total)}`,
    body: `
      <ul class="confirm-list">
        ${items
          .map(
            (i) => `<li><span><b>${i.qty}×</b> ${esc(i.s.name)}</span><span>${money(i.qty * i.s.price_cents)}</span></li>`
          )
          .join('')}
        <li class="total"><span>Total</span><span>${money(total)}</span></li>
      </ul>
      <div class="field"><span>Forma de pagamento</span>${paymentChips('payment_method', lastPayment())}</div>
      <label class="field"><span>Data</span>${dateField('date', todayISO())}</label>`,
    async onSubmit(form) {
      const pm = form.elements.payment_method.value;
      if (!pm) throw new Error('Selecione a forma de pagamento.');
      const date = readDate(form, 'date');
      for (const i of items) {
        await api.post('/revenues', { date, service_id: i.s.id, quantity: i.qty, unit_price_cents: i.s.price_cents, payment_method: pm, notes: '' });
      }
      rememberPayment(pm);
      state.cart.clear();
      paint();
      closeModal();
      toast(`${money(total)} lançado (${labelOf(PAYMENT_METHODS, pm)}).`);
      dataChanged('revenues');
    },
  });
}

// ---------- lista ----------
export async function load(el) {
  if (!state.range) return;
  const { start, end } = state.range;
  const [rows, sum] = await Promise.all([api.get('/revenues', { start, end, ...state.filters }), api.get('/summary', { start, end })]);
  const activeFilters = ['service', 'payment_method', 'q'].filter((k) => state.filters[k]).length;
  const total = rows.reduce((a, r) => a + r.total_cents, 0);
  const qty = rows.reduce((a, r) => a + r.quantity, 0);

  el.querySelector('[data-stats]').innerHTML = `
    <div class="stat"><span>Faturamento${activeFilters ? ' (filtrado)' : ''}</span><strong class="txt-gold">${money(total)}</strong></div>
    <div class="stat"><span>Serviços</span><strong>${int(qty)}</strong></div>
    <div class="stat"><span>Ticket médio</span><strong>${qty ? money(Math.round(total / qty)) : '—'}</strong></div>
    <details class="stat stat-wide" ${matchMedia('(min-width: 721px)').matches ? 'open' : ''}>
      <summary>Faturamento por serviço</summary>
      <div class="mini-bars">
        ${
          sum.by_service.length
            ? sum.by_service
                .map(
                  (s) => `<div class="mini-bar"><span class="mb-label">${esc(s.name)} <em>${int(s.quantity)}×</em></span>
                  <span class="mb-track"><i style="width:${sum.revenue_cents ? (s.total_cents / sum.revenue_cents) * 100 : 0}%"></i></span>
                  <span class="mb-val">${money(s.total_cents)} <em>${pct(sum.revenue_cents ? (s.total_cents / sum.revenue_cents) * 100 : 0, 0)}</em></span></div>`
                )
                .join('')
            : '<span class="muted">Sem receitas no período</span>'
        }
      </div>
    </details>`;
  bindFilterToggle(el, activeFilters);

  const list = el.querySelector('[data-list]');
  if (!rows.length) {
    list.innerHTML = emptyState(activeFilters ? 'Nenhuma receita encontrada com esses filtros.' : 'Nenhuma receita lançada neste período.');
    return;
  }
  const shown = rows.slice(0, state.limit);
  list.innerHTML = `
    <div class="only-mobile">
      ${dayList(
        shown.map((r) => ({
          id: r.id,
          date: r.date,
          title: `${esc(r.service_name)}${r.quantity > 1 ? ` <em>${r.quantity}×</em>` : ''}`,
          sub: [labelOf(PAYMENT_METHODS, r.payment_method), r.notes].filter(Boolean).map(esc).join(' · '),
          amount_cents: r.total_cents,
          cls: 'txt-gold',
        }))
      )}
      <p class="muted small tap-hint">Toque em um lançamento para editar ou excluir.</p>
    </div>
    <div class="table-wrap hide-mobile">
      <table class="table">
        <thead><tr><th>Data</th><th>Serviço</th><th class="num">Qtd</th><th class="num">Valor unit.</th><th class="num">Total</th><th>Pagamento</th><th>Observações</th><th class="actions"><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>
          ${shown
            .map(
              (r) => `<tr>
                <td>${fmtDate(r.date)}</td>
                <td><span class="tag">${esc(r.service_name)}</span></td>
                <td class="num">${int(r.quantity)}</td>
                <td class="num">${money(r.unit_price_cents)}</td>
                <td class="num strong txt-gold">${money(r.total_cents)}</td>
                <td>${esc(labelOf(PAYMENT_METHODS, r.payment_method))}</td>
                <td class="notes">${esc(r.notes) || '<span class="muted">—</span>'}</td>
                <td class="actions"><button class="icon-btn" data-open="${r.id}" aria-label="Editar ou excluir">${icon('edit')}</button></td>
              </tr>`
            )
            .join('')}
        </tbody>
        <tfoot><tr><td colspan="2">Total (${rows.length} lançamento${rows.length > 1 ? 's' : ''})</td><td class="num">${int(qty)}</td><td></td><td class="num strong txt-gold">${money(total)}</td><td colspan="3"></td></tr></tfoot>
      </table>
    </div>
    ${moreButton(shown.length, rows.length)}`;
  list.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => revenueForm(rows.find((r) => r.id === Number(b.dataset.open)))));
  $('[data-more]', list)?.addEventListener('click', () => {
    state.limit += PAGE * 2;
    load(el);
  });
}

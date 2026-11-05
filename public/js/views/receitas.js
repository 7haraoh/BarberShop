import { api, dataChanged } from '../api.js';
import { icon } from '../icons.js';
import { periodPicker, confirmDialog, toast, emptyState } from '../ui.js';
import { revenueForm, quickRevenue, getServices, lastPayment, paymentChips } from '../forms.js';
import { money, int, fmtDate, todayISO, esc, debounce, pct } from '../utils.js';
import { PAYMENT_METHODS, labelOf } from '../../shared/constants.js';

export const title = 'Receitas';
const state = { period: { type: 'month', anchor: null }, filters: { service: '', payment_method: '', q: '' }, range: null };

export async function render(el) {
  if (!state.period.anchor) state.period.anchor = todayISO();
  const services = await getServices();
  const active = services.filter((s) => s.active);
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Receitas</h1><p class="muted">Entradas financeiras da barbearia</p></div>
      <button class="btn btn-gold" data-new>${icon('plus')} Nova receita</button>
    </div>

    <section class="card quick">
      <header class="card-head"><h3>Lançamento rápido <span class="muted">— hoje, ${fmtDate(todayISO())}</span></h3></header>
      <form class="quick-form" data-quick>
        <div class="quick-pm">${paymentChips('qpm', lastPayment())}</div>
        <div class="quick-services">
          ${active
            .map(
              (s) => `<button type="button" class="svc-btn" data-svc="${s.id}">
                <span class="svc-name">${esc(s.name)}</span>
                <span class="svc-price">${s.price_cents ? money(s.price_cents) : 'Informar valor'}</span>
              </button>`
            )
            .join('') || '<p class="muted">Nenhum serviço ativo. Cadastre em "Serviços e preços".</p>'}
        </div>
      </form>
    </section>

    <div class="toolbar">
      <div data-period></div>
    </div>

    <section class="stats-row" data-stats></section>

    <section class="card">
      <header class="card-head wrap">
        <h3>Lançamentos</h3>
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
  const qf = el.querySelector('[data-quick]');
  qf.querySelectorAll('[data-svc]').forEach((b) =>
    b.addEventListener('click', async () => {
      const s = active.find((x) => x.id === Number(b.dataset.svc));
      const pm = qf.elements.qpm.value || 'pix';
      if (!s.price_cents) return revenueForm(null, { service_id: s.id });
      b.disabled = true;
      try {
        await quickRevenue(s, pm);
        b.classList.add('flash');
        setTimeout(() => b.classList.remove('flash'), 600);
        toast(`${s.name} — ${money(s.price_cents)} (${labelOf(PAYMENT_METHODS, pm)}) lançado.`);
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        b.disabled = false;
      }
    })
  );

  const reload = () => load(el);
  el.querySelectorAll('[data-f]').forEach((inp) => {
    const h = () => {
      state.filters[inp.dataset.f] = inp.value;
      reload();
    };
    inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', inp.tagName === 'SELECT' ? h : debounce(h, 250));
  });
  periodPicker(el.querySelector('[data-period]'), state.period, (r) => {
    state.range = r;
    reload();
  });
}

export async function load(el) {
  if (!state.range) return;
  const { start, end } = state.range;
  const [rows, sum] = await Promise.all([api.get('/revenues', { start, end, ...state.filters }), api.get('/summary', { start, end })]);
  const filtered = state.filters.service || state.filters.payment_method || state.filters.q;
  const total = rows.reduce((a, r) => a + r.total_cents, 0);
  const qty = rows.reduce((a, r) => a + r.quantity, 0);

  el.querySelector('[data-stats]').innerHTML = `
    <div class="stat"><span>Faturamento ${filtered ? '(filtrado)' : 'no período'}</span><strong class="txt-gold">${money(total)}</strong></div>
    <div class="stat"><span>Serviços realizados</span><strong>${int(qty)}</strong></div>
    <div class="stat"><span>Ticket médio</span><strong>${qty ? money(Math.round(total / qty)) : '—'}</strong></div>
    <div class="stat stat-wide">
      <span>Faturamento por serviço</span>
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
    </div>`;

  const list = el.querySelector('[data-list]');
  if (!rows.length) {
    list.innerHTML = emptyState(filtered ? 'Nenhuma receita encontrada com esses filtros.' : 'Nenhuma receita lançada neste período.');
    return;
  }
  list.innerHTML = `
    <div class="table-wrap">
      <table class="table responsive">
        <thead><tr><th>Data</th><th>Serviço</th><th class="num">Qtd</th><th class="num">Valor unit.</th><th class="num">Total</th><th>Pagamento</th><th>Observações</th><th class="actions"><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
                <td data-label="Data">${fmtDate(r.date)}</td>
                <td data-label="Serviço"><span class="tag">${esc(r.service_name)}</span></td>
                <td data-label="Qtd" class="num">${int(r.quantity)}</td>
                <td data-label="Valor unit." class="num">${money(r.unit_price_cents)}</td>
                <td data-label="Total" class="num strong txt-gold">${money(r.total_cents)}</td>
                <td data-label="Pagamento">${esc(labelOf(PAYMENT_METHODS, r.payment_method))}</td>
                <td data-label="Obs." class="notes">${esc(r.notes) || '<span class="muted">—</span>'}</td>
                <td class="actions">
                  <button class="icon-btn" data-edit="${r.id}" aria-label="Editar">${icon('edit')}</button>
                  <button class="icon-btn danger" data-del="${r.id}" aria-label="Excluir">${icon('trash')}</button>
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
        <tfoot><tr><td colspan="2">Total (${rows.length} lançamento${rows.length > 1 ? 's' : ''})</td><td class="num">${int(qty)}</td><td></td><td class="num strong txt-gold">${money(total)}</td><td colspan="3"></td></tr></tfoot>
      </table>
    </div>`;
  list.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => revenueForm(rows.find((r) => r.id === Number(b.dataset.edit))))
  );
  list.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const r = rows.find((x) => x.id === Number(b.dataset.del));
      const ok = await confirmDialog({
        title: 'Excluir receita',
        message: `Excluir o lançamento "${r.service_name}" de ${money(r.total_cents)} em ${fmtDate(r.date)}? Esta ação não pode ser desfeita.`,
      });
      if (!ok) return;
      try {
        await api.del(`/revenues/${r.id}`);
        toast('Receita excluída.');
        dataChanged('revenues');
      } catch (e) {
        toast(e.message, 'error');
      }
    })
  );
}

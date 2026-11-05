import { api, dataChanged } from './api.js';
import { openModal, closeModal, toast, dateField, readDate, moneyField, readMoney, confirmDialog } from './ui.js';
import { esc, todayISO, money, centsToInput, parseMoney, fmtDate, $ } from './utils.js';
import { icon } from './icons.js';
import { PAYMENT_METHODS, EXPENSE_CATEGORIES, EXPENSE_TYPES } from '../shared/constants.js';

// Cache simples de serviços (recarregado sempre que algo muda).
let servicesCache = null;
export async function getServices(force = false) {
  if (!servicesCache || force) servicesCache = await api.get('/services');
  return servicesCache;
}
export const invalidateServices = () => (servicesCache = null);

const options = (list, sel) => list.map((o) => `<option value="${esc(o.id)}" ${o.id === sel ? 'selected' : ''}>${esc(o.label)}</option>`).join('');

// Lembra a última forma de pagamento usada para agilizar lançamentos.
const LAST_PM = 'bb:last-payment';
const lastPayment = () => {
  try {
    return localStorage.getItem(LAST_PM) || 'pix';
  } catch {
    return 'pix';
  }
};
const rememberPayment = (v) => {
  try {
    localStorage.setItem(LAST_PM, v);
  } catch {
    /* ignore */
  }
};

export function paymentChips(name, selected) {
  return `<div class="chips" role="radiogroup" aria-label="Forma de pagamento">
    ${PAYMENT_METHODS.map(
      (p) => `<label class="chip"><input type="radio" name="${name}" value="${p.id}" ${p.id === selected ? 'checked' : ''}><span>${esc(p.label)}</span></label>`
    ).join('')}
  </div>`;
}

/** Formulário de receita (novo ou edição). */
export async function revenueForm(existing = null, preset = {}) {
  const all = await getServices();
  const services = all.filter((s) => s.active || (existing && s.id === existing.service_id));
  if (!services.length) {
    toast('Cadastre ao menos um serviço ativo em "Serviços e preços".', 'error');
    return;
  }
  const r = existing || {
    date: preset.date || todayISO(),
    service_id: preset.service_id || services[0].id,
    quantity: 1,
    payment_method: lastPayment(),
    notes: '',
  };
  const svcOf = (sid) => services.find((s) => s.id === Number(sid));
  const unit = existing ? existing.unit_price_cents : svcOf(r.service_id)?.price_cents;

  openModal({
    title: existing ? 'Editar receita' : 'Nova receita',
    submitLabel: existing ? 'Salvar alterações' : 'Lançar receita',
    footer: existing ? editFooter('Salvar') : undefined,
    body: `
      <div class="grid-2">
        <label class="field"><span>Data do recebimento</span>${dateField('date', r.date)}</label>
        <label class="field"><span>Tipo de serviço</span>
          <select name="service_id" required>
            ${services.map((s) => `<option value="${s.id}" ${s.id === r.service_id ? 'selected' : ''}>${esc(s.name)}${s.active ? '' : ' (inativo)'}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>Quantidade de serviços</span>
          <div class="stepper">
            <button type="button" data-step="-1" aria-label="Diminuir">−</button>
            <input type="number" name="quantity" min="1" step="1" value="${r.quantity}" required inputmode="numeric">
            <button type="button" data-step="1" aria-label="Aumentar">+</button>
          </div>
        </label>
        <label class="field"><span>Valor cobrado (unitário)</span>${moneyField('unit', unit)}</label>
      </div>
      <div class="field"><span>Forma de pagamento</span>${paymentChips('payment_method', r.payment_method)}</div>
      <label class="field"><span>Observações <em>(opcional)</em></span>
        <textarea name="notes" rows="2" maxlength="1000" placeholder="Ex.: cliente pediu desconto, gorjeta...">${esc(r.notes)}</textarea>
      </label>
      <div class="total-line"><span>Total do lançamento</span><strong data-total>—</strong></div>`,
    onOpen(form) {
      if (existing)
        bindDelete(form, `Excluir "${existing.service_name}" de ${money(existing.total_cents)} em ${fmtDate(existing.date)}?`, `/revenues/${existing.id}`, 'revenues', 'Receita excluída.');
      const upd = () => {
        const q = Math.max(1, parseInt(form.elements.quantity.value, 10) || 0);
        const u = parseMoney(form.elements.unit.value);
        $('[data-total]', form).textContent = Number.isFinite(u) ? money(u * q) : '—';
      };
      form.elements.service_id.addEventListener('change', () => {
        const s = svcOf(form.elements.service_id.value);
        if (s) form.elements.unit.value = s.price_cents ? centsToInput(s.price_cents) : '';
        if (s && !s.price_cents) form.elements.unit.focus();
        upd();
      });
      form.querySelectorAll('[data-step]').forEach((b) =>
        b.addEventListener('click', () => {
          const q = parseInt(form.elements.quantity.value, 10) || 1;
          form.elements.quantity.value = Math.max(1, q + Number(b.dataset.step));
          upd();
        })
      );
      form.addEventListener('input', upd);
      upd();
    },
    async onSubmit(form) {
      const quantity = parseInt(form.elements.quantity.value, 10);
      if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Quantidade deve ser maior que zero.');
      const pm = form.elements.payment_method.value;
      if (!pm) throw new Error('Selecione a forma de pagamento.');
      const body = {
        date: readDate(form, 'date', 'Data do recebimento'),
        service_id: Number(form.elements.service_id.value),
        quantity,
        unit_price_cents: readMoney(form, 'unit', 'o valor cobrado'),
        payment_method: pm,
        notes: form.elements.notes.value,
      };
      if (existing) await api.put(`/revenues/${existing.id}`, body);
      else await api.post('/revenues', body);
      rememberPayment(pm);
      closeModal();
      toast(existing ? 'Receita atualizada.' : `Receita de ${money(body.unit_price_cents * quantity)} lançada.`);
      dataChanged('revenues');
    },
  });
}

/** Lançamento rápido em um clique (usado nos atalhos da tela de receitas). */
export async function quickRevenue(service, paymentMethod, date = todayISO()) {
  await api.post('/revenues', {
    date,
    service_id: service.id,
    quantity: 1,
    unit_price_cents: service.price_cents,
    payment_method: paymentMethod,
    notes: '',
  });
  rememberPayment(paymentMethod);
  dataChanged('revenues');
}
export { lastPayment, rememberPayment };

// Rodapé de edição com botão Excluir (evita ícones em cada item da lista).
const editFooter = (submitLabel) => `
  <button type="button" class="btn btn-danger-ghost" data-delete>${icon('trash')} Excluir</button>
  <span class="spacer"></span>
  <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
  <button type="submit" class="btn btn-gold">${esc(submitLabel)}</button>`;
function bindDelete(form, message, url, what, done) {
  form.querySelector('[data-delete]').addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Confirmar exclusão', message: `${message} Esta ação não pode ser desfeita.` }))) return;
    try {
      await api.del(url);
      toast(done);
      dataChanged(what);
    } catch (e) {
      toast(e.message, 'error');
    }
  });
}

// Atalhos de despesas comuns (preenchem descrição, categoria e tipo).
const EXPENSE_PRESETS = [
  ['Água', 'Conta de água', 'agua', 'fixa'],
  ['Luz', 'Conta de luz', 'energia', 'fixa'],
  ['Internet', 'Internet', 'internet', 'fixa'],
  ['Aluguel', 'Aluguel', 'aluguel', 'fixa'],
  ['Navalhas', 'Navalhas / lâminas descartáveis', 'descartaveis', 'variavel'],
  ['Álcool', 'Álcool 70%', 'descartaveis', 'variavel'],
  ['Papel', 'Papel pescoço e toalhas de papel', 'descartaveis', 'variavel'],
  ['Cremes', 'Creme de barbear', 'produtos_barba', 'variavel'],
  ['Pomadas', 'Pomadas modeladoras', 'produtos_cabelo', 'variavel'],
  ['Comissões', 'Comissões dos barbeiros', 'salarios', 'fixa'],
];

/** Formulário de despesa (novo ou edição). */
export function expenseForm(existing = null) {
  const e = existing || {
    date: todayISO(),
    description: '',
    category: 'aluguel',
    amount_cents: null,
    type: 'fixa',
    payment_method: lastPayment(),
    notes: '',
  };
  const FIXED = ['aluguel', 'agua', 'energia', 'internet', 'salarios', 'impostos'];
  openModal({
    title: existing ? 'Editar despesa' : 'Nova despesa',
    submitLabel: existing ? 'Salvar alterações' : 'Lançar despesa',
    footer: existing ? editFooter('Salvar') : undefined,
    body: `
      ${
        existing
          ? ''
          : `<div class="field"><span>Atalhos</span><div class="chips presets">
              ${EXPENSE_PRESETS.map((p, i) => `<button type="button" class="chip-btn" data-preset="${i}">${p[0]}</button>`).join('')}
            </div></div>`
      }
      <label class="field"><span>Descrição</span>
        <input type="text" name="description" maxlength="120" required value="${esc(e.description)}" placeholder="Ex.: Aluguel de novembro">
      </label>
      <div class="grid-2">
        <label class="field"><span>Categoria</span><select name="category" required>${options(EXPENSE_CATEGORIES, e.category)}</select></label>
        <label class="field"><span>Valor</span>${moneyField('amount', e.amount_cents)}</label>
        <label class="field"><span>Data de pagamento</span>${dateField('date', e.date)}</label>
        <div class="field"><span>Tipo</span>
          <div class="chips">
            ${EXPENSE_TYPES.map((t) => `<label class="chip"><input type="radio" name="type" value="${t.id}" ${t.id === e.type ? 'checked' : ''}><span>${t.label}</span></label>`).join('')}
          </div>
        </div>
      </div>
      <div class="field"><span>Forma de pagamento</span>${paymentChips('payment_method', e.payment_method)}</div>
      <label class="field"><span>Observações <em>(opcional)</em></span>
        <textarea name="notes" rows="2" maxlength="1000">${esc(e.notes)}</textarea>
      </label>`,
    onOpen(form) {
      if (existing)
        bindDelete(form, `Excluir a despesa "${existing.description}" de ${money(existing.amount_cents)} em ${fmtDate(existing.date)}?`, `/expenses/${existing.id}`, 'expenses', 'Despesa excluída.');
      form.querySelectorAll('[data-preset]').forEach((b) =>
        b.addEventListener('click', () => {
          const [, desc, cat, type] = EXPENSE_PRESETS[Number(b.dataset.preset)];
          form.elements.description.value = desc;
          form.elements.category.value = cat;
          form.querySelector(`input[name=type][value=${type}]`).checked = true;
          form.querySelectorAll('[data-preset]').forEach((x) => x.classList.toggle('on', x === b));
          form.elements.amount.focus();
        })
      );
      if (!existing) {
        // Sugere o tipo conforme a categoria (pode ser alterado).
        form.elements.category.addEventListener('change', () => {
          const t = FIXED.includes(form.elements.category.value) ? 'fixa' : 'variavel';
          form.querySelector(`input[name=type][value=${t}]`).checked = true;
        });
      }
    },
    async onSubmit(form) {
      const pm = form.elements.payment_method.value;
      if (!form.elements.description.value.trim()) throw new Error('Informe a descrição da despesa.');
      if (!pm) throw new Error('Selecione a forma de pagamento.');
      const body = {
        description: form.elements.description.value,
        category: form.elements.category.value,
        amount_cents: readMoney(form, 'amount', 'o valor'),
        date: readDate(form, 'date', 'Data de pagamento'),
        type: form.elements.type.value,
        payment_method: pm,
        notes: form.elements.notes.value,
      };
      if (existing) await api.put(`/expenses/${existing.id}`, body);
      else await api.post('/expenses', body);
      rememberPayment(pm);
      closeModal();
      toast(existing ? 'Despesa atualizada.' : `Despesa de ${money(body.amount_cents)} lançada.`);
      dataChanged('expenses');
    },
  });
}

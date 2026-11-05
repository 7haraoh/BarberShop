import { icon } from './icons.js';
import { esc, fmtDate, parseBRDate, todayISO, periodRange, shiftAnchor, $, $$, parseMoney, centsToInput } from './utils.js';

// ---------- toast ----------
export function toast(msg, type = 'ok') {
  const root = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = msg;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, type === 'error' ? 5000 : 2600);
}

// ---------- modal ----------
let lastFocus = null;
let onCloseCb = null;
export function closeModal() {
  const cb = onCloseCb;
  onCloseCb = null;
  cb?.();
  const root = $('#modal-root');
  root.innerHTML = '';
  root.hidden = true;
  document.body.classList.remove('modal-open');
  if (lastFocus) lastFocus.focus?.();
}

/**
 * Abre um modal com formulário. onSubmit(form) pode retornar promise; se lançar erro, mostra a mensagem.
 */
export function openModal({ title, body, submitLabel = 'Salvar', onSubmit, onOpen, onClose, wide = false, footer }) {
  if (!$('#modal-root').hidden) closeModal();
  lastFocus = document.activeElement;
  onCloseCb = onClose || null;
  const root = $('#modal-root');
  root.hidden = false;
  document.body.classList.add('modal-open');
  root.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <form class="modal-form" novalidate>
        <header class="modal-head">
          <h2 id="modal-title">${esc(title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="Fechar">${icon('x')}</button>
        </header>
        <div class="modal-body">${body}</div>
        <div class="form-error" role="alert" hidden></div>
        <footer class="modal-foot">
          ${footer ?? `<button type="button" class="btn btn-ghost" data-close>Cancelar</button>
          <button type="submit" class="btn btn-gold">${esc(submitLabel)}</button>`}
        </footer>
      </form>
    </div>`;
  const form = $('form', root);
  $$('[data-close]', root).forEach((b) => b.addEventListener('click', closeModal));
  root.onkeydown = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  bindDateFields(form);
  bindMoneyFields(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return closeModal();
    const err = $('.form-error', form);
    const btn = $('button[type=submit]', form);
    err.hidden = true;
    btn.disabled = true;
    try {
      await onSubmit(form);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
  onOpen?.(form);
  const first = $('[autofocus]', form) || $('input:not([type=hidden]):not(.date-native), select, textarea', form);
  setTimeout(() => first?.focus(), 30);
  return form;
}

export function confirmDialog({ title = 'Confirmar', message, confirmLabel = 'Excluir', danger = true }) {
  return new Promise((resolve) => {
    openModal({
      title,
      body: `<p class="confirm-msg">${esc(message)}</p>`,
      footer: `<button type="button" class="btn btn-ghost" data-close>Cancelar</button>
               <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-gold'}">${esc(confirmLabel)}</button>`,
      onSubmit: () => {
        resolve(true);
        closeModal();
      },
      onClose: () => resolve(false),
      onOpen: (form) => setTimeout(() => $('button[type=submit]', form).focus(), 40),
    });
  });
}

// ---------- campo de data DD/MM/AAAA com calendário nativo ----------
export function dateField(name, isoValue = todayISO(), { required = true, label } = {}) {
  return `<div class="date-field">
    <input type="text" name="${name}" value="${fmtDate(isoValue)}" placeholder="DD/MM/AAAA" inputmode="numeric" maxlength="10"
      autocomplete="off" ${required ? 'required' : ''} ${label ? `aria-label="${esc(label)}"` : ''}>
    <button type="button" class="date-btn" tabindex="-1" aria-label="Abrir calendário">${icon('calendar')}</button>
    <input type="date" class="date-native" tabindex="-1" aria-hidden="true">
  </div>`;
}
export function bindDateFields(root) {
  $$('.date-field', root).forEach((wrap) => {
    if (wrap.dataset.bound) return;
    wrap.dataset.bound = '1';
    const txt = $('input[type=text]', wrap);
    const nat = $('.date-native', wrap);
    txt.addEventListener('input', (e) => {
      if (e.inputType && e.inputType.startsWith('delete')) return;
      let d = txt.value.replace(/\D/g, '').slice(0, 8);
      if (d.length > 4) d = `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
      else if (d.length > 2) d = `${d.slice(0, 2)}/${d.slice(2)}`;
      txt.value = d;
    });
    txt.addEventListener('blur', () => {
      txt.classList.toggle('invalid', !!txt.value && !parseBRDate(txt.value));
    });
    $('.date-btn', wrap).addEventListener('click', () => {
      nat.value = parseBRDate(txt.value) || todayISO();
      try {
        nat.showPicker();
      } catch {
        nat.focus();
        nat.click();
      }
    });
    nat.addEventListener('change', () => {
      if (nat.value) {
        txt.value = fmtDate(nat.value);
        txt.classList.remove('invalid');
        txt.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
}
/** Lê um campo de data do formulário (retorna ISO) ou lança erro. */
export function readDate(form, name, label = 'Data') {
  const v = form.elements[name].value;
  const iso = parseBRDate(v);
  if (!iso) throw new Error(`${label} inválida. Use o formato DD/MM/AAAA.`);
  return iso;
}

// ---------- campo de moeda ----------
export function moneyField(name, cents, { required = true, placeholder = '0,00' } = {}) {
  return `<div class="money-field"><span>R$</span><input type="text" name="${name}" inputmode="decimal" autocomplete="off"
    value="${cents === undefined || cents === null ? '' : centsToInput(cents)}" placeholder="${placeholder}" ${required ? 'required' : ''}></div>`;
}
export function bindMoneyFields(root) {
  $$('.money-field input', root).forEach((inp) => {
    if (inp.dataset.bound) return;
    inp.dataset.bound = '1';
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/[^\d.,-]/g, '');
    });
    inp.addEventListener('blur', () => {
      const c = parseMoney(inp.value);
      if (Number.isFinite(c)) inp.value = centsToInput(c);
    });
  });
}
export function readMoney(form, name, label, { allowZero = false, allowNegative = false } = {}) {
  const c = parseMoney(form.elements[name].value);
  if (!Number.isFinite(c) || (!allowNegative && c < 0) || (!allowZero && c === 0))
    throw new Error(`Informe um valor válido para ${label}.`);
  return c;
}

// ---------- seletor de período ----------
const PERIOD_TYPES = [
  ['day', 'Dia'],
  ['week', 'Semana'],
  ['month', 'Mês'],
  ['year', 'Ano'],
  ['custom', 'Personalizado'],
];
/**
 * state: { type, anchor, start?, end? } — mutado e mantido pela tela chamadora.
 * onChange({start,end,label,type})
 */
export function periodPicker(container, state, onChange, { types = PERIOD_TYPES.map((t) => t[0]) } = {}) {
  const render = () => {
    const r = periodRange(state.type, state.anchor, state);
    container.innerHTML = `
      <div class="period">
        <div class="seg" role="tablist" aria-label="Tipo de período">
          ${PERIOD_TYPES.filter(([t]) => types.includes(t))
            .map(([t, l]) => `<button type="button" role="tab" aria-selected="${state.type === t}" class="${state.type === t ? 'on' : ''}" data-type="${t}">${l}</button>`)
            .join('')}
        </div>
        ${
          state.type === 'custom'
            ? `<form class="period-custom">
                 ${dateField('start', r.start, { label: 'Data inicial' })}
                 <span class="muted">até</span>
                 ${dateField('end', r.end, { label: 'Data final' })}
                 <button class="btn btn-gold btn-sm" type="submit">Aplicar</button>
               </form>`
            : `<div class="period-nav">
                 <button type="button" class="icon-btn" data-dir="-1" aria-label="Período anterior">${icon('left')}</button>
                 <span class="period-label">${esc(r.label)}</span>
                 <button type="button" class="icon-btn" data-dir="1" aria-label="Próximo período">${icon('right')}</button>
                 <button type="button" class="btn btn-ghost btn-sm" data-today>Atual</button>
               </div>`
        }
      </div>`;
    $$('[data-type]', container).forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.type === 'custom' && state.type !== 'custom') {
          const cur = periodRange(state.type, state.anchor, state);
          state.start = cur.start;
          state.end = cur.end;
        }
        state.type = b.dataset.type;
        render();
        emit();
      })
    );
    $$('[data-dir]', container).forEach((b) =>
      b.addEventListener('click', () => {
        state.anchor = shiftAnchor(state.type, state.anchor, Number(b.dataset.dir));
        render();
        emit();
      })
    );
    $('[data-today]', container)?.addEventListener('click', () => {
      state.anchor = todayISO();
      render();
      emit();
    });
    const cf = $('.period-custom', container);
    if (cf) {
      bindDateFields(cf);
      cf.addEventListener('submit', (e) => {
        e.preventDefault();
        const s = parseBRDate(cf.elements.start.value);
        const en = parseBRDate(cf.elements.end.value);
        if (!s || !en) return toast('Datas inválidas. Use DD/MM/AAAA.', 'error');
        if (s > en) return toast('A data inicial deve ser anterior à final.', 'error');
        state.start = s;
        state.end = en;
        render();
        emit();
      });
    }
  };
  const emit = () => onChange({ ...periodRange(state.type, state.anchor, state), type: state.type });
  render();
  emit();
}

export function emptyState(text, action = '') {
  return `<div class="empty">${icon('receipt', 'empty-ico')}<p>${esc(text)}</p>${action}</div>`;
}

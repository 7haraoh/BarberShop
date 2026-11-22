import { api, dataChanged } from '../api.js';
import { icon } from '../icons.js';
import { openModal, closeModal, confirmDialog, toast, moneyField, readMoney, emptyState } from '../ui.js';
import { getServices, invalidateServices } from '../forms.js';
import { money, esc, int } from '../utils.js';

export const title = 'Serviços e preços';

export async function render(el) {
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Serviços e preços</h1><p class="muted">Cadastre os serviços e mantenha os preços atualizados</p></div>
      <button class="btn btn-gold" data-new>${icon('plus')} Novo serviço</button>
    </div>
    <div data-list><div class="loading">Carregando…</div></div>`;
  el.querySelector('[data-new]').addEventListener('click', () => serviceForm());
  await load(el);
}

export async function load(el) {
  const services = await getServices(true);
  const list = el.querySelector('[data-list]');
  if (!services.length) {
    list.innerHTML = emptyState('Nenhum serviço cadastrado.');
    return;
  }
  list.innerHTML = `<div class="svc-grid">
    ${services
      .map(
        (s) => `<article class="svc-card ${s.active ? '' : 'inactive'}">
          <header>
            <h3>${esc(s.name)}</h3>
            <label class="switch" title="${s.active ? 'Ativo' : 'Inativo'}">
              <input type="checkbox" data-toggle="${s.id}" ${s.active ? 'checked' : ''} aria-label="Serviço ativo">
              <span></span>
            </label>
          </header>
          <div class="svc-card-price">${s.price_cents ? money(s.price_cents) : '<span class="muted">Valor livre</span>'}</div>
          <p class="muted svc-desc">${esc(s.description) || '&nbsp;'}</p>
          <footer>
            <span class="pill ${s.active ? 'ok' : 'off'}">${s.active ? 'Ativo' : 'Inativo'}</span>
            <span class="muted small">${int(s.usage)} lançamento${s.usage === 1 ? '' : 's'}</span>
            <span class="spacer"></span>
            <button class="icon-btn" data-edit="${s.id}" aria-label="Editar ${esc(s.name)}">${icon('edit')}</button>
            <button class="icon-btn danger" data-del="${s.id}" aria-label="Excluir ${esc(s.name)}">${icon('trash')}</button>
          </footer>
        </article>`
      )
      .join('')}
  </div>
  <p class="muted small hint">Alterar o preço de um serviço não modifica receitas já lançadas — apenas os novos lançamentos usam o novo preço padrão.</p>`;

  const find = (id) => services.find((s) => s.id === Number(id));
  list.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => serviceForm(find(b.dataset.edit))));
  list.querySelectorAll('[data-toggle]').forEach((cb) =>
    cb.addEventListener('change', async () => {
      const s = find(cb.dataset.toggle);
      try {
        await api.put(`/services/${s.id}`, { ...s, active: cb.checked });
        toast(`${s.name} ${cb.checked ? 'ativado' : 'desativado'}.`);
        invalidateServices();
        dataChanged('services');
      } catch (e) {
        cb.checked = !cb.checked;
        toast(e.message, 'error');
      }
    })
  );
  list.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const s = find(b.dataset.del);
      if (s.usage > 0) {
        toast(`"${s.name}" possui ${s.usage} lançamento(s). Desative o serviço para preservar o histórico.`, 'error');
        return;
      }
      if (!(await confirmDialog({ title: 'Excluir serviço', message: `Excluir o serviço "${s.name}"?` }))) return;
      try {
        await api.del(`/services/${s.id}`);
        toast('Serviço excluído.');
        invalidateServices();
        dataChanged('services');
      } catch (e) {
        toast(e.message, 'error');
      }
    })
  );
}

function serviceForm(s = null) {
  openModal({
    title: s ? 'Editar serviço' : 'Novo serviço',
    submitLabel: s ? 'Salvar alterações' : 'Cadastrar serviço',
    body: `
      <label class="field"><span>Nome</span><input type="text" name="name" maxlength="60" required value="${esc(s?.name ?? '')}" placeholder="Ex.: Pigmentação" autofocus></label>
      <label class="field"><span>Preço padrão</span>${moneyField('price', s?.price_cents ?? null)}
        <small class="muted">Use 0,00 para serviços com valor livre (informado em cada lançamento).</small></label>
      <label class="field"><span>Descrição <em>(opcional)</em></span><textarea name="description" rows="2" maxlength="300">${esc(s?.description ?? '')}</textarea></label>
      <label class="field inline"><input type="checkbox" name="active" ${!s || s.active ? 'checked' : ''}> <span>Serviço ativo</span></label>`,
    async onSubmit(form) {
      const body = {
        name: form.elements.name.value.trim(),
        price_cents: readMoney(form, 'price', 'o preço', { allowZero: true }),
        description: form.elements.description.value,
        active: form.elements.active.checked,
      };
      if (!body.name) throw new Error('Informe o nome do serviço.');
      if (s) await api.put(`/services/${s.id}`, body);
      else await api.post('/services', body);
      closeModal();
      toast(s ? 'Serviço atualizado.' : 'Serviço cadastrado.');
      invalidateServices();
      dataChanged('services');
    },
  });
}

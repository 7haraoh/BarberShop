import { api, dataChanged, DEMO, resetDemoData } from '../api.js';
import { icon } from '../icons.js';
import { toast, confirmDialog, moneyField, readMoney, bindMoneyFields } from '../ui.js';
import { getSettings, saveSettings } from '../settings.js';
import { invalidateServices } from '../forms.js';
import { esc, todayISO } from '../utils.js';

export const title = 'Configurações';

export async function render(el) {
  const s = await getSettings(true);
  el.innerHTML = `
    <div class="page-head"><div><h1>Configurações</h1><p class="muted">Dados da barbearia, caixa e backup</p></div></div>
    <section class="grid-2col">
      <article class="card">
        <header class="card-head"><h3>Barbearia</h3></header>
        <form class="pad stack" data-settings novalidate>
          <label class="field"><span>Nome da barbearia</span><input type="text" name="shop_name" maxlength="60" required value="${esc(s.shop_name)}"></label>
          <label class="field"><span>Saldo inicial do caixa</span>${moneyField('opening', s.opening_balance_cents)}
            <small class="muted">Valor existente em caixa antes do primeiro lançamento. É a base do fluxo de caixa.</small></label>
          <div><button class="btn btn-gold" type="submit">Salvar</button></div>
        </form>
      </article>
      ${
        DEMO
          ? `<article class="card">
        <header class="card-head"><h3>Dados de demonstração</h3></header>
        <div class="pad stack">
          <p class="muted">Esta é uma versão de demonstração com dados fictícios, salvos apenas neste navegador. Na versão contratada, os dados ficam em um banco de dados seguro com backup.</p>
          <div><button class="btn btn-ghost" data-reset>${icon('upload')} Restaurar dados de demonstração</button></div>
        </div>
      </article>`
          : `<article class="card">
        <header class="card-head"><h3>Backup dos dados</h3></header>
        <div class="pad stack">
          <p class="muted">Todos os dados ficam salvos permanentemente no banco de dados SQLite do servidor. Faça cópias de segurança periódicas.</p>
          <div class="btn-group">
            <a class="btn btn-ghost" href="api/backup" download="backup-barbearia-${todayISO()}.json">${icon('download')} Baixar backup</a>
            <label class="btn btn-ghost">${icon('upload')} Restaurar backup<input type="file" accept="application/json,.json" data-restore hidden></label>
          </div>
          <p class="muted small">A restauração substitui <b>todos</b> os dados atuais pelos dados do arquivo.</p>
        </div>
      </article>`
      }
    </section>`;
  bindMoneyFields(el);
  el.querySelector('[data-reset]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Restaurar demonstração', message: 'Apagar suas alterações e voltar aos dados fictícios originais?', confirmLabel: 'Restaurar' });
    if (!ok) return;
    await resetDemoData();
    invalidateServices();
    await getSettings(true);
    toast('Dados de demonstração restaurados.');
    dataChanged('settings');
  });
  el.querySelector('[data-settings]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await saveSettings({ shop_name: f.elements.shop_name.value, opening_balance_cents: readMoney(f, 'opening', 'o saldo inicial', { allowZero: true, allowNegative: true }) });
      toast('Configurações salvas.');
      dataChanged('settings');
    } catch (ex) {
      toast(ex.message, 'error');
    }
  });
  el.querySelector('[data-restore]')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return toast('Arquivo inválido.', 'error');
    }
    const ok = await confirmDialog({
      title: 'Restaurar backup',
      message: `Substituir todos os dados atuais pelo backup "${file.name}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Restaurar',
    });
    if (!ok) return;
    try {
      const r = await api.post('/restore', data);
      invalidateServices();
      await getSettings(true);
      toast(`Backup restaurado: ${r.revenues} receitas, ${r.expenses} despesas, ${r.services} serviços.`);
      dataChanged('settings');
    } catch (ex) {
      toast(ex.message, 'error');
    }
  });
}

import { bus, DEMO } from './api.js';
import { icon } from './icons.js';
import { destroyAll } from './charts.js';
import { toast } from './ui.js';
import { revenueForm, expenseForm } from './forms.js';
import { getSettings } from './settings.js';
import { $, $$, esc, fmtDate, todayISO, weekday, cap } from './utils.js';
import * as dashboard from './views/dashboard.js';
import * as receitas from './views/receitas.js';
import * as despesas from './views/despesas.js';
import * as relatorios from './views/relatorios.js';
import * as servicos from './views/servicos.js';
import * as caixa from './views/caixa.js';
import * as config from './views/config.js';

const ROUTES = [
  { path: 'dashboard', view: dashboard, label: 'Dashboard', icon: 'dashboard' },
  { path: 'receitas', view: receitas, label: 'Receitas', icon: 'income' },
  { path: 'despesas', view: despesas, label: 'Despesas', icon: 'expense' },
  { path: 'caixa', view: caixa, label: 'Caixa', icon: 'cash' },
  { path: 'relatorios', view: relatorios, label: 'Relatórios', icon: 'report' },
  { path: 'servicos', view: servicos, label: 'Serviços e preços', icon: 'scissors' },
  { path: 'config', view: config, label: 'Configurações', icon: 'settings' },
];

let current = null;
const main = $('#main');

function buildNav() {
  $('#nav').innerHTML = ROUTES.map(
    (r) => `<a href="#/${r.path}" data-path="${r.path}" class="nav-link">${icon(r.icon)}<span>${r.label}</span></a>`
  ).join('');
  $('#bottom-nav').innerHTML = ROUTES.filter((r) => ['dashboard', 'receitas', 'despesas', 'caixa', 'relatorios'].includes(r.path))
    .map((r) => `<a href="#/${r.path}" data-path="${r.path}">${icon(r.icon)}<span>${r.label}</span></a>`)
    .join('');
}

async function navigate() {
  const path = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
  const route = ROUTES.find((r) => r.path === path) || ROUTES[0];
  current = route;
  $$('[data-path]').forEach((a) => a.classList.toggle('active', a.dataset.path === route.path));
  document.title = `${route.label} · Barbearia Financeiro`;
  document.body.classList.remove('nav-open', 'has-cart', 'fab-open');
  destroyAll();
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  try {
    await route.view.render(main);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="empty"><p>Não foi possível carregar esta tela.</p><p class="muted">${esc(e.message)}</p>
      <button class="btn btn-gold" onclick="location.reload()">Tentar novamente</button></div>`;
  }
  main.focus({ preventScroll: true });
}

// Atualização automática de indicadores, gráficos e listas após cada lançamento.
bus.addEventListener('data-changed', async (e) => {
  if (!current) return;
  try {
    if (e.detail === 'settings') updateBrand();
    if (current.view.load && e.detail !== 'services' && e.detail !== 'settings') await current.view.load(main);
    else await current.view.render(main);
  } catch (err) {
    toast(err.message, 'error');
  }
});

async function updateBrand() {
  try {
    const s = await getSettings(true);
    $$('[data-shop]').forEach((el) => (el.textContent = s.shop_name));
  } catch {
    /* offline */
  }
}

function init() {
  buildNav();
  if (DEMO) {
    const b = document.createElement('div');
    b.className = 'demo-banner';
    b.innerHTML = '<b>Demonstração</b><span class="hide-mobile"> · dados fictícios — fique à vontade para lançar, editar e excluir.</span> <a href="#/config">Restaurar dados</a>';
    $('.topbar').after(b);
  }
  $('#today').textContent = `${cap(weekday(todayISO()))}, ${fmtDate(todayISO())}`;
  $('#btn-rev').addEventListener('click', () => revenueForm());
  $('#btn-exp').addEventListener('click', () => expenseForm());
  $('#fab').addEventListener('click', () => document.body.classList.toggle('fab-open'));
  $('#fab-rev').addEventListener('click', () => {
    document.body.classList.remove('fab-open');
    revenueForm();
  });
  $('#fab-exp').addEventListener('click', () => {
    document.body.classList.remove('fab-open');
    expenseForm();
  });
  $('#menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  $('#scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
  // Atalhos de teclado: R = nova receita, D = nova despesa
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$('#modal-root').hidden) return;
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      revenueForm();
    } else if (e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      expenseForm();
    }
  });
  window.addEventListener('hashchange', navigate);
  updateBrand();
  navigate();
}

init();

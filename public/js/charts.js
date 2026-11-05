/* global Chart */
import { money, moneyCompact, pct } from './utils.js';

// Paleta validada (CVD/contraste) para a superfície escura.
export const C = {
  revenue: '#b08816',
  expense: '#e66767',
  profit: '#3987e5',
  surface: '#161616',
  grid: 'rgba(255,255,255,0.06)',
  axis: '#8a877f',
  text: '#c9c6bd',
};
export const CATEGORICAL = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

let configured = false;
function setup() {
  if (configured || !window.Chart) return;
  configured = true;
  Chart.defaults.color = C.text;
  Chart.defaults.font.family = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.borderColor = C.grid;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.animation.duration = 450;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyle = 'rectRounded';
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.legend.labels.padding = 14;
  Object.assign(Chart.defaults.plugins.tooltip, {
    backgroundColor: '#0d0d0d',
    borderColor: 'rgba(201,162,39,0.35)',
    borderWidth: 1,
    titleColor: '#f0efec',
    bodyColor: '#d8d5cc',
    padding: 10,
    cornerRadius: 8,
    boxPadding: 4,
    usePointStyle: true,
  });
}

const charts = new Map();
export function destroyAll() {
  charts.forEach((c) => c.destroy());
  charts.clear();
}
function make(canvas, config) {
  setup();
  if (!window.Chart || !canvas) return null;
  const prev = charts.get(canvas.id);
  if (prev) prev.destroy();
  const ch = new Chart(canvas, config);
  charts.set(canvas.id, ch);
  return ch;
}

const moneyAxis = {
  grid: { color: C.grid },
  border: { display: false },
  ticks: { color: C.axis, callback: (v) => moneyCompact(v), maxTicksLimit: 6 },
};
const catAxis = { grid: { display: false }, border: { color: 'rgba(255,255,255,0.12)' }, ticks: { color: C.axis, maxRotation: 0, autoSkip: true } };
const moneyTip = { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${money(ctx.parsed.y ?? ctx.parsed)}` } };

/** Barras agrupadas Faturamento x Despesas x Lucro. */
export function barsRevExpProfit(canvas, labels, rows) {
  const ds = (label, key, color) => ({
    label,
    data: rows.map((r) => r[key]),
    backgroundColor: color,
    borderRadius: 4,
    borderSkipped: 'start',
    borderColor: C.surface,
    borderWidth: { left: 1, right: 1 },
    maxBarThickness: 28,
    categoryPercentage: 0.7,
    barPercentage: 0.92,
  });
  return make(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [ds('Faturamento', 'revenue_cents', C.revenue), ds('Despesas', 'expenses_cents', C.expense), ds('Lucro', 'profit_cents', C.profit)],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top', align: 'end' }, tooltip: moneyTip },
      scales: { x: catAxis, y: moneyAxis },
    },
  });
}

/** Linha de uma série monetária (crosshair + tooltip). */
export function lineMoney(canvas, labels, values, { label = 'Faturamento', color = C.revenue, fill = true } = {}) {
  return make(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label,
          data: values,
          borderColor: color,
          borderWidth: 2,
          pointRadius: values.length > 40 ? 0 : 3,
          pointHoverRadius: 5,
          pointBackgroundColor: color,
          pointBorderColor: C.surface,
          pointBorderWidth: 2,
          tension: 0.3,
          cubicInterpolationMode: 'monotone',
          fill: fill
            ? {
                target: 'origin',
                above: color + '22',
              }
            : false,
        },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: moneyTip },
      scales: { x: catAxis, y: { ...moneyAxis, beginAtZero: true } },
    },
    plugins: [crosshair],
  });
}

/** Várias linhas (evolução financeira). */
export function linesMulti(canvas, labels, rows) {
  const ds = (label, key, color) => ({
    label,
    data: rows.map((r) => r[key]),
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    pointRadius: rows.length > 40 ? 0 : 3,
    pointHoverRadius: 5,
    pointBorderColor: C.surface,
    pointBorderWidth: 2,
    tension: 0.3,
    cubicInterpolationMode: 'monotone',
  });
  return make(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [ds('Faturamento', 'revenue_cents', C.revenue), ds('Despesas', 'expenses_cents', C.expense), ds('Lucro', 'profit_cents', C.profit)],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top', align: 'end' }, tooltip: moneyTip },
      scales: { x: catAxis, y: moneyAxis },
    },
    plugins: [crosshair],
  });
}

/** Barras simples de uma métrica (ex.: margem %). */
export function barsSingle(canvas, labels, values, { label, color = C.profit, format = (v) => v } = {}) {
  return make(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label, data: values, backgroundColor: color, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 32 }],
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${label}: ${format(ctx.parsed.y)}` } } },
      scales: { x: catAxis, y: { grid: { color: C.grid }, border: { display: false }, ticks: { color: C.axis, callback: format, maxTicksLimit: 6 } } },
    },
  });
}

/** Rosca com até 8 fatias (o restante é agrupado em "Outros"). */
export function doughnut(canvas, items, { centerLabel = 'Total' } = {}) {
  let list = items.filter((i) => i.value > 0);
  if (list.length > 8) {
    const head = list.slice(0, 7);
    const rest = list.slice(7).reduce((a, b) => a + b.value, 0);
    list = [...head, { label: 'Demais', value: rest }];
  }
  const total = list.reduce((a, b) => a + b.value, 0);
  return make(canvas, {
    type: 'doughnut',
    data: {
      labels: list.map((i) => i.label),
      datasets: [
        {
          data: list.map((i) => i.value),
          backgroundColor: list.map((_, i) => CATEGORICAL[i]),
          borderColor: C.surface,
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      cutout: '68%',
      plugins: {
        legend: {
          position: (canvas.parentElement?.clientWidth || 600) < 460 ? 'bottom' : 'right',
          labels: {
            generateLabels: (chart) => {
              const d = chart.data.datasets[0];
              return chart.data.labels.map((l, i) => ({
                text: `${l}  ${pct((d.data[i] / total) * 100, 0)}`,
                fillStyle: d.backgroundColor[i],
                strokeStyle: d.backgroundColor[i],
                fontColor: C.text,
                pointStyle: 'rectRounded',
                hidden: !chart.getDataVisibility(i),
                index: i,
              }));
            },
          },
        },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${money(ctx.parsed)} (${pct((ctx.parsed / total) * 100)})` } },
      },
    },
    plugins: [centerText(centerLabel, money(total))],
  });
}

function centerText(label, value) {
  return {
    id: 'center',
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      const meta = chart.getDatasetMeta(0);
      if (!meta.data[0]) return;
      const { x, y } = meta.data[0];
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8a877f';
      ctx.font = '500 11px Inter, system-ui, sans-serif';
      ctx.fillText(label.toUpperCase(), x, y - 9);
      ctx.fillStyle = '#f0efec';
      const size = Math.max(12, Math.min(17, (chartArea.right - chartArea.left) / 11));
      ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
      ctx.fillText(value, x, y + 11);
      ctx.restore();
    },
  };
}

const crosshair = {
  id: 'crosshair',
  afterDatasetsDraw(chart) {
    const a = chart.tooltip?.getActiveElements?.();
    if (!a || !a.length) return;
    const x = a[0].element.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

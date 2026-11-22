import { TIMEZONE } from '../shared/constants.js';

// ---------- moeda (R$) — valores internos em centavos ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
export const money = (cents) => brl.format((cents || 0) / 100);
export const moneyCompact = (cents) => (Math.abs(cents) >= 1_000_000 ? brlCompact.format(cents / 100) : brl.format(Math.round((cents || 0) / 100)).replace(/,00$/, ''));
export const centsToInput = (cents) =>
  ((cents || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1.234,56" | "1234.56" | "R$ 50" -> centavos (inteiro) ou NaN */
export function parseMoney(str) {
  let s = String(str ?? '').replace(/[R$\s]/g, '').trim();
  if (!s) return NaN;
  const neg = s.startsWith('-');
  s = s.replace(/^-/, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
  const v = Math.round(parseFloat(s) * 100);
  return neg ? -v : v;
}

export const pct = (v, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
export const int = (v) => (v || 0).toLocaleString('pt-BR');

// ---------- datas (ISO YYYY-MM-DD internamente, DD/MM/AAAA na tela) ----------
export function todayISO() {
  // Data atual no fuso de Brasília.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts; // en-CA => YYYY-MM-DD
}
export function nowBrasilia() {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, dateStyle: 'short', timeStyle: 'short' }).format(new Date());
}
export const fmtDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export function parseBRDate(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(iso + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}
const utc = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const iso = (dt) => dt.toISOString().slice(0, 10);
export const addDays = (s, n) => {
  const d = utc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
export const addMonthsYM = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  return iso(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7);
};
export const monthStart = (ym) => `${ym}-01`;
export const monthEnd = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return iso(new Date(Date.UTC(y, m, 0)));
};
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const monthLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;
export const monthShort = (ym) => `${MONTHS_SHORT[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
export const weekday = (s) => WEEKDAYS[utc(s).getUTCDay()];
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Períodos de filtro. type: day | week | month | year | custom.
 * anchor: data ISO de referência.
 */
export function periodRange(type, anchor, custom = {}) {
  switch (type) {
    case 'day':
      return { start: anchor, end: anchor, label: `${cap(weekday(anchor))}, ${fmtDate(anchor)}` };
    case 'week': {
      const dow = (utc(anchor).getUTCDay() + 6) % 7; // segunda = 0
      const start = addDays(anchor, -dow);
      const end = addDays(start, 6);
      return { start, end, label: `Semana de ${fmtDate(start)} a ${fmtDate(end)}` };
    }
    case 'year': {
      const y = anchor.slice(0, 4);
      return { start: `${y}-01-01`, end: `${y}-12-31`, label: `Ano de ${y}` };
    }
    case 'custom': {
      const start = custom.start || anchor;
      const end = custom.end || anchor;
      return { start, end, label: `${fmtDate(start)} a ${fmtDate(end)}` };
    }
    case 'month':
    default: {
      const ym = anchor.slice(0, 7);
      return { start: monthStart(ym), end: monthEnd(ym), label: cap(monthLabel(ym)) };
    }
  }
}
export function shiftAnchor(type, anchor, dir) {
  if (type === 'day') return addDays(anchor, dir);
  if (type === 'week') return addDays(anchor, 7 * dir);
  if (type === 'year') return `${Number(anchor.slice(0, 4)) + dir}${anchor.slice(4, 7)}-01`;
  return `${addMonthsYM(anchor.slice(0, 7), dir)}-01`;
}

// ---------- HTML ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export function html(strings, ...vals) {
  return strings.reduce((out, s, i) => out + s + (i < vals.length ? (vals[i] && vals[i].__html !== undefined ? vals[i].__html : esc(vals[i])) : ''), '');
}
export const raw = (s) => ({ __html: String(s) });
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

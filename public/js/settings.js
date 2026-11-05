import { api } from './api.js';

let cache = null;
export async function getSettings(force = false) {
  if (!cache || force) cache = await api.get('/settings');
  return cache;
}
export async function saveSettings(body) {
  cache = await api.put('/settings', body);
  return cache;
}

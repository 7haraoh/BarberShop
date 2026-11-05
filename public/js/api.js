// Cliente HTTP da API + barramento de eventos para atualizar telas após lançamentos.
async function request(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* sem corpo */
  }
  if (!res.ok) throw new Error((data && data.error) || `Erro ${res.status}`);
  return data;
}
const qs = (params = {}) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? '?' + new URLSearchParams(p).toString() : '';
};

export const api = {
  get: (url, params) => request('GET', url + qs(params)),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
};

// Notifica as telas que os dados mudaram (gráficos e indicadores se atualizam sozinhos).
export const bus = new EventTarget();
export const dataChanged = (what) => bus.dispatchEvent(new CustomEvent('data-changed', { detail: what }));

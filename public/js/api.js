/* ============================================================
   PlantãoPro — Cliente de API (fetch + JWT) com MODO DUPLO:
   - "server": backend Node/Express (produção)
   - "local" : fallback automático com localStorage (demo/sem servidor)
   Detecção automática: tenta /api/health; se não responder, usa local.
   ============================================================ */
const API = (() => {
  const base = (window.API_BASE || '').replace(/\/+$/, '');
  let mode = null; // 'server' | 'local'

  function getToken() { return localStorage.getItem('pp_token') || ''; }
  function setToken(t) { t ? localStorage.setItem('pp_token', t) : localStorage.removeItem('pp_token'); }
  function getUser() { try { return JSON.parse(localStorage.getItem('pp_user') || 'null'); } catch { return null; } }
  function setUser(u) { u ? localStorage.setItem('pp_user', JSON.stringify(u)) : localStorage.removeItem('pp_user'); }

  async function detect() {
    if (mode) return mode;
    // Modo forçado (versão standalone single-file)
    if (window.API_MODE === 'local') { mode = 'local'; return mode; }
    // Arquivo local aberto direto (file://) -> sempre modo local
    if (window.location.protocol === 'file:') { mode = 'local'; return mode; }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1800);
      const r = await fetch(base + '/api/health', { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) { mode = 'server'; return mode; }
    } catch (e) { /* sem backend */ }
    mode = 'local';
    return mode;
  }

  async function request(method, path, body) {
    const m = await detect();

    /* ---------- MODO LOCAL (localStorage) ---------- */
    if (m === 'local') {
      const r = window.PPLocalDB.handle(method, path, body);
      if (r.status >= 400) {
        const e = new Error(r.data.erro || 'Erro inesperado (' + r.status + ')');
        e.status = r.status;
        throw e;
      }
      return r.data;
    }

    /* ---------- MODO SERVIDOR (API REST) ---------- */
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.erro || 'Erro inesperado (' + res.status + ')');
      e.status = res.status;
      throw e;
    }
    return data;
  }

  return {
    base, getToken, setToken, getUser, setUser,
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b),
    put: (p, b) => request('PUT', p, b)
  };
})();

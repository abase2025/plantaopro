/* ============================================================
   PlantãoPro — Roteador SPA (hash) + navegação + guardas
   ============================================================ */
const ROUTES = {
  '/login':    { render: renderLogin,    public: true, roles: [] },
  '/dashboard':{ render: renderDashboard, roles: ['gestor', 'medico_gestor', 'medico'] },
  '/escalas':  { render: renderEscalas,   roles: ['gestor', 'medico_gestor', 'medico'] },
  '/ofertas':  { render: renderOfertas,   roles: ['gestor', 'medico_gestor', 'medico'] },
  '/checkin':  { render: renderCheckin,   roles: ['medico'] },
  '/horas':    { render: renderHoras,     roles: ['gestor', 'medico_gestor', 'medico'] },
  '/financeiro':{ render: renderFinanceiro, roles: ['gestor', 'medico_gestor', 'medico'] },
  '/equipe':   { render: renderEquipe,    roles: ['gestor', 'medico_gestor'] },
  '/chat':     { render: renderChat,      roles: ['gestor', 'medico_gestor', 'medico'] },
  '/proximos': { render: renderProximos,  roles: ['gestor', 'medico_gestor', 'medico'] },
  '/cadastro': { render: renderCadastro,  roles: ['gestor', 'medico_gestor', 'medico'] }
};

const NAV_ITEMS = [
  { path: '/dashboard', label: '🏠 Início', roles: ['gestor', 'medico_gestor', 'medico'] },
  { path: '/cadastro',  label: '➕ Cadastrar', roles: ['gestor', 'medico_gestor', 'medico'] },
  { path: '/proximos',  label: '📅 Próximos', roles: ['gestor', 'medico_gestor', 'medico'] },
  { path: '/escalas',   label: '📋 Escalas', roles: ['gestor', 'medico_gestor', 'medico'] },
  { path: '/ofertas',   label: '💼 Ofertas', roles: ['gestor', 'medico_gestor', 'medico'] },
  { path: '/checkin',   label: '📍 Check-in', roles: ['medico'] },
  { path: '/horas',     label: '⏱️ Horas', roles: ['gestor', 'medico_gestor', 'medico'] },
  { path: '/financeiro',label: '💰 Financeiro', roles: ['gestor', 'medico_gestor', 'medico'] },
  { path: '/equipe',    label: '👥 Equipe', roles: ['gestor', 'medico_gestor'] },
  { path: '/chat',      label: '💬 Chat', roles: ['gestor', 'medico_gestor', 'medico'] }
];

function hashAtual() {
  return location.hash.replace(/^#/, '') || '/dashboard';
}

function renderNav() {
  const nav = document.getElementById('main-nav');
  const user = API.getUser();
  nav.innerHTML = '';
  if (!user) return;
  for (const item of NAV_ITEMS) {
    if (!item.roles.includes(user.perfil)) continue;
    const a = UI.h('a', { href: '#' + item.path, class: hashAtual().split('?')[0] === item.path ? 'active' : '' }, item.label);
    nav.appendChild(a);
  }
}

function atualizarTopbar() {
  const topbar = document.getElementById('topbar');
  const user = API.getUser();
  if (!user) {
    topbar.classList.add('hidden');
    document.getElementById('user-nome').textContent = '';
    document.getElementById('user-perfil').textContent = '';
    return;
  }
  topbar.classList.remove('hidden');
  document.getElementById('user-nome').textContent = user.nome;
  document.getElementById('user-perfil').textContent = UI.perfilLabel(user.perfil);
  renderNav();
}

async function rotear() {
  const user = API.getUser();
  const path = hashAtual().split('?')[0];
  const rota = ROUTES[path] || ROUTES['/dashboard'];

  // Guarda de autenticação
  if (!rota.public && !user) {
    location.hash = '#/login';
    return;
  }
  if (rota.public && user) {
    location.hash = '#/dashboard';
    return;
  }
  // Guarda de perfil
  if (user && rota.roles.length && !rota.roles.includes(user.perfil)) {
    location.hash = '#/dashboard';
    return;
  }

  atualizarTopbar();
  const view = document.getElementById('view');
  UI.loader(true);
  try {
    await rota.render(view);
  } catch (err) {
    view.innerHTML = '';
    view.appendChild(UI.emptyMsg('⚠️', 'Erro ao carregar a página: ' + err.message));
  } finally {
    UI.loader(false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-logout').addEventListener('click', () => {
    API.setToken('');
    API.setUser(null);
    if (window.__chatCarregar) window.__chatCarregar = null;
    location.hash = '#/login';
  });
  window.addEventListener('hashchange', rotear);
  rotear();
});

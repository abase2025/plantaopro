/* ============================================================
   PlantãoPro — Roteador SPA (hash) + RBAC centralizado
   Toda checagem passa por Permissions (public/js/permissions.js).
   ============================================================ */
const ROUTES = {
  '/login':       { render: renderLogin,       public: true,  routeKey: 'login' },
  '/dashboard':   { render: renderDashboard,   routeKey: 'dashboard' },
  '/escalas':     { render: renderEscalas,     routeKey: 'escalas' },
  '/ofertas':     { render: renderOfertas,     routeKey: 'ofertas' },
  '/checkin':     { render: renderCheckin,     routeKey: 'checkin' },
  '/horas':       { render: renderHoras,       routeKey: 'horas' },
  '/financeiro':  { render: renderFinanceiro,  routeKey: 'financeiro' },
  '/equipe':      { render: renderEquipe,      routeKey: 'equipe' },
  '/chat':        { render: renderChat,        routeKey: 'chat' },
  '/proximos':    { render: renderProximos,    routeKey: 'proximos' },
  '/cadastro':    { render: renderCadastro,    routeKey: 'cadastro' },
  '/notifications': { render: renderNotifications, routeKey: 'notificacoes' },
  '/calendario':  { render: renderProximos,    routeKey: 'calendario' },
  '/admin':       { render: renderDashboard,   routeKey: 'admin' }
};

const NAV_ITEMS = [
  { path: '/dashboard',  label: '🏠 Início',     routeKey: 'dashboard' },
  { path: '/cadastro',   label: '➕ Cadastrar',  routeKey: 'cadastro' },
  { path: '/proximos',   label: '📅 Próximos',   routeKey: 'proximos' },
  { path: '/notifications', label: '🔔 Notificações', routeKey: 'notificacoes' },
  { path: '/calendario', label: '🗓️ Calendário', routeKey: 'calendario' },
  { path: '/escalas',    label: '📋 Escalas',    routeKey: 'escalas' },
  { path: '/ofertas',    label: '💼 Ofertas',    routeKey: 'ofertas' },
  { path: '/checkin',    label: '✅ Check-in',   routeKey: 'checkin' },
  { path: '/horas',      label: '⏱️ Horas',      routeKey: 'horas' },
  { path: '/financeiro', label: '💰 Financeiro', routeKey: 'financeiro' },
  { path: '/equipe',     label: '👥 Equipe',     routeKey: 'equipe' },
  { path: '/chat',       label: '💬 Chat',       routeKey: 'chat' },
  { path: '/admin',      label: '🛡️ Admin',      routeKey: 'admin' }
];

function hashAtual() {
  return (location.hash || '#/dashboard').replace(/^#/, '') || '/dashboard';
}

function renderNav() {
  const nav = document.getElementById('main-nav');
  const user = API.getUser();
  nav.innerHTML = '';
  if (!user) return;
  const path = hashAtual().split('?')[0];
  for (const item of NAV_ITEMS) {
    if (!Permissions.canRoute(item.routeKey, user)) continue;
    const a = UI.h('a', {
      href: '#' + item.path,
      class: path === item.path ? 'active' : ''
    }, item.label);
    nav.appendChild(a);
  }
}

function atualizarTopbar() {
  const topbar = document.getElementById('topbar');
  const user = API.getUser();
  if (!user) {
    topbar.classList.add('hidden');
    return;
  }
  topbar.classList.remove('hidden');
  document.getElementById('user-nome').textContent = user.nome;
  const perfil = Permissions.perfilDoUsuario(user);
  const label  = (Permissions.MATRIX[perfil] || {}).label || UI.perfilLabel(user.perfil);
  const tag    = document.getElementById('user-perfil');
  if (tag) {
    tag.textContent = label;
    tag.style.color = (Permissions.MATRIX[perfil] || {}).cor || '';
  }
  renderNav();
}

async function rotear() {
  const user = API.getUser();
  const path = hashAtual().split('?')[0];
  const rota = ROUTES[path] || ROUTES['/dashboard'];

  // 1) guarda de sessão
  if (!rota.public && !user) {
    location.hash = '#/login';
    return;
  }
  // 2) logado não deve ficar em rota pública (login)
  if (rota.public && user) {
    location.hash = '#/dashboard';
    return;
  }
  // 3) guarda de RBAC: rota exige permissão do perfil
  if (!rota.public && rota.routeKey && !Permissions.canRoute(rota.routeKey, user)) {
    UI?.toast?.('⛔ Seu perfil (' + (Permissions.matrix(Permissions.perfilDoUsuario(user))?.label || '—') +
               ') não pode acessar ' + path + '.', 'err');
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
    view.appendChild(UI.emptyMsg('⚠️', 'Erro ao carregar a página: ' + (err?.message || err)));
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

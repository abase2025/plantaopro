/* ============================================================
   PlantãoPro — RBAC cliente-side (fonte ÚNICA de verdade).
   ⚠️  IMPORTANTE: este controle é APENAS UX.
       Hash e perfil ficam em localStorage, visíveis via DevTools.
       Segurança real exige o server.js (bcrypt + JWT) hospedado.
   Perfis canônicos:
     • admin        — tudo (gestor + médico-gestor)
     • medico       — gerencia os próprios plantões; vê financeiro
     • plantonista  — vê SÓ os próprios plantões (read-only)
   ============================================================ */
(function (global) {
  'use strict';

  // Perfis aceitos (canônicos do PlantãoPro v2.2)
  const PERFIS = ['admin', 'medico', 'plantonista'];

  // Aliases legados (perfis antigos vindos do backend) -> canônicos
  const ALIAS = { gestor: 'admin', medico_gestor: 'admin', medico: 'medico' };

  function normalizar(perfil) {
    if (!perfil) return null;
    return ALIAS[perfil] || (PERFIS.includes(perfil) ? perfil : null);
  }

  // Mapa de permissões por perfil
  // Estrutura:
  //   ROTAS    : quais paths o perfil pode acessar
  //   ACOES    : quais ações de UI o perfil pode executar
  //   ESCOPO   : níveis de visibilidade
  const MATRIX = {
    admin: {
      label: 'Administrador',
      cor:   '#0d7a66',
      rotas: ['login','dashboard','escalas','ofertas','horas','financeiro','equipe','chat','proximos','cadastro','calendario','admin','notificacoes'],
      acoes: {
        verDashboardEquipe:  true,
        verEscalas:          true,
        criarEscala:         true,
        editarEscala:        true,
        excluirEscala:       true,
        cadastrarPlantao:    true,
        editarPlantao:       true,   // qualquer plantão
        excluirPlantao:      true,   // qualquer plantão
        aceitarOferta:       true,
        criarOferta:         true,
        marcarPago:          true,
        verFinanceiroTodos:  true,
        editarFinanceiro:    true,
        verEquipe:           true,
        editarEquipe:        true,
        verChat:             true,
        enviarMensagem:      true,
        verCalendario:       true,
        verAdmin:            true,
      },
      escopo: { verTodosPlantoes: true, verOutrosMedicos: true, verLembretesAdmin: true }
    },

    medico: {
      label: 'Médico',
      cor:   '#1d4ed8',
      rotas: ['login','dashboard','escalas','ofertas','checkin','horas','financeiro','chat','proximos','cadastro','calendario'],
      acoes: {
        verDashboardEquipe:  false,
        verEscalas:          true,
        criarEscala:         false,
        editarEscala:        false,
        excluirEscala:       false,
        cadastrarPlantao:    true,   // pode cadastrar para si mesmo
        editarPlantao:       'proprio', // só os que ele é dono
        excluirPlantao:      'proprio',
        aceitarOferta:       true,
        criarOferta:         false,
        marcarPago:          'proprio',
        verFinanceiroTodos:  false,
        editarFinanceiro:    false,
        verEquipe:           false,
        editarEquipe:        false,
        verChat:             true,
        enviarMensagem:      true,
        verCalendario:       true,
        verAdmin:            false,
        gerenciarNotificacoes: true,
      },
      escopo: { verTodosPlantoes: false, verOutrosMedicos: false, verLembretesAdmin: false }
    },

    plantonista: {
      label: 'Plantonista',
      cor:   '#7c3aed',
      rotas: ['login','dashboard','proximos','calendario','notificacoes'],  // ← SÓ leitura + opt-in
      acoes: {
        verDashboardEquipe:  false,
        verEscalas:          false,
        criarEscala:         false,
        editarEscala:        false,
        excluirEscala:       false,
        cadastrarPlantao:    false,
        editarPlantao:       false,
        excluirPlantao:      false,
        aceitarOferta:       false,
        criarOferta:         false,
        marcarPago:          false,
        verFinanceiroTodos:  false,
        editarFinanceiro:    false,
        verEquipe:           false,
        editarEquipe:        false,
        verChat:             false,
        enviarMensagem:      false,
        verCalendario:       true,
        verAdmin:            false,
        gerenciarNotificacoes: true,
      },
      escopo: { verTodosPlantoes: false, verOutrosMedicos: false, verLembretesAdmin: false }
    }
  };

  function perfilDoUsuario(u) { return u ? normalizar(u.perfil || u.papel) : null; }
  function matrix(perfil)      { return MATRIX[perfil] || null; }

  // -------- helpers públicos --------
  function can(acao, user, ctx) {
    const p = perfilDoUsuario(user);
    if (!p) return false;
    const m = MATRIX[p];
    if (!m) return false;
    const regra = m.acoes[acao];
    if (regra === undefined) return false;
    if (regra === true)  return true;
    if (regra === false) return false;
    if (regra === 'proprio') return !!ctx && ctx.owner === (user?.id);
    return false;
  }

  function canRoute(rota, user) {
    const p = perfilDoUsuario(user);
    if (!p) return false;
    return MATRIX[p].rotas.includes(rota.replace(/^\//, ''));
  }

  function visivelPlantao(plantao, user) {
    const p = perfilDoUsuario(user);
    if (!p) return false;
    if (MATRIX[p].escopo.verTodosPlantoes) return true;
    return plantao.medicoId === user?.id;
  }

  function exigir(papelOuLista, user) {
    const lista = Array.isArray(papelOuLista) ? papelOuLista : [papelOuLista];
    const p = perfilDoUsuario(user);
    return p && lista.includes(p);
  }

  function exigirRota(rota, user) {
    if (!canRoute(rota, user)) {
      if (user) location.hash = '#/dashboard';
      else      location.hash = '#/login';
      return false;
    }
    return true;
  }

  function exigirAcao(acao, user, ctx) {
    if (can(acao, user, ctx)) return true;
    UI?.toast?.('⛔ Seu perfil não tem permissão para esta ação.', 'err');
    return false;
  }

  // semente de usuários demo cobrindo TODOS os perfis
  function seedDemoUsers() {
    try {
      const KEY = 'pp_users_v1';
      const raw = localStorage.getItem(KEY);
      const users = raw ? JSON.parse(raw) : [];
      if (users.length && users.some(u => PERFIS.includes(normalizar(u.perfil)))) return;
      const need = {
        admin:       { id: 1, nome: 'Ana Souza (Admin)',             email: 'admin@plantaopro.com',        perfil: 'admin',       senha: 'demo123' },
        medico:      { id: 2, nome: 'Dr. Carlos Lima (Médico)',       email: 'medico@plantaopro.com',       perfil: 'medico',      senha: 'demo123' },
        plantonista: { id: 3, nome: 'Dra. Marina Dias (Plantonista)', email: 'plantonista@plantaopro.com', perfil: 'plantonista', senha: 'demo123' }
      };
      for (const k of Object.keys(need)) {
        if (!users.find(u => normalizar(u.perfil) === k)) users.push(need[k]);
      }
      localStorage.setItem(KEY, JSON.stringify(users));
    } catch { /* silencioso */ }
  }

  global.Permissions = {
    PERFIS, ALIAS, MATRIX,
    normalizar, perfilDoUsuario, matrix,
    can, canRoute, exigir, exigirRota, exigirAcao, visivelPlantao,
    seedDemoUsers
  };
})(typeof window !== 'undefined' ? window : globalThis);

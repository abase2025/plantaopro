/* ============================================================
   PlantãoPro — Modo standalone (localStorage)
   Espelha a API REST do backend para o app funcionar SEM servidor
   (protótipo demo). Mesma interface: { status, data }.
   AVISO: hash simples e dados no navegador — NÃO é segurança real.
   ============================================================ */
(function (global) {
  'use strict';
  const STORE = global.localStorage;
  const KEY = 'pp_db_v1';

  function pad(n) { return String(n).padStart(2, '0'); }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(iso, days) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + days); return toISO(d); }

  const TURNOS = {
    manha:     { label: 'Manhã',     inicio: '06:00', fim: '12:00', peso: 1 },
    tarde:     { label: 'Tarde',     inicio: '12:00', fim: '18:00', peso: 1 },
    noite:     { label: 'Noite',     inicio: '18:00', fim: '23:59', peso: 1.5 },
    madrugada: { label: 'Madrugada', inicio: '00:00', fim: '05:59', peso: 1.5 }
  };
  function minutosPlantao(p) {
    const t = TURNOS[p.turno];
    if (!t) return 0;
    let min = parseInt(t.fim.split(':')[0]) * 60 + parseInt(t.fim.split(':')[1])
            - (parseInt(t.inicio.split(':')[0]) * 60 + parseInt(t.inicio.split(':')[1]));
    if (min <= 0) min += 24 * 60;
    return Math.round(min * t.peso);
  }

  // Hash simples para demonstração (NÃO criptográfico)
  function hashSenha(s) {
    let h = 5381;
    const str = 'pp:' + s;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return 'h' + Math.abs(h).toString(36);
  }

  // Configuração financeira (valores de exemplo editáveis pelo gestor no app)
  const CONFIG_FIN_DEFAULT = {
    valorTipo: 'valor_plantao', valorPlantao: 500, valorHora: 120,
    adicionalNoturnoPct: 30, adicionalFeriadoPct: 100, issPct: 5, irPct: 10,
    usarAdicionalNoturno: true, usarAdicionalFeriado: true, usarIss: false, usarIr: false
  };
  function financeiroAtual() { return Object.assign({}, CONFIG_FIN_DEFAULT, db.financeiro || {}); }

  function seed() {
    const hoje = toISO(new Date());
    const usuarios = [
      { id: 1, nome: 'Ana Souza',       email: 'gestor@plantaopro.com',    senha: hashSenha('demo123'), perfil: 'gestor',       setorId: 1, ativo: true },
      { id: 2, nome: 'Dr. Carlos Lima', email: 'medgestor@plantaopro.com', senha: hashSenha('demo123'), perfil: 'medico_gestor', setorId: 1, ativo: true },
      { id: 3, nome: 'Dra. Juliana Rocha', email: 'medico@plantaopro.com', senha: hashSenha('demo123'), perfil: 'medico', setorId: 1, ativo: true },
      { id: 4, nome: 'Dr. Pedro Alves', email: 'medico2@plantaopro.com',   senha: hashSenha('demo123'), perfil: 'medico', setorId: 2, ativo: true },
      { id: 5, nome: 'Dra. Marina Dias', email: 'medico3@plantaopro.com',  senha: hashSenha('demo123'), perfil: 'medico', setorId: 3, ativo: true }
    ];
    const setores = [
      { id: 1, nome: 'UTI' },
      { id: 2, nome: 'Pronto-Socorro' },
      { id: 3, nome: 'Enfermaria' }
    ];
    const plantoes = [
      { id: 1, escalaId: 1, setorId: 1, medicoId: 3, data: hoje,              turno: 'manha',     status: 'confirmado' },
      { id: 2, escalaId: 1, setorId: 1, medicoId: 3, data: addDays(hoje, 1),  turno: 'manha',     status: 'confirmado' },
      { id: 3, escalaId: 1, setorId: 1, medicoId: 4, data: hoje,              turno: 'noite',     status: 'confirmado' },
      { id: 4, escalaId: 1, setorId: 1, medicoId: 5, data: addDays(hoje, 1),  turno: 'madrugada', status: 'confirmado' },
      { id: 5, escalaId: 1, setorId: 2, medicoId: null, data: addDays(hoje, 2), turno: 'noite',   status: 'aberto' }
    ];
    const escalas = [
      { id: 1, titulo: 'Escala UTI — Setembro', setorId: 1, mesRef: new Date().getFullYear() + '-' + pad(new Date().getMonth() + 1), criadoPor: 1 }
    ];
    const ofertas = [
      { id: 1, plantaoId: 5, criadoPor: 1, status: 'aberta', aceitoPor: null, criadoEm: hoje }
    ];
    const checkins = [
      { id: 1, plantaoId: 1, medicoId: 3, dataHora: new Date().toISOString() }
    ];
    return {
      seq: { usuario: 6, escala: 2, plantao: 6, oferta: 2, checkin: 2, mensagem: 1 },
      usuarios, setores, escalas, plantoes, ofertas, checkins,
      mensagens: [],
      financeiro: Object.assign({}, CONFIG_FIN_DEFAULT)
    };
  }
  function load() {
    try {
      const raw = STORE.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        d.plantoes = (d.plantoes || []).map((p) => ({ local: null, valor: null, pago: false, ...p }));
        if (!d.financeiro) d.financeiro = Object.assign({}, CONFIG_FIN_DEFAULT);
        if (!d.plantoes_lembretes)  d.plantoes_lembretes  = [];
        if (!d.plantoes_alertas)    d.plantoes_alertas    = [];
        if (!d.plantoes_financeiro) d.plantoes_financeiro = [];
        if (!d.seq) d.seq = {};
        if (d.seq.lembrete == null) d.seq.lembrete = Math.max(1, d.plantoes_lembretes.length + 1);
        if (d.seq.alerta   == null) d.seq.alerta   = Math.max(1, d.plantoes_alertas.length + 1);
        if (d.seq.lanc     == null) d.seq.lanc     = Math.max(1, d.plantoes_financeiro.length + 1);
        return d;
      }
    } catch (e) { /* ignora */ }
    const d = seed();
    d.plantoes = d.plantoes.map((p) => ({ local: null, valor: null, pago: false, ...p }));
    save(d); return d;
  }
  function save(d) { try { STORE.setItem(KEY, JSON.stringify(d)); } catch (e) { /* armazenamento cheio */ } }
  let db = load();
  const publicar = (u) => { const { senha, ...resto } = u; return resto; };

  function computarHonorarios(usuario) {
    const cfg = financeiroAtual();
    const isGestor = ['gestor', 'medico_gestor'].includes(usuario.perfil);
    const plantoes = db.plantoes.filter((p) => p.medicoId && (isGestor || p.medicoId === usuario.id));
    const ar = (v) => Math.round(v * 100) / 100;
    const registros = plantoes.map((p) => {
      const ck = db.checkins.find((c) => c.plantaoId === p.id);
      const medico = db.usuarios.find((x) => x.id === p.medicoId);
      const t = TURNOS[p.turno] || {};
      const durH = minutosPlantao(p) / 60;
      const base = (p.valor != null && p.valor !== '') ? Number(p.valor) : (cfg.valorTipo === 'valor_hora' ? durH * cfg.valorHora : cfg.valorPlantao);
      const noturno = cfg.usarAdicionalNoturno && (p.turno === 'noite' || p.turno === 'madrugada')
        ? (base * cfg.adicionalNoturnoPct) / 100 : 0;
      const diaSem = new Date(p.data + 'T12:00:00').getDay();
      const feriado = cfg.usarAdicionalFeriado && (diaSem === 0 || diaSem === 6)
        ? (base * cfg.adicionalFeriadoPct) / 100 : 0;
      const bruto = base + noturno + feriado;
      const iss = cfg.usarIss ? (bruto * cfg.issPct) / 100 : 0;
      const ir = cfg.usarIr ? (bruto * cfg.irPct) / 100 : 0;
      const liquido = bruto - iss - ir;
      return {
        plantaoId: p.id, data: p.data, turno: p.turno, turnoLabel: t.label || p.turno,
      setor: (db.setores.find((s) => s.id === p.setorId) || {}).nome || '—',
      local: p.local || null,
      medicoId: p.medicoId, medicoNome: medico ? medico.nome : '—',
      horas: ar(durH), valorBase: ar(base), adicionalNoturno: ar(noturno), adicionalFeriado: ar(feriado),
      iss: ar(iss), ir: ar(ir), valorLiquido: ar(liquido), realizado: !!ck, pago: !!p.pago
      };
    });
    const somar = (arr, k) => arr.reduce((s, r) => s + r[k], 0);
  const porMedico = Object.values(registros.reduce((acc, r) => {
    const ch = String(r.medicoId);
    if (!acc[ch]) acc[ch] = { medicoId: r.medicoId, medicoNome: r.medicoNome, plantoes: 0, bruto: 0, descontos: 0, previsto: 0, realizado: 0, aReceber: 0, recebido: 0 };
    acc[ch].plantoes += 1;
    acc[ch].bruto += r.valorBase + r.adicionalNoturno + r.adicionalFeriado;
    acc[ch].descontos += r.iss + r.ir;
    acc[ch].previsto += r.valorLiquido;
    if (r.realizado) acc[ch].realizado += r.valorLiquido;
    if (r.realizado && !r.pago) acc[ch].aReceber += r.valorLiquido;
    if (r.pago) acc[ch].recebido += r.valorLiquido;
    return acc;
  }, {})).map((m) => ({
    ...m, bruto: ar(m.bruto), descontos: ar(m.descontos), previsto: ar(m.previsto), realizado: ar(m.realizado),
    aReceber: ar(m.aReceber), recebido: ar(m.recebido), liquido: ar(m.previsto)
  }));
    const realizados = registros.filter((r) => r.realizado);
    return {
      registros,
      porMedico,
    totais: {
      previsto: ar(somar(registros, 'valorLiquido')),
      liquidado: ar(somar(realizados, 'valorLiquido')),
      aReceber: ar(somar(realizados.filter((r) => !r.pago), 'valorLiquido')),
      recebido: ar(somar(registros.filter((r) => r.pago), 'valorLiquido')),
      descontos: ar(somar(registros, 'iss') + somar(registros, 'ir')),
      plantoes: registros.length,
      plantoesRealizados: realizados.length,
      plantoesPagos: registros.filter((r) => r.pago).length
    }
    };
  }

  function sessao() {
    try {
      const raw = STORE.getItem('pp_user');
      const u = raw ? JSON.parse(raw) : null;
      if (!u) return null;
      return db.usuarios.find((x) => x.id === u.id && x.ativo) || null;
    } catch (e) { return null; }
  }
  const err = (status, msg) => ({ status, data: { erro: msg } });
  const ok = (status, data) => ({ status, data });

  function handle(method, path, body) {
    const b = body || {};
    const m = String(method).toUpperCase();
    const seg = path.split('?')[0].split('/').filter(Boolean);
    const P = (i) => seg[i];
    const u = sessao();
    const exigir = (...perfis) => {
      if (!u) return err(401, 'Não autenticado.');
      if (perfis.length && !perfis.includes(u.perfil)) return err(403, 'Permissão negada para este perfil.');
      return null;
    };

    /* AUTH (público) */
    if (P(1) === 'auth' && P(2) === 'login' && m === 'POST') {
      const user = db.usuarios.find((x) => x.email === String(b.email || '').toLowerCase());
      if (!user || hashSenha(String(b.senha || '')) !== user.senha) return err(401, 'E-mail ou senha incorretos.');
      return ok(200, { token: 'local-token', usuario: publicar(user) });
    }
    if (P(1) === 'auth' && P(2) === 'register' && m === 'POST') {
      if (!b.nome || !b.email || !b.senha) return err(400, 'Nome, e-mail e senha são obrigatórios.');
      if (String(b.senha).length < 6) return err(400, 'A senha deve ter ao menos 6 caracteres.');
      if (db.usuarios.some((x) => x.email === String(b.email).toLowerCase())) return err(409, 'E-mail já cadastrado.');
      const novo = {
        id: db.seq.usuario++, nome: b.nome, email: String(b.email).toLowerCase(),
        senha: hashSenha(String(b.senha)),
        perfil: ['gestor', 'medico_gestor', 'medico'].includes(b.perfil) ? b.perfil : 'medico',
        setorId: b.setorId || null, ativo: true
      };
      db.usuarios.push(novo); save(db);
      return ok(201, { token: 'local-token', usuario: publicar(novo) });
    }
    if (P(1) === 'auth' && P(2) === 'esqueci-senha' && m === 'POST')
      return ok(200, { mensagem: 'Se o e-mail existir, enviaremos instruções de recuperação (simulado no protótipo).' });

    /* ROTAS PROTEGIDAS */
    const guard = exigir();
    if (guard) return guard;

    /* === NOTIFICAÇÕES (push + WhatsApp) === */
    if (P(1) === 'notifications' && P(2) === 'status' && m === 'GET') {
      return ok(200, {
        canais: {
          email: (window.PPLOCAL_EMAIL_PROVIDER || 'stub'),
          push: (window.PPVAPID_PUBLIC ? 'web-push' : 'stub'),
          whatsapp: (window.PPWA_CONFIGURED ? 'meta-cloud-api' : 'stub')
        },
        lembretesOffsets: [-24, -3, 0],
        whatsappStub: '/tmp/plantaopro-whatsapp-dev.log'
      });
    }
    if (P(1) === 'notifications' && P(2) === 'preferences' && m === 'GET') {
      db.whatsapp_optin = db.whatsapp_optin || [];
      const opt = db.whatsapp_optin.find(o => o.usuario_id === u.id) || null;
      return ok(200, { preferencias: opt });
    }
    if (P(1) === 'notifications' && P(2) === 'preferences' && m === 'POST') {
      let tel = String(b.telefone || '').trim();
      let e164 = tel.startsWith('+') ? tel : ('+55' + tel.replace(/\D/g, ''));
      if (!/^\+[1-9][0-9]{6,14}$/.test(e164)) return err(400, 'Telefone inválido. Use DDI, ex.: +5511999998888.');
      db.whatsapp_optin = db.whatsapp_optin || [];
      const idx = db.whatsapp_optin.findIndex(o => o.usuario_id === u.id);
      const rec = {
        telefone_e164: e164,
        aceitar_lembretes: b.aceitar_lembretes !== false,
        aceitar_alertas: b.aceitar_alertas !== false,
        template_lang: b.template_lang || 'pt_BR',
        atualizado_em: new Date().toISOString()
      };
      db.seq = db.seq || {};
      if (idx >= 0) db.whatsapp_optin[idx] = { ...db.whatsapp_optin[idx], ...rec };
      else db.whatsapp_optin.push({ id: (db.seq.whatsapp_optin = (db.seq.whatsapp_optin || 0) + 1), usuario_id: u.id, criado_em: new Date().toISOString(), ...rec });
      save(db);
      return ok(201, { ok: true, telefone_e164: e164 });
    }
    if (P(1) === 'notifications' && P(2) === 'recentes' && m === 'GET') {
      const qs = (path.split('?')[1] || '');
      const limit = Math.min(parseInt((qs.match(/limit=(\d+)/) || [])[1]) || 50, 200);
      db.notifications_log = db.notifications_log || [];
      const out = db.notifications_log.filter(n => {
        const l = (db.plantoes_lembretes || []).find(x => x.id === n.lembrete_id);
        if (!l) return false;
        const p = (db.plantoes || []).find(x => x.id === l.plantao_id);
        return p && p.medicoId === u.id;
      }).sort((a, b) => (b.enviado_em || '').localeCompare(a.enviado_em || '')).slice(0, limit);
      return ok(200, { notificacoes: out, unread: out.length });
    }
    if (P(1) === 'notifications' && P(2) === 'test' && m === 'POST') {
      if (!['gestor', 'medico_gestor'].includes(u.perfil)) return err(403, 'Apenas gestor / médico gestor.');
      const opt = (db.whatsapp_optin || []).find(o => o.usuario_id === u.id);
      if (!opt) return err(400, 'Faça opt-in antes.');
      const line = JSON.stringify({ ts: new Date().toISOString(), canal: 'whatsapp', to: opt.telefone_e164, template: 'plantaopro_lembrete_inicio', params: [u.nome, 'hospital de teste', new Date().toISOString().slice(0, 10)] });
      try { localStorage.setItem('pp_wa_stub_last', line); } catch {}
      db.notifications_log = db.notifications_log || [];
      db.seq = db.seq || {};
      db.notifications_log.push({
        id: (db.seq.notif_log = (db.seq.notif_log || 0) + 1),
        lembrete_id: 0, canal: 'whatsapp', destinatario: opt.telefone_e164, status: 'enviado',
        provider_id: 'stub-' + Date.now(), enviado_em: new Date().toISOString()
      });
      save(db);
      return ok(200, { status: 'enviado', stub: true });
    }

    if (P(1) === 'me' && m === 'GET') return ok(200, { usuario: publicar(u) });
    if (P(1) === 'setores' && m === 'GET') return ok(200, { setores: db.setores });

    if (P(1) === 'usuarios' && m === 'GET') {
      const g = exigir('gestor', 'medico_gestor'); if (g) return g;
      const lista = db.usuarios.filter((x) => ['gestor', 'medico_gestor', 'medico'].includes(x.perfil))
        .map((x) => ({ ...publicar(x), setor: db.setores.find((s) => s.id === x.setorId)?.nome || '—' }));
      return ok(200, { usuarios: lista });
    }
    if (P(1) === 'usuarios' && m === 'POST') {
      const g = exigir('gestor'); if (g) return g;
      if (!b.nome || !b.email || !b.senha) return err(400, 'Preencha nome, e-mail e senha.');
      if (db.usuarios.some((x) => x.email === String(b.email).toLowerCase())) return err(409, 'E-mail já cadastrado.');
      const novo = {
        id: db.seq.usuario++, nome: b.nome, email: String(b.email).toLowerCase(),
        senha: hashSenha(String(b.senha)),
        perfil: ['gestor', 'medico_gestor', 'medico'].includes(b.perfil) ? b.perfil : 'medico',
        setorId: b.setorId || null, ativo: true
      };
      db.usuarios.push(novo); save(db);
      return ok(201, { usuario: publicar(novo) });
    }

    if (P(1) === 'escalas' && m === 'GET') {
      const lista = db.escalas.map((e) => ({
        ...e,
        setor: db.setores.find((s) => s.id === e.setorId)?.nome || '—',
        plantoes: db.plantoes.filter((p) => p.escalaId === e.id).map((p) => ({
          ...p,
          medico: p.medicoId ? publicar(db.usuarios.find((x) => x.id === p.medicoId)) : null,
          turnoLabel: TURNOS[p.turno]?.label || p.turno
        }))
      }));
      return ok(200, { escalas: lista });
    }
    if (P(1) === 'escalas' && m === 'POST') {
      const g = exigir('gestor', 'medico_gestor'); if (g) return g;
      if (!b.titulo || !b.setorId || !b.mesRef) return err(400, 'Título, setor e referência do mês são obrigatórios.');
      const escala = { id: db.seq.escala++, titulo: b.titulo, setorId: b.setorId, mesRef: b.mesRef, criadoPor: u.id };
      db.escalas.push(escala); save(db);
      return ok(201, { escala });
    }

    if (P(1) === 'plantoes' && m === 'POST' && seg.length === 2) {
      const ehGestor = ['gestor','medico_gestor'].includes(u.perfil);
      const exige   = exigir(ehGestor ? 'gestor' : 'medico'); if (exige) return exige;
      if (!b.escalaId || !b.data || !b.turno) return err(400, 'Escala, data e turno são obrigatórios.');
      if (!TURNOS[b.turno]) return err(400, 'Turno inválido.');
      const medicoEfetivo = ehGestor ? (b.medicoId || null) : u.id;
      const conflito = db.plantoes.some((p) => p.medicoId && p.medicoId === medicoEfetivo && p.data === b.data && p.turno === b.turno);
      if (conflito) return err(409, 'Conflito: este médico já possui plantão nessa data/turno.');
      const inicio = b.inicio || '08:00';
      const fim    = b.fim    || '18:00';
      const minutos = (b.inicio && b.fim) ? Math.max(0,
        (parseInt(b.fim.split(':')[0])*60+parseInt(b.fim.split(':')[1])) -
        (parseInt(b.inicio.split(':')[0])*60+parseInt(b.inicio.split(':')[1]))) : 600;
      const plantao = {
        id: db.seq.plantao++, escalaId: b.escalaId, setorId: b.setorId || 1,
        medicoId: medicoEfetivo, data: b.data, turno: b.turno,
        status: medicoEfetivo ? 'confirmado' : 'aberto',
        instituicao: b.instituicao || b.local || null,
        local: b.local || b.instituicao || null,
        valor: b.valor != null ? Number(b.valor) : null,
        pago: false,
        observacoes: b.observacoes || null,
        inicio, fim, minutos_estimados: minutos,
        status_lifecycle: 'agendado', pagamento_status: 'pendente',
        criado_em: new Date().toISOString()
      };
      db.plantoes.push(plantao);
      // Cascade automático (mesmo plantao_id): lembretes + alerta + financeiro
      const dt = new Date(plantao.data + 'T' + (plantao.inicio || '08:00') + ':00');
      db.plantoes_lembretes = db.plantoes_lembretes || [];
      db.plantoes_alertas   = db.plantoes_alertas   || [];
      db.plantoes_financeiro= db.plantoes_financeiro|| [];
      db.plantoes_lembretes.push(
        { id: db.seq.lembrete++, plantao_id: plantao.id, tipo: 'um_dia_antes', offset_horas: -24, mensagem: '🔔 Lembrete: seu plantão em ' + (plantao.local||'hospital') + ' é amanhã', executar_em: new Date(dt.getTime()-24*3600*1000).toISOString(), ativo: true },
        { id: db.seq.lembrete++, plantao_id: plantao.id, tipo: 'algumas_horas_antes', offset_horas: -3, mensagem: '⏰ Plantão em ' + (plantao.local||'hospital') + ' em 3h', executar_em: new Date(dt.getTime()-3*3600*1000).toISOString(), ativo: true },
        { id: db.seq.lembrete++, plantao_id: plantao.id, tipo: 'em_andamento', offset_horas: 0, mensagem: '▶️ Plantão em ' + (plantao.local||'hospital') + ' começando agora', executar_em: dt.toISOString(), ativo: true }
      );
      db.plantoes_alertas.push({
        id: db.seq.alerta++, plantao_id: plantao.id, tipo: 'criado',
        mensagem: 'Plantão cadastrado: ' + (plantao.local||'hospital') + ' em ' + plantao.data,
        usuario_id: u.id, criado_em: new Date().toISOString()
      });
      db.plantoes_financeiro.push({
        id: db.seq.lanc++, plantao_id: plantao.id, categoria: 'receita_prevista',
        valor: Number(plantao.valor)||0,
        descricao: 'Receita prevista: ' + (plantao.local||'hospital') + ' ' + plantao.data,
        mes_ref: plantao.data.slice(0,7), criado_em: new Date().toISOString()
      });
      save(db);
      return ok(201, { plantao });
    }
    if (P(1) === 'plantoes' && m === 'DELETE') {
      const id = Number(P(2));
      const p = db.plantoes.find(x => x.id === id);
      if (!p) return err(404, 'Plantão não encontrado.');
      const ehGestor = ['gestor','medico_gestor'].includes(u.perfil);
      if (!ehGestor && p.medicoId !== u.id) return err(403, 'Sem permissão para excluir este plantão.');
      const lemAntes = (db.plantoes_lembretes||[]).filter(l=>l.plantao_id===id).length;
      const alAntes  = (db.plantoes_alertas||[]).filter(a=>a.plantao_id===id).length;
      const fiAntes  = (db.plantoes_financeiro||[]).filter(f=>f.plantao_id===id).length;
      db.plantoes = db.plantoes.filter(x => x.id !== id);
      db.plantoes_lembretes  = (db.plantoes_lembretes  || []).filter(l => l.plantao_id !== id);
      db.plantoes_alertas    = (db.plantoes_alertas    || []).filter(a => a.plantao_id !== id);
      db.plantoes_financeiro = (db.plantoes_financeiro || []).filter(f => f.plantao_id !== id);
      save(db);
      return ok(200, { ok: true, deletado: id, cascade: { lembretes: lemAntes, alertas: alAntes, financeiro: fiAntes } });
    }
    if (P(1) === 'plantoes' && m === 'PUT') {
      const p = db.plantoes.find((x) => x.id === Number(P(2)));
      if (!p) return err(404, 'Plantão não encontrado.');
      const ehGestor = ['gestor', 'medico_gestor'].includes(u.perfil);
      const ehDono = p.medicoId === u.id && u.perfil === 'medico';
      if (!ehGestor && !ehDono) return err(403, 'Sem permissão para editar este plantão.');
      if (b.data !== undefined) p.data = b.data;
      if (b.turno !== undefined) {
        if (!TURNOS[b.turno]) return err(400, 'Turno inválido.');
        p.turno = b.turno;
      }
      if (b.local !== undefined) p.local = b.local ? String(b.local).slice(0, 200) : null;
      if (b.valor !== undefined) {
        p.valor = (b.valor === '' || b.valor === null) ? null : Number(b.valor);
        if (p.valor !== null && isNaN(p.valor)) return err(400, 'Valor inválido.');
      }
      if (ehGestor && b.medicoId !== undefined) { p.medicoId = b.medicoId || null; p.status = b.medicoId ? 'confirmado' : 'aberto'; }
      save(db);
      return ok(200, { plantao: p });
    }
    if (P(1) === 'plantoes' && P(3) === 'pagar' && m === 'POST') {
      const p = db.plantoes.find((x) => x.id === Number(P(2)));
      if (!p) return err(404, 'Plantão não encontrado.');
      const ehGestor = ['gestor', 'medico_gestor'].includes(u.perfil);
      if (!ehGestor && p.medicoId !== u.id) return err(403, 'Sem permissão para dar baixa neste plantão.');
      p.pago = true; save(db);
      return ok(200, { plantao: p });
    }

    if (P(1) === 'ofertas' && m === 'GET') {
      const lista = db.ofertas.map((o) => {
        const pl = db.plantoes.find((p) => p.id === o.plantaoId);
        return {
          ...o,
          plantao: pl ? { ...pl, turnoLabel: TURNOS[pl.turno]?.label } : null,
          setor: pl ? db.setores.find((s) => s.id === pl.setorId)?.nome : '—',
          criadoPorNome: db.usuarios.find((x) => x.id === o.criadoPor)?.nome || '—',
          aceitoPorNome: o.aceitoPor ? db.usuarios.find((x) => x.id === o.aceitoPor)?.nome || ('#' + o.aceitoPor) : null
        };
      });
      return ok(200, { ofertas: lista });
    }
    if (P(1) === 'ofertas' && m === 'POST' && seg.length === 2) {
      const g = exigir('gestor', 'medico_gestor'); if (g) return g;
      const plantao = db.plantoes.find((p) => p.id === Number(b.plantaoId));
      if (!plantao) return err(404, 'Plantão não encontrado.');
      if (plantao.medicoId) return err(409, 'Este plantão já tem médico alocado.');
      const oferta = { id: db.seq.oferta++, plantaoId: plantao.id, criadoPor: u.id, status: 'aberta', aceitoPor: null, criadoEm: toISO(new Date()) };
      db.ofertas.push(oferta); save(db);
      return ok(201, { oferta });
    }
    if (P(1) === 'ofertas' && P(2) !== undefined && P(3) === 'aceitar' && m === 'POST') {
      const g = exigir('medico'); if (g) return g;
      const o = db.ofertas.find((x) => x.id === Number(P(2)));
      if (!o) return err(404, 'Oferta não encontrada.');
      if (o.status !== 'aberta') return err(409, 'Esta oferta já foi aceita ou encerrada.');
      const plantao = db.plantoes.find((p) => p.id === o.plantaoId);
      const conflito = db.plantoes.some((p) => p.medicoId === u.id && p.data === plantao.data && p.turno === plantao.turno && p.id !== plantao.id);
      if (conflito) return err(409, 'Conflito de agenda: você já tem plantão nessa data/turno.');
      o.status = 'aceita'; o.aceitoPor = u.id;
      plantao.medicoId = u.id; plantao.status = 'confirmado';
      save(db);
      return ok(200, { oferta: o });
    }

    if (P(1) === 'checkins' && m === 'GET') {
      const lista = db.checkins
        .filter((c) => ['gestor', 'medico_gestor'].includes(u.perfil) || c.medicoId === u.id)
        .map((c) => ({ ...c, plantao: db.plantoes.find((p) => p.id === c.plantaoId) }));
      return ok(200, { checkins: lista });
    }
    if (P(1) === 'checkins' && m === 'POST') {
      const g = exigir('medico'); if (g) return g;
      const plantao = db.plantoes.find((p) => p.id === Number(b.plantaoId));
      if (!plantao) return err(404, 'Plantão não encontrado.');
      if (plantao.medicoId !== u.id) return err(403, 'Você só pode fazer check-in em plantões seus.');
      if (db.checkins.some((c) => c.plantaoId === plantao.id && c.medicoId === u.id)) return err(409, 'Check-in já realizado para este plantão.');
      const ck = { id: db.seq.checkin++, plantaoId: plantao.id, medicoId: u.id, dataHora: new Date().toISOString() };
      db.checkins.push(ck); save(db);
      return ok(201, { checkin: ck });
    }

    if (P(1) === 'horas' && m === 'GET') {
      const ehGestor = ['gestor', 'medico_gestor'].includes(u.perfil);
      const plantoes = db.plantoes.filter((p) => (ehGestor ? true : p.medicoId === u.id));
      const registros = plantoes.map((p) => {
        const ck = db.checkins.find((c) => c.plantaoId === p.id);
        const medico = db.usuarios.find((x) => x.id === p.medicoId);
        return {
          plantaoId: p.id, data: p.data, turno: p.turno, turnoLabel: TURNOS[p.turno]?.label,
          medicoId: p.medicoId, medicoNome: medico ? medico.nome : '—',
          setor: db.setores.find((s) => s.id === p.setorId)?.nome || '—',
          fezCheckin: !!ck, horas: ck ? minutosPlantao(p) : 0
        };
      });
      const porMedico = ehGestor
        ? Object.values(registros.reduce((acc, r) => {
            if (!r.fezCheckin || !r.medicoId) return acc;
            const ch = String(r.medicoId);
            acc[ch] = acc[ch] || { medicoId: r.medicoId, medicoNome: r.medicoNome, minutos: 0, plantoes: 0 };
            acc[ch].minutos += r.horas; acc[ch].plantoes += 1;
            return acc;
          }, {}))
        : [];
      const meusTotais = registros.filter((r) => r.fezCheckin)
        .reduce((acc, r) => {
          acc.minutos += r.horas; acc.plantoes += 1;
          acc.detalhes.push({ data: r.data, turnoLabel: r.turnoLabel, setor: r.setor, horas: r.horas });
          return acc;
        }, { minutos: 0, plantoes: 0, detalhes: [] });
      return ok(200, { registros, porMedico, meusTotais });
    }

    if (P(1) === 'financeiro' && P(2) === 'config' && m === 'GET') {
      return ok(200, { financeiro: financeiroAtual() });
    }
    if (P(1) === 'financeiro' && P(2) === 'config' && m === 'PUT') {
      const g = exigir('gestor', 'medico_gestor'); if (g) return g;
      db.financeiro = Object.assign({}, financeiroAtual(), b);
      save(db);
      return ok(200, { financeiro: db.financeiro });
    }
    if (P(1) === 'financeiro' && P(2) === 'honorarios' && m === 'GET') {
      return ok(200, computarHonorarios(u));
    }

    if (P(1) === 'mensagens' && m === 'GET') {
      const qs = path.split('?')[1] || '';
      const setorId = Number((qs.match(/setorId=(\d+)/) || [])[1] || 0);
      const lista = db.mensagens.filter((x) => !setorId || x.setorId === setorId)
        .map((x) => ({ ...x, remetente: db.usuarios.find((r) => r.id === x.remetenteId)?.nome || '—' }));
      return ok(200, { mensagens: lista });
    }
    if (P(1) === 'mensagens' && m === 'POST') {
      if (!b.setorId || !b.texto || !String(b.texto).trim()) return err(400, 'Setor e texto são obrigatórios.');
      const msg = { id: db.seq.mensagem++, setorId: b.setorId, remetenteId: u.id, texto: String(b.texto).slice(0, 500), criadoEm: new Date().toISOString() };
      db.mensagens.push(msg); save(db);
      return ok(201, { mensagem: msg });
    }

    return err(404, 'Rota não encontrada.');
  }

  global.PPLocalDB = {
    handle,
    reset: () => { try { STORE.removeItem(KEY); } catch (e) { /* ignora */ } db = load(); },
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);

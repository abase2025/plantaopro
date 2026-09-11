/* ============================================================
   PlantãoPro — Backend (API REST) — DUAL MODE
   • Com DATABASE_URL → Postgres (lib `pg`) com migrations/seed
   • Sem DATABASE_URL → JSON local em data/db.json (modo demo)
   Inclui módulo de lembretes: e-mail (SMTP/Resend) + Web Push (VAPID).
   ============================================================ */
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const cron     = require('node-cron');
const path     = require('path');
const fs       = require('fs');

const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'plantaopro-secret-dev-2026';
const FRONT_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5500,https://abase2025.github.io')
  .split(',').map(s => s.trim()).filter(Boolean);

const { USING_PG, _pgPool, ensureJSON, persistJSON, runAllMigrations } = require('./db-pg');
const reminders = require('./reminders');

const pad   = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso, days) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + days); return toISO(d); };

let memDB = USING_PG ? null : ensureJSON();

/* --------- Adapters --------- */
async function query(sql, params = []) {
  if (USING_PG) { const r = await _pgPool.query(sql, params); return r.rows; }
  throw new Error('query() só em modo Postgres.');
}
async function exec(sql, params = []) {
  if (USING_PG) { await _pgPool.query(sql, params); return true; }
  throw new Error('exec() só em modo Postgres.');
}

const TURNOS = {
  manha:    { label: 'Manhã',      inicio: '06:00', fim: '12:00', peso: 1 },
  tarde:    { label: 'Tarde',      inicio: '12:00', fim: '18:00', peso: 1 },
  noite:    { label: 'Noite',      inicio: '18:00', fim: '23:59', peso: 1.5 },
  madrugada:{ label: 'Madrugada',  inicio: '00:00', fim: '05:59', peso: 1.5 }
};
function minutosPlantao(p) {
  const t = TURNOS[p.turno]; if (!t) return 0;
  let min = (parseInt(t.fim.split(':')[0]) * 60 + parseInt(t.fim.split(':')[1]))
          - (parseInt(t.inicio.split(':')[0]) * 60 + parseInt(t.inicio.split(':')[1]));
  if (min <= 0) min += 24 * 60;
  return Math.round(min * t.peso);
}
const publicar = (u) => { const { senha, ...resto } = u; return resto; };

/* ---- Dados ---- */
async function getUsuarios() {
  if (USING_PG) return await query('SELECT id,nome,email,senha,perfil,setor_id,ativo FROM usuarios ORDER BY id');
  return memDB.usuarios;
}
async function getUsuarioByEmail(email) {
  const e = String(email || '').toLowerCase();
  if (USING_PG) { const r = await query('SELECT * FROM usuarios WHERE email=$1', [e]); return r[0] || null; }
  return memDB.usuarios.find(u => u.email === e) || null;
}
async function getUsuarioById(id) {
  if (USING_PG) { const r = await query('SELECT id,nome,email,perfil,setor_id,ativo FROM usuarios WHERE id=$1', [id]); return r[0] || null; }
  const u = memDB.usuarios.find(x => x.id === id); return u ? publicar(u) : null;
}
async function getSetores() {
  if (USING_PG) return await query('SELECT id,nome FROM setores ORDER BY id');
  return memDB.setores;
}
async function getEscalas() {
  if (USING_PG) {
    const esc = await query(`
      SELECT e.id,e.titulo,e.setor_id,e.mes_ref,e.criado_por,s.nome AS setor_nome,
             COALESCE((SELECT json_agg(p ORDER BY p.data ASC) FROM plantoes p WHERE p.escala_id=e.id), '[]'::json) AS plantoes
      FROM escalas e LEFT JOIN setores s ON s.id=e.setor_id ORDER BY e.id`);
    const usuarios = await getUsuarios();
    return esc.map(e => ({
      id: e.id, titulo: e.titulo, setorId: e.setor_id, mesRef: e.mes_ref, criadoPor: e.criado_por,
      setor: e.setor_nome || '—',
      plantoes: (e.plantoes || []).map(p => ({
        ...p, escalaId: p.escala_id, setorId: p.setor_id, medicoId: p.medico_id,
        turnoLabel: TURNOS[p.turno]?.label || p.turno,
        medico: usuarios.find(u => u.id === p.medico_id) ? publicar(usuarios.find(u => u.id === p.medico_id)) : null
      }))
    }));
  }
  return memDB.escalas.map(e => ({
    ...e,
    setor: memDB.setores.find(s => s.id === e.setorId)?.nome || '—',
    plantoes: memDB.plantoes.filter(p => p.escalaId === e.id).map(p => ({
      ...p,
      medico: memDB.usuarios.find(u => u.id === p.medicoId) ? publicar(memDB.usuarios.find(u => u.id === p.medicoId)) : null,
      turnoLabel: TURNOS[p.turno]?.label || p.turno
    }))
  }));
}
async function getPlantoes() {
  if (USING_PG) return await query('SELECT * FROM plantoes ORDER BY data, turno');
  return memDB.plantoes;
}
async function getOfertas() {
  if (USING_PG) {
    return await query(`SELECT o.id,o.plantao_id,o.criado_por,o.status,o.aceito_por,o.criado_em,
                              p.data,p.turno,p.setor_id,s.nome AS setor_nome,
                              uc.nome AS criado_por_nome
                       FROM ofertas o JOIN plantoes p ON p.id=o.plantao_id
                       LEFT JOIN setores s ON s.id=p.setor_id
                       LEFT JOIN usuarios uc ON uc.id=o.criado_por ORDER BY o.id`);
  }
  return memDB.ofertas.map(o => {
    const pl = memDB.plantoes.find(p => p.id === o.plantaoId);
    return {
      ...o,
      plantao: pl ? { ...pl, turnoLabel: TURNOS[pl.turno]?.label } : null,
      setor: pl ? memDB.setores.find(s => s.id === pl.setorId)?.nome : '—',
      criadoPorNome: memDB.usuarios.find(u => u.id === o.criadoPor)?.nome || '—'
    };
  });
}
async function getCheckins() {
  if (USING_PG) return await query('SELECT * FROM checkins ORDER BY data_hora DESC');
  return memDB.checkins;
}
async function getMensagens(setorId = null) {
  if (USING_PG) {
    return await query(`SELECT m.id,m.setor_id,m.remetente_id,m.texto,m.criado_em,u.nome AS remetente
                        FROM mensagens m LEFT JOIN usuarios u ON u.id=m.remetente_id
                        ${setorId ? 'WHERE m.setor_id=$1' : ''} ORDER BY m.criado_em DESC LIMIT 200`, setorId ? [setorId] : []);
  }
  return memDB.mensagens
    .filter(m => !setorId || m.setorId === setorId)
    .map(m => ({ ...m, remetente: memDB.usuarios.find(u => u.id === m.remetenteId)?.nome || '—' }));
}
async function getConfigFinanceiro() {
  if (USING_PG) {
    let r = await query('SELECT * FROM financeiro_config WHERE singleton=TRUE LIMIT 1');
    if (!r[0]) { await exec('INSERT INTO financeiro_config (singleton) VALUES (TRUE)'); r = await query('SELECT * FROM financeiro_config WHERE singleton=TRUE LIMIT 1'); }
    const c = r[0];
    return {
      valorTipo: c.valor_tipo, valorPlantao: Number(c.valor_plantao), valorHora: Number(c.valor_hora),
      adicionalNoturnoPct: Number(c.adicional_noturno_pct), adicionalFeriadoPct: Number(c.adicional_feriado_pct),
      issPct: Number(c.iss_pct), irPct: Number(c.ir_pct),
      usarAdicionalNoturno: c.usar_adicional_noturno, usarAdicionalFeriado: c.usar_adicional_feriado,
      usarIss: c.usar_iss, usarIr: c.usar_ir
    };
  }
  return Object.assign({
    valorTipo: 'valor_plantao', valorPlantao: 500, valorHora: 120,
    adicionalNoturnoPct: 30, adicionalFeriadoPct: 100, issPct: 5, irPct: 10,
    usarAdicionalNoturno: true, usarAdicionalFeriado: true, usarIss: false, usarIr: false
  }, memDB.financeiro || {});
}
async function computarHonorarios(user) {
  const cfg = await getConfigFinanceiro();
  const ehGestor = ['gestor', 'medico_gestor'].includes(user.perfil);
  const plantoes = (await getPlantoes()).filter(p => p.medicoId && (ehGestor || p.medicoId === user.id));
  const checkins = await getCheckins();
  const usuarios = await getUsuarios();
  const setores = await getSetores();
  const ar = (v) => Math.round((Number(v) || 0) * 100) / 100;
  const registros = plantoes.map(p => {
    const ck = checkins.find(c => c.plantaoId === p.id && c.medicoId === p.medicoId);
    const medico = usuarios.find(x => x.id === p.medicoId);
    const t = TURNOS[p.turno] || {};
    const durH = minutosPlantao(p) / 60;
    const base = (p.valor != null && p.valor !== '') ? Number(p.valor) : (cfg.valorTipo === 'valor_hora' ? durH * cfg.valorHora : cfg.valorPlantao);
    const noturno = cfg.usarAdicionalNoturno && (p.turno === 'noite' || p.turno === 'madrugada') ? (base * cfg.adicionalNoturnoPct) / 100 : 0;
    const diaSem = new Date(p.data + 'T12:00:00').getDay();
    const feriado = cfg.usarAdicionalFeriado && (diaSem === 0 || diaSem === 6) ? (base * cfg.adicionalFeriadoPct) / 100 : 0;
    const bruto = base + noturno + feriado;
    const iss = cfg.usarIss ? (bruto * cfg.issPct) / 100 : 0;
    const ir  = cfg.usarIr  ? (bruto * cfg.irPct)  / 100 : 0;
    const liquido = bruto - iss - ir;
    return {
      plantaoId: p.id, data: typeof p.data === 'string' ? p.data : toISO(p.data),
      turno: p.turno, turnoLabel: t.label || p.turno,
      setor: (setores.find(s => s.id === p.setorId) || {}).nome || '—',
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
  }, {})).map(m => ({ ...m, bruto: ar(m.bruto), descontos: ar(m.descontos), previsto: ar(m.previsto), realizado: ar(m.realizado), aReceber: ar(m.aReceber), recebido: ar(m.recebido), liquido: ar(m.previsto) }));
  const realizados = registros.filter(r => r.realizado);
  return {
    registros, porMedico,
    totais: {
      previsto:    ar(somar(registros, 'valorLiquido')),
      liquidado:   ar(somar(realizados, 'valorLiquido')),
      aReceber:    ar(somar(realizados.filter(r => !r.pago), 'valorLiquido')),
      recebido:    ar(somar(registros.filter(r => r.pago), 'valorLiquido')),
      descontos:   ar(somar(registros, 'iss') + somar(registros, 'ir')),
      plantoes: registros.length,
      plantoesRealizados: realizados.length,
      plantoesPagos: registros.filter(r => r.pago).length
    }
  };
}

/* ---------- App ---------- */
const app = express();
app.use(cors({ origin: (o, cb) => cb(null, true), credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- Auth ---------- */
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Não autenticado.' });
  try { req.userId = jwt.verify(token, JWT_SECRET).sub; next(); }
  catch { return res.status(401).json({ erro: 'Sessão inválida.' }); }
}
async function loadUser(req, res, next) {
  const u = await getUsuarioById(req.userId);
  if (!u || !u.ativo) return res.status(401).json({ erro: 'Usuário inexistente ou inativo.' });
  req.user = u; next();
}
function perfis(...roles) {
  return async (req, res, next) => {
    await loadUser(req, res, () => {
      roles.includes(req.user.perfil) ? next() : res.status(403).json({ erro: 'Permissão negada.' });
    });
  };
}
const authOnly = [auth, loadUser];

/* ---------- Health ---------- */
app.get('/api/health', async (req, res) => {
  try {
    const ping = USING_PG ? await query('SELECT 1 AS ok').then(r => r[0]?.ok === 1) : true;
    res.json({
      ok: true, servico: 'plantaopro',
      modo: USING_PG ? 'postgres' : 'json', db: ping,
      origens: FRONT_ORIGINS,
      lembrete: {
        cronInterno: process.env.DISABLE_INTERNAL_CRON ? 'desativado' : 'ativo (a cada hora + diário 08:00)',
        emailProvider: process.env.RESEND_API_KEY ? 'resend' : (process.env.SMTP_HOST ? 'smtp' : 'stub'),
        pushProvider:  (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) ? 'web-push' : 'stub',
        cronEndpointSecretSet: !!process.env.CRON_SECRET
      }
    });
  } catch (e) { res.status(500).json({ ok: false, erro: e.message }); }
});

/* ---------- AUTH ---------- */
app.post('/api/auth/register', async (req, res) => {
  const { nome, email, senha, perfil = 'medico', setorId = null } = req.body || {};
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios.' });
  if (String(senha).length < 6) return res.status(400).json({ erro: 'Senha com no mínimo 6 caracteres.' });
  if (await getUsuarioByEmail(email)) return res.status(409).json({ erro: 'E-mail já cadastrado.' });
  const perfilOk = ['gestor','medico_gestor','medico'].includes(perfil) ? perfil : 'medico';
  const senhaHash = bcrypt.hashSync(String(senha), 8);
  let novo;
  if (USING_PG) {
    const r = await query(`INSERT INTO usuarios (nome,email,senha,perfil,setor_id,ativo) VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id,nome,email,perfil,setor_id,ativo`,
      [nome, String(email).toLowerCase(), senhaHash, perfilOk, setorId]);
    novo = r[0];
  } else {
    novo = { id: memDB.seq.usuario++, nome, email: String(email).toLowerCase(), senha: senhaHash, perfil: perfilOk, setorId, ativo: true };
    memDB.usuarios.push(novo); persistJSON(memDB);
  }
  const token = jwt.sign({ sub: novo.id }, JWT_SECRET, { expiresIn: '12h' });
  res.status(201).json({ token, usuario: publicar(novo) });
});
app.post('/api/auth/login', async (req, res) => {
  const { email, senha } = req.body || {};
  const user = await getUsuarioByEmail(email);
  if (!user || !bcrypt.compareSync(String(senha || ''), user.senha)) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, usuario: publicar(user) });
});
app.post('/api/auth/esqueci-senha', async (req, res) => {
  const { email } = req.body || {};
  console.log(`[PLANTAOPRO] reset solicitado: ${email}`);
  res.json({ mensagem: 'Se o e-mail existir, enviaremos instruções de recuperação (simulado no protótipo).' });
});
app.get('/api/me', authOnly, (req, res) => res.json({ usuario: req.user }));

/* ---------- USUÁRIOS ---------- */
app.get('/api/usuarios', authOnly, perfis('gestor','medico_gestor'), async (req, res) => {
  const setores = await getSetores();
  const usuarios = await getUsuarios();
  res.json({ usuarios: usuarios.filter(u => ['gestor','medico_gestor','medico'].includes(u.perfil)).map(u => ({ ...publicar(u), setor: setores.find(s => s.id === (u.setorId || u.setor_id))?.nome || '—' })) });
});
app.post('/api/usuarios', authOnly, perfis('gestor'), async (req, res) => {
  const { nome, email, senha, perfil, setorId } = req.body || {};
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Preencha nome, e-mail e senha.' });
  if (await getUsuarioByEmail(email)) return res.status(409).json({ erro: 'E-mail já cadastrado.' });
  const perfilOk = ['gestor','medico_gestor','medico'].includes(perfil) ? perfil : 'medico';
  const senhaHash = bcrypt.hashSync(String(senha), 8);
  let novo;
  if (USING_PG) {
    const r = await query(`INSERT INTO usuarios (nome,email,senha,perfil,setor_id,ativo) VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id,nome,email,perfil,setor_id,ativo`,
      [nome, String(email).toLowerCase(), senhaHash, perfilOk, setorId || null]);
    novo = r[0];
  } else {
    novo = { id: memDB.seq.usuario++, nome, email: String(email).toLowerCase(), senha: senhaHash, perfil: perfilOk, setorId: setorId || null, ativo: true };
    memDB.usuarios.push(novo); persistJSON(memDB);
  }
  res.status(201).json({ usuario: publicar(novo) });
});

/* ---------- ESCALAS + PLANTÕES ---------- */
app.get('/api/escalas', authOnly, async (req, res) => res.json({ escalas: await getEscalas() }));
app.post('/api/escalas', authOnly, perfis('gestor','medico_gestor'), async (req, res) => {
  const { titulo, setorId, mesRef } = req.body || {};
  if (!titulo || !setorId || !mesRef) return res.status(400).json({ erro: 'Título, setor e mês são obrigatórios.' });
  let esc;
  if (USING_PG) {
    const r = await query(`INSERT INTO escalas (titulo,setor_id,mes_ref,criado_por) VALUES ($1,$2,$3,$4) RETURNING id,titulo,setor_id,mes_ref,criado_por`,
      [titulo, setorId, mesRef, req.user.id]);
    esc = r[0];
  } else {
    esc = { id: memDB.seq.escala++, titulo, setorId, mesRef, criadoPor: req.user.id, criadoEm: new Date().toISOString() };
    memDB.escalas.push(esc); persistJSON(memDB);
  }
  res.status(201).json({ escala: esc });
});
app.post('/api/plantoes', authOnly, perfis('gestor','medico_gestor','medico'), async (req, res) => {
  // Médicos podem cadastrar para si mesmos (medicoId = próprio user.id)
  const { escalaId, setorId, medicoId, data, turno, instituicao, local, valor, observacoes, inicio, fim } = req.body || {};
  if (!escalaId || !data || !turno) return res.status(400).json({ erro: 'Escala, data e turno são obrigatórios.' });
  if (!TURNOS[turno]) return res.status(400).json({ erro: 'Turno inválido.' });
  const ehGestor = ['gestor','medico_gestor'].includes(req.user.perfil);
  const medicoEfetivo = ehGestor ? (medicoId || null) : req.user.id;
  let plantao;
  try {
    if (USING_PG) {
      const r = await query(`INSERT INTO plantoes (escala_id,setor_id,medico_id,data,turno,status,instituicao,local,valor,observacoes,inicio,fim) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [escalaId, setorId || null, medicoEfetivo, data, turno, medicoEfetivo ? 'confirmado' : 'aberto',
         instituicao || null, local || instituicao || null, valor != null ? Number(valor) : null,
         observacoes || null, inicio || '08:00', fim || '18:00']);
      plantao = r[0];
      // Cascade automático: lembretes + alerta + financeiro (mesmo plantao_id, FK ON DELETE CASCADE)
      const dataInicio = new Date(data + 'T' + (inicio || '08:00') + ':00');
      await Promise.all([
        exec(`INSERT INTO plantoes_lembretes (plantao_id,tipo,offset_horas,mensagem,executar_em) VALUES ($1,'um_dia_antes',-24,$2,$3) ON CONFLICT DO NOTHING`,
          [plantao.id, `🔔 Lembrete: seu plantão em ${local||instituicao||'hospital'} é amanhã`, new Date(dataInicio.getTime() - 24*3600*1000)]),
        exec(`INSERT INTO plantoes_lembretes (plantao_id,tipo,offset_horas,mensagem,executar_em) VALUES ($1,'algumas_horas_antes',-3,$2,$3) ON CONFLICT DO NOTHING`,
          [plantao.id, `⏰ Plantão em ${local||instituicao||'hospital'} começa em 3h`, new Date(dataInicio.getTime() - 3*3600*1000)]),
        exec(`INSERT INTO plantoes_lembretes (plantao_id,tipo,offset_horas,mensagem,executar_em) VALUES ($1,'em_andamento',0,$2,$3) ON CONFLICT DO NOTHING`,
          [plantao.id, `▶️ Plantão em ${local||instituicao||'hospital'} começando agora`, dataInicio]),
        exec(`INSERT INTO plantoes_alertas (plantao_id,tipo,mensagem,usuario_id) VALUES ($1,'criado',$2,$3)`,
          [plantao.id, `Plantão cadastrado: ${local||instituicao||'hospital'} em ${data}`, req.user.id]),
        exec(`INSERT INTO plantoes_financeiro (plantao_id,categoria,valor,descricao,mes_ref) VALUES ($1,'receita_prevista',$2,$3,$4) ON CONFLICT (plantao_id,categoria) DO UPDATE SET valor=EXCLUDED.valor`,
          [plantao.id, Number(valor)||0, `Receita prevista: ${local||instituicao||'hospital'} ${data}`, data.slice(0,7)])
      ]);
      res.status(201).json({ plantao });
    } else {
      const conflito = memDB.plantoes.some(p => p.medicoId && p.medicoId === medicoEfetivo && p.data === data && p.turno === turno);
      if (conflito) return res.status(409).json({ erro: 'Conflito: este médico já possui plantão nessa data/turno.' });
      const minutos = (inicio && fim) ? Math.max(0, (parseInt(fim.split(':')[0])*60+parseInt(fim.split(':')[1])) - (parseInt(inicio.split(':')[0])*60+parseInt(inicio.split(':')[1]))) : 600;
      plantao = {
        id: memDB.seq.plantao++, escalaId, setorId: setorId || 1, medicoId: medicoEfetivo,
        data, turno, status: medicoEfetivo ? 'confirmado' : 'aberto',
        instituicao: instituicao || null, local: local || instituicao || null,
        valor: valor != null ? Number(valor) : null, pago: false,
        observacoes: observacoes || null,
        inicio: inicio || '08:00', fim: fim || '18:00',
        minutos_estimados: minutos,
        status_lifecycle: 'agendado',
        pagamento_status: 'pendente',
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString()
      };
      memDB.plantoes.push(plantao);
      const dt = new Date(data + 'T' + (inicio || '08:00') + ':00');
      // Cascade automático: lembretes + alerta + financeiro com mesmo plantao_id
      memDB.plantoes_lembretes.push(
        { id: memDB.seq.lembrete++, plantao_id: plantao.id, tipo: 'um_dia_antes',    offset_horas: -24, mensagem: `🔔 Lembrete: seu plantão em ${plantao.local||'hospital'} é amanhã`, executar_em: new Date(dt.getTime() - 24*3600*1000).toISOString(), ativo: true, criado_em: new Date().toISOString() },
        { id: memDB.seq.lembrete++, plantao_id: plantao.id, tipo: 'algumas_horas_antes', offset_horas: -3, mensagem: `⏰ Plantão em ${plantao.local||'hospital'} em 3h`, executar_em: new Date(dt.getTime() - 3*3600*1000).toISOString(), ativo: true, criado_em: new Date().toISOString() },
        { id: memDB.seq.lembrete++, plantao_id: plantao.id, tipo: 'em_andamento',    offset_horas: 0, mensagem: `▶️ Plantão em ${plantao.local||'hospital'} começando agora`, executar_em: dt.toISOString(), ativo: true, criado_em: new Date().toISOString() }
      );
      memDB.plantoes_alertas.push({
        id: memDB.seq.alerta++, plantao_id: plantao.id, tipo: 'criado',
        mensagem: `Plantão cadastrado: ${plantao.local||'hospital'} em ${data}`,
        usuario_id: req.user.id, criado_em: new Date().toISOString()
      });
      memDB.plantoes_financeiro.push({
        id: memDB.seq.lanc++, plantao_id: plantao.id, categoria: 'receita_prevista',
        valor: Number(plantao.valor)||0,
        descricao: `Receita prevista: ${plantao.local||'hospital'} ${data}`,
        mes_ref: data.slice(0,7), criado_em: new Date().toISOString()
      });
      memDB.seq.lembrete += 2;
      persistJSON(memDB);
      const { senha, criadoEm, ...publico } = plantao;
      res.status(201).json({ plantao: publico });
    }
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Conflito: este médico já possui plantão nessa data/turno.' });
    console.error('[POST /api/plantoes]', e);
    res.status(500).json({ erro: e.message });
  }
});
app.delete('/api/plantoes/:id', authOnly, async (req, res) => {
  const id = Number(req.params.id); let p = null;
  if (USING_PG) {
    const r = await query('SELECT * FROM plantoes WHERE id=$1', [id]); p = r[0];
    if (!p) return res.status(404).json({ erro: 'Plantão não encontrado.' });
    const ehGestor = ['gestor','medico_gestor'].includes(req.user.perfil);
    if (!ehGestor && p.medico_id !== req.user.id) return res.status(403).json({ erro: 'Sem permissão.' });
    // CASCADE: plantoes_lembretes, plantoes_alertas, plantoes_financeiro → ON DELETE CASCADE
    await exec('DELETE FROM plantoes WHERE id=$1', [id]);
    res.json({ ok: true, deletado: id, cascade: 'lembretes+alertas+financeiro apagados automaticamente' });
  } else {
    p = memDB.plantoes.find(x => x.id === id);
    if (!p) return res.status(404).json({ erro: 'Plantão não encontrado.' });
    const ehGestor = ['gestor','medico_gestor'].includes(req.user.perfil);
    if (!ehGestor && p.medicoId !== req.user.id) return res.status(403).json({ erro: 'Sem permissão.' });
    const lemAntes = (memDB.plantoes_lembretes||[]).filter(l=>l.plantao_id===id).length;
    const alAntes  = (memDB.plantoes_alertas||[]).filter(a=>a.plantao_id===id).length;
    const fiAntes  = (memDB.plantoes_financeiro||[]).filter(f=>f.plantao_id===id).length;
    memDB.plantoes = memDB.plantoes.filter(x => x.id !== id);
    memDB.plantoes_lembretes  = (memDB.plantoes_lembretes||[]).filter(l => l.plantao_id !== id);
    memDB.plantoes_alertas    = (memDB.plantoes_alertas||[]).filter(a => a.plantao_id !== id);
    memDB.plantoes_financeiro = (memDB.plantoes_financeiro||[]).filter(f => f.plantao_id !== id);
    persistJSON(memDB);
    res.json({ ok: true, deletado: id, cascade: { lembretes: lemAntes, alertas: alAntes, financeiro: fiAntes } });
  }
});
app.put('/api/plantoes/:id', authOnly, async (req, res) => {
  const id = Number(req.params.id);
  let p;
  if (USING_PG) { const r = await query('SELECT * FROM plantoes WHERE id=$1', [id]); p = r[0]; }
  else { p = memDB.plantoes.find(x => x.id === id); }
  if (!p) return res.status(404).json({ erro: 'Plantão não encontrado.' });
  const ehGestor = ['gestor','medico_gestor'].includes(req.user.perfil);
  const ehDono = p.medicoId === req.user.id && req.user.perfil === 'medico';
  if (!ehGestor && !ehDono) return res.status(403).json({ erro: 'Sem permissão para editar este plantão.' });
  const { medicoId, data, turno, local, valor } = req.body || {};
  if (data) p.data = data;
  if (turno) { if (!TURNOS[turno]) return res.status(400).json({ erro: 'Turno inválido.' }); p.turno = turno; }
  if (local !== undefined) p.local = local ? String(local).slice(0, 200) : null;
  if (valor !== undefined) { p.valor = (valor === '' || valor === null) ? null : Number(valor); if (p.valor !== null && isNaN(p.valor)) return res.status(400).json({ erro: 'Valor inválido.' }); }
  if (ehGestor && medicoId !== undefined) { p.medicoId = medicoId || null; p.status = medicoId ? 'confirmado' : 'aberto'; }
  if (USING_PG) await exec(`UPDATE plantoes SET data=$1, turno=$2, local=$3, valor=$4, medico_id=$5, status=$6 WHERE id=$7`,
    [p.data, p.turno, p.local, p.valor, p.medicoId, p.status, p.id]);
  else persistJSON(memDB);
  res.json({ plantao: p });
});
app.post('/api/plantoes/:id/pagar', authOnly, async (req, res) => {
  const id = Number(req.params.id);
  let p;
  if (USING_PG) { const r = await query('SELECT * FROM plantoes WHERE id=$1', [id]); p = r[0]; }
  else { p = memDB.plantoes.find(x => x.id === id); }
  if (!p) return res.status(404).json({ erro: 'Plantão não encontrado.' });
  const ehGestor = ['gestor','medico_gestor'].includes(req.user.perfil);
  if (!ehGestor && p.medicoId !== req.user.id) return res.status(403).json({ erro: 'Sem permissão para dar baixa neste plantão.' });
  if (USING_PG) { await exec('UPDATE plantoes SET pago=TRUE WHERE id=$1', [p.id]); p.pago = true; }
  else { p.pago = true; persistJSON(memDB); }
  res.json({ plantao: p });
});

/* ---------- OFERTAS ---------- */
app.get('/api/ofertas', authOnly, async (req, res) => res.json({ ofertas: await getOfertas() }));
app.post('/api/ofertas', authOnly, perfis('gestor','medico_gestor'), async (req, res) => {
  const { plantaoId } = req.body || {};
  let pl;
  if (USING_PG) { const r = await query('SELECT * FROM plantoes WHERE id=$1', [Number(plantaoId)]); pl = r[0]; }
  else { pl = memDB.plantoes.find(p => p.id === Number(plantaoId)); }
  if (!pl) return res.status(404).json({ erro: 'Plantão não encontrado.' });
  if (pl.medicoId || (USING_PG ? pl.medico_id : pl.medicoId)) return res.status(409).json({ erro: 'Plantão já tem médico.' });
  let oferta;
  if (USING_PG) {
    const r = await query(`INSERT INTO ofertas (plantao_id,criado_por,status) VALUES ($1,$2,'aberta') RETURNING id,plantao_id,criado_por,status,aceito_por,criado_em`,
      [pl.id, req.user.id]);
    oferta = r[0];
  } else {
    oferta = { id: memDB.seq.oferta++, plantaoId: pl.id, criadoPor: req.user.id, status: 'aberta', aceitoPor: null, criadoEm: toISO(new Date()) };
    memDB.ofertas.push(oferta); persistJSON(memDB);
  }
  res.status(201).json({ oferta });
});
app.post('/api/ofertas/:id/aceitar', authOnly, perfis('medico'), async (req, res) => {
  const id = Number(req.params.id);
  let o, pl;
  if (USING_PG) {
    o = (await query('SELECT * FROM ofertas WHERE id=$1', [id]))[0];
    if (!o) return res.status(404).json({ erro: 'Oferta não encontrada.' });
    if (o.status !== 'aberta') return res.status(409).json({ erro: 'Oferta já não está aberta.' });
    pl = (await query('SELECT * FROM plantoes WHERE id=$1', [o.plantao_id]))[0];
    const client = await _pgPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE plantoes SET medico_id=$1, status=\'confirmado\' WHERE id=$2', [req.user.id, pl.id]);
      await client.query('UPDATE ofertas SET status=\'aceita\', aceito_por=$1 WHERE id=$2', [req.user.id, o.id]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(()=>{});
      client.release();
      if (e.code === '23505') return res.status(409).json({ erro: 'Conflito de agenda.' });
      throw e;
    }
    client.release();
    o.status = 'aceita'; o.aceito_por = req.user.id;
    res.json({ oferta: o });
  } else {
    o = memDB.ofertas.find(x => x.id === id);
    if (!o) return res.status(404).json({ erro: 'Oferta não encontrada.' });
    if (o.status !== 'aberta') return res.status(409).json({ erro: 'Oferta já não está aberta.' });
    pl = memDB.plantoes.find(p => p.id === o.plantaoId);
    const conflito = memDB.plantoes.some(p => p.medicoId === req.user.id && p.data === pl.data && p.turno === pl.turno && p.id !== pl.id);
    if (conflito) return res.status(409).json({ erro: 'Conflito de agenda.' });
    o.status = 'aceita'; o.aceitoPor = req.user.id;
    pl.medicoId = req.user.id; pl.status = 'confirmado';
    persistJSON(memDB);
    res.json({ oferta: o });
  }
});

/* ---------- CHECK-IN / HORAS ---------- */
app.get('/api/checkins', authOnly, async (req, res) => {
  if (USING_PG) {
    const ehGestor = ['gestor','medico_gestor'].includes(req.user.perfil);
    const sql = `SELECT c.id,c.plantao_id,c.medico_id,c.data_hora,p.data,p.turno,p.local
                 FROM checkins c JOIN plantoes p ON p.id=c.plantao_id
                 WHERE $1::int IS NULL OR c.medico_id=$1::int ORDER BY c.data_hora DESC`;
    const r = await query(sql, ehGestor ? [null] : [req.user.id]);
    return res.json({ checkins: r.map(c => ({ ...c, plantao: { id:c.plantao_id, data:c.data, turno:c.turno, local:c.local } })) });
  }
  const lista = memDB.checkins
    .filter(c => ['gestor','medico_gestor'].includes(req.user.perfil) || c.medicoId === req.user.id)
    .map(c => ({ ...c, plantao: memDB.plantoes.find(p => p.id === c.plantaoId) }));
  res.json({ checkins: lista });
});
app.post('/api/checkins', authOnly, perfis('medico'), async (req, res) => {
  const { plantaoId } = req.body || {};
  if (USING_PG) {
    const pl = (await query('SELECT * FROM plantoes WHERE id=$1', [Number(plantaoId)]))[0];
    if (!pl) return res.status(404).json({ erro: 'Plantão não encontrado.' });
    if (pl.medico_id !== req.user.id) return res.status(403).json({ erro: 'Você só pode fazer check-in em plantões seus.' });
    const dup = (await query('SELECT id FROM checkins WHERE plantao_id=$1 AND medico_id=$2', [pl.id, req.user.id]))[0];
    if (dup) return res.status(409).json({ erro: 'Check-in já realizado.' });
    const r = await query('INSERT INTO checkins (plantao_id,medico_id,data_hora) VALUES ($1,$2,NOW()) RETURNING id,plantao_id,medico_id,data_hora', [pl.id, req.user.id]);
    return res.status(201).json({ checkin: r[0] });
  }
  const pl = memDB.plantoes.find(p => p.id === Number(plantaoId));
  if (!pl) return res.status(404).json({ erro: 'Plantão não encontrado.' });
  if (pl.medicoId !== req.user.id) return res.status(403).json({ erro: 'Você só pode fazer check-in em plantões seus.' });
  if (memDB.checkins.some(c => c.plantaoId === pl.id && c.medicoId === req.user.id)) return res.status(409).json({ erro: 'Check-in já realizado.' });
  const ck = { id: memDB.seq.checkin++, plantaoId: pl.id, medicoId: req.user.id, dataHora: new Date().toISOString() };
  memDB.checkins.push(ck); persistJSON(memDB);
  res.status(201).json({ checkin: ck });
});
app.get('/api/horas', authOnly, async (req, res) => {
  const ehGestor = ['gestor','medico_gestor'].includes(req.user.perfil);
  const plantoes = (await getPlantoes()).filter(p => ehGestor || p.medicoId === req.user.id);
  const checkins = await getCheckins();
  const usuarios = await getUsuarios();
  const setores = await getSetores();
  const registros = plantoes.map(p => {
    const ck = checkins.find(c => c.plantaoId === p.id && c.medicoId === p.medicoId);
    const medico = usuarios.find(u => u.id === p.medicoId);
    return {
      plantaoId: p.id, data: typeof p.data === 'string' ? p.data : toISO(p.data),
      turno: p.turno, turnoLabel: TURNOS[p.turno]?.label, medicoId: p.medicoId,
      medicoNome: medico ? medico.nome : '—',
      setor: (setores.find(s => s.id === (p.setorId || p.setor_id)) || {}).nome || '—',
      fezCheckin: !!ck, horas: ck ? minutosPlantao(p) : 0
    };
  });
  res.json({ registros, porMedico: [], meusTotais: { minutos:0, plantoes:0, detalhes:[] } });
});

/* ---------- FINANCEIRO ---------- */
app.get('/api/financeiro/config', authOnly, async (req, res) => res.json({ financeiro: await getConfigFinanceiro() }));
app.put('/api/financeiro/config', authOnly, perfis('gestor','medico_gestor'), async (req, res) => {
  const body = req.body || {};
  if (USING_PG) {
    await exec(`UPDATE financeiro_config SET
        valor_tipo=COALESCE($1,valor_tipo), valor_plantao=COALESCE($2,valor_plantao),
        valor_hora=COALESCE($3,valor_hora), adicional_noturno_pct=COALESCE($4,adicional_noturno_pct),
        adicional_feriado_pct=COALESCE($5,adicional_feriado_pct), iss_pct=COALESCE($6,iss_pct),
        ir_pct=COALESCE($7,ir_pct),
        usar_adicional_noturno=COALESCE($8,usar_adicional_noturno),
        usar_adicional_feriado=COALESCE($9,usar_adicional_feriado),
        usar_iss=COALESCE($10,usar_iss), usar_ir=COALESCE($11,usar_ir) WHERE singleton=TRUE`,
      [body.valorTipo ?? null, body.valorPlantao != null ? Number(body.valorPlantao) : null, body.valorHora != null ? Number(body.valorHora) : null,
       body.adicionalNoturnoPct != null ? Number(body.adicionalNoturnoPct) : null, body.adicionalFeriadoPct != null ? Number(body.adicionalFeriadoPct) : null,
       body.issPct != null ? Number(body.issPct) : null, body.irPct != null ? Number(body.irPct) : null,
       body.usarAdicionalNoturno ?? null, body.usarAdicionalFeriado ?? null, body.usarIss ?? null, body.usarIr ?? null]);
  } else {
    const cfg = await getConfigFinanceiro();
    memDB.financeiro = Object.assign(cfg, body); persistJSON(memDB);
  }
  res.json({ financeiro: await getConfigFinanceiro() });
});
app.get('/api/financeiro/honorarios', authOnly, async (req, res) => res.json(await computarHonorarios(req.user)));

/* ---------- MENSAGENS ---------- */
app.get('/api/mensagens', authOnly, async (req, res) => {
  const setorId = Number(req.query.setorId) || null;
  res.json({ mensagens: await getMensagens(setorId) });
});
app.post('/api/mensagens', authOnly, async (req, res) => {
  const { setorId, texto } = req.body || {};
  if (!setorId || !texto || !String(texto).trim()) return res.status(400).json({ erro: 'Setor e texto são obrigatórios.' });
  const msgTexto = String(texto).slice(0, 500);
  let msg;
  if (USING_PG) {
    const r = await query(`INSERT INTO mensagens (setor_id,remetente_id,texto) VALUES ($1,$2,$3) RETURNING id,setor_id,remetente_id,texto,criado_em`,
      [setorId, req.user.id, msgTexto]);
    msg = r[0];
  } else {
    msg = { id: memDB.seq.mensagem++, setorId, remetenteId: req.user.id, texto: msgTexto, criadoEm: new Date().toISOString() };
    memDB.mensagens.push(msg); persistJSON(memDB);
  }
  res.status(201).json({ mensagem: msg });
});
app.get('/api/setores', authOnly, async (req, res) => res.json({ setores: await getSetores() }));

/* ===================== LEMBRETES (E-mail + Push) ===================== */
app.get('/api/push/vapid-public', (req, res) => {
  if (!process.env.VAPID_PUBLIC) return res.status(503).json({ erro: 'Push não configurado (VAPID ausente).' });
  res.json({ publicKey: process.env.VAPID_PUBLIC });
});
app.post('/api/push/subscribe', authOnly, async (req, res) => {
  const { endpoint, keys: k } = req.body || {};
  if (!endpoint || !k?.p256dh || !k?.auth) return res.status(400).json({ erro: 'Endpoint e chaves são obrigatórios.' });
  const ua = req.headers['user-agent']?.slice(0, 200) || null;
  if (USING_PG) {
    await exec(`INSERT INTO push_subscriptions (usuario_id,endpoint,p256dh,auth,user_agent,ativo)
       VALUES ($1,$2,$3,$4,$5,TRUE)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, ativo=TRUE, atualizado_em=NOW()`,
      [req.user.id, endpoint, k.p256dh, k.auth, ua]);
    return res.status(201).json({ ok: true });
  }
  // JSON mode
  const idx = memDB.pushSubs.findIndex(s => s.endpoint === endpoint);
  if (idx >= 0) memDB.pushSubs[idx] = { ...memDB.pushSubs[idx], p256dh: k.p256dh, auth: k.auth, ativo: true };
  else memDB.pushSubs.push({ id: memDB.seq.push++ || (memDB.seq.push = 10), usuarioId: req.user.id, endpoint, p256dh: k.p256dh, auth: k.auth, userAgent: ua, ativo: true, criadoEm: new Date().toISOString() });
  persistJSON(memDB);
  res.status(201).json({ ok: true });
});
app.delete('/api/push/unsubscribe', authOnly, async (req, res) => {
  const { endpoint } = req.body || {};
  if (USING_PG) await exec(`UPDATE push_subscriptions SET ativo=FALSE WHERE usuario_id=$1 AND endpoint=$2`, [req.user.id, endpoint]);
  else memDB.pushSubs = memDB.pushSubs.filter(s => !(s.endpoint === endpoint && s.usuarioId === req.user.id));
  if (!USING_PG) persistJSON(memDB);
  res.json({ ok: true });
});

/* ---------- Cron endpoint externo (Render Cron / UptimeRobot / GH Actions) ---------- */
app.post('/api/cron/reminders', async (req, res) => {
  const secret = req.get('x-cron-secret') || req.query.secret;
  const expected = process.env.CRON_SECRET;
  if (expected && secret !== expected) return res.status(401).json({ erro: 'CRON_SECRET inválido.' });
  const force = req.query.force === '1' || req.body?.force === true;
  try {
    const out = await reminders.tick({ force });
    res.json(out);
  } catch (e) {
    console.error('[cron tick]', e);
    res.status(500).json({ erro: e.message });
  }
});
app.get('/api/cron/status', authOnly, perfis('gestor'), async (req, res) => {
  res.json({
    canais: {
      email: process.env.RESEND_API_KEY ? 'resend' : (process.env.SMTP_HOST ? 'smtp' : 'stub'),
      push: (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) ? 'web-push' : 'stub'
    },
    intervalo: 'a cada hora + diário 08:00',
    desabilitarInterno: !!process.env.DISABLE_INTERNAL_CRON,
    endpointsExternos: { POST: '/api/cron/reminders?force=1 (header x-cron-secret)' },
    lembretesOffsets: reminders.REMINDER_OFFSETS
  });
});

/* ---------- Cron interno (a cada hora + diário 08:00) ---------- */
function startInternalCron() {
  if (process.env.DISABLE_INTERNAL_CRON) { console.log('[cron] interno DESATIVADO via env'); return; }
  // a cada hora (00 minuto)
  cron.schedule('0 * * * *', async () => {
    try { await reminders.tick({ force: false }); } catch (e) { console.error('[cron hourly]', e.message); }
  });
  // diário às 08:00 local (servidor)
  cron.schedule('0 8 * * *', async () => {
    try { await reminders.tick({ force: false }); } catch (e) { console.error('[cron daily]', e.message); }
  });
  console.log('[cron] interno ATIVO (a cada hora + diário 08:00)');
}

/* ---------- SPA fallback ---------- */
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ---------- Boot ---------- */
(async () => {
  // Garante schema completo (incluindo 002) antes de aceitar requests
  if (USING_PG) {
    try { await runAllMigrations(); }
    catch (e) { console.error('[boot] migration falhou:', e.message); process.exit(1); }
  }
  app.listen(PORT, () => {
    console.log(`🏥 PlantãoPro rodando em http://localhost:${PORT}`);
    console.log(`   Modo: ${USING_PG ? 'PostgreSQL' : 'JSON local (demo)'}`);
    console.log(`   Lembrete e-mail: ${process.env.RESEND_API_KEY ? 'Resend' : (process.env.SMTP_HOST ? 'SMTP ' + process.env.SMTP_HOST : 'stub')}`);
    console.log(`   Lembrete push:  ${(process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) ? 'web-push' : 'stub'}`);
    startInternalCron();
  });
})();

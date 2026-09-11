/* ============================================================
   PlantãoPro — Adaptador de banco dual (Postgres | JSON local)
   ---------------------------------------------------------------
   • Com DATABASE_URL → Postgres (pg.Pool + SSL no Render)
   • Sem DATABASE_URL → data/db.json (modo demo, mesmo contrato JSON)
   ============================================================ */
const fs   = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const USING_PG = !!process.env.DATABASE_URL;
let _pgPool = null;
if (USING_PG) {
  const { Pool } = require('pg');
  _pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000
  });
  _pgPool.on('error', (e) => console.error('[pg pool error]', e.message));
}

const pad   = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const addDays = (iso, days) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + days); return toISO(d); };

const DataDir = path.join(__dirname, 'data');
const DbFile  = path.join(DataDir, 'db.json');

const MIGRATIONS = ['001_init.sql', '002_reminders.sql', '003_central.sql', '005_notifications.sql'];

function ensureJSON() {
  if (!fs.existsSync(DataDir)) fs.mkdirSync(DataDir, { recursive: true });
  if (fs.existsSync(DbFile)) {
    try {
      const db = JSON.parse(fs.readFileSync(DbFile, 'utf-8'));
      // hidratação idempotente
      if (!db.plantoes_lembretes)  db.plantoes_lembretes = [];
      if (!db.plantoes_alertas)    db.plantoes_alertas = [];
      if (!db.plantoes_financeiro) db.plantoes_financeiro = [];
      if (!db.whatsapp_optin)      db.whatsapp_optin = [];
      if (!db.notifications_log)   db.notifications_log = [];
      // hidrata campos novos em plantões antigos já escritos
      db.plantoes = (db.plantoes || []).map(p => ({
        instituicao: p.instituicao || p.local || '',
        observacoes: p.observacoes || '',
        status_lifecycle: p.status_lifecycle || (p.status === 'confirmado' ? 'agendado' : 'agendado'),
        pagamento_status: p.pagamento_status || (p.pago ? 'pago' : 'pendente'),
        atualizado_em: p.atualizado_em || (p.criado_em || new Date().toISOString()),
        minutos_estimados: p.minutos_estimados || (p.inicio && p.fim ? Math.max(0, toMinutes(p.fim) - toMinutes(p.inicio)) : null),
        ...p,
        // normaliza duplicados
        local: p.local || p.instituicao || null
      }));
      if (!db.seq) db.seq = {};
      if (!db.seq.lembrete) db.seq.lembrete = Math.max(1, (db.plantoes_lembretes || []).length + 1);
      if (!db.seq.alerta)   db.seq.alerta   = Math.max(1, (db.plantoes_alertas || []).length + 1);
      if (!db.seq.lanc)     db.seq.lanc     = Math.max(1, (db.plantoes_financeiro || []).length + 1);
      return db;
    } catch {}
  }
  const db = seedJSON();
  fs.writeFileSync(DbFile, JSON.stringify(db, null, 2));
  return db;
}
function persistJSON(db) {
  fs.mkdirSync(DataDir, { recursive: true });
  fs.writeFileSync(DbFile, JSON.stringify(db, null, 2));
}
function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function seedJSON() {
  const hoje = toISO(new Date());
  const hash = (s) => bcrypt.hashSync(s, 8);
  const makePlantao = (id, medicoId, data, turno, opts = {}) => ({
    id, escalaId: 1, setorId: 1, medicoId, data, turno,
    status: 'confirmado',
    instituicao: opts.instituicao || 'Hospital Central — UTI',
    local:       opts.local || opts.instituicao || 'Hospital Central — UTI',
    valor: opts.valor != null ? opts.valor : 800,
    pago: !!opts.pago,
    observacoes: opts.observacoes || '',
    inicio: opts.inicio || '07:00',
    fim:    opts.fim    || '19:00',
    minutos_estimados: opts.minutos || (12 * 60),
    status_lifecycle: 'agendado',
    pagamento_status: opts.pago ? 'pago' : 'pendente',
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  });

  const plantoes = [
    makePlantao(1, 3, hoje,             'manha',     { instituicao: 'Hospital Central — Ala B', valor: 800, inicio: '06:00', fim: '12:00', minutos: 6*60 }),
    makePlantao(2, 3, addDays(hoje,1),   'manha',     { instituicao: 'Hospital Central — Ala B', valor: 500, inicio: '06:00', fim: '12:00', minutos: 6*60 }),
    makePlantao(3, 4, hoje,             'noite',     { instituicao: 'Hospital Municipal — Ala C', valor: 500, inicio: '18:00', fim: '06:00', minutos: 12*60 }),
    makePlantao(4, 5, addDays(hoje,1),   'madrugada', { instituicao: 'Hospital Municipal — Ala D', valor: 500, inicio: '00:00', fim: '06:00', minutos: 6*60 }),
    makePlantao(5, null, addDays(hoje,2),'noite',     { instituicao: '', local: null, valor: null, inicio: '18:00', fim: '23:00', minutos: 5*60 })
  ];

  return {
    seq: { usuario: 6, escala: 2, plantao: plantoes.length + 5, oferta: 2, checkin: 2, mensagem: 1, push: 1,
          lembrete: 50, alerta: 50, lanc: 50 },
    usuarios: [
      { id: 1, nome: 'Ana Souza',          email: 'gestor@plantaopro.com',    senha: hash('demo123'), perfil: 'gestor',         setorId: 1, ativo: true },
      { id: 2, nome: 'Dr. Carlos Lima',    email: 'medgestor@plantaopro.com', senha: hash('demo123'), perfil: 'medico_gestor',  setorId: 1, ativo: true },
      { id: 3, nome: 'Dra. Juliana Rocha', email: 'medico@plantaopro.com',    senha: hash('demo123'), perfil: 'medico',         setorId: 1, ativo: true },
      { id: 4, nome: 'Dr. Pedro Alves',    email: 'medico2@plantaopro.com',   senha: hash('demo123'), perfil: 'medico',         setorId: 2, ativo: true },
      { id: 5, nome: 'Dra. Marina Dias',   email: 'medico3@plantaopro.com',   senha: hash('demo123'), perfil: 'medico',         setorId: 3, ativo: true }
    ],
    setores: [{ id:1, nome:'UTI' }, { id:2, nome:'Pronto-Socorro' }, { id:3, nome:'Enfermaria' }],
    escalas: [{ id:1, titulo:'Escala UTI — Setembro', setorId:1, mesRef:`${new Date().getFullYear()}-${pad(new Date().getMonth()+1)}`, criadoPor:1, criadoEm:new Date().toISOString() }],
    plantoes,
    ofertas:   [{ id:1, plantaoId:5, criadoPor:1, status:'aberta', aceitoPor:null, criadoEm:toISO(new Date()) }],
    checkins:  [],
    mensagens: [],
    plantoes_lembretes:  [],
    plantoes_alertas:    [],
    plantoes_financeiro: [],
    financeiro: { valorTipo:'valor_plantao', valorPlantao:500, valorHora:120,
      adicionalNoturnoPct:30, adicionalFeriadoPct:100, issPct:5, irPct:10,
      usarAdicionalNoturno:true, usarAdicionalFeriado:true, usarIss:false, usarIr:false },
    reminders: [],
    pushSubs:  []
  };
}

async function migrateOne(name) {
  if (!_pgPool) return;
  const fp = path.join(__dirname, 'migrations', name);
  if (!fs.existsSync(fp)) return;
  const sql = fs.readFileSync(fp, 'utf-8');
  const c = await _pgPool.connect();
  try { await c.query('BEGIN'); await c.query(sql); await c.query('COMMIT'); console.log('[migrate]', name, '✅'); }
  catch (e) { await c.query('ROLLBACK'); console.error('[migrate]', name, '❌', e.message); throw e; }
  finally { c.release(); }
}
async function runAllMigrations() {
  if (!_pgPool) return;
  for (const m of MIGRATIONS) await migrateOne(m);
}

async function seed() {
  if (!_pgPool) {
    if (!fs.existsSync(DbFile)) { ensureJSON(); console.log('[seed] JSON criado em', DbFile); }
    else console.log('[seed] JSON já existe em', DbFile);
    return;
  }
  const c = await _pgPool.query('SELECT COUNT(*)::int AS n FROM usuarios');
  if (c.rows[0].n > 0) { console.log('[seed] usuarios já populados (idempotente).'); return; }

  const hash = (s) => bcrypt.hashSync(s, 8);
  const hoje = toISO(new Date());
  await _pgPool.query('BEGIN');
  try {
    await _pgPool.query(`INSERT INTO setores (nome) VALUES ('UTI'), ('Pronto-Socorro'), ('Enfermaria')`);
    await _pgPool.query(
      `INSERT INTO usuarios (nome,email,senha,perfil,setor_id,ativo) VALUES
        ('Ana Souza','gestor@plantaopro.com',$1,'gestor',1),
        ('Dr. Carlos Lima','medgestor@plantaopro.com',$1,'medico_gestor',1),
        ('Dra. Juliana Rocha','medico@plantaopro.com',$1,'medico',1),
        ('Dr. Pedro Alves','medico2@plantaopro.com',$1,'medico',2),
        ('Dra. Marina Dias','medico3@plantaopro.com',$1,'medico',3)`,
      [hash('demo123')]
    );
    await _pgPool.query(
      `INSERT INTO escalas (titulo,setor_id,mes_ref,criado_por) VALUES ('Escala UTI — Setembro',1,$1,1)`,
      [`${new Date().getFullYear()}-${pad(new Date().getMonth()+1)}`]
    );
    await _pgPool.query(
      `INSERT INTO plantoes (escala_id,setor_id,medico_id,data,turno,status,instituicao,local,valor,inicio,fim,minutos_estimados) VALUES
        (1,1,3,$1,'manha','confirmado','Hospital Central — Ala B','Hospital Central — Ala B',800,'06:00','12:00',360),
        (1,1,3,$2,'manha','confirmado','Hospital Central — Ala B','Hospital Central — Ala B',500,'06:00','12:00',360),
        (1,1,4,$1,'noite','confirmado','Hospital Municipal — Ala C','Hospital Municipal — Ala C',500,'18:00','06:00',720),
        (1,1,5,$2,'madrugada','confirmado','Hospital Municipal — Ala D','Hospital Municipal — Ala D',500,'00:00','06:00',360),
        (1,2,NULL,$3,'noite','aberto',NULL,NULL,NULL,'18:00','23:00',300)`,
      [hoje, addDays(hoje,1), addDays(hoje,2)]
    );
    await _pgPool.query(`INSERT INTO ofertas (plantao_id,criado_por,status) VALUES (5,1,'aberta')`);
    await _pgPool.query(`INSERT INTO financeiro_config (singleton) VALUES (TRUE)`);
    await _pgPool.query('COMMIT');
    console.log('[seed] ✅ 5 usuários, 1 escala, 5 plantões (com colunas novas)');
  } catch (e) {
    await _pgPool.query('ROLLBACK'); throw e;
  }
}

if (require.main === module) {
  const cmd = process.argv[2] || 'migrate';
  (async () => {
    try {
      if (cmd === 'migrate') { await runAllMigrations(); }
      else if (cmd === 'seed') { await seed(); }
      else { console.log('Uso: node db-pg.js [migrate|seed]'); process.exit(1); }
      if (_pgPool) await _pgPool.end();
      process.exit(0);
    } catch (e) { console.error(e.message); process.exit(1); }
  })();
}

module.exports = {
  ensureJSON, persistJSON, seedJSON, USING_PG, _pgPool,
  pad, toISO, addDays, runAllMigrations, MIGRATIONS
};

/* ============================================================
   PlantãoPro — notificações multi-canal: Web Push + WhatsApp
   ────────────────────────────────────────────────────────────
   Provider WhatsApp: Meta Cloud API
     https://developers.facebook.com/docs/whatsapp/cloud-api
   Templates pré-aprovados (criar na conta Meta antes de produção):
     • plantaopro_lembrete_24h   "Olá {{1}} — seu plantão em {{2}} será em {{3}}."
     • plantaopro_lembrete_3h    "Olá {{1}} — você tem plantão em {{2}} em 3 horas."
     • plantaopro_lembrete_inicio "Plantão começando agora em {{1}} ({{2}}–{{3}})."
     • plantaopro_alerta_criado  "Plantão cadastrado em {{1}} para {{2}}."
   Variáveis de ambiente (produção):
     WHATSAPP_TOKEN          Bearer do Meta Cloud API
     WHATSAPP_PHONE_ID       ID do número que envia
     WHATSAPP_TPL_24H        nome do template 24h (default plantaopro_lembrete_24h)
     WHATSAPP_TPL_3H         nome do template 3h
     WHATSAPP_TPL_INICIO     nome do template início
   Sem credenciais → STUB: grava em /tmp/plantaopro-whatsapp-dev.log.
   ============================================================ */
const fs = require('fs');
const path = require('path');

const META_VERSION = 'v20.0';
const DEV_LOG = '/tmp/plantaopro-whatsapp-dev.log';

const { USING_PG, _pgPool, ensureJSON, persistJSON } = require('./db-pg');

let _configured = false;

function isConfigured() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

function init() {
  if (!isConfigured()) {
    console.warn('[whatsapp] sem WHATSAPP_TOKEN/WHATSAPP_PHONE_ID → modo STUB (grava em ' + DEV_LOG + ')');
    _configured = false;
  } else {
    _configured = true;
    console.log('[whatsapp] Meta Cloud API ATIVO (PHONE_ID=' + process.env.WHATSAPP_PHONE_ID + ')');
  }
}

function templateForOffset(offsetHoras) {
  if (offsetHoras <= -24) return process.env.WHATSAPP_TPL_24H    || 'plantaopro_lembrete_24h';
  if (offsetHoras <= -3)  return process.env.WHATSAPP_TPL_3H     || 'plantaopro_lembrete_3h';
  return process.env.WHATSAPP_TPL_INICIO || 'plantaopro_lembrete_inicio';
}

function stubWrite(to, templateName, params) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    canal: 'whatsapp',
    to, template: templateName, params
  });
  try { fs.appendFileSync(DEV_LOG, line + '\n'); } catch {}
  console.log('[whatsapp:stub] -> ' + to + ' [' + templateName + '] ' + JSON.stringify(params));
  return { status: 'enviado', provider_id: 'stub-' + Date.now(), stub: true };
}

async function realSend(to, templateName, lang, params) {
  const url = `https://graph.facebook.com/${META_VERSION}/${process.env.WHATSAPP_PHONE_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang || 'pt_BR' },
      components: [{
        type: 'body',
        parameters: (params || []).map(p => ({ type: 'text', text: String(p) }))
      }]
    }
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.WHATSAPP_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) return { status: 'falhou', erro: text };
  const j = JSON.parse(text);
  const wamid = j.messages && j.messages[0] && j.messages[0].id;
  return { status: 'enviado', provider_id: wamid, stub: false };
}

async function sendWhatsApp(to, templateName, lang, params) {
  if (!_configured) return stubWrite(to, templateName, params);
  try {
    return await realSend(to, templateName, lang, params);
  } catch (e) {
    return { status: 'falhou', erro: e.message };
  }
}

/* ============================================================
   Persistência (Postgres + JSON) — schema, opt-in, log
   ============================================================ */
let _memDB = null;
function db() {
  if (USING_PG) return null;
  if (!_memDB) _memDB = ensureJSON();
  return _memDB;
}

async function ensureSchema() {
  if (!USING_PG) {
    const d = db();
    if (!d.whatsapp_optin)     d.whatsapp_optin     = [];
    if (!d.notifications_log)  d.notifications_log  = [];
    if (!d.seq) d.seq = {};
    if (d.seq.notif_log == null) d.seq.notif_log = (d.notifications_log.length + 1);
    persistJSON(d);
    return;
  }
  await _pgPool.query(fs.readFileSync(path.join(__dirname, 'migrations', '005_notifications.sql'), 'utf8'));
}

function normalizeTel(t) {
  const s = String(t || '').replace(/\s+/g, '');
  if (!s) return null;
  if (s.startsWith('+')) return /^\+[1-9][0-9]{6,14}$/.test(s) ? s : null;
  // Brasil sem DDI → assume +55
  const cleaned = s.replace(/\D/g, '');
  if (cleaned.length >= 10 && cleaned.length <= 13) return '+55' + cleaned;
  return null;
}

async function setPreferences(usuarioId, { telefone, aceitar_lembretes = true, aceitar_alertas = true, template_lang = 'pt_BR' }) {
  const e164 = normalizeTel(telefone);
  if (!e164) throw new Error('Telefone inválido. Use DDI, ex.: +5511999998888.');
  if (USING_PG) {
    await _pgPool.query(`
      INSERT INTO whatsapp_optin (usuario_id, telefone_e164, aceitar_lembretes, aceitar_alertas, template_lang, atualizado_em)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (usuario_id) DO UPDATE SET
        telefone_e164 = EXCLUDED.telefone_e164,
        aceitar_lembretes = EXCLUDED.aceitar_lembretes,
        aceitar_alertas = EXCLUDED.aceitar_alertas,
        template_lang = EXCLUDED.template_lang,
        atualizado_em = NOW()
    `, [usuarioId, e164, aceitar_lembretes, aceitar_alertas, template_lang]);
  } else {
    const d = db();
    const idx = d.whatsapp_optin.findIndex(o => o.usuario_id === usuarioId);
    if (idx >= 0) {
      d.whatsapp_optin[idx] = { ...d.whatsapp_optin[idx], telefone_e164: e164, aceitar_lembretes, aceitar_alertas, template_lang, atualizado_em: new Date().toISOString() };
    } else {
      d.whatsapp_optin.push({ id: d.whatsapp_optin.length + 1, usuario_id: usuarioId, telefone_e164: e164, aceitar_lembretes, aceitar_alertas, template_lang, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() });
    }
    persistJSON(d);
  }
  return e164;
}

async function getPreferences(usuarioId) {
  if (USING_PG) {
    const r = await _pgPool.query('SELECT telefone_e164, aceitar_lembretes, aceitar_alertas, template_lang FROM whatsapp_optin WHERE usuario_id=$1', [usuarioId]);
    return r.rows[0] || null;
  }
  const d = db();
  return (d.whatsapp_optin || []).find(o => o.usuario_id === usuarioId) || null;
}

async function listRecent(usuarioId, limit = 50) {
  if (USING_PG) {
    const r = await _pgPool.query(`
      SELECT id, lembrete_id, canal, destinatario, status, erro, provider_id, enviado_em
      FROM notifications_log nl
      WHERE EXISTS (SELECT 1 FROM plantoes_lembretes pl WHERE pl.id = nl.lembrete_id AND pl.plantao_id IN (
        SELECT p.id FROM plantoes p WHERE p.medico_id = $1
      ))
      ORDER BY enviado_em DESC LIMIT $2
    `, [usuarioId, limit]);
    return r.rows;
  }
  const d = db();
  return (d.notifications_log || [])
    .filter(n => {
      const l = (d.plantoes_lembretes || []).find(x => x.id === n.lembrete_id);
      if (!l) return false;
      const p = (d.plantoes || []).find(x => x.id === l.plantao_id);
      return p && p.medicoId === usuarioId;
    })
    .sort((a, b) => (b.enviado_em || '').localeCompare(a.enviado_em || ''))
    .slice(0, limit);
}

async function alreadyLogged(lembreteId, canal) {
  if (USING_PG) {
    const r = await _pgPool.query('SELECT 1 FROM notifications_log WHERE lembrete_id=$1 AND canal=$2 LIMIT 1', [lembreteId, canal]);
    return r.rowCount > 0;
  }
  const d = db();
  return (d.notifications_log || []).some(n => n.lembrete_id === lembreteId && n.canal === canal);
}

async function recordNotification({ lembrete_id, canal, destinatario, status, erro, provider_id }) {
  if (USING_PG) {
    await _pgPool.query(`
      INSERT INTO notifications_log (lembrete_id, canal, destinatario, status, erro, provider_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (lembrete_id, canal) DO NOTHING
    `, [lembrete_id, canal, destinatario, status, erro || null, provider_id || null]);
  } else {
    const d = db();
    const exists = (d.notifications_log || []).find(n => n.lembrete_id === lembrete_id && n.canal === canal);
    if (exists) return;
    d.notifications_log = d.notifications_log || [];
    d.notifications_log.push({
      id: (d.seq.notif_log = (d.seq.notif_log || 0) + 1),
      lembrete_id, canal, destinatario, status,
      erro: erro || null, provider_id: provider_id || null,
      enviado_em: new Date().toISOString()
    });
    persistJSON(d);
  }
}

/* ============================================================
   Worker — fan-out para WhatsApp (idempotente)
   Chamado por /api/cron/reminders APÓS reminders.tick().
   ============================================================ */
async function getDueLembretes(now, force) {
  if (USING_PG) {
    const r = await _pgPool.query(`
      SELECT l.id AS lembrete_id, l.plantao_id, l.tipo, l.offset_horas, l.mensagem, l.executar_em,
             p.id AS plantao, p.data, p.turno, p.local, p.instituicao, p.valor, p.medico_id,
             u.id AS medico, u.nome AS medico_nome, u.email AS medico_email
      FROM plantoes_lembretes l
      JOIN plantoes p ON p.id = l.plantao_id
      JOIN usuarios u ON u.id = p.medico_id
      WHERE l.ativo = TRUE
        ${force ? '' : 'AND l.executar_em <= $1'}
      ORDER BY l.executar_em ASC LIMIT 200
    `, force ? [] : [now.toISOString()]);
    return r.rows;
  }
  const d = db();
  const out = [];
  for (const l of (d.plantoes_lembretes || [])) {
    if (!l.ativo) continue;
    if (!force && new Date(l.executar_em) > now) continue;
    const p = (d.plantoes || []).find(x => x.id === l.plantao_id);
    if (!p) continue;
    const u = (d.usuarios || []).find(x => x.id === p.medicoId);
    if (!u) continue;
    out.push({
      lembrete_id: l.id, plantao_id: p.id, tipo: l.tipo, offset_horas: l.offset_horas, mensagem: l.mensagem,
      executar_em: l.executar_em, plantao: p.id, data: p.data, turno: p.turno, local: p.local, instituicao: p.instituicao, valor: p.valor,
      medico_id: u.id, medico: u.id, medico_nome: u.nome, medico_email: u.email
    });
  }
  return out;
}

async function enqueueWhatsAppForAll({ force = false } = {}) {
  const now = new Date();
  const lembretes = await getDueLembretes(now, force);
  let enviados = 0, falhas = 0, optouts = 0, deduped = 0;
  for (const l of lembretes) {
    const optin = await getPreferences(l.medico_id);
    if (!optin || !optin.aceitar_lembretes) {
      await recordNotification({ lembrete_id: l.lembrete_id, canal: 'whatsapp', destinatario: optin ? optin.telefone_e164 : '(sem-opt-in)', status: 'optout' });
      optouts++;
      continue;
    }
    if (!force && await alreadyLogged(l.lembrete_id, 'whatsapp')) { deduped++; continue; }
    const tpl = templateForOffset(l.offset_horas);
    const params = [
      l.medico_nome,
      l.instituicao || l.local || 'hospital',
      l.data
    ];
    const r = await sendWhatsApp(optin.telefone_e164, tpl, optin.template_lang, params);
    await recordNotification({ lembrete_id: l.lembrete_id, canal: 'whatsapp', destinatario: optin.telefone_e164, status: r.status, erro: r.erro, provider_id: r.provider_id });
    if (r.status === 'enviado') enviados++;
    else if (r.status === 'falhou') falhas++;
  }
  return { processados: lembretes.length, whatsapp: { enviados, falhas, optouts, deduped } };
}

module.exports = {
  init, isConfigured, ensureSchema,
  setPreferences, getPreferences, listRecent,
  enqueueWhatsAppForAll, templateForOffset, sendWhatsApp
};

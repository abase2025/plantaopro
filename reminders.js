/* ============================================================
   PlantãoPro — Engine de Lembretes (E-mail + Web Push)
   - Com SMTP_HOST/USER/PASS → Nodemailer (genérico, suporta Gmail/Outlook/SMTP)
   - Ou com RESEND_API_KEY → Resend (HTTPS, free tier 100/dia)
   - Sem config → STUB grava em data/outbox.log (perfeito pra Render Free)
   - Push: com VAPID_PUBLIC/PRIVATE → web-push real. Sem → STUB.
   - Idempotente: reminders_log UNIQUE(plantao_id, medico_id, offset_horas)
   ============================================================ */
const fs   = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const webpush    = require('web-push');

const { USING_PG, _pgPool, persistJSON: _persistJSONRef, ensureJSON: _ensureJSONRef } = (() => {
  try { return require('./db-pg'); } catch { return { USING_PG:false, _pgPool:null }; }
})();

const PORT = process.env.PORT || 3000;

const TURNOS = {
  manha:    { label: 'Manhã',      inicio: '06:00', end: '12:00' },
  tarde:    { label: 'Tarde',      inicio: '12:00', end: '18:00' },
  noite:    { label: 'Noite',      inicio: '18:00', end: '23:59' },
  madrugada:{ label: 'Madrugada',  inicio: '00:00', end: '05:59' }
};

/* Offsets (em horas, relativos ao INÍCIO do plantão) com rótulo curto. */
const REMINDER_OFFSETS = [
  { offset: -24, tipo: 'pre24h', label: 'Amanhã' },
  { offset:  -3, tipo: 'pre3h',  label: 'Daqui a 3 horas' },
  { offset:  -1, tipo: 'pre1h',  label: 'Daqui a 1 hora' },
  { offset:   0, tipo: 'agora',  label: 'Agora' },
  { offset:  +1, tipo: 'pos1h',  label: 'Em andamento (1h após início)' },
  { offset: +24, tipo: 'pos24h', label: 'Resumo 24h após início' }
];

/* ---------- Senders ---------- */
const SMTP_HOST    = process.env.SMTP_HOST    || '';
const SMTP_PORT    = Number(process.env.SMTP_PORT || 587);
const SMTP_USER    = process.env.SMTP_USER    || '';
const SMTP_PASS    = process.env.SMTP_PASS    || '';
const SMTP_FROM    = process.env.SMTP_FROM    || 'PlantãoPro <alertas@plantaopro.com>';
const RESEND_KEY   = process.env.RESEND_API_KEY|| '';
const VAPID_PUBLIC = process.env.VAPID_PUBLIC || '';
const VAPID_PRIV   = process.env.VAPID_PRIVATE|| '';
const VAPID_SUBJ   = process.env.VAPID_SUBJECT || 'mailto:admin@plantaopro.com';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://abase2025.github.io/plantoopro';

let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  if (!SMTP_HOST) return null;
  _transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });
  return _transporter;
}
async function sendEmail({ to, subject, text, html }) {
  if (RESEND_KEY) {
    // Resend HTTPS (mais simples no Render Free)
    const r = await fetch('https://api.resend.com/emails', {
      method:'POST', headers:{ 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ from: SMTP_FROM, to: [to], subject, text, html })
    });
    if (!r.ok) { const err = await r.text(); throw new Error('resend ' + r.status + ': ' + err.slice(0, 200)); }
    const j = await r.json().catch(()=>({}));
    return { provider:'resend', id: j.id || null };
  }
  const t = getTransporter();
  if (t) {
    const r = await t.sendMail({ from: SMTP_FROM, to, subject, text, html });
    return { provider:'smtp', id: r.messageId || null };
  }
  // STUB: grava no outbox.log (Render Free + modo demo)
  stubWrite('email', { to, subject, text });
  return { provider:'stub' };
}
function configureWebPush() {
  if (!VAPID_PUBLIC || !VAPID_PRIV) return false;
  try {
    webpush.setVAPIDDetails(VAPID_SUBJ, VAPID_PUBLIC, VAPID_PRIV);
    return true;
  } catch (e) { console.warn('[push] VAPID config falhou:', e.message); return false; }
}
async function sendPush({ subscription, payload }) {
  if (!configureWebPush()) {
    stubWrite('push', { endpoint: subscription.endpoint, payload });
    return { provider:'stub' };
  }
  await webpush.sendNotification(subscription, JSON.stringify(payload));
  return { provider:'web-push' };
}

/* ---------- Outbox (stub) ---------- */
const OUTBOX_LOG = path.join(__dirname, 'data', 'outbox.log');
function stubWrite(channel, info) {
  fs.mkdirSync(path.dirname(OUTBOX_LOG), { recursive: true });
  const line = `[${new Date().toISOString()}] ${channel}:stub  ${JSON.stringify(info)}\n`;
  fs.appendFileSync(OUTBOX_LOG, line);
}

/* ---------- DB helpers (dual mode) ---------- */
async function getActivePlantoes() {
  if (USING_PG) {
    return await (async () => {
      const r = await _pgPool.query(`
        SELECT p.id, p.medico_id, p.data, p.turno, p.local, p.status,
               u.id   AS uid,    u.email,    u.nome,
               s.id   AS sid,    s.nome AS setor
        FROM plantoes p
        JOIN usuarios u   ON u.id = p.medico_id AND u.ativo = TRUE
        LEFT JOIN setores s ON s.id = p.setor_id
        WHERE p.status = 'confirmado'
          AND p.medico_id IS NOT NULL
          AND p.data BETWEEN (CURRENT_DATE - INTERVAL '1 day') AND (CURRENT_DATE + INTERVAL '7 days')
        ORDER BY p.data, p.turno
      `);
      return r.rows.map(x => ({
        id: x.id, medicoId: x.medico_id, data: typeof x.data === 'string' ? x.data : x.data.toISOString().slice(0,10),
        turno: x.turno, local: x.local, status: x.status,
        medico: { id: x.uid, email: x.email, nome: x.nome },
        setor: x.setor
      }));
    })();
  }
  const m = _ensureJSONRef();
  return m.plantoes.filter(p => p.medicoId && p.status === 'confirmado').map(p => {
    const u = m.usuarios.find(u => u.id === p.medicoId);
    const s = m.setores.find(s => s.id === p.setorId);
    return {
      id: p.id, medicoId: p.medicoId, data: p.data, turno: p.turno, local: p.local, status: p.status,
      medico: u ? { id: u.id, email: u.email, nome: u.nome } : null,
      setor: s ? s.nome : '—'
    };
  });
}
async function alreadySent(plantaoId, medicoId, offsetHoras) {
  if (USING_PG) {
    const r = await _pgPool.query(
      'SELECT id FROM reminders_log WHERE plantao_id=$1 AND medico_id=$2 AND offset_horas=$3',
      [plantaoId, medicoId, offsetHoras]
    );
    return r.rowCount > 0;
  }
  const m = _ensureJSONRef();
  return m.reminders.some(x => x.plantaoId === plantaoId && x.medicoId === medicoId && x.offsetHoras === offsetHoras);
}
async function recordSent({ plantaoId, medicoId, offsetHoras, canal, status, erro }) {
  if (USING_PG) {
    await _pgPool.query(
      `INSERT INTO reminders_log (plantao_id,medico_id,offset_horas,canal,status,erro)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (plantao_id, medico_id, offset_horas) DO NOTHING`,
      [plantaoId, medicoId, offsetHoras, canal, status, erro || null]
    );
    return;
  }
  const m = _ensureJSONRef();
  m.reminders.push({ plantaoId, medicoId, offsetHoras, canal, status, erro: erro || null, enviadoEm: new Date().toISOString() });
  _persistJSONRef(m);
}
async function getPushSubs(usuarioId) {
  if (USING_PG) {
    const r = await _pgPool.query('SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE usuario_id=$1 AND ativo=TRUE', [usuarioId]);
    return r.rows.map(x => ({ id: x.id, endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } }));
  }
  const m = _ensureJSONRef();
  return m.pushSubs
    .filter(s => s.usuarioId === usuarioId && s.ativo !== false)
    .map(s => ({ id: s.id, endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }));
}

/* ---------- Tick (engine) ---------- */
function plantaoStartDate(p) {
  const t = TURNOS[p.turno];
  const ini = t ? t.inicio : '12:00';
  return new Date(`${p.data}T${ini}:00`);
}
function dueAt(p, offsetH) {
  const start = plantaoStartDate(p);
  return new Date(start.getTime() + offsetH * 3600 * 1000);
}
function fmtBR(iso) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function template(p, offset, label) {
  const dataBR = fmtBR(p.data);
  const turno  = TURNOS[p.turno] ? TURNOS[p.turno].label : p.turno;
  const setor  = p.setor || '—';
  const local  = p.local || '(a definir)';
  let subject, intro;
  if (offset === -24) {
    subject = `🌙 Plantão amanhã (${dataBR}) — ${setor} — ${turno}`;
    intro   = `Você tem um plantão AMANHÃ, ${dataBR}, no turno ${turno}.`;
  } else if (offset === -3) {
    subject = `⏰ Plantão em 3 horas (${dataBR}) — ${setor} — ${turno}`;
    intro   = `Daqui a 3 horas começa seu plantão (${dataBR}, ${turno}).`;
  } else if (offset === -1) {
    subject = `⏰ Plantão em 1 hora (${dataBR}) — ${setor} — ${turno}`;
    intro   = `Daqui a 1 hora começa seu plantão. Prepare-se!`;
  } else if (offset === 0) {
    subject = `🟢 Plantão AGORA (${turno})`;
    intro   = `Seu plantão começou agora. Bom trabalho!`;
  } else if (offset === 1) {
    subject = `📋 Plantão em andamento (1h após início)`;
    intro   = `Você está a 1h do início do plantão. Confirme sua presença pelo app quando possível.`;
  } else if (offset === 24) {
    subject = `✅ Resumo do plantão (24h após início)`;
    intro   = `Plantão encerrado. Registre o check-in pelo app se ainda não fez.`;
  } else {
    subject = `Plantão (${dataBR} — ${turno})`;
    intro   = `Atualização do plantão.`;
  }
  const text =
`${intro}

📅 Data: ${dataBR}
🕐 Turno: ${turno} (início ${TURNOS[p.turno]?.inicio || '—'})
🏥 Setor: ${setor}
📍 Local: ${local}

Abra o PlantãoPro para mais detalhes:
${APP_BASE_URL}/#/dashboard
`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">
<h2 style="margin:0 0 8px">${intro}</h2>
<table style="border-collapse:collapse;margin:12px 0">
  <tr><td style="padding:4px 8px;color:#666">📅 Data:</td><td><b>${dataBR}</b></td></tr>
  <tr><td style="padding:4px 8px;color:#666">🕐 Turno:</td><td><b>${turno}</b></td></tr>
  <tr><td style="padding:4px 8px;color:#666">🏥 Setor:</td><td><b>${setor}</b></td></tr>
  <tr><td style="padding:4px 8px;color:#666">📍 Local:</td><td><b>${local}</b></td></tr>
</table>
<p><a href="${APP_BASE_URL}/#/dashboard" style="background:#1976d2;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Abrir PlantãoPro</a></p>
<p style="color:#999;font-size:12px">PlantãoPro • ${label}</p>
</div>`;
  return { subject, text, html };
}

async function tick({ force = false } = {}) {
  const iniciadoEm = new Date();
  const plantoes = await getActivePlantoes();
  const agora = new Date();
  const LIMIAR_TARDE_MS = force ? 365 * 24 * 3600 * 1000 : 24 * 3600 * 1000;
  let analisados = 0, enviados = 0, pulados = 0, erros = 0;
  const linhas = [];

  for (const p of plantoes) {
    if (!p.medico) continue;
    for (const o of REMINDER_OFFSETS) {
      const d = dueAt(p, o.offset);
      const ms = d.getTime() - agora.getTime();
      const due = ms <= 0;
      const stale = !force && Math.abs(ms) > LIMIAR_TARDE_MS;
      if (!due || stale) { pulados++; continue; }
      analisados++;
      if (await alreadySent(p.id, p.medicoId, o.offset)) {
        linhas.push(`⏭  plantao=${p.id} offset=${o.offset}h já enviado`);
        continue;
      }
      // ENVIA
      try {
        const { subject, text, html } = template(p, o.offset, o.label);
        // 1) e-mail
        await sendEmail({ to: p.medico.email, subject, text, html });
        // 2) push (se houver sub)
        const subs = await getPushSubs(p.medicoId);
        if (subs.length) {
          await sendPush({
            subscription: subs[0],
            payload: { title: subject, body: text.split('\n')[0], data: { plantaoId: p.id, offset: o.offset } }
          });
        }
        await recordSent({ plantaoId: p.id, medicoId: p.medicoId, offsetHoras: o.offset, canal: 'ambos', status: 'enviado' });
        enviados++;
        linhas.push(`✅ plantao=${p.id} medico=${p.medico.email} offset=${o.offset}h "${subject}"`);
      } catch (e) {
        await recordSent({ plantaoId: p.id, medicoId: p.medicoId, offsetHoras: o.offset, canal: 'ambos', status: 'falhou', erro: String(e.message || e).slice(0, 500) });
        erros++;
        linhas.push(`❌ plantao=${p.id} offset=${o.offset}h ERRO: ${e.message || e}`);
      }
    }
  }

  const resumo = { iniciadoEm, duracaoMs: Date.now() - iniciadoEm.getTime(),
    plantoesAnalisados: plantoes.length, lembretesConsiderados: analisados,
    enviados, puladosJaEnviados: 0, erros };
  console.log(`[reminders] tick #${Date.now().toString().slice(-6)} force=${force} analisados=${resumo.plantoesAnalisados} devidos=${resumo.lembretesConsiderados} enviados=${enviados} erros=${erros}`);
  return { ...resumo, detalhes: linhas };
}

module.exports = { tick, REMINDER_OFFSETS, plantaoStartDate, sendEmail, sendPush, configureWebPush };

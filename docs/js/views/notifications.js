/* PlantãoPro — Notificações multi-canal (push + WhatsApp)
   Tela com:
     • Status de canais (push + whatsapp)
     • Ativação de Web Push (botão "🔔 Ativar notificações")
     • Opt-in de WhatsApp (telefone + checkboxes de aceitação)
     • Lista das últimas 50 notificações
*/
async function renderNotifications(el) {
  el.innerHTML = '';
  const user = API.getUser();
  if (!user) { location.hash = '#/login'; return; }
  const ehAdmin = Permissions.exigir('admin', user);

  el.appendChild(UI.h('div', { class: 'page-head' },
    UI.h('div', null,
      UI.h('h1', { class: 'page-title' }, '🔔 Notificações'),
      UI.h('div', { class: 'page-sub' }, 'Ative o navegador e/ou WhatsApp para receber lembretes e alertas dos seus plantões.')
    )
  ));

  const status = await API.get('/api/notifications/status').catch(() => ({ canais: {} }));
  const preferencias = await API.get('/api/notifications/preferences').catch(() => null);
  const recentes = await API.get('/api/notifications/recentes').catch(() => ({ notificacoes: [] }));

  // === Card de canais ===
  const cardCanais = UI.h('div', { class: 'card', style: 'padding:18px;max-width:760px;margin-bottom:14px' });
  cardCanais.innerHTML = `
    <h3 style="margin:0 0 10px 0">📡 Status dos canais</h3>
    <div style="display:grid;gap:8px">
      <div class="row"><span class="lab">Navegador (Web Push / VAPID)</span><b>${esc(status.canais?.push || 'desconhecido')}</b></div>
      <div class="row"><span class="lab">WhatsApp (Meta Cloud API)</span><b>${esc(status.canais?.whatsapp || 'desconhecido')}</b></div>
      <div class="row"><span class="lab">E-mail</span><b>${esc(status.canais?.email || 'desconhecido')}</b></div>
      <div class="row"><span class="lab">Lembretes por plantão (offsets)</span><b>${esc((status.lembretesOffsets || [-24,-3,0]).join('h, ') + 'h')}</b></div>
    </div>
  `;
  el.appendChild(cardCanais);

  // === Card do Web Push ===
  const cardPush = UI.h('div', { class: 'card', style: 'padding:18px;max-width:760px;margin-bottom:14px' });
  cardPush.innerHTML = `
    <h3 style="margin:0 0 10px 0">🌐 Notificações do navegador</h3>
    <p style="color:var(--muted);font-size:13px;margin:0 0 10px 0">
      Receba 🔔 mesmo com a aba em background. Pede permissão do navegador uma vez.
    </p>
    <button id="btn-push" class="btn btn-primary">🔔 Ativar notificações do navegador</button>
  `;
  el.appendChild(cardPush);
  cardPush.querySelector('#btn-push').addEventListener('click', async () => {
    try {
      if (window.PushUI && typeof PushUI.subscribe === 'function') {
        await PushUI.subscribe();
      } else if (window.PushUI && typeof PushUI.mountBtn === 'function') {
        // fallback legacy
        await PushUI.subscribe();
      } else {
        UI.toast('Helper de push indisponível neste build.', 'err');
      }
    } catch (e) { UI.toast('Erro ao ativar: ' + e.message, 'err'); }
  });

  // === Card do WhatsApp ===
  const cardWa = UI.h('div', { class: 'card', style: 'padding:18px;max-width:760px;margin-bottom:14px' });
  cardWa.innerHTML = `
    <h3 style="margin:0 0 10px 0">📱 WhatsApp</h3>
    <p style="color:var(--muted);font-size:13px;margin:0 0 10px 0">
      Use o formato internacional com DDI: <code>+5511999998888</code>. Brasil sem DDI é convertido automaticamente (+55).
      Templates pré-aprovados: plantaopro_lembrete_24h, plantaopro_lembrete_3h, plantaopro_lembrete_inicio.
    </p>
    <form id="form-wa" class="pp-form">
      <div class="form-row">
        <label>Telefone (E.164)*</label>
        <input id="wa-tel" type="tel" placeholder="+5511999998888" required />
      </div>
      <div class="form-row"><label><input type="checkbox" id="wa-lem" checked /> Aceitar lembretes (24h, 3h, início)</label></div>
      <div class="form-row"><label><input type="checkbox" id="wa-ale" checked /> Aceitar alertas (criado, editado, cancelado)</label></div>
      <div class="form-row">
        <label>Idioma dos templates</label>
        <select id="wa-lang">
          <option value="pt_BR">pt_BR (padrão)</option>
          <option value="en_US">en_US</option>
          <option value="es">es</option>
        </select>
      </div>
      <div id="wa-erro" class="erro" role="alert"></div>
      <div class="actions">
        ${ehAdmin ? '<button type="button" id="btn-wa-test" class="btn btn-ghost">🧪 Enviar teste (admin)</button>' : ''}
        <button type="submit" id="btn-wa-save" class="btn btn-primary">💾 Salvar opt-in</button>
      </div>
    </form>
    ${preferencias ? `<div style="margin-top:10px;padding:10px;background:var(--primary-soft);border-radius:8px;font-size:13px">
       ✅ Opt-in ativo: <b>${esc(preferencias.telefone_e164 || preferencias.telefone || '')}</b> ·
       lembretes: <b>${preferencias.aceitar_lembretes ? 'sim' : 'não'}</b> ·
       alertas: <b>${preferencias.aceitar_alertas ? 'sim' : 'não'}</b> ·
       lang: <b>${esc(preferencias.template_lang || 'pt_BR')}</b>
     </div>` : '<div style="margin-top:10px;color:var(--muted);font-size:13px">⚠️ Sem opt-in ativo.</div>'}
  `;
  el.appendChild(cardWa);

  // preencher form com prefs existentes
  if (preferencias) {
    cardWa.querySelector('#wa-tel').value = preferencias.telefone_e164 || preferencias.telefone || '';
    cardWa.querySelector('#wa-lem').checked = preferencias.aceitar_lembretes !== false;
    cardWa.querySelector('#wa-ale').checked = preferencias.aceitar_alertas !== false;
    cardWa.querySelector('#wa-lang').value = preferencias.template_lang || 'pt_BR';
  }

  cardWa.querySelector('#form-wa').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const tel = cardWa.querySelector('#wa-tel').value.trim();
    const erroEl = cardWa.querySelector('#wa-erro');
    erroEl.textContent = '';
    if (!tel) { erroEl.textContent = 'Informe o telefone.'; return; }
    const btn = cardWa.querySelector('#btn-wa-save');
    btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      await API.post('/api/notifications/preferences', {
        telefone: tel,
        aceitar_lembretes: cardWa.querySelector('#wa-lem').checked,
        aceitar_alertas: cardWa.querySelector('#wa-ale').checked,
        template_lang: cardWa.querySelector('#wa-lang').value
      });
      UI.toast('✅ Opt-in WhatsApp salvo.', 'ok');
      renderNotifications(el);
    } catch (e) {
      erroEl.textContent = e.message;
      btn.disabled = false; btn.textContent = '💾 Salvar opt-in';
    }
  });

  // botão admin "enviar teste"
  const btnTest = cardWa.querySelector('#btn-wa-test');
  if (btnTest) {
    btnTest.addEventListener('click', async () => {
      try {
        const r = await API.post('/api/notifications/test', {});
        UI.toast('🧪 Teste enviado: ' + (r.status || ''), 'ok');
      } catch (e) { UI.toast('Erro: ' + e.message, 'err'); }
    });
  }

  // === Lista de notificações recentes ===
  const lista = UI.h('div', { class: 'card', style: 'padding:18px;max-width:760px' });
  lista.innerHTML = `<h3 style="margin:0 0 10px 0">📜 Últimas notificações</h3>`;
  const items = recentes.notificacoes || [];
  if (!items.length) {
    lista.appendChild(UI.emptyMsg('📭', 'Nenhuma notificação enviada ainda.'));
  } else {
    lista.appendChild(UI.h('div', { class: 'item-list' }, items.slice(0, 50).map(n =>
      UI.h('div', { class: 'item' },
        UI.h('div', { class: 'item-main' },
          UI.h('div', { class: 'item-title' },
            canalBadge(n.canal),
            ' ',
            n.status === 'enviado' ? '✅' : (n.status === 'falhou' ? '⚠️' : '⛔'),
            ' ',
            UI.fmtDataHora(n.enviado_em)),
          UI.h('div', { class: 'item-sub' }, '→ ' + (n.destinatario || ''), n.provider_id ? ' · ID: ' + n.provider_id : '', n.erro ? ' · ' + n.erro : '')
        )
      )
    )));
  }
  el.appendChild(lista);
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m])); }
function canalBadge(c) {
  if (c === 'whatsapp') return '<span class="badge badge-info">📱 WhatsApp</span>';
  if (c === 'push')     return '<span class="badge badge-ok">🌐 Web Push</span>';
  if (c === 'email')    return '<span class="badge badge-aberto">📧 E-mail</span>';
  return '<span class="badge">' + esc(c) + '</span>';
}

/* PlantãoPro — Formulário de cadastro na página inicial (Início)
   Campos: instituição/local, valor (R$), data (DD/MM/AAAA), horário início e fim (HH:MM), observações.
   Após confirmação: cria plantão (com medicoId = usuário logado se for médico), gera lembrete
   automático (via POST /api/plantoes que cria lembrete+financeiro em transação),
   exibe tela de confirmação com resumo e integra com Próximos plantões / Calendário / Financeiro.
*/
async function renderCadastro(el) {
  el.innerHTML = '';
  const user = API.getUser();
  if (!user) { location.hash = '#/login'; return; }
  const ehGestor = ['gestor', 'medico_gestor'].includes(user.perfil);

  // Buscar escalas e setores em paralelo
  const [escalasData, setoresData] = await Promise.all([
    API.get('/api/escalas').catch(() => ({ escalas: [] })),
    API.get('/api/setores').catch(() => ({ setores: [] }))
  ]);

  const escala = escalasData.escalas[0] || null;
  const setores = setoresData.setores || [];

  el.appendChild(UI.h('div', { class: 'page-head' },
    UI.h('div', null,
      UI.h('h1', { class: 'page-title' }, '➕ Cadastrar plantão'),
      UI.h('div', { class: 'page-sub' }, 'Após confirmar, o lembrete, alerta e financeiro são gerados automaticamente.')
    )
  ));

  const card = UI.h('div', { class: 'card', style: 'padding:18px;max-width:720px' });
  const formHtml = `
    <form id="form-cadastro-plantao" class="pp-form" novalidate>
      <div class="form-row">
        <label for="f-instituicao">Instituição / local *</label>
        <input id="f-instituicao" type="text" maxlength="120" placeholder="Ex.: Hospital Central — Ala B" required />
      </div>
      <div class="form-row">
        <label for="f-valor">Valor do plantão (R$) *</label>
        <input id="f-valor" type="text" inputmode="numeric" placeholder="R$ 0,00" required />
      </div>
      <div class="form-grid-2">
        <div class="form-row">
          <label for="f-data">Data *</label>
          <input id="f-data" type="text" inputmode="numeric" placeholder="DD/MM/AAAA" maxlength="10" required />
        </div>
        <div class="form-row">
          <label for="f-turno">Turno *</label>
          <select id="f-turno" required>
            <option value="">Selecione…</option>
            <option value="manha">Manhã</option>
            <option value="tarde">Tarde</option>
            <option value="noite">Noite</option>
            <option value="madrugada">Madrugada</option>
          </select>
        </div>
      </div>
      <div class="form-grid-2">
        <div class="form-row">
          <label for="f-inicio">Início *</label>
          <input id="f-inicio" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" required />
        </div>
        <div class="form-row">
          <label for="f-fim">Término *</label>
          <input id="f-fim" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" required />
        </div>
      </div>
      <div class="form-row">
        <label for="f-obs">Observações (opcional)</label>
        <textarea id="f-obs" rows="2" maxlength="500" placeholder="Anotações livres sobre o plantão"></textarea>
      </div>
      <div class="form-grid-2">
        <div class="form-row">
          <label for="f-setor">Setor</label>
          <select id="f-setor">${setores.map(s => '<option value="' + s.id + '">' + (s.nome || 'Setor ' + s.id) + '</option>').join('')}</select>
        </div>
        <div class="form-row">
          <label for="f-escala">Escala</label>
          <select id="f-escala">${(escalasData.escalas.length ? escalasData.escalas.map(e => '<option value="' + e.id + '">' + e.titulo + '</option>').join('') : '<option value="">—</option>')}</select>
        </div>
      </div>
      <div id="f-erro" class="erro" role="alert"></div>
      <div class="actions">
        <button type="button" id="btn-cancelar" class="btn btn-ghost">Cancelar</button>
        <button type="submit" id="btn-confirmar" class="btn btn-primary">✅ Confirmar e salvar</button>
      </div>
    </form>
  `;
  card.innerHTML = formHtml;
  el.appendChild(card);

  // Aplicar máscaras
  if (window.Masks) {
    Masks.mascaraBRL(card.querySelector('#f-valor'));
    Masks.mascaraData(card.querySelector('#f-data'));
    Masks.mascaraHora(card.querySelector('#f-inicio'));
    Masks.mascaraHora(card.querySelector('#f-fim'));
  }

  card.querySelector('#btn-cancelar').addEventListener('click', () => {
    location.hash = '#/dashboard';
  });

  card.querySelector('#form-cadastro-plantao').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    UI.loader(true);
    const erroEl = card.querySelector('#f-erro');
    erroEl.textContent = '';
    const instituicao = card.querySelector('#f-instituicao').value.trim();
    const valorStr = card.querySelector('#f-valor').value.trim();
    const valorNum = parseFloat(valorStr.replace(/[R$\s.]/g, '').replace(',', '.'));
    const dataBR = card.querySelector('#f-data').value.trim();
    const dataISO = (window.Masks && Masks.dataParaISO(dataBR)) || null;
    const inicio = card.querySelector('#f-inicio').value.trim();
    const fim = card.querySelector('#f-fim').value.trim();
    const obs = card.querySelector('#f-obs').value.trim();
    const turno = card.querySelector('#f-turno').value;
    const setorId = parseInt(card.querySelector('#f-setor').value) || null;
    const escalaId = parseInt(card.querySelector('#f-escala').value) || (escala ? escala.id : null);

    // Validações com mensagens claras
    if (!instituicao) { erroEl.textContent = 'Informe a instituição/local.'; UI.loader(false); return; }
    if (valorStr === '' || isNaN(valorNum) || valorNum < 0) { erroEl.textContent = 'Valor inválido. Use R$ 0,00.'; UI.loader(false); return; }
    if (!dataISO) { erroEl.textContent = 'Data inválida. Use DD/MM/AAAA.'; UI.loader(false); return; }
    if (!turno) { erroEl.textContent = 'Selecione o turno.'; UI.loader(false); return; }
    if (!window.Masks || !Masks.horaValida(inicio)) { erroEl.textContent = 'Horário de início inválido (HH:MM).'; UI.loader(false); return; }
    if (!window.Masks || !Masks.horaValida(fim)) { erroEl.textContent = 'Horário de término inválido (HH:MM).'; UI.loader(false); return; }
    if (!escalaId) { erroEl.textContent = 'Crie uma escala antes de cadastrar plantões.'; UI.loader(false); return; }

    // Bloqueia o botão enquanto processa
    const btn = card.querySelector('#btn-confirmar');
    btn.disabled = true; btn.textContent = 'Salvando…';

    try {
      const r = await API.post('/api/plantoes', {
        escalaId, setorId, medicoId: user.id,
        data: dataISO, turno, instituicao, local: instituicao,
        valor: valorNum, inicio, fim, observacoes: obs
      });
      const plantao = r.plantao || r;
      UI.toast('✅ Plantão salvo! Lembrete e financeiro criados.', 'ok');
      mostrarConfirmacao(el, { ...plantao, instituicao, valor: valorNum, dataISO, turno, inicio, fim, obs });
    } catch (err) {
      erroEl.textContent = err.message || 'Erro ao salvar plantão.';
      btn.disabled = false; btn.textContent = '✅ Confirmar e salvar';
    } finally {
      UI.loader(false);
    }
  });
}

function mostrarConfirmacao(el, p) {
  el.innerHTML = '';
  const card = UI.h('div', { class: 'card', style: 'padding:22px;max-width:720px;border-left:6px solid var(--primary, #0d7a66)' });
  card.innerHTML = `
    <h2 style="margin:0 0 6px 0;color:var(--primary-dark,#0a5f50)">✅ Plantão confirmado!</h2>
    <p style="color:var(--muted,#6b7c78);margin:0 0 14px 0">Resumo do que foi salvo e gerado automaticamente.</p>
    <table class="det" style="width:100%;border-collapse:collapse">
      <tr><td><b>Instituição/Local</b></td><td>${p.instituicao || '—'}</td></tr>
      <tr><td><b>Data</b></td><td>${UI.fmtData(p.dataISO)}</td></tr>
      <tr><td><b>Turno</b></td><td>${p.turno}</td></tr>
      <tr><td><b>Horário</b></td><td>${p.inicio} → ${p.fim}</td></tr>
      <tr><td><b>Valor previsto</b></td><td>R$ ${Number(p.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>
      <tr><td><b>Observações</b></td><td>${p.obs || '—'}</td></tr>
    </table>
    <div style="background:var(--primary-soft,#e2f3ef);padding:10px 12px;border-radius:8px;margin:14px 0">
      <b>🔁 Integrações realizadas automaticamente:</b>
      <ul style="margin:6px 0 0 18px;color:var(--text,#16302b)">
        <li>Adicionado em “📅 Próximos plantões” (visível em Início e Escalas)</li>
        <li>🔔 Lembrete agendado para 1 dia antes do plantão</li>
        <li>⚠️ Alerta “criado” registrado no histórico do plantão</li>
        <li>💰 Receita prevista adicionada ao Financeiro do mês</li>
        <li>📆 Aparece no Calendário do mês corrente</li>
      </ul>
    </div>
    <div class="actions" style="display:flex;gap:8px">
      <a href="#/proximos" class="btn btn-ghost" style="flex:1;text-align:center">📋 Ver Próximos plantões</a>
      <a href="#/financeiro" class="btn btn-accent" style="flex:1;text-align:center">💰 Ver Financeiro</a>
      <a href="#/dashboard" class="btn btn-primary" style="flex:1;text-align:center">🏠 Voltar ao Início</a>
    </div>
  `;
  el.appendChild(card);
  // Renderiza o card com setters de eventos nos links (delegação do router trata)
}

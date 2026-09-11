/* ============================================================
   PlantãoPro — View: Comunicação da equipe (chat por setor)
   Lógica de tempo real simulada com polling (a cada 3,5s).
   ============================================================ */
let chatTimer = null;
let chatSetorId = null;

async function renderChat(el) {
  el.innerHTML = '';
  if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }

  el.appendChild(UI.h('div', { class: 'page-head' },
    UI.h('div', null,
      UI.h('h1', { class: 'page-title' }, '💬 Comunicação da equipe'),
      UI.h('div', { class: 'page-sub' }, 'Mensagens por setor, em tempo real')
    )
  ));

  const setorSelect = UI.h('select', null, UI.h('option', { value: '' }, 'Carregando setores...'));

  try {
    const r = await API.get('/api/setores');
    setorSelect.innerHTML = '';
    r.setores.forEach((s) => setorSelect.appendChild(UI.h('option', { value: s.id }, s.nome)));
    chatSetorId = r.setores[0]?.id || null;
  } catch (err) {
    el.appendChild(UI.emptyMsg('⚠️', err.message));
    return;
  }

  const log = UI.h('div', { class: 'chat-log' });
  const input = UI.h('input', { type: 'text', placeholder: 'Digite sua mensagem...', maxlength: '500' });
  const sendBtn = UI.h('button', { class: 'btn btn-primary', onclick: () => enviarMensagem(input) }, 'Enviar');

  const box = UI.h('div', { class: 'chat-box' },
    UI.h('label', null, 'Setor'), setorSelect,
    log,
    UI.h('div', { class: 'chat-input-row' }, input, sendBtn)
  );
  el.appendChild(box);

  setorSelect.addEventListener('change', () => {
    chatSetorId = Number(setorSelect.value);
    carregarMensagens(log);
  });

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviarMensagem(input); });

  async function carregarMensagens(logEl) {
    if (!chatSetorId) return;
    try {
      const data = await API.get('/api/mensagens?setorId=' + chatSetorId);
      const user = API.getUser();
      logEl.innerHTML = '';
      if (!data.mensagens.length) {
        logEl.appendChild(UI.emptyMsg('💬', 'Nenhuma mensagem neste setor ainda. Seja o primeiro(a)!'));
        return;
      }
      for (const m of data.mensagens) {
        const mine = m.remetenteId === user?.id;
        logEl.appendChild(UI.h('div', { class: 'msg ' + (mine ? 'mine' : 'other') },
          UI.h('span', null, m.texto),
          UI.h('span', { class: 'msg-meta' }, m.remetente + ' · ' + UI.fmtDataHora(m.criadoEm))
        ));
      }
      logEl.scrollTop = logEl.scrollHeight;
    } catch { /* mantém o chat atual em caso de erro */ }
  }

  window.__chatCarregar = () => carregarMensagens(log);
  carregarMensagens(log);
  chatTimer = setInterval(() => carregarMensagens(log), 3500);

  async function enviarMensagem(inputEl) {
    const texto = inputEl.value.trim();
    if (!texto || !chatSetorId) return;
    try {
      await API.post('/api/mensagens', { setorId: chatSetorId, texto });
      inputEl.value = '';
      await carregarMensagens(log);
    } catch (err) { UI.toast(err.message, 'err'); }
  }
}

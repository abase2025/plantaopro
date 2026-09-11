/* ============================================================
   PlantãoPro — View: Escalas e Plantões
   (criação/edição de escalas, alocação de médicos, abertura de oferta)
   ============================================================ */
let escalasCache = [];

async function renderEscalas(el) {
  el.innerHTML = '';
  const user = API.getUser();
  const podeEditar = ['gestor', 'medico_gestor'].includes(user?.perfil);

  const head = UI.h('div', { class: 'page-head' },
    UI.h('div', null,
      UI.h('h1', { class: 'page-title' }, '📋 Escalas e Plantões'),
      UI.h('div', { class: 'page-sub' }, 'Monte, publique e gerencie as escalas da sua equipe')
    ),
    podeEditar ? UI.h('button', { class: 'btn btn-primary', onclick: () => modalNovaEscala() }, '+ Nova escala') : null
  );
  el.appendChild(head);

  try {
    const data = await API.get('/api/escalas');
    escalasCache = data.escalas;
  } catch (err) {
    el.appendChild(UI.emptyMsg('⚠️', err.message));
    return;
  }

  if (!escalasCache.length) {
    el.appendChild(UI.emptyMsg('🗓️', 'Nenhuma escala criada ainda.' + (podeEditar ? ' Crie a primeira!' : '')));
    return;
  }

  const container = UI.h('div', { class: 'grid' });
  for (const escala of escalasCache) {
    container.appendChild(cardEscala(escala, podeEditar, user));
  }
  el.appendChild(container);
}

function cardEscala(escala, podeEditar, user) {
  const card = UI.h('div', { class: 'card' });
  card.appendChild(UI.h('div', { class: 'card-title-row' },
    UI.h('div', null,
      UI.h('h3', null, escala.titulo),
      UI.h('div', { class: 'page-sub', style: 'margin:0' }, 'Setor: ' + escala.setor, ' · Referência: ' + escala.mesRef)
    ),
    podeEditar ? UI.h('button', { class: 'btn btn-ghost btn-sm', onclick: () => modalNovoPlantao(escala) }, '+ Plantão') : null
  ));

  const plantoes = escala.plantoes.sort((a, b) => (a.data + a.turno).localeCompare(b.data + b.turno));
  if (!plantoes.length) {
    card.appendChild(UI.emptyMsg('🕒', 'Sem plantões nesta escala.'));
    return card;
  }

  const rows = plantoes.map((p) => {
    const medicoCell = p.medico ? p.medico.nome : (p.status === 'aberto' ? 'Vago (oferta aberta)' : 'Vago');
    const actions = UI.h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' });
    if (podeEditar && !p.medicoId) {
      actions.appendChild(UI.h('button', { class: 'btn btn-ghost btn-sm', onclick: () => modalAlocar(p, escala) }, 'Alocar'));
    }
    if (podeEditar && !p.medicoId) {
      actions.appendChild(UI.h('button', { class: 'btn btn-accent btn-sm', onclick: () => abrirOferta(p) }, 'Oferta'));
    }
    if (user && user.perfil === 'medico' && p.medicoId === user.id) {
      actions.appendChild(UI.h('button', { class: 'btn btn-ghost btn-sm', onclick: () => UI.modalPlantaoDetalhes(p, { afterSave: () => renderEscalas(document.getElementById('view')) }) }, 'Editar detalhes'));
    }
    return UI.h('tr', null,
      UI.h('td', null, UI.fmtData(p.data)),
      UI.h('td', null, UI.h('span', { class: 'badge badge-info' }, p.turnoLabel || p.turno)),
      UI.h('td', null, medicoCell),
      UI.h('td', null, p.local || '—'),
      UI.h('td', null, p.valor != null ? 'R$ ' + Number(p.valor).toLocaleString('pt-BR') : 'Padrão'),
      UI.h('td', null, UI.badgeStatus(p.status)),
      UI.h('td', null, actions)
    );
  });

  const tbl = UI.h('div', { class: 'table-wrap' },
    UI.h('table', null,
      UI.h('thead', null, UI.h('tr', null,
        UI.h('th', null, 'Data'), UI.h('th', null, 'Turno'), UI.h('th', null, 'Médico'), UI.h('th', null, 'Local'), UI.h('th', null, 'Valor'), UI.h('th', null, 'Status'), UI.h('th', null, 'Ações'))
      ),
      UI.h('tbody', null, rows)
    )
  );
  card.appendChild(tbl);

  if (user && user.perfil === 'medico') {
    const meus = plantoes.filter((p) => p.medicoId === user.id).length;
    card.appendChild(UI.h('div', { class: 'page-sub', style: 'margin:10px 0 0' }, '🔎 Seus plantões nesta escala: ' + meus));
  }
  return card;
}

function modalNovaEscala() {
  const titulo = UI.h('input', { type: 'text', placeholder: 'Ex.: Escala UTI — Outubro', required: true });
  const mesRef = UI.h('input', { type: 'month', required: true });
  const setor = UI.h('select', null, UI.h('option', { value: '' }, 'Selecione...'));

  (async () => {
    try {
      const r = await API.get('/api/setores');
      r.setores.forEach((s) => setor.appendChild(UI.h('option', { value: s.id }, s.nome)));
    } catch { /* ignore */ }
  })();

  const form = UI.h('form', {},
    UI.h('label', null, 'Título'), titulo,
    UI.h('div', { class: 'input-row' },
      UI.h('div', null, UI.h('label', null, 'Mês de referência'), mesRef),
      UI.h('div', null, UI.h('label', null, 'Setor'), setor)
    ),
    UI.h('div', { class: 'form-actions' },
      UI.h('button', { type: 'submit', class: 'btn btn-primary', style: 'flex:1' }, 'Criar escala')
    )
  );

  const m = UI.modal('Nova escala', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!setor.value) return UI.toast('Selecione o setor.', 'err');
    try {
      await API.post('/api/escalas', { titulo: titulo.value, setorId: Number(setor.value), mesRef: mesRef.value });
      UI.toast('Escala criada com sucesso! ✅');
      m.close();
      renderEscalas(document.getElementById('view'));
    } catch (err) { UI.toast(err.message, 'err'); }
  });
}

function modalNovoPlantao(escala) {
  const data = UI.h('input', { type: 'date', required: true });
  const turno = UI.h('select', null,
    UI.h('option', { value: 'manha' }, 'Manhã (06:00–12:00)'),
    UI.h('option', { value: 'tarde' }, 'Tarde (12:00–18:00)'),
    UI.h('option', { value: 'noite' }, 'Noite (18:00–00:00)'),
    UI.h('option', { value: 'madrugada' }, 'Madrugada (00:00–06:00)')
  );
  const medico = UI.h('select', null, UI.h('option', { value: '' }, '— Deixar vago (abrir oferta depois) —'));

  (async () => {
    try {
      const r = await API.get('/api/usuarios');
      r.usuarios.filter((u) => u.perfil === 'medico' || u.perfil === 'medico_gestor')
        .forEach((u) => medico.appendChild(UI.h('option', { value: u.id }, u.nome + ' (' + u.setor + ')')));
    } catch { /* ignore */ }
  })();

  const form = UI.h('form', {},
    UI.h('div', { class: 'input-row' },
      UI.h('div', null, UI.h('label', null, 'Data'), data),
      UI.h('div', null, UI.h('label', null, 'Turno'), turno)
    ),
    UI.h('label', null, 'Médico'), medico,
    UI.h('div', { class: 'form-actions' },
      UI.h('button', { type: 'submit', class: 'btn btn-primary', style: 'flex:1' }, 'Adicionar plantão')
    )
  );

  const m = UI.modal('Novo plantão — ' + escala.titulo, form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await API.post('/api/plantoes', {
        escalaId: escala.id, setorId: escala.setorId,
        medicoId: medico.value ? Number(medico.value) : null,
        data: data.value, turno: turno.value
      });
      UI.toast('Plantão adicionado ✅');
      m.close();
      renderEscalas(document.getElementById('view'));
    } catch (err) { UI.toast(err.message, 'err'); }
  });
}

function modalAlocar(plantao, escala) {
  const medico = UI.h('select', null, UI.h('option', { value: '' }, 'Selecione...'));

  (async () => {
    try {
      const r = await API.get('/api/usuarios');
      r.usuarios.filter((u) => u.perfil === 'medico' || u.perfil === 'medico_gestor')
        .forEach((u) => medico.appendChild(UI.h('option', { value: u.id }, u.nome + ' (' + u.setor + ')')));
    } catch { /* ignore */ }
  })();

  const form = UI.h('form', {},
    UI.h('p', { class: 'page-sub' }, 'Data: ' + UI.fmtData(plantao.data), ' · Turno: ', plantao.turnoLabel),
    UI.h('label', null, 'Alocar médico'), medico,
    UI.h('div', { class: 'form-actions' },
      UI.h('button', { type: 'submit', class: 'btn btn-primary', style: 'flex:1' }, 'Alocar')
    )
  );

  const m = UI.modal('Alocar médico', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!medico.value) return UI.toast('Selecione um médico.', 'err');
    try {
      await API.put('/api/plantoes/' + plantao.id, { medicoId: Number(medico.value) });
      UI.toast('Médico alocado ✅');
      m.close();
      renderEscalas(document.getElementById('view'));
    } catch (err) { UI.toast(err.message, 'err'); }
  });
}

async function abrirOferta(plantao) {
  try {
    await API.post('/api/ofertas', { plantaoId: plantao.id });
    UI.toast('Oferta aberta! Médicos já podem aceitar 💼');
    renderEscalas(document.getElementById('view'));
  } catch (err) { UI.toast(err.message, 'err'); }
}

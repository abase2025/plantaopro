/* PlantãoPro — "Próximos plantões" (RBAC: gating por Permissions.can)
   admin   → edita/exclui qualquer plantão
   medico  → só os seus
   plantonista → nada (read-only, nem botão aparece)
*/
async function renderProximos(el) {
  el.innerHTML = '';
  const user = API.getUser();
  if (!user) { location.hash = '#/login'; return; }

  const perfil = Permissions.perfilDoUsuario(user);
  const ehAdmin       = Permissions.exigir('admin', user);
  const ehMedico      = Permissions.exigir('medico', user);
  const ehPlantonista = Permissions.exigir('plantonista', user);

  const header = UI.h('div', { class: 'page-head' },
    UI.h('div', null,
      UI.h('h1', { class: 'page-title' }, '📅 Próximos plantões'),
      UI.h('div', { class: 'page-sub' }, ehAdmin
        ? 'Visão completa da equipe — edita, exclui ou adiciona novos plantões.'
        : ehMedico
        ? 'Seus plantões — edite local/data/horário, adicione novos ou exclua.'
        : 'Modo somente leitura — você visualiza seus plantões, mas não pode alterá-los.')
    ),
    Permissions.can('cadastrarPlantao', user)
      ? UI.h('a', { href: '#/cadastro', class: 'btn btn-primary' }, '➕ Adicionar plantão')
      : null
  );
  el.appendChild(header);

  if (ehPlantonista) {
    el.appendChild(UI.h('div', { class: 'auth-warn' },
      UI.h('strong', null, '🔒 Perfil Plantonista'),
      UI.h('p', null, 'Você tem acesso somente leitura. Para editar, excluir ou cadastrar plantões, peça ao administrador para升级 seu perfil.')));
  }

  const [escalasData] = await Promise.all([API.get('/api/escalas').catch(() => ({ escalas: [] }))]);
  const todos = (escalasData.escalas || []).flatMap(e => (e.plantoes || []).map(p => ({ ...p, escalaTitulo: e.titulo, setorNome: e.setor || p.setor })));
  // escopo: admin vê todos, médico/plantonista só os próprios
  const visibles = todos.filter(p => Permissions.visivelPlantao(p, user));
  const proximos = visibles
    .filter(p => p.data >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => (a.data + 'T' + (a.inicio || '00:00')).localeCompare(b.data + 'T' + (b.inicio || '00:00')));

  if (!proximos.length) {
    el.appendChild(UI.emptyMsg('🗓️', 'Nenhum plantão futuro. ' + (ehAdmin ? 'Adicione um no botão acima.' : 'Aguarde o gestor montar a escala.')));
    return;
  }

  const lista = UI.h('div', { class: 'item-list' });
  for (const p of proximos) {
    const ctx = { owner: p.medicoId };
    const podeEditar  = Permissions.can('editarPlantao', user, ctx);
    const podeExcluir = Permissions.can('excluirPlantao', user, ctx);

    const item = UI.h('div', { class: 'item' },
      UI.h('div', { class: 'item-main' },
        UI.h('div', { class: 'item-title' },
          '📍 ', UI.fmtData(p.data), ' · ', (p.inicio || '') + (p.fim ? '–' + p.fim : ''), ' · ', p.turnoLabel || p.turno
        ),
        UI.h('div', { class: 'item-sub' },
          '🏥 ', p.local || p.instituicao || 'Local a definir',
          p.setorNome ? ' · Setor: ' + p.setorNome : '',
          (p.valor != null) ? ' · Valor: R$ ' + Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
          p.medico ? ' · ' + p.medico.nome : ' · Vago'
        )
      ),
      UI.h('div', { style: 'display:flex;gap:6px;align-items:center' },
        UI.badgeStatus(p.status_lifecycle || p.status),
        podeEditar  ? UI.h('button', { class: 'btn btn-ghost btn-sm',  onclick: () => editar(p) }, '✏️ Editar')  : null,
        podeExcluir ? UI.h('button', { class: 'btn btn-danger btn-sm', onclick: () => excluir(p) }, '🗑️ Excluir') : null
      )
    );
    lista.appendChild(item);
  }
  el.appendChild(lista);

  async function editar(p) {
    if (!Permissions.can('editarPlantao', user, { owner: p.medicoId })) {
      return UI.toast('⛔ Seu perfil não pode editar este plantão.', 'err');
    }
    if (typeof UI.modalPlantaoDetalhes === 'function') {
      await UI.modalPlantaoDetalhes(p, { onSaved: () => renderProximos(el) });
      return;
    }
    const novoLocal = prompt('Instituição/local:', p.local || p.instituicao || '');
    if (novoLocal === null) return;
    try {
      await API.put('/api/plantoes/' + p.id, { local: novoLocal, instituicao: novoLocal });
      UI.toast('✏️ Plantão atualizado.', 'ok');
      renderProximos(el);
    } catch (e) { UI.toast('Erro: ' + e.message, 'erro'); }
  }

  async function excluir(p) {
    if (!Permissions.can('excluirPlantao', user, { owner: p.medicoId })) {
      return UI.toast('⛔ Seu perfil não pode excluir este plantão.', 'err');
    }
    const resumo = (p.data || '—') + ' · ' + (p.turnoLabel || p.turno) + ' · ' + (p.local || p.instituicao || 'Local a definir');
    if (!confirm('Excluir plantão de ' + resumo + '?\n\nIsso removerá os lembretes, alertas e lançamentos financeiros vinculados.')) return;
    UI.loader(true);
    try {
      await API.delete('/api/plantoes/' + p.id);
      UI.toast('🗑️ Plantão excluído. Lembretes e financeiro sincronizados.', 'ok');
      renderProximos(el);
    } catch (e) {
      UI.toast('Erro: ' + e.message, 'erro');
    } finally {
      UI.loader(false);
    }
  }
}

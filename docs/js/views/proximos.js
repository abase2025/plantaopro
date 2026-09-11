/* PlantãoPro — "Próximos plantões" (CRUD: adicionar, editar, excluir)
   Mostra plantões do usuário em ordem cronológica.
*/
async function renderProximos(el) {
  el.innerHTML = '';
  const user = API.getUser();
  if (!user) { location.hash = '#/login'; return; }
  const ehGestor = ['gestor', 'medico_gestor'].includes(user.perfil);

  const header = UI.h('div', { class: 'page-head' },
    UI.h('div', null,
      UI.h('h1', { class: 'page-title' }, '📅 Próximos plantões'),
      UI.h('div', { class: 'page-sub' }, ehGestor ? 'Todos os plantões da equipe — edite, exclua ou adicione novos.' : 'Seus plantões — edite local/data/horário, adicione novos ou exclua.')
    ),
    UI.h('a', { href: '#/cadastro', class: 'btn btn-primary' }, '➕ Adicionar plantão')
  );
  el.appendChild(header);

  const [escalasData] = await Promise.all([API.get('/api/escalas').catch(() => ({ escalas: [] }))]);
  const todos = (escalasData.escalas || []).flatMap(e => (e.plantoes || []).map(p => ({ ...p, escalaTitulo: e.titulo, setorNome: e.setor || p.setor })));
  const meus = ehGestor ? todos : todos.filter(p => p.medicoId === user.id);
  const proximos = meus
    .filter(p => p.data >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => (a.data + 'T' + (a.inicio || '00:00')).localeCompare(b.data + 'T' + (b.inicio || '00:00')));

  if (!proximos.length) {
    el.appendChild(UI.emptyMsg('🗓️', 'Nenhum plantão futuro. Adicione um no botão acima.'));
    return;
  }

  const lista = UI.h('div', { class: 'item-list' });
  for (const p of proximos) {
    const podeEditar = ehGestor || (p.medicoId === user.id && user.perfil === 'medico');
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
        podeEditar ? UI.h('button', { class: 'btn btn-ghost btn-sm', onclick: () => editar(p) }, '✏️ Editar') : null,
        podeEditar ? UI.h('button', { class: 'btn btn-danger btn-sm', onclick: () => excluir(p) }, '🗑️ Excluir') : null
      )
    );
    lista.appendChild(item);
  }
  el.appendChild(lista);

  async function editar(p) {
    // Reaproveita modalPlantaoDetalhes do UI (que já existe). Se não existir, usa prompt minimalista.
    if (typeof UI.modalPlantaoDetalhes === 'function') {
      await UI.modalPlantaoDetalhes(p, { onSaved: () => renderProximos(el) });
      return;
    }
    const novoLocal = prompt('Instituição/local:', p.local || p.instituicao || '');
    if (novoLocal === null) return;
    const novoData = prompt('Data (AAAA-MM-DD):', p.data);
    if (!novoData) return;
    const novoValor = prompt('Valor (R$):', p.valor || '');
    if (novoValor === null) return;
    try {
      await API.put('/api/plantoes/' + p.id, { local: novoLocal, instituicao: novoLocal, data: novoData, valor: parseFloat(String(novoValor).replace(',', '.')) });
      UI.toast('✏️ Plantão atualizado.', 'ok');
      renderProximos(el);
    } catch (e) { UI.toast('Erro: ' + e.message, 'erro'); }
  }

  async function excluir(p) {
    const resumo = (p.data || '—') + ' · ' + (p.turnoLabel || p.turno) + ' · ' + (p.local || p.instituicao || 'Local a definir');
    if (!confirm('Excluir plantão de ' + resumo + '?\n\nIsso removerá também os lembretes, alertas e lançamentos financeiros vinculados.')) return;
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

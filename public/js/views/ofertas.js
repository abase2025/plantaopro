/* ============================================================
   PlantãoPro — View: Ofertas de Plantão
   Após aceitar, o médico preenche data/local/valor do plantão
   ============================================================ */
const _brl = (v) => (v != null ? (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null);

async function renderOfertas(el) {
  el.innerHTML = '';
  const user = API.getUser();
  const ehMedico = user?.perfil === 'medico';

  el.appendChild(UI.h('div', { class: 'page-head' },
    UI.h('div', null,
      UI.h('h1', { class: 'page-title' }, '💼 Ofertas de Plantão'),
      UI.h('div', { class: 'page-sub' }, ehMedico ? 'Pegue plantões disponíveis em um toque' : 'Acompanhe as ofertas abertas e aceitas')
    )
  ));

  let ofertas = [];
  try {
    const data = await API.get('/api/ofertas');
    ofertas = data.ofertas;
  } catch (err) {
    el.appendChild(UI.emptyMsg('⚠️', err.message));
    return;
  }

  const abertas = ofertas.filter((o) => o.status === 'aberta');
  const aceitas = ofertas.filter((o) => o.status === 'aceita');

  el.appendChild(UI.h('div', { class: 'grid cols-3' },
    UI.h('div', { class: 'card stat-card' },
      UI.h('span', { class: 'stat-label' }, 'Ofertas abertas'),
      UI.h('span', { class: 'stat-value' }, String(abertas.length)),
      UI.h('span', { class: 'stat-hint' }, 'disponíveis agora')
    ),
    UI.h('div', { class: 'card stat-card' },
      UI.h('span', { class: 'stat-label' }, 'Aceitas'),
      UI.h('span', { class: 'stat-value' }, String(aceitas.length)),
      UI.h('span', { class: 'stat-hint' }, 'total de aceites')
    )
  ));

  const lista = UI.h('div', { style: 'margin-top:20px' },
    UI.h('h3', null, ehMedico ? 'Disponíveis para você' : 'Histórico de ofertas')
  );

  if (!ofertas.length) {
    lista.appendChild(UI.emptyMsg('💼', 'Nenhuma oferta no momento.'));
  } else {
    lista.appendChild(UI.h('div', { class: 'item-list' }, ofertas.map((o) => {
      const pl = o.plantao || {};
      const main = UI.h('div', { class: 'item-main' },
        UI.h('div', { class: 'item-title' }, UI.fmtData(pl.data), ' · ', pl.turnoLabel || '—'),
        UI.h('div', { class: 'item-sub' },
          'Setor: ' + o.setor,
          pl.local ? ' · Local: ' + pl.local : '',
          pl.valor != null ? ' · Valor: ' + _brl(pl.valor) : '',
          ' · Aberta por: ' + o.criadoPorNome,
          o.aceitoPor ? ' · Aceita por: ' + (o.aceitoPorNome || ('#' + o.aceitoPor)) : ''
        )
      );
      let acao;
      if (ehMedico && o.status === 'aberta') {
        acao = UI.h('button', { class: 'btn btn-accent btn-sm', onclick: () => aceitarOferta(o.id, pl) }, 'Aceitar plantão');
      } else if (ehMedico && o.status === 'aceita' && pl.medicoId === user.id) {
        acao = UI.h('button', { class: 'btn btn-ghost btn-sm', onclick: () => UI.modalPlantaoDetalhes(pl, { afterSave: () => renderOfertas(document.getElementById('view')) }) }, 'Editar detalhes');
      } else {
        acao = UI.badgeStatus(o.status);
      }
      return UI.h('div', { class: 'item' }, main, acao);
    })));
  }
  el.appendChild(lista);
}

async function aceitarOferta(ofertaId, plantao) {
  const m = UI.modal('Confirmar aceite', UI.h('div', null,
    UI.h('p', null, 'Você está assumindo este plantão. A oferta será encerrada e o plantão ficará confirmado em seu nome.' +
      (plantao ? ' Em seguida você poderá preencher a data, o local e o valor.' : '')),
    UI.h('div', { class: 'form-actions' },
      UI.h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancelar'),
      UI.h('button', { class: 'btn btn-accent', onclick: async () => {
        try {
          await API.post('/api/ofertas/' + ofertaId + '/aceitar');
          UI.toast('Plantão garantido! 🎉');
          m.close();
          if (plantao && plantao.id) {
            UI.modalPlantaoDetalhes(plantao, { title: 'Completar dados do plantão', afterSave: () => renderOfertas(document.getElementById('view')) });
          } else {
            renderOfertas(document.getElementById('view'));
          }
        } catch (err) { UI.toast(err.message, 'err'); }
      } }, 'Confirmar aceite')
    )
  ));
}

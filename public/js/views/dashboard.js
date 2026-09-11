/* ============================================================
   PlantãoPro — View: Dashboard (+ lembretes de plantão)
   Alerta no app 1 dia antes de cada plantão (data + local)
   ============================================================ */
async function renderDashboard(el) {
  el.innerHTML = '';
  const user = API.getUser();
  const header = UI.h('div', { class: 'page-head' },
    UI.h('div', null,
      UI.h('h1', { class: 'page-title' }, 'Olá, ' + (user?.nome?.split(' ')[0] || '') + ' 👋'),
      UI.h('div', { class: 'page-sub' }, 'Visão geral da sua operação de plantões')
    )
  );
  el.appendChild(header);

  const [escalasData, ofertasData, horasData] = await Promise.all([
    API.get('/api/escalas').catch(() => ({ escalas: [] })),
    API.get('/api/ofertas').catch(() => ({ ofertas: [] })),
    API.get('/api/horas').catch(() => ({ registros: [], porMedico: [], meusTotais: { minutos: 0, plantoes: 0 } }))
  ]);

  const ehGestor = ['gestor', 'medico_gestor'].includes(user?.perfil);
  const hojeISO = new Date().toISOString().slice(0, 10);
  const amanhaISO = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const todos = escalasData.escalas.flatMap((e) => e.plantoes);
  const proximos = todos
    .filter((p) => p.data >= hojeISO)
    .sort((a, b) => (a.data + a.turno).localeCompare(b.data + b.turno))
    .slice(0, 6);
  const meus = ehGestor ? todos : todos.filter((p) => p.medicoId === user?.id);
  const ofertasAbertas = ofertasData.ofertas.filter((o) => o.status === 'aberta');

  /* ---- Lembrete: alerta 1 dia antes (cada plantão, mostrado uma vez) ---- */
  let amanhaPlantao = null;
  if (!ehGestor) {
    amanhaPlantao = meus.find((p) => p.data === amanhaISO) || null;
    if (amanhaPlantao) {
      const chave = 'pp_alerta_' + amanhaPlantao.id + '_' + amanhaPlantao.data;
      if (!localStorage.getItem(chave)) {
        localStorage.setItem(chave, '1');
        UI.toast('🔔 Lembrete: seu plantão é AMANHÃ em ' + (amanhaPlantao.local || 'local a definir') + ' (' + UI.fmtData(amanhaPlantao.data) + ')', 'warn');
      }
    }
  }

  let checkinCount = 0;
  if (!ehGestor) {
    try {
      const ck = await API.get('/api/checkins');
      checkinCount = ck.checkins.length;
    } catch { /* ignore */ }
  }

  /* ---- Cards de estatísticas ---- */
  const stats = [
    { label: ehGestor ? 'Plantões da equipe' : 'Meus plantões', value: String(meus.length), hint: ehGestor ? 'em todas as escalas' : 'no período atual' },
    { label: 'Ofertas em aberto', value: String(ofertasAbertas.length), hint: 'aguardando aceite' },
    { label: 'Horas registradas', value: ehGestor ? '—' : UI.fmtHoraMin(horasData.meusTotais.minutos), hint: ehGestor ? 'veja no módulo Horas' : 'com check-in neste mês' },
    { label: 'Check-ins feitos', value: ehGestor ? '—' : String(checkinCount), hint: ehGestor ? 'veja no módulo Horas' : 'desde o início' }
  ];

  el.appendChild(UI.h('div', { class: 'grid cols-3' }, stats.map((s) =>
    UI.h('div', { class: 'card stat-card' },
      UI.h('span', { class: 'stat-label' }, s.label),
      UI.h('span', { class: 'stat-value' }, s.value),
      UI.h('span', { class: 'stat-hint' }, s.hint)
    )
  )));

  /* ---- Próximos plantões + lembretes ---- */
  const section = UI.h('div', { style: 'margin-top:20px' },
    UI.h('div', { class: 'card-title-row' },
      UI.h('h3', null, '📅 Próximos plantões', amanhaPlantao ? ' 🔔' : ''),
      UI.h('a', { href: '#/escalas', class: 'btn btn-ghost btn-sm' }, 'Ver escalas')
    )
  );

  if (!proximos.length) {
    section.appendChild(UI.emptyMsg('🗓️', ehGestor ? 'Nenhum plantão agendado ainda. Monte uma escala no módulo Escalas.' : 'Você ainda não tem plantões agendados.'));
  } else {
    section.appendChild(UI.h('div', { class: 'item-list' }, proximos.map((p) => {
      const ehAmanha = p.data === amanhaISO;
      const localTxt = p.local || 'local a definir';
      const valorTxt = p.valor != null ? ' · Valor: R$ ' + Number(p.valor).toLocaleString('pt-BR') : '';
      return UI.h('div', { class: 'item' },
        UI.h('div', { class: 'item-main' },
          UI.h('div', { class: 'item-title' },
            UI.fmtData(p.data), ' · ', p.turnoLabel || p.turno,
            ehAmanha ? '  ·  ' + UI.h('span', { class: 'badge badge-perigo' }, '🔔 Amanhã') : ''
          ),
          UI.h('div', { class: 'item-sub' }, 'Setor: ' + (p.setorNome || '—'), ' · Local: ' + localTxt, valorTxt, ' · ', p.medico ? p.medico.nome : 'Vago')
        ),
        UI.badgeStatus(p.status)
      );
    })));
  }
  el.appendChild(section);

  /* ---- Ofertas em aberto (médico) ---- */
  if (!ehGestor && ofertasAbertas.length) {
    const off = UI.h('div', { style: 'margin-top:20px' },
      UI.h('div', { class: 'card-title-row' },
        UI.h('h3', null, '💼 Ofertas para você'),
        UI.h('a', { href: '#/ofertas', class: 'btn btn-ghost btn-sm' }, 'Ver todas')
      )
    );
    off.appendChild(UI.h('div', { class: 'grid cols-2' }, ofertasAbertas.slice(0, 4).map((o) =>
      UI.h('div', { class: 'card', style: 'padding:14px' },
        UI.h('div', { style: 'font-weight:700' }, UI.fmtData(o.plantao?.data), ' · ', o.plantao?.turnoLabel),
        UI.h('div', { class: 'page-sub', style: 'margin:2px 0 10px' }, 'Setor: ' + o.setor),
        UI.h('a', { href: '#/ofertas', class: 'btn btn-accent btn-sm' }, 'Aceitar plantão')
      )
    )));
    el.appendChild(off);
  }

  el.appendChild(UI.h('footer', { class: 'page-foot' }, 'PlantãoPro · protótipo inspirado no GoMeds 🏥 · Lembretes exibidos aqui no app 1 dia antes de cada plantão'));
}

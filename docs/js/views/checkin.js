/* ============================================================
   PlantãoPro — View: Check-in de Plantão (médico)
   ============================================================ */
async function renderCheckin(el) {
  el.innerHTML = '';
  el.appendChild(UI.h('div', { class: 'page-head' },
    UI.h('div', null,
      UI.h('h1', { class: 'page-title' }, '📍 Check-in de Plantão'),
      UI.h('div', { class: 'page-sub' }, 'Confirme sua presença para registrar as horas trabalhadas')
    )
  ));

  let escalas = [], meusCheckins = [];
  try {
    const [e, c] = await Promise.all([
      API.get('/api/escalas').catch(() => ({ escalas: [] })),
      API.get('/api/checkins').catch(() => ({ checkins: [] }))
    ]);
    escalas = e.escalas; meusCheckins = c.checkins;
  } catch (err) {
    el.appendChild(UI.emptyMsg('⚠️', err.message));
    return;
  }

  const user = API.getUser();
  const meus = escalas.flatMap((es) => es.plantoes).filter((p) => p.medicoId === user?.id);
  const feitos = new Set(meusCheckins.map((c) => c.plantaoId));
  const hoje = new Date().toISOString().slice(0, 10);

  const pendentes = meus
    .filter((p) => !feitos.has(p.id))
    .sort((a, b) => (a.data + a.turno).localeCompare(b.data + b.turno));

  el.appendChild(UI.h('div', { style: 'margin-top:6px' },
    UI.h('h3', null, '🕒 Plantões aguardando check-in')
  ));

  if (!pendentes.length) {
    el.appendChild(UI.emptyMsg('✅', 'Nenhum plantão pendente de check-in. Você está em dia!'));
  } else {
    el.appendChild(UI.h('div', { class: 'item-list' }, pendentes.map((p) => {
      const isHoje = p.data === hoje;
      return UI.h('div', { class: 'item' },
        UI.h('div', { class: 'item-main' },
          UI.h('div', { class: 'item-title' }, UI.fmtData(p.data), isHoje ? '  ·  🔴 Hoje' : '', ' · ', p.turnoLabel || p.turno),
          UI.h('div', { class: 'item-sub' }, 'Setor: ' + (p.setorNome || '—'))
        ),
        UI.h('button', { class: 'btn btn-primary btn-sm', onclick: () => fazerCheckin(p.id) }, 'Fazer check-in')
      );
    })));
  }

  if (meusCheckins.length) {
    const historico = UI.h('div', { style: 'margin-top:20px' },
      UI.h('h3', null, '📜 Histórico de check-ins')
    );
    historico.appendChild(UI.h('div', { class: 'item-list' }, meusCheckins.slice().reverse().map((c) =>
      UI.h('div', { class: 'item' },
        UI.h('div', { class: 'item-main' },
          UI.h('div', { class: 'item-title' }, UI.fmtDataHora(c.dataHora)),
          UI.h('div', { class: 'item-sub' }, 'Plantão #' + c.plantaoId)
        ),
        UI.h('span', { class: 'badge badge-ok' }, '✓ Realizado')
      )
    )));
    el.appendChild(historico);
  }
}

async function fazerCheckin(plantaoId) {
  try {
    await API.post('/api/checkins', { plantaoId });
    UI.toast('Check-in realizado! Data e hora registradas ✅');
    renderCheckin(document.getElementById('view'));
  } catch (err) { UI.toast(err.message, 'err'); }
}

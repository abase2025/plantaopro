/* ============================================================
   PlantãoPro — View: Horas Trabalhadas
   ============================================================ */
async function renderHoras(el) {
  el.innerHTML = '';
  const user = API.getUser();
  const ehGestor = ['gestor', 'medico_gestor'].includes(user?.perfil);

  el.appendChild(UI.h('div', { class: 'page-head' },
    UI.h('div', null,
      UI.h('h1', { class: 'page-title' }, '⏱️ Horas Trabalhadas'),
      UI.h('div', { class: 'page-sub' }, ehGestor ? 'Acompanhe as horas da equipe (apenas com check-in)' : 'Seu saldo de horas (apenas com check-in)')
    )
  ));

  let data = { registros: [], porMedico: [], meusTotais: { minutos: 0, plantoes: 0, detalhes: [] } };
  try {
    data = await API.get('/api/horas');
  } catch (err) {
    el.appendChild(UI.emptyMsg('⚠️', err.message));
    return;
  }

  if (ehGestor) {
    el.appendChild(UI.h('div', { class: 'grid cols-3' },
      UI.h('div', { class: 'card stat-card' },
        UI.h('span', { class: 'stat-label' }, 'Médicos com horas'),
        UI.h('span', { class: 'stat-value' }, String(data.porMedico.length)),
        UI.h('span', { class: 'stat-hint' }, 'que já fizeram check-in')
      ),
      UI.h('div', { class: 'card stat-card' },
        UI.h('span', { class: 'stat-label' }, 'Plantões realizados'),
        UI.h('span', { class: 'stat-value' }, String(data.registros.filter((r) => r.fezCheckin).length)),
        UI.h('span', { class: 'stat-hint' }, 'com check-in confirmado')
      )
    ));

    const tbl = UI.h('div', { class: 'card', style: 'margin-top:20px' },
      UI.h('h3', null, '👨‍⚕️ Resumo por médico'),
      UI.h('div', { class: 'table-wrap' },
        UI.h('table', null,
          UI.h('thead', null, UI.h('tr', null,
            UI.h('th', null, 'Médico'), UI.h('th', null, 'Plantões'), UI.h('th', null, 'Horas'))
          ),
          UI.h('tbody', null, data.porMedico.length
            ? data.porMedico.map((m) => UI.h('tr', null,
                UI.h('td', null, m.medicoNome),
                UI.h('td', null, String(m.plantoes)),
                UI.h('td', null, UI.h('strong', null, UI.fmtHoraMin(m.minutos)))
              ))
            : UI.h('tr', null, UI.h('td', { colspan: '3' }, 'Nenhum registro com check-in ainda.'))
          )
        )
      )
    );
    el.appendChild(tbl);

    const det = UI.h('div', { class: 'card', style: 'margin-top:20px' },
      UI.h('h3', null, '🧾 Registros detalhados'),
      UI.h('div', { class: 'table-wrap' },
        UI.h('table', null,
          UI.h('thead', null, UI.h('tr', null,
            UI.h('th', null, 'Data'), UI.h('th', null, 'Turno'), UI.h('th', null, 'Setor'), UI.h('th', null, 'Médico'), UI.h('th', null, 'Check-in'), UI.h('th', null, 'Horas'))
          ),
          UI.h('tbody', null, data.registros.length
            ? data.registros.map((r) => UI.h('tr', null,
                UI.h('td', null, UI.fmtData(r.data)),
                UI.h('td', null, r.turnoLabel),
                UI.h('td', null, r.setor),
                UI.h('td', null, r.medicoNome),
                UI.h('td', null, r.fezCheckin ? UI.h('span', { class: 'badge badge-ok' }, '✓') : UI.h('span', { class: 'badge badge-aberto' }, 'Pendente')),
                UI.h('td', null, r.fezCheckin ? UI.fmtHoraMin(r.horas) : '—')
              ))
            : UI.h('tr', null, UI.h('td', { colspan: '6' }, 'Nenhum registro.'))
          )
        )
      )
    );
    el.appendChild(det);
  } else {
    const t = data.meusTotais;
    el.appendChild(UI.h('div', { class: 'grid cols-3' },
      UI.h('div', { class: 'card stat-card' },
        UI.h('span', { class: 'stat-label' }, 'Total de horas'),
        UI.h('span', { class: 'stat-value' }, UI.fmtHoraMin(t.minutos)),
        UI.h('span', { class: 'stat-hint' }, 'com check-in')
      ),
      UI.h('div', { class: 'card stat-card' },
        UI.h('span', { class: 'stat-label' }, 'Plantões realizados'),
        UI.h('span', { class: 'stat-value' }, String(t.plantoes)),
        UI.h('span', { class: 'stat-hint' }, 'confirmados'
        )
      )
    ));

    const det = UI.h('div', { class: 'card', style: 'margin-top:20px' },
      UI.h('h3', null, '🧾 Detalhes das horas'),
      UI.h('div', { class: 'table-wrap' },
        UI.h('table', null,
          UI.h('thead', null, UI.h('tr', null,
            UI.h('th', null, 'Data'), UI.h('th', null, 'Turno'), UI.h('th', null, 'Setor'), UI.h('th', null, 'Horas'))
          ),
          UI.h('tbody', null, t.detalhes.length
            ? t.detalhes.map((d) => UI.h('tr', null,
                UI.h('td', null, UI.fmtData(d.data)),
                UI.h('td', null, d.turnoLabel),
                UI.h('td', null, d.setor),
                UI.h('td', null, UI.fmtHoraMin(d.horas))
              ))
            : UI.h('tr', null, UI.h('td', { colspan: '4' }, 'Você ainda não tem horas registradas. Faça o check-in dos seus plantões!'))
          )
        )
      )
    );
    el.appendChild(det);
  }
}

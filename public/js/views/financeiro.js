/* ============================================================
   PlantãoPro — View: Financeiro (Honorários por plantão)
   Cálculo por plantão (valor padrão ou valor definido pelo médico),
   status: Previsto / A receber / Recebido (baixa após pagamento).
   Gera relatório em PDF (jsPDF + autotable, client-side).
   ============================================================ */
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function fmtBRL(v) { return BRL.format(v || 0); }
function fmtDataL(iso) {
  if (!iso) return '—';
  const p = String(iso).split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

let finData = null; // cache usado pelo PDF

async function renderFinanceiro(el) {
  el.innerHTML = '';
  const user = API.getUser();
  const podeEditar = ['gestor', 'medico_gestor'].includes(user?.perfil);

  el.appendChild(UI.h('div', { class: 'page-head' },
    UI.h('div', null,
      UI.h('h1', { class: 'page-title' }, '💰 Financeiro — Honorários'),
      UI.h('div', { class: 'page-sub' }, podeEditar
        ? 'Configure valores e descontos, acompanhe a receber/recebido e gere o relatório'
        : 'Seus honorários: saiba o quanto vai receber e dê baixa depois do pagamento')
    ),
    UI.h('button', { class: 'btn btn-primary', onclick: gerarRelatorioPDF }, '🖨️ Gerar relatório PDF')
  ));

  let config = null, honor = null;
  try {
    const [c, h] = await Promise.all([
      API.get('/api/financeiro/config'),
      API.get('/api/financeiro/honorarios')
    ]);
    config = c.financeiro; honor = h;
  } catch (err) {
    el.appendChild(UI.emptyMsg('⚠️', err.message));
    return;
  }
  finData = { config, honor, podeEditar };

  /* ---- Estatísticas: Recebido / A receber / Previsto / Descontos ---- */
  el.appendChild(UI.h('div', { class: 'grid cols-3' },
    statCard('💰 Recebido', fmtBRL(honor.totais.recebido), 'com baixa (pago)'),
    statCard('⏳ A receber', fmtBRL(honor.totais.aReceber), honor.totais.plantoesPagos + ' pagos de ' + honor.totais.plantoesRealizados + ' realizados'),
    statCard('📅 Previsto', fmtBRL(honor.totais.previsto), honor.totais.plantoes + ' plantões confirmados'),
    statCard('🧾 Descontos (ISS+IR)', fmtBRL(honor.totais.descontos), honor.totais.plantoesRealizados + ' realizados')
  ));

  if (podeEditar) el.appendChild(cardConfig(config));

  /* ---- Resumo por médico ---- */
  const porMed = UI.h('div', { class: 'card', style: 'margin-top:20px' },
    UI.h('h3', null, '👨‍⚕️ Resumo por médico'),
    UI.h('div', { class: 'table-wrap' },
      UI.h('table', null,
        UI.h('thead', null, UI.h('tr', null,
          UI.h('th', null, 'Médico'), UI.h('th', null, 'Plantões'), UI.h('th', null, 'Bruto'), UI.h('th', null, 'Descontos'), UI.h('th', null, 'A receber'), UI.h('th', null, 'Recebido'))
        ),
        UI.h('tbody', null, honor.porMedico.length
          ? honor.porMedico.map((m) => UI.h('tr', null,
              UI.h('td', null, UI.h('strong', null, m.medicoNome)),
              UI.h('td', null, String(m.plantoes)),
              UI.h('td', null, fmtBRL(m.bruto)),
              UI.h('td', null, fmtBRL(m.descontos)),
              UI.h('td', null, fmtBRL(m.aReceber)),
              UI.h('td', null, UI.h('strong', null, fmtBRL(m.recebido)))
            ))
          : UI.h('tr', null, UI.h('td', { colspan: '6' }, 'Nenhum plantão confirmado com médico alocado.'))
        )
      )
    )
  );
  el.appendChild(porMed);

  /* ---- Tabela de honorários por plantão + baixa ---- */
  const tbl = UI.h('div', { class: 'card', style: 'margin-top:20px' },
    UI.h('h3', null, '🧾 Honorários por plantão'),
    UI.h('div', { class: 'table-wrap' },
      UI.h('table', null,
        UI.h('thead', null, UI.h('tr', null,
          UI.h('th', null, 'Data'), UI.h('th', null, 'Turno'), UI.h('th', null, 'Setor'), UI.h('th', null, 'Médico'), UI.h('th', null, 'Local'),
          UI.h('th', null, 'Base'), UI.h('th', null, '+Adic.Not.'), UI.h('th', null, '+Adic.Fer.'),
          UI.h('th', null, '−ISS'), UI.h('th', null, '−IR'), UI.h('th', null, 'Líquido'), UI.h('th', null, 'Pagamento'))
        ),
        UI.h('tbody', null, honor.registros.length
          ? honor.registros.map((r) => UI.h('tr', null,
              UI.h('td', null, fmtDataL(r.data)),
              UI.h('td', null, r.turnoLabel),
              UI.h('td', null, r.setor),
              UI.h('td', null, r.medicoNome),
              UI.h('td', null, r.local || '—'),
              UI.h('td', null, fmtBRL(r.valorBase)),
              UI.h('td', null, r.adicionalNoturno ? fmtBRL(r.adicionalNoturno) : '—'),
              UI.h('td', null, r.adicionalFeriado ? fmtBRL(r.adicionalFeriado) : '—'),
              UI.h('td', null, r.iss ? fmtBRL(r.iss) : '—'),
              UI.h('td', null, r.ir ? fmtBRL(r.ir) : '—'),
              UI.h('td', null, UI.h('strong', null, fmtBRL(r.valorLiquido))),
              UI.h('td', null, celulaPagamento(r))
            ))
          : UI.h('tr', null, UI.h('td', { colspan: '12' }, 'Nenhum plantão confirmado para calcular.'))
        )
      )
    )
  );
  el.appendChild(tbl);

  el.appendChild(UI.h('footer', { class: 'page-foot' },
    '💡 Valores base e percentuais são configurações do sistema. O valor de cada plantão pode ser definido pelo médico ao aceitar a oferta.'
  ));
}

function celulaPagamento(r) {
  if (r.pago) return UI.h('span', { class: 'badge badge-ok' }, '✓ Pago');
  const container = UI.h('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' });
  if (r.realizado) {
    container.appendChild(UI.h('span', { class: 'badge badge-aberto' }, 'A receber'));
    container.appendChild(UI.h('button', { class: 'btn btn-primary btn-sm', onclick: () => darBaixa(r) }, 'Dar baixa'));
  } else {
    container.appendChild(UI.h('span', { class: 'badge badge-info' }, 'Previsto'));
  }
  return container;
}

async function darBaixa(r) {
  const m = UI.modal('Dar baixa no pagamento', UI.h('div', null,
    UI.h('p', null, 'Confirma que o valor de ', UI.h('strong', null, fmtBRL(r.valorLiquido)), ' deste plantão (', fmtDataL(r.data), ' · ', r.turnoLabel, ') já foi pago?'),
    UI.h('div', { class: 'form-actions' },
      UI.h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancelar'),
      UI.h('button', { class: 'btn btn-primary', onclick: async () => {
        try {
          await API.post('/api/plantoes/' + r.plantaoId + '/pagar');
          UI.toast('Baixa registrada! Valor marcado como pago ✅');
          m.close();
          renderFinanceiro(document.getElementById('view'));
        } catch (err) { UI.toast(err.message, 'err'); }
      } }, 'Confirmar baixa')
    )
  ));
}

function statCard(label, value, hint) {
  return UI.h('div', { class: 'card stat-card' },
    UI.h('span', { class: 'stat-label' }, label),
    UI.h('span', { class: 'stat-value' }, value),
    UI.h('span', { class: 'stat-hint' }, hint)
  );
}

/* ---------- Formulário de configuração (gestor / médico gestor) ---------- */
function cardConfig(config) {
  const t = (sel) => sel ? '✅ Sim' : '—';
  const valorTipo = UI.h('select', null,
    UI.h('option', { value: 'valor_plantao', selected: config.valorTipo === 'valor_plantao' ? true : null }, 'Valor fixo por plantão'),
    UI.h('option', { value: 'valor_hora', selected: config.valorTipo === 'valor_hora' ? true : null }, 'Valor por hora')
  );
  const valorPlantao = UI.h('input', { type: 'number', min: '0', step: '10', value: config.valorPlantao });
  const valorHora = UI.h('input', { type: 'number', min: '0', step: '1', value: config.valorHora });
  const addNot = UI.h('input', { type: 'number', min: '0', max: '200', step: '1', value: config.adicionalNoturnoPct });
  const addFer = UI.h('input', { type: 'number', min: '0', max: '200', step: '1', value: config.adicionalFeriadoPct });
  const issP = UI.h('input', { type: 'number', min: '0', max: '40', step: '0.1', value: config.issPct });
  const irP = UI.h('input', { type: 'number', min: '0', max: '40', step: '0.1', value: config.irPct });
  const uAN = UI.h('input', { type: 'checkbox', checked: config.usarAdicionalNoturno ? true : null });
  const uAF = UI.h('input', { type: 'checkbox', checked: config.usarAdicionalFeriado ? true : null });
  const uISS = UI.h('input', { type: 'checkbox', checked: config.usarIss ? true : null });
  const uIR = UI.h('input', { type: 'checkbox', checked: config.usarIr ? true : null });

  const form = UI.h('form', {},
    UI.h('div', { class: 'input-row' },
      UI.h('div', null, UI.h('label', null, 'Base de cálculo'), valorTipo),
      UI.h('div', null, UI.h('label', null, 'Valor fixo por plantão (R$)'), valorPlantao)
    ),
    UI.h('div', { class: 'input-row' },
      UI.h('div', null, UI.h('label', null, 'Valor por hora (R$)'), valorHora),
      UI.h('div', null, UI.h('label', null, 'Adicional noturno (%)'), addNot)
    ),
    UI.h('div', { class: 'input-row' },
      UI.h('div', null, UI.h('label', null, 'Adicional feriado (%)'), addFer),
      UI.h('div', null, UI.h('label', null, 'ISS (%)'), issP)
    ),
    UI.h('div', { class: 'input-row' },
      UI.h('div', null, UI.h('label', null, 'IR (%)'), irP),
      UI.h('div', null, UI.h('label', null, 'Aplicar adicional noturno'), uAN)
    ),
    UI.h('div', { class: 'input-row' },
      UI.h('div', null, UI.h('label', null, 'Aplicar adicional feriado'), uAF),
      UI.h('div', null, UI.h('label', null, 'Aplicar ISS'), uISS)
    ),
    UI.h('div', { class: 'input-row' },
      UI.h('div', null, UI.h('label', null, 'Aplicar IR'), uIR),
      UI.h('div', null)
    ),
    UI.h('div', { class: 'form-actions' },
      UI.h('button', { type: 'submit', class: 'btn btn-primary', style: 'flex:1' }, '💾 Salvar configuração')
    ),
    UI.h('div', { class: 'page-sub', style: 'margin-top:10px' },
      'Situação atual: base=' + (config.valorTipo === 'valor_hora' ? fmtBRL(config.valorHora) + '/hora' : fmtBRL(config.valorPlantao) + '/plantão'),
      ' · Noturno: ' + t(config.usarAdicionalNoturno) + ' (' + config.adicionalNoturnoPct + '%)',
      ' · Feriado: ' + t(config.usarAdicionalFeriado) + ' (' + config.adicionalFeriadoPct + '%)',
      ' · ISS: ' + t(config.usarIss) + ' (' + config.issPct + '%)',
      ' · IR: ' + t(config.usarIr) + ' (' + config.irPct + '%)'
    )
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await API.put('/api/financeiro/config', {
        valorTipo: valorTipo.value,
        valorPlantao: Number(valorPlantao.value),
        valorHora: Number(valorHora.value),
        adicionalNoturnoPct: Number(addNot.value),
        adicionalFeriadoPct: Number(addFer.value),
        issPct: Number(issP.value),
        irPct: Number(irP.value),
        usarAdicionalNoturno: uAN.checked,
        usarAdicionalFeriado: uAF.checked,
        usarIss: uISS.checked,
        usarIr: uIR.checked
      });
      UI.toast('Configuração salva! Cálculos atualizados ✅');
      renderFinanceiro(document.getElementById('view'));
    } catch (err) { UI.toast(err.message, 'err'); }
  });

  return UI.h('div', { class: 'card', style: 'margin-top:20px' },
    UI.h('h3', null, '⚙️ Configuração de honorários'),
    form
  );
}

/* ---------- Geração de PDF (jsPDF + autotable, client-side) ---------- */
async function gerarRelatorioPDF() {
  if (!finData || !finData.honor) { UI.toast('Os dados ainda não carregaram. Tente novamente.', 'warn'); return; }
  if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
    UI.toast('Biblioteca de PDF indisponível — verifique sua conexão com a internet.', 'err');
    return;
  }
  const { config, honor } = finData;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('l', 'pt', 'a4');

  doc.setFontSize(16); doc.setTextColor(13, 122, 102);
  doc.text('🏥 PlantãoPro — Relatório de Honorários', 40, 42);
  doc.setFontSize(9); doc.setTextColor(90);
  doc.text('Gerado em: ' + new Date().toLocaleString('pt-BR'), 40, 58);
  doc.text('Base: ' + (config.valorTipo === 'valor_hora' ? fmtBRL(config.valorHora) + ' por hora' : fmtBRL(config.valorPlantao) + ' por plantão') +
    '  |  Adic. noturno: ' + (config.usarAdicionalNoturno ? config.adicionalNoturnoPct + '%' : '—') +
    '  |  Adic. feriado: ' + (config.usarAdicionalFeriado ? config.adicionalFeriadoPct + '%' : '—') +
    '  |  ISS: ' + (config.usarIss ? config.issPct + '%' : '—') +
    '  |  IR: ' + (config.usarIr ? config.irPct + '%' : '—'), 40, 73);

  const head = [['Data', 'Turno', 'Setor', 'Médico', 'Local', 'Base', 'Adic. Not.', 'Adic. Fer.', 'ISS', 'IR', 'Líquido', 'Pagamento']];
  const body = honor.registros.map((r) => [
    fmtDataL(r.data), r.turnoLabel, r.setor, r.medicoNome, r.local || '—',
    fmtBRL(r.valorBase), r.adicionalNoturno ? fmtBRL(r.adicionalNoturno) : '—', r.adicionalFeriado ? fmtBRL(r.adicionalFeriado) : '—',
    r.iss ? fmtBRL(r.iss) : '—', r.ir ? fmtBRL(r.ir) : '—', fmtBRL(r.valorLiquido),
    r.pago ? 'Pago' : (r.realizado ? 'A receber' : 'Previsto')
  ]);
  doc.autoTable({
    head, body,
    startY: 88,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [13, 122, 102], fontSize: 8 },
    alternateRowStyles: { fillColor: [240, 247, 245] },
    theme: 'striped'
  });

  let y = doc.lastAutoTable.finalY + 16;
  doc.setFontSize(12); doc.setTextColor(13, 122, 102);
  doc.text('Resumo financeiro', 40, y);
  doc.autoTable({
    startY: y + 6,
    body: [
      ['Total previsto (plantões confirmados)', fmtBRL(honor.totais.previsto)],
      ['Total a receber (realizados pendentes)', fmtBRL(honor.totais.aReceber)],
      ['Total recebido (com baixa)', fmtBRL(honor.totais.recebido)],
      ['Descontos totais (ISS + IR)', fmtBRL(honor.totais.descontos)],
      ['Plantões realizados / pagos', String(honor.totais.plantoesRealizados) + ' de ' + String(honor.totais.plantoes) + ' / ' + String(honor.totais.plantoesPagos)]
    ],
    styles: { fontSize: 9, fontStyle: 'bold', cellPadding: 4 },
    columnStyles: { 0: { cellWidth: 300 } }
  });

  y = doc.lastAutoTable.finalY + 16;
  doc.setFontSize(12); doc.setTextColor(13, 122, 102);
  doc.text('Resumo por médico', 40, y);
  doc.autoTable({
    startY: y + 6,
    head: [['Médico', 'Plantões', 'Bruto', 'Descontos', 'A receber', 'Recebido']],
    body: honor.porMedico.map((m) => [m.medicoNome, String(m.plantoes), fmtBRL(m.bruto), fmtBRL(m.descontos), fmtBRL(m.aReceber), fmtBRL(m.recebido)]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [13, 122, 102], fontSize: 8 }
  });

  const fy = doc.lastAutoTable ? doc.lastAutoTable.finalY : doc.internal.pageSize.getHeight() - 30;
  doc.setFontSize(8); doc.setTextColor(130);
  doc.text('Documento gerado pelo PlantãoPro (protótipo) — valores conforme configuração informada e baixas realizadas pelos médicos.', 40, fy + 20);

  doc.save('honorarios-plantaopro.pdf');
  UI.toast('Relatório PDF gerado! 📄');
}

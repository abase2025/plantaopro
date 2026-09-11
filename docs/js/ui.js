/* ============================================================
   PlantãoPro — Helpers de UI (h, toast, modal, loader, formatos)
   ============================================================ */
const UI = (() => {

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  /* ---------- Toast ---------- */
  function toast(msg, tipo = 'ok') {
    const root = document.getElementById('toast-root');
    const t = h('div', { class: 'toast ' + tipo }, msg);
    root.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 3200);
    setTimeout(() => t.remove(), 3600);
  }

  /* ---------- Modal ---------- */
  function modal(title, bodyNode, opts = {}) {
    closeModal();
    const backdrop = h('div', { class: 'modal-backdrop' });
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop && !opts.static) closeModal(); });
    const closeBtn = h('button', { class: 'modal-close', 'aria-label': 'Fechar', onclick: closeModal }, '×');
    const head = h('div', { class: 'modal-head' }, h('h3', null, title), closeBtn);
    const box = h('div', { class: 'modal' }, head, bodyNode);
    backdrop.appendChild(box);
    document.getElementById('modal-root').appendChild(backdrop);
    return { close: closeModal, backdrop, box };
  }
  function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  }

  /* ---------- Loader ---------- */
  function loader(on) { document.getElementById('loader').classList.toggle('hidden', !on); }

  /* ---------- Formatos ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  function fmtData(iso) {
    if (!iso) return '—';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  function fmtDataHora(iso) {
    if (!iso) return '—';
    const dt = new Date(iso);
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }
  function fmtHoraMin(min) {
    const m = Number(min) || 0;
    const hs = Math.floor(m / 60), ms = m % 60;
    return `${hs}h${pad(ms)}`;
  }
  const PERFIL_LABEL = { gestor: 'Gestor', medico_gestor: 'Médico Gestor', medico: 'Médico' };
  function perfilLabel(p) { return PERFIL_LABEL[p] || p; }
  function perfilBadge(p) {
    return h('span', { class: 'badge badge-perfil-' + p }, perfilLabel(p));
  }
  function badgeStatus(status) {
    const map = {
      confirmado: ['badge-ok', 'Confirmado'],
      aberto: ['badge-aberto', 'Em aberto'],
      aceita: ['badge-aberto', 'Oferta aceita'],
      cancelado: ['badge-perigo', 'Cancelado'],
      realizada: ['badge-info', 'Realizado']
    };
    const [cls, label] = map[status] || ['badge-info', status];
    return h('span', { class: 'badge ' + cls }, label);
  }
  function emptyMsg(icon, texto) {
    return h('div', { class: 'empty' }, h('span', { class: 'empty-icon' }, icon), texto);
  }

  /* ---------- Modal de detalhes do plantão (data / local / valor) ---------- */
  async function modalPlantaoDetalhes(plantao, opts = {}) {
    const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const dataIn = h('input', { type: 'date', value: plantao.data || '', required: true });
    const localIn = h('input', { type: 'text', value: plantao.local || '', placeholder: 'Ex.: Hospital Central — Ala B' });
    const valorIn = h('input', { type: 'number', min: '0', step: '10', value: plantao.valor != null ? plantao.valor : '' });
    const info = h('div', { class: 'page-sub', style: 'margin:10px 0' },
      'Plantão #' + plantao.id + (plantao.turnoLabel ? ' · ' + plantao.turnoLabel : '') + (plantao.valor != null ? ' · valor atual: ' + brl(plantao.valor) : '')
    );
    const form = h('form', {},
      info,
      h('label', null, 'Data do plantão'), dataIn,
      h('label', null, 'Local do plantão'), localIn,
      h('label', null, 'Valor do plantão (R$) — vazio usa o valor padrão'), valorIn,
      h('div', { class: 'form-actions' },
        h('button', { type: 'submit', class: 'btn btn-primary', style: 'flex:1' }, 'Salvar detalhes')
      )
    );
    const m = modal(opts.title || 'Detalhes do plantão', form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await API.put('/api/plantoes/' + plantao.id, {
          data: dataIn.value,
          local: (localIn.value || '').trim() || null,
          valor: valorIn.value === '' ? null : Number(valorIn.value)
        });
        toast('Plantão atualizado! ✅');
        m.close();
        if (opts.afterSave) opts.afterSave();
      } catch (err) { toast(err.message, 'err'); }
    });
  }

  return { h, esc, toast, modal, closeModal, loader, fmtData, fmtDataHora, fmtHoraMin, perfilLabel, perfilBadge, badgeStatus, emptyMsg, modalPlantaoDetalhes };
})();

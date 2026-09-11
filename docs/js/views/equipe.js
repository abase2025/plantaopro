/* ============================================================
   PlantãoPro — View: Equipe (gestor / médico gestor)
   ============================================================ */
async function renderEquipe(el) {
  el.innerHTML = '';
  const user = API.getUser();
  const ehGestor = user?.perfil === 'gestor';

  const head = UI.h('div', { class: 'page-head' },
    UI.h('div', null,
      UI.h('h1', { class: 'page-title' }, '👥 Equipe'),
      UI.h('div', { class: 'page-sub' }, 'Médicos, setores e perfis de acesso')
    ),
    ehGestor ? UI.h('button', { class: 'btn btn-primary', onclick: modalNovoMembro }, '+ Novo membro') : null
  );
  el.appendChild(head);

  let usuarios = [];
  try {
    const a = await API.get('/api/usuarios');
    usuarios = a.usuarios;
  } catch (err) {
    el.appendChild(UI.emptyMsg('⚠️', err.message));
    return;
  }

  const card = UI.h('div', { class: 'card' },
    UI.h('h3', null, 'Membros (' + usuarios.length + ')'),
    UI.h('div', { class: 'table-wrap' },
      UI.h('table', null,
        UI.h('thead', null, UI.h('tr', null,
          UI.h('th', null, 'Nome'), UI.h('th', null, 'E-mail'), UI.h('th', null, 'Perfil'), UI.h('th', null, 'Setor'))
        ),
        UI.h('tbody', null, usuarios.length
          ? usuarios.map((u) => UI.h('tr', null,
              UI.h('td', null, UI.h('strong', null, u.nome)),
              UI.h('td', null, u.email),
              UI.h('td', null, UI.perfilBadge(u.perfil)),
              UI.h('td', null, u.setor || '—')
            ))
          : UI.h('tr', null, UI.h('td', { colspan: '4' }, 'Nenhum membro cadastrado.'))
        )
      )
    )
  );
  el.appendChild(card);
}

function modalNovoMembro() {
  const nome = UI.h('input', { type: 'text', placeholder: 'Nome completo', required: true });
  const email = UI.h('input', { type: 'email', placeholder: 'seu@email.com', required: true });
  const senha = UI.h('input', { type: 'password', placeholder: 'Mínimo 6 caracteres', required: true });
  const perfil = UI.h('select', null,
    UI.h('option', { value: 'medico' }, 'Médico'),
    UI.h('option', { value: 'medico_gestor' }, 'Médico Gestor'),
    UI.h('option', { value: 'gestor' }, 'Gestor')
  );
  const setor = UI.h('select', null, UI.h('option', { value: '' }, '— Sem setor —'));

  (async () => {
    try {
      const r = await API.get('/api/setores');
      r.setores.forEach((s) => setor.appendChild(UI.h('option', { value: s.id }, s.nome)));
    } catch { /* ignore */ }
  })();

  const form = UI.h('form', {},
    UI.h('label', null, 'Nome'), nome,
    UI.h('label', null, 'E-mail'), email,
    UI.h('label', null, 'Senha inicial'), senha,
    UI.h('div', { class: 'input-row' },
      UI.h('div', null, UI.h('label', null, 'Perfil'), perfil),
      UI.h('div', null, UI.h('label', null, 'Setor'), setor)
    ),
    UI.h('div', { class: 'form-actions' },
      UI.h('button', { type: 'submit', class: 'btn btn-primary', style: 'flex:1' }, 'Cadastrar membro')
    )
  );

  const m = UI.modal('Novo membro', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await API.post('/api/usuarios', {
        nome: nome.value, email: email.value, senha: senha.value,
        perfil: perfil.value, setorId: setor.value ? Number(setor.value) : null
      });
      UI.toast('Membro cadastrado ✅');
      m.close();
      renderEquipe(document.getElementById('view'));
    } catch (err) { UI.toast(err.message, 'err'); }
  });
}

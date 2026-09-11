/* ============================================================
   PlantãoPro — View: Login / Cadastro / Recuperar senha
   ============================================================ */
async function renderLogin(el) {
  el.innerHTML = '';
  const body = document.createElement('div');
  body.className = 'auth-wrap';

  body.appendChild(UI.h('div', { class: 'auth-card' },
    UI.h('div', { class: 'auth-logo' }, '🏥'),
    UI.h('div', { class: 'auth-title' }, 'Plantão', UI.h('span', null, 'Pro')),
    UI.h('div', { class: 'auth-sub' }, 'Gestão de escalas e plantões médicos'),

    mountFormLogin(body)
  ));
  el.appendChild(body);
}

function mountFormLogin(container) {
  container.dataset.mode = 'login';
  const email = UI.h('input', { type: 'email', placeholder: 'seu@email.com', required: true });
  const senha = UI.h('input', { type: 'password', placeholder: '••••••••', required: true });

  const form = UI.h('form', { id: 'auth-form' },
    UI.h('label', null, 'E-mail'), email,
    UI.h('label', null, 'Senha'), senha,
    UI.h('div', { class: 'form-actions' },
      UI.h('button', { type: 'submit', class: 'btn btn-primary', style: 'flex:1' }, 'Entrar')
    ),
    UI.h('div', { class: 'auth-link' },
      'Não tem conta? ', UI.h('a', { onclick: () => mountFormCadastro(container) }, 'Criar conta'),
      ' · ', UI.h('a', { onclick: () => mountFormRecuperar(container) }, 'Esqueci minha senha')
    )
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const data = await API.post('/api/auth/login', { email: email.value, senha: senha.value });
      API.setToken(data.token);
      API.setUser(data.usuario);
      UI.toast('Bem-vindo(a), ' + data.usuario.nome.split(' ')[0] + '! 👋');
      location.hash = '#/dashboard';
    } catch (err) {
      UI.toast(err.message, 'err');
      btn.disabled = false;
    }
  });

  container.innerHTML = '';
  container.appendChild(form);
  container.appendChild(mountDemoBox(container));
}

function mountDemoBox(container) {
  const demos = [
    ['Gestor', 'gestor@plantaopro.com', 'demo123'],
    ['Médico Gestor', 'medgestor@plantaopro.com', 'demo123'],
    ['Médico', 'medico@plantaopro.com', 'demo123']
  ];
  return UI.h('div', { class: 'demo-box' },
    UI.h('small', null, '🔑 Acessos de demonstração (1 clique):'),
    UI.h('div', { class: 'demo-grid' }, demos.map(([label, email, pass]) =>
      UI.h('button', {
        class: 'demo-chip', type: 'button',
        onclick: () => {
          const f = container.querySelector('#auth-form');
          if (f) {
            f.querySelector('input[type=email]').value = email;
            f.querySelector('input[type=password]').value = pass;
          } else {
            mountFormLogin(container);
            const f2 = container.querySelector('#auth-form');
            f2.querySelector('input[type=email]').value = email;
            f2.querySelector('input[type=password]').value = pass;
          }
        }
      }, label)
    ))
  );
}

function authFormShell(container) {
  container.innerHTML = '';
  const card = UI.h('div', { class: 'auth-card' },
    UI.h('div', { class: 'auth-logo' }, '🏥'),
    UI.h('div', { class: 'auth-title' }, 'Plantão', UI.h('span', null, 'Pro'))
  );
  container.appendChild(card);
  return card;
}

function mountFormCadastro(container) {
  const card = authFormShell(container);
  card.appendChild(UI.h('div', { class: 'auth-sub' }, 'Criar nova conta'));

  const nome = UI.h('input', { type: 'text', placeholder: 'Nome completo', required: true });
  const email = UI.h('input', { type: 'email', placeholder: 'seu@email.com', required: true });
  const senha = UI.h('input', { type: 'password', placeholder: 'Mínimo 6 caracteres', required: true });
  const confirm = UI.h('input', { type: 'password', placeholder: 'Repita a senha', required: true });
  const perfil = UI.h('select', null,
    UI.h('option', { value: 'medico' }, 'Médico'),
    UI.h('option', { value: 'medico_gestor' }, 'Médico Gestor'),
    UI.h('option', { value: 'gestor' }, 'Gestor')
  );
  const setor = UI.h('select', null, UI.h('option', { value: '' }, 'Sem setor (definido pelo gestor)'));

  (async () => {
    try {
      const r = await API.get('/api/setores');
      r.setores.forEach((s) => setor.appendChild(UI.h('option', { value: s.id }, s.nome)));
    } catch { /* sem setores */ }
  })();

  const form = UI.h('form', {},
    UI.h('label', null, 'Nome'), nome,
    UI.h('label', null, 'E-mail'), email,
    UI.h('label', null, 'Senha'), senha,
    UI.h('label', null, 'Confirmar senha'), confirm,
    UI.h('div', { class: 'input-row' },
      UI.h('div', null, UI.h('label', null, 'Perfil'), perfil),
      UI.h('div', null, UI.h('label', null, 'Setor'), setor)
    ),
    UI.h('div', { class: 'form-actions' },
      UI.h('button', { type: 'submit', class: 'btn btn-primary', style: 'flex:1' }, 'Criar conta')
    ),
    UI.h('div', { class: 'auth-link' }, 'Já tem conta? ', UI.h('a', { onclick: () => renderLogin(container.closest('.auth-wrap') || document.getElementById('view')) }, 'Entrar'))
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (senha.value !== confirm.value) return UI.toast('As senhas não conferem.', 'err');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const data = await API.post('/api/auth/register', {
        nome: nome.value, email: email.value, senha: senha.value,
        perfil: perfil.value, setorId: setor.value ? Number(setor.value) : null
      });
      API.setToken(data.token);
      API.setUser(data.usuario);
      UI.toast('Conta criada! Bem-vindo(a) 🎉');
      location.hash = '#/dashboard';
    } catch (err) {
      UI.toast(err.message, 'err');
      btn.disabled = false;
    }
  });

  card.appendChild(form);
}

function mountFormRecuperar(container) {
  const card = authFormShell(container);
  card.appendChild(UI.h('div', { class: 'auth-sub' }, 'Recuperar senha'));

  const email = UI.h('input', { type: 'email', placeholder: 'seu@email.com', required: true });
  const form = UI.h('form', {},
    UI.h('label', null, 'E-mail cadastrado'), email,
    UI.h('div', { class: 'form-actions' },
      UI.h('button', { type: 'submit', class: 'btn btn-primary', style: 'flex:1' }, 'Enviar instruções')
    ),
    UI.h('div', { class: 'auth-link' }, UI.h('a', { onclick: () => renderLogin(container.closest('.auth-wrap') || document.getElementById('view')) }, '← Voltar ao login'))
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await API.post('/api/auth/esqueci-senha', { email: email.value });
      UI.toast('Instruções enviadas (simulado no protótipo).', 'ok');
      renderLogin(container.closest('.auth-wrap') || document.getElementById('view'));
    } catch (err) {
      UI.toast(err.message, 'err');
    }
  });

  card.appendChild(form);
}

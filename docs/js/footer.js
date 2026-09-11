/* ============================================================
   PlantãoPro — Footer global (injetado em TODAS as rotas)
   Texto fixo do autor e dedicatória (grafia preservada).
   ============================================================ */
(function () {
  'use strict';
  const TEXTO = 'Sistema de Gestão de Plantões.';
  const AUTOR = '@harrisoncosta';
  const DEDICADO = '@Mayaramiranda';

  function renderizar() {
    let f = document.getElementById('pp-footer');
    if (!f) {
      f = document.createElement('footer');
      f.id = 'pp-footer';
      f.className = 'pp-footer';
      f.setAttribute('role', 'contentinfo');
      document.body.appendChild(f);
    }
    f.innerHTML =
      '<div class="pp-footer-inner">' +
        '<span class="pp-footer-bio">' + TEXTO + '</span>' +
        '<span class="pp-footer-sep">·</span>' +
        '<span class="pp-footer-autor">Criação: <a href="https://github.com/abase2025" target="_blank" rel="noopener">' + AUTOR + '</a></span>' +
        '<span class="pp-footer-sep">/</span>' +
        '<span class="pp-footer-dedicado">Dedicado: <a href="https://github.com/Mayaramiranda" target="_blank" rel="noopener">' + DEDICADO + '</a></span>' +
      '</div>';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderizar);
  } else {
    renderizar();
  }
  // Hook também após cada troca de rota — assim aparece em TODAS as páginas SPA
  window.addEventListener('hashchange', () => setTimeout(renderizar, 50));
})();

/* PlantãoPro — bootstrap de permissões (chamado no carregamento) */
(function () {
  'use strict';
  if (window.Permissions && typeof window.Permissions.seedDemoUsers === 'function') {
    try { window.Permissions.seedDemoUsers(); } catch (e) { /* ignore */ }
  }
})();

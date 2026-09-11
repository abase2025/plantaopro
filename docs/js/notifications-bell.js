/* PlantãoPro — sino de notificações no topbar (badge incremental) */
(function () {
  'use strict';
  async function refresh() {
    const user = typeof API !== 'undefined' ? API.getUser() : null;
    const badge = document.getElementById('notif-badge');
    if (!user || !badge) return;
    try {
      const r = await API.get('/api/notifications/recentes?unread=1');
      const n = (r?.unread ?? (r?.notificacoes?.length ?? 0));
      if (n > 0) {
        badge.textContent = String(n);
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    } catch { /* offline ok */ }
  }
  document.addEventListener('DOMContentLoaded', () => {
    // Refresh a cada 30s e após cada troca de rota
    setInterval(refresh, 30000);
    window.addEventListener('hashchange', () => setTimeout(refresh, 600));
  });
})();

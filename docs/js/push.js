/* PlantãoPro — Web Push helper
   Em qualquer view, chame: PushUI.mountBtn(anchorElement)
   (chamado pelo dashboard.js)
*/
const PushUI = (() => {
  let _vapid = null;
  async function getVapidKey() {
    if (_vapid) return _vapid;
    try {
      const r = await API.get('/api/push/vapid-public');
      _vapid = r.publicKey;
    } catch (e) {
      _vapid = null;
    }
    return _vapid;
  }
  function b64urlToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
  }
  function urlBase64ToUint8Array(b64) {
    return b64urlToUint8Array(b64);
  }
  async function isSubscribed() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  }
  async function ensureSW() {
    if (!('serviceWorker' in navigator)) throw new Error('Sem suporte a Service Worker neste navegador.');
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      const swUrl = new URL('sw.js', window.location.href).toString();
      reg = await navigator.serviceWorker.register(swUrl, { scope: '/' });
    }
    return reg;
  }
  async function subscribe() {
    const vapidKey = await getVapidKey();
    if (!vapidKey) throw new Error('Backend sem VAPID_PUBLIC configurado.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Permissão negada pelo usuário.');
    const reg = await ensureSW();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    });
    const json = sub.toJSON();
    await API.post('/api/push/subscribe', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }
    });
    return true;
  }
  async function unsubscribe() {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch('/api/push/unsubscribe', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API.getToken() },
      body: JSON.stringify({ endpoint })
    }).catch(() => {});
  }
  async function mountBtn(anchor) {
    anchor.innerHTML = '';
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!supported) { anchor.remove(); return; }
    const vapid = await getVapidKey();
    if (!vapid) {
      const span = document.createElement('span');
      span.className = 'btn btn-muted';
      span.textContent = '🔕 Push (sem VAPID no servidor)';
      anchor.appendChild(span);
      return;
    }
    const subbed = await isSubscribed();
    const btn = document.createElement('button');
    btn.className = 'btn ' + (subbed ? 'btn-muted' : 'btn-primary');
    btn.textContent = subbed ? '🔕 Desativar notificações' : '🔔 Ativar notificações';
    btn.onclick = async () => {
      try {
        if (subbed) { await unsubscribe(); }
        else await subscribe();
        mountBtn(anchor);
      } catch (e) {
        UI.toast && UI.toast('Push: ' + e.message, 'err');
        console.warn('[push]', e);
      }
    };
    anchor.appendChild(btn);
  }
  return { mountBtn, subscribe, unsubscribe, isSubscribed };
})();

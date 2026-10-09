// WP-13 — 기능이 꺼지면 코어가 1번 부름 (02 §3 규칙 6): 이 사이트의 서비스워커 해제 + wgb- 캐시 삭제. ?nosw=1 도 이걸 씀.
export async function off() {
  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.getRegistrations) {
    for (const r of await navigator.serviceWorker.getRegistrations()) {
      const url = (r.active || r.waiting || r.installing)?.scriptURL || '';
      if (!url || /\/sw\.js(\?|$)/.test(url)) await r.unregister();
    }
  }
  if (typeof caches !== 'undefined') for (const k of await caches.keys()) if (k.startsWith('wgb-')) await caches.delete(k);
}

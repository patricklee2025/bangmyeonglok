// ============================================================
//  WP-13 비상용 서비스워커 킬스위치 (docs/v4/06 §5 · WP-13 §4)
//  public/sw.js 를 이 파일로 덮어쓰고 배포하면, 각 기기에서 다음 방문 때 SW가 스스로 해제되고 캐시를 지운 뒤 화면을 새로 엽니다.
//    cp tools/sw-killswitch.js public/sw.js   → Netlify에 public 폴더 다시 올리기
// ============================================================
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('wgb-')) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));

// ============================================================
//  WP-13 · 📶 앱 껍데기 서비스워커 (docs/v4/wp/WP-13-offline.md §2)
//  · 페이지(HTML) · 같은 출처 JS/CSS: 네트워크 우선, 3초 안에 답이 없으면 캐시 (배포 직후에도 새 화면, HTML·JS 버전이 섞이지 않게)
//  · 글꼴 · 아이콘 · img/ · js/vendor/ · 버전 고정된 Firebase SDK(gstatic): 캐시 우선
//  · Firestore · Google 로그인 · 그 밖의 교차 출처: 가로채지 않음 (SDK가 직접)
//  skipWaiting · clients.claim 은 하지 않음 — 열려 있는 페이지를 중간에 바꾸지 않고, 새 SW는 다음 방문부터.
//  비상 해제: tools/sw-killswitch.js 로 이 파일을 덮어써 배포 (또는 아무 페이지에 ?nosw=1).
// ============================================================
const CACHE = 'wgb-shell-v1';
const NET_WAIT_MS = 3000;
const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
const BASE = new URL('./', self.location).pathname;                 // '/' on Netlify — also works from a sub-folder
// the app shell (face-api models are not here: they are cached the first time a photo is analysed)
const PRECACHE = [
  'index.html', 'kiosk.html', 'village.html', 'admin.html', 'village.webmanifest',
  'css/style.css',
  'js/admin.js', 'js/avatar.js', 'js/config.js', 'js/face.js', 'js/guest.js', 'js/i18n.js', 'js/report.js', 'js/scene.js', 'js/snaps.js', 'js/store.js', 'js/village.js',
  'js/core/bus.js', 'js/core/docdb.js', 'js/core/features.js', 'js/core/phase.js', 'js/core/schema.js', 'js/core/settings.js', 'js/core/ui.js',
  'js/features/index.js',
  'fonts/Galmuri11.woff2', 'fonts/Galmuri11-Bold.woff2', 'fonts/Galmuri9.woff2',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(p => new Request(BASE + p, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('wgb-') && k !== CACHE).map(k => caches.delete(k)))));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    if (req.url.startsWith(SDK)) e.respondWith(cacheFirst(req));
    return;                                                           // Firestore, auth, YouTube … go straight to the network
  }
  const path = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : url.pathname.slice(1);
  if (path.startsWith('__/')) return;                                 // Firebase auth helper pages
  if (req.mode === 'navigate' && url.searchParams.get('nosw') === '1') { e.waitUntil(goodbye()); return; }
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, url, true)); return; }
  if (/^(fonts|icons|img|js\/vendor)\//.test(path)) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(networkFirst(req, url, false));                       // js · css · everything else of ours
});

/** one cache entry per file — '?demo=1&phase=live' and friends share it */
const keyOf = url => new Request(url.origin + url.pathname);

/** the shell cache, or null once it was deleted (?nosw=1 · feature off · kill switch) — a deleted cache is never brought back */
const shell = async () => ((await caches.has(CACHE)) ? caches.open(CACHE) : null);

async function networkFirst(req, url, page) {
  const cache = await shell();
  if (!cache) return fetch(req);
  const net = fetch(req).then(res => {
    if (res.ok && res.type === 'basic') cache.put(keyOf(url), res.clone()).catch(() => {});
    return res;
  });
  let timer;
  const late = new Promise(r => { timer = setTimeout(() => r(null), NET_WAIT_MS); });
  const first = await Promise.race([net.catch(() => null), late]);
  clearTimeout(timer);
  if (first) return first;
  const hit = await cache.match(keyOf(url));
  if (hit) return hit;
  if (page) {                                                         // an address we never cached: the guestbook home
    const home = await cache.match(new Request(url.origin + BASE + 'index.html'));
    if (home) return home;
  }
  return net;                                                         // still nothing: the network's own answer (or its error)
}

async function cacheFirst(req) {
  const cache = await shell();
  if (!cache) return fetch(req);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function goodbye() {
  for (const k of await caches.keys()) if (k.startsWith('wgb-')) await caches.delete(k);
  await self.registration.unregister();
}

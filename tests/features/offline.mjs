// ============================================================
//  WP-13 offline — docs/v4/wp/WP-13-offline.md · 04-testing §4.1 (S1 S3 S4 S8) + A1–A8
//  The app-shell service worker: precache · offline reload + demo guestbook · network first when back · ?nosw=1 · kill switch ·
//  cross-origin requests untouched · static list ↔ files ↔ _headers.
//  Everything with ?sw=1 (demo and 127.0.0.1 would not register otherwise). Each browser context = its own SW and caches.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { signGuest } from '../lib/flows.mjs';
import { serve } from '../../tools/serve.mjs';
import { on, off, adminPage, setFlag, expectClean, featureState } from '../lib/v4.mjs';

const ID = 'offline';
export const meta = { title: 'offline: service worker precache · offline reload + demo write · network first · ?nosw=1 · kill switch · cross-origin untouched · static list', timeout: 360000, tags: ['slow'] };

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PUB = path.join(REPO, 'public');
const until = async (page, fn, arg, ms = 8000) => { const t0 = Date.now(); do { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(100); } while (Date.now() - t0 < ms); return false; };
const swState = page => page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  const keys = (await caches.keys()).filter(k => k.startsWith('wgb-'));
  return { regs: regs.length, active: regs.map(r => r.active?.state || null), controlled: !!navigator.serviceWorker.controller, caches: keys };
});
const precacheList = () => {
  const src = fs.readFileSync(path.join(PUB, 'sw.js'), 'utf8');
  const m = src.match(/const PRECACHE = \[([\s\S]*?)\];/);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [];
};
async function installed(h, ctx, tag = 'sw', page = 'index.html', params = {}) {
  const p = await h.page(ctx, { tag });
  await p.goto(h.url(page, { ff: on(ID), sw: 1, ...params }));
  await p.evaluate(() => navigator.serviceWorker.ready.then(() => true)).catch(() => false);
  await until(p, () => navigator.serviceWorker.getRegistration().then(r => r?.active?.state === 'activated'), null, 15000);
  return p;
}

export default async (h) => {
  // ---------------------------------------------------------------- A8 static
  await h.step('A8 static: every precached file exists · every core JS is precached · _headers has the /sw.js no-cache block · kill switch file', async () => {
    const list = precacheList();
    h.check('A8 precache list found (≥ 25 files)', list.length >= 25, String(list.length));
    const missing = list.filter(f => !fs.existsSync(path.join(PUB, f)));
    h.eq('A8 every precached file exists in public/', missing, []);
    const html = fs.readdirSync(PUB).filter(f => f.endsWith('.html'));
    const js = fs.readdirSync(path.join(PUB, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f);
    const core = fs.readdirSync(path.join(PUB, 'js/core')).filter(f => f.endsWith('.js')).map(f => 'js/core/' + f);
    const fonts = fs.readdirSync(path.join(PUB, 'fonts')).filter(f => f.endsWith('.woff2')).map(f => 'fonts/' + f);
    const need = [...html, ...js, ...core, 'js/features/index.js', 'css/style.css', ...fonts];
    h.eq('A8 the 4 pages, every js/*.js and js/core/*.js, fonts, css are in the list (a new core file cannot be forgotten)', need.filter(f => !list.includes(f)), []);
    h.check('A8 face-api models are not precached', !list.some(f => f.startsWith('js/vendor/')));
    const hdr = fs.readFileSync(path.join(PUB, '_headers'), 'utf8');
    h.check('A8 public/_headers: "/sw.js" block with "Cache-Control: no-cache"', /^\/sw\.js\s*\n\s+Cache-Control:\s*no-cache\s*$/m.test(hdr), hdr.slice(-120));
    const ks = fs.readFileSync(path.join(REPO, 'tools/sw-killswitch.js'), 'utf8');
    h.check('A8 tools/sw-killswitch.js: skipWaiting · deletes wgb- caches · unregisters · reloads windows', /skipWaiting/.test(ks) && /startsWith\('wgb-'\)/.test(ks) && /unregister\(\)/.test(ks) && /navigate\(/.test(ks));
    const sw = fs.readFileSync(path.join(PUB, 'sw.js'), 'utf8');
    h.check('A8 sw.js never calls skipWaiting() or clients.claim() (no swap under an open page)', !/skipWaiting\s*\(|clients\.claim\s*\(/.test(sw));
  });

  // ---------------------------------------------------------------- S1 off · S4 demo without ?sw=1
  await h.step('S1 off: ?sw=1 with the feature off → no service worker, no cache, no trace · S4 on but demo without ?sw=1 → nothing', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'off' });
    await p.goto(h.url('index.html', { ff: off(ID), sw: 1 })); await p.waitForTimeout(1500);
    h.eq('S1 off: 0 registrations · 0 wgb- caches', await swState(p).then(s => [s.regs, s.caches.length]), [0, 0]);
    await expectClean(h, p, ID, 'S1 guest');
    const q = await h.page(ctx, { tag: 'demo' });
    await q.goto(h.url('index.html', { ff: on(ID) })); await q.waitForTimeout(1500);
    h.eq('S4 demo (no ?sw=1): not registered', await swState(q).then(s => s.regs), 0);
    await ctx.close();
  });

  // ---------------------------------------------------------------- A2 precache
  await h.step('A2 ?sw=1 → registered · activated · wgb-shell cache holds every precached file', async () => {
    const ctx = await h.context('phone');
    const p = await installed(h, ctx);
    const st = await swState(p);
    h.eq('A2 one registration, activated', [st.regs, st.active[0]], [1, 'activated']);
    h.eq('A2 cache name', st.caches, ['wgb-shell-v1']);
    const cached = await p.evaluate(async () => (await (await caches.open('wgb-shell-v1')).keys()).map(r => new URL(r.url).pathname.slice(1)));
    const list = precacheList();
    h.eq('A2 every precached file is in the cache', list.filter(f => !cached.includes(f)), []);
    h.check('A2 the first page is not taken over mid-way (no clients.claim)', st.controlled === false);
    h.check('A2 first install on the guest page: "📶 오프라인에서도 열 수 있어요" once', await until(p, () => /📶 오프라인에서도 열 수 있어요/.test(document.querySelector('#toast')?.textContent || ''), null, 6000));
    await p.reload(); await p.waitForTimeout(800);
    h.check('A2 after a reload the page is controlled', (await swState(p)).controlled);
    await p.waitForTimeout(1500);
    h.check('A2 …and the "ready" notice is not repeated', !/오프라인에서도 열 수 있어요/.test(await p.evaluate(() => { const t = document.querySelector('#toast'); return t && !t.hidden ? t.textContent : ''; })));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A3 offline · S8 notice
  await h.step('A3 offline: reload index.html → opens · demo guestbook write completes · village opens · notices', async () => {
    const ctx = await h.context('phone');
    const p = await installed(h, ctx);
    await p.reload(); await p.waitForTimeout(1000);                              // controlled now; feature files cached on the way
    await p.goto(h.url('village.html', { ff: on(ID), sw: 1 })); await p.waitForTimeout(1500);   // the village's own files, once online
    await p.goto(h.url('index.html', { ff: on(ID), sw: 1 })); await p.waitForTimeout(800);
    await ctx.setOffline(true);
    h.check('A3 the "offline" notice (toast)', await until(p, () => /인터넷이 끊겼어요/.test(document.querySelector('#toast')?.textContent || ''), null, 4000));
    await h.shot(p, 'offline-1-toast');
    const r = await h.layoutReport(p);
    h.check('S8 guest page with the offline toast: no overlaps', !r.overlaps.length, r.overlaps.join(' | '));
    const vendor = await p.evaluate(() => fetch('js/vendor/jszip.min.js').then(() => 'ok', () => 'blocked'));
    h.eq('A3 the network really is off for the worker (an uncached vendor file fails)', vendor, 'blocked');
    const res = await p.reload().catch(e => ({ error: String(e) }));
    h.check('A3 offline reload of index.html opens', !res?.error && await p.evaluate(() => !!document.querySelector('#btn-start')), JSON.stringify(res?.error || ''));
    h.check('A3 opened while offline → the notice right away', await until(p, () => /인터넷이 끊겼어요/.test(document.querySelector('#toast')?.textContent || ''), null, 4000));
    const g = await signGuest(h, p, { name: '오프라인', msg: '비행기 모드에서도!', open: false }).catch(e => ({ error: String(e) }));
    h.check('A3 demo guestbook write completes offline', !!g?.gid && !g.error, JSON.stringify(g));
    await h.shot(p, 'offline-2-done');
    const v = await p.goto(h.url('village.html', { ff: on(ID), sw: 1 })).catch(e => ({ error: String(e) }));
    h.check('A3 the village opens offline', !v?.error && await until(p, () => !!document.querySelector('canvas') && /^\d+$/.test(document.querySelector('#count-n')?.textContent || ''), null, 8000));
    await p.goto(h.url('index.html', { ff: on(ID), sw: 1 }));
    for (let i = 0; i < 40; i++) { const st = await featureState(p, ID).catch(() => null); if (st?.on) break; await p.waitForTimeout(150); }
    await ctx.setOffline(false);
    h.check('A3 back online → "다시 연결됐어요"', await until(p, () => /다시 연결됐어요/.test(document.querySelector('#toast')?.textContent || ''), null, 4000));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A4 network first
  await h.step('A4 online: pages and JS come from the network (a marker header added by the test server route), not the cache', async () => {
    const ctx = await h.context('phone');
    const p = await installed(h, ctx);
    await p.reload(); await p.waitForTimeout(600);
    let n = 0;
    await ctx.route(/\/(index\.html|js\/config\.js)(\?.*)?$/, async route => { n++; const r = await route.fetch(); await route.fulfill({ response: r, headers: { ...r.headers(), 'x-wgb-fresh': String(n) } }); });
    const res = await p.goto(h.url('index.html', { ff: on(ID), sw: 1 }));
    h.check('A4 the page is served through the worker', res?.fromServiceWorker() === true);
    h.check('A4 …and came from the network (marker header present)', !!res?.headers()['x-wgb-fresh'], JSON.stringify(res?.headers()));
    const js = await p.evaluate(() => fetch('js/config.js').then(r => r.headers.get('x-wgb-fresh')));
    h.check('A4 JS through the worker comes from the network too', !!js, String(js));
    await ctx.unroute(/\/(index\.html|js\/config\.js)(\?.*)?$/);
    await ctx.close();
  });

  // ---------------------------------------------------------------- A7 cross-origin
  await h.step('A7 cross-origin requests (not gstatic) and Firebase auth paths do not go through the worker', async () => {
    const ctx = await h.context('phone');
    const p = await installed(h, ctx);
    await p.reload(); await p.waitForTimeout(600);
    await ctx.route('https://wgb-cross.test/**', r => r.fulfill({ status: 200, body: 'ok', headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' } }));
    const [cross] = await Promise.all([p.waitForResponse(r => r.url().startsWith('https://wgb-cross.test/')), p.evaluate(() => fetch('https://wgb-cross.test/ping').then(r => r.text()).catch(() => ''))]);
    h.check('A7 cross-origin fetch: not from the service worker', cross.fromServiceWorker() === false);
    const [auth] = await Promise.all([p.waitForResponse(r => r.url().includes('/__/auth/')), p.evaluate(() => fetch('__/auth/handler').catch(() => null))]);
    h.check('A7 /__/auth/… : not from the service worker', auth.fromServiceWorker() === false);
    const [own] = await Promise.all([p.waitForResponse(r => r.url().endsWith('/js/i18n.js')), p.evaluate(() => fetch('js/i18n.js'))]);
    h.check('A7 control: a same-origin JS fetch does go through the worker', own.fromServiceWorker() === true);
    await ctx.close();
  });

  // ---------------------------------------------------------------- A5 ?nosw=1
  await h.step('A5 ?nosw=1 → unregistered · wgb- caches 0 · "오프라인 저장을 지웠어요"', async () => {
    const ctx = await h.context('phone');
    const p = await installed(h, ctx);
    await p.goto(h.url('index.html', { ff: on(ID), nosw: 1 }));
    h.check('A5 the notice', await until(p, () => /오프라인 저장을 지웠어요/.test(document.querySelector('#toast')?.textContent || ''), null, 6000));
    h.check('A5 0 registrations · 0 caches', await until(p, async () => (await navigator.serviceWorker.getRegistrations()).length === 0 && !(await caches.keys()).some(k => k.startsWith('wgb-')), null, 6000), JSON.stringify(await swState(p)));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A6 kill switch
  // Playwright does not route the browser's own service-worker script fetches, so this step runs its own copy of the site:
  // a folder of links to public/ where only sw.js is a real file — first the real worker, then the kill switch "deployed" over it.
  await h.step('A6 kill switch: deploy tools/sw-killswitch.js as sw.js → after reloads: 0 registrations, 0 caches', async () => {
    const root = path.join(REPO, 'tests/.out/offline-site');
    fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
    for (const f of fs.readdirSync(PUB)) if (f !== 'sw.js') fs.symlinkSync(path.join(PUB, f), path.join(root, f));
    fs.copyFileSync(path.join(PUB, 'sw.js'), path.join(root, 'sw.js'));
    const site = await serve({ root, port: 0 });
    const at = (file, params) => { const u = new URL(h.url(file, params)); const s = new URL(site.url); u.host = s.host; return u.href; };
    try {
      const ctx = await h.context('phone');
      const p = await h.page(ctx, { tag: 'ks' });
      await p.goto(at('index.html', { ff: on(ID), sw: 1 }));
      await until(p, () => navigator.serviceWorker.getRegistration().then(r => r?.active?.state === 'activated'), null, 15000);
      await p.reload(); await p.waitForTimeout(600);
      h.check('A6 before: registered and caching', await until(p, async () => (await navigator.serviceWorker.getRegistrations()).length === 1 && (await caches.keys()).includes('wgb-shell-v1')));
      fs.copyFileSync(path.join(REPO, 'tools/sw-killswitch.js'), path.join(root, 'sw.js'));       // "deploy" the kill switch
      await p.goto(at('index.html', { ff: on(ID) })); await p.waitForTimeout(1000);            // on, but no ?sw=1 in the demo: it neither registers nor unregisters — only the kill switch acts
      let ok = false;
      for (let i = 0; i < 3 && !ok; i++) {                                                     // the browser checks sw.js on navigation; update() just does the same check now
        await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => null)).catch(() => null);
        ok = await until(p, async () => (await navigator.serviceWorker.getRegistrations()).length === 0 && !(await caches.keys()).some(k => k.startsWith('wgb-')), null, 6000);
        if (!ok) { await p.reload().catch(() => {}); await p.waitForTimeout(800); }
      }
      h.check('A6 after the kill switch: 0 registrations · 0 wgb- caches', ok, JSON.stringify(await swState(p).catch(() => null)));
      h.check('A6 the page still works (opened from the network)', await p.evaluate(() => !!document.querySelector('#btn-start')));
      await ctx.close();
    } finally { await site.close(); fs.rmSync(root, { recursive: true, force: true }); }
  });

  // ---------------------------------------------------------------- S3 hot toggle
  await h.step('S3 hot toggle: on (registered) → admin off → off.js unregisters + clears caches → on again → registered', async () => {
    const ctx = await h.context('desktop');
    const a = await adminPage(h, ctx);
    await setFlag(h, a, ID, true);
    const p = await h.page(ctx, { tag: 'hot' });
    await p.goto(h.url('index.html', { sw: 1 }));
    h.check('S3 on (admin flag) → registered', await until(p, async () => (await navigator.serviceWorker.getRegistrations()).length === 1, null, 10000));
    await until(p, () => navigator.serviceWorker.getRegistration().then(r => r?.active?.state === 'activated'), null, 10000);
    await setFlag(h, a, ID, false);
    h.check('S3 off → unregistered and caches cleared without a reload', await until(p, async () => (await navigator.serviceWorker.getRegistrations()).length === 0 && !(await caches.keys()).some(k => k.startsWith('wgb-')), null, 10000), JSON.stringify(await swState(p)));
    await expectClean(h, p, ID, 'S3 after off');
    await setFlag(h, a, ID, true);
    h.check('S3 on again → registered again', await until(p, async () => (await navigator.serviceWorker.getRegistrations()).length === 1, null, 10000));
    await setFlag(h, a, ID, null);
    // S4: the admin page and the kiosk register too (pages: all)
    const k = await installed(h, ctx, 'kiosk', 'kiosk.html');
    h.eq('S4 kiosk: registered', (await swState(k)).regs, 1);
    await ctx.close();
  });
};

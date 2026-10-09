// WP-00c — every extension point of the three pages, driven through the `_selftest` feature (demo only).
// Guest + kiosk part: ctx.guest (screens · hub · welcome slot · reset · couple sprites · snap helpers), the page's bus events,
// ctx.texts / rootClass, the pre-phase hiding, hot toggle and the circuit breaker.
// Admin part (session ②): tab registry · live panel · ⚙️ settings tab (A7) · ctx.admin (tabs · live slot · settings box · backup parts · cfg · live · alert · download).
// Village part (session ③): tests/lib/ext-village.mjs — HUD zones · draw/overlay layers · props · decorate · tap · keys · scene · banners (A4) · quiet (A5) · presence (A6) ·
// phone actions + sheets (A8) · owner-conflict (A12) · gate (A13) · hot toggle (A2) · fcrash (A3) — called at the end of this suite.
//
// `_selftest` leaves a probe on every page: <div data-st="badge" data-page="…" data-ev="{type:{n,last}}" …>; every API use has its own data-st marker.
import fs from 'node:fs';
import { adminPage, setFlag, setCfg, footprint, expectClean, featureState, dbGet, isolateManifest, coreOnly } from '../lib/v4.mjs';
import { zipEntries, zipRead } from '../lib/files.mjs';
import villageSteps from '../lib/ext-village.mjs';

export const meta = { title: 'WP-00c: guest · kiosk · admin extension points through the _selftest feature', timeout: 800000, tags: ['slow'] };

const ST = { ff: '_selftest' };
const badge = p => p.evaluate(() => { const b = document.querySelector('[data-st="badge"]'); return b ? { ...b.dataset } : null; });
/** received counts + last payloads of the bus events _selftest listens to */
const evs = async p => JSON.parse((await badge(p))?.ev || '{}');
const visible = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; }, sel);
const top = (p, sel) => p.evaluate(s => document.querySelector(s)?.getBoundingClientRect().top ?? null, sel);
const text = (p, sel) => p.evaluate(s => document.querySelector(s)?.textContent ?? null, sel);
const infoOf = async p => JSON.parse(await text(p, '[data-st="screen-info"]') || '{}');
/** the badge is display:none — wait for it to be attached, not "visible" */
const ready = (p, page = null) => p.waitForSelector(page ? `[data-st="badge"][data-page="${page}"]` : '[data-st="badge"]', { state: 'attached', timeout: 10000 });
/** Serve the real manifest with `_selftest`'s options widened (e.g. status:'beta' makes it flag-controlled, simple:false tests f-nosimple). */
// This suite tests the CORE's extension points with `_selftest` alone. Real features that are on by default (status ready / beta —
// wall, tv, prereg …) would join every page, so each page here sees them as `planned` (off unless ?ff=). Their own suites test them.
const isolate = isolateManifest;
const patchManifest = (page, extra) => page.route('**/js/features/index.js', async route => {
  const res = await route.fetch(), body = isolate(await res.text()), from = '{ liveSafe: true, default: false }';
  if (!body.includes(from)) throw new Error('features/index.js changed: the _selftest options literal was not found');
  await route.fulfill({ response: res, body: body.replace(from, `{ liveSafe: true, default: false, ${extra} }`) });
});
const until = async (p, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(60); } return false; };

export default async (h) => {
  h.allowErrors(/\[fcrash\]/, /\[f:_selftest\]/);       // the crash test forces errors on purpose
  coreOnly(h);                                           // see `isolate` (tests/lib/v4.mjs)
  if (process.env.EXT_ONLY === 'village') return villageSteps(h, { ST, badge, visible, text, until, ready, patchManifest });   // handy while working on the village part: EXT_ONLY=village node tests/run.mjs core-extension

  // ============================================================ everything OFF: the page is v3.2
  await h.step('all features off: slot is empty and takes no room, boot class is gone, page fires its events', async () => {
    const p = await h.page('phone', { tag: 'off' });
    await p.goto(h.url('index.html')); await p.waitForTimeout(700);
    h.check('#slot-welcome exists between the hero card and the start buttons',
      await p.evaluate(() => { const s = document.querySelector('#slot-welcome'); return !!s && s.previousElementSibling?.classList.contains('hero') && s.nextElementSibling?.classList.contains('start-btns'); }));
    h.eq('#slot-welcome is empty and display:none (no stray flex gap)', await p.evaluate(() => { const s = document.querySelector('#slot-welcome'); return [s.children.length, getComputedStyle(s).display]; }), [0, 'none']);
    h.check('html.f-boot is removed once the loader has booted', !(await p.evaluate(() => document.documentElement.classList.contains('f-boot'))));
    h.eq('<html data-phase> follows the URL', await p.evaluate(() => document.documentElement.dataset.phase), 'live');
    h.eq('no feature is on', (await p.evaluate(async () => (await import('/js/core/features.js')).featureStates().filter(s => s.on).map(s => s.id))), []);
    h.check('welcome content is fully visible after boot', await p.evaluate(() => getComputedStyle(document.querySelector('#s-welcome .hero')).opacity === '1'));
    // sticky bus values a feature switched on later would replay
    const last = await p.evaluate(async () => { const { last } = await import('/js/core/bus.js'); return { screen: last('guest:screen'), mine: last('guest:mine') === undefined ? 'undef' : last('guest:mine'), simple: last('guest:simple'), lang: last('lang') }; });
    h.eq('sticky values at boot: screen · mine · simple · lang', last, { screen: { name: 'welcome', prev: 'welcome' }, mine: null, simple: { on: false }, lang: { lang: 'ko' } });
    const a = await h.page('phone', { tag: 'off-kiosk' }); await a.goto(h.url('kiosk.html')); await a.waitForTimeout(500);
    h.eq('kiosk boots with the same empty slot and mine = null', await a.evaluate(async () => [document.querySelector('#slot-welcome').children.length, (await import('/js/core/bus.js')).last('guest:mine')]), [0, null]);
  });

  // ============================================================ _selftest on a phone: the whole guest tour
  await h.step('phone: welcome slot · text override · hub · feature screen · events · snaps', async () => {
    const ctx = await h.context('phone');
    const g = await h.page(ctx, { tag: 'guest' });
    await g.goto(h.url('index.html', ST));
    await ready(g, 'guest');

    // --- boot-time sticky replay + the slot + texts
    const b0 = await badge(g);
    h.eq('boot values the feature could read (mine · simple · lang)', JSON.parse(b0.boot), { mine: null, simple: { on: false }, lang: { lang: 'ko' } });
    h.eq('a replayed sticky event arrives synchronously during setup (guest:screen)', JSON.parse(b0.replayScreen), { name: 'welcome', prev: 'welcome' });
    h.check('welcome slot item shows between hero and start buttons', await visible(g, '#slot-welcome [data-st="welcome"]'));
    const ys = await g.evaluate(() => ['.hero', '[data-st="welcome"]', '.start-btns'].map(s => document.querySelector(s).getBoundingClientRect().top));
    h.check('visual order: hero < slot < start buttons', ys[0] < ys[1] && ys[1] < ys[2], ys.join(' < '));
    h.eq('A10 ctx.texts replaces the core welcome text on screen (ko)', await text(g, '[data-i18n="welcome_sub"]'), '[점검] 환영 문구를 덮어썼어요');
    h.check('A10 ctx.texts did not fire a lang event', !(await evs(g)).lang);
    h.check('A10 ctx.rootClass: <html class="f-_selftest-on">', await g.evaluate(() => document.documentElement.classList.contains('f-_selftest-on')));
    await h.shot(g, 'guest-1-welcome');
    await g.click('.lang [data-lang="en"]'); await g.waitForTimeout(200);
    h.eq('A10 override follows the language (en)', await text(g, '[data-i18n="welcome_sub"]'), '[self-test] welcome text overridden');
    h.eq('a language switch emits exactly one lang event', (await evs(g)).lang, { n: 1, last: { lang: 'en' } });
    await g.click('.lang [data-lang="ko"]'); await g.waitForTimeout(100);

    // --- the welcome button opens the feature screen
    await g.click('[data-st="welcome-go"]');
    h.check('feature screen opens from the welcome slot (and the core screens hide)', await g.evaluate(() => document.querySelector('#s-f-_selftest').classList.contains('active') && !document.querySelector('#s-welcome').classList.contains('active')));
    let info = await infoOf(g);
    h.eq('API reads on the feature screen: screen · me · simple · kiosk', [info.screen, info.me, info.simple, info.kiosk], ['f-_selftest', null, false, false]);
    h.check('villageUrl() without a guest is the plain village page (+demo)', /^village\.html\?demo=1$/.test(info.village), info.village);
    h.eq('onEnter ran once', info.entered, 1);
    h.eq('unknown screens hide the step label', await visible(g, '#step-label'), false);
    await g.waitForTimeout(400);                                  // the screen pops in over .25 s
    await h.shot(g, 'guest-2-feature-screen');
    await g.click('[data-st="screen-back"]');
    h.check('back() returns to the screen before (welcome) and onLeave ran', await g.evaluate(() => document.querySelector('#s-welcome').classList.contains('active')) && (await badge(g)).screenLeave === '1');
    h.eq('guest:screen events carry name + prev', (await evs(g))['guest:screen'].last, { name: 'welcome', prev: 'f-_selftest' });

    // --- sign the guestbook with the feature on
    const { gid } = await h.flows.signGuest(h, g, { name: '점검하객', msg: '확장 점검', side: 'bride', open: false });
    h.check('guest signed', !!gid, gid);
    const e1 = await evs(g);
    h.eq('guest:submitted payload', e1['guest:submitted'].last, { gid, name: '점검하객', side: 'bride', avatar: true, simple: false, kiosk: false, queued: false });
    h.eq('guest:mine is the new guest', e1['guest:mine'].last, { id: gid, name: '점검하객' });
    h.eq('guest:screen → done (prev act)', e1['guest:screen'].last, { name: 'done', prev: 'act' });

    // hub: row + card on the done screen, sitting between the core blocks (order 55 / 60 vs snap 20 · remote 30 · sticky foot 90)
    h.check('hub card is on the done screen', await visible(g, '#s-done [data-hub="f-_selftest-card"]'));
    h.check('hub row is on the done screen', await visible(g, '#s-done [data-hub="f-_selftest"]'));
    const tops = sels => g.evaluate(ss => { scrollTo(0, document.body.scrollHeight); return ss.map(s => document.querySelector(s).getBoundingClientRect().top); }, sels);   // scrolled to the bottom: the sticky foot sits below the last block
    const order = await tops(['#snap-done', '#remote-done', '[data-hub="f-_selftest-card"]', '[data-hub="f-_selftest"]', '#s-done > .sticky-foot']);
    h.check('visual order on done: snap < remote < card(55) < row(60) < view-village foot(90)', order.every((v, i) => !i || order[i - 1] < v), order.map(Math.round).join(' < '));
    await g.evaluate(() => scrollTo(0, 0));
    h.eq('card render() got who = the guest that just signed', JSON.parse(await text(g, '[data-st="hub-card-who"]')), { gid, name: '점검하객', where: 'done' });
    h.eq('hub row has the title the feature gave (ko)', await text(g, '[data-hub="f-_selftest"] .hub-title'), '점검 행');
    h.check('hub row is a button for keyboard + screen readers', await g.evaluate(() => { const r = document.querySelector('[data-hub="f-_selftest"]'); return r.getAttribute('role') === 'button' && r.tabIndex === 0; }));
    h.check('hub row is ≥ 56 px tall (a thumb target)', (await g.evaluate(() => document.querySelector('[data-hub="f-_selftest"]').getBoundingClientRect().height)) >= 56);
    await g.click('.lang [data-lang="en"]'); await g.waitForTimeout(150);
    h.eq('a function title follows the language (en)', await text(g, '[data-hub="f-_selftest"] .hub-title'), 'self-test row');
    await g.waitForTimeout(300);
    await h.shot(g, 'guest-3-done-hub-en', { fullPage: true });
    const lay = await h.layoutReport(g);
    h.check('done screen with hub: no overlapping controls · no sideways scroll', lay.overlaps.length === 0 && !lay.hscroll, lay.overlaps.join(' | '));
    await g.click('.lang [data-lang="ko"]'); await g.waitForTimeout(100);

    // snaps: core uploader (where done) · feature uploader inside the card (where feature) · uploadSnap()
    await g.setInputFiles('#snap-done input[type=file]:not([multiple])', h.fixture('face1.jpg'));
    h.check('core uploader on the done screen reports where:done', await until(g, () => !!document.querySelector('[data-st="badge"]')?.dataset.ev && JSON.parse(document.querySelector('[data-st="badge"]').dataset.ev)['snap:uploaded']?.last?.where === 'done'));
    h.eq('snap:uploaded payload (slot 0, gid)', (({ gid: a, slot, caption, queued, where }) => ({ a, slot, caption, queued, where }))((await evs(g))['snap:uploaded'].last), { a: gid, slot: 0, caption: '', queued: false, where: 'done' });
    await g.click('[data-st="hub-upload"]');
    h.check('uploadSnap() resolves with the next slot', await until(g, () => /"slot":1/.test(document.querySelector('[data-st="hub-card-out"]')?.textContent || '')), null, 8000);
    const out = JSON.parse(await text(g, '[data-st="hub-card-out"]'));
    h.eq('uploadSnap() result + snapsLeft() (limit − 2)', [out.ok, out.left], [{ slot: 1, queued: false }, await g.evaluate(async () => (await import('/js/config.js')).CONFIG.snapLimitPerGuest - 2)]);
    h.eq('uploadSnap() event says where:feature', (await evs(g))['snap:uploaded'].last.where, 'feature');
    await g.setInputFiles('[data-st="hub-snap"] input[type=file]:not([multiple])', h.fixture('face1.jpg'));
    h.check('ctx.guest.mountSnapUploader reports where:feature + calls onUploaded', await until(g, () => !!document.querySelector('[data-st="hub-card-out"][data-mounted="1"]'), null, 15000));
    h.eq('this phone has used 3 snap slots (core + feature + uploader share one count)', await g.evaluate(gid => JSON.parse(localStorage.getItem('wgb_snaps_' + gid)).n, gid), 3);

    // remote:sent
    await g.click('#remote-done .remote-btn >> nth=0'); await g.waitForTimeout(200);
    h.eq('remote:sent from the done screen', (await evs(g))['remote:sent'].last, { gid, type: 'heart', where: 'done' });

    // hub row → feature screen (who comes along) → hub.refresh() hides the card (when() === false) → back
    await g.click('[data-hub="f-_selftest"]');
    h.eq('row onClick got who (done)', JSON.parse((await badge(g)).hubClick), { gid, name: '점검하객', where: 'done' });
    info = await infoOf(g);
    h.eq('me() = the guest this phone remembers; villageUrl() points at them', [info.me, info.village], [{ id: gid, name: '점검하객' }, `village.html?me=${encodeURIComponent(gid)}&demo=1`]);
    h.eq('snapsLeft() is exposed per guest id', info.left, await g.evaluate(async () => (await import('/js/config.js')).CONFIG.snapLimitPerGuest));
    await g.click('[data-st="screen-toggle"]'); await g.click('[data-st="screen-back"]');
    h.eq('back() from a feature screen goes to the screen before (done)', await g.evaluate(() => document.querySelector('#s-done').classList.contains('active')), true);
    h.eq('hub.refresh() re-asks when(): the card is gone, the row stays', [await visible(g, '[data-hub="f-_selftest-card"]'), await visible(g, '[data-hub="f-_selftest"]')], [false, true]);
    await g.click('[data-hub="f-_selftest"]'); await g.click('[data-st="screen-toggle"]'); await g.click('[data-st="screen-back"]');
    h.eq('…and refresh() again brings the card back', await visible(g, '[data-hub="f-_selftest-card"]'), true);

    // solo screen ("내 사진·리모컨"): reload → remembered guest → hub nodes with who.where = solo, pre-phase hiding is off here (phase=live)
    await g.goto(h.url('index.html', ST)); await ready(g);
    h.eq('after a reload the feature sees the remembered guest (guest:mine at boot)', JSON.parse((await badge(g)).boot).mine, { id: gid, name: '점검하객' });
    await g.click('#btn-mysnap'); await g.waitForSelector('#s-remote.active');
    h.eq('solo hub card: who.where = solo, the remembered guest', JSON.parse(await text(g, '#s-remote [data-st="hub-card-who"]')), { gid, name: '점검하객', where: 'solo' });
    h.check('solo screen has card + row too', (await visible(g, '#s-remote [data-hub="f-_selftest-card"]')) && (await visible(g, '#s-remote [data-hub="f-_selftest"]')));
    const o2 = await tops(['#snap-solo', '#remote-solo', '#s-remote [data-hub="f-_selftest-card"]', '#s-remote [data-hub="f-_selftest"]', '#s-remote > .sticky-foot']);
    h.check('visual order on the solo screen: snap < remote < card < row < foot', o2.every((v, i) => !i || o2[i - 1] < v), o2.map(Math.round).join(' < '));
    await g.click('#s-remote [data-hub="f-_selftest"]');
    h.eq('row onClick on the solo screen reports where:solo', JSON.parse((await badge(g)).hubClick).where, 'solo');
    await g.click('[data-st="screen-back"]');
    await g.click('#remote-solo .remote-btn >> nth=1'); await g.waitForTimeout(200);
    h.eq('remote:sent from the solo screen says where:solo', (await evs(g))['remote:sent'].last, { gid, type: 'clap', where: 'solo' });
    await g.waitForTimeout(300);
    await h.shot(g, 'guest-4-solo-hub', { fullPage: true });
    await g.click('#s-remote [data-hub="f-_selftest"]');

    // remember(): a feature can make this phone remember a guest it created (prereg does this)
    await g.click('[data-st="screen-remember"]');
    h.eq('remember() writes wgb_mine (last = the remembered guest) and emits guest:mine', [await g.evaluate(() => JSON.parse(localStorage.getItem('wgb_mine')).slice(-1)[0]), (await evs(g))['guest:mine'].last], [{ id: 'st_gid', name: '점검' }, { id: 'st_gid', name: '점검' }]);
    h.eq('remember() keeps a guest that was already remembered (and its avatar)', await g.evaluate(() => JSON.parse(localStorage.getItem('wgb_mine')).length), 2);

    // reset() on a phone: like "한 명 더 쓰기" — screen state is wiped, memory (wgb_mine) stays, no guest:mine
    const before = (await evs(g))['guest:mine'].n;
    await g.click('[data-st="screen-reset"]');
    h.check('reset() from a feature screen lands on welcome', await g.evaluate(() => document.querySelector('#s-welcome').classList.contains('active') && !document.querySelector('#s-f-_selftest').classList.contains('active')));
    h.eq('guest:reset emitted once', (await evs(g))['guest:reset'].n, 1);
    h.eq('phone: reset does NOT emit guest:mine (the phone still remembers)', (await evs(g))['guest:mine'].n, before);
    h.eq('phone: wgb_mine is untouched by reset', await g.evaluate(() => JSON.parse(localStorage.getItem('wgb_mine')).length), 2);
  });

  // ============================================================ simple (elder) mode + a feature with simple:false (manifest patched in the browser)
  await h.step('simple mode: guest:simple · hub items follow the manifest `simple` flag', async () => {
    const run = async (patched) => {
      const ctx = await h.context('phone');
      const g = await h.page(ctx, { tag: patched ? 'simple-off' : 'simple-on' });
      if (patched) await patchManifest(g, 'simple: false');
      await g.goto(h.url('index.html', ST)); await ready(g);
      await g.click('#btn-simple');
      h.eq(`${patched ? 'simple:false' : 'simple:true'}: guest:simple {on:true} emitted`, (await evs(g))['guest:simple'], { n: 1, last: { on: true } });
      await g.fill('#in-name', '큰글씨'); await g.fill('#in-msg', '간편 모드');
      await g.click('#info-next'); await g.click('#btn-skip');
      await g.waitForSelector('#s-done.active');
      return g;
    };
    const on = await run(false);
    h.eq('simple:true feature: hub row + welcome item stay visible in simple mode', [await visible(on, '[data-hub="f-_selftest"]'), await on.evaluate(() => document.querySelector('[data-hub="f-_selftest"]').classList.contains('f-nosimple'))], [true, false]);
    h.eq('guest:submitted says simple:true', (await evs(on))['guest:submitted'].last.simple, true);
    const off = await run(true);
    h.eq('simple:false feature: nodes carry f-nosimple and vanish in simple mode (row · card · welcome slot)',
      await off.evaluate(() => ['[data-hub="f-_selftest"]', '[data-hub="f-_selftest-card"]', '[data-st="welcome"]'].map(s => { const e = document.querySelector(s); return [e?.classList.contains('f-nosimple'), e ? getComputedStyle(e).display : 'missing']; })),
      [[true, 'none'], [true, 'none'], [true, 'none']]);
  });

  // ============================================================ hot toggle: the feature goes away completely (and its screen with it)
  await h.step('hot toggle from admin: off leaves no trace, a guest standing on the feature screen is moved to safety, on again works', async () => {
    const ctx = await h.context('phone');
    const g = await h.page(ctx, { tag: 'hot' });
    await patchManifest(g, "status: 'beta'");        // a planned feature can't be flipped by the admin (02 §2.2 step 5) — as a beta it can
    const admin = await adminPage(h, ctx);
    await g.goto(h.url('index.html')); await g.waitForTimeout(500);
    h.eq('without the flag nothing of _selftest exists', (await footprint(g, '_selftest')).nodes, 0);
    const orig = await text(g, '[data-i18n="welcome_sub"]');
    await setFlag(h, admin, '_selftest', true);
    h.check('flag on → welcome slot item appears without a reload', await until(g, () => !!document.querySelector('[data-st="welcome"]'), null, 8000));
    h.check('…and the core welcome text is overridden', (await text(g, '[data-i18n="welcome_sub"]')) !== orig);
    await g.click('[data-st="welcome-go"]');
    h.check('guest stands on the feature screen', await g.evaluate(() => document.querySelector('#s-f-_selftest').classList.contains('active')));
    await setFlag(h, admin, '_selftest', false);
    h.check('flag off → the feature screen is gone', await until(g, () => !document.querySelector('#s-f-_selftest'), null, 8000));
    h.eq('a guest on a vanished feature screen lands on a real screen (never a blank page)', await g.evaluate(() => [...document.querySelectorAll('.screen.active')].map(s => s.id)), ['s-welcome']);
    await expectClean(h, g, '_selftest', 'hot off');
    h.eq('hot off: the original welcome text is back', await text(g, '[data-i18n="welcome_sub"]'), orig);
    h.eq('hot off: welcome slot is empty again', await g.evaluate(() => [document.querySelector('#slot-welcome').children.length, getComputedStyle(document.querySelector('#slot-welcome')).display]), [0, 'none']);
    const st = await featureState(g, '_selftest');
    h.eq('hot off: no listeners · timers · raf · watchers · bus subscriptions left', st && st.live, { listeners: 0, timers: 0, raf: 0, watchers: 0, bus: 0 });
    // on again — and now a hub joins a guest who is ALREADY looking at the done screen
    const { gid } = await h.flows.signGuest(h, g, { name: '핫토글', open: false });
    h.eq('done screen without the feature has no hub nodes', await g.evaluate(() => document.querySelectorAll('[data-hub]').length), 0);
    await setFlag(h, admin, '_selftest', true);
    h.check('flag on while the guest is on the done screen → hub row appears at once', await until(g, () => !!document.querySelector('#s-done [data-hub="f-_selftest"]'), null, 8000));
    h.eq('…its who is the guest who just signed', JSON.parse(await text(g, '[data-st="hub-card-who"]')).gid, gid);
    h.eq('a feature switched on late replays the sticky screen event (done)', JSON.parse((await badge(g)).replayScreen).name, 'done');
    await setFlag(h, admin, '_selftest', false);
    h.check('flag off again → hub nodes vanish from the done screen', await until(g, () => document.querySelectorAll('[data-hub]').length === 0, null, 8000));
    await expectClean(h, g, '_selftest', 'hot off #2');
    await h.shot(g, 'guest-5-done-after-hot-off');
  });

  // ============================================================ the phase hides the TV-only blocks before the wedding (A9)
  await h.step('A9 phase pre hides the done-screen snap uploader + remote, live keeps them (and the hub stays)', async () => {
    for (const phase of ['pre', 'live']) {
      const g = await h.page('phone', { tag: 'phase-' + phase });
      await g.goto(h.url('index.html', { ...ST, phase }));
      await ready(g);
      await h.flows.signGuest(h, g, { name: '페이즈', open: false });
      const vis = [await visible(g, '#snap-done'), await visible(g, '#remote-done'), await visible(g, '#s-done [data-hub="f-_selftest"]')];
      h.eq(`A9 phase=${phase}: [snap uploader, remote, hub row] visible`, vis, phase === 'pre' ? [false, false, true] : [true, true, true]);
      if (phase === 'pre') { await g.waitForTimeout(350); await h.shot(g, 'guest-6-done-pre'); }
      await g.click('#s-done [data-hub="f-_selftest"]');
      await g.click('[data-st="screen-back"]');
      await g.goto(h.url('index.html', { ...ST, phase })); await g.click('#btn-mysnap');
      h.eq(`A9 phase=${phase}: the solo screen hides snap + remote only in pre`, [await visible(g, '#snap-solo'), await visible(g, '#remote-solo')], phase === 'pre' ? [false, false] : [true, true]);
    }
  });

  // ============================================================ kiosk (A11)
  await h.step('A11 kiosk: no hub, no memory, reset() from a feature screen wipes the entry', async () => {
    const k = await h.page('tablet', { tag: 'kiosk' });
    await k.goto(h.url('kiosk.html', ST));
    await ready(k, 'kiosk');
    h.check('the welcome slot item shows on the kiosk too', await visible(k, '[data-st="welcome"]'));
    h.eq('kiosk boot: guest:mine is null', JSON.parse((await badge(k)).boot).mine, null);
    await k.click('#btn-start'); await k.fill('#in-name', '지울이름'); await k.fill('#in-msg', '지워질 글');
    await k.evaluate(() => document.querySelector('[data-st="welcome-go"]').click());             // the welcome screen is hidden now — a feature may still navigate
    h.check('kiosk guest is moved to the feature screen mid-entry', await k.evaluate(() => document.querySelector('#s-f-_selftest').classList.contains('active')));
    const kinfo = await infoOf(k);
    h.eq('kiosk API reads: kiosk=true, me=null (nobody has submitted)', [kinfo.kiosk, kinfo.me], [true, null]);
    await k.click('[data-st="screen-remember"]');
    h.eq('remember() is ignored on the kiosk (no wgb_mine, no guest:mine)', [await k.evaluate(() => localStorage.getItem('wgb_mine')), (await evs(k))['guest:mine']], [null, undefined]);
    await k.click('[data-st="screen-reset"]');
    h.check('A11 reset() → welcome screen', await k.evaluate(() => document.querySelector('#s-welcome').classList.contains('active')));
    h.eq('A11 typed name + message are wiped', await k.evaluate(() => [document.querySelector('#in-name').value, document.querySelector('#in-msg').value]), ['', '']);
    const e = await evs(k);
    h.eq('A11 guest:reset once + guest:mine null', [e['guest:reset'].n, e['guest:mine'].last, e['guest:mine'].n], [1, null, 1]);

    // a full kiosk sign-up: no hub, mine only in memory, "한 명 더" resets everything again
    await h.flows.signGuest(h, k, { name: '키오스크하객', open: false, kiosk: true });
    h.eq('kiosk done screen draws no hub nodes (the hand-off QR is its star)', await k.evaluate(() => document.querySelectorAll('[data-hub]').length), 0);
    const e2 = await evs(k);
    h.eq('guest:submitted on the kiosk says kiosk:true; guest:mine = the new guest (memory only)', [e2['guest:submitted'].last.kiosk, e2['guest:mine'].last.name, await k.evaluate(() => localStorage.getItem('wgb_mine'))], [true, '키오스크하객', null]);
    await k.click('#btn-again');
    h.check('btn-again resets again → welcome + guest:mine null', await k.evaluate(() => document.querySelector('#s-welcome').classList.contains('active')) && (await evs(k))['guest:mine'].last === null);
    h.eq('guest:reset count after two resets', (await evs(k))['guest:reset'].n, 2);
    await k.waitForTimeout(350);
    await h.shot(k, 'kiosk-1-after-reset');
  });

  // ============================================================ couple sprites (?st=coupleSprites)
  await h.step('setCoupleSprites swaps the welcome stage figures and hands them back when the feature goes off', async () => {
    const ctx = await h.context('phone');
    const g = await h.page(ctx, { tag: 'sprites' });
    await patchManifest(g, "status: 'beta'");
    const admin = await adminPage(h, ctx);
    await g.goto(h.url('index.html', { ff: null, st: 'coupleSprites' })); await g.waitForTimeout(600);
    const px = () => g.evaluate(() => { const c = document.querySelector('#couple-canvas').getContext('2d'); const d = (x, y) => [...c.getImageData(x, y, 1, 1).data].slice(0, 3).join(','); return { groom: d(38, 52), bride: d(70, 52) }; });
    const base = await px();
    h.check('before the flag the stage shows the config characters', base.groom !== '0,170,102' && base.bride !== '170,51,0', JSON.stringify(base));
    await setFlag(h, admin, '_selftest', true);
    h.check('flag on → groom + bride sprites are the feature\'s', await until(g, () => { const c = document.querySelector('#couple-canvas').getContext('2d'); const d = (x, y) => [...c.getImageData(x, y, 1, 1).data].slice(0, 3).join(','); return d(38, 52) === '0,170,102' && d(70, 52) === '170,51,0'; }, null, 8000), JSON.stringify(await px()));
    await g.waitForTimeout(300);
    await h.shot(g, 'guest-7-couple-sprites');
    await setFlag(h, admin, '_selftest', false);
    h.check('flag off → the config sprites are back (null = default)', await until(g, () => { const c = document.querySelector('#couple-canvas').getContext('2d'); const d = (x, y) => [...c.getImageData(x, y, 1, 1).data].slice(0, 3).join(','); return d(38, 52) !== '0,170,102' && d(70, 52) !== '170,51,0'; }, null, 8000), JSON.stringify(await px()));
  });

  // ============================================================ a crashing feature never takes the guestbook with it (A3, guest side)
  await h.step('A3 fcrash=_selftest: the feature is switched off after 5 errors, the guestbook keeps working', async () => {
    const g = await h.page('phone', { tag: 'fcrash' });
    await g.goto(h.url('index.html', { ...ST, fcrash: '_selftest' }));
    h.check('the breaker trips on the guest page', await until(g, async () => (await (await import('/js/core/features.js')).featureStates()).find(s => s.id === '_selftest')?.tripped === true, null, 15000));
    await g.waitForTimeout(300);
    await expectClean(h, g, '_selftest', 'tripped');
    h.eq('tripped: welcome text is original, slot empty, no hub', await g.evaluate(() => [document.querySelector('#slot-welcome').children.length, document.querySelectorAll('[data-hub]').length]), [0, 0]);
    const { gid } = await h.flows.signGuest(h, g, { name: '크래시', open: false });
    h.check('a guest can still sign after the feature crashed', !!gid);
  });

  // ============================================================ ADMIN (session ②)
  /** an admin page in `ctx` (optionally with _selftest widened by patchManifest) — waits for the demo login */
  const openAdmin = async (ctx, tag, { patch = null, params = {} } = {}) => {
    const a = await h.page(ctx, { tag });
    if (patch) await patchManifest(a, patch);
    await a.goto(h.url('admin.html', params));
    await a.waitForSelector('#main:not([hidden])', { timeout: 15000 });
    return a;
  };
  /** ms until fn(arg) is truthy in the page (Infinity after `ms`) */
  const latency = async (p, fn, arg, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return Date.now() - t0; await p.waitForTimeout(25); } return Infinity; };
  const tabKeys = p => p.$$eval('#atabs button', bs => bs.map(b => b.dataset.tab));
  const busLast = (p, type) => p.evaluate(async t => (await import('/js/core/bus.js')).last(t), type);
  const row = (id, sel = '') => `.frow[data-fid="${id}"] ${sel}`.trim();
  const settingsDoc = p => p.evaluate(async () => (await (await import('/js/core/docdb.js')).getDB()).doc('app/settings').get());
  const CORE_TABS = ['guests', 'snaps', 'capsules', 'report', 'settings'];

  await h.step('admin, all features off: the page is v3.2 plus the shell (tab registry · live panel · ⚙️ table)', async () => {
    const a = await openAdmin(await h.context('desktop'), 'admin-off', { params: { phase: null } });
    h.eq('tab buttons keep their data-tab values, ⚙️ settings is the 5th', await tabKeys(a), CORE_TABS);
    h.check('every tab keeps its #tab-<key> section', await a.evaluate(keys => keys.every(k => !!document.getElementById('tab-' + k)), CORE_TABS));
    h.eq('#live-slot is empty and takes no room', await a.evaluate(() => { const s = document.querySelector('#live-slot'); return [s.children.length, getComputedStyle(s).display]; }), [0, 'none']);
    h.check('the quiet / safe toggles unlock once the settings documents arrived', await until(a, () => !document.querySelector('#btn-quiet').disabled && !document.querySelector('#btn-safe').disabled, null, 6000));
    h.eq('both toggles start "off"', await a.evaluate(() => ['#btn-quiet', '#btn-safe', '#set-safe'].map(s => document.querySelector(s).getAttribute('aria-pressed'))), ['false', 'false', 'false']);
    h.eq('no feature is on', await a.evaluate(async () => (await import('/js/core/features.js')).featureStates().filter(s => s.on).map(s => s.id)), []);
    h.eq('sticky admin:tab at boot = guests', await busLast(a, 'admin:tab'), { key: 'guests' });
    h.eq('the existing 3 TV event buttons are still there (data-ev)', await a.$$eval('[data-ev]', bs => bs.map(b => b.dataset.ev)), ['bouquet', 'group', 'fireworks']);

    await a.click('#atabs [data-tab="snaps"]');
    h.eq('clicking a tab shows its section only (aria-selected follows)', await a.evaluate(keys => keys.map(k => [!document.getElementById('tab-' + k).hidden, document.querySelector(`#atabs [data-tab="${k}"]`).getAttribute('aria-selected')].join(':')), CORE_TABS),
      ['false:false', 'true:true', 'false:false', 'false:false', 'false:false']);
    h.eq('admin:tab is emitted on a switch', await busLast(a, 'admin:tab'), { key: 'snaps' });
    await a.click('#atabs [data-tab="capsules"]'); await a.waitForSelector('#capsule-panel .locked, #capsule-panel h2', { timeout: 8000 });
    h.check('the capsules tab still renders its panel (onShow moved into the registry)', await visible(a, '#capsule-panel'));

    await a.click('#atabs [data-tab="settings"]'); await a.waitForSelector('.frow', { state: 'attached', timeout: 5000 });   // (planned rows sit folded in 🔜)
    // (rows follow the manifest: when a WP turns its line to beta, its row gets live switches — 2026-10: wall · tv)
    const manifest = await a.evaluate(async () => (await import('/js/features/index.js')).FEATURES.map(f => ({ id: f.id, status: f.status })));
    // v4.1 (2026-10, Patrick: plainer settings): rows sit in groups by when they matter — 결혼식 전 · 당일 · 후 · 점검 (demo)
    const rows = await a.$$eval('.fgroup', gs => gs.map(g => [g.dataset.group, [...g.querySelectorAll('.frow')].map(r => r.dataset.fid)]));
    h.eq('⚙️ one row per manifest entry (demo: _selftest included) — none missing, none twice', rows.flatMap(([, ids]) => ids).sort(), manifest.map(f => f.id).sort());
    h.eq('groups in order: 결혼식 전 → 당일 → 후 → 점검', rows.map(([g]) => g), ['before', 'day', 'after', 'test']);
    const inOrder = ids => ids.every((id, i) => i === 0 || manifest.findIndex(f => f.id === ids[i - 1]) < manifest.findIndex(f => f.id === id));
    const split = await a.$$eval('.fgroup', gs => gs.map(g => [[...g.querySelectorAll(':scope > .frow')].map(r => r.dataset.fid), [...g.querySelectorAll(':scope > details.fsoon > .frow')].map(r => r.dataset.fid), !!g.querySelector(':scope > details.fsoon:last-child:not([open])') || !g.querySelector('.fsoon')]));
    h.check('inside each group the manifest order is kept — switchable rows first, then the folded "🔜 준비 중" list (closed, last)', split.every(([on, soon, last]) => inOrder(on) && inOrder(soon) && last), JSON.stringify(split));
    h.eq('planned rows (and only those) sit in the 🔜 lists', split.flatMap(([, soon]) => soon).sort(), manifest.filter(f => f.status === 'planned').map(f => f.id).sort());
    h.check('the first group starts with prereg, the demo group holds _selftest', rows[0][1][0] === 'prereg' && rows[rows.length - 1][1].includes('_selftest'), JSON.stringify(rows));
    h.check('every planned row: greyed, no switch, "준비 중 …"', await a.evaluate(ids => ids.every(id => { const r = document.querySelector(`.frow[data-fid="${id}"]`); const sw = r.querySelector('.fswitch'); return r.classList.contains('planned') && sw.hidden && sw.disabled && r.querySelector('.fwhy').textContent.startsWith('준비 중') && !r.querySelector('.ferr').textContent; }), manifest.filter(f => f.status === 'planned').map(f => f.id)));
    h.check('every beta row: a live switch, off, in plain words ("⏸ 꺼짐 …")', await a.evaluate(ids => ids.every(id => { const r = document.querySelector(`.frow[data-fid="${id}"]`), sw = r.querySelector('.fswitch'), why = r.querySelector('.fwhy').textContent; return !r.classList.contains('planned') && !sw.hidden && !sw.disabled && sw.getAttribute('aria-checked') === 'false' && why.startsWith('⏸ 꺼짐'); }), manifest.filter(f => f.status === 'beta').map(f => f.id)));
    h.check('every ready row: on — "✅ 켜짐 …" now, or "⏰ … 자동으로 나타나요" for a later phase', await a.evaluate(ids => ids.every(id => { const r = document.querySelector(`.frow[data-fid="${id}"]`), sw = r.querySelector('.fswitch'), why = r.querySelector('.fwhy').textContent; return sw.getAttribute('aria-checked') === 'true' && (why.startsWith('✅ 켜짐') || why.includes('자동으로 나타나요')); }), manifest.filter(f => f.status === 'ready').map(f => f.id)));
    h.check('every row says what the feature does (one line) and keeps its WP id in small print', await a.evaluate(() => [...document.querySelectorAll('.frow')].every(r => r.querySelector('.fdesc').textContent.length > 4 && /^WP-\d\d[a-z]? · /.test(r.querySelector('.fmeta').textContent))));
    h.check('the advanced box (phase · safe mode · reset) is folded away', await a.evaluate(() => !document.querySelector('#set-adv').open));
    h.check('the top line says where we are in plain words', /결혼식 전이에요/.test(await text(a, '#set-now')), await text(a, '#set-now'));
    h.eq('phase line: pre by the clock (this tab has no ?phase=)', await a.evaluate(() => [document.querySelector('#set-phase-now').textContent, document.querySelector('#set-phase-src').textContent.includes('자동')]), ['결혼 전 (pre)', true]);
    h.eq('a never-changed settings document says so', await text(a, '#set-updated'), '아직 바꾼 적 없음 (기본값 그대로)');
    h.eq('phase confirm bar is closed', await visible(a, '#set-phase-confirm'), false);
    h.eq('no settings box is open when no feature registered one', await a.evaluate(() => document.querySelectorAll('.fmore:not([hidden])').length), 0);
    const r = await h.layoutReport(a);
    h.check('⚙️ tab (desktop): no overlapping controls · no sideways scroll · tap targets', r.overlaps.length === 0 && !r.hscroll && r.small.length === 0, JSON.stringify(r));
    await h.shot(a, 'admin-1-settings-off');
  });

  await h.step('admin, phone: live panel and ⚙️ tab fit the screen (no overlaps, targets ≥ 32 px)', async () => {
    const a = await openAdmin(await h.context('phone'), 'admin-phone', { params: { phase: null } });
    const top = await h.layoutReport(a);
    h.check('phone: admin top (live panel with the two toggles): no overlaps · no sideways scroll · targets', top.overlaps.length === 0 && !top.hscroll && top.small.length === 0, JSON.stringify(top));
    await a.click('#atabs [data-tab="settings"]'); await a.waitForSelector('.frow', { state: 'attached' }); await a.waitForTimeout(300);
    const r = await h.layoutReport(a);
    h.check('phone: ⚙️ tab: no overlaps · no sideways scroll · targets', r.overlaps.length === 0 && !r.hscroll && r.small.length === 0, JSON.stringify(r));
    await h.shot(a, 'admin-2-settings-phone');
  });

  // ============================================================ A7: switches, safe mode, quiet mode, phase — saved, and seen by another tab in < 1 s
  await h.step('A7 ⚙️ settings: 3-state switch · safe mode · quiet mode · forced phase are saved and reach another tab in < 1 s; reset needs two confirmations', async () => {
    const ctx = await h.context('desktop');
    const a = await h.page(ctx, { tag: 'a7-admin' });
    await patchManifest(a, "status: 'beta', liveSafe: false");          // beta → the switch works; not liveSafe → safe mode switches it off
    await a.goto(h.url('admin.html', { phase: null })); await a.waitForSelector('#main:not([hidden])');
    const g = await h.page(ctx, { tag: 'a7-guest' });                    // "the other tab" (same demo world)
    await patchManifest(g, "status: 'beta', liveSafe: false");
    await g.goto(h.url('index.html', { phase: null })); await g.waitForTimeout(500);
    await a.click('#atabs [data-tab="settings"]'); await a.waitForSelector(row('_selftest'));
    h.check('a beta feature is switchable (not greyed)', await a.evaluate(sel => !document.querySelector(sel).classList.contains('planned') && !document.querySelector(sel + ' .fswitch').disabled, row('_selftest')));
    const rowState = sel => a.evaluate(s => [document.querySelector(s + ' .fswitch').getAttribute('aria-checked'), document.querySelector(s + ' .fswitch-txt').textContent, document.querySelector(s + ' .fwhy').textContent, !document.querySelector(s + ' .fdefault').hidden], sel);
    h.eq('beta without a flag: switch off, in plain words, no "기본값으로"', await rowState(row('_selftest')), ['false', '꺼짐', '⏸ 꺼짐 — 켜면 바로 보여요', false]);
    await a.click('#set-adv summary');                                                     // the advanced box: phase · safe mode · reset

    // --- the switch (an admin flag) and "기본값으로" (back to the manifest default)
    await a.click(row('_selftest', '.fswitch'));
    const lat = await latency(g, () => !!document.querySelector('[data-st="welcome"]'), null, 4000);
    h.check(`A7 "켜기" reaches the other tab in < 1 s (${Math.round(lat)} ms)`, lat < 1000);
    h.eq('A7 saved: app/settings.features._selftest === true', (await settingsDoc(a))?.features?._selftest, true);
    h.eq('the row shows the new state (켜짐 — 지금 하객에게 보여요) and offers "기본값으로"', await rowState(row('_selftest')), ['true', '켜짐', '✅ 켜짐 — 지금 하객에게 보여요', true]);
    h.check('"마지막 변경" shows a time now', (await text(a, '#set-updated')).startsWith('마지막 변경'), await text(a, '#set-updated'));

    // --- safe mode
    await a.click('#btn-safe');
    const latSafe = await latency(g, () => !document.querySelector('[data-st="welcome"]'), null, 4000);
    h.check(`A7 safe mode switches the non-liveSafe feature off on the other tab in < 1 s (${Math.round(latSafe)} ms)`, latSafe < 1000);
    h.eq('A7 saved: app/settings.safe === true', (await settingsDoc(a))?.safe, true);
    h.eq('both safe buttons say 켜짐 and the row explains why the feature is off', await a.evaluate(sel => [document.querySelector('#btn-safe').getAttribute('aria-pressed'), document.querySelector('#set-safe').textContent, document.querySelector(sel + ' .fwhy').textContent], row('_selftest')), ['true', '켜짐', '🛡 본식 안전 모드라 잠시 꺼짐']);
    await a.click('#set-safe');                                                                   // the second button toggles it back
    h.check('safe mode off again from the ⚙️ button → the feature is back on the other tab', await until(g, () => !!document.querySelector('[data-st="welcome"]'), null, 4000));
    h.eq('app/settings.safe === false again', (await settingsDoc(a))?.safe, false);

    // --- quiet mode (app/live)
    await a.click('#btn-quiet');
    const t1 = Date.now(); let quietSeen = false;
    while (Date.now() - t1 < 4000 && !quietSeen) { quietSeen = (await busLast(g, 'live'))?.quiet === true; if (!quietSeen) await g.waitForTimeout(25); }
    h.check(`A7 quiet mode reaches the other tab in < 1 s (${Date.now() - t1} ms)`, quietSeen && Date.now() - t1 < 1000);
    h.eq('saved: app/live.quiet === true · button says 켜짐', [(await dbGet(h, a, 'app/live'))?.quiet, await text(a, '#btn-quiet')], [true, '🤫 조용 모드: 켜짐']);
    await a.click('#btn-quiet'); await a.waitForTimeout(300);
    h.eq('quiet off again', [(await dbGet(h, a, 'app/live'))?.quiet, await text(a, '#btn-quiet')], [false, '🤫 조용 모드: 꺼짐']);

    // --- forced phase: asks first, cancel keeps everything
    h.eq('the other tab runs on the clock phase (pre) before the override', await g.evaluate(() => document.documentElement.dataset.phase), 'pre');
    await a.selectOption('#set-phase-sel', 'live');
    h.check('choosing a phase opens the confirm bar with the warning', (await text(a, '#set-phase-ask')).includes('모든 하객 화면이 바뀝니다. 리허설은 주소에 ?phase= 를 쓰세요') && await visible(a, '#set-phase-confirm'));
    h.eq('nothing is written before the confirmation', (await settingsDoc(a))?.phase ?? 'auto', 'auto');
    await a.click('#set-phase-cancel');
    h.eq('cancel closes the bar and puts the select back to 자동', [await visible(a, '#set-phase-confirm'), await a.inputValue('#set-phase-sel')], [false, 'auto']);
    await a.selectOption('#set-phase-sel', 'live'); await a.click('#set-phase-ok');
    const latP = await latency(g, () => document.documentElement.dataset.phase === 'live', null, 4000);
    h.check(`A7 forced phase reaches the other tab in < 1 s (${Math.round(latP)} ms)`, latP < 1000);
    h.eq('saved: app/settings.phase === live', (await settingsDoc(a))?.phase, 'live');
    h.eq('this tab shows the forced phase and its source', await a.evaluate(() => [document.querySelector('#set-phase-now').textContent, document.querySelector('#set-phase-src').textContent.includes('강제')]), ['본식 당일 (live)', true]);
    await a.selectOption('#set-phase-sel', 'auto'); await a.click('#set-phase-ok');
    h.check('back to 자동 → the other tab is on the clock phase again', await until(g, () => document.documentElement.dataset.phase === 'pre', null, 4000));

    // --- reset: three presses (button + 2 confirmations); only the flags go — cfg and safe stay
    await setCfg(h, a, '_selftest', { keep: 7 });
    await a.click(row('_selftest', '.fswitch'));                                          // on → off
    h.check('switching off is a flag too (features._selftest === false)', await until(a, async () => (await (await (await import('/js/core/docdb.js')).getDB()).doc('app/settings').get())?.features?._selftest === false, null, 3000));
    await a.click('#set-reset');
    h.check('reset press 1: asks (1/2), nothing written', (await text(a, '#set-reset')).includes('1/2') && (await settingsDoc(a))?.features?._selftest === false);
    await a.click('#set-reset');
    h.check('reset press 2: last confirmation (2/2), still nothing written', (await text(a, '#set-reset')).includes('2/2') && (await settingsDoc(a))?.features?._selftest === false);
    await a.click('#set-reset');
    h.check('reset press 3 clears the flags', await until(a, async () => Object.keys((await (await (await import('/js/core/docdb.js')).getDB()).doc('app/settings').get())?.features || {}).length === 0, null, 3000));
    h.eq('…but cfg stays, and the button is back to normal', [(await settingsDoc(a))?.cfg?._selftest, await text(a, '#set-reset')], [{ keep: 7 }, '모든 기능 기본값으로']);
    h.eq('the row is back on the default (beta → off, no "기본값으로")', await rowState(row('_selftest')), ['false', '꺼짐', '⏸ 꺼짐 — 켜면 바로 보여요', false]);
    // "기본값으로" on its own: switch on → the link → the flag is gone again
    await a.click(row('_selftest', '.fswitch'));
    h.check('switch on again → "기본값으로" shows', await until(a, s => !document.querySelector(s + ' .fdefault').hidden, row('_selftest'), 3000));
    await a.click(row('_selftest', '.fdefault'));
    h.check('"기본값으로" removes the flag (features._selftest undefined)', await until(a, async () => (await (await (await import('/js/core/docdb.js')).getDB()).doc('app/settings').get())?.features?._selftest === undefined, null, 3000));
    await h.shot(a, 'admin-3-settings-switches');
  });

  // ============================================================ _selftest on the admin page: every ctx.admin API once, then off → zero trace
  await h.step('_selftest on admin: tab · live slot · settings box · cfg · live · alert · download · backup parts · docdb; hot off leaves nothing', async () => {
    const ctx = await h.context('desktop');
    const a = await openAdmin(ctx, 'admin-st', { patch: "status: 'beta'", params: { phase: null } });
    h.eq('without the flag nothing of _selftest exists on admin', (await footprint(a, '_selftest')).nodes, 0);
    await setFlag(h, a, '_selftest', true);
    await ready(a, 'admin');
    h.eq('the tab button lands between 리포트 (40) and ⚙️ 설정 (90) — sorted by order', await tabKeys(a), ['guests', 'snaps', 'capsules', 'report', 'f-_selftest', 'settings']);
    h.eq('the tab label is the feature\'s (a function of the language)', await text(a, '#atabs [data-tab="f-_selftest"]'), '🧪 점검');
    h.check('the live slot shows the feature\'s button', await visible(a, '#live-slot [data-st="admin-live-btn"]'));
    await a.click('[data-st="admin-live-btn"]');
    h.eq('…and it works', (await badge(a)).liveClicks, '1');
    const ev0 = JSON.parse((await badge(a)).ev);
    h.eq('replayed sticky events reached the feature during setup (admin:tab · admin:guests)', [ev0['admin:tab'].last, ev0['admin:guests'].last], ['guests', 0]);

    await h.flows.addGuests(h, a, 3, '점검');
    h.check('admin:guests fires on every snapshot with the full list', await until(a, () => JSON.parse(document.querySelector('[data-st="badge"]').dataset.ev)['admin:guests'].last === 3, null, 6000));

    await a.click('#atabs [data-tab="f-_selftest"]');
    h.check('the feature tab opens (its section shows, the others hide)', await a.evaluate(() => !document.querySelector('#tab-f-_selftest').hidden && document.querySelector('#tab-guests').hidden && document.querySelector('#atabs [data-tab="f-_selftest"]').getAttribute('aria-selected') === 'true'));
    h.eq('onShow ran once; admin:tab says f-_selftest', [(await badge(a)).adminShow, JSON.parse((await badge(a)).ev)['admin:tab'].last], ['1', 'f-_selftest']);
    const info = JSON.parse(await text(a, '[data-st="admin-info"]'));
    h.eq('ctx.admin.guests() · user() inside the tab', [info.guests, info.user], [3, 'demo']);
    await a.click('[data-st="admin-alert"]');
    h.eq('ctx.admin.alert shows on the top status line (visible from any tab)', [await visible(a, '#admin-alert'), await text(a, '#admin-alert')], [true, 'selftest alert']);
    await a.click('[data-st="admin-cfg"]'); await a.waitForFunction(() => document.querySelector('[data-st="admin-out"]').textContent === 'cfg ok', null, { timeout: 5000 });
    h.eq('ctx.admin.saveCfg merges into app/settings.cfg._selftest', (await settingsDoc(a))?.cfg?._selftest?.probe, 5);
    await a.click('[data-st="admin-live"]'); await a.waitForFunction(() => document.querySelector('[data-st="admin-out"]').textContent === 'live ok', null, { timeout: 5000 });
    const live = await dbGet(h, a, 'app/live');
    h.eq('ctx.admin.setLive merges into app/live (updatedAt added)', [live?.msg, typeof live?.updatedAt], [{ ko: '점검 공지', en: 'self-test notice' }, 'number']);
    const dl = await h.download(a, () => a.click('[data-st="admin-download"]'), 'selftest-download.txt', 10000);
    h.eq('ctx.admin.downloadBlob hands the file to the browser', dl && fs.readFileSync(dl, 'utf8'), 'self-test');
    await a.click('[data-st="admin-photo"]'); await a.waitForFunction(() => document.querySelector('[data-st="admin-out"]').textContent.startsWith('photo'), null, { timeout: 5000 });
    h.eq('ctx.admin.photo resolves (no guest has a photo → none)', await text(a, '[data-st="admin-out"]'), 'photo none');
    await a.click('#atabs [data-tab="guests"]');
    h.eq('leaving the tab runs onHide once', (await badge(a)).adminHide, '1');
    h.eq('docdb round trip with admin rights inside setup', (await badge(a)).adminDb, 'doc');

    // the settings box under the feature's row
    await a.click('#atabs [data-tab="settings"]'); await a.waitForSelector(row('_selftest'));
    h.check('⚙️ row: the feature\'s settings box is there (collapsible)', await a.evaluate(sel => { const d = document.querySelector(sel + ' .fmore'); return !d.hidden && !!d.querySelector('[data-st="admin-settings-box"]'); }, row('_selftest')));
    await a.click(row('_selftest', '.fmore summary'));
    h.check('…opens and shows the feature\'s content, with its cfg', await visible(a, '[data-st="admin-settings-box"]') && (await text(a, '[data-st="admin-cfg-view"]')).includes('probe'));
    await h.shot(a, 'admin-4-settings-with-box');
    await a.click('#atabs [data-tab="f-_selftest"]'); await a.waitForTimeout(250);
    const lr = await h.layoutReport(a);
    h.check('feature tab + live slot (desktop): no overlaps · no sideways scroll · targets', lr.overlaps.length === 0 && !lr.hscroll && lr.small.length === 0, JSON.stringify(lr));
    await h.shot(a, 'admin-5-feature-tab');

    // backup parts
    const zipPath = await h.download(a, () => a.click('#btn-zip'), 'backup-selftest.zip', 90000);
    const buf = zipPath ? fs.readFileSync(zipPath) : Buffer.alloc(0), names = zipEntries(buf);
    h.check('backup keeps the v3.2 files (csv · json · report)', ['guestbook.csv', 'guestbook.json', 'report.png'].every(n => names.includes(n)), names.join(','));
    h.check('backup has app/settings.json and app/live.json', names.includes('app/settings.json') && names.includes('app/live.json'), names.join(','));
    h.eq('app/settings.json carries the saved cfg', JSON.parse(zipRead(buf, 'app/settings.json') || '{}').cfg?._selftest?.probe, 5);
    h.check('a feature part writes under f-<id>/', names.includes('f-_selftest/probe.json') && JSON.parse(zipRead(buf, 'f-_selftest/probe.json') || '{}').guests === 3);
    h.check('a part that breaks the path rule is dropped as a whole (its good file too)', !names.includes('f-_selftest/half.txt') && !names.includes('outside.txt'), names.join(','));
    const missing = zipRead(buf, 'MISSING.txt') || '';
    h.check('…and named in MISSING.txt while the rest of the backup went on', missing.includes('기능 _selftest: bad-path') && missing.includes('outside.txt'), missing);
    h.check('the status line counts the missing part', (await text(a, '#zip-status')).includes('빠진 항목 1개'), await text(a, '#zip-status'));

    // hot off: the active feature tab goes away, the page lands on 방명록, nothing is left
    await setFlag(h, a, '_selftest', false);
    h.check('flag off → the feature tab is gone', await until(a, () => !document.querySelector('#tab-f-_selftest') && !document.querySelector('#atabs [data-tab="f-_selftest"]'), null, 8000));
    await a.waitForTimeout(150);
    h.eq('the admin never stays on a vanished tab (only 방명록 visible, admin:tab = guests)', [await a.evaluate(() => [...document.querySelectorAll('main > section[id^="tab-"]')].filter(s => !s.hidden).map(s => s.id)), await busLast(a, 'admin:tab')], [['tab-guests'], { key: 'guests' }]);
    await expectClean(h, a, '_selftest', 'A2 admin hot off');
    h.eq('A2 hot off: tabs · live slot · settings box are gone', await a.evaluate(sel => [[...document.querySelectorAll('#atabs button')].map(b => b.dataset.tab).join(), document.querySelector('#live-slot').children.length, document.querySelector(sel + ' .fmore').hidden, document.querySelector(sel + ' .fmore-host').children.length], row('_selftest')), ['guests,snaps,capsules,report,settings', 0, true, 0]);
    const st = await featureState(a, '_selftest');
    h.eq('A2 hot off: no listeners · timers · raf · watchers · bus subscriptions left', st && st.live, { listeners: 0, timers: 0, raf: 0, watchers: 0, bus: 0 });
    const zip2 = await h.download(a, () => a.click('#btn-zip'), 'backup-after-off.zip', 90000);
    const names2 = zip2 ? zipEntries(fs.readFileSync(zip2)) : [];
    h.check('a switched-off feature no longer contributes a backup part (and nothing is missing)', names2.includes('guestbook.csv') && !names2.some(n => n.startsWith('f-_selftest/')) && !names2.includes('MISSING.txt'), names2.join(','));
    // and on again — everything is back, nothing duplicated
    await setFlag(h, a, '_selftest', true);
    h.check('flag on again → tab · live button · settings box are back (once each)', await until(a, () => document.querySelectorAll('#atabs [data-tab="f-_selftest"]').length === 1 && document.querySelectorAll('#live-slot [data-st="admin-live-btn"]').length === 1 && document.querySelectorAll('[data-st="admin-settings-box"]').length === 1, null, 8000));
  });

  await h.step('A3 fcrash=_selftest on admin: the breaker trips, the admin page keeps working and the ⚙️ row says so', async () => {
    const a = await openAdmin(await h.context('desktop'), 'admin-crash', { params: { ...ST, fcrash: '_selftest', phase: null } });
    h.check('the breaker trips on the admin page', await until(a, async () => (await (await import('/js/core/features.js')).featureStates()).find(s => s.id === '_selftest')?.tripped === true, null, 15000));
    await a.waitForTimeout(300);
    await expectClean(h, a, '_selftest', 'admin tripped');
    h.eq('tripped: tabs back to the core five, live slot empty', await a.evaluate(() => [[...document.querySelectorAll('#atabs button')].map(b => b.dataset.tab).join(), document.querySelector('#live-slot').children.length]), ['guests,snaps,capsules,report,settings', 0]);
    await a.click('#atabs [data-tab="settings"]'); await a.waitForSelector(row('_selftest'), { state: 'attached' });
    h.check('the row shows ⛔ with the last error', (await text(a, row('_selftest', '.ferr'))).startsWith('⛔ 이번 세션 꺼짐'), await text(a, row('_selftest', '.ferr')));
    await a.click('#atabs [data-tab="guests"]');
    await h.flows.addGuests(h, a, 2, '크래시');
    h.check('the guest grid still renders new guests', await until(a, () => document.querySelectorAll('#grid .gcard').length === 2, null, 6000));
  });

  // ============================================================ the village (session ③)
  await villageSteps(h, { ST, badge, visible, text, until, ready, patchManifest });
};

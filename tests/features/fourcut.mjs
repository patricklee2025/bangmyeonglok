// ============================================================
//  WP-12 fourcut — docs/v4/wp/WP-12-fourcut.md · 04-testing §4.1 (S1–S9) + A1–A9 (Chromium's fake camera)
//  4 shots (or 4 album photos) → an 800×2400 pixel photo strip to save/share + a 1200×960 2×2 for the TV photo wall (one snap slot).
// ============================================================
import fs from 'node:fs';
import { signGuest } from '../lib/flows.mjs';
import { isJpeg } from '../lib/files.mjs';
import { on, off, adminPage, setFlag, expectClean, expectDefault } from '../lib/v4.mjs';

const ID = 'fourcut';
export const meta = { title: 'fourcut: camera 4 shots / album 4 → strip 800×2400 + grid 1200×960 · pixel effect · save · TV photo wall · camera off on leave', timeout: 480000, tags: ['slow'] };

const HANGUL = /[ㄱ-힝]/;
const until = async (page, fn, arg, ms = 8000) => { const t0 = Date.now(); do { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(100); } while (Date.now() - t0 < ms); return false; };
const RECORD = `(() => { window.__su = []; import('/js/core/bus.js').then(b => b.on('snap:uploaded', p => window.__su.push(p))); })();`;
const row = p => p.$('#s-done section.hub-row[data-hub="f-fourcut"]');
const liveVideo = p => p.evaluate(() => window.__live ? window.__live('video') : -1);
const result = p => p.evaluate(() => { const i = document.querySelector('#s-f-fourcut-result .f-fourcut-preview'); return i?.dataset.w ? { w: +i.dataset.w, h: +i.dataset.h, gw: +i.dataset.gw, gh: +i.dataset.gh, pixel: i.dataset.pixel, frame: i.dataset.frame, src: i.src.length + ':' + i.src.slice(-80) } : null; });
const ready = p => until(p, () => !!document.querySelector('#s-f-fourcut-result.active .f-fourcut-preview[data-w]') && !document.querySelector('#s-f-fourcut-result .f-fourcut-save').disabled, null, 20000);

async function openFourcut(h, p, params = {}) {
  const r = await row(p); await r.scrollIntoViewIfNeeded(); await r.click();
  return until(p, () => !!document.querySelector('#s-f-fourcut.active'));
}

export default async (h) => {
  // ---------------------------------------------------------------- S1 off
  await h.step('S1 off: no row on the done screen; the core done screen is complete', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'off' });
    await signGuest(h, p, { name: '끄기', msg: '끄기', params: { ff: off(ID) } });
    await expectClean(h, p, ID, 'S1 done screen');
    h.check('S1 the core snap uploader is there', await p.isVisible('#snap-done .snap-actions'));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A2 · A3 · A4 · A5 · A8 the camera path
  let world = null, g = null, gid = null;
  await h.step('A2 camera: row order 70 → preview (camera on) → 3·2·1 + 4 shots → strip 800×2400 · grid 1200×960', async () => {
    world = await h.context('phone');
    g = await h.page(world, { tag: 'guest', spyMedia: true });
    await g.addInitScript(RECORD);
    gid = (await signGuest(h, g, { name: '네컷하객', msg: '찰칵', params: { ff: on(ID) } })).gid;
    const r = await row(g);
    h.eq('S2 the row: order 70 · 📸 · "픽셀 네컷"', r && await r.evaluate(n => [n.style.order, n.querySelector('.hub-ico').textContent, n.querySelector('.hub-title').textContent]), ['70', '📸', '픽셀 네컷']);
    h.check('S2 the row opens the capture screen', await openFourcut(h, g));
    h.check('A2 the front camera is on (one live video track)', await until(g, () => window.__live?.('video') === 1, null, 8000));
    await g.waitForTimeout(500);
    await h.shot(g, 'fourcut-1-capture');
    await g.click('#s-f-fourcut .f-fourcut-start');
    h.check('A2 the countdown shows 3', await until(g, () => document.querySelector('#s-f-fourcut .f-fourcut-count')?.textContent === '3', null, 3000));
    h.check('A2 progress dots fill to 2 of 4 along the way', await until(g, () => document.querySelector('#s-f-fourcut .f-fourcut-dots')?.dataset.n === '2', null, 12000));
    h.check('A2 after 4 shots → the result screen', await ready(g));
    const res = await result(g);
    h.eq('A2 strip 800×2400 · grid 1200×960 · pixel on · pink', res && [res.w, res.h, res.gw, res.gh, res.pixel, res.frame], [800, 2400, 1200, 960, 'true', 'pink']);
    h.check('A8 the camera is off on the result screen', await until(g, () => window.__live?.('video') === 0, null, 3000));
    await h.shot(g, 'fourcut-2-result');
  });

  await h.step('A3 pixel effect on/off → a different image · frame colour → a different image', async () => {
    const a = await result(g);
    await g.click('#s-f-fourcut-result .f-fourcut-pixel');
    await ready(g);
    h.check('A3 pixel off: a different strip', await until(g, s => { const i = document.querySelector('#s-f-fourcut-result .f-fourcut-preview'); return i.dataset.pixel === 'false' && (i.src.length + ':' + i.src.slice(-80)) !== s; }, a.src, 15000));
    const b = await result(g);
    await g.click('#s-f-fourcut-result .f-fourcut-fbtn[data-frame="night"]');
    h.check('A3 night frame: a different strip again', await until(g, s => { const i = document.querySelector('#s-f-fourcut-result .f-fourcut-preview'); return i.dataset.frame === 'night' && (i.src.length + ':' + i.src.slice(-80)) !== s; }, b.src, 15000));
    await h.shot(g, 'fourcut-3-night-nopixel');
    await g.click('#s-f-fourcut-result .f-fourcut-pixel');
    await ready(g);
  });

  await h.step('A4 save → a JPEG download named pixel-fourcut-<code>.jpg', async () => {
    const code = await g.evaluate(async id => (await import('/js/core/ui.js')).guestCode(id), gid);
    let name = null;
    const file = await h.download(g, async () => { g.once('download', d => { name = d.suggestedFilename(); }); await g.click('#s-f-fourcut-result .f-fourcut-save'); }, 'fourcut-strip.jpg');
    h.check('A4 a JPEG', !!file && isJpeg(fs.readFileSync(file)));
    h.eq('A4 the file name', name, `pixel-fourcut-${code}.jpg`);
    const dims = await g.evaluate(async src => { const i = new Image(); i.src = src; await i.decode(); return [i.naturalWidth, i.naturalHeight]; }, 'data:image/jpeg;base64,' + fs.readFileSync(file).toString('base64'));
    h.eq('A4 …of 800×2400', dims, [800, 2400]);
  });

  await h.step('A5 TV photo wall: one snap slot (where "feature") · the TV shows the polaroid · "남은 n장" goes down', async () => {
    const tv = await h.page(world, { tag: 'tv' });
    await tv.setViewportSize({ width: 1920, height: 1080 });
    await tv.goto(h.url('village.html', { tv: 1, time: 'day' }));
    await until(tv, () => /^\d+$/.test(document.querySelector('#count-n')?.textContent || ''));
    await tv.mouse.click(300, 1000).catch(() => {});
    await tv.waitForTimeout(2500);                                                   // the TV's first snap list is in (a later snap is "new" → polaroid now)
    const before = await g.evaluate(async id => (await import('/js/snaps.js')).mySnaps(id).n, gid);
    h.eq('A5 the button says 5 left', await g.textContent('#s-f-fourcut-result .f-fourcut-tv'), `📺 TV 포토월에 올리기 (남은 ${5 - before}장)`);
    await g.click('#s-f-fourcut-result .f-fourcut-tv');
    h.check('A5 "TV로 보냈어요!"', await until(g, () => /TV로 보냈어요/.test(document.querySelector('#s-f-fourcut-result .f-fourcut-rmsg')?.textContent || ''), null, 10000));
    h.check('A5 snap:uploaded { gid, where: "feature" } with the caption', await g.evaluate(id => window.__su.length === 1 && window.__su[0].gid === id && window.__su[0].where === 'feature' && window.__su[0].caption === '📸 픽셀 네컷', gid));
    h.eq('A5 one more of my snap slots used', await g.evaluate(async id => (await import('/js/snaps.js')).mySnaps(id).n, gid), before + 1);
    h.eq('A5 the button now says 4 left', await g.textContent('#s-f-fourcut-result .f-fourcut-tv'), `📺 TV 포토월에 올리기 (남은 ${4 - before}장)`);
    h.check('A5 the TV shows the polaroid with the strip', await until(tv, () => document.querySelector('#polaroid')?.classList.contains('on') && /픽셀 네컷/.test(document.querySelector('#pol-cap')?.textContent || ''), null, 30000));
    await h.shot(tv, 'fourcut-4-tv-polaroid');
    await tv.close();
  });

  await h.step('A8 leaving the capture screen turns the camera off right away', async () => {
    await g.click('#s-f-fourcut-result .f-fourcut-again');
    h.check('A8 back on the capture screen the camera is on again', await until(g, () => window.__live?.('video') === 1, null, 8000));
    await g.click('#s-f-fourcut .f-fourcut-back');
    h.check('A8 after "이전": 0 live video tracks', await until(g, () => window.__live?.('video') === 0, null, 3000));
  });

  await h.step('A6 all 5 snap slots used → the TV button is disabled and says so', async () => {
    const left = await g.evaluate(async id => { const s = await import('/js/snaps.js'); return 5 - s.mySnaps(id).n; }, gid);
    for (let i = 0; i < left; i++) await g.evaluate(async ([id, k]) => { const c = document.createElement('canvas'); c.width = 40; c.height = 30; c.getContext('2d').fillRect(0, 0, 40, 30); await (await import('/js/snaps.js')).uploadSnapData(id, '네컷하객', c.toDataURL('image/jpeg', 0.8), 'fill ' + k, 'feature'); }, [gid, i]);
    const r = await row(g); await r.scrollIntoViewIfNeeded(); await r.click();
    await until(g, () => !!document.querySelector('#s-f-fourcut.active'));
    await g.setInputFiles('#s-f-fourcut .f-fourcut-file', ['face0.jpg', 'face1.jpg', 'face2.jpg', 'face3.jpg'].map(f => h.fixture(f)));
    await ready(g);
    h.check('A6 the TV button is disabled', await g.evaluate(() => document.querySelector('#s-f-fourcut-result .f-fourcut-tv').disabled));
    h.eq('A6 …and says the slots are used up', await g.textContent('#s-f-fourcut-result .f-fourcut-tv'), '사진 칸을 모두 썼어요');
    await world.close();
  });

  // ---------------------------------------------------------------- A7 album · S5 no camera
  await h.step('A7 album: 2 photos → "(2/4)" → 2 more → the same strip/grid sizes · a broken file asks for another', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'album', spyMedia: true });
    await signGuest(h, p, { name: '앨범', msg: '앨범', params: { ff: on(ID) } });
    await openFourcut(h, p);
    await p.setInputFiles('#s-f-fourcut .f-fourcut-file', ['face0.jpg', 'face1.jpg'].map(f => h.fixture(f)));
    h.check('A7 two picked → "사진을 4장 골라주세요 (2/4)"', await until(p, () => /\(2\/4\)/.test(document.querySelector('#s-f-fourcut .f-fourcut-msg')?.textContent || '')));
    const bad = h.fixture('face2.jpg').replace(/face2\.jpg$/, 'SOURCES.md');
    await p.setInputFiles('#s-f-fourcut .f-fourcut-file', [bad]);
    h.check('A7 a file that is not an image → "이 사진은 열 수 없어요"', await until(p, () => /열 수 없어요/.test(document.querySelector('#s-f-fourcut .f-fourcut-msg')?.textContent || '')));
    await p.setInputFiles('#s-f-fourcut .f-fourcut-file', ['face2.jpg', 'face3.jpg', 'face4.jpg'].map(f => h.fixture(f)));
    h.check('A7 four → the result', await ready(p));
    const res = await result(p);
    h.eq('A7 the same sizes as the camera path', res && [res.w, res.h, res.gw, res.gh], [800, 2400, 1200, 960]);
    await h.shot(p, 'fourcut-5-album-result');
    await ctx.close();
  });

  await h.step('S5 no camera → the album is the way (start disabled, hint shown)', async () => {
    const ctx = await h.context('phone', { permissions: [] });
    const p = await h.page(ctx, { tag: 'nocam' });
    await p.addInitScript(() => { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })); });
    await signGuest(h, p, { name: '카메라없음', msg: '없음', params: { ff: on(ID) } });
    await openFourcut(h, p);
    h.check('S5 "카메라를 쓸 수 없어요" + start disabled', await until(p, () => /카메라를 쓸 수 없어요/.test(document.querySelector('#s-f-fourcut .f-fourcut-msg')?.textContent || '') && document.querySelector('#s-f-fourcut .f-fourcut-start').disabled));
    h.check('S5 the album button still works', await p.isEnabled('#s-f-fourcut .f-fourcut-album'));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A9 layout · gates · English · hot toggle
  await h.step('A9 layout phoneSE: capture and result screens — no overlaps, tap targets OK', async () => {
    const ctx = await h.context('phoneSE');
    const p = await h.page(ctx, { tag: 'se' });
    await signGuest(h, p, { name: '배치', msg: '배치', params: { ff: on(ID) } });
    await openFourcut(h, p); await p.waitForTimeout(800);
    let r = await h.layoutReport(p);
    h.check('A9 capture: no overlaps · no sideways scroll · tap targets', !r.overlaps.length && !r.hscroll && !r.small.length, JSON.stringify(r).slice(0, 300));
    await h.shot(p, 'fourcut-6-phoneSE-capture');
    await p.setInputFiles('#s-f-fourcut .f-fourcut-file', ['face0.jpg', 'face1.jpg', 'face2.jpg', 'face3.jpg'].map(f => h.fixture(f)));
    await ready(p);
    r = await h.layoutReport(p);
    h.check('A9 result: no overlaps · no sideways scroll · tap targets', !r.overlaps.length && !r.hscroll && !r.small.length, JSON.stringify(r).slice(0, 300));
    await h.shot(p, 'fourcut-7-phoneSE-result');
    await ctx.close();
  });

  await h.step('S5 / S4 gates: simple mode hides the row · kiosk never · ?phase=pre nothing · ?phase=after the row is there', async () => {
    const ctx = await h.context('phone');
    const s = await h.page(ctx, { tag: 'simple' });
    await signGuest(h, s, { name: '어르신', msg: '축하', simple: true, params: { ff: on(ID) } });
    h.check('S5 simple mode: no row', !(await row(s)) || !(await (await row(s)).isVisible()));
    const k = await h.page(ctx, { tag: 'kiosk' });
    await k.goto(h.url('kiosk.html', { ff: on(ID) })); await k.waitForTimeout(800);
    await expectClean(h, k, ID, 'S4 kiosk');
    const pre = await h.page(ctx, { tag: 'pre' });
    await signGuest(h, pre, { name: '미리', msg: '미리', params: { ff: on(ID), phase: 'pre' } });
    await expectClean(h, pre, ID, 'S4 guest page in pre');
    const after = await h.page(ctx, { tag: 'after' });
    await signGuest(h, after, { name: '나중', msg: '나중', params: { ff: on(ID), phase: 'after' } });
    h.check('S4 after: the row is there', !!(await row(after)));
    await ctx.close();
  });

  await h.step('S6 English: row, capture and result screens without Hangul', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'en' });
    await signGuest(h, p, { name: 'Noah', msg: 'Congrats!', lang: 'en', params: { ff: on(ID) } });
    h.eq('S6 row', await p.textContent('#s-done section.hub-row[data-hub="f-fourcut"] .hub-title'), 'Pixel photo strip');
    await openFourcut(h, p);
    h.check('S6 capture screen', !HANGUL.test(await p.textContent('#s-f-fourcut')));
    await p.setInputFiles('#s-f-fourcut .f-fourcut-file', ['face0.jpg', 'face1.jpg', 'face2.jpg', 'face3.jpg'].map(f => h.fixture(f)));
    await ready(p);
    h.check('S6 result screen', !HANGUL.test(await p.textContent('#s-f-fourcut-result')), await p.textContent('#s-f-fourcut-result'));
    await ctx.close();
  });

  await h.step('S3 hot toggle: off by default → on → row → off while on the capture screen → camera off, back on a core screen', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'hot', spyMedia: true });
    await signGuest(h, p, { name: '토글', msg: '토글' });
    await expectDefault(h, p, ID, 'S3 default (no ?ff, no admin flag)');
    const a = await adminPage(h, ctx);
    await setFlag(h, a, ID, true);
    h.check('S3 on: the row appears', await until(p, () => !!document.querySelector('#s-done section.hub-row[data-hub="f-fourcut"]')));
    await openFourcut(h, p);
    await until(p, () => window.__live?.('video') === 1, null, 8000);
    await setFlag(h, a, ID, false);
    await until(p, () => !document.querySelector('[data-f="fourcut"]:not(link)'));
    await p.waitForTimeout(300);
    await expectClean(h, p, ID, 'S3 after off');
    h.check('S3 the camera went off with it', await until(p, () => window.__live?.('video') === 0, null, 3000));
    h.check('S3 back on a core screen', await p.evaluate(() => !!document.querySelector('.screen.active') && !document.querySelector('#s-f-fourcut')));
    await setFlag(h, a, ID, null);
    await ctx.close();
  });
};

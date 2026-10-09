// ============================================================
//  WP-05 live — docs/v4/wp/WP-05-live.md · 04-testing §4.1 (S1–S9) + A1–A10
//  The program: admin "다음 ▶" → TV/phone scene + banner + tc title · quiet cues · event cues · stale on reload · ◀ · editor · announcement.
// ============================================================
import { addGuests } from '../lib/flows.mjs';
import { on, off, adminPage, setFlag, setLive, expectClean, dbGet, featureState } from '../lib/v4.mjs';

const ID = 'live';
export const meta = { title: 'live: admin next ▶ → scene + banner + title on TV and phone · quiet · events · stale reload · back · editor · 12 scenes end · announcement', timeout: 720000, tags: ['slow'] };

const HANGUL = /[ㄱ-힝]/;
const MIN_FPS = +(process.env.PERF_MIN_FPS || 24);
const until = async (page, fn, arg, ms = 8000) => { const t0 = Date.now(); do { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(100); } while (Date.now() - t0 < ms); return false; };
const RECORD = `(() => { window.__ve = []; window.__lc = []; import('/js/core/bus.js').then(b => { b.on('village:event', p => window.__ve.push({ ...p, at: performance.now() })); b.on('live:cue', p => window.__lc.push(p)); }); })();`;
const title = p => p.evaluate(() => { const t = document.querySelector('.hud .hz-tc .f-live-title'); return t ? { text: t.textContent, cue: t.dataset.cue, seq: +t.dataset.seq, fresh: t.dataset.fresh, crowd: t.dataset.crowd || '', msg: t.classList.contains('f-live-msg') } : null; });
const events = (p, key) => p.evaluate(k => window.__ve.filter(e => !k || e.key === k), key);
const next = async a => { await until(a, () => !document.querySelector('.f-live-next')?.disabled, null, 4000); await a.click('.f-live-next'); };
const cue = (h, a, id) => setLive(h, a, { cue: id, cueSeq: { $sv: 'inc', n: 1 }, cueAt: { $sv: 'ts' }, quiet: false, msg: null });
const quietOn = p => p.evaluate(() => document.body.classList.contains('quiet'));

async function tvWorld(h, { guests = 12, preset = 'tv' } = {}) {
  const ctx = await h.context(preset);
  const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
  const ids = guests ? await addGuests(h, a, guests, '하객') : [];
  const tv = await h.page(ctx, { tag: 'tv' });
  await tv.addInitScript(RECORD);
  await tv.goto(h.url('village.html', { ff: on(ID), time: 'day' }));
  await until(tv, () => /^\d+$/.test(document.querySelector('#count-n')?.textContent || ''));
  for (let i = 0; i < 50; i++) { const st = await featureState(tv, ID).catch(() => null); if (st?.on) break; await tv.waitForTimeout(200); }   // a cue written before the feature booted counts as "from before" (no scene)
  await tv.waitForTimeout(300);
  await tv.mouse.click(300, 1000).catch(() => {});
  return { ctx, a, tv, ids };
}

export default async (h) => {
  // ---------------------------------------------------------------- S1 off
  await h.step('S1 off: no trace on the TV and admin; the core TV still runs events', async () => {
    const ctx = await h.context('tv');
    const tv = await h.page(ctx, { tag: 'off' });
    await tv.goto(h.url('village.html', { ff: off(ID), seed: 4, time: 'day' })); await tv.waitForTimeout(1200);
    await expectClean(h, tv, ID, 'S1 TV');
    const a = await adminPage(h, ctx, { params: { ff: off(ID) } });
    await expectClean(h, a, ID, 'S1 admin');
    h.check('S1 no 식순 tab', !(await a.$('#atabs [data-tab="f-live"]')));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A2 · A4 · A5 · A6 · A10 the program on one TV
  let W = null;
  await h.step('A2 admin "다음 ▶" → TV title · live:cue · a scene with village:event start · high banner', async () => {
    W = await tvWorld(h);
    const { a, tv } = W;
    h.eq('A2 the live slot starts with "식순 시작 전" and "다음 ▶ 하객 입장"', [await a.textContent('.f-live-now'), await a.textContent('.f-live-next')], ['식순 시작 전', '다음 ▶ 하객 입장']);
    await h.shot(a, 'live-1-admin-slot');
    await next(a);
    h.check('A2 TV title "📋 하객 입장" in the tc zone', await until(tv, () => document.querySelector('.hud .hz-tc .f-live-title')?.textContent === '📋 하객 입장'));
    h.check('A2 live:cue { cue: doors, fresh: true }', await until(tv, () => window.__lc.some(c => c.cue === 'doors' && c.fresh === true)));
    h.check('A2 the button locks for 2 s against double taps', await a.evaluate(() => document.querySelector('.f-live-next').disabled));
    await next(a);                                                                      // → groom: cheer · quiet
    h.check('A2 TV: village:event { key: f-live-cheer, stage: start }', await until(tv, () => window.__ve.some(e => e.key === 'f-live-cheer' && e.stage === 'start'), null, 6000));
    h.eq('A2 the title follows', (await title(tv))?.text, '📋 신랑 입장');
    await tv.waitForTimeout(2500);
    await h.shot(tv, 'live-2-tv-cheer');
  });

  await h.step('A4 a quiet cue turns on quiet mode in the same write; the next non-quiet cue lifts it and its banner shows', async () => {
    const { a, tv } = W;
    h.eq('A4 app/live.quiet = true (groom is a quiet cue)', (await dbGet(h, a, 'app/live'))?.quiet, true);
    h.check('A4 the TV is in quiet mode', await until(tv, () => document.body.classList.contains('quiet')));
    await until(tv, () => window.__ve.some(e => e.key === 'f-live-cheer' && e.stage === 'end'), null, 15000);
    await next(a);                                                                      // bride: aisle · quiet
    await until(tv, () => window.__ve.some(e => e.key === 'f-live-aisle' && e.stage === 'start'), null, 6000);
    await tv.waitForTimeout(5000);
    await h.shot(tv, 'live-3-tv-aisle');
    // jump straight to "declare" from the full list: not quiet + a banner
    const banner = h.waitBanner(tv, /💍 결혼을 축하합니다!/, 40000);
    await until(a, () => !document.querySelector('.f-live-next')?.disabled, null, 4000);
    await a.click('.f-live-alld summary');
    await a.click('.f-live-pick[data-cue="declare"]');
    h.check('A4 declare: quiet goes off', await until(tv, () => !document.body.classList.contains('quiet'), null, 6000));
    h.check('A4 …and the banner "💍 결혼을 축하합니다!" shows (after the queued scenes)', !!(await banner));
    h.check('A2 the kiss scene ran', await until(tv, () => window.__ve.some(e => e.key === 'f-live-kiss' && e.stage === 'start'), null, 30000));
    await h.shot(tv, 'live-4-tv-kiss');
  });

  await h.step('A5 an event cue (사진 촬영) also starts the core group photo', async () => {
    const { a, tv } = W;
    await until(tv, () => window.__ve.some(e => e.key === 'f-live-kiss' && e.stage === 'end'), null, 20000);
    await until(a, () => !document.querySelector('.f-live-next')?.disabled, null, 4000);
    await a.click('.f-live-pick[data-cue="photo"]');
    h.check('A5 village:event { key: group, stage: start } on the TV', await until(tv, () => window.__ve.some(e => e.key === 'group' && e.stage === 'start'), null, 15000));
    h.eq('A5 the title says 사진 촬영', (await title(tv))?.text, '📋 사진 촬영');
    await until(tv, () => window.__ve.some(e => e.key === 'group' && e.stage === 'end'), null, 40000);
  });

  await h.step('A10 announcement: show → in place of the title (TV) · hide → the title is back · the next cue clears it', async () => {
    const { a, tv } = W;
    await a.fill('.f-live-mko', '잠시 후 식사가 시작됩니다');
    await a.fill('.f-live-men', 'Dinner starts in a moment');
    await a.click('.f-live-mshow');
    h.check('A10 the TV shows the announcement in the tc zone', await until(tv, () => { const t = document.querySelector('.hud .hz-tc .f-live-title'); return t?.textContent === '잠시 후 식사가 시작됩니다' && t.classList.contains('f-live-msg'); }));
    await h.shot(tv, 'live-5-tv-announcement');
    await a.click('.f-live-mhide');
    h.check('A10 hide → the cue title again', await until(tv, () => document.querySelector('.hud .hz-tc .f-live-title')?.textContent === '📋 사진 촬영'));
    await a.click('.f-live-mshow');
    await until(tv, () => document.querySelector('.hud .f-live-title')?.classList.contains('f-live-msg'));
    await next(a);                                                                      // → dinner
    h.check('A10 the next cue takes the announcement down', await until(tv, () => document.querySelector('.hud .hz-tc .f-live-title')?.textContent === '📋 식사', null, 6000));
    h.eq('A10 app/live.msg = null', (await dbGet(h, a, 'app/live'))?.msg ?? null, null);
  });

  await h.step('A6 TV reload: no scene replay (not fresh at boot), the title and quiet state come back · ◀ → cueAt null → no scene', async () => {
    const { a, tv } = W;
    await until(tv, () => window.__ve.some(e => e.key === 'f-live-feast' && e.stage === 'end'), null, 40000);
    await tv.reload(); await until(tv, () => !!document.querySelector('.hud .hz-tc .f-live-title'), null, 10000);
    await tv.waitForTimeout(2500);
    h.eq('A6 after reload: the title is back', (await title(tv))?.text, '📋 식사');
    h.eq('A6 after reload: no scene started', (await events(tv)).filter(e => e.stage === 'start').length, 0);
    h.eq('A6 after reload: live:cue fresh = false', await tv.evaluate(() => window.__lc.map(c => c.fresh)), [false]);
    await until(a, () => !document.querySelector('.f-live-prev')?.disabled, null, 4000);
    await a.click('.f-live-prev');
    h.check('A6 ◀ → back to 사진 촬영 (title only)', await until(tv, () => document.querySelector('.hud .hz-tc .f-live-title')?.textContent === '📋 사진 촬영', null, 6000));
    h.eq('A6 ◀ wrote cueAt: null', (await dbGet(h, a, 'app/live'))?.cueAt ?? null, null);
    await tv.waitForTimeout(1500);
    h.eq('A6 ◀: no scene and no group photo', (await events(tv)).filter(e => e.stage === 'start').length, 0);
  });

  // ---------------------------------------------------------------- A3 phone = same scene, same places
  await h.step('A3 a phone page in the same world plays the same scene with the same crowd (same seed)', async () => {
    const { ctx, a, tv, ids } = W;
    const ph = await h.page(ctx, { tag: 'phone' });
    await ph.addInitScript(RECORD);
    await ph.goto(h.url('village.html', { ff: on(ID), me: ids[0], time: 'day' }));
    await until(ph, () => /^\d+$/.test(document.querySelector('#count-n')?.textContent || ''));
    await ph.waitForTimeout(1500);
    await cue(h, a, 'groom');
    h.check('A3 the phone starts f-live-cheer too', await until(ph, () => window.__ve.some(e => e.key === 'f-live-cheer' && e.stage === 'start'), null, 8000));
    await until(tv, () => window.__ve.some(e => e.key === 'f-live-cheer' && e.stage === 'start'), null, 8000);
    const [t1, t2] = [await title(tv), await title(ph)];
    h.check('A3 the same 12 villagers line up on the TV and on the phone', !!t1?.crowd && t1.crowd === t2?.crowd && t1.crowd.split(',').length === 12, JSON.stringify({ tv: t1?.crowd, phone: t2?.crowd }));
    h.eq('A3 the phone shows the same title', t2?.text, '📋 신랑 입장');
    await ph.close();
    await W.ctx.close();
  });

  // ---------------------------------------------------------------- A7 editor
  await h.step('A7 the program editor: rename · switch off · move · save → the TV uses it · back to the default', async () => {
    const { ctx, a, tv } = await tvWorld(h, { guests: 4 });
    await a.click('#atabs [data-tab="f-live"]');
    await a.waitForSelector('.f-live-erow');
    h.eq('A7 16 cues, doors first', await a.$$eval('.f-live-erow', ns => [ns.length, ns[0].dataset.cue]), [16, 'doors']);
    await a.fill('.f-live-erow[data-cue="doors"] .f-live-eko', '손님 맞이');
    await a.uncheck('.f-live-erow[data-cue="groom"] .f-live-ehead input[type=checkbox]');
    await a.click('.f-live-erow[data-cue="rings"] .f-live-up');
    await a.click('.f-live-save');
    h.check('A7 saved', await until(a, () => /저장했어요/.test(document.querySelector('.f-live-out')?.textContent || '')));
    const prog = (await dbGet(h, a, 'app/settings'))?.cfg?.live?.program || [];
    h.check('A7 cfg.live.program: renamed · groom off · rings before vows', prog[0]?.ko === '손님 맞이' && prog.find(c => c.id === 'groom')?.on === false && prog.findIndex(c => c.id === 'rings') < prog.findIndex(c => c.id === 'vows'), JSON.stringify(prog.slice(0, 6)));
    await h.shot(a, 'live-6-admin-editor');
    h.eq('A7 the live slot skips the switched-off cue', await a.evaluate(() => [...document.querySelectorAll('.f-live-pick')].map(b => b.dataset.cue).includes('groom')), false);
    await next(a);
    h.check('A7 the TV uses the new name', await until(tv, () => document.querySelector('.hud .hz-tc .f-live-title')?.textContent === '📋 손님 맞이'));
    h.eq('A7 next after doors is bride (groom is off)', await a.evaluate(() => document.querySelector('.f-live-next').dataset.next), 'bride');
    await a.click('.f-live-reset');
    h.check('A7 reset asks once more', /기본으로 되돌릴까요/.test(await a.textContent('.f-live-reset')));
    await a.click('.f-live-reset');
    h.check('A7 back to the default program', await until(tv, () => document.querySelector('.hud .hz-tc .f-live-title')?.textContent === '📋 하객 입장', null, 6000));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A8 every scene ends
  await h.step('A8 all 12 scenes: each starts, ends within 40 s, and the village is free again (no errors)', async () => {
    const { ctx, a, tv } = await tvWorld(h, { guests: 14 });
    const SC = [['groom', 'cheer'], ['bride', 'aisle'], ['vows', 'hush'], ['rings', 'rings'], ['declare', 'kiss'], ['song', 'sway'], ['march', 'recessional'], ['dinner', 'feast'], ['toast', 'cheers'], ['firstdance', 'firstdance'], ['cake', 'cake'], ['pyebaek', 'bow']];
    for (const [id, scene] of SC) {
      await cue(h, a, id);
      const key = 'f-live-' + scene;
      const started = await until(tv, k => window.__ve.some(e => e.key === k && e.stage === 'start'), key, 10000);
      const ended = await until(tv, k => window.__ve.some(e => e.key === k && e.stage === 'end'), key, 45000);
      const ev = await events(tv, key);
      const dur = ev.length === 2 ? (ev[1].at - ev[0].at) / 1000 : -1;
      h.check(`A8 ${scene}: started · ended in ${dur.toFixed(1)} s (≤ 40)`, started && ended && dur > 0 && dur <= 40.5, JSON.stringify(ev.map(e => e.stage)));
      if (scene === 'firstdance' || scene === 'cake') await h.shot(tv, `live-7-scene-${scene}`);
    }
    const st = await featureState(tv, ID);
    h.check('A8 no feature errors after 12 scenes', st?.on && st.errors === 0 && !st.tripped, JSON.stringify(st));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A9 perf · S3 · S4 · S6
  await h.step(`A9 perf: 50 villagers, the aisle scene running → ≥ ${MIN_FPS} fps`, async () => {
    const ctx = await h.context('tv');
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await addGuests(h, a, 50, '성능');
    const tv = await h.page(ctx, { tag: 'fps', fps: true });
    await tv.addInitScript(RECORD);
    await tv.goto(h.url('village.html', { ff: on(ID), time: 'night' }));
    await tv.waitForTimeout(2500);
    await cue(h, a, 'bride');
    await until(tv, () => window.__ve.some(e => e.key === 'f-live-aisle' && e.stage === 'start'), null, 8000);
    await tv.waitForTimeout(1000);
    await tv.evaluate(() => window.__fps.reset()); await tv.waitForTimeout(5000);
    const fps = await tv.evaluate(() => window.__fps.frames / ((performance.now() - window.__fps.since) / 1000));
    h.check(`A9 ≥ ${MIN_FPS} fps during the scene`, fps >= MIN_FPS, `${fps.toFixed(1)} fps`);
    await ctx.close();
  });

  await h.step('S3 hot toggle: title on the TV → admin off → gone (no trace) → on → back', async () => {
    const ctx = await h.context('tv');
    const a = await adminPage(h, ctx);
    await setFlag(h, a, ID, true);
    await cue(h, a, 'doors');
    const tv = await h.page(ctx, { tag: 'hot' });
    await tv.goto(h.url('village.html', { time: 'day', seed: 3 }));
    h.check('S3 on: the title', await until(tv, () => !!document.querySelector('.f-live-title'), null, 10000));
    await setFlag(h, a, ID, false);
    await until(tv, () => !document.querySelector('[data-f="live"]:not(link)'));
    await tv.waitForTimeout(300);
    await expectClean(h, tv, ID, 'S3 after off');
    await setFlag(h, a, ID, true);
    h.check('S3 on again: one title', await until(tv, () => document.querySelectorAll('.f-live-title').length === 1, null, 10000));
    await setFlag(h, a, ID, null);
    await ctx.close();
  });

  await h.step('S4 gates: guest page never · TV in ?phase=pre nothing · admin loads in pre · S6 English title', async () => {
    const ctx = await h.context('tv');
    const a = await adminPage(h, ctx, { params: { ff: on(ID), phase: 'pre' } });
    h.check('S4 admin (pre): the 식순 tab and the live slot', await until(a, () => !!document.querySelector('#atabs [data-tab="f-live"]') && !!document.querySelector('.f-live-next')));
    await cue(h, a, 'rings');
    const g = await h.page(ctx, { tag: 'guest' });
    await g.goto(h.url('index.html', { ff: on(ID) })); await g.waitForTimeout(800);
    await expectClean(h, g, ID, 'S4 guest page');
    const pre = await h.page(ctx, { tag: 'pre' });
    await pre.goto(h.url('village.html', { ff: on(ID), phase: 'pre', seed: 2, time: 'day' })); await pre.waitForTimeout(1200);
    await expectClean(h, pre, ID, 'S4 TV in pre');
    const en = await h.page(ctx, { tag: 'en' });
    await en.addInitScript(() => localStorage.setItem('wgb_lang', 'en'));
    await en.goto(h.url('village.html', { ff: on(ID), seed: 2, time: 'day' }));
    h.check('S6 English title "📋 Ring exchange"', await until(en, () => document.querySelector('.f-live-title')?.textContent === '📋 Ring exchange'));
    h.check('S6 no Hangul in the title', !HANGUL.test(await en.textContent('.f-live-title')));
    await ctx.close();
  });
};

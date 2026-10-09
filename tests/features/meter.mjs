// ============================================================
//  WP-08 meter — docs/v4/wp/WP-08-meter.md · 04-testing §4.1 (S1–S9) + A1–A8
//  The TV love-o-meter: score from guests · snaps · remote · bingo lines · votes → 36.5–100 ℃, milestones once, admin goal.
// ============================================================
import { addGuests } from '../lib/flows.mjs';
import { on, off, adminPage, setFlag, setCfg, setLive, expectClean, footprint, dbSet, expectDefault, featureState } from '../lib/v4.mjs';

const ID = 'meter';
export const meta = { title: 'meter: TV love-o-meter — the score formula, milestones once, no replay on reload, admin goal, layout, perf', timeout: 480000, tags: ['slow'] };

const HANGUL = /[ㄱ-힝]/;
const MIN_FPS = +(process.env.PERF_MIN_FPS || 24);
const until = async (page, fn, arg, ms = 8000) => { const t0 = Date.now(); do { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(100); } while (Date.now() - t0 < ms); return false; };
const RECORD = `(() => { window.__mm = []; import('/js/core/bus.js').then(b => b.on('meter:milestone', p => window.__mm.push(p))); })();`;
const panel = tv => tv.evaluate(() => { const p = document.querySelector('.hud .hz-tr .f-meter-panel'); return p && { temp: p.dataset.temp, score: +p.dataset.score, target: +p.dataset.target, value: p.querySelector('.f-meter-value').textContent, title: p.querySelector('.f-meter-title').textContent }; });
const tinySnap = (h, page, gid, slot) => h.store(page, async (s, a) => {
  const c = document.createElement('canvas'); c.width = 32; c.height = 24; const g = c.getContext('2d'); g.fillStyle = '#e8a'; g.fillRect(0, 0, 32, 24);
  return s.addSnap(a.gid, 'snap', c.toDataURL('image/jpeg', 0.8), '', a.slot);
}, { gid, slot });
const emote = (h, page, gid) => h.store(page, (s, id) => s.sendEmote(id, 'heart'), gid);

async function tvPage(h, ctx, params = {}) {
  const tv = await h.page(ctx, { tag: 'tv', ...(params.fps ? { fps: true } : {}) });
  await tv.addInitScript(RECORD);
  await tv.goto(h.url('village.html', { ff: on(ID), time: 'day', ...params.url }));
  await until(tv, () => !!document.querySelector('.hud .hz-tr .f-meter-panel[data-target]'), null, 10000);
  return tv;
}

export default async (h) => {
  // ---------------------------------------------------------------- S1 off · phones
  await h.step('S1 off: no trace on the TV and admin · on: still nothing on a phone (A1)', async () => {
    const ctx = await h.context('tv');
    const tv = await h.page(ctx, { tag: 'off' });
    await tv.goto(h.url('village.html', { ff: off(ID), seed: 4, time: 'day' })); await tv.waitForTimeout(1200);
    await expectClean(h, tv, ID, 'S1 TV');
    const a = await adminPage(h, ctx, { params: { ff: off(ID) } });
    await expectClean(h, a, ID, 'S1 admin');
    await ctx.close();
    const pc = await h.context('phone');
    const p = await h.page(pc, { tag: 'phone' });
    await p.goto(h.url('village.html', { ff: on(ID), seed: 4 })); await p.waitForTimeout(1500);
    const f = await footprint(p, ID);
    h.check('A1 phone village with the meter on: no node (setup returns at once)', f.nodes === 0 && f.styles === 0, JSON.stringify(f));
    const g = await h.page(pc, { tag: 'guest' });
    await g.goto(h.url('index.html', { ff: on(ID) })); await g.waitForTimeout(800);
    await expectClean(h, g, ID, 'S4 guest page (not in the manifest pages)');
    await pc.close();
  });

  // ---------------------------------------------------------------- A2 the formula
  await h.step('A2 the score: 10 guests ·10 + 4 snaps ·5 + 7 remote ·1 + 2 bingo lines ·3 + 3 votes ·2 = 139 → 41.7 ℃', async () => {
    const ctx = await h.context('tv');
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    const ids = await addGuests(h, a, 10, '온도');
    for (let i = 0; i < 4; i++) await tinySnap(h, a, ids[i], 0);
    for (let i = 0; i < 4; i++) await emote(h, a, ids[i]);                            // 4 before the TV starts (pulse counts) …
    await dbSet(h, a, 'bingo/' + ids[0], { done: ['m0', 'm1', 'm2', 'm3'], lines: 1, updatedAt: { $sv: 'ts' } });
    await dbSet(h, a, 'bingo/' + ids[1], { done: ['m4', 'm5', 'm6', 'm7'], lines: 1, updatedAt: { $sv: 'ts' } });
    await dbSet(h, a, 'polls/pmeter', { q: { ko: '온도?', en: 'Temp?' }, kind: 'choice', options: [{ ko: 'a', en: 'a' }, { ko: 'b', en: 'b' }], open: true, order: 1, result: null, createdAt: { $sv: 'ts' }, updatedAt: { $sv: 'ts' } });
    for (let i = 0; i < 3; i++) await dbSet(h, a, `votes/pmeter_${ids[i]}`, { pid: 'pmeter', gid: ids[i], choice: i % 2, updatedAt: { $sv: 'ts' } });
    const tv = await tvPage(h, ctx);
    await tv.mouse.click(300, 1000).catch(() => {});
    await until(tv, () => document.querySelector('#count-n')?.textContent === '10', null, 10000);   // the villagers are in (an emote needs its villager on the screen)
    for (let i = 0; i < 3; i++) await emote(h, a, ids[5 + i]);                        // … and 3 while it runs (village:emote)
    const ok = await until(tv, () => document.querySelector('.f-meter-panel')?.dataset.score === '139', null, 10000);
    const p = await panel(tv);
    h.check('A2 score 139', ok, JSON.stringify(p));
    h.eq('A2 target (E = 50) = 1,690 · temp 41.7 · the number reads "41.7℃"', [p?.target, p?.temp], [1690, '41.7']);
    h.check('A2 the number on screen catches up (0.6 s steps)', await until(tv, () => document.querySelector('.f-meter-value')?.textContent === '41.7℃', null, 3000));
    h.eq('A2 the pure formula agrees', await tv.evaluate(async () => { const m = await import('/js/features/meter/shared.js'); return [m.targetOf({}), m.fmt(m.tempOf(139, 1690).temp), m.fmt(m.tempOf(99999, 1690).temp), m.targetOf({ expected: 2 }), m.targetOf({ target: 500 })]; }), [1690, '41.7', '100.0', 68, 500]);
    h.eq('A2 no milestone at boot', await tv.evaluate(() => window.__mm.length), 0);
    await h.shot(tv, 'meter-1-tv');

    // A8 another tab: a bingo line and a vote → +3 · +2 (collections, not the bus)
    await dbSet(h, a, 'bingo/' + ids[2], { done: ['m0', 'm1', 'm2', 'm3'], lines: 1, updatedAt: { $sv: 'ts' } });
    h.check('A8 a bingo line in another tab → +3 (142)', await until(tv, () => document.querySelector('.f-meter-panel')?.dataset.score === '142'));
    await dbSet(h, a, `votes/pmeter_${ids[3]}`, { pid: 'pmeter', gid: ids[3], choice: 0, updatedAt: { $sv: 'ts' } });
    h.check('A8 a vote in another tab → +2 (144)', await until(tv, () => document.querySelector('.f-meter-panel')?.dataset.score === '144'));

    // A7 admin ⚙️: expected · target → cfg.meter; the open TV follows without reload
    await a.click('#atabs [data-tab="settings"]');
    await a.waitForSelector('.frow');
    const row = a.locator('.frow', { has: a.locator('text=WP-08') });
    await row.locator('.fmore summary').click();
    await a.waitForSelector('.f-meter-exp');
    h.eq('A7 "지금 목표 = 1690점" by default', await a.textContent('.f-meter-now'), '지금 목표 = 1690점');
    await a.fill('.f-meter-exp', '10');
    h.eq('A7 the goal follows the field before saving (E = 10 → 338)', await a.textContent('.f-meter-now'), '지금 목표 = 338점');
    await a.click('.f-meter-save');
    h.check('A7 saved', await until(a, () => /저장했어요/.test(document.querySelector('.f-meter-msg')?.textContent || '')));
    h.check('A7 the open TV takes the new goal without reload (338)', await until(tv, () => document.querySelector('.f-meter-panel')?.dataset.target === '338'));
    await a.fill('.f-meter-tgt', '5000'); await a.click('.f-meter-save');
    h.check('A7 a custom goal (5000) wins over the formula', await until(tv, () => document.querySelector('.f-meter-panel')?.dataset.target === '5000'));
    await h.shot(a, 'meter-2-admin');
    await ctx.close();
  });

  // ---------------------------------------------------------------- A3 milestones · A4 reload
  await h.step('A3 expected = 2 (goal 68): 50 → 70 → 85 → 100 ℃, once each, in order · A4 reload → none again', async () => {
    const ctx = await h.context('tv');
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await setCfg(h, a, ID, { expected: 2 });
    const tv = await tvPage(h, ctx);
    await tv.mouse.click(300, 1000).catch(() => {});
    await tv.waitForTimeout(800);
    await tv.evaluate(() => {                                                          // every banner that reaches the screen → window.__bl (banners queue: a milestone can wait behind arrivals)
      const el = document.querySelector('#arrival'), log = (window.__bl = []); let was = false, last = '';
      new MutationObserver(() => { const on = el.classList.contains('on'), t = el.textContent; if (on && (!was || t !== last)) log.push(t); was = on; last = t; })
        .observe(el, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
    });
    const res = [/🌡 마음 온도 50℃ 돌파!/, /🌡 마음 온도 70℃ 돌파!/, /🌡 마음 온도 85℃ 돌파!/, /🔥 마음 온도 100℃! 사랑이 끓어 넘쳐요/];
    const step = async (n, want) => {
      await addGuests(h, a, n, 'g' + want);
      return until(tv, w => window.__mm.length && window.__mm[window.__mm.length - 1].temp === w, want, 6000);
    };
    h.check('A3 2 guests → 56 ℃ → 50 ℃ milestone', await step(2, 50));
    h.check('A3 4 guests → 70 ℃ milestone', await step(2, 70));
    h.check('A3 6 guests → 85 ℃ milestone', await step(2, 85));
    h.check('A3 7 guests → 100 ℃ "끓어 넘쳐요"', await step(1, 100));
    await until(tv, srcs => srcs.every(src => window.__bl.some(t => new RegExp(src).test(t))), res.map(r => r.source), 40000);
    const seen = await tv.evaluate(srcs => srcs.map(src => window.__bl.filter(t => new RegExp(src).test(t)).length), res.map(r => r.source));
    h.eq('A3 the four banners reach the screen, once each', seen, [1, 1, 1, 1]);
    h.eq('A3 meter:milestone temps in order, once each', await tv.evaluate(() => window.__mm.map(m => m.temp)), [50, 70, 85, 100]);
    h.check('A3 100 % shows 100.0℃', await until(tv, () => document.querySelector('.f-meter-value')?.textContent === '100.0℃', null, 3000));
    await h.shot(tv, 'meter-3-boil');
    // a guest goes away and comes back: no second celebration this session
    await addGuests(h, a, 2, 'more'); await tv.waitForTimeout(1200);
    h.eq('A3 more guests after 100 ℃: nothing new', await tv.evaluate(() => window.__mm.length), 4);
    await tv.reload();
    await until(tv, () => !!document.querySelector('.f-meter-panel[data-target]'), null, 10000);
    await tv.waitForTimeout(3000);
    h.eq('A4 after a reload: no milestone replayed', await tv.evaluate(() => window.__mm.length), 0);
    h.check('A4 …with the prereg attendance gate in place as on the day (its first guest list comes late)', (await featureState(tv, 'prereg'))?.on === true || (await import('../../public/js/features/index.js')).FEATURES.find(f => f.id === 'prereg').status !== 'ready');
    h.check('A4 after a reload: no meter banner', !/마음 온도/.test(await tv.textContent('#arrival').catch(() => '')));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A5 layout
  await h.step('A5 layout: under the QR · moves up when the QR is hidden (Q) · no overlap with the poll panel (rm)', async () => {
    const ctx = await h.context('tv');
    const a = await adminPage(h, ctx, { params: { ff: on(ID, 'poll') } });
    const ids = await addGuests(h, a, 20, '배치');
    await dbSet(h, a, 'polls/plyt', { q: { ko: '배치?', en: 'Layout?' }, kind: 'choice', options: Array.from({ length: 8 }, (_, i) => ({ ko: '보기 ' + (i + 1), en: 'Option ' + (i + 1) })), open: true, order: 1, result: null, createdAt: { $sv: 'ts' }, updatedAt: { $sv: 'ts' } });
    await setLive(h, a, { poll: 'plyt' });
    for (const [i, id] of ids.entries()) await dbSet(h, a, `votes/plyt_${id}`, { pid: 'plyt', gid: id, choice: i % 8, updatedAt: { $sv: 'ts' } });
    const tv = await tvPage(h, ctx, { url: { ff: on(ID, 'poll') } });
    await until(tv, () => !!document.querySelector('.f-poll-panel'), null, 10000);
    await tv.mouse.click(300, 1000).catch(() => {}); await tv.waitForTimeout(800);
    const box = sel => tv.evaluate(s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { t: r.top, b: r.bottom, l: r.left, r: r.right }; }, sel);
    const qr = await box('.hud .qr'), m1 = await box('.f-meter-panel'), poll = await box('.f-poll-panel');
    h.check('A5 the meter sits under the QR', !!qr && !!m1 && m1.t >= qr.b - 1, JSON.stringify({ qr, m1 }));
    h.check('A5 the meter and the poll panel do not overlap', !!poll && (m1.b <= poll.t + 1 || poll.b <= m1.t + 1), JSON.stringify({ m1, poll }));
    let r = await h.layoutReport(tv);
    h.check('A5 TV: no overlaps', !r.overlaps.length, r.overlaps.join(' | '));
    await h.shot(tv, 'meter-4-tv-with-poll');
    await tv.keyboard.press('q'); await tv.waitForTimeout(400);
    const m2 = await box('.f-meter-panel');
    h.check('A5 Q hides the QR → the meter moves up', m2.t < m1.t - 20, JSON.stringify({ m1, m2 }));
    r = await h.layoutReport(tv);
    h.check('A5 no overlaps without the QR either', !r.overlaps.length, r.overlaps.join(' | '));
    await ctx.close();
  });

  // ---------------------------------------------------------------- S3 · S4 · S6 · A6
  await h.step('S3 hot toggle: manifest default → on → panel → off → gone', async () => {
    const ctx = await h.context('tv');
    const tv = await h.page(ctx, { tag: 'hot' });
    await tv.goto(h.url('village.html', { seed: 3, time: 'day' })); await tv.waitForTimeout(1200);
    await expectDefault(h, tv, ID, 'S3 default (no ?ff, no admin flag)');
    const a = await adminPage(h, ctx);
    await setFlag(h, a, ID, true);
    h.check('S3 on: the panel appears', await until(tv, () => !!document.querySelector('.f-meter-panel[data-target]')));
    await setFlag(h, a, ID, false);
    await until(tv, () => !document.querySelector('[data-f="meter"]:not(link)'));
    await tv.waitForTimeout(300);
    await expectClean(h, tv, ID, 'S3 after off');
    await setFlag(h, a, ID, null);
    await ctx.close();
  });

  await h.step('S4 ?phase=pre → not on the TV · admin section loads in any phase · S6 English °C', async () => {
    const ctx = await h.context('tv');
    const tv = await h.page(ctx, { tag: 'pre' });
    await tv.goto(h.url('village.html', { ff: on(ID), phase: 'pre', seed: 3, time: 'day' })); await tv.waitForTimeout(1200);
    await expectClean(h, tv, ID, 'S4 TV in pre');
    const a = await adminPage(h, ctx, { params: { ff: on(ID), phase: 'pre' } });
    await a.click('#atabs [data-tab="settings"]'); await a.waitForSelector('.frow');
    h.check('S4 admin (pre): the ⚙️ section is there', await a.evaluate(() => !!document.querySelector('.fbox[data-f="meter"] .f-meter-exp')));
    const e = await h.page(ctx, { tag: 'en' });
    await e.addInitScript(() => localStorage.setItem('wgb_lang', 'en'));
    await e.goto(h.url('village.html', { ff: on(ID), seed: 2, time: 'day' }));
    await until(e, () => /°C$/.test(document.querySelector('.f-meter-value')?.textContent || ''));
    const p = await panel(e);
    h.check('S6 English: "Love-o-meter" and °C, no Hangul', p?.title === 'Love-o-meter' && /^\d+\.\d°C$/.test(p.value) && !HANGUL.test(p.title + p.value), JSON.stringify(p));
    await ctx.close();
  });

  await h.step(`A6 perf: 50 villagers at night — meter on ≥ 97 % of off (best of two) and ≥ ${MIN_FPS} fps`, async () => {
    const ctx = await h.context('tv');
    const seedPage = await h.page(ctx, { tag: 'seed' });
    await seedPage.goto(h.url('index.html', { ff: off(ID) }));
    const ids = await addGuests(h, seedPage, 50, '성능');
    const measure = async ff => {
      const tv = await h.page(ctx, { tag: 'fps-' + ff, fps: true });
      await tv.goto(h.url('village.html', { ff, time: 'night' }));
      await tv.waitForTimeout(2500);
      for (let i = 0; i < 6; i++) await emote(h, seedPage, ids[i]);                     // the meter is moving while we measure
      await tv.evaluate(() => window.__fps.reset()); await tv.waitForTimeout(4000);
      const m = await tv.evaluate(() => window.__fps.frames / ((performance.now() - window.__fps.since) / 1000));
      await tv.close();
      return m;
    };
    const offs = [], ons = [];
    for (let i = 0; i < 2; i++) { offs.push(await measure(off(ID))); ons.push(await measure(on(ID))); }
    const o = Math.max(...offs), n = Math.max(...ons);
    h.check(`A6 ≥ ${MIN_FPS} fps`, n >= MIN_FPS, `${n.toFixed(1)} fps`);
    h.check('A6 change < 3 % (best of two)', n >= o * 0.97, `off ${offs.map(x => x.toFixed(1)).join('/')} · on ${ons.map(x => x.toFixed(1)).join('/')}`);
    await ctx.close();
  });
};

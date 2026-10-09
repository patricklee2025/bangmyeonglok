// ============================================================
//  WP-07 bgm — docs/v4/wp/WP-07-bgm.md · 04-testing §4.1 (S1–S9) + A1–A9
//  8-bit music + effects on the TV only: songs by phase / night / program cue, quiet mode stops it, the U key, admin ⚙️, MML parser.
//  Headless Chromium runs with --autoplay-policy=no-user-gesture-required and --mute-audio: the AudioContext clock still runs.
// ============================================================
import { addGuests } from '../lib/flows.mjs';
import { on, off, adminPage, setFlag, setCfg, setLive, expectClean, footprint, dbGet } from '../lib/v4.mjs';

const ID = 'bgm';
export const meta = { title: 'bgm: 8-bit music by phase / night / cue, quiet mode, effects with limits, U key, admin ⚙️ + preview, MML parser, perf', timeout: 480000, tags: ['slow'] };

const HANGUL = /[ㄱ-힝]/;
const MIN_FPS = +(process.env.PERF_MIN_FPS || 24);
const until = async (page, fn, arg, ms = 8000) => { const t0 = Date.now(); do { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(100); } while (Date.now() - t0 < ms); return false; };
const RECORD = `(() => { window.__bs = []; window.__arr = []; import('/js/core/bus.js').then(b => { b.on('bgm:state', p => window.__bs.push({ ...p, at: performance.now() }), { replay: true }); b.on('village:arrived', () => window.__arr.push(performance.now())); }); })();`;
const stats = page => page.evaluate(async () => { const s = (await import('/js/features/bgm/synth.js')).stats; return { nodes: s.nodes, sfx: { ...(s.sfx || {}) } }; });
const lastState = page => page.evaluate(() => window.__bs[window.__bs.length - 1] || null);
const playing = (page, track, ms = 6000) => until(page, t => { const s = window.__bs[window.__bs.length - 1]; return !!s && s.playing === true && (!t || s.track === t); }, track, ms);
const stopped = (page, ms = 1000) => until(page, () => { const s = window.__bs[window.__bs.length - 1]; return !!s && s.playing === false; }, null, ms);
const emit = (page, type, p) => page.evaluate(([t, x]) => import('/js/core/bus.js').then(b => b.emit(t, x)), [type, p]);
const tracksPlayed = page => page.evaluate(() => window.__bs.filter(s => s.playing).map(s => s.track).filter((t, i, a) => t !== a[i - 1]));
const unlock = async tv => { await tv.mouse.click(40, 700).catch(() => {}); await tv.waitForTimeout(300); };

async function tvPage(h, ctx, params = {}) {
  const tv = await h.page(ctx, { tag: params.tag || 'tv', ...(params.fps ? { fps: true } : {}) });
  await tv.addInitScript(RECORD);
  await tv.goto(h.url('village.html', { ff: on(ID), time: 'day', ...params.url }));
  await until(tv, () => window.__bs && window.__bs.length > 0, null, 10000);
  return tv;
}
async function settingsBox(h, a) {
  await a.click('#atabs [data-tab="settings"]');
  await a.waitForSelector('.frow');
  const row = a.locator('.frow', { has: a.locator('text=WP-07') });
  await row.locator('.fmore summary').click();
  await a.waitForSelector('.f-bgm-music');
}

export default async (h) => {
  // ---------------------------------------------------------------- S1 off · A8 phones
  await h.step('S1 off: no trace on the TV and admin · A8 a phone village returns at once (0 nodes) · S4 not on the guest page', async () => {
    const ctx = await h.context('tv');
    const tv = await h.page(ctx, { tag: 'off' });
    await tv.goto(h.url('village.html', { ff: off(ID), seed: 4, time: 'day' })); await tv.waitForTimeout(1200);
    await expectClean(h, tv, ID, 'S1 TV');
    await tv.mouse.click(40, 700); await tv.waitForTimeout(400);
    h.check('S1 TV off: the village still runs (villagers drawn)', await tv.evaluate(() => !!document.querySelector('canvas')));
    const a = await adminPage(h, ctx, { params: { ff: off(ID) } });
    await expectClean(h, a, ID, 'S1 admin');
    await ctx.close();
    const pc = await h.context('phone');
    const p = await h.page(pc, { tag: 'phone' });
    await p.addInitScript(RECORD);
    await setCfg(h, await adminPage(h, pc, { params: { ff: on(ID) } }), ID, { music: true, sfx: true });
    await p.goto(h.url('village.html', { ff: on(ID), seed: 4 })); await p.waitForTimeout(1500);
    await p.mouse.click(60, 300).catch(() => {}); await p.waitForTimeout(800);
    const f = await footprint(p, ID);
    h.check('A8 phone village (music + effects on): no DOM, no class', f.nodes === 0 && f.styles === 0, JSON.stringify(f));
    h.eq('A8 phone: no AudioNode, no bgm:state', [(await stats(p)).nodes, await p.evaluate(() => window.__bs.length)], [0, 0]);
    const g = await h.page(pc, { tag: 'guest' });
    await g.goto(h.url('index.html', { ff: on(ID) })); await g.waitForTimeout(800);
    await expectClean(h, g, ID, 'S4 guest page (not in the manifest pages)');
    await pc.close();
  });

  // ---------------------------------------------------------------- A2 default = silent
  await h.step('A2 on with the default settings (music off): 0 AudioNodes, no unlock banner', async () => {
    const ctx = await h.context('tv');
    const tv = await tvPage(h, ctx);
    await unlock(tv); await tv.waitForTimeout(1500);
    h.eq('A2 nodes made by the feature', (await stats(tv)).nodes, 0);
    h.eq('A2 bgm:state = { track: null, playing: false, volume: 0.35 }', await lastState(tv).then(s => s && [s.track, s.playing, s.volume]), [null, false, 0.35]);
    h.check('A2 no unlock banner', !/음악을 켜려면/.test(await tv.textContent('#arrival').catch(() => '')));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A3 phase · night · unlock
  await h.step('A3 music on: unlock banner → click → playing · pre = morning · live = festival · night = lanterns · after = morning', async () => {
    const ctx = await h.context('tv');
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await setCfg(h, a, ID, { music: true });
    const pre = await h.page(ctx, { tag: 'pre' });
    await pre.addInitScript(RECORD);
    await pre.goto(h.url('village.html', { ff: on(ID), phase: 'pre', time: 'day' }));
    h.check('A3 before any click: the unlock banner', !!(await h.waitBanner(pre, /🎵 음악을 켜려면 화면을 한 번 클릭해주세요/, 8000)));
    await until(pre, () => window.__bs.length > 0);
    h.eq('A3 before the click: track morning, not playing', await lastState(pre).then(s => s && [s.track, s.playing]), ['morning', false]);
    h.eq('A3 nothing built before the click', (await stats(pre)).nodes, 0);
    await unlock(pre);
    h.check('A3 pre → "morning" playing after one click', await playing(pre, 'morning'));
    h.check('A3 nodes exist now', (await stats(pre)).nodes > 0);
    await h.shot(pre, 'bgm-1-pre');
    await pre.close();
    const live = await tvPage(h, ctx, { tag: 'live' });
    await unlock(live);
    h.check('A3 live (day) → "festival"', await playing(live, 'festival'));
    await live.close();
    const night = await tvPage(h, ctx, { tag: 'night', url: { time: 'night' } });
    await unlock(night);
    h.check('A3 live at night → "lanterns"', await playing(night, 'lanterns'));
    await night.keyboard.press('n');                                                     // the core's day/night key — followed within the 2 s poll
    h.check('A3 N (day) → back to "festival"', await playing(night, 'festival', 5000));
    await night.close();
    const after = await tvPage(h, ctx, { tag: 'after', url: { phase: 'after' } });
    await unlock(after);
    h.check('A3 after → "morning"', await playing(after, 'morning'));
    await after.close();
    await ctx.close();
  });

  // ---------------------------------------------------------------- A4 cues
  await h.step('A4 live:cue bride → bridal once → festival · march once · dinner → canon (loops) · next cue → festival · replay rules', async () => {
    const ctx = await h.context('tv');
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await setCfg(h, a, ID, { music: true, testSpeed: 8 });
    const tv = await tvPage(h, ctx);
    await unlock(tv);
    h.check('A4 festival first', await playing(tv, 'festival'));
    await emit(tv, 'live:cue', { cue: 'bride', seq: 1, fresh: true });
    h.check('A4 bride → "bridal"', await playing(tv, 'bridal', 3000));
    h.check('A4 bridal plays once (8 bars at ×8 ≈ 3 s) → back to "festival"', await playing(tv, 'festival', 9000));
    await emit(tv, 'live:cue', { cue: 'march', seq: 2, fresh: true });
    h.check('A4 march → "march"', await playing(tv, 'march', 3000));
    h.check('A4 march once → "festival"', await playing(tv, 'festival', 9000));
    await emit(tv, 'live:cue', { cue: 'dinner', seq: 3, fresh: true });
    h.check('A4 dinner → "canon"', await playing(tv, 'canon', 3000));
    await tv.waitForTimeout(4500);                                                       // longer than one pass of the canon at ×8 (32 beats ≈ 3.3 s)
    h.eq('A4 canon loops while the cue lasts', await lastState(tv).then(s => s && [s.track, s.playing]), ['canon', true]);
    await emit(tv, 'live:cue', { cue: 'toast', seq: 4, fresh: true });
    h.check('A4 another cue (toast) → "festival"', await playing(tv, 'festival', 3000));
    await emit(tv, 'live:cue', { cue: 'firstdance', seq: 5, fresh: true });
    h.check('A4 firstdance → "danube"', await playing(tv, 'danube', 3000));
    h.eq('A4 the order of songs', await tracksPlayed(tv), ['festival', 'bridal', 'festival', 'march', 'festival', 'canon', 'festival', 'danube']);
    await tv.close();

    // replay: a TV that loads (or turns the feature on) after the cue — loops come back, one-shots are not replayed
    const r = await h.page(ctx, { tag: 'replay' });
    await r.addInitScript(RECORD);
    await r.goto(h.url('village.html', { time: 'day' })); await r.waitForTimeout(1200);   // no ?ff: the admin flag decides (beta → off)
    await unlock(r);
    h.eq('A4 replay: the feature is still off here', await r.evaluate(() => window.__bs.length), 0);
    await emit(r, 'live:cue', { cue: 'bride', seq: 9, fresh: false });                // a cue from before the feature started
    await setFlag(h, a, ID, true);                                                       // hot on → setup → the sticky cue is replayed
    await until(r, () => window.__bs.length > 0, null, 10000);
    h.check('A4 replayed one-shot (fresh false) → "festival", not bridal', await playing(r, 'festival'));
    await emit(r, 'live:cue', { cue: 'dinner', seq: 10, fresh: false });
    h.check('A4 a loop cue that is not fresh still switches → "canon"', await playing(r, 'canon', 3000));
    await setFlag(h, a, ID, null);
    await ctx.close();
  });

  // ---------------------------------------------------------------- A5 quiet
  await h.step('A5 quiet mode → stops within 1 s · released → plays again · an interrupted one-shot is not resumed', async () => {
    const ctx = await h.context('tv');
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await setCfg(h, a, ID, { music: true, testSpeed: 2 });
    const tv = await tvPage(h, ctx);
    await unlock(tv);
    h.check('A5 playing first', await playing(tv, 'festival'));
    await setLive(h, a, { quiet: true });
    h.check('A5 quiet → playing false within 1 s', await stopped(tv, 1000));
    await setLive(h, a, { quiet: false });
    h.check('A5 released → festival again', await playing(tv, 'festival', 3000));
    await emit(tv, 'live:cue', { cue: 'bride', seq: 1, fresh: true });
    h.check('A5 bride → bridal', await playing(tv, 'bridal', 3000));
    await setLive(h, a, { quiet: true });
    h.check('A5 quiet in the middle of bridal → stops', await stopped(tv, 1000));
    await setLive(h, a, { quiet: false });
    h.check('A5 released → festival (bridal is not started again)', await playing(tv, 'festival', 3000));
    // a pinned song wins over the cue and the phase, but quiet still wins over the pin
    await setCfg(h, a, ID, { pin: 'canon' });
    h.check('A5 pin "canon" → canon now', await playing(tv, 'canon', 3000));
    await setLive(h, a, { quiet: true });
    h.check('A5 quiet beats the pin', await stopped(tv, 1000));
    await setLive(h, a, { quiet: false });
    await setCfg(h, a, ID, { pin: null });
    h.check('A5 pin cleared → festival', await playing(tv, 'festival', 3000));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A6 effects
  await h.step('A6 effects: 5 arrivals at once → 1 jingle (2 s limit) · emotes 0.5 s limit · nothing in quiet mode · nothing with sfx off', async () => {
    const ctx = await h.context('tv');
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await setCfg(h, a, ID, { sfx: true });
    const tv = await tvPage(h, ctx);
    await unlock(tv); await tv.waitForTimeout(500);
    const before = (await stats(tv)).sfx.jingle || 0;
    const ids = await addGuests(h, a, 5, '징글');
    await until(tv, () => window.__arr.length >= 5, null, 8000);
    await tv.waitForTimeout(600);
    const arr = await tv.evaluate(() => window.__arr.slice());
    const after = (await stats(tv)).sfx.jingle || 0;
    h.check('A6 5 arrivals inside 2 s', arr.length === 5 && arr[4] - arr[0] < 2000, JSON.stringify(arr.map(t => Math.round(t - arr[0]))));
    h.eq('A6 one jingle', after - before, 1);
    h.eq('A6 music stays off (effects only)', await lastState(tv).then(s => s && s.playing), false);
    const b0 = (await stats(tv)).sfx.blip || 0;
    for (const id of ids.slice(0, 4)) await h.store(a, (s, x) => s.sendEmote(x, 'heart'), id);
    await tv.waitForTimeout(1500);
    const blips = ((await stats(tv)).sfx.blip || 0) - b0;
    h.check('A6 4 quick emotes → at most 3 blips (0.5 s limit) and at least 1', blips >= 1 && blips <= 3, String(blips));
    await setLive(h, a, { quiet: true }); await tv.waitForTimeout(400);
    const q0 = (await stats(tv)).sfx.jingle || 0;
    await tv.waitForTimeout(2100);
    await addGuests(h, a, 1, '조용');
    await until(tv, () => window.__arr.length >= 6, null, 8000); await tv.waitForTimeout(400);
    h.eq('A6 quiet mode: no jingle', ((await stats(tv)).sfx.jingle || 0) - q0, 0);
    await setLive(h, a, { quiet: false });
    await until(tv, () => !document.body.classList.contains('quiet'), null, 5000);       // the TV has left quiet mode before the next effects
    await tv.waitForTimeout(200);
    await emit(tv, 'poll:result', { pid: 'p', top: [0] });
    await emit(tv, 'meter:milestone', { temp: 50, pct: 0.2 });
    await emit(tv, 'bingo:line', { gid: ids[0], lines: 1, all: false });
    await emit(tv, 'village:event', { type: 'bouquet', key: 'bouquet', id: 1, stage: 'start' });
    await tv.waitForTimeout(300);
    const s = (await stats(tv)).sfx;
    h.eq('A6 poll · meter · bingo · bouquet → drum+chord · chord · fanfare · roll', [s.drumchord, s.chord, s.fanfare, s.roll], [1, 1, 1, 1]);
    await setCfg(h, a, ID, { sfx: false }); await tv.waitForTimeout(500);
    await emit(tv, 'bingo:line', { gid: ids[1], lines: 1, all: false }); await tv.waitForTimeout(200);
    h.eq('A6 sfx off → no fanfare', (await stats(tv)).sfx.fanfare, 1);
    await ctx.close();
  });

  // ---------------------------------------------------------------- A7 parser
  await h.step('A7 MML parser: lengths · dots · triplets · bad tokens skipped · every song: 4 channels of the same length, whole bars', async () => {
    const ctx = await h.context('tv');
    const p = await h.page(ctx, { tag: 'unit' });
    await p.goto(h.url('village.html', { ff: off(ID), time: 'day' }));
    const r = await p.evaluate(async () => {
      const m = await import('/js/features/bgm/mml.js');
      const { SONGS } = await import('/js/features/bgm/songs.js');
      const I = (await import('/js/features/bgm/i18n.js')).default;
      const ev = m.parse('o4 l8 c d4. e16 r x l12 c c c | > c < c');
      const bad = m.parse('o4 c4 ? z@ d4 ~~ e4 o99 f4');
      const songs = SONGS.map(s => {
        const ch = ['p1', 'p2', 'tri', 'noise'].map(c => {
          const src = s[c]; let i = -1, n = 0, ok = true;
          while ((i = src.indexOf('|', i + 1)) >= 0) { n++; if (Math.abs(m.beats(m.parse(src.slice(0, i))) - n * s.bar) > 1e-9) ok = false; }
          return { beats: +m.beats(m.parse(src)).toFixed(6), bars: ok };
        });
        return { id: s.id, same: ch.every(c => c.beats === ch[0].beats), whole: ch[0].beats % s.bar === 0, bars: ch.every(c => c.bars), beats: ch[0].beats, title: s.title.ko === I.ko['bgm_t_' + s.id] && s.title.en === I.en['bgm_t_' + s.id] };
      });
      return { ev: ev.map(e => [e.t, e.dur, e.midi, e.hit]), bad: bad.map(e => e.midi), badBeats: m.beats(bad), hz: [m.hz(69), Math.round(m.hz(60) * 100) / 100], songs };
    });
    h.eq('A7 events: c8 d4. e16 r8 x8 (C4=60) · l12 triplet · > and <', r.ev.slice(0, 5), [[0, 0.5, 60, false], [0.5, 1.5, 62, false], [2, 0.25, 64, false], [2.25, 0.5, null, false], [2.75, 0.5, null, true]]);
    h.check('A7 triplets: three l12 notes = 1 beat', Math.abs(r.ev[7][0] + r.ev[7][1] - 4.25) < 1e-9 && r.ev[8][2] === 72 && r.ev[9][2] === 60, JSON.stringify(r.ev.slice(5)));
    h.eq('A7 bad tokens skipped, playing goes on (o99 ignored)', [r.bad, r.badBeats], [[60, 62, 64, 65], 4]);
    h.eq('A7 hz: A4 = 440 · C4 = 261.63', r.hz, [440, 261.63]);
    h.eq('A7 the 7 songs', r.songs.map(s => s.id), ['morning', 'bridal', 'march', 'danube', 'canon', 'festival', 'lanterns']);
    for (const s of r.songs) h.check(`A7 ${s.id}: 4 channels ${s.beats} beats each, whole bars at every "|", title = i18n`, s.same && s.whole && s.bars && s.title, JSON.stringify(s));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A8 U key
  await h.step('A8 U toggles music on this TV only (setting stays off) · reload → back to the setting', async () => {
    const ctx = await h.context('tv');
    const tv = await tvPage(h, ctx);
    await unlock(tv);
    h.eq('A8 off by setting', await lastState(tv).then(s => s && s.playing), false);
    await tv.keyboard.press('u');
    h.check('A8 U → playing festival', await playing(tv, 'festival'));
    await tv.keyboard.press('u');
    h.check('A8 U again → stopped', await stopped(tv, 1500));
    await tv.keyboard.press('u');
    h.check('A8 U a third time → playing', await playing(tv, 'festival'));
    await tv.reload();
    await until(tv, () => window.__bs && window.__bs.length > 0, null, 10000);
    await unlock(tv); await tv.waitForTimeout(800);
    h.eq('A8 after a reload: the setting (off) again', await lastState(tv).then(s => s && s.playing), false);
    await ctx.close();
  });

  // ---------------------------------------------------------------- admin ⚙️ (S2 · S7 · preview · S6 · S8)
  await h.step('S2/S7 admin ⚙️: music · effects · volume · pin → cfg.bgm only → an open TV follows · ▶ preview 10 s · layout', async () => {
    const ctx = await h.context('tv');
    const tv = await tvPage(h, ctx);
    await unlock(tv);
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await settingsBox(h, a);
    h.eq('S2 defaults: music off · effects off · 35 % · auto', [await a.isChecked('.f-bgm-music'), await a.isChecked('.f-bgm-sfx'), await a.textContent('.f-bgm-volout'), await a.inputValue('.f-bgm-pin')], [false, false, '35%', '']);
    h.check('S2 the note about the venue sound', /리허설에서 음량을 꼭 확인하세요/.test(await a.textContent('.f-bgm-note')));
    await a.check('.f-bgm-music');
    h.check('S7 saved', await until(a, () => /저장했어요/.test(document.querySelector('.f-bgm-msg')?.textContent || '')));
    h.check('S2 the open TV starts without reload', await playing(tv, 'festival'));
    await a.locator('.f-bgm-vol').fill('0.6');
    h.check('S2 volume 60 % reaches the TV (bgm:state.volume)', await until(tv, () => window.__bs[window.__bs.length - 1]?.volume === 0.6));
    await a.selectOption('.f-bgm-pin', 'danube');
    h.check('S2 pin danube → the TV switches', await playing(tv, 'danube'));
    const st = await dbGet(h, a, 'app/settings');
    h.eq('S7 cfg.bgm only (music · sfx · volume · pin)', st?.cfg?.bgm && Object.keys(st.cfg.bgm).sort(), ['music', 'pin', 'sfx', 'volume']);
    h.eq('S7 values', [st.cfg.bgm.music, st.cfg.bgm.sfx, st.cfg.bgm.volume, st.cfg.bgm.pin], [true, false, 0.6, 'danube']);
    // ▶ preview on the admin computer
    const n0 = (await stats(a)).nodes;
    await a.click('.f-bgm-preview');
    h.eq('S2 preview: the button becomes "■ 정지"', await a.textContent('.f-bgm-preview'), '■ 정지');
    h.check('S2 preview builds nodes on the admin page', (await stats(a)).nodes > n0);
    await a.click('.f-bgm-preview');
    h.eq('S2 ■ → back to "▶ 미리 듣기"', await a.textContent('.f-bgm-preview'), '▶ 미리 듣기');
    await a.click('.f-bgm-preview');
    h.check('S2 preview stops by itself after 10 s', await until(a, () => document.querySelector('.f-bgm-preview')?.dataset.on === '0', null, 12500));
    let r = await h.layoutReport(a);
    h.check('S8 admin ⚙️ (desktop): no overlaps', !r.overlaps.length, r.overlaps.join(' | '));
    await h.shot(a, 'bgm-2-admin');
    await a.selectOption('.f-bgm-pin', ''); await a.uncheck('.f-bgm-music');
    h.check('S2 music off from the admin → the TV stops', await stopped(tv, 2000));
    await ctx.close();
    const pc = await h.context('phoneSE');
    const ap = await adminPage(h, pc, { params: { ff: on(ID) } });
    await settingsBox(h, ap);
    r = await h.layoutReport(ap);
    h.check('S8 admin ⚙️ on a small phone: no overlaps, touch sizes OK', !r.overlaps.length && !(r.small || []).length, JSON.stringify({ o: r.overlaps, s: r.small }));
    await h.shot(ap, 'bgm-3-admin-phone');
    await pc.close();
  });

  await h.step('S3 hot toggle: off (default) → on → music → off → gone (no new nodes) → on again', async () => {
    const ctx = await h.context('tv');
    const a = await adminPage(h, ctx);
    await setCfg(h, a, ID, { music: true });
    const tv = await h.page(ctx, { tag: 'hot' });
    await tv.addInitScript(RECORD);
    await tv.goto(h.url('village.html', { seed: 3, time: 'day' })); await tv.waitForTimeout(1200);
    await unlock(tv);
    await expectClean(h, tv, ID, 'S3 beta default: off');
    await setFlag(h, a, ID, true);
    h.check('S3 on → music without reload', await playing(tv, 'festival'));
    await setFlag(h, a, ID, false);
    await tv.waitForTimeout(800);
    await expectClean(h, tv, ID, 'S3 after off');
    const n1 = (await stats(tv)).nodes; await tv.waitForTimeout(1000);
    h.eq('S3 after off: no new nodes (scheduler gone)', (await stats(tv)).nodes, n1);
    const k0 = await tv.evaluate(() => window.__bs.length);
    await tv.keyboard.press('u'); await tv.waitForTimeout(300);
    h.eq('S3 after off: the U key does nothing', await tv.evaluate(() => window.__bs.length), k0);
    await setFlag(h, a, ID, true);
    h.check('S3 on again → playing again', await playing(tv, 'festival'));
    await setFlag(h, a, ID, null);
    await ctx.close();
  });

  await h.step('S4 admin loads in any phase · S6 English (admin ⚙️ and the TV banner)', async () => {
    const ctx = await h.context('tv');
    const a = await adminPage(h, ctx, { params: { ff: on(ID), phase: 'anniversary' } });
    await settingsBox(h, a);
    h.check('S4 admin (anniversary): the ⚙️ section is there', await a.evaluate(() => !!document.querySelector('.fbox[data-f="bgm"] .f-bgm-pin')));
    await setCfg(h, a, ID, { music: true });
    const e = await h.page(ctx, { tag: 'en' });
    await e.addInitScript(() => localStorage.setItem('wgb_lang', 'en'));
    await e.goto(h.url('village.html', { ff: on(ID), time: 'day' }));
    h.check('S6 TV: English unlock banner', !!(await h.waitBanner(e, /🎵 Click the screen once to start the music/, 8000)));
    const ae = await h.page(ctx, { tag: 'admin-en' });
    await ae.addInitScript(() => localStorage.setItem('wgb_lang', 'en'));
    await ae.goto(h.url('admin.html', { ff: on(ID) }));
    await ae.waitForSelector('#main:not([hidden])', { timeout: 15000 }).catch(() => {});
    if (await ae.$('#atabs [data-tab="settings"]')) {
      await settingsBox(h, ae);
      const txt = await ae.evaluate(() => document.querySelector('.fbox[data-f="bgm"]')?.innerText || '');
      h.check('S6 admin ⚙️ in English: no Hangul', !!txt && !HANGUL.test(txt) && /Background music/.test(txt) && /Pin a song/.test(txt), txt.slice(0, 200));
    } else h.check('S6 admin opened in English', false, 'no settings tab');
    await ctx.close();
  });

  await h.step(`A9 perf: 50 villagers at night — music playing ≥ 95 % of feature off (best of two) and ≥ ${MIN_FPS} fps`, async () => {
    const ctx = await h.context('tv');
    const seedPage = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await addGuests(h, seedPage, 50, '성능');
    await setCfg(h, seedPage, ID, { music: true, sfx: true });
    const measure = async ff => {
      const tv = await h.page(ctx, { tag: 'fps-' + ff, fps: true });
      await tv.addInitScript(RECORD);
      await tv.goto(h.url('village.html', { ff, time: 'night' }));
      await tv.waitForTimeout(1500); await unlock(tv); await tv.waitForTimeout(1500);
      const st = await lastState(tv);
      await tv.evaluate(() => window.__fps.reset()); await tv.waitForTimeout(4000);
      const m = await tv.evaluate(() => window.__fps.frames / ((performance.now() - window.__fps.since) / 1000));
      await tv.close();
      return { fps: m, playing: st?.playing === true };
    };
    const offs = [], ons = [];
    for (let i = 0; i < 2; i++) { offs.push((await measure(off(ID))).fps); const r = await measure(on(ID)); ons.push(r.fps); h.check(`A9 run ${i + 1}: music was playing`, r.playing); }
    const o = Math.max(...offs), n = Math.max(...ons);
    h.check(`A9 ≥ ${MIN_FPS} fps`, n >= MIN_FPS, `${n.toFixed(1)} fps`);
    h.check('A9 drop < 5 % (best of two)', n >= o * 0.95, `off ${offs.map(x => x.toFixed(1)).join('/')} · on ${ons.map(x => x.toFixed(1)).join('/')}`);
    await ctx.close();
  });
};
